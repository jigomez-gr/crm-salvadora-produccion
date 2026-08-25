import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentConfig } from '../common/entities/agent-config.entity';
import {
  CreateAgentConfigDto,
  UpdateAgentConfigDto,
} from './dto/agent-config.dto';

// Default model for a newly-created agent (owner-chosen): gpt-4.1-mini is the most
// reliable of the cheap tier at tool-calling + instruction-following, so a
// non-technical owner gets dependable bookings out of the box. It's in
// RECOMMENDED_MODELS; owners can switch to any model from the UI.
export const DEFAULT_MODEL = 'openai/gpt-4.1-mini';

// Secret fields that must NEVER be sent to the browser/API clients.
const SECRET_FIELDS = [
  'openrouterApiKey',
  'ycloudApiKey',
  'ycloudWebhookSecret',
] as const;

/**
 * Strip secret values from an agent config before returning it to a client.
 * The real values stay in the DB; clients only learn whether each one is set
 * (e.g. `hasOpenrouterApiKey: true`) so the UI can show "configured" without
 * ever exposing the secret.
 */
export function sanitizeAgentConfig(config: AgentConfig): Record<string, any> {
  const clone: Record<string, any> = { ...config };
  for (const field of SECRET_FIELDS) {
    const capitalized = field.charAt(0).toUpperCase() + field.slice(1);
    clone[`has${capitalized}`] = !!clone[field];
    delete clone[field];
  }
  return clone;
}

@Injectable()
export class AgentsConfigService implements OnModuleInit {
  private readonly logger = new Logger(AgentsConfigService.name);

  constructor(
    @InjectRepository(AgentConfig)
    private readonly configRepo: Repository<AgentConfig>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultIfMissing();
  }

  private async seedDefaultIfMissing() {
    const existing = await this.configRepo.findOne({ where: { agentKey: 'booking' } });
    if (!existing) {
      this.logger.log('Seeding default booking agent config (centro de yoga y actividades parque granada)');
      const config = this.configRepo.create({
        agentKey: 'booking',
        businessName: 'Centro de Yoga Salvadora Conesa & Club Social Parque Granada',
        businessDescription:
          'Centro de actividades, desarrollo personal, artes marciales y yoga en Fuenlabrada. Ofrecemos clases regulares de Hatha Yoga Terapéutico, Pilates, Ninjutsu, Entrenamiento Funcional, Tai Chi Chuan, Iaido (esgrima japonesa), Actividades Orientales (Daruma, Kaisai, Kobudo) y Sesiones Mensuales de Fin de Semana (Baño de Gong, Constelaciones, Chi Kung, Yoga Nidra). Todas las clases regulares cuentan con primera clase de prueba gratuita.',
        channel: 'whatsapp',
        services: [
          { name: 'Hatha Yoga Terapéutico', durationMinutes: 90 },
          { name: 'Pilates', durationMinutes: 60 },
          { name: 'Bujinkan Budo Taijutsu / Ninjutsu', durationMinutes: 90 },
          { name: 'Entrenamiento Funcional', durationMinutes: 60 },
          { name: 'Actividades Orientales (Daruma, Kaisai, Kobudo)', durationMinutes: 55 },
          { name: 'Tai Chi Chuan', durationMinutes: 90 },
          { name: 'Iaido (Esgrima Japonesa)', durationMinutes: 60 },
          { name: 'Sesión Mensual de Fin de Semana (Baño de Gong / Talleres)', durationMinutes: 120 },
        ],
        workingHours: [
          { day: 1, open: '07:00', close: '22:00' }, // Lunes
          { day: 2, open: '07:00', close: '22:00' }, // Martes
          { day: 3, open: '07:00', close: '22:00' }, // Miércoles
          { day: 4, open: '07:00', close: '22:00' }, // Jueves
          { day: 5, open: '07:00', close: '22:00' }, // Viernes
          { day: 6, open: '09:00', close: '20:00' }, // Sábado
          { day: 0, open: '10:00', close: '14:00' }, // Domingo
        ],
        tone: 'cálido, motivador, atento y profesional',
        customInstructions:
          'Directrices y Horarios Oficiales del Centro (Club Social Parque Granada / Escuela Salvadora Conesa):\n\n' +
          '1. Promoción General: ¡PRUEBA GRATIS EN TODAS LAS CLASES! Siempre invita y anima al usuario a reservar su primera clase de prueba sin compromiso.\n\n' +
          '2. Horarios por Actividad:\n' +
          '   - Hatha Yoga Terapéutico: Mañanas: Martes y Jueves (9:45 y 11:15). Tardes: Martes (17:00, 18:30, 20:00), Miércoles (20:15), Jueves (16:00, 17:30, 19:00). Clases de 90 min.\n' +
          '   - Pilates: Lunes y Miércoles de 12:00 a 13:00.\n' +
          '   - Bujinkan Budo Taijutsu / Ninjutsu: Mañanas: Lunes y Viernes de 10:00 a 11:30 | Tardes: Lunes y Miércoles de 20:00 a 21:30.\n' +
          '   - Entrenamiento Funcional: Mañanas: Lunes, Miércoles y Viernes de 7:15 a 8:15 | Tardes: Lunes y Miércoles de 19:00 a 20:00.\n' +
          '   - Actividades Orientales: Martes y Jueves -> Daruma (19:00 a 19:55), Kaisai (20:00 a 20:55), Kobudo (21:00 a 21:45).\n' +
          '   - Tai Chi Chuan: Miércoles de 17:30 a 19:00 | Viernes de 10:00 a 11:30.\n' +
          '   - Iaido (Esgrima japonesa): Lunes de 20:00 a 21:00 | Jueves de 20:30 a 22:00.\n' +
          '   - Sesiones Mensuales en Fin de Semana: Baño de Gong, Constelaciones Familiares, Taller de Chi Kung, Masajes, Meditación y Yoga Nidra.\n\n' +
          '3. Ubicación y Contacto:\n' +
          '   - Dirección: Club Social Parque Granada (Cafetería Bar • Entrada libre), Calle Holanda 1, Fuenlabrada.\n' +
          '   - WhatsApp Reservas: 695 172 625 | Cafetería: 624 26 73 45.\n\n' +
          '4. Proceso de Reserva: Pide al usuario su nombre y teléfono (o confírmalo), pregúntale qué día y turno (mañana/tarde) le va mejor y confirma su plaza para la clase de prueba gratuita.',
        model: DEFAULT_MODEL,
        whatsappNumber: process.env.YCLOUD_WHATSAPP_NUMBER || undefined,
        enabled: true,
      });
      await this.configRepo.save(config);
    } else if (!existing.whatsappNumber && process.env.YCLOUD_WHATSAPP_NUMBER) {
      existing.whatsappNumber = process.env.YCLOUD_WHATSAPP_NUMBER;
      await this.configRepo.save(existing);
    }
  }

