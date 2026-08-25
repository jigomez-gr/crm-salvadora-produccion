import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePaymentLinkDto {
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsNumber()
  @Min(0.5)
  amount: number;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerName?: string;
}
