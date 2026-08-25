import {
  TimelineDependencyType,
  TimelineItemDisposition,
  TimelinePlanningStage,
  TimelinePriority,
  TimelineStatus,
  TimelineWorkstream,
  UserRole,
  type Prisma,
  type TimelineDependency,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { isEventAssignableUser } from "@/src/server/services/event-assignable-users";
import { recordEventActivity } from "@/src/server/services/event-activity";
import { createAssignmentNotifications } from "@/src/server/services/notifications";
import { buildTimelineDiff, isStatusOnlyKindChange } from "@/src/server/services/timeline-activity-audit";
import { parseTimelineDateOnly } from "@/lib/timeline/date-normalization";
import type {
  CreateTimelineDependencyInput,
  CreateTimelineItemInput,
  BulkDeleteTimelineItemInput,
  BulkUpdateTimelineItemInput,
  ListTimelineItemsQuery,
  UpdateTimelineItemInput,
  ReorderTimelineItemInput,
} from "@/lib/timeline/types";

export class TimelineServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type RequestUserContext = {
  id: string;
  orgId: string | null;
  role: UserRole;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROADMAP_ASSIGNMENT_NOTIFICATION_TYPE = "ROADMAP_ITEM_ASSIGNED";

function roadmapItemHref(eventId: string, itemId: string): string {
  return `/events/${encodeURIComponent(eventId)}/timeline?focus=${encodeURIComponent(itemId)}`;
}

function roadmapAssignmentNotification(input: {
  userId: string;
  orgId: string | null;
  eventId: string;
  actorUserId: string;
  itemId: string;
  itemTitle: string;
}) {
  return {
    userId: input.userId,
    orgId: input.orgId,
    eventId: input.eventId,
    actorUserId: input.actorUserId,
    type: ROADMAP_ASSIGNMENT_NOTIFICATION_TYPE,
    title: "Roadmap item assigned",
    body: `You were assigned to roadmap item “${input.itemTitle}”.`,
    linkUrl: roadmapItemHref(input.eventId, input.itemId),
  };
}

const timelineItemSelect = {
  id: true,
  eventId: true,
  title: true,
  notes: true,
  department: true,
  workstream: true,
  planningStage: true,
  status: true,
  priority: true,
  isCriticalPath: true,
  ownerUserId: true,
  parentId: true,
  startDate: true,
  endDate: true,
  progress: true,
  sortOrder: true,
  disposition: true,
  dispositionReason: true,
  dispositionActorUserId: true,
  dispositionAt: true,
  updatedAt: true,
  // createdAt is intentionally omitted. updatedAt is the optimistic-concurrency
  // token sent back by Roadmap edits, so it is part of the client contract.
  ownerUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.TimelineItemSelect;

export type TimelineItemWithOwner = Prisma.TimelineItemGetPayload<{
  select: typeof timelineItemSelect;
}>;

function parseDateInput(value: string): Date {
  const parsed = parseTimelineDateOnly(value);
  if (!parsed) {
    throw new TimelineServiceError("Date must be valid YYYY-MM-DD", 400);
  }
  return parsed;
}

function normalizeTimelineItemPayload(input: CreateTimelineItemInput | UpdateTimelineItemInput): {
  title?: string;
  notes?: string | null;
  department?: string | null;
  workstream?: TimelineWorkstream | null;
  planningStage?: TimelinePlanningStage | null;
  status?: TimelineStatus;
  priority?: TimelinePriority;
  isCriticalPath?: boolean;
  ownerUserId?: string | null;
  parentId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  progress?: number | null;
  sortOrder?: number;
  disposition?: TimelineItemDisposition;
  dispositionReason?: string | null;
  dispositionActorUserId?: string | null;
  dispositionAt?: Date | null;
} {
  const data: {
    title?: string;
    notes?: string | null;
    department?: string | null;
    workstream?: TimelineWorkstream | null;
    planningStage?: TimelinePlanningStage | null;
    status?: TimelineStatus;
    priority?: TimelinePriority;
    isCriticalPath?: boolean;
    ownerUserId?: string | null;
    parentId?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    progress?: number | null;
    sortOrder?: number;
    disposition?: TimelineItemDisposition;
    dispositionReason?: string | null;
    dispositionActorUserId?: string | null;
    dispositionAt?: Date | null;
  } = {};

  if (typeof input.title !== "undefined") data.title = input.title?.trim() || "New Timeline Item";
  if (typeof input.notes !== "undefined") data.notes = input.notes?.trim() || null;
  if (typeof input.department !== "undefined") data.department = input.department?.trim() || null;
  if (typeof input.workstream !== "undefined") data.workstream = input.workstream ?? null;
  if (typeof input.planningStage !== "undefined") data.planningStage = input.planningStage ?? null;
  if (typeof input.status !== "undefined") data.status = input.status;
  if (typeof input.priority !== "undefined") data.priority = input.priority;
  if (typeof input.isCriticalPath !== "undefined") data.isCriticalPath = input.isCriticalPath;
  if (typeof input.ownerUserId !== "undefined") data.ownerUserId = input.ownerUserId || null;
  if (typeof input.parentId !== "undefined") data.parentId = input.parentId || null;
  if (typeof input.startDate !== "undefined") data.startDate = input.startDate ? parseDateInput(input.startDate) : null;
  if (typeof input.endDate !== "undefined") {
    data.endDate = input.endDate ? parseDateInput(input.endDate) : null;
  }
  const shouldUseMilestoneDate =
    input.kind === "MILESTONE" ||
    (input.kind !== "BAR" &&
      (typeof input.milestoneDate !== "undefined" ||
        typeof input.date !== "undefined" ||
        (typeof input.dueDate !== "undefined" &&
          typeof input.startDate === "undefined" &&
          typeof input.endDate === "undefined")));

  const milestoneValue = input.milestoneDate ?? input.date ?? input.dueDate;
  if (shouldUseMilestoneDate) {
    const milestoneDate = milestoneValue ? parseDateInput(milestoneValue) : null;
    data.startDate = milestoneDate;
    data.endDate = milestoneDate;
  }
  if (typeof input.progress !== "undefined") data.progress = input.progress;
  if (typeof input.sortOrder !== "undefined") data.sortOrder = input.sortOrder;
  if (typeof input.disposition !== "undefined") {
    if (input.disposition === "NOT_NEEDED") {
      const reason = input.dispositionReason?.trim();
      if (!reason) throw new TimelineServiceError("Not Needed requires a reason", 400);
      data.disposition = TimelineItemDisposition.NOT_NEEDED;
      data.dispositionReason = reason;
    } else {
      data.disposition = TimelineItemDisposition.ACTIVE;
      data.dispositionReason = null;
      data.dispositionActorUserId = null;
      data.dispositionAt = null;
    }
  } else if (typeof input.dispositionReason !== "undefined") {
    throw new TimelineServiceError("dispositionReason requires an explicit disposition", 400);
  }

  return data;
}

async function assertTimelineEventAccess(
  eventId: string,
  user: RequestUserContext,
  accessType: "read" | "write",
): Promise<void> {
  try {
    await assertEventAccessForUser(eventId, user, accessType);
  } catch (error) {
    if (error instanceof EventAccessError) {
      throw new TimelineServiceError(error.message, error.status);
    }
    throw error;
  }
}

async function assertOwnerUserBelongsToEventContext(
  eventId: string,
  ownerUserId: string | null | undefined,
): Promise<void> {
  if (!ownerUserId) return;

  const isAssignable = await isEventAssignableUser(eventId, ownerUserId);
  if (!isAssignable) {
    throw new TimelineServiceError("ownerUserId must be a valid assignable user for the event", 400);
  }
}

async function assertParentItemBelongsToEventContext(
  eventId: string,
  parentId: string | null | undefined,
  currentItemId?: string,
): Promise<void> {
  if (!parentId) return;

  if (currentItemId && parentId === currentItemId) {
    throw new TimelineServiceError("parentId cannot reference the same timeline item", 400);
  }

  const parent = await getPrisma().timelineItem.findFirst({
    where: { id: parentId, eventId },
    select: { id: true, parentId: true },
  });

  if (!parent) {
    throw new TimelineServiceError("parentId must be a valid timeline item in the same event", 400);
  }

  const visited = new Set<string>();
  let ancestorId: string | null = parent.id;
  let parentDepth = 0;
  while (ancestorId) {
    if (ancestorId === currentItemId) {
      throw new TimelineServiceError("parentId cannot create a timeline hierarchy cycle", 400);
    }
    if (visited.has(ancestorId)) {
      throw new TimelineServiceError("The existing timeline hierarchy contains a cycle", 409);
    }
    visited.add(ancestorId);
    if (parentDepth >= 2) {
      throw new TimelineServiceError("Timeline hierarchy supports at most three levels", 400);
    }
    const ancestor: { parentId: string | null } | null = await getPrisma().timelineItem.findFirst({
      where: { id: ancestorId, eventId },
      select: { parentId: true },
    });
    ancestorId = ancestor?.parentId ?? null;
    parentDepth += 1;
  }
}

export function forceCompleteProgress<T extends { status?: TimelineStatus; progress?: number | null }>(data: T): T {
  return data.status === TimelineStatus.COMPLETE ? { ...data, progress: 100 } : data;
}

export function collectTimelineDescendantIds(
  rootIds: readonly string[],
  items: readonly { id: string; parentId: string | null }[],
): string[] {
  const collected = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId && collected.has(item.parentId) && !collected.has(item.id)) {
        collected.add(item.id);
        changed = true;
      }
    }
  }
  return Array.from(collected);
}

