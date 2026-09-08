import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  activateInvitedMembershipWithSeatEnforcement,
  normalizeEventUserPermissions
} from "@/lib/server/event-user-access";
import { getAuthenticatedUserEmailForRedeem } from "@/lib/server/invites/invite-redeem-auth-email";
import {
  inviteEmailMatchesSession,
  isExhibitorCompanyConflict,
  isExhibitorSideUsersRole
} from "@/lib/server/invites/invite-redeem-guards";
import {
  assertPublicUsersRoleForInviteRedeemDbWrite,
  InviteRedeemRoleMappingError,
  mergeInviteRedeemUserRole
} from "@/lib/server/invites/invite-permissions-public-users-role";
import { ensureEventMembershipForInviteRedeem } from "@/lib/server/invites/invite-redeem-ensure-event-membership";
import { listEventIdsForExhibitorCompany } from "@/lib/server/invites/invite-redeem-company-events";
import {
  InviteRedeemNoEventsError,
  planInviteRedeem,
  expandGrantEventIdsForAllCompanyEventsMode,
  type InviteRedeemInviteRow,
  type InviteRedeemPendingRow
} from "@/lib/server/invites/invite-redeem-plan";

export function sha256InviteCode(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function resolveExhibitorCompanyIdFromInvite(input: {
  admin: ReturnType<typeof createAdminClient>;
  inviteRow: InviteRedeemInviteRow;
  userId: string;
}) {
  const fromInvite = String(input.inviteRow.exhibitor_company_id ?? "").trim();
  if (fromInvite) {
    return fromInvite;
  }

  const { data: userRow, error: userLookupError } = await (input.admin as any)
    .from("users")
    .select("role, company_id")
    .eq("id", input.userId)
    .maybeSingle();

  if (userLookupError) {
    throw new Error(userLookupError.message ?? "Failed loading user scope.");
  }

  const role = String(userRow?.role ?? "").trim().toLowerCase();
  const companyId = String(userRow?.company_id ?? "").trim();

  if (role && !isExhibitorSideUsersRole(role)) {
    throw new Error("Invite is missing exhibitor scope.");
  }

  if (!companyId) {
    throw new Error("Invite is missing exhibitor scope.");
  }

  return companyId;
}

export type InviteRedeemExecuteSuccess = {
  ok: true;
  eventId: string;
  exhibitorCompanyId: string;
  permissions: ReturnType<typeof normalizeEventUserPermissions>;
  eventAccessMode: string;
  grantedEventIds: string[];
};

export type InviteRedeemExecuteFailure = {
  ok: false;
  error: string;
  httpStatus: number;
};

export async function executeInviteRedeemCore(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    userId: string;
    userEmail: string;
    inviteRow: InviteRedeemInviteRow;
  }
): Promise<InviteRedeemExecuteSuccess | InviteRedeemExecuteFailure> {
  const { userId, userEmail, inviteRow } = input;

  if (!inviteRow?.id || !String(inviteRow.event_id ?? "").trim()) {
    return { ok: false, error: "Invalid or expired invite code.", httpStatus: 400 };
  }

  if (!inviteEmailMatchesSession(inviteRow.email, userEmail)) {
    return {
      ok: false,
      error: "This invite was sent to a different email address than the one on this account.",
      httpStatus: 400
    };
  }

  let exhibitorCompanyId = "";
  try {
    exhibitorCompanyId = await resolveExhibitorCompanyIdFromInvite({
      admin,
      inviteRow,
      userId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invite is missing exhibitor scope.";
    if (message === "Invite is missing exhibitor scope.") {
      return { ok: false, error: message, httpStatus: 400 };
    }
    throw error;
  }

  const nowIso = new Date().toISOString();
  const { data: pendingData, error: pendingError } = await (admin as any)
    .from("invite_codes")
    .select("id, event_id")
    .eq("exhibitor_company_id", exhibitorCompanyId)
    .ilike("email", userEmail)
    .is("used_at", null)
    .gt("expires_at", nowIso);

  if (pendingError) {
    throw new Error(pendingError.message ?? "Failed loading pending invite codes.");
  }

  const pendingRows = (pendingData ?? []) as InviteRedeemPendingRow[];

  let plan;
  try {
    plan = planInviteRedeem({
      inviteRow,
      pendingRowsSameEmailAndCompany: pendingRows
    });
  } catch (e) {
    if (e instanceof InviteRedeemRoleMappingError) {
      return { ok: false, error: e.message, httpStatus: 400 };
    }
    if (e instanceof InviteRedeemNoEventsError) {
      return { ok: false, error: e.message, httpStatus: 400 };
    }
    throw e;
  }

  assertPublicUsersRoleForInviteRedeemDbWrite(plan.role);

  const companyOwnedEventIds =
    plan.userEventAccessMode === "all_company_events"
      ? await listEventIdsForExhibitorCompany(admin, exhibitorCompanyId)
      : [];

  let grantEventIds: string[];
  try {
    grantEventIds = expandGrantEventIdsForAllCompanyEventsMode({
      userEventAccessMode: plan.userEventAccessMode,
      planGrantEventIds: plan.grantEventIds,
      companyOwnedEventIds
    });
  } catch (e) {
    if (e instanceof InviteRedeemNoEventsError) {
      return { ok: false, error: e.message, httpStatus: 400 };
    }
    throw e;
  }

  if (grantEventIds.length === 0) {
    return {
      ok: false,
      error: "This invite is missing a valid event assignment and cannot be redeemed.",
      httpStatus: 400
    };
  }

  const { data: existingUser, error: existingUserError } = await (admin as any)
    .from("users")
    .select("id, role, company_id, event_access_mode")
    .eq("id", userId)
    .maybeSingle();

  if (existingUserError) {
    throw new Error(existingUserError.message ?? "Failed loading existing user profile.");
  }

  if (existingUser && isExhibitorCompanyConflict(existingUser.company_id, exhibitorCompanyId)) {
    return {
      ok: false,
      error:
        "This account is already linked to a different exhibitor company. Use an invite for that company or contact support.",
      httpStatus: 400
    };
  }

  if (!existingUser) {
    const { error: userInsertError } = await (admin as any).from("users").insert({
      id: userId,
      email: userEmail,
      role: plan.role,
      company_id: exhibitorCompanyId,
      event_access_mode: plan.userEventAccessMode,
      created_at: new Date().toISOString()
    });

    if (userInsertError) {
      throw new Error(userInsertError.message ?? "Failed creating user profile.");
    }
  } else {
    const existingRole = String(existingUser.role ?? "").trim().toLowerCase();
    const effectiveRole = mergeInviteRedeemUserRole(existingUser.role, plan.role);
    assertPublicUsersRoleForInviteRedeemDbWrite(effectiveRole);
    const existingMode = String(existingUser.event_access_mode ?? "").trim().toLowerCase();
    const patch: Record<string, unknown> = {};
    if (existingRole !== effectiveRole) {
      patch.role = effectiveRole;
    }
    if (existingMode !== plan.userEventAccessMode) {
      patch.event_access_mode = plan.userEventAccessMode;
    }
    if (!String(existingUser.company_id ?? "").trim()) {
      patch.company_id = exhibitorCompanyId;
    }
    if (Object.keys(patch).length > 0) {
      const { error: userUpdateError } = await (admin as any)
        .from("users")
        .update(patch)
        .eq("id", userId);
      if (userUpdateError) {
        throw new Error(userUpdateError.message ?? "Failed updating user profile.");
      }
    }
  }

  for (const eventId of grantEventIds) {
    await ensureEventMembershipForInviteRedeem({
      admin,
      userId,
      eventId,
      exhibitorCompanyId,
      permissions: inviteRow.permissions
    });

    const activation = await activateInvitedMembershipWithSeatEnforcement({
      userId,
      eventId,
      exhibitorCompanyId
    });

    if (!activation.ok) {
      return { ok: false, error: activation.error ?? "Activation failed.", httpStatus: 400 };
    }
  }

  const usedAt = new Date().toISOString();
  const { data: usedRow, error: usedError } = await (admin as any)
    .from("invite_codes")
    .update({
      used_at: usedAt,
      used_by_user_id: userId
    })
    .eq("id", inviteRow.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (usedError) {
    throw new Error(usedError.message ?? "Failed marking invite as used.");
  }

  if (!usedRow?.id) {
    return { ok: false, error: "Invite code already used.", httpStatus: 400 };
  }

  const additionalConsumeIds = plan.consumeInviteIds.filter((id) => id && id !== inviteRow.id);
  if (additionalConsumeIds.length > 0) {
    const { error: bulkConsumeError } = await (admin as any)
      .from("invite_codes")
      .update({
        used_at: usedAt,
        used_by_user_id: userId
      })
      .in("id", additionalConsumeIds)
      .is("used_at", null);
    if (bulkConsumeError) {
      throw new Error(bulkConsumeError.message ?? "Failed consuming related invite codes.");
    }
  }

  return {
    ok: true,
    eventId: String(inviteRow.event_id),
    exhibitorCompanyId,
    permissions: normalizeEventUserPermissions(inviteRow.permissions),
    eventAccessMode: plan.userEventAccessMode,
    grantedEventIds: grantEventIds
  };
}

export async function loadInviteRowByCodeHash(
  admin: ReturnType<typeof createAdminClient>,
  codeHash: string
): Promise<InviteRedeemInviteRow | null> {
  const { data, error } = await (admin as any)
    .from("invite_codes")
    .select("id, event_id, exhibitor_company_id, email, permissions, event_access_mode")
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed loading invite code.");
  }
  return (data ?? null) as InviteRedeemInviteRow | null;
}

/**
 * One anchor row per (exhibitor_company_id) for unused, unexpired invites to this email.
 */
export async function loadPendingInviteAnchorsByEmail(
  admin: ReturnType<typeof createAdminClient>,
  userEmail: string
): Promise<InviteRedeemInviteRow[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await (admin as any)
    .from("invite_codes")
    .select("id, event_id, exhibitor_company_id, email, permissions, event_access_mode, created_at")
    .ilike("email", userEmail)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed loading pending invite codes for email.");
  }

  const rows = (data ?? []) as Array<InviteRedeemInviteRow & { created_at?: string }>;
  const byCompany = new Map<string, typeof rows>();
  for (const row of rows) {
    const k = String(row.exhibitor_company_id ?? "__none__").trim() || "__none__";
    if (!byCompany.has(k)) {
      byCompany.set(k, []);
    }
    byCompany.get(k)!.push(row);
  }

  const anchors: InviteRedeemInviteRow[] = [];
  for (const group of byCompany.values()) {
    const first = group[0];
    if (first?.id) {
      const { id, event_id, exhibitor_company_id, email, permissions, event_access_mode } = first;
      anchors.push({ id, event_id, exhibitor_company_id, email, permissions, event_access_mode });
    }
  }
  return anchors;
}

export type AuthCallbackInviteCompletionLog =
  | { outcome: "completed"; mode: "invite_code" | "pending_email" | "pending_group"; userId: string; detail?: string }
  | { outcome: "skipped"; reason: string; userId: string; detail?: string }
  | { outcome: "failed"; reason: string; userId: string; error: string };

/**
 * After Supabase establishes a session, complete pending `invite_codes` redemption so
 * `public.users` + `event_users` match the same rules as `POST /api/invites/redeem`.
 *
 * - `rawInviteCode`: optional; same as API body `code` (hashed to look up a single invite).
 * - If omitted, redeems all pending (unused, unexpired) `invite_codes` for the auth email,
 *   one run per exhibitor company group (edited pending rows are whatever is in the DB).
 */
export async function tryCompletePendingInvitesAfterAuth(input: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  /** `invite_code` / app invite param — not the Supabase PKCE `code` */
  rawInviteCode: string | null;
}): Promise<AuthCallbackInviteCompletionLog[]> {
  const logs: AuthCallbackInviteCompletionLog[] = [];
  let userEmail: string;
  try {
    userEmail = (await getAuthenticatedUserEmailForRedeem(input.admin, input.userId)) ?? "";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logs.push({
      outcome: "failed",
      reason: "email_lookup_failed",
      userId: input.userId,
      error: message
    });
    console.warn("auth.invite_completion", logs[logs.length - 1]);
    return logs;
  }

  if (!userEmail) {
    const entry: AuthCallbackInviteCompletionLog = {
      outcome: "skipped",
      reason: "no_email",
      userId: input.userId
    };
    logs.push(entry);
    console.info("auth.invite_completion", entry);
    return logs;
  }

  const code = String(input.rawInviteCode ?? "").trim();
  if (code) {
    const codeHash = sha256InviteCode(code);
    const inviteRow = await loadInviteRowByCodeHash(input.admin, codeHash);
    if (!inviteRow?.id) {
      const entry: AuthCallbackInviteCompletionLog = {
        outcome: "skipped",
        reason: "invalid_or_expired_invite_code_param",
        userId: input.userId
      };
      logs.push(entry);
      console.info("auth.invite_completion", entry);
      return logs;
    }
    if (!inviteEmailMatchesSession(inviteRow.email, userEmail)) {
      const entry: AuthCallbackInviteCompletionLog = {
        outcome: "skipped",
        reason: "invite_email_mismatch",
        userId: input.userId
      };
      logs.push(entry);
      console.warn("auth.invite_completion", entry);
      return logs;
    }

    const result = await executeInviteRedeemCore(input.admin, {
      userId: input.userId,
      userEmail,
      inviteRow
    });
    if (!result.ok) {
      const entry: AuthCallbackInviteCompletionLog = {
        outcome: "failed",
        reason: "redeem_rejected",
        userId: input.userId,
        error: result.error
      };
      logs.push(entry);
      console.warn("auth.invite_completion", entry);
    } else {
      const entry: AuthCallbackInviteCompletionLog = {
        outcome: "completed",
        mode: "invite_code",
        userId: input.userId,
        detail: result.exhibitorCompanyId
      };
      logs.push(entry);
      console.info("auth.invite_completion", entry);
    }
    return logs;
  }

  const anchors = await loadPendingInviteAnchorsByEmail(input.admin, userEmail);
  if (anchors.length === 0) {
    const entry: AuthCallbackInviteCompletionLog = {
      outcome: "skipped",
      reason: "no_pending_invite_codes",
      userId: input.userId
    };
    logs.push(entry);
    console.info("auth.invite_completion", entry);
    return logs;
  }

  for (const inviteRow of anchors) {
    const result = await executeInviteRedeemCore(input.admin, {
      userId: input.userId,
      userEmail,
      inviteRow
    });
    if (!result.ok) {
      if (result.error === "Invite code already used." || result.error.includes("already used")) {
        const entry: AuthCallbackInviteCompletionLog = {
          outcome: "skipped",
          reason: "invite_already_consumed",
          userId: input.userId,
          detail: inviteRow.id
        };
        logs.push(entry);
        console.info("auth.invite_completion", entry);
        continue;
      }
      const entry: AuthCallbackInviteCompletionLog = {
        outcome: "failed",
        reason: "redeem_rejected",
        userId: input.userId,
        error: result.error
      };
      logs.push(entry);
      console.warn("auth.invite_completion", entry);
    } else {
      const entry: AuthCallbackInviteCompletionLog = {
        outcome: "completed",
        mode: "pending_group",
        userId: input.userId,
        detail: result.exhibitorCompanyId
      };
      logs.push(entry);
      console.info("auth.invite_completion", entry);
    }
  }

  return logs;
}
