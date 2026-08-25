"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  MODULE_USAGE_LABELS,
  ROLE_LABELS,
  SOURCE_TYPE_LABELS,
  roleChipClasses,
  STATUS_LABELS,
  statusChipClasses,
  type DirectoryRole,
  type DirectoryStatus,
  uniqueDisplayRoles,
} from "./directory-constants";

type PersonDetail = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  status: DirectoryStatus;
  roles: { id: string; role: DirectoryRole; source: { label: string; type: string } | null }[];
  externalIdentities: { id: string; provider: string; syncStatus: string }[];
  moduleLinks: { id: string; module: string; moduleRecordId: string }[];
};

const MODULE_SOURCE_TYPES = new Set(["SPEAKER_MODULE", "SEATING_MODULE", "STAFFING_MODULE"]);

function sourceLabel(source: { label: string; type: string } | null): string | null {
  if (!source) return null;
  if (MODULE_SOURCE_TYPES.has(source.type)) return SOURCE_TYPE_LABELS[source.type] ?? "Backfilled";
  const label = source.label.trim();
  if (/\bmodule\b/i.test(label)) return "Backfilled";
  return label || SOURCE_TYPE_LABELS[source.type] || null;
}

export function PersonDetailDrawer({
  eventId,
  personId,
  onClose,
  onEdit,
}: {
  eventId: string;
  personId: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setPerson(null);
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/directory/people/${personId}`, {
        credentials: "include",
        signal: controller.signal,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load person");
      if (!payload?.person || payload.person.id !== personId) throw new Error("Person details returned an invalid response");
      if (requestId !== requestSequence.current || controller.signal.aborted) return;
      setPerson(payload.person as PersonDetail);
    } catch (e) {
      if (controller.signal.aborted || requestId !== requestSequence.current) return;
      setError(e instanceof Error ? e.message : "Failed to load person");
    } finally {
      if (requestId === requestSequence.current) {
        setIsLoading(false);
        if (activeRequest.current === controller) activeRequest.current = null;
      }
    }
  }, [eventId, personId]);

  useEffect(() => {
    void load();
    return () => activeRequest.current?.abort();
  }, [load]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-slate-900">Person details</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onEdit} disabled={!person || isLoading} className="rounded-md border border-slate-200 px-2 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
              Edit
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => void load()} className="mt-2 rounded-md border border-rose-300 bg-white px-2 py-1 text-[12px] font-semibold hover:bg-rose-100">
                Try again
              </button>
            </div>
          ) : null}
          {isLoading ? <p className="text-[13px] text-slate-500" role="status">Loading person details…</p> : null}

          {person ? (
            <>
              <section>
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-semibold text-slate-900">{person.displayName}</h3>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusChipClasses(person.status)}`}>
                    {STATUS_LABELS[person.status]}
                  </span>
                </div>
                <dl className="mt-2 space-y-1 text-[13px] text-slate-600">
                  {person.email ? <Row label="Email" value={person.email} /> : null}
                  {person.phone ? <Row label="Phone" value={person.phone} /> : null}
                  {person.company ? <Row label="Company" value={person.company} /> : null}
                  {person.title ? <Row label="Title" value={person.title} /> : null}
                </dl>
              </section>

              <Section title="Roles">
                {person.roles.length === 0 ? (
                  <p className="text-[12px] text-slate-400">No roles assigned.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {uniqueDisplayRoles(person.roles.map((role) => role.role)).map((role) => (
                      <span key={role} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleChipClasses(role)}`}>
                        {ROLE_LABELS[role]}
                      </span>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Source">
                <ul className="space-y-1 text-[12px] text-slate-600">
                  {[...new Set(person.roles.map((r) => sourceLabel(r.source)).filter(Boolean))].map((label) => (
                    <li key={label as string}>{label}</li>
                  ))}
                  {person.externalIdentities.map((id) => (
                    <li key={id.id} className="text-slate-500">
                      {id.provider} · <span className="uppercase">{id.syncStatus}</span> (read-only)
                    </li>
                  ))}
                  {person.roles.every((r) => !sourceLabel(r.source)) && person.externalIdentities.length === 0 ? (
                    <li className="text-slate-400">No source info.</li>
                  ) : null}
                </ul>
              </Section>

              <Section title="Used in">
                {person.moduleLinks.length === 0 ? (
                  <p className="text-[12px] text-slate-400">Not yet used by another event module.</p>
                ) : (
                  <ul className="space-y-1 text-[12px] text-slate-600">
                    {person.moduleLinks.map((link) => (
                      <li key={link.id}>{MODULE_USAGE_LABELS[link.module] ?? link.module}</li>
                    ))}
                  </ul>
                )}
              </Section>

              <p className="text-[11px] text-slate-300">Sessions, Seating, and Portal history will appear here in a future release.</p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-slate-700">{value}</dd>
    </div>
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
