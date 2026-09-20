# Guía Maestra: Clonar y Levantar el Ecosistema Completo en Otra Máquina

Esta guía describe paso a paso cómo replicar el entorno completo (**Landing Page Salvadora** + **CRM Salvadora con Agente IA y Base de Datos**) en un nuevo ordenador o servidor para arrancar este proyecto o uno similar para otro cliente.

---

## 🏛️ Arquitectura del Ecosistema

El sistema consta de 3 piezas desacopladas:

1. **Base de Datos (PostgreSQL)**:
   - Motor relacional que almacena servicios, categorías, agentes, contactos, citas, mensajes, usuarios y configuraciones.
   - Dumps de producción incluidos en la carpeta `backups/`:
     - `backup_crm_salvadora_20260920.dump` (formato binario optimizado para `pg_restore`)
     - `backup_crm_salvadora_20260920.sql` (script SQL plano autocontenido)
2. **Backend CRM (`crm_salvadora/backend`)**:
   - Framework **NestJS** (puerto `3001`).
   - Agente de reservas con IA (Mastra), webhook de WhatsApp (YCloud), endpoints de catálogo `/api/widget/services` y gestión de servicios (`POST /api/services/:id/duplicate`).
3. **Frontend CRM (`crm_salvadora/frontend`)**:
   - Panel de administración en **Next.js** (puerto `3000`).
   - Gestión de contactos, calendario, agentes, playground, catálogo de servicios y demo-landing.
4. **Landing Web (`salvadora/caso1`)**:
   - Web pública de alta conversión en **Next.js 16** (puerto `3000` en producción, o `3002` si convive en la misma máquina local).
   - Catálogo en tiempo real sincronizado con el CRM, selector interactivo vídeo/flyer con zoom lightbox y pasarela Stripe.

---

## 📋 Requisitos Previos en la Nueva Máquina

- **Node.js**: versión `20.9.0` o superior (se recomienda `22.x LTS`).
- **pnpm**: gestor rápido de dependencias (`corepack enable pnpm` o `npm i -g pnpm`).
- **PostgreSQL** o **Docker Desktop**: para la base de datos (puerto `5432` o `5433`).
- **Git**: para clonar los repositorios.

---

## 💾 Paso 1: Restaurar la Base de Datos de Producción

Los archivos de dump se encuentran en:
- En CRM: `crm_salvadora/backups/backup_crm_salvadora_20260920.dump` (y `.sql`)
- En Landing: `salvadora/caso1/database_dump/backup_crm_salvadora_20260920.dump` (y `.sql`)

### Opción A — Usando Docker (Recomendado para local)

1. En la carpeta `crm_salvadora`, arranca el contenedor de PostgreSQL:
   ```bash
   docker compose up -d
   ```
2. Espera 5 segundos a que la base de datos esté lista y restaura el dump:
   ```bash
   # En Windows PowerShell:
   Get-Content backups\backup_crm_salvadora_20260920.sql | docker exec -i crm_salvadora-db-1 psql -U crm -d crm_salvadora

   # En Linux / Mac / Bash:
   docker exec -i crm_salvadora-db-1 psql -U crm -d crm_salvadora < backups/backup_crm_salvadora_20260920.sql
   ```

### Opción B — Usando PostgreSQL nativo o servidor remoto

1. Crea la base de datos limpia:
   ```bash
   createdb -h localhost -p 5432 -U postgres crm_salvadora
   ```
2. Restaura con `pg_restore` (usando el fichero `.dump`):
   ```bash
   pg_restore -h localhost -p 5432 -U postgres -d crm_salvadora --clean --if-exists backups/backup_crm_salvadora_20260920.dump
   ```
   *(O alternativamente con `psql -h localhost -p 5432 -U postgres -d crm_salvadora -f backups/backup_crm_salvadora_20260920.sql`)*

---

## ⚙️ Paso 2: Configurar y Arrancar el Backend (`crm_salvadora/backend`)

1. Entra en la carpeta del backend:
   ```bash
   cd crm_salvadora/backend
   ```
2. Crea el archivo `.env` a partir de la plantilla:
   ```bash
   cp .env.example .env
   ```
3. Revisa los valores esenciales en `.env`:
   ```env
   # Conexión a tu PostgreSQL
   DATABASE_URL="postgresql://crm:crmpass@localhost:5433/crm_salvadora"
   PORT=3001

   # Seguridad (Genera una clave aleatoria para producción)
   JWT_SECRET="clave-secreta-para-firmar-tokens-jwt-min-32-caracteres"
   ADMIN_EMAIL="admin@crmsalvadora.local"
   ADMIN_PASSWORD="TuPasswordSegura123!"

   # Origen permitido para CORS (Webs que pueden consultar la API)
   CORS_ORIGIN="http://localhost:3000,http://localhost:3002,https://tu-dominio.com"

   # No sembrar datos demo porque ya importamos el dump real
   SEED_DEMO_DATA=false
   ```
