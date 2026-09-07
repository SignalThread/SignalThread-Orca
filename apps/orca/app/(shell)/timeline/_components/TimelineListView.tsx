"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleSlash2, CornerDownRight, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColumnHeaderDragHandle,
  useColumnHeaderReorder,
  usePersistedColumnOrder,
  type ColumnOrderItem,
} from "@/components/column-order-control";
import { DateField } from "@/components/date-field";
import {
  BULK_ACTION_BAR_CLASS,
  BULK_CLEAR_BUTTON_CLASS,
  BULK_CONTROL_CLASS,
  BULK_DELETE_BUTTON_CLASS,
  BULK_SELECTED_COUNT_CLASS,
  BULK_SELECTED_TABLE_ROW_CLASS,
  TABLE_CONTROL_BUTTON_CLASS,
  TABLE_CONTROL_ROW_CLASS,
  TABLE_FILTER_CONTROL_CLASS,
  TABLE_FILTER_PANEL_CLASS,
  TABLE_SEARCH_FIELD_CLASS,
} from "@/lib/bulk-edit-ui";
import { formatTimelineDateOnly, normalizeTimelineDateInput } from "@/lib/timeline/date-normalization";
import { buildTimelineChildRollups, type TimelineChildRollup } from "@/lib/timeline/rollup";
import {
  PLANNING_STAGE_LABELS,
  TIMELINE_PLANNING_STAGES,
  buildTimelineWorkstreamOptions,
  getWorkstreamDisplayKey,
  getPlanningStageLabel,
  getWorkstreamLabel,
  getWorkstreamTheme,
  normalizeWorkstreamLabel,
  resolveWorkstream,
  type TimelineWorkstreamOption,
} from "@/lib/timeline/taxonomy";
import {
  getPriorityBadgeClass,
  getPriorityDisplay,
  getStatusBadgeClass,
  getStatusDisplay,
  isRootTimelineItem,
  type TimelineItemPatch,
  type TimelineItemRecord,
  type TimelineOwnerOption,
  type TimelinePlanningStage,
  type TimelinePriority,
  type TimelineStatus,
} from "./types";
import { useVirtualRows } from "./useVirtualRows";

// Above this many filtered rows the List windows its rows; smaller timelines
// render statically to avoid any virtualization overhead/edge cases.
const LIST_VIRTUALIZATION_THRESHOLD = 100;
// Row pitch: h-14 row body (56px) + border-spacing-y-2 gap (8px).
const LIST_ROW_HEIGHT = 64;

type TimelineListViewProps = {
  eventId: string;
  items: TimelineItemRecord[];
  canEdit: boolean;
  onSaveRow: (itemId: string, patch: TimelineItemPatch) => Promise<void>;
  onDeleteTask: (itemId: string) => void;
  onAddSubtask: (parent: TimelineItemRecord) => void;
  onReorder: (item: TimelineItemRecord, direction: "up" | "down") => Promise<void>;
  onBulkUpdate: (itemIds: string[], patch: TimelineItemPatch) => Promise<{ updatedCount: number; skippedCount: number }>;
  onBulkDelete: (itemIds: string[]) => Promise<{ deletedCount: number; skippedCount: number }>;
  onRefreshItem: (itemId: string) => Promise<TimelineItemRecord | null>;
  ownerOptions: TimelineOwnerOption[];
  filtersOpen: boolean;
  workstreamFilter?: string | "ALL" | "UNASSIGNED";
  onWorkstreamFilterChange?: (workstream: string | "ALL" | "UNASSIGNED") => void;
};

type TimelineListColumnId =
  | "workstream"
  | "planningStage"
  | "status"
  | "progress"
  | "priority"
  | "ownerUserId"
  | "startDate"
  | "endDate"
  | "isCriticalPath";

const TIMELINE_LIST_COLUMNS: ColumnOrderItem<TimelineListColumnId>[] = [
  { id: "workstream", label: "Workstream" },
  { id: "planningStage", label: "Stage" },
  { id: "status", label: "Status" },
  { id: "progress", label: "Progress" },
  { id: "priority", label: "Priority" },
  { id: "ownerUserId", label: "Owner" },
  { id: "startDate", label: "Start Date" },
  { id: "endDate", label: "Due Date" },
  { id: "isCriticalPath", label: "CP" },
];

const TIMELINE_PINNED_COLUMNS: ColumnOrderItem[] = [
  { id: "select", label: "Selection" },
  { id: "title", label: "Item" },
];

const TIMELINE_COLUMN_WIDTHS: Record<TimelineListColumnId, string> = {
  workstream: "w-[140px]",
  planningStage: "w-[140px]",
  status: "w-[130px]",
  progress: "w-[120px]",
  priority: "w-[110px]",
  ownerUserId: "w-[170px]",
  startDate: "w-[140px]",
  endDate: "w-[140px]",
  isCriticalPath: "w-[70px]",
};

type EditableField =
  | "title"
  | "notes"
  | "workstream"
  | "planningStage"
  | "status"
  | "progress"
  | "priority"
  | "ownerUserId"
  | "startDate"
  | "endDate";

type EditingCell = {
  itemId: string;
  field: EditableField;
};

type TimelineSaveError = Error & {
  fieldErrors?: Partial<Record<EditableField, string>>;
};

const STATUS_OPTIONS: TimelineStatus[] = ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "COMPLETE"];
const PRIORITY_OPTIONS: TimelinePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

type TimelineListFilters = {
  search: string;
  status: TimelineStatus | "";
  workstream: string | "ALL" | "UNASSIGNED";
  planningStage: TimelinePlanningStage | "ALL" | "UNASSIGNED";
  priority: TimelinePriority | "";
  ownerUserId: string;
  criticalPath: "ALL" | "ONLY";
  needsAssignment: boolean;
  disposition: "ALL" | "ACTIVE" | "NOT_NEEDED";
};

const EMPTY_FILTERS: TimelineListFilters = {
  search: "",
  status: "",
  workstream: "ALL",
  planningStage: "ALL",
  priority: "",
  ownerUserId: "",
  criticalPath: "ALL",
  needsAssignment: false,
  disposition: "ALL",
};

function subtaskGroupId(parentId: string): string {
  return `timeline-subtasks-${parentId}`;
}

function cellKey(itemId: string, field: string): string {
  return `${itemId}:${field}`;
}

function toDateInput(value: string | null): string {
  return normalizeTimelineDateInput(value) ?? "";
}

function formatDate(value: string | null): string {
  return formatTimelineDateOnly(value) || "No date";
}

