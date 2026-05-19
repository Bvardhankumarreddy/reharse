import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CareerCompany } from '../entities/career-company.entity';
import { JobListing } from '../entities/job-listing.entity';
import { CareersEmbeddingService } from './embedding.service';
import { GreenhouseAdapter } from '../sources/greenhouse.adapter';
import { LeverAdapter } from '../sources/lever.adapter';
import { AshbyAdapter } from '../sources/ashby.adapter';
import { AdzunaAdapter } from '../sources/adzuna.adapter';
import { RawJob } from '../sources/types';

@Injectable()
export class CareersIngestionService {
  private readonly logger = new Logger(CareersIngestionService.name);

  constructor(
    @InjectRepository(CareerCompany)
    private readonly companyRepo: Repository<CareerCompany>,
    @InjectRepository(JobListing)
    private readonly jobRepo: Repository<JobListing>,
    private readonly embedding: CareersEmbeddingService,
    private readonly config: ConfigService,
    private readonly greenhouse: GreenhouseAdapter,
    private readonly lever: LeverAdapter,
    private readonly ashby: AshbyAdapter,
    private readonly adzuna: AdzunaAdapter,
  ) {}

  /** Full sweep: every active ATS company + (if configured) Adzuna. */
  async fetchAll(): Promise<{ total: number; perSource: Record<string, number> }> {
    const perSource: Record<string, number> = {};
    let total = 0;

    const companies = await this.companyRepo.find({ where: { isActive: true } });
    for (const c of companies) {
      try {
        const raw = await this.fetchCompany(c);
        const n = await this.persist(raw, 'ats', c.atsPlatform, c.id);
        perSource[c.name] = n;
        total += n;
        await this.companyRepo.update(c.id, {
          lastFetchedAt: new Date(),
          errorCount: 0,
          lastError: null,
        });
      } catch (e) {
        const msg = (e as Error).message;
        this.logger.error(`Company ${c.name} failed: ${msg}`);
        perSource[c.name] = -1;
        await this.companyRepo
          .createQueryBuilder()
          .update(CareerCompany)
          .set({ lastError: msg.slice(0, 1000), errorCount: () => '"errorCount" + 1' })
          .where('id = :id', { id: c.id })
          .execute();
      }
    }

    if (this.adzuna.isConfigured()) {
      try {
        const raw = await this.adzuna.fetch();
        const n = await this.persist(raw, 'aggregator', 'adzuna', null);
        perSource['Adzuna'] = n;
        total += n;
      } catch (e) {
        this.logger.error(`Adzuna failed: ${(e as Error).message}`);
        perSource['Adzuna'] = -1;
      }
    }

    return { total, perSource };
  }

  private fetchCompany(c: CareerCompany): Promise<RawJob[]> {
    switch (c.atsPlatform) {
      case 'greenhouse':
        return this.greenhouse.fetch(c.boardToken, c.name);
      case 'lever':
        return this.lever.fetch(c.boardToken, c.name);
      case 'ashby':
        return this.ashby.fetch(c.boardToken, c.name);
      default:
        throw new Error(`Unknown ATS platform: ${c.atsPlatform}`);
    }
  }

  private async persist(
    raw: RawJob[],
    sourceType: 'ats' | 'aggregator',
    source: string,
    companyId: string | null,
  ): Promise<number> {
    const freshnessDays =
      this.config.get<number>('careers.limits.freshnessDays') ?? 30;
    const cutoff = new Date(Date.now() - freshnessDays * 86400_000);

    let saved = 0;
    for (const r of raw) {
      if (!r.applyUrl || !r.title) continue;
      if (r.postedAt && r.postedAt < cutoff) continue;

      const hash = createHash('sha256')
        .update(`${source}|${r.externalId}|${r.title}`)
        .digest('hex');
      if (await this.jobRepo.findOne({ where: { contentHash: hash } })) continue;

      const job = await this.jobRepo.save(
        this.jobRepo.create({
          companyId,
          sourceType,
          source,
          externalId: r.externalId.slice(0, 255),
          title: r.title.slice(0, 500),
          company: r.company.slice(0, 255),
          location: r.location?.slice(0, 255) ?? null,
          remote: r.remote,
          description: r.description ?? null,
          employmentType: r.employmentType?.slice(0, 50) ?? null,
          applyUrl: r.applyUrl.slice(0, 2000),
          postedAt: r.postedAt ?? null,
          contentHash: hash,
          status: 'active',
          metadata: r.metadata ?? {},
        }),
      );

      // Best-effort embedding (title + company + description) for matching.
      if (this.embedding.isConfigured()) {
        try {
          const emb = await this.embedding.generateEmbedding(
            `${r.title}\n${r.company}\n${r.description ?? ''}`,
          );
          await this.embedding.storeJobEmbedding(job.id, emb);
        } catch {
          /* embeddings optional — never block ingestion */
        }
      }
      saved++;
    }
    return saved;
  }

  /** Mark listings past the freshness window as expired (housekeeping). */
  async expireStale(): Promise<number> {
    const freshnessDays =
      this.config.get<number>('careers.limits.freshnessDays') ?? 30;
    const res = await this.jobRepo
      .createQueryBuilder()
      .update(JobListing)
      .set({ status: 'expired' })
      .where('status = :s', { s: 'active' })
      .andWhere('"postedAt" IS NOT NULL')
      .andWhere(`"postedAt" < NOW() - INTERVAL '${freshnessDays} days'`)
      .execute();
    return res.affected ?? 0;
  }
}
