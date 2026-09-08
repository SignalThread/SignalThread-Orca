"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  LiveCoachingCallout,
  LiveEvidenceRecord,
  LiveInsightModule,
  LiveOperationalNotice
} from "@/lib/events/event-workspace-live-core";

/**
 * Evidence interaction for the Event Workspace: a right-side drawer on the
 * same page. Every evidence-backed claim opens the exact supporting
 * conversation records (human-readable identity + context + timestamp) and
 * links onward to existing lead detail. No raw IDs, no JSON, no ISO strings,
 * and only records the server loader already scoped to this event.
 */

type DrawerState = {
  title: string;
  subtitle: string;
  records: LiveEvidenceRecord[];
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function leadDetailHref(leadId: string, eventId: string): string {
  return `/exhibitor/leads/${encodeURIComponent(leadId)}?eventId=${encodeURIComponent(eventId)}`;
}

function EvidenceDrawer({
  state,
  eventId,
  onClose
}: {
  state: DrawerState;
  eventId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Evidence — ${state.title}`}>
      <button
        type="button"
        aria-label="Close evidence"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-900/30"
      />
      <aside
        data-testid="workspace-evidence-drawer"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Evidence</p>
            <h2 className="mt-0.5 truncate text-base font-bold text-slate-900" title={state.title}>
              {state.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{state.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {state.records.length === 0 ? (
            <p className="text-sm text-slate-500">No supporting records to show.</p>
          ) : (
            <ul className="space-y-3">
              {state.records.map((record) => (
                <li key={record.conversationId} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-slate-800">
                      {record.leadName}
                      {record.leadCompany ? (
                        <span className="font-medium text-slate-400"> · {record.leadCompany}</span>
                      ) : null}
                    </p>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                      {formatTimestamp(record.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{record.context}</p>
                  <Link
                    href={leadDetailHref(record.leadId, eventId)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 transition hover:text-indigo-500"
                  >
                    View lead →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ======================= Live intelligence modules ======================= */

export function LiveIntelligenceModules({
  modules,
  eventId,
  featured = false
}: {
  modules: LiveInsightModule[];
  eventId: string;
  featured?: boolean;
}) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const close = useCallback(() => setDrawer(null), []);

  const openEvidence = (row: LiveInsightModule["rows"][number]) =>
    setDrawer({
      title: row.label,
      subtitle: `Mentioned in ${row.conversationCount} ${row.conversationCount === 1 ? "conversation" : "conversations"}`,
      records: row.evidence
    });

  return (
    <div className={featured ? "space-y-5" : "space-y-4"}>
      {modules.map((module) => {
        return (
          <section key={module.key} data-testid={`workspace-live-module-${module.key}`}>
            {!featured ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{module.title}</h3>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {module.sampleSize} analyzed {module.sampleSize === 1 ? "conversation" : "conversations"}
                  </span>
                </div>
              </>
            ) : null}
            {module.key === "topics" ? <RankedNeedRows rows={module.rows} onEvidence={openEvidence} /> : null}
            {module.key === "objections" ? <ObjectionRows rows={module.rows} onEvidence={openEvidence} /> : null}
            {module.key === "competitors" ? <CompetitorRows rows={module.rows} onEvidence={openEvidence} /> : null}
            {module.key === "buying_signals" ? <MessageInsightRows rows={module.rows} onEvidence={openEvidence} /> : null}
          </section>
        );
      })}
      {drawer ? <EvidenceDrawer state={drawer} eventId={eventId} onClose={close} /> : null}
    </div>
  );
}

type InsightRowsProps = {
  rows: LiveInsightModule["rows"];
  onEvidence: (row: LiveInsightModule["rows"][number]) => void;
};

function EvidenceAction({ row, onEvidence }: { row: LiveInsightModule["rows"][number]; onEvidence: InsightRowsProps["onEvidence"] }) {
  return (
    <button
      type="button"
      onClick={() => onEvidence(row)}
      aria-label={`View evidence for ${row.label}`}
      className="shrink-0 text-xs font-semibold text-indigo-600 transition hover:text-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
    >
      View evidence <span aria-hidden>→</span>
    </button>
  );
}

function CountBadge({ count, tone = "indigo" }: { count: number; tone?: "indigo" | "amber" | "slate" | "violet" }) {
  const tones = {
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    violet: "border-violet-100 bg-violet-50 text-violet-700"
  };
  return (
    <span data-testid="workspace-intelligence-count-badge" className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${tones[tone]}`}>
      {count} {count === 1 ? "conversation" : "conversations"}
    </span>
  );
}