function mapOrderBy(orderBy: ListTimelineItemsQuery["orderBy"]): Prisma.TimelineItemOrderByWithRelationInput[] {
  switch (orderBy) {
    case "due":
    case "end":
      return [{ endDate: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }];
    case "start":
      return [{ startDate: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }];
    case "sortOrder":
    default:
      return [{ sortOrder: "asc" }, { createdAt: "asc" }];
  }
}

function isEventRootItem(item: { title: string; parentId: string | null }): boolean {
  return item.parentId === null && item.title.trim().toLowerCase() === "event timeline";
}

function ensureCreateDateRange(
  input: CreateTimelineItemInput,
  normalized: ReturnType<typeof normalizeTimelineItemPayload>,
): { startDate: Date | null; endDate: Date | null } {
  const explicitStart = typeof input.startDate !== "undefined";
  const explicitEnd = typeof input.endDate !== "undefined";
  const milestoneRaw = input.milestoneDate ?? input.date ?? input.dueDate ?? null;
  const isMilestone = input.kind === "MILESTONE";
  const isBar = input.kind === "BAR";

  if (isMilestone) {
    if (!milestoneRaw) return { startDate: null, endDate: null };
    const milestoneDate = parseDateInput(milestoneRaw);
    return { startDate: milestoneDate, endDate: milestoneDate };
  }

  if (explicitStart && !explicitEnd) {
    throw new TimelineServiceError("endDate required when startDate is provided", 400);
  }
  if (explicitEnd && !explicitStart) {
    throw new TimelineServiceError("startDate required when endDate is provided", 400);
  }

  if (!normalized.startDate || !normalized.endDate) {
    if (!isBar && milestoneRaw) {
      const milestoneDate = parseDateInput(milestoneRaw);
      return { startDate: milestoneDate, endDate: milestoneDate };
    }
    return { startDate: null, endDate: null };
  }

  const startDate = normalized.startDate;
  const endDate = normalized.endDate;
  if (endDate.getTime() < startDate.getTime()) {
    throw new TimelineServiceError("endDate must be on or after startDate", 400);
  }

  return { startDate, endDate };
}

