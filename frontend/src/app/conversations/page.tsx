"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  MessageSquare,
  Globe,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Send,
  UserCog,
  Bot,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { apiFetch, apiUrl, ApiError } from "@/lib/api";
import {
  Conversation,
  ConversationPage,
  Message,
  MessageStatus,
} from "@/lib/types";
import { useEvents } from "@/hooks/useEvents";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// Bare placeholders the backend stores in `body` for caption-less media (so the
// inbox preview isn't blank). Mirror `inbound-parser.ts`; when the media itself
// renders in the bubble we hide these, but keep any real caption / filename.
const MEDIA_PLACEHOLDERS = new Set([
  "📷 Imagen",
  "🎤 Mensaje de voz",
  "🎬 Vídeo",
  "📄 Documento",
  "💟 Sticker",
]);
function isMediaPlaceholder(body: string): boolean {
  return MEDIA_PLACEHOLDERS.has(body) || body.startsWith("📄 ");
}

// Delivery status indicator shown on outbound WhatsApp messages.
function StatusTicks({ status }: { status?: MessageStatus }) {
  if (!status) return null;
  switch (status) {
    case "queued":
      return <Clock className="h-3 w-3" aria-label="Enviando" />;
    case "sent":
      return <Check className="h-3 w-3" aria-label="Enviado" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3" aria-label="Entregado" />;
    case "read":
      return (
        <CheckCheck className="h-3 w-3 text-sky-300" aria-label="Leído" />
      );
    case "failed":
      return (
        <span className="flex items-center gap-0.5 text-red-300">
          <AlertCircle className="h-3 w-3" /> No entregado
        </span>
      );
    default:
      return null;
  }
}

