import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsItem } from '../entities/news-item.entity';
import { ShortScript } from '../entities/short-script.entity';
import { AnthropicClientService } from './anthropic-client.service';
import { AqbMemoryService } from './aqb-memory.service';

export type IdeaAngle =
  | 'founder_origin'        // backstage: the engineer / founder who built it
  | 'industry_shift'        // landscape: what this means for the AI race
  | 'user_impact'           // forward: what changes for end-users tomorrow
  | 'technical_backstage'   // mechanism: how this actually works
  | 'skeptic_view'          // counter: why this might not matter
  | 'consumer_story'        // ground-level: a non-tech person feels the change
  | 'business_implication'  // economic / strategic angle
  | 'safety_society';       // ethics / regulation / risk angle

export interface IdeaSelection {
  selected_angle:      IdeaAngle;
  protagonist_suggestion: string;          // the role the script agent should use
  emotional_progression:  string;          // "from → to" arc
  core_message:           string;          // 1-sentence north star
  strategic_brief:        string;          // 3-5 sentence brief for the script agent
  alternates: Array<{
    angle:    IdeaAngle;
    one_line: string;
    why_not:  string;
  }>;
  reasoning:           string;             // 1-sentence why this angle won
}

/**
 * Picks the BEST narrative angle for a news item before the script agent
 * runs. The user's "highest-leverage" recommendation: content strategy
 * matters more than prompt engineering. The same news item could be told
 * as a founder story, a user-impact story, a skeptic counter, etc. —
 * each lands very differently with the audience.
 *
 * This agent:
 *   1. Looks at the news item + recent history (avoid repeats)
 *   2. Generates 3-5 candidate angles with one-line hooks
 *   3. Scores each on (curiosity gap × audience fit × novelty vs history
 *      × retention prediction)
 *   4. Picks ONE and emits a strategic brief the script agent consumes
 *
 * Cost: ~$0.005 per news item. Non-fatal — if it fails, the script
 * agent falls back to its own implicit angle selection (current behavior).
 */
@Injectable()
export class IdeaSelectionService {
  private readonly logger = new Logger(IdeaSelectionService.name);

  /** How many recent scripts to feed in as "do not repeat these angles". */
  private static readonly RECENT_WINDOW = 12;

  constructor(
    @InjectRepository(ShortScript) private readonly scripts: Repository<ShortScript>,
    private readonly anthropic: AnthropicClientService,
    private readonly memory: AqbMemoryService,
  ) {}

  async selectFor(item: NewsItem): Promise<IdeaSelection | null> {
    if (!this.anthropic.isConfigured()) {
      this.logger.warn('IdeaSelection skipped — anthropic not configured');
      return null;
    }

    // Recent angles + protagonists — feed as "avoid these" so the
    // selection has variety baked in (not just the script agent).
    const recent = await this.scripts
      .createQueryBuilder('s')
      .select(['s.protagonist', 's."emotionalProgression"', 's."coreMessage"'])
      .where('s.protagonist IS NOT NULL')
      .orderBy('s."createdAt"', 'DESC')
      .limit(IdeaSelectionService.RECENT_WINDOW)
      .getRawMany<{ s_protagonist: string; emotionalProgression: string; coreMessage: string }>();

    const recentBlock = recent.length === 0 ? '' :
      `\nRECENT SCRIPTS (do NOT pick an angle that re-uses these patterns):\n` +
      recent.slice(0, 8).map((r, i) =>
        `  ${i + 1}. protagonist=${r.s_protagonist ?? '(n/a)'} ` +
        `· arc=${r.emotionalProgression ?? '(n/a)'} ` +
        `· msg=${(r.coreMessage ?? '').slice(0, 80)}`,
      ).join('\n');

    // Pull learned patterns the script agent would consume so the angle
    // doesn't fight against them. The memory block applies to script
    // generation — feeding it here gives the selector context for which
    // angles tend to work for THIS channel.
    const memoryBlock = this.memory.format(await this.memory.relevantFor('script', 6));

    const body = item.summary || item.content?.slice(0, 1500) || '(no summary)';
    const system = this.buildSystemPrompt();
    const user =
      `NEWS ITEM\n` +
      `Title:    ${item.title}\n` +
      `Source:   ${item.source?.name ?? 'unknown'}\n` +
      `Body:     ${body.slice(0, 2000)}\n` +
      recentBlock +
      (memoryBlock ? `\n\n${memoryBlock}` : '') +
      `\n\nGenerate 3-5 candidate angles, score each, pick the winner. JSON only.`;

    try {
      const { content: raw, usage, model } = await this.anthropic.completeJSON({
        system,
        user,
        temperature: 0.7,
        maxTokens: 1500,
      });
      const parsed = JSON.parse(raw || '{}') as Partial<IdeaSelection>;
      const selection = this.normalize(parsed);
      if (!selection) {
        this.logger.warn(`IdeaSelection returned empty/malformed for ${item.id}`);
        return null;
      }
      const inTok = usage?.prompt_tokens ?? 0;
      const outTok = usage?.completion_tokens ?? 0;
      const cost = (inTok / 1_000_000) * 3 + (outTok / 1_000_000) * 15; // sonnet pricing
      this.logger.log(
        `Idea selected for "${item.title.slice(0, 50)}" — ` +
        `angle=${selection.selected_angle} · ${model} · $${cost.toFixed(4)}`,
      );
      return selection;
    } catch (e) {
      this.logger.warn(`IdeaSelection failed for ${item.id}: ${(e as Error).message}`);
      return null;
    }
  }

