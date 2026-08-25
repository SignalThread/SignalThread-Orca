import { getPrisma } from "@/lib/prisma";

/**
 * Session-scoped activity.
 *
 * `EventActivity` is the canonical audit record. Writers that act on a session record it with
 * `entityType = "MatrixRow"` and `entityId = <sessionId>`, which is a durable, correctly scoped
 * link — this module reads those rows and nothing else. It never synthesises entries, and it
 * never falls back to event-wide activity, because an event-wide row shown under a session
 * would misattribute a change.
 */

export type SessionActivityEntry = {
  id: string;
  createdAt: string;
  actorLabel: string;
  module: string | null;
  action: string | null;
  message: string;
  changes: Array<{ field: string; label: string; from: string | null; to: string | null }>;
};

export type SessionActivityPayload = {
  eventId: string;
  sessionId: string;
  entries: SessionActivityEntry[];
  /** True when more entries exist than were returned. */
  truncated: boolean;
  /**
   * What this timeline does and does not cover, so the surface can say so rather than
   * implying a complete history.
   */
  coverage: {
    /** Entity types that are recorded against this session id. */
    includes: string[];
    /** Known gaps a planner should not mistake for "nothing happened". */
    excludes: string[];
  };
  lastNotesUpdate: {
    at: string;
    byLabel: string;
  } | null;
  generatedAt: string;
};

const MAX_ENTRIES = 50;

function parseChanges(value: unknown): SessionActivityEntry["changes"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.field !== "string") return [];
    return [
      {
        field: record.field,
        label: typeof record.label === "string" ? record.label : record.field,
        from: record.from === null || record.from === undefined ? null : String(record.from),
        to: record.to === null || record.to === undefined ? null : String(record.to),
      },
    ];
  });
}

/** Callers must have already asserted event read access; this function does not authorize. */
export async function getSessionActivity(
  eventId: string,
  sessionId: string,
): Promise<SessionActivityPayload> {
  const prisma = getPrisma();

  // eventId is part of the filter as well as sessionId so an id from another event can never
  // surface here even if it were guessed.
  const where = {
    eventId,
    entityType: "MatrixRow",
    entityId: sessionId,
  } as const;

  const [rows, total] = await Promise.all([
    prisma.eventActivity.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_ENTRIES,
      select: {
        id: true,
        createdAt: true,
        actorLabel: true,
        module: true,
        actionType: true,
        message: true,
        changes: true,
      },
    }),
    prisma.eventActivity.count({ where }),
  ]);

  const entries: SessionActivityEntry[] = rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actorLabel: row.actorLabel?.trim() || "System",
    module: row.module,
    action: row.actionType,
    message: row.message,
    changes: parseChanges(row.changes),
  }));

  const notesEntry = entries.find((entry) =>
    entry.changes.some((change) => change.field === "notes"),
  );

  return {
    eventId,
    sessionId,
    entries,
    truncated: total > entries.length,
    coverage: {
      includes: ["Session schedule, room, status, and notes changes recorded against this session"],
      excludes: [
        "F&B safety requirement changes, which are recorded against the requirement record",
        "Page views and autosave churn, which are never recorded",
      ],
    },
    lastNotesUpdate: notesEntry
      ? { at: notesEntry.createdAt, byLabel: notesEntry.actorLabel }
      : null,
    generatedAt: new Date().toISOString(),
  };
}
