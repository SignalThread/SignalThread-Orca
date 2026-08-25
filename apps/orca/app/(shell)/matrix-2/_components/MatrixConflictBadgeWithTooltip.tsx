"use client";

import { AlertTriangle } from "lucide-react";
import { getPlanningTone } from "@/lib/design/tones";
import type { Matrix2Conflict } from "./types";

export function uniqueConflictsForDisplay(conflicts: Matrix2Conflict[]): Matrix2Conflict[] {
  const seen = new Set<string>();
  const out: Matrix2Conflict[] = [];
  for (const conflict of conflicts) {
    if (seen.has(conflict.id)) continue;
    seen.add(conflict.id);
    out.push(conflict);
  }
  return out;
}

export function uniqueConflictMessages(conflicts: Matrix2Conflict[]): string[] {
  return uniqueConflictsForDisplay(conflicts).map((c) => c.message);
}

export function MatrixConflictTooltipList({ conflicts }: { conflicts: Matrix2Conflict[] }) {
  const items = uniqueConflictsForDisplay(conflicts);
  return (
    <ul className="m-0 max-w-[min(24rem,calc(100vw-2rem))] list-none space-y-1.5 p-0 text-left font-normal">
      {items.map((item) => (
        <li key={item.id} className="flex gap-1.5 text-slate-700">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-500/80" aria-hidden />
          <span>{item.message}</span>
        </li>
      ))}
    </ul>
  );
}

type MatrixConflictBadgeWithTooltipProps = {
  conflicts: Matrix2Conflict[];
  instanceId: string;
};

export function MatrixConflictBadgeWithTooltip({ conflicts, instanceId }: MatrixConflictBadgeWithTooltipProps) {
  if (conflicts.length === 0) return null;

  const tooltipId = `matrix-conflicts-tip-${instanceId}`;
  const lines = uniqueConflictMessages(conflicts);
  const screenReaderSummary = lines.join(". ");
  const conflictTone = getPlanningTone("Conflict", { intent: "conflict" }).className;

  return (
    <span
      className="group/conflicts relative inline-flex align-middle"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span
        tabIndex={0}
        className={`inline-flex cursor-default items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm outline-none transition hover:bg-rose-100/90 focus-visible:ring-2 focus-visible:ring-[#28439A] focus-visible:ring-offset-1 ${conflictTone}`}
        aria-describedby={tooltipId}
      >
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
        {conflicts.length}
      </span>
      <span id={tooltipId} className="sr-only">
        {screenReaderSummary}
      </span>
      <span
        aria-hidden
        className={[
          "pointer-events-none invisible absolute bottom-[calc(100%+6px)] left-0 z-50",
          "w-max min-w-[12rem] max-w-sm rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-[11px] leading-snug shadow-xl ring-1 ring-slate-900/5",
          "opacity-0 transition duration-150",
          "group-hover/conflicts:visible group-hover/conflicts:opacity-100",
          "group-focus-within/conflicts:visible group-focus-within/conflicts:opacity-100",
        ].join(" ")}
      >
        <MatrixConflictTooltipList conflicts={conflicts} />
      </span>
    </span>
  );
}
