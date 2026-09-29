import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { EmailAccount } from '../common/entities/email-account.entity';
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';
import { EmailService } from './email.service';
import { EmailDialogueEvaluatorService } from './email-dialogue-evaluator.service';
import { MessagesService, toMessageView } from '../conversations/messages.service';
import { ContactsService } from '../contacts/contacts.service';

@Injectable()
export class EmailInboundService implements OnModuleInit {
  private readonly logger = new Logger(EmailInboundService.name);
  private isPolling = false;

  constructor(
    @InjectRepository(EmailAccount)
    private readonly accountRepo: Repository<EmailAccount>,
    private readonly emailService: EmailService,
    private readonly emailDialogueEvaluatorService: EmailDialogueEvaluatorService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
    @Inject(forwardRef(() => ContactsService))
    private readonly contactsService: ContactsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Initial sync 5s after startup so incoming replies are processed immediately without waiting 2 min
    setTimeout(() => {
      this.syncNow().catch((err) =>
        this.logger.error(`Initial email sync error: ${err}`),
      );
    }, 5000);
  }

  /**
   * Periodic cron job to check for inbound emails / customer replies every 2 minutes.
   */
  @Cron('*/2 * * * *')
  async pollScheduled(): Promise<void> {
    try {
      await this.syncNow();
    } catch (err) {
      this.logger.error(`Error in scheduled email polling: ${err}`);
    }
  }

