import {
  isPagosOnlineEnabled,
  PAYMENT_IN_PERSON_ONLY_MSG,
  formatPaymentConfirmationMessage,
} from './payment-config';

describe('payment-config (PAGOSONLINE)', () => {
  const originalEnv = process.env.PAGOSONLINE;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PAGOSONLINE = originalEnv;
    } else {
      delete process.env.PAGOSONLINE;
    }
  });

  describe('isPagosOnlineEnabled', () => {
    it('defaults to true when PAGOSONLINE is unset', () => {
      delete process.env.PAGOSONLINE;
      expect(isPagosOnlineEnabled()).toBe(true);
    });

    it('returns true when PAGOSONLINE is S', () => {
      process.env.PAGOSONLINE = 'S';
      expect(isPagosOnlineEnabled()).toBe(true);
    });

    it('returns true when PAGOSONLINE is s (case-insensitive)', () => {
      process.env.PAGOSONLINE = 's';
      expect(isPagosOnlineEnabled()).toBe(true);
    });

    it('returns false when PAGOSONLINE is N', () => {
      process.env.PAGOSONLINE = 'N';
      expect(isPagosOnlineEnabled()).toBe(false);
    });

    it('returns false when PAGOSONLINE is n (case-insensitive with whitespace)', () => {
      process.env.PAGOSONLINE = '  n  ';
      expect(isPagosOnlineEnabled()).toBe(false);
    });

    it('has correct constant for in-person payment message', () => {
      expect(PAYMENT_IN_PERSON_ONLY_MSG).toBe('El pago se realiza en el centro.');
    });
  });

  describe('formatPaymentConfirmationMessage', () => {
    it('returns Stripe payment URL message when paymentUrl is present (PAGOSONLINE=S)', () => {
      process.env.PAGOSONLINE = 'S';
      const msg = formatPaymentConfirmationMessage({
        paymentUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
        price: '60.00',
        paymentType: 'stripe',
      });
      expect(msg).toContain('https://checkout.stripe.com/c/pay/cs_test_123');
      expect(msg).toContain('Tarjeta, Bizum, Apple/Google Pay');
    });

    it('returns external official link when paymentType is external_url', () => {
      process.env.PAGOSONLINE = 'S';
      const msg = formatPaymentConfirmationMessage({
        paymentUrl: 'https://www.giglon.com/evento-test',
        price: '30.00',
        paymentType: 'external_url',
      });
      expect(msg).toContain('accede al enlace oficial: https://www.giglon.com/evento-test');
    });

    it('returns ONLY "El pago se realiza en el centro." when PAGOSONLINE=N and price > 0', () => {
      process.env.PAGOSONLINE = 'N';
      const msg = formatPaymentConfirmationMessage({
        paymentUrl: undefined,
        price: '60.00',
        paymentType: 'stripe',
      });
      expect(msg.trim()).toBe('El pago se realiza en el centro.');
      expect(msg).not.toContain('checkout.stripe.com');
      expect(msg).not.toContain('enlace seguro');
    });

    it('returns empty string for free services even if PAGOSONLINE=N', () => {
      process.env.PAGOSONLINE = 'N';
      const msg = formatPaymentConfirmationMessage({
        paymentUrl: undefined,
        price: '0.00',
        paymentType: 'free',
      });
      expect(msg).toBe('');
    });
  });
});
