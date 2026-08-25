# Guía de despliegue en un VPS con Dokploy

Esta guía te lleva, paso a paso, desde "tengo el proyecto" hasta "mi CRM está
funcionando en internet con mi propio dominio y HTTPS". Está pensada para
personas **sin conocimientos técnicos**: no hace falta saber programar ni usar
la terminal (salvo un comando para instalar Dokploy la primera vez).

> **La idea:** subes el proyecto a tu cuenta de GitHub, lo conectas una vez en
> Dokploy, rellenas unas pocas variables, y pulsas **Deploy**. A partir de ahí,
> **cada cambio que subas a GitHub se despliega solo**.

---

## 1. Qué necesitas antes de empezar

| Necesitas | Para qué | Coste aproximado |
| --- | --- | --- |
| Un **VPS** (Hetzner, DigitalOcean, Contabo…) con Ubuntu | Donde vive tu app | ~5 €/mes |
| Un **dominio** (Namecheap, Cloudflare, IONOS…) | La dirección de tu CRM | ~10 €/año |
| Una cuenta de **GitHub** | Guardar el proyecto | Gratis |
| Una cuenta de **OpenRouter** (clave de API) | El cerebro del agente de IA (una clave, cientos de modelos) | — |
| Una cuenta de **YCloud** (opcional al principio) | Conectar WhatsApp | — |

La app son **3 piezas que se despliegan juntas** en un solo proyecto: la web
(lo que ve el usuario), la API (incluye el agente de IA) y la base de datos. No
tienes que configurarlas por separado: un único archivo (`docker-compose.prod.yml`)
lo orquesta todo.

> **¿Necesito instalar Docker o saber programar? No.**
> - En **tu ordenador** no instalas nada: solo necesitas un navegador.
> - En el **VPS** sí se usa Docker, pero **se instala solo** con el comando del
>   paso 2 (no lo tocas a mano).
> - No hace falta escribir código en ningún momento.

> **Verás dos archivos parecidos en el repositorio.** Usa siempre
> **`docker-compose.prod.yml`** (el del despliegue real). El otro,
> `docker-compose.yml`, sirve solo para desarrollar en un ordenador y **aquí no
> se usa**: puedes ignorarlo.

---

## 2. Instalar Dokploy en el VPS (solo la primera vez)

Pega este comando en el VPS (es el instalador oficial de Dokploy; **instala
Docker por ti** y todo lo necesario):

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

> **¿Cómo "pego un comando en el VPS" sin ser técnico?** Casi todos los
> proveedores (Hetzner, DigitalOcean, Contabo…) tienen una **consola web** dentro
> de su panel: un terminal que se abre en el navegador. No necesitas instalar
> ningún programa ni saber de SSH — abres esa consola, pegas el comando y pulsas
> Enter. (Búscalo como "Console", "Web Terminal" o "VNC" en tu proveedor.)

Cuando termine, abre en tu navegador `http://LA-IP-DE-TU-VPS:3000` y crea tu
cuenta de administrador. Esto solo se hace una vez por servidor.

---

## 3. Pon el proyecto en TU GitHub

1. Abre el repositorio del proyecto en GitHub.
2. Pulsa el botón verde **"Use this template" → "Create a new repository"**
   (o haz un *fork*). Así tendrás tu propia copia, que es la que vas a desplegar.
3. Ponle el nombre que quieras y créalo. Puede ser privado.

> Más adelante, cuando adaptes la app a tu negocio con Claude Code, los cambios
> se guardan en **este** repositorio.

---

## 4. Apunta tu dominio al VPS (DNS)

Tu app usará **dos subdominios** (puedes cambiarlos por los que quieras):

- `app.tudominio.com` → la web
- `api.tudominio.com` → la API

En el panel de tu proveedor de dominios, crea **dos registros tipo `A`**, ambos
apuntando a la **IP de tu VPS**:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| A | `app` | IP de tu VPS |
| A | `api` | IP de tu VPS |

> ⚠️ Haz esto **antes** de desplegar. El HTTPS automático necesita que el dominio
> ya apunte al servidor para poder emitir el certificado. Los cambios de DNS
> pueden tardar unos minutos en propagarse.

---

## 5. Crea el proyecto en Dokploy

1. En Dokploy: **Create Project** → ponle un nombre (ej. "CRM").
2. Dentro del proyecto: **Create Service → Compose**.
3. En **Provider**, elige **GitHub** y conecta tu cuenta de GitHub
   (Dokploy te pedirá autorizar su aplicación; es un par de clics).
