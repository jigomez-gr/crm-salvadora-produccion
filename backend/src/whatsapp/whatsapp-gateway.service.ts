import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentConfig,
  WhatsappProviderType,
} from '../common/entities/agent-config.entity';
import { AppSettings } from '../common/entities/app-settings.entity';
import {
  WhatsappConnectionStatus,
  WhatsappFetchInboundMediaParams,
  WhatsappInboundMediaResult,
  WhatsappProvider,
  WhatsappSendResult,
  WhatsappSendTemplateParams,
  WhatsappSendTextParams,
} from './providers/whatsapp-provider.interface';
import { YCloudProvider } from './providers/ycloud.provider';
import { EvolutionProvider } from './providers/evolution.provider';

@Injectable()
export class WhatsappGatewayService {
  private readonly logger = new Logger(WhatsappGatewayService.name);
  private readonly fallbackEvolutionProvider = new EvolutionProvider();

  constructor(
    private readonly ycloudProvider: YCloudProvider,
    @Optional()
    @InjectRepository(AppSettings)
    private readonly settingsRepo?: Repository<AppSettings>,
    @Optional()
    @InjectRepository(AgentConfig)
    private readonly agentConfigRepo?: Repository<AgentConfig>,
    @Optional()
    private readonly evolutionProvider?: EvolutionProvider,
  ) {}

  /**
   * Checks whether global WhatsApp automation is paused in AppSettings.
   * When paused, automated outbound messages (LLM auto-replies, reminders,
   * appointment/event/OTP notifications) are blocked while manual sends
   * (Inbox operator replies, Admin Sender, CLI) remain permitted.
   */
  async isAutomationPaused(): Promise<boolean> {
    if (!this.settingsRepo) return false;
    try {
      const [settings] = await this.settingsRepo.find({
        order: { createdAt: 'ASC' },
        take: 1,
      });
      return Boolean(settings?.whatsappAutomationPaused);
    } catch (err) {
      this.logger.warn(
        `Could not read whatsappAutomationPaused from app_settings: ${(err as Error)?.message ?? err}`,
      );
      return false;
    }
  }

  /**
   * Resolves the AgentConfig for an agentKey when a caller does not already hold it.
   */
  async resolveAgentConfig(agentKey = 'booking'): Promise<AgentConfig | null> {
    if (!this.agentConfigRepo) return null;
    try {
      return await this.agentConfigRepo.findOne({ where: { agentKey } });
    } catch {
      return null;
    }
  }

  /**
   * Resolves the active provider for the given AgentConfig.
   * Defaults to 'ycloud' when whatsappProvider is not set.
   */
  resolveProviderType(config?: AgentConfig | null): WhatsappProviderType {
    const raw = config?.whatsappProvider;
    if (raw === 'evolution' || raw === 'meta' || raw === 'ycloud') {
      return raw;
    }
    return 'ycloud';
  }

  private getProvider(providerType: WhatsappProviderType): WhatsappProvider | null {
    switch (providerType) {
      case 'ycloud':
        return this.ycloudProvider;
      case 'evolution':
        return this.evolutionProvider ?? this.fallbackEvolutionProvider;
      case 'meta':
      default:
        return null;
    }
  }

  /**
   * Queries connection status for the configured provider of the given agent.
   */
  async getConnectionStatus(
    config: AgentConfig,
  ): Promise<WhatsappConnectionStatus> {
    const providerType = this.resolveProviderType(config);
    const provider = this.getProvider(providerType);
    if (provider?.getConnectionStatus) {
      return provider.getConnectionStatus(config);
    }
    return {
      provider: providerType,
      state: config?.whatsappNumber ? 'open' : 'unconfigured',
      instanceName: config?.evolutionInstanceName ?? null,
    };
  }

  /**
   * Sends an AUTOMATED text message (agent auto-reply, appointment/service/event notification, OTP).
   * Blocked when global WhatsApp automation is paused (`whatsappAutomationPaused === true`).
   */
  async sendAutomatedTextMessage(
    params: WhatsappSendTextParams,
  ): Promise<WhatsappSendResult> {
    if (await this.isAutomationPaused()) {
      this.logger.log(
        `[WhatsApp Gateway] Automated text message to ${params.to} skipped — global WhatsApp automation is PAUSED.`,
      );
      return {
        ok: false,
        skippedByPause: true,
        error: 'whatsapp_automation_paused',
      };
    }
    return this.dispatchText(params);
  }

  /**
   * Sends a MANUAL text message (operator reply from Inbox, Admin Sender, CLI).
   * Allowed even when global WhatsApp automation is paused.
   */
  async sendManualTextMessage(
    params: WhatsappSendTextParams,
  ): Promise<WhatsappSendResult> {
    return this.dispatchText(params);
  }

  /**
   * Sends an AUTOMATED template/reminder message.
   * Blocked when global WhatsApp automation is paused (`whatsappAutomationPaused === true`).
   */
  async sendAutomatedTemplateMessage(
    params: WhatsappSendTemplateParams,
  ): Promise<WhatsappSendResult> {
    if (await this.isAutomationPaused()) {
      this.logger.log(
        `[WhatsApp Gateway] Automated template message (${params.templateName}) to ${params.to} skipped — global WhatsApp automation is PAUSED.`,
      );
      return {
        ok: false,
        skippedByPause: true,
        error: 'whatsapp_automation_paused',
      };
    }

    const providerType = this.resolveProviderType(params.config);
    const provider = this.getProvider(providerType);
    if (!provider) {
      this.logger.warn(
        `[WhatsApp Gateway] Provider '${providerType}' is not active in Phase 1 — skipping template send to ${params.to}.`,
      );
      return {
        ok: false,
        error: `provider_${providerType}_not_implemented`,
      };
    }
    return provider.sendTemplateMessage(params);
  }

  /**
   * Fetches inbound media through the resolved provider for the conversation's agent.
   */
  async fetchInboundMedia(
    params: WhatsappFetchInboundMediaParams,
  ): Promise<WhatsappInboundMediaResult> {
    const providerType = this.resolveProviderType(params.config);
    const provider = this.getProvider(providerType) ?? this.ycloudProvider;
    if (!provider.fetchInboundMedia) {
      return this.ycloudProvider.fetchInboundMedia(params);
    }
    return provider.fetchInboundMedia(params);
  }

  private async dispatchText(
    params: WhatsappSendTextParams,
  ): Promise<WhatsappSendResult> {
    const providerType = this.resolveProviderType(params.config);
    const provider = this.getProvider(providerType);
    if (!provider) {
      this.logger.warn(
        `[WhatsApp Gateway] Provider '${providerType}' is not active in Phase 1 — skipping text send to ${params.to}.`,
      );
      return {
        ok: false,
        error: `provider_${providerType}_not_implemented`,
      };
    }
    return provider.sendTextMessage(params);
  }
}
