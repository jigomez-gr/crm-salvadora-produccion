import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../common/entities/user.entity';

@Injectable()
export class AdminResetGuard implements CanActivate {
  constructor(
    private readonly jwtGuard: JwtAuthGuard,
    private readonly rolesGuard: RolesGuard,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin1234!';
    const provided = req.headers['x-admin-password'];

    // 1. Direct admin password authentication (from .bat or external CLI script)
    if (provided !== undefined) {
      if (provided === adminPassword) {
        req.user = {
          id: 'system-reset',
          email: 'admin@system.local',
          name: 'Administrador (Script)',
          role: UserRole.ADMIN,
        };
        return true;
      }
      throw new ForbiddenException('Clave incorrecta en cabecera x-admin-password.');
    }

    // 2. Otherwise authenticate via standard session JWT cookie or Bearer token
    const jwtOk = await this.jwtGuard.canActivate(ctx);
    if (!jwtOk) {
      throw new UnauthorizedException('No autenticado');
    }
    return this.rolesGuard.canActivate(ctx);
  }
}
