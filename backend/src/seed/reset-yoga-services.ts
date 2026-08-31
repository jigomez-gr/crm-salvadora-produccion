import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://crm:crm@localhost:5432/crm_salvadora';

async function resetServices() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to database...');

  try {
    // 1. Clean appointments, messages, calls, and old services
    console.log('Cleaning old appointments and services...');
    await client.query('DELETE FROM appointment_reminders');
    await client.query('DELETE FROM appointments');
    await client.query('DELETE FROM messages');
    await client.query('DELETE FROM conversations');
    await client.query('DELETE FROM calls');
    await client.query('DELETE FROM services');

    // 2. Define the exact services requested by user
    const services = [
      {
        name: 'Hatha Yoga Terapéutico (1 clase semanal)',
        description: 'Práctica consciente de asanas, alineación corporal, respiración terapéutica y relajación profunda. Horarios: Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:30, 17:30, 19:00). Aforo del listado: 20 plazas (con margen de hasta 28 para recuperaciones). Precio: 25€/mes. Pago en el centro.',
        serviceType: 'recurring',
        durationMinutes: 90,
        price: '25.00',
        maxCapacity: 20,
        calendarId: 'cal-hatha-yoga',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
      {
        name: 'Hatha Yoga Terapéutico (2 clases semanales)',
        description: 'Práctica consciente de asanas, alineación corporal, respiración terapéutica y relajación profunda (2 clases a la semana). Horarios: Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:30, 17:30, 19:00). Aforo del listado: 20 plazas. Precio: 42€/mes. Pago en el centro.',
        serviceType: 'recurring',
        durationMinutes: 90,
        price: '42.00',
        maxCapacity: 20,
        calendarId: 'cal-hatha-yoga',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
      {
        name: 'Meditaciones Guiadas',
        description: 'Sesión grupal de meditación y centramiento. Martes y Jueves de 9:15 a 9:45. Gratuitas para alumnos del centro de Yoga. Precio general: 15€/mes. Pago en el centro.',
        serviceType: 'recurring',
        durationMinutes: 30,
        price: '15.00',
        maxCapacity: 28,
        calendarId: 'cal-meditacion',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
      {
        name: 'Terapia Gestalt (Sesión Individual)',
        description: 'Sesión individual de psicoterapia Gestalt presencial u online. Enfoque humanista y toma de conciencia. Horario convenido individualmente entre terapeuta y alumno/paciente. Precio: 35€ por sesión de 1 hora. Pago en el centro.',
        serviceType: 'recurring',
        durationMinutes: 60,
        price: '35.00',
        maxCapacity: 1,
        calendarId: 'cal-gestalt',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person', 'virtual']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
      {
        name: 'Baño de Gong y Meditación Sonora',
        description: 'Un sábado al mes (a finales de mes). Sesión completa de 2 horas: preparación, baño de sonido envolvente con gongs y meditación integradora. Próxima sesión: Sábado 26 de Septiembre de 2026 (18:00 a 20:00). Aforo máximo: 30 personas. Precio: 16€. Pago en el centro.',
        serviceType: 'event',
        eventDatesText: 'Sábado 26 de Septiembre de 2026',
        eventStartDate: new Date('2026-09-26T18:00:00.000Z'),
        eventEndDate: new Date('2026-09-26T20:00:00.000Z'),
        durationMinutes: 120,
        price: '16.00',
        maxCapacity: 30,
        calendarId: 'cal-gong-mensual',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
      {
        name: 'Puja de Gongs (Noche Sagrada de Sonido - 11h)',
        description: 'Evento anual de inmersión y transformación sonora durante toda la noche (11 horas continuas de sonido). Fecha prevista: Finales de noviembre (Sábado 28 de Noviembre de 2026, 21:00 a 08:00). Aforo: 30 personas por sesión. Precio: 95€ (90-100€ según asistentes). Reserva anticipada. Pago en el centro.',
        serviceType: 'event',
        eventDatesText: 'Sábado 28 de Noviembre de 2026 (Noche de 21:00 a 08:00)',
        eventStartDate: new Date('2026-11-28T21:00:00.000Z'),
        eventEndDate: new Date('2026-11-29T08:00:00.000Z'),
        durationMinutes: 660,
        price: '95.00',
        maxCapacity: 30,
        calendarId: 'cal-puja-gongs',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
      {
        name: 'Constelaciones Familiares',
        description: 'Taller vivencial mensual de sanación de vínculos y patrones familiares. Próxima fecha tentativa: Domingo 27 de Septiembre de 2026 (10:00 a 14:00). Precios: Constelar (trabajar asunto propio) 60€ / Participar (representante) 20€. Aforo: 25 personas. Pago en el centro.',
        serviceType: 'event',
        eventDatesText: 'Domingo 27 de Septiembre de 2026 (Tentativa)',
        eventStartDate: new Date('2026-09-27T10:00:00.000Z'),
        eventEndDate: new Date('2026-09-27T14:00:00.000Z'),
        durationMinutes: 240,
        price: '60.00',
        maxCapacity: 25,
        calendarId: 'cal-constelaciones',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
      {
        name: 'Encuentro de Mujeres (Primavera)',
        description: 'Jornada anual de empoderamiento, círculo femenino, arquetipos y meditación en primavera. Fecha prevista: Sábado 15 de Mayo de 2027. Aforo máximo: 25 personas. Precio según programa. Pago en el centro.',
        serviceType: 'event',
        eventDatesText: 'Sábado 15 de Mayo de 2027 (Primavera)',
        eventStartDate: new Date('2027-05-15T10:00:00.000Z'),
        eventEndDate: new Date('2027-05-15T16:00:00.000Z'),
        durationMinutes: 360,
        price: '45.00',
        maxCapacity: 25,
        calendarId: 'cal-encuentro-mujeres',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
      {
        name: 'Retiro de Ayuno Terapéutico',
        description: 'Retiro semestral (Otoño y Primavera) de depuración, ayuno consciente, descanso y reconexión en la naturaleza. Próxima edición: Puente de Octubre (Del 9 al 12 de Octubre de 2026). Aforo: 20 plazas. Precio según lugar de hospedaje y días elegidos. Pago en el centro.',
        serviceType: 'event',
        eventDatesText: 'Del 9 al 12 de Octubre de 2026 (Puente de Octubre)',
        eventStartDate: new Date('2026-10-09T16:00:00.000Z'),
        eventEndDate: new Date('2026-10-12T16:00:00.000Z'),
        durationMinutes: 1440,
        price: null,
        maxCapacity: 20,
        calendarId: 'cal-ayuno-terapeutico',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
      {
        name: 'Bienestar Experience (Longevidad y Bienestar Integral)',
        description: 'Programa y sesiones de asesoramiento personalizado presencial y online. Áreas: meditación, motivación, inspiración, conciencia, nutrición, medicina natural, biohacking, longevidad, rejuvenecimiento, ritmos circadianos, psicología positiva y sonoterapia. Precio: 25€ por sesión de 1 hora. Pago en el centro.',
        serviceType: 'recurring',
        durationMinutes: 60,
        price: '25.00',
        maxCapacity: 1,
        calendarId: 'cal-bienestar-experience',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person', 'virtual']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
      {
        name: 'Iaidō (Esgrima Japonesa)',
        description: 'Arte marcial tradicional de esgrima japonesa con katana. Lugar: Club Social Parque Granada. Clases: Lunes de 20:00 a 21:00 (60 min) y Jueves de 20:30 a 22:00 (90 min). Prueba gratis en las clases. Información y reservas por WhatsApp: 695 172 625. Pago en el centro.',
        serviceType: 'recurring',
        durationMinutes: 60,
        price: '0.00',
        maxCapacity: 20,
        calendarId: 'cal-iaido',
        paymentType: 'in_person',
        allowedModalities: JSON.stringify(['in_person']),
        requiresApproval: false,
        requiresReason: false,
        isActive: true,
      },
    ];

    console.log('Inserting exclusive new services...');
    const insertedServices: any[] = [];
    for (const s of services) {
      const res = await client.query(
        `INSERT INTO services (
          id, name, description, "serviceType", "eventDatesText", "eventStartDate", "eventEndDate",
          "maxCapacity", "durationMinutes", price, "paymentType", "calendarId",
          "requiresApproval", "allowedModalities", "requiresReason", "isActive", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, NOW(), NOW()
        ) RETURNING id, name, "durationMinutes", price, "serviceType", "eventDatesText", "eventStartDate", "eventEndDate", "maxCapacity", "paymentType", "calendarId", "requiresApproval", "allowedModalities", "requiresReason"`,
        [
          s.name,
          s.description,
          s.serviceType,
          s.eventDatesText || null,
          s.eventStartDate || null,
          s.eventEndDate || null,
          s.maxCapacity,
          s.durationMinutes,
          s.price,
          s.paymentType,
          s.calendarId,
          s.requiresApproval,
          s.allowedModalities,
          s.requiresReason,
          s.isActive,
        ]
      );
      insertedServices.push(res.rows[0]);
    }
    console.log(`Inserted ${insertedServices.length} services successfully.`);

    // 3. Update agent_configs with the new services and persona
    console.log('Updating AI Agent configurations...');
    const agentServices = insertedServices.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      price: s.price,
      serviceType: s.serviceType,
      eventDatesText: s.eventDatesText,
      eventStartDate: s.eventStartDate,
      eventEndDate: s.eventEndDate,
      maxCapacity: s.maxCapacity,
      calendarId: s.calendarId,
      paymentType: s.paymentType,
      requiresApproval: s.requiresApproval,
      allowedModalities: s.allowedModalities,
      requiresReason: s.requiresReason,
    }));

    const yogaCustomInstructions = `Eres el asistente virtual y recepcionista del Centro de Yoga y Bienestar Integral Salvadora.
Tu función es atender a los alumnos e interesados por WhatsApp con un tono cálido, cercano, atento y profesional.

Servicios y Actividades principales del centro:
1. Hatha Yoga Terapéutico (1 clase/semana - 25€/mes o 2 clases/semana - 42€/mes):
   - Duración: 90 minutos por clase.
   - Horarios semanales fijos:
     * Martes: 9:45, 11:15, 17:00, 18:30 y 20:00
     * Miércoles: 20:15
     * Jueves: 9:45, 11:15, 16:30, 17:30 y 19:00
   - Aforo máximo de clase: 20 plazas fijas (hasta 28 para recuperaciones de clases perdidas).
   - Todos los pagos se realizan directamente en el centro.

2. Meditaciones Guiadas (15€/mes, gratuitas para alumnos de Yoga):
   - Martes y Jueves de 9:15 a 9:45 (30 min).

3. Terapia Gestalt (35€ / sesión de 1h):
   - Individual, presencial u online (videollamada). Se coordina horario específico.

4. Baños de Gong y Meditación Sonora (16€ / 2 horas):
   - Un sábado al mes a finales de mes (próximo: Sábado 26 de Septiembre de 2026, 18:00 a 20:00). Aforo: 30 personas.

5. Puja de Gongs (95€ / 11 horas de sonido durante toda la noche):
   - Evento anual. Próxima edición: Sábado 28 de Noviembre de 2026 (21:00 a 08:00). Aforo: 30 personas.

6. Constelaciones Familiares (Constelar 60€ / Participar 20€):
   - Taller vivencial de fin de mes. Próxima fecha: Domingo 27 de Septiembre de 2026 (10:00 a 14:00).

7. Encuentro de Mujeres en Primavera (45€):
   - Sábado 15 de Mayo de 2027.

8. Retiro de Ayuno Terapéutico:
   - Semestral en otoño y primavera. Próxima edición en el Puente de Octubre (9 al 12 de Octubre de 2026).

9. Bienestar Experience - Longevidad y Bienestar Integral (25€ / sesión 1h):
   - Presencial y online. Asesoramiento en biohacking, nutrición natural, longevidad, ritmos circadianos y psicología positiva.

10. Iaidō (Esgrima Japonesa):
    - Lugar: Club Social Parque Granada. Lunes 20:00-21:00 y Jueves 20:30-22:00. Clase de prueba gratis. Contacto WhatsApp: 695 172 625.

Pautas de reserva:
- Todos los servicios se abonan presencialmente en el centro.
- Cuando un cliente pida cita u horarios, usa checkAvailability y bookAppointment. Informa siempre de forma clara y amable.`;

    await client.query(
      `UPDATE agent_configs
       SET services = $1::jsonb,
           "businessName" = 'Centro de Yoga y Bienestar Salvadora',
           "customInstructions" = $2`,
      [JSON.stringify(agentServices), yogaCustomInstructions]
    );

    console.log('AI Agent configurations updated successfully.');
  } finally {
    await client.end();
  }
}

resetServices().catch((err) => {
  console.error('Error resetting services:', err);
  process.exit(1);
});
