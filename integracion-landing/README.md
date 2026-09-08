# 🚀 GUÍA DE INTEGRACIÓN EN TU LANDING DE PRODUCCIÓN
## CRM Salvadora — Burbuja de Chat con IA, Simulador y Landing Page

Esta carpeta contiene todo lo necesario para integrar el **Agente de IA**, la **Burbuja Flotante de Chat**, el **Simulador de Diagnóstico** y la **Página de Landing** en cualquier proyecto web (Next.js, React, WordPress, Webflow, Shopify o HTML estático).

---

## 🌐 URLs de Producción de tu Servidor
* **URL Base del CRM:** `https://crm-salvadoraconesa.jigretera.com`
* **API del Widget:** `https://crm-salvadoraconesa.jigretera.com/api/widget/chat/booking`
* **Script Embebible Directo:** `https://crm-salvadoraconesa.jigretera.com/api/widget/embed.js`
* **Agente Principal:** `booking`

---

## 🧘 REGLAS DE NEGOCIO, HORARIOS Y TARIFAS OFICIALES (Actualizado)

Cualquier landing page o interfaz que use estos componentes debe reflejar con total exactitud las siguientes políticas comerciales:

### 1. Hatha Yoga Terapéutico (Sesiones de 90 min)
* **Horarios Oficiales:**
  * **Martes:** `09:45`, `11:15`, `17:00`, `18:30`, `20:00`
  * **Miércoles:** `20:15`
  * **Jueves:** `09:45`, `11:15`, `16:00` *(¡IMPORTANTE: a las 16:00, nunca 16:30!)*, `17:30`, `19:00`
* **Oferta de Bienvenida / Primera Clase:**
  * **¡NO SE COBRA, SE LA REGALAMOS!** (100% gratuita, 0,00 €).
* **Opciones después de la prueba:**
  * **Clases sueltas / esporádicas:** 10,00 € por clase (para no alumnos, sin matrícula ni compromiso).
  * **Alumno 1 clase semanal:** 25,00 € al mes (con turno fijo semanal asignado).
  * **Alumno 2 clases semanales:** 42,00 € al mes (con 2 turnos fijos semanales asignados).
* **Flexibilidad y condiciones de alumno:**
  * Los alumnos tienen un **horario fijo semanal** asignado para que no tengan que reservar manualmente cada semana.
  * **Recuperación de clases:** Si un alumno no puede acudir y avisa, puede recuperar su clase en cualquiera de los otros turnos disponibles durante **3 meses (90 días)**.
  * Alta o baja como alumno en cualquier momento bajo petición.
  * Cada cambio de horario o reprogramación dispara automáticamente un **correo electrónico** y un **SMS** para dejar constancia fehaciente.

### 2. Meditaciones Guiadas (Sesiones de 30 min)
* **Horarios:** Martes y Jueves de `09:15` a `09:45`.
* **Tarifas:**
  * **Alumnos de Yoga matriculados:** **¡GRATIS!** (Incluido en su cuota).
  * **No alumnos:** **15,00 € al mes** (acceso a todas las meditaciones) o **3,00 €** por meditación suelta.
* **Aforo y flexibilidad:** Aforo máximo de 28 plazas por sala. Movilidad flexible entre martes y jueves respetando plazas libres.

---

## 📦 OPCIÓN 1: Integración en 1 Línea (HTML, WordPress, Webflow, Shopify, etc.)

Para añadir la **Burbuja Flotante del Agente de IA** en cualquier web sin programar componentes, pega esta línea antes de la etiqueta de cierre `</body>`:

```html
<!-- CRM Salvadora - Burbuja de Chat IA con WhatsApp -->
<script 
  src="https://crm-salvadoraconesa.jigretera.com/api/widget/embed.js" 
  data-agent="booking" 
  data-color="#4f46e5" 
  data-title="Centro de Yoga y Bienestar Salvadora"
  data-welcome="¡Hola! 👋 Soy tu asistente de reservas. ¿En qué puedo ayudarte hoy?"
  defer>
</script>
```

> 💡 **Personalización:** Puedes cambiar `data-color`, `data-title` y `data-welcome` directamente desde el tag HTML.

---

