# Estudio: WhatsApp multi-proveedor para CRM Academy

Fecha: 2026-09-08

Este documento resume el estudio preliminar para ampliar el CRM, actualmente integrado con YCloud, para soportar tambien Baileys y la API nativa de Meta WhatsApp Cloud API seleccionando el proveedor por parametro/configuracion de agente.

## Objetivo

Permitir que cada agente use un proveedor de WhatsApp configurable:

```ts
type WhatsappProvider = 'ycloud' | 'baileys' | 'meta';
```

El objetivo tecnico es que YCloud siga funcionando sin cambios de comportamiento mientras se anaden Baileys y, mas adelante, Meta como adaptadores aislados.

## Conclusión

Es factible. La forma correcta no es mezclar Baileys ni Meta dentro del codigo actual de YCloud, sino introducir una capa comun de gateway/adaptadores:

```txt
CRM / AgentRunner / Reminders / Inbox
        |
        v
WhatsappGatewayService
        |
        v
Provider seleccionado por agente
   ├─ YCloudProvider
   ├─ BaileysProvider
   └─ MetaProvider
```

Con esta estructura, el sistema solo llama a `WhatsappGatewayService`. El gateway resuelve el proveedor activo leyendo la configuracion del agente y delega en el adaptador correspondiente.

## Estado actual del proyecto analizado

El proyecto ya concentra gran parte de WhatsApp en `backend/src/whatsapp`, lo cual facilita el cambio:

- `YCloudClient` encapsula el envio REST de YCloud.
- `YCloudWebhookController` encapsula el webhook de YCloud.
- `inbound-parser.ts` normaliza mensajes entrantes de YCloud.
- `ycloud-signature.ts` verifica la firma HMAC.

Puntos donde hoy hay acoplamiento directo a YCloud:

- `backend/src/conversations/conversations.controller.ts`: envio manual desde el inbox via `YCloudClient`.
- `backend/src/reminders/reminders.service.ts`: recordatorios por plantilla via `YCloudClient`.
- `backend/src/whatsapp/ycloud-webhook.controller.ts`: respuesta automatica del agente enviada directamente por `YCloudClient`.
- `AgentConfig`: credenciales especificas de YCloud (`ycloudApiKey`, `ycloudWebhookSecret`, `whatsappNumber`).

Esto no impide aislar los nuevos proveedores. Solo indica los puntos minimos que deben pasar a usar el gateway comun.

## Estructura propuesta

Crear un modulo portable, preferiblemente concentrado en una carpeta:

```txt
backend/src/whatsapp-gateway/
  whatsapp-gateway.module.ts
  whatsapp-gateway.service.ts
  whatsapp-provider.interface.ts
  whatsapp-provider.types.ts
  providers/
    ycloud/
      ycloud.provider.ts
    baileys/
      baileys.provider.ts
      baileys-connection.service.ts
      baileys-session.service.ts
      baileys.controller.ts
      baileys.types.ts
    meta/
      meta-whatsapp.provider.ts
      meta-webhook.controller.ts
      meta-signature.ts
      meta-inbound-parser.ts
```

La carpeta puede contener casi todo el trabajo nuevo. Aun asi, habra que tocar los puntos de integracion existentes para que llamen al gateway en vez de llamar directamente a YCloud.

## Interfaz comun sugerida

```ts
export interface WhatsappProviderClient {
  sendText(params: SendTextParams): Promise<SendMessageResult>;
  sendTemplate?(params: SendTemplateParams): Promise<SendMessageResult>;
  fetchMedia?(params: FetchMediaParams): Promise<FetchMediaResult>;
  getStatus?(agentKey: string): Promise<WhatsappConnectionStatus>;
  start?(agentKey: string): Promise<void>;
  stop?(agentKey: string): Promise<void>;
}

export interface SendTextParams {
  agentKey: string;
  from?: string;
  to: string;
  body: string;
}

export interface SendTemplateParams {
  agentKey: string;
  from?: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: Array<{
    type: string;
    parameters?: Array<{ type: string; text?: string }>;
  }>;
}

export interface SendMessageResult {
  ok: boolean;
  providerMessageId?: string;
  status?: string;
  error?: string;
}
```

## Cambios minimos necesarios en CRM Academy

1. Anadir `whatsappProvider` a `AgentConfig`, con valor por defecto `ycloud`.
2. Crear migracion TypeORM para el nuevo campo.
3. Crear `WhatsappGatewayService`.
4. Envolver el `YCloudClient` actual en `YCloudProvider` sin cambiar su comportamiento.
5. Cambiar el envio manual del inbox para usar `WhatsappGatewayService.sendText`.
6. Cambiar recordatorios para usar `WhatsappGatewayService.sendTemplate`.
7. Cambiar la respuesta automatica del webhook YCloud para usar el gateway o dejarla temporalmente en YCloud durante la fase 1.
8. Anadir UI para seleccionar proveedor por agente.
9. Anadir UI/API de estado para Baileys: QR pendiente, conectado, desconectado, requiere reautenticacion.

