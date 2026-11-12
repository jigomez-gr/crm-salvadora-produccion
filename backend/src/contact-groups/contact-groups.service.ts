import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GrupoContacto } from './grupo-contacto.entity';
import { MiembroGrupo } from './miembro-grupo.entity';
import { Contact } from '../common/entities/contact.entity';
import {
  CreateGrupoContactoDto,
  UpdateGrupoContactoDto,
  AddMiembroDto,
} from './dto/contact-group.dto';
import { OnEvent } from '@nestjs/event-emitter';

export const INITIAL_GROUPS: Array<{ name: string; description: string }> = [
  {
    name: 'YOGA_TERAPEUTICO_1',
    description: 'Grupo Hatha Yoga Terapéutico (Modalidad 1 clase semanal)',
  },
  {
    name: 'YOGA_TERAPEUTICO_2',
    description: 'Grupo Hatha Yoga Terapéutico (Modalidad 2 clases semanales)',
  },
  {
    name: 'MEDITACION',
    description: 'Grupo Meditación Guiada y Mindfulness',
  },
  {
    name: 'GESTALT',
    description: 'Grupo Terapia Gestalt y Acompañamiento Emocional',
  },
  {
    name: 'GONG',
    description: 'Grupo Baños de Gong y Terapia Sonora',
  },
  {
    name: 'CONSTELACIONES',
    description: 'Grupo Constelaciones Familiares y Talleres Sistémicos',
  },
  {
    name: 'ENCUENTROS',
    description: 'Grupo Encuentros de Mujeres y Círculos Conscientes',
  },
  {
    name: 'PUJA',
    description: 'Grupo Ceremonias Puja y Celebraciones Espirituales',
  },
  {
    name: 'RETIROS_AYUNO',
    description: 'Grupo Retiros de Yoga y Ayuno Consciente',
  },
  {
    name: 'BIENESTAR_EXPERIENCE',
    description: 'Grupo Bienestar Experience y Programas Integrales',
  },
];

@Injectable()
export class ContactGroupsService implements OnModuleInit {
  private readonly logger = new Logger(ContactGroupsService.name);

  constructor(
    @InjectRepository(GrupoContacto)
    private readonly gruposRepo: Repository<GrupoContacto>,
    @InjectRepository(MiembroGrupo)
    private readonly miembrosRepo: Repository<MiembroGrupo>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
  ) {}

  async onModuleInit() {
    await this.ensureSchema();
    await this.seedInitialGroups();
  }

  private async ensureSchema(): Promise<void> {
    try {
      await this.gruposRepo.query(`
        CREATE TABLE IF NOT EXISTS "gruposcontactos" (
          "grupocontacto" varchar(80) PRIMARY KEY,
          "descripciongrupo" text,
          "fechacreacion" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS "miembrosgrupo" (
          "id" SERIAL PRIMARY KEY,
          "grupocontacto" varchar(80) NOT NULL REFERENCES "gruposcontactos"("grupocontacto") ON DELETE CASCADE ON UPDATE CASCADE,
          "movil" varchar(64) NOT NULL,
          "campofechayhora" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
          "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS "IDX_miembrosgrupo_grupo" ON "miembrosgrupo" ("grupocontacto");
        CREATE INDEX IF NOT EXISTS "IDX_miembrosgrupo_movil" ON "miembrosgrupo" ("movil");
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_miembrosgrupo_grupo_movil" ON "miembrosgrupo" ("grupocontacto", "movil");
      `);
      this.logger.log('Database schema for gruposcontactos and miembrosgrupo verified.');
    } catch (err: any) {
      this.logger.warn(`Could not verify schema for contact groups: ${err?.message || err}`);
    }
  }

