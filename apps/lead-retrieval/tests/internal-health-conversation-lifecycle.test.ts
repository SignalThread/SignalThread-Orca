import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  authorizeInternalHealthRequest,
  signInternalHealthPath
} from "@/lib/internal-health/internal-health-auth";
import {
  getLeadRetrievalConversationLifecycleHealth,
  STALE_SYNTHESIS_MINUTES,
  STALE_TRANSCRIPTION_MINUTES
} from "@/lib/internal-health/lead-retrieval/conversation-lifecycle";
import { reconcileConversationReadinessFromAuthoritativeConversation } from "@/lib/conversations/conversation-readiness";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

const PATHNAME = "/api/internal/health/lead-retrieval/conversation-lifecycle";
const LEAD_RETRIEVAL_HEALTH_PATHS = [
  "/api/internal/health/lead-retrieval/conversation-lifecycle",
  "/api/internal/health/lead-retrieval/capture-recording-ingestion",
  "/api/internal/health/lead-retrieval/workflow-waits",
  "/api/internal/health/lead-retrieval/access-readiness",
  "/api/internal/health/lead-retrieval/campaign-readiness",
  "/api/internal/health/lead-retrieval/invite-license-seat-access",
  "/api/internal/health/lead-retrieval/provider-failure-spikes",
  "/api/internal/health/lead-retrieval/job-cron-freshness"
] as const;
const SECRET = "internal-health-secret";

function headers(values: Record<string, string>) {
  const normalized = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    get(name: string) {
      return normalized.get(name.toLowerCase()) ?? null;
    }
  };
}

describe("authorizeInternalHealthRequest", () => {
  it("accepts a valid timestamp/path HMAC signature", () => {
    const timestamp = "1782753600000";
    const signature = signInternalHealthPath({
      secret: SECRET,
      timestamp,
      pathname: PATHNAME
    });

    const result = authorizeInternalHealthRequest({
      headers: headers({
        "x-internal-health-timestamp": timestamp,
        "x-internal-health-signature": signature
      }),
      pathname: PATHNAME,
      secret: SECRET,
      nowMs: Number(timestamp)
    });

    assert.deepEqual(result, { ok: true });
  });

  it("accepts the same signing contract for every Lead Retrieval health path", () => {
    const timestamp = "1782753600000";

    for (const pathname of LEAD_RETRIEVAL_HEALTH_PATHS) {
      const signature = signInternalHealthPath({
        secret: SECRET,
        timestamp,
        pathname
      });

      assert.deepEqual(
        authorizeInternalHealthRequest({
          headers: headers({
            "x-internal-health-timestamp": timestamp,
            "x-internal-health-signature": signature
          }),
          pathname,
          secret: SECRET,
          nowMs: Number(timestamp)
        }),
        { ok: true },
        pathname
      );

      assert.deepEqual(
        authorizeInternalHealthRequest({
          headers: headers({
            "x-internal-health-timestamp": timestamp,
            "x-internal-health-signature": signature
          }),
          pathname: `${pathname}/wrong`,
          secret: SECRET,
          nowMs: Number(timestamp)
        }),
        { ok: false, reason: "invalid_signature" },
        pathname
      );
    }
  });

  it("rejects missing secret, missing headers, stale timestamps, and wrong paths", () => {
    const timestamp = "1782753600000";
    const signature = signInternalHealthPath({
      secret: SECRET,
      timestamp,
      pathname: PATHNAME
    });

    assert.deepEqual(
      authorizeInternalHealthRequest({
        headers: headers({
          "x-internal-health-timestamp": timestamp,
          "x-internal-health-signature": signature
        }),
        pathname: PATHNAME,
        secret: "",
        nowMs: Number(timestamp)
      }),
      { ok: false, reason: "missing_secret_env" }
    );

    assert.deepEqual(
      authorizeInternalHealthRequest({
        headers: headers({}),
        pathname: PATHNAME,
        secret: SECRET,
        nowMs: Number(timestamp)
      }),
      { ok: false, reason: "missing_header" }
    );

    assert.deepEqual(
      authorizeInternalHealthRequest({
        headers: headers({
          "x-internal-health-timestamp": timestamp,
          "x-internal-health-signature": signature
        }),
        pathname: PATHNAME,
        secret: SECRET,
        nowMs: Number(timestamp) + 301_000
      }),
      { ok: false, reason: "stale_timestamp" }
    );

    assert.deepEqual(
      authorizeInternalHealthRequest({
        headers: headers({
          "x-internal-health-timestamp": timestamp,
          "x-internal-health-signature": signature
        }),
        pathname: `${PATHNAME}/extra`,
        secret: SECRET,
        nowMs: Number(timestamp)
      }),
      { ok: false, reason: "invalid_signature" }
    );
  });
});

