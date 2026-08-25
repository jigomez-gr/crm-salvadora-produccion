# ADR 0024 — Send email to contacts (SMTP)

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0014](0014-contact-crm-fields.md) (contacts), [ADR 0016](0016-settings-white-label.md) (app settings), [ADR 0013](0013-audit-trail.md). Phase-7.

## Context

Operators needed to email a contact from the CRM, and the owner needed to connect **any** mailbox — Gmail, Outlook, or a custom-domain address — with an easy, guided setup.

## Decision

### SMTP, not OAuth — the only universal transport
Connect via **SMTP** (`nodemailer`). It's the single mechanism that covers all three cases with one config shape (host / port / secure / user / password): Gmail (app password), Outlook/Microsoft 365, and any custom-domain mailbox. **OAuth (Gmail API / Microsoft Graph) was rejected**: it only covers Gmail/Outlook (not custom domains), and it would force the non-technical, self-hosting owner to register and verify developer OAuth apps with Google and Microsoft — infeasible. Third-party email APIs (SendGrid/Resend) were rejected too: they don't "connect your own account" and add another signup + domain verification.

`nodemailer` is pure-JS (no native deps), fits the app's ethos, and its transport maps 1:1 to the stored config. STARTTLS is forced on non-implicit-TLS ports (`requireTLS` when `secure` is false); connection/greeting/socket timeouts (15 s) stop a wrong host from hanging.

### A dedicated `EmailAccount` entity (NOT on AppSettings)
The SMTP password is a **secret**. `GET /api/settings` returns the whole `AppSettings` row to **any** authenticated user, so putting email config there would leak the password to employees. Instead email config lives in its **own single-row `EmailAccount` entity**, served only through the **sanitized** `/api/email/config` (admin), which strips the password and exposes a `hasSmtpPassword` boolean — the same write-only-secret pattern as agent keys. An empty password on update means "keep the stored one".

### Endpoints (`/api/email/*`, all `JwtAuthGuard`)
- `GET status` — `{ configured, fromAddress }`, **any operator** (drives the contact page's send button).
- `GET config` / `PUT config` / `POST test` — **ADMIN only** (`RolesGuard` + `@Roles(ADMIN)`). `test` sends a real email (to the from-address or a typed recipient) so the owner can verify the setup instantly.
- `POST send` — **any operator**: `{ contactId, subject, body }` → looks up the contact's email, sends, and records the attempt.
- `GET contact/:id` — the contact's sent-email history.

The `from` header is **fixed to the configured account** (no spoofing); `fromName` is quote-stripped; `fromAddress` is `@IsEmail`-validated. A send failure is a friendly **400** (never a 500) **and** still records a `failed` history row with the error.

### Per-contact history
An `email_messages` table (one row per send, sent/failed, cascade-deletes with its contact) powers a **"Correos enviados"** section on the contact detail page. It stores the body (business correspondence the operator wrote) — so it's **PII and never goes to the audit trail**, which stays PII-light (`EMAIL_SENT` records only actor + contact id, no recipient/subject/body).

### UI
- **Ajustes → "Correo electrónico"** card (admin): a **provider preset** selector (Gmail / Outlook / Otro) that auto-fills host/port/TLS, guided help with the exact steps + links (e.g. the Gmail app-password page), the write-only password field (shared `SecretInput` component, extracted from the agent config), and an **"Enviar prueba"** button. A note explains SPF/DKIM for deliverability.
- **Contact detail**: an **"Enviar correo"** button (disabled with a clear reason if the contact has no email or no account is configured) opens a compose modal (subject/body), and the sent history is listed below.

## Alternatives considered
- **OAuth (Gmail/Microsoft).** Rejected — no custom-domain coverage, requires owner-registered developer apps. SMTP + app passwords is universal and self-service.
- **Store email config on `AppSettings`.** Rejected — `GET /api/settings` is readable by all users; the password would leak. A separate sanitized entity is the fix.
- **Third-party email API (SendGrid/Resend).** Rejected — extra signup + domain verification, and it isn't "your account".
- **Receiving/replies (IMAP inbox).** Out of scope for v1 (send-only); a documented phase-2.

## Consequences
- The owner connects any mailbox from one screen with guided presets and a one-click test; operators email contacts from the ficha, with a per-contact history.
- The SMTP password never leaves the server (separate entity + sanitize + `has*` boolean); config is admin-only, sending is any-operator; sends are audited PII-light.
- One additive migration (validated up/down + FK cascade on a throwaway DB). One pure-JS dependency (`nodemailer`).
- **Phase-2 hooks:** HTML emails / templates, attachments, receiving replies (IMAP) to build a true email thread, and per-agent (vs business-wide) sending identities.
