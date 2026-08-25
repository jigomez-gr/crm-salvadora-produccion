# Prompt para construir "CRM con Agentes de IA por WhatsApp" (réplica funcional y de seguridad)

Eres un ingeniero full-stack senior. **Construye una aplicación con esta funcionalidad y esta seguridad**: un CRM white-label single-tenant (dashboard, contactos, calendario/citas, conversaciones) con uno o varios agentes de IA configurables desde la UI que **reservan citas por WhatsApp**. El agente corre con **Mastra embebido dentro de un backend NestJS** (TypeORM + PostgreSQL); el frontend es **Next.js (App Router) + React 19 + Tailwind v4**; los modelos vienen de **OpenRouter** y WhatsApp de **YCloud**, ambos configurados **por agente desde la UI** (no por env).

> **IMPORTANTE: no copies el código original. Implementa una versión equivalente desde cero.** Los nombres de clases/archivos/estructura pueden diferir, pero **los contratos de API, el modelo de datos, el comportamiento del agente y TODAS las medidas de seguridad deben respetarse al pie de la letra**. Cuando este documento fija un valor exacto (rutas, campos, formato de firma, códigos de estado, defaults, versiones, literales de UI), trátalo como contrato.

---

## 1. Objetivo y alcance

- **Objetivo:** una herramienta de administración interna (single-tenant) para gestionar contactos, citas y conversaciones, con agentes de IA que atienden WhatsApp y agendan citas de forma autónoma.
- **Un negocio = un despliegue.** Contactos y citas son **compartidos**; cada "agente" es una **fila de configuración** (`AgentConfig`), no un despliegue separado.
- **No-goals (mantén el alcance acotado, no lo infles):**
  - Single-tenant (sin multi-tenant, sin organizaciones).
  - **Solo WhatsApp** como canal real (más un Playground de pruebas).
  - **Un único recurso reservable** por negocio (no salas/profesionales múltiples).
  - **Sin capa de autenticación** (ver sección de Seguridad: es intencional y condiciona el despliegue).
  - Sin migraciones (esquema derivado de entidades, modo prototipo).

---

## 2. Stack tecnológico (versiones EXACTAS — pin obligatorio)

- **Node `>= 22.13`** (requisito de runtime de Mastra; aunque `@types/node` sea `^20`). Añade `engines.node: ">=22.13"` en ambos `package.json`.
- **Gestor de paquetes: pnpm ONLY.** Declara `packageManager: "pnpm@10.30.3"` en **ambos** `package.json`. Nunca `npm`/`npx`. Usa `pnpm install`, `pnpm <script>`, `pnpm exec`, `pnpm dlx`. **Commitea `pnpm-lock.yaml`** en backend y frontend (los Dockerfiles usan `--frozen-lockfile`).

### Backend (versiones literales)
- `@mastra/core@1.43.0`, `@mastra/memory@1.20.5`, `@mastra/nestjs@0.1.16`, `@mastra/pg@1.13.2` — **EXACTAS, nunca `latest`**. El comportamiento de `model()` y `generate()` descritos abajo depende de `@mastra/core@1.43.0`.
- `@nestjs/*` `10.4.22` (core/common/platform-express), `@nestjs/typeorm` `^10`, `@nestjs/throttler` `^6.5`, `@nestjs/event-emitter` `^2`.
- `typeorm` `^0.3`, `pg` `^8`, `helmet` `^8.2`, `rxjs` `^7.8`, `zod` `^3.25.76`, `dotenv` `^17`, `date-fns` `^4.4`, `@date-fns/tz` `^1.5`, `class-validator` + `class-transformer` (para el `ValidationPipe` global, ver Seguridad).

### Frontend (versiones literales)
- `next@16.2.9`, `react@19.2.4`, `react-dom@19.2.4` — el emparejamiento exacto importa para App Router + `use(params)` + `output: 'standalone'`.
- `lucide-react` `^1.17`, `clsx` `^2.1`, `tailwind-merge` `^3.6`, `@tailwindcss/postcss` (Tailwind v4), `date-fns` `^4.4`.

### TypeScript
- target `ES2022`, module `commonjs` (backend), `experimentalDecorators` + `emitDecoratorMetadata` activos. **`strictNullChecks: false` y `noImplicitAny: false`** (tipado laxo; no asumas modo estricto).

---

## 3. Arquitectura general

- Backend NestJS con **prefijo global `/api`** (`app.setGlobalPrefix('api')`), puerto por defecto **3001** (`PORT` override).
- TypeORM con **`synchronize: true`** (prototipo, sin migraciones; documenta "no usar en producción"). Las **entidades son la fuente de verdad** del esquema.
- Mastra corre **in-process** dentro de NestJS (no hay servidor de agente aparte) y usa `@mastra/pg` `PostgresStore` sobre **el mismo Postgres** que TypeORM. Mastra es dueño de las tablas `mastra_*`: **nunca las consultes desde TypeORM**.
- **Regla de orden crítica:** el módulo que monta Mastra (`AgentsModule`/integración `@mastra/nestjs`) debe importarse **EL ÚLTIMO** en el `imports[]` del módulo raíz, porque Mastra monta rutas catch-all bajo `/api`; si se importa antes, las rutas registradas después devuelven 404.
- Eventos en tiempo real vía **SSE** alimentados por `@nestjs/event-emitter` (`EventEmitter2` + `@OnEvent`).
- `main.ts`: importa `reflect-metadata` primero y carga `dotenv` **antes** de importar el módulo raíz (el orden importa para decoradores y env).

### Mapa de imports de Mastra (subpaths exactos)
- `Agent` desde `@mastra/core/agent`.
- `createTool` desde `@mastra/core/tools`.
- `Mastra` desde `@mastra/core/mastra`.
- `RequestContext` desde `@mastra/core/request-context`.
- `Memory` desde `@mastra/memory`.
- `PostgresStore` desde `@mastra/pg`.
- `MastraModule` + token de inyección `MASTRA` desde `@mastra/nestjs`. El runner inyecta `@Inject(MASTRA) private mastra: Mastra`.

### Estructura del módulo Mastra (wiring)
- El módulo Mastra (`AppMastraModule`) importa `ContactsModule` y `AppointmentsModule` **tanto a nivel de módulo como dentro de `registerAsync.imports`** (ambos). `inject: [ContactsService, AppointmentsService]`; el `useFactory` construye `PostgresStore({ id: 'crm-academy', connectionString })`, `Memory({ storage: store })` y `new Mastra({ agents: { [TEMPLATE_AGENT_ID]: agent }, storage: store })`, y devuelve `{ mastra }`. Exporta `NestMastraModule`.
- `AgentsModule` importa `AppMastraModule`, y `AgentsModule` va **ÚLTIMO** en `AppModule.imports`.
- Wiring de deps de tools: `createContact -> contactsService.upsertByPhone`; `updateContact -> contactsService.update`.
- `connectionString = DATABASE_URL || 'postgresql://crm:crm@localhost:5432/crm_academy'`.

---

## 4. Modelo de datos (entidades TypeORM, PostgreSQL)

Cuatro entidades. Todas con `id uuid` PK (`PrimaryGeneratedColumn('uuid')`) y `createdAt` (`CreateDateColumn`).

### Contact (tabla `contacts`)
- `name: string`
- `phone: string` **UNIQUE**
- `email: string` nullable
- `notes: text` nullable
- `OneToMany` appointments; `OneToMany` messages

