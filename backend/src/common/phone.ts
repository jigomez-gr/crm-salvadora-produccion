import { BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

// Default country used to interpret local-format numbers (e.g. "600 11 22 33").
// Override with BUSINESS_COUNTRY (ISO 3166-1 alpha-2, e.g. "MX", "AR").
const DEFAULT_COUNTRY = (process.env.BUSINESS_COUNTRY || 'ES') as CountryCode;

/**
 * Normalise a phone number to E.164 (e.g. "+34600112233"). Throws a 400 if it
 * isn't a valid number. Use on user-entered input (manual contact create/edit)
 * so the same person never ends up stored under two different formats.
 */
export function normalizePhoneStrict(input: string): string {
  if (!input) {
    throw new BadRequestException('El teléfono no puede estar vacío.');
  }
  let trimmed = input.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  // Spanish 9-digit mobile/landline without country code
  if (digitsOnly.length === 9 && /^[6789]/.test(digitsOnly)) {
    trimmed = `+34${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('34')) {
    trimmed = `+${digitsOnly}`;
  }

  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY);
  if (!parsed || !parsed.isValid()) {
    // If it is 9 digits, accept +34
    if (digitsOnly.length === 9) {
      return `+34${digitsOnly}`;
    }
    throw new BadRequestException(
      'El teléfono no es válido. Usa formato internacional, por ejemplo +34600112233.',
    );
  }
  return parsed.number; // E.164
}

/**
 * Best-effort normalisation that NEVER throws — for hot paths we must not break
 * (inbound WhatsApp, widget chat). Returns E.164 when parseable, otherwise auto-prefixed with +34.
 */
export function normalizePhoneLoose(input: string): string {
  if (!input) return '';
  let trimmed = input.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  // Spanish 9-digit mobile/landline without country code
  if (digitsOnly.length === 9 && /^[6789]/.test(digitsOnly)) {
    return `+34${digitsOnly}`;
  }
  // Spanish 11-digit starting with 34 without +
  if (digitsOnly.length === 11 && digitsOnly.startsWith('34')) {
    return `+${digitsOnly}`;
  }

  try {
    const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY);
    if (parsed && parsed.isValid()) return parsed.number;
  } catch {
    // fall through
  }

  if (digitsOnly.length === 9) return `+34${digitsOnly}`;
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}
