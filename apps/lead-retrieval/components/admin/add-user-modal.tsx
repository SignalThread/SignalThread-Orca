"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type { PlatformEvent, ExhibitorOverview } from "@/lib/data/platform-admin";
import type { AddUserInviteActionState } from "@/lib/data/platform-admin";

export type AddUserRoleOption =
  | "platform_admin"
  | "organizer_admin"
  | "exhibitor_admin"
  | "exhibitor_viewer";
type AddUserBackendRole =
  | "platform_admin"
  | "event_organizer"
  | "exhibitor_admin"
  | "exhibitor_viewer";

const EVENTS_REQUIRED_SENTINEL = "__events_required__";

type AddUserModalProps = {
  open: boolean;
  events: PlatformEvent[];
  exhibitors: ExhibitorOverview[];
  companies?: Array<{ id: string; name: string }>;
  /** From admin users page data: companies with active `scope=company` license. */
  activeCompanyLicensedCompanyIds: string[];
  addUserAction: (formData: FormData) => Promise<AddUserInviteActionState>;
  onClose: () => void;
  defaultEventId?: string;
  roleOptions?: AddUserRoleOption[];
};

const roleConfig: Record<
  AddUserRoleOption,
  {
    label: string;
    helper: string;
    backendRole: AddUserBackendRole;
    permissions: string[];
    requiresExhibitorScope: boolean;
  }
> = {
  platform_admin: {
    label: "Platform Admin",
    helper: "Full platform access",
    backendRole: "platform_admin",
    permissions: ["Event Management", "Exhibitor Management", "License Management", "Revenue & Analytics Access"],
    requiresExhibitorScope: false
  },
  organizer_admin: {
    label: "Organizer Admin",
    helper: "Event-scoped admin access",
    backendRole: "event_organizer",
    permissions: ["Event Management", "Exhibitor Management", "License Management"],
    requiresExhibitorScope: false
  },
  exhibitor_admin: {
    label: "Exhibitor Admin",
    helper: "Exhibitor-scoped team management",
    backendRole: "exhibitor_admin",
    permissions: ["Exhibitor Management", "License Management"],
    requiresExhibitorScope: true
  },
  exhibitor_viewer: {
    label: "Exhibitor viewer",
    helper: "View-only exhibitor access",
    backendRole: "exhibitor_viewer",
    permissions: ["app"],
    requiresExhibitorScope: true
  }
};

function resolveBootstrapEventId(
  companyId: string,
  events: PlatformEvent[],
  exhibitors: ExhibitorOverview[]
): string {
  if (!companyId) return "";
  const eventById = new Map(events.map((e) => [e.id, e]));
  const boothEventIds = exhibitors.filter((x) => x.id === companyId).map((x) => x.eventId);
  const boothEvents = boothEventIds
    .map((id) => eventById.get(id))
    .filter(Boolean) as PlatformEvent[];
  boothEvents.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  if (boothEvents[0]?.id) return boothEvents[0].id;

  const owned = events
    .filter((e) => (e.companyId ?? null) === companyId)
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  if (owned[0]?.id) return owned[0].id;

  return events[0]?.id ?? "";
}

