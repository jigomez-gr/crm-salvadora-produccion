/**
 * Configuration and helpers for online payment processing (Stripe Checkout, Bizum, etc.).
 *
 * Driven by the PAGOSONLINE environment variable:
 * - 'S' (or unset / default): Online payments are enabled. Payment links are generated and offered.
 * - 'N': Online payments are disabled. No online payment links are generated or displayed.
 *   The system informs: "El pago se realiza en el centro."
 */
export function isPagosOnlineEnabled(): boolean {
  const val = (process.env.PAGOSONLINE || 'S').trim().toUpperCase();
  return val !== 'N';
}

export const PAYMENT_IN_PERSON_ONLY_MSG = 'El pago se realiza en el centro.';

/**
 * Helper to construct the payment message appended to appointment confirmations.
 */
export function formatPaymentConfirmationMessage(params: {
  paymentUrl?: string | null;
  paymentType?: string | null;
  price?: string | number | null;
}): string {
  const onlineAllowed = isPagosOnlineEnabled();
  const priceNum =
    typeof params.price === 'string'
      ? parseFloat(params.price) || 0
      : (params.price ?? 0);

  if (params.paymentUrl) {
    if (params.paymentType === 'external_url') {
      return ` Para adquirir tus entradas o completar la compra, accede al enlace oficial: ${params.paymentUrl}`;
    }
    return ` Puedes realizar el pago para confirmar tu reserva (Tarjeta, Bizum, Apple/Google Pay) aquí: ${params.paymentUrl}`;
  }

  if (!onlineAllowed && priceNum > 0 && params.paymentType !== 'free') {
    return ` ${PAYMENT_IN_PERSON_ONLY_MSG}`;
  }

  return '';
}