### Appointment (tabla `appointments`)
- `contact: ManyToOne -> Contact` (`nullable: false`, `onDelete: 'CASCADE'`, `JoinColumn` name `contactId`)
- `contactId: string` (columna)
- `service: string`
- `startsAt: timestamptz`
- `endsAt: timestamptz`
- `status: enum AppointmentStatus { scheduled, cancelled, completed }` default `'scheduled'`

### AgentConfig (tabla `agent_configs`)
- `agentKey: string` **UNIQUE**
- `businessName: string`
- `businessDescription: text`
- `channel: string` default `'whatsapp'`
- `services: jsonb` default `'[]'` — `ServiceConfig { name, durationMinutes }`
- `workingHours: jsonb` default `'[]'` — `WorkingHourSlot { day: 0-6 (0=Domingo..6=Sábado), open 'HH:MM', close 'HH:MM' }`
- `tone: string` default `'professional'`
- `timezone: string` default `'Europe/Madrid'`
- `model: string` default `'openai/gpt-4o-mini'`
- `openrouterApiKey: string` nullable **(SECRETO)**
- `whatsappNumber: string` nullable
- `ycloudApiKey: string` nullable **(SECRETO)**
- `ycloudWebhookSecret: string` nullable **(SECRETO)**
- `enabled: boolean` default `true`

### Message (tabla `messages`)
- `contact: ManyToOne -> Contact` (`nullable: true`, `onDelete: 'SET NULL'`, `JoinColumn` `contactId`)
- `contactId: string` nullable
- `threadId: string` `@Index()`
- `direction: enum MessageDirection { inbound, outbound }`
- `channel: enum MessageChannel { whatsapp, playground }`
- `body: text`
- `externalId: string` nullable **UNIQUE**

**Reglas del modelo:** una cita siempre pertenece a un contacto (FK obligatoria, CASCADE). Los mensajes pueden no tener contacto (Playground) y se ponen a NULL al borrar el contacto. La unicidad de `Message.externalId` + dedupe previene reprocesar webhooks.

---

## 5. API REST (todos los endpoints bajo `/api`)

### Contacts
- `GET /api/contacts` → `Contact[]` ordenados `createdAt DESC`.
- `GET /api/contacts/:id` → `Contact` con relación `['appointments']`; **404** si no existe.
- `POST /api/contacts` body `{ name, phone, email?, notes? }` → `Contact`; **409 Conflict** si el `phone` ya existe.
- `PATCH /api/contacts/:id` body `{ name?, phone?, email?, notes? }` → `Contact`.
- `DELETE /api/contacts/:id` → **204 No Content**.
- Service helpers: `findByPhone`, `upsertByPhone(phone, name?)` (crea con `name || phone`), `count()`.

### Appointments
- `GET /api/appointments?from=&to=` → `Appointment[]` con `['contact']` ordenados `startsAt ASC`; aplica `Between(from, to)` solo si ambos están presentes.
- `GET /api/appointments/:id` → con `contact`; **404** si no existe.
- `POST /api/appointments` body `{ contactId, service, startsAt, endsAt }` (ISO → `new Date`) → `Appointment` con `contact`; **emite `appointment.created`**.
- `PATCH /api/appointments/:id` body `{ service?, startsAt?, endsAt?, status? }`.
- `DELETE /api/appointments/:id` → **204**.
- Helpers: `countToday()`, `findUpcoming(limit=5)`, `getAvailableSlots(date, durationMinutes, workingHours, timezone='Europe/Madrid', now=new Date())`, `cancelAppointment(id)` (→ status `CANCELLED`), `findByContact(contactId)`.

### Disponibilidad / huecos libres (función pura)
- Genera candidatos en pasos de **30 minutos** dentro del horario laboral del día (según `workingHours` para ese `day-of-week`); si no hay franja ese día, **no hay huecos**.
- Horario interpretado como **hora local de pared del negocio** en la `timezone` IANA configurada (usa `@date-fns/tz` `TZDate`).
- Un hueco se incluye **solo si**: (a) termina dentro del horario, (b) **no** empieza en o antes de `now` (`slotStart <= now` excluido), y (c) **no solapa** ninguna cita **no cancelada** (solape = `a.startsAt < slotEnd && a.endsAt > slotStart`). Nota: las `completed` siguen bloqueando.

### Conversations
- `GET /api/conversations` → `[{ threadId, channel (default 'playground'), contact?: { name, phone }, lastMessage: { body, direction (default 'inbound'), createdAt } }]`.
  - Implementación: `listThreads()` usa QueryBuilder **GROUP BY `threadId`** con `MAX(createdAt)`, luego por hilo obtiene `lastMessage` + count (acepta **N+1**).
  - **Contrato exacto:** `listThreads()` → `Array<{ threadId, contact: { name, phone } | null, lastMessage: { body, direction, channel, createdAt } | null }>`. El controller mapea con **fallbacks** cuando `lastMessage` es null: `channel ?? 'playground'`, `direction ?? 'inbound'`, `body ?? ''`, `createdAt ?? new Date().toISOString()`.
- `GET /api/conversations/:threadId/messages` → `getThreadMessages(threadId)` → `Message[]` con `['contact']` ordenados `createdAt ASC`.
- `MessagesService.saveMessage(dto)` **deduplica por `externalId`** (si existe, devuelve el existente). Expón `existsByExternalId(externalId): boolean`.

### Dashboard
- `GET /api/dashboard/metrics` → `{ contactsCount, appointmentsToday, upcomingAppointments, activeAgents }`.
  - `appointmentsToday`: cuenta `SCHEDULED` con `startsAt` entre medianoche local y +24h (usa **hora local del servidor**, **no** la timezone del negocio — divergencia conocida y aceptada). Frontera: `start = medianoche local de hoy`, `end = start + 24h`.
  - `upcomingAppointments`: **número (length)** de las próximas **5** citas `SCHEDULED` por `startsAt ASC` (máx. 5, no el total).
  - `activeAgents`: número de `AgentConfig` con `enabled = true`.

### Eventos (SSE)
- `GET /api/events` (`@Sse()`) → stream de `MessageEvent { type: eventName, data: JSON.stringify(payload) }` reenviando **solo** `message.received`, `message.sent`, `appointment.created`. El `EventsController` solo reenvía esos tres eventos vía `@OnEvent`.
- **Forma del payload SSE:** cada evento serializa la **ENTIDAD completa** (`Message`/`Appointment`), no el tipo reducido del front. El handler de Conversations lee `event.threadId` de ese payload crudo. No tipar el payload SSE como el `Message` reducido de `lib/types` (perdería `threadId`).

### Agents
- `GET /api/agents` → lista **sanitizada** (`findAll` mapea cada uno por `sanitizeAgentConfig`).
- `GET /api/agents/models` → catálogo OpenRouter (debe declararse **ANTES** de las rutas `:agentKey/...` o "models" se interpreta como `agentKey`).
- `POST /api/agents` body `CreateAgentConfigDto { businessName, businessDescription?, channel?, model? }` → crea (genera `agentKey` único) y devuelve **sanitizado**.
  - **`create()` rellena defaults en la fila nueva:** `services: []`; `workingHours`: Lun-Vie 09:00-18:00 (**5 filas `day` 1..5**); `tone: 'amable y profesional'`; `model: dto.model || DEFAULT_MODEL`; `channel: dto.channel || 'whatsapp'`; `enabled: true`. (Sin esto un agente nuevo aparecería con working hours vacíos.)
