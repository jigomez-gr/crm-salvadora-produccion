# Estado del Sistema: Pasarela de Pagos Online (Stripe & Bizum) y Trazabilidad en Auditoría

**Fecha de consolidación:** 24 de noviembre de 2026  
**Proyecto:** CRM Salvadora (`crm_salvadora`)  
**Entorno:** Producción (`crm-salvadoraconesa.jigretera.com` / `salvadoraconesa.es`)  

---

## 1. Estado Actual de la Pasarela de Pago

> [!IMPORTANT]
> **GARANTÍA DE BLOQUEO DE PAGOS ONLINE:**  
> La pasarela de pagos online (Stripe y Bizum) se encuentra **DESHABILITADA** a nivel de base de datos (`payment_account.enabled = false`) y a nivel de aplicación.  
> **NO se procesa ni se permite generar ningún cobro online.**

### Comprobación en Base de Datos de Producción
```sql
SELECT id, currency, enabled, "enableBizum", "enableCard" FROM payment_account;
```
* **`enabled`**: `false` (**Deshabilitada**)
* **`enableBizum`**: `true` (Método configurado pero inactivo al estar la pasarela deshabilitada)
* **`enableCard`**: `true` (Método configurado pero inactivo al estar la pasarela deshabilitada)

---

## 2. Reglas de Protección Activas contra Cobros Online

1. **Rechazo a nivel de API (`PaymentsService.createCheckoutSession`):**  
   Cualquier petición interna o externa para generar una sesión de Stripe Checkout o un enlace de pago es rechazada de inmediato con:
   ```json
   {
     "statusCode": 400,
     "message": "La pasarela de pago online (Stripe / Bizum) está deshabilitada actualmente."
   }
   ```
2. **Agente de IA y Asistente Virtual:**  
   Al estar la pasarela deshabilitada, el asistente de IA tiene prohibido ofrecer enlaces de Stripe (`https://checkout.stripe.com/...`) y redirige cualquier consulta o formalización de pago al centro: *"El pago se realiza en el centro."*
3. **Interfaz de Administración (`/settings`):**  
   La tarjeta de pasarela de pagos muestra el distintivo **`○ Pasarela Deshabilitada`** con fondo rojo preventivo y los selectores de métodos de cobro deshabilitados.

---

## 3. Trazabilidad e Inmutabilidad en la Auditoría (`audit_logs`)

Cualquier cambio de estado de la pasarela está instrumentado mediante eventos desacoplados (`AUDIT_EVENT` → `audit.record`):

### Evento registrado en el paso a Deshabilitada:
* **ID:** `1fcc135f-af28-401a-9318-b421117a7b50`
* **Acción:** `payment.gateway_disabled`
* **Usuario:** `admin@crmsalvadora.local`
* **Fecha y hora:** `2026-11-24 09:59:06.293576` (UTC) / `10:59:06` (Local)
* **Detalle:** `Deshabilitó la pasarela de pago (Stripe / Bizum)`
* **Metadatos:** `{"enabled": false, "enableCard": true, "enableBizum": true, "previousEnabled": true, "timestamp": "2026-11-24T08:59:06.288Z"}`

### Garantía si la acción es revertida (Habilitar de nuevo):
Si cualquier administrador activa nuevamente el interruptor maestro o los métodos en `/settings`:
1. El backend detecta la transición (`prevEnabled: false` → `account.enabled: true`).
2. Se emite inmediatamente el evento `AuditAction.PAYMENT_GATEWAY_ENABLED` (`payment.gateway_enabled`).
3. Se almacena de forma inmutable en la tabla `audit_logs` con:
   * **Fecha y hora exacta** (`createdAt`).
   * **Email del usuario administrador** que realizó la reactivación.
   * **Dirección IP** de origen.
   * **Badge visual verde en el panel de `/audit`**: `Pasarela Stripe/Bizum habilitada`.
   * **Resumen descriptivo**: `"Habilitó la pasarela de pago (Stripe / Bizum)"`.
   * **Metadatos completos**: estado anterior (`previousEnabled: false`) y nuevo estado.
