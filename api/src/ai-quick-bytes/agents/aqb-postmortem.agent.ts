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

If the script INCLUDED scenes (a per-scene cinematic breakdown), also reason
about which scene choices likely worked. The scenes JSON will be in the user
prompt when available — when ABSENT, leave the scene-related fields out
(null/empty/omitted).

Output STRICT JSON ONLY:
{
  "worked": ["<1-3 things that worked, concrete>"],
  "didntWork": ["<1-3 things that fell flat>"],
  "next": ["<1-2 concrete things to try next>"],
  "reusableHookPattern": "<1 sentence — a hook pattern worth repeating, or empty>",
  "winningThumbnailStyle": "<one of: data_reveal | product_screenshot | versus | identity_target | question_hook | visual_metaphor | bold_text | shocked_reaction | brand_signature | none>",
  "topicSignal": "<short phrase describing the topic angle, e.g. 'OpenAI model release' — or empty>",

  // Scene-aware fields — ONLY populate when the user prompt included a SCENES BLOCK.
  // Set to null / 0 / empty if the script had no scenes (most pre-cinematic videos).
  "sceneCount":       <int — total scenes in the video, or 0/null if no scenes>,
  "openingShotType":  "<the shot type of scene 01 — e.g. 'close-up', 'wide establishing', 'over-shoulder', 'detail'; empty if no scenes>",
  "moodArc":          "<comma-separated distinct moods across scenes — e.g. 'curiosity, awe, hope'; empty if no scenes>",
  "characterCount":   <int — number of distinct named characters across scenes, or 0/null if no scenes>,
  "scenePattern":     "<ONE specific 1-sentence observation about what scene choice clearly worked or fell flat for THIS video; empty if no scenes or no clear signal>"
}
Be specific (real numbers, real topic), not generic. Skip a field with "" / [] / null / 0 if you can't be honest about it.
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

    // Latest per language (one EN row + one TE row at most), summed for
    // this script's total reach.
    const totalRow: Array<{ views: string }> = await this.metrics.query(`
      WITH latest_per_lang AS (
        SELECT DISTINCT ON (language) language, views, "fetchedAt"
          FROM aqb_short_metrics
         WHERE "scriptId" = $1
         ORDER BY language, "fetchedAt" DESC
      )
      SELECT COALESCE(SUM(views), 0)::text AS views
        FROM latest_per_lang
    `, [scriptId]);
    const views = Number(totalRow[0]?.views ?? 0);

    // Rolling mean across the last ~60 days of published shorts, with
    // the same per-language SUM aggregation so the mean is apples-to-apples.
    const meanRow: Array<{ mean: string }> = await this.metrics.query(`
      WITH latest_per_lang AS (
        SELECT DISTINCT ON ("scriptId", language) "scriptId", language, views, "fetchedAt"
          FROM aqb_short_metrics
         ORDER BY "scriptId", language, "fetchedAt" DESC
      ),
      totals AS (
        SELECT "scriptId", SUM(views) AS total_views, MAX("fetchedAt") AS "fetchedAt"
          FROM latest_per_lang
         GROUP BY "scriptId"
      )
      SELECT COALESCE(AVG(total_views), 0)::text AS mean
        FROM totals
       WHERE "fetchedAt" > NOW() - INTERVAL '60 days'
    `);
    const mean = Number(meanRow[0]?.mean ?? 0);
    const liftLabel = mean > 0
      ? `${(views / mean).toFixed(2)}× channel mean (${Math.round(mean)})`
      : 'no baseline yet';

    // Prefer the LIVE YouTube title (curator's manual edits on YouTube
    // Studio) over the generated hook when available — that's the
    // version viewers actually saw, including any custom tags like
    // "#trending" the curator added at upload time.
    const headline = script.liveYoutubeTitle?.trim() || script.hook;
    const headlineSource = script.liveYoutubeTitle?.trim()
      ? 'live YouTube title'
      : 'generated hook';
    const teluguHeadline =
      script.liveTeluguYoutubeTitle?.trim() || script.teluguHook || null;
    const teluguLine = teluguHeadline
      ? `TELUGU TITLE (${script.liveTeluguYoutubeTitle?.trim() ? 'live' : 'generated'}): ${teluguHeadline}\n`
      : '';

    const user =
      `HEADLINE (${headlineSource}): ${headline}\n` +
      teluguLine +
      `BODY: ${script.body.slice(0, 1500)}\n` +
      `STATUS: published, ${views} views — ${liftLabel}\n` +
      `THUMBNAIL PROMPT (most recent): ${stringifyThumbnail(script.thumbnailPrompt)}\n` +
      stringifyScenesForPostmortem(script.scenes) +
      `\nWrite the postmortem JSON now.`;

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

/**
 * Render the scenes payload as a compact block for the postmortem
 * prompt — gives the LLM enough signal to reason about scene patterns
 * (count, opening shot, mood arc, character count) without dumping the
 * full 14×JSON cluster into the prompt.
 *
 * Returns '' when the script had no scenes (most pre-cinematic videos)
 * so the postmortem just skips the scene-aware fields.
 */
function stringifyScenesForPostmortem(scenes: unknown): string {
  if (!scenes || typeof scenes !== 'object') return '';
  const s = scenes as {
    scenes?: Array<{ shot?: string; mood?: string; subject?: string; character_dna?: string }>;
    scene_count?: number;
  };
  const arr = Array.isArray(s.scenes) ? s.scenes : [];
  if (arr.length === 0) return '';

  const sceneCount = s.scene_count ?? arr.length;
  const openingShot = (arr[0]?.shot ?? '').toString().slice(0, 120);
  const moods = Array.from(new Set(
    arr.map((sc) => (sc.mood ?? '').toString().trim()).filter(Boolean),
  )).slice(0, 6).join(', ');
  // Approximate distinct character count by inspecting character_dna
  // strings — counts the number of distinct ALLCAPS or Capitalised role
  // labels (ENGINEER, the founder, the researcher, etc.). Cheap heuristic.
  const characterTokens = new Set<string>();
  for (const sc of arr) {
    const dna = (sc.character_dna ?? '').toString();
    const matches = dna.match(/\b(?:[A-Z][A-Z_]{2,}|the [a-z]+)\b/g) ?? [];
    for (const m of matches) characterTokens.add(m.toLowerCase());
  }

  const lines = [
    '',
    'SCENES BLOCK (this video had cinematic scenes — reason about them):',
    `  scene_count: ${sceneCount}`,
    `  opening_shot: ${openingShot || '(unknown)'}`,
    `  distinct_moods: ${moods || '(none)'}`,
    `  approx_character_count: ${characterTokens.size}`,
    `  first_3_scenes_subjects:`,
    ...arr.slice(0, 3).map((sc, i) =>
      `    ${i + 1}. ${(sc.subject ?? '').toString().slice(0, 140)}`,
    ),
  ];
  return lines.join('\n') + '\n';
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
