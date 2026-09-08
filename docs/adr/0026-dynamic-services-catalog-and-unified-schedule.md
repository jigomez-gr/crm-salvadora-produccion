# ADR 0026 — Dynamic Services Catalog, Unified Schedule Source of Truth, and Multichannel Synchronization

**Status:** Accepted  
**Date:** 2026-09-09  
**Relates to:** [ADR 0005](0005-ui-multi-agent-openrouter.md) (multi-agent configuration), [ADR 0008](0008-production-hardening-migrations-validation-booking-integrity.md) (booking integrity), [ADR 0022](0022-agent-knowledge-base-and-custom-instructions.md) (knowledge base & custom instructions).

## Context

In earlier iterations, service timetables, descriptions, pricing, and operating rules were partially duplicated across several disconnected layers:
1. Hardcoded in the AI booking agent system prompt (`booking-agent.ts`).
2. Uploaded in knowledge base documents (`knowledge/`).
3. Stored in the `services` database table with separate `weeklySchedule` and `description` fields.
4. Hardcoded in Vapi voice assistant system prompts (`vapi-prompt.ts`).
5. Hardcoded in the external landing page (`salvadora.jigretera.com`) and web chat bubble widget.

This led to severe operational issues:
- Whenever the business adjusted its schedule (e.g. changing Thursday Yoga from 16:30 to 16:00), administrators had to recompile the backend, re-upload knowledge documents, update Vapi prompts, and edit the landing page.
- If any layer was missed, discrepancies caused the AI agent or voice bot to offer deprecated slots, leading to booking conflicts and customer frustration.

For a white-label business CRM, **a business owner must be able to change hours, prices, or class descriptions in the UI once, and have all channels reflect the update immediately without touching code or recompiling**.

## Decision

### 1. PostgreSQL `services` as the Single Source of Truth
The `services` table is established as the sole authoritative source of truth for:
- Service name, duration (`durationMin`), and price (`price`).
- Human-readable description & conditions (`description`).
- Maximum slot capacity (`maxCapacity`, e.g. 20 for Yoga, 28 for Meditaciones Guiadas).
- Modalities (`allowedModalities`: presencial / online).
- Official weekly timetable in structured JSON (`weeklySchedule`) and readable text (`scheduleText`).

### 2. Automated Schedule Parser (`schedule-parser.ts`)
To make schedule configuration effortless for non-technical users in the UI, we introduced a resilient, pure, unit-tested natural language schedule parser (`schedule-parser.ts`):
- Accepts standard Spanish schedule text (e.g. `"Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:00, 17:30, 19:00)"`).
- Automatically translates day names and time ranges into structured `WeeklyScheduleDay[]` JSON stored in PostgreSQL.
- Executes automatically on `POST /api/services` and `PATCH /api/services/:id`, keeping `scheduleText` and `weeklySchedule` synchronized bidirectionally.

### 3. Dynamic Mastra AI Agent Injection (`agent-runner.service.ts` & `booking-agent.ts`)
The AI agent prompt no longer contains any hardcoded schedules, service descriptions, or pricing.
- On every inbound conversation turn, `AgentRunnerService` fetches active services from `ServicesService.findAll(true)`.
- The live catalog is attached to the runtime context and formatted into `booking-agent.ts`.
- The AI prompt dynamically states the exact valid shifts, prices, free first trial policies, and capacity rules. Any change in the database immediately governs the AI's next response.

### 4. Omnichannel Synchronization (Vapi Voice Assistant & Landing Page)
1. **Vapi Voice Assistant (`vapi.service.ts` & `vapi-prompt.ts`)**:
   - The assistant prompt dynamically iterates through active database services, rendering their exact `scheduleText`, descriptions, and capacities.
2. **Public Services Catalog Endpoint (`GET /api/widget/services`)**:
   - A public, lightweight, CORS-friendly endpoint returning active services, their schedules, prices, badges (e.g. "1ª Clase de Prueba Gratuita"), and pre-formatted WhatsApp booking deep-links (`https://wa.me/<phone>?text=...`).
   - Enables external web projects (like `salvadora.jigretera.com`) to render live cards and booking modal options directly from the CRM without redeployments.
3. **Web Chat Widget (`GET /api/widget/config`)**:
   - Enriched with the dynamic service catalog, ensuring the web bubble widget presents identical options to WhatsApp and voice.

### 5. Atomic Rescheduling & Capacity Protection (`rescheduleAppointment`)
- Added a specialized atomic tool `rescheduleAppointment` for the AI agent.
- Cancels the previous booking and confirms the new time slot in a single logical transaction, ensuring idempotency and preventing duplicate weekly bookings for fixed-frequency programs.

### 6. Purge of Legacy `16:30` Discrepancy
- Migration `1782909000000-FixThursdayYogaSchedule1600.ts` updates all existing Yoga rows from `16:30` to `16:00`.
- An idempotent `onModuleInit` sanitization sweep purges stale references across `AgentConfig` custom instructions and knowledge base snippets.

## Consequences

- **Zero Recompilations**: Business operators can update schedules, pricing, and service descriptions from **Servicios** in the CRM UI; changes propagate instantly across WhatsApp AI, Vapi Voice, Web chat, and the Landing page.
- **Data Integrity**: Impossible for different channels to give conflicting availability or pricing.
- **Maintainability**: New services added in the CRM UI automatically appear across all AI agents and public endpoints.
