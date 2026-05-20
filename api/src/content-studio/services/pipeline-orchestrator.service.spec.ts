/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from '@nestjs/common';
import { PipelineOrchestratorService } from './pipeline-orchestrator.service';
import { PipelineRun, PipelineStage } from '../entities/pipeline-run.entity';

/**
 * Self-contained orchestrator tests — no NestJS DI, no DB, no Bull. Mocks
 * the four collaborators (agents) and the three repositories so we can
 * assert: happy path, mid-stage failure with resume, resume-from-stage,
 * concurrent enqueue.
 */

interface MockRun extends Partial<PipelineRun> { id: string }

function makeFixtures() {
  const planRow = { id: 'plan-1', totalCostUsd: 0, brandId: 'brand-1' };
  const lessons = [
    { id: 'lesson-1', planId: 'plan-1', lessonNumber: 1 },
    { id: 'lesson-2', planId: 'plan-1', lessonNumber: 2 },
  ];
  const runStore: Record<string, MockRun> = {};

  const runRepo: any = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.id) return runStore[where.id] ?? null;
      // active-run lookup uses array of conditions
      if (Array.isArray(where)) {
        return (
          Object.values(runStore).find(
            (r) =>
              r.planId === (where[0]?.planId ?? where[1]?.planId) &&
              (r.status === 'queued' || r.status === 'running'),
          ) ?? null
        );
      }
      return null;
    }),
    save: jest.fn(async (row: MockRun) => {
      const id = row.id ?? `run-${Object.keys(runStore).length + 1}`;
      const saved: MockRun = {
        ...row,
        id,
        stagesCompleted: row.stagesCompleted ?? [],
        stagesFailed: row.stagesFailed ?? [],
      };
      runStore[id] = saved;
      return saved;
    }),
    update: jest.fn(async (id: string, patch: Partial<MockRun>) => {
      runStore[id] = { ...runStore[id], ...patch };
    }),
    create: jest.fn((row: MockRun) => row),
  };

  const planRepo: any = {
    findOne: jest.fn(async () => ({ ...planRow })),
  };

  const lessonRepo: any = {
    find: jest.fn(async () => [...lessons]),
  };

  const queue: any = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
  const script: any = { generateScript: jest.fn().mockResolvedValue({}) };
  const ppt: any = { generatePpt: jest.fn().mockResolvedValue({}) };
  const seo: any = { generateSeo: jest.fn().mockResolvedValue({}) };
  const thumbnail: any = { generateThumbnail: jest.fn().mockResolvedValue({}) };
  const promo: any = { generatePromo: jest.fn().mockResolvedValue({}) };
  const quiz: any = {
    generatePool: jest.fn().mockResolvedValue({}),
    drawSaturdayQuiz: jest.fn().mockResolvedValue({}),
  };
  const dlq: any = { recordPipelineFailure: jest.fn().mockResolvedValue({}) };

  const service = new PipelineOrchestratorService(
    runRepo, planRepo, lessonRepo, queue,
    script, ppt, seo, thumbnail, promo, quiz, dlq,
  );

  return {
    service, runRepo, planRepo, lessonRepo, queue,
    script, ppt, seo, thumbnail, promo, quiz, dlq, runStore,
  };
}

describe('PipelineOrchestratorService.enqueueRun', () => {
  it('queues a fresh run and adds a Bull job', async () => {
    const { service, queue, runStore } = makeFixtures();
    const run = await service.enqueueRun('plan-1');

    expect(run.status).toBe('queued');
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][1]).toMatchObject({
      runId: run.id,
      planId: 'plan-1',
    });
    expect(Object.keys(runStore)).toHaveLength(1);
  });

  it('rejects a second run while one is in-flight (409)', async () => {
    const { service } = makeFixtures();
    await service.enqueueRun('plan-1');
    await expect(service.enqueueRun('plan-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('pre-marks earlier stages completed when resuming from a later stage', async () => {
    const { service, runStore } = makeFixtures();
    const run = await service.enqueueRun('plan-1', 'quiz');
    const saved = runStore[run.id];
    expect(saved.stagesCompleted).toEqual(['script', 'ppt', 'seo', 'thumbnail', 'promo']);
  });
});

