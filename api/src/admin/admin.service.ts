import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, MoreThan, MoreThanOrEqual } from 'typeorm';
import { User } from '../users/user.entity';
import { Session } from '../sessions/session.entity';
import { UserFeedback } from '../user-feedback/user-feedback.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(UserFeedback) private readonly userFeedbacks: Repository<UserFeedback>,
  ) {}

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

    const [sessions, feedbacks] = await Promise.all([
      this.sessions.find({
        where: { userId: id },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
      this.userFeedbacks.find({
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
    };
  }

  async updateUser(
    id: string,
    body: { isAdmin?: boolean; subscriptionTier?: string; subscriptionStatus?: string },
  ) {
    await this.users.update(id, body);
    return this.users.findOneOrFail({ where: { id } });
  }

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

    // Attach email to each feedback
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