function hasOwnDateField(
  normalized: ReturnType<typeof normalizeTimelineItemPayload>,
  key: "startDate" | "endDate",
): boolean {
  return Object.prototype.hasOwnProperty.call(normalized, key);
}

function ensureUpdatedDateRange(
  normalized: ReturnType<typeof normalizeTimelineItemPayload>,
  existing: { startDate: Date | null; endDate: Date | null },
): { startDate?: Date | null; endDate?: Date | null } {
  const hasStartPatch = hasOwnDateField(normalized, "startDate");
  const hasEndPatch = hasOwnDateField(normalized, "endDate");

  if (!hasStartPatch && !hasEndPatch) {
    return {};
  }

  const startDate = hasStartPatch ? (normalized.startDate ?? null) : existing.startDate;
  const endDate = hasEndPatch ? (normalized.endDate ?? null) : existing.endDate;

  if (!startDate || !endDate) {
    throw new TimelineServiceError("startDate and endDate required", 400);
  }

  if (endDate.getTime() < startDate.getTime()) {
    throw new TimelineServiceError("endDate must be on or after startDate", 400);
  }

  return { startDate, endDate };
}

export async function listTimelineItems(
  eventId: string,
  user: RequestUserContext,
  filters: ListTimelineItemsQuery,
): Promise<TimelineItemWithOwner[]> {
  await assertTimelineEventAccess(eventId, user, "read");

  const where: Prisma.TimelineItemWhereInput = {
    eventId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.department ? { department: filters.department } : {}),
    ...(filters.workstream ? { workstream: filters.workstream } : {}),
    ...(filters.planningStage ? { planningStage: filters.planningStage } : {}),
    ...(filters.ownerUserId ? { ownerUserId: filters.ownerUserId } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.disposition ? { disposition: filters.disposition } : {}),
  };

  const items = await getPrisma().timelineItem.findMany({
    where,
    orderBy: mapOrderBy(filters.orderBy),
    select: timelineItemSelect,
  });

  return items.sort((left, right) => {
    const leftIsRoot = isEventRootItem(left);
    const rightIsRoot = isEventRootItem(right);
    if (leftIsRoot && !rightIsRoot) return -1;
    if (!leftIsRoot && rightIsRoot) return 1;
    return 0;
  });
}

export async function reorderTimelineItem(
  eventId: string,
  user: RequestUserContext,
  input: ReorderTimelineItemInput,
): Promise<{ moved: boolean; items: Array<{ id: string; sortOrder: number; updatedAt: Date }> }> {
  await assertTimelineEventAccess(eventId, user, "write");

  return getPrisma().$transaction(async (tx) => {
    // Serialize reorders for the same item. An optimistic update alone is not
    // sufficient at PostgreSQL READ COMMITTED isolation because two
    // transactions can both observe and claim the same sort-order snapshot.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timeline-reorder:${input.itemId}`}))`;
    const current = await tx.timelineItem.findFirst({
      where: { id: input.itemId, eventId },
      select: { id: true, title: true, parentId: true, sortOrder: true },
    });
    if (!current) throw new TimelineServiceError("Timeline item not found", 404);
    if (current.sortOrder !== input.expectedSortOrder) {
      throw new TimelineServiceError("Timeline item order changed since it was loaded", 409);
    }

    const siblings = await tx.timelineItem.findMany({
      where: { eventId, parentId: current.parentId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, updatedAt: true, sortOrder: true },
    });
    const currentIndex = siblings.findIndex((item) => item.id === current.id);
    const targetIndex = input.direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return { moved: false, items: [] };

    const claimed = await tx.timelineItem.updateMany({
      where: { id: current.id, eventId, sortOrder: input.expectedSortOrder },
      data: { sortOrder: currentIndex },
    });
    if (claimed.count !== 1) throw new TimelineServiceError("Timeline item order changed since it was loaded", 409);

    const reordered = [...siblings];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex]!, reordered[currentIndex]!];

    // Only write rows whose position actually changes. Rewriting every sibling sequentially
    // costs one round trip per item, which overran the 5s interactive-transaction budget on a
    // remote database and made reordering fail outright on longer roadmaps. An adjacent swap
    // over already-normalized data now costs two updates; rows that drifted out of contiguous
    // order are still normalized, because the comparison is against their stored sortOrder.
    const storedSortOrder = new Map(siblings.map((item) => [item.id, item.sortOrder]));
    // The claim above already moved the current item to currentIndex.
    storedSortOrder.set(current.id, currentIndex);

    const writes = reordered.flatMap((item, index) =>
      storedSortOrder.get(item.id) === index
        ? []
        : [tx.timelineItem.update({ where: { id: item.id }, data: { sortOrder: index } })],
    );
    for (const write of writes) await write;
    // Both rows receive a new updatedAt when their order changes. Return those
    // version tokens so the optimistic client can make a subsequent inline
    // edit without sending the stale pre-reorder token.
    const updatedItems = await tx.timelineItem.findMany({
      where: { id: { in: [current.id, reordered[targetIndex]!.id] }, eventId },
      select: { id: true, sortOrder: true, updatedAt: true },
    });
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: user.id },
      module: "ROADMAP",
      action: "UPDATED",
      entityType: "TimelineItem",
      entityId: current.id,
      entityLabel: current.title,
      message: `Reordered roadmap item "${current.title}" ${input.direction}`,
    });
    return { moved: true, items: updatedItems };
  });
}

