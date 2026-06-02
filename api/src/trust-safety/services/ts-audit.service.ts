import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TsAuditLog } from '../entities/ts-audit-log.entity';

@Injectable()
export class TsAuditService {
  private readonly logger = new Logger(TsAuditService.name);

  constructor(
    @InjectRepository(TsAuditLog) private readonly repo: Repository<TsAuditLog>,
  ) {}

  async log(opts: {
    action: string;
    actor?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    details?: Record<string, unknown> | null;
    ipAddress?: string | null;
  }): Promise<TsAuditLog | null> {
    try {
      return await this.repo.save(
        this.repo.create({
          action: opts.action,
          actor: opts.actor ?? null,
          targetType: opts.targetType ?? null,
          targetId: opts.targetId ?? null,
          details: opts.details ?? null,
          ipAddress: opts.ipAddress ?? null,
        }),
      );
    } catch (e) {
      // Audit failure must NEVER block a user action.
      this.logger.error(`ts-audit log failed: ${(e as Error).message}`);
      return null;
    }
  }
}
