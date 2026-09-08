"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { normalizeEventAccessMode, type EventAccessMode } from "@/lib/access/event-access-mode";
import { isPlatformAdminCompanyScopedUserManager } from "@/lib/admin/company-scoped-user-actions";
import { buildCompanyMemberInviteAuthData } from "@/lib/exhibitor/company-admin-invite-metadata";
import { publicUsersRoleForCompanyMember } from "@/lib/exhibitor/company-team-public-users-role";
import { normalizeExhibitorInviteRole, type ExhibitorInviteRole } from "@/lib/exhibitor/exhibitor-invite-role";
import { orchestrateCompanyAppUserInvite } from "@/lib/exhibitor/company-team-app-user-invite";
import { generateEmergencyLoginCodeForUser } from "@/lib/server/emergency-login-code";
import type { EmergencyLoginCodeResult } from "@/lib/server/emergency-login-code-core";
import { createInviteCode } from "@/lib/server/invites/createInviteCode";
import { sendCompanyTeamAppUserInviteEmail } from "@/lib/server/email/sendInviteEmail";
import { resendAuthInvite } from "@/lib/server/invites/resend-auth-invite";
import { reconcileCompanyLicenseSeatsUsed, reconcileLicenseSeatsUsed } from "@/lib/server/event-user-access";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string };

type AdminClient = ReturnType<typeof createAdminClient>;

const USERS_PATH = "/admin/company-licenses/users";

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function permissionsForRole(role: ExhibitorInviteRole) {
  return role === "exhibitor_admin" ? { admin: true, app: true } : { admin: false, app: true };
}

async function requirePlatformAdmin(): Promise<ActionState | null> {
  const actor = await getCurrentSessionUser();
  if (!actor) return { ok: false, error: "Unauthorized." };
  if (!isPlatformAdminCompanyScopedUserManager(actor.role)) {
    return { ok: false, error: "Only platform admins can manage company-scoped users here." };
  }
  return null;
}

async function listCompanyEventIds(supabase: AdminClient, companyId: string): Promise<string[]> {
  const { data, error } = await (supabase as any).from("events").select("id").eq("company_id", companyId);
  if (error) throw new Error(error.message ?? "Failed loading company events.");
  return ((data ?? []) as Array<{ id: string | null }>).map((row) => String(row.id ?? "").trim()).filter(Boolean);
}

async function listUserCompanyMembershipEventIds(
  supabase: AdminClient,
  userId: string,
  companyId: string,
  statuses: string[] = ["active", "invited"]
): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("event_id")
    .eq("user_id", userId)
    .eq("exhibitor_company_id", companyId)
    .in("status", statuses);
  if (error) throw new Error(error.message ?? "Failed loading event memberships.");
  return Array.from(
    new Set(((data ?? []) as Array<{ event_id: string | null }>).map((row) => String(row.event_id ?? "").trim()).filter(Boolean))
  );
}

async function reconcileCompanyAndEvents(supabase: AdminClient, companyId: string, eventIds: string[]) {
  for (const eventId of eventIds) {
    await reconcileLicenseSeatsUsed({ eventId, exhibitorCompanyId: companyId }).catch((error) => {
      console.error("[company-scoped-users] event seat reconciliation failed", { eventId, companyId, error });
    });
  }
  await reconcileCompanyLicenseSeatsUsed({ exhibitorCompanyId: companyId }).catch((error) => {
    console.error("[company-scoped-users] company seat reconciliation failed", { companyId, error });
  });
}

