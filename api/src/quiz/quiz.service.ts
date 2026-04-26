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
  QuizSubmission,
  QuizSubmissionAnswer,
  QuizSession,
} from './quiz.entities';
import Redis from 'ioredis';

const QUESTIONS_PER_QUIZ = 5;
const RATE_LIMIT_WINDOW_SEC = 3600;
const RATE_LIMIT_MAX = 3;

export interface PublicQuestion {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  // correctAnswer NEVER included
}

@Injectable()
export class QuizService {
  private redis: Redis | null = null;

  constructor(
    @InjectRepository(QuizQuestion) private readonly questions: Repository<QuizQuestion>,
    @InjectRepository(QuizSubmission) private readonly submissions: Repository<QuizSubmission>,
    @InjectRepository(QuizSubmissionAnswer) private readonly answers: Repository<QuizSubmissionAnswer>,
    @InjectRepository(QuizSession) private readonly sessions: Repository<QuizSession>,
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
    // Find the most recent active quiz_week
    const latest = await this.questions
      .createQueryBuilder('q')
      .select('MAX(q.quizWeek)', 'week')
      .where('q.isActive = true')
      .getRawOne<{ week: string }>();

    const week = latest?.week ? parseInt(latest.week, 10) : 1;

    const totalQuestions = await this.questions.count({
      where: { quizWeek: week, isActive: true },
    });

    const totalSubmissions = await this.submissions.count({ where: { quizWeek: week } });

    return {
      quizWeek: week,
      questionsPerQuiz: QUESTIONS_PER_QUIZ,
      totalQuestionsAvailable: totalQuestions,
      totalSubmissions,
      isOpen: totalQuestions >= QUESTIONS_PER_QUIZ,
    };
  }

  // ── Public: Start Quiz ────────────────────────────────────────────────

  async startQuiz(opts: {
    fullName: string;
    email: string;
    upiId: string;
    youtubeHandle?: string;
    ipAddress?: string;
  }): Promise<{ sessionId: string; quizWeek: number; questionNumber: number; totalQuestions: number; question: PublicQuestion }> {
    const { fullName, email, upiId, youtubeHandle, ipAddress } = opts;

    // Validate inputs
    if (!fullName?.trim()) throw new BadRequestException('Full name is required');
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email is required');
    }
    if (!upiId?.trim()) throw new BadRequestException('UPI ID or Amazon email is required');

    // Determine current week
    const info = await this.getCurrentQuizInfo();
    if (!info.isOpen) throw new BadRequestException('No active quiz available right now');
    const quizWeek = info.quizWeek;

    // Check email uniqueness for this week
    const existing = await this.submissions.findOne({
      where: { email: email.toLowerCase().trim(), quizWeek },
    });
    if (existing) throw new ConflictException('You have already submitted this week\'s quiz');

    // Rate limit by IP (max 3 attempts/hour)
    if (ipAddress) await this.checkRateLimit(ipAddress);

    // Pick 5 random questions weighted by difficulty: 2 easy, 2 medium, 1 hard (if available)
    const picked = await this.pickQuestionsForWeek(quizWeek);
    if (picked.length < QUESTIONS_PER_QUIZ) {
      throw new BadRequestException('Not enough active questions in the bank');
    }

    const session = this.sessions.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      upiId: upiId.trim(),
      youtubeHandle: youtubeHandle?.trim() || null,
      quizWeek,
      questionIds: picked.map((q) => q.id),
      currentIndex: 0,
      answers: [],
      startedAt: new Date(),
      questionStartedAt: new Date(),
      ipAddress: ipAddress ?? null,
    });
    await this.sessions.save(session);

    return {
      sessionId: session.id,
      quizWeek,
      questionNumber: 1,
      totalQuestions: QUESTIONS_PER_QUIZ,
      question: this.toPublicQuestion(picked[0]),
    };
  }

  // ── Public: Submit Answer ─────────────────────────────────────────────

  async submitAnswer(opts: {
    sessionId: string;
    selectedAnswer: 'A' | 'B' | 'C' | 'D';
  }): Promise<
    | { done: false; questionNumber: number; totalQuestions: number; question: PublicQuestion }
    | { done: true; needsTiebreaker: boolean }
  > {
    const { sessionId, selectedAnswer } = opts;
    if (!['A', 'B', 'C', 'D'].includes(selectedAnswer)) {
      throw new BadRequestException('Invalid answer');
    }

    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.completed) throw new ForbiddenException('Quiz already completed');
    if (session.currentIndex >= session.questionIds.length) {
      throw new ForbiddenException('All questions already answered');
    }

    const currentQuestionId = session.questionIds[session.currentIndex];
    const question = await this.questions.findOne({ where: { id: currentQuestionId } });
    if (!question) throw new NotFoundException('Question not found');

    const isCorrect = selectedAnswer === question.correctAnswer;
    const pointsEarned = isCorrect ? question.points : 0;
    const now = new Date();
    const startedAt = session.questionStartedAt ?? session.startedAt;
    const timeTakenSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000),
    );

    session.answers = [
      ...session.answers,
      { questionId: question.id, selectedAnswer, isCorrect, pointsEarned, timeTakenSeconds },
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
    };
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
    if (session.currentIndex < session.questionIds.length) {
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
    return {
      id: q.id,
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
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
    const q = this.questions.create({
      questionText: body.questionText!,
      optionA: body.optionA!,
      optionB: body.optionB!,
      optionC: body.optionC!,
      optionD: body.optionD!,
      correctAnswer: body.correctAnswer!,
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

    const header = 'question_text,option_a,option_b,option_c,option_d,correct_answer,points,difficulty,category,quiz_week,is_active\n';
    const rows = list.map((q) =>
      [
        q.questionText, q.optionA, q.optionB, q.optionC, q.optionD,
        q.correctAnswer, q.points, q.difficulty, q.category, q.quizWeek, q.isActive,
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
    return {
      questionText: get('question_text'),
      optionA: get('option_a'),
      optionB: get('option_b'),
      optionC: get('option_c'),
      optionD: get('option_d'),
      correctAnswer: get('correct_answer').toUpperCase() as 'A' | 'B' | 'C' | 'D',
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
    if (!q.optionA?.trim()) throw new BadRequestException('option_a is required');
    if (!q.optionB?.trim()) throw new BadRequestException('option_b is required');
    if (!q.optionC?.trim()) throw new BadRequestException('option_c is required');
    if (!q.optionD?.trim()) throw new BadRequestException('option_d is required');
    if (!['A', 'B', 'C', 'D'].includes(q.correctAnswer ?? '')) {
      throw new BadRequestException('correct_answer must be A, B, C, or D');
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
