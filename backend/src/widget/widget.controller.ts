import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  NotFoundException,
  BadRequestException,
  Header,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AgentsConfigService } from '../agents/agents-config.service';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { MessagesService, toMessageView } from '../conversations/messages.service';
import { ContactsService } from '../contacts/contacts.service';
import { SettingsService } from '../settings/settings.service';
import { ServicesService } from '../services/services.service';
import { AnalizaIaService } from '../appointments/analiza-ia.service';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { MessageChannel, MessageDirection } from '../common/entities/message.entity';
import { WidgetChatDto } from './dto/widget-chat.dto';
import { WidgetVapiCallDto } from './dto/widget-vapi-call.dto';
import { VapiService } from '../vapi/vapi.service';
import { VapiWebhookService } from '../vapi/vapi-webhook.service';
import { VapiWebhookMessage, VapiWebhookResponse } from '../vapi/vapi.types';
import {
  AnalizaIaPublicRequestDto,
  AnalizaIaEnviarPeticionDto,
} from './dto/analizaia.dto';

function formatAiDiagnosisToHtml(rawText: string): string {
  if (!rawText) {
    return '<p style="color: #6b7280; font-style: italic; margin: 0;">Sin diagnóstico disponible.</p>';
  }

  const lines = rawText.split(/\r?\n/);
  const formatted: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      formatted.push('<div style="height: 6px;"></div>');
      continue;
    }

    // Bold markdown **text** -> <strong>text</strong>
    let lineHtml = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Section headers (EVALUACIÓN ..., HALLAZGOS ..., ESTRATIFICACIÓN ..., RECOMENDACIONES ..., etc.)
    if (
      /^(EVALUACIÓN|HALLAZGOS|ESTRATIFICACIÓN|RECOMENDACIONES|DIAGNÓSTICOS|PAUTAS|NIVEL DE URGENCIA|ANÁLISIS|OBSERVACIONES)/i.test(
        trimmed,
      )
    ) {
      formatted.push(
        `<div style="font-size: 13.5px; font-weight: 700; color: #111827; margin-top: 10px; margin-bottom: 4px; border-bottom: 1px solid #e5e7eb; padding-bottom: 2px;">${lineHtml}</div>`,
      );
    } else if (/^[-•*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      // List items
      const bulletContent = lineHtml.replace(/^[-•*]\s+/, '').replace(/^\d+\.\s+/, '');
      formatted.push(
        `<div style="margin-left: 12px; margin-bottom: 4px; font-size: 13px; color: #374151; line-height: 1.5;">• ${bulletContent}</div>`,
      );
    } else {
      formatted.push(
        `<div style="font-size: 13px; color: #374151; line-height: 1.5; margin-bottom: 4px;">${lineHtml}</div>`,
      );
    }
  }

  return formatted.join('');
}

@Controller('widget')
export class WidgetController {
  constructor(
    private readonly agentsConfigService: AgentsConfigService,
    private readonly agentRunnerService: AgentRunnerService,
    private readonly messagesService: MessagesService,
    private readonly contactsService: ContactsService,
    private readonly settingsService: SettingsService,
    private readonly servicesService: ServicesService,
    private readonly analizaIaService: AnalizaIaService,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
    private readonly vapiService: VapiService,
    private readonly vapiWebhookService: VapiWebhookService,
  ) {}

