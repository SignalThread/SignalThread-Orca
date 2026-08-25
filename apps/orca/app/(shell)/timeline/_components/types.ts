import {
  EVENT_CATEGORY_OPTIONS,
  getEventCategoryDisplay,
  normalizeEventCategory,
  type EventCategory,
} from "@/lib/event-categories";
import { parseTimelineDateOnly } from "@/lib/timeline/date-normalization";

import type { TimelinePlanningStage, TimelineWorkstream } from "@prisma/client";

export type TimelineViewMode = "DASHBOARD" | "LIST" | "BOARD" | "TIMELINE";

export type TimelineStatus = "NOT_STARTED" | "IN_PROGRESS" | "AT_RISK" | "COMPLETE";
export type TimelinePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TimelineItemDisposition = "ACTIVE" | "NOT_NEEDED";

export type { TimelinePlanningStage, TimelineWorkstream };

export type TimelineItemRecord = {
  id: string;
  eventId: string;
  title: string;
  notes: string | null;
  department: string | null;
  workstream: TimelineWorkstream | null;
  planningStage: TimelinePlanningStage | null;
  status: TimelineStatus;
  priority: TimelinePriority;
  isCriticalPath: boolean;
  ownerUser: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  startDate: string | null;
  endDate: string | null;
  progress: number | null;
  sortOrder: number;
  parentId: string | null;
  disposition: TimelineItemDisposition;
  dispositionReason: string | null;
  dispositionActorUserId: string | null;
  dispositionAt: string | null;
  updatedAt: string;
};

export type TimelineItemPatch = {
  title?: string;
  notes?: string | null;
  department?: string | null;
  workstream?: TimelineWorkstream | null;
  planningStage?: TimelinePlanningStage | null;
  status?: TimelineStatus;
  priority?: TimelinePriority;
  isCriticalPath?: boolean;
  ownerUserId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  progress?: number | null;
  dueDate?: string | null;
  parentId?: string | null;
  disposition?: TimelineItemDisposition;
  dispositionReason?: string | null;
  expectedUpdatedAt?: string;
};

export type TimelineOwnerOption = {
  id: string;
  name: string | null;
  email: string;
};

export const CATEGORY_OPTIONS = EVENT_CATEGORY_OPTIONS;
export const DEPARTMENT_OPTIONS = CATEGORY_OPTIONS;

const categoryBadgeClassByKey: Record<EventCategory, string> = {
  "F&B": "bg-orange-100 text-orange-700",
  AV: "bg-purple-100 text-purple-700",
  Rooms: "bg-teal-100 text-teal-700",
  Staffing: "bg-cyan-100 text-cyan-700",
  Production: "bg-blue-100 text-blue-700",
  Decor: "bg-pink-100 text-pink-700",
};

const categoryBarClassByKey: Record<EventCategory, string> = {
  "F&B": "bg-orange-400",
  AV: "bg-purple-400",
  Rooms: "bg-teal-400",
  Staffing: "bg-cyan-400",
  Production: "bg-blue-400",
  Decor: "bg-pink-400",
};

export function normalizeCategoryKey(value: string | null | undefined): EventCategory {
  return normalizeEventCategory(value);
}

export function getCategoryDisplay(value: string | null | undefined): string {
  return getEventCategoryDisplay(value);
}

export function getCategoryBadgeClass(value: string | null | undefined): string {
  return categoryBadgeClassByKey[normalizeCategoryKey(value)];
}

export function getCategoryBarClass(value: string | null | undefined): string {
  return categoryBarClassByKey[normalizeCategoryKey(value)];
}

// Backward-compatible aliases while timeline DB field remains `department`.
export function normalizeDepartmentKey(value: string | null | undefined): EventCategory {
  return normalizeCategoryKey(value);
}

export function getDepartmentDisplay(value: string | null | undefined): string {
  return getCategoryDisplay(value);
}

export function getDepartmentBadgeClass(value: string | null | undefined): string {
  return getCategoryBadgeClass(value);
}

export function getDepartmentBarClass(value: string | null | undefined): string {
  return getCategoryBarClass(value);
}

const statusDisplayByValue: Record<TimelineStatus, string> = {
  NOT_STARTED: "Backlog",
  IN_PROGRESS: "In Progress",
  AT_RISK: "At Risk",
  COMPLETE: "Complete",
};

const statusClassByDisplay: Record<string, string> = {
  Complete: "bg-green-100 text-green-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Backlog: "bg-gray-100 text-gray-600",
  Review: "bg-yellow-100 text-yellow-700",
  Blocked: "bg-red-100 text-red-700",
  "At Risk": "bg-red-100 text-red-700",
};

export function getStatusDisplay(status: TimelineStatus): string {
  return statusDisplayByValue[status];
}

export function getStatusBadgeClass(status: TimelineStatus, displayOverride?: string): string {
  const display = displayOverride ?? getStatusDisplay(status);
  return statusClassByDisplay[display] ?? "bg-gray-100 text-gray-600";
}

export function getPriorityBadgeClass(priority: TimelinePriority): string {
  if (priority === "CRITICAL") return "bg-red-100 text-red-700";
  if (priority === "HIGH") return "bg-orange-100 text-orange-700";
  if (priority === "MEDIUM") return "bg-yellow-100 text-yellow-700";
  return "bg-slate-100 text-slate-600";
}

export function getPriorityDisplay(priority: TimelinePriority): string {
  if (priority === "CRITICAL") return "Critical";
  if (priority === "HIGH") return "High";
  if (priority === "MEDIUM") return "Medium";
  return "Low";
}

export function isRootTimelineItem(item: TimelineItemRecord): boolean {
  return item.parentId === null && item.title.trim().toLowerCase() === "event timeline";
}

export function parseTimelineDate(value: string | null): Date | null {
  return parseTimelineDateOnly(value);
}

export function getListDueDate(item: TimelineItemRecord): string | null {
  return item.endDate ?? item.startDate ?? null;
}
