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
  Res,
  Headers,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ServicesService } from './services.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query('activeOnly') activeOnly?: string,
    @Query('categoryId') categoryId?: string,
    @Query('serviceType') serviceType?: string,
  ) {
    return this.servicesService.findAll(activeOnly === 'true', categoryId, serviceType);
  }

  @Get('managers/list')
  @UseGuards(JwtAuthGuard)
  async findManagers() {
    return this.servicesService.findManagers();
  }

  /**
   * Public streaming of service media assets (flyers, mp4 videos).
   * Supports HTTP 206 Partial Content (Range header) for smooth HTML5 video scrubbing.
   */
  @Get(':id/media/:slot')
  async streamMedia(
    @Param('id') id: string,
    @Param('slot') slot: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    return this.servicesService.streamServiceMedia(id, slot, range, res);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Get(':id/prebooked')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async getPrebooked(@Param('id') id: string) {
    return this.servicesService.getPrebookedAppointments(id);
  }

  @Post(':id/notify-prebooked')
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async duplicate(@Param('id') id: string, @Req() req: any) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    return this.servicesService.duplicate(id, actor);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }

  /**
   * Upload or replace media asset for a service.
   * Supports multipart/form-data with 100MB limit for videos and images, or base64 JSON payload fallback.
   */
  @Post(':id/media/:slot')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 500 * 1024 * 1024 }, // Up to 500MB
    }),
  )
  async uploadMedia(
    @Param('id') id: string,
    @Param('slot') slot: string,
    @UploadedFile() file?: any,
    @Body() body?: { filename?: string; contentBase64?: string },
  ) {
    if (file) {
      return this.servicesService.saveServiceMedia(id, slot, file);
    }
    if (body?.contentBase64) {
      const base64Data = body.contentBase64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      return this.servicesService.saveServiceMedia(id, slot, {
        originalname: body.filename || `${slot}.bin`,
        buffer,
      });
    }
    throw new BadRequestException('Debe proporcionar un archivo multipart (campo "file") o un payload base64');
  }

  /**
   * Delete media asset from service and disk
   */
  @Delete(':id/media/:slot')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  async deleteMedia(
    @Param('id') id: string,
    @Param('slot') slot: string,
  ) {
    return this.servicesService.removeServiceMedia(id, slot);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string, @Req() req: any) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    await this.servicesService.remove(id, actor);
    return { success: true };
  }

  @Post('bulk-delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async bulkDelete(@Body() body: { ids: string[] }, @Req() req: any) {
    const actor = req.user ? { id: req.user.id, email: req.user.email } : undefined;
    const result = await this.servicesService.removeBulk(body.ids || [], actor);
    return { success: true, ...result };
  }
}