  private buildSystemPrompt(): string {
    return `
You are the CONTENT STRATEGIST for AetherStackAI's "AI Quick Bytes" — a
daily AI news shorts channel. Audience: educated Indian tech viewers.

YOUR JOB
========
For a given news item, decide WHICH ANGLE the script writer should use.
The same news could be told 5 different ways; each lands very differently
with the audience. You pick the one with the strongest retention pull
for THIS audience + THIS story.

You do NOT write the script. You write the strategic brief the script
writer obeys.

THE ANGLE PALETTE (pick ONE; mix is fine for alternates)
========================================================
- founder_origin       — backstage: the maker who built this
- industry_shift       — landscape: what this means for the AI race
- user_impact          — forward: what changes for end-users tomorrow
- technical_backstage  — mechanism: how this actually works under the hood
- skeptic_view         — counter: why this might NOT matter / hidden risk
- consumer_story       — ground-level: a non-tech person feels the change
- business_implication — economic / strategic / market angle
- safety_society       — ethics / regulation / risk

SELECTION CRITERIA (score each candidate in your head; pick the top)
=====================================================================
- Curiosity gap   — how strong is the hook from this angle?
- Audience fit    — do educated Indian tech viewers care about THIS framing?
- Novelty         — does this angle DIFFER from the recent scripts shown to you?
- Retention prediction — would viewers stay until the reveal?
- Story tension   — is there a real arc, or is it just information?

HARD RULES
==========
- NEVER pick an angle / protagonist archetype already used in the
  RECENT SCRIPTS block (that's the whole point of varying).
- The protagonist_suggestion should match the angle (consumer_story
  → an end-user; technical_backstage → a researcher / engineer; etc.).
- emotional_progression is a TWO-emotion arc ("from → to"), never
  a single emotion.
- core_message is ONE sentence the viewer should remember when the
  video ends.
- strategic_brief is 3-5 sentences telling the script writer:
  (a) what angle to take, (b) who the protagonist is, (c) what the
  emotional journey is, (d) what the payoff lands on. NOT script copy.

OUTPUT (STRICT JSON ONLY — no preamble, no markdown fences)
============================================================
{
  "selected_angle":        "<one of the 8 angles>",
  "protagonist_suggestion":"<generic role + setting, e.g. 'an English teacher in Pune'>",
  "emotional_progression": "<from → to, e.g. 'skepticism → relief'>",
  "core_message":          "<ONE sentence the viewer should remember>",
  "strategic_brief":       "<3-5 sentences for the script writer>",
  "alternates": [
    { "angle":"<other angle>", "one_line":"<a sentence-long pitch>", "why_not":"<one reason>" },
    { "angle":"<other angle>", "one_line":"<...>", "why_not":"<...>" }
  ],
  "reasoning": "<1 sentence: why the selected angle wins for this story>"
}
`.trim();
  }

  private normalize(p: Partial<IdeaSelection>): IdeaSelection | null {
    const angle = p.selected_angle;
    const valid = new Set<IdeaAngle>([
      'founder_origin', 'industry_shift', 'user_impact',
      'technical_backstage', 'skeptic_view', 'consumer_story',
      'business_implication', 'safety_society',
    ]);
    if (!angle || !valid.has(angle as IdeaAngle)) {
      // Defaulting silently to user_impact is acceptable — most-versatile
      // angle. The script agent gets a brief either way.
      this.logger.warn(`IdeaSelection: invalid angle "${angle}" — defaulting to user_impact`);
    }
    const selected_angle = (valid.has(angle as IdeaAngle) ? angle : 'user_impact') as IdeaAngle;
    const protagonist = (p.protagonist_suggestion ?? '').toString().trim();
    const arc         = (p.emotional_progression  ?? '').toString().trim();
    const msg         = (p.core_message           ?? '').toString().trim();
    const brief       = (p.strategic_brief        ?? '').toString().trim();
    if (!protagonist || !arc || !msg || !brief) return null;
    return {
      selected_angle,
      protagonist_suggestion: protagonist,
      emotional_progression:  arc,
      core_message:           msg,
      strategic_brief:        brief,
      alternates: (p.alternates ?? []).slice(0, 4).map((a) => ({
        angle:    (valid.has(a.angle as IdeaAngle) ? a.angle : 'user_impact') as IdeaAngle,
        one_line: String(a.one_line ?? '').trim().slice(0, 200),
        why_not:  String(a.why_not ?? '').trim().slice(0, 200),
      })),
      reasoning: (p.reasoning ?? '').toString().trim().slice(0, 280),
    };
  }
}