export async function createTimelineItem(
  eventId: string,
  user: RequestUserContext,
  input: CreateTimelineItemInput,
): Promise<TimelineItemWithOwner> {
  await assertTimelineEventAccess(eventId, user, "write");

  const currentMax = await getPrisma().timelineItem.aggregate({
    where: { eventId },
    _max: { sortOrder: true },
  });

  const normalized = forceCompleteProgress(normalizeTimelineItemPayload(input));
  if (normalized.disposition === TimelineItemDisposition.NOT_NEEDED) {
    normalized.dispositionActorUserId = user.id;
    normalized.dispositionAt = new Date();
  }
  const dateRange = ensureCreateDateRange(input, normalized);
  await assertOwnerUserBelongsToEventContext(eventId, normalized.ownerUserId);
  await assertParentItemBelongsToEventContext(eventId, normalized.parentId);

  return getPrisma().$transaction(async (tx) => {
    const created = await tx.timelineItem.create({
      data: {
        eventId,
        title: normalized.title ?? "New Timeline Item",
        department: normalized.department ?? null,
        workstream: normalized.workstream ?? null,
        planningStage: normalized.planningStage ?? null,
        status: normalized.status ?? TimelineStatus.NOT_STARTED,
        priority: normalized.priority ?? TimelinePriority.MEDIUM,
        isCriticalPath: normalized.isCriticalPath ?? false,
        ownerUserId: normalized.ownerUserId ?? null,
        parentId: normalized.parentId ?? null,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        progress: typeof normalized.progress === "number" ? normalized.progress : null,
        sortOrder:
          typeof normalized.sortOrder === "number"
            ? normalized.sortOrder
            : (currentMax._max.sortOrder ?? -1) + 1,
        disposition: normalized.disposition ?? TimelineItemDisposition.ACTIVE,
        dispositionReason: normalized.dispositionReason ?? null,
        dispositionActorUserId: normalized.dispositionActorUserId ?? null,
        dispositionAt: normalized.dispositionAt ?? null,
      },
      select: timelineItemSelect,
    });

    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: user.id },
      module: "ROADMAP",
      action: "CREATED",
      entityType: "TimelineItem",
      entityId: created.id,
      entityLabel: created.title,
      message: `Created roadmap item "${created.title}"`,
    });

    if (created.ownerUserId) {
      await createAssignmentNotifications([
        roadmapAssignmentNotification({
          userId: created.ownerUserId,
          orgId: user.orgId,
          eventId,
          actorUserId: user.id,
          itemId: created.id,
          itemTitle: created.title,
        }),
      ], tx);
    }

    return created;
  });
}

/** One already-validated import row, ready for the bulk create. */
export type TimelineImportInputRow = {
  title: string;
  /** ISO `YYYY-MM-DD`; defaults to endDateIso for single-day items. */
  startDateIso?: string | null;
  /** ISO `YYYY-MM-DD`, when supplied. */
  endDateIso?: string | null;
  status: TimelineStatus;
  priority?: TimelinePriority;
  workstream?: TimelineWorkstream | null;
  planningStage?: TimelinePlanningStage | null;
  ownerUserId?: string | null;
  isCriticalPath?: boolean;
  notes?: string | null;
};

export type ImportTimelineItemsResult = {
  importedCount: number;
  duplicateCount: number;
  replayed: boolean;
};

export type BulkTimelineItemsResult = {
  requestedCount: number;
  updatedCount?: number;
  deletedCount?: number;
  skippedCount: number;
};

const TIMELINE_IMPORT_CHUNK_SIZE = 500;

/**
 * A stable identity for safe re-imports. Notes deliberately do not participate:
 * a blank source note must never create a duplicate or overwrite planner-authored
 * context on the existing matching roadmap item.
 */
function timelineImportRowFingerprint(row: Pick<TimelineImportInputRow, "title" | "startDateIso" | "endDateIso">): string {
  const endDate = row.endDateIso ?? "";
  const startDate = row.startDateIso ?? endDate;
  return [row.title.trim().toLocaleLowerCase(), startDate, endDate].join("\u001f");
}

/**
 * Normalize already-validated import rows into Prisma createMany inputs. Pure and
 * synchronous: all normalization happens before any DB round-trip, so a bad
 * value throws a 400 without leaving partial state. `eventId` is stamped here
 * (server-side, never trusting the client) and `sortOrder` is contiguous from
 * `baseSortOrder`. Each row is a single-day milestone (startDate === endDate).
 */
export function buildTimelineImportCreateData(
  eventId: string,
  rows: TimelineImportInputRow[],
  baseSortOrder: number,
): Prisma.TimelineItemCreateManyInput[] {
  return rows.map((row, index) => {
    const endDate = row.endDateIso ? parseDateInput(row.endDateIso) : null;
    const startDate = row.startDateIso ? parseDateInput(row.startDateIso) : endDate;
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new TimelineServiceError("endDate must be on or after startDate", 400);
    }
    const title = row.title.trim();
    if (!title) {
      throw new TimelineServiceError("title is required", 400);
    }
    return {
      eventId,
      title,
      notes: row.notes?.trim() || null,
      status: row.status,
      priority: row.priority ?? TimelinePriority.MEDIUM,
      workstream: row.workstream ?? null,
      planningStage: row.planningStage ?? null,
      ownerUserId: row.ownerUserId ?? null,
      isCriticalPath: row.isCriticalPath ?? false,
      startDate,
      endDate,
      sortOrder: baseSortOrder + index + 1,
    };
  });
}

