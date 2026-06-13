import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
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
  }): Promise<{ subscribed: boolean; reactivated: boolean; welcomeEmailSent: boolean }> {
    const email = (input.email ?? '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email is required');
    }
    const existing = await this.subscribers.findOne({ where: { email } });
    let sub: QuizSubscriber;
    let reactivated = false;
    let alreadySubscribed = false;

    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        existing.notifiedWeeks = [];   // re-subscribers get re-notified
        await this.subscribers.save(existing);
        reactivated = true;
        sub = existing;
      } else {
        // Already subscribed — idempotent. Update name/handle if newer.
        if (input.name) existing.name = input.name.slice(0, 200);
        if (input.youtubeHandle) existing.youtubeHandle = input.youtubeHandle.slice(0, 100);
        await this.subscribers.save(existing);
        sub = existing;
        alreadySubscribed = true;
      }
    } else {
      const created = this.subscribers.create({
        email,
        name: (input.name ?? '').slice(0, 200) || null,
        youtubeHandle: (input.youtubeHandle ?? '').slice(0, 100) || null,
        unsubscribeToken: randomBytes(24).toString('hex'),
        isActive: true,
        notifiedWeeks: [],
      });
      sub = await this.subscribers.save(created);
    }

    // Welcome email — fired for fresh signups + reactivations.
    // Skipped on idempotent re-subscribe (already-active) so we don't spam.
    // Non-fatal: subscription still succeeds if mail fails.
    let welcomeEmailSent = false;
    if (!alreadySubscribed) {
      try {
        const nextQuiz = await this.findNextQuiz();
        // referenceQuiz is the source of "X min / N questions" facts.
        // Prefer the next scheduled quiz; fall back to the most recent
        // past config so the email still has accurate facts even if no
        // future quiz is scheduled yet.
        const referenceQuiz = nextQuiz ?? (await this.findMostRecentQuiz());
        const { messageId } = await this.mailer.send(buildWelcomeEmail({
          sub, nextQuiz, referenceQuiz, publicBaseUrl: this.publicBaseUrl,
        }));
        welcomeEmailSent = messageId !== null;
      } catch (e) {
        this.logger.warn(`Welcome email to ${email} failed (non-fatal): ${(e as Error).message}`);
      }
    }
    return { subscribed: true, reactivated, welcomeEmailSent };
  }

  /** Next quiz strictly in the future — drives the "Next quiz" card. */
  private async findNextQuiz(): Promise<QuizConfig | null> {
    const now = new Date();
    return this.configs
      .createQueryBuilder('c')
      .where('c.isActive = true')
      .andWhere('c.startsAt > :now', { now })
      .orderBy('c.startsAt', 'ASC')
      .getOne();
  }

  /** Most recent quiz config (any time) — fallback for "What to expect" facts. */
  private async findMostRecentQuiz(): Promise<QuizConfig | null> {
    return this.configs
      .createQueryBuilder('c')
      .where('c.isActive = true')
      .orderBy('c.startsAt', 'DESC')
      .getOne();
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

function buildWelcomeEmail(input: {
  sub: QuizSubscriber;
  nextQuiz: QuizConfig | null;
  referenceQuiz: QuizConfig | null;
  publicBaseUrl: string;
}): { to: string; subject: string; html: string; text: string } {
  const { sub, nextQuiz, referenceQuiz, publicBaseUrl } = input;
  const greetingName = sub.name?.split(' ')[0] || 'there';
  const quizUrl = `${publicBaseUrl}/quiz`;
  const leaderboardUrl = `${publicBaseUrl}/quiz/leaderboard`;
  const unsubUrl = `${publicBaseUrl}/api/v1/quiz/unsubscribe/${sub.unsubscribeToken}`;

  // Dynamic facts — sourced from quiz config when available, with
  // sane defaults if no quiz is configured yet. The cron-reminder
  // email already does this; matching the same source-of-truth here.
  const durationMinutes = referenceQuiz?.durationMinutes ?? 5;
  const questionsPerQuiz = referenceQuiz?.questionsPerQuiz ?? 9;

  // Optional "next quiz" block — only included when there's one scheduled.
  let nextQuizLine = '';
  let nextQuizHtml = '';
  if (nextQuiz?.startsAt) {
    const startTimeIst = new Date(nextQuiz.startsAt).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const startDateIst = new Date(nextQuiz.startsAt).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short',
    });
    const quizName = nextQuiz.title || `Quiz Week ${nextQuiz.quizWeek}`;
    nextQuizLine =
      `Next up: ${quizName} on ${startDateIst} at ${startTimeIst} IST. ` +
      `We'll email you a reminder right before it starts.\n\n`;
    nextQuizHtml = `
    <div style="background:linear-gradient(135deg,#0A0E27 0%,#151B3D 100%); color:#fff; padding:18px 20px; border-radius:12px; margin:14px 0 22px 0;">
      <div style="font-size:11px; letter-spacing:2px; color:#FFD700; font-weight:700; text-transform:uppercase;">Next quiz</div>
      <div style="font-size:20px; font-weight:700; margin:4px 0 2px 0;">${escapeHtml(quizName)}</div>
      <div style="font-size:13px; color:#B8C5E0;">${escapeHtml(startDateIst)} · ${escapeHtml(startTimeIst)} IST</div>
    </div>`;
  }

  const text = [
    `Hi ${greetingName},`,
    '',
    `You're all set — we'll email you whenever a new Rehearse Weekly AI Quiz is about to start.`,
    '',
    nextQuizLine +
    `What to expect:`,
    `  • One short email per quiz (right before it opens)`,
    `  • You'll have ${durationMinutes} minutes to finish ${questionsPerQuiz} questions`,
    `  • No reattempts — answer carefully`,
    `  • Winners get prizes (your YouTube handle is verified before payout)`,
    '',
    `Play the current quiz : ${quizUrl}`,
    `Past winners          : ${leaderboardUrl}`,
    '',
    `Good luck!`,
    `— Rehearse`,
    '',
    `Unsubscribe anytime: ${unsubUrl}`,
  ].join('\n');

  const html = `
<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; background:#fafafa; color:#1a1a1a;">
  <div style="background:#fff; border-radius:14px; padding:32px 28px; border:1px solid #eee;">
    <div style="font-size: 38px; margin-bottom: 10px;">🎯</div>
    <h1 style="margin: 0 0 8px 0; font-size: 24px;">You're subscribed, ${escapeHtml(greetingName)}!</h1>
    <p style="margin: 0 0 16px 0; color:#555;">
      We'll email you a reminder whenever a new <strong>Rehearse Weekly AI Quiz</strong> is about to start.
    </p>

    ${nextQuizHtml}

    <p style="font-size:14px; color:#333; font-weight:600; margin: 18px 0 6px 0;">What to expect:</p>
    <ul style="font-size:13px; color:#555; padding-left:18px; line-height:1.8; margin: 0 0 22px 0;">
      <li>One short email per quiz, right before it opens</li>
      <li>You'll have ${durationMinutes} minutes to finish ${questionsPerQuiz} questions</li>
      <li>No reattempts — answer carefully</li>
      <li>Winners get prizes; your YouTube handle is verified before payout</li>
    </ul>

    <a href="${quizUrl}" style="display:block; background:linear-gradient(135deg,#00D4FF 0%,#0099CC 100%); color:#0A0E27; text-decoration:none; padding:14px; border-radius:12px; text-align:center; font-weight:700; font-size:16px; margin-bottom:12px;">
      Visit the quiz now →
    </a>
    <a href="${leaderboardUrl}" style="display:block; background:#fff; color:#0099CC; text-decoration:none; padding:12px; border-radius:12px; text-align:center; font-weight:600; font-size:14px; border:1px solid #00D4FF40; margin-bottom:24px;">
      🏆 See past quiz winners
    </a>

    <p style="margin:24px 0 0 0; color:#555;">Good luck!<br>— Rehearse</p>
  </div>

  <p style="text-align:center; font-size:11px; color:#888; margin-top:16px;">
    You're getting this because you signed up for quiz reminders.
    <a href="${unsubUrl}" style="color:#0099CC; text-decoration:underline;">Unsubscribe</a>
  </p>
</body></html>`.trim();

  return {
    to: sub.email,
    subject: `You're subscribed to Rehearse Weekly AI Quiz reminders 🎯`,
    html, text,
  };
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
