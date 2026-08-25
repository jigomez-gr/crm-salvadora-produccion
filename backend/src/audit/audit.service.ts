import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../common/entities/audit-log.entity';
import { AUDIT_EVENT, AuditRecord } from './audit.types';

export interface AuditQuery {
  limit: number;
  offset: number;
  action?: string;
  actorId?: string;
}

export interface AuditPage {
  items: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Persists the audit trail and serves it (read-only) to admins. Writes happen
 * via the `AUDIT_EVENT` bus so producers never depend on this module; a failed
 * write is logged but never breaks the originating request (audit is
 * best-effort, not transactional with the action it records).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  @OnEvent(AUDIT_EVENT, { async: true })
  async handle(record: AuditRecord): Promise<void> {
    try {
      await this.record(record);
    } catch (err) {
      // Never let an audit failure surface to the user / crash the emitter.
      this.logger.error(
        `Failed to persist audit '${record?.action}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Direct write (used by the event handler; also callable in-process). */
  async record(record: AuditRecord): Promise<void> {
    const row = this.repo.create({
      actorId: record.actor?.id ?? null,
      actorEmail: record.actor?.email ?? null,
      action: record.action,
      summary: record.summary,
      targetType: record.targetType ?? null,
      targetId: record.targetId ?? null,
      ip: record.ip ?? null,
      metadata: record.metadata ?? null,
    });
    await this.repo.save(row);
  }

  async list(query: AuditQuery): Promise<AuditPage> {
    const where: Record<string, unknown> = {};
    if (query.action) where.action = query.action;
    if (query.actorId) where.actorId = query.actorId;

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });
    return { items, total, limit: query.limit, offset: query.offset };
  }
}
