import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Queue } from 'bull';
import { AdminGuard } from '../auth/admin.guard';
import { CareerCompany } from './entities/career-company.entity';
import { JobListing } from './entities/job-listing.entity';
import { JobMatch } from './entities/job-match.entity';
import { CAREERS_INGESTION_QUEUE } from './workers/ingestion.worker';

@Controller('careers/admin')
@UseGuards(AdminGuard)
export class CareersAdminController {
  constructor(
    @InjectQueue(CAREERS_INGESTION_QUEUE) private readonly queue: Queue,
    @InjectRepository(CareerCompany)
    private readonly companyRepo: Repository<CareerCompany>,
    @InjectRepository(JobListing)
    private readonly jobRepo: Repository<JobListing>,
    @InjectRepository(JobMatch)
    private readonly matchRepo: Repository<JobMatch>,
  ) {}

  /** Trigger an ingestion sweep now (the cron also runs every 6h). */
  @Post('ingest')
  async ingest() {
    await this.queue.add('manual-fetch', {}, { removeOnComplete: true });
    return { queued: true };
  }

  @Get('stats')
  async stats() {
    const [companies, activeJobs, totalJobs, matches] = await Promise.all([
      this.companyRepo.count({ where: { isActive: true } }),
      this.jobRepo.count({ where: { status: 'active' } }),
      this.jobRepo.count(),
      this.matchRepo.count(),
    ]);
    return { companies, activeJobs, totalJobs, matches };
  }
}
