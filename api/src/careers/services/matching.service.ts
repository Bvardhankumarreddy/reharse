import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../../users/user.entity';
import { JobListing } from '../entities/job-listing.entity';
import { JobMatch, MatchStatus } from '../entities/job-match.entity';
import { CareersEmbeddingService } from './embedding.service';
import { CareersAnthropicClientService } from './anthropic-client.service';

const RERANK_SYSTEM = `
You are a job-matching assistant. Given a candidate's profile (resume +
preferences) and a list of job openings, score how well each job fits THIS
candidate and explain why in one short sentence.

Scoring (0-100): role/title relevance, seniority fit, skills overlap with the
resume, and the candidate's stated target role/companies. Be discerning — a
junior resume for a staff role scores low even if the domain matches.

Return STRICT JSON ONLY:
{"ranked":[{"id":"<job id verbatim>","score":<int 0-100>,"reason":"<one sentence, second person: 'You ...'>"}]}
Only include jobs worth showing (score >= 40). Keep ids EXACTLY as given.
`.trim();

interface RankedItem {
  id?: string;
  score?: number;
  reason?: string;
}

export interface MatchRow {
  matchId: string;
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  source: string;
  applyUrl: string;
  postedAt: Date | null;
  matchScore: number;
  similarity: number | null;
  rationale: string | null;
  status: MatchStatus;
}

@Injectable()
export class CareersMatchingService {
  private readonly logger = new Logger(CareersMatchingService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(JobListing) private readonly jobRepo: Repository<JobListing>,
    @InjectRepository(JobMatch) private readonly matchRepo: Repository<JobMatch>,
    private readonly embedding: CareersEmbeddingService,
    private readonly claude: CareersAnthropicClientService,
    private readonly config: ConfigService,
  ) {}

  private profileText(u: User): string {
    if (u.resumeText && u.resumeText.trim().length > 50) {
      return [
        u.targetRole ? `Target role: ${u.targetRole}` : '',
        u.experienceLevel ? `Experience level: ${u.experienceLevel}` : '',
        `Resume:\n${u.resumeText}`,
      ].filter(Boolean).join('\n');
    }
    // No resume — synthesise from onboarding preferences.
    return [
      u.targetRole ? `Target role: ${u.targetRole}` : 'Role: software',
      u.experienceLevel ? `Experience level: ${u.experienceLevel}` : '',
      u.companyType ? `Preferred company type: ${u.companyType}` : '',
      u.targetCompanies?.length ? `Target companies: ${u.targetCompanies.join(', ')}` : '',
    ].filter(Boolean).join('\n');
  }

  /**
   * Recompute this user's matches: resume/profile embedding → pgvector
   * shortlist → Claude rerank with rationale. User-set statuses (saved /
   * dismissed / applied) survive; only score + rationale refresh.
   */
  async refreshForUser(userId: string, force = false): Promise<{ matched: number; skipped?: boolean }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    if (!this.embedding.isConfigured() || !this.claude.isConfigured()) {
      throw new BadRequestException('Job matching is not configured (LLM keys missing)');
    }

    if (!force) {
      const cooldownMin =
        this.config.get<number>('careers.limits.refreshCooldownMinutes') ?? 30;
      const last = await this.matchRepo.findOne({
        where: { userId },
        order: { computedAt: 'DESC' },
      });
      if (
        last &&
        Date.now() - new Date(last.computedAt).getTime() < cooldownMin * 60_000
      ) {
        return { matched: 0, skipped: true };
      }
    }

    const topK = this.config.get<number>('careers.limits.vectorTopK') ?? 60;
    const rerankN = this.config.get<number>('careers.limits.rerankN') ?? 15;
    const floor = this.config.get<number>('careers.limits.similarityFloor') ?? 0.15;
    const freshnessDays =
      this.config.get<number>('careers.limits.freshnessDays') ?? 30;

    const profileEmb = await this.embedding.generateEmbedding(this.profileText(user));
    const candidates = (
      await this.embedding.nearestJobs(profileEmb, topK, freshnessDays)
    ).filter((c) => c.similarity >= floor);
    if (candidates.length === 0) return { matched: 0 };

