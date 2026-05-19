import { Injectable, Logger } from '@nestjs/common';
import { Episode } from '../entities/episode.entity';
import { Topic } from '../entities/topic.entity';
import { AnthropicClientService } from './anthropic-client.service';

const SOCIAL_URLS = {
  youtube: 'youtube.com/@aetherstackai',
  instagram: 'instagram.com/aetherstackai',
  linkedin: 'linkedin.com/company/115524370',
  whatsapp_channel: 'whatsapp.com/channel/0029Vb7dRgq1dAwCydDr651d',
};

const DISTRIBUTION_SYSTEM_PROMPT = `
You generate distribution posts for an AetherStackAI "The AI Squad" episode —
a 7-10 min YouTube video where 4 robot characters (BYTE/KIRA/ATLAS/LUNA)
discuss an AI topic dramatically. Each post promotes the episode and drives
traffic to the channel.

URL PLACEHOLDERS — use these EXACT tokens, never real URLs:
{{YOUTUBE_URL}} {{INSTAGRAM_URL}} {{LINKEDIN_URL}} {{WHATSAPP_CHANNEL}}

PLATFORM RULES:
- YouTube: title <=70 chars; description = hook + what the squad debates +
  the dramatic angle + follow links (YouTube/Instagram/LinkedIn/WhatsApp) +
  5-8 hashtags; tags = 10-15 SEO strings (no #).
- Instagram: bold hook naming a character moment, 2-3 punchy lines, CTA/
  question, subscribe line w/ {{YOUTUBE_URL}}; 12-15 hashtags;
  full_text = caption + blank line + hashtags.
- LinkedIn: 120-220 words, professional angle on the topic, the debate's
  insight, a question, "Watch the full debate: {{YOUTUBE_URL}}";
  4-6 hashtags; full_text = body + blank line + hashtags.
- WhatsApp channel: 60-100 words, *bold*, emoji opener, "Watch:
  {{YOUTUBE_URL}}", signature "— Vardhan".
- WhatsApp status: <=50 words, 1 emoji, 1-line hook, "Watch -> {{YOUTUBE_URL}}".

Each platform must read natively (no copy-paste sameness). Curiosity not clickbait.

Respond with STRICT JSON ONLY:
{"youtube":{"title":"...","description":"...","tags":["..."]},"instagram":{"caption":"...","hashtags":["#..."],"full_text":"..."},"linkedin":{"body":"...","hashtags":["#..."],"full_text":"..."},"whatsapp_channel":{"full_text":"..."},"whatsapp_status":{"full_text":"..."}}
`.trim();

@Injectable()
export class DistributionService {
  private readonly logger = new Logger(DistributionService.name);

  constructor(private readonly claude: AnthropicClientService) {}

  async generateForEpisode(
    episode: Episode,
    topic: Topic,
  ): Promise<{ package: Record<string, unknown>; cost_usd: number }> {
    const { content, usage, model } = await this.claude.completeJSON({
      system: DISTRIBUTION_SYSTEM_PROMPT,
      user:
        `EPISODE: ${episode.title}\nTOPIC: ${topic.title}\n` +
        `ANGLE: ${topic.angle ?? ''}\nTYPE: ${topic.topicType}\n` +
        `CHARACTERS: ${episode.charactersUsed.join(', ')}\n` +
        `DURATION: ~${Math.round((episode.durationEstimateSeconds ?? 480) / 60)} min\n` +
        `DIALOGUE EXCERPT: ${(episode.fullDialogueText ?? '').slice(0, 1200)}\n\n` +
        `Generate the 5-platform distribution package. Use {{PLACEHOLDER}} tokens.`,
      temperature: 0.7,
      maxTokens: 3000,
    });

    const parsed = JSON.parse(content || '{}') as Record<string, unknown>;
    const injected = this.inject(parsed) as Record<string, unknown>;
    injected.generated_at = new Date().toISOString();

    return { package: injected, cost_usd: this.claude.cost(model, usage) };
  }

  private replace(s: string): string {
    return s
      .replace(/\{\{YOUTUBE_URL\}\}/g, SOCIAL_URLS.youtube)
      .replace(/\{\{INSTAGRAM_URL\}\}/g, SOCIAL_URLS.instagram)
      .replace(/\{\{LINKEDIN_URL\}\}/g, SOCIAL_URLS.linkedin)
      .replace(/\{\{WHATSAPP_CHANNEL\}\}/g, SOCIAL_URLS.whatsapp_channel);
  }

  private inject<T>(value: T): T {
    if (typeof value === 'string') return this.replace(value) as unknown as T;
    if (Array.isArray(value)) return value.map((v) => this.inject(v)) as unknown as T;
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.inject(v);
      }
      return out as unknown as T;
    }
    return value;
  }
}
