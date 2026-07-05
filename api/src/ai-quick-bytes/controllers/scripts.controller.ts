import {
  Controller, Get, Post, Query, Param, UseGuards, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AdminGuard } from '../../auth/admin.guard';
import { ShortScript, ScriptStatus } from '../entities/short-script.entity';
import { AQB_SCRIPT_GEN_QUEUE } from '../workers/script-gen.worker';

@Controller('admin/ai-quick-bytes/scripts')
@UseGuards(AdminGuard)
export class ScriptsController {
  constructor(
    @InjectRepository(ShortScript)
    private readonly scriptRepo: Repository<ShortScript>,
    @InjectQueue(AQB_SCRIPT_GEN_QUEUE) private readonly scriptQueue: Queue,
  ) {}

  @Get()
  async list(
    @Query('status') status?: ScriptStatus,
    @Query('limit') limit = '50',
  ) {
    const where = status ? { status } : {};
    const data = await this.scriptRepo.find({
      where,
      relations: ['newsItem', 'newsItem.source'],
      order: { createdAt: 'DESC' },
      take: Math.min(Number(limit) || 50, 200),
    });
    return { data, count: data.length };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const script = await this.scriptRepo.findOne({
      where: { id },
      relations: ['newsItem', 'newsItem.source'],
    });
    if (!script) throw new NotFoundException('Script not found');
    return script;
  }

  /** Generate scripts for the top-N scored stories. */
  @Post('generate-top')
  async generateTop(@Query('limit') limit = '3') {
    const job = await this.scriptQueue.add('manual-generate', {
      limit: Number(limit) || 3,
    });
    return { jobId: job.id, status: 'queued' };
  }

  /**
   * Generate a script for one specific news item.
   * When `?existingScriptId=<uuid>` is passed, the worker updates that
   * row in place (preserves status/approval/video artifacts, refreshes
   * script content, wipes derived assets). Without it, a new draft row
   * is created — used by the initial ingestion flow.
   */
  @Post('generate/:newsItemId')
  async generateOne(
    @Param('newsItemId') newsItemId: string,
    @Query('existingScriptId') existingScriptId?: string,
  ) {
    const job = await this.scriptQueue.add('generate-one', {
      newsItemId,
      existingScriptId: existingScriptId?.trim() || undefined,
    });
    return { jobId: job.id, status: 'queued' };
  }
}
