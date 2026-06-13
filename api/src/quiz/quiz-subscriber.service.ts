import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { QuizSubscriber } from './quiz-subscriber.entity';
import { QuizConfig } from './quiz.entities';
import { QuizMailerService } from './quiz-mailer.service';

@Injectable()
export class QuizSubscriberService {
  private readonly logger = new Logger(QuizSubscriberService.name);
  private readonly publicBaseUrl: string;

  constructor(
    @InjectRepository(QuizSubscriber)
    private readonly subscribers: Repository<QuizSubscriber>,
    @InjectRepository(QuizConfig)
    private readonly configs: Repository<QuizConfig>,
    private readonly mailer: QuizMailerService,
    private readonly config: ConfigService,
  ) {
    this.publicBaseUrl = this.config.get<string>('PUBLIC_BASE_URL')
      ?? 'https://reharse.inferix.in';
  }

  // ── Subscribe / unsubscribe ──────────────────────────────────────────

  async subscribe(input: {
    email?: string; name?: string; youtubeHandle?: string;
  }): Promise<{ subscribed: boolean; reactivated: boolean }> {
    const email = (input.email ?? '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email is required');
    }
    const existing = await this.subscribers.findOne({ where: { email } });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        existing.notifiedWeeks = [];   // re-subscribers get re-notified
        await this.subscribers.save(existing);
        return { subscribed: true, reactivated: true };
      }
      // Already subscribed — idempotent success. Update name/handle if newer.
      if (input.name) existing.name = input.name.slice(0, 200);
      if (input.youtubeHandle) existing.youtubeHandle = input.youtubeHandle.slice(0, 100);
      await this.subscribers.save(existing);
      return { subscribed: true, reactivated: false };
    }
    const sub = this.subscribers.create({
      email,
      name: (input.name ?? '').slice(0, 200) || null,
      youtubeHandle: (input.youtubeHandle ?? '').slice(0, 100) || null,
      unsubscribeToken: randomBytes(24).toString('hex'),
      isActive: true,
      notifiedWeeks: [],
    });
    await this.subscribers.save(sub);
    return { subscribed: true, reactivated: false };
  }

  async unsubscribe(token: string): Promise<{ unsubscribed: boolean }> {
    const sub = await this.subscribers.findOne({ where: { unsubscribeToken: token } });
    if (!sub) throw new NotFoundException('Invalid or expired unsubscribe link');
    if (!sub.isActive) return { unsubscribed: true };
    sub.isActive = false;
    await this.subscribers.save(sub);
    return { unsubscribed: true };
  }

  // ── Admin ────────────────────────────────────────────────────────────

  async adminList(opts: { active?: boolean; limit?: number } = {}) {
    const limit = Math.max(1, Math.min(500, opts.limit ?? 200));
    const qb = this.subscribers
      .createQueryBuilder('s')
      .orderBy('s.subscribed_at', 'DESC')
      .limit(limit);
    if (opts.active !== undefined) qb.andWhere('s.is_active = :a', { a: opts.active });
    return qb.getMany();
  }

  async adminCount(): Promise<{ active: number; total: number }> {
    const total = await this.subscribers.count();
    const active = await this.subscribers.count({ where: { isActive: true } });
    return { total, active };
  }

  // ── Notification cron path ───────────────────────────────────────────

  /**
   * Find quizzes about to start (≤ 15 min from now) AND notify each
   * active subscriber once per quiz week. Cron tick: every 5 min.
   *
   * Lead-time window: a quiz with startsAt at 10:00 IST gets noticed
   * by the cron at 09:45-09:55. Subscriber's lookup at first match
   * sends "Quiz starts in <X> minutes" email; subsequent cron ticks
   * skip because notifiedWeeks already includes the week.
   */
  async runDueNotificationsBatch(): Promise<{
    quizzesChecked: number; emailsSent: number; emailsFailed: number;
  }> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 15 * 60 * 1000);
    const upcoming = await this.configs.find({
      where: {
        isActive: true,
        startsAt: MoreThan(now) as unknown as Date,
      },
    });
    const due = upcoming.filter((c) => c.startsAt <= horizon);

    let emailsSent = 0;
    let emailsFailed = 0;

    for (const cfg of due) {
      const subsToNotify = await this.subscribers
        .createQueryBuilder('s')
        .where('s.is_active = true')
        .andWhere(`NOT (s.notified_weeks @> :wk::jsonb)`, {
          wk: JSON.stringify([cfg.quizWeek]),
        })
        .getMany();
      if (subsToNotify.length === 0) continue;

      const startsAt = new Date(cfg.startsAt);
      const minsFromNow = Math.max(0, Math.round((startsAt.getTime() - now.getTime()) / 60_000));

      for (const sub of subsToNotify) {
        try {
          await this.mailer.send(buildNotificationEmail({
            sub, config: cfg, minsFromNow,
            publicBaseUrl: this.publicBaseUrl,
          }));
          sub.notifiedWeeks = Array.from(new Set([...(sub.notifiedWeeks ?? []), cfg.quizWeek]));
          sub.lastNotifiedAt = new Date();
          await this.subscribers.save(sub);
          emailsSent++;
        } catch {
          emailsFailed++;
        }
      }
    }

    this.logger.log(
      `Quiz notifier: ${due.length} quiz(es) due / ${emailsSent} sent / ${emailsFailed} failed`,
    );
    return { quizzesChecked: due.length, emailsSent, emailsFailed };
  }

  /**
   * Garbage-collect ancient `notifiedWeeks` entries so the JSONB array
   * doesn't grow unbounded. Drops weeks older than (latest_week - 12).
   */
  async pruneStaleNotificationLogs(): Promise<{ rowsTouched: number }> {
    const latestWeek = await this.configs
      .createQueryBuilder('c')
      .select('MAX(c.quizWeek)', 'max')
      .getRawOne<{ max: number }>();
    const cutoff = (latestWeek?.max ?? 0) - 12;
    if (cutoff <= 0) return { rowsTouched: 0 };

    const subs = await this.subscribers
      .createQueryBuilder('s')
      .where(`s.notified_weeks @> :empty::jsonb`, { empty: JSON.stringify([]) })
      .getMany();
    void subs;
    // Use raw SQL filter — simpler and atomic.
    const r = await this.subscribers.query(`
      UPDATE quiz_subscribers
         SET notified_weeks = (
           SELECT COALESCE(jsonb_agg(week::int), '[]'::jsonb)
             FROM jsonb_array_elements_text(notified_weeks) AS week
            WHERE week::int >= $1
         )
       WHERE jsonb_array_length(notified_weeks) > 0
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(notified_weeks) wk
            WHERE wk::int < $1
         )
    `, [cutoff]);
    return { rowsTouched: Array.isArray(r) ? 0 : (r?.[1] ?? 0) };
  }
}

