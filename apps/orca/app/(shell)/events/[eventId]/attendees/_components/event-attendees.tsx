"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";
import {
  ROLE_LABELS,
  roleChipClasses,
  uniqueDisplayRoles,
  type DirectoryRole,
} from "../../directory/_components/directory-constants";
import {
  REGISTRATION_STATUSES,
  REGISTRATION_STATUS_LABELS,
  registrationStatusChip,
  SOURCE_LABELS,
  SYNC_LABELS,
  syncStatusChip,
  type AttendeeSource,
  type RegistrationStatus,
  type SyncStatus,
} from "./attendee-constants";
import { AttendeeFormDrawer } from "./attendee-form-drawer";
import { AttendeeImportModal } from "./attendee-import-modal";
import { AttendeeDetailDrawer } from "./attendee-detail-drawer";

type ListItem = {
  id: string;
  directoryPersonId: string;
  displayName: string;
  email: string | null;
  company: string | null;
  title: string | null;
  roles: DirectoryRole[];
  registrationStatus: RegistrationStatus;
  attendanceStatus: string;
  registrationType: string | null;
  source: AttendeeSource;
  syncStatus: SyncStatus;
  hasRegistrationRecord: boolean;
  moduleUsageCount: number;
  updatedAt: string;
};

type Summary = {
  total: number;
  registered: number;
  pendingWaitlisted: number;
  cancelled: number;
  vipPress: number;
  missingEmail: number;
  needsReview: number;
  syncConflicts: number;
};

type SummaryFilter = "all" | "registered" | "pending" | "cancelled" | "vipPress" | "missingEmail" | "needsReview" | "syncConflicts";

const SOURCE_OPTIONS: AttendeeSource[] = ["MANUAL", "CSV_IMPORT", "REGISTRATION_INTEGRATION", "MARKETING_CAMPAIGN", "BACKFILLED"];
const ROLE_OPTIONS: DirectoryRole[] = ["ATTENDEE", "SPEAKER", "VIP", "PRESS", "SPONSOR_CONTACT", "EXHIBITOR_CONTACT", "STAFF"];

