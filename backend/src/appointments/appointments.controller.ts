import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UploadPatientAttachmentDto,
  RunAiAnalysisDto,
  RejectAppointmentDto,
} from './dto/appointment.dto';
import { AppointmentStatus } from '../common/entities/appointment.entity';
import { UserRole } from '../common/entities/user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('serviceId') serviceId?: string,
    @Query('calendarId') calendarId?: string,
    @Query('status') status?: AppointmentStatus,
  ) {
    const managerId = user.role === UserRole.SERVICE_MANAGER ? user.id : undefined;
    return this.appointmentsService.findAll(from, to, {
      serviceId,
      calendarId,
      status,
      managerId,
    });
  }

  // Static routes MUST be declared before the `:id` param route.
  @Get('today')
  findToday(@CurrentUser() user: AuthUser) {
    const managerId = user.role === UserRole.SERVICE_MANAGER ? user.id : undefined;
    return this.appointmentsService.findToday(undefined, managerId);
  }

  @Get('pending')
  findPending(@CurrentUser() user: AuthUser) {
    const managerId = user.role === UserRole.SERVICE_MANAGER ? user.id : undefined;
    return this.appointmentsService.findAll(undefined, undefined, {
      status: AppointmentStatus.PENDING_APPROVAL,
      managerId,
    });
  }

  @Post('analyze-ai')
  async analyzeAiStandalone(@Body() dto: RunAiAnalysisDto) {
    return this.appointmentsService.analyzeImageStandalone(dto);
  }

  @Post(':id/analyze-ai')
  async analyzeAiForAppointment(
    @Param('id') id: string,
    @Body() dto: RunAiAnalysisDto,
  ) {
    return this.appointmentsService.runAiAnalysisOnAppointment(id, dto);
  }

  @Get(':id/ai-cropped-image')
  async getAiCroppedImage(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.appointmentsService.getAiCroppedImage(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  @Post(':id/accept')
  async accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.appointmentsService.accept(id, user.name || user.email || user.id);
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto?: RejectAppointmentDto,
  ) {
    return this.appointmentsService.reject(
      id,
      user.name || user.email || user.id,
      dto?.reason,
      dto?.requestReschedule,
      dto?.proposedTimes,
    );
  }

  @Post(':id/response-document')
  async saveResponseDocument(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() docData: {
      templateKey: string;
      title: string;
      symptoms?: string;
      diagnosis?: string;
      treatment?: string;
      recommendations?: string;
      notes?: string;
      customFields?: Record<string, string>;
      markCompleted?: boolean;
      acceptAndSave?: boolean;
    },
  ) {
    const signer = user.name || user.email || 'Responsable';
    return this.appointmentsService.saveResponseDocument(id, docData, signer);
  }

  @Get(':id/doctor-report/pdf')
  async viewDoctorReportPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename, mimeType } = await this.appointmentsService.getDoctorReportPdf(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get(':id/doctor-report/download')
  async downloadDoctorReportPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename, mimeType } = await this.appointmentsService.getDoctorReportPdf(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Post(':id/patient-attachment')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadPatientAttachment(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body() base64Dto?: UploadPatientAttachmentDto,
  ) {
    if (file) {
      return this.appointmentsService.savePatientAttachment(id, {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });
    }

    if (base64Dto?.base64Data && base64Dto?.fileName) {
      const cleanBase64 = base64Dto.base64Data.replace(/^data:.*,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      return this.appointmentsService.savePatientAttachment(id, {
        buffer,
        originalname: base64Dto.fileName,
        mimetype: base64Dto.mimeType || 'application/octet-stream',
        size: buffer.length,
      });
    }

    throw new BadRequestException('No se ha proporcionado ningún archivo para adjuntar.');
  }

  @Get(':id/patient-attachment/view')
  async viewPatientAttachment(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename, mimeType } = await this.appointmentsService.getPatientAttachment(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get(':id/patient-attachment/download')
  async downloadPatientAttachment(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename, mimeType } = await this.appointmentsService.getPatientAttachment(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Delete(':id/patient-attachment')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePatientAttachment(@Param('id') id: string) {
    await this.appointmentsService.deletePatientAttachment(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointmentsService.update(id, dto);
  }

  // DELETE = logical cancellation (preserves history), not a hard delete.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.appointmentsService.cancel(id, user.id);
  }
}
