import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiPulseScript, AiPulseDistributionPackage } from '../entities/news-script.entity';
import { AiPulseNewsItem } from '../entities/news-item.entity';

export type AiPulseDistLanguage = 'en' | 'te';

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

const SYSTEM_TE = `
You generate distribution posts in TELUGU for AetherStackAI's "AI Pulse"
series — daily AI news from around the world. Host: Vardhan. Each post
promotes ONE Telugu-dubbed short and drives traffic to the channel.

BRAND: Channel "AetherStackAI", series "AI Pulse" (prapanchavyāpta AI
samaachaaram), host Vardhan.

DIALOGUE STYLE ANCHOR — channel TRIVIKRAM SRINIVAS. Lines should land
like punchlines — short clauses with sudden pivots, everyday observations
elevated by precise word choice, educated-Hyderabadi code-mix where
English hits harder than Telugu. Rhetorical questions that pull the
reader in ("మీకు తెలుసా?"). Quotable, Instagram-screenshot-worthy lines.
Avoid formal news-anchor Telugu (నివేదిక, ప్రకటించడం) and
over-Sanskritised vocabulary nobody uses in conversation.

LANGUAGE — Hyderabad-style Telugu code-mixing:
- Telugu script (తెలుగు) for descriptive verbs / emotion / connectors
- Keep tech terms English: AI, ML, API, LLM, GPT, ChatGPT, OpenAI,
  Anthropic, Google, OAuth, JWT, IDE, SaaS, etc.
- Keep company / product / person names in English (Pine Labs, ISRO,
  BMC, Sam Altman, Sundar Pichai, etc.)
- Numbers, dates, currency in English (Rs 9.25 crore, 2026, etc.)
- Energetic, conversational, NOT formal news-anchor Telugu
- Examples:
  ✅ "AI Mumbaiలో irregularities గుర్తించింది"
  ✅ "ఇది ఎందుకు important అంటే..."
  ❌ "ఇది ఎందుకు ముఖ్యమైనది అంటే..."  (over-translated)

URL PLACEHOLDERS — {{SOURCE_URL}} for the full source link. Do NOT
write any other real URLs.

HARD REQUIREMENTS (non-negotiable):
- EVERY platform's main text MUST contain the full source URL
  (use {{SOURCE_URL}} — the system replaces it).
- EVERY platform MUST also generate a pinned_comment carrying the full
  source URL formatted as: Source: {SOURCE_NAME} — {{SOURCE_URL}}
- ALL HASHTAGS lowercase across every platform.

PLATFORM RULES (Telugu copy, same structure as English):
- youtube: title ≤100 chars ending "#Shorts" (title may be code-mixed
  Telugu+English); description = Telugu hook + what it covers + "Read
  more: {SOURCE_NAME} → {{SOURCE_URL}}" + 5-8 lowercase hashtags;
  tags = 10-15 lowercase SEO strings (no #), include Telugu-audience
  tags like teluguai, telugutech, teluguai news.
- instagram: bold Telugu hook, 2-3 punchy lines code-mixed, CTA,
  "Source: {SOURCE_NAME} → {{SOURCE_URL}}"; 12-15 lowercase hashtags
  (include #teluguai #telugutech #hyderabad); full_text = caption +
  blank line + hashtags joined by spaces.
- linkedin: 100-200 words, professional code-mixed Telugu, insight +
  ఎందుకు important + question + "Source: {SOURCE_NAME} — {{SOURCE_URL}}"
  + "Follow Vardhan for daily AI insights in Telugu"; 4-6 lowercase
  hashtags; full_text = body + blank line + hashtags.
- whatsapp_channel: 60-100 words Telugu, *bold* formatting, emoji
  opener, source line "Watch: {{SOURCE_URL}}", signature "— Vardhan".
- whatsapp_status: ≤50 words Telugu, 1 emoji, 1-line hook, "Read →
  {{SOURCE_URL}}".

Output STRICT JSON only (same shape as English):
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

  async generatePackage(
    scriptId: string,
    language: AiPulseDistLanguage = 'en',
  ): Promise<AiPulseDistributionPackage> {
    if (!this.openai) throw new Error('OPENAI_API_KEY not configured');
    const script = await this.scripts.findOne({ where: { id: scriptId } });
    if (!script) throw new NotFoundException('script not found');
    const item = await this.news.findOne({ where: { id: script.news_item_id } });
    if (!item) throw new NotFoundException('news item not found');

    // Pick the right language source — Telugu script must exist before we
    // can write Telugu distribution; otherwise the LLM has nothing to
    // promote.
    const isTe = language === 'te';
    if (isTe && !script.telugu_full_script) {
      throw new Error(
        'Cannot generate Telugu distribution: script has no Telugu translation yet',
      );
    }
    const title = (isTe ? script.telugu_title : script.english_title) ?? '';
    const hook  = (isTe ? script.telugu_hook  : script.english_hook ) ?? '';
    const full  = (isTe ? script.telugu_full_script : script.english_full_script) ?? '';

    const user =
      `SCRIPT\nVertical: ${script.vertical} | Title: ${title}\n` +
      `Hook: ${hook}\nFull script: ${full}\n\n` +
      `SOURCE\nName: ${item.source_name}\nURL: ${item.source_url}\nHeadline: ${item.headline}\n\n` +
      `Use the {{SOURCE_URL}} placeholder — the runtime will inject ${item.source_url}.\n` +
      `Output strict JSON per the system prompt.`;

    // Telugu output is encoded as ~2-3× more tokens than English (Indic
    // script) — bump the cap so the response doesn't truncate mid-string
    // and break JSON.parse (the same trap AQB hit on regenerate).
    const maxTokens = isTe ? 5000 : 2500;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: isTe ? SYSTEM_TE : SYSTEM },
        { role: 'user',   content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: maxTokens,
    });
    const rawContent = completion.choices[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawContent) as Record<string, unknown>;
    } catch (e) {
      const head = rawContent.slice(0, 300).replace(/\s+/g, ' ');
      this.logger.error(
        `AI Pulse distribution (${language}) — LLM returned non-JSON ` +
        `(rawLen=${rawContent.length}, maxTokens=${maxTokens}). head="${head}"`,
      );
      throw new Error(
        `LLM returned malformed JSON (likely truncated). ${(e as Error).message}`,
      );
    }

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

    // ── Mandatory hashtag injection (post-LLM, deterministic) ──────────
    // Every AI Pulse distribution package gets the brand-discovery tags
    // for the YouTube Shorts surface: #shortvideos #shortsfeed #shortvideo.
    // (No #dayN — AI Pulse doesn't use a day counter; that's an AQB thing.)
    // Case-insensitive dedup — re-running is a free no-op.
    const mandatoryTags = ['shortvideos', 'shortsfeed', 'shortvideo'];
    injectMandatoryHashtagsInto(pkg, mandatoryTags);

    await this.scripts.update(
      scriptId,
      isTe ? { telugu_distribution_package: pkg } : { distribution_package: pkg },
    );
    this.logger.log(
      `Distribution package (${language}) for script ${scriptId} — ${pkg.source_reference.name}`,
    );
    return pkg;
  }
}

/**
 * Inject mandatory brand-discovery hashtags into the per-platform tag
 * arrays AND inline into the description / caption / full_text bodies.
 * Case-insensitive dedup so re-runs don't duplicate.
 *
 * - YouTube tags: stored WITHOUT '#'
 * - Instagram / LinkedIn hashtags: WITH '#'
 * - Body fields: tags appended as a trailing '#hashtag' line
 */
function injectMandatoryHashtagsInto(pkg: AiPulseDistributionPackage, tags: string[]): void {
  const cleanTags = tags
    .map((t) => t.replace(/^#/, '').toLowerCase().trim())
    .filter(Boolean);
  if (cleanTags.length === 0) return;

  const dedupArray = (existing: unknown, withHash: boolean): string[] => {
    const arr = Array.isArray(existing) ? (existing as unknown[]).map(String) : [];
    const seen = new Set(arr.map((t) => t.replace(/^#/, '').toLowerCase().trim()).filter(Boolean));
    const out = [...arr];
    for (const t of cleanTags) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(withHash ? `#${t}` : t);
    }
    return out;
  };

  const appendInline = (body: string | undefined): string => {
    if (!body) return body ?? '';
    const missing = cleanTags.filter((t) => !new RegExp(`#${t}\\b`, 'i').test(body));
    if (missing.length === 0) return body;
    return `${body.trimEnd()}\n${missing.map((t) => `#${t}`).join(' ')}`;
  };

  if (pkg.youtube) {
    pkg.youtube.tags = dedupArray(pkg.youtube.tags, false);
    pkg.youtube.description = appendInline(pkg.youtube.description);
  }
  if (pkg.instagram) {
    pkg.instagram.hashtags = dedupArray(pkg.instagram.hashtags, true);
    pkg.instagram.caption = appendInline(pkg.instagram.caption);
    pkg.instagram.full_text = appendInline(pkg.instagram.full_text);
  }
  if (pkg.linkedin) {
    pkg.linkedin.hashtags = dedupArray(pkg.linkedin.hashtags, true);
    pkg.linkedin.full_text = appendInline(pkg.linkedin.full_text);
  }
  if (pkg.whatsapp_channel?.full_text) {
    pkg.whatsapp_channel.full_text = appendInline(pkg.whatsapp_channel.full_text);
  }
}
