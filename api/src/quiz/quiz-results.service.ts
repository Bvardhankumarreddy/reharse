import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { QuizConfig, QuizSubmission } from './quiz.entities';
import { QuizMailerService } from './quiz-mailer.service';

const PRIZE_BY_RANK: Record<number, string> = {
  1: '₹500',
  2: '₹300',
  3: '₹200',
};

const FOUNDER_PHONE = '8919573936';
const COMMUNITY = {
  instagram: 'https://instagram.com/aetherstackai',
  linkedin:  'https://linkedin.com/company/115524370',
  whatsapp:  'https://whatsapp.com/channel/0029Vb7dRgq1dAwCydDr651d',
  youtube:   'https://youtube.com/@aetherstackai',
  platform:  'https://reharse.inferix.in',
};

@Injectable()
export class QuizResultsService {
  private readonly logger = new Logger(QuizResultsService.name);
  private readonly publicBaseUrl: string;

  constructor(
    @InjectRepository(QuizSubmission)
    private readonly submissions: Repository<QuizSubmission>,
    @InjectRepository(QuizConfig)
    private readonly configs: Repository<QuizConfig>,
    private readonly mailer: QuizMailerService,
    private readonly config: ConfigService,
  ) {
    this.publicBaseUrl = this.config.get<string>('PUBLIC_BASE_URL') ?? 'https://reharse.inferix.in';
  }

  /**
   * Send personalized results emails to every participant of a quiz week.
   * Each email carries the same CSV attachment (UPI excluded for privacy).
   * Disqualified submissions are still emailed (they participated) but
   * excluded from the Top-3 leaderboard shown in the body.
   */
  async sendResultEmailsForWeek(
    quizWeek: number, opts: { dryRun?: boolean } = {},
  ): Promise<{
    quizWeek: number;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    errors: Array<{ email: string; reason: string }>;
  }> {
    const config = await this.configs.findOne({ where: { quizWeek } });
    if (!config) throw new NotFoundException(`Quiz week ${quizWeek} config not found`);

    const submissions = await this.submissions
      .createQueryBuilder('s')
      .where('s.quizWeek = :w', { w: quizWeek })
      .orderBy('s.totalScore', 'DESC')
      .addOrderBy('s.totalTimeSeconds', 'ASC')
      .getMany();

    if (submissions.length === 0) {
      throw new BadRequestException(`No submissions for quiz week ${quizWeek}`);
    }

    // Rank map: ranks computed over ALL submissions (incl. disqualified)
    // — matches what the entrant saw when they finished; admin can
    // override per-submission via the existing disqualify flow.
    const rankByEmail = new Map<string, number>();
    submissions.forEach((s, i) => rankByEmail.set(s.email, i + 1));

    // Top-3 leaderboard: highest-scoring non-disqualified entries.
    const top3 = submissions.filter((s) => !s.disqualified).slice(0, 3);

    // Max possible — derived from the first submission's answer rows
    // (we assume per-week question set; same max across submissions).
    const maxScoreRow: Array<{ max: string }> = await this.submissions.query(`
      SELECT COALESCE(SUM(q.points), 0)::text AS max
        FROM quiz_submission_answers a
        JOIN quiz_questions q ON q.id = a."questionId"
       WHERE a."submissionId" = $1
    `, [submissions[0].id]);
    const maxScore = Number(maxScoreRow[0]?.max ?? 0);

    const nextQuiz = await this.findNextQuiz(quizWeek);

    // Build the CSV attachment ONCE — reused for every recipient.
    const csv = buildResultsCsv(submissions, rankByEmail, maxScore);
    const csvAttachment = {
      filename: `aetherstack_quiz${quizWeek}_results.csv`,
      content: Buffer.from(csv, 'utf-8'),
      mimeType: 'text/csv; charset=UTF-8',
    };

    let sent = 0, failed = 0, skipped = 0;
    const errors: Array<{ email: string; reason: string }> = [];

    for (const sub of submissions) {
      if (!sub.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sub.email)) {
        skipped++;
        continue;
      }
      const rank = rankByEmail.get(sub.email) ?? submissions.length;
      const email = buildResultEmail({
        submission: sub, rank, totalCount: submissions.length,
        maxScore, top3, config, nextQuiz,
        publicBaseUrl: this.publicBaseUrl,
      });

      if (opts.dryRun) {
        this.logger.log(`[dry-run] would send results to ${sub.email} (rank ${rank})`);
        sent++;
        continue;
      }

      try {
        await this.mailer.sendRaw({
          to: sub.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
          attachments: [csvAttachment],
        });
        sent++;
      } catch (e) {
        failed++;
        errors.push({ email: sub.email, reason: (e as Error).message });
      }
    }

