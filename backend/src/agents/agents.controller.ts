import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  AgentsConfigService,
  sanitizeAgentConfig,
} from './agents-config.service';
import {
  CreateAgentConfigDto,
  UpdateAgentConfigDto,
} from './dto/agent-config.dto';
import { PlaygroundDto } from './dto/playground.dto';
import { AgentRunnerService } from './agent-runner.service';
import { OpenRouterService } from './openrouter.service';
import { MessageChannel } from '../common/entities/message.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('agents')
@UseGuards(JwtAuthGuard)
export class AgentsController {
  constructor(
    private readonly agentsConfigService: AgentsConfigService,
    private readonly agentRunnerService: AgentRunnerService,
    private readonly openRouterService: OpenRouterService,
  ) {}

  @Get()
  async findAll() {
    const configs = await this.agentsConfigService.findAll();
    return configs.map(sanitizeAgentConfig);
  }

  // Static route — must be declared before ':agentKey/...' routes are matched.
  @Get('models')
  listModels() {
    return this.openRouterService.listModels();
  }

  @Post()
  async create(@Body() dto: CreateAgentConfigDto) {
    return sanitizeAgentConfig(await this.agentsConfigService.create(dto));
  }

  @Get(':agentKey/config')
  async getConfig(@Param('agentKey') agentKey: string) {
    return sanitizeAgentConfig(await this.agentsConfigService.findByKey(agentKey));
  }

  @Put(':agentKey/config')
  async updateConfig(
    @Param('agentKey') agentKey: string,
    @Body() dto: UpdateAgentConfigDto,
  ) {
    return sanitizeAgentConfig(
      await this.agentsConfigService.update(agentKey, dto),
    );
  }

  @Delete(':agentKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('agentKey') agentKey: string) {
    return this.agentsConfigService.remove(agentKey);
  }

  @Post(':agentKey/playground')
  async playground(
    @Param('agentKey') agentKey: string,
    @Body() dto: PlaygroundDto,
  ) {
    const threadId = dto.threadId || `${agentKey}:playground-${Date.now()}`;
    const { reply } = await this.agentRunnerService.run({
      agentKey,
      message: dto.message,
      threadId,
      channel: MessageChannel.PLAYGROUND,
    });
    return { reply, threadId };
  }
}
