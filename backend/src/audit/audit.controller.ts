import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Read-only audit trail — ADMIN only (same double guard as user management).
 * Paginated, newest first, optionally filtered by action / actor.
 */
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: QueryAuditDto) {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = query.offset ?? 0;
    return this.audit.list({
      limit,
      offset,
      action: query.action,
      actorId: query.actorId,
    });
  }
}
