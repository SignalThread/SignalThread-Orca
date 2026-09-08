import type { CrmConversationInsightSnapshot } from "./crm-sync-ai-notes";

type SupabaseLike = {
  from: (table: string) => any;
};

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function toList(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => normalizeText(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

export async function loadLatestScopedConversationInsights(
  supabase: SupabaseLike,
  input: { accountId: string; leadId: string }
): Promise<CrmConversationInsightSnapshot | null> {
  const accountId = normalizeText(input.accountId);
  const leadId = normalizeText(input.leadId);
  if (!accountId || !leadId) return null;

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, company_id")
    .eq("id", leadId)
    .eq("company_id", accountId)
    .maybeSingle();

  if (leadError) {
    throw new Error(leadError.message ?? "Failed to verify lead scope.");
  }
  if (!lead) return null;

  const { data, error } = await supabase
    .from("lead_conversations")
    .select("summary, objections, next_steps, conversation_version, synthesized_at")
    .eq("lead_id", leadId)
    .eq("synthesis_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load conversation insights.");
  }

  const row = (data as
    | {
        summary?: string | null;
        objections?: unknown;
        next_steps?: unknown;
        conversation_version?: unknown;
        synthesized_at?: string | null;
      }
    | null) ?? null;

  return {
    summary: normalizeText(row?.summary),
    objections: toList(row?.objections),
    nextSteps: toList(row?.next_steps),
    conversationVersion: Number.isFinite(Number(row?.conversation_version))
      ? Number(row?.conversation_version)
      : null,
    generatedAt: normalizeText(row?.synthesized_at)
  };
}
