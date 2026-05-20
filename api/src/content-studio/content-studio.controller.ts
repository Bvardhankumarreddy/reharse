import {
  Controller, Get, Post, Param, Query, Body, Res, UseGuards,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../auth/admin.guard';
import { Brand } from './entities/brand.entity';
import { BrandMemory } from './entities/brand-memory.entity';
import { WeeklyContentPlan } from './entities/weekly-content-plan.entity';
import { AgentRun } from './entities/agent-run.entity';
import { StrategyAgent } from './agents/strategy.agent';
import { ScriptAgent } from './agents/script.agent';
import { PptAgent } from './agents/ppt.agent';
import { QuizAgent } from './agents/quiz.agent';

@Controller('admin/content-studio')
@UseGuards(AdminGuard)
export class ContentStudioController {
  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(BrandMemory) private readonly memoryRepo: Repository<BrandMemory>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(AgentRun) private readonly runRepo: Repository<AgentRun>,
    private readonly strategy: StrategyAgent,
    private readonly script: ScriptAgent,
    private readonly ppt: PptAgent,
    private readonly quiz: QuizAgent,
  ) {}

  @Get('brands')
  async brands() {
    const data = await this.brandRepo.find({ order: { createdAt: 'ASC' } });
    return { data, count: data.length };
  }

  @Get('brands/:id/memories')
  memories(@Param('id') id: string) {
    return this.memoryRepo.find({
      where: { brandId: id },
      order: { weight: 'DESC' },
    });
  }

  @Get('plans')
  async plans(@Query('brandId') brandId?: string) {
    const qb = this.planRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.lessons', 'l')
      .orderBy('p."weekOf"', 'DESC')
      .limit(100);
    if (brandId) qb.where('p."brandId" = :brandId', { brandId });
    const data = await qb.getMany();
    return {
      data: data.map((p) => ({
        ...p,
        lessonCount: p.lessons?.length ?? 0,
      })),
      count: data.length,
    };
  }

  /** Slice 1: Strategy Agent → week plan + 2 lessons. */
  @Post('plans/generate')
  generate(@Body() body: { brandId?: string; weekOf?: string }) {
    if (!body?.brandId) throw new BadRequestException('brandId is required');
    return this.strategy.generateWeek(body.brandId, body.weekOf);
  }

  /** Slice 2: Script Agent → 8-12 min audio script for ONE lesson. */
  @Post('lessons/:id/script/generate')
  generateScript(@Param('id') id: string) {
    return this.script.generateScript(id);
  }

  /** Latest script asset for the lesson, or null if none generated yet. */
  @Get('lessons/:id/script')
  async lessonScript(@Param('id') id: string) {
    const asset = await this.script.latestScript(id);
    if (!asset) throw new NotFoundException('No script generated yet');
    return asset;
  }

  /** Slice 3: PPT Agent → 13-slide JSON. */
  @Post('lessons/:id/ppt/generate')
  generatePpt(@Param('id') id: string) {
    return this.ppt.generatePpt(id);
  }

  @Get('lessons/:id/ppt')
  async lessonPpt(@Param('id') id: string) {
    const asset = await this.ppt.latestPpt(id);
    if (!asset) throw new NotFoundException('No slides generated yet');
    return asset;
  }

  /** Render the latest slides as a branded .pptx and stream it. */
  @Get('lessons/:id/ppt/download')
  async downloadPpt(@Param('id') id: string, @Res() res: Response) {
    const { buf, filename } = await this.ppt.renderLatest(id);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buf.length),
    });
    res.send(buf);
  }

  // ── Slice 4: Quiz Agent + cross-provider validator + XLSX ──────────────

  /** Generate (and cross-provider validate) a 50-question pool for the plan. */
  @Post('plans/:id/quiz/generate')
  generateQuizPool(@Param('id') id: string) {
    return this.quiz.generatePool(id);
  }

  @Get('plans/:id/quiz/pool')
  async quizPool(@Param('id') id: string) {
    const data = await this.quiz.listPool(id);
    const valid = data.filter((q) => q.validationPassed).length;
    return {
      data, count: data.length, valid,
      passRate: data.length === 0 ? 0 : valid / data.length,
    };
  }

  /** Draw the Saturday quiz (4 easy + 3 medium + 2 hard). */
  @Post('plans/:id/quiz/draw')
  drawQuiz(@Param('id') id: string) {
    return this.quiz.drawSaturdayQuiz(id);
  }

  @Get('plans/:id/quiz')
  quizLatest(@Param('id') id: string) {
    return this.quiz.latestDelivered(id);
  }

  /** Stream the latest drawn quiz as an .xlsx (variant=public|private). */
  @Get('plans/:id/quiz/download')
  async downloadQuiz(
    @Param('id') id: string,
    @Query('variant') variant: string | undefined,
    @Res() res: Response,
  ) {
    const v = variant === 'private' ? 'private' : 'public';
    const { buf, filename } = await this.quiz.renderLatestXlsx(id, v);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buf.length),
    });
    res.send(buf);
  }

  @Get('plans/:id')
  async plan(@Param('id') id: string) {
    const plan = await this.planRepo.findOne({
      where: { id },
      relations: ['lessons'],
    });
    if (!plan) throw new NotFoundException('Plan not found');
    plan.lessons?.sort((a, b) => a.lessonNumber - b.lessonNumber);
    const agentRuns = await this.runRepo.find({
      where: { planId: id },
      order: { createdAt: 'ASC' },
    });
    return { ...plan, agentRuns };
  }
}
