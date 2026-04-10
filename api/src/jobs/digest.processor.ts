import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import type { Job, Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { User } from '../users/user.entity';
import { Session } from '../sessions/session.entity';
import { QUEUES, DIGEST_JOBS, DIGEST_SEND_OPTIONS } from './queue.constants';

// ── Job payloads ──────────────────────────────────────────────────────────────

/** No payload needed — fan-out scans all active users */
export type DigestFanoutData = Record<string, never>;

export interface DigestUserData {
  userId:    string;
  email:     string;
  firstName: string | null;
  weekStart: string;  // ISO date string
}

// ── Digest content helpers ────────────────────────────────────────────────────

interface WeekStats {
  sessionCount:  number;
  avgScore:      number | null;
  bestScore:     number | null;
  interviewTypes: string[];
  streak:        number;
}

function buildStats(sessions: Session[], streak: number): WeekStats {
  const completed = sessions.filter(s => s.status === 'completed' && s.overallScore !== null);
  const scores    = completed.map(s => s.overallScore as number);

  return {
    sessionCount:   sessions.length,
    avgScore:       scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    bestScore:      scores.length ? Math.max(...scores) : null,
    interviewTypes: [...new Set(sessions.map(s => s.interviewType))],
    streak,
  };
}

const APP_URL = 'https://app.rehearse.ai';

function renderDigestEmail(
  firstName: string,
  stats: WeekStats,
  weekStart: string,
): { subject: string; text: string; html: string } {
  const name = firstName || 'there';
  const weekLabel = new Date(weekStart).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric',
  });

  // ── Fallback plain text ─────────────────────────────────────────────────────
  const lines: string[] = [
    `Hi ${name},`,
    ``,
    `Here's your Rehearse weekly recap for the week of ${weekLabel}:`,
    ``,
    `  Sessions completed : ${stats.sessionCount}`,
  ];
  if (stats.avgScore !== null)  lines.push(`  Average score      : ${stats.avgScore}/100`);
  if (stats.bestScore !== null) lines.push(`  Best score         : ${stats.bestScore}/100`);
  if (stats.interviewTypes.length) lines.push(`  Topics practiced   : ${stats.interviewTypes.join(', ')}`);
  if (stats.streak > 1)            lines.push(`  Current streak     : ${stats.streak} days 🔥`);

  if (stats.sessionCount === 0) {
    lines.push(``, `No sessions this week — now is a great time to jump back in!`);
  } else if (stats.avgScore !== null && stats.avgScore >= 80) {
    lines.push(``, `Great work! Keep up the momentum.`);
  } else if (stats.avgScore !== null && stats.avgScore < 60) {
    lines.push(``, `Room to grow — consistent practice is the fastest path to improvement.`);
  }

  lines.push(``, `Keep practicing → ${APP_URL}`, ``, `— The Rehearse Team`, ``, `Unsubscribe: ${APP_URL}/settings/notifications`);

  // ── Motivational nudge copy ─────────────────────────────────────────────────
  let nudge: string;
  if (stats.sessionCount === 0) {
    nudge = 'You didn\'t practice this week — that\'s okay. One session today puts you back on track.';
  } else if (stats.avgScore !== null && stats.avgScore >= 80) {
    nudge = 'You\'re performing above average. Keep the momentum going into next week!';
  } else if (stats.avgScore !== null && stats.avgScore < 60) {
    nudge = 'Consistent practice is the fastest path to improvement. You\'ve got this.';
  } else {
    nudge = `You completed ${stats.sessionCount} session${stats.sessionCount !== 1 ? 's' : ''} this week. Every rep counts.`;
  }

  // ── Stat rows HTML ──────────────────────────────────────────────────────────
  const statRows: string[] = [];
  statRows.push(statRow('Sessions this week', String(stats.sessionCount)));
  if (stats.avgScore !== null)  statRows.push(statRow('Average score',    `${stats.avgScore} / 100`));
  if (stats.bestScore !== null) statRows.push(statRow('Best score',       `${stats.bestScore} / 100`));
  if (stats.interviewTypes.length) {
    const labels: Record<string, string> = {
      behavioral: 'Behavioral', coding: 'Coding',
      'system-design': 'System Design', hr: 'HR', 'case-study': 'Case Study',
    };
    statRows.push(statRow('Topics practiced', stats.interviewTypes.map(t => labels[t] ?? t).join(', ')));
  }
  if (stats.streak > 1) statRows.push(statRow('Practice streak', `${stats.streak} days 🔥`));

  // ── Full HTML ───────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Rehearse Weekly Recap</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:24px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:linear-gradient(135deg,#0EA5E9,#3B82F6);border-radius:12px;width:36px;height:36px;text-align:center;vertical-align:middle;">
                <span style="color:#fff;font-size:18px;line-height:36px;">🎙</span>
              </td>
              <td style="padding-left:10px;">
                <span style="font-size:18px;font-weight:700;color:#0F172A;letter-spacing:-0.5px;">Rehearse</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#FFFFFF;border-radius:20px;border:1px solid #E2E8F0;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden;">

          <!-- Gradient header bar -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:linear-gradient(135deg,#0EA5E9,#3B82F6);padding:28px 32px;">
              <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:0.8px;">Weekly Recap · ${weekLabel}</p>
              <h1 style="margin:6px 0 0;font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">Hi ${name} 👋</h1>
            </td></tr>
          </table>

          <!-- Body -->
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 32px;">

            <!-- Stats grid -->
            <tr><td>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
                ${statRows.join('')}
              </table>
            </td></tr>

            <!-- Nudge -->
            <tr><td style="padding-top:24px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${nudge}</p>
            </td></tr>

            <!-- CTA -->
            <tr><td style="padding-top:24px;text-align:center;">
              <a href="${APP_URL}"
                 style="display:inline-block;background:linear-gradient(135deg,#0EA5E9,#3B82F6);color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;letter-spacing:-0.2px;">
                Start a Session →
              </a>
            </td></tr>

            <!-- Divider -->
            <tr><td style="padding-top:28px;padding-bottom:20px;">
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:0;" />
            </td></tr>

            <!-- Footer -->
            <tr><td style="text-align:center;">
              <p style="margin:0;font-size:12px;color:#94A3B8;">
                Sent by the Rehearse Team ·
                <a href="${APP_URL}/settings/notifications" style="color:#94A3B8;">Unsubscribe</a>
              </p>
            </td></tr>

          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: `Your Rehearse weekly recap${stats.sessionCount > 0 ? ` — ${stats.sessionCount} session${stats.sessionCount > 1 ? 's' : ''}` : ''}`,
    text:    lines.join('\n'),
    html,
  };
}

function statRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:12px 16px;font-size:13px;color:#64748B;border-bottom:1px solid #F1F5F9;">${label}</td>
    <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#0F172A;border-bottom:1px solid #F1F5F9;text-align:right;">${value}</td>
  </tr>`;
}

// ── Processors ────────────────────────────────────────────────────────────────

@Processor(QUEUES.DIGEST)
export class DigestProcessor {
  private readonly logger = new Logger(DigestProcessor.name);

  constructor(
    @InjectRepository(User)    private readonly userRepo:    Repository<User>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectQueue(QUEUES.DIGEST) private readonly digestQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  /** Fan-out: runs on a cron schedule (wired in jobs.module.ts).
   *  Queries all users active in the last 30 days, enqueues one WEEKLY_USER job each. */
  @Process(DIGEST_JOBS.WEEKLY_FANOUT)
  async fanout(job: Job<DigestFanoutData>) {
    this.logger.log(`[Digest fanout ${job.id}] Scanning active users…`);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const users = (await this.userRepo.find({
      where: { lastActiveDate: MoreThanOrEqual(thirtyDaysAgo) },
      select: ['id', 'email', 'firstName', 'notificationPreferences'],
    })).filter(u => u.notificationPreferences?.weekly !== false);

    this.logger.log(`[Digest fanout ${job.id}] Enqueueing digests for ${users.length} users`);

    const weekStart = this.getWeekStart().toISOString();
    const jobs = users.map(u => ({
      name: DIGEST_JOBS.WEEKLY_USER,
      data: { userId: u.id, email: u.email, firstName: u.firstName, weekStart } satisfies DigestUserData,
      opts: DIGEST_SEND_OPTIONS,
    }));

    await this.digestQueue.addBulk(jobs);
    return { enqueued: users.length };
  }

  /** Per-user: fetch last week's sessions, build stats, send email */
  @Process(DIGEST_JOBS.WEEKLY_USER)
  async sendUserDigest(job: Job<DigestUserData>) {
    const { userId, email, firstName, weekStart } = job.data;

    const weekStartDate = new Date(weekStart);
    const weekEndDate   = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 7);

    // Fetch sessions for this week
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.userId = :userId', { userId })
      .andWhere('s.createdAt >= :start', { start: weekStartDate })
      .andWhere('s.createdAt <  :end',   { end: weekEndDate })
      .getMany();

    // Get current streak
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['currentStreak'],
    });

    const stats = buildStats(sessions, user?.currentStreak ?? 0);
    const { subject, text, html } = renderDigestEmail(firstName ?? '', stats, weekStart);

    await this.sendEmail({ to: email, subject, text, html });
    this.logger.log(`[Digest ${job.id}] Sent to ${email} (${stats.sessionCount} sessions this week)`);

    return { userId, sessionCount: stats.sessionCount };
  }

  // ── Queue event hooks ─────────────────────────────────────────────────────

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `[Digest job ${job.id} "${job.name}"] FAILED: ${err.message}`,
      err.stack,
    );
  }

  // ── Email adapter ─────────────────────────────────────────────────────────

  private async sendEmail(opts: { to: string; subject: string; text: string; html: string }) {
    const lambdaUrl = this.config.get<string>('STORAGE_LAMBDA_URL');
    const secret    = this.config.get<string>('STORAGE_LAMBDA_SECRET');

    if (!lambdaUrl || !secret) {
      this.logger.debug(`[EMAIL to ${opts.to}]\nSubject: ${opts.subject}\n\n${opts.text}\n`);
      return;
    }

    const res = await fetch(`${lambdaUrl}/email/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': secret },
      body:    JSON.stringify(opts),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Email Lambda error ${res.status}: ${(body as { error?: string }).error ?? res.statusText}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getWeekStart(): Date {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay()); // last Sunday
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
