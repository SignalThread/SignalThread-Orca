import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  reconcileStaleConversationProcessing,
  DEFAULT_CONVERSATION_RECONCILE_BATCH_LIMIT,
  STALE_CONVERSATION_PROCESSING_MS
} from "@/lib/conversations/reconcile-stale-processing";
import { runConversationReadinessSideEffect } from "@/lib/conversations/readiness-side-effects";
import {
  deriveConversationDisplayStatus,
  EMPTY_TRANSCRIPT_SYNTHESIS_ERROR
} from "@/lib/conversations/conversation-lifecycle";
import { checkConversationLifecycleEnv } from "@/scripts/check-conversation-lifecycle-env";
import { loadSafeCanaryState } from "@/scripts/conversation-audio-canary";
import { countWorkflowConversationWaitsByReason } from "@/scripts/verify-conversation-processing-status";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("readiness side effect failures do not abort the recording lifecycle", async () => {
  const warnings: unknown[] = [];
  const ok = await runConversationReadinessSideEffect(
    "audio_finalized",
    async () => {
      throw new Error("readiness table missing");
    },
    {
      warn: (...args: unknown[]) => warnings.push(args)
    }
  );

  assert.equal(ok, false);
  assert.equal(warnings.length, 1);
});

test("stale pending recording with uploaded audio is requeued through the canonical processor", async () => {
  const fake = createFakeSupabase({
    lead_conversations: [
      {
        id: "conversation-1",
        lead_id: "lead-1",
        storage_path: "conversations/lead-1/audio.m4a",
        content_type: "audio/m4a",
        transcription_status: "pending",
        synthesis_status: "pending",
        transcript: null,
        summary: null,
        created_at: "2026-06-29T12:00:00.000Z"
      }
    ]
  });
  const processed: unknown[] = [];

  const result = await reconcileStaleConversationProcessing({
    supabase: asAdminClient<any>(fake),
    nowIso: "2026-06-29T12:20:00.000Z",
    staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
    processor: async (input) => {
      processed.push(input);
    }
  });

  assert.equal(result.error, null);
  assert.equal(result.scanned, 1);
  assert.equal(result.attempted, 1);
  assert.equal(result.timedOut, false);
  assert.deepEqual(processed, [
    {
      conversationId: "conversation-1",
      leadId: "lead-1",
      storagePath: "conversations/lead-1/audio.m4a",
      contentType: "audio/m4a"
    }
  ]);
  assert.equal(result.actions[0]?.action, "requeued");
});

test("completed transcript with pending synthesis is requeued through synthesis only", async () => {
  const fake = createFakeSupabase({
    lead_conversations: [
      {
        id: "conversation-synthesis-1",
        lead_id: "lead-synthesis-1",
        storage_path: "conversations/lead-synthesis-1/audio.m4a",
        content_type: "audio/m4a",
        transcription_status: "completed",
        synthesis_status: "pending",
        transcript: "completed transcript text",
        summary: null,
        created_at: "2026-06-29T12:00:00.000Z",
        transcribed_at: "2026-06-29T12:01:00.000Z"
      }
    ]
  });
  const synthesized: unknown[] = [];
  let transcribed = false;

  const result = await reconcileStaleConversationProcessing({
    supabase: asAdminClient<any>(fake),
    nowIso: "2026-06-29T12:20:00.000Z",
    staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
    processor: async () => {
      transcribed = true;
    },
    synthesisProcessor: async (input) => {
      synthesized.push(input);
    }
  });

  assert.equal(result.error, null);
  assert.equal(result.scanned, 1);
  assert.equal(transcribed, false);
  assert.deepEqual(synthesized, [
    {
      conversationId: "conversation-synthesis-1",
      leadId: "lead-synthesis-1",
      transcriptText: "completed transcript text"
    }
  ]);
  assert.equal(result.actions[0]?.action, "synthesis_requeued");
});

