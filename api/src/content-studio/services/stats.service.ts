import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentRun } from '../entities/agent-run.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import { BrandMemory } from '../entities/brand-memory.entity';

export interface CostPerWeek { weekStart: string; costUsd: number }
export interface QualityPoint {
  assetType: string; weekStart: string; avgScore: number; samples: number;
}
export interface SuccessRow {
  agentType: string; success: number; failed: number; total: number; rate: number;
}
export interface TopFailure {
  error: string; count: number; lastAt: string; agentType: string;
}
export interface MemoryPoolRow {
  agentType: string; applicable: number; total: number;
}

export interface StatsBundle {
  costPerWeek: CostPerWeek[];
  qualityTrend: QualityPoint[];
  successRate: SuccessRow[];
  topFailures: TopFailure[];
  memoryPool: MemoryPoolRow[];
  generatedAt: string;
}

const AGENT_TYPES = [
  'strategy', 'script', 'ppt', 'seo', 'thumbnail', 'promo', 'quiz',
] as const;

/** Phase C / Slice C3 — read-only stats over the existing tables. */
@Injectable()
export class ContentStudioStatsService {
  constructor(
    @InjectRepository(AgentRun) private readonly runRepo: Repository<AgentRun>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    @InjectRepository(BrandMemory) private readonly memRepo: Repository<BrandMemory>,
  ) {}

  async costPerWeek(): Promise<CostPerWeek[]> {
    const rows: Array<{ week: string; cost: string }> = await this.runRepo.query(`
      SELECT date_trunc('week', "createdAt")::date::text AS week,
             COALESCE(SUM("costUsd"), 0) AS cost
        FROM cs_agent_runs
       WHERE "createdAt" > NOW() - INTERVAL '12 weeks'
       GROUP BY 1
       ORDER BY 1
    `);
    return rows.map((r) => ({ weekStart: r.week, costUsd: Number(r.cost) }));
  }

  async qualityTrend(): Promise<QualityPoint[]> {
    const rows: Array<{ assetType: string; week: string; avg: string; n: string }> =
      await this.assetRepo.query(`
        SELECT "assetType",
               date_trunc('week', "createdAt")::date::text AS week,
               AVG("qualityScore") AS avg,
               COUNT(*) AS n
          FROM cs_content_assets
         WHERE "qualityScore" IS NOT NULL
           AND "createdAt" > NOW() - INTERVAL '12 weeks'
         GROUP BY 1, 2
         ORDER BY 2, 1
      `);
    return rows.map((r) => ({
      assetType: r.assetType,
      weekStart: r.week,
      avgScore: Number(r.avg),
      samples: Number(r.n),
    }));
  }

  async successRate(): Promise<SuccessRow[]> {
    const rows: Array<{ agentType: string; s: string; f: string }> =
      await this.runRepo.query(`
        SELECT "agentType",
               SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS s,
               SUM(CASE WHEN status='failed'  THEN 1 ELSE 0 END) AS f
          FROM cs_agent_runs
         WHERE "createdAt" > NOW() - INTERVAL '30 days'
         GROUP BY 1
         ORDER BY 1
      `);
    return rows.map((r) => {
      const success = Number(r.s);
      const failed = Number(r.f);
      const total = success + failed;
      return {
        agentType: r.agentType,
        success, failed, total,
        rate: total === 0 ? 0 : success / total,
      };
    });
  }

  async topFailures(): Promise<TopFailure[]> {
    const rows: Array<{ error: string; n: string; last_at: string; agent_type: string }> =
      await this.runRepo.query(`
        SELECT MIN("agentType") AS agent_type,
               error,
               COUNT(*) AS n,
               MAX("createdAt")::text AS last_at
          FROM cs_agent_runs
         WHERE status = 'failed' AND error IS NOT NULL
           AND "createdAt" > NOW() - INTERVAL '30 days'
         GROUP BY error
         ORDER BY n DESC, last_at DESC
         LIMIT 8
      `);
    return rows.map((r) => ({
      error: r.error,
      count: Number(r.n),
      lastAt: r.last_at,
      agentType: r.agent_type,
    }));
  }

  async memoryPool(): Promise<MemoryPoolRow[]> {
    const total = await this.memRepo.count({ where: { isActive: true } });
    const out: MemoryPoolRow[] = [];
    for (const t of AGENT_TYPES) {
      const n = await this.memRepo
        .createQueryBuilder('m')
        .where('m."isActive" = true')
        .andWhere(
          `(jsonb_array_length(m."appliesTo") = 0 OR m."appliesTo" @> :tag::jsonb)`,
          { tag: JSON.stringify([t]) },
        )
        .getCount();
      out.push({ agentType: t, applicable: n, total });
    }
    return out;
  }

  async all(): Promise<StatsBundle> {
    const [costPerWeek, qualityTrend, successRate, topFailures, memoryPool] =
      await Promise.all([
        this.costPerWeek(),
        this.qualityTrend(),
        this.successRate(),
        this.topFailures(),
        this.memoryPool(),
      ]);
    return {
      costPerWeek,
      qualityTrend,
      successRate,
      topFailures,
      memoryPool,
      generatedAt: new Date().toISOString(),
    };
  }
}
