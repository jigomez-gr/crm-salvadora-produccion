"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import {
  ArrowLeft,
  Phone,
  Mail,
  FileText,
  Calendar,
  BellOff,
  Bell,
  ShieldX,
  Send,
  CreditCard,
  Copy,
  ExternalLink,
  Video,
  Paperclip,
} from "lucide-react";
import Link from "next/link";
import { apiFetch, ApiError, apiUrl } from "@/lib/api";
import {
  ContactWithAppointments,
  Appointment,
  EmailMessage,
  EmailStatus,
} from "@/lib/types";
import { CONTACT_STATUS_META } from "@/lib/contacts";
import { useToast } from "@/contexts/ToastContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { ResponseDocumentModal } from "@/components/ResponseDocumentModal";
import { ImageCropModal, SPECIALTIES, SpecialtyType } from "@/components/ImageCropModal";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

function statusVariant(status: Appointment["status"]) {
  if (status === "scheduled") return "info";
  if (status === "completed") return "success";
  return "danger";
}

function statusLabel(status: Appointment["status"]) {
  if (status === "scheduled") return "programada";
  if (status === "completed") return "completada";
  return "cancelada";
}

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const toast = useToast();
  const [contact, setContact] = useState<ContactWithAppointments | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [anonOpen, setAnonOpen] = useState(false);

  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedDocAppt, setSelectedDocAppt] = useState<Appointment | null>(null);
  const [aiCropAppt, setAiCropAppt] = useState<Appointment | null>(null);
  const [aiSpecialty, setAiSpecialty] = useState<SpecialtyType>("dental");

  useEffect(() => {
    apiFetch<ContactWithAppointments>(`/api/contacts/${id}`)
      .then(setContact)
      .catch(() => {})
      .finally(() => setLoading(false));
    apiFetch<EmailStatus>("/api/email/status")
      .then(setEmailStatus)
      .catch(() => {});
    apiFetch<EmailMessage[]>(`/api/email/contact/${id}`)
      .then(setEmails)
      .catch(() => {});
  }, [id]);

  async function sendEmail() {
    if (!subject.trim() || !emailBody.trim()) return;
    setSending(true);
    try {
      const msg = await apiFetch<EmailMessage>("/api/email/send", {
        method: "POST",
        body: JSON.stringify({ contactId: id, subject, body: emailBody }),
      });
      setEmails((prev) => [msg, ...prev]);
      setEmailOpen(false);
      setSubject("");
      setEmailBody("");
      toast.success("Correo enviado.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo enviar el correo."
      );
    } finally {
      setSending(false);
    }
  }

  async function refresh() {
    const fresh = await apiFetch<ContactWithAppointments>(
      `/api/contacts/${id}`
    ).catch(() => null);
    if (fresh) setContact(fresh);
  }

  async function toggleOptOut() {
    if (!contact) return;
    setBusy(true);
    try {
      await apiFetch(`/api/contacts/${id}/consent`, {
        method: "POST",
        body: JSON.stringify({ optedOut: !contact.optedOut }),
      });
      await refresh();
      toast.success(
        contact.optedOut ? "Contacto reactivado." : "Contacto dado de baja."
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo actualizar."
      );
    } finally {
      setBusy(false);
    }
  }

  async function anonymize() {
    setBusy(true);
    try {
      await apiFetch(`/api/contacts/${id}/anonymize`, { method: "POST" });
      await refresh();
      setAnonOpen(false);
      toast.success("Contacto anonimizado.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo anonimizar."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-sm text-neutral-400">Cargando contacto…</div>
    );
  }

  if (!contact) {
    return (
      <div className="p-4 sm:p-8">
        <p className="text-sm text-neutral-500">Contacto no encontrado.</p>
        <Link
          href="/contacts"
          className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a Contactos
        </Link>
      </div>
    );
  }

  const upcoming = contact.appointments.filter(
    (a) => a.status === "scheduled" && new Date(a.startsAt) > new Date()
  );
  const past = contact.appointments.filter(
    (a) => a.status !== "scheduled" || new Date(a.startsAt) <= new Date()
  );

  return (
    <div className="p-4 sm:p-8">
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Contactos
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-700">
          {contact.name[0].toUpperCase()}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-neutral-900">
              {contact.name}
            </h1>
            <Badge variant={CONTACT_STATUS_META[contact.status].variant}>
              {CONTACT_STATUS_META[contact.status].label}
            </Badge>
            {contact.optedOut && (
              <Badge variant="warning">Baja (opt-out)</Badge>
            )}
            {contact.anonymizedAt && (
              <Badge variant="default">Anonimizado</Badge>
            )}
          </div>
          <p className="text-sm text-neutral-500">
            Registrado el {format(parseISO(contact.createdAt), "d 'de' MMMM 'de' yyyy", { locale: es })}
            {contact.source ? ` · Origen: ${contact.source}` : ""}
          </p>
          {contact.tags && contact.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {contact.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        </div>

        {!contact.anonymizedAt && (
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              disabled={!contact.email || !emailStatus?.configured}
              title={
                !contact.email
                  ? "Este contacto no tiene correo electrónico"
                  : !emailStatus?.configured
                    ? "Configura una cuenta de correo en Ajustes → Correo electrónico"
                    : "Enviar un correo a este contacto"
              }
              onClick={() => setEmailOpen(true)}
            >
              <Send className="h-3.5 w-3.5" />
              Enviar correo
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={toggleOptOut}
            >
              {contact.optedOut ? (
                <>
                  <Bell className="h-3.5 w-3.5" />
                  Reactivar
                </>
              ) : (
                <>
                  <BellOff className="h-3.5 w-3.5" />
                  Dar de baja
                </>
              )}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => setAnonOpen(true)}
            >
              <ShieldX className="h-3.5 w-3.5" />
              Anonimizar
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
            <Phone className="h-3.5 w-3.5" />
            Teléfono
          </div>
          <p className="mt-1 text-sm text-neutral-900">{contact.phone}</p>
        </div>
        {contact.email && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
              <Mail className="h-3.5 w-3.5" />
              Correo electrónico
            </div>
            <p className="mt-1 text-sm text-neutral-900">{contact.email}</p>
          </div>
        )}
        {contact.notes && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
              <FileText className="h-3.5 w-3.5" />
              Notas
            </div>
            <p className="mt-1 text-sm text-neutral-900 whitespace-pre-wrap">
              {contact.notes}
            </p>
          </div>
        )}
        {contact.customFields &&
          Object.keys(contact.customFields).length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:col-span-3">
              <div className="text-xs font-medium text-neutral-500">
                Campos personalizados
              </div>
              <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {Object.entries(contact.customFields).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 text-sm">
                    <dt className="text-neutral-500">{k}</dt>
                    <dd className="text-neutral-900">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
      </div>

      {/* Citas */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-neutral-500" />
          <h2 className="text-sm font-semibold text-neutral-700">
            Próximas citas ({upcoming.length})
          </h2>
        </div>
        <AppointmentList
          appointments={upcoming}
          onOpenDoc={(a) => setSelectedDocAppt({ ...a, contact })}
          onOpenAiCrop={(a) => setAiCropAppt(a)}
        />
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-neutral-400" />
          <h2 className="text-sm font-semibold text-neutral-700">
            Citas pasadas ({past.length})
          </h2>
        </div>
        <AppointmentList
          appointments={past}
          onOpenDoc={(a) => setSelectedDocAppt({ ...a, contact })}
          onOpenAiCrop={(a) => setAiCropAppt(a)}
        />
      </div>

      {selectedDocAppt && (
        <ResponseDocumentModal
          open={Boolean(selectedDocAppt)}
          onClose={() => setSelectedDocAppt(null)}
          appointment={selectedDocAppt}
          onSuccess={() => refresh()}
        />
      )}

      {aiCropAppt && (
        <ImageCropModal
          open={Boolean(aiCropAppt)}
          onClose={() => setAiCropAppt(null)}
          selectedSpecialty={
            (aiCropAppt.aiAnalysisType as SpecialtyType) || "dental"
          }
          appointmentId={aiCropAppt.id}
          patientName={contact.name}
          notes={aiCropAppt.reason || undefined}
          onAnalysisSuccess={() => {
            toast.success("Diagnóstico de IA guardado en la cita y base de datos.");
            refresh();
            setAiCropAppt(null);
          }}
        />
      )}

      {/* Correos enviados */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <Mail className="h-4 w-4 text-neutral-400" />
          <h2 className="text-sm font-semibold text-neutral-700">
            Correos enviados ({emails.length})
          </h2>
        </div>
        {emails.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400">
            Sin correos enviados
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {emails.map((m) => (
              <div key={m.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
                    {m.subject}
                  </p>
                  <Badge variant={m.status === "sent" ? "success" : "danger"}>
                    {m.status === "sent" ? "Enviado" : "Falló"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {format(parseISO(m.createdAt), "d 'de' MMM, HH:mm", {
                    locale: es,
                  })}{" "}
                  · para {m.toAddress}
                </p>
                {m.body && (
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-neutral-600">
                    {m.body}
                  </p>
                )}
                {m.status === "failed" && m.error && (
                  <p className="mt-1 text-xs text-red-600">Error: {m.error}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compose email */}
      <Modal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        title="Enviar correo"
      >
        <div className="space-y-3">
          <div className="text-sm text-neutral-600">
            Para:{" "}
            <span className="font-medium text-neutral-900">{contact.email}</span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Asunto
            </label>
            <Input
              value={subject}
              maxLength={300}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto del correo"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Mensaje
            </label>
            <Textarea
              rows={8}
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Escribe tu mensaje…"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEmailOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={sendEmail}
            disabled={sending || !subject.trim() || !emailBody.trim()}
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={anonOpen}
        onClose={() => setAnonOpen(false)}
        title="Anonimizar contacto (GDPR)"
      >
        <p className="text-sm text-neutral-600">
          Se borrarán los datos personales de{" "}
          <strong>{contact.name}</strong> (nombre, teléfono, correo, notas y
          campos personalizados) y se marcará como dado de baja. El historial de
          citas se conserva sin datos personales. Esta acción no se puede
          deshacer.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAnonOpen(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={anonymize} disabled={busy}>
            {busy ? "Anonimizando…" : "Anonimizar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function AppointmentList({
  appointments,
  onOpenDoc,
  onOpenAiCrop,
}: {
  appointments: Appointment[];
  onOpenDoc?: (a: Appointment) => void;
  onOpenAiCrop?: (a: Appointment) => void;
}) {
  const toast = useToast();

  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-400">
        Sin citas
      </div>
    );
  }

  function copyPaymentLink(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("Enlace de pago copiado al portapapeles.");
  }

  return (
    <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {appointments.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-neutral-900">{a.service}</p>
              <Badge variant="default" className="text-[10px]">
                {a.modality === "virtual"
                  ? "💻 Virtual (Cal.com)"
                  : a.modality === "phone"
                  ? "📞 Telefónica"
                  : "🏢 Presencial"}
              </Badge>
              {a.paymentStatus === "paid" && (
                <Badge variant="success">Pagado {a.price ? `(${a.price} €)` : ""}</Badge>
              )}
              {a.paymentStatus === "pending" && (
                <Badge variant="warning">Pago pendiente {a.price ? `(${a.price} €)` : ""}</Badge>
              )}
              {(!a.paymentStatus || a.paymentStatus === "unpaid") && a.price && (
                <Badge variant="default">{a.price} €</Badge>
              )}
              {a.aiAnalysisResult && (
                <Badge variant="success" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]">
                  ✨ IA: {a.aiAnalysisType || "Analizado"}
                </Badge>
              )}
              {a.aiCroppedImageMime && (
                <a
                  href={apiUrl(`/api/appointments/${a.id}/ai-cropped-image`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
                  title="Ver imagen recortada analizada por IA"
                >
                  📷 Foto IA
                </a>
              )}
              {a.responseDocument && (
                <Badge variant="success" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                  ✓ {a.responseDocument.title}
                </Badge>
              )}
              {(a.doctorReportPdfName || a.responseDocument) && (
                <a
                  href={apiUrl(`/api/appointments/${a.id}/doctor-report/pdf`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                  title="Abrir PDF Oficial del Doctor"
                >
                  <FileText className="h-3 w-3" />
                  PDF Informe
                </a>
              )}
              {a.patientAttachmentName && (
                <a
                  href={apiUrl(`/api/appointments/${a.id}/patient-attachment/view`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-semibold text-purple-700 hover:bg-purple-100 transition-colors"
                  title={`Ver adjunto del paciente: ${a.patientAttachmentName}`}
                >
                  <Paperclip className="h-3 w-3 text-purple-600" />
                  {a.patientAttachmentName}
                </a>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              {format(parseISO(a.startsAt), "d 'de' MMM, HH:mm", { locale: es })} →{" "}
              {format(parseISO(a.endsAt), "HH:mm", { locale: es })}
            </p>
            {a.reason && (
              <p className="text-xs text-neutral-600 mt-1 italic">
                Motivo: &quot;{a.reason}&quot;
              </p>
            )}
            {a.aiAnalysisResult && (
              <div className="mt-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200 p-2 text-xs text-emerald-900 max-w-xl">
                <span className="font-bold text-[11px] block text-emerald-800">Diagnóstico IA registrado:</span>
                <p className="text-[11px] line-clamp-2 mt-0.5 text-neutral-700">{a.aiAnalysisResult}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onOpenAiCrop && (
              <button
                type="button"
                onClick={() => onOpenAiCrop(a)}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                title="Tomar foto con cámara web, recortar y re-analizar con IA"
              >
                🔬 IA Cámara
              </button>
            )}
            {onOpenDoc && (
              <button
                type="button"
                onClick={() => onOpenDoc(a)}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                title="Redactar o ver diagnóstico / informe de consulta"
              >
                📋 {a.responseDocument ? "Ver Informe" : "Diagnóstico"}
              </button>
            )}
            {a.calMeetingUrl && (
              <a
                href={a.calMeetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                title="Unirse a la videollamada de Cal.com"
              >
                <Video className="h-3.5 w-3.5 text-indigo-600" />
                Videollamada
              </a>
            )}
            {a.paymentUrl && a.paymentStatus !== "paid" && (
              <button
                type="button"
                onClick={() => copyPaymentLink(a.paymentUrl!)}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                title="Copiar enlace de pago de Stripe"
              >
                <Copy className="h-3 w-3" />
                Link pago
              </button>
            )}
            <Badge variant={statusVariant(a.status)}>{statusLabel(a.status)}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