## ⚛️ OPCIÓN 2: Integración en Proyectos Next.js / React

### 1. Variables de Entorno (`.env.local` o `.env.production`)
Copia las variables de `.env.example` en tu proyecto de frontend:

```env
NEXT_PUBLIC_CRM_API_URL=https://crm-salvadoraconesa.jigretera.com
NEXT_PUBLIC_DEFAULT_AGENT_KEY=booking
NEXT_PUBLIC_BUSINESS_NAME=Centro de Yoga y Bienestar Salvadora
```

### 2. Componentes disponibles en `components/`:
* `ChatBubbleWidget.tsx`: Componente React autocontenido con la burbuja flotante, chat en streaming con OpenRouter, historial y formulario de derivación a WhatsApp.
* `SimuladorDiagnosticoModal.tsx`: Modal con IA para análisis visual de imágenes y recomendaciones automáticas.
* `FooterLegal.tsx`: Pie de página legal responsive con enlaces a privacidad, términos y contacto.
* `VapiVoiceBookingButton.tsx`: Botón y modal interactivo para solicitar llamada telefónica instantánea con la IA de VAPI y recibir SMS automático de Zadarma tras la reserva.

### 3. Cómo usar la Burbuja de Chat y el Botón de Llamada Telefónica en tu Landing:
```tsx
import { ChatBubbleWidget } from "@/components/ChatBubbleWidget";
import { VapiVoiceBookingButton } from "@/components/VapiVoiceBookingButton";

export default function MiLandingPage() {
  return (
    <main className="p-8">
      <h1>Reserva tu clase o cita en Centro Salvadora</h1>
      
      {/* Botón directo de llamada IA con Zadarma SMS */}
      <div className="my-6">
        <VapiVoiceBookingButton 
          buttonText="📞 Reservar por Teléfono (Llamada IA + SMS)"
          serviceHint="Reserva de Yoga o Terapia"
        />
      </div>

      {/* Burbuja flotante de chat en la esquina inferior */}
      <ChatBubbleWidget agentKey="booking" />
    </main>
  );
}
```

---

## 📞 OPCIÓN 3: Botón HTML Autocontenido para WordPress / Webflow / Shopify
Si tu landing está hecha en WordPress, Elementor, Webflow, Shopify o HTML estático:
1. Abre el archivo `embed-html/vapi-sms-widget.html`.
2. Copia el botón y el modal en tu página.
3. El visitante pulsa el botón, introduce su móvil y la IA le llama de inmediato, confirmando la plaza y disparando el SMS de Zadarma en tiempo real.

---

## 📄 OPCIÓN 4: Integrar la Página Completa de Landing

En la carpeta `pages/` dispones del código fuente completo de la landing:
* `pages/demo-landing-app-router.tsx` $\rightarrow$ Para copiarlo en `app/servicios/page.tsx` o `app/page.tsx` (Next.js App Router).
* `pages/demo-landing-pages-router.tsx` $\rightarrow$ Para copiarlo en `pages/index.tsx` (Next.js Pages Router / Vite React).

---

## 🛠️ Endpoints de la API del Widget disponibles:
1. `GET /api/widget/config/:agentKey` $\rightarrow$ Obtiene el nombre del negocio, color de marca y lista de servicios disponibles.
2. `POST /api/widget/chat/:agentKey` $\rightarrow$ Envía un mensaje al agente de IA y devuelve la respuesta en tiempo real.
3. `POST /api/widget/vapi/call` $\rightarrow$ Inicia una llamada saliente de voz (VAPI) hacia el móvil del cliente y envía el SMS de Zadarma al confirmar.
4. `POST /api/widget/handoff-whatsapp/:agentKey` $\rightarrow$ Registra el contacto en el CRM y deriva la conversación a WhatsApp.
5. `POST /api/widget/analizaia/analizar` $\rightarrow$ Analiza una imagen o descripción y genera un prediagnóstico médico o de bienestar.
6. `POST /api/sms/send` $\rightarrow$ Envío y registro de SMS vía API de Zadarma con firma HMAC-SHA1.
7. `GET /api/sms/logs` $\rightarrow$ Consulta histórica de auditoría y costes de SMS enviados.
