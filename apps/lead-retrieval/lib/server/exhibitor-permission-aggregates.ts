import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEventUserPermissions } from "@/lib/server/event-user-access";
import { eventAppPermissionEnabled } from "@/lib/exhibitor/event-app-permission-enabled";

/**
 * True if the user has at least one `event_users` row for this company where
 * `permissions` satisfy `eventAppPermissionEnabled` (same predicate as DB RLS / migration 0069).
 */
export async function getUserHasExhibitorAppAccess(
  userId: string,
  companyId: string | null
): Promise<boolean> {
  const uid = String(userId ?? "").trim();
  const cid = String(companyId ?? "").trim();
  if (!uid || !cid) return false;

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("permissions")
    .eq("user_id", uid)
    .eq("exhibitor_company_id", cid)
    .in("status", ["active", "invited"]);

  if (error) {
    console.error("[exhibitor-permission-aggregates] app access list failed", error.message);
    return false;
  }

  for (const row of (data ?? []) as Array<{ permissions: unknown }>) {
    if (eventAppPermissionEnabled(row?.permissions)) {
      return true;
    }
  }
  return false;
}

/**
 * Mobile app: `exhibitor_viewer` may act on a single (company, event) slice when this membership row
 * exists and `permissions` satisfy `eventAppPermissionEnabled` (same as RLS / DB function).
 */
export async function userHasExhibitorMobileAppEventAccess(input: {
  userId: string;
  exhibitorCompanyId: string;
  eventId: string;
}): Promise<boolean> {
  const uid = String(input.userId ?? "").trim();
  const cid = String(input.exhibitorCompanyId ?? "").trim();
  const eid = String(input.eventId ?? "").trim();
  if (!uid || !cid || !eid) return false;

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("permissions")
    .eq("user_id", uid)
    .eq("exhibitor_company_id", cid)
    .eq("event_id", eid)
    .in("status", ["active", "invited"])
    .maybeSingle();

  if (error) {
    console.error("[exhibitor-permission-aggregates] mobile event access lookup failed", error.message);
    return false;
  }

  if (!data) return false;
  return eventAppPermissionEnabled((data as { permissions: unknown }).permissions);
}

/**
 * True if the user has at least one `event_users` row for this company with
 * `permissions.admin === true` (web admin / user management, not role alone).
 */
export async function getUserHasExhibitorWebAdminAccess(
  userId: string,
  companyId: string | null
): Promise<boolean> {
  const uid = String(userId ?? "").trim();
  const cid = String(companyId ?? "").trim();
  if (!uid || !cid) return false;

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("permissions")
    .eq("user_id", uid)
    .eq("exhibitor_company_id", cid)
    .in("status", ["active", "invited"]);

  if (error) {
    console.error("[exhibitor-permission-aggregates] web admin list failed", error.message);
    return false;
  }

  for (const row of (data ?? []) as Array<{ permissions: unknown }>) {
    if (normalizeEventUserPermissions(row?.permissions).admin) {
      return true;
    }
  }
  return false;
}

/**
 * Read-only lead APIs (list/get/search):
 * - Bearer (mobile): `resolveApiSession` already enforced app; allow both exhibitor roles.
 * - Browser cookie: `exhibitor_viewer` may read; `exhibitor_admin` only with `permissions.admin` on a slice.
 */
export async function canReadExhibitorLeadsInContext(input: {
  userId: string;
  companyId: string | null;
  role: string;
  isBearer: boolean;
  activePlatformAdminCompanyId?: string | null;
}): Promise<boolean> {
  const role = String(input.role ?? "").trim().toLowerCase();
  if (
    role === "platform_admin" &&
    !input.isBearer &&
    String(input.activePlatformAdminCompanyId ?? "").trim() === String(input.companyId ?? "").trim()
  ) {
    return true;
  }
  if (role === "exhibitor_viewer") {
    return true;
  }
  if (role !== "exhibitor_admin") {
    return false;
  }
  if (input.isBearer) {
    return true;
  }
  return getUserHasExhibitorWebAdminAccess(input.userId, input.companyId);
}

/**
 * Create/update/delete leads (API layer, admin client bypasses RLS):
 * - `exhibitor_admin`: bearer allowed; browser needs `permissions.admin`.
 * - `exhibitor_viewer`: bearer only; must have mobile app entitlement for `leadEventId`
 *   (`userHasExhibitorMobileAppEventAccess`). No browser-side mutations.
 */
export async function canMutateExhibitorLeadsInContext(input: {
  userId: string;
  companyId: string | null;
  role: string;
  isBearer: boolean;
  /** Event scope for `exhibitor_viewer` bearer mutations; required for that path. */
  leadEventId?: string | null;
  /** When true, `exhibitor_viewer` is never allowed (e.g. lead delete). */
  denyExhibitorViewer?: boolean;
  activePlatformAdminCompanyId?: string | null;
}): Promise<boolean> {
  const role = String(input.role ?? "").trim().toLowerCase();
  const companyId = String(input.companyId ?? "").trim();

  if (
    role === "platform_admin" &&
    !input.isBearer &&
    String(input.activePlatformAdminCompanyId ?? "").trim() === companyId
  ) {
    return true;
  }

  if (role === "exhibitor_admin") {
    if (input.isBearer) {
      return true;
    }
    return getUserHasExhibitorWebAdminAccess(input.userId, input.companyId);
  }

  if (role === "exhibitor_viewer") {
    if (!input.isBearer || input.denyExhibitorViewer) {
      return false;
    }
    const eid = String(input.leadEventId ?? "").trim();
    if (!companyId || !eid) {
      return false;
    }
    return userHasExhibitorMobileAppEventAccess({
      userId: input.userId,
      exhibitorCompanyId: companyId,
      eventId: eid
    });
  }

  return false;
}
