import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, Req,
  UseGuards, ParseIntPipe, DefaultValuePipe, Header, Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Overview ──────────────────────────────────────────────────────────

  /** GET /api/v1/admin/stats */
  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  // ── Analytics ─────────────────────────────────────────────────────────

  /** GET /api/v1/admin/analytics/dau-wau?days=30 */
  @Get('analytics/dau-wau')
  getDAUWAU(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.adminService.getDAUWAU(days);
  }

  /** GET /api/v1/admin/analytics/heatmap */
  @Get('analytics/heatmap')
  getHeatmap() {
    return this.adminService.getSessionHeatmap();
  }

  /** GET /api/v1/admin/analytics/funnel */
  @Get('analytics/funnel')
  getFunnel() {
    return this.adminService.getFunnel();
  }

  /** GET /api/v1/admin/analytics/retention?weeks=8 */
  @Get('analytics/retention')
  getRetention(@Query('weeks', new DefaultValuePipe(8), ParseIntPipe) weeks: number) {
    return this.adminService.getRetention(weeks);
  }

  // ── Users ─────────────────────────────────────────────────────────────

  /** GET /api/v1/admin/users */
  @Get('users')
  getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('tier') tier?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getUsers({ page, limit, search, tier, status });
  }

  /** GET /api/v1/admin/users/export */
  @Get('users/export')
  async exportUsers(@Res() res: Response) {
    const csv = await this.adminService.exportUsersCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
    res.send(csv);
  }

  /** GET /api/v1/admin/users/:id */
  @Get('users/:id')
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  /** PATCH /api/v1/admin/users/:id */
  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() body: {
      isAdmin?: boolean;
      subscriptionTier?: string;
      subscriptionStatus?: string;
      subscriptionEndsAt?: string;
    },
  ) {
    return this.adminService.updateUser(id, body);
  }

  // ── User Notes ────────────────────────────────────────────────────────

  /** POST /api/v1/admin/users/:id/notes */
  @Post('users/:id/notes')
  addNote(
    @Param('id') id: string,
    @Body() body: { content: string },
    @Req() req: Request,
  ) {
    const authorEmail = (req as Request & { user?: { email?: string } }).user?.email ?? 'admin';
    return this.adminService.addNote(id, body.content, authorEmail);
  }

  /** DELETE /api/v1/admin/notes/:noteId */
  @Delete('notes/:noteId')
  deleteNote(@Param('noteId') noteId: string) {
    return this.adminService.deleteNote(noteId);
  }

  // ── Session Review ────────────────────────────────────────────────────

  /** GET /api/v1/admin/sessions */
  @Get('sessions')
  getSessionsForReview(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getSessionsForReview({ page, limit, type, status, search });
  }

  /** GET /api/v1/admin/sessions/:id */
  @Get('sessions/:id')
  getSessionDetail(@Param('id') id: string) {
    return this.adminService.getSessionDetail(id);
  }

  // ── Question Bank ─────────────────────────────────────────────────────

  /** GET /api/v1/admin/questions */
  @Get('questions')
  getQuestions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('difficulty') difficulty?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
  ) {
    return this.adminService.getQuestionsAdmin({ page, limit, type, difficulty, search, active });
  }

  /** POST /api/v1/admin/questions */
  @Post('questions')
  createQuestion(
    @Body() body: {
      question: string;
      type: string;
      difficulty: string;
      modelAnswer?: string;
      tags?: string[];
      companies?: string[];
      roles?: string[];
    },
  ) {
    return this.adminService.createQuestion(body);
  }

  /** PATCH /api/v1/admin/questions/:id */
  @Patch('questions/:id')
  updateQuestion(
    @Param('id') id: string,
    @Body() body: Partial<{
      question: string;
      type: string;
      difficulty: string;
      modelAnswer: string;
      tags: string[];
      companies: string[];
      roles: string[];
      isActive: boolean;
    }>,
  ) {
    return this.adminService.updateQuestion(id, body);
  }

  /** DELETE /api/v1/admin/questions/:id (soft delete) */
  @Delete('questions/:id')
  deleteQuestion(@Param('id') id: string) {
    return this.adminService.deleteQuestion(id);
  }

  // ── AI Feedback Audit ─────────────────────────────────────────────────

  /** GET /api/v1/admin/feedback-audit */
  @Get('feedback-audit')
  getFeedbackAudit(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('minScore') minScore?: string,
    @Query('maxScore') maxScore?: string,
  ) {
    return this.adminService.getFeedbackAudit({
      page,
      limit,
      minScore: minScore ? parseInt(minScore, 10) : undefined,
      maxScore: maxScore ? parseInt(maxScore, 10) : undefined,
    });
  }

  // ── User Feedback ─────────────────────────────────────────────────────

  /** GET /api/v1/admin/feedback */
  @Get('feedback')
  getFeedback(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: string,
  ) {
    return this.adminService.getFeedback({ page, limit, category });
  }

  // ── Revenue ───────────────────────────────────────────────────────────

  /** GET /api/v1/admin/revenue */
  @Get('revenue')
  getRevenue() {
    return this.adminService.getRevenue();
  }
}
