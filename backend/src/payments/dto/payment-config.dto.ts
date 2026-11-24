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
  enabled?: boolean;

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
  enabled: boolean;
  enableBizum: boolean;
  enableCard: boolean;
  webhookUrl: string;
}
