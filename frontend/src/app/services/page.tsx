"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { Plus, Edit2, Sparkles, Calendar, UserCheck, Clock, Tag, AlertCircle, ExternalLink, CreditCard, Compass, Users, CheckCircle2, Trash2, FolderTree, Image as ImageIcon, Layers, AlertTriangle, Copy, Video } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Service, ServiceCategory, User } from "@/lib/types";
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
  scheduleText: string;
  maxCapacity: string;
  minQuorum: string;
  durationMinutes: number;
  price: string;
  paymentType: "stripe" | "external_url" | "in_person" | "free";
  externalPaymentUrl: string;
  calendarId: string;
  managerId: string;
  categoryId: string;
  flyerPath: string;
  flyerUrl: string;
  flyerParticularPath: string;
  flyerParticularUrl: string;
  videoParticularPath: string;
  videoParticularUrl: string;
  fechaDesde: string;
  fechaHasta: string;
  requiresApproval: boolean;
  allowedModalities: string[];
  requiresReason: boolean;
  calEventTypeId: string;
  reminderNotes: string;
  displayOrder: number;
  isActive: boolean;
  notifyByEmail: boolean;
  notifyByWhatsapp: boolean;
  notifyBySms: boolean;
  reminderWhatsapp: boolean;
  reminderEmail: boolean;
  reminderVoice: boolean;
  reminderSms: boolean;
  reminderHoursEnabled: boolean;
  reminderHours: number | string;
  reminderMinutesEnabled: boolean;
  reminderMinutes: number | string;
  sinfechadefinitiva: string;
  textosinfechadefinitiva: string;
  sinpreciodefinitivo: string;
  textosinpreciodefinitivo: string;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncingVapi, setSyncingVapi] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  async function handleSyncVapi() {
    setSyncingVapi(true);
    try {
      await apiFetch<{ assistantId: string }>("/api/vapi/publish", {
        method: "POST",
      });
      toast.success("Asistente VAPI y catálogo telefónico sincronizados correctamente.");
    } catch (err: any) {
      toast.error(err?.message || "Error al sincronizar el asistente con VAPI.");
    } finally {
      setSyncingVapi(false);
    }
  }

  const [form, setForm] = useState<ServiceFormData>({
    name: "",
    description: "",
    serviceType: "recurring",
    eventDatesText: "",
    scheduleText: "",
    maxCapacity: "",
    minQuorum: "",
    durationMinutes: 60,
    price: "",
    paymentType: "stripe",
    externalPaymentUrl: "",
    calendarId: "",
    managerId: "",
    categoryId: "",
    flyerPath: "",
    flyerUrl: "",
    flyerParticularPath: "",
    flyerParticularUrl: "",
    videoParticularPath: "",
    videoParticularUrl: "",
    fechaDesde: "2000-01-01",
    fechaHasta: "2099-12-31",
    requiresApproval: false,
    allowedModalities: ["in_person"],
    requiresReason: false,
    calEventTypeId: "",
    reminderNotes: "",
    displayOrder: 0,
    isActive: true,
    notifyByEmail: true,
    notifyByWhatsapp: true,
    notifyBySms: false,
    reminderWhatsapp: true,
    reminderEmail: true,
    reminderVoice: false,
    reminderSms: false,
    reminderHoursEnabled: true,
    reminderHours: 24,
    reminderMinutesEnabled: true,
    reminderMinutes: 120,
    sinfechadefinitiva: "N",
    textosinfechadefinitiva: "",
    sinpreciodefinitivo: "N",
    textosinpreciodefinitivo: "",
  });

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    code: "",
    name: "",
    description: "",
    displayOrder: 0,
    isActive: true,
  });
  const [categoryError, setCategoryError] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  // Filters state
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");

  // Selection and bulk delete state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);

  // Delete single service confirmation state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [deletingService, setDeletingService] = useState(false);

  const refreshData = useCallback(async () => {
    try {
      const [svcs, mgrs, cats] = await Promise.all([
        apiFetch<Service[]>("/api/services"),
        apiFetch<User[]>("/api/services/managers/list"),
        apiFetch<ServiceCategory[]>("/api/categories"),
      ]);
      setServices(svcs);
      setManagers(mgrs);
      setCategories(cats);
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
      apiFetch<ServiceCategory[]>("/api/categories"),
    ])
      .then(([svcs, mgrs, cats]) => {
        if (!active) return;
        setServices(svcs);
        setManagers(mgrs);
        setCategories(cats);
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
      scheduleText: "",
      maxCapacity: "",
      minQuorum: "",
      durationMinutes: 60,
      price: "",
      paymentType: "stripe",
      externalPaymentUrl: "",
      calendarId: "",
      managerId: managers[0]?.id ?? "",
      categoryId: categories[0]?.id ?? "",
      flyerPath: "",
      flyerUrl: "",
      flyerParticularPath: "",
      flyerParticularUrl: "",
      videoParticularPath: "",
      videoParticularUrl: "",
      fechaDesde: "2000-01-01",
      fechaHasta: "2099-12-31",
      requiresApproval: false,
      allowedModalities: ["in_person"],
      requiresReason: false,
      calEventTypeId: "",
      reminderNotes: "",
      displayOrder: (services.length + 1) * 10,
      isActive: true,
      notifyByEmail: true,
      notifyByWhatsapp: true,
      notifyBySms: false,
      reminderWhatsapp: true,
      reminderEmail: true,
      reminderVoice: false,
      reminderSms: false,
      reminderHoursEnabled: true,
      reminderHours: 24,
      reminderMinutesEnabled: true,
      reminderMinutes: 120,
      sinfechadefinitiva: "N",
      textosinfechadefinitiva: "",
      sinpreciodefinitivo: "N",
      textosinpreciodefinitivo: "",
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
      scheduleText: svc.scheduleText ?? "",
      maxCapacity: svc.maxCapacity ? String(svc.maxCapacity) : "",
      minQuorum: svc.minQuorum ? String(svc.minQuorum) : "",
      durationMinutes: svc.durationMinutes,
      price: svc.price ?? "",
      paymentType: svc.paymentType ?? "stripe",
      externalPaymentUrl: svc.externalPaymentUrl ?? "",
      calendarId: svc.calendarId ?? "",
      managerId: svc.managerId ?? "",
      categoryId: svc.categoryId ?? "",
      flyerPath: svc.flyerPath ?? "",
      flyerUrl: svc.flyerUrl ?? "",
      flyerParticularPath: svc.flyerParticularPath ?? "",
      flyerParticularUrl: svc.flyerParticularUrl ?? "",
      videoParticularPath: svc.videoParticularPath ?? "",
      videoParticularUrl: svc.videoParticularUrl ?? "",
      fechaDesde: svc.fechaDesde ? svc.fechaDesde.slice(0, 10) : "2000-01-01",
      fechaHasta: svc.fechaHasta ? svc.fechaHasta.slice(0, 10) : "2099-12-31",
      requiresApproval: Boolean(svc.requiresApproval),
      allowedModalities: svc.allowedModalities?.length ? svc.allowedModalities : ["in_person"],
      requiresReason: Boolean(svc.requiresReason),
      calEventTypeId: svc.calEventTypeId ? String(svc.calEventTypeId) : "",
      reminderNotes: svc.reminderNotes ?? "",
      displayOrder: svc.displayOrder ?? 0,
      isActive: svc.isActive ?? true,
      notifyByEmail: svc.notifyByEmail !== false,
      notifyByWhatsapp: svc.notifyByWhatsapp !== false,
      notifyBySms: Boolean(svc.notifyBySms),
      reminderWhatsapp: svc.reminderWhatsapp !== false,
      reminderEmail: svc.reminderEmail !== false,
      reminderVoice: Boolean(svc.reminderVoice),
      reminderSms: Boolean(svc.reminderSms),
      reminderHoursEnabled: svc.reminderHoursEnabled !== false,
      reminderHours: svc.reminderHours ?? 24,
      reminderMinutesEnabled: svc.reminderMinutesEnabled !== false,
      reminderMinutes: svc.reminderMinutes ?? 120,
      sinfechadefinitiva: svc.sinfechadefinitiva ?? "N",
      textosinfechadefinitiva: svc.textosinfechadefinitiva ?? "",
      sinpreciodefinitivo: svc.sinpreciodefinitivo ?? "N",
      textosinpreciodefinitivo: svc.textosinpreciodefinitivo ?? "",
    });
    setError("");
    setModalOpen(true);
  }

  function openCategoriesManager() {
    setCategoryModalOpen(true);
    setEditingCategory(null);
    setCategoryForm({
      code: "",
      name: "",
      description: "",
      displayOrder: (categories.length + 1) * 10,
      isActive: true,
    });
    setCategoryError("");
  }

  function startEditCategory(cat: ServiceCategory) {
    setEditingCategory(cat);
    setCategoryForm({
      code: cat.code,
      name: cat.name,
      description: cat.description || "",
      displayOrder: cat.displayOrder,
      isActive: cat.isActive,
    });
    setCategoryError("");
  }

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryForm.code.trim() || !categoryForm.name.trim()) {
      setCategoryError("El código y nombre de categoría son obligatorios.");
      return;
    }
    setSavingCategory(true);
    setCategoryError("");
    try {
      if (editingCategory) {
        await apiFetch(`/api/categories/${editingCategory.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            code: categoryForm.code.trim().toLowerCase(),
            name: categoryForm.name.trim(),
            description: categoryForm.description.trim() || undefined,
            displayOrder: Number(categoryForm.displayOrder) || 0,
            isActive: categoryForm.isActive,
          }),
        });
        toast.success("Categoría actualizada");
      } else {
        await apiFetch("/api/categories", {
          method: "POST",
          body: JSON.stringify({
            code: categoryForm.code.trim().toLowerCase(),
            name: categoryForm.name.trim(),
            description: categoryForm.description.trim() || undefined,
            displayOrder: Number(categoryForm.displayOrder) || 0,
            isActive: categoryForm.isActive,
          }),
        });
        toast.success("Categoría creada");
      }
      setEditingCategory(null);
      setCategoryForm({
        code: "",
        name: "",
        description: "",
        displayOrder: 0,
        isActive: true,
      });
      await refreshData();
    } catch (err) {
      setCategoryError(err instanceof ApiError ? err.message : "Error al guardar la categoría");
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm("¿Eliminar esta categoría? Los servicios asociados quedarán sin categoría.")) return;
    try {
      await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
      toast.success("Categoría eliminada");
      if (editingCategory?.id === id) {
        setEditingCategory(null);
      }
      await refreshData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al eliminar categoría");
    }
  }

  function confirmDeleteService(svc: Service) {
    setServiceToDelete(svc);
    setDeleteModalOpen(true);
  }

  async function handleDeleteService() {
    if (!serviceToDelete?.id) return;
    setDeletingService(true);
    try {
      await apiFetch(`/api/services/${serviceToDelete.id}`, { method: "DELETE" });
      apiFetch("/api/vapi/publish", { method: "POST" }).catch(() => null);
      toast.success(`Servicio "${serviceToDelete.name}" eliminado correctamente.`);
      setDeleteModalOpen(false);
      setServiceToDelete(null);
      setSelectedIds((prev) => prev.filter((id) => id !== serviceToDelete.id));
      await refreshData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al eliminar el servicio");
    } finally {
      setDeletingService(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    setDeletingBulk(true);
    try {
      const res = await apiFetch<{ deletedCount: number }>("/api/services/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds }),
      });
      apiFetch("/api/vapi/publish", { method: "POST" }).catch(() => null);
      toast.success(`Se han eliminado ${res.deletedCount || selectedIds.length} servicios correctamente.`);
      setSelectedIds([]);
      setBulkDeleteModalOpen(false);
      await refreshData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al eliminar servicios seleccionados");
    } finally {
      setDeletingBulk(false);
    }
  }

  async function handleDuplicate(svc: Service) {
    if (!svc.id) return;
    setDuplicatingId(svc.id);
    try {
      const duplicated = await apiFetch<Service>(`/api/services/${svc.id}/duplicate`, {
        method: "POST",
      });
      toast.success(`Servicio "${duplicated.name}" duplicado con éxito.`);
      await refreshData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error al duplicar el servicio");
    } finally {
      setDuplicatingId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === filteredServices.length && filteredServices.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(
        filteredServices
          .map((s) => s.id)
          .filter((id): id is string => Boolean(id))
      );
    }
  }

  const filteredServices = services.filter((s) => {
    if (selectedCategoryFilter !== "all") {
      if (selectedCategoryFilter === "none" && s.categoryId) return false;
      if (selectedCategoryFilter !== "none" && s.categoryId !== selectedCategoryFilter) return false;
    }
    if (selectedTypeFilter !== "all" && s.serviceType !== selectedTypeFilter) return false;
    return true;
  });

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [categories]);

  const groupedCategories = useMemo(() => {
    const groups: { category: ServiceCategory | null; services: Service[] }[] = [];

    if (selectedCategoryFilter !== "all" && selectedCategoryFilter !== "none") {
      const cat = sortedCategories.find((c) => c.id === selectedCategoryFilter);
      if (cat) {
        const catServices = filteredServices
          .filter((s) => s.categoryId === cat.id)
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
        groups.push({ category: cat, services: catServices });
      }
      return groups;
    }

    if (selectedCategoryFilter === "none") {
      const uncategorized = filteredServices
        .filter((s) => !s.categoryId)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      if (uncategorized.length > 0) {
        groups.push({ category: null, services: uncategorized });
      }
      return groups;
    }

    // All categories in order of displayOrder
    for (const cat of sortedCategories) {
      const catServices = filteredServices
        .filter((s) => s.categoryId === cat.id)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      if (catServices.length > 0) {
        groups.push({ category: cat, services: catServices });
      }
    }

    // Plus uncategorized services at the end
    const uncategorized = filteredServices
      .filter((s) => !s.categoryId)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    if (uncategorized.length > 0) {
      groups.push({ category: null, services: uncategorized });
    }

    return groups;
  }, [sortedCategories, filteredServices, selectedCategoryFilter]);

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
      scheduleText: form.scheduleText.trim() || undefined,
      maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : (editingService ? null : undefined),
      minQuorum: form.minQuorum ? Number(form.minQuorum) : undefined,
      durationMinutes: Number(form.durationMinutes),
      price: form.price.trim() || undefined,
      paymentType: form.paymentType,
      externalPaymentUrl: form.externalPaymentUrl.trim() || undefined,
      calendarId: form.calendarId.trim() || undefined,
      managerId: form.managerId || undefined,
      categoryId: form.categoryId || undefined,
      flyerPath: form.flyerPath.trim() || undefined,
      flyerUrl: form.flyerUrl.trim() || undefined,
      flyerParticularPath: form.flyerParticularPath.trim() || undefined,
      flyerParticularUrl: form.flyerParticularUrl.trim() || undefined,
      videoParticularPath: form.videoParticularPath.trim() || undefined,
      videoParticularUrl: form.videoParticularUrl.trim() || undefined,
      fechaDesde: form.fechaDesde.trim() || "2000-01-01",
      fechaHasta: form.fechaHasta.trim() || "2099-12-31",
      requiresApproval: form.requiresApproval,
      allowedModalities: form.allowedModalities,
      requiresReason: form.requiresReason,
      calEventTypeId: form.calEventTypeId.trim() ? Number(form.calEventTypeId) : undefined,
      reminderNotes: form.reminderNotes.trim() || undefined,
      displayOrder: Number(form.displayOrder) || 0,
      isActive: form.isActive,
      notifyByEmail: form.notifyByEmail,
      notifyByWhatsapp: form.notifyByWhatsapp,
      notifyBySms: form.notifyBySms,
      reminderWhatsapp: form.reminderWhatsapp,
      reminderEmail: form.reminderEmail,
      reminderVoice: form.reminderVoice,
      reminderSms: form.reminderSms,
      reminderHoursEnabled: form.reminderHoursEnabled,
      reminderHours: Number(form.reminderHours) || 24,
      reminderMinutesEnabled: form.reminderMinutesEnabled,
      reminderMinutes: Number(form.reminderMinutes) || 120,
      sinfechadefinitiva: form.sinfechadefinitiva,
      textosinfechadefinitiva: form.textosinfechadefinitiva.trim() || undefined,
      sinpreciodefinitivo: form.sinpreciodefinitivo,
      textosinpreciodefinitivo: form.textosinpreciodefinitivo.trim() || undefined,
    };

    try {
      if (editingService) {
        await apiFetch(`/api/services/${editingService.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        apiFetch("/api/vapi/publish", { method: "POST" }).catch(() => null);
        toast.success("Servicio actualizado correctamente");
      } else {
        await apiFetch("/api/services", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        apiFetch("/api/vapi/publish", { method: "POST" }).catch(() => null);
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
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleSyncVapi}
              disabled={syncingVapi}
              className="flex items-center gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
              title="Sincroniza el catálogo de servicios en vivo con el asistente de voz telefónico VAPI"
            >
              <Sparkles className={cn("h-4 w-4 text-purple-600", syncingVapi && "animate-spin")} />
              {syncingVapi ? "Sincronizando..." : "Sincronizar VAPI"}
            </Button>
            <Button
              variant="secondary"
              onClick={openCategoriesManager}
              className="flex items-center gap-1.5"
            >
              <FolderTree className="h-4 w-4" />
              Gestionar Categorías ({categories.length})
            </Button>
            <Button onClick={openCreate} className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Nuevo Servicio / Calendario
            </Button>
          </div>
        )}
      </div>

      {/* Barra de Filtros y Acciones por Lote */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-neutral-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-neutral-600">
            <span className="font-semibold text-neutral-700">Categoría:</span>
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">Todas las categorías ({services.length})</option>
              <option value="none">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (#{c.displayOrder})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-neutral-600">
            <span className="font-semibold text-neutral-700">Tipo:</span>
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">Todos los tipos</option>
              <option value="recurring">Citas habituales</option>
              <option value="event">Viajes / Eventos</option>
            </select>
          </div>

          <span className="text-xs text-neutral-400">
            Mostrando {filteredServices.length} de {services.length}
          </span>
        </div>

        {user?.role === "admin" && filteredServices.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedIds.length > 0 && selectedIds.length === filteredServices.length}
                onChange={toggleSelectAll}
                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              />
              <span className="font-medium">
                {selectedIds.length === filteredServices.length
                  ? "Deseleccionar todos"
                  : `Seleccionar todos (${filteredServices.length})`}
              </span>
            </label>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 pl-2 border-l border-neutral-200">
                <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {selectedIds.length} seleccionados
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBulkDeleteModalOpen(true)}
                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1 h-7 px-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar seleccionados
                </Button>
              </div>
            )}
          </div>
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
      ) : filteredServices.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-neutral-300" />
          <h3 className="mt-3 text-base font-medium text-neutral-900">Sin resultados con los filtros actuales</h3>
          <p className="mt-1 text-sm text-neutral-500">Cambia la categoría o el tipo de servicio seleccionado.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedCategories.map(({ category, services: groupServices }) => (
            <div key={category ? category.id : "uncategorized"} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {category ? (
                    <>
                      <span className="font-mono text-xs font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                        Orden #{category.displayOrder}
                      </span>
                      <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-1.5">
                        <span>📁</span> {category.name}
                      </h2>
                      {category.description && (
                        <span className="text-xs text-neutral-500 max-w-xl truncate hidden md:inline">
                          — {category.description}
                        </span>
                      )}
                    </>
                  ) : (
                    <h2 className="text-lg font-bold text-neutral-500 italic flex items-center gap-1.5">
                      <span>📂</span> Sin Categoría Asignada
                    </h2>
                  )}
                </div>
                <span className="text-xs font-medium text-neutral-600 bg-neutral-100 px-2.5 py-0.5 rounded-full border border-neutral-200">
                  {groupServices.length} {groupServices.length === 1 ? "actividad" : "actividades"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupServices.map((s) => (
            <div
              key={s.id || s.name}
              className={cn(
                "rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between",
                s.id && selectedIds.includes(s.id) ? "border-indigo-400 ring-2 ring-indigo-200 bg-indigo-50/20" : "border-neutral-200"
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    {user?.role === "admin" && s.id && (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => s.id && toggleSelect(s.id)}
                        className="mt-1 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 shrink-0"
                        title="Seleccionar para borrado en lote"
                      />
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded font-bold" title="Orden de visualización">
                          #{s.displayOrder ?? 0}
                        </span>
                        <h3 className="font-semibold text-neutral-900 text-base">{s.name}</h3>
                      </div>
                      {s.serviceType === "event" && (
                        <Badge variant="info" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                          Viaje / Evento puntual
                        </Badge>
                      )}
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {s.category && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200">
                            📁 {s.category.name}
                          </span>
                        )}
                        {(s.videoParticularUrl || s.videoParticularPath) && (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 border border-purple-200" title={`Video Particular: ${s.videoParticularPath || s.videoParticularUrl}`}>
                            🎥 Video
                          </span>
                        )}
                        {(s.flyerParticularUrl || s.flyerParticularPath) && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200" title={`Flyer Particular: ${s.flyerParticularPath || s.flyerParticularUrl}`}>
                            🖼️ Flyer Particular
                          </span>
                        )}
                        {(s.flyerUrl || s.flyerPath) && !(s.flyerParticularUrl || s.flyerParticularPath) && (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200" title={`Flyer General: ${s.flyerPath || s.flyerUrl}`}>
                            🖼️ Flyer
                          </span>
                        )}
                        {((s.fechaDesde && !s.fechaDesde.startsWith("2000-01-01")) || (s.fechaHasta && !s.fechaHasta.startsWith("2099-12-31"))) && (
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 border border-indigo-200" title="Vigencia de visualización">
                            🗓️ {s.fechaDesde?.slice(0, 10)} al {s.fechaHasta?.slice(0, 10)}
                          </span>
                        )}
                      </div>
                    </div>
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
                  {s.serviceType === "event" && (s.eventDatesText || s.sinfechadefinitiva === "S") && (
                    <div className="flex items-center justify-between text-neutral-600">
                      <span className="flex items-center gap-1.5">
                        <Compass className="h-3.5 w-3.5 text-purple-600" />
                        Fechas:
                      </span>
                      <span className="font-semibold text-purple-900">
                        {s.sinfechadefinitiva === "S"
                          ? s.textosinfechadefinitiva || "Fecha por confirmar"
                          : s.eventDatesText}
                      </span>
                    </div>
                  )}

                  {s.serviceType === "recurring" && s.scheduleText && (
                    <div className="rounded-md bg-sky-50 p-2 text-sky-950 border border-sky-100 flex items-start gap-1.5 text-[11px] leading-tight">
                      <Clock className="h-3.5 w-3.5 text-sky-600 mt-0.5 shrink-0" />
                      <span><strong>Horarios oficiales:</strong> {s.sinfechadefinitiva === "S" ? (s.textosinfechadefinitiva || "Horario por confirmar") : s.scheduleText}</span>
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
                      {s.sinpreciodefinitivo === "S"
                        ? s.textosinpreciodefinitivo || "Precio por confirmar"
                        : s.price
                        ? `${s.price} €`
                        : "No especificado"}
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

                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-medium text-neutral-500">Avisos:</span>
                    {s.notifyByEmail !== false && (
                      <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200" title="Confirmación por Email activa">
                        ✉️ Email
                      </span>
                    )}
                    {s.notifyByWhatsapp !== false && (
                      <span className="inline-flex items-center rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 border border-green-200" title="Confirmación por WhatsApp activa">
                        💬 WhatsApp
                      </span>
                    )}
                    {s.notifyBySms && (
                      <span className="inline-flex items-center rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 border border-purple-200" title="Confirmación por SMS activa">
                        📱 SMS
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-medium text-neutral-500">Recordatorios:</span>
                    {s.reminderWhatsapp !== false && (
                      <span className="inline-flex items-center rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 border border-green-200" title="Recordatorio por WhatsApp">
                        💬 WA
                      </span>
                    )}
                    {s.reminderEmail !== false && (
                      <span className="inline-flex items-center rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 border border-sky-200" title="Recordatorio por Email">
                        ✉️ Email
                      </span>
                    )}
                    {s.reminderVoice && (
                      <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200" title="Recordatorio por Llamada de Voz IA">
                        📞 Voz IA
                      </span>
                    )}
                    {s.reminderSms && (
                      <span className="inline-flex items-center rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 border border-purple-200" title="Recordatorio por SMS">
                        📱 SMS
                      </span>
                    )}
                    <span className="text-[10px] text-neutral-400 font-mono">
                      ({[
                        s.reminderHoursEnabled !== false ? `${s.reminderHours ?? 24}h` : null,
                        s.reminderMinutesEnabled !== false ? `${s.reminderMinutes ?? 120}m` : null,
                      ].filter(Boolean).join(" + ") || "Desactivados"})
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between">
                {user?.role === "admin" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => confirmDeleteService(s)}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                    title="Eliminar este servicio y todo lo relacionado"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDuplicate(s)}
                    disabled={duplicatingId === s.id}
                    className="flex items-center gap-1 text-xs text-neutral-700 hover:text-indigo-600"
                    title="Duplicar este servicio para crear uno nuevo a partir de sus datos"
                  >
                    <Copy className="h-3 w-3" />
                    {duplicatingId === s.id ? "Duplicando..." : "Duplicar"}
                  </Button>

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
            </div>
          ))}
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

          {form.serviceType === "recurring" && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 space-y-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-sky-950">
                  Horarios y Turnos Oficiales (Semanales)
                </label>
                <Input
                  value={form.scheduleText}
                  onChange={(e) => setForm((f) => ({ ...f, scheduleText: e.target.value }))}
                  placeholder="ej. Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:00, 17:30, 19:00)"
                />
                <p className="mt-1 text-[11px] text-sky-800">
                  El asistente de IA, WhatsApp, la web y el calendario utilizarán exactamente estos horarios para validar y ofrecer turnos disponibles.
                </p>
              </div>
            </div>
          )}

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

              {/* Opción Sin Fecha Definitiva */}
              <div className="rounded-md border border-purple-300 bg-white/90 p-2.5 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-purple-950">
                  <input
                    type="checkbox"
                    checked={form.sinfechadefinitiva === "S"}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        sinfechadefinitiva: e.target.checked ? "S" : "N",
                      }))
                    }
                    className="rounded border-neutral-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                  />
                  <span>Sin fecha definitiva / Fecha por confirmar</span>
                </label>
                {form.sinfechadefinitiva === "S" && (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-purple-900">
                      Texto descriptivo de la fecha (sustituye a la fecha en web, WhatsApp y VAPI)
                    </label>
                    <Input
                      value={form.textosinfechadefinitiva}
                      onChange={(e) => setForm((f) => ({ ...f, textosinfechadefinitiva: e.target.value }))}
                      placeholder="ej. fecha por confirmar ó dos encuentros  la primera puja es proximamente y la segunda en marzo 2027"
                      className="text-xs"
                    />
                  </div>
                )}
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

          {/* Categoría de Agrupación para Catálogo */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-neutral-800">
                <FolderTree className="h-3.5 w-3.5 text-amber-600" />
                Categoría de Agrupación (Catálogo Web)
              </span>
              <button
                type="button"
                onClick={openCategoriesManager}
                className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1"
              >
                + Gestionar categorías
              </button>
            </label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-xs focus:border-indigo-500 focus:outline-none"
            >
              <option value="">-- Sin categoría asignada --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (Orden: {c.displayOrder})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-neutral-400">
              Agrupa los servicios en el catálogo público sincronizado para la reserva de plazas.
            </p>
          </div>

          {/* Orden de visualización del servicio */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-indigo-600" />
                Orden de prioridad / visualización
              </span>
              <span className="text-[11px] text-neutral-400 font-normal">
                Menor número aparece antes (ej. 1, 2, 3...)
              </span>
            </label>
            <Input
              type="number"
              value={form.displayOrder}
              onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) || 0 }))}
              placeholder="0"
            />
            <p className="mt-1 text-[11px] text-neutral-400">
              Controla el orden en que se muestra este servicio dentro de su categoría tanto en el CRM como en la web pública.
            </p>
          </div>

          {/* Flyer / Gráfica del Servicio */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-indigo-600" />
                Flyer del Servicio (Ruta física y visualización)
              </label>
              {(form.flyerUrl || form.flyerPath) && (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-medium">
                  Flyer asignado
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                  Path físico del archivo en servidor
                </label>
                <Input
                  value={form.flyerPath}
                  onChange={(e) => {
                    const val = e.target.value;
                    setForm((f) => ({
                      ...f,
                      flyerPath: val,
                      flyerUrl: f.flyerUrl || (val.startsWith("public/") ? val.replace(/^public/, "") : f.flyerUrl),
                    }));
                  }}
                  placeholder="ej. public/flyers/yoga.jpeg o /var/media/flyers/yoga.jpeg"
                  className="text-xs font-mono"
                />
                <p className="mt-0.5 text-[10px] text-neutral-400">
                  Ruta física en disco donde se encuentra el archivo fuera de Git.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                  URL servida / visualización del flyer
                </label>
                <Input
                  value={form.flyerUrl}
                  onChange={(e) => setForm((f) => ({ ...f, flyerUrl: e.target.value }))}
                  placeholder="ej. /flyers/yoga.jpeg o https://..."
                  className="text-xs"
                />
                <p className="mt-0.5 text-[10px] text-neutral-400">
                  Ruta pública para renderizar en la web y catálogo sincronizado.
                </p>
              </div>
            </div>

            {/* Visualizador / Preview del Flyer */}
            {(form.flyerUrl || form.flyerPath) && (
              <div className="rounded-md border border-neutral-200 bg-white p-2 flex items-center gap-3">
                <div className="relative h-16 w-16 overflow-hidden rounded border border-neutral-200 bg-neutral-100 shrink-0 flex items-center justify-center">
                  <img
                    src={form.flyerUrl || form.flyerPath}
                    alt="Previsualización flyer"
                    className="h-full w-full object-cover z-10"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <ImageIcon className="h-6 w-6 text-neutral-300 absolute" />
                </div>
                <div className="min-w-0 text-xs">
                  <p className="font-medium text-neutral-800">Previsualización de Gráfica / Flyer General</p>
                  <p className="text-[11px] text-neutral-500 truncate max-w-xs">{form.flyerUrl || form.flyerPath}</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    Se mostrará en la ficha del servicio y en el catálogo web sincronizado si no hay flyer o video particular.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Fechas de Vigencia / Visualización */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                Fechas de Vigencia / Visualización del Icono
              </label>
              {(form.fechaDesde !== "2000-01-01" || form.fechaHasta !== "2099-12-31") && (
                <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 font-medium">
                  Rango personalizado
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-500">
              Controla el periodo en el que este servicio es visible en la web pública. Por defecto: desde 01/01/2000 hasta 31/12/2099.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                  Fecha Desde (Aparición)
                </label>
                <Input
                  type="date"
                  value={form.fechaDesde}
                  onChange={(e) => setForm((f) => ({ ...f, fechaDesde: e.target.value }))}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                  Fecha Hasta (Fin actividad)
                </label>
                <Input
                  type="date"
                  value={form.fechaHasta}
                  onChange={(e) => setForm((f) => ({ ...f, fechaHasta: e.target.value }))}
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          {/* Multimedia Particular del Servicio (Prioridad de Visualización) */}
          <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-purple-950 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                Multimedia Particular del Servicio (Prioridad de visualización)
              </label>
            </div>
            <p className="text-[11px] text-purple-800">
              En la web y catálogo interactivo se mostrará en orden de prioridad: <strong>1º Video MP4 Particular</strong>, si no hay <strong>2º Flyer Particular</strong>, y si no hay <strong>3º Flyer General de Itinerario</strong>.
            </p>

            {/* Video MP4 Particular */}
            <div className="space-y-2 pt-1 border-t border-purple-200/60">
              <label className="text-xs font-medium text-neutral-800 flex items-center gap-1">
                <Video className="h-3.5 w-3.5 text-purple-600" />
                Video Particular (MP4)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                    Path físico del video MP4 en disco
                  </label>
                  <Input
                    value={form.videoParticularPath}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((f) => ({
                        ...f,
                        videoParticularPath: val,
                        videoParticularUrl: f.videoParticularUrl || (val.startsWith("public/") ? val.replace(/^public/, "") : f.videoParticularUrl),
                      }));
                    }}
                    placeholder="ej. public/videos/asanas.mp4"
                    className="text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                    URL servida / visualización del Video MP4
                  </label>
                  <Input
                    value={form.videoParticularUrl}
                    onChange={(e) => setForm((f) => ({ ...f, videoParticularUrl: e.target.value }))}
                    placeholder="ej. /videos/asanas.mp4 o https://..."
                    className="text-xs"
                  />
                </div>
              </div>
              {(form.videoParticularUrl || form.videoParticularPath) && (
                <div className="rounded-md border border-purple-200 bg-white p-2">
                  <p className="text-[11px] font-medium text-neutral-700 mb-1.5">Previsualización de Video Particular:</p>
                  <video
                    src={form.videoParticularUrl || form.videoParticularPath}
                    controls
                    playsInline
                    className="w-full max-h-48 rounded bg-black object-contain"
                  />
                </div>
              )}
            </div>

            {/* Flyer Particular */}
            <div className="space-y-2 pt-2 border-t border-purple-200/60">
              <label className="text-xs font-medium text-neutral-800 flex items-center gap-1">
                <ImageIcon className="h-3.5 w-3.5 text-purple-600" />
                Flyer Particular del Servicio
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                    Path físico del flyer particular en disco
                  </label>
                  <Input
                    value={form.flyerParticularPath}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((f) => ({
                        ...f,
                        flyerParticularPath: val,
                        flyerParticularUrl: f.flyerParticularUrl || (val.startsWith("public/") ? val.replace(/^public/, "") : f.flyerParticularUrl),
                      }));
                    }}
                    placeholder="ej. public/flyers/particular.jpg"
                    className="text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                    URL servida del flyer particular
                  </label>
                  <Input
                    value={form.flyerParticularUrl}
                    onChange={(e) => setForm((f) => ({ ...f, flyerParticularUrl: e.target.value }))}
                    placeholder="ej. /flyers/particular.jpg"
                    className="text-xs"
                  />
                </div>
              </div>
              {(form.flyerParticularUrl || form.flyerParticularPath) && (
                <div className="rounded-md border border-purple-200 bg-white p-2 flex items-center gap-3">
                  <div className="relative h-16 w-16 overflow-hidden rounded border border-neutral-200 bg-neutral-100 shrink-0 flex items-center justify-center">
                    <img
                      src={form.flyerParticularUrl || form.flyerParticularPath}
                      alt="Previsualización flyer particular"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div className="min-w-0 text-xs">
                    <p className="font-medium text-neutral-800">Previsualización de Flyer Particular</p>
                    <p className="text-[11px] text-neutral-500 truncate">{form.flyerParticularUrl || form.flyerParticularPath}</p>
                  </div>
                </div>
              )}
            </div>
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

          {/* Opción Sin Precio Definitivo */}
          <div className="rounded-md border border-neutral-200 bg-neutral-50/60 p-2.5 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-neutral-800">
              <input
                type="checkbox"
                checked={form.sinpreciodefinitivo === "S"}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    sinpreciodefinitivo: e.target.checked ? "S" : "N",
                  }))
                }
                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              />
              <span>Sin precio definitivo / Precio por confirmar o según características</span>
            </label>
            {form.sinpreciodefinitivo === "S" && (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                  Texto descriptivo del precio (sustituye al importe en web, confirmaciones y VAPI)
                </label>
                <Input
                  value={form.textosinpreciodefinitivo}
                  onChange={(e) => setForm((f) => ({ ...f, textosinpreciodefinitivo: e.target.value }))}
                  placeholder="ej. el precio se determinara en funcion de las caracteristicas del viaje y alojamiento"
                  className="text-xs"
                />
              </div>
            )}
          </div>

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

          {/* Canales de confirmación automáticos al alumno */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3.5 space-y-2.5">
            <div>
              <h4 className="text-xs font-semibold text-neutral-800">
                Canales de confirmación y comunicación con el alumno
              </h4>
              <p className="text-[11px] text-neutral-500">
                Selecciona por qué vías recibirá el alumno los avisos de este servicio (aceptación, cancelación, reprogramación o espera de aprobación del profesor).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer bg-white p-2.5 rounded-md border border-neutral-200 hover:border-indigo-400 hover:bg-indigo-50/20 transition shadow-sm">
                <input
                  type="checkbox"
                  className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                  checked={form.notifyByEmail}
                  onChange={(e) => setForm((f) => ({ ...f, notifyByEmail: e.target.checked }))}
                />
                <span>✉️ Confirmar por Email</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer bg-white p-2.5 rounded-md border border-neutral-200 hover:border-indigo-400 hover:bg-indigo-50/20 transition shadow-sm">
                <input
                  type="checkbox"
                  className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                  checked={form.notifyByWhatsapp}
                  onChange={(e) => setForm((f) => ({ ...f, notifyByWhatsapp: e.target.checked }))}
                />
                <span>💬 Confirmar por WhatsApp</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer bg-white p-2.5 rounded-md border border-neutral-200 hover:border-indigo-400 hover:bg-indigo-50/20 transition shadow-sm">
                <input
                  type="checkbox"
                  className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                  checked={form.notifyBySms}
                  onChange={(e) => setForm((f) => ({ ...f, notifyBySms: e.target.checked }))}
                />
                <span>📱 Confirmar por SMS</span>
              </label>
            </div>
          </div>

          {/* Recordatorios automáticos previos a la cita */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3.5 space-y-3">
            <div>
              <h4 className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
                <span>⏰ Recordatorios automáticos previos a la cita</span>
              </h4>
              <p className="text-[11px] text-neutral-500">
                Selecciona por qué canales y con qué antelación se enviarán los recordatorios automáticos al alumno antes de su cita.
              </p>
            </div>

            {/* Canales de recordatorio */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-neutral-700 block">Vías de recordatorio:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer bg-white p-2 rounded-md border border-neutral-200 hover:border-emerald-400 hover:bg-emerald-50/20 transition shadow-sm">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
                    checked={form.reminderWhatsapp}
                    onChange={(e) => setForm((f) => ({ ...f, reminderWhatsapp: e.target.checked }))}
                  />
                  <span>💬 WhatsApp</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer bg-white p-2 rounded-md border border-neutral-200 hover:border-sky-400 hover:bg-sky-50/20 transition shadow-sm">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300 text-sky-600 focus:ring-sky-500"
                    checked={form.reminderEmail}
                    onChange={(e) => setForm((f) => ({ ...f, reminderEmail: e.target.checked }))}
                  />
                  <span>✉️ Email</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer bg-white p-2 rounded-md border border-neutral-200 hover:border-amber-400 hover:bg-amber-50/20 transition shadow-sm">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
                    checked={form.reminderVoice}
                    onChange={(e) => setForm((f) => ({ ...f, reminderVoice: e.target.checked }))}
                  />
                  <span>📞 Voz IA</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer bg-white p-2 rounded-md border border-neutral-200 hover:border-purple-400 hover:bg-purple-50/20 transition shadow-sm">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300 text-purple-600 focus:ring-purple-500"
                    checked={form.reminderSms}
                    onChange={(e) => setForm((f) => ({ ...f, reminderSms: e.target.checked }))}
                  />
                  <span>📱 SMS</span>
                </label>
              </div>
            </div>

            {/* Momentos de aviso previo (horas y minutos) */}
            <div className="space-y-2 pt-1 border-t border-amber-200/60">
              <span className="text-[11px] font-semibold text-neutral-700 block">Anticipación de aviso:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Aviso en horas */}
                <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-md border border-neutral-200">
                  <input
                    type="checkbox"
                    id="chk-reminder-hours"
                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                    checked={form.reminderHoursEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, reminderHoursEnabled: e.target.checked }))}
                  />
                  <label htmlFor="chk-reminder-hours" className="text-xs text-neutral-700 cursor-pointer whitespace-nowrap">
                    Avisar con
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="168"
                    disabled={!form.reminderHoursEnabled}
                    className="w-16 h-7 text-xs px-2 text-center"
                    value={form.reminderHours}
                    onChange={(e) => setForm((f) => ({ ...f, reminderHours: e.target.value }))}
                  />
                  <span className="text-xs text-neutral-600 font-medium">horas de antelación</span>
                </div>

                {/* Aviso en minutos */}
                <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-md border border-neutral-200">
                  <input
                    type="checkbox"
                    id="chk-reminder-minutes"
                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                    checked={form.reminderMinutesEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, reminderMinutesEnabled: e.target.checked }))}
                  />
                  <label htmlFor="chk-reminder-minutes" className="text-xs text-neutral-700 cursor-pointer whitespace-nowrap">
                    Avisar con
                  </label>
                  <Input
                    type="number"
                    min="5"
                    max="1440"
                    disabled={!form.reminderMinutesEnabled}
                    className="w-16 h-7 text-xs px-2 text-center"
                    value={form.reminderMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, reminderMinutes: e.target.value }))}
                  />
                  <span className="text-xs text-neutral-600 font-medium">minutos de antelación</span>
                </div>
              </div>
            </div>
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

      {/* Modal Gestión de Categorías */}
      <Modal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="Gestión de Categorías de Servicios (Catálogo Web)"
      >
        <div className="space-y-6">
          {/* Formulario Crear / Editar Categoría */}
          <form
            onSubmit={handleCategorySubmit}
            className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                <FolderTree className="h-4 w-4 text-indigo-600" />
                {editingCategory ? "Editar Categoría" : "Nueva Categoría de Agrupación"}
              </h4>
              {editingCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setCategoryForm({
                      code: "",
                      name: "",
                      description: "",
                      displayOrder: (categories.length + 1) * 10,
                      isActive: true,
                    });
                  }}
                  className="text-[11px] text-neutral-500 hover:text-neutral-800 underline"
                >
                  Cancelar edición
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                  Código identificador <span className="text-red-500">*</span>
                </label>
                <Input
                  value={categoryForm.code}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="ej. yoga_meditacion"
                  className="text-xs font-mono"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                  Nombre visible <span className="text-red-500">*</span>
                </label>
                <Input
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ej. Clases Regulares de Yoga"
                  className="text-xs"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                Descripción / Cabecera (aparece en la web para reservar plazas)
              </label>
              <textarea
                rows={2}
                value={categoryForm.description}
                onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="ej. ESCUELA SALVADORA CONESA · CLASES REGULARES&#10;Hatha Yoga Terapéutico, Meditaciones y Terapias"
                className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-neutral-700">
                    Orden de aparición
                  </label>
                  <Input
                    type="number"
                    value={categoryForm.displayOrder}
                    onChange={(e) => setCategoryForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))}
                    className="text-xs w-24"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 cursor-pointer mt-4">
                  <input
                    type="checkbox"
                    checked={categoryForm.isActive}
                    onChange={(e) => setCategoryForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Activa</span>
                </label>
              </div>

              <div className="mt-4">
                <Button type="submit" size="sm" disabled={savingCategory} className="text-xs">
                  {savingCategory ? "Guardando…" : editingCategory ? "Actualizar Categoría" : "Añadir Categoría"}
                </Button>
              </div>
            </div>

            {categoryError && <p className="text-xs text-red-600 font-medium">{categoryError}</p>}
          </form>

          {/* Lista de Categorías Existentes */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-neutral-700">
              Categorías Configuradas ({categories.length})
            </h4>

            {categories.length === 0 ? (
              <p className="text-xs text-neutral-400 py-4 text-center">No hay categorías configuradas.</p>
            ) : (
              <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white overflow-hidden max-h-64 overflow-y-auto">
                {categories.map((c) => (
                  <div key={c.id} className="p-3 flex items-start justify-between gap-2 hover:bg-neutral-50/80">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] bg-neutral-100 text-neutral-700 px-1.5 py-0.5 rounded font-bold">
                          #{c.displayOrder}
                        </span>
                        <span className="font-semibold text-xs text-neutral-900">{c.name}</span>
                        <span className="text-[10px] text-neutral-400 font-mono">({c.code})</span>
                        {c.isActive ? (
                          <Badge variant="success" className="text-[9px] py-0 px-1">Activa</Badge>
                        ) : (
                          <Badge variant="danger" className="text-[9px] py-0 px-1">Inactiva</Badge>
                        )}
                      </div>
                      {c.description && (
                        <p className="text-[11px] text-neutral-500 whitespace-pre-line line-clamp-2">
                          {c.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => startEditCategory(c)}
                        className="text-[11px] p-1 h-7"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      {user?.role === "admin" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCategory(c.id)}
                          className="text-[11px] p-1 h-7 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-neutral-100">
            <Button variant="secondary" onClick={() => setCategoryModalOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Confirmación de Borrado de Servicio */}
      <Modal
        open={deleteModalOpen}
        onClose={() => {
          if (!deletingService) {
            setDeleteModalOpen(false);
            setServiceToDelete(null);
          }
        }}
        title="Confirmar Eliminación de Servicio"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 space-y-1.5">
              <p className="font-semibold text-sm">
                ¿Deseas eliminar permanentemente el servicio &quot;{serviceToDelete?.name}&quot;?
              </p>
              <p className="text-red-800">
                Esta acción es <strong>irreversible</strong> y solo puede ser ejecutada por el Administrador.
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-red-700 pt-1">
                <li>Se eliminarán <strong>todas las citas y reservas</strong> asociadas a este servicio.</li>
                <li>Se retirará el servicio del <strong>agente de IA de WhatsApp</strong> y sus instrucciones/reglas.</li>
                <li>Se limpiarán los fragmentos de conocimiento (RAG) vinculados a esta actividad.</li>
                <li>La acción quedará registrada en el registro de auditoría.</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={deletingService}
              onClick={() => {
                setDeleteModalOpen(false);
                setServiceToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={deletingService}
              onClick={handleDeleteService}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingService ? "Eliminando…" : "Sí, Eliminar Definitivamente"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Confirmación de Borrado en Lote */}
      <Modal
        open={bulkDeleteModalOpen}
        onClose={() => {
          if (!deletingBulk) {
            setBulkDeleteModalOpen(false);
          }
        }}
        title="Confirmar Eliminación en Lote"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 space-y-1.5">
              <p className="font-semibold text-sm">
                ¿Deseas eliminar permanentemente los {selectedIds.length} servicios seleccionados?
              </p>
              <p className="text-red-800">
                Esta acción es <strong>irreversible</strong> y eliminará en bloque todos los servicios marcados:
              </p>
              <div className="max-h-36 overflow-y-auto rounded bg-white/70 p-2 border border-red-200 space-y-1 my-1">
                {services
                  .filter((s): s is Service & { id: string } => Boolean(s.id && selectedIds.includes(s.id)))
                  .map((s) => (
                    <div key={s.id} className="font-medium text-[11px] text-red-950 flex items-center justify-between">
                      <span>• {s.name}</span>
                      <span className="text-[10px] text-neutral-500 font-mono">#{s.displayOrder ?? 0}</span>
                    </div>
                  ))}
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-red-700 pt-1">
                <li>Se cancelarán y purgarán las reservas y calendarios asociados.</li>
                <li>Se desvincularán del agente de IA y de los catálogos web.</li>
                <li>Quedará registrado en la auditoría de seguridad.</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={deletingBulk}
              onClick={() => setBulkDeleteModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={deletingBulk}
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingBulk ? "Eliminando en lote…" : `Sí, Eliminar ${selectedIds.length} Servicios`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