test("reconciler handles bounded batches and per-row processor failures", async () => {
  const rows = Array.from({ length: DEFAULT_CONVERSATION_RECONCILE_BATCH_LIMIT + 2 }, (_, index) => ({
    id: `conversation-batch-${index}`,
    lead_id: `lead-batch-${index}`,
    storage_path: `conversations/lead-batch-${index}/audio.m4a`,
    content_type: "audio/m4a",
    transcription_status: "pending",
    synthesis_status: "pending",
    transcript: null,
    summary: null,
    created_at: "2026-06-29T12:00:00.000Z"
  }));
  const fake = createFakeSupabase({ lead_conversations: rows });
  let processed = 0;

  const result = await reconcileStaleConversationProcessing({
    supabase: asAdminClient<any>(fake),
    nowIso: "2026-06-29T12:20:00.000Z",
    staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
    processor: async (input) => {
      processed += 1;
      if (input.conversationId === "conversation-batch-1") {
        throw new Error("synthetic processor failure with transcript-ish secret text");
      }
    }
  });

  assert.equal(result.error, null);
  assert.equal(result.attempted, DEFAULT_CONVERSATION_RECONCILE_BATCH_LIMIT);
  assert.equal(processed, DEFAULT_CONVERSATION_RECONCILE_BATCH_LIMIT);
  assert.equal(result.actions.length, DEFAULT_CONVERSATION_RECONCILE_BATCH_LIMIT);
  const failedAction = result.actions[1];
  assert.equal(failedAction?.action, "failed_requeue_error");
  if (failedAction?.action !== "failed_requeue_error") {
    assert.fail("Expected transcription recovery failure action");
  }
  assert.equal(failedAction.message, "Conversation transcription recovery failed.");
  assert.equal("error" in failedAction, false);
  assert.doesNotMatch(
    JSON.stringify(failedAction),
    /synthetic processor failure|transcript-ish secret text/i
  );
  assert.equal(fake._tables.lead_conversations[1]?.transcription_status, "failed");
  assert.equal(fake._tables.lead_conversations[1]?.synthesis_status, "failed");
  assert.equal(
    fake._tables.lead_conversations[1]?.transcription_error,
    "Conversation transcription recovery failed."
  );
  assert.equal(
    fake._tables.lead_conversations[1]?.synthesis_error,
    "Conversation transcription recovery failed."
  );
});

test("reconciler synthesis failures persist and return only stable safe messages", async () => {
  const fake = createFakeSupabase({
    lead_conversations: [
      {
        id: "conversation-synthesis-failure",
        lead_id: "lead-synthesis-failure",
        storage_path: "conversations/lead-synthesis-failure/audio.m4a",
        content_type: "audio/m4a",
        transcription_status: "completed",
        synthesis_status: "pending",
        transcript: "completed transcript text",
        summary: null,
        created_at: "2026-06-29T12:00:00.000Z",
        transcribed_at: "2026-06-29T12:01:00.000Z"
      }
    ]
  });

  const result = await reconcileStaleConversationProcessing({
    supabase: asAdminClient<any>(fake),
    nowIso: "2026-06-29T12:20:00.000Z",
    staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
    synthesisProcessor: async () => {
      throw new Error("provider exploded with raw details that must not persist");
    }
  });

  assert.equal(result.error, null);
  const failedAction = result.actions[0];
  assert.equal(failedAction?.action, "synthesis_failed_requeue_error");
  if (failedAction?.action !== "synthesis_failed_requeue_error") {
    assert.fail("Expected synthesis recovery failure action");
  }
  assert.equal(failedAction.message, "Conversation synthesis recovery failed.");
  assert.equal("error" in failedAction, false);
  assert.doesNotMatch(
    JSON.stringify(failedAction),
    /provider exploded|raw details/i
  );
  assert.equal(fake._tables.lead_conversations[0]?.synthesis_status, "failed");
  assert.equal(
    fake._tables.lead_conversations[0]?.synthesis_error,
    "Conversation synthesis recovery failed."
  );
});

