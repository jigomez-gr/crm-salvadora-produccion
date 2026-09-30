import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { EventEdition, EventEditionStatus } from '../common/entities/event-edition.entity';
import { Service } from '../common/entities/service.entity';
import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from '../email/email.service';
import { YCloudClient } from '../whatsapp/ycloud-client.service';
import {
  CreateEventEditionDto,
  UpdateEventEditionDto,
  ConfirmEventEditionDto,
  CancelEventEditionDto,
} from './dto/event-edition.dto';

const AUDIT_EVENT = 'audit.log';

@Injectable()
export class EventEditionsService {
  constructor(
    @InjectRepository(EventEdition)
    private readonly editionRepo: Repository<EventEdition>,
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
    @InjectRepository(Appointment)
    private readonly apptRepo: Repository<Appointment>,
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly ycloudClient?: YCloudClient,
  ) {}

  async findByService(serviceId: string): Promise<EventEdition[]> {
    const editions = await this.editionRepo.find({
      where: { serviceId },
      order: { createdAt: 'DESC' },
    });

    for (const ed of editions) {
      const count = await this.apptRepo.count({
        where: {
          editionId: ed.id,
          status: Not(AppointmentStatus.CANCELLED),
        },
      });
      ed.enrolledCount = count;
      ed.quorumReached = count >= (ed.minParticipants || 1);
    }

    return editions;
  }

  async findOne(id: string): Promise<{
    edition: EventEdition;
    enrolledCount: number;
    quorumReached: boolean;
    appointments: any[];
  }> {
    const edition = await this.editionRepo.findOne({
      where: { id },
      relations: ['service'],
    });
    if (!edition) {
      throw new NotFoundException(`Convocatoria con ID ${id} no encontrada`);
    }

    const appts = await this.apptRepo.find({
      where: {
        editionId: id,
        status: Not(AppointmentStatus.CANCELLED),
      },
      relations: ['contact'],
      order: { createdAt: 'ASC' },
    });

    const enrolledCount = appts.length;
    const quorumReached = enrolledCount >= (edition.minParticipants || 1);
    edition.enrolledCount = enrolledCount;
    edition.quorumReached = quorumReached;

    return {
      edition,
      enrolledCount,
      quorumReached,
      appointments: appts.map((a) => ({
        id: a.id,
        contactId: a.contactId,
        contactName: a.contact?.name || 'Alumno sin nombre',
        contactEmail: a.contact?.email,
        contactPhone: a.contact?.phone,
        status: a.status,
        isProvisional: a.isProvisional,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        price: a.price,
        createdAt: a.createdAt,
      })),
    };
  }

  async create(dto: CreateEventEditionDto, actor?: { id?: string | null; email?: string | null }): Promise<EventEdition> {
    const service = await this.serviceRepo.findOne({ where: { id: dto.serviceId } });
    if (!service) {
      throw new NotFoundException(`Servicio con ID ${dto.serviceId} no encontrado`);
    }

    const edition = this.editionRepo.create({
      serviceId: dto.serviceId,
      title: dto.title,
      isDateDefinite: dto.isDateDefinite ?? Boolean(dto.startsAt),
      tentativeDateText: dto.tentativeDateText || null,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      isPriceDefinite: dto.isPriceDefinite ?? Boolean(dto.price),
      tentativePriceText: dto.tentativePriceText || null,
      price: dto.price || service.price || null,
      minParticipants: dto.minParticipants !== undefined ? dto.minParticipants : (service.minQuorum || 1),
      maxCapacity: dto.maxCapacity !== undefined ? dto.maxCapacity : service.maxCapacity,
      quorumDeadline: dto.quorumDeadline ? new Date(dto.quorumDeadline) : null,
      conditionsText: dto.conditionsText || null,
      status: dto.status || EventEditionStatus.PROVISIONAL,
      flyerParticularUrl: dto.flyerParticularUrl || service.flyerParticularUrl || null,
      videoParticularUrl: dto.videoParticularUrl || service.videoParticularUrl || null,
    });

    const saved = await this.editionRepo.save(edition);

    this.eventEmitter.emit(AUDIT_EVENT, {
      actor: actor || { id: null, email: 'system' },
      action: 'event_edition.create',
      summary: `Convocatoria "${saved.title}" creada para el servicio "${service.name}"`,
      targetId: saved.id,
      targetType: 'event_edition',
    });

    return saved;
  }

