import {
  Controller, Get, Post, Param, Query, UseGuards, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminGuard } from '../../auth/admin.guard';
import { AqbMemory } from '../entities/aqb-memory.entity';
import { AqbShortPostmortem } from '../entities/short-postmortem.entity';
import { AqbMetricsFetcherService } from '../services/aqb-metrics-fetcher.service';
import { AqbPostmortemAgent } from '../agents/aqb-postmortem.agent';
import { AqbImprovementAgent } from '../agents/aqb-improvement.agent';
import { AqbMemoryService } from '../services/aqb-memory.service';

@Controller('admin/ai-quick-bytes/intelligence')
@UseGuards(AdminGuard)
export class AqbIntelligenceController {
  constructor(
    @InjectRepository(AqbMemory) private readonly memRepo: Repository<AqbMemory>,
    @InjectRepository(AqbShortPostmortem) private readonly pmRepo: Repository<AqbShortPostmortem>,
    private readonly metrics: AqbMetricsFetcherService,
    private readonly postmortem: AqbPostmortemAgent,
    private readonly improvement: AqbImprovementAgent,
    private readonly memorySvc: AqbMemoryService,
  ) {}

  // ── Read ──────────────────────────────────────────────────────────────

  @Get('memories')
  memories() {
    return this.memorySvc.list();
  }

  @Get('postmortems')
  async postmortems(@Query('limit') limit?: string) {
    const n = Math.max(1, Math.min(50, Number(limit) || 20));
    const rows = await this.pmRepo.find({
      order: { createdAt: 'DESC' },
      take: n,
    });
    return { data: rows, count: rows.length };
  }

  @Get('postmortems/:scriptId')
  async postmortemForScript(@Param('scriptId') scriptId: string) {
    const pm = await this.postmortem.latestFor(scriptId);
    if (!pm) throw new NotFoundException('No postmortem yet');
    return pm;
  }

  // ── Manual triggers ───────────────────────────────────────────────────

  @Post('metrics-sweep')
  runMetricsSweep() {
    return this.metrics.fetchAll();
  }

  @Post('postmortem-sweep')
  runPostmortemSweep() {
    return this.postmortem.runDailyBatch();
  }

  @Post('postmortems/:scriptId/generate')
  generatePostmortem(@Param('scriptId') scriptId: string) {
    return this.postmortem.generateFor(scriptId);
  }

  @Post('improvement-sweep')
  runImprovementSweep() {
    return this.improvement.runWeekly();
  }
}
