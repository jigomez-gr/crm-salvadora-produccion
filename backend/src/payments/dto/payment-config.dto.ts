import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePaymentConfigDto {
  @IsOptional()
  @IsString()
  publishableKey?: string;

  @IsOptional()
  @IsString()
  secretKey?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  enableBizum?: boolean;

  @IsOptional()
  @IsBoolean()
  enableCard?: boolean;
}

export interface SanitizedPaymentConfig {
  hasPublishableKey: boolean;
  publishableKey: string | null;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  currency: string;
  enableBizum: boolean;
  enableCard: boolean;
  webhookUrl: string;
}
