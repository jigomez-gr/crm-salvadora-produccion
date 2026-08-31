import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Contact, ContactStatus } from '../common/entities/contact.entity';
import {
  Appointment,
  AppointmentStatus,
} from '../common/entities/appointment.entity';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import { normalizePhoneStrict, normalizePhoneLoose } from '../common/phone';
import { parseCsv, toCsv } from './csv';
import {
  PipelineStage,
  PIPELINE_STAGES,
  nextStageOnBooking,
} from './pipeline';

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export interface ContactsQuery {
  limit: number;
  offset: number;
  search?: string;
  status?: ContactStatus;
}

export interface ContactPage {
  items: Contact[];
  total: number;
  limit: number;
  offset: number;
}

/** A contact enriched with its next upcoming appointment, for a board card. */
export interface BoardCard extends Contact {
  nextAppointment: { service: string; startsAt: Date } | null;
}

export interface BoardColumn {
  stage: PipelineStage;
  total: number;
  items: BoardCard[];
}

export interface BoardData {
  stages: BoardColumn[];
}

// Cards shown per column on the board. The count is always the real total; only
// the rendered cards are capped (per-column pagination is a documented phase-2).
const BOARD_STAGE_LIMIT = 200;

// Even integer spacing between cards in a column. A reorder renumbers the whole
// column to `(len - index) * STEP`, so positions are always distinct integers
// (no float-midpoint exhaustion) and the top card has the highest value.
const BOARD_POSITION_STEP = 1024;

// CSV header aliases (lower-cased, accent-stripped) → canonical field.
const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  nombre: 'name',
  phone: 'phone',
  telefono: 'phone',
  movil: 'phone',
  whatsapp: 'phone',
  email: 'email',
  correo: 'email',
  'e-mail': 'email',
  status: 'status',
  estado: 'status',
  tags: 'tags',
  etiquetas: 'tags',
  source: 'source',
  origen: 'source',
  fuente: 'source',
  notes: 'notes',
  notas: 'notes',
  observaciones: 'notes',
};

const EXPORT_COLUMNS = [
  'name',
  'phone',
  'email',
  'status',
  'tags',
  'source',
  'notes',
] as const;

