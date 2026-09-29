import { EmailInboundService } from './email-inbound.service';

describe('EmailInboundService - cleanReplyBody', () => {
  let service: EmailInboundService;

  beforeEach(() => {
    // Instantiate with dummy dependencies since we are testing cleanReplyBody
    service = new EmailInboundService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('should preserve single clean customer reply text', () => {
    const raw = 'Quiero reservar este jueves a las 14:00';
    const cleaned = (service as any).cleanReplyBody(raw);
    expect(cleaned).toBe('Quiero reservar este jueves a las 14:00');
  });

  it('should strip Gmail Spanish quote header spanning one or more lines', () => {
    const raw = `Quiero reservar este jueves a las 14:00

El mar, 29 sept 2026 a las 10:09, Centro de Yoga Salvadora Conesa <salvadoraconesa@salvadoraconesa.es> escribió:
> Hola José,
> Gracias por tu mensaje.`;

    const cleaned = (service as any).cleanReplyBody(raw);
    expect(cleaned).toBe('Quiero reservar este jueves a las 14:00');
  });

  it('should strip Gmail Spanish quote header wrapping at email address', () => {
    const raw = `Quiero reservar este jueves a las 14:00

El mar, 29 sept 2026 a las 10:09, Centro de Yoga Salvadora Conesa <
salvadoraconesa@salvadoraconesa.es> escribió:
> Hola José`;

    const cleaned = (service as any).cleanReplyBody(raw);
    expect(cleaned).toBe('Quiero reservar este jueves a las 14:00');
  });

  it('should strip Outlook Spanish quote header', () => {
    const raw = `Muchas gracias por la información, asistiré el lunes.

-----Mensaje original-----
De: Salvadora Conesa <salvadoraconesa@salvadoraconesa.es>
Enviado el: lunes, 28 de septiembre de 2026 18:00
Para: cliente@example.com
Asunto: Confirmación`;

    const cleaned = (service as any).cleanReplyBody(raw);
    expect(cleaned).toBe('Muchas gracias por la información, asistiré el lunes.');
  });

  it('should strip lines starting with >', () => {
    const raw = `Confirmo la cita.
> Línea anterior
> Otra línea anterior`;

    const cleaned = (service as any).cleanReplyBody(raw);
    expect(cleaned).toBe('Confirmo la cita.');
  });

  describe('isCorporateOrAutomatedEmail', () => {
    it('detects corporate bot prefixes like noreply and service', () => {
      const check1 = service.isCorporateOrAutomatedEmail({}, 'noreply@sg.ycloud.com');
      expect(check1.isCorporate).toBe(true);

      const check2 = service.isCorporateOrAutomatedEmail({}, 'service@ycloud.com');
      expect(check2.isCorporate).toBe(true);

      const check3 = service.isCorporateOrAutomatedEmail({}, 'support@stripe.com');
      expect(check3.isCorporate).toBe(true);

      const check4 = service.isCorporateOrAutomatedEmail({}, 'facturacion@empresa.es');
      expect(check4.isCorporate).toBe(true);
    });

    it('detects automated headers like List-Unsubscribe or Auto-Submitted', () => {
      const headers = new Map();
      headers.set('auto-submitted', 'auto-generated');
      const check = service.isCorporateOrAutomatedEmail({ headers }, 'juan@example.com');
      expect(check.isCorporate).toBe(true);
    });

    it('allows individual personal emails', () => {
      const check1 = service.isCorporateOrAutomatedEmail({}, 'jigomez@hotmail.com');
      expect(check1.isCorporate).toBe(false);

      const check2 = service.isCorporateOrAutomatedEmail({}, 'maria.garcia@gmail.com');
      expect(check2.isCorporate).toBe(false);
    });
  });
});
