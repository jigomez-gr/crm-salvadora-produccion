"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  CalendarDays,
  Inbox,
  UserCog,
  Plus,
  MessageSquare,
  Flame,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  DashboardMetrics,
  Conversation,
  ConversationPage,
  Appointment,
  PipelineStageTotal,
} from "@/lib/types";
import { useEvents } from "@/hooks/useEvents";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { APPT_STATUS_META } from "@/lib/appointments";
import { PIPELINE_STAGE_META, PIPELINE_STAGES } from "@/lib/pipeline";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface DashboardData {
  metrics: DashboardMetrics;
  conversations: Conversation[];
  today: Appointment[];
  pipeline: PipelineStageTotal[];
}

// ─── Quick actions ───
function QuickActions({ unread }: { unread: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/contacts?new=1"
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <Plus className="h-4 w-4" /> Nuevo contacto
      </Link>
      <Link
        href="/calendar?new=1"
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <CalendarDays className="h-4 w-4" /> Nueva cita
      </Link>
      <Link
        href="/conversations"
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <MessageSquare className="h-4 w-4" /> Ir al inbox
        {unread > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">
            {unread}
          </span>
        )}
      </Link>
    </div>
  );
}

// ─── "Necesita tu atención" ───
interface AttentionItem {
  key: string;
  count: number;
  label: string;
  href: string;
  icon: React.ElementType;
  tone: string; // classes for the icon chip
}