4. Selecciona **tu repositorio** y la rama **`main`**.
5. En **Compose Path**, escribe exactamente:

   ```
   docker-compose.prod.yml
   ```

   Este es el archivo que despliega las 3 piezas juntas.

---

## 6. Añade las variables de entorno

Ve a la pestaña **Environment** del servicio y pega lo siguiente, **cambiando
los valores** por los tuyos (tienes la plantilla en `.env.production.example`):

```env
# Dominios (los mismos que configuraste en el DNS, sin https://)
WEB_DOMAIN=app.tudominio.com
API_DOMAIN=api.tudominio.com

# Base de datos (usa una contraseña larga e inventada)
POSTGRES_DB=crm_academy
POSTGRES_USER=crm
POSTGRES_PASSWORD=pon-aqui-una-contrasena-larga

# Seguridad del login (OBLIGATORIO). Sin esto la API NO arranca.
# Genera una cadena larga y aleatoria. Si tienes la consola del VPS a mano:
#   openssl rand -hex 32
# (o usa cualquier generador de contraseñas y pon 40+ caracteres)
JWT_SECRET=pega-aqui-una-cadena-larga-y-aleatoria

# Primer administrador (se crea solo en el primer despliegue).
# La contraseña debe ser FUERTE; la API se niega a arrancar con la de por defecto.
ADMIN_EMAIL=admin@tudominio.com
ADMIN_PASSWORD=pon-aqui-una-contrasena-fuerte
```

> **Eso es todo lo que necesitas.** El modelo de IA (OpenRouter) y la conexión de
> WhatsApp (YCloud) **no van aquí**: se configuran después, dentro de la app, por
> cada agente (paso 8). En `.env.production.example` verás esas claves como
> opcionales — puedes ignorarlas.

> ⚠️ **`JWT_SECRET` y `ADMIN_PASSWORD` son obligatorias.** Por seguridad, la API
> **se niega a arrancar** si falta `JWT_SECRET`, si `ADMIN_PASSWORD` se deja con
> el valor de ejemplo, o si faltan los dominios. Si tras desplegar el servicio
> `api` no levanta, abre sus **Logs** en Dokploy: te dirá exactamente qué falta.
> Opcional: `BUSINESS_TIMEZONE` (por defecto `Europe/Madrid`) ajusta la zona
> horaria del negocio para contadores como "citas de hoy".

> No tienes que poner `DATABASE_URL`, `CORS_ORIGIN` ni `NEXT_PUBLIC_API_URL`: la
> app las calcula sola a partir de los dominios y la base de datos. Es justo lo
> que evita el error más típico (que la web "no encuentre" a la API).

---

## 7. Despliega

Pulsa **Deploy**. Dokploy descargará tu código, construirá las 3 piezas y las
arrancará. La primera vez tarda unos minutos (tiene que construir todo).

Cuando termine, abre en el navegador:

- `https://app.tudominio.com` → deberías ver el CRM funcionando, con su candado
  de HTTPS.

> Si la web carga pero los datos no aparecen, espera 1–2 minutos: la base de
> datos tarda un poco en estar lista en el primer arranque. Recarga la página.

---

## 8. Configura el agente DENTRO de la app (IA + WhatsApp)

Esto **no se toca en Dokploy ni en archivos** — se hace en la propia web, y no
hace falta volver a desplegar. En `https://app.tudominio.com`:

1. Ve a **Agentes**. Usa el agente de ejemplo o pulsa **"Nuevo agente"**.
2. Abre el agente → pestaña **Configuración**:
   - **Modelo de IA:** pega tu clave de **OpenRouter** (la consigues en
     openrouter.ai/keys) y elige un modelo del desplegable.
   - **Conexión de WhatsApp (YCloud):** pega tu **clave de API de YCloud** y tu
     **número de WhatsApp**. La app te muestra una **URL de webhook** propia de
     ese agente, con un botón de **Copiar**.
3. En **YCloud → Developers → Webhooks**, crea un webhook y pega esa URL (será
   algo como `https://api.tudominio.com/api/webhooks/ycloud/tu-agente-xxxx`).
4. Copia el **webhook secret** que te dé YCloud, pégalo en el campo
   *"Webhook secret de YCloud"* del agente y pulsa **Guardar configuración**.

Ahora los mensajes que lleguen a ese WhatsApp los responderá el agente, y los
verás en tiempo real en la sección **Conversaciones** del CRM. Puedes repetir el
proceso para crear **varios agentes**, cada uno con su número y su modelo.

> Antes de conectar WhatsApp, prueba el agente en la pestaña **Playground** (solo
> necesita la clave de OpenRouter). Así validas que responde bien.

---

