import { MessagesService } from './messages.service';
import { ConversationsController } from './conversations.controller';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('Conversations Read / Unread Status', () => {
  let messagesService: MessagesService;
  let conversationsRepo: any;
  let callsRepo: any;
  let smsRepo: any;
  let messagesRepo: any;
  let controller: ConversationsController;
  let eventEmitter: EventEmitter2;

  beforeEach(() => {
    conversationsRepo = {
      findOne: jest.fn().mockResolvedValue({ threadId: 'test-thread', unreadCount: 0 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([]),
    };
    callsRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    smsRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    messagesRepo = {
      query: jest.fn().mockResolvedValue([]),
    };

    messagesService = new MessagesService(
      messagesRepo,
      conversationsRepo,
      callsRepo,
      smsRepo,
    );

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as EventEmitter2;

    controller = new ConversationsController(
      messagesService,
      {} as any,
      {} as any,
      eventEmitter,
      {} as any,
      {} as any,
    );
  });

  describe('MessagesService.markUnread', () => {
    it('sets unreadCount to 1 for standard conversation threads', async () => {
      await messagesService.markUnread('agent:+34600112233');

      expect(conversationsRepo.findOne).toHaveBeenCalledWith({
        where: { threadId: 'agent:+34600112233' },
      });
      expect(conversationsRepo.update).toHaveBeenCalledWith(
        { threadId: 'agent:+34600112233' },
        { unreadCount: 1 },
      );
    });

    it('sets leido to false for sms:* threads', async () => {
      await messagesService.markUnread('sms:42');

      expect(smsRepo.update).toHaveBeenCalledWith(42, { leido: false });
      expect(conversationsRepo.update).not.toHaveBeenCalled();
    });

    it('sets needsReview to true for call:* threads', async () => {
      await messagesService.markUnread('call:uuid-1234');

      expect(callsRepo.update).toHaveBeenCalledWith('uuid-1234', {
        needsReview: true,
      });
      expect(conversationsRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('MessagesService.markRead', () => {
    it('sets unreadCount to 0 for standard conversation threads', async () => {
      await messagesService.markRead('agent:+34600112233');

      expect(conversationsRepo.findOne).toHaveBeenCalledWith({
        where: { threadId: 'agent:+34600112233' },
      });
      expect(conversationsRepo.update).toHaveBeenCalledWith(
        { threadId: 'agent:+34600112233' },
        { unreadCount: 0 },
      );
    });

    it('sets leido to true for sms:* threads', async () => {
      await messagesService.markRead('sms:42');

      expect(smsRepo.update).toHaveBeenCalledWith(42, { leido: true });
      expect(conversationsRepo.update).not.toHaveBeenCalled();
    });

    it('sets needsReview to false for call:* threads', async () => {
      await messagesService.markRead('call:uuid-1234');

      expect(callsRepo.update).toHaveBeenCalledWith('uuid-1234', {
        needsReview: false,
      });
      expect(conversationsRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('ConversationsController endpoints', () => {
    it('POST :threadId/unread marks as unread and emits conversation.updated', async () => {
      const spy = jest.spyOn(messagesService, 'markUnread').mockResolvedValue();

      await controller.markUnread('agent:+34600112233');

      expect(spy).toHaveBeenCalledWith('agent:+34600112233');
      expect(eventEmitter.emit).toHaveBeenCalledWith('conversation.updated', {
        threadId: 'agent:+34600112233',
      });
    });

    it('POST :threadId/read marks as read and emits conversation.updated', async () => {
      const spy = jest.spyOn(messagesService, 'markRead').mockResolvedValue();

      await controller.markRead('agent:+34600112233');

      expect(spy).toHaveBeenCalledWith('agent:+34600112233');
      expect(eventEmitter.emit).toHaveBeenCalledWith('conversation.updated', {
        threadId: 'agent:+34600112233',
      });
    });
  });

  describe('ConversationsController.getMedia', () => {
    it('streams data: URLs directly by decoding base64', async () => {
      const fakeBuffer = Buffer.from('PDF_TEST_CONTENT');
      const dataUrl = `data:application/pdf;base64,${fakeBuffer.toString('base64')}`;

      jest.spyOn(messagesService, 'getMessageById').mockResolvedValue({
        id: 'msg-1',
        mediaType: 'document' as any,
        mediaUrl: dataUrl,
        mediaMimeType: 'application/pdf',
        mediaFilename: 'test.pdf',
        threadId: 'booking:+34600112233',
      } as any);

      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.getMedia('msg-1', res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.send).toHaveBeenCalledWith(fakeBuffer);
    });

    it('auto-heals Estado_Actualizado reports if mediaUrl is missing', async () => {
      const fakeMsg = {
        id: 'msg-report',
        mediaType: 'document' as any,
        mediaUrl: null,
        mediaMimeType: 'text/csv',
        mediaFilename: 'Estado_Actualizado_Facturacion_Cobros_202611.csv',
        threadId: 'booking:+34600112233',
        contactId: 'contact-1',
      };

      jest.spyOn(messagesService, 'getMessageById').mockResolvedValue(fakeMsg as any);
      const updateMediaSpy = jest.spyOn(messagesService, 'updateMediaUrl').mockResolvedValue();

      const appointmentsServiceMock = {
        getAppointmentPayments: jest.fn().mockResolvedValue({
          items: [],
          summary: {
            totalCount: 0,
            paidCount: 0,
            pendingCount: 0,
            totalPaidAmount: 0,
            totalPendingAmount: 0,
          },
        }),
      };

      const controllerWithAppts = new ConversationsController(
        messagesService,
        {} as any,
        {} as any,
        eventEmitter,
        {} as any,
        {} as any,
        undefined,
        undefined,
        appointmentsServiceMock as any,
      );

      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controllerWithAppts.getMedia('msg-report', res);

      expect(updateMediaSpy).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        expect.stringContaining('text/csv'),
      );
      expect(res.send).toHaveBeenCalled();
    });
  });
});
