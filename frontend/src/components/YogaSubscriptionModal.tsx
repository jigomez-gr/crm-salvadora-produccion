"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Contact } from "@/lib/types";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  User,
  Phone,
  Mail,
  ArrowRight,
} from "lucide-react";

export interface OfficialSlot {
  day: number;
  label: string;
  time: string;
  fullLabel: string;
}

export const OFFICIAL_YOGA_SLOTS: OfficialSlot[] = [
  { day: 2, label: "Martes", time: "09:45", fullLabel: "Martes (09:45)" },
  { day: 2, label: "Martes", time: "11:15", fullLabel: "Martes (11:15)" },
  { day: 2, label: "Martes", time: "17:00", fullLabel: "Martes (17:00)" },
  { day: 2, label: "Martes", time: "18:30", fullLabel: "Martes (18:30)" },
  { day: 2, label: "Martes", time: "20:00", fullLabel: "Martes (20:00)" },
  { day: 3, label: "Miércoles", time: "20:15", fullLabel: "Miércoles (20:15)" },
  { day: 4, label: "Jueves", time: "09:45", fullLabel: "Jueves (09:45)" },
  { day: 4, label: "Jueves", time: "11:15", fullLabel: "Jueves (11:15)" },
  { day: 4, label: "Jueves", time: "16:00", fullLabel: "Jueves (16:00)" },
  { day: 4, label: "Jueves", time: "17:30", fullLabel: "Jueves (17:30)" },
  { day: 4, label: "Jueves", time: "19:00", fullLabel: "Jueves (19:00)" },
];

interface YogaSubscriptionModalProps {
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function YogaSubscriptionModal({
  contact,
  open,
  onClose,
  onSuccess,
}: YogaSubscriptionModalProps) {
  const toast = useToast();

  // Selected slots (key: "day-time")
  const [slot1, setSlot1] = useState<string>("");
  const [slot2, setSlot2] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  // Confirmation views
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmChangeOpen, setConfirmChangeOpen] = useState(false);

  // Loading
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState<{
    groups: string[];
    futureYogaAppointments: Array<{ id: string; service: string; startsAt: string }>;
  } | null>(null);

  // Initialize slots when contact opens
  useEffect(() => {
    if (!open || !contact) {
      setSlot1("");
      setSlot2("");
      setReason("");
      setConfirmCancelOpen(false);
      setConfirmChangeOpen(false);
      setSubscriptionDetails(null);
      return;
    }

    if (contact.studentSchedule && Array.isArray(contact.studentSchedule) && contact.studentSchedule.length > 0) {
      const s0 = contact.studentSchedule[0];
      if (s0) setSlot1(`${s0.day}-${s0.time}`);
      const s1 = contact.studentSchedule[1];
      if (s1) setSlot2(`${s1.day}-${s1.time}`);
      else setSlot2("");
    } else {
      setSlot1("2-09:45");
      setSlot2("");
    }

    // Fetch detailed subscription status
    setDetailsLoading(true);
    apiFetch<{ contact: Contact; groups: string[]; futureYogaAppointments: any[] }>(
      `/api/contacts/${contact.id}/yoga-subscription`
    )
      .then((data) => {
        setSubscriptionDetails({
          groups: data.groups || [],
          futureYogaAppointments: data.futureYogaAppointments || [],
        });
      })
      .catch(() => {
        // Fallback silently if not yet available
      })
      .finally(() => setDetailsLoading(false));
  }, [open, contact]);

  if (!contact) return null;

  // Helpers to parse slot value
  const parseSlot = (val: string): { day: number; time: string } | null => {
    if (!val) return null;
    const [d, t] = val.split("-");
    const dayNum = parseInt(d, 10);
    if (isNaN(dayNum) || !t) return null;
    return { day: dayNum, time: t };
  };

  const parsed1 = parseSlot(slot1);
  const parsed2 = parseSlot(slot2);

  const slot1Obj = OFFICIAL_YOGA_SLOTS.find((s) => `${s.day}-${s.time}` === slot1);
  const slot2Obj = OFFICIAL_YOGA_SLOTS.find((s) => `${s.day}-${s.time}` === slot2);

  // Coherence validation
  const validateCoherence = (): string | null => {
    if (!parsed1) {
      return "Debes seleccionar al menos el primer turno de yoga (Día y hora 1).";
    }
    if (parsed2) {
      if (parsed1.day === parsed2.day && parsed1.time === parsed2.time) {
        return "Los dos turnos semanales no pueden ser el mismo día a la misma hora.";
      }
    }
    return null;
  };

