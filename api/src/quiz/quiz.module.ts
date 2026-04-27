import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizPublicController, QuizAdminController } from './quiz.controller';
import { QuizService } from './quiz.service';
import {
  QuizQuestion,
  QuizSubmission,
  QuizSubmissionAnswer,
  QuizSession,
  QuizConfig,
} from './quiz.entities';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuizQuestion,
      QuizSubmission,
      QuizSubmissionAnswer,
      QuizSession,
      QuizConfig,
    ]),
    AdminModule, // for AdminGuard
  ],
  controllers: [QuizPublicController, QuizAdminController],
  providers: [QuizService],
})
export class QuizModule {}