- `GET /api/agents/:agentKey/config` → **sanitizado**. Usa `findByKey` y devuelve **404** si no existe (la página `/agents/[agentKey]` muestra "Agente no encontrado" en ese caso).
- `PUT /api/agents/:agentKey/config` body `UpdateAgentConfigDto` (añade `services, workingHours, tone, timezone, openrouterApiKey, whatsappNumber, ycloudApiKey, ycloudWebhookSecret, enabled`) → **sanitizado**.
- `DELETE /api/agents/:agentKey` → **204**.
- `POST /api/agents/:agentKey/playground` body `PlaygroundDto { message, threadId? }` → `{ reply, threadId }`. Construye `threadId = dto.threadId || ${agentKey}:playground-${Date.now()}`, canal `playground`, **sin** contexto de cliente.
- `generateUniqueKey(businessName)`: lowercase → NFD normalize → quita marcas combinantes → no-alfanumérico a `-` → recorta guiones → `slice(0,32) || 'agent'`; añade sufijo base36 aleatorio (5 intentos), fallback `Date.now` base36.

---

## 6. Agente de IA (Mastra)

### Plantilla única adaptativa
- Registra **UN SOLO** agente Mastra con `id = 'assistant'` (`TEMPLATE_AGENT_ID`). **Nunca registres N agentes.** Cada "agente de negocio" es una fila `AgentConfig` resuelta **por request**.
- `mastra.getAgent('assistant')` se usa siempre; el `agentKey` solo selecciona qué `AgentConfig` se carga en el `requestContext`.

### Resolución por `requestContext`
- Por request: `const requestContext = new RequestContext<Record<string, any>>()` (de `@mastra/core/request-context`), luego `.set('agentConfig', cfg)` y `.set('customer', {...})`, y se pasa a `agent.generate(message, { memory: { thread, resource }, requestContext })`.
- `instructions()`, `model()` y **cada** `tool.execute()` leen la config activa de `requestContext.get('agentConfig')` por request. No hornees config en el agente ni en las tools.
- Accesores: `getConfig(context) = context?.requestContext?.get?.('agentConfig') ?? null`; `getCustomer(context) = context?.requestContext?.get?.('customer') ?? null`.
- **Firma de tools obligatoria:** `execute: async (inputData, context) => { ... context?.requestContext?.get('agentConfig') ... }`. La forma destructurada `({ context })` **falla en silencio** (Mastra devuelve el error al modelo en vez de loguearlo). `instructions()` y `model()` reciben `({ requestContext })` destructurado en el nivel superior — son dos formas de acceso distintas en el mismo archivo, respétalas.

### Contexto de cliente
- `customer = { contactId?, phone?, name?, nameKnown? }`. Las tools `bookAppointment`, `listContactAppointments` y `updateContactDetails` **leen `contactId` de ahí**, nunca del input del modelo, para que **el modelo jamás maneje un UUID ni pida el teléfono**.
- `nameKnown = !!(contactName && contactName !== phone)`. Un contacto WhatsApp nuevo arranca con `name === phone`; cuando `nameKnown` es falso el agente debe pedir el nombre con naturalidad y guardarlo con `updateContactDetails`.

### Siete herramientas (claves exactas del map)
`findContactByPhone, createContact, updateContactDetails, checkAvailability, bookAppointment, listContactAppointments, cancelAppointment`.

- `findContactByPhone`: input `z.object({ phone })` → `{ contact }`.
- `createContact`: input `z.object({ phone, name? })` → `{ contact }` (cableado a `contactsService.upsertByPhone`).
- `updateContactDetails`: input `z.object({ name?, email? })`; lee `customer.contactId`; si no hay → `{ error: 'No hay un cliente identificado en esta conversación.' }`; si hay → `{ contact }` vía `updateContact(contactId, { name, email })`.
- `checkAvailability`: input `z.object({ date /*ISO*/, durationMinutes })`; lee `workingHours`/`timezone` de la config (default `'Europe/Madrid'`) → `{ slots: [{ startsAt, endsAt, localTime }] }`, `localTime` formateado `es-ES` `HH:MM` en la timezone.
- `bookAppointment`: input `z.object({ service, startsAt /*ISO*/ })`; lee `customer.contactId` (si falta → `{ error: 'No hay un cliente identificado en esta conversación; no se puede reservar.' }`); busca `durationMinutes` en `config.services` por **nombre exacto**, default **60**; `end = start + durationMinutes*60*1000`; → `{ appointment }`.
- `listContactAppointments`: input `z.object({})`; sin `contactId` → `{ error, appointments: [] }`; si hay → `{ appointments }`.
- `cancelAppointment`: input `z.object({ appointmentId })` → `{ appointment }`.

La lógica de negocio vive en los **servicios Nest**; las tools son envoltorios finos (sin lógica de negocio). Envuelve `getAvailableSlots`/`bookAppointment` en un `traced(name, fn)` que loguea `Tool <name> failed` **sin args** y relanza.

### Guardarraíles de instrucciones (en español, endurecidos — preservarlos)
- Ámbito **solo citas**; jamás revelar herramientas/funciones/IDs/bases de datos ni frases de operación interna ("voy a crear el contacto").
- **Nunca inventar** servicios/precios/horarios/disponibilidad: solo datos reales devueltos por las tools.
- **Siempre confirmar servicio + día + hora antes de reservar.**
- **Nunca pedir el número de teléfono** (ya identificado por el remitente de WhatsApp).
- No mostrar errores técnicos al cliente. **Responder siempre en español**, tono natural y breve, sin importar el idioma del cliente.
- `instructions()` calcula `now` con `toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' })` en la timezone; sin config devuelve un genérico ("asistente virtual de citas de un negocio"); con config arma la persona con `businessName`, `businessDescription`, lista de servicios (`- name (N minutos)`) y horarios con días en español (`dayNames` 0=Domingo..6=Sábado), más el bloque de cliente renderizado desde el contexto.
- Nota: un modelo débil/gratuito puede ignorar los guardarraíles; **recomienda en la UI modelos capaces** (el prompt no es garantía dura).

### Modelo OpenRouter dinámico
- `DEFAULT_MODEL = 'openai/gpt-4o-mini'`; `OPENROUTER_URL = 'https://openrouter.ai/api/v1'`.
- `model: ({ requestContext }) => { apiKey = config?.openrouterApiKey || process.env.OPENROUTER_API_KEY || ''; modelId = config?.model || process.env.AGENT_MODEL || DEFAULT_MODEL; return { providerId: 'openrouter', modelId, url: OPENROUTER_URL, apiKey } as any; }`. La clave/modelo por agente tienen **prioridad**; env solo es fallback.
- **TRAMPA CRÍTICA (copia exacta, no "corrijas"):** `model()` DEBE devolver el **descriptor dinámico crudo** de Mastra 1.43 `{ providerId, modelId, url, apiKey }`. **NO** devuelvas una instancia `LanguageModel` del AI SDK (p. ej. `openrouter(modelId)` o `createOpenRouter(...).chat(...)`); esa convención **NO aplica aquí** y romperá la resolución de proveedor. `providerId: 'openrouter'` lo resuelve Mastra internamente; **no se instala ningún paquete `@openrouter/*` adicional**.

