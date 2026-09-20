"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Calendar,
  Clock,
  MessageSquare,
  X,
  Send,
  RotateCcw,
  CheckCircle2,
  Maximize2,
  Phone,
  User,
  Mail,
  ArrowUpRight,
  ShieldCheck,
  Users,
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
  description?: string;
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
  durationMinutes: number;
  price?: string;
  currency?: string;
  paymentType: "stripe" | "external_url" | "in_person" | "free";
  externalPaymentUrl?: string;
  allowedModalities?: string[];
  requiresApproval?: boolean;
  firstClassFree?: boolean;
  freeForYogaStudents?: boolean;
  whatsappBookingUrl?: string;
  categoryId?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  categoryDescription?: string | null;
  displayOrder?: number;
  flyerUrl?: string | null;
  flyerPath?: string | null;
  flyerParticularUrl?: string | null;
  flyerParticularPath?: string | null;
  videoParticularUrl?: string | null;
  videoParticularPath?: string | null;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  category?: WidgetCategory | null;
}

const FALLBACK_CATEGORIES: WidgetCategory[] = [
  {
    id: "cat-longevidad",
    code: "longevidad_artes",
    name: "Longevidad, Artes Tradicionales y Experiencias Exclusivas",
    description: "BIENESTAR INTEGRAL · CLUB SOCIAL PARQUE GRANADA Y CENTRO SALVADORA CONESA",
    displayOrder: 1,
  },
  {
    id: "cat-yoga",
    code: "yoga_meditacion",
    name: "Clases Regulares de Yoga y Meditación",
    description: "PRÁCTICA CONSCIENTE, ALINEACIÓN Y SALUD POSTURAL",
    displayOrder: 2,
  },
  {
    id: "cat-eventos",
    code: "talleres_eventos",
    name: "Talleres, Retiros y Eventos Especiales",
    description: "INMERSIÓN, TRANSFORMACIÓN Y DESARROLLO PERSONAL",
    displayOrder: 3,
  },
  {
    id: "cat-salud",
    code: "salud_terapeutica",
    name: "Salud Terapéutica y Sesiones Individuales",
    description: "CONSULTAS PERSONALIZADAS Y ACOMPAÑAMIENTO INDIVIDUAL",
    displayOrder: 4,
  },
];

function formatServicePrice(s: WidgetService): string {
  if (s.price === "0.00" || s.price === "0" || !s.price) {
    if (s.firstClassFree || /yoga|iaidō|iaido|daruma|ninjutsu/i.test(s.name)) {
      return "0 € (Prueba Gratis)";
    }
    return "Gratuito";
  }
  return `${s.price} €`;
}

function formatDuration(minutes: number): string {
  if (!minutes) return "60 min";
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60} horas`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins}min`;
}

function serviceMatchesCategory(s: WidgetService, cat: WidgetCategory): boolean {
  if (s.categoryId && (s.categoryId === cat.id || s.categoryId === cat.code)) return true;
  if (s.categoryCode && (s.categoryCode === cat.code || s.categoryCode === cat.id)) return true;
  if (s.category && (s.category.id === cat.id || s.category.code === cat.code)) return true;

  const lower = (s.name || "").toLowerCase();
  if (cat.code === "longevidad_artes" || cat.code === "longevidad") {
    return (
      lower.includes("bienestar") ||
      lower.includes("iaidō") ||
      lower.includes("iaido") ||
      lower.includes("orientales") ||
      lower.includes("daruma") ||
      lower.includes("kaisai") ||
      lower.includes("kobudo") ||
      lower.includes("bujinkan") ||
      lower.includes("ninjutsu") ||
      lower.includes("funcional") ||
      lower.includes("pilates") ||
      lower.includes("taichi") ||
      lower.includes("tai chi")
    );
  }
  if (cat.code === "salud_terapeutica") {
    return (
      lower.includes("médica") ||
      lower.includes("medica") ||
      lower.includes("fisioterapia") ||
      lower.includes("gestalt") ||
      lower.includes("clínico") ||
      lower.includes("clinico")
    );
  }
  if (cat.code === "talleres_eventos") {
    return (
      s.serviceType === "event" ||
      lower.includes("gong") ||
      lower.includes("puja") ||
      lower.includes("constelaciones") ||
      lower.includes("retiro") ||
      lower.includes("conferencia") ||
      lower.includes("encuentro") ||
      lower.includes("ayuno")
    );
  }
  if (cat.code === "yoga_meditacion") {
    return (
      lower.includes("yoga") ||
      lower.includes("hatha") ||
      lower.includes("meditaci")
    );
  }
  return false;
}

