import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import aiQuickBytesConfig from './config/ai-quick-bytes.config';
import { NewsSource } from './entities/news-source.entity';
import { NewsItem } from './entities/news-item.entity';
import { NewsScore } from './entities/news-score.entity';
import { ShortScript } from './entities/short-script.entity';
import { PublishingLog } from './entities/publishing-log.entity';
import { AdminModule } from '../admin/admin.module';

import { OpenAIClientService } from './services/openai-client.service';
import { DedupService } from './services/dedup.service';
import { IngestionService } from './services/ingestion.service';
import { ScoringService } from './services/scoring.service';
import { ScriptGeneratorService } from './services/script-generator.service';
import { HeyGenService } from './services/heygen.service';
import { PublishingService } from './services/publishing.service';

import { OpenAIBlogAdapter } from './sources/openai-blog.adapter';
import { GoogleAIAdapter } from './sources/google-ai.adapter';
import { TheBatchAdapter } from './sources/the-batch.adapter';
import { TechCrunchAIAdapter } from './sources/techcrunch-ai.adapter';
import { VentureBeatAIAdapter } from './sources/venturebeat-ai.adapter';
import { AnthropicNewsAdapter } from './sources/anthropic.adapter';
import { ArxivAdapter } from './sources/arxiv.adapter';
import { HackerNewsAdapter } from './sources/hackernews.adapter';

import { IngestionWorker, AQB_INGESTION_QUEUE } from './workers/ingestion.worker';
import { ScoringWorker, AQB_SCORING_QUEUE } from './workers/scoring.worker';
import { ScriptGenWorker, AQB_SCRIPT_GEN_QUEUE } from './workers/script-gen.worker';

import { NewsController } from './controllers/news.controller';
import { ScriptsController } from './controllers/scripts.controller';
import { ApprovalController } from './controllers/approval.controller';
import { WebhooksController } from './controllers/webhooks.controller';

/**
 * AI Quick Bytes — fetches AI news from 8 sources, dedups, LLM-scores,
 * generates YouTube Shorts scripts, sends to HeyGen, tracks publishing.
 * Manual approval gate — no auto-publish.
 */
@Module({
  imports: [
    ConfigModule.forFeature(aiQuickBytesConfig),
    TypeOrmModule.forFeature([
      NewsSource, NewsItem, NewsScore, ShortScript, PublishingLog,
    ]),
    BullModule.registerQueue(
      { name: AQB_INGESTION_QUEUE },
      { name: AQB_SCORING_QUEUE },
      { name: AQB_SCRIPT_GEN_QUEUE },
    ),
    AdminModule,
  ],
  controllers: [
    NewsController,
    ScriptsController,
    ApprovalController,
    WebhooksController,
  ],
  providers: [
    OpenAIClientService,
    DedupService,
    IngestionService,
    ScoringService,
    ScriptGeneratorService,
    HeyGenService,
    PublishingService,
    // Source adapters
    OpenAIBlogAdapter,
    GoogleAIAdapter,
    TheBatchAdapter,
    TechCrunchAIAdapter,
    VentureBeatAIAdapter,
    AnthropicNewsAdapter,
    ArxivAdapter,
    HackerNewsAdapter,
    // Workers
    IngestionWorker,
    ScoringWorker,
    ScriptGenWorker,
  ],
})
export class AiQuickBytesModule {}
