import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Res,
  UseGuards, ParseIntPipe, DefaultValuePipe, UploadedFile, UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { AdminGuard } from '../auth/admin.guard';
import { QuizService } from './quiz.service';
import { QuizSubscriberService } from './quiz-subscriber.service';

// ── Public quiz endpoints (no auth) ─────────────────────────────────────
@Controller('quiz')
export class QuizPublicController {
  constructor(
    private readonly quizService: QuizService,
    private readonly subscribers: QuizSubscriberService,
  ) {}

  /**
   * POST /api/v1/quiz/subscribe
   * { email, name?, youtubeHandle? } → opt in for quiz-start notifications.
   * Idempotent: re-subscribing the same email is a no-op success.
   * Re-subscribing an inactive (previously-unsubscribed) email reactivates.
   */
  @Post('subscribe')
  async subscribe(@Body() body: {
    email?: string; name?: string; youtubeHandle?: string;
  }) {
    return this.subscribers.subscribe(body);
  }

  /**
   * GET /api/v1/quiz/unsubscribe/:token
   * Public one-click unsubscribe (no auth, token-keyed). Returns plain
   * HTML so the link works straight from an email client.
   */
  @Get('unsubscribe/:token')
  async unsubscribe(@Param('token') token: string, @Res() res: Response) {
    try {
      await this.subscribers.unsubscribe(token);
      res.setHeader('Content-Type', 'text/html');
      res.send(unsubResponseHtml('You\'ve been unsubscribed', 'Sorry to see you go. You won\'t get any more quiz reminders.'));
    } catch {
      res.status(404).setHeader('Content-Type', 'text/html');
      res.send(unsubResponseHtml('Invalid link', 'This unsubscribe link is invalid or expired. If you keep getting emails, just reply and we\'ll remove you manually.'));
    }
  }

  /** GET /api/v1/quiz/info — current week's quiz metadata */
  @Get('info')
  getInfo() {
    return this.quizService.getCurrentQuizInfo();
  }

  /**
   * GET /api/v1/quiz/leaderboard/weeks — list quiz weeks whose entries
   * are safe to show publicly (config.endsAt < now). Used to populate
   * the week picker on the public leaderboard page. Live + upcoming
   * weeks are intentionally omitted.
   */
  @Get('leaderboard/weeks')
  publicLeaderboardWeeks() {
    return this.quizService.getPublicClosedWeeks();
  }

  /**
   * GET /api/v1/quiz/leaderboard/:week — public leaderboard for ONE
   * closed quiz week. Returns ONLY name + score + time + rank. PII
   * (email, UPI, IP, fingerprint) stays admin-side. Returns 400 if
   * the requested week is still live or upcoming.
   */
  @Get('leaderboard/:week')
  publicLeaderboard(
    @Param('week', ParseIntPipe) week: number,
    @Query('limit') limit?: string,
  ) {
    return this.quizService.getPublicLeaderboard(
      week, Number(limit) || 50,
    );
  }

  /** POST /api/v1/quiz/start — begin a new quiz session */
  @Post('start')
  start(
    @Body() body: {
      fullName: string; email: string; upiId: string; youtubeHandle?: string;
      // Trust & Safety signals from the frontend (all optional)
      deviceFingerprint?: string;
      browserId?: string;
      screenResolution?: string;
    },
    @Req() req: Request,
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress ?? undefined;
    const userAgent = req.headers['user-agent'] ?? undefined;
    return this.quizService.startQuiz({ ...body, ipAddress, userAgent });
  }

  /** POST /api/v1/quiz/answer — submit answer for current question */
  @Post('answer')
  answer(@Body() body: {
    sessionId: string;
    selectedAnswer?: string;
    selectedAnswers?: string[];
    selectedNumber?: number;
  }) {
    return this.quizService.submitAnswer(body);
  }

  /** POST /api/v1/quiz/complete — finalize submission with optional tiebreaker */
  @Post('complete')
  complete(
    @Body() body: {
      sessionId: string;
      tiebreakerAnswer?: number;
      // Trust & Safety signals captured during the quiz
      deviceFingerprint?: string;
      browserId?: string;
      screenResolution?: string;
      tabSwitchCount?: number;
      copyPasteDetected?: boolean;
    },
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'] ?? undefined;
    return this.quizService.completeQuiz({ ...body, userAgent });
  }
}

