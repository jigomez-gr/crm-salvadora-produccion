import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// "HH:MM" 24h time.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ServiceItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsInt()
  @Min(5)
  @Max(43200)
  durationMinutes: number;
}

export class WorkingHourItemDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day: number; // 0=Sunday … 6=Saturday

  @Matches(TIME_RE, { message: 'open debe tener formato HH:MM' })
  open: string;

  @Matches(TIME_RE, { message: 'close debe tener formato HH:MM' })
  close: string;
}

export class CreateAgentConfigDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  businessName: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  businessDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;
}

export class UpdateAgentConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  businessDescription?: string;

  // The owner's free-text behaviour prompt (how the agent should act). Layered on
  // top of the internal hardened prompt as a subordinate section.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  customInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  channel?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ServiceItemDto)
  services?: ServiceItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WorkingHourItemDto)
  workingHours?: WorkingHourItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  // Secrets — write-only. Empty/undefined means "leave unchanged" (handled in
  // AgentsConfigService.update).
  @IsOptional()
  @IsString()
  @MaxLength(400)
  openrouterApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  ycloudApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  ycloudWebhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  // ─── Appointment reminders ───
  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reminderTemplateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  reminderTemplateLanguage?: string;
}