const getCategoryMeta = (svc: WidgetService) => {
  const lower = (svc.name || "").toLowerCase();
  if (lower.includes("bienestar")) return { icon: "🌿", label: "Longevidad & Biohacking" };
  if (lower.includes("iaidō") || lower.includes("iaido")) return { icon: "⚔️", label: "Arte de la Katana" };
  if (lower.includes("hatha") || lower.includes("yoga")) return { icon: "🧘", label: "Yoga & Salud Postural" };
  if (lower.includes("meditaci")) return { icon: "✨", label: "Conciencia & Silencio" };
  if (lower.includes("gestalt")) return { icon: "🌱", label: "Psicoterapia Gestalt" };
  if (lower.includes("gong") && lower.includes("puja")) return { icon: "🌙", label: "Inmersión Nocturna Anual" };
  if (lower.includes("gong")) return { icon: "🔔", label: "Sonoterapia Mensual" };
  if (lower.includes("constelaci")) return { icon: "🕊️", label: "Taller Vivencial" };
  if (lower.includes("ayuno")) return { icon: "🏕️", label: "Retiro Residencial" };
  if (lower.includes("mujeres")) return { icon: "🌸", label: "Círculo Femenino" };
  if (lower.includes("médica") || lower.includes("clinico")) return { icon: "🩺", label: "Consulta Médica" };
  if (lower.includes("fisioterapia")) return { icon: "💆", label: "Rehabilitación Postural" };
  if (lower.includes("bujinkan") || lower.includes("ninjutsu") || lower.includes("orientales")) return { icon: "🥋", label: "Artes Orientales" };
  if (lower.includes("funcional") || lower.includes("pilates")) return { icon: "💪", label: "Entrenamiento & Core" };
  return { icon: "🌟", label: svc.serviceType === "recurring" ? "Actividad Regular" : "Evento Especial" };
};

