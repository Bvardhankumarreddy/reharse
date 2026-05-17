import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIClientService } from './openai-client.service';
import { NewsItem } from '../entities/news-item.entity';
import { ShortScript } from '../entities/short-script.entity';
import {
  DistributionPackage,
  DistributionLlmResponse,
  SourceReference,
} from '../dto/distribution-package.dto';
import { SOCIAL_URLS } from '../config/social-urls.config';

const DISTRIBUTION_SYSTEM_PROMPT = `
You generate distribution posts for AetherStackAI's "AI Quick Bytes" series.
Host: Vardhan. Each post promotes ONE Short and drives traffic to the channel.

BRAND: Channel "AetherStackAI", series "AI Quick Bytes" (daily AI insights),
host Vardhan, tagline "The AI that teaches AI".

URL PLACEHOLDERS — use these EXACT tokens, never real URLs:
{{YOUTUBE_URL}} {{INSTAGRAM_URL}} {{LINKEDIN_URL}} {{WHATSAPP_CHANNEL}}
{{REHEARSE_URL}} {{SOURCE_URL}} {{SOURCE_NAME}}

PLATFORM RULES:
- YouTube: title ≤60 chars ending "#Shorts"; description = hook + what it
  covers + "Read more: {{SOURCE_NAME}} -> {{SOURCE_URL}}" + follow links
  (YouTube/Instagram/LinkedIn/WhatsApp) + 5-8 hashtags; tags = 10-15 SEO
  strings (no #).
- Instagram: bold hook, 2-3 punchy lines, CTA/question, "Source:
  {{SOURCE_NAME}}", subscribe line with {{YOUTUBE_URL}}; 12-15 hashtags;
  full_text = caption + blank line + hashtags joined by spaces.
- LinkedIn: 100-200 words, professional, max 2-3 emojis, insight + why it
  matters + question + "Follow Vardhan for daily AI insights" + "Source:
  {{SOURCE_NAME}} - {{SOURCE_URL}}" + "Subscribe: {{YOUTUBE_URL}}";
  4-6 professional hashtags; full_text = body + blank line + hashtags.
- WhatsApp channel: 60-100 words, WhatsApp formatting (*bold*), emoji
  opener, source line, "Watch: {{YOUTUBE_URL}}", signature "— Vardhan".
- WhatsApp status: ≤50 words, 1 emoji, 1-line hook, "Watch -> {{YOUTUBE_URL}}".

QUALITY: match the Short's energy, each platform must read natively (no
copy-paste sameness), always credit the source, Indian-English friendly,
curiosity not clickbait.

Respond with STRICT JSON ONLY:
{
  "youtube": { "title": "...", "description": "...", "tags": ["...", "..."] },
  "instagram": { "caption": "...", "hashtags": ["#..."], "full_text": "..." },
  "linkedin": { "body": "...", "hashtags": ["#..."], "full_text": "..." },
  "whatsapp_channel": { "full_text": "..." },
  "whatsapp_status": { "full_text": "..." }
}
`.trim();

@Injectable()
export class DistributionPackageService {
  private readonly logger = new Logger(DistributionPackageService.name);

  constructor(
    private readonly openai: OpenAIClientService,
    private readonly config: ConfigService,
  ) {}

  async generatePackage(
    script: ShortScript,
    newsItem: NewsItem,
  ): Promise<{ package: DistributionPackage; cost_usd: number }> {
    const model = this.config.get<string>('aiQuickBytes.openai.scriptModel') ?? 'gpt-4o';

    const completion = await this.openai.getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: DISTRIBUTION_SYSTEM_PROMPT },
        { role: 'user', content: this.buildUserPrompt(script, newsItem) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as DistributionLlmResponse;
    const cost = this.calcCost(model, completion.usage);

    const sourceReference: SourceReference = {
      title: newsItem.title,
      url: newsItem.url,
      source_name: newsItem.source?.name ?? 'Unknown',
    };

    const distributionPackage: DistributionPackage = {
      youtube: this.inject(parsed.youtube, sourceReference),
      instagram: this.inject(parsed.instagram, sourceReference),
      linkedin: this.inject(parsed.linkedin, sourceReference),
      whatsapp_channel: this.inject(parsed.whatsapp_channel, sourceReference),
      whatsapp_status: this.inject(parsed.whatsapp_status, sourceReference),
      source_reference: sourceReference,
      generated_at: new Date().toISOString(),
    };

    this.logger.log(
      `Distribution package for script ${script.id} (cost $${cost.toFixed(4)})`,
    );
    return { package: distributionPackage, cost_usd: cost };
  }

  /** Replace {{TOKENS}} with hardcoded URLs / source values. */
  private replace(str: string, source: SourceReference): string {
    return str
      .replace(/\{\{YOUTUBE_URL\}\}/g, SOCIAL_URLS.youtube)
      .replace(/\{\{INSTAGRAM_URL\}\}/g, SOCIAL_URLS.instagram)
      .replace(/\{\{LINKEDIN_URL\}\}/g, SOCIAL_URLS.linkedin)
      .replace(/\{\{WHATSAPP_CHANNEL\}\}/g, SOCIAL_URLS.whatsapp_channel)
      .replace(/\{\{REHEARSE_URL\}\}/g, SOCIAL_URLS.rehearse_platform)
      .replace(/\{\{SOURCE_URL\}\}/g, source.url)
      .replace(/\{\{SOURCE_NAME\}\}/g, source.source_name);
  }

  /** Deep-walk a value, replacing {{TOKENS}} in every string, preserving shape. */
  private inject<T>(value: T, source: SourceReference): T {
    if (typeof value === 'string') {
      return this.replace(value, source) as unknown as T;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.inject(v, source)) as unknown as T;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.inject(v, source);
      }
      return out as unknown as T;
    }
    return value;
  }

  private buildUserPrompt(script: ShortScript, item: NewsItem): string {
    return `GENERATE DISTRIBUTION PACKAGE FOR THIS SHORT

SCRIPT
Day: ${script.dayNumber ?? 'n/a'} | Avatar: ${script.avatarId ?? 'vardhan'} | Duration: ${script.durationEstimateSeconds ?? '?'}s
Hook: ${script.hook}
Full script: ${script.fullScript}

SOURCE NEWS
Title: ${item.title}
Source: ${item.source?.name ?? 'Unknown'}
URL: ${item.url}
Summary: ${item.summary?.slice(0, 500) ?? 'N/A'}

Use the {{PLACEHOLDER}} tokens (do not write real URLs). Output strict JSON
exactly as specified in the system prompt.`;
  }

  private calcCost(
    model: string,
    usage?: { prompt_tokens?: number; completion_tokens?: number },
  ): number {
    const inTok = usage?.prompt_tokens ?? 0;
    const outTok = usage?.completion_tokens ?? 0;
    const rates: Record<string, [number, number]> = {
      'gpt-4o': [2.5, 10],
      'gpt-4o-mini': [0.15, 0.6],
    };
    const [inRate, outRate] = rates[model] ?? rates['gpt-4o'];
    return (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate;
  }
}
