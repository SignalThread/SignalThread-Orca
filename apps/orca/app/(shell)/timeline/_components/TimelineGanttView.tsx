"use client";

import { CalendarClock, ChevronDown, ChevronRight, Flame, Plus, Trash2, X } from "lucide-react";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DateField } from "@/components/date-field";
import { normalizeTimelineDateInput, timelineTodayDateOnly } from "@/lib/timeline/date-normalization";
import { getTimelineGroupSummary } from "@/lib/timeline/group-summary";
import {
  getPlanningStageLabel,
  getWorkstreamLabel,
  getWorkstreamTheme,
  resolveWorkstream,
  TIMELINE_WORKSTREAMS,
  WORKSTREAM_LABELS,
  PLANNING_STAGE_LABELS,
  TIMELINE_PLANNING_STAGES,
} from "@/lib/timeline/taxonomy";
import {
  getPriorityDisplay,
  getStatusDisplay,
  isRootTimelineItem,
  parseTimelineDate,
  type TimelineItemPatch,
  type TimelineItemRecord,
  type TimelineOwnerOption,
  type TimelinePlanningStage,
  type TimelinePriority,
  type TimelineStatus,
  type TimelineWorkstream,
} from "./types";

function workstreamGroupKey(item: TimelineItemRecord): string {
  return resolveWorkstream(item.workstream ?? item.department) ?? "UNASSIGNED";
}

type TimelineGanttViewProps = {
  items: TimelineItemRecord[];
  eventName?: string;
  canEdit?: boolean;
  expandedIds: Set<string>;
  onToggleExpand: (itemId: string) => void;
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
  onSaveItem: (itemId: string, patch: TimelineItemPatch) => Promise<void>;
  onDeleteTask: (itemId: string) => void;
  ownerOptions?: TimelineOwnerOption[];
  inlineDraft: RoadmapInlineDraft | null;
  onUpdateInlineDraft: (patch: Partial<Omit<RoadmapInlineDraft, "workstream" | "kind">>) => void;
  onCancelInlineDraft: () => void;
  onSaveInlineDraft: () => void;
  onOpenItemCreate: (workstream?: TimelineWorkstream | "UNASSIGNED") => void;
  onAddWorkstream?: () => void;
};

export type RoadmapInlineDraft = {
  workstream: TimelineWorkstream | "UNASSIGNED";
  kind: "TASK" | "MILESTONE";
  title: string;
  startDate: string;
  endDate: string;
  ownerUserId: string;
  planningStage: TimelinePlanningStage;
  isSaving: boolean;
};

type ZoomLevel = "WEEK" | "MONTH" | "QUARTER";

type ItemSchedule =
  | { kind: "BAR"; start: Date; end: Date }
  | { kind: "MILESTONE"; date: Date }
  | { kind: "NONE" };

const NONE_SCHEDULE: ItemSchedule = { kind: "NONE" };

type TimelineWindow = { start: Date; end: Date };
type Tick = { date: Date; label: string };

type CategoryGroup = {
  key: string;
  label: string;
  tasks: TimelineItemRecord[];
  atRiskCount: number;
  overdueCount: number;
  nextDueDate: Date | null;
  schedule: ItemSchedule;
};

type TaskRow = {
  item: TimelineItemRecord;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  schedule: ItemSchedule;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const LEFT_COLUMN_WIDTH = 360;
const CHART_MIN_WIDTH = 320;
const GRID_TEMPLATE = `${LEFT_COLUMN_WIDTH}px minmax(0, 1fr)`;
const GANTT_ZOOM_KEY = "timeline:ganttZoom";
const TIMELINE_MIN_COLUMN_WIDTH = 132;
const TIMELINE_MIN_VISIBLE_COLUMNS = 3;
const TIMELINE_MAX_VISIBLE_COLUMNS = 10;
const STATUS_OPTIONS: TimelineStatus[] = ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "COMPLETE"];
const PRIORITY_OPTIONS: TimelinePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

type QuickEditDraft = {
  title: string;
  status: TimelineStatus;
  dueDate: string;
  ownerUserId: string;
  priority: TimelinePriority;
  isCriticalPath: boolean;
  planningStage: TimelinePlanningStage | "";
  workstream: TimelineWorkstream | "";
};

function toStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function diffDays(left: Date, right: Date): number {
  return (toStartOfDay(left).getTime() - toStartOfDay(right).getTime()) / DAY_MS;
}

