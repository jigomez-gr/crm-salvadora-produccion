"use client";

import { useEffect, useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { AppSettings, VerticalPreset } from "@/lib/types";
import { useBranding } from "@/contexts/BrandingContext";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * First-run setup overlay shown to an admin until onboarding is completed. It
 * collects the business name and a vertical preset (which seeds the default
 * agent's persona / services / hours), or can be skipped. Renders nothing once
 * onboarding is done / dismissed / for non-applicable cases. The app shell sits
 * behind it but is covered until the wizard closes.
 */
export function OnboardingWizard() {
  const branding = useBranding();
  const toast = useToast();
  const [needed, setNeeded] = useState(false);
  const [presets, setPresets] = useState<VerticalPreset[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Decide whether the wizard is needed (setState inside .then, not synchronously).
  useEffect(() => {
    let cancelled = false;
    apiFetch<AppSettings>("/api/settings")
      .then((s) => {
        if (cancelled || s.onboardingCompleted) return;
        setNeeded(true);
        setBusinessName(s.businessName === "CRM Academy" ? "" : s.businessName);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    apiFetch<VerticalPreset[]>("/api/settings/presets")
      .then((p) => {
        if (cancelled) return;
        setPresets(p);
        setSelected(p[0]?.key ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needed]);

  if (!needed) return null;

  async function apply() {
    if (!businessName.trim()) {
      toast.error("Escribe el nombre de tu negocio.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/settings/onboarding", {
        method: "POST",
        body: JSON.stringify({ businessName: businessName.trim(), preset: selected }),
      });
      await branding.refresh();
      setNeeded(false);
      toast.success("¡Todo listo! Tu negocio está configurado.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo completar el onboarding."
      );
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ onboardingCompleted: true }),
      });
      setNeeded(false);
    } catch {
      // Even if it fails, hide the wizard locally so it isn't a hard block.
      setNeeded(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-neutral-900">
              Configura tu CRM
            </h1>
            <p className="text-xs text-neutral-500">
              Un paso rápido para dejarlo listo para tu negocio.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Nombre de tu negocio
          </label>
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Mi Negocio"
            autoFocus
          />
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-neutral-700">
            Tipo de negocio (configura servicios y horario de ejemplo)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => {
              const active = p.key === selected;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSelected(p.key)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  <span>
                    <span className="font-medium">{p.label}</span>
                    <span className="block text-[11px] text-neutral-400">
                      {p.services.length} servicios
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={skip}
            disabled={busy}
            className="text-xs font-medium text-neutral-500 hover:text-neutral-800"
          >
            Omitir por ahora
          </button>
          <Button onClick={apply} disabled={busy || !selected}>
            {busy ? "Configurando…" : "Empezar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
