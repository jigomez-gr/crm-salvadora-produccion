"use client";

import React, { useState } from "react";
import { Phone, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";

interface VapiVoiceBookingButtonProps {
  apiUrl?: string;
  agentKey?: string;
  buttonText?: string;
  className?: string;
  serviceHint?: string;
}

export function VapiVoiceBookingButton({
  apiUrl = process.env.NEXT_PUBLIC_CRM_API_URL || "https://crm-salvadoraconesa.jigretera.com",
  agentKey = "booking",
  buttonText = "Pedir Cita por Teléfono (Llamada IA)",
  className = "",
  serviceHint = "Reserva de clase o consulta general",
}: VapiVoiceBookingButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const cleanApiUrl = apiUrl.replace(/\/$/, "");

  function normalizePhone(raw: string): string {
    const clean = raw.replace(/\s+/g, "");
    if (/^[6789]\d{8}$/.test(clean)) {
      return `+34${clean}`;
    }
    if (!clean.startsWith("+")) {
      return `+${clean}`;
    }
    return clean;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!phone.trim()) {
      setErrorMsg("Por favor, introduce tu número de teléfono.");
      return;
    }

    const formattedPhone = normalizePhone(phone.trim());
    if (formattedPhone.length < 9) {
      setErrorMsg("El número de teléfono parece incompleto.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${cleanApiUrl}/api/widget/vapi/call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          name: name.trim() || undefined,
          agentKey: agentKey,
          inquiry: serviceHint,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMsg(data.error || "No se pudo iniciar la llamada. Por favor intenta de nuevo.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Error de conexión con el servidor. Inténtalo de nuevo en unos momentos.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setIsOpen(false);
    setStatus("idle");
    setErrorMsg("");
    setName("");
    setPhone("");
  }

  return (
    <>
      {/* Botón de apertura */}
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#800020] px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-[#660019] transition-all focus:outline-none focus:ring-2 focus:ring-[#800020]/30 active:scale-[0.99] ${className}`}
      >
        <Phone className="h-4 w-4 animate-pulse" />
        <span>{buttonText}</span>
      </button>

      {/* Modal interactivo */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-neutral-100">
            {/* Botón cerrar */}
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {status === "success" ? (
              <div className="text-center py-4 space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-neutral-900">¡Llamándote ahora mismo!</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">
                  Descuelga tu teléfono <strong>{phone}</strong>. Nuestra asistente de voz inteligente te atenderá para
                  confirmar tu plaza.
                </p>
                <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 text-left border border-amber-200">
                  📲 <strong>Confirmación por SMS:</strong> Tras acordar tu cita, recibirás un mensaje SMS al instante
                  con todos los detalles y la confirmación de tu reserva.
                </div>
                <button
                  onClick={handleClose}
                  className="mt-4 w-full rounded-xl bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
                >
                  Entendido
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#800020]/10 px-3 py-1 text-xs font-semibold text-[#800020]">
                    <Phone className="h-3.5 w-3.5" /> Asistente de Voz Telefónica
                  </div>
                  <h3 className="mt-2 text-xl font-bold text-neutral-900">Reserva tu cita por teléfono</h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    Indícanos tu número y te llamamos en 5 segundos. Hablarás con nuestra IA y recibirás un SMS de
                    confirmación de Zadarma al finalizar.
                  </p>
                </div>

                {status === "error" && errorMsg && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Tu Nombre (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej. María García"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#800020] focus:outline-none focus:ring-1 focus:ring-[#800020]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Número de Teléfono Móvil <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej. 611 22 33 44"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#800020] focus:outline-none focus:ring-1 focus:ring-[#800020]"
                  />
                  <span className="text-[11px] text-neutral-400 mt-1 block">
                    Admite números de España (+34) o internacionales con prefijo (+).
                  </span>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#800020] py-3 text-sm font-semibold text-white shadow hover:bg-[#660019] transition-all disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Conectando llamada...</span>
                      </>
                    ) : (
                      <>
                        <Phone className="h-4 w-4" />
                        <span>Llamarme Ahora Gratis</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
