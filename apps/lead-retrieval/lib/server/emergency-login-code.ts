import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSessionUser, normalizeSessionRole } from "@/lib/auth/session";
import { normalizeEventAccessMode } from "@/lib/access/event-access-mode";
import { normalizeEventUserPermissions } from "@/lib/server/event-user-access";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import {
  normalizeEmergencyLoginEmail,
  resolveEmergencyLoginTargetByEmail,
  type EmergencyLoginEmailCandidate
} from "@/lib/server/emergency-login-code-cli-core";
import {
  EMERGENCY_LOGIN_CODE_ACTION_TYPE,
  generateEmergencyLoginCodeWithDeps,
  type EmergencyLoginAppEvent,
  type EmergencyLoginCodeResult,
  type EmergencyLoginTargetUser
} from "@/lib/server/emergency-login-code-core";

const EMERGENCY_LOGIN_CLI_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

function escapePostgresLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function generateAuthOtp(
  supabase: ReturnType<typeof createAdminClient>,
  email: string
): Promise<
  | { ok: true; emailOtp: string; verificationType: "email" }
  | { ok: false; error: string }
> {
  // Supabase's magic-link and numeric email-OTP flows share one Auth challenge.
  // `email_otp` is the one-time credential; `action_link` must never cross this
  // server boundary or be presented as Emergency Login Access.
  const { data: linkPayload, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email
  });
  const emailOtp = String(linkPayload?.properties?.email_otp ?? "").trim();

  if (linkError || !/^\d{6,12}$/.test(emailOtp)) {
    return {
      ok: false,
      error: linkError?.message ?? "Could not generate an Emergency Login Code for this user."
    };
  }

  return {
    ok: true,
    emailOtp,
    verificationType: "email"
  };
}

async function loadTargetAppEvents(
  supabase: ReturnType<typeof createAdminClient>,
  target: EmergencyLoginTargetUser
): Promise<EmergencyLoginAppEvent[]> {
  const { data: membershipRows, error: membershipError } = await (supabase as any)
    .from("event_users")
    .select("event_id, permissions")
    .eq("user_id", target.id)
    .eq("exhibitor_company_id", target.companyId)
    .in("status", ["active", "invited", "pending"]);

  if (membershipError) {
    throw new Error(membershipError.message ?? "Failed loading app access.");
  }

  const byEventId = new Map<string, { admin: boolean; app: boolean }>();
  for (const row of (membershipRows ?? []) as Array<{ event_id: string | null; permissions: unknown }>) {
    const eventId = String(row.event_id ?? "").trim();
    if (!eventId) continue;
    const permissions = normalizeEventUserPermissions(row.permissions);
    if (!permissions.app) continue;
    const existing = byEventId.get(eventId) ?? { admin: false, app: false };
    byEventId.set(eventId, {
      admin: existing.admin || permissions.admin,
      app: true
    });
  }

  const eventIds = [...byEventId.keys()];
  if (eventIds.length === 0) return [];

  const { data: eventRows, error: eventError } = await (supabase as any)
    .from("events")
    .select("id, name")
    .in("id", eventIds);

  if (eventError) {
    throw new Error(eventError.message ?? "Failed loading event names.");
  }

  const namesById = new Map(
    ((eventRows ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
      String(row.id),
      String(row.name ?? "Event")
    ])
  );

  return eventIds.map((eventId) => ({
    eventId,
    eventName: namesById.get(eventId) ?? "Event",
    permissions: byEventId.get(eventId) ?? { admin: false, app: true }
  }));
}

type EmergencyLoginInput = {
  targetUserId: string;
  reason: string;
  method?: string;
};

async function generateEmergencyLoginCodeForUserWithActor(
  supabase: ReturnType<typeof createAdminClient>,
  input: EmergencyLoginInput,
  loadActor: () => Promise<{
    id: string;
    role: string | null;
    companyId: string | null;
    activeCompanyId?: string | null;
  } | null>
): Promise<EmergencyLoginCodeResult> {
  try {
    return await generateEmergencyLoginCodeWithDeps(
      {
        loadActor,
        actorCanGenerateForCompany: async (actor, companyId) => {
          const role = normalizeSessionRole(actor.role);
          if (role === "platform_admin") {
            return String(actor.activeCompanyId ?? "").trim() === companyId;
          }
          if (role !== "exhibitor_admin") return false;
          return getUserHasExhibitorWebAdminAccess(actor.id, companyId);
        },
        loadTargetUser: async (targetUserId) => {
          const { data, error } = await (supabase as any)
            .from("users")
            .select("id, email, role, company_id, event_access_mode")
            .eq("id", targetUserId)
            .maybeSingle();

          if (error) {
            throw new Error(error.message ?? "Failed loading target user.");
          }
          if (!data) return null;

          const row = data as {
            id: string;
            email: string | null;
            role: string | null;
            company_id: string | null;
            event_access_mode: string | null;
          };

          return {
            id: row.id,
            email: row.email,
            role: row.role,
            companyId: row.company_id,
            eventAccessMode: normalizeEventAccessMode(row.event_access_mode)
          };
        },
        loadTargetAppEvents: (target) => loadTargetAppEvents(supabase, target),
        generateAuthOtp: (email) => generateAuthOtp(supabase, email),
        auditGeneration: async (audit) => {
          const { error } = await (supabase as any)
            .from("emergency_login_code_audit_events")
            .insert({
              action_type: EMERGENCY_LOGIN_CODE_ACTION_TYPE,
              acting_admin_user_id: audit.actingAdminUserId,
              target_user_id: audit.targetUserId,
              target_email: audit.targetEmail,
              company_id: audit.companyId,
              event_ids: audit.eventIds,
              reason: audit.reason,
              method: audit.method,
              app_code_count: audit.appCodeCount
            });

          if (error) {
            return { ok: false, error: error.message ?? "Failed writing audit log." };
          }
          return { ok: true };
        }
      },
      input
    );
  } catch (error) {
    console.error("[emergency-login-code] generation failed", {
      targetUserId: String(input.targetUserId ?? "").trim(),
      error
    });
    return {
      ok: false,
      error: "Could not generate an Emergency Login Code. Try again or contact support."
    };
  }
}

