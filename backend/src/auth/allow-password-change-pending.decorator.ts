import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = 'allowPasswordChangePending';

/**
 * Marks a route as reachable even while the user still owes a password change
 * (`mustChangePassword`). JwtAuthGuard otherwise blocks every endpoint (403
 * `PASSWORD_CHANGE_REQUIRED`) for such a user, so they can do nothing but set a
 * new password. Apply to exactly the routes that flow MUST allow: read the
 * session (`auth/me`), log out, and change the password itself.
 */
export const AllowPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);
