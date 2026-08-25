import { Injectable, Logger } from '@nestjs/common';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Curated shortlist for THIS agent: a WhatsApp booking bot that must do reliable
// tool calling AND obey the hardened guardrails, in Spanish. One strong, current
// pick per major provider plus a cheap-but-powerful open model — every id below
// was verified live in the OpenRouter catalogue (present + supports `tools`).
//
// Cost note: the agent rebuilds and re-sends the full guardrail prompt +
// services/hours + customInstructions + up to ~12k-token knowledge base on EVERY
// message, with NO prompt caching, so the owner pays RAW input price each turn —
// input price matters most. Ordered cheap→premium (the UI shows present ids in
// this order under "Recomendados"). Keep the list current: verify each id against
// https://openrouter.ai/api/v1/models (must support `tools`) when editing, since
// a renamed/removed id silently drops out (no crash) instead of erroring —
// prefer stable (GA) ids over `-preview` ones for exactly that reason.
export const RECOMMENDED_MODELS = [
  'deepseek/deepseek-v4-flash', // open model — cheapest input ($0.10), powerful, 1M ctx
  'google/gemini-3.1-flash-lite', // GA, ~half the cost of 3-flash, ≈ 2.5-flash quality, 1M ctx
  'openai/gpt-4.1-mini', // reliable balance: best tool-calling of the cheap tier (default)
  'anthropic/claude-sonnet-5', // premium — top reliability / guardrail adherence
];

export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number | null;
  promptPrice: string | null;
  completionPrice: string | null;
}

export interface ModelsResponse {
  recommended: string[];
  models: OpenRouterModel[];
}

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);
  private cache: { at: number; models: OpenRouterModel[] } | null = null;

  async listModels(): Promise<ModelsResponse> {
    const models = await this.fetchModels();
    return { recommended: RECOMMENDED_MODELS, models };
  }

  private async fetchModels(): Promise<OpenRouterModel[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.models;
    }

    try {
      const res = await fetch(OPENROUTER_MODELS_URL, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        this.logger.warn(`OpenRouter models fetch failed: ${res.status}`);
        return this.cache?.models ?? [];
      }
      const json = (await res.json()) as { data?: any[] };
      const models: OpenRouterModel[] = (json.data ?? []).map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length ?? null,
        promptPrice: m.pricing?.prompt ?? null,
        completionPrice: m.pricing?.completion ?? null,
      }));
      // Sort alphabetically by display name for a predictable dropdown
      models.sort((a, b) => a.name.localeCompare(b.name));
      this.cache = { at: Date.now(), models };
      return models;
    } catch (err) {
      this.logger.error(`OpenRouter models fetch error: ${err}`);
      return this.cache?.models ?? [];
    }
  }
}
