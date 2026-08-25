import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Appointment } from '../common/entities/appointment.entity';
import { Contact } from '../common/entities/contact.entity';
import { Message } from '../common/entities/message.entity';
import { PipelineStage } from '../contacts/pipeline';
import {
  ApptStatus,
  ContactsByStatus,
  MsgDirection,
  PipelineStageCounts,
  PreviousTotals,
  ReportSummary,
  SourceRow,
  buildReportSummary,
  computeTrends,
} from './report-aggregation';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;

/**
 * Read-only analytics over the EXISTING appointment/contact/message rows — no new
 * tables. Fetches the rows in range (bounded queries) and hands them to the pure
 * `buildReportSummary`, which does all the business-timezone bucketing.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Message)
    private readonly messagesRepo: Repository<Message>,
  ) {}

  async summary(fromStr?: string, toStr?: string): Promise<ReportSummary> {
    const timezone = process.env.BUSINESS_TIMEZONE || 'Europe/Madrid';
    const to = toStr ? new Date(toStr) : new Date();
    const from = fromStr
      ? new Date(fromStr)
      : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

    // The immediately-preceding window of equal length, for trend deltas. Its
    // end is `from - 1ms` (exclusive of `from`) so a row exactly on the boundary
    // isn't counted in both the current and previous windows.
    const windowMs = Math.max(to.getTime() - from.getTime(), DAY_MS);
    const prevFrom = new Date(from.getTime() - windowMs);
    const prevTo = new Date(from.getTime() - 1);

    const [
      appointments,
      messages,
      newContacts,
      statusRows,
      pipelineRows,
      sources,
      prevApptRows,
      prevNewContacts,
    ] = await Promise.all([
      this.appointmentsRepo.find({
        where: { startsAt: Between(from, to) },
        select: ['startsAt', 'status', 'service', 'price'],
      }),
      this.messagesRepo.find({
        where: { createdAt: Between(from, to) },
        select: ['createdAt', 'direction'],
      }),
      this.contactsRepo.find({
        where: { createdAt: Between(from, to) },
        select: ['createdAt'],
      }),
      // Contacts-by-status is a snapshot (not range-bound) → one grouped query.
      this.contactsRepo
        .createQueryBuilder('c')
        .select('c.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('c.status')
        .getRawMany<{ status: string; count: string }>(),
      // Pipeline funnel snapshot (also not range-bound).
      this.contactsRepo
        .createQueryBuilder('c')
        .select('c.pipelineStage', 'stage')
        .addSelect('COUNT(*)', 'count')
        .groupBy('c.pipelineStage')
        .getRawMany<{ stage: string; count: string }>(),
      // Source attribution snapshot: contacts per source + how many converted.
      this.contactsRepo
        .createQueryBuilder('c')
        .select('c.source', 'source')
        .addSelect('COUNT(*)', 'total')
        .addSelect(
          `COUNT(*) FILTER (WHERE c."pipelineStage" IN (:...convertedStages))`,
          'converted',
        )
        .setParameter('convertedStages', [
          PipelineStage.BOOKED,
          PipelineStage.WON,
        ])
        .groupBy('c.source')
        .getRawMany<{ source: string | null; total: string; converted: string }>(),
      // Previous-window appointment statuses (for the appointment/rate trends).
      this.appointmentsRepo.find({
        where: { startsAt: Between(prevFrom, prevTo) },
        select: ['status'],
      }),
      this.contactsRepo.count({
        where: { createdAt: Between(prevFrom, prevTo) },
      }),
    ]);

    const contactsByStatus: ContactsByStatus = { lead: 0, active: 0, inactive: 0 };
    for (const row of statusRows) {
      if (row.status in contactsByStatus) {
        contactsByStatus[row.status as keyof ContactsByStatus] = Number(row.count);
      }
    }

    const pipelineStageCounts: PipelineStageCounts = {
      new: 0,
      contacted: 0,
      qualified: 0,
      booked: 0,
      won: 0,
      lost: 0,
    };
    for (const row of pipelineRows) {
      if (row.stage in pipelineStageCounts) {
        pipelineStageCounts[row.stage as keyof PipelineStageCounts] = Number(
          row.count,
        );
      }
    }

    const sourceRows: SourceRow[] = sources.map((r) => ({
      source: r.source,
      total: Number(r.total),
      converted: Number(r.converted),
    }));

    const summary = buildReportSummary(
      {
        appointments: appointments.map((a) => ({
          startsAt: a.startsAt,
          status: a.status as ApptStatus,
          service: a.service,
          price: a.price,
        })),
        messages: messages.map((m) => ({
          createdAt: m.createdAt,
          direction: m.direction as MsgDirection,
        })),
        newContacts: newContacts.map((c) => ({ createdAt: c.createdAt })),
        contactsByStatus,
        pipelineStageCounts,
        sources: sourceRows,
      },
      from,
      to,
      timezone,
    );

    const previous: PreviousTotals = {
      appointments: prevApptRows.reduce(
        (acc, r) => {
          acc.total++;
          if (r.status === 'completed') acc.completed++;
          if (r.status === 'cancelled') acc.cancelled++;
          return acc;
        },
        { total: 0, completed: 0, cancelled: 0 },
      ),
      newContacts: prevNewContacts,
    };
    summary.trends = computeTrends(summary, previous);

    return summary;
  }
}
