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

// ── Public quiz endpoints (no auth) ─────────────────────────────────────
@Controller('quiz')
export class QuizPublicController {
  constructor(private readonly quizService: QuizService) {}

  /** GET /api/v1/quiz/info — current week's quiz metadata */
  @Get('info')
  getInfo() {
    return this.quizService.getCurrentQuizInfo();
  }

  /** POST /api/v1/quiz/start — begin a new quiz session */
  @Post('start')
  start(
    @Body() body: { fullName: string; email: string; upiId: string; youtubeHandle?: string },
    @Req() req: Request,
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress ?? undefined;
    return this.quizService.startQuiz({ ...body, ipAddress });
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
    @Body() body: { sessionId: string; tiebreakerAnswer?: number },
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
  constructor(private readonly quizService: QuizService) {}

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

    // Preview-only: validate without saving
    if (body.preview === 'true') {
      const errors: Array<{ row: number; message: string }> = [];
      const valid: number[] = [];
      rows.forEach((row, i) => {
        try {
          const parsed = (this.quizService as unknown as { parseImportRow: (r: Record<string, unknown>) => unknown; validateQuestion: (q: unknown) => void }).parseImportRow(row);
          (this.quizService as unknown as { validateQuestion: (q: unknown) => void }).validateQuestion(parsed);
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
    const quizWeek = body.quizWeek ? parseInt(body.quizWeek, 10) : undefined;
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
    const csv = `question_type,question_text,option_a,option_b,option_c,option_d,correct_answer,correct_answers,correct_number,numeric_tolerance,numeric_unit,points,difficulty,category,quiz_week
mcq,"Which of these is the BIGGEST umbrella term?","Machine Learning","Deep Learning","Artificial Intelligence","Neural Network",C,,,,,1,easy,"Lesson 1 — AI vs ML vs DL",1
true_false,"Deep Learning is a subset of Machine Learning.","True","False",,,A,,,,,1,easy,"Lesson 1 — AI vs ML vs DL",1
multi_select,"Which of these are neural network types?","CNN","SVM","RNN","Transformer",,"A,C,D",,,,2,medium,"Architectures",1
numeric,"How many parameters (in billions) does GPT-4 have approximately?",,,,,,,1760,200,billion,3,hard,"Models",1`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=quiz_questions_template.csv');
    res.send(csv);
  }
}
