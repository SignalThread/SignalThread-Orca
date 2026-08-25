import {
  Prisma,
  EventActivityActorKind,
  EventActivityModule,
  EventActivityAction,
  EventActivityType,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { assertEventAccessForUser, EventAccessError, type EventAccessUser } from "@/lib/event-access";

/**
 * Canonical server-only event Activity audit service.
 *
 * `EventActivity` is the single event-scoped audit feed. This module is the
 * only supported way to write to it. Domain history tables (BudgetActivity,
 * DocumentVersion, TaskActivity, MarketingEmailEvent, ...) remain their own
 * workflow sources of truth and must not be unioned into the Activity page.
 *
 * Hard rules enforced here:
 * - Audit data is constructed on the server. Callers pass structured input;
 *   client-supplied event IDs, actor IDs, messages, and diffs are never trusted.
 * - Writes accept a Prisma transaction client so the business mutation and the
 *   audit entry commit or roll back together. Failures are NOT swallowed.
 * - Sensitive values (tokens, storage keys, email bodies, notes, full record
 *   dumps) are excluded — change diffs are whitelisted primitives only.
 * - Actor and entity labels are stored as historical snapshots so entries stay
 *   readable after renames or deletions.
 * - Optional source-record identity provides event-scoped idempotent dedup.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MESSAGE_MAX = 2000;
const LABEL_MAX = 300;
const CHANGE_STRING_MAX = 500;
const MAX_CHANGES = 50;

/**
 * Change field names whose values must never be persisted, even if a caller
 * mistakenly passes them. This is a defense-in-depth backstop; callers are
 * still responsible for not constructing sensitive diffs in the first place.
 */
const SENSITIVE_FIELD_PATTERNS = [
  "token",
  "password",
  "secret",
  "apikey",
  "api_key",
  "storagekey",
  "storage_key",
  "signedurl",
  "signed_url",
  "presigned",
  "body",
  "emailbody",
  "payload",
  "note",
  "content",
  "credential",
];

export class EventActivityError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "EVENT_ACTIVITY_ERROR") {
    super(message);
    this.name = "EventActivityError";
    this.status = status;
    this.code = code;
  }
}

/** A Prisma client or transaction client. Both satisfy this shape for writes. */
export type ActivityDbClient = Prisma.TransactionClient;

export type EventActivityActorInput =
  // USER label is optional: when omitted the canonical writer resolves the
  // user's name/email snapshot from the DB inside the same transaction.
  | { kind: "USER"; userId: string; label?: string | null }
  | { kind: "SYSTEM"; label?: string | null }
  | { kind: "INTEGRATION"; label: string }
  | { kind: "PORTAL"; label: string };

export type EventActivityChangeValue = string | number | boolean | null;

export type EventActivityChange = {
  /** Machine field key, e.g. "status". */
  field: string;
  /** Optional human label, e.g. "Status". Falls back to `field`. */
  label?: string | null;
  from: EventActivityChangeValue;
  to: EventActivityChangeValue;
};

export type RecordEventActivityInput = {
  eventId: string;
  actor: EventActivityActorInput;
  module: EventActivityModule;
  action: EventActivityAction;
  entityType: string;
  entityId?: string | null;
  entityLabel: string;
  message: string;
  /** Whitelisted, server-built field-level diffs. Non-primitive values dropped. */
  changes?: EventActivityChange[] | null;
  /** Optional source identity for event-scoped idempotent dedup. */
  source?: { type: string; id: string } | null;
};

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function isSensitiveField(field: string): boolean {
  const normalized = field.toLowerCase().replace(/[\s-]/g, "");
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => normalized.includes(pattern.replace(/[\s_-]/g, "")));
}

