"use client";

import { useEffect, useState, useCallback, useId } from "react";
import Link from "next/link";
import {
  CreditCard,
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  Banknote,
  Smartphone,
  Building2,
  ExternalLink,
  RefreshCw,
  X,
  User,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface AppointmentPayment {
  id: string;
  service: string;
  serviceId?: string | null;
  startsAt: string;
  endsAt?: string;
  status: string;
  modality: string;
  price?: string | null;
  paymentStatus: "unpaid" | "pending" | "paid" | "refunded" | "exempt";
  paymentMethod?: string | null;
  paidAmount?: string | null;
  paidAt?: string | null;
  paymentNotes?: string | null;
  paymentRecordedBy?: string | null;
  contact?: Contact | null;
}

interface ServiceItem {
  id: string;
  name: string;
}

interface PaymentsSummary {
  totalCount: number;
  paidCount: number;
  pendingCount: number;
  totalPaidAmount: number;
  totalPendingAmount: number;
}

export default function PaymentsPage() {
  const toast = useToast();
  const { user } = useAuth();

  // Filter States
  const [datePreset, setDatePreset] = useState<"today" | "week" | "month" | "next30" | "all">("month");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedService, setSelectedService] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [payments, setPayments] = useState<AppointmentPayment[]>([]);
  const [summary, setSummary] = useState<PaymentsSummary>({
    totalCount: 0,
    paidCount: 0,
    pendingCount: 0,
    totalPaidAmount: 0,
    totalPendingAmount: 0,
  });

  // Modal State for Manual Payment Update
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentPayment | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [savingPayment, setSavingPayment] = useState<boolean>(false);

  // Modal Form Fields
  const [formStatus, setFormStatus] = useState<"paid" | "pending" | "unpaid" | "exempt" | "refunded">("paid");
  const [formMethod, setFormMethod] = useState<string>("cash");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formPaidAt, setFormPaidAt] = useState<string>("");
  const [formRecordedBy, setFormRecordedBy] = useState<string>("Salvadora Conesa");
  const [formNotes, setFormNotes] = useState<string>("");

  // Unique accessible IDs for select and input elements
  const filterServiceId = useId();
  const filterMethodId = useId();
  const formStatusId = useId();
  const formMethodId = useId();
  const formAmountId = useId();
  const formPaidAtId = useId();
  const formRecordedById = useId();
  const formNotesId = useId();

  // Calculate default dates based on preset
  const applyPreset = useCallback((preset: "today" | "week" | "month" | "next30" | "all") => {
    setDatePreset(preset);
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === "today") {
      const todayStr = formatDate(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(now.setDate(diff));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setStartDate(formatDate(monday));
      setEndDate(formatDate(sunday));
    } else if (preset === "month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(lastDay));
    } else if (preset === "next30") {
      const future = new Date();
      future.setDate(now.getDate() + 30);
      setStartDate(formatDate(now));
      setEndDate(formatDate(future));
    } else {
      setStartDate("");
      setEndDate("");
    }
  }, []);

  // Set initial dates (current month)
  useEffect(() => {
    applyPreset("month");
  }, [applyPreset]);

  // Load active services for dropdown
  useEffect(() => {
    apiFetch<ServiceItem[]>("/api/services")
      .then((data) => setServices(data || []))
      .catch(() => setServices([]));
  }, []);

  // Fetch payments list and totals
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (selectedService && selectedService !== "all") params.append("service", selectedService);
      if (paymentStatusFilter && paymentStatusFilter !== "all") params.append("paymentStatus", paymentStatusFilter);
      if (paymentMethodFilter && paymentMethodFilter !== "all") params.append("paymentMethod", paymentMethodFilter);
      if (searchTerm.trim()) params.append("search", searchTerm.trim());

      const data = await apiFetch<{ items: AppointmentPayment[]; summary: PaymentsSummary }>(
        `/api/appointments/payments?${params.toString()}`
      );
      setPayments(data.items || []);
      setSummary(
        data.summary || {
          totalCount: 0,
          paidCount: 0,
          pendingCount: 0,
          totalPaidAmount: 0,
          totalPendingAmount: 0,
        }
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al cargar los pagos.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedService, paymentStatusFilter, paymentMethodFilter, searchTerm, toast]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Open Modal to Edit/Record Payment
  const handleOpenPaymentModal = (appt: AppointmentPayment) => {
    setSelectedAppointment(appt);
    setFormStatus(appt.paymentStatus === "paid" ? "paid" : "paid");
    setFormMethod(appt.paymentMethod || "cash");
    setFormAmount(appt.paidAmount || appt.price || "0");
    
    // Format local datetime for input
    const dateToUse = appt.paidAt ? new Date(appt.paidAt) : new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const localIso = `${dateToUse.getFullYear()}-${pad(dateToUse.getMonth() + 1)}-${pad(dateToUse.getDate())}T${pad(dateToUse.getHours())}:${pad(dateToUse.getMinutes())}`;
    setFormPaidAt(localIso);

    setFormRecordedBy(appt.paymentRecordedBy || user?.name || "Salvadora Conesa");
    setFormNotes(appt.paymentNotes || "");
    setModalOpen(true);
  };

  // Save Payment via PUT endpoint
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;

    setSavingPayment(true);
    try {
      await apiFetch(`/api/appointments/${selectedAppointment.id}/payment`, {
        method: "PUT",
        body: JSON.stringify({
          paymentStatus: formStatus,
          paymentMethod: formMethod,
          paidAmount: formAmount,
          paidAt: formPaidAt ? new Date(formPaidAt).toISOString() : new Date().toISOString(),
          paymentRecordedBy: formRecordedBy.trim() || "Salvadora Conesa",
          paymentNotes: formNotes.trim() || undefined,
        }),
      });

      toast.success("Pago de la cita actualizado correctamente.");
      setModalOpen(false);
      fetchPayments();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar el pago.");
    } finally {
      setSavingPayment(false);
    }
  };

  // Quick 1-Click Action: Mark as Paid in Cash today by Salvadora Conesa
  const handleQuickCashPayment = async (appt: AppointmentPayment) => {
    try {
      const priceToUse = appt.paidAmount || appt.price || "0";
      await apiFetch(`/api/appointments/${appt.id}/payment`, {
        method: "PUT",
        body: JSON.stringify({
          paymentStatus: "paid",
          paymentMethod: "cash",
          paidAmount: priceToUse,
          paidAt: new Date().toISOString(),
          paymentRecordedBy: user?.name || "Salvadora Conesa",
          paymentNotes: "Cobrado en mano en la oficina de la escuela",
        }),
      });
      toast.success(`Cita de ${appt.contact?.name || "alumno"} marcada como PAGADA en efectivo.`);
      fetchPayments();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al registrar el cobro.");
    }
  };

  // Format Helpers
  const formatDateTime = (iso: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getMethodBadge = (method?: string | null) => {
    switch (method) {
      case "cash":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            <Banknote className="w-3 h-3" /> Efectivo (en mano)
          </span>
        );
      case "bizum":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800">
            <Smartphone className="w-3 h-3" /> Bizum
          </span>
        );
      case "card_in_person":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
            <CreditCard className="w-3 h-3" /> Tarjeta (TPV centro)
          </span>
        );
      case "stripe":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800">
            <ExternalLink className="w-3 h-3" /> Stripe Online
          </span>
        );
      case "transfer":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <Building2 className="w-3 h-3" /> Transferencia
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600">
            Sin método
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Pagado
          </span>
        );
      case "exempt":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
            Exento / Prueba
          </span>
        );
      case "refunded":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Reembolsado
          </span>
        );
      case "pending":
      case "unpaid":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-500" /> Pendiente de pago
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-[#800020]" />
            Pagos y Cobros de Citas
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Gestión de pagos de alumnos: cobros en mano en la oficina por Salvadora Conesa (efectivo, Bizum, TPV) y pagos online por Stripe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => fetchPayments()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* ─── Metric Summary Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Cobrado */}
        <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Total Cobrado</span>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-700">
              {summary.totalPaidAmount.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €
            </span>
            <span className="text-xs font-medium text-emerald-600">
              ({summary.paidCount} {summary.paidCount === 1 ? "cita cobrada" : "citas cobradas"})
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-400">Importe confirmado en el periodo seleccionado</p>
        </div>

        {/* Pendiente de Cobro */}
        <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Pendiente de Cobro</span>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-amber-700">
              {summary.totalPendingAmount.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €
            </span>
            <span className="text-xs font-medium text-amber-600">
              ({summary.pendingCount} {summary.pendingCount === 1 ? "cita pendiente" : "citas pendientes"})
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-400">Cobros pendientes de formalizar en oficina o Stripe</p>
        </div>

        {/* Total Citas Seleccionadas */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Citas Filtradas</span>
            <div className="p-2 bg-neutral-100 rounded-lg text-neutral-600">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-neutral-800">{summary.totalCount}</span>
            <span className="text-xs font-medium text-neutral-500">citas en el periodo</span>
          </div>
          <p className="mt-1 text-xs text-neutral-400">Total de reservas consultadas</p>
        </div>
      </div>

      {/* ─── Filters Bar ─── */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm space-y-4">
        {/* Presets & Date Range */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-neutral-500 font-medium mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Periodo:
            </span>
            {(
              [
                { key: "today", label: "Hoy" },
                { key: "week", label: "Esta semana" },
                { key: "month", label: "Este mes" },
                { key: "next30", label: "Próximos 30 días" },
                { key: "all", label: "Todo el histórico" },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  datePreset === p.key
                    ? "bg-[#800020] text-white shadow-xs"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset("all");
                }}
                className="px-2.5 py-1 border border-neutral-200 rounded-md text-xs bg-white text-neutral-800"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset("all");
                }}
                className="px-2.5 py-1 border border-neutral-200 rounded-md text-xs bg-white text-neutral-800"
              />
            </div>
          </div>
        </div>

        {/* Dropdowns & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Service Dropdown */}
          <div>
            <label htmlFor={filterServiceId} className="block text-neutral-500 font-medium mb-1">Servicio / Actividad</label>
            <select
              id={filterServiceId}
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-white text-neutral-800 focus:outline-none focus:border-[#800020]"
            >
              <option value="all">Todos los servicios</option>
              {services.map((svc) => (
                <option key={svc.id} value={svc.name}>
                  {svc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <span className="block text-neutral-500 font-medium mb-1">Estado de Pago</span>
            <div className="flex items-center border border-neutral-200 rounded-lg p-0.5 bg-neutral-50">
              {(
                [
                  { key: "all", label: "Todos" },
                  { key: "pending", label: "Pendientes" },
                  { key: "paid", label: "Pagados" },
                ] as const
              ).map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setPaymentStatusFilter(st.key)}
                  className={`flex-1 py-1.5 text-center font-medium rounded-md transition ${
                    paymentStatusFilter === st.key
                      ? "bg-white text-neutral-900 shadow-xs font-semibold"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method Filter */}
          <div>
            <label htmlFor={filterMethodId} className="block text-neutral-500 font-medium mb-1">Método de Pago</label>
            <select
              id={filterMethodId}
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-white text-neutral-800 focus:outline-none focus:border-[#800020]"
            >
              <option value="all">Todos los métodos</option>
              <option value="cash">Efectivo (en mano en escuela)</option>
              <option value="bizum">Bizum</option>
              <option value="card_in_person">Tarjeta en recepción (TPV)</option>
              <option value="stripe">Stripe Online</option>
              <option value="transfer">Transferencia bancaria</option>
              <option value="other">Otro</option>
            </select>
          </div>

          {/* Search Input */}
          <div>
            <label htmlFor="search-input" className="block text-neutral-500 font-medium mb-1">Buscar Alumno / Teléfono</label>
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
              <input
                id="search-input"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nombre, teléfono o email..."
                className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg bg-white text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-[#800020]"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Table of Appointments / Payments ─── */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-neutral-800">Listado de Citas y Cobros</span>
            <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full font-medium">
              {payments.length}
            </span>
          </div>
          <span className="text-xs text-neutral-400">
            Se puede actualizar manualmente el cobro de cualquier cita en cualquier momento
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400 text-sm flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#800020]" />
            Cargando citas y registros de cobro...
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 text-sm">
            No se han encontrado citas con los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50/80 text-neutral-500 font-semibold border-b border-neutral-200">
                  <th className="py-3 px-4">Alumno / Contacto</th>
                  <th className="py-3 px-4">Servicio & Fecha Cita</th>
                  <th className="py-3 px-4">Importe</th>
                  <th className="py-3 px-4">Estado de Pago</th>
                  <th className="py-3 px-4">Método & Fecha Cobro</th>
                  <th className="py-3 px-4">Registrado por / Notas</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-700">
                {payments.map((appt) => {
                  const isPaid = appt.paymentStatus === "paid";
                  const priceDisplay = appt.paidAmount || appt.price || "0.00";

                  return (
                    <tr key={appt.id} className="hover:bg-neutral-50/70 transition">
                      {/* Alumno */}
                      <td className="py-3.5 px-4 font-medium text-neutral-900">
                        {appt.contact ? (
                          <Link
                            href={`/contacts/${appt.contact.id}`}
                            className="text-[#800020] hover:underline font-semibold flex items-center gap-1"
                          >
                            <User className="w-3.5 h-3.5" />
                            {appt.contact.name || "Sin nombre"}
                          </Link>
                        ) : (
                          <span className="text-neutral-400">Alumno anónimo</span>
                        )}
                        {appt.contact?.phone && (
                          <span className="block text-[11px] text-neutral-500 font-mono mt-0.5">
                            {appt.contact.phone}
                          </span>
                        )}
                      </td>

                      {/* Servicio y Fecha Cita */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-neutral-900 block">{appt.service}</span>
                        <span className="text-[11px] text-neutral-500 block mt-0.5">
                          📅 {formatDateTime(appt.startsAt)}
                        </span>
                      </td>

                      {/* Importe */}
                      <td className="py-3.5 px-4 font-bold text-neutral-900">
                        {parseFloat(priceDisplay).toFixed(2)} €
                      </td>

                      {/* Estado */}
                      <td className="py-3.5 px-4">{getStatusBadge(appt.paymentStatus)}</td>

                      {/* Método y Fecha Cobro */}
                      <td className="py-3.5 px-4">
                        {getMethodBadge(appt.paymentMethod)}
                        {appt.paidAt && (
                          <span className="block text-[10px] text-neutral-400 mt-1">
                            Cobrado: {formatDateTime(appt.paidAt)}
                          </span>
                        )}
                      </td>

                      {/* Registrado por y Notas */}
                      <td className="py-3.5 px-4 max-w-xs truncate text-[11px] text-neutral-500">
                        {appt.paymentRecordedBy && (
                          <span className="font-medium text-neutral-700 block">
                            👤 {appt.paymentRecordedBy}
                          </span>
                        )}
                        {appt.paymentNotes ? (
                          <span className="italic text-neutral-500 block truncate" title={appt.paymentNotes}>
                            📝 {appt.paymentNotes}
                          </span>
                        ) : (
                          <span className="text-neutral-400 text-[10px]">-</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isPaid && (
                            <button
                              onClick={() => handleQuickCashPayment(appt)}
                              title="Marcar como cobrado en mano en efectivo hoy"
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shadow-xs transition flex items-center gap-1"
                            >
                              <Banknote className="w-3.5 h-3.5" /> Cobrado en efectivo
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenPaymentModal(appt)}
                            className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-md text-xs font-medium transition"
                          >
                            {isPaid ? "Modificar pago" : "Gestionar pago"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Modal: Manual Payment Update ─── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Gestionar Cobro de Cita"
      >
        {selectedAppointment && (
          <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
            {/* Appointment Header Info */}
            <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold text-neutral-900 block">
                    {selectedAppointment.service}
                  </span>
                  <span className="text-xs text-neutral-600 block mt-0.5">
                    Alumno: <strong>{selectedAppointment.contact?.name || "Sin nombre"}</strong>
                    {selectedAppointment.contact?.phone && ` (${selectedAppointment.contact.phone})`}
                  </span>
                  <span className="text-xs text-neutral-500 block mt-0.5">
                    Fecha de la cita: {formatDateTime(selectedAppointment.startsAt)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-neutral-400 block">Precio oficial:</span>
                  <span className="text-sm font-extrabold text-[#800020]">
                    {selectedAppointment.price ? `${parseFloat(selectedAppointment.price).toFixed(2)} €` : "0.00 €"}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Status */}
            <div>
              <label htmlFor={formStatusId} className="block font-semibold text-neutral-800 mb-1">Estado del Pago</label>
              <select
                id={formStatusId}
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#800020]"
              >
                <option value="paid">✅ Pagado / Cobrado</option>
                <option value="pending">⏳ Pendiente de pago</option>
                <option value="exempt">🎁 Exento / Clase de prueba gratuita</option>
                <option value="refunded">↩️ Reembolsado</option>
              </select>
            </div>

            {/* Payment Method */}
            <div>
              <label htmlFor={formMethodId} className="block font-semibold text-neutral-800 mb-1">Método de Pago</label>
              <select
                id={formMethodId}
                value={formMethod}
                onChange={(e) => setFormMethod(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#800020]"
              >
                <option value="cash">💵 Efectivo (cobrado en mano en la escuela)</option>
                <option value="bizum">📱 Bizum</option>
                <option value="card_in_person">💳 Tarjeta / TPV en recepción</option>
                <option value="stripe">🌐 Stripe (pago online con tarjeta / link)</option>
                <option value="transfer">🏦 Transferencia bancaria</option>
                <option value="other">⚙️ Otro</option>
              </select>
            </div>

            {/* Amount & Date Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={formAmountId} className="block font-semibold text-neutral-800 mb-1">Importe Cobrado (€)</label>
                <Input
                  id={formAmountId}
                  type="number"
                  step="0.01"
                  min="0"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor={formPaidAtId} className="block font-semibold text-neutral-800 mb-1">Fecha y Hora del Cobro</label>
                <Input
                  id={formPaidAtId}
                  type="datetime-local"
                  value={formPaidAt}
                  onChange={(e) => setFormPaidAt(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Recorded By */}
            <div>
              <label htmlFor={formRecordedById} className="block font-semibold text-neutral-800 mb-1">Cobrado / Registrado por</label>
              <Input
                id={formRecordedById}
                type="text"
                value={formRecordedBy}
                onChange={(e) => setFormRecordedBy(e.target.value)}
                placeholder="Salvadora Conesa"
                className="w-full"
              />
            </div>

            {/* Payment Notes */}
            <div>
              <label htmlFor={formNotesId} className="block font-semibold text-neutral-800 mb-1">Observaciones / Notas de Cobro</label>
              <textarea
                id={formNotesId}
                rows={2}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Ejemplo: Pagado mes completo en mano en recepción..."
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#800020]"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingPayment}>
                {savingPayment ? "Guardando cobro…" : "Guardar Cobro"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
