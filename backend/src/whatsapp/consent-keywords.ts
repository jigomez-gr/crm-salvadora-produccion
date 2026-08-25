/**
 * Pure detection of consent (opt-out / opt-in) keywords in an inbound WhatsApp
 * message — no NestJS/DB/I-O, so it's exhaustively unit-testable. Mirrors the
 * pure-core pattern of inbound-parser.ts / reminder-selection.ts.
 *
 * Matches only when the WHOLE (normalised) message is a keyword, so a sentence
 * like "stop by at 5" or "quiero darme una vuelta" is never a false opt-out.
 */

export type ConsentSignal = 'opt_out' | 'opt_in';

// Accent-insensitive, lower-cased, single-spaced exact phrases.
const OPT_OUT = new Set([
  'stop',
  'baja',
  'darme de baja',
  'dar de baja',
  'cancelar',
  'cancelar suscripcion',
  'no molestar',
  'unsubscribe',
  'baja suscripcion',
]);

const OPT_IN = new Set([
  'start',
  'alta',
  'darme de alta',
  'dar de alta',
  'suscribir',
  'suscribirme',
  'unstop',
  'subscribe',
]);

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[.!¡?¿,;:]/g, '') // drop trailing punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectConsentKeyword(text: string | undefined): ConsentSignal | null {
  const t = normalize(text ?? '');
  if (!t) return null;
  if (OPT_OUT.has(t)) return 'opt_out';
  if (OPT_IN.has(t)) return 'opt_in';
  return null;
}
