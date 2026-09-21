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
      this.logger.log('Seeding default booking agent config (centro de yoga y bienestar salvadora)');
      const config = this.configRepo.create({
        agentKey: 'booking',
        businessName: 'Centro de Yoga y Bienestar Salvadora Conesa',
        businessDescription:
          'Centro de Yoga, Meditación, Terapias Individuales, Sonoterapia y Retiros en Fuenlabrada. Ofrecemos clases regulares de Hatha Yoga Terapéutico, Meditaciones Guiadas, Terapia Gestalt, Bienestar Experience, Baños y Pujas de Gong, Constelaciones Familiares, Encuentro de Mujeres y Retiro de Ayuno.',
        channel: 'whatsapp',
        services: [
          { name: 'Hatha Yoga Terapéutico', durationMinutes: 90 },
          { name: 'Meditaciones Guiadas', durationMinutes: 30 },
          { name: 'Terapia Gestalt (Sesión Individual)', durationMinutes: 60 },
          { name: 'Bienestar Experience (Longevidad y Bienestar Integral)', durationMinutes: 60 },
          { name: 'Baño de Gong y Meditación Sonora', durationMinutes: 120 },
          { name: 'Puja de Gongs (Noche Sagrada de Sonido - 11h)', durationMinutes: 660 },
          { name: 'Constelaciones Familiares (Constelar / Asunto Propio)', durationMinutes: 240 },
          { name: 'Constelaciones Familiares (Participante / Representante)', durationMinutes: 240 },
          { name: 'Encuentro de Mujeres (Primavera)', durationMinutes: 360 },
          { name: 'Retiro de Ayuno Terapéutico', durationMinutes: 1440 },
          { name: 'Sesión Mensual de Fin de Semana (Baño de Gong / Talleres)', durationMinutes: 120 },
        ],
        workingHours: [
          { day: 1, open: '09:00', close: '21:00' }, // Lunes
          { day: 2, open: '09:00', close: '21:30' }, // Martes (Yoga hasta 21:30)
          { day: 3, open: '09:00', close: '22:00' }, // Miércoles (Yoga 20:15 hasta 21:45)
          { day: 4, open: '09:00', close: '21:00' }, // Jueves (Yoga hasta 20:30)
          { day: 5, open: '09:00', close: '20:00' }, // Viernes
          { day: 6, open: '09:00', close: '20:00' }, // Sábado
          { day: 0, open: '10:00', close: '14:00' }, // Domingo
        ],
        tone: 'cálido, consciente, atento y profesional',
        customInstructions:
          'Directrices y Horarios Oficiales del Centro (Escuela Salvadora Conesa):\n\n' +
          '1. Promoción General: ¡PRUEBA GRATIS EN YOGA! La primera clase de prueba de Hatha Yoga es 100% gratuita como regalo del centro.\n\n' +
          '2. Horarios por Actividad:\n' +
          '   - Hatha Yoga Terapéutico: Mañanas: Martes y Jueves (9:45 y 11:15). Tardes: Martes (17:00, 18:30, 20:00), Miércoles (20:15), Jueves (16:00, 17:30, 19:00). Clases de 90 min.\n' +
          '   - Meditaciones Guiadas: Martes y Jueves de 9:15 a 9:45 (30 min).\n' +
          '   - Terapia Gestalt y Bienestar Experience: Sesiones individuales de 1h con cita previa acordada.\n' +
          '   - Baño de Gong: Sesión mensual en fin de semana de 2 horas (18:00 a 20:00).\n' +
          '   - Puja de Gongs: Noche de sonido de 11 horas continuas (21:00 a 08:00).\n' +
          '   - Constelaciones Familiares: Taller mensual en domingo (10:00 a 14:00).\n' +
          '   - Retiro de Ayuno Terapéutico: Puente de Octubre.\n\n' +
          '3. Contacto: WhatsApp Reservas: 695 172 625.\n\n' +
          '4. Proceso de Reserva: Confirma nombre y teléfono, consulta disponibilidad y formaliza la plaza.',
        model: DEFAULT_MODEL,
        whatsappNumber: process.env.YCLOUD_WHATSAPP_NUMBER || undefined,
        enabled: true,
      });
    } else {
      let updated = false;
      if (!existing.whatsappNumber && process.env.YCLOUD_WHATSAPP_NUMBER) {
        existing.whatsappNumber = process.env.YCLOUD_WHATSAPP_NUMBER;
        updated = true;
      }
      if (existing.customInstructions && existing.customInstructions.includes('16:30')) {
        existing.customInstructions = existing.customInstructions.replace(/16:30/g, '16:00');
        updated = true;
      }
      if (existing.services && Array.isArray(existing.services)) {
        const str = JSON.stringify(existing.services);
        if (str.includes('16:30')) {
          existing.services = JSON.parse(str.replace(/16:30/g, '16:00'));
          updated = true;
        }
      }
      if (existing.workingHours && Array.isArray(existing.workingHours)) {
        const wednesday = existing.workingHours.find((h: any) => h.day === 3);
        const thursday = existing.workingHours.find((h: any) => h.day === 4);
        if (
          !wednesday ||
          !thursday ||
          (wednesday.close && wednesday.close < '22:00') ||
          (thursday.close && thursday.close < '22:00')
        ) {
          existing.workingHours = [
            { day: 1, open: '07:00', close: '22:30' },
            { day: 2, open: '07:00', close: '22:30' },
            { day: 3, open: '07:00', close: '22:30' },
            { day: 4, open: '07:00', close: '22:30' },
            { day: 5, open: '07:00', close: '22:30' },
            { day: 6, open: '09:00', close: '20:00' },
            { day: 0, open: '10:00', close: '14:00' },
          ];
          updated = true;
        }
      }
      if (updated) {
        await this.configRepo.save(existing);
      }
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