// Renders an inbound message's media. The bytes come from the authenticated
// proxy (/api/conversations/media/:id) fetched WITH the auth cookie, turned into
// a blob object-URL — this works cross-origin where an <img src> couldn't send
// the cookie, and keeps the customer's media private (operators only).
function MediaAttachment({ message }: { message: Message }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!message.mediaType) return;
    let active = true;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/conversations/media/${message.id}`),
          { credentials: "include" }
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        objectUrl = URL.createObjectURL(await res.blob());
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id, message.mediaType]);

  if (!message.mediaType) return null;

  if (failed) {
    return (
      <div className="mb-1 flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-2 text-xs text-neutral-500">
        <AlertCircle className="h-3.5 w-3.5" /> No se pudo cargar el archivo
      </div>
    );
  }

  if (!url) {
    return (
      <div className="mb-1 rounded-lg bg-neutral-100 px-2.5 py-3 text-xs text-neutral-400">
        Cargando archivo…
      </div>
    );
  }

  switch (message.mediaType) {
    case "image":
    case "sticker":
      return (
        // A blob: object-URL can't be optimized by next/image (it needs a
        // static/remote src), so a plain <img> is correct here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={message.mediaFilename ?? "Imagen recibida"}
          className="mb-1 max-h-64 w-auto rounded-lg"
        />
      );
    case "audio":
      return <audio controls src={url} className="mb-1 w-full max-w-[260px]" />;
    case "video":
      return (
        <video controls src={url} className="mb-1 max-h-64 w-auto rounded-lg" />
      );
    case "document":
    default:
      return (
        <a
          href={url}
          download={message.mediaFilename ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-100"
        >
          <FileText className="h-4 w-4 flex-shrink-0 text-neutral-500" />
          <span className="truncate">
            {message.mediaFilename ?? "Documento"}
          </span>
          <Download className="ml-auto h-3.5 w-3.5 flex-shrink-0" />
        </a>
      );
  }
}

import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";

const PAGE_SIZE = 30;

function ConversationsPageInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  // Deep-link: /conversations?thread=<id> (from the dashboard) opens that thread.
  const [selected, setSelected] = useState<string | null>(
    () => searchParams.get("thread"),
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadedThread, setLoadedThread] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Spinner shown while the selected thread's messages haven't loaded yet.
  const loadingMessages = selected !== null && selected !== loadedThread;

  // Pure loader — fetches the CURRENT page (so an SSE refresh re-pulls just this
  // page, not every thread).
  const loadThreads = useCallback(async (): Promise<ConversationPage | null> => {
    try {
      return await apiFetch<ConversationPage>(
        `/api/conversations?limit=${PAGE_SIZE}&offset=${offset}`
      );
    } catch {
      return null; // mantener lista actual
    }
  }, [offset]);

  const refreshThreads = useCallback(async () => {
    const page = await loadThreads();
    if (page) {
      setThreads(page.items);
      setTotal(page.total);
    }
  }, [loadThreads]);

  const loadMessages = useCallback(
    async (threadId: string): Promise<Message[]> => {
      try {
        return await apiFetch<Message[]>(
          `/api/conversations/${threadId}/messages`
        );
      } catch {
        return [];
      }
    },
    []
  );

  // Clear the unread badge once the operator opens a thread (fire-and-forget).
  const markRead = useCallback(async (threadId: string) => {
    try {
      await apiFetch(`/api/conversations/${threadId}/read`, { method: "POST" });
    } catch {
      // best-effort — a failed read-receipt isn't worth interrupting the user
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadThreads().then((page) => {
      if (cancelled) return;
      if (page) {
        setThreads(page.items);
        setTotal(page.total);
      }
      setLoadingThreads(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadThreads]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    loadMessages(selected).then((data) => {
      if (cancelled) return;
      setMessages(data);
      setLoadedThread(selected);
      // Opening the thread reads it: clear unread locally + on the server.
      setThreads((prev) =>
        prev.map((t) =>
          t.threadId === selected ? { ...t, unreadCount: 0 } : t
        )
      );
      markRead(selected);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, loadMessages, markRead]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEvents({
    "message.received": (data) => {
      refreshThreads();
      const msg = data as { threadId?: string };
      if (msg?.threadId === selected) {
        loadMessages(selected).then(setMessages);
      }
    },
    "message.sent": (data) => {
      refreshThreads();
      const msg = data as { threadId?: string };
      if (msg?.threadId === selected) {
        loadMessages(selected).then(setMessages);
      }
    },
    // A delivery/read status changed — refresh the open thread's ticks.
    "message.status": () => {
      if (selected) loadMessages(selected).then(setMessages);
    },
    // Unread/handoff changed on some thread — refresh the list.
    "conversation.updated": () => {
      refreshThreads();
    },
  });

  const selectedThread = threads.find((t) => t.threadId === selected);
  const isWhatsapp = selectedThread?.channel === "whatsapp";

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  function ChannelBadge({ channel }: { channel: string }) {
    if (channel === "whatsapp") {
      return (
        <Badge variant="success" className="gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200">
          <MessageSquare className="h-3 w-3 text-emerald-600" /> WhatsApp
        </Badge>
      );
    }
    if (channel === "widget") {
      return (
        <Badge variant="info" className="gap-1 bg-purple-50 text-purple-700 border border-purple-200">
          <Globe className="h-3 w-3 text-purple-600" /> Web Landing
        </Badge>
      );
    }
    return (
      <Badge variant="default" className="gap-1">
        <Bot className="h-3 w-3 text-neutral-500" /> Playground
      </Badge>
    );
  }

  async function toggleHandoff() {
    if (!selectedThread) return;
    const next = !selectedThread.handoff;
    setHandoffBusy(true);
    try {
      await apiFetch(`/api/conversations/${selectedThread.threadId}/handoff`, {
        method: "PATCH",
        body: JSON.stringify({ handoff: next }),
      });
      setThreads((prev) =>
        prev.map((t) =>
          t.threadId === selectedThread.threadId ? { ...t, handoff: next } : t
        )
      );
      toast.success(
        next
          ? "Has tomado el control: el agente no responderá en esta conversación."
          : "El agente vuelve a responder en esta conversación."
      );
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo cambiar el modo"
      );
    } finally {
      setHandoffBusy(false);
    }
  }

  async function sendManual() {
    const body = draft.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    try {
      await apiFetch(`/api/conversations/${selected}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setDraft("");
      const data = await loadMessages(selected);
      setMessages(data);
      refreshThreads();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo enviar el mensaje"
      );
    } finally {
      setSending(false);
    }
  }

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
              La bandeja global de mensajería multicanal es operada por agentes y atención general. Puedes consultar tus citas asignadas en el Calendario.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Thread list — full-width on mobile, a fixed column from md up. Hidden on
          mobile once a thread is open (the message pane takes over). */}
      <div
        className={cn(
          "w-full flex-col border-r border-neutral-200 bg-white md:flex md:w-72",
          selected ? "hidden md:flex" : "flex"
        )}
      >
        <div className="border-b border-neutral-100 px-4 py-3">
          <h1 className="text-sm font-semibold text-neutral-900">
            Conversaciones
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <div className="p-4 text-xs text-neutral-400">Cargando…</div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-400">
              Aún no hay conversaciones
            </div>
          ) : (
            threads.map((t) => {
              const unread = t.unreadCount > 0;
              return (
                <button
                  key={t.threadId}
                  onClick={() => setSelected(t.threadId)}
                  className={cn(
                    "w-full border-b border-neutral-50 px-4 py-3 text-left hover:bg-neutral-50",
                    selected === t.threadId && "bg-indigo-50"
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        "truncate text-sm text-neutral-900",
                        unread ? "font-semibold" : "font-medium"
                      )}
                    >
                      {t.contact?.name ?? t.threadId}
                    </span>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {t.handoff && (
                        <Badge variant="warning" className="gap-0.5">
                          <UserCog className="h-3 w-3" /> Tú
                        </Badge>
                      )}
                      <ChannelBadge channel={t.channel} />
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-1">
                    <p
                      className={cn(
                        "flex-1 truncate text-xs",
                        unread ? "text-neutral-700" : "text-neutral-500"
                      )}
                    >
                      {t.lastMessage.direction === "outbound" ? "↑ " : "↓ "}
                      {t.lastMessage.body}
                    </p>
                    {unread ? (
                      <span className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                        {t.unreadCount}
                      </span>
                    ) : t.lastMessage.createdAt ? (
                      <span className="flex-shrink-0 text-[10px] text-neutral-400">
                        {format(parseISO(t.lastMessage.createdAt), "HH:mm", {
                          locale: es,
                        })}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-3 py-2 text-[11px] text-neutral-500">
            <span>
              {from}–{to} de {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="rounded-md border border-neutral-300 p-1 disabled:opacity-40"
                disabled={offset === 0 || loadingThreads}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                className="rounded-md border border-neutral-300 p-1 disabled:opacity-40"
                disabled={to >= total || loadingThreads}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                aria-label="Página siguiente"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Message pane — full-screen on mobile once a thread is open; always
          visible from md up. */}
      <div
        className={cn(
          "min-w-0 flex-1 flex-col",
          selected ? "flex" : "hidden md:flex"
        )}
      >
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-neutral-400">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm">Selecciona una conversación</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3">
              {/* Back to the thread list on mobile. */}
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Volver a la lista"
                className="-ml-1 rounded-md p-1 text-neutral-500 hover:bg-neutral-100 md:hidden"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                {(selectedThread?.contact?.name ?? "?")[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {selectedThread?.contact?.name ?? selected}
                </p>
                {selectedThread?.contact?.phone && (
                  <p className="truncate text-xs text-neutral-500">
                    {selectedThread.contact.phone}
                  </p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {isWhatsapp && selectedThread && (
                  <Button
                    variant={selectedThread.handoff ? "primary" : "secondary"}
                    size="sm"
                    onClick={toggleHandoff}
                    disabled={handoffBusy}
                    title={
                      selectedThread.handoff
                        ? "Devolver la conversación al agente"
                        : "Atender tú esta conversación (pausa el agente)"
                    }
                  >
                    {selectedThread.handoff ? (
                      <>
                        <Bot className="h-3.5 w-3.5" /> Reactivar agente
                      </>
                    ) : (
                      <>
                        <UserCog className="h-3.5 w-3.5" /> Atender yo
                      </>
                    )}
                  </Button>
                )}
                {selectedThread && (
                  <ChannelBadge channel={selectedThread.channel} />
                )}
              </div>
            </div>

            {/* Handoff banner */}
            {isWhatsapp && selectedThread?.handoff && (
              <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800">
                <UserCog className="h-3.5 w-3.5" />
                Estás atendiendo tú esta conversación. El agente no responderá
                automáticamente.
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {loadingMessages ? (
                <div className="text-xs text-neutral-400">Cargando…</div>
              ) : messages.length === 0 ? (
                <div className="text-xs text-neutral-400">Sin mensajes aún</div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex",
                      m.direction === "outbound"
                        ? "justify-end"
                        : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                        m.direction === "outbound"
                          ? "rounded-br-sm bg-indigo-600 text-white"
                          : "rounded-bl-sm border border-neutral-200 bg-white text-neutral-900"
                      )}
                    >
                      {m.mediaType && <MediaAttachment message={m} />}
                      {/* Hide the bare "📷 Imagen"-style placeholder once the
                          media itself renders; keep a real caption / filename. */}
                      {!(m.mediaType && isMediaPlaceholder(m.body)) && (
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      )}
                      <div
                        className={cn(
                          "mt-1 flex items-center justify-end gap-1 text-[10px]",
                          m.direction === "outbound"
                            ? "text-indigo-200"
                            : "text-neutral-400"
                        )}
                      >
                        <span>
                          {format(parseISO(m.createdAt), "HH:mm", {
                            locale: es,
                          })}
                        </span>
                        {m.direction === "outbound" && isWhatsapp && (
                          <StatusTicks status={m.status} />
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Composer — manual reply (WhatsApp threads only) */}
            {isWhatsapp && (
              <div className="border-t border-neutral-200 bg-white px-4 py-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendManual();
                      }
                    }}
                    rows={1}
                    placeholder="Escribe un mensaje…"
                    className="max-h-32 min-h-[40px] resize-none"
                  />
                  <Button
                    onClick={sendManual}
                    disabled={sending || draft.trim().length === 0}
                  >
                    <Send className="h-4 w-4" />
                    {sending ? "Enviando…" : "Enviar"}
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-neutral-400">
                  Los mensajes manuales solo se entregan dentro de la ventana de
                  24 h de WhatsApp.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// useSearchParams() must sit under a Suspense boundary (Next.js App Router).
export default function ConversationsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-neutral-400">Cargando…</div>}>
      <ConversationsPageInner />
    </Suspense>
  );
}
