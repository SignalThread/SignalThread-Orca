"use client";

import { Mail, MoreHorizontal, Pencil, Phone, ShieldCheck } from "lucide-react";
import { ObjectTaskStrip } from "@/components/tasks/object-task-strip";
import { statusClasses, statusLabel, type SpeakerRecord } from "./speaker-profile-shared";
import { initialsFor, profileLine } from "./speaker-detail-shared";

export function SpeakerDetailHeader({
  eventId,
  speaker,
  onEditProfile,
}: {
  eventId: string;
  speaker: SpeakerRecord;
  onEditProfile: () => void;
}) {
  return (
    <header className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.07)]">
      <div className="h-1.5 bg-[linear-gradient(90deg,#28439A_0%,#4f46e5_54%,#7c3aed_100%)]" />
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
          {speaker.headshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={speaker.headshotUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded-2xl border border-white object-cover shadow-[0_10px_26px_rgba(15,23,42,0.16)] ring-4 ring-slate-100 sm:h-24 sm:w-24"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white bg-[linear-gradient(135deg,#EEF2FF,#F5F3FF)] text-[24px] font-semibold text-violet-700 shadow-[0_10px_26px_rgba(79,70,229,0.14)] ring-4 ring-slate-100 sm:h-24 sm:w-24 sm:text-[28px]">
              {initialsFor(speaker.name)}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[24px] leading-tight font-semibold tracking-[-0.02em] text-slate-950 sm:text-[28px]">{speaker.name}</h1>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(speaker.status)}`}>
                <ShieldCheck className="mr-1 h-3 w-3" />
                {statusLabel(speaker.status)}
              </span>
            </div>
            <p className="mt-1 truncate text-[14px] text-slate-600">{profileLine(speaker)}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-slate-600">
              {speaker.email ? (
                <a href={`mailto:${speaker.email}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 transition hover:border-violet-200 hover:bg-violet-50 hover:text-[#28439A]">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{speaker.email}</span>
                </a>
              ) : null}
              {speaker.phone ? (
                <a href={`tel:${speaker.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 transition hover:border-violet-200 hover:bg-violet-50 hover:text-[#28439A]">
                  <Phone className="h-3.5 w-3.5" />
                  {speaker.phone}
                </a>
              ) : null}
              {!speaker.email && !speaker.phone ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-slate-500">
                  <Mail className="h-3.5 w-3.5" />
                  No contact details on file
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          <ObjectTaskStrip eventId={eventId} objectType="SPEAKER" objectId={speaker.id} objectLabel={speaker.name} />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            Actions
            <MoreHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onEditProfile}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white shadow-[0_10px_22px_rgba(40,67,154,0.22)] transition hover:bg-[#243d8e] focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            <Pencil className="h-4 w-4" />
            Edit Profile
          </button>
        </div>
      </div>
    </header>
  );
}
