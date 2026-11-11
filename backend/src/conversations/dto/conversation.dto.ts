import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Operator toggles human handoff (agent auto-reply paused) on a thread. */
export class SetHandoffDto {
  @IsBoolean()
  handoff: boolean;
}

/** Paginated inbox list (newest-active first). */
export class QueryThreadsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  days?: string;

  @IsOptional()
  @IsString()
  readStatus?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  searchField?: string;
}

/** Operator sends a manual reply (WhatsApp or Email) on a thread. */
export class SendManualMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  body?: string;

  @IsOptional()
  @IsString()
  subject?: string;
}

export class ReplyEmailDto {
  @IsString()
  @MinLength(1)
  body: string;

  @IsOptional()
  @IsString()
  subject?: string;
}
