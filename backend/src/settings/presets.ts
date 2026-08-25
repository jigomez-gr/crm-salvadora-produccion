/**
 * Vertical presets for the onboarding wizard. Each seeds the default `booking`
 * agent with a sensible persona, services and working hours for that kind of
 * business, so a non-technical user gets a working setup in one click and can
 * fine-tune it afterwards. Pure data — no I/O.
 */
export interface VerticalPreset {
  key: string;
  label: string;
  businessName: string;
  businessDescription: string;
  tone: string;
  services: { name: string; durationMinutes: number }[];
  workingHours: { day: number; open: string; close: string }[];
}

// Mon–Fri 9–18 (Fri to 14). day: 0=Sun … 6=Sat (matches AgentConfig).
const WEEK_9_18 = [
  { day: 1, open: '09:00', close: '18:00' },
  { day: 2, open: '09:00', close: '18:00' },
  { day: 3, open: '09:00', close: '18:00' },
  { day: 4, open: '09:00', close: '18:00' },
  { day: 5, open: '09:00', close: '14:00' },
];

export const VERTICAL_PRESETS: VerticalPreset[] = [
  {
    key: 'dental',
    label: 'Clínica dental',
    businessName: 'Clínica Dental',
    businessDescription:
      'Clínica dental que ofrece servicios odontológicos integrales para mantener sonrisas sanas.',
    tone: 'amable y profesional',
    services: [
      { name: 'Revisión general', durationMinutes: 30 },
      { name: 'Limpieza dental', durationMinutes: 60 },
      { name: 'Empaste', durationMinutes: 60 },
      { name: 'Blanqueamiento dental', durationMinutes: 90 },
    ],
    workingHours: WEEK_9_18,
  },
  {
    key: 'beauty',
    label: 'Peluquería / Estética',
    businessName: 'Salón de Belleza',
    businessDescription:
      'Salón de peluquería y estética: cortes, color y tratamientos de belleza.',
    tone: 'cercano y acogedor',
    services: [
      { name: 'Corte de pelo', durationMinutes: 45 },
      { name: 'Tinte', durationMinutes: 90 },
      { name: 'Peinado', durationMinutes: 45 },
      { name: 'Manicura', durationMinutes: 45 },
    ],
    workingHours: WEEK_9_18,
  },
  {
    key: 'barber',
    label: 'Barbería',
    businessName: 'Barbería',
    businessDescription:
      'Barbería clásica: cortes de pelo, arreglo y afeitado de barba.',
    tone: 'cercano y desenfadado',
    services: [
      { name: 'Corte de pelo', durationMinutes: 30 },
      { name: 'Arreglo de barba', durationMinutes: 20 },
      { name: 'Corte + barba', durationMinutes: 45 },
    ],
    workingHours: WEEK_9_18,
  },
  {
    key: 'fitness',
    label: 'Gimnasio / Entrenador',
    businessName: 'Centro de Entrenamiento',
    businessDescription:
      'Entrenamiento personal y clases dirigidas para alcanzar tus objetivos.',
    tone: 'motivador y profesional',
    services: [
      { name: 'Sesión de entrenamiento personal', durationMinutes: 60 },
      { name: 'Evaluación inicial', durationMinutes: 45 },
      { name: 'Clase dirigida', durationMinutes: 60 },
    ],
    workingHours: [
      { day: 1, open: '07:00', close: '21:00' },
      { day: 2, open: '07:00', close: '21:00' },
      { day: 3, open: '07:00', close: '21:00' },
      { day: 4, open: '07:00', close: '21:00' },
      { day: 5, open: '07:00', close: '21:00' },
      { day: 6, open: '09:00', close: '14:00' },
    ],
  },
  {
    key: 'yoga_wellness',
    label: 'Centro Holístico y Yoga',
    businessName: 'Centro Holístico & Yoga',
    businessDescription:
      'Espacio integral de bienestar: Escuela de Yoga, Baños y Pujas de Gong, Terapia Gestalt, Constelaciones Familiares y Retiros Especiales.',
    tone: 'cálido, consciente y profesional',
    services: [
      { name: 'Clase de Yoga (Hatha / Vinyasa)', durationMinutes: 75 },
      { name: 'Baño de Gong (Sonoterapia)', durationMinutes: 60 },
      { name: 'Puja de Gong (Noche de Gong)', durationMinutes: 480 },
      { name: 'Terapia Gestalt (Individual)', durationMinutes: 60 },
      { name: 'Taller de Constelaciones Familiares', durationMinutes: 180 },
      { name: 'Encuentro de Mujeres (Círculo y Retiro)', durationMinutes: 240 },
      { name: 'Ayuno Terapéutico & Retiro Detox', durationMinutes: 360 },
    ],
    workingHours: [
      { day: 1, open: '08:30', close: '21:30' },
      { day: 2, open: '08:30', close: '21:30' },
      { day: 3, open: '08:30', close: '21:30' },
      { day: 4, open: '08:30', close: '21:30' },
      { day: 5, open: '08:30', close: '21:30' },
      { day: 6, open: '09:00', close: '20:00' },
      { day: 0, open: '10:00', close: '14:00' },
    ],
  },
  {
    key: 'generic',
    label: 'Negocio genérico',
    businessName: 'Mi Negocio',
    businessDescription:
      'Negocio de servicios con cita previa. Personaliza los servicios y el horario a tu medida.',
    tone: 'amable y profesional',
    services: [
      { name: 'Consulta', durationMinutes: 30 },
      { name: 'Servicio estándar', durationMinutes: 60 },
    ],
    workingHours: WEEK_9_18,
  },
];

export function findPreset(key: string): VerticalPreset | undefined {
  return VERTICAL_PRESETS.find((p) => p.key === key);
}
