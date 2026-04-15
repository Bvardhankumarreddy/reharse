import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SessionsModule } from './sessions/sessions.module';
import { FeedbackModule } from './feedback/feedback.module';
import { QuestionsModule } from './questions/questions.module';
import { InterviewModule } from './interview/interview.module';
import { JobsModule } from './jobs/jobs.module';
import { CoachModule } from './coach/coach.module';
import { ToolsModule } from './tools/tools.module';
import { PairModule } from './pair/pair.module';
import { CalendarModule } from './calendar/calendar.module';
import { BillingModule } from './billing/billing.module';
import { UserFeedbackModule } from './user-feedback/user-feedback.module';
import { StorageModule } from './storage/storage.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({ isGlobal: true }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),

    // Redis / BullMQ
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get<string>('REDIS_URL'),
      }),
    }),

    // Feature modules
    AuthModule,
    UsersModule,
    SessionsModule,
    FeedbackModule,
    QuestionsModule,
    InterviewModule,
    JobsModule,
    CoachModule,
    ToolsModule,
    PairModule,
    CalendarModule,
    BillingModule,
    UserFeedbackModule,
    StorageModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
