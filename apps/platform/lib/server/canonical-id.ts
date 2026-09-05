/** Canonical 8-4-4-4-12 uuid, any version. Platform Core mints uuids for every canonical id. */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSafeCanonicalId(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID.test(value.trim());
}
