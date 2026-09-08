"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import {
  evaluateAppAccessGrant,
  normalizeEventUserPermissions,
  reconcileLicenseSeatsUsed,
  toEventUserPermissionsJson
} from "@/lib/server/event-user-access";
import type {
  AddUserInviteActionState,
  DeleteUserActionState,
  ResendInviteActionState
} from "@/lib/data/platform-admin";
import { INVITE_USER_METADATA, PLATFORM_WIDE_EVENT_ID, readInviteMetadata } from "@/lib/data/platform-admin";
import { resendAuthInvite } from "@/lib/server/invites/resend-auth-invite";
import { sendAuthInvite } from "@/lib/server/invites/send-auth-invite";
import {
  persistUserInviteAccessConfig
} from "@/lib/server/user-invite-access-assignment";
import { createCompanyScopedInvite } from "@/lib/server/company-scoped-invite";
import { isCompanyScopedInviteRole } from "@/lib/access/user-invite-access-config";
import { publicUsersRoleForCompanyMember } from "@/lib/exhibitor/company-team-public-users-role";
import { findAuthUserByEmailAdmin } from "@/lib/server/invites/invite-redeem-auth-email";
import {
  emailMatchesExactCaseInsensitive,
  isAuthUserAlreadyExistsError
} from "@/lib/server/invites/invite-redeem-guards";

type AddUserRole =
  | "platform_admin"
  | "event_organizer"
  | "exhibitor_admin"
  | "exhibitor_viewer";

const INVITE_REDIRECT_TO =
  process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ?? "https://lr.signalthread.ai/auth/callback";

const DUPLICATE_USER_EMAIL_ERROR = "A user with this email address has already been registered.";

function invitePendingEventMatches(metaEventId: string, metaCompanyId: string, requestedEventId: string) {
  if (metaEventId) return metaEventId === requestedEventId;
  return Boolean(metaCompanyId) && requestedEventId === PLATFORM_WIDE_EVENT_ID;
}

async function getActionActorScope() {
  const actor = await getCurrentSessionUser();
  if (!actor) {
    return { ok: false as const, error: "Unauthorized", actor: null, scope: null };
  }
  if (actor.role !== "platform_admin" && actor.role !== "organizer_admin") {
    return { ok: false as const, error: "Forbidden", actor: null, scope: null };
  }
  if (actor.role === "platform_admin") {
    return { ok: true as const, error: null, actor, scope: null };
  }

  const scope = await getOrganizerScope(actor.id);
  return { ok: true as const, error: null, actor, scope };
}

async function findPublicUserProfileByExactEmail(
  supabase: ReturnType<typeof createAdminClient>,
  email: string
): Promise<{ id: string; email: string | null } | null> {
  const { data, error } = await (supabase as any)
    .from("users")
    .select("id, email")
    .ilike("email", email)
    .limit(10);

  if (error) {
    throw new Error(error.message ?? "Failed checking existing users.");
  }

  return (
    ((data ?? []) as Array<{ id: string; email: string | null }>).find((row) =>
      emailMatchesExactCaseInsensitive(row.email, email)
    ) ?? null
  );
}

async function hasActiveCompanyScopedLicense(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string | null
) {
  if (!companyId) return false;
  const { data, error } = await (supabase as any)
    .from("licenses")
    .select("id")
    .eq("scope", "company")
    .eq("status", "active")
    .or(`exhibitor_company_id.eq.${companyId},company_id.eq.${companyId}`)
    .limit(1);
  if (error) {
    throw new Error(error.message ?? "Failed checking company license.");
  }
  return ((data ?? []) as Array<{ id: string }>).length > 0;
}

function readAssignedEventIdsFromMetadata(meta: Record<string, unknown>) {
  const raw = meta[INVITE_USER_METADATA.ASSIGNED_EVENT_IDS];
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => String(id ?? "").trim()).filter(Boolean);
}

