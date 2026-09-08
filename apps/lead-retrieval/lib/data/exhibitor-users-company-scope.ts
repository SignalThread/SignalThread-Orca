/**
 * Pure helpers for exhibitor Users management: company-scoped listing with membership rollup.
 */

export type ExhibitorMembershipRow = {
  user_id: string;
  event_id: string;
  status: string | null;
  permissions: unknown;
};

export type ExhibitorMembershipRollup = {
  /** True if any membership row grants `permissions.app`. */
  appAccess: boolean;
  /** Count of distinct events where `permissions.app` is true for this exhibitor slice. */
  appAccessEventCount: number;
  /**
   * If any row is invited/pending, surface that for status UI; otherwise rely on auth-only status.
   */
  membershipStatusForDisplay: string | null;
};

function permissionsAppEnabled(permissions: unknown): boolean {
  return (
    permissions !== null &&
    typeof permissions === "object" &&
    !Array.isArray(permissions) &&
    (permissions as Record<string, unknown>).app === true
  );
}

function normalizeStatus(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

/**
 * Aggregate all `event_users` rows for one exhibitor company and merge per user_id.
 */
export function rollupExhibitorMembershipsByUserId(
  rows: ExhibitorMembershipRow[]
): Map<string, ExhibitorMembershipRollup> {
  const byUser = new Map<
    string,
    { appEvents: Set<string>; anyApp: boolean; pendingState: "none" | "invited" | "pending" }
  >();

  for (const row of rows) {
    const uid = String(row.user_id ?? "").trim();
    if (!uid) continue;

    let bucket = byUser.get(uid);
    if (!bucket) {
      bucket = { appEvents: new Set(), anyApp: false, pendingState: "none" };
      byUser.set(uid, bucket);
    }

    const st = normalizeStatus(row.status);
    if (st === "pending") {
      bucket.pendingState = "pending";
    } else if (st === "invited" && bucket.pendingState !== "pending") {
      bucket.pendingState = "invited";
    }

    if (permissionsAppEnabled(row.permissions)) {
      bucket.anyApp = true;
      const eid = String(row.event_id ?? "").trim();
      if (eid) bucket.appEvents.add(eid);
    }
  }

  const out = new Map<string, ExhibitorMembershipRollup>();
  for (const [userId, bucket] of byUser) {
    const st = bucket.pendingState;
    out.set(userId, {
      appAccess: bucket.anyApp,
      appAccessEventCount: bucket.appEvents.size,
      membershipStatusForDisplay: st === "none" ? null : st
    });
  }
  return out;
}

/**
 * Company-scoped exhibitor Users list: every profile in the exhibitor account is visible.
 * Membership only enriches metadata — it must not remove users from the list.
 */
export function exhibitorManagementVisibleUserIds(companyUserIds: string[]): string[] {
  return [...companyUserIds];
}

/** Membership statuses listed on the exhibitor Users page when an event is selected. */
export function filterEventUsersRowsForExhibitorUsersPage<
  T extends { status: string | null }
>(rows: ReadonlyArray<T>): T[] {
  const allowed = new Set(["active", "invited", "pending"]);
  return rows.filter((r) => allowed.has(normalizeStatus(r.status)));
}

export function userIdsOnExhibitorEventSlice(
  rows: ReadonlyArray<{ user_id: string; status: string | null }>
): string[] {
  const allowed = new Set(["active", "invited", "pending"]);
  const out = new Set<string>();
  for (const r of rows) {
    if (!allowed.has(normalizeStatus(r.status))) continue;
    const uid = String(r.user_id ?? "").trim();
    if (uid) out.add(uid);
  }
  return [...out];
}

export function parseExhibitorEventUserPermissionFlags(permissions: unknown): {
  admin: boolean;
  app: boolean;
} {
  if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) {
    return { admin: false, app: false };
  }
  const o = permissions as Record<string, unknown>;
  return { admin: o.admin === true, app: o.app === true };
}

export function eventScopeAccessLabel(flags: { admin: boolean; app: boolean }): "web_admin" | "app_only" | "none" {
  if (flags.admin) return "web_admin";
  if (flags.app) return "app_only";
  return "none";
}

export function exhibitorUserDisplayName(user: { full_name?: string | null; email?: string | null }): string {
  const fullName = String(user.full_name ?? "").trim();
  if (fullName) return fullName;
  const email = String(user.email ?? "").trim();
  return email || "-";
}
