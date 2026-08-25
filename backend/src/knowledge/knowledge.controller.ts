import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { UploadKnowledgeDto } from './dto/upload-knowledge.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Agent knowledge-base management. Scoped under the agent (`agentKey`) and
 * guarded like the rest of the agent config. Lives in a Mastra-free module so the
 * endpoints are e2e-testable and are registered before the Mastra `/api/*`
 * catch-all.
 */
@Controller('agents/:agentKey/knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  list(@Param('agentKey') agentKey: string) {
    return this.knowledgeService.list(agentKey);
  }

  @Post()
  upload(
    @Param('agentKey') agentKey: string,
    @Body() dto: UploadKnowledgeDto,
  ) {
    return this.knowledgeService.upload(agentKey, dto);
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('agentKey') agentKey: string,
    @Param('documentId') documentId: string,
  ) {
    return this.knowledgeService.remove(agentKey, documentId);
  }
}
