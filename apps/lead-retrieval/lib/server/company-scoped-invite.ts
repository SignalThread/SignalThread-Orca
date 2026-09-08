import type { Json } from "@/types/database";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { EventAccessMode } from "@/lib/access/event-access-mode";
import { buildCompanyMemberInviteAuthData } from "@/lib/exhibitor/company-admin-invite-metadata";
import type { CompanyMemberDbRole } from "@/lib/exhibitor/company-admin-invite-metadata";
import { publicUsersRoleForCompanyMember } from "@/lib/exhibitor/company-team-public-users-role";
import { isAuthUserAlreadyExistsError } from "@/lib/server/invites/invite-redeem-guards";
import { mergeInviteRedeemUserRole } from "@/lib/server/invites/invite-permissions-public-users-role";
import { persistUserInviteAccessConfig } from "@/lib/server/user-invite-access-assignment";
import { sendAuthInvite } from "@/lib/server/invites/send-auth-invite";

type AdminClient = ReturnType<typeof createAdminClient>;

export type CompanyScopedInviteActor = {
  userId: string;
  role: string;
  companyId?: string | null;
  accessibleEventIds?: string[] | null;
};

export type CreateCompanyScopedInviteInput = {
  supabase: AdminClient;
  actor: CompanyScopedInviteActor;
  targetEmail: string;
  fullName?: string | null;
  targetRole: CompanyMemberDbRole;
  exhibitorCompanyId?: string | null;
  eventAccessMode: EventAccessMode;
  selectedEventIds: string[];
  permissions: Json;
  redirectTo: string;
};

export type CreateCompanyScopedInviteResult =
  | {
      ok: true;
      userId: string;
      email: string;
      companyId: string;
      selectedEventIds: string[];
      assignedEventsCreated: number;
    }
  | { ok: false; error: string };

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function emailsMatch(a: unknown, b: unknown): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}

function normalizeRole(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueTrimmed(values: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function publicRoleForTarget(role: CompanyMemberDbRole): "exhibitor_admin" | "exhibitor_viewer" {
  return publicUsersRoleForCompanyMember(role);
}

function inviteRoleKind(role: CompanyMemberDbRole): "exhibitor_admin" | "exhibitor_viewer" {
  return role === "exhibitor_admin" ? "exhibitor_admin" : "exhibitor_viewer";
}

function isSupportedCompanyMemberRole(role: unknown): role is CompanyMemberDbRole {
  return role === "exhibitor_admin" || role === "viewer";
}

function resolveActorCompany(input: CreateCompanyScopedInviteInput): string | null {
  const actorRole = normalizeRole(input.actor.role);
  if (actorRole === "platform_admin") {
    return String(input.exhibitorCompanyId ?? "").trim() || null;
  }
  if (actorRole === "exhibitor_admin") {
    return String(input.actor.companyId ?? "").trim() || null;
  }
  return null;
}

function validateActorScope(input: CreateCompanyScopedInviteInput, companyId: string): string | null {
  const actorRole = normalizeRole(input.actor.role);
  if (actorRole === "platform_admin") return null;

  if (actorRole !== "exhibitor_admin") {
    return "Only platform admins and exhibitor admins can create company-scoped invites.";
  }

  const actorCompanyId = String(input.actor.companyId ?? "").trim();
  if (!actorCompanyId) return "Inviter is missing a company scope.";
  if (actorCompanyId !== companyId) return "Inviter cannot invite users outside their company.";

  const selectedEventIds = uniqueTrimmed(input.selectedEventIds);
  if (selectedEventIds.length > 0) {
    const accessible = Array.isArray(input.actor.accessibleEventIds)
      ? new Set(uniqueTrimmed(input.actor.accessibleEventIds))
      : null;
    if (!accessible) return "Inviter event scope could not be verified.";
    const outsideScope = selectedEventIds.filter((eventId) => !accessible.has(eventId));
    if (outsideScope.length > 0) return "One or more selected events are outside inviter scope.";
  }

  return null;
}

async function ensureAuthInviteUser(input: {
  supabase: AdminClient;
  email: string;
  redirectTo: string;
  metadata: Record<string, unknown>;
}): Promise<
  | {
      ok: true;
      userId: string;
      createdAuthUser: boolean;
      previousMetadata: Record<string, unknown> | null;
    }
  | { ok: false; error: string }
> {
  const inviteAttempt = await sendAuthInvite({
    supabase: input.supabase,
    email: input.email,
    redirectTo: input.redirectTo,
    userMetadata: input.metadata
  });

  if (inviteAttempt.ok) {
    return {
      ok: true,
      userId: inviteAttempt.userId,
      createdAuthUser: true,
      previousMetadata: null
    };
  }

  const inviteErrorMessage = inviteAttempt.error;
  if (!isAuthUserAlreadyExistsError(inviteErrorMessage)) {
    return { ok: false, error: inviteErrorMessage };
  }

  const existingAuthUser = await findAuthUserByEmail(input.supabase, input.email);
  if (!existingAuthUser?.id) {
    return { ok: false, error: inviteErrorMessage };
  }

  const { data: authData, error: authError } =
    await input.supabase.auth.admin.getUserById(existingAuthUser.id);
  if (authError || !authData.user?.id) {
    return { ok: false, error: authError?.message ?? "Failed loading existing auth user." };
  }

  const existingMetadata = (authData.user.user_metadata ?? {}) as Record<string, unknown>;
  const { data: updatedAuthData, error: updatedAuthError } =
    await input.supabase.auth.admin.updateUserById(existingAuthUser.id, {
      user_metadata: {
        ...existingMetadata,
        ...input.metadata
      }
    });
  if (updatedAuthError || !updatedAuthData.user?.id) {
    return { ok: false, error: updatedAuthError?.message ?? "Failed updating existing auth user." };
  }

  return {
    ok: true,
    userId: updatedAuthData.user.id,
    createdAuthUser: false,
    previousMetadata: existingMetadata
  };
}

async function findAuthUserByEmail(
  supabase: AdminClient,
  email: string
): Promise<{ id: string; email?: string } | null> {
  const want = normalizeEmail(email);
  let page = 1;
  const perPage = 1000;
  while (page <= 50) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message ?? "Failed loading auth users.");
    const users = data?.users ?? [];
    const match = users.find((user) => user.id && emailsMatch(user.email, want));
    if (match?.id) return { id: match.id, email: match.email };
    if (users.length < perPage) return null;
    page += 1;
  }
  return null;
}

