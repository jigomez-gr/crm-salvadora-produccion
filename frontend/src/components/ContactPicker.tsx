"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  Search,
  Phone,
  Mail,
  User,
  X,
  Pencil,
  Check,
  Loader2,
  GraduationCap,
  MessageCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Contact, ContactPage, ContactStatus } from "@/lib/types";
import { CONTACT_STATUS_META, CONTACT_STATUSES } from "@/lib/contacts";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export interface ContactPickerRef {
  focus: () => void;
}

export interface ContactPickerProps {
  value: string; // contactId
  onChange: (contactId: string, contact?: Contact) => void;
  initialContact?: Contact;
  hasError?: boolean;
  required?: boolean;
  className?: string;
}

export const ContactPicker = forwardRef<ContactPickerRef, ContactPickerProps>(
  ({ value, onChange, initialContact, hasError, required, className }, ref) => {
    const [selectedContact, setSelectedContact] = useState<Contact | null>(
      initialContact || null
    );
    const [isSearching, setIsSearching] = useState<boolean>(!value);

    // Search filters analogous to the Contacts screen
    const [nameSearch, setNameSearch] = useState("");
    const [phoneSearch, setPhoneSearch] = useState("");
    const [emailSearch, setEmailSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<ContactStatus | "">("");

    const [debouncedName, setDebouncedName] = useState("");
    const [debouncedPhone, setDebouncedPhone] = useState("");
    const [debouncedEmail, setDebouncedEmail] = useState("");
    const [debouncedStatus, setDebouncedStatus] = useState<ContactStatus | "">("");

    const [results, setResults] = useState<Contact[]>([]);
    const [totalResults, setTotalResults] = useState<number>(0);
    const [loading, setLoading] = useState(false);

    const nameInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        setIsSearching(true);
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 50);
      },
    }));

    // If initialContact is updated or value changes from outside
    useEffect(() => {
      if (initialContact && initialContact.id === value) {
        setSelectedContact(initialContact);
        setIsSearching(false);
      } else if (value && (!selectedContact || selectedContact.id !== value)) {
        // Fetch contact details if not in state
        let cancelled = false;
        apiFetch<Contact>(`/api/contacts/${value}`)
          .then((c) => {
            if (!cancelled && c) {
              setSelectedContact(c);
              setIsSearching(false);
            }
          })
          .catch(() => {
            /* ignore */
          });
        return () => {
          cancelled = true;
        };
      } else if (!value) {
        setSelectedContact(null);
        setIsSearching(true);
      }
    }, [value, initialContact]);

    // Debounce search fields (250ms)
    useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedName(nameSearch);
        setDebouncedPhone(phoneSearch);
        setDebouncedEmail(emailSearch);
        setDebouncedStatus(statusFilter);
      }, 250);
      return () => clearTimeout(timer);
    }, [nameSearch, phoneSearch, emailSearch, statusFilter]);

    // Fetch contacts matching filters
    const searchContacts = useCallback(async () => {
      if (!isSearching) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: "25",
          offset: "0",
        });
        if (debouncedName.trim()) params.set("name", debouncedName.trim());
        if (debouncedPhone.trim()) params.set("phone", debouncedPhone.trim());
        if (debouncedEmail.trim()) params.set("email", debouncedEmail.trim());
        if (debouncedStatus) params.set("status", debouncedStatus);

        const res = await apiFetch<ContactPage>(`/api/contacts?${params.toString()}`);
        if (res) {
          setResults(res.items);
          setTotalResults(res.total);
        }
      } catch (err) {
        setResults([]);
        setTotalResults(0);
      } finally {
        setLoading(false);
      }
    }, [isSearching, debouncedName, debouncedPhone, debouncedEmail, debouncedStatus]);

    useEffect(() => {
      searchContacts();
    }, [searchContacts]);

    const handleSelect = (contact: Contact) => {
      setSelectedContact(contact);
      setIsSearching(false);
      onChange(contact.id, contact);
    };

    const handleClear = () => {
      setSelectedContact(null);
      setIsSearching(true);
      onChange("", undefined);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    };

    const hasActiveFilters = Boolean(
      nameSearch.trim() || phoneSearch.trim() || emailSearch.trim() || statusFilter
    );

    const resetFilters = () => {
      setNameSearch("");
      setPhoneSearch("");
      setEmailSearch("");
      setStatusFilter("");
    };

    return (
      <div className={cn("space-y-2", className)}>
        {/* Selected Contact Card */}
        {selectedContact && !isSearching ? (
          <div
            className={cn(
              "relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-all shadow-xs",
              hasError
                ? "border-2 border-red-500 bg-red-50/50"
                : "border-indigo-200 bg-gradient-to-r from-indigo-50/60 to-white"
            )}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                {selectedContact.name
                  ? selectedContact.name
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()
                  : "U"}
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-neutral-900 text-sm truncate">
                    {selectedContact.name || "Sin nombre"}
                  </span>
                  {selectedContact.isStudent && (
                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold gap-0.5 py-0">
                      <GraduationCap className="h-3 w-3 text-emerald-700" />
                      Alumno
                    </Badge>
                  )}
                  {selectedContact.status && (
                    <Badge
                      variant={CONTACT_STATUS_META[selectedContact.status]?.variant || "default"}
                      className="text-[10px] py-0"
                    >
                      {CONTACT_STATUS_META[selectedContact.status]?.label || selectedContact.status}
                    </Badge>
                  )}
                  {selectedContact.contactadowassap === "S" && (
                    <span
                      title="Contactado por WhatsApp"
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full"
                    >
                      <MessageCircle className="h-3 w-3 text-emerald-600" />
                      WhatsApp
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 pt-0.5">
                  {selectedContact.phone ? (
                    <span className="flex items-center gap-1 text-neutral-700 font-medium">
                      <Phone className="h-3.5 w-3.5 text-neutral-400" />
                      {selectedContact.phone}
                    </span>
                  ) : (
                    <span className="text-neutral-400 italic">Sin teléfono</span>
                  )}

                  {selectedContact.email ? (
                    <span className="flex items-center gap-1 text-neutral-700 truncate max-w-[220px]">
                      <Mail className="h-3.5 w-3.5 text-neutral-400" />
                      {selectedContact.email}
                    </span>
                  ) : (
                    <span className="text-neutral-400 italic">Sin email</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-1 sm:pt-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsSearching(true)}
                className="text-xs font-semibold h-8 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Cambiar contacto
              </Button>
              <button
                type="button"
                onClick={handleClear}
                title="Quitar contacto seleccionado"
                className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Search Panel Analogous to Image 2 */
          <div
            className={cn(
              "rounded-xl border bg-white p-3 space-y-3 transition-colors shadow-xs",
              hasError
                ? "border-2 border-red-500 bg-red-50/20"
                : "border-neutral-200"
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
                <Search className="h-3.5 w-3.5 text-indigo-600" />
                <span>Selector de Contactos (busca por nombre, teléfono o email)</span>
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-[11px] text-neutral-500 hover:text-neutral-800 underline cursor-pointer"
                  >
                    Limpiar filtros
                  </button>
                )}
                {selectedContact && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsSearching(false)}
                    className="text-xs text-neutral-600 h-7 px-2"
                  >
                    Cancelar cambio
                  </Button>
                )}
              </div>
            </div>

            {/* 4 Search Inputs Grid (Matching Contactos Screen) */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                <Input
                  ref={nameInputRef}
                  className="pl-8 h-9 text-xs"
                  placeholder="Buscar por nombre o trozos…"
                  value={nameSearch}
                  onChange={(e) => setNameSearch(e.target.value)}
                  autoFocus={isSearching && !selectedContact}
                />
              </div>

              <div className="relative">
                <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                <Input
                  className="pl-8 h-9 text-xs"
                  placeholder="Buscar por teléfono…"
                  value={phoneSearch}
                  onChange={(e) => setPhoneSearch(e.target.value)}
                />
              </div>

              <div className="relative">
                <Mail className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
                <Input
                  className="pl-8 h-9 text-xs"
                  placeholder="Buscar por email…"
                  value={emailSearch}
                  onChange={(e) => setEmailSearch(e.target.value)}
                />
              </div>

              <div>
                <select
                  className="block w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 h-9"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ContactStatus | "")}
                >
                  <option value="">Todos los estados</option>
                  {CONTACT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CONTACT_STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Search Results List */}
            <div className="pt-1">
              <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1 px-1">
                <span>
                  {loading ? (
                    <span className="flex items-center gap-1.5 text-indigo-600 font-medium">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Buscando en la base de datos…
                    </span>
                  ) : hasActiveFilters ? (
                    <span>
                      {totalResults} resultado{totalResults !== 1 ? "s" : ""} encontrado
                      {totalResults !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span>Contactos recientes / sugeridos ({totalResults} total):</span>
                  )}
                </span>
                <span className="text-neutral-400">Haz clic en un contacto para seleccionarlo</span>
              </div>

              <div className="max-h-52 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50/50 p-1 space-y-1 divide-y divide-neutral-100">
                {loading && results.length === 0 ? (
                  <div className="py-6 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                    Cargando contactos…
                  </div>
                ) : results.length === 0 ? (
                  <div className="py-6 text-center text-xs text-neutral-500">
                    No se encontraron contactos que coincidan con la búsqueda.
                  </div>
                ) : (
                  results.map((c) => {
                    const isCurrent = c.id === value;
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleSelect(c)}
                        className={cn(
                          "group flex items-center justify-between gap-3 p-2 rounded-lg text-xs cursor-pointer transition-colors pt-2",
                          isCurrent
                            ? "bg-indigo-100/70 border border-indigo-300"
                            : "hover:bg-indigo-50/80 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-neutral-100 text-neutral-700 group-hover:bg-indigo-200 group-hover:text-indigo-800 flex items-center justify-center font-bold text-[11px] shrink-0">
                            {c.name ? c.name[0].toUpperCase() : "U"}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-neutral-900 group-hover:text-indigo-950 truncate">
                                {c.name || "Sin nombre"}
                              </span>
                              {c.isStudent && (
                                <span className="inline-flex items-center text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  Alumno
                                </span>
                              )}
                              {c.status && (
                                <Badge
                                  variant={CONTACT_STATUS_META[c.status]?.variant || "default"}
                                  className="text-[9px] py-0 px-1"
                                >
                                  {CONTACT_STATUS_META[c.status]?.label || c.status}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-neutral-500 pt-0.5">
                              {c.phone && (
                                <span className="flex items-center gap-1 text-neutral-600">
                                  <Phone className="h-3 w-3 text-neutral-400" />
                                  {c.phone}
                                </span>
                              )}
                              {c.email && (
                                <span className="flex items-center gap-1 text-neutral-600 truncate max-w-[200px]">
                                  <Mail className="h-3 w-3 text-neutral-400" />
                                  {c.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center">
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <Check className="h-3.5 w-3.5" />
                              Seleccionado
                            </span>
                          ) : (
                            <span className="opacity-0 group-hover:opacity-100 text-indigo-600 font-semibold text-[11px] transition-opacity">
                              Seleccionar →
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {hasError && !selectedContact && (
          <p className="text-xs font-semibold text-red-600 flex items-center gap-1 pt-0.5">
            ⚠️ Por favor, busca y selecciona un alumno o paciente para la cita.
          </p>
        )}
      </div>
    );
  }
);

ContactPicker.displayName = "ContactPicker";
