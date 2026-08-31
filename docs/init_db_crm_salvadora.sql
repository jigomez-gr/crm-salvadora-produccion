-- =============================================================================
-- CRM SALVADORA CONESA - ESQUEMA COMPLETO Y DATOS INICIALES
-- Ejecutar en pgAdmin conectado a la base de datos "crm_salvadora"
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Usuarios del sistema
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    "passwordHash" VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Configuración de Marca y App
CREATE TABLE IF NOT EXISTS app_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'global',
    "businessName" VARCHAR(255) NOT NULL DEFAULT 'Centro de Yoga Salvadora Conesa',
    "brandColor" VARCHAR(50) NOT NULL DEFAULT '#10b981',
    "logoUrl" TEXT,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. Configuración de Agentes de IA
CREATE TABLE IF NOT EXISTS agent_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "agentKey" VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "systemPrompt" TEXT,
    "customInstructions" TEXT,
    "openRouterApiKey" TEXT,
    "agentModel" VARCHAR(255) DEFAULT 'openai/gpt-4o-mini',
    "ycloudApiKey" TEXT,
    "ycloudWebhookSecret" TEXT,
    "ycloudWhatsappNumber" VARCHAR(50),
    "sendConfirmationOnBooking" BOOLEAN NOT NULL DEFAULT true,
    "sendReminder24h" BOOLEAN NOT NULL DEFAULT true,
    "sendReminder2h" BOOLEAN NOT NULL DEFAULT true,
    "sendFollowupAfterAppointment" BOOLEAN NOT NULL DEFAULT false,
    "reminderTemplateName24h" VARCHAR(100),
    "reminderTemplateName2h" VARCHAR(100),
    "followupTemplateName" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. Servicios de Yoga y Actividades
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 90,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxCapacity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. Contactos / Alumnos / Clientes
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255),
    notes TEXT,
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    "pipelineStage" VARCHAR(50) NOT NULL DEFAULT 'lead',
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 6. Citas y Reservas
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "contactId" UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    "serviceName" VARCHAR(255) NOT NULL,
    "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED',
    "agentKey" VARCHAR(100) NOT NULL DEFAULT 'booking',
    "cancellationReason" TEXT,
    notes TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 7. Recordatorios de Citas
CREATE TABLE IF NOT EXISTS appointment_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "appointmentId" UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    "sentAt" TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 8. Conversaciones
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "contactId" UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    "agentKey" VARCHAR(100) NOT NULL DEFAULT 'booking',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP WITH TIME ZONE,
    "lastMessageText" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 9. Mensajes de WhatsApp / Chat
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "conversationId" UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender VARCHAR(50) NOT NULL,
    text TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" VARCHAR(50),
    "deliveryStatus" VARCHAR(50) DEFAULT 'SENT',
    "whatsappMessageId" VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 10. Documentos de Conocimiento IA
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "agentKey" VARCHAR(100) NOT NULL DEFAULT 'booking',
    filename VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    title VARCHAR(255),
    description TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 11. Fragmentos de Conocimiento IA
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "documentId" UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    "agentKey" VARCHAR(100) NOT NULL DEFAULT 'booking',
    "chunkIndex" INTEGER NOT NULL,
    content TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    tsv TSVECTOR,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv ON knowledge_chunks USING GIN(tsv);

-- 12. Auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "actorEmail" VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(100),
    summary TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 13. Cuentas de Correo SMTP
CREATE TABLE IF NOT EXISTS email_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    "smtpHost" VARCHAR(255) NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" VARCHAR(255) NOT NULL,
    "smtpPass" TEXT NOT NULL,
    "isSecure" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 14. Mensajes de Correo Electrónico
CREATE TABLE IF NOT EXISTS email_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "contactId" UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    "accountId" UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
    "toEmail" VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 15. Cuentas de Pago Stripe
CREATE TABLE IF NOT EXISTS payment_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "stripePublishableKey" TEXT,
    "stripeSecretKey" TEXT,
    "stripeWebhookSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INSERCIÓN DE DATOS INICIALES REALES
-- =============================================================================

-- Administrador principal (Admin1234!)
INSERT INTO users (email, "passwordHash", role, "isActive", "mustChangePassword")
VALUES ('admin@crmsalvadora.local', '$2b$10$xt6Hzutz1iMxcWLlPQaD8OWv0FWIk5fx9I26oEbRX6/Lud0wte..e', 'admin', true, false)
ON CONFLICT (email) DO NOTHING;

