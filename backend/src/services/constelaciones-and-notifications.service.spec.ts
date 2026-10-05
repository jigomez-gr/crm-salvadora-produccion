import { resolveNextRecurringEventDate } from '../common/time';
import { ServicesService } from './services.service';
import { Service } from '../common/entities/service.entity';
import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';
import { Contact } from '../common/entities/contact.entity';

describe('Constelaciones & Pre-registered Attendee Notifications', () => {
  describe('resolveNextRecurringEventDate', () => {
    it('returns hasRule: false for Constelaciones Familiares (no forced last-Sunday rule)', () => {
      const res = resolveNextRecurringEventDate('Constelaciones Familiares', new Date('2026-10-01'));
      expect(res.hasRule).toBe(false);
      expect(res.dateText).toBeUndefined();
    });

    it('returns hasRule: false for Baño de Gong (scheduled directly by admin in CRM)', () => {
      const res = resolveNextRecurringEventDate('Baño de Gong y Meditación Sonora', new Date('2026-10-01'));
      expect(res.hasRule).toBe(false);
      expect(res.dateText).toBeUndefined();
    });
  });

  describe('ServicesService.notifyPreRegisteredAttendees', () => {
    let service: ServicesService;
    let appointmentRepo: any;
    let emailService: any;
    let serviceRepo: any;

    beforeEach(() => {
      appointmentRepo = {
        find: jest.fn(),
        save: jest.fn().mockImplementation((appt) => Promise.resolve(appt)),
      };
      emailService = {
        sendNotification: jest.fn().mockResolvedValue({ ok: true }),
      };
      serviceRepo = {
        find: jest.fn(),
        save: jest.fn(),
      };

      service = new ServicesService(
        serviceRepo,
        {} as any,
        {} as any,
        appointmentRepo,
        {} as any,
        {} as any,
        {} as any,
        { emit: jest.fn() } as any,
        emailService,
      );
    });

    it('updates provisional appointments to definitive date and sends notification email to pre-registered contacts', async () => {
      const targetService: Partial<Service> = {
        id: 'svc-constel-1',
        name: 'Constelaciones Familiares (Participante / Representante)',
        eventStartDate: new Date('2026-10-25T10:00:00.000Z'),
        eventEndDate: new Date('2026-10-25T14:00:00.000Z'),
        eventDatesText: 'Domingo 25 de Octubre de 2026 (10:00 a 14:00)',
        durationMinutes: 240,
        price: '20.00',
        sinfechadefinitiva: 'N',
      };

      const mockContact: Partial<Contact> = {
        id: 'contact-ji-1',
        name: 'Jose Ignacio Gomez',
        email: 'jigomezjub@gmail.com',
        emailerroneo: 'N',
        optedOut: false,
      };

      const mockAppt: Partial<Appointment> = {
        id: 'appt-constel-1',
        serviceId: 'svc-constel-1',
        service: 'Constelaciones Familiares (Participante / Representante)',
        status: AppointmentStatus.SCHEDULED,
        startsAt: new Date('2099-12-31T20:00:00.000Z'),
        endsAt: new Date('2099-12-31T24:00:00.000Z'),
        contact: mockContact as Contact,
      };

      appointmentRepo.find.mockResolvedValue([mockAppt]);

      const notifiedCount = await service.notifyPreRegisteredAttendees(targetService as Service);

      expect(notifiedCount).toBe(1);
      expect(appointmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'appt-constel-1',
          startsAt: targetService.eventStartDate,
          endsAt: targetService.eventEndDate,
        }),
      );
      expect(emailService.sendNotification).toHaveBeenCalledWith(
        'jigomezjub@gmail.com',
        'Jose Ignacio Gomez',
        expect.stringContaining('Confirmación de fecha definitiva: Constelaciones Familiares'),
        expect.stringContaining('Domingo 25 de Octubre de 2026 (10:00 a 14:00)'),
        expect.any(String),
        undefined,
        'contact-ji-1',
      );
    });

    it('skips sending email if contact has opted out or has emailerroneo=S', async () => {
      const targetService: Partial<Service> = {
        id: 'svc-constel-1',
        name: 'Constelaciones Familiares',
        eventStartDate: new Date('2026-10-25T10:00:00.000Z'),
        durationMinutes: 240,
      };

      const optedOutContact: Partial<Contact> = {
        id: 'c-2',
        name: 'Opted Out User',
        email: 'optedout@example.com',
        emailerroneo: 'N',
        optedOut: true,
      };

      const errorEmailContact: Partial<Contact> = {
        id: 'c-3',
        name: 'Error Email User',
        email: 'bad@example.com',
        emailerroneo: 'S',
        optedOut: false,
      };

      appointmentRepo.find.mockResolvedValue([
        { id: 'a-2', serviceId: 'svc-constel-1', status: AppointmentStatus.SCHEDULED, contact: optedOutContact },
        { id: 'a-3', serviceId: 'svc-constel-1', status: AppointmentStatus.SCHEDULED, contact: errorEmailContact },
      ]);

      const notifiedCount = await service.notifyPreRegisteredAttendees(targetService as Service);

      expect(notifiedCount).toBe(0);
      expect(emailService.sendNotification).not.toHaveBeenCalled();
    });
  });
});
