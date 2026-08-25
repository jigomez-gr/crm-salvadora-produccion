import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * System users who can log into the admin app.
 * - ADMIN: full access, including user management.
 * - EMPLOYEE: full access to the CRM/agents, but NOT user management.
 */
export enum UserRole {
  ADMIN = 'admin',
  SERVICE_MANAGER = 'service_manager',
  EMPLOYEE = 'employee',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // Stored lowercase; unique. Used as the login identifier.
  @Column({ unique: true })
  email: string;

  // bcrypt hash — NEVER returned to clients (see UsersService.sanitize).
  @Column()
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.EMPLOYEE })
  role: UserRole;

  // Disabled accounts cannot log in (soft alternative to deletion).
  @Column({ default: true })
  isActive: boolean;

  // Forces a password change before the user can do anything else: set when an
  // admin resets someone's password (a temporary one) and when the initial admin
  // is bootstrapped on the public default password. Cleared once they choose a
  // new one. Enforced server-side by JwtAuthGuard, not just the UI.
  @Column({ default: false })
  mustChangePassword: boolean;

  // When the password last changed. Any session token issued BEFORE this instant
  // is treated as stale (JwtAuthGuard rejects it), so changing/resetting a
  // password logs out every other session. Null until the first change.
  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// Shape returned by the API — never includes passwordHash (nor the
// internal passwordChangedAt timestamp).
export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}
