/**
 * Transient import wizard session — sessionStorage keys scoped to the current browser tab.
 * Used so `?step=` and in-memory wizard state are treated as one session: survives refresh on
 * the wizard route, but clears when leaving the route, signing out, or switching users.
 *
 * Durable server-side data (e.g. enrichment run rows) is not stored here.
 */

const PREFIX = "lead-intel.importWizard.v1";

const KEYS = {
  routeEngaged: `${PREFIX}.routeEngaged`,
  userId: `${PREFIX}.userId`,
} as const;

export function markImportWizardRouteEngaged(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEYS.routeEngaged, "1");
    sessionStorage.setItem(KEYS.userId, userId);
  } catch {
    // Ignore quota / private mode
  }
}

export function isImportWizardRouteEngagedForUser(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(KEYS.routeEngaged) !== "1") return false;
    return sessionStorage.getItem(KEYS.userId) === userId;
  } catch {
    return false;
  }
}

export function clearImportWizardTransientSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEYS.routeEngaged);
    sessionStorage.removeItem(KEYS.userId);
  } catch {
    // ignore
  }
}

/** Path prefix for the exhibitor import wizard route (pathname, no query). */
export const IMPORT_WIZARD_PATH_PREFIX = "/exhibitor/import/wizard";
