import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual, In, Between } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Contact, ContactStatus } from '../common/entities/contact.entity';
import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';
import { Service } from '../common/entities/service.entity';
import { Call, CallDirection, CallStatus } from '../common/entities/call.entity';
import { AgentConfig, WorkingHourSlot } from '../common/entities/agent-config.entity';
import { AppSettings } from '../common/entities/app-settings.entity';
import { VapiAccount } from '../common/entities/vapi-account.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { ContactsService } from '../contacts/contacts.service';
import { normalizePhoneLoose } from '../common/phone';
import {
  VapiWebhookMessage,
  VapiToolCallItem,
  VapiToolResponseResult,
  VapiWebhookResponse,
} from './vapi.types';
import { format, parseISO, isValid, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { TZDate } from '@date-fns/tz';

export interface ToolExecutionContext {
  callerNumber: string | null;
  vapiCallId: string | null;
  direction: 'inbound' | 'outbound';
  timezone: string;
}

export interface OfficialServiceConfig {
  id: string;
  name: string;
  aliases: RegExp;
  category: 'recurring_schedule' | 'fixed_event' | 'individual_flexible';
  scheduleSummary: string;
  timetable?: Record<number, string[]>; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun -> HH:mm[]
  eventDate?: Date;
  eventDateIso?: string;
  eventSpokenDate?: string;
  durationMinutes: number;
  maxCapacity: number;
  requiresApproval?: boolean;
  priceInfo: string;
}

export const OFFICIAL_SERVICES: OfficialServiceConfig[] = [
  {
    id: 'hatha-yoga',
    name: 'Hatha Yoga Terapéutico',
    aliases: /hatha|yoga.*terap/i,
    category: 'recurring_schedule',
    scheduleSummary: 'martes (9:45, 11:15, 17:00, 18:30 y 20:00), miércoles (20:15) y jueves (9:45, 11:15, 16:30, 17:30 y 19:00)',
    timetable: {
      2: ['09:45', '11:15', '17:00', '18:30', '20:00'], // Martes
      3: ['20:15'],                                     // Miércoles
      4: ['09:45', '11:15', '16:30', '17:30', '19:00'], // Jueves
    },
    durationMinutes: 90,
    maxCapacity: 20,
    priceInfo: '1 clase semanal (25€/mes) o 2 clases semanales (42€/mes)',
  },
  {
    id: 'meditacion',
    name: 'Meditaciones Guiadas',
    aliases: /meditaci/i,
    category: 'recurring_schedule',
    scheduleSummary: 'martes y jueves de 09:15 a 09:45',
    timetable: {
      2: ['09:15'],
      4: ['09:15'],
    },
    durationMinutes: 30,
    maxCapacity: 28,
    priceInfo: '15€/mes (Gratuito para alumnos de Yoga)',
  },
  {
    id: 'iaido',
    name: 'Iaidō (Esgrima Japonesa Tradicional)',
    aliases: /iaido|iaidō|esgrima/i,
    category: 'recurring_schedule',
    scheduleSummary: 'lunes de 20:00 a 21:00 y jueves de 20:30 a 22:00',
    timetable: {
      1: ['20:00'],
      4: ['20:30'],
    },
    durationMinutes: 60,
    maxCapacity: 15,
    priceInfo: 'Primera clase de prueba GRATIS',
  },
  {
    id: 'gestalt',
    name: 'Terapia Gestalt (Sesión Individual)',
    aliases: /gestalt/i,
    category: 'individual_flexible',
    scheduleSummary: 'lunes a viernes de 09:00 a 20:00 según disponibilidad',
    durationMinutes: 60,
    maxCapacity: 1,
    requiresApproval: true,
    priceInfo: '35€ por sesión de 1 hora. Requiere aprobación de Jose Ignacio Gomez Raya',
  },
  {
    id: 'bienestar-experience',
    name: 'Bienestar Experience (Sesión Individual)',
    aliases: /bienestar.*exp/i,
    category: 'individual_flexible',
    scheduleSummary: 'lunes a viernes de 09:00 a 20:00 según disponibilidad',
    durationMinutes: 60,
    maxCapacity: 1,
    requiresApproval: true,
    priceInfo: '25€ por sesión de 1 hora. Requiere aprobación de Jose Ignacio Gomez Raya',
  },
  {
    id: 'constelaciones',
    name: 'Constelaciones Familiares',
    aliases: /constelaci/i,
    category: 'fixed_event',
    scheduleSummary: 'domingo 27 de septiembre de 2026 de 10:00 a 14:00',
    eventDate: new Date('2026-09-27T08:00:00.000Z'),
    eventDateIso: '2026-09-27T08:00:00.000Z',
    eventSpokenDate: 'domingo 27 de septiembre de 2026 de 10:00 a 14:00',
    durationMinutes: 240,
    maxCapacity: 20,
    priceInfo: 'Constelar asunto propio (60€) o Participar como representante (20€)',
  },
  {
    id: 'bano-gong',
    name: 'Baño de Gong y Meditación Sonora',
    aliases: /baño.*gong|gong.*sonora/i,
    category: 'fixed_event',
    scheduleSummary: 'sábado 26 de septiembre de 2026 de 18:00 a 20:00',
    eventDate: new Date('2026-09-26T16:00:00.000Z'),
    eventDateIso: '2026-09-26T16:00:00.000Z',
    eventSpokenDate: 'sábado 26 de septiembre de 2026 de 18:00 a 20:00',
    durationMinutes: 120,
    maxCapacity: 30,
    priceInfo: '16€ por persona',
  },
  {
    id: 'puja-gong',
    name: 'Puja de Gongs (Noche Sagrada de Sonido - 11h)',
    aliases: /puja/i,
    category: 'fixed_event',
    scheduleSummary: 'sábado 28 de noviembre de 2026 de 21:00 a 08:00 del domingo',
    eventDate: new Date('2026-11-28T20:00:00.000Z'),
    eventDateIso: '2026-11-28T20:00:00.000Z',
    eventSpokenDate: 'sábado 28 de noviembre de 2026 de 21:00 a 08:00 del domingo',
    durationMinutes: 660,
    maxCapacity: 30,
    priceInfo: '95€ (90€-100€ según asistentes)',
  },
  {
    id: 'retiro',
    name: 'Retiro de Ayuno Terapéutico y Senderismo Consciente',
    aliases: /retiro|ayuno/i,
    category: 'fixed_event',
    scheduleSummary: 'puente de octubre, del 9 al 12 de octubre de 2026',
    eventDate: new Date('2026-10-09T08:00:00.000Z'),
    eventDateIso: '2026-10-09T08:00:00.000Z',
    eventSpokenDate: 'puente de octubre, del 9 al 12 de octubre de 2026',
    durationMinutes: 4320,
    maxCapacity: 15,
    priceInfo: '180€',
  },
  {
    id: 'encuentro-mujeres',
    name: 'Encuentro de Mujeres (Primavera)',
    aliases: /encuentro.*mujer/i,
    category: 'fixed_event',
    scheduleSummary: 'sábado 15 de mayo de 2027 de 10:00 a 16:00',
    eventDate: new Date('2027-05-15T08:00:00.000Z'),
    eventDateIso: '2027-05-15T08:00:00.000Z',
    eventSpokenDate: 'sábado 15 de mayo de 2027 de 10:00 a 16:00',
    durationMinutes: 360,
    maxCapacity: 25,
    priceInfo: '45€',
  },
];

export function findOfficialService(query?: string): OfficialServiceConfig | null {
  if (!query) return null;
  const q = query.trim();
  return OFFICIAL_SERVICES.find((s) => s.aliases.test(q) || s.name.toLowerCase().includes(q.toLowerCase())) || null;
}

@Injectable()
export class VapiWebhookService {
  private readonly logger = new Logger(VapiWebhookService.name);

  constructor(
    @InjectRepository(Call)
    private readonly callsRepo: Repository<Call>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    @InjectRepository(AgentConfig)
    private readonly agentConfigRepo: Repository<AgentConfig>,
    @InjectRepository(AppSettings)
    private readonly settingsRepo: Repository<AppSettings>,
    @InjectRepository(VapiAccount)
    private readonly vapiAccountRepo: Repository<VapiAccount>,
    private readonly appointmentsService: AppointmentsService,
    private readonly contactsService: ContactsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Main Webhook Event Dispatcher
   */
  async handleWebhook(body: VapiWebhookMessage): Promise<VapiWebhookResponse> {
    const rawMessage = (body as any).message || body;
    const eventType =
      body.type ||
      (body.message as any)?.type ||
      (rawMessage as any)?.type ||
      ((body as any).toolCalls || (body as any).toolCallList || (body as any).message?.toolCalls || (body as any).message?.toolCallList ? 'tool-calls' : 'unknown');

    const vapiCallId =
      body.call?.id ||
      (body.message as any)?.call?.id ||
      (rawMessage as any)?.call?.id ||
      (body as any).callId ||
      null;

    const rawCallerNumber =
      body.call?.customer?.number ||
      (body.message as any)?.call?.customer?.number ||
      (rawMessage as any)?.call?.customer?.number ||
      body.customer?.number ||
      (rawMessage as any)?.customer?.number ||
      null;

    const callerNumber = rawCallerNumber ? normalizePhoneLoose(rawCallerNumber) : null;
    const callType = body.call?.type || (body.message as any)?.call?.type || (rawMessage as any)?.call?.type;
    const direction = callType === 'outboundPhoneCall' ? ('outbound' as const) : ('inbound' as const);

    const [agent] = await this.agentConfigRepo.find({ take: 1 });
    const timezone = agent?.timezone || 'Europe/Madrid';

    const ctx: ToolExecutionContext = {
      callerNumber,
      vapiCallId,
      direction,
      timezone,
    };

    // Ensure Call row exists
    if (vapiCallId) {
      await this.ensureCallRow(vapiCallId, direction, callerNumber);
    }

    if (eventType === 'tool-calls' || eventType === 'tool-call') {
      const toolCalls =
        (body as any).toolCalls ||
        (body as any).toolCallList ||
        (body as any).message?.toolCalls ||
        (body as any).message?.toolCallList ||
        (rawMessage as any).toolCalls ||
        (rawMessage as any).toolCallList ||
        [];

      const results: VapiToolResponseResult[] = [];

      for (const tc of toolCalls) {
        const tcId = tc.id || (tc as any).toolCallId || (tc as any).callId || 'unknown_tool_call';
        const resultText = await this.executeToolCall(tc, ctx);
        results.push({
          toolCallId: tcId,
          result: typeof resultText === 'string' ? resultText : JSON.stringify(resultText),
        });
      }

      this.logger.log(`Returning ${results.length} tool call results for VAPI call ${vapiCallId || 'n/a'}`);
      return { results };
    }

    if (eventType === 'end-of-call-report') {
      await this.handleEndOfCallReport(rawMessage);
      return {};
    }

    if (eventType === 'status-update') {
      await this.handleStatusUpdate(rawMessage);
      return {};
    }

    return {};
  }

  private async ensureCallRow(vapiCallId: string, direction: 'inbound' | 'outbound', fromNumber: string | null): Promise<Call | null> {
    try {
      let call = await this.callsRepo.findOne({ where: { vapiCallId } });
      if (!call) {
        let contactId: string | null = null;
        if (fromNumber) {
          const contact = await this.contactsRepo.findOne({ where: { phone: fromNumber } });
          if (contact) contactId = contact.id;
        }
        call = this.callsRepo.create({
          vapiCallId,
          direction: direction === 'outbound' ? CallDirection.OUTBOUND : CallDirection.INBOUND,
          fromNumber,
          status: CallStatus.IN_PROGRESS,
          contactId,
          startedAt: new Date(),
        });
        return await this.callsRepo.save(call);
      }
      return call;
    } catch (err: any) {
      this.logger.warn(`Could not ensure Call row for ${vapiCallId}: ${err?.message || err}`);
      return null;
    }
  }

  private async executeToolCall(tc: any, ctx: ToolExecutionContext): Promise<string> {
    const name =
      tc?.function?.name ||
      tc?.name ||
      tc?.functionName ||
      tc?.tool?.name ||
      '';

    let params: Record<string, any> = {};

    try {
      const rawArgs = tc?.function?.arguments !== undefined ? tc.function.arguments : tc?.arguments;
      if (typeof rawArgs === 'string') {
        params = JSON.parse(rawArgs);
      } else if (rawArgs && typeof rawArgs === 'object') {
        params = rawArgs;
      }
    } catch {
      params = {};
    }

    this.logger.log(`Executing VAPI Tool: [${name}] with params: ${JSON.stringify(params)} for caller: ${ctx.callerNumber}`);

    try {
      switch (name) {
        case 'identificar_llamante':
          return await this.toolIdentificarLlamante(ctx);
        case 'consultar_huecos':
          return await this.toolConsultarHuecos(params, ctx);
        case 'reservar_cita':
          return await this.toolReservarCita(params, ctx);
        case 'reprogramar_cita':
          return await this.toolReprogramarCita(params, ctx);
        case 'anular_cita':
          return await this.toolAnularCita(params, ctx);
        case 'datos_del_negocio':
          return await this.toolDatosDelNegocio(params, ctx);
        case 'registrar_handoff':
          return await this.toolRegistrarHandoff(params, ctx);
        default:
          this.logger.warn(`Unknown VAPI Tool: ${name}`);
          return `Herramienta «${name}» procesada correctamente.`;
      }
    } catch (err: any) {
      this.logger.error(`Error en herramienta ${name}: ${err?.message || err}`, err?.stack);
      return 'He consultado la agenda y en este momento no puedo confirmar el hueco exacto. ¿Prefieres que te llamemos nosotros o consultar otra hora?';
    }
  }

  private formatSpokenDate(
    d: Date | string,
    timezone: string,
    pattern = "EEEE d 'de' MMMM 'a las' HH:mm",
  ): string {
    const rawDate = d instanceof Date ? d : parseISO(d as string);
    const zoned = new TZDate(rawDate.getTime(), timezone);
    return format(zoned, pattern, { locale: es });
  }

  // ─── 1. IDENTIFICAR LLAMANTE ───
  private async toolIdentificarLlamante(ctx: ToolExecutionContext): Promise<string> {
    if (!ctx.callerNumber) {
      return 'El cliente no tiene ficha previa (llamada nueva). Trátalo con calidez como cliente nuevo y pídele su nombre cuando vaya a reservar.';
    }

    const contact = await this.contactsRepo.findOne({ where: { phone: ctx.callerNumber } });
    if (!contact) {
      return 'Este número no consta en la base de datos. Es un cliente nuevo: pregúntale su nombre amablemente cuando vaya a reservar.';
    }

    const firstName = contact.name.split(' ')[0] || contact.name;
    const parts = [`El cliente registrado es ${contact.name}. Salúdale cordialmente por su nombre (${firstName}).`];

    // Check next upcoming scheduled appointment
    const nextAppt = await this.appointmentsRepo.findOne({
      where: {
        contactId: contact.id,
        status: AppointmentStatus.SCHEDULED,
        startsAt: MoreThan(new Date()),
      },
      order: { startsAt: 'ASC' },
    });

    if (nextAppt) {
      const official = findOfficialService(nextAppt.service);
      let isValidAppt = true;
      if (official?.category === 'recurring_schedule' && official.timetable) {
        const zoned = new TZDate(new Date(nextAppt.startsAt).getTime(), ctx.timezone);
        isValidAppt = official.timetable[zoned.getDay()]?.includes(format(zoned, 'HH:mm')) ?? false;
      }
      if (isValidAppt) {
        const formattedDate = this.formatSpokenDate(nextAppt.startsAt, ctx.timezone);
        parts.push(`Tiene una cita de «${nextAppt.service}» programada para el ${formattedDate}.`);
      } else {
        parts.push('No tiene citas oficiales próximas programadas.');
      }
    } else {
      parts.push('No tiene citas próximas programadas.');
    }

    return parts.join(' ');
  }

  // ─── 2. CONSULTAR HUECOS ───
  private async toolConsultarHuecos(params: any, ctx: ToolExecutionContext): Promise<string> {
    const [agent] = await this.agentConfigRepo.find({ take: 1 });
    const workingHours: WorkingHourSlot[] =
      agent?.workingHours && agent.workingHours.length > 0
        ? agent.workingHours
        : [
            { day: 1, open: '09:00', close: '21:00' },
            { day: 2, open: '09:00', close: '21:00' },
            { day: 3, open: '09:00', close: '21:00' },
            { day: 4, open: '09:00', close: '21:00' },
            { day: 5, open: '09:00', close: '21:00' },
            { day: 6, open: '09:00', close: '15:00' },
          ];

    const requestedService = (params?.servicio || params?.service || params?.clase || 'Hatha Yoga Terapéutico').toString().trim();
    const officialSvc = findOfficialService(requestedService);

    const rawFecha = (params?.fechaPreferida || params?.fecha || params?.date || '').toString().toLowerCase().trim();
    const rawHora = (params?.horaPreferida || params?.hora || params?.time || '').toString().toLowerCase().trim();

    // 1. TALLERES Y EVENTOS CON FECHA FIJA (Constelaciones, Gong, Puja, Retiro, Encuentro)
    if (officialSvc?.category === 'fixed_event') {
      const isDifferentDate =
        rawFecha &&
        !rawFecha.includes('27') &&
        !rawFecha.includes('26') &&
        !rawFecha.includes('28') &&
        !rawFecha.includes('septiembre') &&
        !rawFecha.includes('noviembre') &&
        !rawFecha.includes('octubre') &&
        !rawFecha.includes('mayo') &&
        (rawFecha.includes('hoy') ||
          rawFecha.includes('tarde') ||
          rawFecha.includes('mañana') ||
          rawFecha.includes('manana') ||
          rawFecha.includes('lunes') ||
          rawFecha.includes('martes') ||
          rawFecha.includes('miercoles') ||
          rawFecha.includes('miércoles') ||
          rawFecha.includes('jueves') ||
          rawFecha.includes('viernes') ||
          rawFecha.includes('sabado') ||
          rawFecha.includes('sábado') ||
          rawFecha.includes('domingo'));

      if (isDifferentDate) {
        return `En el calendario oficial no hay sesiones de «${officialSvc.name}» para esa fecha. Es un evento exclusivo con fecha fijada en el calendario: se celebra el ${officialSvc.eventSpokenDate} [${officialSvc.eventDateIso}]. ${officialSvc.priceInfo}. Explícaselo al cliente y ofrécele reservar su plaza para ese día.`;
      }

      return `El calendario oficial para «${officialSvc.name}» es el ${officialSvc.eventSpokenDate} [${officialSvc.eventDateIso}]. Hay disponibilidad de plazas. ${officialSvc.priceInfo}. Ofrece la fecha oficial al cliente para formalizar su plaza.`;
    }

    // 2. SESIONES INDIVIDUALES (Gestalt, Bienestar)
    if (officialSvc?.category === 'individual_flexible') {
      return `El calendario oficial para «${officialSvc.name}» es de lunes a viernes entre las 09:00 y las 20:00 según disponibilidad. ${officialSvc.priceInfo}. Al solicitarla queda registrada pendiente de aprobación del terapeuta Jose Ignacio Gomez Raya. Pregúntale qué día y hora le vendría bien para tramitar la solicitud de cita.`;
    }

    // 3. CLASES RECURRENTES CON HORARIOS OFICIALES ESTRICTOS (Hatha Yoga, Meditaciones, Iaido)
    const timetable = officialSvc?.timetable || {
      2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
      3: ['20:15'],
      4: ['09:45', '11:15', '16:30', '17:30', '19:00'],
    };
    const svcName = officialSvc?.name || requestedService;
    const scheduleSummary = officialSvc?.scheduleSummary || 'martes (9:45, 11:15, 17:00, 18:30 y 20:00), miércoles (20:15) y jueves (9:45, 11:15, 16:30, 17:30 y 19:00)';
    const durationMinutes = officialSvc?.durationMinutes || 90;

    const weekdayMap: Record<string, number> = {
      domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6
    };

    // Si el cliente pide un día que no existe en el calendario oficial de esa clase
    for (const [wName, wDay] of Object.entries(weekdayMap)) {
      if (rawFecha.includes(wName) && (!timetable[wDay] || timetable[wDay].length === 0)) {
        return `En el calendario oficial no hay clases de «${svcName}» los ${wName}s. Los únicos horarios oficiales del calendario son: ${scheduleSummary}. Indícale amablemente este calendario al cliente y pregúntale cuál de estos turnos prefiere.`;
      }
    }

    // Si el cliente pide una hora concreta
    let targetHourNorm: string | null = null;
    if (rawHora) {
      const match = rawHora.match(/(\d{1,2})(?::(\d{2}))?/);
      if (match) {
        const h = parseInt(match[1], 10);
        const m = match[2] ? match[2] : '00';
        const isTarde = rawHora.includes('tarde') || rawHora.includes('pm');
        const finalH = isTarde && h < 12 ? h + 12 : h;
        targetHourNorm = `${finalH.toString().padStart(2, '0')}:${m}`;

        const allOfficialHours = Object.values(timetable).flat();
        if (!allOfficialHours.includes(targetHourNorm)) {
          return `Ese horario de las ${rawHora} no existe en el calendario oficial de «${svcName}». Los turnos oficiales del calendario son: ${scheduleSummary}. Por favor, indica estos turnos oficiales al cliente para que elija uno.`;
        }
      }
    }

    const now = new Date();
    let startDate = now;

    if (rawFecha) {
      if (rawFecha.includes('hoy') || rawFecha.includes('esta tarde') || rawFecha.includes('esta mañana')) {
        startDate = now;
      } else if (rawFecha.includes('pasado mañana') || rawFecha.includes('pasado manana')) {
        startDate = addDays(now, 2);
      } else if (rawFecha.includes('mañana') || rawFecha.includes('manana')) {
        startDate = addDays(now, 1);
      } else {
        const matchedDay = Object.keys(weekdayMap).find((w) => rawFecha.includes(w));
        if (matchedDay !== undefined) {
          const targetDayNum = weekdayMap[matchedDay];
          const currentDayNum = now.getDay();
          let daysAhead = targetDayNum - currentDayNum;
          if (daysAhead <= 0) daysAhead += 7;
          startDate = addDays(now, daysAhead);
        } else {
          try {
            const parsed = parseISO(rawFecha);
            if (isValid(parsed)) startDate = parsed;
          } catch {
            startDate = now;
          }
        }
      }
    }

    const candidateSlots: Array<{ startsAt: Date; endsAt: Date }> = [];
    const diasABuscar = Math.min(Math.max(params?.diasVista || 7, 1), 14);

    for (let dayOffset = 0; dayOffset < diasABuscar && candidateSlots.length < 4; dayOffset++) {
      const targetDate = addDays(startDate, dayOffset);
      const targetDayOfWeek = targetDate.getDay();

      if (!timetable[targetDayOfWeek] || timetable[targetDayOfWeek].length === 0) {
        continue;
      }

      let daySlots = await this.appointmentsService.getAvailableSlots(
        targetDate,
        durationMinutes,
        workingHours,
        ctx.timezone,
        now,
        'default',
        undefined,
        svcName,
      );

      const allowed = timetable[targetDayOfWeek];
      daySlots = daySlots.filter((s) => {
        const slotDate = s.startsAt instanceof Date ? s.startsAt : parseISO(s.startsAt as any);
        const zonedSlot = new TZDate(slotDate.getTime(), ctx.timezone);
        return allowed.includes(format(zonedSlot, 'HH:mm'));
      });

      if (targetHourNorm) {
        const matched = daySlots.find((s) => {
          const slotDate = s.startsAt instanceof Date ? s.startsAt : parseISO(s.startsAt as any);
          const zonedSlot = new TZDate(slotDate.getTime(), ctx.timezone);
          return format(zonedSlot, 'HH:mm') === targetHourNorm;
        });
        if (matched) {
          const slotDate = matched.startsAt instanceof Date ? matched.startsAt : parseISO(matched.startsAt as any);
          const zonedSlot = new TZDate(slotDate.getTime(), ctx.timezone);
          const iso = slotDate.toISOString();
          const spoken = format(zonedSlot, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
          return `Sí, el ${spoken} está disponible en el calendario oficial [${iso}]. Ofréceselo al cliente para confirmar.`;
        }
      }

      for (const slot of daySlots) {
        candidateSlots.push(slot);
        if (candidateSlots.length >= 4) break;
      }
    }

    if (candidateSlots.length === 0) {
      return `El calendario oficial de «${svcName}» es: ${scheduleSummary}. Para esas fechas no quedan plazas libres. Pregunta al cliente si le vendría bien mirar la próxima semana.`;
    }

    const optionsFormatted = candidateSlots
      .map((s) => {
        const d = s.startsAt instanceof Date ? s.startsAt : parseISO(s.startsAt as any);
        const zoned = new TZDate(d.getTime(), ctx.timezone);
        const iso = d.toISOString();
        const spoken = format(zoned, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
        return `${spoken} [${iso}]`;
      })
      .join('; ');

    return `El calendario oficial de «${svcName}» es: ${scheduleSummary}. Próximos turnos con plazas libres: ${optionsFormatted}. Explica amablemente el calendario oficial, ofrece hasta dos opciones y usa el código ISO entre corchetes para reservar cuando elija. Nunca leas el código entre corchetes en voz alta.`;
  }

  // ─── 3. RESERVAR CITA ───
  private async toolReservarCita(params: any, ctx: ToolExecutionContext): Promise<string> {
    const rawIso =
      params?.inicioIso ||
      params?.inicio_iso ||
      params?.startsAt ||
      params?.starts_at ||
      params?.fechaHoraIso ||
      params?.fecha_hora_iso ||
      params?.iso ||
      params?.fecha ||
      params?.slot;

    if (!rawIso) {
      return 'Falta la fecha de inicio. Consulta primero los huecos disponibles con consultar_huecos.';
    }

    let startsAt = parseISO(rawIso);
    if (!isValid(startsAt)) {
      startsAt = new Date(rawIso);
      if (!isValid(startsAt)) {
        return 'La fecha y hora facilitadas no son válidas. Por favor, consulta de nuevo la agenda con consultar_huecos.';
      }
    }

    const serviceName = params?.servicio || params?.service || params?.clase || 'Hatha Yoga Terapéutico';
    const customerName = params?.nombre || params?.name || params?.cliente || 'Alumno';

    const effectivePhone =
      params?.telefono ||
      params?.phone ||
      ctx.callerNumber ||
      `+34600${Math.floor(100000 + Math.random() * 900000)}`;

    // 1. Find or create Contact
    let contact = await this.contactsRepo.findOne({ where: { phone: effectivePhone } });
    if (!contact) {
      contact = this.contactsRepo.create({
        name: customerName,
        phone: effectivePhone,
        email: params?.email || params?.correo || undefined,
        source: 'agente_voz',
        status: ContactStatus.ACTIVE,
      });
      contact = await this.contactsRepo.save(contact);
    } else {
      if (customerName && customerName !== 'Alumno' && (!contact.name || contact.name === 'Cliente Telefónico')) {
        contact.name = customerName;
      }
      if ((params?.email || params?.correo) && !contact.email) {
        contact.email = params?.email || params?.correo;
      }
      await this.contactsRepo.save(contact);
    }

    // 2. Find service entity
    const cleanServiceName = serviceName.toLowerCase().trim();
    const services = await this.servicesRepo.find({ where: { isActive: true } });
    const serviceEntity =
      services.find((s) => s.name.toLowerCase().includes(cleanServiceName) || cleanServiceName.includes(s.name.toLowerCase())) ||
      null;

    const durationMinutes = serviceEntity?.durationMinutes || 45;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);

    // 2b. Strict validation against official service calendars
    const officialSvc = findOfficialService(cleanServiceName || serviceEntity?.name);
    if (officialSvc) {
      if (officialSvc.category === 'fixed_event' && officialSvc.eventDate) {
        const zoned = new TZDate(startsAt.getTime(), ctx.timezone);
        const targetEventDate = new TZDate(officialSvc.eventDate.getTime(), ctx.timezone);
        const isSameDay =
          zoned.getFullYear() === targetEventDate.getFullYear() &&
          zoned.getMonth() === targetEventDate.getMonth() &&
          zoned.getDate() === targetEventDate.getDate();
        if (!isSameDay) {
          return `No se puede reservar: «${officialSvc.name}» se celebra exclusivamente el ${officialSvc.eventSpokenDate}. No existen otras fechas en el calendario oficial. Explícaselo al cliente y pregúntale si desea plaza para ese día.`;
        }
      }

      if (officialSvc.category === 'recurring_schedule' && officialSvc.timetable) {
        const zoned = new TZDate(startsAt.getTime(), ctx.timezone);
        const dayOfWeek = zoned.getDay();
        const timeStr = format(zoned, 'HH:mm');
        const allowedTimes = officialSvc.timetable[dayOfWeek] || [];
        if (!allowedTimes.includes(timeStr)) {
          return `Ese horario no corresponde al calendario oficial de «${officialSvc.name}». Los turnos oficiales del calendario son: ${officialSvc.scheduleSummary}. Indícale amablemente estos turnos oficiales al cliente para que elija uno.`;
        }
      }
    }

    // 2c. Weekly quota check for Hatha Yoga (1 clase semanal vs 2 clases semanales)
    const isHathaYoga = officialSvc?.id === 'hatha-yoga' || /hatha.*yoga|yoga.*terap/i.test(cleanServiceName);
    if (isHathaYoga && contact?.id) {
      const isTwoClasses = /2\s*clases|dos\s*clases/i.test(cleanServiceName || params?.modalidad || '');
      const maxAllowedPerWeek = isTwoClasses ? 2 : 1;

      const weekStart = startOfWeek(startsAt, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(startsAt, { weekStartsOn: 1 });

      const existingThisWeek = await this.appointmentsRepo.find({
        where: {
          contactId: contact.id,
          status: In([AppointmentStatus.SCHEDULED, AppointmentStatus.PENDING_APPROVAL]),
          startsAt: Between(weekStart, weekEnd),
        },
        order: { startsAt: 'ASC' },
      });

      const HATHA_YOGA_TIMETABLE: Record<number, string[]> = {
        2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
        3: ['20:15'],
        4: ['09:45', '11:15', '16:30', '17:30', '19:00'],
      };

      const hathaExisting = existingThisWeek.filter((a) => {
        if (!/yoga/i.test(a.service)) return false;
        const zoned = new TZDate(new Date(a.startsAt).getTime(), ctx.timezone);
        const day = zoned.getDay();
        const time = format(zoned, 'HH:mm');
        return HATHA_YOGA_TIMETABLE[day]?.includes(time);
      });

      if (hathaExisting.length >= maxAllowedPerWeek) {
        if (maxAllowedPerWeek === 1) {
          const bookedDate = this.formatSpokenDate(hathaExisting[0].startsAt, ctx.timezone);
          return `Ya tienes una clase de Hatha Yoga agendada para esa semana (el ${bookedDate}). En la modalidad de 1 clase semanal solo puedes tener una clase por semana. Si deseas cambiar de horario, dímelo y te la reprogramo a este nuevo turno, o si prefieres asistir 2 veces por semana podemos cambiarte a la modalidad de 2 clases semanales (42€/mes).`;
        } else {
          const bookedDates = hathaExisting
            .map((a) => this.formatSpokenDate(a.startsAt, ctx.timezone))
            .join(' y el ');
          return `Ya tienes tus 2 clases de Hatha Yoga agendadas para esa semana (el ${bookedDates}). Con la modalidad de 2 clases semanales tienes el cupo semanal completo. ¿Deseas que te cambie alguno de esos dos turnos?`;
        }
      }
    }

    // 3. Create appointment with conflict handling
    try {
      const appt = await this.appointmentsService.create({
        contactId: contact.id,
        service: officialSvc?.name || serviceEntity?.name || serviceName,
        serviceId: serviceEntity?.id,
        calendarId: serviceEntity?.calendarId || 'default',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        modality: 'in_person',
        notes: params?.notas || params?.notes || params?.motivo || `Cita reservada por el asistente de voz VAPI.`,
      });

      // 4. Link call row to contact
      if (ctx.vapiCallId) {
        await this.callsRepo.update({ vapiCallId: ctx.vapiCallId }, { contactId: contact.id });
      }

      const spokenDate = this.formatSpokenDate(startsAt, ctx.timezone);
      const requiresApproval = officialSvc?.requiresApproval || serviceEntity?.requiresApproval;
      if (requiresApproval) {
        return `¡Solicitud registrada con éxito! Tu cita para ${appt.service} el ${spokenDate} a nombre de ${customerName} ha quedado registrada pendiente de aprobación del terapeuta Jose Ignacio. Te avisaremos en cuanto esté confirmada.`;
      }
      return `¡Cita confirmada con éxito! Queda agendada para ${appt.service} el ${spokenDate} a nombre de ${customerName}. Confírmaselo amablemente al cliente y despídete.`;
    } catch (err: any) {
      if (err?.message?.includes('ya tiene una reserva') || err?.status === 409 || err?.name === 'ConflictException') {
        return `Ya consta una reserva activa a nombre de ${customerName} en ese mismo horario. No es necesario volver a reservarla. Si deseas modificarla o cambiar de horario, dímelo y te la reprogramo.`;
      }
      throw err;
    }
  }

  // ─── 4. REPROGRAMAR CITA ───
  private async toolReprogramarCita(params: any, ctx: ToolExecutionContext): Promise<string> {
    if (!ctx.callerNumber) {
      return 'No puedo localizar tu cita sin el número de teléfono. Anota el aviso para que el equipo te llame.';
    }

    const contact = await this.contactsRepo.findOne({ where: { phone: ctx.callerNumber } });
    if (!contact) {
      return 'No encuentro ningún cliente registrado con este número. ¿Deseas agendar una nueva cita?';
    }

    // Find next upcoming appointment
    const appt = await this.appointmentsRepo.findOne({
      where: {
        contactId: contact.id,
        status: AppointmentStatus.SCHEDULED,
        startsAt: MoreThan(new Date()),
      },
      order: { startsAt: 'ASC' },
    });

    if (!appt) {
      return 'No encuentro ninguna cita próxima activa para este número. ¿Quieres agendar una nueva?';
    }

    const rawNewIso =
      params?.nuevoInicioIso ||
      params?.nuevo_inicio_iso ||
      params?.inicioIso ||
      params?.startsAt ||
      params?.fechaHoraIso ||
      params?.iso;

    if (!rawNewIso) {
      return 'Falta la nueva fecha y hora. Consulta primero los huecos disponibles con consultar_huecos.';
    }

    let newStartsAt = parseISO(rawNewIso);
    if (!isValid(newStartsAt)) {
      newStartsAt = new Date(rawNewIso);
      if (!isValid(newStartsAt)) {
        return 'La nueva fecha facilitada no es válida. Consulta de nuevo los huecos libres con consultar_huecos.';
      }
    }

    const duration = (appt.endsAt.getTime() - appt.startsAt.getTime()) || 45 * 60000;
    const newEndsAt = new Date(newStartsAt.getTime() + duration);

    await this.appointmentsService.update(appt.id, {
      startsAt: newStartsAt.toISOString(),
      endsAt: newEndsAt.toISOString(),
      notes: appt.notes ? `${appt.notes}\nReprogramada por voz.` : 'Reprogramada por voz.',
    });

    const spokenNew = this.formatSpokenDate(newStartsAt, ctx.timezone);
    return `Cita cambiada: tu cita de ${appt.service} ha sido movida al ${spokenNew}. Confírmaselo al cliente.`;
  }

  // ─── 5. ANULAR CITA ───
  private async toolAnularCita(params: any, ctx: ToolExecutionContext): Promise<string> {
    if (!ctx.callerNumber) {
      return 'No puedo localizar la cita sin el número de teléfono.';
    }

    const contact = await this.contactsRepo.findOne({ where: { phone: ctx.callerNumber } });
    if (!contact) {
      return 'No consta ningún cliente con este número de teléfono.';
    }

    const appt = await this.appointmentsRepo.findOne({
      where: {
        contactId: contact.id,
        status: AppointmentStatus.SCHEDULED,
        startsAt: MoreThan(new Date()),
      },
      order: { startsAt: 'ASC' },
    });

    if (!appt) {
      return 'No tienes ninguna cita próxima pendiente de realizar.';
    }

    const rawMotivo = params?.motivo || params?.reason || params?.notas;
    const motivo = rawMotivo ? `Cancelada por teléfono: ${rawMotivo}` : 'Cancelada por el cliente por teléfono';
    await this.appointmentsService.cancel(appt.id, 'agent', motivo);

    const spokenDate = this.formatSpokenDate(appt.startsAt, ctx.timezone);
    return `Tu cita de ${appt.service} del ${spokenDate} ha sido cancelada correctamente. El hueco queda liberado.`;
  }

  // ─── 6. DATOS DEL NEGOCIO ───
  private async toolDatosDelNegocio(params: any, ctx: ToolExecutionContext): Promise<string> {
    const [settings] = await this.settingsRepo.find({ take: 1 });
    const [agent] = await this.agentConfigRepo.find({ take: 1 });
    const services = await this.servicesRepo.find({ where: { isActive: true } });

    const tema = (params.tema || '').toLowerCase();

    if (tema.includes('direc') || tema.includes('donde') || tema.includes('dónde') || tema.includes('ubicac')) {
      return `La dirección del centro es la informada en nuestros canales oficiales. Atendemos con cita previa.`;
    }

    if (tema.includes('horari') || tema.includes('abier') || tema.includes('cuándo') || tema.includes('cuando')) {
      return `Nuestro horario habitual es de lunes a viernes de 09:00 a 20:00 y sábados de 10:00 a 14:00.`;
    }

    if (tema.includes('precio') || tema.includes('tarifa') || tema.includes('cuesta') || tema.includes('servicio')) {
      const list = services.map((s) => `${s.name} (${s.price ? `${s.price}€` : 'consultar'})`).join(', ');
      return `Ofrecemos: ${list}. ¿Sobre cuál te gustaría reservar cita o recibir más detalles?`;
    }

    const businessName = settings?.businessName || agent?.businessName || 'Centro de Bienestar';
    return `${businessName}. Ofrecemos sesiones personalizadas, clases y consultas profesionales.`;
  }

  // ─── 7. REGISTRAR HANDOFF ───
  private async toolRegistrarHandoff(params: any, ctx: ToolExecutionContext): Promise<string> {
    const motivo = params.motivo || 'Solicitud de atención por una persona';
    const acc = await this.vapiAccountRepo.findOne({ order: { createdAt: 'ASC' } });

    if (ctx.vapiCallId) {
      await this.callsRepo.update({ vapiCallId: ctx.vapiCallId }, { needsReview: true, notes: `Handoff: ${motivo}` });
    }

    if (acc?.handoffNumber) {
      return `Anotado: «${motivo}». Avisa al cliente de que le vas a transferir la llamada con un compañero y transfiérele.`;
    }

    return `He anotado tu solicitud con el motivo: «${motivo}». En este momento los compañeros están ocupados, pero te devolverán la llamada lo antes posible hoy mismo.`;
  }

  // ─── EVENT: END OF CALL REPORT ───
  private async handleEndOfCallReport(body: VapiWebhookMessage): Promise<void> {
    const raw = (body as any).message || body;
    const vapiCallId = raw.call?.id || raw.callId || (body as any).call?.id;
    if (!vapiCallId) return;

    const recordingUrl =
      raw.artifact?.recordingUrl ||
      raw.recordingUrl ||
      raw.call?.recordingUrl ||
      (typeof raw.artifact?.recording === 'string'
        ? raw.artifact?.recording
        : (raw.artifact?.recording as any)?.url) ||
      null;

    const summary =
      raw.analysis?.summary ||
      raw.summary ||
      raw.artifact?.summary ||
      raw.call?.analysis?.summary ||
      null;

    let transcript =
      raw.artifact?.transcript ||
      raw.transcript ||
      raw.call?.transcript ||
      null;

    const messages =
      raw.artifact?.messages ||
      raw.messages ||
      raw.call?.messages ||
      null;

    if (!transcript && Array.isArray(messages) && messages.length > 0) {
      transcript = messages
        .filter((m: any) => m.message || m.content)
        .map((m: any) => {
          const role =
            m.role === 'assistant' || m.role === 'bot'
              ? 'Asistente'
              : m.role === 'user' || m.role === 'customer'
              ? 'Cliente'
              : 'Herramienta';
          return `${role}: ${m.message || m.content}`;
        })
        .join('\n');
    }

    const rawCost =
      typeof raw.cost === 'number'
        ? raw.cost
        : typeof raw.call?.cost === 'number'
        ? raw.call?.cost
        : null;
    const costCents = rawCost !== null ? Math.round(rawCost * 100) : null;
    const endedReason = raw.endedReason || raw.call?.endedReason || null;

    const startedAt = raw.startedAt
      ? new Date(raw.startedAt)
      : raw.call?.startedAt
      ? new Date(raw.call.startedAt)
      : undefined;
    const endedAt = raw.endedAt
      ? new Date(raw.endedAt)
      : raw.call?.endedAt
      ? new Date(raw.call.endedAt)
      : new Date();

    let durationSeconds: number | null = null;
    if (typeof raw.durationSeconds === 'number') {
      durationSeconds = raw.durationSeconds;
    } else if (typeof raw.call?.duration === 'number') {
      durationSeconds = Math.round(raw.call.duration);
    } else if (startedAt && endedAt) {
      durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
    }

    let call = await this.callsRepo.findOne({ where: { vapiCallId } });
    if (!call) {
      const rawCustomer =
        raw.call?.customer?.number ||
        (body.message as any)?.call?.customer?.number;
      const fromNumber = rawCustomer ? normalizePhoneLoose(rawCustomer) : null;
      let contactId: string | null = null;
      if (fromNumber) {
        const contact = await this.contactsRepo.findOne({ where: { phone: fromNumber } });
        if (contact) contactId = contact.id;
      }

      call = this.callsRepo.create({
        vapiCallId,
        direction: raw.call?.type === 'outboundPhoneCall' ? CallDirection.OUTBOUND : CallDirection.INBOUND,
        fromNumber,
        contactId,
        status: CallStatus.ENDED,
        startedAt: startedAt || new Date(),
        endedAt,
        durationSeconds,
        endedReason,
        summary,
        transcript,
        messages,
        recordingUrl,
        costCents,
      });
    } else {
      call.status = CallStatus.ENDED;
      if (startedAt) call.startedAt = startedAt;
      call.endedAt = endedAt;
      if (durationSeconds !== null) call.durationSeconds = durationSeconds;
      if (endedReason) call.endedReason = endedReason;
      if (summary) call.summary = summary;
      if (transcript) call.transcript = transcript;
      if (messages) call.messages = messages;
      if (recordingUrl) call.recordingUrl = recordingUrl;
      if (costCents !== null) call.costCents = costCents;
    }

    const saved = await this.callsRepo.save(call);
    this.eventEmitter.emit('call.ended', saved);
    this.logger.log(`Call report saved for vapiCallId: ${vapiCallId}, duration: ${durationSeconds}s, cost: ${costCents}¢`);
  }

  // ─── EVENT: STATUS UPDATE ───
  private async handleStatusUpdate(body: VapiWebhookMessage): Promise<void> {
    const vapiCallId = body.call?.id || (body.message as any)?.call?.id;
    if (!vapiCallId) return;

    const status = body.status || (body.message as any)?.status;
    if (!status) return;

    let mappedStatus = CallStatus.IN_PROGRESS;
    if (status === 'queued') mappedStatus = CallStatus.QUEUED;
    else if (status === 'ringing') mappedStatus = CallStatus.RINGING;
    else if (status === 'in-progress') mappedStatus = CallStatus.IN_PROGRESS;
    else if (status === 'ended') mappedStatus = CallStatus.ENDED;
    else if (status === 'failed') mappedStatus = CallStatus.FAILED;

    await this.callsRepo.update({ vapiCallId }, { status: mappedStatus });
  }
}
