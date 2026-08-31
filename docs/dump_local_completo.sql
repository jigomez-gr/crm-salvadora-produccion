-- =============================================================================
-- CRM SALVADORA - COPIA COMPLETA DE TODA LA BASE DE DATOS LOCAL CON PRIMARY KEYS
-- =============================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

CREATE TYPE "appointment_reminders_status_enum" AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE "appointments_paymentstatus_enum" AS ENUM ('unpaid', 'pending', 'paid', 'refunded', 'exempt');
CREATE TYPE "appointments_status_enum" AS ENUM ('pending_approval', 'scheduled', 'cancelled', 'completed');
CREATE TYPE "calls_direction_enum" AS ENUM ('inbound', 'outbound');
CREATE TYPE "calls_status_enum" AS ENUM ('queued', 'ringing', 'in-progress', 'ended', 'failed');
CREATE TYPE "contacts_status_enum" AS ENUM ('lead', 'active', 'inactive');
CREATE TYPE "messages_channel_enum" AS ENUM ('whatsapp', 'playground', 'widget');
CREATE TYPE "messages_direction_enum" AS ENUM ('inbound', 'outbound');
CREATE TYPE "messages_mediatype_enum" AS ENUM ('image', 'audio', 'video', 'document', 'sticker');
CREATE TYPE "messages_status_enum" AS ENUM ('received', 'queued', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE "users_role_enum" AS ENUM ('admin', 'service_manager', 'employee');

CREATE TABLE "agent_configs" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "agentKey" VARCHAR NOT NULL,
    "businessName" VARCHAR NOT NULL,
    "businessDescription" TEXT NOT NULL,
    "customInstructions" TEXT,
    "channel" VARCHAR DEFAULT 'whatsapp'::character varying NOT NULL,
    "services" JSONB DEFAULT '[]'::jsonb NOT NULL,
    "workingHours" JSONB DEFAULT '[]'::jsonb NOT NULL,
    "tone" VARCHAR DEFAULT 'professional'::character varying NOT NULL,
    "timezone" VARCHAR DEFAULT 'Europe/Madrid'::character varying NOT NULL,
    "model" VARCHAR DEFAULT 'openai/gpt-4o-mini'::character varying NOT NULL,
    "openrouterApiKey" VARCHAR,
    "whatsappNumber" VARCHAR,
    "ycloudApiKey" VARCHAR,
    "ycloudWebhookSecret" VARCHAR,
    "enabled" BOOLEAN DEFAULT true NOT NULL,
    "remindersEnabled" BOOLEAN DEFAULT false NOT NULL,
    "reminderTemplateName" VARCHAR,
    "reminderTemplateLanguage" VARCHAR DEFAULT 'es'::character varying NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_25aa11529ad4eedde0691d59192" PRIMARY KEY (id),
    CONSTRAINT "UQ_fe5ccd63f8f02f608140d37f955" UNIQUE ("agentKey")
);

CREATE TABLE "app_settings" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "businessName" VARCHAR DEFAULT 'CRM Salvadora'::character varying NOT NULL,
    "brandColor" VARCHAR DEFAULT '#4f46e5'::character varying NOT NULL,
    "logoUrl" TEXT,
    "onboardingCompleted" BOOLEAN DEFAULT false NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_4800b266ba790931744b3e53a74" PRIMARY KEY (id)
);

CREATE TABLE "appointment_reminders" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "appointmentId" UUID NOT NULL,
    "offsetLabel" VARCHAR NOT NULL,
    "status" "appointment_reminders_status_enum" DEFAULT 'pending'::appointment_reminders_status_enum NOT NULL,
    "providerMessageId" VARCHAR,
    "sentAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_a6128daa14ae7146de0a1ec4119" PRIMARY KEY (id),
    CONSTRAINT "UQ_a2a304e63cdbacfacf60091a70c" UNIQUE ("appointmentId", "offsetLabel")
);

CREATE TABLE "appointments" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "contactId" UUID NOT NULL,
    "service" VARCHAR NOT NULL,
    "serviceId" VARCHAR,
    "calendarId" VARCHAR DEFAULT 'default'::character varying NOT NULL,
    "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "status" "appointments_status_enum" DEFAULT 'scheduled'::appointments_status_enum NOT NULL,
    "agentKey" VARCHAR,
    "modality" VARCHAR DEFAULT 'in_person'::character varying NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "responseDocument" JSONB,
    "doctorReportPdf" BYTEA,
    "doctorReportPdfName" VARCHAR,
    "doctorReportPdfMime" VARCHAR DEFAULT 'application/pdf'::character varying,
    "doctorReportPdfSize" INTEGER,
    "patientAttachmentData" BYTEA,
    "patientAttachmentName" VARCHAR,
    "patientAttachmentMime" VARCHAR,
    "patientAttachmentSize" INTEGER,
    "patientAttachmentUploadedAt" TIMESTAMP WITH TIME ZONE,
    "aiAnalysisType" VARCHAR,
    "aiAnalysisResult" TEXT,
    "aiAnalysisDate" TIMESTAMP WITH TIME ZONE,
    "aiCroppedImageData" BYTEA,
    "aiCroppedImageMime" VARCHAR,
    "calBookingId" VARCHAR,
    "calBookingUid" VARCHAR,
    "calMeetingUrl" TEXT,
    "calStatus" VARCHAR,
    "price" NUMERIC,
    "paymentStatus" "appointments_paymentstatus_enum" DEFAULT 'unpaid'::appointments_paymentstatus_enum NOT NULL,
    "stripeSessionId" VARCHAR,
    "stripePaymentIntentId" VARCHAR,
    "paymentUrl" TEXT,
    "paidAt" TIMESTAMP WITH TIME ZONE,
    "acceptedAt" TIMESTAMP WITH TIME ZONE,
    "acceptedBy" VARCHAR,
    "cancelledAt" TIMESTAMP WITH TIME ZONE,
    "cancelledBy" VARCHAR,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY (id)
);

CREATE TABLE "audit_logs" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "actorId" UUID,
    "actorEmail" VARCHAR,
    "action" VARCHAR NOT NULL,
    "targetType" VARCHAR,
    "targetId" VARCHAR,
    "summary" TEXT NOT NULL,
    "ip" VARCHAR,
    "metadata" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY (id)
);

CREATE TABLE "calcom_account" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "apiKey" VARCHAR,
    "baseUrl" VARCHAR DEFAULT 'https://api.cal.com/v1'::character varying NOT NULL,
    "enabled" BOOLEAN DEFAULT true NOT NULL,
    "defaultEventTypeId" VARCHAR,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_09011dfaccd338612113b73c092" PRIMARY KEY (id)
);

CREATE TABLE "calls" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "vapiCallId" VARCHAR NOT NULL,
    "direction" "calls_direction_enum" DEFAULT 'inbound'::calls_direction_enum NOT NULL,
    "fromNumber" VARCHAR,
    "toNumber" VARCHAR,
    "status" "calls_status_enum" DEFAULT 'in-progress'::calls_status_enum NOT NULL,
    "startedAt" TIMESTAMP WITH TIME ZONE,
    "endedAt" TIMESTAMP WITH TIME ZONE,
    "durationSeconds" INTEGER,
    "endedReason" VARCHAR,
    "summary" TEXT,
    "transcript" TEXT,
    "messages" JSONB,
    "recordingUrl" TEXT,
    "costCents" INTEGER,
    "needsReview" BOOLEAN DEFAULT false NOT NULL,
    "notes" TEXT,
    "contactId" UUID,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_d9171d91f8dd1a649659f1b6a20" PRIMARY KEY (id)
);

CREATE TABLE "contacts" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "name" VARCHAR NOT NULL,
    "phone" VARCHAR NOT NULL,
    "email" VARCHAR,
    "notes" TEXT,
    "status" "contacts_status_enum" DEFAULT 'lead'::contacts_status_enum NOT NULL,
    "pipelineStage" VARCHAR DEFAULT 'new'::character varying NOT NULL,
    "boardPosition" DOUBLE PRECISION DEFAULT '0'::double precision NOT NULL,
    "tags" TEXT[] DEFAULT '{}'::text[] NOT NULL,
    "source" VARCHAR,
    "customFields" JSONB,
    "optedOut" BOOLEAN DEFAULT false NOT NULL,
    "optedOutAt" TIMESTAMP WITH TIME ZONE,
    "anonymizedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_b99cd40cfd66a99f1571f4f72e6" PRIMARY KEY (id),
    CONSTRAINT "UQ_84cae51c485079bdd8cdf1d828f" UNIQUE (phone)
);

CREATE TABLE "conversations" (
    "threadId" VARCHAR NOT NULL,
    "agentKey" VARCHAR NOT NULL,
    "contactId" UUID,
    "channel" VARCHAR NOT NULL,
    "handoff" BOOLEAN DEFAULT false NOT NULL,
    "unreadCount" INTEGER DEFAULT 0 NOT NULL,
    "lastMessageAt" TIMESTAMP WITH TIME ZONE,
    "lastInboundAt" TIMESTAMP WITH TIME ZONE,
    "lastMessageBody" TEXT,
    "lastMessageDirection" VARCHAR,
    "messageCount" INTEGER DEFAULT 0 NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_d88b0481628ea95674b333780f7" PRIMARY KEY ("threadId")
);

CREATE TABLE "email_account" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "fromName" VARCHAR,
    "fromAddress" VARCHAR,
    "smtpHost" VARCHAR,
    "smtpPort" INTEGER DEFAULT 587 NOT NULL,
    "smtpSecure" BOOLEAN DEFAULT false NOT NULL,
    "smtpUser" VARCHAR,
    "smtpPassword" VARCHAR,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_21a4813c9e9dd0de067dc542c57" PRIMARY KEY (id)
);

CREATE TABLE "email_messages" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "contactId" UUID NOT NULL,
    "toAddress" VARCHAR NOT NULL,
    "subject" VARCHAR NOT NULL,
    "body" TEXT NOT NULL,
    "status" VARCHAR DEFAULT 'sent'::character varying NOT NULL,
    "error" TEXT,
    "sentByEmail" VARCHAR,
    "providerMessageId" VARCHAR,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_922cad79d5a315f5d1d06b077da" PRIMARY KEY (id)
);

CREATE TABLE "knowledge_chunks" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "documentId" UUID NOT NULL,
    "agentKey" VARCHAR NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "searchVector" TSVECTOR,
    CONSTRAINT "PK_81af684d79d321813c41019a5cd" PRIMARY KEY (id)
);

CREATE TABLE "knowledge_documents" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "agentKey" VARCHAR NOT NULL,
    "filename" VARCHAR NOT NULL,
    "mimeType" VARCHAR NOT NULL,
    "fileExtension" VARCHAR NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "charCount" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_402a3c43fb263aa5289670e4e21" PRIMARY KEY (id)
);

CREATE TABLE "mastra_agent_versions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,
    "model" JSONB NOT NULL,
    "tools" JSONB,
    "defaultOptions" JSONB,
    "workflows" JSONB,
    "agents" JSONB,
    "integrationTools" JSONB,
    "toolProviders" JSONB,
    "inputProcessors" JSONB,
    "outputProcessors" JSONB,
    "memory" JSONB,
    "scorers" JSONB,
    "mcpClients" JSONB,
    "requestContextSchema" JSONB,
    "workspace" JSONB,
    "skills" JSONB,
    "skillsFormat" TEXT,
    "browser" JSONB,
    "changedFields" JSONB,
    "changeMessage" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_agent_versions_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_agents" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "authorId" TEXT,
    "visibility" TEXT,
    "metadata" JSONB,
    "favoriteCount" INTEGER,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_agents_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_ai_spans" (
    "traceId" TEXT NOT NULL,
    "spanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spanType" TEXT NOT NULL,
    "isEvent" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "parentSpanId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "entityName" TEXT,
    "parentEntityType" TEXT,
    "parentEntityId" TEXT,
    "parentEntityName" TEXT,
    "rootEntityType" TEXT,
    "rootEntityId" TEXT,
    "rootEntityName" TEXT,
    "userId" TEXT,
    "organizationId" TEXT,
    "resourceId" TEXT,
    "runId" TEXT,
    "sessionId" TEXT,
    "threadId" TEXT,
    "requestId" TEXT,
    "environment" TEXT,
    "serviceName" TEXT,
    "scope" JSONB,
    "entityVersionId" TEXT,
    "parentEntityVersionId" TEXT,
    "rootEntityVersionId" TEXT,
    "experimentId" TEXT,
    "source" TEXT,
    "metadata" JSONB,
    "tags" JSONB,
    "attributes" JSONB,
    "links" JSONB,
    "input" JSONB,
    "output" JSONB,
    "error" JSONB,
    "endedAt" TIMESTAMP WITHOUT TIME ZONE,
    "requestContext" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE,
    "startedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "endedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "public_mastra_ai_spans_traceid_spanid_pk" PRIMARY KEY ("traceId", "spanId")
);

CREATE TABLE "mastra_background_tasks" (
    "id" TEXT NOT NULL,
    "tool_call_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "resource_id" TEXT,
    "status" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "result" JSONB,
    "error" JSONB,
    "suspend_payload" JSONB,
    "retry_count" INTEGER NOT NULL,
    "max_retries" INTEGER NOT NULL,
    "timeout_ms" INTEGER NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "startedAt" TIMESTAMP WITHOUT TIME ZONE,
    "suspendedAt" TIMESTAMP WITHOUT TIME ZONE,
    "completedAt" TIMESTAMP WITHOUT TIME ZONE,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "startedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "suspendedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "completedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_background_tasks_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_channel_config" (
    "platform" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_channel_config_pkey" PRIMARY KEY (platform)
);

CREATE TABLE "mastra_channel_installations" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "webhookId" TEXT,
    "data" JSONB NOT NULL,
    "configHash" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_channel_installations_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_dataset_items" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "datasetVersion" INTEGER NOT NULL,
    "validTo" INTEGER,
    "isDeleted" BOOLEAN NOT NULL,
    "input" JSONB NOT NULL,
    "groundTruth" JSONB,
    "requestContext" JSONB,
    "metadata" JSONB,
    "source" JSONB,
    "expectedTrajectory" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_dataset_items_pkey" PRIMARY KEY (id, "datasetVersion")
);

CREATE TABLE "mastra_dataset_versions" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_dataset_versions_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "inputSchema" JSONB,
    "groundTruthSchema" JSONB,
    "requestContextSchema" JSONB,
    "tags" JSONB,
    "targetType" TEXT,
    "targetIds" JSONB,
    "scorerIds" JSONB,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_datasets_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_experiment_results" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemDatasetVersion" INTEGER,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "groundTruth" JSONB,
    "error" JSONB,
    "startedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "completedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "retryCount" INTEGER NOT NULL,
    "traceId" TEXT,
    "status" TEXT,
    "tags" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "startedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "completedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_experiment_results_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "datasetId" TEXT,
    "datasetVersion" INTEGER,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "succeededCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "startedAt" TIMESTAMP WITHOUT TIME ZONE,
    "completedAt" TIMESTAMP WITHOUT TIME ZONE,
    "agentVersion" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "startedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "completedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_experiments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_favorites" (
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_favorites_pkey" PRIMARY KEY ("userId", "entityType", "entityId")
);

CREATE TABLE "mastra_mcp_client_versions" (
    "id" TEXT NOT NULL,
    "mcpClientId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "servers" JSONB NOT NULL,
    "changedFields" JSONB,
    "changeMessage" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_mcp_client_versions_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_mcp_clients" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "authorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_mcp_clients_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_mcp_server_versions" (
    "id" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "repository" JSONB,
    "releaseDate" TEXT,
    "isLatest" BOOLEAN,
    "packageCanonical" TEXT,
    "tools" JSONB,
    "agents" JSONB,
    "workflows" JSONB,
    "changedFields" JSONB,
    "changeMessage" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_mcp_server_versions_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_mcp_servers" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "authorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_mcp_servers_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "resourceId" TEXT,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_messages_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_notifications" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "resourceId" TEXT,
    "agentId" TEXT,
    "sourceId" TEXT,
    "dedupeKey" TEXT,
    "coalesceKey" TEXT,
    "coalescedCount" INTEGER NOT NULL,
    "attributes" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "deliveredAt" TIMESTAMP WITHOUT TIME ZONE,
    "seenAt" TIMESTAMP WITHOUT TIME ZONE,
    "dismissedAt" TIMESTAMP WITHOUT TIME ZONE,
    "archivedAt" TIMESTAMP WITHOUT TIME ZONE,
    "discardedAt" TIMESTAMP WITHOUT TIME ZONE,
    "deliverAt" TIMESTAMP WITHOUT TIME ZONE,
    "summaryAt" TIMESTAMP WITHOUT TIME ZONE,
    "deliveryReason" TEXT,
    "deliveryAttempts" INTEGER NOT NULL,
    "lastDeliveryAttemptAt" TIMESTAMP WITHOUT TIME ZONE,
    "lastDeliveryError" TEXT,
    "deliveredSignalId" TEXT,
    "summarySignalId" TEXT,
    "metadata" JSONB,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "deliveredAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "seenAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "dismissedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "archivedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "discardedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "deliverAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "summaryAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "lastDeliveryAttemptAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE "mastra_observational_memory" (
    "id" TEXT NOT NULL,
    "lookupKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resourceId" TEXT,
    "threadId" TEXT,
    "activeObservations" TEXT NOT NULL,
    "activeObservationsPendingUpdate" TEXT,
    "originType" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "generationCount" INTEGER NOT NULL,
    "lastObservedAt" TIMESTAMP WITHOUT TIME ZONE,
    "lastReflectionAt" TIMESTAMP WITHOUT TIME ZONE,
    "pendingMessageTokens" INTEGER NOT NULL,
    "totalTokensObserved" INTEGER NOT NULL,
    "observationTokenCount" INTEGER NOT NULL,
    "isObserving" BOOLEAN NOT NULL,
    "isReflecting" BOOLEAN NOT NULL,
    "observedMessageIds" JSONB,
    "observedTimezone" TEXT,
    "bufferedObservations" TEXT,
    "bufferedObservationTokens" INTEGER,
    "bufferedMessageIds" JSONB,
    "bufferedReflection" TEXT,
    "bufferedReflectionTokens" INTEGER,
    "bufferedReflectionInputTokens" INTEGER,
    "reflectedObservationLineCount" INTEGER,
    "bufferedObservationChunks" JSONB,
    "isBufferingObservation" BOOLEAN NOT NULL,
    "isBufferingReflection" BOOLEAN NOT NULL,
    "lastBufferedAtTokens" INTEGER NOT NULL,
    "lastBufferedAtTime" TIMESTAMP WITHOUT TIME ZONE,
    "metadata" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "lastObservedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "lastReflectionAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "lastBufferedAtTimeZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_observational_memory_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_prompt_block_versions" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "rules" JSONB,
    "requestContextSchema" JSONB,
    "changedFields" JSONB,
    "changeMessage" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_prompt_block_versions_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_prompt_blocks" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "authorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_prompt_blocks_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_resources" (
    "id" TEXT NOT NULL,
    "workingMemory" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_resources_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_schedule_triggers" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "run_id" TEXT,
    "scheduled_fire_at" BIGINT NOT NULL,
    "actual_fire_at" BIGINT NOT NULL,
    "outcome" TEXT NOT NULL,
    "error" TEXT,
    "trigger_kind" TEXT NOT NULL,
    "parent_trigger_id" TEXT,
    "metadata" JSONB,
    CONSTRAINT "mastra_schedule_triggers_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_schedules" (
    "id" TEXT NOT NULL,
    "target" JSONB NOT NULL,
    "cron" TEXT NOT NULL,
    "timezone" TEXT,
    "status" TEXT NOT NULL,
    "next_fire_at" BIGINT NOT NULL,
    "last_fire_at" BIGINT,
    "last_run_id" TEXT,
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL,
    "metadata" JSONB,
    "owner_type" TEXT,
    "owner_id" TEXT,
    CONSTRAINT "mastra_schedules_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_scorer_definition_versions" (
    "id" TEXT NOT NULL,
    "scorerDefinitionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "model" JSONB,
    "instructions" TEXT,
    "scoreRange" JSONB,
    "presetConfig" JSONB,
    "defaultSampling" JSONB,
    "changedFields" JSONB,
    "changeMessage" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_scorer_definition_versions_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_scorer_definitions" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "authorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_scorer_definitions_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_scorers" (
    "id" TEXT NOT NULL,
    "scorerId" TEXT NOT NULL,
    "traceId" TEXT,
    "spanId" TEXT,
    "runId" TEXT NOT NULL,
    "scorer" JSONB NOT NULL,
    "preprocessStepResult" JSONB,
    "extractStepResult" JSONB,
    "analyzeStepResult" JSONB,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "preprocessPrompt" TEXT,
    "extractPrompt" TEXT,
    "generateScorePrompt" TEXT,
    "generateReasonPrompt" TEXT,
    "analyzePrompt" TEXT,
    "reasonPrompt" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "additionalContext" JSONB,
    "requestContext" JSONB,
    "entityType" TEXT,
    "entity" JSONB,
    "entityId" TEXT,
    "source" TEXT NOT NULL,
    "resourceId" TEXT,
    "threadId" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_scorers_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_skill_blobs" (
    "hash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_skill_blobs_pkey" PRIMARY KEY (hash)
);

CREATE TABLE "mastra_skill_versions" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "license" TEXT,
    "compatibility" JSONB,
    "source" JSONB,
    "references" JSONB,
    "scripts" JSONB,
    "assets" JSONB,
    "files" JSONB,
    "metadata" JSONB,
    "tree" JSONB,
    "changedFields" JSONB,
    "changeMessage" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_skill_versions_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_skills" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "authorId" TEXT,
    "visibility" TEXT,
    "favoriteCount" INTEGER,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_skills_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_threads" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_threads_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_tool_provider_connections" (
    "authorId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "toolkit" TEXT NOT NULL,
    "label" TEXT,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_tool_provider_connections_pkey" PRIMARY KEY ("authorId", "providerId", "connectionId")
);

CREATE TABLE "mastra_workflow_snapshot" (
    "workflow_name" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "resourceId" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "public_mastra_workflow_snapshot_workflow_name_run_id_key" UNIQUE (workflow_name, run_id)
);

CREATE TABLE "mastra_workspace_versions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filesystem" JSONB,
    "sandbox" JSONB,
    "mounts" JSONB,
    "search" JSONB,
    "skills" JSONB,
    "tools" JSONB,
    "autoSync" BOOLEAN,
    "operationTimeout" INTEGER,
    "changedFields" JSONB,
    "changeMessage" TEXT,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_workspace_versions_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mastra_workspaces" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "authorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "createdAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAtZ" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT "mastra_workspaces_pkey" PRIMARY KEY (id)
);

CREATE TABLE "messages" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "contactId" UUID,
    "threadId" VARCHAR NOT NULL,
    "direction" "messages_direction_enum" NOT NULL,
    "channel" "messages_channel_enum" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "messages_status_enum" DEFAULT 'queued'::messages_status_enum NOT NULL,
    "providerMessageId" VARCHAR,
    "externalId" VARCHAR,
    "mediaType" "messages_mediatype_enum",
    "mediaUrl" TEXT,
    "mediaId" VARCHAR,
    "mediaMimeType" VARCHAR,
    "mediaFilename" VARCHAR,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY (id),
    CONSTRAINT "UQ_1ec186b83e617b0b8afe592a8c6" UNIQUE ("externalId")
);

CREATE TABLE "payment_account" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "publishableKey" VARCHAR,
    "secretKey" VARCHAR,
    "webhookSecret" VARCHAR,
    "currency" VARCHAR DEFAULT 'eur'::character varying NOT NULL,
    "enableCard" BOOLEAN DEFAULT true NOT NULL,
    "enableBizum" BOOLEAN DEFAULT true NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_bb95477ae48c741a9c1445babfd" PRIMARY KEY (id)
);

CREATE TABLE "services" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "name" VARCHAR NOT NULL,
    "description" TEXT,
    "serviceType" VARCHAR DEFAULT 'recurring'::character varying NOT NULL,
    "eventDatesText" TEXT,
    "scheduleText" TEXT,
    "flyerUrl" TEXT,
    "eventStartDate" TIMESTAMP WITH TIME ZONE,
    "eventEndDate" TIMESTAMP WITH TIME ZONE,
    "maxCapacity" INTEGER,
    "minQuorum" INTEGER,
    "quorumDeadline" TIMESTAMP WITH TIME ZONE,
    "durationMinutes" INTEGER DEFAULT 30 NOT NULL,
    "price" NUMERIC,
    "paymentType" VARCHAR DEFAULT 'stripe'::character varying NOT NULL,
    "externalPaymentUrl" TEXT,
    "calendarId" VARCHAR DEFAULT 'default'::character varying NOT NULL,
    "managerId" UUID,
    "requiresApproval" BOOLEAN DEFAULT true NOT NULL,
    "allowedModalities" JSONB DEFAULT '["in_person"]'::jsonb NOT NULL,
    "requiresReason" BOOLEAN DEFAULT false NOT NULL,
    "calEventTypeId" INTEGER,
    "isActive" BOOLEAN DEFAULT true NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_ba2d347a3168a296416c6c5ccb2" PRIMARY KEY (id)
);

CREATE TABLE "users" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "name" VARCHAR NOT NULL,
    "email" VARCHAR NOT NULL,
    "passwordHash" VARCHAR NOT NULL,
    "role" "users_role_enum" DEFAULT 'employee'::users_role_enum NOT NULL,
    "isActive" BOOLEAN DEFAULT true NOT NULL,
    "mustChangePassword" BOOLEAN DEFAULT false NOT NULL,
    "passwordChangedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id),
    CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email)
);

CREATE TABLE "vapi_accounts" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "apiKey" VARCHAR,
    "webhookToken" VARCHAR,
    "assistantId" VARCHAR,
    "phoneNumberId" VARCHAR,
    "phoneNumber" VARCHAR,
    "serverCredentialId" VARCHAR,
    "customWebhookUrl" VARCHAR,
    "handoffNumber" VARCHAR,
    "handoffMessage" VARCHAR,
    "voiceProvider" VARCHAR DEFAULT '11labs'::character varying NOT NULL,
    "voiceId" VARCHAR DEFAULT 'UOIqAnmS11Reiei1Ytkc'::character varying NOT NULL,
    "voiceModel" VARCHAR DEFAULT 'eleven_turbo_v2_5'::character varying NOT NULL,
    "voiceLanguage" VARCHAR DEFAULT 'es'::character varying NOT NULL,
    "transcriberProvider" VARCHAR DEFAULT 'deepgram'::character varying NOT NULL,
    "transcriberModel" VARCHAR DEFAULT 'nova-3-general'::character varying NOT NULL,
    "transcriberLanguage" VARCHAR DEFAULT 'es'::character varying NOT NULL,
    "llmProvider" VARCHAR DEFAULT 'openai'::character varying NOT NULL,
    "llmModel" VARCHAR DEFAULT 'gpt-5.6-luna'::character varying NOT NULL,
    "systemPromptOverride" TEXT,
    "tone" VARCHAR DEFAULT 'professional'::character varying NOT NULL,
    "maxDurationSeconds" INTEGER DEFAULT 900 NOT NULL,
    "isActive" BOOLEAN DEFAULT true NOT NULL,
    "createdAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT "PK_a659b3ac79365dd25696231747f" PRIMARY KEY (id)
);

