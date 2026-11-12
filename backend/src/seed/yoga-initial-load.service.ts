import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TZDate } from '@date-fns/tz';
import { Contact, ContactStatus } from '../common/entities/contact.entity';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
} from '../common/entities/appointment.entity';
import { Service } from '../common/entities/service.entity';
import { GrupoContacto } from '../contact-groups/grupo-contacto.entity';
import { MiembroGrupo } from '../contact-groups/miembro-grupo.entity';
import { PipelineStage } from '../contacts/pipeline';
import { parseYogaInitialLoad, YogaInitialLoadItem } from './yoga-initial-load.data';

const TZ = 'Europe/Madrid';

@Injectable()
export class YogaInitialLoadService implements OnModuleInit {
  private readonly logger = new Logger(YogaInitialLoadService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    @InjectRepository(GrupoContacto)
    private readonly gruposRepo: Repository<GrupoContacto>,
    @InjectRepository(MiembroGrupo)
    private readonly miembrosRepo: Repository<MiembroGrupo>,
  ) {}

  async onModuleInit() {
    // Automatically run initial load on boot (idempotent)
    try {
      await this.runInitialLoad();
    } catch (err: any) {
      this.logger.error(`Error during yoga initial load on boot: ${err?.message || err}`);
    }
  }

  /**
   * Calculates the next upcoming date for the given day of the week and hour in Madrid timezone.
   */
  getNextOccurrenceDate(dayName: string, hourStr: string): Date {
    const dayLower = dayName.toLowerCase().trim();
    const dayTarget = dayLower.includes('mar')
      ? 2
      : dayLower.includes('mi')
      ? 3
      : 4; // 2=martes, 3=miércoles, 4=jueves
    const [hh, mm] = hourStr.split(':').map((x) => parseInt(x, 10));

    const now = new TZDate(Date.now(), TZ);

    // Days ahead to the target day of the week
    let daysAhead = (dayTarget - now.getDay() + 7) % 7;
    // If target day is today (jueves 12/11/2026), schedule for next week to ensure advance notice
    if (daysAhead === 0) {
      daysAhead = 7;
    }

    return new TZDate(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + daysAhead,
      hh,
      mm,
      0,
      TZ,
    );
  }

