import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Read-only business analytics. Guarded but NOT admin-only — it's aggregate,
 * non-PII business data (unlike the audit trail), useful to any operator.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(@Query() query: ReportsQueryDto) {
    return this.reports.summary(query.from, query.to);
  }
}
