import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { SocialAgentController, SocialAgentOAuthController } from './social-agent.controller';
import { SocialAgentService } from './social-agent.service';
import { LinkedInService } from './linkedin.service';
import { InstagramService } from './instagram.service';
import { YouTubeService } from './youtube.service';
import { SocialAgentEncryptionService } from './encryption.service';
import { SocialPublishProcessor, SOCIAL_PUBLISH_QUEUE } from './social-publish.processor';
import { EngagementSyncProcessor, ENGAGEMENT_SYNC_QUEUE } from './engagement-sync.processor';
import { InsightsProcessor, INSIGHTS_QUEUE } from './insights.processor';
import { AudienceSyncProcessor, AUDIENCE_SYNC_QUEUE } from './audience-sync.processor';
import { CompetitorService } from './competitor.service';
import { ReportExportService } from './report-export.service';
import { AnalyticsService } from './analytics.service';
import { SocialPost } from './social-post.entity';
import { SocialPlatformConnection } from './social-platform-connection.entity';
import { PostEngagement } from './post-engagement.entity';
import { SocialInsight } from './social-insight.entity';
import { AudienceSnapshot } from './audience-snapshot.entity';
import { CompetitorChannel, CompetitorNote } from './competitor.entity';
import { AdminModule } from '../admin/admin.module';
import { SystemModule } from '../system/system.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SocialPost,
      SocialPlatformConnection,
      PostEngagement,
      SocialInsight,
      AudienceSnapshot,
      CompetitorChannel,
      CompetitorNote,
    ]),
    BullModule.registerQueue(
      { name: SOCIAL_PUBLISH_QUEUE },
      { name: ENGAGEMENT_SYNC_QUEUE },
      { name: INSIGHTS_QUEUE },
      { name: AUDIENCE_SYNC_QUEUE },
    ),
    AdminModule,
    SystemModule,
  ],
  controllers: [SocialAgentController, SocialAgentOAuthController],
  providers: [
    SocialAgentService,
    LinkedInService,
    InstagramService,
    YouTubeService,
    SocialAgentEncryptionService,
    SocialPublishProcessor,
    EngagementSyncProcessor,
    InsightsProcessor,
    AudienceSyncProcessor,
    CompetitorService,
    ReportExportService,
    AnalyticsService,
  ],
})
export class SocialAgentModule {}
