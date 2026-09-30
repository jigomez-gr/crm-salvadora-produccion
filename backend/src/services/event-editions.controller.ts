import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EventEditionsService } from './event-editions.service';
import {
  CreateEventEditionDto,
  UpdateEventEditionDto,
  ConfirmEventEditionDto,
  CancelEventEditionDto,
} from './dto/event-edition.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventEditionsController {
  constructor(private readonly editionsService: EventEditionsService) {}

  @Get('services/:serviceId/editions')
  async findByService(@Param('serviceId') serviceId: string) {
    return this.editionsService.findByService(serviceId);
  }

  @Get('event-editions/:id')
  async findOne(@Param('id') id: string) {
    return this.editionsService.findOne(id);
  }

  @Post('services/:serviceId/editions')
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async create(
    @Param('serviceId') serviceId: string,
    @Body() dto: CreateEventEditionDto,
    @Req() req: any,
  ) {
    dto.serviceId = serviceId;
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    return this.editionsService.create(dto, actor);
  }

  @Patch('event-editions/:id')
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEventEditionDto,
    @Req() req: any,
  ) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    return this.editionsService.update(id, dto, actor);
  }

  @Post('event-editions/:id/confirm')
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmEventEditionDto,
    @Req() req: any,
  ) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    return this.editionsService.confirmEdition(id, dto, actor);
  }

  @Post('event-editions/:id/cancel')
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelEventEditionDto,
    @Req() req: any,
  ) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    return this.editionsService.cancelEdition(id, dto, actor);
  }

  @Delete('event-editions/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: any) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    await this.editionsService.remove(id, actor);
  }
}
