import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { SocialAgentController, SocialAgentOAuthController } from './social-agent.controller';
import { SocialAgentService } from './social-agent.service';
import { LinkedInService } from './linkedin.service';
import { InstagramService } from './instagram.service';
import { SocialAgentEncryptionService } from './encryption.service';
import { SocialPublishProcessor, SOCIAL_PUBLISH_QUEUE } from './social-publish.processor';
import { SocialPost } from './social-post.entity';
import { SocialPlatformConnection } from './social-platform-connection.entity';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SocialPost, SocialPlatformConnection]),
    BullModule.registerQueue({ name: SOCIAL_PUBLISH_QUEUE }),
    AdminModule, // for AdminGuard
  ],
  controllers: [SocialAgentController, SocialAgentOAuthController],
  providers: [
    SocialAgentService,
    LinkedInService,
    InstagramService,
    SocialAgentEncryptionService,
    SocialPublishProcessor,
  ],
})
export class SocialAgentModule {}