function ServiceMediaPreview({ svc }: { svc: WidgetService }) {
  const videoSrc = svc.videoParticularUrl || svc.videoParticularPath;
  const flyerSrc =
    svc.flyerParticularUrl ||
    svc.flyerParticularPath ||
    (svc.flyerUrl !== "/flyer-parque-granada.png" ? svc.flyerUrl : null) ||
    (svc.flyerPath !== "public/flyer-parque-granada.png" ? svc.flyerPath : null);
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

  // Dynamic services & categories from CRM API
  const [categories, setCategories] = useState<WidgetCategory[]>(FALLBACK_CATEGORIES);
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
        if (data && Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(
            [...data.categories].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
          );
        }
        const rawList = Array.isArray(data)
          ? data
          : data && Array.isArray(data.services)
          ? data.services
          : [];
        setServices(
          [...rawList].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        );
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, isOpen]);

  // Sorted categories
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [categories]);

  // Filter services by type
  const filterByType = (list: WidgetService[]) =>
    list.filter((s) => selectedType === "all" || s.serviceType === selectedType);

  // Dynamic grouped sections by category
  const groupedSections = useMemo(() => {
    const sections: { category: WidgetCategory; services: WidgetService[] }[] = [];
    for (const cat of sortedCategories) {
      if (selectedCategory !== "all" && selectedCategory !== cat.code && selectedCategory !== cat.id) {
        continue;
      }
      const catSvcs = filterByType(
        services.filter((s) => serviceMatchesCategory(s, cat))
      ).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

      if (catSvcs.length > 0) {
        sections.push({ category: cat, services: catSvcs });
      }
    }
    return sections;
  }, [services, sortedCategories, selectedCategory, selectedType]);

  const uncategorizedServices = useMemo(() => {
    if (selectedCategory !== "all") return [];
    return filterByType(
      services.filter((s) => !sortedCategories.some((cat) => serviceMatchesCategory(s, cat)))
    ).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [services, sortedCategories, selectedCategory, selectedType]);

  const totalFilteredCount =
    groupedSections.reduce((acc, g) => acc + g.services.length, 0) + uncategorizedServices.length;

  const handleSend = async (text?: string, serviceName?: string) => {
    const msgText = text || inputValue.trim();
    if (!msgText) return;

    const userMsg: ChatMessage = {
      id: "user_" + Date.now(),
      direction: "inbound",
      body: msgText,
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
              <strong>Simulación en Vivo de la Landing Web</strong> · Conectado en tiempo real con el CRM Salvadora
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
          💳 Pagos en el Centro · Sincronizado en tiempo real
        </span>
        <button
          onClick={() => setSimuladorOpen(true)}
          className="inline-flex items-center gap-1 bg-amber-400 hover:bg-amber-300 text-stone-950 px-3 py-0.5 rounded-full text-xs font-bold transition shadow-xs cursor-pointer"
        >
          🔬 Simulador IA
        </button>
        <button
          onClick={() => setWaModalOpen(true)}
          className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 px-3 py-0.5 rounded-full text-white font-semibold transition shadow-xs cursor-pointer"
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
              className="bg-amber-400 hover:bg-amber-500 text-stone-950 px-3 py-2 rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Simulador IA
            </button>
            <button
              onClick={() => setWaModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" /> WhatsApp Alta Rápida
            </button>
            <button
              onClick={() => setIsOpen(true)}
              className="bg-[#800020] text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-[#800020]/90 transition shadow-xs flex items-center gap-1.5 cursor-pointer"
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
            Catálogo completo actualizado en vivo desde nuestra base de datos. Consulta las clases regulares de <strong>Hatha Yoga Terapéutico</strong>, el programa <strong>Bienestar Experience</strong>, las sesiones de <strong>Iaidō</strong> en Parque Granada, meditaciones, sonoterapia y retiros.
          </p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-2">
            <button
              onClick={() => setIsOpen(true)}
              className="bg-[#800020] hover:bg-[#800020]/90 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Calendar className="w-4 h-4" /> Consultar Disponibilidad en Vivo
            </button>
            <button
              onClick={() => setWaModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Phone className="w-4 h-4" /> Traspasar Consulta a WhatsApp
            </button>
          </div>
        </div>
      </section>

      {/* ─── BARRA DE FILTRADO POR CATEGORÍA Y TIPO ─── */}
      <section className="max-w-6xl mx-auto px-4 pt-2 pb-4">
        <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-3">
          {/* Fila 1: Filtro por Categoría */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-stone-700 shrink-0">
              <span className="text-base">📁</span>
              <span>Categoría:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === "all"
                    ? "bg-[#800020] text-white shadow-xs"
                    : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                }`}
              >
                Todas las Categorías ({filterByType(services).length})
              </button>

              {sortedCategories.map((cat) => {
                const count = filterByType(
                  services.filter((s) => serviceMatchesCategory(s, cat))
                ).length;

                return (
                  <button
                    key={cat.id || cat.code}
                    onClick={() => setSelectedCategory(cat.code || cat.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      selectedCategory === cat.code || selectedCategory === cat.id
                        ? "bg-[#800020] text-white shadow-xs"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    <span className="font-mono text-[10px] opacity-75">#{cat.displayOrder}</span>
                    <span>{cat.name}</span>
                    <span className="opacity-80">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fila 2: Filtro por Tipo de Servicio */}
          <div className="pt-2.5 border-t border-stone-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-stone-700 shrink-0">
              <span className="text-base">🏷️</span>
              <span>Tipo de Actividad:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedType("all")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  selectedType === "all"
                    ? "bg-[#0B4A72] text-white font-bold shadow-xs"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                Todos los tipos
              </button>
              <button
                onClick={() => setSelectedType("recurring")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  selectedType === "recurring"
                    ? "bg-[#0B4A72] text-white font-bold shadow-xs"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                🗓️ Clases y Citas Periódicas
              </button>
              <button
                onClick={() => setSelectedType("event")}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  selectedType === "event"
                    ? "bg-purple-700 text-white font-bold shadow-xs"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                ✨ Eventos, Talleres y Retiros
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECCIONES DINÁMICAS POR CATEGORÍA EN ORDEN ESPECIFICADO (displayOrder) ─── */}
      {servicesLoading ? (
        <section className="max-w-6xl mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 text-stone-600 text-sm font-medium">
            <span className="w-4 h-4 rounded-full border-2 border-[#800020] border-t-transparent animate-spin" />
            Cargando catálogo en tiempo real desde el CRM...
          </div>
        </section>
      ) : groupedSections.length === 0 && uncategorizedServices.length === 0 ? (
        <section className="max-w-6xl mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-stone-200 p-8 max-w-md mx-auto space-y-2">
            <p className="text-stone-700 font-semibold text-sm">No se han encontrado actividades con estos filtros.</p>
            <p className="text-xs text-stone-500">Prueba a seleccionar todas las categorías o todos los tipos.</p>
            <button
              onClick={() => {
                setSelectedCategory("all");
                setSelectedType("all");
              }}
              className="mt-2 text-xs font-bold text-[#800020] hover:underline cursor-pointer"
            >
              Restablecer filtros
            </button>
          </div>
        </section>
      ) : (
        groupedSections.map(({ category: cat, services: catServices }) => {
          const isYogaCategory =
            cat.code === "yoga_meditacion" ||
            cat.code === "yoga" ||
            cat.name.toLowerCase().includes("yoga");

          const isLongevidadCategory =
            cat.code === "longevidad_artes" ||
            cat.code === "longevidad" ||
            cat.name.toLowerCase().includes("longevidad");

          const isTalleresCategory =
            cat.code === "talleres_eventos" ||
            cat.name.toLowerCase().includes("taller") ||
            cat.name.toLowerCase().includes("retiro") ||
            cat.name.toLowerCase().includes("gong");

          // Border & Accent coloring per category
          const borderTopColor = isYogaCategory
            ? "border-[#800020]"
            : isLongevidadCategory
            ? "border-[#0B4A72]"
            : isTalleresCategory
            ? "border-purple-600"
            : "border-stone-400";

          const tagColor = isYogaCategory
            ? "text-[#800020]"
            : isLongevidadCategory
            ? "text-[#0B4A72]"
            : isTalleresCategory
            ? "text-purple-900"
            : "text-stone-700";

          return (
            <section key={cat.id || cat.code} className="max-w-6xl mx-auto px-4 py-8">
              <div className={`mb-6 pb-3 border-b-2 ${borderTopColor}`}>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                        Orden #{cat.displayOrder}
                      </span>
                      <span className={`text-[11px] font-extrabold uppercase tracking-widest ${tagColor} flex items-center gap-1.5`}>
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        ESCUELA SALVADORA CONESA · {isLongevidadCategory ? "CLUB SOCIAL PARQUE GRANADA & CENTRO" : "SEDE OFICIAL"}
                      </span>
                    </div>
                    <h3 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 mt-1">
                      {cat.name}
                    </h3>
                    {cat.description && (
                      <p className="text-xs sm:text-sm text-stone-600 mt-1 max-w-2xl whitespace-pre-line">
                        {cat.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-stone-600 font-medium whitespace-nowrap">
                    {catServices.length} {catServices.length === 1 ? "actividad" : "actividades"}
                  </span>
                </div>
              </div>

              {/* Banner Informativo Políticas de Yoga */}
              {isYogaCategory && (
                <div className="mb-6 bg-amber-50/95 border-2 border-amber-200/90 rounded-2xl p-5 text-xs text-stone-800 shadow-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🧘</span>
                    <h4 className="font-bold text-amber-950 text-sm sm:text-base">
                      Condiciones de Matriculación y Flexibilidad para Alumnos:
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1 text-stone-700 leading-relaxed">
                    <div className="space-y-2">
                      <p>
                        • 🎁 <strong>1ª Clase de prueba de REGALO:</strong> Tu primera clase en las disciplinas marcadas es gratuita (0 €), sin compromiso ni permanencia.
                      </p>
                      <p>
                        • 📅 <strong>Cuotas de Alumno con Turno Fijo:</strong> 1 clase semanal (25 €/mes) o 2 clases semanales (42 €/mes) con plaza reservada fija garantizada.
                      </p>
                      <p>
                        • 🎟️ <strong>Clases sueltas / esporádicas:</strong> 10 € por clase para quien no desee matricularse mensualmente.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p>
                        • 🔄 <strong>Política de recuperaciones (hasta 3 meses / 90 días):</strong> Si avisas con antelación, puedes recuperar tus clases en cualquier otro turno disponible.
                      </p>
                      <p>
                        • ✨ <strong>Meditaciones Guiadas:</strong> Gratuitas para los alumnos matriculados en Yoga. No alumnos: 15 €/mes (o 3 € sesión suelta).
                      </p>
                      <p>
                        • 📩 <strong>Confirmación Inmediata:</strong> Avisos por SMS y correo electrónico al confirmar cada plaza o reserva.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Grid de Servicios */}
              <div
                className={`grid ${
                  isLongevidadCategory
                    ? "grid-cols-1 lg:grid-cols-2 gap-6"
                    : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                }`}
              >
                {catServices.map((act) => {
                  const meta = getCategoryMeta(act);
                  const isBienestar = act.name.toLowerCase().includes("bienestar experience");
                  const priceDisplay = formatServicePrice(act);
                  const durationDisplay = formatDuration(act.durationMinutes);

                  return (
                    <div
                      key={act.id}
                      className="bg-white rounded-3xl border-2 border-stone-200 p-6 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between hover:border-[#800020] relative overflow-hidden group"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-bl from-amber-100/50 via-transparent to-transparent rounded-bl-full pointer-events-none" />

                      <div>
                        {/* Header Badges */}
                        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                          <span className="text-xs font-bold px-3 py-1 rounded-full bg-stone-100 text-stone-800 flex items-center gap-1.5 border border-stone-200">
                            <span>{meta.icon}</span> {meta.label}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {act.firstClassFree && (
                              <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                                Prueba Gratis
                              </span>
                            )}
                            {act.freeForYogaStudents && (
                              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300">
                                ✨ ¡Gratis Alumnos Yoga!
                              </span>
                            )}
                            {act.maxCapacity && (
                              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200 flex items-center gap-1">
                                <Users className="w-3 h-3" /> Aforo: {act.maxCapacity} {act.maxCapacity === 1 ? "plaza" : "plazas"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Visor Multimedia Inteligente (Vídeo / Flyer / Selector) */}
                        <ServiceMediaPreview svc={act} />

                        {/* Title & Emblem for Bienestar Experience */}
                        {isBienestar ? (
                          <div className="space-y-4 mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-full bg-stone-900 text-white flex items-center justify-center p-2 border-2 border-amber-500 shadow-md text-center">
                                <div className="leading-tight">
                                  <span className="block text-[8px] font-bold tracking-widest text-amber-300 uppercase">BIEN</span>
                                  <span className="block text-[10px] font-extrabold tracking-wider uppercase">ESTAR</span>
                                  <span className="block text-[8px] font-bold tracking-widest text-stone-300 uppercase">EXP</span>
                                </div>
                              </div>
                              <div>
                                <h4 className="font-serif text-xl sm:text-2xl font-bold text-stone-900 group-hover:text-[#800020] transition-colors leading-snug">
                                  {act.name}
                                </h4>
                                <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                                  {priceDisplay} • {act.allowedModalities?.map((m) => m === "in_person" ? "Presencial" : m === "virtual" ? "Online" : m).join(" · ") || "Presencial y Online"}
                                </p>
                              </div>
                            </div>

                            <p className="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                              {act.description}
                            </p>

                            <div className="pt-2">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B4A72] block mb-1.5">
                                🔬 Disciplinas y Áreas Incluidas:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  "Biohacking",
                                  "Longevidad",
                                  "Rejuvenecimiento",
                                  "Ciclos Circadianos",
                                  "Psicología Positiva",
                                  "Terapia de Sonido",
                                  "Nutrición Celular",
                                  "Meditación",
                                ].map((t) => (
                                  <span
                                    key={t}
                                    className="inline-block bg-amber-50 text-amber-900 border border-amber-200/80 px-2 py-0.5 rounded-md text-[10px] font-medium"
                                  >
                                    • {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex justify-between items-start mb-2 gap-2">
                              <h4 className="font-serif text-lg sm:text-xl font-bold text-stone-900 group-hover:text-[#800020] transition-colors leading-snug">
                                {act.name}
                              </h4>
                              <span className="font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg text-xs border border-emerald-200 shrink-0 ml-2">
                                {priceDisplay}
                              </span>
                            </div>

                            {act.eventDatesText && (
                              <div className="mb-2 inline-block bg-purple-100 text-purple-950 font-bold text-[11px] px-2.5 py-0.5 rounded-md">
                                🗓️ {act.eventDatesText}
                              </div>
                            )}

                            <p className="text-xs sm:text-sm text-stone-700 leading-relaxed mb-4 whitespace-pre-line">
                              {act.description}
                            </p>
                          </div>
                        )}

                        {/* Horarios dinámicos desde CRM */}
                        {(act.scheduleText || act.eventDatesText) && (
                          <div className="bg-[#FAF9F6] rounded-2xl p-4 border border-stone-200/90 space-y-2 mb-4">
                            <div className="text-xs font-bold text-[#800020] uppercase tracking-wider flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-[#0B4A72]" /> Horarios y Turnos Oficiales:
                            </div>
                            <div className="text-xs text-stone-800">
                              {act.scheduleText || act.eventDatesText}
                            </div>
                            <div className="text-[11px] text-stone-600 italic pt-1 border-t border-stone-200 flex items-center justify-between">
                              <span>Duración: {durationDisplay}</span>
                              {act.maxCapacity && <span>Aforo: {act.maxCapacity} plazas</span>}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-3 border-t border-stone-100 space-y-2.5">
                        <button
                          onClick={() => handleServiceSelect(act)}
                          className="w-full py-3 px-4 bg-[#800020] hover:bg-[#800020]/90 text-white rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Calendar className="w-4 h-4" /> Reservar / Consultar Disponibilidad
                        </button>
                        <div className="flex items-center justify-between text-xs pt-1">
                          {act.whatsappBookingUrl ? (
                            <a
                              href={act.whatsappBookingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1"
                            >
                              <Phone className="w-3.5 h-3.5" /> Pedir por WhatsApp
                            </a>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedService(act.name);
                                setWaModalOpen(true);
                              }}
                              className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5" /> Pedir por WhatsApp
                            </button>
                          )}
                          <span className="text-stone-500 font-medium text-[11px]">Pago en centro</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {/* ─── SECCIÓN PARA OTRAS ACTIVIDADES SIN CATEGORÍA ─── */}
      {uncategorizedServices.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 py-8">
          <div className="mb-6 pb-3 border-b-2 border-stone-400">
            <h3 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900">
              Otras Actividades y Consultas
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {uncategorizedServices.map((act) => {
              const meta = getCategoryMeta(act);
              const priceDisplay = formatServicePrice(act);
              const durationDisplay = formatDuration(act.durationMinutes);

              return (
                <div
                  key={act.id}
                  className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between hover:border-[#800020]/40"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-2.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 flex items-center gap-1">
                        <span>{meta.icon}</span> {meta.label}
                      </span>
                      <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {priceDisplay}
                      </span>
                    </div>

                    <ServiceMediaPreview svc={act} />

                    <h4 className="font-serif text-base font-bold text-stone-900 mb-1.5 leading-snug">
                      {act.name}
                    </h4>
                    <p className="text-xs text-stone-600 leading-relaxed mb-3 whitespace-pre-line">
                      {act.description}
                    </p>

                    {act.scheduleText && (
                      <div className="bg-[#FAF9F6] rounded-xl p-3 border border-stone-200 text-xs space-y-1 mb-3">
                        <div className="font-bold text-[#800020] text-[11px] uppercase flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Horario:
                        </div>
                        <div className="text-[11px] text-stone-800">
                          {act.scheduleText}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-stone-100 space-y-2">
                    <button
                      onClick={() => handleServiceSelect(act)}
                      className="w-full py-2 px-3 bg-[#800020] hover:bg-[#800020]/90 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5" /> Reservar Plaza
                    </button>
                    <div className="flex items-center justify-between text-[11px] text-stone-500">
                      <span>{durationDisplay}</span>
                      <button
                        onClick={() => {
                          setSelectedService(act.name);
                          setWaModalOpen(true);
                        }}
                        className="text-emerald-700 font-bold hover:underline cursor-pointer"
                      >
                        WhatsApp
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-stone-900 text-stone-400 text-xs py-10 border-t border-stone-800 space-y-5">
        <div className="max-w-6xl mx-auto px-4 text-center space-y-2">
          <p className="font-semibold text-stone-300">
            CENTRO DE YOGA & BIENESTAR SALVADORA CONESA · FUENLABRADA
          </p>
          <p>Actividades en Club Social Parque Granada (Cafetería Bar • Entrada Libre).</p>
          <p className="text-stone-400 text-[11px]">
            Consultas y reservas por WhatsApp: <strong>695 172 625</strong> · <strong>Pagos en el centro</strong>.
          </p>
        </div>

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

      {/* ─── MODAL WHATSAPP HANDOFF (ALTA RÁPIDA EN CRM) ─── */}
      {waModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setWaModalOpen(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-1.5 rounded-full hover:bg-stone-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <span className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-800">
                <Phone className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-stone-900 text-base">Continuar por WhatsApp</h3>
                <p className="text-xs text-stone-500">Alta rápida en sistema y atención directa</p>
              </div>
            </div>

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
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
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
        className="fixed bottom-24 right-4 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-linear-to-tr from-sky-600 to-indigo-600 text-white shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 z-40 flex items-center justify-center border-2 border-white/60 group cursor-pointer"
      >
        <div className="relative flex items-center justify-center">
          <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300 animate-pulse" />
        </div>
      </button>

      {/* ─── FLOATING CHAT BUBBLE BUTTON ─── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Abrir Asistente de Citas"
        className="fixed bottom-6 right-4 sm:right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#800020] text-white shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 z-40 flex items-center justify-center border-2 border-white/40 group cursor-pointer"
      >
        {isOpen ? (
          <X className="w-6 h-6 sm:w-7 sm:h-7 transition-transform group-hover:rotate-90" />
        ) : (
          <div className="relative">
            <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#800020] animate-ping" />
          </div>
        )}
      </button>

      {/* ─── CHAT WIDGET WINDOW ─── */}
      {isOpen && (
        <div className="fixed bottom-24 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[420px] max-h-[600px] h-[80vh] bg-white rounded-3xl shadow-2xl border border-stone-200 z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          {/* Widget Header */}
          <div className="bg-[#800020] text-white px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg">
                🧘
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight">{businessName}</h3>
                <div className="flex items-center gap-1.5 text-[11px] text-amber-200/90">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>En línea para reservas y dudas</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={resetChat}
                title="Reiniciar chat"
                className="p-1.5 hover:bg-white/20 rounded-lg transition text-white/80 hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Cerrar"
                className="p-1.5 hover:bg-white/20 rounded-lg transition text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="bg-stone-50 border-b border-stone-200 px-3 py-2 flex items-center justify-between text-xs shrink-0">
            <span className="text-[11px] text-stone-500 font-medium">Acción rápida:</span>
            <button
              onClick={() => {
                setIsOpen(false);
                setWaModalOpen(true);
              }}
              className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" /> Pasar a WhatsApp
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAF9F6]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col max-w-[85%] text-xs leading-relaxed",
                  m.direction === "inbound" ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div
                  className={cn(
                    "px-4 py-2.5 rounded-2xl shadow-xs",
                    m.direction === "inbound"
                      ? "bg-[#800020] text-white rounded-tr-xs"
                      : "bg-white text-stone-800 border border-stone-200 rounded-tl-xs whitespace-pre-line"
                  )}
                >
                  {m.body}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="mr-auto flex items-center gap-1 px-4 py-2.5 bg-white border border-stone-200 rounded-2xl text-stone-500 text-xs">
                <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="p-3 border-t border-stone-200 bg-white shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Escribe tu consulta o reserva..."
                className="flex-1 bg-stone-50 border border-stone-300 focus:border-[#800020] focus:bg-white rounded-xl px-3.5 py-2 text-xs text-stone-800 outline-none transition"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isTyping}
                className="bg-[#800020] hover:bg-[#800020]/90 disabled:opacity-40 text-white p-2.5 rounded-xl transition shadow-xs cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── SIMULADOR IA MODAL ─── */}
      <SimuladorDiagnosticoModal
        open={simuladorOpen}
        onClose={() => setSimuladorOpen(false)}
      />
    </div>
  );
}
