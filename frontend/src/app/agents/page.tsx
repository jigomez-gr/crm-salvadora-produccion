"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ChevronRight, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Agent } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import Link from "next/link";
import { cn } from "@/lib/utils";

function CreateAgentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (agent: Agent) => void;
}) {
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The parent remounts this modal (via `key`) whenever it opens, so the fields
  // start empty each time — no reset effect needed.

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) {
      setError("El nombre del negocio es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const agent = await apiFetch<Agent>("/api/agents", {
        method: "POST",
        body: JSON.stringify({ businessName, businessDescription }),
      });
      onCreated(agent);
    } catch {
      setError("No se pudo crear el agente. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo agente">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Nombre del negocio <span className="text-red-500">*</span>
          </label>
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="ej. Clínica Dental Sonrisa"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Descripción
          </label>
          <Textarea
            rows={3}
            value={businessDescription}
            onChange={(e) => setBusinessDescription(e.target.value)}
            placeholder="¿A qué se dedica el negocio?"
          />
        </div>
        <p className="text-xs text-neutral-500">
          Después podrás configurar el modelo de IA, la conexión de WhatsApp,
          los servicios y el horario.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creando…" : "Crear agente"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";

export default function AgentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    apiFetch<Agent[]>("/api/agents")
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (user && user.role !== "admin") {
    return (
      <div className="p-4 sm:p-8">
        <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
          <div>
            <h1 className="text-sm font-semibold text-neutral-900">
              Acceso restringido
            </h1>
            <p className="mt-1 text-sm text-neutral-600">
              Solo los administradores pueden gestionar la configuración global de agentes de IA.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Agentes</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Agentes de IA conectados a los canales de comunicación
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo agente
        </Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="text-sm text-neutral-400">Cargando…</div>
        ) : agents.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">
            No hay agentes configurados aún. Crea el primero.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Link
                key={agent.agentKey}
                href={`/agents/${agent.agentKey}`}
                className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl",
                        agent.enabled ? "bg-indigo-100" : "bg-neutral-100"
                      )}
                    >
                      <Bot
                        className={cn(
                          "h-5 w-5",
                          agent.enabled
                            ? "text-indigo-600"
                            : "text-neutral-400"
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">
                        {agent.businessName}
                      </p>
                      <p className="text-xs text-neutral-500">{agent.agentKey}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-indigo-600" />
                </div>

                <p className="mt-3 line-clamp-2 text-xs text-neutral-500">
                  {agent.businessDescription || "Sin descripción"}
                </p>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {agent.services.slice(0, 2).map((s) => (
                      <Badge key={s.name} variant="default">
                        {s.name}
                      </Badge>
                    ))}
                    {agent.services.length > 2 && (
                      <Badge>+{agent.services.length - 2}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {agent.enabled ? (
                      <ToggleRight className="h-5 w-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-neutral-300" />
                    )}
                    <span className="text-xs text-neutral-500">
                      {agent.enabled ? "Activo" : "Desactivado"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <CreateAgentModal
        key={modalOpen ? "open" : "closed"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(agent) => {
          setModalOpen(false);
          router.push(`/agents/${agent.agentKey}`);
        }}
      />
    </div>
  );
}
