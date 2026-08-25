"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import { SimuladorDiagnosticoModal, ModalityType } from "@/components/SimuladorDiagnosticoModal";
import { Sparkles, ArrowLeft, ShieldCheck, Stethoscope, Camera, CheckCircle2 } from "lucide-react";

function getQueryParam(
  searchParams: ReturnType<typeof useSearchParams>,
  ...keys: string[]
): string {
  if (!searchParams) return "";
  for (const k of keys) {
    const val = searchParams.get(k);
    if (val) return val;
  }
  // Case-insensitive fallback across all searchParams
  const lowerKeys = keys.map((k) => k.toLowerCase());
  for (const [key, value] of searchParams.entries()) {
    if (lowerKeys.includes(key.toLowerCase()) && value) {
      return value;
    }
  }
  return "";
}

function hasQueryParam(
  searchParams: ReturnType<typeof useSearchParams>,
  ...keys: string[]
): boolean {
  if (!searchParams) return false;
  for (const k of keys) {
    if (searchParams.has(k)) return true;
  }
  const lowerKeys = keys.map((k) => k.toLowerCase());
  for (const key of searchParams.keys()) {
    if (lowerKeys.includes(key.toLowerCase())) return true;
  }
  return false;
}

function resolveModality(param?: string | null): ModalityType {
  if (!param) return "dental";
  // Normalize: lower case, trim, strip accents (á -> a, é -> e, etc.)
  const p = param
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    p === "estetica" ||
    p === "aesthetic" ||
    p === "belleza" ||
    p === "facial" ||
    p === "botox" ||
    p === "labios"
  ) {
    return "aesthetic";
  }
  if (
    p === "derma" ||
    p === "dermatologia" ||
    p === "dermatology" ||
    p === "piel" ||
    p === "lunar" ||
    p === "lesion"
  ) {
    return "dermatology";
  }
  if (
    p === "rx" ||
    p === "radiografia" ||
    p === "dental_xray" ||
    p === "dental-rx" ||
    p === "xray" ||
    p === "panoramica"
  ) {
    return "dental_xray";
  }
  if (p === "general" || p === "medicina_general" || p === "triaje" || p === "medicina") {
    return "general";
  }
  if (
    p === "dental" ||
    p === "dientes" ||
    p === "boca" ||
    p === "odontologia" ||
    p === "ortodoncia"
  ) {
    return "dental";
  }
  return (p as ModalityType) || "dental";
}

function SimuladorIaContent() {
  const searchParams = useSearchParams();

  // Case-insensitive query param reading
  const phone = getQueryParam(searchParams, "phone", "telefono", "movil", "whatsapp");
  const name = getQueryParam(searchParams, "name", "nombre", "paciente");
  const email = getQueryParam(searchParams, "email", "correo", "mail");
  const doctor = getQueryParam(
    searchParams,
    "doctorCorreo",
    "doctor",
    "emailDoctor",
    "responsable",
    "doctorEmail",
    "medico"
  );

  const rawModality = getQueryParam(
    searchParams,
    "analizaia",
    "ia",
    "modality",
    "servicio",
    "specialty",
    "especialidad",
    "tipo"
  );
  const modality = resolveModality(rawModality);

  const lockFlag = getQueryParam(searchParams, "fijo", "lock", "bloquear");
  const lockModality =
    lockFlag === "true" ||
    lockFlag === "1" ||
    hasQueryParam(
      searchParams,
      "analizaia",
      "servicio",
      "modality",
      "especialidad",
      "specialty"
    );

  const [modalOpen, setModalOpen] = useState(true);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-neutral-900 font-sans selection:bg-[#800020] selection:text-white flex flex-col">
      {/* Header Bar */}
      <header className="border-b border-neutral-200 bg-white shadow-xs">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#800020] text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-[#800020]">Simulador Clínico IA</span>
              <span className="text-[11px] text-neutral-500 block">Diagnóstico Visual Asistido</span>
            </div>
          </div>

          <Link
            href="/demo-landing"
            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-lg transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Ir a la Landing
          </Link>
        </div>
      </header>

      {/* Hero Body */}
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center text-center space-y-6">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold uppercase tracking-wider border border-emerald-300">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> Triaje Clínico en Segundos con IA
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-neutral-900 leading-tight">
          Sube tu foto y recibe una valoración preliminar
        </h1>

        <p className="text-neutral-600 text-sm max-w-xl leading-relaxed">
          Nuestra inteligencia artificial clínica analiza la imagen capturada para ofrecerte una orientación inmediata y derivar tu caso con la máxima prioridad al especialista responsable.
        </p>

        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-6 py-3.5 rounded-xl bg-[#800020] hover:bg-[#800020]/90 text-white font-bold text-xs uppercase tracking-wider shadow-lg hover:shadow-xl transition flex items-center gap-2"
          >
            <Camera className="h-4 w-4" />
            Abrir Simulador de Diagnóstico
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-8 text-left max-w-2xl w-full">
          <div className="p-4 rounded-xl bg-white border border-neutral-200 shadow-xs space-y-1">
            <div className="text-emerald-600 font-bold text-xs flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> 100% Confidencial
            </div>
            <p className="text-[11px] text-neutral-500">Tus datos e imágenes se procesan de forma privada y segura.</p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-neutral-200 shadow-xs space-y-1">
            <div className="text-sky-600 font-bold text-xs flex items-center gap-1">
              <Camera className="h-3.5 w-3.5" /> Recorte Inteligente
            </div>
            <p className="text-[11px] text-neutral-500">Encuadra y recorta exactamente la zona a evaluar.</p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-neutral-200 shadow-xs space-y-1">
            <div className="text-[#800020] font-bold text-xs flex items-center gap-1">
              <Stethoscope className="h-3.5 w-3.5" /> Revisión Médica
            </div>
            <p className="text-[11px] text-neutral-500">Notificación automática al doctor asignado.</p>
          </div>
        </div>
      </main>

      {/* Simulator Modal */}
      <SimuladorDiagnosticoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialPhone={phone}
        initialName={name}
        initialEmail={email}
        initialDoctor={doctor}
        initialModality={modality}
        lockModality={Boolean(lockModality)}
      />
    </div>
  );
}

export default function SimuladorIaPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-xs text-neutral-500">Cargando simulador...</div>}>
      <SimuladorIaContent />
    </Suspense>
  );
}