export async function addUserInviteAction(formData: FormData): Promise<AddUserInviteActionState> {
  try {
    const fullName = String(formData.get("fullName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const eventId = String(formData.get("eventId") ?? "").trim();
    const rawRole = String(formData.get("role") ?? "").trim().toLowerCase();
    const role: AddUserRole =
      rawRole === "organizer_admin" || rawRole === "organizer"
        ? "event_organizer"
        : (rawRole as AddUserRole);
    const rawRoleKind = String(formData.get("roleKind") ?? "").trim().toLowerCase();
    const uiRoleKind =
      rawRoleKind ||
      (role === "exhibitor_admin" ? "exhibitor_admin" : role === "platform_admin" ? "platform_admin" : role === "event_organizer" ? "organizer_admin" : "");
    const companyId = String(formData.get("companyId") ?? "").trim();
    const exhibitorCompanyId = String(formData.get("exhibitorCompanyId") ?? "").trim();
    const rawEventAccessMode = String(formData.get("eventAccessMode") ?? "").trim() || null;
    const rawAssignedEventIds = String(formData.get("assignedEventIds") ?? "").trim();
    let assignedEventIds: string[] = [];
    if (rawAssignedEventIds) {
      try {
        const parsed = JSON.parse(rawAssignedEventIds);
        if (Array.isArray(parsed)) {
          assignedEventIds = parsed.map((v) => String(v ?? "").trim()).filter(Boolean);
        }
      } catch {
        assignedEventIds = rawAssignedEventIds
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
      }
    }
    const rawPermissions = String(formData.get("permissions") ?? "{}");
    let parsedPermissions: unknown;
    try {
      parsedPermissions = JSON.parse(rawPermissions);
    } catch {
      parsedPermissions = {};
    }
    const normalizedPermissions = normalizeEventUserPermissions(parsedPermissions);
    const permissions = toEventUserPermissionsJson(normalizedPermissions);
    const uiRoleKindIsCompanyScoped =
      !!uiRoleKind && isCompanyScopedInviteRole(uiRoleKind as never);
    const roleUsesExhibitorScope =
      role === "exhibitor_admin" || role === "exhibitor_viewer";
    const requiresManualEventMembership = !uiRoleKindIsCompanyScoped;
    const assignedEventIdsForInvite = uiRoleKindIsCompanyScoped ? assignedEventIds : [];

    if (!fullName || !email || !companyId) {
      return { ok: false, error: "Full name, email, and company are required." };
    }
    if (requiresManualEventMembership && !eventId) {
      return { ok: false, error: "Event is required for this invite." };
    }
    if (
      role !== "platform_admin" &&
      role !== "event_organizer" &&
      role !== "exhibitor_admin" &&
      role !== "exhibitor_viewer"
    ) {
      return { ok: false, error: "Invalid role." };
    }
    if (roleUsesExhibitorScope && !exhibitorCompanyId) {
      return { ok: false, error: "Exhibitor company is required for company-scoped users." };
    }
    if (roleUsesExhibitorScope && exhibitorCompanyId !== companyId) {
      return { ok: false, error: "Company-scoped users must be scoped to their company." };
    }
    if (normalizedPermissions.app && !exhibitorCompanyId) {
      return { ok: false, error: "Missing exhibitor company scope" };
    }
    const scopedExhibitorCompanyId = roleUsesExhibitorScope ? exhibitorCompanyId : null;

    const actorScope = await getActionActorScope();
    if (!actorScope.ok) {
      return { ok: false, error: actorScope.error };
    }
    if (uiRoleKindIsCompanyScoped && !eventId && actorScope.actor?.role !== "platform_admin") {
      return {
        ok: false,
        error: "Only platform admins can provision company-scoped access without an event."
      };
    }
    if (actorScope.scope) {
      const scopedEventIds = new Set(actorScope.scope.events.map((event) => event.id));
      const scopedCompanyIds = new Set(actorScope.scope.companyIds);
      if (eventId && !scopedEventIds.has(eventId)) {
        return { ok: false, error: "Selected event is outside organizer scope." };
      }
      if (!scopedCompanyIds.has(companyId)) {
        return { ok: false, error: "Selected company is outside organizer scope." };
      }
      if (roleUsesExhibitorScope && !scopedCompanyIds.has(exhibitorCompanyId)) {
        return { ok: false, error: "Exhibitor company is outside organizer scope." };
      }
      if (assignedEventIdsForInvite.some((id) => !scopedEventIds.has(id))) {
        return { ok: false, error: "One or more assigned events are outside organizer scope." };
      }
    }

    const supabase = createAdminClient();

    if (!(actorScope.actor?.role === "platform_admin" && roleUsesExhibitorScope && uiRoleKindIsCompanyScoped)) {
      const exactProfileDuplicate = await findPublicUserProfileByExactEmail(supabase, email);
      if (exactProfileDuplicate) {
        return { ok: false, error: DUPLICATE_USER_EMAIL_ERROR };
      }
    }

    const [{ data: eventRow, error: eventError }, { data: companyRow, error: companyError }] =
      await Promise.all([
        eventId
          ? (supabase as any).from("events").select("id").eq("id", eventId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        (supabase as any).from("companies").select("id").eq("id", companyId).maybeSingle()
      ]);

    if (requiresManualEventMembership && (eventError || !eventRow)) {
      return { ok: false, error: eventError?.message ?? "Selected event does not exist." };
    }
    if (companyError || !companyRow) {
      return { ok: false, error: companyError?.message ?? "Selected company does not exist." };
    }

    if (roleUsesExhibitorScope && requiresManualEventMembership) {
      const { data: exhibitorScope, error: exhibitorScopeError } = await (supabase as any)
        .from("exhibitors")
        .select("id")
        .eq("event_id", eventId)
        .eq("company_id", exhibitorCompanyId)
        .maybeSingle();

      if (exhibitorScopeError || !exhibitorScope) {
        return { ok: false, error: exhibitorScopeError?.message ?? "Company is not scoped to the selected event." };
      }
    }

    if (actorScope.actor?.role === "platform_admin" && roleUsesExhibitorScope && uiRoleKindIsCompanyScoped) {
      const companyRole = uiRoleKind === "exhibitor_admin" ? "exhibitor_admin" : "viewer";
      const invite = await createCompanyScopedInvite({
        supabase,
        actor: {
          userId: actorScope.actor.id,
          role: actorScope.actor.role
        },
        targetEmail: email,
        fullName,
        targetRole: companyRole,
        exhibitorCompanyId,
        eventAccessMode: rawEventAccessMode === "assigned_events_only" ? "assigned_events_only" : "all_company_events",
        selectedEventIds: assignedEventIdsForInvite,
        permissions,
        redirectTo: INVITE_REDIRECT_TO
      });
      if (!invite.ok) {
        return { ok: false, error: invite.error };
      }
      return { ok: true, error: null };
    }

    let canonicalLicenseId: string | null = null;
    if (scopedExhibitorCompanyId) {
      const grant = await evaluateAppAccessGrant({
        eventId: eventId || null,
        exhibitorCompanyId: scopedExhibitorCompanyId,
        requestedAppAccess: normalizedPermissions.app
      });
      if (!grant.ok) {
        return { ok: false, error: grant.error };
      }
      canonicalLicenseId = grant.decision === "seats_available" ? grant.licenseId : null;
    }

    let createdAuthUser = false;
    let existingAuthInviteNeedsReissue = false;
    let invitedUserId: string | null = null;
    const inviteMetadata = {
      full_name: fullName,
      [INVITE_USER_METADATA.EVENT_ID]: eventId,
      [INVITE_USER_METADATA.COMPANY_ID]: companyId,
      [INVITE_USER_METADATA.EXHIBITOR_COMPANY_ID]: scopedExhibitorCompanyId ?? "",
      [INVITE_USER_METADATA.ROLE]: uiRoleKind || role,
      [INVITE_USER_METADATA.EVENT_ACCESS_MODE]: rawEventAccessMode ?? "",
      [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: assignedEventIdsForInvite
    };
    const inviteAttempt = await sendAuthInvite({
      supabase,
      email,
      redirectTo: INVITE_REDIRECT_TO,
      userMetadata: inviteMetadata
    });
    if (!inviteAttempt.ok) {
      const inviteErrorMessage = inviteAttempt.error;
      if (!isAuthUserAlreadyExistsError(inviteErrorMessage)) {
        return { ok: false, error: inviteErrorMessage };
      }

      const existingAuthUser = await findAuthUserByEmailAdmin(supabase, email);
      if (!existingAuthUser?.id) {
        return { ok: false, error: inviteErrorMessage };
      }

      const { data: existingAuthData, error: existingAuthError } =
        await supabase.auth.admin.getUserById(existingAuthUser.id);
      if (existingAuthError || !existingAuthData.user?.id) {
        return {
          ok: false,
          error: existingAuthError?.message ?? "Failed loading existing auth user."
        };
      }

      const existingMetadata = (existingAuthData.user.user_metadata ?? {}) as Record<string, unknown>;
      const { data: updatedAuthData, error: updatedAuthError } =
        await supabase.auth.admin.updateUserById(existingAuthUser.id, {
          user_metadata: {
            ...existingMetadata,
            ...inviteMetadata
          }
        });

      if (updatedAuthError || !updatedAuthData.user?.id) {
        return {
          ok: false,
          error: updatedAuthError?.message ?? "Failed updating existing auth user."
        };
      }

      invitedUserId = updatedAuthData.user.id;
      existingAuthInviteNeedsReissue = true;
    } else {
      invitedUserId = inviteAttempt.userId;
      createdAuthUser = true;
    }

    if (!invitedUserId) {
      return { ok: false, error: "Invite succeeded but user id was not returned." };
    }

    let createdUser = false;
    let createdEventScope = false;

    const rollback = async () => {
      if (createdEventScope) {
        let deleteQuery = (supabase as any).from("event_users").delete().eq("user_id", invitedUserId);
        if (eventId) {
          deleteQuery = deleteQuery.eq("event_id", eventId);
        }
        if (scopedExhibitorCompanyId) {
          deleteQuery = deleteQuery.eq("exhibitor_company_id", scopedExhibitorCompanyId);
        }
        await deleteQuery;
      }
      if (createdUser) {
        await (supabase as any).from("users").delete().eq("id", invitedUserId);
      }
      if (createdAuthUser) {
        await supabase.auth.admin.deleteUser(invitedUserId);
      }
    };

    const { data: existingUser, error: existingUserError } = await (supabase as any)
      .from("users")
      .select("id, role, company_id, license_id")
      .eq("id", invitedUserId)
      .maybeSingle();

    if (existingUserError) {
      await rollback();
      return { ok: false, error: existingUserError.message ?? "Failed loading existing user profile." };
    }

    let userInsertError: { message?: string } | null = null;
    if (!existingUser) {
      const usersTableRole =
        uiRoleKind === "exhibitor_viewer"
          ? publicUsersRoleForCompanyMember("viewer")
          : uiRoleKind === "exhibitor_admin"
            ? publicUsersRoleForCompanyMember("exhibitor_admin")
            : role;
      const { error } = await (supabase as any).from("users").insert({
        id: invitedUserId,
        role: usersTableRole,
        company_id: companyId,
        full_name: fullName,
        email,
        license_id: canonicalLicenseId,
        created_at: new Date().toISOString()
      });
      userInsertError = error;
      if (!error) {
        createdUser = true;
      }
    }

    if (userInsertError) {
      await rollback();
      return { ok: false, error: userInsertError.message ?? "Failed creating user profile." };
    }

    if (requiresManualEventMembership) {
      const { error: eventUserInsertError } = await (supabase as any).from("event_users").insert({
        event_id: eventId,
        user_id: invitedUserId,
        exhibitor_company_id: scopedExhibitorCompanyId,
        status: "invited",
        permissions,
        created_at: new Date().toISOString()
      });

      if (eventUserInsertError) {
        await rollback();
        return { ok: false, error: eventUserInsertError.message ?? "Failed creating event user scope." };
      }
      createdEventScope = true;
    }

    if (scopedExhibitorCompanyId && uiRoleKindIsCompanyScoped && rawEventAccessMode !== null) {
      const persistResult = await persistUserInviteAccessConfig({
        supabase,
        userId: invitedUserId,
        companyId: scopedExhibitorCompanyId,
        rawConfig: {
          role: uiRoleKind,
          eventAccessMode: rawEventAccessMode,
          assignedEventIds: assignedEventIdsForInvite
        },
        assignedEventPermissions: permissions,
        assignedEventStatus: "invited"
      });
      if (!persistResult.ok) {
        await rollback();
        return { ok: false, error: persistResult.error };
      }
    }

    if (scopedExhibitorCompanyId) {
      if (eventId) {
        await reconcileLicenseSeatsUsed({
          eventId,
          exhibitorCompanyId: scopedExhibitorCompanyId
        }).catch((err) => {
          console.error("[addUserInviteAction] reconciliation failed", err);
        });
      }
    }

    if (existingAuthInviteNeedsReissue) {
      const reissued = await resendAuthInvite({
        supabase,
        userId: invitedUserId,
        email,
        fullName,
        inviteMetadata: {
          [INVITE_USER_METADATA.EVENT_ID]: eventId,
          [INVITE_USER_METADATA.COMPANY_ID]: companyId,
          [INVITE_USER_METADATA.EXHIBITOR_COMPANY_ID]: scopedExhibitorCompanyId ?? "",
          [INVITE_USER_METADATA.ROLE]: uiRoleKind || role,
          [INVITE_USER_METADATA.EVENT_ACCESS_MODE]: rawEventAccessMode ?? "",
          [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: assignedEventIdsForInvite
        }
      });
      if (!reissued.ok) {
        return { ok: false, error: reissued.error };
      }
    }

    return { ok: true, error: null };
  } catch (error) {
    console.error("[addUserInviteAction]", error);
    const message = error instanceof Error ? error.message : "Unexpected error while adding user.";
    return { ok: false, error: message };
  }
}

/**
 * Reissues a pending Supabase Auth invite without touching event_users (idempotent).
 */
export async function resendInviteAction(formData: FormData): Promise<ResendInviteActionState> {
  try {
    const userId = String(formData.get("userId") ?? "").trim();
    const eventId = String(formData.get("eventId") ?? "").trim();
    const rowSource = String(formData.get("rowSource") ?? "").trim();
    if (!userId || !eventId) {
      return { ok: false, error: "Missing user or event id." };
    }

    const actorScope = await getActionActorScope();
    if (!actorScope.ok) {
      return { ok: false, error: actorScope.error };
    }
    if (actorScope.scope) {
      const scopedEventIds = new Set(actorScope.scope.events.map((event) => event.id));
      if (eventId !== PLATFORM_WIDE_EVENT_ID && !scopedEventIds.has(eventId)) {
        return { ok: false, error: "Selected event is outside organizer scope." };
      }
    }

    const supabase = createAdminClient();

    if (rowSource === "invite_pending") {
      const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
      if (authErr || !authData?.user) {
        return { ok: false, error: authErr?.message ?? "Auth user not found." };
      }
      const meta = (authData.user.user_metadata ?? {}) as Record<string, unknown>;
      const {
        eventId: metaEventId,
        companyId: metaCompanyId,
        exhibitorCompanyId: metaExhibitorCompanyId,
        roleRaw
      } = readInviteMetadata(meta);
      if (!invitePendingEventMatches(metaEventId, metaCompanyId, eventId)) {
        return { ok: false, error: "Invite metadata does not match this event." };
      }
      if (actorScope.scope) {
        const scopedCompanyIds = new Set(actorScope.scope.companyIds);
        if (metaCompanyId && !scopedCompanyIds.has(metaCompanyId)) {
          return { ok: false, error: "User company is outside organizer scope." };
        }
      }
      const email = String(authData.user.email ?? "").trim().toLowerCase();
      if (!email) {
        return { ok: false, error: "User has no email on file." };
      }
      const eventAccessMode = String(meta[INVITE_USER_METADATA.EVENT_ACCESS_MODE] ?? "").trim();
      const assignedEventIds = readAssignedEventIdsFromMetadata(meta);
      if (eventAccessMode === "all_company_events") {
        const licenseOk = await hasActiveCompanyScopedLicense(supabase, metaExhibitorCompanyId ?? metaCompanyId);
        if (!licenseOk) {
          return { ok: false, error: "Missing active company-scoped license for this invite." };
        }
      }

      const fullName =
        typeof meta.full_name === "string"
          ? meta.full_name
          : typeof meta.name === "string"
            ? meta.name
            : null;

      const result = await resendAuthInvite({
        supabase,
        userId,
        email,
        fullName,
        inviteMetadata: {
          [INVITE_USER_METADATA.EVENT_ID]: metaEventId,
          [INVITE_USER_METADATA.COMPANY_ID]: metaCompanyId,
          [INVITE_USER_METADATA.EXHIBITOR_COMPANY_ID]: metaExhibitorCompanyId ?? "",
          [INVITE_USER_METADATA.ROLE]: roleRaw,
          [INVITE_USER_METADATA.EVENT_ACCESS_MODE]: eventAccessMode,
          [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: assignedEventIds
        }
      });
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      return { ok: true, error: null };
    }

    const { data: membership, error: membershipError } = await (supabase as any)
      .from("event_users")
      .select("id, status, user_id, event_id, exhibitor_company_id")
      .eq("user_id", userId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (membershipError || !membership) {
      return { ok: false, error: membershipError?.message ?? "Event membership not found." };
    }

    const status = String((membership as { status?: string }).status ?? "").toLowerCase();
    if (status !== "invited") {
      return { ok: false, error: "User is already active. Ask them to sign in or reset their password instead." };
    }

    const { data: profile, error: profileError } = await (supabase as any)
      .from("users")
      .select("id, full_name, email, role, company_id, event_access_mode")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile?.email) {
      return { ok: false, error: profileError?.message ?? "User profile email not found." };
    }

    const email = String(profile.email).trim().toLowerCase();
    if (!email) {
      return { ok: false, error: "User has no email on file." };
    }

    if (actorScope.scope) {
      const scopedCompanyIds = new Set(actorScope.scope.companyIds);
      const rowCompanyId = (profile as { company_id?: string | null }).company_id;
      if (rowCompanyId && !scopedCompanyIds.has(rowCompanyId)) {
        return { ok: false, error: "User company is outside organizer scope." };
      }
    }
    const companyId =
      String((profile as { company_id?: string | null }).company_id ?? "").trim() ||
      String((membership as { exhibitor_company_id?: string | null }).exhibitor_company_id ?? "").trim();
    const roleRaw = String((profile as { role?: string | null }).role ?? "").trim();
    const eventAccessMode =
      String((profile as { event_access_mode?: string | null }).event_access_mode ?? "").trim() ||
      "assigned_events_only";
    if (eventAccessMode === "all_company_events") {
      const licenseOk = await hasActiveCompanyScopedLicense(supabase, companyId);
      if (!licenseOk) {
        return { ok: false, error: "Missing active company-scoped license for this invite." };
      }
    }

    const assignedEventIds =
      eventAccessMode === "all_company_events"
        ? []
        : [eventId];
    const fullName = String((profile as { full_name?: string | null }).full_name ?? "").trim();
    const result = await resendAuthInvite({
      supabase,
      userId,
      email,
      fullName,
      inviteMetadata: {
        [INVITE_USER_METADATA.EVENT_ID]: eventAccessMode === "all_company_events" ? "" : eventId,
        [INVITE_USER_METADATA.COMPANY_ID]: companyId,
        [INVITE_USER_METADATA.EXHIBITOR_COMPANY_ID]: companyId,
        [INVITE_USER_METADATA.ROLE]: roleRaw,
        [INVITE_USER_METADATA.EVENT_ACCESS_MODE]: eventAccessMode,
        [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: assignedEventIds
      }
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true, error: null };
  } catch (error) {
    console.error("[resendInviteAction]", error);
    const message = error instanceof Error ? error.message : "Unexpected error while resending invite.";
    return { ok: false, error: message };
  }
}

export async function deleteUserAction(formData: FormData): Promise<DeleteUserActionState> {
  try {
    const userId = String(formData.get("userId") ?? "").trim();
    const eventId = String(formData.get("eventId") ?? "").trim();
    const rowSource = String(formData.get("rowSource") ?? "").trim();
    if (!userId || !eventId) {
      return { ok: false, error: "Missing user or event id." };
    }

    const actorScope = await getActionActorScope();
    if (!actorScope.ok) {
      return { ok: false, error: actorScope.error };
    }
    if (actorScope.scope) {
      const scopedEventIds = new Set(actorScope.scope.events.map((event) => event.id));
      if (eventId !== PLATFORM_WIDE_EVENT_ID && !scopedEventIds.has(eventId)) {
        return { ok: false, error: "Selected event is outside organizer scope." };
      }
    }

    const supabase = createAdminClient();

    if (rowSource === "invite_pending") {
      const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
      if (authErr || !authData?.user) {
        return { ok: false, error: authErr?.message ?? "Auth user not found." };
      }
      const meta = (authData.user.user_metadata ?? {}) as Record<string, unknown>;
      const { eventId: metaEventId, companyId: metaCompanyId } = readInviteMetadata(meta);
      if (!invitePendingEventMatches(metaEventId, metaCompanyId, eventId)) {
        return { ok: false, error: "Invite metadata does not match this event." };
      }
      if (actorScope.scope) {
        const scopedCompanyIds = new Set(actorScope.scope.companyIds);
        if (metaCompanyId && !scopedCompanyIds.has(metaCompanyId)) {
          return { ok: false, error: "User company is outside organizer scope." };
        }
      }

      await (supabase as any).from("event_users").delete().eq("user_id", userId).eq("event_id", eventId);

      const { error: profileDeleteError } = await (supabase as any).from("users").delete().eq("id", userId);
      if (profileDeleteError) {
        return { ok: false, error: profileDeleteError.message ?? "Failed deleting user profile." };
      }

      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        return { ok: false, error: authDeleteError.message ?? "Failed deleting auth user." };
      }
      return { ok: true, error: null };
    }

    const { data: userRow, error: userLookupError } = await (supabase as any)
      .from("users")
      .select("id, company_id, license_id")
      .eq("id", userId)
      .maybeSingle();

    if (userLookupError || !userRow) {
      return { ok: false, error: userLookupError?.message ?? "User not found." };
    }

    if (actorScope.scope) {
      const scopedCompanyIds = new Set(actorScope.scope.companyIds);
      const rowCompanyId = (userRow as { company_id: string | null }).company_id;
      if (rowCompanyId && !scopedCompanyIds.has(rowCompanyId)) {
        return { ok: false, error: "User company is outside organizer scope." };
      }
    }

    const { data: deletedEventUsers, error: eventUserDeleteError } = await (supabase as any)
      .from("event_users")
      .delete()
      .eq("user_id", userId)
      .eq("event_id", eventId)
      .select("id, event_id, user_id, exhibitor_company_id, status, permissions, created_at");

    if (eventUserDeleteError) {
      return { ok: false, error: eventUserDeleteError.message ?? "Failed deleting user event scope." };
    }
    const restoredEventUsers = ((deletedEventUsers ?? []) as Array<{
      id: string;
      event_id: string;
      user_id: string;
      exhibitor_company_id: string | null;
      status: string;
      permissions: unknown;
      created_at: string;
    }>).map((row) => ({
      ...row,
      permissions: toEventUserPermissionsJson(row.permissions)
    }));

    const reconcileScopeSet = new Set<string>();
    for (const row of restoredEventUsers) {
      const isActive = String(row.status ?? "").toLowerCase() === "active";
      const hasAppAccess = normalizeEventUserPermissions(row.permissions).app;
      if (!isActive || !hasAppAccess || !row.exhibitor_company_id) {
        continue;
      }
      reconcileScopeSet.add(`${row.event_id}::${row.exhibitor_company_id}`);
    }

    for (const scope of reconcileScopeSet) {
      const [scopeEventId, scopeExhibitorCompanyId] = scope.split("::");
      if (!scopeEventId || !scopeExhibitorCompanyId) {
        continue;
      }
      try {
        await reconcileLicenseSeatsUsed({
          eventId: scopeEventId,
          exhibitorCompanyId: scopeExhibitorCompanyId
        });
      } catch (reconcileError) {
        if (restoredEventUsers.length > 0) {
          await (supabase as any).from("event_users").insert(restoredEventUsers);
        }
        const message =
          reconcileError instanceof Error
            ? reconcileError.message
            : "Failed reconciling seats_used after deleting event membership.";
        return { ok: false, error: message };
      }
    }

    const { error: userDeleteError } = await (supabase as any).from("users").delete().eq("id", userId);
    if (userDeleteError) {
      if (restoredEventUsers.length > 0) {
        await (supabase as any).from("event_users").insert(restoredEventUsers);
        for (const scope of reconcileScopeSet) {
          const [scopeEventId, scopeExhibitorCompanyId] = scope.split("::");
          if (!scopeEventId || !scopeExhibitorCompanyId) {
            continue;
          }
          try {
            await reconcileLicenseSeatsUsed({
              eventId: scopeEventId,
              exhibitorCompanyId: scopeExhibitorCompanyId
            });
          } catch (reconcileError) {
            console.error("SUPABASE_ERROR", {
              fn: "deleteUserAction.reconcileRollback",
              error: reconcileError
            });
          }
        }
      }
      return { ok: false, error: userDeleteError.message ?? "Failed deleting user." };
    }

    await supabase.auth.admin.deleteUser(userId);
    return { ok: true, error: null };
  } catch (error) {
    console.error("[deleteUserAction]", error);
    const message = error instanceof Error ? error.message : "Unexpected error while deleting user.";
    return { ok: false, error: message };
  }
}
