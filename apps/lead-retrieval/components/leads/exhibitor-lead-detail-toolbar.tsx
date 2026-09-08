"use client";

import { type ReactNode } from "react";
import { LeadCardDateField } from "@/components/leads/lead-card-date-field";
import { useLeadProfileToolbarHandlers } from "@/components/leads/lead-profile-toolbar-context";

export function ExhibitorLeadDetailToolbar({
  enrichSlot,
  emailSlot,
  meetingSlot,
  pipedriveSlot
}: {
  enrichSlot: ReactNode;
  emailSlot: ReactNode;
  meetingSlot: ReactNode;
  pipedriveSlot?: ReactNode;
}) {
  const handlers = useLeadProfileToolbarHandlers();

  return (
    <div
      data-lead-detail-toolbar
      className="flex shrink-0 flex-nowrap items-center justify-end gap-1 sm:gap-1.5"
    >
      {handlers?.dirty ? (
        <>
          <button
            type="button"
            onClick={() => void handlers.save()}
            disabled={handlers.saving}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 px-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60 sm:px-3"
          >
            {handlers.saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handlers.reset}
            disabled={handlers.saving}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 sm:px-3"
          >
            Reset
          </button>
        </>
      ) : null}

      <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-1.5">{enrichSlot}</div>

      <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-1.5">{emailSlot}</div>

      <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-1.5">{meetingSlot}</div>

      {pipedriveSlot ? (
        <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-1.5">{pipedriveSlot}</div>
      ) : null}

      <div
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-200/90 bg-white px-1 shadow-sm ring-1 ring-slate-900/[0.05] sm:gap-1.5 sm:px-1.5"
        data-testid="lead-detail-schedule-follow-up"
      >
        <span className="hidden shrink-0 pl-0.5 text-[11px] font-semibold text-slate-600 lg:inline">
          Follow-up
        </span>
        {handlers ? (
          <LeadCardDateField
            variant="toolbar"
            followUpDate={handlers.followUpDate}
            disabled={handlers.saving || handlers.savingFollowUp}
            onCommit={(iso) => void handlers.commitFollowUpDate(iso)}
          />
        ) : (
          <span className="inline-flex h-8 items-center px-2 text-xs text-slate-400">…</span>
        )}
      </div>
    </div>
  );
}