export async function generateEmergencyLoginCodeForUser(
  input: EmergencyLoginInput
): Promise<EmergencyLoginCodeResult> {
  const supabase = createAdminClient();
  return generateEmergencyLoginCodeForUserWithActor(supabase, input, async () => {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) return null;
    return {
      id: sessionUser.id,
      role: normalizeSessionRole(sessionUser.role),
      companyId: String(sessionUser.company_id ?? "").trim() || null,
      activeCompanyId: String(sessionUser.active_company_id ?? "").trim() || null
    };
  });
}

/**
 * Service-role operator entry point for the email-only support CLI.
 * The nil actor UUID explicitly denotes a non-human operator process; `method`
 * remains the audit source. Target scope is still resolved from canonical user
 * data and rechecked by the same platform-admin company guard as the UI path.
 */
export async function generateEmergencyLoginCodeForOperatorByEmail(input: {
  email: string;
  reason: string;
  method: string;
}): Promise<EmergencyLoginCodeResult> {
  const email = normalizeEmergencyLoginEmail(input.email);
  const supabase = createAdminClient();

  try {
    const { data: userRows, error: usersError } = await (supabase as any)
      .from("users")
      .select("id, email, role, company_id")
      .ilike("email", escapePostgresLikePattern(email))
      .limit(25);
    if (usersError) {
      return { ok: false, error: usersError.message ?? "Failed resolving LR user by email." };
    }

    const rows = (userRows ?? []) as Array<{
      id: string;
      email: string | null;
      role: string | null;
      company_id: string | null;
    }>;
    const userIds = rows.map((row) => String(row.id)).filter(Boolean);
    const { data: membershipRows, error: membershipsError } = userIds.length
      ? await (supabase as any)
          .from("event_users")
          .select("user_id, exhibitor_company_id")
          .in("user_id", userIds)
          .in("status", ["active", "invited", "pending"])
      : { data: [], error: null };
    if (membershipsError) {
      return { ok: false, error: membershipsError.message ?? "Failed resolving company memberships." };
    }

    const membershipsByUserId = new Map<string, Set<string>>();
    for (const row of (membershipRows ?? []) as Array<{
      user_id: string | null;
      exhibitor_company_id: string | null;
    }>) {
      const userId = String(row.user_id ?? "").trim();
      const companyId = String(row.exhibitor_company_id ?? "").trim();
      if (!userId || !companyId) continue;
      const companyIds = membershipsByUserId.get(userId) ?? new Set<string>();
      companyIds.add(companyId);
      membershipsByUserId.set(userId, companyIds);
    }

    const companyIds = [
      ...new Set([
        ...rows.map((row) => String(row.company_id ?? "").trim()).filter(Boolean),
        ...[...membershipsByUserId.values()].flatMap((ids) => [...ids])
      ])
    ];
    const { data: companyRows, error: companiesError } = companyIds.length
      ? await (supabase as any).from("companies").select("id, name").in("id", companyIds)
      : { data: [], error: null };
    if (companiesError) {
      return { ok: false, error: companiesError.message ?? "Failed resolving company context." };
    }

    const companyNames = new Map(
      ((companyRows ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
        String(row.id),
        row.name
      ])
    );
    const candidates: EmergencyLoginEmailCandidate[] = rows.map((row) => ({
      id: String(row.id),
      email: row.email,
      role: row.role,
      companyId: row.company_id,
      companyName: row.company_id ? companyNames.get(String(row.company_id)) ?? null : null,
      membershipCompanies: [...(membershipsByUserId.get(String(row.id)) ?? [])].map((companyId) => ({
        id: companyId,
        name: companyNames.get(companyId) ?? null
      }))
    }));
    const target = resolveEmergencyLoginTargetByEmail(email, candidates);
    const companyId = String(target.companyId ?? "").trim();
    if (!companyId) {
      return { ok: false, error: "Target user is missing a company scope." };
    }

    return generateEmergencyLoginCodeForUserWithActor(
      supabase,
      {
        targetUserId: target.id,
        reason: input.reason,
        method: input.method
      },
      async () => ({
        id: EMERGENCY_LOGIN_CLI_ACTOR_ID,
        role: "platform_admin",
        companyId,
        activeCompanyId: companyId
      })
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed resolving LR user by email."
    };
  }
}
