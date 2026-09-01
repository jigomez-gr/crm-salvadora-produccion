"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Edit2, Sparkles, Calendar, UserCheck, Clock, Tag, AlertCircle, ExternalLink, CreditCard, Compass, Users, CheckCircle2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Service, User } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface ServiceFormData {
  name: string;
  description: string;
  serviceType: "recurring" | "event";
  eventDatesText: string;
  maxCapacity: string;
  minQuorum: string;
  durationMinutes: number;
  price: string;
  paymentType: "stripe" | "external_url" | "in_person" | "free";
  externalPaymentUrl: string;
  calendarId: string;
  managerId: string;
  requiresApproval: boolean;
  allowedModalities: string[];
  requiresReason: boolean;
  calEventTypeId: string;
  reminderNotes: string;
  isActive: boolean;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState<ServiceFormData>({
    name: "",
    description: "",
    serviceType: "recurring",
    eventDatesText: "",
    maxCapacity: "",
    minQuorum: "",
    durationMinutes: 60,
    price: "",
    paymentType: "stripe",
    externalPaymentUrl: "",
    calendarId: "",
    managerId: "",
    requiresApproval: false,
    allowedModalities: ["in_person"],
    requiresReason: false,
    calEventTypeId: "",
    reminderNotes: "",
    isActive: true,
  });

  const refreshData = useCallback(async () => {
    try {
      const [svcs, mgrs] = await Promise.all([
        apiFetch<Service[]>("/api/services"),
        apiFetch<User[]>("/api/services/managers/list"),
      ]);
      setServices(svcs);
      setManagers(mgrs);
    } catch {
      toast.error("Error al cargar los servicios");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<Service[]>("/api/services"),
      apiFetch<User[]>("/api/services/managers/list"),
    ])
      .then(([svcs, mgrs]) => {
        if (!active) return;
        setServices(svcs);
        setManagers(mgrs);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        toast.error("Error al cargar los servicios");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [toast]);

  function openCreate() {
    setEditingService(null);
    setForm({
      name: "",
      description: "",
      serviceType: "recurring",
      eventDatesText: "",
      maxCapacity: "",
      minQuorum: "",
      durationMinutes: 60,
      price: "",
      paymentType: "stripe",
      externalPaymentUrl: "",
      calendarId: "",
      managerId: managers[0]?.id ?? "",
      requiresApproval: false,
      allowedModalities: ["in_person"],
      requiresReason: false,
      calEventTypeId: "",
      reminderNotes: "",
      isActive: true,
    });
    setError("");
    setModalOpen(true);
  }

  function openEdit(svc: Service) {
    setEditingService(svc);
    setForm({
      name: svc.name,
      description: svc.description ?? "",
      serviceType: svc.serviceType ?? "recurring",
      eventDatesText: svc.eventDatesText ?? "",
      maxCapacity: svc.maxCapacity ? String(svc.maxCapacity) : "",
      minQuorum: svc.minQuorum ? String(svc.minQuorum) : "",
      durationMinutes: svc.durationMinutes,
      price: svc.price ?? "",
      paymentType: svc.paymentType ?? "stripe",
      externalPaymentUrl: svc.externalPaymentUrl ?? "",
      calendarId: svc.calendarId ?? "",
      managerId: svc.managerId ?? "",
      requiresApproval: Boolean(svc.requiresApproval),
      allowedModalities: svc.allowedModalities?.length ? svc.allowedModalities : ["in_person"],
      requiresReason: Boolean(svc.requiresReason),
      calEventTypeId: svc.calEventTypeId ? String(svc.calEventTypeId) : "",
      reminderNotes: svc.reminderNotes ?? "",
      isActive: svc.isActive ?? true,
    });
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("El nombre del servicio es obligatorio.");
      return;
    }
    if (form.durationMinutes <= 0) {
      setError("La duración debe ser mayor a 0 minutos.");
      return;
    }
    if (form.allowedModalities.length === 0) {
      setError("Debes seleccionar al menos una modalidad admitida (Presencial, Telefónica o Virtual).");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      serviceType: form.serviceType,
      eventDatesText: form.eventDatesText.trim() || undefined,
      maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : (editingService ? null : undefined),
      minQuorum: form.minQuorum ? Number(form.minQuorum) : undefined,
      durationMinutes: Number(form.durationMinutes),
      price: form.price.trim() || undefined,
      paymentType: form.paymentType,
      externalPaymentUrl: form.externalPaymentUrl.trim() || undefined,
      calendarId: form.calendarId.trim() || undefined,
      managerId: form.managerId || undefined,
      requiresApproval: form.requiresApproval,
      allowedModalities: form.allowedModalities,
      requiresReason: form.requiresReason,
      calEventTypeId: form.calEventTypeId.trim() ? Number(form.calEventTypeId) : undefined,
      reminderNotes: form.reminderNotes.trim() || undefined,
      isActive: form.isActive,
    };

    try {
      if (editingService) {
        await apiFetch(`/api/services/${editingService.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Servicio actualizado correctamente");
      } else {
        await apiFetch("/api/services", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Servicio creado correctamente");
      }
      setModalOpen(false);
      await refreshData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar el servicio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-neutral-900">Servicios y Calendarios</h1>
            <Badge variant="info" className="text-xs">
              {services.length} {services.length === 1 ? "servicio" : "servicios"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Define los servicios, sus calendarios asignados y los responsables de cada disciplina.
          </p>
        </div>

        {(user?.role === "admin" || user?.role === "service_manager") && (
          <Button onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Nuevo Servicio / Calendario
          </Button>
        )}
      </div>

      {/* Grid of services */}
      {loading ? (
        <div className="py-12 text-center text-sm text-neutral-400">Cargando servicios…</div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-neutral-300" />
          <h3 className="mt-3 text-base font-medium text-neutral-900">No hay servicios definidos</h3>
          <p className="mt-1 text-sm text-neutral-500">Crea los servicios y asígnalos a los responsables.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-neutral-900 text-base">{s.name}</h3>
                    {s.serviceType === "event" && (
                      <Badge variant="info" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                        Viaje / Evento puntual
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {s.isActive ? (
                      <Badge variant="success" className="text-[10px]">Activo</Badge>
                    ) : (
                      <Badge variant="danger" className="text-[10px]">Inactivo</Badge>
                    )}
                  </div>
                </div>

                {s.description && (
                  <p className="mt-2 text-xs text-neutral-600 line-clamp-2">
                    {s.description}
                  </p>
                )}

                {s.serviceType === "event" && (
                  <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50/80 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-neutral-800 flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-indigo-600" />
                        Inscritos: <strong className="text-neutral-900">{s.attendeesCount ?? 0}</strong> {s.maxCapacity ? `/ ${s.maxCapacity} plazas` : "plazas"}
                      </span>
                      {s.minQuorum && (
                        <span className={cn("text-[11px] font-medium flex items-center gap-1", s.quorumReached ? "text-emerald-700 font-semibold" : "text-amber-700")}>
                          {s.quorumReached ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Quórum alcanzado
                            </>
                          ) : (
                            `Mín. ${s.minQuorum} personas`
                          )}
                        </span>
                      )}
                    </div>
                    {s.maxCapacity && (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                        <div
                          className={cn(
                            "h-full transition-all",
                            (s.attendeesCount ?? 0) >= s.maxCapacity
                              ? "bg-red-500"
                              : s.quorumReached
                              ? "bg-emerald-500"
                              : "bg-indigo-500"
                          )}
                          style={{ width: `${Math.min(100, (((s.attendeesCount ?? 0) / s.maxCapacity) * 100))}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3 text-xs">
                  {s.serviceType === "event" && s.eventDatesText && (
                    <div className="flex items-center justify-between text-neutral-600">
                      <span className="flex items-center gap-1.5">
                        <Compass className="h-3.5 w-3.5 text-purple-600" />
                        Fechas:
                      </span>
                      <span className="font-semibold text-purple-900">{s.eventDatesText}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-neutral-400" />
                      Duración:
                    </span>
                    <span className="font-semibold text-neutral-800">{s.durationMinutes} min</span>
                  </div>

                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-neutral-400" />
                      Aforo por turno:
                    </span>
                    <span className="font-semibold text-neutral-800">
                      {s.maxCapacity && s.maxCapacity > 1 ? (
                        <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-xs font-medium border border-indigo-100">
                          👥 {s.maxCapacity} personas (Grupal)
                        </span>
                      ) : (
                        <span className="text-neutral-700 text-xs">👤 1 persona (Individual)</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-neutral-400" />
                      Precio:
                    </span>
                    <span className="font-semibold text-neutral-800">
                      {s.price ? `${s.price} €` : "No especificado"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-neutral-400" />
                      Método de cobro:
                    </span>
                    <div>
                      {s.paymentType === "external_url" ? (
                        s.externalPaymentUrl ? (
                          <a
                            href={s.externalPaymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                            title={s.externalPaymentUrl}
                          >
                            Giglon / Entradas <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-amber-600 font-medium">Enlace externo pendiente</span>
                        )
                      ) : s.paymentType === "in_person" ? (
                        <span className="text-[11px] text-neutral-600">En el local</span>
                      ) : s.paymentType === "free" ? (
                        <span className="text-[11px] text-emerald-600 font-medium">Gratuito</span>
                      ) : (
                        <span className="text-[11px] text-indigo-700 font-medium">Stripe / Bizum</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                      Calendario:
                    </span>
                    <span className="font-mono text-[11px] bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-700">
                      {s.calendarId}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                      Responsable:
                    </span>
                    <span className="font-medium text-indigo-700 truncate max-w-[150px]">
                      {s.manager?.name || "Sin asignar"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-neutral-400" />
                      Modalidades:
                    </span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {(s.allowedModalities && s.allowedModalities.length > 0
                        ? s.allowedModalities
                        : ["in_person"]
                      ).map((m) => (
                        <span
                          key={m}
                          className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 border border-indigo-100"
                        >
                          {m === "in_person"
                            ? "🏢 Presencial"
                            : m === "phone"
                            ? "📞 Telefónica"
                            : "💻 Virtual"}
                        </span>
                      ))}
                    </div>
                  </div>

                  {s.requiresReason && (
                    <div className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-800 border border-blue-200">
                      <AlertCircle className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      Requiere motivo de consulta
                    </div>
                  )}

                  {s.requiresApproval && (
                    <div className="mt-1 flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 border border-amber-200">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      Requiere aprobación previa
                    </div>
                  )}

                  {s.reminderNotes && (
                    <div className="mt-1.5 flex items-start gap-1.5 rounded bg-amber-50/80 p-1.5 text-[11px] text-amber-900 border border-amber-200/80">
                      <span className="font-semibold shrink-0">💡 Recordatorio:</span>
                      <span className="line-clamp-2">{s.reminderNotes}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-100 flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openEdit(s)}
                  className="flex items-center gap-1 text-xs"
                >
                  <Edit2 className="h-3 w-3" />
                  Editar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingService ? "Editar Servicio / Evento" : "Nuevo Servicio / Evento"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Modalidad del Servicio
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, serviceType: "recurring" }))}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors",
                  form.serviceType === "recurring"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                )}
              >
                <Calendar className="h-3.5 w-3.5" />
                Cita periódica habitual
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, serviceType: "event" }))}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors",
                  form.serviceType === "event"
                    ? "border-purple-600 bg-purple-50 text-purple-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                )}
              >
                <Compass className="h-3.5 w-3.5" />
                Viaje / Retiro / Evento
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Nombre del Servicio o Viaje <span className="text-red-500">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  name,
                  calendarId: f.calendarId || (editingService ? f.calendarId : `cal-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`),
                }));
              }}
              placeholder="ej. Retiro de Yoga y Meditación en la Sierra"
            />
          </div>

          {form.serviceType === "event" && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-purple-900">
                  Fechas del Evento / Viaje <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.eventDatesText}
                  onChange={(e) => setForm((f) => ({ ...f, eventDatesText: e.target.value }))}
                  placeholder="ej. Del 25 al 28 de Octubre de 2026"
                />
                <p className="mt-1 text-[11px] text-purple-700">
                  El agente informará de estas fechas a los clientes que pregunten por el viaje.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-purple-900">
                    Plazas Máximas (Aforo)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={form.maxCapacity}
                    onChange={(e) => setForm((f) => ({ ...f, maxCapacity: e.target.value }))}
                    placeholder="ej. 30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-purple-900">
                    Quórum Mínimo Requerido
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={form.minQuorum}
                    onChange={(e) => setForm((f) => ({ ...f, minQuorum: e.target.value }))}
                    placeholder="ej. 30"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Descripción / Condiciones
            </label>
            <textarea
              className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Indica de qué trata el servicio, detalles de la actividad o requisitos…"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-amber-900 flex items-center gap-1">
              <span>💡 Recordatorio y recomendaciones para el alumno (Email y WhatsApp)</span>
            </label>
            <textarea
              className="block w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none placeholder:text-amber-900/40"
              rows={2}
              value={form.reminderNotes}
              onChange={(e) => setForm((f) => ({ ...f, reminderNotes: e.target.value }))}
              placeholder="ej. Llevar ropa cómoda deportiva, toalla o esterilla propia y acudir 5-10 minutos antes del inicio."
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              Este recordatorio se incluirá automáticamente de forma destacada en el correo electrónico y mensaje de WhatsApp al confirmarse la cita.
            </p>
          </div>

          {form.serviceType === "recurring" ? (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-700">
                    Duración (minutos) <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    min="5"
                    step="5"
                    value={form.durationMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-700">
                    Precio (€)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="ej. 35.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-700 flex items-center gap-1">
                    <Users className="h-3 w-3 text-indigo-600" />
                    Aforo (Plazas por slot)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={form.maxCapacity}
                    onChange={(e) => setForm((f) => ({ ...f, maxCapacity: e.target.value }))}
                    placeholder="1 (individual) o 23, 30..."
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-500">
                💡 <strong>Aforo por slot:</strong> Indica cuántas personas pueden reservar el mismo horario a la vez (déjalo en <strong>1</strong> para cita individual 1 a 1, o pon <strong>23, 30...</strong> para clases de yoga o grupales).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-700">
                  Duración (minutos) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="5"
                  step="5"
                  value={form.durationMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-700">
                  Precio (€)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="ej. 35.00"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Responsable del Servicio
            </label>
            <select
              className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              value={form.managerId}
              onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}
            >
              <option value="">Sin responsable específico</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-neutral-500">
              Las citas de este servicio bloquearán la disponibilidad del responsable para todos los servicios que gestione.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Identificador de Calendario
            </label>
            <Input
              value={form.calendarId}
              onChange={(e) => setForm((f) => ({ ...f, calendarId: e.target.value }))}
              placeholder="ej. cal-yoga"
            />
          </div>

          {/* Modalidades de Cita Admitidas */}
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-indigo-950">
                Modalidades de Cita Admitidas <span className="text-red-500">*</span>
              </label>
              <p className="mb-2 text-[11px] text-indigo-700">
                Selecciona qué formatos de atención admite este servicio (el cliente o agente podrá elegir entre ellos):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-medium text-neutral-800 cursor-pointer hover:bg-indigo-50/40">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                    checked={form.allowedModalities.includes("in_person")}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((f) => ({
                        ...f,
                        allowedModalities: checked
                          ? [...f.allowedModalities, "in_person"]
                          : f.allowedModalities.filter((m) => m !== "in_person"),
                      }));
                    }}
                  />
                  <span>🏢 Presencial</span>
                </label>

                <label className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-medium text-neutral-800 cursor-pointer hover:bg-indigo-50/40">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                    checked={form.allowedModalities.includes("phone")}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((f) => ({
                        ...f,
                        allowedModalities: checked
                          ? [...f.allowedModalities, "phone"]
                          : f.allowedModalities.filter((m) => m !== "phone"),
                      }));
                    }}
                  />
                  <span>📞 Telefónica</span>
                </label>

                <label className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-medium text-neutral-800 cursor-pointer hover:bg-indigo-50/40">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                    checked={form.allowedModalities.includes("virtual")}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((f) => ({
                        ...f,
                        allowedModalities: checked
                          ? [...f.allowedModalities, "virtual"]
                          : f.allowedModalities.filter((m) => m !== "virtual"),
                      }));
                    }}
                  />
                  <span>💻 Virtual (Cal.com)</span>
                </label>
              </div>
            </div>

            {form.allowedModalities.includes("virtual") && (
              <div className="pt-1 border-t border-indigo-100">
                <label className="mb-1 block text-xs font-medium text-indigo-900">
                  ID de Tipo de Evento en Cal.com (opcional)
                </label>
                <Input
                  type="number"
                  value={form.calEventTypeId}
                  onChange={(e) => setForm((f) => ({ ...f, calEventTypeId: e.target.value }))}
                  placeholder="ej. 129482 (deja vacío para usar el predeterminado)"
                />
                <p className="mt-1 text-[11px] text-indigo-700">
                  Al agendarse una cita virtual, se sincronizará automáticamente con Cal.com usando el correo del responsable y se generará el enlace de la sala virtual.
                </p>
              </div>
            )}
          </div>

          {/* Motivo de la Cita */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
            <label className="flex items-start gap-2 text-xs font-medium text-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                checked={form.requiresReason}
                onChange={(e) => setForm((f) => ({ ...f, requiresReason: e.target.checked }))}
              />
              <div>
                <span className="font-semibold text-neutral-900">Exigir motivo / razón de la consulta</span>
                <p className="text-[11px] font-normal text-neutral-500 mt-0.5">
                  El agente de WhatsApp solicitará al cliente que detalle la razón o motivación de su consulta antes de reservar.
                </p>
              </div>
            </label>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Forma de Cobro / Venta de Entradas
              </label>
              <select
                className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                value={form.paymentType}
                onChange={(e) => setForm((f) => ({ ...f, paymentType: e.target.value as any }))}
              >
                <option value="stripe">Stripe Automático (Tarjetas, Bizum, Apple/Google Pay)</option>
                <option value="external_url">Enlace externo (Giglon, Eventbrite, web de entradas...)</option>
                <option value="in_person">Pago presencial en el local</option>
                <option value="free">Gratuito / Sin cobro</option>
              </select>
            </div>

            {form.paymentType === "external_url" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-700">
                  URL de venta de entradas / Giglon <span className="text-red-500">*</span>
                </label>
                <Input
                  type="url"
                  value={form.externalPaymentUrl}
                  onChange={(e) => setForm((f) => ({ ...f, externalPaymentUrl: e.target.value }))}
                  placeholder="https://www.giglon.com/todos?idEvent=cantar-del-alma"
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  El agente de WhatsApp enviará este enlace directamente al cliente para adquirir sus entradas.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                checked={form.requiresApproval}
                onChange={(e) => setForm((f) => ({ ...f, requiresApproval: e.target.checked }))}
              />
              <span>Requiere aprobación previa del responsable antes de confirmarse</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <span>Servicio activo y disponible para reservas</span>
            </label>
          </div>

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar Servicio"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
