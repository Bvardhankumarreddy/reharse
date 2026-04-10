import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Session } from './session.entity';
import { User } from '../users/user.entity';
import type { CreateSessionDto } from './dto/create-session.dto';
import type { UpdateSessionDto } from './dto/update-session.dto';

/** Free-tier limits */
const FREE_WEEKLY_SESSION_LIMIT = 5;
const PRO_ONLY_MODES = new Set(['voice', 'mixed']);
const PRO_ONLY_TYPES = new Set(['coding', 'system-design', 'hr', 'case-study']);

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session) private readonly repo:     Repository<Session>,
    @InjectRepository(User)    private readonly userRepo: Repository<User>,
  ) {}

  private async assertProGating(userId: string, dto: CreateSessionDto): Promise<void> {
    const user = await this.userRepo.findOne({
      where:  { id: userId },
      select: ['id', 'subscriptionTier', 'subscriptionStatus', 'subscriptionEndsAt'],
    });
    const isPro = user?.subscriptionTier === 'pro' &&
      (user.subscriptionStatus === 'active' ||
        (user.subscriptionStatus === 'day_pass' &&
          (!user.subscriptionEndsAt || user.subscriptionEndsAt > new Date())));
    if (isPro) return; // Pro users bypass all limits

    // Pro-only interview types
    if (PRO_ONLY_TYPES.has(dto.interviewType)) {
      throw new ForbiddenException(
        `${dto.interviewType} interviews require a Pro subscription. Upgrade at /settings?tab=billing.`,
      );
    }

    // Company-specific mode is Pro-only
    if (dto.targetCompany) {
      throw new ForbiddenException(
        'Company-specific interview modes require a Pro subscription. Upgrade at /settings?tab=billing.',
      );
    }

    // Voice / Mixed modes are Pro-only
    const mode = dto.mode ?? 'text';
    if (PRO_ONLY_MODES.has(mode)) {
      throw new ForbiddenException(
        'Voice and Mixed interview modes require a Pro subscription. Upgrade at /settings?tab=billing.',
      );
    }

    // Weekly session cap
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekCount = await this.repo.count({
      where: { userId, createdAt: MoreThanOrEqual(weekAgo) },
    });
    if (weekCount >= FREE_WEEKLY_SESSION_LIMIT) {
      throw new ForbiddenException(
        `Free accounts are limited to ${FREE_WEEKLY_SESSION_LIMIT} sessions per week. Upgrade to Pro for unlimited sessions.`,
      );
    }
  }

  async create(userId: string, dto: CreateSessionDto): Promise<Session> {
    await this.assertProGating(userId, dto);

    const session = this.repo.create({
      userId,
      interviewType:    dto.interviewType as Session['interviewType'],
      targetRole:       dto.targetRole,
      targetCompany:    dto.targetCompany,
      experienceLevel:  dto.experienceLevel,
      mode:             (dto.mode ?? 'text') as Session['mode'],
      durationMinutes:  dto.durationMinutes ?? 45,
      status:           'pending',
      pinnedQuestionIds: dto.questionIds?.length ? dto.questionIds : null,
    });
    return this.repo.save(session);
  }

  async findAllForUser(userId: string): Promise<Session[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async findOne(id: string, userId: string): Promise<Session> {
    const session = await this.repo.findOne({
      where: { id },
      relations: ['feedback'],
    });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    if (session.userId !== userId) throw new ForbiddenException();
    return session;
  }

  async update(id: string, userId: string, dto: UpdateSessionDto): Promise<Session> {
    const session = await this.findOne(id, userId);
    if (dto.status === 'active' && !session.startedAt) {
      session.startedAt = new Date();
    }
    if (dto.status === 'completed' && !session.completedAt) {
      session.completedAt = new Date();
    }
    Object.assign(session, dto);
    return this.repo.save(session);
  }

  async delete(id: string, userId: string): Promise<void> {
    const session = await this.findOne(id, userId);
    await this.repo.remove(session);
  }
}
