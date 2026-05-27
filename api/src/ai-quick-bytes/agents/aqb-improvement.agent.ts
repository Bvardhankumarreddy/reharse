import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShortScript } from '../entities/short-script.entity';
import { AqbShortPostmortem, AqbPostmortemContent } from '../entities/short-postmortem.entity';
import { AqbMemoryService } from '../services/aqb-memory.service';
import { AqbMetricsFetcherService } from '../services/aqb-metrics-fetcher.service';

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
    const hashtagCounts = tally(
      winnerScripts.flatMap((s) => extractHashtags(s.distributionPackage)),
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

    this.logger.log(
      `AQB improvement — ${winnerIds.length}/${latest.length} winners; promoted ${promoted} memory(ies)` +
      ` (mean ${Math.round(mean)} views)`,
    );
    return { scanned: latest.length, winners: winnerIds.length, promoted };
  }
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