async function resendPendingAppInvite(supabase: AdminClient, companyId: string, email: string): Promise<ActionState> {
  const { data: pendingRows, error: pendingErr } = await (supabase as any)
    .from("invite_codes")
    .select("event_id")
    .eq("exhibitor_company_id", companyId)
    .eq("email", email)
    .is("used_at", null);
  if (pendingErr) return { ok: false, error: pendingErr.message ?? "Failed loading pending invites." };

  const pendingEventIds = Array.from(
    new Set(((pendingRows ?? []) as Array<{ event_id: string | null }>).map((row) => String(row.event_id ?? "").trim()).filter(Boolean))
  );
  if (pendingEventIds.length === 0) return { ok: false, error: "No pending invite to resend." };

  const companyEventIds = await listCompanyEventIds(supabase, companyId);
  const companyEventSet = new Set(companyEventIds);
  const scopedIds = pendingEventIds.filter((id) => companyEventSet.has(id));
  if (scopedIds.length === 0) return { ok: false, error: "Pending invite events are no longer in this company." };

  const coversAll = companyEventIds.length > 0 && scopedIds.length === companyEventIds.length;
  const eventAccessMode: EventAccessMode = coversAll ? "all_company_events" : "assigned_events_only";
  const assignedEventIds = coversAll ? [] : scopedIds;

  const result = await orchestrateCompanyAppUserInvite(
    {
      supabase,
      loadCompanyEvents: async (args) => {
        let query = (supabase as any).from("events").select("id, name").eq("company_id", args.companyId);
        if (args.eventAccessMode === "assigned_events_only") {
          query = query.in("id", args.assignedEventIds);
        }
        const { data, error } = await query.order("name", { ascending: true });
        return error
          ? { ok: false, error: error.message ?? "Failed loading events." }
          : { ok: true, events: (data ?? []) as Array<{ id: string; name: string | null }> };
      },
      clearPendingInvitesForEvents: async (args) => {
        const { error } = await (supabase as any)
          .from("invite_codes")
          .delete()
          .eq("exhibitor_company_id", args.companyId)
          .eq("email", args.email)
          .in("event_id", args.eventIds)
          .is("used_at", null);
        return error ? { ok: false, error: error.message ?? "Failed clearing prior app invites." } : { ok: true };
      },
      deleteInviteCodesByIds: async (ids) => {
        if (ids.length > 0) await (supabase as any).from("invite_codes").delete().in("id", ids);
      },
      createInviteCode,
      sendAppUserInviteEmail: sendCompanyTeamAppUserInviteEmail,
      isEmailConfigured: () => Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL)
    },
    { companyId, email, eventAccessMode, assignedEventIds }
  );

  return result.ok ? { ok: true, message: result.message } : { ok: false, error: result.error };
}

