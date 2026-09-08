import "server-only";

import { isExhibitorDirectPortfolioEventAccessResolution } from "@/lib/access/event-access-mode";
import { isExhibitorAdminRole, isExhibitorViewerRole } from "@/lib/auth/role-scope";
import { EXHIBITOR_EVENTS_ENTRY_HREF } from "@/lib/exhibitor/exhibitor-app-nav";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import {
  EXHIBITOR_APP_ACCESS_READY_HREF,
  EXHIBITOR_WEB_ENTRY_RESOLVER_PATH
} from "@/lib/exhibitor/exhibitor-web-home";
import type { AppRole } from "@/types/app";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { getUserHasExhibitorAppAccess, getUserHasExhibitorWebAdminAccess } from "./exhibitor-permission-aggregates";

type SessionLike = { id: string; company_id: string | null; role: AppRole | null };

/**
 * Web-admin landing: company/portfolio (`company_all_events`) → Manage (`/app/events`);
 * event-level / assigned → exhibitor dashboard (event-scoped flows).
 */
export async function resolveExhibitorWebAdminLandingPath(input: {
  userId: string;
  companyId: string | null;
  role: AppRole | null;
}): Promise<string> {
  if (!isExhibitorAdminRole(input.role)) {
    return "/exhibitor/dashboard";
  }
  const uid = String(input.userId ?? "").trim();
  const cid = String(input.companyId ?? "").trim();
  if (!uid || !cid) {
    return "/exhibitor/dashboard";
  }
  const access = await getCachedExhibitorAccessibleEventResolution(uid);
  if (isExhibitorDirectPortfolioEventAccessResolution(access.resolution)) {
    return EXHIBITOR_EVENTS_ENTRY_HREF;
  }
  return "/exhibitor/dashboard";
}

/**
 * Where to send a signed-in exhibitor after password / invite, based on
 * `permissions.admin` (web) and `permissions.app` (mobile), not `users.role` alone.
 */
export async function getExhibitorWebEntryPathAfterSignIn(input: {
  userId: string;
  companyId: string | null;
  role: AppRole | null;
}): Promise<string> {
  const uid = String(input.userId ?? "").trim();
  const cid = String(input.companyId ?? "").trim();
  const role = input.role;
  if (!isExhibitorAdminRole(role) && !isExhibitorViewerRole(role)) {
    return "";
  }
  if (!uid || !cid) {
    return EXHIBITOR_WEB_ENTRY_RESOLVER_PATH;
  }
  const hasWeb = await getUserHasExhibitorWebAdminAccess(uid, cid);
  // A newly invited direct-portfolio admin can legitimately have no event_users
  // rows yet. The canonical resolver still proves their company-scoped license
  // and all-company event access, which is sufficient to enter the account
  // events page and create the first event.
  const access = isExhibitorAdminRole(role)
    ? await getCachedExhibitorAccessibleEventResolution(uid)
    : null;
  const hasPortfolioWebAdminAccess = Boolean(
    access &&
      exhibitorAdminMayUseAppEventManagementRoutes({
        role: access.role,
        resolution: access.resolution
      })
  );
  if (hasWeb || hasPortfolioWebAdminAccess) {
    return resolveExhibitorWebAdminLandingPath({ userId: uid, companyId: cid, role });
  }
  const hasApp = await getUserHasExhibitorAppAccess(uid, cid);
  if (hasApp) {
    return "/exhibitor/dashboard";
  }
  if (isExhibitorViewerRole(role)) {
    return "/exhibitor/leads";
  }
  return "/app/exhibitor?error=web_admin";
}

/**
 * `requireRole("exhibitor_admin")` when the user row is `exhibitor_admin` but
 * has no `permissions.admin` — prefer the app-only landing when they have a seat.
 */
export async function resolveExhibitorAdminRoleWithoutWebAdminRedirect(
  sessionUser: SessionLike
): Promise<string> {
  const hasApp = await getUserHasExhibitorAppAccess(
    sessionUser.id,
    String(sessionUser.company_id ?? "")
  );
  if (hasApp) {
    return EXHIBITOR_APP_ACCESS_READY_HREF;
  }
  return "/app/exhibitor?error=web_admin";
}
