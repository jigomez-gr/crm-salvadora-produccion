# Prompt para implementar WhatsApp multi-proveedor en el proyecto real

Copia este prompt cuando tengas el proyecto real y la landing en el workspace.

```txt
Quiero ampliar este CRM, que actualmente usa WhatsApp mediante YCloud, para soportar tambien Baileys como prioridad y dejar preparada la arquitectura para Meta WhatsApp Cloud API.

Contexto:
- El CRM usa NestJS en backend y Next.js en frontend.
- Actualmente YCloud funciona y no quiero romperlo.
- La seleccion del proveedor debe ser por agente o por parametro de configuracion.
- Proveedores objetivo:
  - ycloud: actual, debe seguir funcionando igual.
  - baileys: prioridad inicial.
  - meta: preparar la arquitectura y, si es viable, dejar adaptador o esqueleto.
- Quiero que la mayor parte del trabajo quede aislada en una carpeta/modulo reusable para poder llevarlo a otros proyectos que tambien usan YCloud.
- Usa pnpm, nunca npm ni npx.

Primero haz una auditoria del proyecto:
1. Encuentra todos los puntos donde se usa YCloud directamente.
2. Identifica entidades/DTOs/configuracion donde viven las credenciales de WhatsApp.
3. Identifica el flujo de inbound webhook, envio automatico del agente, envio manual desde inbox, media y recordatorios.
4. Identifica la landing y como se conecta con el CRM, sin cambiarla todavia salvo que sea necesario.

Luego propon e implementa una arquitectura por fases:

Fase 1 - Gateway sin cambio funcional:
- Crea un modulo tipo `whatsapp-gateway`.
- Define una interfaz comun `WhatsappProviderClient`.
- Crea `WhatsappGatewayService` que resuelve el proveedor activo por agente.
- Envuelve el cliente YCloud actual como `YCloudProvider`, sin cambiar su comportamiento.
- Cambia los consumidores directos de YCloud para que usen el gateway:
  - respuestas automaticas del agente;
  - envio manual desde conversaciones/inbox;
  - recordatorios/templates si existen.
- Anade `whatsappProvider` al modelo/configuracion de agente, por defecto `ycloud`.
- Crea migracion si el proyecto usa migraciones.
- Actualiza DTOs, sanitizacion de secretos y frontend minimo para no romper la configuracion existente.
- Verifica que YCloud sigue funcionando igual.

Fase 2 - Baileys MVP:
- Instala Baileys con pnpm.
- Crea adaptador `BaileysProvider`.
- Crea persistencia de sesion por agente, preferiblemente en Postgres si el proyecto ya usa DB.
- Expone endpoints autenticados para:
  - obtener estado de conexion;
  - iniciar conexion;
  - leer QR actual;
  - desconectar/reiniciar sesion.
- Implementa escucha de mensajes entrantes de Baileys.
- Normaliza mensajes entrantes al mismo contrato interno que usa YCloud.
- Reutiliza el mismo flujo del agente para guardar inbound, ejecutar LLM, guardar outbound y enviar respuesta.
- Implementa envio de texto por Baileys desde agente e inbox.
- Implementa dedupe por externalId para no ejecutar el agente dos veces.
- No expongas credenciales ni sesion Baileys al frontend.

Fase 3 - UI y robustez:
- En la pantalla de configuracion del agente, anade selector de proveedor: YCloud / Baileys / Meta.
- Para Baileys, muestra estado y QR si hace falta escanearlo.
- Maneja estados: not_configured, qr_pending, connecting, connected, disconnected, requires_reauth, error.
- Anade logs utiles sin PII ni secretos.
- Anade tests unitarios para parsers/normalizadores y tests de servicio donde sea razonable.

Fase 4 - Meta Cloud API:
- Prepara `MetaProvider` bajo el mismo gateway.
- Configuracion por agente:
  - metaPhoneNumberId;
  - metaBusinessAccountId si hace falta;
  - metaAccessToken como secreto;
  - metaAppSecret como secreto;
  - metaWebhookVerifyToken;
  - metaGraphApiVersion.
- Implementa envio texto con `POST https://graph.facebook.com/{version}/{phone-number-id}/messages`.
- Implementa envio de plantillas si el CRM usa recordatorios fuera de la ventana de 24h.
- Implementa webhook Meta:
  - GET para validacion `hub.challenge`;
  - POST para mensajes/estados;
  - verificacion `x-hub-signature-256`.
- Normaliza inbound/status igual que YCloud y Baileys.

Reglas importantes:
- No mezcles tipos/payloads de YCloud, Baileys y Meta en el dominio.
- El dominio debe trabajar con tipos internos normalizados.
- Mantén YCloud como proveedor por defecto para compatibilidad.
- No devuelvas secretos en GET de configuracion.
- Usa DTOs con validacion.
- No introduzcas cambios grandes no relacionados.
- Si encuentras cambios existentes en el workspace, no los reviertas.
- Documenta al final:
  - archivos tocados;
  - migraciones;
  - como probar YCloud;
  - como probar Baileys;
  - que queda pendiente para Meta.

Antes de editar, lee las guias del repo: AGENTS.md/CLAUDE.md, backend/CLAUDE.md, frontend/CLAUDE.md si existen, PRD y ADRs relacionadas con WhatsApp/conversaciones/recordatorios/seguridad.
```

