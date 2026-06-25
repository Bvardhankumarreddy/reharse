import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShortScript } from '../entities/short-script.entity';
import { AqbShortPostmortem, AqbPostmortemContent } from '../entities/short-postmortem.entity';
import { AqbMemoryService } from '../services/aqb-memory.service';
import { AqbMetricsFetcherService } from '../services/aqb-metrics-fetcher.service';
import { AnthropicClientService } from '../services/anthropic-client.service';

/**
 * Closes the loop for AQB. After postmortems exist, this aggregates the
 * signals from WINNING shorts (views ≥ 1.5× channel mean) and promotes
 * reusable patterns into AqbMemory. Deterministic aggregation — no extra LLM
 * call. Conservative by design (skips on <5 measured shorts; promoteUnique
 * dedupes so we don't pollute the memory store).
 */
@Injectable()
export class AqbImprovementAgent {
  private readonly logger = new Logger(AqbImprovementAgent.name);
  private static readonly LIFT = 1.5;

  constructor(
    @InjectRepository(ShortScript) private readonly scripts: Repository<ShortScript>,
    @InjectRepository(AqbShortPostmortem) private readonly postmortems: Repository<AqbShortPostmortem>,
    private readonly memorySvc: AqbMemoryService,
    private readonly metricsSvc: AqbMetricsFetcherService,
    private readonly anthropic: AnthropicClientService,
  ) {}

