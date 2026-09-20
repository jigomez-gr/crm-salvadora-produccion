"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  MessageSquare,
  X,
  Send,
  RotateCcw,
  CheckCircle2,
  Maximize2,
  ChevronRight,
  Phone,
  User,
  Mail,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  HeartHandshake,
  Compass,
  Users,
  FolderTree,
  Video,
  Layers,
  Filter,
  ExternalLink,
  Film,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SimuladorDiagnosticoModal } from "@/components/SimuladorDiagnosticoModal";

interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
}

interface WidgetCategory {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
}

interface WidgetService {
  id: string;
  name: string;
  description?: string;
  serviceType: "recurring" | "event";
  eventDatesText?: string;
  scheduleText?: string;
  maxCapacity?: number;
  minQuorum?: number;
  durationMinutes: number;
  price?: string;
  paymentType: "stripe" | "external_url" | "in_person" | "free";
  externalPaymentUrl?: string;
  calendarId?: string;
  allowedModalities?: string[];
  requiresReason?: boolean;
  reminderNotes?: string;
  displayOrder?: number;
  flyerUrl?: string;
  flyerPath?: string;
  flyerParticularUrl?: string;
  flyerParticularPath?: string;
  videoParticularUrl?: string;
  videoParticularPath?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  category?: WidgetCategory | null;
}

