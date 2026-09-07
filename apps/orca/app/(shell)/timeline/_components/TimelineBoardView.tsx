"use client";

import type { DragEvent } from "react";
import {
  getPlanningStageLabel,
  getWorkstreamLabel,
  getWorkstreamTheme,
} from "@/lib/timeline/taxonomy";
import {
  getPriorityBadgeClass,
  getPriorityDisplay,
  type TimelineItemRecord,
  type TimelineStatus,
} from "./types";

function workstreamKeyFor(item: TimelineItemRecord): string {
  return item.workstream ?? item.department ?? "";
}

type TimelineBoardViewProps = {
  items: TimelineItemRecord[];
  onMoveStatus: (itemId: string, status: TimelineStatus) => Promise<void>;
  onOpenItem: (itemId: string) => void;
};

type BoardColumn = "NOT_STARTED" | "IN_PROGRESS" | "AT_RISK" | "COMPLETE";

const COLUMNS: Array<{ key: BoardColumn; label: string }> = [
  { key: "NOT_STARTED", label: "Backlog" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "AT_RISK", label: "At Risk" },
  { key: "COMPLETE", label: "Complete" },
];

function formatDueDate(value: string | null): string {
  if (!value) return "No due date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed);
}

function columnForItem(item: TimelineItemRecord): BoardColumn {
  return item.status;
}

function statusForColumn(column: BoardColumn): TimelineStatus {
  return column;
}

function getColumnTone(column: BoardColumn): string {
  if (column === "AT_RISK") return "bg-red-50";
  if (column === "COMPLETE") return "bg-green-50";
  if (column === "IN_PROGRESS") return "bg-blue-50";
  return "bg-slate-50";
}

export default function TimelineBoardView({ items, onMoveStatus, onOpenItem }: TimelineBoardViewProps) {
  function onDropToStatus(event: DragEvent<HTMLElement>, column: BoardColumn) {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/timeline-item-id");
    if (!itemId) return;
    void onMoveStatus(itemId, statusForColumn(column));
  }

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}
    >
      {COLUMNS.map((column) => {
        const columnItems = items.filter((item) => columnForItem(item) === column.key);
        return (
          <section
            key={column.key}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDropToStatus(event, column.key)}
            className={`min-h-[500px] rounded-xl border border-slate-200 p-4 ${getColumnTone(column.key)}`}
          >
            <div className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-800">
              <h3 className="text-sm font-semibold text-slate-800">{column.label}</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{columnItems.length}</span>
            </div>
            <div className="space-y-3">
              {columnItems.map((item) => (
                <article
                  key={item.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/timeline-item-id", item.id)}
                  className="cursor-grab space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:cursor-grabbing"
                >
                  <div className={`h-1 rounded-full ${item.priority === "CRITICAL" ? "bg-red-500" : "bg-blue-500"}`} />
                  <h4 className="truncate text-sm font-semibold text-slate-900" title={item.title}>
                    {item.title}
                  </h4>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex max-w-full items-center rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis ${getWorkstreamTheme(workstreamKeyFor(item)).badge}`}
                      title={getWorkstreamLabel(workstreamKeyFor(item))}
                    >
                      {getWorkstreamLabel(workstreamKeyFor(item))}
                    </span>
                    {item.planningStage ? (
                      <span
                        className="inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 whitespace-nowrap overflow-hidden text-ellipsis"
                        title={getPlanningStageLabel(item.planningStage)}
                      >
                        {getPlanningStageLabel(item.planningStage)}
                      </span>
                    ) : null}
                    <span
                      className={`inline-flex max-w-full items-center rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis ${getPriorityBadgeClass(item.priority)}`}
                      title={getPriorityDisplay(item.priority)}
                    >
                      {getPriorityDisplay(item.priority)}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-slate-600">
                    <span className="shrink-0">{formatDueDate(item.endDate)}</span>
                    <span className="truncate text-right" title={item.ownerUser?.name?.trim() || "Unassigned"}>
                      {item.ownerUser?.name?.trim() || "Unassigned"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenItem(item.id)}
                    className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    aria-label={`Open ${item.title}`}
                  >
                    Open item
                  </button>
                </article>
              ))}
              {columnItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                  Drop items here
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
