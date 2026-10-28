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

import { MessageChannel } from '../common/entities/message.entity';
import { BLOCKED_USER_MESSAGE } from '../common/system-messages';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('Blocked and Opt-Out Verification on Inbound WhatsApp', () => {
  let agentRunner: AgentRunnerService;
  let contactsServiceMock: any;
  let messagesServiceMock: any;
  let agentsConfigServiceMock: any;
  let eventEmitterMock: any;
  let mastraMock: any;

  beforeEach(() => {
    messagesServiceMock = {
      saveMessage: jest.fn().mockImplementation((m) => Promise.resolve({ id: 'msg-out-1', ...m })),
      saveInboundOnce: jest.fn().mockResolvedValue({ id: 'msg-in-1' }),
      getConversation: jest.fn().mockResolvedValue({ handoff: false }),
    };

    contactsServiceMock = {
      findById: jest.fn(),
      findByPhone: jest.fn(),
      isContactBlocked: jest.fn().mockResolvedValue(false),
      isContactOptedOut: jest.fn().mockResolvedValue(false),
      setOptOut: jest.fn().mockResolvedValue({}),
    };

    agentsConfigServiceMock = {
      findByKeyOrNull: jest.fn().mockResolvedValue({ enabled: true, services: [] }),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    mastraMock = {
      getAgent: jest.fn().mockReturnValue({
        generate: jest.fn().mockResolvedValue({ text: 'LLM Response' }),
      }),
    };

    agentRunner = new AgentRunnerService(
      mastraMock,
      messagesServiceMock,
      agentsConfigServiceMock,
      contactsServiceMock,
      eventEmitterMock as unknown as EventEmitter2,
      {} as any, // knowledgeService
      { findAll: jest.fn().mockResolvedValue([]) } as any, // servicesService
      { isWhatsappAutomationPaused: jest.fn().mockResolvedValue(false), isMaintenanceActive: jest.fn().mockResolvedValue(false) } as any,
    );
  });

  it('blocks inbound WhatsApp messages when contact has bloqueado = S (technical restriction)', async () => {
    contactsServiceMock.findById.mockResolvedValue({ id: 'c-blocked', bloqueado: 'S' });

    const result = await agentRunner.run({
      agentKey: 'booking',
      message: 'Hola, quiero una cita',
      threadId: 'booking:+34600111222',
      contactId: 'c-blocked',
      phone: '+34600111222',
      channel: MessageChannel.WHATSAPP,
    });

    expect(result.reply).toBe(BLOCKED_USER_MESSAGE);
    expect(mastraMock.getAgent).not.toHaveBeenCalled();
    expect(messagesServiceMock.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: BLOCKED_USER_MESSAGE,
        direction: 'outbound',
      }),
    );
  });

  it('detects opt-out intent when user asks to not access clinic services and sets optedOut', async () => {
    contactsServiceMock.findById.mockResolvedValue({ id: 'c-active', bloqueado: 'N', optedOut: false });

    const result = await agentRunner.run({
      agentKey: 'booking',
      message: 'No quiero acceder mas a los servicios de la clinica',
      threadId: 'booking:+34600111222',
      contactId: 'c-active',
      phone: '+34600111222',
      channel: MessageChannel.WHATSAPP,
    });

    expect(contactsServiceMock.setOptOut).toHaveBeenCalledWith('c-active', true);
    expect(result.reply).toContain('Hemos registrado tu solicitud');
    expect(result.reply).toContain('ALTA');
    expect(mastraMock.getAgent).not.toHaveBeenCalled();
  });

  it('blocks normal requests when contact has previously opted out from clinic services', async () => {
    contactsServiceMock.findById.mockResolvedValue({ id: 'c-opted-out', bloqueado: 'N', optedOut: true });

    const result = await agentRunner.run({
      agentKey: 'booking',
      message: 'Hola, ¿qué servicios tenéis disponibles?',
      threadId: 'booking:+34600111222',
      contactId: 'c-opted-out',
      phone: '+34600111222',
      channel: MessageChannel.WHATSAPP,
    });

    expect(result.reply).toContain('Consta en nuestro sistema que has solicitado no acceder a los servicios');
    expect(result.reply).toContain('ALTA');
    expect(mastraMock.getAgent).not.toHaveBeenCalled();
  });

  it('reactivates opted-out contact when they send ALTA', async () => {
    contactsServiceMock.findById.mockResolvedValue({ id: 'c-opted-out', bloqueado: 'N', optedOut: true });

    const result = await agentRunner.run({
      agentKey: 'booking',
      message: 'ALTA',
      threadId: 'booking:+34600111222',
      contactId: 'c-opted-out',
      phone: '+34600111222',
      channel: MessageChannel.WHATSAPP,
    });

    expect(contactsServiceMock.setOptOut).toHaveBeenCalledWith('c-opted-out', false);
    expect(result.reply).toContain('Bienvenido de nuevo');
    expect(mastraMock.getAgent).not.toHaveBeenCalled();
  });
});
