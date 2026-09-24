"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldAlert, Upload, Trash2, Bot, Mail, Send, CreditCard, Copy, Check, Video, PhoneCall, RefreshCw, FileText, UserCheck, Bell } from "lucide-react";
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
        ok: boolean;
        results: {
          email?: { attempted: boolean; success: boolean; error?: string };
          sms?: { attempted: boolean; success: boolean; error?: string };
          vapi?: { attempted: boolean; success: boolean; error?: string };
        };
      }>("/api/notifications/test-human-notice", {
        method: "POST",
      });

      const parts: string[] = [];
      if (res.results.email?.attempted) {
        parts.push(`Email: ${res.results.email.success ? "✓ Enviado" : "✗ Falló"}`);
      }
      if (res.results.sms?.attempted) {
        parts.push(`SMS: ${res.results.sms.success ? "✓ Enviado" : "✗ Falló"}`);
      }
      if (res.results.vapi?.attempted) {
        parts.push(`Llamada VAPI: ${res.results.vapi.success ? "✓ Iniciada" : "✗ Falló"}`);
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
            Móvil de aviso (SMS y llamadas salientes VAPI)
          </label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+34 695 17 26 25"
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            Número al que se enviará el SMS urgente y/o donde llamará la IA de VAPI al responsable.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Email de aviso
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jigomez@hotmail.com"
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            Dirección donde se enviará el correo con los datos del contacto y resumen.
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

export default function SettingsPage() {
  const { user } = useAuth();
  const branding = useBranding();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState("");
  const [brandColor, setBrandColor] = useState("#4f46e5");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [serviciosEnMantenimiento, setServiciosEnMantenimiento] = useState<"S" | "N">("N");
  const [saving, setSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
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

  if (loading) {
    return <div className="p-8 text-sm text-neutral-400">Cargando…</div>;
  }

  return (
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
