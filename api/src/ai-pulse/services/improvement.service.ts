import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiPulseScript } from '../entities/news-script.entity';
import { AiPulsePostmortem } from '../entities/postmortem.entity';
import { AiPulseVertical } from '../entities/news-item.entity';
import { AiPulseMetricsFetcherService } from './metrics-fetcher.service';
import { AiPulseMemoryService } from './memory.service';
import { VERTICAL_KEYS } from '../config/verticals.config';

/**
 * Mines winning patterns from postmortems of shorts that beat their
 * vertical's rolling mean by ≥1.5×. Promotes patterns into memories
 * which the script + thumbnail + distribution agents read at gen-time.
 *
 * Conservative by design:
 *   - Skips verticals with <3 published shorts (not enough signal).
 *   - Skips when winner count is 0.
 *   - promoteUnique() dedupes on content hash so re-runs don't accumulate noise.
 */
@Injectable()
export class AiPulseImprovementService {
  private static readonly LIFT = 1.5;

  private readonly logger = new Logger(AiPulseImprovementService.name);

  constructor(
    @InjectRepository(AiPulseScript) private readonly scripts: Repository<AiPulseScript>,
    @InjectRepository(AiPulsePostmortem) private readonly postmortems: Repository<AiPulsePostmortem>,
    private readonly metricsFetcher: AiPulseMetricsFetcherService,
    private readonly memorySvc: AiPulseMemoryService,
  ) {}

  async runDaily(): Promise<{ scanned: number; winners: number; promoted: number }> {
    const latest = await this.metricsFetcher.latestPerShort();
    if (latest.length === 0) {
      this.logger.log('AI Pulse improvement — no metrics yet');
      return { scanned: 0, winners: 0, promoted: 0 };
    }

    let totalPromoted = 0;
    let totalWinners = 0;

    for (const vertical of VERTICAL_KEYS) {
      const verticalShorts = latest.filter((s) => s.vertical === vertical);
      if (verticalShorts.length < 3) continue;
      const mean = verticalShorts.reduce((sum, s) => sum + s.views, 0) / verticalShorts.length;
      if (mean <= 0) continue;

      const winners = verticalShorts.filter((s) => s.views >= mean * AiPulseImprovementService.LIFT);
      if (winners.length === 0) {
        this.logger.log(
          `AI Pulse improvement (${vertical}) — 0 winners above ${(AiPulseImprovementService.LIFT * 100).toFixed(0)}% mean (${Math.round(mean)} views)`,
        );
        continue;
      }
      totalWinners += winners.length;

      const winnerIds = winners.map((w) => w.scriptId);
      const [winnerScripts, winnerPostmortems] = await Promise.all([
        this.scripts.find({ where: { id: In(winnerIds) } }),
        this.postmortems.find({ where: { script_id: In(winnerIds), vertical: vertical as AiPulseVertical } }),
      ]);

      const promoted = await this.mineAndPromote(vertical, winnerScripts, winnerPostmortems);
      totalPromoted += promoted;
      this.logger.log(
        `AI Pulse improvement (${vertical}) — ${winners.length}/${verticalShorts.length} winners; promoted ${promoted} memory(ies) (mean ${Math.round(mean)} views)`,
      );
    }
    return { scanned: latest.length, winners: totalWinners, promoted: totalPromoted };
  }

  private async mineAndPromote(
    vertical: string,
    winnerScripts: AiPulseScript[],
    postmortems: AiPulsePostmortem[],
  ): Promise<number> {
    let promoted = 0;
    const v = vertical as AiPulseVertical;
    const evidence = winnerScripts.map((s) => s.id);

    // 1) Hook patterns — most-cited reusableHookPattern strings.
    const hookCounts = tally(
      postmortems
        .map((p) => (p.content.reusableHookPattern ?? '').trim())
        .filter(Boolean),
    );
    const topHook = sortedTopKey(hookCounts);
    if (topHook && hookCounts[topHook] >= 2) {
      const m = await this.memorySvc.promoteUnique(
        v, 'hook_pattern',
        `${topHook} (cited ${hookCounts[topHook]}× across winners)`,
        ['script'], evidence,
      );
      if (m) promoted++;
    }

    // 2) Topic signals — most-cited topicSignal phrases.
    const topicCounts = tally(
      postmortems.map((p) => (p.content.topicSignal ?? '').trim()).filter(Boolean),
    );
    const topTopic = sortedTopKey(topicCounts);
    if (topTopic && topicCounts[topTopic] >= 2) {
      const m = await this.memorySvc.promoteUnique(
        v, 'topic_signal',
        `Topic angle that worked: ${topTopic} (${topicCounts[topTopic]} winner(s))`,
        ['script'], evidence,
      );
      if (m) promoted++;
    }

    // 3) Thumbnail styles — most-cited winningThumbnailStyle.
    const thumbCounts = tally(
      postmortems
        .map((p) => (p.content.winningThumbnailStyle ?? '').trim())
        .filter((t) => t && t !== 'none'),
    );
    const topThumb = sortedTopKey(thumbCounts);
    if (topThumb && thumbCounts[topThumb] >= 2) {
      const m = await this.memorySvc.promoteUnique(
        v, 'thumbnail_style',
        `${topThumb} wins in ${vertical} (${thumbCounts[topThumb]} of ${postmortems.length} winners)`,
        ['thumbnail'], evidence,
      );
      if (m) promoted++;
    }

    // 4) Winning hashtags — from postmortems + LIVE YouTube titles/descriptions
    //    + the LLM-generated distribution package. Lowercase + dedup.
    const tagCounts = tally([
      ...postmortems.flatMap((p) => (p.content.winningHashtags ?? [])),
      ...winnerScripts.flatMap((s) => extractLiveHashtags(s)),
      ...winnerScripts.flatMap((s) => extractDistHashtags(s.distribution_package as Record<string, unknown> | null)),
    ].map(normTag).filter(Boolean));
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => `#${t}`);
    if (topTags.length > 0) {
      const m = await this.memorySvc.promoteUnique(
        v, 'hashtag',
        `Hashtags correlated with wins: ${topTags.join(' ')}. Prefer including these when relevant.`,
        ['distribution'], evidence,
      );
      if (m) promoted++;
    }

    return promoted;
  }
}

// ── small utils ────────────────────────────────────────────────────────
function tally(arr: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of arr) {
    const k = x.toLowerCase().trim();
    if (!k) continue;
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
function normTag(t: string): string {
  return String(t).replace(/^#/, '').trim().toLowerCase();
}
function extractDistHashtags(pkg: Record<string, unknown> | null): string[] {
  if (!pkg) return [];
  const ig = (pkg.instagram as { hashtags?: string[] } | undefined)?.hashtags ?? [];
  const li = (pkg.linkedin as { hashtags?: string[] } | undefined)?.hashtags ?? [];
  const yt = (pkg.youtube as { tags?: string[] } | undefined)?.tags ?? [];
  return [...ig, ...li, ...yt]
    .map((t) => String(t).replace(/^#/, '').trim().toLowerCase())
    .filter((t) => t && t.length <= 40);
}
function extractLiveHashtags(s: AiPulseScript): string[] {
  const corpus = [
    s.live_youtube_title ?? '',
    s.live_youtube_description ?? '',
    s.live_telugu_youtube_title ?? '',
    s.live_telugu_youtube_description ?? '',
  ].join(' ');
  if (!corpus.trim()) return [];
  const matches = corpus.match(/#([A-Za-z0-9_]+)/g) ?? [];
  return matches.map((m) => m.slice(1).toLowerCase()).filter((t) => t && t.length <= 40);
}
