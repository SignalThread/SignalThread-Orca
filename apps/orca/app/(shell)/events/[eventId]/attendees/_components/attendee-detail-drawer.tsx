"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { shouldGateSessionRegistration } from "@/config/features";
import { SessionRegistrationUnavailableCard } from "@/components/session-registration-unavailable-card";
import {
  MODULE_USAGE_LABELS,
  ROLE_LABELS,
  roleChipClasses,
  uniqueDisplayRoles,
  type DirectoryRole,
} from "../../directory/_components/directory-constants";
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUSES,
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_STATUSES,
  registrationStatusChip,
  SOURCE_LABELS,
  SYNC_LABELS,
  syncStatusChip,
  type AttendanceStatus,
  type AttendeeSource,
  type RegistrationStatus,
  type SyncStatus,
} from "./attendee-constants";

type RegistrationRecord = {
  id: string;
  provider: string;
  externalRegistrationId: string | null;
  externalPersonId: string | null;
  registrationStatus: RegistrationStatus;
  ticketType: string | null;
  syncStatus: SyncStatus;
  writebackStatus: string;
  lastSyncedAt: string | null;
};

export type AttendeeDetail = {
  id: string;
  attendanceStatus: AttendanceStatus;
  registrationStatus: RegistrationStatus;
  registrationType: string | null;
  badgeType: string | null;
  ticketType: string | null;
  source: AttendeeSource;
  syncStatus: SyncStatus;
  notes: string | null;
  person: {
    id: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    title: string | null;
    roles: { id: string; role: DirectoryRole }[];
    moduleLinks: { id: string; module: string }[];
  };
  registrationRecords: RegistrationRecord[];
};

type AgendaEnrollmentStatus = "REGISTERED" | "SELECTED" | "WAITLISTED" | "CANCELLED" | "CHECKED_IN" | "NO_SHOW";

type AgendaEnrollment = {
  id: string;
  matrixRowId: string;
  enrollmentStatus: AgendaEnrollmentStatus;
  session: {
    id: string;
    title: string;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    roomName: string | null;
  } | null;
};

type AgendaSessionOption = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
  sessionName: string;
};

type EditState = {
  firstName: string; lastName: string; email: string; phone: string; company: string; title: string;
  registrationStatus: RegistrationStatus; attendanceStatus: AttendanceStatus;
  registrationType: string; ticketType: string; badgeType: string; notes: string;
};

function toEditState(a: AttendeeDetail): EditState {
  return {
    firstName: a.person.firstName ?? "", lastName: a.person.lastName ?? "", email: a.person.email ?? "",
    phone: a.person.phone ?? "", company: a.person.company ?? "", title: a.person.title ?? "",
    registrationStatus: a.registrationStatus, attendanceStatus: a.attendanceStatus,
    registrationType: a.registrationType ?? "", ticketType: a.ticketType ?? "", badgeType: a.badgeType ?? "", notes: a.notes ?? "",
  };
}

const AGENDA_STATUS_LABELS: Record<AgendaEnrollmentStatus, string> = {
  REGISTERED: "Registered",
  SELECTED: "Selected",
  WAITLISTED: "Waitlisted",
  CANCELLED: "Cancelled",
  CHECKED_IN: "Checked in",
  NO_SHOW: "No-show",
};

function agendaStatusChip(status: AgendaEnrollmentStatus): string {
  if (status === "CHECKED_IN") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "WAITLISTED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "CANCELLED" || status === "NO_SHOW") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function formatAgendaDateTime(date: string | null, startTime: string | null, endTime: string | null): string {
  const dateLabel = date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Date TBD";
  if (!startTime && !endTime) return dateLabel;
  return `${dateLabel} · ${startTime ?? "TBD"}–${endTime ?? "TBD"}`;
}

function sessionOptionSearchText(session: AgendaSessionOption): string {
  return [session.sessionName, session.date, session.startTime, session.endTime, session.room].join(" ").toLowerCase();
}

