/**
 * GUÍA DE INTEGRACIÓN CON EL FLUJO DE LLAMADAS VAPI EN EL CRM
 * 
 * Este archivo ilustra cómo inyectar ZadarmaSmsService en `vapi-webhook.service.ts`
 * para disparar el envío de SMS automáticamente tras confirmar una reserva o al colgar.
 */

/* =========================================================================
   1. Importar el servicio en `vapi-webhook.service.ts`:
   =========================================================================
   
   import { ZadarmaSmsService } from '../sms/zadarma-sms.service';
*/

/* =========================================================================
   2. Inyectar en el constructor de `VapiWebhookService`:
   =========================================================================

   constructor(
     // ...otros servicios...
     private readonly zadarmaSms: ZadarmaSmsService,
   ) {}
*/

/* =========================================================================
   3. OPCIÓN A: Disparo inmediato al ejecutarse la herramienta `reservar_cita`
   =========================================================================
   
   En el método handleToolCalls(), en el bloque 'reservar_cita':
   
   case 'reservar_cita': {
     const result = await this.executeReservarCita(call, args);
     
     // Si la reserva fue exitosa y tenemos teléfono del cliente:
     if (result.success && call.customerNumber) {
       const mensaje = `¡Hola! Tu reserva de ${result.serviceName || 'clase'} en Salvadora está confirmada para el ${result.formattedDate || 'horario acordado'}. Si deseas recibir los detalles por correo, respóndenos con tu email.`;
       
       // Enviar SMS asíncronamente sin bloquear la respuesta de voz
       this.zadarmaSms.sendSms({
         number: call.customerNumber,
         message: mensaje,
         callId: call.id,
         contactId: result.contactId,
         appointmentId: result.appointmentId,
       }).catch(err => console.error('Error enviando SMS post-reserva:', err));
     }
     
     return result;
   }
*/

/* =========================================================================
   4. OPCIÓN B: Disparo en el evento `end-of-call-report` (al colgar la llamada)
   =========================================================================
   
   Cuando VAPI envía el webhook `end-of-call-report`, el sistema analiza si hubo cita:
   
   async handleEndOfCallReport(payload: VapiEndOfCallPayload) {
     const call = await this.findCallByVapiId(payload.call.id);
     
     // Verificar si la llamada culminó en una cita nueva
     if (call && call.appointmentCreated && call.customerNumber) {
       const clientPhone = call.customerNumber;
       const mensaje = `Centro Salvadora: Confirmamos tu cita. Si deseas recibir el acceso y recordatorio por correo electrónico, responde a este SMS con tu email. ¡Te esperamos!`;

       await this.zadarmaSms.sendSms({
         number: clientPhone,
         message: mensaje,
         callId: call.id,
         contactId: call.contactId,
       });
     }
   }
*/
