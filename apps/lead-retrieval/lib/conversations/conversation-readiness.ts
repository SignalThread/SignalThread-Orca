import type { createAdminClient } from "@/lib/supabase/admin";

export type ConversationReadinessState = {
  leadId: string;
  latestConversationVersion: number;
  latestAudioFinalizedAt: string | null;
  transcriptStatus: "pending" | "processing" | "ready" | "failed";
  transcriptVersion: number | null;
  transcriptReadyAt: string | null;
  insightsStatus: "pending" | "processing" | "ready" | "failed";
  insightsVersion: number | null;
  insightsReadyAt: string | null;
};

export type WorkflowDataRequirements = {
  requiresAudioTranscript: boolean;
  requiresConversationInsights: boolean;
};

export type WorkflowDataReadinessDecision =
  | {
      ready: true;
      requiredConversationVersion: number;
      currentTranscriptVersion: number | null;
      currentInsightsVersion: number | null;
    }
  | {
      ready: false;
      waitingReason: "waiting_for_audio_transcript" | "waiting_for_conversation_insights";
      errorText: string;
      requiredConversationVersion: number;
      currentTranscriptVersion: number | null;
      currentInsightsVersion: number | null;
      waitExpiresAt: string;
    };

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60 * 1000;

function normalizeStatus(value: unknown): "pending" | "processing" | "ready" | "failed" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "ready" || normalized === "processing" || normalized === "failed") {
    return normalized;
  }
  return "pending";
}

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function normalizeState(leadId: string, row: Record<string, unknown> | null): ConversationReadinessState {
  return {
    leadId,
    latestConversationVersion: toPositiveInt(row?.latest_conversation_version) ?? 0,
    latestAudioFinalizedAt: typeof row?.latest_audio_finalized_at === "string" ? row.latest_audio_finalized_at : null,
    transcriptStatus: normalizeStatus(row?.transcript_status),
    transcriptVersion: toPositiveInt(row?.transcript_version),
    transcriptReadyAt: typeof row?.transcript_ready_at === "string" ? row.transcript_ready_at : null,
    insightsStatus: normalizeStatus(row?.insights_status),
    insightsVersion: toPositiveInt(row?.insights_version),
    insightsReadyAt: typeof row?.insights_ready_at === "string" ? row.insights_ready_at : null
  };
}

function waitExpiresAt(nowIso: string, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS): string {
  return new Date(new Date(nowIso).getTime() + timeoutMs).toISOString();
}

export async function loadConversationReadinessState(
  supabase: SupabaseAdmin,
  leadId: string
): Promise<ConversationReadinessState> {
  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("lead_conversation_readiness")
    .select(
      "lead_id, latest_conversation_version, latest_audio_finalized_at, transcript_status, transcript_version, transcript_ready_at, insights_status, insights_version, insights_ready_at"
    )
    .eq("lead_id", leadId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load conversation readiness.");
  }
  return normalizeState(leadId, data);
}

export function evaluateWorkflowDataReadiness(input: {
  state: ConversationReadinessState;
  requirements: WorkflowDataRequirements;
  nowIso?: string;
  waitTimeoutMs?: number;
}): WorkflowDataReadinessDecision {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const requiredConversationVersion = input.state.latestConversationVersion;
  const currentTranscriptVersion = input.state.transcriptVersion;
  const currentInsightsVersion = input.state.insightsVersion;

  if (
    input.requirements.requiresAudioTranscript &&
    !isVersionReady(input.state.transcriptStatus, currentTranscriptVersion, requiredConversationVersion)
  ) {
    return {
      ready: false,
      waitingReason: "waiting_for_audio_transcript",
      errorText: "Waiting for the latest audio transcript to finish.",
      requiredConversationVersion,
      currentTranscriptVersion,
      currentInsightsVersion,
      waitExpiresAt: waitExpiresAt(nowIso, input.waitTimeoutMs)
    };
  }

  if (input.requirements.requiresConversationInsights) {
    if (!isVersionReady(input.state.transcriptStatus, currentTranscriptVersion, requiredConversationVersion)) {
      return {
        ready: false,
        waitingReason: "waiting_for_audio_transcript",
        errorText: "Waiting for the latest audio transcript before generating conversation insights.",
        requiredConversationVersion,
        currentTranscriptVersion,
        currentInsightsVersion,
        waitExpiresAt: waitExpiresAt(nowIso, input.waitTimeoutMs)
      };
    }
    if (!isVersionReady(input.state.insightsStatus, currentInsightsVersion, requiredConversationVersion)) {
      return {
        ready: false,
        waitingReason: "waiting_for_conversation_insights",
        errorText: "Waiting for AI conversation insights to finish.",
        requiredConversationVersion,
        currentTranscriptVersion,
        currentInsightsVersion,
        waitExpiresAt: waitExpiresAt(nowIso, input.waitTimeoutMs)
      };
    }
  }

  return {
    ready: true,
    requiredConversationVersion,
    currentTranscriptVersion,
    currentInsightsVersion
  };
}

