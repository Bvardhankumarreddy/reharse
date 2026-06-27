import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
  NotFoundException, BadRequestException, Req, Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from '../../auth/admin.guard';
import { ShortScript } from '../entities/short-script.entity';
import { HeyGenService } from '../services/heygen.service';
import { PublishingService } from '../services/publishing.service';
import { DistributionPackageService } from '../services/distribution-package.service';
import {
  DistributionPlatform,
  DistributionPackage,
} from '../dto/distribution-package.dto';
import { ThumbnailPromptService } from '../services/thumbnail-prompt.service';
import { TranslationService } from '../services/translation.service';
import { SceneGeneratorService } from '../services/scene-generator.service';
import { PublishPlatform } from '../entities/publishing-log.entity';

@Controller('admin/ai-quick-bytes/approval')
@UseGuards(AdminGuard)
export class ApprovalController {
  constructor(
    @InjectRepository(ShortScript)
    private readonly scriptRepo: Repository<ShortScript>,
    private readonly heygen: HeyGenService,
    private readonly publishing: PublishingService,
    private readonly distribution: DistributionPackageService,
    private readonly thumbnail: ThumbnailPromptService,
    private readonly translation: TranslationService,
    private readonly scenes: SceneGeneratorService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Draft scripts awaiting approval, ordered by dayNumber ASC so the
   * curator always sees the oldest unpublished day next (matches the
   * "publish in sequence" cadence). Falls back to compositeScore DESC
   * for scripts with no dayNumber (legacy or manual-gen).
   *
   * Default limit raised to 200 so a multi-week backlog isn't silently
   * truncated. Pass ?limit=N to override (max 500). The queue is a
   * curator-only surface and rows are tiny (no LOBs in the joined
   * select), so a 200-row default is still cheap.
   */
  @Get('queue')
  async queue(@Query('limit') limitQ?: string) {
    const limit = Math.max(
      1, Math.min(500, Number(limitQ) || 200),
    );
    // Dedupe by news_item_id: regen creates a NEW script row (doesn't
    // mutate the old), so a news item can have multiple drafts in the
    // queue (e.g. old pre-cast draft + new post-cast draft after
    // regenerating). Show only the LATEST draft per news item — older
    // drafts stay in the DB for audit but disappear from the queue.
    const latestIds = (await this.scriptRepo
      .createQueryBuilder('inner_s')
      .select('DISTINCT ON (inner_s."newsItemId") inner_s.id', 'id')
      .addSelect('inner_s."createdAt"', 'createdAt')
      .where('inner_s.status = :status', { status: 'draft' })
      .orderBy('inner_s."newsItemId"')
      .addOrderBy('inner_s."createdAt"', 'DESC')
      .getRawMany<{ id: string }>())
      .map((r) => r.id);
    if (latestIds.length === 0) return [];
    // .limit() (not .take()) — joins here are OneToOne/ManyToOne with no row
    // fan-out, and it avoids TypeORM's take()+join+orderBy crash.
    return this.scriptRepo
      .createQueryBuilder('script')
      .leftJoinAndSelect('script.newsItem', 'item')
      .leftJoinAndSelect('item.source', 'source')
      .leftJoinAndSelect('item.score', 'score')
      .where('script.id IN (:...ids)', { ids: latestIds })
      .orderBy('script.dayNumber', 'ASC', 'NULLS LAST')
      .addOrderBy('score.compositeScore', 'DESC')
      .limit(limit)
      .getMany();
  }

  /** Ready-to-publish (HeyGen video done). */
  @Get('ready')
  ready() {
    return this.scriptRepo.find({
      where: { status: 'ready' },
      relations: ['newsItem'],
      order: { updatedAt: 'DESC' },
    });
  }

  @Patch(':id')
  async edit(
    @Param('id') id: string,
    @Body() body: { hook?: string; body?: string; cta?: string },
  ) {
    const script = await this.scriptRepo.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    if (script.status !== 'draft') {
      throw new BadRequestException('Only draft scripts can be edited');
    }
    const hook = body.hook ?? script.hook;
    const bodyText = body.body ?? script.body;
    const cta = body.cta ?? script.cta;
    await this.scriptRepo.update(id, {
      hook, body: bodyText, cta,
      fullScript: `${hook}\n\n${bodyText}\n\n${cta}`,
    });
    return this.scriptRepo.findOne({ where: { id } });
  }

  /** Approve → send to HeyGen (if configured) → status 'generating'. */
  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: Request) {
    const script = await this.scriptRepo.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    if (script.status !== 'draft') {
      throw new BadRequestException(`Cannot approve a script in status ${script.status}`);
    }

    const email =
      (req as Request & { user?: { email?: string } }).user?.email ?? 'admin';

    if (!this.heygen.isConfigured()) {
      // Deferred HeyGen integration: just mark approved, no video yet.
      await this.scriptRepo.update(id, {
        status: 'approved',
        approvedBy: email,
        approvedAt: new Date(),
      });
      return {
        success: true,
        heygen: 'not_configured',
        message: 'Approved. HeyGen not configured yet — video generation deferred.',
      };
    }

    const avatarId = this.heygen.resolveAvatarId(script.avatarId);
    if (!avatarId) throw new BadRequestException('No HeyGen avatar id resolved');

    const appUrl = this.config.get<string>('aiQuickBytes.appUrl');
    const callbackUrl = `${appUrl}/api/v1/webhooks/ai-quick-bytes/heygen`;

    // ── English video (primary) ─────────────────────────────────────────
    const englishResult = await this.heygen.generateVideo({
      avatarId,
      voiceId: script.voiceId ?? '',
      script: script.fullScript,
      aspectRatio: '9:16',
      callbackUrl,
    });

    // ── Telugu video (parallel; skipped unless AQB_TELUGU_FULL_TRACK on) ─
    let teluguVideoId: string | null = null;
    let teluguError: string | null = null;
    const autoTeluguVideo =
      this.config.get<boolean>('aiQuickBytes.telugu.autoVideo') ?? false;
    const teluguVoiceId = this.heygen.resolveTeluguVoiceId(script.avatarId);
    if (!autoTeluguVideo) {
      teluguError = 'AQB_TELUGU_FULL_TRACK=false — host records Telugu manually';
    } else if (script.teluguFullScript && teluguVoiceId) {
      try {
        const tg = await this.heygen.generateVideo({
          avatarId,
          voiceId: teluguVoiceId,
          script: script.teluguFullScript,
          aspectRatio: '9:16',
          callbackUrl,
        });
        teluguVideoId = tg.videoId;
      } catch (e) {
        teluguError = (e as Error).message;
        this.logger.warn(`Telugu HeyGen failed for ${id}: ${teluguError}`);
      }
    } else if (script.teluguFullScript && !teluguVoiceId) {
      teluguError = 'no Telugu voice configured for this avatar';
    } else if (!script.teluguFullScript) {
      teluguError = 'no Telugu translation on script';
    }

    await this.scriptRepo.update(id, {
      status: 'generating',
      heygenVideoId: englishResult.videoId,
      teluguHeygenVideoId: teluguVideoId,
      teluguHeygenStatus: teluguVideoId ? 'queued' : 'skipped',
      approvedBy: email,
      approvedAt: new Date(),
    });
    return {
      success: true,
      videoId: englishResult.videoId,
      telugu: teluguVideoId
        ? { videoId: teluguVideoId, status: 'queued' }
        : { videoId: null, status: 'skipped', reason: teluguError },
    };
  }