export async function updateCompanyScopedUserFromAdminAction(formData: FormData): Promise<ActionState> {
  const authz = await requirePlatformAdmin();
  if (authz) return authz;

  const kind = String(formData.get("kind") ?? "").trim();
  const companyId = String(formData.get("companyId") ?? "").trim();
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const currentEmail = normalizeEmail(formData.get("currentEmail"));
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = normalizeExhibitorInviteRole(formData.get("role") ?? "viewer");

  if (!companyId || !role) return { ok: false, error: "Missing company or role." };

  const supabase = createAdminClient();

  if (kind === "pending") {
    if (!currentEmail) return { ok: false, error: "Missing pending invite email." };
    const { data, error } = await (supabase as any)
      .from("invite_codes")
      .update({
        permissions: permissionsForRole(role)
      })
      .eq("exhibitor_company_id", companyId)
      .eq("email", currentEmail)
      .is("used_at", null)
      .select("id");
    if (error) return { ok: false, error: error.message ?? "Failed updating pending invite." };
    if (((data ?? []) as Array<{ id: string }>).length === 0) {
      return { ok: false, error: "No pending invite was found for that email." };
    }
    revalidatePath(USERS_PATH);
    return { ok: true, message: "Pending invite updated." };
  }

  if (!targetUserId) return { ok: false, error: "Missing user." };
  const { data: userRow, error: userErr } = await (supabase as any)
    .from("users")
    .select("id, company_id, email, full_name, role, event_access_mode")
    .eq("id", targetUserId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (userErr || !userRow) return { ok: false, error: userErr?.message ?? "User not found in this company." };

  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(targetUserId);
  if (authErr || !authData?.user) return { ok: false, error: authErr?.message ?? "Auth user not found." };

  const eventAccessMode = normalizeEventAccessMode((userRow as { event_access_mode?: string | null }).event_access_mode);
  const assignedEventIds =
    eventAccessMode === "all_company_events"
      ? []
      : await listUserCompanyMembershipEventIds(supabase, targetUserId, companyId);
  const existingMetadata = (authData.user.user_metadata ?? {}) as Record<string, unknown>;
  const authPatch: Record<string, unknown> = {
    user_metadata: {
      ...existingMetadata,
      ...buildCompanyMemberInviteAuthData({
        companyId,
        dbRole: role,
        eventAccessMode,
        assignedEventIds,
        fullName: fullName || null
      })
    }
  };

  const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(targetUserId, authPatch);
  if (authUpdateErr) return { ok: false, error: authUpdateErr.message ?? "Failed updating auth user." };

  const { error: updateErr } = await (supabase as any)
    .from("users")
    .update({
      full_name: fullName || null,
      role: publicUsersRoleForCompanyMember(role)
    })
    .eq("id", targetUserId)
    .eq("company_id", companyId);
  if (updateErr) return { ok: false, error: updateErr.message ?? "Failed updating user." };

  const { error: membershipErr } = await (supabase as any)
    .from("event_users")
    .update({ permissions: permissionsForRole(role) })
    .eq("user_id", targetUserId)
    .eq("exhibitor_company_id", companyId);
  if (membershipErr) return { ok: false, error: membershipErr.message ?? "Failed updating event access." };

  await reconcileCompanyAndEvents(supabase, companyId, assignedEventIds);
  revalidatePath(USERS_PATH);
  return { ok: true, message: "User updated." };
}

export async function resendCompanyScopedUserInviteFromAdminAction(formData: FormData): Promise<ActionState> {
  const authz = await requirePlatformAdmin();
  if (authz) return authz;

  const kind = String(formData.get("kind") ?? "").trim();
  const companyId = String(formData.get("companyId") ?? "").trim();
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const email = normalizeEmail(formData.get("email"));
  if (!companyId) return { ok: false, error: "Missing company." };

  const supabase = createAdminClient();

  if (kind === "pending") {
    if (!email) return { ok: false, error: "Missing pending invite email." };
    const result = await resendPendingAppInvite(supabase, companyId, email);
    if (result.ok) revalidatePath(USERS_PATH);
    return result;
  }

  if (!targetUserId) return { ok: false, error: "Missing user." };
  const { data: targetRow, error: targetErr } = await (supabase as any)
    .from("users")
    .select("id, company_id, email, full_name, role, event_access_mode")
    .eq("id", targetUserId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (targetErr || !targetRow) return { ok: false, error: targetErr?.message ?? "User not found in this company." };

  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(targetUserId);
  if (authErr || !authData?.user) return { ok: false, error: authErr?.message ?? "Auth user not found." };
  if (authData.user.last_sign_in_at) {
    return { ok: false, error: "User is already active. Ask them to sign in or reset their password instead." };
  }

  const targetEmail = normalizeEmail(authData.user.email ?? (targetRow as { email?: string | null }).email);
  if (!targetEmail) return { ok: false, error: "User has no email on file." };

  const eventAccessMode = normalizeEventAccessMode((targetRow as { event_access_mode?: string | null }).event_access_mode);
  const assignedEventIds =
    eventAccessMode === "all_company_events"
      ? []
      : await listUserCompanyMembershipEventIds(supabase, targetUserId, companyId, ["invited"]);
  if (eventAccessMode === "assigned_events_only" && assignedEventIds.length === 0) {
    return { ok: false, error: "No valid invite target was found for this user." };
  }

  const companyRole = normalizeExhibitorInviteRole((targetRow as { role?: string | null }).role) ?? "viewer";
  const fullName = String((targetRow as { full_name?: string | null }).full_name ?? "").trim();
  const result = await resendAuthInvite({
    supabase,
    userId: targetUserId,
    email: targetEmail,
    fullName,
    inviteMetadata: buildCompanyMemberInviteAuthData({
      companyId,
      dbRole: companyRole,
      eventAccessMode,
      assignedEventIds,
      fullName: fullName || null
    })
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(USERS_PATH);
  return { ok: true, message: `Invite resent to ${result.email}.` };
}

export async function deleteCompanyScopedUserFromAdminAction(formData: FormData): Promise<ActionState> {
  const authz = await requirePlatformAdmin();
  if (authz) return authz;

  const kind = String(formData.get("kind") ?? "").trim();
  const companyId = String(formData.get("companyId") ?? "").trim();
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const email = normalizeEmail(formData.get("email"));
  if (!companyId) return { ok: false, error: "Missing company." };

  const supabase = createAdminClient();

  if (kind === "pending") {
    if (!email) return { ok: false, error: "Missing pending invite email." };
    const { error } = await (supabase as any)
      .from("invite_codes")
      .delete()
      .eq("exhibitor_company_id", companyId)
      .eq("email", email)
      .is("used_at", null);
    if (error) return { ok: false, error: error.message ?? "Failed deleting pending invite." };
    revalidatePath(USERS_PATH);
    return { ok: true, message: "Pending invite removed." };
  }

  if (!targetUserId) return { ok: false, error: "Missing user." };
  const { data: targetRow, error: targetErr } = await (supabase as any)
    .from("users")
    .select("id, company_id, email")
    .eq("id", targetUserId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (targetErr || !targetRow) return { ok: false, error: targetErr?.message ?? "User not found in this company." };

  const targetEmail = normalizeEmail((targetRow as { email?: string | null }).email);
  const eventIds = await listUserCompanyMembershipEventIds(supabase, targetUserId, companyId);

  const { error: membershipErr } = await (supabase as any)
    .from("event_users")
    .delete()
    .eq("user_id", targetUserId)
    .eq("exhibitor_company_id", companyId);
  if (membershipErr) return { ok: false, error: membershipErr.message ?? "Failed removing event access." };

  if (targetEmail) {
    const { error: inviteErr } = await (supabase as any)
      .from("invite_codes")
      .delete()
      .eq("exhibitor_company_id", companyId)
      .eq("email", targetEmail)
      .is("used_at", null);
    if (inviteErr) return { ok: false, error: inviteErr.message ?? "Failed clearing pending invites." };
  }

  const { error: userErr } = await (supabase as any)
    .from("users")
    .delete()
    .eq("id", targetUserId)
    .eq("company_id", companyId);
  if (userErr) return { ok: false, error: userErr.message ?? "Failed deleting user." };

  const { error: authDeleteErr } = await supabase.auth.admin.deleteUser(targetUserId);
  const authMessage = String(authDeleteErr?.message ?? "");
  if (authDeleteErr && !/not found|user not found/i.test(authMessage)) {
    return { ok: false, error: authDeleteErr.message ?? "Failed deleting auth user." };
  }

  await reconcileCompanyAndEvents(supabase, companyId, eventIds);
  revalidatePath(USERS_PATH);
  return { ok: true, message: "User removed." };
}

export async function generateCompanyScopedUserLoginCodeFromAdminAction(
  formData: FormData
): Promise<EmergencyLoginCodeResult> {
  const authz = await requirePlatformAdmin();
  if (authz) return { ok: false, error: authz.ok ? "Forbidden." : authz.error };

  const kind = String(formData.get("kind") ?? "").trim();
  if (kind === "pending") {
    return { ok: false, error: "Create the login user before generating emergency login access." };
  }

  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const result = await generateEmergencyLoginCodeForUser({
    targetUserId,
    reason,
    method: "platform_admin_company_scoped_users"
  });
  if (result.ok) {
    revalidatePath(USERS_PATH);
  }
  return result;
}
