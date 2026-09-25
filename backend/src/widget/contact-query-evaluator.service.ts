import { Injectable, Logger } from '@nestjs/common';
import { AgentsConfigService } from '../agents/agents-config.service';
import { ServicesService } from '../services/services.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { OpenRouterService } from '../agents/openrouter.service';

export interface ContactQueryInput {
  name: string;
  email: string;
  phone?: string;
  serviceName?: string;
  serviceId?: string;
  message: string;
  requestType?: 'consulta' | 'reserva';
}

export interface EvaluatedContactQuery {
  isBusinessOpportunity: boolean;
  qualificationLevel: 'ALTA' | 'MEDIA' | 'BAJA';
  summary: string;
  reasoning: string;
  recommendedAction: string;
  suggestedDraftEmail: {
    subject: string;
    body: string;
  };
  acknowledgementEmail: {
    subject: string;
    body: string;
  };
  tags: string[];
}

@Injectable()
export class ContactQueryEvaluatorService {
  private readonly logger = new Logger(ContactQueryEvaluatorService.name);

  constructor(
    private readonly agentsConfigService: AgentsConfigService,
    private readonly servicesService: ServicesService,
    private readonly knowledgeService: KnowledgeService,
    private readonly openRouterService: OpenRouterService,
  ) {}

