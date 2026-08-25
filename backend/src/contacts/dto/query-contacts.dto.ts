import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ContactStatus } from '../../common/entities/contact.entity';

/**
 * Query for the paginated contacts list. Mirrors the audit pattern: limit/offset
 * (defaults applied in the controller, capped at 200) plus server-side filters
 * so paging and searching coexist — the frontend no longer fetches everything.
 */
export class QueryContactsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  // Free-text search across name / phone / email / tags (case-insensitive).
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;
}
