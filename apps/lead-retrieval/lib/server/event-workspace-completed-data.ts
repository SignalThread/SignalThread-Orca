import "server-only";

/**
 * Scoped, bounded loaders for the Completed / Post-Event state of the
 * canonical Event Workspace. Derivation lives in
 * `lib/events/event-workspace-completed-core.ts`.
 *
 * Same contract as the other workspace loaders: the caller passes an
 * access-validated eventId; every query scopes explicitly (conversations join
 * through leads); every query degrades to `null` independently — never
 * fabricated zeros. The drafts count runs only when workflows are enabled.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isWorkflowsEnabled } from "@/lib/workflows/is-workflows-enabled";
import type { LiveConversationRow } from "@/lib/events/event-workspace-live-core";
import {
  buildCanonicalConversationIntelligence,
  selectCanonicalConversationIntelligence
} from "@/lib/conversations/conversation-intelligence-read-model";
import { loadDashboardEventLeadMetrics } from "@/lib/server/dashboard-event-lead-metrics";
import { loadEventBriefingCounts } from "@/lib/server/event-briefing-counts";

const CONVERSATION_WINDOW_LIMIT = 300;

async function tryQuery<T>(run: () => PromiseLike<{ data: T | null; error: unknown | null }>): Promise<T | null> {
  try {
    const { data, error } = await run();
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

async function tryCount(
  run: () => PromiseLike<{ count: number | null; error: unknown | null }>
): Promise<number | null> {
  try {
    const { count, error } = await run();
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

type RawConversationRow = {
  id: string;
  created_at: string;
  summary: string | null;
  transcript: string | null;
  priority_themes: string[] | null;
  objections: string[] | null;
  competitors_mentioned: string[] | null;
  pain_points: string[] | null;
  buying_signals: string[] | null;
  rep_behavior_patterns: string[] | null;
  transcription_status: string | null;
  synthesis_status: string | null;
  transcription_error: string | null;
  synthesis_error: string | null;
  lead_id: string;
  leads: { id: string; full_name: string | null; company_text: string | null } | null;
};

type RawCumulativeRow = {
  lead_id: string;
  status: string | null;
  insights_json: unknown;
};

export type EventWorkspaceCompletedData = {
  conversations: LiveConversationRow[] | null;
  totalConversationCount: number | null;
  totalLeadCount: number | null;
  hotLeadCount: number | null;
  warmLeadCount: number | null;
  coldLeadCount: number | null;
  hotNoFollowUpCount: number | null;
  openFollowUpCount: number | null;
  dueTodayFollowUpCount: number | null;
  overdueFollowUpCount: number | null;
  scheduledFollowUpCount: number | null;
  stillNewCount: number | null;
  briefingCounts: { generated: number; approved: number } | null;
  /** Null when workflows are disabled or the query failed. */
  draftsPendingCount: number | null;
};

export async function loadEventWorkspaceCompletedData(input: {
  companyId: string;
  eventId: string;
  todayYmd: string;
  now?: Date;
}): Promise<EventWorkspaceCompletedData> {
  const { companyId, eventId, todayYmd } = input;
  const supabase = createAdminClient();

  const [
    rawConversations,
    totalConversationCount,
    briefingCounts,
    draftsPendingCount,
    cumulativeRows,
    leadMetricsByEvent
  ] = await Promise.all([
    tryQuery<RawConversationRow[]>(() =>
      (supabase as any)
        .from("lead_conversations")
        .select(
          "id, created_at, summary, transcript, priority_themes, objections, competitors_mentioned, pain_points, buying_signals, rep_behavior_patterns, transcription_status, synthesis_status, transcription_error, synthesis_error, lead_id, leads!inner(id, full_name, company_text)"
        )
        .eq("leads.company_id", companyId)
        .eq("leads.event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(CONVERSATION_WINDOW_LIMIT)
    ),
    tryCount(() =>
      (supabase as any)
        .from("lead_conversations")
        .select("id, leads!inner(id)", { count: "exact", head: true })
        .eq("leads.company_id", companyId)
        .eq("leads.event_id", eventId)
    ),
    loadEventBriefingCounts({ companyId, eventId }),
    isWorkflowsEnabled()
      ? tryCount(() =>
          (supabase as any)
            .from("generated_drafts")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("event_id", eventId)
            .eq("approval_status", "pending")
        )
      : Promise.resolve(null),
    tryQuery<RawCumulativeRow[]>(() =>
      (supabase as any)
        .from("lead_cumulative_insights")
        .select("lead_id, status, insights_json, leads!inner(event_id)")
        .eq("company_id", companyId)
        .eq("leads.event_id", eventId)
        .limit(CONVERSATION_WINDOW_LIMIT)
    ),
    loadDashboardEventLeadMetrics({ companyId, eventIds: [eventId], now: input.now })
  ]);
  const leadMetrics = leadMetricsByEvent?.get(eventId) ?? null;

  const cumulativeByLead = new Map(
    (cumulativeRows ?? []).map((row) => [row.lead_id, row] as const)
  );
  const conversationsByLead = new Map<string, RawConversationRow[]>();
  for (const row of rawConversations ?? []) {
    const rows = conversationsByLead.get(row.lead_id) ?? [];
    rows.push(row);
    conversationsByLead.set(row.lead_id, rows);
  }
  const canonicalConversationIdByLead = new Map(
    [...conversationsByLead.entries()].map(([leadId, rows]) => [
      leadId,
      selectCanonicalConversationIntelligence(rows)?.id ?? null
    ])
  );
  const conversations: LiveConversationRow[] | null =
    rawConversations === null
      ? null
      : rawConversations.map((row) => {
          const cumulative =
            canonicalConversationIdByLead.get(row.lead_id) === row.id
              ? cumulativeByLead.get(row.lead_id) ?? null
              : null;
          const intelligence = buildCanonicalConversationIntelligence(row, cumulative);
          return {
            id: row.id,
            created_at: row.created_at,
            summary: intelligence?.summary || row.summary,
            transcript: row.transcript,
            priority_themes: intelligence?.priority_themes ?? row.priority_themes,
            objections: intelligence?.objections ?? row.objections,
            competitors_mentioned: intelligence?.competitors_mentioned ?? row.competitors_mentioned,
            pain_points: intelligence?.pain_points ?? row.pain_points,
            buying_signals: intelligence?.buying_signals ?? row.buying_signals,
            rep_behavior_patterns: intelligence?.rep_behavior_patterns ?? row.rep_behavior_patterns,
            transcription_status: row.transcription_status,
            synthesis_status: row.synthesis_status,
            transcription_error: row.transcription_error,
            synthesis_error: row.synthesis_error,
            leadId: row.lead_id,
            leadName: row.leads?.full_name ?? null,
            leadCompany: row.leads?.company_text ?? null
          };
        });

  return {
    conversations,
    totalConversationCount,
    totalLeadCount: leadMetrics?.totalLeads ?? null,
    hotLeadCount: leadMetrics?.hotLeads ?? null,
    warmLeadCount: leadMetrics?.warmLeads ?? null,
    coldLeadCount: leadMetrics?.coldLeads ?? null,
    hotNoFollowUpCount: leadMetrics?.hotNoFollowUp ?? null,
    openFollowUpCount: leadMetrics?.openFollowUps ?? null,
    dueTodayFollowUpCount: leadMetrics?.dueToday ?? null,
    overdueFollowUpCount: leadMetrics?.overdue ?? null,
    scheduledFollowUpCount: leadMetrics?.scheduledFuture ?? null,
    stillNewCount: leadMetrics?.stillNew ?? null,
    briefingCounts,
    draftsPendingCount
  };
}
