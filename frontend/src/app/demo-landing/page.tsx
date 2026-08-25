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
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronRight,
  Phone,
  User,
  Mail,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { SimuladorDiagnosticoModal } from "@/components/SimuladorDiagnosticoModal";

interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
}

interface Activity {
  id: string;
  title: string;
  category: string;
  categoryIcon: string;
  desc: string;
  schedules: {
    morning?: string;
    afternoon?: string;
    note?: string;
  };
  duration: string;
  priceTag: string;
  isFreeTrial: boolean;
  serviceName: string;
  calendarId: string;
}

export default function DemoLandingPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [simuladorOpen, setSimuladorOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [businessName, setBusinessName] = useState("Centro de Yoga Salvadora Conesa | Parque Granada");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedService, setSelectedService] = useState<string | null>(null);

  // WhatsApp Handoff Form State
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waName, setWaName] = useState("");
  const [waPhone, setWaPhone] = useState("");
  const [waEmail, setWaEmail] = useState("");
  const [waLoading, setWaLoading] = useState(false);
  const [waSuccess, setWaSuccess] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activities: Activity[] = [
    {
      id: "hatha-yoga",
      title: "Hatha Yoga Terapéutico",
      category: "Yoga & Bienestar",
      categoryIcon: "🧘",
      desc: "Práctica consciente de posturas, alineación corporal, respiración terapéutica y relajación profunda.",
      schedules: {
        morning: "Martes y Jueves: 9:45 y 11:15",
        afternoon: "Tardes Martes: 17:00, 18:30, 20:00 | Miércoles: 20:15 | Jueves: 16:00, 17:30, 19:00",
        note: "Clases de hora y media (90 min)",
      },
      duration: "90 min",
      priceTag: "Prueba Gratis",
      isFreeTrial: true,
      serviceName: "Hatha Yoga Terapéutico",
      calendarId: "cal-yoga",
    },
    {
      id: "pilates",
      title: "Pilates",
      category: "Salud & Movimiento",
      categoryIcon: "🤸",
      desc: "Fortalecimiento del core, flexibilidad, postura y control corporal con ejercicios guiados adaptados a cada persona.",
      schedules: {
        morning: "Lunes y Miércoles de 12:00 a 13:00",
      },
      duration: "60 min",
      priceTag: "Prueba Gratis",
      isFreeTrial: true,
      serviceName: "Pilates",
      calendarId: "cal-pilates",
    },
    {
      id: "ninjutsu",
      title: "Bujinkan Budo Taijutsu / Ninjutsu",
      category: "Artes Marciales Tradicionales",
      categoryIcon: "🥋",
      desc: "Arte marcial milenario japonés de defensa personal, biomecánica natural, acondicionamiento y disciplina mental.",
      schedules: {
        morning: "Lunes y Viernes de 10:00 a 11:30",
        afternoon: "Lunes y Miércoles de 20:00 a 21:30",
      },
      duration: "90 min",
      priceTag: "Prueba Gratis",
      isFreeTrial: true,
      serviceName: "Bujinkan Budo Taijutsu / Ninjutsu",
      calendarId: "cal-ninjutsu",
    },
    {
      id: "funcional",
      title: "Entrenamiento Funcional",
      category: "Fitness & Rendimiento",
      categoryIcon: "🏋️",
      desc: "Entrenamiento dinámico para mejorar fuerza, resistencia cardiovascular, movilidad y energía en grupos motivadores.",
      schedules: {
        morning: "Lunes, Miércoles y Viernes de 7:15 a 8:15",
        afternoon: "Lunes y Miércoles de 19:00 a 20:00",
      },
      duration: "60 min",
      priceTag: "Prueba Gratis",
      isFreeTrial: true,
      serviceName: "Entrenamiento Funcional",
      calendarId: "cal-funcional",
    },
    {
      id: "orientales",
      title: "Actividades Orientales (Daruma, Kaisai, Kobudo)",
      category: "Disciplinas Orientales",
      categoryIcon: "🎎",
      desc: "Prácticas de artes orientales tradicionales: Daruma (movimiento interior), Kaisai (aplicación técnica) y Kobudo (manejo de armas tradicionales).",
      schedules: {
        afternoon: "Martes y Jueves: Daruma (19:00-19:55) | Kaisai (20:00-20:55) | Kobudo (21:00-21:45)",
      },
      duration: "55 min",
      priceTag: "Prueba Gratis",
      isFreeTrial: true,
      serviceName: "Actividades Orientales (Daruma, Kaisai, Kobudo)",
      calendarId: "cal-orientales",
    },
    {
      id: "taichi",
      title: "Tai Chi Chuan",
      category: "Arte Marcial Interno",
      categoryIcon: "☯️",
      desc: "Movimientos fluidos, equilibrio energético, serenidad mental y desbloqueo articular a través de la forma clásica.",
      schedules: {
        morning: "Viernes de 10:00 a 11:30",
        afternoon: "Miércoles de 17:30 a 19:00",
      },
      duration: "90 min",
      priceTag: "Prueba Gratis",
      isFreeTrial: true,
      serviceName: "Tai Chi Chuan",
      calendarId: "cal-taichi",
    },
    {
      id: "iaido",
      title: "Iaido (Esgrima Japonesa)",
      category: "Arte de la Katana",
      categoryIcon: "⚔️",
      desc: "El arte del desenvaine y corte con katana japonesa tradicional. Enfoque en la máxima precisión, concentración y etiqueta.",
      schedules: {
        afternoon: "Lunes: 20:00 a 21:00 | Jueves: 20:30 a 22:00",
      },
      duration: "60 - 90 min",
      priceTag: "Prueba Gratis",
      isFreeTrial: true,
      serviceName: "Iaido (Esgrima Japonesa)",
      calendarId: "cal-iaido",
    },
    {
      id: "sesiones-finde",
      title: "Sesión Mensual de Fin de Semana",
      category: "Talleres & Eventos Especiales",
      categoryIcon: "🔔",
      desc: "Encuentros mensuales en sábado/domingo: Baño de Gong (Sonoterapia), Constelaciones Familiares, Taller de Chi Kung, Masajes, Meditación y Yoga Nidra.",
      schedules: {
        afternoon: "Una sesión al mes en fin de semana (Sábados / Domingos)",
        note: "Próximas fechas a consultar con el asistente",
      },
      duration: "60 - 240 min",
      priceTag: "Consultar según taller",
      isFreeTrial: false,
      serviceName: "Sesión Mensual en Fin de Semana (Baño de Gong / Talleres)",
      calendarId: "cal-finde",
    },
  ];

  useEffect(() => {
    let currentSess = localStorage.getItem("crm_widget_demo_session");
    if (!currentSess) {
      currentSess = "sess_" + Math.random().toString(36).substring(2, 9);
      localStorage.setItem("crm_widget_demo_session", currentSess);
    }
    setSessionId(currentSess);

    fetch("http://localhost:3001/api/widget/config/booking")
      .then((r) => r.json())
      .then((data) => {
        if (data.businessName) setBusinessName(data.businessName);
        setMessages([
          {
            id: "greeting",
            direction: "outbound",
            body:
              data.greeting ||
              "¡Hola! Te damos la bienvenida a las actividades del centro (Club Social Parque Granada / Escuela Salvadora Conesa). ¿En qué clase o actividad te gustaría probar tu primera sesión gratuita?",
          },
        ]);
      })
      .catch(() => {
        setMessages([
          {
            id: "greeting-fallback",
            direction: "outbound",
            body:
              "¡Hola! 👋 Te damos la bienvenida a las actividades del Club Social Parque Granada & Centro Salvadora Conesa. Tienes **prueba gratis en todas las clases**. ¿Qué actividad te gustaría probar?",
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
      body: text || `Información y reserva de prueba para ${serviceName}`,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    try {
      const res = await fetch("http://localhost:3001/api/widget/chat/booking", {
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

  const handleActivitySelect = (act: Activity, preferredShift?: string) => {
    setIsOpen(true);
    setSelectedService(act.serviceName);
    const msg = preferredShift
      ? `Hola, me gustaría reservar mi clase de prueba gratis para ${act.title} en turno de ${preferredShift}. ¿Qué disponibilidad tenéis?`
      : `Hola, me gustaría información y reservar mi primera clase de prueba gratis para ${act.title}.`;
    handleSend(msg, act.serviceName);
  };

  const handleWhatsAppHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waPhone.trim()) return;

    setWaLoading(true);
    try {
      const res = await fetch("http://localhost:3001/api/widget/handoff-whatsapp/booking", {
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

      // Add confirmation message to chat
      setMessages((prev) => [
        ...prev,
        {
          id: "handoff_" + Date.now(),
          direction: "outbound",
          body: `📲 ¡Perfecto, ${waName || "amig@"}! Te hemos dado de alta en nuestro sistema con el teléfono **${waPhone}**. Ya puedes continuar la conversación directamente en WhatsApp.`,
        },
      ]);

      // Open WhatsApp after brief delay
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
        body: "¡Hola de nuevo! He reiniciado la conversación. ¿Qué actividad te gustaría consultar o reservar?",
      },
    ]);
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#1E1E1E] font-sans selection:bg-[#800020] selection:text-white relative">
      {/* Top Banner CRM Notification */}
      <div className="bg-[#800020] text-white px-4 py-2 text-xs shadow-md sticky top-0 z-40 border-b border-amber-500/20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">
              <strong>Catálogo de Actividades y Traspaso a WhatsApp:</strong> Prueba el registro de contactos y la reserva de citas.
            </span>
          </div>
          <Link
            href="/conversations"
            className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 px-3 py-1 rounded text-xs font-bold transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Volver al CRM Inbox
          </Link>
        </div>
      </div>

      {/* Top Notice Header */}
      <div className="bg-[#0B4A72] text-white px-4 py-2.5 text-xs text-center font-bold tracking-wide flex items-center justify-center gap-4 flex-wrap shadow-inner">
        <span>📍 CLUB SOCIAL PARQUE GRANADA (Cafetería Bar • Entrada Libre)</span>
        <span className="bg-emerald-500 text-white px-2 py-0.5 rounded text-[11px] font-extrabold uppercase animate-pulse">
          ✨ PRUEBA GRATIS EN TODAS LAS CLASES
        </span>
        <button
          onClick={() => setSimuladorOpen(true)}
          className="inline-flex items-center gap-1 bg-amber-400 hover:bg-amber-300 text-stone-950 px-3 py-0.5 rounded-full text-xs font-bold transition shadow-sm"
        >
          🔬 Simulador IA (Foto / Cámara)
        </button>
        <button
          onClick={() => setWaModalOpen(true)}
          className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 px-3 py-0.5 rounded-full text-white font-semibold transition shadow-sm"
        >
          📱 Continuar por WhatsApp (Alta Rápida)
        </button>
      </div>

      {/* Main Header */}
      <header className="bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] tracking-widest text-[#0B4A72] uppercase font-extrabold">
              CENTRO DE ACTIVIDADES Y YOGA FUENLABRADA
            </span>
            <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#800020] tracking-wide uppercase">
              Salvadora Conesa & Parque Granada
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSimuladorOpen(true)}
              className="bg-amber-400 hover:bg-amber-500 text-stone-950 px-3.5 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Simulador IA
            </button>
            <button
              onClick={() => setLightboxOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 border border-[#800020] text-[#800020] hover:bg-[#800020]/5 px-3.5 py-2 rounded-lg text-xs font-bold transition"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Ver Cartel Completo
            </button>
            <button
              onClick={() => setWaModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5" /> Pedir por WhatsApp
            </button>
            <button
              onClick={() => setIsOpen(true)}
              className="bg-[#800020] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#800020]/90 transition shadow-sm flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Abrir Asistente Web
            </button>
          </div>
        </div>
      </header>

      {/* Hero & Flyer Showcase Section */}
      <section className="max-w-6xl mx-auto px-4 pt-10 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Intro */}
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold uppercase tracking-wider border border-emerald-300">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> ¡Elige tu actividad y prueba tu primera clase sin compromiso!
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-extrabold text-[#800020] leading-tight">
              Actividades del Centro: Yoga, Pilates, Artes Marciales y Talleres
            </h2>
            <p className="text-stone-600 text-sm sm:text-base leading-relaxed">
              Consulta los horarios de mañana y tarde para cada disciplina. Puedes <strong>probar nuestro simulador con IA</strong>, <strong>chatear con nuestro asistente web</strong> o pulsar en <strong>&quot;Continuar por WhatsApp&quot;</strong> para que te demos de alta en el sistema.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => setSimuladorOpen(true)}
                className="bg-amber-400 hover:bg-amber-300 text-stone-950 px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-stone-900" /> 🔬 Probar Diagnóstico IA (Cámara)
              </button>
              <button
                onClick={() => setLightboxOpen(true)}
                className="bg-[#0B4A72] hover:bg-[#0B4A72]/90 text-white px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-sm"
              >
                <ZoomIn className="w-4 h-4" /> 🔍 Agrandar Flyer Oficial (Zoom)
              </button>
              <button
                onClick={() => setWaModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-sm"
              >
                <Phone className="w-4 h-4" /> 📲 Darme de Alta en WhatsApp
              </button>
            </div>
          </div>

          {/* Right Column: Interactive Flyer Preview Card */}
          <div className="lg:col-span-5">
            <div
              onClick={() => setLightboxOpen(true)}
              className="group relative bg-white rounded-2xl p-3 border-2 border-[#800020]/20 shadow-xl hover:shadow-2xl cursor-pointer transition-all duration-300 hover:border-[#800020]"
            >
              <div className="relative overflow-hidden rounded-xl bg-stone-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/flyer-parque-granada.png"
                  alt="Cartel Oficial de Actividades - Club Social Parque Granada"
                  className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 text-white">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Maximize2 className="w-4 h-4 text-amber-300" /> Pulsa para Agrandar el Cartel
                  </div>
                  <span className="text-[11px] text-white/80">Vista en pantalla completa con zoom</span>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-xs px-1">
                <span className="font-bold text-[#800020]">🖼️ Cartel Oficial de Actividades</span>
                <span className="text-[#0B4A72] font-semibold text-[11px] group-hover:underline flex items-center gap-0.5">
                  Ver en grande <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Activities Grid Section */}
      <section className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 pb-4 border-b border-stone-300 gap-4">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#0B4A72]">
              PROGRAMA Y HORARIOS
            </span>
            <h3 className="font-serif text-2xl sm:text-3xl font-bold text-stone-900 mt-0.5">
              Disciplinas y Clases Disponibles
            </h3>
          </div>
          <div className="text-xs text-stone-500 flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Selecciona cualquier actividad para ver disponibilidad o reservar</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activities.map((act) => (
            <div
              key={act.id}
              className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm hover:shadow-lg transition-all flex flex-col justify-between hover:border-[#800020]/40 group"
            >
              <div>
                {/* Header Badge */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 flex items-center gap-1">
                    <span>{act.categoryIcon}</span> {act.category}
                  </span>
                  {act.isFreeTrial ? (
                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                      ✨ Prueba Gratis
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                      {act.priceTag}
                    </span>
                  )}
                </div>

                {/* Title & Desc */}
                <h4 className="font-serif text-lg font-bold text-stone-900 mb-1.5 leading-snug group-hover:text-[#800020] transition-colors">
                  {act.title}
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed mb-4">
                  {act.desc}
                </p>

                {/* Schedule Box */}
                <div className="bg-[#FAF9F6] rounded-xl p-3.5 border border-stone-200/80 space-y-2 mb-4">
                  <div className="text-[11px] font-bold text-[#800020] uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#0B4A72]" /> Horarios de Clases:
                  </div>

                  {act.schedules.morning && (
                    <div className="text-xs text-stone-800 flex items-start gap-1.5">
                      <span className="font-bold text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded uppercase mt-0.5">
                        Mañanas
                      </span>
                      <span className="leading-snug">{act.schedules.morning}</span>
                    </div>
                  )}

                  {act.schedules.afternoon && (
                    <div className="text-xs text-stone-800 flex items-start gap-1.5">
                      <span className="font-bold text-[10px] bg-sky-100 text-sky-900 px-1.5 py-0.5 rounded uppercase mt-0.5">
                        Tardes
                      </span>
                      <span className="leading-snug">{act.schedules.afternoon}</span>
                    </div>
                  )}

                  {act.schedules.note && (
                    <div className="text-[11px] text-stone-500 italic pt-1 border-t border-stone-200">
                      ℹ️ {act.schedules.note}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-stone-100 space-y-2">
                <button
                  onClick={() => handleActivitySelect(act)}
                  className="w-full py-2.5 px-4 bg-[#800020] hover:bg-[#800020]/90 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-sm hover:scale-[1.01] flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" /> Reservar Clase de Prueba
                </button>
                <div className="flex items-center justify-between text-[11px]">
                  <button
                    onClick={() => {
                      setSelectedService(act.serviceName);
                      setWaModalOpen(true);
                    }}
                    className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3" /> Pedir por WhatsApp
                  </button>
                  <span className="text-stone-400">Duración: {act.duration}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-stone-900 text-stone-400 text-xs py-10 border-t border-stone-800">
        <div className="max-w-6xl mx-auto px-4 text-center space-y-2">
          <p className="font-semibold text-stone-300">
            CLUB SOCIAL PARQUE GRANADA & CENTRO DE YOGA SALVADORA CONESA
          </p>
          <p>Cafetería Bar • Entrada Libre • Calle Holanda 1 / Parque Granada, Fuenlabrada.</p>
          <p className="text-stone-500 text-[11px]">
            Consultas y reservas por WhatsApp: <strong>695 172 625</strong> | Cafetería: <strong>624 26 73 45</strong>
          </p>
        </div>
      </footer>

      {/* ─── MODAL "CONTINUAR POR WHATSAPP & ALTA AUTOMÁTICA" ─── */}
      {waModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setWaModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 relative"
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
            <p className="text-xs text-stone-600 mb-5 leading-relaxed">
              Introduce tu nombre y número móvil. <strong>Te daremos de alta automáticamente en el CRM</strong> y abriremos WhatsApp con tu consulta para que no pierdas ningún detalle.
            </p>

            {selectedService && (
              <div className="mb-4 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex items-center justify-between">
                <span className="text-stone-500">Actividad seleccionada:</span>
                <span className="font-bold text-[#800020]">{selectedService}</span>
              </div>
            )}

            {waSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2 text-emerald-800 animate-in zoom-in-95">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold">¡Alta completada en el CRM con éxito!</p>
                <p className="text-[11px] text-emerald-700">Abriendo WhatsApp con tu asesor...</p>
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
                        <span>Abrir WhatsApp y Guardar Cita</span>
                        <ArrowUpRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                <div className="text-[10px] text-stone-400 text-center flex items-center justify-center gap-1 pt-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>Tus datos quedan registrados de forma privada y segura en el CRM.</span>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── LIGHTBOX MODAL PARA AGRANDAR EL FLYER ─── */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Lightbox Controls Bar */}
          <div
            className="w-full max-w-5xl flex items-center justify-between text-white mb-3 px-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="font-bold text-sm">Cartel Oficial de Actividades</span>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded text-stone-200">
                Zoom: {Math.round(zoomLevel * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 2.5))}
                title="Acercar"
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.75))}
                title="Alejar"
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                title="Restablecer tamaño"
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition text-xs font-bold"
              >
                100%
              </button>
              <button
                onClick={() => setLightboxOpen(false)}
                title="Cerrar (Esc)"
                className="p-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Image Container */}
          <div
            className="max-w-5xl max-h-[80vh] overflow-auto rounded-xl border border-white/20 bg-stone-950 p-2 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/flyer-parque-granada.png"
              alt="Cartel Oficial de Actividades Ampliado"
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center center" }}
              className="max-w-full max-h-[75vh] object-contain transition-transform duration-200"
            />
          </div>

          {/* Bottom Bar within Lightbox */}
          <div
            className="mt-3 flex items-center gap-3 flex-wrap justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setLightboxOpen(false);
                setIsOpen(true);
              }}
              className="bg-[#800020] hover:bg-[#800020]/90 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg"
            >
              <Calendar className="w-4 h-4" /> Reservar mi Clase de Prueba en el Chat
            </button>
            <button
              onClick={() => {
                setLightboxOpen(false);
                setWaModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg"
            >
              📱 Continuar por WhatsApp y Darme de Alta
            </button>
          </div>
        </div>
      )}

      {/* ─── FLOATING ANALIZAIA SIMULATOR BUBBLE ─── */}
      <button
        onClick={() => setSimuladorOpen(true)}
        aria-label="Abrir Simulador de Diagnóstico IA"
        title="Diagnóstico Visual con IA"
        className="fixed bottom-24 right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-linear-to-tr from-sky-600 to-indigo-600 text-white shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 z-40 flex items-center justify-center border-2 border-white/60 group"
      >
        <div className="relative flex items-center justify-center">
          <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-amber-300 animate-pulse" />
          <span className="absolute -left-36 bg-neutral-900/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition shadow-md pointer-events-none hidden md:block">
            ✨ Diagnóstico con IA
          </span>
        </div>
      </button>

      {/* ─── FLOATING CHAT BUBBLE BUTTON ─── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Abrir Asistente de Citas"
        className="fixed bottom-6 right-6 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#800020] text-white shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 z-40 flex items-center justify-center border-2 border-white/40 group"
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

      {/* ─── FLOATING CHAT MODAL WINDOW ─── */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[410px] max-w-[calc(100vw-32px)] h-[600px] max-h-[calc(100vh-120px)] bg-white rounded-2xl shadow-2xl border border-stone-200 z-40 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-300">
          {/* Header */}
          <div className="bg-[#800020] text-white p-3.5 flex items-center justify-between shadow-sm">
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
            {activities.map((act) => (
              <button
                key={act.id}
                onClick={() => handleActivitySelect(act)}
                className="bg-white border border-stone-300 hover:bg-[#800020] hover:text-white hover:border-[#800020] rounded-full px-3 py-1 text-[11px] font-semibold text-stone-700 whitespace-nowrap transition shadow-2xs flex items-center gap-1"
              >
                <span>{act.categoryIcon}</span>
                <span>{act.title.split("(")[0]}</span>
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
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.direction === "inbound" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
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
          <div className="p-3 bg-white border-t border-stone-200 flex items-center gap-2">
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
              placeholder="Ej: ¿Qué turnos hay de Ninjutsu los lunes?..."
              className="flex-1 bg-stone-100 border border-stone-300 focus:border-[#800020] focus:bg-white rounded-full px-4 py-2 text-xs text-stone-800 outline-none transition"
            />
            <button
              onClick={() => handleSend()}
              disabled={isTyping || !inputValue.trim()}
              className="w-8 h-8 rounded-full bg-[#800020] text-white flex items-center justify-center hover:bg-[#800020]/90 disabled:opacity-40 disabled:cursor-not-allowed transition flex-shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ─── SIMULADOR DE DIAGNÓSTICO POR IA (MODAL COMPLETO) ─── */}
      <SimuladorDiagnosticoModal
        open={simuladorOpen}
        onClose={() => setSimuladorOpen(false)}
      />
    </div>
  );
}

