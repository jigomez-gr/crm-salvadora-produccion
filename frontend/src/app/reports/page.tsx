"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  CheckCircle2,
  XCircle,
  UserPlus,
  Download,
  Euro,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { apiFetch } from "@/lib/api";
import { ReportSummary } from "@/lib/types";
import {
  FUNNEL_LABELS,
  FUNNEL_COLORS,
  formatPercent,
  ratioPercent,
  formatEuro,
} from "@/lib/reports";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { StackedBars } from "@/components/charts/StackedBars";
import { Funnel } from "@/components/charts/Funnel";
import { Donut } from "@/components/charts/Donut";
import { HBars } from "@/components/charts/HBars";
import { Sparkline } from "@/components/charts/Sparkline";

const selectClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const dateInputClass =
  "rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const PRESETS = [7, 30, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "reports.range";

type RangeMode = 7 | 30 | 90 | "custom";
interface RangeState {
  mode: RangeMode;
  from: string; // yyyy-MM-dd (custom only)
  to: string; // yyyy-MM-dd (custom only)
}

function defaultRange(): RangeState {
  const to = format(new Date(), "yyyy-MM-dd");
  const from = format(new Date(Date.now() - 30 * DAY_MS), "yyyy-MM-dd");
  return { mode: 30, from, to };
}

function readStoredRange(): RangeState {
  if (typeof window === "undefined") return defaultRange();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RangeState;
      if (parsed && (PRESETS.includes(parsed.mode as 7) || parsed.mode === "custom")) {
        return { ...defaultRange(), ...parsed };
      }
    }
  } catch {
    // ignore malformed storage
  }
  return defaultRange();
}

// Resolve a RangeState to concrete ISO from/to, or null when custom is incomplete.
function resolveRange(r: RangeState): { from: string; to: string } | null {
  if (r.mode === "custom") {
    if (!r.from || !r.to) return null;
    const from = new Date(`${r.from}T00:00:00`);
    const to = new Date(`${r.to}T23:59:59`);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return null;
    return { from: from.toISOString(), to: to.toISOString() };
  }
  return {
    from: new Date(Date.now() - r.mode * DAY_MS).toISOString(),
    to: new Date().toISOString(),
  };
}

