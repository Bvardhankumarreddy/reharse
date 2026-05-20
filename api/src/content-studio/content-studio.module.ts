import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import contentStudioConfig from './config/content-studio.config';
import { AdminModule } from '../admin/admin.module';

import { Brand } from './entities/brand.entity';
import { Channel } from './entities/channel.entity';
import { WeeklyContentPlan } from './entities/weekly-content-plan.entity';
import { Lesson } from './entities/lesson.entity';
import { AgentRun } from './entities/agent-run.entity';
import { BrandMemory } from './entities/brand-memory.entity';
import { ContentAsset } from './entities/content-asset.entity';
import { QuestionPool } from './entities/question-pool.entity';
import { DeliveredQuiz } from './entities/delivered-quiz.entity';
import { PipelineRun } from './entities/pipeline-run.entity';
import { DeadLetterJob } from './entities/dead-letter-job.entity';
import { AuditLog } from './entities/audit-log.entity';
import { CompetitorChannel } from './entities/competitor-channel.entity';
import { CompetitorVideo } from './entities/competitor-video.entity';
import { LessonMetrics } from './entities/lesson-metrics.entity';
import { LessonPostmortem } from './entities/lesson-postmortem.entity';
import { PublishedVideo } from './entities/published-video.entity';

import { OpenAIAdapter } from './services/openai.adapter';
import { AnthropicAdapter } from './services/anthropic.adapter';
import { GeminiAdapter } from './services/gemini.adapter';
import { ModelRouterService } from './services/model-router.service';
import { BrandMemoryService } from './services/brand-memory.service';
import { GraderService } from './services/grader.service';
import { ImprovementLoopService } from './services/improvement-loop.service';
import { StrategyAgent } from './agents/strategy.agent';
import { ScriptAgent } from './agents/script.agent';
import { PptAgent } from './agents/ppt.agent';
import { SeoAgent } from './agents/seo.agent';
import { ThumbnailAgent } from './agents/thumbnail.agent';
import { PromoAgent } from './agents/promo.agent';
import { QuizAgent } from './agents/quiz.agent';
import { PostmortemAgent } from './agents/postmortem.agent';
import { ImprovementAgent } from './agents/improvement.agent';
import { ThumbnailImageAgent } from './agents/thumbnail-image.agent';
import { PptxRendererService } from './services/pptx-renderer.service';
import { XlsxRendererService } from './services/xlsx-renderer.service';
import {
  PipelineOrchestratorService, CS_PIPELINE_QUEUE,
} from './services/pipeline-orchestrator.service';
import { DlqService } from './services/dlq.service';
import { AuditService } from './services/audit.service';
import { ContentStudioStatsService } from './services/stats.service';
import { OpenAIEmbeddingService } from './services/openai-embedding.service';
import { YouTubeDataService } from './services/youtube-data.service';
import { CompetitorFetcherService } from './services/competitor-fetcher.service';
import { MetricsFetcherService } from './services/metrics-fetcher.service';
import { YouTubeOAuthService } from './services/youtube-oauth.service';
import { YouTubePublishService } from './services/youtube-publish.service';
import { YouTubeCommentService } from './services/youtube-comment.service';
import { SpamDetectionService } from './services/spam-detection.service';
import { CommentReplyAgent } from './agents/comment-reply.agent';
import { NotificationService } from './services/notification.service';
import {
  IntelligenceWorker, CS_INTELLIGENCE_QUEUE,
} from './workers/intelligence.worker';
import { PipelineWorker } from './workers/pipeline.worker';
import { ContentStudioController } from './content-studio.controller';

/**
 * Content Studio — multi-agent weekly content factory. Slice 1: Model Router
 * (OpenAI + Anthropic, cost-tracked, budget-guarded) + Strategy Agent that
 * plans a week (theme + 2 lessons). Later slices add Script/PPT/Quiz agents,
 * orchestrator + queue, Gemini, and file generators.
 */
@Module({
  imports: [
    ConfigModule.forFeature(contentStudioConfig),
    TypeOrmModule.forFeature([
      Brand, Channel, WeeklyContentPlan, Lesson, AgentRun, BrandMemory,
      ContentAsset, QuestionPool, DeliveredQuiz, PipelineRun, DeadLetterJob, AuditLog,
      CompetitorChannel, CompetitorVideo, LessonMetrics, LessonPostmortem,
      PublishedVideo,
    ]),
    BullModule.registerQueue(
      { name: CS_PIPELINE_QUEUE },
      { name: CS_INTELLIGENCE_QUEUE },
    ),
    AdminModule,
  ],
  controllers: [ContentStudioController],
  providers: [
    OpenAIAdapter,
    AnthropicAdapter,
    GeminiAdapter,
    ModelRouterService,
    BrandMemoryService,
    GraderService,
    ImprovementLoopService,
    PptxRendererService,
    XlsxRendererService,
    StrategyAgent,
    ScriptAgent,
    PptAgent,
    SeoAgent,
    ThumbnailAgent,
    PromoAgent,
    QuizAgent,
    PostmortemAgent,
    ImprovementAgent,
    ThumbnailImageAgent,
    PipelineOrchestratorService,
    DlqService,
    AuditService,
    ContentStudioStatsService,
    OpenAIEmbeddingService,
    YouTubeDataService,
    CompetitorFetcherService,
    MetricsFetcherService,
    YouTubeOAuthService,
    YouTubePublishService,
    YouTubeCommentService,
    SpamDetectionService,
    NotificationService,
    CommentReplyAgent,
    PipelineWorker,
    IntelligenceWorker,
  ],
})
export class ContentStudioModule {}
