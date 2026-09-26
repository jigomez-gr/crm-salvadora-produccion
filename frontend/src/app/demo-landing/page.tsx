"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Smartphone,
  Tablet,
  Laptop,
  Monitor,
  RotateCcw,
  ExternalLink,
  Globe,
  Film,
  Sparkles,
  Mail,
  Home,
  SlidersHorizontal,
  CheckCircle2,
} from "lucide-react";

type DeviceMode = "desktop" | "laptop" | "tablet" | "mobile";

const BASE_LANDING_URL = "https://salvadora.jigretera.com";

const PRESET_ROUTES = [
  { label: "Portada Principal", path: "/", icon: Home },
  { label: "Diapositivas Centro", path: "/#itinerario", icon: Sparkles },
  { label: "Auditorio Vídeos", path: "/#videos", icon: Film },
  { label: "Catálogo Servicios", path: "/servicios", icon: SlidersHorizontal },
  { label: "Contacto y Reservas", path: "/#contacto", icon: Mail },
];

export default function DemoLandingPage() {
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [targetUrl, setTargetUrl] = useState<string>(BASE_LANDING_URL);
  const [inputUrl, setInputUrl] = useState<string>(BASE_LANDING_URL);
  const [iframeKey, setIframeKey] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleNavigate = (path: string) => {
    const full = path.startsWith("http") ? path : `${BASE_LANDING_URL}${path}`;
    setTargetUrl(full);
    setInputUrl(full);
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let url = inputUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    setTargetUrl(url);
    setInputUrl(url);
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const getContainerWidth = () => {
    switch (device) {
      case "mobile":
        return "w-[390px] h-[844px] shadow-2xl rounded-[40px] border-[10px] border-stone-800 my-4";
      case "tablet":
        return "w-[768px] h-[1024px] shadow-2xl rounded-[32px] border-[10px] border-stone-800 my-4";
      case "laptop":
        return "w-[1280px] h-[820px] shadow-xl rounded-xl border border-stone-300 my-4";
      case "desktop":
      default:
        return "w-full h-full border-0";
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F4F1EA] text-stone-900 select-none overflow-hidden">
      {/* ─── BARRA SUPERIOR DE CONTROL DEL SIMULADOR ─── */}
      <header className="bg-[#800020] text-white px-3 sm:px-5 py-2.5 shadow-md shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/25">
        {/* Identificador y Estado en Vivo */}
        <div className="flex items-center gap-3">
          <Link
            href="/conversations"
            className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-md text-xs font-bold transition"
            title="Volver a la bandeja del CRM"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CRM Inbox</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <div className="leading-tight">
              <span className="font-serif font-bold text-sm tracking-wide text-amber-200">
                Simulador Oficial Web
              </span>
              <span className="text-[10px] text-stone-300 block">
                Comportamiento en Vivo · Centro Salvadora Conesa
              </span>
            </div>
          </div>
        </div>

        {/* Selector de Dispositivos */}
        <div className="flex items-center bg-black/25 rounded-lg p-0.5 border border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setDevice("desktop")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
              device === "desktop" ? "bg-white text-[#800020] shadow-xs" : "text-stone-300 hover:text-white"
            }`}
            title="Pantalla Completa Escritorio"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Escritorio</span>
          </button>
          <button
            type="button"
            onClick={() => setDevice("laptop")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
              device === "laptop" ? "bg-white text-[#800020] shadow-xs" : "text-stone-300 hover:text-white"
            }`}
            title="Portátil (1280px)"
          >
            <Laptop className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Portátil</span>
          </button>
          <button
            type="button"
            onClick={() => setDevice("tablet")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
              device === "tablet" ? "bg-white text-[#800020] shadow-xs" : "text-stone-300 hover:text-white"
            }`}
            title="Tablet (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Tablet</span>
          </button>
          <button
            type="button"
            onClick={() => setDevice("mobile")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
              device === "mobile" ? "bg-white text-[#800020] shadow-xs" : "text-stone-300 hover:text-white"
            }`}
            title="Móvil (390px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Móvil</span>
          </button>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReload}
            className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="Recargar página simulada"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 bg-amber-400 hover:bg-amber-300 text-stone-950 px-2.5 py-1 rounded-md text-xs font-bold transition shadow-xs"
            title="Abrir en pestaña nueva"
          >
            <span>Abrir Real</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </header>

      {/* ─── BARRA DE RUTAS Y NAVEGACIÓN DIRECTA ─── */}
      <div className="bg-[#FAF9F6] border-b border-stone-300 px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Enlaces de secciones principales de la landing */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mr-1">
            Secciones:
          </span>
          {PRESET_ROUTES.map((route) => {
            const Icon = route.icon;
            const isSelected = targetUrl === `${BASE_LANDING_URL}${route.path}` || (route.path === "/" && targetUrl === BASE_LANDING_URL);
            return (
              <button
                key={route.path}
                onClick={() => handleNavigate(route.path)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition cursor-pointer ${
                  isSelected
                    ? "bg-[#800020] text-white shadow-2xs font-bold"
                    : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 hover:text-[#800020]"
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{route.label}</span>
              </button>
            );
          })}
        </div>

        {/* Input de URL para pruebas locales o enlaces directos */}
        <form onSubmit={handleUrlSubmit} className="flex items-center gap-1.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Globe className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://salvadora.jigretera.com"
              className="w-full bg-white border border-stone-300 rounded-lg pl-8 pr-2.5 py-1 text-xs text-stone-800 focus:outline-none focus:border-[#800020] font-mono shadow-2xs"
            />
          </div>
          <button
            type="submit"
            className="px-2.5 py-1 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            Ir
          </button>
        </form>
      </div>

      {/* ─── NOTIFICACIÓN DE INTEGRACIÓN ACTIVA ─── */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-[11px] text-amber-900 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>
            <strong>Simulación Fiel y Sincronizada:</strong> Este visor muestra la landing web de Salvadora idéntica a producción (vídeos enmarcados, diapositivas, audios y formulario de reservas). Las consultas enviadas por el chat o teléfono IA se registran al instante en este CRM.
          </span>
        </div>
        <span className="text-[10px] text-stone-500 font-mono hidden md:inline">
          Resolución: {device === "desktop" ? "100% Fluido" : device === "laptop" ? "1280 × 820" : device === "tablet" ? "768 × 1024" : "390 × 844"}
        </span>
      </div>

      {/* ─── CONTENEDOR DEL VISOR INTERACTIVO ─── */}
      <div className="flex-1 bg-stone-200/70 p-0 sm:p-2 flex items-center justify-center overflow-auto relative">
        <div className={`transition-all duration-300 relative bg-white overflow-hidden flex flex-col ${getContainerWidth()}`}>
          {/* Barra de estado móvil/tablet si aplica */}
          {(device === "mobile" || device === "tablet") && (
            <div className="bg-stone-900 text-white px-6 py-1.5 text-[10px] flex items-center justify-between shrink-0 select-none">
              <span className="font-semibold">09:41</span>
              <div className="w-16 h-4 bg-black rounded-full mx-auto" />
              <div className="flex items-center gap-1 text-[9px]">
                <span>5G</span>
                <span>100%</span>
              </div>
            </div>
          )}

          {/* Iframe que carga la página real de Salvadora */}
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={targetUrl}
            title="Simulador Web Salvadora Conesa"
            className="w-full h-full border-0 flex-1 bg-white"
            onLoad={() => setIsLoading(false)}
            allow="camera; microphone; autoplay; clipboard-write; encrypted-media"
          />

          {/* Indicador de Carga */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex flex-col items-center justify-center gap-3 z-30">
              <div className="w-8 h-8 border-3 border-[#800020] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-[#800020] tracking-wide font-serif">
                Cargando la Landing de Salvadora...
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
