"use client";

import { useEffect, useState } from "react";
import { EmptyState, OverviewCard, SectionHeader } from "./speaker-detail-shared";

type SpeakerTimelineEntry = {
  at: string;
  actorType: "PLANNER" | "SPEAKER" | "SYSTEM";
  action: string;
};

const ACTOR_LABELS: Record<SpeakerTimelineEntry["actorType"], string> = {
  PLANNER: "Team",
  SPEAKER: "Speaker",
  SYSTEM: "System",
};

function actorClasses(actorType: SpeakerTimelineEntry["actorType"]): string {
  if (actorType === "SPEAKER") return "border-sky-200 bg-sky-50 text-sky-700";
  if (actorType === "SYSTEM") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

type SpeakerActivitySectionProps = {
  eventId: string;
  speakerId: string;
};

export function SpeakerActivitySection({ eventId, speakerId }: SpeakerActivitySectionProps) {
  const [entries, setEntries] = useState<SpeakerTimelineEntry[]>([]);

  useEffect(() => {
    let isActive = true;

    async function loadActivity() {
      try {
        const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/activity`);
        const payload = await response.json();
        if (!isActive) return;
        setEntries(response.ok && Array.isArray(payload) ? (payload as SpeakerTimelineEntry[]) : []);
      } catch {
        if (!isActive) return;
        setEntries([]);
      }
    }

    void loadActivity();

    return () => {
      isActive = false;
    };
  }, [eventId, speakerId]);

  return (
    <OverviewCard id="activity-section" title={`Activity Timeline (${entries.length})`}>
      <SectionHeader
        eyebrow="Activity"
        title="Timeline"
        body="Everything that has happened with this speaker, newest first."
      />

      {entries.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {entries.map((entry, index) => (
            <li
              key={`${entry.at}-${index}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${actorClasses(entry.actorType)}`}
                >
                  {ACTOR_LABELS[entry.actorType]}
                </span>
                <p className="truncate text-[13px] text-slate-800">{entry.action}</p>
              </div>
              <span className="text-[12px] text-slate-500">{new Date(entry.at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          <EmptyState title="No activity recorded" body="Speaker updates, uploads, submissions, and planner actions will appear here." />
        </div>
      )}
    </OverviewCard>
  );
}
