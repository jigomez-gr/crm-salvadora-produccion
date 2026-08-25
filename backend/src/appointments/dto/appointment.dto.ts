import {
  IsEnum,
  IsISO8601,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AppointmentStatus } from '../../common/entities/appointment.entity';

export class CreateAppointmentDto {
  @IsUUID()
  contactId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  service: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsString()
  calendarId?: string;

  @IsISO8601()
  startsAt: string;

  @IsISO8601()
  endsAt: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsString()
  modality?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  responseDocument?: Record<string, any>;

  // Optional list price (for revenue reporting). Stored as numeric → carried as a
  // string; `class-validator` keeps it a decimal string ("45" / "45.50").
  @IsOptional()
  @IsNumberString()
  price?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  service?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsString()
  calendarId?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsString()
  modality?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  calMeetingUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  responseDocument?: Record<string, any>;

  // Optional list price. `null` clears a stored price; omit to leave it unchanged.
  @IsOptional()
  @IsNumberString()
  price?: string | null;
}

export class UploadPatientAttachmentDto {
  @IsString()
  fileName: string;

  @IsString()
  mimeType: string;

  @IsString()
  base64Data: string;
}

export class RunAiAnalysisDto {
  @IsString()
  modality: string;

  @IsString()
  imageBase64: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  patientName?: string;
}
