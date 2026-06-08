import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  QuizQuestion,
  QuizQuestionType,
  QuizSubmission,
  QuizSubmissionAnswer,
  QuizSession,
  QuizConfig,
} from './quiz.entities';
import Redis from 'ioredis';
import { FingerprintService } from '../trust-safety/services/fingerprint.service';
import { UniqueQuestionService } from '../trust-safety/services/unique-question.service';
import { GeolocationService } from '../trust-safety/services/geolocation.service';
import { TsAuditService } from '../trust-safety/services/ts-audit.service';

const DEFAULT_QUESTIONS_PER_QUIZ = 5;
const RATE_LIMIT_WINDOW_SEC = 3600;
const RATE_LIMIT_MAX = 3;

export interface PublicQuestion {
  id: string;
  questionType: 'mcq' | 'true_false' | 'multi_select' | 'numeric';
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  numericUnit: string | null;
  // correctAnswer/correctNumber NEVER included
}

/**
 * Return the /24 network prefix of an IPv4 address ("152.59.161.78" →
 * "152.59.161") for cluster detection. IPv6 / malformed strings return
 * null and the caller skips the subnet signal.
 */
function ipv4Subnet24(ip: string | null): string | null {
  if (!ip) return null;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  if (parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.slice(0, 3).join('.');
}

/**
 * Build the visible→source option order for one question. Returns
 * undefined for numeric (no options to shuffle). True/false produces
 * a 2-element-effective shuffle padded to 4 (C and D positions hold
 * source letters that map to empty visible cells; they're never
 * picked because the public payload only renders A/B).
 */
function buildOptionShuffle(
  q: QuizQuestion,
): Array<'A' | 'B' | 'C' | 'D'> | undefined {
  if (q.questionType === 'numeric') return undefined;
  const isTF = q.questionType === 'true_false';
  // For true_false we shuffle just A,B (one of 2 perms). For mcq /
  // multi_select we shuffle all 4 (one of 24 perms).
  const live: Array<'A' | 'B' | 'C' | 'D'> = isTF ? ['A', 'B'] : ['A', 'B', 'C', 'D'];
  // Fisher-Yates in place.
  for (let i = live.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [live[i], live[j]] = [live[j], live[i]];
  }
  // Pad to 4 so the array is uniform; the unused slots map to empty
  // visible cells, never selectable.
  const dead: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D']
    .filter((x) => !live.includes(x as 'A' | 'B' | 'C' | 'D')) as Array<'A' | 'B' | 'C' | 'D'>;
  return [...live, ...dead];
}

/**
 * Translate VISIBLE letter(s) the entrant clicked back to the SOURCE
 * letter(s) the grader expects, using this session's shuffle for that
 * question. shuffle[i] is the SOURCE letter shown at VISIBLE position
 * i (0=A, 1=B, 2=C, 3=D). Numeric passes through unchanged.
 */
function translateAnswerOpts(
  opts: {
    selectedAnswer?: string;
    selectedAnswers?: string[];
    selectedNumber?: number;
  },
  shuffle: Array<'A' | 'B' | 'C' | 'D'>,
): { selectedAnswer?: string; selectedAnswers?: string[]; selectedNumber?: number } {
  const visIdx: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  const translate = (visible: string): string => {
    const upper = visible.toUpperCase().trim();
    if (!(upper in visIdx)) return visible;
    return shuffle[visIdx[upper]];
  };
  return {
    ...opts,
    selectedAnswer:
      opts.selectedAnswer != null ? translate(opts.selectedAnswer) : undefined,
    selectedAnswers: Array.isArray(opts.selectedAnswers)
      ? opts.selectedAnswers.map(translate)
      : undefined,
  };
}

@Injectable()
export class QuizService {
  private redis: Redis | null = null;

  constructor(
    @InjectRepository(QuizQuestion) private readonly questions: Repository<QuizQuestion>,
    @InjectRepository(QuizSubmission) private readonly submissions: Repository<QuizSubmission>,
    @InjectRepository(QuizSubmissionAnswer) private readonly answers: Repository<QuizSubmissionAnswer>,
    @InjectRepository(QuizSession) private readonly sessions: Repository<QuizSession>,
    @InjectRepository(QuizConfig) private readonly configs: Repository<QuizConfig>,
    private readonly config: ConfigService,
    private readonly fingerprint: FingerprintService,
    private readonly uniqueQuestions: UniqueQuestionService,
    private readonly geo: GeolocationService,
    private readonly tsAudit: TsAuditService,
  ) {
    const url = this.config.get<string>('REDIS_URL');
    if (url) {
      this.redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
      this.redis.connect().catch(() => { this.redis = null; });
    }
  }

  // ── Public: Quiz Info ─────────────────────────────────────────────────

  async getCurrentQuizInfo() {
    const now = new Date();

    // Prefer an active config: live now, or upcoming next, or last that ended
    const activeConfig = await this.configs
      .createQueryBuilder('c')
      .where('c.isActive = true')
      .andWhere(':now BETWEEN c.startsAt AND c.endsAt', { now })
      .orderBy('c.startsAt', 'DESC')
      .getOne();

    const upcomingConfig = !activeConfig
      ? await this.configs
          .createQueryBuilder('c')
          .where('c.isActive = true AND c.startsAt > :now', { now })
          .orderBy('c.startsAt', 'ASC')
          .getOne()
      : null;

    const lastConfig = !activeConfig && !upcomingConfig
      ? await this.configs
          .createQueryBuilder('c')
          .where('c.isActive = true')
          .orderBy('c.endsAt', 'DESC')
          .getOne()
      : null;

    const config = activeConfig ?? upcomingConfig ?? lastConfig;

    let status: 'live' | 'upcoming' | 'closed' | 'no-quiz' = 'no-quiz';
    if (activeConfig) status = 'live';
    else if (upcomingConfig) status = 'upcoming';
    else if (lastConfig) status = 'closed';

    if (!config) {
      // Legacy fallback — pick highest quizWeek
      const latest = await this.questions
        .createQueryBuilder('q')
        .select('MAX(q.quizWeek)', 'week')
        .where('q.isActive = true')
        .getRawOne<{ week: string }>();
      const week = latest?.week ? parseInt(latest.week, 10) : 1;
      const totalQuestions = await this.questions.count({ where: { quizWeek: week, isActive: true } });
      const totalSubmissions = await this.submissions.count({ where: { quizWeek: week } });
      return {
        status: 'no-quiz' as const,
        quizWeek: week,
        title: 'Weekly AI Quiz',
        description: '',
        startsAt: null,
        endsAt: null,
        durationMinutes: 5,
        questionsPerQuiz: DEFAULT_QUESTIONS_PER_QUIZ,
        tiebreakerQuestion: '',
        totalQuestionsAvailable: totalQuestions,
        totalSubmissions,
        isOpen: false,
      };
    }

    const week = config.quizWeek;
    const totalQuestions = await this.questions.count({
      where: { quizWeek: week, isActive: true },
    });
    const totalSubmissions = await this.submissions.count({ where: { quizWeek: week } });
    const questionsPerQuiz = config.questionsPerQuiz ?? DEFAULT_QUESTIONS_PER_QUIZ;

    return {
      status,
      quizWeek: week,
      title: config.title,
      description: config.description,
      startsAt: config.startsAt,
      endsAt: config.endsAt,
      durationMinutes: config.durationMinutes,
      questionsPerQuiz,
      tiebreakerQuestion: config.tiebreakerQuestion ?? '',
      totalQuestionsAvailable: totalQuestions,
      totalSubmissions,
      isOpen: status === 'live' && totalQuestions >= questionsPerQuiz,
    };
  }

  /**
   * Normalize whatever the user types into a canonical "@handle" form so
   * the DB stores one shape and admin lookup is consistent. Accepts:
   *   "@handle"                           → "@handle"
   *   "handle"                            → "@handle"
   *   "youtube.com/@handle"               → "@handle"
   *   "https://www.youtube.com/@handle/"  → "@handle"
   */
  private normalizeYoutubeHandle(raw: string): string {
    const cleaned = raw
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^(www\.)?youtube\.com\//i, '')
      .replace(/\/+$/, '')
      .trim();
    return cleaned.startsWith('@') ? cleaned : `@${cleaned}`;
  }

  // ── Public: Leaderboard (24h post-close window, closed weeks only) ───

  /**
   * Public visibility window for a closed week's leaderboard, in
   * hours after config.endsAt. Override via env QUIZ_LEADERBOARD_WINDOW_HOURS
   * (e.g. set to 168 for a week-long window, or 0 to disable
   * windowing entirely and keep all closed weeks visible forever).
   * Default 24 — winners shown for one day post-close, then the
   * page is empty until the next quiz closes.
   */
  private leaderboardWindowMs(): number {
    const hours = Number(this.config.get<string>('QUIZ_LEADERBOARD_WINDOW_HOURS') ?? 24);
    if (!Number.isFinite(hours) || hours < 0) return 24 * 3600 * 1000;
    return Math.floor(hours * 3600 * 1000);
  }

  /**
   * List quiz weeks that are SAFE to show publicly RIGHT NOW — i.e.
   * config.endsAt is in the past AND we're still inside the 24-hour
   * visibility window. Outside that window the week falls off the
   * public dashboard (live weeks stay private to defeat real-time
   * collusion; old weeks fall off so the page doesn't accumulate
   * a permanent history that's easy to scrape).
   */
  async getPublicClosedWeeks(): Promise<Array<{
    quizWeek: number;
    title: string | null;
    endsAt: Date | null;
    totalEntries: number;
    visibleUntil: Date;
  }>> {
    const now = new Date();
    const windowMs = this.leaderboardWindowMs();

    const closedConfigs = await this.configs
      .createQueryBuilder('c')
      .where('c.isActive = true')
      .andWhere('c.endsAt < :now', { now })
      .orderBy('c.quizWeek', 'DESC')
      .getMany();

    const rows: Array<{
      quizWeek: number; title: string | null; endsAt: Date | null;
      totalEntries: number; visibleUntil: Date;
    }> = [];
    for (const c of closedConfigs) {
      const visibleUntil = new Date(c.endsAt.getTime() + windowMs);
      // Drop weeks whose window already lapsed (unless windowing is
      // disabled via windowMs === 0, in which case visibleUntil === endsAt
      // and we'd skip everything — special-case "0 means forever").
      if (windowMs > 0 && now > visibleUntil) continue;
      const totalEntries = await this.submissions.count({ where: { quizWeek: c.quizWeek } });
      if (totalEntries > 0) {
        rows.push({
          quizWeek: c.quizWeek,
          title: c.title ?? null,
          endsAt: c.endsAt,
          totalEntries,
          visibleUntil: windowMs > 0 ? visibleUntil : new Date(8640000000000000),
        });
      }
    }
    return rows;
  }

  /**
   * Public leaderboard for ONE closed week. Returns ONLY name + score +
   * time + rank. No email / UPI / IP / user agent / fingerprint —
   * those stay admin-side. Throws 400 if the week is still live, OR
   * has already fallen outside the 24h visibility window.
   */
  async getPublicLeaderboard(quizWeek: number, limit = 50): Promise<{
    quizWeek: number;
    title: string | null;
    endsAt: Date | null;
    visibleUntil: Date | null;
    totalEntries: number;
    entries: Array<{
      rank: number;
      fullName: string;
      totalScore: number;
      totalTimeSeconds: number;
    }>;
  }> {
    if (!Number.isInteger(quizWeek) || quizWeek < 1) {
      throw new BadRequestException('quizWeek must be a positive integer');
    }
    const now = new Date();
    const windowMs = this.leaderboardWindowMs();
    const config = await this.configs.findOne({
      where: { quizWeek, isActive: true },
    });
    if (config && config.endsAt > now) {
      // Live or upcoming — keep the leaderboard private.
      throw new BadRequestException(
        'Leaderboard for this week is published after submissions close',
      );
    }
    if (config && windowMs > 0) {
      const visibleUntil = new Date(config.endsAt.getTime() + windowMs);
      if (now > visibleUntil) {
        throw new BadRequestException(
          'This week\'s leaderboard is no longer public — winners were displayed for 24 hours after close',
        );
      }
    }

    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    // Public leaderboard ONLY shows valid entries — disqualified
    // (e.g. cheating ring) submissions are hidden from the public
    // surface but kept in the DB for audit.
    const rows = await this.submissions
      .createQueryBuilder('s')
      .where('s.quizWeek = :week', { week: quizWeek })
      .andWhere('s.disqualified = false')
      .orderBy('s.totalScore', 'DESC')
      .addOrderBy('s.totalTimeSeconds', 'ASC')
      .limit(safeLimit)
      .getMany();
    // totalEntries excludes disqualified too, so the "X entries" header
    // reflects what's actually shown rather than a misleading higher count.
    const totalEntries = await this.submissions.count({
      where: { quizWeek, disqualified: false },
    });

    const visibleUntil = config && windowMs > 0
      ? new Date(config.endsAt.getTime() + windowMs)
      : null;

    return {
      quizWeek,
      title: config?.title ?? null,
      endsAt: config?.endsAt ?? null,
      visibleUntil,
      totalEntries,
      entries: rows.map((r, i) => ({
        rank: i + 1,
        fullName: r.fullName,
        totalScore: r.totalScore,
        totalTimeSeconds: r.totalTimeSeconds,
      })),
    };
  }

  // ── Public: Start Quiz ────────────────────────────────────────────────

  async startQuiz(opts: {
    fullName: string;
    email: string;
    upiId: string;
    youtubeHandle?: string;
    ipAddress?: string;
    // Trust & Safety signals — optional, supplied by the frontend
    userAgent?: string;
    deviceFingerprint?: string;
    browserId?: string;
    screenResolution?: string;
  }): Promise<{
    sessionId: string;
    quizWeek: number;
    questionNumber: number;
    totalQuestions: number;
    question: PublicQuestion;
    expiresAt: string;
    durationMinutes: number;
    tiebreakerQuestion: string;
  }> {
    const { fullName, email, upiId, ipAddress } = opts;
    let { youtubeHandle } = opts;

    // Validate inputs
    if (!fullName?.trim()) throw new BadRequestException('Full name is required');
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email is required');
    }
    if (!upiId?.trim()) throw new BadRequestException('UPI ID or Amazon email is required');
    if (!youtubeHandle?.trim()) {
      throw new BadRequestException(
        'YouTube handle is required — we verify subscription before payout',
      );
    }
    youtubeHandle = this.normalizeYoutubeHandle(youtubeHandle);
    if (youtubeHandle.length < 3) {
      throw new BadRequestException('YouTube handle must be at least 2 characters after @');
    }

    // Determine current week + check time window
    const info = await this.getCurrentQuizInfo();
    if (info.status === 'upcoming') {
      throw new BadRequestException('Quiz has not started yet. Come back at the start time.');
    }
    if (info.status === 'closed') {
      throw new BadRequestException('Quiz has ended. Better luck next week!');
    }
    if (info.status === 'no-quiz' || !info.isOpen) {
      throw new BadRequestException('No active quiz available right now');
    }
    const quizWeek = info.quizWeek;
    const normalizedEmail = email.toLowerCase().trim();

    // One submission per email per week
    const existing = await this.submissions.findOne({
      where: { email: normalizedEmail, quizWeek },
    });
    if (existing) throw new ConflictException("You have already submitted this week's quiz");

    // One attempt total — also block if there's an existing in-progress or expired session
    const priorSession = await this.sessions
      .createQueryBuilder('s')
      .where('s.email = :email AND s.quizWeek = :week', { email: normalizedEmail, week: quizWeek })
      .getOne();
    if (priorSession) {
      throw new ConflictException('You have already started this quiz. Only one attempt is allowed.');
    }

    // Rate limit by IP (max 3 attempts/hour)
    if (ipAddress) await this.checkRateLimit(ipAddress);

    // ── Trust & Safety: blocklist check ────────────────────────────────
    if (ipAddress) {
      const hit = await this.fingerprint.checkBlocklist(
        normalizedEmail, ipAddress, opts.deviceFingerprint,
      );
      if (hit) {
        await this.tsAudit.log({
          action: 'quiz.blocked', actor: normalizedEmail,
          targetType: hit.blockType, ipAddress,
          details: { quizWeek, reason: hit.reason },
        });
        throw new ForbiddenException('Access denied');
      }
    }

    // ── Trust & Safety: optional unique-question filter ────────────────
    let picked: QuizQuestion[];
    let tsStrategy: 'random' | 'unique_overlap' | 'pool_exhausted' = 'random';
    let tsOverlapCount = 0;
    let tsNearbyCount = 0;
    const filterFlag = this.config.get<boolean>('trustSafety.filterQuestions') === true;
    if (filterFlag && ipAddress) {
      const geo = await this.geo.lookup(ipAddress);
      const nearby = await this.fingerprint.findNearby(quizWeek, ipAddress, geo);
      tsNearbyCount = nearby.length;
      if (nearby.length > 0) {
        picked = await this.pickQuestionsWithUniqueness(
          quizWeek, info.questionsPerQuiz, nearby,
          (s, o) => { tsStrategy = s; tsOverlapCount = o; },
        );
      } else {
        picked = await this.pickQuestionsForWeek(quizWeek, info.questionsPerQuiz);
      }
    } else {
      picked = await this.pickQuestionsForWeek(quizWeek, info.questionsPerQuiz);
    }
    if (picked.length < info.questionsPerQuiz) {
      throw new BadRequestException('Not enough active questions in the bank');
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + info.durationMinutes * 60 * 1000);

    // Build a per-question option shuffle for THIS entrant. Same
    // question shown to two people gets different visible A/B/C/D
    // orderings, so "the answer is C" leaked in a WhatsApp group
    // doesn't transfer — each entrant's "C" maps to a different
    // source option.
    const optionShuffles: Record<string, Array<'A' | 'B' | 'C' | 'D'>> = {};
    for (const q of picked) {
      const map = buildOptionShuffle(q);
      if (map) optionShuffles[q.id] = map;
    }

    const session = this.sessions.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      upiId: upiId.trim(),
      youtubeHandle,
      quizWeek,
      questionIds: picked.map((q) => q.id),
      optionShuffles,
      currentIndex: 0,
      answers: [],
      startedAt,
      expiresAt,
      questionStartedAt: startedAt,
      ipAddress: ipAddress ?? null,
    });
    await this.sessions.save(session);

    // ── Trust & Safety: capture-at-start (non-blocking, errors are swallowed) ─
    if (ipAddress) {
      void this.fingerprint.captureAtStart({
        quizWeek,
        email: normalizedEmail,
        name: fullName.trim(),
        ipAddress,
        userAgent: opts.userAgent,
        deviceFingerprint: opts.deviceFingerprint,
        browserId: opts.browserId,
        screenResolution: opts.screenResolution,
        sessionId: session.id,
      });
      void this.tsAudit.log({
        action: 'quiz.start', actor: normalizedEmail,
        targetType: 'session', targetId: session.id, ipAddress,
        details: {
          quizWeek,
          strategy: tsStrategy,
          overlapCount: tsOverlapCount,
          nearbyCount: tsNearbyCount,
          filterEnabled: filterFlag,
        },
      });
    }

    return {
      sessionId: session.id,
      quizWeek,
      questionNumber: 1,
      totalQuestions: picked.length,
      question: this.toPublicQuestion(picked[0], optionShuffles[picked[0].id]),
      expiresAt: expiresAt.toISOString(),
      durationMinutes: info.durationMinutes,
      tiebreakerQuestion: info.tiebreakerQuestion ?? '',
    };
  }

  /**
   * Variant of pickQuestionsForWeek that respects nearby submitter
   * fingerprints — biases the selection toward fresh questions so a
   * cluster of users from the same IP/area get ≥80% non-overlapping sets.
   * Falls back to standard random when the pool can't satisfy the
   * uniqueness budget (logged by the UniqueQuestionService).
   */
  private async pickQuestionsWithUniqueness(
    quizWeek: number,
    totalCount: number,
    nearby: Awaited<ReturnType<FingerprintService['findNearby']>>,
    onStrategy?: (strategy: 'random' | 'unique_overlap' | 'pool_exhausted', overlapCount: number) => void,
  ): Promise<QuizQuestion[]> {
    // Load the full active pool for this week (mandatory + optional).
    const all = await this.questions
      .createQueryBuilder('q')
      .where('q.quizWeek = :w AND q.isActive = true', { w: quizWeek })
      .getMany();

    // Honour the same easy/medium/hard split the existing picker uses.
    const config = await this.configs.findOne({ where: { quizWeek } });
    const easyPct = (config?.easyPercent ?? 40) / 100;
    const mediumPct = (config?.mediumPercent ?? 40) / 100;

    const mandatory = all.filter((q) => q.isMandatory);
    const remaining = Math.max(0, totalCount - mandatory.length);
    const easyCount = Math.max(0, Math.round(remaining * easyPct));
    const mediumCount = Math.max(0, Math.round(remaining * mediumPct));
    const hardCount = Math.max(0, remaining - easyCount - mediumCount);

    const candidates = all.map((q) => ({
      id: q.id,
      difficulty: q.difficulty as 'easy' | 'medium' | 'hard',
      isMandatory: q.isMandatory,
    }));
    const result = this.uniqueQuestions.selectBalanced(
      candidates,
      { easy: easyCount, medium: mediumCount, hard: hardCount },
      nearby,
    );
    onStrategy?.(result.strategy, result.overlapCount);

    // Hydrate back to QuizQuestion rows in the picker order.
    const byId = new Map(all.map((q) => [q.id, q]));
    return result.selected
      .map((id) => byId.get(id))
      .filter((q): q is QuizQuestion => !!q);
  }

  // ── Public: Submit Answer ─────────────────────────────────────────────

  async submitAnswer(opts: {
    sessionId: string;
    selectedAnswer?: string; // 'A' for mcq/t-f
    selectedAnswers?: string[]; // ['A', 'C'] for multi_select
    selectedNumber?: number; // for numeric
  }): Promise<
    | { done: false; questionNumber: number; totalQuestions: number; question: PublicQuestion; expiresAt?: string }
    | { done: true; needsTiebreaker: boolean; tiebreakerQuestion?: string; expired?: boolean }
  > {
    const { sessionId } = opts;

    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.completed) throw new ForbiddenException('Quiz already completed');
    if (session.currentIndex >= session.questionIds.length) {
      throw new ForbiddenException('All questions already answered');
    }

    // Session timer expired — auto-finish, ignore this answer
    if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
      session.currentIndex = session.questionIds.length;
      await this.sessions.save(session);
      return { done: true, needsTiebreaker: false, expired: true };
    }

    const currentQuestionId = session.questionIds[session.currentIndex];
    const question = await this.questions.findOne({ where: { id: currentQuestionId } });
    if (!question) throw new NotFoundException('Question not found');

    // Translate the entrant's VISIBLE answer back to the SOURCE letter
    // using this session's per-question shuffle. Numeric and unset
    // shuffles pass through unchanged.
    const shuffle = session.optionShuffles?.[currentQuestionId];
    const translatedOpts = shuffle ? translateAnswerOpts(opts, shuffle) : opts;

    // Score based on question type
    const { isCorrect, recordedAnswer, recordedNumber } = this.gradeAnswer(question, translatedOpts);
    const pointsEarned = isCorrect ? question.points : 0;

    const now = new Date();
    const startedAt = session.questionStartedAt ?? session.startedAt;
    const timeTakenSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000),
    );

    session.answers = [
      ...session.answers,
      {
        questionId: question.id,
        selectedAnswer: recordedAnswer,
        selectedNumber: recordedNumber,
        isCorrect,
        pointsEarned,
        timeTakenSeconds,
      },
    ];
    session.currentIndex += 1;
    session.questionStartedAt = now;
    await this.sessions.save(session);

    if (session.currentIndex >= session.questionIds.length) {
      const tbConfig = await this.configs.findOne({ where: { quizWeek: session.quizWeek } });
      const tbText = (tbConfig?.tiebreakerQuestion ?? '').trim();
      return { done: true, needsTiebreaker: tbText.length > 0, tiebreakerQuestion: tbText };
    }

    const nextQuestion = await this.questions.findOne({
      where: { id: session.questionIds[session.currentIndex] },
    });
    if (!nextQuestion) throw new NotFoundException('Next question not found');

    return {
      done: false,
      questionNumber: session.currentIndex + 1,
      totalQuestions: session.questionIds.length,
      question: this.toPublicQuestion(
        nextQuestion,
        session.optionShuffles?.[nextQuestion.id],
      ),
      expiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : undefined,
    };
  }

  /** Grade a single answer based on question type */
  private gradeAnswer(
    question: QuizQuestion,
    opts: { selectedAnswer?: string; selectedAnswers?: string[]; selectedNumber?: number },
  ): { isCorrect: boolean; recordedAnswer: string; recordedNumber: number | null } {
    const type = question.questionType ?? 'mcq';

    if (type === 'mcq' || type === 'true_false') {
      const ans = opts.selectedAnswer;
      const allowed = type === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D'];
      if (!ans || !allowed.includes(ans)) {
        throw new BadRequestException(`Invalid answer. Expected one of: ${allowed.join(', ')}`);
      }
      return {
        isCorrect: ans === question.correctAnswer,
        recordedAnswer: ans,
        recordedNumber: null,
      };
    }

    if (type === 'multi_select') {
      const ans = opts.selectedAnswers ?? [];
      if (!Array.isArray(ans) || ans.some((a) => !['A', 'B', 'C', 'D'].includes(a))) {
        throw new BadRequestException('Invalid multi-select answer');
      }
      const correct = (question.correctAnswers ?? []).slice().sort();
      const submitted = [...new Set(ans)].sort();
      const isCorrect =
        correct.length > 0 &&
        correct.length === submitted.length &&
        correct.every((c, i) => c === submitted[i]);
      return {
        isCorrect,
        recordedAnswer: submitted.join(','),
        recordedNumber: null,
      };
    }

    if (type === 'numeric') {
      const n = opts.selectedNumber;
      if (typeof n !== 'number' || isNaN(n)) {
        throw new BadRequestException('Numeric answer required');
      }
      const correct = Number(question.correctNumber ?? 0);
      const tol = Number(question.numericTolerance ?? 0);
      const isCorrect = Math.abs(n - correct) <= tol;
      return {
        isCorrect,
        recordedAnswer: 'n/a',
        recordedNumber: n,
      };
    }

    throw new BadRequestException(`Unknown question type: ${type}`);
  }

  // ── Public: Complete Quiz ─────────────────────────────────────────────

  async completeQuiz(opts: {
    sessionId: string;
    tiebreakerAnswer?: number;
    userAgent?: string;
    // Trust & Safety signals — sent from the frontend on submit
    deviceFingerprint?: string;
    browserId?: string;
    screenResolution?: string;
    tabSwitchCount?: number;
    copyPasteDetected?: boolean;
  }): Promise<{
    submissionId: string;
    quizWeek: number;
    totalQuestions: number;
    totalTimeSeconds: number;
    totalSubmissions: number;
    // Score / rank / correctCount intentionally OMITTED.
    // The entrant should NOT know their score before the answers go
    // public on Saturday — otherwise cheating rings can compare
    // results in real time and reverse-engineer the answer key
    // ("Dad got 9/9 with these answers — let's all submit the same").
    // Admins can see scores via the leaderboard API + CSV export.
  }> {
    const { sessionId, tiebreakerAnswer, userAgent } = opts;

    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.completed) {
      // Idempotent — return existing submission stats
      if (session.submissionId) {
        return this.getSubmissionStats(session.submissionId);
      }
      throw new ForbiddenException('Session already completed');
    }
    // If timer expired, auto-fast-forward through remaining questions (no points)
    const isExpired = session.expiresAt && new Date() > new Date(session.expiresAt);
    if (session.currentIndex < session.questionIds.length && !isExpired) {
      throw new BadRequestException('Quiz not finished — answer all questions first');
    }

    const totalScore = session.answers.reduce((sum, a) => sum + a.pointsEarned, 0);
    const totalTimeSeconds = session.answers.reduce((sum, a) => sum + a.timeTakenSeconds, 0);

    // Compute suspicion BEFORE saving so the score lands on the new row.
    const { score: suspicionScore, flags: suspicionFlags } =
      await this.computeSuspicion({
        quizWeek: session.quizWeek,
        ipAddress: session.ipAddress,
        userAgent: userAgent ?? null,
        questionsAnswered: session.answers.length,
        totalTimeSeconds,
        copyPasteDetected: !!opts.copyPasteDetected,
        tabSwitchCount: opts.tabSwitchCount ?? 0,
      });

    // Create the submission
    const submission = this.submissions.create({
      fullName: session.fullName,
      email: session.email,
      upiId: session.upiId,
      youtubeHandle: session.youtubeHandle,
      quizWeek: session.quizWeek,
      totalScore,
      totalTimeSeconds,
      tiebreakerAnswer: tiebreakerAnswer ?? null,
      ipAddress: session.ipAddress,
      userAgent: userAgent ?? null,
      suspicionScore,
      suspicionFlags,
    });
    const saved = await this.submissions.save(submission);

    // Save individual answers
    const answerEntities = session.answers.map((a) =>
      this.answers.create({
        submissionId: saved.id,
        questionId: a.questionId,
        selectedAnswer: a.selectedAnswer,
        selectedNumber: a.selectedNumber ?? null,
        isCorrect: a.isCorrect,
        pointsEarned: a.pointsEarned,
        timeTakenSeconds: a.timeTakenSeconds,
      }),
    );
    await this.answers.save(answerEntities);

    session.completed = true;
    session.submissionId = saved.id;
    await this.sessions.save(session);

    // ── Trust & Safety: capture final fingerprint (non-blocking) ───────
    if (session.ipAddress) {
      void this.fingerprint.captureAtSubmit({
        submissionId: saved.id,
        sessionId: session.id,
        quizWeek: session.quizWeek,
        email: session.email,
        name: session.fullName,
        ipAddress: session.ipAddress,
        userAgent,
        deviceFingerprint: opts.deviceFingerprint,
        browserId: opts.browserId,
        screenResolution: opts.screenResolution,
        totalTimeSeconds,
        score: totalScore,
        questionIds: session.questionIds,
        answerTimesSeconds: session.answers.map((a) => a.timeTakenSeconds),
        tabSwitchCount: opts.tabSwitchCount,
        copyPasteDetected: opts.copyPasteDetected,
      });
      void this.tsAudit.log({
        action: 'quiz.submit', actor: session.email,
        targetType: 'submission', targetId: saved.id,
        ipAddress: session.ipAddress,
        details: {
          quizWeek: session.quizWeek,
          totalScore,
          totalTimeSeconds,
          tabSwitchCount: opts.tabSwitchCount ?? 0,
          copyPasteDetected: opts.copyPasteDetected ?? false,
        },
      });
    }

    return this.getSubmissionStats(saved.id);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * Serialize a question for the entrant. When `shuffle` is provided
   * (mcq / multi_select / true_false), reorders the visible option
   * letters so the same source question shows differently per entrant.
   * Numeric questions ignore the shuffle.
   */
  private toPublicQuestion(
    q: QuizQuestion,
    shuffle?: Array<'A' | 'B' | 'C' | 'D'>,
  ): PublicQuestion {
    const isTF = q.questionType === 'true_false';
    // Source slots — empty strings for unused option positions.
    const source: Record<'A' | 'B' | 'C' | 'D', string> = {
      A: isTF ? (q.optionA || 'True')  : (q.optionA ?? ''),
      B: isTF ? (q.optionB || 'False') : (q.optionB ?? ''),
      C: isTF ? ''                     : (q.optionC ?? ''),
      D: isTF ? ''                     : (q.optionD ?? ''),
    };
    // Without a shuffle (legacy sessions / numeric / no shuffle stored),
    // serve in source order — preserves the pre-stricter behaviour.
    const order = shuffle ?? (['A', 'B', 'C', 'D'] as const);
    return {
      id: q.id,
      questionType: q.questionType ?? 'mcq',
      questionText: q.questionText,
      optionA: source[order[0]],
      optionB: source[order[1]],
      optionC: source[order[2]],
      optionD: source[order[3]],
      numericUnit: q.numericUnit ?? null,
    };
  }

  private async pickQuestionsForWeek(quizWeek: number, totalCount: number): Promise<QuizQuestion[]> {
    // Pull percentages from config (default 40/40/20 if missing)
    const config = await this.configs.findOne({ where: { quizWeek } });
    const easyPct = (config?.easyPercent ?? 40) / 100;
    const mediumPct = (config?.mediumPercent ?? 40) / 100;
    // hardPct derived as remainder so totals always reach `remaining`

    // 1. Mandatory questions are always included
    const mandatory = await this.questions
      .createQueryBuilder('q')
      .where('q.quizWeek = :week AND q.isActive = true AND q.isMandatory = true', { week: quizWeek })
      .getMany();

    // If mandatory >= totalCount, use the first `totalCount` mandatory (shuffled)
    if (mandatory.length >= totalCount) {
      for (let i = mandatory.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mandatory[i], mandatory[j]] = [mandatory[j], mandatory[i]];
      }
      return mandatory.slice(0, totalCount);
    }

    // 2. Fill remaining slots with non-mandatory random questions, weighted by difficulty
    const remaining = totalCount - mandatory.length;
    const easyCount = Math.max(0, Math.round(remaining * easyPct));
    const mediumCount = Math.max(0, Math.round(remaining * mediumPct));
    const hardCount = Math.max(0, remaining - easyCount - mediumCount);
    const excludeIds = mandatory.map((m) => m.id);

    const [easy, medium, hard] = await Promise.all([
      this.fetchRandomByDifficulty(quizWeek, 'easy', easyCount, excludeIds),
      this.fetchRandomByDifficulty(quizWeek, 'medium', mediumCount, excludeIds),
      this.fetchRandomByDifficulty(quizWeek, 'hard', hardCount, excludeIds),
    ]);

    let picked = [...mandatory, ...easy, ...medium, ...hard];

    // 3. Fill any remaining gap with any non-mandatory active question
    if (picked.length < totalCount) {
      const usedIds = picked.map((p) => p.id);
      const fallback = await this.questions
        .createQueryBuilder('q')
        .where('q.quizWeek = :week AND q.isActive = true AND q.isMandatory = false', { week: quizWeek })
        .andWhere(usedIds.length ? 'q.id NOT IN (:...ids)' : '1=1', { ids: usedIds.length ? usedIds : [''] })
        .orderBy('RANDOM()')
        .limit(totalCount - picked.length)
        .getMany();
      picked = [...picked, ...fallback];
    }

    // 4. Shuffle non-mandatory portion to randomize order
    const mandatoryPart = picked.filter((q) => q.isMandatory);
    const restPart = picked.filter((q) => !q.isMandatory);
    for (let i = restPart.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [restPart[i], restPart[j]] = [restPart[j], restPart[i]];
    }

    return [...mandatoryPart, ...restPart].slice(0, totalCount);
  }

  private async fetchRandomByDifficulty(
    quizWeek: number,
    difficulty: 'easy' | 'medium' | 'hard',
    limit: number,
    excludeIds: string[] = [],
  ): Promise<QuizQuestion[]> {
    if (limit <= 0) return [];
    const qb = this.questions
      .createQueryBuilder('q')
      .where('q.quizWeek = :week AND q.isActive = true AND q.difficulty = :difficulty AND q.isMandatory = false', {
        week: quizWeek,
        difficulty,
      });
    if (excludeIds.length) qb.andWhere('q.id NOT IN (:...ids)', { ids: excludeIds });
    return qb
      .orderBy('RANDOM()')
      .limit(limit)
      .getMany();
  }

  private async checkRateLimit(ipAddress: string) {
    if (!this.redis) return; // graceful degrade if redis unreachable
    const key = `quiz:rate:${ipAddress}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, RATE_LIMIT_WINDOW_SEC);
      if (count > RATE_LIMIT_MAX) {
        throw new ForbiddenException('Too many attempts from this IP. Try again later.');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      // Redis errors should not block the user
    }
  }

  /**
   * Blind submission confirmation — returned to the entrant after
   * completeQuiz. Deliberately does NOT include score / correctCount /
   * maxScore / rank: those would let coordinated cheating rings
   * reverse-engineer the answer key in real time (one entrant submits,
   * shares "9/9", group learns which answer set worked). Admin-side
   * scoring + leaderboard live behind AdminGuard endpoints.
   */
  private async getSubmissionStats(submissionId: string) {
    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('Submission not found');

    const totalQuestions = await this.answers.count({ where: { submissionId } });
    const totalSubmissions = await this.submissions.count({
      where: { quizWeek: submission.quizWeek },
    });

    return {
      submissionId: submission.id,
      quizWeek: submission.quizWeek,
      totalQuestions,
      totalTimeSeconds: submission.totalTimeSeconds,
      totalSubmissions,
    };
  }

  // ── Suspicion scoring (auto-computed at submit) ──────────────────────

  /**
   * Score a submission's "looks-fraudy-ness" 0..100 based on
   * behavioural + network signals. The thresholds are deliberately
   * conservative: a single signal alone is "yellow flag" territory,
   * two compounding signals push past the ≥50 "red flag" cutoff that
   * the admin queue highlights.
   *
   * Anyone with score ≥ 50 should be eyeballed before the prize
   * goes out; disqualification stays MANUAL — this just sorts the
   * haystack.
   */
  private async computeSuspicion(input: {
    quizWeek: number;
    ipAddress: string | null;
    userAgent: string | null;
    questionsAnswered: number;
    totalTimeSeconds: number;
    copyPasteDetected: boolean;
    tabSwitchCount: number;
  }): Promise<{ score: number; flags: Array<{ code: string; reason: string; points: number }> }> {
    const flags: Array<{ code: string; reason: string; points: number }> = [];
    let score = 0;
    const push = (code: string, reason: string, points: number) => {
      flags.push({ code, reason, points });
      score += points;
    };

    // 1. Fast-completion floor — 60s on >=5 Qs is humanly possible
    //    only with foreknowledge of the answers.
    if (input.questionsAnswered >= 5 && input.totalTimeSeconds < 60 && input.totalTimeSeconds > 0) {
      push(
        'fast_completion',
        `Completed ${input.questionsAnswered} questions in ${input.totalTimeSeconds}s ` +
        `(~${(input.totalTimeSeconds / input.questionsAnswered).toFixed(1)}s/Q)`,
        40,
      );
    }

    // 2. /24 subnet cluster — count PRIOR submissions this week from
    //    the same /24 network. 1+ other = +25 (covers the 2nd-from-IP
    //    case onward, which is the family-on-WiFi pattern).
    const subnet = ipv4Subnet24(input.ipAddress);
    if (subnet) {
      const others = await this.submissions
        .createQueryBuilder('s')
        .where('s.quizWeek = :week', { week: input.quizWeek })
        .andWhere('s."ipAddress" LIKE :prefix', { prefix: subnet + '.%' })
        .getCount();
      if (others >= 1) {
        push(
          'subnet_cluster',
          `${others + 1} entries from ${subnet}.0/24 this week`,
          25,
        );
      }
    }

    // 3. User-agent exact-match — same browser+OS string showing up
    //    multiple times in a week is a tell for "same phone hopping
    //    accounts". 1+ other = +10.
    if (input.userAgent) {
      const others = await this.submissions
        .createQueryBuilder('s')
        .where('s.quizWeek = :week', { week: input.quizWeek })
        .andWhere('s."userAgent" = :ua', { ua: input.userAgent })
        .getCount();
      if (others >= 1) {
        push(
          'ua_duplicate',
          `${others + 1} entries with identical user-agent this week`,
          10,
        );
      }
    }

    // 4. Copy/paste during quiz — strong "answers came from elsewhere" signal.
    if (input.copyPasteDetected) {
      push('copy_paste', 'Copy/paste detected during quiz', 10);
    }

    // 5. Excessive tab switching during a short quiz.
    if (input.tabSwitchCount > 3) {
      push(
        'tab_switching',
        `${input.tabSwitchCount} tab switches during quiz`,
        5,
      );
    }

    return { score: Math.min(100, score), flags };
  }

  // ── Admin: Disqualification ──────────────────────────────────────────

  /**
   * Mark a submission as disqualified. Stays in the DB (we never delete
   * the audit trail); the public leaderboard + CSV "official only"
   * filter respect this flag. Reversible via adminReinstateSubmission.
   */
  async adminDisqualifySubmission(
    submissionId: string,
    opts: { reason?: string; actor?: string },
  ): Promise<QuizSubmission> {
    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('Submission not found');
    submission.disqualified = true;
    submission.disqualifiedReason = (opts.reason ?? '').trim() || null;
    submission.disqualifiedAt = new Date();
    submission.disqualifiedBy = opts.actor ?? null;
    // If the entrant was holding a winnerRank, clear it — leaderboard
    // recomputes from scratch each request, but admin views key off
    // winnerRank for "manually picked" badging.
    submission.winnerRank = null;
    return this.submissions.save(submission);
  }

  async adminReinstateSubmission(submissionId: string): Promise<QuizSubmission> {
    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('Submission not found');
    submission.disqualified = false;
    submission.disqualifiedReason = null;
    submission.disqualifiedAt = null;
    submission.disqualifiedBy = null;
    return this.submissions.save(submission);
  }

  // ── Admin: Quiz Config ────────────────────────────────────────────────

  async adminGetConfigs() {
    return this.configs.find({ order: { quizWeek: 'DESC' } });
  }

  async adminUpsertConfig(body: {
    quizWeek: number;
    title?: string;
    description?: string;
    startsAt: string;
    endsAt: string;
    durationMinutes?: number;
    questionsPerQuiz?: number;
    easyPercent?: number;
    mediumPercent?: number;
    hardPercent?: number;
    tiebreakerQuestion?: string;
    isActive?: boolean;
  }) {
    if (!body.quizWeek || body.quizWeek < 1) {
      throw new BadRequestException('quizWeek must be a positive integer');
    }
    if (!body.startsAt || !body.endsAt) {
      throw new BadRequestException('startsAt and endsAt are required');
    }
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    // Validate difficulty percentages if any are provided
    if (
      body.easyPercent !== undefined ||
      body.mediumPercent !== undefined ||
      body.hardPercent !== undefined
    ) {
      const e = body.easyPercent ?? 40;
      const m = body.mediumPercent ?? 40;
      const h = body.hardPercent ?? 20;
      if ([e, m, h].some((v) => v < 0 || v > 100)) {
        throw new BadRequestException('Each percentage must be between 0 and 100');
      }
      if (e + m + h !== 100) {
        throw new BadRequestException(`Difficulty percentages must sum to 100 (got ${e + m + h})`);
      }
    }

    const existing = await this.configs.findOne({ where: { quizWeek: body.quizWeek } });
    if (existing) {
      Object.assign(existing, {
        title: body.title ?? existing.title,
        description: body.description ?? existing.description,
        startsAt,
        endsAt,
        durationMinutes: body.durationMinutes ?? existing.durationMinutes,
        questionsPerQuiz: body.questionsPerQuiz ?? existing.questionsPerQuiz,
        easyPercent: body.easyPercent ?? existing.easyPercent,
        mediumPercent: body.mediumPercent ?? existing.mediumPercent,
        hardPercent: body.hardPercent ?? existing.hardPercent,
        tiebreakerQuestion: body.tiebreakerQuestion ?? existing.tiebreakerQuestion,
        isActive: body.isActive ?? existing.isActive,
      });
      return this.configs.save(existing);
    }

    const created = this.configs.create({
      quizWeek: body.quizWeek,
      title: body.title ?? 'Weekly AI Quiz',
      description: body.description ?? '',
      startsAt,
      endsAt,
      durationMinutes: body.durationMinutes ?? 5,
      questionsPerQuiz: body.questionsPerQuiz ?? DEFAULT_QUESTIONS_PER_QUIZ,
      easyPercent: body.easyPercent ?? 40,
      mediumPercent: body.mediumPercent ?? 40,
      hardPercent: body.hardPercent ?? 20,
      tiebreakerQuestion: body.tiebreakerQuestion ?? '',
      isActive: body.isActive ?? true,
    });
    return this.configs.save(created);
  }

  async adminDeleteConfig(id: string) {
    const c = await this.configs.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Config not found');
    await this.configs.remove(c);
    return { deleted: true };
  }

  // ── Admin ─────────────────────────────────────────────────────────────

  async adminGetSubmissions(opts: {
    page: number;
    limit: number;
    quizWeek?: number;
    sortBy?: 'score' | 'time' | 'submittedAt';
    search?: string;
  }) {
    const { page, limit, quizWeek, sortBy = 'score', search } = opts;
    const qb = this.submissions
      .createQueryBuilder('s')
      .skip((page - 1) * limit)
      .take(limit);

    if (sortBy === 'score') {
      qb.orderBy('s.totalScore', 'DESC').addOrderBy('s.totalTimeSeconds', 'ASC');
    } else if (sortBy === 'time') {
      qb.orderBy('s.totalTimeSeconds', 'ASC');
    } else {
      qb.orderBy('s.submittedAt', 'DESC');
    }

    if (quizWeek !== undefined) qb.andWhere('s.quizWeek = :week', { week: quizWeek });
    if (search) {
      qb.andWhere('(s.email ILIKE :s OR s.fullName ILIKE :s OR s.upiId ILIKE :s)', {
        s: `%${search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async adminMarkWinner(submissionId: string, rank: number | null) {
    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('Submission not found');
    submission.winnerRank = rank;
    return this.submissions.save(submission);
  }

  async adminExportSubmissionsCSV(quizWeek?: number): Promise<string> {
    const qb = this.submissions
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.answers', 'a')
      .leftJoinAndSelect('a.question', 'q')
      .orderBy('s.totalScore', 'DESC')
      .addOrderBy('s.totalTimeSeconds', 'ASC');
    if (quizWeek !== undefined) qb.andWhere('s.quizWeek = :week', { week: quizWeek });
    const subs = await qb.getMany();

    // Determine the maximum number of questions any user got — drives the
    // number of Q1.../QN... column groups in the wide-format export.
    const maxQ = Math.max(0, ...subs.map((s) => s.answers?.length ?? 0));

    // Build dynamic column headers: per-question groups
    const qCols: string[] = [];
    for (let i = 1; i <= maxQ; i++) {
      qCols.push(
        `q${i}_question`,
        `q${i}_type`,
        `q${i}_difficulty`,
        `q${i}_correctAnswer`,
        `q${i}_selectedAnswer`,
        `q${i}_isCorrect`,
        `q${i}_pointsEarned`,
        `q${i}_timeSeconds`,
      );
    }

    const baseCols = [
      'rank', 'fullName', 'email', 'upiId', 'youtubeHandle', 'quizWeek',
      'totalScore', 'totalTimeSeconds', 'tiebreakerAnswer', 'winnerRank',
      'submittedAt', 'disqualified', 'disqualifiedReason',
      'suspicionScore', 'suspicionFlags',
      'answersSummary',
    ];
    const header = [...baseCols, ...qCols].join(',') + '\n';

    const escape = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const rows = subs.map((s, i) => {
      const answers = s.answers ?? [];

      // Compact human-readable summary across all answers — fits in one cell
      const summary = answers
        .map((a, idx) => {
          const q = a.question;
          const qType = q?.questionType ?? 'mcq';
          const correct = qType === 'multi_select'
            ? (q?.correctAnswers ?? []).join(',')
            : qType === 'numeric'
              ? `${q?.correctNumber ?? '?'}±${q?.numericTolerance ?? 0}`
              : (q?.correctAnswer ?? '?');
          const selected = qType === 'numeric'
            ? String(a.selectedNumber ?? '?')
            : a.selectedAnswer;
          const mark = a.isCorrect ? '✓' : '✗';
          const text = (q?.questionText ?? '(deleted)').slice(0, 80);
          return `Q${idx + 1} [${qType}/${q?.difficulty ?? '?'}] "${text}" → ${selected} (correct: ${correct}) ${mark} +${a.pointsEarned}pts ${a.timeTakenSeconds}s`;
        })
        .join(' | ');

      // Per-question wide-format columns (pad to maxQ with empty strings)
      const perQ: string[] = [];
      for (let j = 0; j < maxQ; j++) {
        const a = answers[j];
        if (!a) {
          perQ.push('', '', '', '', '', '', '', '');
          continue;
        }
        const q = a.question;
        const qType = q?.questionType ?? 'mcq';
        const correct = qType === 'multi_select'
          ? (q?.correctAnswers ?? []).join(',')
          : qType === 'numeric'
            ? `${q?.correctNumber ?? ''}±${q?.numericTolerance ?? 0}`
            : (q?.correctAnswer ?? '');
        const selected = qType === 'numeric'
          ? String(a.selectedNumber ?? '')
          : a.selectedAnswer;
        perQ.push(
          escape(q?.questionText ?? '(deleted)'),
          escape(qType),
          escape(q?.difficulty ?? ''),
          escape(correct),
          escape(selected),
          escape(a.isCorrect ? 'TRUE' : 'FALSE'),
          escape(a.pointsEarned),
          escape(a.timeTakenSeconds),
        );
      }

      const flagsSummary = (s.suspicionFlags ?? [])
        .map((f) => `${f.code}(+${f.points})`)
        .join(';');

      return [
        escape(i + 1),
        escape(s.fullName),
        escape(s.email),
        escape(s.upiId),
        escape(s.youtubeHandle ?? ''),
        escape(s.quizWeek),
        escape(s.totalScore),
        escape(s.totalTimeSeconds),
        escape(s.tiebreakerAnswer ?? ''),
        escape(s.winnerRank ?? ''),
        escape(s.submittedAt.toISOString()),
        escape(s.disqualified ? 'TRUE' : 'FALSE'),
        escape(s.disqualifiedReason ?? ''),
        escape(s.suspicionScore ?? 0),
        escape(flagsSummary),
        escape(summary),
        ...perQ,
      ].join(',');
    }).join('\n');

    return header + rows;
  }

  async adminGetQuestions(opts: {
    page: number;
    limit: number;
    quizWeek?: number;
    difficulty?: string;
    category?: string;
    search?: string;
    active?: string;
  }) {
    const { page, limit, quizWeek, difficulty, category, search, active } = opts;
    const qb = this.questions
      .createQueryBuilder('q')
      .orderBy('q.quizWeek', 'DESC')
      .addOrderBy('q.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (quizWeek !== undefined) qb.andWhere('q.quizWeek = :week', { week: quizWeek });
    if (difficulty) qb.andWhere('q.difficulty = :difficulty', { difficulty });
    if (category) qb.andWhere('q.category = :category', { category });
    if (search) qb.andWhere('q.questionText ILIKE :s', { s: `%${search}%` });
    if (active !== undefined) qb.andWhere('q.isActive = :active', { active: active === 'true' });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async adminCreateQuestion(body: Partial<QuizQuestion>) {
    this.validateQuestion(body);
    const type = body.questionType ?? 'mcq';
    const q = this.questions.create({
      questionType: type,
      questionText: body.questionText!,
      optionA: body.optionA ?? (type === 'true_false' ? 'True' : ''),
      optionB: body.optionB ?? (type === 'true_false' ? 'False' : ''),
      optionC: body.optionC ?? '',
      optionD: body.optionD ?? '',
      correctAnswer: body.correctAnswer ?? null,
      correctAnswers: body.correctAnswers ?? null,
      correctNumber: body.correctNumber ?? null,
      numericTolerance: body.numericTolerance ?? 0,
      numericUnit: body.numericUnit ?? null,
      points: body.points ?? 1,
      difficulty: body.difficulty!,
      category: body.category!,
      quizWeek: body.quizWeek!,
      isMandatory: body.isMandatory ?? false,
      isActive: body.isActive ?? true,
    });
    return this.questions.save(q);
  }

  async adminUpdateQuestion(id: string, body: Partial<QuizQuestion>) {
    const q = await this.questions.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    Object.assign(q, body);
    return this.questions.save(q);
  }

  async adminDeleteQuestion(id: string) {
    const q = await this.questions.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    await this.questions.remove(q);
    return { deleted: true };
  }

  async adminBulkAction(opts: { ids: string[]; action: 'activate' | 'deactivate' | 'delete'; quizWeek?: number }) {
    const { ids, action, quizWeek } = opts;
    if (!ids?.length) return { affected: 0 };

    if (action === 'delete') {
      const result = await this.questions.delete(ids);
      return { affected: result.affected ?? 0 };
    }
    if (action === 'activate' || action === 'deactivate') {
      const result = await this.questions.update(ids, { isActive: action === 'activate' });
      return { affected: result.affected ?? 0 };
    }
    if (quizWeek !== undefined) {
      const result = await this.questions.update(ids, { quizWeek });
      return { affected: result.affected ?? 0 };
    }
    return { affected: 0 };
  }

  async adminImportQuestions(rows: Array<Record<string, unknown>>, mode: 'append' | 'replace', quizWeek?: number) {
    const errors: Array<{ row: number; message: string }> = [];
    const valid: Partial<QuizQuestion>[] = [];

    rows.forEach((row, i) => {
      try {
        const parsed = this.parseImportRow(row, quizWeek);
        this.validateQuestion(parsed);
        valid.push(parsed);
      } catch (err) {
        errors.push({ row: i + 2, message: (err as Error).message }); // +2 because row 1 = header, 0-indexed
      }
    });

    if (errors.length && valid.length === 0) {
      return { imported: 0, errors };
    }

    if (mode === 'replace' && quizWeek !== undefined) {
      await this.questions.delete({ quizWeek });
    }

    const entities = valid.map((v) => this.questions.create(v as QuizQuestion));
    await this.questions.save(entities);

    return { imported: entities.length, errors };
  }

  async adminExportQuestionsCSV(filters: {
    quizWeek?: number;
    difficulty?: string;
    category?: string;
  }): Promise<string> {
    const qb = this.questions.createQueryBuilder('q').orderBy('q.quizWeek', 'ASC').addOrderBy('q.createdAt', 'ASC');
    if (filters.quizWeek !== undefined) qb.andWhere('q.quizWeek = :week', { week: filters.quizWeek });
    if (filters.difficulty) qb.andWhere('q.difficulty = :difficulty', { difficulty: filters.difficulty });
    if (filters.category) qb.andWhere('q.category = :category', { category: filters.category });
    const list = await qb.getMany();

    const header = 'question_type,question_text,option_a,option_b,option_c,option_d,correct_answer,correct_answers,correct_number,numeric_tolerance,numeric_unit,points,difficulty,category,quiz_week,is_mandatory,is_active\n';
    const rows = list.map((q) =>
      [
        q.questionType ?? 'mcq',
        q.questionText,
        q.optionA, q.optionB, q.optionC, q.optionD,
        q.correctAnswer ?? '',
        (q.correctAnswers ?? []).join(','),
        q.correctNumber ?? '',
        q.numericTolerance ?? '',
        q.numericUnit ?? '',
        q.points, q.difficulty, q.category, q.quizWeek, q.isMandatory, q.isActive,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    ).join('\n');

    return header + rows;
  }

  private parseImportRow(row: Record<string, unknown>, defaultQuizWeek?: number): Partial<QuizQuestion> {
    // Normalize header keys once: trim, lowercase, drop spaces/punctuation.
    // This lets us accept friendly headers ("Question", "Option A", "Correct Answer")
    // alongside the canonical snake_case names ("question_text", "option_a").
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const FRIENDLY_ALIASES: Record<string, string> = {
      // canonical → list of friendly forms (all already normalized)
      question_text: 'question',
      option_a: 'optiona',
      option_b: 'optionb',
      option_c: 'optionc',
      option_d: 'optiond',
      correct_answer: 'correctanswer',
      correct_answers: 'correctanswers',
      correct_number: 'correctnumber',
      numeric_tolerance: 'numerictolerance',
      numeric_unit: 'numericunit',
      quiz_week: 'quizweek',
      is_mandatory: 'ismandatory',
      question_type: 'questiontype',
    };
    const normalizedRow: Record<string, unknown> = {};
    for (const k of Object.keys(row)) normalizedRow[normalize(k)] = row[k];

    const get = (key: string): string => {
      const v =
        row[key] ??
        row[key.replace(/_/g, '')] ??
        row[this.camelize(key)] ??
        normalizedRow[normalize(key)] ??
        normalizedRow[FRIENDLY_ALIASES[key] ?? ''];
      return v == null ? '' : String(v).trim();
    };
    const getNum = (key: string): number | null => {
      const s = get(key);
      if (s === '') return null;
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    };
    const rawType = get('question_type').toLowerCase();
    const type: QuizQuestionType =
      ['mcq', 'true_false', 'multi_select', 'numeric'].includes(rawType)
        ? (rawType as QuizQuestionType)
        : 'mcq';

    const correctAnswersRaw = get('correct_answers');
    const correctAnswers = correctAnswersRaw
      ? correctAnswersRaw.split(/[,;|]/).map((s) => s.trim().toUpperCase()).filter(Boolean)
      : null;

    return {
      questionType: type,
      questionText: get('question_text'),
      optionA: get('option_a') || (type === 'true_false' ? 'True' : ''),
      optionB: get('option_b') || (type === 'true_false' ? 'False' : ''),
      optionC: get('option_c'),
      optionD: get('option_d'),
      correctAnswer: get('correct_answer').toUpperCase() as 'A' | 'B' | 'C' | 'D' | null || null,
      correctAnswers: correctAnswers,
      correctNumber: getNum('correct_number'),
      numericTolerance: getNum('numeric_tolerance') ?? 0,
      numericUnit: get('numeric_unit') || null,
      points: parseInt(get('points'), 10),
      difficulty: get('difficulty').toLowerCase() as 'easy' | 'medium' | 'hard',
      category: get('category'),
      quizWeek: get('quiz_week') ? parseInt(get('quiz_week'), 10) : (defaultQuizWeek ?? NaN),
      isMandatory: ['true', '1', 'yes', 'y'].includes(get('is_mandatory').toLowerCase()),
      isActive: true,
    };
  }

  private camelize(s: string): string {
    return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  }

  private validateQuestion(q: Partial<QuizQuestion>) {
    if (!q.questionText?.trim()) throw new BadRequestException('question_text is required');

    const type = q.questionType ?? 'mcq';

    if (type === 'mcq') {
      if (!q.optionA?.trim()) throw new BadRequestException('option_a is required');
      if (!q.optionB?.trim()) throw new BadRequestException('option_b is required');
      if (!q.optionC?.trim()) throw new BadRequestException('option_c is required');
      if (!q.optionD?.trim()) throw new BadRequestException('option_d is required');
      if (!['A', 'B', 'C', 'D'].includes(q.correctAnswer ?? '')) {
        throw new BadRequestException('correct_answer must be A, B, C, or D');
      }
    } else if (type === 'true_false') {
      if (!['A', 'B'].includes(q.correctAnswer ?? '')) {
        throw new BadRequestException('correct_answer must be A (True) or B (False)');
      }
    } else if (type === 'multi_select') {
      if (!q.optionA?.trim() || !q.optionB?.trim()) {
        throw new BadRequestException('option_a and option_b required for multi_select');
      }
      if (!q.correctAnswers || q.correctAnswers.length === 0) {
        throw new BadRequestException('correct_answers required for multi_select (e.g. "A,C")');
      }
      const invalid = q.correctAnswers.filter((c) => !['A', 'B', 'C', 'D'].includes(c));
      if (invalid.length) throw new BadRequestException(`correct_answers must contain only A/B/C/D. Got: ${invalid.join(',')}`);
    } else if (type === 'numeric') {
      if (q.correctNumber == null) throw new BadRequestException('correct_number is required for numeric');
      if (q.numericTolerance != null && q.numericTolerance < 0) {
        throw new BadRequestException('numeric_tolerance must be >= 0');
      }
    } else {
      throw new BadRequestException(`Invalid question_type: ${type}`);
    }

    if (!q.points || q.points < 1 || !Number.isInteger(q.points)) {
      throw new BadRequestException('points must be a positive integer (1 or higher)');
    }
    if (!['easy', 'medium', 'hard'].includes(q.difficulty ?? '')) {
      throw new BadRequestException('difficulty must be easy, medium, or hard');
    }
    if (!q.category?.trim()) throw new BadRequestException('category is required');
    if (!q.quizWeek || q.quizWeek < 1) throw new BadRequestException('quiz_week must be a positive integer');
  }
}