function ServiceMediaPreview({ svc }: { svc: WidgetService }) {
  const videoSrc = svc.videoParticularUrl || svc.videoParticularPath;
  const flyerSrc =
    svc.flyerParticularUrl ||
    svc.flyerParticularPath ||
    svc.flyerUrl ||
    svc.flyerPath;
  const hasBoth = Boolean(videoSrc && flyerSrc);

  const [activeTab, setActiveTab] = useState<"video" | "flyer">("video");
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  if (!videoSrc && !flyerSrc) return null;

  return (
    <div className="mb-4">
      {hasBoth && (
        <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
            Contenido
          </span>
          <div className="inline-flex rounded-lg bg-stone-100 p-0.5 border border-stone-200 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("video")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeTab === "video"
                  ? "bg-white text-[#800020] shadow-xs border border-stone-200/80"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Ver Vídeo</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("flyer")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeTab === "flyer"
                  ? "bg-white text-[#0B4A72] shadow-xs border border-stone-200/80"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Ver Flyer</span>
            </button>
          </div>
        </div>
      )}

      {/* Visor Multimedia Principal */}
      {(activeTab === "video" && videoSrc) || (!flyerSrc && videoSrc) ? (
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-xs">
          <video
            src={videoSrc}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        </div>
      ) : flyerSrc ? (
        <div className="relative group aspect-video w-full rounded-2xl overflow-hidden bg-stone-100 shadow-xs">
          <img
            src={flyerSrc}
            alt={svc.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300 cursor-pointer"
            onClick={() => setIsZoomOpen(true)}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
          <button
            type="button"
            onClick={() => setIsZoomOpen(true)}
            className="absolute bottom-2.5 right-2.5 bg-black/70 hover:bg-black/90 text-white text-[11px] font-medium px-2.5 py-1 rounded-lg backdrop-blur-xs flex items-center gap-1 shadow-sm transition opacity-90 group-hover:opacity-100 cursor-pointer"
            title="Ampliar flyer"
          >
            <Maximize2 className="w-3 h-3" /> Ampliar flyer
          </button>
        </div>
      ) : null}

      {/* Modal Zoom / Lightbox para el flyer */}
      {isZoomOpen && flyerSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm transition-opacity"
          onClick={() => setIsZoomOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-stone-950 rounded-2xl overflow-hidden shadow-2xl border border-stone-800 p-3 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-2 px-2 text-white border-b border-stone-800 mb-2">
              <span className="text-xs font-semibold text-stone-200 truncate max-w-xs sm:max-w-md">
                {svc.name} {svc.flyerParticularUrl || svc.flyerParticularPath ? "— Flyer Informativo" : ""}
              </span>
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="p-1.5 rounded-full text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto max-h-[78vh] flex items-center justify-center">
              <img
                src={flyerSrc}
                alt={svc.name}
                className="max-h-[76vh] w-auto object-contain rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DemoLandingPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [simuladorOpen, setSimuladorOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [businessName, setBusinessName] = useState("Centro de Yoga y Bienestar Salvadora");
  const [selectedService, setSelectedService] = useState<string | null>(null);

  // Dynamic services & filters
  const [services, setServices] = useState<WidgetService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");

  // WhatsApp Handoff Form State
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waName, setWaName] = useState("");
  const [waPhone, setWaPhone] = useState("");
  const [waEmail, setWaEmail] = useState("");
  const [waLoading, setWaLoading] = useState(false);
  const [waSuccess, setWaSuccess] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let currentSess = localStorage.getItem("crm_widget_demo_session");
    if (!currentSess) {
      currentSess = "sess_" + Math.random().toString(36).substring(2, 9);
      localStorage.setItem("crm_widget_demo_session", currentSess);
    }
    setSessionId(currentSess);

    const API_BASE =
      typeof window !== "undefined" && window.location.origin.includes("crm-")
        ? ""
        : (process.env.NEXT_PUBLIC_API_URL || "https://crm-salvadoraconesa.jigretera.com");

    fetch(`${API_BASE}/api/widget/services`)
      .then((r) => r.json())
      .then((data) => {
        const rawList = Array.isArray(data) ? data : (data && Array.isArray(data.services) ? data.services : []);
        const normalized = rawList.map((s: any) => ({
          ...s,
          category: s.category || (s.categoryId || s.categoryName ? {
            id: s.categoryId || s.categoryCode || "cat-default",
            code: s.categoryCode || "general",
            name: s.categoryName || "General",
            displayOrder: s.category?.displayOrder ?? 0,
          } : null),
        }));
        setServices(normalized);
        setServicesLoading(false);
      })
      .catch((err) => {
        console.error("Error cargando servicios del widget:", err);
        setServicesLoading(false);
      });

    fetch("/api/widget/config/booking")
      .then((r) => r.json())
      .then((data) => {
        if (data.businessName) setBusinessName(data.businessName);
        setMessages([
          {
            id: "greeting",
            direction: "outbound",
            body:
              data.greeting ||
              "¡Hola! Te damos la bienvenida al Centro de Yoga y Bienestar Salvadora Conesa y Club Social Parque Granada. ¿En qué actividad, clase o retiro te gustaría información o reservar tu plaza?",
          },
        ]);
      })
      .catch(() => {
        setMessages([
          {
            id: "greeting-fallback",
            direction: "outbound",
            body:
              "¡Hola! 👋 Te damos la bienvenida al Centro de Yoga y Bienestar Salvadora Conesa & Parque Granada. ¿Qué actividad o clase te gustaría consultar o reservar?",
          },
        ]);
      });
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, WidgetCategory>();
    services.forEach((s) => {
      if (s.category && s.category.id) {
        map.set(s.category.id, s.category);
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [services]);

  const filteredServices = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return services.filter((s) => {
      if (s.fechaDesde && s.fechaDesde.slice(0, 10) > today) return false;
      if (s.fechaHasta && s.fechaHasta.slice(0, 10) < today) return false;
      if (selectedCategory !== "all") {
        if (selectedCategory === "none" && s.category) return false;
        if (selectedCategory !== "none" && s.category?.id !== selectedCategory) return false;
      }
      if (selectedType !== "all" && s.serviceType !== selectedType) return false;
      return true;
    });
  }, [services, selectedCategory, selectedType]);

  const groupedServices = useMemo(() => {
    const groups: { category: WidgetCategory | null; services: WidgetService[] }[] = [];

    for (const cat of categories) {
      if (selectedCategory !== "all" && selectedCategory !== cat.id) continue;
      const catServices = filteredServices
        .filter((s) => s.category?.id === cat.id)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      if (catServices.length > 0) {
        groups.push({ category: cat, services: catServices });
      }
    }

    if (selectedCategory === "all" || selectedCategory === "none") {
      const uncategorized = filteredServices
        .filter((s) => !s.category?.id)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      if (uncategorized.length > 0) {
        groups.push({ category: null, services: uncategorized });
      }
    }

    return groups;
  }, [categories, filteredServices, selectedCategory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = async (textToSend?: string, serviceName?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text && !serviceName) return;

    if (serviceName) setSelectedService(serviceName);

    const userMsg: ChatMessage = {
      id: "user_" + Date.now(),
      direction: "inbound",
      body: text || `Información y reserva para ${serviceName}`,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    const API_BASE =
      typeof window !== "undefined" && window.location.origin.includes("crm-")
        ? ""
        : (process.env.NEXT_PUBLIC_API_URL || "https://crm-salvadoraconesa.jigretera.com");

    try {
      const res = await fetch(`${API_BASE}/api/widget/chat/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId || "sess_demo",
          message: text || `Información y reserva para ${serviceName}`,
          serviceName: serviceName,
        }),
      });
      const data = await res.json();
      setIsTyping(false);
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: "bot_" + Date.now(),
            direction: "outbound",
            body: data.reply,
          },
        ]);
      }
    } catch {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: "err_" + Date.now(),
          direction: "outbound",
          body: "Disculpa, ha ocurrido un error al conectar con el asistente. Inténtalo de nuevo.",
        },
      ]);
    }
  };

  const handleServiceSelect = (svc: WidgetService) => {
    setIsOpen(true);
    setSelectedService(svc.name);
    const msg = `Hola, me gustaría información y disponibilidad para el servicio "${svc.name}". ¿Qué plazas u horarios tenéis?`;
    handleSend(msg, svc.name);
  };

  const handleWhatsAppHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waPhone.trim()) return;

    setWaLoading(true);
    const API_BASE =
      typeof window !== "undefined" && window.location.origin.includes("crm-")
        ? ""
        : (process.env.NEXT_PUBLIC_API_URL || "https://crm-salvadoraconesa.jigretera.com");

    try {
      const res = await fetch(`${API_BASE}/api/widget/handoff-whatsapp/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId || "sess_demo",
          name: waName.trim() || "Visitante Web",
          phone: waPhone.trim(),
          email: waEmail.trim() || undefined,
          serviceName: selectedService || undefined,
          note: "Handoff solicitado desde la landing web para continuar por WhatsApp.",
        }),
      });
      const data = await res.json();
      setWaLoading(false);
      setWaSuccess(true);

      setMessages((prev) => [
        ...prev,
        {
          id: "handoff_" + Date.now(),
          direction: "outbound",
          body: `📲 ¡Perfecto, ${waName || "amig@"}! Te hemos dado de alta en nuestro sistema con el teléfono **${waPhone}**. Ya puedes continuar la conversación directamente en WhatsApp.`,
        },
      ]);

      setTimeout(() => {
        if (data.whatsappUrl) {
          window.open(data.whatsappUrl, "_blank");
        }
        setWaModalOpen(false);
        setWaSuccess(false);
      }, 1200);
    } catch {
      setWaLoading(false);
      alert("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    }
  };

  const resetChat = () => {
    const newSess = "sess_" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("crm_widget_demo_session", newSess);
    setSessionId(newSess);
    setSelectedService(null);
    setMessages([
      {
        id: "greeting-reset",
        direction: "outbound",
        body: "¡Hola de nuevo! He reiniciado la conversación. ¿Qué actividad o servicio te gustaría consultar?",
      },
    ]);
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#1E1E1E] font-sans selection:bg-[#800020] selection:text-white relative">
      {/* Top Banner CRM Notification */}
      <div className="bg-[#800020] text-white px-3 sm:px-4 py-2 text-xs shadow-md sticky top-0 z-40 border-b border-amber-500/20">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">
              <strong>Portal de Reservas & Traspaso a WhatsApp:</strong> Prueba el registro de alumnos y citas en tiempo real.
            </span>
          </div>
          <Link
            href="/conversations"
            className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 px-3 py-1 rounded text-xs font-bold transition whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Volver al CRM Inbox
          </Link>
        </div>
      </div>

      {/* Notice Header - Parque Granada & Centro */}
      <div className="bg-[#0B4A72] text-white px-3 sm:px-4 py-2 text-xs text-center font-bold tracking-wide flex items-center justify-center gap-3 sm:gap-4 flex-wrap shadow-inner">
        <span>📍 CLUB SOCIAL PARQUE GRANADA & CENTRO SALVADORA CONESA</span>
        <span className="bg-emerald-500 text-white px-2.5 py-0.5 rounded text-[11px] font-extrabold uppercase tracking-wide">
          💳 Pagos en el Centro · Pronto también con Stripe y Giglon
        </span>
        <button
          onClick={() => setSimuladorOpen(true)}
          className="inline-flex items-center gap-1 bg-amber-400 hover:bg-amber-300 text-stone-950 px-3 py-0.5 rounded-full text-xs font-bold transition shadow-xs"
        >
          🔬 Simulador IA
        </button>
        <button
          onClick={() => setWaModalOpen(true)}
          className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 px-3 py-0.5 rounded-full text-white font-semibold transition shadow-xs"
        >
          📱 Continuar por WhatsApp
        </button>
      </div>

      {/* Main Header */}
      <header className="bg-white border-b border-stone-200 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <span className="text-[10px] tracking-widest text-[#0B4A72] uppercase font-extrabold">
              CENTRO DE YOGA & BIENESTAR INTEGRAL
            </span>
            <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#800020] tracking-wide uppercase">
              Salvadora Conesa
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <a
              href="https://www.instagram.com/escuelayogasalvadoraconesa/"
              target="_blank"
              rel="noopener noreferrer"
              title="Instagram @escuelayogasalvadoraconesa"
              className="p-2 rounded-lg border border-pink-500/30 text-pink-600 hover:bg-pink-50 transition shadow-2xs flex items-center gap-1 text-xs font-semibold"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              <span className="hidden md:inline">Instagram</span>
            </a>

            <a
              href="https://www.facebook.com/share/1EhbRPtem8/"
              target="_blank"
              rel="noopener noreferrer"
              title="Facebook Escuela Yoga Salvadora Conesa"
              className="p-2 rounded-lg border border-blue-500/30 text-blue-600 hover:bg-blue-50 transition shadow-2xs flex items-center gap-1 text-xs font-semibold"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span className="hidden md:inline">Facebook</span>
            </a>

            <button
              onClick={() => setSimuladorOpen(true)}
              className="bg-amber-400 hover:bg-amber-500 text-stone-950 px-3 py-2 rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Simulador IA
            </button>
            <button
              onClick={() => setWaModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5" /> WhatsApp Alta Rápida
            </button>
            <button
              onClick={() => setIsOpen(true)}
              className="bg-[#800020] text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-[#800020]/90 transition shadow-xs flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Abrir Asistente
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 pt-8 pb-6">
        <div className="bg-linear-to-r from-[#800020]/10 via-amber-500/10 to-[#0B4A72]/10 rounded-3xl p-6 sm:p-10 border border-stone-300 shadow-sm text-center sm:text-left space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold uppercase tracking-wider border border-emerald-300">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Yoga, Longevidad, Bienestar y Artes Tradicionales
          </div>
          <h2 className="font-serif text-2xl sm:text-4xl font-extrabold text-[#800020] leading-tight">
            Descubre tus Actividades de Salud, Conciencia y Armonía
          </h2>
          <p className="text-stone-700 text-sm sm:text-base max-w-3xl leading-relaxed">
            Explora las clases regulares de <strong>Hatha Yoga Terapéutico</strong>, nuestro programa <strong>Bienestar Experience (Longevidad & Biohacking)</strong>, las sesiones de <strong>Iaidō</strong> en Parque Granada, meditaciones y retiros especiales. <strong>Pagos en el centro</strong> (pronto también disponibles online con <strong>Stripe</strong> y venta de entradas en <strong>Giglon</strong>).
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-2">
            <button
              onClick={() => setIsOpen(true)}
              className="bg-[#800020] hover:bg-[#800020]/90 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
            >
              <Calendar className="w-4 h-4" /> Consultar Disponibilidad en Vivo
            </button>
            <button
              onClick={() => setWaModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
            >
              <Phone className="w-4 h-4" /> Traspasar Consulta a WhatsApp
            </button>
          </div>
        </div>
      </section>

      {/* ─── FILTROS DINÁMICOS DE CATÁLOGO (CATEGORÍAS Y TIPOS) ─── */}
      <section className="max-w-6xl mx-auto px-4 pt-4 pb-2">
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#800020]" />
              <span className="text-xs font-bold uppercase tracking-wider text-stone-800">
                Filtros del Catálogo en Vivo
              </span>
              <span className="text-[11px] text-stone-500 font-medium">
                ({filteredServices.length} {filteredServices.length === 1 ? "servicio disponible" : "servicios disponibles"})
              </span>
            </div>

            {/* Selector de Tipo */}
            <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl">
              <button
                onClick={() => setSelectedType("all")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition",
                  selectedType === "all"
                    ? "bg-white text-[#800020] shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                Todos los tipos
              </button>
              <button
                onClick={() => setSelectedType("recurring")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition",
                  selectedType === "recurring"
                    ? "bg-white text-[#800020] shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                Clases periódicas
              </button>
              <button
                onClick={() => setSelectedType("event")}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition",
                  selectedType === "event"
                    ? "bg-white text-[#800020] shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                Viajes y eventos puntuales
              </button>
            </div>
          </div>

          {/* Selector de Categorías */}
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-stone-100">
            <span className="text-[11px] font-semibold text-stone-500 mr-1 flex items-center gap-1">
              <FolderTree className="w-3 h-3 text-amber-600" /> Categorías:
            </span>
            <button
              onClick={() => setSelectedCategory("all")}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-semibold transition border",
                selectedCategory === "all"
                  ? "bg-[#800020] text-white border-[#800020]"
                  : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
              )}
            >
              Todas las categorías
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-semibold transition border",
                  selectedCategory === cat.id
                    ? "bg-[#800020] text-white border-[#800020]"
                    : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                )}
              >
                📁 {cat.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SERVICIOS DINÁMICOS AGRUPADOS POR CATEGORÍA Y ORDEN ─── */}
      {servicesLoading ? (
        <section className="max-w-6xl mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 text-stone-600 text-sm font-medium">
            <span className="w-4 h-4 rounded-full border-2 border-[#800020] border-t-transparent animate-spin" />
            Cargando catálogo en tiempo real desde el CRM...
          </div>
        </section>
      ) : groupedServices.length === 0 ? (
        <section className="max-w-6xl mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-stone-200 p-8 max-w-md mx-auto space-y-2">
            <p className="text-stone-700 font-semibold text-sm">No se han encontrado servicios disponibles.</p>
            <p className="text-xs text-stone-500">Prueba a cambiar los filtros de categoría o tipo de actividad.</p>
            <button
              onClick={() => {
                setSelectedCategory("all");
                setSelectedType("all");
              }}
              className="mt-2 text-xs font-bold text-[#800020] hover:underline"
            >
              Restablecer filtros
            </button>
          </div>
        </section>
      ) : (
        groupedServices.map((group, idx) => (
          <section key={group.category?.id || `uncat-${idx}`} className="max-w-6xl mx-auto px-4 py-8">
            <div className="mb-6 pb-3 border-b-2 border-[#0B4A72]/40 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#0B4A72] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  {group.category ? `CATEGORÍA: ${group.category.name.toUpperCase()}` : "ACTIVIDADES Y DISCIPLINAS"}
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 mt-1">
                  {group.category ? group.category.name : "Servicios Generales"}
                </h3>
              </div>
              <span className="text-xs text-stone-600 font-semibold bg-stone-100 px-3 py-1 rounded-full border border-stone-200 self-start sm:self-auto">
                {group.services.length} {group.services.length === 1 ? "actividad" : "actividades"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {group.services.map((svc) => (
                <div
                  key={svc.id}
                  className="bg-white rounded-3xl border border-stone-200 p-5 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between hover:border-[#800020] relative overflow-hidden group"
                >
                  <div>
                    {/* Visor Multimedia Inteligente (Vídeo / Flyer / Selector) */}
                    <ServiceMediaPreview svc={svc} />

                    {/* Cabecera de Ficha: Categoría y Precio */}
                    <div className="flex items-center justify-between gap-1 mb-2.5 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 flex items-center gap-1 border border-stone-200">
                        📁 {svc.category?.name || "General"}
                      </span>
                      <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                        {svc.price ? `${svc.price} €` : svc.paymentType === "free" ? "Gratuito" : "Consultar"}
                      </span>
                    </div>

                    {svc.serviceType === "event" && (
                      <div className="mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200 inline-block">
                          🧭 Viaje / Evento puntual
                        </span>
                      </div>
                    )}

                    <h4 className="font-serif text-lg font-bold text-stone-900 mb-1.5 leading-snug group-hover:text-[#800020] transition-colors">
                      {svc.name}
                    </h4>

                    {svc.description && (
                      <p className="text-xs text-stone-600 leading-relaxed mb-3 line-clamp-3">
                        {svc.description}
                      </p>
                    )}

                    {/* Fechas para eventos / Horarios oficiales */}
                    {svc.serviceType === "event" && svc.eventDatesText && (
                      <div className="bg-purple-50 rounded-xl p-2.5 border border-purple-200 text-xs text-purple-950 font-semibold mb-3 flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                        <span>Fechas: {svc.eventDatesText}</span>
                      </div>
                    )}

                    {svc.scheduleText && (
                      <div className="bg-[#FAF9F6] rounded-xl p-2.5 border border-stone-200 text-xs space-y-1 mb-3">
                        <div className="font-bold text-[#800020] text-[11px] uppercase flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#0B4A72]" /> Horarios oficiales:
                        </div>
                        <p className="text-[11px] text-stone-800">{svc.scheduleText}</p>
                      </div>
                    )}

                    {svc.reminderNotes && (
                      <div className="text-[11px] text-amber-900 bg-amber-50/70 p-2 rounded-lg border border-amber-200/60 mb-3 italic">
                        💡 {svc.reminderNotes}
                      </div>
                    )}

                    {/* Meta info: Duración, Aforo, Modalidades */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 mb-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-stone-400" /> {svc.durationMinutes} min
                      </span>
                      {svc.maxCapacity && svc.maxCapacity > 1 && (
                        <span className="flex items-center gap-1 text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                          <Users className="w-3 h-3 text-indigo-500" /> Aforo: {svc.maxCapacity} plazas
                        </span>
                      )}
                      {svc.allowedModalities && svc.allowedModalities.length > 0 && (
                        <span className="text-[10px] text-stone-500">
                          ({svc.allowedModalities.map((m) => m === "in_person" ? "Presencial" : m === "phone" ? "Telefónica" : "Online").join(", ")})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acciones de Reserva y WhatsApp */}
                  <div className="pt-3 border-t border-stone-100 space-y-2">
                    <button
                      onClick={() => handleServiceSelect(svc)}
                      className="w-full py-2.5 px-4 bg-[#800020] hover:bg-[#800020]/90 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-xs"
                    >
                      <Calendar className="w-4 h-4" /> Reservar / Consultar Disponibilidad
                    </button>
                    <div className="flex items-center justify-between text-xs pt-1">
                      <button
                        onClick={() => {
                          setSelectedService(svc.name);
                          setWaModalOpen(true);
                        }}
                        className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1"
                      >
                        <Phone className="w-3.5 h-3.5" /> Pedir por WhatsApp
                      </button>
                      {svc.paymentType === "external_url" && svc.externalPaymentUrl ? (
                        <a
                          href={svc.externalPaymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
                        >
                          Giglon / Entradas <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-stone-500 text-[11px]">
                          {svc.paymentType === "free" ? "Gratuito" : "Pago en centro / Stripe"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {/* Footer */}
      <footer className="bg-stone-900 text-stone-400 text-xs py-10 border-t border-stone-800 space-y-5">
        <div className="max-w-6xl mx-auto px-4 text-center space-y-2">
          <p className="font-semibold text-stone-300">
            CENTRO DE YOGA & BIENESTAR SALVADORA CONESA · FUENLABRADA
          </p>
          <p>Actividades en Club Social Parque Granada (Cafetería Bar • Entrada Libre).</p>
          <p className="text-stone-400 text-[11px]">
            Consultas y reservas por WhatsApp: <strong>695 172 625</strong> · <strong>Pagos en el centro</strong> (pronto también disponibles con <strong>Stripe</strong> y <strong>Giglon</strong>).
          </p>
        </div>

        {/* Legal Links, Copyright and Webmaster */}
        <div className="max-w-6xl mx-auto px-4 pt-4 border-t border-stone-800 text-center space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-stone-400">
            <a
              href="https://salvadora.jigretera.com/politica-de-privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-amber-400 transition"
            >
              Política de Privacidad
            </a>
            <span className="text-stone-600 select-none">•</span>
            <a
              href="https://salvadora.jigretera.com/politica-de-cookies"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-amber-400 transition"
            >
              Política de Cookies
            </a>
            <span className="text-stone-600 select-none">•</span>
            <a
              href="https://salvadora.jigretera.com/ley-de-proteccion-de-datos"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-amber-400 transition"
            >
              Ley de Protección de Datos
            </a>
          </div>

          <p className="text-[11px] text-stone-500">
            © 2026 Centro de Yoga Fuenlabrada Salvadora Conesa. Todos los derechos reservados.
          </p>

          <p className="text-[11px] text-stone-500">
            WebMaster ReagrupamientoAI{" "}
            <a
              href="mailto:contacto@reagrupamientoAI.com"
              className="text-amber-400 hover:text-amber-300 font-semibold hover:underline"
            >
              @reagrupamientoAI.com
            </a>
          </p>
        </div>
      </footer>

      {/* ─── MODAL WHATSAPP HANDOFF (RESPONSIVE & TOUCH FRIENDLY) ─── */}
      {waModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setWaModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-stone-200 relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setWaModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-emerald-600 mb-2">
              <span className="p-2 rounded-xl bg-emerald-100">
                <Phone className="w-5 h-5" />
              </span>
              <span className="text-xs font-extrabold uppercase tracking-wider">
                Traspaso directo a WhatsApp
              </span>
            </div>

            <h3 className="font-serif text-xl font-bold text-stone-900 mb-1.5">
              Continuar Consulta por WhatsApp
            </h3>
            <p className="text-xs text-stone-600 mb-4 leading-relaxed">
              Introduce tu nombre y teléfono móvil. <strong>Te registraremos automáticamente en el CRM</strong> y abriremos WhatsApp con tu consulta.
            </p>

            {selectedService && (
              <div className="mb-4 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex items-center justify-between">
                <span className="text-stone-500">Actividad:</span>
                <span className="font-bold text-[#800020]">{selectedService}</span>
              </div>
            )}

            {waSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2 text-emerald-800 animate-in zoom-in-95">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold">¡Registro completado en el CRM!</p>
                <p className="text-[11px] text-emerald-700">Abriendo WhatsApp...</p>
              </div>
            ) : (
              <form onSubmit={handleWhatsAppHandoff} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Tu Nombre y Apellidos
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={waName}
                      onChange={(e) => setWaName(e.target.value)}
                      placeholder="Ej: Carmen Moreno"
                      className="w-full bg-stone-50 border border-stone-300 focus:border-emerald-600 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-stone-800 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Número de WhatsApp
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                    <input
                      type="tel"
                      required
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      placeholder="Ej: 611 22 33 44"
                      className="w-full bg-stone-50 border border-stone-300 focus:border-emerald-600 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-stone-800 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>Correo Electrónico</span>
                    <span className="text-stone-400 font-normal lowercase">(opcional)</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      value={waEmail}
                      onChange={(e) => setWaEmail(e.target.value)}
                      placeholder="Ej: carmen@ejemplo.com"
                      className="w-full bg-stone-50 border border-stone-300 focus:border-emerald-600 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs text-stone-800 outline-none transition"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={waLoading}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {waLoading ? (
                      "Registrando en CRM..."
                    ) : (
                      <>
                        <span>Abrir WhatsApp y Enviar Consulta</span>
                        <ArrowUpRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                <div className="text-[10px] text-stone-400 text-center flex items-center justify-center gap-1 pt-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>Tus datos quedan registrados de forma segura y privada.</span>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── FLOATING ANALIZAIA SIMULATOR BUBBLE ─── */}
      <button
        onClick={() => setSimuladorOpen(true)}
        aria-label="Abrir Simulador de Diagnóstico IA"
        title="Diagnóstico Visual con IA"
        className="fixed bottom-24 right-4 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-linear-to-tr from-sky-600 to-indigo-600 text-white shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 z-40 flex items-center justify-center border-2 border-white/60 group"
      >
        <div className="relative flex items-center justify-center">
          <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300 animate-pulse" />
        </div>
      </button>

      {/* ─── FLOATING CHAT BUBBLE BUTTON ─── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Abrir Asistente de Citas"
        className="fixed bottom-6 right-4 sm:right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#800020] text-white shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 z-40 flex items-center justify-center border-2 border-white/40 group"
      >
        {isOpen ? (
          <X className="w-6 h-6 sm:w-7 sm:h-7 transition-transform group-hover:rotate-90" />
        ) : (
          <div className="relative">
            <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#800020] animate-ping" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#800020]" />
          </div>
        )}
      </button>

      {/* ─── FLOATING CHAT MODAL WINDOW (FULLY RESPONSIVE) ─── */}
      {isOpen && (
        <div className="fixed bottom-22 sm:bottom-24 right-2 sm:right-6 w-[calc(100vw-16px)] sm:w-[410px] h-[550px] sm:h-[600px] max-h-[calc(100vh-100px)] bg-white rounded-2xl shadow-2xl border border-stone-200 z-40 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-300">
          {/* Header */}
          <div className="bg-[#800020] text-white p-3.5 flex items-center justify-between shadow-xs">
            <div>
              <div className="font-bold text-sm leading-tight flex items-center gap-1.5">
                <span>{businessName}</span>
              </div>
              <div className="text-[11px] text-white/80 flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                <span>Asistente de Reservas • En línea</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWaModalOpen(true)}
                title="Pasar a WhatsApp"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 transition mr-1"
              >
                <Phone className="w-3 h-3" /> WhatsApp
              </button>
              <button
                onClick={resetChat}
                title="Reiniciar conversación"
                className="p-1.5 hover:bg-white/15 rounded-lg text-white/80 hover:text-white transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Cerrar"
                className="p-1.5 hover:bg-white/15 rounded-lg text-white/80 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Selection Chips Carousel */}
          <div className="bg-[#FAF9F6] border-b border-stone-200 px-3 py-2 flex gap-1.5 overflow-x-auto scrollbar-none">
            {filteredServices.slice(0, 8).map((svc) => (
              <button
                key={svc.id}
                onClick={() => handleServiceSelect(svc)}
                className="bg-white border border-stone-300 hover:bg-[#800020] hover:text-white hover:border-[#800020] rounded-full px-2.5 py-1 text-[10px] font-semibold text-stone-700 whitespace-nowrap transition shadow-2xs flex items-center gap-1"
              >
                <span>📁</span>
                <span>{svc.name.split("(")[0]}</span>
              </button>
            ))}
          </div>

          {/* WhatsApp Handoff Bar */}
          <div className="bg-emerald-50 border-b border-emerald-200 px-3 py-1.5 flex items-center justify-between text-xs text-emerald-900">
            <span className="text-[11px] font-medium flex items-center gap-1">
              <Phone className="w-3 h-3 text-emerald-600" /> ¿Prefieres continuar en tu móvil?
            </span>
            <button
              onClick={() => setWaModalOpen(true)}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline"
            >
              Pasar a WhatsApp
            </button>
          </div>

          {/* Message Feed */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-stone-50">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.direction === "inbound" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.direction === "inbound"
                      ? "bg-[#800020] text-white rounded-br-xs"
                      : "bg-white text-stone-800 border border-stone-200 shadow-2xs rounded-bl-xs"
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: m.body
                      .replace(
                        /(https?:\/\/[^\s]+)/g,
                        '<a href="$1" target="_blank" rel="noopener" class="underline font-bold text-amber-600 hover:text-amber-700">$1</a>'
                      )
                      .replace(/\n/g, "<br/>"),
                  }}
                />
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-xs px-4 py-2.5 shadow-2xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="p-2.5 sm:p-3 bg-white border-t border-stone-200 flex items-center gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ej: ¿Qué turnos hay de Yoga o Iaidō?..."
              className="flex-1 bg-stone-100 border border-stone-300 focus:border-[#800020] focus:bg-white rounded-full px-3.5 py-2 text-xs text-stone-800 outline-none transition"
            />
            <button
              onClick={() => handleSend()}
              disabled={isTyping || !inputValue.trim()}
              className="w-8 h-8 rounded-full bg-[#800020] text-white flex items-center justify-center hover:bg-[#800020]/90 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ─── SIMULADOR DE DIAGNÓSTICO POR IA (MODAL) ─── */}
      <SimuladorDiagnosticoModal
        open={simuladorOpen}
        onClose={() => setSimuladorOpen(false)}
      />
    </div>
  );
}
