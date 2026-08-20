import type { EventActivityChange } from "@/src/server/services/event-activity";

/**
 * Pure helpers for recording Roadmap (Timeline) mutations into the canonical
 * EventActivity feed. Timeline remains its own module; this only shapes the
 * event-scoped audit diffs and is unit-testable without a database.
 */

export type TimelineDiffFields = {
  title?: string | null;
  notes?: string | null;
  status?: string | null;
  priority?: string | null;
  workstream?: string | null;
  planningStage?: string | null;
  isCriticalPath?: boolean | null;
  progress?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  ownerUserId?: string | null;
  parentId?: string | null;
  disposition?: string | null;
  dispositionReason?: string | null;
};

const SCALAR_LABELS: Record<string, string> = {
  title: "Title",
  notes: "Notes",
  status: "Status",
  priority: "Priority",
  workstream: "Workstream",
  planningStage: "Stage",
  isCriticalPath: "Critical path",
  progress: "Progress",
  startDate: "Start date",
  endDate: "End date",
  disposition: "Disposition",
  dispositionReason: "Disposition reason",
};

function toDateString(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function scalarValue(field: string, value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (field === "startDate" || field === "endDate") return toDateString(value as Date);
  if (field === "isCriticalPath") return Boolean(value);
  if (field === "progress") return typeof value === "number" ? value : null;
  return String(value);
}

/**
 * Build changed-only diffs between an existing timeline item and a patch. Only
 * fields present in `patch` are considered. Owner/parent changes are rendered
 * from the supplied label maps (names/titles) instead of raw ids where available.
 */
export function buildTimelineDiff(
  before: TimelineDiffFields,
  patch: TimelineDiffFields,
  labels?: { owner?: Map<string, string>; parent?: Map<string, string> },
): EventActivityChange[] {
  const changes: EventActivityChange[] = [];

  for (const field of Object.keys(SCALAR_LABELS)) {
    const key = field as keyof TimelineDiffFields;
    if (!(key in patch) || typeof patch[key] === "undefined") continue;
    const fromVal = scalarValue(field, before[key]);
    const toVal = scalarValue(field, patch[key]);
    if (fromVal === toVal) continue;
    changes.push({ field, label: SCALAR_LABELS[field], from: fromVal, to: toVal });
  }

  if ("ownerUserId" in patch && typeof patch.ownerUserId !== "undefined") {
    if ((before.ownerUserId ?? null) !== (patch.ownerUserId ?? null)) {
      const from = before.ownerUserId ? labels?.owner?.get(before.ownerUserId) ?? before.ownerUserId : null;
      const to = patch.ownerUserId ? labels?.owner?.get(patch.ownerUserId) ?? patch.ownerUserId : null;
      changes.push({ field: "ownerUserId", label: "Owner", from: from ?? null, to: to ?? null });
    }
  }

  if ("parentId" in patch && typeof patch.parentId !== "undefined") {
    if ((before.parentId ?? null) !== (patch.parentId ?? null)) {
      const from = before.parentId ? labels?.parent?.get(before.parentId) ?? before.parentId : null;
      const to = patch.parentId ? labels?.parent?.get(patch.parentId) ?? patch.parentId : null;
      changes.push({ field: "parentId", label: "Parent", from: from ?? null, to: to ?? null });
    }
  }

  return changes;
}

/** True when the patch changes the status field (drives STATUS_CHANGED action). */
export function isStatusOnlyKindChange(changes: EventActivityChange[]): boolean {
  return changes.length > 0 && changes.every((c) => c.field === "status");
}