### Proxy de modelos (OpenRouterService)
- `GET /api/agents/models` → `{ recommended, models }`, caché **1h**, fail-soft.
- `RECOMMENDED_MODELS` = curated tool-calling shortlist for the booking agent — one current pick per major provider plus a cheap-but-powerful open model, ordered cheap→premium (raw input price dominates — no prompt caching; verify each id is live in the OpenRouter catalogue and supports `tools` when editing, preferring GA ids over `-preview`): `[deepseek/deepseek-v4-flash, google/gemini-3.1-flash-lite, openai/gpt-4.1-mini, anthropic/claude-sonnet-5]`.
- `fetchModels` mapea `{ id, name(||id), contextLength(context_length||null), promptPrice(pricing.prompt), completionPrice(pricing.completion) }`, ordena por `name`; en error/non-ok devuelve caché o `[]`.

### Runner (`AgentRunnerService.run`)
- Firma: `run({ agentKey, message, threadId, contactId?, phone?, contactName?, channel, externalId? }) -> Promise<string>`.
- Flujo: guarda mensaje **INBOUND** vía `saveMessage` → emite `message.received`; carga config vía `findByKeyOrNull(agentKey).catch(()=>null)`; setea `requestContext('agentConfig')` si existe; setea `requestContext('customer')` si hay `contactId||phone` con `nameKnown` calculado.
- Llama `agent.generate(message, { memory: { thread: threadId, resource: contactId || threadId }, requestContext })`. En Mastra 1.43 `generate()` devuelve `{ text: string, steps?: Array<{ toolResults?: {toolName}[]; toolCalls?: {toolName}[] }> }`.
- **Memoria:** `thread = threadId`, `resource = contactId || threadId`. Hilos WhatsApp keyed `agentKey:phone`; Playground `agentKey:playground-<timestamp>`.
- `reply = stripReasoning(result.text || '')`. `stripReasoning`: elimina `/<think>[\s\S]*?<\/think>/g` y `/<think>[\s\S]*$/g` (sin cerrar), colapsa 3+ saltos de línea a 2, `trim`.
- Loguea **solo nombres de tools** (`result.steps?.[].toolResults[].toolName` y `toolCalls[].toolName`) a nivel debug; `steps` puede ser `undefined` (`?? []`).
- **try/catch obligatorio** alrededor de `generate()`; en error devuelve mensaje amable en español: `'Lo siento, ahora mismo no puedo responder. (El agente no está configurado correctamente: revisa la clave de OpenRouter y el modelo seleccionado.)'`. Después guarda mensaje **OUTBOUND** y emite `message.sent`.

---

## 7. WhatsApp / YCloud

### Webhook (firmado, fail-closed)
- `@Controller('webhooks/ycloud')` → con prefijo global: `POST /api/webhooks/ycloud` (base → agente `'booking'`) y `POST /api/webhooks/ycloud/:agentKey`. Ambos `@HttpCode(200)`.
- Lee la cabecera **`ycloud-signature`** (minúsculas) como string; formato: pares `key=value` separados por coma; requiere `t` (timestamp unix-segundos) y `s` (firma hex).
- **HMAC payload exacto:** `` `${timestamp}.${rawBody.toString()}` `` (timestamp + `.` + cuerpo crudo). Calcula `crypto.createHmac('sha256', secret).update(payload).digest('hex')` y compara con **`crypto.timingSafeEqual`** (tiempo constante).
- **Robustez de `verifySignature` (obligatoria):** envuelve **todo** el parseo + el `timingSafeEqual` en `try/catch` y devuelve `false` ante cualquier excepción. Antes de `timingSafeEqual`, verifica que `Buffer.from(sig,'hex').length === expected.length` (de lo contrario `timingSafeEqual` lanza si los buffers difieren en longitud, p. ej. una `s=` de longitud inválida). **Cualquier error de verificación ⇒ 401, jamás 500.**
- **Necesita `rawBody`:** `NestFactory.create(AppModule, { rawBody: true })`; usa `RawBodyRequest<Request>` y `req.rawBody` (Buffer). Sin rawBody o sin firma → verificación falla.
- **Anti-replay:** rechaza si `Math.abs(now - timestampNum) > 300` (5 min), con `now = Math.floor(Date.now()/1000)`.
- **Resolución de secreto:** `config?.ycloudWebhookSecret || process.env.YCLOUD_WEBHOOK_SECRET`. **Fail-closed:** si no hay secreto, `verifySignature` devuelve `false` → **401** (loguea error; nunca acepta peticiones sin firmar). El chequeo del secreto va **primero** (antes que el de firma/rawBody). La verificación de firma debe ejecutarse **antes** de cualquier trabajo en BD que no sea cargar el secreto.
- En fallo: `logger.warn("YCloud webhook rejected for '<agentKey>': signature verification failed")` y `res.sendStatus(401)`.
- En éxito: **responde 200 INMEDIATAMENTE** (YCloud reintenta ante cualquier non-2xx), luego **procesa asíncronamente** (`processWebhook(...).catch(log)`). Un 200 no implica éxito de procesamiento; el dedupe es la red de seguridad.

### Procesamiento
- Carga config con `findByKeyOrNull(agentKey).catch(()=>null)` (entidad completa, **no** sanitizada).
- Filtra: procesa solo si `body.type === 'whatsapp.inbound_message.received'`; resto se ignora en silencio.
- Payload: `body.whatsappInboundMessage` con `.from` (teléfono), `.text.body` (mensaje), `.id` (externalId). Si falta `inboundMsg || from || text` → return temprano (mensajes no-texto/media se descartan sin traza).
- **Dedupe:** `existsByExternalId(externalId)` → si existe, loguea `Deduped inbound message: <id>` y return.
- `upsertByPhone(from)` antes de correr el agente.
- Corre `agentRunnerService.run({ agentKey, message: text, threadId: ${agentKey}:${from}, contactId: contact.id, phone: from, contactName: contact.name, channel: WHATSAPP, externalId })`.
- **Envío de respuesta:** `whatsappNumber = config?.whatsappNumber || process.env.YCLOUD_WHATSAPP_NUMBER`; envía solo si `whatsappNumber && reply`.

### Cliente de salida (YCloudClient)
- `YCLOUD_API_URL = 'https://api.ycloud.com/v2/whatsapp/messages'`.
- `sendTextMessage(from, to, body, apiKeyOverride?)` — el webhook lo llama como `sendTextMessage(whatsappNumber, from, reply, config?.ycloudApiKey)` (**ojo al orden**: `from` = número del negocio, `to` = remitente entrante).
- `apiKey = apiKeyOverride || process.env.YCLOUD_API_KEY`; si falta, loguea warning y **omite el envío sin lanzar**.
- HTTP: `fetch` POST con headers `{ 'Content-Type': 'application/json', 'X-API-Key': apiKey }` y body `{ from, to, type: 'text', text: { body } }`. **En non-ok loguea SOLO `response.status`** — **nunca** el cuerpo de la respuesta ni el `body` enviado (pueden contener el mensaje del cliente = PII). Esto es obligatorio por la regla de seguridad 9. No lanza.
- **Credenciales por agente tienen prioridad** sobre env (secreto webhook, API key, número).
- `WhatsappModule` importa `ConversationsModule, ContactsModule, AgentsModule`; provee/exporta `YCloudClient` + el controller.

---

## 8. Tiempo real (SSE)

- Un único endpoint `GET /api/events`. Productores emiten vía `EventEmitter2`; el controller reenvía con `@OnEvent` **solo** `message.received`, `message.sent`, `appointment.created`.
- El payload de cada evento es la **entidad completa** serializada (ver sección 5 SSE), no el tipo `Message` reducido del front.
- El frontend usa **un único `EventSource`** (hook `useEvents`) cuyos handlers solo disparan **re-fetch** del estado: el SSE transporta "algo cambió", no los datos.

