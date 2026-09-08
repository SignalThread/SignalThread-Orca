import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentSessionUser,
  isCompanyAccountAdminSession
} from "@/lib/auth/session";
import type { EventAccessMode } from "@/lib/access/event-access-mode";
import { normalizeEventAccessMode } from "@/lib/access/event-access-mode";
import type { CompanyMemberDbRole } from "@/lib/exhibitor/company-admin-invite-metadata";
import { buildCompanyMemberInviteAuthData } from "@/lib/exhibitor/company-admin-invite-metadata";
import { buildCompanyTeamEventAccessSummary } from "@/lib/exhibitor/company-team-access-present";
import { deriveCompanyTeamMemberStatus } from "@/lib/exhibitor/company-team-member-status";
import type { CompanyTeamActionState, CompanyTeamMemberRow } from "@/lib/exhibitor/company-team-types";
import { mergePendingInvitesIntoTeamRows } from "@/lib/exhibitor/company-team-pending-invites";
import { publicUsersRoleForCompanyMember } from "@/lib/exhibitor/company-team-public-users-role";
import { normalizeExhibitorInviteRole } from "@/lib/exhibitor/exhibitor-invite-role";
import { persistUserInviteAccessConfig } from "@/lib/server/user-invite-access-assignment";
import { reconcileCompanyLicenseSeatsUsed, reconcileLicenseSeatsUsed } from "@/lib/server/event-user-access";
import { verifyCompanyTeamUserFullyDeleted } from "@/lib/exhibitor/company-team-delete-verify";
import {
  createCompanyAppUserInviteCodes,
  loadCompanyAssociatedEvents
} from "@/lib/server/invites/create-company-app-user-invite";
import { isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess } from "@/lib/licenses/exhibitor-company-license-admin-eligibility";
import type { Json } from "@/types/database";
import { selectLatestCompanyScopedLicense } from "@/lib/server/company-scoped-license-select";
import { loadActiveEntitledMembershipEventIdsForExhibitorUser } from "@/lib/server/company-event-access";
import { resendAuthInvite } from "@/lib/server/invites/resend-auth-invite";
import { createCompanyScopedInvite } from "@/lib/server/company-scoped-invite";
import { resolveAccessibleEventIdsForUser } from "@/lib/server/company-event-access";

const INVITE_REDIRECT_TO =
  process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ?? "https://lr.signalthread.ai/auth/callback";

export type { CompanyTeamMemberRow, CompanyTeamMemberStatus } from "@/lib/exhibitor/company-team-types";

function normalizeCompanyRole(role: string | null | undefined): CompanyMemberDbRole {
  return String(role ?? "").trim().toLowerCase() === "exhibitor_admin" ? "exhibitor_admin" : "viewer";
}

function toInviteRoleKind(dbRole: CompanyMemberDbRole): "exhibitor_admin" | "exhibitor_viewer" {
  return dbRole === "exhibitor_admin" ? "exhibitor_admin" : "exhibitor_viewer";
}

function permissionsForCompanyRole(dbRole: CompanyMemberDbRole): Json {
  return dbRole === "exhibitor_admin" ? { admin: true, app: true } : { admin: false, app: true };
}

async function loadCompanyLicenseEligible(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string,
  nowMs: number
): Promise<boolean> {
  const { data: lic, error } = await selectLatestCompanyScopedLicense(
    supabase,
    companyId,
    "scope, status, expires_at, starts_at"
  );
  if (error) {
    throw new Error(error.message ?? "Failed loading company license.");
  }
  return isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(
    lic as {
      scope: string | null;
      status: string | null;
      expires_at: string | null;
      starts_at: string | null;
    } | null,
    nowMs
  );
}

