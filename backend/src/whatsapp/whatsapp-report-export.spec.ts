jest.mock(
  '@mastra/core/agent',
  () => ({
    Agent: class MockAgent {
      constructor(c: any) {
        Object.assign(this, c);
      }
    },
  }),
  { virtual: true },
);
jest.mock(
  '@mastra/core/tools',
  () => ({
    createTool: (t: any) => t,
  }),
  { virtual: true },
);
jest.mock('@mastra/memory', () => ({ Memory: class {} }), { virtual: true });

import {
  generatePaymentsCsv,
  generatePaymentsXlsx,
  generatePaymentsPdf,
} from '../appointments/payments-export.generator';
import { Appointment, PaymentStatus } from '../common/entities/appointment.entity';
import { Contact } from '../common/entities/contact.entity';
import { createBookingAgent } from '../mastra/booking-agent';

describe('WhatsApp Report Export - Estado Actualizado de Facturación y Cobros', () => {
  const mockContact = {
    id: 'contact-uuid-1',
    name: 'María García',
    phone: '+34600112233',
    email: 'maria@example.com',
  } as Contact;

  const mockAppointments: Appointment[] = [
    {
      id: 'appt-1',
      service: 'Hatha Yoga Terapéutico',
      startsAt: new Date('2026-11-10T10:00:00Z'),
      endsAt: new Date('2026-11-10T11:30:00Z'),
      price: '25.00',
      paidAmount: '25.00',
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'cash',
      paidAt: new Date('2026-11-10T11:30:00Z'),
      paymentRegisteredBy: 'Administrador',
      paymentNotes: 'Cobrado en mano',
      contact: mockContact,
    } as any,
    {
      id: 'appt-2',
      service: 'Baño de Gong y Meditación Sonora',
      startsAt: new Date('2026-11-21T18:00:00Z'),
      endsAt: new Date('2026-11-21T20:00:00Z'),
      price: '16.00',
      paidAmount: null,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: null,
      paidAt: null,
      paymentRegisteredBy: null,
      paymentNotes: null,
      contact: mockContact,
    } as any,
  ];

  const mockSummary = {
    totalCount: 2,
    paidCount: 1,
    pendingCount: 1,
    totalPaidAmount: 25.0,
    totalPendingAmount: 16.0,
  };

  const reportTitle = 'Estado Actualizado de Facturacion de Servicios y Cobros al usuario';

  describe('Generators with custom reportTitle', () => {
    it('generates CSV with custom reportTitle and UTF-8 BOM', () => {
      const csvBuffer = generatePaymentsCsv(
        mockAppointments,
        mockSummary,
        'Usuario: María García',
        reportTitle,
      );
      const csvText = csvBuffer.toString('utf-8');

      expect(csvText).toContain(reportTitle.toUpperCase());
      expect(csvText).toContain('María García');
      expect(csvText).toContain('25,00 €');
      expect(csvText).toContain('16,00 €');
    });

    it('generates XLSX with custom reportTitle', async () => {
      const xlsxBuffer = await generatePaymentsXlsx(
        mockAppointments,
        mockSummary,
        'Usuario: María García',
        reportTitle,
      );

      expect(Buffer.isBuffer(xlsxBuffer)).toBe(true);
      expect(xlsxBuffer.length).toBeGreaterThan(1000);
      // Valid ZIP/XLSX starts with PK (0x50 0x4B)
      expect(xlsxBuffer[0]).toBe(0x50);
      expect(xlsxBuffer[1]).toBe(0x4b);
    });

    it('generates PDF with custom reportTitle', async () => {
      const pdfBuffer = await generatePaymentsPdf(
        mockAppointments,
        mockSummary,
        'Usuario: María García',
        reportTitle,
      );

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(1000);
      // Valid PDF starts with %PDF-
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('Agent tool: generarInformeFacturacionCobros', () => {
    let mockGetAppointmentPayments: jest.Mock;
    let mockSendWhatsAppMedia: jest.Mock;
    let agent: any;

    beforeEach(() => {
      mockGetAppointmentPayments = jest.fn().mockResolvedValue({
        items: mockAppointments,
        summary: mockSummary,
      });

      mockSendWhatsAppMedia = jest.fn().mockResolvedValue({
        ok: true,
        providerMessageId: 'prov-msg-123',
      });

      const deps: any = {
        findContactByPhone: jest.fn().mockResolvedValue(mockContact),
        getAppointmentPayments: mockGetAppointmentPayments,
        sendWhatsAppMedia: mockSendWhatsAppMedia,
      };

      const memory: any = {};
      agent = createBookingAgent(deps, memory);
    });

    it('refuses execution if channel is not whatsapp (exclusive for whatsapp)', async () => {
      const tool = agent.tools.generarInformeFacturacionCobros;
      expect(tool).toBeDefined();

      const context: any = {
        requestContext: {
          get: (key: string) => {
            if (key === 'channel') return 'landing';
            if (key === 'threadId') return 'web-session-123';
            return null;
          },
        },
      };

      const result = await tool.execute({}, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('WhatsApp');
      expect(mockSendWhatsAppMedia).not.toHaveBeenCalled();
    });

    it('executes successfully and sends the 3 formats (PDF, Excel, CSV) when called from WhatsApp', async () => {
      const tool = agent.tools.generarInformeFacturacionCobros;

      const context: any = {
        requestContext: {
          get: (key: string) => {
            if (key === 'channel') return 'whatsapp';
            if (key === 'threadId') return 'whatsapp:+34600112233';
            if (key === 'customer') {
              return {
                contactId: 'contact-uuid-1',
                phone: '+34600112233',
                name: 'María García',
              };
            }
            return null;
          },
        },
      };

      const input = {
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        paymentStatus: 'all' as const,
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.reportTitle).toBe(reportTitle);
      expect(result.totalCitas).toBe(2);
      expect(result.totalCobrado).toBe('25.00 €');
      expect(result.totalPendiente).toBe('16.00 €');
      expect(result.formatosGenerados).toEqual(['PDF', 'Excel (.xlsx)', 'CSV (.csv)']);

      // Verifies payments were queried with the user-specified parameters
      expect(mockGetAppointmentPayments).toHaveBeenCalledWith({
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        service: undefined,
        paymentStatus: 'all',
        paymentMethod: undefined,
        search: undefined,
        contactId: 'contact-uuid-1',
      });

      // Verifies sendWhatsAppMedia was called 3 times (PDF, XLSX, CSV)
      expect(mockSendWhatsAppMedia).toHaveBeenCalledTimes(3);

      // Check PDF send
      expect(mockSendWhatsAppMedia).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          to: '+34600112233',
          caption: expect.stringContaining('(PDF)'),
          media: expect.objectContaining({
            mimeType: 'application/pdf',
            filename: expect.stringMatching(/\.pdf$/),
          }),
        }),
      );

      // Check XLSX send
      expect(mockSendWhatsAppMedia).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          to: '+34600112233',
          caption: expect.stringContaining('(Excel)'),
          media: expect.objectContaining({
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: expect.stringMatching(/\.xlsx$/),
          }),
        }),
      );

      // Check CSV send
      expect(mockSendWhatsAppMedia).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          to: '+34600112233',
          caption: expect.stringContaining('(CSV)'),
          media: expect.objectContaining({
            mimeType: 'text/csv; charset=utf-8',
            filename: expect.stringMatching(/\.csv$/),
          }),
        }),
      );
    });
  });
});
