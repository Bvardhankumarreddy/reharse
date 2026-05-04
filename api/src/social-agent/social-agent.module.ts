import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialAgentController } from './social-agent.controller';
import { SocialAgentService } from './social-agent.service';
import { SocialPost } from './social-post.entity';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SocialPost]),
    AdminModule, // for AdminGuard
  ],
  controllers: [SocialAgentController],
  providers: [SocialAgentService],
})
export class SocialAgentModule {}
