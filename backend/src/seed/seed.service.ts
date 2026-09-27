import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TZDate } from '@date-fns/tz';
import { Contact, ContactStatus } from '../common/entities/contact.entity';
import {
  Appointment,
  AppointmentStatus,
} from '../common/entities/appointment.entity';
import { Service, ServicePaymentType } from '../common/entities/service.entity';
import { User, UserRole } from '../common/entities/user.entity';
import { Call, CallDirection, CallStatus } from '../common/entities/call.entity';
import { VapiAccount } from '../common/entities/vapi-account.entity';
import {
  MediaType,
  Message,
  MessageChannel,
  MessageDirection,
} from '../common/entities/message.entity';
import { MessagesService } from '../conversations/messages.service';
import { PipelineStage } from '../contacts/pipeline';
import * as bcrypt from 'bcryptjs';
// Business timezone the demo appointments are placed in. TZDate converts the
// wall-clock time below into the correct UTC instant (handles CET/CEST).
const TZ = 'Europe/Madrid';

// Service keys & durations for seed mapping (Centro Holístico y Escuela de Yoga Salvadora Conesa)
const SVC = {
  yoga: { name: 'Hatha Yoga Terapéutico', dur: 90 },
  gestalt: { name: 'Terapia Gestalt (Sesión Individual)', dur: 60 },
  gong: { name: 'Baño de Gong y Meditación Sonora', dur: 120 },
  puja: { name: 'Puja de Gongs (Noche Sagrada de Sonido - 11h)', dur: 660 },
  constelaciones: { name: 'Constelaciones Familiares (Constelar / Asunto Propio)', dur: 240 },
  ayuno: { name: 'Retiro de Ayuno Terapéutico', dur: 1440 },
  mujeres: { name: 'Encuentro de Mujeres (Primavera)', dur: 360 },
  meditacion: { name: 'Meditaciones Guiadas', dur: 30 },
  bienestar: { name: 'Bienestar Experience (Longevidad y Bienestar Integral)', dur: 60 },
};