function itemMatchesFilters(item: TimelineItemRecord, filters: TimelineListFilters): boolean {
  const query = filters.search.trim().toLowerCase();
  if (query) {
    const haystack = [
      item.title,
      item.notes ?? "",
      item.ownerUser?.name ?? "",
      item.ownerUser?.email ?? "",
    ].join(" ").toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  if (filters.status && item.status !== filters.status) return false;
  if (filters.priority && item.priority !== filters.priority) return false;
  if (filters.ownerUserId) {
    if (filters.ownerUserId === "UNASSIGNED") {
      if (item.ownerUser?.id) return false;
    } else if (item.ownerUser?.id !== filters.ownerUserId) {
      return false;
    }
  }
  if (filters.criticalPath === "ONLY" && !item.isCriticalPath) return false;
  if (filters.needsAssignment && (item.workstream || item.department) && item.planningStage && item.ownerUser?.id) return false;
  if (filters.disposition !== "ALL" && item.disposition !== filters.disposition) return false;

  if (filters.workstream !== "ALL") {
    const resolved = getWorkstreamDisplayKey(item.workstream ?? item.department);
    if (filters.workstream === "UNASSIGNED") {
      if (resolved) return false;
    } else if (resolved !== filters.workstream) {
      return false;
    }
  }

  if (filters.planningStage !== "ALL") {
    if (filters.planningStage === "UNASSIGNED") {
      if (item.planningStage) return false;
    } else if (item.planningStage !== filters.planningStage) {
      return false;
    }
  }

  return true;
}

function countActiveFilters(filters: TimelineListFilters): number {
  return [
    filters.search.trim(),
    filters.status,
    filters.workstream !== "ALL" ? filters.workstream : "",
    filters.planningStage !== "ALL" ? filters.planningStage : "",
    filters.priority,
    filters.ownerUserId,
    filters.criticalPath !== "ALL" ? filters.criticalPath : "",
    filters.needsAssignment ? "needsAssignment" : "",
    filters.disposition !== "ALL" ? filters.disposition : "",
  ].filter(Boolean).length;
}

function ownerLabel(owner: Pick<TimelineOwnerOption, "name" | "email">): string {
  return `${owner.name?.trim() || owner.email} — ${owner.email}`;
}

function getCellSeedValue(item: TimelineItemRecord, field: EditableField): string {
  switch (field) {
    case "title": return item.title;
    case "notes": return item.notes ?? "";
    case "workstream": return getWorkstreamDisplayKey(item.workstream ?? item.department) ?? "";
    case "planningStage": return item.planningStage ?? "";
    case "status": return item.status;
    case "progress": return item.status === "COMPLETE" ? "100" : item.progress?.toString() ?? "";
    case "priority": return item.priority;
    case "ownerUserId": return item.ownerUser?.id ?? "";
    case "startDate": return toDateInput(item.startDate);
    case "endDate": return toDateInput(item.endDate);
  }
}

function buildWorkstreamPatch(value: string, options: TimelineWorkstreamOption[]): TimelineItemPatch {
  if (!value) return { workstream: null, department: null };
  const option = options.find((candidate) => candidate.value === value);
  if (option) {
    return { workstream: option.workstream, department: option.department };
  }
  const canonical = resolveWorkstream(value);
  return canonical
    ? { workstream: canonical, department: null }
    : { workstream: null, department: normalizeWorkstreamLabel(value) || null };
}

function buildPatch(
  field: EditableField,
  value: string,
  item: TimelineItemRecord,
  workstreamOptions: TimelineWorkstreamOption[] = [],
): TimelineItemPatch {
  switch (field) {
    case "title":
      return { title: value.trim() || "New Timeline Item" };
    case "notes":
      return { notes: value.trim() || null };
    case "workstream":
      return buildWorkstreamPatch(value, workstreamOptions);
    case "planningStage":
      return { planningStage: (value as TimelinePlanningStage) || null };
    case "status":
      return { status: value as TimelineStatus };
    case "progress": {
      if (!value.trim()) return { progress: null };
      const progress = Number(value);
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        throw new Error("Progress must be a whole number from 0 to 100");
      }
      return { progress };
    }
    case "priority":
      return { priority: value as TimelinePriority };
    case "ownerUserId":
      return { ownerUserId: value || null };
    case "startDate": {
      const startDate = normalizeTimelineDateInput(value);
      const endDate = normalizeTimelineDateInput(item.endDate);
      if (startDate && endDate && endDate < startDate) {
        return { startDate, endDate: startDate };
      }
      return { startDate };
    }
    case "endDate": {
      const endDate = normalizeTimelineDateInput(value);
      return { endDate };
    }
  }
}

// Shared stable references so non-editing / non-saving rows receive the same
// prop identity every render and React.memo can skip re-rendering them.
const EMPTY_SAVING_FIELDS: ReadonlySet<string> = new Set();
const EMPTY_CELL_ERRORS: ReadonlyMap<string, string> = new Map();

type TimelineListRowProps = {
  item: TimelineItemRecord;
  columnOrder: TimelineListColumnId[];
  canEdit: boolean;
  isSelected: boolean;
  editingField: EditableField | null;
  draftValue: string;
  savingFields: ReadonlySet<string>;
  errorFields: ReadonlyMap<string, string>;
  workstreamOptions: TimelineWorkstreamOption[];
  ownerOptions: { id: string; label: string }[];
  onToggleSelect: (itemId: string) => void;
  onBeginEdit: (item: TimelineItemRecord, field: EditableField) => void;
  onCommitCell: (
    itemId: string,
    field: EditableField,
    value: string,
    item: TimelineItemRecord,
    focusTarget?: "current" | "next",
  ) => void;
  onCancelEdit: () => void;
  onDraftChange: (value: string) => void;
  onTextKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>,
    itemId: string,
    field: EditableField,
    item: TimelineItemRecord,
  ) => void;
  onEditorKeyDown: (
    event: React.KeyboardEvent<HTMLElement>,
    itemId: string,
    field: EditableField,
    item: TimelineItemRecord,
  ) => void;
  onCommitCriticalPath: (itemId: string, checked: boolean) => void;
  onDeleteTask: (itemId: string) => void;
  onAddSubtask: (parent: TimelineItemRecord) => void;
  onToggleSubtasks: (parent: TimelineItemRecord) => void;
  isExpanded: boolean;
  onReorder: (item: TimelineItemRecord, direction: "up" | "down") => void;
  onOpenDisposition: (item: TimelineItemRecord, trigger: HTMLButtonElement) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  childRollup: TimelineChildRollup | null;
};

