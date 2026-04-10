import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { InterviewGateway } from './interview.gateway';
import { InterviewStateService } from './interview-state.service';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersModule } from '../users/users.module';
import { QuestionsModule } from '../questions/questions.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { QUEUES, EVALUATE_JOB_OPTIONS } from '../jobs/queue.constants';

@Module({
  imports: [
    SessionsModule,
    UsersModule,
    QuestionsModule,
    FeedbackModule,
    // Register queue here to avoid circular dependency: JobsModule → InterviewModule → JobsModule
    BullModule.registerQueue({
      name: QUEUES.FEEDBACK,
      defaultJobOptions: EVALUATE_JOB_OPTIONS,
    }),
  ],
  providers: [InterviewGateway, InterviewStateService],
  exports: [InterviewGateway, InterviewStateService],
})
export class InterviewModule {}
