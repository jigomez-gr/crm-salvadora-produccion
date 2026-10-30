jest.mock('@mastra/nestjs', () => ({ MASTRA: 'MASTRA_TOKEN' }), { virtual: true });
jest.mock('@mastra/core/mastra', () => ({ Mastra: class {} }), { virtual: true });
jest.mock(
  '@mastra/core/request-context',
  () => ({
    RequestContext: class {
      set = jest.fn();
    },
  }),
  { virtual: true },
);
jest.mock('../mastra/booking-agent', () => ({ TEMPLATE_AGENT_ID: 'booking-agent' }));

import { AgentRunnerService } from '../agents/agent-runner.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessageChannel, MessageDirection, MessageStatus } from '../common/entities/message.entity';

describe('Anti-Loop and Circuit Breaker for WhatsApp', () => {
  let agentRunner: AgentRunnerService;
  let messagesServiceMock: any;
  let agentsConfigServiceMock: any;
  let contactsServiceMock: any;
  let eventEmitterMock: any;
  let mastraMock: any;

  beforeEach(() => {
    messagesServiceMock = {
      saveMessage: jest.fn().mockImplementation((dto) =>
        Promise.resolve({
          id: 'msg-' + Math.random().toString(36).slice(2, 7),
          createdAt: new Date(),
          ...dto,
        }),
      ),
      saveInboundOnce: jest.fn().mockImplementation((dto) =>
        Promise.resolve({
          id: 'msg-' + Math.random().toString(36).slice(2, 7),
          createdAt: new Date(),
          ...dto,
        }),
      ),
      getConversation: jest.fn().mockResolvedValue({ handoff: false }),
      setHandoff: jest.fn().mockResolvedValue({ handoff: true }),
      getRecentMessages: jest.fn().mockResolvedValue([]),
    };

    agentsConfigServiceMock = {
      findByKeyOrNull: jest.fn().mockResolvedValue({
        agentKey: 'booking',
        enabled: true,
        services: [],
      }),
    };

    contactsServiceMock = {
      findById: jest.fn().mockResolvedValue({ id: 'c1', bloqueado: 'N', optedOut: false }),
      findByPhone: jest.fn().mockResolvedValue(null),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    mastraMock = {
      getAgent: jest.fn().mockReturnValue({
        generate: jest.fn().mockResolvedValue({ text: '¡Hasta pronto! Que tengas buen día.' }),
      }),
    };

    agentRunner = new AgentRunnerService(
      mastraMock,
      messagesServiceMock,
      agentsConfigServiceMock,
      contactsServiceMock,
      eventEmitterMock as unknown as EventEmitter2,
      { resolveForMessage: jest.fn().mockResolvedValue({ mode: 'inject', text: '' }) } as any,
      { findAll: jest.fn().mockResolvedValue([]) } as any,
      {
        isWhatsappAutomationPaused: jest.fn().mockResolvedValue(false),
        isMaintenanceActive: jest.fn().mockResolvedValue(false),
        get: jest.fn().mockResolvedValue({ serviciosEnMantenimiento: 'N' }),
      } as any,
    );
  });

  it('suppresses auto-reply when inbound is a farewell and bot already sent a farewell', async () => {
    // Recent messages: bot already said farewell in its last outbound message
    messagesServiceMock.getRecentMessages.mockResolvedValue([
      {
        id: 'msg-out-prev',
        direction: MessageDirection.OUTBOUND,
        body: '¡Hasta pronto! 🙏✨ Un abrazo grande, y que la paz, la armonía y el bienestar os acompañen siempre.',
        createdAt: new Date(Date.now() - 30 * 1000),
      },
      {
        id: 'msg-in-prev',
        direction: MessageDirection.INBOUND,
        body: 'B: ¡Hasta pronto! Que sigáis rodeados de paz, armonía y bienestar. 🙏🌿',
        createdAt: new Date(Date.now() - 40 * 1000),
      },
    ]);

    const result = await agentRunner.run({
      agentKey: 'booking',
      message:
        'B: ¡Muchísimas gracias por vuestras palabras tan bonitas y por ese abrazo enorme! 🥰🌿 Recibimos vuestro cariño con mucha alegría y os enviamos también un abrazo grande, con los mejores deseos de paz, armonía y bienestar.',
      threadId: 'booking:+34600111222',
      contactId: 'c1',
      phone: '+34600111222',
      channel: MessageChannel.WHATSAPP,
    });

    // Inbound is saved for CRM visibility
    expect(messagesServiceMock.saveMessage).toHaveBeenCalled();
    // But LLM is NOT invoked and no outbound message is generated
    expect(mastraMock.getAgent().generate).not.toHaveBeenCalled();
    expect(result.reply).toBe('');
    expect(result.outbound).toBeNull();
  });

  it('replies normally on the first farewell when bot has not said farewell yet', async () => {
    // Previous message was an appointment confirmation, not a farewell
    messagesServiceMock.getRecentMessages.mockResolvedValue([
      {
        id: 'msg-out-prev',
        direction: MessageDirection.OUTBOUND,
        body: 'Tu reserva para Hatha Yoga ha quedado confirmada para el martes a las 18:30.',
        createdAt: new Date(Date.now() - 60 * 1000),
      },
    ]);

    const result = await agentRunner.run({
      agentKey: 'booking',
      message: '¡Muchísimas gracias por todo! Hasta pronto.',
      threadId: 'booking:+34600111222',
      contactId: 'c1',
      phone: '+34600111222',
      channel: MessageChannel.WHATSAPP,
    });

    // LLM is invoked to provide a cordial closing
    expect(mastraMock.getAgent().generate).toHaveBeenCalled();
    expect(result.reply).toBe('¡Hasta pronto! Que tengas buen día.');
    expect(result.outbound).not.toBeNull();
  });

  it('replies normally when message contains a business question alongside thanks', async () => {
    messagesServiceMock.getRecentMessages.mockResolvedValue([
      {
        id: 'msg-out-prev',
        direction: MessageDirection.OUTBOUND,
        body: '¡Hasta pronto! Un abrazo.',
        createdAt: new Date(Date.now() - 30 * 1000),
      },
    ]);

    const result = await agentRunner.run({
      agentKey: 'booking',
      message: 'Muchas gracias, pero ¿cuánto cuesta la clase de yoga suelta?',
      threadId: 'booking:+34600111222',
      contactId: 'c1',
      phone: '+34600111222',
      channel: MessageChannel.WHATSAPP,
    });

    // Does not suppress because it contains a real question
    expect(mastraMock.getAgent().generate).toHaveBeenCalled();
    expect(result.reply).toBeTruthy();
  });

  it('trips circuit breaker and enables handoff when 5+ outbound messages occurred in 3 minutes', async () => {
    const now = Date.now();
    // Simulate 5 outbound messages in the last 2 minutes
    messagesServiceMock.getRecentMessages.mockResolvedValue([
      { id: '1', direction: MessageDirection.OUTBOUND, createdAt: new Date(now - 10000), body: 'A' },
      { id: '2', direction: MessageDirection.OUTBOUND, createdAt: new Date(now - 20000), body: 'B' },
      { id: '3', direction: MessageDirection.OUTBOUND, createdAt: new Date(now - 30000), body: 'C' },
      { id: '4', direction: MessageDirection.OUTBOUND, createdAt: new Date(now - 40000), body: 'D' },
      { id: '5', direction: MessageDirection.OUTBOUND, createdAt: new Date(now - 50000), body: 'E' },
    ]);

    const result = await agentRunner.run({
      agentKey: 'booking',
      message: 'Mensaje cualquiera',
      threadId: 'booking:+34600111222',
      contactId: 'c1',
      phone: '+34600111222',
      channel: MessageChannel.WHATSAPP,
    });

    // Handoff is triggered
    expect(messagesServiceMock.setHandoff).toHaveBeenCalledWith('booking:+34600111222', true);
    // Auto-reply is skipped
    expect(mastraMock.getAgent().generate).not.toHaveBeenCalled();
    expect(result.reply).toBe('');
    expect(result.outbound).toBeNull();
  });
});
