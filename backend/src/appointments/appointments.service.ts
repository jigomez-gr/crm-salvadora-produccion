import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Contact } from '../common/entities/contact.entity';
import {
  Appointment,
  AppointmentStatus,
} from '../common/entities/appointment.entity';
import { Service } from '../common/entities/service.entity';
import { CalcomService } from '../calcom/calcom.service';
import { TZDate } from '@date-fns/tz';
import { businessDayWindow } from './business-day';
import { computeFreeSlots, TimeSlot } from './availability';
import { WorkingHourSlot } from '../common/entities/agent-config.entity';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  RunAiAnalysisDto,
} from './dto/appointment.dto';
import { generateDoctorReportPdfBuffer } from './pdf-report.generator';
import { AnalizaIaService, AiAnalysisResponse } from './analiza-ia.service';

// Advisory-lock key that serializes all booking writes (single bookable
// resource). Arbitrary constant; when multi-resource lands, key it per resource.
const BOOKING_LOCK_KEY = 528_491;

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    private readonly calcomService: CalcomService,
    private readonly eventEmitter: EventEmitter2,
    private readonly analizaIaService: AnalizaIaService,
  ) {}

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
    const startsAt = new Date(dto.startsAt);
    let endsAt = dto.endsAt ? new Date(dto.endsAt) : startsAt;

    let serviceEntity: Service | null = null;
    if (dto.serviceId) {
      serviceEntity = await this.servicesRepo.findOne({
        where: { id: dto.serviceId },
        relations: ['manager'],
      });
    } else if (dto.service) {
      serviceEntity = await this.servicesRepo.findOne({
        where: { name: dto.service },
        relations: ['manager'],
      });
    }

    if (serviceEntity && (!dto.endsAt || endsAt <= startsAt)) {
      endsAt = new Date(startsAt.getTime() + serviceEntity.durationMinutes * 60000);
    }

    this.assertValidWindow(startsAt, endsAt, { mustBeFuture: true });

    const calendarId = dto.calendarId || serviceEntity?.calendarId || 'default';
    const serviceName = dto.service || serviceEntity?.name || 'General';
    const serviceId = serviceEntity?.id ?? dto.serviceId ?? null;
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

    // Sincronización automática con Cal.com para citas virtuales
    if (modality === 'virtual' && contact) {
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

    // Serialize the "is the slot free? then book it" sequence so two concurrent
    // requests can't both claim the same slot.
    const saved = await this.appointmentsRepo.manager.transaction(
      async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock($1)', [
          BOOKING_LOCK_KEY,
        ]);
        const repo = manager.getRepository(Appointment);
        await this.checkOverlap(repo, startsAt, endsAt, undefined, calendarId, serviceId);
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
    return withContact;
  }

  async update(id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const appt = await this.findOne(id);

    const newStart = dto.startsAt ? new Date(dto.startsAt) : appt.startsAt;
    const newEnd = dto.endsAt ? new Date(dto.endsAt) : appt.endsAt;
    const timeChanged = Boolean(dto.startsAt || dto.endsAt);

    if (timeChanged) {
      this.assertValidWindow(newStart, newEnd, { mustBeFuture: false });
      appt.startsAt = newStart;
      appt.endsAt = newEnd;
    }

    if (dto.serviceId !== undefined) {
      appt.serviceId = dto.serviceId || null;
      if (dto.serviceId) {
        const svc = await this.servicesRepo.findOne({ where: { id: dto.serviceId } });
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
      return this.appointmentsRepo.manager.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock($1)', [
          BOOKING_LOCK_KEY,
        ]);
        const repo = manager.getRepository(Appointment);
        await this.checkOverlap(repo, newStart, newEnd, appt.id, calendarId, serviceId);
        return repo.save(appt);
      });
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
    },
    signedByName: string,
  ): Promise<Appointment> {
    const appt = await this.findOne(id);
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
    appt.status = AppointmentStatus.SCHEDULED;
    appt.acceptedAt = new Date();
    appt.acceptedBy = acceptedBy;
    const saved = await this.appointmentsRepo.save(appt);
    this.eventEmitter.emit('appointment.created', saved);
    return saved;
  }

  /** Reject an appointment (responsible manager rejection) */
  async reject(id: string, rejectedBy: string, reason?: string): Promise<Appointment> {
    return this.cancel(id, rejectedBy, reason || 'Rechazada por el responsable del servicio');
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
   * Reject a booking that overlaps an existing non-cancelled appointment on the SAME calendar
   * OR across any service managed by the same responsible manager.
   */
  private async checkOverlap(
    repo: Repository<Appointment>,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
    calendarId = 'default',
    serviceId?: string | null,
  ): Promise<void> {
    let managerServiceIds: string[] = [];
    if (serviceId) {
      const targetService = await this.servicesRepo.findOne({ where: { id: serviceId } });
      if (targetService?.managerId) {
        const sharedServices = await this.servicesRepo.find({
          where: { managerId: targetService.managerId },
          select: ['id'],
        });
        managerServiceIds = sharedServices.map((s) => s.id);
      }
    }

    const qb = repo
      .createQueryBuilder('a')
      .where('a.status != :cancelled', {
        cancelled: AppointmentStatus.CANCELLED,
      })
      .andWhere('a.startsAt < :endsAt', { endsAt })
      .andWhere('a.endsAt > :startsAt', { startsAt });

    if (managerServiceIds.length > 0) {
      qb.andWhere(
        '(a.calendarId = :calendarId OR a.serviceId IN (:...managerServiceIds))',
        { calendarId, managerServiceIds },
      );
    } else {
      qb.andWhere('a.calendarId = :calendarId', { calendarId });
    }

    if (excludeId) qb.andWhere('a.id != :excludeId', { excludeId });
    const conflicts = await qb.getCount();
    if (conflicts > 0) {
      throw new ConflictException(
        'Ese horario ya está ocupado en este calendario o por el responsable del servicio. Elige otro hueco libre.',
      );
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
  ): Promise<TimeSlot[]> {
    // Day window in the business timezone
    const zoned = new TZDate(date.getTime(), timezone);
    const dayStart = new TZDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 0, 0, timezone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    let managerServiceIds: string[] = [];
    if (serviceId) {
      const targetService = await this.servicesRepo.findOne({ where: { id: serviceId } });
      if (targetService?.calendarId) calendarId = targetService.calendarId;
      if (targetService?.managerId) {
        const sharedServices = await this.servicesRepo.find({
          where: { managerId: targetService.managerId },
          select: ['id'],
        });
        managerServiceIds = sharedServices.map((s) => s.id);
      }
    }

    const qb = this.appointmentsRepo
      .createQueryBuilder('a')
      .where('a.startsAt BETWEEN :start AND :end', {
        start: new Date(dayStart.getTime()),
        end: dayEnd,
      })
      .andWhere('a.status != :cancelled', { cancelled: AppointmentStatus.CANCELLED });

    if (managerServiceIds.length > 0) {
      qb.andWhere(
        '(a.calendarId = :calendarId OR a.serviceId IN (:...managerServiceIds))',
        { calendarId, managerServiceIds },
      );
    } else {
      qb.andWhere('a.calendarId = :calendarId', { calendarId });
    }

    const existing = await qb.getMany();

    return computeFreeSlots(date, durationMinutes, workingHours, existing, {
      timezone,
      now,
    });
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
}
