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
    const eventType = body.type || (body.message as any)?.type;
    const vapiCallId = body.call?.id || (body.message as any)?.call?.id;
    const rawCallerNumber =
      body.call?.customer?.number ||
      (body.message as any)?.call?.customer?.number ||
      body.customer?.number ||
      null;

    const callerNumber = rawCallerNumber ? normalizePhoneLoose(rawCallerNumber) : null;
    const direction =
      body.call?.type === 'outboundPhoneCall' || (body.message as any)?.call?.type === 'outboundPhoneCall'
        ? ('outbound' as const)
        : ('inbound' as const);

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

    if (eventType === 'tool-calls') {
      const toolCalls = body.toolCalls || body.toolCallList || (body.message as any)?.toolCalls || [];
      const results: VapiToolResponseResult[] = [];

      for (const tc of toolCalls) {
        const resultText = await this.executeToolCall(tc, ctx);
        results.push({
          toolCallId: tc.id,
          result: resultText,
        });
      }

      return { results };
    }

    if (eventType === 'end-of-call-report') {
      await this.handleEndOfCallReport(body);
      return {};
    }

    if (eventType === 'status-update') {
      await this.handleStatusUpdate(body);
      return {};
    }

    return {};
  }

  private async ensureCallRow(vapiCallId: string, direction: 'inbound' | 'outbound', fromNumber: string | null): Promise<Call> {
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
      await this.callsRepo.save(call);
    }
    return call;
  }

  private async executeToolCall(tc: VapiToolCallItem, ctx: ToolExecutionContext): Promise<string> {
    const name = tc.function.name;
    let params: Record<string, any> = {};

    try {
      params =
        typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments || {};
    } catch {
      params = {};
    }

    this.logger.log(`Executing VAPI Tool: ${name} with params: ${JSON.stringify(params)} for caller: ${ctx.callerNumber}`);

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
          return `Herramienta «${name}» procesada.`;
      }
    } catch (err: any) {
      this.logger.error(`Error en herramienta ${name}: ${err?.message || err}`, err?.stack);
      return 'Ha ocurrido una pequeña incidencia al procesar los datos de la agenda. Por favor, intenta de nuevo o te devolvemos la llamada.';
    }
  }

  // ─── 1. IDENTIFICAR LLAMANTE ───
  private async toolIdentificarLlamante(ctx: ToolExecutionContext): Promise<string> {
    if (!ctx.callerNumber) {
      return 'El número del llamante no está disponible. Trátalo como cliente nuevo y pídele su nombre cuando sea necesario.';
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
            { day: 1, open: '09:00', close: '20:00' },
            { day: 2, open: '09:00', close: '20:00' },
            { day: 3, open: '09:00', close: '20:00' },
            { day: 4, open: '09:00', close: '20:00' },
            { day: 5, open: '09:00', close: '20:00' },
            { day: 6, open: '10:00', close: '14:00' },
          ];

    let durationMinutes = 45;
    let targetService: Service | null = null;

    if (params.servicio && typeof params.servicio === 'string') {
      const cleanName = params.servicio.toLowerCase().trim();
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

    if (params.fechaPreferida) {
      const parsed = parseISO(params.fechaPreferida);
      if (isValid(parsed) && parsed >= now) {
        startDate = parsed;
      }
    }

    const diasVista = Math.min(Math.max(params.diasVista || 5, 1), 14);
    const slots = await this.appointmentsService.getAvailableSlots(
      startDate,
      durationMinutes,
      workingHours,
      ctx.timezone,
      now,
      targetService?.calendarId || 'default',
      targetService?.id,
    );

    if (params.horaPreferida) {
      // Check if specific requested hour matches any free slot
      const prefHour = params.horaPreferida.trim();
      const matched = slots.find((s) => {
        const slotDate = s.startsAt instanceof Date ? s.startsAt : parseISO(s.startsAt as any);
        return format(slotDate, 'HH:mm') === prefHour;
      });
      if (matched) {
        const slotDate = matched.startsAt instanceof Date ? matched.startsAt : parseISO(matched.startsAt as any);
        const iso = slotDate.toISOString();
        const spoken = format(slotDate, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
        return `Sí, el ${spoken} está disponible [${iso}]. Ofréceselo al cliente para confirmar.`;
      }
    }

    // Filter slots based on franja (manana / tarde)
    let filtered = slots;
    if (params.franja === 'manana') {
      filtered = slots.filter((s) => {
        const slotDate = s.startsAt instanceof Date ? s.startsAt : parseISO(s.startsAt as any);
        return slotDate.getHours() < 14;
      });
    } else if (params.franja === 'tarde') {
      filtered = slots.filter((s) => {
        const slotDate = s.startsAt instanceof Date ? s.startsAt : parseISO(s.startsAt as any);
        return slotDate.getHours() >= 14;
      });
    }

    const candidateSlots = (filtered.length > 0 ? filtered : slots).slice(0, 3);

    if (candidateSlots.length === 0) {
      return 'No hay huecos disponibles en esas fechas exactas. Pregunta al cliente si prefiere mirar la próxima semana.';
    }

    const optionsFormatted = candidateSlots
      .map((s) => {
        const d = s.startsAt instanceof Date ? s.startsAt : parseISO(s.startsAt as any);
        const iso = d.toISOString();
        const spoken = format(d, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
        return `${spoken} [${iso}]`;
      })
      .join('; ');

    return `Huecos disponibles: ${optionsFormatted}. Ofrece hasta dos opciones al cliente y guarda el código ISO entre corchetes para cuando elija. Nunca leas el código entre corchetes.`;
  }

  // ─── 3. RESERVAR CITA ───
  private async toolReservarCita(params: any, ctx: ToolExecutionContext): Promise<string> {
    if (!ctx.callerNumber) {
      return 'No se puede formalizar la reserva porque el número telefónico no está disponible. Anota el aviso para que el equipo llame.';
    }

    const rawIso = params.inicioIso;
    if (!rawIso) {
      return 'Falta la fecha de inicio. Consulta primero los huecos disponibles con consultar_huecos.';
    }

    const startsAt = parseISO(rawIso);
    if (!isValid(startsAt)) {
      return 'La fecha y hora facilitadas no son válidas. Por favor, consulta de nuevo la agenda.';
    }

    const serviceName = params.servicio || 'Consulta General';
    const customerName = params.nombre || 'Cliente Telefónico';

    // 1. Find or create Contact
    let contact = await this.contactsRepo.findOne({ where: { phone: ctx.callerNumber } });
    if (!contact) {
      contact = this.contactsRepo.create({
        name: customerName,
        phone: ctx.callerNumber,
        email: params.email || undefined,
        source: 'agente_voz',
        status: ContactStatus.ACTIVE,
      });
      contact = await this.contactsRepo.save(contact);
    } else if (params.email && !contact.email) {
      contact.email = params.email;
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

    // 3. Create appointment
    const appt = await this.appointmentsService.create({
      contactId: contact.id,
      service: serviceEntity?.name || serviceName,
      serviceId: serviceEntity?.id,
      calendarId: serviceEntity?.calendarId || 'default',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      modality: 'in_person',
      notes: params.notes || `Cita reservada por el asistente de voz VAPI.`,
    });

    // 4. Link call row to contact
    if (ctx.vapiCallId) {
      await this.callsRepo.update({ vapiCallId: ctx.vapiCallId }, { contactId: contact.id });
    }

    const spokenDate = format(startsAt, "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
    return `¡Cita confirmada con éxito! Queda agendada para ${appt.service} el ${spokenDate} a nombre de ${customerName}. Confírmaselo amablemente al cliente y despídete.`;
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

    const rawNewIso = params.nuevoInicioIso;
    if (!rawNewIso) {
      return 'Falta la nueva fecha y hora. Consulta primero los huecos disponibles con consultar_huecos.';
    }

    const newStartsAt = parseISO(rawNewIso);
    if (!isValid(newStartsAt)) {
      return 'La nueva fecha facilitada no es válida. Consulta de nuevo los huecos libres.';
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

    const motivo = params.motivo ? `Cancelada por teléfono: ${params.motivo}` : 'Cancelada por el cliente por teléfono';
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