    this.logger.log(
      `Results email for week ${quizWeek}: ` +
      `${sent}/${submissions.length} sent, ${failed} failed, ${skipped} skipped` +
      (opts.dryRun ? ' (DRY RUN)' : ''),
    );
    return { quizWeek, total: submissions.length, sent, failed, skipped, errors };
  }

  private async findNextQuiz(currentWeek: number): Promise<QuizConfig | null> {
    const now = new Date();
    return this.configs
      .createQueryBuilder('c')
      .where('c.isActive = true')
      .andWhere('c.quizWeek > :w', { w: currentWeek })
      .andWhere('c.startsAt > :now', { now })
      .orderBy('c.startsAt', 'ASC')
      .getOne();
  }
}

// ── CSV (UPI excluded) ─────────────────────────────────────────────────
function buildResultsCsv(
  submissions: QuizSubmission[],
  rankByEmail: Map<string, number>,
  maxScore: number,
): string {
  // Note: deliberately NO upiId column (privacy: payment details stay admin-only).
  const header = [
    'rank', 'name', 'email', 'youtube_handle',
    'score', 'max_score', 'time_seconds', 'tiebreaker',
    'disqualified', 'submitted_at',
  ];
  const esc = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = submissions.map((s) => [
    rankByEmail.get(s.email) ?? '',
    s.fullName,
    s.email,
    s.youtubeHandle ?? '',
    s.totalScore,
    maxScore,
    s.totalTimeSeconds,
    s.tiebreakerAnswer ?? '',
    s.disqualified ? 'TRUE' : 'FALSE',
    s.submittedAt.toISOString(),
  ].map(esc).join(','));
  return [header.join(','), ...rows].join('\n');
}

