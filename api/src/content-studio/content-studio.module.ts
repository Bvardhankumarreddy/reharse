import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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

import { OpenAIAdapter } from './services/openai.adapter';
import { AnthropicAdapter } from './services/anthropic.adapter';
import { GeminiAdapter } from './services/gemini.adapter';
import { ModelRouterService } from './services/model-router.service';
import { StrategyAgent } from './agents/strategy.agent';
import { ScriptAgent } from './agents/script.agent';
import { PptAgent } from './agents/ppt.agent';
import { QuizAgent } from './agents/quiz.agent';
import { PptxRendererService } from './services/pptx-renderer.service';
import { XlsxRendererService } from './services/xlsx-renderer.service';
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
      ContentAsset, QuestionPool, DeliveredQuiz,
    ]),
    AdminModule,
  ],
  controllers: [ContentStudioController],
  providers: [
    OpenAIAdapter,
    AnthropicAdapter,
    GeminiAdapter,
    ModelRouterService,
    PptxRendererService,
    XlsxRendererService,
    StrategyAgent,
    ScriptAgent,
    PptAgent,
    QuizAgent,
  ],
})
export class ContentStudioModule {}
