/**
 * Pure conversation audio storage-path helpers.
 *
 * Extracted from `upload-access.ts` (which imports `server-only` transitively) so the
 * path-validation logic — a security boundary that prevents an upload from targeting a
 * different lead's object or escaping the conversations prefix — can be unit-tested directly.
 *
 * Canonical layout: `conversations/<leadId>/<timestamp>.m4a`.
 */
export function buildConversationStoragePath(leadId: string, timestamp = Date.now()): string {
  return `conversations/${leadId}/${timestamp}.m4a`;
}

export function isValidConversationStoragePath(leadId: string, storagePath: string): boolean {
  const expectedPrefix = `conversations/${leadId}/`;
  return storagePath.startsWith(expectedPrefix) && storagePath.endsWith(".m4a");
}
