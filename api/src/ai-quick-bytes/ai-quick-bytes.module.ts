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
import { AqbShortMetric } from './entities/short-metric.entity';
import { AqbShortPostmortem } from './entities/short-postmortem.entity';
import { AqbMemory } from './entities/aqb-memory.entity';
import { AdminModule } from '../admin/admin.module';

import { OpenAIClientService } from './services/openai-client.service';
import { AnthropicClientService } from './services/anthropic-client.service';
import { DedupService } from './services/dedup.service';
import { IngestionService } from './services/ingestion.service';
import { ScoringService } from './services/scoring.service';
import { ScriptGeneratorService } from './services/script-generator.service';
import { TranslationService } from './services/translation.service';
import { ThumbnailPromptService } from './services/thumbnail-prompt.service';
import { DistributionPackageService } from './services/distribution-package.service';
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
import {
  AqbIntelligenceWorker, AQB_INTELLIGENCE_QUEUE,
} from './workers/aqb-intelligence.worker';
import { AqbMemoryService } from './services/aqb-memory.service';
import { AqbMetricsFetcherService } from './services/aqb-metrics-fetcher.service';
import { AqbPostmortemAgent } from './agents/aqb-postmortem.agent';
import { AqbImprovementAgent } from './agents/aqb-improvement.agent';

import { NewsController } from './controllers/news.controller';
import { ScriptsController } from './controllers/scripts.controller';
import { ApprovalController } from './controllers/approval.controller';
import { WebhooksController } from './controllers/webhooks.controller';
import { AqbIntelligenceController } from './controllers/intelligence.controller';

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
      AqbShortMetric, AqbShortPostmortem, AqbMemory,
    ]),
    BullModule.registerQueue(
      { name: AQB_INGESTION_QUEUE },
      { name: AQB_SCORING_QUEUE },
      { name: AQB_SCRIPT_GEN_QUEUE },
      { name: AQB_INTELLIGENCE_QUEUE },
    ),
    AdminModule,
  ],
  controllers: [
    NewsController,
    ScriptsController,
    ApprovalController,
    WebhooksController,
    AqbIntelligenceController,
  ],
  providers: [
    OpenAIClientService,
    AnthropicClientService,
    DedupService,
    IngestionService,
    ScoringService,
    ScriptGeneratorService,
    TranslationService,
    ThumbnailPromptService,
    DistributionPackageService,
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
    // Learning loop (additive — no behaviour change until memories exist)
    AqbMemoryService,
    AqbMetricsFetcherService,
    AqbPostmortemAgent,
    AqbImprovementAgent,
    // Workers
    IngestionWorker,
    ScoringWorker,
    ScriptGenWorker,
    AqbIntelligenceWorker,
  ],
})
export class AiQuickBytesModule {}
