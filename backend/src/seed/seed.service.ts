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
import { generateDoctorReportPdfBuffer } from '../appointments/pdf-report.generator';
import { getSampleLumbarRadiographyBuffer } from '../appointments/sample-radiography';

// Business timezone the demo appointments are placed in. TZDate converts the
// wall-clock time below into the correct UTC instant (handles CET/CEST).
const TZ = 'Europe/Madrid';

// Service keys & durations for seed mapping
const SVC = {
  medica: { name: 'Consulta Médica y Diagnóstico Clínico', dur: 45 },
  fisio: { name: 'Fisioterapia y Rehabilitación Postural', dur: 60 },
  yoga: { name: 'Hatha Yoga Terapéutico', dur: 90 },
  pilates: { name: 'Pilates', dur: 60 },
  ninjutsu: { name: 'Bujinkan Budo Taijutsu / Ninjutsu', dur: 90 },
  funcional: { name: 'Entrenamiento Funcional', dur: 60 },
  orientales: { name: 'Actividades Orientales (Daruma, Kaisai, Kobudo)', dur: 55 },
  taichi: { name: 'Tai Chi Chuan', dur: 90 },
  iaido: { name: 'Iaido (Esgrima Japonesa)', dur: 60 },
  finde: { name: 'Sesión Mensual de Fin de Semana (Baño de Gong / Talleres)', dur: 120 },
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
      await this.ensureDoctorDemo();
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
        name: 'Dr. Carlos Mendoza (Responsable de Citas / Doctor)',
        email: 'doctor@demo.com',
        role: UserRole.SERVICE_MANAGER,
      },
      {
        name: 'Laura Navarro (Shakti - Resp. Yoga)',
        email: 'yoga@crmacademy.local',
        role: UserRole.SERVICE_MANAGER,
      },
      {
        name: 'Marcos Benítez (Vikram - Maestro de Gong)',
        email: 'gong@crmacademy.local',
        role: UserRole.SERVICE_MANAGER,
      },
      {
        name: 'Dra. Elena Salgado (Resp. Gestalt y Constelaciones)',
        email: 'gestalt@crmacademy.local',
        role: UserRole.SERVICE_MANAGER,
      },
      {
        name: 'Silvia Morales (Resp. Encuentros y Retiros)',
        email: 'eventos@crmacademy.local',
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
        u.passwordHash = defaultPasswordHash;
        u.role = m.role;
        u.isActive = true;
        await this.usersRepo.save(u);
      }
      managers[m.email] = u;
    }

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
        managerId: managers['yoga@crmacademy.local'].id,
        requiresApproval: false,
      },
      {
        name: SVC.pilates.name,
        description: 'Fortalecimiento del core, postura, movilidad y control corporal en grupos reducidos.',
        durationMinutes: 60,
        price: '0.00',
        paymentType: ServicePaymentType.FREE,
        scheduleText: 'Lunes y Miércoles de 12:00 a 13:00',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-pilates',
        managerId: managers['yoga@crmacademy.local'].id,
        requiresApproval: false,
      },
      {
        name: SVC.ninjutsu.name,
        description: 'Arte marcial tradicional japonés de defensa personal, biomecánica y acondicionamiento.',
        durationMinutes: 90,
        price: '0.00',
        paymentType: ServicePaymentType.FREE,
        scheduleText: 'Mañanas: Lunes y Viernes de 10:00 a 11:30 | Tardes: Lunes y Miércoles de 20:00 a 21:30',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-ninjutsu',
        managerId: managers['gong@crmacademy.local'].id,
        requiresApproval: false,
      },
      {
        name: SVC.funcional.name,
        description: 'Entrenamiento funcional de alta energía para fuerza, resistencia y salud cardiovascular.',
        durationMinutes: 60,
        price: '0.00',
        paymentType: ServicePaymentType.FREE,
        scheduleText: 'Mañanas: Lunes, Miércoles y Viernes de 7:15 a 8:15 | Tardes: Lunes y Miércoles de 19:00 a 20:00',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-funcional',
        managerId: managers['yoga@crmacademy.local'].id,
        requiresApproval: false,
      },
      {
        name: SVC.orientales.name,
        description: 'Disciplinas orientales tradicionales: Daruma (19:00), Kaisai (20:00) y Kobudo con armas (21:00).',
        durationMinutes: 55,
        price: '0.00',
        paymentType: ServicePaymentType.FREE,
        scheduleText: 'Martes y Jueves: Daruma (19:00-19:55) | Kaisai (20:00-20:55) | Kobudo (21:00-21:45)',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-orientales',
        managerId: managers['gong@crmacademy.local'].id,
        requiresApproval: false,
      },
      {
        name: SVC.taichi.name,
        description: 'Movimientos fluidos, respiración consciente, equilibrio y desbloqueo articular.',
        durationMinutes: 90,
        price: '0.00',
        paymentType: ServicePaymentType.FREE,
        scheduleText: 'Miércoles de 17:30 a 19:00 | Viernes de 10:00 a 11:30',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-taichi',
        managerId: managers['yoga@crmacademy.local'].id,
        requiresApproval: false,
      },
      {
        name: SVC.iaido.name,
        description: 'Esgrima japonesa tradicional con katana. Precisión, concentración, corte y etiqueta marcial.',
        durationMinutes: 60,
        price: '0.00',
        paymentType: ServicePaymentType.FREE,
        scheduleText: 'Lunes de 20:00 a 21:00 | Jueves de 20:30 a 22:00',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-iaido',
        managerId: managers['gong@crmacademy.local'].id,
        requiresApproval: false,
      },
      {
        name: SVC.finde.name,
        description: 'Talleres mensuales: Baño de Gong, Constelaciones Familiares, Chi Kung, Masajes, Meditación y Yoga Nidra.',
        durationMinutes: 120,
        price: '35.00',
        paymentType: ServicePaymentType.STRIPE,
        scheduleText: 'Una sesión al mes en fin de semana (Sábados/Domingos)',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-finde',
        managerId: managers['eventos@crmacademy.local'].id,
        requiresApproval: true,
      },
      {
        name: SVC.medica.name,
        description: 'Consulta médica especializada para evaluación diagnóstica, anamnesis, prescripción de tratamiento y seguimiento clínico.',
        durationMinutes: 45,
        price: '50.00',
        paymentType: ServicePaymentType.STRIPE,
        scheduleText: 'Lunes a Viernes de 9:00 a 14:00 y 16:00 a 19:00',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-medica',
        managerId: managers['doctor@demo.com'].id,
        requiresApproval: false,
        requiresReason: true,
        allowedModalities: ['in_person', 'phone', 'virtual'],
      },
      {
        name: SVC.fisio.name,
        description: 'Tratamiento manual descontracturante, reeducación postural y rehabilitación músculo-esquelética.',
        durationMinutes: 60,
        price: '45.00',
        paymentType: ServicePaymentType.IN_PERSON,
        scheduleText: 'Lunes a Jueves de 10:00 a 20:00',
        flyerUrl: '/flyer-parque-granada.png',
        calendarId: 'cal-fisio',
        managerId: managers['doctor@demo.com'].id,
        requiresApproval: true,
        requiresReason: true,
        allowedModalities: ['in_person', 'virtual'],
      },
    ];

    const seededServices = await this.servicesRepo.save(
      serviceList.map((s) => this.servicesRepo.create(s)),
    );
    const svcMap = new Map(seededServices.map((s) => [s.name, s]));

    // ─── 10 Realistic Contacts ───
    const contactSeed = [
      {
        name: 'Lucía Fernández',
        phone: '+34611200301',
        email: 'lucia.fernandez@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['yoga', 'retiro', 'ayuno'],
        notes: 'Alumna regular de Vinyasa Yoga. Inscrita en el próximo Retiro de Ayuno Terapéutico.',
      },
      {
        name: 'Carlos Ruiz',
        phone: '+34611200302',
        email: 'carlos.ruiz@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['gong', 'relajacion'],
        notes: 'Asiste a baños de gong mensuales para aliviar estrés laboral. Prefiere sesiones de tarde.',
      },
      {
        name: 'María García',
        phone: '+34611200303',
        email: 'maria.garcia@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.QUALIFIED,
        tags: ['mujeres', 'eventos'],
        notes: 'Interesada en el Encuentro de Mujeres. Pregunta por WhatsApp si ya se completó el quórum mínimo de 8 personas.',
      },
      {
        name: 'Javier Moreno',
        phone: '+34611200304',
        email: 'javier.moreno@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.WON,
        tags: ['gestalt'],
        notes: 'Proceso de psicoterapia Gestalt en curso con la Dra. Elena Salgado. Sesión quincenal.',
      },
      {
        name: 'Ana Martín',
        phone: '+34611200305',
        email: 'ana.martin@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['gong', 'puja', 'sonoterapia'],
        notes: 'Confirmada para la próxima Puja de Gong nocturna. Traerá su propio zafu y manta.',
      },
      {
        name: 'David López',
        phone: '+34611200306',
        email: 'david.lopez@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.CONTACTED,
        tags: ['constelaciones'],
        notes: 'Solicitó información para constelar un conflicto familiar en el taller del sábado.',
      },
      {
        name: 'Elena Sánchez',
        phone: '+34611200307',
        email: 'elena.sanchez@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.WON,
        tags: ['yoga', 'gong', 'vip'],
        notes: 'Miembro del centro desde 2023. Combina abono mensual de Yoga y Baños de Gong.',
      },
      {
        name: 'Pablo Díaz',
        phone: '+34611200308',
        email: 'pablo.diaz@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.QUALIFIED,
        tags: ['ayuno', 'retiro'],
        notes: 'Preinscrito al Ayuno Terapéutico. Informado de que se confirmará definitivamente al llegar al cupo de 6 participantes.',
      },
      {
        name: 'Carmen Jiménez',
        phone: '+34611200309',
        email: 'carmen.jimenez@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.NEW,
        tags: ['mujeres', 'yoga-suave'],
        notes: 'Nueva interesada en el Círculo de Mujeres y clases de yoga restaurativo.',
      },
      {
        name: 'Sergio Romero',
        phone: '+34611200310',
        email: 'sergio.romero@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['gestalt', 'gong'],
        notes: 'Combina sesiones individuales de Gestalt con baños de gong de integración emocional.',
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
      { day: fwd[0], hh: 11, mm: 0, c: 0, s: SVC.medica, st: AppointmentStatus.SCHEDULED, reason: 'Dolor lumbar agudo tras esfuerzo físico e inflamación paravertebral', notes: 'Paciente acude por dolor agudo de 4 días de evolución tras levantar peso.', modality: 'in_person' as const },
      { day: fwd[0], hh: 12, mm: 0, c: 1, s: SVC.pilates, st: AppointmentStatus.SCHEDULED, notes: 'Clase de Pilates - Prueba gratis' },
      { day: fwd[0], hh: 20, mm: 0, c: 3, s: SVC.ninjutsu, st: AppointmentStatus.SCHEDULED, notes: 'Bujinkan Budo Taijutsu / Ninjutsu - Clase de prueba' },

      // Mañana
      { day: fwd[1], hh: 7, mm: 15, c: 4, s: SVC.funcional, st: AppointmentStatus.SCHEDULED, notes: 'Entrenamiento Funcional matinal' },
      { day: fwd[1], hh: 12, mm: 0, c: 2, s: SVC.fisio, st: AppointmentStatus.PENDING_APPROVAL, reason: 'Evaluación de contractura cervical y mareos posturales', notes: 'Solicitud de sesión online para pautas posturales.', modality: 'virtual' as const },
      { day: fwd[1], hh: 17, mm: 0, c: 6, s: SVC.yoga, st: AppointmentStatus.SCHEDULED, notes: 'Hatha Yoga turno de tarde' },

      // Días siguientes
      { day: fwd[2], hh: 19, mm: 0, c: 5, s: SVC.orientales, st: AppointmentStatus.SCHEDULED, notes: 'Actividades Orientales (Daruma)' },
      { day: fwd[2], hh: 20, mm: 30, c: 9, s: SVC.iaido, st: AppointmentStatus.SCHEDULED, notes: 'Iaido - Esgrima Japonesa' },
      { day: fwd[3], hh: 10, mm: 0, c: 2, s: SVC.taichi, st: AppointmentStatus.SCHEDULED, notes: 'Tai Chi Chuan - Sesión matinal' },
      { day: fwd[3], hh: 18, mm: 0, c: 7, s: SVC.finde, st: AppointmentStatus.PENDING_APPROVAL, notes: 'Sesión Mensual de Baño de Gong en Fin de Semana' },
      { day: fwd[4], hh: 11, mm: 15, c: 8, s: SVC.yoga, st: AppointmentStatus.SCHEDULED, notes: 'Hatha Yoga Terapéutico' },
      { day: fwd[5], hh: 19, mm: 0, c: 1, s: SVC.funcional, st: AppointmentStatus.SCHEDULED, notes: 'Entrenamiento Funcional tarde' },

      // Citas pasadas completadas
      {
        day: back[0],
        hh: 10,
        mm: 0,
        c: 1,
        s: SVC.medica,
        st: AppointmentStatus.COMPLETED,
        reason: 'Revisión dorsolumbar y contractura persistente',
        notes: 'Diagnóstico emitido y firmado por el Dr. Carlos Mendoza.',
        modality: 'in_person' as const,
        responseDocument: {
          templateKey: 'clinical_diagnosis',
          title: 'Informe Clínico y Diagnóstico Lumbar',
          symptoms: 'Paciente varón de 42 años refiere dolor punzante en zona lumbar L4-L5 de 5 días de evolución.',
          diagnosis: 'Lumbalgia mecánica aguda con contractura muscular paravertebral bilateral sin compromiso radicular.',
          treatment: 'Reposo relativo 48h, calor seco local 20 min 3 veces al día, y 3 sesiones de fisioterapia descontracturante.',
          recommendations: 'Evitar sobrecargas y sedestación prolongada. Realizar estiramientos suaves de cadena posterior.',
          notes: 'Reevaluación en 7 días si persiste sintomatología dolorosa.',
          issuedAt: new Date(Date.now() - 86400000).toISOString(),
          signedBy: 'Dr. Carlos Mendoza (Colegiado Nº 28491)',
        },
      },
      { day: back[0], hh: 12, mm: 0, c: 0, s: SVC.pilates, st: AppointmentStatus.COMPLETED, notes: 'Primera clase de Pilates completada' },
      { day: back[1], hh: 20, mm: 0, c: 3, s: SVC.ninjutsu, st: AppointmentStatus.COMPLETED, notes: 'Sesión Ninjutsu completada' },
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
            '¡Hola David! Sí, la Dra. Elena Salgado ofrece sesiones de Terapia Gestalt tanto presenciales como virtuales a través de videollamada Cal.com. ¿Te gustaría consultar los horarios disponibles?',
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

  private async ensureDoctorDemo() {
    const defaultPasswordHash = await bcrypt.hash('Admin1234!', 10);
    let doctor = await this.usersRepo.findOne({ where: { email: 'doctor@demo.com' } });
    if (!doctor) {
      doctor = await this.usersRepo.save(
        this.usersRepo.create({
          name: 'Dr. Carlos Mendoza (Responsable de Citas / Doctor)',
          email: 'doctor@demo.com',
          passwordHash: defaultPasswordHash,
          role: UserRole.SERVICE_MANAGER,
          isActive: true,
        }),
      );
      this.logger.log('Demo user doctor@demo.com created/ensured');
    } else {
      doctor.passwordHash = defaultPasswordHash;
      doctor.role = UserRole.SERVICE_MANAGER;
      doctor.isActive = true;
      await this.usersRepo.save(doctor);
      this.logger.log('Demo user doctor@demo.com credentials refreshed with new hash');
    }

    // Ensure demo doctors and specialists exist
    const doctorSeeds = [
      {
        name: 'Dr. José Ignacio Gómez (Odontología & Diagnóstico)',
        email: 'jigomez@hotmail.com',
        role: UserRole.SERVICE_MANAGER,
      },
      {
        name: 'Dra. Elena Vázquez (Dermatología Clínica & Lesiones)',
        email: 'derma@demo.com',
        role: UserRole.SERVICE_MANAGER,
      },
      {
        name: 'Dra. Sofía Rivas (Medicina Estética & Facial)',
        email: 'estetica@demo.com',
        role: UserRole.SERVICE_MANAGER,
      },
      {
        name: 'Ana Beltrán (Recepción y Atención al Paciente)',
        email: 'recepcion@crmacademy.local',
        role: UserRole.EMPLOYEE,
      },
      {
        name: 'Marcos Soto (Auxiliar Clínico y Triaje)',
        email: 'auxiliar@crmacademy.local',
        role: UserRole.EMPLOYEE,
      },
    ];

    for (const doc of doctorSeeds) {
      const existing = await this.usersRepo.findOne({ where: { email: doc.email } });
      if (!existing) {
        await this.usersRepo.save(
          this.usersRepo.create({
            name: doc.name,
            email: doc.email,
            passwordHash: defaultPasswordHash,
            role: doc.role,
            isActive: true,
          }),
        );
        this.logger.log(`Demo user created: ${doc.email}`);
      }
    }

    let svcMedica = await this.servicesRepo.findOne({ where: { calendarId: 'cal-medica' } });
    if (!svcMedica) {
      svcMedica = await this.servicesRepo.save(
        this.servicesRepo.create({
          name: 'Consulta Médica y Diagnóstico Clínico',
          description: 'Consulta médica especializada para evaluación diagnóstica, anamnesis, prescripción de tratamiento y seguimiento clínico.',
          durationMinutes: 45,
          price: '50.00',
          paymentType: ServicePaymentType.STRIPE,
          scheduleText: 'Lunes a Viernes de 9:00 a 14:00 y 16:00 a 19:00',
          flyerUrl: '/flyer-parque-granada.png',
          calendarId: 'cal-medica',
          managerId: doctor.id,
          requiresApproval: false,
          requiresReason: true,
          allowedModalities: ['in_person', 'phone', 'virtual'],
        }),
      );
    }

    let svcFisio = await this.servicesRepo.findOne({ where: { calendarId: 'cal-fisio' } });
    if (!svcFisio) {
      svcFisio = await this.servicesRepo.save(
        this.servicesRepo.create({
          name: 'Fisioterapia y Rehabilitación Postural',
          description: 'Tratamiento manual descontracturante, reeducación postural y rehabilitación músculo-esquelética.',
          durationMinutes: 60,
          price: '45.00',
          paymentType: ServicePaymentType.IN_PERSON,
          scheduleText: 'Lunes a Jueves de 10:00 a 20:00',
          flyerUrl: '/flyer-parque-granada.png',
          calendarId: 'cal-fisio',
          managerId: doctor.id,
          requiresApproval: true,
          requiresReason: true,
          allowedModalities: ['in_person', 'virtual'],
        }),
      );
    }

    // Check if appointments for doctor exist; if not, create demo appointments
    const doctorAppts = await this.appointmentsRepo.find({
      where: [{ calendarId: 'cal-medica' }, { calendarId: 'cal-fisio' }],
      relations: ['contact'],
    });

    // Realistic lumbar radiography attachment
    const rxAttachment = getSampleLumbarRadiographyBuffer();

    if (doctorAppts.length === 0) {
      const contacts = await this.contactsRepo.find({ take: 3 });
      if (contacts.length > 0) {
        const now = new Date();
        const todayAt11 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0);
        const todayAt1145 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 45, 0);
        const yesterdayAt10 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 0, 0);
        const yesterdayAt1045 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 45, 0);
        const tomorrowAt12 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0);
        const tomorrowAt13 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 13, 0, 0);

        const carlosDiagnosis = {
          templateKey: 'clinical_diagnosis',
          title: 'Informe Clínico y Diagnóstico Lumbar',
          symptoms: 'Paciente varón de 42 años refiere dolor punzante en zona lumbar L4-L5 de 5 días de evolución.',
          diagnosis: 'Lumbalgia mecánica aguda con contractura muscular paravertebral bilateral sin compromiso radicular.',
          treatment: 'Reposo relativo 48h, calor seco local 20 min 3 veces al día, y 3 sesiones de fisioterapia descontracturante.',
          recommendations: 'Evitar sobrecargas y sedestación prolongada. Realizar estiramientos suaves de cadena posterior.',
          notes: 'Reevaluación en 7 días si persiste sintomatología dolorosa.',
          issuedAt: yesterdayAt1045.toISOString(),
          signedBy: 'Dr. Carlos Mendoza (Colegiado Nº 28491)',
        };

        const pdfBuffer = await generateDoctorReportPdfBuffer({
          patientName: contacts[1]?.name || 'Carlos Ruiz',
          patientPhone: contacts[1]?.phone || undefined,
          patientEmail: contacts[1]?.email || undefined,
          serviceName: svcMedica.name,
          startsAt: yesterdayAt10,
          endsAt: yesterdayAt1045,
          ...carlosDiagnosis,
        });

        await this.appointmentsRepo.save([
          // 1. Cita para hoy (Lucía Fernández) con documento adjunto del paciente (radiografía completa) y análisis IA
          this.appointmentsRepo.create({
            contactId: contacts[0].id,
            service: svcMedica.name,
            serviceId: svcMedica.id,
            calendarId: svcMedica.calendarId,
            price: svcMedica.price,
            startsAt: todayAt11,
            endsAt: todayAt1145,
            status: AppointmentStatus.SCHEDULED,
            modality: 'in_person',
            reason: 'Dolor lumbar agudo tras esfuerzo físico e inflamación paravertebral',
            notes: 'Paciente acude por dolor agudo de 4 días de evolución tras levantar peso.',
            patientAttachmentData: rxAttachment.buffer,
            patientAttachmentName: rxAttachment.filename,
            patientAttachmentMime: rxAttachment.mimeType,
            patientAttachmentSize: rxAttachment.buffer.length,
            patientAttachmentUploadedAt: new Date(Date.now() - 3600000),
            aiAnalysisType: 'dental_xray',
            aiAnalysisResult:
              'ANÁLISIS RADIOGRÁFICO IA (analizaia)\n' +
              'Especialidad: Radiodiagnóstico Digital\n' +
              'Hallazgos:\n' +
              '1. Disminución del espacio intervertebral L4-L5 con esclerosis reactiva marginal.\n' +
              '2. Alineación del muro posterior raquídeo íntegro.\n' +
              'Juicio IA: Pinzamiento discal L4-L5 compatible con discopatía mecánica (Confianza: 95.4%).',
            aiAnalysisDate: new Date(Date.now() - 3000000),
            aiCroppedImageData: rxAttachment.buffer,
            aiCroppedImageMime: rxAttachment.mimeType,
          }),
          // 2. Cita completada ayer (Carlos Ruiz) con diagnóstico emitido y PDF BLOB
          this.appointmentsRepo.create({
            contactId: contacts[1]?.id ?? contacts[0].id,
            service: svcMedica.name,
            serviceId: svcMedica.id,
            calendarId: svcMedica.calendarId,
            price: svcMedica.price,
            startsAt: yesterdayAt10,
            endsAt: yesterdayAt1045,
            status: AppointmentStatus.COMPLETED,
            modality: 'in_person',
            reason: 'Revisión dorsolumbar y contractura persistente',
            notes: 'Diagnóstico emitido y firmado por el Dr. Carlos Mendoza.',
            responseDocument: carlosDiagnosis,
            doctorReportPdf: pdfBuffer,
            doctorReportPdfName: 'informe-carlos-ruiz-diagnostico.pdf',
            doctorReportPdfMime: 'application/pdf',
            doctorReportPdfSize: pdfBuffer.length,
            aiAnalysisType: 'general',
            aiAnalysisResult:
              'DICTAMEN CLÍNICO GENERAL IA (analizaia)\n' +
              'Valoración: Contractura paravertebral refleja bilateral con rango articular lumbar limitado por dolor mecánico.\n' +
              'Recomendación IA: Fisioterapia descontracturante y reposo postural relativo.',
            aiAnalysisDate: yesterdayAt1045,
          }),
          // 3. Cita pendiente de confirmación para mañana (María García)
          this.appointmentsRepo.create({
            contactId: contacts[2]?.id ?? contacts[0].id,
            service: svcFisio.name,
            serviceId: svcFisio.id,
            calendarId: svcFisio.calendarId,
            price: svcFisio.price,
            startsAt: tomorrowAt12,
            endsAt: tomorrowAt13,
            status: AppointmentStatus.PENDING_APPROVAL,
            modality: 'virtual',
            reason: 'Evaluación de contractura cervical y mareos posturales',
            notes: 'Solicitud de sesión online para pautas posturales.',
          }),
        ]);
        this.logger.log('Demo appointments seeded with PDF and realistic patient attachment BLOBs');
      }
    } else {
      // Sync BLOBs to existing demo appointments
      for (const appt of doctorAppts) {
        if (appt.status === AppointmentStatus.COMPLETED && appt.responseDocument && !appt.doctorReportPdfName) {
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
            appt.doctorReportPdfName = `informe-${(appt.contact?.name || 'paciente').toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`;
            appt.doctorReportPdfMime = 'application/pdf';
            appt.doctorReportPdfSize = pdfBuffer.length;
            await this.appointmentsRepo.save(appt);
            this.logger.log(`Synced doctor report PDF BLOB for appointment ${appt.id}`);
          } catch (e) {
            this.logger.warn(`Could not sync PDF BLOB: ${e}`);
          }
        }

        // Replace placeholder or missing patient attachment with realistic lumbar radiograph
        if (
          appt.status === AppointmentStatus.SCHEDULED &&
          (!appt.patientAttachmentName || (appt.patientAttachmentSize && appt.patientAttachmentSize < 2000))
        ) {
          appt.patientAttachmentData = rxAttachment.buffer;
          appt.patientAttachmentName = rxAttachment.filename;
          appt.patientAttachmentMime = rxAttachment.mimeType;
          appt.patientAttachmentSize = rxAttachment.buffer.length;
          appt.patientAttachmentUploadedAt = new Date();
          if (!appt.aiAnalysisResult) {
            appt.aiAnalysisType = 'dental_xray';
            appt.aiAnalysisResult =
              'ANÁLISIS RADIOGRÁFICO IA (analizaia)\n' +
              'Especialidad: Radiodiagnóstico Digital\n' +
              'Hallazgos:\n' +
              '1. Disminución del espacio intervertebral L4-L5 con esclerosis reactiva marginal.\n' +
              '2. Alineación del muro posterior raquídeo íntegro.\n' +
              'Juicio IA: Pinzamiento discal L4-L5 compatible con discopatía mecánica (Confianza: 95.4%).';
            appt.aiAnalysisDate = new Date();
            appt.aiCroppedImageData = rxAttachment.buffer;
            appt.aiCroppedImageMime = rxAttachment.mimeType;
          }
          await this.appointmentsRepo.save(appt);
          this.logger.log(`Updated realistic patient radiography and AI BLOB for appointment ${appt.id}`);
        }
      }
    }
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
            summary: 'María Morales llamó solicitando cita de Fisioterapia y Rehabilitación Postural para tratamiento de lumbalgia. El asistente consultó la agenda en tiempo real, le ofreció huecos disponibles y formalizó la reserva para el jueves a las 17:30.',
            transcript: 'Asistente: Centro Holístico y Escuela de Yoga, le atiende el asistente virtual. ¿En qué puedo ayudarle?\nCliente: Hola, buenos días. Quería pedir cita para fisioterapia, tengo bastante dolor en la zona lumbar.\nAsistente: Por supuesto María. Para Fisioterapia y Rehabilitación Postural dispongo de hueco el jueves a las 17:30 o el viernes a las 10:00. ¿Cuál prefiere?\nCliente: El jueves a las 17:30 me viene genial.\nAsistente: Perfecto, queda confirmada su cita para el jueves a las 17:30. ¡Muchas gracias y que tenga buen día!\nCliente: Gracias a vosotros, hasta luego.',
            messages: [
              { role: 'assistant', message: 'Centro Holístico y Escuela de Yoga, le atiende el asistente virtual. ¿En qué puedo ayudarle?' },
              { role: 'customer', message: 'Hola, buenos días. Quería pedir cita para fisioterapia, tengo bastante dolor en la zona lumbar.' },
              { role: 'tool', message: 'consultar_huecos({"servicio":"Fisioterapia"}) -> Huecos disponibles: jueves a las 17:30, viernes a las 10:00' },
              { role: 'assistant', message: 'Por supuesto María. Para Fisioterapia y Rehabilitación Postural dispongo de hueco el jueves a las 17:30 o el viernes a las 10:00. ¿Cuál prefiere?' },
              { role: 'customer', message: 'El jueves a las 17:30 me viene genial.' },
              { role: 'tool', message: 'reservar_cita({"servicio":"Fisioterapia","inicioIso":"2026-08-27T17:30:00.000Z"}) -> Cita confirmada' },
              { role: 'assistant', message: 'Perfecto, queda confirmada su cita para el jueves a las 17:30. ¡Muchas gracias y que tenga buen día!' },
              { role: 'customer', message: 'Gracias a vosotros, hasta luego.' },
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
            summary: 'David Navarro consultó los horarios de las clases de Hatha Yoga Terapéutico y las tarifas mensuales. El asistente le detalló los grupos de lunes y miércoles y le invitó a una sesión de prueba.',
            transcript: 'Asistente: Hola, Centro Holístico. ¿En qué puedo orientarle hoy?\nCliente: Hola, quería saber qué horarios tenéis para las clases de yoga para principiantes y el precio.\nAsistente: Hola David. El Hatha Yoga Terapéutico se imparte los lunes y miércoles de 18:00 a 19:30 y de 19:30 a 21:00. La cuota mensual es de 65 euros con 2 clases semanales. ¿Le gustaría reservar una sesión de prueba?\nCliente: Sí, lo consulto y os aviso. Muchas gracias.\nAsistente: Un placer, estamos a su disposición.',
            messages: [
              { role: 'assistant', message: 'Hola, Centro Holístico. ¿En qué puedo orientarle hoy?' },
              { role: 'customer', message: 'Hola, quería saber qué horarios tenéis para las clases de yoga para principiantes y el precio.' },
              { role: 'tool', message: 'datos_del_negocio({"tipo":"servicios_precios"}) -> Hatha Yoga Terapéutico: 65€/mes' },
              { role: 'assistant', message: 'Hola David. El Hatha Yoga Terapéutico se imparte los lunes y miércoles de 18:00 a 19:30 y de 19:30 a 21:00. La cuota mensual es de 65 euros con 2 clases semanales. ¿Le gustaría reservar una sesión de prueba?' },
              { role: 'customer', message: 'Sí, lo consulto y os aviso. Muchas gracias.' },
              { role: 'assistant', message: 'Un placer, estamos a su disposición.' },
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
            summary: 'Llamada automática saliente de recordatorio de cita médica programada para mañana a las 10:00 con el Dr. Carlos Mendoza. La paciente confirmó que acudirá con la radiografía solicitada.',
            transcript: 'Asistente: Hola Lucía, le llamo del Centro Holístico para recordarle su consulta médica de mañana a las 10:00 con el Dr. Carlos Mendoza. ¿Podrá acudir puntualmente?\nCliente: Sí, claro, allí estaré. Ya tengo lista la prueba que me pidió.\nAsistente: Excelente Lucía, recuerde traerla consigo. Nos vemos mañana a las 10:00. ¡Que pase buen día!\nCliente: Muchas gracias, hasta mañana.',
            messages: [
              { role: 'assistant', message: 'Hola Lucía, le llamo del Centro Holístico para recordarle su consulta médica de mañana a las 10:00 con el Dr. Carlos Mendoza. ¿Podrá acudir puntualmente?' },
              { role: 'customer', message: 'Sí, claro, allí estaré. Ya tengo lista la prueba que me pidió.' },
              { role: 'assistant', message: 'Excelente Lucía, recuerde traerla consigo. Nos vemos mañana a las 10:00. ¡Que pase buen día!' },
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
            summary: 'Carlos Ruiz llamó para reprogramar su sesión de Pilates del martes a las 11:00. El asistente consultó alternativas de tarde y reubicó la cita al viernes a las 18:00.',
            transcript: 'Asistente: Centro Holístico y Escuela de Yoga, ¿en qué puedo ayudarle?\nCliente: Hola, tenía cita de Pilates el martes por la mañana pero me ha surgido una reunión de trabajo. ¿Podría cambiarla a alguna tarde?\nAsistente: Compruebo su cita Carlos. Tiene sesión el martes a las 11:00. Disponemos de hueco libre este viernes a las 18:00 o la próxima semana. ¿Le viene bien el viernes?\nCliente: Sí, el viernes a las 18:00 me va perfecto.\nAsistente: Queda reprogramada su sesión para el viernes a las 18:00. Se ha actualizado su agenda.\nCliente: Mil gracias por la rapidez. Hasta el viernes.',
            messages: [
              { role: 'assistant', message: 'Centro Holístico y Escuela de Yoga, ¿en qué puedo ayudarle?' },
              { role: 'customer', message: 'Hola, tenía cita de Pilates el martes por la mañana pero me ha surgido una reunión de trabajo. ¿Podría cambiarla a alguna tarde?' },
              { role: 'tool', message: 'reprogramar_cita({"inicioIso":"2026-08-28T18:00:00.000Z"}) -> Cita reprogramada con éxito' },
              { role: 'assistant', message: 'Queda reprogramada su sesión para el viernes a las 18:00. Se ha actualizado su agenda.' },
              { role: 'customer', message: 'Mil gracias por la rapidez. Hasta el viernes.' },
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
            needsReview: true,
            notes: 'Paciente con dudas sobre medicación y diagnóstico. Se le indicó que el Dr. Mendoza contactará con ella esta tarde.',
            summary: 'Elena Vega llamó con dudas clínicas específicas sobre la posología de su tratamiento y pidió hablar con un médico. El asistente registró la transferencia y dejó el aviso urgente para revisión del equipo.',
            transcript: 'Asistente: Buenos días, Centro Holístico. ¿En qué le puedo asistir?\nCliente: Hola, estuve en consulta médica hace dos días y tengo una duda urgente sobre las indicaciones del tratamiento que me dio el doctor. ¿Puedo hablar con él?\nAsistente: Comprendo Elena. Tratándose de una duda médica sobre tratamiento prescrito, voy a transferir su aviso directamente al Dr. Mendoza para que revise su ficha y se comunique con usted lo antes posible.\nCliente: De acuerdo, por favor que me llame en cuanto pueda a este mismo teléfono.\nAsistente: Queda anotado como prioritario. El equipo médico se pondrá en contacto con usted hoy mismo.',
            messages: [
              { role: 'assistant', message: 'Buenos días, Centro Holístico. ¿En qué le puedo asistir?' },
              { role: 'customer', message: 'Hola, estuve en consulta médica hace dos días y tengo una duda urgente sobre las indicaciones del tratamiento que me dio el doctor. ¿Puedo hablar con él?' },
              { role: 'tool', message: 'registrar_handoff({"motivo":"Duda urgente sobre tratamiento prescrito"}) -> Aviso registrado para equipo médico' },
              { role: 'assistant', message: 'Queda anotado como prioritario. El equipo médico se pondrá en contacto con usted hoy mismo.' },
              { role: 'customer', message: 'De acuerdo, muchas gracias.' },
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