  private readonly logger = new Logger(ApprovalController.name);

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() body: { reason: string }) {
    const script = await this.scriptRepo.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    await this.scriptRepo.update(id, {
      status: 'rejected',
      rejectionReason: body.reason ?? 'No reason given',
    });
    return { success: true };
  }

  /** Manual publish tracking — no auto-upload (spec rule). */
  @Post(':id/mark-published')
  async markPublished(
    @Param('id') id: string,
    @Body() body: { platform: PublishPlatform; url: string },
  ) {
    if (!body.url || !body.platform) {
      throw new BadRequestException('platform and url are required');
    }
    const log = await this.publishing.markAsPublished(id, body.platform, body.url);
    return { success: true, logId: log.id };
  }

  /**
   * 🎬 Scene generator — story-mode feature. Breaks the assembled
   * fullScript into 10-20 cinematic image prompts for ChatGPT (one per
   * 2-4 sec of spoken script). Doesn't touch HeyGen / publish flow —
   * pure host-facing asset. Re-runnable; overwrites previous scenes.
   */
  @Post(':id/scenes/generate')
  async generateScenes(@Param('id') id: string) {
    return this.scenes.generateFor(id);
  }

  @Get(':id/scenes')
  async getScenes(@Param('id') id: string) {
    const script = await this.scriptRepo.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    return {
      scenes:             script.scenes ?? null,
      scenesGeneratedAt:  script.scenesGeneratedAt,
      scenesCostUsd:      script.scenesCostUsd,
    };
  }

  @Get('stats/daily')
  dailyStats() {
    return this.publishing.getDailyStats();
  }

  /**
   * One-shot backfill — walks every script with a non-null
   * distributionPackage / teluguDistributionPackage and lowercases
   * every hashtag / tag in place. No LLM cost.
   *
   * Idempotent: re-running is a no-op (already-lowercase strings
   * stay lowercase). Use ?dryRun=true to see the count of rows
   * that WOULD be touched without writing.
   */
  @Post('backfill/lowercase-hashtags')
  async backfillLowercaseHashtags(@Query('dryRun') dryRunQ?: string) {
    const dryRun = dryRunQ === 'true' || dryRunQ === '1';
    const scripts = await this.scriptRepo
      .createQueryBuilder('s')
      .where('s.distributionPackage IS NOT NULL OR s.teluguDistributionPackage IS NOT NULL')
      .getMany();

    let touched = 0;
    for (const s of scripts) {
      const before = JSON.stringify({
        en: s.distributionPackage ?? null,
        te: s.teluguDistributionPackage ?? null,
      });
      if (s.distributionPackage) {
        s.distributionPackage = lowercaseHashtagsInPackage(
          s.distributionPackage as Record<string, unknown>,
        ) as unknown as Record<string, unknown>;
      }
      if (s.teluguDistributionPackage) {
        s.teluguDistributionPackage = lowercaseHashtagsInPackage(
          s.teluguDistributionPackage as Record<string, unknown>,
        ) as unknown as Record<string, unknown>;
      }
      const after = JSON.stringify({
        en: s.distributionPackage ?? null,
        te: s.teluguDistributionPackage ?? null,
      });
      if (before !== after) {
        touched++;
        if (!dryRun) await this.scriptRepo.save(s);
      }
    }
    return {
      scanned: scripts.length,
      touched,
      dryRun,
      message: dryRun
        ? `Would update ${touched}/${scripts.length} scripts (no writes performed)`
        : `Updated ${touched}/${scripts.length} scripts`,
    };
  }

  // ── Thumbnail prompt ────────────────────────────────────────────────

  @Get(':id/thumbnail')
  async getThumbnail(@Param('id') id: string) {
    const script = await this.scriptRepo.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    return {
      scriptId: script.id,
      dayNumber: script.dayNumber,
      thumbnailPrompt: script.thumbnailPrompt,
      generatedAt: script.thumbnailGeneratedAt,
    };
  }

  @Post(':id/thumbnail/regenerate')
  async regenerateThumbnail(@Param('id') id: string) {
    const script = await this.scriptRepo.findOne({
      where: { id },
      relations: ['newsItem', 'newsItem.source'],
    });
    if (!script) throw new NotFoundException('Script not found');
    if (!script.newsItem) throw new BadRequestException('Script has no linked news item');

    const { result, cost_usd } = await this.thumbnail.generate(script, script.newsItem);
    script.thumbnailPrompt = result;
    script.thumbnailCostUsd = Number(script.thumbnailCostUsd ?? 0) + cost_usd;
    script.thumbnailGeneratedAt = new Date();
    await this.scriptRepo.save(script);
    return { success: true, thumbnailPrompt: result, costAdded: cost_usd };
  }

  // ── Distribution package ────────────────────────────────────────────

  @Get(':id/distribution')
  async getDistribution(@Param('id') id: string) {
    const script = await this.scriptRepo.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    return {
      scriptId: script.id,
      dayNumber: script.dayNumber,
      package: script.distributionPackage,
      generatedAt: script.distributionGeneratedAt,
      // Live YouTube snippet — what's actually live on YouTube right now,
      // captured by the hourly metrics-fetcher. Surfaces curator's
      // manual edits (extra hashtags, reworded title, etc.) back into
      // the admin so they're visible alongside the LLM-generated package.
      liveYoutube: script.liveYoutubeTitle != null || script.liveYoutubeDescription != null
        ? {
            title: script.liveYoutubeTitle,
            description: script.liveYoutubeDescription,
            fetchedAt: script.liveYoutubeFetchedAt,
          }
        : null,
    };
  }

  @Post(':id/distribution/regenerate')
  async regenerateDistribution(
    @Param('id') id: string,
    @Body() body: { platforms?: string[] } = {},
  ) {
    const script = await this.scriptRepo.findOne({
      where: { id },
      relations: ['newsItem', 'newsItem.source'],
    });
    if (!script) throw new NotFoundException('Script not found');
    if (!script.newsItem) throw new BadRequestException('Script has no linked news item');

    const { package: pkg, cost_usd, platformsGenerated } =
      await this.distribution.generatePackage(script, script.newsItem, 'en', {
        platforms: (body.platforms ?? []) as DistributionPlatform[],
        existing: (script.distributionPackage ?? null) as Partial<DistributionPackage> | null,
      });
    script.distributionPackage = pkg as unknown as Record<string, unknown>;
    script.distributionCostUsd = Number(script.distributionCostUsd ?? 0) + cost_usd;
    script.distributionGeneratedAt = new Date();
    await this.scriptRepo.save(script);
    return { success: true, package: pkg, costAdded: cost_usd, platformsGenerated };
  }

  // ── Telugu translation track ────────────────────────────────────────

  @Get(':id/telugu')
  async getTelugu(@Param('id') id: string) {
    const script = await this.scriptRepo.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    return {
      scriptId: script.id,
      dayNumber: script.dayNumber,
      teluguHook: script.teluguHook,
      teluguBody: script.teluguBody,
      teluguCta: script.teluguCta,
      teluguFullScript: script.teluguFullScript,
      teluguTranslationModel: script.teluguTranslationModel,
      teluguTranslationCostUsd: Number(script.teluguTranslationCostUsd ?? 0),
      teluguTranslatedAt: script.teluguTranslatedAt,
      teluguHeygenVideoId: script.teluguHeygenVideoId,
      teluguHeygenVideoUrl: script.teluguHeygenVideoUrl,
      teluguHeygenStatus: script.teluguHeygenStatus,
      teluguDistributionPackage: script.teluguDistributionPackage,
    };
  }

  @Post(':id/telugu/distribution/regenerate')
  async regenerateTeluguDistribution(
    @Param('id') id: string,
    @Body() body: { platforms?: string[] } = {},
  ) {
    const script = await this.scriptRepo.findOne({
      where: { id },
      relations: ['newsItem', 'newsItem.source'],
    });
    if (!script) throw new NotFoundException('Script not found');
    if (!script.newsItem) {
      throw new BadRequestException('Script has no linked news item');
    }
    if (!script.teluguFullScript) {
      throw new BadRequestException(
        'No Telugu translation on script — run /telugu/regenerate-translation first',
      );
    }
    const { package: pkg, cost_usd, platformsGenerated } =
      await this.distribution.generatePackage(script, script.newsItem, 'te', {
        platforms: (body.platforms ?? []) as DistributionPlatform[],
        existing: (script.teluguDistributionPackage ?? null) as Partial<DistributionPackage> | null,
      });
    script.teluguDistributionPackage = pkg as unknown as Record<string, unknown>;
    script.distributionCostUsd =
      Number(script.distributionCostUsd ?? 0) + cost_usd;
    script.distributionGeneratedAt = new Date();
    await this.scriptRepo.save(script);
    return { success: true, package: pkg, costAdded: cost_usd, platformsGenerated };
  }

  /**
   * Mark the Telugu YouTube video as published. Parallel to the English
   * mark-published flow — uploading is still manual per spec; this just
   * records the URL on teluguYoutubeUrl and writes a publishing log entry.
   */
  @Post(':id/telugu/mark-published')
  async markTeluguPublished(
    @Param('id') id: string,
    @Body() body: { url: string },
  ) {
    if (!body?.url) throw new BadRequestException('url is required');
    const log = await this.publishing.markAsPublished(
      id, 'youtube' as PublishPlatform, body.url, 'te',
    );
    return { success: true, logId: log.id };
  }

  @Patch(':id/telugu/distribution/:platform')
  async updateTeluguPlatformPost(
    @Param('id') id: string,
    @Param('platform') platform: string,
    @Body() updates: Record<string, unknown>,
  ) {
    const allowed = ['youtube', 'instagram', 'linkedin', 'whatsapp_channel', 'whatsapp_status'];
    if (!allowed.includes(platform)) {
      throw new BadRequestException(`platform must be one of ${allowed.join(', ')}`);
    }
    const script = await this.scriptRepo.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    const pkg = (script.teluguDistributionPackage ?? {}) as Record<string, unknown>;
    pkg[platform] = { ...((pkg[platform] as Record<string, unknown>) ?? {}), ...updates };
    script.teluguDistributionPackage = pkg;
    await this.scriptRepo.save(script);
    return { success: true, updated: platform };
  }

  @Post(':id/telugu/regenerate-translation')
  async regenerateTelugu(@Param('id') id: string) {
    const script = await this.scriptRepo.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');
    if (!script.fullScript) {
      throw new BadRequestException('Script has no English fullScript to translate from');
    }
    if (!this.translation.isConfigured()) {
      throw new BadRequestException('OpenAI not configured — translation unavailable');
    }
    const t = await this.translation.translateToTelugu({
      hook: script.hook,
      body: script.body,
      cta: script.cta,
      fullScript: script.fullScript,
    });
    await this.scriptRepo.update(id, {
      teluguHook: t.teluguHook,
      teluguBody: t.teluguBody,
      teluguCta: t.teluguCta,
      teluguFullScript: t.teluguFullScript,
      teluguTranslationModel: t.model,
      // Accumulate the cost so the ledger reflects every regeneration.
      teluguTranslationCostUsd:
        Number(script.teluguTranslationCostUsd ?? 0) + t.costUsd,
      teluguTranslatedAt: new Date(),
    });
    return {
      success: true,
      model: t.model,
      costAdded: t.costUsd,
      teluguHook: t.teluguHook,
      teluguFullScript: t.teluguFullScript,
    };
  }

  @Patch(':id/distribution/:platform')
  async updatePlatformPost(
    @Param('id') id: string,
    @Param('platform') platform: string,
    @Body() updates: Record<string, unknown>,
  ) {
    const allowed = ['youtube', 'instagram', 'linkedin', 'whatsapp_channel', 'whatsapp_status'];
    if (!allowed.includes(platform)) {
      throw new BadRequestException(`platform must be one of ${allowed.join(', ')}`);
    }
    const script = await this.scriptRepo.findOne({ where: { id } });
    if (!script) throw new NotFoundException('Script not found');

    const pkg = (script.distributionPackage ?? {}) as Record<string, unknown>;
    pkg[platform] = { ...((pkg[platform] as Record<string, unknown>) ?? {}), ...updates };
    script.distributionPackage = pkg;
    await this.scriptRepo.save(script);
    return { success: true, updated: platform };
  }
}

