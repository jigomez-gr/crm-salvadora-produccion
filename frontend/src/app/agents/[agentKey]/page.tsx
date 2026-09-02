"use client";

import { Fragment, use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Send,
  RefreshCw,
  Bot,
  Copy,
  Check,
  Upload,
  FileText,
  ChevronDown,
  Search,
  Star,
  PhoneCall,
} from "lucide-react";
import Link from "next/link";
import { apiFetch, apiUrl, ApiError } from "@/lib/api";
import {
  Agent,
  KnowledgeList,
  ModelsResponse,
  OpenRouterModel,
  Service,
  WorkingHour,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { SecretInput } from "@/components/ui/SecretInput";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Backend uses numeric days: 0=Sunday, 1=Monday … 6=Saturday
const DAYS: { label: string; value: number }[] = [
  { label: "Domingo", value: 0 },
  { label: "Lunes", value: 1 },
  { label: "Martes", value: 2 },
  { label: "Miércoles", value: 3 },
  { label: "Jueves", value: 4 },
  { label: "Viernes", value: 5 },
  { label: "Sábado", value: 6 },
];

const TONES: { value: string; label: string }[] = [
  { value: "professional", label: "Profesional" },
  { value: "friendly", label: "Amigable" },
  { value: "casual", label: "Informal" },
  { value: "formal", label: "Formal" },
  { value: "empathetic", label: "Empático" },
];

// ─── AI model picker (OpenRouter) ───────────────────────────────────────────────

/** "128K de contexto" / null when unknown. */
function formatContext(n: number | null): string | null {
  if (!n || n <= 0) return null;
  return n >= 1000 ? `${Math.round(n / 1000)}K de contexto` : `${n} de contexto`;
}

/**
 * OpenRouter prices are per-token strings ("0.00000015"). Show them per 1M
 * tokens as a range (prompt→completion), or "Gratis" for a free model.
 */
function formatPrice(
  prompt: string | null,
  completion: string | null
): string | null {
  const toMillion = (s: string | null) => {
    if (s == null) return null;
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n * 1_000_000;
  };
  const vals = [toMillion(prompt), toMillion(completion)].filter(
    (v): v is number => v != null
  );
  if (vals.length === 0) return null;
  if (vals.every((v) => v === 0)) return "Gratis";
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const fmt = (v: number) => `$${v.toFixed(2)}`;
  return lo === hi ? `${fmt(lo)}/1M tok` : `${fmt(lo)}–${fmt(hi)}/1M tok`;
}

function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (modelId: string) => void;
}) {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [recommended, setRecommended] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    apiFetch<ModelsResponse>("/api/agents/models")
      .then((r) => {
        setModels(r.models);
        setRecommended(r.recommended);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const recommendedSet = useMemo(() => new Set(recommended), [recommended]);

  // Ordered, flat option list for the current search. No search → recommended
  // first (curated order), then the rest (already name-sorted by the backend).
  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = models.filter(
      (m) =>
        !q ||
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q)
    );
    if (q) return filtered;
    const rec = recommended
      .map((id) => byId.get(id))
      .filter((m): m is OpenRouterModel => Boolean(m));
    const recIds = new Set(rec.map((m) => m.id));
    return [...rec, ...filtered.filter((m) => !recIds.has(m.id))];
  }, [models, recommended, byId, search]);

  // Focus the search box when the panel opens.
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  // Keep the highlighted row visible during keyboard navigation.
  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function openPanel() {
    setActiveIndex(0);
    setOpen(true);
  }

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) choose(opt.id);
    }
  }

  // Catalogue unavailable → free-text field so the user is never blocked.
  if (loaded && models.length === 0) {
    return (
      <div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="openai/gpt-4o-mini"
        />
        <p className="mt-1 text-xs text-neutral-500">
          No se pudo cargar la lista de modelos. Escribe el identificador del
          modelo de OpenRouter (ej.{" "}
          <span className="font-mono">openai/gpt-4o-mini</span>).
        </p>
      </div>
    );
  }

  const selectedLabel = byId.get(value)?.name ?? value ?? "";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <span className="flex min-w-0 items-center gap-2">
          {!loaded ? (
            <span className="text-neutral-400">Cargando modelos…</span>
          ) : selectedLabel ? (
            <>
              <span className="truncate">{selectedLabel}</span>
              {recommendedSet.has(value) && (
                <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
              )}
            </>
          ) : (
            <span className="text-neutral-400">Selecciona un modelo</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          <div className="border-b border-neutral-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Buscar modelo (ej. gpt, claude, gemini)…"
                className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {options.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-neutral-400">
                No hay modelos que coincidan con “{search}”.
              </li>
            )}
            {!search.trim() &&
              options.length > 0 &&
              recommendedSet.has(options[0].id) && (
                <li className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  Recomendados
                </li>
              )}
            {options.map((m, idx) => {
              const isRec = recommendedSet.has(m.id);
              const isSelected = m.id === value;
              const isActive = idx === activeIndex;
              const ctx = formatContext(m.contextLength);
              const price = formatPrice(m.promptPrice, m.completionPrice);
              // Divider between the recommended block and the rest (no search).
              const showAllHeader =
                !search.trim() &&
                idx > 0 &&
                recommendedSet.has(options[idx - 1].id) &&
                !isRec;
              return (
                <Fragment key={m.id}>
                  {showAllHeader && (
                    <li className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      Todos los modelos
                    </li>
                  )}
                  <li role="option" aria-selected={isSelected}>
                    <button
                      ref={isActive ? activeRef : undefined}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => choose(m.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left",
                        isActive ? "bg-indigo-50" : "hover:bg-neutral-50"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm text-neutral-800">
                            {m.name}
                          </span>
                          {isRec && (
                            <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                          {ctx && <span>{ctx}</span>}
                          {ctx && price && <span>·</span>}
                          {price && (
                            <span
                              className={
                                price === "Gratis"
                                  ? "font-medium text-green-600"
                                  : ""
                              }
                            >
                              {price}
                            </span>
                          )}
                          <span className="truncate font-mono text-neutral-300">
                            {m.id}
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-indigo-600" />
                      )}
                    </button>
                  </li>
                </Fragment>
              );
            })}
          </ul>

          <div className="border-t border-neutral-100 px-3 py-1.5 text-[11px] text-neutral-400">
            {models.length} modelos disponibles · los recomendados (⭐) funcionan
            bien para reservar citas.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Knowledge base card ────────────────────────────────────────────────────────

const KNOWLEDGE_ACCEPT = ".txt,.md,.markdown,.csv,.pdf,.docx,.docm,.xlsx,.xlsm";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function KnowledgeCard({ agentKey }: { agentKey: string }) {
  const toast = useToast();
  const [data, setData] = useState<KnowledgeList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const path = `/api/agents/${agentKey}/knowledge`;

  const load = () => {
    apiFetch<KnowledgeList>(path)
      .then(setData)
      .catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch<KnowledgeList>(path)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentKey]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) e.target.value = ""; // allow re-uploading the same file
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande (máximo 4 MB).");
      return;
    }
    setUploading(true);
    try {
      const contentBase64 = await fileToDataUrl(file);
      await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({ filename: file.name, contentBase64 }),
      });
      toast.success(`"${file.name}" añadido a la base de conocimiento.`);
      load();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "No se pudo subir el archivo.";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`${path}/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Documento eliminado.");
      load();
    } catch {
      toast.error("No se pudo eliminar el documento.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const docs = data?.documents ?? [];
  const totalChars = data?.totalChars ?? 0;
  const budgetChars = data?.budgetChars ?? 48000;
  const pct = Math.min(100, Math.round((totalChars / budgetChars) * 100));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-700">Base de conocimiento</h2>
        <p className="mt-0.5 text-xs text-neutral-400">
          Sube documentos (FAQ, precios, políticas…) y el agente los usará para
          responder. Formatos: TXT, Markdown, CSV, PDF, Word (.docx) y Excel
          (.xlsx). Máximo 4 MB por archivo.
        </p>
      </div>

      {/* Upload */}
      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept={KNOWLEDGE_ACCEPT}
          onChange={handleFile}
          className="hidden"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Subiendo…" : "Subir documento"}
        </Button>
      </div>

      {/* Document list */}
      {docs.length > 0 ? (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-800">{d.filename}</p>
                <p className="text-xs text-neutral-400">
                  {d.fileExtension.toUpperCase()} · {formatBytes(d.sizeBytes)} ·{" "}
                  {d.charCount.toLocaleString("es-ES")} caracteres
                </p>
              </div>
              <button
                type="button"
                aria-label={`Eliminar ${d.filename}`}
                onClick={() => setDeleteTarget({ id: d.id, filename: d.filename })}
                className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
          Aún no has subido documentos.
        </p>
      )}

      {/* Budget / mode indicator */}
      {docs.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
            <span>
              {totalChars.toLocaleString("es-ES")} /{" "}
              {budgetChars.toLocaleString("es-ES")} caracteres
            </span>
            <span className="font-medium">
              {data?.mode === "retrieve"
                ? "Modo: búsqueda por relevancia"
                : "Modo: base completa"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                pct >= 100 ? "bg-amber-500" : "bg-indigo-500"
              )}
              style={{ width: `${Math.max(4, pct)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {data?.mode === "retrieve"
              ? "La base es grande: el agente busca en cada mensaje los fragmentos más relevantes."
              : "El agente tiene toda la base presente en cada mensaje."}
          </p>
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar documento"
      >
        <p className="text-sm text-neutral-600">
          ¿Eliminar <strong>{deleteTarget?.filename}</strong> de la base de
          conocimiento? El agente dejará de usar su contenido.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
          <Button type="button" variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? "Eliminando…" : "Eliminar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────

function ConfigTab({
  agent,
  onSaved,
}: {
  agent: Agent;
  onSaved: (a: Agent) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Agent>({ ...agent });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Bumped after each successful save to remount the SecretInputs (so a
  // just-changed secret snaps back to its masked "Configurada" state).
  const [savedTick, setSavedTick] = useState(0);

  const webhookUrl = apiUrl(`/api/webhooks/ycloud/${agent.agentKey}`);
  const isLocalWebhook = /localhost|127\.0\.0\.1/.test(webhookUrl);

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — the field is selectable as fallback
    }
  }

  function updateService(idx: number, patch: Partial<Service>) {
    setForm((f) => {
      const services = [...f.services];
      services[idx] = { ...services[idx], ...patch };
      return { ...f, services };
    });
  }

  function removeService(idx: number) {
    setForm((f) => ({ ...f, services: f.services.filter((_, i) => i !== idx) }));
  }

  function addService() {
    setForm((f) => ({
      ...f,
      services: [...f.services, { name: "", durationMinutes: 30 }],
    }));
  }

  function updateHour(idx: number, patch: Partial<WorkingHour>) {
    setForm((f) => {
      const workingHours = [...f.workingHours];
      workingHours[idx] = { ...workingHours[idx], ...patch };
      return { ...f, workingHours };
    });
  }

  function addHour() {
    setForm((f) => ({
      ...f,
      workingHours: [...f.workingHours, { day: 1, open: "09:00", close: "18:00" }],
    }));
  }

  function removeHour(idx: number) {
    setForm((f) => ({ ...f, workingHours: f.workingHours.filter((_, i) => i !== idx) }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await apiFetch<Agent>(`/api/agents/${agent.agentKey}/config`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      onSaved(updated);
      // Refresh the secret "configured" flags from the server and drop any
      // plaintext secret we just sent, so the fields re-mask correctly.
      setForm((f) => ({
        ...f,
        openrouterApiKey: null,
        ycloudApiKey: null,
        ycloudWebhookSecret: null,
        hasOpenrouterApiKey: updated.hasOpenrouterApiKey,
        hasYcloudApiKey: updated.hasYcloudApiKey,
        hasYcloudWebhookSecret: updated.hasYcloudWebhookSecret,
      }));
      setSavedTick((t) => t + 1);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/agents/${agent.agentKey}`, { method: "DELETE" });
      router.push("/agents");
    } catch {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      {/* Business info */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-neutral-700">Información del negocio</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Nombre del negocio
          </label>
          <Input
            value={form.businessName}
            onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Descripción del negocio
          </label>
          <p className="mb-1.5 text-xs text-neutral-400">
            Qué es tu negocio y qué ofrece. El agente lo usa para presentarse y dar
            contexto.
          </p>
          <Textarea
            rows={3}
            value={form.businessDescription}
            onChange={(e) =>
              setForm((f) => ({ ...f, businessDescription: e.target.value }))
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Comportamiento del agente
          </label>
          <p className="mb-1.5 text-xs text-neutral-400">
            Instrucciones de cómo debe atender: tono, qué ofrecer o evitar,
            políticas, frases a usar… Se añaden a las reglas internas (que siempre
            tienen prioridad por seguridad).
          </p>
          <Textarea
            rows={5}
            value={form.customInstructions ?? ""}
            maxLength={4000}
            placeholder="Ej: Sé cercano y tutea al cliente. Si preguntan por precios, indícales que se confirman en la primera visita. No des consejos médicos."
            onChange={(e) =>
              setForm((f) => ({ ...f, customInstructions: e.target.value }))
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">Tono</label>
          <select
            className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            value={form.tone}
            onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
          >
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Zona horaria
          </label>
          <Input
            placeholder="Europe/Madrid"
            value={form.timezone ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          />
          <p className="mt-1 text-xs text-neutral-500">
            Zona horaria IANA para horarios y disponibilidad
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div>
            <p className="text-sm font-medium text-neutral-800">Agente activo</p>
            <p className="text-xs text-neutral-500">Si está desactivado, el agente no responderá</p>
          </div>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              form.enabled ? "bg-indigo-600" : "bg-neutral-300"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                form.enabled ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
      </div>

      {/* AI model */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">Modelo de IA</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Usamos OpenRouter: una sola clave te da acceso a cientos de modelos.
          </p>
        </div>
        <SecretInput
          key={`openrouter-${savedTick}`}
          label="Clave de API de OpenRouter"
          placeholder="sk-or-…"
          hasValue={!!form.hasOpenrouterApiKey}
          value={form.openrouterApiKey}
          onChange={(v) => setForm((f) => ({ ...f, openrouterApiKey: v }))}
          hint={
            <>
              Consíguela en{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                openrouter.ai/keys
              </a>
              . Se usa solo para este agente.
            </>
          }
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">Modelo</label>
          <ModelPicker
            value={form.model}
            onChange={(modelId) => setForm((f) => ({ ...f, model: modelId }))}
          />
        </div>
      </div>

      {/* WhatsApp connection */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">Conexión de WhatsApp (YCloud)</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Conecta el agente a WhatsApp a través de YCloud.
          </p>
        </div>
        <SecretInput
          key={`ycloud-api-${savedTick}`}
          label="Clave de API de YCloud"
          placeholder="Tu API key de YCloud"
          hasValue={!!form.hasYcloudApiKey}
          value={form.ycloudApiKey}
          onChange={(v) => setForm((f) => ({ ...f, ycloudApiKey: v }))}
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Número de WhatsApp
          </label>
          <Input
            placeholder="+34600000000"
            value={form.whatsappNumber ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, whatsappNumber: e.target.value || null }))
            }
          />
          <p className="mt-1 text-xs text-neutral-500">
            Número desde el que envía el agente (formato E.164)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            URL del webhook (pégala en YCloud)
          </label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={webhookUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="secondary" onClick={copyWebhook}>
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Copiado
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </>
              )}
            </Button>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            En YCloud → Developers → Webhooks, crea un webhook con esta URL. Copia
            el <em>secret</em> que te dé y pégalo abajo.
          </p>
          {isLocalWebhook && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠️ Esta URL apunta a tu ordenador (<code>localhost</code>) y{" "}
              <strong>no funcionará en YCloud</strong>: YCloud necesita una
              dirección pública con <code>https://</code> para poder avisarte
              cuando llega un WhatsApp.
              <br />
              Para probar desde tu ordenador, expón el backend con un túnel (lo
              más simple: <code>cloudflared tunnel --url http://localhost:3001</code>
              ) y pega en YCloud la URL pública que te dé, terminada en{" "}
              <code>/api/webhooks/ycloud/{agent.agentKey}</code>. Tienes los pasos
              completos en el README (“Probar WhatsApp desde tu ordenador”). Si
              despliegas en un servidor (Dokploy), aquí aparecerá automáticamente
              la URL de tu dominio con HTTPS.
            </p>
          )}
        </div>
        <SecretInput
          key={`ycloud-secret-${savedTick}`}
          label="Webhook secret de YCloud"
          placeholder="Secret que te da YCloud al crear el webhook"
          hasValue={!!form.hasYcloudWebhookSecret}
          value={form.ycloudWebhookSecret}
          onChange={(v) => setForm((f) => ({ ...f, ycloudWebhookSecret: v }))}
          hint="Sirve para verificar que los mensajes vienen de YCloud."
        />
      </div>

      {/* Reminders */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">
            Recordatorios de cita
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Envía un recordatorio por WhatsApp 24 h y 2 h antes de cada cita.
            Fuera de la ventana de 24 h, WhatsApp exige una{" "}
            <span className="font-medium">plantilla aprobada (HSM)</span>: créala
            en YCloud con 3 variables — {"{{1}}"} nombre, {"{{2}}"} servicio,{" "}
            {"{{3}}"} fecha y hora — e indica aquí su nombre.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div>
            <p className="text-sm font-medium text-neutral-800">
              Recordatorios activos
            </p>
            <p className="text-xs text-neutral-500">
              Requiere una plantilla aprobada y el número de WhatsApp configurado
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setForm((f) => ({ ...f, remindersEnabled: !f.remindersEnabled }))
            }
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              form.remindersEnabled ? "bg-indigo-600" : "bg-neutral-300"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                form.remindersEnabled ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Nombre de la plantilla (HSM)
          </label>
          <Input
            placeholder="p. ej. recordatorio_cita"
            value={form.reminderTemplateName ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                reminderTemplateName: e.target.value || null,
              }))
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Idioma de la plantilla
          </label>
          <Input
            className="w-32"
            placeholder="es"
            value={form.reminderTemplateLanguage ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                reminderTemplateLanguage: e.target.value,
              }))
            }
          />
          <p className="mt-1 text-xs text-neutral-500">
            Código de idioma de la plantilla en WhatsApp (p. ej. <code>es</code>{" "}
            o <code>es_ES</code>).
          </p>
        </div>
      </div>

      {/* Voice Phone Agent (VAPI & Zadarma) */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-neutral-700">
              Canal de Voz Telefónico (VAPI & Zadarma)
            </h2>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Configurar en Ajustes →
          </Link>
        </div>
        <p className="text-xs text-neutral-500">
          Atiende llamadas telefónicas reales y reserva clases de Yoga automáticamente mediante IA de voz (VAPI) conectada a tus números de Zadarma (+34 919 93 37 64 / +34 919 93 34 03) y con confirmaciones por SMS (n8n).
        </p>
      </div>

      {/* Services */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-700">Servicios</h2>
          <Button type="button" size="sm" variant="secondary" onClick={addService}>
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
        <div className="space-y-2">
          {form.services.map((s, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder="Nombre del servicio"
                value={s.name}
                onChange={(e) => updateService(idx, { name: e.target.value })}
              />
              <Input
                type="number"
                className="w-24"
                placeholder="Min"
                value={s.durationMinutes}
                onChange={(e) =>
                  updateService(idx, { durationMinutes: parseInt(e.target.value) || 0 })
                }
              />
              <span className="text-xs text-neutral-400 whitespace-nowrap">min</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeService(idx)}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            </div>
          ))}
          {form.services.length === 0 && (
            <p className="text-xs text-neutral-400">Sin servicios añadidos aún</p>
          )}
        </div>
      </div>

      {/* Working Hours */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-700">Horario de atención</h2>
          <Button type="button" size="sm" variant="secondary" onClick={addHour}>
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
        <div className="space-y-2">
          {form.workingHours.map((wh, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                className="rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                value={wh.day}
                onChange={(e) => updateHour(idx, { day: parseInt(e.target.value) })}
              >
                {DAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <Input
                type="time"
                className="w-28"
                value={wh.open}
                onChange={(e) => updateHour(idx, { open: e.target.value })}
              />
              <span className="text-xs text-neutral-400">a</span>
              <Input
                type="time"
                className="w-28"
                value={wh.close}
                onChange={(e) => updateHour(idx, { close: e.target.value })}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeHour(idx)}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            </div>
          ))}
          {form.workingHours.length === 0 && (
            <p className="text-xs text-neutral-400">Sin horarios añadidos aún</p>
          )}
        </div>
      </div>

      {/* Knowledge base — manages its own upload/list/delete endpoints, separate
          from the config save above. */}
      <KnowledgeCard agentKey={agent.agentKey} />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : saved ? "Guardado ✓" : "Guardar configuración"}
        </Button>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
        <h2 className="text-sm font-semibold text-red-700">Eliminar agente</h2>
        <p className="mt-0.5 text-xs text-neutral-600">
          Borra este agente y su configuración. No afecta a contactos ni citas.
        </p>
        <Button
          type="button"
          variant="danger"
          className="mt-3"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" /> Eliminar agente
        </Button>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar agente"
      >
        <p className="text-sm text-neutral-600">
          ¿Seguro que deseas eliminar <strong>{agent.businessName}</strong>? Esta
          acción no se puede deshacer.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Eliminando…" : "Eliminar"}
          </Button>
        </div>
      </Modal>
    </form>
  );
}

// ─── Playground Tab ────────────────────────────────────────────────────────────

interface PlaygroundMessage {
  role: "user" | "assistant";
  body: string;
  ts: string;
}

function PlaygroundTab({ agentKey }: { agentKey: string }) {
  const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", body: text, ts: new Date().toISOString() },
    ]);
    setSending(true);
    try {
      const res = await apiFetch<{ reply: string; threadId: string }>(
        `/api/agents/${agentKey}/playground`,
        {
          method: "POST",
          body: JSON.stringify({ message: text, threadId }),
        }
      );
      setThreadId(res.threadId);
      setMessages((m) => [
        ...m,
        { role: "assistant", body: res.reply, ts: new Date().toISOString() },
      ]);
    } catch (err) {
      const errMsg =
        err instanceof ApiError && err.message
          ? `Error: ${err.message}`
          : "No se pudo obtener respuesta. Revisa tu clave de OpenRouter en la pestaña Configuración.";
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          body: errMsg,
          ts: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function newConversation() {
    setMessages([]);
    setThreadId(null);
    setInput("");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-full flex-col max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          Prueba el agente directamente desde la plataforma.{" "}
          {threadId && (
            <span className="font-mono text-neutral-400">
              Hilo: {threadId.slice(0, 12)}…
            </span>
          )}
        </p>
        <Button size="sm" variant="secondary" onClick={newConversation}>
          <RefreshCw className="h-3.5 w-3.5" />
          Nueva conversación
        </Button>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex-1 overflow-y-auto space-y-3 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-neutral-400">
              Envía un mensaje para empezar a probar el agente
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                    m.role === "user"
                      ? "rounded-br-sm bg-indigo-600 text-white"
                      : "rounded-bl-sm bg-neutral-100 text-neutral-900 border border-neutral-200"
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-[10px]",
                      m.role === "user" ? "text-indigo-200" : "text-neutral-400"
                    )}
                  >
                    {format(new Date(m.ts), "HH:mm", { locale: es })}
                  </p>
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-neutral-100 border border-neutral-200 px-3.5 py-2">
                <span className="text-xs text-neutral-400">Pensando…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex items-end gap-2 border-t border-neutral-100 p-3">
          <Textarea
            rows={2}
            className="flex-1 resize-none"
            placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <Button onClick={send} disabled={!input.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentKey: string }>;
}) {
  const { agentKey } = use(params);
  const { user } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"config" | "playground">("config");

  useEffect(() => {
    apiFetch<Agent>(`/api/agents/${agentKey}/config`)
      .then(setAgent)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentKey]);

  if (user && user.role !== "admin") {
    return (
      <div className="p-4 sm:p-8">
        <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
          <div>
            <h1 className="text-sm font-semibold text-neutral-900">
              Acceso restringido
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Solo los administradores pueden ver o modificar la configuración de agentes de IA.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-sm text-neutral-400">Cargando agente…</div>;
  }

  if (!agent) {
    return (
      <div className="p-4 sm:p-8">
        <p className="text-sm text-neutral-500">Agente no encontrado.</p>
        <Link
          href="/agents"
          className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a Agentes
        </Link>
      </div>
    );
  }

  const tabLabel = (t: "config" | "playground") =>
    t === "config" ? "Configuración" : "Playground";

  return (
    <div className="flex h-full flex-col p-8">
      <Link
        href="/agents"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Agentes
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
          <Bot className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">
            {agent.businessName}
          </h1>
          <p className="text-xs text-neutral-500">{agentKey}</p>
        </div>
        <span
          className={cn(
            "ml-2 rounded-full px-2 py-0.5 text-xs font-medium",
            agent.enabled
              ? "bg-green-100 text-green-700"
              : "bg-neutral-100 text-neutral-500"
          )}
        >
          {agent.enabled ? "Activo" : "Desactivado"}
        </span>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 border-b border-neutral-200">
        {(["config", "playground"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-neutral-500 hover:text-neutral-800"
            )}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      <div className="mt-5 flex-1 overflow-y-auto">
        {tab === "config" ? (
          <ConfigTab agent={agent} onSaved={setAgent} />
        ) : (
          <PlaygroundTab agentKey={agentKey} />
        )}
      </div>
    </div>
  );
}