4. Instala y arranca:
   ```bash
   pnpm install
   pnpm start:dev
   ```
   *La API estará escuchando en `http://localhost:3001`.*

---

## 💻 Paso 3: Configurar y Arrancar el Frontend CRM (`crm_salvadora/frontend`)

1. En otra terminal, entra en la carpeta frontend:
   ```bash
   cd crm_salvadora/frontend
   ```
2. Crea el archivo `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Asegúrate de que contiene:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```
3. Instala y arranca:
   ```bash
   pnpm install
   pnpm dev
   ```
4. Abre [http://localhost:3000](http://localhost:3000) en el navegador:
   - Login por defecto: `admin@crmsalvadora.local` / `Admin1234!` (o lo que hayas configurado en `ADMIN_EMAIL` / `ADMIN_PASSWORD`).
   - Acceso directo a la demo sincronizada: [http://localhost:3000/demo-landing](http://localhost:3000/demo-landing).

---

## 🌐 Paso 4: Configurar y Arrancar la Landing Page (`salvadora/caso1`)

1. Abre una tercera terminal y entra en la landing:
   ```bash
   cd salvadora/caso1
   ```
2. Crea su `.env`:
   ```bash
   cp .env.example .env
   ```
   Configura las URLs:
   ```env
   # Si ejecutas el CRM en local:
   NEXT_PUBLIC_CRM_API_URL="http://localhost:3001"
   NEXT_PUBLIC_DEFAULT_AGENT_KEY="booking"
   NEXT_PUBLIC_BUSINESS_NAME="Centro de Yoga y Bienestar Salvadora Conesa"

   # Base de datos (misma que el CRM o la correspondiente)
   DATABASE_URL="postgresql://crm:crmpass@localhost:5433/crm_salvadora"
   ```
3. Instala dependencias y compila el cliente Prisma:
   ```bash
   npm install
   npx prisma generate
   ```
4. Arranca en un puerto alternativo (por ejemplo el `3002` para no chocar con el puerto `3000` del CRM):
   ```bash
   # En Windows PowerShell o Bash:
   npm run dev -- -p 3002
   ```
5. Abre [http://localhost:3002](http://localhost:3002) (o [http://localhost:3002/servicios](http://localhost:3002/servicios)).
   - Verás cómo carga automáticamente los servicios, flyers, vídeos y categorías desde el backend del CRM.

---

## 🎯 Paso 5: Cómo Adaptar el Ecosistema para un Negocio Nuevo

Si vas a utilizar esta base para crear el portal y CRM de **otra empresa o cliente diferente**:

1. **Base de Datos y Negocio**:
   - Entra al CRM (`/settings` y `/services`).
   - Modifica el nombre del centro, logo, color corporativo y teléfono de WhatsApp.
   - En `/services` puedes:
     - Editar los servicios existentes.
     - **Duplicar/Clonar servicios** existentes con un solo clic con el botón `Duplicar` para crear nuevos rápidamente.
     - Cambiar la categoría (`Longevidad`, `Yoga`, `Talleres/Retiros`, `Terapias`) y su orden de aparición (`#1..#4`).
     - Subir nuevos flyers o vídeos particulares para cada actividad.
     - Asignar fechas de inicio y fin (`fechaDesde` y `fechaHasta`).
2. **Personalización de la Landing**:
   - Modifica el archivo `.env`: cambia `NEXT_PUBLIC_BUSINESS_NAME` y el enlace de contacto.
   - En `src/app/globals.css`: adapta la paleta de colores corporativa (tonos primarios, acentos y fondos).
   - En `src/app/page.tsx`: ajusta el titular de portada, bio o historia del centro.
3. **Canales de Comunicación con IA**:
   - En el CRM ve a **Agentes → Configuración**:
     - Agrega tu clave de **OpenRouter** para el modelo de lenguaje.
     - Agrega tu clave y número de **YCloud** si deseas que atienda por WhatsApp en vivo.
     - O pruébalo sin coste en el **Playground** integrado.
4. **Pasarela de Pago (Stripe)**:
   - Configura las variables `STRIPE_PUBLIC_KEY`, `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` con las credenciales de la cuenta Stripe del cliente.