## Baileys

Baileys es prioritario para esta ampliacion, pero tiene una naturaleza distinta a YCloud y Meta:

- No es una API oficial de WhatsApp Business.
- Usa WhatsApp Web mediante WebSocket.
- No recibe webhooks externos; el backend mantiene una conexion viva.
- Necesita sesion persistente.
- Requiere flujo QR para vincular el numero.
- Debe gestionar reconexion, desconexion y sesiones invalidas.

### Estado a modelar

```ts
type BaileysConnectionState =
  | 'not_configured'
  | 'qr_pending'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'requires_reauth'
  | 'error';
```

### Persistencia

Para CRM Academy conviene persistir la sesion en Postgres, no en archivos sueltos, porque el proyecto ya usa Postgres y esta pensado para despliegues tipo Dokploy.

Entidad sugerida:

```ts
BaileysSession {
  id: uuid;
  agentKey: string;
  credentialsJson: jsonb;
  state: string;
  lastQr?: text;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Recepcion de mensajes

El proveedor Baileys debe convertir los eventos de WhatsApp Web al mismo contrato interno que usa el CRM:

- telefono del cliente normalizado;
- `externalId` del mensaje;
- texto visible para almacenar;
- `agentPrompt` para el LLM;
- media como referencia privada si aplica;
- estado de mensaje si esta disponible.

El flujo final debe terminar llamando a `AgentRunnerService.run()` igual que YCloud.

## Meta WhatsApp Cloud API

Meta encaja bien como proveedor oficial porque se parece mas a YCloud:

- Envio REST con token Bearer.
- Webhook HTTP para mensajes entrantes y estados.
- Plantillas aprobadas para conversaciones fuera de la ventana de 24 horas.
- Estados `sent`, `delivered`, `read`, `failed`.

Credenciales/configuracion por agente sugeridas:

```ts
metaPhoneNumberId: string;
metaBusinessAccountId: string | null;
metaAccessToken: string;
metaAppSecret: string;
metaWebhookVerifyToken: string;
metaGraphApiVersion: string; // ejemplo: v21.0 o version vigente
```

Envio de texto:

```txt
POST https://graph.facebook.com/{version}/{phone-number-id}/messages
Authorization: Bearer {access-token}
Content-Type: application/json
```

Payload conceptual:

```json
{
  "messaging_product": "whatsapp",
  "to": "34600111222",
  "type": "text",
  "text": {
    "body": "Hola"
  }
}
```

Webhook sugerido:

```txt
GET  /api/webhooks/meta/:agentKey
POST /api/webhooks/meta/:agentKey
```

El `GET` valida `hub.challenge` con el verify token configurado. El `POST` debe verificar `x-hub-signature-256` usando el app secret.

## Orden recomendado de trabajo

1. Fase 1: refactor sin cambio funcional.
   - Crear `WhatsappGatewayService`.
   - Crear `YCloudProvider`.
   - Mantener YCloud como proveedor por defecto.
   - Cambiar consumidores directos de `YCloudClient` al gateway.

2. Fase 2: Baileys MVP.
   - Instalar dependencia con `pnpm`.
   - Crear sesion persistente.
   - Exponer endpoints de conectar/desconectar/estado/QR.
   - Recibir mensajes y pasarlos a `AgentRunnerService.run()`.
   - Enviar texto desde agente e inbox.

3. Fase 3: Baileys robusto.
   - Reconexion automatica.
   - Dedupe fuerte de mensajes.
   - Manejo de media.
   - Estado visible en UI.
   - Logs sin PII ni secretos.

4. Fase 4: Meta Cloud API.
   - Crear `MetaProvider`.
   - Crear webhook Meta con firma.
   - Envio texto y plantillas.
   - Recepcion de mensajes y estados.
   - Media proxy compatible.

## Riesgos

- Baileys puede romperse si WhatsApp cambia WhatsApp Web.
- Baileys puede requerir reautenticacion QR.
- Baileys no debe tratarse como canal oficial de negocio.
- Las sesiones de Baileys deben protegerse como secretos.
- Meta requiere configuracion externa mas compleja: WABA, app, numero, token y webhook.
- Los recordatorios fuera de 24 horas deben distinguir entre proveedores: YCloud/Meta usan plantillas; Baileys puede enviar texto, pero eso no equivale a cumplimiento oficial.

## Criterio de exito

- Un agente con `whatsappProvider = 'ycloud'` sigue funcionando como antes.
- Un agente con `whatsappProvider = 'baileys'` puede conectar por QR, recibir mensajes y responder con el agente.
- El inbox envia mensajes manuales por el proveedor del agente.
- Los mensajes siguen guardandose en `messages` y `conversations` con el mismo contrato.
- Los eventos SSE existentes siguen funcionando.
- No se exponen URLs privadas de media ni secretos al frontend.
- La API nativa de Meta puede anadirse como otro provider sin cambiar el dominio.

