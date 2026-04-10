import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { FeedbackProcessor } from './feedback.processor';
import { DigestProcessor }   from './digest.processor';
import { JobsService }       from './jobs.service';
import { QUEUES, EVALUATE_JOB_OPTIONS } from './queue.constants';
import { FeedbackModule }    from '../feedback/feedback.module';
import { InterviewModule }   from '../interview/interview.module';
import { UsersModule }       from '../users/users.module';
import { User }              from '../users/user.entity';
import { Session }           from '../sessions/session.entity';

@Module({
  imports: [
    // ── Queue registrations ──────────────────────────────────────────────────
    BullModule.registerQueue(
      {
        name: QUEUES.FEEDBACK,
        defaultJobOptions: EVALUATE_JOB_OPTIONS,
      },
      {
        name: QUEUES.DIGEST,
        // Weekly digest fan-out: every Monday at 08:00 UTC
        // Bull's repeatable job is registered via the processor at startup
      },
    ),

    // ── Feature modules ──────────────────────────────────────────────────────
    FeedbackModule,
    InterviewModule,
    UsersModule,

    // ── Entity access for DigestProcessor ───────────────────────────────────
    TypeOrmModule.forFeature([User, Session]),
  ],
  providers: [
    FeedbackProcessor,
    DigestProcessor,
    JobsService,
  ],
  exports: [
    JobsService,
    BullModule,   // so importing modules can @InjectQueue if needed
  ],
})
export class JobsModule {}
