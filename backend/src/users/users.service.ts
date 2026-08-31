import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { SafeUser, User, UserRole } from '../common/entities/user.entity';
import { DEFAULT_ADMIN_PASSWORD } from '../common/env';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

/**
 * Minimal live-user projection that JwtAuthGuard checks on every request — just
 * the fields needed to decide whether a still-valid token may proceed.
 */
export interface AuthState {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
}

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Strong-password policy, shared as the single source of truth for the rules.
 * Returns the list of UNMET requirements (empty = the password is valid). The
 * frontend mirrors these same checks for instant feedback; the backend is the
 * authority that actually enforces them.
 */
export function passwordPolicyIssues(password: string | undefined): string[] {
  const pw = password ?? '';
  const issues: string[] = [];
  if (pw.length < MIN_PASSWORD_LENGTH)
    issues.push(`al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  if (!/[a-z]/.test(pw)) issues.push('una letra minúscula');
  if (!/[A-Z]/.test(pw)) issues.push('una letra mayúscula');
  if (!/[0-9]/.test(pw)) issues.push('un número');
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('un carácter especial (p. ej. ! @ # $ %)');
  return issues;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  /** Create the first admin on an empty users table so the app is reachable. */
  async onModuleInit(): Promise<void> {
    await this.bootstrapAdmin();
  }

  private async bootstrapAdmin(): Promise<void> {
    const count = await this.usersRepo.count();
    if (count > 0) return;

    const email = (process.env.ADMIN_EMAIL || 'admin@crmsalvadora.local')
      .trim()
      .toLowerCase();
    const password = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
    const usingDefaultPassword = !process.env.ADMIN_PASSWORD;

    // Never create a public-default-credential admin on a production deployment.
    // Abort boot with a clear message instead of exposing admin@crmsalvadora.local
    // / Admin1234! on the internet.
    if (usingDefaultPassword && process.env.NODE_ENV === 'production') {
      throw new Error(
        'No se puede crear el administrador inicial con la contraseña por defecto en producción. ' +
          'Define ADMIN_PASSWORD (una contraseña robusta) y vuelve a desplegar.',
      );
    }

    const admin = this.usersRepo.create({
      name: 'Administrador',
      email,
      passwordHash: await this.hash(password),
      role: UserRole.ADMIN,
      isActive: true,
      // If we fell back to the public default password, force a change at first
      // login so a real deployment never keeps running on "Admin1234!".
      mustChangePassword: usingDefaultPassword,
    });
    await this.usersRepo.save(admin);

    this.logger.warn(`Bootstrapped initial admin user: ${email}`);
    if (usingDefaultPassword) {
      this.logger.warn(
        '⚠ Initial admin uses the DEFAULT password "Admin1234!" — change it immediately (set ADMIN_PASSWORD before first run, or update it from the Users screen).',
      );
    }
  }

  async createInitialAdmin(email: string, password: string): Promise<User> {
    const admin = this.usersRepo.create({
      name: 'Administrador',
      email: email.trim().toLowerCase(),
      passwordHash: await this.hash(password),
      role: UserRole.ADMIN,
      isActive: true,
      mustChangePassword: false,
    });
    return this.usersRepo.save(admin);
  }

  // ─── Queries ───

  async findAll(): Promise<SafeUser[]> {
    const users = await this.usersRepo.find({ order: { createdAt: 'DESC' } });
    return users.map((u) => this.sanitize(u));
  }

  async findOne(id: string): Promise<SafeUser> {
    return this.sanitize(await this.getOrThrow(id));
  }

  /** Internal: full entity incl. passwordHash. Used only by AuthService. */
  findByEmailWithSecret(email: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  /**
   * Live security state for the auth guard — fetched on every authenticated
   * request. Deliberately selects only the columns the guard needs (never the
   * password hash). Returns null for a deleted user.
   */
  getAuthState(id: string): Promise<AuthState | null> {
    return this.usersRepo.findOne({
      where: { id },
      select: [
        'id',
        'name',
        'email',
        'role',
        'isActive',
        'mustChangePassword',
        'passwordChangedAt',
      ],
    });
  }

  count(): Promise<number> {
    return this.usersRepo.count();
  }

  // ─── Mutations ───

  async create(dto: CreateUserDto): Promise<SafeUser> {
    const name = (dto.name || '').trim();
    const email = (dto.email || '').trim().toLowerCase();
    const role = dto.role ?? UserRole.EMPLOYEE;

    if (!name) throw new BadRequestException('El nombre es obligatorio.');
    this.assertValidEmail(email);
    this.assertValidPassword(dto.password);
    this.assertValidRole(role);

    if (await this.usersRepo.findOne({ where: { email } })) {
      throw new ConflictException('Ya existe un usuario con ese correo.');
    }

    const user = this.usersRepo.create({
      name,
      email,
      passwordHash: await this.hash(dto.password),
      role,
      isActive: true,
      // The admin-typed password is a temporary handoff secret — force the new
      // user to choose their own at first login.
      mustChangePassword: true,
    });
    return this.sanitize(await this.usersRepo.save(user));
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actingUserId?: string,
  ): Promise<SafeUser> {
    const user = await this.getOrThrow(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('El nombre no puede estar vacío.');
      user.name = name;
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      this.assertValidEmail(email);
      if (email !== user.email) {
        const clash = await this.usersRepo.findOne({ where: { email } });
        if (clash) {
          throw new ConflictException('Ya existe un usuario con ese correo.');
        }
        user.email = email;
      }
    }

    if (dto.role !== undefined && dto.role !== user.role) {
      this.assertValidRole(dto.role);
      // Demoting the last remaining admin would lock everyone out of user mgmt.
      if (user.role === UserRole.ADMIN && dto.role !== UserRole.ADMIN) {
        await this.assertNotLastActiveAdmin(user, 'cambiar el rol del');
      }
      user.role = dto.role;
    }

    if (dto.isActive !== undefined && dto.isActive !== user.isActive) {
      if (!dto.isActive && user.role === UserRole.ADMIN) {
        await this.assertNotLastActiveAdmin(user, 'desactivar al');
      }
      user.isActive = dto.isActive;
    }

    if (dto.password !== undefined && dto.password !== '') {
      this.assertValidPassword(dto.password);
      user.passwordHash = await this.hash(dto.password);
      // Changing the password invalidates the target's other sessions.
      user.passwordChangedAt = new Date();
      // An admin resetting SOMEONE ELSE'S password is handing out a temporary
      // one → force them to pick their own at next login. An admin editing their
      // OWN row is making a deliberate change, so don't nag themselves.
      user.mustChangePassword = id !== actingUserId;
    }

    return this.sanitize(await this.usersRepo.save(user));
  }

  /**
   * Self-service password change: verifies the CURRENT password, enforces the
   * strength policy, stamps `passwordChangedAt` (invalidating other sessions)
   * and clears any pending-change flag. The caller (AuthService) re-issues the
   * cookie so the acting session stays alive.
   */
  async changeOwnPassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<SafeUser> {
    const user = await this.getOrThrow(id);

    const currentOk = await bcrypt.compare(
      currentPassword || '',
      user.passwordHash,
    );
    if (!currentOk) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }

    this.assertValidPassword(newPassword);

    const sameAsCurrent = await bcrypt.compare(
      newPassword || '',
      user.passwordHash,
    );
    if (sameAsCurrent) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta de la actual.',
      );
    }

    user.passwordHash = await this.hash(newPassword);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    return this.sanitize(await this.usersRepo.save(user));
  }

  /** Returns the removed user's email so the caller can audit the deletion. */
  async remove(id: string, currentUserId: string): Promise<{ email: string }> {
    const user = await this.getOrThrow(id);

    if (user.id === currentUserId) {
      throw new ConflictException('No puedes eliminar tu propia cuenta.');
    }
    if (user.role === UserRole.ADMIN) {
      await this.assertNotLastActiveAdmin(user, 'eliminar al');
    }
    const { email } = user;
    await this.usersRepo.remove(user);
    return { email };
  }

  // ─── Helpers ───

  private async getOrThrow(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  private hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /** Block an operation that would leave the system with zero active admins. */
  private async assertNotLastActiveAdmin(
    target: User,
    action: string,
  ): Promise<void> {
    const otherActiveAdmins = await this.usersRepo.count({
      where: { role: UserRole.ADMIN, isActive: true, id: Not(target.id) },
    });
    if (otherActiveAdmins === 0) {
      throw new ConflictException(
        `No puedes ${action} único administrador activo. Crea o activa otro administrador primero.`,
      );
    }
  }

  private assertValidEmail(email: string): void {
    if (!EMAIL_RE.test(email)) {
      throw new BadRequestException('El correo no tiene un formato válido.');
    }
  }

  private assertValidPassword(password: string | undefined): void {
    const issues = passwordPolicyIssues(password);
    if (issues.length > 0) {
      throw new BadRequestException(
        `La contraseña debe contener ${issues.join(', ')}.`,
      );
    }
  }

  private assertValidRole(role: UserRole): void {
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException('Rol no válido.');
    }
  }

  private sanitize(user: User): SafeUser {
    // Strip passwordHash (a secret) and passwordChangedAt (an internal
    // session-integrity timestamp) — neither must leave the server.
    const { passwordHash: _pw, passwordChangedAt: _pca, ...safe } = user;
    return safe;
  }
}
