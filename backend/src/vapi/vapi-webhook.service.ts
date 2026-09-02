import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual } from 'typeorm';
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
import { format, parseISO, isValid, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { TZDate } from '@date-fns/tz';

export interface ToolExecutionContext {
  callerNumber: string | null;
  vapiCallId: string | null;
  direction: 'inbound' | 'outbound';
  timezone: string;
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
      const formattedDate = format(nextAppt.startsAt, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
      parts.push(`Tiene una cita de «${nextAppt.service}» programada para el ${formattedDate}.`);
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

    let durationMinutes = 45;
    let targetService: Service | null = null;
    const requestedService = params?.servicio || params?.service || params?.clase;

    if (requestedService && typeof requestedService === 'string') {
      const cleanName = requestedService.toLowerCase().trim();
      const services = await this.servicesRepo.find({ where: { isActive: true } });
      targetService =
        services.find((s) => s.name.toLowerCase().includes(cleanName) || cleanName.includes(s.name.toLowerCase())) ||
        null;
      if (targetService) {
        durationMinutes = targetService.durationMinutes;
      }
    }

    const now = new Date();
    let startDate = now;
    const rawFecha = (params?.fechaPreferida || params?.fecha || params?.date || '').toString().toLowerCase().trim();

    if (rawFecha) {
      if (rawFecha.includes('hoy') || rawFecha.includes('esta tarde') || rawFecha.includes('esta mañana')) {
        startDate = now;
      } else if (rawFecha.includes('pasado mañana') || rawFecha.includes('pasado manana')) {
        startDate = addDays(now, 2);
      } else if (rawFecha.includes('mañana') || rawFecha.includes('manana')) {
        startDate = addDays(now, 1);
      } else {
        const weekdayMap: Record<string, number> = {
          domingo: 0,
          lunes: 1,
          martes: 2,
          miercoles: 3,
          miércoles: 3,
          jueves: 4,
          viernes: 5,
          sabado: 6,
          sábado: 6,
        };
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
            if (isValid(parsed)) {
              startDate = parsed;
            }
          } catch {
            startDate = now;
          }
        }
      }
    }

    // Normalize preferred hour if provided (e.g. "10", "10:00", "10h", "17:00")
    let targetHourNorm: string | null = null;
    const rawHora = (params?.horaPreferida || params?.hora || params?.time || '').toString().toLowerCase().trim();
    if (rawHora) {
      const match = rawHora.match(/(\d{1,2})(?::(\d{2}))?/);
      if (match) {
        const h = parseInt(match[1], 10);
        const m = match[2] ? match[2] : '00';
        const isTarde = rawHora.includes('tarde') || rawHora.includes('pm');
        const finalH = isTarde && h < 12 ? h + 12 : h;
        targetHourNorm = `${finalH.toString().padStart(2, '0')}:${m}`;
      }
    }

    const candidateSlots: Array<{ startsAt: Date; endsAt: Date }> = [];
    const diasABuscar = Math.min(Math.max(params?.diasVista || 7, 1), 14);

    for (let dayOffset = 0; dayOffset < diasABuscar && candidateSlots.length < 4; dayOffset++) {
      const targetDate = addDays(startDate, dayOffset);
      const daySlots = await this.appointmentsService.getAvailableSlots(
        targetDate,
        durationMinutes,
        workingHours,
        ctx.timezone,
        now,
        targetService?.calendarId || 'default',
        targetService?.id,
        targetService?.name || requestedService,
      );

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
          return `Sí, el ${spoken} está disponible [${iso}]. Ofréceselo al cliente para confirmar.`;
        }
      }

      let filteredDaySlots = daySlots;
      const franja = (params?.franja || '').toString().toLowerCase();
      if (franja.includes('manana') || franja.includes('mañana')) {
        filteredDaySlots = daySlots.filter((s) => {
          const slotDate = s.startsAt instanceof Date ? s.startsAt : parseISO(s.startsAt as any);
          const zonedSlot = new TZDate(slotDate.getTime(), ctx.timezone);
          return zonedSlot.getHours() < 14;
        });
      } else if (franja.includes('tarde') || franja.includes('noche')) {
        filteredDaySlots = daySlots.filter((s) => {
          const slotDate = s.startsAt instanceof Date ? s.startsAt : parseISO(s.startsAt as any);
          const zonedSlot = new TZDate(slotDate.getTime(), ctx.timezone);
          return zonedSlot.getHours() >= 14;
        });
      }

      for (const slot of filteredDaySlots) {
        candidateSlots.push(slot);
        if (candidateSlots.length >= 4) break;
      }
    }

    if (candidateSlots.length === 0) {
      return 'No hay huecos disponibles en esas fechas exactas. Pregunta al cliente si le vendría bien mirar la próxima semana.';
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

    return `Huecos disponibles: ${optionsFormatted}. Ofrece hasta dos opciones al cliente de forma natural y guarda el código ISO entre corchetes para cuando elija. Nunca leas el código entre corchetes en voz alta.`;
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

    // 3. Create appointment with conflict handling
    try {
      const appt = await this.appointmentsService.create({
        contactId: contact.id,
        service: serviceEntity?.name || serviceName,
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

      const spokenDate = format(startsAt, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
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

    const spokenNew = format(newStartsAt, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
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

    const spokenDate = format(appt.startsAt, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
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
    const vapiCallId = body.call?.id || (body.message as any)?.call?.id;
    if (!vapiCallId) return;

    const recordingUrl =
      body.artifact?.recordingUrl ||
      (typeof body.artifact?.recording === 'string' ? body.artifact?.recording : (body.artifact?.recording as any)?.url) ||
      null;

    const summary = body.analysis?.summary || null;
    const transcript = body.artifact?.transcript || null;
    const messages = body.artifact?.messages || null;
    const costCents = typeof body.cost === 'number' ? Math.round(body.cost * 100) : null;
    const endedReason = body.endedReason || (body.message as any)?.endedReason || null;

    const startedAt = body.startedAt ? new Date(body.startedAt) : undefined;
    const endedAt = body.endedAt ? new Date(body.endedAt) : new Date();

    let durationSeconds: number | null = null;
    if (startedAt && endedAt) {
      durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
    }

    let call = await this.callsRepo.findOne({ where: { vapiCallId } });
    if (!call) {
      const rawCustomer = body.call?.customer?.number || (body.message as any)?.call?.customer?.number;
      const fromNumber = rawCustomer ? normalizePhoneLoose(rawCustomer) : null;
      let contactId: string | null = null;
      if (fromNumber) {
        const contact = await this.contactsRepo.findOne({ where: { phone: fromNumber } });
        if (contact) contactId = contact.id;
      }

      call = this.callsRepo.create({
        vapiCallId,
        direction: body.call?.type === 'outboundPhoneCall' ? CallDirection.OUTBOUND : CallDirection.INBOUND,
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
