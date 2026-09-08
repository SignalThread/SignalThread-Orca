/**
 * Lead audio lifecycle journey — the Nick-incident regression lane, journey-framed.
 *
 * Granular reconciler/lifecycle behavior is exhaustively covered by
 * `tests/conversation-processing-lifecycle.test.ts`. This journey test ties those canonical
 * pieces into one product chain and asserts the journey-grade properties the incident exposed:
 *   upload → conversation row → transcription → synthesis → readiness → **truthful terminal
 *   display state**, with no row left reporting indefinite "processing".
 *
 * It drives the REAL canonical reconciler (`reconcileStaleConversationProcessing`) against the
 * in-memory `fake-supabase` shim (the established pattern) and uses the REAL display derivation
 * (`deriveConversationDisplayStatus`) so the API/UI-visible truth is asserted directly. No audio
 * or transcript contents are logged. A real upload+provider path is opt-in/skipped (see bottom).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  reconcileStaleConversationProcessing,
  STALE_CONVERSATION_PROCESSING_MS,
} from "@/lib/conversations/reconcile-stale-processing";
import {
  deriveConversationDisplayStatus,
  conversationHasNoSpeech,
  EMPTY_TRANSCRIPT_SYNTHESIS_ERROR,
} from "@/lib/conversations/conversation-lifecycle";
import { runConversationReadinessSideEffect } from "@/lib/conversations/readiness-side-effects";
import { asAdminClient, createFakeSupabase } from "../helpers/fake-supabase";
import { createTestRunId } from "../helpers/journey-fixtures";

// Deterministic clock for stale calculations (fixed strings; no wall-clock).
const CREATED_AT = "2026-06-29T12:00:00.000Z";
const TRANSCRIBED_AT = "2026-06-29T12:01:00.000Z";
const NOW_STALE = "2026-06-29T12:20:00.000Z"; // 20 min later → past the 10 min stale threshold

describe("lead audio lifecycle journey — display state is truthful across the chain", () => {
  it("reports processing only while transcription is pending/processing, never after terminal", () => {
    assert.equal(
      deriveConversationDisplayStatus({ transcription_status: "pending", synthesis_status: "pending" }).key,
      "processing"
    );
    assert.equal(
      deriveConversationDisplayStatus({ transcription_status: "processing", synthesis_status: "pending" }).key,
      "processing"
    );
    // Transcript done, insights pending → "transcript_ready" (visible progress, NOT indefinite processing).
    assert.equal(
      deriveConversationDisplayStatus({
        transcription_status: "completed",
        synthesis_status: "pending",
        transcript: "hello",
      }).key,
      "transcript_ready"
    );
    // Terminal: both completed with a summary → insights_ready, and never "processing".
    const terminal = deriveConversationDisplayStatus({
      transcription_status: "completed",
      synthesis_status: "completed",
      transcript: "hello",
      summary: "summary",
    });
    assert.equal(terminal.key, "insights_ready");
    assert.notEqual(terminal.key, "processing");
  });

  it("maps an empty / no-speech recording to a safe terminal state without internal leakage", () => {
    const snapshot = {
      transcription_status: "completed",
      synthesis_status: "failed",
      transcript: "",
      synthesis_error: EMPTY_TRANSCRIPT_SYNTHESIS_ERROR,
    };
    assert.equal(conversationHasNoSpeech(snapshot), true);
    const display = deriveConversationDisplayStatus(snapshot);
    assert.equal(display.key, "no_speech");
    assert.notEqual(display.key, "processing");
    // User-facing copy must not leak provider/internal detail.
    assert.doesNotMatch(display.description, /provider|stack|secret|null|undefined/i);
  });

  it("maps a hard failure to a terminal failed state, not stuck processing", () => {
    const display = deriveConversationDisplayStatus({
      transcription_status: "failed",
      synthesis_status: "failed",
      transcription_error: "Conversation transcription recovery failed.",
    });
    assert.equal(display.key, "failed");
    assert.notEqual(display.key, "processing");
  });
});

describe("lead audio lifecycle journey — reconciler clears stuck processing", () => {
  it("recovers a completed transcript with pending synthesis WITHOUT overwriting the transcript", async () => {
    const runId = createTestRunId();
    const transcriptText = "completed transcript text"; // not logged
    const fake = createFakeSupabase({
      lead_conversations: [
        {
          id: `conv-${runId}`,
          lead_id: `lead-${runId}`,
          storage_path: `conversations/lead-${runId}/audio.m4a`,
          content_type: "audio/m4a",
          transcription_status: "completed",
          synthesis_status: "pending",
          transcript: transcriptText,
          summary: null,
          created_at: CREATED_AT,
          transcribed_at: TRANSCRIBED_AT,
        },
      ],
    });

    let transcriptionInvoked = false;
    const synthesisInputs: Array<{ conversationId: string; leadId: string; transcriptText: string }> = [];

    const result = await reconcileStaleConversationProcessing({
      supabase: asAdminClient<any>(fake),
      nowIso: NOW_STALE,
      staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
      processor: async () => {
        transcriptionInvoked = true; // must NOT run — transcript already exists
      },
      synthesisProcessor: async (input: any) => {
        synthesisInputs.push(input);
      },
    });

    assert.equal(result.error, null);
    assert.equal(transcriptionInvoked, false, "transcription must not re-run for a completed transcript");
    assert.equal(synthesisInputs.length, 1);
    assert.equal(synthesisInputs[0].transcriptText, transcriptText); // existing transcript reused
    assert.equal(result.actions[0]?.action, "synthesis_requeued");
    // Transcript preserved on the row (not overwritten by recovery).
    assert.equal(fake._tables.lead_conversations[0]?.transcript, transcriptText);
    assert.equal(fake._tables.lead_conversations[0]?.transcription_status, "completed");
  });

  it("requeues a stale pending recording that has uploaded audio (no terminal stuck state remains)", async () => {
    const runId = createTestRunId();
    const fake = createFakeSupabase({
      lead_conversations: [
        {
          id: `conv-${runId}`,
          lead_id: `lead-${runId}`,
          storage_path: `conversations/lead-${runId}/audio.m4a`,
          content_type: "audio/m4a",
          transcription_status: "pending",
          synthesis_status: "pending",
          transcript: null,
          summary: null,
          created_at: CREATED_AT,
        },
      ],
    });

    let processed = 0;
    const result = await reconcileStaleConversationProcessing({
      supabase: asAdminClient<any>(fake),
      nowIso: NOW_STALE,
      staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
      processor: async () => {
        processed += 1;
      },
    });

    assert.equal(result.error, null);
    assert.equal(result.scanned, 1);
    assert.equal(processed, 1, "stale pending recording must be reprocessed by the canonical processor");
    assert.ok(result.actions.length >= 1, "reconciler must record a recovery action for the stale row");
  });

  it("marks a stale pending recording with no storage path as failed with a safe reason", async () => {
    const runId = createTestRunId();
    const fake = createFakeSupabase({
      lead_conversations: [
        {
          id: `conv-${runId}`,
          lead_id: `lead-${runId}`,
          storage_path: null,
          content_type: "audio/m4a",
          transcription_status: "pending",
          synthesis_status: "pending",
          transcript: null,
          summary: null,
          created_at: CREATED_AT,
        },
      ],
    });

    const result = await reconcileStaleConversationProcessing({
      supabase: asAdminClient<any>(fake),
      nowIso: NOW_STALE,
      staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
      processor: async () => {
        assert.fail("processor must not run without a storage path");
      },
    });

    assert.equal(result.error, null);
    const row = fake._tables.lead_conversations[0];
    assert.equal(row?.transcription_status, "failed");
    // Terminal failed → display is truthful, not stuck processing.
    assert.equal(deriveConversationDisplayStatus(row as any).key, "failed");
    // No raw secret/provider text leaked into the persisted error.
    assert.doesNotMatch(String(row?.transcription_error ?? ""), /secret|stack|token|key=/i);
  });
});

describe("lead audio lifecycle journey — non-critical side effects do not block the lifecycle", () => {
  it("a failing readiness side effect is swallowed (warned) and does not abort transcription", async () => {
    const warnings: unknown[] = [];
    const ok = await runConversationReadinessSideEffect(
      "audio_finalized",
      async () => {
        throw new Error("readiness table missing");
      },
      { warn: (...args: unknown[]) => warnings.push(args) }
    );
    assert.equal(ok, false);
    assert.equal(warnings.length, 1);
  });
});

// Opt-in real upload + provider path. There is no sandbox transcription/synthesis provider in
// the node:test lane, and the upload route is auth/`server-only`. The lifecycle above drives the
// real reconciler against fake-supabase; an end-to-end real-provider run belongs to the /e2e lane.
describe(
  "lead audio lifecycle journey — live upload through real providers",
  { skip: "Blocked in node:test: no sandbox transcription/synthesis provider and the upload route is server-only/auth. Covered via the real reconciler over fake-supabase here; real-provider E2E belongs to the Playwright /e2e lane. See JOURNEY_MATRIX.md journey 5." },
  () => {
    it("uploads audio and reaches terminal synthesis", () => {
      assert.fail("unreachable — documented provider gap");
    });
  }
);