function isPrimitive(value: unknown): value is EventActivityChangeValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function sanitizeValue(value: EventActivityChangeValue): EventActivityChangeValue {
  if (typeof value === "string") return truncate(value, CHANGE_STRING_MAX);
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

/**
 * Reduce caller-supplied changes to a whitelisted, non-sensitive set of
 * primitive-valued diffs. Non-primitive values and sensitive field names are
 * dropped rather than persisted. Unchanged entries (from === to) are omitted.
 * Returns null when nothing survives, so entries without meaningful diffs store
 * `changes = null`.
 */
function sanitizeChanges(changes: EventActivityChange[] | null | undefined): Prisma.InputJsonValue | undefined {
  if (!changes || changes.length === 0) return undefined;

  const clean: EventActivityChange[] = [];
  for (const change of changes) {
    if (clean.length >= MAX_CHANGES) break;
    if (!change || typeof change.field !== "string" || !change.field.trim()) continue;
    if (isSensitiveField(change.field)) continue;
    if (!isPrimitive(change.from) || !isPrimitive(change.to)) continue;

    const from = sanitizeValue(change.from);
    const to = sanitizeValue(change.to);
    if (from === to) continue;

    clean.push({
      field: change.field.trim(),
      ...(change.label ? { label: truncate(String(change.label), LABEL_MAX) } : {}),
      from,
      to,
    });
  }

  return clean.length > 0 ? (clean as unknown as Prisma.InputJsonValue) : undefined;
}

function resolveActor(actor: EventActivityActorInput): {
  actorKind: EventActivityActorKind;
  actorUserId: string | null;
  actorLabel: string;
} {
  switch (actor.kind) {
    case "USER": {
      if (!UUID_REGEX.test(actor.userId)) {
        throw new EventActivityError("A user actor requires a valid userId", 400, "INVALID_ACTOR");
      }
      return {
        actorKind: EventActivityActorKind.USER,
        actorUserId: actor.userId,
        // Empty label signals recordEventActivity to resolve the snapshot from the DB.
        actorLabel: actor.label ? truncate(actor.label, LABEL_MAX) : "",
      };
    }
    case "SYSTEM":
      return {
        actorKind: EventActivityActorKind.SYSTEM,
        actorUserId: null,
        actorLabel: truncate(actor.label || "System", LABEL_MAX),
      };
    case "INTEGRATION":
      return {
        actorKind: EventActivityActorKind.INTEGRATION,
        actorUserId: null,
        actorLabel: truncate(actor.label || "Integration", LABEL_MAX),
      };
    case "PORTAL":
      return {
        actorKind: EventActivityActorKind.PORTAL,
        actorUserId: null,
        actorLabel: truncate(actor.label || "Portal", LABEL_MAX),
      };
    default: {
      const _exhaustive: never = actor;
      throw new EventActivityError("Unsupported actor kind", 400, "INVALID_ACTOR");
    }
  }
}

/**
 * Record a single canonical Activity entry.
 *
 * Pass a transaction client (`tx`) to keep the audit write atomic with the
 * business mutation. When `input.source` is provided the write is idempotent:
 * a retry with the same (eventId, sourceRecordType, sourceRecordId) updates the
 * existing row instead of creating a duplicate.
 */
export async function recordEventActivity(
  db: ActivityDbClient,
  input: RecordEventActivityInput,
): Promise<void> {
  if (!UUID_REGEX.test(input.eventId)) {
    throw new EventActivityError("A valid eventId is required", 400, "INVALID_EVENT");
  }

  const actor = resolveActor(input.actor);

  // Resolve a user actor's display label snapshot from the DB when the caller
  // did not supply one. Done on the same client so it stays inside the tx.
  if (actor.actorKind === EventActivityActorKind.USER && !actor.actorLabel && actor.actorUserId) {
    const user = await db.user.findUnique({
      where: { id: actor.actorUserId },
      select: { name: true, email: true },
    });
    actor.actorLabel = truncate(user?.name || user?.email || "User", LABEL_MAX);
  }

  const changes = sanitizeChanges(input.changes);

  const data = {
    eventId: input.eventId,
    actorUserId: actor.actorUserId,
    actorKind: actor.actorKind,
    actorLabel: actor.actorLabel,
    module: input.module,
    actionType: input.action,
    entityType: truncate(input.entityType, LABEL_MAX),
    entityId: input.entityId ? truncate(input.entityId, LABEL_MAX) : null,
    entityLabel: truncate(input.entityLabel || input.entityType, LABEL_MAX),
    message: truncate(input.message, MESSAGE_MAX),
    ...(changes !== undefined ? { changes } : {}),
    sourceRecordType: input.source ? truncate(input.source.type, LABEL_MAX) : null,
    sourceRecordId: input.source ? truncate(input.source.id, LABEL_MAX) : null,
  } satisfies Prisma.EventActivityUncheckedCreateInput;

  if (input.source) {
    await db.eventActivity.upsert({
      where: {
        eventId_sourceRecordType_sourceRecordId: {
          eventId: input.eventId,
          sourceRecordType: data.sourceRecordType as string,
          sourceRecordId: data.sourceRecordId as string,
        },
      },
      create: data,
      update: {
        actorUserId: data.actorUserId,
        actorKind: data.actorKind,
        actorLabel: data.actorLabel,
        module: data.module,
        actionType: data.actionType,
        entityType: data.entityType,
        entityId: data.entityId,
        entityLabel: data.entityLabel,
        message: data.message,
        ...(changes !== undefined ? { changes } : {}),
      },
    });
    return;
  }

  await db.eventActivity.create({ data });
}

// ---------------------------------------------------------------------------
// Read service
// ---------------------------------------------------------------------------

export type EventActivityListFilters = {
  from?: Date | null;
  to?: Date | null;
  /** Opaque, event-scoped actor key returned by listEventActivityActors. */
  actor?: string | null;
  /** @deprecated Use `actor`; kept only for callers not yet upgraded. */
  actorUserId?: string | null;
  module?: EventActivityModule | null;
  action?: EventActivityAction | null;
  search?: string | null;
  limit?: number | null;
  cursor?: string | null;
};

export type EventActivityEntry = {
  id: string;
  createdAt: Date;
  actorKind: EventActivityActorKind;
  actorUserId: string | null;
  actorLabel: string | null;
  module: EventActivityModule | null;
  action: EventActivityAction | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  legacyType: EventActivityType | null;
  message: string;
  changes: EventActivityChange[] | null;
};

export type EventActivityActorOption = {
  /** Opaque stable actor key; deliberately never a raw user UUID. */
  id: string;
  label: string;
  kind: EventActivityActorKind;
};

/**
 * Safe read-time presentation for historical rows. These mappings are based on
 * the legacy enum and its original writers; deliberately do not infer entity
 * ids, labels, actors, or diffs from free-form messages.
 */
const LEGACY_PRESENTATION: Partial<Record<EventActivityType, { module: EventActivityModule; action: EventActivityAction }>> = {
  EVENT_CREATED: { module: EventActivityModule.EVENT_SETTINGS, action: EventActivityAction.CREATED },
  EVENT_UPDATED: { module: EventActivityModule.EVENT_DIRECTORY, action: EventActivityAction.SENT },
  DEADLINE_CREATED: { module: EventActivityModule.ROADMAP, action: EventActivityAction.CREATED },
  DEADLINE_UPDATED: { module: EventActivityModule.ROADMAP, action: EventActivityAction.UPDATED },
  BUDGET_SUBMITTED: { module: EventActivityModule.BUDGET, action: EventActivityAction.SUBMITTED },
  BUDGET_APPROVED: { module: EventActivityModule.BUDGET, action: EventActivityAction.APPROVED },
  BUDGET_REJECTED: { module: EventActivityModule.BUDGET, action: EventActivityAction.REJECTED },
  MATRIX_UPDATED: { module: EventActivityModule.RUN_OF_SHOW, action: EventActivityAction.UPDATED },
  REPORT_GENERATED: { module: EventActivityModule.REPORTS, action: EventActivityAction.GENERATED },
  INTEGRATION_SYNCED: { module: EventActivityModule.INTEGRATIONS, action: EventActivityAction.SYNCED },
  SPEAKER_UPDATED: { module: EventActivityModule.SPEAKERS, action: EventActivityAction.UPDATED },
};

type ActorKeyPayload = ["USER", string] | ["USER", "UNKNOWN"] | ["SYSTEM"] | ["INTEGRATION" | "PORTAL", string];

function encodeActorKey(payload: ActorKeyPayload): string {
  return `actor:${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

function decodeActorKey(value: string): ActorKeyPayload {
  if (!value.startsWith("actor:")) {
    throw new EventActivityError("Invalid actor filter", 400, "INVALID_FILTER");
  }

  try {
    const parsed = JSON.parse(Buffer.from(value.slice("actor:".length), "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not an array");
    if (parsed[0] === "USER" && parsed[1] === "UNKNOWN" && parsed.length === 2) return ["USER", "UNKNOWN"];
    if (parsed[0] === "USER" && typeof parsed[1] === "string" && UUID_REGEX.test(parsed[1]) && parsed.length === 2) {
      return ["USER", parsed[1]];
    }
    if (parsed[0] === "SYSTEM" && parsed.length === 1) return ["SYSTEM"];
    if (
      (parsed[0] === "INTEGRATION" || parsed[0] === "PORTAL") &&
      typeof parsed[1] === "string" &&
      parsed[1].trim() &&
      parsed.length === 2
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // Normalized below so callers receive the same safe validation error.
  }
  throw new EventActivityError("Invalid actor filter", 400, "INVALID_FILTER");
}

function actorLabelForRow(kind: EventActivityActorKind, label: string | null): string {
  if (kind === EventActivityActorKind.SYSTEM) return "System";
  const normalized = label?.trim();
  if (normalized) return normalized;
  if (kind === EventActivityActorKind.INTEGRATION) return "Integration";
  if (kind === EventActivityActorKind.PORTAL) return "Portal";
  return "Unknown user";
}

type CursorParts = { createdAt: Date; id: string };

function encodeCursor(parts: CursorParts): string {
  return Buffer.from(`${parts.createdAt.toISOString()}|${parts.id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): CursorParts {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new EventActivityError("Malformed cursor", 400, "INVALID_CURSOR");
  }
  const sep = decoded.indexOf("|");
  if (sep === -1) throw new EventActivityError("Malformed cursor", 400, "INVALID_CURSOR");
  const iso = decoded.slice(0, sep);
  const id = decoded.slice(sep + 1);
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || !UUID_REGEX.test(id)) {
    throw new EventActivityError("Malformed cursor", 400, "INVALID_CURSOR");
  }
  return { createdAt, id };
}

