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

      // 4. Update agent config services JSON
      const agentConfig = await this.agentConfigRepo.findOne({ where: { agentKey: 'booking' } });
      if (agentConfig && Array.isArray(agentConfig.services)) {
        let changed = false;
        let hasBienestar = false;
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
          return s;
        });

        if (!hasBienestar && bienestarSvc) {
          agentConfig.services.push({
            name: bienestarSvc.name,
            durationMinutes: 60,
          });
          changed = true;
        }

        if (changed) {
          await this.agentConfigRepo.save(agentConfig);
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