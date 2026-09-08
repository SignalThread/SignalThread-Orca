/**
 * Pure remediation planner for users stranded by the pre-fix redeem bug.
 *
 * Historical behavior (before migration 0063 + the redeem/claim rewrite):
 *   - Admin "All events" produced N `invite_codes` rows (one per event).
 *   - User redeemed ONE code → ONE `event_users` row created, ONE invite
 *     marked `used_at` / `used_by_user_id`.
 *   - Remaining N-1 codes stayed pending (and eventually expired), so the
 *     user only saw ONE event after login even though the admin chose "all".
 *
 * Remediation target (safe, schema-preserving):
 *   - For every `invite_codes` row in an (email, exhibitor_company_id) group
 *     where at least one sibling has `used_by_user_id` set, ensure an active
 *     `event_users` row exists for `(userId, event_id, exhibitor_company_id)`
 *     with `permissions.app = true`.
 *   - Consume any sibling rows still pending (`used_at IS NULL`) so the
 *     historical invite batch is fully accounted for.
 *   - Never change `users.role` — that's orthogonal and could strip dashboard
 *     access. If every invite in the group carries the new
 *     `event_access_mode` column (populated by post-fix creates), mirror it
 *     onto `public.users.event_access_mode` when the user still has the
 *     default and the group is unambiguous.
 *
 * The planner is pure / dependency-free. The script wrapper applies writes
 * (`event_users` upsert + seat-enforced activation + invite consume).
 */

import type { EventAccessMode } from "@/lib/access/event-access-mode";
import { normalizeEventAccessMode } from "@/lib/access/event-access-mode";

export type RemediationInviteRow = {
  id: string;
  event_id: string | null;
  exhibitor_company_id: string | null;
  email: string;
  permissions: unknown;
  event_access_mode: string | null;
  used_at: string | null;
  used_by_user_id: string | null;
};

export type RemediationUserSnapshot = {
  id: string;
  email: string | null;
  role: string | null;
  company_id: string | null;
  event_access_mode: string | null;
};

export type RemediationEventUsersSnapshot = {
  user_id: string;
  event_id: string;
  exhibitor_company_id: string | null;
  status: string | null;
  permissions: unknown;
};

export type RemediationUserGroup = {
  key: string;
  email: string;
  exhibitorCompanyId: string;
  userId: string;
  inviteRows: ReadonlyArray<RemediationInviteRow>;
};

export type UserRemediationStep =
  | {
      kind: "ensure_event_users";
      userId: string;
      eventId: string;
      exhibitorCompanyId: string;
      permissions: { admin: boolean; app: boolean };
    }
  | {
      kind: "consume_invite";
      inviteId: string;
      userId: string;
    }
  | {
      kind: "set_user_event_access_mode";
      userId: string;
      eventAccessMode: EventAccessMode;
    };

export type UserRemediationPlan = {
  group: RemediationUserGroup;
  steps: UserRemediationStep[];
  skipped?: {
    reason:
      | "ambiguous_user"
      | "missing_user_id"
      | "missing_company"
      | "no_used_invite"
      | "company_mismatch"
      | "user_record_missing";
    detail?: string;
  };
};

export type RemediationSummary = {
  plans: UserRemediationPlan[];
  skippedGroupCount: number;
  actionableGroupCount: number;
};

function normalizeEmail(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePermissionsShape(value: unknown): { admin: boolean; app: boolean } {
  if (Array.isArray(value)) {
    const lowered = value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim().toLowerCase());
    return { admin: lowered.includes("admin"), app: lowered.includes("app") };
  }
  if (!value || typeof value !== "object") {
    return { admin: false, app: false };
  }
  const rec = value as Record<string, unknown>;
  return {
    admin: rec.admin === true || rec.admin === "true" || rec.admin === 1,
    app: rec.app === true || rec.app === "true" || rec.app === 1
  };
}

/**
 * Group invite rows by `(email, exhibitor_company_id)` and pin each group to
 * a single `userId`. Skips ambiguous / missing-scope groups with an
 * explanatory reason; callers surface skips in the report.
 */
