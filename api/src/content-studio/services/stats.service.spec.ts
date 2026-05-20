/* eslint-disable @typescript-eslint/no-explicit-any */
import { ContentStudioStatsService } from './stats.service';

/**
 * Stats service is a thin transform over raw SQL — verify the shape and
 * the success-rate / memory-pool computations. No real DB needed.
 */
function makeFixtures() {
  // Fixed responses keyed by the query string fragment.
  const runRows: any[] = [];
  const assetRows: any[] = [];
  let memCount = 5;
  const memApplicable: Record<string, number> = {
    strategy: 5, script: 5, ppt: 5, seo: 1,
    thumbnail: 1, promo: 1, quiz: 1,
  };

  const runRepo: any = {
    query: jest.fn(async (sql: string) => {
      if (/SUM\("costUsd"\)/i.test(sql)) {
        return [
          { week: '2026-05-05', cost: '1.20' },
          { week: '2026-05-12', cost: '3.40' },
        ];
      }
      if (/SUM\(CASE WHEN status='success'/i.test(sql)) {
        return [
          { agentType: 'script',  s: '8',  f: '2' },
          { agentType: 'ppt',     s: '10', f: '0' },
        ];
      }
      if (/status = 'failed'/i.test(sql)) {
        return [
          { agent_type: 'script', error: 'timeout', n: '3', last_at: '2026-05-10T00:00:00Z' },
          { agent_type: 'ppt',    error: 'json parse', n: '1', last_at: '2026-05-08T00:00:00Z' },
        ];
      }
      return runRows;
    }),
  };
  const assetRepo: any = {
    query: jest.fn(async () => [
      { assetType: 'script', week: '2026-05-12', avg: '82.5', n: '4' },
      { assetType: 'ppt',    week: '2026-05-12', avg: '75',   n: '2' },
    ]),
  };
  const memRepo: any = {
    count: jest.fn(async () => memCount),
    createQueryBuilder: jest.fn(() => {
      let lastTag = '';
      const qb: any = {
        where: () => qb,
        andWhere: (_clause: string, params?: any) => {
          if (params?.tag) lastTag = JSON.parse(params.tag)[0];
          return qb;
        },
        getCount: jest.fn(async () => memApplicable[lastTag] ?? 0),
      };
      return qb;
    }),
  };

  return {
    service: new ContentStudioStatsService(runRepo, assetRepo, memRepo),
    runRepo, assetRepo, memRepo,
    setMemCount: (n: number) => { memCount = n; },
    assetRows,
  };
}

describe('ContentStudioStatsService', () => {
  it('shapes costPerWeek', async () => {
    const fx = makeFixtures();
    const rows = await fx.service.costPerWeek();
    expect(rows).toEqual([
      { weekStart: '2026-05-05', costUsd: 1.2 },
      { weekStart: '2026-05-12', costUsd: 3.4 },
    ]);
  });

  it('shapes qualityTrend', async () => {
    const fx = makeFixtures();
    const rows = await fx.service.qualityTrend();
    expect(rows).toHaveLength(2);
    expect(rows[0].avgScore).toBe(82.5);
    expect(rows[0].samples).toBe(4);
  });

  it('computes successRate per agent', async () => {
    const fx = makeFixtures();
    const rows = await fx.service.successRate();
    const byType = Object.fromEntries(rows.map((r) => [r.agentType, r]));
    expect(byType.script).toEqual({
      agentType: 'script', success: 8, failed: 2, total: 10, rate: 0.8,
    });
    expect(byType.ppt.rate).toBe(1);
  });

  it('returns topFailures sorted by count', async () => {
    const fx = makeFixtures();
    const rows = await fx.service.topFailures();
    expect(rows[0]).toMatchObject({ error: 'timeout', count: 3, agentType: 'script' });
    expect(rows).toHaveLength(2);
  });

  it('memoryPool gives an applicable count per agent type', async () => {
    const fx = makeFixtures();
    const rows = await fx.service.memoryPool();
    const byType = Object.fromEntries(rows.map((r) => [r.agentType, r]));
    expect(byType.script.applicable).toBe(5);
    expect(byType.script.total).toBe(5);
    expect(byType.seo.applicable).toBe(1);
  });

  it('all() bundles every section + a timestamp', async () => {
    const fx = makeFixtures();
    const bundle = await fx.service.all();
    expect(bundle.costPerWeek.length).toBe(2);
    expect(bundle.qualityTrend.length).toBe(2);
    expect(bundle.successRate.length).toBe(2);
    expect(bundle.topFailures.length).toBe(2);
    expect(bundle.memoryPool.length).toBe(7); // 7 agent types
    expect(typeof bundle.generatedAt).toBe('string');
  });
});