  /**
   * Connect to IMAP, inspect unseen / new emails, reflect them in CRM threads,
   * qualify them with AI, and auto-reply or trigger human handoff.
   */
  async syncNow(): Promise<{ processedCount: number; details: any[]; error?: string }> {
    if (this.isPolling) {
      this.logger.log('Email sync is already running in background. Skipping duplicate run.');
      return { processedCount: 0, details: [], error: 'SYNC_ALREADY_IN_PROGRESS' };
    }

    this.isPolling = true;
    const details: any[] = [];
    let processedCount = 0;

    let client: ImapFlow | null = null;
    try {
      const acc = await this.emailService.getAccount();
      if (!acc.imapEnabled) {
        return { processedCount: 0, details: [] };
      }

      const host = acc.imapHost || acc.smtpHost;
      const port = acc.imapPort || 993;
      const secure = acc.imapSecure ?? true;
      const user = acc.imapUser || acc.smtpUser;
      const pass = acc.imapPassword || acc.smtpPassword;

      if (!host || !user || !pass) {
        this.logger.warn('IMAP is not fully configured (missing host, user, or pass).');
        return { processedCount: 0, details: [] };
      }

      client = new ImapFlow({
        host,
        port,
        secure,
        auth: { user, pass },
        logger: false,
        tls: { rejectUnauthorized: false },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
      });

      await client.connect();

      const mailboxes = await client.list();
      const folderPaths = mailboxes
        .filter(
          (m) =>
            m.path === 'INBOX' ||
            m.specialUse === '\\Inbox' ||
            m.specialUse === '\\Junk' ||
            /junk|spam/i.test(m.path),
        )
        .map((m) => m.path);

      const uniqueFolders = Array.from(
        new Set(folderPaths.length > 0 ? folderPaths : ['INBOX', 'Junk']),
      );

      const centerEmail = (acc.fromAddress || acc.smtpUser || '').toLowerCase().trim();

      for (const folder of uniqueFolders) {
        let lock: any = null;
        try {
          lock = await client.getMailboxLock(folder);
          const total = (client.mailbox && typeof client.mailbox === 'object' && 'exists' in client.mailbox ? client.mailbox.exists : 0) || 0;
          if (total === 0) continue;

          // Fetch recent messages by sequence number (safe 1..total, avoiding invalid messageset on UID ranges)
          const searchRange = `${Math.max(1, total - 40)}:*`;

          for await (const msg of client.fetch(searchRange, {
            uid: true,
            flags: true,
            source: true,
            envelope: true,
          })) {
            try {
              // Parse RFC822 raw message
              const parsed = await simpleParser(msg.source);
              const rawFrom = parsed.from?.value?.[0]?.address?.toLowerCase().trim();
              const fromName = parsed.from?.value?.[0]?.name?.trim() || rawFrom || 'Cliente';

              // Skip emails sent from the center itself or empty senders
              if (!rawFrom || rawFrom === centerEmail || rawFrom.includes('salvadoraconesa')) {
                continue;
              }

              // Generate unique external ID for deduplication
              const messageIdHeader = parsed.messageId?.trim();
              const externalId = messageIdHeader || `imap_${folder}_uid_${msg.uid}`;

              // Check if already processed
              const alreadyExists = await this.messagesService.existsByExternalId(externalId);
              if (alreadyExists) {
                continue;
              }

          const rawSubject = (parsed.subject || '').trim();
          const cleanSubject = rawSubject.replace(/^\[SPAM\]\s*/i, '').trim() || 'Consulta por correo';
          const fullBody = parsed.text || (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '') || '';
          const cleanedBody = this.cleanReplyBody(fullBody);

          if (!cleanedBody && !cleanSubject) {
            continue;
          }

          this.logger.log(`📥 Incoming email received from ${rawFrom} (UID: ${msg.uid}, Subject: "${cleanSubject}")`);

          // 1. Identify or create Contact
          let contact = await this.contactsService.findByPhoneOrEmail(undefined, rawFrom);
          if (!contact) {
            // Spanish mobile E.164 format (+34600xxxxxx) to ensure phone validation succeeds
            const rand6 = Math.floor(100000 + Math.random() * 900000);
            contact = await this.contactsService.create({
              name: fromName,
              email: rawFrom,
              phone: `+34600${rand6}`,
              source: 'email_inbound',
            });
          }

          // 2. Resolve Thread ID
          const threadId = `salvadora:email:${rawFrom}`;
          await this.messagesService.linkContact(threadId, contact.id);

          // 3. Save Inbound Message in CRM
          const inboundMsg = await this.messagesService.saveMessage({
            contactId: contact.id,
            threadId,
            direction: MessageDirection.INBOUND,
            channel: MessageChannel.EMAIL,
            body: cleanedBody || cleanSubject,
            externalId,
            status: MessageStatus.RECEIVED,
          });

          // Emit SSE for real-time inbox updates
          this.eventEmitter.emit('conversation.updated', { threadId });
          const view = toMessageView(inboundMsg);
          this.eventEmitter.emit('message.received', { ...view, threadId });

          processedCount++;
          const processResult: any = {
            uid: msg.uid,
            from: rawFrom,
            subject: cleanSubject,
            actionTaken: 'recorded_inbound',
          };

          // 4. Check conversation handoff status
          const conv = await this.messagesService.getConversation(threadId);

          if (conv?.handoff) {
            this.logger.log(`Thread ${threadId} is in human handoff. Suppressing automated AI reply.`);
            processResult.actionTaken = 'handoff_active_notified_operator';

            this.eventEmitter.emit('human_handoff.requested', {
              channel: 'email',
              customerName: contact.name,
              customerEmail: rawFrom,
              customerPhone: contact.phone,
              threadId,
              reason: `Nuevo correo de ${contact.name} en hilo con atención humana activa:\n"${cleanedBody}"`,
            });
          } else {
            // 5. Intelligent AI Qualification & Reply
            const history = await this.messagesService.getThreadMessages(threadId);
            const evaluation = await this.emailDialogueEvaluatorService.evaluateEmail({
              contact: {
                id: contact.id,
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                notes: contact.notes,
              },
              threadHistory: history.map((m) => ({
                direction: m.direction,
                body: m.body,
                createdAt: m.createdAt,
              })),
              latestInbound: {
                subject: cleanSubject,
                body: cleanedBody,
              },
            });

            this.logger.log(
              `AI Qualification for ${rawFrom}: [${evaluation.intent}] - ${evaluation.reasoning}`,
            );

            if (evaluation.intent === 'HUMAN_HANDOFF') {
              // Mark conversation in handoff
              await this.messagesService.setHandoff(threadId, true);
              this.eventEmitter.emit('conversation.updated', { threadId });

              // Notify operators via decoupled event
              this.eventEmitter.emit('human_handoff.requested', {
                channel: 'email',
                customerName: contact.name,
                customerEmail: rawFrom,
                customerPhone: contact.phone,
                threadId,
                reason: `Atención personalizada requerida (${evaluation.reasoning}):\n"${cleanedBody}"`,
              });

              // Send polite acknowledgment informing that Salvadora will respond
              if (evaluation.replyBody) {
                try {
                  await this.emailService.send(
                    contact.id,
                    evaluation.replySubject,
                    evaluation.replyBody,
                    'sistema',
                  );

                  const outMsg = await this.messagesService.saveMessage({
                    contactId: contact.id,
                    threadId,
                    direction: MessageDirection.OUTBOUND,
                    channel: MessageChannel.EMAIL,
                    body: evaluation.replyBody,
                    status: MessageStatus.SENT,
                  });

                  this.eventEmitter.emit('message.sent', { ...toMessageView(outMsg), threadId });
                  this.eventEmitter.emit('conversation.updated', { threadId });
                } catch (sendErr) {
                  this.logger.warn(`Could not send handoff acknowledgment email: ${sendErr}`);
                }
              }

              processResult.actionTaken = 'human_handoff_triggered';
            } else if (evaluation.intent === 'AUTO_BOOKING' || evaluation.intent === 'AUTO_INFO') {
              // Send automated intelligent email reply
              if (evaluation.replyBody) {
                try {
                  await this.emailService.send(
                    contact.id,
                    evaluation.replySubject,
                    evaluation.replyBody,
                    'sistema',
                  );

                  const outMsg = await this.messagesService.saveMessage({
                    contactId: contact.id,
                    threadId,
                    direction: MessageDirection.OUTBOUND,
                    channel: MessageChannel.EMAIL,
                    body: evaluation.replyBody,
                    status: MessageStatus.SENT,
                  });

                  this.eventEmitter.emit('message.sent', { ...toMessageView(outMsg), threadId });
                  this.eventEmitter.emit('conversation.updated', { threadId });

                  processResult.actionTaken =
                    evaluation.intent === 'AUTO_BOOKING' ? 'auto_booking_replied' : 'auto_info_replied';
                } catch (sendErr) {
                  this.logger.warn(`Could not send automated reply email: ${sendErr}`);
                }
              }
            }
          }

            details.push(processResult);
          } catch (msgErr) {
            this.logger.error(
              `Error processing inbound email UID ${msg.uid}: ${msgErr}`,
            );
          }
          }
        } finally {
          if (lock) {
            lock.release();
          }
        }
      }

      acc.lastImapCheckAt = new Date();
      await this.accountRepo.save(acc);

      await client.logout();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      this.logger.error(`Error syncing inbound emails via IMAP: ${errMsg}`);
      return { processedCount, details, error: errMsg };
    } finally {
      this.isPolling = false;
    }

    return { processedCount, details };
  }

