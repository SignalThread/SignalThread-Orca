import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type ParsedContextVoiceNoteCompletePayload = {
  /** True only for V2 context notes with stable client identity (avoid V1 capture dupes). */
  adoptAndSyncConversation: boolean;
  clientLocalNoteId: string | null;
  durationMs: number | null;
};

export type ContextVoiceNoteSnapshot = {
  id: string;
  conversationId: string | null;
  transcript: string | null;
  transcriptionStatus: "pending" | "processing" | "completed" | "failed";
  summary: string | null;
  durationMs: number | null;
  recordedAt: string | null;
  updatedAt: string | null;
  syncStatus: "pending" | "synced";
  syncedAt: string | null;
};

function trimStr(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseContextVoiceNoteFromUploadCompletePayload(
  payload: Record<string, unknown>
): ParsedContextVoiceNoteCompletePayload {
  const clientLocalNoteId = trimStr(
    payload.voiceNoteLocalId ?? payload.voice_note_local_id
  );

  const source = trimStr(
    payload.voiceNoteSource ?? payload.voice_note_source
  ).toLowerCase();

  const durationMs = parseVoiceNoteDurationMs(payload);

  const adoptAndSyncConversation =
    source === "context" && clientLocalNoteId.length > 0;

  return {
    adoptAndSyncConversation,
    clientLocalNoteId:
      adoptAndSyncConversation ? clientLocalNoteId : null,
    durationMs: adoptAndSyncConversation ? durationMs : null
  };
}

function parseVoiceNoteDurationMs(payload: Record<string, unknown>): number | null {
  const msDirect = Number(
    payload.voiceNoteDurationMs ??
      payload.voice_note_duration_ms ??
      payload.durationMs ??
      payload.duration_ms
  );
  if (Number.isFinite(msDirect) && msDirect > 0) {
    return Math.floor(msDirect);
  }

  const sec = Number(
    payload.voiceNoteDurationSeconds ??
      payload.voice_note_duration_seconds ??
      payload.durationSeconds ??
      payload.duration_seconds
  );
  if (Number.isFinite(sec) && sec > 0) {
    return Math.floor(sec * 1000);
  }

  return null;
}

/** R2 object key for the uploaded .m4a (same canonical path as lead_conversations.storage_path). */
export async function adoptContextVoiceNoteFromUpload(input: {
  admin: SupabaseClient<Database>;
  leadId: string;
  createdByUserId: string;
  conversationId: string;
  storagePathAsAudioUrl: string;
  clientLocalNoteId: string;
  durationMs: number | null;
}): Promise<string> {
  const { admin, durationMs } = input;
  const trimmedLocal = trimStr(input.clientLocalNoteId);
  if (!trimmedLocal) {
    throw new Error("adopt_context_voice_note: missing clientLocalNoteId");
  }

  const { data, error } = await admin.rpc("adopt_voice_note_from_upload", {
    p_lead_id: input.leadId,
    p_created_by_user_id: input.createdByUserId,
    p_conversation_id: input.conversationId,
    p_audio_url: trimStr(input.storagePathAsAudioUrl),
    p_source: "context",
    p_client_local_note_id: trimmedLocal,
    p_duration_ms: durationMs ?? null
  });

  const noteId = data != null ? String(data).trim() : "";

  if (error || !noteId) {
    throw new Error(
      error?.message ??
        "adopt_voice_note_from_upload failed or returned no voice note id"
    );
  }

  return noteId;
}

function normalizeTranscriptionStatus(value: unknown): ContextVoiceNoteSnapshot["transcriptionStatus"] {
  const normalized = trimStr(value).toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "processing" ||
    normalized === "completed" ||
    normalized === "failed"
  ) {
    return normalized;
  }
  return "pending";
}

export async function loadContextVoiceNoteSnapshot(input: {
  admin: SupabaseClient<Database>;
  leadId: string;
  voiceNoteId?: string | null;
  conversationId?: string | null;
}): Promise<ContextVoiceNoteSnapshot | null> {
  const noteId = trimStr(input.voiceNoteId);
  const conversationId = trimStr(input.conversationId);
  if (!noteId && !conversationId) {
    return null;
  }

  let query = (input.admin as any)
    .from("lead_voice_notes")
    .select(
      "id, conversation_id, transcript, transcription_status, summary, duration_ms, recorded_at, updated_at"
    )
    .eq("lead_id", input.leadId)
    .is("deleted_at", null)
    .limit(1);

  if (noteId) {
    query = query.eq("id", noteId);
  } else {
    query = query.eq("conversation_id", conversationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed loading voice note.");
  }
  if (!data?.id) {
    return null;
  }

  const transcript = trimStr(data.transcript) || null;
  const transcriptionStatus = normalizeTranscriptionStatus(data.transcription_status);
  const conversationIdValue = trimStr(data.conversation_id) || null;
  const updatedAt = trimStr(data.updated_at) || null;

  return {
    id: String(data.id),
    conversationId: conversationIdValue,
    transcript,
    transcriptionStatus,
    summary: trimStr(data.summary) || null,
    durationMs: Number.isFinite(Number(data.duration_ms)) ? Number(data.duration_ms) : null,
    recordedAt: trimStr(data.recorded_at) || null,
    updatedAt,
    syncStatus: conversationIdValue ? "synced" : "pending",
    syncedAt: conversationIdValue ? updatedAt : null
  };
}

export async function syncContextVoiceNoteFromConversationIfNeeded(input: {
  admin: SupabaseClient<Database>;
  leadId: string;
  conversationId: string;
  voiceNoteId?: string | null;
}): Promise<ContextVoiceNoteSnapshot | null> {
  const conversationId = trimStr(input.conversationId);
  if (!conversationId) {
    return loadContextVoiceNoteSnapshot(input);
  }

  const currentSnapshot = await loadContextVoiceNoteSnapshot({
    admin: input.admin,
    leadId: input.leadId,
    voiceNoteId: input.voiceNoteId,
    conversationId
  });

  const { data: conversationRow, error: conversationError } = await (input.admin as any)
    .from("lead_conversations")
    .select("transcript, transcription_status, summary")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    throw new Error(conversationError.message ?? "Failed loading conversation.");
  }

  const transcript = trimStr(conversationRow?.transcript) || "";
  const transcriptionStatus = normalizeTranscriptionStatus(conversationRow?.transcription_status);
  const summary = trimStr(conversationRow?.summary) || null;
  const needsSync =
    transcriptionStatus === "completed" &&
    transcript.length > 0 &&
    (!currentSnapshot ||
      currentSnapshot.transcriptionStatus !== "completed" ||
      trimStr(currentSnapshot.transcript) !== transcript ||
      (summary && trimStr(currentSnapshot.summary) !== summary));

  if (!needsSync) {
    return currentSnapshot;
  }

  const { data: syncedCount, error: syncError } = await input.admin.rpc(
    "sync_voice_notes_from_conversation",
    {
      p_conversation_id: conversationId,
      p_transcript: transcript,
      p_transcription_status: transcriptionStatus,
      p_note_summary: summary
    }
  );

  if (syncError) {
    throw new Error(syncError.message ?? "Failed syncing voice note from conversation.");
  }

  if (Number(syncedCount ?? 0) < 1) {
    throw new Error("Failed syncing voice note from conversation.");
  }

  return loadContextVoiceNoteSnapshot({
    admin: input.admin,
    leadId: input.leadId,
    voiceNoteId: input.voiceNoteId,
    conversationId
  });
}
