import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Razorpay = require('razorpay');
import * as crypto from 'crypto';
import { User } from '../users/user.entity';

export type AccessPassType = '3mo' | '6mo' | 'yearly';
const ACCESS_PASS_TYPES: AccessPassType[] = ['3mo', '6mo', 'yearly'];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private _rzp: Razorpay | null = null;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  private get rzp(): Razorpay {
    if (!this._rzp) {
      const keyId     = this.config.get<string>('RAZORPAY_KEY_ID')     ?? '';
      const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET') ?? '';
      if (!keyId || !keySecret || keyId.startsWith('rzp_test_your')) {
        throw new BadRequestException('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file.');
      }
      this._rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
    return this._rzp;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // ── Access-pass catalogue (one-time, app-tracked expiry) ─────────────────────
  // 3mo/6mo/yearly are one-time Razorpay orders. Amounts (paise) are
  // config-overridable; passType is stored in the order notes at creation and
  // re-read at verify time so the granted duration can never be tampered by
  // the client.

  private static readonly PASS_DURATION_DAYS: Record<AccessPassType, number> = {
    '3mo': 90,
    '6mo': 180,
    'yearly': 365,
  };

  private passAmount(passType: AccessPassType): number {
    const key =
      passType === '3mo' ? 'RAZORPAY_PASS_3MO_AMOUNT' :
      passType === '6mo' ? 'RAZORPAY_PASS_6MO_AMOUNT' :
                           'RAZORPAY_PASS_YEARLY_AMOUNT';
    const fallback = passType === '3mo' ? '27900' : passType === '6mo' ? '44900' : '59900';
    return parseInt(this.config.get<string>(key) ?? fallback, 10);
  }

  // ── Create subscription — monthly recurring only (₹120) ──────────────────────

  async createSubscription(
    userId: string,
  ): Promise<{ subscriptionId: string; keyId: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.subscriptionTier === 'pro' && user.subscriptionStatus === 'active') {
      throw new BadRequestException('Already subscribed to Pro');
    }

    const sub = await this.rzp.subscriptions.create({
      // RAZORPAY_PLAN_MONTHLY must point at the ₹120/month plan created in
      // the Razorpay dashboard.
      plan_id:         this.config.getOrThrow<string>('RAZORPAY_PLAN_MONTHLY'),
      customer_notify: 1,
      total_count:     120, // up to 10 years of monthly cycles
      notes:           { userId },
    });

    return {
      subscriptionId: sub.id,
      keyId: this.config.getOrThrow<string>('RAZORPAY_KEY_ID'),
    };
  }

  // ── Verify payment after modal success ───────────────────────────────────────

  async verifyPayment(
    userId: string,
    razorpayPaymentId: string,
    razorpaySubscriptionId: string,
    razorpaySignature: string,
  ): Promise<void> {
    const secret = this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET');

    // Razorpay signature = HMAC-SHA256(paymentId + '|' + subscriptionId, key_secret)
    const body     = `${razorpayPaymentId}|${razorpaySubscriptionId}`;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

    if (expected !== razorpaySignature) {
      throw new BadRequestException('Payment signature verification failed');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Fetch subscription details to get the renewal date
    const sub = await this.rzp.subscriptions.fetch(razorpaySubscriptionId);

    user.razorpaySubscriptionId = razorpaySubscriptionId;
    user.subscriptionTier       = 'pro';
    user.subscriptionStatus     = 'active';
    user.subscriptionEndsAt     = (sub as { current_end?: number }).current_end
      ? new Date((sub as { current_end: number }).current_end * 1000)
      : null;
    await this.userRepo.save(user);

    this.logger.log(`[Billing] Verified payment for user ${userId} — Pro activated`);
  }

  // ── Cancel subscription ───────────────────────────────────────────────────────

  async cancelSubscription(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.razorpaySubscriptionId) throw new BadRequestException('No active subscription');

    // cancel_at_cycle_end=1 lets the user keep access until period ends
    await this.rzp.subscriptions.cancel(user.razorpaySubscriptionId, true);

    user.subscriptionStatus = 'cancelled';
    await this.userRepo.save(user);
    this.logger.log(`[Billing] Cancelled subscription for user ${userId}`);
  }

  // ── Access Pass (one-time Razorpay Order: 3mo / 6mo / yearly) ────────────────

  async createAccessPass(
    userId: string,
    passType: AccessPassType,
  ): Promise<{ orderId: string; keyId: string; amount: number; passType: AccessPassType }> {
    if (!ACCESS_PASS_TYPES.includes(passType)) {
      throw new BadRequestException(`Invalid passType — must be one of ${ACCESS_PASS_TYPES.join(', ')}`);
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.subscriptionTier === 'pro' && user.subscriptionStatus === 'active') {
      throw new BadRequestException('Already on an active Pro subscription');
    }

    const amount = this.passAmount(passType);

    const rzpOrders = (this.rzp as unknown as {
      orders: { create(o: unknown): Promise<{ id: string }> };
    }).orders;

    // passType is recorded in the order notes here and re-read (server-side)
    // at verify time, so the granted duration cannot be tampered by the client.
    const order = await rzpOrders.create({
      amount,
      currency: 'INR',
      notes: { userId, type: 'access_pass', passType },
    });

    return {
      orderId: order.id,
      keyId:   this.config.getOrThrow<string>('RAZORPAY_KEY_ID'),
      amount,
      passType,
    };
  }

  async verifyAccessPass(
    userId: string,
    razorpayPaymentId: string,
    razorpayOrderId:   string,
    razorpaySignature: string,
  ): Promise<{ passType: AccessPassType; endsAt: string }> {
    const secret = this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET');

    // Order signature = HMAC-SHA256(orderId + '|' + paymentId, key_secret)
    const body     = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (expected !== razorpaySignature) throw new BadRequestException('Payment signature verification failed');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Re-read passType from the order Razorpay holds — never trust the client.
    const rzpOrders = (this.rzp as unknown as {
      orders: { fetch(id: string): Promise<{ notes?: { passType?: string } }> };
    }).orders;
    const order = await rzpOrders.fetch(razorpayOrderId);
    const passType = order?.notes?.passType as AccessPassType | undefined;
    if (!passType || !ACCESS_PASS_TYPES.includes(passType)) {
      throw new BadRequestException('Order is not a valid access pass');
    }

    const days = BillingService.PASS_DURATION_DAYS[passType];
    const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    user.subscriptionTier   = 'pro';
    user.subscriptionStatus = 'pass';
    user.subscriptionEndsAt = endsAt;
    await this.userRepo.save(user);

    this.logger.log(
      `[Billing] ${passType} access pass activated for user ${userId} — expires ${endsAt.toISOString()}`,
    );
    return { passType, endsAt: endsAt.toISOString() };
  }

  // ── Current status ────────────────────────────────────────────────────────────

  async getStatus(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let tier   = user.subscriptionTier   ?? 'free';
    let status = user.subscriptionStatus ?? null;

    // Auto-expire one-time passes on read — no cron job needed.
    // 'day_pass' kept for legacy users still inside their old 24h window.
    if (
      (status === 'pass' || status === 'day_pass') &&
      user.subscriptionEndsAt &&
      user.subscriptionEndsAt < new Date()
    ) {
      tier   = 'free';
      status = 'expired';
    }

    return {
      tier,
      status,
      subscriptionId: user.razorpaySubscriptionId ?? null,
      endsAt:         user.subscriptionEndsAt?.toISOString() ?? null,
    };
  }

  // ── Webhook ───────────────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const secret = this.config.getOrThrow<string>('RAZORPAY_WEBHOOK_SECRET');

    const isValid = (Razorpay as unknown as { validateWebhookSignature: (b: string, s: string, k: string) => boolean }).validateWebhookSignature(rawBody.toString(), signature, secret);
    if (!isValid) throw new BadRequestException('Invalid webhook signature');

    const event = JSON.parse(rawBody.toString()) as {
      event: string;
      payload?: {
        subscription?: { entity?: { id?: string; current_end?: number; status?: string; notes?: { userId?: string } } };
      };
    };

    this.logger.log(`[Billing] Webhook: ${event.event}`);

    const sub     = event.payload?.subscription?.entity;
    const subId   = sub?.id;
    const userId  = sub?.notes?.userId;

    if (!subId) return;

    switch (event.event) {
      case 'subscription.activated':
      case 'subscription.charged':
        await this.applyActive(subId, userId, sub?.current_end);
        break;

      case 'subscription.cancelled':
      case 'subscription.completed':
        await this.applyCancel(subId);
        break;

      case 'subscription.halted':
        await this.applyHalted(subId);
        break;
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────────

  private async findUserBySub(subId: string, userId?: string): Promise<User | null> {
    if (userId) {
      const u = await this.userRepo.findOne({ where: { id: userId } });
      if (u) return u;
    }
    return this.userRepo.findOne({ where: { razorpaySubscriptionId: subId } });
  }

  private async applyActive(subId: string, userId?: string, currentEnd?: number): Promise<void> {
    const user = await this.findUserBySub(subId, userId);
    if (!user) return;
    user.razorpaySubscriptionId = subId;
    user.subscriptionTier       = 'pro';
    user.subscriptionStatus     = 'active';
    user.subscriptionEndsAt     = currentEnd ? new Date(currentEnd * 1000) : null;
    await this.userRepo.save(user);
    this.logger.log(`[Billing] Activated Pro for user ${user.id}`);
  }

  private async applyCancel(subId: string): Promise<void> {
    const user = await this.findUserBySub(subId);
    if (!user) return;
    user.subscriptionTier   = 'free';
    user.subscriptionStatus = 'cancelled';
    await this.userRepo.save(user);
    this.logger.log(`[Billing] Cancelled Pro for user ${user.id}`);
  }

  private async applyHalted(subId: string): Promise<void> {
    const user = await this.findUserBySub(subId);
    if (!user) return;
    user.subscriptionStatus = 'past_due';
    await this.userRepo.save(user);
    this.logger.log(`[Billing] Marked past_due for user ${user.id}`);
  }
}
