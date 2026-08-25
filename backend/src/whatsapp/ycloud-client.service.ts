import { Injectable, Logger } from '@nestjs/common';

const YCLOUD_API_URL = 'https://api.ycloud.com/v2/whatsapp/messages';
const YCLOUD_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

/** Outcome of a send — callers can record/propagate it instead of guessing. */
export interface YCloudSendResult {
  ok: boolean;
  /** YCloud message id (correlates later delivery/read status webhooks). */
  providerMessageId?: string;
  status?: string;
  error?: string;
}

export interface TemplateComponent {
  type: string;
  parameters?: { type: string; text?: string }[];
}

@Injectable()
export class YCloudClient {
  private readonly logger = new Logger(YCloudClient.name);

  /** Free-text message — only valid inside WhatsApp's 24h customer-care window. */
  async sendTextMessage(
    from: string,
    to: string,
    body: string,
    apiKeyOverride?: string,
  ): Promise<YCloudSendResult> {
    return this.send({ from, to, type: 'text', text: { body } }, apiKeyOverride);
  }

  /**
   * Approved template (HSM) message — REQUIRED to start a conversation outside
   * the 24h window (reminders, confirmations). The template must be pre-approved
   * in YCloud/WhatsApp.
   */
  async sendTemplateMessage(
    from: string,
    to: string,
    templateName: string,
    languageCode: string,
    components: TemplateComponent[] = [],
    apiKeyOverride?: string,
  ): Promise<YCloudSendResult> {
    return this.send(
      {
        from,
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length ? { components } : {}),
        },
      },
      apiKeyOverride,
    );
  }

  private async send(
    payload: Record<string, unknown>,
    apiKeyOverride?: string,
  ): Promise<YCloudSendResult> {
    // Per-agent key (from its config) takes precedence over the global env key.
    const apiKey = apiKeyOverride || process.env.YCLOUD_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'No YCloud API key (agent config or YCLOUD_API_KEY env) — skipping WhatsApp send',
      );
      return { ok: false, error: 'no_api_key' };
    }

    let lastError = 'unknown';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), YCLOUD_TIMEOUT_MS);
      try {
        const response = await fetch(YCLOUD_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            id?: string;
            status?: string;
          };
          return { ok: true, providerMessageId: data?.id, status: data?.status };
        }

        // Truncate the untrusted third-party error body before it hits the logs
        // (avoid dumping an unbounded provider string into structured logs).
        const body = (await response.text().catch(() => '')).slice(0, 500);
        lastError = `${response.status} ${body}`;
        // 4xx (except 429) is a permanent client error — don't retry.
        if (response.status < 500 && response.status !== 429) {
          this.logger.error(`YCloud send failed (no retry): ${lastError}`);
          return { ok: false, status: String(response.status), error: lastError };
        }
        this.logger.warn(
          `YCloud send attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`,
        );
      } catch (err) {
        clearTimeout(timer);
        lastError =
          (err as Error)?.name === 'AbortError'
            ? 'timeout'
            : String((err as Error)?.message ?? err);
        this.logger.warn(
          `YCloud send attempt ${attempt}/${MAX_ATTEMPTS} error: ${lastError}`,
        );
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    }

    this.logger.error(
      `YCloud send gave up after ${MAX_ATTEMPTS} attempts: ${lastError}`,
    );
    return { ok: false, error: lastError };
  }
}
