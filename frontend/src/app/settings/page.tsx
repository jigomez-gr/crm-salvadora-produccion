"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldAlert, Upload, Trash2, Bot, Mail, Send, CreditCard, Copy, Check, Video, PhoneCall, RefreshCw } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { readableTextColor } from "@/lib/color";
import { AppSettings, EmailConfig, PaymentConfig, CalcomConfig, VapiAccountConfig } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SecretInput } from "@/components/ui/SecretInput";
import { cn } from "@/lib/utils";

// ─── Email (SMTP) configuration ─────────────────────────────────────────────────

const EMAIL_PROVIDERS: Record<
  string,
  { label: string; host: string; port: number; secure: boolean; help: React.ReactNode }
> = {
  gmail: {
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    help: (
      <>
        Con Gmail necesitas una <strong>contraseña de aplicación</strong>{" "}
        (requiere la verificación en 2 pasos activada). Créala en{" "}
        <a
          href="https://myaccount.google.com/apppasswords"
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:underline"
        >
          myaccount.google.com/apppasswords
        </a>{" "}
        y pégala como contraseña (no tu contraseña normal). El usuario es tu
        dirección @gmail.com.
      </>
    ),
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    help: (
      <>
        El usuario es tu dirección de Outlook/Microsoft 365 y su contraseña. Si
        tienes verificación en 2 pasos, crea una{" "}
        <strong>contraseña de aplicación</strong> en la seguridad de tu cuenta
        Microsoft.
      </>
    ),
  },
  other: {
    label: "Otro / dominio propio",
    host: "",
    port: 587,
    secure: false,
    help: (
      <>
        Pide a tu proveedor de correo los datos <strong>SMTP</strong>: servidor,
        puerto (465 con SSL/TLS o 587 con STARTTLS), usuario y contraseña.
      </>
    ),
  },
};

function detectProvider(host: string | null): string {
  if (host === "smtp.gmail.com") return "gmail";
  if (host === "smtp.office365.com") return "outlook";
  return host ? "other" : "gmail"; // a brand-new config starts on the Gmail preset
}

