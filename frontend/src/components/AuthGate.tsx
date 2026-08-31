"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Sidebar } from "@/components/Sidebar";
import { ForcePasswordChange } from "@/components/ForcePasswordChange";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { FooterLegal } from "@/components/FooterLegal";

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-neutral-400">
      Cargando…
    </div>
  );
}

/**
 * Client-side route guard:
 * - while the session is being restored → loader
 * - unauthenticated on a protected route → redirect to /login
 * - authenticated on /login → redirect to /
 * - authenticated on a protected route → render the app shell (sidebar + page)
 *
 * This is UX, not the security boundary: the API enforces auth on every request.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const branding = useBranding();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const isDemoLanding = pathname === "/demo-landing";
  const isSimuladorIa = pathname?.startsWith("/simulador-ia");
  const isPaymentPage = pathname?.startsWith("/payment-");
  const isPublicPage = isDemoLanding || isSimuladorIa || isPaymentPage;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user && !isLoginPage && !isPublicPage) router.replace("/login");
    if (user && isLoginPage) router.replace("/");
  }, [user, loading, isLoginPage, isPublicPage, router]);

  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  if (loading) return <FullScreenLoader />;

  if (isPublicPage) {
    return <>{children}</>;
  }

  if (isLoginPage) {
    // Authenticated users are being redirected away — avoid flashing the form.
    return user ? <FullScreenLoader /> : <>{children}</>;
  }

  if (!user) return <FullScreenLoader />;

  // A user who still owes a password change can't reach the app — only the
  // forced-change screen (the API blocks every other endpoint anyway).
  if (user.mustChangePassword) return <ForcePasswordChange />;

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Mobile top bar with a hamburger — hidden from md up (static sidebar). */}
      <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={mobileNavOpen}
          className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="truncate text-sm font-semibold text-neutral-900">
          {branding.businessName}
        </span>
      </header>

      <Sidebar
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* Backdrop behind the mobile drawer. */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      )}

      <main className="min-w-0 flex-1 overflow-y-auto flex flex-col justify-between">
        <div className="flex-1">{children}</div>
        <FooterLegal dark={false} className="mt-auto bg-neutral-50/70 border-t border-neutral-200 py-6" />
      </main>
      {/* First-run setup overlay — only renders itself when an admin still
          needs onboarding. */}
      {user.role === "admin" && <OnboardingWizard />}
    </div>
  );
}