-- Configuración de Marca
INSERT INTO app_settings (id, "businessName", "brandColor", "onboardingCompleted")
VALUES ('global', 'Centro de Yoga Salvadora Conesa', '#10b981', true)
ON CONFLICT (id) DO UPDATE SET "businessName" = EXCLUDED."businessName", "brandColor" = EXCLUDED."brandColor";

-- Agente de IA Principal (Booking)
INSERT INTO agent_configs ("agentKey", name, description, "agentModel", "systemPrompt", "customInstructions", "isActive")
VALUES (
    'booking',
    'Asistente de Reservas Salvadora Conesa',
    'Agente de IA para reservas de clases regulares de Yoga, eventos y talleres en Fuenlabrada.',
    'openai/gpt-4o-mini',
    'Eres el asistente virtual del Centro de Yoga Salvadora Conesa en Fuenlabrada, Madrid. Informas sobre las clases de Hatha Yoga Terapéutico, talleres de fin de semana, formación de profesores y eventos. Respondes con calidez, cercanía y claridad.',
    'Aforos: Las clases regulares de Hatha Yoga Terapéutico tienen un aforo de 20 personas (con margen hasta 28 para recuperaciones). Formas de pago: todos los pagos se realizan presencialmente en el centro (pronto disponibles también online con Stripe y Giglon).',
    true
)
ON CONFLICT ("agentKey") DO UPDATE SET name = EXCLUDED.name, "systemPrompt" = EXCLUDED."systemPrompt";

-- Servicios y Clases Oficiales
INSERT INTO services (name, description, "durationMinutes", price, currency, "maxCapacity", "isActive") VALUES
('Hatha Yoga Terapéutico - 1 clase semanal', 'Horarios: Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15), Jueves (9:45, 11:15, 16:30, 17:30, 19:00). 1 clase/semana (4 clases/mes). Aforo máximo 20 personas. Pago en el centro.', 90, 25.00, 'EUR', 20, true),
('Hatha Yoga Terapéutico - 2 clases semanales', 'Horarios: Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15), Jueves (9:45, 11:15, 16:30, 17:30, 19:00). 2 clases/semana (8 clases/mes). Aforo máximo 20 personas. Pago en el centro.', 90, 45.00, 'EUR', 20, true),
('Hatha Yoga Terapéutico - 3 clases semanales', 'Horarios: Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15), Jueves (9:45, 11:15, 16:30, 17:30, 19:00). 3 clases/semana. Aforo máximo 20 personas. Pago en el centro.', 90, 60.00, 'EUR', 20, true),
('Hatha Yoga Terapéutico - Clase Suelta', 'Asistencia puntual a una clase de Hatha Yoga Terapéutico de 90 minutos. Pago en el centro.', 90, 10.00, 'EUR', 20, true),
('Iaidō (Esgrima Japonesa)', 'Arte marcial tradicional japonés de desenvaine de katana. Concentración y precisión. Pago en el centro.', 90, 40.00, 'EUR', 15, true),
('Bienestar Experience (Longevidad & Bienestar)', 'Programa integral para vitalidad, salud articular y longevidad activa. Pago en el centro.', 90, 45.00, 'EUR', 20, true),
('Taller de Canto del Alma y Apertura del Corazón (19 Abr)', 'Taller transformacional: Domingo 19 de Abril de 2026 de 10:00 a 14:00. Liberación de la voz y canto meditativo.', 240, 35.00, 'EUR', 25, true),
('Taller de Pranayama y Meditación (23 May)', 'Sábado 23 de Mayo de 2026 de 10:00 a 13:30. Técnicas de respiración y quietud mental.', 210, 30.00, 'EUR', 20, true),
('Taller Intensivo de Ajustes Posturales (14 Jun)', 'Domingo 14 de Junio de 2026 de 10:00 a 14:00. Corrección postural y biomecánica.', 240, 40.00, 'EUR', 18, true),
('Masterclass de Yoga Restaurativo y Relajación Sonora', 'Sesión profunda con cuencos tibetanos y asanas restaurativas de 2 horas. Pago en el centro.', 120, 25.00, 'EUR', 20, true);

-- Claves de Stripe
INSERT INTO payment_accounts ("stripePublishableKey", "stripeSecretKey", "stripeWebhookSecret", "isActive")
VALUES (
    'pk_test_placeholder',
    'sk_test_placeholder',
    'whsec_placeholder',
    true
);
