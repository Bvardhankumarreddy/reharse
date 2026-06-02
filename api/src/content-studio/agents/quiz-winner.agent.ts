import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { QuizBundle } from '../entities/quiz-bundle.entity';
import {
  QuizWinnerAnnouncement, QuizWinner, WinnerPosts,
  WinnerThumbnailVariation,
} from '../entities/quiz-winner-announcement.entity';
import { ModelRouterService } from '../services/model-router.service';
import { SOCIAL_LINKS } from '../services/social-footer';

const HASHTAG_MIN_IG_LI = 10;  // winners aren't promo — IG/LinkedIn ≥10 is fine
const FALLBACK_TAGS = [
  '#AetherStackAI', '#AIQuiz', '#WeeklyQuiz', '#TechIndia',
  '#LearnAI', '#AIEducation', '#QuizWinners', '#AIIndia',
  '#TechQuiz', '#AILearning', '#AICourse', '#DeveloperTools',
];

const WINNER_POSTS_SYSTEM = `
You write QUIZ WINNER ANNOUNCEMENT posts for AetherStackAI (host: Vardhan).
Each post celebrates 1-3 winners of a specific weekly quiz and hypes the
next quiz.

ENERGY: celebratory but not corny. Highlight speed + perfect scores.
Credit ALL winners by name. Use 🥇🥈🥉. Sign off as Vardhan.

URL placeholders — use exact tokens:
{{YOUTUBE_URL}} {{INSTAGRAM_URL}} {{LINKEDIN_URL}} {{WHATSAPP_CHANNEL}}
{{REHEARSE_URL}}

PER-PLATFORM RULES:
  ▶ YOUTUBE COMMUNITY — Excited opener with stats. List winners with
    score + time + prize. Tease next Saturday quiz. Subscribe CTA.
  ▶ INSTAGRAM — Punchy caption + emojis + 10-15 hashtags.
  ▶ LINKEDIN — Professional, analytical tone (what the speed shows
    about skill). 4-6 professional hashtags.
  ▶ WHATSAPP CHANNEL — *Bold* + emojis. All winners. Prize confirmation.
    Next quiz date. Sign "— Vardhan".
  ▶ WHATSAPP STATUS — ≤200 chars, top winner highlight + next quiz link.

DO NOT invent winners. Use exactly what's in the WINNERS list.

OUTPUT STRICT JSON ONLY:
{
  "youtube_community": "<full post>",
  "instagram":        { "caption": "...", "hashtags": ["#..."] },
  "linkedin":         { "body":    "...", "hashtags": ["#..."] },
  "whatsapp_channel": "<full post>",
  "whatsapp_status":  "<≤200 chars>"
}
Output the JSON object only — no prose, no markdown fences.
`.trim();

const WINNER_THUMBNAILS_SYSTEM = `
You write WINNER CELEBRATION thumbnail prompts for ChatGPT/DALL-E.
Generate EXACTLY 3 variations, one per style:

  1. "podium" — Gold/silver/bronze bars stacked, winner names+scores+times,
     confetti burst, trophy icon center top.
  2. "speed_highlight" — Top winner's face/silhouette, HUGE time number
     (e.g. "22 SECONDS"), motion lines, "PERFECT SCORE" subtitle.
  3. "hall_of_fame" — Champions stacked vertically each in their own
     gold frame, premium magazine aesthetic, quiz number + topic.

BRAND PALETTE: Dark Navy #0A0E27 (60%), Cyan #00D4FF (accents),
Gold #FFD700 (winner highlights), white for text.

EVERY prompt MUST include composition + lighting (cyan rim, gold
spotlight) + 60%+ negative space + aspect ratio (1:1 square 1080x1080) +
brand colors. 150-200 words per prompt.

OUTPUT STRICT JSON ONLY:
{
  "variations": [
    {"style": "podium",          "headline": "<≤5 WORDS ALL CAPS>", "prompt": "<150-200 word prompt>", "reasoning": "<1 sentence>", "estimated_ctr_score": <1-100>},
    {"style": "speed_highlight", "headline": "<≤5 WORDS ALL CAPS>", "prompt": "<150-200 word prompt>", "reasoning": "<1 sentence>", "estimated_ctr_score": <1-100>},
    {"style": "hall_of_fame",    "headline": "<≤5 WORDS ALL CAPS>", "prompt": "<150-200 word prompt>", "reasoning": "<1 sentence>", "estimated_ctr_score": <1-100>}
  ]
}
Output the JSON object only — no prose, no markdown fences.
`.trim();

