import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiPulseScript } from '../entities/news-script.entity';
import { AiPulseMetric } from '../entities/metric.entity';
import {
  AiPulsePostmortem, AiPulsePostmortemContent,
} from '../entities/postmortem.entity';

const SYSTEM = `
You write a brief, candid postmortem for one published AI Pulse short.
Compare it against the rolling channel mean for its vertical and extract
reusable signals for future content.

If the script INCLUDED scenes (a per-scene cinematic breakdown), also
reason about which scene choices worked for THIS vertical. The scenes
JSON will be in the user prompt when available — when ABSENT, leave the
scene-related fields out (null/empty/omitted).

Output STRICT JSON ONLY:
{
  "worked": ["1-3 concrete things that worked"],
  "didntWork": ["1-3 things that fell flat"],
  "next": ["1-2 concrete things to try next"],
  "reusableHookPattern": "<1 sentence — a hook pattern worth repeating, or empty>",
  "winningThumbnailStyle": "<one of: data_reveal | product_screenshot | versus | identity_target | question_hook | visual_metaphor | bold_text | shocked_reaction | none>",
  "topicSignal": "<short phrase, e.g. 'AI funding round', or empty>",
  "winningHashtags": ["#tag1","#tag2"],

  // Scene-aware fields — ONLY populate when the user prompt included a SCENES BLOCK.
  // Set to null / 0 / empty if the script had no scenes.
  "sceneCount":       <int — total scenes, or 0/null if no scenes>,
  "openingShotType":  "<scene 01's shot type — e.g. 'close-up', 'wide establishing', 'over-shoulder'; empty if no scenes>",
  "moodArc":          "<comma-separated distinct moods across scenes; empty if no scenes>",
  "characterCount":   <int — distinct named characters across scenes, or 0/null if no scenes>,
  "scenePattern":     "<ONE specific 1-sentence observation about what scene choice clearly worked or fell flat for THIS video and THIS vertical; empty if no clear signal>"
}
Be specific (real numbers, real topic), not generic. Skip a field with "" / [] / null / 0 if you can't be honest about it.
`.trim();

@Injectable()
export class AiPulsePostmortemService {
  private readonly logger = new Logger(AiPulsePostmortemService.name);
  private readonly openai: OpenAI | null;