  async findAll(): Promise<AgentConfig[]> {
    return this.configRepo.find({ order: { createdAt: 'ASC' } });
  }

  async findByKey(agentKey: string): Promise<AgentConfig> {
    const config = await this.configRepo.findOne({ where: { agentKey } });
    if (!config) throw new NotFoundException(`Agent config for key '${agentKey}' not found`);
    return config;
  }

  /** Like findByKey but returns null instead of throwing (for hot paths like the agent runner). */
  async findByKeyOrNull(agentKey: string): Promise<AgentConfig | null> {
    return this.configRepo.findOne({ where: { agentKey } });
  }

  async create(dto: CreateAgentConfigDto): Promise<AgentConfig> {
    const agentKey = await this.generateUniqueKey(dto.businessName);
    const config = this.configRepo.create({
      agentKey,
      businessName: dto.businessName,
      businessDescription: dto.businessDescription || '',
      channel: dto.channel || 'whatsapp',
      services: [],
      workingHours: [
        { day: 1, open: '09:00', close: '18:00' },
        { day: 2, open: '09:00', close: '18:00' },
        { day: 3, open: '09:00', close: '18:00' },
        { day: 4, open: '09:00', close: '18:00' },
        { day: 5, open: '09:00', close: '18:00' },
      ],
      tone: 'amable y profesional',
      model: dto.model || DEFAULT_MODEL,
      enabled: true,
    });
    return this.configRepo.save(config);
  }

  async update(agentKey: string, dto: UpdateAgentConfigDto): Promise<AgentConfig> {
    const config = await this.findByKey(agentKey);
    // An empty/undefined secret means "leave it unchanged" — never overwrite a
    // stored secret with a blank value (the API no longer returns secrets, so
    // the UI sends them back empty for fields the user didn't touch).
    const patch: Record<string, any> = { ...dto };
    for (const field of SECRET_FIELDS) {
      if (patch[field] === undefined || patch[field] === '') {
        delete patch[field];
      }
    }
    Object.assign(config, patch);
    return this.configRepo.save(config);
  }

  async remove(agentKey: string): Promise<void> {
    const config = await this.findByKey(agentKey);
    await this.configRepo.remove(config);
  }

  /** Builds a URL-safe, unique agentKey from the business name (e.g. "Clínica Sol" -> "clinica-sol-3f9a"). */
  private async generateUniqueKey(businessName: string): Promise<string> {
    const base =
      businessName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // strip accents (combining marks U+0300–U+036F)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || 'agent';

    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = Math.random().toString(36).slice(2, 6);
      const candidate = `${base}-${suffix}`;
      const exists = await this.configRepo.findOne({ where: { agentKey: candidate } });
      if (!exists) return candidate;
    }
    // Extremely unlikely fallback
    return `${base}-${Date.now().toString(36)}`;
  }
}
