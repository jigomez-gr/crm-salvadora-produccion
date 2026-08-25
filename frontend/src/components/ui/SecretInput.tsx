import { useRef, useState } from "react";
import { Check, Pencil, Eye, EyeOff, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/**
 * A password field for a write-only secret. The API never returns the stored
 * value (only a `has*` boolean), so when one is configured we show a masked
 * "Configurada" state with a "Cambiar" button instead of a blank box — the user
 * can tell at a glance whether a secret is set. Editing reveals an input;
 * leaving it masked sends nothing so the stored secret is kept.
 */
export function SecretInput({
  label,
  hint,
  placeholder,
  hasValue,
  value,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  placeholder?: string;
  hasValue: boolean;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show the masked "already configured" state only while a secret is stored,
  // the user hasn't chosen to replace it, and nothing new has been typed.
  const showConfigured = hasValue && !editing && !value;

  function startEditing() {
    setEditing(true);
    setReveal(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEditing() {
    setEditing(false);
    setReveal(false);
    onChange(null); // leave the stored secret untouched
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-700">
        {label}
      </label>

      {showConfigured ? (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2">
            <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
            <span className="select-none font-mono text-sm tracking-widest text-neutral-400">
              ••••••••••
            </span>
            <span className="ml-auto text-xs font-medium text-green-700">
              Configurada
            </span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={startEditing}
          >
            <Pencil className="h-3.5 w-3.5" /> Cambiar
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            ref={inputRef}
            type={reveal ? "text" : "password"}
            autoComplete="new-password"
            placeholder={hasValue ? "Escribe la nueva clave…" : placeholder}
            value={value ?? ""}
            className="pr-16"
            onChange={(e) => onChange(e.target.value || null)}
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1">
            <button
              type="button"
              aria-label={reveal ? "Ocultar" : "Mostrar"}
              onClick={() => setReveal((r) => !r)}
              className="rounded p-1 text-neutral-400 hover:text-neutral-700"
            >
              {reveal ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
            {hasValue && editing && (
              <button
                type="button"
                aria-label="Cancelar cambio"
                onClick={cancelEditing}
                className="rounded p-1 text-neutral-400 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