---

## 9. Frontend / UX (Next.js App Router)

- **Todas las páginas son client components (`'use client'`)**; sin fetching server-side, sin API routes de Next. Todo pasa por `apiFetch` contra el backend externo.
- `apiFetch<T>(path, options?)`: `BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'`; `fetch` con `headers { 'Content-Type': 'application/json', ...options.headers }`; lanza `Error('API error ${status}: ${statusText}')` en `!res.ok`; lee `res.text()` y `JSON.parse` solo si no vacío (204/empty → `undefined as T`).
- `apiUrl(path)` → `${BASE_URL}${path}` (para EventSource y para mostrar la URL del webhook).
- `useEvents(handlers)`: abre `new EventSource(apiUrl('/api/events'))`, `addEventListener` por evento nombrado, `JSON.parse(e.data)` en try/catch, guarda handlers en un `ref` actualizado cada render, dep `[]` (no reconecta al cambiar closures), apoya en auto-reconexión nativa (`onerror` no-op), cleanup `destroyed=true` + `es.close()`.
- **Patrón SSE estricto:** los handlers nunca aplican el payload al estado; llaman a funciones `refresh` que re-GETean. Excepción: Conversations lee `event.threadId` (del payload crudo SSE = entidad completa) solo para decidir si recarga los mensajes del hilo abierto (sigue siendo re-fetch).
- **Loaders puros:** `loadData/loadContacts/loadRange/loadThreads` devuelven datos o `null` en error; `setState` solo en el call site; en error devuelven `null`/`[]` para **mantener el último estado bueno** (backend caído no borra la UI). Estados de error silenciosos a propósito.
- Modales remontados por `key` al abrir (`key = open ? id ?? 'new' : 'closed'`) → estado de formulario fresco desde props, sin effect de reset.
- Params dinámicos son Promise → `const { id } = use(params)` (React 19) en `/contacts/[id]` y `/agents/[agentKey]`.
- **Tipo `Message` vs payload SSE:** el `Message` de `lib/types.ts` es mínimo (`{ id, direction, body, createdAt }`) — suficiente para el panel de mensajes. El payload SSE es la entidad completa; **no** tipes el payload SSE como ese `Message` (perderías `threadId`).

### Componentes: ubicación (contrato)
- **Solo** `Button`, `Badge`, `Input`, `Modal`, `Textarea` viven en `components/ui/`.
- `ContactModal`, `AppointmentModal`, `CreateAgentModal` y `ModelPicker` se definen **INLINE** dentro de sus páginas respectivas, **no** como archivos separados. No sobre-ingenierices archivos.

### Rutas y pantallas
- **Layout** (`app/layout.tsx`): `lang="es"`, fuente Geist (`--font-geist-sans`), metadata title `CRM Academy` / description `CRM empresarial con Agentes de IA`, `<Sidebar />` + `<main>`. `suppressHydrationWarning` **solo** en `<html>` y `<body>`.
- **Sidebar:** 5 enlaces — `/` Inicio (LayoutDashboard), `/contacts` Contactos (Users), `/calendar` Calendario (CalendarDays), `/conversations` Conversaciones (MessageSquare), `/agents` Agentes (Bot). Activo: `/` match exacto, resto `pathname.startsWith(href)`. Header "CRM Academy", footer "v0.1.0 · pre-release".
- **Dashboard `/`:** 4 tarjetas (Total de contactos, Citas hoy, Próximas citas, Agentes activos); "Conversaciones recientes" = primeras 10; suscribe `message.received` + `message.sent` → refresh; placeholders "—", "Cargando…", "Aún no hay conversaciones".
  - **Conversaciones recientes (detalle):** avatar con la inicial del nombre (o `"?"`), nombre o `"Desconocido"`, Badge de canal, y prefijo `"Tú: "` en el último mensaje si es `outbound`. Hora con `format HH:mm` locale `es`.
- **`/contacts`:** tabla con búsqueda cliente (nombre/teléfono/email), crear/editar vía `ContactModal` (name+phone requeridos, email/notes opcionales), borrar con confirmación, nombre enlaza a `/contacts/[id]`, pluralización "contacto(s)".
- **`/contacts/[id]`:** fetch `ContactWithAppointments`; tarjetas phone/email/notes; separa "Próximas citas" (`scheduled` **y** `startsAt > now`) de "Citas pasadas" (todo lo demás — una `scheduled` pasada cae en pasadas); Badge de estado con etiquetas en **minúscula** (`"programada"/"completada"/"cancelada"` — divergencia intencional respecto al calendario); fallback "Contacto no encontrado".
- **`/calendar`:** toggle mes/semana, navegación prev/next, leyenda (Programada/Completada/Cancelada), crear al click en día/slot, editar al click en cita vía `AppointmentModal`; fetch del rango visible `/api/appointments?from=&to=` (ISO); suscribe `appointment.created` → refresh; carga contactos para el select; semana empieza lunes (`weekStartsOn:1`, solo presentación), grid 24h `HOUR_H=56px`. Solo carga el rango visible.
  - **`STATUS_COLORS`:** `scheduled=indigo`, `completed=green`, `cancelled=red` (clases border/bg/text). **Etiquetas capitalizadas:** `"Programada"/"Completada"/"Cancelada"` (divergencia intencional con `/contacts/[id]`, que usa minúsculas).
  - **Crear al click:** en vista **mes**, un click en día genera `defaultStart` = ese día a la hora actual; en vista **semana**, un click en slot genera `defaultStart` = ese día+hora del slot. `start`/`end` se calculan en el **handler de click** (no durante el render).
  - **`AppointmentModal` (campos):** `<select>` contacto (placeholder `"Selecciona un contacto…"`), `Input` servicio (texto libre), `Input datetime-local` inicio y fin. Al **EDITAR** aparece además `<select>` estado (`scheduled/cancelled/completed`). **Validación:** los 4 campos (contacto, servicio, inicio, fin) son obligatorios → error `"Todos los campos son obligatorios."`. Al **crear**, `defaultEnd = defaultStart + 60 min`. Guarda convirtiendo a ISO con `new Date(...).toISOString()`.
- **`/conversations`:** dos paneles (lista de hilos + panel de mensajes); al seleccionar hilo, fetch `/api/conversations/{threadId}/messages`; alineación burbujas inbound/outbound; auto-scroll al fondo; suscribe `message.received`+`message.sent` → refresca hilos y, si el `threadId` coincide con el abierto, recarga sus mensajes; Badge canal WhatsApp/Playground.
  - **Fallback sin contacto:** si un hilo no tiene contacto, la lista y la cabecera muestran el `threadId` crudo (`t.contact?.name ?? t.threadId`; cabecera `?? selected`). Esto cubre los hilos de Playground.
  - **Prefijo de dirección en la lista:** `outbound` → `"↑ "`, `inbound` → `"↓ "`.
- **`/agents`:** grid de tarjetas; tarjeta enlaza a `/agents/[agentKey]`.
  - **Tarjeta:** `businessName`, `agentKey`, descripción, los **2 primeros servicios** como `Badge` y, si hay más, un `Badge "+N"` de overflow; toggle `enabled` con labels `"Activo"/"Desactivado"`.
  - **`CreateAgentModal`:** postea **SOLO** `{ businessName, businessDescription }` (no envía `channel`/`model`) y hace `router.push(`/agents/${nuevo.agentKey}`)`.
