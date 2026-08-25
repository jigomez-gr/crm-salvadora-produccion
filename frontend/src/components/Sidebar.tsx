"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  CalendarDays,
  Sparkles,
  MessageSquare,
  Bot,
  BarChart3,
  ShieldCheck,
  ScrollText,
  Settings,
  LogOut,
  KeyRound,
  Globe,
  PhoneCall,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { readableTextColor } from "@/lib/color";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Modal } from "@/components/ui/Modal";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

const baseNavItems = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/calendar", label: "Citas y Calendario", icon: CalendarDays },
  { href: "/contacts", label: "Contactos", icon: Users },
  { href: "/pipeline", label: "Embudo", icon: KanbanSquare },
  { href: "/services", label: "Servicios", icon: Sparkles },
  { href: "/conversations", label: "Conversaciones", icon: MessageSquare },
  { href: "/calls", label: "Llamadas / Teléfono", icon: PhoneCall },
  { href: "/agents", label: "Agentes", icon: Bot },
  { href: "/reports", label: "Informes", icon: BarChart3 },
  { href: "/demo-landing", label: "Demo Landing", icon: Globe },
];

export function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const toast = useToast();
  const branding = useBranding();
  const [pwModalOpen, setPwModalOpen] = useState(false);

  // The role-specific navigation items
  let navItems = baseNavItems;
  if (user?.role === "admin") {
    navItems = [
      ...baseNavItems,
      { href: "/users", label: "Usuarios", icon: ShieldCheck },
      { href: "/audit", label: "Auditoría", icon: ScrollText },
      { href: "/settings", label: "Ajustes", icon: Settings },
    ];
  } else if (user?.role === "service_manager") {
    navItems = [
      { href: "/", label: "Inicio", icon: LayoutDashboard },
      { href: "/calendar", label: "Mis Citas / Calendario", icon: CalendarDays },
      { href: "/services", label: "Servicios / Calendarios", icon: Sparkles },
      { href: "/contacts", label: "Contactos / Pacientes", icon: Users },
      { href: "/users", label: "Usuarios", icon: ShieldCheck },
    ];
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const initial = (user?.name ?? user?.email ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <aside
      className={cn(
        // Off-canvas drawer on mobile, static column from md up.
        "fixed inset-y-0 left-0 z-40 flex h-screen w-60 flex-col border-r border-neutral-200 bg-white transition-transform duration-200 md:static md:z-auto md:translate-x-0",
        mobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b border-neutral-200 px-5">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg"
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
              className="h-4 w-4"
              style={{ color: readableTextColor(branding.brandColor) }}
            />
          )}
        </div>
        <span className="truncate text-sm font-semibold text-neutral-900">
          {branding.businessName}
        </span>
        {/* Close the drawer on mobile (hidden on md+ where the sidebar is static). */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar menú"
          className="ml-auto rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 md:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-neutral-200 p-3">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-neutral-900">
              {user?.name ?? "—"}
            </p>
            <p className="truncate text-[11px] text-neutral-400">
              {user?.role === "admin"
                ? "Administrador"
                : user?.role === "service_manager"
                  ? "Responsable de Citas"
                  : "Empleado"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setPwModalOpen(true)}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <KeyRound className="h-4 w-4 flex-shrink-0" />
          Cambiar contraseña
        </button>
        <button
          onClick={handleLogout}
          className="mt-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          Cerrar sesión
        </button>
      </div>

      <Modal
        open={pwModalOpen}
        onClose={() => setPwModalOpen(false)}
        title="Cambiar contraseña"
      >
        <ChangePasswordForm
          autoFocus
          onSuccess={() => {
            setPwModalOpen(false);
            toast.success("Contraseña actualizada.");
          }}
        />
      </Modal>
    </aside>
  );
}
