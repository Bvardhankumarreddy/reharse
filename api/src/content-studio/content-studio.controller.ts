import {
  Controller, Get, Post, Patch, Delete, Param, Query, Body, Req, Res, UseGuards,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import type { Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../auth/admin.guard';
import { Brand } from './entities/brand.entity';
import { BrandMemory } from './entities/brand-memory.entity';
import { WeeklyContentPlan } from './entities/weekly-content-plan.entity';
import { Lesson } from './entities/lesson.entity';
import { ContentAsset, AssetType } from './entities/content-asset.entity';
import { AgentRun } from './entities/agent-run.entity';
import { StrategyAgent } from './agents/strategy.agent';
import { ScriptAgent } from './agents/script.agent';
import { PptAgent } from './agents/ppt.agent';
import { SeoAgent } from './agents/seo.agent';
import { ThumbnailAgent } from './agents/thumbnail.agent';
import { PromoAgent } from './agents/promo.agent';
import { QuizAgent } from './agents/quiz.agent';
import { PostmortemAgent } from './agents/postmortem.agent';
import { ImprovementAgent } from './agents/improvement.agent';
import { ThumbnailImageAgent } from './agents/thumbnail-image.agent';
import { YouTubePublishService } from './services/youtube-publish.service';
import { CommentReplyAgent } from './agents/comment-reply.agent';
import { PipelineOrchestratorService } from './services/pipeline-orchestrator.service';
import { DlqService } from './services/dlq.service';
import { AuditService } from './services/audit.service';
import { ContentStudioStatsService } from './services/stats.service';
import { BrandMemoryService } from './services/brand-memory.service';
import { CompetitorFetcherService } from './services/competitor-fetcher.service';
import { MetricsFetcherService } from './services/metrics-fetcher.service';
import { YouTubeDataService } from './services/youtube-data.service';
import { CS_INTELLIGENCE_QUEUE } from './workers/intelligence.worker';
import { CompetitorChannel } from './entities/competitor-channel.entity';
import { CompetitorVideo } from './entities/competitor-video.entity';
import { LessonMetrics } from './entities/lesson-metrics.entity';
import { Channel as ChannelEntity } from './entities/channel.entity';
import type { AuditEntityType } from './entities/audit-log.entity';
import type { PipelineStage } from './entities/pipeline-run.entity';
import { PIPELINE_STAGES } from './entities/pipeline-run.entity';
import type { DlqStatus } from './entities/dead-letter-job.entity';

@Controller('admin/content-studio')
@UseGuards(AdminGuard)
export class ContentStudioController {
  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(BrandMemory) private readonly memoryRepo: Repository<BrandMemory>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(AgentRun) private readonly runRepo: Repository<AgentRun>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    @InjectRepository(CompetitorChannel)
    private readonly competitorChannelRepo: Repository<CompetitorChannel>,
    @InjectRepository(CompetitorVideo)
    private readonly competitorVideoRepo: Repository<CompetitorVideo>,
    @InjectRepository(LessonMetrics)
    private readonly metricsRepo: Repository<LessonMetrics>,
    @InjectRepository(ChannelEntity)
    private readonly channelRepo: Repository<ChannelEntity>,
    private readonly strategy: StrategyAgent,
    private readonly script: ScriptAgent,
    private readonly ppt: PptAgent,
    private readonly seo: SeoAgent,
    private readonly thumbnail: ThumbnailAgent,
    private readonly promo: PromoAgent,
    private readonly quiz: QuizAgent,
    private readonly postmortem: PostmortemAgent,
    private readonly improvement: ImprovementAgent,
    private readonly thumbnailImage: ThumbnailImageAgent,
    private readonly publishSvc: YouTubePublishService,
    private readonly commentReply: CommentReplyAgent,
    private readonly orchestrator: PipelineOrchestratorService,
    private readonly dlq: DlqService,
    private readonly audit: AuditService,
    private readonly stats: ContentStudioStatsService,
    private readonly memorySvc: BrandMemoryService,
    private readonly competitor: CompetitorFetcherService,
    private readonly metricsFetcher: MetricsFetcherService,
    private readonly ytData: YouTubeDataService,
    @InjectQueue(CS_INTELLIGENCE_QUEUE) private readonly intelQueue: Queue,
  ) {}

  private writerFrom(req: Request) {
    const u = (req as Request & { user?: { sub?: string; email?: string } }).user;
    return { userId: u?.sub ?? null, userEmail: u?.email ?? null };
  }

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

  /**
   * Phase C: per-brand model overrides. Body shape:
   *   { modelOverrides: { strategy?: "claude-opus-4-7", script?: "...", ... } }
   * Pass an empty value to clear an entry.
   */
  @Patch('brands/:id')
  async updateBrand(
    @Param('id') id: string,
    @Body() body: { modelOverrides?: Record<string, string> },
    @Req() req: Request,
  ) {
    const brand = await this.brandRepo.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    if (body.modelOverrides) {
      const valid = new Set([
        'strategy', 'script', 'ppt', 'seo', 'thumbnail',
        'promo', 'quiz', 'quiz_validator', 'grader',
      ]);
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.modelOverrides)) {
        if (!valid.has(k)) {
          throw new BadRequestException(`Unknown task "${k}"`);
        }
        const value = String(v ?? '').trim();
        if (value) next[k] = value.slice(0, 120);
      }
      const before = { modelOverrides: brand.modelOverrides ?? {} };
      await this.brandRepo.update(id, { modelOverrides: next });
      await this.audit.log({
        entityType: 'brand',
        entityId: id,
        action: 'updated',
        before,
        after: { modelOverrides: next },
        summary: `Updated model overrides on brand "${brand.name}"`,
        writer: this.writerFrom(req),
      });
    }
    return this.brandRepo.findOne({ where: { id } });
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

  // ── Phase B (Slice B1): SEO / Thumbnail / Promo agents ────────────────

  @Post('lessons/:id/seo/generate')
  generateSeo(@Param('id') id: string) { return this.seo.generateSeo(id); }

  @Get('lessons/:id/seo')
  async lessonSeo(@Param('id') id: string) {
    const a = await this.seo.latestSeo(id);
    if (!a) throw new NotFoundException('No SEO generated yet');
    return a;
  }

  @Post('lessons/:id/thumbnail/generate')
  generateThumbnail(@Param('id') id: string) {
    return this.thumbnail.generateThumbnail(id);
  }

  @Get('lessons/:id/thumbnail')
  async lessonThumbnail(@Param('id') id: string) {
    const a = await this.thumbnail.latestThumbnail(id);
    if (!a) throw new NotFoundException('No thumbnail prompt yet');
    return a;
  }

  @Post('lessons/:id/promo/generate')
  generatePromo(@Param('id') id: string) {
    return this.promo.generatePromo(id);
  }

  @Get('lessons/:id/promo')
  async lessonPromo(@Param('id') id: string) {
    const a = await this.promo.latestPromo(id);
    if (!a) throw new NotFoundException('No promo posts yet');
    return a;
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

  // ── Slice 5: Orchestrator (async pipeline + resume) ────────────────────

  /** Kick off (or resume) the end-to-end pipeline for a plan. */
  @Post('plans/:id/run')
  runPipeline(
    @Param('id') id: string,
    @Body() body?: { fromStage?: string },
  ) {
    const fs = body?.fromStage;
    const fromStage =
      fs && (PIPELINE_STAGES as readonly string[]).includes(fs)
        ? (fs as PipelineStage)
        : undefined;
    return this.orchestrator.enqueueRun(id, fromStage);
  }

  @Get('plans/:id/runs')
  async runsForPlan(@Param('id') id: string) {
    const data = await this.orchestrator.listForPlan(id);
    return { data, count: data.length };
  }

  @Get('plans/:id/runs/latest')
  latestRunForPlan(@Param('id') id: string) {
    return this.orchestrator.latestForPlan(id);
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string) {
    return this.orchestrator.get(id);
  }

  // ── Phase D: multi-brand (create) ───────────────────────────────────────

  @Post('brands')
  async createBrand(
    @Body() body: {
      name?: string; slug?: string; description?: string; voiceStyle?: string;
      colorPrimary?: string; colorSecondary?: string;
      modelOverrides?: Record<string, string>;
    },
    @Req() req: Request,
  ) {
    if (!body.name?.trim()) throw new BadRequestException('name required');
    if (!body.slug?.trim()) throw new BadRequestException('slug required');
    const slug = body.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const existing = await this.brandRepo.findOne({ where: { slug } });
    if (existing) throw new BadRequestException(`slug "${slug}" already exists`);

    const created = await this.brandRepo.save(
      this.brandRepo.create({
        name: body.name.trim().slice(0, 255),
        slug,
        description: body.description?.slice(0, 2000) ?? null,
        voiceStyle: body.voiceStyle?.slice(0, 2000) ?? null,
        colorPrimary: body.colorPrimary?.slice(0, 20) ?? null,
        colorSecondary: body.colorSecondary?.slice(0, 20) ?? null,
        modelOverrides: body.modelOverrides ?? {},
        isActive: true,
      }),
    );
    await this.audit.log({
      entityType: 'brand', entityId: created.id, action: 'created',
      after: { name: created.name, slug: created.slug },
      summary: `Created brand "${created.name}"`,
      writer: this.writerFrom(req),
    });
    return created;
  }

  // ── Phase D: brand memories CRUD (with pgvector on save) ───────────────

  @Post('brands/:id/memories')
  async addMemory(
    @Param('id') brandId: string,
    @Body() body: { memoryType?: string; content?: string; weight?: number; appliesTo?: string[] },
    @Req() req: Request,
  ) {
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Brand not found');
    if (!body.content?.trim()) throw new BadRequestException('content required');
    const validTypes = new Set(['voice', 'style', 'hook', 'structure', 'do', 'dont']);
    const memoryType = String(body.memoryType ?? 'style').toLowerCase();
    if (!validTypes.has(memoryType)) {
      throw new BadRequestException(`memoryType must be one of ${[...validTypes].join(', ')}`);
    }
    const validAgents = new Set([
      'strategy', 'script', 'ppt', 'seo', 'thumbnail', 'promo', 'quiz',
    ]);
    const appliesTo = (body.appliesTo ?? []).filter((t) => validAgents.has(t));
    const created = await this.memoryRepo.save(
      this.memoryRepo.create({
        brandId,
        memoryType: memoryType as 'voice' | 'style' | 'hook' | 'structure' | 'do' | 'dont',
        content: body.content.trim().slice(0, 4000),
        weight: typeof body.weight === 'number' ? Math.max(0, Math.min(5, body.weight)) : 1,
        appliesTo,
        isActive: true,
      }),
    );
    // Best-effort embedding for pgvector retrieval.
    void this.memorySvc.embedOnSave(created.id, created.content);
    await this.audit.log({
      entityType: 'memory', entityId: created.id, action: 'created',
      after: { brandId, memoryType: created.memoryType, appliesTo },
      summary: `Added "${created.memoryType}" memory to brand "${brand.name}"`,
      writer: this.writerFrom(req),
    });
    return created;
  }

  @Delete('brands/:id/memories/:memoryId')
  async deleteMemory(
    @Param('id') brandId: string,
    @Param('memoryId') memoryId: string,
    @Req() req: Request,
  ) {
    const m = await this.memoryRepo.findOne({ where: { id: memoryId, brandId } });
    if (!m) throw new NotFoundException('Memory not found');
    await this.memoryRepo.update(memoryId, { isActive: false });
    await this.audit.log({
      entityType: 'memory', entityId: memoryId, action: 'deleted',
      summary: `Soft-deleted ${m.memoryType} memory`,
      writer: this.writerFrom(req),
    });
    return { success: true };
  }

  // ── Phase D: competitor channels (D1 + intelligence digest) ────────────

  @Get('brands/:id/competitors')
  async listCompetitors(@Param('id') brandId: string) {
    const data = await this.competitorChannelRepo.find({
      where: { brandId, isActive: true },
      order: { createdAt: 'ASC' },
    });
    return { data, count: data.length };
  }

  @Post('brands/:id/competitors')
  async addCompetitor(
    @Param('id') brandId: string,
    @Body() body: { name?: string; channelHandle?: string; youtubeChannelId?: string; notes?: string },
    @Req() req: Request,
  ) {
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Brand not found');
    if (!body.name?.trim()) throw new BadRequestException('name required');
    if (!body.channelHandle && !body.youtubeChannelId) {
      throw new BadRequestException('channelHandle or youtubeChannelId required');
    }
    const created = await this.competitorChannelRepo.save(
      this.competitorChannelRepo.create({
        brandId,
        name: body.name.trim().slice(0, 255),
        channelHandle: body.channelHandle?.slice(0, 255) ?? null,
        youtubeChannelId: body.youtubeChannelId?.slice(0, 64) ?? null,
        notes: body.notes?.slice(0, 1000) ?? null,
        isActive: true,
      }),
    );
    await this.audit.log({
      entityType: 'brand', entityId: brandId, action: 'updated',
      after: { addedCompetitor: created.name },
      summary: `Added competitor "${created.name}" to brand "${brand.name}"`,
      writer: this.writerFrom(req),
    });
    return created;
  }

  @Delete('brands/:id/competitors/:cid')
  async deleteCompetitor(
    @Param('id') brandId: string,
    @Param('cid') cid: string,
    @Req() req: Request,
  ) {
    const c = await this.competitorChannelRepo.findOne({ where: { id: cid, brandId } });
    if (!c) throw new NotFoundException('Competitor not found');
    await this.competitorChannelRepo.update(cid, { isActive: false });
    await this.audit.log({
      entityType: 'brand', entityId: brandId, action: 'updated',
      after: { removedCompetitor: c.name },
      summary: `Removed competitor "${c.name}"`,
      writer: this.writerFrom(req),
    });
    return { success: true };
  }

  /** Manual sync for one competitor channel (otherwise nightly cron). */
  @Post('brands/:id/competitors/:cid/sync')
  async syncCompetitor(
    @Param('id') brandId: string,
    @Param('cid') cid: string,
  ) {
    if (!this.ytData.isConfigured()) {
      throw new BadRequestException(
        'CS_YT_API_KEY not set — competitor sync is dormant',
      );
    }
    const c = await this.competitorChannelRepo.findOne({ where: { id: cid, brandId } });
    if (!c) throw new NotFoundException('Competitor not found');
    const saved = await this.competitor.fetchOne(c, 25);
    return { saved };
  }

  /** Top-viewed competitor videos in last N days for the brand. */
  @Get('brands/:id/intelligence/competitor-top')
  async competitorTop(
    @Param('id') brandId: string,
    @Query('days') days?: string,
  ) {
    const data = await this.competitor.topRecentForBrand(
      brandId, 15, days ? Math.max(1, parseInt(days, 10)) : 30,
    );
    return { data, count: data.length };
  }

  // ── Phase D: cross-week orchestration (plan N future weeks) ────────────

  @Post('brands/:id/plan-ahead')
  async planAhead(
    @Param('id') brandId: string,
    @Body() body: { weeks?: number },
    @Req() req: Request,
  ) {
    const n = Math.max(1, Math.min(8, Number(body.weeks ?? 4) || 4));
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Brand not found');

    // Future Mondays (UTC), starting next Monday.
    const monday = (offsetWeeks: number): string => {
      const d = new Date();
      const day = d.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day;
      d.setUTCDate(d.getUTCDate() + diff + offsetWeeks * 7);
      return d.toISOString().slice(0, 10);
    };

    const created: Array<{ planId: string; weekOf: string; theme: string | null }> = [];
    for (let i = 1; i <= n; i++) {
      const week = monday(i);
      const exists = await this.planRepo.findOne({ where: { brandId, weekOf: week } });
      if (exists) {
        created.push({ planId: exists.id, weekOf: week, theme: exists.theme });
        continue;
      }
      const plan = await this.strategy.generateWeek(brandId, week);
      created.push({ planId: plan.id, weekOf: week, theme: plan.theme });
    }
    await this.audit.log({
      entityType: 'brand', entityId: brandId, action: 'updated',
      after: { plannedWeeks: created.map((c) => c.weekOf) },
      summary: `Planned ${n} weeks ahead for "${brand.name}"`,
      writer: this.writerFrom(req),
    });
    return { weeks: created };
  }

  // ── Phase D: per-lesson YouTube metrics ─────────────────────────────────

  @Get('lessons/:id/metrics')
  async lessonMetrics(@Param('id') lessonId: string) {
    const latest = await this.metricsFetcher.latestFor(lessonId);
    if (!latest) throw new NotFoundException('No metrics fetched yet');
    return latest;
  }

  // ── Phase D / D2: Postmortem + Improvement + Thumbnail image ──────────

  @Post('lessons/:id/postmortem/generate')
  generatePostmortem(@Param('id') id: string) {
    return this.postmortem.generateFor(id);
  }

  @Get('lessons/:id/postmortem')
  async lessonPostmortem(@Param('id') id: string) {
    const a = await this.postmortem.latestFor(id);
    if (!a) throw new NotFoundException('No postmortem yet');
    return a;
  }

  /** Run the Improvement Agent — auto-promotes winning hooks into BrandMemory. */
  @Post('improvement/run')
  async runImprovement(@Req() req: Request) {
    const result = await this.improvement.runForAllBrands();
    await this.audit.log({
      entityType: 'brand', entityId: null, action: 'updated',
      after: { promoted: result.promoted, scanned: result.scanned },
      summary: `Improvement Agent: scanned ${result.scanned} brand(s), promoted ${result.promoted} hook pattern(s) into BrandMemory`,
      writer: this.writerFrom(req),
    });
    return result;
  }

  @Post('lessons/:id/thumbnail-image/generate')
  generateThumbnailImage(@Param('id') id: string) {
    return this.thumbnailImage.generateFor(id);
  }

  @Get('lessons/:id/thumbnail-image')
  async lessonThumbnailImage(@Param('id') id: string) {
    const v = await this.thumbnailImage.latestFor(id);
    if (!v || !v.thumbnailB64) {
      throw new NotFoundException('No thumbnail image generated yet');
    }
    return v;
  }

  // ── Phase D / D3 + D4: publish + comments (OAuth-gated) ───────────────

  /**
   * Push SEO metadata + the generated thumbnail PNG to an existing YouTube
   * upload (we don't stitch MP4s). Body: { youtubeVideoId }.
   * Dormant unless CS_YT_OAUTH_* envs are set.
   */
  @Post('lessons/:id/publish')
  async publishLesson(
    @Param('id') lessonId: string,
    @Body() body: { youtubeVideoId?: string },
    @Req() req: Request,
  ) {
    const vid = body?.youtubeVideoId?.trim();
    if (!vid) throw new BadRequestException('youtubeVideoId required');
    const result = await this.publishSvc.publishMetadata(lessonId, vid);
    await this.audit.log({
      entityType: 'asset', entityId: result.id, action: 'updated',
      after: { youtubeVideoId: vid, youtubeUrl: result.youtubeUrl },
      summary: `Pushed SEO + thumbnail to ${result.youtubeUrl}`,
      writer: this.writerFrom(req),
    });
    return result;
  }

  /**
   * Fetch the latest top-level comments for a published lesson, spam-filter
   * each, and draft a reply in the brand voice. Returns drafts as JSON —
   * the admin reviews + posts via POST .../comments/post-reply.
   * Reading requires CS_YT_API_KEY; posting requires OAuth (dormant).
   */
  @Get('lessons/:id/comments/drafts')
  async commentDrafts(
    @Param('id') lessonId: string,
    @Query('limit') limit?: string,
  ) {
    return this.commentReply.draftFor(
      lessonId, limit ? Math.max(1, Math.min(100, parseInt(limit, 10))) : 25,
    );
  }

  /** OAuth-only — actually posts an admin-approved reply to YouTube. */
  @Post('lessons/:id/comments/post-reply')
  async postReply(
    @Param('id') lessonId: string,
    @Body() body: { parentCommentId?: string; text?: string },
    @Req() req: Request,
  ) {
    if (!body?.parentCommentId || !body?.text) {
      throw new BadRequestException('parentCommentId + text required');
    }
    const result = await this.commentReply.postReply(body.parentCommentId, body.text);
    await this.audit.log({
      entityType: 'asset', entityId: null, action: 'created',
      after: { lessonId, parentCommentId: body.parentCommentId, replyId: result.id },
      summary: `Posted YouTube comment reply (parent ${body.parentCommentId})`,
      writer: this.writerFrom(req),
    });
    return result;
  }

  /** Manually trigger both intelligence crons (otherwise scheduled). */
  @Post('intelligence/sync-now')
  async syncNow() {
    await this.intelQueue.add('competitor-sweep', {}, { removeOnComplete: true });
    await this.intelQueue.add('metrics-sweep', {}, { removeOnComplete: true });
    return { queued: true };
  }

  // ── Slice C2: asset version history + rollback ─────────────────────────

  /** Roll-back-able asset types (versioned per (lessonId, assetType)). */
  private static readonly ROLLBACK_TYPES: AssetType[] = [
    'script', 'ppt', 'seo', 'thumbnail_prompt', 'promo',
  ];

  @Get('lessons/:id/assets/:assetType/versions')
  async listVersions(
    @Param('id') lessonId: string,
    @Param('assetType') assetType: string,
  ) {
    const at = this.resolveAssetType(assetType);
    const data = await this.assetRepo.find({
      where: { lessonId, assetType: at },
      order: { version: 'DESC' },
      select: [
        'id', 'version', 'qualityScore', 'revisions', 'critique',
        'confidence', 'status', 'createdAt',
      ],
    });
    return { data, count: data.length };
  }

  @Post('lessons/:id/assets/:assetType/versions/:version/rollback')
  async rollbackToVersion(
    @Param('id') lessonId: string,
    @Param('assetType') assetType: string,
    @Param('version') version: string,
    @Req() req: Request,
  ) {
    const at = this.resolveAssetType(assetType);
    const v = parseInt(version, 10);
    if (!Number.isFinite(v) || v < 1) {
      throw new BadRequestException('version must be a positive integer');
    }
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const target = await this.assetRepo.findOne({
      where: { lessonId, assetType: at, version: v },
    });
    if (!target) {
      throw new NotFoundException(`No ${at} v${v} for this lesson`);
    }
    const latest = await this.assetRepo.findOne({
      where: { lessonId, assetType: at },
      order: { version: 'DESC' },
    });
    if (latest && latest.version === v) {
      throw new BadRequestException(`v${v} is already the latest`);
    }

    const newAsset = await this.assetRepo.save(
      this.assetRepo.create({
        planId: target.planId,
        lessonId: target.lessonId,
        assetType: target.assetType,
        version: (latest?.version ?? target.version) + 1,
        content: target.content as Record<string, unknown> | null,
        qualityScore: target.qualityScore,
        revisions: target.revisions ?? 0,
        critique: target.critique ?? null,
        confidence: target.confidence ?? null,
        status: 'draft',
      }),
    );

    await this.audit.log({
      entityType: 'asset',
      entityId: newAsset.id,
      action: 'rolled_back',
      before: { fromVersion: latest?.version ?? null, latestAssetId: latest?.id ?? null },
      after: { toSourceVersion: target.version, sourceAssetId: target.id, newVersion: newAsset.version },
      summary: `Rolled back ${at} on lesson "${lesson.title}" to v${target.version} (now v${newAsset.version})`,
      writer: this.writerFrom(req),
    });

    return newAsset;
  }

  private resolveAssetType(raw: string): AssetType {
    const at = raw as AssetType;
    if (!ContentStudioController.ROLLBACK_TYPES.includes(at)) {
      throw new BadRequestException(
        `assetType must be one of ${ContentStudioController.ROLLBACK_TYPES.join(', ')}`,
      );
    }
    return at;
  }

  // ── Slice C3: stats dashboard ──────────────────────────────────────────

  @Get('stats')
  getStats() {
    return this.stats.all();
  }

  // ── Slice C2: audit timeline ────────────────────────────────────────────

  @Get('audit')
  async auditList(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('limit') limit?: string,
  ) {
    const t = entityType as AuditEntityType | undefined;
    const data = await this.audit.list({
      entityType: t,
      entityId: entityId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { data, count: data.length };
  }

  // ── Slice 6: Dead-letter queue (failure triage) ────────────────────────

  @Get('dlq')
  async dlqList(@Query('status') status?: string) {
    const valid = status === 'pending' || status === 'retried' || status === 'abandoned'
      ? (status as DlqStatus)
      : undefined;
    const data = await this.dlq.list(valid);
    return { data, count: data.length };
  }

  /** Re-enqueue a failed run from where it stopped. */
  @Post('dlq/:id/retry')
  async dlqRetry(@Param('id') id: string) {
    const job = await this.dlq.get(id);
    const coords = this.dlq.pipelineCoordsFor(job);
    if (!coords) {
      throw new BadRequestException(
        'DLQ row is not a pipeline-stage-failure (cannot auto-retry)',
      );
    }
    const run = await this.orchestrator.enqueueRun(coords.planId, coords.stage);
    await this.dlq.markRetried(id);
    return { dlqId: id, runId: run.id, planId: coords.planId, stage: coords.stage };
  }

  @Post('dlq/:id/abandon')
  dlqAbandon(@Param('id') id: string) {
    return this.dlq.abandon(id);
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