function RankedNeedRows({ rows, onEvidence }: InsightRowsProps) {
  return (
    <ol data-testid="workspace-ranked-needs" className="mt-4 divide-y divide-slate-100">
      {rows.map((row, index) => (
        <li key={row.label} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-[11px] font-bold tabular-nums text-indigo-700">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <h3 className="min-w-0 text-sm font-bold leading-snug text-slate-900 sm:text-[15px]">{row.label}</h3>
              <CountBadge count={row.conversationCount} />
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">A recurring attendee need across captured conversations.</p>
            <div className="mt-2 flex justify-end"><EvidenceAction row={row} onEvidence={onEvidence} /></div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ObjectionRows({ rows, onEvidence }: InsightRowsProps) {
  return (
    <ul data-testid="workspace-objection-rows" className="mt-4 space-y-2">
      {rows.map((row, index) => {
        const strongest = index === 0;
        return (
          <li key={row.label} className={`rounded-xl border px-3 py-2.5 ${strongest ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start gap-2.5">
              <span className={`mt-0.5 text-base font-serif leading-none ${strongest ? "text-amber-600" : "text-slate-400"}`} aria-hidden>“</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-slate-800">{row.label}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <CountBadge count={row.conversationCount} tone="amber" />
                  <EvidenceAction row={row} onEvidence={onEvidence} />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CompetitorRows({ rows, onEvidence }: InsightRowsProps) {
  return (
    <ul data-testid="workspace-competitor-entities" className="mt-4 divide-y divide-slate-100">
      {rows.map((row) => (
        <li key={row.label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600" aria-hidden>
            {row.label.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
              <h3 className="text-sm font-bold leading-snug text-slate-900">{row.label}</h3>
              <CountBadge count={row.conversationCount} tone="slate" />
            </div>
            <div className="mt-1.5 flex justify-end">
              <EvidenceAction row={row} onEvidence={onEvidence} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MessageInsightRows({ rows, onEvidence }: InsightRowsProps) {
  return (
    <ul data-testid="workspace-message-insights" className="mt-4 space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white px-3 py-2.5">
          <h3 className="text-sm font-bold leading-snug text-slate-900">{row.label}</h3>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <CountBadge count={row.conversationCount} tone="violet" />
            <EvidenceAction row={row} onEvidence={onEvidence} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ===================== Completed-event coaching callouts ===================== */

/** Shared by the completed-event recap only; the Live workspace does not render coaching. */
export function CoachingCallouts({
  callouts,
  eventId
}: {
  callouts: LiveCoachingCallout[];
  eventId: string;
}) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const close = useCallback(() => setDrawer(null), []);

  return (
    <>
      <ul className="mt-3 space-y-2">
        {callouts.map((callout) => (
          <li key={callout.pattern}>
            <button
              type="button"
              onClick={() => setDrawer({
                title: callout.pattern,
                subtitle: `Observed in ${callout.conversationCount} ${callout.conversationCount === 1 ? "conversation" : "conversations"}`,
                records: callout.evidence
              })}
              aria-label={`View evidence for ${callout.pattern}`}
              className="block w-full rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-left transition hover:border-slate-200 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <p className="text-sm font-semibold leading-snug text-slate-800">{callout.pattern}</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                Observed in {callout.conversationCount} conversations · view evidence
              </p>
            </button>
          </li>
        ))}
      </ul>
      {drawer ? <EvidenceDrawer state={drawer} eventId={eventId} onClose={close} /> : null}
    </>
  );
}

/* ============================ Operational notice ============================ */

export function OperationalNoticePanel({
  notice,
  eventId
}: {
  notice: LiveOperationalNotice;
  eventId: string;
}) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const close = useCallback(() => setDrawer(null), []);

  return (
    <section
      data-testid="workspace-operational-notice"
      className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 shadow-sm"
    >
      <h2 className="text-base font-bold text-slate-900">Processing attention</h2>
      <p className="mt-1.5 text-sm text-slate-600">
        {notice.failedCount} {notice.failedCount === 1 ? "recording" : "recordings"} failed to process.
      </p>
      <button
        type="button"
        onClick={() =>
          setDrawer({
            title: "Failed recordings",
            subtitle: `${notice.failedCount} affected ${notice.failedCount === 1 ? "conversation" : "conversations"}`,
            records: notice.evidence
          })
        }
        className="mt-2 text-xs font-semibold text-rose-700 transition hover:text-rose-600"
      >
        Review affected conversations →
      </button>
      {drawer ? <EvidenceDrawer state={drawer} eventId={eventId} onClose={close} /> : null}
    </section>
  );
}
