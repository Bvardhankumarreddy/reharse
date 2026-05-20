import { Processor, Process } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import {
  CS_PIPELINE_QUEUE, PipelineOrchestratorService,
} from '../services/pipeline-orchestrator.service';
import type { PipelineStage } from '../entities/pipeline-run.entity';

interface JobPayload {
  runId: string;
  planId: string;
  fromStage?: PipelineStage;
}

@Injectable()
@Processor(CS_PIPELINE_QUEUE)
export class PipelineWorker {
  private readonly logger = new Logger(PipelineWorker.name);

  constructor(private readonly orchestrator: PipelineOrchestratorService) {}

  @Process('run')
  async run(job: Job<JobPayload>): Promise<void> {
    this.logger.log(`Picked up pipeline job ${job.id} (run ${job.data.runId})`);
    await this.orchestrator.runPipeline(job.data);
  }
}
