import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditLog, AuditAction, AuditEntityType,
} from '../entities/audit-log.entity';

export interface AuditWriter {
  userId?: string | null;
  userEmail?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  async log(opts: {
    entityType: AuditEntityType;
    entityId?: string | null;
    action: AuditAction;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    summary?: string | null;
    writer?: AuditWriter;
  }): Promise<AuditLog> {
    return this.repo.save(
      this.repo.create({
        entityType: opts.entityType,
        entityId: opts.entityId ?? null,
        action: opts.action,
        before: opts.before ?? null,
        after: opts.after ?? null,
        summary: opts.summary ?? null,
        userId: opts.writer?.userId ?? null,
        userEmail: opts.writer?.userEmail ?? null,
      }),
    );
  }

  async list(opts: {
    entityType?: AuditEntityType;
    entityId?: string;
    limit?: number;
  } = {}): Promise<AuditLog[]> {
    const qb = this.repo.createQueryBuilder('a')
      .orderBy('a."createdAt"', 'DESC')
      .limit(Math.min(opts.limit ?? 50, 200));
    if (opts.entityType) qb.andWhere('a."entityType" = :t', { t: opts.entityType });
    if (opts.entityId)   qb.andWhere('a."entityId" = :i',   { i: opts.entityId });
    return qb.getMany();
  }
}
