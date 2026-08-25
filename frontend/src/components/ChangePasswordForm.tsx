"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { PASSWORD_RULES, isPasswordStrong } from "@/lib/password";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Self-service password change form. Owns its state, validates client-side
 * (mirroring the backend policy) and calls `useAuth().changePassword`, which
 * re-issues the session cookie. Reused by the voluntary modal (sidebar) and the
 * forced-change screen (AuthGate). `onSuccess` fires after a successful change.
 */
export function ChangePasswordForm({
  onSuccess,
  submitLabel = "Cambiar contraseña",
  autoFocus = false,
}: {
  onSuccess?: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const showRules = next.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) {
      setError("Introduce tu contraseña actual.");
      return;
    }
    if (!isPasswordStrong(next)) {
      setError("La nueva contraseña no cumple los requisitos de seguridad.");
      return;
    }
    if (next !== confirm) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    if (next === current) {
      setError("La nueva contraseña debe ser distinta de la actual.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      onSuccess?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Demasiados intentos. Espera un minuto e inténtalo de nuevo.");
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "No se pudo cambiar la contraseña. Inténtalo de nuevo.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-700">
          Contraseña actual
        </label>
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="••••••••"
          autoFocus={autoFocus}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-700">
          Nueva contraseña
        </label>
        <Input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Contraseña segura"
        />
        {showRules && (
          <ul className="mt-2 space-y-1">
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(next);
              return (
                <li
                  key={rule.label}
                  className={`flex items-center gap-1.5 text-xs ${
                    ok ? "text-green-600" : "text-neutral-400"
                  }`}
                >
                  {ok ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  {rule.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-700">
          Repetir nueva contraseña
        </label>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
