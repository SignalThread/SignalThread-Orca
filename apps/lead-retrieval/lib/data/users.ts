import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentScopedUserContext } from "@/lib/data/exhibitor-context";
import {
  eventScopeAccessLabel,
  filterEventUsersRowsForExhibitorUsersPage,
  parseExhibitorEventUserPermissionFlags,
  rollupExhibitorMembershipsByUserId,
  userIdsOnExhibitorEventSlice
} from "@/lib/data/exhibitor-users-company-scope";
import { resolveExhibitorAssignableLicenses } from "@/lib/server/event-user-access";

export type User = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  license_id: string | null;
  user_status: string | null;
  app_access: boolean;
  /**
   * Distinct events where this exhibitor grants `permissions.app` (membership metadata only).
   */
  app_access_event_count: number;
  /**
   * When the Users page is scoped to an event, reflects `event_users.permissions` on that slice.
   */
  event_scope_access_label: "web_admin" | "app_only" | "none";
  created_at: string;
};

export type ExhibitorLicenseOption = {
  id: string;
  scope: "company" | "event";
  event_id: string | null;
  exhibitor_company_id: string | null;
  seats_total: number;
  seats_used: number;
  status: string | null;
};

export async function getExhibitorUsersManagementData() {
  const context = await getCurrentScopedUserContext();
  if (!context.companyId) {
    return {
      users: [] as User[],
      licenses: [] as ExhibitorLicenseOption[],
      scopedEventId: null as string | null
    };
  }

  const adminClient = createAdminClient();

  const licensesPromise = resolveExhibitorAssignableLicenses({
    exhibitorCompanyId: context.companyId,
    eventId: context.eventId
  });

  const licenses = (await licensesPromise).map((row) => ({
    id: row.id,
    scope: row.scope,
    event_id: row.event_id,
    exhibitor_company_id: row.exhibitor_company_id,
    seats_total: row.seats_total,
    seats_used: row.seats_used,
    status: row.status
  }));

  const eventId = context.eventId ? String(context.eventId).trim() : "";

  let listedUsers: Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    license_id: string | null;
    created_at: string;
  }>;

  let membershipByUserId: ReturnType<typeof rollupExhibitorMembershipsByUserId>;
  /** Per-user merged permission flags on the active event slice (event-scoped page only). */
  let sliceFlagsByUserId = new Map<string, { admin: boolean; app: boolean }>();

  if (eventId) {
    const { data: sliceRowsRaw, error: sliceErr } = await adminClient
      .from("event_users")
      .select("user_id, event_id, status, permissions, created_at")
      .eq("event_id", eventId)
      .eq("exhibitor_company_id", context.companyId)
      .order("created_at", { ascending: false });

    if (sliceErr) {
      console.error("SUPABASE_ERROR", {
        fn: "getExhibitorUsersManagementData.event_users_slice",
        error: sliceErr
      });
      throw new Error(`${sliceErr.message} (${sliceErr.code ?? "no_code"})`);
    }

    const sliceRowsAll = (sliceRowsRaw ?? []) as Array<{
      user_id: string;
      event_id: string;
      status: string | null;
      permissions: unknown;
      created_at?: string;
    }>;

    const sliceRows = filterEventUsersRowsForExhibitorUsersPage(sliceRowsAll);

    const sliceUserIds = userIdsOnExhibitorEventSlice(sliceRows);
    sliceFlagsByUserId = new Map();
    for (const r of sliceRows) {
      const uid = String(r.user_id ?? "").trim();
      if (!uid) continue;
      const next = parseExhibitorEventUserPermissionFlags(r.permissions);
      const prev = sliceFlagsByUserId.get(uid) ?? { admin: false, app: false };
      sliceFlagsByUserId.set(uid, { admin: prev.admin || next.admin, app: prev.app || next.app });
    }

    if (sliceUserIds.length === 0) {
      listedUsers = [];
    } else {
      const { data: profiles, error: profilesError } = await adminClient
        .from("users")
        .select("id, full_name, email, role, license_id, created_at")
        .in("id", sliceUserIds)
        .order("full_name", { ascending: true });

      if (profilesError) {
        console.error("SUPABASE_ERROR", {
          fn: "getExhibitorUsersManagementData.users_by_slice_admin",
          error: profilesError
        });
        throw new Error(`${profilesError.message} (${profilesError.code ?? "no_code"})`);
      }

      listedUsers = (profiles ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        role: string;
        license_id: string | null;
        created_at: string;
      }>;
    }

    membershipByUserId = rollupExhibitorMembershipsByUserId(sliceRows);
  } else {
    const { data: usersData, error: usersError } = await adminClient
      .from("users")
      .select("id, full_name, email, role, license_id, created_at")
      .eq("company_id", context.companyId)
      .order("full_name", { ascending: true });

    if (usersError) {
      console.error("SUPABASE_ERROR", { fn: "getExhibitorUsersManagementData.users", error: usersError });
      throw new Error(`${usersError.message} (${usersError.code ?? "no_code"})`);
    }

    listedUsers = ((usersData ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      role: string;
      license_id: string | null;
      created_at: string;
    }>).map((row) => ({ ...row }));

    const companyUserIds = listedUsers.map((row) => row.id);
    const membershipsResult =
      companyUserIds.length > 0
        ? await adminClient
            .from("event_users")
            .select("user_id, event_id, status, permissions, created_at")
            .eq("exhibitor_company_id", context.companyId)
            .in("user_id", companyUserIds)
            .order("created_at", { ascending: false })
        : { data: [] as Array<{ user_id: string; event_id: string; status: string | null; permissions: unknown }>, error: null as null };

    const { data: membershipsData, error: membershipsError } = membershipsResult;
    if (membershipsError) {
      console.error("SUPABASE_ERROR", {
        fn: "getExhibitorUsersManagementData.event_users",
        error: membershipsError
      });
      throw new Error(`${membershipsError.message} (${membershipsError.code ?? "no_code"})`);
    }

    membershipByUserId = rollupExhibitorMembershipsByUserId(
      (membershipsData ?? []) as Array<{
        user_id: string;
        event_id: string;
        status: string | null;
        permissions: unknown;
      }>
    );
  }

  const authStatusByUserId = new Map<string, "active" | "invited">();

  await Promise.all(
    listedUsers.map(async (row) => {
      const { data, error } = await adminClient.auth.admin.getUserById(row.id);
      if (error) {
        console.error("SUPABASE_ERROR", {
          fn: "getExhibitorUsersManagementData.auth",
          userId: row.id,
          error
        });
        authStatusByUserId.set(row.id, "invited");
        return;
      }

      authStatusByUserId.set(row.id, data.user?.last_sign_in_at ? "active" : "invited");
    })
  );

  function displayUserStatus(
    membershipStatus: string | null | undefined,
    authStatus: "active" | "invited"
  ): string {
    const normalizedMembership = String(membershipStatus ?? "").trim().toLowerCase();
    if (normalizedMembership === "invited" || normalizedMembership === "pending") {
      return normalizedMembership;
    }
    return authStatus;
  }

  return {
    users: listedUsers.map((row) => {
      const membership = membershipByUserId.get(row.id);
      const authStatus = authStatusByUserId.get(row.id) ?? "invited";
      const sliceFlags = sliceFlagsByUserId.get(row.id) ?? { admin: false, app: false };
      return {
        ...row,
        user_status: displayUserStatus(membership?.membershipStatusForDisplay ?? null, authStatus),
        app_access: membership?.appAccess ?? false,
        app_access_event_count: membership?.appAccessEventCount ?? 0,
        event_scope_access_label: eventId ? eventScopeAccessLabel(sliceFlags) : "none"
      };
    }) as User[],
    licenses,
    scopedEventId: context.eventId
  };
}

export async function getVisibleUsers() {
  const context = await getCurrentScopedUserContext();
  if (!context.companyId) {
    return [] as User[];
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("users")
    .select("id, full_name, email, role, license_id, created_at")
    .eq("company_id", context.companyId)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("SUPABASE_ERROR", { fn: "getVisibleUsers", error });
    throw new Error(`${error.message} (${error.code ?? "no_code"})`);
  }

  return ((data ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    license_id: string | null;
    created_at: string;
  }>).map((row) => ({
    ...row,
    user_status: null,
    app_access: false,
    app_access_event_count: 0,
    event_scope_access_label: "none" as const
  }));
}

// createExhibitorUser was removed — exhibitor user creation is handled by
// the invite flows in app/api/exhibitor/invite and app/admin/users/actions,
// which use evaluateAppAccessGrant from lib/server/event-user-access.ts.
