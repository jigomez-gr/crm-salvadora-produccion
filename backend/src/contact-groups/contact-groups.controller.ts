import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Res,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ContactGroupsService } from './contact-groups.service';
import {
  CreateGrupoContactoDto,
  UpdateGrupoContactoDto,
  AddMiembroDto,
} from './dto/contact-group.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('contact-groups')
@UseGuards(JwtAuthGuard)
export class ContactGroupsController {
  constructor(private readonly contactGroupsService: ContactGroupsService) {}

  @Get()
  async findAll() {
    return this.contactGroupsService.findAllGroups();
  }

  @Post()
  async create(@Body() dto: CreateGrupoContactoDto) {
    return this.contactGroupsService.createGroup(dto);
  }

  @Get('contact/:contactId')
  async getGroupsForContact(@Param('contactId') contactId: string) {
    return this.contactGroupsService.getGroupsForContact(contactId);
  }

  @Get(':grupocontacto')
  async findOne(@Param('grupocontacto') grupocontacto: string) {
    return this.contactGroupsService.findGroup(grupocontacto);
  }

  @Put(':grupocontacto')
  async update(
    @Param('grupocontacto') grupocontacto: string,
    @Body() dto: UpdateGrupoContactoDto,
  ) {
    return this.contactGroupsService.updateGroup(grupocontacto, dto);
  }

  @Delete(':grupocontacto')
  async remove(@Param('grupocontacto') grupocontacto: string) {
    await this.contactGroupsService.deleteGroup(grupocontacto);
    return { success: true, message: `Grupo ${grupocontacto} eliminado correctamente.` };
  }

  @Get(':grupocontacto/members')
  async getMembers(@Param('grupocontacto') grupocontacto: string) {
    return this.contactGroupsService.findGroupMembers(grupocontacto);
  }

  @Post(':grupocontacto/members')
  async addMember(
    @Param('grupocontacto') grupocontacto: string,
    @Body() dto: AddMiembroDto,
  ) {
    return this.contactGroupsService.addMember(grupocontacto, dto);
  }

  @Delete(':grupocontacto/members/:id')
  async removeMember(@Param('id', ParseIntPipe) id: number) {
    await this.contactGroupsService.removeMember(id);
    return { success: true, message: 'Miembro eliminado del grupo.' };
  }

  @Delete(':grupocontacto/members/by-phone/:movil')
  async removeMemberByPhone(
    @Param('grupocontacto') grupocontacto: string,
    @Param('movil') movil: string,
  ) {
    await this.contactGroupsService.removeMemberFromGroup(grupocontacto, movil);
    return { success: true, message: 'Miembro eliminado del grupo.' };
  }

  @Get(':grupocontacto/export-vcf')
  async exportVcf(
    @Param('grupocontacto') grupocontacto: string,
    @Res() res: Response,
  ) {
    const vcfContent = await this.contactGroupsService.generateVcf(grupocontacto);
    const filename = `${grupocontacto}_contactos.vcf`;

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(vcfContent);
  }
}
