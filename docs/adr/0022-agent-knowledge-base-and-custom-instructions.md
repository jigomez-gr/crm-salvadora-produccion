# ADR 0022 — Agent knowledge base & custom instructions

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0005](0005-ui-multi-agent-openrouter.md) (one adaptive agent template, per-agent config from the UI), [ADR 0019](0019-list-pagination.md) (the house patterns). Phase-6 agent configurability.

## Context

The agent was configurable from the UI (persona, services, hours, model, secrets) but two things were missing for a non-technical owner to make it truly theirs:

1. **A behaviour prompt.** The only free-text field was `businessDescription` (what the business *is*), which was confusing — there was no way to tell the agent *how* to act (tone, what to offer or avoid, policies) beyond the internal hardened prompt.
2. **A knowledge base.** No way to give the agent business-specific facts (FAQ, prices, policies) to answer from — it could only book appointments and refuse everything else.

The owner also needs to **see and delete** the documents an agent holds.

## Decision

### `customInstructions` (behaviour prompt)
A new nullable `text` column on `agent_configs`, edited from the config form and injected into the system prompt as a **subordinate** section (`== Instrucciones del negocio (personalización) ==`) placed **below the OBLIGATORIAS guardrails**, with an explicit precedence line telling the model those guardrails always win. So an owner can shape behaviour without being able to disable "never invent / never leak internals / stay on-task". `businessDescription` stays, clarified in the UI ("qué es el negocio" vs "cómo debe atender").

### Knowledge base — size-triggered hybrid, Postgres full-text search
Documents are uploaded, their **text extracted and stored** (never the original bytes), chunked, and used to answer. Retrieval is **size-triggered** (the owner asked for "vector DB only when the document is big enough"):

- **Small base** (total ≤ **48 000 chars** ≈ 12k tokens ≈ 15–20 pages): the **whole** base is injected into the prompt every message. Maximum fidelity, no retrieval to miss.
- **Large base** (> threshold): only the **most relevant chunks** are retrieved per message and injected (bounded to the same 48k-char budget).

**The retrieval engine is Postgres full-text search, NOT a vector database — deliberately.** OpenRouter (the per-agent model provider) has **no embeddings API**, so a real vector DB would force either a separate embeddings provider (another key the owner must obtain) or a heavy local embedding model + the `pgvector` extension on the small Dokploy VPS — more moving parts and failure modes, against the "must work perfectly / minimal deps" ethos. Postgres FTS (`to_tsvector('spanish', …)` + a STORED GENERATED `tsvector` column + GIN index + `ts_rank`) is built into the DB we already run, needs no key/extension/model, and gives real Spanish language-aware matching (stemming, stop-words). We build an **OR** query from the message's own lexemes (a chunk matching *any* significant word is ranked in) rather than `plainto_tsquery`'s AND, for much better FAQ recall; the user message is a **bound parameter** (no injection). Most agents never leave the small/inject path, where retrieval quality is irrelevant.

The retriever is behind a single method (`KnowledgeService.resolveForMessage`), so a future **phase 2** can swap in a `pgvector` + embeddings backend for semantic matching without touching the agent runner or prompt — documented here, not built now.

### Formats & upload
Accepted: **.txt, .md, .csv, .pdf, .docx, .xlsx** (and .markdown/.docm/.xlsm). Extraction is server-side and pure-JS (CommonJS, no native addons): `pdf-parse` v2 (lazy-loaded, pdfjs under the hood), `mammoth` (.docx), `exceljs` (.xlsx); text/markdown/csv are decoded directly. Empty extraction (e.g. a scanned/image-only PDF) is rejected with a friendly Spanish message; NUL bytes are stripped (Postgres text/tsvector reject them). Legacy binary .doc/.xls are not supported (re-save as .docx/.xlsx).

Files are uploaded as **base64 in a JSON body** (like the CSV import), **not multipart/multer** — this rides the existing 6 MB JSON body limit, works through `apiFetch`, and keeps `multer` (which has open DoS CVEs and a Nest-10 v1.x/v2.x version tangle) **unused**. Per-file cap: **4 MB** (base64-inflated ~5.3 MB, under the body limit).

### Module structure
A **Mastra-free `KnowledgeModule`** (entities + `KnowledgeService` + `KnowledgeController`) owns upload/list/delete and the inject-vs-retrieve resolution. Because it imports no `@mastra/*`, it's covered by the e2e suite (`TestAppModule`) and registered **before `AgentsModule`** (the Mastra `/api/*` catch-all). `AgentsModule` imports it and `AgentRunnerService` injects `KnowledgeService` — the dependency points Mastra-side → Mastra-free, never the reverse. Both WhatsApp and the playground resolve the KB through the single `AgentRunnerService.run()` path.

### Endpoints (all `JwtAuthGuard`, scoped by `agentKey`)
- `POST /api/agents/:agentKey/knowledge` — `{ filename, contentBase64 }` → extract + store → `201` doc metadata (never the text).
- `GET /api/agents/:agentKey/knowledge` — `{ documents, totalChars, budgetChars, mode }`.
- `DELETE /api/agents/:agentKey/knowledge/:documentId` — `204` (chunks cascade).

## Alternatives considered
- **A real vector DB (pgvector + embeddings) now.** Rejected for v1 — no OpenRouter embeddings, extra key/infra/model on a small VPS, and unnecessary for a small-business FAQ that fits in the prompt. Kept as a clean phase-2 upgrade behind the retriever seam.
- **Multipart upload (multer).** Rejected — multer has open CVEs and a Nest-10 version conflict; base64-JSON reuses the CSV pattern and keeps it out of the tree.
- **Prompt-injection-only (no retrieval).** Would cap large bases; the size-trigger gives the best of both, as the owner requested.

## Consequences
- An owner can fully shape the agent from the UI: a behaviour prompt plus a knowledge base they can upload to, see, and delete — no code/env.
- Zero new infrastructure: FTS is built into Postgres; no embeddings key, no pgvector, no model download. Adds three focused pure-JS extraction libs.
- Pure cores (`resolveKnowledgeMode`, `chunkText`, `packWithinBudget`) + the extractor's text branches are unit-tested; the endpoints are e2e-tested; the migration (generated `tsvector` + GIN + FK cascade) was validated from scratch on a throwaway DB, including Spanish stemming/ranking.
- **Dev caveat:** TypeORM `synchronize` (dev/e2e) builds a *plain* `tsvector` column, not the migration's STORED GENERATED one, so FTS returns nothing in dev; `resolveForMessage` falls back to packing the first chunks up to budget. Production runs the migration and gets real ranked retrieval.
- The guardrails remain authoritative over both the owner's instructions and the (owner-supplied, therefore semi-trusted) knowledge text; a weak model can still be coaxed, so the UI keeps recommending a capable model.
