import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeadLetterJob, DlqStatus, PipelineFailurePayload,
} from '../entities/dead-letter-job.entity';
import type { PipelineStage } from '../entities/pipeline-run.entity';

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @InjectRepository(DeadLetterJob)
    private readonly dlqRepo: Repository<DeadLetterJob>,
  ) {}

  /** Called by the orchestrator on every terminal pipeline-stage failure. */
  async recordPipelineFailure(
    payload: PipelineFailurePayload,
    error: string,
  ): Promise<DeadLetterJob> {
    const job = await this.dlqRepo.save(
      this.dlqRepo.create({
        jobType: 'pipeline-stage-failure',
        payload,
        error: error.slice(0, 1000),
        attempts: 1,
        status: 'pending',
      }),
    );
    this.logger.warn(
      `DLQ ${job.id} — pipeline run ${payload.runId} failed at stage ${payload.stage}`,
    );
    return job;
  }

  async list(status?: DlqStatus): Promise<DeadLetterJob[]> {
    return this.dlqRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async get(id: string): Promise<DeadLetterJob> {
    const j = await this.dlqRepo.findOne({ where: { id } });
    if (!j) throw new NotFoundException('DLQ job not found');
    return j;
  }

  /** Mark the row as retried — the caller actually enqueues the new run. */
  async markRetried(id: string): Promise<DeadLetterJob> {
    const row = await this.get(id);
    await this.dlqRepo.update(id, {
      status: 'retried',
      attempts: row.attempts + 1,
    });
    return this.get(id);
  }

  async abandon(id: string): Promise<DeadLetterJob> {
    await this.get(id); // 404 if missing
    await this.dlqRepo.update(id, { status: 'abandoned' });
    return this.get(id);
  }

  /** Convenience: pull the planId + stage off a pipeline-failure DLQ row. */
  pipelineCoordsFor(job: DeadLetterJob): {
    planId: string; stage: PipelineStage;
  } | null {
    const p = job.payload as Partial<PipelineFailurePayload>;
    if (job.jobType !== 'pipeline-stage-failure' || !p.planId || !p.stage) return null;
    return { planId: p.planId, stage: p.stage };
  }
}
