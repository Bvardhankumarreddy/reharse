import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import careersConfig from './config/careers.config';
import { User } from '../users/user.entity';
import { AdminModule } from '../admin/admin.module';
import { SystemModule } from '../system/system.module';

import { CareerCompany } from './entities/career-company.entity';
import { JobListing } from './entities/job-listing.entity';
import { JobMatch } from './entities/job-match.entity';

import { CareersOpenAIClientService } from './services/openai-client.service';
import { CareersAnthropicClientService } from './services/anthropic-client.service';
import { CareersEmbeddingService } from './services/embedding.service';
import { CareersIngestionService } from './services/ingestion.service';
import { CareersMatchingService } from './services/matching.service';

import { GreenhouseAdapter } from './sources/greenhouse.adapter';
import { LeverAdapter } from './sources/lever.adapter';
import { AshbyAdapter } from './sources/ashby.adapter';
import { AdzunaAdapter } from './sources/adzuna.adapter';

import {
  CareersIngestionWorker,
  CAREERS_INGESTION_QUEUE,
} from './workers/ingestion.worker';

import { CareersController } from './careers.controller';
import { CareersAdminController } from './careers-admin.controller';

/**
 * Careers — aggregates job openings (ATS public APIs: Greenhouse/Lever/Ashby
 * + the Adzuna aggregator, dormant until keys set), embeds them, and matches
 * them to each user's resume/profile with a Claude rerank. End-user /jobs tab.
 */
@Module({
  imports: [
    ConfigModule.forFeature(careersConfig),
    TypeOrmModule.forFeature([CareerCompany, JobListing, JobMatch, User]),
    BullModule.registerQueue({ name: CAREERS_INGESTION_QUEUE }),
    AdminModule,
    SystemModule,
  ],
  controllers: [CareersController, CareersAdminController],
  providers: [
    CareersOpenAIClientService,
    CareersAnthropicClientService,
    CareersEmbeddingService,
    CareersIngestionService,
    CareersMatchingService,
    GreenhouseAdapter,
    LeverAdapter,
    AshbyAdapter,
    AdzunaAdapter,
    CareersIngestionWorker,
  ],
})
export class CareersModule {}
