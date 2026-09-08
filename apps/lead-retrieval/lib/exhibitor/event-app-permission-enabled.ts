/**
 * TypeScript mirror of `public.event_app_permission_enabled(jsonb)` (Supabase migration 0069).
 * Shared by server routes, access resolution, and tests (no `server-only` — pure predicate).
 */
const TRUE_TEXT = new Set(["true", "t", "1", "yes"]);

function jsonFieldAsComparableText(value: unknown): string {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number") return String(value);
  return "";
}

export function eventAdminPermissionEnabled(p: unknown): boolean {
  if (p == null || typeof p !== "object" || Array.isArray(p)) {
    return false;
  }

  const r = p as Record<string, unknown>;

  if (r.admin === true) {
    return true;
  }

  const adminText = jsonFieldAsComparableText(r.admin);
  if (TRUE_TEXT.has(adminText)) {
    return true;
  }

  return false;
}

export function eventAppPermissionEnabled(p: unknown): boolean {
  if (p == null || typeof p !== "object" || Array.isArray(p)) {
    return false;
  }

  const r = p as Record<string, unknown>;

  if (r.app === true) {
    return true;
  }

  const appText = jsonFieldAsComparableText(r.app);
  if (TRUE_TEXT.has(appText)) {
    return true;
  }

  const allEventsText = jsonFieldAsComparableText(r.all_events);
  if (TRUE_TEXT.has(allEventsText)) {
    return true;
  }

  const appAccessText = jsonFieldAsComparableText(r.app_access);
  if (TRUE_TEXT.has(appAccessText)) {
    return true;
  }

  const canUseAppText = jsonFieldAsComparableText(r.can_use_app);
  if (TRUE_TEXT.has(canUseAppText)) {
    return true;
  }

  if (jsonFieldAsComparableText(r.scope) === "all") {
    return true;
  }

  if (jsonFieldAsComparableText(r.event_scope) === "all") {
    return true;
  }

  return false;
}

/** Web/settings-listed access: explicit app route entitlement or admin on the membership row. */
export function eventMembershipGrantsAppOrAdminSurface(p: unknown): boolean {
  return eventAppPermissionEnabled(p) || eventAdminPermissionEnabled(p);
}
