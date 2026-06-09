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

@Controller('admin/ai-pulse/approval')
@UseGuards(AdminGuard)
export class AiPulseApprovalController {
  constructor(
    @InjectRepository(AiPulseScript)
    private readonly scripts: Repository<AiPulseScript>,
    private readonly scriptGen: AiPulseScriptGeneratorService,
    private readonly thumbnails: AiPulseThumbnailService,
    private readonly distribution: AiPulseDistributionService,
  ) {}

  /** Pending-review queue, newest first; optional vertical filter. */
  @Get('queue')
  async queue(@Query('vertical') vertical?: string) {
    const qb = this.scripts
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.news_item', 'n')
      .where('s.approval_status = :st', { st: 'pending_review' })
      .orderBy('s.created_at', 'DESC')
      .limit(50);
    if (vertical) qb.andWhere('s.vertical = :v', { v: vertical });
    return qb.getMany();
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

  @Post(':id/regenerate-distribution')
  async regenerateDistribution(@Param('id') id: string) {
    return this.distribution.generatePackage(id);
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
    }
    if (body.telugu_video_url) {
      script.telugu_video_url = body.telugu_video_url;
      script.telugu_video_status = 'ready';
    }
    return this.scripts.save(script);
  }
}
