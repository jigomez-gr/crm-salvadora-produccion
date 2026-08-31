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

### 3. Cómo usar la Burbuja de Chat en tu Layout (`layout.tsx` o `App.tsx`):
```tsx
import { ChatBubbleWidget } from "@/components/ChatBubbleWidget";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        {/* Burbuja flotante en toda la web */}
        <ChatBubbleWidget agentKey="booking" />
      </body>
    </html>
  );
}
```

---

## 📄 OPCIÓN 3: Integrar la Página Completa de Landing

En la carpeta `pages/` dispones del código fuente completo de la landing:
* `pages/demo-landing-app-router.tsx` $\rightarrow$ Para copiarlo en `app/servicios/page.tsx` o `app/page.tsx` (Next.js App Router).
* `pages/demo-landing-pages-router.tsx` $\rightarrow$ Para copiarlo en `pages/index.tsx` (Next.js Pages Router / Vite React).

---

## 🛠️ Endpoints de la API del Widget disponibles:
1. `GET /api/widget/config/:agentKey` $\rightarrow$ Obtiene el nombre del negocio, color de marca y lista de servicios disponibles.
2. `POST /api/widget/chat/:agentKey` $\rightarrow$ Envía un mensaje al agente de IA y devuelve la respuesta en tiempo real.
3. `POST /api/widget/handoff-whatsapp/:agentKey` $\rightarrow$ Registra el contacto en el CRM y deriva la conversación a WhatsApp.
4. `POST /api/widget/analizaia/analizar` $\rightarrow$ Analiza una imagen o descripción y genera un prediagnóstico médico o de bienestar.
