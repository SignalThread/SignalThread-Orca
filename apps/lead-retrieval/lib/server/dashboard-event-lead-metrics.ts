import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type DashboardEventLeadMetrics = {
  eventId: string;
  totalLeads: number;
  leadsToday: number | null;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  hotAwaitingFollowUp: number | null;
  hotNoFollowUp: number;
  openFollowUps: number;
  dueToday: number | null;
  overdue: number | null;
  scheduledFuture: number | null;
  stillNew: number;
};

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** One DB-side aggregate for event and account dashboard lead truth. */
export async function loadDashboardEventLeadMetrics(input: {
  companyId: string;
  eventIds: readonly string[];
  now?: Date;
}): Promise<Map<string, DashboardEventLeadMetrics> | null> {
  if (input.eventIds.length === 0) return new Map();
  const supabase = createAdminClient();
  try {
    const { data, error } = await (supabase as any).rpc("dashboard_event_lead_metrics", {
      p_company_id: input.companyId,
      p_event_ids: [...input.eventIds],
      p_now: (input.now ?? new Date()).toISOString()
    });
    if (error || !Array.isArray(data)) return null;
    return new Map(data.map((row: any) => {
      const eventId = String(row.event_id);
      return [eventId, {
        eventId,
        totalLeads: Number(row.total_leads ?? 0),
        leadsToday: numberOrNull(row.leads_today),
        hotLeads: Number(row.hot_leads ?? 0),
        warmLeads: Number(row.warm_leads ?? 0),
        coldLeads: Number(row.cold_leads ?? 0),
        hotAwaitingFollowUp: numberOrNull(row.hot_awaiting_follow_up),
        hotNoFollowUp: Number(row.hot_no_follow_up ?? 0),
        openFollowUps: Number(row.open_follow_ups ?? 0),
        dueToday: numberOrNull(row.due_today),
        overdue: numberOrNull(row.overdue),
        scheduledFuture: numberOrNull(row.scheduled_future),
        stillNew: Number(row.still_new ?? 0)
      } satisfies DashboardEventLeadMetrics] as const;
    }));
  } catch {
    return null;
  }
}

