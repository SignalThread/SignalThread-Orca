import type { AdminLicenseScope } from "@/lib/licenses/admin-license-create-validation";

/**
 * Product default: company-scoped licenses may create events unless explicitly opted out.
 * Event-scoped packs never grant account-level event creation via this flag.
 */
export function resolveCanCreateEventsForNewLicense(
  scope: AdminLicenseScope,
  explicitFromPayload?: boolean
): boolean {
  if (scope === "company") {
    return explicitFromPayload !== false;
  }
  return false;
}