  async update(
    id: string,
    dto: UpdateEventEditionDto,
    actor?: { id?: string | null; email?: string | null },
  ): Promise<EventEdition> {
    const edition = await this.editionRepo.findOne({ where: { id } });
    if (!edition) {
      throw new NotFoundException(`Convocatoria con ID ${id} no encontrada`);
    }

    if (dto.title !== undefined) edition.title = dto.title;
    if (dto.isDateDefinite !== undefined) edition.isDateDefinite = dto.isDateDefinite;
    if (dto.tentativeDateText !== undefined) edition.tentativeDateText = dto.tentativeDateText;
    if (dto.startsAt !== undefined) edition.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) edition.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto.isPriceDefinite !== undefined) edition.isPriceDefinite = dto.isPriceDefinite;
    if (dto.tentativePriceText !== undefined) edition.tentativePriceText = dto.tentativePriceText;
    if (dto.price !== undefined) edition.price = dto.price;
    if (dto.minParticipants !== undefined) edition.minParticipants = dto.minParticipants;
    if (dto.maxCapacity !== undefined) edition.maxCapacity = dto.maxCapacity;
    if (dto.quorumDeadline !== undefined) edition.quorumDeadline = dto.quorumDeadline ? new Date(dto.quorumDeadline) : null;
    if (dto.conditionsText !== undefined) edition.conditionsText = dto.conditionsText;
    if (dto.status !== undefined) edition.status = dto.status;
    if (dto.flyerParticularUrl !== undefined) edition.flyerParticularUrl = dto.flyerParticularUrl;
    if (dto.videoParticularUrl !== undefined) edition.videoParticularUrl = dto.videoParticularUrl;

    const saved = await this.editionRepo.save(edition);

    this.eventEmitter.emit(AUDIT_EVENT, {
      actor: actor || { id: null, email: 'system' },
      action: 'event_edition.update',
      summary: `Convocatoria "${saved.title}" actualizada`,
      targetId: saved.id,
      targetType: 'event_edition',
    });

    return saved;
  }

  /**
   * Confirms an event edition and converts all provisional reservations into definitive appointments.
   * Sends automated Email and WhatsApp notifications to all participants.
   */
  async confirmEdition(
    id: string,
    dto: ConfirmEventEditionDto,
    actor?: { id?: string | null; email?: string | null },
  ): Promise<{
    edition: EventEdition;
    confirmedCount: number;
    notifiedEmails: number;
    notifiedWhatsapp: number;
  }> {
    const edition = await this.editionRepo.findOne({
      where: { id },
      relations: ['service'],
    });
    if (!edition) {
      throw new NotFoundException(`Convocatoria con ID ${id} no encontrada`);
    }

    if (dto.startsAt) edition.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) edition.endsAt = new Date(dto.endsAt);
    if (dto.price !== undefined) edition.price = dto.price;
    edition.isDateDefinite = true;
    edition.isPriceDefinite = true;
    edition.status = EventEditionStatus.CONFIRMED;

    await this.editionRepo.save(edition);

    // Fetch all active provisional appointments linked to this edition
    const appts = await this.apptRepo.find({
      where: {
        editionId: id,
        status: Not(AppointmentStatus.CANCELLED),
      },
      relations: ['contact'],
    });

    let confirmedCount = 0;
    let notifiedEmails = 0;
    let notifiedWhatsapp = 0;

    const serviceName = edition.service?.name || 'Evento / Taller';
    const dateFormatted = edition.startsAt
      ? edition.startsAt.toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Madrid',
        })
      : edition.tentativeDateText || 'Fecha confirmada';

    const priceText = edition.price ? `${edition.price} €` : 'A convenir';

    for (const appt of appts) {
      appt.isProvisional = false;
      appt.status = AppointmentStatus.SCHEDULED;
      if (edition.startsAt) appt.startsAt = edition.startsAt;
      if (edition.endsAt) appt.endsAt = edition.endsAt;
      if (edition.price) appt.price = edition.price;
      await this.apptRepo.save(appt);
      confirmedCount++;

      const contactName = appt.contact?.name || 'Estimado/a alumno/a';
      const contactEmail = appt.contact?.email;
      const contactPhone = appt.contact?.phone;

      const emailSubject = `¡Confirmación Oficial de Plaza! - ${serviceName} (${edition.title})`;
      const messageBody = `Hola ${contactName},\n\n¡Buenas noticias! La convocatoria "${edition.title}" para "${serviceName}" ha alcanzado el quórum necesario y está OFICIALMENTE CONFIRMADA.\n\nDetalles de tu cita:\n- Fecha y hora: ${dateFormatted}\n- Precio: ${priceText}\n- Lugar: Presencial en el Centro de Yoga Salvadora Conesa (o según indicaciones del taller).\n${dto.customMessage ? `\nNota del organizador: ${dto.customMessage}\n` : ''}\nTu reserva provisional se ha convertido en DEFINITIVA.\n\nSi tienes cualquier consulta, puedes responder a este mensaje o llamarnos al 695 172 625.\n\nUn cordial saludo,\nEquipo de Salvadora Conesa\nhttps://salvadora.jigretera.com`;

      if (dto.sendEmail !== false && contactEmail && this.emailService) {
        try {
          await this.emailService.send(
            appt.contactId,
            emailSubject,
            messageBody,
            actor?.email || 'system',
          );
          notifiedEmails++;
        } catch (err) {
          console.warn(`[confirmEdition] Error sending email to ${contactEmail}:`, err);
        }
      }

      if (dto.sendWhatsapp !== false && contactPhone && this.ycloudClient) {
        try {
          await this.ycloudClient.sendTextMessage('34695172625', contactPhone, messageBody);
          notifiedWhatsapp++;
        } catch (err) {
          console.warn(`[confirmEdition] Error sending WhatsApp to ${contactPhone}:`, err);
        }
      }
    }

    this.eventEmitter.emit(AUDIT_EVENT, {
      actor: actor || { id: null, email: 'system' },
      action: 'event_edition.confirm',
      summary: `Convocatoria "${edition.title}" confirmada: ${confirmedCount} reservas convertidas en definitivas`,
      targetId: edition.id,
      targetType: 'event_edition',
    });

    return {
      edition,
      confirmedCount,
      notifiedEmails,
      notifiedWhatsapp,
    };
  }

  /**
   * Cancels an edition due to lack of quorum and cancels all provisional bookings with participant notification.
   */
  async cancelEdition(
    id: string,
    dto: CancelEventEditionDto,
    actor?: { id?: string | null; email?: string | null },
  ): Promise<{
    edition: EventEdition;
    cancelledCount: number;
    notifiedEmails: number;
    notifiedWhatsapp: number;
  }> {
    const edition = await this.editionRepo.findOne({
      where: { id },
      relations: ['service'],
    });
    if (!edition) {
      throw new NotFoundException(`Convocatoria con ID ${id} no encontrada`);
    }

    edition.status = EventEditionStatus.CANCELLED;
    await this.editionRepo.save(edition);

    const appts = await this.apptRepo.find({
      where: {
        editionId: id,
        status: Not(AppointmentStatus.CANCELLED),
      },
      relations: ['contact'],
    });

    let cancelledCount = 0;
    let notifiedEmails = 0;
    let notifiedWhatsapp = 0;

    const serviceName = edition.service?.name || 'Evento / Taller';
    const reason = dto.cancellationReason || 'No se alcanzó el número mínimo de participantes requerido para realizar la actividad.';

    for (const appt of appts) {
      appt.status = AppointmentStatus.CANCELLED;
      appt.cancelledAt = new Date();
      appt.cancelledBy = actor?.email || 'admin';
      appt.cancellationReason = reason;
      await this.apptRepo.save(appt);
      cancelledCount++;

      const contactName = appt.contact?.name || 'Estimado/a alumno/a';
      const contactEmail = appt.contact?.email;
      const contactPhone = appt.contact?.phone;

      const emailSubject = `Información sobre tu reserva en ${serviceName} (${edition.title})`;
      const messageBody = `Hola ${contactName},\n\nTe escribimos para comunicarte que lamentablemente la convocatoria "${edition.title}" de "${serviceName}" no podrá llevarse a cabo por el siguiente motivo:\n\n${reason}\n\nTu reserva provisional ha quedado cancelada sin ningún tipo de coste ni compromiso. Te mantendremos informado de las próximas ediciones y fechas.\n\nDisculpa las molestias y muchas gracias por tu confianza,\nEquipo de Salvadora Conesa\nTeléfono: 695 172 625\nhttps://salvadora.jigretera.com`;

      if (dto.sendEmail !== false && contactEmail && this.emailService) {
        try {
          await this.emailService.send(
            appt.contactId,
            emailSubject,
            messageBody,
            actor?.email || 'system',
          );
          notifiedEmails++;
        } catch (err) {
          console.warn(`[cancelEdition] Error sending email to ${contactEmail}:`, err);
        }
      }

      if (dto.sendWhatsapp !== false && contactPhone && this.ycloudClient) {
        try {
          await this.ycloudClient.sendTextMessage('34695172625', contactPhone, messageBody);
          notifiedWhatsapp++;
        } catch (err) {
          console.warn(`[cancelEdition] Error sending WhatsApp to ${contactPhone}:`, err);
        }
      }
    }

    this.eventEmitter.emit(AUDIT_EVENT, {
      actor: actor || { id: null, email: 'system' },
      action: 'event_edition.cancel',
      summary: `Convocatoria "${edition.title}" cancelada por falta de quórum (${cancelledCount} reservas canceladas)`,
      targetId: edition.id,
      targetType: 'event_edition',
    });

    return {
      edition,
      cancelledCount,
      notifiedEmails,
      notifiedWhatsapp,
    };
  }

  async remove(id: string, actor?: { id?: string | null; email?: string | null }): Promise<void> {
    const edition = await this.editionRepo.findOne({ where: { id } });
    if (!edition) {
      throw new NotFoundException(`Convocatoria con ID ${id} no encontrada`);
    }

    await this.editionRepo.remove(edition);

    this.eventEmitter.emit(AUDIT_EVENT, {
      actor: actor || { id: null, email: 'system' },
      action: 'event_edition.delete',
      summary: `Convocatoria "${edition.title}" eliminada`,
      targetId: edition.id,
      targetType: 'event_edition',
    });
  }
}
