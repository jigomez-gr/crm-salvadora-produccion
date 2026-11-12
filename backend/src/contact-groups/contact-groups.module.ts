import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrupoContacto } from './grupo-contacto.entity';
import { MiembroGrupo } from './miembro-grupo.entity';
import { Contact } from '../common/entities/contact.entity';
import { ContactGroupsService } from './contact-groups.service';
import { ContactGroupsController } from './contact-groups.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GrupoContacto, MiembroGrupo, Contact]),
  ],
  controllers: [ContactGroupsController],
  providers: [ContactGroupsService],
  exports: [ContactGroupsService],
})
export class ContactGroupsModule {}
