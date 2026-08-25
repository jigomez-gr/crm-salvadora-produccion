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
  Crop,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
  Mail,
  Phone,
  Send,
  User,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type ModalityType =
  | "dental"
  | "dental_xray"
  | "dermatology"
  | "aesthetic"
  | "general";

export interface SpecialtyOption {
  key: ModalityType;
  label: string;
  badge: string;
  icon: string;
  desc: string;
}

export const MODALITIES: SpecialtyOption[] = [
  {
    key: "dental",
    label: "Dental (boca/encías)",
    badge: "🦷 Dental",
    icon: "🦷",
    desc: "Placa, gingivitis, cálculo dental y caries visibles.",
  },
  {
    key: "dental_xray",
    label: "Radiografía dental (RX)",
    badge: "🩻 Radiografía dental",
    icon: "🩻",
    desc: "Evaluación ósea, crestas marginales y ápices radiculares.",
  },
  {
    key: "dermatology",
    label: "Dermatología (piel/lesiones)",
    badge: "🔬 Dermatología",
    icon: "🔬",
    desc: "Análisis dermatoscópico con criterios morfológicos ABCDE.",
  },
  {
    key: "aesthetic",
    label: "Estética y Rejuvenecimiento",
    badge: "✨ Estética",
    icon: "✨",
    desc: "Fotoenvejecimiento, líneas de expresión y soporte facial.",
  },
  {
    key: "general",
    label: "Medicina General / Triaje Visual",
    badge: "📋 General",
    icon: "📋",
    desc: "Dictamen orientativo visual y triaje sintomático.",
  },
];

