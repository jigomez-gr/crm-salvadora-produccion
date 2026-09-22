import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@Controller('services')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  async findAll(
    @Query('activeOnly') activeOnly?: string,
    @Query('categoryId') categoryId?: string,
    @Query('serviceType') serviceType?: string,
  ) {
    return this.servicesService.findAll(activeOnly === 'true', categoryId, serviceType);
  }

  @Get('managers/list')
  async findManagers() {
    return this.servicesService.findManagers();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Get(':id/prebooked')
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async getPrebooked(@Param('id') id: string) {
    return this.servicesService.getPrebookedAppointments(id);
  }

  @Post(':id/notify-prebooked')
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async notifyPrebooked(
    @Param('id') id: string,
    @Body()
    body: {
      newDate?: string;
      newPrice?: string;
      customNote?: string;
      sendEmail?: boolean;
      sendWhatsapp?: boolean;
      updateStartsAt?: boolean;
    },
    @Req() req: any,
  ) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    return this.servicesService.notifyPrebooked(id, body, actor);
  }

  @Post(':id/duplicate')
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async duplicate(@Param('id') id: string, @Req() req: any) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    return this.servicesService.duplicate(id, actor);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string, @Req() req: any) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    await this.servicesService.remove(id, actor);
    return { success: true };
  }

  @Post('bulk-delete')
  @Roles(UserRole.ADMIN)
  async bulkDelete(@Body() body: { ids: string[] }, @Req() req: any) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    const result = await this.servicesService.removeBulk(body.ids || [], actor);
    return { success: true, ...result };
  }
}