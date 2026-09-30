import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../common/entities/service.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { resolveNextRecurringEventDate } from '../common/time';

export interface EmailDialogueInput {
  contact: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  };
  threadHistory: Array<{
    direction: string;
    body: string;
    createdAt?: Date | null;
  }>;
  latestInbound: {
    subject: string;
    body: string;
  };
}

export interface EmailDialogueEvaluation {
  intent: 'AUTO_BOOKING' | 'AUTO_INFO' | 'HUMAN_HANDOFF' | 'IGNORE';
  reasoning: string;
  isUrgent?: boolean;
  handoffReason?: string;
  extractedBooking?: {
    serviceName?: string;
    requestedDate?: string;
    requestedTime?: string;
    isoDateTime?: string;
    modality?: string;
    participants?: number;
  };
  replySubject?: string;
  replyBody?: string;
}

@Injectable()
export class EmailDialogueEvaluatorService {
  private readonly logger = new Logger(EmailDialogueEvaluatorService.name);

  constructor(
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
    @InjectRepository(AgentConfig)
    private readonly agentConfigRepo: Repository<AgentConfig>,
  ) {}

  async evaluateEmail(input: EmailDialogueInput): Promise<EmailDialogueEvaluation> {
    try {
      const config =
        (await this.agentConfigRepo.findOne({ where: { agentKey: 'booking' } })) ||
        (await this.agentConfigRepo.findOne({ where: {} }));

      const apiKey =
        config?.openrouterApiKey && config.openrouterApiKey !== 'sk-or-placeholder'
          ? config.openrouterApiKey
          : process.env.OPENROUTER_API_KEY || '';

      const model = config?.model || process.env.AGENT_MODEL || 'openai/gpt-4.1-mini';

      if (!apiKey) {
        this.logger.warn('No OpenRouter API key found. Using heuristic fallback for email dialogue.');
        return this.heuristicFallback(input);
      }

      // Gather live center services
      const dbServices = await this.serviceRepo.find({ where: { isActive: true } }).catch(() => []);
      const servicesCatalog = dbServices
        .map((s) => {
          const recurring = resolveNextRecurringEventDate(s.name, new Date(), 'Europe/Madrid');
          let dates = s.scheduleText || s.eventDatesText;
          if (recurring.hasRule && recurring.dateText) {
            dates = `${recurring.dateText} (${/gong/i.test(s.name) ? 'último sábado de cada mes' : 'último domingo de cada mes'})`;
          } else if (s.sinfechadefinitiva === 'S') {
            dates = s.textosinfechadefinitiva || 'próximamente';
          } else if (s.eventStartDate && new Date(s.eventStartDate).getTime() <= Date.now()) {
            dates = 'próximamente (fechas por confirmar)';
          }

          let priceStr = s.price ? `${s.price} €` : 'Consultar';
          if (s.sinpreciodefinitivo === 'S' || !s.price || s.price === '0.00' || s.price === '0') {
            priceStr = 'El precio se determinará en función de las características del viaje y alojamiento.';
          }

          let spec = s.textoespecifico ? `\n  Texto específico / condiciones: ${s.textoespecifico}` : '';
          return `- Servicio: ${s.name}\n  Precio: ${priceStr}\n  Horario/Fechas: ${
            dates || 'Consultar programación'
          }\n  Modalidad: ${s.allowedModalities?.join(', ') || 'presencial'}\n  Descripción: ${
            s.description || 'Sin descripción adicional'
          }${spec}\n  Reservas provisionales: Se admiten reservas provisionales de plaza.`;
        })
        .join('\n\n');

      const historyFormatted = input.threadHistory
        .slice(-8)
        .map((m) => {
          const role = m.direction === 'inbound' ? 'CLIENTE' : 'CENTRO SALVADORA CONESA';
          return `[${role}]: ${m.body.trim()}`;
        })
        .join('\n---\n');

      const systemPrompt = `Eres la Coordinadora de Admisiones y Atención al Cliente del "Centro de Yoga Salvadora Conesa" en Fuenlabrada (Madrid).
Fundadora y Maestra Principal: Salvadora Conesa.
Terapeuta y Facilitador: José Ignacio Gómez Raya.
Teléfono y WhatsApp: 695 172 625.
Web: https://salvadora.jigretera.com
Email de atención: salvadoraconesa@salvadoraconesa.es

Tu tarea es leer la respuesta que un remitente ha enviado por correo electrónico y determinar la acción adecuada:

REGLAS DE ORO OBLIGATORIAS (LEER ANTES DE CUALQUIER OTRA COSA):
1. REGLA ESTRICTA DE "NO EMPRESAS":
   - NUNCA RESPONDER A EMPRESAS, proveedores de servicios (software, SEO, marketing, telefonía, suministros, seguros, bancos, gestorías, etc.), plataformas automáticas o de soporte (como YCloud, Meta, WhatsApp Business, Google, Stripe, etc.), boletines (newsletters) ni spam comercial.
   - SOLO responder a personas físicas individuales (clientes, alumnos o personas interesadas a título particular).
   - Si el mensaje o remitente es de una empresa, plataforma o servicio comercial: CLASIFÍCALO INMEDIATAMENTE como "intent": "IGNORE", con "replyBody": null y "replySubject": null. ¡BAJO NINGÚN CONCEPTO SE DEBE RESPONDER A UNA EMPRESA!

2. REGLA DE TEMÁTICA EXCLUSIVA (ACTIVIDADES DE LA ESCUELA DE YOGA DE SALVADORA CONESA):
   - SOLO responder a mensajes que traten explícitamente sobre las actividades y servicios del Centro de Yoga Salvadora Conesa: clases de Hatha Yoga Terapéutico, Meditación, Baño de Gong y Meditación Sonora, Constelaciones Familiares, Terapia Gestalt, horarios de clase, tarifas, solicitar clase de prueba o información del centro.
   - Si una persona escribe para ofrecer colaboraciones comerciales ajenas, vender algo, o sobre cualquier tema no relacionado con las actividades de la escuela de yoga: CLASIFÍCALO INMEDIATAMENTE como "intent": "IGNORE", con "replyBody": null y "replySubject": null.

CATEGORÍAS DE INTENCIÓN:
1. "IGNORE":
   - El mensaje proviene de una empresa, plataforma automatizada, proveedor técnico/comercial, O no trata sobre las actividades de la escuela de yoga de Salvadora Conesa.
   - Acción: NO responder. "replySubject": null, "replyBody": null.

2. "AUTO_BOOKING":
   - Solo aplicable a personas físicas que solicitan cita, reserva o plaza para clases o talleres de yoga (p. ej. "quiero reservar cita para yoga", "confírmame para el jueves", "me viene bien a las 9:45").
   - Acción: Progresar la reserva. Si falta concretar turno u horario, expón con amabilidad los horarios disponibles de esa actividad. Si el horario ya está claro, confírmale su reserva de plaza.
   - Redacta un correo ('replyBody') impecable, cálido y resolutivo facilitando la confirmación de la cita.

3. "AUTO_INFO":
   - Solo aplicable a personas físicas que preguntan dudas sobre precios, material (facilitamos esterillas y accesorios en la sala), qué ropa traer, horarios, ubicación o cómo funciona una actividad de la escuela de yoga, SIN requerir criterio clínico.
   - Acción: Responder con claridad y calidez, resolviendo su duda con los datos del centro e invitándole a probar o reservar.

4. "HUMAN_HANDOFF":
   - Solo aplicable a personas físicas que plantean una situación personal/médica compleja (lesión de columna, embarazo de riesgo, cirugía reciente, consulta profunda de psicoterapia/Gestalt), expresan una queja, o solicitan hablar personalmente con Salvadora ("quiero que me llame Salvadora", "necesito hablar con ella").
   - Acción: Marcar pase a humano.
   - Evaluación de Urgencia ("isUrgent"):
     * Pon "isUrgent": true ÚNICAMENTE si el mensaje describe una urgencia real inaplazable: dolor agudo severo o incapacitante sobrevenido, crisis médica o psicológica aguda, accidente reciente, o cancelación urgente de última hora de una cita inminente hoy mismo, o pide auxilio con palabras explícitas de urgencia ("por favor es urgente", "emergencia").
     * En cualquier otro caso habitual (consultas sobre dolencias crónicas pasadas, embarazo, querer hablar tranquilamente con Salvadora para consultar su caso, etc.), "isUrgent" DEBE SER false.
   - Redacta un correo cordial ('replyBody') avisando de que hemos transferido su mensaje directamente a Salvadora para que lo revise personalmente.

REGLAS DE RESPUESTA:
- El tono debe ser siempre muy cercano, respetuoso, cálido y profesional en español.
- No uses fechas pasadas.
- Firma siempre como:
  Centro de Yoga Salvadora Conesa
  Teléfono: 695 172 625
  https://salvadora.jigretera.com

CATÁLOGO DE SERVICIOS Y HORARIOS:
${servicesCatalog}

FECHA Y HORA ACTUAL DE REFERENCIA (IMPORTANTE PARA CALCULAR DÍAS DE LA SEMANA):
Hoy es ${new Intl.DateTimeFormat('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date())} (${new Date().toISOString().split('T')[0]}). Zona horaria: Europe/Madrid.
Si el usuario dice "el martes", "el jueves a las 9:45", etc., calcula la fecha próxima correspondiente a partir de hoy (nunca en el pasado).

RESPONDE EXCLUSIVAMENTE UN OBJETO JSON VÁLIDO CON ESTA ESTRUCTURA:
{
  "intent": "AUTO_BOOKING" | "AUTO_INFO" | "HUMAN_HANDOFF" | "IGNORE",
  "reasoning": "Breve explicación de la decisión tomada",
  "isUrgent": true | false,
  "handoffReason": "Razón para el equipo humano si es HUMAN_HANDOFF o null",
  "extractedBooking": {
    "serviceName": "Nombre exacto del servicio del catálogo (ej: 'Hatha Yoga Terapéutico', 'Baño de Gong y Meditación Sonora') o null",
    "requestedDate": "Fecha calculada en formato YYYY-MM-DD o null",
    "requestedTime": "Hora solicitada en formato HH:mm o null",
    "isoDateTime": "Fecha y hora completa calculada en formato ISO 8601 (ej: '2026-10-01T09:45:00') para la fecha solicitada o null si aún no se ha concretado día y hora",
    "modality": "presencial" | "online" | null,
    "participants": 1
  },
  "replySubject": "Asunto apropiado del correo o null si es IGNORE",
  "replyBody": "Texto completo y formateado del correo electrónico para el cliente o null si es IGNORE"
}`;

      const userPrompt = `HISTORIAL DE LA CONVERSACIÓN:
${historyFormatted || '(Inicio del hilo)'}

---
DATOS DEL CONTACTO:
Nombre: ${input.contact.name || 'Cliente'}
Email: ${input.contact.email || 'No disponible'}
Teléfono: ${input.contact.phone || 'No facilitado'}
Notas previas: ${input.contact.notes || 'Ninguna'}

ÚLTIMO CORREO ENTRANTE DEL CLIENTE:
Asunto: ${input.latestInbound.subject}
Mensaje:
"${input.latestInbound.body}"`;

      const raw = await this.callOpenRouter(apiKey, model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      const parsed = this.parseJsonSafe(raw);
      if (parsed && parsed.intent) {
        if (parsed.intent === 'IGNORE') {
          return {
            intent: 'IGNORE',
            reasoning: parsed.reasoning || 'Mensaje de empresa o no relacionado con actividades de yoga',
          };
        }
        if (parsed.replyBody) {
          return {
            intent: parsed.intent,
            reasoning: parsed.reasoning || 'Evaluado con IA',
            isUrgent: Boolean(parsed.isUrgent),
            handoffReason: parsed.handoffReason || undefined,
            extractedBooking: parsed.extractedBooking || undefined,
            replySubject:
              parsed.replySubject ||
              (input.latestInbound.subject.startsWith('Re:')
                ? input.latestInbound.subject
                : `Re: ${input.latestInbound.subject}`),
            replyBody: parsed.replyBody,
          };
        }
      }

      this.logger.warn('Failed to parse LLM evaluation JSON. Using heuristic fallback.');
      return this.heuristicFallback(input);
    } catch (err) {
      this.logger.error(`Error in evaluateEmail: ${err}`);
      return this.heuristicFallback(input);
    }
  }

  private parseJsonSafe(text: string): any {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  private heuristicFallback(input: EmailDialogueInput): EmailDialogueEvaluation {
    const text = `${input.latestInbound.subject} ${input.latestInbound.body}`.toLowerCase();
    const name = input.contact.name || 'amig@';
    const email = (input.contact.email || '').toLowerCase();

    // 0. Check for corporate / automated / platform keywords or senders
    const corporateKeywords = [
      'ycloud', 'meta', 'whatsapp business', 'verification code', 'código de verificación',
      'factura', 'invoice', 'hosting', 'dominio', 'dns', 'newsletter', 'unsubscribe',
      'b2b', 'comercial', 'proveedor', 'seguridad', 'password reset', 'coexistence',
    ];
    if (corporateKeywords.some((k) => text.includes(k) || email.includes(k))) {
      return {
        intent: 'IGNORE',
        reasoning: 'Mensaje de empresa, servicio automatizado o plataforma técnica externa.',
      };
    }

    // 1. Check if the message is related to Centro de Yoga Salvadora Conesa activities
    const yogaKeywords = [
      'yoga', 'hatha', 'gong', 'meditaci', 'constelaci', 'gestalt', 'salvadora',
      'clase', 'taller', 'reserva', 'cita', 'horario', 'precio', 'esterilla', 'plaza', 'sesion',
    ];
    const isYogaRelated = yogaKeywords.some((k) => text.includes(k));
    if (!isYogaRelated) {
      return {
        intent: 'IGNORE',
        reasoning: 'El mensaje no trata sobre las actividades de la escuela de yoga de Salvadora Conesa.',
      };
    }

    const isUrgent =
      text.includes('urgente') ||
      text.includes('urgencia') ||
      text.includes('emergencia') ||
      text.includes('grave') ||
      text.includes('crisis') ||
      text.includes('dolor agudo') ||
      text.includes('accidente') ||
      text.includes('hospital');

    const wantsHuman =
      text.includes('salvadora') &&
      (text.includes('hablar') || text.includes('llame') || text.includes('personal') || text.includes('directo')) ||
      text.includes('queja') ||
      text.includes('reclamacion') ||
      text.includes('operacion') ||
      text.includes('embarazada') ||
      text.includes('lesion') ||
      isUrgent;

    if (wantsHuman) {
      return {
        intent: 'HUMAN_HANDOFF',
        reasoning: 'Petición de contacto directo con Salvadora o situación particular detectada.',
        isUrgent,
        handoffReason: 'El cliente solicita atención personalizada o refiere una situación particular.',
        replySubject: input.latestInbound.subject.startsWith('Re:')
          ? input.latestInbound.subject
          : `Re: ${input.latestInbound.subject}`,
        replyBody: `Hola ${name},\n\nMuchas gracias por tu correo. He trasladado tu mensaje directamente a Salvadora para que pueda atenderte de forma personalizada y responderte a la mayor brevedad posible.\n\nSi necesitas cualquier aclaración urgente, puedes también llamarnos o escribirnos por WhatsApp al 695 172 625.\n\nUn cordial saludo,\nCentro de Yoga Salvadora Conesa\nhttps://salvadora.jigretera.com`,
      };
    }

    const isBooking =
      text.includes('reserva') ||
      text.includes('cita') ||
      text.includes('hueco') ||
      text.includes('plaza') ||
      text.includes('apuntar') ||
      text.includes('asistir') ||
      text.includes('clase de prueba');

    if (isBooking) {
      return {
        intent: 'AUTO_BOOKING',
        reasoning: 'Intención de reserva de cita o asistencia a clase identificada.',
        extractedBooking: {
          serviceName: text.includes('gong')
            ? 'Baño de Gong y Meditación Sonora'
            : text.includes('constelacion')
            ? 'Constelaciones Familiares'
            : 'Hatha Yoga Terapéutico',
        },
        replySubject: input.latestInbound.subject.startsWith('Re:')
          ? input.latestInbound.subject
          : `Re: ${input.latestInbound.subject} — Reserva de Plaza`,
        replyBody: `Hola ${name},\n\n¡Estaremos encantados de darte la bienvenida al Centro de Yoga Salvadora Conesa!\n\nPara coordinar tu plaza:\n- Clases de Yoga Terapéutico: Horarios disponibles los Martes y Jueves (mañanas de 10:00 a 11:15 h, o tardes de 18:00 a 19:15 h y 19:30 a 20:45 h).\n- Actividades de fin de semana (Baño de Gong / Talleres): Se celebran en sábado o domingo según programación.\n\nPor favor, respóndenos indicándonos qué horario o turno te viene mejor y te confirmamos de inmediato tu reserva.\n\nUn afectuoso saludo,\nCentro de Yoga Salvadora Conesa\nTeléfono: 695 172 625\nhttps://salvadora.jigretera.com`,
      };
    }

    return {
      intent: 'AUTO_INFO',
      reasoning: 'Consulta informativa general.',
      replySubject: input.latestInbound.subject.startsWith('Re:')
        ? input.latestInbound.subject
        : `Re: ${input.latestInbound.subject}`,
      replyBody: `Hola ${name},\n\nMuchas gracias por contactar con el Centro de Yoga Salvadora Conesa.\n\nHemos recibido tu mensaje y estamos a tu entera disposición para resolver cualquier duda sobre nuestras actividades, clases de Hatha Yoga Terapéutico, Baños de Gong y talleres.\n\nFacilitamos en la sala todo el material necesario (esterillas, mantas y cojines). Si deseas probar una clase o conocer disponibilidad, estamos a tu disposición en este correo o en el teléfono 695 172 625.\n\nUn cordial saludo,\nCentro de Yoga Salvadora Conesa\nhttps://salvadora.jigretera.com`,
    };
  }

  private async callOpenRouter(
    apiKey: string,
    model: string,
    messages: Array<{ role: 'system' | 'user'; content: string }>,
  ): Promise<string> {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://crm-salvadoraconesa.jigretera.com',
        'X-Title': 'CRM Salvadora',
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-4.1-mini',
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`OpenRouter status ${res.status}: ${err}`);
    }
    const json = (await res.json()) as any;
    return json?.choices?.[0]?.message?.content ?? '';
  }
}