describe('PipelineOrchestratorService.runPipeline', () => {
  it('runs all seven stages on the happy path and marks completed', async () => {
    const fx = makeFixtures();
    const run = await fx.service.enqueueRun('plan-1');
    await fx.service.runPipeline({ runId: run.id, planId: 'plan-1' });

    const final = fx.runStore[run.id];
    expect(final.status).toBe('completed');
    expect(final.stagesCompleted).toEqual(
      ['script', 'ppt', 'seo', 'thumbnail', 'promo', 'quiz', 'draw'],
    );
    expect(final.resumableFrom ?? null).toBeNull();
    expect(fx.script.generateScript).toHaveBeenCalledTimes(2); // per lesson
    expect(fx.ppt.generatePpt).toHaveBeenCalledTimes(2);
    expect(fx.seo.generateSeo).toHaveBeenCalledTimes(2);
    expect(fx.thumbnail.generateThumbnail).toHaveBeenCalledTimes(2);
    expect(fx.promo.generatePromo).toHaveBeenCalledTimes(2);
    expect(fx.quiz.generatePool).toHaveBeenCalledTimes(1);
    expect(fx.quiz.drawSaturdayQuiz).toHaveBeenCalledTimes(1);
    expect(fx.dlq.recordPipelineFailure).not.toHaveBeenCalled();
  });

  it('marks failed + sets resumableFrom + writes a DLQ row on stage error', async () => {
    const fx = makeFixtures();
    // PPT runs IN PARALLEL with seo/thumbnail/promo — only ppt fails;
    // the siblings still complete and the run halts before quiz/draw.
    fx.ppt.generatePpt.mockRejectedValueOnce(new Error('boom'));
    const run = await fx.service.enqueueRun('plan-1');
    await fx.service.runPipeline({ runId: run.id, planId: 'plan-1' });

    const final = fx.runStore[run.id];
    expect(final.status).toBe('failed');
    expect(final.resumableFrom).toBe<PipelineStage>('ppt');
    expect(new Set(final.stagesCompleted ?? [])).toEqual(
      new Set<PipelineStage>(['script', 'seo', 'thumbnail', 'promo']),
    );
    expect((final.stagesCompleted ?? []).includes('ppt' as PipelineStage)).toBe(false);
    expect(final.stagesFailed?.[0]?.stage).toBe<PipelineStage>('ppt');
    // Sibling stages within the failed phase still ran:
    expect(fx.seo.generateSeo).toHaveBeenCalledTimes(2);
    expect(fx.thumbnail.generateThumbnail).toHaveBeenCalledTimes(2);
    expect(fx.promo.generatePromo).toHaveBeenCalledTimes(2);
    // …but the next phase didn't:
    expect(fx.quiz.generatePool).not.toHaveBeenCalled();
    expect(fx.quiz.drawSaturdayQuiz).not.toHaveBeenCalled();

    expect(fx.dlq.recordPipelineFailure).toHaveBeenCalledTimes(1);
    expect(fx.dlq.recordPipelineFailure.mock.calls[0][0]).toMatchObject({
      planId: 'plan-1',
      runId: run.id,
      stage: 'ppt',
    });
  });

  it('resume-from-stage skips earlier agents entirely', async () => {
    const fx = makeFixtures();
    const run = await fx.service.enqueueRun('plan-1', 'quiz');
    await fx.service.runPipeline({
      runId: run.id, planId: 'plan-1', fromStage: 'quiz',
    });

    expect(fx.script.generateScript).not.toHaveBeenCalled();
    expect(fx.ppt.generatePpt).not.toHaveBeenCalled();
    expect(fx.seo.generateSeo).not.toHaveBeenCalled();
    expect(fx.thumbnail.generateThumbnail).not.toHaveBeenCalled();
    expect(fx.promo.generatePromo).not.toHaveBeenCalled();
    expect(fx.quiz.generatePool).toHaveBeenCalledTimes(1);
    expect(fx.quiz.drawSaturdayQuiz).toHaveBeenCalledTimes(1);
    expect(fx.runStore[run.id].status).toBe('completed');
    expect(fx.runStore[run.id].stagesCompleted).toEqual(
      ['script', 'ppt', 'seo', 'thumbnail', 'promo', 'quiz', 'draw'],
    );
  });
});
