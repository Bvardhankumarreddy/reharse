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
  PipelineRun, PipelineStage, PIPELINE_STAGES, PIPELINE_PHASES, StageFailure,
} from '../entities/pipeline-run.entity';
import { ScriptAgent } from '../agents/script.agent';
import { PptAgent } from '../agents/ppt.agent';
import { SeoAgent } from '../agents/seo.agent';
import { ThumbnailAgent } from '../agents/thumbnail.agent';
import { PromoAgent } from '../agents/promo.agent';
import { QuizAgent } from '../agents/quiz.agent';
import { DlqService } from './dlq.service';
import { NotificationService } from './notification.service';

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
    private readonly seo: SeoAgent,
    private readonly thumbnail: ThumbnailAgent,
    private readonly promo: PromoAgent,
    private readonly quiz: QuizAgent,
    private readonly dlq: DlqService,
    private readonly notify: NotificationService,
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

    // Curator gate: a human must approve the plan before the pipeline burns
    // cost across 7 stages.
    if (plan.approvalStatus !== 'approved') {
      throw new BadRequestException(
        `Plan is not approved (status: ${plan.approvalStatus}). ` +
        `Approve it before running the pipeline.`,
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

  /**
   * Called by the Bull worker — runs the pipeline synchronously.
   * Phase C: phases run in order; stages within a phase run in PARALLEL
   * via Promise.allSettled. If any stage in a phase fails the run halts
   * after the phase, with resumableFrom = first failed stage.
   */
  async runPipeline(payload: JobPayload): Promise<void> {
    const run = await this.runRepo.findOne({ where: { id: payload.runId } });
    if (!run) {
      this.logger.warn(`Pipeline run ${payload.runId} vanished — aborting`);
      return;
    }

    const startPhase = payload.fromStage
      ? PIPELINE_PHASES.findIndex((p) => p.includes(payload.fromStage!))
      : 0;
    if (startPhase < 0) {
      await this.markFailed(run, 'script', 'invalid fromStage');
      return;
    }

    await this.runRepo.update(run.id, {
      status: 'running',
      startedAt: new Date(),
    });

    const completed: PipelineStage[] = [...(run.stagesCompleted ?? [])];

    for (let i = startPhase; i < PIPELINE_PHASES.length; i++) {
      const phase = PIPELINE_PHASES[i];
      const todo = phase.filter((s) => !completed.includes(s));
      if (todo.length === 0) continue;

      // Visible "current stage" while the phase runs.
      await this.runRepo.update(run.id, { currentStage: todo[0] });

      if (todo.length === 1) {
        const stage = todo[0];
        this.logger.log(`Run ${run.id} stage=${stage} starting…`);
        try {
          await this.runStage(stage, payload.planId);
          completed.push(stage);
          await this.runRepo.update(run.id, { stagesCompleted: [...completed] });
          this.logger.log(`Run ${run.id} stage=${stage} ✓`);
        } catch (e) {
          await this.markFailed(run, stage, (e as Error).message);
          return;
        }
        continue;
      }

      this.logger.log(
        `Run ${run.id} phase ${i} [${todo.join(', ')}] starting in parallel…`,
      );
      const settled = await Promise.allSettled(
        todo.map((s) => this.runStage(s, payload.planId)),
      );
      const failures: Array<{ stage: PipelineStage; error: string }> = [];
      settled.forEach((r, idx) => {
        const stage = todo[idx];
        if (r.status === 'fulfilled') {
          completed.push(stage);
        } else {
          const msg = (r.reason as Error)?.message ?? 'unknown error';
          failures.push({ stage, error: msg });
        }
      });
      // Persist successful siblings even if some failed.
      await this.runRepo.update(run.id, { stagesCompleted: [...completed] });
      if (failures.length > 0) {
        const firstFail = todo.find((s) => failures.some((f) => f.stage === s))!;
        const summary = failures.map((f) => `${f.stage}: ${f.error}`).join(' | ');
        this.logger.error(
          `Run ${run.id} phase ${i} had ${failures.length} failure(s): ${summary}`,
        );
        await this.markFailed(run, firstFail, summary);
        return;
      }
      this.logger.log(`Run ${run.id} phase ${i} ✓ (${todo.length} parallel)`);
    }

    const plan = await this.planRepo.findOne({ where: { id: payload.planId } });
    const finalCost = Number(plan?.totalCostUsd ?? 0);
    const delta = finalCost - Number(run.costAtStart ?? 0);
    await this.runRepo.update(run.id, {
      status: 'completed',
      currentStage: null,
      resumableFrom: null,
      finishedAt: new Date(),
      costDelta: delta,
    });
    this.logger.log(`Run ${run.id} completed — cost delta $${delta.toFixed(4)}`);
    await this.notify.notify(
      `:white_check_mark: cs · pipeline run done · plan ${payload.planId.slice(0, 8)} · ` +
      `7 stages · +$${delta.toFixed(3)}`,
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
      case 'seo': {
        const lessons = await this.lessonRepo.find({
          where: { planId },
          order: { lessonNumber: 'ASC' },
        });
        for (const l of lessons) await this.seo.generateSeo(l.id);
        return;
      }
      case 'thumbnail': {
        const lessons = await this.lessonRepo.find({
          where: { planId },
          order: { lessonNumber: 'ASC' },
        });
        for (const l of lessons) await this.thumbnail.generateThumbnail(l.id);
        return;
      }
      case 'promo': {
        const lessons = await this.lessonRepo.find({
          where: { planId },
          order: { lessonNumber: 'ASC' },
        });
        for (const l of lessons) await this.promo.generatePromo(l.id);
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
    // Best-effort DLQ write so failures show up in the admin triage panel.
    try {
      await this.dlq.recordPipelineFailure(
        { runId: run.id, planId: run.planId, stage },
        error,
      );
    } catch (e) {
      this.logger.warn(`DLQ write failed: ${(e as Error).message}`);
    }
    await this.notify.notify(
      `:x: cs · pipeline FAILED · plan ${run.planId.slice(0, 8)} · stage \`${stage}\` · ` +
      `${error.slice(0, 200).replace(/\n/g, ' ')}`,
    );
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

  /**
   * Curator gate — approve or reject a plan. Only an 'approved' plan can run
   * the pipeline. Notifies Slack so the team has an audit trail.
   */
  async setApproval(
    planId: string,
    status: 'approved' | 'rejected',
    opts: { note?: string; userEmail?: string | null } = {},
  ): Promise<WeeklyContentPlan> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    await this.planRepo.update(planId, {
      approvalStatus: status,
      approvedBy: opts.userEmail ?? null,
      approvedAt: new Date(),
      approvalNote: opts.note?.slice(0, 2000) ?? null,
    });
    const icon = status === 'approved' ? ':white_check_mark:' : ':no_entry:';
    await this.notify.notify(
      `${icon} cs · plan ${planId.slice(0, 8)} ${status}` +
      (opts.userEmail ? ` by ${opts.userEmail}` : '') +
      (opts.note ? ` · "${opts.note.slice(0, 120)}"` : ''),
    );
    this.logger.log(`Plan ${planId} ${status}${opts.userEmail ? ` by ${opts.userEmail}` : ''}`);
    return (await this.planRepo.findOne({ where: { id: planId } }))!;
  }
}

