"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  FileText,
  Printer,
  Save,
  CheckCircle2,
  Stethoscope,
  BookOpen,
  ClipboardList,
  Sparkles,
  User,
  Calendar,
  Clock,
  X,
  Download,
  Eye,
} from "lucide-react";
import { Appointment, AppointmentResponseDocument } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch, ApiError, apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  appointment: Appointment;
  onSuccess?: (updated: Appointment) => void;
}

const TEMPLATES = [
  {
    key: "clinical_diagnosis",
    label: "Diagnóstico Clínico (Clínica / Doctor)",
    icon: Stethoscope,
    defaultTitle: "Informe de Diagnóstico y Plan Terapéutico",
    placeholders: {
      symptoms: "Motivo de consulta, sintomatología actual y antecedentes relevantes...",
      diagnosis: "Diagnóstico clínico principal (ej. Lumbalgia mecánica aguda / Gingivitis marginal)...",
      treatment: "Tratamiento pautado, prescripción farmacológica o procedimiento realizado...",
      recommendations: "Recomendaciones higiénico-dietéticas, ejercicios o pautas de descanso...",
      notes: "Evolución prevista, fecha de próxima revisión o derivación...",
    },
  },
  {
    key: "session_notes",
    label: "Informe de Sesión / Terapia",
    icon: BookOpen,
    defaultTitle: "Informe de Sesión Terapéutica",
    placeholders: {
      symptoms: "Estado anímico / físico inicial reportado por el usuario...",
      diagnosis: "Aspectos clave abordados durante la sesión...",
      treatment: "Intervenciones realizadas, ejercicios y técnicas aplicadas...",
      recommendations: "Tareas intersesión y pautas a practicar...",
      notes: "Observaciones del terapeuta y objetivos para la siguiente cita...",
    },
  },
  {
    key: "general_report",
    label: "Informe General de Consulta",
    icon: ClipboardList,
    defaultTitle: "Informe de Consulta y Dictamen",
    placeholders: {
      symptoms: "Motivo de la cita y necesidades expresadas...",
      diagnosis: "Valoración profesional y dictamen...",
      treatment: "Plan de acción o servicio prestado...",
      recommendations: "Conclusiones y siguientes pasos acordados...",
      notes: "Notas adicionales...",
    },
  },
  {
    key: "custom",
    label: "Formato Personalizado",
    icon: Sparkles,
    defaultTitle: "Documento de Respuesta y Dictamen",
    placeholders: {
      symptoms: "Antecedentes y contexto...",
      diagnosis: "Diagnóstico o valoración...",
      treatment: "Pautas o soluciones...",
      recommendations: "Recomendaciones...",
      notes: "Observaciones...",
    },
  },
];