export function groupInviteRowsForRemediation(
  rows: ReadonlyArray<RemediationInviteRow>
): RemediationUserGroup[] {
  const groups = new Map<string, { email: string; companyId: string; rows: RemediationInviteRow[] }>();
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    const companyId = String(row.exhibitor_company_id ?? "").trim();
    if (!email || !companyId) continue;
    const key = `${email}|${companyId}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = { email, companyId, rows: [] };
      groups.set(key, bucket);
    }
    bucket.rows.push(row);
  }

  const out: RemediationUserGroup[] = [];
  for (const [key, bucket] of groups) {
    const userIds = Array.from(
      new Set(
        bucket.rows
          .map((r) => String(r.used_by_user_id ?? "").trim())
          .filter(Boolean)
      )
    );
    if (userIds.length === 0) continue;
    if (userIds.length > 1) {
      out.push({
        key,
        email: bucket.email,
        exhibitorCompanyId: bucket.companyId,
        userId: "",
        inviteRows: bucket.rows
      });
      continue;
    }
    out.push({
      key,
      email: bucket.email,
      exhibitorCompanyId: bucket.companyId,
      userId: userIds[0],
      inviteRows: bucket.rows
    });
  }
  return out;
}

/**
 * Build per-group remediation steps. Pure — does not touch existing
 * `event_users` rows beyond diffing against the provided snapshots.
 */
export function planUserRemediation(input: {
  group: RemediationUserGroup;
  userSnapshot: RemediationUserSnapshot | null;
  existingEventUsers: ReadonlyArray<RemediationEventUsersSnapshot>;
  nowIso: string;
}): UserRemediationPlan {
  const { group } = input;
  if (!group.userId) {
    return {
      group,
      steps: [],
      skipped: {
        reason: "ambiguous_user",
        detail: `Multiple distinct used_by_user_id values for ${group.email}/${group.exhibitorCompanyId}`
      }
    };
  }

  if (!input.userSnapshot) {
    return {
      group,
      steps: [],
      skipped: { reason: "user_record_missing", detail: `No public.users row for ${group.userId}` }
    };
  }

  const userCompanyId = String(input.userSnapshot.company_id ?? "").trim();
  if (userCompanyId && userCompanyId !== group.exhibitorCompanyId) {
    return {
      group,
      steps: [],
      skipped: {
        reason: "company_mismatch",
        detail: `users.company_id=${userCompanyId} differs from invite exhibitor_company_id=${group.exhibitorCompanyId}`
      }
    };
  }

  const existingByEvent = new Map<string, RemediationEventUsersSnapshot>();
  for (const row of input.existingEventUsers) {
    const eid = String(row.event_id ?? "").trim();
    if (!eid) continue;
    if (String(row.user_id) !== group.userId) continue;
    if (
      row.exhibitor_company_id &&
      String(row.exhibitor_company_id) !== group.exhibitorCompanyId
    ) {
      continue;
    }
    existingByEvent.set(eid, row);
  }

  const steps: UserRemediationStep[] = [];

  const seenEventIds = new Set<string>();
  for (const invite of group.inviteRows) {
    const eventId = String(invite.event_id ?? "").trim();
    if (!eventId) continue;
    if (seenEventIds.has(eventId)) continue;
    seenEventIds.add(eventId);

    const invitePermissions = normalizePermissionsShape(invite.permissions);
    const plannedPermissions = {
      admin: invitePermissions.admin,
      app: invitePermissions.app || true
    };

    const existing = existingByEvent.get(eventId);
    if (!existing) {
      steps.push({
        kind: "ensure_event_users",
        userId: group.userId,
        eventId,
        exhibitorCompanyId: group.exhibitorCompanyId,
        permissions: plannedPermissions
      });
      continue;
    }

    const existingPerms = normalizePermissionsShape(existing.permissions);
    const existingStatus = String(existing.status ?? "").toLowerCase();
    const needsAppUpgrade = !existingPerms.app;
    const needsStatusUpgrade = existingStatus !== "active";
    const needsCompanyScope =
      existing.exhibitor_company_id == null ||
      String(existing.exhibitor_company_id) !== group.exhibitorCompanyId;

    if (needsAppUpgrade || needsStatusUpgrade || needsCompanyScope) {
      steps.push({
        kind: "ensure_event_users",
        userId: group.userId,
        eventId,
        exhibitorCompanyId: group.exhibitorCompanyId,
        permissions: plannedPermissions
      });
    }
  }

  for (const invite of group.inviteRows) {
    if (invite.used_at) continue;
    steps.push({
      kind: "consume_invite",
      inviteId: invite.id,
      userId: group.userId
    });
  }

  const groupModes = new Set(
    group.inviteRows
      .map((r) => String(r.event_access_mode ?? "").trim().toLowerCase())
      .filter((v) => v === "all_company_events" || v === "assigned_events_only")
  );
  if (groupModes.size === 1) {
    const declaredMode = normalizeEventAccessMode(Array.from(groupModes)[0]);
    const currentMode = String(input.userSnapshot.event_access_mode ?? "").trim().toLowerCase();
    if (currentMode && currentMode !== declaredMode) {
      steps.push({
        kind: "set_user_event_access_mode",
        userId: group.userId,
        eventAccessMode: declaredMode
      });
    }
  }

  if (steps.length === 0) {
    return { group, steps };
  }
  return { group, steps };
}

export function buildRemediationSummary(plans: ReadonlyArray<UserRemediationPlan>): RemediationSummary {
  let skippedGroupCount = 0;
  let actionableGroupCount = 0;
  for (const plan of plans) {
    if (plan.skipped) skippedGroupCount += 1;
    else if (plan.steps.length > 0) actionableGroupCount += 1;
  }
  return { plans: [...plans], skippedGroupCount, actionableGroupCount };
}

/**
 * Diagnose a single user's symptom set from already-loaded rows. Used by the
 * audit script to print the human-readable "why is this user broken" summary.
 */
export type UserDiagnosisFlag =
  | "missing_user"
  | "missing_company_id"
  | "company_mismatch"
  | "event_users_missing"
  | "event_users_permissions_app_false"
  | "event_users_status_not_active"
  | "invite_partially_consumed"
  | "invite_has_no_used_row"
  | "event_access_mode_mismatch"
  | "ok";

export function diagnoseUser(input: {
  userSnapshot: RemediationUserSnapshot | null;
  inviteRows: ReadonlyArray<RemediationInviteRow>;
  eventUsers: ReadonlyArray<RemediationEventUsersSnapshot>;
}): UserDiagnosisFlag[] {
  const flags: UserDiagnosisFlag[] = [];
  if (!input.userSnapshot) {
    return ["missing_user"];
  }
  const userCompanyId = String(input.userSnapshot.company_id ?? "").trim();
  if (!userCompanyId) flags.push("missing_company_id");

  const inviteCompanyIds = Array.from(
    new Set(input.inviteRows.map((r) => String(r.exhibitor_company_id ?? "").trim()).filter(Boolean))
  );
  if (
    userCompanyId &&
    inviteCompanyIds.length === 1 &&
    inviteCompanyIds[0] !== userCompanyId
  ) {
    flags.push("company_mismatch");
  }

  const usedInvites = input.inviteRows.filter((r) => r.used_by_user_id);
  const pendingInvites = input.inviteRows.filter((r) => !r.used_at);
  if (usedInvites.length === 0 && input.inviteRows.length > 0) {
    flags.push("invite_has_no_used_row");
  }
  if (usedInvites.length > 0 && pendingInvites.length > 0) {
    flags.push("invite_partially_consumed");
  }

  const invitedEventIds = new Set(
    input.inviteRows.map((r) => String(r.event_id ?? "").trim()).filter(Boolean)
  );
  const activeEventUsersByEvent = new Map<string, RemediationEventUsersSnapshot>();
  for (const row of input.eventUsers) {
    const eid = String(row.event_id ?? "").trim();
    if (!eid) continue;
    activeEventUsersByEvent.set(eid, row);
  }

  for (const eid of invitedEventIds) {
    const row = activeEventUsersByEvent.get(eid);
    if (!row) {
      flags.push("event_users_missing");
      break;
    }
  }
  for (const row of input.eventUsers) {
    const perms = normalizePermissionsShape(row.permissions);
    if (!perms.app) {
      flags.push("event_users_permissions_app_false");
      break;
    }
  }
  for (const row of input.eventUsers) {
    const status = String(row.status ?? "").toLowerCase();
    if (status !== "active") {
      flags.push("event_users_status_not_active");
      break;
    }
  }

  const declaredModes = new Set(
    input.inviteRows
      .map((r) => String(r.event_access_mode ?? "").trim().toLowerCase())
      .filter((v) => v === "all_company_events" || v === "assigned_events_only")
  );
  if (declaredModes.size === 1) {
    const declared = normalizeEventAccessMode(Array.from(declaredModes)[0]);
    const current = String(input.userSnapshot.event_access_mode ?? "").trim().toLowerCase();
    if (current && current !== declared) {
      flags.push("event_access_mode_mismatch");
    }
  }

  if (flags.length === 0) flags.push("ok");
  return flags;
}