function deburrLower(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .trim()
    .toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Tell interested listeners (the SSE stream) that a contact changed, so the
   * pipeline board and contacts list refresh live. PII-free: only the id + stage.
   */
  private emitUpdated(contact: Contact): void {
    this.events.emit('contact.updated', {
      id: contact.id,
      pipelineStage: contact.pipelineStage,
    });
  }

  findAll(): Promise<Contact[]> {
    return this.contactsRepo.find({ order: { createdAt: 'DESC' } });
  }

  // ─── Pipeline board (Kanban) ───

  /**
   * The full pipeline board: every contact grouped by its funnel stage, ordered
   * within a column by `boardPosition` (DESC = top), each card enriched with its
   * next upcoming appointment. One query for contacts + one for next
   * appointments (no N+1). Counts are exact; rendered cards are capped per column.
   */
  async board(): Promise<BoardData> {
    // `createdAt`/`id` are a fully deterministic tiebreaker so cards with an equal
    // boardPosition (e.g. a bulk CSV import) never reshuffle between refetches.
    const contacts = await this.contactsRepo.find({
      order: { boardPosition: 'DESC', createdAt: 'DESC', id: 'ASC' },
    });

    const nextByContact = await this.nextAppointmentsFor(
      contacts.map((c) => c.id),
    );

    const stages: BoardColumn[] = PIPELINE_STAGES.map((stage) => {
      const inStage = contacts.filter((c) => c.pipelineStage === stage);
      const items: BoardCard[] = inStage
        .slice(0, BOARD_STAGE_LIMIT)
        .map((c) => ({
          ...c,
          nextAppointment: nextByContact.get(c.id) ?? null,
        }));
      return { stage, total: inStage.length, items };
    });

    return { stages };
  }

  /**
   * Move/reorder a pipeline column: set every listed contact to `stage` and
   * renumber them to evenly-spaced integer positions in the given order (top =
   * first). This replaces client-side float midpoints entirely — positions are
   * always distinct integers, so ordering is exact and can't degrade. Runs in one
   * transaction; unknown ids are ignored. Emits a single `contact.updated`.
   */
  async reorderStage(stage: PipelineStage, orderedIds: string[]): Promise<void> {
    if (orderedIds.length === 0) return;
    await this.contactsRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(Contact);
      const rows = await repo.findBy({ id: In(orderedIds) });
      const byId = new Map(rows.map((c) => [c.id, c]));
      const len = orderedIds.length;
      const toSave: Contact[] = [];
      orderedIds.forEach((id, index) => {
        const c = byId.get(id);
        if (!c) return;
        c.pipelineStage = stage;
        c.boardPosition = (len - index) * BOARD_POSITION_STEP;
        toSave.push(c);
      });
      if (toSave.length) await repo.save(toSave);
    });
    // One coalesced signal — the board refetches (positions are already applied).
    this.events.emit('contact.updated', { stage, reordered: true });
  }

  /** Map of contactId → its earliest future scheduled appointment (or absent). */
  private async nextAppointmentsFor(
    contactIds: string[],
  ): Promise<Map<string, { service: string; startsAt: Date }>> {
    const result = new Map<string, { service: string; startsAt: Date }>();
    if (contactIds.length === 0) return result;

    // DISTINCT ON (contactId) with an ascending startsAt gives the soonest
    // upcoming appointment per contact in a single query.
    const rows = await this.appointmentsRepo
      .createQueryBuilder('a')
      .select(['a.contactId', 'a.service', 'a.startsAt'])
      .distinctOn(['a.contactId'])
      .where('a.contactId IN (:...ids)', { ids: contactIds })
      .andWhere('a.status = :scheduled', {
        scheduled: AppointmentStatus.SCHEDULED,
      })
      .andWhere('a.startsAt >= :now', { now: new Date() })
      .orderBy('a.contactId')
      .addOrderBy('a.startsAt', 'ASC')
      .getMany();

    for (const a of rows) {
      result.set(a.contactId, { service: a.service, startsAt: a.startsAt });
    }
    return result;
  }

  /**
   * When an appointment is booked (manually or by the AI agent — both go through
   * AppointmentsService.create → 'appointment.created'), advance the contact's
   * pipeline stage to "Cita agendada" if it's behind. Decoupled via the event bus
   * so ContactsModule needn't depend on AppointmentsModule. Best-effort.
   */
  @OnEvent('appointment.created')
  async onAppointmentBooked(appt: Appointment): Promise<void> {
    try {
      const contactId = appt?.contactId ?? appt?.contact?.id;
      if (!contactId) return;
      const contact = await this.contactsRepo.findOne({
        where: { id: contactId },
      });
      if (!contact) return;
      const next = nextStageOnBooking(contact.pipelineStage);
      if (!next || next === contact.pipelineStage) return;
      contact.pipelineStage = next;
      const saved = await this.contactsRepo.save(contact);
      this.emitUpdated(saved);
    } catch {
      // Auto-advance is a nicety; never let it break a booking.
    }
  }

  /**
   * Paginated, newest-first list with server-side filtering. The status filter
   * and the free-text search (name / phone / email / tags, case-insensitive) are
   * pushed down to SQL so they compose with paging — the frontend asks for one
   * page at a time instead of loading every contact and filtering in the browser.
   */
  async list(query: ContactsQuery): Promise<ContactPage> {
    const qb = this.contactsRepo
      .createQueryBuilder('c')
      .orderBy('c.createdAt', 'DESC')
      .take(query.limit)
      .skip(query.offset);

    if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(c.name ILIKE :q OR c.phone ILIKE :q OR c.email ILIKE :q
          OR array_to_string(c.tags, ',') ILIKE :q)`,
        { q: `%${search}%` },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, limit: query.limit, offset: query.offset };
  }

  async findOne(id: string): Promise<Contact> {
    const contact = await this.contactsRepo.findOne({
      where: { id },
      relations: ['appointments'],
    });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    return contact;
  }

  async findById(id: string): Promise<Contact | null> {
    return this.contactsRepo.findOne({ where: { id } });
  }

  async findByPhone(phone: string): Promise<Contact | null> {
    return this.contactsRepo.findOne({ where: { phone } });
  }

  async upsertByPhone(phone: string, name?: string): Promise<Contact> {
    // Best-effort E.164 so the same person isn't duplicated across channels.
    const normalized = normalizePhoneLoose(phone);
    let contact = await this.findByPhone(normalized);
    if (!contact) {
      contact = this.contactsRepo.create({
        phone: normalized,
        name: name || normalized,
        // A contact first seen on WhatsApp starts as a lead from that channel,
        // at the top of the "Nuevo" pipeline column.
        source: 'whatsapp',
        pipelineStage: PipelineStage.NEW,
        boardPosition: Date.now(),
      });
      await this.contactsRepo.save(contact);
      this.emitUpdated(contact);
    }
    return contact;
  }

  async create(dto: CreateContactDto): Promise<Contact> {
    const phone = normalizePhoneStrict(dto.phone);
    const existing = await this.findByPhone(phone);
    if (existing) {
      throw new ConflictException(`El teléfono ${phone} ya está en uso.`);
    }
    const contact = this.contactsRepo.create({
      ...dto,
      phone,
      tags: dto.tags ?? [],
      source: dto.source ?? 'manual',
      // New contacts land at the top of their column (newest first).
      boardPosition: Date.now(),
    });
    const saved = await this.contactsRepo.save(contact);
    this.emitUpdated(saved);
    return saved;
  }

  async update(id: string, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.findOne(id);

    // Apply ONLY the fields actually provided. A transformed DTO carries omitted
    // optional fields as `undefined` own-properties (ES2022 class fields), so a
    // blind spread/assign would wipe values not present in a partial update.
    const simpleFields = [
      'name',
      'email',
      'notes',
      'status',
      'tags',
      'source',
      'customFields',
      'pipelineStage',
      'boardPosition',
    ] as const;
    const target = contact as unknown as Record<string, unknown>;
    for (const key of simpleFields) {
      if (dto[key] !== undefined) {
        target[key] = dto[key];
      }
    }

    if (dto.phone !== undefined) {
      const phone = normalizePhoneStrict(dto.phone);
      if (phone !== contact.phone) {
        const clash = await this.findByPhone(phone);
        if (clash && clash.id !== contact.id) {
          throw new ConflictException(`El teléfono ${phone} ya está en uso.`);
        }
      }
      contact.phone = phone;
    }

    const saved = await this.contactsRepo.save(contact);
    this.emitUpdated(saved);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const contact = await this.findOne(id);
    await this.contactsRepo.remove(contact);
    this.events.emit('contact.updated', { id, deleted: true });
  }

  // ─── Consent / GDPR ───

  /** Set/clear the opt-out flag (STOP/BAJA). Stamps `optedOutAt` on opt-out. */
  async setOptOut(id: string, optedOut: boolean): Promise<Contact> {
    const contact = await this.findOne(id);
    contact.optedOut = optedOut;
    contact.optedOutAt = optedOut ? new Date() : null;
    const saved = await this.contactsRepo.save(contact);
    this.emitUpdated(saved);
    return saved;
  }

  /**
   * GDPR erasure: scrub the contact's personal data in place but keep the row
   * (de-identified) so appointment history survives. Phone is replaced with a
   * unique tombstone (the column is unique + drives WhatsApp threading). The
   * contact is also opted out. Idempotent.
   */
  async anonymize(id: string): Promise<Contact> {
    const contact = await this.findOne(id);
    if (contact.anonymizedAt) return contact;
    contact.name = 'Contacto anonimizado';
    contact.phone = `anon:${contact.id}`;
    contact.email = null as unknown as string;
    contact.notes = null as unknown as string;
    contact.tags = [];
    contact.customFields = null;
    contact.optedOut = true;
    contact.optedOutAt = contact.optedOutAt ?? new Date();
    contact.anonymizedAt = new Date();
    const saved = await this.contactsRepo.save(contact);
    this.emitUpdated(saved);
    return saved;
  }

  count(): Promise<number> {
    return this.contactsRepo.count();
  }

  /** Contacts in a given pipeline stage (drives the dashboard "leads sin contactar"). */
  countByPipelineStage(stage: PipelineStage): Promise<number> {
    return this.contactsRepo.count({ where: { pipelineStage: stage } });
  }

  /**
   * Per-stage counts for the dashboard mini-funnel — one GROUP BY (no card
   * payload, unlike `board()`). All six stages are returned, zero-filled and in
   * `PIPELINE_STAGES` order.
   */
  async pipelineSummary(): Promise<{ stage: PipelineStage; total: number }[]> {
    const rows = await this.contactsRepo
      .createQueryBuilder('c')
      .select('c.pipelineStage', 'stage')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.pipelineStage')
      .getRawMany<{ stage: string; count: string }>();
    const byStage = new Map(rows.map((r) => [r.stage, Number(r.count)]));
    return PIPELINE_STAGES.map((stage) => ({
      stage,
      total: byStage.get(stage) ?? 0,
    }));
  }

  // ─── CSV import / export ───

  /** All contacts as CSV (header + one row each). */
  async exportCsv(): Promise<string> {
    const contacts = await this.contactsRepo.find({
      order: { createdAt: 'DESC' },
    });
    const rows: string[][] = [EXPORT_COLUMNS.map((c) => c)];
    for (const c of contacts) {
      rows.push([
        c.name ?? '',
        c.phone ?? '',
        c.email ?? '',
        c.status ?? '',
        (c.tags ?? []).join('; '),
        c.source ?? '',
        c.notes ?? '',
      ]);
    }
    return toCsv(rows);
  }

  /**
   * Import contacts from CSV text. Upserts by phone (loose E.164): an existing
   * phone is updated with the provided non-empty cells, a new one is created.
   * Lenient — invalid rows are skipped and reported, the rest still import.
   */
  async importCsv(csv: string): Promise<ImportResult> {
    const rows = parseCsv(csv);
    const result: ImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };
    if (rows.length === 0) return result;

    // Map the header to canonical field → column index.
    const header = rows[0].map(deburrLower);
    const col: Record<string, number> = {};
    header.forEach((h, i) => {
      const field = HEADER_ALIASES[h];
      if (field && !(field in col)) col[field] = i;
    });
    if (col.name === undefined || col.phone === undefined) {
      throw new ConflictException(
        'El CSV debe incluir al menos columnas de nombre y teléfono.',
      );
    }

    const cell = (r: string[], i: number | undefined) =>
      i === undefined ? '' : (r[i] ?? '').trim();

    // Strictly-decreasing board positions so a bulk import keeps CSV order at the
    // top of the "Nuevo" column (never all-equal from a same-millisecond loop).
    const importBase = Date.now();

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const lineNo = i + 1; // 1-based CSV line (header is line 1)
      const rawName = cell(r, col.name);
      const rawPhone = cell(r, col.phone);

      // Fully blank line → silently skip (not an error).
      if (!rawName && !rawPhone) continue;

      try {
        if (!rawPhone) {
          result.errors.push({ row: lineNo, message: 'Teléfono vacío.' });
          result.skipped++;
          continue;
        }
        const phone = normalizePhoneLoose(rawPhone);
        const name = rawName || phone;

        const email = cell(r, col.email);
        if (email && !EMAIL_RE.test(email)) {
          result.errors.push({
            row: lineNo,
            message: `Email inválido: ${email}`,
          });
          result.skipped++;
          continue;
        }

        const statusRaw = deburrLower(cell(r, col.status));
        const status = (Object.values(ContactStatus) as string[]).includes(
          statusRaw,
        )
          ? (statusRaw as ContactStatus)
          : undefined;

        const tags = cell(r, col.tags)
          .split(/[;,]/)
          .map((t) => t.trim())
          .filter(Boolean);
        const source = cell(r, col.source) || 'import';
        const notes = cell(r, col.notes);

        const existing = await this.findByPhone(phone);
        if (existing) {
          existing.name = name;
          if (email) existing.email = email;
          if (status) existing.status = status;
          if (tags.length) existing.tags = tags;
          if (source) existing.source = source;
          if (notes) existing.notes = notes;
          await this.contactsRepo.save(existing);
          result.updated++;
        } else {
          const contact = this.contactsRepo.create({
            name,
            phone,
            email: email || undefined,
            status: status ?? ContactStatus.LEAD,
            tags,
            source,
            notes: notes || undefined,
            boardPosition: importBase - i,
          });
          await this.contactsRepo.save(contact);
          result.created++;
        }
      } catch (err) {
        result.errors.push({
          row: lineNo,
          message: err instanceof Error ? err.message : 'Fila no válida.',
        });
        result.skipped++;
      }
    }

    return result;
  }
}
