import { IsDateString, IsOptional } from 'class-validator';

/**
 * Date range for the analytics summary. Both optional — the service defaults to
 * the last 30 days. ISO date/datetime strings (e.g. `2026-07-01` or a full
 * timestamp).
 */
export class ReportsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