function parseAssignedIdsFromForm(raw: string | null | undefined): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  try {
    const p = JSON.parse(s);
    if (!Array.isArray(p)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of p) {
      const id = String(v ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  } catch {
    return [];
  }
}

export async function getCompanyTeamTableRows(companyId: string): Promise<CompanyTeamMemberRow[]> {
  const supabase = createAdminClient();
  const [
    { data: userRows, error: usersError },
    companyEvents,
    { data: pendingInviteRows, error: pendingInviteError }
  ] = await Promise.all([
    (supabase as any)
      .from("users")
      .select("id, full_name, email, role, event_access_mode, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
    loadCompanyAssociatedEvents(supabase, companyId),
    (supabase as any)
      .from("invite_codes")
      .select("event_id, email, expires_at")
      .eq("exhibitor_company_id", companyId)
      .is("used_at", null)
  ]);

  if (usersError) {
    throw new Error(usersError.message ?? "Failed loading company users.");
  }
  if (pendingInviteError) {
    throw new Error(pendingInviteError.message ?? "Failed loading pending invites.");
  }

  const users = (userRows ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    event_access_mode: string | null;
  }>;

  const eventNameById = new Map(companyEvents.map((e) => [e.id, e.name] as const));
  const companyOwnedEventCount = companyEvents.length;

  const userIds = users.map((u) => u.id);
  let membershipByUser = new Map<string, { id: string; name: string }[]>();

  if (userIds.length > 0) {
    const { data: memRows, error: memErr } = await (supabase as any)
      .from("event_users")
      .select("user_id, event_id, status")
      .eq("exhibitor_company_id", companyId)
      .in("user_id", userIds)
      .in("status", ["active", "invited"]);

    if (memErr) {
      throw new Error(memErr.message ?? "Failed loading event memberships.");
    }

    membershipByUser = new Map();
    for (const row of (memRows ?? []) as Array<{ user_id: string; event_id: string }>) {
      const uid = String(row.user_id);
      const eid = String(row.event_id);
      const name = eventNameById.get(eid) ?? "Event";
      const list = membershipByUser.get(uid) ?? [];
      if (!list.some((x) => x.id === eid)) {
        list.push({ id: eid, name });
      }
      membershipByUser.set(uid, list);
    }
  }

  const activeRows: CompanyTeamMemberRow[] = await Promise.all(
    users.map(async (u) => {
      const mode = normalizeEventAccessMode(u.event_access_mode);
      const assigned = (membershipByUser.get(u.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
      const eventSummary = buildCompanyTeamEventAccessSummary({
        eventAccessMode: mode,
        companyOwnedEventCount,
        assignedEvents: assigned
      });

      const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(u.id);
      const authUser = authErr ? null : authData?.user;
      const bannedUntil = authUser?.banned_until ?? null;
      const lastSignInAt = authUser?.last_sign_in_at ?? null;
      const createdAtAuth = authUser?.created_at ?? null;

      const status = deriveCompanyTeamMemberStatus({
        bannedUntil,
        lastSignInAt,
        createdAtAuth
      });

      return {
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        companyRole: normalizeCompanyRole(u.role),
        eventAccessMode: mode,
        status,
        lastSignInAt,
        eventSummary,
        assignedEventDetails: assigned
      };
    })
  );

  return mergePendingInvitesIntoTeamRows({
    activeRows,
    pendingInvites: (pendingInviteRows ?? []) as Array<{
      event_id: string;
      email: string;
      expires_at: string;
    }>,
    companyEvents
  });
}

export async function getCompanySettingsTeamPageData(
  companyId: string,
  opts?: {
    settingsViewerUserId?: string;
    settingsViewerEventAccessMode?: EventAccessMode | null;
  }
): Promise<{
  licenseEligible: boolean;
  members: CompanyTeamMemberRow[];
  companyEvents: { id: string; name: string }[];
}> {
  const supabase = createAdminClient();
  const nowMs = Date.now();
  const licenseEligible = await loadCompanyLicenseEligible(supabase, companyId, nowMs);

  const companyEventsPromise = (async (): Promise<{ id: string; name: string }[]> => {
    if (
      opts?.settingsViewerEventAccessMode === "assigned_events_only" &&
      opts.settingsViewerUserId
    ) {
      const ids = await loadActiveEntitledMembershipEventIdsForExhibitorUser(
        opts.settingsViewerUserId,
        companyId
      );
      if (ids.length === 0) return [];
      const { data: rows, error } = await (supabase as any)
        .from("events")
        .select("id, name")
        .in("id", ids)
        .order("name", { ascending: true });
      if (error) {
        throw new Error(error.message ?? "Failed loading assigned events.");
      }
      return ((rows ?? []) as { id: string; name: string }[]).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? "Event")
      }));
    }

    return loadCompanyAssociatedEvents(supabase, companyId);
  })();

  const [companyEvents, members] = await Promise.all([companyEventsPromise, getCompanyTeamTableRows(companyId)]);

  return {
    licenseEligible,
    members,
    companyEvents
  };
}

