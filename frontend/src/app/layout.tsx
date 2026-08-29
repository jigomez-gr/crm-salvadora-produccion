import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGate } from "@/components/AuthGate";
import { ToastProvider } from "@/contexts/ToastContext";
import { BrandingProvider } from "@/contexts/BrandingContext";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CRM Salvadora",
  description: "CRM Salvadora con Agentes de IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // suppressHydrationWarning: browser extensions inject attributes onto <html>
  // and <body> (e.g. data-atm-ext-installed) before React hydrates, which would
  // otherwise trigger a hydration mismatch warning. This only suppresses
  // attribute diffs on these two elements, not on the app's own markup.
  //
  // AuthProvider holds the session; AuthGate decides whether to show the login
  // screen (full-screen, no sidebar) or the authenticated app shell.
  return (
    <html
      lang="es"
      className={`${geist.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full" suppressHydrationWarning>
        <ToastProvider>
          <BrandingProvider>
            <AuthProvider>
              <AuthGate>{children}</AuthGate>
            </AuthProvider>
          </BrandingProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