## 9. Activa el "push → deploy" automático

En la configuración del servicio en Dokploy, activa **Auto Deploy** (despliegue
automático). A partir de ese momento:

> Cada vez que subas un cambio a la rama `main` de tu repositorio de GitHub,
> Dokploy lo detecta, reconstruye y lo pone en producción **solo**. No tienes
> que volver a tocar Dokploy.

---

## 10. Cómo actualizar la app a partir de ahora

1. Abre el proyecto con **Claude Code** y pídele los cambios que quieras
   (cambiar textos, colores, añadir servicios, adaptarlo a tu negocio…).
2. Sube los cambios a GitHub (Claude Code puede hacerlo por ti).
3. Espera 1–2 minutos: Dokploy lo despliega automáticamente.

Eso es todo. No hay más pasos manuales.

---

## 11. Personalizar el negocio SIN tocar código

Mucho de lo que define "el negocio" se cambia **desde la propia app**, sin
desplegar nada: ve a **Agentes → (tu agente) → Configuración** y edita el
nombre del negocio, la descripción, los servicios, el horario, el tono y la zona
horaria. Se guarda al instante.

---

## 12. Problemas frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| La web no carga / no sale el HTTPS | El DNS aún no apunta al VPS, o no ha propagado | Comprueba los registros `A` del paso 4 y espera unos minutos. Luego **Redeploy**. |
| La web carga pero "no hay datos" / errores de red | Los dominios en las variables no coinciden con los del DNS | Revisa que `WEB_DOMAIN` y `API_DOMAIN` sean exactamente los del paso 4 (sin `https://`). |
| El HTTPS no se emite tras varios minutos | El proxy no cogió las etiquetas automáticas | En Dokploy, pestaña **Domains** del servicio: añade `app.tudominio.com` (puerto `3000`) y `api.tudominio.com` (puerto `3001`), activando HTTPS en ambos. |
| El agente no responde en WhatsApp | Falta/está mal la clave de YCloud, el número, o la URL del webhook en YCloud | Revísalo en la app (Agentes → tu agente → Configuración, paso 8). Mira los **Logs** del servicio `api` en Dokploy. |
| El agente contesta "no estoy configurado correctamente" | Falta o es inválida la clave de OpenRouter, o el modelo elegido | En la app, revisa la **clave de OpenRouter** y el **modelo** del agente. Pruébalo en el **Playground**. |

Para ver qué está pasando por dentro, en Dokploy tienes la pestaña **Logs** de
cada servicio (`web`, `api`, `db`).

---

## 13. Copias de seguridad (IMPRESCINDIBLE para un negocio real)

La base de datos guarda **todo** (contactos, citas, conversaciones, usuarios). Si
el servidor falla y no tienes copia, esos datos se pierden para siempre. Para un
negocio real esto **no es opcional**. Tienes dos formas:

### Opción A — Backups automáticos de Dokploy (recomendada)

En el servicio de base de datos, Dokploy ofrece una sección **Backups** donde
programas copias periódicas a un destino **S3** (por ejemplo un bucket de
Backblaze B2, AWS S3 o similar, muy baratos). Indica el destino y una frecuencia
(p. ej. diaria) y listo. **Prueba a restaurar una copia al menos una vez** para
asegurarte de que funciona.

### Opción B — Copia manual con `pg_dump` (desde la consola del VPS)

Crear una copia (genera un archivo `.dump` con fecha):

```bash
docker exec $(docker ps -qf name=db) pg_dump -U crm -Fc crm_academy > backup_$(date +%F).dump
```

Restaurar una copia (⚠️ **sobrescribe** los datos actuales — úsalo solo para
recuperar):

```bash
# Copia el archivo .dump al contenedor y restáuralo
docker cp backup_2026-01-15.dump $(docker ps -qf name=db):/tmp/restore.dump
docker exec $(docker ps -qf name=db) pg_restore -U crm -d crm_academy --clean --if-exists /tmp/restore.dump
```

> Sustituye `crm` y `crm_academy` si cambiaste `POSTGRES_USER` / `POSTGRES_DB`.
> Para automatizarlo, programa el comando de copia con `cron` en el VPS y sube el
> archivo a un almacenamiento externo (que no esté en el mismo servidor).

> **Sobre el esquema de la base de datos:** a partir de esta versión, la app usa
> **migraciones** (no recrea el esquema en cada arranque). Esto significa que
> evolucionar el modelo de datos ya **no puede borrar datos** por accidente: los
> cambios de esquema se aplican de forma controlada al desplegar. Aun así, ten
> copias: una copia de seguridad es la única red de seguridad real.