function normalizeLimit(limit: number | null | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function parseChanges(value: Prisma.JsonValue | null): EventActivityChange[] | null {
  if (!value || !Array.isArray(value)) return null;
  const parsed: EventActivityChange[] = [];
  for (const entry of value) {
    if (entry && typeof entry === "object" && !Array.isArray(entry) && "field" in entry) {
      const record = entry as Record<string, unknown>;
      if (typeof record.field === "string" && isPrimitive(record.from) && isPrimitive(record.to)) {
        parsed.push({
          field: record.field,
          label: typeof record.label === "string" ? record.label : null,
          from: record.from,
          to: record.to,
        });
      }
    }
  }
  return parsed.length > 0 ? parsed : null;
}

/**
 * List event-scoped Activity entries newest-first with stable keyset
 * pagination. Every query is explicitly constrained to `eventId`; there is no
 * code path that can return another event's activity.
 */
export async function listEventActivity(args: {
  eventId: string;
  user: EventAccessUser;
  filters?: EventActivityListFilters;
}): Promise<{ entries: EventActivityEntry[]; nextCursor: string | null }> {
  const { eventId, user, filters = {} } = args;

  await assertEventAccessForUser(eventId, user, "read");

  const limit = normalizeLimit(filters.limit);

  const where: Prisma.EventActivityWhereInput = { eventId };

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.actor) {
    const actor = decodeActorKey(filters.actor);
    if (actor[0] === "USER" && actor[1] === "UNKNOWN") {
      where.AND = [
        ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
        {
          actorKind: EventActivityActorKind.USER,
          OR: [{ actorLabel: null }, { actorLabel: "" }],
        },
      ];
    } else if (actor[0] === "USER") {
      where.actorKind = EventActivityActorKind.USER;
      where.actorUserId = actor[1];
    } else if (actor[0] === "SYSTEM") {
      where.actorKind = EventActivityActorKind.SYSTEM;
    } else {
      where.actorKind = actor[0];
      where.actorLabel = actor[1];
    }
  } else if (filters.actorUserId) {
    if (!UUID_REGEX.test(filters.actorUserId)) {
      throw new EventActivityError("Invalid actor filter", 400, "INVALID_FILTER");
    }
    where.actorUserId = filters.actorUserId;
  }
  if (filters.module) where.module = filters.module;
  if (filters.action) where.actionType = filters.action;

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { message: { contains: search, mode: "insensitive" } },
      { entityLabel: { contains: search, mode: "insensitive" } },
      { actorLabel: { contains: search, mode: "insensitive" } },
    ];
  }

  if (filters.cursor) {
    const cursor = decodeCursor(filters.cursor);
    // Keyset pagination: strictly older than the cursor by (createdAt, id).
    const existingAnd = where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : [];
    where.AND = [
      ...existingAnd,
      {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const rows = await getPrisma().eventActivity.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      createdAt: true,
      actorKind: true,
      actorUserId: true,
      actorLabel: true,
      module: true,
      actionType: true,
      entityType: true,
      entityId: true,
      entityLabel: true,
      type: true,
      message: true,
      changes: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const entries: EventActivityEntry[] = page.map((row) => {
    const legacy = row.module || !row.type ? null : LEGACY_PRESENTATION[row.type] ?? null;
    return {
      id: row.id,
      createdAt: row.createdAt,
      actorKind: row.actorKind,
      actorUserId: row.actorUserId,
      actorLabel: row.actorLabel,
      module: row.module ?? legacy?.module ?? null,
      action: row.actionType ?? legacy?.action ?? null,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      legacyType: row.type,
      message: row.message,
      changes: parseChanges(row.changes),
    };
  });

  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

  return { entries, nextCursor };
}

/**
 * Actor filter options derived only from actors present in this event's
 * activity history. A key encodes actor identity rather than display text, so
 * duplicate labels do not collide and user UUIDs are never exposed to the UI.
 */
export async function listEventActivityActors(args: {
  eventId: string;
  user: EventAccessUser;
}): Promise<{ actors: EventActivityActorOption[] }> {
  const { eventId, user } = args;

  await assertEventAccessForUser(eventId, user, "read");

  const rows = await getPrisma().eventActivity.findMany({
    where: { eventId },
    select: { actorKind: true, actorUserId: true, actorLabel: true, createdAt: true, id: true },
    // The newest snapshot wins for a human user who was renamed. Stable actor
    // keys, rather than this display label, do the deduplication.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const byKey = new Map<string, EventActivityActorOption>();
  for (const row of rows) {
    const label = actorLabelForRow(row.actorKind, row.actorLabel);
    let payload: ActorKeyPayload;
    if (row.actorKind === EventActivityActorKind.USER) {
      payload = row.actorLabel?.trim() && row.actorUserId ? ["USER", row.actorUserId] : ["USER", "UNKNOWN"];
    } else if (row.actorKind === EventActivityActorKind.SYSTEM) {
      payload = ["SYSTEM"];
    } else {
      payload = [row.actorKind, label];
    }
    const id = encodeActorKey(payload);
    if (!byKey.has(id)) byKey.set(id, { id, label, kind: row.actorKind });
  }

  const actors = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

  return { actors };
}

export { EventAccessError };
