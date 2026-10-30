/**
 * Anti-loop courtesy and farewell detection for conversational channels.
 *
 * Prevents bot-to-bot infinite loops where both participants keep exchanging
 * courtesies, blessings, and farewells ("hasta pronto", "gracias a vosotros",
 * "un abrazo", "que la paz os acompañe", etc.).
 *
 * Pure functions — zero I/O, exhaustively unit-testable.
 */

// Prefixes commonly added by third-party WhatsApp bots / auto-responders
const BOT_PREFIX_REGEX = /^(?:[a-zA-Z0-9_\-]{1,15}\s*:\s*)+/;

// Accents and diacritics stripping
function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalizes text for keyword / phrase matching:
 * - strips bot prefixes like "B: " or "Bot: "
 * - strips accents
 * - lowercases
 * - removes punctuation and emojis
 * - collapses multiple whitespaces
 */
export function normalizeFarewellText(text: string): string {
  if (!text) return '';
  let clean = text.trim();

  // Strip bot prefix if present (e.g. "B: ¡Muchísimas gracias...")
  clean = clean.replace(BOT_PREFIX_REGEX, '');

  clean = stripAccents(clean).toLowerCase();

  // Replace punctuation and emojis with spaces
  clean = clean.replace(/[^\w\s]/g, ' ');

  // Collapse whitespace
  return clean.replace(/\s+/g, ' ').trim();
}

// Words/tokens indicating active business inquiries or requests that MUST NOT be suppressed
const BUSINESS_OR_ACTION_KEYWORDS = [
  'cuanto',
  'cuanta',
  'precio',
  'precios',
  'tarifa',
  'tarifas',
  'cuesta',
  'coste',
  'horario',
  'horarios',
  'cuando',
  'que dia',
  'que hora',
  'donde',
  'direccion',
  'ubicacion',
  'informacion',
  'clase',
  'clases',
  'sesion',
  'sesiones',
  'taller',
  'talleres',
  'curso',
  'retiro',
  'ayuno',
  'yoga',
  'gong',
  'gestalt',
  'constelacion',
  'constelaciones',
  'bienestar experience',
  'reservar',
  'reserva',
  'reservas',
  'apuntar',
  'apuntarme',
  'inscribir',
  'inscribirme',
  'cita',
  'citas',
  'plaza',
  'plazas',
  'cancelar',
  'anular',
  'cambiar',
  'mover',
  'reprogramar',
  'modificar',
  'telefono',
  'movil',
  'email',
  'correo',
  'humano',
  'persona',
  'operador',
  'quiero',
  'necesito',
  'puedo',
  'duda',
  'pregunta',
  'disponibilidad',
  'hueco',
  'huecos',
];

// Patterns that identify pure closings, farewells, thanks and polite blessings
const CLOSING_PHRASES = [
  'gracias',
  'muchas gracias',
  'muchisimas gracias',
  'mil gracias',
  'un millon de gracias',
  'agradecido',
  'agradecida',
  'hasta pronto',
  'hasta luego',
  'hasta la proxima',
  'hasta manana',
  'adios',
  'chao',
  'chau',
  'bye',
  'nos vemos',
  'cuidate',
  'cuidense',
  'buen dia',
  'buenas tardes',
  'buenas noches',
  'feliz dia',
  'feliz tarde',
  'feliz noche',
  'feliz fin de semana',
  'buen fin de semana',
  'buen finde',
  'un abrazo',
  'un abrazo grande',
  'abrazo enorme',
  'un abrazo fuerte',
  'saludos',
  'un saludo',
  'un cordial saludo',
  'saludos cordiales',
  'bendiciones',
  'paz y armonia',
  'paz armonia y bienestar',
  'paz y bien',
  'que tengais buen',
  'que tengas buen',
  'que pases buen',
  'que paseis buen',
  'que sigais rodeados',
  'que os acompanen siempre',
  'que te acompane',
  'igualmente',
  'a vosotros',
  'a ti',
  'de nada',
  'para servirte',
  'un placer',
];

/**
 * Checks if an inbound message is purely a courtesy/farewell/closing message.
 * Returns true ONLY if:
 * 1. It contains closing/courtesy phrases.
 * 2. It contains NO question marks (? or ¿).
 * 3. It contains NO business inquiry or action keywords (booking, rescheduling, services, prices...).
 */
export function isPureClosingOrFarewell(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  const raw = text.trim();
  if (raw.length === 0) return false;

  // If it has any question mark, it is an inquiry, not a pure closing
  if (raw.includes('?') || raw.includes('¿')) {
    return false;
  }

  const normalized = normalizeFarewellText(raw);
  if (!normalized) return false;

  // Check for business or actionable keywords
  const words = normalized.split(' ');
  const hasBusinessKeyword = BUSINESS_OR_ACTION_KEYWORDS.some((kw) => {
    if (kw.includes(' ')) {
      return normalized.includes(kw);
    }
    return words.includes(kw);
  });

  if (hasBusinessKeyword) {
    return false;
  }

  // Check if at least one closing phrase is present
  const hasClosingPhrase = CLOSING_PHRASES.some((phrase) => {
    return normalized.includes(phrase);
  });

  if (!hasClosingPhrase) {
    return false;
  }

  // If it contains a closing phrase and no business keywords or questions, it's a pure closing
  return true;
}

/**
 * Checks if a previous outbound message produced by the bot was a farewell or closing.
 */
export function isBotFarewell(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  const raw = text.trim();
  if (raw.length === 0) return false;

  // A bot message asking a question (e.g. "¿Qué día prefieres?") is not a closing
  if (raw.includes('?') || raw.includes('¿')) {
    return false;
  }

  const normalized = normalizeFarewellText(raw);
  if (!normalized) return false;

  // Check for farewell or closing markers in the bot's reply
  const botFarewellMarkers = [
    'hasta pronto',
    'hasta luego',
    'hasta la proxima',
    'adios',
    'un abrazo',
    'un saludo',
    'que tengas',
    'que tengais',
    'que pases',
    'que paseis',
    'gracias a ti',
    'gracias a vosotros',
    'un placer',
    'paz armonia y bienestar',
    'paz y armonia',
    'siempre a vuestra disposicion',
    'siempre a tu disposicion',
    'aqui estamos para lo que necesites',
    'cuando quieras volver',
  ];

  return botFarewellMarkers.some((marker) => normalized.includes(marker));
}
