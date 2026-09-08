import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  activateInvitedMembershipWithSeatEnforcement,
  normalizeEventUserPermissions
} from "@/lib/server/event-user-access";
import { findAuthUserByEmailAdmin } from "@/lib/server/invites/invite-redeem-auth-email";
import {
  inviteEmailMatchesSession,
  isAuthUserAlreadyExistsError,
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

export const runtime = "nodejs";

type ClaimBody = {
  email?: string;
  code?: string;
  password?: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function resolveExhibitorCompanyId(input: {
  admin: ReturnType<typeof createAdminClient>;
  inviteRow: InviteRedeemInviteRow;
  email: string;
}) {
  const fromInvite = String(input.inviteRow.exhibitor_company_id ?? "").trim();
  if (fromInvite) {
    return fromInvite;
  }

  const { data: userRow, error: userLookupError } = await (input.admin as any)
    .from("users")
    .select("role, company_id")
    .ilike("email", input.email)
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

export async function POST(request: Request) {
  try {
    let payload: ClaimBody = {};
    try {
      payload = (await request.json()) as ClaimBody;
    } catch {
      payload = {};
    }

    const email = normalizeEmail(payload.email);
    const code = String(payload.code ?? "").trim();
    const password = String(payload.password ?? "");

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ error: "Code is required." }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const codeHash = sha256(code);
    const admin = createAdminClient();

    const { data: inviteData, error: inviteError } = await (admin as any)
      .from("invite_codes")
      .select("id, event_id, exhibitor_company_id, email, permissions, event_access_mode")
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (inviteError) {
      throw new Error(inviteError.message ?? "Failed loading invite code.");
    }

    const inviteRow = (inviteData ?? null) as InviteRedeemInviteRow | null;
    if (!inviteRow?.id || !String(inviteRow.event_id ?? "").trim()) {
      return NextResponse.json({ error: "Invalid or expired invite code." }, { status: 400 });
    }

    if (!inviteEmailMatchesSession(inviteRow.email, email)) {
      return NextResponse.json(
        { error: "This invite was sent to a different email address than the one you entered." },
        { status: 400 }
      );
    }

    let exhibitorCompanyId = "";
    try {
      exhibitorCompanyId = await resolveExhibitorCompanyId({
        admin,
        inviteRow,
        email
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invite is missing exhibitor scope.";
      if (message === "Invite is missing exhibitor scope.") {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      throw error;
    }

    const nowIso = new Date().toISOString();
    const { data: pendingData, error: pendingError } = await (admin as any)
      .from("invite_codes")
      .select("id, event_id")
      .eq("exhibitor_company_id", exhibitorCompanyId)
      .ilike("email", email)
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
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      if (e instanceof InviteRedeemNoEventsError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
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
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    if (grantEventIds.length === 0) {
      return NextResponse.json(
        { error: "This invite is missing a valid event assignment and cannot be redeemed." },
        { status: 400 }
      );
    }

    const existingAuthUser = await findAuthUserByEmailAdmin(admin, email);
    let userId = "";

    if (existingAuthUser?.id) {
      const { data: updatedAuthUser, error: updateAuthError } = await admin.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          password,
          email_confirm: true
        }
      );

      if (updateAuthError || !updatedAuthUser?.user?.id) {
        throw new Error(updateAuthError?.message ?? "Failed updating auth user.");
      }

      userId = updatedAuthUser.user.id;
    } else {
      const { data: createdAuthUser, error: createAuthError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (!createAuthError && createdAuthUser?.user?.id) {
        userId = createdAuthUser.user.id;
      } else {
        const errMsg = createAuthError?.message ?? "";
        if (isAuthUserAlreadyExistsError(errMsg)) {
          const fallback = await findAuthUserByEmailAdmin(admin, email);
          if (fallback?.id) {
            const { data: updatedAuthUser, error: updateAuthError } = await admin.auth.admin.updateUserById(
              fallback.id,
              {
                password,
                email_confirm: true
              }
            );
            if (updateAuthError || !updatedAuthUser?.user?.id) {
              throw new Error(updateAuthError?.message ?? "Failed updating auth user.");
            }
            userId = updatedAuthUser.user.id;
          } else {
            return NextResponse.json(
              {
                error:
                  "An account with this email already exists. Sign in with your password, then redeem this invite from the app while signed in.",
                code: "AUTH_USER_EXISTS_USE_REDEEM"
              },
              { status: 409 }
            );
          }
        } else {
          throw new Error(errMsg || "Failed creating auth user.");
        }
      }
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
      return NextResponse.json(
        {
          error:
            "This account is already linked to a different exhibitor company. Use an invite for that company or contact support."
        },
        { status: 400 }
      );
    }

    if (!existingUser) {
      const { error: userInsertError } = await (admin as any).from("users").insert({
        id: userId,
        email,
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
        return NextResponse.json({ error: activation.error }, { status: 400 });
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
      return NextResponse.json({ error: "Invite code already used." }, { status: 400 });
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

    return NextResponse.json({
      ok: true,
      userId,
      eventId: String(inviteRow.event_id),
      exhibitorCompanyId,
      permissions: normalizeEventUserPermissions(inviteRow.permissions),
      eventAccessMode: plan.userEventAccessMode,
      grantedEventIds: grantEventIds
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