export function ResponseDocumentModal({
  open,
  onClose,
  appointment,
  onSuccess,
}: Props) {
  const { user } = useAuth();
  const branding = useBranding();
  const toast = useToast();

  const existing = appointment.responseDocument;

  const [templateKey, setTemplateKey] = useState<string>(
    existing?.templateKey || "clinical_diagnosis"
  );
  const [title, setTitle] = useState<string>(
    existing?.title ||
      TEMPLATES.find((t) => t.key === (existing?.templateKey || "clinical_diagnosis"))
        ?.defaultTitle ||
      "Informe de Consulta / Diagnóstico"
  );
  const [symptoms, setSymptoms] = useState<string>(
    existing?.symptoms || appointment.reason || ""
  );
  const [diagnosis, setDiagnosis] = useState<string>(existing?.diagnosis || "");
  const [treatment, setTreatment] = useState<string>(existing?.treatment || "");
  const [recommendations, setRecommendations] = useState<string>(
    existing?.recommendations || ""
  );
  const [notes, setNotes] = useState<string>(existing?.notes || "");
  const [signedBy, setSignedBy] = useState<string>(
    existing?.signedBy || user?.name || user?.email || "Responsable"
  );

  const [isPreview, setIsPreview] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      const doc = appointment.responseDocument;
      const tKey = doc?.templateKey || "clinical_diagnosis";
      setTemplateKey(tKey);
      setTitle(
        doc?.title ||
          TEMPLATES.find((t) => t.key === tKey)?.defaultTitle ||
          "Informe de Consulta / Diagnóstico"
      );
      setSymptoms(doc?.symptoms || appointment.reason || "");
      setDiagnosis(doc?.diagnosis || "");
      setTreatment(doc?.treatment || "");
      setRecommendations(doc?.recommendations || "");
      setNotes(doc?.notes || "");
      setSignedBy(doc?.signedBy || user?.name || user?.email || "Responsable");
      setIsPreview(false);
    }
  }, [open, appointment, user]);

  if (!open) return null;

  const currentTemplate =
    TEMPLATES.find((t) => t.key === templateKey) || TEMPLATES[0];

  function handleTemplateChange(key: string) {
    setTemplateKey(key);
    const tmpl = TEMPLATES.find((t) => t.key === key);
    if (tmpl && !existing?.title) {
      setTitle(tmpl.defaultTitle);
    }
  }

  async function handleSave(markCompleted: boolean = true) {
    setSaving(true);
    try {
      const payload = {
        templateKey,
        title,
        symptoms,
        diagnosis,
        treatment,
        recommendations,
        notes,
        markCompleted,
      };

      const updated = await apiFetch<Appointment>(
        `/api/appointments/${appointment.id}/response-document`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      toast.success(
        markCompleted
          ? "Documento guardado y cita marcada como completada."
          : "Documento de respuesta guardado correctamente."
      );
      if (onSuccess) onSuccess(updated);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error al guardar el documento."
      );
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const apptDate = appointment.startsAt ? parseISO(appointment.startsAt) : new Date();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 sm:p-6 print:p-0 print:bg-white print:static print:inset-auto">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden print:max-h-none print:shadow-none print:w-full print:rounded-none">
        {/* Header - Screen only */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50/80 px-6 py-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900">
                Documento de Respuesta y Diagnóstico
              </h2>
              <p className="text-xs text-neutral-500">
                {appointment.service} · {appointment.contact?.name || "Paciente / Contacto"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {existing && (
              <>
                <a
                  href={apiUrl(`/api/appointments/${appointment.id}/doctor-report/pdf`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                  title="Abrir PDF oficial en nueva pestaña"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver PDF
                </a>
                <a
                  href={apiUrl(`/api/appointments/${appointment.id}/doctor-report/download`)}
                  className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
                  title="Descargar archivo PDF oficial del doctor"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar PDF
                </a>
              </>
            )}
            <button
              type="button"
              onClick={() => setIsPreview(!isPreview)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                isPreview
                  ? "bg-indigo-100 text-indigo-800"
                  : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
              )}
            >
              {isPreview ? "Editar Formulario" : "Vista Previa de Informe"}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handlePrint}
              className="text-neutral-600 hover:text-neutral-900"
            >
              <Printer className="h-4 w-4 mr-1" />
              Imprimir
            </Button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          {!isPreview ? (
            /* ─── EDIT MODE ─── */
            <div className="space-y-5">
              {/* Template Selector */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
                  Plantilla de Documento / Especialidad
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {TEMPLATES.map((tmpl) => {
                    const Icon = tmpl.icon;
                    const isSelected = templateKey === tmpl.key;
                    return (
                      <button
                        key={tmpl.key}
                        type="button"
                        onClick={() => handleTemplateChange(tmpl.key)}
                        className={cn(
                          "flex flex-col items-start p-3 rounded-xl border text-left transition-all",
                          isSelected
                            ? "border-indigo-600 bg-indigo-50/70 text-indigo-900 shadow-sm"
                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg mb-2",
                            isSelected ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-600"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-bold leading-snug">
                          {tmpl.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI Analysis Findings Available */}
              {appointment.aiAnalysisResult && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 flex flex-col sm:flex-row items-start justify-between gap-3 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg">🤖</span>
                    <div>
                      <span className="text-xs font-bold text-sky-950 block">
                        Dictamen de Análisis IA Disponible ({appointment.aiAnalysisType ? appointment.aiAnalysisType.toUpperCase() : "CLÍNICO"})
                      </span>
                      <p className="text-xs text-sky-900 line-clamp-2 mt-0.5 font-mono">
                        {appointment.aiAnalysisResult}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setDiagnosis((prev) =>
                        prev
                          ? `${prev}\n\n[Hallazgos IA (${appointment.aiAnalysisType})]:\n${appointment.aiAnalysisResult}`
                          : `[Hallazgos IA (${appointment.aiAnalysisType})]:\n${appointment.aiAnalysisResult}`
                      );
                      toast.success("Hallazgos de IA importados en el diagnóstico.");
                    }}
                    className="bg-sky-600 hover:bg-sky-700 text-xs shrink-0 whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Importar en Diagnóstico
                  </Button>
                </div>
              )}

              {/* Title & Responsible Doctor */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Título del Informe
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="ej. Informe de Consulta y Diagnóstico Clínico"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Profesional / Doctor Emisor
                  </label>
                  <Input
                    value={signedBy}
                    onChange={(e) => setSignedBy(e.target.value)}
                    placeholder="Nombre del doctor / responsable"
                  />
                </div>
              </div>

              {/* Patient / Appointment Context Banner */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-xs text-neutral-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span className="font-semibold">{appointment.contact?.name || "Sin nombre"}</span>
                  {appointment.contact?.phone && (
                    <span className="text-neutral-500">({appointment.contact.phone})</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-neutral-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(apptDate, "d 'de' MMMM yyyy", { locale: es })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {format(apptDate, "HH:mm")}
                  </span>
                  <span className="bg-indigo-100 text-indigo-800 font-medium px-2 py-0.5 rounded-full text-[11px]">
                    {appointment.service}
                  </span>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                {/* 1. Motivo / Anamnesis */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">
                    1. Motivo de Consulta / Anamnesis / Sintomatología
                  </label>
                  <textarea
                    rows={3}
                    className="block w-full rounded-xl border border-neutral-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
                    placeholder={currentTemplate.placeholders.symptoms}
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                  />
                </div>

                {/* 2. Diagnóstico Principal / Valoración */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">
                    2. Diagnóstico Principal / Valoración Profesional
                  </label>
                  <textarea
                    rows={3}
                    className="block w-full rounded-xl border border-neutral-300 p-3 text-sm font-medium focus:border-indigo-500 focus:outline-none"
                    placeholder={currentTemplate.placeholders.diagnosis}
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                  />
                </div>

                {/* 3. Tratamiento / Prescripción */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">
                    3. Tratamiento / Prescripción / Procedimiento Realizado
                  </label>
                  <textarea
                    rows={3}
                    className="block w-full rounded-xl border border-neutral-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
                    placeholder={currentTemplate.placeholders.treatment}
                    value={treatment}
                    onChange={(e) => setTreatment(e.target.value)}
                  />
                </div>

                {/* 4. Recomendaciones & Seguimiento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-800 mb-1">
                      4. Recomendaciones y Pautas
                    </label>
                    <textarea
                      rows={3}
                      className="block w-full rounded-xl border border-neutral-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
                      placeholder={currentTemplate.placeholders.recommendations}
                      value={recommendations}
                      onChange={(e) => setRecommendations(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-800 mb-1">
                      5. Observaciones / Próxima Revisión
                    </label>
                    <textarea
                      rows={3}
                      className="block w-full rounded-xl border border-neutral-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
                      placeholder={currentTemplate.placeholders.notes}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ─── PROFESSIONAL PRINT / PREVIEW SHEET ─── */
            <div className="rounded-2xl border border-neutral-200 bg-white p-8 sm:p-12 shadow-sm font-sans space-y-8 print:p-0 print:border-none print:shadow-none">
              {/* Document Letterhead */}
              <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-6">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
                    {branding.businessName || "Clínica & Centro de Especialistas"}
                  </h1>
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-700 mt-1">
                    {title}
                  </p>
                </div>
                {branding.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={branding.logoUrl}
                    alt={branding.businessName}
                    className="h-12 w-auto object-contain"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-lg">
                    {branding.businessName?.[0] || "C"}
                  </div>
                )}
              </div>

              {/* Identification Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl bg-neutral-50 p-4 text-xs border border-neutral-200">
                <div>
                  <span className="text-neutral-400 uppercase font-semibold text-[10px] block">
                    Paciente / Cliente
                  </span>
                  <span className="font-bold text-neutral-900 text-sm">
                    {appointment.contact?.name || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 uppercase font-semibold text-[10px] block">
                    Contacto
                  </span>
                  <span className="font-medium text-neutral-800">
                    {appointment.contact?.phone || appointment.contact?.email || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 uppercase font-semibold text-[10px] block">
                    Fecha de Atención
                  </span>
                  <span className="font-medium text-neutral-800">
                    {format(apptDate, "d 'de' MMMM yyyy", { locale: es })}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 uppercase font-semibold text-[10px] block">
                    Servicio / Actividad
                  </span>
                  <span className="font-medium text-neutral-800">
                    {appointment.service}
                  </span>
                </div>
              </div>

              {/* Document Sections */}
              <div className="space-y-6 text-sm text-neutral-800">
                {symptoms && (
                  <div className="border-l-4 border-indigo-200 pl-4 py-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      1. Motivo de Consulta / Anamnesis
                    </h3>
                    <p className="whitespace-pre-wrap leading-relaxed text-neutral-800">{symptoms}</p>
                  </div>
                )}

                {diagnosis && (
                  <div className="border-l-4 border-indigo-600 pl-4 py-1 bg-indigo-50/40 p-3 rounded-r-lg">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900 mb-1">
                      2. Diagnóstico Principal / Valoración
                    </h3>
                    <p className="whitespace-pre-wrap font-semibold leading-relaxed text-neutral-900">
                      {diagnosis}
                    </p>
                  </div>
                )}

                {treatment && (
                  <div className="border-l-4 border-emerald-500 pl-4 py-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      3. Tratamiento / Prescripción Pautada
                    </h3>
                    <p className="whitespace-pre-wrap leading-relaxed text-neutral-800">{treatment}</p>
                  </div>
                )}

                {recommendations && (
                  <div className="border-l-4 border-amber-400 pl-4 py-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      4. Recomendaciones e Indicaciones
                    </h3>
                    <p className="whitespace-pre-wrap leading-relaxed text-neutral-800">{recommendations}</p>
                  </div>
                )}

                {notes && (
                  <div className="border-l-4 border-neutral-300 pl-4 py-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">
                      5. Observaciones
                    </h3>
                    <p className="whitespace-pre-wrap text-xs text-neutral-600 leading-relaxed">{notes}</p>
                  </div>
                )}
              </div>

              {/* Signatures & Footer */}
              <div className="pt-10 border-t border-neutral-200 flex items-end justify-between text-xs">
                <div className="text-neutral-400 max-w-sm text-[11px] leading-snug">
                  <p>Documento emitido electrónicamente por el sistema clínico de {branding.businessName}.</p>
                  <p className="mt-0.5">Fecha de emisión: {format(new Date(), "dd/MM/yyyy HH:mm")}</p>
                </div>

                <div className="text-center min-w-[200px] border-t border-neutral-400 pt-2">
                  <p className="font-bold text-neutral-900">{signedBy}</p>
                  <p className="text-[11px] text-neutral-500">Firma y Sello del Facultativo</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions - Screen only */}
        <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50/80 px-6 py-4 print:hidden">
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => handleSave(false)}
            >
              <Save className="h-4 w-4 mr-1.5" />
              Guardar Borrador
            </Button>

            <Button
              type="button"
              variant="primary"
              disabled={saving}
              onClick={() => handleSave(true)}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {saving ? "Guardando..." : "Guardar y Completar Cita"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
