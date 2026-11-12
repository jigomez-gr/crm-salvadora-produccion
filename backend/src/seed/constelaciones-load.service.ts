import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact, ContactStatus } from '../common/entities/contact.entity';
import { GrupoContacto } from '../contact-groups/grupo-contacto.entity';
import { MiembroGrupo } from '../contact-groups/miembro-grupo.entity';
import { PipelineStage } from '../contacts/pipeline';
import { parseConstelaciones } from './constelaciones-load.data';

@Injectable()
export class ConstelacionesLoadService implements OnModuleInit {
  private readonly logger = new Logger(ConstelacionesLoadService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(GrupoContacto)
    private readonly gruposRepo: Repository<GrupoContacto>,
    @InjectRepository(MiembroGrupo)
    private readonly miembrosRepo: Repository<MiembroGrupo>,
  ) {}

  async onModuleInit() {
    try {
      await this.runConstelacionesLoad();
    } catch (err: any) {
      this.logger.error(`Error executing ConstelacionesLoadService: ${err?.message || err}`);
    }
  }

  async runConstelacionesLoad(): Promise<{
    totalProcessed: number;
    contactsCreated: number;
    contactsUpdated: number;
    membersAdded: number;
  }> {
    this.logger.log('Starting CONSTELACIONES contacts load & group synchronization...');

    // 1. Ensure table schema & group CONSTELACIONES exists
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
    } catch (e: any) {
      this.logger.warn(`Could not verify table schema for grupos: ${e?.message || e}`);
    }

    let group = await this.gruposRepo.findOne({ where: { grupocontacto: 'CONSTELACIONES' } });
    if (!group) {
      group = this.gruposRepo.create({
        grupocontacto: 'CONSTELACIONES',
        descripciongrupo: 'Grupo Constelaciones Familiares y Talleres Sistémicos',
      });
      await this.gruposRepo.save(group);
      this.logger.log('Created group CONSTELACIONES.');
    }

    // 2. Process all items
    const items = parseConstelaciones();
    let contactsCreated = 0;
    let contactsUpdated = 0;
    let membersAdded = 0;

    for (const item of items) {
      const rawDigits = item.movil.replace(/\D/g, '');
      if (!rawDigits || rawDigits.length < 9) continue;
      const baseDigits =
        rawDigits.length === 11 && rawDigits.startsWith('34')
          ? rawDigits.slice(2)
          : rawDigits.slice(-9);

      const formattedPhone = `+34${baseDigits}`;

      let contact = await this.contactsRepo
        .createQueryBuilder('c')
        .where('c.phone = :formattedPhone', { formattedPhone })
        .orWhere('c.phone = :baseDigits', { baseDigits })
        .orWhere('REPLACE(REPLACE(c.phone, \' \', \'\'), \'-\', \'\') = :formattedPhone', { formattedPhone })
        .orWhere('REPLACE(REPLACE(c.phone, \' \', \'\'), \'-\', \'\') = :baseDigits', { baseDigits })
        .getOne();

      if (contact) {
        let changed = false;
        if (!contact.email || contact.email === 'cargainicial' || !contact.email.includes('@')) {
          contact.email = 'cargainicial';
          changed = true;
        }
        if (contact.emailerroneo !== 'N') {
          contact.emailerroneo = 'N';
          changed = true;
        }
        if (!contact.tags) contact.tags = [];
        if (contact.tags.includes('emailerroneo')) {
          contact.tags = contact.tags.filter((t) => t !== 'emailerroneo');
          changed = true;
        }
        for (const t of ['constelaciones', 'cargainicial']) {
          if (!contact.tags.includes(t)) {
            contact.tags.push(t);
            changed = true;
          }
        }
        if (item.observaciones) {
          if (!contact.notes) {
            contact.notes = item.observaciones;
            changed = true;
          } else if (!contact.notes.includes(item.observaciones)) {
            contact.notes = `${contact.notes} | ${item.observaciones}`;
            changed = true;
          }
        }

        if (changed) {
          await this.contactsRepo.save(contact);
          contactsUpdated++;
        }
      } else {
        contact = this.contactsRepo.create({
          name: item.nombre,
          phone: formattedPhone,
          email: 'cargainicial',
          emailerroneo: 'N',
          status: ContactStatus.ACTIVE,
          pipelineStage: PipelineStage.WON,
          tags: ['constelaciones', 'cargainicial'],
          notes: item.observaciones || 'Constelaciones',
        });
        contact = await this.contactsRepo.save(contact);
        contactsCreated++;
      }

      // Add to group CONSTELACIONES
      try {
        const existingMember = await this.miembrosRepo.findOne({
          where: [
            { grupocontacto: 'CONSTELACIONES', movil: formattedPhone },
            { grupocontacto: 'CONSTELACIONES', movil: baseDigits },
          ],
        });

        if (!existingMember) {
          const miembro = this.miembrosRepo.create({
            grupocontacto: 'CONSTELACIONES',
            movil: formattedPhone,
            contactId: contact.id,
            campofechayhora: new Date(),
          });
          await this.miembrosRepo.save(miembro);
          membersAdded++;
        } else if (!existingMember.contactId) {
          existingMember.contactId = contact.id;
          await this.miembrosRepo.save(existingMember);
        }
      } catch (err: any) {
        this.logger.warn(`Could not add ${formattedPhone} to CONSTELACIONES: ${err?.message || err}`);
      }
    }

    this.logger.log(
      `CONSTELACIONES initial load complete: ${items.length} items processed, ${contactsCreated} created, ${contactsUpdated} updated, ${membersAdded} added to CONSTELACIONES group.`,
    );

    return {
      totalProcessed: items.length,
      contactsCreated,
      contactsUpdated,
      membersAdded,
    };
  }
}
