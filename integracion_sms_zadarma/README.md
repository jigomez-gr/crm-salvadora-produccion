# Integración SMS Zadarma para CRM Salvadora

Este paquete contiene todo lo necesario para incorporar el envío de SMS post-llamada/post-reserva en el sistema CRM Salvadora (`d:\tmp\antigraviti\crm_salvadora`).

## Estructura de Carpetas

```
integracion_sms_zadarma_crm/
├── csharp/                      # Programa C# adaptado (CLI + Microservicio HTTP)
│   ├── Program.cs
│   └── ZadarmaSms.csproj
├── nest_backend/                # Módulo nativo NestJS listo para CRM backend
│   ├── zadarma-sms-log.entity.ts
│   ├── zadarma-sms.service.ts
│   ├── zadarma-sms.controller.ts
│   ├── zadarma-sms.module.ts
│   └── vapi-hook-integration.snippet.ts
├── sql/                         # Scripts DDL para PostgreSQL
│   ├── 01_create_zadarmasmsrespuesta.sql
│   └── 02_alter_settings_and_vapi_accounts.sql
├── tests/                       # Scripts de prueba curl y PowerShell
│   ├── test_sms.curl.sh
│   └── test_sms.ps1
└── README.md
```

## 1. Módulo C# Adaptado

El programa C# original fue optimizado eliminando la dependencia de la tabla obsoleta `accionescomplementarias`, implementando el algoritmo criptográfico exacto de Zadarma (MD5 + HMAC-SHA1 Base64) y admitiendo dos modos de operación:
1. **Modo CLI:**
   ```bash
   dotnet run -- 34611223344 "Tu reserva ha sido confirmada"
   ```
2. **Modo Servidor HTTP / Microservicio (puerto 5005):**
   ```bash
   dotnet run
   # Escuchará en http://0.0.0.0:5005/api/sms/send
   ```

## 2. Integración Nativa en NestJS (Recomendada para CRM)

Copiar los archivos de `nest_backend/` en `d:\tmp\antigraviti\crm_salvadora\backend\src\sms\`:
1. `ZadarmaSmsModule` se añade a los imports de `AppModule` o `VapiModule`.
2. Proporciona el servicio `ZadarmaSmsService` con el método `sendSms({ number, message, contactId, callId })`.
3. Registra logs detallados en la tabla `zadarma_sms_respuesta`.
4. Expone endpoints `/api/sms/send`, `/api/sms/logs` y `/api/sms/config`.

## 3. Base de Datos (PostgreSQL)

Ejecutar los scripts contenidos en `sql/`:
- `01_create_zadarmasmsrespuesta.sql`: Crea la tabla de auditoría y respuestas de Zadarma.
- `02_alter_settings_and_vapi_accounts.sql`: Añade las columnas `zadarmaApiKey`, `zadarmaApiSecret`, `zadarmaSenderId`, `zadarmaSmsEnabled` para permitir parametrizar las credenciales desde la base de datos o el panel de configuración del CRM.
