import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShortScript } from '../entities/short-script.entity';
import { AqbShortMetric } from '../entities/short-metric.entity';
import {
  AqbShortPostmortem, AqbPostmortemContent,
} from '../entities/short-postmortem.entity';
import { AnthropicClientService } from '../services/anthropic-client.service';

const SYSTEM = `
You write a brief, candid postmortem for one published AI Quick Bytes short.
You compare it against the channel rolling mean and extract reusable signals
for future content.

Output STRICT JSON ONLY:
{
  "worked": ["<1-3 things that worked, concrete>"],
  "didntWork": ["<1-3 things that fell flat>"],
  "next": ["<1-2 concrete things to try next>"],
  "reusableHookPattern": "<1 sentence — a hook pattern worth repeating, or empty>",
  "winningThumbnailStyle": "<one of: shocked_reaction | clean | bold_text | visual_metaphor | brand_signature | none>",
  "topicSignal": "<short phrase describing the topic angle, e.g. 'OpenAI model release' — or empty>"
}
Be specific (real numbers, real topic), not generic. Skip a field with "" / [] if you can't be honest about it.
`.trim();

@Injectable()
export class AqbPostmortemAgent {
  private readonly logger = new Logger(AqbPostmortemAgent.name);

  constructor(
    @InjectRepository(ShortScript) private readonly scripts: Repository<ShortScript>,
    @InjectRepository(AqbShortMetric) private readonly metrics: Repository<AqbShortMetric>,
    @InjectRepository(AqbShortPostmortem) private readonly postmortems: Repository<AqbShortPostmortem>,
    private readonly anthropic: AnthropicClientService,
  ) {}

  /**
   * Find shorts published ≥3 days ago (via publishing_log) with metrics and
   * no postmortem yet. Generate one per. Conservative cap of 50/run.
   */
  async runDailyBatch(): Promise<{ scanned: number; generated: number }> {
    const rows: Array<{ scriptId: string }> = await this.scripts.query(`
      SELECT s.id AS "scriptId"
        FROM aqb_short_scripts s
       WHERE s.status = 'published'
         AND s."youtubeVideoId" IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM aqb_short_metrics m WHERE m."scriptId" = s.id
         )
         AND EXISTS (
           SELECT 1 FROM aqb_publishing_log pl
            WHERE pl."scriptId" = s.id
              AND pl.status = 'success'
              AND pl."publishedAt" < NOW() - INTERVAL '3 days'
         )
         AND NOT EXISTS (
           SELECT 1 FROM aqb_short_postmortems pm WHERE pm."scriptId" = s.id
         )
       ORDER BY s."createdAt" ASC
       LIMIT 50
    `);
    if (rows.length === 0) {
      this.logger.log('AQB postmortem batch — nothing eligible');
      return { scanned: 0, generated: 0 };
    }
    let generated = 0;
    for (const r of rows) {
      try {
        await this.generateFor(r.scriptId);
        generated++;
      } catch (e) {
        this.logger.warn(`AQB postmortem for ${r.scriptId} failed: ${(e as Error).message}`);
      }
    }
    this.logger.log(`AQB postmortem batch — ${generated}/${rows.length} written`);
    return { scanned: rows.length, generated };
  }

  async generateFor(scriptId: string): Promise<AqbShortPostmortem> {
    const script = await this.scripts.findOne({ where: { id: scriptId } });
    if (!script) throw new NotFoundException('Script not found');

    const latest = await this.metrics
      .createQueryBuilder('m')
      .where('m."scriptId" = :id', { id: scriptId })
      .orderBy('m."fetchedAt"', 'DESC')
      .limit(1)
      .getOne();
    const views = Number(latest?.views ?? 0);

    // Rolling mean across the last ~60 days of published shorts.
    const meanRow: Array<{ mean: string }> = await this.metrics.query(`
      WITH latest AS (
        SELECT DISTINCT ON ("scriptId") "scriptId", views, "fetchedAt"
          FROM aqb_short_metrics ORDER BY "scriptId", "fetchedAt" DESC
      )
      SELECT COALESCE(AVG(views), 0)::text AS mean
        FROM latest
       WHERE "fetchedAt" > NOW() - INTERVAL '60 days'
    `);
    const mean = Number(meanRow[0]?.mean ?? 0);
    const liftLabel = mean > 0
      ? `${(views / mean).toFixed(2)}× channel mean (${Math.round(mean)})`
      : 'no baseline yet';

    const user =
      `HOOK: ${script.hook}\n` +
      `BODY: ${script.body.slice(0, 1500)}\n` +
      `STATUS: published, ${views} views — ${liftLabel}\n` +
      `THUMBNAIL PROMPT (most recent): ${stringifyThumbnail(script.thumbnailPrompt)}\n\n` +
      `Write the postmortem JSON now.`;

    const r = await this.anthropic.completeJSON({
      system: SYSTEM,
      user,
      maxTokens: 900,
      temperature: 0.4,
    });
    let content: AqbPostmortemContent;
    try { content = JSON.parse(r.content) as AqbPostmortemContent; }
    catch { content = {}; }

    const cost = estimateCost(r.model, r.usage);
    const saved = await this.postmortems.save(
      this.postmortems.create({
        scriptId,
        content,
        modelUsed: r.model,
        costUsd: cost,
      }),
    );
    this.logger.log(
      `AQB postmortem for "${script.hook.slice(0, 40)}…" — ${liftLabel}` +
      ` ($${cost.toFixed(4)})`,
    );
    return saved;
  }

  async latestFor(scriptId: string): Promise<AqbShortPostmortem | null> {
    return this.postmortems.findOne({ where: { scriptId } });
  }
}

function stringifyThumbnail(tp: unknown): string {
  if (!tp || typeof tp !== 'object') return '(none)';
  const o = tp as { variations?: Array<{ style?: string; headline?: string }>; prompt?: string };
  if (Array.isArray(o.variations) && o.variations.length > 0) {
    return o.variations.map((v) => `${v.style}:"${v.headline ?? ''}"`).join(' / ');
  }
  return o.prompt ? o.prompt.slice(0, 140) : '(none)';
}

function estimateCost(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number },
): number {
  const rates: Record<string, [number, number]> = {
    'claude-sonnet-4-6': [3, 15],
    'claude-opus-4-7':   [15, 75],
    'claude-haiku-4-5-20251001': [1, 5],
  };
  const [inR, outR] = rates[model] ?? rates['claude-sonnet-4-6'];
  return ((usage.prompt_tokens ?? 0) / 1_000_000) * inR
       + ((usage.completion_tokens ?? 0) / 1_000_000) * outR;
}