async function getActorExhibitorAdminCompanyId(): Promise<
  { ok: true; userId: string; companyId: string } | { ok: false; error: string }
> {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return { ok: false, error: "Unauthorized." };
  }
  if (!isCompanyAccountAdminSession(sessionUser)) {
    return { ok: false, error: "Only company admins can manage the company team." };
  }
  const companyId = String(sessionUser.company_id ?? "").trim();
  if (!companyId) {
    return { ok: false, error: "Your account is missing a company scope." };
  }
  return { ok: true, userId: sessionUser.id, companyId };
}

async function countOtherCompanyAdmins(supabase: ReturnType<typeof createAdminClient>, companyId: string, excludeUserId: string) {
  const { count, error } = await (supabase as any)
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("role", "exhibitor_admin")
    .neq("id", excludeUserId);

  if (error) {
    throw new Error(error.message ?? "Failed counting admins.");
  }
  return Number(count ?? 0);
}

async function deleteAllCompanyScopedMemberships(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  companyId: string
) {
  const { error } = await (supabase as any)
    .from("event_users")
    .delete()
    .eq("user_id", userId)
    .eq("exhibitor_company_id", companyId);
  if (error) {
    throw new Error(error.message ?? "Failed clearing event memberships.");
  }
}

async function listEventUserSlicesForUser(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<Array<{ event_id: string; exhibitor_company_id: string }>> {
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("event_id, exhibitor_company_id")
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message ?? "Failed listing event memberships.");
  }
  const seen = new Set<string>();
  const out: Array<{ event_id: string; exhibitor_company_id: string }> = [];
  for (const row of (data ?? []) as Array<{ event_id: string; exhibitor_company_id: string | null }>) {
    const eid = String(row.event_id ?? "").trim();
    const cid = String(row.exhibitor_company_id ?? "").trim();
    if (!eid || !cid) continue;
    const key = `${eid}:${cid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ event_id: eid, exhibitor_company_id: cid });
  }
  return out;
}

async function deleteAllEventUsersForUser(supabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { error } = await (supabase as any).from("event_users").delete().eq("user_id", userId);
  if (error) {
    throw new Error(error.message ?? "Failed removing event memberships.");
  }
}

async function deletePendingInviteCodesForCompanyEmail(
  supabase: ReturnType<typeof createAdminClient>,
  exhibitorCompanyId: string,
  email: string | null | undefined
) {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return;
  const { error } = await (supabase as any)
    .from("invite_codes")
    .delete()
    .eq("exhibitor_company_id", exhibitorCompanyId)
    .eq("email", e)
    .is("used_at", null);
  if (error) {
    throw new Error(error.message ?? "Failed removing pending invite codes.");
  }
}

export async function inviteCompanyMemberAction(_prev: CompanyTeamActionState | null, formData: FormData): Promise<CompanyTeamActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const companyRole = normalizeExhibitorInviteRole(formData.get("companyRole") ?? "exhibitor_admin");
  const modeRaw = String(formData.get("eventAccessMode") ?? "all_company_events").trim().toLowerCase();
  const eventAccessMode =
    modeRaw === "assigned_events_only" ? ("assigned_events_only" as const) : ("all_company_events" as const);
  const assignedEventIdsRaw = parseAssignedIdsFromForm(String(formData.get("assignedEventIdsJson") ?? ""));
  const assignedEventIds = eventAccessMode === "all_company_events" ? [] : assignedEventIdsRaw;

  if (!email) {
    return { ok: false, error: "Email is required." };
  }

  if (!companyRole) {
    return { ok: false, error: "Invalid or unsupported role for this invite." };
  }

  const actor = await getActorExhibitorAdminCompanyId();
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }
  const { companyId } = actor;

  const supabase = createAdminClient();
  const nowMs = Date.now();
  let licenseEligible = false;
  try {
    licenseEligible = await loadCompanyLicenseEligible(supabase, companyId, nowMs);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "License check failed." };
  }

  if (eventAccessMode === "all_company_events" && !licenseEligible) {
    return {
      ok: false,
      error: "All company events requires an active company-scoped license. Use “Specific events only” or contact support."
    };
  }

  if (eventAccessMode === "assigned_events_only") {
    if (assignedEventIds.length === 0) {
      return { ok: false, error: "Select at least one event for “Specific events only.”" };
    }

    let evs: Array<{ id: string; name: string }>;
    try {
      evs = await loadCompanyAssociatedEvents(supabase, companyId, assignedEventIds);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed loading events." };
    }
    const n = evs.length;
    if (n === 0) {
      return {
        ok: false,
        error: "Create a company event before inviting with “Specific events only.”"
      };
    }
    const associatedIds = new Set(evs.map((event) => event.id));
    if (assignedEventIds.some((eventId) => !associatedIds.has(eventId))) {
      return { ok: false, error: "One or more selected events are not associated with your company." };
    }
  }

  if (companyRole === "viewer") {
    return createCompanyAppUserInviteCodes({
      supabase,
      companyId,
      email,
      eventAccessMode,
      assignedEventIds
    });
  }

  const access = await resolveAccessibleEventIdsForUser({ userId: actor.userId });
  const invite = await createCompanyScopedInvite({
    supabase,
    actor: {
      userId: actor.userId,
      role: "exhibitor_admin",
      companyId,
      accessibleEventIds: access.eventIds
    },
    targetEmail: email,
    fullName,
    targetRole: companyRole,
    eventAccessMode,
    selectedEventIds: assignedEventIds,
    permissions: permissionsForCompanyRole(companyRole),
    redirectTo: INVITE_REDIRECT_TO
  });
  if (!invite.ok) {
    return { ok: false, error: invite.error };
  }

  return { ok: true, message: `Invite sent to ${invite.email}.` };
}

export async function updateCompanyMemberAccessAction(
  _prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const companyRole = normalizeExhibitorInviteRole(formData.get("companyRole") ?? "exhibitor_admin");
  const modeRaw = String(formData.get("eventAccessMode") ?? "").trim().toLowerCase();
  const eventAccessMode =
    modeRaw === "assigned_events_only" ? ("assigned_events_only" as const) : ("all_company_events" as const);
  const assignedEventIdsRaw = parseAssignedIdsFromForm(String(formData.get("assignedEventIdsJson") ?? ""));
  const assignedEventIds = eventAccessMode === "all_company_events" ? [] : assignedEventIdsRaw;

  if (!targetUserId) {
    return { ok: false, error: "Missing user." };
  }

  if (!companyRole) {
    return { ok: false, error: "Invalid or unsupported role." };
  }

  const actor = await getActorExhibitorAdminCompanyId();
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }
  const { companyId, userId: actorUserId } = actor;

  const supabase = createAdminClient();
  const nowMs = Date.now();
  let licenseEligible = false;
  try {
    licenseEligible = await loadCompanyLicenseEligible(supabase, companyId, nowMs);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "License check failed." };
  }

  if (eventAccessMode === "all_company_events" && !licenseEligible) {
    return {
      ok: false,
      error: "All company events requires an active company-scoped license. Use “Specific events only” instead."
    };
  }

  if (targetUserId === actorUserId && companyRole === "viewer") {
    const others = await countOtherCompanyAdmins(supabase, companyId, actorUserId);
    if (others < 1) {
      return {
        ok: false,
        error: "You are the only company admin. Promote another admin before removing your admin role."
      };
    }
  }

  const { data: targetRow, error: targetErr } = await (supabase as any)
    .from("users")
    .select("id, company_id, role")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetErr || !targetRow) {
    return { ok: false, error: targetErr?.message ?? "User not found." };
  }
  if (String((targetRow as { company_id: string | null }).company_id) !== companyId) {
    return { ok: false, error: "User is not in your company." };
  }

  if (eventAccessMode === "assigned_events_only") {
    if (assignedEventIds.length === 0) {
      return { ok: false, error: "Select at least one event for “Specific events only.”" };
    }

    let evs: Array<{ id: string; name: string }>;
    try {
      evs = await loadCompanyAssociatedEvents(supabase, companyId, assignedEventIds);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed loading events." };
    }
    if (evs.length === 0 && assignedEventIds.length > 0) {
      return { ok: false, error: "No company events exist for assignments." };
    }
    const associatedIds = new Set(evs.map((event) => event.id));
    if (assignedEventIds.some((eventId) => !associatedIds.has(eventId))) {
      return { ok: false, error: "One or more selected events are not associated with your company." };
    }
  }

  const { data: authData } = await supabase.auth.admin.getUserById(targetUserId);
  const lastSignInAt = authData?.user?.last_sign_in_at ?? null;
  const membershipStatus: "invited" | "active" = lastSignInAt ? "active" : "invited";

  const usersTableRole = publicUsersRoleForCompanyMember(companyRole);

  const { error: roleErr } = await (supabase as any)
    .from("users")
    .update({
      role: usersTableRole,
      event_access_mode: eventAccessMode
    })
    .eq("id", targetUserId);

  if (roleErr) {
    return { ok: false, error: roleErr.message ?? "Failed updating user." };
  }

  if (licenseEligible || eventAccessMode === "assigned_events_only") {
    await deleteAllCompanyScopedMemberships(supabase, targetUserId, companyId);
  }

  const persist = await persistUserInviteAccessConfig({
    supabase,
    userId: targetUserId,
    companyId,
    rawConfig: {
      role: toInviteRoleKind(companyRole),
      eventAccessMode,
      assignedEventIds
    },
    assignedEventPermissions: permissionsForCompanyRole(companyRole),
    assignedEventStatus: membershipStatus
  });

  if (!persist.ok) {
    return { ok: false, error: persist.error };
  }

  return { ok: true, message: "Access updated." };
}

export async function resendCompanyMemberInviteAction(
  _prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  if (!targetUserId) {
    return { ok: false, error: "Missing user." };
  }

  const actor = await getActorExhibitorAdminCompanyId();
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }
  const { companyId } = actor;

  const supabase = createAdminClient();

  const { data: targetRow, error: targetErr } = await (supabase as any)
    .from("users")
    .select("id, company_id, email, full_name, role, event_access_mode")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetErr || !targetRow) {
    return { ok: false, error: targetErr?.message ?? "User not found." };
  }
  if (String((targetRow as { company_id: string | null }).company_id) !== companyId) {
    return { ok: false, error: "User is not in your company." };
  }

  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(targetUserId);
  if (authErr || !authData?.user) {
    return { ok: false, error: authErr?.message ?? "Auth user not found." };
  }
  if (authData.user.last_sign_in_at) {
    return { ok: false, error: "User is already active. Ask them to sign in or reset their password instead." };
  }

  const email = String(authData.user.email ?? (targetRow as { email: string | null }).email ?? "")
    .trim()
    .toLowerCase();
  if (!email) {
    return { ok: false, error: "User has no email on file." };
  }

  const companyRole = normalizeCompanyRole((targetRow as { role: string | null }).role);
  const eventAccessMode = normalizeEventAccessMode(
    (targetRow as { event_access_mode: string | null }).event_access_mode
  );

  let licenseEligible = false;
  try {
    licenseEligible = await loadCompanyLicenseEligible(supabase, companyId, Date.now());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "License check failed." };
  }
  if (eventAccessMode === "all_company_events" && !licenseEligible) {
    return {
      ok: false,
      error: "Missing active company-scoped license for this invite."
    };
  }

  const { data: membershipRows, error: membershipErr } = await (supabase as any)
    .from("event_users")
    .select("event_id, status")
    .eq("user_id", targetUserId)
    .eq("exhibitor_company_id", companyId)
    .in("status", ["invited"]);
  if (membershipErr) {
    return { ok: false, error: membershipErr.message ?? "Failed loading event access." };
  }

  const assignedEventIds = Array.from(
    new Set(
      ((membershipRows ?? []) as Array<{ event_id: string | null }>)
        .map((row) => String(row.event_id ?? "").trim())
        .filter(Boolean)
    )
  );
  if (eventAccessMode === "assigned_events_only" && assignedEventIds.length === 0) {
    return { ok: false, error: "No valid invite target was found for this user." };
  }

  const fullName = String((targetRow as { full_name: string | null }).full_name ?? "").trim();
  const result = await resendAuthInvite({
    supabase,
    userId: targetUserId,
    email,
    fullName,
    inviteMetadata: buildCompanyMemberInviteAuthData({
      companyId,
      dbRole: companyRole,
      eventAccessMode,
      assignedEventIds,
      fullName: fullName || null
    })
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true, message: `Invite resent to ${email}.` };
}

export async function revokeCompanyMemberInviteAction(
  _prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  if (!targetUserId) {
    return { ok: false, error: "Missing user." };
  }

  const actor = await getActorExhibitorAdminCompanyId();
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }
  const { companyId } = actor;

  const supabase = createAdminClient();

  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(targetUserId);
  if (authErr || !authData?.user) {
    return { ok: false, error: authErr?.message ?? "Auth user not found." };
  }
  if (authData.user.last_sign_in_at) {
    return { ok: false, error: "Revoke invite only applies to users who have not signed in yet." };
  }

  const { data: targetRow, error: targetErr } = await (supabase as any)
    .from("users")
    .select("id, company_id, email")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetErr || !targetRow || String((targetRow as { company_id: string | null }).company_id) !== companyId) {
    return { ok: false, error: "User is not in your company." };
  }

  const targetEmail = (targetRow as { email: string | null }).email;
  try {
    await deletePendingInviteCodesForCompanyEmail(supabase, companyId, targetEmail);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed clearing invite codes." };
  }

  await deleteAllCompanyScopedMemberships(supabase, targetUserId, companyId);
  const { error: delUserErr } = await (supabase as any).from("users").delete().eq("id", targetUserId);
  if (delUserErr) {
    return { ok: false, error: delUserErr.message ?? "Failed removing user profile." };
  }
  const { error: delAuthErr } = await supabase.auth.admin.deleteUser(targetUserId);
  if (delAuthErr) {
    return { ok: false, error: delAuthErr.message ?? "Failed revoking invite." };
  }

  return { ok: true, message: "Invite revoked." };
}

export async function deleteCompanyTeamUserAction(
  _prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  if (!targetUserId) {
    return { ok: false, error: "Missing user." };
  }

  const actor = await getActorExhibitorAdminCompanyId();
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }
  const { companyId, userId: actorUserId } = actor;

  const supabase = createAdminClient();

  if (targetUserId === actorUserId) {
    return { ok: false, error: "You cannot delete your own account." };
  }

  const { data: targetRow, error: targetErr } = await (supabase as any)
    .from("users")
    .select("id, company_id, role, email")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetErr || !targetRow || String((targetRow as { company_id: string | null }).company_id) !== companyId) {
    return { ok: false, error: "User is not in your company." };
  }

  const targetRole = String((targetRow as { role: string | null }).role ?? "").trim().toLowerCase();
  if (targetRole === "exhibitor_admin") {
    const others = await countOtherCompanyAdmins(supabase, companyId, targetUserId);
    if (others < 1) {
      return {
        ok: false,
        error: "Cannot delete the last company admin. Promote another admin first."
      };
    }
  }

  const targetEmail = (targetRow as { email: string | null }).email;

  let slices: Array<{ event_id: string; exhibitor_company_id: string }> = [];
  try {
    slices = await listEventUserSlicesForUser(supabase, targetUserId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed preparing user deletion." };
  }

  try {
    await deleteAllEventUsersForUser(supabase, targetUserId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed removing event access." };
  }

  try {
    await deletePendingInviteCodesForCompanyEmail(supabase, companyId, targetEmail);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed clearing pending invites." };
  }

  const { error: delUserErr } = await (supabase as any)
    .from("users")
    .delete()
    .eq("id", targetUserId)
    .eq("company_id", companyId);

  if (delUserErr) {
    return { ok: false, error: delUserErr.message ?? "Failed deleting user profile." };
  }

  for (const slice of slices) {
    try {
      await reconcileLicenseSeatsUsed({
        eventId: slice.event_id,
        exhibitorCompanyId: slice.exhibitor_company_id
      });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed reconciling license seats." };
    }
  }

  try {
    await reconcileCompanyLicenseSeatsUsed({ exhibitorCompanyId: companyId });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed reconciling company license seats." };
  }

  const { error: delAuthErr } = await supabase.auth.admin.deleteUser(targetUserId);
  if (delAuthErr) {
    return { ok: false, error: delAuthErr.message ?? "Failed deleting auth user." };
  }

  const verified = await verifyCompanyTeamUserFullyDeleted({
    supabase,
    userId: targetUserId,
    exhibitorCompanyId: companyId,
    userEmail: targetEmail
  });
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

  return { ok: true, message: "User deleted." };
}

/**
 * Resends a pending App-user (mobile) invite by re-running the canonical orchestrator.
 *
 * Accepts an `email` (pending invites have no `users.id`). Derives the original scope
 * from the still-pending `invite_codes` rows: if they cover every company event, the
 * resend uses `all_company_events`; otherwise it uses `assigned_events_only` with the
 * same event ids. The orchestrator clears pending rows for this (company, email, events)
 * before inserting new ones, so resends do not create duplicate pending codes.
 *
 * Never touches `used_at IS NOT NULL` rows — redeemed history is preserved.
 * Never calls `supabase.auth.admin.inviteUserByEmail`.
 */
export async function resendCompanyAppUserInviteAction(
  _prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "Email is required." };
  }

  const actor = await getActorExhibitorAdminCompanyId();
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }
  const { companyId } = actor;

  const supabase = createAdminClient();

  const { data: pendingRows, error: pendingErr } = await (supabase as any)
    .from("invite_codes")
    .select("event_id")
    .eq("exhibitor_company_id", companyId)
    .eq("email", email)
    .is("used_at", null);

  if (pendingErr) {
    return { ok: false, error: pendingErr.message ?? "Failed loading pending invites." };
  }

  const pendingEventIds = Array.from(
    new Set(
      ((pendingRows ?? []) as Array<{ event_id: string }>)
        .map((r) => String(r.event_id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (pendingEventIds.length === 0) {
    return { ok: false, error: "No pending invite to resend." };
  }

  let companyEvents: Array<{ id: string; name: string }>;
  try {
    companyEvents = await loadCompanyAssociatedEvents(supabase, companyId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed loading company events." };
  }
  const companyEventIds = companyEvents.map((event) => event.id);
  const companyEventSet = new Set(companyEventIds);
  const scopedIds = pendingEventIds.filter((id) => companyEventSet.has(id));
  if (scopedIds.length === 0) {
    return { ok: false, error: "Pending invite events are no longer in this company." };
  }

  const coversAll =
    companyEventIds.length > 0 && scopedIds.length === companyEventIds.length;
  const eventAccessMode: EventAccessMode = coversAll
    ? "all_company_events"
    : "assigned_events_only";
  const assignedEventIds = coversAll ? [] : scopedIds;

  return createCompanyAppUserInviteCodes({
    supabase,
    companyId,
    email,
    eventAccessMode,
    assignedEventIds
  });
}

/**
 * Cancels a pending App-user invite by deleting only **unused** `invite_codes` rows
 * for (company, email). Redeemed rows (`used_at IS NOT NULL`) are preserved for audit.
 */
export async function cancelCompanyAppUserInviteAction(
  _prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "Email is required." };
  }

  const actor = await getActorExhibitorAdminCompanyId();
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }
  const { companyId } = actor;

  const supabase = createAdminClient();

  try {
    await deletePendingInviteCodesForCompanyEmail(supabase, companyId, email);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed canceling invite."
    };
  }

  return { ok: true, message: `Invite canceled for ${email}.` };
}

export async function setCompanyMemberDisabledAction(
  _prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const disable = String(formData.get("disable") ?? "true").trim().toLowerCase() !== "false";

  if (!targetUserId) {
    return { ok: false, error: "Missing user." };
  }

  const actor = await getActorExhibitorAdminCompanyId();
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }
  const { companyId, userId: actorUserId } = actor;

  const supabase = createAdminClient();

  if (targetUserId === actorUserId && disable) {
    const others = await countOtherCompanyAdmins(supabase, companyId, actorUserId);
    if (others < 1) {
      return {
        ok: false,
        error: "You are the only company admin. Promote another admin before disabling your account."
      };
    }
  }

  const { data: targetRow, error: targetErr } = await (supabase as any)
    .from("users")
    .select("id, company_id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetErr || !targetRow || String((targetRow as { company_id: string | null }).company_id) !== companyId) {
    return { ok: false, error: "User is not in your company." };
  }

  const { error: banErr } = await supabase.auth.admin.updateUserById(targetUserId, {
    ban_duration: disable ? "876000h" : "none"
  });

  if (banErr) {
    return { ok: false, error: banErr.message ?? "Failed updating user access." };
  }

  return { ok: true, message: disable ? "User disabled." : "User re-enabled." };
}
