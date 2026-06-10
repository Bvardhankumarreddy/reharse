import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiPulseNewsItem, AiPulseVertical } from '../entities/news-item.entity';
import { VERTICALS } from '../config/verticals.config';

@Injectable()
export class AiPulseScoringService {
  private readonly logger = new Logger(AiPulseScoringService.name);
  private readonly openai: OpenAI | null;

  constructor(
    @InjectRepository(AiPulseNewsItem)
    private readonly news: Repository<AiPulseNewsItem>,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /**
   * Score all pending items for a vertical, mark the TOP N (per
   * vertical config) as 'selected', and return the selected items in
   * score order. Mirrors AQB's generateForTopStories(limit) pattern.
   *
   * Returns empty array if nothing eligible / vertical not configured.
   */
  async scoreVerticalForToday(
    vertical: AiPulseVertical,
    limit?: number,
  ): Promise<AiPulseNewsItem[]> {
    if (!this.openai) {
      this.logger.warn('OPENAI_API_KEY not set — scoring dormant');
      return [];
    }
    const spec = VERTICALS[vertical];
    if (!spec) {
      this.logger.warn(`No spec for vertical ${vertical}`);
      return [];
    }
    // Clamp limit: caller override ∈ [1, 10], default to spec.top_n_per_run.
    const topN = Math.max(1, Math.min(10, limit ?? spec.top_n_per_run ?? 1));

    // Look back 72 hours so a Monday cron can still pick a Saturday story.
    const cutoff = new Date(Date.now() - 72 * 3600 * 1000);
    const candidates = await this.news.find({
      where: { vertical, status: 'pending', published_at: MoreThanOrEqual(cutoff) },
      order: { published_at: 'DESC' },
      take: 30,
    });
    if (candidates.length === 0) {
      this.logger.log(`AI Pulse scoring (${vertical}): 0 candidates`);
      return [];
    }

    for (const item of candidates) {
      try {
        const scores = await this.scoreItem(item, spec.india_mix_percent);
        await this.news.update(item.id, {
          relevance_score: scores.relevance,
          freshness_score: scores.freshness,
          india_relevance_score: scores.india_relevance,
          total_score: scores.total,
          status: 'scored',
        });
      } catch (e) {
        this.logger.warn(`Score for ${item.id} failed: ${(e as Error).message}`);
      }
    }

    // Pick top N scored items, mark them selected.
    const top = await this.news
      .createQueryBuilder('n')
      .where('n.vertical = :v', { v: vertical })
      .andWhere('n.status = :s', { s: 'scored' })
      .andWhere('n.published_at >= :cutoff', { cutoff })
      .orderBy('n.total_score', 'DESC')
      .limit(topN)
      .getMany();
    for (const it of top) {
      await this.news.update(it.id, { status: 'selected' });
    }
    this.logger.log(
      `AI Pulse selected ${top.length}/${candidates.length} for ${vertical}: ` +
      top.map((t) => `"${t.headline.slice(0, 40)}…" (${t.total_score})`).join(' · '),
    );
    return top;
  }

  /** Public helper: score a single item by id (admin trigger path). */
  async scoreItemById(id: string): Promise<AiPulseNewsItem | null> {
    const item = await this.news.findOne({ where: { id } });
    if (!item) return null;
    const spec = VERTICALS[item.vertical];
    if (!spec || !this.openai) return item;
    const scores = await this.scoreItem(item, spec.india_mix_percent);
    await this.news.update(id, {
      relevance_score: scores.relevance,
      freshness_score: scores.freshness,
      india_relevance_score: scores.india_relevance,
      total_score: scores.total,
      status: 'scored',
    });
    return this.news.findOne({ where: { id } });
  }

  private async scoreItem(
    item: AiPulseNewsItem, indiaMixPercent: number,
  ): Promise<{ relevance: number; freshness: number; india_relevance: number; total: number }> {
    const prompt =
      `Score this AI / tech news item on 3 dimensions (0.0 to 1.0):\n\n` +
      `VERTICAL: ${item.vertical}\n` +
      `INDIA-RELEVANCE TARGET: ${indiaMixPercent}% of stories should have a strong India angle.\n` +
      `HEADLINE: ${item.headline}\n` +
      `SUMMARY: ${item.summary ?? '(none)'}\n` +
      `PUBLISHED: ${item.published_at?.toISOString() ?? 'unknown'}\n\n` +
      `Score:\n` +
      `1. RELEVANCE: Is this important / significant news for the vertical?\n` +
      `2. FRESHNESS: How time-sensitive is this? (>24h old = lower)\n` +
      `3. INDIA_RELEVANCE: Does this matter to an Indian audience?\n\n` +
      `Output strict JSON only:\n` +
      `{"relevance":0.0,"freshness":0.0,"india_relevance":0.0,"reasoning":"1 sentence"}`;

    const completion = await this.openai!.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 200,
    });
    const txt = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(txt) as {
      relevance?: number; freshness?: number; india_relevance?: number;
    };
    const r = clamp01(parsed.relevance);
    const f = clamp01(parsed.freshness);
    const i = clamp01(parsed.india_relevance);
    // World-first weighting: relevance + freshness dominate the score.
    // India relevance contributes only a small bonus proportional to the
    // vertical's india_mix_percent (default 20% → 0.10 India weight max).
    // ai_education at 50% gets a stronger India bonus by design.
    const indiaWeight = indiaMixPercent / 100;
    const total =
      r * 0.60 +
      f * 0.30 +
      i * (0.10 * indiaWeight * 2);   // max 0.10 at indiaMix=50; 0.04 at indiaMix=20
    return { relevance: r, freshness: f, india_relevance: i, total: Math.min(1, total) };
  }
}

function clamp01(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