  async runWeekly(): Promise<{ scanned: number; promoted: number; winners: number }> {
    // Latest metric per published short.
    const latest = await this.metricsSvc.latestPerShort();
    if (latest.length < 5) {
      this.logger.log(`AQB improvement skipped — only ${latest.length} measured short(s) (need ≥5)`);
      return { scanned: latest.length, winners: 0, promoted: 0 };
    }
    const mean = latest.reduce((a, b) => a + b.views, 0) / latest.length;
    if (mean <= 0) return { scanned: latest.length, winners: 0, promoted: 0 };

    const winnerIds = latest
      .filter((r) => r.views >= mean * AqbImprovementAgent.LIFT)
      .map((r) => r.scriptId);
    if (winnerIds.length === 0) {
      this.logger.log(`AQB improvement — 0 winners above ${(AqbImprovementAgent.LIFT * 100).toFixed(0)}% mean (${Math.round(mean)} views)`);
      return { scanned: latest.length, winners: 0, promoted: 0 };
    }

    const [winnerScripts, winnerPostmortems] = await Promise.all([
      this.scripts.findByIds(winnerIds),
      this.postmortems
        .createQueryBuilder('p')
        .whereInIds(undefined)
        .andWhere('p."scriptId" IN (:...ids)', { ids: winnerIds })
        .getMany(),
    ]);

    let promoted = 0;

    // 1) Hook patterns from postmortems → 'hook' / ['script']
    const hooks = uniq(winnerPostmortems
      .map((p) => p.content?.reusableHookPattern?.trim())
      .filter((s): s is string => !!s && s.length > 6),
    ).slice(0, 5);
    for (const h of hooks) {
      const m = await this.memorySvc.promoteUnique(
        'hook', `Hook pattern that won on this channel: ${h}`, ['script'], 2,
      );
      if (m) promoted++;
    }

    // 2) Winning thumbnail style → 'thumbnail_style' / ['thumbnail']
    const styleCounts = tally(
      winnerPostmortems
        .map((p) => p.content?.winningThumbnailStyle?.trim())
        .filter((s): s is string => !!s && s !== 'none'),
    );
    const topStyle = sortedTopKey(styleCounts);
    if (topStyle) {
      const m = await this.memorySvc.promoteUnique(
        'thumbnail_style',
        `Thumbnail style that wins on this channel: ${topStyle} (${styleCounts[topStyle]} winner(s)). Default to it unless a topic clearly calls for another.`,
        ['thumbnail'], 3,
      );
      if (m) promoted++;
    }

    // 3) Topic signals → 'topic' / ['scoring','script']
    const topicCounts = tally(
      winnerPostmortems
        .map((p) => p.content?.topicSignal?.trim())
        .filter((s): s is string => !!s && s.length > 2),
    );
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, n]) => `${t} (${n}× winners)`);
    if (topTopics.length > 0) {
      const m = await this.memorySvc.promoteUnique(
        'topic',
        `Topic angles that have worked: ${topTopics.join('; ')}. Score them higher when they recur.`,
        ['scoring', 'script'], 2,
      );
      if (m) promoted++;
    }

    // 4) Winning hashtags → 'hashtag' / ['distribution']
    //    Sources scanned per winner script (in priority order):
    //    - LIVE YouTube title + description (curator's manual edits on
    //      YouTube Studio — captures custom tags like "#trending")
    //    - distributionPackage.{youtube.tags, instagram.hashtags,
    //      linkedin.hashtags} (LLM-generated baseline)
    const hashtagCounts = tally(
      winnerScripts.flatMap((s) => [
        ...extractLiveHashtags(s),
        ...extractHashtags(s.distributionPackage),
      ]),
    );
    const topHashtags = Object.entries(hashtagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => `#${t}`);
    if (topHashtags.length > 0) {
      const m = await this.memorySvc.promoteUnique(
        'hashtag',
        `Hashtags correlated with wins: ${topHashtags.join(' ')}. Prefer including these when relevant.`,
        ['distribution'], 2,
      );
      if (m) promoted++;
    }

    // ── 5) Scene patterns → 'scene_pattern' / ['scene'] ───────────────
    // Only winners that actually had cinematic scenes contribute. Mines
    // four aggregate signals:
    //   - winning scene_count bucket  ("tight 10-13" / "verbose 14-18")
    //   - winning opening_shot type   (close-up / wide / over-shoulder)
    //   - winning mood arc tokens     (which emotional anchors recur)
    //   - winning character_count     (1 / 2-3 / 4+)
    // Plus any high-signal 1-line scenePattern notes the postmortem agent
    // flagged on individual winners.
    const sceneWinners = winnerPostmortems.filter(
      (p) => Number(p.content?.sceneCount ?? 0) > 0,
    );
    promoted += await this.promoteScenePatterns(sceneWinners);

    // 6) Title + description edit patterns — diff LLM-generated copy
    //    against what the curator actually published on YouTube. Captures
    //    the human's editorial fingerprint (verb swaps, em-dash hooks,
    //    description restructures) that the LLM should pre-apply next time.
    promoted += await this.promoteEditPatterns(winnerScripts);

    this.logger.log(
      `AQB improvement — ${winnerIds.length}/${latest.length} winners; promoted ${promoted} memory(ies)` +
      ` (mean ${Math.round(mean)} views)`,
    );
    return { scanned: latest.length, winners: winnerIds.length, promoted };
  }

  /**
   * Mine title + description edits from winners. For each winner with a
   * non-trivial diff between LLM-generated copy and the live YouTube
   * snippet, ask the LLM to summarise the editorial pattern in one
   * sentence. Patterns appearing in ≥1 winner promote — bar is low
   * because curator edits are explicit human signal.
   *
   * Costs ~$0.005 per winner. promoteUnique() dedupes by content hash
   * so a "remove the brand prefix" rule promoted once won't re-promote.
   * Soft-fails per-winner — one bad diff doesn't blow the whole sweep.
   */
  private async promoteEditPatterns(
    winners: ShortScript[],
  ): Promise<number> {
    if (!this.anthropic.isConfigured()) return 0;
    let promoted = 0;
    const seenContent = new Set<string>();

    for (const w of winners) {
      const dist = w.distributionPackage as
        | { youtube?: { title?: string; description?: string } }
        | null;
      const llmTitle  = dist?.youtube?.title?.trim() ?? '';
      const llmDesc   = dist?.youtube?.description?.trim() ?? '';
      const liveTitle = (w.liveYoutubeTitle ?? '').trim();
      const liveDesc  = (w.liveYoutubeDescription ?? '').trim();

      // Need both sides for a meaningful diff. Skip if either is missing.
      const titleHasDiff = llmTitle && liveTitle && llmTitle !== liveTitle;
      const descHasDiff  = llmDesc  && liveDesc  && llmDesc  !== liveDesc;
      if (!titleHasDiff && !descHasDiff) continue;

      // Language mismatch guard. If the LLM drafted English but the
      // curator's live snippet is in Telugu (or vice-versa), the diff
      // is dominated by TRANSLATION not editorial style — the LLM will
      // dutifully summarise it as "rewrite in Telugu", which then
      // contaminates EVERY future English distribution gen (memories are
      // not language-scoped). Skip these — translation patterns are not
      // editorial patterns.
      const llmIsTe  = hasTeluguGlyphs(llmTitle)  || hasTeluguGlyphs(llmDesc);
      const liveIsTe = hasTeluguGlyphs(liveTitle) || hasTeluguGlyphs(liveDesc);
      if (llmIsTe !== liveIsTe) {
        this.logger.log(
          `Edit-pattern mining: skipping script ${w.id} — language mismatch ` +
          `(llm=${llmIsTe ? 'te' : 'en'} vs live=${liveIsTe ? 'te' : 'en'})`,
        );
        continue;
      }

      // Skip near-identical edits (just whitespace / casing). Saves the
      // LLM call when the diff isn't substantive.
      const titleNoise = titleHasDiff && normForCompare(llmTitle) === normForCompare(liveTitle);
      const descNoise  = descHasDiff  && normForCompare(llmDesc)  === normForCompare(liveDesc);
      if ((!titleHasDiff || titleNoise) && (!descHasDiff || descNoise)) continue;

      try {
        const patterns = await this.summariseEditDiff({
          llmTitle, liveTitle, llmDesc, liveDesc,
        });
        for (const p of patterns) {
          // Double-belt: even with matched languages, refuse to promote
          // rules that themselves prescribe a target language. These are
          // not portable editorial rules.
          if (/\b(in |to )?telugu\b/i.test(p) || /\benglish\b/i.test(p)) {
            this.logger.log(`Edit-pattern miner: dropping language-prescriptive rule "${p.slice(0, 60)}…"`);
            continue;
          }
          const key = normForCompare(p);
          if (seenContent.has(key)) continue;
          seenContent.add(key);
          const m = await this.memorySvc.promoteUnique(
            'edit_pattern', p, ['script', 'distribution'], 2,
          );
          if (m) promoted++;
        }
      } catch (e) {
        this.logger.warn(
          `Edit-pattern mining for script ${w.id} failed: ${(e as Error).message}`,
        );
      }
    }
    return promoted;
  }

  /**
   * One LLM call per winner — feeds the LLM the before/after pair and
   * gets back 1-3 reusable rules describing what the human consistently
   * changed. Strict JSON. Skips low-confidence rules.
   */
  private async summariseEditDiff(opts: {
    llmTitle: string; liveTitle: string;
    llmDesc:  string; liveDesc:  string;
  }): Promise<string[]> {
    const system =
      `You analyse the diff between LLM-drafted copy and the human-edited ` +
      `version a curator actually published on YouTube. Your job: extract ` +
      `1-3 REUSABLE editorial rules that capture WHAT THE HUMAN ` +
      `consistently changes. Be specific (a rule the next LLM draft can ` +
      `actually apply), not vague. ` +
      `\n\nReply with strict JSON only:\n` +
      `{"rules":[{"text":"<one-sentence reusable rule>","confidence":"high|medium|low"}]}\n\n` +
      `Skip "low" confidence rules in your output. If the edits look ` +
      `random or noise (typo fixes, no clear pattern), return {"rules":[]}.`;
    const user =
      `TITLE\n` +
      `LLM draft:    ${opts.llmTitle || '(none)'}\n` +
      `Human edited: ${opts.liveTitle || '(unchanged)'}\n\n` +
      `DESCRIPTION (first 500 chars)\n` +
      `LLM draft:    ${(opts.llmDesc ?? '').slice(0, 500) || '(none)'}\n` +
      `Human edited: ${(opts.liveDesc ?? '').slice(0, 500) || '(unchanged)'}\n\n` +
      `Extract the editorial rules now. JSON only.`;

    const { content: raw } = await this.anthropic.completeJSON({
      system,
      user,
      temperature: 0.3,
      maxTokens:   400,
    });
    const parsed = JSON.parse(raw || '{"rules":[]}') as {
      rules?: Array<{ text?: string; confidence?: string }>;
    };
    return (parsed.rules ?? [])
      .filter((r) => r.text && r.confidence !== 'low')
      .map((r) => String(r.text).trim())
      .filter((t) => t.length > 12 && t.length < 280);
  }

  /**
   * Promote scene patterns from winning scene-enabled videos. Requires
   * ≥3 such winners to fire — below that, the patterns are noise and
   * we'd pollute the scene memory store. Idempotent (promoteUnique
   * dedupes), so re-running on the same winner set is a no-op.
   */
  private async promoteScenePatterns(
    sceneWinners: AqbShortPostmortem[],
  ): Promise<number> {
    if (sceneWinners.length < 3) {
      this.logger.log(
        `Scene-pattern mining skipped — only ${sceneWinners.length} ` +
        `scene-enabled winner(s) (need ≥3 for signal)`,
      );
      return 0;
    }
    const contents = sceneWinners.map((p) => p.content ?? {});
    let promoted = 0;

    // a) Scene count bucket
    const buckets = tally(
      contents
        .map((c) => sceneBucket(Number(c.sceneCount ?? 0)))
        .filter((b): b is string => !!b),
    );
    const topBucket = sortedTopKey(buckets);
    if (topBucket && buckets[topBucket] >= 2) {
      const m = await this.memorySvc.promoteUnique(
        'scene_pattern',
        `Scene count that wins: ${topBucket} scenes ` +
        `(${buckets[topBucket]} of ${sceneWinners.length} winners). ` +
        `Default to this band unless the story genuinely needs more or fewer beats.`,
        ['scene'], 2,
      );
      if (m) promoted++;
    }

    // b) Opening shot type
    const openings = tally(
      contents
        .map((c) => (c.openingShotType ?? '').trim().toLowerCase())
        .filter((s): s is string => !!s && s.length > 2),
    );
    const topOpening = sortedTopKey(openings);
    if (topOpening && openings[topOpening] >= 2) {
      const m = await this.memorySvc.promoteUnique(
        'scene_pattern',
        `Opening shot that wins: "${topOpening}" ` +
        `(${openings[topOpening]} of ${sceneWinners.length} winners). ` +
        `Lead the cold open with this shot type unless the story demands otherwise.`,
        ['scene'], 3,
      );
      if (m) promoted++;
    }

    // c) Mood arc tokens (which moods recur across winners' arcs)
    const allMoods = contents
      .flatMap((c) => (c.moodArc ?? '').split(',').map((m) => m.trim().toLowerCase()))
      .filter((m) => m && m.length > 2);
    const moodCounts = tally(allMoods);
    const topMoods = Object.entries(moodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .filter(([, n]) => n >= 2)
      .map(([t, n]) => `${t} (${n}×)`);
    if (topMoods.length > 0) {
      const m = await this.memorySvc.promoteUnique(
        'scene_pattern',
        `Mood tokens correlated with wins: ${topMoods.join(', ')}. ` +
        `Lean into these emotional anchors when the story supports them.`,
        ['scene'], 2,
      );
      if (m) promoted++;
    }

    // d) Character count bucket (1 / 2-3 / 4+)
    const charBuckets = tally(
      contents
        .map((c) => characterBucket(Number(c.characterCount ?? 0)))
        .filter((b): b is string => !!b),
    );
    const topChar = sortedTopKey(charBuckets);
    if (topChar && charBuckets[topChar] >= 2) {
      const m = await this.memorySvc.promoteUnique(
        'scene_pattern',
        `Character count that wins: ${topChar} characters ` +
        `(${charBuckets[topChar]} of ${sceneWinners.length} winners).`,
        ['scene'], 2,
      );
      if (m) promoted++;
    }

    // e) Individual scenePattern notes — high-signal 1-liners from
    //    postmortems on standout winners. Promote unique, distinctive ones.
    const notes = uniq(
      contents
        .map((c) => (c.scenePattern ?? '').trim())
        .filter((s): s is string => !!s && s.length > 12),
    ).slice(0, 5);
    for (const n of notes) {
      const m = await this.memorySvc.promoteUnique(
        'scene_pattern',
        `Scene observation from a winner: ${n}`,
        ['scene'], 1,
      );
      if (m) promoted++;
    }

    return promoted;
  }
}

