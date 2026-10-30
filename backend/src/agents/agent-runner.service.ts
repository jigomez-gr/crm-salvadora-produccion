import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { MASTRA } from '@mastra/nestjs';
import { Mastra } from '@mastra/core/mastra';
import { RequestContext } from '@mastra/core/request-context';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessagesService, toMessageView } from '../conversations/messages.service';
import { AgentsConfigService } from './agents-config.service';
import { ContactsService } from '../contacts/contacts.service';
import {
  Message,
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';
import { TEMPLATE_AGENT_ID } from '../mastra/booking-agent';
import { detectConsentKeyword } from '../whatsapp/consent-keywords';
import { AUDIT_EVENT, AuditAction } from '../audit/audit.types';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { KNOWLEDGE_BUDGET_CHARS } from '../knowledge/knowledge-core';
import { normalizeColloquialSpanishTimes } from '../common/time';
import { ServicesService } from '../services/services.service';
import { SettingsService } from '../settings/settings.service';
import { MAINTENANCE_MESSAGE, BLOCKED_USER_MESSAGE } from '../common/system-messages';
import {
  isPureClosingOrFarewell,
  isBotFarewell,
} from '../whatsapp/farewell-detector';

// Hard cap on tool-call/generation steps per turn — bounds the agent loop so a
// misbehaving model (or a prompt-injection loop) can't rack up unbounded
// OpenRouter cost on a single message.
const AGENT_MAX_STEPS = 8;

// Safety circuit breaker thresholds to prevent rapid bot-to-bot ping-pong loops
const RAPID_BURST_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
const RAPID_BURST_MAX_OUTBOUND = 5;

// Reasoning models (e.g. minimax-m3) may emit <think> blocks inline in text
function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface InboundMediaInput {
  mediaType: import('../common/entities/message.entity').MediaType;
  mediaUrl: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
}

export interface RunAgentParams {
  agentKey: string;
  /** Text stored for this inbound message (caption / placeholder for media). */
  message: string;
  threadId: string;
  contactId?: string;
  phone?: string;
  contactName?: string;
  channel: MessageChannel;
  externalId?: string;
  /**
   * What the LLM should read, when it differs from `message`. For media the
   * stored `message` is a short placeholder ("📷 Imagen") but the agent gets a
   * plain-Spanish description (it can't see the file). Defaults to `message`.
   */
  agentPrompt?: string;
  /** Media reference persisted on the inbound message (WhatsApp). */
  media?: InboundMediaInput;
}

export interface RunAgentResult {
  /** The agent's reply text (empty if it didn't reply — deduped/disabled/handoff). */
  reply: string;
  /**
   * The persisted outbound message, if one was produced. Callers that actually
   * deliver it (the WhatsApp webhook) use this to reconcile delivery status
   * (id → sent/failed, then delivered/read via status webhooks).
   */
  outbound: Message | null;
}

@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    @Inject(MASTRA) private readonly mastra: Mastra,
    private readonly messagesService: MessagesService,
    private readonly agentsConfigService: AgentsConfigService,
    private readonly contactsService: ContactsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly knowledgeService: KnowledgeService,
    private readonly servicesService: ServicesService,
    @Optional() private readonly settingsService?: SettingsService,
  ) {}

  /** Persist an outbound reply (status by channel) and emit a sanitized SSE. */
  private async emitOutbound(
    params: RunAgentParams,
    reply: string,
  ): Promise<Message> {
    const outbound = await this.messagesService.saveMessage({
      contactId: params.contactId,
      threadId: params.threadId,
      direction: MessageDirection.OUTBOUND,
      channel: params.channel,
      body: reply,
      status:
        params.channel === MessageChannel.WHATSAPP
          ? MessageStatus.QUEUED
          : MessageStatus.SENT,
    });
    this.eventEmitter.emit('message.sent', {
      ...toMessageView(outbound),
      threadId: outbound.threadId,
    });
    return outbound;
  }

  async run(params: RunAgentParams): Promise<RunAgentResult> {
    const { agentKey, message, threadId, contactId, phone, contactName, channel, externalId, media } =
      params;
    // What the LLM reads (a description for media; the normalized text otherwise).
    const agentPrompt =
      params.agentPrompt ?? normalizeColloquialSpanishTimes(message);
    const mediaFields = media
      ? {
          mediaType: media.mediaType,
          mediaUrl: media.mediaUrl,
          mediaId: media.mediaId,
          mediaMimeType: media.mediaMimeType,
          mediaFilename: media.mediaFilename,
        }
      : {};

    // Persist inbound message. For channels that carry an externalId (WhatsApp),
    // claim it atomically so a duplicate webhook delivery can't run the agent
    // twice (no double reply, no double LLM charge).
    let inbound: Message | null;
    if (externalId) {
      inbound = await this.messagesService.saveInboundOnce({
        contactId,
        threadId,
        direction: MessageDirection.INBOUND,
        channel,
        body: message,
        externalId,
        ...mediaFields,
      });
      if (!inbound) {
        this.logger.log(
          `Deduped inbound message ${externalId} — already being processed.`,
        );
        return { reply: '', outbound: null };
      }
    } else {
      inbound = await this.messagesService.saveMessage({
        contactId,
        threadId,
        direction: MessageDirection.INBOUND,
        channel,
        body: message,
        ...mediaFields,
      });
    }
    // Emit a sanitized view (+ threadId, which consumers key on) — never push
    // the internal `mediaUrl`/`externalId` over SSE.
    this.eventEmitter.emit('message.received', {
      ...toMessageView(inbound),
      threadId: inbound.threadId,
    });

    // 0. Global WhatsApp Automation Pause ("kill switch")
    // Inbound messages are still saved in conversations/messages and shown in the
    // Inbox above, but no automatic replies or LLM execution may run while paused.
    if (channel === MessageChannel.WHATSAPP) {
      const isWhatsappPaused = await this.settingsService
        ?.isWhatsappAutomationPaused()
        .catch(() => false);
      if (isWhatsappPaused) {
        this.logger.log(
          `Global WhatsApp automation is PAUSED — inbound recorded on '${threadId}', auto-reply skipped.`,
        );
        return { reply: '', outbound: null };
      }
    }

    // 1. Maintenance Mode Check ('S')
    const isMaintenance = await this.settingsService?.isMaintenanceActive().catch(() => false);
    if (isMaintenance) {
      this.logger.log(`Maintenance mode active ('S') — replying with maintenance message.`);
      const reply = MAINTENANCE_MESSAGE;
      const outbound = await this.emitOutbound(params, reply);
      return { reply, outbound };
    }

    // 2. Blocked User Check ('S' - Bloqueo por restricción técnica)
    let contactEntity: any = null;
    if (contactId) {
      contactEntity = await this.contactsService.findById(contactId).catch(() => null);
    }
    if (!contactEntity && phone) {
      contactEntity = await this.contactsService.findByPhone(phone).catch(() => null);
    }
    const isBlocked =
      contactEntity?.bloqueado === 'S' ||
      (phone && this.contactsService.isContactBlocked
        ? await Promise.resolve(this.contactsService.isContactBlocked(phone)).catch(() => false)
        : false);

    if (isBlocked) {
      this.logger.log(`Contact ${contactId || phone} is blocked by technical restriction ('S') — replying with blocked restriction message.`);
      const reply = BLOCKED_USER_MESSAGE;
      const outbound = await this.emitOutbound(params, reply);
      return { reply, outbound };
    }

    // Consent keywords (STOP/BAJA/NO QUIERO SERVICIOS → opt-out, ALTA/START → opt-in). Honored on
    // WhatsApp BEFORE the disabled/handoff checks (a STOP must always be obeyed)
    // and instead of the agent: set the flag, audit it, and send one
    // confirmation. No LLM call.
    const consent =
      channel === MessageChannel.WHATSAPP
        ? detectConsentKeyword(message)
        : null;
    const targetContactId = contactId || contactEntity?.id;
    if (consent && targetContactId) {
      await this.contactsService
        .setOptOut(targetContactId, consent === 'opt_out')
        .catch((err) =>
          this.logger.error(`Failed to set opt-out for ${targetContactId}: ${err}`),
        );
      this.eventEmitter.emit(AUDIT_EVENT, {
        actor: { id: null, email: null },
        action:
          consent === 'opt_out'
            ? AuditAction.CONTACT_OPT_OUT
            : AuditAction.CONTACT_OPT_IN,
        summary:
          consent === 'opt_out'
            ? `${contactName || phone} se dio de baja por WhatsApp (solicitó no acceder a más servicios)`
            : `${contactName || phone} reactivó los mensajes y acceso a servicios por WhatsApp`,
        targetType: 'contact',
        targetId: targetContactId,
      });
      const reply =
        consent === 'opt_out'
          ? 'Hecho. Hemos registrado tu solicitud de no acceder a los servicios ni recibir comunicaciones automáticas del centro. Escribe ALTA cuando quieras reactivarlos.'
          : '¡Bienvenido de nuevo! Hemos reactivado tu acceso a nuestros servicios y comunicaciones. ¿En qué podemos ayudarte hoy?';
      const outbound = await this.emitOutbound(params, reply);
      return { reply, outbound };
    }

    // 3. User previously requested opt-out / baja (ha pedido no acceder más a los servicios de la clínica)
    const isOptedOut =
      Boolean(contactEntity?.optedOut) ||
      (phone && this.contactsService.isContactOptedOut
        ? await Promise.resolve(this.contactsService.isContactOptedOut(phone)).catch(() => false)
        : false);
    if (channel === MessageChannel.WHATSAPP && isOptedOut) {
      this.logger.log(`Contact ${contactId || phone} has previously opted out / requested baja from clinic services.`);
      const reply =
        'Consta en nuestro sistema que has solicitado no acceder a los servicios ni recibir comunicaciones del Centro de Yoga y Bienestar Salvadora Conesa. Si deseas volver a acceder a nuestros servicios y reactivar la atención automática, escribe ALTA en cualquier momento.';
      const outbound = await this.emitOutbound(params, reply);
      return { reply, outbound };
    }

    // Load this agent's config and expose it to the agent via requestContext
    const agentConfig = await this.agentsConfigService
      .findByKeyOrNull(agentKey)
      .catch(() => null);

    // Respect the agent's global on/off switch for live (WhatsApp) traffic. A
    // disabled agent still records the inbound message (so a human sees it in
    // the inbox) but does NOT auto-reply or spend tokens. The playground
    // bypasses this so config can be validated before the agent goes live.
    if (
      channel === MessageChannel.WHATSAPP &&
      agentConfig &&
      !agentConfig.enabled
    ) {
      this.logger.log(
        `Agent '${agentKey}' is disabled — inbound recorded, auto-reply skipped.`,
      );
      return { reply: '', outbound: null };
    }

    // Human handoff: if a person has taken over this thread, record the inbound
    // (already done above, so it shows in the inbox + bumps unread) but do NOT
    // auto-reply. The playground is never handed off.
    if (channel === MessageChannel.WHATSAPP) {
      const conversation = await this.messagesService
        .getConversation(threadId)
        .catch(() => null);
      if (conversation?.handoff) {
        this.logger.log(
          `Thread '${threadId}' is in human handoff — auto-reply skipped.`,
        );
        return { reply: '', outbound: null };
      }

      // Anti-loop protection for WhatsApp traffic:
      const recentMessages =
        typeof this.messagesService.getRecentMessages === 'function'
          ? await this.messagesService
              .getRecentMessages(threadId, 12)
              .catch(() => [])
          : [];

      // 1. Circuit breaker: if the bot has sent 5+ outbound messages in the last 3 minutes,
      // trip the circuit breaker and enable handoff to prevent rapid bot-to-bot ping-pong loops.
      const now = Date.now();
      const recentOutboundsInWindow = recentMessages.filter(
        (m) =>
          m.direction === MessageDirection.OUTBOUND &&
          now - new Date(m.createdAt).getTime() <= RAPID_BURST_WINDOW_MS,
      ).length;

      if (recentOutboundsInWindow >= RAPID_BURST_MAX_OUTBOUND) {
        this.logger.warn(
          `Circuit breaker triggered on thread '${threadId}': ${recentOutboundsInWindow} rapid outbound messages in window. Enabling handoff to stop loop.`,
        );
        await this.messagesService.setHandoff(threadId, true).catch(() => null);
        return { reply: '', outbound: null };
      }

      // 2. Anti-loop courtesy / farewell suppressor:
      // If the incoming message is purely a courtesy/farewell/closing message and our bot
      // has ALREADY issued a farewell in its previous outbound reply, do not reply again.
      // The incoming message is safely persisted in the CRM for visibility, but auto-reply is suppressed.
      if (isPureClosingOrFarewell(message)) {
        const lastOutbound = recentMessages.find(
          (m) =>
            m.direction === MessageDirection.OUTBOUND &&
            m.id !== inbound?.id,
        );
        if (lastOutbound && isBotFarewell(lastOutbound.body)) {
          this.logger.log(
            `Thread '${threadId}' received subsequent farewell/closing after bot already said farewell. Auto-reply suppressed to prevent loop.`,
          );
          return { reply: '', outbound: null };
        }
      }
    }

    const requestContext = new RequestContext<Record<string, any>>();
    if (agentConfig) {
      // Pull live services directly from the database table 'services' so that any schedule
      // or description update in the CRM is immediately and dynamically visible to the agent.
      const liveServices = await this.servicesService.findAll(true).catch(() => []);
      if (liveServices && liveServices.length > 0) {
        agentConfig.services = liveServices.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          price: s.price,
          serviceType: s.serviceType,
          eventDatesText: s.eventDatesText,
          eventStartDate: s.eventStartDate,
          eventEndDate: s.eventEndDate,
          scheduleText: s.scheduleText,
          description: s.description,
          weeklySchedule: s.weeklySchedule,
          maxCapacity: s.maxCapacity,
          availableSeats: s.availableSeats,
          minQuorum: s.minQuorum,
          paymentType: s.paymentType,
          calendarId: s.calendarId,
          managerId: s.managerId,
          externalPaymentUrl: s.externalPaymentUrl,
          allowedModalities: s.allowedModalities,
          requiresReason: s.requiresReason,
          requiresApproval: s.requiresApproval,
          sinfechadefinitiva: s.sinfechadefinitiva,
          textosinfechadefinitiva: s.textosinfechadefinitiva,
          sinpreciodefinitivo: s.sinpreciodefinitivo,
          textosinpreciodefinitivo: s.textosinpreciodefinitivo,
          textoespecifico: s.textoespecifico || null,
          editions: (s as any).editions || [],
          flyerUrl: s.flyerUrl || null,
          flyerPath: s.flyerPath || null,
          flyerParticularUrl: s.flyerParticularUrl || null,
          flyerParticularPath: s.flyerParticularPath || null,
          videoUrl: s.videoUrl || null,
          videoPath: s.videoPath || null,
          videoParticularUrl: s.videoParticularUrl || null,
          videoParticularPath: s.videoParticularPath || null,
        }));
      }

      (agentConfig as any).serviciosEnMantenimiento =
        (await this.settingsService?.get().catch(() => null))?.serviciosEnMantenimiento || 'N';

      requestContext.set('agentConfig', agentConfig);
      if (agentConfig.openrouterApiKey && agentConfig.openrouterApiKey !== 'sk-or-placeholder') {
        process.env.OPENROUTER_API_KEY = agentConfig.openrouterApiKey;
      }
    }
    requestContext.set('threadId', threadId);
    requestContext.set('channel', channel);

    // Tell the agent who it is talking to so it never asks for the phone and
    // never has to handle the contact id itself (the booking/list tools read it
    // from here). A new WhatsApp contact starts with name === phone, so treat
    // that as "name not known yet".
    let effectiveContactId = contactId;
    let effectivePhone = phone;
    let effectiveName = contactName;
    let effectiveEmail: string | undefined;
    let effectiveEmailerroneo: 'S' | 'N' = 'N';

    // If contact is not passed directly (e.g. Widget / Web), resolve from conversation
    if (!effectiveContactId) {
      const conv = await this.messagesService
        .getConversation(threadId)
        .catch(() => null);
      if (conv?.contactId) {
        effectiveContactId = conv.contactId;
      }
    }

    let effectiveContactadowassap: 'S' | 'N' =
      contactEntity?.contactadowassap === 'S' ? 'S' : 'N';
    if (effectiveContactId) {
      const c = await this.contactsService
        .findById(effectiveContactId)
        .catch(() => null);
      if (c) {
        effectivePhone = effectivePhone || c.phone;
        effectiveName = effectiveName || c.name;
        effectiveEmail = c.email || undefined;
        effectiveEmailerroneo = c.emailerroneo === 'S' ? 'S' : 'N';
        effectiveContactadowassap = c.contactadowassap === 'S' ? 'S' : 'N';
      }
    } else if (effectivePhone) {
      const c = await this.contactsService
        .findByPhone(effectivePhone)
        .catch(() => null);
      if (c) {
        effectiveContactId = c.id;
        effectiveName = effectiveName || c.name;
        effectiveEmail = c.email || undefined;
        effectiveEmailerroneo = c.emailerroneo === 'S' ? 'S' : 'N';
        effectiveContactadowassap = c.contactadowassap === 'S' ? 'S' : 'N';
      }
    }

    if (channel === MessageChannel.PLAYGROUND && !effectiveContactId) {
      try {
        const playgroundPhone = '+34600000000';
        let playgroundContact = await this.contactsService
          .findByPhone(playgroundPhone)
          .catch(() => null);
        if (!playgroundContact) {
          playgroundContact = await this.contactsService
            .create({
              phone: playgroundPhone,
              name: 'Usuario Playground',
            })
            .catch(() => null);
        }
        if (playgroundContact) {
          effectiveContactId = playgroundContact.id;
          effectivePhone = playgroundContact.phone;
          effectiveName = playgroundContact.name;
          effectiveEmail = playgroundContact.email || undefined;
          effectiveEmailerroneo = playgroundContact.emailerroneo === 'S' ? 'S' : 'N';
        }
      } catch {
        // non-fatal playground fallback
      }
    }

    if (effectiveContactId || effectivePhone) {
      const nameKnown = !!(effectiveName && effectiveName !== effectivePhone);
      requestContext.set('customer', {
        contactId: effectiveContactId,
        phone: effectivePhone,
        name: nameKnown ? effectiveName : undefined,
        email: effectiveEmail,
        emailerroneo: effectiveEmailerroneo,
        contactadowassap: effectiveContactadowassap,
        nameKnown,
      });
    }

    // Resolve this agent's knowledge base for the current message (whole base if
    // small, else the most relevant chunks) and expose it to the prompt. Keyed by
    // agentKey, so it applies with or without a stored config, and to both the
    // WhatsApp and playground paths (both run through here). Never break a reply
    // on a KB/DB hiccup — degrade to "no knowledge this turn".
    const knowledge = await this.knowledgeService
      .resolveForMessage(agentKey, agentPrompt, KNOWLEDGE_BUDGET_CHARS)
      .catch((err) => {
        this.logger.debug(`Knowledge resolve failed for '${agentKey}': ${err}`);
        return { mode: 'inject' as const, text: '' };
      });
    if (knowledge.text) requestContext.set('knowledgeBase', knowledge.text);

    let reply: string;
    try {
      const agent = this.mastra.getAgent(TEMPLATE_AGENT_ID);
      const result = await agent.generate(agentPrompt, {
        memory: {
          thread: threadId,
          resource: threadId,
        },
        requestContext,
        // Bound the agent loop to keep per-message cost predictable.
        maxSteps: AGENT_MAX_STEPS,
      });

      for (const step of (result as any).steps ?? []) {
        for (const tc of step.toolCalls ?? []) {
          const name = tc?.toolName || tc?.name || tc?.function?.name || tc?.tool?.id || tc?.id || '';
          const args = tc?.args ?? tc?.arguments ?? tc?.parameters ?? {};
          if (name || Object.keys(args).length > 0) {
            this.logger.log(`[ToolCall] ${name || 'unknown'}: ${JSON.stringify(args)}`);
          }
        }
        for (const tr of step.toolResults ?? []) {
          const name = tr?.toolName || tr?.name || tr?.tool?.id || tr?.id || '';
          const res = tr?.result ?? tr?.output ?? {};
          if (name || (typeof res === 'object' && Object.keys(res).length > 0)) {
            this.logger.log(`[ToolResult] ${name || 'unknown'}: ${JSON.stringify(res)}`);
          }
        }
      }

      // Token usage is just counts (no PII) — log it for cost visibility.
      try {
        const usage = await (result as any)?.usage;
        if (usage) {
          this.logger.debug(
            `agent '${agentKey}' usage: ${JSON.stringify(usage)}`,
          );
        }
      } catch {
        // usage is best-effort telemetry — never let it break a reply.
      }

      reply = stripReasoning(result.text || '');
    } catch (err) {
      // Most common cause: missing/invalid OpenRouter API key or model id.
      this.logger.error(`Agent '${agentKey}' failed to generate a reply: ${err}`);
      reply =
        'Lo siento, ahora mismo no puedo responder. (El agente no está configurado correctamente: revisa la clave de OpenRouter y el modelo seleccionado.)';
    }

    // Persist outbound message. WhatsApp replies start `queued` — the webhook
    // updates them to `sent`/`failed` after delivery (and later
    // `delivered`/`read` via status webhooks). Playground replies have no
    // provider, so they're `sent` immediately.
    const outbound = await this.emitOutbound(params, reply);

    if (
      channel === MessageChannel.WHATSAPP &&
      effectiveContactId &&
      effectiveContactadowassap !== 'S' &&
      typeof this.contactsService.update === 'function'
    ) {
      this.contactsService
        .update(effectiveContactId, { contactadowassap: 'S' })
        .catch((err) =>
          this.logger.warn(`Could not set contactadowassap for ${effectiveContactId}: ${err}`),
        );
    }

    return { reply, outbound };
  }
}