export function EventAttendees({ eventId }: { eventId: string }) {
  const [attendees, setAttendees] = useState<ListItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [registrationFilter, setRegistrationFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("all");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadAttendees = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (registrationFilter) params.set("registrationStatus", registrationFilter);
    if (roleFilter) params.set("role", roleFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    try {
      const res = await fetch(`/api/events/${eventId}/attendees?${params.toString()}`, { credentials: "include" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load attendees");
      setAttendees(payload.attendees as ListItem[]);
      setSummary(payload.summary as Summary);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to load attendees");
    } finally {
      setIsLoading(false);
    }
  }, [eventId, debouncedSearch, registrationFilter, roleFilter, sourceFilter]);

  useEffect(() => {
    void loadAttendees();
  }, [loadAttendees]);

  const filteredAttendees = useMemo(() => {
    if (summaryFilter === "all") return attendees;
    return attendees.filter((a) => {
      switch (summaryFilter) {
        case "registered":
          return a.registrationStatus === "REGISTERED" || a.registrationStatus === "CHECKED_IN";
        case "pending":
          return ["PENDING_APPROVAL", "WAITLISTED", "INVITED"].includes(a.registrationStatus);
        case "cancelled":
          return a.registrationStatus === "CANCELLED";
        case "vipPress":
          return a.roles.includes("VIP") || a.roles.includes("PRESS");
        case "missingEmail":
          return !a.email;
        case "syncConflicts":
          return ["CONFLICT", "WRITEBACK_FAILED", "STALE"].includes(a.syncStatus);
        default:
          return true;
      }
    });
  }, [attendees, summaryFilter]);

  const cards: { key: SummaryFilter; label: string; value: number; alert?: boolean }[] = useMemo(
    () => [
      { key: "all", label: "Total attendees", value: summary?.total ?? 0 },
      { key: "registered", label: "Registered", value: summary?.registered ?? 0 },
      { key: "pending", label: "Pending / waitlisted", value: summary?.pendingWaitlisted ?? 0 },
      { key: "cancelled", label: "Cancelled", value: summary?.cancelled ?? 0 },
      { key: "vipPress", label: "VIP / Press", value: summary?.vipPress ?? 0 },
      { key: "missingEmail", label: "Missing email", value: summary?.missingEmail ?? 0, alert: true },
      { key: "needsReview", label: "Needs review", value: summary?.needsReview ?? 0, alert: true },
      { key: "syncConflicts", label: "Sync conflicts", value: summary?.syncConflicts ?? 0, alert: true },
    ],
    [summary],
  );

  const hasServerFilters = Boolean(debouncedSearch || registrationFilter || roleFilter || sourceFilter);

  return (
    <div className="px-4 py-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">Attendees</h1>
          <p className="text-[13px] text-slate-500">Event participation, registration, and source state — built on the canonical Directory person.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setIsImportOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
            <Upload className="h-3.5 w-3.5" aria-hidden />
            Import CSV
          </button>
          <button type="button" onClick={() => setIsAddOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e]">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add attendee
          </button>
        </div>
      </header>

      {notice ? <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">{notice}</p> : null}
      {errorMessage ? <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">{errorMessage}</p> : null}

      <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label="Attendee summary">
        {cards.map((card) => {
          const isActive = summaryFilter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setSummaryFilter(card.key)}
              className={`rounded-xl border p-2.5 text-left transition ${isActive ? "border-[#28439A] bg-[#28439A]/[0.04]" : card.alert && card.value > 0 ? "border-amber-200" : "border-slate-200"} bg-white hover:border-slate-300`}
            >
              <p className="text-[11px] font-medium text-slate-500">{card.label}</p>
              <p className={`mt-0.5 text-[18px] font-semibold ${card.alert && card.value > 0 ? "text-amber-700" : "text-slate-900"}`}>{card.value}</p>
            </button>
          );
        })}
      </section>

      <section className="mb-3 flex flex-wrap items-center gap-2">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, or company" aria-label="Search attendees" className="h-9 min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-2.5 text-[13px] outline-none focus:border-slate-300 sm:max-w-xs" />
        <select value={registrationFilter} onChange={(e) => setRegistrationFilter(e.target.value)} aria-label="Filter by registration status" className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] text-slate-600">
          <option value="">All registration</option>
          {REGISTRATION_STATUSES.map((s) => (<option key={s} value={s}>{REGISTRATION_STATUS_LABELS[s]}</option>))}
        </select>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role" className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] text-slate-600">
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (<option key={r} value={r}>{ROLE_LABELS[r]}</option>))}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} aria-label="Filter by source" className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] text-slate-600">
          <option value="">All sources</option>
          {SOURCE_OPTIONS.map((s) => (<option key={s} value={s}>{SOURCE_LABELS[s]}</option>))}
        </select>
        {(hasServerFilters || summaryFilter !== "all") ? (
          <button type="button" onClick={() => { setSearch(""); setRegistrationFilter(""); setRoleFilter(""); setSourceFilter(""); setSummaryFilter("all"); }} className="h-9 rounded-lg border border-slate-200 px-2.5 text-[12px] font-medium text-slate-500 hover:bg-slate-50">Clear</button>
        ) : null}
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">Company</th>
              <th className="px-3 py-2 font-semibold">Roles</th>
              <th className="px-3 py-2 font-semibold">Registration</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Source</th>
              <th className="px-3 py-2 font-semibold">Sync</th>
              <th className="px-3 py-2 font-semibold">Used in</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-[13px] text-slate-500">Loading attendees…</td></tr>
            ) : filteredAttendees.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-[13px] text-slate-500">
                  {attendees.length > 0 ? "No attendees match these filters." : "No attendees yet. Add one manually or import a CSV of registrants/expected attendees."}
                </td>
              </tr>
            ) : (
              filteredAttendees.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 text-[13px] hover:bg-slate-50/60">
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setDetailId(a.id)} className="font-medium text-slate-800 hover:underline">{a.displayName}</button>
                    {a.title ? <p className="text-[11px] text-slate-400">{a.title}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{a.email ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{a.company ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {uniqueDisplayRoles(a.roles).map((role) => (
                        <span key={role} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${roleChipClasses(role)}`}>{ROLE_LABELS[role]}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${registrationStatusChip(a.registrationStatus)}`}>{REGISTRATION_STATUS_LABELS[a.registrationStatus]}</span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">{a.registrationType ?? "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">{SOURCE_LABELS[a.source]}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${syncStatusChip(a.syncStatus)}`} title={a.hasRegistrationRecord ? "Has registration record" : "No registration record"}>{SYNC_LABELS[a.syncStatus]}</span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-400">{a.moduleUsageCount > 0 ? `${a.moduleUsageCount} module${a.moduleUsageCount === 1 ? "" : "s"}` : "—"}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setDetailId(a.id)} className="text-[12px] font-medium text-slate-500 hover:text-slate-800">View</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isAddOpen ? <AttendeeFormDrawer eventId={eventId} onClose={() => setIsAddOpen(false)} onSaved={() => { setIsAddOpen(false); void loadAttendees(); }} /> : null}
      {isImportOpen ? <AttendeeImportModal eventId={eventId} onClose={() => setIsImportOpen(false)} onImported={() => void loadAttendees()} /> : null}
      {detailId ? (
        <AttendeeDetailDrawer
          eventId={eventId}
          attendeeId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={(message) => { if (message) setNotice(message); void loadAttendees(); }}
        />
      ) : null}
    </div>
  );
}