function summarizeEventSelection(selectedIds: string[], nameById: Map<string, string>): string {
  if (selectedIds.length === 0) return "Select events…";
  const names = selectedIds.map((id) => nameById.get(id) ?? id);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

type SearchableEventMultiSelectProps = {
  id: string;
  /** Optional — stable hook for e2e (opens the event list). */
  triggerTestId?: string;
  options: PlatformEvent[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
};

/**
 * Collapsed-by-default multi-select with search; styled to match `h-14` Company `<select>`.
 */
function SearchableEventMultiSelect({
  id,
  triggerTestId,
  options,
  value,
  onChange,
  disabled,
  invalid
}: SearchableEventMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = `${id}-listbox`;

  const nameById = useMemo(() => new Map(options.map((e) => [e.id, e.name])), [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((e) => e.name.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggleId = (eventId: string) => {
    if (value.includes(eventId)) {
      onChange(value.filter((x) => x !== eventId));
    } else {
      onChange([...value, eventId]);
    }
  };

  const onTriggerKeyDown = (ev: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (ev.key === "Enter" || ev.key === " " || ev.key === "ArrowDown") {
      ev.preventDefault();
      setOpen((o) => !o);
    }
    if (ev.key === "Escape") setOpen(false);
  };

  const summary = summarizeEventSelection(value, nameById);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        data-testid={triggerTestId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={`flex h-14 min-h-[3.5rem] w-full items-center rounded-2xl border px-4 text-left text-base transition focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:bg-slate-50 ${
          invalid ? "border-rose-400 ring-1 ring-rose-200" : "border-border bg-white"
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${value.length === 0 ? "text-slate-400" : "font-medium text-slate-900"}`}>
          {summary}
        </span>
        <span className="ml-2 shrink-0 text-slate-400" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && !disabled ? (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-10 max-h-72 overflow-hidden rounded-2xl border border-border bg-white shadow-lg"
        >
          <div className="border-b border-border p-2">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") {
                  ev.stopPropagation();
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
              placeholder="Search events…"
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
              aria-label="Search events"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-500">No matching events.</li>
            ) : (
              filtered.map((ev) => {
                const selected = value.includes(ev.id);
                return (
                  <li key={ev.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      data-testid={`add-user-event-option-${ev.id}`}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
                        selected ? "bg-accentSoft/40 font-semibold text-slate-900" : "text-slate-700"
                      }`}
                      onClick={() => toggleId(ev.id)}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          selected ? "border-accent bg-accent text-white" : "border-slate-300 bg-white"
                        }`}
                        aria-hidden
                      >
                        {selected ? "✓" : ""}
                      </span>
                      <span className="min-w-0 truncate">{ev.name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AddUserModal({
  open,
  events,
  exhibitors,
  companies,
  activeCompanyLicensedCompanyIds,
  addUserAction,
  onClose,
  defaultEventId,
  roleOptions = ["platform_admin", "organizer_admin", "exhibitor_admin", "exhibitor_viewer"]
}: AddUserModalProps) {
  const initialRole = roleOptions[0] ?? "exhibitor_admin";
  const companyLicenseSet = useMemo(
    () => new Set(activeCompanyLicensedCompanyIds),
    [activeCompanyLicensedCompanyIds]
  );
  const eventsFieldId = useId();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [role, setRole] = useState<AddUserRoleOption>(initialRole);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [clientError, setClientError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const [state, formAction, isPending] = useActionState<AddUserInviteActionState, FormData>(
    async (_previousState, formData) => addUserAction(formData),
    { ok: false, error: null }
  );

  const isCompanyScopedInvite = role === "exhibitor_admin" || role === "exhibitor_viewer";
  const hasCompanyLicense =
    Boolean(selectedCompanyId) && companyLicenseSet.has(selectedCompanyId);
  const shouldRequireEvent = Boolean(selectedCompanyId) && !hasCompanyLicense;

  const companiesForSelect = useMemo(() => {
    if (companies && companies.length > 0) {
      return [...companies].sort((a, b) => a.name.localeCompare(b.name));
    }
    const seen = new Set<string>();
    const rows: { id: string; name: string }[] = [];
    for (const ex of exhibitors) {
      if (!ex.id || seen.has(ex.id)) continue;
      seen.add(ex.id);
      rows.push({ id: ex.id, name: ex.name });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [companies, exhibitors]);

  const selectedCompanyName = useMemo(
    () => companiesForSelect.find((c) => c.id === selectedCompanyId)?.name ?? "",
    [companiesForSelect, selectedCompanyId]
  );

  const assignableEventsForCompany = useMemo(() => {
    if (!selectedCompanyId) return [];
    const fromExhibitors = new Set(
      exhibitors.filter((e) => e.id === selectedCompanyId).map((e) => e.eventId)
    );
    return events.filter(
      (ev) => fromExhibitors.has(ev.id) || (ev.companyId ?? null) === selectedCompanyId
    );
  }, [selectedCompanyId, exhibitors, events]);

  const eventsForPicker = useMemo(() => {
    if (role === "platform_admin") return events;
    if (!selectedCompanyId) return [];
    return assignableEventsForCompany;
  }, [role, events, selectedCompanyId, assignableEventsForCompany]);

  const effectiveEventId = useMemo(() => {
    if (selectedEventIds.length > 0) return selectedEventIds[0];
    if (selectedCompanyId && isCompanyScopedInvite && shouldRequireEvent) {
      return resolveBootstrapEventId(selectedCompanyId, events, exhibitors);
    }
    return isCompanyScopedInvite ? "" : (events[0]?.id ?? "");
  }, [selectedEventIds, selectedCompanyId, isCompanyScopedInvite, shouldRequireEvent, events, exhibitors]);

  const effectiveEventAccessMode = useMemo(() => {
    if (!isCompanyScopedInvite) return "";
    return hasCompanyLicense ? "all_company_events" : "assigned_events_only";
  }, [isCompanyScopedInvite, hasCompanyLicense]);

  const effectiveAssignedJson = useMemo(() => {
    if (!isCompanyScopedInvite) return "[]";
    return JSON.stringify(selectedEventIds);
  }, [isCompanyScopedInvite, selectedEventIds]);

  const showExhibitorField =
    role === "exhibitor_admin" && isCompanyScopedInvite && shouldRequireEvent;

  const eventsPickerDisabled = !selectedCompanyId || eventsForPicker.length === 0;

  useEffect(() => {
    if (!open) return;
    setFullName("");
    setEmail("");
    setSelectedCompanyId("");
    setRole(initialRole);
    setClientError(null);
    setShowValidation(false);
    const initial =
      defaultEventId && events.some((e) => e.id === defaultEventId) ? [defaultEventId] : [];
    setSelectedEventIds(initial);
  }, [defaultEventId, events, initialRole, open]);

  useEffect(() => {
    setSelectedEventIds((prev) => prev.filter((id) => eventsForPicker.some((e) => e.id === id)));
  }, [eventsForPicker]);

  useEffect(() => {
    if (selectedEventIds.length > 0 || !shouldRequireEvent) {
      setShowValidation(false);
    }
  }, [selectedEventIds.length, shouldRequireEvent]);

  useEffect(() => {
    if (state.ok) {
      onClose();
    }
  }, [onClose, state.ok]);

  if (!open) {
    return null;
  }

  const validateClient = (): string | null => {
    if (!fullName.trim() || !email.trim()) return "Full name and email are required.";
    if (!selectedCompanyId) return "Select a company.";
    if (shouldRequireEvent && selectedEventIds.length === 0) {
      return EVENTS_REQUIRED_SENTINEL;
    }
    if (role === "exhibitor_admin" && shouldRequireEvent) {
      const primary = selectedEventIds[0] ?? "";
      if (primary && !assignableEventsForCompany.some((event) => event.id === primary)) {
        return "Selected company must be an exhibitor on the chosen event(s).";
      }
    }
    return null;
  };

  const eventsInlineInvalid = showValidation && shouldRequireEvent && selectedEventIds.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 py-6 sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="border-b border-border px-6 py-6 sm:px-8">
          <h2 className="text-4xl font-bold">Add User</h2>
        </div>

        <form
          action={formAction}
          className="contents"
          onSubmit={(e) => {
            const err = validateClient();
            if (err) {
              e.preventDefault();
              if (err === EVENTS_REQUIRED_SENTINEL) {
                setClientError(null);
              } else {
                setClientError(err);
              }
              setShowValidation(true);
            } else {
              setClientError(null);
              setShowValidation(false);
            }
          }}
        >
          <div className="space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
            <input type="hidden" name="fullName" value={fullName} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="eventId" value={effectiveEventId} />
            <input type="hidden" name="role" value={roleConfig[role].backendRole} />
            <input type="hidden" name="companyId" value={selectedCompanyId} />
            <input
              type="hidden"
              name="exhibitorCompanyId"
              value={roleConfig[role].requiresExhibitorScope ? selectedCompanyId : ""}
            />
            <input type="hidden" name="permissions" value={JSON.stringify(roleConfig[role].permissions)} />
            <input type="hidden" name="roleKind" value={role} />
            <input type="hidden" name="eventAccessMode" value={effectiveEventAccessMode} />
            <input type="hidden" name="assignedEventIds" value={effectiveAssignedJson} />

            <label className="block space-y-2.5">
              <span className="text-sm font-semibold text-slate-700">Full Name *</span>
              <input
                value={fullName}
                onChange={(ev) => {
                  setFullName(ev.target.value);
                  setClientError(null);
                }}
                placeholder="e.g., John Doe"
                className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <label className="block space-y-2.5">
              <span className="text-sm font-semibold text-slate-700">Email *</span>
              <input
                value={email}
                onChange={(ev) => {
                  setEmail(ev.target.value);
                  setClientError(null);
                }}
                placeholder="e.g., john@company.com"
                className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <label className="block space-y-2.5">
              <span className="text-sm font-semibold text-slate-700">Company *</span>
              <select
                data-testid="add-user-company-select"
                value={selectedCompanyId}
                onChange={(ev) => {
                  setSelectedCompanyId(ev.target.value);
                  setClientError(null);
                  setShowValidation(false);
                }}
                className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="">Select company…</option>
                {companiesForSelect.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="block space-y-2.5">
              <label htmlFor={eventsFieldId} className="text-sm font-semibold text-slate-700">
                Events{shouldRequireEvent ? " *" : ""}
              </label>
              <p className="text-xs text-slate-500">
                {!selectedCompanyId
                  ? "Select a company to load events."
                  : hasCompanyLicense
                    ? "Optional. This company has a company-level license."
                    : "Required. Select at least one event."}
              </p>
              {eventsForPicker.length === 0 && selectedCompanyId ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  {role === "platform_admin"
                    ? "No events available."
                    : "No events linked to this company. Add exhibitor or event linkage."}
                </p>
              ) : null}
              {eventsForPicker.length > 0 ? (
                <SearchableEventMultiSelect
                  id={eventsFieldId}
                  triggerTestId="add-user-events-trigger"
                  options={eventsForPicker}
                  value={selectedEventIds}
                  onChange={(ids) => {
                    setSelectedEventIds(ids);
                    setClientError(null);
                  }}
                  disabled={eventsPickerDisabled}
                  invalid={eventsInlineInvalid}
                />
              ) : null}
              {eventsInlineInvalid ? (
                <p className="text-sm font-medium text-rose-600" role="alert">
                  At least one event is required.
                </p>
              ) : null}
            </div>

            <label className="block space-y-2.5">
              <span className="text-sm font-semibold text-slate-700">Role *</span>
              <div className="space-y-2">
                {roleOptions.map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                      role === option
                        ? "border-accent bg-accentSoft/50"
                        : "border-border bg-white hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role-option"
                      value={option}
                      checked={role === option}
                      onChange={() => {
                        setRole(option);
                        setClientError(null);
                      }}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{roleConfig[option].label}</span>
                      <span className="block text-xs text-slate-600">{roleConfig[option].helper}</span>
                    </span>
                  </label>
                ))}
              </div>
            </label>

            {showExhibitorField ? (
              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">Exhibitor</span>
                <select
                  value={selectedCompanyId}
                  disabled
                  className="h-14 w-full rounded-2xl border border-border bg-slate-50 px-4 text-base text-slate-700"
                >
                  <option value={selectedCompanyId}>{selectedCompanyName || "—"}</option>
                </select>
                <p className="text-xs text-slate-500">Scoped to the selected company for the chosen event(s).</p>
              </label>
            ) : null}

            {clientError || state.error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {clientError ?? state.error}
              </p>
            ) : null}
          </div>

          <div className="border-t border-border px-6 py-5 sm:px-8">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <button type="button" onClick={onClose} className="h-14 rounded-2xl bg-slate-100 text-lg font-semibold text-slate-700 transition hover:bg-slate-200">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="h-14 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-lg font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Sending Invite..." : "Add User & Send Invite"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
