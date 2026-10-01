import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { Contact, ContactStatus } from '../common/entities/contact.entity';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
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

export interface GoogleImportResult {
  total: number;
  created: number;
  existing: number;
  skipped: number;
  warningsCount: number;
  reportPath?: string;
  reportText: string;
  openedNotepad: boolean;
  contactsWithoutEmailCount: number;
  contactsWithoutPhoneCount: number;
  duplicatesOrSimilaritiesCount: number;
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

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.contactsRepo.query(`
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "isStudent" boolean DEFAULT false;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "studentModality" character varying;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "studentSchedule" jsonb;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "studentEnrolledAt" timestamptz;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "bloqueado" character varying(1) DEFAULT 'N';
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "emailerroneo" character varying(1) NOT NULL DEFAULT 'N';
        CREATE TABLE IF NOT EXISTS "contact_identity_changes" (
          "id" uuid NOT NULL DEFAULT gen_random_uuid(),
          "contactId" uuid REFERENCES contacts(id) ON DELETE CASCADE,
          "changeType" character varying NOT NULL,
          "targetChannel" character varying NOT NULL,
          "destination" character varying NOT NULL,
          "codeHash" character varying NOT NULL,
          "oldValues" jsonb,
          "newValues" jsonb,
          "status" character varying NOT NULL DEFAULT 'pending',
          "attempts" integer NOT NULL DEFAULT 0,
          "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          "verifiedAt" TIMESTAMP WITH TIME ZONE,
          "source" character varying NOT NULL DEFAULT 'web',
          "ipAddress" character varying,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_contact_identity_changes_id" PRIMARY KEY ("id")
        );
      `);
    } catch {
      // Non-fatal schema migration
    }

    try {
      const contactsWithAppts = await this.contactsRepo
        .createQueryBuilder('c')
        .innerJoin('appointments', 'a', 'a.contactId = c.id')
        .where('c.status = :leadStatus', { leadStatus: ContactStatus.LEAD })
        .getMany();

      for (const contact of contactsWithAppts) {
        contact.status = ContactStatus.ACTIVE;
        if (!contact.tags) contact.tags = [];
        if (!contact.tags.includes('cliente')) {
          contact.tags.push('cliente');
        }
        if (contact.pipelineStage === PipelineStage.NEW || contact.pipelineStage === PipelineStage.CONTACTED) {
          contact.pipelineStage = PipelineStage.BOOKED;
        }
        await this.contactsRepo.save(contact);
      }
    } catch {
      // Non-fatal init sync
    }
  }

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

      // Formalize contact as full active customer upon booking their appointment
      contact.status = ContactStatus.ACTIVE;
      if (!contact.tags) contact.tags = [];
      if (!contact.tags.includes('cliente')) {
        contact.tags.push('cliente');
      }

      const next = nextStageOnBooking(contact.pipelineStage);
      if (next && next !== contact.pipelineStage) {
        contact.pipelineStage = next;
      }
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

  async findByEmail(email: string): Promise<Contact | null> {
    if (!email) return null;
    return this.contactsRepo
      .createQueryBuilder('c')
      .where('LOWER(c.email) = LOWER(:email)', { email: email.trim() })
      .orderBy('c.createdAt', 'DESC')
      .getOne();
  }

  async findByPhoneOrEmail(phone?: string, email?: string): Promise<Contact | null> {
    if (phone) {
      const normalized = normalizePhoneLoose(phone);
      if (normalized) {
        const byPhone = await this.findByPhone(normalized);
        if (byPhone) return byPhone;
      }
    }
    if (email) {
      return this.findByEmail(email);
    }
    return null;
  }

  async upsertByPhone(
    phone: string,
    name?: string,
    extra?: { source?: string; email?: string; tags?: string[] },
  ): Promise<Contact> {
    // Best-effort E.164 so the same person isn't duplicated across channels.
    const normalized = normalizePhoneLoose(phone);
    let contact = await this.findByPhone(normalized);
    if (!contact) {
      contact = this.contactsRepo.create({
        phone: normalized,
        name: name || normalized,
        email: extra?.email || null,
        tags: extra?.tags ?? ['lead_landing_web'],
        source: extra?.source ?? 'landing',
        pipelineStage: PipelineStage.NEW,
        boardPosition: Date.now(),
      });
      await this.contactsRepo.save(contact);
      this.emitUpdated(contact);
    } else {
      let changed = false;
      if (name && (contact.name === contact.phone || !contact.name || contact.name === normalized)) {
        contact.name = name;
        changed = true;
      }
      if (extra?.email && !contact.email) {
        contact.email = extra.email;
        changed = true;
      }
      if (extra?.tags && extra.tags.length > 0) {
        const existingTags = new Set(contact.tags || []);
        for (const t of extra.tags) existingTags.add(t);
        contact.tags = Array.from(existingTags);
        changed = true;
      }
      if (changed) {
        await this.contactsRepo.save(contact);
        this.emitUpdated(contact);
      }
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
      bloqueado: dto.bloqueado?.toUpperCase() === 'S' ? 'S' : 'N',
      emailerroneo: dto.emailerroneo?.toUpperCase() === 'S' ? 'S' : 'N',
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
      'notes',
      'status',
      'tags',
      'source',
      'customFields',
      'pipelineStage',
      'boardPosition',
      'isStudent',
      'studentModality',
      'studentSchedule',
      'bloqueado',
      'emailerroneo',
    ] as const;
    const target = contact as unknown as Record<string, unknown>;
    for (const key of simpleFields) {
      if (dto[key] !== undefined) {
        if (key === 'bloqueado' || key === 'emailerroneo') {
          target[key] = dto[key]?.toUpperCase() === 'S' ? 'S' : 'N';
        } else {
          target[key] = dto[key];
        }
      }
    }

    if (dto.email !== undefined) {
      contact.email = dto.email && typeof dto.email === 'string' && dto.email.trim()
        ? dto.email.trim().toLowerCase()
        : null;
      if (dto.emailerroneo === undefined && contact.email) {
        contact.emailerroneo = 'N';
      }
    }

    if (dto.isStudent && !contact.studentEnrolledAt) {
      contact.studentEnrolledAt = new Date();
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

  async isContactBlocked(phoneOrEmailOrId?: string | null): Promise<boolean> {
    if (!phoneOrEmailOrId) return false;
    const clean = phoneOrEmailOrId.trim();
    let contact: Contact | null = null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
      contact = await this.findById(clean).catch(() => null);
    }
    if (!contact) {
      contact = await this.findByPhoneOrEmail(clean, clean).catch(() => null);
    }
    return contact?.bloqueado === 'S';
  }

  async isContactEmailErroneous(phoneOrEmailOrId?: string | null): Promise<boolean> {
    if (!phoneOrEmailOrId) return false;
    const clean = phoneOrEmailOrId.trim();
    let contact: Contact | null = null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
      contact = await this.findById(clean).catch(() => null);
    }
    if (!contact) {
      contact = await this.findByPhoneOrEmail(clean, clean).catch(() => null);
    }
    return contact?.emailerroneo === 'S';
  }

  /**
   * Formalize a contact as an active student of Centro de Yoga Salvadora Conesa.
   * - Sets isStudent = true
   * - Sets studentModality ('1_clase_semanal' or '2_clases_semanales')
   * - Optionally sets studentSchedule (fixed weekly slots)
   * - Sets studentEnrolledAt = new Date()
   * - Adds 'alumno' to tags
   * - If the contact has any first class / trial appointments for yoga, marks them as free (price = '0.00', paymentStatus = EXEMPT)
   */
  async convertToStudent(
    id: string,
    modality: string,
    schedule?: Array<{ day: number; time: string }>,
  ): Promise<Contact> {
    const contact = await this.findOne(id);
    contact.isStudent = true;
    contact.studentModality = modality;
    if (schedule !== undefined) {
      contact.studentSchedule = schedule;
    }
    contact.studentEnrolledAt = new Date();
    contact.status = ContactStatus.ACTIVE;
    if (!contact.tags) contact.tags = [];
    if (!contact.tags.includes('alumno')) {
      contact.tags.push('alumno');
    }
    if (!contact.tags.includes('cliente')) {
      contact.tags.push('cliente');
    }
    if (
      contact.pipelineStage === PipelineStage.NEW ||
      contact.pipelineStage === PipelineStage.CONTACTED ||
      contact.pipelineStage === PipelineStage.QUALIFIED ||
      contact.pipelineStage === PipelineStage.BOOKED
    ) {
      contact.pipelineStage = PipelineStage.WON;
    }
    const saved = await this.contactsRepo.save(contact);

    // Bonify first class / trial yoga appointments: free for students who convert!
    const yogaAppointments = await this.appointmentsRepo.find({
      where: {
        contactId: id,
        status: In([AppointmentStatus.SCHEDULED, AppointmentStatus.PENDING_APPROVAL, AppointmentStatus.COMPLETED]),
      },
    });

    for (const appt of yogaAppointments) {
      if (/yoga/i.test(appt.service)) {
        if (appt.isFirstClass || appt.paymentStatus !== PaymentStatus.PAID) {
          appt.price = '0.00';
          appt.paymentStatus = PaymentStatus.EXEMPT;
          appt.paymentNotes = (appt.paymentNotes ? appt.paymentNotes + ' | ' : '') + 'Primera clase gratuita por confirmación de alta como alumno.';
          await this.appointmentsRepo.save(appt);
        }
      }
    }

    this.emitUpdated(saved);
    return saved;
  }

  async removeStudentStatus(id: string): Promise<Contact> {
    const contact = await this.findOne(id);
    contact.isStudent = false;
    contact.studentModality = null;
    contact.studentSchedule = null;
    contact.studentEnrolledAt = null;
    if (contact.tags) {
      contact.tags = contact.tags.filter((t) => t !== 'alumno');
    }
    const saved = await this.contactsRepo.save(contact);
    this.emitUpdated(saved);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const contact = await this.findOne(id);
    try {
      await this.contactsRepo.query(
        `UPDATE calls SET "contactId" = NULL WHERE "contactId" = $1;
         UPDATE zadarma_sms_respuesta SET contact_id = NULL WHERE contact_id = $1;`,
        [id],
      );
    } catch {
      // Non-fatal if tables don't exist
    }
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

  /**
   * Import contacts from Google Contacts CSV export (contacts.google.com -> Export -> Google CSV).
   * - Parses all fields according to Google Contacts schema
   * - Performs deep discrepancy analysis (invalid phones, short codes, text phones, invalid emails)
   * - Prevents duplication if phone already exists in CRM (enriches missing fields)
   * - Inserts new contacts with source 'google_contacts'
   * - Generates structured text report with:
   *   1. Resumen ejecutivo
   *   2. Contactos nuevos creados
   *   3. Contactos ya existentes en CRM
   *   4. INFORME DE CONTACTOS SIN EMAIL
   *   5. INFORME DE CONTACTOS SIN MÓVIL / TELÉFONO VÁLIDO
   *   6. INFORME DE DISCREPANCIAS, DUPLICIDADES Y NOMBRES SIMILARES
   * - Writes report to file and opens it in Notepad (notepad.exe) on Windows
   */
  async importGoogleCsv(opts: {
    filePath?: string;
    csvContent?: string;
    openNotepad?: boolean;
  }): Promise<GoogleImportResult> {
    const cleanPath = (opts.filePath || '').trim().replace(/^["']|["']$/g, '');
    let csvText = '';
    let resolvedOrigin = '';

    if (cleanPath) {
      if (fs.existsSync(cleanPath)) {
        try {
          csvText = fs.readFileSync(cleanPath, 'utf-8');
          resolvedOrigin = cleanPath;
        } catch (readErr) {
          this.logger.error(`Error leyendo archivo CSV en ${cleanPath}: ${readErr}`);
          throw new BadRequestException(`No se pudo leer el archivo en ${cleanPath}: ${readErr}`);
        }
      } else if (!opts.csvContent) {
        throw new BadRequestException(`No se encuentra el archivo en la ruta especificada: ${cleanPath}`);
      }
    }

    if (!csvText && opts.csvContent) {
      csvText = opts.csvContent;
      resolvedOrigin = cleanPath || 'Archivo CSV cargado desde el navegador';
    }

    if (!csvText || !csvText.trim()) {
      throw new BadRequestException(
        'Debes indicar la ruta del archivo CSV de Google en el equipo o seleccionar un archivo válido.',
      );
    }

    // Strip BOM if present
    if (csvText.charCodeAt(0) === 0xfeff) {
      csvText = csvText.slice(1);
    }

    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      throw new BadRequestException('El archivo CSV de Google está vacío.');
    }

    const header = rows[0];
    const colMap: Record<string, number> = {};
    header.forEach((h, idx) => {
      colMap[deburrLower(h)] = idx;
    });

    const getVal = (r: string[], colName: string): string => {
      const idx = colMap[deburrLower(colName)];
      return idx !== undefined ? (r[idx] ?? '').trim() : '';
    };

    const totalRows = rows.length - 1;
    const importBase = Date.now();

    // Data structures for tracking and reporting
    const createdList: Array<{
      row: number;
      name: string;
      phone: string;
      email?: string;
      notes?: string;
      secondaryPhones: string[];
    }> = [];

    const existingList: Array<{
      row: number;
      name: string;
      phone: string;
      existingName: string;
      existingId: string;
      enriched?: string;
    }> = [];

    const skippedList: Array<{
      row: number;
      name: string;
      reason: string;
      category: string;
      phoneRaw?: string;
    }> = [];

    const warningsList: Array<{
      row: number;
      name: string;
      warning: string;
    }> = [];

    const contactsWithoutEmail: Array<{
      row: number;
      name: string;
      phone: string;
      status: 'NUEVO' | 'EXISTENTE';
    }> = [];

    const contactsWithoutPhone: Array<{
      row: number;
      name: string;
      email?: string;
      reason: string;
    }> = [];

    const phoneToOccurrences = new Map<string, Array<{ row: number; name: string; raw: string; label: string }>>();
    const emailToOccurrences = new Map<string, Array<{ row: number; name: string }>>();

    interface ParsedCandidate {
      row: number;
      name: string;
      primaryPhone: string | null;
      secondaryPhones: Array<{ label: string; raw: string; normalized: string }>;
      primaryEmail: string | null;
      allEmails: string[];
      orgName: string;
      orgTitle: string;
      notes: string;
      labels: string[];
      validPhones: Array<{ label: string; raw: string; normalized: string }>;
      invalidPhones: Array<{ raw: string; reason: string }>;
    }

    const candidates: ParsedCandidate[] = [];

    // Phase 1: Parse, validate and classify each row
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const lineNo = i + 1;

      // Extract Name
      const firstName = getVal(r, 'First Name') || getVal(r, 'Nombre');
      const middleName = getVal(r, 'Middle Name') || getVal(r, 'Segundo nombre');
      const lastName = getVal(r, 'Last Name') || getVal(r, 'Apellidos') || getVal(r, 'Apellido');
      const fileAs = getVal(r, 'File As') || getVal(r, 'Archivar como');
      const nickname = getVal(r, 'Nickname') || getVal(r, 'Apodo');
      const orgName = getVal(r, 'Organization Name') || getVal(r, 'Nombre de la organización') || getVal(r, 'Empresa');
      const orgTitle = getVal(r, 'Organization Title') || getVal(r, 'Puesto');
      const notes = getVal(r, 'Notes') || getVal(r, 'Notas');
      const labelsRaw = getVal(r, 'Labels') || getVal(r, 'Etiquetas');

      let name = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
      if (!name) name = fileAs || nickname || orgName || '';

      // Extract Phones
      const phoneEntries: Array<{ label: string; raw: string }> = [];
      for (let p = 1; p <= 10; p++) {
        const pVal = getVal(r, `Phone ${p} - Value`) || getVal(r, `Teléfono ${p} - Valor`);
        const pLbl = getVal(r, `Phone ${p} - Label`) || getVal(r, `Teléfono ${p} - Tipo`) || 'Móvil';
        if (pVal) {
          phoneEntries.push({ label: pLbl, raw: pVal });
        }
      }

      // Extract Emails
      const emailEntries: string[] = [];
      for (let e = 1; e <= 5; e++) {
        const eVal = getVal(r, `E-mail ${e} - Value`) || getVal(r, `Correo electrónico ${e} - Valor`);
        if (eVal) {
          emailEntries.push(eVal.trim());
        }
      }

      // Check for completely empty row
      if (!name && phoneEntries.length === 0 && emailEntries.length === 0) {
        continue;
      }

      // Classify phones
      const validPhones: Array<{ label: string; raw: string; normalized: string }> = [];
      const invalidPhones: Array<{ raw: string; reason: string }> = [];

      for (const pe of phoneEntries) {
        const digitsOnly = pe.raw.replace(/\D/g, '');
        if (digitsOnly.length === 0) {
          invalidPhones.push({ raw: pe.raw, reason: 'Teléfono alfanumérico / sólo texto' });
        } else if (digitsOnly.length < 6) {
          invalidPhones.push({ raw: pe.raw, reason: `Número corto o extensión interna (${pe.raw})` });
        } else if (digitsOnly.length > 15) {
          invalidPhones.push({ raw: pe.raw, reason: `Longitud anómala (${digitsOnly.length} dígitos: ${pe.raw})` });
        } else {
          const norm = normalizePhoneLoose(pe.raw);
          validPhones.push({ label: pe.label, raw: pe.raw, normalized: norm });
        }
      }

      // Validate emails
      let primaryEmail: string | null = null;
      const validEmails: string[] = [];
      for (const em of emailEntries) {
        const cleanEmail = em.trim().toLowerCase();
        if (cleanEmail === 'none' || !EMAIL_RE.test(cleanEmail)) {
          warningsList.push({
            row: lineNo,
            name: name || `Fila ${lineNo}`,
            warning: `Email descartado por formato no válido: "${em}"`,
          });
        } else {
          validEmails.push(cleanEmail);
          if (!primaryEmail) primaryEmail = cleanEmail;
        }
      }

      const customLabels = labelsRaw
        .split(/[,;]/)
        .map((l) => l.trim().replace(/^\*\s*/, ''))
        .filter((l) => Boolean(l) && !/mycontacts/i.test(l));

      candidates.push({
        row: lineNo,
        name: name || '(Sin nombre)',
        primaryPhone: validPhones.length > 0 ? validPhones[0].normalized : null,
        secondaryPhones: validPhones.slice(1),
        primaryEmail,
        allEmails: validEmails,
        orgName,
        orgTitle,
        notes,
        labels: customLabels,
        validPhones,
        invalidPhones,
      });
    }

    // Phase 2: Duplicate check across CSV
    for (const c of candidates) {
      for (const vp of c.validPhones) {
        if (!phoneToOccurrences.has(vp.normalized)) {
          phoneToOccurrences.set(vp.normalized, []);
        }
        phoneToOccurrences.get(vp.normalized)!.push({
          row: c.row,
          name: c.name,
          raw: vp.raw,
          label: vp.label,
        });
      }
      for (const em of c.allEmails) {
        if (!emailToOccurrences.has(em)) {
          emailToOccurrences.set(em, []);
        }
        emailToOccurrences.get(em)!.push({
          row: c.row,
          name: c.name,
        });
      }
    }

    // Phase 3: DB insertion & comparison with existing CRM contacts
    for (const c of candidates) {
      // If no valid phone
      if (!c.primaryPhone) {
        let cat = 'Sin datos de contacto';
        let reason = 'No dispone de ningún número de teléfono ni correo electrónico en Google Contacts.';
        if (c.invalidPhones.length > 0) {
          const firstInv = c.invalidPhones[0];
          if (/texto|alfanumerico/i.test(firstInv.reason)) {
            cat = 'Teléfonos alfanuméricos / solo texto';
          } else if (/corto|extension/i.test(firstInv.reason)) {
            cat = 'Números cortos / servicios';
          } else {
            cat = 'Formato anómalo';
          }
          reason = `Teléfono descartado: ${c.invalidPhones.map((ip) => `${ip.raw} [${ip.reason}]`).join(', ')}`;
        }
        skippedList.push({
          row: c.row,
          name: c.name,
          category: cat,
          reason,
          phoneRaw: c.invalidPhones[0]?.raw,
        });
        contactsWithoutPhone.push({
          row: c.row,
          name: c.name,
          email: c.primaryEmail || undefined,
          reason,
        });
        continue;
      }

      const phone = c.primaryPhone;
      const existing = await this.findByPhone(phone);

      if (existing) {
        const enrichedParts: string[] = [];
        if ((!existing.name || existing.name === 'Alumno' || existing.name === phone) && c.name && c.name !== '(Sin nombre)') {
          existing.name = c.name;
          enrichedParts.push('Nombre actualizado');
        }
        if (!existing.email && c.primaryEmail) {
          existing.email = c.primaryEmail;
          enrichedParts.push(`Email añadido (${c.primaryEmail})`);
        }
        if (c.orgName && (!existing.notes || !existing.notes.includes(c.orgName))) {
          existing.notes = (existing.notes ? existing.notes + ' | ' : '') + `Empresa: ${c.orgName}`;
          enrichedParts.push('Empresa añadida a notas');
        }
        if (enrichedParts.length > 0) {
          await this.contactsRepo.save(existing);
        }

        existingList.push({
          row: c.row,
          name: c.name,
          phone,
          existingName: existing.name,
          existingId: existing.id,
          enriched: enrichedParts.length > 0 ? enrichedParts.join(', ') : undefined,
        });

        if (!existing.email) {
          contactsWithoutEmail.push({
            row: c.row,
            name: existing.name,
            phone,
            status: 'EXISTENTE',
          });
        }
      } else {
        // Create new contact in CRM
        const contactName = c.name && c.name !== '(Sin nombre)' ? c.name : phone;
        const notesParts: string[] = [];
        if (c.notes) notesParts.push(c.notes);
        if (c.orgName) notesParts.push(`Empresa: ${c.orgName}${c.orgTitle ? ` (${c.orgTitle})` : ''}`);
        if (c.secondaryPhones.length > 0) {
          notesParts.push(`Tel. adicionales: ${c.secondaryPhones.map((sp) => `${sp.label}: ${sp.raw}`).join(', ')}`);
        }
        if (c.invalidPhones.length > 0) {
          notesParts.push(`Otros valores descartados: ${c.invalidPhones.map((ip) => ip.raw).join(', ')}`);
        }

        const tags = ['google', ...c.labels];
        const newContact = this.contactsRepo.create({
          name: contactName,
          phone,
          email: c.primaryEmail || undefined,
          status: ContactStatus.LEAD,
          pipelineStage: PipelineStage.NEW,
          source: 'google_contacts',
          tags,
          notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
          boardPosition: importBase - c.row,
        });

        await this.contactsRepo.save(newContact);

        createdList.push({
          row: c.row,
          name: contactName,
          phone,
          email: c.primaryEmail || undefined,
          notes: notesParts.join(' | '),
          secondaryPhones: c.secondaryPhones.map((sp) => `${sp.label}: ${sp.raw}`),
        });

        if (!c.primaryEmail) {
          contactsWithoutEmail.push({
            row: c.row,
            name: contactName,
            phone,
            status: 'NUEVO',
          });
        }
      }
    }

    // Phase 4: Name similarity analysis across candidates
    const similarPairs: Array<{
      type: string;
      aRow: number;
      aName: string;
      aPhone: string;
      bRow: number;
      bName: string;
      bPhone: string;
    }> = [];

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (!a.name || !b.name || a.name === '(Sin nombre)' || b.name === '(Sin nombre)') continue;
        const nA = deburrLower(a.name);
        const nB = deburrLower(b.name);
        if (nA === nB) {
          similarPairs.push({
            type: 'Nombre idéntico',
            aRow: a.row,
            aName: a.name,
            aPhone: a.primaryPhone || 'Sin teléfono',
            bRow: b.row,
            bName: b.name,
            bPhone: b.primaryPhone || 'Sin teléfono',
          });
          continue;
        }
        if (nA.length >= 5 && nB.length >= 5) {
          if (nA.includes(nB) || nB.includes(nA)) {
            similarPairs.push({
              type: 'Variación de nombre / Subcadena',
              aRow: a.row,
              aName: a.name,
              aPhone: a.primaryPhone || 'Sin teléfono',
              bRow: b.row,
              bName: b.name,
              bPhone: b.primaryPhone || 'Sin teléfono',
            });
            continue;
          }
          const dist = levenshteinDistance(nA, nB);
          if (dist <= 2 && Math.max(nA.length, nB.length) >= 6) {
            similarPairs.push({
              type: `Diferencia de 1-2 letras (distancia: ${dist})`,
              aRow: a.row,
              aName: a.name,
              aPhone: a.primaryPhone || 'Sin teléfono',
              bRow: b.row,
              bName: b.name,
              bPhone: b.primaryPhone || 'Sin teléfono',
            });
          }
        }
      }
    }

    // Phase 5: Build comprehensive Report Text
    const now = new Date();
    const formattedDate = now.toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    let report = '';
    const lineSep = '='.repeat(80);
    const subSep = '-'.repeat(80);

    report += `${lineSep}\n`;
    report += `INFORME DETALLADO DE IMPORTACIÓN Y ANÁLISIS DE CONTACTOS DE GOOGLE\n`;
    report += `Centro de Yoga Salvadora Conesa & Club Social Parque Granada\n`;
    report += `Fecha y hora de ejecución: ${formattedDate}\n`;
    report += `Origen: ${resolvedOrigin}\n`;
    report += `${lineSep}\n\n`;

    report += `📊 RESUMEN EJECUTIVO DE LA OPERACIÓN:\n`;
    report += `${subSep}\n`;
    report += `• Total de registros leídos del CSV:         ${totalRows}\n`;
    report += `• Contactos NUEVOS incorporados al CRM:      ${createdList.length}\n`;
    report += `• Contactos YA EXISTENTES en el CRM:         ${existingList.length}\n`;
    report += `• Contactos OMITIDOS (discrepancias):        ${skippedList.length}\n`;
    report += `• Contactos SIN EMAIL:                       ${contactsWithoutEmail.length}\n`;
    report += `• Contactos SIN MÓVIL VÁLIDO:                ${contactsWithoutPhone.length}\n`;
    report += `• Posibles duplicidades o nombres similares: ${similarPairs.length}\n`;
    report += `${subSep}\n\n`;

    // 1. NUEVOS
    report += `1. CONTACTOS NUEVOS AÑADIDOS A LA BASE DE DATOS (${createdList.length})\n`;
    report += `${subSep}\n`;
    if (createdList.length === 0) {
      report += `No se insertó ningún contacto nuevo (todos existían o fueron omitidos).\n\n`;
    } else {
      createdList.forEach((c) => {
        report += `[Fila ${c.row}] ${c.name}\n`;
        report += `   Teléfono principal: ${c.phone}\n`;
        report += `   Email:              ${c.email || '(sin email)'}\n`;
        if (c.secondaryPhones.length > 0) {
          report += `   Tel. adicionales:   ${c.secondaryPhones.join(', ')}\n`;
        }
        if (c.notes) {
          report += `   Notas / Empresa:    ${c.notes}\n`;
        }
        report += `\n`;
      });
    }

    // 2. EXISTENTES
    report += `2. CONTACTOS YA EXISTENTES EN EL CRM (${existingList.length})\n`;
    report += `${subSep}\n`;
    if (existingList.length === 0) {
      report += `No se encontraron coincidencias previas en la base de datos.\n\n`;
    } else {
      existingList.forEach((e) => {
        report += `[Fila ${e.row}] ${e.name} (Tel: ${e.phone})\n`;
        report += `   Coincidencia en CRM: ${e.existingName} (ID: ${e.existingId})\n`;
        if (e.enriched) {
          report += `   Enriquecimiento:     ${e.enriched}\n`;
        }
        report += `\n`;
      });
    }

    // 3. CONTACTOS SIN EMAIL
    report += `3. INFORME DE CONTACTOS SIN CORREO ELECTRÓNICO (${contactsWithoutEmail.length})\n`;
    report += `${subSep}\n`;
    if (contactsWithoutEmail.length === 0) {
      report += `Todos los contactos procesados disponen de dirección de email.\n\n`;
    } else {
      contactsWithoutEmail.forEach((ne) => {
        report += `• [Fila ${ne.row}] ${ne.name} | Tel: ${ne.phone} | Estado: ${ne.status}\n`;
      });
      report += `\n`;
    }

    // 4. CONTACTOS SIN MOVIL VALIDO
    report += `4. INFORME DE CONTACTOS SIN MÓVIL / TELÉFONO VÁLIDO (${contactsWithoutPhone.length})\n`;
    report += `${subSep}\n`;
    if (contactsWithoutPhone.length === 0) {
      report += `Todos los contactos leídos disponían de un número de teléfono válido.\n\n`;
    } else {
      contactsWithoutPhone.forEach((np) => {
        report += `• [Fila ${np.row}] ${np.name}${np.email ? ` (Email: ${np.email})` : ''}\n`;
        report += `   Motivo de descarte: ${np.reason}\n`;
      });
      report += `\n`;
    }

    // 5. DISCREPANCIAS, DUPLICIDADES Y NOMBRES SIMILARES
    report += `5. INFORME DE DISCREPANCIAS, DUPLICIDADES Y COINCIDENCIAS:\n`;
    report += `${subSep}\n`;

    // A) Teléfonos compartidos
    report += `A) TELÉFONOS COMPARTIDOS O DUPLICADOS EN MÚLTIPLES REGISTROS:\n`;
    let sharedPhonesCount = 0;
    for (const [phone, occ] of phoneToOccurrences.entries()) {
      const uniqueRows = [...new Set(occ.map((o) => o.row))];
      if (uniqueRows.length > 1) {
        sharedPhonesCount++;
        report += `• Teléfono ${phone} asignado a ${uniqueRows.length} registros diferentes:\n`;
        occ.forEach((o) => {
          report += `   - [Fila ${o.row}] ${o.name} (${o.label}: ${o.raw})\n`;
        });
      }
    }
    if (sharedPhonesCount === 0) {
      report += `No se detectaron teléfonos duplicados o compartidos.\n`;
    }
    report += `\n`;

    // B) Emails compartidos
    report += `B) CORREOS ELECTRÓNICOS COMPARTIDOS O DUPLICADOS:\n`;
    let sharedEmailsCount = 0;
    for (const [email, occ] of emailToOccurrences.entries()) {
      const uniqueRows = [...new Set(occ.map((o) => o.row))];
      if (uniqueRows.length > 1) {
        sharedEmailsCount++;
        report += `• Email ${email} asignado a ${uniqueRows.length} registros:\n`;
        occ.forEach((o) => {
          report += `   - [Fila ${o.row}] ${o.name}\n`;
        });
      }
    }
    if (sharedEmailsCount === 0) {
      report += `No se detectaron correos electrónicos duplicados.\n`;
    }
    report += `\n`;

    // C) Nombres similares
    report += `C) NOMBRES SIMILARES O POSIBLES PERSONAS DUPLICADAS:\n`;
    if (similarPairs.length === 0) {
      report += `No se detectaron nombres sospechosos de duplicidad por similitud ortográfica.\n`;
    } else {
      similarPairs.forEach((sp) => {
        report += `• [${sp.type}]\n`;
        report += `   1) [Fila ${sp.aRow}] "${sp.aName}" (Tel: ${sp.aPhone})\n`;
        report += `   2) [Fila ${sp.bRow}] "${sp.bName}" (Tel: ${sp.bPhone})\n`;
      });
    }
    report += `\n`;

    // D) Discrepancias de teléfonos alfanuméricos / cortos / anómalos
    report += `D) REGISTROS OMITIDOS POR FORMATO DE TELÉFONO:\n`;
    if (skippedList.length === 0) {
      report += `No hubo registros omitidos.\n`;
    } else {
      skippedList.forEach((sk) => {
        report += `• [Fila ${sk.row}] ${sk.name} [Categoría: ${sk.category}]\n`;
        report += `   Detalle: ${sk.reason}\n`;
      });
    }
    report += `\n`;

    // E) Correos descartados por formato inválido
    if (warningsList.length > 0) {
      report += `E) CORREOS ELECTRÓNICOS DESCARTADOS POR FORMATO INVÁLIDO:\n`;
      warningsList.forEach((w) => {
        report += `• [Fila ${w.row}] ${w.name}: ${w.warning}\n`;
      });
      report += `\n`;
    }

    report += `${lineSep}\n`;
    report += `FIN DEL INFORME DE IMPORTACIÓN\n`;
    report += `${lineSep}\n`;

    // Phase 6: Write report file to disk and spawn Notepad
    const dateStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const reportFileName = `informe_importacion_google_${dateStr}.txt`;
    let reportPath = '';

    if (cleanPath) {
      try {
        const candidateDir = path.dirname(cleanPath);
        const candidatePath = path.join(candidateDir, reportFileName);
        fs.writeFileSync(candidatePath, report, 'utf-8');
        reportPath = candidatePath;
      } catch {
        // Fallback to tmpdir
      }
    }

    if (!reportPath) {
      try {
        const tmpPath = path.join(os.tmpdir(), reportFileName);
        fs.writeFileSync(tmpPath, report, 'utf-8');
        reportPath = tmpPath;
      } catch (err) {
        this.logger.error(`Could not write report file to tmpdir: ${err}`);
      }
    }

    let openedNotepad = false;
    if (opts.openNotepad !== false && process.platform === 'win32' && reportPath) {
      try {
        const child = spawn('notepad.exe', [reportPath], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        openedNotepad = true;
        this.logger.log(`Opened report in Notepad: ${reportPath}`);
      } catch (npErr) {
        this.logger.warn(`Could not open notepad: ${npErr}`);
      }
    }

    return {
      total: totalRows,
      created: createdList.length,
      existing: existingList.length,
      skipped: skippedList.length,
      warningsCount: warningsList.length,
      reportPath: reportPath || undefined,
      reportText: report,
      openedNotepad,
      contactsWithoutEmailCount: contactsWithoutEmail.length,
      contactsWithoutPhoneCount: contactsWithoutPhone.length,
      duplicatesOrSimilaritiesCount: sharedPhonesCount + sharedEmailsCount + similarPairs.length,
    };
  }
}

