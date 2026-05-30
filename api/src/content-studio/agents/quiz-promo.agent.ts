import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { PublishedVideo } from '../entities/published-video.entity';
import { QuizBundle } from '../entities/quiz-bundle.entity';
import {
  QuizPromoPackage, QuizPromoPayload, QuizPromoLessonLink,
  QuizPromoSocialFooter,
} from '../entities/quiz-promo-package.entity';
const SITE_URL = `https://reharse.inferix.in`;
const TAKE_QUIZ_URL = `${SITE_URL}/quiz`;
import { ModelRouterService } from '../services/model-router.service';
import { BrandMemoryService } from '../services/brand-memory.service';
import { SOCIAL_LINKS } from '../services/social-footer';

const HASHTAG_MIN = 20;
const HASHTAG_FALLBACKS = [
  '#AetherStackAI', '#AIQuiz', '#WeeklyQuiz', '#TestYourAI',
  '#AIForBeginners', '#AILearning', '#LearnAI', '#AIEducation',
  '#TechQuiz', '#AIBootcamp', '#ArtificialIntelligence',
  '#MachineLearning', '#DeepLearning', '#GenerativeAI', '#LLM',
  '#ChatGPT', '#OpenAI', '#Anthropic', '#Claude', '#AIIndia',
  '#AICourse', '#FreeQuiz', '#WinPrize',
];

const PROMO_SYSTEM = `
You write QUIZ PROMOTION social posts for a YouTube channel running a weekly
quiz. Your job is to drive sign-ups for THIS week's quiz, not promote the
lessons themselves (those have their own promo flow).

YOU pick:
1) START / END time — pick a realistic window for this brand's audience.
   Default for an Indian English-speaking AI channel:
   "Saturday 12 AM IST → Sunday 6 PM IST". Always include the timezone
   somewhere in each post.
2) REWARD — default TIERED ₹1,000 cash:
     🥇 ₹500   🥈 ₹300   🥉 ₹200
   Stay near this total unless the brand voice clearly says otherwise.

SITE: the take-the-quiz link is always {SITE_URL}/quiz — never paste
individual lesson URLs into WhatsApp posts. (Lesson URLs only appear in
the YouTube / LinkedIn / Instagram footer block, which is appended for
you outside the JSON — do not include the footer yourself.)

GOLD-STANDARD TEMPLATES — match each platform's tone and structure:

—— WHATSAPP CHANNEL ────────────────────────────────────────────────
🚨 *QUIZ #N IS LIVE!* 🚨

Test your <topic> skills → Win *₹1,000* 💰

📚 *Topics:*
🔐 <Lesson title> (Lesson N)
📨 <Lesson title> (Lesson N)

🏆 *Prizes:*
🥇 ₹500
🥈 ₹300
🥉 ₹200

⏰ *Window:*
Saturday 12:00 AM → Sunday 6:00 PM

⚡ <N> questions • Beat the clock • Climb the leaderboard

📝 Take it: <SITE>/quiz

— <creator signature>
─────────────────────────────────────────────────────────────────────

—— WHATSAPP STATUS (≤ 200 chars, single urgent line) ──────────────
🏆 QUIZ #N LIVE NOW

<topic 1> + <topic 2>
Win ₹1,000 💰

Sat 12AM → Sun 6PM

<SITE>/quiz
─────────────────────────────────────────────────────────────────────

—— INSTAGRAM (≤ 2200 chars, emoji-friendly, ends with hashtag block) ─
QUIZ #N IS LIVE 🏆 Win ₹1,000 💰

You've watched Lessons <N> & <N>. Now prove it 👇

📚 Topics:
🔐 <lesson 1 takeaway>
📨 <lesson 2 takeaway>

🏆 Prizes:
🥇 ₹500  🥈 ₹300  🥉 ₹200

⏰ Saturday 12 AM → Sunday 6 PM
⚡ 10 questions. Speed matters.

Link in bio → Take the quiz NOW

<engagement hook — only if a real stat is in context, otherwise omit>

Tag a developer friend who needs this 👇

.
.
.
(≥20 hashtags here — produced via the "hashtags" array, the renderer
appends them; do NOT inline them in caption)
─────────────────────────────────────────────────────────────────────

—— LINKEDIN (professional, narrative, comment prompt) ─────────────
Quiz #N is live on <brand> 🎯

This week tests two practical developer skills:

🔐 <Lesson 1 — production-safe take>
📨 <Lesson 2 — common pitfall>

If you've built <relevant artefact>, you've hit these exact problems.
Or you will.

40 questions. 10 random per attempt. Speed-ranked leaderboard.

🏆 Cash prizes:
🥇 ₹500
🥈 ₹300
🥉 ₹200

⏰ Open: Saturday 12 AM → Sunday 6 PM

<optional engagement stat — only if a real stat is in context>

Take the quiz 👉 <SITE>/quiz

<comment-prompt question — invites discussion>

(≥20 hashtags here in the "hashtags" array)
─────────────────────────────────────────────────────────────────────

—— YOUTUBE COMMUNITY (medium, ends with engagement CTA) ───────────
🏆 QUIZ #N IS LIVE!

Topics: Lesson <N> (<topic>) + Lesson <N> (<topic>) 📨

Win ₹1,000 in cash prizes 💰
🥇 ₹500  🥈 ₹300  🥉 ₹200

⏰ Saturday 12 AM → Sunday 6 PM
⚡ 10 questions • Beat the clock

<optional engagement stat — only if a real stat is in context>

Take it now 👉 <SITE>/quiz

Drop your score in the comments 👇

(≥20 hashtags here in the "hashtags" array)
─────────────────────────────────────────────────────────────────────

—— LAST CHANCE (urgent reminder, sent ~4-6 hours before window closes) ─
⏰ LAST CHANCE — Quiz #N closes at 6 PM TODAY!

Win ₹1,000 💰
🔐 <topic 1> + 📨 <topic 2>

5 minutes. <N> questions. Real prizes.

Take it now 👉 <SITE>/quiz

Don't let the leaderboard slip away 🏆
─────────────────────────────────────────────────────────────────────

DO:
- Mention the tiered prize in EVERY post.
- Show the start/end window in EVERY post with the timezone implied.
- Reference 1-2 standout topics from the lessons (don't spoil answers).
- Sign WhatsApp Channel with "— <creator>" if a name is in voice/style.

DON'T:
- Invent leaderboard stats ("Last week 7 people scored 6/6"). Only include
  such claims if the user supplied them in LAST_WEEK_STATS. Otherwise omit.
- Paste every lesson URL into WhatsApp posts — use only <SITE>/quiz.
- Use markdown headers (#) in WhatsApp — only *bold* asterisks work.
- Skip the timezone — "Saturday 9 PM" alone is ambiguous.

OUTPUT STRICT JSON ONLY:
{
  "starts_at_label": "Saturday 12 AM IST",
  "ends_at_label":   "Sunday 6 PM IST",
  "reward_label":    "🥇 ₹500  🥈 ₹300  🥉 ₹200 (total ₹1,000)",
  "youtube_community": {
    "title":       "…",
    "description": "…",
    "hashtags":    ["…", "…", "…"]
  },
  "linkedin": {
    "hook":     "…",
    "body":     "…",
    "cta":      "…",
    "hashtags": ["…", "…", "…"]
  },
  "instagram": {
    "caption":  "…",
    "hashtags": ["…", "…", "…"]
  },
  "whatsapp_channel": { "text": "…" },
  "whatsapp_status":  { "text": "…" },
  "last_chance":      { "text": "…" }
}
Output the JSON object only — no prose, no markdown fences.
`.trim();

