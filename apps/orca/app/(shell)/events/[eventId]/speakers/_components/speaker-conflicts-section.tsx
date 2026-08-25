"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { SpeakerConflict } from "@/lib/speaker-conflicts";
import {
  EmptyState,
  OverviewCard,
  SectionHeader,
  type AssignedSessionSummary,
} from "./speaker-detail-shared";

export function SpeakerConflictsSection({
  eventId,
  conflicts,
  sessions,
}: {
  eventId: string;
  conflicts: SpeakerConflict[];
  sessions: AssignedSessionSummary[];
}) {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  return (
    <OverviewCard id="conflicts-section" title={`Conflicts (${conflicts.length})`}>
      <SectionHeader
        eyebrow="Conflicts"
        title="Schedule conflicts"
        body="Conflicts are computed from canonical session assignments."
      />
      {conflicts.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {conflicts.map((conflict) => (
            <li key={`${conflict.speakerId}-${conflict.sessionIds.join("-")}`} className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3">
              <p className="text-[13px] font-semibold text-rose-800">{conflict.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {conflict.sessionIds.map((sessionId) => {
                  const session = sessionsById.get(sessionId);
                  return (
                    <Link key={sessionId} href={`/events/${eventId}/matrix#session-${sessionId}`} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-rose-800 shadow-sm hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-100">
                      {session?.title ?? "Impacted session"}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyState title="No conflicts" body="This speaker has no computed schedule conflicts." />
        </div>
      )}
    </OverviewCard>
  );
}
