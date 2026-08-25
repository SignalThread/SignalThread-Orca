import { CalendarDays, Clock, MapPin, Mic2 } from "lucide-react";
import type { SpeakerPortalSession } from "@/src/server/services/speaker-portal";

type SpeakerPortalSessionsProps = {
  sessions: SpeakerPortalSession[];
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatTime(startTime: string | null, endTime: string | null): string {
  if (startTime && endTime) return `${startTime} - ${endTime}`;
  if (startTime) return startTime;
  return "Time coming soon";
}

export function SpeakerPortalSessions({ sessions }: SpeakerPortalSessionsProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            <h2 className="text-[16px] font-semibold text-slate-900">Review your sessions</h2>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            Check where you need to be, when to arrive, and which room you are speaking in.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600">
          {sessions.length} session{sessions.length === 1 ? "" : "s"}
        </span>
      </div>

      {sessions.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {sessions.map((session) => (
            <li key={session.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
              <div className="grid gap-4 p-4 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center">
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {formatDate(session.dayDate).split(",")[0]}
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-slate-950">
                    {formatDate(session.dayDate).replace(/^[^,]+,\s*/, "")}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[16px] font-semibold text-slate-950">
                      {session.sessionName ?? "Untitled session"}
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                      <Mic2 className="h-3 w-3" />
                      Speaker
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-medium text-slate-600">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {formatTime(session.startTime, session.endTime)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {session.roomName ?? "Room coming soon"}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
          <p className="text-[14px] font-semibold text-slate-900">No sessions assigned</p>
          <p className="mt-2 text-[13px] text-slate-500">
            Your event team will add sessions here when your schedule is ready.
          </p>
        </div>
      )}
    </section>
  );
}