// ── Backfill helpers ───────────────────────────────────────────────────
/**
 * Same lowercase pass used by the live distribution generator, applied
 * to a stored package. Walks every text field where #hashtags can appear
 * plus every tags / hashtags array, mutating + returning the same object
 * shape. Idempotent on already-lowercase input.
 */
function lowercaseHashtagsInPackage(pkg: Record<string, unknown>): Record<string, unknown> {
  if (!pkg || typeof pkg !== 'object') return pkg;

  const lowerArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? (v as unknown[])
          .map((t) => String(t ?? '').toLowerCase().trim())
          .filter(Boolean)
      : [];

  type S = { title?: string; description?: string; tags?: unknown[];
             caption?: string; full_text?: string; hashtags?: unknown[];
             body?: string };
  const yt = pkg.youtube as S | undefined;
  if (yt) {
    if (typeof yt.title === 'string') yt.title = lowercaseHashtagsInText(yt.title);
    if (typeof yt.description === 'string') yt.description = lowercaseHashtagsInText(yt.description);
    if (yt.tags) yt.tags = lowerArr(yt.tags);
  }
  const ig = pkg.instagram as S | undefined;
  if (ig) {
    if (typeof ig.caption === 'string') ig.caption = lowercaseHashtagsInText(ig.caption);
    if (typeof ig.full_text === 'string') ig.full_text = lowercaseHashtagsInText(ig.full_text);
    if (ig.hashtags) ig.hashtags = lowerArr(ig.hashtags);
  }
  const li = pkg.linkedin as S | undefined;
  if (li) {
    if (typeof li.body === 'string') li.body = lowercaseHashtagsInText(li.body);
    if (typeof li.full_text === 'string') li.full_text = lowercaseHashtagsInText(li.full_text);
    if (li.hashtags) li.hashtags = lowerArr(li.hashtags);
  }
  const wc = pkg.whatsapp_channel as S | undefined;
  if (wc && typeof wc.full_text === 'string') {
    wc.full_text = lowercaseHashtagsInText(wc.full_text);
  }
  const ws = pkg.whatsapp_status as S | undefined;
  if (ws && typeof ws.full_text === 'string') {
    ws.full_text = lowercaseHashtagsInText(ws.full_text);
  }
  return pkg;
}

/**
 * Lowercase every #word hashtag in a string. Only matches ASCII word
 * chars after #, so Telugu glyphs and body text outside hashtags are
 * untouched.
 */
function lowercaseHashtagsInText(s: string): string {
  return s.replace(/#([A-Za-z0-9_]+)/g, (_m, word) => '#' + word.toLowerCase());
}
