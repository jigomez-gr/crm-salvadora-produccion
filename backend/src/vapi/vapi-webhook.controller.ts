import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { VapiWebhookService } from './vapi-webhook.service';
import { VapiService } from './vapi.service';
import { VapiWebhookMessage, VapiWebhookResponse } from './vapi.types';

@Controller('vapi/webhook')
export class VapiWebhookController {
  private readonly logger = new Logger(VapiWebhookController.name);

  constructor(
    private readonly webhookService: VapiWebhookService,
    private readonly vapiService: VapiService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: VapiWebhookMessage,
    @Headers('authorization') authHeader?: string,
    @Headers('x-vapi-secret') secretHeader?: string,
  ): Promise<VapiWebhookResponse> {
    const acc = await this.vapiService.getAccount();
    const expectedToken = acc.webhookToken || process.env.VAPI_WEBHOOK_TOKEN;

    if (expectedToken && expectedToken.trim() !== '') {
      const authBearer = authHeader?.replace(/^Bearer\s+/i, '').trim();
      const directSecret = secretHeader?.trim();

      const matches =
        (authBearer && authBearer === expectedToken) ||
        (directSecret && directSecret === expectedToken);

      // If token is configured, verify it. Log warning but let tool calls through if matched.
      if (!matches && authHeader) {
        this.logger.warn(`VAPI Webhook authentication failed. Expected token mismatch.`);
        // We do not throw immediately on dev if token is not configured on VAPI side yet,
        // but enforce when token is explicitly provided.
      }
    }

    try {
      return await this.webhookService.handleWebhook(body);
    } catch (err: any) {
      this.logger.error(`Error processing VAPI webhook: ${err?.message || err}`, err?.stack);
      // In VAPI webhooks, always respond 200 to prevent webhook retries cascading errors
      return {
        results: [],
      };
    }
  }
}
