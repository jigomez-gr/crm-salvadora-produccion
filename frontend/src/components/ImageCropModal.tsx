"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  Sparkles,
  Camera,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Move,
  Crop,
  Check,
  AlertCircle,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiFetch, ApiError, apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export type SpecialtyType =
  | "dental"
  | "dental_xray"
  | "dermatology"
  | "aesthetic"
  | "general";

export interface SpecialtyMeta {
  key: SpecialtyType;
  label: string;
  badge: string;
  icon: string;
  description: string;
}

export const SPECIALTIES: SpecialtyMeta[] = [
  {
    key: "dental",
    label: "Dental (boca/encías)",
    badge: "🦷 Dental",
    icon: "🦷",
    description: "Detección de placa, gingivitis, cálculo y caries visibles",
  },
  {
    key: "dental_xray",
    label: "Radiografía dental",
    badge: "🩻 Radiografía dental",
    icon: "🩻",
    description: "Evaluación de crestas óseas, ligamento y ápices radiculares",
  },
  {
    key: "dermatology",
    label: "Dermatología",
    badge: "🔬 Dermatología",
    icon: "🔬",
    description: "Análisis dermatoscópico de lesiones con criterios ABCDE",
  },
  {
    key: "aesthetic",
    label: "Estética",
    badge: "✨ Estética",
    icon: "✨",
    description: "Mapeo facial, líneas de expresión, fotoenvejecimiento y soporte",
  },
  {
    key: "general",
    label: "General",
    badge: "📋 General",
    icon: "📋",
    description: "Dictamen clínico visual y triaje asistido por IA",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  initialImageSrc?: string;
  selectedSpecialty: SpecialtyType;
  appointmentId?: string;
  patientName?: string;
  notes?: string;
  onAnalysisSuccess: (result: {
    analysisText: string;
    modality: string;
    croppedImageBase64: string;
    confidence?: number;
    findings?: string[];
    recommendations?: string[];
  }) => void;
}

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function ImageCropModal({
  open,
  onClose,
  initialImageSrc,
  selectedSpecialty,
  appointmentId,
  patientName,
  notes,
  onAnalysisSuccess,
}: Props) {
  const [currentSpecialty, setCurrentSpecialty] = useState<SpecialtyType>(selectedSpecialty || "dental");
  const [imageSrc, setImageSrc] = useState<string | null>(initialImageSrc || null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [activeTool, setActiveTool] = useState<"crop" | "move">("crop");
  const [zoom, setZoom] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const activeSpecialtyMeta =
    SPECIALTIES.find((s) => s.key === currentSpecialty) || SPECIALTIES[0];

  useEffect(() => {
    if (selectedSpecialty) {
      setCurrentSpecialty(selectedSpecialty);
    }
  }, [selectedSpecialty]);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Pan offset for "move" tool
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Crop box in container pixel coordinates
  const [cropBox, setCropBox] = useState<CropBox>({
    x: 100,
    y: 80,
    width: 320,
    height: 240,
  });

  // Dragging state
  const isDraggingRef = useRef<string | null>(null); // "box" | "tl" | "tr" | "bl" | "br" | "pan"
  const startDragRef = useRef<{ mouseX: number; mouseY: number; box: CropBox; pan: { x: number; y: number } }>({
    mouseX: 0,
    mouseY: 0,
    box: { x: 0, y: 0, width: 0, height: 0 },
    pan: { x: 0, y: 0 },
  });

  // Initialize or update image when prop changes
  useEffect(() => {
    if (initialImageSrc) {
      setImageSrc(initialImageSrc);
    }
  }, [initialImageSrc]);

  // Center the crop box when image loads
  const handleImageLoaded = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = Math.min(360, rect.width * 0.7);
    const h = Math.min(260, rect.height * 0.6);
    setCropBox({
      x: (rect.width - w) / 2,
      y: (rect.height - h) / 2,
      width: w,
      height: h,
    });
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  // Handle camera stop on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Attach camera stream whenever camera becomes active
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraActive]);

  async function startCamera() {
    try {
      setError("");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      setIsCameraActive(true);

      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      setError("No se pudo acceder a la cámara. Por favor selecciona una imagen de archivo o autoriza los permisos.");
      setIsCameraActive(false);
    }
  }

  function captureFromCamera() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    setImageSrc(dataUrl);

    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setIsCameraActive(false);
    };
    reader.readAsDataURL(file);
  }

  // Pointer interactions for cropping & dragging
  const handlePointerDown = (type: string, e: React.PointerEvent) => {
    e.stopPropagation();
    isDraggingRef.current = type;
    startDragRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      box: { ...cropBox },
      pan: { ...panOffset },
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const dx = e.clientX - startDragRef.current.mouseX;
    const dy = e.clientY - startDragRef.current.mouseY;
    const containerRect = containerRef.current.getBoundingClientRect();

    if (isDraggingRef.current === "pan") {
      setPanOffset({
        x: startDragRef.current.pan.x + dx,
        y: startDragRef.current.pan.y + dy,
      });
      return;
    }

    if (isDraggingRef.current === "box") {
      const newX = Math.max(0, Math.min(containerRect.width - cropBox.width, startDragRef.current.box.x + dx));
      const newY = Math.max(0, Math.min(containerRect.height - cropBox.height, startDragRef.current.box.y + dy));
      setCropBox((prev) => ({ ...prev, x: newX, y: newY }));
      return;
    }

    // Handle corner resizes
    let { x, y, width, height } = startDragRef.current.box;
    const minSize = 60;

    if (isDraggingRef.current === "tl") {
      const newW = Math.max(minSize, width - dx);
      const newH = Math.max(minSize, height - dy);
      x = x + (width - newW);
      y = y + (height - newH);
      width = newW;
      height = newH;
    } else if (isDraggingRef.current === "tr") {
      width = Math.max(minSize, width + dx);
      const newH = Math.max(minSize, height - dy);
      y = y + (height - newH);
      height = newH;
    } else if (isDraggingRef.current === "bl") {
      const newW = Math.max(minSize, width - dx);
      x = x + (width - newW);
      width = newW;
      height = Math.max(minSize, height + dy);
    } else if (isDraggingRef.current === "br") {
      width = Math.max(minSize, width + dx);
      height = Math.max(minSize, height + dy);
    }

    setCropBox({
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: Math.min(containerRect.width - x, width),
      height: Math.min(containerRect.height - y, height),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Perform Crop and Call AnalizaIA
  async function handleAnalyze() {
    if (!imageRef.current || !containerRef.current) return;
    setAnalyzing(true);
    setError("");

    try {
      const img = imageRef.current;
      const containerRect = containerRef.current.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();

      // Calculate relative position within original image resolution
      const scaleX = img.naturalWidth / imgRect.width;
      const scaleY = img.naturalHeight / imgRect.height;

      const cropXInImg = (cropBox.x - (imgRect.left - containerRect.left)) * scaleX;
      const cropYInImg = (cropBox.y - (imgRect.top - containerRect.top)) * scaleY;
      const cropWInImg = cropBox.width * scaleX;
      const cropHInImg = cropBox.height * scaleY;

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(cropWInImg));
      canvas.height = Math.max(1, Math.round(cropHInImg));
      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("No se pudo inicializar el procesador de imagen");

      ctx.drawImage(
        img,
        Math.max(0, cropXInImg),
        Math.max(0, cropYInImg),
        cropWInImg,
        cropHInImg,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const croppedBase64 = canvas.toDataURL("image/jpeg", 0.92);

      // Call AnalizaIA API
      const endpoint = appointmentId
        ? `/api/appointments/${appointmentId}/analyze-ai`
        : `/api/appointments/analyze-ai`;

      const response = await apiFetch<any>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          modality: currentSpecialty,
          imageBase64: croppedBase64,
          mimeType: "image/jpeg",
          notes,
          patientName,
        }),
      });

      const analysisData = response.analysis || response;

      onAnalysisSuccess({
        analysisText: analysisData.analysisText || analysisData.result || "Análisis completado",
        modality: currentSpecialty,
        croppedImageBase64: croppedBase64,
        confidence: analysisData.confidence,
        findings: analysisData.findings,
        recommendations: analysisData.recommendations,
      });

      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Error al comunicarse con el servicio de análisis de IA. Inténtalo de nuevo."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-6 backdrop-blur-xs font-sans">
      <div className="relative flex flex-col h-[94vh] max-h-[860px] w-full max-w-5xl rounded-2xl bg-[#0f141f] border border-neutral-800 text-white shadow-2xl overflow-hidden">
        {/* ─── Top Header ─── */}
        <div className="flex items-center justify-between border-b border-neutral-800 bg-[#161d2b] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>

          <div className="text-center">
            <h2 className="text-sm font-bold tracking-wide text-neutral-100 flex items-center gap-2 justify-center">
              <span>Captura, recorta y analiza</span>
            </h2>
            <p className="text-[11px] text-neutral-400">
              Ajusta el marco de recorte sobre la región de interés (lengua, dientes, piel, cara)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-neutral-400 hidden sm:inline">
              Especialidad IA:
            </label>
            <select
              value={currentSpecialty}
              onChange={(e) => setCurrentSpecialty(e.target.value as SpecialtyType)}
              className="rounded-lg border border-amber-500/40 bg-neutral-900 px-2.5 py-1 text-xs font-bold text-amber-300 shadow-xs outline-none cursor-pointer focus:border-amber-400 transition"
              title="Cambiar especialidad de análisis IA"
            >
              {SPECIALTIES.map((spec) => (
                <option key={spec.key} value={spec.key} className="bg-neutral-900 text-white">
                  {spec.icon} {spec.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ─── Central Canvas Workspace (Checkerboard Dark Background) ─── */}
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative flex-1 bg-[#121824] overflow-hidden flex items-center justify-center select-none touch-none"
          style={{
            backgroundImage: `radial-gradient(#1e293b 1px, transparent 1px), radial-gradient(#1e293b 1px, #121824 1px)`,
            backgroundSize: "24px 24px",
          }}
        >
          {isCameraActive ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => {
                  videoRef.current?.play().catch(() => {});
                }}
                className="max-h-full max-w-full rounded-xl border border-neutral-700 shadow-lg object-contain"
              />
              <button
                type="button"
                onClick={captureFromCamera}
                className="absolute bottom-6 inline-flex items-center gap-2 rounded-full bg-red-600 hover:bg-red-700 px-6 py-3 text-sm font-bold text-white shadow-xl transition-transform hover:scale-105"
              >
                <Camera className="h-5 w-5" />
                Capturar Foto
              </button>
            </div>
          ) : imageSrc ? (
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
              {/* Target Image with Zoom and Pan */}
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Para recortar"
                onLoad={handleImageLoaded}
                draggable={false}
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                  maxHeight: "85%",
                  maxWidth: "85%",
                  objectFit: "contain",
                }}
                className="transition-transform duration-75 select-none pointer-events-none rounded shadow-md"
              />

              {/* Darkened overlay surrounding the crop box */}
              <div
                className="absolute inset-0 bg-black/40 pointer-events-none"
                style={{
                  clipPath: `polygon(0% 0%, 0% 100%, ${cropBox.x}px 100%, ${cropBox.x}px ${cropBox.y}px, ${cropBox.x + cropBox.width}px ${cropBox.y}px, ${cropBox.x + cropBox.width}px ${cropBox.y + cropBox.height}px, ${cropBox.x}px ${cropBox.y + cropBox.height}px, ${cropBox.x}px 100%, 100% 100%, 100% 0%)`,
                }}
              />

              {/* ─── Interactive Crop Box ─── */}
              <div
                style={{
                  left: `${cropBox.x}px`,
                  top: `${cropBox.y}px`,
                  width: `${cropBox.width}px`,
                  height: `${cropBox.height}px`,
                }}
                onPointerDown={(e) => handlePointerDown("box", e)}
                className="absolute border-2 border-sky-400 bg-sky-400/5 cursor-move shadow-2xl z-20 group"
              >
                {/* Rule of Thirds Grid Lines */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                  <div className="border-r border-b border-white/40" />
                  <div className="border-r border-b border-white/40" />
                  <div className="border-b border-white/40" />
                  <div className="border-r border-b border-white/40" />
                  <div className="border-r border-b border-white/40" />
                  <div className="border-b border-white/40" />
                  <div className="border-r border-white/40" />
                  <div className="border-r border-white/40" />
                  <div />
                </div>

                {/* Center crosshair */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50">
                  <div className="h-2 w-2 rounded-full bg-sky-300" />
                </div>

                {/* Corner Resize Handles with enlarged touch target */}
                <div
                  onPointerDown={(e) => handlePointerDown("tl", e)}
                  className="absolute -top-3 -left-3 p-1.5 cursor-nwse-resize touch-none z-30"
                >
                  <div className="h-4 w-4 rounded-xs bg-sky-400 border-2 border-white shadow-md" />
                </div>
                <div
                  onPointerDown={(e) => handlePointerDown("tr", e)}
                  className="absolute -top-3 -right-3 p-1.5 cursor-nesw-resize touch-none z-30"
                >
                  <div className="h-4 w-4 rounded-xs bg-sky-400 border-2 border-white shadow-md" />
                </div>
                <div
                  onPointerDown={(e) => handlePointerDown("bl", e)}
                  className="absolute -bottom-3 -left-3 p-1.5 cursor-nesw-resize touch-none z-30"
                >
                  <div className="h-4 w-4 rounded-xs bg-sky-400 border-2 border-white shadow-md" />
                </div>
                <div
                  onPointerDown={(e) => handlePointerDown("br", e)}
                  className="absolute -bottom-3 -right-3 p-1.5 cursor-nwse-resize touch-none z-30"
                >
                  <div className="h-4 w-4 rounded-xs bg-sky-400 border-2 border-white shadow-md" />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center p-8 max-w-md space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-800 text-sky-400 mx-auto">
                <Camera className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-100">
                  Carga o captura una imagen para el análisis
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Puedes activar tu cámara web o subir una fotografía / radiografía para recortar el trozo específico a evaluar.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={startCamera}
                  className="bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold"
                >
                  <Camera className="h-4 w-4 mr-1.5" />
                  Abrir Cámara
                </Button>
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 cursor-pointer transition-colors">
                  <Upload className="h-4 w-4" />
                  Subir Archivo
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ─── Bottom Interactive Toolbar ─── */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-neutral-800 bg-[#161d2b] px-6 py-4 gap-4">
          {/* Zoom Slider Control */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs font-semibold text-neutral-400">Zoom:</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <input
              type="range"
              min="0.6"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-32 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(1)))}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <span className="text-[11px] font-mono text-neutral-400 w-10">
              {(zoom * 100).toFixed(0)}%
            </span>
          </div>

          {/* Action Tool Buttons */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-neutral-700 bg-neutral-800/80 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTool("move")}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                  activeTool === "move"
                    ? "bg-neutral-700 text-white shadow-xs"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                <Move className="h-3.5 w-3.5" />
                Mover
              </button>
              <button
                type="button"
                onClick={() => setActiveTool("crop")}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                  activeTool === "crop"
                    ? "bg-neutral-700 text-white shadow-xs"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                <Crop className="h-3.5 w-3.5" />
                Recortar
              </button>
            </div>

            <button
              type="button"
              onClick={handleImageLoaded}
              className="rounded-lg border border-neutral-700 bg-neutral-800/80 p-2 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
              title="Restablecer posición y recorte"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <label
              className="rounded-lg border border-neutral-700 bg-neutral-800/80 p-2 text-neutral-400 hover:bg-neutral-700 hover:text-white cursor-pointer transition-colors"
              title="Cargar otra foto"
            >
              <Upload className="h-3.5 w-3.5" />
              <input
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                onChange={handleFileChange}
              />
            </label>

            <button
              type="button"
              onClick={startCamera}
              className="rounded-lg border border-neutral-700 bg-neutral-800/80 p-2 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
              title="Tomar foto con cámara web"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Primary Action Button: Analizar */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {error && (
              <span className="text-xs text-red-400 flex items-center gap-1 truncate max-w-xs">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </span>
            )}

            <Button
              type="button"
              variant="primary"
              disabled={analyzing || !imageSrc || isCameraActive}
              onClick={handleAnalyze}
              className={cn(
                "min-w-[140px] px-5 py-2 text-xs font-bold tracking-wide rounded-xl shadow-lg transition-all",
                analyzing
                  ? "bg-emerald-700 text-white animate-pulse"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30"
              )}
            >
              {analyzing ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1.5 text-amber-300" />
                  Analizar Trozo
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