export function AttendeeDetailDrawer({
  eventId,
  attendeeId,
  onClose,
  onChanged,
}: {
  eventId: string;
  attendeeId: string;
  onClose: () => void;
  onChanged: (message?: string | null) => void;
}) {
  const [attendee, setAttendee] = useState<AttendeeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [agenda, setAgenda] = useState<AgendaEnrollment[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [agendaSessions, setAgendaSessions] = useState<AgendaSessionOption[]>([]);
  const [agendaSessionSearch, setAgendaSessionSearch] = useState("");
  const [selectedAgendaSessionId, setSelectedAgendaSessionId] = useState("");
  const [agendaBusyId, setAgendaBusyId] = useState<string | null>(null);
  const sessionRegistrationComingSoon = shouldGateSessionRegistration();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/attendees/${attendeeId}`, { credentials: "include" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load attendee");
      setAttendee(payload.attendee as AttendeeDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendee");
    }
  }, [eventId, attendeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadAgenda = useCallback(async () => {
    if (sessionRegistrationComingSoon) {
      setAgendaLoading(false);
      setAgendaError(null);
      return;
    }
    setAgendaLoading(true);
    setAgendaError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/attendees/${attendeeId}/agenda`, { credentials: "include" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load agenda");
      setAgenda(Array.isArray(payload?.agenda) ? (payload.agenda as AgendaEnrollment[]) : []);
    } catch (e) {
      setAgendaError(e instanceof Error ? e.message : "Failed to load agenda");
    } finally {
      setAgendaLoading(false);
    }
  }, [eventId, attendeeId, sessionRegistrationComingSoon]);

  const loadAgendaSessions = useCallback(async () => {
    if (sessionRegistrationComingSoon) {
      setAgendaSessions([]);
      return;
    }
    try {
      const res = await fetch(`/api/events/${eventId}/matrix-rows`, { credentials: "include" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? payload?.message ?? "Failed to load sessions");
      setAgendaSessions(Array.isArray(payload?.rows) ? (payload.rows as AgendaSessionOption[]) : []);
    } catch (e) {
      setAgendaError(e instanceof Error ? e.message : "Failed to load sessions");
    }
  }, [eventId, sessionRegistrationComingSoon]);

  useEffect(() => {
    void loadAgenda();
    void loadAgendaSessions();
  }, [loadAgenda, loadAgendaSessions]);

  const filteredAgendaSessions = useMemo(() => {
    const enrolledSessionIds = new Set(agenda.map((item) => item.matrixRowId));
    const query = agendaSessionSearch.trim().toLowerCase();
    return agendaSessions
      .filter((session) => !enrolledSessionIds.has(session.id))
      .filter((session) => !query || sessionOptionSearchText(session).includes(query))
      .slice(0, 30);
  }, [agenda, agendaSessionSearch, agendaSessions]);

  useEffect(() => {
    if (selectedAgendaSessionId && filteredAgendaSessions.some((session) => session.id === selectedAgendaSessionId)) return;
    setSelectedAgendaSessionId(filteredAgendaSessions[0]?.id ?? "");
  }, [filteredAgendaSessions, selectedAgendaSessionId]);

  function startEdit() {
    if (attendee) {
      setEdit(toEditState(attendee));
      setIsEditing(true);
    }
  }

  function setField<K extends keyof EditState>(key: K, value: EditState[K]) {
    setEdit((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/attendees/${attendeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          profile: {
            firstName: edit.firstName || null, lastName: edit.lastName || null, email: edit.email || null,
            phone: edit.phone || null, company: edit.company || null, title: edit.title || null,
          },
          participation: {
            registrationStatus: edit.registrationStatus, attendanceStatus: edit.attendanceStatus,
            registrationType: edit.registrationType || null, ticketType: edit.ticketType || null,
            badgeType: edit.badgeType || null, notes: edit.notes || null,
          },
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to save");
      }
      setIsEditing(false);
      await load();
      onChanged(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function lifecycle(mode: "cancel" | "delete") {
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/attendees/${attendeeId}${mode === "cancel" ? "?mode=cancel" : ""}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Action failed");
      onChanged(mode === "cancel" ? "Attendee registration cancelled." : "Attendee participation removed (Directory person kept).");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setBusy(false);
    }
  }

  async function addAgendaSession() {
    if (sessionRegistrationComingSoon) return;
    if (!selectedAgendaSessionId) return;
    setAgendaBusyId(selectedAgendaSessionId);
    setAgendaError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/attendees/${attendeeId}/agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ matrixRowId: selectedAgendaSessionId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to add session");
      setAgendaSessionSearch("");
      await loadAgenda();
    } catch (e) {
      setAgendaError(e instanceof Error ? e.message : "Failed to add session");
    } finally {
      setAgendaBusyId(null);
    }
  }

  async function cancelAgendaEnrollment(enrollmentId: string) {
    if (sessionRegistrationComingSoon) return;
    setAgendaBusyId(enrollmentId);
    setAgendaError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/attendees/${attendeeId}/agenda/${enrollmentId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to remove session");
      await loadAgenda();
    } catch (e) {
      setAgendaError(e instanceof Error ? e.message : "Failed to remove session");
    } finally {
      setAgendaBusyId(null);
    }
  }

  const hasExternalRegistration = attendee?.registrationRecords.some((r) => r.provider !== "manual") ?? false;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-slate-900">Attendee</h2>
          <div className="flex items-center gap-2">
            {attendee && !isEditing ? (
              <button type="button" onClick={startEdit} className="rounded-md border border-slate-200 px-2 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
            ) : null}
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden /></button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p> : null}
          {!attendee && !error ? <p className="text-[13px] text-slate-500">Loading…</p> : null}

          {attendee && !isEditing ? (
            <>
              <section>
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-semibold text-slate-900">{attendee.person.displayName}</h3>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${registrationStatusChip(attendee.registrationStatus)}`}>{REGISTRATION_STATUS_LABELS[attendee.registrationStatus]}</span>
                </div>
              </section>

              <Section title="Profile (Directory)">
                <dl className="space-y-1 text-[13px] text-slate-600">
                  {attendee.person.email ? <Row label="Email" value={attendee.person.email} /> : null}
                  {attendee.person.phone ? <Row label="Phone" value={attendee.person.phone} /> : null}
                  {attendee.person.company ? <Row label="Company" value={attendee.person.company} /> : null}
                  {attendee.person.title ? <Row label="Title" value={attendee.person.title} /> : null}
                </dl>
              </Section>

              <Section title="Attendance">
                <dl className="space-y-1 text-[13px] text-slate-600">
                  <Row label="Attendance" value={ATTENDANCE_STATUS_LABELS[attendee.attendanceStatus]} />
                  <Row label="Registration" value={REGISTRATION_STATUS_LABELS[attendee.registrationStatus]} />
                  {attendee.registrationType ? <Row label="Type" value={attendee.registrationType} /> : null}
                  {attendee.ticketType ? <Row label="Ticket" value={attendee.ticketType} /> : null}
                  {attendee.badgeType ? <Row label="Badge" value={attendee.badgeType} /> : null}
                  {attendee.notes ? <Row label="Notes" value={attendee.notes} /> : null}
                </dl>
              </Section>

              <Section title="Sessions / Agenda">
                {sessionRegistrationComingSoon ? (
                  <SessionRegistrationUnavailableCard compact />
                ) : (
                <div className="space-y-2">
                  {agendaError ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{agendaError}</p> : null}
                  {agendaLoading ? (
                    <p className="text-[12px] text-slate-400">Loading agenda…</p>
                  ) : agenda.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-[12px] text-slate-400">No sessions added yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {agenda.map((item) => (
                        <li key={item.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-slate-800">{item.session?.title ?? "Untitled session"}</p>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {formatAgendaDateTime(item.session?.date ?? null, item.session?.startTime ?? null, item.session?.endTime ?? null)}
                                {item.session?.roomName ? ` · ${item.session.roomName}` : ""}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${agendaStatusChip(item.enrollmentStatus)}`}>
                              {AGENDA_STATUS_LABELS[item.enrollmentStatus]}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void cancelAgendaEnrollment(item.id)}
                            disabled={agendaBusyId === item.id}
                            className="mt-2 text-[11px] font-semibold text-slate-400 hover:text-rose-600 disabled:opacity-50"
                          >
                            {agendaBusyId === item.id ? "Removing…" : "Remove from agenda"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                    <input
                      type="search"
                      value={agendaSessionSearch}
                      onChange={(event) => setAgendaSessionSearch(event.target.value)}
                      placeholder="Search Run of Show sessions"
                      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] outline-none focus:border-slate-300"
                    />
                    <div className="mt-2 flex gap-2">
                      <select
                        value={selectedAgendaSessionId}
                        onChange={(event) => setSelectedAgendaSessionId(event.target.value)}
                        disabled={filteredAgendaSessions.length === 0}
                        className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-600 disabled:opacity-60"
                      >
                        {filteredAgendaSessions.length === 0 ? (
                          <option value="">No sessions available</option>
                        ) : (
                          filteredAgendaSessions.map((session) => (
                            <option key={session.id} value={session.id}>
                              {session.sessionName || "Untitled session"} · {session.date} · {session.startTime}
                            </option>
                          ))
                        )}
                      </select>
                      <button
                        type="button"
                        onClick={() => void addAgendaSession()}
                        disabled={!selectedAgendaSessionId || agendaBusyId === selectedAgendaSessionId}
                        className="h-8 shrink-0 rounded-md bg-[#28439A] px-2.5 text-[12px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
                )}
              </Section>

              <Section title="Registration / source">
                <p className="mb-1 text-[12px] text-slate-600">
                  Source: {SOURCE_LABELS[attendee.source]} · <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${syncStatusChip(attendee.syncStatus)}`}>{SYNC_LABELS[attendee.syncStatus]}</span>
                </p>
                {attendee.registrationRecords.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No registration record (local/manual attendee).</p>
                ) : (
                  <ul className="space-y-1 text-[12px] text-slate-600">
                    {attendee.registrationRecords.map((r) => (
                      <li key={r.id}>
                        {r.provider}{r.externalRegistrationId ? ` · ${r.externalRegistrationId}` : ""} · {REGISTRATION_STATUS_LABELS[r.registrationStatus]}
                        {r.writebackStatus === "READ_ONLY" ? " · read-only" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Roles">
                <div className="flex flex-wrap gap-1.5">
                  {uniqueDisplayRoles(attendee.person.roles.map((r) => r.role)).map((role) => (
                    <span key={role} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleChipClasses(role)}`}>{ROLE_LABELS[role]}</span>
                  ))}
                </div>
              </Section>

              <Section title="Used in">
                {attendee.person.moduleLinks.length === 0 ? (
                  <p className="text-[12px] text-slate-400">Not linked to Seating, Speaker, or Staff records.</p>
                ) : (
                  <ul className="space-y-1 text-[12px] text-slate-600">
                    {attendee.person.moduleLinks.map((l) => (<li key={l.id}>{MODULE_USAGE_LABELS[l.module] ?? l.module}</li>))}
                  </ul>
                )}
              </Section>
            </>
          ) : null}

          {attendee && isEditing && edit ? (
            <>
              <Section title="Profile (Directory)">
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="First name" value={edit.firstName} onChange={(v) => setField("firstName", v)} />
                  <EditField label="Last name" value={edit.lastName} onChange={(v) => setField("lastName", v)} />
                </div>
                <EditField label="Email" value={edit.email} onChange={(v) => setField("email", v)} />
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="Phone" value={edit.phone} onChange={(v) => setField("phone", v)} />
                  <EditField label="Company" value={edit.company} onChange={(v) => setField("company", v)} />
                </div>
                <EditField label="Title" value={edit.title} onChange={(v) => setField("title", v)} />
              </Section>

              <Section title="Attendance">
                <label className="mt-2 block">
                  <span className="mb-1 block text-[12px] font-medium text-slate-600">Registration status</span>
                  <select value={edit.registrationStatus} onChange={(e) => setField("registrationStatus", e.target.value as RegistrationStatus)} className="h-9 w-full rounded-lg border border-slate-200 px-2 text-[13px]">
                    {REGISTRATION_STATUSES.map((s) => (<option key={s} value={s}>{REGISTRATION_STATUS_LABELS[s]}</option>))}
                  </select>
                </label>
                <label className="mt-2 block">
                  <span className="mb-1 block text-[12px] font-medium text-slate-600">Attendance status</span>
                  <select value={edit.attendanceStatus} onChange={(e) => setField("attendanceStatus", e.target.value as AttendanceStatus)} className="h-9 w-full rounded-lg border border-slate-200 px-2 text-[13px]">
                    {ATTENDANCE_STATUSES.map((s) => (<option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="Registration type" value={edit.registrationType} onChange={(v) => setField("registrationType", v)} />
                  <EditField label="Ticket type" value={edit.ticketType} onChange={(v) => setField("ticketType", v)} />
                </div>
                <EditField label="Badge type" value={edit.badgeType} onChange={(v) => setField("badgeType", v)} />
                <EditField label="Notes" value={edit.notes} onChange={(v) => setField("notes", v)} />
              </Section>

              {hasExternalRegistration ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
                  Provider registration fields are read-only here. Planner OS will not pretend a local edit was written back to the registration platform.
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        {attendee ? (
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            {isEditing ? (
              <>
                <button type="button" onClick={() => setIsEditing(false)} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={() => void save()} disabled={busy} className="h-9 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void lifecycle("cancel")} disabled={busy} className="h-9 rounded-lg border border-amber-200 px-3 text-[13px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">Cancel registration</button>
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-slate-500">Remove participation?</span>
                    <button type="button" onClick={() => void lifecycle("delete")} disabled={busy} className="h-9 rounded-lg bg-rose-600 px-3 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50">Remove</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px] text-slate-600">No</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="h-9 rounded-lg border border-rose-200 px-3 text-[13px] font-semibold text-rose-600 hover:bg-rose-50">Remove attendee</button>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-slate-700">{value}</dd>
    </div>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-2 block">
      <span className="mb-1 block text-[12px] font-medium text-slate-600">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-[13px] outline-none focus:border-slate-300" />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      {children}
    </section>
  );
}
