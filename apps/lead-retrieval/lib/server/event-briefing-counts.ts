import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type EventBriefingCounts = { generated: number; approved: number };

/** Exact event/company counts; never derives totals from a bounded row sample. */
export async function loadEventBriefingCounts(input: {
  companyId: string;
  eventId: string;
}): Promise<EventBriefingCounts | null> {
  const supabase = createAdminClient();
  try {
    const scoped = (approvalStatus?: string) => {
      let query = (supabase as any)
        .from("lead_briefings")
        .select("id, leads!inner(event_id)", { count: "exact", head: true })
        .eq("company_id", input.companyId)
        .eq("leads.event_id", input.eventId);
      if (approvalStatus) query = query.eq("approval_status", approvalStatus);
      return query;
    };
    const [generated, approved] = await Promise.all([scoped(), scoped("approved")]);
    if (generated.error || approved.error) return null;
    return {
      generated: Number(generated.count ?? 0),
      approved: Number(approved.count ?? 0)
    };
  } catch {
    return null;
  }
}
