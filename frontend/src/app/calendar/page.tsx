"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Video,
  Phone,
  MapPin,
  Search,
  List,
  CalendarDays,
  FileText,
  CheckCircle2,
  Clock,
  Paperclip,
  Download,
  Eye,
  Trash2,
  Upload,
  Sparkles,
  Scissors,
  Bot,
} from "lucide-react";
import { ImageCropModal, SPECIALTIES, SpecialtyType } from "@/components/ImageCropModal";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  parseISO,
  isToday,
  getHours,
  getMinutes,
  differenceInMinutes,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { apiFetch, ApiError, apiUrl } from "@/lib/api";
import { Appointment, Contact, ContactPage, Service } from "@/lib/types";
import { useEvents } from "@/hooks/useEvents";
import { useAuth } from "@/contexts/AuthContext";
import { ResponseDocumentModal } from "@/components/ResponseDocumentModal";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<Appointment["status"], string> = {
  scheduled: "bg-indigo-100 text-indigo-700 border-indigo-200",
  pending_approval: "bg-amber-100 text-amber-800 border-amber-300",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

function statusVariant(s: Appointment["status"]) {
  if (s === "scheduled") return "info";
  if (s === "pending_approval") return "warning";
  if (s === "completed") return "success";
  return "danger";
}

function statusLabel(s: Appointment["status"]) {
  if (s === "scheduled") return "Programada";
  if (s === "pending_approval") return "Pendiente";
  if (s === "completed") return "Completada";
  return "Cancelada";
}

// ─── Create/Edit Modal ───────────────────────────────────────────────────────

interface ApptFormData {
  contactId: string;
  service: string;
  serviceId?: string;
  calendarId?: string;
  startsAt: string;
  endsAt: string;
  status: Appointment["status"];
  modality: string;
  reason: string;
  price: string;
}

function AppointmentModal({
  open,
  onClose,
  initial,
  contacts,
  services,
  defaultStart,
  onSave,
  onAccept,
  onReject,
  onOpenResponseDoc,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Appointment;
  contacts: Contact[];
  services: Service[];
  defaultStart?: Date;
  onSave: (data: ApptFormData) => Promise<void>;
  onAccept?: (id: string) => Promise<void>;
  onReject?: (id: string) => Promise<void>;
  onOpenResponseDoc?: (a: Appointment) => void;
}) {
  const toLocal = (iso: string) =>
    iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : "";

  const defaultStartStr = defaultStart
    ? format(defaultStart, "yyyy-MM-dd'T'HH:mm")
    : "";
  const defaultEndStr = defaultStart
    ? format(
        new Date(defaultStart.getTime() + 60 * 60 * 1000),
        "yyyy-MM-dd'T'HH:mm"
      )
    : "";

  const [form, setForm] = useState<ApptFormData>({
    contactId: initial?.contactId ?? "",
    service: initial?.service ?? "",
    serviceId: initial?.serviceId ?? "",
    calendarId: initial?.calendarId ?? "default",
    startsAt: initial ? toLocal(initial.startsAt) : defaultStartStr,
    endsAt: initial ? toLocal(initial.endsAt) : defaultEndStr,
    status: initial?.status ?? "scheduled",
    modality: initial?.modality ?? "in_person",
    reason: initial?.reason ?? "",
    price: initial?.price ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentSuccess, setAttachmentSuccess] = useState("");
  const [aiSpecialty, setAiSpecialty] = useState<SpecialtyType>(
    (initial?.aiAnalysisType as SpecialtyType) || "dental"
  );
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | undefined>(undefined);
  const [aiResultText, setAiResultText] = useState<string | null>(
    initial?.aiAnalysisResult || null
  );
  const [aiCropThumbnail, setAiCropThumbnail] = useState<string | null>(null);

  const selectedService = services.find(
    (s) => s.id === form.serviceId || s.name === form.service
  );

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !initial) return;
    setUploadingAttachment(true);
    setAttachmentSuccess("");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        await apiFetch(`/api/appointments/${initial.id}/patient-attachment`, {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            base64Data,
          }),
        });
        setAttachmentSuccess("Documento adjuntado correctamente.");
        setUploadingAttachment(false);
        if (onSave) {
          onSave(form);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingAttachment(false);
    }
  }

  async function handleDeleteAttachment() {
    if (!initial) return;
    try {
      await apiFetch(`/api/appointments/${initial.id}/patient-attachment`, {
        method: "DELETE",
      });
      setAttachmentSuccess("Documento eliminado.");
      if (onSave) onSave(form);
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contactId || !form.service || !form.startsAt || !form.endsAt) {
      setError("Todos los campos obligatorios deben estar rellenos.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo guardar la cita.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Detalles / Editar Cita" : "Nueva Cita"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Atender / Documento de Respuesta Banner (if existing appointment) */}
        {initial && onOpenResponseDoc && (
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 to-purple-50/60 p-3.5 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shrink-0 shadow-sm">
                <MapPin className="h-4 w-4 hidden" />
                <span className="text-base">📋</span>
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-indigo-950 truncate">
                  {initial.responseDocument ? "Documento de Respuesta Emitido" : "Atención y Diagnóstico Clínico"}
                </h4>
                <p className="text-[11px] text-indigo-700 truncate">
                  {initial.responseDocument
                    ? `${initial.responseDocument.title} (${initial.responseDocument.signedBy})`
                    : "Redacta el diagnóstico, tratamiento o informe de la cita"}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant={initial.responseDocument ? "secondary" : "primary"}
              onClick={() => {
                onOpenResponseDoc(initial);
                onClose();
              }}
              className="shrink-0 font-semibold text-xs shadow-sm"
            >
              {initial.responseDocument ? "Ver / Editar Informe" : "Atender / Diagnóstico"}
            </Button>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Contacto <span className="text-red-500">*</span>
          </label>
          <select
            className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            value={form.contactId}
            onChange={(e) =>
              setForm((f) => ({ ...f, contactId: e.target.value }))
            }
          >
            <option value="">Selecciona un contacto…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.phone})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Servicio <span className="text-red-500">*</span>
          </label>
          {services.length > 0 ? (
            <select
              className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              value={form.serviceId || ""}
              onChange={(e) => {
                const sid = e.target.value;
                const s = services.find((srv) => srv.id === sid);
                if (s) {
                  const start = form.startsAt ? new Date(form.startsAt) : new Date();
                  const end = new Date(start.getTime() + s.durationMinutes * 60000);
                  setForm((f) => ({
                    ...f,
                    serviceId: s.id,
                    service: s.name,
                    calendarId: s.calendarId,
                    price: s.price ?? f.price,
                    endsAt: format(end, "yyyy-MM-dd'T'HH:mm"),
                    status: s.requiresApproval ? "pending_approval" : (f.status === "pending_approval" ? "scheduled" : f.status),
                  }));
                } else {
                  setForm((f) => ({ ...f, serviceId: "", service: "" }));
                }
              }}
            >
              <option value="">Selecciona un servicio…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMinutes} min{s.price ? ` · ${s.price}€` : ""})
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={form.service}
              onChange={(e) =>
                setForm((f) => ({ ...f, service: e.target.value }))
              }
              placeholder="ej. Clase de Yoga"
            />
          )}

          {selectedService && (
            <div className="mt-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-xs text-neutral-600 space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-medium text-neutral-700">Responsable de servicio:</span>
                <span className="font-semibold text-indigo-700">{selectedService.manager?.name || "Sin asignar"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium text-neutral-700">Calendario asignado:</span>
                <span className="font-mono text-[11px] bg-neutral-200 px-1.5 py-0.5 rounded text-neutral-800">{selectedService.calendarId}</span>
              </div>
              {selectedService.requiresApproval && (
                <div className="mt-1 flex items-center gap-1 font-medium text-amber-700">
                  <span>⚠️ Requiere aprobación del responsable de servicio</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modalidad de Cita */}
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Modalidad de la Cita <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, modality: "in_person" }))}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors",
                form.modality === "in_person"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              )}
            >
              <MapPin className="h-3.5 w-3.5" />
              Presencial
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, modality: "phone" }))}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors",
                form.modality === "phone"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              )}
            >
              <Phone className="h-3.5 w-3.5" />
              Telefónica
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, modality: "virtual" }))}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors",
                form.modality === "virtual"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              )}
            >
              <Video className="h-3.5 w-3.5" />
              Virtual (Cal.com)
            </button>
          </div>
        </div>

        {/* Motivo de la Cita */}
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Motivo de la Cita / Razón de Consulta
            {selectedService?.requiresReason && <span className="text-red-500"> *</span>}
          </label>
          <Input
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="ej. Consulta por dolor de espalda / Iniciación al yoga"
          />
        </div>

        {/* Cal.com Video Call Link (if virtual) */}
        {initial?.calMeetingUrl && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-indigo-600 shrink-0" />
              <div>
                <span className="font-semibold text-xs text-indigo-950 block">Reunión Virtual Cal.com</span>
                <span className="text-[11px] text-indigo-700">Enlace de videollamada activo</span>
              </div>
            </div>
            <a
              href={initial.calMeetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm"
            >
              <Video className="h-3.5 w-3.5" />
              Unirse a videollamada
            </a>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Inicio <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => {
                const newStartStr = e.target.value;
                const newStart = new Date(newStartStr);
                const dur = selectedService?.durationMinutes ?? 60;
                const newEnd = new Date(newStart.getTime() + dur * 60000);
                setForm((f) => ({
                  ...f,
                  startsAt: newStartStr,
                  endsAt: !isNaN(newEnd.getTime()) ? format(newEnd, "yyyy-MM-dd'T'HH:mm") : f.endsAt,
                }));
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Fin <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) =>
                setForm((f) => ({ ...f, endsAt: e.target.value }))
              }
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Precio <span className="text-neutral-400">(€)</span>
          </label>
          <Input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="ej. 35"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Estado de la Cita
          </label>
          <select
            className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            value={form.status}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                status: e.target.value as Appointment["status"],
              }))
            }
          >
            <option value="scheduled">Programada (Confirmada)</option>
            <option value="pending_approval">Pendiente de aprobación</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>

        {/* Documentos / Archivos Adjuntos del Paciente (BLOB) */}
        {initial && (
          <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-purple-700" />
                <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                  Documento Adjunto del Paciente (Radiografías, Informes, Análisis)
                </h4>
              </div>
            </div>

            {initial.patientAttachmentName ? (
              <div className="flex items-center justify-between bg-white rounded-lg border border-purple-200 p-3 shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-100 text-purple-700 shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-900 truncate">
                      {initial.patientAttachmentName}
                    </p>
                    <p className="text-[10px] text-neutral-500">
                      {initial.patientAttachmentSize ? `${(initial.patientAttachmentSize / 1024).toFixed(1)} KB` : "Documento"} · {initial.patientAttachmentMime || "Archivo"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={apiUrl(`/api/appointments/${initial.id}/patient-attachment/view`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-800 hover:bg-purple-200 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver
                  </a>
                  <a
                    href={apiUrl(`/api/appointments/${initial.id}/patient-attachment/download`)}
                    className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Descargar
                  </a>
                  <button
                    type="button"
                    onClick={handleDeleteAttachment}
                    className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                    title="Eliminar documento adjunto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 italic">
                El paciente no ha adjuntado ningún archivo todavía. Puedes subir un documento o imagen a continuación:
              </p>
            )}

            <div className="pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-purple-300 bg-white px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 transition-colors">
                <Upload className="h-3.5 w-3.5" />
                {uploadingAttachment ? "Subiendo archivo..." : initial.patientAttachmentName ? "Reemplazar documento adjunto" : "Subir documento / imagen del paciente"}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploadingAttachment}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt"
                  onChange={handleFileUpload}
                />
              </label>
              {attachmentSuccess && (
                <span className="ml-3 text-xs text-green-600 font-medium">
                  ✓ {attachmentSuccess}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 🤖 Análisis IA (opcional) */}
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <div>
                <h4 className="text-xs font-bold text-sky-950 uppercase tracking-wider">
                  Análisis IA (opcional)
                </h4>
                <p className="text-[11px] text-sky-800">
                  Selecciona la especialidad médica y recorta el área anatómica a evaluar
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-sky-900 mb-1">
                Especialidad del modelo
              </label>
              <select
                className="block w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 focus:border-sky-500 focus:outline-none shadow-xs"
                value={aiSpecialty}
                onChange={(e) => setAiSpecialty(e.target.value as SpecialtyType)}
              >
                {SPECIALTIES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.icon} {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setTempImageSrc(
                    initial?.id && initial.patientAttachmentName
                      ? apiUrl(`/api/appointments/${initial.id}/patient-attachment/view`)
                      : undefined
                  );
                  setCropModalOpen(true);
                }}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold py-2 shadow-xs"
              >
                <Scissors className="h-3.5 w-3.5 mr-1.5" />
                Captura, recorta y analiza
              </Button>
            </div>
          </div>

          {/* AI Result Card */}
          {aiResultText && (
            <div className="rounded-lg border border-emerald-300 bg-white p-3.5 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  Dictamen IA: {SPECIALTIES.find((s) => s.key === aiSpecialty)?.label || "Análisis IA"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      reason: f.reason ? `${f.reason}\n\n[Dictamen IA]:\n${aiResultText}` : aiResultText,
                    }));
                  }}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline"
                >
                  Pegar en Motivo de consulta
                </button>
              </div>

              <div className="flex gap-3 items-start">
                {(aiCropThumbnail || (initial?.aiAnalysisDate && initial.id)) && (
                  <img
                    src={aiCropThumbnail || apiUrl(`/api/appointments/${initial?.id}/ai-cropped-image`)}
                    alt="Región recortada"
                    className="h-16 w-16 rounded-md border border-neutral-300 object-cover shrink-0 shadow-xs"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-neutral-700 whitespace-pre-wrap font-mono leading-relaxed bg-neutral-50 p-2.5 rounded border border-neutral-200 max-h-40 overflow-y-auto">
                    {aiResultText}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Doctor Report PDF Quick Link (if exists) */}
        {initial?.responseDocument && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📄</span>
              <div>
                <span className="text-xs font-bold text-indigo-950 block">Informe PDF del Doctor (BLOB)</span>
                <span className="text-[11px] text-indigo-700">{initial.doctorReportPdfName || "informe-medico.pdf"}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href={apiUrl(`/api/appointments/${initial.id}/doctor-report/pdf`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 shadow-xs"
              >
                <Eye className="h-3.5 w-3.5" />
                Ver PDF
              </a>
              <a
                href={apiUrl(`/api/appointments/${initial.id}/doctor-report/download`)}
                className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar
              </a>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>

      {/* Interactive Crop & AI Analysis Modal */}
      {cropModalOpen && (
        <ImageCropModal
          open={cropModalOpen}
          onClose={() => setCropModalOpen(false)}
          initialImageSrc={tempImageSrc}
          selectedSpecialty={aiSpecialty}
          appointmentId={initial?.id}
          patientName={contacts.find((c) => c.id === form.contactId)?.name}
          notes={form.reason}
          onAnalysisSuccess={(res) => {
            setAiResultText(res.analysisText);
            setAiCropThumbnail(res.croppedImageBase64);
            setCropModalOpen(false);
          }}
        />
      )}
    </Modal>
  );
}

// ─── Month View ─────────────────────────────────────────────────────────────

function MonthView({
  current,
  appointments,
  onDayClick,
  onAppointmentClick,
}: {
  current: Date;
  appointments: Appointment[];
  onDayClick: (day: Date) => void;
  onAppointmentClick: (a: Appointment) => void;
}) {
  const start = startOfWeek(startOfMonth(current), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(current), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  // Spanish abbreviated day names starting Monday
  const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-neutral-100">
        {DOW.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-neutral-400"
          >
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 divide-x divide-y divide-neutral-100">
        {days.map((day) => {
          const dayAppts = appointments.filter((a) =>
            isSameDay(parseISO(a.startsAt), day)
          );
          const inMonth = isSameMonth(day, current);
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[90px] cursor-pointer p-1.5 hover:bg-neutral-50",
                !inMonth && "opacity-40"
              )}
              onClick={() => onDayClick(day)}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  today
                    ? "bg-indigo-600 text-white"
                    : "text-neutral-700"
                )}
              >
                {format(day, "d")}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayAppts.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(a);
                    }}
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-[10px] font-medium border",
                      STATUS_COLORS[a.status]
                    )}
                  >
                    {format(parseISO(a.startsAt), "HH:mm")} {a.modality === "virtual" ? "💻 " : a.modality === "phone" ? "📞 " : ""}{a.service}
                  </div>
                ))}
                {dayAppts.length > 3 && (
                  <p className="text-[10px] text-neutral-400">
                    +{dayAppts.length - 3} más
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ───────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_H = 56; // px per hour

function WeekView({
  current,
  appointments,
  onSlotClick,
  onAppointmentClick,
}: {
  current: Date;
  appointments: Appointment[];
  onSlotClick: (date: Date) => void;
  onAppointmentClick: (a: Appointment) => void;
}) {
  const weekStart = startOfWeek(current, { weekStartsOn: 1 });
  const days = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(current, { weekStartsOn: 1 }),
  });
  // Spanish abbreviated day names starting Monday
  const DOW_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <>
      {/* Mobile agenda — the dense hour grid is impractical on a phone, so the
          week shows as a per-day list instead (ADR 0021). */}
      <div className="flex-1 space-y-4 overflow-y-auto md:hidden">
        {days.map((day, i) => {
          const dayAppts = appointments
            .filter((a) => isSameDay(parseISO(a.startsAt), day))
            .sort((x, y) => x.startsAt.localeCompare(y.startsAt));
          return (
            <div key={day.toISOString()}>
              <p
                className={cn(
                  "mb-1.5 text-xs font-semibold capitalize",
                  isToday(day) ? "text-indigo-600" : "text-neutral-500"
                )}
              >
                {DOW_SHORT[i]} {format(day, "d")}
              </p>
              {dayAppts.length === 0 ? (
                <button
                  onClick={() => {
                    const slot = new Date(day);
                    slot.setHours(9, 0, 0, 0);
                    onSlotClick(slot);
                  }}
                  className="w-full rounded-lg border border-dashed border-neutral-200 px-3 py-2 text-left text-xs text-neutral-400 hover:bg-neutral-50"
                >
                  Sin citas — añadir
                </button>
              ) : (
                <div className="space-y-1.5">
                  {dayAppts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => onAppointmentClick(a)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                        STATUS_COLORS[a.status]
                      )}
                    >
                      <span className="font-medium">
                        {format(parseISO(a.startsAt), "HH:mm")}
                      </span>
                      <span className="flex-1 truncate">{a.service}</span>
                      <Badge
                        variant={statusVariant(a.status)}
                        className="rounded-sm text-[10px]"
                      >
                        {statusLabel(a.status)}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hour grid — from md up (too dense for a narrow screen). */}
      <div className="hidden flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white md:flex">
      {/* Header row */}
      <div className="grid border-b border-neutral-100" style={{ gridTemplateColumns: "3rem repeat(7, 1fr)" }}>
        <div />
        {days.map((d, i) => (
          <div
            key={d.toISOString()}
            className={cn(
              "py-2 text-center text-xs font-medium",
              isToday(d) ? "text-indigo-600" : "text-neutral-400"
            )}
          >
            <div>{DOW_SHORT[i]}</div>
            <div
              className={cn(
                "mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold",
                isToday(d) ? "bg-indigo-600 text-white" : "text-neutral-700"
              )}
            >
              {format(d, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: "3rem repeat(7, 1fr)",
            height: HOUR_H * 24,
          }}
        >
          {/* Hour labels */}
          {HOURS.map((h) => (
            <div
              key={h}
              className="col-start-1 flex items-start justify-end pr-2 text-[10px] text-neutral-400"
              style={{ gridRow: `${h + 1}`, height: HOUR_H, paddingTop: 2 }}
            >
              {h > 0 ? `${String(h).padStart(2, "0")}:00` : ""}
            </div>
          ))}

          {/* Day columns + grid lines */}
          {days.map((d, colIdx) => (
            <div
              key={d.toISOString()}
              className="relative border-l border-neutral-100"
              style={{ gridColumn: `${colIdx + 2}`, gridRow: "1 / 25" }}
            >
              {/* Hour cells */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="border-b border-neutral-50 cursor-pointer hover:bg-indigo-50/30"
                  style={{ height: HOUR_H }}
                  onClick={() => {
                    const slot = new Date(d);
                    slot.setHours(h, 0, 0, 0);
                    onSlotClick(slot);
                  }}
                />
              ))}
              {/* Appointment blocks */}
              {appointments
                .filter((a) => isSameDay(parseISO(a.startsAt), d))
                .map((a) => {
                  const start = parseISO(a.startsAt);
                  const end = parseISO(a.endsAt);
                  const top =
                    (getHours(start) + getMinutes(start) / 60) * HOUR_H;
                  const height = Math.max(
                    (differenceInMinutes(end, start) / 60) * HOUR_H,
                    20
                  );
                  return (
                    <div
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick(a);
                      }}
                      className={cn(
                        "absolute left-0.5 right-0.5 overflow-hidden rounded px-1 py-0.5 text-[10px] font-medium border cursor-pointer hover:brightness-95",
                        STATUS_COLORS[a.status]
                      )}
                      style={{ top, height }}
                    >
                      <div className="font-semibold truncate">
                        {a.modality === "virtual" ? "💻 " : a.modality === "phone" ? "📞 " : ""}{a.service}
                      </div>
                      <div className="truncate opacity-75">
                        {format(start, "HH:mm")}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
      </div>
    </>
  );
}

// ─── List View (Full Past & Future Appointments) ──────────────────────────────

function AppointmentListView({
  appointments,
  onAppointmentClick,
  onOpenResponseDoc,
}: {
  appointments: Appointment[];
  onAppointmentClick: (a: Appointment) => void;
  onOpenResponseDoc: (a: Appointment) => void;
}) {
  const [tab, setTab] = useState<"all" | "today" | "upcoming" | "past" | "pending">("all");
  const [search, setSearch] = useState("");

  const now = new Date();

  const filtered = appointments.filter((a) => {
    const start = new Date(a.startsAt);
    if (tab === "today" && !isToday(start)) return false;
    if (tab === "upcoming" && (start <= now || a.status === "completed" || a.status === "cancelled")) return false;
    if (tab === "past" && start > now && a.status !== "completed") return false;
    if (tab === "pending" && a.status !== "pending_approval") return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchPatient = (a.contact?.name ?? "").toLowerCase().includes(q) || (a.contact?.phone ?? "").includes(q);
      const matchService = (a.service ?? "").toLowerCase().includes(q);
      const matchReason = (a.reason ?? "").toLowerCase().includes(q);
      return matchPatient || matchService || matchReason;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    return tab === "past"
      ? new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      : new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  const countToday = appointments.filter((a) => isToday(new Date(a.startsAt))).length;
  const countUpcoming = appointments.filter((a) => new Date(a.startsAt) > now && a.status !== "completed" && a.status !== "cancelled").length;
  const countPast = appointments.filter((a) => new Date(a.startsAt) <= now || a.status === "completed").length;
  const countPending = appointments.filter((a) => a.status === "pending_approval").length;

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-neutral-200 overflow-hidden">
      {/* Sub tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 p-3 bg-neutral-50/50">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setTab("all")}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
              tab === "all" ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
            )}
          >
            Todas ({appointments.length})
          </button>
          <button
            onClick={() => setTab("today")}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
              tab === "today" ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
            )}
          >
            Hoy ({countToday})
          </button>
          <button
            onClick={() => setTab("upcoming")}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
              tab === "upcoming" ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
            )}
          >
            Próximas / Futuras ({countUpcoming})
          </button>
          <button
            onClick={() => setTab("past")}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
              tab === "past" ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
            )}
          >
            Pasadas / Historial ({countPast})
          </button>
          {countPending > 0 && (
            <button
              onClick={() => setTab("pending")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
                tab === "pending" ? "bg-amber-600 text-white shadow-sm" : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
              )}
            >
              Pendientes ({countPending})
            </button>
          )}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por paciente, servicio..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Appointment list */}
      <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
        {sorted.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-400">
            No se encontraron citas en esta categoría.
          </div>
        ) : (
          sorted.map((a) => {
            const start = new Date(a.startsAt);
            const end = new Date(a.endsAt);
            return (
              <div
                key={a.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-neutral-50/70 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-neutral-900 truncate">
                      {a.contact ? a.contact.name : "Paciente sin asignar"}
                    </span>
                    <Badge variant="default" className="text-[11px] font-normal">
                      {a.modality === "virtual"
                        ? "💻 Virtual (Cal.com)"
                        : a.modality === "phone"
                        ? "📞 Telefónica"
                        : "🏢 Presencial"}
                    </Badge>
                    <Badge variant={statusVariant(a.status)}>
                      {statusLabel(a.status)}
                    </Badge>
                    {a.price && (
                      <span className="text-xs font-semibold text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded">
                        {a.price} €
                      </span>
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
                        className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                        title="Ver / Descargar PDF Oficial del Doctor"
                      >
                        <FileText className="h-3 w-3 text-indigo-600" />
                        PDF Informe
                      </a>
                    )}
                    {a.patientAttachmentName && (
                      <a
                        href={apiUrl(`/api/appointments/${a.id}/patient-attachment/view`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-purple-50 border border-purple-200 px-2 py-0.5 text-[11px] font-semibold text-purple-700 hover:bg-purple-100 transition-colors"
                        title={`Ver adjunto del paciente: ${a.patientAttachmentName}`}
                      >
                        <Paperclip className="h-3 w-3 text-purple-600" />
                        {a.patientAttachmentName}
                      </a>
                    )}
                    {a.aiAnalysisResult && (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-sky-50 border border-sky-200 px-2 py-0.5 text-[11px] font-semibold text-sky-800"
                        title={a.aiAnalysisResult}
                      >
                        <Sparkles className="h-3 w-3 text-sky-600" />
                        IA: {SPECIALTIES.find((s) => s.key === a.aiAnalysisType)?.badge || "Dictamen IA"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-neutral-500 flex-wrap">
                    <span className="font-medium text-neutral-800">{a.service}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-neutral-400" />
                      {format(start, "d 'de' MMMM yyyy, HH:mm", { locale: es })} → {format(end, "HH:mm")}
                    </span>
                    {a.contact?.phone && (
                      <>
                        <span>•</span>
                        <span>{a.contact.phone}</span>
                      </>
                    )}
                  </div>

                  {a.reason && (
                    <p className="text-xs text-neutral-600 italic mt-0.5 line-clamp-1">
                      Motivo: &quot;{a.reason}&quot;
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => onOpenResponseDoc(a)}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                  >
                    📋 {a.responseDocument ? "Ver Informe" : "Atender / Diagnóstico"}
                  </button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onAppointmentClick(a)}
                  >
                    Editar
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function CalendarPageInner() {
  const searchParams = useSearchParams();

  // Lazy initializer: read the `?date=` param once on mount (ADR 0025 drill-through).
  const [current, setCurrent] = useState<Date>(() => {
    const d = searchParams.get("date");
    if (!d) return new Date();
    const parsed = parseISO(d);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  });

  const [view, setView] = useState<"list" | "month" | "week">("list");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | undefined>();
  const [defaultStart, setDefaultStart] = useState<Date | undefined>();
  const [responseDocAppt, setResponseDocAppt] = useState<Appointment | undefined>();

  const loadRange = useCallback(async () => {
    let from: Date;
    let to: Date;
    if (view === "month") {
      from = startOfWeek(startOfMonth(current), { weekStartsOn: 1 });
      to = endOfWeek(endOfMonth(current), { weekStartsOn: 1 });
    } else if (view === "week") {
      from = startOfWeek(current, { weekStartsOn: 1 });
      to = endOfWeek(current, { weekStartsOn: 1 });
    } else {
      // List view - load past 6 months to next 12 months so all appointments appear
      from = startOfDay(subMonths(new Date(), 6));
      to = startOfDay(addMonths(new Date(), 12));
    }
    try {
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      if (selectedServiceId) {
        params.set("serviceId", selectedServiceId);
      }
      return await apiFetch<Appointment[]>(`/api/appointments?${params.toString()}`);
    } catch {
      return null;
    }
  }, [current, view, selectedServiceId]);

  const refreshRange = useCallback(async () => {
    const data = await loadRange();
    if (data) setAppointments(data);
  }, [loadRange]);

  useEffect(() => {
    loadRange().then((data) => {
      if (data) setAppointments(data);
    });
  }, [loadRange]);

  useEffect(() => {
    apiFetch<ContactPage>("/api/contacts?limit=200")
      .then((page) => setContacts(page.items))
      .catch(() => {});

    apiFetch<Service[]>("/api/services")
      .then((svcs) => setServices(svcs))
      .catch(() => {});
  }, []);

  useEvents({
    "appointment.created": () => refreshRange(),
  });

  function navigate(dir: 1 | -1) {
    if (view === "month") {
      setCurrent((c) => (dir === 1 ? addMonths(c, 1) : subMonths(c, 1)));
    } else {
      setCurrent((c) => (dir === 1 ? addWeeks(c, 1) : subWeeks(c, 1)));
    }
  }

  const title =
    view === "month"
      ? format(current, "MMMM yyyy", { locale: es })
      : `${format(startOfWeek(current, { weekStartsOn: 1 }), "d MMM", { locale: es })} – ${format(endOfWeek(current, { weekStartsOn: 1 }), "d MMM yyyy", { locale: es })}`;

  async function handleSave(data: ApptFormData) {
    const price = data.price.trim()
      ? data.price.trim()
      : editingAppt
        ? null
        : undefined;
    const payload = {
      contactId: data.contactId,
      service: data.service,
      serviceId: data.serviceId || undefined,
      calendarId: data.calendarId || undefined,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: data.status,
      price,
    };
    if (editingAppt) {
      await apiFetch(`/api/appointments/${editingAppt.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch("/api/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    await refreshRange();
  }

  async function handleAccept(id: string) {
    await apiFetch(`/api/appointments/${id}/accept`, { method: "POST" });
    await refreshRange();
  }

  async function handleReject(id: string) {
    await apiFetch(`/api/appointments/${id}/reject`, { method: "POST" });
    await refreshRange();
  }

  function openCreate(day: Date) {
    setEditingAppt(undefined);
    setDefaultStart(startOfDay(day));
    setModalOpen(true);
  }

  function openEdit(a: Appointment) {
    setEditingAppt(a);
    setDefaultStart(undefined);
    setModalOpen(true);
  }

  return (
    <div className="flex h-full flex-col p-4 sm:p-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-neutral-900">Mis Citas y Agenda</h1>
          <div className="flex items-center rounded-lg border border-neutral-200 bg-white text-sm">
            <button
              onClick={() => setView("list")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-l-lg transition-colors flex items-center gap-1.5",
                view === "list"
                  ? "bg-indigo-600 text-white"
                  : "text-neutral-600 hover:bg-neutral-50"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Lista de Citas
            </button>
            <button
              onClick={() => setView("month")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold transition-colors border-l border-neutral-200",
                view === "month"
                  ? "bg-indigo-600 text-white"
                  : "text-neutral-600 hover:bg-neutral-50"
              )}
            >
              Mes
            </button>
            <button
              onClick={() => setView("week")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-r-lg transition-colors border-l border-neutral-200",
                view === "week"
                  ? "bg-indigo-600 text-white"
                  : "text-neutral-600 hover:bg-neutral-50"
              )}
            >
              Semana
            </button>
          </div>

          {/* Service/Calendar Filter */}
          <div className="flex items-center gap-1.5">
            <select
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm focus:border-indigo-500 focus:outline-none"
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
            >
              <option value="">Todos los calendarios y servicios</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.manager ? s.manager.name.split(" ")[0] : s.calendarId})
                </option>
              ))}
            </select>
            {selectedServiceId && (
              <button
                type="button"
                onClick={() => setSelectedServiceId("")}
                className="text-xs text-neutral-400 hover:text-neutral-700 underline"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {view !== "list" && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Periodo anterior"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[140px] text-center text-sm font-medium capitalize text-neutral-700 sm:min-w-[180px]">
                {title}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Periodo siguiente"
                onClick={() => navigate(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button
            size="sm"
            onClick={() => {
              setEditingAppt(undefined);
              setDefaultStart(new Date());
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nueva Cita
          </Button>
        </div>
      </div>

      {/* Legend (only for month/week views) */}
      {view !== "list" && (
        <div className="mt-3 flex items-center gap-4 text-xs">
          {(["scheduled", "pending_approval", "completed", "cancelled"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 rounded-sm border",
                  STATUS_COLORS[s]
                )}
              />
              <Badge variant={statusVariant(s)} className="rounded-sm">
                {statusLabel(s)}
              </Badge>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-1 flex-col overflow-hidden">
        {view === "list" ? (
          <AppointmentListView
            appointments={appointments}
            onAppointmentClick={openEdit}
            onOpenResponseDoc={(a) => setResponseDocAppt(a)}
          />
        ) : view === "month" ? (
          <MonthView
            current={current}
            appointments={appointments}
            onDayClick={openCreate}
            onAppointmentClick={openEdit}
          />
        ) : (
          <WeekView
            current={current}
            appointments={appointments}
            onSlotClick={openCreate}
            onAppointmentClick={openEdit}
          />
        )}
      </div>

      <AppointmentModal
        key={modalOpen ? editingAppt?.id ?? "new" : "closed"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editingAppt}
        contacts={contacts}
        services={services}
        defaultStart={defaultStart}
        onSave={handleSave}
        onAccept={handleAccept}
        onReject={handleReject}
        onOpenResponseDoc={(a) => setResponseDocAppt(a)}
      />

      {responseDocAppt && (
        <ResponseDocumentModal
          open={Boolean(responseDocAppt)}
          onClose={() => setResponseDocAppt(undefined)}
          appointment={responseDocAppt}
          onSuccess={() => refreshRange()}
        />
      )}
    </div>
  );
}

// useSearchParams() must sit under a Suspense boundary (Next.js App Router).
export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-8 text-sm text-neutral-400">Cargando…</div>}>
      <CalendarPageInner />
    </Suspense>
  );
}
