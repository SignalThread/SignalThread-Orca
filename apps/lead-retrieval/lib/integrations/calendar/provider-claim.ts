import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CalendarProvider } from "@/lib/integrations/calendar/types";
import { canMutateExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";

export async function claimCalendarMeetingProvider(input: {
  idempotencyKey: string;
  companyId: string;
  leadId: string;
  userId: string;
  role: string;
  isBearer: boolean;
  provider: CalendarProvider;
  supabase?: ReturnType<typeof createAdminClient>;
}) {
  const supabase = (input.supabase ?? createAdminClient()) as any;
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, event_id")
    .eq("id", input.leadId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (leadError || !lead) return { ok: false as const, outcome: "lead_not_found" as const };
  if (
    !(await canMutateExhibitorLeadsInContext({
      userId: input.userId,
      companyId: input.companyId,
      role: input.role,
      isBearer: input.isBearer,
      leadEventId: lead.event_id,
      denyExhibitorViewer: true
    }))
  ) {
    return { ok: false as const, outcome: "unauthorized" as const };
  }
  const { error } = await supabase.from("calendar_meeting_provider_claims").insert({
    idempotency_key: input.idempotencyKey,
    company_id: input.companyId,
    lead_id: input.leadId,
    acting_user_id: input.userId,
    provider: input.provider
  });
  if (!error) return { ok: true as const, provider: input.provider };
  if (error.code !== "23505") throw new Error("Unable to reserve the calendar provider.");
  const { data: existing, error: existingError } = await supabase
    .from("calendar_meeting_provider_claims")
    .select("provider")
    .eq("idempotency_key", input.idempotencyKey)
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .eq("acting_user_id", input.userId)
    .maybeSingle();
  if (existingError || !existing) {
    throw new Error("Unable to resolve the calendar provider claim.");
  }
  return existing.provider === input.provider
    ? { ok: true as const, provider: input.provider }
    : { ok: false as const, outcome: "conflict" as const };
}
