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

const QUESTIONS_PER_QUIZ = 5;
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
        questionsPerQuiz: QUESTIONS_PER_QUIZ,
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

    return {
      status,
      quizWeek: week,
      title: config.title,
      description: config.description,
      startsAt: config.startsAt,
      endsAt: config.endsAt,
      durationMinutes: config.durationMinutes,
      questionsPerQuiz: QUESTIONS_PER_QUIZ,
      totalQuestionsAvailable: totalQuestions,
      totalSubmissions,
      isOpen: status === 'live' && totalQuestions >= QUESTIONS_PER_QUIZ,
    };
  }

  // ── Public: Start Quiz ────────────────────────────────────────────────

  async startQuiz(opts: {
    fullName: string;
    email: string;
    upiId: string;
    youtubeHandle?: string;
    ipAddress?: string;
  }): Promise<{
    sessionId: string;
    quizWeek: number;
    questionNumber: number;
    totalQuestions: number;
    question: PublicQuestion;
    expiresAt: string;
    durationMinutes: number;
  }> {
    const { fullName, email, upiId, youtubeHandle, ipAddress } = opts;

    // Validate inputs
    if (!fullName?.trim()) throw new BadRequestException('Full name is required');
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email is required');
    }
    if (!upiId?.trim()) throw new BadRequestException('UPI ID or Amazon email is required');

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

    // Pick 5 random questions weighted by difficulty: 2 easy, 2 medium, 1 hard (if available)
    const picked = await this.pickQuestionsForWeek(quizWeek);
    if (picked.length < QUESTIONS_PER_QUIZ) {
      throw new BadRequestException('Not enough active questions in the bank');
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + info.durationMinutes * 60 * 1000);

    const session = this.sessions.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      upiId: upiId.trim(),
      youtubeHandle: youtubeHandle?.trim() || null,
      quizWeek,
      questionIds: picked.map((q) => q.id),
      currentIndex: 0,
      answers: [],
      startedAt,
      expiresAt,
      questionStartedAt: startedAt,
      ipAddress: ipAddress ?? null,
    });
    await this.sessions.save(session);

    return {
      sessionId: session.id,
      quizWeek,
      questionNumber: 1,
      totalQuestions: QUESTIONS_PER_QUIZ,
      question: this.toPublicQuestion(picked[0]),
      expiresAt: expiresAt.toISOString(),
      durationMinutes: info.durationMinutes,
    };
  }

  // ── Public: Submit Answer ─────────────────────────────────────────────

  async submitAnswer(opts: {
    sessionId: string;
    selectedAnswer?: string; // 'A' for mcq/t-f
    selectedAnswers?: string[]; // ['A', 'C'] for multi_select
    selectedNumber?: number; // for numeric
  }): Promise<
    | { done: false; questionNumber: number; totalQuestions: number; question: PublicQuestion; expiresAt?: string }
    | { done: true; needsTiebreaker: boolean; expired?: boolean }
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

    // Score based on question type
    const { isCorrect, recordedAnswer, recordedNumber } = this.gradeAnswer(question, opts);
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
      return { done: true, needsTiebreaker: true };
    }

    const nextQuestion = await this.questions.findOne({
      where: { id: session.questionIds[session.currentIndex] },
    });
    if (!nextQuestion) throw new NotFoundException('Next question not found');

    return {
      done: false,
      questionNumber: session.currentIndex + 1,
      totalQuestions: session.questionIds.length,
      question: this.toPublicQuestion(nextQuestion),
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
  }): Promise<{
    submissionId: string;
    totalScore: number;
    maxScore: number;
    correctCount: number;
    totalQuestions: number;
    totalTimeSeconds: number;
    rank: number;
    totalSubmissions: number;
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

    return this.getSubmissionStats(saved.id);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private toPublicQuestion(q: QuizQuestion): PublicQuestion {
    // For true_false: coerce options to "True"/"False" so admins don't need to set them
    const isTF = q.questionType === 'true_false';
    return {
      id: q.id,
      questionType: q.questionType ?? 'mcq',
      questionText: q.questionText,
      optionA: isTF ? (q.optionA || 'True') : q.optionA,
      optionB: isTF ? (q.optionB || 'False') : q.optionB,
      optionC: isTF ? '' : q.optionC,
      optionD: isTF ? '' : q.optionD,
      numericUnit: q.numericUnit ?? null,
    };
  }

  private async pickQuestionsForWeek(quizWeek: number): Promise<QuizQuestion[]> {
    // Try weighted: 2 easy, 2 medium, 1 hard
    const [easy, medium, hard] = await Promise.all([
      this.fetchRandomByDifficulty(quizWeek, 'easy', 2),
      this.fetchRandomByDifficulty(quizWeek, 'medium', 2),
      this.fetchRandomByDifficulty(quizWeek, 'hard', 1),
    ]);

    let picked = [...easy, ...medium, ...hard];
    if (picked.length < QUESTIONS_PER_QUIZ) {
      // Fall back to any active question
      const fallback = await this.questions
        .createQueryBuilder('q')
        .where('q.quizWeek = :week AND q.isActive = true', { week: quizWeek })
        .andWhere('q.id NOT IN (:...ids)', { ids: picked.length ? picked.map((p) => p.id) : ['00000000-0000-0000-0000-000000000000'] })
        .orderBy('RANDOM()')
        .limit(QUESTIONS_PER_QUIZ - picked.length)
        .getMany();
      picked = [...picked, ...fallback];
    }

    // Shuffle to avoid difficulty pattern
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
    return picked.slice(0, QUESTIONS_PER_QUIZ);
  }

  private async fetchRandomByDifficulty(
    quizWeek: number,
    difficulty: 'easy' | 'medium' | 'hard',
    limit: number,
  ): Promise<QuizQuestion[]> {
    return this.questions
      .createQueryBuilder('q')
      .where('q.quizWeek = :week AND q.isActive = true AND q.difficulty = :difficulty', {
        week: quizWeek,
        difficulty,
      })
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

  private async getSubmissionStats(submissionId: string) {
    const submission = await this.submissions.findOne({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('Submission not found');

    const correctCount = await this.answers.count({
      where: { submissionId, isCorrect: true },
    });
    const totalQuestions = await this.answers.count({ where: { submissionId } });

    // Compute rank for this submission within the same week
    const better = await this.submissions
      .createQueryBuilder('s')
      .where('s.quizWeek = :week', { week: submission.quizWeek })
      .andWhere(
        '(s.totalScore > :score OR (s.totalScore = :score AND s.totalTimeSeconds < :time))',
        { score: submission.totalScore, time: submission.totalTimeSeconds },
      )
      .getCount();

    const totalSubmissions = await this.submissions.count({
      where: { quizWeek: submission.quizWeek },
    });

    // Max possible score for this submission's set
    const questions = await this.questions.find({
      where: { id: In(submission.id ? [] : []) }, // placeholder
    });
    void questions;
    // Recalculate max score from the answer rows + 0 for incorrect
    const maxScoreRaw = await this.answers
      .createQueryBuilder('a')
      .leftJoin('a.question', 'q')
      .select('COALESCE(SUM(q.points), 0)', 'total')
      .where('a.submissionId = :id', { id: submissionId })
      .getRawOne<{ total: string }>();
    const maxScore = parseInt(maxScoreRaw?.total ?? '0', 10);

    return {
      submissionId: submission.id,
      totalScore: submission.totalScore,
      maxScore,
      correctCount,
      totalQuestions,
      totalTimeSeconds: submission.totalTimeSeconds,
      rank: better + 1,
      totalSubmissions,
    };
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

    const existing = await this.configs.findOne({ where: { quizWeek: body.quizWeek } });
    if (existing) {
      Object.assign(existing, {
        title: body.title ?? existing.title,
        description: body.description ?? existing.description,
        startsAt,
        endsAt,
        durationMinutes: body.durationMinutes ?? existing.durationMinutes,
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
      .orderBy('s.totalScore', 'DESC')
      .addOrderBy('s.totalTimeSeconds', 'ASC');
    if (quizWeek !== undefined) qb.andWhere('s.quizWeek = :week', { week: quizWeek });
    const subs = await qb.getMany();

    const header = 'rank,fullName,email,upiId,youtubeHandle,quizWeek,totalScore,totalTimeSeconds,tiebreakerAnswer,winnerRank,submittedAt\n';
    const rows = subs.map((s, i) =>
      [
        i + 1,
        s.fullName,
        s.email,
        s.upiId,
        s.youtubeHandle ?? '',
        s.quizWeek,
        s.totalScore,
        s.totalTimeSeconds,
        s.tiebreakerAnswer ?? '',
        s.winnerRank ?? '',
        s.submittedAt.toISOString(),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    ).join('\n');

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
        const parsed = this.parseImportRow(row);
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

    const header = 'question_type,question_text,option_a,option_b,option_c,option_d,correct_answer,correct_answers,correct_number,numeric_tolerance,numeric_unit,points,difficulty,category,quiz_week,is_active\n';
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
        q.points, q.difficulty, q.category, q.quizWeek, q.isActive,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    ).join('\n');

    return header + rows;
  }

  private parseImportRow(row: Record<string, unknown>): Partial<QuizQuestion> {
    const get = (key: string): string => {
      const v = row[key] ?? row[key.replace(/_/g, '')] ?? row[this.camelize(key)];
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
      quizWeek: parseInt(get('quiz_week'), 10),
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

    if (![1, 2, 3].includes(q.points ?? 0)) {
      throw new BadRequestException('points must be 1, 2, or 3');
    }
    if (!['easy', 'medium', 'hard'].includes(q.difficulty ?? '')) {
      throw new BadRequestException('difficulty must be easy, medium, or hard');
    }
    if (!q.category?.trim()) throw new BadRequestException('category is required');
    if (!q.quizWeek || q.quizWeek < 1) throw new BadRequestException('quiz_week must be a positive integer');
  }
}
