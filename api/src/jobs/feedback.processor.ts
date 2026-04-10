import { Process, Processor, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bull';
import { FeedbackService } from '../feedback/feedback.service';
import { InterviewGateway } from '../interview/interview.gateway';
import { UsersService } from '../users/users.service';
import { QUEUES, FEEDBACK_JOBS } from './queue.constants';

type UserAIHistory = Awaited<ReturnType<FeedbackService['getUserAIHistory']>>;

// ── Job payload ───────────────────────────────────────────────────────────────

export interface FeedbackJobData {
  sessionId:  string;
  userId:     string;
  transcript: Array<{
    questionId: string;
    question:   string;
    answer:     string;
    timeSpentMs?: number;
  }>;
  context: {
    interviewType:    string;
    targetRole?:      string;
    targetCompany?:   string;
    experienceLevel?: string;
  };
}

// ── Progress steps (reported via job.progress()) ──────────────────────────────

const PROGRESS = {
  STARTED:   10,
  AI_CALLED: 40,
  AI_DONE:   70,
  SAVED:     90,
  NOTIFIED: 100,
} as const;

// ── Rule-based fallback evaluation ────────────────────────────────────────────

function fallbackEvaluation(data: FeedbackJobData) {
  const { transcript, context } = data;

  // Score each answer by length + keyword presence
  const scoredQs = transcript.map((t) => {
    const words   = t.answer.trim().split(/\s+/).filter(Boolean).length;
    const base    = Math.min(60 + Math.floor(words / 5), 85); // 60–85 based on length
    return {
      questionId:   t.questionId,
      question:     t.question,
      answer:       t.answer,
      score:        base,
      strengths:    words > 30 ? ['Provided a detailed response'] : ['Attempted the question'],
      improvements: words < 20 ? ['Try to elaborate more with specific examples'] : ['Add quantifiable outcomes where possible'],
    };
  });

  const overallScore = scoredQs.length
    ? Math.round(scoredQs.reduce((s, q) => s + q.score, 0) / scoredQs.length)
    : 65;

  const typeLabel = context.interviewType.replace('-', ' ');

  return {
    overall_score:    overallScore,
    dimension_scores: {
      communication: Math.min(overallScore + 5,  100),
      structure:     Math.max(overallScore - 5,  0),
      depth:         Math.max(overallScore - 10, 0),
      examples:      Math.max(overallScore - 8,  0),
      confidence:    Math.min(overallScore + 3,  100),
    },
    summary: `You completed a ${typeLabel} interview${context.targetRole ? ` for ${context.targetRole}` : ''}. `
           + `Overall score: ${overallScore}/100. `
           + (overallScore >= 75
               ? 'Strong performance — keep refining your answers with specific examples.'
               : 'Good effort — focus on adding more concrete details and measurable outcomes.'),
    question_feedback: scoredQs,
    next_steps: [
      { type: 'practice', title: `Practice more ${typeLabel} questions`, description: 'Regular practice builds confidence and recall speed.', link: '/practice' },
      { type: 'read',     title: 'Review model answers',                 description: 'Study high-scoring answers to learn structure.',       link: '/question-bank' },
    ],
    weak_areas:  overallScore < 70 ? [`${typeLabel} depth`, 'Using concrete examples'] : ['Quantifying impact'],
    model_used:  'rule-based-fallback',
  };
}

// ── Processor ─────────────────────────────────────────────────────────────────

@Processor(QUEUES.FEEDBACK)
export class FeedbackProcessor {
  private readonly logger = new Logger(FeedbackProcessor.name);

  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly gateway:         InterviewGateway,
    private readonly users:           UsersService,
    private readonly config:          ConfigService,
  ) {}

  @Process(FEEDBACK_JOBS.EVALUATE)
  async evaluate(job: Job<FeedbackJobData>) {
    const { sessionId, userId, transcript, context } = job.data;
    this.logger.log(`[Job ${job.id}] Evaluating session ${sessionId} (${transcript.length} Q&As)`);

    await job.progress(PROGRESS.STARTED);

    // ── 0. Fetch user history for richer AI evaluation ──────────────────────
    let userHistory: UserAIHistory | null = null;
    try {
      userHistory = await this.feedbackService.getUserAIHistory(userId);
    } catch (err) {
      this.logger.warn(`[Job ${job.id}] Could not fetch user history: ${(err as Error).message}`);
    }

    // ── 1. Call AI engine (with rule-based fallback) ────────────────────────
    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';

    let evaluation: {
      overall_score:     number;
      dimension_scores:  Record<string, number>;
      summary:           string;
      question_feedback: object[];
      next_steps:        object[];
      weak_areas:        string[];
      model_used:        string;
    };

    try {
      const res = await fetch(`${aiUrl}/evaluate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          session_id: sessionId,
          transcript: transcript.map(t => ({
            question_id: t.questionId,
            question:    t.question,
            answer:      t.answer,
            time_spent_seconds: t.timeSpentMs ? Math.round(t.timeSpentMs / 1000) : undefined,
          })),
          context: {
            interview_type:   context.interviewType,
            target_role:      context.targetRole,
            target_company:   context.targetCompany,
            experience_level: context.experienceLevel,
          },
          user_history: userHistory,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`AI engine ${res.status}: ${body}`);
      }

      evaluation = await res.json();
      this.logger.log(`[Job ${job.id}] AI evaluation succeeded`);
    } catch (aiErr) {
      this.logger.warn(
        `[Job ${job.id}] AI engine failed — using rule-based fallback: ${(aiErr as Error).message}`,
      );
      evaluation = fallbackEvaluation(job.data);
    }

    await job.progress(PROGRESS.AI_CALLED);
    await job.progress(PROGRESS.AI_DONE);

    // ── 2. Persist feedback ─────────────────────────────────────────────────
    const feedback = await this.feedbackService.create(
      {
        sessionId,
        overallScore:     evaluation.overall_score,
        dimensionScores:  evaluation.dimension_scores,
        summary:          evaluation.summary,
        questionFeedback: evaluation.question_feedback,
        nextSteps:        evaluation.next_steps,
        weakAreas:        evaluation.weak_areas,
        modelUsed:        evaluation.model_used,
      },
      userId,
    );

    await job.progress(PROGRESS.SAVED);

    // ── 3. Update streak ────────────────────────────────────────────────────
    await this.users.updateStreak(userId);

    // ── 4. Notify client via WebSocket ──────────────────────────────────────
    this.gateway.emitFeedbackReady(sessionId, feedback.id);

    // ── 5. Session-ready email (best-effort) ────────────────────────────────
    this.sendSessionReadyEmail(userId, sessionId, feedback.id, job.data.context).catch((err) =>
      this.logger.warn(`[Job ${job.id}] Session email failed: ${(err as Error).message}`),
    );

    await job.progress(PROGRESS.NOTIFIED);

    this.logger.log(`[Job ${job.id}] Done — feedback ${feedback.id} for session ${sessionId}`);
    return { feedbackId: feedback.id };
  }

  // ── Session-ready email ───────────────────────────────────────────────────

  private async sendSessionReadyEmail(
    userId:    string,
    sessionId: string,
    _feedbackId: string,
    context: FeedbackJobData['context'],
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (user.notificationPreferences?.session === false) return;

    const name     = user.firstName || 'there';
    const role     = context.targetRole    ? ` for ${context.targetRole}`    : '';
    const company  = context.targetCompany ? ` at ${context.targetCompany}` : '';
    const typeLabel: Record<string, string> = {
      behavioral: 'Behavioral', coding: 'Coding',
      'system-design': 'System Design', hr: 'HR', 'case-study': 'Case Study',
    };
    const typeName = typeLabel[context.interviewType] ?? context.interviewType;
    const reportUrl = `https://app.rehearse.ai/sessions/${sessionId}`;

    const subject = `Your ${typeName} interview report is ready`;
    const text = [
      `Hi ${name},`,
      ``,
      `Your ${typeName} interview report${role}${company} is ready to view.`,
      ``,
      `View your report: ${reportUrl}`,
      ``,
      `— The Rehearse Team`,
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Your interview report is ready</title></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:linear-gradient(135deg,#0EA5E9,#3B82F6);padding:24px 28px;">
              <p style="margin:0;font-size:22px;">🎉</p>
              <h1 style="margin:6px 0 0;font-size:18px;font-weight:800;color:#FFFFFF;">Your report is ready, ${name}!</h1>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${typeName} Interview${role}${company}</p>
            </td></tr>
            <tr><td style="padding:24px 28px;">
              <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
                Your AI-powered interview feedback report has been generated. Review your scores, strengths, and next steps.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr><td style="background:linear-gradient(135deg,#0EA5E9,#3B82F6);border-radius:10px;">
                  <a href="${reportUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;">
                    View Report →
                  </a>
                </td></tr>
              </table>
            </td></tr>
            <tr><td style="text-align:center;padding:0 28px 20px;">
              <p style="margin:0;font-size:11px;color:#94A3B8;">
                Sent by Rehearse · <a href="https://app.rehearse.ai/settings" style="color:#94A3B8;">Manage notifications</a>
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await this.sendEmail({ to: user.email, subject, text, html });
    this.logger.log(`[Feedback email] Sent session-ready to ${user.email} — session ${sessionId}`);
  }

  private async sendEmail(opts: { to: string; subject: string; text: string; html: string }): Promise<void> {
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

  // ── Queue event hooks ─────────────────────────────────────────────────────

  @OnQueueFailed()
  onFailed(job: Job<FeedbackJobData>, err: Error) {
    this.logger.error(
      `[Job ${job.id}] FAILED (attempt ${job.attemptsMade}/${job.opts.attempts ?? 1}): ${err.message}`,
      err.stack,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job<FeedbackJobData>, result: { feedbackId: string }) {
    this.logger.log(`[Job ${job.id}] Completed → feedbackId=${result.feedbackId}`);
  }
}
