import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, MoreThan, MoreThanOrEqual, Between } from 'typeorm';
import { User } from '../users/user.entity';
import { Session } from '../sessions/session.entity';
import { UserFeedback } from '../user-feedback/user-feedback.entity';
import { Question } from '../questions/question.entity';
import { Feedback } from '../feedback/feedback.entity';
import { AdminNote } from './admin-note.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(UserFeedback) private readonly userFeedbacks: Repository<UserFeedback>,
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    @InjectRepository(Feedback) private readonly feedbacks: Repository<Feedback>,
    @InjectRepository(AdminNote) private readonly adminNotes: Repository<AdminNote>,
  ) {}

  // ── Overview Stats ────────────────────────────────────────────────────

  async getStats() {
    const [
      totalUsers,
      proUsers,
      totalSessions,
      completedSessions,
      newUsersToday,
      newUsersThisWeek,
      activeStreaks,
      userFeedbackCount,
    ] = await Promise.all([
      this.users.count(),
      this.users.count({ where: { subscriptionTier: 'pro' } }),
      this.sessions.count(),
      this.sessions.count({ where: { status: 'completed' } }),
      this.users.count({
        where: { createdAt: MoreThanOrEqual(this.startOfDay()) },
      }),
      this.users.count({
        where: { createdAt: MoreThanOrEqual(this.startOfWeek()) },
      }),
      this.users.count({
        where: { currentStreak: MoreThan(0) },
      }),
      this.userFeedbacks.count(),
    ]);

    const avgScoreResult = await this.sessions
      .createQueryBuilder('s')
      .select('AVG(s.overallScore)', 'avg')
      .where('s.overallScore IS NOT NULL')
      .getRawOne<{ avg: string }>();

    const subscriptionBreakdown = await this.users
      .createQueryBuilder('u')
      .select('u.subscriptionTier', 'tier')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.subscriptionTier')
      .getRawMany<{ tier: string; count: string }>();

    return {
      totalUsers,
      proUsers,
      freeUsers: totalUsers - proUsers,
      totalSessions,
      completedSessions,
      newUsersToday,
      newUsersThisWeek,
      activeStreaks,
      userFeedbackCount,
      avgSessionScore: avgScoreResult?.avg ? Math.round(parseFloat(avgScoreResult.avg)) : null,
      subscriptionBreakdown: subscriptionBreakdown.map((r) => ({
        tier: r.tier,
        count: parseInt(r.count, 10),
      })),
    };
  }

  // ── Analytics ─────────────────────────────────────────────────────────

  async getDAUWAU(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Daily active users (users who had a session that day)
    const dau = await this.sessions
      .createQueryBuilder('s')
      .select("DATE(s.createdAt)", 'date')
      .addSelect('COUNT(DISTINCT s.userId)', 'activeUsers')
      .where('s.createdAt >= :since', { since })
      .groupBy("DATE(s.createdAt)")
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; activeUsers: string }>();

    // New users per day
    const newUsers = await this.users
      .createQueryBuilder('u')
      .select("DATE(u.createdAt)", 'date')
      .addSelect('COUNT(*)', 'newUsers')
      .where('u.createdAt >= :since', { since })
      .groupBy("DATE(u.createdAt)")
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; newUsers: string }>();

    // Total sessions per day
    const sessionsPerDay = await this.sessions
      .createQueryBuilder('s')
      .select("DATE(s.createdAt)", 'date')
      .addSelect('COUNT(*)', 'sessions')
      .where('s.createdAt >= :since', { since })
      .groupBy("DATE(s.createdAt)")
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; sessions: string }>();

    // Merge into single array
    const dateMap = new Map<string, { date: string; activeUsers: number; newUsers: number; sessions: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const key = d.toISOString().slice(0, 10);
      dateMap.set(key, { date: key, activeUsers: 0, newUsers: 0, sessions: 0 });
    }
    dau.forEach((r) => {
      const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
      const entry = dateMap.get(key);
      if (entry) entry.activeUsers = parseInt(r.activeUsers, 10);
    });
    newUsers.forEach((r) => {
      const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
      const entry = dateMap.get(key);
      if (entry) entry.newUsers = parseInt(r.newUsers, 10);
    });
    sessionsPerDay.forEach((r) => {
      const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
      const entry = dateMap.get(key);
      if (entry) entry.sessions = parseInt(r.sessions, 10);
    });

    return Array.from(dateMap.values());
  }

  async getSessionHeatmap() {
    const raw = await this.sessions
      .createQueryBuilder('s')
      .select('EXTRACT(DOW FROM s.createdAt)', 'dayOfWeek')
      .addSelect('EXTRACT(HOUR FROM s.createdAt)', 'hour')
      .addSelect('COUNT(*)', 'count')
      .groupBy('EXTRACT(DOW FROM s.createdAt)')
      .addGroupBy('EXTRACT(HOUR FROM s.createdAt)')
      .getRawMany<{ dayOfWeek: string; hour: string; count: string }>();

    return raw.map((r) => ({
      dayOfWeek: parseInt(r.dayOfWeek, 10),
      hour: parseInt(r.hour, 10),
      count: parseInt(r.count, 10),
    }));
  }

  async getFunnel() {
    const [totalSignups, onboarded, hadFirstSession, subscribed] = await Promise.all([
      this.users.count(),
      this.users.count({ where: { onboardingCompleted: true } }),
      this.sessions
        .createQueryBuilder('s')
        .select('COUNT(DISTINCT s.userId)', 'count')
        .getRawOne<{ count: string }>()
        .then((r) => parseInt(r?.count ?? '0', 10)),
      this.users.count({ where: { subscriptionTier: 'pro' } }),
    ]);

    return { totalSignups, onboarded, hadFirstSession, subscribed };
  }

  async getRetention(weeks = 8) {
    // Build weekly cohorts based on user signup date
    const cohorts: Array<{
      cohortWeek: string;
      cohortSize: number;
      retention: number[]; // percentage retained each week after signup
    }> = [];

    for (let w = weeks - 1; w >= 0; w--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const cohortUsers = await this.users.find({
        where: { createdAt: Between(weekStart, weekEnd) },
        select: ['id'],
      });

      if (cohortUsers.length === 0) {
        cohorts.push({
          cohortWeek: weekStart.toISOString().slice(0, 10),
          cohortSize: 0,
          retention: [],
        });
        continue;
      }

      const userIds = cohortUsers.map((u) => u.id);
      const retention: number[] = [];

      // For each subsequent week, check how many users were active
      for (let rw = 0; rw <= w; rw++) {
        const retStart = new Date(weekStart);
        retStart.setDate(retStart.getDate() + rw * 7);
        const retEnd = new Date(retStart);
        retEnd.setDate(retEnd.getDate() + 7);

        const activeCount = await this.sessions
          .createQueryBuilder('s')
          .select('COUNT(DISTINCT s.userId)', 'count')
          .where('s.userId IN (:...ids)', { ids: userIds })
          .andWhere('s.createdAt >= :start AND s.createdAt < :end', { start: retStart, end: retEnd })
          .getRawOne<{ count: string }>();

        retention.push(
          Math.round((parseInt(activeCount?.count ?? '0', 10) / cohortUsers.length) * 100),
        );
      }

      cohorts.push({
        cohortWeek: weekStart.toISOString().slice(0, 10),
        cohortSize: cohortUsers.length,
        retention,
      });
    }

    return cohorts;
  }

  // ── Users ─────────────────────────────────────────────────────────────

  async getUsers(opts: {
    page: number;
    limit: number;
    search?: string;
    tier?: string;
    status?: string;
  }) {
    const { page, limit, search, tier, status } = opts;
    const skip = (page - 1) * limit;

    const qb = this.users
      .createQueryBuilder('u')
      .loadRelationCountAndMap('u.sessionCount', 'u.sessions')
      .orderBy('u.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (search) {
      qb.andWhere('(u.email ILIKE :s OR u.firstName ILIKE :s OR u.lastName ILIKE :s)', {
        s: `%${search}%`,
      });
    }
    if (tier) qb.andWhere('u.subscriptionTier = :tier', { tier });
    if (status) qb.andWhere('u.subscriptionStatus = :status', { status });

    const [users, total] = await qb.getManyAndCount();

    return {
      data: users.map((u) => this.sanitiseUser(u)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getUserDetail(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const [sessions, feedbacks, notes] = await Promise.all([
      this.sessions.find({
        where: { userId: id },
        order: { createdAt: 'DESC' },
        take: 50,
      }),
      this.userFeedbacks.find({
        where: { userId: id },
        order: { createdAt: 'DESC' },
      }),
      this.adminNotes.find({
        where: { userId: id },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const sessionStats = {
      total: sessions.length,
      completed: sessions.filter((s) => s.status === 'completed').length,
      avgScore:
        sessions.filter((s) => s.overallScore !== null).length > 0
          ? Math.round(
              sessions.reduce((sum, s) => sum + (s.overallScore ?? 0), 0) /
                sessions.filter((s) => s.overallScore !== null).length,
            )
          : null,
      byType: sessions.reduce<Record<string, number>>((acc, s) => {
        acc[s.interviewType] = (acc[s.interviewType] ?? 0) + 1;
        return acc;
      }, {}),
    };

    return {
      user: this.sanitiseUser(user),
      sessions: sessions.map((s) => ({
        id: s.id,
        interviewType: s.interviewType,
        status: s.status,
        overallScore: s.overallScore,
        targetRole: s.targetRole,
        targetCompany: s.targetCompany,
        durationMinutes: s.durationMinutes,
        completedAt: s.completedAt,
        createdAt: s.createdAt,
      })),
      sessionStats,
      feedbacks,
      notes,
    };
  }

  async updateUser(
    id: string,
    body: {
      isAdmin?: boolean;
      subscriptionTier?: string;
      subscriptionStatus?: string;
      subscriptionEndsAt?: string;
    },
  ) {
    const updateData: Record<string, unknown> = {};
    if (body.isAdmin !== undefined) updateData.isAdmin = body.isAdmin;
    if (body.subscriptionTier !== undefined) updateData.subscriptionTier = body.subscriptionTier;
    if (body.subscriptionStatus !== undefined) updateData.subscriptionStatus = body.subscriptionStatus;
    if (body.subscriptionEndsAt !== undefined) updateData.subscriptionEndsAt = body.subscriptionEndsAt;

    await this.users.update(id, updateData);
    return this.users.findOneOrFail({ where: { id } });
  }

  async exportUsersCSV() {
    const users = await this.users.find({ order: { createdAt: 'DESC' } });

    const header = 'id,email,firstName,lastName,subscriptionTier,subscriptionStatus,currentStreak,longestStreak,onboardingCompleted,isAdmin,createdAt,lastActiveDate\n';
    const rows = users.map((u) =>
      [
        u.id,
        u.email,
        u.firstName ?? '',
        u.lastName ?? '',
        u.subscriptionTier,
        u.subscriptionStatus ?? '',
        u.currentStreak,
        u.longestStreak,
        u.onboardingCompleted,
        u.isAdmin,
        u.createdAt.toISOString(),
        u.lastActiveDate ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    ).join('\n');

    return header + rows;
  }

  // ── Admin Notes ───────────────────────────────────────────────────────

  async addNote(userId: string, content: string, authorEmail: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const note = this.adminNotes.create({ userId, content, authorEmail });
    return this.adminNotes.save(note);
  }

  async deleteNote(noteId: string) {
    const note = await this.adminNotes.findOne({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Note not found');
    await this.adminNotes.remove(note);
    return { deleted: true };
  }

  // ── Session Review ────────────────────────────────────────────────────

  async getSessionsForReview(opts: {
    page: number;
    limit: number;
    type?: string;
    status?: string;
    search?: string;
  }) {
    const { page, limit, type, status, search } = opts;

    const qb = this.sessions
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.feedback', 'f')
      .leftJoin('s.user', 'u')
      .addSelect(['u.email', 'u.firstName', 'u.lastName'])
      .orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (type) qb.andWhere('s.interviewType = :type', { type });
    if (status) qb.andWhere('s.status = :status', { status });
    if (search) {
      qb.andWhere('(u.email ILIKE :s OR u.firstName ILIKE :s OR u.lastName ILIKE :s)', {
        s: `%${search}%`,
      });
    }

    const [sessions, total] = await qb.getManyAndCount();

    return {
      data: sessions.map((s) => ({
        id: s.id,
        interviewType: s.interviewType,
        mode: s.mode,
        status: s.status,
        overallScore: s.overallScore,
        targetRole: s.targetRole,
        targetCompany: s.targetCompany,
        durationMinutes: s.durationMinutes,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        createdAt: s.createdAt,
        userEmail: (s.user as User)?.email ?? null,
        userName: [(s.user as User)?.firstName, (s.user as User)?.lastName].filter(Boolean).join(' ') || null,
        hasFeedback: !!s.feedback,
        feedbackScore: s.feedback?.overallScore ?? null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async getSessionDetail(sessionId: string) {
    const session = await this.sessions.findOne({
      where: { id: sessionId },
      relations: ['feedback', 'user'],
    });
    if (!session) throw new NotFoundException('Session not found');

    return {
      id: session.id,
      interviewType: session.interviewType,
      mode: session.mode,
      status: session.status,
      overallScore: session.overallScore,
      targetRole: session.targetRole,
      targetCompany: session.targetCompany,
      durationMinutes: session.durationMinutes,
      transcript: session.transcript,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
      user: {
        id: session.user.id,
        email: session.user.email,
        firstName: session.user.firstName,
        lastName: session.user.lastName,
      },
      feedback: session.feedback
        ? {
            id: session.feedback.id,
            overallScore: session.feedback.overallScore,
            dimensionScores: session.feedback.dimensionScores,
            summary: session.feedback.summary,
            questionFeedback: session.feedback.questionFeedback,
            weakAreas: session.feedback.weakAreas,
            modelUsed: session.feedback.modelUsed,
          }
        : null,
    };
  }

  // ── Question Bank Admin ───────────────────────────────────────────────

  async getQuestionsAdmin(opts: {
    page: number;
    limit: number;
    type?: string;
    difficulty?: string;
    search?: string;
    active?: string;
  }) {
    const { page, limit, type, difficulty, search, active } = opts;

    const qb = this.questions
      .createQueryBuilder('q')
      .orderBy('q.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (type) qb.andWhere('q.type = :type', { type });
    if (difficulty) qb.andWhere('q.difficulty = :difficulty', { difficulty });
    if (search) qb.andWhere('q.question ILIKE :s', { s: `%${search}%` });
    if (active !== undefined) qb.andWhere('q.isActive = :active', { active: active === 'true' });

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async createQuestion(body: {
    question: string;
    type: string;
    difficulty: string;
    modelAnswer?: string;
    tags?: string[];
    companies?: string[];
    roles?: string[];
  }) {
    const q = this.questions.create({
      question: body.question,
      type: body.type as Question['type'],
      difficulty: body.difficulty as Question['difficulty'],
      modelAnswer: body.modelAnswer ?? undefined,
      tags: body.tags ?? [],
      companies: body.companies ?? [],
      roles: body.roles ?? [],
    });
    return this.questions.save(q);
  }

  async updateQuestion(
    id: string,
    body: Partial<{
      question: string;
      type: string;
      difficulty: string;
      modelAnswer: string;
      tags: string[];
      companies: string[];
      roles: string[];
      isActive: boolean;
    }>,
  ) {
    const q = await this.questions.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    Object.assign(q, body);
    return this.questions.save(q);
  }

  async deleteQuestion(id: string) {
    const q = await this.questions.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    q.isActive = false;
    await this.questions.save(q);
    return { deactivated: true };
  }

  // ── AI Feedback Audit ─────────────────────────────────────────────────

  async getFeedbackAudit(opts: { page: number; limit: number; minScore?: number; maxScore?: number }) {
    const { page, limit, minScore, maxScore } = opts;

    const qb = this.feedbacks
      .createQueryBuilder('f')
      .leftJoin('f.session', 's')
      .addSelect(['s.id', 's.interviewType', 's.status', 's.userId', 's.targetRole'])
      .leftJoin('s.user', 'u')
      .addSelect(['u.email', 'u.firstName', 'u.lastName'])
      .orderBy('f.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (minScore !== undefined) qb.andWhere('f.overallScore >= :minScore', { minScore });
    if (maxScore !== undefined) qb.andWhere('f.overallScore <= :maxScore', { maxScore });

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((f) => ({
        id: f.id,
        sessionId: f.sessionId,
        overallScore: f.overallScore,
        dimensionScores: f.dimensionScores,
        summary: f.summary,
        weakAreas: f.weakAreas,
        modelUsed: f.modelUsed,
        questionCount: f.questionFeedback?.length ?? 0,
        createdAt: f.createdAt,
        session: f.session
          ? {
              interviewType: f.session.interviewType,
              status: f.session.status,
              targetRole: f.session.targetRole,
            }
          : null,
        user: f.session?.user
          ? {
              email: (f.session.user as User).email,
              name: [(f.session.user as User).firstName, (f.session.user as User).lastName].filter(Boolean).join(' ') || null,
            }
          : null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  // ── User Feedback ─────────────────────────────────────────────────────

  async getFeedback(opts: { page: number; limit: number; category?: string }) {
    const { page, limit, category } = opts;
    const where: FindOptionsWhere<UserFeedback> = {};
    if (category) where.category = category;

    const [data, total] = await this.userFeedbacks.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const userIds = [...new Set(data.map((f) => f.userId))];
    const userMap = new Map<string, string>();
    if (userIds.length) {
      const usrs = await this.users.findByIds(userIds);
      usrs.forEach((u) => userMap.set(u.id, u.email));
    }

    return {
      data: data.map((f) => ({ ...f, userEmail: userMap.get(f.userId) ?? null })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  // ── Revenue ───────────────────────────────────────────────────────────

  async getRevenue() {
    const plans = await this.users
      .createQueryBuilder('u')
      .select('u.subscriptionTier', 'tier')
      .addSelect('u.subscriptionStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('u.subscriptionTier != :free', { free: 'free' })
      .groupBy('u.subscriptionTier')
      .addGroupBy('u.subscriptionStatus')
      .getRawMany<{ tier: string; status: string; count: string }>();

    const recentSubscribers = await this.users.find({
      where: { subscriptionTier: 'pro' } as FindOptionsWhere<User>,
      order: { createdAt: 'DESC' },
      take: 10,
      select: ['id', 'email', 'firstName', 'lastName', 'subscriptionTier', 'subscriptionStatus', 'subscriptionEndsAt', 'createdAt'],
    });

    return { plans, recentSubscribers };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private sanitiseUser(u: User) {
    const { googleRefreshToken: _, ...rest } = u as User & { googleRefreshToken?: string };
    void _;
    return rest;
  }

  private startOfDay(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private startOfWeek(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  }
}