/**
 * Bulk-import timeline items in one scoped operation.
 *
 * - Asserts event write access once up front (EVENT_VIEWER -> 403).
 * - Stamps eventId server-side and assigns sortOrder after the current max.
 * - Uses chunked `createMany` (one SQL statement per chunk) instead of one
 *   create() per row inside an interactive transaction, mirroring the Budget
 *   importer fix that avoids the Prisma P2028 timeout on large batches.
 * - Returns the database-confirmed inserted count.
 */
export async function importTimelineItems(
  eventId: string,
  user: RequestUserContext,
  inputRows: TimelineImportInputRow[],
  idempotencyKey: string,
): Promise<ImportTimelineItemsResult> {
  await assertTimelineEventAccess(eventId, user, "write");

  if (inputRows.length === 0) {
    throw new TimelineServiceError("At least one row is required for import", 400);
  }
  const normalizedIdempotencyKey = idempotencyKey.trim();
  if (!normalizedIdempotencyKey || normalizedIdempotencyKey.length > 200) {
    throw new TimelineServiceError("A valid idempotencyKey is required", 400);
  }
  const payloadHash = createHash("sha256").update(JSON.stringify(inputRows)).digest("hex");

  const existingBatch = await getPrisma().timelineImportBatch.findUnique({
    where: { eventId_requestedByUserId_idempotencyKey: { eventId, requestedByUserId: user.id, idempotencyKey: normalizedIdempotencyKey } },
  });
  if (existingBatch) {
    if (existingBatch.payloadHash !== payloadHash) {
      throw new TimelineServiceError("This idempotencyKey was already used for a different import payload", 409);
    }
    return { importedCount: existingBatch.importedCount, duplicateCount: 0, replayed: true };
  }

  const existingRows = await getPrisma().timelineItem.findMany({
    where: { eventId },
    select: { title: true, startDate: true, endDate: true },
  });
  const existingFingerprints = new Set(existingRows.map((row) => timelineImportRowFingerprint({
    title: row.title,
    startDateIso: row.startDate?.toISOString().slice(0, 10) ?? null,
    endDateIso: row.endDate?.toISOString().slice(0, 10) ?? null,
  })));
  const uniqueRows: TimelineImportInputRow[] = [];
  for (const row of inputRows) {
    const fingerprint = timelineImportRowFingerprint(row);
    if (existingFingerprints.has(fingerprint)) continue;
    existingFingerprints.add(fingerprint);
    uniqueRows.push(row);
  }
  const duplicateCount = inputRows.length - uniqueRows.length;

  const maxSortOrder = await getPrisma().timelineItem.aggregate({
    where: { eventId },
    _max: { sortOrder: true },
  });
  const baseSortOrder = maxSortOrder._max.sortOrder ?? -1;
  const data = buildTimelineImportCreateData(eventId, uniqueRows, baseSortOrder);

  const importSummary = (count: number) => ({
    eventId,
    actor: { kind: "USER" as const, userId: user.id },
    module: "ROADMAP" as const,
    action: "IMPORTED" as const,
    entityType: "TimelineItem",
    entityLabel: "Roadmap import",
    message: `Imported ${count} roadmap item${count === 1 ? "" : "s"}${duplicateCount ? `; skipped ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}` : ""}`,
  });

  if (data.length <= TIMELINE_IMPORT_CHUNK_SIZE) {
    const importedCount = await getPrisma().$transaction(async (tx) => {
      await tx.timelineImportBatch.create({ data: { eventId, requestedByUserId: user.id, idempotencyKey: normalizedIdempotencyKey, payloadHash, importedCount: 0 } });
      const result = await tx.timelineItem.createMany({ data });
      await recordEventActivity(tx, importSummary(result.count));
      await tx.timelineImportBatch.update({ where: { eventId_requestedByUserId_idempotencyKey: { eventId, requestedByUserId: user.id, idempotencyKey: normalizedIdempotencyKey } }, data: { importedCount: result.count, completedAt: new Date() } });
      return result.count;
    });
    return { importedCount, duplicateCount, replayed: false };
  }

  let importedCount = 0;
  await getPrisma().$transaction(
    async (tx) => {
      await tx.timelineImportBatch.create({ data: { eventId, requestedByUserId: user.id, idempotencyKey: normalizedIdempotencyKey, payloadHash, importedCount: 0 } });
      for (let offset = 0; offset < data.length; offset += TIMELINE_IMPORT_CHUNK_SIZE) {
        const result = await tx.timelineItem.createMany({
          data: data.slice(offset, offset + TIMELINE_IMPORT_CHUNK_SIZE),
        });
        importedCount += result.count;
      }
      await recordEventActivity(tx, importSummary(importedCount));
      await tx.timelineImportBatch.update({ where: { eventId_requestedByUserId_idempotencyKey: { eventId, requestedByUserId: user.id, idempotencyKey: normalizedIdempotencyKey } }, data: { importedCount, completedAt: new Date() } });
    },
    { timeout: 30_000 },
  );

  return { importedCount, duplicateCount, replayed: false };
}

