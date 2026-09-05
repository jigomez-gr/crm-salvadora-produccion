import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, ILike, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Contact } from '../common/entities/contact.entity';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
} from '../common/entities/appointment.entity';
import { Service } from '../common/entities/service.entity';
import { VapiAccount } from '../common/entities/vapi-account.entity';
import { CalcomService } from '../calcom/calcom.service';
import { ZadarmaSmsService } from '../sms/zadarma-sms.service';
import { TZDate } from '@date-fns/tz';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { businessDayWindow } from './business-day';
import { computeFreeSlots, TimeSlot } from './availability';
import { parseFlexibleStartsAt } from '../common/time';
import { WorkingHourSlot } from '../common/entities/agent-config.entity';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  RunAiAnalysisDto,
  RejectAppointmentDto,
  UpdateAppointmentPaymentDto,
  QueryAppointmentPaymentsDto,
} from './dto/appointment.dto';
import { generateDoctorReportPdfBuffer } from './pdf-report.generator';
import { AnalizaIaService, AiAnalysisResponse } from './analiza-ia.service';
import { EmailService } from '../email/email.service';
import { YCloudClient } from '../whatsapp/ycloud-client.service';
import { AgentsConfigService } from '../agents/agents-config.service';
import { MessagesService } from '../conversations/messages.service';
import { Conversation } from '../common/entities/conversation.entity';
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';

// Advisory-lock key that serializes all booking writes (single bookable
// resource). Arbitrary constant; when multi-resource lands, key it per resource.
const BOOKING_LOCK_KEY = 528_491;

