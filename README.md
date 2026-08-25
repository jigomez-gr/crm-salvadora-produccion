# CRM Academy

CRM empresarial *white-label* con agentes de IA: un panel (dashboard, contactos,
calendario, conversaciones) y un **agente de reservas** que atiende por WhatsApp,
adaptable a cualquier negocio sin tocar código.

- **Frontend:** Next.js + React + Tailwind
- **Backend:** NestJS + TypeORM (con el agente **Mastra** embebido)
- **Base de datos:** PostgreSQL
- **WhatsApp:** YCloud · **Modelo IA:** OpenRouter (cientos de modelos con una clave)

> Puedes crear **varios agentes** desde la app. Cada uno se conecta a su propio
> WhatsApp y elige su modelo de IA — todo desde la UI, sin tocar código.

> ¿Quieres **desplegarlo en internet** (VPS + dominio)? No sigas aquí: ve a
> **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (guía paso a paso, sin necesidad de
> programar). Este README es para **ejecutarlo en tu propio ordenador**.

---

## ✨ Qué incluye

- **Dashboard** — métricas (contactos, citas de hoy, próximas citas, agentes
  activos) y conversaciones recientes, en tiempo real.
- **Contactos (CRM)** — alta, edición, borrado y búsqueda; la ficha de cada
  contacto muestra sus citas.
- **Calendario** — vistas de **mes y semana**; crea y edita citas; se actualiza
  solo cuando un agente reserva.
- **Conversaciones** — bandeja tipo chat con los mensajes de WhatsApp y del
  Playground, en vivo.
- **Agentes (multi-agente)** — crea **varios agentes**; cada uno con su
  personalidad, su **modelo de IA** (OpenRouter) y su **conexión de WhatsApp**
  (YCloud), todo configurable desde la UI. Incluye un **Playground** para probarlos
  sin WhatsApp.

> Todo se adapta **sin tocar código**: textos, servicios, horarios, modelo de IA y
> conexión de WhatsApp se editan desde la propia aplicación.

---

## 🧰 Qué necesitas instalar (una sola vez)

Para ejecutar el proyecto en tu ordenador, instala estas herramientas:

| Herramienta | Para qué |
| --- | --- |
| **[Node.js](https://nodejs.org) 22.13 o superior** | Ejecuta la aplicación |
| **[pnpm](https://pnpm.io/installation)** | Gestor de paquetes del proyecto (usamos **pnpm**, no npm). Si ya tienes Node, actívalo con `corepack enable pnpm` |
| **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** | Levanta la base de datos |
| **[Claude Code](https://claude.com/claude-code)** | Arranca el proyecto por ti |
| **[Git](https://git-scm.com)** *(recomendado)* | Descargar el proyecto y subir cambios |

> ℹ️ Este proyecto usa **pnpm** (no `npm`). Donde veas comandos, usa siempre
> `pnpm`: `pnpm install`, `pnpm dev`, etc.

**Y ya está.** Abre el proyecto con Claude Code y dile:

> 💬 *"Arranca el proyecto en local"*

Claude Code se encarga del resto: instala las dependencias, levanta la base de
datos, crea los archivos de configuración (`.env`) y arranca todo. Cuando
termine, abre **http://localhost:3000** en el navegador.

> ℹ️ **Dos apuntes honestos:**
> - Las herramientas de la tabla las instalas **tú** (son instaladores normales
>   con su ventana; Claude Code no puede instalar programas del sistema).
> - Para que el **agente de IA responda**, necesitas una clave de **OpenRouter**.
>   No va en ningún archivo: se pega **dentro de la app** (Agentes → tu agente →
>   Configuración). Sin ella el CRM funciona igual, pero el agente no contesta.

---

## Arrancar a mano (si prefieres no usar Claude Code)

Estos son los mismos pasos que hace Claude Code, por si quieres ejecutarlos tú.

### 1. Arranca la base de datos

Desde la carpeta del proyecto:

```bash
docker compose up -d
```

Esto levanta PostgreSQL en el puerto `5433` de tu ordenador. (Usa el archivo
`docker-compose.yml`, que es **solo para local** — no confundir con
`docker-compose.prod.yml`, que es para el despliegue.)

> **¿No quieres usar Docker?** Docker aquí se usa **solo para la base de datos**
> (la app corre con Node, sin Docker). Si prefieres no instalarlo, tienes dos
> alternativas:
> 1. **Postgres gratis en la nube** (Neon, Supabase o Railway): crea una base de
>    datos, copia su *connection string* y pégala en `DATABASE_URL` de
>    `backend/.env`. Sáltate este paso 1.
> 2. **Instalar PostgreSQL nativo** en tu ordenador y crear la base `crm_academy`.

### 2. Arranca el backend (API + agente)

```bash
cd backend
cp .env.example .env      # copia la plantilla de variables (edítala si quieres)
pnpm install
pnpm start:dev
```

La API queda en `http://localhost:3001`. No necesitas poner ninguna clave en el
`.env`: el modelo de IA (OpenRouter) y WhatsApp (YCloud) se configuran **dentro
de la app**, en Agentes → tu agente → Configuración.

### 3. Arranca el frontend (la web)

En **otra terminal**:

```bash
cd frontend
cp .env.example .env.local   # ya apunta a http://localhost:3001
pnpm install
pnpm dev
```

Abre **`http://localhost:3000`** en el navegador. ¡Listo!

> 💡 **Datos de ejemplo automáticos.** La primera vez que arrancas con una base
> de datos vacía, la app se rellena sola con contactos, citas y conversaciones de
> demostración para que no veas una pantalla vacía. Solo ocurre si no hay datos
> (no duplica ni pisa los tuyos). Para desactivarlo, pon `SEED_DEMO_DATA=false` en
> `backend/.env`.

> 🔐 **Inicio de sesión.** La app tiene **login con roles**. La primera vez se
> crea un administrador automáticamente: **`admin@crmacademy.local` / `Admin1234!`**
> (cámbialo cuanto antes, o define `ADMIN_EMAIL` y `ADMIN_PASSWORD` en
> `backend/.env` antes del primer arranque). Hay dos roles: **administrador**
> (acceso total, incluida la gestión de usuarios) y **empleado** (todo menos la
> pantalla de Usuarios). Los nuevos usuarios solo los crea un administrador desde
> **Usuarios** (no hay registro abierto).

> 🔒 **Seguridad.** Lo único pensado para ser público es el webhook de WhatsApp,
> que solo acepta mensajes firmados (necesita su *webhook secret*). Para
> desplegar en internet define un `JWT_SECRET` largo y aleatorio (obligatorio en
> producción) — ver `docs/DEPLOYMENT.md` y
> `docs/adr/0006-security-hardening-and-demo-seed.md`.

---

## Variables de entorno en local

| Archivo | Variable | Para qué |
| --- | --- | --- |
| `backend/.env` | `DATABASE_URL` | Conexión a la base de datos (ya viene apuntando al puerto `5433`) |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | Dónde está la API (`http://localhost:3001`) |

> Las claves de **OpenRouter** (IA) y **YCloud** (WhatsApp) ya no van en el
> `.env`: se configuran por agente desde la app. En `backend/.env.example` quedan
> como variables opcionales (fallback global) y puedes dejarlas vacías.
>
> Tampoco necesitas tocar el CORS en local: el backend ya acepta `localhost:3000` por defecto.

### Probar WhatsApp desde tu ordenador (con un túnel)

El **Playground** (Agentes → tu agente → Playground) ya te deja probar el agente
**sin WhatsApp**. Para el día a día suele ser suficiente.

Si quieres probar **WhatsApp de verdad** desde tu ordenador, hay un detalle
importante: cada vez que llega un mensaje, YCloud tiene que **avisar a tu backend**,
y para eso necesita poder **alcanzarlo desde internet con una dirección `https://`**.
La URL que te muestra la app (`http://localhost:3001/...`) **no sirve**: `localhost`
es solo tu propia máquina, y además no es HTTPS.

La solución es un **túnel**: un programa que coge tu `localhost:3001` y le pone
delante una dirección pública con HTTPS que YCloud sí puede usar.

**Opción más simple (sin crear cuenta) — Cloudflare Tunnel:**

1. Instala [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Con el backend corriendo en `:3001`, abre **otra terminal** y ejecuta:
   ```bash
   cloudflared tunnel --url http://localhost:3001
   ```
3. Te dará una URL tipo `https://algo-aleatorio.trycloudflare.com`. **Esa** es tu
   dirección pública (en lugar de `http://localhost:3001`).
4. En la app (Agentes → tu agente → **Configuración**) fíjate en la parte final de
   la URL del webhook (`/api/webhooks/ycloud/tu-agente`) y pégala detrás de la URL
   del túnel. Te queda algo así:
   `https://algo-aleatorio.trycloudflare.com/api/webhooks/ycloud/tu-agente`
5. Pega esa URL en YCloud (Developers → Webhooks), copia el *secret* que te dé y
   pégalo en la app (campo **"Webhook secret de YCloud"**).

> **Apuntes honestos:**
> - Con la opción gratuita sin cuenta, la URL del túnel **cambia cada vez** que lo
>   reinicias, y solo funciona **mientras tu ordenador y el túnel estén encendidos**.
>   Tendrás que actualizar la URL en YCloud cada vez que cambie.
> - Alternativas equivalentes: **ngrok**, o **Tailscale Funnel**
>   (`tailscale funnel --bg 3001`), que da una URL **estable** entre reinicios pero
>   requiere instalar Tailscale e iniciar sesión una vez.
> - Para uso **real** (URL fija, siempre encendido, HTTPS automático) lo suyo es
>   **desplegar** en un servidor: ve a **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Adaptar el negocio sin código

Todo se configura **desde la propia app**, sin tocar código. Ve a **Agentes** y:

- **Crea agentes** con el botón "Nuevo agente".
- En cada agente (→ **Configuración**) edita: nombre, descripción, servicios,
  horarios, tono y zona horaria; elige el **modelo de IA** (OpenRouter) y pega su
  clave; y conecta **WhatsApp** (clave de YCloud + copia la URL del webhook que te
  muestra la app para pegarla en YCloud).
- Prueba el agente al instante en la pestaña **Playground**.

## 🗂️ Estructura del proyecto

- `backend/` — API (NestJS + TypeORM) con el agente de IA (Mastra) embebido.
- `frontend/` — interfaz web (Next.js + Tailwind).
- `docs/` — documentación: el PRD y las decisiones técnicas (ADRs).
- `docker-compose.yml` — base de datos para **desarrollo local**.
- `docker-compose.prod.yml` — stack completo (web + API + base de datos) para el **despliegue**.

## Documentación

- **[docs/PRD.md](docs/PRD.md)** — qué hace la app y su alcance (estado actual).
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — desplegar en un VPS con Dokploy.
- **[docs/adr/](docs/adr/)** — decisiones técnicas: stack (0001), realtime/SSE (0002),
  WhatsApp/YCloud (0003), proveedor de IA (0004→0005), multi-agente + OpenRouter (0005).
