"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";

const SENSITIVE_PASSWORD =
  process.env.NEXT_PUBLIC_SENSITIVE_ACCESS_PASSWORD || "W39xlpS9";
const STORAGE_KEY = "crm_sensitive_access_unlocked";

interface SensitiveAccessContextType {
  isUnlocked: boolean;
  requestAccess: (onSuccess?: () => void) => void;
  unlockWithPassword: (password: string) => boolean;
  lock: () => void;
}

const SensitiveAccessContext = createContext<SensitiveAccessContextType>({
  isUnlocked: false,
  requestAccess: () => {},
  unlockWithPassword: () => false,
  lock: () => {},
});

export function SensitiveAccessProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const pendingCallbackRef = useRef<(() => void) | null>(null);

  // Check sessionStorage on mount (client-side only)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored === "true") {
        setIsUnlocked(true);
      }
    } catch {
      // ignore in environments without sessionStorage
    }
  }, []);

  const unlockWithPassword = useCallback((inputPassword: string) => {
    if (inputPassword === SENSITIVE_PASSWORD) {
      try {
        sessionStorage.setItem(STORAGE_KEY, "true");
      } catch {}
      setIsUnlocked(true);
      return true;
    }
    return false;
  }, []);

  const requestAccess = useCallback(
    (onSuccess?: () => void) => {
      if (isUnlocked) {
        onSuccess?.();
        return;
      }
      pendingCallbackRef.current = onSuccess ?? null;
      setPassword("");
      setError("");
      setShowPassword(false);
      setModalOpen(true);
    },
    [isUnlocked]
  );

  const lock = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
    setIsUnlocked(false);
  }, []);

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockWithPassword(password)) {
      setModalOpen(false);
      const cb = pendingCallbackRef.current;
      pendingCallbackRef.current = null;
      if (cb) cb();
    } else {
      setError("Contraseña incorrecta. Por favor inténtalo de nuevo.");
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    pendingCallbackRef.current = null;
    setPassword("");
    setError("");
  };

  return (
    <SensitiveAccessContext.Provider
      value={{ isUnlocked, requestAccess, unlockWithPassword, lock }}
    >
      {children}

      {/* Global verification modal triggered by requestAccess */}
      <Modal
        open={modalOpen}
        onClose={handleCloseModal}
        title="Acceso Protegido"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="text-xs">
              <p className="font-semibold text-amber-900">
                Información confidencial y sensible
              </p>
              <p className="mt-0.5">
                Para acceder a esta sección (Ajustes, Agentes o Telefonía / VAPI),
                introduce la contraseña de seguridad adicional.
              </p>
            </div>
          </div>

          <form onSubmit={handleModalSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Contraseña adicional
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoFocus
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="Introduce la contraseña"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {error && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCloseModal}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Acceder
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </SensitiveAccessContext.Provider>
  );
}

export function useSensitiveAccess() {
  return useContext(SensitiveAccessContext);
}

/**
 * Inline gate component to protect full page contents or specific tabs/panels
 */
export function SensitiveAccessGate({
  children,
  title = "Área Protegida",
  description = "Esta sección contiene credenciales, claves de API y configuraciones confidenciales del sistema. Se requiere la contraseña de seguridad adicional para acceder.",
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { isUnlocked, unlockWithPassword } = useSensitiveAccess();
  const [mounted, setMounted] = useState(false);
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-sm text-neutral-400">Verificando acceso…</div>
      </div>
    );
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockWithPassword(pw)) {
      setError("");
    } else {
      setError("Contraseña incorrecta. Por favor inténtalo de nuevo.");
    }
  };

  return (
    <div className="flex min-h-[450px] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 mb-4 border border-amber-100">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
        <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed">
          {description}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Contraseña de seguridad adicional
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoFocus
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Introduce la contraseña"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600"
              >
                {showPw ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {error && (
              <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/")}
              className="flex-1 flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" /> Volver al Inicio
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Desbloquear
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
