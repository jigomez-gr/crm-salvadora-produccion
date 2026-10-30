import {
  isPureClosingOrFarewell,
  isBotFarewell,
  normalizeFarewellText,
} from './farewell-detector';

describe('Farewell & Courtesy Detector (Anti-Loop)', () => {
  describe('normalizeFarewellText', () => {
    it('strips bot prefixes and accents', () => {
      expect(normalizeFarewellText('B: ¡Muchísimas gracias por vuestras palabras!')).toBe(
        'muchisimas gracias por vuestras palabras',
      );
      expect(normalizeFarewellText('Bot: ¡Hasta pronto! Que sigáis bien.')).toBe(
        'hasta pronto que sigais bien',
      );
      expect(normalizeFarewellText('Asistente: Saludos cordiales')).toBe(
        'saludos cordiales',
      );
    });

    it('removes emojis and special characters', () => {
      expect(
        normalizeFarewellText('¡Hasta pronto! 🙏✨ Un abrazo grande 🥰🌿'),
      ).toBe('hasta pronto un abrazo grande');
    });
  });

  describe('isPureClosingOrFarewell', () => {
    it('detects pure closings and thanks matching the screenshot exact texts', () => {
      const msg1 =
        'B: ¡Muchísimas gracias por vuestras palabras tan bonitas y por ese abrazo enorme! 🥰🌿 Recibimos vuestro cariño con mucha alegría y os enviamos también un abrazo grande, con los mejores deseos de paz, armonía y bienestar.';
      expect(isPureClosingOrFarewell(msg1)).toBe(true);

      const msg2 =
        'B: ¡Hasta pronto! Que sigáis rodeados de paz, armonía y bienestar. 🙏🌿';
      expect(isPureClosingOrFarewell(msg2)).toBe(true);

      const msg3 =
        'B: ¡Muchísimas gracias por vuestras palabras tan amables y por ese abrazo lleno de afecto! 🥰🌿 Nos alegra mucho recibir vuestro cariño y os enviamos también un abrazo grande, deseándoos siempre paz, armonía y bienestar.';
      expect(isPureClosingOrFarewell(msg3)).toBe(true);

      const msg4 =
        'B: ¡Hasta pronto! Que la paz, la armonía os acompañen siempre. 🙏🌿';
      expect(isPureClosingOrFarewell(msg4)).toBe(true);
    });

    it('detects short everyday farewells and thanks', () => {
      expect(isPureClosingOrFarewell('Muchas gracias')).toBe(true);
      expect(isPureClosingOrFarewell('¡Hasta pronto!')).toBe(true);
      expect(isPureClosingOrFarewell('Adiós, buen día')).toBe(true);
      expect(isPureClosingOrFarewell('Un abrazo fuerte')).toBe(true);
      expect(isPureClosingOrFarewell('Mil gracias, feliz finde')).toBe(true);
      expect(isPureClosingOrFarewell('Igualmente, cuídate!')).toBe(true);
    });

    it('does NOT suppress messages that contain questions or inquiries', () => {
      expect(
        isPureClosingOrFarewell('Muchas gracias, ¿cuánto cuesta la clase de yoga?'),
      ).toBe(false);
      expect(
        isPureClosingOrFarewell('Gracias. ¿Qué horario tenéis para el baño de gong?'),
      ).toBe(false);
      expect(
        isPureClosingOrFarewell('Hasta luego! ¿Me podéis confirmar si tengo cita mañana?'),
      ).toBe(false);
    });

    it('does NOT suppress messages with booking, cancel or service requests', () => {
      expect(
        isPureClosingOrFarewell('Gracias pero quiero cancelar mi cita'),
      ).toBe(false);
      expect(
        isPureClosingOrFarewell('Hasta pronto, apuntarme por favor para el retiro'),
      ).toBe(false);
      expect(
        isPureClosingOrFarewell('Un abrazo, quiero cambiar mi cita al jueves'),
      ).toBe(false);
    });

    it('returns false for empty or non-closing messages', () => {
      expect(isPureClosingOrFarewell('')).toBe(false);
      expect(isPureClosingOrFarewell('Hola, buenas')).toBe(false);
      expect(isPureClosingOrFarewell('Estoy interesado en el taller')).toBe(false);
    });
  });

  describe('isBotFarewell', () => {
    it('detects bot farewell replies matching screenshot texts', () => {
      const botMsg1 =
        '¡Gracias a vosotros por vuestro cariño! 😊🌿 Nos alegra mucho recibirlo y os devolvemos ese abrazo con todo nuestro afecto. Que sigáis rodeados de paz, armonía y bienestar. 🙏✨';
      expect(isBotFarewell(botMsg1)).toBe(true);

      const botMsg2 =
        '¡Hasta pronto! 🙏✨ Un abrazo grande, y que la paz, la armonía y el bienestar os acompañen siempre.';
      expect(isBotFarewell(botMsg2)).toBe(true);

      const botMsg3 =
        '¡Hasta pronto! 🙏✨ Un abrazo grande. Que sigáis disfrutando de mucha paz, armonía y bienestar.';
      expect(isBotFarewell(botMsg3)).toBe(true);

      const botMsg4 =
        '¡Muchas gracias a ti y que tengas un excelente día! Un abrazo.';
      expect(isBotFarewell(botMsg4)).toBe(true);
    });

    it('does not classify bot questions as farewells', () => {
      const botQuestion =
        '¡Muchas gracias! ¿En qué horario te vendría bien la clase?';
      expect(isBotFarewell(botQuestion)).toBe(false);
    });
  });
});
