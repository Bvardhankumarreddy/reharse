import {
  Controller, Get, Post, Patch, Param, Body, UseGuards,
  NotFoundException, BadRequestException, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from '../../auth/admin.guard';
import { ShortScript } from '../entities/short-script.entity';
import { HeyGenService } from '../services/heygen.service';
import { PublishingService } from '../services/publishing.service';
import { PublishPlatform } from '../entities/publishing-log.entity';

@Controller('admin/ai-quick-bytes/approval')
@UseGuards(AdminGuard)
export class ApprovalController {
  constructor(
    @InjectRepository(ShortScript)
    private readonly scriptRepo: Repository<ShortScript>,
    private readonly heygen: HeyGenService,
    private readonly publishing: PublishingService,
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
    const result = await this.heygen.generateVideo({
      avatarId,
      voiceId: script.voiceId ?? '',
      script: script.fullScript,
      aspectRatio: '9:16',
      callbackUrl: `${appUrl}/api/v1/webhooks/ai-quick-bytes/heygen`,
    });

    await this.scriptRepo.update(id, {
      status: 'generating',
      heygenVideoId: result.videoId,
      approvedBy: email,
      approvedAt: new Date(),
    });
    return { success: true, videoId: result.videoId };
  }

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
}
