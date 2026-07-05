import {
  Controller, Get, Post, Body, Param, Query, Req, UseGuards,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../auth/admin.guard';
import { AiPulseScript } from '../entities/news-script.entity';
import { AiPulseNewsItem } from '../entities/news-item.entity';
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
    @InjectRepository(AiPulseNewsItem)
    private readonly newsItems: Repository<AiPulseNewsItem>,
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
    // item can have multiple scripts across statuses. Return ONLY the
    // latest script per news item. Older rows stay in the DB for audit
    // but disappear from the workflow lists.
    //
    // Raw query for the dedup step — TypeORM's createQueryBuilder
    // mangles DISTINCT ON syntax; raw SQL is predictable and matches
    // what Postgres actually wants. Outer findByIds hydrates the rows
    // + news_item relation cleanly.
    const effectiveStatus = (status ?? 'pending_review').toLowerCase();
    const ALLOWED = ['pending_review', 'approved', 'published', 'rejected'];
    const statusFilter = effectiveStatus === 'all'
      ? null
      : (ALLOWED.includes(effectiveStatus) ? effectiveStatus : 'pending_review');

    const params: unknown[] = [];
    const conds: string[] = [];
    if (statusFilter) { params.push(statusFilter); conds.push(`s.approval_status = $${params.length}`); }
    if (vertical)     { params.push(vertical);     conds.push(`s.vertical = $${params.length}`); }
    // Always hide scripts whose underlying news item was flagged as a
    // duplicate — the operator has decided they never want to look at
    // it again in the workflow. Older versions of the same script that
    // predate the flag also disappear because we join on news_item_id.
    conds.push(`n.status <> 'duplicate'`);
    const whereSql = `WHERE ${conds.join(' AND ')}`;
    const latestRows = await this.scripts.query<{ id: string }[]>(
      `SELECT DISTINCT ON (s.news_item_id) s.id
         FROM ai_pulse_scripts s
         JOIN ai_pulse_news_items n ON n.id = s.news_item_id
         ${whereSql}
         ORDER BY s.news_item_id, s.created_at DESC`,
      params,
    );
    const latestIds = latestRows.map((r) => r.id);
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

  /**
   * Flag the underlying news item as a duplicate. Hides it (and every
   * script generated from it, past + future) from the workflow queue.
   * If body.duplicate_of is a valid news_item UUID, we record the
   * canonical article; otherwise the flag stands on its own.
   * Also rejects the current script (with reason "duplicate") so any
   * downstream that reads approval_status also skips it.
   */
  @Post(':id/mark-duplicate')
  async markDuplicate(
    @Param('id') id: string,
    @Body() body: { duplicate_of?: string },
  ) {
    const script = await this.scripts.findOne({ where: { id } });
    if (!script) throw new NotFoundException('script not found');

    // If a canonical target was passed, validate it exists — never
    // link a duplicate flag to a phantom UUID.
    let canonicalId: string | null = null;
    if (body.duplicate_of) {
      const canonical = await this.newsItems.findOne({
        where: { id: body.duplicate_of },
      });
      if (!canonical) {
        throw new NotFoundException(
          `duplicate_of news item ${body.duplicate_of} not found`,
        );
      }
      canonicalId = canonical.id;
    }

    await this.newsItems.update(script.news_item_id, {
      status: 'duplicate',
      duplicate_of: canonicalId,
    });

    script.approval_status = 'rejected';
    script.rejection_reason = 'Marked as duplicate';
    await this.scripts.save(script);

    return { success: true, news_item_id: script.news_item_id, duplicate_of: canonicalId };
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
   * Regenerate ONLY the Telugu translation for an existing script.
   * Leaves English + character_cast untouched, and wipes scenes_te
   * (they were sliced from the old Telugu text). Use when you want a
   * fresh Telugu without churning a polished English script.
   */
  @Post(':id/regenerate-translation')
  async regenerateTranslation(@Param('id') id: string) {
    return this.scriptGen.translateToTelugu(id);
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
  async generateScenes(
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    const lang = (language === 'te') ? 'te' : 'en';
    return this.scenes.generateFor(id, lang);
  }

  @Get(':id/scenes')
  async getScenes(@Param('id') id: string) {
    const script = await this.scripts.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    return {
      scenes:               script.scenes ?? null,
      scenesGeneratedAt:    script.scenes_generated_at,
      scenesCostUsd:        script.scenes_cost_usd,
      scenesTe:             script.scenes_te ?? null,
      scenesTeGeneratedAt:  script.scenes_te_generated_at,
      scenesTeCostUsd:      script.scenes_te_cost_usd,
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
