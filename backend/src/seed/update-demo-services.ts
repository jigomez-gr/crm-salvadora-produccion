import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { DataSource } from 'typeorm';
import { Service, ServicePaymentType } from '../common/entities/service.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { Contact } from '../common/entities/contact.entity';
import { Appointment } from '../common/entities/appointment.entity';
import { Message } from '../common/entities/message.entity';
import { Conversation } from '../common/entities/conversation.entity';
import { AppointmentReminder } from '../common/entities/appointment-reminder.entity';
import { User } from '../common/entities/user.entity';
import { AuditLog } from '../common/entities/audit-log.entity';
import { AppSettings } from '../common/entities/app-settings.entity';
import { KnowledgeDocument } from '../common/entities/knowledge-document.entity';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';
import { EmailAccount } from '../common/entities/email-account.entity';
import { EmailMessage } from '../common/entities/email-message.entity';
import { PaymentAccount } from '../common/entities/payment-account.entity';

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgresql://crm:crm@localhost:5433/crm_academy',
    entities: [
      Contact,
      Appointment,
      Service,
      AgentConfig,
      Message,
      Conversation,
      AppointmentReminder,
      User,
      AuditLog,
      AppSettings,
      KnowledgeDocument,
      KnowledgeChunk,
      EmailAccount,
      EmailMessage,
      PaymentAccount,
    ],
    synchronize: true,
  });

  await dataSource.initialize();
  const serviceRepo = dataSource.getRepository(Service);
  const agentRepo = dataSource.getRepository(AgentConfig);

  // 1. Ensure Concierto Cantar del Alma (Giglon) exists
  let giglonSvc = await serviceRepo.findOne({ where: { name: 'Concierto Cantar del Alma' } });
  if (!giglonSvc) {
    giglonSvc = serviceRepo.create({
      name: 'Concierto Cantar del Alma',
      description: 'Concierto en directo en el Ateneo de Madrid. Entradas oficiales en Giglon.',
      durationMinutes: 90,
      price: '18.00',
      paymentType: ServicePaymentType.EXTERNAL_URL,
      externalPaymentUrl: 'https://www.giglon.com/todos?idEvent=cantar-del-alma',
      calendarId: 'cal-conciertos',
      isActive: true,
      requiresApproval: false,
    });
  } else {
    giglonSvc.price = '18.00';
    giglonSvc.paymentType = ServicePaymentType.EXTERNAL_URL;
    giglonSvc.externalPaymentUrl = 'https://www.giglon.com/todos?idEvent=cantar-del-alma';
  }
  await serviceRepo.save(giglonSvc);

  // 2. Ensure Clase de Yoga (Stripe) exists with price and Stripe paymentType
  let stripeSvc = await serviceRepo.findOne({ where: { name: 'Clase de Yoga (Hatha / Vinyasa)' } });
  if (!stripeSvc) {
    stripeSvc = serviceRepo.create({
      name: 'Clase de Yoga (Hatha / Vinyasa)',
      description: 'Práctica de yoga presencial de 75 minutos con reserva y pago online.',
      durationMinutes: 75,
      price: '15.00',
      paymentType: ServicePaymentType.STRIPE,
      calendarId: 'cal-yoga',
      isActive: true,
      requiresApproval: false,
    });
  } else {
    stripeSvc.price = '15.00';
    stripeSvc.paymentType = ServicePaymentType.STRIPE;
  }
  await serviceRepo.save(stripeSvc);

  // 3. Ensure Retiro & Viaje a la Sierra (Event with Quorum) exists
  let retreatSvc = await serviceRepo.findOne({ where: { name: 'Retiro & Viaje a la Sierra de Gredos' } });
  if (!retreatSvc) {
    retreatSvc = serviceRepo.create({
      name: 'Retiro & Viaje a la Sierra de Gredos',
      description: 'Viaje y retiro de fin de mes en la naturaleza con yoga, meditación y senderismo. Plazas limitadas.',
      serviceType: 'event',
      eventDatesText: 'Del 25 al 28 de Octubre de 2026',
      maxCapacity: 30,
      minQuorum: 30,
      durationMinutes: 4320, // 3 days
      price: '250.00',
      paymentType: ServicePaymentType.STRIPE,
      calendarId: 'cal-retiros',
      isActive: true,
      requiresApproval: false,
    });
  } else {
    retreatSvc.serviceType = 'event';
    retreatSvc.eventDatesText = 'Del 25 al 28 de Octubre de 2026';
    retreatSvc.maxCapacity = 30;
    retreatSvc.minQuorum = 30;
    retreatSvc.price = '250.00';
    retreatSvc.paymentType = ServicePaymentType.STRIPE;
  }
  await serviceRepo.save(retreatSvc);

  // 4. Update all agents to include the active services with event/quorum info
  const allServices = await serviceRepo.find({ where: { isActive: true } });
  const agents = await agentRepo.find();
  for (const agent of agents) {
    agent.services = allServices.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      price: s.price || undefined,
      serviceType: s.serviceType,
      eventDatesText: s.eventDatesText || undefined,
      maxCapacity: s.maxCapacity || undefined,
      minQuorum: s.minQuorum || undefined,
      paymentType: s.paymentType,
      externalPaymentUrl: s.externalPaymentUrl || undefined,
      calendarId: s.calendarId,
      requiresApproval: s.requiresApproval,
    })) as any;
    await agentRepo.save(agent);
  }

  console.log('Servicios de prueba actualizados con éxito:');
  console.log(`- Giglon: ${giglonSvc.name} -> ${giglonSvc.externalPaymentUrl}`);
  console.log(`- Stripe: ${stripeSvc.name} -> ${stripeSvc.price} € (Stripe Checkout)`);
  console.log(`- Viaje / Quórum: ${retreatSvc.name} -> Fechas: ${retreatSvc.eventDatesText}, Plazas: ${retreatSvc.maxCapacity}, Quórum: ${retreatSvc.minQuorum}`);

  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
