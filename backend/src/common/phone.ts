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
  const parsed = parsePhoneNumberFromString(
    (input || '').trim(),
    DEFAULT_COUNTRY,
  );
  if (!parsed || !parsed.isValid()) {
    throw new BadRequestException(
      'El teléfono no es válido. Usa formato internacional, por ejemplo +34600112233.',
    );
  }
  return parsed.number; // E.164
}

/**
 * Best-effort normalisation that NEVER throws — for hot paths we must not break
 * (inbound WhatsApp). Returns E.164 when parseable, otherwise the trimmed input.
 */
export function normalizePhoneLoose(input: string): string {
  try {
    const parsed = parsePhoneNumberFromString(
      (input || '').trim(),
      DEFAULT_COUNTRY,
    );
    if (parsed && parsed.isValid()) return parsed.number;
  } catch {
    // fall through
  }
  return (input || '').trim();
}
