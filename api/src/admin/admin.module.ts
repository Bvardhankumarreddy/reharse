import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from '../auth/admin.guard';
import { User } from '../users/user.entity';
import { Session } from '../sessions/session.entity';
import { UserFeedback } from '../user-feedback/user-feedback.entity';
import { Question } from '../questions/question.entity';
import { Feedback } from '../feedback/feedback.entity';
import { AdminNote } from './admin-note.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, UserFeedback, Question, Feedback, AdminNote]),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
