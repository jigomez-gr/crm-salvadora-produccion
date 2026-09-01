import { Injectable, NotFoundException, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Service, ServiceType } from '../common/entities/service.entity';
import { User, UserRole } from '../common/entities/user.entity';
import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService implements OnModuleInit {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(AgentConfig)
    private readonly agentConfigRepo: Repository<AgentConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
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
        gestaltSvc.price = '35.00';
        gestaltSvc.allowedModalities = ['in_person', 'virtual'];
        gestaltSvc.isActive = true;
        gestaltSvc.description =
          'Sesión individual de psicoterapia Gestalt presencial u online. Enfoque humanista y toma de conciencia. Horario convenido individualmente entre terapeuta y alumno/paciente. Requiere aprobación previa por parte del terapeuta responsable (Jose Ignacio Gomez Raya). Precio: 35€ por sesión de 1 hora. Pago en el centro.';
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
        bienestarSvc.price = bienestarSvc.price || '25.00';
        bienestarSvc.allowedModalities = ['in_person', 'virtual'];
        bienestarSvc.isActive = true;
        bienestarSvc.description =
          'Programa y sesiones de asesoramiento personalizado presencial y online en longevidad, bienestar integral, nutrición, biohacking, meditación y psicología positiva. Horario convenido individualmente. Requiere aprobación previa del responsable (Jose Ignacio Gomez Raya). Precio: 25€ por sesión de 1 hora. Pago en el centro.';
        await this.serviceRepo.save(bienestarSvc);
      } else {
        bienestarSvc = await this.serviceRepo.save(
          this.serviceRepo.create({
            name: 'Bienestar Experience (Longevidad y Bienestar Integral)',
            description:
              'Programa y sesiones de asesoramiento personalizado presencial y online en longevidad, bienestar integral, nutrición, biohacking, meditación y psicología positiva. Horario convenido individualmente. Requiere aprobación previa del responsable (Jose Ignacio Gomez Raya). Precio: 25€ por sesión de 1 hora. Pago en el centro.',
            serviceType: ServiceType.RECURRING,
            durationMinutes: 60,
            price: '25.00',
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
              'Jornada y círculo femenino de empoderamiento, arquetipos, sanación de memorias, meditación y autocuidado. Fecha prevista: Sábado 15 de Mayo de 2027 (10:00 a 16:00). Aforo: 25 personas. Precio: 45€. Pago en el centro.',
            serviceType: ServiceType.EVENT,
            eventDatesText: 'Sábado 15 de Mayo de 2027 (10:00 a 16:00)',
            eventStartDate: new Date('2027-05-15T10:00:00.000Z'),
            eventEndDate: new Date('2027-05-15T16:00:00.000Z'),
            durationMinutes: 360,
            price: '45.00',
            maxCapacity: 25,
            calendarId: 'cal-encuentro-mujeres',
            managerId: manager.id,
            requiresApproval: false,
            allowedModalities: ['in_person'],
            reminderNotes:
              'Llevar ropa cómoda y holgada, cojín de meditación o esterilla si lo deseas, cuaderno/diario personal para notas y comida ligera para compartir en el descanso.',
            isActive: true,
          }),
        );
      } else {
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
              'Retiro semestral (Otoño y Primavera) de depuración celular, ayuno consciente con caldos y tisanas, senderismo suave en la naturaleza, descanso y reconexión holística. Próxima edición: Puente de Octubre (Del 9 al 12 de Octubre de 2026). Aforo: 20 plazas. Pago en el centro.',
            serviceType: ServiceType.EVENT,
            eventDatesText: 'Del 9 al 12 de Octubre de 2026 (Puente de Octubre)',
            eventStartDate: new Date('2026-10-09T16:00:00.000Z'),
            eventEndDate: new Date('2026-10-12T16:00:00.000Z'),
            durationMinutes: 1440,
            price: '180.00',
            maxCapacity: 20,
            calendarId: 'cal-ayuno-terapeutico',
            managerId: manager.id,
            requiresApproval: false,
            allowedModalities: ['in_person'],
            reminderNotes:
              'Llevar ropa cómoda de abrigo para la naturaleza, calzado de senderismo/montaña, botella de agua reutilizable, libreta de notas, bañador y toalla grande para saunas/baños termales si aplica.',
            isActive: true,
          }),
        );
      } else {
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
            eventStartDate: new Date('2026-09-26T18:00:00.000Z'),
            eventEndDate: new Date('2026-09-26T20:00:00.000Z'),
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
              'Evento anual de inmersión y transformación sonora durante toda la noche (11 horas continuas de sonido). Fecha prevista: Sábado 28 de Noviembre de 2026 (21:00 a 08:00). Aforo: 30 personas. Precio: 95€. Pago en el centro.',
            serviceType: ServiceType.EVENT,
            eventDatesText: 'Sábado 28 de Noviembre de 2026 (21:00 a 08:00)',
            eventStartDate: new Date('2026-11-28T21:00:00.000Z'),
            eventEndDate: new Date('2026-11-29T08:00:00.000Z'),
            durationMinutes: 660,
            price: '95.00',
            maxCapacity: 30,
            calendarId: 'cal-puja-gongs',
            managerId: manager.id,
            requiresApproval: false,
            allowedModalities: ['in_person'],
            reminderNotes:
              'Traer esterilla cómoda o colchoneta fina, saco de dormir o mantas, almohada/cojín, botella de agua y ropa cómoda para toda la noche.',
            isActive: true,
          }),
        );
      } else {
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
          if (/gestalt/i.test(s.name || '')) {
            changed = true;
            return {
              ...s,
              managerId: manager.id,
              requiresApproval: true,
              maxCapacity: 1,
              durationMinutes: 60,
              price: '35.00',
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
              price: s.price || '25.00',
              allowedModalities: ['in_person', 'virtual'],
            };
          }
          if (/mujeres|femenino/i.test(s.name || '')) {
            hasMujeres = true;
          }
          if (/ayuno/i.test(s.name || '')) {
            hasAyuno = true;
          }
          if (/baño de gong|sonora/i.test(s.name || '')) {
            hasGong = true;
          }
          if (/puja/i.test(s.name || '')) {
            hasPuja = true;
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
          } else if (/meditaci/i.test(s.name)) {
            s.reminderNotes =
              'Llevar ropa cómoda. Rogamos máxima puntualidad (9:15) para no interrumpir el centramiento y silencio de la sala.';
            changed = true;
          } else if (/baño de gong|sonora/i.test(s.name)) {
            s.reminderNotes =
              'Llevar ropa cómoda de abrigo, calcetines cálidos y, si lo deseas, tu propia manta o cojín para disfrutar de la experiencia sonora con el máximo confort.';
            changed = true;
          } else if (/puja/i.test(s.name)) {
            s.reminderNotes =
              'Traer esterilla cómoda o colchoneta fina, saco de dormir o mantas, almohada/cojín, botella de agua y ropa cómoda para toda la noche.';
            changed = true;
          } else if (/constelaci/i.test(s.name)) {
            s.reminderNotes =
              'Llevar ropa cómoda, cuaderno para notas si lo deseas y botella de agua.';
            changed = true;
          } else if (/gestalt/i.test(s.name)) {
            s.reminderNotes =
              'Para sesión presencial: acudir 5 minutos antes al centro. Para sesión online: conectarse puntualmente al enlace de videollamada desde un lugar tranquilo y privado con buena conexión.';
            changed = true;
          } else if (/bienestar/i.test(s.name)) {
            s.reminderNotes =
              'Para sesión presencial: acudir con puntualidad. Para sesión online: conectarse puntualmente al enlace de videollamada con cámara y audio activados.';
            changed = true;
          } else if (/pilates|funcional/i.test(s.name)) {
            s.reminderNotes =
              'Llevar ropa deportiva, toalla de entrenamiento y botella de agua.';
            changed = true;
          } else if (/iaido|tai chi|ninjutsu|orientales/i.test(s.name)) {
            s.reminderNotes =
              'Llevar ropa deportiva holgada o uniforme de práctica. Calzado limpio de sala o práctica descalzo.';
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

  async findAll(activeOnly = false): Promise<Service[]> {
    const qb = this.serviceRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.manager', 'manager')
      .orderBy('s.name', 'ASC');

    if (activeOnly) {
      qb.where('s.isActive = :active', { active: true });
    }

    const services = await qb.getMany();
    return Promise.all(services.map((s) => this.enrichService(s)));
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.serviceRepo.findOne({
      where: { id },
      relations: ['manager'],
    });
    if (!service) {
      throw new NotFoundException(`Servicio ${id} no encontrado`);
    }
    return this.enrichService(service);
  }

  async findByName(name: string): Promise<Service | null> {
    const service = await this.serviceRepo.findOne({
      where: { name },
      relations: ['manager'],
    });
    if (!service) return null;
    return this.enrichService(service);
  }

  async create(dto: CreateServiceDto): Promise<Service> {
    const existing = await this.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Ya existe un servicio con el nombre "${dto.name}"`);
    }

    const generatedCalendarId = `cal-${dto.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const service = this.serviceRepo.create({
      ...dto,
      serviceType: dto.serviceType || ServiceType.RECURRING,
      eventDatesText: dto.eventDatesText || null,
      eventStartDate: dto.eventStartDate ? new Date(dto.eventStartDate) : null,
      eventEndDate: dto.eventEndDate ? new Date(dto.eventEndDate) : null,
      maxCapacity: dto.maxCapacity !== undefined ? dto.maxCapacity : null,
      minQuorum: dto.minQuorum !== undefined ? dto.minQuorum : null,
      quorumDeadline: dto.quorumDeadline ? new Date(dto.quorumDeadline) : null,
      calendarId: dto.calendarId || generatedCalendarId,
      allowedModalities: dto.allowedModalities || ['in_person'],
      requiresReason: dto.requiresReason ?? false,
      calEventTypeId: dto.calEventTypeId !== undefined ? dto.calEventTypeId : null,
      reminderNotes: dto.reminderNotes !== undefined ? dto.reminderNotes : null,
      price: dto.price !== undefined ? (dto.price === '' ? null : dto.price) : null,
    });

    const saved = await this.serviceRepo.save(service);
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

    const saved = await this.serviceRepo.save(service);
    return this.enrichService(saved);
  }

  async remove(id: string): Promise<void> {
    const service = await this.findOne(id);
    // Soft-deactivate or delete
    service.isActive = false;
    await this.serviceRepo.save(service);
  }
}