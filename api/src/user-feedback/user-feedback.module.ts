import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserFeedback } from './user-feedback.entity';
import { AuthModule } from '../auth/auth.module';
import { UserFeedbackController } from './user-feedback.controller';
import { UserFeedbackService } from './user-feedback.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserFeedback]), AuthModule, ConfigModule],
  controllers: [UserFeedbackController],
  providers: [UserFeedbackService],
})
export class UserFeedbackModule {}
