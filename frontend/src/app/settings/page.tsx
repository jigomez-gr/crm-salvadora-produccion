"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldAlert, Upload, Trash2, Bot, Mail, Send, CreditCard, Copy, Check, Video, PhoneCall, RefreshCw, FileText, UserCheck, Bell, Sparkles, MessageSquare, QrCode } from "lucide-react";
import { apiFetch, apiUrl, ApiError } from "@/lib/api";
import { readableTextColor } from "@/lib/color";
import { Agent, AppSettings, EmailConfig, EvolutionConnectionStatus, PaymentConfig, CalcomConfig, VapiAccountConfig } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SecretInput } from "@/components/ui/SecretInput";
import { cn } from "@/lib/utils";
import { SensitiveAccessGate } from "@/contexts/SensitiveAccessContext";

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
  const [baseUrl, setBaseUrl] = useState("https://api.cal.com/v2");
  const [enabled, setEnabled] = useState(true);
  const [defaultEventTypeId, setDefaultEventTypeId] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<CalcomConfig>("/api/calcom/config")
      .then((data) => {
        if (cancelled) return;
        setHasApiKey(data.hasApiKey);
        setBaseUrl(data.baseUrl || "https://api.cal.com/v2");
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
        baseUrl: baseUrl.trim() || "https://api.cal.com/v2",
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
              placeholder="https://api.cal.com/v2"
            />
          </div>
          <div>
            <label className={labelCls}>ID de Evento Predeterminado (opcional)</label>
            <Input
              type="text"
              value={defaultEventTypeId}
              onChange={(e) => setDefaultEventTypeId(e.target.value)}
              placeholder="ej. 4252426 o ID de evento"
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
  const [hasZadarmaApiKey, setHasZadarmaApiKey] = useState(false);
  const [zadarmaApiKey, setZadarmaApiKey] = useState<string | null>(null);
  const [hasZadarmaApiSecret, setHasZadarmaApiSecret] = useState(false);
  const [zadarmaApiSecret, setZadarmaApiSecret] = useState<string | null>(null);
  const [zadarmaSenderId, setZadarmaSenderId] = useState("Teamsale");
  const [zadarmaSmsEnabled, setZadarmaSmsEnabled] = useState(true);
  const [smsAutoConfirmation, setSmsAutoConfirmation] = useState(true);
  const [smsConfirmationTemplate, setSmsConfirmationTemplate] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [copiedCall, setCopiedCall] = useState(false);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/widget/vapi/webhook`
    : "/api/widget/vapi/webhook";

  const landingCallUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/widget/vapi/call`
    : "/api/widget/vapi/call";

  function copyLandingCallUrl() {
    navigator.clipboard.writeText(landingCallUrl);
    setCopiedCall(true);
    setTimeout(() => setCopiedCall(false), 2000);
  }

  useEffect(() => {
    let cancelled = false;
    apiFetch<VapiAccountConfig>("/api/vapi/config")
      .then((data) => {
        if (cancelled) return;
        setHasApiKey(data.hasApiKey);
        setAssistantId(data.assistantId || "");
        setPhoneNumber(data.phoneNumber || "");
        setSmsWebhookUrl(data.smsWebhookUrl || "");
        setHasZadarmaApiKey(Boolean(data.hasZadarmaApiKey));
        setHasZadarmaApiSecret(Boolean(data.hasZadarmaApiSecret));
        setZadarmaSenderId(data.zadarmaSenderId || "Teamsale");
        setZadarmaSmsEnabled(data.zadarmaSmsEnabled ?? true);
        setSmsAutoConfirmation(data.smsAutoConfirmation ?? true);
        setSmsConfirmationTemplate(data.smsConfirmationTemplate || "");
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
        zadarmaSenderId: zadarmaSenderId.trim() || "Teamsale",
        zadarmaSmsEnabled,
        smsAutoConfirmation,
        smsConfirmationTemplate: smsConfirmationTemplate.trim() || null,
      };
      if (apiKey !== null && apiKey.trim() !== "") {
        payload.apiKey = apiKey.trim();
      }
      if (zadarmaApiKey !== null) {
        payload.zadarmaApiKey = zadarmaApiKey.trim() || null;
      }
      if (zadarmaApiSecret !== null) {
        payload.zadarmaApiSecret = zadarmaApiSecret.trim() || null;
      }
      const updated = await apiFetch<VapiAccountConfig>("/api/vapi/config", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setHasApiKey(updated.hasApiKey);
      setApiKey(null);
      setHasZadarmaApiKey(Boolean(updated.hasZadarmaApiKey));
      setZadarmaApiKey(null);
      setHasZadarmaApiSecret(Boolean(updated.hasZadarmaApiSecret));
      setZadarmaApiSecret(null);
      setTick((t) => t + 1);
      toast.success("Configuración de VAPI y Zadarma SMS guardada");
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
          <label className={labelCls}>Endpoint de Llamadas para Landing Web (VAPI Outbound)</label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={landingCallUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="secondary" onClick={copyLandingCallUrl}>
              {copiedCall ? (
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
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
            <span>
              Peticiones directas desde el botón <strong>"Pedir por Teléfono (VAPI)"</strong> de la web.
            </span>
            <a
              href="/Guia_Implementacion_VAPI_Landing_Salvadora.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[#800020] hover:underline"
            >
              <FileText className="h-3.5 w-3.5" /> Descargar Guía Técnica (PDF)
            </a>
          </div>
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

        {/* Zadarma SMS Direct Delivery */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-neutral-900 flex items-center gap-2">
                <span>📱 Envío Directo de SMS por Zadarma</span>
                {hasZadarmaApiKey && hasZadarmaApiSecret && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Conectado
                  </span>
                )}
              </h4>
              <p className="text-xs text-neutral-500 mt-0.5">
                Envía SMS automáticos inmediatamente al confirmar reservas telefónicas por VAPI o desde la agenda del CRM.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={zadarmaSmsEnabled}
                onChange={(e) => setZadarmaSmsEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#800020]"></div>
            </label>
          </div>

          {zadarmaSmsEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className={labelCls}>Zadarma API Key</label>
                <Input
                  type="password"
                  placeholder={hasZadarmaApiKey ? "•••••••••••• (configurada)" : "ej: 45dc42d6f22439899024"}
                  value={zadarmaApiKey ?? ""}
                  onChange={(e) => setZadarmaApiKey(e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>Zadarma API Secret</label>
                <Input
                  type="password"
                  placeholder={hasZadarmaApiSecret ? "•••••••••••• (configurado)" : "ej: 34061190a934a453aa99"}
                  value={zadarmaApiSecret ?? ""}
                  onChange={(e) => setZadarmaApiSecret(e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>Remitente (Sender ID)</label>
                <Input
                  placeholder="Teamsale o nombre de remitente"
                  value={zadarmaSenderId}
                  onChange={(e) => setZadarmaSenderId(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  Identificador de remitente registrado en Zadarma (por defecto Teamsale).
                </p>
              </div>

              <div>
                <label className={labelCls}>Plantilla Personalizada (opcional)</label>
                <Input
                  placeholder="Usa {servicio} y {fecha} para variables"
                  value={smsConfirmationTemplate}
                  onChange={(e) => setSmsConfirmationTemplate(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  Si se deja vacío, usará el mensaje con captura secundaria de email.
                </p>
              </div>
            </div>
          )}
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

// ─── Human Handoff Notification Card ─────────────────────────────────────────

function HumanNoticeCard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [vapiEnabled, setVapiEnabled] = useState(false);

  useEffect(() => {
    apiFetch<AppSettings>("/api/settings")
      .then((data) => {
        setPhone(data.humanNoticePhone ?? "");
        setEmail(data.humanNoticeEmail ?? "");
        setEmailEnabled(data.humanNoticeEmailEnabled ?? true);
        setSmsEnabled(data.humanNoticeSmsEnabled ?? true);
        setVapiEnabled(data.humanNoticeVapiEnabled ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          humanNoticePhone: phone.trim(),
          humanNoticeEmail: email.trim(),
          humanNoticeEmailEnabled: emailEnabled,
          humanNoticeSmsEnabled: smsEnabled,
          humanNoticeVapiEnabled: vapiEnabled,
        }),
      });
      toast.success("Avisos de atención humana guardados.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo guardar la configuración de avisos."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await apiFetch<{
        ok?: boolean;
        emailSent?: boolean;
        smsSent?: boolean;
        vapiSent?: boolean;
        errors?: string[];
        results?: {
          email?: { attempted: boolean; success: boolean; sentCount: number; totalCount: number; errors: string[] };
          sms?: { attempted: boolean; success: boolean; sentCount: number; totalCount: number; errors: string[] };
          vapi?: { attempted: boolean; success: boolean; sentCount: number; totalCount: number; errors: string[] };
        };
      }>("/api/notifications/test-human-notice", {
        method: "POST",
      });

      const parts: string[] = [];
      const emailDetail = res.results?.email;
      if (emailDetail?.attempted) {
        parts.push(
          `Email: ${emailDetail.success ? `✓ Enviado (${emailDetail.sentCount}/${emailDetail.totalCount})` : "✗ Falló"}`
        );
      } else if (res.emailSent) {
        parts.push("Email: ✓ Enviado");
      }

      const smsDetail = res.results?.sms;
      if (smsDetail?.attempted) {
        parts.push(
          `SMS: ${smsDetail.success ? `✓ Enviado (${smsDetail.sentCount}/${smsDetail.totalCount})` : "✗ Falló"}`
        );
      } else if (res.smsSent) {
        parts.push("SMS: ✓ Enviado");
      }

      const vapiDetail = res.results?.vapi;
      if (vapiDetail?.attempted) {
        parts.push(
          `Llamada VAPI: ${vapiDetail.success ? `✓ Iniciada (${vapiDetail.sentCount}/${vapiDetail.totalCount})` : "✗ Falló"}`
        );
      } else if (res.vapiSent) {
        parts.push("Llamada VAPI: ✓ Iniciada");
      }

      if (parts.length === 0) {
        toast.info("Ningún canal activo configurado para probar.");
      } else {
        toast.success(`Prueba de avisos: ${parts.join(" | ")}`);
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error al ejecutar la prueba de aviso."
      );
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return null;
  }

  return (
    <div className="mt-6 max-w-xl rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <UserCheck className="h-5 w-5 text-indigo-600" />
        <h2 className="text-sm font-semibold text-neutral-900">
          Avisos de Atención Humana (Escalado)
        </h2>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Recibe avisos inmediatos cuando un usuario en la Web / Landing, WhatsApp o en llamada con la IA solicite y confirme hablar con una persona.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Móviles de aviso (SMS y llamadas salientes VAPI)
          </label>
          <Input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+34 649453996; +34 600112233"
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            Números a los que se enviará el SMS urgente y/o donde llamará la IA de VAPI al responsable (puedes indicar varios separados por punto y coma «;»).
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Emails de aviso
          </label>
          <Input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jigomez@hotmail.com; responsable2@empresa.com"
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            Direcciones donde se enviará el correo con los datos del contacto y resumen (puedes indicar varias separadas por punto y coma «;»).
          </p>
        </div>

        <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3.5 space-y-2.5">
          <span className="block text-xs font-semibold text-neutral-700">
            Canales de aviso habilitados:
          </span>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-xs font-medium text-neutral-800">
                Aviso por Email
              </span>
              <p className="text-[11px] text-neutral-500">
                Envía un correo con el nombre, teléfono, email, motivo y canal del cliente.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={smsEnabled}
              onChange={(e) => setSmsEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-xs font-medium text-neutral-800">
                Aviso por SMS
              </span>
              <p className="text-[11px] text-neutral-500">
                Envía un SMS urgente al móvil de aviso (mediante la integración Zadarma).
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={vapiEnabled}
              onChange={(e) => setVapiEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-xs font-medium text-neutral-800">
                Llamada saliente VAPI (Outbound)
              </span>
              <p className="text-[11px] text-neutral-500">
                La IA llama por teléfono al móvil de aviso para comunicar de viva voz que un cliente solicita atención humana.
              </p>
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            <Upload className="h-4 w-4" />
            {saving ? "Guardando…" : "Guardar avisos"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={handleTest}
            disabled={testing || saving}
          >
            <Bell className="h-4 w-4" />
            {testing ? "Probando…" : "Probar avisos ahora"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp Provider (Evolution API / YCloud / Meta Cloud API) ──────────────

function WhatsappProviderCard() {
  const toast = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("booking");
  const [form, setForm] = useState<Agent | null>(null);
  const [operativeProvider, setOperativeProvider] = useState<"evolution" | "ycloud">("ycloud");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [copiedYcloud, setCopiedYcloud] = useState(false);
  const [copiedEvolution, setCopiedEvolution] = useState(false);

  const [evoStatus, setEvoStatus] = useState<EvolutionConnectionStatus | null>(null);
  const [evoActionLoading, setEvoActionLoading] = useState<string | null>(null);
  const [evoError, setEvoError] = useState("");
  const [evoNotice, setEvoNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<Agent[]>("/api/agents")
      .then((list) => {
        if (cancelled) return;
        setAgents(list);
        const initial =
          list.find((a) => a.agentKey === "booking") || list[0] || null;
        if (initial) {
          const prov = initial.whatsappProvider === "evolution" ? "evolution" : "ycloud";
          setSelectedKey(initial.agentKey);
          setOperativeProvider(prov);
          setForm({
            ...initial,
            whatsappProvider: initial.whatsappProvider || "ycloud",
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function selectAgent(agentKey: string) {
    setSelectedKey(agentKey);
    setEvoStatus(null);
    setEvoError("");
    setEvoNotice("");
    try {
      const cfg = await apiFetch<Agent>(`/api/agents/${agentKey}/config`);
      const prov = cfg.whatsappProvider === "evolution" ? "evolution" : "ycloud";
      setOperativeProvider(prov);
      setForm({
        ...cfg,
        whatsappProvider: cfg.whatsappProvider || "ycloud",
      });
    } catch {
      const found = agents.find((a) => a.agentKey === agentKey);
      if (found) {
        const prov = found.whatsappProvider === "evolution" ? "evolution" : "ycloud";
        setOperativeProvider(prov);
        setForm({
          ...found,
          whatsappProvider: found.whatsappProvider || "ycloud",
        });
      }
    }
  }

  async function fetchEvolutionStatus(agentKey: string, silent = false) {
    if (!silent) {
      setEvoActionLoading("status");
      setEvoError("");
    }
    try {
      const status = await apiFetch<EvolutionConnectionStatus>(
        `/api/agents/${agentKey}/whatsapp/evolution/status`
      );
      setEvoStatus((prev) => ({
        ...status,
        qrBase64:
          status.state === "open"
            ? null
            : (status.qrBase64 ?? prev?.qrBase64 ?? null),
        pairingCode:
          status.state === "open"
            ? null
            : (status.pairingCode ?? prev?.pairingCode ?? null),
      }));
    } catch (err) {
      if (!silent) {
        setEvoError(
          err instanceof ApiError
            ? err.message
            : "No se pudo consultar el estado de Evolution API."
        );
      }
    } finally {
      if (!silent) setEvoActionLoading(null);
    }
  }

  useEffect(() => {
    if (form && (form.whatsappProvider || "ycloud") === "evolution") {
      fetchEvolutionStatus(form.agentKey, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.agentKey, form?.whatsappProvider]);

  async function saveConfigInternal(overrideProvider?: "evolution" | "ycloud"): Promise<Agent> {
    if (!form) throw new Error("Agente no cargado");
    const targetProvider =
      overrideProvider ??
      (form.whatsappProvider === "meta"
        ? operativeProvider
        : (form.whatsappProvider || "ycloud"));
    const payload: Record<string, any> = {
      ...form,
      whatsappProvider: targetProvider,
    };
    const secretKeys = [
      "openrouterApiKey",
      "ycloudApiKey",
      "ycloudWebhookSecret",
      "evolutionApiKey",
      "evolutionWebhookSecret",
      "metaAccessToken",
      "metaAppSecret",
      "metaVerifyToken",
    ] as const;
    for (const key of secretKeys) {
      if (!payload[key] || typeof payload[key] !== "string" || !payload[key].trim()) {
        delete payload[key];
      }
    }
    const updated = await apiFetch<Agent>(
      `/api/agents/${form.agentKey}/config`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    );
    const updatedOperative =
      updated.whatsappProvider === "evolution" ? "evolution" : "ycloud";
    setOperativeProvider(updatedOperative);
    setForm((f) =>
      f
        ? {
            ...f,
            ...updated,
            whatsappProvider:
              f.whatsappProvider === "meta"
                ? "meta"
                : (updated.whatsappProvider || "ycloud"),
            openrouterApiKey: null,
            ycloudApiKey: null,
            ycloudWebhookSecret: null,
            evolutionApiKey: null,
            evolutionWebhookSecret: null,
            metaAccessToken: null,
            metaAppSecret: null,
            metaVerifyToken: null,
          }
        : null
    );
    setAgents((list) =>
      list.map((a) => (a.agentKey === updated.agentKey ? updated : a))
    );
    setSavedTick((t) => t + 1);
    return updated;
  }

  async function handleSaveWhatsapp() {
    if (!form) return;
    setSaving(true);
    setEvoError("");
    try {
      const viewingMeta = form.whatsappProvider === "meta";
      const updated = await saveConfigInternal();
      if (viewingMeta) {
        toast.success(
          `Credenciales preparadas de Meta API Oficial guardadas. El proveedor operativo sigue siendo ${operativeProvider.toUpperCase()} (Meta pendiente de activación).`
        );
      } else {
        toast.success(
          `Proveedor (${(updated.whatsappProvider || "ycloud").toUpperCase()}) y configuración de WhatsApp guardados.`
        );
      }
      if (updated.whatsappProvider === "evolution") {
        await fetchEvolutionStatus(updated.agentKey, true);
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo guardar la configuración de WhatsApp."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEvolutionConnect() {
    if (!form) return;
    setEvoActionLoading("connect");
    setEvoError("");
    setEvoNotice("");
    try {
      await saveConfigInternal("evolution");
      const res = await apiFetch<EvolutionConnectionStatus>(
        `/api/agents/${form.agentKey}/whatsapp/evolution/connect`,
        { method: "POST" }
      );
      setEvoStatus(res);
      if (res.state === "open") {
        setEvoNotice("Instancia conectada correctamente en Evolution API.");
        toast.success("WhatsApp conectado en Evolution API.");
      } else if (res.qrBase64) {
        setEvoNotice(
          "Escanea el código QR con tu móvil (WhatsApp → Dispositivos vinculados → Vincular dispositivo)."
        );
        toast.success("Código QR generado. Escanéalo con el móvil.");
      } else {
        setEvoNotice("Instancia preparada en Evolution API.");
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "No se pudo crear o conectar la instancia en Evolution API.";
      setEvoError(msg);
      toast.error(msg);
    } finally {
      setEvoActionLoading(null);
    }
  }

  async function handleEvolutionRefreshQr() {
    if (!form) return;
    setEvoActionLoading("qr");
    setEvoError("");
    try {
      const res = await apiFetch<EvolutionConnectionStatus>(
        `/api/agents/${form.agentKey}/whatsapp/evolution/qr`
      );
      setEvoStatus(res);
    } catch (err) {
      setEvoError(
        err instanceof ApiError
          ? err.message
          : "No se pudo obtener el código QR."
      );
    } finally {
      setEvoActionLoading(null);
    }
  }

  async function handleEvolutionConfigureWebhook() {
    if (!form) return;
    setEvoActionLoading("webhook");
    setEvoError("");
    setEvoNotice("");
    try {
      await saveConfigInternal("evolution");
      const res = await apiFetch<{
        ok: boolean;
        instanceName: string;
        webhookUrl: string;
        events: string[];
      }>(
        `/api/agents/${form.agentKey}/whatsapp/evolution/configure-webhook`,
        { method: "POST" }
      );
      setEvoNotice(
        `Webhook registrado en Evolution API (${res.webhookUrl}) con eventos: ${res.events.join(", ")}.`
      );
      toast.success("Webhook configurado en Evolution API.");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "No se pudo configurar el webhook en Evolution API.";
      setEvoError(msg);
      toast.error(msg);
    } finally {
      setEvoActionLoading(null);
    }
  }

  async function handleEvolutionRestart() {
    if (!form) return;
    setEvoActionLoading("restart");
    setEvoError("");
    setEvoNotice("");
    try {
      const res = await apiFetch<{
        ok: boolean;
        instanceName: string;
        state: string;
      }>(`/api/agents/${form.agentKey}/whatsapp/evolution/restart`, {
        method: "POST",
      });
      setEvoNotice(`Instancia '${res.instanceName}' reiniciada.`);
      toast.success("Instancia reiniciada.");
      await fetchEvolutionStatus(form.agentKey, true);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "No se pudo reiniciar la instancia.";
      setEvoError(msg);
      toast.error(msg);
    } finally {
      setEvoActionLoading(null);
    }
  }

  async function handleEvolutionDisconnect() {
    if (!form) return;
    setEvoActionLoading("disconnect");
    setEvoError("");
    setEvoNotice("");
    try {
      const res = await apiFetch<{
        ok: boolean;
        instanceName: string;
        state: "close";
      }>(`/api/agents/${form.agentKey}/whatsapp/evolution/disconnect`, {
        method: "POST",
      });
      setEvoStatus({
        provider: "evolution",
        state: res.state,
        instanceName: res.instanceName,
        qrBase64: null,
        pairingCode: null,
      });
      setEvoNotice(`Instancia '${res.instanceName}' desconectada.`);
      toast.success("Instancia de WhatsApp desconectada.");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "No se pudo desconectar la instancia.";
      setEvoError(msg);
      toast.error(msg);
    } finally {
      setEvoActionLoading(null);
    }
  }

  if (loading || !form) return null;

  const ycloudWebhookUrl = apiUrl(`/api/webhooks/ycloud/${form.agentKey}`);
  const evolutionWebhookUrl = apiUrl(`/api/webhooks/evolution/${form.agentKey}`);
  const activeProvider = form.whatsappProvider || "ycloud";

  return (
    <div className="mt-6 max-w-xl rounded-xl border border-indigo-200 bg-white p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-semibold text-neutral-900">
              Proveedor de WhatsApp y Conexión (Evolution API / YCloud / Meta Oficial)
            </h2>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Selecciona el proveedor de WhatsApp por agente y configura sus credenciales sin borrar las de los demás proveedores. Proveedor operativo actual:{" "}
            <strong className="text-indigo-700 uppercase">{operativeProvider}</strong>.
          </p>
        </div>
        {agents.length > 0 && (
          <div className="sm:w-48 shrink-0">
            <label className="mb-1 block text-[11px] font-medium text-neutral-600">
              Agente
            </label>
            <select
              className="block w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 focus:border-indigo-500 focus:outline-none"
              value={selectedKey}
              onChange={(e) => selectAgent(e.target.value)}
            >
              {agents.map((a) => (
                <option key={a.agentKey} value={a.agentKey}>
                  {a.businessName} ({a.agentKey})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Selector de Método / Proveedor */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3.5 space-y-2">
        <label className="block text-xs font-semibold text-neutral-800">
          Proveedor WhatsApp:
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            {
              id: "evolution" as const,
              title: "Evolution API",
              subtitle: "Conexión QR / Instancia v2",
            },
            {
              id: "ycloud" as const,
              title: "YCloud",
              subtitle: "WhatsApp Business API",
            },
            {
              id: "meta" as const,
              title: "Meta API Oficial",
              subtitle: "Preparado / Pendiente",
            },
          ].map((opt) => {
            const selected = activeProvider === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  setForm((f) =>
                    f ? { ...f, whatsappProvider: opt.id } : null
                  )
                }
                className={cn(
                  "flex flex-col items-start rounded-lg border p-2.5 text-left transition-all",
                  selected
                    ? "border-indigo-600 bg-indigo-50/90 ring-1 ring-indigo-600"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                )}
              >
                <span
                  className={cn(
                    "text-xs font-semibold",
                    selected ? "text-indigo-900" : "text-neutral-800"
                  )}
                >
                  [ {opt.title} ]
                </span>
                <span className="text-[11px] text-neutral-500">
                  {opt.subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── MODO 1: EVOLUTION API (QR / INSTANCIA / WEBHOOK) ─── */}
      {activeProvider === "evolution" && (
        <div className="space-y-4 pt-2 border-t border-neutral-100">
          {/* Estado de la instancia + Botones de control */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <QrCode className="h-4 w-4 text-indigo-600" />
                <span className="text-xs font-semibold text-neutral-700">
                  Estado de conexión:
                </span>
                {(() => {
                  const st = evoStatus?.state;
                  const hasQr = !!evoStatus?.qrBase64 && st !== "open";
                  if (evoActionLoading === "connect") {
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                        <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                        CREANDO INSTANCIA
                      </span>
                    );
                  }
                  if (evoError && (!st || st === "unknown")) {
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        ERROR
                      </span>
                    );
                  }
                  if (st === "open") {
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        CONECTADO
                      </span>
                    );
                  }
                  if (hasQr) {
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                        ESPERANDO QR
                      </span>
                    );
                  }
                  if (st === "connecting") {
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                        <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        CONECTANDO
                      </span>
                    );
                  }
                  if (st === "close") {
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
                        <span className="h-2 w-2 rounded-full bg-neutral-500" />
                        DESCONECTADO
                      </span>
                    );
                  }
                  if (st === "unknown") {
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        ERROR
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">
                      <span className="h-2 w-2 rounded-full bg-neutral-400" />
                      SIN CONFIGURAR
                    </span>
                  );
                })()}
              </div>
              {evoStatus?.state === "open" && (
                <span className="text-xs font-semibold text-emerald-800">
                  Número conectado: {form.whatsappNumber || "+34 646 034 231"}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleEvolutionConnect}
                disabled={!!evoActionLoading}
              >
                <QrCode className="h-3.5 w-3.5" />
                {evoActionLoading === "connect"
                  ? "Creando instancia…"
                  : "Crear / Conectar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleEvolutionRefreshQr}
                disabled={!!evoActionLoading}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    evoActionLoading === "qr" && "animate-spin"
                  )}
                />
                Actualizar QR
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => fetchEvolutionStatus(form.agentKey, false)}
                disabled={!!evoActionLoading}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    evoActionLoading === "status" && "animate-spin"
                  )}
                />
                Actualizar estado
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleEvolutionConfigureWebhook}
                disabled={!!evoActionLoading}
              >
                {evoActionLoading === "webhook"
                  ? "Configurando…"
                  : "Configurar Webhook"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleEvolutionRestart}
                disabled={!!evoActionLoading}
              >
                {evoActionLoading === "restart" ? "Reiniciando…" : "Reiniciar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={handleEvolutionDisconnect}
                disabled={!!evoActionLoading}
              >
                {evoActionLoading === "disconnect"
                  ? "Desconectando…"
                  : "Desconectar"}
              </Button>
            </div>
          </div>

          {evoStatus?.detail && (
            <p className="text-xs text-neutral-500">{evoStatus.detail}</p>
          )}
          {evoNotice && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {evoNotice}
            </p>
          )}
          {evoError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {evoError}
            </p>
          )}

          {/* Tarjeta cuando la instancia está CONECTADA */}
          {evoStatus?.state === "open" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-300">
                    🟢 CONECTADO
                  </span>
                  <span className="text-xs font-semibold text-emerald-950">
                    {form.businessName} ({form.agentKey})
                  </span>
                </div>
                <p className="text-xs text-emerald-900">
                  Número conectado:{" "}
                  <strong>{form.whatsappNumber || "+34 646 034 231"}</strong> · Instancia:{" "}
                  <code className="font-mono font-semibold">
                    {evoStatus.instanceName || form.evolutionInstanceName || "salvadora_whatsapp"}
                  </code>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => fetchEvolutionStatus(form.agentKey, false)}
                  disabled={!!evoActionLoading}
                >
                  Actualizar estado
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={handleEvolutionDisconnect}
                  disabled={!!evoActionLoading}
                >
                  Desconectar
                </Button>
              </div>
            </div>
          )}

          {/* Tarjeta propia del CRM para el QR real de Evolution API */}
          {evoStatus?.qrBase64 && evoStatus.state !== "open" && (
            <div className="rounded-2xl border-2 border-indigo-200 bg-white p-5 shadow-sm space-y-4">
              <div className="border-b border-neutral-100 pb-3">
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-indigo-600" />
                  Conectar WhatsApp
                </h3>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-xs text-neutral-700">
                  <div>
                    <span className="font-medium text-neutral-500">Agente:</span>{" "}
                    <span className="font-semibold text-neutral-900">
                      {form.businessName || form.agentKey}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-neutral-500">Número:</span>{" "}
                    <span className="font-semibold text-neutral-900">
                      {form.whatsappNumber || "+34 646 034 231"}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-neutral-500">Instancia:</span>{" "}
                    <code className="font-mono font-semibold text-indigo-700">
                      {evoStatus.instanceName ||
                        form.evolutionInstanceName ||
                        "salvadora_whatsapp"}
                    </code>
                  </div>
                </div>
                <div className="mt-2 text-xs font-semibold text-amber-800">
                  Estado: 🟠 Esperando vinculación
                </div>
              </div>

              <div className="flex flex-col items-center justify-center py-2">
                <div className="rounded-xl bg-white p-4 shadow-sm border border-neutral-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      evoStatus.qrBase64.startsWith("data:image")
                        ? evoStatus.qrBase64
                        : `data:image/png;base64,${evoStatus.qrBase64}`
                    }
                    alt="Código QR oficial de Evolution API"
                    className="h-64 w-64 object-contain bg-white"
                  />
                </div>
              </div>

              {evoStatus.pairingCode && (
                <p className="text-center text-xs text-neutral-600">
                  Código de vinculación:{" "}
                  <code className="rounded bg-neutral-50 px-2 py-0.5 font-mono font-semibold text-indigo-700 border border-indigo-200">
                    {evoStatus.pairingCode}
                  </code>
                </p>
              )}

              <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3 text-xs text-neutral-700 space-y-1">
                <p className="font-semibold text-neutral-900">
                  Abre WhatsApp en el teléfono:
                </p>
                <p>Ajustes / Dispositivos vinculados</p>
                <p>→ Vincular dispositivo</p>
                <p>→ Escanea este código</p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleEvolutionRefreshQr}
                  disabled={!!evoActionLoading}
                >
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5",
                      evoActionLoading === "qr" && "animate-spin"
                    )}
                  />
                  Actualizar QR
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => fetchEvolutionStatus(form.agentKey, false)}
                  disabled={!!evoActionLoading}
                >
                  Actualizar estado
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Número WhatsApp
              </label>
              <Input
                placeholder="+34 646 034 231"
                value={form.whatsappNumber ?? ""}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, whatsappNumber: e.target.value || null } : null
                  )
                }
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Número dedicado vinculado a la instancia (ej: +34 646 034 231).
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Nombre instancia
              </label>
              <Input
                placeholder="salvadora_whatsapp"
                value={form.evolutionInstanceName ?? ""}
                onChange={(e) =>
                  setForm((f) =>
                    f
                      ? { ...f, evolutionInstanceName: e.target.value || null }
                      : null
                  )
                }
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Nombre único de la instancia (ej: salvadora_whatsapp).
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              URL Evolution API
            </label>
            <Input
              placeholder="https://evolutionapi.jigretera.com"
              value={form.evolutionApiUrl ?? ""}
              onChange={(e) =>
                setForm((f) =>
                  f ? { ...f, evolutionApiUrl: e.target.value || null } : null
                )
              }
            />
          </div>

          <SecretInput
            key={`settings-evo-api-${savedTick}`}
            label="Evolution API Key"
            placeholder="Clave global o de instancia de Evolution API"
            hasValue={!!form.hasEvolutionApiKey}
            value={form.evolutionApiKey}
            onChange={(v) =>
              setForm((f) => (f ? { ...f, evolutionApiKey: v } : null))
            }
            hint="Cabecera apikey hacia Evolution API (nunca se expone en texto plano tras guardar)."
          />

          <SecretInput
            key={`settings-evo-secret-${savedTick}`}
            label="Webhook Secret (x-evolution-secret)"
            placeholder="Secreto para autenticar los webhooks de Evolution API"
            hasValue={!!form.hasEvolutionWebhookSecret}
            value={form.evolutionWebhookSecret}
            onChange={(v) =>
              setForm((f) => (f ? { ...f, evolutionWebhookSecret: v } : null))
            }
            hint="Validación fail-closed mediante la cabecera x-evolution-secret."
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Endpoint de Webhook del CRM para Evolution API
            </label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={evolutionWebhookUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(evolutionWebhookUrl);
                  setCopiedEvolution(true);
                  setTimeout(() => setCopiedEvolution(false), 2000);
                }}
              >
                {copiedEvolution ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODO 2: YCLOUD ─── */}
      {activeProvider === "ycloud" && (
        <div className="space-y-4 pt-2 border-t border-neutral-100">
          <SecretInput
            key={`settings-ycloud-api-${savedTick}`}
            label="Clave de API de YCloud"
            placeholder="Tu API key de YCloud"
            hasValue={!!form.hasYcloudApiKey}
            value={form.ycloudApiKey}
            onChange={(v) =>
              setForm((f) => (f ? { ...f, ycloudApiKey: v } : null))
            }
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Número de WhatsApp
            </label>
            <Input
              placeholder="+34600000000"
              value={form.whatsappNumber ?? ""}
              onChange={(e) =>
                setForm((f) =>
                  f ? { ...f, whatsappNumber: e.target.value || null } : null
                )
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              URL del webhook (pégala en YCloud)
            </label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={ycloudWebhookUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(ycloudWebhookUrl);
                  setCopiedYcloud(true);
                  setTimeout(() => setCopiedYcloud(false), 2000);
                }}
              >
                {copiedYcloud ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </>
                )}
              </Button>
            </div>
          </div>
          <SecretInput
            key={`settings-ycloud-secret-${savedTick}`}
            label="Webhook secret de YCloud"
            placeholder="Secret que te da YCloud al crear el webhook"
            hasValue={!!form.hasYcloudWebhookSecret}
            value={form.ycloudWebhookSecret}
            onChange={(v) =>
              setForm((f) => (f ? { ...f, ycloudWebhookSecret: v } : null))
            }
          />
        </div>
      )}

      {/* ─── MODO 3: META CLOUD API OFICIAL ─── */}
      {activeProvider === "meta" && (
        <div className="space-y-4 pt-2 border-t border-neutral-100">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>Meta API Oficial — preparado / pendiente de activación:</strong>{" "}
            Puedes dejar guardadas las credenciales de Meta Cloud API por adelantado sin perder la configuración de Evolution API ni de YCloud. No se activará como proveedor operativo hasta que <code>MetaProvider</code> esté habilitado.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Phone Number ID (Meta)
              </label>
              <Input
                placeholder="Ej. 102938475610293"
                value={form.metaPhoneNumberId ?? ""}
                onChange={(e) =>
                  setForm((f) =>
                    f
                      ? { ...f, metaPhoneNumberId: e.target.value || null }
                      : null
                  )
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                WhatsApp Business Account ID (WABA ID)
              </label>
              <Input
                placeholder="Ej. 998877665544332"
                value={form.metaWabaId ?? ""}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, metaWabaId: e.target.value || null } : null
                  )
                }
              />
            </div>
          </div>
          <SecretInput
            key={`settings-meta-token-${savedTick}`}
            label="Access Token permanente de Meta"
            placeholder="EAAG..."
            hasValue={!!form.hasMetaAccessToken}
            value={form.metaAccessToken}
            onChange={(v) =>
              setForm((f) => (f ? { ...f, metaAccessToken: v } : null))
            }
          />
          <SecretInput
            key={`settings-meta-secret-${savedTick}`}
            label="App Secret de Meta"
            placeholder="App Secret para verificar X-Hub-Signature-256"
            hasValue={!!form.hasMetaAppSecret}
            value={form.metaAppSecret}
            onChange={(v) =>
              setForm((f) => (f ? { ...f, metaAppSecret: v } : null))
            }
          />
          <SecretInput
            key={`settings-meta-verify-${savedTick}`}
            label="Verify Token del Webhook de Meta"
            placeholder="Token de verificación GET hub.verify_token"
            hasValue={!!form.hasMetaVerifyToken}
            value={form.metaVerifyToken}
            onChange={(v) =>
              setForm((f) => (f ? { ...f, metaVerifyToken: v } : null))
            }
          />
        </div>
      )}

      <div className="pt-2 flex items-center gap-3">
        <Button type="button" onClick={handleSaveWhatsapp} disabled={saving}>
          <Upload className="h-4 w-4" />
          {saving ? "Guardando…" : "Guardar proveedor y configuración"}
        </Button>
      </div>
    </div>
  );
}

// ─── Utilidad Admin: Enviar WhatsApp (Texto + Adjuntos) ─────────────────────────

interface WhatsappAdminSendResult {
  ok: boolean;
  provider: string;
  agentKey: string;
  to: string;
  threadId: string;
  status: string;
  providerMessageId: string | null;
  providerMessageIds: string[];
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

function WhatsappAdminSenderCard() {
  const toast = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentKey, setAgentKey] = useState("booking");
  const [toPhone, setToPhone] = useState("");
  const [messageText, setMessageText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<WhatsappAdminSendResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<Agent[]>("/api/agents")
      .then((list) => {
        setAgents(list);
        if (list.length > 0 && !list.some((a) => a.agentKey === "booking")) {
          setAgentKey(list[0].agentKey);
        }
      })
      .catch(() => {});
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > 101 * 1024 * 1024) {
      setErrorMsg("El archivo no puede superar los 101 MB.");
      toast.error("El archivo no puede superar los 101 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setErrorMsg("");
    setResult(null);
  }

  function clearFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setResult(null);

    const cleanTo = toPhone.trim();
    const cleanMsg = messageText.trim();

    if (!cleanTo) {
      setErrorMsg("Indica el teléfono destino (ej: +34600111222).");
      return;
    }

    if (!cleanMsg && !selectedFile) {
      setErrorMsg("Escribe un mensaje de texto, adjunta un archivo o ambos.");
      return;
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.append("agentKey", agentKey);
      formData.append("to", cleanTo);
      if (cleanMsg) {
        formData.append("message", cleanMsg);
      }
      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      const res = await apiFetch<WhatsappAdminSendResult>(
        "/api/whatsapp/admin/send",
        {
          method: "POST",
          body: formData,
        }
      );

      setResult(res);
      setMessageText("");
      clearFile();
      toast.success(`WhatsApp enviado correctamente a ${res.to} (${res.provider}).`);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "No se pudo enviar el mensaje de WhatsApp.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  const isMp3WithText =
    selectedFile?.name.toLowerCase().endsWith(".mp3") &&
    messageText.trim().length > 0;

  return (
    <div className="mt-6 max-w-xl rounded-xl border border-neutral-200 bg-white p-6 shadow-xs space-y-4">
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5 text-emerald-600" />
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">
            Enviar WhatsApp (Envío Manual Admin)
          </h2>
          <p className="text-xs text-neutral-500">
            Envía un mensaje de texto y/o archivo adjunto a cualquier teléfono (exista o no en Contactos). Queda registrado en Inbox y Auditoría, y funciona incluso con la automatización global en pausa.
          </p>
        </div>
      </div>

      <form onSubmit={handleSend} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Agente
            </label>
            <select
              className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              value={agentKey}
              onChange={(e) => setAgentKey(e.target.value)}
            >
              {agents.length === 0 ? (
                <option value="booking">booking</option>
              ) : (
                agents.map((a) => (
                  <option key={a.agentKey} value={a.agentKey}>
                    {a.businessName} ({a.agentKey})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Teléfono destino
            </label>
            <Input
              placeholder="+34600111222"
              value={toPhone}
              onChange={(e) => setToPhone(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Mensaje / texto {selectedFile ? "(opcional)" : ""}
          </label>
          <textarea
            rows={3}
            className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none"
            placeholder="Escribe aquí el mensaje de WhatsApp o el comentario del archivo adjunto…"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Archivo adjunto (opcional · máx. 101 MB: .pdf, .docx, .xlsx, .txt, .mp3, .mp4)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.txt,.mp3,.mp4,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,audio/mpeg,video/mp4"
              onChange={handleFileChange}
              className="block text-xs text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {selectedFile && (
              <button
                type="button"
                onClick={clearFile}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Quitar archivo ({selectedFile.name})
              </button>
            )}
          </div>
          {isMp3WithText && (
            <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1">
              ℹ️ WhatsApp no admite texto adjunto (caption) en audios MP3: se enviará primero el mensaje de texto y a continuación el audio MP3.
            </p>
          )}
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1">
            <div className="font-semibold">
              ✅ Envío completado ({result.status.toUpperCase()})
            </div>
            <div>
              <strong>Proveedor:</strong> {result.provider} ·{" "}
              <strong>Destino:</strong> {result.to} ·{" "}
              <strong>Conversación:</strong> <code>{result.threadId}</code>
            </div>
            {result.filename && (
              <div>
                <strong>Archivo:</strong> {result.filename} ({result.mimeType})
              </div>
            )}
            {result.providerMessageIds && result.providerMessageIds.length > 1 ? (
              <div>
                <strong>providerMessageIds:</strong>{" "}
                <code>{result.providerMessageIds.join(", ")}</code>
              </div>
            ) : (
              <div>
                <strong>providerMessageId:</strong>{" "}
                <code>{result.providerMessageId || "N/A"}</code>
              </div>
            )}
          </div>
        )}

        <div className="pt-1">
          <Button type="submit" disabled={sending}>
            <Send className="h-4 w-4" />
            {sending ? "Enviando WhatsApp…" : "Enviar WhatsApp"}
          </Button>
        </div>
      </form>
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
  const [serviciosEnMantenimiento, setServiciosEnMantenimiento] = useState<"S" | "N">("N");
  const [whatsappAutomationPaused, setWhatsappAutomationPaused] = useState(false);
  const [savingWhatsappPause, setSavingWhatsappPause] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleteDemoOpen, setDeleteDemoOpen] = useState(false);
  const [deletingDemo, setDeletingDemo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AppSettings>("/api/settings")
      .then((data) => {
        if (cancelled) return;
        setBusinessName(data.businessName);
        setBrandColor(data.brandColor);
        setLogoUrl(data.logoUrl);
        setServiciosEnMantenimiento(
          data.serviciosEnMantenimiento === "S" ? "S" : "N"
        );
        setWhatsappAutomationPaused(Boolean(data.whatsappAutomationPaused));
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
          serviciosEnMantenimiento,
          whatsappAutomationPaused,
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

  async function handleToggleWhatsappPause(nextPaused: boolean) {
    setSavingWhatsappPause(true);
    try {
      const updated = await apiFetch<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          whatsappAutomationPaused: nextPaused,
        }),
      });
      setWhatsappAutomationPaused(Boolean(updated.whatsappAutomationPaused));
      toast.success(
        updated.whatsappAutomationPaused
          ? "Automatización de WhatsApp PAUSADA. Los mensajes entrantes seguirán llegando al Inbox, pero el agente no responderá automáticamente."
          : "Automatización de WhatsApp ACTIVA. El agente y los envíos automáticos vuelven a estar operativos."
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo actualizar el estado de WhatsApp automático."
      );
    } finally {
      setSavingWhatsappPause(false);
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

  async function handleResetTestData() {
    setResetting(true);
    try {
      const res = await apiFetch<{ ok: boolean; contactsReset: number }>(
        "/api/settings/reset-test-data",
        { method: "POST" }
      );
      setResetOpen(false);
      toast.success(
        `✅ Entorno reiniciado para pruebas (${res.contactsReset} contactos reseteados a leads).`
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Error al reiniciar el entorno de pruebas."
      );
    } finally {
      setResetting(false);
    }
  }

  async function handleDeleteDemoData() {
    setDeletingDemo(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        deletedContacts: number;
        deletedAppointments: number;
        deletedMessages: number;
        deletedCalls?: number;
      }>("/api/settings/delete-demo-data", { method: "POST" });
      setDeleteDemoOpen(false);
      toast.success(
        `✅ Datos de prueba eliminados (${res.deletedContacts} contactos, ${res.deletedAppointments} citas y ${res.deletedCalls ?? 0} llamadas de prueba). Los clientes reales se conservan intactos.`
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error al eliminar los datos de prueba."
      );
    } finally {
      setDeletingDemo(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-neutral-400">Cargando…</div>;
  }

  return (
    <SensitiveAccessGate
      title="Ajustes del Sistema"
      description="Esta sección contiene configuraciones confidenciales del CRM, pasarelas de pago, correo SMTP, telefonía y datos de la empresa."
    >
      <div className="p-4 sm:p-8">
        <h1 className="text-xl font-semibold text-neutral-900">Ajustes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Personaliza la marca y gestiona los datos de la aplicación.
        </p>

      {/* Servicios en Mantenimiento */}
      <div
        className={cn(
          "mt-6 max-w-xl rounded-xl border p-6 transition-all shadow-xs",
          serviciosEnMantenimiento === "S"
            ? "border-red-300 bg-red-50/70"
            : "border-neutral-200 bg-white"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert
                className={cn(
                  "h-5 w-5",
                  serviciosEnMantenimiento === "S"
                    ? "text-red-600"
                    : "text-neutral-500"
                )}
              />
              <h2 className="text-sm font-semibold text-neutral-800">
                Servicios en Mantenimiento
              </h2>
            </div>
            <p className="mt-1 text-xs text-neutral-600">
              Control general de operatividad. Cuando esté en <strong>'S'</strong>, todos los servicios de la Escuela de Yoga responderán indicando que no están operativos y no se gestionará ninguna reserva (afectando a WhatsApp, burbuja web y VAPI).
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0",
              serviciosEnMantenimiento === "S"
                ? "bg-red-100 text-red-800 border border-red-200"
                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
            )}
          >
            {serviciosEnMantenimiento === "S"
              ? "Mantenimiento Activo (S)"
              : "Operativo Normal (N)"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Estado de los servicios:
          </label>
          <select
            value={serviciosEnMantenimiento}
            onChange={(e) =>
              setServiciosEnMantenimiento(e.target.value as "S" | "N")
            }
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold shadow-xs focus:border-indigo-500 focus:outline-none"
          >
            <option value="N">N — Operativo Normal (Servicios activos)</option>
            <option value="S">S — Servicios en Mantenimiento (Bloquear reservas)</option>
          </select>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Guardando…" : "Guardar Estado"}
          </Button>
        </div>

        {serviciosEnMantenimiento === "S" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-100/90 p-3 text-xs text-red-900 leading-relaxed shadow-2xs">
            ⚠️ <strong>Modo Mantenimiento Activado:</strong> Todos los canales (WhatsApp, burbuja web y VAPI) responderán:
            <div className="mt-1.5 rounded bg-white/90 p-2 font-mono text-[11px] text-red-950 border border-red-200">
              "Los servicios en línea de la Escuela de Yoga de Salvadora Conesa No están operativos en estos momentos Intentelo más tarde "
            </div>
          </div>
        )}
      </div>

      {/* Pausa Global de Automatización de WhatsApp */}
      <div
        className={cn(
          "mt-6 max-w-xl rounded-xl border p-6 transition-all shadow-xs",
          whatsappAutomationPaused
            ? "border-amber-300 bg-amber-50/70"
            : "border-neutral-200 bg-white"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Bot
                className={cn(
                  "h-5 w-5",
                  whatsappAutomationPaused
                    ? "text-amber-600"
                    : "text-emerald-600"
                )}
              />
              <h2 className="text-sm font-semibold text-neutral-800">
                WhatsApp automático: {whatsappAutomationPaused ? "PAUSADO" : "ACTIVO"}
              </h2>
            </div>
            <p className="mt-1 text-xs text-neutral-600">
              Pausa global de la automatización de WhatsApp sin desconectar la sesión ni cerrar el número. Cuando está <strong>PAUSADO</strong>, los mensajes entrantes siguen guardándose y mostrándose en el Inbox, pero no se ejecuta la IA ni se envían respuestas, recordatorios o notificaciones automáticas. Los envíos manuales desde el Inbox siguen permitidos.
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0",
              whatsappAutomationPaused
                ? "bg-amber-100 text-amber-900 border border-amber-300"
                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
            )}
          >
            WhatsApp automático: {whatsappAutomationPaused ? "PAUSADO" : "ACTIVO"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={whatsappAutomationPaused ? "primary" : "secondary"}
            size="sm"
            disabled={savingWhatsappPause}
            onClick={() => handleToggleWhatsappPause(!whatsappAutomationPaused)}
            className={cn(
              whatsappAutomationPaused
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "border-amber-400 bg-amber-100/80 hover:bg-amber-200 text-amber-950"
            )}
          >
            {savingWhatsappPause
              ? "Actualizando…"
              : whatsappAutomationPaused
              ? "Reanudar WhatsApp automático (ACTIVO)"
              : "Pausar WhatsApp automático (PAUSADO)"}
          </Button>
        </div>

        {whatsappAutomationPaused && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-100/90 p-3 text-xs text-amber-950 leading-relaxed shadow-2xs">
            ⏸️ <strong>Automatización global de WhatsApp en PAUSA:</strong> Los mensajes entrantes siguen registrándose en Conversaciones/Inbox y puedes contestar manualmente, pero el agente IA y los avisos automáticos por WhatsApp están detenidos.
          </div>
        )}
      </div>

      {/* Proveedor de WhatsApp y Conexión (Evolution API / YCloud / Meta Oficial) */}
      <WhatsappProviderCard />

      {/* Utilidad Admin: Enviar WhatsApp Manual (Texto y Archivos) */}
      <WhatsappAdminSenderCard />

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

      {/* Avisos de Atención Humana (Escalado) */}
      <HumanNoticeCard />

      {/* Test environment reset card */}
      <div className="mt-6 max-w-xl rounded-xl border border-amber-300 bg-amber-50/60 p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-amber-700" />
          <h2 className="text-sm font-semibold text-amber-900">
            Entorno de Pruebas — Reiniciar para Pruebas
          </h2>
        </div>
        <p className="mt-1 text-sm text-neutral-700">
          Reinicia la base de datos de pruebas (DGX SPARC) para ejecutar nuevos ensayos sin agotar los datos:
        </p>
        <ul className="mt-2.5 list-disc list-inside text-xs text-neutral-600 space-y-1">
          <li><strong>Contactos:</strong> Todos pasan a estado <em>lead</em> y etapa <em>nueva</em>; se desactivan como alumnos de yoga.</li>
          <li><strong>Conversaciones:</strong> Se eliminan por completo todas las conversaciones y mensajes de chat.</li>
          <li><strong>Citas:</strong> Se eliminan todas las citas y recordatorios de la agenda.</li>
          <li><strong>Llamadas:</strong> Se eliminan todas las llamadas telefónicas y registros SMS.</li>
          <li><strong>Auditorías:</strong> Se limpia el registro de auditoría.</li>
          <li><strong>Embudo:</strong> Las métricas del embudo vuelven al estado inicial (0 citas, todos leads).</li>
        </ul>
        <Button
          variant="secondary"
          className="mt-4 border-amber-400 bg-amber-100/80 hover:bg-amber-200 text-amber-900 font-medium"
          onClick={() => setResetOpen(true)}
        >
          <RefreshCw className="h-4 w-4 text-amber-800" />
          Reiniciar para Pruebas
        </Button>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reiniciar entorno para pruebas"
      >
        <div className="space-y-2 text-sm text-neutral-600">
          <p>
            ¿Estás seguro de reiniciar el entorno de pruebas?
          </p>
          <ul className="list-disc list-inside text-xs text-neutral-600 space-y-1">
            <li>Los <strong>contactos se conservan</strong>, pero pasan todos a <em>lead</em> (no alumnos).</li>
            <li>Se borran todas las <strong>conversaciones y mensajes</strong>.</li>
            <li>Se borran todas las <strong>citas</strong>.</li>
            <li>Se borran las <strong>llamadas telefónicas y SMS</strong>.</li>
            <li>Se borran las <strong>auditorías</strong> y se resetea el <strong>embudo</strong>.</li>
          </ul>
          <p className="pt-2 text-xs font-semibold text-amber-800">
            Esta acción restablece el sistema limpio para nuevas pruebas.
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setResetOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleResetTestData}
            disabled={resetting}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {resetting ? "Reiniciando…" : "Confirmar Reinicio"}
          </Button>
        </div>
      </Modal>

      {/* Eliminar sólo datos de prueba (Safe for production) */}
      <div className="mt-6 max-w-xl rounded-xl border border-indigo-200 bg-indigo-50/40 p-6">
        <h2 className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          Eliminar únicamente datos de prueba (Seguro para Producción)
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Elimina <strong>sólo los contactos y citas de prueba</strong> (aquellos con etiqueta <em>&quot;demo&quot;</em> o correos de prueba).
          <strong> Tus clientes, citas y mensajes reales se conservan al 100%</strong> sin necesidad de restaurar copias de seguridad.
        </p>
        <Button
          variant="secondary"
          className="mt-3 border-indigo-300 bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-medium"
          onClick={() => setDeleteDemoOpen(true)}
        >
          <Trash2 className="h-4 w-4 text-indigo-700" />
          Eliminar datos de prueba
        </Button>
      </div>

      <Modal
        open={deleteDemoOpen}
        onClose={() => setDeleteDemoOpen(false)}
        title="Eliminar únicamente datos de prueba"
      >
        <div className="space-y-2 text-sm text-neutral-600">
          <p>
            Esta acción buscará y eliminará <strong>solamente los registros de prueba / demostración</strong>:
          </p>
          <ul className="list-disc list-inside text-xs text-neutral-600 space-y-1">
            <li>Contactos con etiqueta <em>&quot;demo&quot;</em> o correos <em>@example.com</em>.</li>
            <li>Citas, recordatorios y chats asociados a esos contactos de prueba.</li>
            <li>Llamadas telefónicas y transcripciones de prueba de VAPI.</li>
            <li><strong>Tus clientes, citas y llamadas reales NO se borrarán.</strong></li>
          </ul>
          <p className="pt-2 text-xs font-semibold text-indigo-900">
            ¿Deseas proceder con la eliminación de los datos de prueba?
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteDemoOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteDemoData}
            disabled={deletingDemo}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {deletingDemo ? "Eliminando…" : "Confirmar eliminación"}
          </Button>
        </div>
      </Modal>

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
    </SensitiveAccessGate>
  );
}
