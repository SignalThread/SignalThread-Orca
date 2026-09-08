import "server-only";

import type { EventAccessMode } from "@/lib/access/event-access-mode";
import { orchestrateCompanyAppUserInvite } from "@/lib/exhibitor/company-team-app-user-invite";
import type { CompanyTeamActionState } from "@/lib/exhibitor/company-team-types";
import { sendCompanyTeamAppUserInviteEmail } from "@/lib/server/email/sendInviteEmail";
import { createInviteCode } from "@/lib/server/invites/createInviteCode";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loadCompanyAssociatedEvents(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string,
  ids?: string[]
): Promise<Array<{ id: string; name: string }>> {
  const requestedIds = Array.isArray(ids)
    ? Array.from(new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean)))
    : [];

  let ownedQuery = (supabase as any)
    .from("events")
    .select("id, name")
    .eq("company_id", companyId);
  if (requestedIds.length > 0) ownedQuery = ownedQuery.in("id", requestedIds);

  let exhibitorQuery = (supabase as any)
    .from("exhibitors")
    .select("event_id")
    .eq("company_id", companyId);
  if (requestedIds.length > 0) exhibitorQuery = exhibitorQuery.in("event_id", requestedIds);

  const [ownedResult, exhibitorResult] = await Promise.all([ownedQuery, exhibitorQuery]);
  if (ownedResult.error) throw new Error(ownedResult.error.message ?? "Failed loading company events.");
  if (exhibitorResult.error) {
    throw new Error(exhibitorResult.error.message ?? "Failed loading exhibitor event scope.");
  }

  let ownedRows = (ownedResult.data ?? []) as Array<{ id: string; name: string | null }>;
  if (requestedIds.length > 0) {
    const requested = new Set(requestedIds);
    ownedRows = ownedRows.filter((row) => requested.has(String(row.id)));
  }

  const exhibitorEventIds = Array.from(
    new Set(
      ((exhibitorResult.data ?? []) as Array<{ event_id: string | null }>)
        .map((row) => String(row.event_id ?? "").trim())
        .filter((id) => id.length > 0)
        .filter((id) => requestedIds.length === 0 || requestedIds.includes(id))
    )
  );
  const ownedById = new Map(
    ownedRows.map((row) => [
      String(row.id),
      { id: String(row.id), name: String(row.name ?? "Event") }
    ] as const)
  );
  const missingExhibitorEventIds = exhibitorEventIds.filter((id) => !ownedById.has(id));
  if (missingExhibitorEventIds.length > 0) {
    const { data: eventRows, error } = await (supabase as any)
      .from("events")
      .select("id, name")
      .in("id", missingExhibitorEventIds);
    if (error) throw new Error(error.message ?? "Failed loading exhibitor events.");
    for (const row of (eventRows ?? []) as Array<{ id: string; name: string | null }>) {
      ownedById.set(String(row.id), {
        id: String(row.id),
        name: String(row.name ?? "Event")
      });
    }
  }

  return [...ownedById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Canonical mobile-code workflow used by Company Team and the operator CLI. */
export async function createCompanyAppUserInviteCodes(input: {
  supabase: ReturnType<typeof createAdminClient>;
  companyId: string;
  email: string;
  eventAccessMode: EventAccessMode;
  assignedEventIds: string[];
  sendEmail?: boolean;
}): Promise<CompanyTeamActionState> {
  const { supabase, companyId, email, eventAccessMode, assignedEventIds } = input;

  return orchestrateCompanyAppUserInvite(
    {
      supabase,
      loadCompanyEvents: async (args) => {
        try {
          const events = await loadCompanyAssociatedEvents(
            supabase,
            args.companyId,
            args.eventAccessMode === "assigned_events_only" ? args.assignedEventIds : undefined
          );
          return { ok: true, events };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Failed loading events." };
        }
      },
      clearPendingInvitesForEvents: async (args) => {
        if (args.eventIds.length === 0) return { ok: true };
        const { error } = await (supabase as any)
          .from("invite_codes")
          .delete()
          .eq("exhibitor_company_id", args.companyId)
          .eq("email", args.email)
          .in("event_id", args.eventIds)
          .is("used_at", null);
        return error
          ? { ok: false, error: error.message ?? "Failed clearing prior app invites." }
          : { ok: true };
      },
      deleteInviteCodesByIds: async (ids) => {
        if (ids.length === 0) return;
        const { error } = await (supabase as any).from("invite_codes").delete().in("id", ids);
        if (error) throw new Error(error.message ?? "Failed rolling back app invite codes.");
      },
      createInviteCode,
      sendAppUserInviteEmail: sendCompanyTeamAppUserInviteEmail,
      isEmailConfigured: () =>
        input.sendEmail !== false && Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL)
    },
    { companyId, email, eventAccessMode, assignedEventIds }
  );
}
