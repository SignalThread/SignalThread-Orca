import { CalendarDays, MapPin } from "lucide-react";
import type { SpeakerPortalOnsite, SpeakerPortalSession } from "@/src/server/services/speaker-portal";

const ONSITE_ITEMS: Array<{ key: keyof SpeakerPortalOnsite; label: string }> = [
  { key: "greenRoomLocation", label: "Green room" },
  { key: "arrivalInstructions", label: "Arrival" },
  { key: "badgePickupInfo", label: "Badge / pass pickup" },
  { key: "onsiteContact", label: "Onsite contact" },
  { key: "avRehearsalInfo", label: "AV / rehearsal" },
];

type SpeakerPortalOnsiteProps = {
  sessions: SpeakerPortalSession[];
  onsite: SpeakerPortalOnsite | null;
};

export function SpeakerPortalOnsitePacket({ sessions, onsite }: SpeakerPortalOnsiteProps) {
  const onsiteEntries = onsite
    ? ONSITE_ITEMS.map(({ key, label }) => ({ label, value: onsite[key] })).filter(
        (entry) => entry.value && entry.value.trim(),
      )
    : [];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-slate-500" />
        <h2 className="text-[16px] font-semibold text-slate-900">Onsite Packet</h2>
      </div>
      <p className="mt-1 text-[13px] text-slate-500">
        Your day-of schedule, arrival notes, room details, and onsite help information.
      </p>

      {sessions.length === 0 && onsiteEntries.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
          <p className="text-[14px] font-semibold text-slate-900">No onsite instructions published yet</p>
          <p className="mt-2 text-[13px] text-slate-500">
            Arrival, badge pickup, green room, AV rehearsal, and help details will appear here when the event team publishes them.
          </p>
        </div>
      ) : null}

      {sessions.length > 0 ? (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
            <h3 className="text-[13px] font-semibold text-slate-900">Your schedule</h3>
          </div>
          <ul className="mt-2 space-y-1.5">
            {sessions.map((session) => (
              <li key={session.id} className="rounded-xl border border-slate-200 px-4 py-2.5">
                <p className="text-[13px] font-semibold text-slate-900">
                  {session.sessionName ?? "Untitled session"}
                </p>
                <p className="text-[12px] text-slate-500">
                  {[
                    session.dayDate,
                    session.startTime && session.endTime
                      ? `${session.startTime}–${session.endTime}`
                      : session.startTime,
                    session.roomName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onsiteEntries.length > 0 ? (
        <dl className="mt-4 space-y-2">
          {onsiteEntries.map((entry) => (
            <div key={entry.label} className="rounded-xl bg-slate-50 px-4 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{entry.label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-[13px] text-slate-800">{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
