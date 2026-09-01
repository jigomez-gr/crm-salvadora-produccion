import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsBoolean, IsUUID } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(5)
  @IsOptional()
  durationMinutes?: number;

  @IsString()
  @IsOptional()
  price?: string;

  @IsString()
  @IsOptional()
  calendarId?: string;

  @IsUUID()
  @IsOptional()
  managerId?: string;

  @IsString()
  @IsOptional()
  serviceType?: string;

  @IsString()
  @IsOptional()
  eventDatesText?: string;

  @IsString()
  @IsOptional()
  scheduleText?: string;

  @IsString()
  @IsOptional()
  flyerUrl?: string;

  @IsString()
  @IsOptional()
  eventStartDate?: string;

  @IsString()
  @IsOptional()
  eventEndDate?: string;

  @IsNumber()
  @IsOptional()
  maxCapacity?: number;

  @IsNumber()
  @IsOptional()
  minQuorum?: number;

  @IsString()
  @IsOptional()
  quorumDeadline?: string;

  @IsString()
  @IsOptional()
  paymentType?: string;

  @IsString()
  @IsOptional()
  externalPaymentUrl?: string;

  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean;

  @IsOptional()
  allowedModalities?: string[];

  @IsBoolean()
  @IsOptional()
  requiresReason?: boolean;

  @IsNumber()
  @IsOptional()
  calEventTypeId?: number;

  @IsString()
  @IsOptional()
  reminderNotes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateServiceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  serviceType?: string;

  @IsString()
  @IsOptional()
  eventDatesText?: string;

  @IsString()
  @IsOptional()
  scheduleText?: string;

  @IsString()
  @IsOptional()
  flyerUrl?: string;

  @IsString()
  @IsOptional()
  eventStartDate?: string;

  @IsString()
  @IsOptional()
  eventEndDate?: string;

  @IsNumber()
  @IsOptional()
  maxCapacity?: number;

  @IsNumber()
  @IsOptional()
  minQuorum?: number;

  @IsString()
  @IsOptional()
  quorumDeadline?: string;

  @IsNumber()
  @Min(5)
  @IsOptional()
  durationMinutes?: number;

  @IsString()
  @IsOptional()
  price?: string;

  @IsString()
  @IsOptional()
  paymentType?: string;

  @IsString()
  @IsOptional()
  externalPaymentUrl?: string;

  @IsString()
  @IsOptional()
  calendarId?: string;

  @IsUUID()
  @IsOptional()
  managerId?: string;

  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean;

  @IsOptional()
  allowedModalities?: string[];

  @IsBoolean()
  @IsOptional()
  requiresReason?: boolean;

  @IsNumber()
  @IsOptional()
  calEventTypeId?: number;

  @IsString()
  @IsOptional()
  reminderNotes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}