export async function updateTimelineItem(
  eventId: string,
  itemId: string,
  user: RequestUserContext,
  input: UpdateTimelineItemInput,
): Promise<TimelineItemWithOwner> {
  await assertTimelineEventAccess(eventId, user, "write");

  if (!UUID_REGEX.test(itemId)) {
    throw new TimelineServiceError("id must be a valid UUID", 400);
  }

  const existing = await getPrisma().timelineItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      eventId: true,
      title: true,
      notes: true,
      status: true,
      priority: true,
      workstream: true,
      planningStage: true,
      isCriticalPath: true,
      progress: true,
      startDate: true,
      endDate: true,
      ownerUserId: true,
      parentId: true,
      disposition: true,
      dispositionReason: true,
      dispositionActorUserId: true,
      dispositionAt: true,
      updatedAt: true,
    },
  });

  if (!existing || existing.eventId !== eventId) {
    throw new TimelineServiceError("Timeline item not found", 404);
  }

  let normalized = normalizeTimelineItemPayload(input);
  if (normalized.disposition === TimelineItemDisposition.NOT_NEEDED) {
    const activeChildCount = await getPrisma().timelineItem.count({
      where: { parentId: itemId, eventId, disposition: TimelineItemDisposition.ACTIVE, status: { not: TimelineStatus.COMPLETE } },
    });
    if (activeChildCount > 0) {
      throw new TimelineServiceError("Complete or mark active subtasks Not Needed before the parent", 409);
    }
    normalized.dispositionActorUserId = user.id;
    normalized.dispositionAt = new Date();
  }
  if ((normalized.status ?? existing.status) === TimelineStatus.COMPLETE) {
    normalized = { ...normalized, progress: 100 };
  }
  const validatedDatePatch = ensureUpdatedDateRange(normalized, {
    startDate: existing.startDate,
    endDate: existing.endDate,
  });
  normalized.startDate = typeof validatedDatePatch.startDate === "undefined" ? normalized.startDate : validatedDatePatch.startDate;
  normalized.endDate = typeof validatedDatePatch.endDate === "undefined" ? normalized.endDate : validatedDatePatch.endDate;
  await assertOwnerUserBelongsToEventContext(eventId, normalized.ownerUserId);
  await assertParentItemBelongsToEventContext(eventId, normalized.parentId, itemId);

  // Resolve owner/parent labels (names/titles) so diffs read better than raw ids.
  const ownerIds = [existing.ownerUserId, normalized.ownerUserId].filter((v): v is string => Boolean(v));
  const parentIds = [existing.parentId, normalized.parentId].filter((v): v is string => Boolean(v));
  const [ownerRows, parentRows] = await Promise.all([
    ownerIds.length
      ? getPrisma().user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
    parentIds.length
      ? getPrisma().timelineItem.findMany({ where: { id: { in: parentIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
  ]);
  const ownerLabels = new Map(ownerRows.map((u) => [u.id, u.name || u.email || "User"]));
  const parentLabels = new Map(parentRows.map((p) => [p.id, p.title]));

  const changes = buildTimelineDiff(existing, normalized, { owner: ownerLabels, parent: parentLabels });

  return getPrisma().$transaction(async (tx) => {
    let updated: TimelineItemWithOwner;
    if (input.expectedUpdatedAt) {
      const changed = await tx.timelineItem.updateMany({
        where: { id: itemId, eventId, updatedAt: new Date(input.expectedUpdatedAt) },
        data: normalized,
      });
      if (changed.count !== 1) throw new TimelineServiceError("Timeline item changed since it was loaded", 409);
      updated = await tx.timelineItem.findUniqueOrThrow({ where: { id: itemId }, select: timelineItemSelect });
    } else {
      updated = await tx.timelineItem.update({ where: { id: itemId }, data: normalized, select: timelineItemSelect });
    }

    if (changes.length > 0) {
      await recordEventActivity(tx, {
        eventId,
        actor: { kind: "USER", userId: user.id },
        module: "ROADMAP",
        action: isStatusOnlyKindChange(changes) ? "STATUS_CHANGED" : "UPDATED",
        entityType: "TimelineItem",
        entityId: updated.id,
        entityLabel: updated.title,
        message: `Updated roadmap item "${updated.title}"`,
        changes,
      });
    }

    if (updated.ownerUserId && updated.ownerUserId !== existing.ownerUserId) {
      await createAssignmentNotifications([
        roadmapAssignmentNotification({
          userId: updated.ownerUserId,
          orgId: user.orgId,
          eventId,
          actorUserId: user.id,
          itemId: updated.id,
          itemTitle: updated.title,
        }),
      ], tx);
    }

    return updated;
  });
}

export async function bulkUpdateTimelineItems(
  eventId: string,
  user: RequestUserContext,
  input: BulkUpdateTimelineItemInput,
): Promise<BulkTimelineItemsResult> {
  await assertTimelineEventAccess(eventId, user, "write");

  const itemIds = Array.from(new Set(input.itemIds));
  if (itemIds.length === 0) {
    throw new TimelineServiceError("At least one item id is required", 400);
  }

  const existingItems = await getPrisma().timelineItem.findMany({
    where: { eventId, id: { in: itemIds } },
    select: { id: true, title: true, ownerUserId: true, status: true },
  });
  const existingIds = existingItems.map((item) => item.id);
  const skippedCount = itemIds.length - existingIds.length;

  if (existingIds.length === 0) {
    return {
      requestedCount: itemIds.length,
      updatedCount: 0,
      skippedCount,
    };
  }

  const normalized = forceCompleteProgress(normalizeTimelineItemPayload(input.patch));
  await assertOwnerUserBelongsToEventContext(eventId, normalized.ownerUserId);

  const changedFields = Object.keys(normalized).filter((f) => f !== "sortOrder");

  const updated = await getPrisma().$transaction(async (tx) => {
    const completedIds =
      typeof normalized.progress !== "undefined" && typeof normalized.status === "undefined"
        ? existingItems.filter((item) => item.status === TimelineStatus.COMPLETE).map((item) => item.id)
        : [];
    const ordinaryIds = completedIds.length > 0
      ? existingIds.filter((id) => !completedIds.includes(id))
      : existingIds;
    let updatedCount = 0;
    if (ordinaryIds.length > 0) {
      const result = await tx.timelineItem.updateMany({
        where: { eventId, id: { in: ordinaryIds } },
        data: normalized,
      });
      updatedCount += result.count;
    }
    if (completedIds.length > 0) {
      const result = await tx.timelineItem.updateMany({
        where: { eventId, id: { in: completedIds } },
        data: { ...normalized, progress: 100 },
      });
      updatedCount += result.count;
    }
    const result = { count: updatedCount };
    if (result.count > 0 && changedFields.length > 0) {
      await recordEventActivity(tx, {
        eventId,
        actor: { kind: "USER", userId: user.id },
        module: "ROADMAP",
        action: "UPDATED",
        entityType: "TimelineItem",
        entityLabel: `${result.count} roadmap item${result.count === 1 ? "" : "s"}`,
        message: `Bulk-updated ${result.count} roadmap item${result.count === 1 ? "" : "s"} (${changedFields.join(", ")})`,
      });
    }

    if (normalized.ownerUserId) {
      const newlyAssignedItems = existingItems.filter((item) => item.ownerUserId !== normalized.ownerUserId);
      if (newlyAssignedItems.length > 0) {
        const firstItem = newlyAssignedItems[0];
        await createAssignmentNotifications([
          {
            userId: normalized.ownerUserId,
            orgId: user.orgId,
            eventId,
            actorUserId: user.id,
            type: ROADMAP_ASSIGNMENT_NOTIFICATION_TYPE,
            title: newlyAssignedItems.length === 1 ? "Roadmap item assigned" : "Roadmap items assigned",
            body: newlyAssignedItems.length === 1
              ? `You were assigned to roadmap item “${firstItem.title}”.`
              : `You were assigned to ${newlyAssignedItems.length} roadmap items, including “${firstItem.title}”.`,
            linkUrl: roadmapItemHref(eventId, firstItem.id),
          },
        ], tx);
      }
    }
    return result;
  });

  return {
    requestedCount: itemIds.length,
    updatedCount: updated.count,
    skippedCount,
  };
}

export async function deleteTimelineItem(
  eventId: string,
  itemId: string,
  user: RequestUserContext,
): Promise<{ success: true; deletedCount: number }> {
  await assertTimelineEventAccess(eventId, user, "write");

  if (!UUID_REGEX.test(itemId)) {
    throw new TimelineServiceError("id must be a valid UUID", 400);
  }

  const existing = await getPrisma().timelineItem.findUnique({
    where: { id: itemId },
    select: { id: true, eventId: true, title: true },
  });

  if (!existing || existing.eventId !== eventId) {
    throw new TimelineServiceError("Timeline item not found", 404);
  }

  return getPrisma().$transaction(async (tx) => {
    const hierarchy = await tx.timelineItem.findMany({
      where: { eventId },
      select: { id: true, parentId: true },
    });
    const idsToDelete = collectTimelineDescendantIds([itemId], hierarchy);

    await tx.timelineDependency.deleteMany({
      where: {
        eventId,
        OR: [
          { predecessorItemId: { in: idsToDelete } },
          { successorItemId: { in: idsToDelete } },
        ],
      },
    });

    const deleted = await tx.timelineItem.deleteMany({
      where: {
        eventId,
        id: { in: idsToDelete },
      },
    });

    const childSuffix = deleted.count > 1 ? ` and ${deleted.count - 1} child item${deleted.count - 1 === 1 ? "" : "s"}` : "";
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: user.id },
      module: "ROADMAP",
      action: "DELETED",
      entityType: "TimelineItem",
      entityId: existing.id,
      entityLabel: existing.title,
      message: `Deleted roadmap item "${existing.title}"${childSuffix}`,
    });

    return { success: true as const, deletedCount: deleted.count };
  });
}

