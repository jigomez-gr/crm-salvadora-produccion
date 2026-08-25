"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Phone,
  Upload,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { apiFetch, apiUrl, ApiError } from "@/lib/api";
import { Contact, ContactPage, ContactStatus, ImportResult } from "@/lib/types";
import { CONTACT_STATUS_META, CONTACT_STATUSES } from "@/lib/contacts";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

const selectClass =
  "block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const PAGE_SIZE = 50;

interface CustomField {
  key: string;
  value: string;
}

interface ContactFormData {
  name: string;
  phone: string;
  email: string;
  notes: string;
  status: ContactStatus;
  tagsText: string;
  source: string;
  customFields: CustomField[];
}

function toForm(c?: Contact): ContactFormData {
  return {
    name: c?.name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    notes: c?.notes ?? "",
    status: c?.status ?? "lead",
    tagsText: (c?.tags ?? []).join(", "),
    source: c?.source ?? "",
    customFields: Object.entries(c?.customFields ?? {}).map(([key, value]) => ({
      key,
      value,
    })),
  };
}

function ContactModal({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Contact;
  onSave: (data: ContactFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<ContactFormData>(toForm(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setError("El nombre y el teléfono son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo guardar el contacto. Inténtalo de nuevo."
      );
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof ContactFormData>(
    key: K,
    value: ContactFormData[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar contacto" : "Nuevo contacto"}
    >
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Nombre <span className="text-red-500">*</span>
          </label>
          <Input
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="Ana García"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Teléfono <span className="text-red-500">*</span>
          </label>
          <Input
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            placeholder="+34 600 000 000"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Estado
            </label>
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) =>
                setField("status", e.target.value as ContactStatus)
              }
            >
              {CONTACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONTACT_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Origen
            </label>
            <Input
              value={form.source}
              onChange={(e) => setField("source", e.target.value)}
              placeholder="manual, referido…"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Correo electrónico
          </label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder="ana@ejemplo.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Etiquetas{" "}
            <span className="text-neutral-400">(separadas por comas)</span>
          </label>
          <Input
            value={form.tagsText}
            onChange={(e) => setField("tagsText", e.target.value)}
            placeholder="vip, recordar"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Campos personalizados
          </label>
          <div className="space-y-2">
            {form.customFields.map((cf, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={cf.key}
                  onChange={(e) =>
                    setForm((f) => {
                      const next = [...f.customFields];
                      next[i] = { ...next[i], key: e.target.value };
                      return { ...f, customFields: next };
                    })
                  }
                  placeholder="Campo"
                />
                <Input
                  className="flex-1"
                  value={cf.value}
                  onChange={(e) =>
                    setForm((f) => {
                      const next = [...f.customFields];
                      next[i] = { ...next[i], value: e.target.value };
                      return { ...f, customFields: next };
                    })
                  }
                  placeholder="Valor"
                />
                <button
                  type="button"
                  className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      customFields: f.customFields.filter((_, j) => j !== i),
                    }))
                  }
                  aria-label="Quitar campo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  customFields: [...f.customFields, { key: "", value: "" }],
                }))
              }
            >
              + Añadir campo
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Notas
          </label>
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            placeholder="Notas sobre este contacto…"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!csv.trim()) {
      toast.error("Selecciona un archivo CSV o pega su contenido.");
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const res = await apiFetch<ImportResult>("/api/contacts/import", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setResult(res);
      onImported();
      toast.success(
        `Importación: ${res.created} nuevos, ${res.updated} actualizados.`
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo importar el CSV."
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar contactos (CSV)">
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">
          El CSV debe incluir al menos las columnas <strong>nombre</strong> y{" "}
          <strong>teléfono</strong>. Columnas opcionales: correo, estado,
          etiquetas, origen, notas. Los contactos se combinan por teléfono.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
        />
        {fileName && (
          <p className="text-xs text-neutral-500">Archivo: {fileName}</p>
        )}
        {result && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <p className="text-neutral-700">
              <strong>{result.created}</strong> nuevos,{" "}
              <strong>{result.updated}</strong> actualizados,{" "}
              <strong>{result.skipped}</strong> omitidos.
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs text-red-600">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    Fila {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={handleImport} disabled={importing || !csv.trim()}>
            {importing ? "Importando…" : "Importar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ContactsPageInner() {
  const toast = useToast();
  const searchParams = useSearchParams();
  // Deep-link support: /contacts?status=lead&search=…&new=1 (from the dashboard
  // and reports drill-through). Read once at mount via lazy initializers.
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(
    () => searchParams.get("search") ?? "",
  );
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "">(() => {
    const s = searchParams.get("status");
    return s === "lead" || s === "active" || s === "inactive" ? s : "";
  });
  const [modalOpen, setModalOpen] = useState(
    () => searchParams.get("new") === "1",
  );
  const [importOpen, setImportOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Contact | undefined>();
  const [deleting, setDeleting] = useState(false);

  // Debounce the search box (server-side now) so we don't fire a request per
  // keystroke; jump back to the first page whenever the query changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Pure loader (no setState) — fetches one page with the active filters pushed
  // down to the server.
  const loadContacts = useCallback(async (): Promise<ContactPage | null> => {
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (statusFilter) params.set("status", statusFilter);
      return await apiFetch<ContactPage>(`/api/contacts?${params.toString()}`);
    } catch {
      return null;
    }
  }, [offset, debouncedSearch, statusFilter]);

  const refreshContacts = useCallback(async () => {
    const page = await loadContacts();
    if (page) {
      setContacts(page.items);
      setTotal(page.total);
    }
  }, [loadContacts]);

  useEffect(() => {
    let cancelled = false;
    loadContacts().then((page) => {
      if (cancelled) return;
      setContacts(page?.items ?? []);
      setTotal(page?.total ?? 0);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadContacts]);

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  async function handleSave(data: ContactFormData) {
    const customFields: Record<string, string> = {};
    for (const { key, value } of data.customFields) {
      if (key.trim()) customFields[key.trim()] = value;
    }
    const payload = {
      name: data.name,
      phone: data.phone,
      email: data.email,
      notes: data.notes,
      status: data.status,
      source: data.source || undefined,
      tags: data.tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      customFields,
    };
    if (editingContact) {
      await apiFetch(`/api/contacts/${editingContact.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch("/api/contacts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    await refreshContacts();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/contacts/${deleteTarget.id}`, { method: "DELETE" });
      // If we just removed the last row of a non-first page, step back a page so
      // the user isn't stranded on an empty page — the offset change re-fetches.
      if (contacts.length === 1 && offset > 0) {
        setOffset((o) => Math.max(0, o - PAGE_SIZE));
      } else {
        await refreshContacts();
      }
      setDeleteTarget(undefined);
    } catch {
      toast.error("No se pudo eliminar el contacto.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleExport() {
    try {
      const res = await fetch(apiUrl("/api/contacts/export"), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("export failed");
      const text = await res.text();
      const url = URL.createObjectURL(
        new Blob([text], { type: "text/csv;charset=utf-8" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "contactos.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo exportar el CSV.");
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Contactos</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {total} contacto{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Importar
          </Button>
          <Button
            onClick={() => {
              setEditingContact(undefined);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nuevo contacto
          </Button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, teléfono, correo o etiqueta…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={`${selectClass} w-44`}
          value={statusFilter}
          onChange={(e) => {
            setOffset(0);
            setStatusFilter(e.target.value as ContactStatus | "");
          }}
        >
          <option value="">Todos los estados</option>
          {CONTACT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CONTACT_STATUS_META[s].label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            Cargando…
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            {debouncedSearch || statusFilter
              ? "Ningún contacto coincide con el filtro."
              : "Aún no hay contactos. Crea el primero."}
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-xs font-medium text-neutral-500">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Etiquetas</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="hover:text-indigo-600 hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.optedOut && (
                      <span className="ml-2 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                        Baja
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={CONTACT_STATUS_META[c.status].variant}>
                      {CONTACT_STATUS_META[c.status].label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-neutral-400" />
                      {c.phone}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                        >
                          {t}
                        </span>
                      ))}
                      {c.tags && c.tags.length > 4 && (
                        <span className="text-xs text-neutral-400">
                          +{c.tags.length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Editar ${c.name}`}
                        onClick={() => {
                          setEditingContact(c);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Eliminar ${c.name}`}
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
        <span>{total === 0 ? "0 contactos" : `${from}–${to} de ${total}`}</span>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-40"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-40"
            disabled={to >= total || loading}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ContactModal
        key={modalOpen ? editingContact?.id ?? "new" : "closed"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editingContact}
        onSave={handleSave}
      />

      <ImportModal
        key={importOpen ? "import-open" : "import-closed"}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={refreshContacts}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(undefined)}
        title="Eliminar contacto"
      >
        <p className="text-sm text-neutral-600">
          ¿Seguro que deseas eliminar a{" "}
          <strong>{deleteTarget?.name}</strong>? Esta acción no se puede deshacer.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(undefined)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Eliminando…" : "Eliminar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// useSearchParams() must sit under a Suspense boundary (Next.js App Router).
export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-8 text-sm text-neutral-400">Cargando…</div>}>
      <ContactsPageInner />
    </Suspense>
  );
}