/**
 * Loads demo data (contacts + appointments + conversations + service managers + services)
 * the FIRST time the app runs against an empty database.
 */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Message)
    private readonly messagesRepo: Repository<Message>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Call)
    private readonly callsRepo: Repository<Call>,
    @InjectRepository(VapiAccount)
    private readonly vapiAccountRepo: Repository<VapiAccount>,
    private readonly messagesService: MessagesService,
  ) {}

  async onModuleInit() {
    if (process.env.SEED_DEMO_DATA === 'false') {
      this.logger.log('SEED_DEMO_DATA=false — skipping demo data seed');
      return;
    }

    const servicesCount = await this.servicesRepo.count();
    const contactsCount = await this.contactsRepo.count();

    if (servicesCount === 0 && contactsCount > 0) {
      this.logger.log('Existing contacts found but services table is empty. Wiping stale demo data to reseed full suite (services, managers, multi-calendar appointments)...');
      await this.contactsRepo.query('TRUNCATE TABLE appointment_reminders, appointments, messages, conversations, contacts, services, calls, vapi_accounts CASCADE;');
      await this.seed();
      await this.ensureVapiDemo();
      return;
    }

    if (contactsCount > 0) {
      this.logger.log(
        `Demo data seed skipped — database already has ${contactsCount} contact(s) and ${servicesCount} service(s)`,
      );
      await this.ensureVapiDemo();
      return;
    }

    await this.seed();
    await this.ensureVapiDemo();
  }

  private async seed() {
    this.logger.log('Empty database detected — seeding demo data for Centro Holístico y Escuela de Yoga');

    // ─── Seed Responsables de Servicio (Service Managers) ───
    const defaultPasswordHash = await bcrypt.hash('Admin1234!', 10);

    const managerSeeds = [
      {
        name: 'Salvadora Conesa Martinez',
        email: 'salvadoraconesa@gmail.com',
        role: UserRole.SERVICE_MANAGER,
      },
    ];

    const managers: Record<string, User> = {};
    for (const m of managerSeeds) {
      let u = await this.usersRepo.findOne({ where: { email: m.email } });
      if (!u) {
        u = await this.usersRepo.save(
          this.usersRepo.create({
            name: m.name,
            email: m.email,
            passwordHash: defaultPasswordHash,
            role: m.role,
            isActive: true,
          }),
        );
      } else {
        u.name = m.name;
        u.role = m.role;
        u.isActive = true;
        await this.usersRepo.save(u);
      }
      managers[m.email] = u;
    }

    const salvadoraManager = managers['salvadoraconesa@gmail.com'];

    // ─── Seed Services with distinct calendars, schedules, flyer, prices, managers ───
    const serviceList = [
      {
        name: SVC.yoga.name,
        description: 'Práctica consciente de asanas, alineación corporal, respiración terapéutica y relajación profunda.',
        durationMinutes: 90,
        price: '0.00',
        paymentType: ServicePaymentType.FREE,
        scheduleText: 'Mañanas: Martes y Jueves (9:45, 11:15) | Tardes: Martes (17:00, 18:30, 20:00), Miércoles (20:15), Jueves (16:00, 17:30, 19:00)',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-yoga',
        managerId: salvadoraManager.id,
        requiresApproval: false,
      },
      {
        name: SVC.gestalt.name,
        description: 'Acompañamiento terapéutico individual centrado en el aquí y ahora, toma de consciencia y autorregulación emocional.',
        durationMinutes: 60,
        price: '35.00',
        paymentType: ServicePaymentType.STRIPE,
        scheduleText: 'Lunes a Viernes de 10:00 a 14:00 y 16:00 a 20:00',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-gestalt',
        managerId: salvadoraManager.id,
        requiresApproval: true,
        allowedModalities: ['in_person', 'virtual'],
      },
      {
        name: SVC.gong.name,
        description: 'Inmersión profunda en vibración armónica y relajación sonora con gongs y cuencos tibetanos.',
        durationMinutes: 120,
        price: '16.00',
        paymentType: ServicePaymentType.STRIPE,
        scheduleText: 'Viernes o Sábados a las 18:00 y 20:00',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-gong-mensual',
        managerId: salvadoraManager.id,
        requiresApproval: false,
      },
      {
        name: SVC.puja.name,
        description: 'Ceremonia sagrada de sonido nocturna ininterrumpida de 11 horas para regeneración celular y descanso profundo.',
        durationMinutes: 660,
        price: '95.00',
        paymentType: ServicePaymentType.STRIPE,
        scheduleText: 'Sábados de 21:00 a 08:00 (Domingo)',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-puja-gongs',
        managerId: salvadoraManager.id,
        requiresApproval: false,
      },
      {
        name: SVC.constelaciones.name,
        description: 'Taller sistémico vivencial para desbloquear dinámicas familiares o personales y restablecer los órdenes del amor.',
        durationMinutes: 240,
        price: '60.00',
        paymentType: ServicePaymentType.STRIPE,
        scheduleText: 'Sábados intensivos de 10:00 a 14:00',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-constelaciones',
        managerId: salvadoraManager.id,
        requiresApproval: false,
      },
      {
        name: 'Constelaciones Familiares (Participante / Representante)',
        description: 'Participación como representante en el taller vivencial de constelaciones familiares.',
        durationMinutes: 240,
        price: '20.00',
        paymentType: ServicePaymentType.STRIPE,
        scheduleText: 'Sábados intensivos de 10:00 a 14:00',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-constelaciones',
        managerId: salvadoraManager.id,
        requiresApproval: false,
      },
      {
        name: SVC.ayuno.name,
        description: 'Retiro residencial o particular supervisado de desintoxicación, descanso digestivo, yoga suave y meditación.',
        durationMinutes: 1440,
        price: '250.00',
        paymentType: ServicePaymentType.STRIPE,
        scheduleText: 'Fines de semana y fechas programadas',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-ayuno-terapeutico',
        managerId: salvadoraManager.id,
        requiresApproval: true,
      },
      {
        name: SVC.mujeres.name,
        description: 'Círculo vivencial de conexión femenina, arquetipos, movimiento consciente y sabiduría compartida.',
        durationMinutes: 360,
        price: '45.00',
        paymentType: ServicePaymentType.STRIPE,
        scheduleText: 'Sábados de 10:00 a 16:00',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-encuentro-mujeres',
        managerId: salvadoraManager.id,
        requiresApproval: false,
      },
      {
        name: SVC.meditacion.name,
        description: 'Espacio semanal de quietud, atención plena (mindfulness) y conexión interior.',
        durationMinutes: 30,
        price: '15.00',
        paymentType: ServicePaymentType.FREE,
        scheduleText: 'Lunes a Jueves a las 14:00 y 20:45',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-meditacion',
        managerId: salvadoraManager.id,
        requiresApproval: false,
      },
      {
        name: SVC.bienestar.name,
        description: 'Sesión integral combinada de bioenergética, respiración consciente, pautas de longevidad y relajación.',
        durationMinutes: 60,
        price: '19.99',
        paymentType: ServicePaymentType.STRIPE,
        scheduleText: 'Viernes por la tarde',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-bienestar-experience',
        managerId: salvadoraManager.id,
        requiresApproval: false,
      },
    ];

    const seededServices: Service[] = [];
    for (const s of serviceList) {
      let existing = await this.servicesRepo.findOne({ where: { name: s.name } });
      if (!existing) {
        existing = await this.servicesRepo.save(this.servicesRepo.create(s));
      } else {
        Object.assign(existing, s);
        existing = await this.servicesRepo.save(existing);
      }
      seededServices.push(existing);
    }
    const svcMap = new Map(seededServices.map((s) => [s.name, s]));

    // ─── 10 Realistic Contacts ───
    const contactSeed = [
      {
        name: 'Lucía Fernández',
        phone: '+34611200301',
        email: 'lucia.fernandez@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['demo', 'yoga', 'retiro', 'ayuno'],
        notes: '[DEMO] Alumna regular de Vinyasa Yoga. Inscrita en el próximo Retiro de Ayuno Terapéutico.',
      },
      {
        name: 'Carlos Ruiz',
        phone: '+34611200302',
        email: 'carlos.ruiz@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['demo', 'gong', 'relajacion'],
        notes: '[DEMO] Asiste a baños de gong mensuales para aliviar estrés laboral. Prefiere sesiones de tarde.',
      },
      {
        name: 'María García',
        phone: '+34611200303',
        email: 'maria.garcia@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.QUALIFIED,
        tags: ['demo', 'mujeres', 'eventos'],
        notes: '[DEMO] Interesada en el Encuentro de Mujeres. Pregunta por WhatsApp si ya se completó el quórum mínimo de 8 personas.',
      },
      {
        name: 'Javier Moreno',
        phone: '+34611200304',
        email: 'javier.moreno@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.WON,
        tags: ['demo', 'gestalt'],
        notes: '[DEMO] Proceso de psicoterapia Gestalt en curso con Salvadora Conesa. Sesión quincenal.',
      },
      {
        name: 'Ana Martín',
        phone: '+34611200305',
        email: 'ana.martin@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['demo', 'gong', 'puja', 'sonoterapia'],
        notes: '[DEMO] Confirmada para la próxima Puja de Gong nocturna. Traerá su propio zafu y manta.',
      },
      {
        name: 'David López',
        phone: '+34611200306',
        email: 'david.lopez@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.CONTACTED,
        tags: ['demo', 'constelaciones'],
        notes: '[DEMO] Solicitó información para constelar un conflicto familiar en el taller del sábado.',
      },
      {
        name: 'Elena Sánchez',
        phone: '+34611200307',
        email: 'elena.sanchez@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.WON,
        tags: ['demo', 'yoga', 'gong', 'vip'],
        notes: '[DEMO] Miembro del centro desde 2023. Combina abono mensual de Yoga y Baños de Gong.',
      },
      {
        name: 'Pablo Díaz',
        phone: '+34611200308',
        email: 'pablo.diaz@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.QUALIFIED,
        tags: ['demo', 'ayuno', 'retiro'],
        notes: '[DEMO] Preinscrito al Ayuno Terapéutico. Informado de que se confirmará definitivamente al llegar al cupo de 6 participantes.',
      },
      {
        name: 'Carmen Jiménez',
        phone: '+34611200309',
        email: 'carmen.jimenez@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.NEW,
        tags: ['demo', 'mujeres', 'yoga-suave'],
        notes: '[DEMO] Nueva interesada en el Círculo de Mujeres y clases de yoga restaurativo.',
      },
      {
        name: 'Sergio Romero',
        phone: '+34611200310',
        email: 'sergio.romero@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['demo', 'gestalt', 'gong'],
        notes: '[DEMO] Combina sesiones individuales de Gestalt con baños de gong de integración emocional.',
      },
    ];

    const contacts = await this.contactsRepo.save(
      contactSeed.map((c) => this.contactsRepo.create(c)),
    );

    // ─── Date helpers (relative to "now" so the demo is always current) ───
    const nowZ = new TZDate(Date.now(), TZ);
    const baseY = nowZ.getFullYear();
    const baseMo = nowZ.getMonth();
    const baseD = nowZ.getDate();

    const dayParts = (offset: number) => {
      const d = new TZDate(baseY, baseMo, baseD + offset, 12, 0, TZ);
      return { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), dow: d.getDay() };
    };
    const isoAt = (p: { y: number; mo: number; d: number }, hh: number, mm = 0) =>
      new TZDate(p.y, p.mo, p.d, hh, mm, TZ).toISOString();
    const plusMin = (iso: string, min: number) =>
      new Date(new Date(iso).getTime() + min * 60000).toISOString();

    // Upcoming weekdays starting today, and a couple of past ones.
    const fwd: ReturnType<typeof dayParts>[] = [];
    for (let off = 0; fwd.length < 9; off++) {
      const p = dayParts(off);
      if (p.dow >= 1 && p.dow <= 6) fwd.push(p);
    }
    const back: ReturnType<typeof dayParts>[] = [];
    for (let off = -1; back.length < 2; off--) {
      const p = dayParts(off);
      if (p.dow >= 1 && p.dow <= 6) back.push(p);
    }

    // ─── 14 Realistic Appointments across calendars & statuses ───
    const specs: {
      day: { y: number; mo: number; d: number };
      hh: number;
      mm: number;
      c: number;
      s: { name: string; dur: number };
      st: AppointmentStatus;
      notes?: string;
      cancellationReason?: string;
      reason?: string;
      modality?: string;
      responseDocument?: any;
    }[] = [
      // Hoy
      { day: fwd[0], hh: 9, mm: 45, c: 0, s: SVC.yoga, st: AppointmentStatus.SCHEDULED, notes: 'Clase matinal de Hatha Yoga Terapéutico' },
      { day: fwd[0], hh: 17, mm: 0, c: 3, s: SVC.gestalt, st: AppointmentStatus.SCHEDULED, notes: 'Sesión individual de Terapia Gestalt', modality: 'in_person' as const },
      { day: fwd[0], hh: 18, mm: 30, c: 1, s: SVC.gong, st: AppointmentStatus.SCHEDULED, notes: 'Baño de Gong y Meditación Sonora' },

      // Mañana
      { day: fwd[1], hh: 10, mm: 0, c: 4, s: SVC.constelaciones, st: AppointmentStatus.SCHEDULED, notes: 'Taller de Constelaciones Familiares - Constelar' },
      { day: fwd[1], hh: 16, mm: 0, c: 2, s: SVC.yoga, st: AppointmentStatus.SCHEDULED, notes: 'Hatha Yoga turno de tarde' },
      { day: fwd[1], hh: 18, mm: 0, c: 5, s: SVC.ayuno, st: AppointmentStatus.PENDING_APPROVAL, notes: 'Consulta de valoración previa para Retiro de Ayuno Terapéutico', modality: 'virtual' as const },

      // Días siguientes
      { day: fwd[2], hh: 10, mm: 0, c: 6, s: SVC.mujeres, st: AppointmentStatus.SCHEDULED, notes: 'Encuentro de Mujeres (Primavera)' },
      { day: fwd[2], hh: 19, mm: 0, c: 7, s: SVC.yoga, st: AppointmentStatus.SCHEDULED, notes: 'Hatha Yoga Terapéutico para principiantes' },
      { day: fwd[3], hh: 21, mm: 0, c: 8, s: SVC.puja, st: AppointmentStatus.SCHEDULED, notes: 'Puja de Gongs - Noche Sagrada de Sonido' },
      { day: fwd[3], hh: 14, mm: 0, c: 9, s: SVC.meditacion, st: AppointmentStatus.SCHEDULED, notes: 'Meditación Guiada del mediodía' },
      { day: fwd[4], hh: 17, mm: 30, c: 0, s: SVC.bienestar, st: AppointmentStatus.SCHEDULED, notes: 'Bienestar Experience - Longevidad y Bienestar Integral' },
      { day: fwd[5], hh: 11, mm: 15, c: 2, s: SVC.yoga, st: AppointmentStatus.SCHEDULED, notes: 'Hatha Yoga Terapéutico grupo matinal' },

      // Citas pasadas completadas
      { day: back[0], hh: 18, mm: 0, c: 1, s: SVC.gong, st: AppointmentStatus.COMPLETED, notes: 'Baño de Gong completado con éxito' },
      { day: back[0], hh: 9, mm: 45, c: 0, s: SVC.yoga, st: AppointmentStatus.COMPLETED, notes: 'Clase matinal de Hatha Yoga completada' },
      { day: back[1], hh: 17, mm: 0, c: 3, s: SVC.gestalt, st: AppointmentStatus.COMPLETED, notes: 'Sesión individual de Terapia Gestalt completada' },
    ];

    const appts = specs.map((sp) => {
      const startsAt = isoAt(sp.day, sp.hh, sp.mm);
      const svcEntity = svcMap.get(sp.s.name);
      return this.appointmentsRepo.create({
        contactId: contacts[sp.c].id,
        service: sp.s.name,
        serviceId: svcEntity?.id ?? null,
        calendarId: svcEntity?.calendarId ?? 'default',
        price: svcEntity?.price ?? null,
        startsAt: new Date(startsAt),
        endsAt: new Date(plusMin(startsAt, sp.s.dur)),
        status: sp.st,
        modality: (sp as any).modality ?? 'in_person',
        reason: (sp as any).reason ?? null,
        responseDocument: (sp as any).responseDocument ?? null,
        notes: sp.notes ?? null,
        cancellationReason: sp.cancellationReason ?? null,
        cancelledAt: sp.st === AppointmentStatus.CANCELLED ? new Date() : null,
      });
    });
    await this.appointmentsRepo.save(appts);

    // ─── WhatsApp & Web Widget Conversations ───
    const thread = (
      contact: Contact,
      channel: MessageChannel,
      threadId: string,
      lines: [MessageDirection, string][],
    ) =>
      lines.map(([direction, body]) =>
        this.messagesRepo.create({
          contactId: contact.id,
          threadId,
          direction,
          channel,
          body,
        }),
      );

    const messages = [
      // 1. Canal WhatsApp - Lucía Gómez
      ...thread(
        contacts[0],
        MessageChannel.WHATSAPP,
        `booking:${contacts[0].phone}`,
        [
          [MessageDirection.INBOUND, '¡Hola! Quería consultar sobre el próximo Retiro de Ayuno Terapéutico.'],
          [
            MessageDirection.OUTBOUND,
            '¡Hola Lucía! Qué alegría saludarte. El retiro de ayuno está programado para los próximos días. Es guiado y supervisado paso a paso.',
          ],
          [MessageDirection.INBOUND, '¿Es necesario un grupo mínimo para que se realice?'],
          [
            MessageDirection.OUTBOUND,
            'Sí, para garantizar la dinámica grupal necesitamos un mínimo de 6 participantes. ¡Actualmente llevamos 5 preinscripciones, por lo que con una más quedará 100% confirmado!',
          ],
        ],
      ),
      // 2. Canal WhatsApp - Carlos Ruiz
      ...thread(
        contacts[1],
        MessageChannel.WHATSAPP,
        `booking:${contacts[1].phone}`,
        [
          [MessageDirection.INBOUND, 'Buenas tardes, ¿qué tengo que llevar para el Baño de Gong de las 18:00?'],
          [
            MessageDirection.OUTBOUND,
            '¡Hola Carlos! Te recomendamos ropa cómoda y abrigada (calcetines calientes). En la sala disponemos de esterillas, zafus y mantas, pero puedes traer tu propia manta si lo prefieres.',
          ],
          [MessageDirection.INBOUND, 'Perfecto, muchas gracias. Allí nos vemos.'],
          [MessageDirection.OUTBOUND, '¡A ti! Te esperamos a las 18:00 para disfrutar del sonido y la vibración del Gong.'],
        ],
      ),
      // 3. Canal Web Landing (Burbuja) - Elena Navarro
      ...thread(
        contacts[2],
        MessageChannel.WIDGET,
        `booking:widget-sess-landing-elena`,
        [
          [MessageDirection.INBOUND, 'Hola, he visto vuestra landing y me gustaría reservar una Clase de Hatha Yoga para probar.'],
          [
            MessageDirection.OUTBOUND,
            '¡Hola Elena! Bienvenida a la Escuela de Yoga Salvadora Conesa. Con mucho gusto te ayudamos a reservar tu primera clase de Hatha Yoga. ¿Qué día de esta semana te vendría mejor, por la mañana o por la tarde?',
          ],
          [MessageDirection.INBOUND, 'El martes por la tarde me vendría genial, sobre las 18:00.'],
          [
            MessageDirection.OUTBOUND,
            '¡Perfecto! Tenemos hueco disponible el martes a las 18:00 con Laura Navarro. Te he pre-reservado la plaza. Te esperamos en Calle Holanda 1.',
          ],
        ],
      ),
      // 4. Canal Web Landing (Burbuja) - David Martínez
      ...thread(
        contacts[3],
        MessageChannel.WIDGET,
        `booking:widget-sess-landing-david`,
        [
          [MessageDirection.INBOUND, 'Buenas, ¿hacéis sesiones individuales de Terapia Gestalt online por videollamada?'],
          [
            MessageDirection.OUTBOUND,
            '¡Hola David! Sí, Salvadora Conesa ofrece sesiones de Terapia Gestalt tanto presenciales como virtuales a través de videollamada. ¿Te gustaría consultar los horarios disponibles?',
          ],
        ],
      ),
    ];

    // Demo image attachment
    const demoImageSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="260">` +
      `<rect width="360" height="260" fill="#fef3c7"/>` +
      `<circle cx="180" cy="110" r="55" fill="#f59e0b"/>` +
      `<circle cx="180" cy="110" r="45" fill="#d97706"/>` +
      `<text x="180" y="220" font-family="sans-serif" font-size="16" fill="#92400e" font-weight="bold" text-anchor="middle">Sonoterapia &amp; Yoga Prana</text>` +
      `</svg>`;

    messages.push(
      this.messagesRepo.create({
        contactId: contacts[1].id,
        threadId: `booking:${contacts[1].phone}`,
        direction: MessageDirection.INBOUND,
        channel: MessageChannel.WHATSAPP,
        body: '📷 Imagen',
        mediaType: MediaType.IMAGE,
        mediaUrl:
          'data:image/svg+xml;base64,' +
          Buffer.from(demoImageSvg).toString('base64'),
        mediaMimeType: 'image/svg+xml',
      }),
    );

    await this.messagesRepo.save(messages);
    // Messages were inserted directly (not through MessagesService), so build
    // their conversation rows now — otherwise the seeded threads wouldn't show
    // up in the inbox (which reads from `conversations`).
    await this.messagesService.rebuildAllConversations();

    this.logger.log(
      `Demo data seeded: ${contacts.length} contacts, ${appts.length} appointments, ${seededServices.length} services, ${messages.length} messages`,
    );
  }

  private async ensureVapiDemo() {
    try {
      // 1. Ensure default VapiAccount with the user's keys and phone
      const [existingVapi] = await this.vapiAccountRepo.find({ take: 1 });
      if (!existingVapi) {
        const vapi = this.vapiAccountRepo.create({
          apiKey: '68c4794-d264-4891-9d7e-b3fe5f33f2a1',
          webhookToken: 'c2e1406a-8991-474e-9279-6283be7c02dd',
          phoneNumber: '+34919933764',
          phoneNumberId: '+34919933764@sip.vapi.ai',
          handoffNumber: '+34919933764',
          voiceProvider: '11labs',
          voiceId: 'UOIqAnmS11Reiei1Ytkc',
          voiceModel: 'eleven_turbo_v2_5',
          transcriberProvider: 'deepgram',
          transcriberModel: 'nova-3-general',
          transcriberLanguage: 'es',
          llmProvider: 'openai',
          llmModel: 'gpt-5.6-luna',
          tone: 'professional',
          maxDurationSeconds: 600,
          isActive: true,
        });
        await this.vapiAccountRepo.save(vapi);
        this.logger.log('Seeded default VapiAccount credentials and phone number.');
      } else {
        existingVapi.apiKey = '868c4794-d264-4891-9d7e-b3fe5f33f2a1';
        existingVapi.webhookToken = 'c2e1406a-8991-474e-9279-6283be7c02dd';
        existingVapi.phoneNumber = '+34919933764';
        existingVapi.phoneNumberId = '+34919933764@sip.vapi.ai';
        existingVapi.isActive = true;
        await this.vapiAccountRepo.save(existingVapi);
        this.logger.log('Updated VapiAccount with configured API key and phone number.');
      }

      // 2. Ensure demo Call records if none exist
      const existingCallsCount = await this.callsRepo.count();
      if (existingCallsCount === 0) {
        this.logger.log('Seeding realistic demo calls for VAPI voice channel...');
        const contacts = await this.contactsRepo.find();
        const maria = contacts.find((c) => c.name.includes('María')) || contacts[0];
        const david = contacts.find((c) => c.name.includes('David')) || contacts[1] || maria;
        const lucia = contacts.find((c) => c.name.includes('Lucía')) || contacts[2] || maria;
        const carlos = contacts.find((c) => c.name.includes('Carlos')) || contacts[3] || maria;
        const elena = contacts.find((c) => c.name.includes('Elena')) || contacts[4] || maria;

        const demoCalls: Partial<Call>[] = [
          {
            vapiCallId: 'demo-call-001',
            direction: CallDirection.INBOUND,
            fromNumber: maria?.phone || '+34612345678',
            toNumber: '+34919933764',
            status: CallStatus.ENDED,
            startedAt: new Date(Date.now() - 3600 * 1000 * 2),
            endedAt: new Date(Date.now() - 3600 * 1000 * 2 + 84 * 1000),
            durationSeconds: 84,
            endedReason: 'customer-ended-call',
            costCents: 15,
            needsReview: false,
            summary: 'María Morales llamó solicitando plaza para el Baño de Gong y Meditación Sonora. El asistente consultó la agenda, le ofreció huecos disponibles y formalizó la reserva para el viernes a las 18:00.',
            transcript: 'Asistente: Centro Holístico y Escuela de Yoga Salvadora Conesa, le atiende el asistente virtual. ¿En qué puedo ayudarle?\nCliente: Hola, buenas tardes. Quería reservar plaza para el próximo Baño de Gong.\nAsistente: Por supuesto María. Para el Baño de Gong y Meditación Sonora disponemos de hueco este viernes a las 18:00 y a las 20:00. ¿Cuál prefieres?\nCliente: El viernes a las 18:00 me viene genial.\nAsistente: Perfecto, queda confirmada tu plaza para el viernes a las 18:00. Recuerda traer ropa cómoda y calcetines calientes. ¡Te esperamos!\nCliente: Gracias, nos vemos el viernes.',
            messages: [
              { role: 'assistant', message: 'Centro Holístico y Escuela de Yoga Salvadora Conesa, le atiende el asistente virtual. ¿En qué puedo ayudarle?' },
              { role: 'customer', message: 'Hola, buenas tardes. Quería reservar plaza para el próximo Baño de Gong.' },
              { role: 'tool', message: 'consultar_huecos({"servicio":"Baño de Gong"}) -> Huecos disponibles: viernes 18:00, viernes 20:00' },
              { role: 'assistant', message: 'Por supuesto María. Para el Baño de Gong y Meditación Sonora disponemos de hueco este viernes a las 18:00 y a las 20:00. ¿Cuál prefieres?' },
              { role: 'customer', message: 'El viernes a las 18:00 me viene genial.' },
              { role: 'tool', message: 'reservar_cita({"servicio":"Baño de Gong y Meditación Sonora","inicioIso":"2026-10-02T18:00:00.000Z"}) -> Cita confirmada' },
              { role: 'assistant', message: 'Perfecto, queda confirmada tu plaza para el viernes a las 18:00. Recuerda traer ropa cómoda y calcetines calientes. ¡Te esperamos!' },
              { role: 'customer', message: 'Gracias, nos vemos el viernes.' },
            ],
            recordingUrl: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
            contact: maria,
          },
          {
            vapiCallId: 'demo-call-002',
            direction: CallDirection.INBOUND,
            fromNumber: david?.phone || '+34623456789',
            toNumber: '+34919933764',
            status: CallStatus.ENDED,
            startedAt: new Date(Date.now() - 3600 * 1000 * 5),
            endedAt: new Date(Date.now() - 3600 * 1000 * 5 + 62 * 1000),
            durationSeconds: 62,
            endedReason: 'customer-ended-call',
            costCents: 11,
            needsReview: false,
            summary: 'David Navarro consultó los horarios de las clases de Hatha Yoga Terapéutico y las modalidades de inscripción. El asistente le detalló los turnos y le ofreció probar una sesión.',
            transcript: 'Asistente: Hola, Centro Holístico Salvadora Conesa. ¿En qué puedo orientarle hoy?\nCliente: Hola, quería saber qué horarios tenéis para Hatha Yoga y cómo funciona.\nAsistente: Hola David. El Hatha Yoga Terapéutico se imparte los martes y jueves por la mañana a las 9:45 y 11:15, y por las tardes a las 17:00, 18:30 y 20:00. ¿Te gustaría venir a probar una primera clase?\nCliente: Sí, me gustaría ir el jueves por la mañana.\nAsistente: Perfecto, te anoto para el jueves a las 9:45. ¡Te esperamos!',
            messages: [
              { role: 'assistant', message: 'Hola, Centro Holístico Salvadora Conesa. ¿En qué puedo orientarle hoy?' },
              { role: 'customer', message: 'Hola, quería saber qué horarios tenéis para Hatha Yoga y cómo funciona.' },
              { role: 'tool', message: 'datos_del_negocio({"tipo":"servicios_precios"}) -> Hatha Yoga Terapéutico: Mañanas y tardes martes y jueves' },
              { role: 'assistant', message: 'Hola David. El Hatha Yoga Terapéutico se imparte los martes y jueves por la mañana a las 9:45 y 11:15, y por las tardes a las 17:00, 18:30 y 20:00. ¿Te gustaría venir a probar una primera clase?' },
              { role: 'customer', message: 'Sí, me gustaría ir el jueves por la mañana.' },
              { role: 'assistant', message: 'Perfecto, te anoto para el jueves a las 9:45. ¡Te esperamos!' },
            ],
            contact: david,
          },
          {
            vapiCallId: 'demo-call-003',
            direction: CallDirection.OUTBOUND,
            fromNumber: '+34919933764',
            toNumber: lucia?.phone || '+34634567890',
            status: CallStatus.ENDED,
            startedAt: new Date(Date.now() - 3600 * 1000 * 18),
            endedAt: new Date(Date.now() - 3600 * 1000 * 18 + 48 * 1000),
            durationSeconds: 48,
            endedReason: 'assistant-ended-call',
            costCents: 9,
            needsReview: false,
            summary: 'Llamada automática saliente de recordatorio para la sesión individual de Terapia Gestalt con Salvadora Conesa programada para mañana a las 17:00. La paciente confirmó asistencia.',
            transcript: 'Asistente: Hola Lucía, te llamo del Centro Salvadora para recordarte tu sesión de Terapia Gestalt con Salvadora Conesa mañana a las 17:00. ¿Podrás asistir puntualmente?\nCliente: Sí, por supuesto, allí estaré puntual.\nAsistente: Estupendo Lucía, te esperamos mañana a las 17:00 en Calle Holanda 1. ¡Que tengas muy buen día!\nCliente: Muchas gracias, hasta mañana.',
            messages: [
              { role: 'assistant', message: 'Hola Lucía, te llamo del Centro Salvadora para recordarte tu sesión de Terapia Gestalt con Salvadora Conesa mañana a las 17:00. ¿Podrás asistir puntualmente?' },
              { role: 'customer', message: 'Sí, por supuesto, allí estaré puntual.' },
              { role: 'assistant', message: 'Estupendo Lucía, te esperamos mañana a las 17:00 en Calle Holanda 1. ¡Que tengas muy buen día!' },
              { role: 'customer', message: 'Muchas gracias, hasta mañana.' },
            ],
            contact: lucia,
          },
          {
            vapiCallId: 'demo-call-004',
            direction: CallDirection.INBOUND,
            fromNumber: carlos?.phone || '+34645678901',
            toNumber: '+34919933764',
            status: CallStatus.ENDED,
            startedAt: new Date(Date.now() - 3600 * 1000 * 28),
            endedAt: new Date(Date.now() - 3600 * 1000 * 28 + 92 * 1000),
            durationSeconds: 92,
            endedReason: 'customer-ended-call',
            costCents: 17,
            needsReview: false,
            summary: 'Carlos Ruiz llamó para cambiar el horario de su clase de Hatha Yoga del martes por la tarde debido a un viaje. El asistente reubicó la asistencia al jueves.',
            transcript: 'Asistente: Centro Holístico y Escuela de Yoga Salvadora Conesa, ¿en qué puedo ayudarte?\nCliente: Hola, tenía clase de Hatha Yoga el martes a las 18:30 pero estoy de viaje. ¿Puedo cambiarla al jueves?\nAsistente: Claro Carlos. En el grupo de jueves a las 17:30 tenemos plaza libre. ¿Te viene bien?\nCliente: Sí, genial, perfecto.\nAsistente: Queda actualizada tu asistencia para el jueves a las 17:30. ¡Buen viaje y hasta el jueves!\nCliente: Muchas gracias por la facilidad.',
            messages: [
              { role: 'assistant', message: 'Centro Holístico y Escuela de Yoga Salvadora Conesa, ¿en qué puedo ayudarte?' },
              { role: 'customer', message: 'Hola, tenía clase de Hatha Yoga el martes a las 18:30 pero estoy de viaje. ¿Puedo cambiarla al jueves?' },
              { role: 'tool', message: 'reprogramar_cita({"inicioIso":"2026-10-01T17:30:00.000Z"}) -> Cita actualizada con éxito' },
              { role: 'assistant', message: 'Queda actualizada tu asistencia para el jueves a las 17:30. ¡Buen viaje y hasta el jueves!' },
              { role: 'customer', message: 'Muchas gracias por la facilidad.' },
            ],
            contact: carlos,
          },
          {
            vapiCallId: 'demo-call-005',
            direction: CallDirection.INBOUND,
            fromNumber: elena?.phone || '+34656789012',
            toNumber: '+34919933764',
            status: CallStatus.ENDED,
            startedAt: new Date(Date.now() - 3600 * 1000 * 35),
            endedAt: new Date(Date.now() - 3600 * 1000 * 35 + 115 * 1000),
            durationSeconds: 115,
            endedReason: 'customer-ended-call',
            costCents: 22,
            needsReview: false,
            notes: 'Alumna interesada en el Retiro de Ayuno Terapéutico. Se le informó de los requisitos y preparación previa.',
            summary: 'Elena Vega llamó para pedir información detallada sobre las fechas, preparación y acompañamiento en el Retiro de Ayuno Terapéutico. El asistente resolvió sus dudas y programó una llamada de contacto con Salvadora Conesa.',
            transcript: 'Asistente: Buenos días, Centro Salvadora Conesa. ¿En qué te podemos ayudar?\nCliente: Hola, me interesa mucho el Retiro de Ayuno Terapéutico, pero nunca he hecho ayuno y tengo dudas de si es apto para mí.\nAsistente: Hola Elena. En el retiro todo el proceso se realiza bajo supervisión y acompañamiento cercano de Salvadora Conesa, con preparación dietética previa y dinámicas de yoga suave y meditación. Si lo deseas, puedo dejar nota a Salvadora para que te llame y valore tu caso personalmente.\nCliente: Sí por favor, me daría muchísima tranquilidad hablar con ella.\nAsistente: Queda anotado tu teléfono. Salvadora se pondrá en contacto contigo esta tarde. ¡Muchas gracias por tu interés!',
            messages: [
              { role: 'assistant', message: 'Buenos días, Centro Salvadora Conesa. ¿En qué te podemos ayudar?' },
              { role: 'customer', message: 'Hola, me interesa mucho el Retiro de Ayuno Terapéutico, pero nunca he hecho ayuno y tengo dudas de si es apto para mí.' },
              { role: 'tool', message: 'registrar_aviso({"motivo":"Información y valoración personal para Retiro de Ayuno"}) -> Aviso registrado para Salvadora Conesa' },
              { role: 'assistant', message: 'Queda anotado tu teléfono. Salvadora se pondrá en contacto contigo esta tarde. ¡Muchas gracias por tu interés!' },
              { role: 'customer', message: 'Muchas gracias, un saludo.' },
            ],
            contact: elena,
          },
        ];

        for (const callData of demoCalls) {
          const call = this.callsRepo.create(callData);
          await this.callsRepo.save(call);
        }
        this.logger.log('Successfully seeded 5 realistic demo calls with transcripts and summaries.');
      }
    } catch (err) {
      this.logger.warn(`Could not ensure VAPI demo data: ${(err as Error)?.message}`);
    }
  }
}

