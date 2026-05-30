import {
  Controller, Get, Post, Patch, Param, Body, UseGuards,
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
import { ThumbnailPromptService } from '../services/thumbnail-prompt.service';
import { TranslationService } from '../services/translation.service';
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
    private readonly config: ConfigService,
  ) {}

  /** Draft scripts awaiting approval, highest news score first. */
  @Get('queue')
  async queue() {
    // .limit() (not .take()) — joins here are OneToOne/ManyToOne with no row
    // fan-out, and it avoids TypeORM's take()+join+orderBy crash.
    return this.scriptRepo
      .createQueryBuilder('script')
      .leftJoinAndSelect('script.newsItem', 'item')
      .leftJoinAndSelect('item.source', 'source')
      .leftJoinAndSelect('item.score', 'score')
      .where('script.status = :status', { status: 'draft' })
      .orderBy('score.compositeScore', 'DESC')
      .limit(20)
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

    // ── Telugu video (parallel; skipped if no Telugu voice or no script) ─
    let teluguVideoId: string | null = null;
    let teluguError: string | null = null;
    const teluguVoiceId = this.heygen.resolveTeluguVoiceId(script.avatarId);
    if (script.teluguFullScript && teluguVoiceId) {
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

  @Get('stats/daily')
  dailyStats() {
    return this.publishing.getDailyStats();
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
    };
  }

  @Post(':id/distribution/regenerate')
  async regenerateDistribution(@Param('id') id: string) {
    const script = await this.scriptRepo.findOne({
      where: { id },
      relations: ['newsItem', 'newsItem.source'],
    });
    if (!script) throw new NotFoundException('Script not found');
    if (!script.newsItem) throw new BadRequestException('Script has no linked news item');

    const { package: pkg, cost_usd } = await this.distribution.generatePackage(
      script,
      script.newsItem,
    );
    script.distributionPackage = pkg as unknown as Record<string, unknown>;
    script.distributionCostUsd = Number(script.distributionCostUsd ?? 0) + cost_usd;
    script.distributionGeneratedAt = new Date();
    await this.scriptRepo.save(script);
    return { success: true, package: pkg, costAdded: cost_usd };
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
  async regenerateTeluguDistribution(@Param('id') id: string) {
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
    const { package: pkg, cost_usd } = await this.distribution.generatePackage(
      script, script.newsItem, 'te',
    );
    script.teluguDistributionPackage = pkg as unknown as Record<string, unknown>;
    script.distributionCostUsd =
      Number(script.distributionCostUsd ?? 0) + cost_usd;
    script.distributionGeneratedAt = new Date();
    await this.scriptRepo.save(script);
    return { success: true, package: pkg, costAdded: cost_usd };
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