/** Group scene counts into bands so we don't promote noisy "13 scenes wins"
 *  patterns — bands tell the scene gen "stay tight" vs "go verbose". */
/** Normalise a string for cheap dedup / noise-edit detection. Strips
 *  punctuation, lowercases, collapses whitespace. */
function normForCompare(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Telugu Unicode block (U+0C00–U+0C7F). Used by the edit-pattern miner
 *  to skip cross-language diffs that would otherwise produce
 *  "translate to Telugu" rules. */
function hasTeluguGlyphs(s: string): boolean {
  return /[ఀ-౿]/.test(s ?? '');
}

function sceneBucket(n: number): string | null {
  if (n <= 0) return null;
  if (n <= 9)  return '6-9';
  if (n <= 13) return '10-13';
  if (n <= 18) return '14-18';
  return '19+';
}

/** Same idea for character count — 1 vs ensemble vs crowd. */
function characterBucket(n: number): string | null {
  if (n <= 0) return null;
  if (n === 1) return '1';
  if (n <= 3)  return '2-3';
  return '4+';
}

// ── small utils ─────────────────────────────────────────────────────────────

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
function tally(arr: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of arr) {
    const k = x.toLowerCase();
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
function sortedTopKey(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}
function extractHashtags(pkg: unknown): string[] {
  if (!pkg || typeof pkg !== 'object') return [];
  const o = pkg as Record<string, unknown>;
  const ig = (o.instagram as { hashtags?: string[] } | undefined)?.hashtags ?? [];
  const li = (o.linkedin as { hashtags?: string[] } | undefined)?.hashtags ?? [];
  const yt = (o.youtube as { tags?: string[] } | undefined)?.tags ?? [];
  return [...ig, ...li, ...yt]
    .map((t) => String(t).replace(/^#/, '').trim().toLowerCase())
    .filter((t) => t && t.length <= 40);
}

/**
 * Mine #hashtags from the LIVE YouTube title + description across both
 * languages. Captures custom tags the curator added on YouTube Studio
 * (e.g. "#trending") that aren't in the LLM-generated distribution
 * package. Same lowercase + length cutoff as extractHashtags so they
 * merge cleanly.
 */
function extractLiveHashtags(s: {
  liveYoutubeTitle?: string | null;
  liveYoutubeDescription?: string | null;
  liveTeluguYoutubeTitle?: string | null;
  liveTeluguYoutubeDescription?: string | null;
}): string[] {
  const corpus = [
    s.liveYoutubeTitle ?? '',
    s.liveYoutubeDescription ?? '',
    s.liveTeluguYoutubeTitle ?? '',
    s.liveTeluguYoutubeDescription ?? '',
  ].join(' ');
  if (!corpus.trim()) return [];
  // Match #word — ASCII word chars only; non-ASCII (Telugu glyphs in
  // a tag) gets skipped so we don't accidentally promote half-tags.
  const matches = corpus.match(/#([A-Za-z0-9_]+)/g) ?? [];
  return matches
    .map((m) => m.slice(1).toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 40);
}