export async function bulkDeleteTimelineItems(
  eventId: string,
  user: RequestUserContext,
  input: BulkDeleteTimelineItemInput,
): Promise<BulkTimelineItemsResult> {
  await assertTimelineEventAccess(eventId, user, "write");

  const itemIds = Array.from(new Set(input.itemIds));
  if (itemIds.length === 0) {
    throw new TimelineServiceError("At least one item id is required", 400);
  }

  const existingItems = await getPrisma().timelineItem.findMany({
    where: { eventId, id: { in: itemIds } },
    select: { id: true },
  });
  const existingIds = existingItems.map((item) => item.id);
  const skippedCount = itemIds.length - existingIds.length;

  if (existingIds.length === 0) {
    return {
      requestedCount: itemIds.length,
      deletedCount: 0,
      skippedCount,
    };
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const hierarchy = await tx.timelineItem.findMany({
      where: { eventId },
      select: { id: true, parentId: true },
    });
    const idsToDelete = collectTimelineDescendantIds(existingIds, hierarchy);

    await tx.timelineDependency.deleteMany({
      where: {
        eventId,
        OR: [
          { predecessorItemId: { in: idsToDelete } },
          { successorItemId: { in: idsToDelete } },
        ],
      },
    });

    const deleted = await tx.timelineItem.deleteMany({
      where: { eventId, id: { in: idsToDelete } },
    });

    if (deleted.count > 0) {
      await recordEventActivity(tx, {
        eventId,
        actor: { kind: "USER", userId: user.id },
        module: "ROADMAP",
        action: "DELETED",
        entityType: "TimelineItem",
        entityLabel: `${deleted.count} roadmap item${deleted.count === 1 ? "" : "s"}`,
        message: `Bulk-deleted ${deleted.count} roadmap item${deleted.count === 1 ? "" : "s"}`,
      });
    }

    return deleted;
  });

  return {
    requestedCount: itemIds.length,
    deletedCount: result.count,
    skippedCount,
  };
}