  /**
   * Intelligently evaluates an inbound query/reservation request from the web form.
   * If it's a trivial / informational FAQ question, the AI generates a ready-to-send answer.
   * If it's a business opportunity or reservation, the AI qualifies its priority and prepares
   * a commercial closing / reservation response draft ready for operator review and 1-click send.
   */
  async evaluateQuery(input: ContactQueryInput): Promise<EvaluatedContactQuery> {
    try {
      const config =
        (await this.agentsConfigService.findByKeyOrNull('booking').catch(() => null)) ||
        ((await this.agentsConfigService.findAll().catch(() => []))?.[0] as any);

      const apiKey =
        config?.openrouterApiKey && config.openrouterApiKey !== 'sk-or-placeholder'
          ? config.openrouterApiKey
          : process.env.OPENROUTER_API_KEY || '';

      const model = config?.model || process.env.AGENT_MODEL || 'openai/gpt-4.1-mini';

      if (!apiKey) {
        this.logger.warn('No OpenRouter API key available. Falling back to heuristic rule-based evaluator.');
        return this.fallbackEvaluation(input);
      }

      // Gather live center services
      const dbServices = await this.servicesService.findAll(true).catch(() => []);
      const servicesCatalog = dbServices
        .map(
          (s) =>
            `- Servicio: ${s.name}\n  Precio: ${s.price ? `${s.price} €` : 'Consultar'}\n  Horario/Fechas: ${
              s.scheduleText || s.eventDatesText || 'Consultar programación'
            }\n  Modalidad: ${s.allowedModalities?.join(', ') || 'presencial'}\n  Descripción: ${
              s.description || 'Sin descripción adicional'
            }`,
        )
        .join('\n\n');

      // Gather knowledge base context if available
      const kbContext = await this.knowledgeService
        .resolveForMessage('booking', `${input.serviceName || ''} ${input.message}`, 2000)
        .then((res) => res.text)
        .catch(() => '');

      const systemPrompt = `Eres el Coordinador Senior de Admisiones y Triaje Inteligente del "Centro de Yoga y Bienestar Salvadora Conesa" en Fuenlabrada (Madrid).
Profesora principal y fundadora: Salvadora Conesa (Hatha Yoga Terapéutico, Baños de Gong, Meditación, Retiros).
Terapeuta y profesor colaborador: José Ignacio Gómez Raya (Terapia Gestalt, Talleres).
Teléfono de contacto directo: 695 172 625.
Web: https://salvadora.jigretera.com
Email oficial: salvadoraconesa@salvadoraconesa.es

Tu tarea es evaluar la solicitud enviada por un usuario desde el formulario web y clasificarla:

1. SI ES UNA CONSULTA TRIVIAL O INFORMATIVA (preguntas sobre horarios, precios de clases, qué ropa llevar, dudas sobre si hay esterillas, ubicación del centro en Fuenlabrada, dudas generales sobre qué es el yoga terapéutico, etc., sin una petición explícita de reserva ni intención de compra inmediata):
   - "isBusinessOpportunity": false
   - "qualificationLevel": "BAJA"
   - "summary": Resumen breve de la duda en 1 frase.
   - "reasoning": "Consulta informativa estándar sobre horarios, precios o material."
   - "recommendedAction": "Consulta informativa. Revisar el borrador generado por la IA y enviar con un clic."
   - "suggestedDraftEmail": Objeto con { "subject": string, "body": string }. Redacta un correo completo, sumamente amable, profesional y cálido respondiendo con total exactitud a las preguntas del usuario, usando el catálogo de servicios y datos del centro. Termina con una cordial invitación a probar una clase o contactar por WhatsApp/teléfono al 695 172 625.
   - "acknowledgementEmail": Objeto con { "subject": string, "body": string }. Acuse de recibo cordial indicando que su consulta está registrada.

2. SI ES UNA OPORTUNIDAD DE NEGOCIO O SOLICITUD DE RESERVA (el usuario quiere reservar plaza, inscribirse, asistir a un evento con plazas limitadas como Baño de Gong, Retiro de Ayuno, Encuentro de Mujeres, Consulta Individual de Gestalt, o pide explícitamente que le llamen o confirma que quiere empezar):
   - "isBusinessOpportunity": true
   - "qualificationLevel":
     * "ALTA": Pide plaza formal, indica fechas, viene en grupo, o deja su teléfono pidiendo confirmación o llamada rápida.
     * "MEDIA": Muestra interés claro en inscribirse a un curso o retiro pero tiene alguna consulta de fechas o condiciones antes de cerrar.
   - "summary": Resumen ejecutivo de la oportunidad en 1 frase para el equipo.
   - "reasoning": Justificación clara de por qué es una oportunidad de negocio y su grado de madurez comercial.
   - "recommendedAction": Recomendación concreta para el equipo humano (ej: "Confirmar la plaza y enviar las indicaciones prácticas").
   - "suggestedDraftEmail": Objeto con { "subject": string, "body": string }. Redacta un correo de respuesta muy cuidado y formal confirmando la disponibilidad, agradeciendo su confianza, explicando los pasos para asegurar la plaza (o fianza si corresponde), y facilitando el teléfono 695 172 625 por si desea asistencia inmediata.
   - "acknowledgementEmail": Objeto con { "subject": string, "body": string }. Acuse de recibo confirmando que su solicitud de reserva ha sido recibida y que el equipo del centro se pondrá en contacto a la mayor brevedad.

CATÁLOGO ACTUAL DE SERVICIOS EN EL CENTRO:
${servicesCatalog}

${kbContext ? `INFORMACIÓN ADICIONAL DE LA BASE DE CONOCIMIENTO:\n${kbContext}\n` : ''}

RESPONDE EXCLUSIVAMENTE UN OBJETO JSON VÁLIDO CON LA SIGUIENTE ESTRUCTURA (SIN TEXTO EXTRA):
{
  "isBusinessOpportunity": boolean,
  "qualificationLevel": "ALTA" | "MEDIA" | "BAJA",
  "summary": string,
  "reasoning": string,
  "recommendedAction": string,
  "suggestedDraftEmail": { "subject": string, "body": string },
  "acknowledgementEmail": { "subject": string, "body": string }
}`;

      const userContent = `DATOS DE LA PETICIÓN DEL CLIENTE:
- Nombre: ${input.name}
- Email: ${input.email}
- Teléfono: ${input.phone || 'No facilitado'}
- Servicio seleccionado: ${input.serviceName || 'Consulta General'}
- Tipo de formulario: ${input.requestType === 'reserva' ? 'Solicitar Reserva de Plaza' : 'Duda / Consulta'}
- Mensaje del cliente:
"${input.message}"`;

      const rawResponse = await this.openRouterService.createChatCompletion(
        apiKey,
        model,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        { jsonMode: true, temperature: 0.2 },
      );

      const parsed = this.parseJsonResponse(rawResponse);
      if (parsed) {
        const isOpp = !!parsed.isBusinessOpportunity;
        const qLevel = parsed.qualificationLevel || (isOpp ? 'ALTA' : 'BAJA');
        const tags = isOpp
          ? ['oportunidad_negocio', `prioridad_${qLevel.toLowerCase()}`, 'lead_web_reserva']
          : ['consulta_resuelta_ia', 'lead_web_consulta'];

        const fallbackDraft = isOpp
          ? {
              subject: `Confirmación de solicitud de plaza para ${input.serviceName || 'actividades'} — Escuela de Yoga Salvadora Conesa`,
              body: `Hola ${input.name},\n\nMuchas gracias por tu interés en ${input.serviceName || 'nuestras clases'} en la Escuela de Yoga Salvadora Conesa.\n\nHemos recibido tu petición y estaremos encantados de darte la bienvenida. Nos ponemos en contacto contigo para coordinar tu plaza y resolver cualquier duda.\n\nPuedes también contactarnos directamente al 695 172 625 si precisas confirmación inmediata.\n\nUn cordial saludo,\nEquipo de la Escuela de Yoga Salvadora Conesa\nhttps://salvadora.jigretera.com`,
            }
          : {
              subject: `Respuesta a tu consulta sobre ${input.serviceName || 'nuestras actividades'} — Escuela de Yoga Salvadora Conesa`,
              body: `Hola ${input.name},\n\nMuchas gracias por contactar con la Escuela de Yoga Salvadora Conesa.\n\nEn relación a tu consulta sobre "${input.serviceName || 'nuestras clases'}": facilitamos esterillas y todo el material necesario en sala. Si deseas probar una clase o conocer los horarios disponibles, estaremos encantados de atenderte en el 695 172 625.\n\nUn cordial saludo,\nEquipo de la Escuela de Yoga Salvadora Conesa\nhttps://salvadora.jigretera.com`,
            };

        return {
          isBusinessOpportunity: isOpp,
          qualificationLevel: qLevel,
          summary: parsed.summary || (isOpp ? 'Oportunidad de reserva' : 'Consulta informativa'),
          reasoning: parsed.reasoning || '',
          recommendedAction: parsed.recommendedAction || '',
          suggestedDraftEmail: parsed.suggestedDraftEmail || parsed.autoReplyEmail || fallbackDraft,
          acknowledgementEmail: parsed.acknowledgementEmail || {
            subject: isOpp
              ? 'Hemos recibido tu solicitud de reserva — Centro de Yoga Salvadora Conesa'
              : 'Hemos recibido tu consulta — Centro de Yoga Salvadora Conesa',
            body: `Hola ${input.name},\n\nHemos recibido tu mensaje sobre ${input.serviceName || 'nuestros servicios'}. Nos pondremos en contacto contigo a la mayor brevedad.\n\nUn cordial saludo,\nCentro de Yoga Salvadora Conesa`,
          },
          tags,
        };
      }

      this.logger.warn('Failed to parse AI response as JSON. Falling back to heuristic evaluation.');
      return this.fallbackEvaluation(input);
    } catch (err) {
      this.logger.error(`Error during AI evaluation of contact query: ${err}`);
      return this.fallbackEvaluation(input);
    }
  }

