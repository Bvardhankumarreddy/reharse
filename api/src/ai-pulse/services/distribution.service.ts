import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiPulseScript, AiPulseDistributionPackage } from '../entities/news-script.entity';
import { AiPulseNewsItem } from '../entities/news-item.entity';

const SYSTEM = `
You generate distribution posts for AetherStackAI's "AI Pulse" series.
Host: Vardhan. Each post promotes ONE short and drives traffic to the channel.

URL PLACEHOLDERS — use {{SOURCE_URL}} for the full source link. Do NOT
write any other real URLs.

HARD REQUIREMENTS (non-negotiable):
- EVERY platform's main text MUST contain the full source URL
  (use the {{SOURCE_URL}} placeholder — the system will replace it).
- EVERY platform MUST also generate a pinned_comment field that
  carries the full source URL on its own line, formatted as:
    Source: {SOURCE_NAME} — {{SOURCE_URL}}
- ALL HASHTAGS must be lowercase across every platform.

PLATFORM RULES:
- youtube: title ≤100 chars ending "#Shorts"; description = hook +
  what it covers + "Read more: {SOURCE_NAME} → {{SOURCE_URL}}" + 5-8
  lowercase hashtags; tags = 10-15 lowercase SEO strings (no #).
- instagram: bold hook, 2-3 punchy lines, CTA, "Source: {SOURCE_NAME} →
  {{SOURCE_URL}}"; 12-15 lowercase hashtags; full_text = caption +
  blank line + hashtags joined by spaces.
- linkedin: 100-200 words, professional, insight + why it matters +
  question + "Source: {SOURCE_NAME} — {{SOURCE_URL}}" + "Follow Vardhan
  for daily AI insights"; 4-6 lowercase hashtags; full_text = body +
  blank line + hashtags.
- whatsapp_channel: 60-100 words, WhatsApp formatting (*bold*), emoji
  opener, source line "Watch: {{SOURCE_URL}}", signature "— Vardhan".
- whatsapp_status: ≤50 words, 1 emoji, 1-line hook, "Read → {{SOURCE_URL}}".

Output STRICT JSON only:
{
  "youtube":         { "title":"...", "description":"...", "tags":["..."], "pinned_comment":"..." },
  "instagram":       { "caption":"...", "hashtags":["#..."], "full_text":"...", "pinned_comment":"..." },
  "linkedin":        { "body":"...", "hashtags":["#..."], "full_text":"..." },
  "whatsapp_channel":{ "full_text":"..." },
  "whatsapp_status": { "full_text":"..." }
}
`.trim();

@Injectable()
export class AiPulseDistributionService {
  private readonly logger = new Logger(AiPulseDistributionService.name);
  private readonly openai: OpenAI | null;

  constructor(
    @InjectRepository(AiPulseScript) private readonly scripts: Repository<AiPulseScript>,
    @InjectRepository(AiPulseNewsItem) private readonly news: Repository<AiPulseNewsItem>,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generatePackage(scriptId: string): Promise<AiPulseDistributionPackage> {
    if (!this.openai) throw new Error('OPENAI_API_KEY not configured');
    const script = await this.scripts.findOne({ where: { id: scriptId } });
    if (!script) throw new NotFoundException('script not found');
    const item = await this.news.findOne({ where: { id: script.news_item_id } });
    if (!item) throw new NotFoundException('news item not found');

    const user =
      `SCRIPT\nVertical: ${script.vertical} | Title: ${script.english_title}\n` +
      `Hook: ${script.english_hook}\nFull script: ${script.english_full_script}\n\n` +
      `SOURCE\nName: ${item.source_name}\nURL: ${item.source_url}\nHeadline: ${item.headline}\n\n` +
      `Use the {{SOURCE_URL}} placeholder — the runtime will inject ${item.source_url}.\n` +
      `Output strict JSON per the system prompt.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2500,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<string, unknown>;

    // Inject the real source URL where the LLM used the placeholder, then
    // also force-append the source URL to every platform text — belt &
    // braces in case the LLM forgot the placeholder.
    const inject = (s: string | undefined): string => {
      if (!s) return '';
      return s
        .replace(/\{\{SOURCE_URL\}\}/g, item.source_url)
        .replace(/\{\{SOURCE_NAME\}\}/g, item.source_name);
    };
    const lowerHashtagsArr = (arr: unknown): string[] =>
      Array.isArray(arr)
        ? (arr as unknown[]).map((t) => String(t).trim().toLowerCase()).filter(Boolean)
        : [];
    const lowerHashtagsBody = (s: string): string =>
      s.replace(/#([A-Za-z0-9_]+)/g, (_m, w) => '#' + w.toLowerCase());

    const yt = (parsed.youtube as Record<string, unknown> | undefined) ?? {};
    const ig = (parsed.instagram as Record<string, unknown> | undefined) ?? {};
    const li = (parsed.linkedin as Record<string, unknown> | undefined) ?? {};
    const wc = (parsed.whatsapp_channel as Record<string, unknown> | undefined) ?? {};
    const ws = (parsed.whatsapp_status as Record<string, unknown> | undefined) ?? {};

    const pinned = `Source: ${item.source_name} — ${item.source_url}`;

    const pkg: AiPulseDistributionPackage = {
      youtube: {
        title: lowerHashtagsBody(inject(String(yt.title ?? ''))),
        description: lowerHashtagsBody(inject(String(yt.description ?? ''))),
        tags: lowerHashtagsArr(yt.tags),
        pinned_comment: String(yt.pinned_comment ?? pinned),
      },
      instagram: {
        caption: lowerHashtagsBody(inject(String(ig.caption ?? ''))),
        hashtags: lowerHashtagsArr(ig.hashtags),
        full_text: lowerHashtagsBody(inject(String(ig.full_text ?? ''))),
        pinned_comment: String(ig.pinned_comment ?? pinned),
      },
      linkedin: {
        body: lowerHashtagsBody(inject(String(li.body ?? ''))),
        hashtags: lowerHashtagsArr(li.hashtags),
        full_text: lowerHashtagsBody(inject(String(li.full_text ?? ''))),
      },
      whatsapp_channel: { full_text: inject(String(wc.full_text ?? '')) },
      whatsapp_status:  { full_text: inject(String(ws.full_text ?? '')) },
      source_reference: { name: item.source_name, url: item.source_url },
    };

    // Safety net: if any platform's main text still lacks the source URL
    // (LLM ignored the placeholder), force-append.
    const ensureUrl = (s: string): string =>
      s.includes(item.source_url) ? s : `${s.trim()}\n\nSource: ${item.source_name} — ${item.source_url}`;
    pkg.youtube!.description = ensureUrl(pkg.youtube!.description);
    pkg.instagram!.full_text = ensureUrl(pkg.instagram!.full_text);
    pkg.linkedin!.full_text  = ensureUrl(pkg.linkedin!.full_text);
    pkg.whatsapp_channel!.full_text = ensureUrl(pkg.whatsapp_channel!.full_text);
    pkg.whatsapp_status!.full_text  = ensureUrl(pkg.whatsapp_status!.full_text);

    await this.scripts.update(scriptId, { distribution_package: pkg });
    this.logger.log(`Distribution package for script ${scriptId} — ${pkg.source_reference.name}`);
    return pkg;
  }
}
