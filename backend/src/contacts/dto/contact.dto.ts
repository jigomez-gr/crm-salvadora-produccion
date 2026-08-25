import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ContactStatus } from '../../common/entities/contact.entity';
import { PipelineStage } from '../pipeline';

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(3)
  @MaxLength(40)
  phone: string;

  // Optional, but if a non-empty value is sent it must be a valid email.
  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string>;
}

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  phone?: string;

  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string>;

  // Sales-funnel stage (Kanban). Set when dragging a card between columns; also
  // valid on the contact form. `boardPosition` orders within a column.
  @IsOptional()
  @IsEnum(PipelineStage)
  pipelineStage?: PipelineStage;

  @IsOptional()
  @IsNumber()
  boardPosition?: number;
}

/** CSV import payload — the raw CSV text (frontend reads the file and posts it). */
export class ImportContactsDto {
  @IsString()
  @MaxLength(5_000_000) // ~5 MB of CSV text
  csv: string;
}

/**
 * Reorder/move a pipeline column: the target stage + the column's contact ids in
 * their new top→bottom order. The server renumbers them to integer positions.
 */
export class ReorderBoardDto {
  @IsEnum(PipelineStage)
  stage: PipelineStage;

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  orderedIds: string[];
}

/** Set/clear a contact's opt-out (STOP/BAJA) consent flag. */
export class SetConsentDto {
  @IsBoolean()
  optedOut: boolean;
}