  @Get('config/:agentKey')
  async getConfig(@Param('agentKey') agentKey: string) {
    const config = await this.agentsConfigService.findByKeyOrNull(agentKey);
    if (!config) {
      throw new NotFoundException(`Agente ${agentKey} no encontrado.`);
    }

    const branding = await this.settingsService.getBranding().catch(() => null);
    const dbServices = await this.servicesService.findAll(true).catch(() => []);

    const services = dbServices.length > 0
      ? dbServices.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          price: s.price ? `${s.price} €` : undefined,
          serviceType: s.serviceType || 'standard',
          eventDatesText: s.eventDatesText,
          allowedModalities: s.allowedModalities,
          requiresReason: s.requiresReason,
        }))
      : (config.services || []).map((s) => ({
          id: s.name,
          name: s.name,
          durationMinutes: s.durationMinutes,
          price: undefined,
          serviceType: 'standard',
          eventDatesText: null,
          allowedModalities: ['in_person'],
          requiresReason: false,
        }));

    return {
      agentKey: config.agentKey,
      businessName: config.businessName || branding?.businessName || 'Centro de Bienestar',
      businessDescription: config.businessDescription || '',
      brandColor: branding?.brandColor || '#800020',
      logoUrl: branding?.logoUrl || null,
      tone: config.tone || 'cálido, profesional y cercano',
      services,
      greeting: `¡Hola! 👋 Te damos la bienvenida a ${config.businessName || 'nuestro centro'}. ¿En qué podemos ayudarte hoy? Puedes preguntarme cualquier duda o seleccionar un servicio para reservar tu plaza.`,
    };
  }

  @Get('history/:agentKey/:sessionId')
  async getHistory(
    @Param('agentKey') agentKey: string,
    @Param('sessionId') sessionId: string,
  ) {
    const threadId = `${agentKey}:widget-${sessionId}`;
    const messages = await this.messagesService.getThreadMessages(threadId);
    return messages.map(toMessageView);
  }

  @Post('chat/:agentKey')
  async chat(
    @Param('agentKey') agentKey: string,
    @Body() dto: WidgetChatDto,
  ) {
    const config = await this.agentsConfigService.findByKeyOrNull(agentKey);
    if (!config) {
      throw new NotFoundException(`Agente ${agentKey} no encontrado.`);
    }

    const threadId = `${agentKey}:widget-${dto.sessionId}`;

    let contactId: string | undefined;
    let contactName = dto.name;

    if (dto.phone) {
      const contact = await this.contactsService.upsertByPhone(dto.phone, dto.name, {
        email: dto.email,
        source: 'landing',
        tags: ['lead_landing_web'],
      });
      contactId = contact.id;
      contactName = contact.name || contactName;
      await this.messagesService.linkContact(threadId, contact.id);
    } else {
      const conv = await this.messagesService.getConversation(threadId).catch(() => null);
      if (conv?.contactId) {
        contactId = conv.contactId;
        const contact = await this.contactsService.findById(conv.contactId).catch(() => null);
        if (contact) {
          contactName = contactName || contact.name;
          dto.phone = dto.phone || contact.phone;
        }
      }
    }

    let inboundMessage = dto.message;
    let agentPrompt = dto.message;

    if (dto.serviceName && (!dto.message || dto.message.trim() === '')) {
      inboundMessage = `Quiero información / reservar plaza para: ${dto.serviceName}`;
      agentPrompt = `El cliente ha seleccionado el servicio o clase "${dto.serviceName}". Salúdale cordialmente y consulta la disponibilidad o ayúdale a reservar su plaza indicándole los detalles.`;
    }

    const { reply } = await this.agentRunnerService.run({
      agentKey,
      message: inboundMessage,
      agentPrompt,
      threadId,
      contactId,
      phone: dto.phone,
      contactName,
      channel: MessageChannel.WIDGET,
    });

    return {
      reply,
      threadId,
    };
  }

  @Post('handoff-whatsapp/:agentKey')
  async handoffToWhatsApp(
    @Param('agentKey') agentKey: string,
    @Body() dto: { sessionId: string; name: string; phone: string; email?: string; serviceName?: string; note?: string },
  ) {
    const config = await this.agentsConfigService.findByKeyOrNull(agentKey);
    const targetPhone = config?.whatsappNumber || '34695172625';
    const cleanTarget = targetPhone.replace(/\D/g, '');

    // 1. Upsert / Register contact in CRM
    const contact = await this.contactsService.upsertByPhone(dto.phone, dto.name);
    
    // 2. Add tags, email and notes indicating web handoff
    const existingTags = contact.tags || [];
    const newTags = Array.from(new Set([...existingTags, 'lead_landing_web', ...(dto.serviceName ? [dto.serviceName] : [])]));
    await this.contactsService.update(contact.id, {
      name: dto.name || contact.name,
      email: dto.email ? dto.email.trim() : contact.email,
      tags: newTags,
      source: 'web_widget_whatsapp',
      notes: dto.note ? `${contact.notes ? contact.notes + '\n' : ''}Interés web: ${dto.serviceName || ''} - ${dto.note}` : contact.notes,
    });

    // 3. Prepare direct WhatsApp deep link with contextual greeting
    let waText = `¡Hola! Soy ${dto.name || 'un visitante de la web'}.`;
    if (dto.serviceName) {
      waText += ` Me interesa información y reservar clase de prueba para *${dto.serviceName}*.`;
    } else {
      waText += ` Estaba consultando en la web y me gustaría continuar la consulta por aquí.`;
    }
    if (dto.email) {
      waText += ` (Email: ${dto.email.trim()})`;
    }

    const whatsappUrl = `https://wa.me/${cleanTarget}?text=${encodeURIComponent(waText)}`;

    return {
      ok: true,
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: dto.email || contact.email,
      },
      whatsappUrl,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // LLAMADAS SALIENTES VAPI (VOICE AI) — LANDING & WIDGET
  // ─────────────────────────────────────────────────────────────

  @Post('vapi/call')
  async handleVapiOutboundCall(
    @Body() dto: WidgetVapiCallDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.vapiService.triggerLandingOutboundCall(dto);
    if (!result.success) {
      res.status(result.statusCode || 400);
      return {
        success: false,
        error: result.error || 'Error al procesar la llamada saliente.',
      };
    }

    // Link contact to thread if sessionId is present
    if (dto.sessionId && result.contactId) {
      const threadId = `${dto.agentKey || 'booking'}:widget-${dto.sessionId}`;
      await this.messagesService.linkContact(threadId, result.contactId).catch(() => null);
      await this.messagesService
        .saveMessage({
          threadId,
          contactId: result.contactId,
          direction: MessageDirection.OUTBOUND,
          channel: MessageChannel.WIDGET,
          body: `📞 Llamada de voz asistida (VAPI) iniciada hacia ${result.phoneNumber}.${
            dto.inquiry ? ` Consulta: "${dto.inquiry}".` : ''
          } (ID llamada: ${result.callId})`,
        })
        .catch(() => null);
    }

    return {
      success: true,
      message: result.message || 'Llamada iniciada con éxito.',
      callId: result.callId,
      phoneNumber: result.phoneNumber,
    };
  }

  @Post('vapi/webhook')
  @HttpCode(HttpStatus.OK)
  async handleVapiWebhook(
    @Body() body: VapiWebhookMessage,
  ): Promise<VapiWebhookResponse> {
    try {
      return await this.vapiWebhookService.handleWebhook(body);
    } catch {
      return { results: [] };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ANALIZA IA — SIMULADOR PÚBLICO DE DIAGNÓSTICO (LANDING & WIDGET)
  // ─────────────────────────────────────────────────────────────

  @Get('analizaia/doctores')
  async getAnalizaIaDoctores() {
    const users = await this.usersService.findAll().catch(() => []);
    return users
      .filter((u) => u.isActive)
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      }));
  }

  @Post('analizaia/analizar')
  async publicoAnalizarImagen(@Body() dto: AnalizaIaPublicRequestDto) {
    if (!dto.imagenBase64) {
      return { ok: false, msg: 'Debe adjuntar una imagen.' };
    }

    try {
      const cleanBase64 = dto.imagenBase64.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(cleanBase64, 'base64');
      const mimeType = dto.imagenContentType || 'image/jpeg';

      const result = await this.analizaIaService.analyze({
        modality: dto.servicio || 'dental',
        imageBuffer,
        mimeType,
        notes: dto.contexto,
        patientName: dto.patientName,
      });

      return {
        ok: true,
        diagnostico: result.analysisText,
        modality: result.modality,
        title: result.title,
        confidence: result.confidence,
        findings: result.findings,
        recommendations: result.recommendations,
        imagenBase64: dto.imagenBase64,
        imagenContentType: mimeType,
      };
    } catch (err) {
      return {
        ok: false,
        msg: `Error en análisis: ${(err as Error).message}`,
      };
    }
  }

  @Post('analizaia/enviar-peticion')
  async publicoEnviarPeticion(@Body() dto: AnalizaIaEnviarPeticionDto) {
    if (!dto.consentimiento) {
      throw new BadRequestException(
        'Debe otorgar su consentimiento explícito para enviar la petición al doctor.',
      );
    }

    if (!['email', 'whatsapp', 'telegram'].includes(dto.canalRespuesta)) {
      throw new BadRequestException('Canal de respuesta inválido.');
    }

    if (!dto.doctorCorreo) {
      throw new BadRequestException('Falta el correo del doctor.');
    }

    const fullName = `${dto.nombre} ${dto.apellidos || ''}`.trim();
    const contact = await this.contactsService.upsertByPhone(dto.telefono, fullName);

    const existingTags = contact.tags || [];
    const newTags = Array.from(
      new Set([
        ...existingTags,
        'peticion_ia',
        'diagnostico_landing',
        dto.servicioCodigo,
      ]),
    );

    const petitionRef = `PET-${Date.now().toString(36).toUpperCase()}`;
    const newNotes = `${contact.notes ? contact.notes + '\n\n' : ''}[${new Date().toLocaleString('es-ES')}] Petición #${petitionRef} (${dto.servicioNombre || dto.servicioCodigo}):\nCanal: ${dto.canalRespuesta} (${dto.telefono})\nMotivo: ${dto.motivoPaciente || 'Sin motivo indicado'}\nDiagnóstico IA:\n${dto.diagnosticoIA}`;

    await this.contactsService.update(contact.id, {
      name: fullName,
      email: dto.correo || contact.email,
      tags: newTags,
      source: 'simulador_ia_landing',
      notes: newNotes,
    });

    // Send Email notification to Doctor
    let imagenAttachment:
      | { filename: string; content: Buffer; contentType: string; cid?: string }
      | undefined;

    let imageTagHtml = '';
    if (dto.imagenBase64) {
      try {
        const cleanBase64 = dto.imagenBase64.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(cleanBase64, 'base64');
        const ext = (dto.imagenContentType || 'image/jpeg').includes('png') ? 'png' : 'jpg';
        imagenAttachment = {
          filename: `imagen_${petitionRef}.${ext}`,
          content: imgBuffer,
          contentType: dto.imagenContentType || 'image/jpeg',
          cid: 'foto_paciente',
        };
        imageTagHtml = `<div style="margin-bottom: 14px;"><img src="cid:foto_paciente" alt="Foto Paciente" style="max-width: 260px; max-height: 220px; border-radius: 8px; object-fit: cover; display: block; border: 1px solid #e5e7eb;" /></div>`;
      } catch {}
    }

    const canalTexto =
      dto.canalRespuesta === 'email'
        ? `Email — ${dto.correo}`
        : dto.canalRespuesta === 'whatsapp'
        ? `WhatsApp — ${dto.telefono}`
        : `Telegram — ${dto.telegramId || dto.telefono}`;

    const servicioTexto = `✨ ${dto.servicioNombre || dto.servicioCodigo}`;

    const formattedDiagnosisHtml = formatAiDiagnosisToHtml(dto.diagnosticoIA);

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; color: #1f2937; background: #ffffff; line-height: 1.5;">
        ${imageTagHtml}

        <div style="margin: 12px 0 20px 0; font-size: 13px; color: #4b5563;">
          <span style="color: #6b7280; margin-right: 6px;">Iniciar respuesta con:</span>
          <span style="display: inline-block; border: 1px solid #0284c7; color: #0284c7; border-radius: 6px; padding: 3px 10px; font-size: 12px; margin-right: 6px; font-weight: 500;">No me interesa.</span>
          <span style="display: inline-block; border: 1px solid #0284c7; color: #0284c7; border-radius: 6px; padding: 3px 10px; font-size: 12px; margin-right: 6px; font-weight: 500;">¡Muchas gracias!</span>
          <span style="display: inline-block; border: 1px solid #0284c7; color: #0284c7; border-radius: 6px; padding: 3px 10px; font-size: 12px; font-weight: 500;">Recibido, ¡muchas gracias!</span>
        </div>

        <h2 style="font-size: 18px; font-weight: 700; color: #111827; margin: 0 0 16px 0;">
          Nueva petición de diagnóstico desde la landing
        </h2>

        <p style="margin: 6px 0; font-size: 14px; color: #1f2937;"><strong>Referencia interna:</strong> #${petitionRef}</p>
        <p style="margin: 6px 0; font-size: 14px; color: #1f2937;"><strong>Servicio:</strong> ${servicioTexto}</p>
        <p style="margin: 6px 0; font-size: 14px; color: #1f2937;"><strong>Paciente:</strong> ${fullName}</p>
        <p style="margin: 6px 0; font-size: 14px; color: #1f2937;"><strong>Canal preferido de respuesta:</strong> ${canalTexto}</p>
        
        <p style="margin: 14px 0 4px 0; font-size: 14px; color: #1f2937;"><strong>Motivo indicado por el paciente:</strong></p>
        <p style="margin: 0 0 16px 0; font-size: 14px; color: #4b5563; white-space: pre-wrap;">${dto.motivoPaciente || '(sin motivo)'}</p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 18px 0;" />

        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #111827;">Diagnóstico preliminar IA:</p>
        <div style="background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
          ${formattedDiagnosisHtml}
        </div>

        <div style="border-top: 1px solid #f3f4f6; padding-top: 12px; font-size: 11px; color: #9ca3af;">
          Petición recibida a través del Simulador Clínico IA. Consentimiento RGPD registrado.
        </div>
      </div>
    `;

    const emailRes = await this.emailService.sendNotification(
      dto.doctorCorreo,
      dto.doctorNombre || null,
      `PETICION DIAGNOSTICO LANDING: ${fullName}`,
      emailHtml,
      undefined,
      imagenAttachment,
    );

    let whatsappUrl: string | undefined;
    if (dto.canalRespuesta === 'whatsapp') {
      const cleanPhone = dto.telefono.replace(/\D/g, '');
      const waText = `¡Hola ${dto.nombre}! Hemos recibido tu solicitud de diagnóstico IA para ${dto.servicioNombre || dto.servicioCodigo} (Ref #${petitionRef}). El Dr. revisará tu caso y te responderemos a la mayor brevedad.`;
      whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;
    }

    return {
      ok: true,
      idPeticion: petitionRef,
      contactId: contact.id,
      correoEnviado: emailRes.ok,
      emailError: emailRes.error,
      whatsappUrl,
      msg: 'Petición registrada correctamente.',
    };
  }

  @Get('demo')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getDemoLandingPage(@Res() res: Response) {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Centro de Yoga Salvadora Conesa - Demo Widget</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #FAF9F6; margin: 0; padding: 20px; color: #333; }
    .container { max-width: 800px; margin: 40px auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #E5E0D8; }
    h1 { color: #800020; margin-top: 0; font-size: 26px; }
    .subtitle { color: #888; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; margin-bottom: 20px; }
    .card { background: #fdfdfd; border: 1px solid #eee; border-radius: 8px; padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    .card h3 { margin: 0 0 6px 0; font-size: 16px; color: #222; }
    .card p { margin: 0; font-size: 13px; color: #666; }
    .btn { background: #800020; color: white; border: none; padding: 10px 16px; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer; transition: background 0.2s; }
    .btn:hover { background: #600018; }
    .banner { background: #e6f4ea; border: 1px solid #ceead6; padding: 12px 16px; border-radius: 8px; font-size: 13px; color: #137333; margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="subtitle">Centro de Yoga Fuenlabrada</div>
    <h1>Salvadora Conesa — Vista Previa del Widget</h1>
    <div class="banner">
      ✨ <strong>Burbuja cargada con &lt;script src="/api/widget/embed.js"&gt;:</strong> Observa la burbuja flotante granate en la esquina inferior derecha. Pulsa sobre ella o en los botones para abrir el chat con el agente de IA.
    </div>

    <div class="card">
      <div>
        <h3>Clase de Yoga (Hatha / Vinyasa)</h3>
        <p>Práctica de posturas, respiración consciente y relajación (75 min).</p>
      </div>
      <button class="btn" data-crm-service="Clase de Yoga (Hatha / Vinyasa)">Reservar</button>
    </div>

    <div class="card">
      <div>
        <h3>Baño de Gong (Sonoterapia)</h3>
        <p>Inmersión en frecuencias armónicas y vibración de gongs (60 min).</p>
      </div>
      <button class="btn" data-crm-service="Baño de Gong (Sonoterapia)">Reservar</button>
    </div>

    <div class="card">
      <div>
        <h3>Terapia Gestalt (Individual)</h3>
        <p>Sesión individualizada presencial o videollamada Cal.com (60 min).</p>
      </div>
      <button class="btn" data-crm-service="Terapia Gestalt (Individual)">Reservar</button>
    </div>

    <div class="card">
      <div>
        <h3>Ayuno Terapéutico & Retiro Detox</h3>
        <p>Retiro de fin de semana para depuración física y bienestar integral.</p>
      </div>
      <button class="btn" data-crm-service="Ayuno Terapéutico & Retiro Detox">Reservar</button>
    </div>

    <div class="card" style="border: 1.5px solid #818cf8; background: #f5f3ff;">
      <div>
        <h3 style="color: #4338ca;">Pedir por Teléfono (VAPI Voice AI)</h3>
        <p>Lanzar llamada saliente inmediata desde la web para hablar con el asistente de voz.</p>
      </div>
      <button class="btn" style="background: #4f46e5;" data-crm-vapi-call="true" data-crm-service="Clase de Yoga (Hatha / Vinyasa)">Pedir por Teléfono (VAPI)</button>
    </div>
  </div>

  <!-- Real Embedded Widget Script -->
  <script src="/api/widget/embed.js" data-agent="booking" data-color="#800020"></script>
</body>
</html>`;
    return res.send(html);
  }

  @Get('embed.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  getEmbedScript(@Res() res: Response) {
    const jsCode = `
(function () {
  if (document.querySelector('.crm-widget-btn')) return;

  var currentScript = document.currentScript || document.querySelector('script[src*="embed.js"]') || (function() {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var scriptSrc = currentScript ? (currentScript.getAttribute('src') || currentScript.src || '') : '';
  var defaultApiUrl = '';
  if (scriptSrc && scriptSrc.startsWith('http')) {
    try {
      var parsedUrl = new URL(scriptSrc);
      defaultApiUrl = parsedUrl.origin;
    } catch(e){}
  }

  var apiUrl = (currentScript && currentScript.getAttribute('data-api-url')) || window.CRM_API_URL || defaultApiUrl || 'http://localhost:3001';
  var agentKey = (currentScript && currentScript.getAttribute('data-agent')) || window.CRM_AGENT_KEY || 'booking';
  var primaryColor = (currentScript && currentScript.getAttribute('data-color')) || '#800020';

  var storageKey = 'crm_widget_session_' + agentKey;
  var sessionId = localStorage.getItem(storageKey);
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    localStorage.setItem(storageKey, sessionId);
  }

  var config = {
    businessName: 'Asistente de Citas',
    brandColor: primaryColor,
    greeting: '¡Hola! ¿En qué puedo ayudarte hoy?',
    services: []
  };

  var isOpen = false;
  var isSending = false;

  // Insert Styles
  var style = document.createElement('style');
  style.id = 'crm-widget-styles';
  style.innerHTML = \`
    .crm-widget-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 62px;
      height: 62px;
      border-radius: 50%;
      background: \${primaryColor};
      box-shadow: 0 8px 24px rgba(0,0,0,0.22);
      color: white;
      border: 2px solid rgba(255,255,255,0.3);
      cursor: pointer;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      outline: none;
    }
    .crm-widget-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 12px 30px rgba(0,0,0,0.3);
    }
    .crm-widget-btn svg {
      width: 28px;
      height: 28px;
      transition: transform 0.3s ease;
    }
    .crm-widget-window {
      position: fixed;
      bottom: 100px;
      right: 24px;
      width: 380px;
      max-width: calc(100vw - 32px);
      height: 580px;
      max-height: calc(100vh - 120px);
      background: #FFFFFF;
      border-radius: 16px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.2);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      opacity: 0;
      pointer-events: none;
      transform: translateY(20px) scale(0.95);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid rgba(0,0,0,0.08);
    }
    .crm-widget-window.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }
    .crm-widget-header {
      background: \${primaryColor};
      color: white;
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .crm-widget-header-title {
      font-weight: 700;
      font-size: 15px;
      line-height: 1.2;
    }
    .crm-widget-header-sub {
      font-size: 11px;
      opacity: 0.85;
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 3px;
    }
    .crm-widget-online-dot {
      width: 7px;
      height: 7px;
      background: #10B981;
      border-radius: 50%;
      display: inline-block;
    }
    .crm-widget-close-btn {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 4px;
      opacity: 0.8;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .crm-widget-close-btn:hover {
      opacity: 1;
      background: rgba(255,255,255,0.15);
    }
    .crm-widget-chips-container {
      background: #FAF9F6;
      border-bottom: 1px solid #EFECE6;
      padding: 8px 12px;
      display: flex;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .crm-widget-chips-container::-webkit-scrollbar {
      display: none;
    }
    .crm-widget-chip {
      background: white;
      border: 1px solid #D5CEBE;
      border-radius: 20px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #333;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .crm-widget-chip:hover {
      background: \${primaryColor};
      color: white;
      border-color: \${primaryColor};
    }
    .crm-widget-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #FAFAFA;
    }
    .crm-msg {
      max-width: 84%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.45;
      word-break: break-word;
    }
    .crm-msg-inbound {
      align-self: flex-end;
      background: \${primaryColor};
      color: white;
      border-bottom-right-radius: 2px;
    }
    .crm-msg-outbound {
      align-self: flex-start;
      background: #FFFFFF;
      color: #1F2937;
      border: 1px solid #E5E7EB;
      border-bottom-left-radius: 2px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .crm-msg-outbound a {
      color: \${primaryColor};
      font-weight: 600;
      text-decoration: underline;
    }
    .crm-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 14px;
      align-self: flex-start;
      width: fit-content;
    }
    .crm-dot {
      width: 6px;
      height: 6px;
      background: #9CA3AF;
      border-radius: 50%;
      animation: crmBlink 1.4s infinite both;
    }
    .crm-dot:nth-child(2) { animation-delay: 0.2s; }
    .crm-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes crmBlink {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1.1); }
    }
    .crm-widget-footer {
      padding: 10px 12px;
      background: #FFFFFF;
      border-top: 1px solid #E5E7EB;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .crm-widget-input {
      flex: 1;
      border: 1px solid #D1D5DB;
      border-radius: 22px;
      padding: 8px 14px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    .crm-widget-input:focus {
      border-color: \${primaryColor};
    }
    .crm-widget-send-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: \${primaryColor};
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
      outline: none;
    }
    .crm-widget-send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .crm-widget-action-bar {
      display: flex;
      gap: 6px;
      padding: 6px 12px;
      background: #F3F4F6;
      border-top: 1px solid #E5E7EB;
    }
    .crm-action-vapi-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      background: #4F46E5;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }
    .crm-action-vapi-btn:hover {
      background: #4338CA;
    }
    .crm-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(2px);
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .crm-modal-box {
      background: white;
      border-radius: 12px;
      padding: 16px;
      width: 100%;
      max-width: 320px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    }
    .crm-modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .crm-modal-title {
      font-weight: 700;
      font-size: 13.5px;
      color: #111827;
    }
    .crm-modal-x {
      background: none;
      border: none;
      font-size: 18px;
      line-height: 1;
      color: #9CA3AF;
      cursor: pointer;
    }
    .crm-modal-desc {
      font-size: 11px;
      color: #6B7280;
      margin-bottom: 10px;
      line-height: 1.35;
    }
    .crm-modal-input {
      width: 100%;
      border: 1px solid #D1D5DB;
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 12px;
      margin-bottom: 8px;
      outline: none;
      box-sizing: border-box;
    }
    .crm-modal-input:focus {
      border-color: #4F46E5;
    }
    .crm-modal-msg {
      font-size: 11px;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .crm-modal-foot {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
    }
    .crm-btn-cancel {
      background: #F3F4F6;
      border: none;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #4B5563;
      cursor: pointer;
    }
    .crm-btn-submit {
      background: #4F46E5;
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 700;
      color: white;
      cursor: pointer;
    }
    .crm-btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  \`;
  document.head.appendChild(style);

  // Create UI Elements
  var btn = document.createElement('button');
  btn.className = 'crm-widget-btn';
  btn.setAttribute('aria-label', 'Abrir Asistente de Citas');
  btn.innerHTML = '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';

  var win = document.createElement('div');
  win.className = 'crm-widget-window';
  win.innerHTML = \`
    <div class="crm-widget-header">
      <div>
        <div class="crm-widget-header-title" id="crm-business-name">Asistente de Citas</div>
        <div class="crm-widget-header-sub"><span class="crm-widget-online-dot"></span> En línea para ayudarte</div>
      </div>
      <button class="crm-widget-close-btn" id="crm-close-btn" aria-label="Cerrar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="crm-widget-chips-container" id="crm-chips"></div>
    <div class="crm-widget-body" id="crm-body"></div>
    <div class="crm-widget-action-bar">
      <button type="button" class="crm-action-vapi-btn" id="crm-action-vapi">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Pedir por Teléfono (VAPI)
      </button>
    </div>
    <div class="crm-widget-footer">
      <input type="text" class="crm-widget-input" id="crm-input" placeholder="Escribe tu mensaje o consulta..." />
      <button class="crm-widget-send-btn" id="crm-send-btn" aria-label="Enviar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
      </button>
    </div>
    <div class="crm-modal-backdrop" id="crm-vapi-modal" style="display:none;">
      <div class="crm-modal-box">
        <div class="crm-modal-head">
          <div class="crm-modal-title">Pedir por Teléfono (VAPI)</div>
          <button type="button" class="crm-modal-x" id="crm-vapi-close">×</button>
        </div>
        <div class="crm-modal-desc">Nuestro asistente de voz inteligente te llamará inmediatamente para informarte o tramitar tu cita.</div>
        <div id="crm-vapi-form-view">
          <input type="text" class="crm-modal-input" id="crm-vapi-name" placeholder="Tu nombre (opcional)" />
          <input type="tel" class="crm-modal-input" id="crm-vapi-phone" placeholder="Teléfono (ej. +34600112233)" required />
          <div class="crm-modal-msg" id="crm-vapi-msg" style="display:none;"></div>
          <div class="crm-modal-foot">
            <button type="button" class="crm-btn-cancel" id="crm-vapi-btn-cancel">Cancelar</button>
            <button type="button" class="crm-btn-submit" id="crm-vapi-btn-submit">Llamar Ahora</button>
          </div>
        </div>
        <div id="crm-vapi-success-view" style="display:none; text-align:center; padding:12px 0;">
          <div style="font-size:24px; margin-bottom:6px;">📞</div>
          <div style="font-weight:700; color:#065f46; font-size:13px; margin-bottom:4px;">¡Llamada lanzada con éxito!</div>
          <div style="font-size:11.5px; color:#047857;" id="crm-vapi-success-text">En breves segundos sonará tu teléfono.</div>
        </div>
      </div>
    </div>
  \`;

  document.body.appendChild(btn);
  document.body.appendChild(win);

  var bodyEl = win.querySelector('#crm-body');
  var inputEl = win.querySelector('#crm-input');
  var sendBtn = win.querySelector('#crm-send-btn');
  var closeBtn = win.querySelector('#crm-close-btn');
  var chipsEl = win.querySelector('#crm-chips');
  var businessNameEl = win.querySelector('#crm-business-name');
  var vapiActionBtn = win.querySelector('#crm-action-vapi');
  var vapiModal = win.querySelector('#crm-vapi-modal');
  var vapiClose = win.querySelector('#crm-vapi-close');
  var vapiCancel = win.querySelector('#crm-vapi-btn-cancel');
  var vapiSubmit = win.querySelector('#crm-vapi-btn-submit');
  var vapiPhoneInput = win.querySelector('#crm-vapi-phone');
  var vapiNameInput = win.querySelector('#crm-vapi-name');
  var vapiMsg = win.querySelector('#crm-vapi-msg');
  var vapiFormView = win.querySelector('#crm-vapi-form-view');
  var vapiSuccessView = win.querySelector('#crm-vapi-success-view');

  function renderChips(services) {
    chipsEl.innerHTML = '';
    if (!services || services.length === 0) {
      chipsEl.style.display = 'none';
      return;
    }
    chipsEl.style.display = 'flex';
    services.forEach(function (s) {
      var chip = document.createElement('div');
      chip.className = 'crm-widget-chip';
      chip.textContent = s.name + (s.price ? ' (' + s.price + ')' : '');
      chip.onclick = function () {
        selectService(s.name);
      };
      chipsEl.appendChild(chip);
    });
  }

  function appendMessage(text, direction) {
    var msg = document.createElement('div');
    msg.className = 'crm-msg crm-msg-' + direction;
    
    // Format simple links
    var formatted = text.replace(/https?:\\/\\/[^\\s]+/g, function(url) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
    }).replace(/\\n/g, '<br/>');
    
    msg.innerHTML = formatted;
    bodyEl.appendChild(msg);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function showTyping() {
    var typing = document.createElement('div');
    typing.className = 'crm-typing';
    typing.id = 'crm-typing-indicator';
    typing.innerHTML = '<div class="crm-dot"></div><div class="crm-dot"></div><div class="crm-dot"></div>';
    bodyEl.appendChild(typing);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function hideTyping() {
    var t = bodyEl.querySelector('#crm-typing-indicator');
    if (t) t.remove();
  }

  function loadConfig() {
    fetch(apiUrl + '/api/widget/config/' + agentKey)
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.businessName) {
          config = data;
          businessNameEl.textContent = data.businessName;
          if (data.brandColor) {
            btn.style.background = data.brandColor;
            win.querySelector('.crm-widget-header').style.background = data.brandColor;
            sendBtn.style.background = data.brandColor;
          }
          if (data.services) {
            renderChips(data.services);
          }
        }
        loadHistory();
      })
      .catch(function(){
        loadHistory();
      });
  }

  function loadHistory() {
    fetch(apiUrl + '/api/widget/history/' + agentKey + '/' + sessionId)
      .then(function(r){ return r.json(); })
      .then(function(history){
        bodyEl.innerHTML = '';
        if (history && history.length > 0) {
          history.forEach(function(m){
            appendMessage(m.body, m.direction);
          });
        } else {
          appendMessage(config.greeting, 'outbound');
        }
      })
      .catch(function(){
        bodyEl.innerHTML = '';
        appendMessage(config.greeting, 'outbound');
      });
  }

  function sendMessage(text, serviceName) {
    if (isSending) return;
    var content = (text || '').trim();
    if (!content && !serviceName) return;

    if (content) {
      appendMessage(content, 'inbound');
      inputEl.value = '';
    }

    isSending = true;
    sendBtn.disabled = true;
    showTyping();

    fetch(apiUrl + '/api/widget/chat/' + agentKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        message: content || ('Información sobre ' + serviceName),
        serviceName: serviceName
      })
    })
    .then(function(r){ return r.json(); })
    .then(function(res){
      hideTyping();
      isSending = false;
      sendBtn.disabled = false;
      if (res && res.reply) {
        appendMessage(res.reply, 'outbound');
      } else {
        appendMessage('Disculpa, no pude procesar tu mensaje en este momento.', 'outbound');
      }
    })
    .catch(function(err){
      hideTyping();
      isSending = false;
      sendBtn.disabled = false;
      appendMessage('Error de conexión con el asistente. Inténtalo de nuevo.', 'outbound');
    });
  }

  function openWidget(options) {
    isOpen = true;
    win.classList.add('open');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    if (options && options.service) {
      selectService(options.service);
    } else if (options && options.message) {
      sendMessage(options.message);
    }
  }

  function closeWidget() {
    isOpen = false;
    win.classList.remove('open');
    btn.innerHTML = '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
  }

  function selectService(serviceName) {
    if (!isOpen) openWidget();
    sendMessage('Me gustaría reservar o consultar disponibilidad para ' + serviceName, serviceName);
  }

  function openVapiModal(inquiryContext) {
    if (!isOpen) openWidget();
    vapiPhoneInput.value = '';
    vapiNameInput.value = '';
    vapiMsg.style.display = 'none';
    vapiFormView.style.display = 'block';
    vapiSuccessView.style.display = 'none';
    vapiSubmit.disabled = false;
    vapiSubmit.textContent = 'Llamar Ahora';
    vapiModal.style.display = 'flex';
    vapiModal._inquiry = inquiryContext || '';
  }

  function closeVapiModal() {
    vapiModal.style.display = 'none';
  }

  if (vapiActionBtn) vapiActionBtn.onclick = function() { openVapiModal(); };
  if (vapiClose) vapiClose.onclick = closeVapiModal;
  if (vapiCancel) vapiCancel.onclick = closeVapiModal;

  if (vapiSubmit) {
    vapiSubmit.onclick = function() {
      var phone = (vapiPhoneInput.value || '').trim();
      var name = (vapiNameInput.value || '').trim();
      if (!phone) {
        vapiMsg.textContent = 'Por favor, introduce tu número de teléfono.';
        vapiMsg.style.display = 'block';
        vapiMsg.style.color = '#dc2626';
        return;
      }
      if (/^[6789]\d{8}$/.test(phone)) {
        phone = '+34' + phone;
      } else if (!phone.startsWith('+')) {
        phone = '+' + phone;
      }

      vapiSubmit.disabled = true;
      vapiSubmit.textContent = 'Conectando...';
      vapiMsg.style.display = 'none';

      fetch(apiUrl + '/api/widget/vapi/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phone,
          name: name || undefined,
          agentKey: agentKey,
          sessionId: sessionId,
          inquiry: vapiModal._inquiry || 'Consulta desde widget web'
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.success) {
          vapiFormView.style.display = 'none';
          vapiSuccessView.style.display = 'block';
          appendMessage('📞 Solicitud de llamada por voz (VAPI) iniciada hacia ' + phone + '.', 'inbound');
          setTimeout(function() {
            closeVapiModal();
          }, 3500);
        } else {
          vapiSubmit.disabled = false;
          vapiSubmit.textContent = 'Llamar Ahora';
          vapiMsg.textContent = (data && data.error) ? data.error : 'Error al conectar la llamada.';
          vapiMsg.style.display = 'block';
          vapiMsg.style.color = '#dc2626';
        }
      })
      .catch(function(err) {
        vapiSubmit.disabled = false;
        vapiSubmit.textContent = 'Llamar Ahora';
        vapiMsg.textContent = 'Error de conexión. Puedes llamar directamente al 695 172 625.';
        vapiMsg.style.display = 'block';
        vapiMsg.style.color = '#dc2626';
      });
    };
  }

  // Event Listeners
  btn.onclick = function () {
    if (isOpen) closeWidget();
    else openWidget();
  };

  closeBtn.onclick = closeWidget;

  sendBtn.onclick = function () {
    sendMessage(inputEl.value);
  };

  inputEl.onkeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  };

  // Wire automatic click listener for any button or link with data-crm-service or data-crm-vapi-call
  document.addEventListener('click', function (e) {
    var vapiTrigger = e.target.closest('[data-crm-vapi-call]');
    if (vapiTrigger) {
      e.preventDefault();
      var inq = vapiTrigger.getAttribute('data-crm-service') || '';
      openVapiModal(inq);
      return;
    }

    var target = e.target.closest('[data-crm-service]');
    if (target) {
      e.preventDefault();
      var svc = target.getAttribute('data-crm-service');
      selectService(svc);
    }
  });

  // Global API
  window.CRMWidget = {
    open: openWidget,
    close: closeWidget,
    selectService: selectService,
    sendMessage: sendMessage,
    openVapiCall: openVapiModal
  };

  // Initialize
  loadConfig();
})();
    `;
    res.send(jsCode);
  }
}
