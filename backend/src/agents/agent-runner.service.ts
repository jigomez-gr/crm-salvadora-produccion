import { Injectable, Inject, Logger } from '@nestjs/common';
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

// Hard cap on tool-call/generation steps per turn — bounds the agent loop so a
// misbehaving model (or a prompt-injection loop) can't rack up unbounded
// OpenRouter cost on a single message.
const AGENT_MAX_STEPS = 8;

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
    // What the LLM reads (a description for media; the stored text otherwise).
    const agentPrompt = params.agentPrompt ?? message;
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

    // Consent keywords (STOP/BAJA → opt-out, ALTA/START → opt-in). Honored on
    // WhatsApp BEFORE the disabled/handoff checks (a STOP must always be obeyed)
    // and instead of the agent: set the flag, audit it, and send one
    // confirmation. No LLM call.
    const consent =
      channel === MessageChannel.WHATSAPP
        ? detectConsentKeyword(message)
        : null;
    if (consent && contactId) {
      await this.contactsService
        .setOptOut(contactId, consent === 'opt_out')
        .catch((err) =>
          this.logger.error(`Failed to set opt-out for ${contactId}: ${err}`),
        );
      this.eventEmitter.emit(AUDIT_EVENT, {
        actor: { id: null, email: null },
        action:
          consent === 'opt_out'
            ? AuditAction.CONTACT_OPT_OUT
            : AuditAction.CONTACT_OPT_IN,
        summary:
          consent === 'opt_out'
            ? `${contactName || phone} se dio de baja por WhatsApp (STOP/BAJA)`
            : `${contactName || phone} reactivó los mensajes por WhatsApp`,
        targetType: 'contact',
        targetId: contactId,
      });
      const reply =
        consent === 'opt_out'
          ? 'Hecho. No volverás a recibir mensajes automáticos. Escribe ALTA cuando quieras reactivarlos.'
          : 'Listo, volverás a recibir nuestros mensajes. ¡Gracias!';
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
    }

    const requestContext = new RequestContext<Record<string, any>>();
    if (agentConfig) {
      requestContext.set('agentConfig', agentConfig);
      if (agentConfig.openrouterApiKey && agentConfig.openrouterApiKey !== 'sk-or-placeholder') {
        process.env.OPENROUTER_API_KEY = agentConfig.openrouterApiKey;
      }
    }
    requestContext.set('threadId', threadId);

    // Tell the agent who it is talking to so it never asks for the phone and
    // never has to handle the contact id itself (the booking/list tools read it
    // from here). A new WhatsApp contact starts with name === phone, so treat
    // that as "name not known yet".
    let effectiveContactId = contactId;
    let effectivePhone = phone;
    let effectiveName = contactName;

    // If contact is not passed directly (e.g. Widget / Web), resolve from conversation
    if (!effectiveContactId) {
      const conv = await this.messagesService
        .getConversation(threadId)
        .catch(() => null);
      if (conv?.contactId) {
        effectiveContactId = conv.contactId;
        const c = await this.contactsService
          .findById(conv.contactId)
          .catch(() => null);
        if (c) {
          effectivePhone = effectivePhone || c.phone;
          effectiveName = effectiveName || c.name;
        }
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
          resource: contactId || threadId,
        },
        requestContext,
        // Bound the agent loop to keep per-message cost predictable.
        maxSteps: AGENT_MAX_STEPS,
      });

      // Log only tool *names* — never the payloads, which contain customer PII
      // (names, phone numbers, message text).
      for (const step of (result as any).steps ?? []) {
        for (const tr of step.toolResults ?? []) {
          this.logger.debug(`toolResult: ${tr?.toolName ?? 'unknown'}`);
        }
        for (const tc of step.toolCalls ?? []) {
          this.logger.debug(`toolCall: ${tc?.toolName ?? 'unknown'}`);
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

    return { reply, outbound };
  }
}