async function rollbackCompanyScopedInvite(input: {
  supabase: AdminClient;
  userId: string;
  companyId: string;
  selectedEventIds: string[];
  createdAuthUser: boolean;
  previousMetadata: Record<string, unknown> | null;
  previousUser: Record<string, unknown> | null;
  previousMembershipRows: Array<{ event_id: string; status: string | null; permissions: unknown }>;
}) {
  const selectedEventIds = uniqueTrimmed(input.selectedEventIds);
  if (selectedEventIds.length > 0) {
    const previousByEventId = new Map(
      input.previousMembershipRows.map((row) => [String(row.event_id), row])
    );
    const newEventIds = selectedEventIds.filter((eventId) => !previousByEventId.has(eventId));
    if (newEventIds.length > 0) {
      await (input.supabase as any)
        .from("event_users")
        .delete()
        .eq("user_id", input.userId)
        .eq("exhibitor_company_id", input.companyId)
        .in("event_id", newEventIds);
    }
    for (const row of previousByEventId.values()) {
      await (input.supabase as any)
        .from("event_users")
        .update({
          status: row.status,
          permissions: row.permissions
        })
        .eq("user_id", input.userId)
        .eq("exhibitor_company_id", input.companyId)
        .eq("event_id", String(row.event_id));
    }
  }

  if (input.previousUser) {
    await (input.supabase as any)
      .from("users")
      .update({
        role: input.previousUser.role ?? null,
        company_id: input.previousUser.company_id ?? null,
        full_name: input.previousUser.full_name ?? null,
        email: input.previousUser.email ?? null,
        event_access_mode: input.previousUser.event_access_mode ?? null
      })
      .eq("id", input.userId);
  } else {
    await (input.supabase as any).from("users").delete().eq("id", input.userId);
  }

  if (input.createdAuthUser) {
    await input.supabase.auth.admin.deleteUser(input.userId);
  } else if (input.previousMetadata) {
    await input.supabase.auth.admin.updateUserById(input.userId, {
      user_metadata: input.previousMetadata
    });
  }
}

