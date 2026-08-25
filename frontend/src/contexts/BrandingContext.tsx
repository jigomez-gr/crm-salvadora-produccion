"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import type { PublicBranding } from "@/lib/types";

const DEFAULT_BRANDING: PublicBranding = {
  businessName: "CRM Academy",
  brandColor: "#4f46e5",
  logoUrl: null,
};

interface BrandingContextValue extends PublicBranding {
  refresh: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | undefined>(
  undefined
);

/**
 * App-wide white-label branding (business name / colour / logo). Fetched from
 * the PUBLIC `/api/settings/branding` endpoint so it renders on the login screen
 * too. Falls back to the defaults if the request fails.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<PublicBranding>(DEFAULT_BRANDING);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<PublicBranding>("/api/settings/branding");
      setBranding({
        businessName: data.businessName || DEFAULT_BRANDING.businessName,
        brandColor: data.brandColor || DEFAULT_BRANDING.brandColor,
        logoUrl: data.logoUrl ?? null,
      });
    } catch {
      // Keep defaults if branding can't be loaded.
    }
  }, []);

  // Inline the initial fetch (setState in a .then callback, not after await) so
  // it doesn't trip the no-setState-in-effect rule. `refresh` is for manual
  // re-fetch from event handlers (e.g. after saving settings).
  useEffect(() => {
    let cancelled = false;
    apiFetch<PublicBranding>("/api/settings/branding")
      .then((data) => {
        if (cancelled) return;
        setBranding({
          businessName: data.businessName || DEFAULT_BRANDING.businessName,
          brandColor: data.brandColor || DEFAULT_BRANDING.brandColor,
          logoUrl: data.logoUrl ?? null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the browser tab title in sync with the business name.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = branding.businessName;
    }
  }, [branding.businessName]);

  return (
    <BrandingContext.Provider value={{ ...branding, refresh }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx)
    throw new Error("useBranding debe usarse dentro de <BrandingProvider>");
  return ctx;
}
