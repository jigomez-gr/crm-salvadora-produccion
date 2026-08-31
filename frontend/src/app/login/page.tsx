"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api";
import { readableTextColor } from "@/lib/color";
import { FooterLegal } from "@/components/FooterLegal";

export default function LoginPage() {
  const { login } = useAuth();
  const branding = useBranding();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Introduce tu correo y contraseña.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError("Demasiados intentos. Espera un minuto e inténtalo de nuevo.");
        } else {
          setError(err.message || "Credenciales inválidas. Revisa tu correo y contraseña.");
        }
      } else {
        setError("Error de conexión. Revisa tu red o intenta de nuevo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-neutral-50 px-4 py-8 sm:px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            className="mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl shadow-sm"
            style={{ backgroundColor: branding.brandColor }}
          >
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-supplied logo (data:/external URL), not a static asset
              <img
                src={branding.logoUrl}
                alt={branding.businessName}
                className="h-full w-full object-contain"
              />
            ) : (
              <Bot
                className="h-6 w-6"
                style={{ color: readableTextColor(branding.brandColor) }}
              />
            )}
          </div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900">
            {branding.businessName}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Inicia sesión para acceder al panel
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">
              Correo electrónico
            </label>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@crmsalvadora.local"
              className="h-11 text-base sm:text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-700">
              Contraseña
            </label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 text-base sm:text-sm"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600">
              {error}
            </div>
          )}

          <Button type="submit" className="h-11 w-full text-base sm:text-sm font-medium" disabled={submitting}>
            <LogIn className="h-4 w-4" />
            {submitting ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>

      <div className="mt-8 w-full max-w-sm text-center">
        <FooterLegal dark={false} className="bg-transparent border-0" />
      </div>
    </div>
  );
}