- **`/agents/[agentKey]`:** dos pestañas. Si el GET de config devuelve 404, muestra "Agente no encontrado".
  - **Configuración:** info de negocio (name/description/tone/timezone/enabled), modelo IA (clave OpenRouter + `ModelPicker`), WhatsApp/YCloud (apiKey, whatsappNumber, **URL de webhook de solo lectura con botón copiar** + aviso si apunta a localhost, webhook secret), Servicios (name + durationMinutes, add/remove), Working Hours (select día 0=Dom..6=Sáb + open/close), **Guardar** (`PUT .../config`), zona peligrosa borrar (`DELETE` → `router.push('/agents')`).
    - **Tono es un `<select>` con EXACTAMENTE 5 opciones** (value/label): `professional/Profesional`, `friendly/Amigable`, `casual/Informal`, `formal/Formal`, `empathetic/Empático`. El agente sembrado usa `tone "amable y profesional"` (que **no** está en la lista), por lo que el select aparece **en blanco** para él — **preservar esta peculiaridad**.
  - **Playground:** chat que postea `/api/agents/{agentKey}/playground { message, threadId }`, mantiene `threadId` entre turnos, Enter=enviar / Shift+Enter=salto, "Nueva conversación" resetea.
    - Si el POST falla, añade un mensaje `assistant` con el literal `"No se pudo obtener respuesta. ¿Está el backend en ejecución?"`. El hint del hilo muestra `threadId.slice(0,12)+"…"`. Botón de envío deshabilitado si `!input.trim() || sending`; muestra burbuja `"Pensando…"` mientras `sending`.
- **`ModelPicker`:** fetch `/api/agents/models` (`{ recommended, models }`); muestra recomendados por defecto; **siempre mantiene el modelo seleccionado** en el `<select>`; si el catálogo falla a cargar (`loaded && models.length===0`) cae a input de texto libre.
  - Mientras `!loaded` el `<select>` muestra una opción `"Cargando modelos…"`. El toggle dice `"Ver todos los modelos (N)"` / `"Ver solo modelos recomendados"`; al activarlo aparece un `Input "Buscar modelo…"`.
- **Tipos (`lib/types.ts`)** espejan los contratos del backend (fuente de verdad en el front). `WorkingHour.day` **0=Domingo..6=Sábado** (coincide con el backend).
- `cn(...) = twMerge(clsx(inputs))`; reutiliza primitivos en `components/ui/` (Button con `size`/`variant`, Badge con `variant 'success'|'info'|'danger'|'default'`, Input, Modal, Textarea); fechas con `date-fns` + locale `es`.
- **Convención de idioma:** todo el copy de cara al usuario en **español**; todo el código/identificadores/comentarios en **inglés**.
- `next.config.ts`: `output: 'standalone'`. `NEXT_PUBLIC_API_URL` se **hornea en build** (build arg), no en runtime.

---

## 10. SEGURIDAD (NO NEGOCIABLE)

Implementa **TODAS** estas medidas como requisitos duros:

1. **App sin autenticación POR DISEÑO.** Cualquier endpoint alcanzable es efectivamente público. **NO la expongas a Internet sin una capa de auth delante.** El **único** endpoint pensado para ser público es el **webhook de WhatsApp firmado**. Documenta esto de forma prominente.
2. **Secretos write-only en la API.** `openrouterApiKey`, `ycloudApiKey`, `ycloudWebhookSecret` **nunca** se devuelven al cliente. Toda respuesta de config pasa por `sanitizeAgentConfig()`:
   - `SECRET_FIELDS = ['openrouterApiKey','ycloudApiKey','ycloudWebhookSecret']`.
   - Por cada campo: setea `has<Capitalized>` = `!!value` y **borra** el campo. Capitalización = **primera letra del field en mayúscula, resto intacto** → `openrouterApiKey ⇒ hasOpenrouterApiKey`, `ycloudApiKey ⇒ hasYcloudApiKey`, `ycloudWebhookSecret ⇒ hasYcloudWebhookSecret`.
   - Se aplica en `findAll`, `getConfig`, `create`, `updateConfig`. **Cualquier endpoint nuevo que devuelva un AgentConfig DEBE sanitizarlo.** Los llamadores internos (runner, webhook) leen la entidad completa vía `findByKeyOrNull` y **no** sanitizan.
3. **Preservación de secretos en update.** `update()` construye `patch = {...dto}` y para cada `SECRET_FIELD`: si es `undefined` o `''` → `delete patch[field]`. Así un round-trip sanitizado de la UI **nunca borra** un secreto guardado; cambiarlo exige enviar un valor nuevo no vacío.
4. **Webhook fail-closed.** 401 cuando no hay secreto configurado; **jamás** existe un camino que acepte peticiones sin firmar.
5. **Verificación de firma:** HMAC-SHA256 de `` `${timestamp}.${rawBody}` ``, comparación en **tiempo constante** (`timingSafeEqual`), ventana de **replay de 300s**. `rawBody: true` debe permanecer activo. `verifySignature` envuelve todo en `try/catch` y devuelve `false` ante cualquier excepción (incluido el throw de `timingSafeEqual` por longitudes distintas); antes de comparar verifica `Buffer.from(sig,'hex').length === expected.length`. **Cualquier error ⇒ 401, nunca 500.**
6. **helmet()** global (`app.use(helmet({ contentSecurityPolicy: false }))`). CSP desactivado a propósito (API JSON); **no quites helmet**.
7. **Rate limiting global:** `ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])` + `APP_GUARD: ThrottlerGuard` (120 req/min por IP; `ttl` en **ms**). Nota de exposición: `/playground` y `/webhooks` no autenticados **cuestan dinero real** por llamada (LLM/WhatsApp); el rate-limit es el **único** control de abuso — tenlo presente, no lo presentes como suficiente.
8. **CORS restringido:** `corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001').split(',').map(trim).filter(Boolean)`; `methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS']`, `allowedHeaders: ['Content-Type','Authorization']`. En producción `CORS_ORIGIN` apunta al frontend desplegado. **Nota:** el header `Authorization` en `allowedHeaders` es **vestigial** (la app no usa auth) y **NO** constituye una capa de autenticación; no implementes lógica que dependa de él.
9. **Sin PII/secretos en logs.** El runner loguea **solo nombres de tools**; el wrapper `traced()` loguea `Tool <name> failed` **sin args**; el `YCloudClient` en non-ok loguea **solo `response.status`** (nunca cuerpo de respuesta ni body enviado). Nunca loguees teléfonos, nombres, cuerpos de mensaje ni secretos.
10. **`contactId` server-side.** Las tools leen `contactId` del `requestContext('customer')`, nunca del input del modelo → evita fuga de IDs y bucles "dame tu teléfono".
11. **SQLi:** acceso a BD **solo** vía repositorios TypeORM parametrizados; nada de SQL concatenado.
12. **XSS:** confía en el escape por defecto de React/JSX; **nada de `dangerouslySetInnerHTML`** con datos no confiables.
13. **Docker no-root:** ambos Dockerfiles bajan a `USER node` antes del `CMD`.
14. **`.gitignore`** excluye `.env` y `.env.*` (mantén `!.env.example`, `!.env.production.example`); ignora también `*.log`, `*.png`. **Ningún `.env` se commitea.**
15. **DB privada en producción** (red interna, sin puertos publicados); `POSTGRES_PASSWORD` largo y aleatorio.
16. **Rotación de claves:** cualquier clave que haya sido alcanzable públicamente (p. ej. por un túnel antes del hardening) debe rotarse.
17. **Validación de entrada (whitelist).** Registra un `ValidationPipe` global con `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` y convierte los DTOs (`CreateAgentConfigDto`, `UpdateAgentConfigDto`, y los demás) en **clases** con decoradores `class-validator`. Razón: `update()` hace `Object.assign(config, patch)` sobre una entidad con `synchronize:true`; sin whitelist un cliente podría inyectar columnas arbitrarias (**mass-assignment**) o smuggling de campos secreto. **Solo los campos declarados deben persistirse.**
18. **Anti-fuga global de entidades.** Además de `sanitizeAgentConfig`, registra un **filtro de excepciones global** que **NUNCA** serialice una entidad `AgentConfig` en una respuesta de error, y marca las columnas secreto con `@Exclude()` + `ClassSerializerInterceptor` global como **segunda barrera**. (Un 500 que serialice la entidad, o un endpoint futuro, filtraría los tres secretos.)
19. **Límite de tamaño de cuerpo en el webhook público.** Configura un límite explícito de body (p. ej. `app.use(express.json({ limit: '256kb' }))` o equivalente compatible con `rawBody`) para que el único endpoint público no pueda ser inundado con payloads grandes que se hashean (HMAC, coste CPU) antes de rechazarse. El rate-limit (120/min) **NO** acota el tamaño por petición.