interface LlmPosts {
  youtube_community?: unknown;
  instagram?: { caption?: unknown; hashtags?: unknown };
  linkedin?:  { body?: unknown;    hashtags?: unknown };
  whatsapp_channel?: unknown;
  whatsapp_status?: unknown;
}
interface LlmThumbs {
  variations?: Array<{
    style?: unknown; headline?: unknown; prompt?: unknown;
    reasoning?: unknown; estimated_ctr_score?: unknown;
  }>;
}

function asString(v: unknown, max = 5000): string {
  return String(v ?? '').slice(0, max).trim();
}
function asStringArr(v: unknown, max = 30): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x).trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t.replace(/\s+/g, '')}`))
    .slice(0, max);
}
function topUpTags(tags: string[], min: number): string[] {
  if (tags.length >= min) return tags;
  const have = new Set(tags.map((t) => t.toLowerCase()));
  for (const t of FALLBACK_TAGS) {
    if (tags.length >= min) break;
    if (have.has(t.toLowerCase())) continue;
    tags.push(t); have.add(t.toLowerCase());
  }
  return tags;
}
function joinTags(tags: string[]): string { return tags.join(' '); }

function inject(s: string): string {
  return s
    .replace(/\{\{YOUTUBE_URL\}\}/g,     SOCIAL_LINKS.youtube)
    .replace(/\{\{INSTAGRAM_URL\}\}/g,   SOCIAL_LINKS.instagram)
    .replace(/\{\{LINKEDIN_URL\}\}/g,    SOCIAL_LINKS.linkedin)
    .replace(/\{\{WHATSAPP_CHANNEL\}\}/g, SOCIAL_LINKS.whatsapp)
    .replace(/\{\{REHEARSE_URL\}\}/g,    SOCIAL_LINKS.site);
}

/** Sanitise + sort winners by rank, drop garbage. */
function normaliseWinners(raw: unknown): QuizWinner[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w, i): QuizWinner | null => {
      const o = (w ?? {}) as Record<string, unknown>;
      const rank = Math.round(Number(o.rank ?? i + 1));
      const name = String(o.name ?? '').trim().slice(0, 120);
      const score = Math.max(0, Math.round(Number(o.score ?? 0)));
      const maxScore = Math.max(1, Math.round(Number(o.maxScore ?? o.max_score ?? score)));
      const timeSeconds = Math.max(0, Math.round(Number(o.timeSeconds ?? o.time_seconds ?? 0)));
      const prizeInr = Math.max(0, Math.round(Number(o.prizeInr ?? o.prize_inr ?? 0)));
      if (!name) return null;
      return { rank, name, score, maxScore, timeSeconds, prizeInr };
    })
    .filter((w): w is QuizWinner => w !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 10);
}

@Injectable()
export class QuizWinnerAgent {
  private readonly logger = new Logger(QuizWinnerAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan)
    private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(QuizBundle)
    private readonly bundleRepo: Repository<QuizBundle>,
    @InjectRepository(QuizWinnerAnnouncement)
    private readonly winnerRepo: Repository<QuizWinnerAnnouncement>,
    private readonly router: ModelRouterService,
  ) {}

  /** Generate posts + thumbnails for a plan's quiz winners. Upserts one row per plan. */
  async generate(planId: string, input: {
    winners: unknown;
    totalParticipants?: number;
    speedHighlight?: string;
    quizTopic?: string;
    quizNumber?: number;
  }): Promise<QuizWinnerAnnouncement> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const winners = normaliseWinners(input.winners);
    if (winners.length === 0) {
      throw new BadRequestException('No valid winners supplied');
    }

    // Quiz number / topic precedence: explicit input > bundle metadata > plan series week.
    const bundle = await this.bundleRepo.findOne({
      where: { planId },
      order: { createdAt: 'DESC' },
    });
    const quizNumber = input.quizNumber
      ?? bundle?.quizWeek
      ?? plan.seriesWeekNumber
      ?? 1;
    const quizTopic = input.quizTopic
      ?? bundle?.title
      ?? plan.theme
      ?? `Quiz #${quizNumber}`;

    // ── Generate posts + thumbnails in parallel (1 router call each). ──
    const [postsRes, thumbsRes] = await Promise.all([
      this.generatePosts(plan, brand, {
        quizNumber, quizTopic,
        winners,
        totalParticipants: input.totalParticipants,
        speedHighlight: input.speedHighlight,
      }),
      this.generateThumbnails(plan, brand, {
        quizNumber, quizTopic, winners,
        speedHighlight: input.speedHighlight,
      }),
    ]);

    // Upsert — one announcement per plan (overwrite on regenerate).
    await this.winnerRepo.delete({ planId });
    const saved = await this.winnerRepo.save(
      this.winnerRepo.create({
        planId,
        brandId: brand.id,
        quizNumber,
        quizTopic,
        totalParticipants: input.totalParticipants ?? null,
        speedHighlight: input.speedHighlight ?? null,
        winners,
        posts: postsRes.posts,
        thumbnailPrompts: thumbsRes.variations,
        postsModel: postsRes.model,
        thumbnailsModel: thumbsRes.model,
        postsCostUsd: String(postsRes.costUsd),
        thumbnailsCostUsd: String(thumbsRes.costUsd),
        status: 'generated',
      }),
    );

    await this.planRepo.update(plan.id, {
      totalCostUsd:
        Number(plan.totalCostUsd ?? 0) + postsRes.costUsd + thumbsRes.costUsd,
    });

    this.logger.log(
      `Quiz winners plan=${planId} #${quizNumber} — ${winners.length} winners, ` +
      `posts=$${postsRes.costUsd.toFixed(4)}, thumbs=$${thumbsRes.costUsd.toFixed(4)}`,
    );
    return saved;
  }

  async latest(planId: string): Promise<QuizWinnerAnnouncement | null> {
    return this.winnerRepo.findOne({
      where: { planId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Regenerate only the posts (keep winners + thumbnails). */
  async regeneratePosts(planId: string): Promise<QuizWinnerAnnouncement> {
    const cur = await this.latest(planId);
    if (!cur) throw new NotFoundException('No winner announcement yet');
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const r = await this.generatePosts(plan, brand, {
      quizNumber: cur.quizNumber,
      quizTopic: cur.quizTopic ?? `Quiz #${cur.quizNumber}`,
      winners: cur.winners,
      totalParticipants: cur.totalParticipants ?? undefined,
      speedHighlight: cur.speedHighlight ?? undefined,
    });
    cur.posts = r.posts;
    cur.postsModel = r.model;
    cur.postsCostUsd = String(Number(cur.postsCostUsd) + r.costUsd);
    await this.winnerRepo.save(cur);
    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + r.costUsd,
    });
    return cur;
  }

  /** Regenerate only the thumbnail prompts. */
  async regenerateThumbnails(planId: string): Promise<QuizWinnerAnnouncement> {
    const cur = await this.latest(planId);
    if (!cur) throw new NotFoundException('No winner announcement yet');
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const r = await this.generateThumbnails(plan, brand, {
      quizNumber: cur.quizNumber,
      quizTopic: cur.quizTopic ?? `Quiz #${cur.quizNumber}`,
      winners: cur.winners,
      speedHighlight: cur.speedHighlight ?? undefined,
    });
    cur.thumbnailPrompts = r.variations;
    cur.thumbnailsModel = r.model;
    cur.thumbnailsCostUsd = String(Number(cur.thumbnailsCostUsd) + r.costUsd);
    await this.winnerRepo.save(cur);
    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + r.costUsd,
    });
    return cur;
  }

  // ── Internal: one LLM call each ────────────────────────────────────────

  private async generatePosts(
    plan: WeeklyContentPlan, brand: Brand,
    ctx: {
      quizNumber: number; quizTopic: string;
      winners: QuizWinner[];
      totalParticipants?: number;
      speedHighlight?: string;
    },
  ): Promise<{ posts: WinnerPosts; model: string; costUsd: number }> {
    const winnersBlock = ctx.winners
      .map(
        (w) =>
          `🏅 ${w.rank}. ${w.name} — ${w.score}/${w.maxScore} in ${w.timeSeconds}s — ₹${w.prizeInr}`,
      )
      .join('\n');

    const r = await this.router.run({
      task: 'promo',
      agentType: 'promo',
      planId: plan.id,
      modelOverride: brand.modelOverrides?.promo,
      jsonOutput: true,
      maxTokens: 3500,
      temperature: 0.8,
      system: WINNER_POSTS_SYSTEM,
      user:
        `BRAND: ${brand.name}\nVoice/style: ${brand.voiceStyle ?? ''}\n\n` +
        `QUIZ #${ctx.quizNumber}\n` +
        `TOPIC: ${ctx.quizTopic}\n` +
        (ctx.totalParticipants != null ? `TOTAL PARTICIPANTS: ${ctx.totalParticipants}\n` : '') +
        (ctx.speedHighlight ? `SPEED HIGHLIGHT: ${ctx.speedHighlight}\n` : '') +
        `\nWINNERS (use EXACTLY these — do not invent):\n${winnersBlock}\n\n` +
        `Use the {{PLACEHOLDER}} tokens — do not write real URLs. ` +
        `Output the JSON object only.`,
    });

    let parsed: LlmPosts;
    try { parsed = JSON.parse(r.text || '{}') as LlmPosts; }
    catch (e) { throw new Error(`Winner posts JSON parse failed: ${(e as Error).message}`); }

    const ig = parsed.instagram ?? {};
    const li = parsed.linkedin  ?? {};
    const igCap = inject(asString(ig.caption, 2200));
    const igTags = topUpTags(asStringArr(ig.hashtags), HASHTAG_MIN_IG_LI);
    const liBody = inject(asString(li.body, 3000));
    const liTags = topUpTags(asStringArr(li.hashtags), 6);

    const posts: WinnerPosts = {
      youtube_community: inject(asString(parsed.youtube_community, 4000)),
      instagram: {
        caption: igCap, hashtags: igTags,
        full_text: [igCap, joinTags(igTags)].filter(Boolean).join('\n\n'),
      },
      linkedin: {
        body: liBody, hashtags: liTags,
        full_text: [liBody, joinTags(liTags)].filter(Boolean).join('\n\n'),
      },
      whatsapp_channel: inject(asString(parsed.whatsapp_channel, 800)),
      whatsapp_status:  inject(asString(parsed.whatsapp_status, 250)),
    };

    return { posts, model: r.model, costUsd: r.costUsd };
  }

  private async generateThumbnails(
    plan: WeeklyContentPlan, brand: Brand,
    ctx: {
      quizNumber: number; quizTopic: string;
      winners: QuizWinner[];
      speedHighlight?: string;
    },
  ): Promise<{ variations: WinnerThumbnailVariation[]; model: string; costUsd: number }> {
    const winnersBlock = ctx.winners
      .map(
        (w) =>
          `${w.rank}. ${w.name} — ${w.score}/${w.maxScore} in ${w.timeSeconds}s — ₹${w.prizeInr}`,
      )
      .join('\n');

    const r = await this.router.run({
      task: 'thumbnail',
      agentType: 'thumbnail',
      planId: plan.id,
      modelOverride: brand.modelOverrides?.thumbnail,
      jsonOutput: true,
      maxTokens: 2500,
      temperature: 0.9,
      system: WINNER_THUMBNAILS_SYSTEM,
      user:
        `BRAND: ${brand.name}\n\n` +
        `QUIZ #${ctx.quizNumber}\nTOPIC: ${ctx.quizTopic}\n` +
        (ctx.speedHighlight ? `SPEED: ${ctx.speedHighlight}\n` : '') +
        `WINNERS:\n${winnersBlock}\n\n` +
        `Generate 3 winner thumbnail prompts (podium, speed_highlight, hall_of_fame). ` +
        `Output the JSON object only.`,
    });

    let parsed: LlmThumbs;
    try { parsed = JSON.parse(r.text || '{}') as LlmThumbs; }
    catch (e) { throw new Error(`Winner thumbnails JSON parse failed: ${(e as Error).message}`); }

    const allowed: WinnerThumbnailVariation['style'][] = [
      'podium', 'speed_highlight', 'hall_of_fame',
    ];
    const byStyle = new Map<string, NonNullable<LlmThumbs['variations']>[number]>();
    for (const v of parsed.variations ?? []) {
      const s = String(v?.style ?? '').toLowerCase();
      if (allowed.includes(s as WinnerThumbnailVariation['style']) && !byStyle.has(s)) {
        byStyle.set(s, v);
      }
    }
    const variations: WinnerThumbnailVariation[] = allowed.map((style) => {
      const v = byStyle.get(style);
      const score = Number(v?.estimated_ctr_score ?? 0);
      return {
        style,
        headline: asString(v?.headline, 80).toUpperCase().slice(0, 60),
        prompt: asString(v?.prompt, 2000),
        reasoning: asString(v?.reasoning, 400),
        estimatedCtrScore: Number.isFinite(score)
          ? Math.max(1, Math.min(100, Math.round(score)))
          : 50,
      };
    });

    return { variations, model: r.model, costUsd: r.costUsd };
  }
}
