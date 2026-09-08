import type { CompanyTeamActionState, CompanyTeamAppInviteCode } from "@/lib/exhibitor/company-team-types";

export type AppUserInviteEventOption = { id: string; name: string | null };

export type CreateInviteCodeFn = (input: {
  eventId: string;
  exhibitorCompanyId: string;
  email: string;
  permissions: { admin: boolean; app: boolean };
  eventAccessMode: "all_company_events" | "assigned_events_only";
}) => Promise<{ code: string; invite: { id: string } }>;

export type SendAppUserInviteEmailFn = (input: {
  to: string;
  items: ReadonlyArray<{ eventName: string; code: string }>;
}) => Promise<void>;

export type AppUserInviteSupabaseLike = {
  from: (table: string) => {
    select: (columns: string, opts?: Record<string, unknown>) => any;
    delete: () => any;
  };
};

export type AppUserInviteOrchestrateDeps = {
  supabase: AppUserInviteSupabaseLike;
  loadCompanyEvents: (input: {
    companyId: string;
    eventAccessMode: "all_company_events" | "assigned_events_only";
    assignedEventIds: string[];
  }) => Promise<{ ok: true; events: AppUserInviteEventOption[] } | { ok: false; error: string }>;
  clearPendingInvitesForEvents: (input: {
    companyId: string;
    email: string;
    eventIds: string[];
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  deleteInviteCodesByIds: (ids: string[]) => Promise<void>;
  createInviteCode: CreateInviteCodeFn;
  sendAppUserInviteEmail?: SendAppUserInviteEmailFn | null;
  isEmailConfigured: () => boolean;
};

export type AppUserInviteOrchestrateInput = {
  companyId: string;
  email: string;
  eventAccessMode: "all_company_events" | "assigned_events_only";
  assignedEventIds: string[];
};

/**
 * Single-call contract: NEVER invokes Supabase `auth.admin.inviteUserByEmail` / web-auth email.
 *
 * - Clears pending `invite_codes` for the same company/email/event set (idempotent re-submit).
 * - Creates **one** `invite_codes` row per target event via injected `createInviteCode`.
 * - Sends **one** email with all codes if email is configured; otherwise returns codes for UI display.
 * - On a create failure, rolls back newly created invite rows.
 * - Email delivery is best-effort: a transport failure never invalidates codes that were created successfully.
 */
export async function orchestrateCompanyAppUserInvite(
  deps: AppUserInviteOrchestrateDeps,
  input: AppUserInviteOrchestrateInput
): Promise<CompanyTeamActionState> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const companyId = String(input.companyId ?? "").trim();
  if (!companyId || !email) {
    return { ok: false, error: "Missing company or email." };
  }

  const eventsResult = await deps.loadCompanyEvents({
    companyId,
    eventAccessMode: input.eventAccessMode,
    assignedEventIds: input.assignedEventIds
  });
  if (!eventsResult.ok) {
    return { ok: false, error: eventsResult.error };
  }
  const events = eventsResult.events;
  if (events.length === 0) {
    return {
      ok: false,
      error: "Create at least one company event before inviting app users."
    };
  }

  const targetEventIds = events.map((e) => String(e.id));
  const clearResult = await deps.clearPendingInvitesForEvents({
    companyId,
    email,
    eventIds: targetEventIds
  });
  if (!clearResult.ok) {
    return { ok: false, error: clearResult.error };
  }

  const createdIds: string[] = [];
  const appInviteCodes: CompanyTeamAppInviteCode[] = [];

  try {
    for (const ev of events) {
      const eventId = String(ev.id);
      const { code, invite } = await deps.createInviteCode({
        eventId,
        exhibitorCompanyId: companyId,
        email,
        permissions: { admin: false, app: true },
        eventAccessMode: input.eventAccessMode
      });
      createdIds.push(String(invite.id));
      appInviteCodes.push({
        eventId,
        eventName: String(ev.name ?? "Event"),
        code
      });
    }
  } catch (e) {
    if (createdIds.length > 0) {
      try {
        await deps.deleteInviteCodesByIds(createdIds);
      } catch (cleanupError) {
        const createMessage = e instanceof Error ? e.message : "Failed creating app invite codes.";
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : "Invite cleanup failed.";
        return { ok: false, error: `${createMessage} Cleanup also failed: ${cleanupMessage}` };
      }
    }
    return { ok: false, error: e instanceof Error ? e.message : "Failed creating app invite codes." };
  }

  const canEmail = deps.isEmailConfigured();
  let emailError: string | null = null;
  if (canEmail && deps.sendAppUserInviteEmail) {
    try {
      await deps.sendAppUserInviteEmail({
        to: email,
        items: appInviteCodes.map((c) => ({ eventName: c.eventName, code: c.code }))
      });
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Failed sending invite email.";
    }
  }

  return {
    ok: true,
    message: emailError
      ? `Created ${appInviteCodes.length} app invite code(s), but email delivery failed (${emailError}). Copy the codes below.`
      : canEmail
        ? `App invite email sent to ${email} with ${appInviteCodes.length} code(s).`
        : `Created ${appInviteCodes.length} app invite code(s). Email is not configured — copy the codes below.`,
    appInviteCodes
  };
}
