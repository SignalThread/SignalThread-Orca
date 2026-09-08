/**
 * Canonical SignalThread Platform ids.
 *
 * Platform Core mints a uuid for every canonical id (user, organization, event).
 * Anything that is not a uuid is rejected before it can reach a query, and uuids
 * are normalized to lowercase because Postgres compares uuid values, not text.
 */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCanonicalPlatformId(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID.test(value.trim());
}

export function normalizePlatformId(value: unknown): string | null {
  return isCanonicalPlatformId(value) ? value.trim().toLowerCase() : null;
}