test("completed transcript row with empty transcript marks synthesis failed safely", async () => {
  const fake = createFakeSupabase({
    lead_conversations: [
      {
        id: "conversation-synthesis-2",
        lead_id: "lead-synthesis-2",
        storage_path: "conversations/lead-synthesis-2/audio.m4a",
        content_type: "audio/m4a",
        transcription_status: "completed",
        synthesis_status: "pending",
        transcript: "   ",
        summary: null,
        created_at: "2026-06-29T12:00:00.000Z",
        transcribed_at: "2026-06-29T12:01:00.000Z"
      }
    ]
  });
  let synthesized = false;

  const result = await reconcileStaleConversationProcessing({
    supabase: asAdminClient<any>(fake),
    nowIso: "2026-06-29T12:20:00.000Z",
    staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
    synthesisProcessor: async () => {
      synthesized = true;
    }
  });

  assert.equal(result.error, null);
  assert.equal(result.actions[0]?.action, "marked_failed_missing_transcript");
  assert.equal(synthesized, false);
  assert.equal(fake._tables.lead_conversations[0]?.synthesis_status, "failed");
  assert.match(
    String(fake._tables.lead_conversations[0]?.synthesis_error ?? ""),
    /no speech was detected/
  );
});

test("fresh completed transcript is not synthesized before the stale threshold", async () => {
  const fake = createFakeSupabase({
    lead_conversations: [
      {
        id: "conversation-synthesis-3",
        lead_id: "lead-synthesis-3",
        storage_path: "conversations/lead-synthesis-3/audio.m4a",
        content_type: "audio/m4a",
        transcription_status: "completed",
        synthesis_status: "pending",
        transcript: "completed transcript text",
        summary: null,
        created_at: "2026-06-29T12:00:00.000Z",
        transcribed_at: "2026-06-29T12:15:00.000Z"
      }
    ]
  });
  let synthesized = false;

  const result = await reconcileStaleConversationProcessing({
    supabase: asAdminClient<any>(fake),
    nowIso: "2026-06-29T12:20:00.000Z",
    staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
    synthesisProcessor: async () => {
      synthesized = true;
    }
  });

  assert.equal(result.error, null);
  assert.equal(result.scanned, 0);
  assert.equal(synthesized, false);
});

test("stale pending recording without a storage path is marked failed with a safe reason", async () => {
  const fake = createFakeSupabase({
    lead_conversations: [
      {
        id: "conversation-2",
        lead_id: "lead-2",
        storage_path: null,
        content_type: null,
        transcription_status: "pending",
        synthesis_status: "pending",
        transcript: null,
        summary: null,
        created_at: "2026-06-29T12:00:00.000Z"
      }
    ]
  });

  const result = await reconcileStaleConversationProcessing({
    supabase: asAdminClient<any>(fake),
    nowIso: "2026-06-29T12:20:00.000Z",
    staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
    processor: async () => {
      throw new Error("processor should not run without storage");
    }
  });

  assert.equal(result.error, null);
  assert.equal(result.actions[0]?.action, "marked_failed_missing_storage_path");
  assert.equal(fake._tables.lead_conversations[0]?.transcription_status, "failed");
  assert.equal(fake._tables.lead_conversations[0]?.synthesis_status, "failed");
  assert.match(
    String(fake._tables.lead_conversations[0]?.transcription_error ?? ""),
    /missing a storage path/
  );
});

test("fresh pending recording is not retried before the stale threshold", async () => {
  const fake = createFakeSupabase({
    lead_conversations: [
      {
        id: "conversation-3",
        lead_id: "lead-3",
        storage_path: "conversations/lead-3/audio.m4a",
        content_type: "audio/m4a",
        transcription_status: "pending",
        synthesis_status: "pending",
        transcript: null,
        summary: null,
        created_at: "2026-06-29T12:15:00.000Z"
      }
    ]
  });
  let processed = false;

  const result = await reconcileStaleConversationProcessing({
    supabase: asAdminClient<any>(fake),
    nowIso: "2026-06-29T12:20:00.000Z",
    staleAfterMs: STALE_CONVERSATION_PROCESSING_MS,
    processor: async () => {
      processed = true;
    }
  });

  assert.equal(result.error, null);
  assert.equal(result.scanned, 0);
  assert.equal(processed, false);
});