interface DoctorOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialPhone?: string;
  initialName?: string;
  initialEmail?: string;
  initialDoctor?: string;
  initialModality?: ModalityType;
  lockModality?: boolean;
  apiUrl?: string;
}

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getStoredState() {
  if (typeof window === "undefined") return {};
  try {
    const s = localStorage.getItem("analizaia_simulador_state");
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

export function SimuladorDiagnosticoModal({
  open,
  onClose,
  initialPhone = "",
  initialName = "",
  initialEmail = "",
  initialDoctor = "",
  initialModality = "dental",
  lockModality = false,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
}: Props) {
  // Wizard Step: 1 = Contacto, 2 = Especialidad & Doctor, 3 = Foto & IA, 4 = Envío & Consentimiento, 5 = Éxito
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1: Contacto (with immediate fallback to remembered inputs)
  const [correo, setCorreo] = useState(() => initialEmail || getStoredState().correo || "");
  const [movil, setMovil] = useState(() => initialPhone || getStoredState().movil || "");
  const [nombre, setNombre] = useState(() => initialName || getStoredState().nombre || "");
  const [apellido, setApellido] = useState(() => getStoredState().apellido || "");
  const [telegramId, setTelegramId] = useState(() => getStoredState().telegramId || "");

  // Step 2: Especialidad & Doctor
  const [servicioCodigo, setServicioCodigo] = useState<ModalityType>(initialModality);
  const [isModalityLocked, setIsModalityLocked] = useState(lockModality);
  const [doctorCorreo, setDoctorCorreo] = useState(() => initialDoctor || getStoredState().doctorCorreo || "");
  const [doctores, setDoctores] = useState<DoctorOption[]>([]);
  const [loadingDoctores, setLoadingDoctores] = useState(false);

  // Step 3: Cámara / Recorte / Diagnóstico IA
  const [tabSource, setTabSource] = useState<"camera" | "file">("camera");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [motivoPaciente, setMotivoPaciente] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [diagnosticoIA, setDiagnosticoIA] = useState<string | null>(null);
  const [diagnosticoMeta, setDiagnosticoMeta] = useState<any>(null);

  // Step 4: Canal & Consentimiento
  const [canalRespuesta, setCanalRespuesta] = useState<"whatsapp" | "email" | "telegram">("whatsapp");
  const [consentimiento, setConsentimiento] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [petitionSuccess, setPetitionSuccess] = useState<{
    idPeticion: string;
    whatsappUrl?: string;
    correoEnviado: boolean;
  } | null>(null);

  const [errorMessage, setErrorMessage] = useState("");

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Crop box in container coordinates
  const [cropBox, setCropBox] = useState<CropBox>({
    x: 60,
    y: 40,
    width: 340,
    height: 260,
  });

  const isDraggingRef = useRef<string | null>(null);
  const startDragRef = useRef<{ mouseX: number; mouseY: number; box: CropBox }>({
    mouseX: 0,
    mouseY: 0,
    box: { x: 0, y: 0, width: 0, height: 0 },
  });

  // Load remembered fields from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("analizaia_simulador_state");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!initialEmail && parsed.correo) setCorreo(parsed.correo);
        if (!initialPhone && parsed.movil) setMovil(parsed.movil);
        if (!initialName && parsed.nombre) setNombre(parsed.nombre);
        if (parsed.apellido) setApellido(parsed.apellido);
        if (parsed.telegramId) setTelegramId(parsed.telegramId);
        if (!initialDoctor && parsed.doctorCorreo) setDoctorCorreo(parsed.doctorCorreo);
        if (parsed.canalRespuesta) setCanalRespuesta(parsed.canalRespuesta);
        if (parsed.motivoPaciente) setMotivoPaciente(parsed.motivoPaciente);
      }
    } catch {}
  }, [initialEmail, initialPhone, initialName, initialDoctor]);

  // Save fields to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(
        "analizaia_simulador_state",
        JSON.stringify({
          correo,
          movil,
          nombre,
          apellido,
          telegramId,
          doctorCorreo,
          canalRespuesta,
          motivoPaciente,
        })
      );
    } catch {}
  }, [correo, movil, nombre, apellido, telegramId, doctorCorreo, canalRespuesta, motivoPaciente]);

  // Sync modality with prop
  useEffect(() => {
    if (initialModality) {
      setServicioCodigo(initialModality);
    }
  }, [initialModality]);

  // Load available doctors on mount or open
  useEffect(() => {
    if (!open) return;
    setLoadingDoctores(true);
    fetch(`${apiUrl}/api/widget/analizaia/doctores`)
      .then((r) => r.json())
      .then((data) => {
        setLoadingDoctores(false);
        if (Array.isArray(data) && data.length > 0) {
          setDoctores(data);
          if (initialDoctor) {
            setDoctorCorreo(initialDoctor);
          } else if (!doctorCorreo) {
            setDoctorCorreo(data[0].email);
          }
        } else {
          if (initialDoctor) {
            setDoctorCorreo(initialDoctor);
          } else if (!doctorCorreo) {
            setDoctorCorreo("doctor@demo.com");
          }
        }
      })
      .catch(() => {
        setLoadingDoctores(false);
        if (initialDoctor) {
          setDoctorCorreo(initialDoctor);
        } else if (!doctorCorreo) {
          setDoctorCorreo("doctor@demo.com");
        }
      });
  }, [open, apiUrl, initialDoctor]);

  // Center crop box whenever image loads
  const handleImageLoaded = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = Math.min(380, rect.width * 0.75);
    const h = Math.min(280, rect.height * 0.65);
    setCropBox({
      x: (rect.width - w) / 2,
      y: (rect.height - h) / 2,
      width: w,
      height: h,
    });
    setZoom(1);
    setRotation(0);
  }, []);

  // Stop camera when unmounting or changing tab
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Attach camera stream to video element whenever camera becomes active
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch((err) => console.warn("Video play error:", err));
    }
  }, [isCameraActive]);

  // Camera Management
  async function startCamera(mode = facingMode) {
    stopCameraStream();
    setErrorMessage("");
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: mode,
          },
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
      setTabSource("camera");

      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err) {
      console.error("Camera access error:", err);
      setErrorMessage("No se pudo iniciar la cámara. Por favor autoriza el permiso en el navegador o usa 'Archivo'.");
      setIsCameraActive(false);
    }
  }

  function toggleCameraFacing() {
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    startCamera(nextMode);
  }

  function capturePhoto() {
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
    stopCameraStream();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      stopCameraStream();
      setTabSource("file");
    };
    reader.readAsDataURL(file);
  }

  // Pointer interactions for Crop Box
  const handlePointerDown = (type: string, e: React.PointerEvent) => {
    e.stopPropagation();
    isDraggingRef.current = type;
    startDragRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      box: { ...cropBox },
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const dx = e.clientX - startDragRef.current.mouseX;
    const dy = e.clientY - startDragRef.current.mouseY;
    const containerRect = containerRef.current.getBoundingClientRect();

    if (isDraggingRef.current === "box") {
      const newX = Math.max(0, Math.min(containerRect.width - cropBox.width, startDragRef.current.box.x + dx));
      const newY = Math.max(0, Math.min(containerRect.height - cropBox.height, startDragRef.current.box.y + dy));
      setCropBox((prev) => ({ ...prev, x: newX, y: newY }));
      return;
    }

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

  // Perform Image Crop and Call Backend AnalizaIA
  async function handleAnalyzeIA() {
    if (!imageRef.current || !containerRef.current) {
      setErrorMessage("Por favor carga o captura una imagen primero.");
      return;
    }

    setAnalyzing(true);
    setErrorMessage("");

    try {
      const img = imageRef.current;
      const containerRect = containerRef.current.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();

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

      if (!ctx) throw new Error("No se pudo inicializar el procesador de recorte");

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

      const croppedBase64 = canvas.toDataURL("image/jpeg", 0.94);

      // Call public endpoint
      const res = await fetch(`${apiUrl}/api/widget/analizaia/analizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servicio: servicioCodigo,
          imagenBase64: croppedBase64,
          imagenContentType: "image/jpeg",
          contexto: motivoPaciente || undefined,
          patientName: `${nombre} ${apellido}`.trim(),
          phone: movil,
        }),
      });

      const data = await res.json();
      setAnalyzing(false);

      if (data.ok && (data.diagnostico || data.analysisText)) {
        setDiagnosticoIA(data.diagnostico || data.analysisText);
        setDiagnosticoMeta(data);
      } else {
        setErrorMessage(data.msg || "Error al procesar el diagnóstico en el servicio de IA.");
      }
    } catch (err) {
      setAnalyzing(false);
      setErrorMessage(`Error de conexión con el motor de IA: ${(err as Error).message}`);
    }
  }

  // Submit Final Petition to Doctor and Register in CRM
  async function handleSubmitPetition(e: React.FormEvent) {
    e.preventDefault();
    if (!consentimiento) {
      setErrorMessage("Debes otorgar tu consentimiento explícito para remitir el informe al doctor.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const activeSpec = MODALITIES.find((s) => s.key === servicioCodigo);
      const selectedDoc = doctores.find((d) => d.email === doctorCorreo);

      const res = await fetch(`${apiUrl}/api/widget/analizaia/enviar-peticion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          apellidos: apellido.trim() || undefined,
          telefono: movil.trim(),
          correo: correo.trim(),
          telegramId: telegramId.trim() || undefined,
          servicioCodigo: servicioCodigo,
          servicioNombre: activeSpec?.label || servicioCodigo,
          doctorCorreo: doctorCorreo.trim(),
          doctorNombre: selectedDoc?.name || undefined,
          canalRespuesta: canalRespuesta,
          motivoPaciente: motivoPaciente.trim() || undefined,
          imagenBase64: imageSrc || undefined,
          imagenContentType: "image/jpeg",
          diagnosticoIA: diagnosticoIA || "Sin diagnóstico previo",
          consentimiento: true,
        }),
      });

      const data = await res.json();
      setSubmitting(false);

      if (data.ok) {
        setPetitionSuccess({
          idPeticion: data.idPeticion || "PET-" + Date.now().toString(36),
          whatsappUrl: data.whatsappUrl,
          correoEnviado: data.correoEnviado ?? true,
        });
        setStep(5);
      } else {
        setErrorMessage(data.message || data.msg || "No se pudo registrar la petición.");
      }
    } catch (err) {
      setSubmitting(false);
      setErrorMessage(`Error al enviar la petición: ${(err as Error).message}`);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 font-sans text-neutral-900 animate-in fade-in duration-150">
      <div
        className={cn(
          "relative flex flex-col bg-white shadow-2xl overflow-hidden transition-all duration-300 border border-neutral-200",
          isFullscreen
            ? "w-[100vw] h-[100dvh] max-w-none max-h-none rounded-none"
            : "w-full sm:max-w-4xl h-[100dvh] sm:h-[92vh] sm:max-h-[840px] rounded-none sm:rounded-2xl"
        )}
      >
        {/* ─── Modal Header ─── */}
        <div className="flex items-center justify-between border-b border-neutral-200 bg-[#FAF9F6] px-4 sm:px-5 py-3 select-none">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-[#800020] text-white shadow-sm font-bold text-sm shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#800020] leading-tight">
                Simulador Clínico IA
              </h2>
              <p className="text-[11px] sm:text-xs text-neutral-500 line-clamp-1">
                Orientación diagnóstica con IA
              </p>
            </div>
          </div>

          {/* Stepper for Desktop */}
          <div className="hidden sm:flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl text-xs font-semibold">
            <span
              className={cn(
                "px-2.5 py-1 rounded-lg transition",
                step === 1 ? "bg-[#800020] text-white shadow-xs" : "text-neutral-500"
              )}
            >
              1. Contacto
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
            <span
              className={cn(
                "px-2.5 py-1 rounded-lg transition",
                step === 2 ? "bg-[#800020] text-white shadow-xs" : "text-neutral-500"
              )}
            >
              2. Especialidad
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
            <span
              className={cn(
                "px-2.5 py-1 rounded-lg transition",
                step === 3 ? "bg-[#800020] text-white shadow-xs" : "text-neutral-500"
              )}
            >
              3. Foto e IA
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
            <span
              className={cn(
                "px-2.5 py-1 rounded-lg transition",
                step >= 4 ? "bg-[#800020] text-white shadow-xs" : "text-neutral-500"
              )}
            >
              4. Envío
            </span>
          </div>

          {/* Stepper for Mobile */}
          <div className="flex sm:hidden items-center">
            <span className="text-[11px] font-bold text-[#800020] bg-[#800020]/10 px-2.5 py-0.5 rounded-full">
              Paso {step}/4
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 rounded-lg transition"
              title={isFullscreen ? "Restaurar ventana" : "Pantalla completa"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-200/60 rounded-lg transition"
              title="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ─── Modal Body (Step Wizard) ─── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#FAFAFA]">
          {errorMessage && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 animate-in fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              PASO 1: TUS DATOS DE CONTACTO (SCREENSHOT 1)
             ══════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
              <div className="rounded-2xl bg-white p-6 border border-neutral-200 shadow-xs space-y-5">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-800 border-b border-neutral-100 pb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-extrabold">
                    1
                  </span>
                  <span>Tus datos de contacto</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="simulador_correo" className="block text-xs font-semibold text-neutral-700 mb-1">
                      Correo *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                      <input
                        id="simulador_correo"
                        name="email"
                        autoComplete="email"
                        type="email"
                        required
                        value={correo}
                        onChange={(e) => setCorreo(e.target.value)}
                        placeholder="tu-correo@ejemplo.com"
                        className="w-full rounded-xl border border-neutral-300 bg-neutral-50/50 pl-9 pr-3 py-2 text-xs text-neutral-800 focus:bg-white focus:border-[#800020] focus:ring-1 focus:ring-[#800020] outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="simulador_movil" className="block text-xs font-semibold text-neutral-700 mb-1">
                      Móvil (WhatsApp) *
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                      <input
                        id="simulador_movil"
                        name="tel"
                        autoComplete="tel"
                        type="tel"
                        required
                        value={movil}
                        onChange={(e) => setMovil(e.target.value)}
                        placeholder="+34 600 000 000"
                        className="w-full rounded-xl border border-neutral-300 bg-neutral-50/50 pl-9 pr-3 py-2 text-xs text-neutral-800 focus:bg-white focus:border-[#800020] focus:ring-1 focus:ring-[#800020] outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="simulador_nombre" className="block text-xs font-semibold text-neutral-700 mb-1">
                      Nombre
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                      <input
                        id="simulador_nombre"
                        name="given-name"
                        autoComplete="given-name"
                        type="text"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Tu nombre"
                        className="w-full rounded-xl border border-neutral-300 bg-neutral-50/50 pl-9 pr-3 py-2 text-xs text-neutral-800 focus:bg-white focus:border-[#800020] focus:ring-1 focus:ring-[#800020] outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="simulador_apellido" className="block text-xs font-semibold text-neutral-700 mb-1">
                      Apellido
                    </label>
                    <input
                      id="simulador_apellido"
                      name="family-name"
                      autoComplete="family-name"
                      type="text"
                      value={apellido}
                      onChange={(e) => setApellido(e.target.value)}
                      placeholder="Tus apellidos"
                      className="w-full rounded-xl border border-neutral-300 bg-neutral-50/50 px-3 py-2 text-xs text-neutral-800 focus:bg-white focus:border-[#800020] focus:ring-1 focus:ring-[#800020] outline-none transition"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="simulador_telegram" className="block text-xs font-semibold text-neutral-700 mb-1">
                      Telegram ID <span className="text-neutral-400 font-normal">(opcional, solo si ya usas nuestro bot)</span>
                    </label>
                    <input
                      id="simulador_telegram"
                      name="username"
                      autoComplete="username"
                      type="text"
                      value={telegramId}
                      onChange={(e) => setTelegramId(e.target.value)}
                      placeholder="@usuario o ID de Telegram"
                      className="w-full rounded-xl border border-neutral-300 bg-neutral-50/50 px-3 py-2 text-xs text-neutral-800 focus:bg-white focus:border-[#800020] focus:ring-1 focus:ring-[#800020] outline-none transition"
                    />
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!correo.trim() || !movil.trim()}
                    onClick={() => {
                      setErrorMessage("");
                      setStep(2);
                    }}
                    className="bg-[#0B4A72] hover:bg-[#0B4A72]/90 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-sm inline-flex items-center gap-1.5"
                  >
                    <span>Continuar</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              PASO 2: TIPO DE ANÁLISIS Y DOCTOR (SCREENSHOT 2)
             ══════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
              <div className="rounded-2xl bg-white p-6 border border-neutral-200 shadow-xs space-y-5">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-800 border-b border-neutral-100 pb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-extrabold">
                    2
                  </span>
                  <span>Tipo de análisis y doctor</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Tipo de análisis / Especialidad
                    </label>
                    {isModalityLocked ? (
                      <div className="rounded-xl border border-sky-300 bg-sky-50/80 p-2.5 flex items-center justify-between shadow-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">
                            {MODALITIES.find((m) => m.key === servicioCodigo)?.icon}
                          </span>
                          <div>
                            <span className="text-xs font-bold text-sky-950 block">
                              {MODALITIES.find((m) => m.key === servicioCodigo)?.label}
                            </span>
                            <span className="text-[10px] text-sky-700 font-medium">
                              Especialidad fija para esta clínica / enlace
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsModalityLocked(false)}
                          className="text-[11px] font-semibold text-sky-800 underline hover:text-sky-950 px-1"
                        >
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <select
                        value={servicioCodigo}
                        onChange={(e) => setServicioCodigo(e.target.value as ModalityType)}
                        className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-xs text-neutral-800 focus:bg-white focus:border-[#800020] outline-none font-medium transition cursor-pointer"
                      >
                        {MODALITIES.map((mod) => (
                          <option key={mod.key} value={mod.key}>
                            {mod.icon} {mod.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-[11px] text-neutral-500 mt-1">
                      {MODALITIES.find((m) => m.key === servicioCodigo)?.desc}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Doctor / Responsable que revisará tu caso
                    </label>
                    <select
                      value={doctorCorreo}
                      onChange={(e) => setDoctorCorreo(e.target.value)}
                      className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-xs text-neutral-800 focus:bg-white focus:border-[#800020] outline-none font-medium transition cursor-pointer"
                    >
                      {doctores.map((doc) => (
                        <option key={doc.id} value={doc.email}>
                          {doc.name} ({doc.email})
                        </option>
                      ))}
                      {!doctores.some((d) => d.email === doctorCorreo) && doctorCorreo && (
                        <option value={doctorCorreo}>
                          {doctorCorreo} (Asignado vía enlace)
                        </option>
                      )}
                    </select>
                    <input
                      type="email"
                      value={doctorCorreo}
                      onChange={(e) => setDoctorCorreo(e.target.value)}
                      placeholder="o escribe otro correo: doctor@clinica.local"
                      className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 focus:border-[#800020] outline-none transition font-mono"
                    />
                    <p className="text-[11px] text-neutral-500 mt-1 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-600" />
                      El informe y la imagen se remitirán de forma privada a este doctor.
                    </p>
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Volver
                  </button>

                  <Button
                    type="button"
                    variant="primary"
                    disabled={!doctorCorreo.trim()}
                    onClick={() => {
                      setErrorMessage("");
                      setStep(3);
                      if (!imageSrc) {
                        startCamera();
                      }
                    }}
                    className="bg-[#0B4A72] hover:bg-[#0B4A72]/90 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-sm inline-flex items-center gap-1.5"
                  >
                    <span>Continuar</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              PASO 3: FOTO Y ANÁLISIS — CÁMARA MAXIMIZABLE (SCREENSHOT 3 & 4)
             ══════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div className="max-w-5xl mx-auto space-y-4 animate-in fade-in duration-200">
              <div className="rounded-2xl bg-white p-4 sm:p-5 border border-neutral-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-neutral-800">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-extrabold">
                      3
                    </span>
                    <span>Foto y análisis</span>
                    <span className="text-xs font-normal text-neutral-500">
                      ({MODALITIES.find((m) => m.key === servicioCodigo)?.label})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1.5"
                  >
                    {isFullscreen ? (
                      <>
                        <Minimize2 className="h-3.5 w-3.5" /> Reducir visor
                      </>
                    ) : (
                      <>
                        <Maximize2 className="h-3.5 w-3.5" /> Pantalla completa / Maximizar cámara
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* Left Column: Controles de Captura & Motivo */}
                  <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      {/* Tabs [Cámara] [Archivo] */}
                      <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">
                        <button
                          type="button"
                          onClick={() => {
                            setTabSource("camera");
                            startCamera();
                          }}
                          className={cn(
                            "py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5",
                            tabSource === "camera"
                              ? "bg-sky-600 text-white shadow-xs"
                              : "text-neutral-600 hover:text-neutral-900"
                          )}
                        >
                          <Camera className="h-4 w-4" />
                          Cámara
                        </button>

                        <label
                          className={cn(
                            "py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer text-center",
                            tabSource === "file"
                              ? "bg-sky-600 text-white shadow-xs"
                              : "text-neutral-600 hover:text-neutral-900"
                          )}
                        >
                          <Upload className="h-4 w-4" />
                          Archivo
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*,.pdf"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>

                      {/* Camera Control Buttons */}
                      {tabSource === "camera" && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => startCamera()}
                            className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
                          >
                            <Camera className="h-4 w-4" />
                            Abrir cámara
                          </button>

                          <button
                            type="button"
                            onClick={toggleCameraFacing}
                            className="py-2 px-3 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 text-xs font-semibold transition flex items-center justify-center gap-1"
                            title="Alternar entre cámara frontal y trasera"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Voltear
                          </button>

                          <button
                            type="button"
                            disabled={!isCameraActive}
                            onClick={capturePhoto}
                            className="py-2 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5"
                          >
                            <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                            Capturar
                          </button>
                        </div>
                      )}

                      {/* Motivo Paciente */}
                      <div className="pt-1">
                        <label className="block text-xs font-semibold text-neutral-700 mb-1">
                          Motivo / descripción (opcional)
                        </label>
                        <textarea
                          rows={3}
                          value={motivoPaciente}
                          onChange={(e) => setMotivoPaciente(e.target.value)}
                          placeholder="Ej: me duele esta zona desde hace 3 días..."
                          className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-800 focus:bg-white focus:border-[#800020] outline-none transition resize-none"
                        />
                      </div>
                    </div>

                    {/* Botón Principal "Analizar con IA" */}
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="primary"
                        disabled={analyzing || !imageSrc}
                        onClick={handleAnalyzeIA}
                        className={cn(
                          "w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2",
                          analyzing
                            ? "bg-emerald-800 text-white animate-pulse"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-800/20"
                        )}
                      >
                        {analyzing ? (
                          <>
                            <Sparkles className="h-4 w-4 animate-spin" />
                            <span>Analizando en DGX...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 text-amber-300" />
                            <span>Analizar con IA</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Right Column: Visor de Cámara & Área de Recorte */}
                  <div className="lg:col-span-7 flex flex-col space-y-3">
                    <div
                      ref={containerRef}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      className={cn(
                        "relative bg-black rounded-2xl overflow-hidden flex items-center justify-center select-none touch-none border border-neutral-800",
                        isFullscreen ? "h-[62vh]" : "h-[380px]"
                      )}
                    >
                      {isCameraActive ? (
                        <div className="relative w-full h-full flex items-center justify-center">
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            onLoadedMetadata={() => {
                              videoRef.current?.play().catch(() => {});
                            }}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={capturePhoto}
                            className="absolute bottom-4 py-2 px-5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-lg transition transform hover:scale-105 flex items-center gap-1.5"
                          >
                            <Camera className="h-4 w-4" />
                            Tomar Foto
                          </button>
                        </div>
                      ) : imageSrc ? (
                        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                          {/* Image preview with Zoom and Rotate */}
                          <img
                            ref={imageRef}
                            src={imageSrc}
                            alt="Imagen para recortar"
                            onLoad={handleImageLoaded}
                            draggable={false}
                            style={{
                              transform: `scale(${zoom}) rotate(${rotation}deg)`,
                              transformOrigin: "center center",
                              maxHeight: "92%",
                              maxWidth: "92%",
                              objectFit: "contain",
                            }}
                            className="transition-transform duration-75 select-none pointer-events-none rounded shadow-md"
                          />

                          {/* Darkened mask around crop box */}
                          <div
                            className="absolute inset-0 bg-black/45 pointer-events-none"
                            style={{
                              clipPath: `polygon(0% 0%, 0% 100%, ${cropBox.x}px 100%, ${cropBox.x}px ${cropBox.y}px, ${cropBox.x + cropBox.width}px ${cropBox.y}px, ${cropBox.x + cropBox.width}px ${cropBox.y + cropBox.height}px, ${cropBox.x}px ${cropBox.y + cropBox.height}px, ${cropBox.x}px 100%, 100% 100%, 100% 0%)`,
                            }}
                          />

                          {/* Crop Box with grid of thirds */}
                          <div
                            style={{
                              left: `${cropBox.x}px`,
                              top: `${cropBox.y}px`,
                              width: `${cropBox.width}px`,
                              height: `${cropBox.height}px`,
                            }}
                            onPointerDown={(e) => handlePointerDown("box", e)}
                            className="absolute border-2 border-sky-400 bg-sky-400/10 cursor-move shadow-2xl z-20 group"
                          >
                            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                              <div className="border-r border-b border-white/60" />
                              <div className="border-r border-b border-white/60" />
                              <div className="border-b border-white/60" />
                              <div className="border-r border-b border-white/60" />
                              <div className="border-r border-b border-white/60" />
                              <div className="border-b border-white/60" />
                              <div className="border-r border-b border-white/60" />
                              <div className="border-r border-b border-white/60" />
                              <div />
                            </div>

                            {/* Center Target */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-60">
                              <div className="h-2 w-2 rounded-full bg-sky-300" />
                            </div>

                            {/* Handles with enlarged touch targets */}
                            <div
                              onPointerDown={(e) => handlePointerDown("tl", e)}
                              className="absolute -top-3 -left-3 p-1.5 cursor-nwse-resize touch-none z-30"
                            >
                              <div className="h-4 w-4 rounded-xs bg-sky-400 border-2 border-white shadow-sm" />
                            </div>
                            <div
                              onPointerDown={(e) => handlePointerDown("tr", e)}
                              className="absolute -top-3 -right-3 p-1.5 cursor-nesw-resize touch-none z-30"
                            >
                              <div className="h-4 w-4 rounded-xs bg-sky-400 border-2 border-white shadow-sm" />
                            </div>
                            <div
                              onPointerDown={(e) => handlePointerDown("bl", e)}
                              className="absolute -bottom-3 -left-3 p-1.5 cursor-nesw-resize touch-none z-30"
                            >
                              <div className="h-4 w-4 rounded-xs bg-sky-400 border-2 border-white shadow-sm" />
                            </div>
                            <div
                              onPointerDown={(e) => handlePointerDown("br", e)}
                              className="absolute -bottom-3 -right-3 p-1.5 cursor-nwse-resize touch-none z-30"
                            >
                              <div className="h-4 w-4 rounded-xs bg-sky-400 border-2 border-white shadow-sm" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center p-6 text-neutral-400 space-y-3">
                          <Camera className="h-10 w-10 mx-auto text-neutral-600" />
                          <p className="text-xs">
                            Abre tu cámara web o sube un archivo para encuadrar la zona clínica
                          </p>
                          <button
                            type="button"
                            onClick={() => startCamera()}
                            className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition"
                          >
                            Abrir cámara
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Toolbar under Canvas */}
                    <div className="flex items-center justify-between text-xs text-neutral-600 px-1 gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRotation((r) => (r + 90) % 360)}
                          className="px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 font-semibold transition flex items-center gap-1"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Rotar
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(1)))}
                          className="px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 font-semibold transition flex items-center gap-1"
                        >
                          <ZoomIn className="h-3.5 w-3.5" /> Zoom +
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}
                          className="px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 font-semibold transition flex items-center gap-1"
                        >
                          <ZoomOut className="h-3.5 w-3.5" /> Zoom -
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleImageLoaded}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-black text-white font-bold transition flex items-center gap-1.5"
                      >
                        <Crop className="h-3.5 w-3.5" /> Confirmar recorte
                      </button>
                    </div>
                  </div>
                </div>

                {/* ─── TARJETA RESULTADO: DIAGNÓSTICO PRELIMINAR IA (SCREENSHOT 5) ─── */}
                {diagnosticoIA && (
                  <div className="mt-4 rounded-2xl bg-emerald-50/70 border border-emerald-300 p-4 sm:p-5 space-y-3 animate-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                      <Sparkles className="h-4 w-4 text-emerald-600" />
                      <span>Diagnóstico preliminar IA</span>
                    </div>

                    <div className="bg-white rounded-xl p-4 border border-emerald-200 text-xs text-neutral-800 leading-relaxed whitespace-pre-line shadow-xs">
                      {diagnosticoIA}
                    </div>

                    <p className="text-[11px] text-emerald-800 italic">
                      ℹ️ Orientación automática emitida por el modelo clínico de IA. La valoración definitiva corresponde al médico especialista.
                    </p>
                  </div>
                )}

                {/* Step 3 Navigation Buttons */}
                <div className="pt-3 flex items-center justify-between border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Volver
                  </button>

                  <Button
                    type="button"
                    variant="primary"
                    disabled={!diagnosticoIA && !imageSrc}
                    onClick={() => {
                      setErrorMessage("");
                      setStep(4);
                    }}
                    className="bg-[#0B4A72] hover:bg-[#0B4A72]/90 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-sm inline-flex items-center gap-1.5"
                  >
                    <span>Continuar</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              PASO 4: ENVÍO AL DOCTOR & CONSENTIMIENTO RGPD
             ══════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
              <form onSubmit={handleSubmitPetition} className="rounded-2xl bg-white p-6 border border-neutral-200 shadow-xs space-y-5">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-800 border-b border-neutral-100 pb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-extrabold">
                    4
                  </span>
                  <span>Canal de respuesta y consentimiento</span>
                </div>

                {/* Summary Card */}
                <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-200 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Paciente:</span>
                    <span className="font-bold text-neutral-800">{nombre} {apellido}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Servicio / Especialidad:</span>
                    <span className="font-bold text-[#800020]">{MODALITIES.find((m) => m.key === servicioCodigo)?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Doctor asignado:</span>
                    <span className="font-mono text-neutral-700">{doctorCorreo}</span>
                  </div>
                </div>

                {/* Canal de Respuesta Selector */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-2">
                    ¿Por qué canal prefieres que el doctor te responda? *
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setCanalRespuesta("whatsapp")}
                      className={cn(
                        "p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition",
                        canalRespuesta === "whatsapp"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20"
                          : "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700"
                      )}
                    >
                      <Phone className="h-4 w-4 text-emerald-600" />
                      <span>WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCanalRespuesta("email")}
                      className={cn(
                        "p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition",
                        canalRespuesta === "email"
                          ? "border-sky-600 bg-sky-50 text-sky-800 ring-2 ring-sky-500/20"
                          : "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700"
                      )}
                    >
                      <Mail className="h-4 w-4 text-sky-600" />
                      <span>Email</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCanalRespuesta("telegram")}
                      className={cn(
                        "p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition",
                        canalRespuesta === "telegram"
                          ? "border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20"
                          : "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700"
                      )}
                    >
                      <Send className="h-4 w-4 text-blue-500" />
                      <span>Telegram</span>
                    </button>
                  </div>
                </div>

                {/* Consent Checkbox */}
                <div className="pt-2">
                  <label className="flex items-start gap-3 p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-neutral-100/70 transition">
                    <input
                      type="checkbox"
                      checked={consentimiento}
                      onChange={(e) => setConsentimiento(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                    />
                    <span className="text-xs text-neutral-700 leading-snug">
                      Otorgo mi consentimiento explícito para remitir estos datos de contacto, la fotografía clínica y el diagnóstico preliminar al doctor para que pueda valorar mi caso y contactarme.
                    </span>
                  </label>
                </div>

                {/* Submit Buttons */}
                <div className="pt-3 flex items-center justify-between border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Volver
                  </button>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submitting || !consentimiento}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md inline-flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Sparkles className="h-4 w-4 animate-spin" />
                        <span>Enviando al doctor...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>Enviar Petición al Doctor</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              PASO 5: CONFIRMACIÓN Y ÉXITO
             ══════════════════════════════════════════════════════════ */}
          {step === 5 && petitionSuccess && (
            <div className="max-w-xl mx-auto py-6 space-y-6 text-center animate-in zoom-in-95 duration-200">
              <div className="rounded-2xl bg-white p-8 border border-neutral-200 shadow-lg space-y-5">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-9 w-9" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-neutral-900">
                    ¡Petición enviada con éxito!
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Referencia de seguimiento:{" "}
                    <strong className="text-neutral-800 font-mono">
                      #{petitionSuccess.idPeticion}
                    </strong>
                  </p>
                </div>

                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900 leading-relaxed text-left space-y-2">
                  <p>
                    ✅ <strong>Doctor notificado por correo electrónico</strong> con el diagnóstico preliminar y la imagen adjunta.
                  </p>
                  <p>
                    ✅ <strong>Contacto registrado en el CRM</strong> para dar seguimiento inmediato a tu cita.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  {petitionSuccess.whatsappUrl && (
                    <a
                      href={petitionSuccess.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2"
                    >
                      <Phone className="h-4 w-4" />
                      Continuar por WhatsApp
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-semibold text-xs transition"
                  >
                    Cerrar simulador
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
