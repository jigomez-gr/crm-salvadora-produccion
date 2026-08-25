import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../common/entities/user.entity';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or controller) to the given roles. Enforced by RolesGuard.
 * Example: `@Roles(UserRole.ADMIN)` on the users controller.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
