"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

/**
 * Full-screen gate shown while the signed-in user still owes a password change
 * (`mustChangePassword`) — after an admin reset or a first login on the default
 * password. There's no sidebar and no way around it: the backend also blocks
 * every other endpoint (403 PASSWORD_CHANGE_REQUIRED) until they change it.
 * On success `mustChangePassword` clears and AuthGate renders the app.
 */
export function ForcePasswordChange() {
  const { logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500">
            <ShieldAlert className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-neutral-900">
            Cambia tu contraseña
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Por seguridad, debes elegir una contraseña nueva antes de continuar.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <ChangePasswordForm submitLabel="Guardar y continuar" autoFocus />
        </div>

        <button
          onClick={handleLogout}
          className="mt-4 flex w-full items-center justify-center gap-2 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-800"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