function AttentionQueue({ metrics }: { metrics: DashboardMetrics }) {
  const disabledAgents = Math.max(metrics.agentsTotal - metrics.activeAgents, 0);
  const items: AttentionItem[] = [
    {
      key: "unread",
      count: metrics.unreadConversations,
      label:
        metrics.unreadConversations === 1
          ? "1 conversación sin leer"
          : `${metrics.unreadConversations} conversaciones sin leer`,
      href: "/conversations",
      icon: Inbox,
      tone: "bg-red-50 text-red-600",
    },
    {
      key: "handoff",
      count: metrics.handoffConversations,
      label:
        metrics.handoffConversations === 1
          ? "1 conversación en modo manual"
          : `${metrics.handoffConversations} conversaciones en modo manual`,
      href: "/conversations",
      icon: UserCog,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      key: "today",
      count: metrics.appointmentsToday,
      label:
        metrics.appointmentsToday === 1
          ? "1 cita programada para hoy"
          : `${metrics.appointmentsToday} citas programadas para hoy`,
      href: "/calendar",
      icon: CalendarDays,
      tone: "bg-indigo-50 text-indigo-600",
    },
    {
      key: "leads",
      count: metrics.newLeads,
      label:
        metrics.newLeads === 1
          ? "1 lead nuevo sin contactar"
          : `${metrics.newLeads} leads nuevos sin contactar`,
      href: "/pipeline",
      icon: Flame,
      tone: "bg-sky-50 text-sky-600",
    },
    {
      key: "agents",
      count: disabledAgents,
      label:
        disabledAgents === 1
          ? "1 agente está desactivado"
          : `${disabledAgents} agentes están desactivados`,
      href: "/agents",
      icon: AlertTriangle,
      tone: "bg-orange-50 text-orange-600",
    },
  ];
  const active = items.filter((i) => i.count > 0);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-neutral-700">
          Necesita tu atención
        </h2>
      </div>
      {active.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-neutral-500">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          Todo al día. No tienes nada pendiente. 🎉
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {active.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 focus:outline-none focus-visible:bg-neutral-50"
              >
                <span className={cn("rounded-lg p-2", item.tone)}>
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-medium text-neutral-800">
                  {item.label}
                </span>
                <ArrowRight className="h-4 w-4 text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-500" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Today's agenda ───
function TodayAgenda({ appointments }: { appointments: Appointment[] }) {
  return (
    <ChartCard title="Agenda de hoy" href="/calendar" linkLabel="Ver calendario">
      {appointments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CalendarDays className="h-8 w-8 text-neutral-300" />
          <p className="text-sm text-neutral-400">No hay citas para hoy</p>
          <Link
            href="/calendar?new=1"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            + Nueva cita
          </Link>
        </div>
      ) : (
        <ul className="-my-1 divide-y divide-neutral-100">
          {appointments.map((a) => {
            const meta = APPT_STATUS_META[a.status];
            const cancelled = a.status === "cancelled";
            return (
              <li key={a.id}>
                <Link
                  href={
                    a.contactId ? `/contacts/${a.contactId}` : "/calendar"
                  }
                  className="group flex items-center gap-3 py-2.5 hover:bg-neutral-50 focus:outline-none focus-visible:bg-neutral-50"
                >
                  <span className="w-24 flex-shrink-0 text-xs font-semibold text-neutral-700">
                    {format(parseISO(a.startsAt), "HH:mm")}–
                    {format(parseISO(a.endsAt), "HH:mm")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-medium",
                        cancelled
                          ? "text-neutral-400 line-through"
                          : "text-neutral-900",
                      )}
                    >
                      {a.contact?.name ?? "Contacto"}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {a.service}
                    </span>
                  </span>
                  <Badge variant={meta.variant} className="flex-shrink-0">
                    {meta.label}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

// ─── Recent conversations ───
function RecentConversations({
  conversations,
  loading,
}: {
  conversations: Conversation[];
  loading: boolean;
}) {
  const channelLabel = (channel: string) =>
    channel === "whatsapp"
      ? "WhatsApp"
      : channel === "widget"
      ? "Widget Web"
      : channel === "playground"
      ? "Playground"
      : channel;

  return (
    <ChartCard title="Conversaciones recientes" href="/conversations">
      {loading ? (
        <div className="py-6 text-sm text-neutral-400">Cargando…</div>
      ) : conversations.length === 0 ? (
        <div className="py-6 text-center text-sm text-neutral-400">
          Aún no hay conversaciones
        </div>
      ) : (
        <ul className="-my-1 divide-y divide-neutral-100">
          {conversations.map((c) => {
            const unread = c.unreadCount > 0;
            return (
              <li key={c.threadId}>
                <Link
                  href={`/conversations?thread=${encodeURIComponent(c.threadId)}`}
                  className="group flex items-center gap-3 py-2.5 hover:bg-neutral-50 focus:outline-none focus-visible:bg-neutral-50"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                    {(c.contact?.name ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-sm text-neutral-900",
                          unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {c.contact?.name ?? "Desconocido"}
                      </span>
                      <Badge
                        variant={c.channel === "whatsapp" ? "success" : "info"}
                      >
                        {channelLabel(c.channel)}
                      </Badge>
                    </div>
                    <p
                      className={cn(
                        "truncate text-xs",
                        unread ? "text-neutral-700" : "text-neutral-500",
                      )}
                    >
                      {c.lastMessage.direction === "outbound" ? "Tú: " : ""}
                      {c.lastMessage.body}
                    </p>
                  </div>
                  {unread ? (
                    <span className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                      {c.unreadCount}
                    </span>
                  ) : c.lastMessage.createdAt ? (
                    <span className="flex-shrink-0 text-xs text-neutral-400">
                      {format(parseISO(c.lastMessage.createdAt), "HH:mm", {
                        locale: es,
                      })}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

// ─── Pipeline mini-funnel ───
function PipelineSnapshot({ pipeline }: { pipeline: PipelineStageTotal[] }) {
  const total = pipeline.reduce((s, p) => s + p.total, 0);
  if (total === 0) return null;
  const funnelStages = PIPELINE_STAGES.filter((s) => s !== "lost");

  return (
    <ChartCard title="Embudo de ventas" href="/pipeline" linkLabel="Ver embudo">
      <Link href="/pipeline" className="block focus:outline-none">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100">
          {pipeline
            .filter((p) => p.total > 0)
            .map((p) => (
              <div
                key={p.stage}
                className={cn("h-full", PIPELINE_STAGE_META[p.stage].dot)}
                style={{ width: `${(p.total / total) * 100}%` }}
                title={`${PIPELINE_STAGE_META[p.stage].label}: ${p.total}`}
              />
            ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {funnelStages.map((stage) => {
            const item = pipeline.find((p) => p.stage === stage);
            return (
              <span
                key={stage}
                className="flex items-center gap-1.5 text-xs text-neutral-600"
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-sm",
                    PIPELINE_STAGE_META[stage].dot,
                  )}
                />
                {PIPELINE_STAGE_META[stage].label}
                <span className="font-semibold text-neutral-900">
                  {item?.total ?? 0}
                </span>
              </span>
            );
          })}
        </div>
      </Link>
    </ChartCard>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (): Promise<DashboardData | null> => {
    try {
      const [m, c, t, p] = await Promise.all([
        apiFetch<DashboardMetrics>("/api/dashboard/metrics"),
        apiFetch<ConversationPage>("/api/conversations?limit=8"),
        apiFetch<Appointment[]>("/api/appointments/today"),
        apiFetch<PipelineStageTotal[]>("/api/contacts/board/summary"),
      ]);
      return { metrics: m, conversations: c.items, today: t, pipeline: p };
    } catch {
      return null; // backend no disponible — mantener estado actual
    }
  }, []);

  const refreshData = useCallback(async () => {
    const next = await loadData();
    if (next) setData(next);
  }, [loadData]);

  useEffect(() => {
    loadData().then((next) => {
      if (next) setData(next);
      setLoading(false);
    });
  }, [loadData]);

  useEvents({
    "message.received": () => refreshData(),
    "message.sent": () => refreshData(),
    "conversation.updated": () => refreshData(),
    "appointment.created": () => refreshData(),
    "contact.updated": () => refreshData(),
  });

  const metrics = data?.metrics;
  const firstName = (user?.name ?? "").split(" ")[0];

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">
            {firstName ? `Hola, ${firstName}` : "Inicio"}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Resumen de la actividad de tu negocio
          </p>
        </div>
        <QuickActions unread={metrics?.unreadConversations ?? 0} />
      </div>

      {/* KPI strip — clickable, 0 is a real value */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Citas hoy"
          value={metrics?.appointmentsToday ?? "—"}
          icon={CalendarDays}
          color="bg-green-50 text-green-600"
          href="/calendar"
        />
        <StatCard
          label="Sin leer"
          value={metrics?.unreadConversations ?? "—"}
          icon={Inbox}
          color="bg-red-50 text-red-600"
          href="/conversations"
          emphasis={(metrics?.unreadConversations ?? 0) > 0}
        />
        <StatCard
          label="En modo manual"
          value={metrics?.handoffConversations ?? "—"}
          icon={UserCog}
          color="bg-amber-50 text-amber-600"
          href="/conversations"
          emphasis={(metrics?.handoffConversations ?? 0) > 0}
        />
        <StatCard
          label="Contactos"
          value={metrics?.contactsCount ?? "—"}
          icon={Users}
          color="bg-indigo-50 text-indigo-600"
          href="/contacts"
        />
      </div>

      {metrics && (
        <div className="mt-6">
          <AttentionQueue metrics={metrics} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TodayAgenda appointments={data?.today ?? []} />
        <RecentConversations
          conversations={data?.conversations ?? []}
          loading={loading}
        />
      </div>

      {data && data.pipeline.length > 0 && (
        <div className="mt-4">
          <PipelineSnapshot pipeline={data.pipeline} />
        </div>
      )}
    </div>
  );
}