interface LlmYouTube {
  title?: unknown; description?: unknown; hashtags?: unknown;
}
interface LlmLinkedIn {
  hook?: unknown; body?: unknown; cta?: unknown; hashtags?: unknown;
}
interface LlmInstagram {
  caption?: unknown; hashtags?: unknown;
}
interface LlmWhatsapp { text?: unknown }
interface LlmPromo {
  starts_at_label?: unknown;
  ends_at_label?: unknown;
  reward_label?: unknown;
  youtube_community?: LlmYouTube;
  linkedin?: LlmLinkedIn;
  instagram?: LlmInstagram;
  whatsapp_channel?: LlmWhatsapp;
  whatsapp_status?: LlmWhatsapp;
  last_chance?: LlmWhatsapp;
}

function asString(v: unknown, max = 5000): string {
  return String(v ?? '').slice(0, max).trim();
}
function asStringArr(v: unknown, max = 60): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x).trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t.replace(/\s+/g, '')}`))
    .slice(0, max);
}
function topUpTags(tags: string[]): string[] {
  if (tags.length >= HASHTAG_MIN) return tags;
  const have = new Set(tags.map((t) => t.toLowerCase()));
  for (const t of HASHTAG_FALLBACKS) {
    if (tags.length >= HASHTAG_MIN) break;
    if (have.has(t.toLowerCase())) continue;
    tags.push(t);
    have.add(t.toLowerCase());
  }
  return tags;
}
function joinTags(tags: string[]): string {
  return tags.join(' ');
}

/** Quiz-promo footer: lesson links + standard social block. */
function buildSocialFooter(
  links: QuizPromoLessonLink[],
  quizWeek: number,
): QuizPromoSocialFooter {
  const lessonLines = links.map(
    (l) =>
      l.youtubeUrl
        ? `📺 Lesson ${l.lessonNumber}: ${l.title} → ${l.youtubeUrl}`
        : `📚 Lesson ${l.lessonNumber}: ${l.title}`,
  );
  const lines = [
    `🧠 Week ${quizWeek} Quiz — take it at ${SOCIAL_LINKS.site}`,
    '',
    ...lessonLines,
    '',
    `Subscribe: ${SOCIAL_LINKS.youtube}`,
    'Follow me:',
    `💬 WhatsApp: ${SOCIAL_LINKS.whatsapp}`,
    `📸 Instagram: ${SOCIAL_LINKS.instagram}`,
    `💼 LinkedIn: ${SOCIAL_LINKS.linkedin}`,
  ];
  return { lines, block: lines.join('\n') };
}

@Injectable()
export class QuizPromoAgent {
  private readonly logger = new Logger(QuizPromoAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan)
    private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(PublishedVideo)
    private readonly publishedRepo: Repository<PublishedVideo>,
    @InjectRepository(QuizBundle)
    private readonly bundleRepo: Repository<QuizBundle>,
    @InjectRepository(QuizPromoPackage)
    private readonly promoRepo: Repository<QuizPromoPackage>,
    private readonly router: ModelRouterService,
    private readonly memoryService: BrandMemoryService,
  ) {}

  /** Generate (or regenerate) the quiz promo posts for a plan. */
  async generate(planId: string): Promise<QuizPromoPackage> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const bundle = await this.bundleRepo.findOne({
      where: { planId },
      order: { createdAt: 'DESC' },
    });
    if (!bundle) {
      throw new BadRequestException(
        'Generate the quiz bundle first — promo references its title + tie-breaker',
      );
    }

    const lessons = await this.lessonRepo.find({
      where: { planId },
      order: { lessonNumber: 'ASC' },
    });
    const published = lessons.length
      ? await this.publishedRepo.find({
          where: lessons.map((l) => ({ lessonId: l.id })),
        })
      : [];
    const urlByLessonId = new Map(
      published.map((p) => [p.lessonId, p.youtubeUrl] as const),
    );
    const lessonLinks: QuizPromoLessonLink[] = lessons.map((l) => ({
      lessonNumber: l.lessonNumber,
      title: l.title,
      youtubeUrl: urlByLessonId.get(l.id) ?? null,
    }));

    const memories = await this.memoryService.relevantFor(brand.id, 'promo');
    const memoryBlock = this.memoryService.format(memories);

    const lessonsContext = lessonLinks
      .map((l) =>
        `Lesson ${l.lessonNumber}: ${l.title}` +
        (l.youtubeUrl ? ` (${l.youtubeUrl})` : ' (not yet on YouTube)'),
      )
      .join('\n');

    const quizWeek = bundle.quizWeek ?? plan.seriesWeekNumber ?? 1;

    const llm = await this.router.run({
      task: 'promo',
      agentType: 'promo',
      planId,
      modelOverride: brand.modelOverrides?.promo,
      jsonOutput: true,
      maxTokens: 5500,
      temperature: 0.75,
      system: PROMO_SYSTEM,
      user:
        `BRAND: ${brand.name}\nVoice/style: ${brand.voiceStyle ?? ''}\n\n` +
        `QUIZ TITLE: ${bundle.title}\n` +
        `QUIZ DESCRIPTION: ${bundle.description}\n` +
        `TIE-BREAKER: ${bundle.tieBreakerQuestion} ` +
        `(answer: ${bundle.tieBreakerAnswer}${bundle.tieBreakerUnit ? ' ' + bundle.tieBreakerUnit : ''})\n` +
        `QUIZ WEEK #: ${quizWeek}\n` +
        `QUESTION COUNT: ${bundle.questionCount}\n` +
        `SITE_URL: ${SITE_URL}\n` +
        `TAKE_QUIZ_URL: ${TAKE_QUIZ_URL}\n\n` +
        `THIS WEEK'S LESSONS (mention 1-2 standout topics):\n${lessonsContext}\n\n` +
        `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
        `LAST_WEEK_STATS: (none provided — DO NOT invent leaderboard claims)\n\n` +
        `Pick a realistic start/end window and a TIERED reward. ` +
        `Use ${TAKE_QUIZ_URL} as the take-it link in every platform. ` +
        `Output the JSON object only.`,
    });

    let parsed: LlmPromo;
    try {
      parsed = JSON.parse(llm.text || '{}') as LlmPromo;
    } catch (e) {
      this.logger.error(
        `Promo JSON parse failed (model=${llm.model}): ${(e as Error).message}`,
      );
      throw new Error('LLM returned unparseable JSON for quiz promo');
    }

    const startsAtLabel = asString(parsed.starts_at_label, 200) ||
      'Saturday 9 PM IST';
    const endsAtLabel = asString(parsed.ends_at_label, 200) ||
      'Sunday 9 PM IST';
    const rewardLabel = asString(parsed.reward_label, 200) ||
      '₹1000 Amazon gift card';

    const footer = buildSocialFooter(lessonLinks, quizWeek);

    // ── YouTube community ─────────────────────────────────────────────────
    const yt = parsed.youtube_community ?? {};
    const ytTitle = asString(yt.title, 100) || bundle.title;
    const ytDescription = asString(yt.description, 4000) || bundle.description;
    const ytTags = topUpTags(asStringArr(yt.hashtags));
    const ytFull = [
      ytDescription,
      '',
      footer.block,
      '',
      joinTags(ytTags),
    ].join('\n');

    // ── LinkedIn ──────────────────────────────────────────────────────────
    const li = parsed.linkedin ?? {};
    const liHook = asString(li.hook, 200);
    const liBody = asString(li.body, 3000);
    const liCta = asString(li.cta, 300);
    const liTags = topUpTags(asStringArr(li.hashtags));
    const liFull = [
      liHook, liBody, liCta,
      footer.block,
      joinTags(liTags),
    ].filter(Boolean).join('\n\n');

    // ── Instagram ─────────────────────────────────────────────────────────
    const ig = parsed.instagram ?? {};
    const igCaption = asString(ig.caption, 2200) ||
      `${bundle.title}\n\n${startsAtLabel} → ${endsAtLabel}\n🎁 ${rewardLabel}`;
    const igTags = topUpTags(asStringArr(ig.hashtags));
    const igFull = [igCaption, footer.block, joinTags(igTags)]
      .filter(Boolean).join('\n\n');

    // ── WhatsApp Channel ─────────────────────────────────────────────────
    // No footer / lesson-URL spam here — the template only carries the
    // single take-quiz link (per the gold-standard template).
    const wc = parsed.whatsapp_channel ?? {};
    const wcText = asString(wc.text, 800) ||
      `🚨 *QUIZ #${quizWeek} IS LIVE!* 🚨\n\n🏆 *Prizes:*\n🥇 ₹500  🥈 ₹300  🥉 ₹200\n\n⏰ ${startsAtLabel} → ${endsAtLabel}\n\n📝 Take it: ${TAKE_QUIZ_URL}`;

    // ── WhatsApp Status ──────────────────────────────────────────────────
    const ws = parsed.whatsapp_status ?? {};
    const wsText = asString(ws.text, 250) ||
      `🏆 QUIZ #${quizWeek} LIVE NOW\nWin ₹1,000 💰\n${startsAtLabel} → ${endsAtLabel}\n${TAKE_QUIZ_URL}`;

    // ── Last-chance reminder ─────────────────────────────────────────────
    const lc = parsed.last_chance ?? {};
    const lcText = asString(lc.text, 500) ||
      `⏰ LAST CHANCE — Quiz #${quizWeek} closes soon!\n\nWin ₹1,000 💰\n\nTake it now 👉 ${TAKE_QUIZ_URL}`;

    const payload: QuizPromoPayload = {
      youtube_community: {
        title: ytTitle,
        description: ytDescription,
        hashtags: ytTags,
        full_text: ytFull,
      },
      linkedin: {
        hook: liHook, body: liBody, cta: liCta,
        hashtags: liTags,
        full_text: liFull,
      },
      instagram: {
        caption: igCaption,
        hashtags: igTags,
        full_text: igFull,
      },
      whatsapp_channel: { full_text: wcText },
      whatsapp_status:  { full_text: wsText },
      last_chance:      { full_text: lcText },
      lesson_links: lessonLinks,
      social_footer: footer,
      generated_at: new Date().toISOString(),
    };

    // Upsert — one package per bundle.
    await this.promoRepo.delete({ bundleId: bundle.id });
    const saved = await this.promoRepo.save(
      this.promoRepo.create({
        bundleId: bundle.id,
        planId,
        brandId: brand.id,
        startsAtLabel,
        endsAtLabel,
        rewardLabel,
        payload,
        generatorModel: llm.model,
        costUsd: String(llm.costUsd),
      }),
    );

    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + llm.costUsd,
    });

    this.logger.log(
      `Quiz promo plan=${planId}: ${startsAtLabel} → ${endsAtLabel}, ` +
      `reward "${rewardLabel}", model=${llm.model}, cost $${llm.costUsd.toFixed(4)}`,
    );

    return saved;
  }

  async latest(planId: string): Promise<QuizPromoPackage | null> {
    return this.promoRepo.findOne({
      where: { planId },
      order: { createdAt: 'DESC' },
    });
  }
}
