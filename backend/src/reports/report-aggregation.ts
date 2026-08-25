import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

/**
 * Pure, unit-tested analytics aggregation. No Nest, no DB, no clock — the service
 * fetches the rows in range and hands them here. All day/hour bucketing happens
 * in the **business timezone** (like `AppointmentsService.countToday`), so charts
 * aren't shifted 1–2h vs the container's UTC.
 */

export type ApptStatus = 'scheduled' | 'completed' | 'cancelled';
export type MsgDirection = 'inbound' | 'outbound';

export interface ApptRow {
  startsAt: Date;
  status: ApptStatus;
  service: string;
  // Optional list price — TypeORM numeric comes back as a string (or null).
  price: string | null;
}
export interface MessageRow {
  createdAt: Date;
  direction: MsgDirection;
}
export interface NewContactRow {
  createdAt: Date;
}
export interface ContactsByStatus {
  lead: number;
  active: number;
  inactive: number;
}
export interface PipelineStageCounts {
  new: number;
  contacted: number;
  qualified: number;
  booked: number;
  won: number;
  lost: number;
}
/** A row of the grouped `Contact.source` query (raw, possibly case-variant). */
export interface SourceRow {
  source: string | null;
  total: number;
  converted: number; // reached pipelineStage booked|won
}

export interface ServiceStat {
  service: string;
  total: number;
  completed: number;
  cancelled: number;
  revenue: number; // list price of non-cancelled, 0 when prices unset
}
export interface SourceStat {
  source: string; // display label ("Sin origen" / "Otros" for the tail)
  total: number;
  converted: number;
}
export interface FunnelStep {
  key: 'leads' | 'contacted' | 'qualified' | 'booked' | 'won';
  count: number; // contacts at-or-beyond this funnel stage (excludes 'lost')
}
export interface TrendPoint {
  current: number;
  previous: number;
  delta: number; // current - previous
  direction: 'up' | 'down' | 'flat';
  good: boolean | null; // true=good, false=bad, null=undecidable/neutral
}
export interface PreviousTotals {
  appointments: { total: number; completed: number; cancelled: number };
  newContacts: number;
}
export interface ReportTrends {
  appointments: TrendPoint;
  completionRate: TrendPoint;
  cancellationRate: TrendPoint;
  newContacts: TrendPoint;
}

export interface ReportSummary {
  range: { from: string; to: string };
  appointments: {
    total: number;
    byStatus: { scheduled: number; completed: number; cancelled: number };
    completionRate: number; // completed / total (0–1)
    cancellationRate: number; // cancelled / total (0–1)
    byDay: { date: string; scheduled: number; completed: number; cancelled: number }[];
    byHour: number[]; // 24 buckets, business-timezone hour of `startsAt`
    byService: ServiceStat[]; // top 8 by count + an "Otros" bucket
    revenue: { total: number; byDay: { date: string; amount: number }[] };
  };
  contacts: {
    byStatus: ContactsByStatus;
    total: number;
    conversionRate: number; // active / total (0–1)
    newByDay: { date: string; count: number }[];
    byPipelineStage: PipelineStageCounts; // current snapshot (not range-bound)
    bySource: SourceStat[]; // top 6 by count + "Otros"; "Sin origen" kept apart
  };
  messages: {
    total: number;
    inbound: number;
    outbound: number;
    byDay: { date: string; inbound: number; outbound: number }[];
  };
  // Current-vs-previous-window deltas for the KPI strip. Attached by the service.
  funnel: FunnelStep[];
  trends?: ReportTrends;
}

/** `yyyy-MM-dd` for a date, in the business timezone. */
export function dayKey(date: Date, timezone: string): string {
  return format(new TZDate(date, timezone), 'yyyy-MM-dd');
}

/** Hour-of-day (0–23) for a date, in the business timezone. */
export function hourOf(date: Date, timezone: string): number {
  return new TZDate(date, timezone).getHours();
}

/**
 * Inclusive list of `yyyy-MM-dd` day keys (business tz) from `from` to `to`, so a
 * chart shows continuous days even where there's no data. Steps by 24h and dedups
 * by key, which tolerates DST transitions.
 */
