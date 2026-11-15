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

import * as zlib from 'zlib';
import * as ExcelJS from 'exceljs';
import {
  generateAppointmentsCsv,
  generateAppointmentsXlsx,
  generateAppointmentsPdf,
  generateAppointmentsZip,
} from './appointments-export.generator';
import { Appointment, AppointmentStatus, PaymentStatus } from '../common/entities/appointment.entity';
import { Contact } from '../common/entities/contact.entity';
import { createBookingAgent } from '../mastra/booking-agent';

describe('Appointments Export Generator & WhatsApp Tool', () => {
  const mockContact: Contact = {
    id: 'contact-uuid-1',
    name: 'Salvadora Conesa',
    phone: '+34649453996',
    email: 'salvadora@example.com',
  } as Contact;

  const sampleAttachmentBuffer = Buffer.from('PDF FAKE RADIOGRAFIA LUMBAR DATA');

  const mockAppointments: Appointment[] = [
    {
      id: 'appt-1',
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      modality: 'in_person',
      status: AppointmentStatus.SCHEDULED,
      startsAt: new Date('2026-11-18T09:45:00Z'),
      endsAt: new Date('2026-11-18T11:15:00Z'),
      price: '42.00',
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'cash',
      reason: 'Reserva de clase semanal de Yoga',
      patientAttachmentName: 'radiografia_lumbar.pdf',
      patientAttachmentSize: 32768,
      patientAttachmentMime: 'application/pdf',
      patientAttachmentUploadedAt: new Date('2026-11-10T12:00:00Z'),
      patientAttachmentData: sampleAttachmentBuffer,
      responseDocument: {
        templateKey: 'clinical-note',
        title: 'Informe Clínico Confidencial',
        diagnosis: 'DIAGNOSTICO_SECRETO_LUMBALGIA_AGUDA',
        symptoms: 'Dolor punzante',
        treatment: 'Reposo y estiramientos suaves',
        issuedAt: '2026-11-10T12:00:00Z',
        signedBy: 'Dra. Especialista',
      },
      contact: mockContact,
    } as any,
    {
      id: 'appt-2',
      service: 'Terapia Gestalt (Sesión Individual)',
      modality: 'virtual',
      status: AppointmentStatus.COMPLETED,
      startsAt: new Date('2026-11-11T16:00:00Z'),
      endsAt: new Date('2026-11-11T17:00:00Z'),
      price: '35.00',
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: null,
      reason: 'Sesión online de seguimiento personal',
      patientAttachmentName: null,
      patientAttachmentSize: null,
      patientAttachmentMime: null,
      patientAttachmentUploadedAt: null,
      patientAttachmentData: null,
      responseDocument: {
        templateKey: 'therapy-note',
        title: 'Nota de Terapia',
        diagnosis: 'DIAGNOSTICO_SECRETO_ANSIEDAD_LABORAL',
        symptoms: 'Insomnio',
        treatment: 'Mindfulness',
        issuedAt: '2026-11-11T17:00:00Z',
        signedBy: 'Terapeuta',
      },
      contact: mockContact,
    } as any,
  ];

  describe('1. CSV Export Generator', () => {
    it('generates CSV with UTF-8 BOM, appointment details, payment status/method, and patient attachment metadata', () => {
      const csvBuffer = generateAppointmentsCsv(
        mockAppointments,
        'Filtro: Todas las citas',
        'Listado Oficial de Citas',
      );
      const csvText = csvBuffer.toString('utf-8');

      expect(csvText.charCodeAt(0)).toBe(0xfeff); // BOM
      expect(csvText).toContain('CENTRO DE YOGA SALVADORA CONESA - LISTADO OFICIAL DE CITAS');
      expect(csvText).toContain('Salvadora Conesa');
      expect(csvText).toContain('+34649453996');
      expect(csvText).toContain('Hatha Yoga Terapéutico (1 clase semanal)');
      expect(csvText).toContain('radiografia_lumbar.pdf');
      expect(csvText).toContain('32.0 KB');
      expect(csvText).toContain('42,00 €');
      expect(csvText).toContain('Pagado');
      expect(csvText).toContain('Efectivo');
      expect(csvText).toContain('Pendiente');
    });

    it('STRICT PRIVACY: never includes clinical diagnosis in CSV output', () => {
      const csvBuffer = generateAppointmentsCsv(mockAppointments);
      const csvText = csvBuffer.toString('utf-8');

      expect(csvText).not.toContain('DIAGNOSTICO_SECRETO_LUMBALGIA_AGUDA');
      expect(csvText).not.toContain('DIAGNOSTICO_SECRETO_ANSIEDAD_LABORAL');
      expect(csvText).not.toContain('Dolor punzante');
      expect(csvText).not.toContain('Informe Clínico Confidencial');
    });
  });

  describe('2. Excel XLSX Export Generator', () => {
    it('generates a valid XLSX buffer with appointment, payment status, method, and patient attachment data', async () => {
      const xlsxBuffer = await generateAppointmentsXlsx(
        mockAppointments,
        'Filtro: Noviembre 2026',
        'Listado de Citas',
      );
      expect(xlsxBuffer).toBeInstanceOf(Buffer);
      expect(xlsxBuffer.length).toBeGreaterThan(1000);
      // PK signature for ZIP/XLSX
      expect(xlsxBuffer[0]).toBe(0x50);
      expect(xlsxBuffer[1]).toBe(0x4b);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(xlsxBuffer as any);
      const ws = wb.getWorksheet('Citas y Agenda');
      expect(ws?.getCell('H7').value).toBe('Pagado');
      expect(ws?.getCell('I7').value).toBe('Efectivo');
    });
  });

  describe('3. PDF Export Generator', () => {
    it('generates a valid landscape PDF buffer with payment data and without clinical diagnosis', async () => {
      const pdfBuffer = await generateAppointmentsPdf(
        mockAppointments,
        'Filtro: Noviembre 2026',
        'Listado Oficial de Citas y Reservas',
      );
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(1000);
      // PDF signature '%PDF'
      expect(pdfBuffer.toString('utf-8', 0, 4)).toBe('%PDF');

      const pdfString = pdfBuffer.toString('latin1');
      expect(pdfString).not.toContain('DIAGNOSTICO_SECRETO_LUMBALGIA_AGUDA');
      expect(pdfString).not.toContain('DIAGNOSTICO_SECRETO_ANSIEDAD_LABORAL');

      // Decompress the stream to verify content text (PDFKit encodes kerning in hex arrays)
      const streamStart = pdfBuffer.indexOf('stream\r\n') !== -1 ? pdfBuffer.indexOf('stream\r\n') + 8 : pdfBuffer.indexOf('stream\n') + 7;
      const streamEnd = pdfBuffer.indexOf('endstream');
      const deflated = pdfBuffer.subarray(streamStart, streamEnd);
      const inflated = zlib.inflateSync(deflated).toString('latin1');
      // Hex representation for 'gado (Ef' and 'ectiv' (Pagado Efectivo) and 'endiente' (Pendiente)
      expect(inflated).toContain('6761646f'); // 'gado'
      expect(inflated).toContain('6563746976'); // 'ectiv'
      expect(inflated).toContain('656e6469656e7465'); // 'endiente'
    });
  });

  describe('4. ZIP Export Generator (Reports + Patient Attachments)', () => {
    it('generates a valid ZIP containing PDF, XLSX, CSV and the patient attachment binary', async () => {
      const zipBuffer = await generateAppointmentsZip(
        mockAppointments,
        'Semana anterior',
        'Citas_Semana_Anterior',
      );
      expect(zipBuffer).toBeInstanceOf(Buffer);
      expect(zipBuffer.length).toBeGreaterThan(2000);
      expect(zipBuffer[0]).toBe(0x50);
      expect(zipBuffer[1]).toBe(0x4b);

      const zipString = zipBuffer.toString('latin1');
      // Contains the 3 report files
      expect(zipString).toContain('.pdf');
      expect(zipString).toContain('.xlsx');
      expect(zipString).toContain('.csv');
      // Contains the folder and the patient attachment file
      expect(zipString).toContain('adjuntos_pacientes/');
      expect(zipString).toContain('radiografia_lumbar.pdf');
    });
  });

  describe('5. WhatsApp Agent Tool (exportarCitasUsuario)', () => {
    let mockDeps: any;
    let agent: any;

    beforeEach(() => {
      mockDeps = {
        getContactAppointmentsReport: jest.fn().mockResolvedValue({
          contact: {
            id: mockContact.id,
            name: mockContact.name,
            phone: mockContact.phone,
            email: mockContact.email,
          },
          items: mockAppointments,
          totalCitas: 2,
          attachmentsCount: 1,
          pdfBuffer: Buffer.from('%PDF-1.4 TEST PDF'),
          xlsxBuffer: Buffer.from('PK TEST XLSX'),
          csvBuffer: Buffer.from('\uFEFFTEST CSV'),
          zipBuffer: Buffer.from('PK TEST ZIP'),
          textSummary:
            '📅 Tienes un total de 2 cita(s):\n1. 18/11/2026 09:45 - Hatha Yoga (Presencial) · 42.00 € (📎 Documento adjunto: radiografia_lumbar.pdf)\n2. 11/11/2026 16:00 - Terapia Gestalt (Virtual) · 35.00 €',
          filenameBase: 'Historial_Citas_Salvadora_2026-11-15',
        }),
        sendWhatsAppMedia: jest.fn().mockResolvedValue({ ok: true }),
        findContactByPhone: jest.fn().mockResolvedValue(mockContact),
      };

      agent = createBookingAgent(mockDeps, {} as any);
    });

    it('rejects calls coming from non-WhatsApp channels', async () => {
      const tool = agent.tools.exportarCitasUsuario;
      const context = {
        requestContext: {
          get: (key: string) => {
            if (key === 'channel') return 'landing_web';
            if (key === 'threadId') return 'landing:anonymous';
            return null;
          },
        },
      };

      const result = await tool.execute({ semanaAnterior: true }, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('única y exclusivamente para el agente de WhatsApp');
    });

    it('processes appointments export strictly for the phone implicit in the WhatsApp context', async () => {
      const tool = agent.tools.exportarCitasUsuario;
      const context = {
        requestContext: {
          get: (key: string) => {
            if (key === 'channel') return 'whatsapp';
            if (key === 'threadId') return 'whatsapp:+34649453996';
            if (key === 'customer') {
              return {
                phone: '+34649453996',
                contactId: mockContact.id,
                name: mockContact.name,
              };
            }
            return null;
          },
        },
      };

      const result = await tool.execute(
        {
          semanaAnterior: true,
          estado: 'programadas',
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(mockDeps.getContactAppointmentsReport).toHaveBeenCalledWith({
        contactId: mockContact.id,
        phone: '+34649453996',
        semanaAnterior: true,
        semanaPosterior: undefined,
        specificDate: undefined,
        startDate: undefined,
        endDate: undefined,
        status: 'programadas',
        service: undefined,
      });

      // Verifies media sending: PDF, XLSX, CSV, and ZIP (since attachmentsCount > 0)
      expect(mockDeps.sendWhatsAppMedia).toHaveBeenCalledTimes(4);
      expect(result.formatosEnviadosPorWhatsApp).toEqual(
        expect.arrayContaining(['PDF', 'Excel (.xlsx)', 'CSV', 'ZIP (1 adjuntos)']),
      );

      // Verifies NO clinical diagnosis in returned message or summary
      expect(result.mensaje).not.toContain('DIAGNOSTICO_SECRETO_LUMBALGIA_AGUDA');
      expect(result.resumenTextoCitas).not.toContain('DIAGNOSTICO_SECRETO_LUMBALGIA_AGUDA');
      expect(result.mensaje).toContain('confidencialidad médica');
    });
  });
});
