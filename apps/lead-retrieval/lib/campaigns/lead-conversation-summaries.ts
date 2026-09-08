import { normalizeConversationSummary } from "@/lib/campaigns/ai-summary-signal";

type LeadConversationSummaryRow = {
  lead_id: string;
  summary: string | null;
  created_at: string;
};

type SupabaseError = {
  message: string;
  code?: string;
} | null;

export async function loadLatestCompletedConversationSummaryByLeadId(
  supabase: any,
  leadIds: string[]
): Promise<{ summaryByLeadId: Map<string, string>; error: SupabaseError }> {
  if (!leadIds.length) {
    return { summaryByLeadId: new Map<string, string>(), error: null };
  }

  const { data, error } = (await supabase
    .from("lead_conversations")
    .select("lead_id, summary, created_at")
    .in("lead_id", leadIds)
    .eq("synthesis_status", "completed")
    .not("summary", "is", null)
    .order("created_at", { ascending: false })) as {
    data: LeadConversationSummaryRow[] | null;
    error: SupabaseError;
  };

  if (error) {
    return { summaryByLeadId: new Map<string, string>(), error };
  }

  const summaryByLeadId = new Map<string, string>();
  for (const row of data ?? []) {
    if (summaryByLeadId.has(row.lead_id)) {
      continue;
    }

    const normalized = normalizeConversationSummary(row.summary);
    if (!normalized) {
      continue;
    }
    summaryByLeadId.set(row.lead_id, normalized);
  }

  return { summaryByLeadId, error: null };
}