    const simById = new Map(candidates.map((c) => [c.id, c.similarity]));
    const shortlist = candidates.slice(0, rerankN);
    const jobs = await this.jobRepo.find({
      where: { id: In(shortlist.map((c) => c.id)) },
    });

    const userBlock = this.profileText(user).slice(0, 6000);
    const jobsBlock = jobs
      .map(
        (j) =>
          `id: ${j.id}\nTitle: ${j.title}\nCompany: ${j.company}\n` +
          `Location: ${j.location ?? 'n/a'}${j.remote ? ' (remote)' : ''}\n` +
          `Description: ${(j.description ?? '').slice(0, 1500)}`,
      )
      .join('\n\n---\n\n');

    let ranked: RankedItem[] = [];
    try {
      const { content } = await this.claude.completeJSON({
        system: RERANK_SYSTEM,
        user: `CANDIDATE PROFILE:\n${userBlock}\n\nJOBS:\n${jobsBlock}`,
        maxTokens: 3000,
        temperature: 0.3,
      });
      ranked = (JSON.parse(content || '{}') as { ranked?: RankedItem[] }).ranked ?? [];
    } catch (e) {
      this.logger.error(`Claude rerank failed: ${(e as Error).message}`);
      // Fallback: similarity-only scoring so the user still sees matches.
      ranked = shortlist.map((c) => ({
        id: c.id,
        score: Math.round(c.similarity * 100),
        reason: undefined,
      }));
    }

    let matched = 0;
    for (const r of ranked) {
      if (!r.id || !simById.has(r.id)) continue;
      const score = Math.max(0, Math.min(100, Math.round(Number(r.score ?? 0))));
      const existing = await this.matchRepo.findOne({
        where: { userId, jobListingId: r.id },
      });
      const keepStatus =
        existing && existing.status !== 'matched' ? existing.status : 'matched';
      if (existing) {
        await this.matchRepo.update(existing.id, {
          matchScore: score,
          similarity: simById.get(r.id) ?? null,
          rationale: r.reason ?? existing.rationale ?? null,
          status: keepStatus,
          computedAt: new Date(),
        });
      } else {
        await this.matchRepo.save(
          this.matchRepo.create({
            userId,
            jobListingId: r.id,
            matchScore: score,
            similarity: simById.get(r.id) ?? null,
            rationale: r.reason ?? null,
            status: 'matched',
            computedAt: new Date(),
          }),
        );
      }
      matched++;
    }
    this.logger.log(`User ${userId}: ${matched} matches refreshed`);
    return { matched };
  }

  async listForUser(
    userId: string,
    status?: MatchStatus,
    q?: string,
  ): Promise<MatchRow[]> {
    const qb = this.matchRepo
      .createQueryBuilder('m')
      .innerJoin(JobListing, 'l', 'l.id = m."jobListingId"')
      .where('m."userId" = :userId', { userId });

    if (status) {
      qb.andWhere('m.status = :status', { status });
    } else {
      qb.andWhere('m.status != :dismissed', { dismissed: 'dismissed' });
    }
    if (q && q.trim()) {
      qb.andWhere('(l.title ILIKE :q OR l.company ILIKE :q)', { q: `%${q.trim()}%` });
    }

    const rows = await qb
      .select([
        'm.id AS "matchId"',
        'm."jobListingId" AS "jobId"',
        'l.title AS title',
        'l.company AS company',
        'l.location AS location',
        'l.remote AS remote',
        'l.source AS source',
        'l."applyUrl" AS "applyUrl"',
        'l."postedAt" AS "postedAt"',
        'm."matchScore" AS "matchScore"',
        'm.similarity AS similarity',
        'm.rationale AS rationale',
        'm.status AS status',
      ])
      .orderBy('m."matchScore"', 'DESC')
      .limit(100)
      .getRawMany<MatchRow>();

    return rows.map((r) => ({
      ...r,
      matchScore: Number(r.matchScore),
      similarity: r.similarity == null ? null : Number(r.similarity),
    }));
  }

  async setStatus(
    userId: string,
    matchId: string,
    status: MatchStatus,
  ): Promise<{ success: true }> {
    const row = await this.matchRepo.findOne({ where: { id: matchId, userId } });
    if (!row) throw new BadRequestException('Match not found');
    await this.matchRepo.update(row.id, { status });
    return { success: true };
  }
}