@Injectable()
export class AppointmentsService implements OnModuleInit {
  private readonly logger = new Logger(AppointmentsService.name);
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Conversation)
    private readonly conversationsRepo: Repository<Conversation>,
    private readonly calcomService: CalcomService,
    private readonly eventEmitter: EventEmitter2,
    private readonly analizaIaService: AnalizaIaService,
    private readonly emailService: EmailService,
    private readonly ycloudClient: YCloudClient,
    private readonly agentsConfigService: AgentsConfigService,
    private readonly messagesService: MessagesService,
    @Optional()
    private readonly zadarmaSms?: ZadarmaSmsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.appointmentsRepo.query(`
        ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "paymentMethod" character varying;
        ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "paidAmount" numeric(10,2);
        ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "paymentNotes" text;
        ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "paymentRecordedBy" character varying;
        ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "paidAt" timestamptz;
      `);
      this.logger.log('Payment schema columns verified on appointments table.');
    } catch (err) {
      this.logger.warn(`Could not run payment schema migration on appointments table: ${err}`);
    }
  }

  async findAll(
    from?: string,
    to?: string,
    filters?: {
      serviceId?: string;
      calendarId?: string;
      status?: AppointmentStatus;
      managerId?: string;
    },
  ): Promise<Appointment[]> {
    const qb = this.appointmentsRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.contact', 'contact')
      .orderBy('a.startsAt', 'ASC');

    if (from && to) {
      qb.andWhere('a.startsAt BETWEEN :from AND :to', {
        from: new Date(from),
        to: new Date(to),
      });
    }

    if (filters?.serviceId) {
      qb.andWhere('a.serviceId = :serviceId', { serviceId: filters.serviceId });
    }

    if (filters?.calendarId) {
      qb.andWhere('a.calendarId = :calendarId', { calendarId: filters.calendarId });
    }

    if (filters?.status) {
      qb.andWhere('a.status = :status', { status: filters.status });
    }

    if (filters?.managerId) {
      const managedServices = await this.servicesRepo.find({
        where: { managerId: filters.managerId },
      });
      const managedServiceIds = managedServices.map((s) => s.id);
      const managedCalendarIds = managedServices.map((s) => s.calendarId);
      const managedNames = managedServices.map((s) => s.name);

      if (managedServiceIds.length > 0) {
        qb.andWhere(
          '(a.serviceId IN (:...managedServiceIds) OR a.calendarId IN (:...managedCalendarIds) OR a.service IN (:...managedNames))',
          { managedServiceIds, managedCalendarIds, managedNames },
        );
      } else {
        qb.andWhere('1 = 0');
      }
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<Appointment> {
    const appt = await this.appointmentsRepo.findOne({
      where: { id },
      relations: ['contact'],
    });
    if (!appt) throw new NotFoundException(`Appointment ${id} not found`);
    return appt;
  }

  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    const startsAt = new Date(parseFlexibleStartsAt(dto.startsAt));
    let endsAt = dto.endsAt ? new Date(parseFlexibleStartsAt(dto.endsAt)) : startsAt;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let serviceEntity: Service | null = null;
    if (dto.serviceId && UUID_REGEX.test(dto.serviceId)) {
      serviceEntity = await this.servicesRepo
        .findOne({
          where: { id: dto.serviceId },
          relations: ['manager'],
        })
        .catch(() => null);
    }
    if (!serviceEntity && dto.service) {
      serviceEntity = await this.servicesRepo
        .findOne({
          where: { name: dto.service },
          relations: ['manager'],
        })
        .catch(() => null);
      if (!serviceEntity) {
        serviceEntity = await this.servicesRepo
          .findOne({
            where: { name: ILike(`%${dto.service}%`) },
            relations: ['manager'],
          })
          .catch(() => null);
      }
    }

    if (serviceEntity && (!dto.endsAt || endsAt <= startsAt)) {
      endsAt = new Date(startsAt.getTime() + serviceEntity.durationMinutes * 60000);
    }

    this.assertValidWindow(startsAt, endsAt, { mustBeFuture: true });

    const cleanServiceName = (dto.service || serviceEntity?.name || '').toLowerCase().trim();

    // 1. Strict validation: Constelaciones Familiares
    if (/constelaci/i.test(cleanServiceName)) {
      const zoned = new TZDate(startsAt.getTime(), 'Europe/Madrid');
      const isSep27 = zoned.getMonth() === 8 && zoned.getDate() === 27 && zoned.getFullYear() === 2026;
      if (!isSep27) {
        throw new BadRequestException(
          'Las Constelaciones Familiares son un taller vivencial exclusivo que se celebra únicamente el domingo 27 de septiembre de 2026 de 10:00 a 14:00.',
        );
      }
    }

    // 2. Strict validation: Hatha Yoga Terapéutico
    if (/hatha.*yoga|yoga.*terap/i.test(cleanServiceName)) {
      const HATHA_YOGA_TIMETABLE: Record<number, string[]> = {
        2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
        3: ['20:15'],
        4: ['09:45', '11:15', '16:30', '17:30', '19:00'],
      };
      const effectiveTimetable =
        serviceEntity?.weeklySchedule && Object.keys(serviceEntity.weeklySchedule).length > 0
          ? serviceEntity.weeklySchedule
          : HATHA_YOGA_TIMETABLE;
      const zoned = new TZDate(startsAt.getTime(), 'Europe/Madrid');
      const dayOfWeek = zoned.getDay();
      const timeStr = format(zoned, 'HH:mm');
      const allowed = effectiveTimetable[dayOfWeek] || [];
      if (!allowed.includes(timeStr)) {
        throw new BadRequestException(
          'Ese horario no corresponde a los turnos oficiales de Hatha Yoga Terapéutico (Martes 9:45, 11:15, 17:00, 18:30, 20:00; Miércoles 20:15; Jueves 9:45, 11:15, 16:30, 17:30, 19:00).',
        );
      }

      if (dto.contactId) {
        const isTwoClasses = /2\s*clases|dos\s*clases/i.test(cleanServiceName);
        const maxAllowed = isTwoClasses ? 2 : 1;
        const weekStart = startOfWeek(startsAt, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(startsAt, { weekStartsOn: 1 });
        const existingThisWeek = await this.appointmentsRepo.find({
          where: {
            contactId: dto.contactId,
            status: In([AppointmentStatus.SCHEDULED, AppointmentStatus.PENDING_APPROVAL]),
            startsAt: Between(weekStart, weekEnd),
          },
        });
        const hathaExisting = existingThisWeek.filter((a) => {
          if (!/yoga/i.test(a.service)) return false;
          const z = new TZDate(new Date(a.startsAt).getTime(), 'Europe/Madrid');
          return effectiveTimetable[z.getDay()]?.includes(format(z, 'HH:mm'));
        });
        if (hathaExisting.length >= maxAllowed) {
          throw new BadRequestException(
            maxAllowed === 1
              ? 'Ya tienes una clase de Hatha Yoga agendada para esa semana en la modalidad de 1 clase semanal.'
              : 'Ya tienes 2 clases de Hatha Yoga agendadas para esa semana en la modalidad de 2 clases semanales.',
          );
        }
      }
    }

    const calendarId = dto.calendarId || serviceEntity?.calendarId || 'default';
    const serviceName = dto.service || serviceEntity?.name || 'General';
    const serviceId =
      serviceEntity?.id ?? (dto.serviceId && UUID_REGEX.test(dto.serviceId) ? dto.serviceId : null);
    const price = dto.price !== undefined ? dto.price : (serviceEntity?.price ?? null);
    const defaultStatus = serviceEntity?.requiresApproval
      ? AppointmentStatus.PENDING_APPROVAL
      : AppointmentStatus.SCHEDULED;
    const status = dto.status ?? defaultStatus;

    // Resolve modality (in_person, phone, virtual)
    const allowed = serviceEntity?.allowedModalities?.length
      ? serviceEntity.allowedModalities
      : ['in_person'];
    let modality = dto.modality || allowed[0] || 'in_person';
    if (dto.modality && !allowed.includes(dto.modality)) {
      // Fall back or accept if not strictly configured
      modality = dto.modality;
    }

    const reason = dto.reason || null;
    let calBookingId: string | null = null;
    let calBookingUid: string | null = null;
    let calMeetingUrl: string | null = null;
    let calStatus: string | null = null;

    // Load contact info for virtual meeting synchronization
    const contact = await this.contactsRepo.findOne({ where: { id: dto.contactId } });

    // Sincronización automática con Cal.com para citas virtuales (solo si ya está confirmada / no requiere aprobación)
    if (modality === 'virtual' && contact && status !== AppointmentStatus.PENDING_APPROVAL) {
      try {
        const calResult = await this.calcomService.createBooking({
          startsAt,
          endsAt,
          serviceName,
          contact: {
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
          },
          managerEmail: serviceEntity?.manager?.email || null,
          managerName: serviceEntity?.manager?.name || null,
          reason,
          eventTypeId: serviceEntity?.calEventTypeId,
        });

        calBookingId = calResult.bookingId;
        calBookingUid = calResult.bookingUid;
        calMeetingUrl = calResult.meetingUrl;
        calStatus = calResult.status;
      } catch (err: any) {
        // Log but don't fail appointment creation
        console.error('Cal.com booking creation error:', err);
      }
    }

    // Check if the contact already has an existing pending_approval appointment for this service/calendar
    // (e.g. they are rescheduling or agreeing to an alternative time)
    let existingPending: Appointment | null = null;
    if (dto.contactId) {
      existingPending = await this.appointmentsRepo.findOne({
        where: [
          {
            contactId: dto.contactId,
            status: AppointmentStatus.PENDING_APPROVAL,
            serviceId: serviceId || undefined,
          },
          {
            contactId: dto.contactId,
            status: AppointmentStatus.PENDING_APPROVAL,
            calendarId,
          },
          {
            contactId: dto.contactId,
            status: AppointmentStatus.PENDING_APPROVAL,
          },
        ],
        order: { createdAt: 'DESC' },
      });
    }

    // Serialize the "is the slot free? then book it" sequence so two concurrent
    // requests can't both claim the same slot.
    const saved = await this.appointmentsRepo.manager.transaction(
      async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock($1)', [
          BOOKING_LOCK_KEY,
        ]);
        const repo = manager.getRepository(Appointment);
        const excludeId = existingPending?.id;
        await this.checkOverlap(repo, startsAt, endsAt, excludeId, calendarId, serviceId, serviceName, dto.contactId);

        if (existingPending) {
          existingPending.startsAt = startsAt;
          existingPending.endsAt = endsAt;
          existingPending.service = serviceName;
          existingPending.serviceId = serviceId;
          existingPending.calendarId = calendarId;
          existingPending.price = price;
          existingPending.modality = modality;
          existingPending.reason = reason || existingPending.reason;
          existingPending.status = AppointmentStatus.PENDING_APPROVAL;
          return repo.save(existingPending);
        }

        const appt = repo.create({
          ...dto,
          service: serviceName,
          serviceId,
          calendarId,
          price,
          status,
          startsAt,
          endsAt,
          modality,
          reason,
          calBookingId,
          calBookingUid,
          calMeetingUrl,
          calStatus,
          responseDocument: (dto.responseDocument as any) || null,
        });
        return repo.save(appt);
      },
    );

    const withContact = await this.findOne(saved.id);
    this.eventEmitter.emit('appointment.created', withContact);

    // Notify student via Email and WhatsApp
    const managerName = serviceEntity?.manager?.name || 'Centro de Yoga Salvadora Conesa';
    if (saved.status === AppointmentStatus.SCHEDULED) {
      this.notifyStudentDecision(withContact, 'accepted', managerName).catch((err) => {
        this.logger.error(`Error notifying student on accepted appointment: ${err}`);
      });
    } else if (saved.status === AppointmentStatus.PENDING_APPROVAL) {
      this.notifyStudentDecision(withContact, 'pending_approval', managerName).catch((err) => {
        this.logger.error(`Error notifying student on pending_approval appointment: ${err}`);
      });
    }

    return withContact;
  }

  async update(id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const appt = await this.findOne(id);

    const newStart = dto.startsAt ? new Date(parseFlexibleStartsAt(dto.startsAt)) : appt.startsAt;
    const newEnd = dto.endsAt ? new Date(parseFlexibleStartsAt(dto.endsAt)) : appt.endsAt;
    const timeChanged = Boolean(dto.startsAt || dto.endsAt);

    if (timeChanged) {
      this.assertValidWindow(newStart, newEnd, { mustBeFuture: false });
      appt.startsAt = newStart;
      appt.endsAt = newEnd;
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (dto.serviceId !== undefined) {
      appt.serviceId = dto.serviceId && UUID_REGEX.test(dto.serviceId) ? dto.serviceId : null;
      if (dto.serviceId && UUID_REGEX.test(dto.serviceId)) {
        const svc = await this.servicesRepo.findOne({ where: { id: dto.serviceId } }).catch(() => null);
        if (svc) {
          appt.service = svc.name;
          if (dto.calendarId === undefined) appt.calendarId = svc.calendarId;
          if (dto.price === undefined && svc.price) appt.price = svc.price;
        }
      }
    }
    if (dto.service) appt.service = dto.service;
    if (dto.calendarId !== undefined) appt.calendarId = dto.calendarId || 'default';
    if (dto.notes !== undefined) appt.notes = dto.notes || null;
    if (dto.modality !== undefined) appt.modality = dto.modality;
    if (dto.reason !== undefined) appt.reason = dto.reason || null;
    if (dto.calMeetingUrl !== undefined) appt.calMeetingUrl = dto.calMeetingUrl || null;
    if (dto.responseDocument !== undefined) appt.responseDocument = (dto.responseDocument as any) || null;

    if (dto.price !== undefined) {
      appt.price = dto.price === '' ? null : dto.price;
    }

    if (dto.status && dto.status !== appt.status) {
      appt.status = dto.status;
      if (dto.status === AppointmentStatus.CANCELLED) {
        appt.cancelledAt = appt.cancelledAt ?? new Date();
        appt.cancelledBy = appt.cancelledBy ?? 'system';
      }
    }

    const calendarId = dto.calendarId || appt.calendarId || 'default';
    const serviceId = appt.serviceId;

    if (timeChanged && appt.status !== AppointmentStatus.CANCELLED) {
      const saved = await this.appointmentsRepo.manager.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock($1)', [
          BOOKING_LOCK_KEY,
        ]);
        const repo = manager.getRepository(Appointment);
        await this.checkOverlap(repo, newStart, newEnd, appt.id, calendarId, serviceId, appt.service, appt.contactId);
        return repo.save(appt);
      });
      const withContact = await this.findOne(saved.id);
      this.eventEmitter.emit('appointment.created', withContact);
      // Enviar confirmación por email con el nuevo horario reprogramado
      this.notifyStudentDecision(withContact, 'accepted', 'Centro de Yoga Salvadora Conesa').catch(() => null);
      return withContact;
    }

    const updated = await this.appointmentsRepo.save(appt);
    this.eventEmitter.emit('appointment.created', updated);
    return updated;
  }

  /** Save response document (diagnosis / session outcome / medical report) */
  async saveResponseDocument(
    id: string,
    docData: {
      templateKey: string;
      title: string;
      symptoms?: string;
      diagnosis?: string;
      treatment?: string;
      recommendations?: string;
      notes?: string;
      customFields?: Record<string, string>;
      markCompleted?: boolean;
      acceptAndSave?: boolean;
    },
    signedByName: string,
  ): Promise<Appointment> {
    let appt = await this.findOne(id);

    // If appointment is pending_approval and doc is being accepted/completed, run accept flow first
    if (appt.status === AppointmentStatus.PENDING_APPROVAL || docData.acceptAndSave) {
      appt = await this.accept(id, signedByName);
    }

    appt.responseDocument = {
      templateKey: docData.templateKey || 'clinical_diagnosis',
      title: docData.title || 'Informe de Consulta / Diagnóstico',
      symptoms: docData.symptoms,
      diagnosis: docData.diagnosis,
      treatment: docData.treatment,
      recommendations: docData.recommendations,
      notes: docData.notes,
      customFields: docData.customFields,
      issuedAt: new Date().toISOString(),
      signedBy: signedByName,
    };

    if (docData.markCompleted !== false && appt.status !== AppointmentStatus.CANCELLED) {
      appt.status = AppointmentStatus.COMPLETED;
    }

    // Generate and store PDF BLOB
    try {
      const pdfBuffer = await generateDoctorReportPdfBuffer({
        patientName: appt.contact?.name || 'Paciente',
        patientPhone: appt.contact?.phone || undefined,
        patientEmail: appt.contact?.email || undefined,
        serviceName: appt.service,
        startsAt: appt.startsAt,
        endsAt: appt.endsAt,
        templateKey: appt.responseDocument.templateKey,
        title: appt.responseDocument.title,
        symptoms: appt.responseDocument.symptoms,
        diagnosis: appt.responseDocument.diagnosis,
        treatment: appt.responseDocument.treatment,
        recommendations: appt.responseDocument.recommendations,
        notes: appt.responseDocument.notes,
        issuedAt: appt.responseDocument.issuedAt,
        signedBy: appt.responseDocument.signedBy,
      });
      appt.doctorReportPdf = pdfBuffer;
      const safePatientName = (appt.contact?.name || 'paciente')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-');
      appt.doctorReportPdfName = `informe-${safePatientName}-${new Date().toISOString().slice(0, 10)}.pdf`;
      appt.doctorReportPdfMime = 'application/pdf';
      appt.doctorReportPdfSize = pdfBuffer.length;
    } catch (err) {
      this.logger.warn(`Could not generate PDF for appointment ${id}: ${err}`);
    }

    const saved = await this.appointmentsRepo.save(appt);
    this.eventEmitter.emit('appointment.created', saved);
    return saved;
  }

  async getDoctorReportPdf(id: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const appt = await this.appointmentsRepo
      .createQueryBuilder('a')
      .addSelect('a.doctorReportPdf')
      .leftJoinAndSelect('a.contact', 'contact')
      .where('a.id = :id', { id })
      .getOne();

    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (!appt.doctorReportPdf) {
      // If responseDocument exists but PDF wasn't generated yet, generate on the fly
      if (appt.responseDocument) {
        const buffer = await generateDoctorReportPdfBuffer({
          patientName: appt.contact?.name || 'Paciente',
          patientPhone: appt.contact?.phone || undefined,
          patientEmail: appt.contact?.email || undefined,
          serviceName: appt.service,
          startsAt: appt.startsAt,
          endsAt: appt.endsAt,
          templateKey: appt.responseDocument.templateKey,
          title: appt.responseDocument.title,
          symptoms: appt.responseDocument.symptoms,
          diagnosis: appt.responseDocument.diagnosis,
          treatment: appt.responseDocument.treatment,
          recommendations: appt.responseDocument.recommendations,
          notes: appt.responseDocument.notes,
          issuedAt: appt.responseDocument.issuedAt,
          signedBy: appt.responseDocument.signedBy,
        });
        appt.doctorReportPdf = buffer;
        const safePatientName = (appt.contact?.name || 'paciente').toLowerCase().replace(/[^a-z0-9]/g, '-');
        appt.doctorReportPdfName = `informe-${safePatientName}-${new Date().toISOString().slice(0, 10)}.pdf`;
        appt.doctorReportPdfMime = 'application/pdf';
        appt.doctorReportPdfSize = buffer.length;
        await this.appointmentsRepo.save(appt);
        return {
          buffer,
          filename: appt.doctorReportPdfName,
          mimeType: 'application/pdf',
        };
      }
      throw new NotFoundException('Esta cita no tiene informe médico generado');
    }

    return {
      buffer: appt.doctorReportPdf,
      filename: appt.doctorReportPdfName || 'informe-medico.pdf',
      mimeType: appt.doctorReportPdfMime || 'application/pdf',
    };
  }

  async savePatientAttachment(
    id: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ): Promise<Appointment> {
    const appt = await this.findOne(id);
    appt.patientAttachmentData = file.buffer;
    appt.patientAttachmentName = file.originalname;
    appt.patientAttachmentMime = file.mimetype;
    appt.patientAttachmentSize = file.size;
    appt.patientAttachmentUploadedAt = new Date();

    const saved = await this.appointmentsRepo.save(appt);
    this.eventEmitter.emit('appointment.created', saved);
    return saved;
  }

  async getPatientAttachment(id: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const appt = await this.appointmentsRepo
      .createQueryBuilder('a')
      .addSelect('a.patientAttachmentData')
      .where('a.id = :id', { id })
      .getOne();

    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (!appt.patientAttachmentData) {
      throw new NotFoundException('Esta cita no tiene documentos adjuntos del paciente');
    }

    return {
      buffer: appt.patientAttachmentData,
      filename: appt.patientAttachmentName || 'adjunto-paciente',
      mimeType: appt.patientAttachmentMime || 'application/octet-stream',
    };
  }

  async deletePatientAttachment(id: string): Promise<Appointment> {
    const appt = await this.findOne(id);
    appt.patientAttachmentData = null;
    appt.patientAttachmentName = null;
    appt.patientAttachmentMime = null;
    appt.patientAttachmentSize = null;
    appt.patientAttachmentUploadedAt = null;

    const saved = await this.appointmentsRepo.save(appt);
    this.eventEmitter.emit('appointment.created', saved);
    return saved;
  }

  // ─── AI Image Analysis & Cropping (analizaia) ───

  /** Executes AI evaluation on a cropped image without requiring a saved appointment */
  async analyzeImageStandalone(dto: RunAiAnalysisDto): Promise<AiAnalysisResponse> {
    const cleanBase64 = dto.imageBase64.replace(/^data:.*,/, '');
    const imageBuffer = Buffer.from(cleanBase64, 'base64');
    return this.analizaIaService.analyze({
      modality: dto.modality,
      imageBuffer,
      mimeType: dto.mimeType || 'image/jpeg',
      notes: dto.notes,
      patientName: dto.patientName,
    });
  }

  /** Executes AI analysis and persists the cropped image + findings on the appointment */
  async runAiAnalysisOnAppointment(
    id: string,
    dto: RunAiAnalysisDto,
  ): Promise<{ appointment: Appointment; analysis: AiAnalysisResponse }> {
    const appt = await this.findOne(id);
    const cleanBase64 = dto.imageBase64.replace(/^data:.*,/, '');
    const imageBuffer = Buffer.from(cleanBase64, 'base64');

    const analysis = await this.analizaIaService.analyze({
      modality: dto.modality,
      imageBuffer,
      mimeType: dto.mimeType || 'image/jpeg',
      notes: dto.notes || appt.reason || undefined,
      patientName: dto.patientName || appt.contact?.name,
    });

    appt.aiAnalysisType = dto.modality;
    appt.aiAnalysisResult = analysis.analysisText;
    appt.aiAnalysisDate = new Date();
    appt.aiCroppedImageData = imageBuffer;
    appt.aiCroppedImageMime = dto.mimeType || 'image/jpeg';

    const saved = await this.appointmentsRepo.save(appt);
    this.eventEmitter.emit('appointment.created', saved);

    return { appointment: saved, analysis };
  }

  /** Retrieves the cropped image analyzed by AI */
  async getAiCroppedImage(id: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const appt = await this.appointmentsRepo
      .createQueryBuilder('a')
      .addSelect('a.aiCroppedImageData')
      .where('a.id = :id', { id })
      .getOne();

    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (!appt.aiCroppedImageData) {
      throw new NotFoundException('Esta cita no tiene imagen analizada por IA');
    }

    return {
      buffer: appt.aiCroppedImageData,
      mimeType: appt.aiCroppedImageMime || 'image/jpeg',
    };
  }

  /** Accept an appointment (responsible manager approval) */
  async accept(id: string, acceptedBy: string): Promise<Appointment> {
    const appt = await this.findOne(id);
    const wasAlreadyAccepted = appt.status === AppointmentStatus.SCHEDULED && !!appt.acceptedAt;

    appt.status = AppointmentStatus.SCHEDULED;
    appt.acceptedAt = new Date();
    appt.acceptedBy = acceptedBy;

    // Resolve service entity and manager
    let serviceEntity: Service | null = null;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (appt.serviceId && UUID_REGEX.test(appt.serviceId)) {
      serviceEntity = await this.servicesRepo
        .findOne({
          where: { id: appt.serviceId },
          relations: ['manager'],
        })
        .catch(() => null);
    }
    if (!serviceEntity && appt.service) {
      serviceEntity = await this.servicesRepo
        .findOne({
          where: { name: appt.service },
          relations: ['manager'],
        })
        .catch(() => null);
    }

    // Cal.com sync upon approval if virtual and not yet generated
    if (appt.modality === 'virtual' && !appt.calMeetingUrl && appt.contact) {
      try {
        const calResult = await this.calcomService.createBooking({
          startsAt: appt.startsAt,
          endsAt: appt.endsAt,
          serviceName: appt.service,
          contact: {
            name: appt.contact.name,
            phone: appt.contact.phone,
            email: appt.contact.email,
          },
          managerEmail: serviceEntity?.manager?.email || null,
          managerName: serviceEntity?.manager?.name || acceptedBy || null,
          reason: appt.reason,
          eventTypeId: serviceEntity?.calEventTypeId,
        });

        appt.calBookingId = calResult.bookingId;
        appt.calBookingUid = calResult.bookingUid;
        appt.calMeetingUrl = calResult.meetingUrl;
        appt.calStatus = calResult.status;
      } catch (err) {
        this.logger.error(`Error syncing with Cal.com on approval: ${err}`);
      }
    }

    const saved = await this.appointmentsRepo.save(appt);
    this.eventEmitter.emit('appointment.created', saved);

    // Notify student via Email and/or WhatsApp only if this is the first time it is accepted
    if (!wasAlreadyAccepted) {
      await this.notifyStudentDecision(
        saved,
        'accepted',
        serviceEntity?.manager?.name || acceptedBy || 'Jose Ignacio Gomez Raya',
      );
    }

    return saved;
  }

  /** Reject an appointment (responsible manager rejection) */
  async reject(
    id: string,
    rejectedBy: string,
    reason?: string,
    requestReschedule?: boolean,
    proposedTimes?: string,
  ): Promise<Appointment> {
    const defaultReason =
      reason ||
      (requestReschedule
        ? 'El horario solicitado no está disponible. Por favor, indícanos otra fecha u horario.'
        : 'No disponible en ese horario.');

    let appt: Appointment;
    if (requestReschedule) {
      // Keep appointment in PENDING_APPROVAL status so it remains visible as pending in the calendar and CRM
      appt = await this.findOne(id);
      appt.status = AppointmentStatus.PENDING_APPROVAL;
      const notePrefix = proposedTimes
        ? `[Propuesta de cambio de fecha enviada: ${proposedTimes}]`
        : `[Petición de nueva fecha enviada: ${defaultReason}]`;
      appt.reason = `${notePrefix} ${appt.reason || ''}`.trim();
      appt = await this.appointmentsRepo.save(appt);
      this.eventEmitter.emit('appointment.created', appt);
    } else {
      // Definite rejection -> cancelled
      appt = await this.cancel(id, rejectedBy, defaultReason);
    }

    let serviceEntity: Service | null = null;
    if (appt.service) {
      serviceEntity = await this.servicesRepo
        .findOne({
          where: { name: appt.service },
          relations: ['manager'],
        })
        .catch(() => null);
    }

    // Notify student via Email and/or WhatsApp and update conversation thread
    await this.notifyStudentDecision(
      appt,
      requestReschedule ? 'reschedule_requested' : 'rejected',
      serviceEntity?.manager?.name || rejectedBy || 'Jose Ignacio Gomez Raya',
      defaultReason,
      proposedTimes,
    );

    return appt;
  }

  private async notifyStudentDecision(
    appt: Appointment,
    decision: 'accepted' | 'rejected' | 'reschedule_requested' | 'cancelled' | 'pending_approval',
    managerName: string,
    rejectionReason?: string,
    proposedTimes?: string,
  ): Promise<void> {
    try {
      const contact =
        appt.contact ||
        (await this.contactsRepo.findOne({ where: { id: appt.contactId } }));
      if (!contact) {
        this.logger.warn(`[Email] No contact found for appointment ${appt.id}. Skipping notifications.`);
        return;
      }

      // Load serviceEntity for full details, description, reminderNotes and manager info
      let serviceEntity: Service | null = null;
      if (appt.serviceId) {
        serviceEntity = await this.servicesRepo
          .findOne({
            where: { id: appt.serviceId },
            relations: ['manager'],
          })
          .catch(() => null);
      }
      if (!serviceEntity && appt.service) {
        serviceEntity = await this.servicesRepo
          .findOne({
            where: { name: appt.service },
            relations: ['manager'],
          })
          .catch(() => null);
        if (!serviceEntity) {
          serviceEntity = await this.servicesRepo
            .findOne({
              where: { name: ILike(`%${appt.service}%`) },
              relations: ['manager'],
            })
            .catch(() => null);
        }
      }

      const effectiveManager =
        serviceEntity?.manager?.name || managerName || 'Jose Ignacio Gomez Raya';

      const startsAtDate = new Date(appt.startsAt);
      const endsAtDate = appt.endsAt ? new Date(appt.endsAt) : null;
      const formattedDate = startsAtDate.toLocaleDateString('es-ES', {
        timeZone: 'Europe/Madrid',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const formattedStartTime = startsAtDate.toLocaleTimeString('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
      });
      const formattedEndTime = endsAtDate
        ? endsAtDate.toLocaleTimeString('es-ES', {
            timeZone: 'Europe/Madrid',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      const formattedTime = formattedEndTime
        ? `${formattedStartTime} a ${formattedEndTime}`
        : formattedStartTime;

      const isVirtual = appt.modality === 'virtual';
      const modalityText = isVirtual
        ? 'Online (Videollamada)'
        : 'Presencial en el centro';

      let chatMessageText = '';

      if (decision === 'pending_approval') {
        const subject = `📋 Solicitud de cita recibida: ${appt.service} - ${formattedDate}`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; padding: 24px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 1px solid #f3f4f6; padding-bottom: 16px;">
              <h2 style="color: #2563eb; margin: 0; font-size: 22px;">Solicitud de Cita Recibida</h2>
              <p style="margin: 6px 0 0 0; color: #6b7280; font-size: 14px;">Centro de Yoga Salvadora Conesa & Club Social Parque Granada</p>
            </div>
            
            <p style="font-size: 15px;">Hola <strong>${contact.name || 'Alumno'}</strong>,</p>
            <p style="font-size: 14px; color: #374151;">Hemos recibido correctamente tu solicitud de cita para <strong>${appt.service}</strong>.</p>
            
            <div style="background-color: #eff6ff; border: 1px solid #dbeafe; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 6px 0; color: #1e40af;">📌 <strong>Servicio / Actividad:</strong> ${appt.service}</p>
              <p style="margin: 6px 0; color: #1e40af;">📅 <strong>Fecha solicitada:</strong> ${formattedDate}</p>
              <p style="margin: 6px 0; color: #1e40af;">⏰ <strong>Horario:</strong> ${formattedTime}</p>
              <p style="margin: 6px 0; color: #1e40af;">👤 <strong>Terapeuta / Profesor:</strong> ${effectiveManager}</p>
              <p style="margin: 6px 0; color: #1e40af;">⏳ <strong>Estado:</strong> Pendiente de confirmación del profesor</p>
            </div>

            <p style="font-size: 14px; color: #374151;">Esta sesión requiere coordinación previa de agenda con el profesor (<strong>${effectiveManager}</strong>). En cuanto el profesor revise y confirme tu solicitud, recibirás un nuevo correo con la confirmación definitiva.</p>

            <p style="font-size: 13px; color: #6b7280; margin-top: 20px; border-top: 1px solid #f3f4f6; padding-top: 14px;">Para cualquier consulta, puedes responder a este correo o escribirnos por WhatsApp al <strong>695 172 625</strong>.</p>
            <p style="margin-top: 12px; font-weight: bold; color: #374151;">¡Muchas gracias!</p>
          </div>
        `;

        chatMessageText = `¡Hola ${contact.name || ''}! Hemos recibido tu solicitud para *${appt.service}* el *${formattedDate}* a las *${formattedTime}*. Se encuentra pendiente de confirmación por el profesor (${effectiveManager}). En cuanto se confirme recibirás los detalles.`;

        if (contact.email) {
          this.logger.log(`[Email] Sending pending_approval email to ${contact.email} for appt ${appt.id}...`);
          const res = await this.emailService
            .sendNotification(
              contact.email,
              contact.name,
              subject,
              emailHtml,
              chatMessageText,
              undefined,
              contact.id,
            )
            .catch((err) => {
              this.logger.error(`[Email] Error sending pending_approval email to ${contact.email}: ${err}`);
              return { ok: false, error: String(err) };
            });
          this.logger.log(`[Email] Result for ${contact.email}: ${JSON.stringify(res)}`);
        } else {
          this.logger.warn(`[Email] Contact ${contact.id} (${contact.name}) has NO email. Cannot send pending_approval notification.`);
        }
      } else if (decision === 'accepted') {
        const subject = `✅ Confirmación de tu cita: ${appt.service} - ${formattedDate}`;

        const reminderSectionHtml = serviceEntity?.reminderNotes
          ? `
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; margin: 18px 0;">
              <p style="margin: 0; color: #92400e; font-weight: bold; font-size: 14px;">💡 Recordatorio y recomendaciones:</p>
              <p style="margin: 6px 0 0 0; color: #78350f; font-size: 13px; line-height: 1.5;">${serviceEntity.reminderNotes}</p>
            </div>
          `
          : '';

        const locationHtml = isVirtual
          ? `
            <p style="margin: 6px 0;">📍 <strong>Modalidad:</strong> Online (Videollamada)</p>
            ${
              appt.calMeetingUrl
                ? `<div style="margin: 12px 0 8px 0;">
                     <a href="${appt.calMeetingUrl}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 14px;">🎥 Acceder a la Videollamada</a>
                   </div>
                   <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">Enlace de acceso: <a href="${appt.calMeetingUrl}" style="color: #2563eb;">${appt.calMeetingUrl}</a></p>
                   <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">(Por favor, conéctate 5 minutos antes con cámara y micrófono activados).</p>`
                : ''
            }
          `
          : `
            <p style="margin: 6px 0;">📍 <strong>Modalidad:</strong> Presencial en el centro</p>
            <p style="margin: 6px 0;">🏢 <strong>Ubicación:</strong> Club Social Parque Granada (Escuela Salvadora Conesa), Calle Holanda 1, 28942 Fuenlabrada, Madrid</p>
          `;

        const serviceDescHtml = serviceEntity?.description
          ? `<p style="margin: 8px 0; font-size: 13px; color: #4b5563; line-height: 1.4;"><strong>Detalles de la sesión / actividad:</strong> ${serviceEntity.description}</p>`
          : '';

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; padding: 24px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 1px solid #f3f4f6; padding-bottom: 16px;">
              <h2 style="color: #10b981; margin: 0; font-size: 22px;">¡Tu cita está confirmada!</h2>
              <p style="margin: 6px 0 0 0; color: #6b7280; font-size: 14px;">Centro de Yoga Salvadora Conesa & Club Social Parque Granada</p>
            </div>
            
            <p style="font-size: 15px;">Hola <strong>${contact.name || 'Alumno'}</strong>,</p>
            <p style="font-size: 14px; color: #374151;">Nos complace confirmarte que tu reserva para <strong>${appt.service}</strong> ha quedado formalizada.</p>
            
            <div style="background-color: #f9fafb; border: 1px solid #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 6px 0;">📌 <strong>Servicio / Actividad:</strong> ${appt.service}</p>
              ${serviceDescHtml}
              <p style="margin: 6px 0;">📅 <strong>Fecha:</strong> ${formattedDate}</p>
              <p style="margin: 6px 0;">⏰ <strong>Horario:</strong> ${formattedTime}</p>
              ${locationHtml}
              <p style="margin: 6px 0;">👤 <strong>Responsable / Terapeuta:</strong> ${effectiveManager}</p>
              ${
                appt.price
                  ? `<p style="margin: 6px 0;">💶 <strong>Importe:</strong> ${appt.price} €</p>`
                  : ''
              }
            </div>

            ${reminderSectionHtml}

            <p style="font-size: 13px; color: #6b7280; margin-top: 20px; border-top: 1px solid #f3f4f6; padding-top: 14px;">Si necesitas consultar, cancelar o cambiar cualquier detalle, puedes responder directamente a este correo o escribirnos por WhatsApp al <strong>695 172 625</strong>.</p>
            <p style="margin-top: 12px; font-weight: bold; color: #374151;">¡Te esperamos!</p>
          </div>
        `;

        const reminderWhatsApp = serviceEntity?.reminderNotes
          ? `\n\n💡 *Recordatorio y preparación:* ${serviceEntity.reminderNotes}`
          : '';
        const locationWhatsApp = isVirtual
          ? `Online por Videollamada${appt.calMeetingUrl ? `\n🔗 *Enlace directo:* ${appt.calMeetingUrl}` : ''}`
          : 'Presencial en Club Social Parque Granada (C/ Holanda 1, Fuenlabrada)';

        chatMessageText = `¡Hola ${contact.name || ''}! Te confirmamos que tu cita para *${appt.service}* ha quedado formalizada.\n\n📅 *Fecha:* ${formattedDate}\n⏰ *Hora:* ${formattedTime}\n📍 *Modalidad:* ${locationWhatsApp}\n👤 *Responsable:* ${effectiveManager}${reminderWhatsApp}\n\n¡Muchas gracias y nos vemos pronto!`;

        if (contact.email) {
          this.logger.log(`[Email] Sending accepted confirmation email to ${contact.email} for appt ${appt.id}...`);
          const res = await this.emailService
            .sendNotification(
              contact.email,
              contact.name,
              subject,
              emailHtml,
              chatMessageText,
              undefined,
              contact.id,
            )
            .catch((err) => {
              this.logger.error(`[Email] Error sending accepted email to ${contact.email}: ${err}`);
              return { ok: false, error: String(err) };
            });
          this.logger.log(`[Email] Result for ${contact.email}: ${JSON.stringify(res)}`);
        } else {
          this.logger.warn(`[Email] Contact ${contact.id} (${contact.name}) has NO email. Cannot send accepted confirmation email.`);
        }

        if (contact.phone) {
          const config = await this.agentsConfigService
            .findByKey('booking')
            .catch(() => null);
          const fromNumber =
            config?.whatsappPhoneNumber ||
            process.env.YCLOUD_FROM_PHONE ||
            '+34600000000';
          await this.ycloudClient
            .sendTextMessage(
              fromNumber,
              contact.phone,
              chatMessageText,
              config?.ycloudApiKey,
            )
            .catch(() => null);
        }
      } else if (decision === 'reschedule_requested') {
        const reasonText =
          rejectionReason ||
          'El horario solicitado no está disponible en este momento.';
        const subject = `🔄 Solicitud de otra fecha para tu cita de ${appt.service}`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
            <h2 style="color: #f59e0b; margin-top: 0;">Solicitud de otra fecha / horario</h2>
            <p>Hola <strong>${contact.name}</strong>,</p>
            <p>Para tu solicitud de cita de <strong>${appt.service}</strong> prevista para el <strong>${formattedDate}</strong> a las <strong>${formattedTime}</strong>, el terapeuta/profesor responsable (<strong>${managerName}</strong>) te solicita elegir otra fecha u horario alternativo.</p>
            <p><strong>Motivo:</strong> ${reasonText}</p>
            ${
              proposedTimes
                ? `<p><strong>Propuesta de horarios alternativos:</strong> ${proposedTimes}</p>`
                : ''
            }
            <p>Por favor, responde a este correo o por WhatsApp indicándonos qué otro día y hora te vendría bien para reservarte la plaza.</p>
            <p>Disculpa las molestias y muchas gracias por tu flexibilidad.</p>
          </div>
        `;

        chatMessageText = `Hola ${contact.name}. Para tu solicitud de *${appt.service}* el *${formattedDate}* a las *${formattedTime}*, el terapeuta/responsable (${managerName}) te solicita cambiar de fecha u horario.\n\n*Motivo:* ${reasonText}${proposedTimes ? `\n*Horarios sugeridos:* ${proposedTimes}` : ''}\n\nPor favor, responde a este mensaje indicándome qué otro día y hora te vendría mejor para intentar formalizarla.`;

        if (contact.email) {
          await this.emailService
            .sendNotification(
              contact.email,
              contact.name,
              subject,
              emailHtml,
              chatMessageText,
              undefined,
              contact.id,
            )
            .catch(() => null);
        }

        if (contact.phone) {
          const config = await this.agentsConfigService
            .findByKey('booking')
            .catch(() => null);
          const fromNumber =
            config?.whatsappPhoneNumber ||
            process.env.YCLOUD_FROM_PHONE ||
            '+34600000000';
          await this.ycloudClient
            .sendTextMessage(
              fromNumber,
              contact.phone,
              chatMessageText,
              config?.ycloudApiKey,
            )
            .catch(() => null);
        }
      } else if (decision === 'cancelled') {
        const reasonText =
          rejectionReason || appt.cancellationReason || 'Cancelación solicitada por el alumno o por el centro.';
        const subject = `❌ Cancelación de tu cita: ${appt.service} - ${formattedDate}`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; padding: 24px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 1px solid #f3f4f6; padding-bottom: 16px;">
              <h2 style="color: #ef4444; margin: 0; font-size: 22px;">Cita Cancelada</h2>
              <p style="margin: 6px 0 0 0; color: #6b7280; font-size: 14px;">Centro de Yoga Salvadora Conesa & Club Social Parque Granada</p>
            </div>
            
            <p style="font-size: 15px;">Hola <strong>${contact.name || 'Alumno'}</strong>,</p>
            <p style="font-size: 14px; color: #374151;">Te confirmamos que tu cita para <strong>${appt.service}</strong> ha sido cancelada correctamente.</p>
            
            <div style="background-color: #fef2f2; border: 1px solid #fee2e2; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 6px 0; color: #991b1b;">📌 <strong>Servicio / Actividad:</strong> ${appt.service}</p>
              <p style="margin: 6px 0; color: #991b1b;">📅 <strong>Fecha anulada:</strong> ${formattedDate}</p>
              <p style="margin: 6px 0; color: #991b1b;">⏰ <strong>Horario:</strong> ${formattedTime}</p>
              <p style="margin: 6px 0; color: #991b1b;">📝 <strong>Motivo de cancelación:</strong> ${reasonText}</p>
            </div>

            <p style="font-size: 13px; color: #6b7280; margin-top: 20px; border-top: 1px solid #f3f4f6; padding-top: 14px;">Si deseas volver a reservar plaza o consultar nuevos horarios, puedes responder a este correo o escribirnos por WhatsApp al <strong>695 172 625</strong>.</p>
            <p style="margin-top: 12px; font-weight: bold; color: #374151;">¡Esperamos verte pronto!</p>
          </div>
        `;

        chatMessageText = `Hola ${contact.name || ''}. Te confirmamos que tu cita para *${appt.service}* del *${formattedDate}* a las *${formattedTime}* ha sido cancelada.\n\n📝 *Motivo:* ${reasonText}\n\nSi deseas reprogramar o reservar en otro horario, indícanoslo y te ayudamos encantados.`;

        if (contact.email) {
          await this.emailService
            .sendNotification(
              contact.email,
              contact.name,
              subject,
              emailHtml,
              chatMessageText,
              undefined,
              contact.id,
            )
            .catch(() => null);
        }

        if (contact.phone) {
          const config = await this.agentsConfigService
            .findByKey('booking')
            .catch(() => null);
          const fromNumber =
            config?.whatsappPhoneNumber ||
            process.env.YCLOUD_FROM_PHONE ||
            '+34600000000';
          await this.ycloudClient
            .sendTextMessage(
              fromNumber,
              contact.phone,
              chatMessageText,
              config?.ycloudApiKey,
            )
            .catch(() => null);
        }
      } else {
        const reasonText =
          rejectionReason ||
          'El horario solicitado no está disponible en este momento.';
        const subject = `Información sobre tu solicitud de cita de ${appt.service}`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
            <h2 style="color: #ef4444; margin-top: 0;">Solicitud de cita no confirmada</h2>
            <p>Hola <strong>${contact.name}</strong>,</p>
            <p>Lamentamos comunicarte que tu solicitud de cita para <strong>${appt.service}</strong> el <strong>${formattedDate}</strong> a las <strong>${formattedTime}</strong> no ha podido ser confirmada por el responsable (<strong>${managerName}</strong>).</p>
            <p><strong>Motivo:</strong> ${reasonText}</p>
            <p>Por favor, responde a este mensaje o visita nuestra web para seleccionar otro día u hora que te venga bien.</p>
            <p>Disculpa las molestias.</p>
          </div>
        `;

        chatMessageText = `Hola ${contact.name}. Lamentamos comunicarte que tu solicitud para *${appt.service}* el *${formattedDate}* a las *${formattedTime}* no ha podido ser confirmada.\n\nMotivo: ${reasonText}\n\nPor favor, indícanos si deseas consultar otro día u horario para agendarla.`;

        if (contact.email) {
          await this.emailService
            .sendNotification(
              contact.email,
              contact.name,
              subject,
              emailHtml,
              chatMessageText,
              undefined,
              contact.id,
            )
            .catch(() => null);
        }

        if (contact.phone) {
          const config = await this.agentsConfigService
            .findByKey('booking')
            .catch(() => null);
          const fromNumber =
            config?.whatsappPhoneNumber ||
            process.env.YCLOUD_FROM_PHONE ||
            '+34600000000';
          await this.ycloudClient
            .sendTextMessage(
              fromNumber,
              contact.phone,
              chatMessageText,
              config?.ycloudApiKey,
            )
            .catch(() => null);
        }
      }

      // Sincronizar y registrar el mensaje en la conversación del CRM / Inbox
      try {
        const conv = await this.conversationsRepo.findOne({
          where: [{ contactId: contact.id }],
          order: { updatedAt: 'DESC' },
        });

        const threadId =
          conv?.threadId ||
          (contact.phone ? `booking:${contact.phone}` : `booking:${contact.id}`);
        const channel =
          conv?.channel === MessageChannel.WHATSAPP || contact.phone
            ? MessageChannel.WHATSAPP
            : MessageChannel.WIDGET;

        if (chatMessageText) {
          const savedMsg = await this.messagesService.saveMessage({
            contactId: contact.id,
            threadId,
            direction: MessageDirection.OUTBOUND,
            channel,
            body: chatMessageText,
            status: MessageStatus.SENT,
          });

          this.eventEmitter.emit('message.received', {
            id: savedMsg.id,
            threadId,
            body: chatMessageText,
          });
          this.eventEmitter.emit('messages.created', savedMsg);
        }
      } catch (convErr) {
        this.logger.debug(`Could not append decision message to conversation: ${convErr}`);
      }

      // Dispatch SMS Webhook for n8n / C# notification system
      let smsText = '';
      if (decision === 'pending_approval') {
        smsText = `Hola ${contact.name || ''}, tu solicitud para ${appt.service} el ${formattedDate} ha sido recibida y está pendiente de confirmación del profesor. Centro de Yoga Salvadora Conesa.`;
      } else if (decision === 'accepted') {
        smsText = `Hola ${contact.name || ''}, tu cita para ${appt.service} el ${formattedDate} a las ${formattedStartTime} ha sido confirmada en Centro de Yoga Salvadora Conesa. ¡Te esperamos!`;
      } else if (decision === 'reschedule_requested') {
        smsText = `Hola ${contact.name || ''}, para tu cita de ${appt.service} el ${formattedDate}, solicitamos cambiar de fecha u horario. Motivo: ${rejectionReason || 'No disponible'}`;
      } else if (decision === 'cancelled') {
        smsText = `Hola ${contact.name || ''}, confirmamos la cancelación de tu cita para ${appt.service} prevista para el ${formattedDate}.`;
      } else {
        smsText = `Hola ${contact.name || ''}, lamentamos informarte de que tu solicitud para ${appt.service} el ${formattedDate} no ha podido ser confirmada.`;
      }

      // Direct Zadarma SMS dispatch if enabled and contact has phone
      if (contact.phone && this.zadarmaSms) {
        try {
          const vapiAcc = await this.appointmentsRepo.manager
            .getRepository(VapiAccount)
            .findOne({ where: {} });
          if (vapiAcc?.zadarmaSmsEnabled !== false) {
            await this.zadarmaSms.sendSms({
              number: contact.phone,
              message: smsText,
              sender: vapiAcc?.zadarmaSenderId || undefined,
              contactId: contact.id,
              appointmentId: appt.id,
            });
          }
        } catch (smsErr) {
          this.logger.warn(`Could not dispatch Zadarma SMS for appointment ${appt.id}: ${smsErr}`);
        }
      }

      await this.dispatchSmsWebhook({
        event: `appointment.${decision}`,
        decision,
        appointmentId: appt.id,
        service: appt.service,
        startsAt: appt.startsAt,
        endsAt: appt.endsAt,
        formattedDate,
        formattedTime,
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
        },
        smsText,
        manager: effectiveManager,
        rejectionReason,
      }).catch(() => null);
    } catch (err) {
      this.logger.error(`Error notifying student about appointment ${appt.id}: ${err}`);
    }
  }

  /**
   * Dispatches outgoing webhook to n8n (or C# service) for SMS notifications.
   */
  private async dispatchSmsWebhook(payload: {
    event: string;
    decision: 'accepted' | 'rejected' | 'reschedule_requested' | 'cancelled' | 'pending_approval';
    appointmentId: string;
    service: string;
    startsAt: Date | string;
    endsAt?: Date | string | null;
    formattedDate: string;
    formattedTime: string;
    contact: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
    };
    smsText: string;
    manager: string;
    rejectionReason?: string;
  }): Promise<void> {
    let webhookUrl = process.env.N8N_SMS_WEBHOOK_URL || process.env.SMS_WEBHOOK_URL;
    
    if (!webhookUrl) {
      try {
        const vapiAcc = await this.appointmentsRepo.manager
          .getRepository(VapiAccount)
          .findOne({ where: {} });
        if (vapiAcc?.smsWebhookUrl) {
          webhookUrl = vapiAcc.smsWebhookUrl;
        }
      } catch {
        // ignore if not found
      }
    }

    if (!webhookUrl || webhookUrl.trim() === '') {
      return;
    }
    if (!payload.contact.phone) {
      return;
    }
    try {
      this.logger.log(`Dispatching SMS webhook to n8n (${webhookUrl}) for contact ${payload.contact.phone}`);
      const res = await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CRM-Salvadora-SMS/1.0',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        this.logger.warn(`n8n SMS Webhook returned status ${res.status}: ${await res.text().catch(() => '')}`);
      } else {
        this.logger.log(`n8n SMS Webhook delivered successfully (${res.status})`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to dispatch SMS webhook to n8n: ${err?.message || err}`);
    }
  }

  /** Logical cancellation — preserves the row (and its history) instead of deleting. */
  async cancel(
    id: string,
    cancelledBy: string,
    reason?: string,
  ): Promise<Appointment> {
    const appt = await this.findOne(id);
    if (appt.status !== AppointmentStatus.CANCELLED) {
      appt.status = AppointmentStatus.CANCELLED;
      appt.cancelledAt = new Date();
      appt.cancelledBy = cancelledBy;
      appt.cancellationReason = reason ?? null;
      await this.appointmentsRepo.save(appt);

      if (appt.calBookingUid) {
        this.calcomService.cancelBooking(appt.calBookingUid, reason).catch((err) => {
          console.warn('Cal.com booking cancellation warning:', err);
        });
      }

      this.eventEmitter.emit('appointment.created', appt);

      // Notify student via Email and WhatsApp
      let serviceEntity: Service | null = null;
      if (appt.service) {
        serviceEntity = await this.servicesRepo
          .findOne({
            where: { name: appt.service },
            relations: ['manager'],
          })
          .catch(() => null);
      }
      this.notifyStudentDecision(
        appt,
        'cancelled',
        serviceEntity?.manager?.name || cancelledBy || 'Jose Ignacio Gomez Raya',
        reason,
      ).catch(() => null);
    }
    return appt;
  }

  // ─── Validation helpers ───

  private assertValidWindow(
    startsAt: Date,
    endsAt: Date,
    opts: { mustBeFuture: boolean },
  ): void {
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      throw new BadRequestException('Las fechas de la cita no son válidas.');
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'La hora de fin debe ser posterior a la de inicio.',
      );
    }
    // 60s of grace to avoid rejecting "now" due to request latency.
    if (opts.mustBeFuture && startsAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('No se puede crear una cita en el pasado.');
    }
  }

  /**
   * Reject a booking that exceeds the capacity for an existing non-cancelled appointment slot
   * on the SAME calendar OR across any service managed by the same responsible manager,
   * AND reject duplicate bookings for the SAME contact at the same time.
   */
  private async checkOverlap(
    repo: Repository<Appointment>,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
    calendarId = 'default',
    serviceId?: string | null,
    serviceName?: string | null,
    contactId?: string | null,
  ): Promise<void> {
    // 1. Prevent the SAME contact from booking two simultaneous appointments (e.g. Constelar + Participante, 1 clase + 2 clases, etc.)
    if (contactId) {
      const contactConflict = await repo
        .createQueryBuilder('a')
        .where('a.contactId = :contactId', { contactId })
        .andWhere('a.status NOT IN (:...nonBlocking)', {
          nonBlocking: [AppointmentStatus.CANCELLED],
        })
        .andWhere('a.startsAt < :endsAt', { endsAt })
        .andWhere('a.endsAt > :startsAt', { startsAt })
        .andWhere(excludeId ? 'a.id != :excludeId' : '1=1', { excludeId })
        .getOne();

      if (contactConflict) {
        throw new ConflictException(
          `Este contacto ya tiene una reserva activa para «${contactConflict.service}» en ese mismo horario. No es posible agendar citas simultáneas para la misma persona.`,
        );
      }
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let managerServiceIds: string[] = [];
    let targetService: Service | null = null;

    if (serviceId && UUID_REGEX.test(serviceId)) {
      targetService = await this.servicesRepo
        .findOne({ where: { id: serviceId } })
        .catch(() => null);
    }
    if (!targetService && serviceName) {
      targetService = await this.servicesRepo
        .findOne({ where: { name: serviceName } })
        .catch(() => null);
      if (!targetService) {
        targetService = await this.servicesRepo
          .findOne({ where: { name: ILike(`%${serviceName}%`) } })
          .catch(() => null);
      }
    }

    const isYogaOrGroup =
      /yoga|meditaci|gong|taller|grupal/i.test(
        serviceName || targetService?.name || '',
      ) ||
      (targetService?.maxCapacity && targetService.maxCapacity > 1);

    let maxCapacity = 1;
    if (targetService?.maxCapacity && targetService.maxCapacity > 0) {
      maxCapacity = targetService.maxCapacity;
    } else if (isYogaOrGroup) {
      maxCapacity = 20;
    }

    if (targetService?.managerId) {
      const sharedServices = await this.servicesRepo.find({
        where: { managerId: targetService.managerId },
        select: ['id'],
      });
      managerServiceIds = sharedServices.map((s) => s.id);
    }

    const qb = repo
      .createQueryBuilder('a')
      .where('a.status NOT IN (:...nonBlocking)', {
        nonBlocking: [
          AppointmentStatus.CANCELLED,
          AppointmentStatus.PENDING_APPROVAL,
        ],
      })
      .andWhere('a.startsAt < :endsAt', { endsAt })
      .andWhere('a.endsAt > :startsAt', { startsAt });

    if (isYogaOrGroup || maxCapacity > 1) {
      // For group sessions, check conflicts against the same group service/class
      if (targetService?.id) {
        qb.andWhere('(a.serviceId = :svcId OR a.service ILIKE :svcName)', {
          svcId: targetService.id,
          svcName: `%${serviceName || targetService.name}%`,
        });
      } else if (serviceName) {
        qb.andWhere('a.service ILIKE :svcName', {
          svcName: `%${serviceName}%`,
        });
      }
    } else if (managerServiceIds.length > 0) {
      qb.andWhere(
        '(a.calendarId = :calendarId OR a.serviceId IN (:...managerServiceIds))',
        { calendarId, managerServiceIds },
      );
    } else {
      qb.andWhere('a.calendarId = :calendarId', { calendarId });
    }

    if (excludeId) qb.andWhere('a.id != :excludeId', { excludeId });
    const conflicts = await qb.getCount();
    if (conflicts >= maxCapacity) {
      const message =
        maxCapacity > 1
          ? `Ese horario ya ha alcanzado el aforo máximo permitido (${maxCapacity} plazas ocupadas). Elige otro hueco libre.`
          : 'Ese horario ya está ocupado en este calendario o por el responsable del servicio. Elige otro hueco libre.';
      throw new ConflictException(message);
    }
  }

  async countToday(
    timezone = process.env.BUSINESS_TIMEZONE || 'Europe/Madrid',
    managerId?: string,
  ): Promise<number> {
    const { start, end } = businessDayWindow(new Date(), timezone);
    return (
      await this.findAll(start.toISOString(), end.toISOString(), {
        status: AppointmentStatus.SCHEDULED,
        managerId,
      })
    ).length;
  }

  async countPending(managerId?: string): Promise<number> {
    return (
      await this.findAll(undefined, undefined, {
        status: AppointmentStatus.PENDING_APPROVAL,
        managerId,
      })
    ).length;
  }

  async findToday(
    timezone = process.env.BUSINESS_TIMEZONE || 'Europe/Madrid',
    managerId?: string,
  ): Promise<Appointment[]> {
    const { start, end } = businessDayWindow(new Date(), timezone);
    return this.findAll(start.toISOString(), end.toISOString(), { managerId });
  }

  async findUpcoming(limit = 5, managerId?: string): Promise<Appointment[]> {
    const all = await this.findAll(new Date().toISOString(), undefined, {
      status: AppointmentStatus.SCHEDULED,
      managerId,
    });
    return all.slice(0, limit);
  }

  async getAvailableSlots(
    date: Date,
    durationMinutes: number,
    workingHours: WorkingHourSlot[],
    timezone = 'Europe/Madrid',
    now = new Date(),
    calendarId = 'default',
    serviceId?: string,
    serviceName?: string,
  ): Promise<TimeSlot[]> {
    // Day window in the business timezone
    const zoned = new TZDate(date.getTime(), timezone);
    const dayStart = new TZDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 0, 0, timezone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let managerServiceIds: string[] = [];
    let targetService: Service | null = null;
    if (serviceId && UUID_REGEX.test(serviceId)) {
      targetService = await this.servicesRepo
        .findOne({ where: { id: serviceId } })
        .catch(() => null);
    }
    if (!targetService && serviceName) {
      targetService = await this.servicesRepo
        .findOne({ where: { name: serviceName } })
        .catch(() => null);
      if (!targetService) {
        targetService = await this.servicesRepo
          .findOne({ where: { name: ILike(`%${serviceName}%`) } })
          .catch(() => null);
      }
    }

    const isYogaOrGroup =
      /yoga|meditaci|gong|taller|grupal/i.test(
        serviceName || targetService?.name || '',
      ) ||
      (targetService?.maxCapacity && targetService.maxCapacity > 1);

    let maxCapacity = 1;
    if (targetService?.maxCapacity && targetService.maxCapacity > 0) {
      maxCapacity = targetService.maxCapacity;
    } else if (isYogaOrGroup) {
      maxCapacity = 20;
    }

    if (targetService?.calendarId) calendarId = targetService.calendarId;
    if (targetService?.managerId) {
      const sharedServices = await this.servicesRepo.find({
        where: { managerId: targetService.managerId },
        select: ['id'],
      });
      managerServiceIds = sharedServices.map((s) => s.id);
    }

    const qb = this.appointmentsRepo
      .createQueryBuilder('a')
      .where('a.startsAt BETWEEN :start AND :end', {
        start: new Date(dayStart.getTime()),
        end: dayEnd,
      })
      .andWhere('a.status NOT IN (:...nonBlocking)', {
        nonBlocking: [
          AppointmentStatus.CANCELLED,
          AppointmentStatus.PENDING_APPROVAL,
        ],
      });

    if (isYogaOrGroup || maxCapacity > 1) {
      if (targetService?.id) {
        qb.andWhere('(a.serviceId = :svcId OR a.service ILIKE :svcName)', {
          svcId: targetService.id,
          svcName: `%${serviceName || targetService.name}%`,
        });
      } else if (serviceName) {
        qb.andWhere('a.service ILIKE :svcName', {
          svcName: `%${serviceName}%`,
        });
      }
    } else if (managerServiceIds.length > 0) {
      qb.andWhere(
        '(a.calendarId = :calendarId OR a.serviceId IN (:...managerServiceIds))',
        { calendarId, managerServiceIds },
      );
    } else {
      qb.andWhere('a.calendarId = :calendarId', { calendarId });
    }

    const existing = await qb.getMany();

    const rawSlots = computeFreeSlots(date, durationMinutes, workingHours, existing, {
      timezone,
      now,
      maxCapacity,
    });

    // Enforce official service timetables strictly across all channels (VAPI, WhatsApp, Landing)
    const isHathaYoga = /hatha.*yoga|yoga.*terap/i.test(serviceName || targetService?.name || '');
    const isMeditacion = /meditaci/i.test(serviceName || targetService?.name || '');
    const isIaido = /iaido|iaidō|esgrima/i.test(serviceName || targetService?.name || '');

    const HATHA_YOGA_TIMETABLE: Record<number, string[]> = {
      2: ['09:45', '11:15', '17:00', '18:30', '20:00'], // Martes
      3: ['20:15'],                                     // Miércoles
      4: ['09:45', '11:15', '16:30', '17:30', '19:00'], // Jueves
    };

    const MEDITACION_TIMETABLE: Record<number, string[]> = {
      2: ['09:15'],
      4: ['09:15'],
    };

    const IAIDO_TIMETABLE: Record<number, string[]> = {
      1: ['20:00'],
      4: ['20:30'],
    };

    const effectiveTimetable =
      targetService?.weeklySchedule && Object.keys(targetService.weeklySchedule).length > 0
        ? targetService.weeklySchedule
        : isHathaYoga
        ? HATHA_YOGA_TIMETABLE
        : isMeditacion
        ? MEDITACION_TIMETABLE
        : isIaido
        ? IAIDO_TIMETABLE
        : null;

    if (effectiveTimetable) {
      const targetDay = zoned.getDay();
      const allowed = effectiveTimetable[targetDay] || [];
      return rawSlots.filter((s) => {
        const slotDate = s.startsAt instanceof Date ? s.startsAt : new Date(s.startsAt);
        const zonedSlot = new TZDate(slotDate.getTime(), timezone);
        return allowed.includes(format(zonedSlot, 'HH:mm'));
      });
    }

    return rawSlots;
  }

  /** Cancellation requested by the AI agent (on the customer's behalf). */
  async cancelAppointment(id: string): Promise<Appointment> {
    return this.cancel(id, 'agent');
  }

  async findByContact(contactId: string): Promise<Appointment[]> {
    return this.appointmentsRepo.find({
      where: { contactId },
      order: { startsAt: 'DESC' },
    });
  }

  /**
   * Retrieves appointments filtered for payment tracking, including full summary totals.
   */
  async getAppointmentPayments(query: QueryAppointmentPaymentsDto): Promise<{
    items: Appointment[];
    summary: {
      totalCount: number;
      paidCount: number;
      pendingCount: number;
      totalPaidAmount: number;
      totalPendingAmount: number;
    };
  }> {
    const qb = this.appointmentsRepo
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.contact', 'contact')
      .orderBy('appointment.startsAt', 'DESC');

    if (query.startDate) {
      const start = new Date(query.startDate);
      if (!isNaN(start.getTime())) {
        qb.andWhere('appointment.startsAt >= :startDate', { startDate: start.toISOString() });
      }
    }

    if (query.endDate) {
      const end = new Date(query.endDate);
      if (!isNaN(end.getTime())) {
        if (query.endDate.length === 10) {
          end.setHours(23, 59, 59, 999);
        }
        qb.andWhere('appointment.startsAt <= :endDate', { endDate: end.toISOString() });
      }
    }

    if (query.service && query.service !== 'all') {
      qb.andWhere('(appointment.service ILIKE :service OR appointment.serviceId = :service)', {
        service: `%${query.service}%`,
      });
    }

    if (query.contactId) {
      qb.andWhere('appointment.contactId = :contactId', { contactId: query.contactId });
    }

    if (query.paymentStatus && query.paymentStatus !== 'all') {
      if (query.paymentStatus === 'pending') {
        qb.andWhere('appointment.paymentStatus IN (:...pendingStatuses)', {
          pendingStatuses: [PaymentStatus.PENDING, PaymentStatus.UNPAID],
        });
      } else {
        qb.andWhere('appointment.paymentStatus = :paymentStatus', {
          paymentStatus: query.paymentStatus,
        });
      }
    }

    if (query.paymentMethod && query.paymentMethod !== 'all') {
      qb.andWhere('appointment.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(contact.name ILIKE :search OR contact.phone ILIKE :search OR contact.email ILIKE :search OR appointment.service ILIKE :search)',
        { search: term },
      );
    }

    const items = await qb.getMany();

    let paidCount = 0;
    let pendingCount = 0;
    let totalPaidAmount = 0;
    let totalPendingAmount = 0;

    for (const appt of items) {
      const priceNum = appt.price ? parseFloat(appt.price) : 0;
      const paidNum = appt.paidAmount ? parseFloat(appt.paidAmount) : priceNum;

      if (appt.paymentStatus === PaymentStatus.PAID) {
        paidCount++;
        totalPaidAmount += isNaN(paidNum) ? 0 : paidNum;
      } else if (
        appt.paymentStatus === PaymentStatus.PENDING ||
        appt.paymentStatus === PaymentStatus.UNPAID ||
        !appt.paymentStatus
      ) {
        pendingCount++;
        totalPendingAmount += isNaN(priceNum) ? 0 : priceNum;
      }
    }

    return {
      items,
      summary: {
        totalCount: items.length,
        paidCount,
        pendingCount,
        totalPaidAmount: Math.round(totalPaidAmount * 100) / 100,
        totalPendingAmount: Math.round(totalPendingAmount * 100) / 100,
      },
    };
  }

  /**
   * Updates an appointment's payment status, method, amount, date and notes manually.
   */
  async updatePayment(
    id: string,
    dto: UpdateAppointmentPaymentDto,
    recordedBy?: string,
  ): Promise<Appointment> {
    const appt = await this.findOne(id);
    appt.paymentStatus = dto.paymentStatus;
    if (dto.paymentMethod !== undefined) {
      appt.paymentMethod = dto.paymentMethod || null;
    }
    if (dto.paidAmount !== undefined) {
      appt.paidAmount = dto.paidAmount || null;
    }
    if (dto.paidAt !== undefined) {
      appt.paidAt = dto.paidAt ? new Date(dto.paidAt) : null;
    } else if (dto.paymentStatus === PaymentStatus.PAID && !appt.paidAt) {
      appt.paidAt = new Date();
    }
    if (dto.paymentNotes !== undefined) {
      appt.paymentNotes = dto.paymentNotes || null;
    }
    appt.paymentRecordedBy =
      dto.paymentRecordedBy || recordedBy || appt.paymentRecordedBy || 'Salvadora Conesa';

    const saved = await this.appointmentsRepo.save(appt);
    const withContact = await this.findOne(saved.id);
    this.eventEmitter.emit('appointment.updated', withContact);
    return withContact;
  }
}
