import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateCalcomConfigDto {
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  defaultEventTypeId?: string;
}

export class CalcomConfigResponseDto {
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  baseUrl: string;
  enabled: boolean;
  defaultEventTypeId: string | null;
}