// One Timeline list row, extracted and memoized so that editing/selecting one
// row does not re-render every other row. It owns no state: all editing,
// selection, saving, and error state stays in TimelineListView and arrives as
// per-row primitives + stable callbacks.
const TimelineListRow = memo(function TimelineListRow({
  item,
  columnOrder,
  canEdit,
  isSelected,
  editingField,
  draftValue,
  savingFields,
  errorFields,
  workstreamOptions,
  ownerOptions,
  onToggleSelect,
  onBeginEdit,
  onCommitCell,
  onCancelEdit,
  onDraftChange,
  onTextKeyDown,
  onEditorKeyDown,
  onCommitCriticalPath,
  onDeleteTask,
  onAddSubtask,
  onToggleSubtasks,
  isExpanded,
  onReorder,
  onOpenDisposition,
  canMoveUp,
  canMoveDown,
  childRollup,
}: TimelineListRowProps) {
  const isEditing = (field: EditableField) => editingField === field;
  const isSaving = (field: string) => savingFields.has(field);
  const getCellError = (field: string) => errorFields.get(field) ?? null;
  const ownerStillEligible = !item.ownerUser?.id || ownerOptions.some((owner) => owner.id === item.ownerUser?.id);
  // Child rows need their own surface: every cell sets bg-white, so a tint on the <tr> was
  // painted over and children rendered identically to parents.
  const cellTone = item.parentId ? "bg-slate-50" : "bg-white";
  return (
    <tr
      key={item.id}
      id={item.parentId ? undefined : subtaskGroupId(item.id)}
      data-timeline-subtask-row={item.parentId ? "true" : undefined}
      className={[
        "group h-14 text-sm text-slate-700",
        isSelected ? BULK_SELECTED_TABLE_ROW_CLASS : "",
        item.parentId ? "shadow-[inset_3px_0_0_0_rgb(148,163,184)]" : "",
      ].join(" ")}
    >
      <td className={`w-[48px] rounded-l-lg border-y border-l border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm`}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item.id)}
          disabled={!canEdit}
          aria-label={`Select ${item.title}`}
          className="h-4 w-4 rounded border-slate-300 accent-blue-700 disabled:opacity-60"
        />
      </td>
      {/* ── Title ── */}
      <td className={`relative w-[280px] border-y border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm`}>
        {isEditing("title") ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              data-timeline-inline-editor="true"
              value={draftValue}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => onTextKeyDown(e, item.id, "title", item)}
              className="w-full rounded border border-blue-400 px-2 py-1 text-sm outline-none ring-1 ring-blue-300"
              aria-label={`Edit title for ${item.title}`}
            />
          </div>
        ) : (
          <div className={`flex items-center justify-between gap-1 ${item.parentId ? "pl-[4.5rem]" : ""}`}>
            {item.parentId ? (
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-[3.5rem] w-6">
                {/* Vertical guide down from the parent, then an elbow into this child. */}
                <span className="absolute left-0 top-0 h-1/2 w-px bg-slate-300" />
                <span className="absolute left-0 top-1/2 h-px w-4 bg-slate-300" />
              </span>
            ) : null}
            <span className="flex min-w-0 items-center gap-1">
            {childRollup ? (
              <button
                type="button"
                data-timeline-subtask-toggle={item.id}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleSubtasks(item); }}
                aria-expanded={isExpanded}
                aria-controls={subtaskGroupId(item.id)}
                aria-label={`${isExpanded ? "Collapse" : "Expand"} subtasks for ${item.title}`}
                title={`${isExpanded ? "Collapse" : "Expand"} subtasks`}
                className="-my-1 -ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-[15px] leading-none text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
              </button>
            ) : item.parentId ? null : (
              // Keeps titles of childless parents aligned with expandable ones.
              <span className="-ml-1 h-8 w-8 shrink-0" aria-hidden />
            )}
            <button
              type="button"
              data-timeline-edit-cell={cellKey(item.id, "title")}
              onClick={() => onBeginEdit(item, "title")}
              disabled={!canEdit}
              className={`truncate text-left font-medium text-slate-800 ${canEdit ? "hover:text-blue-700" : "cursor-default"}`}
              title={
                !canEdit
                  ? item.title
                  : "Click to edit title"
              }
            >
              {isSaving("title") ? (
                <span className="flex items-center gap-1 text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {item.title}
                </span>
              ) : item.title}
            </button>
            {item.parentId ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-slate-200/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                <CornerDownRight className="h-2.5 w-2.5" aria-hidden />
                Subtask
              </span>
            ) : null}
            </span>
            {item.notes ? (
              <span className="sr-only">Notes: {item.notes}</span>
            ) : null}
            {getCellError("title") ? (
              <span className="text-[10px] text-rose-600" title={getCellError("title") ?? ""}>!</span>
            ) : null}
            {item.disposition === "NOT_NEEDED" ? <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700" title={item.dispositionReason ?? "Not Needed"}>Not Needed</span> : null}
            {canEdit ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAddSubtask(item); }}
                className="shrink-0 rounded p-1 text-blue-700 opacity-100 transition-opacity hover:bg-blue-50 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                title="Add subtask"
                aria-label={`Add subtask to ${item.title}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {canEdit ? <span className="flex shrink-0 items-center">
              <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReorder(item, "up"); }} disabled={!canMoveUp} aria-label={`Move ${item.title} up`} title="Move up" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" aria-hidden /></button>
              <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReorder(item, "down"); }} disabled={!canMoveDown} aria-label={`Move ${item.title} down`} title="Move down" className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" aria-hidden /></button>
              <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenDisposition(item, event.currentTarget); }} aria-label={item.disposition === "NOT_NEEDED" ? `Restore ${item.title}` : `Mark ${item.title} Not Needed`} title={item.disposition === "NOT_NEEDED" ? "Restore" : "Mark as Not Needed"} className="rounded p-1 text-slate-500 hover:bg-slate-100"><CircleSlash2 className="h-3.5 w-3.5" aria-hidden /></button>
            </span> : null}
            {canEdit ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDeleteTask(item.id); }}
                className="shrink-0 rounded p-1 text-rose-600 opacity-0 transition-opacity hover:bg-rose-50 group-hover:opacity-100"
                title="Delete item"
                aria-label="Delete item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        )}
        {getCellError("title") && !isEditing("title") ? (
          <p className="mt-0.5 text-[10px] text-rose-600">{getCellError("title")}</p>
        ) : null}
        {isEditing("notes") ? (
          <textarea
            autoFocus
            data-timeline-inline-editor="true"
            value={draftValue}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCancelEdit();
              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void onCommitCell(item.id, "notes", draftValue, item);
              }
            }}
            rows={3}
            maxLength={10_000}
            aria-label={`Edit notes for ${item.title}`}
            className="mt-1 w-full resize-y rounded border border-blue-400 px-2 py-1 text-[11px] outline-none ring-1 ring-blue-300"
          />
        ) : (
          <button
            type="button"
            data-timeline-edit-cell={cellKey(item.id, "notes")}
            onClick={() => onBeginEdit(item, "notes")}
            disabled={!canEdit}
            className={`mt-0.5 block max-w-full truncate text-left text-[10px] text-slate-500 ${canEdit ? "hover:text-blue-700" : "cursor-default"}`}
            title={item.notes ?? (canEdit ? "Add notes" : "No notes")}
            aria-label={`${item.notes ? "Edit" : "Add"} notes for ${item.title}`}
          >
            {item.notes || (canEdit ? "Add notes" : "—")}
          </button>
        )}
        {getCellError("notes") ? <p className="mt-0.5 text-[10px] text-rose-600">{getCellError("notes")}</p> : null}
        {childRollup ? (
          <button
            type="button"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleSubtasks(item); }}
            aria-expanded={isExpanded}
            aria-controls={subtaskGroupId(item.id)}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} subtasks for ${item.title}, ${childRollup.completeCount} of ${childRollup.childCount} complete`}
            className="mt-0.5 block rounded pl-6 text-left text-[10px] font-medium text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {childRollup.completeCount}/{childRollup.childCount} subtasks complete · {childRollup.percentComplete}%
          </button>
        ) : null}
      </td>

      {columnOrder.map((columnId) => {
        switch (columnId) {
          case "workstream":
            return (
              <td key={columnId} className={`w-[140px] border-y border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm`}>
                {isEditing("workstream") ? (
                  <select autoFocus data-timeline-inline-editor="true" value={draftValue} onChange={(e) => void onCommitCell(item.id, "workstream", e.target.value, item)} onKeyDown={(e) => onEditorKeyDown(e, item.id, "workstream", item)} className="w-full rounded border border-blue-400 px-1.5 py-1 text-xs outline-none" aria-label="Workstream">
                    <option value="">Unassigned</option>
                    {workstreamOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <button type="button" data-timeline-edit-cell={cellKey(item.id, "workstream")} onClick={() => onBeginEdit(item, "workstream")} disabled={!canEdit} className={`rounded-full px-2 py-1 text-xs font-medium ${getWorkstreamTheme(item.workstream ?? item.department).badge} ${canEdit ? "hover:opacity-80" : "cursor-default"}`}>
                    {isSaving("workstream") ? <span className="flex items-center gap-1 opacity-50"><Loader2 className="h-3 w-3 animate-spin" />{getWorkstreamLabel(item.workstream ?? item.department)}</span> : getWorkstreamLabel(item.workstream ?? item.department)}
                  </button>
                )}
                {getCellError("workstream") ? <p className="mt-0.5 text-[10px] text-rose-600">{getCellError("workstream")}</p> : null}
              </td>
            );
          case "planningStage":
            return (
              <td key={columnId} className={`w-[140px] border-y border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm`}>
                {isEditing("planningStage") ? (
                  <select autoFocus data-timeline-inline-editor="true" value={draftValue} onChange={(e) => void onCommitCell(item.id, "planningStage", e.target.value, item)} onKeyDown={(e) => onEditorKeyDown(e, item.id, "planningStage", item)} className="w-full rounded border border-blue-400 px-1.5 py-1 text-xs outline-none" aria-label="Planning stage">
                    <option value="">Unscheduled</option>
                    {TIMELINE_PLANNING_STAGES.map((s) => <option key={s} value={s}>{PLANNING_STAGE_LABELS[s]}</option>)}
                  </select>
                ) : (
                  <button type="button" data-timeline-edit-cell={cellKey(item.id, "planningStage")} onClick={() => onBeginEdit(item, "planningStage")} disabled={!canEdit} className={`text-left text-xs text-slate-600 ${canEdit ? "hover:text-blue-700" : "cursor-default"}`}>
                    {isSaving("planningStage") ? <span className="flex items-center gap-1 opacity-50"><Loader2 className="h-3 w-3 animate-spin" />{item.planningStage ? getPlanningStageLabel(item.planningStage) : "—"}</span> : (item.planningStage ? getPlanningStageLabel(item.planningStage) : "—")}
                  </button>
                )}
                {getCellError("planningStage") ? <p className="mt-0.5 text-[10px] text-rose-600">{getCellError("planningStage")}</p> : null}
              </td>
            );
          case "status":
            return (
              <td key={columnId} className={`w-[130px] border-y border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm`}>
                {isEditing("status") ? (
                  <select autoFocus data-timeline-inline-editor="true" value={draftValue} onChange={(e) => void onCommitCell(item.id, "status", e.target.value, item)} onKeyDown={(e) => onEditorKeyDown(e, item.id, "status", item)} className="w-full rounded border border-blue-400 px-1.5 py-1 text-xs outline-none" aria-label="Status">
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{getStatusDisplay(s)}</option>)}
                  </select>
                ) : (
                  <button type="button" data-timeline-edit-cell={cellKey(item.id, "status")} onClick={() => onBeginEdit(item, "status")} disabled={!canEdit} className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeClass(item.status)} ${canEdit ? "hover:opacity-80" : "cursor-default"}`}>
                    {isSaving("status") ? <span className="flex items-center gap-1 opacity-50"><Loader2 className="h-3 w-3 animate-spin" />{getStatusDisplay(item.status)}</span> : getStatusDisplay(item.status)}
                  </button>
                )}
                {getCellError("status") ? <p className="mt-0.5 text-[10px] text-rose-600">{getCellError("status")}</p> : null}
              </td>
            );
          case "progress":
            return (
              <td key={columnId} className={`w-[120px] border-y border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm`}>
                {isEditing("progress") ? (
                  <input
                    autoFocus
                    data-timeline-inline-editor="true"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={draftValue}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onKeyDown={(event) => onTextKeyDown(event, item.id, "progress", item)}
                    className="w-full rounded border border-blue-400 px-2 py-1 text-xs outline-none"
                    aria-label={`Progress for ${item.title}`}
                  />
                ) : (
                  <button type="button" data-timeline-edit-cell={cellKey(item.id, "progress")} onClick={() => onBeginEdit(item, "progress")} disabled={!canEdit || item.status === "COMPLETE"} className={`text-left text-xs text-slate-700 ${canEdit && item.status !== "COMPLETE" ? "hover:text-blue-700" : "cursor-default"}`}>
                    {isSaving("progress") ? <span className="flex items-center gap-1 opacity-50"><Loader2 className="h-3 w-3 animate-spin" />Saving</span> : `${item.status === "COMPLETE" ? 100 : item.progress ?? "—"}${item.status === "COMPLETE" || typeof item.progress === "number" ? "%" : ""}`}
                  </button>
                )}
                {getCellError("progress") ? <p className="mt-0.5 text-[10px] text-rose-600">{getCellError("progress")}</p> : null}
              </td>
            );
          case "priority":
            return (
              <td key={columnId} className={`w-[110px] border-y border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm`}>
                {isEditing("priority") ? (
                  <select autoFocus data-timeline-inline-editor="true" value={draftValue} onChange={(e) => void onCommitCell(item.id, "priority", e.target.value, item)} onKeyDown={(e) => onEditorKeyDown(e, item.id, "priority", item)} className="w-full rounded border border-blue-400 px-1.5 py-1 text-xs outline-none" aria-label="Priority">
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{getPriorityDisplay(p)}</option>)}
                  </select>
                ) : (
                  <button type="button" data-timeline-edit-cell={cellKey(item.id, "priority")} onClick={() => onBeginEdit(item, "priority")} disabled={!canEdit} className={`rounded-full px-2 py-1 text-xs font-medium ${getPriorityBadgeClass(item.priority)} ${canEdit ? "hover:opacity-80" : "cursor-default"}`}>
                    {isSaving("priority") ? <span className="flex items-center gap-1 opacity-50"><Loader2 className="h-3 w-3 animate-spin" />{getPriorityDisplay(item.priority)}</span> : getPriorityDisplay(item.priority)}
                  </button>
                )}
                {getCellError("priority") ? <p className="mt-0.5 text-[10px] text-rose-600">{getCellError("priority")}</p> : null}
              </td>
            );
          case "ownerUserId":
            return (
              <td key={columnId} className={`w-[170px] border-y border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm`}>
                {isEditing("ownerUserId") ? (
                  <select autoFocus data-timeline-inline-editor="true" value={draftValue} onChange={(e) => void onCommitCell(item.id, "ownerUserId", e.target.value, item)} onKeyDown={(e) => onEditorKeyDown(e, item.id, "ownerUserId", item)} className="w-full rounded border border-blue-400 px-1.5 py-1 text-xs outline-none" aria-label="Owner">
                    <option value="">Unassigned</option>
                    {item.ownerUser?.id && !ownerStillEligible ? <option value={item.ownerUser.id} disabled>{ownerLabel(item.ownerUser)} — no longer has event access</option> : null}
                    {ownerOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                ) : (
                  <button type="button" data-timeline-edit-cell={cellKey(item.id, "ownerUserId")} onClick={() => onBeginEdit(item, "ownerUserId")} disabled={!canEdit} className={`truncate text-left text-xs text-slate-700 ${canEdit ? "hover:text-blue-700" : "cursor-default"}`}>
                    {isSaving("ownerUserId") ? <span className="flex items-center gap-1 opacity-50"><Loader2 className="h-3 w-3 animate-spin" />{item.ownerUser ? ownerLabel(item.ownerUser) : "Unassigned"}</span> : (item.ownerUser ? `${ownerLabel(item.ownerUser)}${ownerStillEligible ? "" : " — no longer has event access"}` : "Unassigned")}
                  </button>
                )}
                {getCellError("ownerUserId") ? <p className="mt-0.5 text-[10px] text-rose-600">{getCellError("ownerUserId")}</p> : null}
              </td>
            );
          case "startDate":
            return (
              <td key={columnId} className={`w-[140px] border-y border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm`}>
                {isEditing("startDate") ? (
                  <span data-timeline-inline-editor="true">
                    <DateField value={draftValue} onChange={(value) => void onCommitCell(item.id, "startDate", value, item)} onKeyDown={(e) => onEditorKeyDown(e, item.id, "startDate", item)} size="compact" ariaLabel={`Start date for ${item.title}`} />
                  </span>
                ) : (
                  <button type="button" data-timeline-edit-cell={cellKey(item.id, "startDate")} onClick={() => onBeginEdit(item, "startDate")} disabled={!canEdit} className={`text-left text-xs text-slate-700 ${canEdit ? "hover:text-blue-700" : "cursor-default"}`}>
                    {isSaving("startDate") ? <span className="flex items-center gap-1 opacity-50"><Loader2 className="h-3 w-3 animate-spin" />{formatDate(item.startDate)}</span> : formatDate(item.startDate)}
                  </button>
                )}
                {getCellError("startDate") ? <p className="mt-0.5 text-[10px] text-rose-600">{getCellError("startDate")}</p> : null}
              </td>
            );
          case "endDate":
            return (
              <td key={columnId} className={`w-[140px] border-y border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm`}>
                {isEditing("endDate") ? (
                  <span data-timeline-inline-editor="true">
                    <DateField value={draftValue} min={toDateInput(item.startDate) || undefined} onChange={(value) => void onCommitCell(item.id, "endDate", value, item)} onKeyDown={(e) => onEditorKeyDown(e, item.id, "endDate", item)} size="compact" ariaLabel={`Due date for ${item.title}`} popoverClassName="right-0 left-auto" />
                  </span>
                ) : (
                  <button type="button" data-timeline-edit-cell={cellKey(item.id, "endDate")} onClick={() => onBeginEdit(item, "endDate")} disabled={!canEdit} className={`text-left text-xs text-slate-700 ${canEdit ? "hover:text-blue-700" : "cursor-default"}`}>
                    {isSaving("endDate") ? <span className="flex items-center gap-1 opacity-50"><Loader2 className="h-3 w-3 animate-spin" />{formatDate(item.endDate ?? item.startDate)}</span> : formatDate(item.endDate ?? item.startDate)}
                  </button>
                )}
                {getCellError("endDate") ? <p className="mt-0.5 text-[10px] text-rose-600">{getCellError("endDate")}</p> : null}
              </td>
            );
          case "isCriticalPath":
            return (
              <td key={columnId} className={`w-[70px] border-y border-slate-200 ${cellTone} px-3 py-2 align-middle shadow-sm text-center`}>
                <div className="flex flex-col items-center">
                  <input type="checkbox" checked={item.isCriticalPath} disabled={!canEdit || isSaving("isCriticalPath")} onChange={(e) => void onCommitCriticalPath(item.id, e.target.checked)} aria-label={`Critical path for ${item.title}`} className="h-4 w-4 cursor-pointer rounded border-slate-400 accent-rose-600 disabled:cursor-default disabled:opacity-60" />
                  {isSaving("isCriticalPath") ? <Loader2 className="mt-0.5 h-2.5 w-2.5 animate-spin text-slate-400" /> : null}
                  {getCellError("isCriticalPath") ? <p className="text-[9px] text-rose-600">{getCellError("isCriticalPath")}</p> : null}
                </div>
              </td>
            );
          default:
            return null;
        }
      })}
    </tr>
  );
});

export default function TimelineListView({
  eventId,
  items,
  canEdit,
  onSaveRow,
  onDeleteTask,
  onAddSubtask,
  onReorder,
  onBulkUpdate,
  onBulkDelete,
  onRefreshItem,
  ownerOptions: assignableOwnerOptions,
  filtersOpen,
  workstreamFilter = "ALL",
  onWorkstreamFilterChange = () => {},
}: TimelineListViewProps) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [cellDraftValue, setCellDraftValue] = useState<string>("");
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map());
  const [filters, setFilters] = useState<TimelineListFilters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkApplying, setIsBulkApplying] = useState(false);
  const [bulkProgressDraft, setBulkProgressDraft] = useState("");
  const [dispositionItem, setDispositionItem] = useState<TimelineItemRecord | null>(null);
  const [dispositionReason, setDispositionReason] = useState("");
  const [dispositionSaving, setDispositionSaving] = useState(false);
  const bulkMutationInFlightRef = useRef(false);
  const {
    columnOrder,
    orderedColumns,
    setColumnOrder,
  } = usePersistedColumnOrder({
    columns: TIMELINE_LIST_COLUMNS,
    scope: {
      eventId,
      viewId: "roadmap:list",
    },
  });
  const {
    getHeaderReorderProps,
    getHeaderReorderClassName,
  } = useColumnHeaderReorder({
    orderedColumns,
    onColumnOrderChange: setColumnOrder,
  });

  // Latest draft value read by the stable keydown handler without recreating it
  // on every keystroke (which would re-render every row).
  const draftRef = useRef("");

  const taskItems = useMemo(
    // `items` already carries the current server/user order. Mutations replace
    // one record in place, so preserving this sequence keeps row/focus/scroll
    // stable until the user explicitly refreshes or requests a new sort.
    () => items.filter((item) => !isRootTimelineItem(item)),
    [items],
  );
  const workstreamOptions = useMemo(
    () => buildTimelineWorkstreamOptions(taskItems),
    [taskItems],
  );
  // Any number of parents may be open at once. Collapsed is the default so the Matrix opens at
  // parent altitude; expanding never removes another row from the table.
  const [expandedParentIds, setExpandedParentIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const dispositionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [dispositionError, setDispositionError] = useState<string | null>(null);
  const toggleParentExpansion = useCallback((parentId: string) => {
    setExpandedParentIds((current) => {
      const next = new Set(current);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);
  const childRollups = useMemo(() => buildTimelineChildRollups(taskItems), [taskItems]);
  const movementById = useMemo(() => {
    const result = new Map<string, { canMoveUp: boolean; canMoveDown: boolean }>();
    const siblings = new Map<string, TimelineItemRecord[]>();
    for (const item of taskItems) {
      const key = item.parentId ?? "ROOT";
      const group = siblings.get(key) ?? [];
      group.push(item);
      siblings.set(key, group);
    }
    for (const group of siblings.values()) group.forEach((item, index) => result.set(item.id, { canMoveUp: index > 0, canMoveDown: index < group.length - 1 }));
    return result;
  }, [taskItems]);

  const ownerOptions = useMemo(() => {
    const deduped = new Map<string, { id: string; label: string }>();
    for (const owner of assignableOwnerOptions) {
      deduped.set(owner.id, {
        id: owner.id,
        label: ownerLabel(owner),
      });
    }
    return Array.from(deduped.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [assignableOwnerOptions]);

  /**
   * Parents whose subtask matched the search. Their rows are pulled back into the list and the
   * parent is auto-expanded, so a search hit on a subtask is visible in place rather than
   * leaving the user staring at a parent with no obvious reason for being there.
   */
  const searchMatchedParentIds = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    if (!query) return new Set<string>();
    const matchedIds = new Set(
      taskItems.filter((item) => itemMatchesFilters(item, filters)).map((item) => item.id),
    );
    return new Set(
      taskItems
        .filter((item) => item.parentId && matchedIds.has(item.id))
        .map((item) => item.parentId as string),
    );
  }, [filters, taskItems]);

  const isParentExpanded = useCallback(
    (parentId: string) => expandedParentIds.has(parentId) || searchMatchedParentIds.has(parentId),
    [expandedParentIds, searchMatchedParentIds],
  );

  const filteredTaskItems = useMemo(() => {
    const matched = taskItems.filter((item) => itemMatchesFilters(item, filters));
    const matchedIds = new Set(matched.map((item) => item.id));

    // Parents recovered purely because a subtask matched the search.
    const recoveredParents = taskItems.filter(
      (item) => searchMatchedParentIds.has(item.id) && !matchedIds.has(item.id),
    );
    const candidateIds = new Set([...matchedIds, ...recoveredParents.map((item) => item.id)]);

    // Walk the original roadmap order once and emit each child directly beneath its parent, so
    // hierarchy reads correctly without reordering anything the user did not ask to move.
    const childrenByParent = new Map<string, TimelineItemRecord[]>();
    for (const item of taskItems) {
      if (!item.parentId) continue;
      const group = childrenByParent.get(item.parentId) ?? [];
      group.push(item);
      childrenByParent.set(item.parentId, group);
    }

    const visible: TimelineItemRecord[] = [];
    for (const item of taskItems) {
      if (item.parentId) {
        // Children are emitted with their parent below; a child whose parent is filtered out
        // entirely still shows on its own so a direct match is never hidden.
        if (candidateIds.has(item.id) && !candidateIds.has(item.parentId)) visible.push(item);
        continue;
      }
      if (!candidateIds.has(item.id)) continue;
      visible.push(item);
      if (!isParentExpanded(item.id)) continue;
      for (const child of childrenByParent.get(item.id) ?? []) {
        if (candidateIds.has(child.id)) visible.push(child);
      }
    }
    return visible;
  }, [filters, isParentExpanded, searchMatchedParentIds, taskItems]);

  // Bucket transient saving/error state by item id so each row can receive only
  // its own slice. Rows with no saving/error state share a stable empty
  // reference, so a save on one row does not re-render the others.
  const savingByItem = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const key of savingCells) {
      const idx = key.indexOf(":");
      if (idx === -1) continue;
      const itemId = key.slice(0, idx);
      const field = key.slice(idx + 1);
      let set = map.get(itemId);
      if (!set) {
        set = new Set();
        map.set(itemId, set);
      }
      set.add(field);
    }
    return map;
  }, [savingCells]);

  const errorsByItem = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    for (const [key, message] of cellErrors) {
      const idx = key.indexOf(":");
      if (idx === -1) continue;
      const itemId = key.slice(0, idx);
      const field = key.slice(idx + 1);
      let entry = map.get(itemId);
      if (!entry) {
        entry = new Map();
        map.set(itemId, entry);
      }
      entry.set(field, message);
    }
    return map;
  }, [cellErrors]);

  // Row windowing: only mount the rows in (or near) the viewport for large
  // timelines. Selection/bulk/filter all operate on filteredTaskItems and
  // visibleFilteredIds, not on the mounted rows, so windowing never scopes
  // selection or bulk actions to only the visible rows.
  const shouldVirtualize = filteredTaskItems.length > LIST_VIRTUALIZATION_THRESHOLD;
  const { scrollRef: listBodyRef, virtual } = useVirtualRows({
    count: filteredTaskItems.length,
    rowHeight: LIST_ROW_HEIGHT,
    enabled: shouldVirtualize,
  });
  const visibleTaskItems = shouldVirtualize
    ? filteredTaskItems.slice(virtual.startIndex, virtual.endIndex)
    : filteredTaskItems;

  const visibleFilteredIds = useMemo(
    () => filteredTaskItems.map((item) => item.id),
    [filteredTaskItems],
  );
  const selectedVisibleIds = visibleFilteredIds.filter((itemId) => selectedIds.has(itemId));
  const selectedCount = selectedVisibleIds.length;
  const activeFilterCount = countActiveFilters(filters);
  const allVisibleSelected = visibleFilteredIds.length > 0 && selectedVisibleIds.length === visibleFilteredIds.length;
  const someVisibleSelected = selectedVisibleIds.length > 0 && !allVisibleSelected;

  useEffect(() => {
    setFilters((current) => {
      if (current.workstream === workstreamFilter) return current;
      return { ...current, workstream: workstreamFilter };
    });
  }, [workstreamFilter]);

  useEffect(() => {
    const visibleIdSet = new Set(visibleFilteredIds);
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((itemId) => visibleIdSet.has(itemId)));
      return next.size === current.size ? current : next;
    });
  }, [visibleFilteredIds]);

  const focusCellTrigger = useCallback((cell: EditingCell, target: "current" | "next") => {
    window.requestAnimationFrame(() => {
      const triggers = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-timeline-edit-cell]"),
      );
      const currentIndex = triggers.findIndex(
        (trigger) => trigger.dataset.timelineEditCell === cellKey(cell.itemId, cell.field),
      );
      const nextTrigger = target === "next" ? triggers[currentIndex + 1] : triggers[currentIndex];
      nextTrigger?.focus();
    });
  }, []);

  const closeCellEditor = useCallback((cell: EditingCell | null, focusTarget: "current" | "next" | "none" = "current") => {
    setEditingCell(null);
    draftRef.current = "";
    setCellDraftValue("");
    if (cell && focusTarget !== "none") {
      focusCellTrigger(cell, focusTarget);
    }
  }, [focusCellTrigger]);

  const beginCellEdit = useCallback((item: TimelineItemRecord, field: EditableField) => {
    if (!canEdit) return;
    setEditingCell({ itemId: item.id, field });
    const seed = getCellSeedValue(item, field);
    draftRef.current = seed;
    setCellDraftValue(seed);
    const key = cellKey(item.id, field);
    setCellErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, [canEdit]);

  const cancelCellEdit = useCallback(() => {
    closeCellEditor(editingCell);
  }, [closeCellEditor, editingCell]);

  useEffect(() => {
    if (!editingCell) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-timeline-inline-editor]") || target.closest("[data-date-field-popover]")) return;

      const nextEditorTrigger = target.closest("[data-timeline-edit-cell]");
      const otherInteractiveControl = target.closest("button, a, input, select, textarea, [role=button]");
      closeCellEditor(editingCell, nextEditorTrigger || otherInteractiveControl ? "none" : "current");
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [closeCellEditor, editingCell]);

  const handleDraftChange = useCallback((value: string) => {
    draftRef.current = value;
    setCellDraftValue(value);
  }, []);

  const commitCell = useCallback(async (
    itemId: string,
    field: EditableField,
    value: string,
    item: TimelineItemRecord,
    focusTarget: "current" | "next" = "current",
  ) => {
    const key = cellKey(itemId, field);
    closeCellEditor({ itemId, field }, focusTarget);
    setSavingCells((prev) => new Set(prev).add(key));
    try {
      await onSaveRow(itemId, buildPatch(field, value, item, workstreamOptions));
      setCellErrors((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } catch (error) {
      const saveError = error as TimelineSaveError;
      setCellErrors((prev) => {
        const next = new Map(prev);
        const fieldErrors = saveError?.fieldErrors ?? {};
        let appliedFieldError = false;

        for (const [errorField, message] of Object.entries(fieldErrors)) {
          if (!message) continue;
          next.set(cellKey(itemId, errorField), message);
          appliedFieldError = true;
        }

        if (!appliedFieldError) {
          next.set(key, error instanceof Error ? error.message : "Save failed");
        }

        return next;
      });
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [closeCellEditor, onSaveRow, workstreamOptions]);

  const commitCriticalPath = useCallback(async (itemId: string, checked: boolean) => {
    const key = cellKey(itemId, "isCriticalPath");
    setSavingCells((prev) => new Set(prev).add(key));
    try {
      await onSaveRow(itemId, { isCriticalPath: checked });
      setCellErrors((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } catch (error) {
      setCellErrors((prev) =>
        new Map(prev).set(key, error instanceof Error ? error.message : "Save failed"),
      );
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [onSaveRow]);

  const handleTextKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLInputElement>,
    itemId: string,
    field: EditableField,
    item: TimelineItemRecord,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelCellEdit();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      void commitCell(itemId, field, draftRef.current, item, event.key === "Tab" ? "next" : "current");
    }
  }, [cancelCellEdit, commitCell]);

  const handleEditorKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLElement>,
    itemId: string,
    field: EditableField,
    item: TimelineItemRecord,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelCellEdit();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      void commitCell(itemId, field, draftRef.current, item, event.key === "Tab" ? "next" : "current");
    }
  }, [cancelCellEdit, commitCell]);

  function updateFilter<K extends keyof TimelineListFilters>(key: K, value: TimelineListFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateWorkstreamFilter(value: TimelineListFilters["workstream"]) {
    updateFilter("workstream", value);
    onWorkstreamFilterChange(value);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    onWorkstreamFilterChange("ALL");
  }

  function toggleSelectAllVisible() {
    if (!canEdit) return;
    setSelectedIds((current) => {
      if (allVisibleSelected) return new Set();
      return new Set([...Array.from(current), ...visibleFilteredIds]);
    });
  }

  const toggleRowSelection = useCallback((itemId: string) => {
    if (!canEdit) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, [canEdit]);

  async function applyBulkPatch(patch: TimelineItemPatch) {
    if (!canEdit || selectedCount === 0 || Object.keys(patch).length === 0 || bulkMutationInFlightRef.current) return;
    bulkMutationInFlightRef.current = true;
    setIsBulkApplying(true);
    setBulkError(null);
    try {
      await onBulkUpdate(selectedVisibleIds, patch);
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Bulk update failed");
    } finally {
      bulkMutationInFlightRef.current = false;
      setIsBulkApplying(false);
    }
  }

  async function deleteSelectedRows() {
    if (!canEdit || selectedCount === 0 || bulkMutationInFlightRef.current) return;
    const confirmed = window.confirm(`Delete ${selectedCount} selected timeline item${selectedCount === 1 ? "" : "s"}?`);
    if (!confirmed) return;

    bulkMutationInFlightRef.current = true;
    setIsBulkApplying(true);
    setBulkError(null);
    try {
      await onBulkDelete(selectedVisibleIds);
      setSelectedIds(new Set());
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Bulk delete failed");
    } finally {
      bulkMutationInFlightRef.current = false;
      setIsBulkApplying(false);
    }
  }

  async function refreshDispositionItem(itemId: string) {
    try {
      const refreshedItem = await onRefreshItem(itemId);
      if (refreshedItem) setDispositionItem(refreshedItem);
    } catch {
      // The original save error remains actionable even if a refresh is unavailable.
    }
  }

  async function saveDisposition() {
    if (!dispositionItem || dispositionSaving) return;
    const restoring = dispositionItem.disposition === "NOT_NEEDED";
    if (!restoring && !dispositionReason.trim()) return;
    setDispositionSaving(true);
    setDispositionError(null);
    try {
      await onSaveRow(dispositionItem.id, {
        disposition: restoring ? "ACTIVE" : "NOT_NEEDED",
        dispositionReason: restoring ? null : dispositionReason.trim(),
        expectedUpdatedAt: dispositionItem.updatedAt,
      });
      closeDispositionDialog();
    } catch (error) {
      setDispositionError(error instanceof Error ? error.message : "Unable to update this roadmap item. Please try again.");
      await refreshDispositionItem(dispositionItem.id);
    } finally {
      setDispositionSaving(false);
    }
  }

  function closeDispositionDialog() {
    setDispositionItem(null);
    setDispositionReason("");
    setDispositionError(null);
    window.requestAnimationFrame(() => dispositionTriggerRef.current?.focus());
  }

  return (
    <div className="space-y-3">
      <div className={TABLE_CONTROL_ROW_CLASS} data-testid="timeline-table-control-row">
        <label className={`${TABLE_SEARCH_FIELD_CLASS} xl:max-w-[320px]`}>
          <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search item or owner"
            className="w-full bg-transparent text-[12px] text-slate-800 outline-none"
            aria-label="Search timeline items"
          />
        </label>
      </div>


      {filtersOpen ? (
        <div className={TABLE_FILTER_PANEL_CLASS} data-testid="timeline-filter-panel">
          <select
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value as TimelineStatus | "")}
            className={TABLE_FILTER_CONTROL_CLASS}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{getStatusDisplay(status)}</option>
            ))}
          </select>
          <select value={filters.disposition} onChange={(event) => updateFilter("disposition", event.target.value as TimelineListFilters["disposition"])} className={TABLE_FILTER_CONTROL_CLASS} aria-label="Filter by disposition">
            <option value="ALL">All dispositions</option>
            <option value="ACTIVE">Active work</option>
            <option value="NOT_NEEDED">Not Needed</option>
          </select>
          <label className="inline-flex items-center gap-2 px-1 text-[12px] font-medium text-slate-700">
            <input
              type="checkbox"
              checked={filters.needsAssignment}
              onChange={(event) => updateFilter("needsAssignment", event.target.checked)}
            />
            Needs assignment
          </label>
          <select
            value={filters.workstream}
            onChange={(event) => updateWorkstreamFilter(event.target.value as TimelineListFilters["workstream"])}
            className={TABLE_FILTER_CONTROL_CLASS}
            aria-label="Filter by workstream"
          >
            <option value="ALL">All workstreams</option>
            <option value="UNASSIGNED">Unassigned workstream</option>
            {workstreamOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            value={filters.planningStage}
            onChange={(event) => updateFilter("planningStage", event.target.value as TimelineListFilters["planningStage"])}
            className={TABLE_FILTER_CONTROL_CLASS}
            aria-label="Filter by stage"
          >
            <option value="ALL">All stages</option>
            <option value="UNASSIGNED">Unassigned stage</option>
            {TIMELINE_PLANNING_STAGES.map((stage) => (
              <option key={stage} value={stage}>{PLANNING_STAGE_LABELS[stage]}</option>
            ))}
          </select>
          <select
            value={filters.priority}
            onChange={(event) => updateFilter("priority", event.target.value as TimelinePriority | "")}
            className={TABLE_FILTER_CONTROL_CLASS}
            aria-label="Filter by priority"
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>{getPriorityDisplay(priority)}</option>
            ))}
          </select>
          <select
            value={filters.ownerUserId}
            onChange={(event) => updateFilter("ownerUserId", event.target.value)}
            className={TABLE_FILTER_CONTROL_CLASS}
            aria-label="Filter by owner"
          >
            <option value="">All owners</option>
            <option value="UNASSIGNED">Unassigned owner</option>
            {ownerOptions.map((owner) => (
              <option key={owner.id} value={owner.id}>{owner.label}</option>
            ))}
          </select>
          <select
            value={filters.criticalPath}
            onChange={(event) => updateFilter("criticalPath", event.target.value as TimelineListFilters["criticalPath"])}
            className={TABLE_FILTER_CONTROL_CLASS}
            aria-label="Filter by critical path"
          >
            <option value="ALL">All critical path</option>
            <option value="ONLY">Critical path only</option>
          </select>
          {activeFilterCount > 0 ? (
            <button type="button" onClick={clearFilters} className={TABLE_CONTROL_BUTTON_CLASS}>
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {canEdit && selectedCount > 0 ? (
        <div className={BULK_ACTION_BAR_CLASS} data-testid="timeline-bulk-action-bar">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <p className={BULK_SELECTED_COUNT_CLASS}>
              {selectedCount} selected
            </p>
            {bulkError ? (
              <p className="truncate text-[11px] font-medium text-rose-700">{bulkError}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              style={{ order: columnOrder.indexOf("workstream") }}
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                void applyBulkPatch(value === "__UNASSIGNED__" ? { workstream: null, department: null } : buildWorkstreamPatch(value, workstreamOptions));
                event.target.value = "";
              }}
              disabled={isBulkApplying}
              className={BULK_CONTROL_CLASS}
            >
              <option value="">Set workstream...</option>
              <option value="__UNASSIGNED__">Unassigned</option>
              {workstreamOptions.map((option) => (
                <option key={`bulk-workstream-${option.value}`} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              style={{ order: columnOrder.indexOf("planningStage") }}
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value as TimelinePlanningStage | "";
                if (!value) return;
                void applyBulkPatch({ planningStage: value });
                event.target.value = "";
              }}
              disabled={isBulkApplying}
              className={BULK_CONTROL_CLASS}
            >
              <option value="">Set stage...</option>
              {TIMELINE_PLANNING_STAGES.map((stage) => (
                <option key={`bulk-stage-${stage}`} value={stage}>{PLANNING_STAGE_LABELS[stage]}</option>
              ))}
            </select>
            <select
              style={{ order: columnOrder.indexOf("status") }}
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value as TimelineStatus | "";
                if (!value) return;
                void applyBulkPatch({ status: value });
                event.target.value = "";
              }}
              disabled={isBulkApplying}
              className={BULK_CONTROL_CLASS}
            >
              <option value="">Set status...</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={`bulk-status-${status}`} value={status}>{getStatusDisplay(status)}</option>
              ))}
            </select>
            <form
              style={{ order: columnOrder.indexOf("progress") }}
              className="flex items-center gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                const progress = Number(bulkProgressDraft);
                if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
                  setBulkError("Progress must be a whole number from 0 to 100");
                  return;
                }
                void applyBulkPatch({ progress });
                setBulkProgressDraft("");
              }}
            >
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={bulkProgressDraft}
                onChange={(event) => setBulkProgressDraft(event.target.value)}
                disabled={isBulkApplying}
                className={`${BULK_CONTROL_CLASS} w-24`}
                aria-label="Progress for selected items"
                placeholder="Progress %"
              />
              <button type="submit" disabled={isBulkApplying || !bulkProgressDraft} className={BULK_CONTROL_CLASS}>
                Apply
              </button>
            </form>
            <select
              style={{ order: columnOrder.indexOf("priority") }}
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value as TimelinePriority | "";
                if (!value) return;
                void applyBulkPatch({ priority: value });
                event.target.value = "";
              }}
              disabled={isBulkApplying}
              className={BULK_CONTROL_CLASS}
            >
              <option value="">Set priority...</option>
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={`bulk-priority-${priority}`} value={priority}>{getPriorityDisplay(priority)}</option>
              ))}
            </select>
            <select
              style={{ order: columnOrder.indexOf("ownerUserId") }}
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                void applyBulkPatch({ ownerUserId: value === "__UNASSIGNED__" ? null : value });
                event.target.value = "";
              }}
              disabled={isBulkApplying}
              className={BULK_CONTROL_CLASS}
            >
              <option value="">Set owner...</option>
              <option value="__UNASSIGNED__">Unassigned</option>
              {ownerOptions.map((owner) => (
                <option key={`bulk-owner-${owner.id}`} value={owner.id}>{owner.label}</option>
              ))}
            </select>
            <select
              style={{ order: columnOrder.indexOf("isCriticalPath") }}
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                void applyBulkPatch({ isCriticalPath: value === "true" });
                event.target.value = "";
              }}
              disabled={isBulkApplying}
              className={BULK_CONTROL_CLASS}
            >
              <option value="">Set critical path...</option>
              <option value="true">Mark critical path</option>
              <option value="false">Remove critical path</option>
            </select>
            <button
              type="button"
              style={{ order: 1000 }}
              onClick={() => setSelectedIds(new Set())}
              disabled={isBulkApplying}
              className={BULK_CLEAR_BUTTON_CLASS}
            >
              Clear selection
            </button>
            <button
              type="button"
              style={{ order: 1001 }}
              onClick={() => void deleteSelectedRows()}
              disabled={isBulkApplying}
              className={BULK_DELETE_BUTTON_CLASS}
            >
              Delete selected
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
      <table className="w-full min-w-[1700px] border-separate border-spacing-y-2 text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-[48px] px-3 py-2" data-column-pinned-header="select">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={(input) => {
                  if (input) input.indeterminate = someVisibleSelected;
                }}
                onChange={toggleSelectAllVisible}
                disabled={!canEdit || visibleFilteredIds.length === 0}
                aria-label="Select visible timeline rows"
                className="h-4 w-4 rounded border-slate-300 accent-blue-700 disabled:opacity-60"
              />
            </th>
            <th className="w-[280px] px-3 py-2" data-column-pinned-header="title">Item</th>
            {orderedColumns.map((column) => (
              <th
                key={column.id}
                {...getHeaderReorderProps(column)}
                className={getHeaderReorderClassName(
                  column.id,
                  `${TIMELINE_COLUMN_WIDTHS[column.id]} px-3 py-2 ${column.id === "isCriticalPath" ? "text-center" : ""}`,
                )}
              >
                <div className={`flex items-center gap-1.5 ${column.id === "isCriticalPath" ? "justify-center" : ""}`}>
                  <ColumnHeaderDragHandle />
                  <span>{column.label}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={listBodyRef}>
          {virtual.topPadding > 0 ? (
            <tr aria-hidden className="pointer-events-none">
              <td colSpan={2 + orderedColumns.length} style={{ height: virtual.topPadding, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {visibleTaskItems.map((item) => (
            <TimelineListRow
              key={item.id}
              item={item}
              columnOrder={columnOrder}
              canEdit={canEdit}
              isSelected={selectedIds.has(item.id)}
              editingField={editingCell && editingCell.itemId === item.id ? editingCell.field : null}
              draftValue={editingCell?.itemId === item.id ? cellDraftValue : ""}
              savingFields={savingByItem.get(item.id) ?? EMPTY_SAVING_FIELDS}
              errorFields={errorsByItem.get(item.id) ?? EMPTY_CELL_ERRORS}
              workstreamOptions={workstreamOptions}
              ownerOptions={ownerOptions}
              onToggleSelect={toggleRowSelection}
              onBeginEdit={beginCellEdit}
              onCommitCell={commitCell}
              onCancelEdit={cancelCellEdit}
              onDraftChange={handleDraftChange}
              onTextKeyDown={handleTextKeyDown}
              onEditorKeyDown={handleEditorKeyDown}
              onCommitCriticalPath={commitCriticalPath}
              onDeleteTask={onDeleteTask}
              onAddSubtask={onAddSubtask}
              onToggleSubtasks={(parent) => toggleParentExpansion(parent.id)}
              isExpanded={isParentExpanded(item.id)}
              onReorder={(row, direction) => void onReorder(row, direction)}
              onOpenDisposition={(row, trigger) => { dispositionTriggerRef.current = trigger; setDispositionItem(row); setDispositionReason(""); setDispositionError(null); }}
              canMoveUp={movementById.get(item.id)?.canMoveUp ?? false}
              canMoveDown={movementById.get(item.id)?.canMoveDown ?? false}
              childRollup={childRollups.get(item.id) ?? null}
            />
          ))}
          {virtual.bottomPadding > 0 ? (
            <tr aria-hidden className="pointer-events-none">
              <td colSpan={2 + orderedColumns.length} style={{ height: virtual.bottomPadding, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {filteredTaskItems.length === 0 ? (
            <tr>
              <td colSpan={2 + orderedColumns.length} className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                No timeline items match the current filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>

    {dispositionItem ? <div data-testid="timeline-disposition-backdrop" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !dispositionSaving) closeDispositionDialog(); }}>
      <section data-testid="timeline-disposition-dialog" role="dialog" aria-modal="true" aria-labelledby="timeline-disposition-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3"><div><h2 id="timeline-disposition-title" className="text-lg font-semibold text-slate-950">{dispositionItem.disposition === "NOT_NEEDED" ? "Restore roadmap item" : "Mark Not Needed"}</h2><p className="mt-1 text-sm text-slate-600">{dispositionItem.title}</p></div><button type="button" disabled={dispositionSaving} onClick={closeDispositionDialog} aria-label="Close disposition dialog" className="rounded p-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"><X className="h-5 w-5" aria-hidden /></button></div>
        {dispositionItem.disposition === "NOT_NEEDED" ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Restoring includes this item in active progress, risk, dependency, readiness, and overdue counts again.</p> : <label className="mt-4 grid gap-1.5 text-sm font-semibold text-slate-800">Reason required<textarea autoFocus value={dispositionReason} onChange={(event) => setDispositionReason(event.target.value)} rows={4} maxLength={2000} className="resize-y rounded-lg border border-slate-300 p-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Why is this work not applicable?" /></label>}
        {dispositionError ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{dispositionError}</p> : null}
        <p className="mt-3 text-xs text-slate-500">The actor, time, and reason are retained in event activity history. Active subtasks must be completed or dispositioned first.</p>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeDispositionDialog} disabled={dispositionSaving} className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700">Cancel</button><button type="button" onClick={() => void saveDisposition()} disabled={dispositionSaving || (dispositionItem.disposition !== "NOT_NEEDED" && !dispositionReason.trim())} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-50">{dispositionSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CircleSlash2 className="h-4 w-4" aria-hidden />}{dispositionItem.disposition === "NOT_NEEDED" ? "Restore" : "Mark Not Needed"}</button></div>
      </section>
    </div> : null}

    </div>
  );
}
