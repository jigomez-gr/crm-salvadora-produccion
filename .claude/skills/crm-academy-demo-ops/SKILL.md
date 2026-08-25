---
name: crm-academy-demo-ops
description: Boot, expose and verify the CRM-academy stack for the live session. Trigger - starting the app, exposing the webhook over HTTPS, connecting WhatsApp/YCloud, restoring env, or troubleshooting the live-demo runtime.
---

# CRM-academy Demo Ops

Runbook to bring the full stack up and reachable from the internet (YCloud webhooks) without incidents. Verified working on 2026-06-10.

## Boot sequence (in order)

```bash
# 1. Postgres (host port 5433 — 5432 is taken by another container)
docker compose up -d

# 2. Backend (port 3001; loads backend/.env via dotenv) — pnpm only, never npm
cd backend && pnpm build && node dist/main &   # or: pnpm start:dev

# 3. Frontend (port 3000)
cd frontend && pnpm dev &

# 4. Public HTTPS for webhooks (Tailscale Funnel)
tailscale funnel --bg 3001
```

Health checks:

```bash
curl http://localhost:3001/api/health                       # backend
curl -o /dev/null -w "%{http_code}" http://localhost:3000   # frontend
curl https://pcgpu.tail7e401f.ts.net/api/health             # public HTTPS
```

## Env / secrets

- `backend/.env` is untracked (never in git) and survives branch switches.
- If it disappears (e.g. `rm -rf backend/` during the demo): `cp ~/.crm-academy.env.backup backend/.env`.
- Required var: `DATABASE_URL` (port **5433**) and `PORT`. Since ADR 0005, AI (OpenRouter) and WhatsApp (YCloud) credentials are configured **per agent in the UI** (stored on `AgentConfig`), not env — `OPENROUTER_API_KEY`/`AGENT_MODEL`/`YCLOUD_API_KEY`/`YCLOUD_WEBHOOK_SECRET`/`YCLOUD_WHATSAPP_NUMBER` remain optional global fallbacks.

## Tailscale Funnel

- Public URL: `https://pcgpu.tail7e401f.ts.net` → proxies to `localhost:3001`.
- Start: `tailscale funnel --bg 3001` · Status: `tailscale funnel status` · Stop: `tailscale funnel --https=443 off`.
- One-time setup already done: `sudo tailscale set --operator=$USER` (operator mode, no sudo needed afterwards).
- The URL is stable across restarts (machine name + tailnet domain) — the YCloud webhook config does not need updating between sessions.

## YCloud WhatsApp connection

> Since ADR 0005 the connection is configured **per agent in the UI** (Agents →
> agent → Configuración): paste the YCloud key + number, copy that agent's own
> webhook URL `/api/webhooks/ycloud/:agentKey`, paste the secret. The steps below
> (env-based, base `/api/webhooks/ycloud` → seeded `booking` agent) still work as a
> fallback for the live-session machine.

1. YCloud dashboard → Developers → Webhooks → endpoint URL:
   `https://pcgpu.tail7e401f.ts.net/api/webhooks/ycloud`
   Subscribe to `whatsapp.inbound_message.received`.
2. Copy the endpoint secret into `YCLOUD_WEBHOOK_SECRET` and the API key into `YCLOUD_API_KEY` in `backend/.env`; set `YCLOUD_WHATSAPP_NUMBER` to the business test number. Restart the backend.
   ALREADY DONE for the live session: webhook endpoint id `6a298da6c4ceb04a22bb52d0` registered via API (`POST /v2/webhookEndpoints`), env filled, number `+447832621172` (Josema's, CONNECTED).
3. Without `YCLOUD_WEBHOOK_SECRET` set, the webhook logs a warning and skips signature verification (OK for a quick test, not for anything else).
4. Inbound flow: webhook verifies `YCloud-Signature` (rejects 401 on mismatch) → 200s immediately → upserts contact by phone → booking agent (thread = sender phone) → reply sent via YCloud → SSE events update the UI.
5. The sending number and business timezone are editable in the UI: Agents → booking → Config ("WhatsApp Number", "Timezone"). They live on `AgentConfig` (`whatsappNumber`, `timezone`); `YCLOUD_WHATSAPP_NUMBER` env is only a fallback/seed.
6. Useful YCloud API checks: `GET /v2/whatsapp/phoneNumbers` (linked numbers), `GET /v2/webhookEndpoints` (webhook config) — header `X-API-Key`.

## Known traps

- Do NOT use `pkill -f "node dist/main"` — the pattern matches the calling shell and kills it. Use `fuser -k 3001/tcp`.
- Appointments created before the timezone fix (commit 7043824) are stored at shifted instants — clean test data from the calendar before demoing.
- Postgres container `crm_academy_db` must be up before the backend (TypeORM + Mastra PostgresStore both need it).
- Frontend expects the API at `http://localhost:3001` (`NEXT_PUBLIC_API_URL`).