// ── Admin quiz endpoints (AdminGuard required) ──────────────────────────
@Controller('admin/quiz')
@UseGuards(AdminGuard)
export class QuizAdminController {
  constructor(
    private readonly quizService: QuizService,
    private readonly subscribers: QuizSubscriberService,
  ) {}

  // ── Subscribers (notification opt-ins) ──────────────────────────────

  @Get('subscribers')
  listSubscribers(@Query('active') active?: string) {
    const a = active === 'true' ? true : active === 'false' ? false : undefined;
    return this.subscribers.adminList({ active: a });
  }

  @Get('subscribers/count')
  subscriberCount() {
    return this.subscribers.adminCount();
  }

  /** Manual fire — useful for testing the cron path without waiting 5 min. */
  @Post('subscribers/notify-now')
  notifyNow() {
    return this.subscribers.runDueNotificationsBatch();
  }

  // ── Quiz Config (start/end times, duration) ──────────────────────────

  @Get('config')
  getConfigs() {
    return this.quizService.adminGetConfigs();
  }

  @Post('config')
  upsertConfig(@Body() body: {
    quizWeek: number;
    title?: string;
    description?: string;
    startsAt: string;
    endsAt: string;
    durationMinutes?: number;
    questionsPerQuiz?: number;
    easyPercent?: number;
    mediumPercent?: number;
    hardPercent?: number;
    tiebreakerQuestion?: string;
    isActive?: boolean;
  }) {
    return this.quizService.adminUpsertConfig(body);
  }

  @Delete('config/:id')
  deleteConfig(@Param('id') id: string) {
    return this.quizService.adminDeleteConfig(id);
  }

  // ── Submissions ──────────────────────────────────────────────────────

