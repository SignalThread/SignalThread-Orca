import { NextResponse } from "next/server";
import type { Json } from "@/types/database";
import { INVITE_USER_METADATA } from "@/lib/data/platform-admin";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateAppAccessGrant, reconcileLicenseSeatsUsed } from "@/lib/server/event-user-access";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";
import { persistUserInviteAccessConfig } from "@/lib/server/user-invite-access-assignment";
import { resolveExhibitorInviteEventId } from "@/lib/server/invites/exhibitor-invite-event-scope";
import { isCompanyScopedInviteRole } from "@/lib/access/user-invite-access-config";
import {
  exhibitorInviteEventUserPermissions,
  exhibitorTeamRoleProductLabel,
  normalizeExhibitorInviteAccessType,
  normalizeExhibitorInviteRole,
  type ExhibitorInviteRole
} from "@/lib/exhibitor/exhibitor-invite-role";
import { publicUsersRoleForCompanyMember } from "@/lib/exhibitor/company-team-public-users-role";
import { findAuthUserByEmailAdmin } from "@/lib/server/invites/invite-redeem-auth-email";
import { isAuthUserAlreadyExistsError } from "@/lib/server/invites/invite-redeem-guards";
import { mergeInviteRedeemUserRole } from "@/lib/server/invites/invite-permissions-public-users-role";

const INVITE_REDIRECT_TO =
  process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ?? "https://lr.signalthread.ai/auth/callback";

type InvitePayload = {
  email?: string;
  fullName?: string;
  /** Canonical stored role. UI label mapping happens client-side via exhibitorTeamRoleProductLabel. */
  role?: string;
  /** @deprecated kept for backwards-compat with older callers — server re-derives from `role`. */
  roleKind?: string;
  accessType?: string;
  licenseId?: string;
  eventId?: string;
  eventAccessMode?: string;
  assignedEventIds?: unknown;
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    const v = String(raw ?? "").trim();
    if (v) out.push(v);
  }
  return out;
}

function rolePermissionsJson(role: ExhibitorInviteRole, hasAppAccess: boolean): Json {
  return exhibitorInviteEventUserPermissions({ role, hasAppAccess }) as Json;
}

/** Persisted role kind for user-invite-access-config — mirrors `exhibitor_admin` vs `exhibitor_viewer`. */
function roleKindForPersistence(role: ExhibitorInviteRole): "exhibitor_admin" | "exhibitor_viewer" {
  return role === "exhibitor_admin" ? "exhibitor_admin" : "exhibitor_viewer";
}

function buildExhibitorInviteAuthData(input: {
  fullName: string;
  eventId: string;
  exhibitorCompanyId: string;
  roleKind: "exhibitor_admin" | "exhibitor_viewer";
  eventAccessMode: string;
  assignedEventIds: string[];
}) {
  return {
    full_name: input.fullName || null,
    [INVITE_USER_METADATA.EVENT_ID]: input.eventId,
    [INVITE_USER_METADATA.COMPANY_ID]: input.exhibitorCompanyId,
    [INVITE_USER_METADATA.EXHIBITOR_COMPANY_ID]: input.exhibitorCompanyId,
    [INVITE_USER_METADATA.ROLE]: input.roleKind,
    [INVITE_USER_METADATA.EVENT_ACCESS_MODE]: input.eventAccessMode,
    [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: input.assignedEventIds
  };
}

async function ensureExhibitorInviteAuthUser(input: {
  supabase: ReturnType<typeof createAdminClient>;
  email: string;
  authData: ReturnType<typeof buildExhibitorInviteAuthData>;
}) {
  const inviteAttempt = await input.supabase.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: INVITE_REDIRECT_TO,
    data: input.authData
  });

  if (!inviteAttempt.error && inviteAttempt.data.user?.id) {
    return { userId: inviteAttempt.data.user.id };
  }

  const inviteErrorMessage = inviteAttempt.error?.message ?? "Failed to send invite.";
  if (!isAuthUserAlreadyExistsError(inviteErrorMessage)) {
    return { userId: null, error: inviteErrorMessage };
  }

  const existingAuthUser = await findAuthUserByEmailAdmin(input.supabase, input.email);
  if (!existingAuthUser?.id) {
    return { userId: null, error: inviteErrorMessage };
  }

  const { data: existingAuthData, error: existingAuthError } =
    await input.supabase.auth.admin.getUserById(existingAuthUser.id);
  if (existingAuthError || !existingAuthData.user?.id) {
    return {
      userId: null,
      error: existingAuthError?.message ?? "Failed loading existing auth user."
    };
  }

  const existingMetadata = (existingAuthData.user.user_metadata ?? {}) as Record<string, unknown>;
  const { data: updatedAuthData, error: updatedAuthError } =
    await input.supabase.auth.admin.updateUserById(existingAuthUser.id, {
      user_metadata: {
        ...existingMetadata,
        ...input.authData
      }
    });

  if (updatedAuthError || !updatedAuthData.user?.id) {
    return {
      userId: null,
      error: updatedAuthError?.message ?? "Failed updating existing auth user."
    };
  }

  return { userId: updatedAuthData.user.id };
}

