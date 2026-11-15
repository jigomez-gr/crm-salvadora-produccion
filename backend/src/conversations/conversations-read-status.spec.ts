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
});
