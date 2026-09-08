/**
 * Pure helpers for conversation upload / lead scope (no Supabase imports — safe for unit tests).
 */

/**
 * Lead must be event-scoped for `exhibitor_viewer` conversation uploads (matches mobile lead RLS).
 */
export function requireLeadEventIdForExhibitorViewerUpload(leadEventId: string | null | undefined): string {
  const eid = String(leadEventId ?? "").trim();
  if (!eid) {
    throw new Error("Forbidden");
  }
  return eid;
}