export async function createCompanyScopedInvite(
  input: CreateCompanyScopedInviteInput
): Promise<CreateCompanyScopedInviteResult> {
  const email = normalizeEmail(input.targetEmail);
  if (!email || !email.includes("@")) return { ok: false, error: "A valid email is required." };
  if (!isSupportedCompanyMemberRole(input.targetRole)) {
    return { ok: false, error: "Invalid company member role." };
  }

  const companyId = resolveActorCompany(input);
  if (!companyId) return { ok: false, error: "Missing exhibitor company scope." };

  const scopeError = validateActorScope(input, companyId);
  if (scopeError) return { ok: false, error: scopeError };

  const selectedEventIds = uniqueTrimmed(input.selectedEventIds);
  const fullName = String(input.fullName ?? "").trim();
  const roleKind = inviteRoleKind(input.targetRole);
  const usersTableRole = publicRoleForTarget(input.targetRole);
  const metadata = buildCompanyMemberInviteAuthData({
    companyId,
    dbRole: input.targetRole,
    eventAccessMode: input.eventAccessMode,
    assignedEventIds: selectedEventIds,
    fullName: fullName || null
  });

  const authUser = await ensureAuthInviteUser({
    supabase: input.supabase,
    email,
    redirectTo: input.redirectTo,
    metadata
  });
  if (!authUser.ok) return authUser;

  const userId = authUser.userId;
  const { data: existingUser, error: existingUserError } = await (input.supabase as any)
    .from("users")
    .select("id, role, company_id, full_name, email, event_access_mode")
    .eq("id", userId)
    .maybeSingle();
  if (existingUserError) {
    return { ok: false, error: existingUserError.message ?? "Failed loading user profile." };
  }

  if (existingUser) {
    const existingRole = normalizeRole((existingUser as { role?: string | null }).role);
    if (existingRole === "platform_admin" || existingRole === "organizer_admin" || existingRole === "event_organizer") {
      return { ok: false, error: "Cannot modify organizer or platform users from this invite flow." };
    }
    const existingCompanyId = String((existingUser as { company_id?: string | null }).company_id ?? "").trim();
    if (existingCompanyId && existingCompanyId !== companyId) {
      return { ok: false, error: "User belongs to another company." };
    }
    const effectiveRole = mergeInviteRedeemUserRole(existingRole || null, usersTableRole);
    const { error: updateError } = await (input.supabase as any)
      .from("users")
      .update({
        role: effectiveRole,
        company_id: companyId,
        full_name: fullName || null,
        email,
        event_access_mode: input.eventAccessMode
      })
      .eq("id", userId);
    if (updateError) {
      return { ok: false, error: updateError.message ?? "Failed updating user profile." };
    }
  } else {
    const { error: insertError } = await (input.supabase as any).from("users").insert({
      id: userId,
      role: usersTableRole,
      company_id: companyId,
      full_name: fullName || null,
      email,
      event_access_mode: input.eventAccessMode,
      created_at: new Date().toISOString()
    });
    if (insertError) {
      return { ok: false, error: insertError.message ?? "Failed creating user profile." };
    }
  }

  const { data: previousMembershipRows, error: previousMembershipError } = selectedEventIds.length > 0
    ? await (input.supabase as any)
        .from("event_users")
        .select("event_id, status, permissions")
        .eq("user_id", userId)
        .eq("exhibitor_company_id", companyId)
        .in("event_id", selectedEventIds)
    : { data: [], error: null };
  if (previousMembershipError) {
    await rollbackCompanyScopedInvite({
      supabase: input.supabase,
      userId,
      companyId,
      selectedEventIds: [],
      createdAuthUser: authUser.createdAuthUser,
      previousMetadata: authUser.previousMetadata,
      previousUser: (existingUser as Record<string, unknown> | null) ?? null,
      previousMembershipRows: []
    });
    return {
      ok: false,
      error: previousMembershipError.message ?? "Failed snapshotting event memberships."
    };
  }

  const persist = await persistUserInviteAccessConfig({
    supabase: input.supabase,
    userId,
    companyId,
    rawConfig: {
      role: roleKind,
      eventAccessMode: input.eventAccessMode,
      assignedEventIds: selectedEventIds
    },
    assignedEventPermissions: input.permissions,
    assignedEventStatus: "invited"
  });
  if (!persist.ok) {
    await rollbackCompanyScopedInvite({
      supabase: input.supabase,
      userId,
      companyId,
      selectedEventIds,
      createdAuthUser: authUser.createdAuthUser,
      previousMetadata: authUser.previousMetadata,
      previousUser: (existingUser as Record<string, unknown> | null) ?? null,
      previousMembershipRows: (previousMembershipRows ?? []) as Array<{
        event_id: string;
        status: string | null;
        permissions: unknown;
      }>
    });
    return { ok: false, error: persist.error };
  }

  return {
    ok: true,
    userId,
    email,
    companyId,
    selectedEventIds,
    assignedEventsCreated: persist.assignedEventsCreated
  };
}
