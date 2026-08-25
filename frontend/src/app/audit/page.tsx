"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollText, ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { AuditLog, AuditPage } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/Badge";

const selectClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const PAGE_SIZE = 50;

// Human labels for the known action keys (falls back to the raw key).
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Inicio de sesión",
  "auth.password_change": "Cambio de contraseña",
  "user.create": "Usuario creado",
  "user.update": "Usuario actualizado",
  "user.delete": "Usuario eliminado",
  "contact.create": "Contacto creado",
  "contact.update": "Contacto actualizado",
  "contact.delete": "Contacto eliminado",
  "contact.import": "Importación CSV",
  "contact.opt_out": "Baja (opt-out)",
  "contact.opt_in": "Alta (opt-in)",
  "contact.anonymize": "Anonimización (GDPR)",
  "settings.update": "Configuración actualizada",
  "data.clear_demo": "Datos de demo vaciados",
  "onboarding.complete": "Onboarding completado",
};

const ACTION_FILTERS = Object.keys(ACTION_LABELS);

function actionVariant(action: string): "info" | "success" | "danger" | "default" {
  if (action.endsWith(".delete")) return "danger";
  if (action.endsWith(".create")) return "success";
  if (action.startsWith("auth.")) return "info";
  return "default";
}

export default function AuditLogPage() {
  const { user: currentUser } = useAuth();
  const [page, setPage] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState("");

  // Pure loader (no setState) so the effect never calls setState synchronously.
  const load = useCallback(async (): Promise<AuditPage | null> => {
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (action) params.set("action", action);
      return await apiFetch<AuditPage>(`/api/audit?${params.toString()}`);
    } catch {
      return null;
    }
  }, [offset, action]);

  useEffect(() => {
    let cancelled = false;
    load().then((data) => {
      if (cancelled) return;
      setPage(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (currentUser && currentUser.role !== "admin") {
    return (
      <div className="p-4 sm:p-8">
        <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
          <div>
            <h1 className="text-sm font-semibold text-neutral-900">
              Acceso restringido
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Solo los administradores pueden ver el registro de actividad.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const items: AuditLog[] = page?.items ?? [];
  const total = page?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Auditoría</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Registro de acciones de seguridad y gestión de usuarios
          </p>
        </div>
        <select
          className={selectClass}
          value={action}
          onChange={(e) => {
            setOffset(0);
            setAction(e.target.value);
          }}
        >
          <option value="">Todas las acciones</option>
          {ACTION_FILTERS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            Cargando…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-neutral-400">
            <ScrollText className="h-6 w-6 text-neutral-300" />
            No hay actividad registrada todavía.
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-xs font-medium text-neutral-500">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Detalle</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-neutral-50">
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-500">
                    {format(new Date(row.createdAt), "d MMM yyyy, HH:mm", {
                      locale: es,
                    })}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {row.actorEmail ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={actionVariant(row.action)}>
                      {ACTION_LABELS[row.action] ?? row.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{row.summary}</td>
                  <td className="px-4 py-3 text-neutral-400">{row.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
        <span>
          {total === 0 ? "0 registros" : `${from}–${to} de ${total}`}
        </span>
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
    </div>
  );
}
