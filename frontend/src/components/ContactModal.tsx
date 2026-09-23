"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import { Contact, ContactStatus } from "@/lib/types";
import { CONTACT_STATUS_META, CONTACT_STATUSES } from "@/lib/contacts";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError } from "@/lib/api";

const selectClass =
  "block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export interface CustomField {
  key: string;
  value: string;
}

export interface ContactFormData {
  name: string;
  phone: string;
  email: string;
  notes: string;
  status: ContactStatus;
  tagsText: string;
  source: string;
  customFields: CustomField[];
  isStudent: boolean;
  studentModality: string;
}

export function toForm(c?: Partial<Contact>): ContactFormData {
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
      value: String(value ?? ""),
    })),
    isStudent: c?.isStudent ?? false,
    studentModality: c?.studentModality ?? "1_clase_semanal",
  };
}

export function ContactModal({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Contact>;
  onSave: (data: ContactFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<ContactFormData>(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(toForm(initial));
      setError("");
    }
  }, [initial, open]);

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
      title={initial?.id ? "Editar contacto" : "Nuevo contacto"}
    >
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {initial?.id && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2.5 flex items-center justify-between gap-2">
            <div className="text-xs text-indigo-950">
              <span className="font-semibold block">Ficha y SMS de {initial.name}</span>
              <span className="text-neutral-500 text-[11px]">Accede a citas, historial y envío de SMS con Zadarma.</span>
            </div>
            <Link
              href={`/contacts/${initial.id}`}
              className="px-2.5 py-1 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 shrink-0 shadow-xs"
            >
              Abrir Ficha / SMS →
            </Link>
          </div>
        )}
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
        <div className="rounded-lg border border-neutral-200 p-3 bg-neutral-50/70 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isStudent}
              onChange={(e) => setField("isStudent", e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-semibold text-neutral-800">
              Es Alumno oficial de Yoga
            </span>
          </label>
          {form.isStudent && (
            <div className="pl-6 pt-1">
              <label className="mb-1 block text-[11px] font-medium text-neutral-600">
                Modalidad de clases semanales
              </label>
              <select
                className={selectClass}
                value={form.studentModality}
                onChange={(e) => setField("studentModality", e.target.value)}
              >
                <option value="1_clase_semanal">1 clase semanal (25 € / mes)</option>
                <option value="2_clases_semanales">2 clases semanales (42 € / mes)</option>
              </select>
            </div>
          )}
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