  /**
   * Strip quoted previous messages and email disclaimers so only the customer's
   * new reply text is stored and analyzed.
   */
  private cleanReplyBody(text: string): string {
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    const cleanLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Match common Spanish & English reply dividers:
      if (
        trimmed.startsWith('________________________________') ||
        trimmed.startsWith('-----Mensaje original-----') ||
        trimmed.startsWith('-----Original Message-----') ||
        /^De:\s+/i.test(trimmed) ||
        /^From:\s+/i.test(trimmed) ||
        /^Enviado el:\s+/i.test(trimmed) ||
        /^Sent:\s+/i.test(trimmed) ||
        /^El(\s+El)?\s+.+,\s+.+\s+escribi[oó]:/i.test(trimmed) ||
        /^El(\s+El)?\s+.+\s+a las\s+[0-9]{1,2}:[0-9]{2}/i.test(trimmed) ||
        /^On\s+.+,\s+.+\s+wrote:/i.test(trimmed) ||
        /^On\s+.+at\s+[0-9]{1,2}:[0-9]{2}/i.test(trimmed) ||
        trimmed.startsWith('>')
      ) {
        break;
      }
      cleanLines.push(line);
    }

    const result = cleanLines.join('\n').trim();
    return result.length > 0 ? result : text.trim();
  }
}