---

## 11. Datos de ejemplo (seed)

- **Seed de demo** (`OnModuleInit`): si `process.env.SEED_DEMO_DATA === 'false'` → skip; si `count(contacts) > 0` → skip (idempotente); si no, siembra. Todas las fechas **relativas a `now`** con `TZDate` en `'Europe/Madrid'`.
  - 10 contactos (nombres españoles, teléfonos `+34611200301..+34611200310`, emails, notas).
  - 14 citas: 9 días laborables próximos (Lun-Vie desde hoy) + 2 laborables pasados; mayoría `SCHEDULED`, 1 `CANCELLED`, 2 `COMPLETED` (las pasadas); cada cita atada a un contacto por `contactId`.
  - 2 conversaciones WhatsApp (threadId `booking:${phone}`, canal `whatsapp`, mensajes INBOUND/OUTBOUND).
  - Duraciones `SVC`: revision 30, limpieza 60, empaste 60, blanqueamiento 90 — **deben coincidir** con los servicios del agente sembrado.
- **Agente `booking` por defecto** (separado del seed de demo, **siempre** se crea si falta, **no** lo gobierna `SEED_DEMO_DATA`): `seedDefaultIfMissing` crea `AgentConfig` `agentKey='booking'`, `businessName 'Clinica Dental Demo'`, canal `'whatsapp'`, 4 servicios (Revision General 30, Limpieza Dental 60, Empaste 60, Blanqueamiento Dental 90), `workingHours` Lun-Jue 09:00-18:00 y Vie 09:00-13:00, `tone 'amable y profesional'`, `model DEFAULT_MODEL`, `whatsappNumber` desde `YCLOUD_WHATSAPP_NUMBER` env, `enabled true`. Si existe pero le falta `whatsappNumber` y el env está, hace backfill.

---

## 12. Despliegue

### Inventario de variables de entorno
**Backend:**
- `DATABASE_URL` — default en código `postgresql://crm:crm@localhost:5432/crm_academy`. **OJO:** el puerto hardcodeado por defecto es **5432**, pero el `docker-compose.yml` de dev mapea **5433:5432**, así que `backend/.env` en dev debe usar **5433**. En prod usa `db:5432` (red interna).
- `PORT` — default 3001.
- `CORS_ORIGIN` — default `http://localhost:3000,http://localhost:3001`.
- `SEED_DEMO_DATA` — `'false'` desactiva el seed de demo (no el agente `booking`).
- `OPENROUTER_API_KEY` *(fallback-only)*, `AGENT_MODEL` *(fallback-only, default `openai/gpt-4o-mini`)*, `YCLOUD_API_KEY` *(fallback-only)*, `YCLOUD_WEBHOOK_SECRET` *(fallback-only)*, `YCLOUD_WHATSAPP_NUMBER` *(fallback-only / backfill del agente booking)*.

**Frontend:**
- `NEXT_PUBLIC_API_URL` — **build-arg** (horneada en build, no runtime); default `http://localhost:3001`.

> Las claves IA/WhatsApp **no** son env de operación normal: se configuran **por agente en la UI**; el env es solo **fallback** opcional.

### Local (dev)
- `docker-compose.yml` arranca **SOLO** Postgres: imagen `postgres:17`, `POSTGRES_DB=crm_academy`, `POSTGRES_USER=crm`, `POSTGRES_PASSWORD=crm`, **`ports: '5433:5432'`** (host 5433 → contenedor 5432), volumen `postgres_data`. **La app NO corre en Docker localmente**, corre con pnpm.
- Backend: `cd backend && pnpm install && pnpm start:dev` → `http://localhost:3001`.
- Frontend: `cd frontend && pnpm install && pnpm dev` → `http://localhost:3000`.
- `backend/.env`: `DATABASE_URL` apuntando a **puerto 5433** (ojo: el default en código es 5432), `PORT`. `frontend/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:3001`.
- Pruebas WhatsApp en local requieren un túnel HTTPS público (cloudflared/ngrok/Tailscale Funnel) a `localhost:3001`; el Playground funciona sin WhatsApp.

