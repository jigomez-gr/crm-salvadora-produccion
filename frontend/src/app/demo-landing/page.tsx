"use client";

import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { SimuladorDiagnosticoModal } from "@/components/SimuladorDiagnosticoModal";

interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
}

interface ServiceItem {
  id: string;
  title: string;
  category: string;
  categoryIcon: string;
  desc: string;
  badge?: string;
  schedules?: {
    morning?: string;
    afternoon?: string;
    note?: string;
  };
  duration: string;
  priceTag: string;
  isFreeTrial: boolean;
  serviceName: string;
  calendarId: string;
  modalities?: string[];
  tags?: string[];
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

  // WhatsApp Handoff Form State
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waName, setWaName] = useState("");
  const [waPhone, setWaPhone] = useState("");
  const [waEmail, setWaEmail] = useState("");
  const [waLoading, setWaLoading] = useState(false);
  const [waSuccess, setWaSuccess] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ─── 1. SERVICIOS DEL CENTRO / CLUB SOCIAL PARQUE GRANADA (EXCLUSIVAMENTE 2) ───
  const centroActivities: ServiceItem[] = [
    {
      id: "bienestar-experience",
      title: "Bienestar Experience (Longevidad & Salud Integral)",
      category: "Longevidad & Biohacking",
      categoryIcon: "🌿",
      badge: "Programa de Bienestar Integral",
      desc: "Experiencia personalizada y asesoramiento de bienestar integral presencial y online para optimizar tu energía vital, descanso, equilibrio emocional y longevidad saludable.",
      tags: [
        "Biohacking",
        "Longevidad",
        "Rejuvenecimiento",
        "Biología",
        "Crecimiento",
        "Estilo de Vida",
        "Meditación",
        "Motivación",
        "Inspiración",
        "Conciencia",
        "Ciencia",
        "Espiritualidad",
        "Nutrición",
        "Medicina Natural",
        "Ciclos Circadianos",
        "Psicologías Positivas",
        "Terapia de Sonido",
      ],
      schedules: {
        morning: "Citas concertadas de mañana (Presencial y Online)",
        afternoon: "Citas concertadas de tarde (Presencial y Online)",
        note: "Sesión individual de 60 min • Se acuerda la hora entre alumno y asesor",
      },
      duration: "60 min",
      priceTag: "25.00 € / sesión",
      isFreeTrial: false,
      serviceName: "Bienestar Experience (Longevidad y Bienestar Integral)",
      calendarId: "cal-bienestar-experience",
      modalities: ["Presencial", "Virtual (Online)"],
    },
    {
      id: "iaido",
      title: "Iaidō (Esgrima Japonesa Tradicional)",
      category: "Arte de la Katana",
      categoryIcon: "⚔️",
      badge: "Prueba Gratis",
      desc: "El arte marcial milenario del desenvaine, corte y funda de la katana japonesa. Enfoque en la máxima precisión, concentración, etiqueta marcial y postura corporal.",
      tags: ["Katana Tradicional", "Concentración", "Arte Marcial", "Prueba Gratuita"],
      schedules: {
        afternoon: "Lunes: 20:00 a 21:00 (60 min) | Jueves: 20:30 a 22:00 (90 min)",
        note: "Lugar: Club Social Parque Granada (Cafetería Bar • Entrada Libre). Prueba gratis en todas las clases.",
      },
      duration: "60 - 90 min",
      priceTag: "Prueba Gratis",
      isFreeTrial: true,
      serviceName: "Iaidō (Esgrima Japonesa)",
      calendarId: "cal-iaido",
      modalities: ["Presencial en Club Social Parque Granada"],
    },
  ];

  // ─── 2. CLASES REGULARES DE LA ESCUELA DE YOGA SALVADORA CONESA ───
  const regularYogaServices: ServiceItem[] = [
    {
      id: "hatha-yoga-1",
      title: "Hatha Yoga Terapéutico (1 clase semanal)",
      category: "Yoga & Salud Postural",
      categoryIcon: "🧘",
      desc: "Práctica consciente de asanas, alineación corporal, respiración terapéutica y relajación profunda.",
      schedules: {
        morning: "Martes y Jueves: 9:45 y 11:15",
        afternoon: "Martes: 17:00, 18:30, 20:00 | Miércoles: 20:15 | Jueves: 16:30, 17:30, 19:00",
        note: "Clases de 90 min (1h 30m). Aforo máximo de 20 personas (hasta 28 para recuperaciones de clases).",
      },
      duration: "90 min",
      priceTag: "25.00 € / mes",
      isFreeTrial: false,
      serviceName: "Hatha Yoga Terapéutico (1 clase semanal)",
      calendarId: "cal-hatha-yoga",
    },
    {
      id: "hatha-yoga-2",
      title: "Hatha Yoga Terapéutico (2 clases semanales)",
      category: "Yoga & Práctica Frecuente",
      categoryIcon: "🧘",
      desc: "Inscripción para 2 sesiones semanales en los horarios oficiales de mañana o tarde.",
      schedules: {
        morning: "Martes y Jueves: 9:45 y 11:15",
        afternoon: "Martes: 17:00, 18:30, 20:00 | Miércoles: 20:15 | Jueves: 16:30, 17:30, 19:00",
        note: "Comparte calendario y aforo con 1 clase semanal (máx 20 plazas fijas).",
      },
      duration: "90 min",
      priceTag: "42.00 € / mes",
      isFreeTrial: false,
      serviceName: "Hatha Yoga Terapéutico (2 clases semanales)",
      calendarId: "cal-hatha-yoga",
    },
    {
      id: "meditacion",
      title: "Meditaciones Guiadas",
      category: "Conciencia & Silencio",
      categoryIcon: "✨",
      desc: "Sesión grupal de meditación, respiración y centramiento para iniciar el día en calma y presencia.",
      schedules: {
        morning: "Martes y Jueves de 9:15 a 9:45 (30 min)",
        note: "Gratuitas para alumnos inscritos en Yoga. Precio general: 15€/mes.",
      },
      duration: "30 min",
      priceTag: "15.00 € / mes (Gratis alumnos)",
      isFreeTrial: false,
      serviceName: "Meditaciones Guiadas",
      calendarId: "cal-meditacion",
    },
    {
      id: "gestalt",
      title: "Terapia Gestalt (Sesión Individual)",
      category: "Psicoterapia & Crecimiento",
      categoryIcon: "🌱",
      desc: "Sesión individual de acompañamiento terapéutico y toma de conciencia presencial u online.",
      schedules: {
        note: "Hora acordada de forma personalizada entre el alumno y el terapeuta.",
      },
      duration: "60 min",
      priceTag: "35.00 € / sesión",
      isFreeTrial: false,
      serviceName: "Terapia Gestalt (Sesión Individual)",
      calendarId: "cal-gestalt",
    },
  ];

  // ─── 3. TALLERES, EVENTOS Y RETIROS ESPECIALES (REALES) ───
  const eventServices: ServiceItem[] = [
    {
      id: "bano-gong",
      title: "Baño de Gong y Meditación Sonora",
      category: "Sonoterapia Mensual",
      categoryIcon: "🔔",
      badge: "Sábado 26 Septiembre 2026",
      desc: "Un sábado al mes a finales de mes. Sesión de 2 horas: preparación, inmersión en el sonido envolvente de los gongs y meditación integradora.",
      schedules: {
        afternoon: "Sábado 26 de Septiembre de 2026 de 18:00 a 20:00",
        note: "Aforo máximo: 30 personas. Pago en el centro.",
      },
      duration: "120 min (2h)",
      priceTag: "16.00 €",
      isFreeTrial: false,
      serviceName: "Baño de Gong y Meditación Sonora",
      calendarId: "cal-gong-mensual",
    },
    {
      id: "puja-gongs",
      title: "Puja de Gongs (Noche de Sonido - 11 Horas)",
      category: "Inmersión Anual",
      categoryIcon: "🌙",
      badge: "Sábado 28 Noviembre 2026",
      desc: "Evento anual de 11 horas ininterrumpidas de sonido sagrado durante toda la noche. Se medita y descansa envuelto en la vibración.",
      schedules: {
        afternoon: "Sábado 28 de Noviembre de 2026 (de 21:00 a 08:00 del domingo)",
        note: "Aforo: 30 personas. Precio: 95€ (rango 90-100€ según asistentes). Reserva anticipada.",
      },
      duration: "660 min (11h)",
      priceTag: "95.00 €",
      isFreeTrial: false,
      serviceName: "Puja de Gongs (Noche Sagrada de Sonido - 11h)",
      calendarId: "cal-puja-gongs",
    },
    {
      id: "constelaciones",
      title: "Constelaciones Familiares",
      category: "Taller Vivencial",
      categoryIcon: "🕊️",
      badge: "Domingo 27 Septiembre 2026",
      desc: "Taller mensual de sanación de vínculos, dinámicas ocultas y orden en el sistema familiar.",
      schedules: {
        morning: "Domingo 27 de Septiembre de 2026 (10:00 a 14:00)",
        note: "Tarifas: Constelar (asunto propio) 60€ / Participar (representante) 20€. Aforo: 25 personas.",
      },
      duration: "240 min (4h)",
      priceTag: "60.00 € / 20.00 €",
      isFreeTrial: false,
      serviceName: "Constelaciones Familiares",
      calendarId: "cal-constelaciones",
    },
    {
      id: "ayuno-terapeutico",
      title: "Retiro de Ayuno Terapéutico",
      category: "Retiro Semestral",
      categoryIcon: "🏕️",
      badge: "Puente de Octubre (9-12 Oct 2026)",
      desc: "Retiro residencial en la naturaleza para descanso digestivo, depuración, caminatas conscientes y salud holística.",
      schedules: {
        note: "Del 9 al 12 de Octubre de 2026. Aforo: 20 plazas. Precio según estancia y habitación.",
      },
      duration: "4 días",
      priceTag: "Según estancia",
      isFreeTrial: false,
      serviceName: "Retiro de Ayuno Terapéutico",
      calendarId: "cal-ayuno-terapeutico",
    },
    {
      id: "encuentro-mujeres",
      title: "Encuentro de Mujeres (Primavera)",
      category: "Círculo Femenino",
      categoryIcon: "🌸",
      badge: "Sábado 15 Mayo 2027",
      desc: "Jornada anual de conexión, rituales de paso, autocuidado y empoderamiento femenino.",
      schedules: {
        morning: "Sábado 15 de Mayo de 2027 (10:00 a 16:00)",
        note: "Aforo máximo: 25 personas. Precio según programa.",
      },
      duration: "360 min (6h)",
      priceTag: "45.00 €",
      isFreeTrial: false,
      serviceName: "Encuentro de Mujeres (Primavera)",
      calendarId: "cal-encuentro-mujeres",
    },
  ];

  const allServices = [...centroActivities, ...regularYogaServices, ...eventServices];

  useEffect(() => {
    let currentSess = localStorage.getItem("crm_widget_demo_session");
    if (!currentSess) {
      currentSess = "sess_" + Math.random().toString(36).substring(2, 9);
      localStorage.setItem("crm_widget_demo_session", currentSess);
    }
    setSessionId(currentSess);

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

    try {
      const res = await fetch("/api/widget/chat/booking", {
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

  const handleServiceSelect = (svc: ServiceItem, preferredShift?: string) => {
    setIsOpen(true);
    setSelectedService(svc.serviceName);
    const msg = preferredShift
      ? `Hola, me gustaría reservar para ${svc.title} en turno de ${preferredShift}. ¿Qué disponibilidad tenéis?`
      : `Hola, me gustaría información y disponibilidad para ${svc.title}.`;
    handleSend(msg, svc.serviceName);
  };

  const handleWhatsAppHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waPhone.trim()) return;

    setWaLoading(true);
    try {
      const res = await fetch("/api/widget/handoff-whatsapp/booking", {
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

      {/* ─── SECCIÓN 1: OTRAS ACTIVIDADES ADICIONALES DE LA ESCUELA DE YOGA SALVADORA CONESA (EXCLUSIVAMENTE 2) ─── */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 pb-3 border-b-2 border-[#0B4A72]">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#0B4A72] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> OTRAS ACTIVIDADES ADICIONALES DE LA ESCUELA DE YOGA SALVADORA CONESA
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 mt-1">
                Longevidad (Bienestar Experience) & Iaidō (Esgrima Japonesa)
              </h3>
            </div>
            <span className="text-xs text-stone-600 font-medium">
              Actividades adicionales • Presencial & Online
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {centroActivities.map((act) => (
            <div
              key={act.id}
              className="bg-white rounded-3xl border-2 border-stone-200 p-6 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between hover:border-[#800020] relative overflow-hidden group"
            >
              {/* Background accent */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-bl from-amber-100/50 via-transparent to-transparent rounded-bl-full pointer-events-none" />

              <div>
                {/* Header Badge */}
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-stone-100 text-stone-800 flex items-center gap-1.5 border border-stone-200">
                    <span>{act.categoryIcon}</span> {act.category}
                  </span>
                  {act.badge && (
                    <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                      {act.badge}
                    </span>
                  )}
                </div>

                {/* Title & Emblem for Bienestar Experience */}
                {act.id === "bienestar-experience" ? (
                  <div className="space-y-4 mb-4">
                    <div className="flex items-center gap-3">
                      {/* Emblem SVG inspired by the user's PDF */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-full bg-stone-900 text-white flex items-center justify-center p-2 border-2 border-amber-500 shadow-md text-center">
                        <div className="leading-tight">
                          <span className="block text-[8px] font-bold tracking-widest text-amber-300 uppercase">BIEN</span>
                          <span className="block text-[10px] font-extrabold tracking-wider uppercase">ESTAR</span>
                          <span className="block text-[8px] font-bold tracking-widest text-stone-300 uppercase">EXP</span>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-serif text-xl sm:text-2xl font-bold text-stone-900 group-hover:text-[#800020] transition-colors leading-snug">
                          {act.title}
                        </h4>
                        <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                          {act.priceTag} • {act.modalities?.join(" · ")}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
                      {act.desc}
                    </p>

                    {/* Tags from PDF Emblem */}
                    {act.tags && (
                      <div className="pt-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B4A72] block mb-1.5">
                          🔬 Disciplinas y Áreas Incluidas (PDF Oficial):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {act.tags.map((t) => (
                            <span
                              key={t}
                              className="inline-block bg-amber-50 text-amber-900 border border-amber-200/80 px-2 py-0.5 rounded-md text-[10px] font-medium"
                            >
                              • {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <h4 className="font-serif text-xl sm:text-2xl font-bold text-stone-900 mb-2 group-hover:text-[#800020] transition-colors">
                      {act.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-stone-700 leading-relaxed mb-4">
                      {act.desc}
                    </p>
                    {act.tags && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {act.tags.map((t) => (
                          <span
                            key={t}
                            className="bg-stone-100 text-stone-800 px-2 py-0.5 rounded-md text-[11px] font-medium border border-stone-200"
                          >
                            ✓ {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Schedules */}
                {act.schedules && (
                  <div className="bg-[#FAF9F6] rounded-2xl p-4 border border-stone-200/90 space-y-2 mb-4">
                    <div className="text-xs font-bold text-[#800020] uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[#0B4A72]" /> Horarios y Condiciones:
                    </div>
                    {act.schedules.afternoon && (
                      <div className="text-xs text-stone-800">
                        <strong>Turnos:</strong> {act.schedules.afternoon}
                      </div>
                    )}
                    {act.schedules.morning && (
                      <div className="text-xs text-stone-800">
                        <strong>Mañanas:</strong> {act.schedules.morning}
                      </div>
                    )}
                    {act.schedules.note && (
                      <div className="text-[11px] text-stone-600 italic pt-1 border-t border-stone-200">
                        ℹ️ {act.schedules.note}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-stone-100 space-y-2.5">
                <button
                  onClick={() => handleServiceSelect(act)}
                  className="w-full py-3 px-4 bg-[#800020] hover:bg-[#800020]/90 text-white rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" /> Reservar / Consultar Disponibilidad
                </button>
                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    onClick={() => {
                      setSelectedService(act.serviceName);
                      setWaModalOpen(true);
                    }}
                    className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1"
                  >
                    <Phone className="w-3.5 h-3.5" /> Pedir por WhatsApp
                  </button>
                  <span className="text-stone-500 font-medium">Pago en centro (Pronto Stripe & Giglon)</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── SECCIÓN 2: CLASES Y SERVICIOS REGULARES DE YOGA & TERAPIA ─── */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 pb-3 border-b-2 border-stone-300">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#800020]">
            ESCUELA SALVADORA CONESA
          </span>
          <h3 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 mt-1">
            Hatha Yoga Terapéutico, Meditaciones y Terapia Gestalt
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {regularYogaServices.map((svc) => (
            <div
              key={svc.id}
              className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between hover:border-[#800020]/40"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-2.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 flex items-center gap-1">
                    <span>{svc.categoryIcon}</span> {svc.category}
                  </span>
                  <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    {svc.priceTag}
                  </span>
                </div>

                <h4 className="font-serif text-base font-bold text-stone-900 mb-1.5 leading-snug">
                  {svc.title}
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed mb-3">
                  {svc.desc}
                </p>

                {svc.schedules && (
                  <div className="bg-[#FAF9F6] rounded-xl p-3 border border-stone-200 text-xs space-y-1 mb-3">
                    <div className="font-bold text-[#800020] text-[11px] uppercase">Horarios:</div>
                    {svc.schedules.morning && (
                      <div className="text-[11px] text-stone-800">
                        <strong>Mañanas:</strong> {svc.schedules.morning}
                      </div>
                    )}
                    {svc.schedules.afternoon && (
                      <div className="text-[11px] text-stone-800">
                        <strong>Tardes:</strong> {svc.schedules.afternoon}
                      </div>
                    )}
                    {svc.schedules.note && (
                      <div className="text-[10px] text-stone-500 italic pt-1 border-t border-stone-200">
                        {svc.schedules.note}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-stone-100 space-y-2">
                <button
                  onClick={() => handleServiceSelect(svc)}
                  className="w-full py-2 px-3 bg-[#800020] hover:bg-[#800020]/90 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1"
                >
                  <Calendar className="w-3.5 h-3.5" /> Reservar Plaza
                </button>
                <div className="flex items-center justify-between text-[11px] text-stone-500">
                  <span>{svc.duration}</span>
                  <button
                    onClick={() => {
                      setSelectedService(svc.serviceName);
                      setWaModalOpen(true);
                    }}
                    className="text-emerald-700 font-bold hover:underline"
                  >
                    WhatsApp
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── SECCIÓN 3: TALLERES, EVENTOS Y RETIROS ESPECIALES ─── */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 pb-3 border-b-2 border-purple-300">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-purple-900">
            ENCUENTROS, SONIDO Y RETIROS
          </span>
          <h3 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 mt-1">
            Baños de Gong, Constelaciones, Ayuno y Pujas
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {eventServices.map((ev) => (
            <div
              key={ev.id}
              className="bg-white rounded-3xl border border-purple-200/80 p-5 shadow-xs hover:shadow-lg transition flex flex-col justify-between hover:border-purple-600"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-2.5">
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-900 border border-purple-200 flex items-center gap-1">
                    <span>{ev.categoryIcon}</span> {ev.category}
                  </span>
                  <span className="text-xs font-extrabold text-stone-900 bg-amber-100 px-2.5 py-0.5 rounded-md">
                    {ev.priceTag}
                  </span>
                </div>

                {ev.badge && (
                  <div className="inline-block bg-purple-100 text-purple-950 font-bold text-[11px] px-2.5 py-0.5 rounded-md mb-2">
                    🗓️ {ev.badge}
                  </div>
                )}

                <h4 className="font-serif text-lg font-bold text-stone-900 mb-1.5 leading-snug">
                  {ev.title}
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed mb-3">
                  {ev.desc}
                </p>

                {ev.schedules?.note && (
                  <div className="bg-stone-50 rounded-xl p-2.5 border border-stone-200 text-[11px] text-stone-600 mb-3 italic">
                    ℹ️ {ev.schedules.note}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-stone-100 space-y-2">
                <button
                  onClick={() => handleServiceSelect(ev)}
                  className="w-full py-2.5 px-4 bg-purple-900 hover:bg-purple-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" /> Solicitar Reserva
                </button>
                <div className="flex items-center justify-between text-[11px] text-stone-500">
                  <span>Duración: {ev.duration}</span>
                  <button
                    onClick={() => {
                      setSelectedService(ev.serviceName);
                      setWaModalOpen(true);
                    }}
                    className="text-emerald-700 font-bold hover:underline"
                  >
                    WhatsApp
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

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
            {allServices.slice(0, 6).map((svc) => (
              <button
                key={svc.id}
                onClick={() => handleServiceSelect(svc)}
                className="bg-white border border-stone-300 hover:bg-[#800020] hover:text-white hover:border-[#800020] rounded-full px-2.5 py-1 text-[10px] font-semibold text-stone-700 whitespace-nowrap transition shadow-2xs flex items-center gap-1"
              >
                <span>{svc.categoryIcon}</span>
                <span>{svc.title.split("(")[0]}</span>
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
