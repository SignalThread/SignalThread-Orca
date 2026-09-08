import { NextResponse } from "next/server";
import type { Json } from "@/types/database";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateAppAccessGrant, reconcileLicenseSeatsUsed } from "@/lib/server/event-user-access";
import {
  exhibitorInviteEventUserPermissions,
  isOrganizerRoleForExhibitorScope,
  normalizeExhibitorInviteRole,
  type ExhibitorInviteRole
} from "@/lib/exhibitor/exhibitor-invite-role";
import { publicUsersRoleForCompanyMember } from "@/lib/exhibitor/company-team-public-users-role";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import { verifyCompanyTeamUserFullyDeleted } from "@/lib/exhibitor/company-team-delete-verify";

function rolePermissions(role: ExhibitorInviteRole, hasAppAccess: boolean): Json {
  return exhibitorInviteEventUserPermissions({ role, hasAppAccess }) as Json;
}

async function resolveScopedEventId(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    actorUserId: string;
    exhibitorCompanyId: string;
  }
) {
  const { actorUserId, exhibitorCompanyId } = params;
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("event_id, created_at")
    .eq("user_id", actorUserId)
    .eq("exhibitor_company_id", exhibitorCompanyId)
    .in("status", ["active", "invited"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { eventId: null, error: error.message ?? "Failed loading exhibitor scope." };
  }

  const eventId = String(data?.event_id ?? "").trim();
  if (!eventId) {
    return { eventId: null, error: "Missing exhibitor scope." };
  }

  return { eventId, error: null };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isCompanyAccountAdminSession(sessionUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const exhibitorCompanyId = String(sessionUser.company_id ?? "").trim();
    if (!exhibitorCompanyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    if (
      !sessionUser.active_company_id &&
      !(await getUserHasExhibitorWebAdminAccess(sessionUser.id, exhibitorCompanyId))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await params;
    const payload = (await request.json().catch(() => ({}))) as {
      fullName?: string;
      role?: string;
      licenseId?: string;
      /** When true/false, overrides licenseId for whether the user should have mobile app access. */
      appAccess?: boolean;
    };
    const fullName = String(payload.fullName ?? "").trim();
    const role = normalizeExhibitorInviteRole(payload.role);
    const licenseId = String(payload.licenseId ?? "").trim();

    if (!role) {
      return NextResponse.json({ error: "A valid role is required." }, { status: 400 });
    }

    let wantsAppAccess: boolean;
    if (role === "viewer") {
      wantsAppAccess = true;
      if (!licenseId) {
        return NextResponse.json(
          { error: "App user (mobile) requires an app seat — select a license." },
          { status: 400 }
        );
      }
    } else {
      wantsAppAccess =
        typeof payload.appAccess === "boolean" ? payload.appAccess : Boolean(licenseId);
    }

    if (wantsAppAccess && !licenseId) {
      return NextResponse.json(
        { error: "App access requires an available app seat — select a license." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { eventId, error: scopeError } = await resolveScopedEventId(supabase, {
      actorUserId: sessionUser.id,
      exhibitorCompanyId
    });
    if (scopeError || !eventId) {
      return NextResponse.json({ error: scopeError ?? "Missing exhibitor scope." }, { status: 400 });
    }

    const { data: targetUser, error: targetUserError } = await (supabase as any)
      .from("users")
      .select("id, role, company_id")
      .eq("id", userId)
      .eq("company_id", exhibitorCompanyId)
      .maybeSingle();

    if (targetUserError || !targetUser) {
      return NextResponse.json({ error: targetUserError?.message ?? "User not found." }, { status: 404 });
    }

    if (isOrganizerRoleForExhibitorScope((targetUser as { role: string | null }).role)) {
      return NextResponse.json({ error: "Cannot edit organizer users." }, { status: 403 });
    }

    let canonicalLicenseId: string | null = null;

    const grant = await evaluateAppAccessGrant({
      eventId,
      exhibitorCompanyId,
      requestedAppAccess: wantsAppAccess,
      excludeUserId: userId
    });
    if (!grant.ok) {
      return NextResponse.json({ error: grant.error }, { status: 409 });
    }
    if (grant.decision === "seats_available") {
      canonicalLicenseId = grant.licenseId;
      if (licenseId && licenseId !== canonicalLicenseId) {
        return NextResponse.json(
          { error: "licenseId does not match the canonical license for this event and company." },
          { status: 400 }
        );
      }
    }

    const usersTableRole = publicUsersRoleForCompanyMember(role);

    const { error: updateError } = await (supabase as any)
      .from("users")
      .update({
        full_name: fullName || null,
        role: usersTableRole,
        license_id: wantsAppAccess ? canonicalLicenseId : null
      })
      .eq("id", userId)
      .eq("company_id", exhibitorCompanyId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message ?? "Failed updating user." }, { status: 400 });
    }

    const { error: membershipUpdateError } = await (supabase as any)
      .from("event_users")
      .update({
        permissions: rolePermissions(role, wantsAppAccess)
      })
      .eq("user_id", userId)
      .eq("exhibitor_company_id", exhibitorCompanyId);

    if (membershipUpdateError) {
      return NextResponse.json(
        { error: membershipUpdateError.message ?? "Failed updating membership permissions." },
        { status: 400 }
      );
    }

    await reconcileLicenseSeatsUsed({ eventId, exhibitorCompanyId }).catch((err) => {
      console.error("[exhibitor/users][PATCH] reconciliation failed", err);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[exhibitor/users][PATCH]", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isCompanyAccountAdminSession(sessionUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const exhibitorCompanyId = String(sessionUser.company_id ?? "").trim();
    if (!exhibitorCompanyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    if (
      !sessionUser.active_company_id &&
      !(await getUserHasExhibitorWebAdminAccess(sessionUser.id, exhibitorCompanyId))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "Missing user id." }, { status: 400 });
    }
    if (userId === sessionUser.id) {
      return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: targetUser, error: userLookupError } = await (supabase as any)
      .from("users")
      .select("id, role, company_id, email")
      .eq("id", userId)
      .eq("company_id", exhibitorCompanyId)
      .maybeSingle();

    if (userLookupError || !targetUser) {
      return NextResponse.json({ error: userLookupError?.message ?? "User not found." }, { status: 404 });
    }

    if (isOrganizerRoleForExhibitorScope((targetUser as { role: string | null }).role)) {
      return NextResponse.json({ error: "Cannot remove organizer users." }, { status: 403 });
    }

    const targetEmail = String((targetUser as { email?: string | null }).email ?? "").trim().toLowerCase() || null;

    const { eventId, error: scopeError } = await resolveScopedEventId(supabase, {
      actorUserId: sessionUser.id,
      exhibitorCompanyId
    });

    const { error: membershipDeleteError } = await (supabase as any)
      .from("event_users")
      .delete()
      .eq("user_id", userId)
      .eq("exhibitor_company_id", exhibitorCompanyId);

    if (membershipDeleteError) {
      return NextResponse.json(
        { error: membershipDeleteError.message ?? "Failed removing event membership." },
        { status: 400 }
      );
    }

    if (targetEmail) {
      const { error: inviteDeleteError } = await (supabase as any)
        .from("invite_codes")
        .delete()
        .eq("exhibitor_company_id", exhibitorCompanyId)
        .eq("email", targetEmail)
        .is("used_at", null);

      if (inviteDeleteError) {
        return NextResponse.json(
          { error: inviteDeleteError.message ?? "Failed clearing pending invites." },
          { status: 400 }
        );
      }
    }

    const { error: userDeleteError } = await (supabase as any)
      .from("users")
      .delete()
      .eq("id", userId)
      .eq("company_id", exhibitorCompanyId);

    if (userDeleteError) {
      return NextResponse.json({ error: userDeleteError.message ?? "Failed removing user." }, { status: 400 });
    }

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    const authDeleteMessage = String(authDeleteError?.message ?? "").trim();
    if (
      authDeleteError &&
      !/not found|user not found/i.test(authDeleteMessage)
    ) {
      return NextResponse.json(
        { error: authDeleteError.message ?? "Failed removing auth user." },
        { status: 400 }
      );
    }

    const verified = await verifyCompanyTeamUserFullyDeleted({
      supabase,
      userId,
      exhibitorCompanyId,
      userEmail: targetEmail
    });
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 400 });
    }

    if (!scopeError && eventId) {
      await reconcileLicenseSeatsUsed({ eventId, exhibitorCompanyId }).catch((err) => {
        console.error("[exhibitor/users][DELETE] reconciliation failed", err);
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[exhibitor/users][DELETE]", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
