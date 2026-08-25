import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Service, ServiceType } from '../common/entities/service.entity';
import { User, UserRole } from '../common/entities/user.entity';
import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
  ) {}

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