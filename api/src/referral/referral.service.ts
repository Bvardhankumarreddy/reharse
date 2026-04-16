import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Referral } from './referral.entity';
import { User } from '../users/user.entity';
import { randomBytes } from 'crypto';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Referral) private readonly referrals: Repository<Referral>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async getOrCreateCode(userId: string): Promise<string> {
    const existing = await this.referrals.findOne({
      where: { referrerId: userId, referredUserId: undefined as unknown as string },
    });

    // Find a referral with no referred user (the user's personal code)
    const personal = await this.referrals
      .createQueryBuilder('r')
      .where('r.referrerId = :userId', { userId })
      .andWhere('r.referredUserId IS NULL')
      .getOne();

    if (personal) return personal.code;

    const code = randomBytes(4).toString('hex').toUpperCase();
    const ref = this.referrals.create({
      code,
      referrerId: userId,
      status: 'pending',
    });
    await this.referrals.save(ref);
    return code;
  }

  async getMyReferrals(userId: string) {
    const code = await this.getOrCreateCode(userId);

    const referrals = await this.referrals.find({
      where: { referrerId: userId },
      relations: ['referredUser'],
      order: { createdAt: 'DESC' },
    });

    const completed = referrals.filter((r) => r.status !== 'pending' && r.referredUserId);

    return {
      code,
      totalReferred: completed.length,
      totalRewarded: referrals.filter((r) => r.referrerRewarded).length,
      referrals: completed.map((r) => ({
        id: r.id,
        referredEmail: r.referredUser?.email ?? null,
        referredName: r.referredUser
          ? [r.referredUser.firstName, r.referredUser.lastName].filter(Boolean).join(' ') || null
          : null,
        status: r.status,
        referrerRewarded: r.referrerRewarded,
        createdAt: r.createdAt,
      })),
    };
  }

  async applyReferralCode(userId: string, code: string) {
    const upper = code.trim().toUpperCase();

    // Find the referral code entry
    const ref = await this.referrals.findOne({
      where: { code: upper },
    });
    if (!ref) throw new NotFoundException('Invalid referral code');
    if (ref.referrerId === userId) throw new BadRequestException('Cannot use your own referral code');

    // Check if user already used a referral
    const alreadyReferred = await this.referrals.findOne({
      where: { referredUserId: userId },
    });
    if (alreadyReferred) throw new BadRequestException('You have already used a referral code');

    // Create a new referral entry for this specific referred user
    const newRef = this.referrals.create({
      code: upper,
      referrerId: ref.referrerId,
      referredUserId: userId,
      status: 'completed',
    });
    await this.referrals.save(newRef);

    // Grant rewards: 7 days Pro for both users
    const now = new Date();
    const reward = new Date(now);
    reward.setDate(reward.getDate() + 7);

    await Promise.all([
      this.grantProReward(ref.referrerId, reward),
      this.grantProReward(userId, reward),
    ]);

    newRef.referrerRewarded = true;
    newRef.referredRewarded = true;
    newRef.status = 'rewarded';
    await this.referrals.save(newRef);

    return { success: true, message: 'Referral applied! Both users get 7 days of Pro access.' };
  }

  private async grantProReward(userId: string, endsAt: Date) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) return;

    // Extend existing Pro subscription or set new one
    const currentEnd = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : new Date();
    const newEnd = currentEnd > new Date() ? new Date(currentEnd.getTime() + 7 * 86400000) : endsAt;

    await this.users.update(userId, {
      subscriptionTier: 'pro',
      subscriptionStatus: 'active',
      subscriptionEndsAt: newEnd,
    });
  }
}