/**
 * Detects whether adding the directed edge predecessor -> successor would close a
 * cycle in the event's dependency graph. A dependency edge points predecessor ->
 * successor (the successor depends on the predecessor); a cycle is created when the
 * successor can already reach the predecessor by following existing edges. Cycle
 * detection is intentionally type-agnostic: any edge between two items imposes an
 * ordering constraint, so all edges for the event are considered regardless of type.
 */
async function dependencyWouldCreateCycle(
  eventId: string,
  predecessorItemId: string,
  successorItemId: string,
): Promise<boolean> {
  const edges = await getPrisma().timelineDependency.findMany({
    where: { eventId },
    select: { predecessorItemId: true, successorItemId: true },
  });

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const bucket = adjacency.get(edge.predecessorItemId);
    if (bucket) bucket.push(edge.successorItemId);
    else adjacency.set(edge.predecessorItemId, [edge.successorItemId]);
  }

  // Walk forward from the proposed successor; if we can reach the proposed
  // predecessor, the new edge would close a loop.
  const stack: string[] = [successorItemId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === predecessorItemId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const next = adjacency.get(current);
    if (next) stack.push(...next);
  }

  return false;
}

export type TimelineDependencyRecord = {
  id: string;
  type: TimelineDependencyType;
  predecessor: { id: string; title: string; status: TimelineStatus; disposition: TimelineItemDisposition };
  successor: { id: string; title: string; status: TimelineStatus; disposition: TimelineItemDisposition };
  blocked: boolean;
};

export async function listTimelineDependencies(eventId: string, user: RequestUserContext): Promise<TimelineDependencyRecord[]> {
  await assertTimelineEventAccess(eventId, user, "read");
  const rows = await getPrisma().timelineDependency.findMany({
    where: { eventId, predecessor: { eventId }, successor: { eventId } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      type: true,
      predecessor: { select: { id: true, title: true, status: true, disposition: true } },
      successor: { select: { id: true, title: true, status: true, disposition: true } },
    },
  });
  return rows.map((row) => ({
    ...row,
    blocked: row.predecessor.disposition === TimelineItemDisposition.ACTIVE && row.predecessor.status !== TimelineStatus.COMPLETE,
  }));
}

export async function createTimelineDependency(
  eventId: string,
  user: RequestUserContext,
  input: CreateTimelineDependencyInput,
): Promise<TimelineDependency> {
  await assertTimelineEventAccess(eventId, user, "write");

  if (input.predecessorItemId === input.successorItemId) {
    throw new TimelineServiceError("A dependency cannot link an item to itself", 400);
  }

  const items = await getPrisma().timelineItem.findMany({
    where: {
      eventId,
      id: { in: [input.predecessorItemId, input.successorItemId] },
    },
    select: { id: true, title: true },
  });

  if (items.length !== 2) {
    throw new TimelineServiceError("Both predecessor and successor items must belong to this event", 400);
  }

  const titleById = new Map(items.map((i) => [i.id, i.title]));

  const dependencyType = input.type ?? TimelineDependencyType.FINISH_TO_START;

  const existing = await getPrisma().timelineDependency.findFirst({
    where: {
      eventId,
      predecessorItemId: input.predecessorItemId,
      successorItemId: input.successorItemId,
      type: dependencyType,
    },
    select: { id: true },
  });

  if (existing) {
    throw new TimelineServiceError("Dependency already exists", 409);
  }

  if (await dependencyWouldCreateCycle(eventId, input.predecessorItemId, input.successorItemId)) {
    throw new TimelineServiceError("Adding this dependency would create a circular dependency", 400);
  }

  const predLabel = titleById.get(input.predecessorItemId) ?? "item";
  const succLabel = titleById.get(input.successorItemId) ?? "item";

  return getPrisma().$transaction(async (tx) => {
    const dependency = await tx.timelineDependency.create({
      data: {
        eventId,
        predecessorItemId: input.predecessorItemId,
        successorItemId: input.successorItemId,
        type: dependencyType,
      },
    });
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: user.id },
      module: "ROADMAP",
      action: "LINKED",
      entityType: "TimelineDependency",
      entityId: dependency.id,
      entityLabel: `${predLabel} → ${succLabel}`,
      message: `Linked roadmap dependency "${predLabel}" → "${succLabel}"`,
    });
    return dependency;
  });
}

export async function deleteTimelineDependency(
  eventId: string,
  dependencyId: string,
  user: RequestUserContext,
): Promise<TimelineDependency> {
  await assertTimelineEventAccess(eventId, user, "write");

  if (!UUID_REGEX.test(dependencyId)) {
    throw new TimelineServiceError("id must be a valid UUID", 400);
  }

  const existing = await getPrisma().timelineDependency.findUnique({
    where: { id: dependencyId },
    select: {
      id: true,
      eventId: true,
      predecessor: { select: { title: true } },
      successor: { select: { title: true } },
    },
  });

  if (!existing || existing.eventId !== eventId) {
    throw new TimelineServiceError("Timeline dependency not found", 404);
  }

  const predLabel = existing.predecessor?.title ?? "item";
  const succLabel = existing.successor?.title ?? "item";

  return getPrisma().$transaction(async (tx) => {
    const deleted = await tx.timelineDependency.delete({ where: { id: dependencyId } });
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: user.id },
      module: "ROADMAP",
      action: "UNLINKED",
      entityType: "TimelineDependency",
      entityId: dependencyId,
      entityLabel: `${predLabel} → ${succLabel}`,
      message: `Removed roadmap dependency "${predLabel}" → "${succLabel}"`,
    });
    return deleted;
  });
}
