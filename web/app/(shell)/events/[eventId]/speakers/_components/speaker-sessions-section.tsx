"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { SpeakerConflict } from "@/lib/speaker-conflicts";
import {
  EmptyState,
  formatDate,
  OverviewCard,
  SectionHeader,
  type AssignedSessionSummary,
} from "./speaker-detail-shared";

export function SpeakerSessionsSection({
  eventId,
  sessions,
  conflicts,
}: {
  eventId: string;
  sessions: AssignedSessionSummary[];
  conflicts: SpeakerConflict[];
}) {
  const conflictedSessionIds = new Set(conflicts.flatMap((conflict) => conflict.sessionIds));

  return (
    <OverviewCard id="sessions-section" title={`Assigned Sessions (${sessions.length})`}>
      <SectionHeader
        eyebrow="Run of Show"
        title="Assigned sessions"
        body="Assignments are read from the canonical Run of Show speaker assignment data."
      />
      {sessions.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {sessions.map((session) => (
            <li key={session.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 md:grid-cols-[70px_minmax(0,1fr)_auto] md:items-center">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1.5 text-center">
                <p className="text-[11px] font-semibold uppercase text-slate-500">{formatDate(session.date).split(" ")[0]}</p>
                <p className="text-[16px] font-semibold text-slate-900">{formatDate(session.date).split(" ")[1]?.replace(",", "")}</p>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[14px] font-semibold text-slate-950">{session.title}</p>
                  {conflictedSessionIds.has(session.id) ? (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Conflict</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] text-slate-500">
                  {session.startTime} - {session.endTime} · {session.roomName} · {session.sessionType} · {session.status}
                </p>
              </div>
              <Link href={`/events/${eventId}/matrix#session-${session.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100">
                Open in Run of Show
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No assigned sessions" body="Assign this speaker from the Run of Show speaker quick edit flow." />
      )}
    </OverviewCard>
  );
}