function formatDate(date: Date | null): string {
  if (!date) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function toDateInput(value: string | null): string {
  return normalizeTimelineDateInput(value) ?? "";
}

function ownerLabel(owner: Pick<TimelineOwnerOption, "name" | "email">): string {
  return `${owner.name?.trim() || owner.email} — ${owner.email}`;
}

function taskDueDate(item: TimelineItemRecord): Date | null {
  return parseTimelineDate(item.endDate ?? item.startDate);
}

function itemIsOverdue(item: TimelineItemRecord, today: Date): boolean {
  if (item.status === "COMPLETE") return false;
  const dueDate = taskDueDate(item);
  return Boolean(dueDate && toStartOfDay(dueDate).getTime() < today.getTime());
}

function workstreamHasHealthIssue(group: Pick<CategoryGroup, "overdueCount" | "atRiskCount">): boolean {
  return group.overdueCount > 0 || group.atRiskCount > 0;
}

function workstreamCountBadgeTone(hasHealthIssue: boolean): string {
  return hasHealthIssue
    ? "border-rose-200 bg-rose-500 text-white shadow-[0_8px_18px_rgba(244,63,94,0.22)]"
    : "border-emerald-200 bg-emerald-500 text-white shadow-[0_8px_18px_rgba(16,185,129,0.2)]";
}

function nextOpenDueDate(tasks: TimelineItemRecord[], today: Date): Date | null {
  const dates = tasks
    .filter((task) => task.status !== "COMPLETE")
    .map(taskDueDate)
    .filter((date): date is Date => Boolean(date))
    .map(toStartOfDay)
    .filter((date) => date.getTime() >= today.getTime())
    .sort((left, right) => left.getTime() - right.getTime());
  return dates[0] ?? null;
}

function formatRange(schedule: ItemSchedule): string {
  if (schedule.kind === "BAR") {
    return `${formatDate(schedule.start)} - ${formatDate(schedule.end)}`;
  }
  if (schedule.kind === "MILESTONE") {
    return formatDate(schedule.date);
  }
  return "No date range";
}

function workstreamActionTone(workstream: string): { button: string; mobileButton: string; rowTint: string } {
  const resolved = resolveWorkstream(workstream);
  switch (resolved) {
    case "VENUE":
      return {
        button: "border-teal-300 text-teal-700 hover:bg-teal-50 focus:ring-teal-200",
        mobileButton: "border-teal-200 bg-teal-50/80 text-teal-700 hover:bg-teal-50 focus:ring-teal-200",
        rowTint: "group-hover:bg-teal-50/45 group-focus-within:bg-teal-50/45",
      };
    case "HOUSING":
      return {
        button: "border-sky-300 text-sky-700 hover:bg-sky-50 focus:ring-sky-200",
        mobileButton: "border-sky-200 bg-sky-50/80 text-sky-700 hover:bg-sky-50 focus:ring-sky-200",
        rowTint: "group-hover:bg-sky-50/45 group-focus-within:bg-sky-50/45",
      };
    case "REGISTRATION":
      return {
        button: "border-indigo-300 text-indigo-700 hover:bg-indigo-50 focus:ring-indigo-200",
        mobileButton: "border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-50 focus:ring-indigo-200",
        rowTint: "group-hover:bg-indigo-50/45 group-focus-within:bg-indigo-50/45",
      };
    case "SPEAKERS":
      return {
        button: "border-violet-300 text-violet-700 hover:bg-violet-50 focus:ring-violet-200",
        mobileButton: "border-violet-200 bg-violet-50/80 text-violet-700 hover:bg-violet-50 focus:ring-violet-200",
        rowTint: "group-hover:bg-violet-50/45 group-focus-within:bg-violet-50/45",
      };
    case "SPONSORS":
      return {
        button: "border-amber-300 text-amber-700 hover:bg-amber-50 focus:ring-amber-200",
        mobileButton: "border-amber-200 bg-amber-50/80 text-amber-700 hover:bg-amber-50 focus:ring-amber-200",
        rowTint: "group-hover:bg-amber-50/45 group-focus-within:bg-amber-50/45",
      };
    case "FNB":
      return {
        button: "border-orange-300 text-orange-700 hover:bg-orange-50 focus:ring-orange-200",
        mobileButton: "border-orange-200 bg-orange-50/80 text-orange-700 hover:bg-orange-50 focus:ring-orange-200",
        rowTint: "group-hover:bg-orange-50/45 group-focus-within:bg-orange-50/45",
      };
    case "PRODUCTION":
      return {
        button: "border-blue-300 text-blue-700 hover:bg-blue-50 focus:ring-blue-200",
        mobileButton: "border-blue-200 bg-blue-50/80 text-blue-700 hover:bg-blue-50 focus:ring-blue-200",
        rowTint: "group-hover:bg-blue-50/45 group-focus-within:bg-blue-50/45",
      };
    case "MARKETING":
      return {
        button: "border-pink-300 text-pink-700 hover:bg-pink-50 focus:ring-pink-200",
        mobileButton: "border-pink-200 bg-pink-50/80 text-pink-700 hover:bg-pink-50 focus:ring-pink-200",
        rowTint: "group-hover:bg-pink-50/45 group-focus-within:bg-pink-50/45",
      };
    default:
      return {
        button: "border-slate-300 text-slate-700 hover:bg-slate-50 focus:ring-slate-200",
        mobileButton: "border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-slate-50 focus:ring-slate-200",
        rowTint: "group-hover:bg-slate-50 group-focus-within:bg-slate-50",
      };
  }
}

function getItemSchedule(item: TimelineItemRecord): ItemSchedule {
  const start = parseTimelineDate(item.startDate);
  const end = parseTimelineDate(item.endDate);

  if (start && end) {
    const safeStart = toStartOfDay(start);
    const safeEnd = toStartOfDay(end);
    if (safeEnd.getTime() < safeStart.getTime()) {
      return { kind: "BAR", start: safeEnd, end: safeStart };
    }
    return { kind: "BAR", start: safeStart, end: safeEnd };
  }

  if (!start && end) {
    return { kind: "MILESTONE", date: toStartOfDay(end) };
  }

  if (start && !end) {
    const safeStart = toStartOfDay(start);
    return { kind: "BAR", start: safeStart, end: addDays(safeStart, 1) };
  }

  return { kind: "NONE" };
}

function scheduleTooltip(item: TimelineItemRecord, schedule: ItemSchedule): string {
  if (schedule.kind === "BAR") {
    return `${item.title}\n${formatDate(schedule.start)} - ${formatDate(schedule.end)}`;
  }
  if (schedule.kind === "MILESTONE") {
    return `${item.title}\nDate: ${formatDate(schedule.date)}`;
  }
  return `${item.title}\nNo date`;
}

function compareTaskRows(left: TimelineItemRecord, right: TimelineItemRecord): number {
  const leftStart = parseTimelineDate(left.startDate) ?? parseTimelineDate(left.endDate);
  const rightStart = parseTimelineDate(right.startDate) ?? parseTimelineDate(right.endDate);

  if (leftStart && rightStart && leftStart.getTime() !== rightStart.getTime()) {
    return leftStart.getTime() - rightStart.getTime();
  }
  if (leftStart && !rightStart) return -1;
  if (!leftStart && rightStart) return 1;

  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.title.localeCompare(right.title);
}

function buildGroupSchedule(tasks: TimelineItemRecord[]): ItemSchedule {
  const schedules = tasks.map((task) => getItemSchedule(task));
  const dates: Date[] = [];
  for (const schedule of schedules) {
    if (schedule.kind === "BAR") {
      dates.push(schedule.start, schedule.end);
    } else if (schedule.kind === "MILESTONE") {
      dates.push(schedule.date);
    }
  }

  if (dates.length === 0) {
    return NONE_SCHEDULE;
  }

  const start = new Date(Math.min(...dates.map((date) => date.getTime())));
  const end = new Date(Math.max(...dates.map((date) => date.getTime())));
  return { kind: "BAR", start: toStartOfDay(start), end: toStartOfDay(end) };
}

function buildTimelineExtent(
  rootSchedule: ItemSchedule,
  taskSchedules: ItemSchedule[],
): TimelineWindow | null {
  const dates: Date[] = [];
  const allSchedules = [rootSchedule, ...taskSchedules];
  for (const schedule of allSchedules) {
    if (schedule.kind === "BAR") {
      dates.push(schedule.start, schedule.end);
    } else if (schedule.kind === "MILESTONE") {
      dates.push(schedule.date);
    }
  }

  if (dates.length === 0) return null;

  const minDate = new Date(Math.min(...dates.map((date) => date.getTime())));
  const maxDate = new Date(Math.max(...dates.map((date) => date.getTime())));
  const start = addDays(toStartOfDay(minDate), -7);
  const end = addDays(toStartOfDay(maxDate), 7);
  if (end.getTime() <= start.getTime()) {
    return { start, end: addDays(start, 1) };
  }
  return { start, end };
}

function visibleColumnCountForWidth(chartWidth: number): number {
  return Math.max(
    TIMELINE_MIN_VISIBLE_COLUMNS,
    Math.min(TIMELINE_MAX_VISIBLE_COLUMNS, Math.floor(chartWidth / TIMELINE_MIN_COLUMN_WIDTH)),
  );
}

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(toStartOfDay(date), mondayOffset);
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfQuarter(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
}

function alignPeriodStart(date: Date, zoomLevel: ZoomLevel): Date {
  if (zoomLevel === "WEEK") return startOfWeek(date);
  if (zoomLevel === "MONTH") return startOfMonth(date);
  return startOfQuarter(date);
}

function addTimelineColumns(date: Date, zoomLevel: ZoomLevel, columns: number): Date {
  if (zoomLevel === "WEEK") return addDays(date, columns * 7);
  if (zoomLevel === "MONTH") return addMonths(date, columns);
  return addMonths(date, columns * 3);
}

function currentPeriodStart(extent: TimelineWindow, zoomLevel: ZoomLevel): Date {
  const today = toStartOfDay(new Date());
  const todayIsInsideExtent = today.getTime() >= extent.start.getTime() && today.getTime() <= extent.end.getTime();
  return alignPeriodStart(todayIsInsideExtent ? today : extent.start, zoomLevel);
}

function buildVisibleTimelineWindow(extent: TimelineWindow, zoomLevel: ZoomLevel, windowOffset: number, visibleColumnCount: number): TimelineWindow {
  const baseStart = currentPeriodStart(extent, zoomLevel);
  const start = addTimelineColumns(baseStart, zoomLevel, windowOffset * visibleColumnCount);
  return { start, end: addTimelineColumns(start, zoomLevel, visibleColumnCount) };
}

function formatQuarterLabel(date: Date): string {
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
}

function buildTicks(windowRange: TimelineWindow, zoomLevel: ZoomLevel, visibleColumnCount: number): Tick[] {
  const ticks: Tick[] = [];
  const weekFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short" });

  for (let index = 0; index < visibleColumnCount; index += 1) {
    const date = addTimelineColumns(windowRange.start, zoomLevel, index);
    ticks.push({
      date,
      label: zoomLevel === "WEEK" ? weekFmt.format(date) : zoomLevel === "MONTH" ? monthFmt.format(date) : formatQuarterLabel(date),
    });
  }

  return ticks;
}

function collectCategoryTaskRows(
  tasks: TimelineItemRecord[],
  expandedIds: Set<string>,
  scheduleById: Map<string, ItemSchedule>,
): TaskRow[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const childrenByParent = new Map<string | null, TimelineItemRecord[]>();

  for (const task of tasks) {
    const parentId = task.parentId && byId.has(task.parentId) ? task.parentId : null;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(task);
    childrenByParent.set(parentId, list);
  }

  for (const group of childrenByParent.values()) {
    group.sort(compareTaskRows);
  }

  const walk = (parentId: string | null, depth: number): TaskRow[] => {
    const siblings = childrenByParent.get(parentId) ?? [];
    return siblings.flatMap((item) => {
      const children = childrenByParent.get(item.id) ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = expandedIds.has(item.id);
      const row: TaskRow = {
        item,
        depth,
        hasChildren,
        isExpanded,
        schedule: scheduleById.get(item.id) ?? NONE_SCHEDULE,
      };

      if (!hasChildren || !isExpanded) {
        return [row];
      }

      return [row, ...walk(item.id, depth + 1)];
    });
  };

  return walk(null, 0);
}

export default function TimelineGanttView({
  items,
  eventName,
  canEdit = true,
  expandedIds,
  onToggleExpand,
  selectedItemId,
  onSelectItem,
  onSaveItem,
  onDeleteTask,
  ownerOptions = [],
  inlineDraft,
  onUpdateInlineDraft,
  onCancelInlineDraft,
  onSaveInlineDraft,
  onOpenItemCreate,
  onAddWorkstream,
}: TimelineGanttViewProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(() => {
    if (typeof window === "undefined") return "MONTH";
    const stored = window.localStorage.getItem(GANTT_ZOOM_KEY)?.trim();
    return stored === "WEEK" || stored === "MONTH" || stored === "QUARTER" ? stored : "MONTH";
  });
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [revealedMobileWorkstreamKey, setRevealedMobileWorkstreamKey] = useState<string | null>(null);
  const [windowOffset, setWindowOffset] = useState(0);
  const [quickEditItemId, setQuickEditItemId] = useState<string | null>(null);
  const [quickEditDraft, setQuickEditDraft] = useState<QuickEditDraft | null>(null);
  const [quickEditError, setQuickEditError] = useState<string | null>(null);
  const [isQuickEditSaving, setIsQuickEditSaving] = useState(false);
  const chartCanvasRef = useRef<HTMLDivElement | null>(null);
  const quickEditPanelRef = useRef<HTMLDivElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(CHART_MIN_WIDTH);

  useEffect(() => {
    window.localStorage.setItem(GANTT_ZOOM_KEY, zoomLevel);
  }, [zoomLevel]);

  useEffect(() => {
    if (!quickEditItemId) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      const element = target instanceof Element ? target : null;
      if (
        !quickEditPanelRef.current?.contains(target) &&
        !element?.closest(".roadmap-quick-edit-date-popover")
      ) {
        setQuickEditItemId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setQuickEditItemId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [quickEditItemId]);

  useEffect(() => {
    const node = chartCanvasRef.current;
    if (!node) return;

    const applyWidth = () => setCanvasWidth(Math.max(CHART_MIN_WIDTH, Math.floor(node.getBoundingClientRect().width)));
    applyWidth();

    const observer = new ResizeObserver(() => applyWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rootEventItem = useMemo(
    () => items.find((item) => isRootTimelineItem(item)) ?? null,
    [items],
  );

  const taskItems = useMemo(
    () => items.filter((item) => !isRootTimelineItem(item)),
    [items],
  );

  const todayForMetrics = useMemo(() => timelineTodayDateOnly(), []);

  const scheduleById = useMemo(() => {
    const map = new Map<string, ItemSchedule>();
    for (const item of items) {
      map.set(item.id, getItemSchedule(item));
    }
    return map;
  }, [items]);

  const eventSchedule = useMemo(() => {
    if (!rootEventItem) return NONE_SCHEDULE;
    return scheduleById.get(rootEventItem.id) ?? NONE_SCHEDULE;
  }, [rootEventItem, scheduleById]);

  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, TimelineItemRecord[]>();
    for (const task of taskItems) {
      const key = workstreamGroupKey(task);
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }

    return [...map.entries()]
      .map(([key, tasks]) => ({
        key,
        label: getWorkstreamLabel(key),
        tasks: [...tasks].sort(compareTaskRows),
        atRiskCount: tasks.filter((task) => task.status === "AT_RISK").length,
        overdueCount: tasks.filter((task) => itemIsOverdue(task, todayForMetrics)).length,
        nextDueDate: nextOpenDueDate(tasks, todayForMetrics),
        schedule: buildGroupSchedule(tasks),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [taskItems, todayForMetrics]);

  const taskSchedules = useMemo(
    () => taskItems.map((item): ItemSchedule => scheduleById.get(item.id) ?? NONE_SCHEDULE),
    [scheduleById, taskItems],
  );

  const timelineExtent = useMemo(
    () => buildTimelineExtent(eventSchedule, taskSchedules),
    [eventSchedule, taskSchedules],
  );
  const visibleColumnCount = visibleColumnCountForWidth(canvasWidth);

  const timelineWindow = useMemo(
    () => (timelineExtent ? buildVisibleTimelineWindow(timelineExtent, zoomLevel, windowOffset, visibleColumnCount) : null),
    [timelineExtent, visibleColumnCount, windowOffset, zoomLevel],
  );

  const timelineRows = useMemo(() => {
    const rows: Array<
      | { kind: "EVENT"; key: string; schedule: ItemSchedule }
      | { kind: "DEPARTMENT"; key: string; group: CategoryGroup }
      | { kind: "INLINE_CREATE"; key: string; group: CategoryGroup }
      | { kind: "TASK"; key: string; groupKey: string; row: TaskRow }
    > = [];

    rows.push({ kind: "EVENT", key: rootEventItem?.id ?? "event-row", schedule: eventSchedule });

    for (const group of categoryGroups) {
      rows.push({ kind: "DEPARTMENT", key: `dept-${group.key}`, group });
      if (inlineDraft?.workstream === group.key) {
        rows.push({ kind: "INLINE_CREATE", key: `inline-create-${group.key}`, group });
      }
      if (!expandedCategories.has(group.key)) continue;
      const childRows = collectCategoryTaskRows(group.tasks, expandedIds, scheduleById);
      for (const childRow of childRows) {
        rows.push({
          kind: "TASK",
          key: `task-${childRow.item.id}`,
          groupKey: group.key,
          row: childRow,
        });
      }
    }

    return rows;
  }, [categoryGroups, eventSchedule, expandedCategories, expandedIds, inlineDraft?.workstream, rootEventItem?.id, scheduleById]);

  const quickEditItem = useMemo(
    () => taskItems.find((item) => item.id === quickEditItemId) ?? null,
    [quickEditItemId, taskItems],
  );

  const openQuickEdit = useCallback((item: TimelineItemRecord) => {
    onSelectItem(item.id);
    setQuickEditItemId(item.id);
    setQuickEditDraft({
      title: item.title,
      status: item.status,
      dueDate: toDateInput(item.endDate ?? item.startDate),
      ownerUserId: item.ownerUser?.id ?? "",
      priority: item.priority,
      isCriticalPath: item.isCriticalPath,
      planningStage: item.planningStage ?? "",
      workstream: item.workstream ?? resolveWorkstream(item.department) ?? "",
    });
    setQuickEditError(null);
  }, [onSelectItem]);

  useEffect(() => {
    if (!selectedItemId || quickEditItemId === selectedItemId) return;
    const item = taskItems.find((candidate) => candidate.id === selectedItemId);
    if (!item) return;
    openQuickEdit(item);
  }, [openQuickEdit, quickEditItemId, selectedItemId, taskItems]);

  function updateQuickEditDraft(patch: Partial<QuickEditDraft>) {
    setQuickEditDraft((current) => (current ? { ...current, ...patch } : current));
    setQuickEditError(null);
  }

  async function saveQuickEdit() {
    if (!quickEditItem || !quickEditDraft || isQuickEditSaving) return;
    const title = quickEditDraft.title.trim();
    if (!title) {
      setQuickEditError("Item name is required.");
      return;
    }

    setIsQuickEditSaving(true);
    setQuickEditError(null);
    try {
      await onSaveItem(quickEditItem.id, {
        title,
        status: quickEditDraft.status,
        endDate: quickEditDraft.dueDate || null,
        ownerUserId: quickEditDraft.ownerUserId || null,
        priority: quickEditDraft.priority,
        isCriticalPath: quickEditDraft.isCriticalPath,
        planningStage: quickEditDraft.planningStage || null,
        workstream: quickEditDraft.workstream || null,
      });
      setQuickEditItemId(null);
      setQuickEditDraft(null);
    } catch (error) {
      setQuickEditError(error instanceof Error ? error.message : "Failed to update roadmap item.");
    } finally {
      setIsQuickEditSaving(false);
    }
  }

  if (!timelineWindow) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timeline</span>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(["WEEK", "MONTH", "QUARTER"] as const).map((zoom) => (
              <button
                key={zoom}
                type="button"
                onClick={() => setZoomLevel(zoom)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  zoomLevel === zoom ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {zoom === "WEEK" ? "Week" : zoom === "MONTH" ? "Month" : "Quarter"}
              </button>
            ))}
          </div>
        </div>
        <div className="p-6 text-sm text-slate-500">No dated items yet</div>
      </div>
    );
  }

  const timelineExtentSafe = timelineExtent ?? timelineWindow;
  const totalDays = Math.max(1, diffDays(timelineWindow.end, timelineWindow.start));
  const ticks = buildTicks(timelineWindow, zoomLevel, visibleColumnCount);
  const canPagePrevious = timelineWindow.start.getTime() > timelineExtentSafe.start.getTime();
  const canPageNext = timelineWindow.end.getTime() < timelineExtentSafe.end.getTime();
  const columnWidth = canvasWidth / visibleColumnCount;

  const dateToPx = (date: Date): number => {
    const dayOffset = diffDays(date, timelineWindow.start);
    return (Math.max(0, Math.min(totalDays, dayOffset)) / totalDays) * canvasWidth;
  };

  const tickPositions = ticks.map((tick) => ({ ...tick, x: dateToPx(tick.date), labelX: dateToPx(tick.date) + columnWidth / 2 }));
  const today = timelineTodayDateOnly();
  const todayOffset = diffDays(today, timelineWindow.start);
  const showToday = todayOffset >= 0 && todayOffset <= totalDays;
  const todayPx = dateToPx(today);

  const renderSchedule = (
    schedule: ItemSchedule,
    colorClass: string,
    isSelected = false,
    title?: string,
    isCriticalPath = false,
    onClick?: () => void,
  ): ReactNode => {
    if (schedule.kind === "BAR") {
      if (schedule.end.getTime() < timelineWindow.start.getTime() || schedule.start.getTime() > timelineWindow.end.getTime()) {
        return null;
      }
      const clippedStart = new Date(Math.max(schedule.start.getTime(), timelineWindow.start.getTime()));
      const clippedEnd = new Date(Math.min(schedule.end.getTime(), timelineWindow.end.getTime()));
      const startPx = dateToPx(clippedStart);
      const durationDays = Math.max(1, diffDays(clippedEnd, clippedStart));
      const widthPx = Math.max(10, (durationDays / totalDays) * canvasWidth);
      const startsBeforeWindow = schedule.start.getTime() < timelineWindow.start.getTime();
      const endsAfterWindow = schedule.end.getTime() > timelineWindow.end.getTime();
      return (
        <button
          type="button"
          title={title}
          onClick={onClick}
          className={`absolute top-1/2 z-20 h-6 -translate-y-1/2 rounded-full border shadow-sm ${
            colorClass
          } ${isCriticalPath ? "border-red-500" : "border-slate-500/25"} ${
            isSelected ? "ring-2 ring-blue-200" : ""
          } ${onClick ? "cursor-pointer hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-blue-200" : ""} ${
            startsBeforeWindow ? "rounded-l-sm" : ""
          } ${endsAfterWindow ? "rounded-r-sm" : ""}`}
          style={{ left: `${startPx}px`, width: `${widthPx}px` }}
        />
      );
    }

    if (schedule.kind === "MILESTONE") {
      if (schedule.date.getTime() < timelineWindow.start.getTime() || schedule.date.getTime() > timelineWindow.end.getTime()) {
        return null;
      }
      const leftPx = dateToPx(schedule.date);
      return (
        <button
          type="button"
          title={title}
          onClick={onClick}
          className={`absolute top-1/2 z-30 h-3 w-3 -translate-y-1/2 rotate-45 border border-red-600 bg-red-500 ${
            isSelected ? "ring-2 ring-blue-200" : ""
          } ${onClick ? "cursor-pointer hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-blue-200" : ""}`}
          style={{ left: `${leftPx - 6}px` }}
        />
      );
    }

    return <span className="text-xs italic text-slate-400">No date</span>;
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Roadmap timeline</span>
          <p className="mt-0.5 text-xs text-slate-500">Workstreams, items, and critical path across the event schedule</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setWindowOffset((current) => current - 1)}
              disabled={!canPagePrevious}
              className="rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setWindowOffset(0)}
              className="rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setWindowOffset((current) => current + 1)}
              disabled={!canPageNext}
              className="rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Next
            </button>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(["WEEK", "MONTH", "QUARTER"] as const).map((zoom) => (
            <button
              key={zoom}
              type="button"
              onClick={() => {
                setZoomLevel(zoom);
                setWindowOffset(0);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                zoomLevel === zoom ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              {zoom === "WEEK" ? "Week" : zoom === "MONTH" ? "Month" : "Quarter"}
            </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-h-[720px] overflow-y-auto overflow-x-hidden">
        <div className="sticky top-0 z-30 bg-white">
          <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
            <div className="sticky left-0 z-40 flex h-11 items-center justify-between gap-2 border-r border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Timeline hierarchy</span>
              {canEdit && onAddWorkstream ? (
                <button
                  type="button"
                  onClick={onAddWorkstream}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold normal-case tracking-normal text-blue-700 hover:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add workstream
                </button>
              ) : null}
            </div>
            <div ref={chartCanvasRef} className="relative h-11 bg-white">
              {tickPositions.map((tick) => (
                <div
                  key={`header-grid-${tick.date.toISOString()}`}
                  className="pointer-events-none absolute inset-y-0 z-0 border-l border-slate-200"
                  style={{ left: `${tick.x}px` }}
                />
              ))}
              {showToday ? (
                <>
                  <div
                    className="pointer-events-none absolute inset-y-0 z-10 border-l border-rose-300"
                    style={{ left: `${todayPx}px` }}
                  />
                  <span
                    className="pointer-events-none absolute top-1 z-20 h-2 w-2 -translate-x-1/2 rounded-full bg-rose-500"
                    style={{ left: `${todayPx}px` }}
                  />
                </>
              ) : null}
              {tickPositions.map((tick) => (
                <div
                  key={`tick-${tick.date.toISOString()}`}
                  className="pointer-events-none absolute inset-y-0 flex items-center justify-center text-xs text-slate-500"
                  style={{ left: `${tick.labelX}px`, transform: "translateX(-50%)" }}
                >
                  <span className="whitespace-nowrap">{tick.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {timelineRows.map((row, index) => {
          const isStriped = index % 2 === 0;
          const rowTone = isStriped ? "bg-white" : "bg-slate-50/60";

          if (row.kind === "EVENT") {
            const rowHeight = 56;
            return (
              <div key={row.key} className="grid border-b border-slate-100" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                <div className={`sticky left-0 z-10 border-r border-slate-200 px-3 py-2 ${rowTone}`}>
                  <div className="flex min-h-[56px] items-center gap-3 pl-2">
                    <span className="h-2.5 w-2.5 rounded-full border border-blue-700 bg-blue-100" />
                    <div className="min-w-0">
                      <p className="max-w-[310px] overflow-hidden text-ellipsis whitespace-nowrap text-xl font-semibold leading-tight text-slate-900">
                        {eventName || "Event Timeline"}
                      </p>
                      {row.schedule.kind !== "NONE" ? (
                        <p className="mt-1 text-sm text-slate-500">{formatRange(row.schedule)}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className={`relative border-l border-slate-200 px-3 ${rowTone}`} style={{ height: `${rowHeight}px` }}>
                  {tickPositions.map((tick) => (
                    <div
                      key={`grid-${row.key}-${tick.date.toISOString()}`}
                      className="pointer-events-none absolute inset-y-0 z-0 border-l border-slate-200"
                      style={{ left: `${tick.x}px` }}
                    />
                  ))}
                  {showToday ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-10 border-l border-rose-300"
                      style={{ left: `${todayPx}px` }}
                    />
                  ) : null}
                  {renderSchedule(
                    row.schedule.kind === "NONE"
                      ? { kind: "BAR", start: timelineWindow.start, end: timelineWindow.end }
                      : row.schedule,
                    "bg-blue-700",
                    false,
                    "Event Timeline",
                  )}
                </div>
              </div>
            );
          }

          if (row.kind === "DEPARTMENT") {
            const rowHeight = 64;
            const isCollapsed = !expandedCategories.has(row.group.key);
            const theme = getWorkstreamTheme(row.group.key);
            const actionTone = workstreamActionTone(row.group.key);
            const isMobileActionRevealed = revealedMobileWorkstreamKey === row.group.key;
            const hasHealthIssue = workstreamHasHealthIssue(row.group);
            const { itemCount, hasCriticalPath } = getTimelineGroupSummary(row.group.tasks);
            const countBadgeTone = workstreamCountBadgeTone(hasHealthIssue);
            const countBadgeLabel = `${itemCount} ${itemCount === 1 ? "item" : "items"}${
              hasCriticalPath ? ", includes critical path" : ""
            }`;
            return (
              <Fragment key={row.key}>
              <div
                className="group grid border-y border-slate-200 bg-white transition-colors"
                style={{ gridTemplateColumns: GRID_TEMPLATE }}
                onClick={() =>
                  setRevealedMobileWorkstreamKey((current) => (current === row.group.key ? null : row.group.key))
                }
              >
                <div className={`sticky left-0 z-20 border-r border-slate-200 bg-white px-3 py-2.5 transition-colors ${actionTone.rowTint}`}>
                  <div className="grid h-full min-w-0 items-center gap-2" style={{ gridTemplateColumns: "1.75rem 2.25rem minmax(0, auto) minmax(0, 1fr) auto" }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedCategories((current) => {
                          const next = new Set(current);
                          if (next.has(row.group.key)) next.delete(row.group.key);
                          else next.add(row.group.key);
                          return next;
                        });
                      }}
                      aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${row.group.label} workstream`}
                      className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-100"
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <span
                      aria-label={countBadgeLabel}
                      title={countBadgeLabel}
                      className={`inline-flex h-8 min-w-8 justify-self-center shrink-0 items-center justify-center gap-0.5 rounded-full border px-2 text-[13px] font-bold leading-none ${countBadgeTone}`}
                    >
                      {hasCriticalPath ? <Flame className="h-3 w-3" aria-hidden /> : null}
                      <span>{itemCount}</span>
                    </span>
                    <span className={`min-w-0 max-w-[135px] truncate rounded-full px-2.5 py-1 text-sm font-semibold ${theme.badge}`}>
                      {row.group.label}
                    </span>
                    {row.group.nextDueDate ? (
                      <span className="min-w-0 truncate text-[11px] font-medium text-slate-500">
                        Next due {formatDate(row.group.nextDueDate)}
                      </span>
                    ) : (
                      <span aria-hidden />
                    )}
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenItemCreate(row.group.key as TimelineWorkstream | "UNASSIGNED");
                        }}
                        aria-label={`Add item to ${row.group.label}`}
                        className={[
                          "pointer-events-none hidden shrink-0 items-center gap-1 rounded-lg border bg-white/70 px-2 py-1 text-[12px] font-semibold opacity-0 transition-opacity focus:outline-none focus:ring-2 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 sm:inline-flex",
                          actionTone.button,
                        ].join(" ")}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add item
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className={`relative border-l border-slate-200 bg-white px-3 transition-colors ${actionTone.rowTint}`} style={{ height: `${rowHeight}px` }}>
                  {tickPositions.map((tick) => (
                    <div
                      key={`grid-${row.key}-${tick.date.toISOString()}`}
                      className="pointer-events-none absolute inset-y-0 z-0 border-l border-slate-200"
                      style={{ left: `${tick.x}px` }}
                    />
                  ))}
                  {showToday ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-10 border-l border-rose-300"
                      style={{ left: `${todayPx}px` }}
                    />
                  ) : null}
                  {renderSchedule(
                    row.group.schedule,
                    `${theme.bar} opacity-80`,
                    false,
                    `${row.group.label} rollup`,
                  )}
                </div>
              </div>
              {canEdit && isMobileActionRevealed ? (
                <div className="grid border-b border-slate-200 bg-white sm:hidden" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                  <div className={`sticky left-0 z-20 border-r border-slate-200 bg-white px-3 pb-3 transition-colors ${actionTone.rowTint}`}>
                    <button
                      type="button"
                      onClick={() => onOpenItemCreate(row.group.key as TimelineWorkstream | "UNASSIGNED")}
                      className={[
                        "inline-flex h-11 w-full max-w-[330px] items-center justify-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold focus:outline-none focus:ring-2",
                        actionTone.mobileButton,
                      ].join(" ")}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Add item to {row.group.label}
                    </button>
                  </div>
                  <div className={`border-l border-slate-200 bg-white ${actionTone.rowTint}`} />
                </div>
              ) : null}
              </Fragment>
            );
          }

          if (row.kind === "INLINE_CREATE") {
            const rowHeight = 60;
            const titleIsEmpty = !inlineDraft?.title.trim();
            return (
              <div key={row.key} className="grid border-b border-blue-100 bg-blue-50/40" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                <div className="sticky left-0 z-10 border-r border-blue-100 bg-blue-50/95 px-3 py-2">
                  <div className="flex min-h-[44px] items-center gap-2 pl-8">
                    <input
                      value={inlineDraft?.title ?? ""}
                      onChange={(event) => onUpdateInlineDraft({ title: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !titleIsEmpty) {
                          event.preventDefault();
                          onSaveInlineDraft();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          onCancelInlineDraft();
                        }
                      }}
                      placeholder="Item title..."
                      aria-label="Inline item title"
                      autoFocus
                      className="h-9 min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 text-sm text-slate-800 outline-none ring-blue-100 focus:ring-2"
                    />
                    <select
                      value={inlineDraft?.planningStage ?? "PLANNING"}
                      onChange={(event) => onUpdateInlineDraft({ planningStage: event.target.value as TimelinePlanningStage })}
                      aria-label="Inline planning stage"
                      className="hidden h-9 rounded-lg border border-blue-200 bg-white px-2 text-xs text-slate-600 lg:block"
                    >
                      {TIMELINE_PLANNING_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {getPlanningStageLabel(stage)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="relative border-l border-blue-100 bg-blue-50/30 px-3" style={{ height: `${rowHeight}px` }}>
                  {tickPositions.map((tick) => (
                    <div
                      key={`grid-${row.key}-${tick.date.toISOString()}`}
                      className="pointer-events-none absolute inset-y-0 z-0 border-l border-slate-200"
                      style={{ left: `${tick.x}px` }}
                    />
                  ))}
                  <div className="relative z-20 flex h-full items-center gap-2 overflow-x-auto">
                    {inlineDraft?.kind === "TASK" ? (
                      <>
                        <DateField
                          value={inlineDraft.startDate}
                          onChange={(value) => onUpdateInlineDraft({ startDate: value })}
                          ariaLabel="Inline start date"
                          size="compact"
                          className="min-w-[126px]"
                          buttonClassName="h-9 rounded-lg border-blue-200 px-2 text-xs text-slate-600"
                        />
                        <DateField
                          value={inlineDraft.endDate}
                          min={inlineDraft.startDate || undefined}
                          onChange={(value) => onUpdateInlineDraft({ endDate: value })}
                          ariaLabel="Inline end date"
                          size="compact"
                          className="min-w-[126px]"
                          buttonClassName="h-9 rounded-lg border-blue-200 px-2 text-xs text-slate-600"
                        />
                      </>
                    ) : (
                      <DateField
                        value={inlineDraft?.startDate ?? ""}
                        onChange={(value) => onUpdateInlineDraft({ startDate: value, endDate: value })}
                        ariaLabel="Inline item date"
                        size="compact"
                        className="min-w-[126px]"
                        buttonClassName="h-9 rounded-lg border-blue-200 px-2 text-xs text-slate-600"
                      />
                    )}
                    <select
                      value={inlineDraft?.ownerUserId ?? ""}
                      onChange={(event) => onUpdateInlineDraft({ ownerUserId: event.target.value })}
                      aria-label="Inline owner"
                      className="h-9 max-w-[160px] rounded-lg border border-blue-200 bg-white px-2 text-xs text-slate-600"
                    >
                      <option value="">Unassigned</option>
                      {inlineDraft?.ownerUserId && !ownerOptions.some((owner) => owner.id === inlineDraft.ownerUserId) ? <option value={inlineDraft.ownerUserId} disabled>Current owner — no longer has event access</option> : null}
                      {ownerOptions.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {ownerLabel(owner)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={onSaveInlineDraft}
                      disabled={titleIsEmpty || inlineDraft?.isSaving}
                      className="h-9 rounded-lg bg-blue-700 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {inlineDraft?.isSaving ? "Creating..." : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={onCancelInlineDraft}
                      className="h-9 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          const rowHeight = 48;
          const task = row.row.item;
          const schedule = row.row.schedule;
          const isSelected = selectedItemId === task.id;
          const ownerText = task.ownerUser ? ownerLabel(task.ownerUser) : "Unassigned";
          const taskIsAttention = itemIsOverdue(task, todayForMetrics) || task.status === "AT_RISK";

          return (
            <div key={row.key} className="group grid border-b border-slate-100" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
              <div
                className={`sticky left-0 z-10 border-r border-slate-200 px-3 py-1.5 ${rowTone}`}
                style={{ paddingLeft: `${row.row.depth * 18 + 34}px` }}
              >
                <div className="flex h-full items-center gap-2">
                  {row.row.hasChildren ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleExpand(task.id);
                      }}
                      className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
                    >
                      {row.row.isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  ) : (
                    <span className="inline-block h-4 w-4" />
                  )}

                  <button
                    type="button"
                    onClick={() => openQuickEdit(task)}
                    className={[
                      "min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-200",
                      isSelected
                        ? "border-blue-200 bg-blue-50 text-blue-800"
                        : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white hover:shadow-sm",
                    ].join(" ")}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${taskIsAttention ? "bg-rose-500" : "bg-slate-300"}`} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{task.title}</span>
                      {task.isCriticalPath ? (
                        <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">CP</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="truncate">{getStatusDisplay(task.status)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{ownerText}</span>
                    </span>
                  </button>

                  {task.planningStage ? (
                    <span className="hidden shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 xl:inline-flex">
                      {getPlanningStageLabel(task.planningStage)}
                    </span>
                  ) : null}

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteTask(task.id);
                    }}
                    className="ml-auto rounded p-1 text-rose-600 opacity-0 transition-opacity hover:bg-rose-50 group-hover:opacity-100"
                    title="Delete item"
                    aria-label="Delete item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className={`relative border-l border-slate-200 px-3 ${rowTone}`} style={{ height: `${rowHeight}px` }}>
                {tickPositions.map((tick) => (
                  <div
                    key={`grid-${row.key}-${tick.date.toISOString()}`}
                    className="pointer-events-none absolute inset-y-0 z-0 border-l border-slate-200"
                    style={{ left: `${tick.x}px` }}
                  />
                ))}
                {showToday ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 z-10 border-l border-rose-300"
                    style={{ left: `${todayPx}px` }}
                  />
                ) : null}
                {renderSchedule(
                  schedule,
                  getWorkstreamTheme(workstreamGroupKey(task)).bar,
                  isSelected,
                  scheduleTooltip(task, schedule),
                  task.isCriticalPath || task.priority === "CRITICAL",
                  () => openQuickEdit(task),
                )}
              </div>
            </div>
          );
        })}
      </div>

      {quickEditItem && quickEditDraft
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[90]">
              <aside
                ref={quickEditPanelRef}
                className="pointer-events-auto absolute right-4 top-24 flex max-h-[calc(100vh-7rem)] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] ring-1 ring-slate-950/5"
                role="dialog"
                aria-label={`Quick edit ${quickEditItem.title}`}
              >
                <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quick edit</p>
                      <h3 className="mt-1 truncate text-base font-semibold text-slate-950">{quickEditItem.title}</h3>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                        {formatRange(getItemSchedule(quickEditItem))}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuickEditItemId(null)}
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900"
                      aria-label="Close quick edit"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Item name</span>
                    <input
                      value={quickEditDraft.title}
                      onChange={(event) => updateQuickEditDraft({ title: event.target.value })}
                      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">Status</span>
                      <select
                        value={quickEditDraft.status}
                        onChange={(event) => updateQuickEditDraft({ status: event.target.value as TimelineStatus })}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {getStatusDisplay(status)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">Priority</span>
                      <select
                        value={quickEditDraft.priority}
                        onChange={(event) => updateQuickEditDraft({ priority: event.target.value as TimelinePriority })}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
                      >
                        {PRIORITY_OPTIONS.map((priority) => (
                          <option key={priority} value={priority}>
                            {getPriorityDisplay(priority)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="mb-1 block text-xs font-semibold text-slate-600">Due date</span>
                      <DateField
                        value={quickEditDraft.dueDate}
                        min={toDateInput(quickEditItem.startDate) || undefined}
                        onChange={(value) => updateQuickEditDraft({ dueDate: value })}
                        ariaLabel="Quick edit due date"
                        popoverClassName="roadmap-quick-edit-date-popover right-0 left-auto"
                        size="compact"
                      />
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">Owner</span>
                      <select
                        value={quickEditDraft.ownerUserId}
                        onChange={(event) => updateQuickEditDraft({ ownerUserId: event.target.value })}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
                      >
                        <option value="">Unassigned</option>
                        {quickEditItem?.ownerUser?.id && !ownerOptions.some((owner) => owner.id === quickEditItem.ownerUser?.id) ? <option value={quickEditItem.ownerUser.id} disabled>{ownerLabel(quickEditItem.ownerUser)} — no longer has event access</option> : null}
                        {ownerOptions.map((owner) => (
                          <option key={owner.id} value={owner.id}>
                            {ownerLabel(owner)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">Stage</span>
                      <select
                        value={quickEditDraft.planningStage}
                        onChange={(event) => updateQuickEditDraft({ planningStage: event.target.value as TimelinePlanningStage | "" })}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
                      >
                        <option value="">No stage</option>
                        {TIMELINE_PLANNING_STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {PLANNING_STAGE_LABELS[stage]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">Workstream</span>
                      <select
                        value={quickEditDraft.workstream}
                        onChange={(event) => updateQuickEditDraft({ workstream: event.target.value as TimelineWorkstream | "" })}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
                      >
                        <option value="">Unassigned</option>
                        {TIMELINE_WORKSTREAMS.map((workstream) => (
                          <option key={workstream} value={workstream}>
                            {WORKSTREAM_LABELS[workstream]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2">
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Critical path</span>
                      <span className="text-xs text-slate-500">Highlight this item in roadmap risk views.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={quickEditDraft.isCriticalPath}
                      onChange={(event) => updateQuickEditDraft({ isCriticalPath: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 accent-rose-600"
                    />
                  </label>

                  {quickEditError ? (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {quickEditError}
                    </p>
                  ) : null}

                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteTask(quickEditItem.id);
                      setQuickEditItemId(null);
                    }}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  >
                    Delete
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickEditItemId(null)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveQuickEdit()}
                      disabled={isQuickEditSaving}
                      className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isQuickEditSaving ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
