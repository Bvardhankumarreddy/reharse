import {
  Controller, Get, Post, Body, Param, Query, Req, UseGuards,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../auth/admin.guard';
import { AiPulseScript } from '../entities/news-script.entity';
import { AiPulseScriptGeneratorService } from '../services/script-generator.service';
import { AiPulseThumbnailService } from '../services/thumbnail.service';
import { AiPulseDistributionService } from '../services/distribution.service';
import { AiPulseSceneGeneratorService } from '../services/scene-generator.service';

@Controller('admin/ai-pulse/approval')
@UseGuards(AdminGuard)
export class AiPulseApprovalController {
  constructor(
    @InjectRepository(AiPulseScript)
    private readonly scripts: Repository<AiPulseScript>,
    private readonly scriptGen: AiPulseScriptGeneratorService,
    private readonly thumbnails: AiPulseThumbnailService,
    private readonly distribution: AiPulseDistributionService,
    private readonly scenes: AiPulseSceneGeneratorService,
  ) {}

  /**
   * Scripts queue with optional status + vertical filters.
   * Default status = 'pending_review' (back-compat with old callers).
   * Pass `status=all` to skip the status filter entirely, or one of
   * pending_review | approved | published | rejected.
   */
  @Get('queue')
  async queue(
    @Query('vertical') vertical?: string,
    @Query('status') status?: string,
  ) {
    // Dedupe by news_item_id: regen creates a new script row, so a news
    // item can have multiple scripts across statuses (e.g. old approved
    // + new draft after regenerating for the cast system). The queue
    // shows ONLY the latest script per news item — older rows stay in
    // the DB for audit but disappear from the workflow lists.
    //
    // Two-step: subquery picks the latest script id per news_item_id
    // (within the chosen status filter), outer query joins back to
    // hydrate the full row + news_item relation.
    const effectiveStatus = (status ?? 'pending_review').toLowerCase();
    const ALLOWED = ['pending_review', 'approved', 'published', 'rejected'];
    const statusFilter = effectiveStatus === 'all'
      ? null
      : (ALLOWED.includes(effectiveStatus) ? effectiveStatus : 'pending_review');

    const latestIdsQb = this.scripts
      .createQueryBuilder('inner_s')
      .select('DISTINCT ON (inner_s.news_item_id) inner_s.id', 'id')
      .addSelect('inner_s.created_at', 'created_at')
      .orderBy('inner_s.news_item_id')
      .addOrderBy('inner_s.created_at', 'DESC');
    if (statusFilter)  latestIdsQb.where('inner_s.approval_status = :st', { st: statusFilter });
    if (vertical)      latestIdsQb.andWhere('inner_s.vertical = :v',     { v: vertical });
    const latestIds = (await latestIdsQb.getRawMany<{ id: string }>()).map((r) => r.id);
    if (latestIds.length === 0) return [];

    return this.scripts
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.news_item', 'n')
      .where('s.id IN (:...ids)', { ids: latestIds })
      .orderBy('s.created_at', 'DESC')
      .limit(50)
      .getMany();
  }

  /** Single script detail. */
  @Get(':id')
  async getScript(@Param('id') id: string) {
    const script = await this.scripts.findOne({
      where: { id }, relations: ['news_item'],
    });
    if (!script) throw new NotFoundException('script not found');
    return script;
  }

  /** Approve — admin gate before HeyGen video generation. */
  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: Request) {
    const script = await this.scripts.findOne({ where: { id } });
    if (!script) throw new NotFoundException('script not found');
    const actor = (req as Request & { admin?: { email?: string } }).admin?.email ?? 'admin';
    script.approval_status = 'approved';
    script.approved_by = actor;
    script.approved_at = new Date();
    script.rejection_reason = null;
    return this.scripts.save(script);
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    const script = await this.scripts.findOne({ where: { id } });
    if (!script) throw new NotFoundException('script not found');
    script.approval_status = 'rejected';
    script.rejection_reason = (body.reason ?? '').slice(0, 1000) || null;
    return this.scripts.save(script);
  }

  /** Re-roll the script (English + Telugu) for the same news item. */
  @Post(':id/regenerate-script')
  async regenerateScript(@Param('id') id: string) {
    const script = await this.scripts.findOne({ where: { id } });
    if (!script) throw new NotFoundException('script not found');
    return this.scriptGen.generateScript(script.news_item_id);
  }

  @Post(':id/regenerate-thumbnails')
  async regenerateThumbnails(@Param('id') id: string) {
    return this.thumbnails.generatePrompts(id);
  }

  /**
   * Regenerate the distribution package. Defaults to English for
   * back-compat; pass ?lang=te to generate / refresh the Telugu mirror.
   * Telugu requires the script's telugu_full_script to be present
   * (service throws otherwise).
   */
  @Post(':id/regenerate-distribution')
  async regenerateDistribution(
    @Param('id') id: string,
    @Query('lang') lang?: string,
  ) {
    const language = (lang ?? 'en').toLowerCase() === 'te' ? 'te' : 'en';
    return this.distribution.generatePackage(id, language);
  }

  /**
   * 🎬 Scene generator — breaks the English script into 10-18 cinematic
   * image prompts with per-vertical visual accents. Doesn't touch HeyGen
   * / publish flow. Re-runnable; overwrites previous scenes.
   */
  @Post(':id/scenes/generate')
  async generateScenes(@Param('id') id: string) {
    return this.scenes.generateFor(id);
  }

  @Get(':id/scenes')
  async getScenes(@Param('id') id: string) {
    const script = await this.scripts.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    return {
      scenes:             script.scenes ?? null,
      scenesGeneratedAt:  script.scenes_generated_at,
      scenesCostUsd:      script.scenes_cost_usd,
    };
  }

  /**
   * After admin approves + curator uploads the video to YouTube manually,
   * they ping this endpoint to flip status → published.
   */
  @Post(':id/mark-published')
  async markPublished(
    @Param('id') id: string,
    @Body() body: { english_video_url?: string; telugu_video_url?: string },
  ) {
    const script = await this.scripts.findOne({ where: { id } });
    if (!script) throw new NotFoundException('script not found');
    script.approval_status = 'published';
    script.published_at = new Date();
    if (body.english_video_url) {
      script.english_video_url = body.english_video_url;
      script.english_video_status = 'ready';
      // Extract the YouTube video ID so the hourly metrics fetcher
      // can pull stats for this short. Supports watch?v=, youtu.be/,
      // and shorts/ URL formats.
      script.english_youtube_video_id = extractYouTubeId(body.english_video_url);
    }
    if (body.telugu_video_url) {
      script.telugu_video_url = body.telugu_video_url;
      script.telugu_video_status = 'ready';
      script.telugu_youtube_video_id = extractYouTubeId(body.telugu_video_url);
    }
    return this.scripts.save(script);
  }
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}
