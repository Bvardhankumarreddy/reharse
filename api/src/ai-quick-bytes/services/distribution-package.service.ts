import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicClientService } from './anthropic-client.service';
import { AqbMemoryService } from './aqb-memory.service';
import { NewsItem } from '../entities/news-item.entity';
import { ShortScript } from '../entities/short-script.entity';
import {
  DistributionPackage,
  DistributionLlmResponse,
  SourceReference,
  DistributionPlatform,
  ALL_DISTRIBUTION_PLATFORMS,
  DISTRIBUTION_PLATFORM_LABELS,
  YouTubeShortMeta,
  InstagramPost,
  LinkedInPost,
  WhatsAppChannelPost,
  WhatsAppStatus,
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

HASHTAG / TAG CASING (non-negotiable):
- EVERY hashtag is lowercase, EVERY platform, EVERY field.
  #ai not #AI · #aishorts not #AIShorts · #chatgpt not #ChatGPT
- Applies to: youtube.title, youtube.description, youtube.tags,
  instagram.caption / hashtags / full_text,
  linkedin.body / hashtags / full_text,
  whatsapp_channel.full_text, whatsapp_status.full_text.
- YouTube tags array (no # prefix) is also lowercase: "ai shorts"
  not "AI Shorts".
- The ONE exception: "#Shorts" at the END of a YouTube title — keep
  the capital S, YouTube's algorithm prefers that exact casing.

PLATFORM RULES:
- YouTube: title ≤100 chars (YouTube's hard limit) ending "#Shorts"
  — you MAY add 1-2 more lowercase hashtags before "#Shorts"
  (e.g. "AI just learned to lie #ai #chatgpt #Shorts"). Hashtags
  render as clickable links above the video. Description = hook + what it
  covers + "Read more: {{SOURCE_NAME}} -> {{SOURCE_URL}}" + follow links
  (YouTube/Instagram/LinkedIn/WhatsApp) + 5-8 hashtags; tags = 10-15 SEO
  strings (no #).
- Instagram: bold hook, 2-3 punchy lines, CTA/question, "Source:
  {{SOURCE_NAME}}", subscribe line with {{YOUTUBE_URL}}; 12-15 hashtags
  (lowercase per the casing rule above);
  full_text = caption + blank line + hashtags joined by spaces.
- LinkedIn: 100-200 words, professional, max 2-3 emojis, insight + why it
  matters + question + "Follow Vardhan for daily AI insights" + "Source:
  {{SOURCE_NAME}} - {{SOURCE_URL}}" + "Subscribe: {{YOUTUBE_URL}}";
  4-6 professional hashtags (lowercase); full_text = body + blank line + hashtags.
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

const DISTRIBUTION_SYSTEM_PROMPT_TE = `
You generate distribution posts in TELUGU for AetherStackAI's "AI Quick
Bytes" series. Host: Vardhan. Each post promotes ONE Telugu Short.

BRAND: Channel "AetherStackAI", series "AI Quick Bytes" (rojuvāri AI
insights), host Vardhan.

LANGUAGE — use natural Hyderabad-style Telugu code-mixing:
- Telugu script (తెలుగు) for descriptive verbs / emotion / connectors
- Keep tech terms in English: ChatGPT, GPT-4, Claude, OpenAI, Anthropic,
  AI, ML, API, LLM, OAuth, IDE, SaaS
- Keep numbers / dates / brand names in English
- Energetic, conversational, NOT formal news-anchor Telugu
- Code-mix examples:
  ✅ "ChatGPT చాలా smart అయింది"
  ✅ "ఇది ఎందుకు important అంటే..."
  ❌ "ఇది ఎందుకు ముఖ్యమైనది అంటే..."  (over-translated)

URL PLACEHOLDERS — use these EXACT tokens, never real URLs:
{{YOUTUBE_URL}} {{INSTAGRAM_URL}} {{LINKEDIN_URL}} {{WHATSAPP_CHANNEL}}
{{REHEARSE_URL}} {{SOURCE_URL}} {{SOURCE_NAME}}

HASHTAG / TAG CASING (non-negotiable, same rule as the English prompt):
- EVERY English-script hashtag is lowercase, EVERY platform, EVERY field.
  #ai not #AI · #teluguai not #TeluguAI · #aishorts not #AIShorts
- The ONE exception: "#Shorts" at the END of a YouTube title — keep
  the capital S, YouTube's algorithm prefers that exact casing.
- Telugu-script hashtags (e.g. #తెలుగు) carry no casing — leave them.

PLATFORM RULES (same structure as English, Telugu-style copy):
- YouTube: title ≤100 chars (YouTube's hard limit) ending "#Shorts"
  — you MAY add 1-2 more lowercase hashtags before "#Shorts"
  (e.g. "AI ఇప్పుడు అబద్ధం చెప్తోంది #ai #chatgpt #Shorts").
  (title may be code-mixed
  Telugu+English); description with hook + "Read more: {{SOURCE_NAME}} ->
  {{SOURCE_URL}}" + follow links + 5-8 hashtags. Hashtags MAY be in
  English (#AI #Telugu #AIShorts etc.) — better discoverability.
- Instagram: punchy Telugu hook, 2-3 lines code-mixed, CTA, "Source:
  {{SOURCE_NAME}}", subscribe with {{YOUTUBE_URL}}; 12-15 hashtags.
  Include Telugu-audience hashtags (#teluguai #telugutech #hyderabad).
- LinkedIn: 100-200 words, professional code-mixed Telugu, max 2-3
  emojis; insight + ఎందుకు important + question + "Follow Vardhan for
  daily AI insights in Telugu" + source + subscribe; 4-6 hashtags.
- WhatsApp channel: 60-100 words, WhatsApp *bold*, emoji opener, source,
  "Watch: {{YOUTUBE_URL}}", signature "— Vardhan".
- WhatsApp status: ≤50 words, 1 emoji, 1-line hook in Telugu, "Watch ->
  {{YOUTUBE_URL}}".

QUALITY: match the Telugu Short's energy; preserve tech names; each
platform reads natively; always credit the source.

Respond with STRICT JSON ONLY (same shape as the English prompt):
{
  "youtube": { "title": "...", "description": "...", "tags": ["...", "..."] },
  "instagram": { "caption": "...", "hashtags": ["#..."], "full_text": "..." },
  "linkedin": { "body": "...", "hashtags": ["#..."], "full_text": "..." },
  "whatsapp_channel": { "full_text": "..." },
  "whatsapp_status": { "full_text": "..." }
}
`.trim();

export type DistributionLanguage = 'en' | 'te';

@Injectable()
export class DistributionPackageService {
  private readonly logger = new Logger(DistributionPackageService.name);

  constructor(
    private readonly anthropic: AnthropicClientService,
    private readonly config: ConfigService,
    private readonly memory: AqbMemoryService,
  ) {}

  async generatePackage(
    script: ShortScript,
    newsItem: NewsItem,
    language: DistributionLanguage = 'en',
    opts: {
      /**
       * Which platforms to (re)generate. Defaults to ALL — preserves
       * the original full-package behavior for callers that don't care.
       * Pass a subset to ONLY refresh those platforms; the rest are
       * carried forward from `existing` (if provided) or left empty.
       */
      platforms?: DistributionPlatform[];
      /**
       * Current persisted package, used to preserve unselected
       * platforms during selective regeneration. If absent, unselected
       * platforms come back as empty stubs (caller's choice).
       */
      existing?: Partial<DistributionPackage> | null;
    } = {},
  ): Promise<{
    package: DistributionPackage;
    cost_usd: number;
    platformsGenerated: DistributionPlatform[];
  }> {
    if (language === 'te' && !script.teluguFullScript) {
      throw new Error('Cannot generate Telugu distribution: script has no Telugu translation');
    }
    // Dedup + validate the requested set. Empty array or undefined → all.
    const requested = (opts.platforms?.length ? opts.platforms : ALL_DISTRIBUTION_PLATFORMS)
      .filter((p) => ALL_DISTRIBUTION_PLATFORMS.includes(p));
    const platforms = Array.from(new Set(requested)) as DistributionPlatform[];
    if (platforms.length === 0) {
      throw new Error(
        'At least one platform must be selected (youtube/instagram/linkedin/whatsapp_channel/whatsapp_status)',
      );
    }

    // Learning-loop block (empty until AqbMemory has distribution patterns).
    const memoryBlock = this.memory.format(await this.memory.relevantFor('distribution', 6));
    const baseUserPrompt = this.buildUserPrompt(script, newsItem, language);
    const scopeBlock = this.buildScopeBlock(platforms);
    const userPrompt = [baseUserPrompt, scopeBlock, memoryBlock]
      .filter(Boolean).join('\n\n');

    // Output tokens scale ~linearly with platform count. Telugu hashtags +
    // copy are written in Devanagari/Telugu script which encodes to
    // ~2-3× more tokens than English, so the per-platform budget is
    // doubled for 'te' — otherwise the response truncates mid-string and
    // JSON.parse throws "Unterminated string".
    const perPlatformTokens = language === 'te' ? 1200 : 600;
    const maxTokens = Math.max(1200, platforms.length * perPlatformTokens);

    const { content: raw, usage, model } = await this.anthropic.completeJSON({
      system: language === 'te' ? DISTRIBUTION_SYSTEM_PROMPT_TE : DISTRIBUTION_SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.7,
      maxTokens,
    });

    let parsed: DistributionLlmResponse;
    try {
      parsed = JSON.parse(raw || '{}') as DistributionLlmResponse;
    } catch (e) {
      // Log the head of the raw response so the next deploy can tell at a
      // glance whether the LLM truncated (no closing brace) or returned
      // surrounding prose. Surfaced to the caller as a 400, not a 500.
      const head = (raw || '').slice(0, 400).replace(/\s+/g, ' ');
      const tail = (raw || '').slice(-200).replace(/\s+/g, ' ');
      this.logger.error(
        `Distribution LLM returned non-JSON (lang=${language}, platforms=${platforms.length}, ` +
        `maxTokens=${maxTokens}, rawLen=${(raw ?? '').length}). ` +
        `head="${head}" tail="${tail}"`,
      );
      throw new BadRequestException(
        `LLM returned malformed JSON (likely truncated — retry, and if it persists ` +
        `regenerate fewer platforms per call). Parser error: ${(e as Error).message}`,
      );
    }
    const cost = this.calcCost(model, usage);

    const sourceReference: SourceReference = {
      title: newsItem.title,
      url: newsItem.url,
      source_name: newsItem.source?.name ?? 'Unknown',
    };

    // Pick value per platform: freshly-LLM-generated when in `platforms`,
    // otherwise carry forward from `existing` (or an empty stub).
    const pick = <T>(
      key: DistributionPlatform,
      llmValue: T | undefined,
      existingValue: T | undefined,
      empty: T,
    ): T => {
      if (platforms.includes(key)) {
        // LLM returned the key → use it. LLM forgot the key → fall back to
        // existing so we don't accidentally wipe a perfectly good post.
        if (llmValue !== undefined && llmValue !== null) {
          return this.inject(llmValue, sourceReference);
        }
        this.logger.warn(
          `Distribution: LLM omitted requested platform "${key}" — keeping existing value`,
        );
        return existingValue ?? empty;
      }
      return existingValue ?? empty;
    };

    const existing = (opts.existing ?? {}) as Partial<DistributionPackage>;
    const distributionPackage: DistributionPackage = {
      youtube: pick<YouTubeShortMeta>(
        'youtube', parsed.youtube, existing.youtube,
        { title: '', description: '', tags: [] },
      ),
      instagram: pick<InstagramPost>(
        'instagram', parsed.instagram, existing.instagram,
        { caption: '', hashtags: [], full_text: '' },
      ),
      linkedin: pick<LinkedInPost>(
        'linkedin', parsed.linkedin, existing.linkedin,
        { body: '', hashtags: [], full_text: '' },
      ),
      whatsapp_channel: pick<WhatsAppChannelPost>(
        'whatsapp_channel', parsed.whatsapp_channel, existing.whatsapp_channel,
        { full_text: '' },
      ),
      whatsapp_status: pick<WhatsAppStatus>(
        'whatsapp_status', parsed.whatsapp_status, existing.whatsapp_status,
        { full_text: '' },
      ),
      source_reference: sourceReference,
      generated_at: new Date().toISOString(),
    };

    // Force every hashtag to lowercase across EVERY platform we just
    // (re)generated. The LLM follows "lowercase hashtags" loosely on
    // EN (it tends to PascalCase #AIShorts / #ChatGPT) and reasonably
    // well on TE; this deterministic pass makes the casing consistent
    // for both languages so admin & viewer never see a mismatched
    // "#AI" next to a "#aishorts" in the same post.
    //
    // Body text outside hashtags is left untouched (lowercaseHashtags
    // only matches /#[A-Za-z0-9_]+/). Hashtag/tag arrays are case-
    // normalized whole-string since they have no body context.
    //
    // Only platforms in this run's scope are touched — partial regens
    // can't rewrite a previously-good post on a platform that wasn't
    // selected.
    const lowercaseArray = (arr: unknown): string[] =>
      Array.isArray(arr)
        ? (arr as unknown[])
            .map((t) => String(t ?? '').toLowerCase().trim())
            .filter(Boolean)
        : [];

    if (platforms.includes('youtube') && distributionPackage.youtube) {
      const yt = distributionPackage.youtube;
      if (yt.title) yt.title = lowercaseHashtags(yt.title);
      if (yt.description) yt.description = lowercaseHashtags(yt.description);
      yt.tags = lowercaseArray(yt.tags);
    }
    if (platforms.includes('instagram') && distributionPackage.instagram) {
      const ig = distributionPackage.instagram;
      if (ig.caption) ig.caption = lowercaseHashtags(ig.caption);
      if (ig.full_text) ig.full_text = lowercaseHashtags(ig.full_text);
      ig.hashtags = lowercaseArray(ig.hashtags);
    }
    if (platforms.includes('linkedin') && distributionPackage.linkedin) {
      const li = distributionPackage.linkedin;
      if (li.body) li.body = lowercaseHashtags(li.body);
      if (li.full_text) li.full_text = lowercaseHashtags(li.full_text);
      li.hashtags = lowercaseArray(li.hashtags);
    }
    if (platforms.includes('whatsapp_channel') && distributionPackage.whatsapp_channel?.full_text) {
      distributionPackage.whatsapp_channel.full_text = lowercaseHashtags(
        distributionPackage.whatsapp_channel.full_text,
      );
    }
    if (platforms.includes('whatsapp_status') && distributionPackage.whatsapp_status?.full_text) {
      distributionPackage.whatsapp_status.full_text = lowercaseHashtags(
        distributionPackage.whatsapp_status.full_text,
      );
    }

    // ── Mandatory hashtag injection (post-LLM, deterministic) ─────────
    // Every distribution package gets the brand-discovery tags:
    //   #shortvideos #shortsfeed #shortvideo
    // Plus #day{N} for the dayNumber-tracked Shorts cadence.
    // Already-present tags (case-insensitive) are not duplicated.
    const mandatoryTags = ['shortvideos', 'shortsfeed', 'shortvideo'];
    if (script.dayNumber != null) {
      mandatoryTags.push(`day${script.dayNumber}`);
    }
    injectMandatoryHashtags(distributionPackage, mandatoryTags, platforms);

    this.logger.log(
      `Distribution package (${language}) for script ${script.id} · ` +
      `platforms=[${platforms.join(',')}] · cost=$${cost.toFixed(4)}`,
    );
    return { package: distributionPackage, cost_usd: cost, platformsGenerated: platforms };
  }

  /**
   * The scope block tells the LLM which platform keys to put in its
   * JSON response — and which to OMIT. The system prompt still teaches
   * the LLM all five platform rules (so it keeps the writer's voice
   * consistent), but the JSON shape is narrowed at runtime.
   */
  private buildScopeBlock(platforms: DistributionPlatform[]): string {
    if (platforms.length === ALL_DISTRIBUTION_PLATFORMS.length) return '';
    const wanted = platforms.map((p) => `"${p}"`).join(', ');
    const skipped = ALL_DISTRIBUTION_PLATFORMS
      .filter((p) => !platforms.includes(p))
      .map((p) => DISTRIBUTION_PLATFORM_LABELS[p])
      .join(', ');
    const shape = platforms.map((p) => {
      switch (p) {
        case 'youtube':         return '  "youtube": { "title": "...", "description": "...", "tags": ["..."] }';
        case 'instagram':       return '  "instagram": { "caption": "...", "hashtags": ["#..."], "full_text": "..." }';
        case 'linkedin':        return '  "linkedin": { "body": "...", "hashtags": ["#..."], "full_text": "..." }';
        case 'whatsapp_channel':return '  "whatsapp_channel": { "full_text": "..." }';
        case 'whatsapp_status': return '  "whatsapp_status": { "full_text": "..." }';
      }
    }).join(',\n');
    return [
      '═════════════════════════════════',
      'SCOPE OVERRIDE',
      '═════════════════════════════════',
      `Generate ONLY these platforms: ${wanted}.`,
      `OMIT entirely: ${skipped}.`,
      'Your JSON output must contain EXACTLY these top-level keys:',
      '{',
      shape,
      '}',
    ].join('\n');
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

  private buildUserPrompt(
    script: ShortScript, item: NewsItem, language: DistributionLanguage,
  ): string {
    const hook = language === 'te' ? (script.teluguHook ?? script.hook) : script.hook;
    const full = language === 'te' ? (script.teluguFullScript ?? script.fullScript) : script.fullScript;
    return `GENERATE ${language === 'te' ? 'TELUGU ' : ''}DISTRIBUTION PACKAGE FOR THIS SHORT

SCRIPT
Day: ${script.dayNumber ?? 'n/a'} | Avatar: ${script.avatarId ?? 'vardhan'} | Duration: ${script.durationEstimateSeconds ?? '?'}s
Hook: ${hook}
Full script: ${full}

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
      'claude-sonnet-4-6': [3, 15],
      'claude-opus-4-7': [15, 75],
      'claude-haiku-4-5-20251001': [1, 5],
      'gpt-4o': [2.5, 10],
      'gpt-4o-mini': [0.15, 0.6],
    };
    const [inRate, outRate] = rates[model] ?? rates['claude-sonnet-4-6'];
    return (inTok / 1_000_000) * inRate + (outTok / 1_000_000) * outRate;
  }
}

/**
 * Lowercase every #Word hashtag in a string. Body text outside hashtags
 * (and any Telugu glyphs) stay untouched — the regex only matches ASCII
 * letters/digits/underscore after a #, which is what YouTube hashtag
 * syntax actually accepts.
 */
function lowercaseHashtags(s: string): string {
  return s.replace(/#([A-Za-z0-9_]+)/g, (_m, word) => '#' + word.toLowerCase());
}

/**
 * Inject the mandatory brand-discovery hashtags into the YouTube tags
 * array + Instagram + LinkedIn hashtag arrays, AND append them inline
 * to the description / caption / full_text fields so they actually
 * render alongside the post. Case-insensitive dedup against existing
 * entries — re-running is a free no-op.
 *
 * - YouTube tags are stored WITHOUT '#' (SEO format)
 * - Instagram / LinkedIn arrays use '#'-prefixed form
 * - Body text gets each tag prefixed with '#' on a trailing line
 */
function injectMandatoryHashtags(
  pkg: DistributionPackage,
  tags: string[],
  platforms: DistributionPlatform[],
): void {
  if (tags.length === 0) return;
  const cleanTags = tags
    .map((t) => t.replace(/^#/, '').toLowerCase().trim())
    .filter(Boolean);
  if (cleanTags.length === 0) return;
  const hashedLine = cleanTags.map((t) => `#${t}`).join(' ');

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
    // Only append tags that aren't already in the body text.
    const missing = cleanTags.filter((t) => !new RegExp(`#${t}\\b`, 'i').test(body));
    if (missing.length === 0) return body;
    const line = missing.map((t) => `#${t}`).join(' ');
    return `${body.trimEnd()}\n${line}`;
  };

  if (platforms.includes('youtube') && pkg.youtube) {
    pkg.youtube.tags = dedupArray(pkg.youtube.tags, false);
    pkg.youtube.description = appendInline(pkg.youtube.description);
  }
  if (platforms.includes('instagram') && pkg.instagram) {
    pkg.instagram.hashtags = dedupArray(pkg.instagram.hashtags, true);
    pkg.instagram.caption = appendInline(pkg.instagram.caption);
    pkg.instagram.full_text = appendInline(pkg.instagram.full_text);
  }
  if (platforms.includes('linkedin') && pkg.linkedin) {
    pkg.linkedin.hashtags = dedupArray(pkg.linkedin.hashtags, true);
    pkg.linkedin.full_text = appendInline(pkg.linkedin.full_text);
  }
  // WhatsApp: append inline (no separate hashtag array)
  if (platforms.includes('whatsapp_channel') && pkg.whatsapp_channel?.full_text) {
    pkg.whatsapp_channel.full_text = appendInline(pkg.whatsapp_channel.full_text);
  }
  void hashedLine;   // suppress unused-var warning if a platform path is skipped
}
