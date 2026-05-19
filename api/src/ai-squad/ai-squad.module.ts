import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import aiSquadConfig from './config/ai-squad.config';
import { Theme } from './entities/theme.entity';
import { Topic } from './entities/topic.entity';
import { Episode } from './entities/episode.entity';
import { DialogueSegment } from './entities/dialogue-segment.entity';
import { EpisodeAsset } from './entities/episode-asset.entity';
import { LanguageVersion } from './entities/language-version.entity';
import { AdminModule } from '../admin/admin.module';

import { AnthropicClientService } from './services/anthropic-client.service';
import { ThemeGeneratorService } from './services/theme-generator.service';
import { TopicGeneratorService } from './services/topic-generator.service';
import { DialogueGeneratorService } from './services/dialogue-generator.service';
import { TranslationService } from './services/translation.service';
import { HeyGenSquadService } from './services/heygen-squad.service';
import { ThumbnailPromptService } from './services/thumbnail-prompt.service';
import { DistributionService } from './services/distribution.service';

import { ThemesController } from './controllers/themes.controller';
import { TopicsController } from './controllers/topics.controller';
import { EpisodesController } from './controllers/episodes.controller';
import { WebhooksController } from './controllers/webhooks.controller';

/**
 * "The AI Squad" — 4-character dialogue videos. 3-stage Claude pipeline:
 * themes → topics → dramatic dialogue. HeyGen multi-avatar is built but
 * dormant until HEYGEN_API_KEY + the 5 avatar/voice IDs are set.
 */
@Module({
  imports: [
    ConfigModule.forFeature(aiSquadConfig),
    TypeOrmModule.forFeature([
      Theme, Topic, Episode, DialogueSegment, EpisodeAsset, LanguageVersion,
    ]),
    AdminModule,
  ],
  controllers: [
    ThemesController,
    TopicsController,
    EpisodesController,
    WebhooksController,
  ],
  providers: [
    AnthropicClientService,
    ThemeGeneratorService,
    TopicGeneratorService,
    DialogueGeneratorService,
    TranslationService,
    HeyGenSquadService,
    ThumbnailPromptService,
    DistributionService,
  ],
})
export class AiSquadModule {}
