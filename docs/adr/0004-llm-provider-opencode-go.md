# ADR 0004 — LLM Provider: OpenCode Go for the POC

**Status:** Superseded by [ADR 0005](0005-ui-multi-agent-openrouter.md) (2026-06-17)
**Date:** 2026-06-10

> **Superseded:** the provider is now **OpenRouter**, selected per agent from the
> UI (model + API key stored in the agent config), not via env. See ADR 0005.
> The env fallbacks below still work but are no longer the primary path.

## Context

The booking agent needs an LLM. ADR 0001 defaulted to the Anthropic API, but for the live-session POC we have an OpenCode Go subscription (https://opencode.ai/docs/go/) — a curated gateway of cost-effective models (MiniMax, Kimi, GLM, DeepSeek, Qwen) behind an OpenAI-compatible endpoint.

## Decision

Use **OpenCode Go** as the model provider, configured entirely via env:

- Mastra's model router supports it natively: provider `opencode-go`, base URL `https://opencode.ai/zen/go/v1`, key from `OPENCODE_API_KEY` (verified in the installed `@mastra/core` provider registry).
- Model selected via `AGENT_MODEL` env var; default `opencode-go/minimax-m3`. Available models: `GET https://opencode.ai/zen/go/v1/models` (currently includes minimax-m3/m2.7, kimi-k2.6, glm-5.1, deepseek-v4-pro/flash, qwen3.x).
- Note: OpenCode **Go** (`/zen/go/v1`) and OpenCode **Zen** (`/zen/v1`) are different catalogs behind the same gateway; the same key may authenticate on both, but Go is the subscription we use and the only one with `minimax-m3`.
- Mastra's bundled provider registry may lag the live catalog (it lacked `minimax-m3`); unlisted model IDs still pass through to the gateway.

## Consequences

- Switching models for the demo is a one-line `.env` change, no code involved.
- `minimax-m3` is a reasoning model that emits inline `<think>` blocks; `AgentRunnerService.stripReasoning()` strips them before persisting/replying. Keep this in mind when trying other models.
- Anthropic direct remains a drop-in fallback: set `AGENT_MODEL=anthropic/claude-haiku-4-5` and `ANTHROPIC_API_KEY`.
