"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** Show a toast. Defaults to the "info" variant. */
  toast: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;
let counter = 0;

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; icon: typeof Info; iconColor: string }
> = {
  success: { border: "border-l-emerald-500", icon: CheckCircle2, iconColor: "text-emerald-600" },
  error: { border: "border-l-red-500", icon: XCircle, iconColor: "text-red-600" },
  info: { border: "border-l-indigo-500", icon: Info, iconColor: "text-indigo-600" },
};

/**
 * App-wide toast notifications. Lets any client component surface success/error
 * feedback (e.g. after an API mutation) instead of silently swallowing it.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = ++counter;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => remove(id), AUTO_DISMISS_MS);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (m: string) => toast(m, "success"),
      error: (m: string) => toast(m, "error"),
      info: (m: string) => toast(m, "info"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
        role="region"
        aria-label="Notificaciones"
      >
        {toasts.map((t) => {
          const { border, icon: Icon, iconColor } = VARIANT_STYLES[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-lg border border-l-4 border-neutral-200 bg-white px-4 py-3 shadow-lg",
                border,
              )}
            >
              <Icon className={cn("mt-0.5 h-5 w-5 flex-shrink-0", iconColor)} />
              <p className="flex-1 text-sm text-neutral-800">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                className="flex-shrink-0 text-neutral-400 transition-colors hover:text-neutral-700"
                aria-label="Cerrar notificación"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast debe usarse dentro de <ToastProvider>");
  }
  return ctx;
}