  /**
   * Executes the initial load of contacts and appointments for Yoga Terapéutico (1 clase semanal).
   */
  async runInitialLoad(): Promise<{
    totalProcessed: number;
    contactsCreated: number;
    contactsUpdated: number;
    appointmentsCreated: number;
    groupMembersAdded: number;
  }> {
    this.logger.log('Starting initial load of Yoga Terapéutico (1 clase semanal) subscriptions...');

    // 1. Ensure target group YOGA_TERAPEUTICO_1 exists
    let group = await this.gruposRepo.findOne({
      where: { grupocontacto: 'YOGA_TERAPEUTICO_1' },
    });
    if (!group) {
      group = await this.gruposRepo.save(
        this.gruposRepo.create({
          grupocontacto: 'YOGA_TERAPEUTICO_1',
          descripciongrupo: 'Grupo Hatha Yoga Terapéutico (Modalidad 1 clase semanal)',
        }),
      );
    }

    // 2. Find or match yoga service
    let yogaService = await this.servicesRepo
      .createQueryBuilder('s')
      .where('s.name ILIKE :q', { q: '%yoga%terap%' })
      .orderBy('s.id', 'ASC')
      .getOne();

    const serviceName =
      yogaService?.name || 'Hatha Yoga Terapéutico (1 clase semanal)';
    const serviceId = yogaService?.id || null;
    const calendarId = yogaService?.calendarId || 'cal-hatha-yoga';
    const durationMinutes = yogaService?.durationMinutes || 90;

    const items: YogaInitialLoadItem[] = parseYogaInitialLoad();
    let contactsCreated = 0;
    let contactsUpdated = 0;
    let appointmentsCreated = 0;
    let groupMembersAdded = 0;

    for (const item of items) {
      const cleanDigits = item.movil.replace(/\D/g, '');
      const last9 = cleanDigits.slice(-9);
      if (!last9 || last9.length < 9) {
        this.logger.warn(`Skipping invalid phone for ${item.nombre}: ${item.movil}`);
        continue;
      }
      const formattedPhone = `+34${last9}`;

      // Resolve day target index (2=martes, 3=miércoles, 4=jueves)
      const dayLower = item.dia.toLowerCase().trim();
      const dayTarget = dayLower.includes('mar')
        ? 2
        : dayLower.includes('mi')
        ? 3
        : 4;

      // Identify by mobile if contact already exists
      let contact = await this.contactsRepo
        .createQueryBuilder('c')
        .where('c.phone LIKE :last9', { last9: `%${last9}%` })
        .getOne();

      if (contact) {
        // Contact already exists: update name, set email to cargainicial, mark as student
        contact.name = item.nombre;
        contact.email = 'cargainicial';
        contact.isStudent = true;
        contact.studentModality = '1_clase_semanal';
        contact.studentSchedule = [{ day: dayTarget, time: item.hora }];
        contact.status = ContactStatus.ACTIVE;
        contact.pipelineStage = PipelineStage.WON;
        if (item.observaciones) {
          contact.notes = contact.notes
            ? `${contact.notes} | ${item.observaciones}`
            : item.observaciones;
        }
        if (!contact.tags) contact.tags = [];
        for (const t of ['alumno', 'cliente', 'cargainicial', 'yoga']) {
          if (!contact.tags.includes(t)) contact.tags.push(t);
        }
        await this.contactsRepo.save(contact);
        contactsUpdated++;
      } else {
        // Contact does NOT exist: create contact with name, phone, and email cargainicial
        contact = this.contactsRepo.create({
          name: item.nombre,
          phone: formattedPhone,
          email: 'cargainicial',
          status: ContactStatus.ACTIVE,
          pipelineStage: PipelineStage.WON,
          isStudent: true,
          studentModality: '1_clase_semanal',
          studentSchedule: [{ day: dayTarget, time: item.hora }],
          studentEnrolledAt: new Date(),
          source: 'cargainicial',
          notes: item.observaciones || 'Carga inicial suscripción Yoga Terapéutico',
          tags: ['alumno', 'cliente', 'cargainicial', 'yoga'],
        });
        contact = await this.contactsRepo.save(contact);
        contactsCreated++;
      }

      // Calculate next occurrence date & time
      const startsAt = this.getNextOccurrenceDate(item.dia, item.hora);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

      // Check if appointment already exists for this contact at that slot
      const existingAppt = await this.appointmentsRepo
        .createQueryBuilder('a')
        .where('a.contactId = :contactId', { contactId: contact.id })
        .andWhere('a.startsAt = :startsAt', { startsAt })
        .getOne();

      if (!existingAppt) {
        const newAppt = this.appointmentsRepo.create({
          contactId: contact.id,
          service: serviceName,
          serviceId,
          calendarId,
          startsAt,
          endsAt,
          status: AppointmentStatus.SCHEDULED,
          paymentStatus: PaymentStatus.EXEMPT,
          modality: 'in_person',
          notes: `Carga inicial suscripción Yoga Terapéutico (1 clase semanal). ${item.observaciones || ''}`.trim(),
        });
        await this.appointmentsRepo.save(newAppt);
        appointmentsCreated++;
      }

      // Ensure membership in YOGA_TERAPEUTICO_1 group
      const existingMiembro = await this.miembrosRepo.findOne({
        where: {
          grupocontacto: 'YOGA_TERAPEUTICO_1',
          movil: formattedPhone,
        },
      });

      if (!existingMiembro) {
        const miembro = this.miembrosRepo.create({
          grupocontacto: 'YOGA_TERAPEUTICO_1',
          movil: formattedPhone,
          contactId: contact.id,
          campofechayhora: new Date(),
        });
        await this.miembrosRepo.save(miembro);
        groupMembersAdded++;
      }
    }

    this.logger.log(
      `Yoga initial load completed: ${items.length} processed (${contactsCreated} created, ${contactsUpdated} updated, ${appointmentsCreated} appointments, ${groupMembersAdded} group members added).`,
    );

    return {
      totalProcessed: items.length,
      contactsCreated,
      contactsUpdated,
      appointmentsCreated,
      groupMembersAdded,
    };
  }
}
