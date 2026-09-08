import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isExhibitorViewerRole } from "@/lib/auth/role-scope";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import { resolveExhibitorAdminRoleWithoutWebAdminRedirect } from "@/lib/server/exhibitor-web-entry-redirect";
import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "@/lib/exhibitor/exhibitor-web-home";
import type { AppRole, UserRow } from "@/types/app";
import { getValidatedPlatformAdminAccountContext } from "@/lib/server/platform-admin-account-context";
import { projectAccountContextOntoPrincipal } from "@/lib/auth/platform-admin-account-context-core";
import { getRoleHomePath, normalizeSessionRole } from "@/lib/auth/session-role";
export { getRoleHomePath, normalizeSessionRole } from "@/lib/auth/session-role";

export type AppServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type SessionUser = Omit<Pick<UserRow, "id" | "role" | "company_id" | "full_name">, "role"> & {
  role: AppRole | null;
  fullName: string | null;
  /** Canonical company on the authenticated users row (never account-context projected). */
  authenticated_company_id?: string | null;
  /** Validated platform-admin account context, if one is active. */
  active_company_id?: string | null;
  active_company_name?: string | null;
};

type RouteRole = "event_organizer" | "organizer_admin" | "exhibitor_admin";

async function getCurrentUserRow(
  routeSupabase?: AppServerSupabaseClient
): Promise<UserRow | null> {
  const supabase = routeSupabase ?? await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, role, company_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as UserRow;
}

export async function getCurrentSessionUser(
  routeSupabase?: AppServerSupabaseClient
): Promise<SessionUser | null> {
  const userRow = await getCurrentUserRow(routeSupabase);

  if (!userRow) {
    return null;
  }

  const role = normalizeSessionRole(userRow.role);
  const accountContext = await getValidatedPlatformAdminAccountContext({
    userId: userRow.id,
    role
  });
  const projection = projectAccountContextOntoPrincipal({
    principal: { userId: userRow.id, role, companyId: userRow.company_id },
    context: accountContext
  });

  return {
    id: userRow.id,
    role,
    // Existing company-scoped callers consume this effective scope. The real
    // identity and canonical company remain available separately above.
    company_id: projection.companyId,
    full_name: userRow.full_name,
    fullName: userRow.full_name,
    authenticated_company_id: projection.authenticatedCompanyId,
    active_company_id: projection.activeCompanyId,
    active_company_name: projection.activeCompanyName
  };
}

export function hasActivePlatformAdminAccountContext(
  user: Pick<SessionUser, "role" | "active_company_id">
): boolean {
  return user.role === "platform_admin" && Boolean(user.active_company_id);
}

/** Full account-admin capability without projecting the authenticated role. */
export function isCompanyAccountAdminSession(
  user: Pick<SessionUser, "role" | "active_company_id">
): boolean {
  return user.role === "exhibitor_admin" || hasActivePlatformAdminAccountContext(user);
}

export async function requireAuth() {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }

  return sessionUser;
}

export async function requireRole(role: RouteRole) {
  const sessionUser = await requireAuth();
  const normalizedRole = normalizeSessionRole(sessionUser.role);
  if (!normalizedRole) {
    redirect("/login?error=role");
  }

  const expectedRole = role === "event_organizer" ? "organizer_admin" : role;
  const hasOrganizerAccess = normalizedRole === "organizer_admin";
  const hasExhibitorAccess = normalizedRole === "exhibitor_admin";
  const isPlatformAdmin = normalizedRole === "platform_admin";

  if (expectedRole === "exhibitor_admin") {
    if (isPlatformAdmin) {
      if (hasActivePlatformAdminAccountContext(sessionUser)) return sessionUser;
      redirect("/admin");
    }
    if (isExhibitorViewerRole(normalizedRole)) {
      redirect("/exhibitor/leads");
    }
    if (hasExhibitorAccess) {
      const webAdmin = await getUserHasExhibitorWebAdminAccess(
        sessionUser.id,
        String(sessionUser.company_id ?? "")
      );
      if (!webAdmin) {
        redirect(await resolveExhibitorAdminRoleWithoutWebAdminRedirect(sessionUser));
      }
      return sessionUser;
    }
    if (hasOrganizerAccess) {
      redirect("/app/organizer");
    }
    redirect(getRoleHomePath(normalizedRole));
  }

  if (isPlatformAdmin) {
    redirect("/admin");
  }
  if (hasOrganizerAccess) {
    return sessionUser;
  }
  if (hasExhibitorAccess) {
    redirect(EXHIBITOR_WEB_ENTRY_RESOLVER_PATH);
  }
  redirect(getRoleHomePath(normalizedRole));

  return sessionUser;
}

/**
 * Require the caller to be an exhibitor-scoped role: either `exhibitor_admin`
 * (full admin) or `exhibitor_viewer` (read-only). Use on pages that should be visible
 * to both. Pages must still gate write/admin affordances on
 * `isExhibitorAdminRole(sessionUser.role)` (see `lib/auth/role-scope`).
 *
 * Anything else (organizer, platform admin, unknown role) is redirected to
 * its own role-home, mirroring `requireRole("exhibitor_admin")`'s shape.
 */
export async function requireExhibitorScope() {
  const sessionUser = await requireAuth();
  const normalizedRole = normalizeSessionRole(sessionUser.role);
  if (!normalizedRole) {
    redirect("/login?error=role");
  }

  if (normalizedRole === "exhibitor_admin" || normalizedRole === "exhibitor_viewer") {
    return sessionUser;
  }

  if (normalizedRole === "platform_admin") {
    if (hasActivePlatformAdminAccountContext(sessionUser)) return sessionUser;
    redirect("/admin");
  }
  if (normalizedRole === "organizer_admin") {
    redirect("/app/organizer");
  }
  redirect(getRoleHomePath(normalizedRole));
}
