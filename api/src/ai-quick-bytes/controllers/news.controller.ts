import {
  Controller, Get, Post, Query, Param, UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AdminGuard } from '../../auth/admin.guard';
import { NewsItem, NewsItemStatus } from '../entities/news-item.entity';
import { NewsSource } from '../entities/news-source.entity';
import { AQB_INGESTION_QUEUE } from '../workers/ingestion.worker';
import { AQB_SCORING_QUEUE } from '../workers/scoring.worker';

@Controller('admin/ai-quick-bytes')
@UseGuards(AdminGuard)
export class NewsController {
  constructor(
    @InjectRepository(NewsItem)
    private readonly itemRepo: Repository<NewsItem>,
    @InjectRepository(NewsSource)
    private readonly sourceRepo: Repository<NewsSource>,
    @InjectQueue(AQB_INGESTION_QUEUE) private readonly ingestionQueue: Queue,
    @InjectQueue(AQB_SCORING_QUEUE) private readonly scoringQueue: Queue,
  ) {}

  @Get('sources')
  listSources() {
    return this.sourceRepo.find({ order: { name: 'ASC' } });
  }

  @Get('news')
  async listNews(
    @Query('status') status?: NewsItemStatus,
    @Query('limit') limit = '50',
    @Query('since') since?: string, // ISO date — publishedAt >= since
    @Query('until') until?: string, // ISO date — publishedAt <= until
  ) {
    // score is OneToOne (no row fan-out) so .limit() is safe and avoids
    // TypeORM's fragile take()+join+orderBy "combined order" code path.
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.source', 'source')
      .leftJoinAndSelect('item.score', 'score')
      .orderBy('item.publishedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('score.compositeScore', 'DESC')
      .limit(Math.min(Number(limit) || 50, 200));
    if (status) qb.andWhere('item.status = :status', { status });
    const sinceDate = since ? new Date(since) : null;
    if (sinceDate && !isNaN(sinceDate.getTime())) {
      qb.andWhere('item.publishedAt >= :since', { since: sinceDate });
    }
    const untilDate = until ? new Date(until) : null;
    if (untilDate && !isNaN(untilDate.getTime())) {
      // inclusive of the whole 'until' day
      untilDate.setHours(23, 59, 59, 999);
      qb.andWhere('item.publishedAt <= :until', { until: untilDate });
    }
    const data = await qb.getMany();
    return { data, count: data.length };
  }

  @Get('news/:id')
  getNews(@Param('id') id: string) {
    return this.itemRepo.findOne({
      where: { id },
      relations: ['source', 'score'],
    });
  }

  /** Trigger a fetch now (all sources, or one by sourceId). */
  @Post('ingestion/run')
  async runIngestion(@Query('sourceId') sourceId?: string) {
    const job = await this.ingestionQueue.add('manual-fetch', { sourceId });
    return { jobId: job.id, status: 'queued' };
  }

  /** Trigger scoring of pending raw items now. */
  @Post('scoring/run-pending')
  async runScoring(@Query('limit') limit = '50') {
    const job = await this.scoringQueue.add('manual-score', {
      limit: Number(limit) || 50,
    });
    return { jobId: job.id, status: 'queued' };
  }
}
