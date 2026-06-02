import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import trustSafetyConfig from './config/trust-safety.config';
import { AdminModule } from '../admin/admin.module';

import { SubmissionFingerprint } from './entities/submission-fingerprint.entity';
import { Blocklist } from './entities/blocklist.entity';
import { TsAuditLog } from './entities/ts-audit-log.entity';

import { GeolocationService } from './services/geolocation.service';
import { FingerprintService } from './services/fingerprint.service';
import { UniqueQuestionService } from './services/unique-question.service';
import { TsAuditService } from './services/ts-audit.service';

import { TrustSafetyAdminController } from './controllers/trust-safety-admin.controller';

/**
 * Trust & Safety phase 1 — quiz anti-cheating.
 *
 * Pure-additive: capture fingerprints + admin endpoints. The
 * UniqueQuestionService is wired into the quiz START flow from the
 * quiz module side (sees this module's services via DI).
 */
@Module({
  imports: [
    ConfigModule.forFeature(trustSafetyConfig),
    TypeOrmModule.forFeature([SubmissionFingerprint, Blocklist, TsAuditLog]),
    AdminModule,
  ],
  controllers: [TrustSafetyAdminController],
  providers: [
    GeolocationService,
    FingerprintService,
    UniqueQuestionService,
    TsAuditService,
  ],
  exports: [
    GeolocationService,
    FingerprintService,
    UniqueQuestionService,
    TsAuditService,
  ],
})
export class TrustSafetyModule {}
