import { Logger } from '@nestjs/common';
import { isPagosOnlineEnabled } from './payment-config';

const logger = new Logger('Env');

// The public default bootstrap password.
export const DEFAULT_ADMIN_PASSWORD = 'Admin1234!';

/**
 * Validate and populate critical environment variables at startup.
 */
export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const warnings: string[] = [];

  // 1. Fallback for JWT_SECRET
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16) {
    process.env.JWT_SECRET = 'super-secret-crm-key-39xlps9-jwt-token-2026';
    warnings.push('JWT_SECRET usando clave por defecto segura');
  }

  // 2. Fallback for CORS_ORIGIN
  if (!process.env.CORS_ORIGIN || !process.env.CORS_ORIGIN.trim()) {
    process.env.CORS_ORIGIN = 'https://crm-salvadoraconesa.jigretera.com,http://localhost:3000';
    warnings.push('CORS_ORIGIN no definida — asignado fallback automático');
  }

  // 3. Fallback for DATABASE_URL
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
    process.env.DATABASE_URL = 'postgresql://postgres:W39xlpS9@192.168.1.17:5433/crm_salvadora';
    warnings.push('DATABASE_URL no definida — asignado DGX SPARC fallback');
  }

  // 4. Admin password check
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
    warnings.push(
      `ADMIN_PASSWORD usa el valor por defecto "${DEFAULT_ADMIN_PASSWORD}" — se requerirá cambio de contraseña en el primer inicio de sesión`,
    );
  }

  // 5. Online payments configuration (PAGOSONLINE: 'S' | 'N')
  if (!isPagosOnlineEnabled()) {
    logger.log('PAGOSONLINE=N: Enlaces de pago online desactivados. El agente comunicará: "El pago se realiza en el centro."');
  } else {
    logger.log('PAGOSONLINE=S: Pagos online habilitados (Stripe Checkout).');
  }

  if (warnings.length > 0) {
    logger.warn(`Configuración de arranque: ${warnings.join('; ')}.`);
  }
}
