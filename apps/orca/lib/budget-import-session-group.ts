/**
 * Pure helpers for resolving imported Session/Group column values onto canonical
 * ids. Dependency-free so both the budget service and tests can share one
 * deterministic implementation without a DB round-trip.
 */

/** Normalize a session title or group name for case/space-insensitive matching. */
export function normalizeNameKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export type SessionTitleIndex = Map<string, string[]>;

/** Build a normalized-title -> matrixRowIds index from event sessions. */
export function buildSessionTitleIndex(
  sessions: ReadonlyArray<{ id: string; sessionName: string | null }>,
): SessionTitleIndex {
  const index: SessionTitleIndex = new Map();
  for (const session of sessions) {
    const title = session.sessionName?.trim();
    if (!title) continue;
    const key = normalizeNameKey(title);
    const bucket = index.get(key);
    if (bucket) bucket.push(session.id);
    else index.set(key, [session.id]);
  }
  return index;
}

export type ImportSessionResolution =
  | { status: "empty"; matrixRowId: null }
  | { status: "matched"; matrixRowId: string }
  | { status: "not_found"; matrixRowId: null }
  | { status: "ambiguous"; matrixRowId: null };

/**
 * Resolve an imported session title to a single MatrixRow id.
 * - empty value -> no link (allowed; event-level/manual row)
 * - exactly one title match -> matched
 * - no match -> not_found (caller decides: blank or row error)
 * - multiple matches -> ambiguous (never guess)
 */
export function resolveImportSessionId(rawTitle: unknown, index: SessionTitleIndex): ImportSessionResolution {
  if (typeof rawTitle !== "string" || rawTitle.trim() === "") {
    return { status: "empty", matrixRowId: null };
  }
  const ids = index.get(normalizeNameKey(rawTitle));
  if (!ids || ids.length === 0) return { status: "not_found", matrixRowId: null };
  if (ids.length > 1) return { status: "ambiguous", matrixRowId: null };
  return { status: "matched", matrixRowId: ids[0] };
}
