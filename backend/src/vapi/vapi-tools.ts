import { createHash } from 'crypto';

export interface VapiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  server: { url: string; credentialId?: string };
  messages?: Array<{ type: string; content: string; timingMilliseconds?: number }>;
}

const AGENDA_ANTI_SILENCE_MESSAGES = [
  { type: 'request-start', content: 'Déjame mirar la agenda un segundo.' },
  { type: 'request-failed', content: 'Ahora mismo no puedo consultar la agenda. ¿Te llamamos nosotros?' },
  { type: 'request-response-delayed', content: 'Sigo mirando, un momento.', timingMilliseconds: 3000 },
];

export function buildVapiToolDefinitions(webhookUrl: string, credentialId?: string): VapiToolDefinition[] {
  const server = {
    url: webhookUrl,
    ...(credentialId ? { credentialId } : {}),
  };

  return [
    {
      type: 'function',
      function: {
        name: 'identificar_llamante',
        description:
          'Comprueba si el número que llama ya está en la base de datos del negocio. Llámala una sola vez al principio de la llamada. No lleva parámetros (el número se detecta automáticamente). Devuelve el nombre del cliente y su próxima cita si constan. Si devuelve que no consta, trátalo como cliente nuevo.',
        parameters: { type: 'object', properties: {} },
      },
      server,
    },
    {
      type: 'function',
      function: {
        name: 'consultar_huecos',
        description:
          'Consulta los huecos libres reales de la agenda. Úsala SIEMPRE antes de proponer cualquier hora; nunca ofrezcas una hora sin haberla consultado. Parámetros: servicio (opcional), fechaPreferida (opcional, en formato AAAA-MM-DD), horaPreferida (opcional, en formato HH:MM), franja (opcional: manana, tarde o cualquiera), diasVista (opcional, 1 a 30 días). El resultado devuelve opciones en lenguaje natural y con su código ISO entre corchetes. Ofrece la hora al cliente y guarda el código ISO para reservar. NUNCA leas los códigos entre corchetes en voz alta.',
        parameters: {
          type: 'object',
          properties: {
            servicio: { type: 'string', description: 'Servicio que pide el cliente' },
            fechaPreferida: { type: 'string', description: 'Fecha preferida en formato AAAA-MM-DD' },
            horaPreferida: {
              type: 'string',
              description: 'Hora concreta por la que pregunta el cliente, en formato HH:MM (por ejemplo 11:00)',
            },
            franja: { type: 'string', enum: ['manana', 'tarde', 'cualquiera'] },
            diasVista: { type: 'integer', minimum: 1, maximum: 30 },
          },
        },
      },
      server,
      messages: AGENDA_ANTI_SILENCE_MESSAGES,
    },
    {
      type: 'function',
      function: {
        name: 'reservar_cita',
        description:
          'Reserva una cita formal en la agenda. Úsala SOLO después de que el cliente haya aceptado una hora consultada con consultar_huecos y te haya dado su nombre. Parámetros: inicioIso (obligatorio: el código ISO exacto del hueco elegido), servicio (obligatorio), nombre (obligatorio: nombre del cliente), email (opcional), notas (opcional). El teléfono se detecta automáticamente.',
        parameters: {
          type: 'object',
          properties: {
            inicioIso: { type: 'string', description: 'Código ISO del hueco elegido (obtenido de consultar_huecos)' },
            servicio: { type: 'string', description: 'Nombre del servicio a reservar' },
            nombre: { type: 'string', description: 'Nombre completo del cliente' },
            email: { type: 'string', description: 'Correo electrónico del cliente si lo facilita' },
            notas: { type: 'string', description: 'Motivo o notas adicionales de la cita' },
          },
          required: ['inicioIso', 'servicio', 'nombre'],
        },
      },
      server,
      messages: [
        { type: 'request-start', content: 'Un segundo, que lo anoto en el calendario.' },
        { type: 'request-failed', content: 'No he podido agendar la cita en este momento. ¿Te devolvemos la llamada?' },
        { type: 'request-response-delayed', content: 'Ya casi está, un segundo.', timingMilliseconds: 3000 },
      ],
    },
    {
      type: 'function',
      function: {
        name: 'reprogramar_cita',
        description:
          'Mueve una cita existente del cliente a una nueva fecha y hora. Úsala solo después de consultar el nuevo hueco con consultar_huecos y de que el cliente lo confirme. Parámetros: nuevoInicioIso (obligatorio: código ISO del nuevo hueco), citaId (opcional).',
        parameters: {
          type: 'object',
          properties: {
            nuevoInicioIso: { type: 'string', description: 'Código ISO del nuevo hueco elegido' },
            citaId: { type: 'string', description: 'ID de la cita si se conoce' },
          },
          required: ['nuevoInicioIso'],
        },
      },
      server,
      messages: AGENDA_ANTI_SILENCE_MESSAGES,
    },
    {
      type: 'function',
      function: {
        name: 'anular_cita',
        description:
          'Anula la próxima cita agendada del cliente que llama. Úsala solo cuando el cliente confirme explícitamente que desea cancelar. Parámetros: citaId (opcional), motivo (opcional).',
        parameters: {
          type: 'object',
          properties: {
            citaId: { type: 'string', description: 'ID de la cita si se conoce' },
            motivo: { type: 'string', description: 'Motivo de la cancelación' },
          },
        },
      },
      server,
      messages: AGENDA_ANTI_SILENCE_MESSAGES,
    },
    {
      type: 'function',
      function: {
        name: 'datos_del_negocio',
        description:
          'Consulta información del negocio: dirección, horarios, servicios con precios y preguntas frecuentes. Úsala cuando pregunten algo del negocio que no tengas en el prompt. Parámetro: tema (opcional: direccion, horario, precios, etc.).',
        parameters: {
          type: 'object',
          properties: {
            tema: { type: 'string', description: 'Tema sobre el que consulta el cliente' },
          },
        },
      },
      server,
    },
    {
      type: 'function',
      function: {
        name: 'registrar_handoff',
        description:
          'Anota que la llamada necesita atención humana urgente (avería, reclamación, enfado o tema fuera de alcance). Parámetro: motivo (obligatorio). Registra el aviso para el equipo.',
        parameters: {
          type: 'object',
          properties: {
            motivo: { type: 'string', description: 'Motivo de la derivación o solicitud de atención humana' },
          },
          required: ['motivo'],
        },
      },
      server,
    },
  ];
}

export function computeToolChecksum(def: VapiToolDefinition): string {
  const payload = {
    name: def.function.name,
    description: def.function.description,
    parameters: def.function.parameters,
    serverUrl: def.server.url,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}
