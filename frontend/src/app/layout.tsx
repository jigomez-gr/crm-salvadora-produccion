import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGate } from "@/components/AuthGate";
import { ToastProvider } from "@/contexts/ToastContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { SensitiveAccessProvider } from "@/contexts/SensitiveAccessContext";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#4f46e5",
};

export const metadata: Metadata = {
  title: "CRM Salvadora",
  description: "CRM Salvadora con Agentes de IA",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CRM Salvadora",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
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
              <SensitiveAccessProvider>
                <AuthGate>{children}</AuthGate>
              </SensitiveAccessProvider>
            </AuthProvider>
          </BrandingProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
