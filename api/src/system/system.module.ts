import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SystemSetting } from './entities/system-setting.entity';
import { CronGateService } from './services/cron-gate.service';
import { SystemController } from './controllers/system.controller';

/**
 * Shared "system" module — currently exposes CronGateService for
 * cross-module use. Every module that registers a Bull repeatable
 * imports SystemModule and injects CronGateService into its worker.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SystemSetting]),
    AuthModule,
  ],
  providers: [CronGateService],
  controllers: [SystemController],
  exports: [CronGateService],
})
export class SystemModule {}
