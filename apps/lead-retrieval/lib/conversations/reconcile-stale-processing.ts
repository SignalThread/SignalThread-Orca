import {
  EMPTY_TRANSCRIPT_SYNTHESIS_ERROR,
  MISSING_STORAGE_TRANSCRIPTION_ERROR
} from "@/lib/conversations/conversation-lifecycle";

type SupabaseAdmin = {
  from: (table: string) => unknown;
};

type StaleConversationRow = {
  id: string;
  lead_id: string;
  storage_path: string | null;
  content_type: string | null;
  transcription_status: string | null;
  synthesis_status: string | null;
  transcript: string | null;
  summary: string | null;
  created_at: string | null;
  transcribed_at?: string | null;
};

export type StaleConversationProcessingAction =
  | {
      action: "requeued";
      conversationId: string;
      leadId: string;
      status: string | null;
      createdAt: string | null;
    }
  | {
      action: "marked_failed_missing_storage_path";
      conversationId: string;
      leadId: string;
      status: string | null;
      createdAt: string | null;
    }
  | {
      action: "synthesis_requeued";
      conversationId: string;
      leadId: string;
      status: string | null;
      createdAt: string | null;
      transcribedAt: string | null;
    }
  | {
      action: "marked_failed_missing_transcript";
      conversationId: string;
      leadId: string;
      status: string | null;
      createdAt: string | null;
      transcribedAt: string | null;
    }
  | {
      action: "failed_requeue_error";
      conversationId: string;
      leadId: string;
      status: string | null;
      createdAt: string | null;
      message: string;
    }
  | {
      action: "synthesis_failed_requeue_error";
      conversationId: string;
      leadId: string;
      status: string | null;
      createdAt: string | null;
      transcribedAt: string | null;
      message: string;
    };

export type StaleConversationProcessingResult = {
  scanned: number;
  attempted: number;
  actions: StaleConversationProcessingAction[];
  error: string | null;
  timedOut: boolean;
};

type ConversationProcessor = (input: {
  conversationId: string;
  leadId: string;
  storagePath: string;
  contentType: string;
}) => Promise<unknown>;

type ConversationSynthesisProcessor = (input: {
  conversationId: string;
  leadId: string;
  transcriptText: string;
}) => Promise<unknown>;

export const STALE_CONVERSATION_PROCESSING_MS = 10 * 60 * 1000;
export const DEFAULT_CONVERSATION_RECONCILE_BATCH_LIMIT = 10;
export const DEFAULT_CONVERSATION_RECONCILE_MAX_RUNTIME_MS = 20_000;

const SAFE_TRANSCRIPTION_RECOVERY_ERROR = "Conversation transcription recovery failed.";
const SAFE_SYNTHESIS_RECOVERY_ERROR = "Conversation synthesis recovery failed.";

function staleCutoffIso(nowIso: string, staleAfterMs: number) {
  return new Date(new Date(nowIso).getTime() - staleAfterMs).toISOString();
}

function normalizeContentType(value: string | null) {
  return value && value.trim() ? value.trim() : "audio/m4a";
}

