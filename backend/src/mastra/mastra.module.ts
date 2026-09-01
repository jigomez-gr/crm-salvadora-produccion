import { Module, Logger } from '@nestjs/common';
import { MastraModule as NestMastraModule } from '@mastra/nestjs';
import { Mastra } from '@mastra/core/mastra';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { ContactsModule } from '../contacts/contacts.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PaymentsModule } from '../payments/payments.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ContactsService } from '../contacts/contacts.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { PaymentsService } from '../payments/payments.service';
import { MessagesService } from '../conversations/messages.service';
import { createBookingAgent, TEMPLATE_AGENT_ID } from './booking-agent';

export { NestMastraModule };

@Module({
  imports: [
    ContactsModule,
    AppointmentsModule,
    PaymentsModule,
    ConversationsModule,
    NestMastraModule.registerAsync({
      imports: [
        ContactsModule,
        AppointmentsModule,
        PaymentsModule,
        ConversationsModule,
      ],
      useFactory: (
        contactsService: ContactsService,
        appointmentsService: AppointmentsService,
        paymentsService: PaymentsService,
        messagesService: MessagesService,
      ) => {
        const databaseUrl =
          process.env.DATABASE_URL ||
          'postgresql://crm:crm@localhost:5432/crm_salvadora';

        const store = new PostgresStore({ id: 'crm-salvadora', connectionString: databaseUrl });
        const memory = new Memory({ storage: store });

        const logger = new Logger('AgentTools');
        // Mastra swallows tool errors (feeds them back to the model) — log them here
        const traced = <A extends any[], R>(name: string, fn: (...args: A) => Promise<R>) =>
          async (...args: A): Promise<R> => {
            try {
              return await fn(...args);
            } catch (err) {
              // Do not log args — they contain customer PII (phone, ids, names).
              logger.error(`Tool ${name} failed: ${err}`);
              throw err;
            }
          };

        // Pure data operations. Per-agent config (services, hours, timezone) is
        // read from requestContext inside the tools, not here.
        const deps = {
          findContact: async (phone?: string, email?: string) => {
            return contactsService.findByPhoneOrEmail(phone, email);
          },
          findContactByPhone: async (phone: string) => {
            return contactsService.findByPhone(phone);
          },
          createContact: async (phone: string, name?: string, email?: string) => {
            return contactsService.upsertByPhone(phone, name, {
              email,
              source: 'landing',
              tags: ['lead_landing_web'],
            });
          },
          updateContact: async (
            contactId: string,
            fields: { name?: string; email?: string; phone?: string },
          ) => {
            return contactsService.update(contactId, fields);
          },
          linkThreadContact: async (threadId: string, contactId: string) => {
            return messagesService.linkContact(threadId, contactId);
          },
          getThreadContact: async (threadId: string) => {
            const conv = await messagesService
              .getConversation(threadId)
              .catch(() => null);
            if (conv?.contactId) {
              return contactsService.findById(conv.contactId).catch(() => null);
            }
            return null;
          },
          getAvailableSlots: traced('getAvailableSlots', async (
            date: string,
            durationMinutes: number,
            workingHours: any[],
            timezone: string,
            calendarId?: string,
            serviceId?: string,
            serviceName?: string,
          ) => {
            const slots = await appointmentsService.getAvailableSlots(
              new Date(date),
              durationMinutes,
              workingHours,
              timezone,
              new Date(),
              calendarId || 'default',
              serviceId,
              serviceName,
            );
            return slots.map((s) => ({
              startsAt: s.startsAt.toISOString(),
              endsAt: s.endsAt.toISOString(),
            }));
          }),
          bookAppointment: traced('bookAppointment', async (
            contactId: string,
            service: string,
            startsAt: string,
            durationMinutes: number,
            price?: string,
            calendarId?: string,
            status?: string,
            serviceId?: string,
            modality?: string,
            reason?: string,
          ) => {
            const start = new Date(startsAt);
            const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
            return appointmentsService.create({
              contactId,
              service,
              startsAt: start.toISOString(),
              endsAt: end.toISOString(),
              price,
              calendarId: calendarId || 'default',
              status: (status as any) || undefined,
              serviceId,
              modality,
              reason,
            });
          }),
          listContactAppointments: async (contactId: string) => {
            return appointmentsService.findByContact(contactId);
          },
          cancelAppointment: async (appointmentId: string) => {
            return appointmentsService.cancelAppointment(appointmentId);
          },
          createPaymentLink: traced('createPaymentLink', async (params) => {
            return paymentsService.createCheckoutSession({
              appointmentId: params.appointmentId,
              contactId: params.contactId,
              amount: params.amount,
              title: params.title,
              description: params.description,
              customerName: params.customerName,
              customerEmail: params.customerEmail,
            });
          }),
        };

        const agent = createBookingAgent(deps, memory);

        const mastra = new Mastra({
          agents: { [TEMPLATE_AGENT_ID]: agent },
          storage: store,
        });

        return { mastra };
      },
      inject: [ContactsService, AppointmentsService, PaymentsService],
    }),
  ],
  exports: [NestMastraModule],
})
export class AppMastraModule {}