async function resolveScopedEventId(
  params: {
    actorUserId: string;
    exhibitorCompanyId: string;
    requestedEventId: string | null;
  }
) {
  const { actorUserId, exhibitorCompanyId, requestedEventId } = params;
  const access = await getCachedExhibitorAccessibleEventResolution(actorUserId);
  if (String(access.companyId ?? "").trim() !== exhibitorCompanyId) {
    return { eventId: null, error: "Missing exhibitor scope." };
  }

  const activeEventId = await resolveExhibitorAppActiveEventId(actorUserId, requestedEventId);
  return resolveExhibitorInviteEventId({
    requestedEventId,
    activeEventId,
    accessibleEventIds: access.eventIds,
    accessResolution: access.resolution
  });
}

export async function POST(request: Request) {
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

    const payload = (await request.json().catch(() => ({}))) as InvitePayload;
    const email = String(payload.email ?? "").trim().toLowerCase();
    const fullName = String(payload.fullName ?? "").trim();
    const { accessType, hasAppAccess } = normalizeExhibitorInviteAccessType(payload.accessType);
    const requestedEventId = String(payload.eventId ?? "").trim() || null;
    const role = normalizeExhibitorInviteRole(payload.role);
    const uiRoleKind = role ? roleKindForPersistence(role) : "exhibitor_viewer";
    const rawEventAccessMode =
      typeof payload.eventAccessMode === "string"
        ? payload.eventAccessMode.trim() || null
        : null;
    const assignedEventIds = normalizeStringArray(payload.assignedEventIds);

    if (!email || !role) {
      return NextResponse.json(
        { error: "email and a valid role are required." },
        { status: 400 }
      );
    }
    const supabase = createAdminClient();
    const { eventId, error: scopeError } = await resolveScopedEventId({
      actorUserId: sessionUser.id,
      exhibitorCompanyId,
      requestedEventId
    });

    if (scopeError || !eventId) {
      return NextResponse.json({ error: scopeError ?? "Missing exhibitor scope." }, { status: 400 });
    }

    const grant = await evaluateAppAccessGrant({
      eventId,
      exhibitorCompanyId,
      requestedAppAccess: hasAppAccess
    });
    if (!grant.ok) {
      return NextResponse.json({ error: grant.error }, { status: 409 });
    }
    const canonicalLicenseId = grant.decision === "seats_available" ? grant.licenseId : null;

    const inviteEventAccessMode =
      rawEventAccessMode !== null && isCompanyScopedInviteRole(uiRoleKind as never)
        ? rawEventAccessMode
        : "assigned_events_only";
    const inviteAssignedEventIds =
      rawEventAccessMode !== null && isCompanyScopedInviteRole(uiRoleKind as never)
        ? assignedEventIds
        : [eventId];

    const authData = buildExhibitorInviteAuthData({
      fullName,
      eventId,
      exhibitorCompanyId,
      roleKind: uiRoleKind,
      eventAccessMode: inviteEventAccessMode,
      assignedEventIds: inviteAssignedEventIds
    });
    const { userId: invitedUserId, error: inviteAuthError } = await ensureExhibitorInviteAuthUser({
      supabase,
      email,
      authData
    });
    if (inviteAuthError) {
      return NextResponse.json({ error: inviteAuthError }, { status: 400 });
    }
    if (!invitedUserId) {
      return NextResponse.json(
        { error: "Invite succeeded but user id was not returned." },
        { status: 500 }
      );
    }

    const permissions = rolePermissionsJson(role, hasAppAccess);

    const usersTableRole = publicUsersRoleForCompanyMember(role);

    const { data: existingUser, error: existingUserError } = await (supabase as any)
      .from("users")
      .select("id, role, company_id")
      .eq("id", invitedUserId)
      .maybeSingle();
    if (existingUserError) {
      return NextResponse.json({ error: existingUserError.message ?? "Failed loading user profile." }, { status: 400 });
    }

    if (existingUser) {
      const existingRole = String((existingUser as { role: string | null }).role ?? "").toLowerCase();
      if (existingRole === "event_organizer" || existingRole === "organizer_admin" || existingRole === "platform_admin") {
        return NextResponse.json({ error: "Cannot modify organizer users from exhibitor scope." }, { status: 403 });
      }

      const existingCompanyId = String((existingUser as { company_id: string | null }).company_id ?? "").trim();
      if (existingCompanyId && existingCompanyId !== exhibitorCompanyId) {
        return NextResponse.json({ error: "User belongs to another company." }, { status: 403 });
      }

      const effectiveUsersRole = mergeInviteRedeemUserRole(
        (existingUser as { role: string | null }).role,
        usersTableRole
      );

      const { error: updateUserError } = await (supabase as any)
        .from("users")
        .update({
          role: effectiveUsersRole,
          company_id: exhibitorCompanyId,
          full_name: fullName || null,
          email,
          license_id: canonicalLicenseId
        })
        .eq("id", invitedUserId);

      if (updateUserError) {
        return NextResponse.json({ error: updateUserError.message ?? "Failed updating user profile." }, { status: 400 });
      }
    } else {
      const { error: insertUserError } = await (supabase as any).from("users").insert({
        id: invitedUserId,
        role: usersTableRole,
        company_id: exhibitorCompanyId,
        full_name: fullName || null,
        email,
        license_id: canonicalLicenseId,
        created_at: new Date().toISOString()
      });

      if (insertUserError) {
        return NextResponse.json({ error: insertUserError.message ?? "Failed creating user profile." }, { status: 400 });
      }
    }

    const { data: existingMembership, error: membershipLookupError } = await (supabase as any)
      .from("event_users")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", invitedUserId)
      .eq("exhibitor_company_id", exhibitorCompanyId)
      .maybeSingle();

    if (membershipLookupError) {
      return NextResponse.json(
        { error: membershipLookupError.message ?? "Failed loading event membership." },
        { status: 400 }
      );
    }

    if (existingMembership) {
      const { error: membershipUpdateError } = await (supabase as any)
        .from("event_users")
        .update({
          status: "invited",
          permissions
        })
        .eq("id", String((existingMembership as { id: string }).id));

      if (membershipUpdateError) {
        return NextResponse.json(
          { error: membershipUpdateError.message ?? "Failed updating event membership." },
          { status: 400 }
        );
      }
    } else {
      const { error: membershipInsertError } = await (supabase as any).from("event_users").insert({
        event_id: eventId,
        user_id: invitedUserId,
        exhibitor_company_id: exhibitorCompanyId,
        status: "invited",
        permissions,
        created_at: new Date().toISOString()
      });

      if (membershipInsertError) {
        return NextResponse.json(
          { error: membershipInsertError.message ?? "Failed creating event membership." },
          { status: 400 }
        );
      }
    }

    if (
      rawEventAccessMode !== null &&
      isCompanyScopedInviteRole(uiRoleKind as never)
    ) {
      const persistResult = await persistUserInviteAccessConfig({
        supabase,
        userId: invitedUserId,
        companyId: exhibitorCompanyId,
        rawConfig: {
          role: uiRoleKind,
          eventAccessMode: rawEventAccessMode,
          assignedEventIds
        },
        assignedEventPermissions: permissions,
        assignedEventStatus: "invited"
      });
      if (!persistResult.ok) {
        return NextResponse.json({ error: persistResult.error }, { status: 400 });
      }
    }

    if (hasAppAccess) {
      await reconcileLicenseSeatsUsed({ eventId, exhibitorCompanyId }).catch((err) => {
        console.error("[exhibitor/invite] reconciliation failed", err);
      });
    }

    return NextResponse.json(
      {
        ok: true,
        userId: invitedUserId,
        role,
        roleLabel: exhibitorTeamRoleProductLabel(role),
        accessType,
        status: "invited"
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[exhibitor/invite]", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