  private async seedInitialGroups(): Promise<void> {
    try {
      for (const item of INITIAL_GROUPS) {
        const existing = await this.gruposRepo.findOne({
          where: { grupocontacto: item.name },
        });
        if (!existing) {
          await this.gruposRepo.save(
            this.gruposRepo.create({
              grupocontacto: item.name,
              descripciongrupo: item.description,
            }),
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not seed initial groups: ${err?.message || err}`);
    }
  }

  /**
   * List all groups with member count.
   */
  async findAllGroups(): Promise<
    Array<{
      grupocontacto: string;
      descripciongrupo: string | null;
      fechacreacion: Date;
      memberCount: number;
    }>
  > {
    const raw = await this.gruposRepo
      .createQueryBuilder('g')
      .leftJoin('g.miembros', 'm')
      .select('g.grupocontacto', 'grupocontacto')
      .addSelect('g.descripciongrupo', 'descripciongrupo')
      .addSelect('g.fechacreacion', 'fechacreacion')
      .addSelect('COUNT(m.id)::int', 'memberCount')
      .groupBy('g.grupocontacto')
      .addGroupBy('g.descripciongrupo')
      .addGroupBy('g.fechacreacion')
      .orderBy('g.grupocontacto', 'ASC')
      .getRawMany();

    return raw.map((r) => ({
      grupocontacto: r.grupocontacto,
      descripciongrupo: r.descripciongrupo,
      fechacreacion: r.fechacreacion,
      memberCount: Number(r.memberCount || 0),
    }));
  }

  async findGroup(grupocontacto: string): Promise<GrupoContacto> {
    const group = await this.gruposRepo.findOne({
      where: { grupocontacto },
    });
    if (!group) {
      throw new NotFoundException(`El grupo "${grupocontacto}" no existe.`);
    }
    return group;
  }

  async createGroup(dto: CreateGrupoContactoDto): Promise<GrupoContacto> {
    const cleanName = dto.grupocontacto.trim().toUpperCase().replace(/\s+/g, '_');
    const existing = await this.gruposRepo.findOne({
      where: { grupocontacto: cleanName },
    });
    if (existing) {
      throw new ConflictException(`El grupo "${cleanName}" ya existe.`);
    }

    const group = this.gruposRepo.create({
      grupocontacto: cleanName,
      descripciongrupo: dto.descripciongrupo?.trim() || null,
    });
    return this.gruposRepo.save(group);
  }

  async updateGroup(
    grupocontacto: string,
    dto: UpdateGrupoContactoDto,
  ): Promise<GrupoContacto> {
    const group = await this.findGroup(grupocontacto);
    if (dto.descripciongrupo !== undefined) {
      group.descripciongrupo = dto.descripciongrupo.trim() || null;
    }
    return this.gruposRepo.save(group);
  }

  async deleteGroup(grupocontacto: string): Promise<void> {
    const group = await this.findGroup(grupocontacto);
    await this.gruposRepo.remove(group);
  }

  /**
   * List members of a group with their joined contact info:
   * teléfono, nombre y apellido, email, campofechayhora.
   */
  async findGroupMembers(grupocontacto: string): Promise<
    Array<{
      id: number;
      grupocontacto: string;
      movil: string;
      campofechayhora: Date;
      contactId: string | null;
      nombre: string;
      email: string;
    }>
  > {
    await this.findGroup(grupocontacto);

    const members = await this.miembrosRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.contact', 'c')
      .where('m.grupocontacto = :grupocontacto', { grupocontacto })
      .orderBy('m.campofechayhora', 'DESC')
      .getMany();

    return members.map((m) => {
      const contactName = m.contact?.name || '';
      const contactEmail = m.contact?.email || '';
      return {
        id: m.id,
        grupocontacto: m.grupocontacto,
        movil: m.movil,
        campofechayhora: m.campofechayhora,
        contactId: m.contactId,
        nombre: contactName,
        email: contactEmail,
      };
    });
  }

  /**
   * Add a member to a group.
   */
  async addMember(
    grupocontacto: string,
    dto: AddMiembroDto,
  ): Promise<MiembroGrupo> {
    await this.findGroup(grupocontacto);

    const cleanPhone = dto.movil.replace(/[\s\-().]/g, '').trim();
    if (!cleanPhone) {
      throw new ConflictException('El teléfono móvil no es válido.');
    }

    // Check if member already exists in group
    const existing = await this.miembrosRepo.findOne({
      where: { grupocontacto, movil: cleanPhone },
    });
    if (existing) {
      return existing;
    }

    // Resolve contact if not directly provided
    let contactId = dto.contactId || null;
    if (!contactId) {
      const digitsOnly = cleanPhone.replace(/\D/g, '');
      const last9 = digitsOnly.slice(-9);
      const contact = await this.contactsRepo
        .createQueryBuilder('c')
        .where('c.phone LIKE :last9', { last9: `%${last9}%` })
        .getOne();
      if (contact) {
        contactId = contact.id;
      }
    }

    const member = this.miembrosRepo.create({
      grupocontacto,
      movil: cleanPhone,
      contactId,
      campofechayhora: new Date(),
    });

    return this.miembrosRepo.save(member);
  }

  async removeMember(id: number): Promise<void> {
    const member = await this.miembrosRepo.findOne({ where: { id } });
    if (member) {
      await this.miembrosRepo.remove(member);
    }
  }

  async removeMemberFromGroup(
    grupocontacto: string,
    movil: string,
  ): Promise<void> {
    const cleanPhone = movil.replace(/[\s\-().]/g, '').trim();
    await this.miembrosRepo.delete({
      grupocontacto,
      movil: cleanPhone,
    });
  }

  /**
   * Get all groups a contact belongs to (by contactId or phone).
   */
  async getGroupsForContact(contactId: string): Promise<
    Array<{
      id: number;
      grupocontacto: string;
      descripciongrupo: string | null;
      movil: string;
      campofechayhora: Date;
    }>
  > {
    const contact = await this.contactsRepo.findOne({ where: { id: contactId } });
    const phone = contact?.phone?.replace(/[\s\-().]/g, '').trim();
    const last9 = phone ? phone.replace(/\D/g, '').slice(-9) : null;

    const qb = this.miembrosRepo
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.grupo', 'g')
      .where('m.contactId = :contactId', { contactId });

    if (last9) {
      qb.orWhere('m.movil LIKE :last9', { last9: `%${last9}%` });
    }

    const members = await qb.orderBy('m.campofechayhora', 'DESC').getMany();

    return members.map((m) => ({
      id: m.id,
      grupocontacto: m.grupocontacto,
      descripciongrupo: m.grupo?.descripciongrupo || null,
      movil: m.movil,
      campofechayhora: m.campofechayhora,
    }));
  }

  /**
   * Export members of a group in .vcf vCard 3.0 format for WhatsApp Broadcast lists.
   */
  async generateVcf(grupocontacto: string): Promise<string> {
    const members = await this.findGroupMembers(grupocontacto);

    const vcards: string[] = [];

    for (const m of members) {
      const cleanDigits = m.movil.replace(/\D/g, '');
      const cleanWaid =
        cleanDigits.length === 9
          ? `34${cleanDigits}`
          : cleanDigits.startsWith('34')
          ? cleanDigits
          : cleanDigits;

      // Split name into first and last if available
      const fullName = m.nombre.trim() || `Contacto_${cleanDigits.slice(-4)}`;
      const nameParts = fullName.split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Format formatted phone: +34 XXX XX XX XX
      let formattedPhone = `+${cleanWaid}`;
      if (cleanWaid.startsWith('34') && cleanWaid.length === 11) {
        const p = cleanWaid.slice(2);
        formattedPhone = `+34 ${p.slice(0, 3)} ${p.slice(3, 5)} ${p.slice(5, 7)} ${p.slice(7, 9)}`;
      }

      const card = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${lastName};${firstName};;;`,
        `FN:${fullName}`,
        `item1.TEL;waid=${cleanWaid}:${formattedPhone}`,
        'item1.X-ABLabel:Móvil',
      ];

      if (m.email) {
        card.push(`EMAIL;type=INTERNET,pref:${m.email.trim()}`);
      }

      card.push('END:VCARD');
      vcards.push(card.join('\r\n'));
    }

    return vcards.join('\r\n');
  }

  /**
   * Determine target group for an appointment based on service name.
   */
  matchGroupForService(serviceName: string): string | null {
    if (!serviceName) return null;
    const s = serviceName.toLowerCase();

    if (s.includes('terap') && (s.includes(' 2') || s.includes('2 clase') || s.includes('dos'))) {
      return 'YOGA_TERAPEUTICO_2';
    }
    if (s.includes('terap') || (s.includes('yoga') && !s.includes('retiro'))) {
      return 'YOGA_TERAPEUTICO_1';
    }
    if (s.includes('medita')) {
      return 'MEDITACION';
    }
    if (s.includes('gestalt')) {
      return 'GESTALT';
    }
    if (s.includes('gong') || s.includes('sonor')) {
      return 'GONG';
    }
    if (s.includes('constela')) {
      return 'CONSTELACIONES';
    }
    if (s.includes('encuentr') || s.includes('mujer')) {
      return 'ENCUENTROS';
    }
    if (s.includes('puja')) {
      return 'PUJA';
    }
    if (s.includes('retiro') || s.includes('ayun')) {
      return 'RETIROS_AYUNO';
    }
    if (s.includes('bienestar') || s.includes('experience')) {
      return 'BIENESTAR_EXPERIENCE';
    }

    return null;
  }

  /**
   * Hook automatically called whenever an appointment is created:
   * Adds the contact to the service group.
   */
  @OnEvent('appointment.created')
  async handleAppointmentCreated(appointment: any): Promise<void> {
    try {
      if (!appointment) return;
      const serviceName = appointment.service || appointment.serviceName || '';
      const targetGroup = this.matchGroupForService(serviceName);
      if (!targetGroup) return;

      const phone =
        appointment.contact?.phone ||
        appointment.phone ||
        (appointment.contactId
          ? (await this.contactsRepo.findOne({ where: { id: appointment.contactId } }))?.phone
          : null);

      if (!phone) return;

      this.logger.log(
        `Auto-assigning contact (${phone}) to group "${targetGroup}" from appointment "${serviceName}".`,
      );

      await this.addMember(targetGroup, {
        movil: phone,
        contactId: appointment.contactId || appointment.contact?.id,
      });
    } catch (err: any) {
      this.logger.warn(`Could not auto-add contact to group on appointment creation: ${err?.message || err}`);
    }
  }
}
