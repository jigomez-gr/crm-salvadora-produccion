"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  UsersRound,
  Download,
  Plus,
  Trash2,
  Edit2,
  Search,
  Phone,
  Mail,
  User,
  Calendar,
  RefreshCw,
  ExternalLink,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { ContactGroup, ContactGroupMember, Contact } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/contexts/ToastContext";

export default function ContactGroupsPage() {
  const toast = useToast();

  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [members, setMembers] = useState<ContactGroupMember[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Search & filter
  const [groupFilter, setGroupFilter] = useState("");
  const [memberFilter, setMemberFilter] = useState("");

  // Modals
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [editGroupDesc, setEditGroupDesc] = useState("");

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [savingMember, setSavingMember] = useState(false);

  const [exportingVcf, setExportingVcf] = useState(false);

  // Load groups
  const fetchGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const data = await apiFetch<ContactGroup[]>("/api/contact-groups");
      setGroups(data);
      if (data.length > 0 && !selectedGroup) {
        setSelectedGroup(data[0].grupocontacto);
      }
    } catch (err: any) {
      toast.error(err?.message || "Error al cargar grupos de contactos");
    } finally {
      setLoadingGroups(false);
    }
  }, [selectedGroup, toast]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Load members for selected group
  const fetchMembers = useCallback(async (groupName: string) => {
    setLoadingMembers(true);
    try {
      const data = await apiFetch<ContactGroupMember[]>(
        `/api/contact-groups/${encodeURIComponent(groupName)}/members`
      );
      setMembers(data);
    } catch (err: any) {
      toast.error(err?.message || "Error al cargar miembros del grupo");
    } finally {
      setLoadingMembers(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedGroup) {
      fetchMembers(selectedGroup);
    } else {
      setMembers([]);
    }
  }, [selectedGroup, fetchMembers]);

  // Load all contacts for the "Añadir Miembro" picker
  useEffect(() => {
    if (addMemberOpen) {
      apiFetch<{ contacts?: Contact[]; data?: Contact[] }>("/api/contacts?limit=200")
        .then((res) => {
          const list = Array.isArray(res) ? res : res.contacts || res.data || [];
          setContactsList(list);
        })
        .catch(() => {});
    }
  }, [addMemberOpen]);

  // Active group data
  const currentGroup = useMemo(() => {
    return groups.find((g) => g.grupocontacto === selectedGroup) || null;
  }, [groups, selectedGroup]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!groupFilter.trim()) return groups;
    const q = groupFilter.toLowerCase();
    return groups.filter(
      (g) =>
        g.grupocontacto.toLowerCase().includes(q) ||
        (g.descripciongrupo && g.descripciongrupo.toLowerCase().includes(q))
    );
  }, [groups, groupFilter]);

  // Filtered members
  const filteredMembers = useMemo(() => {
    if (!memberFilter.trim()) return members;
    const q = memberFilter.toLowerCase();
    return members.filter(
      (m) =>
        m.movil.toLowerCase().includes(q) ||
        (m.nombre && m.nombre.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q))
    );
  }, [members, memberFilter]);

  // Filtered contacts in modal
  const filteredContactsInModal = useMemo(() => {
    if (!contactSearch.trim()) return contactsList.slice(0, 15);
    const q = contactSearch.toLowerCase();
    return contactsList
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [contactsList, contactSearch]);

  // Format date helper: "Miércoles, 12/11/2026 08:30"
  const formatDateWithDay = (dateStr: string) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const dayName = d.toLocaleDateString("es-ES", { weekday: "long" });
      const capitalDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const datePart = d.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const timePart = d.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${capitalDay}, ${datePart} ${timePart}`;
    } catch {
      return dateStr;
    }
  };

  // Actions
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      toast.error("Indica un nombre para el grupo");
      return;
    }
    setSavingGroup(true);
    try {
      const created = await apiFetch<ContactGroup>("/api/contact-groups", {
        method: "POST",
        body: JSON.stringify({
          grupocontacto: newGroupName.trim(),
          descripciongrupo: newGroupDesc.trim() || undefined,
        }),
      });
      toast.success(`Grupo "${created.grupocontacto}" creado.`);
      setCreateGroupOpen(false);
      setNewGroupName("");
      setNewGroupDesc("");
      await fetchGroups();
      setSelectedGroup(created.grupocontacto);
    } catch (err: any) {
      toast.error(err?.message || "Error al crear el grupo");
    } finally {
      setSavingGroup(false);
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    setSavingGroup(true);
    try {
      await apiFetch(`/api/contact-groups/${encodeURIComponent(selectedGroup)}`, {
        method: "PUT",
        body: JSON.stringify({
          descripciongrupo: editGroupDesc.trim() || null,
        }),
      });
      toast.success("Descripción del grupo actualizada.");
      setEditGroupOpen(false);
      await fetchGroups();
    } catch (err: any) {
      toast.error(err?.message || "Error al actualizar el grupo");
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    if (
      !confirm(
        `¿Estás seguro de que deseas eliminar el grupo "${selectedGroup}"? Esta acción borrará la pertenencia de todos sus miembros.`
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/api/contact-groups/${encodeURIComponent(selectedGroup)}`, {
        method: "DELETE",
      });
      toast.success(`Grupo "${selectedGroup}" eliminado.`);
      setSelectedGroup(null);
      await fetchGroups();
    } catch (err: any) {
      toast.error(err?.message || "Error al eliminar el grupo");
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    const phone = newMemberPhone.trim();
    if (!phone) {
      toast.error("Debes indicar el teléfono móvil del miembro");
      return;
    }
    setSavingMember(true);
    try {
      await apiFetch(
        `/api/contact-groups/${encodeURIComponent(selectedGroup)}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            movil: phone,
            contactId: selectedContactId || undefined,
          }),
        }
      );
      toast.success(`Miembro añadido al grupo "${selectedGroup}".`);
      setAddMemberOpen(false);
      setNewMemberPhone("");
      setSelectedContactId(null);
      setContactSearch("");
      await fetchMembers(selectedGroup);
      await fetchGroups();
    } catch (err: any) {
      toast.error(err?.message || "Error al añadir miembro");
    } finally {
      setSavingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: number, movil: string) => {
    if (!selectedGroup) return;
    if (!confirm(`¿Eliminar al miembro con teléfono ${movil} del grupo?`)) return;
    try {
      await apiFetch(
        `/api/contact-groups/${encodeURIComponent(selectedGroup)}/members/${memberId}`,
        {
          method: "DELETE",
        }
      );
      toast.success("Miembro eliminado del grupo.");
      await fetchMembers(selectedGroup);
      await fetchGroups();
    } catch (err: any) {
      toast.error(err?.message || "Error al eliminar miembro");
    }
  };

  const handleExportVcf = async () => {
    if (!selectedGroup) return;
    setExportingVcf(true);
    try {
      const res = await fetch(
        `/api/contact-groups/${encodeURIComponent(selectedGroup)}/export-vcf`,
        { credentials: "include" }
      );
      if (!res.ok) {
        throw new Error(`Error ${res.status} al descargar el archivo VCF`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedGroup}_contactos_wassap.vcf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Archivo VCF de "${selectedGroup}" descargado con éxito.`);
    } catch (err: any) {
      toast.error(err?.message || "Error al exportar archivo VCF");
    } finally {
      setExportingVcf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UsersRound className="w-7 h-7 text-indigo-600" />
            Grupos de Contactos y Listas de Distribución WhatsApp
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona grupos de contactos, asignación automática por citas y exportación en formato VCF (.vcf) para listas de distribución de WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={fetchGroups}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Refrescar
          </Button>
          <Button
            onClick={() => {
              setNewGroupName("");
              setNewGroupDesc("");
              setCreateGroupOpen(true);
            }}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-4 h-4" />
            Nuevo Grupo
          </Button>
        </div>
      </div>

      {/* Main Grid: Left Groups, Right Members */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Groups List */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-[750px]">
          <div className="p-4 border-b border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">
                Grupos ({groups.length})
              </h2>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                placeholder="Buscar grupo..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {loadingGroups ? (
              <div className="p-8 text-center text-sm text-gray-500">
                Cargando grupos...
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No se encontraron grupos.
              </div>
            ) : (
              filteredGroups.map((group) => {
                const isSelected = group.grupocontacto === selectedGroup;
                return (
                  <button
                    key={group.grupocontacto}
                    type="button"
                    onClick={() => setSelectedGroup(group.grupocontacto)}
                    className={`w-full text-left p-4 transition-colors flex items-start justify-between gap-2 hover:bg-gray-50 ${
                      isSelected ? "bg-indigo-50/80 border-l-4 border-indigo-600" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900 text-sm truncate flex items-center gap-1.5">
                        {group.grupocontacto}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                        {group.descripciongrupo || "Sin descripción"}
                      </p>
                    </div>
                    <Badge
                      variant={group.memberCount > 0 ? "default" : "info"}
                      className="shrink-0 text-xs"
                    >
                      {group.memberCount} miembros
                    </Badge>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Group Details & Members */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-[750px]">
          {selectedGroup && currentGroup ? (
            <>
              {/* Group Header */}
              <div className="p-5 border-b border-gray-200 bg-gray-50/50 rounded-t-xl">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900">
                        {currentGroup.grupocontacto}
                      </h2>
                      <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">
                        {members.length} miembros
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 max-w-2xl">
                      {currentGroup.descripciongrupo || "Sin descripción definida."}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={handleExportVcf}
                      disabled={exportingVcf || members.length === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 text-sm"
                      title="Exportar archivo .vcf para importar como lista de difusión en WhatsApp"
                    >
                      <Download className="w-4 h-4" />
                      {exportingVcf ? "Exportando..." : "Exportar VCF WhatsApp"}
                    </Button>

                    <Button
                      onClick={() => {
                        setNewMemberPhone("");
                        setSelectedContactId(null);
                        setContactSearch("");
                        setAddMemberOpen(true);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Añadir Miembro
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditGroupDesc(currentGroup.descripciongrupo || "");
                        setEditGroupOpen(true);
                      }}
                      title="Editar descripción"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleDeleteGroup}
                      className="text-red-600 hover:bg-red-50 hover:border-red-300"
                      title="Eliminar este grupo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Sub-bar with member search */}
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      value={memberFilter}
                      onChange={(e) => setMemberFilter(e.target.value)}
                      placeholder="Buscar por teléfono, nombre o email..."
                      className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    Mostrando {filteredMembers.length} de {members.length} miembros
                  </span>
                </div>
              </div>

              {/* Members Table */}
              <div className="flex-1 overflow-y-auto">
                {loadingMembers ? (
                  <div className="p-12 text-center text-sm text-gray-500">
                    Cargando miembros del grupo...
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div className="p-12 text-center text-sm text-gray-500 space-y-2">
                    <UsersRound className="w-10 h-10 mx-auto text-gray-300" />
                    <p className="font-medium text-gray-700">No hay miembros en este grupo</p>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                      Puedes añadir contactos manualmente con el botón &quot;Añadir Miembro&quot; o esperar a que los clientes reserven citas de este servicio para ser incluidos automáticamente.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider sticky top-0 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Nombre y Apellido</th>
                        <th className="px-4 py-3 font-semibold">Teléfono Móvil</th>
                        <th className="px-4 py-3 font-semibold">Correo Electrónico</th>
                        <th className="px-4 py-3 font-semibold">Fecha de Inclusión</th>
                        <th className="px-4 py-3 font-semibold text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredMembers.map((m) => {
                        const cleanDigits = m.movil.replace(/\D/g, "");
                        const waLink = `https://wa.me/${cleanDigits.startsWith("34") ? cleanDigits : `34${cleanDigits}`}`;
                        return (
                          <tr key={m.id} className="hover:bg-gray-50/80 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center text-xs font-bold">
                                  {m.nombre ? m.nombre.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
                                </div>
                                <div>
                                  {m.contactId ? (
                                    <Link
                                      href={`/contacts/${m.contactId}`}
                                      className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                                      title="Ver ficha de contacto"
                                    >
                                      {m.nombre || "Contacto registrado"}
                                      <ExternalLink className="w-3 h-3 text-gray-400" />
                                    </Link>
                                  ) : (
                                    <span>{m.nombre || "Sin nombre registrado"}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-800">
                              <div className="flex items-center gap-2">
                                <span>{m.movil}</span>
                                <a
                                  href={waLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 hover:text-emerald-700"
                                  title="Abrir chat en WhatsApp"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {m.email ? (
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                                  {m.email}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic">No informado</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                {formatDateWithDay(m.campofechayhora)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRemoveMember(m.id, m.movil)}
                                className="text-red-600 hover:bg-red-50 hover:border-red-300 p-1.5 h-auto text-xs"
                                title="Eliminar del grupo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
              <UsersRound className="w-12 h-12 text-gray-300 mb-2" />
              <p className="font-semibold text-gray-700">Selecciona un grupo</p>
              <p className="text-xs text-gray-400 mt-1">
                Elige un grupo del panel izquierdo para consultar y gestionar sus miembros y exportar a VCF.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Crear Grupo */}
      <Modal
        isOpen={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        title="Crear Nuevo Grupo de Contactos"
      >
        <form onSubmit={handleCreateGroup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del Grupo (grupocontacto)
            </label>
            <Input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Ej: YOGA_NIVEL_AVANZADO"
              maxLength={80}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Máximo 80 caracteres. Se formateará automáticamente en mayúsculas y guiones bajos.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción del Grupo
            </label>
            <textarea
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              placeholder="Descripción del objetivo de este grupo o taller..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateGroupOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={savingGroup}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {savingGroup ? "Creando..." : "Crear Grupo"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Editar Grupo */}
      <Modal
        isOpen={editGroupOpen}
        onClose={() => setEditGroupOpen(false)}
        title={`Editar Grupo: ${selectedGroup || ""}`}
      >
        <form onSubmit={handleEditGroup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción del Grupo
            </label>
            <textarea
              value={editGroupDesc}
              onChange={(e) => setEditGroupDesc(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditGroupOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={savingGroup}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {savingGroup ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Añadir Miembro */}
      <Modal
        isOpen={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        title={`Añadir Miembro a "${selectedGroup || ""}"`}
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono Móvil
            </label>
            <Input
              type="text"
              value={newMemberPhone}
              onChange={(e) => setNewMemberPhone(e.target.value)}
              placeholder="Ej: +34 612 34 56 78 o 612345678"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Dato obligatorio guardado en la tabla &quot;miembrosgrupo&quot;.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              O seleccionar de Contactos existentes
            </label>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Filtrar por nombre, teléfono o email..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 text-xs">
              {filteredContactsInModal.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedContactId(c.id);
                    if (c.phone) setNewMemberPhone(c.phone);
                  }}
                  className={`w-full text-left p-2 hover:bg-indigo-50 flex items-center justify-between ${
                    selectedContactId === c.id ? "bg-indigo-100/70 font-semibold text-indigo-900" : ""
                  }`}
                >
                  <div>
                    <div>{c.name || "Sin nombre"}</div>
                    <div className="text-gray-500 text-[11px]">{c.phone || "Sin teléfono"}</div>
                  </div>
                  {c.email && <div className="text-gray-400 text-[11px] truncate max-w-[140px]">{c.email}</div>}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddMemberOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={savingMember}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {savingMember ? "Añadiendo..." : "Añadir Miembro"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
