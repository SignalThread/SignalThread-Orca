import "server-only";

/**
 * Scoped, bounded loaders for the Live state of the canonical Event
 * Workspace. Derivation lives in `lib/events/event-workspace-live-core.ts`.
 *
 * Contract (same as event-workspace-data.ts):
 * - The caller passes an access-validated eventId; every query still scopes
 *   explicitly. `lead_conversations` has no event/company columns, so those
 *   queries join through `leads` with inner-join filters on both.
 * - Every query degrades to `null` independently — never fabricated zeros.
 * - Narrow selects, bounded rows, no per-card query loops.
 */

import { createAdminClient } from "@/lib/supabase/admin";
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
  sentiment: string | null;
  problem_severity: string | null;
  buying_intent: string | null;
  priority_themes: string[] | null;
  objections: string[] | null;
  next_steps: string[] | null;
  competitors_mentioned: string[] | null;
  pain_points: string[] | null;
  feature_requests: string[] | null;
  buying_signals: string[] | null;
  operational_pains: string[] | null;
  workflow_constraints: string[] | null;
  technical_constraints: string[] | null;
  desired_outcomes: string[] | null;
  adoption_risks: string[] | null;
  management_visibility_needs: string[] | null;
  business_process_concerns: string[] | null;
  product_objections: string[] | null;
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

export type EventWorkspaceLiveData = {
  conversations: LiveConversationRow[] | null;
  totalConversationCount: number | null;
  conversationsTodayCount: number | null;
  leadsTodayCount: number | null;
  hotNeedingFollowUpCount: number | null;
  followUpsDueCount: number | null;
  followUpsDueTodayCount: number | null;
  followUpsOverdueCount: number | null;
  briefingCounts: { generated: number; approved: number } | null;
};

export async function loadEventWorkspaceLiveData(input: {
  companyId: string;
  eventId: string;
  today: { ymd: string; startIso: string; endExclusiveIso: string; instantIso: string };
}): Promise<EventWorkspaceLiveData> {
  const { companyId, eventId, today } = input;
  const supabase = createAdminClient();

  const [
    rawConversations,
    totalConversationCount,
    conversationsTodayCount,
    briefingCounts,
    cumulativeRows,
    leadMetricsByEvent
  ] = await Promise.all([
    // Recent-conversation intelligence window, scoped through the lead join.
    tryQuery<RawConversationRow[]>(() =>
      (supabase as any)
        .from("lead_conversations")
        .select(
          "id, created_at, summary, transcript, sentiment, problem_severity, buying_intent, priority_themes, objections, next_steps, competitors_mentioned, pain_points, feature_requests, buying_signals, operational_pains, workflow_constraints, technical_constraints, desired_outcomes, adoption_risks, management_visibility_needs, business_process_concerns, product_objections, rep_behavior_patterns, transcription_status, synthesis_status, transcription_error, synthesis_error, lead_id, leads!inner(id, full_name, company_text)"
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
    tryCount(() =>
      (supabase as any)
        .from("lead_conversations")
        .select("id, leads!inner(id)", { count: "exact", head: true })
        .eq("leads.company_id", companyId)
        .eq("leads.event_id", eventId)
        .gte("created_at", today.startIso)
        .lt("created_at", today.endExclusiveIso)
    ),
    loadEventBriefingCounts({ companyId, eventId }),
    tryQuery<RawCumulativeRow[]>(() =>
      (supabase as any)
        .from("lead_cumulative_insights")
        .select("lead_id, status, insights_json, leads!inner(event_id)")
        .eq("company_id", companyId)
        .eq("leads.event_id", eventId)
        .limit(CONVERSATION_WINDOW_LIMIT)
    ),
    loadDashboardEventLeadMetrics({ companyId, eventIds: [eventId], now: new Date(today.instantIso) })
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
    conversationsTodayCount,
    leadsTodayCount: leadMetrics?.leadsToday ?? null,
    hotNeedingFollowUpCount: leadMetrics?.hotAwaitingFollowUp ?? null,
    followUpsDueCount:
      leadMetrics?.dueToday === null || leadMetrics?.overdue === null || !leadMetrics
        ? null
        : leadMetrics.dueToday + leadMetrics.overdue,
    followUpsDueTodayCount: leadMetrics?.dueToday ?? null,
    followUpsOverdueCount: leadMetrics?.overdue ?? null,
    briefingCounts
  };
}
