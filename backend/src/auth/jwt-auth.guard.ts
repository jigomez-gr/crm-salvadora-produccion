import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE, getJwtSecret } from './auth.constants';
import { AuthUser } from './current-user.decorator';
import { isSessionStale } from './session-integrity';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY } from './allow-password-change-pending.decorator';
import { UsersService } from '../users/users.service';
import { UserRole } from '../common/entities/user.entity';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  // Issued-at, in whole seconds (set by the JWT layer). Used to invalidate
  // sessions older than the user's last password change.
  iat?: number;
}

/**
 * Authenticates a request from the JWT in the httpOnly cookie (preferred) or an
 * `Authorization: Bearer <token>` header (handy for API tooling), then validates
 * it against the LIVE user row so a token alone is never enough:
 *
 *  - unknown / deleted user            → 401
 *  - deactivated account               → 401 (no waiting for the token to expire)
 *  - token older than the last password change → 401 (password change / admin
 *    reset logs out every other session)
 *  - pending password change           → 403 PASSWORD_CHANGE_REQUIRED on every
 *    route except those marked @AllowPasswordChangePending()
 *
 * On success it attaches the fresh principal (role/name/email from the DB, so a
 * role change applies immediately) to `req.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('No autenticado');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: getJwtSecret(),
      });
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    // Re-validate against the live user — the JWT is necessary but not sufficient.
    const user = await this.users.getAuthState(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
    if (isSessionStale(payload.iat, user.passwordChangedAt)) {
      throw new UnauthorizedException(
        'Tu sesión ha caducado tras un cambio de contraseña. Vuelve a iniciar sesión.',
      );
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };

    // A user who still owes a password change can reach only the exempted routes.
    if (user.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        ALLOW_PASSWORD_CHANGE_PENDING_KEY,
        [ctx.getHandler(), ctx.getClass()],
      );
      if (!allowed) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Debes cambiar tu contraseña antes de continuar.',
        });
      }
    }

    return true;
  }

  private extractToken(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const fromCookie = cookies?.[ACCESS_TOKEN_COOKIE];
    if (fromCookie) return fromCookie;

    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return undefined;
  }
}