  constructor(
    @InjectRepository(AiPulseScript)
    private readonly scripts: Repository<AiPulseScript>,
    @InjectRepository(AiPulseMetric)
    private readonly metrics: Repository<AiPulseMetric>,
    @InjectRepository(AiPulsePostmortem)
    private readonly postmortems: Repository<AiPulsePostmortem>,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /**
   * Find scripts published ≥3 days ago with metrics + no postmortem
   * yet. Generate one per (LLM call). Cap at 50/run.
   */
  async runDailyBatch(): Promise<{ scanned: number; generated: number }> {
    if (!this.openai) {
      this.logger.warn('OPENAI_API_KEY not set — postmortem agent dormant');
      return { scanned: 0, generated: 0 };
    }
    const rows: Array<{ scriptId: string }> = await this.scripts.query(`
      SELECT s.id AS "scriptId"
        FROM ai_pulse_scripts s
       WHERE s.approval_status = 'published'
         AND s.published_at < NOW() - INTERVAL '3 days'
         AND EXISTS (SELECT 1 FROM ai_pulse_metrics m WHERE m.script_id = s.id)
         AND NOT EXISTS (SELECT 1 FROM ai_pulse_postmortems pm WHERE pm.script_id = s.id)
       ORDER BY s.published_at ASC
       LIMIT 50
    `);
    if (rows.length === 0) {
      this.logger.log('AI Pulse postmortem batch — nothing eligible');
      return { scanned: 0, generated: 0 };
    }
    let generated = 0;
    for (const r of rows) {
      try { await this.generateFor(r.scriptId); generated++; }
      catch (e) { this.logger.warn(`Postmortem for ${r.scriptId} failed: ${(e as Error).message}`); }
    }
    this.logger.log(`AI Pulse postmortem batch — ${generated}/${rows.length} written`);
    return { scanned: rows.length, generated };
  }

  async generateFor(scriptId: string): Promise<AiPulsePostmortem> {
    if (!this.openai) throw new Error('OPENAI_API_KEY not configured');
    const script = await this.scripts.findOne({ where: { id: scriptId } });
    if (!script) throw new NotFoundException('script not found');

    // Latest views per language, summed for total reach.
    const totalRow: Array<{ views: string }> = await this.metrics.query(`
      WITH latest_per_lang AS (
        SELECT DISTINCT ON (language) language, views, fetched_at
          FROM ai_pulse_metrics
         WHERE script_id = $1
         ORDER BY language, fetched_at DESC
      )
      SELECT COALESCE(SUM(views), 0)::text AS views FROM latest_per_lang
    `, [scriptId]);
    const views = Number(totalRow[0]?.views ?? 0);

    // Rolling mean within the SAME vertical over the last 60 days.
    const meanRow: Array<{ mean: string }> = await this.metrics.query(`
      WITH latest_per_lang AS (
        SELECT DISTINCT ON (script_id, language) script_id, language, views, fetched_at
          FROM ai_pulse_metrics
         ORDER BY script_id, language, fetched_at DESC
      ),
      totals AS (
        SELECT script_id, SUM(views) AS total_views, MAX(fetched_at) AS fetched_at
          FROM latest_per_lang
         GROUP BY script_id
      )
      SELECT COALESCE(AVG(t.total_views), 0)::text AS mean
        FROM totals t
        JOIN ai_pulse_scripts s ON s.id = t.script_id
       WHERE s.vertical = $1
         AND t.fetched_at > NOW() - INTERVAL '60 days'
    `, [script.vertical]);
    const mean = Number(meanRow[0]?.mean ?? 0);
    const liftLabel = mean > 0
      ? `${(views / mean).toFixed(2)}× vertical mean (${Math.round(mean)})`
      : 'no baseline yet';

    // Prefer LIVE YouTube title/description if available — captures
    // curator's manual edits including custom hashtags.
    const headline = script.live_youtube_title?.trim() || script.english_title || '(no title)';
    const description = script.live_youtube_description?.trim() ||
      (script.distribution_package as { youtube?: { description?: string } } | null)?.youtube?.description ||
      '';

    const user =
      `VERTICAL: ${script.vertical}\n` +
      `HEADLINE: ${headline}\n` +
      `HOOK: ${script.english_hook ?? ''}\n` +
      `SCRIPT EXCERPT: ${(script.english_full_script ?? '').slice(0, 1500)}\n` +
      `DESCRIPTION EXCERPT: ${description.slice(0, 500)}\n` +
      `STATUS: published, ${views} views — ${liftLabel}\n` +
      stringifyScenesForPostmortem(script.scenes) +
      `\nWrite the postmortem JSON now.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 900,
    });
    const content = JSON.parse(
      completion.choices[0]?.message?.content ?? '{}',
    ) as AiPulsePostmortemContent;
    const cost = costFor(completion.usage);
    const saved = await this.postmortems.save(
      this.postmortems.create({
        script_id: scriptId,
        vertical: script.vertical,
        content,
        model_used: 'gpt-4o',
        cost_usd: cost,
      }),
    );
    this.logger.log(
      `Postmortem for "${headline.slice(0, 40)}" — ${liftLabel} ($${cost.toFixed(4)})`,
    );
    return saved;
  }
}

function costFor(usage?: { prompt_tokens?: number; completion_tokens?: number }): number {
  return ((usage?.prompt_tokens ?? 0) / 1_000_000) * 2.5
       + ((usage?.completion_tokens ?? 0) / 1_000_000) * 10;
}

/**
 * Render the scenes payload as a compact block for the postmortem
 * prompt — gives the LLM enough signal to reason about scene patterns
 * (count, opening shot, mood arc, character count) without dumping the
 * full per-scene JSON into context. Empty string when the script had
 * no scenes — postmortem then skips the scene-aware fields cleanly.
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
  // Approximate distinct character count via cheap token heuristic on
  // character_dna strings (ALLCAPS tokens or "the <noun>" labels).
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
