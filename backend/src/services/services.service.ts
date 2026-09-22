import { Injectable, NotFoundException, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Service, ServiceType } from '../common/entities/service.entity';
import { ServiceCategory } from '../common/entities/service-category.entity';
import { User, UserRole } from '../common/entities/user.entity';
import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { KnowledgeDocument } from '../common/entities/knowledge-document.entity';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';
import { AUDIT_EVENT } from '../audit/audit.types';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { parseWeeklyScheduleFromText } from './schedule-parser';

@Injectable()
export class ServicesService implements OnModuleInit {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
    @InjectRepository(ServiceCategory)
    private readonly categoryRepo: Repository<ServiceCategory>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(AgentConfig)
    private readonly agentConfigRepo: Repository<AgentConfig>,
    @InjectRepository(KnowledgeDocument)
    private readonly knowledgeDocRepo: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeChunk)
    private readonly knowledgeChunkRepo: Repository<KnowledgeChunk>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // 0. Ensure schema columns exist in services table (safe auto-migration)
      try {
        await this.serviceRepo.query(`
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "reminderNotes" text;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "managerId" uuid;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "requiresApproval" boolean DEFAULT false;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "maxCapacity" integer DEFAULT 1;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "locationType" character varying DEFAULT 'BOTH';
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "address" text;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "onlineMeetingUrl" text;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "calcomEventTypeId" integer;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "calcomSlug" character varying;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "vapiAssistantId" character varying;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "vapiPhoneNumberId" character varying;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "isVapiEnabled" boolean DEFAULT false;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "displayOrder" integer DEFAULT 0;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "stripePriceId" character varying;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "stripeProductId" character varying;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "weeklySchedule" jsonb;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "notifyByEmail" boolean DEFAULT true;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "notifyByWhatsapp" boolean DEFAULT true;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "notifyBySms" boolean DEFAULT false;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "reminderWhatsapp" boolean DEFAULT true;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "reminderEmail" boolean DEFAULT true;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "reminderVoice" boolean DEFAULT false;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "reminderSms" boolean DEFAULT false;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "reminderHoursEnabled" boolean DEFAULT true;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "reminderHours" integer DEFAULT 24;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "reminderMinutesEnabled" boolean DEFAULT true;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "reminderMinutes" integer DEFAULT 120;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "flyerPath" text;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "flyerParticularUrl" text;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "flyerParticularPath" text;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "videoParticularUrl" text;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "videoParticularPath" text;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "fechaDesde" date DEFAULT '2000-01-01';
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "fechaHasta" date DEFAULT '2099-12-31';
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "categoryId" uuid;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "displayOrder" integer DEFAULT 0;

          CREATE TABLE IF NOT EXISTS service_categories (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            code character varying(100) UNIQUE NOT NULL,
            name character varying(200) NOT NULL,
            description text,
            "displayOrder" integer DEFAULT 0,
            "isActive" boolean DEFAULT true,
            "createdAt" timestamptz DEFAULT now(),
            "updatedAt" timestamptz DEFAULT now()
          );

          CREATE TABLE IF NOT EXISTS media_assets (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            key character varying(100) UNIQUE NOT NULL,
            title character varying(255) NOT NULL,
            "mediaType" character varying(50) DEFAULT 'video',
            "mimeType" character varying(100) NOT NULL,
            "physicalPath" text NOT NULL,
            "publicUrl" text,
            "fileSizeBytes" bigint,
            "serviceId" uuid,
            metadata jsonb DEFAULT '{}',
            "isActive" boolean DEFAULT true,
            "displayOrder" integer DEFAULT 0,
            "createdAt" timestamptz DEFAULT now(),
            "updatedAt" timestamptz DEFAULT now()
          );

          UPDATE services SET "notifyByEmail" = true WHERE "notifyByEmail" IS NULL OR "notifyByEmail" = false;
          UPDATE services SET "reminderNotes" = 'Llevar ropa cómoda de abrigo, calcetines cálidos y, si lo deseas, tu propia manta o cojín para disfrutar de la experiencia sonora con el máximo confort.'
          WHERE ("name" ILIKE '%gong%' OR "name" ILIKE '%sonora%') AND "reminderNotes" ILIKE '%9:15%';

          ALTER TABLE services ADD COLUMN IF NOT EXISTS "sinfechadefinitiva" character varying(1) DEFAULT 'N';
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "textosinfechadefinitiva" text;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "sinpreciodefinitivo" character varying(1) DEFAULT 'N';
          ALTER TABLE services ADD COLUMN IF NOT EXISTS "textosinpreciodefinitivo" text;

          UPDATE services SET 
            "sinfechadefinitiva" = 'S', 
            "textosinfechadefinitiva" = 'fecha por confirmar',
            "sinpreciodefinitivo" = 'S',
            "textosinpreciodefinitivo" = 'fecha por confirmar',
            "eventDatesText" = 'fecha por confirmar',
            "description" = 'Jornada sagrada femenina de empoderamiento, arquetipos, sanación de memorias, meditación, danza y autocuidado. Fecha por confirmar. Precio por confirmar.'
          WHERE "name" ILIKE '%mujeres%' OR "name" ILIKE '%femenino%';

          UPDATE services SET 
            "sinfechadefinitiva" = 'S', 
            "textosinfechadefinitiva" = 'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027',
            "sinpreciodefinitivo" = 'S',
            "textosinpreciodefinitivo" = 'el precio se determinara en funcion de las caracteristicas del viaje y alojamiento',
            "eventDatesText" = 'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027',
            "description" = 'Evento vivencial de inmersión y transformación sonora durante toda la noche (11 horas continuas de sonido). Fechas: dos encuentros  la primera puja es proximamente y la segunda en marzo 2027. Precio: el precio se determinara en funcion de las caracteristicas del viaje y alojamiento.'
          WHERE "name" ILIKE '%puja%';
        `);
      } catch (colErr) {
        console.warn('Auto-migration warning in services table:', colErr);
      }

      // 1. Ensure Jose Ignacio Gomez Raya exists as SERVICE_MANAGER
      let manager = await this.userRepo.findOne({
        where: [{ email: 'jigomez@hotmail.com' }, { name: ILike('%Jose Ignacio Gomez%') }],
      });

      if (!manager) {
        const passwordHash = await bcrypt.hash('Admin1234!', 10);
        manager = await this.userRepo.save(
          this.userRepo.create({
            name: 'Jose Ignacio Gomez Raya',
            email: 'jigomez@hotmail.com',
            passwordHash,
            role: UserRole.SERVICE_MANAGER,
            isActive: true,
          }),
        );
      } else {
        manager.name = 'Jose Ignacio Gomez Raya';
        manager.role = UserRole.SERVICE_MANAGER;
        manager.isActive = true;
        await this.userRepo.save(manager);
      }

      // 2. Ensure Terapia Gestalt service exists with requiresApproval=true and managerId
      let gestaltSvc = await this.serviceRepo.findOne({
        where: [{ name: ILike('%gestalt%') }],
      });

      if (gestaltSvc) {
        gestaltSvc.managerId = manager.id;
        gestaltSvc.requiresApproval = true;
        gestaltSvc.maxCapacity = 1;
        gestaltSvc.durationMinutes = 60;
        gestaltSvc.price = gestaltSvc.price || '35.00';
        gestaltSvc.allowedModalities = ['in_person', 'virtual'];
        gestaltSvc.isActive = true;
        if (!gestaltSvc.description) {
          gestaltSvc.description =
            'Sesión individual de psicoterapia Gestalt presencial u online. Enfoque humanista y toma de conciencia. Horario convenido individualmente entre terapeuta y alumno/paciente. Requiere aprobación previa por parte del terapeuta responsable (Jose Ignacio Gomez Raya). Precio: 35€ por sesión de 1 hora. Pago en el centro.';
        }
        await this.serviceRepo.save(gestaltSvc);
      }

      // 3. Ensure Bienestar Experience service exists with requiresApproval=true and managerId
      let bienestarSvc = await this.serviceRepo.findOne({
        where: [{ name: ILike('%bienestar experience%') }, { name: ILike('%bienestar integral%') }],
      });

      if (bienestarSvc) {
        bienestarSvc.managerId = manager.id;
        bienestarSvc.requiresApproval = true;
        bienestarSvc.maxCapacity = 1;
        bienestarSvc.durationMinutes = 60;
        if (!bienestarSvc.price || bienestarSvc.price === '25.00' || bienestarSvc.price === '25') {
          bienestarSvc.price = '19.99';
        }
        bienestarSvc.allowedModalities = ['in_person', 'virtual'];
        bienestarSvc.isActive = true;
        if (bienestarSvc.description && bienestarSvc.description.includes('25€')) {
          bienestarSvc.description = bienestarSvc.description.replace(/25€/g, '19.99€');
        } else if (!bienestarSvc.description) {
          bienestarSvc.description =
            'Programa y sesiones de asesoramiento personalizado presencial y online en longevidad, bienestar integral, nutrición, biohacking, meditación y psicología positiva. Horario convenido individualmente. Requiere aprobación previa del responsable (Jose Ignacio Gomez Raya). Precio: 19.99€ por sesión de 1 hora. Pago en el centro.';
        }
        await this.serviceRepo.save(bienestarSvc);
      } else {
        bienestarSvc = await this.serviceRepo.save(
          this.serviceRepo.create({
            name: 'Bienestar Experience (Longevidad y Bienestar Integral)',
            description:
              'Programa y sesiones de asesoramiento personalizado presencial y online en longevidad, bienestar integral, nutrición, biohacking, meditación y psicología positiva. Horario convenido individualmente. Requiere aprobación previa del responsable (Jose Ignacio Gomez Raya). Precio: 19.99€ por sesión de 1 hora. Pago en el centro.',
            serviceType: ServiceType.RECURRING,
            durationMinutes: 60,
            price: '19.99',
            maxCapacity: 1,
            calendarId: 'cal-bienestar-experience',
            managerId: manager.id,
            requiresApproval: true,
            allowedModalities: ['in_person', 'virtual'],
            isActive: true,
          }),
        );
      }

      // 3b. Ensure Encuentro de Mujeres exists
      let mujeresSvc = await this.serviceRepo.findOne({
        where: [{ name: ILike('%mujeres%') }, { name: ILike('%femenino%') }],
      });
      if (!mujeresSvc) {
        mujeresSvc = await this.serviceRepo.save(
          this.serviceRepo.create({
            name: 'Encuentro de Mujeres (Primavera)',
            description:
              'Jornada sagrada femenina de empoderamiento, arquetipos, sanación de memorias, meditación, danza y autocuidado. Fecha por confirmar. Precio por confirmar.',
            serviceType: ServiceType.EVENT,
            eventDatesText: 'fecha por confirmar',
            durationMinutes: 360,
            price: '0.00',
            maxCapacity: 25,
            calendarId: 'cal-encuentro-mujeres',
            managerId: manager.id,
            requiresApproval: false,
            allowedModalities: ['in_person'],
            sinfechadefinitiva: 'S',
            textosinfechadefinitiva: 'fecha por confirmar',
            sinpreciodefinitivo: 'S',
            textosinpreciodefinitivo: 'fecha por confirmar',
            reminderNotes:
              'Llevar ropa cómoda y holgada, cojín de meditación o esterilla si lo deseas, cuaderno/diario personal para notas y comida ligera para compartir en el descanso.',
            isActive: true,
          }),
        );
      } else {
        mujeresSvc.sinfechadefinitiva = 'S';
        mujeresSvc.textosinfechadefinitiva = 'fecha por confirmar';
        mujeresSvc.sinpreciodefinitivo = 'S';
        mujeresSvc.textosinpreciodefinitivo = 'fecha por confirmar';
        mujeresSvc.eventDatesText = 'fecha por confirmar';
        mujeresSvc.description =
          'Jornada sagrada femenina de empoderamiento, arquetipos, sanación de memorias, meditación, danza y autocuidado. Fecha por confirmar. Precio por confirmar.';
        mujeresSvc.reminderNotes =
          mujeresSvc.reminderNotes ||
          'Llevar ropa cómoda y holgada, cojín de meditación o esterilla si lo deseas, cuaderno/diario personal para notas y comida ligera para compartir en el descanso.';
        mujeresSvc.isActive = true;
        await this.serviceRepo.save(mujeresSvc);
      }

      // 3c. Ensure Retiro de Ayuno exists
      let ayunoSvc = await this.serviceRepo.findOne({
        where: [{ name: ILike('%ayuno%') }],
      });
      if (!ayunoSvc) {
        ayunoSvc = await this.serviceRepo.save(
          this.serviceRepo.create({
            name: 'Retiro de Ayuno Terapéutico',
            description:
              'Retiro de depuración y ayuno consciente después del verano para subir tu energía vital. Del viernes 9 al lunes 12 de octubre. Lugar paradisíaco y aislado a hora y media de Madrid donde bañarnos y hacer paseos por el monte. Actividades diarias: activación y gimnasia al amanecer, yoga al mediodía, meditación al atardecer y baño de gong en la noche. Dirigido por Salvadora Conesa (40 años como profesora de yoga, 26 como terapeuta Gestalt, 30 años dirigiendo grupos de ayuno). Inversión: 250 € (230 € reservando antes del 12 de septiembre, descuento con acompañante o en grupo). Aforo: 20 plazas.',
            serviceType: ServiceType.EVENT,
            eventDatesText: 'Del viernes 9 al lunes 12 de Octubre de 2026',
            eventStartDate: new Date('2026-10-09T16:00:00.000Z'),
            eventEndDate: new Date('2026-10-12T16:00:00.000Z'),
            durationMinutes: 1440,
            price: '250.00',
            maxCapacity: 20,
            calendarId: 'cal-ayuno-terapeutico',
            managerId: manager.id,
            requiresApproval: false,
            allowedModalities: ['in_person'],
            flyerUrl: '/flyers/ayuno.jpeg',
            flyerPath: 'public/flyers/ayuno.jpeg',
            flyerParticularUrl: '/flyers/ayuno_particular.jpg',
            flyerParticularPath: 'public/flyers/ayuno_particular.jpg',
            videoParticularUrl: '/videos/ayunoterapeuticoparticular.mp4',
            videoParticularPath: 'public/videos/ayunoterapeuticoparticular.mp4',
            reminderNotes:
              'Llevar ropa cómoda de abrigo para la naturaleza, calzado de senderismo/montaña, botella de agua reutilizable, libreta de notas, bañador y toalla grande para saunas/baños termales si aplica.',
            isActive: true,
          }),
        );
      } else {
        ayunoSvc.flyerParticularUrl = '/flyers/ayuno_particular.jpg';
        ayunoSvc.flyerParticularPath = 'public/flyers/ayuno_particular.jpg';
        ayunoSvc.videoParticularUrl = '/videos/ayunoterapeuticoparticular.mp4';
        ayunoSvc.videoParticularPath = 'public/videos/ayunoterapeuticoparticular.mp4';
        if (!ayunoSvc.flyerUrl) {
          ayunoSvc.flyerUrl = '/flyers/ayuno.jpeg';
          ayunoSvc.flyerPath = 'public/flyers/ayuno.jpeg';
        }
        ayunoSvc.price = ayunoSvc.price || '250.00';
        ayunoSvc.eventDatesText = ayunoSvc.eventDatesText || 'Del viernes 9 al lunes 12 de Octubre de 2026';
        if (!ayunoSvc.description) {
          ayunoSvc.description =
            'Retiro de depuración y ayuno consciente después del verano para subir tu energía vital. Del viernes 9 al lunes 12 de octubre. Lugar paradisíaco y aislado a hora y media de Madrid donde bañarnos y hacer paseos por el monte. Actividades diarias: activación y gimnasia al amanecer, yoga al mediodía, meditación al atardecer y baño de gong en la noche. Dirigido por Salvadora Conesa (40 años como profesora de yoga, 26 como terapeuta Gestalt, 30 años dirigiendo grupos de ayuno). Inversión: 250 € (230 € reservando antes del 12 de septiembre, descuento con acompañante o en grupo). Aforo: 20 plazas.';
        }
        ayunoSvc.reminderNotes =
          ayunoSvc.reminderNotes ||
          'Llevar ropa cómoda de abrigo para la naturaleza, calzado de senderismo/montaña, botella de agua reutilizable, libreta de notas, bañador y toalla grande para saunas/baños termales si aplica.';
        ayunoSvc.isActive = true;
        await this.serviceRepo.save(ayunoSvc);
      }

      // 3d. Ensure Baño de Gong exists
      let gongSvc = await this.serviceRepo.findOne({
        where: [{ name: ILike('%baño de gong%') }, { name: ILike('%meditación sonora%') }],
      });
      if (!gongSvc) {
        gongSvc = await this.serviceRepo.save(
          this.serviceRepo.create({
            name: 'Baño de Gong y Meditación Sonora',
            description:
              'Sesión mensual de 2 horas (a finales de mes). Preparación, baño de sonido envolvente con gongs y meditación integradora. Próxima fecha: Sábado 26 de Septiembre de 2026 (18:00 a 20:00). Aforo: 30 personas. Precio: 16€. Pago en el centro.',
            serviceType: ServiceType.EVENT,
            eventDatesText: 'Sábado 26 de Septiembre de 2026 (18:00 a 20:00)',
            eventStartDate: new Date('2026-09-26T16:00:00.000Z'),
            eventEndDate: new Date('2026-09-26T18:00:00.000Z'),
            durationMinutes: 120,
            price: '16.00',
            maxCapacity: 30,
            calendarId: 'cal-gong-mensual',
            managerId: manager.id,
            requiresApproval: false,
            allowedModalities: ['in_person'],
            reminderNotes:
              'Llevar ropa cómoda de abrigo, calcetines cálidos y, si lo deseas, tu propia manta o cojín para disfrutar de la experiencia sonora con el máximo confort.',
            isActive: true,
          }),
        );
      } else {
        gongSvc.managerId = manager.id;
        gongSvc.eventStartDate = new Date('2026-09-26T16:00:00.000Z');
        gongSvc.eventEndDate = new Date('2026-09-26T18:00:00.000Z');
        gongSvc.reminderNotes =
          gongSvc.reminderNotes ||
          'Llevar ropa cómoda de abrigo, calcetines cálidos y, si lo deseas, tu propia manta o cojín para disfrutar de la experiencia sonora con el máximo confort.';
        gongSvc.isActive = true;
        await this.serviceRepo.save(gongSvc);
      }

      // 3e. Ensure Puja de Gongs exists
      let pujaSvc = await this.serviceRepo.findOne({
        where: [{ name: ILike('%puja%') }],
      });
      if (!pujaSvc) {
        pujaSvc = await this.serviceRepo.save(
          this.serviceRepo.create({
            name: 'Puja de Gongs (Noche Sagrada de Sonido - 11h)',
            description:
              'Evento vivencial de inmersión y transformación sonora durante toda la noche (11 horas continuas de sonido). Fechas: dos encuentros  la primera puja es proximamente y la segunda en marzo 2027. Precio: el precio se determinara en funcion de las caracteristicas del viaje y alojamiento.',
            serviceType: ServiceType.EVENT,
            eventDatesText: 'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027',
            durationMinutes: 660,
            price: '0.00',
            maxCapacity: 30,
            calendarId: 'cal-puja-gongs',
            managerId: manager.id,
            requiresApproval: false,
            allowedModalities: ['in_person'],
            sinfechadefinitiva: 'S',
            textosinfechadefinitiva: 'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027',
            sinpreciodefinitivo: 'S',
            textosinpreciodefinitivo: 'el precio se determinara en funcion de las caracteristicas del viaje y alojamiento',
            reminderNotes:
              'Traer esterilla cómoda o colchoneta fina, saco de dormir o mantas, almohada/cojín, botella de agua y ropa cómoda para toda la noche.',
            isActive: true,
          }),
        );
      } else {
        pujaSvc.sinfechadefinitiva = 'S';
        pujaSvc.textosinfechadefinitiva = 'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027';
        pujaSvc.sinpreciodefinitivo = 'S';
        pujaSvc.textosinpreciodefinitivo = 'el precio se determinara en funcion de las caracteristicas del viaje y alojamiento';
        pujaSvc.eventDatesText = 'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027';
        pujaSvc.description =
          'Evento vivencial de inmersión y transformación sonora durante toda la noche (11 horas continuas de sonido). Fechas: dos encuentros  la primera puja es proximamente y la segunda en marzo 2027. Precio: el precio se determinara en funcion de las caracteristicas del viaje y alojamiento.';
        pujaSvc.managerId = manager.id;
        pujaSvc.reminderNotes =
          pujaSvc.reminderNotes ||
          'Traer esterilla cómoda o colchoneta fina, saco de dormir o mantas, almohada/cojín, botella de agua y ropa cómoda para toda la noche.';
        pujaSvc.isActive = true;
        await this.serviceRepo.save(pujaSvc);
      }

      // 3f. Ensure Constelaciones Familiares (Constelar y Participar) exist
      let constelarSvc = await this.serviceRepo.findOne({
        where: [{ name: ILike('%constelaciones%constelar%') }, { name: 'Constelaciones Familiares (Constelar)' }],
      });
      if (!constelarSvc) {
        constelarSvc = await this.serviceRepo.save(
          this.serviceRepo.create({
            name: 'Constelaciones Familiares (Constelar / Asunto Propio)',
            description:
              'Taller vivencial mensual de sanación de vínculos y patrones familiares. Modalidad para trabajar un asunto o síntoma personal propio. Próxima fecha: Domingo 27 de Septiembre de 2026 (10:00 a 14:00). Precio: 60€. Aforo: 25 personas. Pago en el centro.',
            serviceType: ServiceType.EVENT,
            eventDatesText: 'Domingo 27 de Septiembre de 2026 (10:00 a 14:00)',
            eventStartDate: new Date('2026-09-27T10:00:00.000Z'),
            eventEndDate: new Date('2026-09-27T14:00:00.000Z'),
            durationMinutes: 240,
            price: '60.00',
            maxCapacity: 25,
            calendarId: 'cal-constelaciones',
            managerId: manager.id,
            requiresApproval: false,
            allowedModalities: ['in_person'],
            reminderNotes:
              'Llevar ropa cómoda, cuaderno para notas si lo deseas y botella de agua. Rogamos acudir 10 minutos antes para comenzar puntualmente.',
            isActive: true,
          }),
        );
      } else {
        constelarSvc.managerId = manager.id;
        constelarSvc.reminderNotes =
          constelarSvc.reminderNotes ||
          'Llevar ropa cómoda, cuaderno para notas si lo deseas y botella de agua. Rogamos acudir 10 minutos antes para comenzar puntualmente.';
        constelarSvc.isActive = true;
        await this.serviceRepo.save(constelarSvc);
      }

      let participarConstelacionesSvc = await this.serviceRepo.findOne({
        where: [{ name: ILike('%constelaciones%participar%') }, { name: ILike('%constelaciones%representante%') }],
      });
      if (!participarConstelacionesSvc) {
        participarConstelacionesSvc = await this.serviceRepo.save(
          this.serviceRepo.create({
            name: 'Constelaciones Familiares (Participante / Representante)',
            description:
              'Taller vivencial mensual de sanación de vínculos familiares. Modalidad para participar como representante u observador en el campo de trabajo. Próxima fecha: Domingo 27 de Septiembre de 2026 (10:00 a 14:00). Precio: 20€. Aforo: 25 personas. Pago en el centro.',
            serviceType: ServiceType.EVENT,
            eventDatesText: 'Domingo 27 de Septiembre de 2026 (10:00 a 14:00)',
            eventStartDate: new Date('2026-09-27T10:00:00.000Z'),
            eventEndDate: new Date('2026-09-27T14:00:00.000Z'),
            durationMinutes: 240,
            price: '20.00',
            maxCapacity: 25,
            calendarId: 'cal-constelaciones',
            managerId: manager.id,
            requiresApproval: false,
            allowedModalities: ['in_person'],
            reminderNotes:
              'Llevar ropa cómoda, libreta de notas si lo deseas y botella de agua. Rogamos puntualidad a las 10:00.',
            isActive: true,
          }),
        );
      } else {
        participarConstelacionesSvc.managerId = manager.id;
        participarConstelacionesSvc.reminderNotes =
          participarConstelacionesSvc.reminderNotes ||
          'Llevar ropa cómoda, libreta de notas si lo deseas y botella de agua. Rogamos puntualidad a las 10:00.';
        participarConstelacionesSvc.isActive = true;
        await this.serviceRepo.save(participarConstelacionesSvc);
      }

      // 3h. Ensure weeklySchedule on all recurring and event services in DB
      const dbServices = await this.serviceRepo.find();
      for (const s of dbServices) {
        let updated = false;
        if (/hatha.*yoga|yoga.*terap/i.test(s.name)) {
          if (!s.maxCapacity || s.maxCapacity < 20) {
            s.maxCapacity = 20;
            updated = true;
          }
          if (!s.weeklySchedule || Object.keys(s.weeklySchedule).length === 0 || s.weeklySchedule[4]?.includes('16:30')) {
            s.weeklySchedule = {
              2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
              3: ['20:15'],
              4: ['09:45', '11:15', '16:00', '17:30', '19:00'],
            };
            s.scheduleText = 'Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:00, 17:30, 19:00)';
            updated = true;
          }
          if (s.description && s.description.includes('16:30')) {
            s.description = s.description.replace(/16:30/g, '16:00');
            updated = true;
          }
          if (s.scheduleText && s.scheduleText.includes('16:30')) {
            s.scheduleText = s.scheduleText.replace(/16:30/g, '16:00');
            updated = true;
          }
        } else if (/meditaci/i.test(s.name) && !/baño.*gong/i.test(s.name)) {
          if (!s.maxCapacity || s.maxCapacity < 28) {
            s.maxCapacity = 28;
            updated = true;
          }
          if (s.notifyByEmail !== true) {
            s.notifyByEmail = true;
            updated = true;
          }
          if (s.notifyByWhatsapp !== true) {
            s.notifyByWhatsapp = true;
            updated = true;
          }
          if (!s.weeklySchedule || Object.keys(s.weeklySchedule).length === 0) {
            s.weeklySchedule = {
              2: ['09:15'],
              4: ['09:15'],
            };
            s.scheduleText = 'Martes y Jueves de 09:15 a 09:45';
            updated = true;
          }
        } else if (/iaido|iaidō|esgrima/i.test(s.name)) {
          if (!s.weeklySchedule || Object.keys(s.weeklySchedule).length === 0) {
            s.weeklySchedule = {
              1: ['20:00'],
              4: ['20:30'],
            };
            s.scheduleText = 'Lunes de 20:00 a 21:00 y Jueves de 20:30 a 22:00';
            updated = true;
          }
        } else if (/constelaci/i.test(s.name)) {
          if (!s.eventStartDate) {
            s.eventStartDate = new Date('2026-09-27T08:00:00.000Z');
            s.eventEndDate = new Date('2026-09-27T12:00:00.000Z');
            s.eventDatesText = 'Domingo 27 de Septiembre de 2026 de 10:00 a 14:00';
            updated = true;
          }
        } else if (/gestalt|bienestar/i.test(s.name)) {
          if (!s.requiresApproval) {
            s.requiresApproval = true;
            updated = true;
          }
        } else if (/mujeres|femenino/i.test(s.name)) {
          s.sinfechadefinitiva = 'S';
          s.textosinfechadefinitiva = 'fecha por confirmar';
          s.sinpreciodefinitivo = 'S';
          s.textosinpreciodefinitivo = 'fecha por confirmar';
          s.eventDatesText = 'fecha por confirmar';
          s.description =
            'Jornada sagrada femenina de empoderamiento, arquetipos, sanación de memorias, meditación, danza y autocuidado. Fecha por confirmar. Precio por confirmar.';
          updated = true;
        } else if (/puja/i.test(s.name)) {
          s.sinfechadefinitiva = 'S';
          s.textosinfechadefinitiva = 'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027';
          s.sinpreciodefinitivo = 'S';
          s.textosinpreciodefinitivo = 'el precio se determinara en funcion de las caracteristicas del viaje y alojamiento';
          s.eventDatesText = 'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027';
          s.description =
            'Evento vivencial de inmersión y transformación sonora durante toda la noche (11 horas continuas de sonido). Fechas: dos encuentros  la primera puja es proximamente y la segunda en marzo 2027. Precio: el precio se determinara en funcion de las caracteristicas del viaje y alojamiento.';
          updated = true;
        }
        if (updated) {
          await this.serviceRepo.save(s);
        }
      }

      // 4. Update agent config services JSON
      const agentConfig = await this.agentConfigRepo.findOne({ where: { agentKey: 'booking' } });
      if (agentConfig && Array.isArray(agentConfig.services)) {
        let changed = false;
        let hasBienestar = false;
        let hasMujeres = false;
        let hasAyuno = false;
        let hasGong = false;
        let hasPuja = false;
        let hasConstelar = false;
        let hasParticiparConst = false;

        agentConfig.services = agentConfig.services.map((s: any) => {
          if (/yoga/i.test(s.name || '')) {
            changed = true;
            return {
              ...s,
              maxCapacity: 20,
              durationMinutes: 90,
            };
          }
          if (/meditaci/i.test(s.name || '') && !/baño.*gong/i.test(s.name || '')) {
            changed = true;
            return {
              ...s,
              maxCapacity: 28,
              durationMinutes: 30,
            };
          }
          if (/gestalt/i.test(s.name || '')) {
            changed = true;
            return {
              ...s,
              managerId: manager.id,
              requiresApproval: true,
              maxCapacity: 1,
              durationMinutes: 60,
              price: gestaltSvc?.price || s.price || '35.00',
              allowedModalities: ['in_person', 'virtual'],
            };
          }
          if (/bienestar/i.test(s.name || '')) {
            changed = true;
            hasBienestar = true;
            return {
              ...s,
              managerId: manager.id,
              requiresApproval: true,
              maxCapacity: 1,
              durationMinutes: 60,
              price: bienestarSvc?.price || s.price || '19.99',
              allowedModalities: ['in_person', 'virtual'],
            };
          }
          if (/mujeres|femenino/i.test(s.name || '')) {
            hasMujeres = true;
            changed = true;
            return {
              ...s,
              sinfechadefinitiva: 'S',
              textosinfechadefinitiva: 'fecha por confirmar',
              sinpreciodefinitivo: 'S',
              textosinpreciodefinitivo: 'fecha por confirmar',
              eventDatesText: 'fecha por confirmar',
              description:
                'Jornada sagrada femenina de empoderamiento, arquetipos, sanación de memorias, meditación, danza y autocuidado. Fecha por confirmar. Precio por confirmar.',
            };
          }
          if (/puja/i.test(s.name || '')) {
            hasPuja = true;
            changed = true;
            return {
              ...s,
              sinfechadefinitiva: 'S',
              textosinfechadefinitiva: 'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027',
              sinpreciodefinitivo: 'S',
              textosinpreciodefinitivo: 'el precio se determinara en funcion de las caracteristicas del viaje y alojamiento',
              eventDatesText: 'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027',
              description:
                'Evento vivencial de inmersión y transformación sonora durante toda la noche (11 horas continuas de sonido). Fechas: dos encuentros  la primera puja es proximamente y la segunda en marzo 2027. Precio: el precio se determinara en funcion de las caracteristicas del viaje y alojamiento.',
            };
          }
          if (/ayuno/i.test(s.name || '')) {
            hasAyuno = true;
          }
          if (/baño de gong|sonora/i.test(s.name || '')) {
            hasGong = true;
          }
          if (/constelar|asunto propio/i.test(s.name || '')) {
            hasConstelar = true;
          }
          if (/participar|representante/i.test(s.name || '')) {
            hasParticiparConst = true;
          }
          return s;
        });

        if (!hasBienestar && bienestarSvc) {
          agentConfig.services.push({
            name: bienestarSvc.name,
            durationMinutes: 60,
          });
          changed = true;
        }

        if (!hasMujeres && mujeresSvc) {
          agentConfig.services.push({
            name: mujeresSvc.name,
            durationMinutes: 360,
          });
          changed = true;
        }

        if (!hasAyuno && ayunoSvc) {
          agentConfig.services.push({
            name: ayunoSvc.name,
            durationMinutes: 1440,
          });
          changed = true;
        }

        if (!hasGong && gongSvc) {
          agentConfig.services.push({
            name: gongSvc.name,
            durationMinutes: 120,
          });
          changed = true;
        }

        if (!hasPuja && pujaSvc) {
          agentConfig.services.push({
            name: pujaSvc.name,
            durationMinutes: 660,
          });
          changed = true;
        }

        if (!hasConstelar && constelarSvc) {
          agentConfig.services.push({
            name: constelarSvc.name,
            durationMinutes: 240,
          });
          changed = true;
        }

        if (!hasParticiparConst && participarConstelacionesSvc) {
          agentConfig.services.push({
            name: participarConstelacionesSvc.name,
            durationMinutes: 240,
          });
          changed = true;
        }

        if (agentConfig.customInstructions && agentConfig.customInstructions.includes('16:30')) {
          agentConfig.customInstructions = agentConfig.customInstructions.replace(/16:30/g, '16:00');
          changed = true;
        }
        if (agentConfig.customInstructions && /28 de Noviembre/i.test(agentConfig.customInstructions)) {
          agentConfig.customInstructions = agentConfig.customInstructions.replace(
            /S[áa]bado\s*28\s*de\s*Noviembre\s*de\s*2026[^\.\n]*/gi,
            'dos encuentros  la primera puja es proximamente y la segunda en marzo 2027',
          );
          changed = true;
        }
        if (agentConfig.customInstructions && /15 de Mayo/i.test(agentConfig.customInstructions)) {
          agentConfig.customInstructions = agentConfig.customInstructions.replace(
            /S[áa]bado\s*15\s*de\s*Mayo\s*de\s*2027[^\.\n]*/gi,
            'fecha por confirmar',
          );
          changed = true;
        }
        const jsonStr = JSON.stringify(agentConfig.services);
        if (jsonStr.includes('16:30')) {
          agentConfig.services = JSON.parse(jsonStr.replace(/16:30/g, '16:00'));
          changed = true;
        }

        if (changed) {
          await this.agentConfigRepo.save(agentConfig);
        }
      }

      // 5. Update reminderNotes for all known yoga/center services if not set
      const allServices = await this.serviceRepo.find();
      for (const s of allServices) {
        let changed = false;
        if (!s.reminderNotes) {
          if (/yoga/i.test(s.name)) {
            s.reminderNotes =
              'Llevar ropa cómoda deportiva, toalla o esterilla propia (el centro también dispone de material) y llegar 5-10 minutos antes del inicio de la clase.';
            changed = true;
          } else if (/baño.*gong|sonora/i.test(s.name)) {
            s.reminderNotes =
              'Llevar ropa cómoda de abrigo, calcetines cálidos y, si lo deseas, tu propia manta o cojín para disfrutar de la experiencia sonora con el máximo confort.';
            changed = true;
          } else if (/puja.*gong/i.test(s.name)) {
            s.reminderNotes =
              'Experiencia sonora durante toda la noche (11 horas). Llevar saco de dormir, esterilla aislante gruesa, ropa cómoda y cálida, y botella de agua.';
            changed = true;
          } else if (/meditaci/i.test(s.name) && !/gong|sonor/i.test(s.name)) {
            s.reminderNotes =
              'Llevar ropa cómoda. Rogamos máxima puntualidad (9:15) para no interrumpir el centramiento y silencio de la sala.';
            changed = true;
          } else if (/constelaci/i.test(s.name)) {
            s.reminderNotes =
              'Llegar con 10-15 minutos de antelación para formalizar la acreditación y dar inicio puntual al taller grupal.';
            changed = true;
          } else if (/gestalt|bienestar/i.test(s.name)) {
            s.reminderNotes =
              'Para sesión presencial: acudir con puntualidad. Para sesión online: conectarse puntualmente al enlace de videollamada con cámara y audio activados.';
            changed = true;
          } else if (/pilates|funcional/i.test(s.name)) {
            s.reminderNotes =
              'Llevar ropa deportiva, toalla de entrenamiento y botella de agua.';
            changed = true;
          } else {
            s.reminderNotes =
              'Llevar ropa cómoda y acudir con 5-10 minutos de antelación al inicio de la sesión.';
            changed = true;
          }
        }
        if (changed) {
          await this.serviceRepo.save(s);
        }
      }

      // 6. Global safety sweep: ensure all database records replace 16:30 with 16:00
      await this.serviceRepo.query(`
        UPDATE services 
        SET description = replace(description, '16:30', '16:00'),
            "scheduleText" = replace("scheduleText", '16:30', '16:00')
        WHERE description LIKE '%16:30%' OR "scheduleText" LIKE '%16:30%';
      `).catch(() => null);

      await this.serviceRepo.query(`
        UPDATE agent_configs
        SET "customInstructions" = replace("customInstructions", '16:30', '16:00')
        WHERE "customInstructions" LIKE '%16:30%';
      `).catch(() => null);

      await this.serviceRepo.query(`
        UPDATE agent_configs
        SET services = replace(services::text, '16:30', '16:00')::jsonb
        WHERE services::text LIKE '%16:30%';
      `).catch(() => null);

      await this.serviceRepo.query(`
        UPDATE knowledge_documents
        SET content = replace(content, '16:30', '16:00')
        WHERE content LIKE '%16:30%';
      `).catch(() => null);

      await this.serviceRepo.query(`
        UPDATE knowledge_chunks
        SET content = replace(content, '16:30', '16:00')
        WHERE content LIKE '%16:30%';
      `).catch(() => null);

      await this.serviceRepo.query(`
        DO $$ 
        BEGIN
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mastra_messages') THEN
            UPDATE mastra_messages SET content = replace(content, '16:30', '16:00') WHERE content LIKE '%16:30%';
          END IF;
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'messages') THEN
            UPDATE messages SET body = replace(body, '16:30', '16:00') WHERE body LIKE '%16:30%';
          END IF;
        END $$;
      `).catch(() => null);

      // Safety sweep: ensure any legacy deleted services are marked inactive in DB
      await this.serviceRepo.query(`
        UPDATE services 
        SET "isActive" = false 
        WHERE name ILIKE '%iaid%' 
           OR name ILIKE '%ninjutsu%' 
           OR name ILIKE '%taich%' 
           OR name ILIKE '%entrenamiento funcional%'
           OR name ILIKE '%fisioterapia%'
           OR name ILIKE '%diagnóstico clínico%';
      `).catch(() => null);

      // Ensure Bienestar Experience points to itinerario-9.mp4
      await this.serviceRepo.query(`
        UPDATE services 
        SET "videoParticularUrl" = '/videos/itinerario-9.mp4',
            "videoParticularPath" = 'media_base/videos/itinerario-9.mp4'
        WHERE name ILIKE '%bienestar%' AND ("videoParticularUrl" IS NULL OR "videoParticularUrl" = '' OR "videoParticularUrl" LIKE '%itinerario-8%' OR "videoParticularUrl" LIKE '%itinerario8%');
      `).catch(() => null);

      // Ensure Bienestar Experience price is 19.99 and description matches across all database tables
      await this.serviceRepo.query(`
        UPDATE services 
        SET price = '19.99',
            description = replace(replace(description, 'Precio: 25€', 'Precio: 19.99€'), '25€', '19.99€')
        WHERE name ILIKE '%bienestar%' AND (price = '25.00' OR price = '25' OR price IS NULL OR description LIKE '%25€%');
      `).catch(() => null);

      await this.serviceRepo.query(`
        UPDATE agent_configs
        SET services = replace(replace(services::text, '"price":"25.00"', '"price":"19.99"'), '25€', '19.99€')::jsonb
        WHERE services::text LIKE '%bienestar%' AND (services::text LIKE '%"price":"25.00"%' OR services::text LIKE '%25€%');
      `).catch(() => null);

      await this.serviceRepo.query(`
        UPDATE agent_configs
        SET "customInstructions" = replace(
          replace(
            replace(
              replace(
                replace(
                  replace("customInstructions", '25.00 € / sesión', '19.99 € / sesión'),
                  '25,00 € / sesión', '19.99 € / sesión'
                ),
                '25€ / sesión', '19.99€ / sesión'
              ),
              '25.00 €', '19.99 €'
            ),
            '25,00 €', '19.99 €'
          ),
          '25€', '19.99€'
        )
        WHERE "customInstructions" ILIKE '%bienestar%' AND "customInstructions" LIKE '%25%';
      `).catch(() => null);

      await this.serviceRepo.query(`
        UPDATE knowledge_documents
        SET content = replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(content, '25.00 € / sesión', '19.99 € / sesión'),
                    '25,00 € / sesión', '19.99 € / sesión'
                  ),
                  '25€ / sesión 1h', '19.99€ / sesión 1h'
                ),
                '25€ / sesión', '19.99€ / sesión'
              ),
              '25.00 €', '19.99 €'
            ),
            '25,00 €', '19.99 €'
          ),
          'Precio: 25€', 'Precio: 19.99€'
        )
        WHERE content ILIKE '%bienestar%';
      `).catch(() => null);

      await this.serviceRepo.query(`
        UPDATE knowledge_chunks
        SET content = replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(content, '25.00 € / sesión', '19.99 € / sesión'),
                    '25,00 € / sesión', '19.99 € / sesión'
                  ),
                  '25€ / sesión 1h', '19.99€ / sesión 1h'
                ),
                '25€ / sesión', '19.99€ / sesión'
              ),
              '25.00 €', '19.99 €'
            ),
            '25,00 €', '19.99 €'
          ),
          'Precio: 25€', 'Precio: 19.99€'
        )
        WHERE content ILIKE '%bienestar%';
      `).catch(() => null);

      // 7. Ensure default categories exist and link existing services
      try {
        const defaultCategories = [
          {
            code: 'yoga_meditacion',
            name: 'Clases Regulares de Yoga y Meditación',
            description: 'ESCUELA SALVADORA CONESA · CLASES REGULARES\nHatha Yoga Terapéutico, Meditaciones y Terapias',
            displayOrder: 1,
          },
          {
            code: 'salud_terapeutica',
            name: 'Salud Terapéutica y Sesiones Individuales',
            description: 'CONSULTAS PERSONALIZADAS Y ACOMPAÑAMIENTO INDIVIDUAL',
            displayOrder: 2,
          },
          {
            code: 'talleres_eventos',
            name: 'Talleres Vivenciales, Retiros y Eventos',
            description: 'ENCUENTROS, RETIROS Y EXPERIENCIAS TRANSFORMADORAS',
            displayOrder: 3,
          },
          {
            code: 'longevidad_artes',
            name: 'Actividades Especiales',
            description: 'BIENESTAR EXPERIENCE, LONGEVIDAD ACTIVA Y ACTIVIDADES COMPLEMENTARIAS',
            displayOrder: 4,
          },
        ];

        for (const catData of defaultCategories) {
          let cat = await this.categoryRepo.findOne({ where: { code: catData.code } });
          if (!cat) {
            await this.categoryRepo.save(this.categoryRepo.create(catData));
          } else {
            cat.displayOrder = catData.displayOrder;
            cat.name = catData.name;
            cat.description = catData.description;
            await this.categoryRepo.save(cat);
          }
        }

        const catLongevidad = await this.categoryRepo.findOne({ where: { code: 'longevidad_artes' } });
        const catYoga = await this.categoryRepo.findOne({ where: { code: 'yoga_meditacion' } });
        const catEventos = await this.categoryRepo.findOne({ where: { code: 'talleres_eventos' } });
        const catSalud = await this.categoryRepo.findOne({ where: { code: 'salud_terapeutica' } });

        const currentServices = await this.serviceRepo.find();
        for (const s of currentServices) {
          let changed = false;
          const lower = s.name.toLowerCase();

          // Link category with accurate classification
          let targetCatId: string | null = null;
          if (
            lower.includes('bienestar') ||
            lower.includes('longevidad') ||
            lower.includes('especial')
          ) {
            targetCatId = catLongevidad?.id || null;
          } else if (
            lower.includes('gestalt')
          ) {
            targetCatId = catSalud?.id || null;
          } else if (
            s.serviceType === ServiceType.EVENT ||
            lower.includes('gong') ||
            lower.includes('puja') ||
            lower.includes('constelaci') ||
            lower.includes('ayuno') ||
            lower.includes('mujeres') ||
            lower.includes('retiro')
          ) {
            targetCatId = catEventos?.id || null;
          } else {
            targetCatId = catYoga?.id || null;
          }

          if (targetCatId && s.categoryId !== targetCatId) {
            s.categoryId = targetCatId;
            changed = true;
          }

          // Clean legacy placeholder flyer that was repeated across all seed services
          if (s.flyerUrl === '/flyer-parque-granada.png' || s.flyerPath === '/flyer-parque-granada.png') {
            s.flyerUrl = null;
            s.flyerPath = null;
            changed = true;
          }

          // Ensure specific flyers for activities that have their own flyer
          if (lower.includes('ayuno')) {
            if (!s.flyerParticularUrl) {
              s.flyerParticularUrl = '/flyers/ayuno_particular.jpg';
              s.flyerParticularPath = 'public/flyers/ayuno_particular.jpg';
              changed = true;
            }
            if (!s.videoParticularUrl) {
              s.videoParticularUrl = '/videos/ayunoterapeuticoparticular.mp4';
              s.videoParticularPath = 'public/videos/ayunoterapeuticoparticular.mp4';
              changed = true;
            }
          }

          if (changed) {
            await this.serviceRepo.save(s);
          }
        }
      } catch (catErr) {
        console.warn('Notice seeding categories or linking services:', catErr);
      }
    } catch {
      // Non-fatal on init
    }
  }

  private async enrichService(service: Service): Promise<Service> {
    const attendeesCount = await this.appointmentRepo.count({
      where: [
        { serviceId: service.id, status: Not(AppointmentStatus.CANCELLED) },
        { service: service.name, status: Not(AppointmentStatus.CANCELLED) },
      ],
    });
    service.attendeesCount = attendeesCount;
    service.availableSeats = service.maxCapacity
      ? Math.max(0, service.maxCapacity - attendeesCount)
      : null;
    service.quorumReached = service.minQuorum
      ? attendeesCount >= service.minQuorum
      : true;
    return service;
  }

  async findManagers(): Promise<User[]> {
    return this.userRepo.find({
      where: {
        role: In([UserRole.SERVICE_MANAGER, UserRole.ADMIN]),
        isActive: true,
      },
      select: ['id', 'name', 'email', 'role'],
      order: { name: 'ASC' },
    });
  }

  async findAll(
    activeOnly = false,
    categoryId?: string,
    serviceType?: string,
  ): Promise<Service[]> {
    const qb = this.serviceRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.manager', 'manager')
      .leftJoinAndSelect('s.category', 'category')
      .orderBy('COALESCE(category.displayOrder, 999)', 'ASC')
      .addOrderBy('s.displayOrder', 'ASC')
      .addOrderBy('s.name', 'ASC');

    if (activeOnly) {
      qb.where('s.isActive = :active', { active: true });
      const today = new Date().toISOString().slice(0, 10);
      qb.andWhere('(s.fechaDesde IS NULL OR s.fechaDesde <= :today)', { today });
      qb.andWhere('(s.fechaHasta IS NULL OR s.fechaHasta >= :today)', { today });
    }

    if (categoryId && categoryId !== 'all') {
      qb.andWhere('(s.categoryId::text = :catId OR category.code = :catId)', { catId: categoryId });
    }

    if (serviceType && serviceType !== 'all') {
      qb.andWhere('s.serviceType = :sType', { sType: serviceType });
    }

    const services = await qb.getMany();
    return Promise.all(services.map((s) => this.enrichService(s)));
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.serviceRepo.findOne({
      where: { id },
      relations: ['manager', 'category'],
    });
    if (!service) {
      throw new NotFoundException(`Servicio ${id} no encontrado`);
    }
    return this.enrichService(service);
  }

  async findByName(name: string): Promise<Service | null> {
    const service = await this.serviceRepo.findOne({
      where: { name },
      relations: ['manager', 'category'],
    });
    if (!service) return null;
    return this.enrichService(service);
  }

  private async syncAgentConfigServices(): Promise<void> {
    try {
      const allServices = await this.serviceRepo.find({ where: { isActive: true } });
      const agentConfigs = await this.agentConfigRepo.find();
      for (const agent of agentConfigs) {
        agent.services = allServices.map((s) => ({
          name: s.name,
          durationMinutes: s.durationMinutes,
          price: s.price,
          serviceType: s.serviceType,
          eventDatesText: s.eventDatesText,
          scheduleText: s.scheduleText,
          description: s.description,
          weeklySchedule: s.weeklySchedule,
          maxCapacity: s.maxCapacity,
          minQuorum: s.minQuorum,
          paymentType: s.paymentType,
          externalPaymentUrl: s.externalPaymentUrl,
          allowedModalities: s.allowedModalities,
          requiresReason: s.requiresReason,
          sinfechadefinitiva: s.sinfechadefinitiva,
          textosinfechadefinitiva: s.textosinfechadefinitiva,
          sinpreciodefinitivo: s.sinpreciodefinitivo,
          textosinpreciodefinitivo: s.textosinpreciodefinitivo,
        }));
        await this.agentConfigRepo.save(agent);
      }
    } catch (err) {
      console.warn('Notice updating agent_configs services:', err);
    }
  }

  async create(dto: CreateServiceDto): Promise<Service> {
    const existing = await this.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Ya existe un servicio con el nombre "${dto.name}"`);
    }

    const generatedCalendarId = `cal-${dto.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    let weeklySchedule = dto.weeklySchedule;
    if (!weeklySchedule && dto.scheduleText) {
      weeklySchedule = parseWeeklyScheduleFromText(dto.scheduleText) || undefined;
    }
    const service = this.serviceRepo.create({
      name: dto.name,
      description: dto.description,
      serviceType: dto.serviceType,
      eventDatesText: dto.eventDatesText,
      scheduleText: dto.scheduleText,
      weeklySchedule: dto.weeklySchedule,
      eventStartDate: dto.eventStartDate ? new Date(dto.eventStartDate) : null,
      eventEndDate: dto.eventEndDate ? new Date(dto.eventEndDate) : null,
      maxCapacity: dto.maxCapacity,
      minQuorum: dto.minQuorum,
      quorumDeadline: dto.quorumDeadline ? new Date(dto.quorumDeadline) : null,
      durationMinutes: dto.durationMinutes,
      price: dto.price === '' ? null : dto.price,
      paymentType: dto.paymentType,
      externalPaymentUrl: dto.externalPaymentUrl,
      calendarId: dto.calendarId,
      managerId: dto.managerId || null,
      requiresApproval: dto.requiresApproval !== undefined ? dto.requiresApproval : false,
      allowedModalities: dto.allowedModalities || ['in_person'],
      requiresReason: dto.requiresReason !== undefined ? dto.requiresReason : false,
      calEventTypeId: dto.calEventTypeId,
      reminderNotes: dto.reminderNotes || null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      notifyByEmail: dto.notifyByEmail !== undefined ? dto.notifyByEmail : true,
      notifyByWhatsapp: dto.notifyByWhatsapp !== undefined ? dto.notifyByWhatsapp : true,
      notifyBySms: dto.notifyBySms !== undefined ? dto.notifyBySms : true,
      reminderWhatsapp: dto.reminderWhatsapp !== undefined ? dto.reminderWhatsapp : true,
      reminderEmail: dto.reminderEmail !== undefined ? dto.reminderEmail : true,
      reminderVoice: dto.reminderVoice !== undefined ? dto.reminderVoice : false,
      reminderSms: dto.reminderSms !== undefined ? dto.reminderSms : false,
      reminderHoursEnabled: dto.reminderHoursEnabled !== undefined ? dto.reminderHoursEnabled : true,
      reminderHours: dto.reminderHours !== undefined ? dto.reminderHours : 24,
      reminderMinutesEnabled: dto.reminderMinutesEnabled !== undefined ? dto.reminderMinutesEnabled : true,
      reminderMinutes: dto.reminderMinutes !== undefined ? dto.reminderMinutes : 120,
      categoryId: dto.categoryId || null,
      displayOrder: dto.displayOrder !== undefined ? dto.displayOrder : 0,
      flyerPath: dto.flyerPath || null,
      flyerUrl: dto.flyerUrl || null,
      flyerParticularPath: dto.flyerParticularPath || null,
      flyerParticularUrl: dto.flyerParticularUrl || null,
      videoParticularPath: dto.videoParticularPath || null,
      videoParticularUrl: dto.videoParticularUrl || null,
      fechaDesde: dto.fechaDesde || '2000-01-01',
      fechaHasta: dto.fechaHasta || '2099-12-31',
      sinfechadefinitiva: dto.sinfechadefinitiva || 'N',
      textosinfechadefinitiva: dto.textosinfechadefinitiva || null,
      sinpreciodefinitivo: dto.sinpreciodefinitivo || 'N',
      textosinpreciodefinitivo: dto.textosinpreciodefinitivo || null,
    });

    const saved = await this.serviceRepo.save(service);
    await this.syncAgentConfigServices();
    this.eventEmitter.emit('service.changed', saved);
    return this.enrichService(saved);
  }

  async update(id: string, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.findOne(id);

    if (dto.name && dto.name !== service.name) {
      const existing = await this.findByName(dto.name);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Ya existe un servicio con el nombre "${dto.name}"`);
      }
      service.name = dto.name;
    }

    if (dto.description !== undefined) service.description = dto.description;
    if (dto.serviceType !== undefined) service.serviceType = dto.serviceType;
    if (dto.eventDatesText !== undefined) service.eventDatesText = dto.eventDatesText;
    if (dto.scheduleText !== undefined) {
      service.scheduleText = dto.scheduleText;
      if (dto.weeklySchedule !== undefined) {
        service.weeklySchedule = dto.weeklySchedule;
      } else {
        const parsed = parseWeeklyScheduleFromText(dto.scheduleText);
        if (parsed) service.weeklySchedule = parsed;
      }
    } else if (dto.weeklySchedule !== undefined) {
      service.weeklySchedule = dto.weeklySchedule;
    } else if (dto.description !== undefined && (!service.weeklySchedule || Object.keys(service.weeklySchedule).length === 0)) {
      const parsed = parseWeeklyScheduleFromText(dto.description);
      if (parsed) service.weeklySchedule = parsed;
    }
    if (dto.eventStartDate !== undefined)
      service.eventStartDate = dto.eventStartDate ? new Date(dto.eventStartDate) : null;
    if (dto.eventEndDate !== undefined)
      service.eventEndDate = dto.eventEndDate ? new Date(dto.eventEndDate) : null;
    if (dto.maxCapacity !== undefined) service.maxCapacity = dto.maxCapacity;
    if (dto.minQuorum !== undefined) service.minQuorum = dto.minQuorum;
    if (dto.quorumDeadline !== undefined)
      service.quorumDeadline = dto.quorumDeadline ? new Date(dto.quorumDeadline) : null;
    if (dto.durationMinutes !== undefined) service.durationMinutes = dto.durationMinutes;
    if (dto.price !== undefined) service.price = dto.price === '' ? null : dto.price;
    if (dto.paymentType !== undefined) service.paymentType = dto.paymentType;
    if (dto.externalPaymentUrl !== undefined) service.externalPaymentUrl = dto.externalPaymentUrl;
    if (dto.calendarId !== undefined) service.calendarId = dto.calendarId;
    if (dto.managerId !== undefined) service.managerId = dto.managerId || null;
    if (dto.requiresApproval !== undefined) service.requiresApproval = dto.requiresApproval;
    if (dto.allowedModalities !== undefined) service.allowedModalities = dto.allowedModalities;
    if (dto.requiresReason !== undefined) service.requiresReason = dto.requiresReason;
    if (dto.calEventTypeId !== undefined) service.calEventTypeId = dto.calEventTypeId;
    if (dto.reminderNotes !== undefined) service.reminderNotes = dto.reminderNotes || null;
    if (dto.isActive !== undefined) service.isActive = dto.isActive;
    if (dto.notifyByEmail !== undefined) service.notifyByEmail = dto.notifyByEmail;
    if (dto.notifyByWhatsapp !== undefined) service.notifyByWhatsapp = dto.notifyByWhatsapp;
    if (dto.notifyBySms !== undefined) service.notifyBySms = dto.notifyBySms;
    if (dto.reminderWhatsapp !== undefined) service.reminderWhatsapp = dto.reminderWhatsapp;
    if (dto.reminderEmail !== undefined) service.reminderEmail = dto.reminderEmail;
    if (dto.reminderVoice !== undefined) service.reminderVoice = dto.reminderVoice;
    if (dto.reminderSms !== undefined) service.reminderSms = dto.reminderSms;
    if (dto.reminderHoursEnabled !== undefined) service.reminderHoursEnabled = dto.reminderHoursEnabled;
    if (dto.reminderHours !== undefined) service.reminderHours = dto.reminderHours;
    if (dto.reminderMinutesEnabled !== undefined) service.reminderMinutesEnabled = dto.reminderMinutesEnabled;
    if (dto.reminderMinutes !== undefined) service.reminderMinutes = dto.reminderMinutes;
    if (dto.categoryId !== undefined) service.categoryId = dto.categoryId || null;
    if (dto.displayOrder !== undefined) service.displayOrder = dto.displayOrder;
    if (dto.flyerPath !== undefined) service.flyerPath = dto.flyerPath || null;
    if (dto.flyerUrl !== undefined) service.flyerUrl = dto.flyerUrl || null;
    if (dto.flyerParticularPath !== undefined) service.flyerParticularPath = dto.flyerParticularPath || null;
    if (dto.flyerParticularUrl !== undefined) service.flyerParticularUrl = dto.flyerParticularUrl || null;
    if (dto.videoParticularPath !== undefined) service.videoParticularPath = dto.videoParticularPath || null;
    if (dto.videoParticularUrl !== undefined) service.videoParticularUrl = dto.videoParticularUrl || null;
    if (dto.fechaDesde !== undefined) service.fechaDesde = dto.fechaDesde || '2000-01-01';
    if (dto.fechaHasta !== undefined) service.fechaHasta = dto.fechaHasta || '2099-12-31';
    if (dto.sinfechadefinitiva !== undefined) service.sinfechadefinitiva = dto.sinfechadefinitiva;
    if (dto.textosinfechadefinitiva !== undefined) service.textosinfechadefinitiva = dto.textosinfechadefinitiva || null;
    if (dto.sinpreciodefinitivo !== undefined) service.sinpreciodefinitivo = dto.sinpreciodefinitivo;
    if (dto.textosinpreciodefinitivo !== undefined) service.textosinpreciodefinitivo = dto.textosinpreciodefinitivo || null;

    const saved = await this.serviceRepo.save(service);
    await this.syncAgentConfigServices();
    this.eventEmitter.emit('service.changed', saved);
    return this.enrichService(saved);
  }

  async duplicate(id: string, actor?: { id?: string | null; email?: string | null }): Promise<Service> {
    const source = await this.findOne(id);
    if (!source) {
      throw new NotFoundException(`Servicio original ${id} no encontrado`);
    }

    // Generate unique name: "Nombre (Copia)" or "Nombre (Copia 2)", etc.
    let copyName = `${source.name} (Copia)`;
    let counter = 2;
    while (await this.findByName(copyName)) {
      copyName = `${source.name} (Copia ${counter})`;
      counter++;
    }

    const generatedCalendarId = `cal-${copyName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    const newService = this.serviceRepo.create({
      name: copyName,
      description: source.description,
      serviceType: source.serviceType,
      eventDatesText: source.eventDatesText,
      scheduleText: source.scheduleText,
      weeklySchedule: source.weeklySchedule,
      flyerUrl: source.flyerUrl,
      flyerPath: source.flyerPath,
      flyerParticularUrl: source.flyerParticularUrl,
      flyerParticularPath: source.flyerParticularPath,
      videoParticularUrl: source.videoParticularUrl,
      videoParticularPath: source.videoParticularPath,
      fechaDesde: source.fechaDesde || '2000-01-01',
      fechaHasta: source.fechaHasta || '2099-12-31',
      eventStartDate: source.eventStartDate,
      eventEndDate: source.eventEndDate,
      maxCapacity: source.maxCapacity,
      minQuorum: source.minQuorum,
      quorumDeadline: source.quorumDeadline,
      durationMinutes: source.durationMinutes,
      price: source.price,
      paymentType: source.paymentType,
      externalPaymentUrl: source.externalPaymentUrl,
      calendarId: generatedCalendarId,
      managerId: source.managerId,
      categoryId: source.categoryId,
      displayOrder: (source.displayOrder ?? 0) + 1,
      requiresApproval: source.requiresApproval,
      allowedModalities: source.allowedModalities ? [...source.allowedModalities] : ['in_person'],
      requiresReason: source.requiresReason,
      calEventTypeId: source.calEventTypeId,
      reminderNotes: source.reminderNotes,
      isActive: true,
      notifyByEmail: source.notifyByEmail,
      notifyByWhatsapp: source.notifyByWhatsapp,
      notifyBySms: source.notifyBySms,
      reminderWhatsapp: source.reminderWhatsapp,
      reminderEmail: source.reminderEmail,
      reminderVoice: source.reminderVoice,
      reminderSms: source.reminderSms,
      reminderHoursEnabled: source.reminderHoursEnabled,
      reminderHours: source.reminderHours,
      reminderMinutesEnabled: source.reminderMinutesEnabled,
      reminderMinutes: source.reminderMinutes,
      sinfechadefinitiva: source.sinfechadefinitiva,
      textosinfechadefinitiva: source.textosinfechadefinitiva,
      sinpreciodefinitivo: source.sinpreciodefinitivo,
      textosinpreciodefinitivo: source.textosinpreciodefinitivo,
    });

    const saved = await this.serviceRepo.save(newService);
    await this.syncAgentConfigServices();
    this.eventEmitter.emit('service.changed', saved);

    this.eventEmitter.emit(AUDIT_EVENT, {
      actor: actor || { id: null, email: 'system' },
      action: 'service.duplicate',
      summary: `Servicio "${source.name}" duplicado como "${saved.name}"`,
      targetId: saved.id,
      targetType: 'service',
    });

    return this.enrichService(saved);
  }

  async remove(id: string, actor?: { id?: string | null; email?: string | null }): Promise<void> {
    const service = await this.findOne(id);
    if (!service) {
      throw new NotFoundException(`Servicio ${id} no encontrado`);
    }

    const serviceName = service.name;

    // 1. Delete all associated appointments
    const appts = await this.appointmentRepo.find({
      where: [
        { serviceId: service.id },
        { service: serviceName },
      ],
    });
    const apptCount = appts.length;
    if (apptCount > 0) {
      await this.appointmentRepo.remove(appts);
    }

    // 2. Remove service from all agent configs (and clean customInstructions if mentioning service)
    const agentConfigs = await this.agentConfigRepo.find();
    for (const agent of agentConfigs) {
      let changed = false;
      if (Array.isArray(agent.services)) {
        const prevLen = agent.services.length;
        agent.services = agent.services.filter(
          (s: any) => (s.name || '').trim().toLowerCase() !== serviceName.trim().toLowerCase(),
        );
        if (agent.services.length !== prevLen) {
          changed = true;
        }
      }
      if (agent.customInstructions && agent.customInstructions.toLowerCase().includes(serviceName.toLowerCase())) {
        const lines = agent.customInstructions.split('\n');
        const filtered = lines.filter((l) => !l.toLowerCase().includes(serviceName.toLowerCase()));
        agent.customInstructions = filtered.join('\n');
        changed = true;
      }
      if (changed) {
        await this.agentConfigRepo.save(agent);
      }
    }

    // 3. Clean up knowledge documents / chunks specifically mentioning this service
    try {
      const docs = await this.knowledgeDocRepo.find({
        where: { filename: ILike(`%${serviceName}%`) },
      });
      for (const doc of docs) {
        await this.knowledgeChunkRepo.delete({ documentId: doc.id });
        await this.knowledgeDocRepo.delete(doc.id);
      }
    } catch {
      // non-fatal
    }

    // 4. Delete the service record itself
    await this.serviceRepo.delete(service.id);
    await this.syncAgentConfigServices();
    this.eventEmitter.emit('service.changed', { id: service.id, name: serviceName });

    // 5. Emit audit event
    this.eventEmitter.emit(AUDIT_EVENT, {
      actor: actor || { id: null, email: 'admin' },
      action: 'service.delete',
      summary: `Servicio "${serviceName}" eliminado permanentemente junto con ${apptCount} citas asociadas`,
      targetId: service.id,
      targetType: 'service',
    });
  }

  async removeBulk(ids: string[], actor?: { id?: string | null; email?: string | null }): Promise<{ deleted: number }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      return { deleted: 0 };
    }

    let deleted = 0;
    for (const id of ids) {
      try {
        await this.remove(id, actor);
        deleted++;
      } catch (err) {
        console.warn(`[removeBulk] Error deleting service ${id}:`, err);
      }
    }
    return { deleted };
  }
}