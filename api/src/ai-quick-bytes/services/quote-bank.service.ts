import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Or, Repository } from 'typeorm';
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

    // Step 1: prefer quotes either never used or not used in the last 30 days.
    let pool = await this.quotes.find({
      where: {
        language,
        isActive:   true,
        lastUsedAt: Or(IsNull(), LessThan(cutoff)),
      },
      order: { lastUsedAt: 'ASC' },   // NULLS FIRST in Postgres ASC default
      take:  50,
    });

    // Step 2: bank too small to rotate? Drop the recency rule.
    if (pool.length < QuoteBankService.MIN_POOL_TO_ENFORCE_RECENCY) {
      pool = await this.quotes.find({
        where: { language, isActive: true },
        order: { timesUsed: 'ASC', lastUsedAt: 'ASC' },
        take:  50,
      });
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

    const system =
      `You curate a bank of motivational quotes for "AI Quick Bytes", a ` +
      `daily AI shorts channel for educated Indian tech viewers. ` +
      `EVERY quote you propose MUST be a real attribution — never invent ` +
      `or paraphrase. If you are not certain of the exact wording and ` +
      `attribution, omit it. ` +
      `Output strict JSON: {"quotes": [{"text":"...", "author":"...", "source":"<book/speech/film or null>", "themes":["..."]}]}`;
    const user =
      `Propose ${count} short, screenshot-shareable quotes in ${language === 'te' ? 'Telugu (పూర్తి తెలుగు script with author Romanized if needed)' : 'English'}. ` +
      `Targeted at engineers / founders / students. Mix sources: ` +
      `tech leaders, writers, thinkers, philosophers. Avoid clichés ` +
      `("be yourself", "follow your passion") and avoid any quote ` +
      `whose attribution is contested. ` +
      `Each must be at most 25 words. ` +
      `Tag 1-3 themes per quote from: perseverance, learning, change, ` +
      `innovation, ethics, courage, ambition, focus, simplicity, ` +
      `humility, ownership, curiosity, resilience, craftsmanship.` +
      `${themeBlock}${existingBlock}\n\nReturn the JSON object only.`;

    const { content: raw } = await this.anthropic.completeJSON({
      system,
      user,
      temperature: 0.9,
      maxTokens:   3000,
    });
    const parsed = JSON.parse(raw || '{}') as { quotes?: QuoteSuggestion[] };
    const cleaned = (parsed.quotes ?? [])
      .map((q): QuoteSuggestion => ({
        text:   String(q.text   ?? '').trim(),
        author: String(q.author ?? '').trim(),
        source: q.source ? String(q.source).trim() : null,
        themes: (q.themes ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean),
      }))
      .filter((q) => q.text && q.author);
    return cleaned;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

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
