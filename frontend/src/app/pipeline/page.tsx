"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Phone, CalendarClock, Ban } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { apiFetch } from "@/lib/api";
import { BoardCard, BoardData, PipelineStage } from "@/lib/types";
import { PIPELINE_STAGES, PIPELINE_STAGE_META } from "@/lib/pipeline";
import { CONTACT_STATUS_META } from "@/lib/contacts";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/contexts/ToastContext";
import { useEvents } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";

type Columns = Record<PipelineStage, BoardCard[]>;

function emptyColumns(): Columns {
  return { new: [], contacted: [], qualified: [], booked: [], won: [], lost: [] };
}

/** The stage a card/column id belongs to (a stage key is itself a droppable id). */
function findColumnIn(cols: Columns, id: string): PipelineStage | null {
  if (id in cols) return id as PipelineStage;
  for (const stage of PIPELINE_STAGES) {
    if (cols[stage].some((c) => c.id === id)) return stage;
  }
  return null;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function CardBody({ card }: { card: BoardCard }) {
  const status = CONTACT_STATUS_META[card.status];
  const stage = PIPELINE_STAGE_META[card.pipelineStage ?? "new"];
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 border-l-4 bg-white p-2.5 shadow-sm",
        stage.border,
      )}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
          {card.name}
        </p>
        {card.optedOut && (
          <span
            title="Baja (opt-out)"
            className="inline-flex shrink-0 items-center gap-0.5 rounded bg-rose-50 px-1 py-0.5 text-[10px] font-medium text-rose-600"
          >
            <Ban className="h-3 w-3" /> Baja
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
        <Phone className="h-3 w-3 shrink-0" />
        <span className="truncate">{card.phone}</span>
      </div>

      {card.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {card.nextAppointment && (
        <div className="mt-1.5 flex items-center gap-1 rounded bg-amber-50 px-1.5 py-1 text-[11px] text-amber-700">
          <CalendarClock className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {card.nextAppointment.service} ·{" "}
            {format(new Date(card.nextAppointment.startsAt), "d MMM HH:mm", {
              locale: es,
            })}
          </span>
        </div>
      )}

      <div className="mt-1.5">
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
    </div>
  );
}

function SortableCard({
  card,
  onOpen,
}: {
  card: BoardCard;
  onOpen: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onOpen(card.id);
      }}
      className={cn(
        "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <CardBody card={card} />
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function Column({
  stage,
  cards,
  onOpen,
}: {
  stage: PipelineStage;
  cards: BoardCard[];
  onOpen: (id: string) => void;
}) {
  const meta = PIPELINE_STAGE_META[stage];
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
        <h2 className={cn("text-sm font-semibold", meta.headerText)}>
          {meta.label}
        </h2>
        <span className="rounded-full bg-neutral-100 px-1.5 text-xs font-medium text-neutral-500">
          {cards.length}
        </span>
      </div>

      <SortableContext
        items={cards.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-32 flex-1 flex-col gap-2 rounded-xl border p-2 transition-colors",
            isOver
              ? "border-indigo-300 bg-indigo-50/50"
              : "border-neutral-200 bg-neutral-50",
          )}
        >
          {cards.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-neutral-400">
              {meta.hint}
            </p>
          ) : (
            cards.map((card) => (
              <SortableCard key={card.id} card={card} onOpen={onOpen} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";

export default function PipelinePage() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const [columns, setColumns] = useState<Columns>(emptyColumns);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Refs mirror state so the drag handlers always read the latest board without
  // stale closures (drag events fire faster than React re-renders).
  const columnsRef = useRef<Columns>(columns);
  const activeIdRef = useRef<string | null>(null);
  const originStageRef = useRef<PipelineStage | null>(null);
  // Ids whose move is still being persisted. The board must not refetch while a
  // drag is active OR a persist is in flight (the server may not have committed
  // yet — a refetch would snap the card back).
  const persistingRef = useRef<Set<string>>(new Set());

  const isBusy = () =>
    activeIdRef.current !== null || persistingRef.current.size > 0;

  const applyColumns = (next: Columns) => {
    columnsRef.current = next;
    setColumns(next);
  };

  const load = () => {
    apiFetch<BoardData>("/api/contacts/board")
      .then((data) => {
        // Never overwrite the board mid-drag or mid-persist (an SSE echo could
        // resolve before the move commits). The next event / reload reconciles.
        if (isBusy()) return;
        const cols = emptyColumns();
        for (const col of data.stages) cols[col.stage] = col.items;
        applyColumns(cols);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live refresh when a contact changes or a booking auto-advances a lead — but
  // never mid-drag (it would yank the board out from under the pointer).
  useEvents({
    "contact.updated": () => {
      if (!isBusy()) load();
    },
    "appointment.created": () => {
      if (!isBusy()) load();
    },
  });

  const sensors = useSensors(
    // A small distance so a click (to open the contact) isn't read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    activeIdRef.current = id;
    originStageRef.current = findColumnIn(columnsRef.current, id);
    setActiveId(id);
  }

  // Live-move the dragged card between columns for visual feedback.
  function onDragOver(e: DragOverEvent) {
    const { over, active } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const cur = columnsRef.current;
    const from = findColumnIn(cur, activeId);
    const to = findColumnIn(cur, overId);
    if (!from || !to || from === to) return;

    const fromItems = cur[from];
    const toItems = cur[to];
    const activeIndex = fromItems.findIndex((c) => c.id === activeId);
    if (activeIndex < 0) return;

    const moved = { ...fromItems[activeIndex], pipelineStage: to };
    const overIsColumn = overId in cur;
    const overIndex = toItems.findIndex((c) => c.id === overId);
    const insertAt = overIsColumn || overIndex < 0 ? toItems.length : overIndex;

    applyColumns({
      ...cur,
      [from]: fromItems.filter((c) => c.id !== activeId),
      [to]: [...toItems.slice(0, insertAt), moved, ...toItems.slice(insertAt)],
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    activeIdRef.current = null;
    setActiveId(null);

    const cur = columnsRef.current;
    const stage = findColumnIn(cur, activeId);
    const origin = originStageRef.current;
    originStageRef.current = null;
    if (!stage) return;

    // Reorder ONLY on a pure same-column drag. A cross-column move was already
    // positioned by onDragOver — re-running arrayMove here would land it one slot
    // off (the card is already inserted next to the drop target).
    let next = cur;
    const over = e.over;
    if (over && stage === origin) {
      const overId = String(over.id);
      const overStage = findColumnIn(cur, overId);
      if (overStage === stage && overId !== activeId && !(overId in cur)) {
        const items = cur[stage];
        const fromIdx = items.findIndex((c) => c.id === activeId);
        const toIdx = items.findIndex((c) => c.id === overId);
        if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
          next = { ...cur, [stage]: arrayMove(items, fromIdx, toIdx) };
        }
      }
    }

    // Persist the whole target column's new order; the server renumbers it to
    // clean integer positions (no client-side float math to exhaust).
    const withStage: Columns = {
      ...next,
      [stage]: next[stage].map((c) =>
        c.id === activeId ? { ...c, pipelineStage: stage } : c,
      ),
    };
    applyColumns(withStage);
    void persist(activeId, stage, withStage[stage].map((c) => c.id));
  }

  async function persist(
    id: string,
    stage: PipelineStage,
    orderedIds: string[],
  ) {
    // Hold the refetch guard until the move commits, not just until the drop.
    persistingRef.current.add(id);
    try {
      await apiFetch(`/api/contacts/board/reorder`, {
        method: "POST",
        body: JSON.stringify({ stage, orderedIds }),
      });
    } catch {
      toast.error("No se pudo mover la tarjeta.");
    } finally {
      persistingRef.current.delete(id);
      if (!isBusy()) load(); // reconcile with server truth (also reverts on error)
    }
  }

  const activeCard = activeId
    ? PIPELINE_STAGES.flatMap((s) => columns[s]).find((c) => c.id === activeId)
    : null;

  const totalLeads = PIPELINE_STAGES.reduce(
    (n, s) => n + columns[s].length,
    0,
  );

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
              El embudo global de captación de leads es gestionado por administración comercial. Puedes consultar tus pacientes en Contactos o tu Calendario de citas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-4 sm:p-8">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-neutral-900">Embudo</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Arrastra los contactos entre columnas para gestionar tu embudo de
          captación. {totalLeads} contacto{totalLeads === 1 ? "" : "s"}.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-400">Cargando embudo…</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map((stage) => (
              <Column
                key={stage}
                stage={stage}
                cards={columns[stage]}
                onOpen={(id) => router.push(`/contacts/${id}`)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeCard ? (
              <div className="w-72 rotate-2 cursor-grabbing">
                <CardBody card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
