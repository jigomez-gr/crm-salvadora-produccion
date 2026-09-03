"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  Pause,
  Clock,
  DollarSign,
  AlertTriangle,
  FileText,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Bot,
  Settings2,
  Cpu,
  Volume2,
  Shield,
  Search,
  User,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  Call,
  CallsPageResponse,
  CallsStats,
  VapiAccountConfig,
  VapiCatalog,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { SecretInput } from "@/components/ui/SecretInput";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/contexts/ToastContext";
import { useEvents } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function CallsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"logs" | "studio">("logs");

  // Call Logs state
  const [calls, setCalls] = useState<Call[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [stats, setStats] = useState<CallsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("");
  const [needsReviewFilter, setNeedsReviewFilter] = useState<boolean | undefined>(undefined);

  // Selected Call for details / transcript modal
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [syncingCallId, setSyncingCallId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Outbound Call modal
  const [testCallOpen, setTestCallOpen] = useState(false);
  const [targetPhone, setTargetPhone] = useState("");
  const [calling, setCalling] = useState(false);

  // Studio / Config state
  const [config, setConfig] = useState<VapiAccountConfig | null>(null);
  const [catalog, setCatalog] = useState<VapiCatalog | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [syncingTools, setSyncingTools] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [promptPreview, setPromptPreview] = useState<string>("");
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  // Form fields for Studio
  const [apiKey, setApiKey] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [handoffNumber, setHandoffNumber] = useState("");
  const [llmModel, setLlmModel] = useState("gpt-5.6-luna");
  const [llmProvider, setLlmProvider] = useState("openai");
  const [voiceProvider, setVoiceProvider] = useState("11labs");
  const [voiceId, setVoiceId] = useState("UOIqAnmS11Reiei1Ytkc");
  const [voiceModel, setVoiceModel] = useState("eleven_turbo_v2_5");
  const [transcriberModel, setTranscriberModel] = useState("nova-3-general");
  const [tone, setTone] = useState("professional");
  const [systemPromptOverride, setSystemPromptOverride] = useState("");
  const [isOverrideActive, setIsOverrideActive] = useState(false);
  const [availablePhones, setAvailablePhones] = useState<Array<{ id: string; number: string; name?: string }>>([]);

  // Zadarma SIP Trunk connection state
  const [sipGateway, setSipGateway] = useState("sip.zadarma.com");
  const [sipUsername, setSipUsername] = useState("368228");
  const [sipPassword, setSipPassword] = useState("");
  const [connectingSip, setConnectingSip] = useState(false);
  const [validatingIp, setValidatingIp] = useState(false);

  // Load Calls & Stats
  async function loadCalls() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (directionFilter) params.append("direction", directionFilter);
      if (needsReviewFilter !== undefined) params.append("needsReview", String(needsReviewFilter));

      const [callsRes, statsRes] = await Promise.all([
        apiFetch<CallsPageResponse>(`/api/calls?${params.toString()}`),
        apiFetch<CallsStats>("/api/calls/stats"),
      ]);

      setCalls(callsRes.items);
      setTotalCalls(callsRes.total);
      setStats(statsRes);
    } catch (err: any) {
      toast.error("Error al cargar llamadas: " + (err?.message || "Inténtalo de nuevo."));
    } finally {
      setLoading(false);
    }
  }

  // Load VAPI Config & Catalog
  async function loadConfig() {
    try {
      setConfigLoading(true);
      const [cfg, cat, preview] = await Promise.all([
        apiFetch<VapiAccountConfig>("/api/vapi/config"),
        apiFetch<VapiCatalog>("/api/vapi/catalog"),
        apiFetch<{ prompt: string; isOverride: boolean }>("/api/vapi/preview-prompt"),
      ]);

      setConfig(cfg);
      setCatalog(cat);
      setAssistantId(cfg.assistantId || "");
      setPhoneNumberId(cfg.phoneNumberId || "");
      setPhoneNumber(cfg.phoneNumber || "");
      setHandoffNumber(cfg.handoffNumber || "");
      setLlmProvider(cfg.llmProvider || "openai");
      setLlmModel(cfg.llmModel || "gpt-5.6-luna");
      setVoiceProvider(cfg.voiceProvider || "11labs");
      setVoiceId(cfg.voiceId || "UOIqAnmS11Reiei1Ytkc");
      setVoiceModel(cfg.voiceModel || "eleven_turbo_v2_5");
      setTranscriberModel(cfg.transcriberModel || "nova-3-general");
      setTone(cfg.tone || "professional");
      setSystemPromptOverride(cfg.systemPromptOverride || "");
      setIsOverrideActive(Boolean(cfg.systemPromptOverride));
      setPromptPreview(preview.prompt);

      // Load registered phone numbers from VAPI
      apiFetch<Array<{ id: string; number: string; name?: string }>>("/api/vapi/phone-numbers")
        .then((phones) => {
          if (Array.isArray(phones) && phones.length > 0) {
            setAvailablePhones(phones);
            if (!cfg.phoneNumberId) {
              const matched = cfg.phoneNumber
                ? phones.find((p) => p.number === cfg.phoneNumber)
                : phones[0];
              const target = matched || phones[0];
              if (target) {
                setPhoneNumberId(target.id);
                if (!cfg.phoneNumber) setPhoneNumber(target.number);
              }
            }
          }
        })
        .catch(() => null);
    } catch (err: any) {
      toast.error("Error al cargar configuración de VAPI: " + (err?.message || ""));
    } finally {
      setConfigLoading(false);
    }
  }

  useEffect(() => {
    loadCalls();
    loadConfig();
  }, []);

  // Listen for realtime call updates
  useEvents({
    "call.ended": () => loadCalls(),
    "appointment.created": () => loadCalls(),
  });

  // Audio Playback via authenticated backend proxy
  function handlePlayAudio(call: Call) {
    if (!call.recordingUrl && !call.vapiCallId) return;

    if (playingAudioId === call.id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(`/api/calls/${call.id}/recording`);
      audioRef.current = audio;
      audio
        .play()
        .then(() => {
          setPlayingAudioId(call.id);
        })
        .catch((err) => {
          console.error("Error reproduciendo audio:", err);
          toast.error("No se pudo reproducir el audio: " + (err?.message || ""));
          setPlayingAudioId(null);
        });

      audio.onended = () => setPlayingAudioId(null);
      audio.onerror = () => {
        toast.error("Error al cargar la grabación de la llamada.");
        setPlayingAudioId(null);
      };
    }
  }

  // Sync specific call from VAPI
  async function handleSyncCall(callId: string) {
    try {
      setSyncingCallId(callId);
      const updated = await apiFetch<Call>(`/api/calls/${callId}/sync`, {
        method: "POST",
      });
      setCalls((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (selectedCall?.id === updated.id) {
        setSelectedCall(updated);
      }
      toast.success("Llamada sincronizada correctamente con VAPI.");
    } catch (err: any) {
      toast.error("Error al sincronizar llamada con VAPI: " + (err?.message || ""));
    } finally {
      setSyncingCallId(null);
    }
  }

  // Sync recent calls in bulk from VAPI
  async function handleSyncAllCalls() {
    try {
      setSyncingAll(true);
      const res = await apiFetch<{ synced: number }>("/api/calls/sync", {
        method: "POST",
      });
      await loadCalls();
      toast.success(`Se han actualizado ${res.synced} llamada(s) desde VAPI.`);
    } catch (err: any) {
      toast.error("Error al sincronizar llamadas: " + (err?.message || ""));
    } finally {
      setSyncingAll(false);
    }
  }

  // Auto-sync call from VAPI when opened if transcript is missing
  useEffect(() => {
    if (
      selectedCall?.id &&
      !selectedCall.transcript &&
      (!selectedCall.messages || selectedCall.messages.length === 0) &&
      selectedCall.vapiCallId &&
      !syncingCallId
    ) {
      handleSyncCall(selectedCall.id);
    }
  }, [selectedCall?.id]);

  // Connect Zadarma SIP Trunk to VAPI for outbound calls (+34)
  async function handleConnectSipTrunk() {
    if (!sipUsername || !sipPassword) {
      toast.error("Por favor introduce el usuario y la contraseña SIP de Zadarma.");
      return;
    }
    try {
      setConnectingSip(true);
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/vapi/connect-sip-trunk", {
        method: "POST",
        body: JSON.stringify({
          authUsername: sipUsername,
          authPassword: sipPassword,
          gateway: sipGateway,
        }),
      });
      toast.success(res.message || "Línea Zadarma vinculada con éxito en VAPI.");
      await loadConfig();
    } catch (err: any) {
      toast.error("Error al vincular con VAPI: " + (err?.message || ""));
    } finally {
      setConnectingSip(false);
    }
  }

  // Send Echo Test call to Zadarma to validate and confirm IP
  async function handleValidateZadarmaIp() {
    try {
      setValidatingIp(true);
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/vapi/validate-zadarma-ip", {
        method: "POST",
      });
      toast.success(res.message || "Llamada de eco enviada a Zadarma.");
    } catch (err: any) {
      toast.error("Error al validar IP en Zadarma: " + (err?.message || ""));
    } finally {
      setValidatingIp(false);
    }
  }

  // Save Config
  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const payload: Partial<VapiAccountConfig> & { apiKey?: string; webhookToken?: string } = {
        assistantId: assistantId || undefined,
        phoneNumberId: phoneNumberId || undefined,
        phoneNumber: phoneNumber || undefined,
        handoffNumber: handoffNumber || undefined,
        llmProvider,
        llmModel,
        voiceProvider,
        voiceId,
        voiceModel,
        transcriberModel,
        tone,
        systemPromptOverride: isOverrideActive ? systemPromptOverride : null,
      };

      if (apiKey) payload.apiKey = apiKey;
      if (webhookToken) payload.webhookToken = webhookToken;

      const updated = await apiFetch<VapiAccountConfig>("/api/vapi/config", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setConfig(updated);
      setApiKey("");
      setWebhookToken("");
      toast.success("Configuración de VAPI guardada correctamente.");
      refreshPromptPreview();
    } catch (err: any) {
      toast.error("Error al guardar: " + (err?.message || ""));
    } finally {
      setSavingConfig(false);
    }
  }

  // Refresh Prompt Preview
  async function refreshPromptPreview() {
    try {
      setLoadingPrompt(true);
      const res = await apiFetch<{ prompt: string }>("/api/vapi/preview-prompt");
      setPromptPreview(res.prompt);
    } catch {
      // ignore
    } finally {
      setLoadingPrompt(false);
    }
  }

  // Sync Tools in VAPI
  async function handleSyncTools() {
    setSyncingTools(true);
    try {
      const res = await apiFetch<{ synced: number; tools: any[] }>("/api/vapi/sync-tools", {
        method: "POST",
      });
      toast.success(`¡${res.synced} herramientas sincronizadas con VAPI Cloud con éxito!`);
    } catch (err: any) {
      toast.error("Error al sincronizar herramientas: " + (err?.message || ""));
    } finally {
      setSyncingTools(false);
    }
  }

  // Publish Assistant in VAPI
  async function handlePublish() {
    setPublishing(true);
    try {
      const res = await apiFetch<{ assistantId: string }>("/api/vapi/publish", {
        method: "POST",
      });
      setAssistantId(res.assistantId);
      toast.success("¡Asistente de voz publicado y actualizado en VAPI con éxito!");
      await loadConfig();
    } catch (err: any) {
      toast.error("Error al publicar asistente: " + (err?.message || ""));
    } finally {
      setPublishing(false);
    }
  }

  // Launch Outbound Test Call
  async function handleStartTestCall(e: React.FormEvent) {
    e.preventDefault();
    if (!targetPhone.trim()) {
      toast.error("Introduce un número de teléfono válido.");
      return;
    }
    setCalling(true);
    try {
      const res = await apiFetch<{ ok: boolean; callId?: string; error?: string }>("/api/vapi/test-call", {
        method: "POST",
        body: JSON.stringify({ phone: targetPhone.trim() }),
      });

      if (res.ok) {
        toast.success(`Llamada iniciada con éxito (ID: ${res.callId?.slice(0, 8)}). El teléfono sonará en segundos.`);
        setTestCallOpen(false);
        setTargetPhone("");
        loadCalls();
      } else {
        toast.error(res.error || "No se pudo iniciar la llamada.");
      }
    } catch (err: any) {
      toast.error("Error al lanzar llamada: " + (err?.message || ""));
    } finally {
      setCalling(false);
    }
  }

  // Toggle Needs Review
  async function handleToggleReview(call: Call) {
    try {
      const updated = await apiFetch<Call>(`/api/calls/${call.id}`, {
        method: "PATCH",
        body: JSON.stringify({ needsReview: !call.needsReview }),
      });
      setCalls((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (selectedCall?.id === updated.id) {
        setSelectedCall(updated);
      }
      toast.success(updated.needsReview ? "Marcada como pendiente de revisión" : "Marcada como resuelta");
    } catch (err: any) {
      toast.error("Error al actualizar llamada: " + (err?.message || ""));
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <PhoneCall className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-neutral-900">
                Canal Telefónico y Asistente de Voz VAPI
              </h1>
              <p className="text-sm text-neutral-500">
                Gestión integral de llamadas entrantes y salientes, transcripciones, audios y agenda por voz.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleSyncAllCalls}
            disabled={syncingAll}
            className="flex items-center gap-2"
            title="Descargar transcripciones, grabaciones y estados actualizados desde VAPI"
          >
            <RefreshCw className={cn("h-4 w-4", syncingAll && "animate-spin")} />
            Sincronizar con VAPI
          </Button>
          <Button
            variant="secondary"
            onClick={() => loadCalls()}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualizar
          </Button>
          <Button
            onClick={() => setTestCallOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <PhoneOutgoing className="h-4 w-4" />
            Probar Llamada Saliente
          </Button>
        </div>
      </div>

      {/* KPI Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Total Llamadas</span>
              <PhoneCall className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-neutral-900">{stats.totalCalls}</p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Requieren Revisión</span>
              <AlertTriangle className={cn("h-4 w-4", stats.needsReviewCount > 0 ? "text-amber-500" : "text-neutral-400")} />
            </div>
            <p className={cn("mt-2 text-2xl font-bold", stats.needsReviewCount > 0 ? "text-amber-600" : "text-neutral-900")}>
              {stats.needsReviewCount}
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Tiempo Total Hablado</span>
              <Clock className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {Math.round(stats.totalDurationSeconds / 60)} min
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Coste Acumulado</span>
              <DollarSign className="h-4 w-4 text-purple-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              ${(stats.totalCostCents / 100).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-neutral-200">
        <button
          onClick={() => setActiveTab("logs")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors",
            activeTab === "logs"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          )}
        >
          <PhoneIncoming className="h-4 w-4" />
          Registro de Llamadas ({totalCalls})
        </button>

        <button
          onClick={() => setActiveTab("studio")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors",
            activeTab === "studio"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          )}
        >
          <Settings2 className="h-4 w-4" />
          Estudio y Conexión VAPI
        </button>
      </div>

      {/* ─── TAB 1: CALL LOGS ─── */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Buscar por teléfono, cliente o resumen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadCalls()}
                className="pl-9 text-sm"
              />
            </div>

            <select
              value={directionFilter}
              onChange={(e) => {
                setDirectionFilter(e.target.value);
                loadCalls();
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700"
            >
              <option value="">Todas las direcciones</option>
              <option value="inbound">Entrantes</option>
              <option value="outbound">Salientes</option>
            </select>

            <select
              value={needsReviewFilter === undefined ? "" : String(needsReviewFilter)}
              onChange={(e) => {
                const val = e.target.value;
                setNeedsReviewFilter(val === "" ? undefined : val === "true");
                loadCalls();
              }}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700"
            >
              <option value="">Todo el estado</option>
              <option value="true">Requiere Revisión</option>
              <option value="false">Normal</option>
            </select>

            <Button variant="secondary" onClick={() => loadCalls()} className="text-sm">
              Filtrar
            </Button>
          </div>

          {/* Calls List */}
          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-neutral-200 bg-white">
              <div className="flex items-center gap-2 text-neutral-500">
                <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />
                <span>Cargando llamadas...</span>
              </div>
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <PhoneCall className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-neutral-900">No hay llamadas registradas</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Cuando los clientes llamen a tu número de VAPI o lances una llamada de prueba, aparecerán aquí.
              </p>
              <Button onClick={() => setTestCallOpen(true)} className="mt-4 bg-indigo-600 text-white">
                Probar Llamada Ahora
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-neutral-600">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase text-neutral-500">
                    <tr>
                      <th className="px-4 py-3">Tipo / Teléfono</th>
                      <th className="px-4 py-3">Contacto</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Duración</th>
                      <th className="px-4 py-3">Fecha y Hora</th>
                      <th className="px-4 py-3">Coste</th>
                      <th className="px-4 py-3">Grabación</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {calls.map((call) => {
                      const isIncoming = call.direction === "inbound";
                      const dateObj = call.startedAt ? new Date(call.startedAt) : new Date(call.createdAt);

                      return (
                        <tr key={call.id} className="hover:bg-neutral-50/80 transition-colors">
                          <td className="px-4 py-3 font-medium text-neutral-900">
                            <div className="flex items-center gap-2">
                              {isIncoming ? (
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600" title="Entrante">
                                  <PhoneIncoming className="h-4 w-4" />
                                </span>
                              ) : (
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600" title="Saliente">
                                  <PhoneOutgoing className="h-4 w-4" />
                                </span>
                              )}
                              <div>
                                <p className="text-sm font-semibold text-neutral-900">
                                  {call.fromNumber || call.toNumber || "Número Oculto"}
                                </p>
                                <span className="text-xs text-neutral-400 capitalize">{call.direction}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {call.contact ? (
                              <Link
                                href="/contacts"
                                className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:text-indigo-800"
                              >
                                <User className="h-3.5 w-3.5" />
                                {call.contact.name}
                              </Link>
                            ) : (
                              <span className="text-xs text-neutral-400">Sin asociar</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {call.status === "ended" && (
                                <Badge variant="success">Finalizada</Badge>
                              )}
                              {call.status === "in-progress" && (
                                <Badge variant="warning">En curso</Badge>
                              )}
                              {call.status === "failed" && (
                                <Badge variant="danger">Fallida</Badge>
                              )}
                              {call.needsReview && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                                  <AlertTriangle className="h-3 w-3" />
                                  Revisar
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {call.durationSeconds !== null ? `${call.durationSeconds}s` : "—"}
                          </td>

                          <td className="px-4 py-3 text-xs text-neutral-500">
                            {format(dateObj, "d MMM yyyy, HH:mm", { locale: es })}
                          </td>

                          <td className="px-4 py-3 font-mono text-xs">
                            {call.costCents !== null ? `$${(call.costCents / 100).toFixed(2)}` : "—"}
                          </td>

                          <td className="px-4 py-3">
                            {call.recordingUrl ? (
                              <button
                                onClick={() => handlePlayAudio(call)}
                                className={cn(
                                  "flex h-7 w-7 items-center justify-center rounded-full transition-all shadow-sm",
                                  playingAudioId === call.id
                                    ? "bg-indigo-600 text-white animate-pulse"
                                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                                )}
                                title={playingAudioId === call.id ? "Pausar" : "Escuchar audio"}
                              >
                                {playingAudioId === call.id ? (
                                  <Pause className="h-3.5 w-3.5" />
                                ) : (
                                  <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                                )}
                              </button>
                            ) : (
                              <span className="text-xs text-neutral-400">Sin audio</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="secondary"
                              onClick={() => setSelectedCall(call)}
                              className="text-xs py-1 px-2.5 h-8"
                            >
                              Detalle & Transcripción
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: VAPI STUDIO & CONFIGURATION ─── */}
      {activeTab === "studio" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column: Quick Actions & Status */}
          <div className="space-y-6 lg:col-span-1">
            {/* Status Card */}
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <Bot className="h-5 w-5 text-indigo-600" />
                Estado del Asistente VAPI
              </h3>

              <div className="rounded-lg bg-neutral-50 p-3 space-y-2 border border-neutral-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">API Key VAPI:</span>
                  {config?.hasApiKey ? (
                    <span className="font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Conectada
                    </span>
                  ) : (
                    <span className="font-semibold text-red-500 flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" /> Falta configurar
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">ID del Asistente:</span>
                  <span className="font-mono text-neutral-800 text-[11px] truncate max-w-[150px]">
                    {assistantId || "Sin publicar"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Número de Teléfono:</span>
                  <span className="font-medium text-neutral-800">{phoneNumber || "No vinculado"}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <Button
                  onClick={handleSyncTools}
                  disabled={syncingTools}
                  className="w-full bg-neutral-900 hover:bg-neutral-800 text-white flex items-center justify-center gap-2 text-xs h-9"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", syncingTools && "animate-spin")} />
                  Sincronizar 7 Herramientas en VAPI
                </Button>

                <Button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 text-xs h-9 shadow-sm"
                >
                  <Sparkles className={cn("h-3.5 w-3.5", publishing && "animate-spin")} />
                  Publicar / Actualizar Asistente
                </Button>
              </div>

              {/* Webhook Endpoint info */}
              <div className="pt-2 border-t border-neutral-100">
                <span className="text-xs font-semibold text-neutral-700 block mb-1">
                  URL del Webhook de este Servidor:
                </span>
                <code className="block rounded bg-neutral-100 p-2 text-[11px] font-mono text-neutral-800 break-all select-all">
                  {typeof window !== "undefined" ? `${window.location.origin}/api/vapi/webhook` : "/api/vapi/webhook"}
                </code>
              </div>
            </div>

            {/* Platform Latency & Cost Reference */}
            {catalog && (
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Estimación de Rendimiento
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-neutral-100">
                    <span className="text-neutral-500">Transcriptor ({transcriberModel}):</span>
                    <span className="font-semibold text-neutral-800">~320 ms · $0.01/min</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-neutral-100">
                    <span className="text-neutral-500">Modelo LLM ({llmModel}):</span>
                    <span className="font-semibold text-neutral-800">~800 ms · $0.01/min</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-neutral-100">
                    <span className="text-neutral-500">Voz ({voiceProvider}):</span>
                    <span className="font-semibold text-neutral-800">~490 ms · $0.036/min</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-neutral-100">
                    <span className="text-neutral-500">Plataforma VAPI:</span>
                    <span className="font-semibold text-neutral-800">$0.05/min</span>
                  </div>
                  <div className="flex justify-between pt-1 font-bold text-indigo-700 text-sm">
                    <span>Total Estimado:</span>
                    <span>~1.6s · ~$0.11 / min</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Configuration Forms */}
          <div className="space-y-6 lg:col-span-2">
            <form onSubmit={handleSaveConfig} className="space-y-6">
              {/* Credentials Section */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-indigo-600" />
                  Credenciales y Conexión
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <SecretInput
                      label="VAPI API Key (Private Key)"
                      hasValue={Boolean(config?.hasApiKey)}
                      value={apiKey}
                      onChange={(v) => setApiKey(v || "")}
                      placeholder="Introduce tu clave privada de VAPI"
                    />
                  </div>

                  <div>
                    <SecretInput
                      label="Webhook Token Secreto"
                      hasValue={Boolean(config?.hasWebhookToken)}
                      value={webhookToken}
                      onChange={(v) => setWebhookToken(v || "")}
                      placeholder="Token de autenticación webhook"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-neutral-700">
                        VAPI Phone Number ID
                      </label>
                      {availablePhones.length > 0 && (
                        <span className="text-[10px] text-emerald-600 font-semibold">
                          {availablePhones.length} en VAPI
                        </span>
                      )}
                    </div>
                    {availablePhones.length > 0 ? (
                      <select
                        value={phoneNumberId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPhoneNumberId(val);
                          const matched = availablePhones.find((p) => p.id === val);
                          if (matched) setPhoneNumber(matched.number);
                        }}
                        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-800 font-mono"
                      >
                        <option value="">-- Seleccionar número de VAPI --</option>
                        {availablePhones.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.number} ({p.name || p.id.slice(0, 8)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={phoneNumberId}
                        onChange={(e) => setPhoneNumberId(e.target.value)}
                        placeholder="ej. UUID (se autodetecta automáticamente)"
                      />
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">
                      Número Telefónico Mostrado (E.164)
                    </label>
                    <Input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="ej. +34919933764"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-neutral-700">
                      Teléfono de Derivación a Humano (Handoff Number)
                    </label>
                    <Input
                      value={handoffNumber}
                      onChange={(e) => setHandoffNumber(e.target.value)}
                      placeholder="ej. +34600112233 (al que se transferirá al cliente si pide una persona)"
                    />
                  </div>
                </div>
              </div>

              {/* Zadarma SIP Trunk Outbound Caller ID (+34) */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                    <PhoneOutgoing className="h-4 w-4 text-emerald-600" />
                    Línea Saliente de Zadarma (Caller ID +34)
                  </h3>
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Emite con tu número español
                  </span>
                </div>
                <p className="text-xs text-emerald-900/80 leading-relaxed">
                  Para que las llamadas salientes no muestren el número internacional (+44) y salgan a través de tu cuenta de Zadarma con tu número <strong>+34 919 93 34 03</strong>, introduce aquí la contraseña de tu SIP de Zadarma.
                </p>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">
                      Servidor SIP
                    </label>
                    <Input
                      value={sipGateway}
                      onChange={(e) => setSipGateway(e.target.value)}
                      placeholder="sip.zadarma.com"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">
                      Usuario / Login SIP (Zadarma)
                    </label>
                    <Input
                      value={sipUsername}
                      onChange={(e) => setSipUsername(e.target.value)}
                      placeholder="ej. 368228"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">
                      Contraseña SIP
                    </label>
                    <Input
                      type="password"
                      value={sipPassword}
                      onChange={(e) => setSipPassword(e.target.value)}
                      placeholder="Contraseña de la línea SIP"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleValidateZadarmaIp}
                    disabled={validatingIp}
                    className="text-xs flex items-center gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                    title="Envía una llamada de comprobación a Zadarma para que valide la IP y pase a Confirmado"
                  >
                    <PhoneOutgoing className={cn("h-3.5 w-3.5", validatingIp && "animate-spin")} />
                    {validatingIp ? "Validando IP con Zadarma..." : "Validar IP en Zadarma (Llamada Eco 4444 / 8888)"}
                  </Button>

                  <Button
                    type="button"
                    onClick={handleConnectSipTrunk}
                    disabled={connectingSip || !sipUsername || !sipPassword}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", connectingSip && "animate-spin")} />
                    {connectingSip ? "Vinculando con VAPI..." : "Vincular Línea Zadarma con VAPI"}
                  </Button>
                </div>
              </div>

              {/* Models & Voices Section */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-indigo-600" />
                  Pila de Modelos de Inteligencia Artificial
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* LLM Model */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">
                      Modelo de Lenguaje (LLM)
                    </label>
                    <select
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800"
                    >
                      <option value="gpt-5.6-luna">OpenAI GPT-5.6 Luna (Recomendado para Voz)</option>
                      <option value="gpt-4o-mini">OpenAI GPT-4o Mini (Ultra Rápido)</option>
                      <option value="gpt-4o">OpenAI GPT-4o (Completo)</option>
                      <option value="claude-3-5-sonnet-20241022">Anthropic Claude 3.5 Sonnet</option>
                      <option value="claude-3-5-haiku-20241022">Anthropic Claude 3.5 Haiku</option>
                      <option value="llama-3.3-70b-versatile">Groq Llama 3.3 70B (380ms)</option>
                    </select>
                  </div>

                  {/* Transcriber */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">
                      Transcriptor de Voz (STT)
                    </label>
                    <select
                      value={transcriberModel}
                      onChange={(e) => setTranscriberModel(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800"
                    >
                      <option value="nova-3-general">Deepgram Nova 3 General (Español Global)</option>
                      <option value="nova-2">Deepgram Nova 2</option>
                    </select>
                  </div>

                  {/* Voice Provider & Voice ID */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">
                      Proveedor y Voz (TTS)
                    </label>
                    <select
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800"
                    >
                      <option value="UOIqAnmS11Reiei1Ytkc">ElevenLabs: Carolina / Burt (Español Natural)</option>
                      <option value="21m00Tcm4TlvDq8ikWAM">ElevenLabs: Rachel (Profesional)</option>
                      <option value="AZnzlk1XvdvUeBnXmlld">ElevenLabs: Domi (Cálida)</option>
                      <option value="alloy">OpenAI: Alloy</option>
                      <option value="f114a467-c40a-4db8-964d-aaba16120898">Cartesia: Español Femenino (160ms)</option>
                    </select>
                  </div>

                  {/* Tone */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">
                      Tono de la Conversación
                    </label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800"
                    >
                      <option value="professional">Profesional y resolutivo</option>
                      <option value="friendly">Cálido y amigable</option>
                      <option value="empathetic">Empático y cercano</option>
                      <option value="formal">Formal</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Prompt Editor & Preview */}
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    System Prompt y Reglas
                  </h3>

                  <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isOverrideActive}
                      onChange={(e) => setIsOverrideActive(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Personalizar prompt manualmente</span>
                  </label>
                </div>

                {isOverrideActive ? (
                  <div>
                    <Textarea
                      rows={12}
                      value={systemPromptOverride}
                      onChange={(e) => setSystemPromptOverride(e.target.value)}
                      placeholder="Escribe aquí tu prompt personalizado completo..."
                      className="font-mono text-xs"
                    />
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Nota: Al activar el modo manual, el prompt se publicará literalmente como lo escribas aquí.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-neutral-500">
                        Vista previa del prompt generado dinámicamente con servicios y horarios:
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={refreshPromptPreview}
                        disabled={loadingPrompt}
                        className="text-xs py-0.5 px-2 h-7"
                      >
                        <RefreshCw className={cn("h-3 w-3 mr-1", loadingPrompt && "animate-spin")} />
                        Recargar
                      </Button>
                    </div>
                    <pre className="max-h-64 overflow-y-auto rounded-lg bg-neutral-900 p-3 font-mono text-[11px] text-neutral-200 whitespace-pre-wrap">
                      {promptPreview || "Cargando prompt..."}
                    </pre>
                  </div>
                )}
              </div>

              {/* Submit Save */}
              <div className="flex justify-end gap-3">
                <Button
                  type="submit"
                  disabled={savingConfig}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 shadow-sm"
                >
                  {savingConfig ? "Guardando..." : "Guardar Configuración"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: DETALLE Y TRANSCRIPCIÓN ─── */}
      {selectedCall && (
        <Modal
          open={Boolean(selectedCall)}
          onClose={() => setSelectedCall(null)}
          title={`Detalle de Llamada (${selectedCall.direction === "inbound" ? "Entrante" : "Saliente"})`}
        >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {/* Call Header Summary */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 p-3 text-xs border border-neutral-200">
              <div>
                <span className="text-neutral-500">Teléfono:</span>{" "}
                <span className="font-semibold text-neutral-900">
                  {selectedCall.fromNumber || selectedCall.toNumber || "Desconocido"}
                </span>
                {selectedCall.contact && (
                  <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 font-medium">
                    {selectedCall.contact.name}
                  </span>
                )}
              </div>

              <div>
                <span className="text-neutral-500">Duración:</span>{" "}
                <span className="font-semibold text-neutral-900">{selectedCall.durationSeconds || 0}s</span>
                <span className="mx-2 text-neutral-300">|</span>
                <span className="text-neutral-500">Coste:</span>{" "}
                <span className="font-semibold text-neutral-900">
                  ${selectedCall.costCents ? (selectedCall.costCents / 100).toFixed(2) : "0.00"}
                </span>
              </div>
            </div>

            {/* Audio Player */}
            {(selectedCall.recordingUrl || selectedCall.vapiCallId) && (
              <div className="rounded-lg border border-neutral-200 p-3 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5">
                    <Volume2 className="h-4 w-4 text-indigo-600" />
                    Grabación de Audio
                  </span>
                  <a
                    href={`/api/calls/${selectedCall.id}/recording`}
                    download={`grabacion-${selectedCall.fromNumber || "llamada"}.mp3`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  >
                    Descargar MP3
                  </a>
                </div>
                <audio
                  controls
                  className="w-full h-9"
                  src={`/api/calls/${selectedCall.id}/recording`}
                  preload="metadata"
                >
                  Tu navegador no soporta el elemento de audio.
                </audio>
              </div>
            )}

            {/* AI Summary */}
            {selectedCall.summary && (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 mb-1">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  Resumen de la Conversación (IA)
                </h4>
                <p className="text-xs text-indigo-900 leading-relaxed">{selectedCall.summary}</p>
              </div>
            )}

            {/* Full Transcript */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Transcripción Completa
                </h4>
                <Button
                  variant="secondary"
                  onClick={() => handleSyncCall(selectedCall.id)}
                  disabled={syncingCallId === selectedCall.id}
                  className="text-[11px] h-7 px-2.5 flex items-center gap-1.5"
                  title="Descargar transcripción, audio y estado actualizado directamente desde VAPI"
                >
                  <RefreshCw className={cn("h-3 w-3", syncingCallId === selectedCall.id && "animate-spin")} />
                  {syncingCallId === selectedCall.id ? "Sincronizando..." : "Actualizar desde VAPI"}
                </Button>
              </div>

              {selectedCall.messages && selectedCall.messages.length > 0 ? (
                <div className="space-y-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 max-h-72 overflow-y-auto">
                  {selectedCall.messages.map((m, idx) => {
                    const isBot = m.role === "assistant" || m.role === "bot";
                    const isUser = m.role === "user" || m.role === "customer";
                    const isTool = m.role === "tool" || m.role === "function" || m.role === "tool_call_result";

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "rounded-lg p-2.5 text-xs max-w-[88%] leading-relaxed",
                          isBot && "bg-white border border-neutral-200 text-neutral-800 mr-auto",
                          isUser && "bg-indigo-600 text-white ml-auto",
                          isTool && "bg-amber-50 border border-amber-200 text-amber-900 font-mono text-[11px] mx-auto"
                        )}
                      >
                        <div className="mb-1 text-[10px] font-bold opacity-75 uppercase">
                          {isBot ? "Asistente" : isUser ? "Cliente" : "Herramienta Agenda"}
                        </div>
                        <p className="whitespace-pre-wrap">{m.message}</p>
                      </div>
                    );
                  })}
                </div>
              ) : selectedCall.transcript ? (
                <pre className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800 whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {selectedCall.transcript}
                </pre>
              ) : (
                <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-center bg-neutral-50/50">
                  <p className="text-xs text-neutral-500 mb-3">No hay transcripción almacenada en la base de datos para esta llamada.</p>
                  <Button
                    variant="secondary"
                    onClick={() => handleSyncCall(selectedCall.id)}
                    disabled={syncingCallId === selectedCall.id}
                    className="text-xs mx-auto"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncingCallId === selectedCall.id && "animate-spin")} />
                    {syncingCallId === selectedCall.id ? "Consultando VAPI..." : "Obtener Transcripción de VAPI"}
                  </Button>
                </div>
              )}
            </div>

            {/* Review Status Action */}
            <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
              <Button
                variant="secondary"
                onClick={() => handleToggleReview(selectedCall)}
                className={cn(
                  "text-xs flex items-center gap-1.5",
                  selectedCall.needsReview ? "text-amber-700 bg-amber-50 hover:bg-amber-100" : "text-neutral-700"
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {selectedCall.needsReview ? "Marcar como Resuelta" : "Marcar para Revisión del Equipo"}
              </Button>

              <Button variant="secondary" onClick={() => setSelectedCall(null)} className="text-xs">
                Cerrar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODAL: TEST OUTBOUND CALL ─── */}
      {testCallOpen && (
        <Modal
          open={testCallOpen}
          onClose={() => setTestCallOpen(false)}
          title="Lanzar Llamada Saliente de Prueba"
        >
          <form onSubmit={handleStartTestCall} className="space-y-4">
            <p className="text-xs text-neutral-600">
              El asistente inteligente de VAPI marcará inmediatamente al número que indiques. Al descolgar, comenzará la conversación simulando un cliente o recordatorio de cita.
            </p>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Número de Teléfono Destino (con prefijo internacional) <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="ej. +34600112233"
                value={targetPhone}
                onChange={(e) => setTargetPhone(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setTestCallOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={calling}
                className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
              >
                <PhoneOutgoing className="h-4 w-4" />
                {calling ? "Marcando..." : "Llamar Ahora"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