export function enumerateDays(from: Date, to: Date, timezone: string): string[] {
  const days: string[] = [];
  const seen = new Set<string>();
  const push = (d: Date) => {
    const k = dayKey(d, timezone);
    if (!seen.has(k)) {
      seen.add(k);
      days.push(k);
    }
  };
  const end = to.getTime();
  for (let t = from.getTime(); t <= end; t += 24 * 60 * 60 * 1000) {
    push(new Date(t));
  }
  push(to); // guarantee the final day is present
  return days;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Parse a numeric-string price to a non-negative number (NaN/null → 0). */
function parsePrice(price: string | null): number {
  if (!price) return 0;
  const n = Number(price);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const TOP_SERVICES = 8;
const TOP_SOURCES = 6;

/** Top-N-by-count service breakdown with the tail collapsed into "Otros". */
export function buildServiceStats(appointments: ApptRow[]): ServiceStat[] {
  const map = new Map<string, ServiceStat>();
  for (const a of appointments) {
    const name = (a.service || '—').trim() || '—';
    const s =
      map.get(name) ??
      { service: name, total: 0, completed: 0, cancelled: 0, revenue: 0 };
    s.total++;
    if (a.status === 'completed') s.completed++;
    if (a.status === 'cancelled') s.cancelled++;
    if (a.status !== 'cancelled') s.revenue += parsePrice(a.price);
    map.set(name, s);
  }
  const sorted = [...map.values()].sort(
    (x, y) => y.total - x.total || x.service.localeCompare(y.service),
  );
  if (sorted.length <= TOP_SERVICES) return sorted;
  const top = sorted.slice(0, TOP_SERVICES);
  const rest = sorted.slice(TOP_SERVICES);
  const otros = rest.reduce(
    (acc, s) => ({
      service: 'Otros',
      total: acc.total + s.total,
      completed: acc.completed + s.completed,
      cancelled: acc.cancelled + s.cancelled,
      revenue: acc.revenue + s.revenue,
    }),
    { service: 'Otros', total: 0, completed: 0, cancelled: 0, revenue: 0 },
  );
  return [...top, otros];
}

/** Normalise a free-text source; empty → the "Sin origen" bucket. */
function normalizeSourceLabel(source: string | null): string {
  const t = (source ?? '').trim();
  if (!t) return 'Sin origen';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Source attribution, case-insensitively merged (Instagram == instagram), top 6
 * by count + an "Otros" bucket. "Sin origen" is kept as its own row (never rolled
 * into Otros) so a large no-source bucket is honestly visible.
 */
export function buildSourceStats(rows: SourceRow[]): SourceStat[] {
  const map = new Map<string, SourceStat>(); // key = lower-cased label
  for (const r of rows) {
    const label = normalizeSourceLabel(r.source);
    const key = label.toLowerCase();
    const s = map.get(key) ?? { source: label, total: 0, converted: 0 };
    s.total += r.total;
    s.converted += r.converted;
    map.set(key, s);
  }
  const none = map.get('sin origen');
  const named = [...map.values()].filter((s) => s.source !== 'Sin origen');
  named.sort((x, y) => y.total - x.total || x.source.localeCompare(y.source));

  let head = named;
  let otros: SourceStat | null = null;
  if (named.length > TOP_SOURCES) {
    head = named.slice(0, TOP_SOURCES);
    otros = named.slice(TOP_SOURCES).reduce(
      (acc, s) => ({
        source: 'Otros',
        total: acc.total + s.total,
        converted: acc.converted + s.converted,
      }),
      { source: 'Otros', total: 0, converted: 0 },
    );
  }

  // Merge duplicate labels so the result always has unique `source` values — a
  // contact source literally named "Otros" would otherwise collide with the
  // aggregated tail bucket and render two rows with the same React key.
  const deduped = new Map<string, SourceStat>();
  for (const s of [...head, ...(otros ? [otros] : []), ...(none ? [none] : [])]) {
    const existing = deduped.get(s.source);
    if (existing) {
      existing.total += s.total;
      existing.converted += s.converted;
    } else {
      deduped.set(s.source, { ...s });
    }
  }
  return [...deduped.values()];
}

/**
 * Cumulative "at-or-beyond" funnel from a pipeline-stage snapshot (excludes the
 * terminal `lost`). Monotonically non-increasing leads → won, so it never renders
 * as a broken funnel and each step's ratio to the one above is a real pass-rate.
 */
export function buildConversionFunnel(s: PipelineStageCounts): FunnelStep[] {
  const won = s.won;
  const booked = s.booked + won;
  const qualified = s.qualified + booked;
  const contacted = s.contacted + qualified;
  const leads = s.new + contacted;
  return [
    { key: 'leads', count: leads },
    { key: 'contacted', count: contacted },
    { key: 'qualified', count: qualified },
    { key: 'booked', count: booked },
    { key: 'won', count: won },
  ];
}

/** A single current-vs-previous trend point with correct good/bad semantics. */
export function computeTrend(
  current: number,
  previous: number,
  higherIsBetter: boolean,
): TrendPoint {
  const delta = round(current - previous);
  const direction: TrendPoint['direction'] =
    delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  let good: boolean | null;
  if (delta === 0) good = null;
  else good = higherIsBetter ? delta > 0 : delta < 0;
  return { current: round(current), previous: round(previous), delta, direction, good };
}

/** The four KPI trends for the report header. */
export function computeTrends(
  summary: ReportSummary,
  prev: PreviousTotals,
): ReportTrends {
  const a = summary.appointments;
  const prevTotal = prev.appointments.total;
  const prevCompletionRate = prevTotal
    ? prev.appointments.completed / prevTotal
    : 0;
  const prevCancellationRate = prevTotal
    ? prev.appointments.cancelled / prevTotal
    : 0;
  return {
    appointments: computeTrend(a.total, prevTotal, true),
    completionRate: computeTrend(a.completionRate, prevCompletionRate, true),
    cancellationRate: computeTrend(
      a.cancellationRate,
      prevCancellationRate,
      false,
    ),
    newContacts: computeTrend(
      summary.contacts.newByDay.reduce((s, d) => s + d.count, 0),
      prev.newContacts,
      true,
    ),
  };
}

export function buildReportSummary(
  input: {
    appointments: ApptRow[];
    messages: MessageRow[];
    newContacts: NewContactRow[];
    contactsByStatus: ContactsByStatus;
    pipelineStageCounts: PipelineStageCounts;
    sources: SourceRow[];
  },
  from: Date,
  to: Date,
  timezone: string,
): ReportSummary {
  const days = enumerateDays(from, to, timezone);

  // ─── Appointments ───
  const apptByStatus = { scheduled: 0, completed: 0, cancelled: 0 };
  const apptDay = new Map<string, { scheduled: number; completed: number; cancelled: number }>();
  const revenueDay = new Map<string, number>();
  const byHour = new Array<number>(24).fill(0);
  let revenueTotal = 0;
  for (const a of input.appointments) {
    apptByStatus[a.status]++;
    const key = dayKey(a.startsAt, timezone);
    const bucket =
      apptDay.get(key) ?? { scheduled: 0, completed: 0, cancelled: 0 };
    bucket[a.status]++;
    apptDay.set(key, bucket);
    byHour[hourOf(a.startsAt, timezone)]++;
    if (a.status !== 'cancelled') {
      const amount = parsePrice(a.price);
      if (amount > 0) {
        revenueTotal += amount;
        revenueDay.set(key, (revenueDay.get(key) ?? 0) + amount);
      }
    }
  }
  const apptTotal = input.appointments.length;

  // ─── Messages ───
  let inbound = 0;
  let outbound = 0;
  const msgDay = new Map<string, { inbound: number; outbound: number }>();
  for (const m of input.messages) {
    if (m.direction === 'inbound') inbound++;
    else outbound++;
    const key = dayKey(m.createdAt, timezone);
    const bucket = msgDay.get(key) ?? { inbound: 0, outbound: 0 };
    bucket[m.direction]++;
    msgDay.set(key, bucket);
  }

  // ─── New contacts ───
  const newDay = new Map<string, number>();
  for (const c of input.newContacts) {
    const key = dayKey(c.createdAt, timezone);
    newDay.set(key, (newDay.get(key) ?? 0) + 1);
  }

  const contactsTotal =
    input.contactsByStatus.lead +
    input.contactsByStatus.active +
    input.contactsByStatus.inactive;

  return {
    range: { from: dayKey(from, timezone), to: dayKey(to, timezone) },
    appointments: {
      total: apptTotal,
      byStatus: apptByStatus,
      completionRate: apptTotal ? round(apptByStatus.completed / apptTotal) : 0,
      cancellationRate: apptTotal ? round(apptByStatus.cancelled / apptTotal) : 0,
      byDay: days.map((date) => ({
        date,
        ...(apptDay.get(date) ?? { scheduled: 0, completed: 0, cancelled: 0 }),
      })),
      byHour,
      byService: buildServiceStats(input.appointments),
      revenue: {
        total: round(revenueTotal),
        byDay: days.map((date) => ({
          date,
          amount: round(revenueDay.get(date) ?? 0),
        })),
      },
    },
    contacts: {
      byStatus: input.contactsByStatus,
      total: contactsTotal,
      conversionRate: contactsTotal
        ? round(input.contactsByStatus.active / contactsTotal)
        : 0,
      newByDay: days.map((date) => ({ date, count: newDay.get(date) ?? 0 })),
      byPipelineStage: input.pipelineStageCounts,
      bySource: buildSourceStats(input.sources),
    },
    messages: {
      total: inbound + outbound,
      inbound,
      outbound,
      byDay: days.map((date) => ({
        date,
        ...(msgDay.get(date) ?? { inbound: 0, outbound: 0 }),
      })),
    },
    funnel: buildConversionFunnel(input.pipelineStageCounts),
  };
}
