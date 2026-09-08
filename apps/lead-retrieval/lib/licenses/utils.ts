import { randomUUID } from "crypto";

/**
 * Generates a unique per-row license key: LIC-<10 uppercase hex chars>.
 * This is the uniqueness anchor for each license after dropping
 * the old licenses_unique_event_exhibitor constraint.
 * Format is consistent with the backfill in migration 0024.
 */
export function generateLicenseKey(): string {
  return "LIC-" + randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}
