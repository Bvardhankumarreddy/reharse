import { Module } from '@nestjs/common';
import { CoachController } from './coach.controller';
import { UsersModule } from '../users/users.module';
import { FeedbackModule } from '../feedback/feedback.module';

@Module({
  imports: [UsersModule, FeedbackModule],
  controllers: [CoachController],
})
export class CoachModule {}
