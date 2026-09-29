import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmailDialogueEvaluatorService } from './email-dialogue-evaluator.service';
import { Service } from '../common/entities/service.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';

describe('EmailDialogueEvaluatorService', () => {
  let service: EmailDialogueEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailDialogueEvaluatorService,
        {
          provide: getRepositoryToken(AgentConfig),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              agentKey: 'booking',
              openrouterApiKey: 'sk-mock-key',
              model: 'openai/gpt-4.1-mini',
            }),
          },
        },
        {
          provide: getRepositoryToken(Service),
          useValue: {
            find: jest.fn().mockResolvedValue([
              {
                id: 's1',
                name: 'Hatha Yoga Terapéutico',
                price: '55.00',
                scheduleText: 'Martes y Jueves 10:00 y 18:00',
                isActive: true,
              },
            ]),
          },
        },
      ],
    }).compile();

    service = module.get<EmailDialogueEvaluatorService>(EmailDialogueEvaluatorService);

    // Mock callOpenRouter
    jest.spyOn<any, any>(service, 'callOpenRouter').mockImplementation((_apiKey: string, _model: string, messages: any[]) => {
      const userMsg = messages[1]?.content || '';
      if (userMsg.includes('quiero reserver una cita para yoga') || userMsg.includes('reservar')) {
        return Promise.resolve(
          JSON.stringify({
            intent: 'AUTO_BOOKING',
            reasoning: 'El cliente quiere agendar una cita de yoga.',
            extractedBooking: { serviceName: 'Hatha Yoga Terapéutico' },
            replySubject: 'Re: Información sobre servicios, horarios y precios — Reserva de Plaza',
            replyBody: 'Hola Jose,\n\nEstaremos encantados de asignarte plaza en Hatha Yoga Terapéutico. ¿Prefieres turno de mañana (10:00) o de tarde (18:00)?',
          }),
        );
      }
      if (userMsg.includes('hablar con Salvadora') || userMsg.includes('lesión')) {
        return Promise.resolve(
          JSON.stringify({
            intent: 'HUMAN_HANDOFF',
            reasoning: 'Consulta clínica personalizada.',
            handoffReason: 'Requiere valoración de Salvadora',
            replySubject: 'Re: Consulta — Centro de Yoga Salvadora Conesa',
            replyBody: 'Hola Jose,\n\nHe trasladado tu mensaje directamente a Salvadora para que te responda con detenimiento.',
          }),
        );
      }
      if (userMsg.includes('YCloud') || userMsg.includes('factura') || userMsg.includes('diseño web')) {
        return Promise.resolve(
          JSON.stringify({
            intent: 'IGNORE',
            reasoning: 'Mensaje de empresa o ajeno a la escuela de yoga.',
            replySubject: null,
            replyBody: null,
          }),
        );
      }
      return Promise.resolve(
        JSON.stringify({
          intent: 'AUTO_INFO',
          reasoning: 'Consulta informativa general.',
          replySubject: 'Re: Consulta general',
          replyBody: 'Hola,\n\nLas esterillas están incluidas en la sala.',
        }),
      );
    });
  });

  it('classifies booking intent and generates booking progression reply', async () => {
    const result = await service.evaluateEmail({
      contact: {
        id: 'c1',
        name: 'Jose Gomez',
        email: 'jigomez@hotmail.com',
      },
      threadHistory: [
        {
          direction: 'outbound',
          body: 'Hola Jose, aquí tienes la información de servicios...',
        },
      ],
      latestInbound: {
        subject: 'RE: Información sobre servicios, horarios y precios',
        body: 'buenas tardes quiero reserver una cita para yoga',
      },
    });

    expect(result.intent).toBe('AUTO_BOOKING');
    expect(result.replyBody).toContain('Hatha Yoga Terapéutico');
    expect(result.replySubject).toContain('Reserva');
  });

  it('classifies human handoff intent when custom medical or personal attention is requested', async () => {
    const result = await service.evaluateEmail({
      contact: {
        id: 'c2',
        name: 'Ana',
        email: 'ana@example.com',
      },
      threadHistory: [],
      latestInbound: {
        subject: 'Consulta especial',
        body: 'Hola, tengo una lesión lumbar grave y quiero hablar con Salvadora para ver si puedo ir.',
      },
    });

    expect(result.intent).toBe('HUMAN_HANDOFF');
    expect(result.replyBody).toContain('Salvadora');
  });

  it('classifies info intent for basic queries', async () => {
    const result = await service.evaluateEmail({
      contact: {
        id: 'c3',
        name: 'Carlos',
        email: 'carlos@example.com',
      },
      threadHistory: [],
      latestInbound: {
        subject: 'Duda esterilla',
        body: '¿Tengo que llevar mi propia esterilla o la ponéis vosotros?',
      },
    });

    expect(result.intent).toBe('AUTO_INFO');
    expect(result.replyBody).toContain('esterillas');
  });

  it('classifies corporate and non-yoga emails as IGNORE with no reply', async () => {
    const result = await service.evaluateEmail({
      contact: {
        id: 'c4',
        name: 'Empresa Externa',
        email: 'ventas@disenoweb.com',
      },
      threadHistory: [],
      latestInbound: {
        subject: 'Oferta de diseño web y posicionamiento SEO',
        body: 'Le ofrecemos servicios de diseño web para su empresa a precio reducido.',
      },
    });

    expect(result.intent).toBe('IGNORE');
    expect(result.replyBody).toBeUndefined();
  });
});
