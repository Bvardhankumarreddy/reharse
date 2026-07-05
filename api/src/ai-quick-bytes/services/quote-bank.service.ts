import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Or, Repository, In } from 'typeorm';
import { AqbQuote, AqbQuoteLanguage } from '../entities/aqb-quote.entity';
import { AnthropicClientService } from './anthropic-client.service';

export interface QuoteSuggestion {
  text:    string;
  author:  string;
  source?: string | null;
  themes:  string[];
}

export interface PickContext {
  title: string;      // news headline
  hook?: string;
  body?: string;
}

@Injectable()
export class QuoteBankService {
  private readonly logger = new Logger(QuoteBankService.name);

  /** Quotes used in the last 30 days are de-prioritised. If fewer than
   *  this many remain after that filter, we ignore the rule entirely
   *  (bank too small to rotate). */
  private static readonly RECENT_WINDOW_DAYS = 30;
  private static readonly MIN_POOL_TO_ENFORCE_RECENCY = 5;

  /** Size of the shortlist we ask the LLM to pick from. */
  private static readonly SHORTLIST_SIZE = 10;

  constructor(
    @InjectRepository(AqbQuote)
    private readonly quotes: Repository<AqbQuote>,
    private readonly anthropic: AnthropicClientService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────

  async list(opts: {
    language?: AqbQuoteLanguage;
    active?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ rows: AqbQuote[]; total: number; activeCount: number }> {
    const qb = this.quotes.createQueryBuilder('q');
    if (opts.language) qb.andWhere('q.language = :lang', { lang: opts.language });
    if (opts.active !== undefined) {
      qb.andWhere('q.is_active = :a', { a: opts.active });
    }
    if (opts.search) {
      qb.andWhere(
        '(q.text ILIKE :s OR q.author ILIKE :s OR :s2 = ANY(q.themes))',
        { s: `%${opts.search}%`, s2: opts.search.toLowerCase() },
      );
    }
    const page     = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(200, Math.max(10, opts.pageSize ?? 50));
    qb.orderBy('q.created_at', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const [rows, total] = await qb.getManyAndCount();
    const activeCount   = await this.quotes.countBy({ isActive: true });
    return { rows, total, activeCount };
  }

  async create(input: {
    language: AqbQuoteLanguage;
    text:     string;
    author:   string;
    source?:  string | null;
    themes?:  string[];
  }): Promise<AqbQuote> {
    if (!input.text?.trim()) throw new BadRequestException('text is required');
    if (!input.author?.trim()) throw new BadRequestException('author is required');
    const quote = this.quotes.create({
      language:   input.language,
      text:       input.text.trim(),
      author:     input.author.trim(),
      source:     input.source?.trim() || null,
      themes:     (input.themes ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      isActive:   true,
    });
    return this.quotes.save(quote);
  }

  /** Bulk insert from the "Suggest" approval flow. Skips dupes (same
   *  text + author already in the bank, case-insensitive). */
  async createMany(
    language: AqbQuoteLanguage,
    items: QuoteSuggestion[],
  ): Promise<{ inserted: number; skipped: number }> {
    if (!items?.length) return { inserted: 0, skipped: 0 };
    let inserted = 0;
    let skipped  = 0;
    for (const it of items) {
      if (!it.text?.trim() || !it.author?.trim()) { skipped++; continue; }
      const exists = await this.quotes
        .createQueryBuilder('q')
        .where('LOWER(q.text)   = LOWER(:t)', { t: it.text.trim() })
        .andWhere('LOWER(q.author) = LOWER(:a)', { a: it.author.trim() })
        .getCount();
      if (exists > 0) { skipped++; continue; }
      await this.quotes.save(this.quotes.create({
        language,
        text:   it.text.trim(),
        author: it.author.trim(),
        source: it.source?.trim() || null,
        themes: (it.themes ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
        isActive: true,
      }));
      inserted++;
    }
    return { inserted, skipped };
  }

  async update(
    id: string,
    patch: Partial<Pick<AqbQuote, 'text' | 'author' | 'source' | 'themes' | 'isActive'>>,
  ): Promise<AqbQuote> {
    const row = await this.quotes.findOne({ where: { id } });
    if (!row) throw new NotFoundException('quote not found');
    Object.assign(row, patch);
    if (patch.text)   row.text   = patch.text.trim();
    if (patch.author) row.author = patch.author.trim();
    if (patch.themes) row.themes = patch.themes.map((t) => t.trim().toLowerCase()).filter(Boolean);
    return this.quotes.save(row);
  }

  /** Soft-retire by toggling is_active=false. We never hard-delete —
   *  retired quotes are still referenced by old scripts (closingQuoteId
   *  FK). */
  async retire(id: string): Promise<AqbQuote> {
    return this.update(id, { isActive: false });
  }

  // ── Picker ────────────────────────────────────────────────────────

  /**
   * Pick the best quote for this script. Returns null if the bank is
   * empty or no eligible quote remains — the caller treats that as a
   * non-fatal "skip the closing quote this round".
   */
  async pickFor(
    language: AqbQuoteLanguage,
    ctx: PickContext,
  ): Promise<AqbQuote | null> {
    const cutoff = new Date(Date.now() - QuoteBankService.RECENT_WINDOW_DAYS * 86400_000);

    // Hard-exclude the last 5 picked quotes across ALL bank sizes so
    // rotation still works when the bank is smaller than the recency
    // window can enforce. Without this the fallback path (step 2 below)
    // picked the same low-count quote repeatedly for topically-similar
    // stories — the operator was seeing "same quote every time."
    const recentlyPickedIds = (await this.quotes.find({
      where: { language, isActive: true, lastUsedAt: Not(IsNull()) },
      order: { lastUsedAt: 'DESC' },
      take:  5,
      select: ['id'],
    })).map((q) => q.id);
    const excludeIds = recentlyPickedIds.length ? { id: Not(In(recentlyPickedIds)) } : {};

    // Step 1: prefer quotes either never used or not used in the last 30 days.
    let pool = await this.quotes.find({
      where: {
        language,
        isActive:   true,
        lastUsedAt: Or(IsNull(), LessThan(cutoff)),
        ...excludeIds,
      },
      order: { lastUsedAt: 'ASC' },   // NULLS FIRST in Postgres ASC default
      take:  50,
    });

    // Step 2: bank too small to rotate? Drop the 30-day recency rule
    // but KEEP the last-5-picked exclusion — small banks still deserve
    // rotation. If even that leaves the pool empty (bank is smaller than
    // the exclusion window), fall all the way back to any active quote.
    if (pool.length < QuoteBankService.MIN_POOL_TO_ENFORCE_RECENCY) {
      pool = await this.quotes.find({
        where: { language, isActive: true, ...excludeIds },
        order: { timesUsed: 'ASC', lastUsedAt: 'ASC' },
        take:  50,
      });
      if (pool.length === 0) {
        this.logger.warn(
          `Quote bank ${language} exhausted — all quotes are in the ` +
          `last-5-picked window. Add more quotes to the bank to enable ` +
          `proper rotation.`,
        );
        pool = await this.quotes.find({
          where: { language, isActive: true },
          order: { timesUsed: 'ASC', lastUsedAt: 'ASC' },
          take:  50,
        });
      }
    }
    if (pool.length === 0) return null;

    // Step 3: random-sample down to a shortlist; ask the LLM to pick.
    const shortlist = sampleN(pool, QuoteBankService.SHORTLIST_SIZE);
    if (shortlist.length === 1) {
      return this.markUsed(shortlist[0]);
    }

    let pickedId: string | null = null;
    try {
      pickedId = await this.llmPick(shortlist, ctx);
    } catch (e) {
      this.logger.warn(`Quote LLM pick failed — falling back to least-recently-used: ${(e as Error).message}`);
    }
    const picked =
      shortlist.find((q) => q.id === pickedId) ?? shortlist[0]; // shortlist[0] is least-recently-used by ordering
    return this.markUsed(picked);
  }

  /**
   * Compose the spoken closing line for THIS specific story + quote — a
   * 1-sentence transition written by the LLM so the framing feels natural
   * and varies day to day. Includes the quote verbatim, the author
   * attribution, and a trailing pause marker, ready to splice into
   * fullScript.
   *
   * On any LLM failure we fall back to a minimal default — better to
   * lose the framing than to lose the quote.
   */
  async composeClosingLine(
    quote: AqbQuote,
    ctx: PickContext,
  ): Promise<string> {
    const fallback =
      `"${stripWrappingQuotes(quote.text)}." — ${quote.author}. [1 sec pause]`;

    const isTe = quote.language === 'te';
    const languageRule = isTe
      ? `- Write the transition sentence in PURE Telugu script (తెలుగు), ` +
        `channelling TRIVIKRAM SRINIVAS — short, punchy, observational. ` +
        `Avoid formal news-anchor Telugu and over-Sanskritised vocabulary. ` +
        `It may code-mix tech terms (AI, ChatGPT, OpenAI) only if the ` +
        `story is about them.\n` +
        `- The quote text is ALREADY Telugu — paste it VERBATIM, do not ` +
        `re-translate, do not re-transliterate.\n` +
        `- The author name stays as stored (may be English or Telugu — ` +
        `keep it exactly as given).\n`
      : `- Write the transition sentence in conversational English.\n` +
        `- Quote the quote VERBATIM in English — never paraphrase, ` +
        `never re-attribute, never translate.\n`;

    try {
      const system =
        `You write the closing line of a 45-second AI Quick Bytes Short. ` +
        `Just before the host's subscribe CTA, you bridge into a ` +
        `motivational quote that's been picked for THIS story. ` +
        `\n\nRules (all non-negotiable):\n` +
        `- Output ONE spoken sentence that introduces the quote, then ` +
        `  the quote in double quotes, then "— <Author>." on the same line.\n` +
        `- The transition sentence is ≤8 words. Conversational. Tonally ` +
        `  matched to the story (curious, sober, hopeful, blunt — never ` +
        `  cheesy).\n` +
        languageRule +
        `- End the whole line with " [1 sec pause]" literally.\n` +
        `- No emojis, no hashtags, no markdown, no preamble.\n` +
        `\nResponse format: a single plain-text line. Nothing else.`;
      const user =
        `STORY\nHeadline: ${ctx.title}\n` +
        (ctx.hook ? `Hook: ${ctx.hook}\n` : '') +
        `\nQUOTE TO INTRODUCE (${quote.language})\n` +
        `Text:   ${stripWrappingQuotes(quote.text)}\n` +
        `Author: ${quote.author}\n` +
        (quote.themes.length ? `Themes: ${quote.themes.join(', ')}\n` : '') +
        `\nWrite the one closing line now.`;

      const { content: raw } = await this.anthropic.completeJSON({
        system,
        user,
        temperature: 0.7,
        // Telugu encodes to ~2-3× more tokens than English — give the
        // composer enough headroom that a transition + quote + author
        // + pause marker never truncates mid-sentence.
        maxTokens: isTe ? 600 : 220,
      });

      const line = (raw ?? '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
      // Sanity-check what came back: must contain the quote AND the author
      // AND the pause marker. If any guarantee is missing, drop back to the
      // deterministic fallback so the video never ships a half-broken line.
      const okQuote  = line.includes(stripWrappingQuotes(quote.text));
      const okAuthor = line.includes(quote.author);
      const okPause  = /\[1 sec pause\]\s*$/.test(line);
      if (!okQuote || !okAuthor || !okPause) {
        this.logger.warn(
          `Closing-line LLM dropped a guarantee (lang=${quote.language} ` +
          `quote=${okQuote} author=${okAuthor} pause=${okPause}) — using fallback`,
        );
        return fallback;
      }
      return line;
    } catch (e) {
      this.logger.warn(`Closing-line LLM failed: ${(e as Error).message} — using fallback`);
      return fallback;
    }
  }

  private async markUsed(q: AqbQuote): Promise<AqbQuote> {
    q.timesUsed  = (q.timesUsed ?? 0) + 1;
    q.lastUsedAt = new Date();
    return this.quotes.save(q);
  }

  private async llmPick(shortlist: AqbQuote[], ctx: PickContext): Promise<string | null> {
    const numbered = shortlist
      .map((q, i) =>
        `[${i}] "${q.text}" — ${q.author}` +
        (q.themes.length ? ` (themes: ${q.themes.join(', ')})` : ''))
      .join('\n');

    const system =
      `You match a motivational quote to a news story. ` +
      `Pick the SINGLE quote from the list that best fits the story's ` +
      `theme — not by topical keyword overlap but by underlying lesson ` +
      `(perseverance, change, learning, ethics, courage, ambition). ` +
      `If NO quote fits naturally, return -1. ` +
      `Output strict JSON: {"index": <0..N-1 or -1>, "reason": "<one short sentence>"}`;
    const user =
      `STORY\nHeadline: ${ctx.title}\n` +
      (ctx.hook ? `Hook: ${ctx.hook}\n` : '') +
      (ctx.body ? `Body opener: ${(ctx.body ?? '').slice(0, 300)}\n` : '') +
      `\nCANDIDATE QUOTES\n${numbered}\n\n` +
      `Reply with the JSON object only.`;

    const { content: raw } = await this.anthropic.completeJSON({
      system,
      user,
      temperature: 0.3,
      maxTokens:   200,
    });
    const parsed = JSON.parse(raw || '{}') as { index?: number };
    const idx = Number(parsed.index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= shortlist.length) return null;
    return shortlist[idx].id;
  }

  // ── Suggest (Claude drafts candidates for admin to review) ─────────

  /**
   * Draft N quote candidates via Claude. Returns them WITHOUT saving —
   * the admin reviews + selects a subset to commit via createMany().
   * Existing bank contents are passed in so Claude doesn't propose
   * duplicates of what's already there.
   */
  async suggest(opts: {
    language: AqbQuoteLanguage;
    count?:   number;
    themesHint?: string[];
  }): Promise<QuoteSuggestion[]> {
    const count    = Math.min(20, Math.max(3, opts.count ?? 10));
    const language = opts.language;

    // Pull existing quotes so the prompt can say "don't repeat these".
    const existing = await this.quotes.find({
      where: { language, isActive: true },
      select: ['text', 'author'],
      take: 500,
    });
    const existingBlock = existing.length
      ? `\nQuotes already in the bank (do NOT repeat or paraphrase):\n` +
        existing.map((q) => `- "${q.text}" — ${q.author}`).join('\n')
      : '';

    const themeBlock = opts.themesHint?.length
      ? `\nFavour quotes that touch these themes: ${opts.themesHint.join(', ')}.\n`
      : '';

    // Bias sources by language: English scripts close on English-tradition
    // poets; Telugu scripts close on Telugu poets. The operator explicitly
    // asked for this pairing so the closing quote feels like it belongs
    // to the culture of the language it's spoken in.
    const sourceBiasBlock = language === 'te'
      ? `Prefer TELUGU POETS as the primary source (≥ 70% of the batch): ` +
        `Vemana, Sumati (Baddena Bhupala), Annamayya (Annamacharya), ` +
        `Bammera Pothana, Yerra Pragada, Nannaya, Tikkana, Tikkavarapu ` +
        `Ramireddy, Sri Sri (Srirangam Srinivasa Rao), Devulapalli Krishna ` +
        `Sastri, Gurram Jashuva, Kaloji Narayana Rao, Dasarathi ` +
        `Krishnamacharyulu, C. Narayana Reddy, Viswanatha Satyanarayana. ` +
        `Their quotes may be in Telugu script or transliterated Telugu — ` +
        `whichever is closer to the original wording. Fill the remaining ` +
        `slots with Telugu philosophers / spiritual thinkers (Ramana ` +
        `Maharshi, Nagarjuna) or, sparingly, universal poets translated ` +
        `to Telugu. AVOID tech-CEO or Western-motivational quotes — this ` +
        `bank is culturally-Telugu.`
      : `Prefer ENGLISH-LANGUAGE POETS as the primary source (≥ 70% of ` +
        `the batch): Robert Frost, Emily Dickinson, Walt Whitman, William ` +
        `Wordsworth, Rudyard Kipling, W.H. Auden, T.S. Eliot, Mary Oliver, ` +
        `Rilke (Bly / Kinnell translations), Rumi (Coleman Barks / Nicholson ` +
        `translations), Tagore (self-translation), Kabir (Bly translation), ` +
        `Wendell Berry, Seamus Heaney, Maya Angelou. Fill the remaining ` +
        `slots with LITERARY essayists whose lines read as poetry (Emerson, ` +
        `Thoreau, Annie Dillard, David Whyte). AVOID tech-CEO one-liners ` +
        `("stay hungry", "move fast") and avoid corporate-motivational ` +
        `speakers — this bank is poet-first.`;

    const system =
      `You curate a bank of motivational quotes for "AI Quick Bytes", a ` +
      `daily AI shorts channel for educated Indian tech viewers. ` +
      `EVERY quote you propose MUST be a real attribution — never invent ` +
      `or paraphrase. If you are not certain of the exact wording and ` +
      `attribution, omit it. ` +
      `Your response MUST start with "{" and contain ONLY a JSON object ` +
      `with this exact shape — no preamble, no explanation, no commentary, ` +
      `no markdown fences:\n` +
      `{"quotes": [{"text":"...", "author":"...", "source":"<book/speech/film or null>", "themes":["..."]}]}`;
    const user =
      `Propose ${count} short, screenshot-shareable quotes in ${language === 'te' ? 'Telugu (పూర్తి తెలుగు script — author name may stay in English)' : 'English'}. ` +
      `Targeted at engineers / founders / students. ` +
      `\n\n${sourceBiasBlock}\n\n` +
      `Avoid clichés ("be yourself", "follow your passion") and avoid any ` +
      `quote whose attribution is contested. Each must be at most 25 words. ` +
      `Tag 1-3 themes per quote from: perseverance, learning, change, ` +
      `innovation, ethics, courage, ambition, focus, simplicity, ` +
      `humility, ownership, curiosity, resilience, craftsmanship.` +
      `${themeBlock}${existingBlock}\n\n` +
      `Reply with the JSON object only. Start with "{". No preamble.`;

    // Telugu encodes to ~2-3× more tokens than English — bump the budget
    // so the LLM has room for ${count} Telugu-script quotes without truncating.
    const maxTokens = language === 'te' ? 6000 : 3000;

    const { content: raw } = await this.anthropic.completeJSON({
      system,
      user,
      temperature: 0.7,
      maxTokens,
    });

    const parsed = extractJSONOrThrow<{ quotes?: QuoteSuggestion[] }>(raw, language);
    const cleaned = (parsed.quotes ?? [])
      .map((q): QuoteSuggestion => ({
        text:   String(q.text   ?? '').trim(),
        author: String(q.author ?? '').trim(),
        source: q.source ? String(q.source).trim() : null,
        themes: (q.themes ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean),
      }))
      .filter((q) => q.text && q.author);
    if (cleaned.length === 0) {
      throw new BadRequestException(
        `Claude returned 0 valid quote candidates for language=${language}. ` +
        `Try again, or lower the count. Head of response: "${(raw ?? '').slice(0, 200)}"`,
      );
    }
    return cleaned;
  }
}

/**
 * Robust JSON extractor — Claude occasionally returns a prose preamble
 * ("I need to be careful here…") before the JSON, or trailing prose.
 * Strategy:
 *   1. Try parsing the whole response as JSON (the happy path).
 *   2. If that fails, extract the FIRST balanced {...} object and parse it.
 *   3. If that also fails, throw a BadRequestException with the head of
 *      the raw response so the admin sees WHY and can retry — not a 500.
 */
function extractJSONOrThrow<T>(raw: string, language: string): T {
  const trimmed = (raw ?? '').trim();
  try {
    return JSON.parse(trimmed || '{}') as T;
  } catch {
    // Fall through to balanced-brace extraction.
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      // Fall through.
    }
  }
  const head = trimmed.slice(0, 240).replace(/\s+/g, ' ');
  throw new BadRequestException(
    `Claude returned non-JSON (language=${language}). Retry usually fixes this. ` +
    `Head: "${head}"`,
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function stripWrappingQuotes(s: string): string {
  return (s ?? '').replace(/^["'""'']+|["'""'']+$/g, '').trim();
}

function sampleN<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  // Top-of-list (least-recently-used) gets in first; the rest is sampled.
  // This balances rotation pressure against randomness.
  const head = arr.slice(0, Math.min(3, n));
  const tail = arr.slice(3);
  const need = n - head.length;
  const sampled: T[] = [];
  const indexes = new Set<number>();
  while (sampled.length < need && sampled.length < tail.length) {
    const i = Math.floor(Math.random() * tail.length);
    if (indexes.has(i)) continue;
    indexes.add(i);
    sampled.push(tail[i]);
  }
  return [...head, ...sampled];
}