test("processing lifecycle uses explicit processing state and wrapped readiness side effects", () => {
  const src = readRepoFile("lib/conversations/process-upload.ts");

  assert.match(src, /transcription_status:\s*"processing"/);
  assert.match(src, /processConversationSynthesisForCompletedTranscript/);
  assert.match(src, /synthesizeConversationTranscript/);
  assert.match(src, /EMPTY_TRANSCRIPT_SYNTHESIS_ERROR/);
  assert.match(src, /runConversationReadinessSideEffect\("transcript_ready"/);
  assert.match(src, /runConversationReadinessSideEffect\("transcript_failed"/);
  assert.match(src, /runConversationReadinessSideEffect\("insights_ready"/);
  assert.match(src, /runConversationReadinessSideEffect\("insights_failed"/);
});

test("conversation display status returns friendly user-facing copy without internal leakage", () => {
  const cases = [
    {
      name: "pending transcription",
      snapshot: {
        transcription_status: "pending",
        synthesis_status: "pending",
        transcript: null,
        summary: null
      },
      key: "processing",
      description: "Still processing this recording."
    },
    {
      name: "processing transcription",
      snapshot: {
        transcription_status: "processing",
        synthesis_status: "pending",
        transcript: null,
        summary: null
      },
      key: "processing",
      description: "Still processing this recording."
    },
    {
      name: "completed transcript pending synthesis",
      snapshot: {
        transcription_status: "completed",
        synthesis_status: "pending",
        transcript: "completed transcript text",
        summary: null
      },
      key: "transcript_ready",
      description: "Transcript ready. Generating insights."
    },
    {
      name: "completed transcript processing synthesis",
      snapshot: {
        transcription_status: "completed",
        synthesis_status: "processing",
        transcript: "completed transcript text",
        summary: null
      },
      key: "transcript_ready",
      description: "Transcript ready. Generating insights."
    },
    {
      name: "insights ready",
      snapshot: {
        transcription_status: "completed",
        synthesis_status: "completed",
        transcript: "completed transcript text",
        summary: "Summary exists."
      },
      key: "insights_ready",
      description: "Insights ready."
    },
    {
      name: "no speech",
      snapshot: {
        transcription_status: "completed",
        synthesis_status: "failed",
        transcript: "",
        summary: null,
        synthesis_error: EMPTY_TRANSCRIPT_SYNTHESIS_ERROR
      },
      key: "no_speech",
      description: "No speech detected in this recording."
    },
    {
      name: "missing storage",
      snapshot: {
        transcription_status: "failed",
        synthesis_status: "failed",
        transcript: null,
        summary: null,
        transcription_error: "Audio upload is missing a storage path; transcription cannot start."
      },
      key: "failed",
      description: "We couldn't process this recording. Please try again."
    },
    {
      name: "unknown provider failure",
      snapshot: {
        transcription_status: "completed",
        synthesis_status: "failed",
        transcript: "completed transcript text",
        summary: null,
        synthesis_error: "provider exploded with stack trace"
      },
      key: "failed",
      description: "We couldn't process this recording. Please try again."
    }
  ] as const;

  for (const c of cases) {
    const display = deriveConversationDisplayStatus(c.snapshot);
    assert.equal(display.key, c.key, c.name);
    assert.equal(display.description, c.description, c.name);
    assert.doesNotMatch(
      display.description,
      /transcription_status|synthesis_status|pending|completed|failed|provider|storage path|cannot be generated|Transcript is empty/i,
      c.name
    );
  }
});

test("deploy hardening scripts cover env, schema, canary, and safe aggregates", () => {
  const envScript = readRepoFile("scripts/check-conversation-lifecycle-env.ts");
  const schemaScript = readRepoFile("scripts/check-conversation-lifecycle-schema.ts");
  const canaryScript = readRepoFile("scripts/conversation-audio-canary.ts");
  const aggregateScript = readRepoFile("scripts/verify-conversation-processing-status.ts");
  const pkg = readRepoFile("package.json");

  assert.match(envScript, /WORKFLOW_TICK_SECRET/);
  assert.match(envScript, /CRON_SECRET/);
  assert.match(envScript, /OPENAI_API_KEY/);
  assert.match(envScript, /R2_ENDPOINT/);
  assert.match(schemaScript, /lead_conversation_readiness/);
  assert.match(schemaScript, /conversation_version/);
  assert.match(schemaScript, /workflow_step_runs_wait_columns_exist/);
  assert.match(canaryScript, /api\/conversations\/upload/);
  assert.match(canaryScript, /api\/internal\/workflow-tick/);
  assert.match(canaryScript, /transcriptPresent/);
  assert.doesNotMatch(canaryScript, /console\.log\([^)]*transcript/i);
  assert.match(aggregateScript, /completedTranscriptPendingSynthesis/);
  assert.match(aggregateScript, /readinessMismatchCounts/);
  assert.match(aggregateScript, /workflowWaitsByReason/);
  assert.match(pkg, /conversation:check-env/);
  assert.match(pkg, /conversation:canary/);
});

test("conversation env health check fails closed without exposing secret values", () => {
  const failed = checkConversationLifecycleEnv({
    WORKFLOW_TICK_SECRET: "",
    CRON_SECRET: "",
    OPENAI_API_KEY: "sk-secret-value",
    R2_ENDPOINT: "https://r2.example",
    R2_ACCESS_KEY_ID: "access-secret",
    R2_SECRET_ACCESS_KEY: "storage-secret",
    R2_BUCKET: "bucket",
    SUPABASE_SERVICE_ROLE_KEY: "service-secret",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co"
  });
  assert.equal(failed.ok, false);
  assert.deepEqual(
    failed.missing.map((item) => item.name).sort(),
    ["CRON_SECRET", "WORKFLOW_TICK_SECRET"]
  );
  assert.doesNotMatch(JSON.stringify(failed), /sk-secret-value|storage-secret|service-secret/);

  const passed = checkConversationLifecycleEnv({
    WORKFLOW_TICK_SECRET: "workflow-secret",
    CRON_SECRET: "cron-secret",
    OPENAI_API_KEY: "sk-secret-value",
    R2_ENDPOINT: "https://r2.example",
    R2_ACCESS_KEY_ID: "access-secret",
    R2_SECRET_ACCESS_KEY: "storage-secret",
    R2_BUCKET: "bucket",
    SUPABASE_SERVICE_ROLE_KEY: "service-secret",
    SUPABASE_URL: "https://example.supabase.co"
  });
  assert.equal(passed.ok, true);
});

test("verification script counts workflow waits by wait reason column", async () => {
  const fake = createFakeSupabase({
    workflow_step_runs: [
      {
        id: "step-waiting-audio",
        run_id: "run-1",
        step_id: "step-1",
        step_index: 0,
        step_key: "crm_sync",
        status: "waiting",
        attempt_count: 1,
        waiting_reason: "waiting_for_audio_transcript",
        created_at: "2026-06-29T12:00:00.000Z",
        updated_at: "2026-06-29T12:00:00.000Z"
      },
      {
        id: "step-legacy-insights",
        run_id: "run-1",
        step_id: "step-2",
        step_index: 1,
        step_key: "crm_sync",
        status: "waiting_for_conversation_insights",
        attempt_count: 1,
        waiting_reason: "waiting_for_conversation_insights",
        created_at: "2026-06-29T12:00:00.000Z",
        updated_at: "2026-06-29T12:00:00.000Z"
      },
      {
        id: "step-completed-with-old-reason",
        run_id: "run-1",
        step_id: "step-3",
        step_index: 2,
        step_key: "crm_sync",
        status: "completed",
        attempt_count: 1,
        waiting_reason: "waiting_for_audio_transcript",
        created_at: "2026-06-29T12:00:00.000Z",
        updated_at: "2026-06-29T12:00:00.000Z"
      },
      {
        id: "step-waiting-other-reason",
        run_id: "run-1",
        step_id: "step-4",
        step_index: 3,
        step_key: "crm_sync",
        status: "waiting",
        attempt_count: 1,
        waiting_reason: "waiting_for_external_system",
        created_at: "2026-06-29T12:00:00.000Z",
        updated_at: "2026-06-29T12:00:00.000Z"
      },
      {
        id: "step-other-run",
        run_id: "run-2",
        step_id: "step-5",
        step_index: 0,
        step_key: "crm_sync",
        status: "waiting",
        attempt_count: 1,
        waiting_reason: "waiting_for_audio_transcript",
        created_at: "2026-06-29T12:00:00.000Z",
        updated_at: "2026-06-29T12:00:00.000Z"
      }
    ]
  });

  const waits = await countWorkflowConversationWaitsByReason(asAdminClient<any>(fake), ["run-1"]);

  assert.deepEqual(waits, [
    { reason: "waiting_for_audio_transcript", count: 1 },
    { reason: "waiting_for_conversation_insights", count: 1 }
  ]);
  const waitQuery = fake._calls.find(
    (call) => call.table === "workflow_step_runs" && call.op === "select"
  );
  assert.ok(waitQuery);
  assert.deepEqual(
    waitQuery.filters.map((filter) => filter.col),
    ["run_id", "status", "waiting_reason"]
  );
});

test("conversation audio canary counts generic waiting workflow steps by wait reason", async () => {
  const fake = createFakeSupabase({
    lead_conversations: [
      {
        id: "conversation-canary-1",
        lead_id: "lead-canary-1",
        transcription_status: "completed",
        synthesis_status: "completed",
        transcribed_at: "2026-06-29T12:01:00.000Z",
        synthesized_at: "2026-06-29T12:02:00.000Z",
        transcript: "transcript text should not be printed",
        summary: "summary text should not be printed",
        created_at: "2026-06-29T12:00:00.000Z"
      }
    ],
    lead_conversation_readiness: [
      {
        lead_id: "lead-canary-1",
        transcript_status: "ready",
        insights_status: "ready",
        transcript_version: 1,
        insights_version: 1,
        created_at: "2026-06-29T12:00:00.000Z",
        updated_at: "2026-06-29T12:02:00.000Z"
      }
    ],
    workflow_runs: [
      {
        id: "run-canary-1",
        company_id: "company-1",
        template_id: "template-1",
        template_version: 1,
        lead_id: "lead-canary-1",
        event_id: "event-1",
        trigger_event: "lead_captured",
        trigger_payload_jsonb: {},
        status: "waiting",
        current_step_index: 0,
        started_at: "2026-06-29T12:00:00.000Z",
        completed_at: null,
        created_at: "2026-06-29T12:00:00.000Z",
        updated_at: "2026-06-29T12:01:00.000Z"
      }
    ],
    workflow_step_runs: [
      {
        id: "step-canary-waiting-audio",
        run_id: "run-canary-1",
        step_id: "step-1",
        step_index: 0,
        step_key: "crm_sync",
        status: "waiting",
        attempt_count: 1,
        waiting_reason: "waiting_for_audio_transcript",
        created_at: "2026-06-29T12:00:00.000Z",
        updated_at: "2026-06-29T12:01:00.000Z"
      }
    ]
  });

  const state = await loadSafeCanaryState({
    supabase: asAdminClient<any>(fake),
    leadId: "lead-canary-1",
    conversationId: "conversation-canary-1"
  });

  assert.equal(state.waitingWorkflowCount, 1);
  assert.equal("transcript" in state, false);
  assert.equal("summary" in state, false);
});

test("worker tick includes stale conversation processing reconciliation", () => {
  const src = readRepoFile("app/api/internal/workflow-tick/route.ts");

  assert.match(src, /reconcileStaleConversationProcessing/);
  assert.match(src, /conversationProcessingReconciler/);
});

test("schema repair preserves processing lifecycle source of truth", () => {
  const src = readRepoFile("supabase/migrations/0090_conversation_processing_recovery.sql");

  assert.match(src, /lead_conversation_readiness/);
  assert.match(src, /conversation_version int/);
  assert.match(src, /'pending', 'processing', 'completed', 'failed'/);
  assert.match(src, /waiting_for_audio_transcript/);
  assert.match(src, /waiting_for_conversation_insights/);
});

test("lead detail treats active transcription or synthesis processing as pending, not completed", () => {
  const src = readRepoFile("app/(app)/exhibitor/leads/[leadId]/page.tsx");

  assert.match(src, /ts === "processing"/);
  assert.match(src, /ss === "processing"/);
});