  const targetModality = parsed2 ? "2_clases_semanales" : "1_clase_semanal";

  // Handle Cancel Subscription
  const handleExecuteCancel = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/contacts/${contact.id}/yoga-subscription/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() || "Anulación de suscripción solicitada desde el CRM" }),
      });
      toast.success(
        `Suscripción de yoga anulada para ${contact.name}. Se ha trasladado a EXALUMNOS y cancelado sus citas futuras.`
      );
      setConfirmCancelOpen(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err instanceof ApiError ? err.message : "Error al anular la suscripción.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Change Subscription
  const handleExecuteChange = async () => {
    const errorMsg = validateCoherence();
    if (errorMsg) {
      toast.error(errorMsg);
      return;
    }

    const slotsToSave: Array<{ day: number; time: string }> = [parsed1!];
    if (parsed2) slotsToSave.push(parsed2);

    setLoading(true);
    try {
      await apiFetch(`/api/contacts/${contact.id}/yoga-subscription/change`, {
        method: "POST",
        body: JSON.stringify({
          schedule: slotsToSave,
          modality: targetModality,
          reason: reason.trim() || "Cambio de suscripción de yoga desde el CRM",
        }),
      });
      toast.success(
        `Suscripción de yoga actualizada a ${targetModality === "2_clases_semanales" ? "2 clases/semana (42€/mes)" : "1 clase/semana (25€/mes)"} para ${contact.name}.`
      );
      setConfirmChangeOpen(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err instanceof ApiError ? err.message : "Error al cambiar la suscripción de yoga.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal
        open={open && !confirmCancelOpen && !confirmChangeOpen}
        onClose={onClose}
        title="Gestión de Suscripción — Hatha Yoga Terapéutico"
        className="max-w-xl"
      >
        <div className="space-y-4">
          {/* Card: Repetición de datos del contacto */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 text-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-neutral-400" />
                  <span className="font-semibold text-neutral-900">{contact.name}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-neutral-400" />
                    {contact.phone || "Sin teléfono"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3 text-neutral-400" />
                    {contact.email || "Sin email"}
                  </span>
                </div>
              </div>
              <span className="text-right text-xs">
                {contact.isStudent ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 border border-emerald-300">
                    🧘 Alumno Activo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 border border-neutral-200">
                    No suscrito
                  </span>
                )}
              </span>
            </div>

            {/* Current subscription detail */}
            <div className="mt-3 border-t border-neutral-200/80 pt-2.5 text-xs text-neutral-700">
              <span className="font-semibold text-neutral-800">Estado actual de suscripción: </span>
              {contact.isStudent ? (
                <span>
                  {contact.studentModality === "2_clases_semanales" ? "2 clases/semana (42€/mes)" : "1 clase/semana (25€/mes)"}
                  {contact.studentSchedule && contact.studentSchedule.length > 0 && (
                    <span className="ml-1 text-emerald-700 font-medium">
                      · Turnos: {contact.studentSchedule.map((s) => `${s.day === 2 ? "Mar" : s.day === 3 ? "Mié" : "Jue"} (${s.time})`).join(" y ")}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-neutral-500">Sin suscripción activa (Contacto regular o Exalumno).</span>
              )}

              {/* Group membership */}
              {subscriptionDetails && subscriptionDetails.groups.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-neutral-500">
                  <span>Grupos en miembrosgrupo:</span>
                  {subscriptionDetails.groups.map((g) => (
                    <span
                      key={g}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                        g.includes("YOGA")
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : g.includes("EXALUMNO")
                          ? "bg-amber-50 text-amber-800 border-amber-300"
                          : "bg-neutral-100 text-neutral-700 border-neutral-200"
                      }`}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Form: Dos campos dia semana (hh:mm) */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Configuración de Turnos de Yoga Terapéutico
            </h4>

            {/* Campo 1 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                <span>Turno 1: Día semana (hh:mm) <span className="text-red-500 font-bold">*</span></span>
              </label>
              <select
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={slot1}
                onChange={(e) => setSlot1(e.target.value)}
              >
                <option value="">-- Selecciona el primer turno semanal --</option>
                {OFFICIAL_YOGA_SLOTS.map((s) => (
                  <option key={`s1-${s.day}-${s.time}`} value={`${s.day}-${s.time}`}>
                    {s.fullLabel} — {s.label} a las {s.time} h
                  </option>
                ))}
              </select>
            </div>

            {/* Campo 2 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Turno 2: Día semana (hh:mm)</span>
                </span>
                <span className="text-[11px] text-neutral-400">
                  (Opcional: déjalo vacío para 1 clase semanal)
                </span>
              </label>
              <select
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={slot2}
                onChange={(e) => setSlot2(e.target.value)}
              >
                <option value="">-- Ninguno (Solo 1 clase semanal · 25€/mes) --</option>
                {OFFICIAL_YOGA_SLOTS.map((s) => (
                  <option key={`s2-${s.day}-${s.time}`} value={`${s.day}-${s.time}`}>
                    {s.fullLabel} — {s.label} a las {s.time} h
                  </option>
                ))}
              </select>
            </div>

            {/* Motivo opcional */}
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Motivo u observaciones (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. Pasa a dos clases por horario laboral, o cambio de turno de martes a jueves"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {/* Resultado dinámico */}
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-900 flex items-center justify-between">
              <div>
                <span className="font-bold">Modalidad resultante: </span>
                <span>
                  {parsed2 ? "2 clases semanales (42,00 €/mes)" : "1 clase semanal (25,00 €/mes)"}
                </span>
              </div>
              <div className="font-semibold text-emerald-700">
                Grupo: {parsed2 ? "YOGA_TERAPEUTICO_2" : "YOGA_TERAPEUTICO_1"}
              </div>
            </div>
          </div>

          {/* Botones de acción solicitados */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-between gap-2">
            <Button
              type="button"
              variant="danger"
              className="w-full sm:w-auto font-bold uppercase tracking-wider text-xs px-4 py-2"
              onClick={() => setConfirmCancelOpen(true)}
              disabled={loading}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              ANULAR SUSCRIPCION
            </Button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                Cerrar
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto font-bold uppercase tracking-wider text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  const err = validateCoherence();
                  if (err) {
                    toast.error(err);
                    return;
                  }
                  setConfirmChangeOpen(true);
                }}
                disabled={loading}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                CAMBIAR SUSCRIPCION
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal: ANULAR SUSCRIPCION */}
      <Modal
        open={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        title="Confirmar Anulación de Suscripción"
      >
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-3 text-red-900">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold">¿Estás seguro de anular la suscripción de yoga para {contact.name}?</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Se cancelarán todas sus citas de yoga a partir de hoy.</li>
                <li>Se le desasignará de los grupos de Yoga (<code className="font-mono">YOGA_TERAPEUTICO_1</code> / <code className="font-mono">YOGA_TERAPEUTICO_2</code>).</li>
                <li>Pasará inmediatamente al grupo <code className="font-mono">EXALUMNOS</code>.</li>
                <li>Se despachará el aviso oficial de cancelación por correo electrónico / WhatsApp.</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmCancelOpen(false)} disabled={loading}>
              Volver
            </Button>
            <Button variant="danger" onClick={handleExecuteCancel} disabled={loading}>
              {loading ? "Procesando baja…" : "Sí, anular suscripción"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal: CAMBIAR SUSCRIPCION */}
      <Modal
        open={confirmChangeOpen}
        onClose={() => setConfirmChangeOpen(false)}
        title="Confirmar Cambio de Suscripción"
      >
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-950 text-xs space-y-2">
            <p className="font-bold text-sm text-emerald-900">
              ¿Confirmas el cambio de suscripción para {contact.name}?
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span>Nueva modalidad:</span>
                <span className="font-bold">
                  {parsed2 ? "2 clases semanales (42,00 €/mes)" : "1 clase semanal (25,00 €/mes)"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Turno 1:</span>
                <span className="font-semibold text-emerald-800">{slot1Obj?.fullLabel}</span>
              </div>
              {slot2Obj && (
                <div className="flex items-center justify-between">
                  <span>Turno 2:</span>
                  <span className="font-semibold text-emerald-800">{slot2Obj?.fullLabel}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span>Grupo CRM:</span>
                <span className="font-mono font-bold text-emerald-800">
                  {parsed2 ? "YOGA_TERAPEUTICO_2" : "YOGA_TERAPEUTICO_1"}
                </span>
              </div>
            </div>
            <p className="pt-1 text-[11px] text-emerald-800 border-t border-emerald-200">
              A partir de hoy se ajustarán las citas de suscripción, se retirarán los turnos anteriores, se crearán las nuevas clases y se despachará la notificación oficial.
            </p>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmChangeOpen(false)} disabled={loading}>
              Modificar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={handleExecuteChange}
              disabled={loading}
            >
              {loading ? "Aplicando cambios…" : "Confirmar y aplicar cambio"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