### Producción (`docker-compose.prod.yml`, p. ej. Dokploy + Traefik)
- Servicios `db`, `api`, `web`; volumen `postgres_data`; redes `internal` (privada api↔db) y `dokploy-network` (`external: true`, donde vive Traefik).
- `db`: `postgres:17`, solo red `internal` (no expuesta), healthcheck `pg_isready`.
- `api`: build `./backend`, `depends_on db (service_healthy)`. **Derivadas en el compose, NUNCA a mano:** `DATABASE_URL=postgresql://${POSTGRES_USER:-crm}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-crm_academy}`, `CORS_ORIGIN=https://${WEB_DOMAIN}`, `PORT=3001`. Fallbacks opcionales: `OPENROUTER_API_KEY`, `AGENT_MODEL` (default `openai/gpt-4o-mini`), `YCLOUD_API_KEY`, `YCLOUD_WEBHOOK_SECRET`, `YCLOUD_WHATSAPP_NUMBER`. Labels Traefik: router HTTP→HTTPS sobre `Host(${API_DOMAIN})`, `certresolver=letsencrypt`, `loadbalancer.server.port=3001`.
- `web`: build `./frontend` con build-arg `NEXT_PUBLIC_API_URL=https://${API_DOMAIN}` (¡build-time!), `depends_on api`, solo `dokploy-network`, Traefik `Host(${WEB_DOMAIN})`, port 3000.
- Variables a rellenar en el panel: `WEB_DOMAIN`, `API_DOMAIN`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (+ fallbacks opcionales). **`DATABASE_URL`/`CORS_ORIGIN`/`NEXT_PUBLIC_API_URL` son DERIVADAS — nunca a mano.**
- `backend/Dockerfile`: multi-stage `node:22-slim`, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm build`; runtime `NODE_ENV=production`, `pnpm install --frozen-lockfile --prod`, copia `dist`, `USER node`, `EXPOSE 3001`, `CMD ['node','dist/main']`.
- `frontend/Dockerfile`: multi-stage `node:22-slim`, `corepack enable`, frozen-lockfile, `ARG NEXT_PUBLIC_API_URL` → `ENV`, `pnpm build`; runtime `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`, copia `.next/standalone` + `.next/static` + `public`, `USER node`, `EXPOSE 3000`, `CMD ['node','server.js']`.

### Aviso de seguridad obligatorio en docs
- En `README.md` y `docs/DEPLOYMENT.md` (en español, **prominente**): la API **no tiene autenticación**; el túnel HTTPS de pruebas la expone a Internet **sin auth**; tras cualquier exposición **ROTA** las claves de OpenRouter/YCloud (regla 16). El **único** endpoint público legítimo es el **webhook firmado**.

---

## 13. Convenciones

- **pnpm ONLY** (humanos y agentes). Nunca npm/npx. Commitea `pnpm-lock.yaml`.
- **Idiomas:** copy de usuario en español; código/identificadores/comentarios en inglés.
- Dos compose **no intercambiables**: `docker-compose.yml` = solo DB de dev; `docker-compose.prod.yml` = stack completo.
- Lógica de negocio en servicios Nest; tools Mastra = envoltorios finos.
- `tsconfig` laxo (`strictNullChecks:false`, `noImplicitAny:false`) — no asumas estricto.
- Versiones `@mastra/*` **exactas** (1.43.0 / 1.20.5 / 0.1.16 / 1.13.2), **nunca `latest`**. El `model()`-descriptor crudo depende de esas versiones.

---

## 14. Criterios de aceptación (checklist auto-verificable)

**Funcionalidad**
- [ ] Todas las rutas bajo `/api`; puerto 3001; `GET /api/agents/models` declarado **antes** de `:agentKey`.
- [ ] CRUD de contactos con `phone` único (409 en duplicado) y `upsertByPhone`.
- [ ] CRUD de citas con filtro `from/to`, emite `appointment.created`.
- [ ] `getAvailableSlots`: pasos de 30 min, respeta horario/timezone/duración, excluye `slotStart <= now` y solape con citas no canceladas (completed bloquea).
- [ ] Conversaciones: `listThreads()` con shape `{ threadId, contact|null, lastMessage|null }` + fallbacks (`channel 'playground'`, `direction 'inbound'`, `body ''`, `createdAt now`); mensajes por hilo ASC.
- [ ] Métricas dashboard correctas (`upcomingAppointments` = length de las próximas 5; `appointmentsToday` con frontera medianoche local..+24h).
- [ ] SSE en `GET /api/events` reenvía exactamente los 3 eventos; payload = entidad completa.
- [ ] Dedupe de mensajes por `externalId`.
- [ ] **Un solo** agente Mastra `'assistant'`; config resuelta por request desde `RequestContext` (construido por request y pasado a `generate()`).
- [ ] Las 7 tools con las claves exactas y firma `(inputData, context)`.
- [ ] `model()` devuelve el **descriptor crudo** `{ providerId:'openrouter', modelId, url, apiKey }` (NO una instancia LanguageModel); sin paquete `@openrouter/*`.
- [ ] El modelo nunca maneja UUID ni pide teléfono; `contactId` viene del `customer` context.
- [ ] Runner: `stripReasoning`, try/catch con fallback en español, memoria `thread`/`resource`, persiste IN/OUT y emite SSE.
- [ ] Webhook base → `booking`; per-agent por `:agentKey`; hilos `agentKey:phone`.
- [ ] `create()` rellena defaults (workingHours Lun-Vie 09-18 5 filas, tone `'amable y profesional'`, services `[]`, channel/model defaults).
- [ ] `GET /api/agents/:agentKey/config` devuelve 404 si no existe.
- [ ] Frontend: 5 rutas + 2 dinámicas; todas `'use client'`; patrón fetch+SSE re-fetch; secretos write-only en formulario; `WorkingHour.day` 0=Dom..6=Sáb.
- [ ] Tono = `<select>` de 5 opciones exactas; agente sembrado aparece en blanco en el select (peculiaridad preservada).
- [ ] `AppointmentModal`: 4 campos obligatorios + `<select>` estado solo al editar; `defaultEnd = +60min`; cálculo en handler de click.
- [ ] Calendar `STATUS_COLORS` (indigo/green/red) + etiquetas capitalizadas; `/contacts/[id]` en minúsculas (divergencia preservada).
- [ ] Conversations: fallback a `threadId` sin contacto; prefijos `"↑ "`/`"↓ "`.
- [ ] Dashboard "Conversaciones recientes": inicial/avatar, `"Desconocido"`, prefijo `"Tú: "` en outbound.
- [ ] `ModelPicker`: opción `"Cargando modelos…"`, toggle `"Ver todos los modelos (N)"`/`"Ver solo modelos recomendados"`, búsqueda; fallback a texto libre si el catálogo falla.
- [ ] Playground: literal de error de fetch, hint `slice(0,12)+"…"`, botón deshabilitado, burbuja `"Pensando…"`.
- [ ] Componentes: solo Button/Badge/Input/Modal/Textarea en `components/ui/`; modales y `ModelPicker` inline.
- [ ] Seed de demo idempotente + agente `booking` siempre presente.
- [ ] Versiones `@mastra/*` exactas y `pnpm-lock.yaml` commiteado; `engines.node>=22.13`, `packageManager pnpm@10.30.3`.

**Seguridad**
- [ ] La API **nunca** devuelve secretos; solo `has*` booleans (`sanitizeAgentConfig` en findAll/getConfig/create/updateConfig; capitalización `hasOpenrouterApiKey/hasYcloudApiKey/hasYcloudWebhookSecret`).
- [ ] `update()` ignora secretos `undefined`/`''` (round-trip no borra secretos).
- [ ] Webhook **fail-closed 401** sin secreto; HMAC-SHA256 sobre `timestamp.rawBody`, `timingSafeEqual` (con guarda de longitud + try/catch ⇒ nunca 500), replay 300s; `rawBody:true` activo.
- [ ] helmet activo (CSP off intencional); ThrottlerGuard 120/60s global; CORS scoped (`Authorization` vestigial, no es auth).
- [ ] `ValidationPipe` global `{ whitelist:true, forbidNonWhitelisted:true, transform:true }`; DTOs como clases `class-validator` (anti mass-assignment).
- [ ] Filtro de excepciones global + `@Exclude()`/`ClassSerializerInterceptor` evitan fuga de `AgentConfig` por rutas de error.
- [ ] Límite de tamaño de body (`~256kb`) en el webhook público.
- [ ] Logs sin PII/secretos (solo nombres de tools; YCloud non-ok loguea solo `status`).
- [ ] TypeORM parametrizado (sin SQLi); sin `dangerouslySetInnerHTML` (sin XSS).
- [ ] Dockerfiles `USER node`; `.gitignore` cubre `.env*`.
- [ ] DB de producción no expuesta; aviso prominente en README/DEPLOYMENT: **app sin auth → no exponer públicamente sin capa de auth; solo el webhook firmado es público; rota claves tras exposición**.
- [ ] **Tests negativos:** (a) POST/PUT config con `openrouterApiKey` + GET aseveran que la clave **no** aparece (solo `hasOpenrouterApiKey:true`); (b) webhook sin cabecera `ycloud-signature` ⇒ 401; (c) webhook con firma válida pero secreto no configurado ⇒ 401; (d) webhook con `t` fuera de la ventana 300s ⇒ rechazado; (e) PUT config con secreto `''` no borra el secreto previo; (f) petición con campo no declarado en DTO ⇒ rechazada (`forbidNonWhitelisted`); (g) forzar un 500 en endpoint de agente y aseverar que la respuesta no contiene ningún secreto.