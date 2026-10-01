"use client";

import { useRef, useState } from "react";
import {
  Upload,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle2,
  Users,
  Copy,
  ExternalLink,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { GoogleImportResult } from "@/lib/types";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

interface GoogleImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function GoogleImportModal({
  open,
  onClose,
  onImported,
}: GoogleImportModalProps) {
  const toast = useToast();
  const [filePath, setFilePath] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [openNotepad, setOpenNotepad] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<GoogleImportResult | null>(null);
  const [activeTab, setActiveTab] = useState<"completo" | "sinEmail" | "sinMovil" | "duplicidades">("completo");
  const [copied, setCopied] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    // If user selected file, also default filePath if empty
    if (!filePath.trim()) {
      setFilePath(file.name);
    }
    const reader = new FileReader();
    reader.onload = () => setCsvContent(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!filePath.trim() && !csvContent.trim()) {
      toast.error("Por favor, introduce la ruta del archivo CSV de Google o selecciona un archivo.");
      return;
    }

    setImporting(true);
    setResult(null);

    try {
      const res = await apiFetch<GoogleImportResult>("/api/contacts/import-google", {
        method: "POST",
        body: JSON.stringify({
          filePath: filePath.trim() || undefined,
          csvContent: csvContent.trim() || undefined,
          openNotepad,
        }),
      });

      setResult(res);
      onImported();
      toast.success(
        `Importación completada: ${res.created} nuevos, ${res.existing} existentes, ${res.skipped} omitidos.`
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Error al importar el archivo de contactos de Google."
      );
    } finally {
      setImporting(false);
    }
  }

  function handleDownloadReport() {
    if (!result?.reportText) return;
    const blob = new Blob([result.reportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe_importacion_google_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyReport() {
    if (!result?.reportText) return;
    navigator.clipboard.writeText(result.reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Informe copiado al portapapeles.");
  }

  function extractSection(text: string, titleStart: string, nextTitleStart?: string): string {
    const startIdx = text.indexOf(titleStart);
    if (startIdx === -1) return "No hay datos para esta sección.";
    if (!nextTitleStart) return text.substring(startIdx).trim();
    const endIdx = text.indexOf(nextTitleStart, startIdx);
    return endIdx === -1 ? text.substring(startIdx).trim() : text.substring(startIdx, endIdx).trim();
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar Contactos de Google (CSV)">
      <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        {/* Helper guide */}
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-sm text-indigo-950">
          <p className="font-semibold flex items-center gap-1.5 text-indigo-900">
            <Users className="h-4 w-4 text-indigo-600" />
            Exportación desde Google Contacts
          </p>
          <p className="mt-1 text-xs text-indigo-800 leading-relaxed">
            Ve a <strong>contacts.google.com</strong>, pulsa <strong>Exportar</strong> y elige la opción{" "}
            <strong>&quot;CSV de Google&quot;</strong>. Introduce la ruta de tu archivo en el equipo o selecciónalo a continuación.
          </p>
        </div>

        {/* Input for Path */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600">
            Ruta completa del archivo CSV en el equipo (Path):
          </label>
          <Input
            placeholder="ej: C:\Users\Administrator\Downloads\contacts.csv"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            disabled={importing}
          />
          <p className="text-[11px] text-neutral-500">
            Puedes copiar y pegar la ruta del archivo (o arrastrarlo desde el explorador).
          </p>
        </div>

        {/* Or File browser */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600">
            O selecciona el archivo desde el explorador de archivos:
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            disabled={importing}
            className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-200 cursor-pointer"
          />
          {fileName && (
            <p className="text-xs text-emerald-700 font-medium">
              ✓ Archivo seleccionado: {fileName} ({csvContent ? `${Math.round(csvContent.length / 1024)} KB` : "cargando..."})
            </p>
          )}
        </div>

        {/* Option to open in Notepad */}
        <div className="flex items-center gap-2 pt-1 pb-1">
          <input
            type="checkbox"
            id="openNotepadCheckbox"
            checked={openNotepad}
            onChange={(e) => setOpenNotepad(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="openNotepadCheckbox" className="text-xs text-neutral-700 cursor-pointer select-none">
            Abrir informe detallado y discrepancias en el <strong>Bloc de notas (Notepad)</strong> al finalizar
          </label>
        </div>

        {/* Result Area */}
        {result && (
          <div className="space-y-3 pt-2 border-t border-neutral-200">
            {/* Notepad notification banner */}
            {result.openedNotepad && (
              <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">¡Informe abierto en el Bloc de notas (Notepad)!</p>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Se ha iniciado Notepad con el archivo:{" "}
                    <code className="bg-emerald-100/70 px-1 py-0.5 rounded font-mono">{result.reportPath}</code>
                  </p>
                </div>
              </div>
            )}

            {/* Metric counters */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-center">
                <div className="text-lg font-bold text-emerald-700">{result.created}</div>
                <div className="text-[11px] font-medium text-emerald-900">Nuevos Creados</div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 text-center">
                <div className="text-lg font-bold text-blue-700">{result.existing}</div>
                <div className="text-[11px] font-medium text-blue-900">Ya Existentes</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-center">
                <div className="text-lg font-bold text-amber-700">{result.skipped}</div>
                <div className="text-[11px] font-medium text-amber-900">Omitidos / Discrepancias</div>
              </div>
              <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-2.5 text-center">
                <div className="text-lg font-bold text-purple-700">{result.contactsWithoutEmailCount}</div>
                <div className="text-[11px] font-medium text-purple-900">Sin Email</div>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 text-center">
                <div className="text-lg font-bold text-rose-700">{result.contactsWithoutPhoneCount}</div>
                <div className="text-[11px] font-medium text-rose-900">Sin Móvil Válido</div>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5 text-center">
                <div className="text-lg font-bold text-indigo-700">{result.duplicatesOrSimilaritiesCount}</div>
                <div className="text-[11px] font-medium text-indigo-900">Duplicidades / Similares</div>
              </div>
            </div>

            {/* Quick Report Section Navigation */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("completo")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      activeTab === "completo"
                        ? "bg-neutral-800 text-white"
                        : "text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    Informe Completo
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("sinEmail")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      activeTab === "sinEmail"
                        ? "bg-purple-700 text-white"
                        : "text-purple-700 hover:bg-purple-50"
                    }`}
                  >
                    Sin Email ({result.contactsWithoutEmailCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("sinMovil")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      activeTab === "sinMovil"
                        ? "bg-rose-700 text-white"
                        : "text-rose-700 hover:bg-rose-50"
                    }`}
                  >
                    Sin Móvil ({result.contactsWithoutPhoneCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("duplicidades")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      activeTab === "duplicidades"
                        ? "bg-indigo-700 text-white"
                        : "text-indigo-700 hover:bg-indigo-50"
                    }`}
                  >
                    Duplicidades / Similares
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={handleCopyReport} className="h-7 text-xs px-2">
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleDownloadReport} className="h-7 text-xs px-2">
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Descargar .txt
                  </Button>
                </div>
              </div>

              {/* Report content viewer */}
              <div className="rounded-lg border border-neutral-200 bg-neutral-900 text-neutral-100 p-3 font-mono text-[11px] leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap select-text">
                {activeTab === "completo" && result.reportText}
                {activeTab === "sinEmail" &&
                  extractSection(
                    result.reportText,
                    "3. INFORME DE CONTACTOS SIN CORREO ELECTRÓNICO",
                    "4. INFORME DE CONTACTOS SIN MÓVIL"
                  )}
                {activeTab === "sinMovil" &&
                  extractSection(
                    result.reportText,
                    "4. INFORME DE CONTACTOS SIN MÓVIL / TELÉFONO VÁLIDO",
                    "5. INFORME DE DISCREPANCIAS"
                  )}
                {activeTab === "duplicidades" &&
                  extractSection(
                    result.reportText,
                    "5. INFORME DE DISCREPANCIAS, DUPLICIDADES Y COINCIDENCIAS",
                    "FIN DEL INFORME DE IMPORTACIÓN"
                  )}
              </div>
            </div>
          </div>
        )}

        {/* Modal footer buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <Button variant="secondary" onClick={onClose}>
            {result ? "Terminar" : "Cancelar"}
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || (!filePath.trim() && !csvContent.trim())}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Upload className="h-4 w-4 mr-1.5" />
            {importing ? "Importando y analizando…" : "Importar de Google"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