export async function reconcileStaleConversationProcessing(input: {
  supabase: SupabaseAdmin;
  nowIso?: string;
  staleAfterMs?: number;
  limit?: number;
  maxRuntimeMs?: number;
  processor?: ConversationProcessor;
  synthesisProcessor?: ConversationSynthesisProcessor;
}): Promise<StaleConversationProcessingResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const staleAfterMs = input.staleAfterMs ?? STALE_CONVERSATION_PROCESSING_MS;
  const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_CONVERSATION_RECONCILE_BATCH_LIMIT));
  const maxRuntimeMs = Math.max(
    1_000,
    Math.floor(input.maxRuntimeMs ?? DEFAULT_CONVERSATION_RECONCILE_MAX_RUNTIME_MS)
  );
  const processor = input.processor ?? defaultConversationProcessor;
  const synthesisProcessor =
    input.synthesisProcessor ?? defaultConversationSynthesisProcessor;
  const cutoffIso = staleCutoffIso(nowIso, staleAfterMs);
  const startedAt = Date.now();
  let attempted = 0;
  let timedOut = false;

  function hasRuntime() {
    timedOut = Date.now() - startedAt >= maxRuntimeMs;
    return !timedOut;
  }

  const { data, error } = await (input.supabase as any)
    .from("lead_conversations")
    .select(
      "id, lead_id, storage_path, content_type, transcription_status, synthesis_status, transcript, summary, created_at"
    )
    .in("transcription_status", ["pending", "processing"])
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return {
      scanned: 0,
      attempted,
      actions: [],
      error: "Failed to load stale conversation processing rows.",
      timedOut
    };
  }

  const rows = (data ?? []) as StaleConversationRow[];
  const actions: StaleConversationProcessingAction[] = [];

  for (const row of rows) {
    if (!hasRuntime()) break;
    const conversationId = String(row.id ?? "").trim();
    const leadId = String(row.lead_id ?? "").trim();
    const storagePath = String(row.storage_path ?? "").trim();
    if (!conversationId || !leadId) continue;
    attempted += 1;

    if (!storagePath) {
      await markConversationMissingStoragePathFailed(input.supabase, conversationId);
      actions.push({
        action: "marked_failed_missing_storage_path",
        conversationId,
        leadId,
        status: row.transcription_status,
        createdAt: row.created_at
      });
      continue;
    }

    try {
      await processor({
        conversationId,
        leadId,
        storagePath,
        contentType: normalizeContentType(row.content_type)
      });
      actions.push({
        action: "requeued",
        conversationId,
        leadId,
        status: row.transcription_status,
        createdAt: row.created_at
      });
    } catch (rowError) {
      logRecoveryRowError("transcription", rowError, {
        conversationId,
        leadId,
        status: row.transcription_status,
        createdAt: row.created_at,
        transcribedAt: null
      });
      await markConversationTranscriptionFailed(
        input.supabase,
        conversationId,
        SAFE_TRANSCRIPTION_RECOVERY_ERROR
      );
      actions.push({
        action: "failed_requeue_error",
        conversationId,
        leadId,
        status: row.transcription_status,
        createdAt: row.created_at,
        message: SAFE_TRANSCRIPTION_RECOVERY_ERROR
      });
    }
  }

  const {
    data: synthesisData,
    error: synthesisError
  } = await (input.supabase as any)
    .from("lead_conversations")
    .select(
      "id, lead_id, transcription_status, synthesis_status, transcript, summary, created_at, transcribed_at"
    )
    .eq("transcription_status", "completed")
    .in("synthesis_status", ["pending", "processing"])
    .lte("transcribed_at", cutoffIso)
    .order("transcribed_at", { ascending: true })
    .limit(limit);

  if (synthesisError) {
    return {
      scanned: rows.length,
      attempted,
      actions,
      error: "Failed to load stale conversation synthesis rows.",
      timedOut
    };
  }

  const synthesisRows = (synthesisData ?? []) as StaleConversationRow[];
  for (const row of synthesisRows) {
    if (!hasRuntime()) break;
    const conversationId = String(row.id ?? "").trim();
    const leadId = String(row.lead_id ?? "").trim();
    const transcriptText = String(row.transcript ?? "").trim();
    if (!conversationId || !leadId) continue;
    attempted += 1;

    if (!transcriptText) {
      await markConversationSynthesisFailed(
        input.supabase,
        conversationId,
        EMPTY_TRANSCRIPT_SYNTHESIS_ERROR
      );
      actions.push({
        action: "marked_failed_missing_transcript",
        conversationId,
        leadId,
        status: row.synthesis_status,
        createdAt: row.created_at,
        transcribedAt: row.transcribed_at ?? null
      });
      continue;
    }

    try {
      await synthesisProcessor({
        conversationId,
        leadId,
        transcriptText
      });
      actions.push({
        action: "synthesis_requeued",
        conversationId,
        leadId,
        status: row.synthesis_status,
        createdAt: row.created_at,
        transcribedAt: row.transcribed_at ?? null
      });
    } catch (rowError) {
      logRecoveryRowError("synthesis", rowError, {
        conversationId,
        leadId,
        status: row.synthesis_status,
        createdAt: row.created_at,
        transcribedAt: row.transcribed_at ?? null
      });
      await markConversationSynthesisFailed(
        input.supabase,
        conversationId,
        SAFE_SYNTHESIS_RECOVERY_ERROR
      );
      actions.push({
        action: "synthesis_failed_requeue_error",
        conversationId,
        leadId,
        status: row.synthesis_status,
        createdAt: row.created_at,
        transcribedAt: row.transcribed_at ?? null,
        message: SAFE_SYNTHESIS_RECOVERY_ERROR
      });
    }
  }

  return {
    scanned: rows.length + synthesisRows.length,
    attempted,
    actions,
    error: null,
    timedOut
  };
}