describe("getLeadRetrievalConversationLifecycleHealth", () => {
  it("returns healthy safe aggregates for completed lifecycle state", async () => {
    const fake = createFakeSupabase({
      lead_conversations: [
        {
          id: "conversation-1",
          lead_id: "lead-1",
          conversation_version: 1,
          transcription_status: "completed",
          synthesis_status: "completed",
          created_at: "2026-06-29T11:58:00.000Z",
          transcribed_at: "2026-06-29T11:59:00.000Z",
          synthesized_at: "2026-06-29T12:00:00.000Z",
          transcript: "sensitive transcript text",
          summary: "sensitive summary",
          storage_path: "private/audio/path.m4a",
          synthesis_error: "provider raw payload"
        }
      ],
      lead_conversation_readiness: [
        {
          lead_id: "lead-1",
          latest_conversation_version: 1,
          transcript_status: "ready",
          transcript_version: 1,
          insights_status: "ready",
          insights_version: 1
        }
      ],
      workflow_step_runs: []
    });

    const health = await getLeadRetrievalConversationLifecycleHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: "2026-06-29T12:30:00.000Z"
    });

    assert.equal(health.status, "healthy");
    assert.equal(health.conversationCounts.total, 1);
    assert.equal(health.conversationCounts.transcriptionCompleted, 1);
    assert.equal(health.conversationCounts.synthesisCompleted, 1);
    assert.deepEqual(health.issues, []);
    assert.doesNotMatch(
      JSON.stringify(health),
      /lead-1|conversation-1|sensitive|private\/audio|provider raw payload/i
    );

    const conversationSelect = fake._calls.find(
      (call) => call.table === "lead_conversations" && call.op === "select"
    );
    assert.ok(conversationSelect);
    const selectedColumns = String(conversationSelect.select ?? "")
      .split(",")
      .map((column) => column.trim());
    assert.equal(selectedColumns.includes("transcript"), false);
    assert.equal(selectedColumns.includes("summary"), false);
    assert.equal(selectedColumns.includes("storage_path"), false);
  });

  it("paginates aggregate source reads beyond Supabase default page size", async () => {
    const leadIds = Array.from({ length: 1001 }, (_, index) => `paged-lead-${index + 1}`);
    const fake = createFakeSupabase({
      lead_conversations: leadIds.map((leadId, index) => ({
        id: `paged-conversation-${index + 1}`,
        lead_id: leadId,
        conversation_version: 1,
        transcription_status: "completed",
        synthesis_status: "completed",
        created_at: "2026-06-29T11:58:00.000Z",
        transcribed_at: "2026-06-29T11:59:00.000Z",
        synthesized_at: "2026-06-29T12:00:00.000Z"
      })),
      lead_conversation_readiness: leadIds.map((leadId) => ({
        lead_id: leadId,
        latest_conversation_version: 1,
        transcript_status: "ready",
        transcript_version: 1,
        insights_status: "ready",
        insights_version: 1,
        created_at: "2026-06-29T12:00:00.000Z",
        updated_at: "2026-06-29T12:01:00.000Z"
      })),
      workflow_step_runs: []
    });

    const health = await getLeadRetrievalConversationLifecycleHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: "2026-06-29T12:30:00.000Z"
    });

    assert.equal(health.status, "healthy");
    assert.equal(health.conversationCounts.total, 1001);
    assert.deepEqual(health.readinessMismatchCounts, {
      missingReadinessForConversation: 0,
      readinessWithoutConversation: 0,
      transcriptCompleteButReadinessNotReady: 0,
      synthesisCompleteButReadinessNotReady: 0
    });

    const conversationSelectRanges = fake._calls
      .filter((call) => call.table === "lead_conversations" && call.op === "select")
      .map((call) => call.range);
    assert.deepEqual(conversationSelectRanges, [
      { from: 0, to: 999 },
      { from: 1000, to: 1999 }
    ]);
  });

  it("classifies stale lifecycle, readiness mismatches, and workflow waits without row-level output", async () => {
    const fake = createFakeSupabase({
      lead_conversations: [
        {
          id: "conversation-stale-audio",
          lead_id: "lead-a",
          conversation_version: 1,
          transcription_status: "processing",
          synthesis_status: "pending",
          created_at: "2026-06-29T12:00:00.000Z",
          transcribed_at: null,
          synthesized_at: null
        },
        {
          id: "conversation-stale-synthesis",
          lead_id: "lead-b",
          conversation_version: 2,
          transcription_status: "completed",
          synthesis_status: "pending",
          created_at: "2026-06-29T12:01:00.000Z",
          transcribed_at: "2026-06-29T12:02:00.000Z",
          synthesized_at: null
        },
        {
          id: "conversation-mismatch",
          lead_id: "lead-c",
          conversation_version: 3,
          transcription_status: "completed",
          synthesis_status: "completed",
          created_at: "2026-06-29T12:03:00.000Z",
          transcribed_at: "2026-06-29T12:04:00.000Z",
          synthesized_at: "2026-06-29T12:05:00.000Z",
          transcript: "completed transcript text",
          summary: "completed insight summary"
        }
      ],
      lead_conversation_readiness: [
        {
          lead_id: "lead-b",
          latest_conversation_version: 2,
          transcript_status: "ready",
          transcript_version: 2,
          insights_status: "processing",
          insights_version: null
        },
        {
          lead_id: "lead-c",
          latest_conversation_version: 3,
          transcript_status: "processing",
          transcript_version: 2,
          insights_status: "pending",
          insights_version: null
        },
        {
          lead_id: "lead-without-conversation",
          latest_conversation_version: 1,
          transcript_status: "ready",
          transcript_version: 1,
          insights_status: "ready",
          insights_version: 1
        }
      ],
      workflow_step_runs: [
        {
          id: "step-a",
          status: "waiting_for_audio_transcript",
          waiting_reason: "waiting_for_audio_transcript",
          wait_started_at: "2026-06-29T12:00:00.000Z",
          created_at: "2026-06-29T11:59:00.000Z"
        },
        {
          id: "step-b",
          status: "waiting",
          waiting_reason: "waiting_for_conversation_insights",
          wait_started_at: "2026-06-29T12:10:00.000Z",
          created_at: "2026-06-29T12:09:00.000Z"
        },
        {
          id: "step-c",
          status: "completed",
          waiting_reason: "waiting_for_audio_transcript",
          wait_started_at: "2026-06-29T12:00:00.000Z",
          created_at: "2026-06-29T12:00:00.000Z"
        }
      ]
    });

    const health = await getLeadRetrievalConversationLifecycleHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: "2026-06-29T12:30:00.000Z"
    });

    assert.equal(health.status, "critical");
    assert.deepEqual(health.staleTranscriptionPendingOrProcessing, {
      count: 1,
      thresholdMinutes: STALE_TRANSCRIPTION_MINUTES
    });
    assert.deepEqual(health.completedTranscriptPendingSynthesis, {
      count: 1,
      thresholdMinutes: STALE_SYNTHESIS_MINUTES
    });
    assert.deepEqual(health.readinessMismatchCounts, {
      missingReadinessForConversation: 1,
      readinessWithoutConversation: 1,
      transcriptCompleteButReadinessNotReady: 1,
      synthesisCompleteButReadinessNotReady: 1
    });
    assert.deepEqual(health.workflowWaitsByReason, [
      {
        reason: "waiting_for_audio_transcript",
        count: 1,
        oldestWaitStartedAt: "2026-06-29T12:00:00.000Z"
      },
      {
        reason: "waiting_for_conversation_insights",
        count: 1,
        oldestWaitStartedAt: "2026-06-29T12:10:00.000Z"
      }
    ]);
    assert.equal(health.conversationCounts.total, 3);
    assert.ok(health.issues.some((issue) => issue.code === "stale_workflow_conversation_waits"));
    assert.doesNotMatch(
      JSON.stringify(health),
      /lead-[abc]|conversation-stale|conversation-mismatch|step-[abc]/i
    );
  });

  it("reports historical readiness drift without forcing critical status", async () => {
    const leadIds = Array.from({ length: 6 }, (_, index) => `historical-lead-${index + 1}`);
    const fake = createFakeSupabase({
      lead_conversations: leadIds.map((leadId, index) => ({
        id: `historical-conversation-${index + 1}`,
        lead_id: leadId,
        conversation_version: 2,
        transcription_status: "completed",
        synthesis_status: "completed",
        created_at: "2026-06-01T10:00:00.000Z",
        transcribed_at: "2026-06-01T10:01:00.000Z",
        synthesized_at: "2026-06-01T10:02:00.000Z",
        transcript: "completed transcript text",
        summary: "completed insight summary"
      })),
      lead_conversation_readiness: leadIds.map((leadId) => ({
        lead_id: leadId,
        latest_conversation_version: 2,
        transcript_status: "processing",
        transcript_version: 1,
        insights_status: "ready",
        insights_version: 2,
        created_at: "2026-06-01T10:03:00.000Z",
        updated_at: "2026-06-01T10:04:00.000Z"
      })),
      workflow_step_runs: []
    });

    const health = await getLeadRetrievalConversationLifecycleHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: "2026-06-29T12:30:00.000Z"
    });

    assert.equal(health.status, "warning");
    assert.deepEqual(health.readinessMismatchCounts, {
      missingReadinessForConversation: 0,
      readinessWithoutConversation: 0,
      transcriptCompleteButReadinessNotReady: 6,
      synthesisCompleteButReadinessNotReady: 0
    });
    assert.equal(health.readinessMismatchesLast24h, 0);
    assert.equal(health.readinessMismatchesLast7d, 0);
    assert.equal(health.oldestReadinessMismatchAt, "2026-06-01T10:04:00.000Z");
    assert.equal(health.newestReadinessMismatchAt, "2026-06-01T10:04:00.000Z");
    assert.deepEqual(
      health.readinessMismatchActivityByCategory.transcriptCompleteButReadinessNotReady,
      {
        total: 6,
        last24h: 0,
        last7d: 0,
        oldestAffectedAt: "2026-06-01T10:04:00.000Z",
        newestAffectedAt: "2026-06-01T10:04:00.000Z"
      }
    );
    assert.deepEqual(health.issues, [
      {
        code: "conversation_readiness_historical_mismatch",
        severity: "warning",
        message:
          "Conversation readiness aggregates have historical drift, but no recent growth was detected.",
        count: 6
      }
    ]);
    assert.doesNotMatch(JSON.stringify(health), /historical-lead|historical-conversation/i);
  });

  it("reports recent readiness drift as warning below the critical threshold", async () => {
    const fake = createFakeSupabase({
      lead_conversations: [
        {
          id: "recent-warning-conversation",
          lead_id: "recent-warning-lead",
          conversation_version: 3,
          transcription_status: "completed",
          synthesis_status: "completed",
          created_at: "2026-06-28T12:00:00.000Z",
          transcribed_at: "2026-06-28T12:01:00.000Z",
          synthesized_at: "2026-06-28T12:02:00.000Z",
          transcript: "completed transcript text",
          summary: "completed insight summary"
        }
      ],
      lead_conversation_readiness: [
        {
          lead_id: "recent-warning-lead",
          latest_conversation_version: 3,
          transcript_status: "ready",
          transcript_version: 3,
          insights_status: "pending",
          insights_version: null,
          created_at: "2026-06-28T12:03:00.000Z",
          updated_at: "2026-06-28T12:04:00.000Z"
        }
      ],
      workflow_step_runs: []
    });

    const health = await getLeadRetrievalConversationLifecycleHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: "2026-06-29T12:30:00.000Z"
    });

    assert.equal(health.status, "warning");
    assert.equal(health.readinessMismatchesLast24h, 0);
    assert.equal(health.readinessMismatchesLast7d, 1);
    assert.deepEqual(health.issues, [
      {
        code: "conversation_readiness_recent_mismatch",
        severity: "warning",
        message: "Conversation readiness aggregates have recent drift that should be reviewed.",
        count: 1
      }
    ]);
  });

  it("reports current readiness drift as warning when no workflow is waiting", async () => {
    const leadIds = Array.from({ length: 5 }, (_, index) => `current-lead-${index + 1}`);
    const fake = createFakeSupabase({
      lead_conversations: leadIds.map((leadId, index) => ({
        id: `current-conversation-${index + 1}`,
        lead_id: leadId,
        conversation_version: 1,
        transcription_status: "completed",
        synthesis_status: "completed",
        created_at: "2026-06-29T11:00:00.000Z",
        transcribed_at: "2026-06-29T11:01:00.000Z",
        synthesized_at: "2026-06-29T11:02:00.000Z",
        transcript: "completed transcript text",
        summary: "completed insight summary"
      })),
      lead_conversation_readiness: leadIds.map((leadId) => ({
        lead_id: leadId,
        latest_conversation_version: 1,
        transcript_status: "ready",
        transcript_version: 1,
        insights_status: "processing",
        insights_version: null,
        created_at: "2026-06-29T11:03:00.000Z",
        updated_at: "2026-06-29T11:04:00.000Z"
      })),
      workflow_step_runs: []
    });

    const health = await getLeadRetrievalConversationLifecycleHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: "2026-06-29T12:30:00.000Z"
    });

    assert.equal(health.status, "warning");
    assert.equal(health.readinessMismatchesLast24h, 5);
    assert.equal(health.readinessMismatchesLast7d, 5);
    assert.equal(health.oldestReadinessMismatchAt, "2026-06-29T11:04:00.000Z");
    assert.equal(health.newestReadinessMismatchAt, "2026-06-29T11:04:00.000Z");
    assert.deepEqual(health.issues, [
      {
        code: "conversation_readiness_recent_mismatch",
        severity: "warning",
        message: "Conversation readiness aggregates have recent drift that should be reviewed.",
        count: 5
      }
    ]);
  });

  it("does not count completed empty-transcript no-speech rows as transcript readiness drift", async () => {
    const leadIds = Array.from({ length: 5 }, (_, index) => `empty-transcript-lead-${index + 1}`);
    const fake = createFakeSupabase({
      lead_conversations: leadIds.map((leadId, index) => ({
        id: `empty-transcript-conversation-${index + 1}`,
        lead_id: leadId,
        conversation_version: 1,
        transcription_status: "completed",
        synthesis_status: "failed",
        created_at: "2026-06-29T11:00:00.000Z",
        transcribed_at: "2026-06-29T11:01:00.000Z",
        synthesized_at: null,
        transcript: "",
        summary: null
      })),
      lead_conversation_readiness: leadIds.map((leadId) => ({
        lead_id: leadId,
        latest_conversation_version: 1,
        transcript_status: "pending",
        transcript_version: null,
        insights_status: "processing",
        insights_version: null,
        created_at: "2026-06-29T11:03:00.000Z",
        updated_at: "2026-06-29T11:04:00.000Z"
      })),
      workflow_step_runs: []
    });

    const health = await getLeadRetrievalConversationLifecycleHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: "2026-06-29T12:30:00.000Z"
    });

    assert.equal(health.status, "healthy");
    assert.deepEqual(health.readinessMismatchCounts, {
      missingReadinessForConversation: 0,
      readinessWithoutConversation: 0,
      transcriptCompleteButReadinessNotReady: 0,
      synthesisCompleteButReadinessNotReady: 0
    });
    assert.deepEqual(health.issues, []);
  });

  it("reconciles synthesis readiness drift only when authoritative transcript and summary exist", async () => {
    const fake = createFakeSupabase({
      lead_conversations: [
        {
          id: "repairable-conversation",
          lead_id: "repairable-lead",
          conversation_version: 1591,
          transcription_status: "completed",
          synthesis_status: "completed",
          created_at: "2026-03-21T14:32:30.586Z",
          transcribed_at: "2026-03-21T14:33:08.476Z",
          synthesized_at: "2026-03-21T14:33:10.352Z",
          transcript: "completed transcript text",
          summary: "completed insight summary"
        },
        {
          id: "missing-summary-conversation",
          lead_id: "missing-summary-lead",
          conversation_version: 2,
          transcription_status: "completed",
          synthesis_status: "completed",
          created_at: "2026-03-21T14:32:30.586Z",
          transcribed_at: "2026-03-21T14:33:08.476Z",
          synthesized_at: "2026-03-21T14:33:10.352Z",
          transcript: "completed transcript text",
          summary: ""
        }
      ],
      lead_conversation_readiness: [
        {
          lead_id: "repairable-lead",
          latest_conversation_version: 1591,
          transcript_status: "ready",
          transcript_version: 1591,
          transcript_ready_at: "2026-03-21T14:33:08.476Z",
          insights_status: "ready",
          insights_version: 19,
          insights_ready_at: "2026-06-29T16:21:49.153Z",
          created_at: "2026-06-29T14:46:05.412Z",
          updated_at: "2026-06-29T16:21:49.210Z"
        },
        {
          lead_id: "missing-summary-lead",
          latest_conversation_version: 2,
          transcript_status: "ready",
          transcript_version: 2,
          transcript_ready_at: "2026-03-21T14:33:08.476Z",
          insights_status: "processing",
          insights_version: null,
          insights_ready_at: null,
          created_at: "2026-06-29T14:46:05.412Z",
          updated_at: "2026-06-29T16:21:49.210Z"
        }
      ],
      workflow_step_runs: []
    });

    const skipped = await reconcileConversationReadinessFromAuthoritativeConversation({
      supabase: asAdminClient<any>(fake),
      leadId: "missing-summary-lead",
      conversationId: "missing-summary-conversation",
      nowIso: "2026-06-30T02:00:00.000Z"
    });
    assert.deepEqual(skipped, { action: "skipped", reason: "summary_missing" });

    const repaired = await reconcileConversationReadinessFromAuthoritativeConversation({
      supabase: asAdminClient<any>(fake),
      leadId: "repairable-lead",
      conversationId: "repairable-conversation",
      nowIso: "2026-06-30T02:00:00.000Z"
    });
    assert.deepEqual(repaired, {
      action: "insights_marked_ready",
      conversationVersion: 1591
    });

    const repairedRow = fake._tables.lead_conversation_readiness.find(
      (row) => row.lead_id === "repairable-lead"
    );
    assert.equal(repairedRow?.insights_status, "ready");
    assert.equal(repairedRow?.insights_version, 1591);
    assert.equal(repairedRow?.insights_ready_at, "2026-06-30T02:00:00.000Z");

    const skippedRow = fake._tables.lead_conversation_readiness.find(
      (row) => row.lead_id === "missing-summary-lead"
    );
    assert.equal(skippedRow?.insights_status, "processing");
    assert.equal(skippedRow?.insights_version, null);

    const health = await getLeadRetrievalConversationLifecycleHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: "2026-06-30T02:01:00.000Z"
    });
    assert.equal(health.status, "healthy");
    assert.deepEqual(health.readinessMismatchCounts, {
      missingReadinessForConversation: 0,
      readinessWithoutConversation: 0,
      transcriptCompleteButReadinessNotReady: 0,
      synthesisCompleteButReadinessNotReady: 0
    });
    assert.deepEqual(health.issues, []);
  });

  it("route contract authenticates before DB work and stays aggregate-only", () => {
    const route = readFileSync(
      join(
        process.cwd(),
        "app/api/internal/health/lead-retrieval/conversation-lifecycle/route.ts"
      ),
      "utf8"
    );
    const service = readFileSync(
      join(
        process.cwd(),
        "lib/internal-health/lead-retrieval/conversation-lifecycle.ts"
      ),
      "utf8"
    );

    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function DELETE/);
    assert.ok(
      route.indexOf("authorizeLeadRetrievalInternalHealthRequest") < route.indexOf("createAdminClient"),
      "route should validate signing before creating a DB client"
    );
    assert.match(route, /authorizeLeadRetrievalInternalHealthRequest/);
    assert.doesNotMatch(service, /storage_path|audio_url|provider|prompt|error_text|transcription_error|synthesis_error/);
  });
});