-- ==========================================
-- Datos: agent_configs (1 registros)
-- ==========================================
INSERT INTO "agent_configs" ("id", "agentKey", "businessName", "businessDescription", "customInstructions", "channel", "services", "workingHours", "tone", "timezone", "model", "openrouterApiKey", "whatsappNumber", "ycloudApiKey", "ycloudWebhookSecret", "enabled", "remindersEnabled", "reminderTemplateName", "reminderTemplateLanguage", "createdAt") VALUES ('0448059c-b291-4946-8d90-f47eadea4447', 'booking', 'Centro de Yoga y Bienestar Salvadora', 'Espacio integral de bienestar: Escuela de Yoga, Baños y Pujas de Gong, Terapia Gestalt, Constelaciones Familiares y Retiros Especiales.', 'Eres el asistente virtual y recepcionista del Centro de Yoga y Bienestar Integral Salvadora.
Tu función es atender a los alumnos e interesados por WhatsApp con un tono cálido, cercano, atento y profesional.

Servicios y Actividades principales del centro:
1. Hatha Yoga Terapéutico (1 clase/semana - 25€/mes o 2 clases/semana - 42€/mes):
   - Duración: 90 minutos por clase.
   - Horarios semanales fijos:
     * Martes: 9:45, 11:15, 17:00, 18:30 y 20:00
     * Miércoles: 20:15
     * Jueves: 9:45, 11:15, 16:30, 17:30 y 19:00
   - Aforo máximo de clase: 20 plazas fijas (hasta 28 para recuperaciones de clases perdidas).
   - Todos los pagos se realizan directamente en el centro.

2. Meditaciones Guiadas (15€/mes, gratuitas para alumnos de Yoga):
   - Martes y Jueves de 9:15 a 9:45 (30 min).

3. Terapia Gestalt (35€ / sesión de 1h):
   - Individual, presencial u online (videollamada). Se coordina horario específico.

4. Baños de Gong y Meditación Sonora (16€ / 2 horas):
   - Un sábado al mes a finales de mes (próximo: Sábado 26 de Septiembre de 2026, 18:00 a 20:00). Aforo: 30 personas.

5. Puja de Gongs (95€ / 11 horas de sonido durante toda la noche):
   - Evento anual. Próxima edición: Sábado 28 de Noviembre de 2026 (21:00 a 08:00). Aforo: 30 personas.

6. Constelaciones Familiares (Constelar 60€ / Participar 20€):
   - Taller vivencial de fin de mes. Próxima fecha: Domingo 27 de Septiembre de 2026 (10:00 a 14:00).

7. Encuentro de Mujeres en Primavera (45€):
   - Sábado 15 de Mayo de 2027.

8. Retiro de Ayuno Terapéutico:
   - Semestral en otoño y primavera. Próxima edición en el Puente de Octubre (9 al 12 de Octubre de 2026).

9. Bienestar Experience - Longevidad y Bienestar Integral (25€ / sesión 1h):
   - Presencial y online. Asesoramiento en biohacking, nutrición natural, longevidad, ritmos circadianos y psicología positiva.

10. Iaidō (Esgrima Japonesa):
    - Lugar: Club Social Parque Granada. Lunes 20:00-21:00 y Jueves 20:30-22:00. Clase de prueba gratis. Contacto WhatsApp: 695 172 625.

Pautas de reserva:
- Todos los servicios se abonan presencialmente en el centro.
- Cuando un cliente pida cita u horarios, usa checkAvailability y bookAppointment. Informa siempre de forma clara y amable.', 'whatsapp', '[{"id":"d3b4566d-e1da-430c-be1f-b2bd1d0a0bad","name":"Hatha Yoga Terapéutico (1 clase semanal)","price":"25.00","calendarId":"cal-hatha-yoga","maxCapacity":20,"paymentType":"in_person","serviceType":"recurring","eventEndDate":null,"eventDatesText":null,"eventStartDate":null,"requiresReason":false,"durationMinutes":90,"requiresApproval":false,"allowedModalities":["in_person"]},{"id":"15f33ff9-210c-45ab-b6fd-e660854505b4","name":"Hatha Yoga Terapéutico (2 clases semanales)","price":"42.00","calendarId":"cal-hatha-yoga","maxCapacity":20,"paymentType":"in_person","serviceType":"recurring","eventEndDate":null,"eventDatesText":null,"eventStartDate":null,"requiresReason":false,"durationMinutes":90,"requiresApproval":false,"allowedModalities":["in_person"]},{"id":"8d243111-8e4c-40e3-ac5a-b4301fe6cfb9","name":"Meditaciones Guiadas","price":"15.00","calendarId":"cal-meditacion","maxCapacity":28,"paymentType":"in_person","serviceType":"recurring","eventEndDate":null,"eventDatesText":null,"eventStartDate":null,"requiresReason":false,"durationMinutes":30,"requiresApproval":false,"allowedModalities":["in_person"]},{"id":"076c81be-6ce8-4f14-87a9-f507b01ba465","name":"Terapia Gestalt (Sesión Individual)","price":"35.00","calendarId":"cal-gestalt","maxCapacity":1,"paymentType":"in_person","serviceType":"recurring","eventEndDate":null,"eventDatesText":null,"eventStartDate":null,"requiresReason":false,"durationMinutes":60,"requiresApproval":false,"allowedModalities":["in_person","virtual"]},{"id":"3886172f-4a00-4af7-9d5f-5c4015e07f9c","name":"Baño de Gong y Meditación Sonora","price":"16.00","calendarId":"cal-gong-mensual","maxCapacity":30,"paymentType":"in_person","serviceType":"event","eventEndDate":"2026-09-26T20:00:00.000Z","eventDatesText":"Sábado 26 de Septiembre de 2026","eventStartDate":"2026-09-26T18:00:00.000Z","requiresReason":false,"durationMinutes":120,"requiresApproval":false,"allowedModalities":["in_person"]},{"id":"f929b07c-3505-42b8-907f-be7a1bca9af6","name":"Puja de Gongs (Noche Sagrada de Sonido - 11h)","price":"95.00","calendarId":"cal-puja-gongs","maxCapacity":30,"paymentType":"in_person","serviceType":"event","eventEndDate":"2026-11-29T08:00:00.000Z","eventDatesText":"Sábado 28 de Noviembre de 2026 (Noche de 21:00 a 08:00)","eventStartDate":"2026-11-28T21:00:00.000Z","requiresReason":false,"durationMinutes":660,"requiresApproval":false,"allowedModalities":["in_person"]},{"id":"85254e72-a7dd-4fdb-a1e0-607b27ef63a7","name":"Constelaciones Familiares","price":"60.00","calendarId":"cal-constelaciones","maxCapacity":25,"paymentType":"in_person","serviceType":"event","eventEndDate":"2026-09-27T14:00:00.000Z","eventDatesText":"Domingo 27 de Septiembre de 2026 (Tentativa)","eventStartDate":"2026-09-27T10:00:00.000Z","requiresReason":false,"durationMinutes":240,"requiresApproval":false,"allowedModalities":["in_person"]},{"id":"5f0693fa-adf1-4e65-a8ea-e4eda92ff942","name":"Encuentro de Mujeres (Primavera)","price":"45.00","calendarId":"cal-encuentro-mujeres","maxCapacity":25,"paymentType":"in_person","serviceType":"event","eventEndDate":"2027-05-15T16:00:00.000Z","eventDatesText":"Sábado 15 de Mayo de 2027 (Primavera)","eventStartDate":"2027-05-15T10:00:00.000Z","requiresReason":false,"durationMinutes":360,"requiresApproval":false,"allowedModalities":["in_person"]},{"id":"6bfc9e2b-bef8-42d5-9c25-bd3b7554229a","name":"Retiro de Ayuno Terapéutico","price":null,"calendarId":"cal-ayuno-terapeutico","maxCapacity":20,"paymentType":"in_person","serviceType":"event","eventEndDate":"2026-10-12T16:00:00.000Z","eventDatesText":"Del 9 al 12 de Octubre de 2026 (Puente de Octubre)","eventStartDate":"2026-10-09T16:00:00.000Z","requiresReason":false,"durationMinutes":1440,"requiresApproval":false,"allowedModalities":["in_person"]},{"id":"469fa9b9-227d-4168-bda7-cac5cf3e7f46","name":"Bienestar Experience (Longevidad y Bienestar Integral)","price":"25.00","calendarId":"cal-bienestar-experience","maxCapacity":1,"paymentType":"in_person","serviceType":"recurring","eventEndDate":null,"eventDatesText":null,"eventStartDate":null,"requiresReason":false,"durationMinutes":60,"requiresApproval":false,"allowedModalities":["in_person","virtual"]},{"id":"3993614b-aa86-422e-b05f-6a58d43867c5","name":"Iaidō (Esgrima Japonesa)","price":"0.00","calendarId":"cal-iaido","maxCapacity":20,"paymentType":"in_person","serviceType":"recurring","eventEndDate":null,"eventDatesText":null,"eventStartDate":null,"requiresReason":false,"durationMinutes":60,"requiresApproval":false,"allowedModalities":["in_person"]}]'::jsonb, '[{"day":1,"open":"08:30","close":"21:30"},{"day":2,"open":"08:30","close":"21:30"},{"day":3,"open":"08:30","close":"21:30"},{"day":4,"open":"08:30","close":"21:30"},{"day":5,"open":"08:30","close":"21:30"},{"day":6,"open":"09:00","close":"20:00"},{"day":0,"open":"10:00","close":"14:00"}]'::jsonb, 'cálido, consciente y profesional', 'Europe/Madrid', 'openai/gpt-4.1-mini', 'sk-or-placeholder', NULL, 'ycloud-placeholder', NULL, true, false, NULL, 'es', '2026-08-29T12:38:23.798Z');

-- ==========================================
-- Datos: app_settings (1 registros)
-- ==========================================
INSERT INTO "app_settings" ("id", "businessName", "brandColor", "logoUrl", "onboardingCompleted", "createdAt", "updatedAt") VALUES ('b0abe2d7-ef42-450d-86c0-fa05299592dc', 'Centro de Yoga Salvadora Conesa', '#4f46e5', NULL, true, '2026-08-29T12:38:28.985Z', '2026-08-29T12:41:56.299Z');

-- ==========================================
-- Datos: appointments (3 registros)
-- ==========================================
INSERT INTO "appointments" ("id", "contactId", "service", "serviceId", "calendarId", "startsAt", "endsAt", "status", "agentKey", "modality", "reason", "notes", "responseDocument", "doctorReportPdf", "doctorReportPdfName", "doctorReportPdfMime", "doctorReportPdfSize", "patientAttachmentData", "patientAttachmentName", "patientAttachmentMime", "patientAttachmentSize", "patientAttachmentUploadedAt", "aiAnalysisType", "aiAnalysisResult", "aiAnalysisDate", "aiCroppedImageData", "aiCroppedImageMime", "calBookingId", "calBookingUid", "calMeetingUrl", "calStatus", "price", "paymentStatus", "stripeSessionId", "stripePaymentIntentId", "paymentUrl", "paidAt", "acceptedAt", "acceptedBy", "cancelledAt", "cancelledBy", "cancellationReason", "createdAt", "updatedAt") VALUES ('2c22880e-68f1-4fbb-9824-2b871db186d4', 'f46079df-3d2d-4a8e-ac9a-ef08975cde1a', 'Consulta Médica y Diagnóstico Clínico', 'b4605f40-f93f-4956-b108-754763fee5f2', 'cal-medica', '2026-08-31T09:00:00.000Z', '2026-08-31T09:45:00.000Z', 'scheduled', NULL, 'in_person', 'Dolor lumbar agudo tras esfuerzo físico e inflamación paravertebral', 'Paciente acude por dolor agudo de 4 días de evolución tras levantar peso.', NULL, NULL, NULL, 'application/pdf', NULL, '{"type":"Buffer","data":[60,63,120,109,108,32,118,101,114,115,105,111,110,61,34,49,46,48,34,32,101,110,99,111,100,105,110,103,61,34,85,84,70,45,56,34,63,62,10,60,115,118,103,32,120,109,108,110,115,61,34,104,116,116,112,58,47,47,119,119,119,46,119,51,46,111,114,103,47,50,48,48,48,47,115,118,103,34,32,118,105,101,119,66,111,120,61,34,48,32,48,32,49,48,48,48,32,49,50,48,48,34,32,119,105,100,116,104,61,34,49,48,48,48,34,32,104,101,105,103,104,116,61,34,49,50,48,48,34,62,10,32,32,60,100,101,102,115,62,10,32,32,32,32,60,33,45,45,32,82,97,100,105,111,103,114,97,112,104,105,99,32,98,97,99,107,103,114,111,117,110,100,32,103,114,97,100,105,101,110,116,32,45,45,62,10,32,32,32,32,60,114,97,100,105,97,108,71,114,97,100,105,101,110,116,32,105,100,61,34,102,105,108,109,71,108,111,119,34,32,99,120,61,34,53,48,37,34,32,99,121,61,34,53,48,37,34,32,114,61,34,54,53,37,34,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,49,52,49,102,50,101,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,54,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,48,97,48,102,49,56,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,49,48,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,48,51,48,53,48,56,34,47,62,10,32,32,32,32,60,47,114,97,100,105,97,108,71,114,97,100,105,101,110,116,62,10,10,32,32,32,32,60,33,45,45,32,66,111,110,101,32,100,101,110,115,105,116,121,32,103,114,97,100,105,101,110,116,115,32,45,45,62,10,32,32,32,32,60,108,105,110,101,97,114,71,114,97,100,105,101,110,116,32,105,100,61,34,98,111,110,101,71,114,97,100,34,32,120,49,61,34,48,37,34,32,121,49,61,34,48,37,34,32,120,50,61,34,49,48,48,37,34,32,121,50,61,34,48,37,34,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,55,97,57,97,98,53,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,55,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,51,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,101,50,102,49,102,99,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,57,53,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,53,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,102,102,102,102,102,102,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,49,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,55,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,100,48,101,53,102,53,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,57,53,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,49,48,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,54,52,56,53,97,52,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,55,34,47,62,10,32,32,32,32,60,47,108,105,110,101,97,114,71,114,97,100,105,101,110,116,62,10,10,32,32,32,32,60,108,105,110,101,97,114,71,114,97,100,105,101,110,116,32,105,100,61,34,112,101,108,118,105,115,71,114,97,100,34,32,120,49,61,34,48,37,34,32,121,49,61,34,48,37,34,32,120,50,61,34,48,37,34,32,121,50,61,34,49,48,48,37,34,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,98,56,100,97,102,48,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,56,53,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,49,48,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,52,97,54,57,56,52,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,52,34,47,62,10,32,32,32,32,60,47,108,105,110,101,97,114,71,114,97,100,105,101,110,116,62,10,10,32,32,32,32,60,102,105,108,116,101,114,32,105,100,61,34,115,111,102,116,71,108,111,119,34,32,120,61,34,45,50,48,37,34,32,121,61,34,45,50,48,37,34,32,119,105,100,116,104,61,34,49,52,48,37,34,32,104,101,105,103,104,116,61,34,49,52,48,37,34,62,10,32,32,32,32,32,32,60,102,101,71,97,117,115,115,105,97,110,66,108,117,114,32,115,116,100,68,101,118,105,97,116,105,111,110,61,34,51,34,32,114,101,115,117,108,116,61,34,98,108,117,114,34,47,62,10,32,32,32,32,32,32,60,102,101,67,111,109,112,111,115,105,116,101,32,105,110,61,34,83,111,117,114,99,101,71,114,97,112,104,105,99,34,32,105,110,50,61,34,98,108,117,114,34,32,111,112,101,114,97,116,111,114,61,34,111,118,101,114,34,47,62,10,32,32,32,32,60,47,102,105,108,116,101,114,62,10,32,32,60,47,100,101,102,115,62,10,10,32,32,60,33,45,45,32,70,105,108,109,32,83,104,101,101,116,32,66,97,99,107,103,114,111,117,110,100,32,45,45,62,10,32,32,60,114,101,99,116,32,119,105,100,116,104,61,34,49,48,48,48,34,32,104,101,105,103,104,116,61,34,49,50,48,48,34,32,102,105,108,108,61,34,117,114,108,40,35,102,105,108,109,71,108,111,119,41,34,47,62,10,10,32,32,60,33,45,45,32,84,101,99,104,110,105,99,97,108,32,67,97,108,105,98,114,97,116,105,111,110,32,71,114,105,100,32,40,83,117,98,116,108,101,41,32,45,45,62,10,32,32,60,103,32,115,116,114,111,107,101,61,34,35,49,97,50,56,51,97,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,48,46,55,34,32,111,112,97,99,105,116,121,61,34,48,46,52,34,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,34,32,121,49,61,34,50,48,48,34,32,120,50,61,34,57,53,48,34,32,121,50,61,34,50,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,34,32,121,49,61,34,52,48,48,34,32,120,50,61,34,57,53,48,34,32,121,50,61,34,52,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,34,32,121,49,61,34,54,48,48,34,32,120,50,61,34,57,53,48,34,32,121,50,61,34,54,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,34,32,121,49,61,34,56,48,48,34,32,120,50,61,34,57,53,48,34,32,121,50,61,34,56,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,34,32,121,49,61,34,49,48,48,48,34,32,120,50,61,34,57,53,48,34,32,121,50,61,34,49,48,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,50,53,48,34,32,121,49,61,34,49,48,48,34,32,120,50,61,34,50,53,48,34,32,121,50,61,34,49,49,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,48,34,32,121,49,61,34,49,48,48,34,32,120,50,61,34,53,48,48,34,32,121,50,61,34,49,49,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,55,53,48,34,32,121,49,61,34,49,48,48,34,32,120,50,61,34,55,53,48,34,32,121,50,61,34,49,49,48,48,34,47,62,10,32,32,60,47,103,62,10,10,32,32,60,33,45,45,32,82,97,100,105,111,103,114,97,112,104,121,32,72,101,97,100,101,114,32,38,32,80,97,116,105,101,110,116,32,73,110,102,111,32,79,118,101,114,108,97,121,32,45,45,62,10,32,32,60,103,32,102,111,110,116,45,102,97,109,105,108,121,61,34,72,101,108,118,101,116,105,99,97,44,32,65,114,105,97,108,44,32,115,97,110,115,45,115,101,114,105,102,34,62,10,32,32,32,32,60,33,45,45,32,67,108,105,110,105,99,32,47,32,72,111,115,112,105,116,97,108,32,98,97,110,110,101,114,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,52,48,34,32,121,61,34,51,48,34,32,119,105,100,116,104,61,34,57,50,48,34,32,104,101,105,103,104,116,61,34,55,53,34,32,114,120,61,34,54,34,32,102,105,108,108,61,34,35,48,100,49,56,50,54,34,32,115,116,114,111,107,101,61,34,35,50,50,51,54,52,102,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,53,34,47,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,54,48,34,32,102,105,108,108,61,34,35,54,52,98,53,102,54,34,32,102,111,110,116,45,115,105,122,101,61,34,49,54,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,32,108,101,116,116,101,114,45,115,112,97,99,105,110,103,61,34,49,46,53,34,62,72,79,83,80,73,84,65,76,32,85,78,73,86,69,82,83,73,84,65,82,73,79,32,38,97,109,112,59,32,83,69,82,86,73,67,73,79,32,68,69,32,82,65,68,73,79,68,73,65,71,78,195,147,83,84,73,67,79,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,56,53,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,62,69,83,84,85,68,73,79,32,82,65,68,73,79,76,195,147,71,73,67,79,32,68,73,71,73,84,65,76,32,68,73,82,69,67,84,79,32,40,68,82,41,32,194,183,32,67,79,76,85,77,78,65,32,76,85,77,66,65,82,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,55,53,48,34,32,121,61,34,54,48,34,32,102,105,108,108,61,34,35,101,48,101,48,101,48,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,73,68,32,82,88,58,32,35,50,48,50,54,45,82,88,45,56,52,57,49,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,55,53,48,34,32,121,61,34,56,48,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,49,34,62,83,65,76,65,58,32,68,82,45,48,51,32,194,183,32,55,53,107,86,112,32,51,50,109,65,115,60,47,116,101,120,116,62,10,10,32,32,32,32,60,33,45,45,32,80,97,116,105,101,110,116,32,68,101,116,97,105,108,115,32,66,97,110,110,101,114,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,52,48,34,32,121,61,34,49,49,53,34,32,119,105,100,116,104,61,34,57,50,48,34,32,104,101,105,103,104,116,61,34,52,50,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,56,49,48,49,97,34,32,115,116,114,111,107,101,61,34,35,49,99,50,100,52,50,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,34,47,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,49,52,49,34,32,102,105,108,108,61,34,35,102,102,102,102,102,102,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,80,65,67,73,69,78,84,69,58,32,70,69,82,78,195,129,78,68,69,90,44,32,76,85,67,195,141,65,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,51,53,48,34,32,121,61,34,49,52,49,34,32,102,105,108,108,61,34,35,98,48,98,101,99,53,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,62,69,68,65,68,58,32,51,56,32,65,195,145,79,83,32,194,183,32,83,69,88,79,58,32,70,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,53,54,48,34,32,121,61,34,49,52,49,34,32,102,105,108,108,61,34,35,98,48,98,101,99,53,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,62,70,69,67,72,65,58,32,50,52,47,48,56,47,50,48,50,54,32,48,57,58,52,53,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,55,56,48,34,32,121,61,34,49,52,49,34,32,102,105,108,108,61,34,35,102,102,100,53,52,102,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,80,82,79,89,69,67,67,73,195,147,78,58,32,65,80,32,43,32,76,65,84,60,47,116,101,120,116,62,10,10,32,32,32,32,60,33,45,45,32,79,114,105,101,110,116,97,116,105,111,110,32,77,97,114,107,101,114,115,32,45,45,62,10,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,57,48,48,34,32,99,121,61,34,50,50,48,34,32,114,61,34,50,52,34,32,102,105,108,108,61,34,35,48,100,49,56,50,54,34,32,115,116,114,111,107,101,61,34,35,52,102,99,51,102,55,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,47,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,56,57,51,34,32,121,61,34,50,50,56,34,32,102,105,108,108,61,34,35,52,102,99,51,102,55,34,32,102,111,110,116,45,115,105,122,101,61,34,50,50,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,82,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,56,56,48,34,32,121,61,34,50,54,48,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,68,69,82,69,67,72,65,60,47,116,101,120,116,62,10,32,32,60,47,103,62,10,10,32,32,60,33,45,45,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,82,65,68,73,79,71,82,65,80,72,73,67,32,65,78,65,84,79,77,89,58,32,76,85,77,66,65,82,32,83,80,73,78,69,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,45,45,62,10,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,53,48,48,44,32,49,56,48,41,34,32,102,105,108,116,101,114,61,34,117,114,108,40,35,115,111,102,116,71,108,111,119,41,34,62,10,32,32,32,32,60,33,45,45,32,83,111,102,116,32,84,105,115,115,117,101,32,83,104,97,100,111,119,32,45,45,62,10,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,49,56,48,44,53,48,32,81,32,45,50,52,48,44,52,48,48,32,45,50,48,48,44,56,48,48,32,76,32,50,48,48,44,56,48,48,32,81,32,50,52,48,44,52,48,48,32,49,56,48,44,53,48,32,90,34,32,102,105,108,108,61,34,35,49,56,50,53,51,53,34,32,111,112,97,99,105,116,121,61,34,48,46,51,53,34,47,62,10,10,32,32,32,32,60,33,45,45,32,84,49,50,32,40,76,111,119,101,114,32,84,104,111,114,97,99,105,99,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,52,48,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,54,53,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,51,48,34,32,104,101,105,103,104,116,61,34,52,53,34,32,114,120,61,34,49,48,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,53,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,50,50,34,32,114,120,61,34,49,52,34,32,114,121,61,34,49,48,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,56,53,34,32,121,61,34,50,56,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,84,49,50,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,73,110,116,101,114,118,101,114,116,101,98,114,97,108,32,100,105,115,99,32,84,49,50,45,76,49,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,53,53,34,32,121,61,34,57,48,34,32,119,105,100,116,104,61,34,49,49,48,34,32,104,101,105,103,104,116,61,34,49,50,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,101,49,56,50,52,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,10,32,32,32,32,60,33,45,45,32,76,49,32,40,76,117,109,98,97,114,32,86,101,114,116,101,98,114,97,32,49,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,49,48,54,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,55,48,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,52,48,34,32,104,101,105,103,104,116,61,34,53,50,34,32,114,120,61,34,49,50,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,50,54,34,32,114,120,61,34,49,54,34,32,114,121,61,34,49,50,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,53,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,84,114,97,110,115,118,101,114,115,101,32,112,114,111,99,101,115,115,101,115,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,55,48,44,50,54,32,81,32,45,49,50,48,44,50,48,32,45,49,51,48,44,51,50,32,81,32,45,49,49,53,44,52,48,32,45,55,48,44,51,54,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,55,48,44,50,54,32,81,32,49,50,48,44,50,48,32,49,51,48,44,51,50,32,81,32,49,49,53,44,52,48,32,55,48,44,51,54,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,57,48,34,32,121,61,34,51,50,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,76,49,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,73,110,116,101,114,118,101,114,116,101,98,114,97,108,32,100,105,115,99,32,76,49,45,76,50,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,54,50,34,32,121,61,34,49,54,51,34,32,119,105,100,116,104,61,34,49,50,52,34,32,104,101,105,103,104,116,61,34,49,52,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,101,49,56,50,52,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,10,32,32,32,32,60,33,45,45,32,76,50,32,40,76,117,109,98,97,114,32,86,101,114,116,101,98,114,97,32,50,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,49,56,50,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,55,54,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,53,50,34,32,104,101,105,103,104,116,61,34,53,54,34,32,114,120,61,34,49,50,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,50,56,34,32,114,120,61,34,49,56,34,32,114,121,61,34,49,51,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,53,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,84,114,97,110,115,118,101,114,115,101,32,112,114,111,99,101,115,115,101,115,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,55,54,44,50,56,32,81,32,45,49,51,48,44,50,50,32,45,49,52,53,44,51,53,32,81,32,45,49,50,53,44,52,53,32,45,55,54,44,51,56,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,55,54,44,50,56,32,81,32,49,51,48,44,50,50,32,49,52,53,44,51,53,32,81,32,49,50,53,44,52,53,32,55,54,44,51,56,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,57,53,34,32,121,61,34,51,52,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,76,50,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,73,110,116,101,114,118,101,114,116,101,98,114,97,108,32,100,105,115,99,32,76,50,45,76,51,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,54,56,34,32,121,61,34,50,52,52,34,32,119,105,100,116,104,61,34,49,51,54,34,32,104,101,105,103,104,116,61,34,49,53,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,101,49,56,50,52,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,10,32,32,32,32,60,33,45,45,32,76,51,32,40,76,117,109,98,97,114,32,86,101,114,116,101,98,114,97,32,51,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,50,54,52,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,56,50,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,54,52,34,32,104,101,105,103,104,116,61,34,54,48,34,32,114,120,61,34,49,52,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,51,48,34,32,114,120,61,34,50,48,34,32,114,121,61,34,49,52,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,53,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,84,114,97,110,115,118,101,114,115,101,32,112,114,111,99,101,115,115,101,115,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,56,50,44,51,48,32,81,32,45,49,52,53,44,50,52,32,45,49,54,48,44,51,56,32,81,32,45,49,52,48,44,53,48,32,45,56,50,44,52,50,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,56,50,44,51,48,32,81,32,49,52,53,44,50,52,32,49,54,48,44,51,56,32,81,32,49,52,48,44,53,48,32,56,50,44,52,50,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,48,48,34,32,121,61,34,51,54,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,76,51,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,73,110,116,101,114,118,101,114,116,101,98,114,97,108,32,100,105,115,99,32,76,51,45,76,52,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,55,52,34,32,121,61,34,51,51,48,34,32,119,105,100,116,104,61,34,49,52,56,34,32,104,101,105,103,104,116,61,34,49,54,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,101,49,56,50,52,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,10,32,32,32,32,60,33,45,45,32,76,52,32,40,76,117,109,98,97,114,32,86,101,114,116,101,98,114,97,32,52,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,51,53,50,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,56,56,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,55,54,34,32,104,101,105,103,104,116,61,34,54,52,34,32,114,120,61,34,49,52,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,51,50,34,32,114,120,61,34,50,50,34,32,114,121,61,34,49,53,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,53,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,84,114,97,110,115,118,101,114,115,101,32,112,114,111,99,101,115,115,101,115,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,56,56,44,51,50,32,81,32,45,49,53,48,44,50,54,32,45,49,54,50,44,52,48,32,81,32,45,49,52,48,44,53,50,32,45,56,56,44,52,52,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,56,56,44,51,50,32,81,32,49,53,48,44,50,54,32,49,54,50,44,52,48,32,81,32,49,52,48,44,53,50,32,56,56,44,52,52,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,48,53,34,32,121,61,34,51,56,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,76,52,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,67,82,73,84,73,67,65,76,32,82,65,68,73,79,76,79,71,73,67,65,76,32,70,73,78,68,73,78,71,58,32,76,52,45,76,53,32,80,73,78,67,72,73,78,71,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,45,45,62,10,32,32,32,32,60,33,45,45,32,78,97,114,114,111,119,101,100,32,68,105,115,99,32,83,112,97,99,101,32,76,52,45,76,53,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,55,56,34,32,121,61,34,52,50,50,34,32,119,105,100,116,104,61,34,49,53,54,34,32,104,101,105,103,104,116,61,34,56,34,32,114,120,61,34,50,34,32,102,105,108,108,61,34,35,48,97,49,50,49,99,34,32,115,116,114,111,107,101,61,34,35,102,102,53,50,53,50,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,53,34,47,62,10,10,32,32,32,32,60,33,45,45,32,76,53,32,40,76,117,109,98,97,114,32,86,101,114,116,101,98,114,97,32,53,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,52,51,54,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,57,50,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,56,52,34,32,104,101,105,103,104,116,61,34,54,54,34,32,114,120,61,34,49,52,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,51,51,34,32,114,120,61,34,50,52,34,32,114,121,61,34,49,54,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,53,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,77,97,115,115,105,118,101,32,76,53,32,116,114,97,110,115,118,101,114,115,101,32,112,114,111,99,101,115,115,101,115,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,57,50,44,51,51,32,81,32,45,49,54,48,44,51,48,32,45,49,55,48,44,52,56,32,81,32,45,49,52,53,44,54,50,32,45,57,50,44,53,48,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,53,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,57,50,44,51,51,32,81,32,49,54,48,44,51,48,32,49,55,48,44,52,56,32,81,32,49,52,53,44,54,50,32,57,50,44,53,48,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,53,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,49,48,34,32,121,61,34,51,57,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,76,53,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,76,53,45,83,49,32,68,105,115,99,32,115,112,97,99,101,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,56,48,34,32,121,61,34,53,48,56,34,32,119,105,100,116,104,61,34,49,54,48,34,32,104,101,105,103,104,116,61,34,49,50,34,32,114,120,61,34,51,34,32,102,105,108,108,61,34,35,48,101,49,56,50,52,34,32,111,112,97,99,105,116,121,61,34,48,46,56,53,34,47,62,10,10,32,32,32,32,60,33,45,45,32,83,97,99,114,117,109,32,38,32,80,101,108,118,105,115,32,40,73,108,105,97,99,32,67,114,101,115,116,115,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,53,50,54,41,34,62,10,32,32,32,32,32,32,60,33,45,45,32,83,97,99,114,117,109,32,98,111,100,121,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,56,53,44,48,32,76,32,56,53,44,48,32,76,32,53,48,44,50,50,48,32,76,32,45,53,48,44,50,50,48,32,90,34,32,102,105,108,108,61,34,117,114,108,40,35,112,101,108,118,105,115,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,83,97,99,114,97,108,32,102,111,114,97,109,105,110,97,32,104,111,108,101,115,32,45,45,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,45,50,53,34,32,99,121,61,34,52,48,34,32,114,61,34,55,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,50,53,34,32,99,121,61,34,52,48,34,32,114,61,34,55,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,45,50,48,34,32,99,121,61,34,56,48,34,32,114,61,34,54,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,50,48,34,32,99,121,61,34,56,48,34,32,114,61,34,54,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,45,49,54,34,32,99,121,61,34,49,50,48,34,32,114,61,34,53,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,49,54,34,32,99,121,61,34,49,50,48,34,32,114,61,34,53,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,55,48,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,83,49,32,40,83,97,99,114,111,41,60,47,116,101,120,116,62,10,10,32,32,32,32,32,32,60,33,45,45,32,73,108,105,97,99,32,87,105,110,103,115,32,40,80,101,108,118,105,115,41,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,57,48,44,49,48,32,81,32,45,50,52,48,44,45,52,48,32,45,51,48,48,44,54,48,32,81,32,45,51,50,48,44,49,56,48,32,45,50,52,48,44,50,52,48,32,81,32,45,49,55,48,44,50,54,48,32,45,55,53,44,49,56,48,32,90,34,32,102,105,108,108,61,34,117,114,108,40,35,112,101,108,118,105,115,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,57,48,44,49,48,32,81,32,50,52,48,44,45,52,48,32,51,48,48,44,54,48,32,81,32,51,50,48,44,49,56,48,32,50,52,48,44,50,52,48,32,81,32,49,55,48,44,50,54,48,32,55,53,44,49,56,48,32,90,34,32,102,105,108,108,61,34,117,114,108,40,35,112,101,108,118,105,115,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,45,50,54,48,34,32,121,61,34,49,48,48,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,62,80,97,108,97,32,73,108,195,173,97,99,97,32,73,122,113,46,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,56,48,34,32,121,61,34,49,48,48,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,62,80,97,108,97,32,73,108,195,173,97,99,97,32,68,101,114,46,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,32,32,60,47,103,62,10,10,32,32,60,33,45,45,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,82,65,68,73,79,76,79,71,73,83,84,32,68,73,65,71,78,79,83,84,73,67,32,67,65,76,76,79,85,84,83,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,45,45,62,10,32,32,60,103,32,102,111,110,116,45,102,97,109,105,108,121,61,34,72,101,108,118,101,116,105,99,97,44,32,65,114,105,97,108,44,32,115,97,110,115,45,115,101,114,105,102,34,62,10,32,32,32,32,60,33,45,45,32,67,97,108,108,111,117,116,32,111,110,32,76,52,45,76,53,32,78,97,114,114,111,119,105,110,103,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,50,52,48,44,32,54,48,56,41,34,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,48,34,32,121,49,61,34,48,34,32,120,50,61,34,49,55,53,34,32,121,50,61,34,48,34,32,115,116,114,111,107,101,61,34,35,102,102,53,50,53,50,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,32,115,116,114,111,107,101,45,100,97,115,104,97,114,114,97,121,61,34,52,44,50,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,49,55,53,34,32,99,121,61,34,48,34,32,114,61,34,52,34,32,102,105,108,108,61,34,35,102,102,53,50,53,50,34,47,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,50,49,48,34,32,121,61,34,45,51,53,34,32,119,105,100,116,104,61,34,50,48,48,34,32,104,101,105,103,104,116,61,34,53,56,34,32,114,120,61,34,54,34,32,102,105,108,108,61,34,35,49,99,49,48,49,53,34,32,115,116,114,111,107,101,61,34,35,102,102,53,50,53,50,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,53,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,45,50,48,48,34,32,121,61,34,45,49,56,34,32,102,105,108,108,61,34,35,102,102,53,50,53,50,34,32,102,111,110,116,45,115,105,122,101,61,34,49,49,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,72,65,76,76,65,90,71,79,32,82,65,68,73,79,76,195,147,71,73,67,79,58,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,45,50,48,48,34,32,121,61,34,45,50,34,32,102,105,108,108,61,34,35,102,102,102,102,102,102,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,62,80,105,110,122,97,109,105,101,110,116,111,32,100,105,115,99,97,108,32,76,52,45,76,53,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,45,50,48,48,34,32,121,61,34,49,51,34,32,102,105,108,108,61,34,35,102,102,99,100,100,50,34,32,102,111,110,116,45,115,105,122,101,61,34,57,34,62,69,115,112,97,99,105,111,32,105,110,116,101,114,115,111,109,195,161,116,105,99,111,32,100,105,115,109,105,110,117,105,100,111,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,67,97,108,108,111,117,116,32,111,110,32,65,108,105,103,110,109,101,110,116,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,55,54,48,44,32,52,52,48,41,34,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,48,34,32,121,49,61,34,48,34,32,120,50,61,34,45,49,55,48,34,32,121,50,61,34,48,34,32,115,116,114,111,107,101,61,34,35,52,102,99,51,102,55,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,53,34,32,115,116,114,111,107,101,45,100,97,115,104,97,114,114,97,121,61,34,51,44,50,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,45,49,55,48,34,32,99,121,61,34,48,34,32,114,61,34,51,46,53,34,32,102,105,108,108,61,34,35,52,102,99,51,102,55,34,47,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,48,34,32,121,61,34,45,50,53,34,32,119,105,100,116,104,61,34,49,56,48,34,32,104,101,105,103,104,116,61,34,52,54,34,32,114,120,61,34,53,34,32,102,105,108,108,61,34,35,48,100,49,97,50,57,34,32,115,116,114,111,107,101,61,34,35,52,102,99,51,102,55,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,50,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,48,34,32,121,61,34,45,56,34,32,102,105,108,108,61,34,35,52,102,99,51,102,55,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,69,74,69,32,82,65,81,85,195,141,68,69,79,58,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,48,34,32,121,61,34,57,34,32,102,105,108,108,61,34,35,101,49,102,53,102,101,34,32,102,111,110,116,45,115,105,122,101,61,34,57,46,53,34,62,65,108,105,110,101,97,99,105,195,179,110,32,99,111,114,111,110,97,108,32,99,111,110,115,101,114,118,97,100,97,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,67,97,108,105,98,114,97,116,105,111,110,32,47,32,83,99,97,108,101,32,114,117,108,101,114,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,54,48,44,32,57,50,48,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,48,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,51,48,34,32,104,101,105,103,104,116,61,34,49,53,48,34,32,102,105,108,108,61,34,35,48,56,49,48,49,97,34,32,115,116,114,111,107,101,61,34,35,50,50,51,54,52,102,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,49,48,34,32,120,50,61,34,49,56,34,32,121,50,61,34,49,48,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,51,53,34,32,120,50,61,34,50,52,34,32,121,50,61,34,51,53,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,54,48,34,32,120,50,61,34,49,56,34,32,121,50,61,34,54,48,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,56,53,34,32,120,50,61,34,50,52,34,32,121,50,61,34,56,53,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,49,49,48,34,32,120,50,61,34,49,56,34,32,121,50,61,34,49,49,48,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,49,51,53,34,32,120,50,61,34,49,56,34,32,121,50,61,34,49,51,53,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,52,48,34,32,121,61,34,49,53,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,62,48,32,99,109,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,52,48,34,32,121,61,34,54,53,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,62,53,32,99,109,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,52,48,34,32,121,61,34,49,49,53,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,62,49,48,32,99,109,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,52,48,34,32,121,61,34,49,52,48,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,62,49,50,32,99,109,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,84,101,99,104,110,105,99,97,108,32,68,105,97,103,110,111,115,116,105,99,32,70,111,111,116,101,114,32,47,32,83,116,97,109,112,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,52,48,34,32,121,61,34,49,49,48,53,34,32,119,105,100,116,104,61,34,57,50,48,34,32,104,101,105,103,104,116,61,34,54,53,34,32,114,120,61,34,54,34,32,102,105,108,108,61,34,35,48,97,49,50,49,99,34,32,115,116,114,111,107,101,61,34,35,50,50,51,54,52,102,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,53,34,47,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,49,49,51,48,34,32,102,105,108,108,61,34,35,98,48,98,101,99,53,34,32,102,111,110,116,45,115,105,122,101,61,34,49,49,34,62,73,78,70,79,82,77,69,32,68,69,32,65,68,81,85,73,83,73,67,73,195,147,78,58,32,67,97,108,105,100,97,100,32,100,105,97,103,110,195,179,115,116,105,99,97,32,195,179,112,116,105,109,97,46,32,68,111,115,105,115,32,97,99,117,109,117,108,97,100,97,32,68,65,80,58,32,49,46,52,50,32,71,121,194,183,99,109,194,178,46,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,49,49,53,48,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,115,105,122,101,61,34,49,49,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,67,79,78,67,76,85,83,73,195,147,78,58,32,83,105,103,110,111,115,32,114,97,100,105,111,108,195,179,103,105,99,111,115,32,100,101,32,100,105,115,99,111,112,97,116,195,173,97,32,100,101,103,101,110,101,114,97,116,105,118,97,32,47,32,112,105,110,122,97,109,105,101,110,116,111,32,115,105,110,116,111,109,195,161,116,105,99,111,32,76,52,45,76,53,32,115,105,110,32,101,118,105,100,101,110,99,105,97,32,100,101,32,108,105,115,105,115,32,110,105,32,108,105,115,116,101,115,105,115,46,60,47,116,101,120,116,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,55,54,48,34,32,121,61,34,49,49,49,53,34,32,119,105,100,116,104,61,34,49,56,53,34,32,104,101,105,103,104,116,61,34,52,53,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,102,50,49,51,55,34,32,115,116,114,111,107,101,61,34,35,48,48,101,54,55,54,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,34,47,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,55,55,53,34,32,121,61,34,49,49,51,51,34,32,102,105,108,108,61,34,35,48,48,101,54,55,54,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,226,156,147,32,86,65,76,73,68,65,68,79,32,82,65,68,73,79,76,79,71,195,141,65,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,55,55,53,34,32,121,61,34,49,49,52,56,34,32,102,105,108,108,61,34,35,98,57,102,54,99,97,34,32,102,111,110,116,45,115,105,122,101,61,34,57,34,62,70,105,114,109,97,32,69,108,101,99,116,114,195,179,110,105,99,97,32,77,195,169,100,105,99,97,60,47,116,101,120,116,62,10,32,32,60,47,103,62,10,60,47,115,118,103,62]}', 'radiografia_columna_lumbar.svg', 'image/svg+xml', 12175, '2026-08-31T07:07:34.493Z', 'dental_xray', 'ANÁLISIS RADIOGRÁFICO IA (analizaia)
Especialidad: Radiodiagnóstico Digital
Hallazgos:
1. Disminución del espacio intervertebral L4-L5 con esclerosis reactiva marginal.
2. Alineación del muro posterior raquídeo íntegro.
Juicio IA: Pinzamiento discal L4-L5 compatible con discopatía mecánica (Confianza: 95.4%).', '2026-08-31T07:17:34.493Z', '{"type":"Buffer","data":[60,63,120,109,108,32,118,101,114,115,105,111,110,61,34,49,46,48,34,32,101,110,99,111,100,105,110,103,61,34,85,84,70,45,56,34,63,62,10,60,115,118,103,32,120,109,108,110,115,61,34,104,116,116,112,58,47,47,119,119,119,46,119,51,46,111,114,103,47,50,48,48,48,47,115,118,103,34,32,118,105,101,119,66,111,120,61,34,48,32,48,32,49,48,48,48,32,49,50,48,48,34,32,119,105,100,116,104,61,34,49,48,48,48,34,32,104,101,105,103,104,116,61,34,49,50,48,48,34,62,10,32,32,60,100,101,102,115,62,10,32,32,32,32,60,33,45,45,32,82,97,100,105,111,103,114,97,112,104,105,99,32,98,97,99,107,103,114,111,117,110,100,32,103,114,97,100,105,101,110,116,32,45,45,62,10,32,32,32,32,60,114,97,100,105,97,108,71,114,97,100,105,101,110,116,32,105,100,61,34,102,105,108,109,71,108,111,119,34,32,99,120,61,34,53,48,37,34,32,99,121,61,34,53,48,37,34,32,114,61,34,54,53,37,34,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,49,52,49,102,50,101,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,54,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,48,97,48,102,49,56,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,49,48,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,48,51,48,53,48,56,34,47,62,10,32,32,32,32,60,47,114,97,100,105,97,108,71,114,97,100,105,101,110,116,62,10,10,32,32,32,32,60,33,45,45,32,66,111,110,101,32,100,101,110,115,105,116,121,32,103,114,97,100,105,101,110,116,115,32,45,45,62,10,32,32,32,32,60,108,105,110,101,97,114,71,114,97,100,105,101,110,116,32,105,100,61,34,98,111,110,101,71,114,97,100,34,32,120,49,61,34,48,37,34,32,121,49,61,34,48,37,34,32,120,50,61,34,49,48,48,37,34,32,121,50,61,34,48,37,34,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,55,97,57,97,98,53,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,55,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,51,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,101,50,102,49,102,99,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,57,53,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,53,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,102,102,102,102,102,102,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,49,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,55,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,100,48,101,53,102,53,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,57,53,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,49,48,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,54,52,56,53,97,52,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,55,34,47,62,10,32,32,32,32,60,47,108,105,110,101,97,114,71,114,97,100,105,101,110,116,62,10,10,32,32,32,32,60,108,105,110,101,97,114,71,114,97,100,105,101,110,116,32,105,100,61,34,112,101,108,118,105,115,71,114,97,100,34,32,120,49,61,34,48,37,34,32,121,49,61,34,48,37,34,32,120,50,61,34,48,37,34,32,121,50,61,34,49,48,48,37,34,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,98,56,100,97,102,48,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,56,53,34,47,62,10,32,32,32,32,32,32,60,115,116,111,112,32,111,102,102,115,101,116,61,34,49,48,48,37,34,32,115,116,111,112,45,99,111,108,111,114,61,34,35,52,97,54,57,56,52,34,32,115,116,111,112,45,111,112,97,99,105,116,121,61,34,48,46,52,34,47,62,10,32,32,32,32,60,47,108,105,110,101,97,114,71,114,97,100,105,101,110,116,62,10,10,32,32,32,32,60,102,105,108,116,101,114,32,105,100,61,34,115,111,102,116,71,108,111,119,34,32,120,61,34,45,50,48,37,34,32,121,61,34,45,50,48,37,34,32,119,105,100,116,104,61,34,49,52,48,37,34,32,104,101,105,103,104,116,61,34,49,52,48,37,34,62,10,32,32,32,32,32,32,60,102,101,71,97,117,115,115,105,97,110,66,108,117,114,32,115,116,100,68,101,118,105,97,116,105,111,110,61,34,51,34,32,114,101,115,117,108,116,61,34,98,108,117,114,34,47,62,10,32,32,32,32,32,32,60,102,101,67,111,109,112,111,115,105,116,101,32,105,110,61,34,83,111,117,114,99,101,71,114,97,112,104,105,99,34,32,105,110,50,61,34,98,108,117,114,34,32,111,112,101,114,97,116,111,114,61,34,111,118,101,114,34,47,62,10,32,32,32,32,60,47,102,105,108,116,101,114,62,10,32,32,60,47,100,101,102,115,62,10,10,32,32,60,33,45,45,32,70,105,108,109,32,83,104,101,101,116,32,66,97,99,107,103,114,111,117,110,100,32,45,45,62,10,32,32,60,114,101,99,116,32,119,105,100,116,104,61,34,49,48,48,48,34,32,104,101,105,103,104,116,61,34,49,50,48,48,34,32,102,105,108,108,61,34,117,114,108,40,35,102,105,108,109,71,108,111,119,41,34,47,62,10,10,32,32,60,33,45,45,32,84,101,99,104,110,105,99,97,108,32,67,97,108,105,98,114,97,116,105,111,110,32,71,114,105,100,32,40,83,117,98,116,108,101,41,32,45,45,62,10,32,32,60,103,32,115,116,114,111,107,101,61,34,35,49,97,50,56,51,97,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,48,46,55,34,32,111,112,97,99,105,116,121,61,34,48,46,52,34,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,34,32,121,49,61,34,50,48,48,34,32,120,50,61,34,57,53,48,34,32,121,50,61,34,50,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,34,32,121,49,61,34,52,48,48,34,32,120,50,61,34,57,53,48,34,32,121,50,61,34,52,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,34,32,121,49,61,34,54,48,48,34,32,120,50,61,34,57,53,48,34,32,121,50,61,34,54,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,34,32,121,49,61,34,56,48,48,34,32,120,50,61,34,57,53,48,34,32,121,50,61,34,56,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,34,32,121,49,61,34,49,48,48,48,34,32,120,50,61,34,57,53,48,34,32,121,50,61,34,49,48,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,50,53,48,34,32,121,49,61,34,49,48,48,34,32,120,50,61,34,50,53,48,34,32,121,50,61,34,49,49,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,53,48,48,34,32,121,49,61,34,49,48,48,34,32,120,50,61,34,53,48,48,34,32,121,50,61,34,49,49,48,48,34,47,62,10,32,32,32,32,60,108,105,110,101,32,120,49,61,34,55,53,48,34,32,121,49,61,34,49,48,48,34,32,120,50,61,34,55,53,48,34,32,121,50,61,34,49,49,48,48,34,47,62,10,32,32,60,47,103,62,10,10,32,32,60,33,45,45,32,82,97,100,105,111,103,114,97,112,104,121,32,72,101,97,100,101,114,32,38,32,80,97,116,105,101,110,116,32,73,110,102,111,32,79,118,101,114,108,97,121,32,45,45,62,10,32,32,60,103,32,102,111,110,116,45,102,97,109,105,108,121,61,34,72,101,108,118,101,116,105,99,97,44,32,65,114,105,97,108,44,32,115,97,110,115,45,115,101,114,105,102,34,62,10,32,32,32,32,60,33,45,45,32,67,108,105,110,105,99,32,47,32,72,111,115,112,105,116,97,108,32,98,97,110,110,101,114,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,52,48,34,32,121,61,34,51,48,34,32,119,105,100,116,104,61,34,57,50,48,34,32,104,101,105,103,104,116,61,34,55,53,34,32,114,120,61,34,54,34,32,102,105,108,108,61,34,35,48,100,49,56,50,54,34,32,115,116,114,111,107,101,61,34,35,50,50,51,54,52,102,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,53,34,47,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,54,48,34,32,102,105,108,108,61,34,35,54,52,98,53,102,54,34,32,102,111,110,116,45,115,105,122,101,61,34,49,54,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,32,108,101,116,116,101,114,45,115,112,97,99,105,110,103,61,34,49,46,53,34,62,72,79,83,80,73,84,65,76,32,85,78,73,86,69,82,83,73,84,65,82,73,79,32,38,97,109,112,59,32,83,69,82,86,73,67,73,79,32,68,69,32,82,65,68,73,79,68,73,65,71,78,195,147,83,84,73,67,79,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,56,53,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,62,69,83,84,85,68,73,79,32,82,65,68,73,79,76,195,147,71,73,67,79,32,68,73,71,73,84,65,76,32,68,73,82,69,67,84,79,32,40,68,82,41,32,194,183,32,67,79,76,85,77,78,65,32,76,85,77,66,65,82,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,55,53,48,34,32,121,61,34,54,48,34,32,102,105,108,108,61,34,35,101,48,101,48,101,48,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,73,68,32,82,88,58,32,35,50,48,50,54,45,82,88,45,56,52,57,49,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,55,53,48,34,32,121,61,34,56,48,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,49,34,62,83,65,76,65,58,32,68,82,45,48,51,32,194,183,32,55,53,107,86,112,32,51,50,109,65,115,60,47,116,101,120,116,62,10,10,32,32,32,32,60,33,45,45,32,80,97,116,105,101,110,116,32,68,101,116,97,105,108,115,32,66,97,110,110,101,114,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,52,48,34,32,121,61,34,49,49,53,34,32,119,105,100,116,104,61,34,57,50,48,34,32,104,101,105,103,104,116,61,34,52,50,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,56,49,48,49,97,34,32,115,116,114,111,107,101,61,34,35,49,99,50,100,52,50,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,34,47,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,49,52,49,34,32,102,105,108,108,61,34,35,102,102,102,102,102,102,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,80,65,67,73,69,78,84,69,58,32,70,69,82,78,195,129,78,68,69,90,44,32,76,85,67,195,141,65,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,51,53,48,34,32,121,61,34,49,52,49,34,32,102,105,108,108,61,34,35,98,48,98,101,99,53,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,62,69,68,65,68,58,32,51,56,32,65,195,145,79,83,32,194,183,32,83,69,88,79,58,32,70,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,53,54,48,34,32,121,61,34,49,52,49,34,32,102,105,108,108,61,34,35,98,48,98,101,99,53,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,62,70,69,67,72,65,58,32,50,52,47,48,56,47,50,48,50,54,32,48,57,58,52,53,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,55,56,48,34,32,121,61,34,49,52,49,34,32,102,105,108,108,61,34,35,102,102,100,53,52,102,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,80,82,79,89,69,67,67,73,195,147,78,58,32,65,80,32,43,32,76,65,84,60,47,116,101,120,116,62,10,10,32,32,32,32,60,33,45,45,32,79,114,105,101,110,116,97,116,105,111,110,32,77,97,114,107,101,114,115,32,45,45,62,10,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,57,48,48,34,32,99,121,61,34,50,50,48,34,32,114,61,34,50,52,34,32,102,105,108,108,61,34,35,48,100,49,56,50,54,34,32,115,116,114,111,107,101,61,34,35,52,102,99,51,102,55,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,47,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,56,57,51,34,32,121,61,34,50,50,56,34,32,102,105,108,108,61,34,35,52,102,99,51,102,55,34,32,102,111,110,116,45,115,105,122,101,61,34,50,50,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,82,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,56,56,48,34,32,121,61,34,50,54,48,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,68,69,82,69,67,72,65,60,47,116,101,120,116,62,10,32,32,60,47,103,62,10,10,32,32,60,33,45,45,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,82,65,68,73,79,71,82,65,80,72,73,67,32,65,78,65,84,79,77,89,58,32,76,85,77,66,65,82,32,83,80,73,78,69,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,45,45,62,10,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,53,48,48,44,32,49,56,48,41,34,32,102,105,108,116,101,114,61,34,117,114,108,40,35,115,111,102,116,71,108,111,119,41,34,62,10,32,32,32,32,60,33,45,45,32,83,111,102,116,32,84,105,115,115,117,101,32,83,104,97,100,111,119,32,45,45,62,10,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,49,56,48,44,53,48,32,81,32,45,50,52,48,44,52,48,48,32,45,50,48,48,44,56,48,48,32,76,32,50,48,48,44,56,48,48,32,81,32,50,52,48,44,52,48,48,32,49,56,48,44,53,48,32,90,34,32,102,105,108,108,61,34,35,49,56,50,53,51,53,34,32,111,112,97,99,105,116,121,61,34,48,46,51,53,34,47,62,10,10,32,32,32,32,60,33,45,45,32,84,49,50,32,40,76,111,119,101,114,32,84,104,111,114,97,99,105,99,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,52,48,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,54,53,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,51,48,34,32,104,101,105,103,104,116,61,34,52,53,34,32,114,120,61,34,49,48,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,53,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,50,50,34,32,114,120,61,34,49,52,34,32,114,121,61,34,49,48,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,56,53,34,32,121,61,34,50,56,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,84,49,50,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,73,110,116,101,114,118,101,114,116,101,98,114,97,108,32,100,105,115,99,32,84,49,50,45,76,49,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,53,53,34,32,121,61,34,57,48,34,32,119,105,100,116,104,61,34,49,49,48,34,32,104,101,105,103,104,116,61,34,49,50,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,101,49,56,50,52,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,10,32,32,32,32,60,33,45,45,32,76,49,32,40,76,117,109,98,97,114,32,86,101,114,116,101,98,114,97,32,49,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,49,48,54,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,55,48,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,52,48,34,32,104,101,105,103,104,116,61,34,53,50,34,32,114,120,61,34,49,50,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,50,54,34,32,114,120,61,34,49,54,34,32,114,121,61,34,49,50,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,53,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,84,114,97,110,115,118,101,114,115,101,32,112,114,111,99,101,115,115,101,115,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,55,48,44,50,54,32,81,32,45,49,50,48,44,50,48,32,45,49,51,48,44,51,50,32,81,32,45,49,49,53,44,52,48,32,45,55,48,44,51,54,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,55,48,44,50,54,32,81,32,49,50,48,44,50,48,32,49,51,48,44,51,50,32,81,32,49,49,53,44,52,48,32,55,48,44,51,54,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,57,48,34,32,121,61,34,51,50,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,76,49,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,73,110,116,101,114,118,101,114,116,101,98,114,97,108,32,100,105,115,99,32,76,49,45,76,50,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,54,50,34,32,121,61,34,49,54,51,34,32,119,105,100,116,104,61,34,49,50,52,34,32,104,101,105,103,104,116,61,34,49,52,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,101,49,56,50,52,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,10,32,32,32,32,60,33,45,45,32,76,50,32,40,76,117,109,98,97,114,32,86,101,114,116,101,98,114,97,32,50,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,49,56,50,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,55,54,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,53,50,34,32,104,101,105,103,104,116,61,34,53,54,34,32,114,120,61,34,49,50,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,50,56,34,32,114,120,61,34,49,56,34,32,114,121,61,34,49,51,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,53,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,84,114,97,110,115,118,101,114,115,101,32,112,114,111,99,101,115,115,101,115,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,55,54,44,50,56,32,81,32,45,49,51,48,44,50,50,32,45,49,52,53,44,51,53,32,81,32,45,49,50,53,44,52,53,32,45,55,54,44,51,56,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,55,54,44,50,56,32,81,32,49,51,48,44,50,50,32,49,52,53,44,51,53,32,81,32,49,50,53,44,52,53,32,55,54,44,51,56,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,57,53,34,32,121,61,34,51,52,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,76,50,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,73,110,116,101,114,118,101,114,116,101,98,114,97,108,32,100,105,115,99,32,76,50,45,76,51,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,54,56,34,32,121,61,34,50,52,52,34,32,119,105,100,116,104,61,34,49,51,54,34,32,104,101,105,103,104,116,61,34,49,53,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,101,49,56,50,52,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,10,32,32,32,32,60,33,45,45,32,76,51,32,40,76,117,109,98,97,114,32,86,101,114,116,101,98,114,97,32,51,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,50,54,52,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,56,50,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,54,52,34,32,104,101,105,103,104,116,61,34,54,48,34,32,114,120,61,34,49,52,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,51,48,34,32,114,120,61,34,50,48,34,32,114,121,61,34,49,52,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,53,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,84,114,97,110,115,118,101,114,115,101,32,112,114,111,99,101,115,115,101,115,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,56,50,44,51,48,32,81,32,45,49,52,53,44,50,52,32,45,49,54,48,44,51,56,32,81,32,45,49,52,48,44,53,48,32,45,56,50,44,52,50,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,56,50,44,51,48,32,81,32,49,52,53,44,50,52,32,49,54,48,44,51,56,32,81,32,49,52,48,44,53,48,32,56,50,44,52,50,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,48,48,34,32,121,61,34,51,54,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,76,51,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,73,110,116,101,114,118,101,114,116,101,98,114,97,108,32,100,105,115,99,32,76,51,45,76,52,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,55,52,34,32,121,61,34,51,51,48,34,32,119,105,100,116,104,61,34,49,52,56,34,32,104,101,105,103,104,116,61,34,49,54,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,101,49,56,50,52,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,10,32,32,32,32,60,33,45,45,32,76,52,32,40,76,117,109,98,97,114,32,86,101,114,116,101,98,114,97,32,52,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,51,53,50,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,56,56,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,55,54,34,32,104,101,105,103,104,116,61,34,54,52,34,32,114,120,61,34,49,52,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,51,50,34,32,114,120,61,34,50,50,34,32,114,121,61,34,49,53,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,53,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,84,114,97,110,115,118,101,114,115,101,32,112,114,111,99,101,115,115,101,115,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,56,56,44,51,50,32,81,32,45,49,53,48,44,50,54,32,45,49,54,50,44,52,48,32,81,32,45,49,52,48,44,53,50,32,45,56,56,44,52,52,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,56,56,44,51,50,32,81,32,49,53,48,44,50,54,32,49,54,50,44,52,48,32,81,32,49,52,48,44,53,50,32,56,56,44,52,52,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,48,53,34,32,121,61,34,51,56,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,76,52,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,67,82,73,84,73,67,65,76,32,82,65,68,73,79,76,79,71,73,67,65,76,32,70,73,78,68,73,78,71,58,32,76,52,45,76,53,32,80,73,78,67,72,73,78,71,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,45,45,62,10,32,32,32,32,60,33,45,45,32,78,97,114,114,111,119,101,100,32,68,105,115,99,32,83,112,97,99,101,32,76,52,45,76,53,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,55,56,34,32,121,61,34,52,50,50,34,32,119,105,100,116,104,61,34,49,53,54,34,32,104,101,105,103,104,116,61,34,56,34,32,114,120,61,34,50,34,32,102,105,108,108,61,34,35,48,97,49,50,49,99,34,32,115,116,114,111,107,101,61,34,35,102,102,53,50,53,50,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,53,34,47,62,10,10,32,32,32,32,60,33,45,45,32,76,53,32,40,76,117,109,98,97,114,32,86,101,114,116,101,98,114,97,32,53,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,52,51,54,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,57,50,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,49,56,52,34,32,104,101,105,103,104,116,61,34,54,54,34,32,114,120,61,34,49,52,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,101,108,108,105,112,115,101,32,99,120,61,34,48,34,32,99,121,61,34,51,51,34,32,114,120,61,34,50,52,34,32,114,121,61,34,49,54,34,32,102,105,108,108,61,34,35,50,48,51,51,52,56,34,32,111,112,97,99,105,116,121,61,34,48,46,54,53,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,77,97,115,115,105,118,101,32,76,53,32,116,114,97,110,115,118,101,114,115,101,32,112,114,111,99,101,115,115,101,115,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,57,50,44,51,51,32,81,32,45,49,54,48,44,51,48,32,45,49,55,48,44,52,56,32,81,32,45,49,52,53,44,54,50,32,45,57,50,44,53,48,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,53,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,57,50,44,51,51,32,81,32,49,54,48,44,51,48,32,49,55,48,44,52,56,32,81,32,49,52,53,44,54,50,32,57,50,44,53,48,34,32,102,105,108,108,61,34,117,114,108,40,35,98,111,110,101,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,56,53,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,49,48,34,32,121,61,34,51,57,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,76,53,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,76,53,45,83,49,32,68,105,115,99,32,115,112,97,99,101,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,45,56,48,34,32,121,61,34,53,48,56,34,32,119,105,100,116,104,61,34,49,54,48,34,32,104,101,105,103,104,116,61,34,49,50,34,32,114,120,61,34,51,34,32,102,105,108,108,61,34,35,48,101,49,56,50,52,34,32,111,112,97,99,105,116,121,61,34,48,46,56,53,34,47,62,10,10,32,32,32,32,60,33,45,45,32,83,97,99,114,117,109,32,38,32,80,101,108,118,105,115,32,40,73,108,105,97,99,32,67,114,101,115,116,115,41,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,48,44,32,53,50,54,41,34,62,10,32,32,32,32,32,32,60,33,45,45,32,83,97,99,114,117,109,32,98,111,100,121,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,56,53,44,48,32,76,32,56,53,44,48,32,76,32,53,48,44,50,50,48,32,76,32,45,53,48,44,50,50,48,32,90,34,32,102,105,108,108,61,34,117,114,108,40,35,112,101,108,118,105,115,71,114,97,100,41,34,47,62,10,32,32,32,32,32,32,60,33,45,45,32,83,97,99,114,97,108,32,102,111,114,97,109,105,110,97,32,104,111,108,101,115,32,45,45,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,45,50,53,34,32,99,121,61,34,52,48,34,32,114,61,34,55,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,50,53,34,32,99,121,61,34,52,48,34,32,114,61,34,55,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,45,50,48,34,32,99,121,61,34,56,48,34,32,114,61,34,54,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,50,48,34,32,99,121,61,34,56,48,34,32,114,61,34,54,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,45,49,54,34,32,99,121,61,34,49,50,48,34,32,114,61,34,53,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,49,54,34,32,99,121,61,34,49,50,48,34,32,114,61,34,53,34,32,102,105,108,108,61,34,35,49,50,49,100,50,97,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,55,48,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,51,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,83,49,32,40,83,97,99,114,111,41,60,47,116,101,120,116,62,10,10,32,32,32,32,32,32,60,33,45,45,32,73,108,105,97,99,32,87,105,110,103,115,32,40,80,101,108,118,105,115,41,32,45,45,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,45,57,48,44,49,48,32,81,32,45,50,52,48,44,45,52,48,32,45,51,48,48,44,54,48,32,81,32,45,51,50,48,44,49,56,48,32,45,50,52,48,44,50,52,48,32,81,32,45,49,55,48,44,50,54,48,32,45,55,53,44,49,56,48,32,90,34,32,102,105,108,108,61,34,117,114,108,40,35,112,101,108,118,105,115,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,112,97,116,104,32,100,61,34,77,32,57,48,44,49,48,32,81,32,50,52,48,44,45,52,48,32,51,48,48,44,54,48,32,81,32,51,50,48,44,49,56,48,32,50,52,48,44,50,52,48,32,81,32,49,55,48,44,50,54,48,32,55,53,44,49,56,48,32,90,34,32,102,105,108,108,61,34,117,114,108,40,35,112,101,108,118,105,115,71,114,97,100,41,34,32,111,112,97,99,105,116,121,61,34,48,46,55,53,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,45,50,54,48,34,32,121,61,34,49,48,48,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,62,80,97,108,97,32,73,108,195,173,97,99,97,32,73,122,113,46,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,56,48,34,32,121,61,34,49,48,48,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,102,97,109,105,108,121,61,34,65,114,105,97,108,34,32,102,111,110,116,45,115,105,122,101,61,34,49,50,34,62,80,97,108,97,32,73,108,195,173,97,99,97,32,68,101,114,46,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,32,32,60,47,103,62,10,10,32,32,60,33,45,45,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,82,65,68,73,79,76,79,71,73,83,84,32,68,73,65,71,78,79,83,84,73,67,32,67,65,76,76,79,85,84,83,32,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,32,45,45,62,10,32,32,60,103,32,102,111,110,116,45,102,97,109,105,108,121,61,34,72,101,108,118,101,116,105,99,97,44,32,65,114,105,97,108,44,32,115,97,110,115,45,115,101,114,105,102,34,62,10,32,32,32,32,60,33,45,45,32,67,97,108,108,111,117,116,32,111,110,32,76,52,45,76,53,32,78,97,114,114,111,119,105,110,103,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,50,52,48,44,32,54,48,56,41,34,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,48,34,32,121,49,61,34,48,34,32,120,50,61,34,49,55,53,34,32,121,50,61,34,48,34,32,115,116,114,111,107,101,61,34,35,102,102,53,50,53,50,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,32,115,116,114,111,107,101,45,100,97,115,104,97,114,114,97,121,61,34,52,44,50,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,49,55,53,34,32,99,121,61,34,48,34,32,114,61,34,52,34,32,102,105,108,108,61,34,35,102,102,53,50,53,50,34,47,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,45,50,49,48,34,32,121,61,34,45,51,53,34,32,119,105,100,116,104,61,34,50,48,48,34,32,104,101,105,103,104,116,61,34,53,56,34,32,114,120,61,34,54,34,32,102,105,108,108,61,34,35,49,99,49,48,49,53,34,32,115,116,114,111,107,101,61,34,35,102,102,53,50,53,50,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,53,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,45,50,48,48,34,32,121,61,34,45,49,56,34,32,102,105,108,108,61,34,35,102,102,53,50,53,50,34,32,102,111,110,116,45,115,105,122,101,61,34,49,49,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,72,65,76,76,65,90,71,79,32,82,65,68,73,79,76,195,147,71,73,67,79,58,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,45,50,48,48,34,32,121,61,34,45,50,34,32,102,105,108,108,61,34,35,102,102,102,102,102,102,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,62,80,105,110,122,97,109,105,101,110,116,111,32,100,105,115,99,97,108,32,76,52,45,76,53,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,45,50,48,48,34,32,121,61,34,49,51,34,32,102,105,108,108,61,34,35,102,102,99,100,100,50,34,32,102,111,110,116,45,115,105,122,101,61,34,57,34,62,69,115,112,97,99,105,111,32,105,110,116,101,114,115,111,109,195,161,116,105,99,111,32,100,105,115,109,105,110,117,105,100,111,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,67,97,108,108,111,117,116,32,111,110,32,65,108,105,103,110,109,101,110,116,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,55,54,48,44,32,52,52,48,41,34,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,48,34,32,121,49,61,34,48,34,32,120,50,61,34,45,49,55,48,34,32,121,50,61,34,48,34,32,115,116,114,111,107,101,61,34,35,52,102,99,51,102,55,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,53,34,32,115,116,114,111,107,101,45,100,97,115,104,97,114,114,97,121,61,34,51,44,50,34,47,62,10,32,32,32,32,32,32,60,99,105,114,99,108,101,32,99,120,61,34,45,49,55,48,34,32,99,121,61,34,48,34,32,114,61,34,51,46,53,34,32,102,105,108,108,61,34,35,52,102,99,51,102,55,34,47,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,48,34,32,121,61,34,45,50,53,34,32,119,105,100,116,104,61,34,49,56,48,34,32,104,101,105,103,104,116,61,34,52,54,34,32,114,120,61,34,53,34,32,102,105,108,108,61,34,35,48,100,49,97,50,57,34,32,115,116,114,111,107,101,61,34,35,52,102,99,51,102,55,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,50,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,48,34,32,121,61,34,45,56,34,32,102,105,108,108,61,34,35,52,102,99,51,102,55,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,69,74,69,32,82,65,81,85,195,141,68,69,79,58,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,49,48,34,32,121,61,34,57,34,32,102,105,108,108,61,34,35,101,49,102,53,102,101,34,32,102,111,110,116,45,115,105,122,101,61,34,57,46,53,34,62,65,108,105,110,101,97,99,105,195,179,110,32,99,111,114,111,110,97,108,32,99,111,110,115,101,114,118,97,100,97,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,67,97,108,105,98,114,97,116,105,111,110,32,47,32,83,99,97,108,101,32,114,117,108,101,114,32,45,45,62,10,32,32,32,32,60,103,32,116,114,97,110,115,102,111,114,109,61,34,116,114,97,110,115,108,97,116,101,40,54,48,44,32,57,50,48,41,34,62,10,32,32,32,32,32,32,60,114,101,99,116,32,120,61,34,48,34,32,121,61,34,48,34,32,119,105,100,116,104,61,34,51,48,34,32,104,101,105,103,104,116,61,34,49,53,48,34,32,102,105,108,108,61,34,35,48,56,49,48,49,97,34,32,115,116,114,111,107,101,61,34,35,50,50,51,54,52,102,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,49,48,34,32,120,50,61,34,49,56,34,32,121,50,61,34,49,48,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,51,53,34,32,120,50,61,34,50,52,34,32,121,50,61,34,51,53,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,54,48,34,32,120,50,61,34,49,56,34,32,121,50,61,34,54,48,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,56,53,34,32,120,50,61,34,50,52,34,32,121,50,61,34,56,53,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,49,49,48,34,32,120,50,61,34,49,56,34,32,121,50,61,34,49,49,48,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,47,62,10,32,32,32,32,32,32,60,108,105,110,101,32,120,49,61,34,51,48,34,32,121,49,61,34,49,51,53,34,32,120,50,61,34,49,56,34,32,121,50,61,34,49,51,53,34,32,115,116,114,111,107,101,61,34,35,57,48,99,97,102,57,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,50,34,47,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,52,48,34,32,121,61,34,49,53,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,62,48,32,99,109,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,52,48,34,32,121,61,34,54,53,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,62,53,32,99,109,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,52,48,34,32,121,61,34,49,49,53,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,62,49,48,32,99,109,60,47,116,101,120,116,62,10,32,32,32,32,32,32,60,116,101,120,116,32,120,61,34,52,48,34,32,121,61,34,49,52,48,34,32,102,105,108,108,61,34,35,57,48,99,97,102,57,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,62,49,50,32,99,109,60,47,116,101,120,116,62,10,32,32,32,32,60,47,103,62,10,10,32,32,32,32,60,33,45,45,32,84,101,99,104,110,105,99,97,108,32,68,105,97,103,110,111,115,116,105,99,32,70,111,111,116,101,114,32,47,32,83,116,97,109,112,32,45,45,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,52,48,34,32,121,61,34,49,49,48,53,34,32,119,105,100,116,104,61,34,57,50,48,34,32,104,101,105,103,104,116,61,34,54,53,34,32,114,120,61,34,54,34,32,102,105,108,108,61,34,35,48,97,49,50,49,99,34,32,115,116,114,111,107,101,61,34,35,50,50,51,54,52,102,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,46,53,34,47,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,49,49,51,48,34,32,102,105,108,108,61,34,35,98,48,98,101,99,53,34,32,102,111,110,116,45,115,105,122,101,61,34,49,49,34,62,73,78,70,79,82,77,69,32,68,69,32,65,68,81,85,73,83,73,67,73,195,147,78,58,32,67,97,108,105,100,97,100,32,100,105,97,103,110,195,179,115,116,105,99,97,32,195,179,112,116,105,109,97,46,32,68,111,115,105,115,32,97,99,117,109,117,108,97,100,97,32,68,65,80,58,32,49,46,52,50,32,71,121,194,183,99,109,194,178,46,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,54,53,34,32,121,61,34,49,49,53,48,34,32,102,105,108,108,61,34,35,56,49,100,52,102,97,34,32,102,111,110,116,45,115,105,122,101,61,34,49,49,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,67,79,78,67,76,85,83,73,195,147,78,58,32,83,105,103,110,111,115,32,114,97,100,105,111,108,195,179,103,105,99,111,115,32,100,101,32,100,105,115,99,111,112,97,116,195,173,97,32,100,101,103,101,110,101,114,97,116,105,118,97,32,47,32,112,105,110,122,97,109,105,101,110,116,111,32,115,105,110,116,111,109,195,161,116,105,99,111,32,76,52,45,76,53,32,115,105,110,32,101,118,105,100,101,110,99,105,97,32,100,101,32,108,105,115,105,115,32,110,105,32,108,105,115,116,101,115,105,115,46,60,47,116,101,120,116,62,10,32,32,32,32,60,114,101,99,116,32,120,61,34,55,54,48,34,32,121,61,34,49,49,49,53,34,32,119,105,100,116,104,61,34,49,56,53,34,32,104,101,105,103,104,116,61,34,52,53,34,32,114,120,61,34,52,34,32,102,105,108,108,61,34,35,48,102,50,49,51,55,34,32,115,116,114,111,107,101,61,34,35,48,48,101,54,55,54,34,32,115,116,114,111,107,101,45,119,105,100,116,104,61,34,49,34,47,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,55,55,53,34,32,121,61,34,49,49,51,51,34,32,102,105,108,108,61,34,35,48,48,101,54,55,54,34,32,102,111,110,116,45,115,105,122,101,61,34,49,48,34,32,102,111,110,116,45,119,101,105,103,104,116,61,34,98,111,108,100,34,62,226,156,147,32,86,65,76,73,68,65,68,79,32,82,65,68,73,79,76,79,71,195,141,65,60,47,116,101,120,116,62,10,32,32,32,32,60,116,101,120,116,32,120,61,34,55,55,53,34,32,121,61,34,49,49,52,56,34,32,102,105,108,108,61,34,35,98,57,102,54,99,97,34,32,102,111,110,116,45,115,105,122,101,61,34,57,34,62,70,105,114,109,97,32,69,108,101,99,116,114,195,179,110,105,99,97,32,77,195,169,100,105,99,97,60,47,116,101,120,116,62,10,32,32,60,47,103,62,10,60,47,115,118,103,62]}', 'image/svg+xml', NULL, NULL, NULL, NULL, '50.00', 'unpaid', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:07:34.493Z', '2026-08-31T08:07:34.493Z');
INSERT INTO "appointments" ("id", "contactId", "service", "serviceId", "calendarId", "startsAt", "endsAt", "status", "agentKey", "modality", "reason", "notes", "responseDocument", "doctorReportPdf", "doctorReportPdfName", "doctorReportPdfMime", "doctorReportPdfSize", "patientAttachmentData", "patientAttachmentName", "patientAttachmentMime", "patientAttachmentSize", "patientAttachmentUploadedAt", "aiAnalysisType", "aiAnalysisResult", "aiAnalysisDate", "aiCroppedImageData", "aiCroppedImageMime", "calBookingId", "calBookingUid", "calMeetingUrl", "calStatus", "price", "paymentStatus", "stripeSessionId", "stripePaymentIntentId", "paymentUrl", "paidAt", "acceptedAt", "acceptedBy", "cancelledAt", "cancelledBy", "cancellationReason", "createdAt", "updatedAt") VALUES ('ecc5938c-45a5-4ff0-9bc3-5e3e72e05d73', '72252232-2360-4131-b464-3b44b5f362c4', 'Consulta Médica y Diagnóstico Clínico', 'b4605f40-f93f-4956-b108-754763fee5f2', 'cal-medica', '2026-08-30T08:00:00.000Z', '2026-08-30T08:45:00.000Z', 'completed', NULL, 'in_person', 'Revisión dorsolumbar y contractura persistente', 'Diagnóstico emitido y firmado por el Dr. Carlos Mendoza.', '{"notes":"Reevaluación en 7 días si persiste sintomatología dolorosa.","title":"Informe Clínico y Diagnóstico Lumbar","issuedAt":"2026-08-30T08:45:00.000Z","signedBy":"Dr. Carlos Mendoza (Colegiado Nº 28491)","symptoms":"Paciente varón de 42 años refiere dolor punzante en zona lumbar L4-L5 de 5 días de evolución.","diagnosis":"Lumbalgia mecánica aguda con contractura muscular paravertebral bilateral sin compromiso radicular.","treatment":"Reposo relativo 48h, calor seco local 20 min 3 veces al día, y 3 sesiones de fisioterapia descontracturante.","templateKey":"clinical_diagnosis","recommendations":"Evitar sobrecargas y sedestación prolongada. Realizar estiramientos suaves de cadena posterior."}'::jsonb, '{"type":"Buffer","data":[37,80,68,70,45,49,46,51,10,37,255,255,255,255,10,55,32,48,32,111,98,106,10,60,60,10,47,84,121,112,101,32,47,80,97,103,101,10,47,80,97,114,101,110,116,32,49,32,48,32,82,10,47,77,101,100,105,97,66,111,120,32,91,48,32,48,32,53,57,53,46,50,56,32,56,52,49,46,56,57,93,10,47,67,111,110,116,101,110,116,115,32,53,32,48,32,82,10,47,82,101,115,111,117,114,99,101,115,32,54,32,48,32,82,10,47,85,115,101,114,85,110,105,116,32,49,10,62,62,10,101,110,100,111,98,106,10,54,32,48,32,111,98,106,10,60,60,10,47,80,114,111,99,83,101,116,32,91,47,80,68,70,32,47,84,101,120,116,32,47,73,109,97,103,101,66,32,47,73,109,97,103,101,67,32,47,73,109,97,103,101,73,93,10,47,70,111,110,116,32,60,60,10,47,70,50,32,56,32,48,32,82,10,47,70,49,32,57,32,48,32,82,10,62,62,10,47,67,111,108,111,114,83,112,97,99,101,32,60,60,10,62,62,10,62,62,10,101,110,100,111,98,106,10,53,32,48,32,111,98,106,10,60,60,10,47,76,101,110,103,116,104,32,49,55,49,48,10,47,70,105,108,116,101,114,32,47,70,108,97,116,101,68,101,99,111,100,101,10,62,62,10,115,116,114,101,97,109,10,120,156,221,89,203,170,36,199,17,221,247,87,228,15,76,41,222,81,9,151,94,72,178,12,94,24,236,185,59,227,197,85,61,192,11,25,100,129,244,251,34,34,179,170,187,186,123,46,146,65,211,98,6,6,186,171,178,179,42,34,79,156,115,34,46,22,40,80,62,96,129,50,10,14,99,45,211,15,39,209,34,90,20,180,168,150,255,45,167,175,190,93,126,254,207,180,252,243,175,95,151,233,167,19,12,85,169,10,162,155,56,232,56,82,137,75,54,26,185,40,212,17,184,114,92,218,110,115,46,167,242,211,244,223,211,122,183,25,93,253,140,80,189,192,64,88,13,124,20,70,118,82,169,5,6,143,123,151,71,228,94,63,158,240,209,219,127,253,218,175,99,49,40,238,58,8,80,121,253,225,244,213,119,84,208,202,235,122,250,215,139,176,168,44,42,74,231,66,80,94,100,37,144,121,170,34,82,133,227,219,185,96,220,208,74,32,44,211,52,203,146,183,144,64,68,148,64,89,80,38,85,145,115,129,127,151,215,191,157,254,242,122,250,199,125,124,135,84,177,74,129,129,111,254,197,165,61,81,109,177,255,142,16,13,6,161,177,133,136,165,246,8,69,86,97,85,153,91,164,231,34,91,156,171,88,134,82,35,128,45,156,136,90,22,141,95,76,231,130,24,177,75,79,66,4,125,46,117,75,71,228,8,207,133,227,142,203,50,179,178,238,121,59,36,107,125,102,106,216,121,0,167,226,134,3,138,109,249,25,123,126,212,71,7,83,19,171,198,86,87,182,133,223,206,69,161,188,16,48,51,16,152,152,18,24,154,219,234,236,98,235,118,141,137,227,191,197,93,2,155,12,157,9,24,25,248,141,133,245,16,183,104,65,108,5,101,89,80,88,126,185,78,198,55,31,79,48,140,91,5,116,148,71,5,93,149,15,186,229,165,67,25,0,151,143,223,252,253,244,241,46,179,120,179,44,74,8,15,53,5,148,133,118,91,182,191,45,179,170,197,17,7,199,189,172,96,3,93,135,25,118,184,236,176,83,110,64,11,192,105,20,23,244,101,121,59,176,152,40,13,36,30,43,239,10,148,219,142,181,255,244,121,208,82,45,86,229,65,213,69,104,17,145,97,96,202,212,22,23,211,192,213,59,47,251,7,159,22,194,205,219,210,206,17,108,232,100,83,160,155,64,201,213,170,191,255,174,159,33,177,62,62,162,51,182,53,147,137,150,133,248,39,72,233,195,247,164,239,153,89,216,24,25,147,36,146,74,152,8,8,106,144,73,166,252,92,62,160,150,151,150,249,115,137,207,180,236,151,219,49,8,152,54,146,245,209,208,102,15,154,209,109,177,69,62,230,167,210,43,194,167,138,128,77,51,152,124,121,107,252,250,236,35,99,131,79,87,65,64,139,93,109,10,128,133,19,88,106,215,5,36,240,212,60,171,134,65,91,229,197,220,150,149,83,15,98,69,106,158,77,203,108,75,251,254,244,67,121,92,64,214,192,100,106,108,99,70,201,86,35,222,63,193,185,60,124,227,212,224,149,129,71,90,55,189,189,211,213,218,116,149,224,161,81,245,163,7,13,1,61,170,108,187,116,137,4,171,125,194,167,254,241,146,106,172,15,208,201,72,75,211,148,192,101,56,42,73,25,148,170,214,220,74,186,174,7,30,238,40,151,4,20,235,80,22,65,9,127,166,202,82,149,159,121,246,17,52,202,0,86,247,163,31,244,61,33,37,112,59,23,10,234,68,167,176,108,187,33,147,224,88,195,21,155,152,57,153,90,80,143,198,167,92,181,38,221,18,129,131,199,126,111,134,219,174,177,63,65,72,95,210,242,106,75,179,117,174,54,27,197,179,8,100,98,161,89,38,214,253,153,249,105,153,155,249,235,102,113,227,236,237,61,215,220,165,27,204,56,202,35,128,73,198,161,142,244,30,136,239,217,161,54,164,238,231,80,240,9,205,149,106,209,17,7,217,156,245,5,177,116,133,216,55,213,222,107,220,245,6,29,145,189,155,208,7,221,196,147,177,169,6,3,140,190,135,183,97,83,118,92,216,100,30,194,64,96,115,16,235,130,93,4,226,202,46,23,30,77,6,166,246,175,137,216,238,101,156,154,155,241,192,104,238,209,154,81,87,103,75,57,106,200,115,72,155,134,13,157,110,93,93,115,169,152,26,229,70,19,129,145,213,252,145,36,236,243,154,71,249,108,15,157,29,188,119,188,241,205,170,167,126,229,218,84,179,237,161,231,104,44,95,238,225,202,192,3,141,254,197,112,174,146,15,40,120,139,96,190,32,184,183,42,49,42,184,238,106,26,169,202,188,53,46,151,246,250,170,125,81,80,74,158,101,37,169,26,248,175,51,203,114,152,53,188,223,200,124,134,20,128,14,62,210,61,3,147,169,67,176,105,135,136,118,104,213,11,183,37,239,142,54,210,212,156,237,206,176,156,54,99,205,214,120,109,119,90,211,156,149,146,128,100,190,98,243,88,173,201,162,13,200,201,170,177,107,152,175,92,153,247,195,70,218,210,87,54,190,181,4,113,181,181,129,190,215,28,58,244,186,148,252,221,94,113,219,253,173,238,246,239,169,4,155,187,190,131,189,250,64,86,191,24,216,139,243,128,90,111,97,47,23,216,31,122,244,224,102,213,11,236,163,153,191,134,57,137,166,245,200,81,211,245,12,96,111,238,215,102,56,158,12,117,81,28,198,59,160,139,70,143,18,78,184,67,119,77,70,213,214,170,153,55,121,15,32,38,172,19,80,173,17,237,162,30,134,130,154,189,176,37,214,39,221,47,157,67,33,10,41,75,163,134,229,136,103,244,29,234,21,252,230,221,228,52,251,18,76,140,93,14,246,34,185,130,61,231,83,180,25,149,86,166,91,1,180,214,50,42,130,250,56,235,14,207,130,56,144,226,151,131,103,172,3,186,223,226,89,175,140,200,42,164,44,170,61,39,97,158,199,79,160,244,118,226,251,116,220,114,245,97,196,123,228,38,178,110,13,39,166,225,188,66,103,51,183,236,215,102,53,40,51,113,163,78,241,185,161,103,115,11,129,66,155,147,236,27,170,61,233,248,202,68,167,44,224,13,176,24,160,152,64,33,133,32,138,207,49,232,252,12,237,52,142,227,163,241,177,181,242,253,144,57,159,183,57,65,140,62,108,138,28,181,74,13,49,147,222,167,165,232,244,25,195,173,140,166,216,114,212,113,76,34,12,109,115,105,57,242,121,98,119,30,9,208,250,112,212,123,237,18,123,145,29,230,137,50,39,63,5,163,189,69,126,104,204,73,203,100,218,76,179,229,60,93,150,239,223,210,26,140,44,92,25,169,62,123,126,130,98,67,16,99,63,112,223,117,226,193,219,103,7,211,78,46,155,188,206,243,220,230,72,255,247,169,194,125,147,166,199,136,130,125,143,153,160,250,123,98,164,241,18,35,93,98,36,199,212,246,241,64,145,50,73,189,200,122,252,101,233,56,165,55,169,74,50,111,183,210,216,186,212,43,159,60,109,127,134,146,247,3,183,67,72,113,146,198,55,221,41,12,7,36,19,218,111,140,187,210,160,134,128,197,108,24,77,246,243,221,93,64,231,192,96,64,219,166,101,235,117,145,107,147,238,173,131,203,249,66,19,225,126,244,141,4,54,183,217,36,189,79,31,112,147,118,219,136,182,17,181,108,246,33,91,57,207,29,155,5,128,230,165,27,137,40,137,43,136,116,200,77,178,230,183,89,92,36,142,198,123,33,54,203,113,248,227,86,2,245,184,219,133,242,27,117,217,101,224,153,109,122,156,230,13,185,255,10,28,29,132,214,10,101,110,100,115,116,114,101,97,109,10,101,110,100,111,98,106,10,49,49,32,48,32,111,98,106,10,40,80,68,70,75,105,116,41,10,101,110,100,111,98,106,10,49,50,32,48,32,111,98,106,10,40,80,68,70,75,105,116,41,10,101,110,100,111,98,106,10,49,51,32,48,32,111,98,106,10,40,68,58,50,48,50,54,48,56,51,49,48,56,48,55,51,52,90,41,10,101,110,100,111,98,106,10,49,52,32,48,32,111,98,106,10,40,254,255,0,73,0,110,0,102,0,111,0,114,0,109,0,101,0,32,0,67,0,108,0,237,0,110,0,105,0,99,0,111,0,32,0,121,0,32,0,68,0,105,0,97,0,103,0,110,0,243,0,115,0,116,0,105,0,99,0,111,0,32,0,76,0,117,0,109,0,98,0,97,0,114,41,10,101,110,100,111,98,106,10,49,53,32,48,32,111,98,106,10,40,254,255,0,68,0,114,0,46,0,32,0,67,0,97,0,114,0,108,0,111,0,115,0,32,0,77,0,101,0,110,0,100,0,111,0,122,0,97,0,32,0,92,40,0,67,0,111,0,108,0,101,0,103,0,105,0,97,0,100,0,111,0,32,0,78,0,186,0,32,0,50,0,56,0,52,0,57,0,49,0,92,41,41,10,101,110,100,111,98,106,10,49,54,32,48,32,111,98,106,10,40,254,255,0,68,0,105,0,97,0,103,0,110,0,243,0,115,0,116,0,105,0,99,0,111,0,32,0,100,0,101,0,32,0,67,0,97,0,114,0,108,0,111,0,115,0,32,0,82,0,117,0,105,0,122,41,10,101,110,100,111,98,106,10,49,48,32,48,32,111,98,106,10,60,60,10,47,80,114,111,100,117,99,101,114,32,49,49,32,48,32,82,10,47,67,114,101,97,116,111,114,32,49,50,32,48,32,82,10,47,67,114,101,97,116,105,111,110,68,97,116,101,32,49,51,32,48,32,82,10,47,84,105,116,108,101,32,49,52,32,48,32,82,10,47,65,117,116,104,111,114,32,49,53,32,48,32,82,10,47,83,117,98,106,101,99,116,32,49,54,32,48,32,82,10,62,62,10,101,110,100,111,98,106,10,57,32,48,32,111,98,106,10,60,60,10,47,84,121,112,101,32,47,70,111,110,116,10,47,66,97,115,101,70,111,110,116,32,47,72,101,108,118,101,116,105,99,97,10,47,83,117,98,116,121,112,101,32,47,84,121,112,101,49,10,47,69,110,99,111,100,105,110,103,32,47,87,105,110,65,110,115,105,69,110,99,111,100,105,110,103,10,62,62,10,101,110,100,111,98,106,10,56,32,48,32,111,98,106,10,60,60,10,47,84,121,112,101,32,47,70,111,110,116,10,47,66,97,115,101,70,111,110,116,32,47,72,101,108,118,101,116,105,99,97,45,66,111,108,100,10,47,83,117,98,116,121,112,101,32,47,84,121,112,101,49,10,47,69,110,99,111,100,105,110,103,32,47,87,105,110,65,110,115,105,69,110,99,111,100,105,110,103,10,62,62,10,101,110,100,111,98,106,10,52,32,48,32,111,98,106,10,60,60,10,62,62,10,101,110,100,111,98,106,10,51,32,48,32,111,98,106,10,60,60,10,47,84,121,112,101,32,47,67,97,116,97,108,111,103,10,47,80,97,103,101,115,32,49,32,48,32,82,10,47,78,97,109,101,115,32,50,32,48,32,82,10,62,62,10,101,110,100,111,98,106,10,49,32,48,32,111,98,106,10,60,60,10,47,84,121,112,101,32,47,80,97,103,101,115,10,47,67,111,117,110,116,32,49,10,47,75,105,100,115,32,91,55,32,48,32,82,93,10,62,62,10,101,110,100,111,98,106,10,50,32,48,32,111,98,106,10,60,60,10,47,68,101,115,116,115,32,60,60,10,32,32,47,78,97,109,101,115,32,91,10,93,10,62,62,10,62,62,10,101,110,100,111,98,106,10,120,114,101,102,10,48,32,49,55,10,48,48,48,48,48,48,48,48,48,48,32,54,53,53,51,53,32,102,32,10,48,48,48,48,48,48,50,55,57,51,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,56,53,48,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,55,51,49,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,55,49,48,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,48,50,53,52,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,48,49,51,55,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,48,48,49,53,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,54,48,56,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,53,49,49,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,51,57,48,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,48,51,55,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,48,54,50,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,48,56,55,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,49,50,51,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,50,49,54,32,48,48,48,48,48,32,110,32,10,48,48,48,48,48,48,50,51,49,55,32,48,48,48,48,48,32,110,32,10,116,114,97,105,108,101,114,10,60,60,10,47,83,105,122,101,32,49,55,10,47,82,111,111,116,32,51,32,48,32,82,10,47,73,110,102,111,32,49,48,32,48,32,82,10,47,73,68,32,91,60,101,54,52,100,102,100,101,56,57,57,49,101,97,53,48,49,97,48,102,99,99,57,54,55,57,97,50,101,57,97,55,50,62,32,60,101,54,52,100,102,100,101,56,57,57,49,101,97,53,48,49,97,48,102,99,99,57,54,55,57,97,50,101,57,97,55,50,62,93,10,62,62,10,115,116,97,114,116,120,114,101,102,10,50,56,57,55,10,37,37,69,79,70,10]}', 'informe-carlos-ruiz-diagnostico.pdf', 'application/pdf', 3392, NULL, NULL, NULL, NULL, NULL, 'general', 'DICTAMEN CLÍNICO GENERAL IA (analizaia)
Valoración: Contractura paravertebral refleja bilateral con rango articular lumbar limitado por dolor mecánico.
Recomendación IA: Fisioterapia descontracturante y reposo postural relativo.', '2026-08-30T08:45:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL, '50.00', 'unpaid', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:07:34.493Z', '2026-08-31T08:07:34.493Z');
INSERT INTO "appointments" ("id", "contactId", "service", "serviceId", "calendarId", "startsAt", "endsAt", "status", "agentKey", "modality", "reason", "notes", "responseDocument", "doctorReportPdf", "doctorReportPdfName", "doctorReportPdfMime", "doctorReportPdfSize", "patientAttachmentData", "patientAttachmentName", "patientAttachmentMime", "patientAttachmentSize", "patientAttachmentUploadedAt", "aiAnalysisType", "aiAnalysisResult", "aiAnalysisDate", "aiCroppedImageData", "aiCroppedImageMime", "calBookingId", "calBookingUid", "calMeetingUrl", "calStatus", "price", "paymentStatus", "stripeSessionId", "stripePaymentIntentId", "paymentUrl", "paidAt", "acceptedAt", "acceptedBy", "cancelledAt", "cancelledBy", "cancellationReason", "createdAt", "updatedAt") VALUES ('a81bda5d-1065-4fb5-9a24-bd171c855e4a', 'ffee405a-09a7-4481-a40e-c2f7c66c6813', 'Fisioterapia y Rehabilitación Postural', 'ad21ef46-06b1-4fb3-81e8-42b6b6180b4d', 'cal-fisio', '2026-09-01T10:00:00.000Z', '2026-09-01T11:00:00.000Z', 'pending_approval', NULL, 'virtual', 'Evaluación de contractura cervical y mareos posturales', 'Solicitud de sesión online para pautas posturales.', NULL, NULL, NULL, 'application/pdf', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '45.00', 'unpaid', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:07:34.493Z', '2026-08-31T08:07:34.493Z');

-- ==========================================
-- Datos: audit_logs (10 registros)
-- ==========================================
INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "action", "targetType", "targetId", "summary", "ip", "metadata", "createdAt") VALUES ('be656de0-92dc-4c8e-b052-adf866060e58', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'admin@crmsalvadora.local', 'auth.login', 'user', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'Inició sesión (admin@crmsalvadora.local)', '::1', NULL, '2026-08-29T12:41:29.018Z');
INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "action", "targetType", "targetId", "summary", "ip", "metadata", "createdAt") VALUES ('c33ebb59-d62b-4933-9279-41a42c766ff9', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'admin@crmsalvadora.local', 'onboarding.complete', 'settings', NULL, 'Completó el onboarding (negocio "Centro de Yoga Salvadora Conesa", preset "yoga_wellness")', '::1', NULL, '2026-08-29T12:41:56.305Z');
INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "action", "targetType", "targetId", "summary", "ip", "metadata", "createdAt") VALUES ('150f98ff-5ad6-48c9-b3a1-1bdf2aedc88e', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'admin@crmsalvadora.local', 'auth.login', 'user', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'Inició sesión (admin@crmsalvadora.local)', '::1', NULL, '2026-08-29T12:47:33.717Z');
INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "action", "targetType", "targetId", "summary", "ip", "metadata", "createdAt") VALUES ('d8a6b450-1183-4209-8f27-0d87db00825d', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'admin@crmsalvadora.local', 'auth.login', 'user', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'Inició sesión (admin@crmsalvadora.local)', '::1', NULL, '2026-08-29T20:27:45.111Z');
INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "action", "targetType", "targetId", "summary", "ip", "metadata", "createdAt") VALUES ('6c24edb6-bd6d-4c14-8948-dd1fb6da035b', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'admin@crmsalvadora.local', 'auth.login', 'user', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'Inició sesión (admin@crmsalvadora.local)', '::1', NULL, '2026-08-30T11:09:40.402Z');
INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "action", "targetType", "targetId", "summary", "ip", "metadata", "createdAt") VALUES ('45e59284-114e-4f2f-b06a-542fa3a6c5c9', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'admin@crmsalvadora.local', 'auth.login', 'user', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'Inició sesión (admin@crmsalvadora.local)', '::1', NULL, '2026-08-30T11:09:47.918Z');
INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "action", "targetType", "targetId", "summary", "ip", "metadata", "createdAt") VALUES ('9aab3edd-2e07-4663-981f-3850d1d6cabf', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'admin@crmsalvadora.local', 'auth.login', 'user', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'Inició sesión (admin@crmsalvadora.local)', '::1', NULL, '2026-08-30T11:09:56.505Z');
INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "action", "targetType", "targetId", "summary", "ip", "metadata", "createdAt") VALUES ('bc9a5956-07c7-4532-ab41-2705b1de4629', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'admin@crmsalvadora.local', 'auth.login', 'user', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'Inició sesión (admin@crmsalvadora.local)', '::1', NULL, '2026-08-30T11:10:04.651Z');
INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "action", "targetType", "targetId", "summary", "ip", "metadata", "createdAt") VALUES ('67196691-4b59-49aa-834b-e8f1ee5c2198', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'admin@crmsalvadora.local', 'auth.login', 'user', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'Inició sesión (admin@crmsalvadora.local)', '::1', NULL, '2026-08-30T11:10:12.568Z');
INSERT INTO "audit_logs" ("id", "actorId", "actorEmail", "action", "targetType", "targetId", "summary", "ip", "metadata", "createdAt") VALUES ('deab3c3d-1d4e-4285-9514-1a7f02af0e7d', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'admin@crmsalvadora.local', 'auth.login', 'user', '9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'Inició sesión (admin@crmsalvadora.local)', '::1', NULL, '2026-08-30T11:11:25.731Z');

-- ==========================================
-- Datos: calcom_account (1 registros)
-- ==========================================
INSERT INTO "calcom_account" ("id", "apiKey", "baseUrl", "enabled", "defaultEventTypeId", "createdAt", "updatedAt") VALUES ('ef6f9aa3-6a1e-4233-a05d-d70946f04e56', NULL, 'https://api.cal.com/v1', true, NULL, '2026-08-30T04:48:35.539Z', '2026-08-30T04:48:35.539Z');

-- ==========================================
-- Datos: calls (5 registros)
-- ==========================================
INSERT INTO "calls" ("id", "vapiCallId", "direction", "fromNumber", "toNumber", "status", "startedAt", "endedAt", "durationSeconds", "endedReason", "summary", "transcript", "messages", "recordingUrl", "costCents", "needsReview", "notes", "contactId", "createdAt", "updatedAt") VALUES ('a77dc10c-d85c-461a-8db3-e284b77ed0a4', 'demo-call-001', 'inbound', '+34611200303', '+34919933764', 'ended', '2026-08-31T06:07:34.508Z', '2026-08-31T06:08:58.508Z', 84, 'customer-ended-call', 'María Morales llamó solicitando cita de Fisioterapia y Rehabilitación Postural para tratamiento de lumbalgia. El asistente consultó la agenda en tiempo real, le ofreció huecos disponibles y formalizó la reserva para el jueves a las 17:30.', 'Asistente: Centro Holístico y Escuela de Yoga, le atiende el asistente virtual. ¿En qué puedo ayudarle?
Cliente: Hola, buenos días. Quería pedir cita para fisioterapia, tengo bastante dolor en la zona lumbar.
Asistente: Por supuesto María. Para Fisioterapia y Rehabilitación Postural dispongo de hueco el jueves a las 17:30 o el viernes a las 10:00. ¿Cuál prefiere?
Cliente: El jueves a las 17:30 me viene genial.
Asistente: Perfecto, queda confirmada su cita para el jueves a las 17:30. ¡Muchas gracias y que tenga buen día!
Cliente: Gracias a vosotros, hasta luego.', '[{"role":"assistant","message":"Centro Holístico y Escuela de Yoga, le atiende el asistente virtual. ¿En qué puedo ayudarle?"},{"role":"customer","message":"Hola, buenos días. Quería pedir cita para fisioterapia, tengo bastante dolor en la zona lumbar."},{"role":"tool","message":"consultar_huecos({\"servicio\":\"Fisioterapia\"}) -> Huecos disponibles: jueves a las 17:30, viernes a las 10:00"},{"role":"assistant","message":"Por supuesto María. Para Fisioterapia y Rehabilitación Postural dispongo de hueco el jueves a las 17:30 o el viernes a las 10:00. ¿Cuál prefiere?"},{"role":"customer","message":"El jueves a las 17:30 me viene genial."},{"role":"tool","message":"reservar_cita({\"servicio\":\"Fisioterapia\",\"inicioIso\":\"2026-08-27T17:30:00.000Z\"}) -> Cita confirmada"},{"role":"assistant","message":"Perfecto, queda confirmada su cita para el jueves a las 17:30. ¡Muchas gracias y que tenga buen día!"},{"role":"customer","message":"Gracias a vosotros, hasta luego."}]'::jsonb, 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3', 15, false, NULL, 'ffee405a-09a7-4481-a40e-c2f7c66c6813', '2026-08-31T08:07:34.509Z', '2026-08-31T08:07:34.509Z');
INSERT INTO "calls" ("id", "vapiCallId", "direction", "fromNumber", "toNumber", "status", "startedAt", "endedAt", "durationSeconds", "endedReason", "summary", "transcript", "messages", "recordingUrl", "costCents", "needsReview", "notes", "contactId", "createdAt", "updatedAt") VALUES ('080162d8-2577-463b-b78f-cd2a2d5e504c', 'demo-call-002', 'inbound', '+34611200306', '+34919933764', 'ended', '2026-08-31T03:07:34.508Z', '2026-08-31T03:08:36.508Z', 62, 'customer-ended-call', 'David Navarro consultó los horarios de las clases de Hatha Yoga Terapéutico y las tarifas mensuales. El asistente le detalló los grupos de lunes y miércoles y le invitó a una sesión de prueba.', 'Asistente: Hola, Centro Holístico. ¿En qué puedo orientarle hoy?
Cliente: Hola, quería saber qué horarios tenéis para las clases de yoga para principiantes y el precio.
Asistente: Hola David. El Hatha Yoga Terapéutico se imparte los lunes y miércoles de 18:00 a 19:30 y de 19:30 a 21:00. La cuota mensual es de 65 euros con 2 clases semanales. ¿Le gustaría reservar una sesión de prueba?
Cliente: Sí, lo consulto y os aviso. Muchas gracias.
Asistente: Un placer, estamos a su disposición.', '[{"role":"assistant","message":"Hola, Centro Holístico. ¿En qué puedo orientarle hoy?"},{"role":"customer","message":"Hola, quería saber qué horarios tenéis para las clases de yoga para principiantes y el precio."},{"role":"tool","message":"datos_del_negocio({\"tipo\":\"servicios_precios\"}) -> Hatha Yoga Terapéutico: 65€/mes"},{"role":"assistant","message":"Hola David. El Hatha Yoga Terapéutico se imparte los lunes y miércoles de 18:00 a 19:30 y de 19:30 a 21:00. La cuota mensual es de 65 euros con 2 clases semanales. ¿Le gustaría reservar una sesión de prueba?"},{"role":"customer","message":"Sí, lo consulto y os aviso. Muchas gracias."},{"role":"assistant","message":"Un placer, estamos a su disposición."}]'::jsonb, NULL, 11, false, NULL, '06a088b3-2672-46b8-8ab8-04de5f72f6b3', '2026-08-31T08:07:34.522Z', '2026-08-31T08:07:34.522Z');
INSERT INTO "calls" ("id", "vapiCallId", "direction", "fromNumber", "toNumber", "status", "startedAt", "endedAt", "durationSeconds", "endedReason", "summary", "transcript", "messages", "recordingUrl", "costCents", "needsReview", "notes", "contactId", "createdAt", "updatedAt") VALUES ('f67b8259-0ee8-4e51-8be2-053c06f6e0a3', 'demo-call-003', 'outbound', '+34919933764', '+34611200301', 'ended', '2026-08-30T14:07:34.508Z', '2026-08-30T14:08:22.508Z', 48, 'assistant-ended-call', 'Llamada automática saliente de recordatorio de cita médica programada para mañana a las 10:00 con el Dr. Carlos Mendoza. La paciente confirmó que acudirá con la radiografía solicitada.', 'Asistente: Hola Lucía, le llamo del Centro Holístico para recordarle su consulta médica de mañana a las 10:00 con el Dr. Carlos Mendoza. ¿Podrá acudir puntualmente?
Cliente: Sí, claro, allí estaré. Ya tengo lista la prueba que me pidió.
Asistente: Excelente Lucía, recuerde traerla consigo. Nos vemos mañana a las 10:00. ¡Que pase buen día!
Cliente: Muchas gracias, hasta mañana.', '[{"role":"assistant","message":"Hola Lucía, le llamo del Centro Holístico para recordarle su consulta médica de mañana a las 10:00 con el Dr. Carlos Mendoza. ¿Podrá acudir puntualmente?"},{"role":"customer","message":"Sí, claro, allí estaré. Ya tengo lista la prueba que me pidió."},{"role":"assistant","message":"Excelente Lucía, recuerde traerla consigo. Nos vemos mañana a las 10:00. ¡Que pase buen día!"},{"role":"customer","message":"Muchas gracias, hasta mañana."}]'::jsonb, NULL, 9, false, NULL, 'f46079df-3d2d-4a8e-ac9a-ef08975cde1a', '2026-08-31T08:07:34.534Z', '2026-08-31T08:07:34.534Z');
INSERT INTO "calls" ("id", "vapiCallId", "direction", "fromNumber", "toNumber", "status", "startedAt", "endedAt", "durationSeconds", "endedReason", "summary", "transcript", "messages", "recordingUrl", "costCents", "needsReview", "notes", "contactId", "createdAt", "updatedAt") VALUES ('3a0a5b97-f786-4c0f-986d-019513cd0ac1', 'demo-call-004', 'inbound', '+34611200302', '+34919933764', 'ended', '2026-08-30T04:07:34.508Z', '2026-08-30T04:09:06.508Z', 92, 'customer-ended-call', 'Carlos Ruiz llamó para reprogramar su sesión de Pilates del martes a las 11:00. El asistente consultó alternativas de tarde y reubicó la cita al viernes a las 18:00.', 'Asistente: Centro Holístico y Escuela de Yoga, ¿en qué puedo ayudarle?
Cliente: Hola, tenía cita de Pilates el martes por la mañana pero me ha surgido una reunión de trabajo. ¿Podría cambiarla a alguna tarde?
Asistente: Compruebo su cita Carlos. Tiene sesión el martes a las 11:00. Disponemos de hueco libre este viernes a las 18:00 o la próxima semana. ¿Le viene bien el viernes?
Cliente: Sí, el viernes a las 18:00 me va perfecto.
Asistente: Queda reprogramada su sesión para el viernes a las 18:00. Se ha actualizado su agenda.
Cliente: Mil gracias por la rapidez. Hasta el viernes.', '[{"role":"assistant","message":"Centro Holístico y Escuela de Yoga, ¿en qué puedo ayudarle?"},{"role":"customer","message":"Hola, tenía cita de Pilates el martes por la mañana pero me ha surgido una reunión de trabajo. ¿Podría cambiarla a alguna tarde?"},{"role":"tool","message":"reprogramar_cita({\"inicioIso\":\"2026-08-28T18:00:00.000Z\"}) -> Cita reprogramada con éxito"},{"role":"assistant","message":"Queda reprogramada su sesión para el viernes a las 18:00. Se ha actualizado su agenda."},{"role":"customer","message":"Mil gracias por la rapidez. Hasta el viernes."}]'::jsonb, NULL, 17, false, NULL, '72252232-2360-4131-b464-3b44b5f362c4', '2026-08-31T08:07:34.549Z', '2026-08-31T08:07:34.549Z');
INSERT INTO "calls" ("id", "vapiCallId", "direction", "fromNumber", "toNumber", "status", "startedAt", "endedAt", "durationSeconds", "endedReason", "summary", "transcript", "messages", "recordingUrl", "costCents", "needsReview", "notes", "contactId", "createdAt", "updatedAt") VALUES ('30261567-e6a0-4ee2-aa58-5a965303b648', 'demo-call-005', 'inbound', '+34611200307', '+34919933764', 'ended', '2026-08-29T21:07:34.508Z', '2026-08-29T21:09:29.508Z', 115, 'customer-ended-call', 'Elena Vega llamó con dudas clínicas específicas sobre la posología de su tratamiento y pidió hablar con un médico. El asistente registró la transferencia y dejó el aviso urgente para revisión del equipo.', 'Asistente: Buenos días, Centro Holístico. ¿En qué le puedo asistir?
Cliente: Hola, estuve en consulta médica hace dos días y tengo una duda urgente sobre las indicaciones del tratamiento que me dio el doctor. ¿Puedo hablar con él?
Asistente: Comprendo Elena. Tratándose de una duda médica sobre tratamiento prescrito, voy a transferir su aviso directamente al Dr. Mendoza para que revise su ficha y se comunique con usted lo antes posible.
Cliente: De acuerdo, por favor que me llame en cuanto pueda a este mismo teléfono.
Asistente: Queda anotado como prioritario. El equipo médico se pondrá en contacto con usted hoy mismo.', '[{"role":"assistant","message":"Buenos días, Centro Holístico. ¿En qué le puedo asistir?"},{"role":"customer","message":"Hola, estuve en consulta médica hace dos días y tengo una duda urgente sobre las indicaciones del tratamiento que me dio el doctor. ¿Puedo hablar con él?"},{"role":"tool","message":"registrar_handoff({\"motivo\":\"Duda urgente sobre tratamiento prescrito\"}) -> Aviso registrado para equipo médico"},{"role":"assistant","message":"Queda anotado como prioritario. El equipo médico se pondrá en contacto con usted hoy mismo."},{"role":"customer","message":"De acuerdo, muchas gracias."}]'::jsonb, NULL, 22, true, 'Paciente con dudas sobre medicación y diagnóstico. Se le indicó que el Dr. Mendoza contactará con ella esta tarde.', '6125982c-bb97-4373-99a4-b19f5d331e38', '2026-08-31T08:07:34.566Z', '2026-08-31T08:07:34.566Z');

-- ==========================================
-- Datos: contacts (12 registros)
-- ==========================================
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('f46079df-3d2d-4a8e-ac9a-ef08975cde1a', 'Lucía Fernández', '+34611200301', 'lucia.fernandez@example.com', 'Alumna regular de Vinyasa Yoga. Inscrita en el próximo Retiro de Ayuno Terapéutico.', 'active', 'booked', 0, '{"yoga","retiro","ayuno"}'::text[], NULL, NULL, false, NULL, NULL, '2026-08-29T12:38:23.916Z', '2026-08-29T12:38:23.916Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('72252232-2360-4131-b464-3b44b5f362c4', 'Carlos Ruiz', '+34611200302', 'carlos.ruiz@example.com', 'Asiste a baños de gong mensuales para aliviar estrés laboral. Prefiere sesiones de tarde.', 'active', 'booked', 0, '{"gong","relajacion"}'::text[], NULL, NULL, false, NULL, NULL, '2026-08-29T12:38:23.916Z', '2026-08-29T12:38:23.916Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('ffee405a-09a7-4481-a40e-c2f7c66c6813', 'María García', '+34611200303', 'maria.garcia@example.com', 'Interesada en el Encuentro de Mujeres. Pregunta por WhatsApp si ya se completó el quórum mínimo de 8 personas.', 'lead', 'qualified', 0, '{"mujeres","eventos"}'::text[], NULL, NULL, false, NULL, NULL, '2026-08-29T12:38:23.916Z', '2026-08-29T12:38:23.916Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('99097645-b12c-4915-96ff-b61361611f7a', 'Javier Moreno', '+34611200304', 'javier.moreno@example.com', 'Proceso de psicoterapia Gestalt en curso con la Dra. Elena Salgado. Sesión quincenal.', 'active', 'won', 0, '{"gestalt"}'::text[], NULL, NULL, false, NULL, NULL, '2026-08-29T12:38:23.916Z', '2026-08-29T12:38:23.916Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('1799c45a-f02c-4963-b556-62024948b5cc', 'Ana Martín', '+34611200305', 'ana.martin@example.com', 'Confirmada para la próxima Puja de Gong nocturna. Traerá su propio zafu y manta.', 'active', 'booked', 0, '{"gong","puja","sonoterapia"}'::text[], NULL, NULL, false, NULL, NULL, '2026-08-29T12:38:23.916Z', '2026-08-29T12:38:23.916Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('06a088b3-2672-46b8-8ab8-04de5f72f6b3', 'David López', '+34611200306', 'david.lopez@example.com', 'Solicitó información para constelar un conflicto familiar en el taller del sábado.', 'lead', 'contacted', 0, '{"constelaciones"}'::text[], NULL, NULL, false, NULL, NULL, '2026-08-29T12:38:23.916Z', '2026-08-29T12:38:23.916Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('6125982c-bb97-4373-99a4-b19f5d331e38', 'Elena Sánchez', '+34611200307', 'elena.sanchez@example.com', 'Miembro del centro desde 2023. Combina abono mensual de Yoga y Baños de Gong.', 'active', 'won', 0, '{"yoga","gong","vip"}'::text[], NULL, NULL, false, NULL, NULL, '2026-08-29T12:38:23.916Z', '2026-08-29T12:38:23.916Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('bc18f1d2-3b94-4782-a270-30222f3207f6', 'Pablo Díaz', '+34611200308', 'pablo.diaz@example.com', 'Preinscrito al Ayuno Terapéutico. Informado de que se confirmará definitivamente al llegar al cupo de 6 participantes.', 'lead', 'qualified', 0, '{"ayuno","retiro"}'::text[], NULL, NULL, false, NULL, NULL, '2026-08-29T12:38:23.916Z', '2026-08-29T12:38:23.916Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('d0c8a304-5e8b-4b69-97a1-b2e901b35c8f', 'Carmen Jiménez', '+34611200309', 'carmen.jimenez@example.com', 'Nueva interesada en el Círculo de Mujeres y clases de yoga restaurativo.', 'lead', 'new', 0, '{"mujeres","yoga-suave"}'::text[], NULL, NULL, false, NULL, NULL, '2026-08-29T12:38:23.916Z', '2026-08-29T12:38:23.916Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('dabc6006-31e3-46c5-b268-58ade9ea0728', 'Sergio Romero', '+34611200310', 'sergio.romero@example.com', 'Combina sesiones individuales de Gestalt con baños de gong de integración emocional.', 'active', 'booked', 0, '{"gestalt","gong"}'::text[], NULL, NULL, false, NULL, NULL, '2026-08-29T12:38:23.916Z', '2026-08-29T12:38:23.916Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('141cddbf-723b-49f9-913e-9876dc325ba4', 'jose ignacio gomez', '+34649453996', 'jigomez@hotmail.com', 'Interés web:  - Handoff solicitado desde la landing web para continuar por WhatsApp.', 'lead', 'new', 1788035739759, '{"lead_landing_web"}'::text[], 'web_widget_whatsapp', NULL, false, NULL, NULL, '2026-08-29T20:35:39.760Z', '2026-08-29T20:35:39.776Z');
INSERT INTO "contacts" ("id", "name", "phone", "email", "notes", "status", "pipelineStage", "boardPosition", "tags", "source", "customFields", "optedOut", "optedOutAt", "anonymizedAt", "createdAt", "updatedAt") VALUES ('e2841ed4-5924-4ace-816e-b1ef096c0834', 'Usuario Playground', '+34600000000', NULL, NULL, 'lead', 'new', 1788065529065, '{}'::text[], 'manual', NULL, false, NULL, NULL, '2026-08-30T04:52:09.066Z', '2026-08-30T04:52:09.066Z');

-- ==========================================
-- Datos: conversations (2 registros)
-- ==========================================
INSERT INTO "conversations" ("threadId", "agentKey", "contactId", "channel", "handoff", "unreadCount", "lastMessageAt", "lastInboundAt", "lastMessageBody", "lastMessageDirection", "messageCount", "createdAt", "updatedAt") VALUES ('booking:widget-sess_ocppapl', 'booking', NULL, 'widget', false, 1, '2026-08-31T08:31:40.738Z', '2026-08-31T08:31:38.345Z', 'Perfecto, el servicio Bienestar Experience es una sesión de 60 minutos que puede ser presencial o virtual (videollamada). Su objetivo es asesorarte en longevidad, bienestar integral, nutrición natural, psicología positiva y otros aspectos de salud holística.

¿Prefieres modalidad presencial o virtual? ¿Y qué día o franja te vendría bien para esta sesión? Así puedo consultar la disponibilidad.', 'outbound', 6, '2026-08-31T08:02:36.853Z', '2026-08-31T08:31:40.749Z');
INSERT INTO "conversations" ("threadId", "agentKey", "contactId", "channel", "handoff", "unreadCount", "lastMessageAt", "lastInboundAt", "lastMessageBody", "lastMessageDirection", "messageCount", "createdAt", "updatedAt") VALUES ('booking:playground-1788163784057', 'booking', NULL, 'playground', false, 0, '2026-08-31T08:09:48.456Z', '2026-08-31T08:09:44.059Z', 'Hola, ¿qué tal? Te cuento los servicios que ofrecemos y sus precios:

- Hatha Yoga Terapéutico (1 clase semanal): 25,00 € (90 minutos, presencial)
- Hatha Yoga Terapéutico (2 clases semanales): 42,00 € (90 minutos cada clase, presencial)
- Meditaciones Guiadas: 15,00 € (30 minutos, presencial)
- Terapia Gestalt (Sesión Individual): 35,00 € (60 minutos, presencial o virtual)
- Baño de Gong y Meditación Sonora (evento puntal): 16,00 € (2 horas, presencial)
- Puja de Gongs (evento anual nocturno): 95,00 € (11 horas, presencial)
- Constelaciones Familiares (evento puntual): 60,00 € (4 horas, presencial)
- Encuentro de Mujeres (evento anual primavera): 45,00 € (presencial)
- Retiro de Ayuno Terapéutico (evento semestral): precio variable (presencial)
- Bienestar Experience (Longevidad y Bienestar Integral): 25,00 € (60 minutos, presencial o virtual)
- Iaidō (Esgrima Japonesa): gratuito (60 minutos, presencial)

¿Hay algún servicio que te interese o del que quieras saber horarios?', 'outbound', 2, '2026-08-31T08:09:44.082Z', '2026-08-31T08:31:05.415Z');

-- ==========================================
-- Datos: email_account (1 registros)
-- ==========================================
INSERT INTO "email_account" ("id", "fromName", "fromAddress", "smtpHost", "smtpPort", "smtpSecure", "smtpUser", "smtpPassword", "createdAt", "updatedAt", "smtpPass") VALUES ('692a1d61-30b8-4bf9-addc-cf831687d6f2', 'Clínica', 'jigretera@gmail.com', 'smtp.gmail.com', 587, false, 'jigretera@gmail.com', 'moulqbjwksjrzdcg', '2026-08-30T04:48:35.538Z', '2026-08-30T04:48:35.538Z', 'smtp-placeholder');

-- ==========================================
-- Datos: knowledge_chunks (21 registros)
-- ==========================================
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('a6c4ef6e-c454-46c8-bd21-bdb49c8b11b7', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 9, '### C. Terapia Gestalt (Sesión Individual)
* **Descripción**: Psicoterapia humanista centrada en el aquí y el ahora, toma de conciencia, gestión emocional y superación de bloqueos.
* **Modalidad**: Presencial en el centro u Online (videollamada).
* **Duración**: **60 minutos**.
* **Horario**: Cita convenida individualmente entre terapeuta y alumno/paciente.
* **Tarifa**: `35.00 € / sesión`.
* **Identificador de Calendario**: `cal-gestalt`.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('75b9dcac-b2be-4d66-b1de-a263807af825', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 10, '## 4. Otras Actividades Adicionales de la Escuela Salvadora Conesa', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('d162d940-0450-4174-9cdc-c8d61adcbe62', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 11, '### D. Bienestar Experience (Longevidad & Bienestar Integral)
* **Descripción**: Programa y sesiones de asesoramiento holístico y personalizado para elevar la vitalidad, retrasar el envejecimiento celular, mejorar el descanso y armonizar cuerpo y mente.
* **Modalidad**: Presencial u Online (videollamada).
* **Duración**: **60 minutos**.
* **Tarifa**: `25.00 € / sesión`.
* **Áreas y Disciplinas de Especialización (Emblema Oficial)**:
  * Biohacking y Longevidad Saludable.
  * Rejuvenecimiento y Biología Celular.
  * Estilo de Vida y Crecimiento Personal.
  * Meditación, Motivación e Inspiración.
  * Conciencia, Ciencia y Espiritualidad.
  * Nutrición Consciente y Medicina Natural.
  * Optimización de Ciclos Circadianos y Descanso.
  * Psicologías Positivas y Terapia de Sonido.
* **Identificador de Calendario**: `cal-bienestar-experience`.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('263f9088-43d8-431a-b3cd-4e84878027b2', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 12, '### E. Iaidō (Esgrima Japonesa Tradicional con Katana)
* **Descripción**: Arte marcial tradicional japonés centrado en el desenvaine, corte y funda de la katana con precisión milimétrica, respiración, etiqueta y concentración mental.
* **Lugar**: Club Social Parque Granada (Cafetería Bar • Entrada Libre).
* **Horarios**:
  * **Lunes**: `20:00 a 21:00` (60 min).
  * **Jueves**: `20:30 a 22:00` (90 min).
* **Tarifa**: ✨ **Clase de prueba gratuita** en todas las sesiones.
* **Contacto e Información WhatsApp**: `695 172 625`.
* **Aforo**: `20 plazas`.
* **Identificador de Calendario**: `cal-iaido`.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('3f4bc75c-de2e-492b-8542-396b8de16c3e', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 13, '## 5. Talleres Mensuales, Eventos y Retiros Especiales', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('2528132d-e754-4d9f-b8ad-7f0a599acfc7', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 14, '### F. Baños de Gong y Meditación Sonora
* **Frecuencia**: Un sábado al mes (habitualmente a finales de mes).
* **Estructura (2 horas)**: Preparación corporal, inmersión en el baño de sonido envolvente con gongs afinados y meditación integradora.
* **Próxima Fecha**: **Sábado 26 de Septiembre de 2026** (18:00 a 20:00).
* **Tarifa**: `16.00 € / persona`.
* **Aforo Máximo**: `30 personas`.
* **Identificador de Calendario**: `cal-gong-mensual`.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('eee5b59c-4baa-4ec9-b055-c841028c621d', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 15, '### G. Puja de Gongs (Noche Sagrada de Sonido - 11 Horas)
* **Frecuencia**: Evento anual de profunda transformación y descanso celular.
* **Experiencia**: 11 horas ininterrumpidas de gongs tocados durante toda la noche mientras los asistentes duermen o meditan envueltos en la vibración armónica.
* **Fecha Prevista**: **Sábado 28 de Noviembre de 2026** (de 21:00 a 08:00 del domingo).
* **Tarifa**: `95.00 €` (rango orientativo 90€–100€ según asistentes).
* **Aforo Máximo**: `30 personas` (reserva anticipada indispensable).
* **Identificador de Calendario**: `cal-puja-gongs`.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('1ae88645-9ed1-49dc-b83d-07c832651fb2', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 16, '### H. Constelaciones Familiares
* **Frecuencia**: Taller mensual de fin de mes.
* **Propósito**: Sanación de vínculos, desentrañar lealtades inconscientes y restaurar los órdenes del amor en el sistema familiar.
* **Próxima Fecha**: **Domingo 27 de Septiembre de 2026** (de 10:00 a 14:00).
* **Tarifas**:
  * **Constelar (trabajar tu tema personal)**: `60.00 €`.
  * **Participar (como representante y observador)**: `20.00 €`.
* **Aforo**: `25 personas`.
* **Identificador de Calendario**: `cal-constelaciones`.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('8bd42029-e563-45dd-aa79-d6e816221be1', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 17, '### I. Retiro de Ayuno Terapéutico
* **Frecuencia**: 2 veces al año (Otoño y Primavera).
* **Propósito**: Descanso digestivo, desintoxicación celular, contacto con la naturaleza, senderismo consciente y salud holística.
* **Próxima Edición**: **Puente de Octubre** (del **9 al 12 de Octubre de 2026**, 4 días / 3 noches).
* **Tarifa**: Según el lugar de hospedaje y tipo de habitación elegida.
* **Aforo**: `20 plazas`.
* **Identificador de Calendario**: `cal-ayuno-terapeutico`.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('9d3e0a44-40a7-4f44-b0d4-1012d466b62c', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 18, '### J. Encuentro de Mujeres (Primavera)
* **Frecuencia**: Jornada anual en primavera.
* **Propósito**: Círculo sagrado femenino, arquetipos, sanación de memorias, meditación y autocuidado.
* **Próxima Fecha**: **Sábado 15 de Mayo de 2027** (de 10:00 a 16:00).
* **Tarifa**: `45.00 €` (según programa).
* **Aforo**: `25 personas`.
* **Identificador de Calendario**: `cal-encuentro-mujeres`.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('b0a169fc-7fff-4465-8f4e-586a94c556af', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 19, '## 6. Pautas de Atención al Cliente para el Agente IA', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('2f97cbcb-7758-48fe-b944-a3ac4e759f20', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 20, '1. **Forma de Pago**: Informar siempre de que los pagos de clases, talleres y sesiones se realizan actualmente **directamente en el centro** (en persona), y que **próximamente también estarán disponibles online mediante Stripe y compra de entradas a través de Giglon**.
2. **Recuperación de Clases**: Explicar a los alumnos que si un día no pueden asistir a su turno habitual de yoga, pueden recuperar la clase en cualquiera de los otros turnos semanales avisando previamente (gracias al margen de aforo de 28 plazas de la sala).
3. **Reserva y Disponibilidad**: Utilizar siempre la herramienta `checkAvailability` para verificar plazas libres en la fecha solicitada y `bookAppointment` para formalizar la reserva con el nombre y móvil del alumno.
4. **Tono**: Cálido, sereno, respetuoso, empático y orientado a la salud integral y el bienestar.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('ee2e3f27-9e07-4e44-9190-8ae5ce2169f5', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 0, '# Base de Conocimiento Oficial — Centro de Yoga y Bienestar Salvadora Conesa', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('45c3bf61-2a4f-4d32-aacf-0e015699b536', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 1, 'Documento maestro de referencia sobre la filosofía, historia, servicios, clases regulares, talleres, retiros y pautas de atención al alumno para el asistente de IA y el equipo del centro.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('6ba1ea40-80eb-4b77-8962-b4d58c759cd1', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 2, '## 1. Historia y Trayectoria de Salvadora Conesa', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('5914767c-2149-477b-a015-4683af54a904', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 3, '* **Fundación**: Guiando la práctica del yoga en Fuenlabrada de forma ininterrumpida desde **1986**.
* **Ubicación Principal**: Calle Holanda, 1, Fuenlabrada (Madrid). Junto al Metro Parque Europa (Línea 12 – MetroSur).
* **Espacio Colaborador**: Instalaciones del Club Social Parque Granada (Cafetería Bar • Entrada Libre).
* **Historia Personal y Superación**:
  * En 1985, tras padecer graves problemas de espalda por una escoliosis muy severa, Salvadora conoció el yoga. Tras dos meses de práctica (3 veces por semana), pudo abandonar la rehabilitación a la que se sometía desde hacía más de 7 años.
  * Esta vivencia transformadora la impulsó a formarse como instructora en 1986 y a dedicar su vida a la enseñanza, la salud integral y el acompañamiento humano.
* **Formación Especializada**:
  * **Yoga Terapéutico y Cadenas Musculares**: Formada en Estiramientos de Cadenas Musculares, Antigimnasia, Corrección Postural, Diafroterapia y Microgimnasia. Desarrolló un método propio que integra el rigor postural y los estiramientos con la concentración y la respiración del yoga.
  * **Psicología y Acompañamiento**: Formada en **Terapia Gestalt**, **PNL (Programación Neurolingüística)** y **Pensamiento Positivo**, ayudando a alumnos con estrés, ansiedad, dolor crónico o estados depresivos a recuperar el autocuidado y la vitalidad.
  * **Movimiento Expresivo**: Formación en expresión corporal, masaje circulatorio y sensitivo con base musical.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('202f86d2-1894-4f24-9dc8-b7dd418ae730', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 4, '## 2. Filosofía y Nagna Yoga (El Yoga del Conocimiento)', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('37032ba7-5136-4ef9-a24a-1e97c11ade9a', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 5, '* **Nagna Yoga**: Es el yoga del conocimiento y la comprensión antes de la ejecución. Enseña anatomía aplicada al movimiento, alineación de apoyos, escucha del silencio interior y claves del *pranayama* (respiración consciente).
* **El espacio para mejorar las asanas**: Enfoque donde la postura no se fuerza, sino que se habita con precisión y amabilidad, evitando tensiones y compensaciones lesivas.
* **Valores del Centro**: Cercanía, profesionalidad, calidez humana, accesibilidad económica y rigor técnico.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('f705524f-519c-4b27-b466-dcdbda08ff96', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 6, '## 3. Clases Regulares y Actividades Semanales', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('8320804f-1381-45a1-9641-1f21e66d844a', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 7, '### A. Hatha Yoga Terapéutico (Nagna Yoga y Yoga Nidra)
* **Descripción**: Práctica consciente de asanas, alineación corporal, respiración terapéutica y relajación profunda (Yoga Nidra). Indicado para personas con contracturas, problemas de espalda (lumbalgias, ciáticas, hernias) o que buscan bienestar físico y mental.
* **Duración**: **90 minutos** por clase (1 hora y media).
* **Horarios Oficiales Semanales (9 clases)**:
  * **Martes**: `09:45` · `11:15` · `17:00` · `18:30` · `20:00`
  * **Miércoles**: `20:15`
  * **Jueves**: `09:45` · `11:15` · `16:30` · `17:30` · `19:00`
* **Tarifas y Aforo**:
  * **1 clase semanal**: `25.00 € / mes`
  * **2 clases semanales**: `42.00 € / mes`
  * **Aforo por clase**: `20 plazas` regulares (hasta `28 plazas` de aforo físico para permitir la recuperación de clases a las que no se haya podido asistir).
  * **Identificador de Calendario**: `cal-hatha-yoga` (ambas tarifas comparten el mismo aforo y sala).
  * **Pago**: Directamente en el centro.', NULL);
INSERT INTO "knowledge_chunks" ("id", "documentId", "agentKey", "chunkIndex", "content", "searchVector") VALUES ('057a70cf-1a9d-43f9-bd42-ad76b7b79390', 'fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 8, '### B. Meditaciones Guiadas
* **Descripción**: Espacio de silencio, respiración guiada, presencia y centramiento interior.
* **Duración**: **30 minutos**.
* **Horario**: Martes y Jueves de `09:15 a 09:45`.
* **Tarifas**:
  * **Alumnos de Yoga**: `Gratuito`.
  * **No alumnos**: `15.00 € / mes`.
* **Aforo**: `28 personas`.
* **Identificador de Calendario**: `cal-meditacion`.', NULL);

-- ==========================================
-- Datos: knowledge_documents (1 registros)
-- ==========================================
INSERT INTO "knowledge_documents" ("id", "agentKey", "filename", "mimeType", "fileExtension", "sizeBytes", "charCount", "content", "createdAt") VALUES ('fe0d8fde-44ce-4620-a12d-d5b19090fa86', 'booking', 'conocimiento_centro_yoga_salvadora.md', 'text/markdown', 'md', 9349, 9165, '# Base de Conocimiento Oficial — Centro de Yoga y Bienestar Salvadora Conesa

Documento maestro de referencia sobre la filosofía, historia, servicios, clases regulares, talleres, retiros y pautas de atención al alumno para el asistente de IA y el equipo del centro.

---

## 1. Historia y Trayectoria de Salvadora Conesa

* **Fundación**: Guiando la práctica del yoga en Fuenlabrada de forma ininterrumpida desde **1986**.
* **Ubicación Principal**: Calle Holanda, 1, Fuenlabrada (Madrid). Junto al Metro Parque Europa (Línea 12 – MetroSur).
* **Espacio Colaborador**: Instalaciones del Club Social Parque Granada (Cafetería Bar • Entrada Libre).
* **Historia Personal y Superación**:
  * En 1985, tras padecer graves problemas de espalda por una escoliosis muy severa, Salvadora conoció el yoga. Tras dos meses de práctica (3 veces por semana), pudo abandonar la rehabilitación a la que se sometía desde hacía más de 7 años.
  * Esta vivencia transformadora la impulsó a formarse como instructora en 1986 y a dedicar su vida a la enseñanza, la salud integral y el acompañamiento humano.
* **Formación Especializada**:
  * **Yoga Terapéutico y Cadenas Musculares**: Formada en Estiramientos de Cadenas Musculares, Antigimnasia, Corrección Postural, Diafroterapia y Microgimnasia. Desarrolló un método propio que integra el rigor postural y los estiramientos con la concentración y la respiración del yoga.
  * **Psicología y Acompañamiento**: Formada en **Terapia Gestalt**, **PNL (Programación Neurolingüística)** y **Pensamiento Positivo**, ayudando a alumnos con estrés, ansiedad, dolor crónico o estados depresivos a recuperar el autocuidado y la vitalidad.
  * **Movimiento Expresivo**: Formación en expresión corporal, masaje circulatorio y sensitivo con base musical.

---

## 2. Filosofía y Nagna Yoga (El Yoga del Conocimiento)

* **Nagna Yoga**: Es el yoga del conocimiento y la comprensión antes de la ejecución. Enseña anatomía aplicada al movimiento, alineación de apoyos, escucha del silencio interior y claves del *pranayama* (respiración consciente).
* **El espacio para mejorar las asanas**: Enfoque donde la postura no se fuerza, sino que se habita con precisión y amabilidad, evitando tensiones y compensaciones lesivas.
* **Valores del Centro**: Cercanía, profesionalidad, calidez humana, accesibilidad económica y rigor técnico.

---

## 3. Clases Regulares y Actividades Semanales

### A. Hatha Yoga Terapéutico (Nagna Yoga y Yoga Nidra)
* **Descripción**: Práctica consciente de asanas, alineación corporal, respiración terapéutica y relajación profunda (Yoga Nidra). Indicado para personas con contracturas, problemas de espalda (lumbalgias, ciáticas, hernias) o que buscan bienestar físico y mental.
* **Duración**: **90 minutos** por clase (1 hora y media).
* **Horarios Oficiales Semanales (9 clases)**:
  * **Martes**: `09:45` · `11:15` · `17:00` · `18:30` · `20:00`
  * **Miércoles**: `20:15`
  * **Jueves**: `09:45` · `11:15` · `16:30` · `17:30` · `19:00`
* **Tarifas y Aforo**:
  * **1 clase semanal**: `25.00 € / mes`
  * **2 clases semanales**: `42.00 € / mes`
  * **Aforo por clase**: `20 plazas` regulares (hasta `28 plazas` de aforo físico para permitir la recuperación de clases a las que no se haya podido asistir).
  * **Identificador de Calendario**: `cal-hatha-yoga` (ambas tarifas comparten el mismo aforo y sala).
  * **Pago**: Directamente en el centro.

---

### B. Meditaciones Guiadas
* **Descripción**: Espacio de silencio, respiración guiada, presencia y centramiento interior.
* **Duración**: **30 minutos**.
* **Horario**: Martes y Jueves de `09:15 a 09:45`.
* **Tarifas**:
  * **Alumnos de Yoga**: `Gratuito`.
  * **No alumnos**: `15.00 € / mes`.
* **Aforo**: `28 personas`.
* **Identificador de Calendario**: `cal-meditacion`.

---

### C. Terapia Gestalt (Sesión Individual)
* **Descripción**: Psicoterapia humanista centrada en el aquí y el ahora, toma de conciencia, gestión emocional y superación de bloqueos.
* **Modalidad**: Presencial en el centro u Online (videollamada).
* **Duración**: **60 minutos**.
* **Horario**: Cita convenida individualmente entre terapeuta y alumno/paciente.
* **Tarifa**: `35.00 € / sesión`.
* **Identificador de Calendario**: `cal-gestalt`.

---

## 4. Otras Actividades Adicionales de la Escuela Salvadora Conesa

### D. Bienestar Experience (Longevidad & Bienestar Integral)
* **Descripción**: Programa y sesiones de asesoramiento holístico y personalizado para elevar la vitalidad, retrasar el envejecimiento celular, mejorar el descanso y armonizar cuerpo y mente.
* **Modalidad**: Presencial u Online (videollamada).
* **Duración**: **60 minutos**.
* **Tarifa**: `25.00 € / sesión`.
* **Áreas y Disciplinas de Especialización (Emblema Oficial)**:
  * Biohacking y Longevidad Saludable.
  * Rejuvenecimiento y Biología Celular.
  * Estilo de Vida y Crecimiento Personal.
  * Meditación, Motivación e Inspiración.
  * Conciencia, Ciencia y Espiritualidad.
  * Nutrición Consciente y Medicina Natural.
  * Optimización de Ciclos Circadianos y Descanso.
  * Psicologías Positivas y Terapia de Sonido.
* **Identificador de Calendario**: `cal-bienestar-experience`.

---

### E. Iaidō (Esgrima Japonesa Tradicional con Katana)
* **Descripción**: Arte marcial tradicional japonés centrado en el desenvaine, corte y funda de la katana con precisión milimétrica, respiración, etiqueta y concentración mental.
* **Lugar**: Club Social Parque Granada (Cafetería Bar • Entrada Libre).
* **Horarios**:
  * **Lunes**: `20:00 a 21:00` (60 min).
  * **Jueves**: `20:30 a 22:00` (90 min).
* **Tarifa**: ✨ **Clase de prueba gratuita** en todas las sesiones.
* **Contacto e Información WhatsApp**: `695 172 625`.
* **Aforo**: `20 plazas`.
* **Identificador de Calendario**: `cal-iaido`.

---

## 5. Talleres Mensuales, Eventos y Retiros Especiales

### F. Baños de Gong y Meditación Sonora
* **Frecuencia**: Un sábado al mes (habitualmente a finales de mes).
* **Estructura (2 horas)**: Preparación corporal, inmersión en el baño de sonido envolvente con gongs afinados y meditación integradora.
* **Próxima Fecha**: **Sábado 26 de Septiembre de 2026** (18:00 a 20:00).
* **Tarifa**: `16.00 € / persona`.
* **Aforo Máximo**: `30 personas`.
* **Identificador de Calendario**: `cal-gong-mensual`.

---

### G. Puja de Gongs (Noche Sagrada de Sonido - 11 Horas)
* **Frecuencia**: Evento anual de profunda transformación y descanso celular.
* **Experiencia**: 11 horas ininterrumpidas de gongs tocados durante toda la noche mientras los asistentes duermen o meditan envueltos en la vibración armónica.
* **Fecha Prevista**: **Sábado 28 de Noviembre de 2026** (de 21:00 a 08:00 del domingo).
* **Tarifa**: `95.00 €` (rango orientativo 90€–100€ según asistentes).
* **Aforo Máximo**: `30 personas` (reserva anticipada indispensable).
* **Identificador de Calendario**: `cal-puja-gongs`.

---

### H. Constelaciones Familiares
* **Frecuencia**: Taller mensual de fin de mes.
* **Propósito**: Sanación de vínculos, desentrañar lealtades inconscientes y restaurar los órdenes del amor en el sistema familiar.
* **Próxima Fecha**: **Domingo 27 de Septiembre de 2026** (de 10:00 a 14:00).
* **Tarifas**:
  * **Constelar (trabajar tu tema personal)**: `60.00 €`.
  * **Participar (como representante y observador)**: `20.00 €`.
* **Aforo**: `25 personas`.
* **Identificador de Calendario**: `cal-constelaciones`.

---

### I. Retiro de Ayuno Terapéutico
* **Frecuencia**: 2 veces al año (Otoño y Primavera).
* **Propósito**: Descanso digestivo, desintoxicación celular, contacto con la naturaleza, senderismo consciente y salud holística.
* **Próxima Edición**: **Puente de Octubre** (del **9 al 12 de Octubre de 2026**, 4 días / 3 noches).
* **Tarifa**: Según el lugar de hospedaje y tipo de habitación elegida.
* **Aforo**: `20 plazas`.
* **Identificador de Calendario**: `cal-ayuno-terapeutico`.

---

### J. Encuentro de Mujeres (Primavera)
* **Frecuencia**: Jornada anual en primavera.
* **Propósito**: Círculo sagrado femenino, arquetipos, sanación de memorias, meditación y autocuidado.
* **Próxima Fecha**: **Sábado 15 de Mayo de 2027** (de 10:00 a 16:00).
* **Tarifa**: `45.00 €` (según programa).
* **Aforo**: `25 personas`.
* **Identificador de Calendario**: `cal-encuentro-mujeres`.

---

## 6. Pautas de Atención al Cliente para el Agente IA

1. **Forma de Pago**: Informar siempre de que los pagos de clases, talleres y sesiones se realizan actualmente **directamente en el centro** (en persona), y que **próximamente también estarán disponibles online mediante Stripe y compra de entradas a través de Giglon**.
2. **Recuperación de Clases**: Explicar a los alumnos que si un día no pueden asistir a su turno habitual de yoga, pueden recuperar la clase en cualquiera de los otros turnos semanales avisando previamente (gracias al margen de aforo de 28 plazas de la sala).
3. **Reserva y Disponibilidad**: Utilizar siempre la herramienta `checkAvailability` para verificar plazas libres en la fecha solicitada y `bookAppointment` para formalizar la reserva con el nombre y móvil del alumno.
4. **Tono**: Cálido, sereno, respetuoso, empático y orientado a la salud integral y el bienestar.
', '2026-08-31T08:17:26.896Z');

-- ==========================================
-- Datos: mastra_messages (17 registros)
-- ==========================================
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('329dafd3-e760-43ca-ac73-eb84dce70408', 'booking:widget-sess_wxl10tw', '{"format":2,"parts":[{"type":"text","text":"Hola, me gustaría información y reservar mi primera clase de prueba gratis para Iaido (Esgrima Japonesa).","createdAt":1788007821954}],"content":"Hola, me gustaría información y reservar mi primera clase de prueba gratis para Iaido (Esgrima Japonesa)."}', 'user', 'v2', '2026-08-29T12:50:21.954Z', 'booking:widget-sess_wxl10tw', '2026-08-29T12:50:21.954Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('f99fa969-39c5-4e59-9dd7-88966343f80e', 'booking:widget-sess_wxl10tw', '{"format":2,"parts":[{"type":"text","text":"Hola, me gustaría información y reservar mi primera clase de prueba gratis para Hatha Yoga Terapéutico.","createdAt":1788008718826}],"content":"Hola, me gustaría información y reservar mi primera clase de prueba gratis para Hatha Yoga Terapéutico."}', 'user', 'v2', '2026-08-29T13:05:18.826Z', 'booking:widget-sess_wxl10tw', '2026-08-29T13:05:18.826Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('69cc8f42-6d13-4f19-81b7-2a01daefb991', 'booking:widget-sess_9or8qlw', '{"format":2,"parts":[{"type":"text","text":"Hola, me gustaría información y reservar mi primera clase de prueba gratis para Hatha Yoga Terapéutico.","createdAt":1788035493787}],"content":"Hola, me gustaría información y reservar mi primera clase de prueba gratis para Hatha Yoga Terapéutico."}', 'user', 'v2', '2026-08-29T20:31:33.787Z', 'booking:widget-sess_9or8qlw', '2026-08-29T20:31:33.787Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('167fc6f4-c301-4b6f-a513-f347c28ec723', 'booking:widget-sess_9or8qlw', '{"format":2,"parts":[{"type":"text","text":"Hola, me gustaría información y reservar mi primera clase de prueba gratis para Sesión Mensual de Fin de Semana.","createdAt":1788035788672}],"content":"Hola, me gustaría información y reservar mi primera clase de prueba gratis para Sesión Mensual de Fin de Semana."}', 'user', 'v2', '2026-08-29T20:36:28.672Z', 'booking:widget-sess_9or8qlw', '2026-08-29T20:36:28.672Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('050c59c5-aab7-422d-a0a2-207a7fbf370a', 'booking:playground-1788065529034', '{"format":2,"parts":[{"type":"text","text":"«Hola, me gustaría reservar una clase de yoga para el martes por la tarde»","createdAt":1788065529130}],"content":"«Hola, me gustaría reservar una clase de yoga para el martes por la tarde»"}', 'user', 'v2', '2026-08-30T04:52:09.130Z', 'booking:playground-1788065529034', '2026-08-30T04:52:09.130Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('0d0d69ea-328f-474b-95f5-419dbf4fe156', 'booking:playground-1788066674904', '{"format":2,"parts":[{"type":"text","text":"«¿Qué servicios y precios tenéis?»","createdAt":1788066674976}],"content":"«¿Qué servicios y precios tenéis?»"}', 'user', 'v2', '2026-08-30T05:11:14.976Z', 'booking:playground-1788066674904', '2026-08-30T05:11:14.976Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('ee4a6cfd-1e82-4896-af1d-f6d303ad4a68', 'booking:playground-1788066674904', '{"format":2,"parts":[{"type":"text","text":"Hola, ¿qué tal? En Centro de Yoga Salvadora Conesa ofrecemos estos servicios:\n\n- Clase de Yoga (Hatha / Vinyasa) (75 minutos)\n- Baño de Gong (Sonoterapia) (60 minutos)\n- Puja de Gong (Noche de Gong) (480 minutos)\n- Terapia Gestalt (Individual) (60 minutos)\n- Taller de Constelaciones Familiares (180 minutos)\n- Encuentro de Mujeres (Círculo y Retiro) (240 minutos)\n- Ayuno Terapéutico & Retiro Detox (360 minutos)\n\nSobre precios, te comento que la primera clase de yoga es gratuita para que puedas probar sin compromiso.\n\n¿Hay algún servicio que te interese en particular o quieres que te cuente más detalles?","createdAt":1788066678127}],"content":"Hola, ¿qué tal? En Centro de Yoga Salvadora Conesa ofrecemos estos servicios:\n\n- Clase de Yoga (Hatha / Vinyasa) (75 minutos)\n- Baño de Gong (Sonoterapia) (60 minutos)\n- Puja de Gong (Noche de Gong) (480 minutos)\n- Terapia Gestalt (Individual) (60 minutos)\n- Taller de Constelaciones Familiares (180 minutos)\n- Encuentro de Mujeres (Círculo y Retiro) (240 minutos)\n- Ayuno Terapéutico & Retiro Detox (360 minutos)\n\nSobre precios, te comento que la primera clase de yoga es gratuita para que puedas probar sin compromiso.\n\n¿Hay algún servicio que te interese en particular o quieres que te cuente más detalles?","metadata":{"modelId":"openai/gpt-4.1-mini","provider":"openrouter"}}', 'assistant', 'v2', '2026-08-30T05:11:18.127Z', 'booking:playground-1788066674904', '2026-08-30T05:11:18.127Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('2a9af22d-f43e-4a33-adc3-c6f53b93753e', 'booking:playground-1788066674904', '{"format":2,"parts":[{"type":"text","text":"baño del gong","createdAt":1788066699613}],"content":"baño del gong"}', 'user', 'v2', '2026-08-30T05:11:39.613Z', 'booking:playground-1788066674904', '2026-08-30T05:11:39.613Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('cb5745db-6bdd-4fef-b247-9bd0ba957200', 'booking:playground-1788066674904', '{"format":2,"parts":[{"type":"text","text":"Perfecto, el Baño de Gong es una sesión de sonoterapia de 60 minutos que te ayudará a relajarte profundamente.\n\n¿Prefieres reservar tu Baño de Gong de manera presencial, por teléfono o por videollamada? También dime qué día o franja horaria te viene mejor para que pueda consultar la disponibilidad.","createdAt":1788066701827}],"content":"Perfecto, el Baño de Gong es una sesión de sonoterapia de 60 minutos que te ayudará a relajarte profundamente.\n\n¿Prefieres reservar tu Baño de Gong de manera presencial, por teléfono o por videollamada? También dime qué día o franja horaria te viene mejor para que pueda consultar la disponibilidad.","metadata":{"modelId":"openai/gpt-4.1-mini","provider":"openrouter"}}', 'assistant', 'v2', '2026-08-30T05:11:41.827Z', 'booking:playground-1788066674904', '2026-08-30T05:11:41.827Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('ba0cb5a4-ecfb-4e6d-91f7-f4887cf53a7a', 'booking:widget-sess_ocppapl', '{"format":2,"parts":[{"type":"text","text":"Hola, me gustaría información y disponibilidad para Hatha Yoga Terapéutico (2 clases semanales).","createdAt":1788163356920}],"content":"Hola, me gustaría información y disponibilidad para Hatha Yoga Terapéutico (2 clases semanales)."}', 'user', 'v2', '2026-08-31T08:02:36.920Z', 'booking:widget-sess_ocppapl', '2026-08-31T08:02:36.920Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('c5cf827a-6cd0-4397-a307-235b0f6bed8e', 'booking:widget-sess_ocppapl', '{"format":2,"parts":[{"type":"text","text":"¡Hola! Claro, te puedo ayudar con eso.\n\nEl Hatha Yoga Terapéutico con 2 clases semanales son sesiones de 90 minutos cada una, y las clases son presenciales. Los horarios habituales disponibles son: \n\n- Martes: 9:45, 11:15, 17:00, 18:30 y 20:00 \n- Miércoles: 20:15 \n- Jueves: 9:45, 11:15, 16:30, 17:30 y 19:00\n\n¿Quieres que verifique disponibilidad para algunos días concretos? ¿Qué días o franja te vendrían bien para las dos clases semanales?","createdAt":1788163360395}],"content":"¡Hola! Claro, te puedo ayudar con eso.\n\nEl Hatha Yoga Terapéutico con 2 clases semanales son sesiones de 90 minutos cada una, y las clases son presenciales. Los horarios habituales disponibles son: \n\n- Martes: 9:45, 11:15, 17:00, 18:30 y 20:00 \n- Miércoles: 20:15 \n- Jueves: 9:45, 11:15, 16:30, 17:30 y 19:00\n\n¿Quieres que verifique disponibilidad para algunos días concretos? ¿Qué días o franja te vendrían bien para las dos clases semanales?","metadata":{"modelId":"openai/gpt-4.1-mini","provider":"openrouter"}}', 'assistant', 'v2', '2026-08-31T08:02:40.395Z', 'booking:widget-sess_ocppapl', '2026-08-31T08:02:40.395Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('1d246925-6dd2-42ed-88a6-5d36aeb9a397', 'booking:playground-1788163784057', '{"format":2,"parts":[{"type":"text","text":"hola que servicios teneis y a que precios","createdAt":1788163784181}],"content":"hola que servicios teneis y a que precios"}', 'user', 'v2', '2026-08-31T08:09:44.181Z', 'booking:playground-1788163784057', '2026-08-31T08:09:44.181Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('64354715-012e-4068-b753-5af07a3ce59d', 'booking:playground-1788163784057', '{"format":2,"parts":[{"type":"text","text":"Hola, ¿qué tal? Te cuento los servicios que ofrecemos y sus precios:\n\n- Hatha Yoga Terapéutico (1 clase semanal): 25,00 € (90 minutos, presencial)\n- Hatha Yoga Terapéutico (2 clases semanales): 42,00 € (90 minutos cada clase, presencial)\n- Meditaciones Guiadas: 15,00 € (30 minutos, presencial)\n- Terapia Gestalt (Sesión Individual): 35,00 € (60 minutos, presencial o virtual)\n- Baño de Gong y Meditación Sonora (evento puntal): 16,00 € (2 horas, presencial)\n- Puja de Gongs (evento anual nocturno): 95,00 € (11 horas, presencial)\n- Constelaciones Familiares (evento puntual): 60,00 € (4 horas, presencial)\n- Encuentro de Mujeres (evento anual primavera): 45,00 € (presencial)\n- Retiro de Ayuno Terapéutico (evento semestral): precio variable (presencial)\n- Bienestar Experience (Longevidad y Bienestar Integral): 25,00 € (60 minutos, presencial o virtual)\n- Iaidō (Esgrima Japonesa): gratuito (60 minutos, presencial)\n\n¿Hay algún servicio que te interese o del que quieras saber horarios?","createdAt":1788163788286}],"content":"Hola, ¿qué tal? Te cuento los servicios que ofrecemos y sus precios:\n\n- Hatha Yoga Terapéutico (1 clase semanal): 25,00 € (90 minutos, presencial)\n- Hatha Yoga Terapéutico (2 clases semanales): 42,00 € (90 minutos cada clase, presencial)\n- Meditaciones Guiadas: 15,00 € (30 minutos, presencial)\n- Terapia Gestalt (Sesión Individual): 35,00 € (60 minutos, presencial o virtual)\n- Baño de Gong y Meditación Sonora (evento puntal): 16,00 € (2 horas, presencial)\n- Puja de Gongs (evento anual nocturno): 95,00 € (11 horas, presencial)\n- Constelaciones Familiares (evento puntual): 60,00 € (4 horas, presencial)\n- Encuentro de Mujeres (evento anual primavera): 45,00 € (presencial)\n- Retiro de Ayuno Terapéutico (evento semestral): precio variable (presencial)\n- Bienestar Experience (Longevidad y Bienestar Integral): 25,00 € (60 minutos, presencial o virtual)\n- Iaidō (Esgrima Japonesa): gratuito (60 minutos, presencial)\n\n¿Hay algún servicio que te interese o del que quieras saber horarios?","metadata":{"modelId":"openai/gpt-4.1-mini","provider":"openrouter"}}', 'assistant', 'v2', '2026-08-31T08:09:48.286Z', 'booking:playground-1788163784057', '2026-08-31T08:09:48.286Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('1b10b7a9-389f-4de4-8207-3049ecada229', 'booking:widget-sess_ocppapl', '{"format":2,"parts":[{"type":"text","text":"que servicios teneis","createdAt":1788163943982}],"content":"que servicios teneis"}', 'user', 'v2', '2026-08-31T08:12:23.982Z', 'booking:widget-sess_ocppapl', '2026-08-31T08:12:23.982Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('cdbcc35f-5977-4b50-9fcf-a2eead6f07db', 'booking:widget-sess_ocppapl', '{"format":2,"parts":[{"type":"text","text":"En nuestro centro ofrecemos estos servicios y actividades principales:\n\n- Hatha Yoga Terapéutico (1 clase semanal) - 90 minutos, presencial\n- Hatha Yoga Terapéutico (2 clases semanales) - 90 minutos, presencial\n- Meditaciones Guiadas - 30 minutos, presencial\n- Terapia Gestalt (Sesión Individual) - 60 minutos, presencial o virtual\n- Baño de Gong y Meditación Sonora - evento puntual presencial\n- Puja de Gongs (Noche Sagrada de Sonido) - evento anual presencial\n- Constelaciones Familiares - evento mensual presencial\n- Encuentro de Mujeres (Primavera) - evento anual presencial\n- Retiro de Ayuno Terapéutico - evento semestral presencial\n- Bienestar Experience (Longevidad y Bienestar Integral) - 60 minutos, presencial o virtual\n- Iaidō (Esgrima Japonesa) - 60 minutos, presencial, clase de prueba gratuita\n\n¿Quieres que te detalle alguno o te ayude con reservas?","createdAt":1788163947557}],"content":"En nuestro centro ofrecemos estos servicios y actividades principales:\n\n- Hatha Yoga Terapéutico (1 clase semanal) - 90 minutos, presencial\n- Hatha Yoga Terapéutico (2 clases semanales) - 90 minutos, presencial\n- Meditaciones Guiadas - 30 minutos, presencial\n- Terapia Gestalt (Sesión Individual) - 60 minutos, presencial o virtual\n- Baño de Gong y Meditación Sonora - evento puntual presencial\n- Puja de Gongs (Noche Sagrada de Sonido) - evento anual presencial\n- Constelaciones Familiares - evento mensual presencial\n- Encuentro de Mujeres (Primavera) - evento anual presencial\n- Retiro de Ayuno Terapéutico - evento semestral presencial\n- Bienestar Experience (Longevidad y Bienestar Integral) - 60 minutos, presencial o virtual\n- Iaidō (Esgrima Japonesa) - 60 minutos, presencial, clase de prueba gratuita\n\n¿Quieres que te detalle alguno o te ayude con reservas?","metadata":{"modelId":"openai/gpt-4.1-mini","provider":"openrouter"}}', 'assistant', 'v2', '2026-08-31T08:12:27.557Z', 'booking:widget-sess_ocppapl', '2026-08-31T08:12:27.557Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('a9cea0f5-7db0-45cc-a91c-172bbf5e5067', 'booking:widget-sess_ocppapl', '{"format":2,"parts":[{"type":"text","text":"Hola, me gustaría información y disponibilidad para Bienestar Experience (Longevidad & Salud Integral).","createdAt":1788165098429}],"content":"Hola, me gustaría información y disponibilidad para Bienestar Experience (Longevidad & Salud Integral)."}', 'user', 'v2', '2026-08-31T08:31:38.429Z', 'booking:widget-sess_ocppapl', '2026-08-31T08:31:38.429Z');
INSERT INTO "mastra_messages" ("id", "thread_id", "content", "role", "type", "createdAt", "resourceId", "createdAtZ") VALUES ('12c1f811-3aba-4ca5-9f21-43b18c71eb46', 'booking:widget-sess_ocppapl', '{"format":2,"parts":[{"type":"text","text":"Perfecto, el servicio Bienestar Experience es una sesión de 60 minutos que puede ser presencial o virtual (videollamada). Su objetivo es asesorarte en longevidad, bienestar integral, nutrición natural, psicología positiva y otros aspectos de salud holística.\n\n¿Prefieres modalidad presencial o virtual? ¿Y qué día o franja te vendría bien para esta sesión? Así puedo consultar la disponibilidad.","createdAt":1788165100682}],"content":"Perfecto, el servicio Bienestar Experience es una sesión de 60 minutos que puede ser presencial o virtual (videollamada). Su objetivo es asesorarte en longevidad, bienestar integral, nutrición natural, psicología positiva y otros aspectos de salud holística.\n\n¿Prefieres modalidad presencial o virtual? ¿Y qué día o franja te vendría bien para esta sesión? Así puedo consultar la disponibilidad.","metadata":{"modelId":"openai/gpt-4.1-mini","provider":"openrouter"}}', 'assistant', 'v2', '2026-08-31T08:31:40.682Z', 'booking:widget-sess_ocppapl', '2026-08-31T08:31:40.682Z');

-- ==========================================
-- Datos: mastra_threads (6 registros)
-- ==========================================
INSERT INTO "mastra_threads" ("id", "resourceId", "title", "metadata", "createdAt", "updatedAt", "createdAtZ", "updatedAtZ") VALUES ('booking:widget-sess_wxl10tw', 'booking:widget-sess_wxl10tw', '', '{}'::jsonb, '2026-08-29T12:50:21.948Z', '2026-08-29T13:05:18.929Z', '2026-08-29T12:50:21.948Z', '2026-08-29T13:05:18.929Z');
INSERT INTO "mastra_threads" ("id", "resourceId", "title", "metadata", "createdAt", "updatedAt", "createdAtZ", "updatedAtZ") VALUES ('booking:widget-sess_9or8qlw', 'booking:widget-sess_9or8qlw', '', '{}'::jsonb, '2026-08-29T20:31:33.780Z', '2026-08-29T20:36:28.761Z', '2026-08-29T20:31:33.780Z', '2026-08-29T20:36:28.761Z');
INSERT INTO "mastra_threads" ("id", "resourceId", "title", "metadata", "createdAt", "updatedAt", "createdAtZ", "updatedAtZ") VALUES ('booking:playground-1788065529034', 'booking:playground-1788065529034', '', '{}'::jsonb, '2026-08-30T04:52:09.125Z', '2026-08-30T04:52:09.231Z', '2026-08-30T04:52:09.125Z', '2026-08-30T04:52:09.231Z');
INSERT INTO "mastra_threads" ("id", "resourceId", "title", "metadata", "createdAt", "updatedAt", "createdAtZ", "updatedAtZ") VALUES ('booking:playground-1788066674904', 'booking:playground-1788066674904', '', '{}'::jsonb, '2026-08-30T05:11:18.167Z', '2026-08-30T05:11:41.856Z', '2026-08-30T05:11:18.167Z', '2026-08-30T05:11:41.856Z');
INSERT INTO "mastra_threads" ("id", "resourceId", "title", "metadata", "createdAt", "updatedAt", "createdAtZ", "updatedAtZ") VALUES ('booking:playground-1788163784057', 'booking:playground-1788163784057', '', NULL, '2026-08-31T08:09:48.350Z', '2026-08-31T08:09:48.350Z', '2026-08-31T08:09:48.350Z', '2026-08-31T08:09:48.350Z');
INSERT INTO "mastra_threads" ("id", "resourceId", "title", "metadata", "createdAt", "updatedAt", "createdAtZ", "updatedAtZ") VALUES ('booking:widget-sess_ocppapl', 'booking:widget-sess_ocppapl', '', '{}'::jsonb, '2026-08-31T08:02:40.448Z', '2026-08-31T08:31:40.721Z', '2026-08-31T08:02:40.448Z', '2026-08-31T08:31:40.721Z');

-- ==========================================
-- Datos: messages (8 registros)
-- ==========================================
INSERT INTO "messages" ("id", "contactId", "threadId", "direction", "channel", "body", "status", "providerMessageId", "externalId", "mediaType", "mediaUrl", "mediaId", "mediaMimeType", "mediaFilename", "createdAt") VALUES ('a063910c-972b-40d6-8a0c-e0952be459d4', NULL, 'booking:widget-sess_ocppapl', 'inbound', 'widget', 'Hola, me gustaría información y disponibilidad para Hatha Yoga Terapéutico (2 clases semanales).', 'received', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:02:36.832Z');
INSERT INTO "messages" ("id", "contactId", "threadId", "direction", "channel", "body", "status", "providerMessageId", "externalId", "mediaType", "mediaUrl", "mediaId", "mediaMimeType", "mediaFilename", "createdAt") VALUES ('3a483952-a057-48b1-b34a-16eccb362aaf', NULL, 'booking:widget-sess_ocppapl', 'outbound', 'widget', '¡Hola! Claro, te puedo ayudar con eso.

El Hatha Yoga Terapéutico con 2 clases semanales son sesiones de 90 minutos cada una, y las clases son presenciales. Los horarios habituales disponibles son: 

- Martes: 9:45, 11:15, 17:00, 18:30 y 20:00 
- Miércoles: 20:15 
- Jueves: 9:45, 11:15, 16:30, 17:30 y 19:00

¿Quieres que verifique disponibilidad para algunos días concretos? ¿Qué días o franja te vendrían bien para las dos clases semanales?', 'sent', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:02:40.519Z');
INSERT INTO "messages" ("id", "contactId", "threadId", "direction", "channel", "body", "status", "providerMessageId", "externalId", "mediaType", "mediaUrl", "mediaId", "mediaMimeType", "mediaFilename", "createdAt") VALUES ('5584c2c7-cbf2-4b07-8ec0-964ba8937590', NULL, 'booking:playground-1788163784057', 'inbound', 'playground', 'hola que servicios teneis y a que precios', 'received', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:09:44.059Z');
INSERT INTO "messages" ("id", "contactId", "threadId", "direction", "channel", "body", "status", "providerMessageId", "externalId", "mediaType", "mediaUrl", "mediaId", "mediaMimeType", "mediaFilename", "createdAt") VALUES ('a2e7bde8-a1ee-4693-9a4a-47cb91cbb7fb', NULL, 'booking:playground-1788163784057', 'outbound', 'playground', 'Hola, ¿qué tal? Te cuento los servicios que ofrecemos y sus precios:

- Hatha Yoga Terapéutico (1 clase semanal): 25,00 € (90 minutos, presencial)
- Hatha Yoga Terapéutico (2 clases semanales): 42,00 € (90 minutos cada clase, presencial)
- Meditaciones Guiadas: 15,00 € (30 minutos, presencial)
- Terapia Gestalt (Sesión Individual): 35,00 € (60 minutos, presencial o virtual)
- Baño de Gong y Meditación Sonora (evento puntal): 16,00 € (2 horas, presencial)
- Puja de Gongs (evento anual nocturno): 95,00 € (11 horas, presencial)
- Constelaciones Familiares (evento puntual): 60,00 € (4 horas, presencial)
- Encuentro de Mujeres (evento anual primavera): 45,00 € (presencial)
- Retiro de Ayuno Terapéutico (evento semestral): precio variable (presencial)
- Bienestar Experience (Longevidad y Bienestar Integral): 25,00 € (60 minutos, presencial o virtual)
- Iaidō (Esgrima Japonesa): gratuito (60 minutos, presencial)

¿Hay algún servicio que te interese o del que quieras saber horarios?', 'sent', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:09:48.456Z');
INSERT INTO "messages" ("id", "contactId", "threadId", "direction", "channel", "body", "status", "providerMessageId", "externalId", "mediaType", "mediaUrl", "mediaId", "mediaMimeType", "mediaFilename", "createdAt") VALUES ('701563ac-af3c-438a-90d7-a0c34de33f98', NULL, 'booking:widget-sess_ocppapl', 'inbound', 'widget', 'que servicios teneis', 'received', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:12:23.897Z');
INSERT INTO "messages" ("id", "contactId", "threadId", "direction", "channel", "body", "status", "providerMessageId", "externalId", "mediaType", "mediaUrl", "mediaId", "mediaMimeType", "mediaFilename", "createdAt") VALUES ('2323d2bb-c1e9-4008-ab07-2328cfd92e73', NULL, 'booking:widget-sess_ocppapl', 'outbound', 'widget', 'En nuestro centro ofrecemos estos servicios y actividades principales:

- Hatha Yoga Terapéutico (1 clase semanal) - 90 minutos, presencial
- Hatha Yoga Terapéutico (2 clases semanales) - 90 minutos, presencial
- Meditaciones Guiadas - 30 minutos, presencial
- Terapia Gestalt (Sesión Individual) - 60 minutos, presencial o virtual
- Baño de Gong y Meditación Sonora - evento puntual presencial
- Puja de Gongs (Noche Sagrada de Sonido) - evento anual presencial
- Constelaciones Familiares - evento mensual presencial
- Encuentro de Mujeres (Primavera) - evento anual presencial
- Retiro de Ayuno Terapéutico - evento semestral presencial
- Bienestar Experience (Longevidad y Bienestar Integral) - 60 minutos, presencial o virtual
- Iaidō (Esgrima Japonesa) - 60 minutos, presencial, clase de prueba gratuita

¿Quieres que te detalle alguno o te ayude con reservas?', 'sent', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:12:27.606Z');
INSERT INTO "messages" ("id", "contactId", "threadId", "direction", "channel", "body", "status", "providerMessageId", "externalId", "mediaType", "mediaUrl", "mediaId", "mediaMimeType", "mediaFilename", "createdAt") VALUES ('1e1e51c4-2e22-41ea-9e1d-b9f3479c3d65', NULL, 'booking:widget-sess_ocppapl', 'inbound', 'widget', 'Hola, me gustaría información y disponibilidad para Bienestar Experience (Longevidad & Salud Integral).', 'received', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:31:38.345Z');
INSERT INTO "messages" ("id", "contactId", "threadId", "direction", "channel", "body", "status", "providerMessageId", "externalId", "mediaType", "mediaUrl", "mediaId", "mediaMimeType", "mediaFilename", "createdAt") VALUES ('2bdf07aa-05c7-4a49-ac1e-f77bfe07d8b5', NULL, 'booking:widget-sess_ocppapl', 'outbound', 'widget', 'Perfecto, el servicio Bienestar Experience es una sesión de 60 minutos que puede ser presencial o virtual (videollamada). Su objetivo es asesorarte en longevidad, bienestar integral, nutrición natural, psicología positiva y otros aspectos de salud holística.

¿Prefieres modalidad presencial o virtual? ¿Y qué día o franja te vendría bien para esta sesión? Así puedo consultar la disponibilidad.', 'sent', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31T08:31:40.738Z');

-- ==========================================
-- Datos: payment_account (1 registros)
-- ==========================================
INSERT INTO "payment_account" ("id", "publishableKey", "secretKey", "webhookSecret", "currency", "enableCard", "enableBizum", "createdAt", "updatedAt", "stripeSecretKey") VALUES ('607facac-ac88-45cc-b67a-fc56a43e69c0', NULL, NULL, NULL, 'eur', true, true, '2026-08-30T04:48:35.539Z', '2026-08-30T04:48:35.539Z', 'sk-placeholder');

-- ==========================================
-- Datos: services (13 registros)
-- ==========================================
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('d3b4566d-e1da-430c-be1f-b2bd1d0a0bad', 'Hatha Yoga Terapéutico (1 clase semanal)', 'Práctica consciente de asanas, alineación corporal, respiración terapéutica y relajación profunda. Horarios: Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:30, 17:30, 19:00). Aforo del listado: 20 plazas (con margen de hasta 28 para recuperaciones). Precio: 25€/mes. Pago en el centro.', 'recurring', NULL, NULL, NULL, NULL, NULL, 20, NULL, NULL, 90, '25.00', 'in_person', NULL, 'cal-hatha-yoga', NULL, false, '["in_person"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.307Z', '2026-08-31T07:37:02.307Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('15f33ff9-210c-45ab-b6fd-e660854505b4', 'Hatha Yoga Terapéutico (2 clases semanales)', 'Práctica consciente de asanas, alineación corporal, respiración terapéutica y relajación profunda (2 clases a la semana). Horarios: Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:30, 17:30, 19:00). Aforo del listado: 20 plazas. Precio: 42€/mes. Pago en el centro.', 'recurring', NULL, NULL, NULL, NULL, NULL, 20, NULL, NULL, 90, '42.00', 'in_person', NULL, 'cal-hatha-yoga', NULL, false, '["in_person"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.313Z', '2026-08-31T07:37:02.313Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('8d243111-8e4c-40e3-ac5a-b4301fe6cfb9', 'Meditaciones Guiadas', 'Sesión grupal de meditación y centramiento. Martes y Jueves de 9:15 a 9:45. Gratuitas para alumnos del centro de Yoga. Precio general: 15€/mes. Pago en el centro.', 'recurring', NULL, NULL, NULL, NULL, NULL, 28, NULL, NULL, 30, '15.00', 'in_person', NULL, 'cal-meditacion', NULL, false, '["in_person"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.318Z', '2026-08-31T07:37:02.318Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('076c81be-6ce8-4f14-87a9-f507b01ba465', 'Terapia Gestalt (Sesión Individual)', 'Sesión individual de psicoterapia Gestalt presencial u online. Enfoque humanista y toma de conciencia. Horario convenido individualmente entre terapeuta y alumno/paciente. Precio: 35€ por sesión de 1 hora. Pago en el centro.', 'recurring', NULL, NULL, NULL, NULL, NULL, 1, NULL, NULL, 60, '35.00', 'in_person', NULL, 'cal-gestalt', NULL, false, '["in_person","virtual"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.322Z', '2026-08-31T07:37:02.322Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('3886172f-4a00-4af7-9d5f-5c4015e07f9c', 'Baño de Gong y Meditación Sonora', 'Un sábado al mes (a finales de mes). Sesión completa de 2 horas: preparación, baño de sonido envolvente con gongs y meditación integradora. Próxima sesión: Sábado 26 de Septiembre de 2026 (18:00 a 20:00). Aforo máximo: 30 personas. Precio: 16€. Pago en el centro.', 'event', 'Sábado 26 de Septiembre de 2026', NULL, NULL, '2026-09-26T18:00:00.000Z', '2026-09-26T20:00:00.000Z', 30, NULL, NULL, 120, '16.00', 'in_person', NULL, 'cal-gong-mensual', NULL, false, '["in_person"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.328Z', '2026-08-31T07:37:02.328Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('f929b07c-3505-42b8-907f-be7a1bca9af6', 'Puja de Gongs (Noche Sagrada de Sonido - 11h)', 'Evento anual de inmersión y transformación sonora durante toda la noche (11 horas continuas de sonido). Fecha prevista: Finales de noviembre (Sábado 28 de Noviembre de 2026, 21:00 a 08:00). Aforo: 30 personas por sesión. Precio: 95€ (90-100€ según asistentes). Reserva anticipada. Pago en el centro.', 'event', 'Sábado 28 de Noviembre de 2026 (Noche de 21:00 a 08:00)', NULL, NULL, '2026-11-28T21:00:00.000Z', '2026-11-29T08:00:00.000Z', 30, NULL, NULL, 660, '95.00', 'in_person', NULL, 'cal-puja-gongs', NULL, false, '["in_person"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.334Z', '2026-08-31T07:37:02.334Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('85254e72-a7dd-4fdb-a1e0-607b27ef63a7', 'Constelaciones Familiares', 'Taller vivencial mensual de sanación de vínculos y patrones familiares. Próxima fecha tentativa: Domingo 27 de Septiembre de 2026 (10:00 a 14:00). Precios: Constelar (trabajar asunto propio) 60€ / Participar (representante) 20€. Aforo: 25 personas. Pago en el centro.', 'event', 'Domingo 27 de Septiembre de 2026 (Tentativa)', NULL, NULL, '2026-09-27T10:00:00.000Z', '2026-09-27T14:00:00.000Z', 25, NULL, NULL, 240, '60.00', 'in_person', NULL, 'cal-constelaciones', NULL, false, '["in_person"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.339Z', '2026-08-31T07:37:02.339Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('5f0693fa-adf1-4e65-a8ea-e4eda92ff942', 'Encuentro de Mujeres (Primavera)', 'Jornada anual de empoderamiento, círculo femenino, arquetipos y meditación en primavera. Fecha prevista: Sábado 15 de Mayo de 2027. Aforo máximo: 25 personas. Precio según programa. Pago en el centro.', 'event', 'Sábado 15 de Mayo de 2027 (Primavera)', NULL, NULL, '2027-05-15T10:00:00.000Z', '2027-05-15T16:00:00.000Z', 25, NULL, NULL, 360, '45.00', 'in_person', NULL, 'cal-encuentro-mujeres', NULL, false, '["in_person"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.344Z', '2026-08-31T07:37:02.344Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('6bfc9e2b-bef8-42d5-9c25-bd3b7554229a', 'Retiro de Ayuno Terapéutico', 'Retiro semestral (Otoño y Primavera) de depuración, ayuno consciente, descanso y reconexión en la naturaleza. Próxima edición: Puente de Octubre (Del 9 al 12 de Octubre de 2026). Aforo: 20 plazas. Precio según lugar de hospedaje y días elegidos. Pago en el centro.', 'event', 'Del 9 al 12 de Octubre de 2026 (Puente de Octubre)', NULL, NULL, '2026-10-09T16:00:00.000Z', '2026-10-12T16:00:00.000Z', 20, NULL, NULL, 1440, NULL, 'in_person', NULL, 'cal-ayuno-terapeutico', NULL, false, '["in_person"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.349Z', '2026-08-31T07:37:02.349Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('469fa9b9-227d-4168-bda7-cac5cf3e7f46', 'Bienestar Experience (Longevidad y Bienestar Integral)', 'Programa y sesiones de asesoramiento personalizado presencial y online. Áreas: meditación, motivación, inspiración, conciencia, nutrición, medicina natural, biohacking, longevidad, rejuvenecimiento, ritmos circadianos, psicología positiva y sonoterapia. Precio: 25€ por sesión de 1 hora. Pago en el centro.', 'recurring', NULL, NULL, NULL, NULL, NULL, 1, NULL, NULL, 60, '25.00', 'in_person', NULL, 'cal-bienestar-experience', NULL, false, '["in_person","virtual"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.354Z', '2026-08-31T07:37:02.354Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('3993614b-aa86-422e-b05f-6a58d43867c5', 'Iaidō (Esgrima Japonesa)', 'Arte marcial tradicional de esgrima japonesa con katana. Lugar: Club Social Parque Granada. Clases: Lunes de 20:00 a 21:00 (60 min) y Jueves de 20:30 a 22:00 (90 min). Prueba gratis en las clases. Información y reservas por WhatsApp: 695 172 625. Pago en el centro.', 'recurring', NULL, NULL, NULL, NULL, NULL, 20, NULL, NULL, 60, '0.00', 'in_person', NULL, 'cal-iaido', NULL, false, '["in_person"]'::jsonb, false, NULL, true, '2026-08-31T07:37:02.359Z', '2026-08-31T07:37:02.359Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('b4605f40-f93f-4956-b108-754763fee5f2', 'Consulta Médica y Diagnóstico Clínico', 'Consulta médica especializada para evaluación diagnóstica, anamnesis, prescripción de tratamiento y seguimiento clínico.', 'recurring', NULL, 'Lunes a Viernes de 9:00 a 14:00 y 16:00 a 19:00', '/flyer-parque-granada.png', NULL, NULL, NULL, NULL, NULL, 45, '50.00', 'stripe', NULL, 'cal-medica', '0ea21e24-937e-45d2-89ed-07a6f1a39953', false, '["in_person","phone","virtual"]'::jsonb, true, NULL, true, '2026-08-31T08:07:34.435Z', '2026-08-31T08:07:34.435Z');
INSERT INTO "services" ("id", "name", "description", "serviceType", "eventDatesText", "scheduleText", "flyerUrl", "eventStartDate", "eventEndDate", "maxCapacity", "minQuorum", "quorumDeadline", "durationMinutes", "price", "paymentType", "externalPaymentUrl", "calendarId", "managerId", "requiresApproval", "allowedModalities", "requiresReason", "calEventTypeId", "isActive", "createdAt", "updatedAt") VALUES ('ad21ef46-06b1-4fb3-81e8-42b6b6180b4d', 'Fisioterapia y Rehabilitación Postural', 'Tratamiento manual descontracturante, reeducación postural y rehabilitación músculo-esquelética.', 'recurring', NULL, 'Lunes a Jueves de 10:00 a 20:00', '/flyer-parque-granada.png', NULL, NULL, NULL, NULL, NULL, 60, '45.00', 'in_person', NULL, 'cal-fisio', '0ea21e24-937e-45d2-89ed-07a6f1a39953', true, '["in_person","virtual"]'::jsonb, true, NULL, true, '2026-08-31T08:07:34.459Z', '2026-08-31T08:07:34.459Z');

-- ==========================================
-- Datos: users (11 registros)
-- ==========================================
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('9d39e681-1e6b-41ce-a05d-11fdc7a149a7', 'Administrador', 'admin@crmsalvadora.local', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'admin', true, false, NULL, '2026-08-29T12:38:23.781Z', '2026-08-29T12:38:23.781Z');
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('59760f2e-1bdf-4541-adca-aae5d8ad2318', 'Laura Navarro (Shakti - Resp. Yoga)', 'yoga@crmsalvadora.local', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'service_manager', true, false, NULL, '2026-08-29T12:38:23.872Z', '2026-08-29T12:38:23.872Z');
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('b873018b-26e6-4961-b9a4-f3eec77bb8f0', 'Marcos Benítez (Vikram - Maestro de Gong)', 'gong@crmsalvadora.local', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'service_manager', true, false, NULL, '2026-08-29T12:38:23.879Z', '2026-08-29T12:38:23.879Z');
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('a250ce64-9bdd-4ee2-934f-411918623514', 'Dra. Elena Salgado (Resp. Gestalt y Constelaciones)', 'gestalt@crmsalvadora.local', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'service_manager', true, false, NULL, '2026-08-29T12:38:23.886Z', '2026-08-29T12:38:23.886Z');
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('fa4fdbdd-fbe2-49b5-aea1-8701a42a30dd', 'Silvia Morales (Resp. Encuentros y Retiros)', 'eventos@crmsalvadora.local', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'service_manager', true, false, NULL, '2026-08-29T12:38:23.896Z', '2026-08-29T12:38:23.896Z');
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('da398e75-d8b9-4d57-a752-dfeadfb2e5a3', 'Dr. José Ignacio Gómez (Odontología & Diagnóstico)', 'jigomez@hotmail.com', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'service_manager', true, false, NULL, '2026-08-29T20:25:40.478Z', '2026-08-29T20:25:40.478Z');
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('26570aee-15cd-4f01-9d44-c577ed82e15e', 'Dra. Elena Vázquez (Dermatología Clínica & Lesiones)', 'derma@demo.com', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'service_manager', true, false, NULL, '2026-08-29T20:25:40.492Z', '2026-08-29T20:25:40.492Z');
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('39cce39c-b03f-4645-ae5b-374895b1a27d', 'Dra. Sofía Rivas (Medicina Estética & Facial)', 'estetica@demo.com', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'service_manager', true, false, NULL, '2026-08-29T20:25:40.498Z', '2026-08-29T20:25:40.498Z');
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('803a89de-da39-4ff8-aeee-db513b210d41', 'Ana Beltrán (Recepción y Atención al Paciente)', 'recepcion@crmsalvadora.local', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'employee', true, false, NULL, '2026-08-29T20:25:40.507Z', '2026-08-29T20:25:40.507Z');
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('e751b079-ac2b-4a95-9949-2379b4f00974', 'Marcos Soto (Auxiliar Clínico y Triaje)', 'auxiliar@crmsalvadora.local', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'employee', true, false, NULL, '2026-08-29T20:25:40.516Z', '2026-08-29T20:25:40.516Z');
INSERT INTO "users" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "passwordChangedAt", "createdAt", "updatedAt") VALUES ('0ea21e24-937e-45d2-89ed-07a6f1a39953', 'Dr. Carlos Mendoza (Responsable de Citas / Doctor)', 'doctor@demo.com', '$2b$10$HlLh2uJiSz80wVFdYkPBVu2IAW5JJlz8/GfS9Hk9eTqSapk0eS8W.', 'service_manager', true, false, NULL, '2026-08-29T12:38:23.865Z', '2026-08-31T08:08:03.386Z');

-- ==========================================
-- Datos: vapi_accounts (1 registros)
-- ==========================================
INSERT INTO "vapi_accounts" ("id", "apiKey", "webhookToken", "assistantId", "phoneNumberId", "phoneNumber", "serverCredentialId", "customWebhookUrl", "handoffNumber", "handoffMessage", "voiceProvider", "voiceId", "voiceModel", "voiceLanguage", "transcriberProvider", "transcriberModel", "transcriberLanguage", "llmProvider", "llmModel", "systemPromptOverride", "tone", "maxDurationSeconds", "isActive", "createdAt", "updatedAt") VALUES ('e584921e-d2ac-4b0e-b4cd-05aaf58d7b77', 'vapi-placeholder', 'c2e1406a-8991-474e-9279-6283be7c02dd', NULL, '+34919933764@sip.vapi.ai', '+34919933764', NULL, NULL, '+34919933764', NULL, '11labs', 'UOIqAnmS11Reiei1Ytkc', 'eleven_turbo_v2_5', 'es', 'deepgram', 'nova-3-general', 'es', 'openai', 'gpt-5.6-luna', NULL, 'professional', 600, true, '2026-08-29T12:38:23.973Z', '2026-08-29T20:25:40.570Z');

