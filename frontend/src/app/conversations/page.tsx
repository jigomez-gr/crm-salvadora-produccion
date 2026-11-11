"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
  Mail,
  Sparkles,
  RotateCcw,
  TrendingUp,
  Paperclip,
  X,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Search,
  User,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { apiFetch, apiUrl, ApiError } from "@/lib/api";
import {
  AppSettings,
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

function formatConversationDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = parseISO(dateStr);
    const now = new Date();
    const isSameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isSameDay) {
      return format(d, "HH:mm", { locale: es });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return `Ayer ${format(d, "HH:mm", { locale: es })}`;
    }
    return format(d, "dd/MM HH:mm", { locale: es });
  } catch {
    return "";
  }
}

function parseEmailInboundMessage(body: string) {
  let isAiEvaluated = false;
  let isOpportunity = false;
  let priority = "";
  let summary = "";
  let reasoning = "";
  let recommendedAction = "";
  let aiDraft: { subject: string; body: string } | null = null;

  if (body.includes("OPORTUNIDAD DE NEGOCIO") || body.includes("CONSULTA INFORMATIVA")) {
    isAiEvaluated = true;
    isOpportunity = body.includes("OPORTUNIDAD DE NEGOCIO");
    const prioMatch = body.match(/PRIORIDAD\s+([A-Z]+)/i);
    if (prioMatch) priority = prioMatch[1].toUpperCase();

    const sumMatch = body.match(/•\s*Resumen IA:\s*([^\n]+)/i);
    if (sumMatch) summary = sumMatch[1].trim();

    const reaMatch = body.match(/•\s*Análisis:\s*([^\n]+)/i);
    if (reaMatch) reasoning = reaMatch[1].trim();

    const recMatch = body.match(/•\s*Acción recomendada:\s*([^\n]+)/i);
    if (recMatch) recommendedAction = recMatch[1].trim();
  }

  // Parse draft
  if (body.includes("📝 [BORRADOR SUGERIDO POR IA]:")) {
    const draftPart = body.split("📝 [BORRADOR SUGERIDO POR IA]:")[1] || "";
    const subjectMatch = draftPart.match(/ASUNTO:\s*([^\n]+)/i);
    const bodyMatch = draftPart.split(/CUERPO:\s*\n/i);
    const draftSubject = subjectMatch ? subjectMatch[1].trim() : "";
    const draftBody = bodyMatch.length > 1 ? bodyMatch[1].trim() : "";

    if (draftSubject || draftBody) {
      aiDraft = { subject: draftSubject, body: draftBody };
    }
  }

  return {
    isAiEvaluated,
    isOpportunity,
    priority,
    summary,
    reasoning,
    recommendedAction,
    aiDraft,
  };
}

