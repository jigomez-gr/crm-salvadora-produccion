import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { EventEditionStatus } from '../../common/entities/event-edition.entity';

export class CreateEventEditionDto {
  @IsUUID()
  serviceId: string;

  @IsString()
  title: string;

  @IsBoolean()
  @IsOptional()
  isDateDefinite?: boolean;

  @IsString()
  @IsOptional()
  tentativeDateText?: string;

  @IsString()
  @IsOptional()
  startsAt?: string;

  @IsString()
  @IsOptional()
  endsAt?: string;

  @IsBoolean()
  @IsOptional()
  isPriceDefinite?: boolean;

  @IsString()
  @IsOptional()
  tentativePriceText?: string;

  @IsNumberString()
  @IsOptional()
  price?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  minParticipants?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxCapacity?: number;

  @IsString()
  @IsOptional()
  quorumDeadline?: string;

  @IsString()
  @IsOptional()
  conditionsText?: string;

  @IsEnum(EventEditionStatus)
  @IsOptional()
  status?: EventEditionStatus;

  @IsString()
  @IsOptional()
  flyerParticularUrl?: string;

  @IsString()
  @IsOptional()
  videoParticularUrl?: string;
}

export class UpdateEventEditionDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsBoolean()
  @IsOptional()
  isDateDefinite?: boolean;

  @IsString()
  @IsOptional()
  tentativeDateText?: string;

  @IsString()
  @IsOptional()
  startsAt?: string;

  @IsString()
  @IsOptional()
  endsAt?: string;

  @IsBoolean()
  @IsOptional()
  isPriceDefinite?: boolean;

  @IsString()
  @IsOptional()
  tentativePriceText?: string;

  @IsNumberString()
  @IsOptional()
  price?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  minParticipants?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxCapacity?: number;

  @IsString()
  @IsOptional()
  quorumDeadline?: string;

  @IsString()
  @IsOptional()
  conditionsText?: string;

  @IsEnum(EventEditionStatus)
  @IsOptional()
  status?: EventEditionStatus;

  @IsString()
  @IsOptional()
  flyerParticularUrl?: string;

  @IsString()
  @IsOptional()
  videoParticularUrl?: string;
}

export class ConfirmEventEditionDto {
  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;

  @IsOptional()
  @IsNumberString()
  price?: string;

  @IsOptional()
  @IsString()
  customMessage?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  sendWhatsapp?: boolean;
}

export class CancelEventEditionDto {
  @IsOptional()
  @IsString()
  cancellationReason?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  sendWhatsapp?: boolean;
}
