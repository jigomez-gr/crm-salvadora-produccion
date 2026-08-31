import { Logger } from '@nestjs/common';

const logger = new Logger('Env');

// The public default bootstrap password. Never acceptable in production.
export const DEFAULT_ADMIN_PASSWORD = 'Admin1234!';

/**
 * Validate critical environment variables at startup.
 *
 * In **production** (`NODE_ENV=production`) we FAIL FAST — throw and abort boot —
 * rather than silently falling back to insecure localhost defaults. A
 * misconfigured production deployment must never come up half-broken or wide
 * open (e.g. CORS pointing at localhost, or signing JWTs with a known dev key).
 *
 * In **development** we only warn, so a non-technical user can `pnpm start:dev`
 * with zero configuration.
 */
export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  const requireVar = (name: string, opts?: { minLength?: number }) => {
    const value = process.env[name];
    if (!value || !value.trim()) {
      (isProd ? errors : warnings).push(`${name} no está definida`);
      return;
    }
    if (opts?.minLength && value.trim().length < opts.minLength) {
      (isProd ? errors : warnings).push(
        `${name} es demasiado corta (mínimo ${opts.minLength} caracteres)`,
      );
    }
  };

  // Secrets / URLs that must never silently fall back to localhost in production.
  requireVar('DATABASE_URL');
  requireVar('JWT_SECRET', { minLength: 16 });
  requireVar('CORS_ORIGIN');

  // The bootstrap admin: if using default password, warn and force change on login.
  if (isProd && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD)) {
    warnings.push(
      `ADMIN_PASSWORD usa el valor por defecto público "${DEFAULT_ADMIN_PASSWORD}" — se requerirá cambio al iniciar sesión`,
    );
  }

  if (warnings.length > 0) {
    logger.warn(
      `Variables de entorno usando valores por defecto (aceptable solo en desarrollo): ${warnings.join(
        '; ',
      )}.`,
    );
  }
  if (errors.length > 0) {
    throw new Error(
      'Configuración de producción inválida — arranque abortado:\n' +
        errors.map((e) => `  • ${e}`).join('\n') +
        '\nRevisa .env.production.example y define estas variables antes de desplegar.',
    );
  }
}
