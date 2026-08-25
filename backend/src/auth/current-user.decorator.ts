import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../common/entities/user.entity';

// The authenticated principal attached to the request by JwtAuthGuard.
// Resolved from the LIVE user row on every request (not just the JWT claims),
// so role changes, deactivation and a pending password change take effect at
// once rather than waiting for the token to expire.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
}

/**
 * Injects the authenticated user into a handler param.
 * Example: `me(@CurrentUser() user: AuthUser) { ... }`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
