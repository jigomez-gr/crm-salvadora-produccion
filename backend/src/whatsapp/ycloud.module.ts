import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { AppSettings } from '../common/entities/app-settings.entity';
import { YCloudProvider } from './providers/ycloud.provider';
import { EvolutionProvider } from './providers/evolution.provider';
import { WhatsappGatewayService } from './whatsapp-gateway.service';
import { YCloudClient } from './ycloud-client.service';

/**
 * WhatsApp outbound gateway & provider module.
 * Exports WhatsappGatewayService alongside YCloudProvider, EvolutionProvider and YCloudClient so
 * all existing modules importing YCloudModule gain access to WhatsappGatewayService
 * without introducing circular module dependencies.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AppSettings, AgentConfig])],
  providers: [YCloudClient, YCloudProvider, EvolutionProvider, WhatsappGatewayService],
  exports: [YCloudClient, YCloudProvider, EvolutionProvider, WhatsappGatewayService],
})
export class YCloudModule {}
