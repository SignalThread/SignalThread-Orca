export const CONVERSATION_TRANSCRIPTION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed"
] as const;

export const CONVERSATION_SYNTHESIS_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed"
] as const;

export const CONVERSATION_READINESS_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed"
] as const;

export const CONVERSATION_LIFECYCLE = [
  "uploaded",
  "transcription_queued",
  "transcription_processing",
  "transcription_completed",
  "transcription_failed",
  "no_speech",
  "synthesis_queued",
  "synthesis_processing",
  "synthesis_completed",
  "synthesis_failed",
  "skipped_no_speech",
  "readiness_updated",
  "workflows_resumed"
] as const;

export const EMPTY_TRANSCRIPT_SYNTHESIS_ERROR =
  "Transcript is empty; no speech was detected and conversation insights cannot be generated.";

export const MISSING_STORAGE_TRANSCRIPTION_ERROR =
  "Audio upload is missing a storage path; transcription cannot start.";

export type ConversationDisplayStatusKey =
  | "processing"
  | "transcript_ready"
  | "insights_ready"
  | "no_speech"
  | "failed"
  | "unavailable";

export type ConversationLifecycleSnapshot = {
  transcription_status?: string | null;
  synthesis_status?: string | null;
  transcript?: string | null;
  summary?: string | null;
  transcription_error?: string | null;
  synthesis_error?: string | null;
};

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function hasText(value: unknown) {
  return Boolean(String(value ?? "").trim());
}

export function conversationHasNoSpeech(snapshot: ConversationLifecycleSnapshot | null | undefined) {
  if (!snapshot) return false;
  const ts = normalized(snapshot.transcription_status);
  const ss = normalized(snapshot.synthesis_status);
  const synthesisError = normalized(snapshot.synthesis_error);

  return (
    ts === "completed" &&
    !hasText(snapshot.transcript) &&
    (ss === "failed" || synthesisError.includes("no speech") || synthesisError.includes("empty"))
  );
}

export function deriveConversationDisplayStatus(
  snapshot: ConversationLifecycleSnapshot | null | undefined
): {
  key: ConversationDisplayStatusKey;
  label: string;
  description: string;
} {
  if (!snapshot) {
    return {
      key: "unavailable",
      label: "No conversation",
      description: "No conversation insights yet."
    };
  }

  const ts = normalized(snapshot.transcription_status);
  const ss = normalized(snapshot.synthesis_status);
  const hasTranscript = hasText(snapshot.transcript);
  const hasSummary = hasText(snapshot.summary);

  if (conversationHasNoSpeech(snapshot)) {
    return {
      key: "no_speech",
      label: "No speech detected",
      description: "No speech detected in this recording."
    };
  }

  if (ts === "failed" || ss === "failed") {
    return {
      key: "failed",
      label: "Processing failed",
      description: "We couldn't process this recording. Please try again."
    };
  }

  if (ts === "pending" || ts === "processing") {
    return {
      key: "processing",
      label: "Processing",
      description: "Still processing this recording."
    };
  }

  if (ts === "completed" && (ss === "pending" || ss === "processing") && hasTranscript) {
    return {
      key: "transcript_ready",
      label: "Transcript ready",
      description: "Transcript ready. Generating insights."
    };
  }

  if (ts === "completed" && ss === "completed" && (hasSummary || hasTranscript)) {
    return {
      key: "insights_ready",
      label: "Insights ready",
      description: "Insights ready."
    };
  }

  if (ts === "completed" && hasTranscript) {
    return {
      key: "transcript_ready",
      label: "Transcript ready",
      description: "Transcript ready. Generating insights."
    };
  }

  return {
    key: "unavailable",
    label: "No conversation summary",
    description: "No conversation summary available."
  };
}