export async function markConversationAudioFinalized(input: {
  supabase: SupabaseAdmin;
  leadId: string;
  conversationId: string;
  nowIso?: string;
}): Promise<number> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const existingConversationVersion = await loadConversationVersion(input.supabase, input.conversationId);
  if (existingConversationVersion) {
    await ensureReadinessAtLeastVersion({
      supabase: input.supabase,
      leadId: input.leadId,
      version: existingConversationVersion,
      nowIso
    });
    return existingConversationVersion;
  }

  const current = await loadConversationReadinessState(input.supabase, input.leadId);
  const nextVersion = current.latestConversationVersion + 1;
  const payload = {
    latest_conversation_version: nextVersion,
    latest_audio_finalized_at: nowIso,
    transcript_status: "processing",
    transcript_version: null,
    transcript_ready_at: null,
    insights_status: "pending",
    insights_version: null,
    insights_ready_at: null,
    updated_at: nowIso
  };

  if (current.latestConversationVersion === 0) {
    const { error: insertError } = await (input.supabase as unknown as {
      from: (table: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    })
      .from("lead_conversation_readiness")
      .insert({
        lead_id: input.leadId,
        ...payload,
        created_at: nowIso
      });
    if (insertError) {
      throw new Error(insertError.message ?? "Failed inserting conversation readiness.");
    }
  } else {
    const { error: updateError } = await (input.supabase as unknown as {
      from: (table: string) => {
        update: (patch: Record<string, unknown>) => {
          eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("lead_conversation_readiness")
      .update(payload)
      .eq("lead_id", input.leadId);
    if (updateError) {
      throw new Error(updateError.message ?? "Failed updating conversation readiness.");
    }
  }

  await updateConversationVersion(input.supabase, input.conversationId, nextVersion);
  return nextVersion;
}

export async function markConversationTranscriptReady(input: {
  supabase: SupabaseAdmin;
  leadId: string;
  conversationId: string;
  nowIso?: string;
}): Promise<number | null> {
  const version = await loadConversationVersion(input.supabase, input.conversationId);
  if (!version) return null;
  await updateReadiness(input.supabase, input.leadId, {
    transcript_status: "ready",
    transcript_version: version,
    transcript_ready_at: input.nowIso ?? new Date().toISOString(),
    insights_status: "processing",
    insights_version: null,
    insights_ready_at: null
  });
  return version;
}

export async function markConversationTranscriptFailed(input: {
  supabase: SupabaseAdmin;
  leadId: string;
  conversationId: string;
  nowIso?: string;
}): Promise<number | null> {
  const version = await loadConversationVersion(input.supabase, input.conversationId);
  if (!version) return null;
  await updateReadiness(input.supabase, input.leadId, {
    transcript_status: "failed",
    transcript_version: null,
    transcript_ready_at: null,
    insights_status: "failed",
    insights_version: null,
    insights_ready_at: null
  });
  return version;
}

export async function markConversationInsightsReady(input: {
  supabase: SupabaseAdmin;
  leadId: string;
  conversationId: string;
  nowIso?: string;
}): Promise<number | null> {
  const version = await loadConversationVersion(input.supabase, input.conversationId);
  if (!version) return null;
  await updateReadiness(input.supabase, input.leadId, {
    insights_status: "ready",
    insights_version: version,
    insights_ready_at: input.nowIso ?? new Date().toISOString()
  });
  return version;
}

export async function markConversationInsightsFailed(input: {
  supabase: SupabaseAdmin;
  leadId: string;
  conversationId: string;
}): Promise<number | null> {
  const version = await loadConversationVersion(input.supabase, input.conversationId);
  if (!version) return null;
  await updateReadiness(input.supabase, input.leadId, {
    insights_status: "failed",
    insights_version: null,
    insights_ready_at: null
  });
  return version;
}

export type ConversationReadinessReconciliationResult =
  | {
      action: "insights_marked_ready";
      conversationVersion: number;
    }
  | {
      action: "already_ready";
      conversationVersion: number;
    }
  | {
      action: "skipped";
      reason:
        | "conversation_not_found"
        | "conversation_lead_mismatch"
        | "conversation_version_missing"
        | "transcription_not_completed"
        | "synthesis_not_completed"
        | "transcript_missing"
        | "summary_missing"
        | "readiness_not_latest_conversation"
        | "transcript_readiness_not_current";
    };

export async function reconcileConversationReadinessFromAuthoritativeConversation(input: {
  supabase: SupabaseAdmin;
  leadId: string;
  conversationId: string;
  nowIso?: string;
}): Promise<ConversationReadinessReconciliationResult> {
  const { data: conversation, error } = await (input.supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: {
              id?: string | null;
              lead_id?: string | null;
              conversation_version?: unknown;
              transcription_status?: string | null;
              synthesis_status?: string | null;
            } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("lead_conversations")
    .select("id, lead_id, conversation_version, transcription_status, synthesis_status")
    .eq("id", input.conversationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed loading authoritative conversation.");
  }
  if (!conversation) {
    return { action: "skipped", reason: "conversation_not_found" };
  }
  if (String(conversation.lead_id ?? "").trim() !== input.leadId) {
    return { action: "skipped", reason: "conversation_lead_mismatch" };
  }

  const conversationVersion = toPositiveInt(conversation.conversation_version);
  if (!conversationVersion) {
    return { action: "skipped", reason: "conversation_version_missing" };
  }
  if (normalizeStatusText(conversation.transcription_status) !== "completed") {
    return { action: "skipped", reason: "transcription_not_completed" };
  }
  if (normalizeStatusText(conversation.synthesis_status) !== "completed") {
    return { action: "skipped", reason: "synthesis_not_completed" };
  }

  const [hasTranscript, hasSummary, readiness] = await Promise.all([
    conversationHasNonEmptyColumn(input.supabase, input.conversationId, "transcript"),
    conversationHasNonEmptyColumn(input.supabase, input.conversationId, "summary"),
    loadConversationReadinessState(input.supabase, input.leadId)
  ]);

  if (!hasTranscript) {
    return { action: "skipped", reason: "transcript_missing" };
  }
  if (!hasSummary) {
    return { action: "skipped", reason: "summary_missing" };
  }
  if (readiness.latestConversationVersion !== conversationVersion) {
    return { action: "skipped", reason: "readiness_not_latest_conversation" };
  }
  if (!isVersionReady(readiness.transcriptStatus, readiness.transcriptVersion, conversationVersion)) {
    return { action: "skipped", reason: "transcript_readiness_not_current" };
  }
  if (isVersionReady(readiness.insightsStatus, readiness.insightsVersion, conversationVersion)) {
    return { action: "already_ready", conversationVersion };
  }

  const markedVersion = await markConversationInsightsReady({
    supabase: input.supabase,
    leadId: input.leadId,
    conversationId: input.conversationId,
    nowIso: input.nowIso
  });

  return {
    action: "insights_marked_ready",
    conversationVersion: markedVersion ?? conversationVersion
  };
}

async function ensureReadinessAtLeastVersion(input: {
  supabase: SupabaseAdmin;
  leadId: string;
  version: number;
  nowIso: string;
}) {
  const state = await loadConversationReadinessState(input.supabase, input.leadId);
  if (state.latestConversationVersion >= input.version) return;
  await updateReadiness(input.supabase, input.leadId, {
    latest_conversation_version: input.version,
    latest_audio_finalized_at: input.nowIso
  });
}

async function loadConversationVersion(supabase: SupabaseAdmin, conversationId: string): Promise<number | null> {
  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{ data: { conversation_version?: unknown } | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("lead_conversations")
    .select("conversation_version")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed loading conversation version.");
  }
  return toPositiveInt(data?.conversation_version);
}

async function updateConversationVersion(supabase: SupabaseAdmin, conversationId: string, version: number) {
  const { error } = await (supabase as unknown as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("lead_conversations")
    .update({ conversation_version: version })
    .eq("id", conversationId);
  if (error) {
    throw new Error(error.message ?? "Failed updating conversation version.");
  }
}

async function updateReadiness(supabase: SupabaseAdmin, leadId: string, patch: Record<string, unknown>) {
  const { error } = await (supabase as unknown as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("lead_conversation_readiness")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("lead_id", leadId);
  if (error) {
    throw new Error(error.message ?? "Failed updating conversation readiness.");
  }
}

function isVersionReady(
  status: "pending" | "processing" | "ready" | "failed",
  currentVersion: number | null,
  requiredVersion: number
): boolean {
  return status === "ready" && currentVersion !== null && currentVersion >= requiredVersion && requiredVersion > 0;
}

async function conversationHasNonEmptyColumn(
  supabase: SupabaseAdmin,
  conversationId: string,
  column: "transcript" | "summary"
) {
  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          not: (col: string, op: string, val: unknown) => {
            neq: (col: string, val: unknown) => {
              limit: (count: number) => Promise<{
                data: Array<{ id?: string | null }> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from("lead_conversations")
    .select("id")
    .eq("id", conversationId)
    .not(column, "is", null)
    .neq(column, "")
    .limit(1);

  if (error) {
    throw new Error(error.message ?? "Failed checking conversation content presence.");
  }
  return (data ?? []).length > 0;
}

function normalizeStatusText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}