function EmailCard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [provider, setProvider] = useState("gmail");
  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [tick, setTick] = useState(0); // remount SecretInput after a save

  useEffect(() => {
    apiFetch<EmailConfig>("/api/email/config")
      .then((c) => {
        setFromName(c.fromName ?? "");
        setFromAddress(c.fromAddress ?? "");
        setSmtpHost(c.smtpHost ?? "");
        setSmtpPort(c.smtpPort);
        setSmtpSecure(c.smtpSecure);
        setSmtpUser(c.smtpUser ?? "");
        setHasPassword(c.hasSmtpPassword);
        setProvider(detectProvider(c.smtpHost));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function applyProvider(key: string) {
    setProvider(key);
    const p = EMAIL_PROVIDERS[key];
    if (key !== "other") {
      setSmtpHost(p.host);
      setSmtpPort(p.port);
      setSmtpSecure(p.secure);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        fromName,
        fromAddress,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
      };
      if (smtpPassword) body.smtpPassword = smtpPassword;
      const updated = await apiFetch<EmailConfig>("/api/email/config", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setHasPassword(updated.hasSmtpPassword);
      setSmtpPassword(null);
      setTick((t) => t + 1);
      toast.success("Cuenta de correo guardada.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    const target = testTo.trim() || fromAddress;
    if (!target) {
      toast.error("Indica una dirección de correo a la que enviar la prueba.");
      return;
    }
    setTesting(true);
    try {
      const res = await apiFetch<{ to: string }>("/api/email/test", {
        method: "POST",
        body: JSON.stringify({ to: target }),
      });
      toast.success(
        `✅ Correo de prueba enviado con éxito a ${res.to}. Revisa tu bandeja de entrada y carpeta de spam.`,
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo enviar la prueba.",
      );
    } finally {
      setTesting(false);
    }
  }

  if (loading) return null;

  const labelCls = "mb-1 block text-xs font-medium text-neutral-700";

  return (
    <div className="mt-6 max-w-xl rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-neutral-500" />
        <h2 className="text-sm font-semibold text-neutral-800">
          Correo electrónico
        </h2>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Conecta una cuenta para enviar correos a tus contactos desde su ficha.
        Funciona con Gmail, Outlook o el correo de tu propio dominio.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelCls}>Proveedor</label>
          <select
            className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            value={provider}
            onChange={(e) => applyProvider(e.target.value)}
          >
            {Object.entries(EMAIL_PROVIDERS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-neutral-600">
            {EMAIL_PROVIDERS[provider].help}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Nombre del remitente</label>
            <Input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Mi Negocio"
            />
          </div>
          <div>
            <label className={labelCls}>Correo del remitente</label>
            <Input
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="hola@midominio.com"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Servidor SMTP</label>
            <Input
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.midominio.com"
              disabled={provider !== "other"}
            />
          </div>
          <div>
            <label className={labelCls}>Puerto</label>
            <Input
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(parseInt(e.target.value) || 0)}
              disabled={provider !== "other"}
            />
          </div>
        </div>

        {provider === "other" && (
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={smtpSecure}
              onChange={(e) => setSmtpSecure(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Usar SSL/TLS directo (marca esto para el puerto 465; déjalo sin marcar
            para 587 con STARTTLS)
          </label>
        )}

        <div>
          <label className={labelCls}>Usuario</label>
          <Input
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            placeholder="tu-correo@gmail.com"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Normalmente es tu dirección de correo completa.
          </p>
        </div>

        <SecretInput
          key={`smtp-${tick}`}
          label="Contraseña"
          placeholder="Contraseña o contraseña de aplicación"
          hasValue={hasPassword}
          value={smtpPassword}
          onChange={setSmtpPassword}
          hint="Para Gmail/Outlook con 2FA, usa una contraseña de aplicación (no la normal). No se muestra nunca por seguridad."
        />

        <div className="pt-2">
          <Button onClick={save} disabled={saving}>
            <Upload className="h-4 w-4" />
            {saving ? "Guardando…" : "Guardar cuenta"}
          </Button>
        </div>

        {/* Sección destacada para probar el envío de correo */}
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50/80 p-4">
          <label className="mb-1.5 block text-xs font-semibold text-neutral-800">
            Enviar correo de prueba a esta dirección:
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="email"
              className="flex-1 bg-white text-sm"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="Escribe tu correo (ej: jigomez@hotmail.com o tu email personal)"
            />
            <Button variant="secondary" onClick={test} disabled={testing} className="whitespace-nowrap">
              <Send className="h-4 w-4" />
              {testing ? "Enviando prueba…" : "Enviar correo de prueba"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Guarda la cuenta antes de enviar la prueba. Puedes escribir cualquier dirección de correo donde quieras recibir el mensaje para verificar que te llega a la bandeja de entrada o spam.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Payment (Stripe / Bizum / Card) configuration ──────────────────────────────

function PaymentCard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);

  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [currency, setCurrency] = useState("eur");
  const [enableBizum, setEnableBizum] = useState(true);
  const [enableCard, setEnableCard] = useState(true);

  const [hasSecretKey, setHasSecretKey] = useState(false);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaymentConfig>("/api/payments/config")
      .then((data) => {
        if (cancelled) return;
        setPublishableKey(data.publishableKey || "");
        setHasSecretKey(data.hasSecretKey);
        setHasWebhookSecret(data.hasWebhookSecret);
        setCurrency(data.currency || "eur");
        setEnableBizum(data.enableBizum ?? true);
        setEnableCard(data.enableCard ?? true);
        setWebhookUrl(data.webhookUrl || "");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Partial<{
        publishableKey: string;
        secretKey: string;
        webhookSecret: string;
        currency: string;
        enableBizum: boolean;
        enableCard: boolean;
      }> = {
        publishableKey,
        currency,
        enableBizum,
        enableCard,
      };
      if (secretKey && secretKey.trim() !== "") payload.secretKey = secretKey;
      if (webhookSecret && webhookSecret.trim() !== "") payload.webhookSecret = webhookSecret;

      const updated = await apiFetch<PaymentConfig>("/api/payments/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setPublishableKey(updated.publishableKey || "");
      setHasSecretKey(updated.hasSecretKey);
      setHasWebhookSecret(updated.hasWebhookSecret);
      setSecretKey(null);
      setWebhookSecret(null);
      setTick((t) => t + 1);
      toast.success("Configuración de Stripe y pagos guardada.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error al guardar pagos.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCopyWebhook() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL del Webhook copiada al portapapeles.");
    setTimeout(() => setCopied(false), 2500);
  }

  if (loading) return null;

  const labelCls = "mb-1 block text-xs font-medium text-neutral-700";

  return (
    <div className="mt-6 max-w-xl rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-neutral-500" />
        <h2 className="text-sm font-semibold text-neutral-800">
          Pasarela de Pago (Stripe & Bizum)
        </h2>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Permite el cobro de citas y servicios con Tarjeta, Apple Pay, Google Pay y Bizum. El agente de IA puede enviar enlaces de pago automáticos por WhatsApp.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelCls}>Clave Pública (Publishable Key)</label>
          <Input
            value={publishableKey}
            onChange={(e) => setPublishableKey(e.target.value)}
            placeholder="pk_test_... o pk_live_..."
          />
        </div>

        <SecretInput
          key={`stripe-sk-${tick}`}
          label="Clave Secreta (Secret Key)"
          placeholder="sk_test_... o sk_live_..."
          hasValue={hasSecretKey}
          value={secretKey}
          onChange={setSecretKey}
          hint="Clave privada de Stripe. Nunca se devuelve al navegador por seguridad."
        />

        <SecretInput
          key={`stripe-wh-${tick}`}
          label="Secreto de Firma del Webhook (Signing Secret)"
          placeholder="whsec_..."
          hasValue={hasWebhookSecret}
          value={webhookSecret}
          onChange={setWebhookSecret}
          hint="Secreto para verificar la autenticidad de los webhooks de Stripe."
        />

        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-neutral-800">URL del Webhook de Stripe</p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Pega esta URL en tu Dashboard de Stripe (Eventos: <code className="text-indigo-600">checkout.session.completed</code>)
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleCopyWebhook} type="button">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p className="mt-2 font-mono text-xs text-neutral-700 break-all select-all">
            {webhookUrl || "http://localhost:3001/api/webhooks/stripe"}
          </p>
        </div>

        <div className="pt-2 space-y-2 border-t border-neutral-100">
          <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              checked={enableCard}
              onChange={(e) => setEnableCard(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Aceptar Tarjetas, Apple Pay y Google Pay</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              checked={enableBizum}
              onChange={(e) => setEnableBizum(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Aceptar Bizum (requiere moneda EUR y activación en Stripe)</span>
          </label>
        </div>

        <div className="pt-1">
          <Button onClick={handleSave} disabled={saving}>
            <Upload className="h-4 w-4" />
            {saving ? "Guardando…" : "Guardar pagos"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Cal.com (Virtual Meetings & Video Sync) configuration ─────────────────────

function CalcomCard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tick, setTick] = useState(0);

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("https://api.cal.com/v1");
  const [enabled, setEnabled] = useState(true);
  const [defaultEventTypeId, setDefaultEventTypeId] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<CalcomConfig>("/api/calcom/config")
      .then((data) => {
        if (cancelled) return;
        setHasApiKey(data.hasApiKey);
        setBaseUrl(data.baseUrl || "https://api.cal.com/v1");
        setEnabled(data.enabled ?? true);
        setDefaultEventTypeId(data.defaultEventTypeId ? String(data.defaultEventTypeId) : "");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        baseUrl: baseUrl.trim() || "https://api.cal.com/v1",
        enabled,
        defaultEventTypeId: defaultEventTypeId.trim() || undefined,
      };
      if (apiKey !== null) {
        payload.apiKey = apiKey;
      }
      const updated = await apiFetch<CalcomConfig>("/api/calcom/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setHasApiKey(updated.hasApiKey);
      setApiKey(null);
      setTick((t) => t + 1);
      toast.success("Configuración de Cal.com guardada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al guardar Cal.com");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await apiFetch<{ success: boolean; message: string }>("/api/calcom/test", {
        method: "POST",
      });
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al probar conexión con Cal.com");
    } finally {
      setTesting(false);
    }
  }

  const labelCls = "mb-1 block text-xs font-medium text-neutral-700";

  return (
    <div className="mt-6 max-w-xl rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-neutral-800">
          Integración con Cal.com (Citas Virtuales)
        </h2>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Sincroniza las citas virtuales automáticamente con Cal.com usando el correo del responsable del servicio y generando enlaces de videollamada para clientes y profesionales.
      </p>

      <div className="mt-4 space-y-4">
        <SecretInput
          key={`calcom-key-${tick}`}
          label="API Key de Cal.com"
          placeholder="cal_live_... o tu clave de API"
          hasValue={hasApiKey}
          value={apiKey}
          onChange={setApiKey}
          hint="Puedes obtener tu API Key en Cal.com → Settings → Developer → API Keys."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>URL Base de la API</label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.cal.com/v1"
            />
          </div>
          <div>
            <label className={labelCls}>ID de Evento Predeterminado (opcional)</label>
            <Input
              type="text"
              value={defaultEventTypeId}
              onChange={(e) => setDefaultEventTypeId(e.target.value)}
              placeholder="ej. 129482 o UUID de evento"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
          />
          Habilitar sincronización automática con Cal.com para citas virtuales
        </label>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={handleSave} disabled={saving}>
            <Upload className="h-4 w-4" />
            {saving ? "Guardando…" : "Guardar Cal.com"}
          </Button>

          <Button variant="secondary" onClick={handleTest} disabled={testing || !hasApiKey}>
            <Send className="h-4 w-4" />
            {testing ? "Probando…" : "Probar conexión"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function VapiCard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);

  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [smsWebhookUrl, setSmsWebhookUrl] = useState("");
  const [publishing, setPublishing] = useState(false);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/vapi/webhook`
    : "/api/vapi/webhook";

  useEffect(() => {
    let cancelled = false;
    apiFetch<VapiAccountConfig>("/api/vapi/config")
      .then((data) => {
        if (cancelled) return;
        setHasApiKey(data.hasApiKey);
        setAssistantId(data.assistantId || "");
        setPhoneNumber(data.phoneNumber || "");
        setSmsWebhookUrl(data.smsWebhookUrl || "");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        assistantId: assistantId.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        smsWebhookUrl: smsWebhookUrl.trim() || null,
      };
      if (apiKey !== null && apiKey.trim() !== "") {
        payload.apiKey = apiKey.trim();
      }
      const updated = await apiFetch<VapiAccountConfig>("/api/vapi/config", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setHasApiKey(updated.hasApiKey);
      setApiKey(null);
      setTick((t) => t + 1);
      toast.success("Configuración de VAPI y SMS guardada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al guardar configuración de VAPI");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const res = await apiFetch<{ assistantId: string; status: string }>("/api/vapi/publish", {
        method: "POST",
      });
      if (res.assistantId) setAssistantId(res.assistantId);
      toast.success("¡Asistente y herramientas publicados en VAPI con éxito!");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al publicar asistente en VAPI");
    } finally {
      setPublishing(false);
    }
  }

  async function handleSyncTools() {
    setSyncing(true);
    try {
      const res = await apiFetch<{ synced: number; tools: any[] }>("/api/vapi/sync-tools", {
        method: "POST",
      });
      toast.success(`Se han sincronizado ${res.synced || res.tools?.length || 0} herramientas con VAPI`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al sincronizar herramientas con VAPI");
    } finally {
      setSyncing(false);
    }
  }

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("URL del webhook copiada");
  }

  const labelCls = "mb-1 block text-xs font-medium text-neutral-700";

  return (
    <div className="mt-6 max-w-xl rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <PhoneCall className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-neutral-800">
          Voz Telefónica (VAPI & Zadarma) y SMS (n8n)
        </h2>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Conecta tu recepcionista de voz con IA telefónica (VAPI + números Zadarma) y configura el webhook de n8n para enviar SMS de confirmación.
      </p>

      <div className="mt-4 space-y-4">
        <SecretInput
          key={`vapi-key-${tick}`}
          label="Clave de API de VAPI"
          placeholder="vapi_... o tu Private API Key"
          hasValue={hasApiKey}
          value={apiKey}
          onChange={setApiKey}
          hint="Obtén tu API Key privada en dashboard.vapi.ai → Org → API Keys."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>ID del Asistente VAPI</label>
            <Input
              placeholder="p. ej. ff7c4d18-aa90-..."
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-neutral-500">ID de «Recepcionista Escuela Yoga» en VAPI.</p>
          </div>

          <div>
            <label className={labelCls}>Número de Teléfono (Zadarma)</label>
            <Input
              placeholder="+34919933764"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-neutral-500">Número DID español contratado en Zadarma.</p>
          </div>
        </div>

        <div>
          <label className={labelCls}>URL del Webhook del CRM (para VAPI Server URL)</label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={webhookUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="secondary" onClick={copyWebhook}>
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </>
              )}
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            Pega esta URL en el <strong>Server URL</strong> de tu asistente y tools en dashboard.vapi.ai.
          </p>
        </div>

        <div>
          <label className={labelCls}>Webhook de Salida para SMS (n8n / C#)</label>
          <Input
            placeholder="https://n8n.tudominio.com/webhook/citas-sms"
            value={smsWebhookUrl}
            onChange={(e) => setSmsWebhookUrl(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-neutral-500">
            Recibe eventos automáticos (citas aceptadas, rechazadas o creadas) con el texto del SMS listo para enviar.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100">
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving}>
              <Upload className="h-4 w-4" />
              {saving ? "Guardando…" : "Guardar"}
            </Button>

            <Button variant="secondary" onClick={handlePublish} disabled={publishing || !hasApiKey}>
              <Bot className={cn("h-3.5 w-3.5", publishing && "animate-spin")} />
              {publishing ? "Publicando…" : "Publicar Asistente en VAPI"}
            </Button>
          </div>

          <Button variant="secondary" onClick={handleSyncTools} disabled={syncing || !hasApiKey}>
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Sincronizando…" : "Sincronizar Tools"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const branding = useBranding();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState("");
  const [brandColor, setBrandColor] = useState("#4f46e5");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AppSettings>("/api/settings")
      .then((data) => {
        if (cancelled) return;
        setBusinessName(data.businessName);
        setBrandColor(data.brandColor);
        setLogoUrl(data.logoUrl);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user && user.role !== "admin") {
    return (
      <div className="p-4 sm:p-8">
        <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
          <div>
            <h1 className="text-sm font-semibold text-neutral-900">
              Acceso restringido
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Solo los administradores pueden cambiar la configuración.
            </p>
          </div>
        </div>
      </div>
    );
  }

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      toast.error("La imagen es demasiado grande (máx. 1,5 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          businessName,
          brandColor,
          logoUrl: logoUrl ?? "",
        }),
      });
      await branding.refresh();
      toast.success("Configuración guardada.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo guardar."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClearDemo() {
    setClearing(true);
    try {
      await apiFetch("/api/settings/clear-demo", { method: "POST" });
      setClearOpen(false);
      toast.success("Datos de demostración vaciados.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudieron vaciar los datos."
      );
    } finally {
      setClearing(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-neutral-400">Cargando…</div>;
  }

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-xl font-semibold text-neutral-900">Ajustes</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Personaliza la marca y gestiona los datos de la aplicación.
      </p>

      {/* Branding */}
      <div className="mt-6 max-w-xl rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-neutral-800">Marca</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Nombre del negocio
            </label>
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Mi Negocio"
            />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Color de marca
              </label>
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-16 cursor-pointer rounded border border-neutral-300"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Logo
              </label>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg"
                  style={{ backgroundColor: brandColor }}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-supplied logo preview
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Bot
                      className="h-5 w-5"
                      style={{ color: readableTextColor(brandColor) }}
                    />
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={onLogoFile}
                  className="block text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {logoUrl && (
                  <button
                    type="button"
                    className="text-xs text-neutral-500 hover:text-red-600"
                    onClick={() => setLogoUrl(null)}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving}>
              <Upload className="h-4 w-4" />
              {saving ? "Guardando…" : "Guardar marca"}
            </Button>
          </div>
        </div>
      </div>

      {/* Email (SMTP) */}
      <EmailCard />

      {/* Stripe & Bizum Payments */}
      <PaymentCard />

      {/* Cal.com (Virtual Meetings & Video) */}
      <CalcomCard />

      {/* Voz Telefónica (VAPI & Zadarma) y SMS */}
      <VapiCard />

      {/* Danger zone */}
      <div className="mt-6 max-w-xl rounded-xl border border-red-200 bg-red-50/40 p-6">
        <h2 className="text-sm font-semibold text-red-700">Datos</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Vacía los <strong>contactos, citas y conversaciones</strong> de
          demostración para empezar de cero antes de poner el CRM en producción.
          Los usuarios, agentes y la configuración se conservan. Esta acción no
          se puede deshacer.
        </p>
        <Button
          variant="danger"
          className="mt-3"
          onClick={() => setClearOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Vaciar datos de demostración
        </Button>
      </div>

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Vaciar datos de demostración"
      >
        <p className="text-sm text-neutral-600">
          Se eliminarán <strong>todos los contactos, citas y conversaciones</strong>.
          Los usuarios, agentes y la configuración no se tocan. ¿Continuar?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setClearOpen(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleClearDemo} disabled={clearing}>
            {clearing ? "Vaciando…" : "Vaciar datos"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
