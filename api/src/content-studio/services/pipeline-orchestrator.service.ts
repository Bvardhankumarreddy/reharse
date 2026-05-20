import {
  Injectable, Logger, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import {
  PipelineRun, PipelineStage, PIPELINE_STAGES, StageFailure,
} from '../entities/pipeline-run.entity';
import { ScriptAgent } from '../agents/script.agent';
import { PptAgent } from '../agents/ppt.agent';
import { QuizAgent } from '../agents/quiz.agent';

export const CS_PIPELINE_QUEUE = 'content-studio-pipeline';

interface JobPayload {
  runId: string;
  planId: string;
  fromStage?: PipelineStage;
}

@Injectable()
export class PipelineOrchestratorService {
  private readonly logger = new Logger(PipelineOrchestratorService.name);

  constructor(
    @InjectRepository(PipelineRun) private readonly runRepo: Repository<PipelineRun>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectQueue(CS_PIPELINE_QUEUE) private readonly queue: Queue,
    private readonly script: ScriptAgent,
    private readonly ppt: PptAgent,
    private readonly quiz: QuizAgent,
  ) {}

  /** Enqueue a new (or resumed) pipeline run for a plan. */
  async enqueueRun(
    planId: string,
    fromStage?: PipelineStage,
  ): Promise<PipelineRun> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (fromStage && !PIPELINE_STAGES.includes(fromStage)) {
      throw new BadRequestException(
        `fromStage must be one of ${PIPELINE_STAGES.join(', ')}`,
      );
    }

    // Prevent two in-flight runs for the same plan.
    const active = await this.runRepo.findOne({
      where: [
        { planId, status: 'queued' },
        { planId, status: 'running' },
      ],
    });
    if (active) {
      throw new ConflictException(
        `A pipeline run is already in-flight for this plan (run ${active.id}, status ${active.status})`,
      );
    }

    const stagesCompleted = fromStage
      ? PIPELINE_STAGES.slice(0, PIPELINE_STAGES.indexOf(fromStage))
      : [];

    const run = await this.runRepo.save(
      this.runRepo.create({
        planId,
        status: 'queued',
        currentStage: null,
        stagesCompleted,
        stagesFailed: [],
        resumableFrom: null,
        costAtStart: Number(plan.totalCostUsd ?? 0),
        costDelta: 0,
      }),
    );

    await this.queue.add(
      'run',
      { runId: run.id, planId, fromStage } as JobPayload,
      { attempts: 1, removeOnComplete: 50, removeOnFail: 50 },
    );
    this.logger.log(
      `Enqueued pipeline run ${run.id} for plan ${planId}` +
      (fromStage ? ` (resume from ${fromStage})` : ''),
    );
    return run;
  }

  /** Called by the Bull worker — runs the pipeline synchronously. */
  async runPipeline(payload: JobPayload): Promise<void> {
    const run = await this.runRepo.findOne({ where: { id: payload.runId } });
    if (!run) {
      this.logger.warn(`Pipeline run ${payload.runId} vanished — aborting`);
      return;
    }

    const startIdx = payload.fromStage
      ? PIPELINE_STAGES.indexOf(payload.fromStage)
      : 0;
    if (startIdx < 0) {
      await this.markFailed(run, 'script', 'invalid fromStage');
      return;
    }

    await this.runRepo.update(run.id, {
      status: 'running',
      startedAt: new Date(),
    });

    const completed = [...(run.stagesCompleted ?? [])];

    for (let i = startIdx; i < PIPELINE_STAGES.length; i++) {
      const stage = PIPELINE_STAGES[i];
      await this.runRepo.update(run.id, { currentStage: stage });
      this.logger.log(`Run ${run.id} stage=${stage} starting…`);
      try {
        await this.runStage(stage, payload.planId);
        if (!completed.includes(stage)) completed.push(stage);
        await this.runRepo.update(run.id, { stagesCompleted: completed });
        this.logger.log(`Run ${run.id} stage=${stage} ✓`);
      } catch (e) {
        const msg = (e as Error).message;
        this.logger.error(`Run ${run.id} stage=${stage} failed: ${msg}`);
        await this.markFailed(run, stage, msg);
        return;
      }
    }

    const plan = await this.planRepo.findOne({ where: { id: payload.planId } });
    const finalCost = Number(plan?.totalCostUsd ?? 0);
    await this.runRepo.update(run.id, {
      status: 'completed',
      currentStage: null,
      resumableFrom: null,
      finishedAt: new Date(),
      costDelta: finalCost - Number(run.costAtStart ?? 0),
    });
    this.logger.log(
      `Run ${run.id} completed — cost delta $${(finalCost - Number(run.costAtStart ?? 0)).toFixed(4)}`,
    );
  }

  private async runStage(stage: PipelineStage, planId: string): Promise<void> {
    switch (stage) {
      case 'script': {
        const lessons = await this.lessonRepo.find({
          where: { planId },
          order: { lessonNumber: 'ASC' },
        });
        if (lessons.length === 0) throw new Error('Plan has no lessons');
        for (const l of lessons) await this.script.generateScript(l.id);
        return;
      }
      case 'ppt': {
        const lessons = await this.lessonRepo.find({
          where: { planId },
          order: { lessonNumber: 'ASC' },
        });
        for (const l of lessons) await this.ppt.generatePpt(l.id);
        return;
      }
      case 'quiz': {
        await this.quiz.generatePool(planId);
        return;
      }
      case 'draw': {
        await this.quiz.drawSaturdayQuiz(planId);
        return;
      }
    }
  }

  private async markFailed(
    run: PipelineRun,
    stage: PipelineStage,
    error: string,
  ): Promise<void> {
    const failed: StageFailure[] = [
      ...(run.stagesFailed ?? []),
      { stage, error: error.slice(0, 500), at: new Date().toISOString() },
    ];
    const plan = await this.planRepo.findOne({ where: { id: run.planId } });
    const finalCost = Number(plan?.totalCostUsd ?? 0);
    await this.runRepo.update(run.id, {
      stagesFailed: failed,
      resumableFrom: stage,
      status: 'failed',
      currentStage: null,
      finishedAt: new Date(),
      costDelta: finalCost - Number(run.costAtStart ?? 0),
    });
  }

  async listForPlan(planId: string, limit = 20): Promise<PipelineRun[]> {
    return this.runRepo.find({
      where: { planId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async get(runId: string): Promise<PipelineRun> {
    const r = await this.runRepo.findOne({ where: { id: runId } });
    if (!r) throw new NotFoundException('Pipeline run not found');
    return r;
  }

  /** Latest run for a plan (any status). */
  async latestForPlan(planId: string): Promise<PipelineRun | null> {
    return this.runRepo.findOne({
      where: { planId },
      order: { createdAt: 'DESC' },
    });
  }
}