// ─── CSV export (client-side; no new endpoint) ───
function csvCell(value: string | number): string {
  let s = String(value ?? "");
  // Neutralise spreadsheet formula injection (OWASP) while keeping plain numbers.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadReportCsv(report: ReportSummary) {
  const header = [
    "Fecha",
    "Citas",
    "Completadas",
    "Canceladas",
    "Programadas",
    "Mensajes recibidos",
    "Mensajes enviados",
    "Contactos nuevos",
    "Ingresos (€)",
  ];
  const rows = report.appointments.byDay.map((d, i) => {
    const total = d.completed + d.cancelled + d.scheduled;
    const msg = report.messages.byDay[i];
    const nc = report.contacts.newByDay[i];
    const rev = report.appointments.revenue.byDay[i];
    return [
      d.date,
      total,
      d.completed,
      d.cancelled,
      d.scheduled,
      msg?.inbound ?? 0,
      msg?.outbound ?? 0,
      nc?.count ?? 0,
      rev?.amount ?? 0,
    ];
  });
  const csv = [header, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `informe_${report.range.from}_${report.range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";

export default function ReportsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [range, setRange] = useState<RangeState>(readStoredRange);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Persist the chosen range (writing to storage in an effect — no setState).
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
    } catch {
      // storage may be unavailable (private mode) — non-fatal
    }
  }, [range]);

  const load = useCallback(async (): Promise<ReportSummary | null> => {
    const resolved = resolveRange(range);
    if (!resolved) return null;
    try {
      const params = new URLSearchParams({
        from: resolved.from,
        to: resolved.to,
      });
      return await apiFetch<ReportSummary>(
        `/api/reports/summary?${params.toString()}`,
      );
    } catch {
      return null;
    }
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    // Don't flip `loading` on synchronously (React 19 lint) — the previous
    // report stays visible until the new one arrives, which is fine UX.
    load().then((data) => {
      if (cancelled) return;
      setReport(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (user && user.role === "service_manager") {
    return (
      <div className="p-4 sm:p-8">
        <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
          <div>
            <h1 className="text-sm font-semibold text-neutral-900">
              Acceso restringido
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Las analíticas globales del negocio son administradas por la dirección. Puedes consultar tus métricas de citas en tu panel de Inicio.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const a = report?.appointments;
  const c = report?.contacts;
  const m = report?.messages;
  const trends = report?.trends;

  const rangeLabel =
    report &&
    `${format(parseISO(report.range.from), "d MMM", { locale: es })} – ${format(
      parseISO(report.range.to),
      "d MMM yyyy",
      { locale: es },
    )}`;

  const peakHour =
    a && a.byHour.some((h) => h > 0)
      ? a.byHour.indexOf(Math.max(...a.byHour))
      : null;

  const newContactsTotal = c
    ? c.newByDay.reduce((s, d) => s + d.count, 0)
    : 0;

  const fromDate = report ? report.range.from : "";

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Informes</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {rangeLabel ?? "Analíticas de tu negocio"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectClass}
            value={range.mode}
            onChange={(e) => {
              const v = e.target.value;
              setRange((r) => ({
                ...r,
                mode: v === "custom" ? "custom" : (Number(v) as RangeMode),
              }));
            }}
          >
            {PRESETS.map((d) => (
              <option key={d} value={d}>
                Últimos {d} días
              </option>
            ))}
            <option value="custom">Personalizado</option>
          </select>
          {range.mode === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                className={dateInputClass}
                value={range.from}
                max={range.to}
                onChange={(e) =>
                  setRange((r) => ({ ...r, from: e.target.value }))
                }
                aria-label="Desde"
              />
              <span className="text-xs text-neutral-400">–</span>
              <input
                type="date"
                className={dateInputClass}
                value={range.to}
                min={range.from}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                aria-label="Hasta"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => report && downloadReportCsv(report)}
            disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-neutral-400">Cargando…</div>
      ) : !report || !a || !c || !m ? (
        <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">
          {range.mode === "custom" && !resolveRange(range)
            ? "Elige un rango de fechas válido."
            : "No se pudieron cargar las analíticas."}
        </div>
      ) : (
        <>
          {/* KPI strip — trended + clickable */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Citas en el periodo"
              value={a.total}
              icon={CalendarCheck}
              color="bg-indigo-50 text-indigo-600"
              href={`/calendar?date=${fromDate}`}
              trend={trends?.appointments}
              trendSample={a.total}
            />
            <StatCard
              label="Tasa de finalización"
              value={formatPercent(a.completionRate)}
              icon={CheckCircle2}
              color="bg-green-50 text-green-600"
              hint={`${a.byStatus.completed} de ${a.total} citas`}
              trend={trends?.completionRate}
              trendIsRate
              trendSample={a.total}
            />
            <StatCard
              label="Tasa de cancelación"
              value={formatPercent(a.cancellationRate)}
              icon={XCircle}
              color="bg-red-50 text-red-600"
              href={`/calendar?date=${fromDate}`}
              hint={`${a.byStatus.cancelled} de ${a.total} citas`}
              trend={trends?.cancellationRate}
              trendIsRate
              trendSample={a.total}
            />
            <StatCard
              label="Contactos nuevos"
              value={newContactsTotal}
              icon={UserPlus}
              color="bg-yellow-50 text-yellow-600"
              href="/contacts?status=lead"
              trend={trends?.newContacts}
              trendSample={newContactsTotal}
            />
          </div>

          {/* Hero: conversion funnel */}
          <div className="mt-6">
            <ChartCard
              title="Embudo de conversión"
              href="/pipeline"
              linkLabel="Ver embudo"
              footer="Estado actual de tu cartera de contactos (no filtrado por periodo)."
            >
              <Funnel
                steps={report.funnel.map((s) => ({
                  key: s.key,
                  label: FUNNEL_LABELS[s.key],
                  count: s.count,
                  color: FUNNEL_COLORS[s.key],
                  href:
                    s.key === "leads"
                      ? "/contacts?status=lead"
                      : s.key === "won"
                        ? "/contacts?status=active"
                        : "/pipeline",
                }))}
              />
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="Citas por día"
              footer={`Programadas ${a.byStatus.scheduled} · Completadas ${a.byStatus.completed} · Canceladas ${a.byStatus.cancelled}`}
            >
              <StackedBars
                data={a.byDay}
                labelKey="date"
                onBarClick={(i) =>
                  router.push(`/calendar?date=${a.byDay[i].date}`)
                }
                barAriaLabel={(row) =>
                  `${row.date}: ${
                    Number(row.completed) +
                    Number(row.scheduled) +
                    Number(row.cancelled)
                  } citas — ${row.completed} completadas, ${row.cancelled} canceladas. Abrir en el calendario.`
                }
                series={[
                  { key: "completed", label: "Completadas", color: "bg-green-500" },
                  { key: "scheduled", label: "Programadas", color: "bg-indigo-500" },
                  { key: "cancelled", label: "Canceladas", color: "bg-red-400" },
                ]}
              />
            </ChartCard>

            <ChartCard
              title="Horas más activas"
              footer={
                peakHour !== null
                  ? `Hora punta: ${String(peakHour).padStart(2, "0")}:00 — útil para planificar personal`
                  : "Sin datos en el periodo"
              }
            >
              <StackedBars
                data={a.byHour.map((count, hour) => ({ hour, count }))}
                labelKey="hour"
                barAriaLabel={(row) => `${row.hour}:00 — ${row.count} citas`}
                series={[{ key: "count", label: "Citas", color: "bg-indigo-500" }]}
              />
            </ChartCard>

            {c.bySource.length > 0 && (
              <ChartCard
                title="Fuentes de captación"
                footer="Contactos por origen y cuántos llegaron a reservar."
              >
                <HBars
                  rows={c.bySource.map((s) => ({
                    key: s.source,
                    label: s.source,
                    value: s.total,
                    subLabel: `${s.converted} reservaron`,
                  }))}
                />
              </ChartCard>
            )}

            {a.byService.length > 0 && (
              <ChartCard
                title="Por servicio"
                footer="Servicios más solicitados en el periodo."
              >
                <HBars
                  rows={a.byService.map((s) => ({
                    key: s.service,
                    label: s.service,
                    value: s.total,
                    subLabel: `${ratioPercent(s.completed, s.total)} completadas${
                      s.revenue > 0 ? ` · ${formatEuro(s.revenue)}` : ""
                    }`,
                    color: "bg-violet-500",
                  }))}
                />
              </ChartCard>
            )}

            <ChartCard
              title="Contactos por estado"
              footer={`Conversión (clientes / total): ${formatPercent(c.conversionRate)}`}
            >
              <Donut
                segments={[
                  {
                    key: "lead",
                    label: "Leads",
                    value: c.byStatus.lead,
                    color: "#94a3b8",
                    href: "/contacts?status=lead",
                  },
                  {
                    key: "active",
                    label: "Clientes",
                    value: c.byStatus.active,
                    color: "#10b981",
                    href: "/contacts?status=active",
                  },
                  {
                    key: "inactive",
                    label: "Inactivos",
                    value: c.byStatus.inactive,
                    color: "#d4d4d4",
                    href: "/contacts?status=inactive",
                  },
                ]}
              />
            </ChartCard>

            {a.revenue.total > 0 && (
              <ChartCard
                title="Ingresos estimados"
                right={
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-900">
                    <Euro className="h-4 w-4 text-emerald-500" />
                    {formatEuro(a.revenue.total)}
                  </span>
                }
                footer="Estimado a precio de lista (excluye canceladas; no es facturación real)."
              >
                <StackedBars
                  data={a.revenue.byDay}
                  labelKey="date"
                  barAriaLabel={(row) =>
                    `${row.date}: ${formatEuro(Number(row.amount))}`
                  }
                  series={[
                    { key: "amount", label: "Ingresos (€)", color: "bg-emerald-500" },
                  ]}
                />
              </ChartCard>
            )}

            <ChartCard
              title="Mensajes por día"
              footer={`${m.inbound} recibidos · ${m.outbound} enviados. El volumen es una entrada, no un resultado.`}
            >
              <Sparkline
                values={m.byDay.map((d) => d.inbound + d.outbound)}
                ariaLabel={`Mensajes por día: ${m.total} en total`}
              />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