// ── Email body (text + HTML) ───────────────────────────────────────────
function buildResultEmail(input: {
  submission: QuizSubmission;
  rank: number;
  totalCount: number;
  maxScore: number;
  top3: QuizSubmission[];
  config: QuizConfig;
  nextQuiz: QuizConfig | null;
  publicBaseUrl: string;
}): { subject: string; text: string; html: string } {
  const { submission: s, rank, totalCount, maxScore, top3, config, nextQuiz, publicBaseUrl } = input;
  const w = config.quizWeek;
  const firstName = s.fullName?.split(' ')[0] || 'Champion';
  const time = formatTime(s.totalTimeSeconds);
  const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎯';

  // Top-3 lines
  const top3Lines = top3.map((t, i) => {
    const medal = ['🥇', '🥈', '🥉'][i];
    const ordinal = ['1st', '2nd', '3rd'][i];
    const prize = PRIZE_BY_RANK[i + 1];
    const tTime = formatTime(t.totalTimeSeconds);
    return `${medal} ${ordinal} — ${t.fullName} — ${t.totalScore}/${maxScore} in ${tTime} — ${prize}`;
  });
  const top3Html = top3.map((t, i) => {
    const medal = ['🥇', '🥈', '🥉'][i];
    const ordinal = ['1st', '2nd', '3rd'][i];
    const prize = PRIZE_BY_RANK[i + 1];
    return `<div style="padding:8px 0; border-bottom:1px solid #eee;"><b>${medal} ${ordinal}</b> — ${escapeHtml(t.fullName)} — ${t.totalScore}/${maxScore} in ${formatTime(t.totalTimeSeconds)} — <b>${prize}</b></div>`;
  }).join('');

  // Next quiz block — only when scheduled
  let nextText = '';
  let nextHtml = '';
  if (nextQuiz?.startsAt && nextQuiz?.endsAt) {
    const opens = formatDateIst(nextQuiz.startsAt);
    const closes = formatDateIst(nextQuiz.endsAt);
    nextText = [
      '═══════════════════════════════',
      `🚀 QUIZ #${nextQuiz.quizWeek} — THIS SATURDAY`,
      '═══════════════════════════════',
      '',
      `🗓 Opens: ${opens}`,
      `🛑 Closes: ${closes}`,
      '',
      '🏆 Prizes:',
      '🥇 ₹500',
      '🥈 ₹300',
      '🥉 ₹200',
      '+ Rehearse Pro Access',
      '',
      `📝 Take Quiz #${nextQuiz.quizWeek}: ${publicBaseUrl}/quiz`,
      '',
    ].join('\n');
    nextHtml = `
      <div style="background:linear-gradient(135deg,#0A0E27 0%,#151B3D 100%); color:#fff; padding:20px; border-radius:12px; margin:20px 0;">
        <div style="font-size:11px; letter-spacing:2px; color:#FFD700; font-weight:700; text-transform:uppercase;">🚀 Next quiz — Week ${nextQuiz.quizWeek}</div>
        <p style="margin:8px 0 4px 0; font-size:14px;">🗓 Opens: <b>${opens}</b></p>
        <p style="margin:0 0 12px 0; font-size:14px;">🛑 Closes: <b>${closes}</b></p>
        <p style="margin:0 0 4px 0; font-size:13px;">🏆 Prizes: 🥇 ₹500 · 🥈 ₹300 · 🥉 ₹200 + Rehearse Pro Access</p>
        <a href="${publicBaseUrl}/quiz" style="display:inline-block; margin-top:12px; background:#00D4FF; color:#0A0E27; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:700;">📝 Take Quiz #${nextQuiz.quizWeek} →</a>
      </div>`;
  }

  const text = [
    `Dear ${firstName},`,
    '',
    `Thank you for playing AetherStackAI Quiz #${w} this Saturday!`,
    `Here's your personalized scorecard 👇`,
    '',
    '═══════════════════════════════',
    `🏆 YOUR QUIZ #${w} RESULTS`,
    '═══════════════════════════════',
    '',
    `✅ Final Score: ${s.totalScore}/${maxScore}`,
    `⏱️ Time Taken: ${time}`,
    `${rankBadge} Final Rank: #${rank} of ${totalCount} participants`,
    s.disqualified ? '⚠ Note: this submission was flagged in admin review.' : '',
    '',
    '═══════════════════════════════',
    `🏅 QUIZ #${w} LEADERBOARD (Top 3)`,
    '═══════════════════════════════',
    '',
    ...top3Lines,
    '',
    '═══════════════════════════════',
    '📈 HOW TO IMPROVE',
    '═══════════════════════════════',
    '',
    'The hard questions are designed to test deep understanding — not memorization.',
    '',
    'To improve your score even further:',
    '- Watch the full lessons instead of only clips',
    '- Focus on recap slides at the end of each lesson',
    '- In tiebreakers, speed matters — avoid overthinking answers you already know',
    '',
    nextText,
    '═══════════════════════════════',
    '💰 WINNERS — CLAIM YOUR REWARDS',
    '═══════════════════════════════',
    '',
    'If you placed in the Top 3, please contact me to claim your prize money:',
    '',
    `📞 ${FOUNDER_PHONE}`,
    '',
    '═══════════════════════════════',
    '💬 JOIN THE COMMUNITY',
    '═══════════════════════════════',
    '',
    `📸 Instagram: ${COMMUNITY.instagram}`,
    `💼 LinkedIn: ${COMMUNITY.linkedin}`,
    `💬 WhatsApp Channel: ${COMMUNITY.whatsapp}`,
    '',
    "You're one of the founding members of this growing AI learning community.",
    "Thanks for showing up and being part of the journey.",
    '',
    'If you have feedback (difficulty, UX, ideas), just reply to this email — I read every response.',
    '',
    'See you Saturday 🚀',
    '',
    '— Vardhan Kumar Reddy',
    'Founder, AetherStackAI / Rehearse',
    '',
    `YouTube: ${COMMUNITY.youtube}`,
    `Platform: ${COMMUNITY.platform}`,
    '',
    `(Your full week scorecard is attached as a CSV. UPI IDs are excluded for privacy.)`,
  ].filter(Boolean).join('\n');

  const html = `
<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width:600px; margin:0 auto; padding:24px; background:#fafafa; color:#1a1a1a;">
  <div style="background:#fff; border-radius:14px; padding:32px 28px; border:1px solid #eee;">
    <p style="margin:0 0 14px 0;">Dear <b>${escapeHtml(firstName)}</b>,</p>
    <p style="margin:0 0 18px 0; color:#555;">
      Thank you for playing <b>AetherStackAI Quiz #${w}</b> this Saturday!
      Here's your personalized scorecard 👇
    </p>

    <h3 style="color:#0A0E27; border-bottom:2px solid #FFD700; padding-bottom:6px;">🏆 Your Quiz #${w} Results</h3>
    <div style="font-size:16px; line-height:1.9; margin:10px 0 18px 0;">
      <div>✅ <b>Final Score:</b> ${s.totalScore}/${maxScore}</div>
      <div>⏱️ <b>Time Taken:</b> ${time}</div>
      <div>${rankBadge} <b>Final Rank:</b> #${rank} of ${totalCount} participants</div>
      ${s.disqualified ? '<div style="color:#FF5C7C; font-size:13px; margin-top:6px;">⚠ This submission was flagged in admin review.</div>' : ''}
    </div>

    <h3 style="color:#0A0E27; border-bottom:2px solid #FFD700; padding-bottom:6px;">🏅 Quiz #${w} Leaderboard (Top 3)</h3>
    <div style="margin:10px 0 18px 0;">${top3Html}</div>

    <h3 style="color:#0A0E27; border-bottom:2px solid #FFD700; padding-bottom:6px;">📈 How to Improve</h3>
    <p style="color:#555; margin:10px 0 8px 0;">
      The hard questions are designed to test deep understanding — not memorization.
    </p>
    <ul style="color:#555; padding-left:20px; line-height:1.7;">
      <li>Watch the full lessons instead of only clips</li>
      <li>Focus on recap slides at the end of each lesson</li>
      <li>In tiebreakers, speed matters — avoid overthinking answers you already know</li>
    </ul>

    ${nextHtml}

    <h3 style="color:#0A0E27; border-bottom:2px solid #FFD700; padding-bottom:6px;">💰 Winners — Claim Your Rewards</h3>
    <p style="color:#555;">If you placed in the Top 3, please contact me to claim your prize money:</p>
    <p style="font-size:18px; font-weight:700; color:#0A0E27;">📞 ${FOUNDER_PHONE}</p>

    <h3 style="color:#0A0E27; border-bottom:2px solid #FFD700; padding-bottom:6px;">💬 Join the Community</h3>
    <p style="color:#555; line-height:1.9;">
      📸 <a href="${COMMUNITY.instagram}" style="color:#0099CC;">Instagram</a><br>
      💼 <a href="${COMMUNITY.linkedin}" style="color:#0099CC;">LinkedIn</a><br>
      💬 <a href="${COMMUNITY.whatsapp}" style="color:#0099CC;">WhatsApp Channel</a>
    </p>

    <p style="color:#555; margin-top:18px;">
      You're one of the founding members of this growing AI learning community.
      Thanks for showing up and being part of the journey.
    </p>
    <p style="color:#555;">
      If you have feedback (difficulty, UX, ideas), just <b>reply to this email</b> — I read every response.
    </p>

    <p style="margin:24px 0 6px 0;">See you Saturday 🚀</p>
    <p style="margin:0;">— <b>Vardhan Kumar Reddy</b><br>Founder, AetherStackAI / Rehearse</p>

    <p style="font-size:12px; color:#888; margin-top:18px;">
      <a href="${COMMUNITY.youtube}" style="color:#0099CC;">YouTube</a> ·
      <a href="${COMMUNITY.platform}" style="color:#0099CC;">Platform</a>
    </p>
  </div>

  <p style="text-align:center; font-size:11px; color:#888; margin-top:12px;">
    Your full week scorecard is attached as a CSV. UPI IDs are excluded for privacy.
  </p>
</body></html>`.trim();

  return {
    subject: `AetherStackAI Quiz #${w} Results 📊`,
    text, html,
  };
}

function formatTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatDateIst(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const dateStr = date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  return `${dateStr}, ${timeStr} IST`;
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
