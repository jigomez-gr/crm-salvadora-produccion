import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { AgentsConfigService } from './agents-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([AgentConfig])],
  providers: [AgentsConfigService],
  exports: [AgentsConfigService],
})
export class AgentsConfigModule {}