  private parseJsonResponse(raw: string): any {
    try {
      return JSON.parse(raw.trim());
    } catch {
      // Try stripping markdown blocks if model returned ```json ... ```
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1].trim());
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private fallbackEvaluation(input: ContactQueryInput): EvaluatedContactQuery {
    const isExplicitReserva = input.requestType === 'reserva';
    const textLower = (input.message + ' ' + (input.serviceName || '')).toLowerCase();
    const hasReservaKeywords = /(reserva|plaza|apuntar|inscribir|asistir|comprar|fianza|coste del retiro|llamadme|llámame|precio de la sesión|consulta individual)/i.test(
      textLower,
    );
    const isRetiroOrSpecial = /(ayuno|retiro|gong|puja|mujeres|gestalt)/i.test(textLower);

    const isOpportunity = isExplicitReserva || hasReservaKeywords || isRetiroOrSpecial;
    const qualificationLevel = isOpportunity ? (input.phone || isExplicitReserva ? 'ALTA' : 'MEDIA') : 'BAJA';

    if (isOpportunity) {
      return {
        isBusinessOpportunity: true,
        qualificationLevel,
        summary: `Solicitud de reserva / plaza para ${input.serviceName || 'actividades del centro'}.`,
        reasoning: `El usuario solicita plaza formalmente o muestra interés directo en actividades con cupo limitado.`,
        recommendedAction: input.phone
          ? `Llamar o contactar por WhatsApp al ${input.phone} para confirmar plaza y disponibilidad.`
          : `Responder por email para coordinar la reserva y confirmar plaza.`,
        suggestedDraftEmail: {
          subject: `Confirmación de solicitud de plaza para ${input.serviceName || 'actividades'} — Escuela de Yoga Salvadora Conesa`,
          body: `Hola ${input.name},\n\nMuchas gracias por tu interés en reservar tu plaza para ${input.serviceName || 'nuestras actividades'} en la Escuela de Yoga Salvadora Conesa.\n\nHemos recibido correctamente tu solicitud. Para confirmar y formalizar tu plaza, por favor indícanos si prefieres que te llamemos por teléfono o coordinarlo por este medio.\n\nTambién puedes llamarnos o escribirnos por WhatsApp al 695 172 625 para una confirmación inmediata.\n\nUn cordial saludo,\nEquipo de la Escuela de Yoga Salvadora Conesa\nTeléfono: 695 172 625\nhttps://salvadora.jigretera.com`,
        },
        acknowledgementEmail: {
          subject: `Hemos recibido tu solicitud de reserva — Centro de Yoga Salvadora Conesa`,
          body: `Hola ${input.name},\n\nGracias por solicitar tu reserva de plaza con la Escuela de Yoga Salvadora Conesa.\n\nHemos registrado tu solicitud para "${input.serviceName || 'nuestras actividades'}":\n\n"${input.message}"\n\nNos pondremos en contacto contigo a la mayor brevedad posible para confirmarte los detalles de tu plaza y resolver cualquier duda.\n\nUn cordial saludo,\nEquipo de la Escuela de Yoga de Salvadora Conesa\nTeléfono: 695 172 625\nhttps://salvadora.jigretera.com`,
        },
        tags: ['oportunidad_negocio', `prioridad_${qualificationLevel.toLowerCase()}`, 'lead_web_reserva'],
      };
    }

    return {
      isBusinessOpportunity: false,
      qualificationLevel: 'BAJA',
      summary: `Consulta informativa sobre ${input.serviceName || 'el centro'}.`,
      reasoning: `Pregunta general sin solicitud de reserva explícita.`,
      recommendedAction: `Consulta informativa registrada en el CRM. Revisar y enviar respuesta por email.`,
      suggestedDraftEmail: {
        subject: `Información sobre tu consulta — Centro de Yoga Salvadora Conesa`,
        body: `Hola ${input.name},\n\nMuchas gracias por ponerte en contacto con la Escuela de Yoga Salvadora Conesa.\n\nHemos recibido tu consulta sobre "${input.serviceName || 'nuestras clases y actividades'}":\n\n"${input.message}"\n\nEn nuestro centro de Fuenlabrada facilitamos esterillas y todo el material necesario de sala. Te recomendamos acudir con ropa cómoda para disfrutar plenamente de la sesión. Si deseas consultar horarios exactos o visitarnos, puedes responder a este correo o llamarnos al 695 172 625.\n\nUn cordial saludo,\nEquipo de la Escuela de Yoga de Salvadora Conesa\nhttps://salvadora.jigretera.com`,
      },
      acknowledgementEmail: {
        subject: `Hemos recibido tu consulta — Centro de Yoga Salvadora Conesa`,
        body: `Hola ${input.name},\n\nHemos recibido tu consulta y te responderemos a la mayor brevedad.\n\nUn cordial saludo,\nEscuela de Yoga Salvadora Conesa`,
      },
      tags: ['consulta_resuelta_ia', 'lead_web_consulta'],
    };
  }
}
