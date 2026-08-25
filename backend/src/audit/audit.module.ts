import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../common/entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Audit trail. Writes arrive via the `AUDIT_EVENT` bus (no producer imports this
 * module), so the only dependency is AuthModule — needed by the read controller
 * for the auth/roles guards (which now resolve UsersService through AuthModule's
 * re-export). AuthModule does NOT import AuditModule, so there's no cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), AuthModule],
  providers: [AuditService],
  controllers: [AuditController],
})
export class AuditModule {}
