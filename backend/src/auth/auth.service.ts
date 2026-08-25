import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { SafeUser, User } from '../common/entities/user.entity';

// A fixed bcrypt hash (cost 10) of a throwaway string. When the email is unknown
// we still run one bcrypt.compare against this so an unknown email takes the same
// time as a wrong password for an existing one — closing the login-enumeration
// timing side-channel. It matches no password, so the branch below still fails.
const DUMMY_PASSWORD_HASH =
  '$2b$10$rUggVuML6NrRktgDWhO8U.33vdJLO6bgF3sJDjTLGpeoW7ao9EFCC';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Verify credentials and issue a JWT. Uses a single generic error for every
   * failure mode (unknown email, wrong password, disabled account) so the
   * endpoint never reveals which emails exist.
   */
  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; user: SafeUser }> {
    const user = await this.users.findByEmailWithSecret(
      (email || '').trim().toLowerCase(),
    );

    // Always run exactly one bcrypt.compare — against the real hash if the user
    // exists, otherwise against a fixed dummy — so response time never reveals
    // whether the account exists (uniform timing, not just a uniform message).
    const passwordOk = await bcrypt.compare(
      password || '',
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !user.isActive || !passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.issueSession(user);
  }

  /**
   * Self-service password change. Verifies the current password and applies the
   * strength policy (in UsersService), then RE-ISSUES the session token so the
   * acting session stays alive while every other session (older `iat`) is
   * invalidated by the new `passwordChangedAt`.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ token: string; user: SafeUser }> {
    const safe = await this.users.changeOwnPassword(
      userId,
      currentPassword,
      newPassword,
    );
    const token = await this.jwt.signAsync({
      sub: safe.id,
      email: safe.email,
      name: safe.name,
      role: safe.role,
    });
    return { token, user: safe };
  }

  private async issueSession(
    user: User,
  ): Promise<{ token: string; user: SafeUser }> {
    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    // Strip the password hash AND the internal passwordChangedAt timestamp.
    const { passwordHash: _pw, passwordChangedAt: _pca, ...safe } = user;
    return { token, user: safe };
  }
}