// ── Email body builders ────────────────────────────────────────────────

function buildNotificationEmail(input: {
  sub: QuizSubscriber;
  config: QuizConfig;
  minsFromNow: number;
  publicBaseUrl: string;
}): { to: string; subject: string; html: string; text: string } {
  const { sub, config, minsFromNow, publicBaseUrl } = input;
  const greetingName = sub.name?.split(' ')[0] || 'there';
  const quizName = config.title || `Quiz Week ${config.quizWeek}`;
  const startTimeIst = config.startsAt
    ? new Date(config.startsAt).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : 'shortly';
  const startDateIst = config.startsAt
    ? new Date(config.startsAt).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short',
      })
    : '';
  const quizUrl = `${publicBaseUrl}/quiz`;
  const unsubUrl = `${publicBaseUrl}/api/v1/quiz/unsubscribe/${sub.unsubscribeToken}`;
  const startsIn = minsFromNow <= 1
    ? 'starts in a minute'
    : `starts in ~${minsFromNow} minutes`;

  const text = [
    `Hi ${greetingName},`,
    '',
    `Heads up — ${quizName} ${startsIn} (${startTimeIst} IST${startDateIst ? `, ${startDateIst}` : ''}).`,
    '',
    `Play here: ${quizUrl}`,
    '',
    'A quick reminder:',
    `  • You'll have ${config.durationMinutes ?? 5} minutes to finish`,
    `  • ${config.questionsPerQuiz ?? 9} questions, no reattempts`,
    `  • Winners get prizes — your YouTube handle is verified before payout`,
    '',
    'Good luck!',
    '— Rehearse',
    '',
    `Unsubscribe: ${unsubUrl}`,
  ].join('\n');

  const html = `
<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; background:#fafafa; color:#1a1a1a;">
  <div style="background:#fff; border-radius:14px; padding:32px 28px; border:1px solid #eee;">
    <div style="font-size: 38px; margin-bottom: 10px;">🎯</div>
    <h1 style="margin: 0 0 6px 0; font-size: 24px;">Hi ${escapeHtml(greetingName)},</h1>
    <p style="margin: 0 0 22px 0; color:#555;">${escapeHtml(quizName)} <strong>${startsIn}</strong>.</p>

    <div style="background:linear-gradient(135deg,#0A0E27 0%,#151B3D 100%); color:#fff; padding:18px 20px; border-radius:12px; margin-bottom:22px;">
      <div style="font-size:11px; letter-spacing:2px; color:#00D4FF; font-weight:700; text-transform:uppercase;">Starts at</div>
      <div style="font-size:24px; font-weight:700; margin:4px 0 2px 0;">${escapeHtml(startTimeIst)} IST</div>
      <div style="font-size:13px; color:#B8C5E0;">${escapeHtml(startDateIst)}</div>
    </div>

    <a href="${quizUrl}" style="display:block; background:linear-gradient(135deg,#00D4FF 0%,#0099CC 100%); color:#0A0E27; text-decoration:none; padding:14px; border-radius:12px; text-align:center; font-weight:700; font-size:16px; margin-bottom:20px;">
      Play the quiz →
    </a>

    <p style="font-size:13px; color:#555; line-height:1.6; margin: 16px 0 8px 0;">A quick reminder:</p>
    <ul style="font-size:13px; color:#555; padding-left:18px; line-height:1.7;">
      <li>You'll have ${config.durationMinutes ?? 5} minutes to finish</li>
      <li>${config.questionsPerQuiz ?? 9} questions, no reattempts</li>
      <li>Winners get prizes — your YouTube handle is verified before payout</li>
    </ul>

    <p style="margin-top:24px; color:#555;">Good luck!<br>— Rehearse</p>
  </div>

  <p style="text-align:center; font-size:11px; color:#888; margin-top:16px;">
    Don't want these emails?
    <a href="${unsubUrl}" style="color:#0099CC; text-decoration:underline;">Unsubscribe</a>
  </p>
</body></html>`.trim();

  return { to: sub.email, subject: `${quizName} ${startsIn}`, html, text };
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
