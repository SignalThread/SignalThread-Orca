"use client";

import { CalendarPlus, Plus } from "lucide-react";

type Matrix2Stats = {
  sessions: number;
  speakers: number;
  roomsActive: number;
  conflicts: number;
};

type Matrix2TemplateRailProps = {
  stats: Matrix2Stats;
  isBusy: boolean;
  onOpenAddSession: () => void;
};

export default function Matrix2TemplateRail({ stats, isBusy, onOpenAddSession }: Matrix2TemplateRailProps) {
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-[20px] leading-[24px] font-semibold text-slate-900">Session creation</h3>
      <p className="mt-1 text-[12px] text-slate-500">Add one session or create a small batch from the same flow.</p>

      <button
        type="button"
        onClick={onOpenAddSession}
        disabled={isBusy}
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#28439A] px-3 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Add session
      </button>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
        <p className="inline-flex items-center gap-1 font-semibold text-slate-700">
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Type selection lives inside Add session
        </p>
        <p className="mt-1">Choose keynote, panel, workshop, break, meal, reception, or a custom type after opening the flow.</p>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h4 className="text-[18px] leading-[22px] font-semibold text-slate-900">Event Stats</h4>
        <dl className="mt-3 space-y-2 text-[14px]">
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">Sessions</dt>
            <dd className="font-semibold text-slate-900">{stats.sessions}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">Speakers</dt>
            <dd className="font-semibold text-slate-900">{stats.speakers}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">Rooms Active</dt>
            <dd className="font-semibold text-slate-900">{stats.roomsActive}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">Conflicts</dt>
            <dd className={["font-semibold", stats.conflicts > 0 ? "text-rose-600" : "text-emerald-600"].join(" ")}>
              {stats.conflicts}
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