function AiEvaluatedEmailBubble({ body }: { body: string }) {
  const parsed = parseEmailInboundMessage(body);
  if (!parsed.isAiEvaluated) {
    return <p className="whitespace-pre-wrap">{body}</p>;
  }

  // Extract client section
  const clientPart = body.includes("👤 [DATOS DEL CLIENTE")
    ? body.split("👤 [DATOS DEL CLIENTE")[1]?.split("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")[0]?.trim()
    : "";

  return (
    <div className="space-y-3 font-sans">
      {/* AI Header */}
      <div
        className={cn(
          "rounded-xl p-3 border",
          parsed.isOpportunity
            ? "bg-rose-50/80 border-rose-200 text-rose-950"
            : "bg-blue-50/80 border-blue-200 text-blue-950"
        )}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 font-bold text-xs">
            {parsed.isOpportunity ? (
              <span className="flex items-center gap-1 text-rose-700">
                <TrendingUp className="h-4 w-4" /> OPORTUNIDAD DE NEGOCIO
              </span>
            ) : (
              <span className="flex items-center gap-1 text-blue-700">
                <Mail className="h-4 w-4" /> CONSULTA INFORMATIVA
              </span>
            )}
          </div>
          <span
            className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
              parsed.priority === "ALTA"
                ? "bg-rose-600 text-white"
                : parsed.priority === "MEDIA"
                ? "bg-amber-500 text-white"
                : "bg-blue-600 text-white"
            )}
          >
            Prioridad {parsed.priority || "ESTÁNDAR"}
          </span>
        </div>

        {parsed.summary && (
          <p className="text-xs font-semibold mb-1">• {parsed.summary}</p>
        )}
        {parsed.reasoning && (
          <p className="text-[11px] text-neutral-600 mb-1">
            <strong>Análisis:</strong> {parsed.reasoning}
          </p>
        )}
        {parsed.recommendedAction && (
          <p className="text-[11px] text-emerald-800 font-medium bg-emerald-50 border border-emerald-200 rounded p-1.5 mt-1.5">
            <strong>Acción recomendada:</strong> {parsed.recommendedAction}
          </p>
        )}
      </div>

      {/* Client message */}
      {clientPart ? (
        <div className="bg-neutral-50 rounded-lg p-2.5 text-xs text-neutral-800 border border-neutral-200">
          <p className="font-semibold text-neutral-700 mb-1 text-[11px]">👤 Petición del Cliente:</p>
          <div className="whitespace-pre-wrap text-neutral-800">
            {clientPart.replace(/^•\s*-\s*FORMULARIO WEB\]\s*/, "")}
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap">{body}</p>
      )}

      {/* Draft notice */}
      {parsed.aiDraft && (
        <div className="flex items-center gap-1.5 text-[11px] text-purple-700 bg-purple-50 border border-purple-200 rounded-lg p-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-purple-600" />
          <span>Borrador de respuesta generado por IA listo para revisar y enviar en el editor inferior.</span>
        </div>
      )}
    </div>
  );
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [whatsappAutomationPaused, setWhatsappAutomationPaused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Multi-criteria filters & search
  const [days, setDays] = useState<"all" | "7">("all");
  const [readStatus, setReadStatus] = useState<"all" | "unread" | "read">("all");
  const [channelFilter, setChannelFilter] = useState<"all" | "whatsapp" | "email" | "widget" | "call" | "sms">("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState<"all" | "phone" | "email" | "name">("all");

  // Debounce search input to avoid re-fetching on each keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Email thread composer state (AI prepared draft, custom editing, SMTP send)
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [initialAiDraft, setInitialAiDraft] = useState<{ subject: string; body: string } | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Spinner shown while the selected thread's messages haven't loaded yet.
  const loadingMessages = selected !== null && selected !== loadedThread;

  // Centralized thread fetcher that immediately applies any new filter/search overrides
  const fetchThreads = useCallback(
    async (overrides?: {
      days?: "all" | "7";
      readStatus?: "all" | "unread" | "read";
      channel?: "all" | "whatsapp" | "email" | "widget" | "call" | "sms";
      search?: string;
      searchField?: "all" | "phone" | "email" | "name";
      offset?: number;
    }) => {
      const effDays = overrides?.days ?? days;
      const effReadStatus = overrides?.readStatus ?? readStatus;
      const effChannel = overrides?.channel ?? channelFilter;
      const effSearch = overrides?.search !== undefined ? overrides.search : search;
      const effSearchField = overrides?.searchField ?? searchField;
      const effOffset = overrides?.offset !== undefined ? overrides.offset : offset;

      try {
        setLoadingThreads(true);
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(effOffset));
        if (effDays !== "all") params.set("days", effDays);
        if (effReadStatus !== "all") params.set("readStatus", effReadStatus);
        if (effChannel !== "all") params.set("channel", effChannel);
        if (effSearch.trim()) {
          params.set("search", effSearch.trim());
          if (effSearchField !== "all") params.set("searchField", effSearchField);
        }
        const data = await apiFetch<ConversationPage>(
          `/api/conversations?${params.toString()}`
        );
        setThreads(data.items);
        setTotal(data.total);
      } catch (err: any) {
        toast.error("Error al cargar conversaciones: " + (err?.message || ""));
        setThreads([]);
        setTotal(0);
      } finally {
        setLoadingThreads(false);
      }
    },
    [days, readStatus, channelFilter, search, searchField, offset, toast]
  );

  const refreshThreads = useCallback(async () => {
    await fetchThreads();
  }, [fetchThreads]);

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
    fetchThreads();
    apiFetch<AppSettings>("/api/settings")
      .then((s) => setWhatsappAutomationPaused(Boolean(s.whatsappAutomationPaused)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search input so typing naturally triggers the search after 350ms
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
        setOffset(0);
        fetchThreads({ search: searchInput, offset: 0 });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, search, fetchThreads]);

  useEffect(() => {
    if (!selected) return;
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Opening the thread reads it: clear unread locally + notify server immediately
    setThreads((prev) =>
      prev.map((t) =>
        t.threadId === selected ? { ...t, unreadCount: 0 } : t
      )
    );
    markRead(selected);

    let cancelled = false;
    loadMessages(selected).then((data) => {
      if (cancelled) return;
      setMessages(data);
      setLoadedThread(selected);

      // If email thread, pre-populate composer with the latest AI draft
      if (selected.includes(":email:") || threads.find((t) => t.threadId === selected)?.channel === "email") {
        const latestInbound = [...data].reverse().find((m) => m.direction === "inbound");
        if (latestInbound) {
          const parsed = parseEmailInboundMessage(latestInbound.body);
          if (parsed.aiDraft) {
            setEmailSubject(parsed.aiDraft.subject);
            setEmailBody(parsed.aiDraft.body);
            setInitialAiDraft(parsed.aiDraft);
          } else {
            setEmailSubject("Re: Consulta — Escuela de Yoga Salvadora Conesa");
            setEmailBody("");
            setInitialAiDraft(null);
          }
        }
      }
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
    "call.ended": () => {
      refreshThreads();
    },
  });

  const selectedThread = threads.find((t) => t.threadId === selected);
  const isCall =
    selectedThread?.channel === "call" ||
    Boolean(selectedThread?.threadId?.startsWith("call:"));
  const isSms =
    !isCall &&
    (selectedThread?.channel === "sms" ||
      Boolean(selectedThread?.threadId?.startsWith("sms:")));
  const isEmail =
    !isCall &&
    !isSms &&
    (selectedThread?.channel === "email" ||
      Boolean(selectedThread?.threadId?.includes(":email:")));
  const isWhatsapp =
    !isCall &&
    !isSms &&
    !isEmail &&
    (selectedThread?.channel === "whatsapp" || !selectedThread?.channel);

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  function ChannelBadge({ channel, threadId }: { channel: string; threadId?: string }) {
    if (channel === "call" || threadId?.startsWith("call:")) {
      return (
        <Badge variant="info" className="gap-1 bg-blue-50 text-blue-700 border border-blue-200">
          <PhoneCall className="h-3 w-3 text-blue-600" /> Llamada
        </Badge>
      );
    }
    if (channel === "sms" || threadId?.startsWith("sms:")) {
      return (
        <Badge variant="default" className="gap-1 bg-teal-50 text-teal-800 border border-teal-200">
          <Smartphone className="h-3 w-3 text-teal-700" /> SMS
        </Badge>
      );
    }
    if (channel === "email" || threadId?.includes(":email:")) {
      return (
        <Badge variant="warning" className="gap-1 bg-amber-50 text-amber-800 border border-amber-200">
          <Mail className="h-3 w-3 text-amber-600" /> Email
        </Badge>
      );
    }
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
    if ((!body && !selectedFile) || !selected || sending) return;
    setSending(true);
    try {
      if (selectedFile) {
        const formData = new FormData();
        if (body) formData.append("body", body);
        formData.append("file", selectedFile);
        await apiFetch(`/api/conversations/${selected}/messages`, {
          method: "POST",
          body: formData,
        });
      } else {
        await apiFetch(`/api/conversations/${selected}/messages`, {
          method: "POST",
          body: JSON.stringify({ body }),
        });
      }
      setDraft("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  async function sendEmailReply() {
    const body = emailBody.trim();
    if (!body || !selected || sendingEmail) return;
    setSendingEmail(true);
    try {
      await apiFetch(`/api/conversations/${selected}/reply-email`, {
        method: "POST",
        body: JSON.stringify({
          subject: emailSubject.trim() || "Re: Consulta — Escuela de Yoga Salvadora Conesa",
          body,
        }),
      });
      toast.success(
        selectedThread?.contact?.email
          ? `Correo de respuesta enviado con éxito a ${selectedThread.contact.email}`
          : "Correo de respuesta enviado con éxito"
      );
      setEmailBody("");
      const data = await loadMessages(selected);
      setMessages(data);
      refreshThreads();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo enviar el correo de respuesta"
      );
    } finally {
      setSendingEmail(false);
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
          "w-full flex-col border-r border-neutral-200 bg-white md:flex md:w-80 lg:w-96",
          selected ? "hidden md:flex" : "flex"
        )}
      >
        <div className="border-b border-neutral-100 p-3.5 space-y-2.5 bg-neutral-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-neutral-900">
                Conversaciones
              </h1>
              <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                {total}
              </span>
            </div>
            {(searchInput || search || days !== "all" || readStatus !== "all" || channelFilter !== "all" || searchField !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setSearchField("all");
                  setDays("all");
                  setReadStatus("all");
                  setChannelFilter("all");
                  setOffset(0);
                  fetchThreads({
                    search: "",
                    searchField: "all",
                    days: "all",
                    readStatus: "all",
                    channel: "all",
                    offset: 0,
                  });
                }}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {whatsappAutomationPaused && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                WhatsApp automático: <strong>PAUSADO</strong>. Solo respuestas manuales.
              </span>
            </div>
          )}

          {/* Search bar, scope & Reejecutar button */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setSearch(searchInput);
                      setOffset(0);
                      fetchThreads({ search: searchInput, offset: 0 });
                    }
                  }}
                  placeholder={
                    searchField === "phone"
                      ? "Buscar por teléfono..."
                      : searchField === "email"
                      ? "Buscar por email..."
                      : searchField === "name"
                      ? "Buscar por trozo de nombre..."
                      : "Buscar por móvil, email, nombre..."
                  }
                  className="w-full rounded-lg border border-neutral-300 bg-white py-1.5 pl-8 pr-7 text-xs text-neutral-900 placeholder-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setSearch("");
                      setOffset(0);
                      fetchThreads({ search: "", offset: 0 });
                    }}
                    className="absolute right-2 top-2 text-neutral-400 hover:text-neutral-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearch(searchInput);
                  setOffset(0);
                  fetchThreads({ search: searchInput, offset: 0 });
                }}
                disabled={loadingThreads}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0 shadow-sm"
                title="Reejecutar búsqueda y refrescar lista"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loadingThreads && "animate-spin")} />
                <span>Reejecutar</span>
              </button>
            </div>

            {/* Scope selector */}
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-neutral-400 text-[10px] mr-0.5">Buscar en:</span>
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "phone", label: "Móvil" },
                  { id: "email", label: "Email" },
                  { id: "name", label: "Nombre" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSearchField(f.id);
                    setOffset(0);
                    fetchThreads({ searchField: f.id, offset: 0 });
                  }}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-medium transition-colors",
                    searchField === f.id
                      ? "bg-indigo-100 text-indigo-700 font-semibold"
                      : "text-neutral-500 hover:bg-neutral-200/60"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Row 1: Fecha (7 días / Todas) & Estado (Todas / Sin leer / Leídas) */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                Periodo
              </label>
              <select
                value={days}
                onChange={(e) => {
                  const next = e.target.value as "all" | "7";
                  setDays(next);
                  setOffset(0);
                  fetchThreads({ days: next, offset: 0 });
                }}
                className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">Todas las fechas</option>
                <option value="7">Últimos 7 días</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                Estado
              </label>
              <select
                value={readStatus}
                onChange={(e) => {
                  const next = e.target.value as "all" | "unread" | "read";
                  setReadStatus(next);
                  setOffset(0);
                  fetchThreads({ readStatus: next, offset: 0 });
                }}
                className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="all">Todas</option>
                <option value="unread">Sin leer</option>
                <option value="read">Leídas</option>
              </select>
            </div>
          </div>

          {/* Filter Row 2: Canal (email, web landing, wassap, llamadas ó todas) */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Canal
            </label>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: "all", label: "Todas" },
                  { id: "whatsapp", label: "WhatsApp" },
                  { id: "email", label: "Email" },
                  { id: "widget", label: "Web Landing" },
                  { id: "call", label: "Llamadas" },
                  { id: "sms", label: "SMS" },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setChannelFilter(c.id);
                    setOffset(0);
                    fetchThreads({ channel: c.id, offset: 0 });
                  }}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    channelFilter === c.id
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold"
                      : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <div className="p-4 text-xs text-neutral-400">Cargando…</div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-400">
              No se encontraron conversaciones
            </div>
          ) : (
            threads.map((t) => {
              const unread = t.unreadCount > 0;
              const isCallItem = t.channel === "call" || t.threadId.startsWith("call:");
              const isSmsItem = t.channel === "sms" || t.threadId.startsWith("sms:");
              return (
                <button
                  key={t.threadId}
                  onClick={() => setSelected(t.threadId)}
                  className={cn(
                    "w-full border-b border-neutral-50 px-3.5 py-3 text-left hover:bg-neutral-50 transition-colors",
                    selected === t.threadId && "bg-indigo-50/80"
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        "truncate text-sm text-neutral-900",
                        unread ? "font-semibold" : "font-medium"
                      )}
                    >
                      {t.contact?.name ?? (isCallItem ? "Llamada telefónica" : isSmsItem ? "Mensaje SMS" : t.threadId)}
                    </span>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {t.handoff && (
                        <Badge variant="warning" className="gap-0.5">
                          <UserCog className="h-3 w-3" /> Tú
                        </Badge>
                      )}
                      <ChannelBadge channel={t.channel} threadId={t.threadId} />
                    </div>
                  </div>

                  {(t.contact?.phone || t.contact?.email) && (
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-500 truncate">
                      {t.contact?.phone && <span>{t.contact.phone}</span>}
                      {t.contact?.phone && t.contact?.email && <span>•</span>}
                      {t.contact?.email && <span className="truncate">{t.contact.email}</span>}
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-between gap-1">
                    <p
                      className={cn(
                        "flex-1 truncate text-xs",
                        unread ? "text-neutral-700" : "text-neutral-500"
                      )}
                    >
                      {isCallItem ? (
                        t.lastMessage.direction === "outbound" ? (
                          <span className="text-blue-600 font-medium mr-1 inline-flex items-center gap-0.5">
                            <PhoneOutgoing className="h-2.5 w-2.5 inline" /> Saliente:
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-medium mr-1 inline-flex items-center gap-0.5">
                            <PhoneIncoming className="h-2.5 w-2.5 inline" /> Entrante:
                          </span>
                        )
                      ) : isSmsItem ? (
                        <span className="text-teal-700 font-medium mr-1 inline-flex items-center gap-0.5">
                          <Smartphone className="h-2.5 w-2.5 inline" /> SMS:
                        </span>
                      ) : (
                        t.lastMessage.direction === "outbound" ? "↑ " : "↓ "
                      )}
                      {t.lastMessage.body}
                    </p>
                    {unread ? (
                      <span className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                        {t.unreadCount}
                      </span>
                    ) : t.lastMessage.createdAt ? (
                      <span className="flex-shrink-0 text-[10px] text-neutral-400">
                        {formatConversationDate(t.lastMessage.createdAt)}
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
                onClick={() => {
                  const next = Math.max(0, offset - PAGE_SIZE);
                  setOffset(next);
                  fetchThreads({ offset: next });
                }}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                className="rounded-md border border-neutral-300 p-1 disabled:opacity-40"
                disabled={to >= total || loadingThreads}
                onClick={() => {
                  const next = offset + PAGE_SIZE;
                  setOffset(next);
                  fetchThreads({ offset: next });
                }}
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
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                  isCall
                    ? "bg-blue-100 text-blue-700"
                    : isSms
                    ? "bg-teal-100 text-teal-700"
                    : "bg-indigo-100 text-indigo-700"
                )}
              >
                {isCall ? (
                  <PhoneCall className="h-4 w-4" />
                ) : isSms ? (
                  <Smartphone className="h-4 w-4" />
                ) : (
                  (selectedThread?.contact?.name ?? "?")[0].toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {selectedThread?.contact?.name ?? (isCall ? "Llamada telefónica" : isSms ? "Mensaje SMS" : selected)}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
                  {selectedThread?.contact?.email && (
                    <span className="truncate">{selectedThread.contact.email}</span>
                  )}
                  {selectedThread?.contact?.email && selectedThread?.contact?.phone && !selectedThread.contact.phone.startsWith("+34000") && (
                    <span>•</span>
                  )}
                  {selectedThread?.contact?.phone && !selectedThread.contact.phone.startsWith("+34000") && (
                    <span className="truncate">{selectedThread.contact.phone}</span>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {isCall && selectedThread && (
                  selectedThread.lastMessage.direction === "outbound" ? (
                    <Badge variant="info" className="gap-1 bg-blue-50 text-blue-700 border border-blue-200">
                      <PhoneOutgoing className="h-3 w-3" /> Saliente
                    </Badge>
                  ) : (
                    <Badge variant="success" className="gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <PhoneIncoming className="h-3 w-3" /> Entrante
                    </Badge>
                  )
                )}
                {isSms && selectedThread && (
                  <Badge variant="default" className="gap-1 bg-teal-50 text-teal-800 border border-teal-200">
                    <Smartphone className="h-3 w-3 text-teal-700" /> Saliente
                  </Badge>
                )}
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
                  <ChannelBadge channel={selectedThread.channel} threadId={selectedThread.threadId} />
                )}
              </div>
            </div>

            {/* Global WhatsApp automation pause banner */}
            {isWhatsapp && whatsappAutomationPaused && (
              <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-100/90 px-5 py-2 text-xs font-medium text-amber-950">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
                <span>
                  <strong>WhatsApp automático: PAUSADO globalmente.</strong> Los mensajes entrantes se reciben y guardan, pero el agente IA no responderá automáticamente. Puedes responder manualmente desde este chat.
                </span>
              </div>
            )}

            {/* Handoff banner */}
            {isWhatsapp && selectedThread?.handoff && (
              <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800">
                <UserCog className="h-3.5 w-3.5" />
                Estás atendiendo tú esta conversación. El agente no responderá
                automáticamente.
              </div>
            )}

            {isCall ? (
              /* Dedicated Call View: solo fecha, texto, saliente/entrante, teléfono móvil, nombre y apellido, email */
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm space-y-5 max-w-3xl">
                  {/* Call Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
                    <div className="flex items-center gap-2">
                      {selectedThread?.lastMessage.direction === "outbound" ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
                          <PhoneOutgoing className="h-3.5 w-3.5" />
                          <span>Llamada Saliente</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                          <PhoneIncoming className="h-3.5 w-3.5" />
                          <span>Llamada Entrante</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <Clock className="h-3.5 w-3.5 text-neutral-400" />
                      <span>
                        {selectedThread?.lastMessage.createdAt
                          ? format(parseISO(selectedThread.lastMessage.createdAt), "EEEE d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })
                          : "Fecha no registrada"}
                      </span>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-neutral-50 p-4 border border-neutral-200/70">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        Nombre y Apellidos
                      </span>
                      {selectedThread?.contact?.id ? (
                        <Link
                          href={`/contacts/${selectedThread.contact.id}`}
                          className="mt-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                        >
                          <span>{selectedThread.contact.name}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-indigo-500" />
                        </Link>
                      ) : (
                        <p className="mt-1 text-sm font-semibold text-neutral-900">
                          {selectedThread?.contact?.name || "Llamada sin contacto"}
                        </p>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        Teléfono Móvil
                      </span>
                      <p className="mt-1 text-sm font-semibold text-neutral-900">
                        {selectedThread?.contact?.phone ? (
                          <a
                            href={`tel:${selectedThread.contact.phone}`}
                            className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                          >
                            <PhoneCall className="h-3.5 w-3.5 shrink-0" />
                            <span>{selectedThread.contact.phone}</span>
                          </a>
                        ) : (
                          <span className="text-neutral-400">Sin teléfono</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        Correo Electrónico
                      </span>
                      <p className="mt-1 text-sm font-semibold text-neutral-900 truncate">
                        {selectedThread?.contact?.email ? (
                          <a
                            href={`mailto:${selectedThread.contact.email}`}
                            className="text-indigo-600 hover:underline inline-flex items-center gap-1 truncate"
                          >
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{selectedThread.contact.email}</span>
                          </a>
                        ) : (
                          <span className="text-neutral-400">Sin email</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Call Text / Summary */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-2 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-neutral-500" />
                      Texto de la Llamada
                    </h3>
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed font-sans">
                      {selectedThread?.lastMessage.body || "No hay texto disponible para esta llamada."}
                    </div>
                  </div>
                </div>
              </div>
            ) : isSms ? (
              /* Dedicated SMS View: solo fecha, texto, saliente, teléfono móvil, nombre y apellido, email */
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm space-y-5 max-w-3xl">
                  {/* SMS Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 border border-teal-200">
                        <Smartphone className="h-3.5 w-3.5 text-teal-700" />
                        <span>SMS Saliente</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <Clock className="h-3.5 w-3.5 text-neutral-400" />
                      <span>
                        {selectedThread?.lastMessage.createdAt
                          ? format(parseISO(selectedThread.lastMessage.createdAt), "EEEE d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })
                          : "Fecha no registrada"}
                      </span>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-neutral-50 p-4 border border-neutral-200/70">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        Nombre y Apellidos
                      </span>
                      {selectedThread?.contact?.id ? (
                        <Link
                          href={`/contacts/${selectedThread.contact.id}`}
                          className="mt-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                        >
                          <span>{selectedThread.contact.name}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-indigo-500" />
                        </Link>
                      ) : (
                        <p className="mt-1 text-sm font-semibold text-neutral-900">
                          {selectedThread?.contact?.name || "Sin contacto vinculado"}
                        </p>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        Teléfono Móvil
                      </span>
                      <p className="mt-1 text-sm font-semibold text-neutral-900">
                        {selectedThread?.contact?.phone ? (
                          <a
                            href={`tel:${selectedThread.contact.phone}`}
                            className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                          >
                            <Smartphone className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                            <span>{selectedThread.contact.phone}</span>
                          </a>
                        ) : (
                          <span className="text-neutral-400">Sin teléfono</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                        Correo Electrónico
                      </span>
                      <p className="mt-1 text-sm font-semibold text-neutral-900 truncate">
                        {selectedThread?.contact?.email ? (
                          <a
                            href={`mailto:${selectedThread.contact.email}`}
                            className="text-indigo-600 hover:underline inline-flex items-center gap-1 truncate"
                          >
                            <Mail className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                            <span className="truncate">{selectedThread.contact.email}</span>
                          </a>
                        ) : (
                          <span className="text-neutral-400">Sin email</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* SMS Text */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-2 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-neutral-500" />
                      Texto del SMS
                    </h3>
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed font-sans">
                      {selectedThread?.lastMessage.body || "No hay texto disponible para este SMS."}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
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
                        selectedThread?.channel === "email" &&
                        m.direction === "inbound" &&
                        (m.body.includes("OPORTUNIDAD DE NEGOCIO") || m.body.includes("CONSULTA INFORMATIVA")) ? (
                          <AiEvaluatedEmailBubble body={m.body} />
                        ) : (
                          <p className="whitespace-pre-wrap">{m.body}</p>
                        )
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

            {/* Email Composer & Action Bar */}
            {isEmail && (
              <div className="border-t border-neutral-200 bg-neutral-50/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#800020]/10 text-[#800020]">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-neutral-900">
                        Responder por Correo Electrónico
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Destinatario: <strong className="text-neutral-700">{selectedThread?.contact?.email || selected}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {initialAiDraft && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-medium text-purple-700 border border-purple-200">
                        <Sparkles className="h-3 w-3 text-purple-600" />
                        Borrador IA preparado
                      </span>
                    )}

                    {initialAiDraft && (emailBody !== initialAiDraft.body || emailSubject !== initialAiDraft.subject) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEmailSubject(initialAiDraft.subject);
                          setEmailBody(initialAiDraft.body);
                          toast.info("Borrador original de la IA restablecido");
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restaurar borrador IA
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Asunto del Correo:
                    </label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Asunto del correo…"
                      className="w-full text-xs rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Cuerpo del Correo (revisa y modifica el texto libremente antes de enviar):
                    </label>
                    <Textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      rows={6}
                      placeholder="Escribe la respuesta por correo electrónico…"
                      className="text-xs leading-relaxed font-sans"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-[10px] text-neutral-500">
                    Se enviará desde el correo oficial del centro mediante SMTP.
                  </span>

                  <div className="flex items-center gap-2">
                    {selectedThread?.contact?.email && (
                      <a
                        href={`mailto:${selectedThread.contact.email}?subject=${encodeURIComponent(
                          emailSubject || "Re: Consulta - Escuela de Yoga Salvadora Conesa"
                        )}&body=${encodeURIComponent(emailBody)}`}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 border border-neutral-300 bg-white text-neutral-700 text-xs font-medium rounded-lg hover:bg-neutral-50 transition"
                        title="Abrir en cliente de correo local (Outlook/Gmail)"
                      >
                        <Mail className="h-3 w-3 text-neutral-500" />
                        <span>Abrir en cliente local</span>
                      </a>
                    )}

                    <Button
                      onClick={sendEmailReply}
                      disabled={sendingEmail || !emailBody.trim()}
                      className="bg-[#800020] hover:bg-[#800020]/90 text-white text-xs gap-1.5 shadow-sm"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sendingEmail ? "Enviando correo…" : "Enviar Respuesta por Correo"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Composer — manual reply (WhatsApp threads only) */}
            {isWhatsapp && (
              <div className="border-t border-neutral-200 bg-white px-4 py-3">
                {selectedFile && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-800">
                    <Paperclip className="h-4 w-4 text-neutral-500 flex-shrink-0" />
                    <span className="truncate font-medium max-w-xs">{selectedFile.name}</span>
                    <span className="text-[11px] text-neutral-400">
                      ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="ml-auto rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                      title="Quitar archivo adjunto"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.xlsx,.txt,.mp3,.mp4,.jpg,.jpeg,.png,.webp,image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 101 * 1024 * 1024) {
                          toast.error("El archivo no puede superar los 101 MB");
                          return;
                        }
                        setSelectedFile(file);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    title="Adjuntar archivo o imagen"
                    className="px-2.5 h-10 border-neutral-300 text-neutral-600 hover:text-neutral-900"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
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
                    placeholder={selectedFile ? "Añade un texto o pie de foto (opcional)…" : "Escribe un mensaje…"}
                    className="max-h-32 min-h-[40px] resize-none"
                  />
                  <Button
                    onClick={sendManual}
                    disabled={sending || (!draft.trim() && !selectedFile)}
                  >
                    <Send className="h-4 w-4" />
                    {sending ? "Enviando…" : "Enviar"}
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-neutral-400">
                  Los mensajes manuales solo se entregan dentro de la ventana de
                  24 h de WhatsApp. Formatos admitidos: imágenes, PDF, Word, Excel, audio, vídeo y texto (máx. 101 MB).
                </p>
              </div>
            )}
          </>
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
