import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
} from 'class-validator';
import {
  IdentityChangeType,
  VerificationChannel,
} from '../entities/contact-identity-change.entity';

export class RequestVerificationDto {
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsNotEmpty()
  @IsString()
  destination: string;

  @IsNotEmpty()
  @IsEnum(['email', 'sms', 'whatsapp'])
  channel: VerificationChannel;

  @IsOptional()
  @IsString()
  changeType?: IdentityChangeType;

  @IsOptional()
  name?: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  email?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class ConfirmVerificationDto {
  @IsNotEmpty()
  @IsString()
  destination: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  code: string;
}

export class CheckContradictionDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
