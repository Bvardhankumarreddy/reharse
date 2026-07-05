import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiPulseScript, AiPulseDistributionPackage } from '../entities/news-script.entity';
import { AiPulseNewsItem } from '../entities/news-item.entity';
import { VERTICALS } from '../config/verticals.config';

export type AiPulseDistLanguage = 'en' | 'te';

const SYSTEM = `
You generate distribution posts for AetherStackAI's "AI Pulse" series.
Host: Vardhan. Each post promotes ONE short and drives traffic to the channel.

URL PLACEHOLDERS — use {{SOURCE_URL}} for the full source link. Do NOT
write any other real URLs.

═══════════════════════════════════════
TITLE PLAYBOOK (YouTube) — HOW to write titles that stop the scroll
═══════════════════════════════════════
This is the biggest CTR lever. Pick the strongest pattern for THIS story:

▶ "<BRAND / PERSON> just <SURPRISING VERB> <SPECIFIC THING>"
  ✅ "OpenAI just leaked its next model's context window"
  ✅ "Sundar Pichai just admitted Gemini's real weakness"

▶ "<NUMBER> + <CONCRETE NOUN> + <TIME/OUTCOME>"
  ✅ "$500B in AI hires. In 90 days."
  ✅ "3 lines of Python replaced a whole team"

▶ "<QUESTION that reframes the story>"
  ✅ "Is Claude actually smarter than GPT-5 now?"
  ✅ "Why did Anthropic hide this benchmark?"

▶ "<CONTROVERSY / REVERSAL>"
  ✅ "Meta open-sourced the model Google was hiding"
  ✅ "The AI startup that just killed its own product"

▶ "<IDENTITY CALLOUT + PAYOFF>"
  ✅ "For Indian engineers: OpenAI's new pricing tier"
  ✅ "If you use Cursor, read this"

TITLE HARD RULES:
- 60-90 chars (YouTube truncates at ~100 on mobile — leave room for
  the "#Shorts" tag). Never exceed 100.
- MUST end with " #Shorts" (that exact casing, YouTube ranks it).
- MAY prepend 1-2 lowercase topical hashtags before "#Shorts"
  (e.g. "…for Rs 4 crore #ai #openai #Shorts").
- FRONT-LOAD the interesting thing in the first 5 words — the mobile
  feed truncates mid-title. If the story's payoff is a name, number,
  or verb, that word goes first.
- SPECIFIC beats vague every time. Real brand / person / product /
  number > "AI just did something". Use the actual entities from the
  news item (they're passed in the user prompt).
- BANNED words that read as clickbait and get punished by the algo:
  "shocking", "you won't believe", "insane", "crazy", "mind-blown",
  "this changes everything", "gone wrong", "reacts to".

═══════════════════════════════════════
DESCRIPTION PLAYBOOK (YouTube) — first 2 lines are the SEO gold
═══════════════════════════════════════
Structure (in order):
  LINE 1 (hook, ≤120 chars — this is what shows in search snippets):
    Re-phrase the title with the ONE concrete fact that makes this
    interesting. NOT a re-copy of the title.
  LINE 2 (blank).
  LINES 3-5 (what it covers, 2-4 sentences):
    Plain English, no jargon. Tell the viewer what they'll learn.
    Weave brand / product / person names naturally — YouTube indexes
    these for search.
  LINE 6 (blank).
  LINE 7: "Read more: {SOURCE_NAME} → {{SOURCE_URL}}"
  LINE 8 (blank).
  LINE 9 (hashtag block, 5-8 hashtags): mix per HASHTAG PLAYBOOK below.

Description hard rules:
- 150-400 words TOTAL. Not padded, not one-liner.
- No emoji spam. 0-2 emoji max, and only if they earn their place.
- Never repeat the title verbatim in the description.

═══════════════════════════════════════
YOUTUBE TAGS PLAYBOOK (the 10-15 strings, no # prefix)
═══════════════════════════════════════
Layered mix — use ALL three layers, never just one:

  LAYER 1 — Broad topical (3-4 tags): "ai news", "ai shorts",
  "artificial intelligence", "tech news 2026". Always include the
  channel-brand seed "aetherstackai".

  LAYER 2 — Specific brand / product / person (5-7 tags): pull these
  DIRECTLY from the news item's entities. Company names ("openai",
  "anthropic", "google deepmind"), product names ("chatgpt", "claude
  opus", "gemini 3", "cursor ide"), person names ("sam altman",
  "sundar pichai") — always exactly as they'd be searched.

  LAYER 3 — Long-tail search phrases (3-4 tags): what a viewer would
  actually type into YouTube search: "openai new model 2026",
  "claude vs gpt", "ai layoffs india", "chatgpt free plan india".

Tag hard rules:
- All lowercase, no # prefix.
- 10-15 total (YouTube caps at ~500 chars aggregate; 15 short tags fits).
- No duplicates, no near-duplicates ("chatgpt" AND "chat gpt" is waste).
- If the news item's entities were passed in, USE them verbatim in
  Layer 2 — they are the highest-CTR signal you have.

═══════════════════════════════════════
HASHTAG PLAYBOOK (Instagram / LinkedIn / body-inline)
═══════════════════════════════════════
Same 3-layer strategy as YouTube tags but WITH the # prefix:

  LAYER 1 — Broad discovery (3-4): #ai #artificialintelligence
    #aishorts #techindia
  LAYER 2 — Specific brand / product / person (6-8): #openai #chatgpt
    #anthropic #claude #cursorai #geminiai — pull from news entities.
  LAYER 3 — Audience identity (2-3): #indianengineers #btech
    #techprofessionals #startupindia

Hashtag hard rules:
- ALL LOWERCASE always. #ai not #AI. #chatgpt not #ChatGPT.
- Instagram: 12-15 total. LinkedIn: 4-6 total (LinkedIn punishes
  hashtag spam — quality beats quantity).
- Never write hashtags with numbers unless the number is part of a
  known brand (#gpt5, #openai — fine; #ai2026 — bad, reads as bot).

═══════════════════════════════════════
HARD REQUIREMENTS (non-negotiable)
═══════════════════════════════════════
- EVERY platform's main text MUST contain the full source URL
  (use the {{SOURCE_URL}} placeholder — the system will replace it).
- EVERY platform MUST generate a pinned_comment field carrying the
  source URL formatted as: Source: {SOURCE_NAME} — {{SOURCE_URL}}
- ALL HASHTAGS lowercase across every platform.

═══════════════════════════════════════
PLATFORM RULES (structure — the playbooks above tell you HOW)
═══════════════════════════════════════
- youtube: title per TITLE PLAYBOOK; description per DESCRIPTION
  PLAYBOOK; tags per YOUTUBE TAGS PLAYBOOK.
- instagram: bold hook, 2-3 punchy lines, CTA, "Source: {SOURCE_NAME}
  → {{SOURCE_URL}}"; 12-15 hashtags per HASHTAG PLAYBOOK; full_text
  = caption + blank line + hashtags joined by spaces.
- linkedin: 100-200 words, professional, insight + why it matters +
  question + "Source: {SOURCE_NAME} — {{SOURCE_URL}}" + "Follow
  Vardhan for daily AI insights"; 4-6 hashtags per HASHTAG PLAYBOOK;
  full_text = body + blank line + hashtags.
- whatsapp_channel: 60-100 words, WhatsApp formatting (*bold*),
  emoji opener, source line "Watch: {{SOURCE_URL}}", signature
  "— Vardhan".
- whatsapp_status: ≤50 words, 1 emoji, 1-line hook, "Read →
  {{SOURCE_URL}}".

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

═══════════════════════════════════════
TITLE PLAYBOOK (Telugu YouTube) — same patterns as English, code-mixed
═══════════════════════════════════════
Trivikram-style punchlines, code-mixed. Pick ONE pattern per title:

▶ "<BRAND> just <VERB> <THING> — <TELUGU HOOK>"
  ✅ "OpenAI ఇప్పుడు మనకి ఇచ్చిన trick తెలుసా?"
  ✅ "ChatGPT free planlo ఏమి మార్చింది?"
▶ "<NUMBER + CONCRETE THING>"
  ✅ "Rs 400 crore. 90 rojullo."
  ✅ "3 lines Python. Whole team gone."
▶ "<Trivikram-style question>"
  ✅ "మీకు తెలుసా Claude ఏమి చేసిందో?"
  ✅ "Cursor use చేస్తున్నారా? ఇది చూడండి."

TITLE HARD RULES (Telugu):
- 60-90 chars ending " #Shorts". FRONT-LOAD the interesting Telugu
  or English word (not "మీరు వార్త వినారా" style filler).
- Brand / product / person names stay in English exactly as searched
  (OpenAI, ChatGPT, Sam Altman, Gemini — no తెలుగీకరణ).
- Numbers stay as digits (Rs 4 crore, not నాలుగు కోట్లు).
- MAY prepend 1-2 lowercase hashtags before "#Shorts"
  (e.g. "…news #teluguai #openai #Shorts").

═══════════════════════════════════════
DESCRIPTION PLAYBOOK (Telugu YouTube)
═══════════════════════════════════════
Structure:
  LINE 1 (Telugu hook re-phrased with the ONE key fact, ≤120 chars).
  LINE 2 blank.
  LINES 3-5 (Telugu code-mixed, 2-4 sentences): what viewers will
    learn. Weave brand / product names in English inline (they're
    the SEO signal too).
  LINE 6 blank.
  LINE 7: "Read more: {SOURCE_NAME} → {{SOURCE_URL}}"
  LINE 8 blank.
  LINE 9 (5-8 hashtags, mix per HASHTAG PLAYBOOK below).

═══════════════════════════════════════
YOUTUBE TAGS PLAYBOOK (Telugu — 10-15, no # prefix)
═══════════════════════════════════════
Three layers, same strategy as English but with Telugu-audience overlay:

  LAYER 1 — Broad Telugu-AI (3-4): "teluguai", "telugutech", "telugu
  ai news", "aetherstackai"
  LAYER 2 — Specific brand / product / person (5-7): pulled from
  news entities exactly as searched — "openai", "chatgpt", "sam
  altman", "cursor ide", "gemini 3", etc. English names, verbatim.
  LAYER 3 — Long-tail (3-4): "openai new model telugu", "chatgpt
  telugu ki ela", "ai news telugu"

═══════════════════════════════════════
HASHTAG PLAYBOOK (Telugu)
═══════════════════════════════════════
  LAYER 1 — Broad (3-4): #teluguai #telugutech #ai #hyderabad
  LAYER 2 — Brand / product / person (6-8): #openai #chatgpt #gpt5
    #anthropic #claude #geminiai — pulled from news entities.
  LAYER 3 — Audience identity (2-3): #teluguengineers #teluguyt
    #teluguviewers

Same casing rule: ALL LOWERCASE always.

═══════════════════════════════════════
PLATFORM RULES (Telugu copy, same structure)
═══════════════════════════════════════
- youtube: title per TITLE PLAYBOOK; description per DESCRIPTION
  PLAYBOOK; tags per YOUTUBE TAGS PLAYBOOK.
- instagram: bold Telugu hook, 2-3 punchy lines code-mixed, CTA,
  "Source: {SOURCE_NAME} → {{SOURCE_URL}}"; 12-15 hashtags per
  HASHTAG PLAYBOOK; full_text = caption + blank line + hashtags.
- linkedin: 100-200 words, professional code-mixed Telugu, insight +
  ఎందుకు important + question + "Source: {SOURCE_NAME} — {{SOURCE_URL}}"
  + "Follow Vardhan for daily AI insights in Telugu"; 4-6 hashtags
  per HASHTAG PLAYBOOK; full_text = body + blank line + hashtags.
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

    // Load the vertical spec so we can hand the LLM the human-readable
    // label + audience + tone + style keywords. Without this the LLM sees
    // "ai_business" as a raw enum and can't reason about who it's writing
    // for — the outputs come back generic.
    const verticalSpec = VERTICALS[script.vertical];
    const verticalBlock = verticalSpec
      ? `VERTICAL: ${verticalSpec.display_name}\n` +
        `  Description: ${verticalSpec.description}\n` +
        `  Target audience: ${verticalSpec.target_audience}\n` +
        `  Tone: ${verticalSpec.tone}\n` +
        `  Style keywords to weave into tags / hashtags: ${verticalSpec.style_keywords.join(', ')}\n`
      : `VERTICAL: ${script.vertical}\n`;

    // Extract named entities from the ingested news item — real
    // company / product / person / regulation names. These are the
    // highest-CTR Layer-2 seeds for tags + hashtags. Deduped by kind so
    // the LLM sees them grouped ("companies: openai, anthropic; people:
    // sam altman, dario amodei; products: gpt-5, claude opus 4.5").
    const entityBlock = formatEntitiesForPrompt(item.entities ?? []);

    const user =
      `${verticalBlock}\n` +
      `SCRIPT\nTitle: ${title}\n` +
      `Hook: ${hook}\n` +
      `Full script: ${full}\n\n` +
      `SOURCE\nName: ${item.source_name}\nURL: ${item.source_url}\n` +
      `Original headline: ${item.headline}\n` +
      (item.summary ? `Summary: ${item.summary.slice(0, 500)}\n` : '') +
      `\n${entityBlock}` +
      `Use the {{SOURCE_URL}} placeholder — the runtime will inject ${item.source_url}.\n` +
      `Output strict JSON per the system prompt. Follow the TITLE / ` +
      `DESCRIPTION / TAGS / HASHTAG playbooks — do NOT default to generic ` +
      `"ai news" copy. Use the named entities above verbatim in Layer 2 ` +
      `of every tag/hashtag list.`;

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

/**
 * Group entities from a news item by kind (company / person / product /
 * regulation / etc.) into a readable block for the distribution LLM. The
 * block feeds Layer-2 of tags + hashtags — real names beat generic
 * "ai news" every time. Empty when the ingestion pipeline didn't extract
 * any entities, so callers can safely concat the result.
 */
function formatEntitiesForPrompt(
  entities: Array<{ kind: string; value: string }>,
): string {
  if (!entities || entities.length === 0) return '';
  const byKind = new Map<string, string[]>();
  for (const e of entities) {
    const kind = (e?.kind ?? '').trim().toLowerCase();
    const value = (e?.value ?? '').trim();
    if (!kind || !value) continue;
    const bucket = byKind.get(kind) ?? [];
    if (!bucket.some((v) => v.toLowerCase() === value.toLowerCase())) {
      bucket.push(value);
      byKind.set(kind, bucket);
    }
  }
  if (byKind.size === 0) return '';
  const lines = ['NAMED ENTITIES (use these VERBATIM in Layer-2 tags + hashtags):'];
  for (const [kind, values] of byKind.entries()) {
    lines.push(`  ${kind}: ${values.slice(0, 8).join(', ')}`);
  }
  return `${lines.join('\n')}\n\n`;
}
