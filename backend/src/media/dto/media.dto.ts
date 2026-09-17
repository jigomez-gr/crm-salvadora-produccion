import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsUUID, IsEnum } from 'class-validator';
import { MediaType } from '../../common/entities/media-asset.entity';

export class CreateMediaAssetDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(MediaType)
  @IsOptional()
  mediaType?: MediaType;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsString()
  @IsNotEmpty()
  physicalPath: string;

  @IsString()
  @IsOptional()
  publicUrl?: string;

  @IsNumber()
  @IsOptional()
  fileSizeBytes?: number;

  @IsUUID()
  @IsOptional()
  serviceId?: string;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}

export class UpdateMediaAssetDto {
  @IsString()
  @IsOptional()
  key?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsEnum(MediaType)
  @IsOptional()
  mediaType?: MediaType;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsString()
  @IsOptional()
  physicalPath?: string;

  @IsString()
  @IsOptional()
  publicUrl?: string;

  @IsNumber()
  @IsOptional()
  fileSizeBytes?: number;

  @IsUUID()
  @IsOptional()
  serviceId?: string;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}
