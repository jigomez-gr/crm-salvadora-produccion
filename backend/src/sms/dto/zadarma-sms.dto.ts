import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SendSmsDto {
  @IsString()
  @IsNotEmpty()
  number: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  sender?: string;

  @IsUUID()
  @IsOptional()
  contactId?: string;

  @IsUUID()
  @IsOptional()
  callId?: string;

  @IsUUID()
  @IsOptional()
  appointmentId?: string;
}

export class UpdateZadarmaConfigDto {
  @IsString()
  @IsOptional()
  zadarmaApiKey?: string;

  @IsString()
  @IsOptional()
  zadarmaApiSecret?: string;

  @IsString()
  @IsOptional()
  zadarmaSenderId?: string;

  @IsBoolean()
  @IsOptional()
  zadarmaSmsEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  smsAutoConfirmation?: boolean;

  @IsString()
  @IsOptional()
  smsConfirmationTemplate?: string;
}

export class GetSmsLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  phone?: string;
}
