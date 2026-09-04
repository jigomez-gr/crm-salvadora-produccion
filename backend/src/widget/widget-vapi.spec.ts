jest.mock('../agents/agent-runner.service', () => ({
  AgentRunnerService: class {},
}));

import { WidgetController } from './widget.controller';
import { VapiService } from '../vapi/vapi.service';
import { VapiWebhookService } from '../vapi/vapi-webhook.service';
import { MessagesService } from '../conversations/messages.service';

describe('WidgetController - VAPI Outbound Call Integration', () => {
  let controller: WidgetController;
  let mockVapiService: Partial<VapiService>;
  let mockVapiWebhookService: Partial<VapiWebhookService>;
  let mockMessagesService: Partial<MessagesService>;

  beforeEach(() => {
    mockVapiService = {
      triggerLandingOutboundCall: jest.fn(),
    };
    mockVapiWebhookService = {
      handleWebhook: jest.fn(),
    };
    mockMessagesService = {
      linkContact: jest.fn().mockResolvedValue(undefined),
      saveMessage: jest.fn().mockResolvedValue({} as any),
    };

    controller = new WidgetController(
      {} as any, // agentsConfigService
      {} as any, // agentRunnerService
      mockMessagesService as any,
      {} as any, // contactsService
      {} as any, // settingsService
      {} as any, // servicesService
      {} as any, // analizaIaService
      {} as any, // emailService
      {} as any, // usersService
      mockVapiService as any,
      mockVapiWebhookService as any,
    );
  });

  it('should return 400 with exact error format when phone is invalid', async () => {
    (mockVapiService.triggerLandingOutboundCall as jest.Mock).mockResolvedValue({
      success: false,
      error: 'El número de teléfono es obligatorio y debe tener formato E.164 (+34...)',
      statusCode: 400,
    });

    const mockRes: any = {
      status: jest.fn(),
    };

    const response = await controller.handleVapiOutboundCall(
      {
        phoneNumber: '600112233', // missing + prefix
      },
      mockRes,
    );

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(response).toEqual({
      success: false,
      error: 'El número de teléfono es obligatorio y debe tener formato E.164 (+34...)',
    });
  });

  it('should return 200 with callId and link contact to thread when call succeeds', async () => {
    (mockVapiService.triggerLandingOutboundCall as jest.Mock).mockResolvedValue({
      success: true,
      message: 'Llamada iniciada con éxito.',
      callId: 'vapi-call-test-999',
      phoneNumber: '+34600112233',
      contactId: 'contact-uuid-123',
    });

    const mockRes: any = {
      status: jest.fn(),
    };

    const response = await controller.handleVapiOutboundCall(
      {
        phoneNumber: '+34600112233',
        name: 'María García',
        agentKey: 'booking',
        sessionId: 'web_sess_123',
        inquiry: 'Reserva taller de respiración',
      },
      mockRes,
    );

    expect(response).toEqual({
      success: true,
      message: 'Llamada iniciada con éxito.',
      callId: 'vapi-call-test-999',
      phoneNumber: '+34600112233',
    });

    expect(mockMessagesService.linkContact).toHaveBeenCalledWith(
      'booking:widget-web_sess_123',
      'contact-uuid-123',
    );
    expect(mockMessagesService.saveMessage).toHaveBeenCalled();
  });

  it('should forward webhook to vapiWebhookService on POST /vapi/webhook', async () => {
    const webhookPayload: any = {
      message: {
        type: 'end-of-call-report',
        call: { id: 'call-123' },
      },
    };

    (mockVapiWebhookService.handleWebhook as jest.Mock).mockResolvedValue({
      results: [],
    });

    const res = await controller.handleVapiWebhook(webhookPayload);
    expect(mockVapiWebhookService.handleWebhook).toHaveBeenCalledWith(webhookPayload);
    expect(res).toEqual({ results: [] });
  });
});
