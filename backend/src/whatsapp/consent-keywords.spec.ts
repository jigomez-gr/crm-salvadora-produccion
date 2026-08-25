import { detectConsentKeyword } from './consent-keywords';

describe('detectConsentKeyword', () => {
  it('detects opt-out keywords (case/accent/punctuation-insensitive)', () => {
    expect(detectConsentKeyword('STOP')).toBe('opt_out');
    expect(detectConsentKeyword('baja')).toBe('opt_out');
    expect(detectConsentKeyword('  Baja. ')).toBe('opt_out');
    expect(detectConsentKeyword('Cancelar suscripción')).toBe('opt_out');
    expect(detectConsentKeyword('darme de baja')).toBe('opt_out');
  });

  it('detects opt-in keywords', () => {
    expect(detectConsentKeyword('ALTA')).toBe('opt_in');
    expect(detectConsentKeyword('start')).toBe('opt_in');
    expect(detectConsentKeyword('Suscribirme')).toBe('opt_in');
  });

  it('does NOT match a keyword embedded in a sentence', () => {
    expect(detectConsentKeyword('stop by at 5pm')).toBeNull();
    expect(detectConsentKeyword('quiero darme una vuelta')).toBeNull();
    expect(detectConsentKeyword('¿me puedes dar de baja la cita?')).toBeNull();
  });

  it('returns null for empty / unrelated text', () => {
    expect(detectConsentKeyword('')).toBeNull();
    expect(detectConsentKeyword(undefined)).toBeNull();
    expect(detectConsentKeyword('hola, quiero una cita')).toBeNull();
  });
});
