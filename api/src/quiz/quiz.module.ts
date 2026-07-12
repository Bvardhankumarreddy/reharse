import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { QuizPublicController, QuizAdminController } from './quiz.controller';
import { QuizService } from './quiz.service';
import {
  QuizQuestion,
  QuizSubmission,
  QuizSubmissionAnswer,
  QuizSession,
  QuizConfig,
} from './quiz.entities';
import { QuizSubscriber } from './quiz-subscriber.entity';
import { QuizSubscriberService } from './quiz-subscriber.service';
import { QuizMailerService } from './quiz-mailer.service';
import { QuizResultsService } from './quiz-results.service';
import { QuizNotifierWorker, QUIZ_NOTIFIER_QUEUE } from './quiz-notifier.worker';
import { AdminModule } from '../admin/admin.module';
import { TrustSafetyModule } from '../trust-safety/trust-safety.module';
import { SystemModule } from '../system/system.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuizQuestion,
      QuizSubmission,
      QuizSubmissionAnswer,
      QuizSession,
      QuizConfig,
      QuizSubscriber,
    ]),
    BullModule.registerQueue({ name: QUIZ_NOTIFIER_QUEUE }),
    AdminModule, // for AdminGuard
    TrustSafetyModule, // FingerprintService + UniqueQuestionService
    SystemModule,
  ],
  controllers: [QuizPublicController, QuizAdminController],
  providers: [QuizService, QuizSubscriberService, QuizMailerService, QuizResultsService, QuizNotifierWorker],
})
export class QuizModule {}