function logRecoveryRowError(
  lane: "transcription" | "synthesis",
  error: unknown,
  metadata: {
    conversationId: string;
    leadId: string;
    status: string | null;
    createdAt: string | null;
    transcribedAt: string | null;
  }
) {
  console.warn("[conversations/reconcile] row recovery failed", {
    lane,
    conversationId: metadata.conversationId,
    leadId: metadata.leadId,
    status: metadata.status,
    createdAt: metadata.createdAt,
    transcribedAt: metadata.transcribedAt,
    errorType: error instanceof Error ? "Error" : typeof error
  });
}

async function defaultConversationProcessor(input: {
  conversationId: string;
  leadId: string;
  storagePath: string;
  contentType: string;
}) {
  const { processConversationUpload } = await import("@/lib/conversations/process-upload");
  return processConversationUpload(input);
}

async function defaultConversationSynthesisProcessor(input: {
  conversationId: string;
  leadId: string;
  transcriptText: string;
}) {
  const { processConversationSynthesisForCompletedTranscript } = await import(
    "@/lib/conversations/process-upload"
  );
  return processConversationSynthesisForCompletedTranscript(input);
}

async function markConversationMissingStoragePathFailed(
  supabase: SupabaseAdmin,
  conversationId: string
) {
  await (supabase as unknown as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, value: string) => Promise<{ error: { message?: string } | null }>;
      };
    };
  })
    .from("lead_conversations")
    .update({
      transcription_status: "failed",
      transcription_error: MISSING_STORAGE_TRANSCRIPTION_ERROR,
      transcribed_at: null,
      synthesis_status: "failed",
      synthesis_error: MISSING_STORAGE_TRANSCRIPTION_ERROR,
      synthesized_at: null
    })
    .eq("id", conversationId);
}

async function markConversationTranscriptionFailed(
  supabase: SupabaseAdmin,
  conversationId: string,
  message: string
) {
  await (supabase as unknown as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, value: string) => Promise<{ error: { message?: string } | null }>;
      };
    };
  })
    .from("lead_conversations")
    .update({
      transcription_status: "failed",
      transcription_error: message,
      transcribed_at: null,
      synthesis_status: "failed",
      synthesis_error: message,
      synthesized_at: null
    })
    .eq("id", conversationId);
}

async function markConversationSynthesisFailed(
  supabase: SupabaseAdmin,
  conversationId: string,
  message: string
) {
  await (supabase as unknown as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, value: string) => Promise<{ error: { message?: string } | null }>;
      };
    };
  })
    .from("lead_conversations")
    .update({
      synthesis_status: "failed",
      synthesis_error: message,
      synthesized_at: null
    })
    .eq("id", conversationId);
}
