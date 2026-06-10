import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { AdminModule } from '../admin/admin.module';
import { AI_PULSE_QUEUE } from './services/scheduler.service';

import { AiPulseNewsItem } from './entities/news-item.entity';
import { AiPulseScript } from './entities/news-script.entity';
import { AiPulseVerticalConfig } from './entities/vertical-config.entity';
import { AiPulseMetric } from './entities/metric.entity';
import { AiPulsePostmortem } from './entities/postmortem.entity';
import { AiPulseMemory } from './entities/memory.entity';

import { AiPulseIngestionService } from './services/source-ingestion.service';
import { AiPulseScoringService } from './services/scoring.service';
import { AiPulseScriptGeneratorService } from './services/script-generator.service';
import { AiPulseThumbnailService } from './services/thumbnail.service';
import { AiPulseDistributionService } from './services/distribution.service';
import { AiPulseSchedulerService } from './services/scheduler.service';
import { AiPulseMemoryService } from './services/memory.service';
import { AiPulseMetricsFetcherService } from './services/metrics-fetcher.service';
import { AiPulsePostmortemService } from './services/postmortem.service';
import { AiPulseImprovementService } from './services/improvement.service';

import { AiPulseIngestionController } from './controllers/ingestion.controller';
import { AiPulseApprovalController } from './controllers/approval.controller';

/**
 * AI Pulse — multi-vertical AI/tech news pipeline.
 * Verticals: ai_business, tech_industry, ai_science, ai_education, ai_society.
 *
 * Phased rollout: only tech_industry is ACTIVE at launch. Other 4 verticals
 * are scaffolded with enabled=false; admin can flip via the
 * /verticals/:vertical/enable endpoint.
 */
@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: AI_PULSE_QUEUE }),
    TypeOrmModule.forFeature([
      AiPulseNewsItem,
      AiPulseScript,
      AiPulseVerticalConfig,
      AiPulseMetric,
      AiPulsePostmortem,
      AiPulseMemory,
    ]),
    AdminModule,
  ],
  providers: [
    AiPulseIngestionService,
    AiPulseScoringService,
    AiPulseScriptGeneratorService,
    AiPulseThumbnailService,
    AiPulseDistributionService,
    AiPulseSchedulerService,
    AiPulseMemoryService,
    AiPulseMetricsFetcherService,
    AiPulsePostmortemService,
    AiPulseImprovementService,
  ],
  controllers: [
    AiPulseIngestionController,
    AiPulseApprovalController,
  ],
  exports: [
    AiPulseIngestionService,
    AiPulseScoringService,
    AiPulseScriptGeneratorService,
  ],
})
export class AiPulseModule {}