  @Get('submissions')
  getSubmissions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('quizWeek') quizWeek?: string,
    @Query('sortBy') sortBy?: 'score' | 'time' | 'submittedAt',
    @Query('search') search?: string,
  ) {
    return this.quizService.adminGetSubmissions({
      page, limit,
      quizWeek: quizWeek ? parseInt(quizWeek, 10) : undefined,
      sortBy, search,
    });
  }

  @Patch('submissions/:id/winner')
  markWinner(
    @Param('id') id: string,
    @Body() body: { rank: number | null },
  ) {
    return this.quizService.adminMarkWinner(id, body.rank);
  }

  /** Flag a submission as disqualified — hides from public leaderboard + clears winner badge. */
  @Patch('submissions/:id/disqualify')
  disqualifySubmission(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: Request,
  ) {
    // Admin identity lives in the AdminGuard's attached request property;
    // fall back to "admin" if the guard didn't attach one (e.g. local dev).
    const actor = (req as Request & { admin?: { email?: string } }).admin?.email ?? 'admin';
    return this.quizService.adminDisqualifySubmission(id, {
      reason: body.reason,
      actor,
    });
  }

  /** Undo a disqualification — entrant reappears on the public leaderboard. */
  @Patch('submissions/:id/reinstate')
  reinstateSubmission(@Param('id') id: string) {
    return this.quizService.adminReinstateSubmission(id);
  }

  @Get('submissions/export')
  async exportSubmissions(
    @Query('quizWeek') quizWeek: string | undefined,
    @Res() res: Response,
  ) {
    const week = quizWeek ? parseInt(quizWeek, 10) : undefined;
    const csv = await this.quizService.adminExportSubmissionsCSV(week);
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const filename = `rehearse_submissions_week-${week ?? 'all'}_${ts}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
  }

  // ── Questions CRUD ───────────────────────────────────────────────────

  @Get('questions')
  getQuestions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('quizWeek') quizWeek?: string,
    @Query('difficulty') difficulty?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
  ) {
    return this.quizService.adminGetQuestions({
      page, limit,
      quizWeek: quizWeek ? parseInt(quizWeek, 10) : undefined,
      difficulty, category, search, active,
    });
  }

  @Post('questions')
  createQuestion(@Body() body: Record<string, unknown>) {
    return this.quizService.adminCreateQuestion(body);
  }

  @Patch('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.quizService.adminUpdateQuestion(id, body);
  }

  @Delete('questions/:id')
  deleteQuestion(@Param('id') id: string) {
    return this.quizService.adminDeleteQuestion(id);
  }

  @Post('questions/bulk')
  bulkAction(@Body() body: { ids: string[]; action: 'activate' | 'deactivate' | 'delete'; quizWeek?: number }) {
    return this.quizService.adminBulkAction(body);
  }

  // ── Import / Export ──────────────────────────────────────────────────

  @Post('questions/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importQuestions(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { mode?: 'append' | 'replace'; quizWeek?: string; preview?: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    const filename = file.originalname.toLowerCase();
    let rows: Array<Record<string, unknown>> = [];

    if (filename.endsWith('.csv')) {
      const text = file.buffer.toString('utf-8');
      const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
      if (parsed.errors.length) {
        throw new BadRequestException(`CSV parse errors: ${parsed.errors.map((e) => e.message).join('; ')}`);
      }
      rows = parsed.data;
    } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      const wb = XLSX.read(file.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet);
    } else {
      throw new BadRequestException('Unsupported file type. Use .csv, .xlsx, or .xls');
    }

    const quizWeek = body.quizWeek ? parseInt(body.quizWeek, 10) : undefined;

    // Preview-only: validate without saving
    if (body.preview === 'true') {
      const errors: Array<{ row: number; message: string }> = [];
      const valid: number[] = [];
      const svc = this.quizService as unknown as {
        parseImportRow: (r: Record<string, unknown>, defaultQuizWeek?: number) => unknown;
        validateQuestion: (q: unknown) => void;
      };
      rows.forEach((row, i) => {
        try {
          const parsed = svc.parseImportRow(row, quizWeek);
          svc.validateQuestion(parsed);
          valid.push(i + 2);
        } catch (err) {
          errors.push({ row: i + 2, message: (err as Error).message });
        }
      });
      return {
        totalRows: rows.length,
        validCount: valid.length,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
        preview: rows.slice(0, 5),
      };
    }

    const mode = body.mode ?? 'append';
    return this.quizService.adminImportQuestions(rows, mode, quizWeek);
  }

  @Get('questions/export')
  async exportQuestions(
    @Query('quizWeek') quizWeek: string | undefined,
    @Query('difficulty') difficulty: string | undefined,
    @Query('category') category: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.quizService.adminExportQuestionsCSV({
      quizWeek: quizWeek ? parseInt(quizWeek, 10) : undefined,
      difficulty,
      category,
    });
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const filename = `rehearse_questions_week-${quizWeek ?? 'all'}_${ts}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
  }

  /** GET /api/v1/admin/quiz/questions/template — blank CSV template */
  @Get('questions/template')
  template(@Res() res: Response) {
    const csv = `question_type,question_text,option_a,option_b,option_c,option_d,correct_answer,correct_answers,correct_number,numeric_tolerance,numeric_unit,points,difficulty,category,quiz_week,is_mandatory
mcq,"Which of these is the BIGGEST umbrella term?","Machine Learning","Deep Learning","Artificial Intelligence","Neural Network",C,,,,,1,easy,"Lesson 1 — AI vs ML vs DL",1,false
true_false,"Deep Learning is a subset of Machine Learning.","True","False",,,A,,,,,1,easy,"Lesson 1 — AI vs ML vs DL",1,false
multi_select,"Which of these are neural network types?","CNN","SVM","RNN","Transformer",,"A,C,D",,,,2,medium,"Architectures",1,false
numeric,"How many parameters (in billions) does GPT-4 have approximately?",,,,,,,1760,200,billion,5,hard,"Models",1,true`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=quiz_questions_template.csv');
    res.send(csv);
  }
}

/** Minimal HTML returned by the public unsubscribe endpoint. */
function unsubResponseHtml(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
  <title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#0A0E27;
           color:#fff; min-height:100vh; display:flex; align-items:center; justify-content:center;
           padding:24px; margin:0; }
    .card { background:#151B3D; border:1px solid rgba(255,255,255,.1); border-radius:16px;
            padding:32px; max-width:480px; text-align:center; }
    h1 { margin:0 0 12px 0; font-size:22px; }
    p  { margin:0 0 20px 0; color:#B8C5E0; }
    a  { color:#00D4FF; text-decoration:none; font-weight:600; }
  </style></head>
  <body><div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://reharse.inferix.in/quiz">← Back to Quiz</a>
  </div></body></html>`;
}
