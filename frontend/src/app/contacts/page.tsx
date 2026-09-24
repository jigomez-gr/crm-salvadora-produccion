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
  MessageSquare,
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

import { ContactModal, ContactFormData } from "@/components/ContactModal";

const PAGE_SIZE = 50;

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
      isStudent: data.isStudent,
      studentModality: data.isStudent ? (data.studentModality || "1_clase_semanal") : null,
      bloqueado: data.bloqueado || "N",
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
                    {c.bloqueado === "S" && (
                      <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-red-100 border border-red-300 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        🚫 Bloqueado
                      </span>
                    )}
                    {c.optedOut && (
                      <span className="ml-2 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                        Baja
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <Badge variant={CONTACT_STATUS_META[c.status].variant}>
                        {CONTACT_STATUS_META[c.status].label}
                      </Badge>
                      {c.isStudent && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                          🧘 Alumno ({c.studentModality === "2_clases_semanales" ? "2 clases/sem" : "1 clase/sem"})
                        </span>
                      )}
                    </div>
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
                      <Link
                        href={`/contacts/${c.id}`}
                        className="inline-flex items-center justify-center h-8 px-2 rounded-md text-xs font-medium text-indigo-600 hover:bg-indigo-50 gap-1"
                        title="Ver ficha completa y enviar SMS con Zadarma"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Ficha & SMS</span>
                      </Link>
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
