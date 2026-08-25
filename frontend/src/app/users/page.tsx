"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Mail, ShieldAlert, Check, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { User, UserRole } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { PASSWORD_RULES, isPasswordStrong } from "@/lib/password";

const selectClass =
  "block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

function emptyForm(): UserFormData {
  return { name: "", email: "", password: "", role: "employee", isActive: true };
}

function UserModal({
  open,
  onClose,
  initial,
  isSelf,
  currentUserRole,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: User;
  isSelf: boolean;
  currentUserRole?: UserRole;
  onSave: (data: UserFormData) => Promise<void>;
}) {
  const isEdit = !!initial;
  const isServiceManager = currentUserRole === "service_manager";
  const [form, setForm] = useState<UserFormData>(
    initial
      ? {
          name: initial.name,
          email: initial.email,
          password: "",
          role: initial.role,
          isActive: initial.isActive,
        }
      : emptyForm()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // On create, a password is required. On edit, it's optional (blank = keep the
  // current one), but if typed it must still meet the policy.
  const passwordRequired = !isEdit;
  const passwordTouched = form.password.length > 0;
  const showPasswordRules = passwordRequired || passwordTouched;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError("El nombre y el correo son obligatorios.");
      return;
    }
    if ((passwordRequired || passwordTouched) && !isPasswordStrong(form.password)) {
      setError("La contraseña no cumple los requisitos de seguridad.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        ...form,
        // If actor is service_manager and creating or editing another user, force role to employee
        role: isServiceManager ? (isSelf ? form.role : "employee") : form.role,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo guardar el usuario. Inténtalo de nuevo."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? (isSelf ? "Editar mi perfil" : "Editar usuario") : "Nuevo usuario"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Nombre <span className="text-red-500">*</span>
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Laura Pérez"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Correo electrónico <span className="text-red-500">*</span>
          </label>
          <Input
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="laura@ejemplo.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Contraseña{" "}
            {isEdit ? (
              <span className="text-neutral-400">
                (dejar en blanco para no cambiarla)
              </span>
            ) : (
              <span className="text-red-500">*</span>
            )}
          </label>
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) =>
              setForm((f) => ({ ...f, password: e.target.value }))
            }
            placeholder={isEdit ? "••••••••" : "Contraseña segura"}
          />
          {showPasswordRules && (
            <ul className="mt-2 space-y-1">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(form.password);
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
          {((isEdit && !isSelf && passwordTouched) || !isEdit) && (
            <p className="mt-2 text-xs text-amber-600">
              {isEdit
                ? "Al guardar, este usuario deberá establecer una contraseña nueva en su próximo inicio de sesión."
                : "Esta contraseña es temporal: el usuario deberá cambiarla en su primer inicio de sesión."}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Rol
          </label>
          {isServiceManager ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              {isSelf
                ? "Responsable de Citas (tu rol)"
                : "Empleado (rol estándar permitido)"}
            </div>
          ) : (
            <select
              className={selectClass}
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as UserRole }))
              }
            >
              <option value="employee">Empleado (sin gestión de usuarios)</option>
              <option value="service_manager">Responsable de Citas / Doctor</option>
              <option value="admin">Administrador (acceso total)</option>
            </select>
          )}
        </div>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
              checked={form.isActive}
              onChange={(e) =>
                setForm((f) => ({ ...f, isActive: e.target.checked }))
              }
            />
            Cuenta activa (puede iniciar sesión)
          </label>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<User | undefined>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadUsers = useCallback(async (): Promise<User[] | null> => {
    try {
      return await apiFetch<User[]>("/api/users");
    } catch {
      return null;
    }
  }, []);

  const refreshUsers = useCallback(async () => {
    const data = await loadUsers();
    if (data) setUsers(data);
  }, [loadUsers]);

  useEffect(() => {
    loadUsers().then((data) => {
      if (data) setUsers(data);
      setLoading(false);
    });
  }, [loadUsers]);

  // Page-level guard: allows admin and service_manager.
  if (
    currentUser &&
    currentUser.role !== "admin" &&
    currentUser.role !== "service_manager"
  ) {
    return (
      <div className="p-8">
        <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
          <div>
            <h1 className="text-sm font-semibold text-neutral-900">
              Acceso restringido
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Solo los administradores y responsables pueden gestionar usuarios.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function handleSave(data: UserFormData) {
    if (editing) {
      const payload: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        role: data.role,
        isActive: data.isActive,
      };
      if (data.password) payload.password = data.password;
      await apiFetch(`/api/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role,
        }),
      });
    }
    await refreshUsers();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      await refreshUsers();
      setDeleteTarget(undefined);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "No se pudo eliminar el usuario."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Usuarios</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {users.length} usuario{users.length !== 1 ? "s" : ""} con acceso al
            sistema
          </p>
        </div>
        {currentUser?.role === "admin" && (
          <Button
            onClick={() => {
              setEditing(undefined);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo usuario
          </Button>
        )}
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            Cargando…
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            Aún no hay usuarios.
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-left text-xs font-medium text-neutral-500">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                const canEdit = currentUser?.role === "admin" || isSelf;
                const canDelete = currentUser?.role === "admin" && !isSelf;

                return (
                  <tr key={u.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {u.name}
                      {isSelf && (
                        <span className="ml-2 text-xs font-normal text-neutral-400">
                          (tú)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-neutral-400" />
                        {u.email}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          u.role === "admin"
                            ? "info"
                            : u.role === "service_manager"
                              ? "warning"
                              : "default"
                        }
                      >
                        {u.role === "admin"
                          ? "Administrador"
                          : u.role === "service_manager"
                            ? "Responsable de Citas"
                            : "Empleado"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.isActive ? "success" : "danger"}>
                        {u.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canEdit}
                          title={
                            !canEdit
                              ? "Solo los administradores pueden modificar a otros usuarios"
                              : isSelf
                                ? "Editar mi perfil"
                                : "Editar usuario"
                          }
                          onClick={() => {
                            if (!canEdit) return;
                            setEditing(u);
                            setModalOpen(true);
                          }}
                        >
                          <Pencil className={canEdit ? "h-3.5 w-3.5" : "h-3.5 w-3.5 text-neutral-300"} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canDelete}
                          title={
                            isSelf
                              ? "No puedes eliminar tu propia cuenta"
                              : !canDelete
                                ? "Solo los administradores pueden eliminar usuarios"
                                : "Eliminar usuario"
                          }
                          onClick={() => {
                            if (!canDelete) return;
                            setDeleteError("");
                            setDeleteTarget(u);
                          }}
                        >
                          <Trash2
                            className={
                              canDelete
                                ? "h-3.5 w-3.5 text-red-400"
                                : "h-3.5 w-3.5 text-neutral-300"
                            }
                          />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <UserModal
        key={modalOpen ? editing?.id ?? "new" : "closed"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editing}
        isSelf={!!editing && editing.id === currentUser?.id}
        currentUserRole={currentUser?.role}
        onSave={handleSave}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(undefined)}
        title="Eliminar usuario"
      >
        <p className="text-sm text-neutral-600">
          ¿Seguro que deseas eliminar a{" "}
          <strong>{deleteTarget?.name}</strong>? Perderá el acceso al sistema.
          Esta acción no se puede deshacer.
        </p>
        {deleteError && <p className="mt-2 text-xs text-red-600">{deleteError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(undefined)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Eliminando…" : "Eliminar"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
