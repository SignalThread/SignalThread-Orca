import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  authorizeInternalHealthRequest,
  signInternalHealthPath,
} from "@/lib/internal-health/internal-health-auth";
import {
  getLeadRetrievalCaptureRecordingIngestionHealth,
  STUCK_PENDING_TRANSCRIPTION_MINUTES,
  CRITICAL_STUCK_PENDING_COUNT,
} from "@/lib/internal-health/lead-retrieval/capture-recording-ingestion";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

const PATHNAME = "/api/internal/health/lead-retrieval/capture-recording-ingestion";
const SECRET = "internal-health-secret";
const NOW = "2026-06-30T12:00:00.000Z";

function headers(values: Record<string, string>) {
  const normalized = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => normalized.get(name.toLowerCase()) ?? null };
}

describe("capture-recording-ingestion signing", () => {
  it("accepts a valid signature for this path and rejects a wrong path", () => {
    const timestamp = "1782820800000";
    const signature = signInternalHealthPath({ secret: SECRET, timestamp, pathname: PATHNAME });
    assert.deepEqual(
      authorizeInternalHealthRequest({
        headers: headers({
          "x-internal-health-timestamp": timestamp,
          "x-internal-health-signature": signature,
        }),
        pathname: PATHNAME,
        secret: SECRET,
        nowMs: Number(timestamp),
      }),
      { ok: true }
    );

    assert.deepEqual(
      authorizeInternalHealthRequest({
        headers: headers({
          "x-internal-health-timestamp": timestamp,
          "x-internal-health-signature": signature,
        }),
        pathname: `${PATHNAME}/extra`,
        secret: SECRET,
        nowMs: Number(timestamp),
      }),
      { ok: false, reason: "invalid_signature" }
    );
  });
});

describe("getLeadRetrievalCaptureRecordingIngestionHealth", () => {
  it("returns healthy aggregates with no sensitive fields when ingestion flows", async () => {
    const fake = createFakeSupabase({
      leads: [
        { id: "lead-1", created_at: "2026-06-30T11:55:00.000Z", company_id: "company-secret-a", event_id: "event-secret-a" },
        { id: "lead-2", created_at: "2026-06-30T11:40:00.000Z", company_id: "company-secret-a", event_id: "event-secret-b" },
      ],
      lead_conversations: [
        {
          id: "conversation-1",
          lead_id: "lead-1",
          storage_path: "private/audio/secret-path.m4a",
          transcription_status: "completed",
          synthesis_status: "completed",
          created_at: "2026-06-30T11:56:00.000Z",
        },
        {
          id: "conversation-2",
          lead_id: "lead-2",
          storage_path: "private/audio/secret-path-2.m4a",
          transcription_status: "processing",
          synthesis_status: "pending",
          created_at: "2026-06-30T11:58:00.000Z",
        },
      ],
    });

    const health = await getLeadRetrievalCaptureRecordingIngestionHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: NOW,
    });

    assert.equal(health.product, "lead-retrieval");
    assert.equal(health.check, "capture-recording-ingestion");
    assert.equal(health.source, "capture-recording-ingestion");
    assert.equal(health.status, "healthy");
    assert.equal(health.checkedAt, NOW);
    assert.equal(health.metrics.leadInsertsLast60m, 2);
    assert.equal(health.metrics.leadInsertsLast15m, 1);
    assert.equal(health.metrics.recordingRowsLast60m, 2);
    assert.equal(health.metrics.recordingsEnteringTranscriptionLast60m, 2);
    assert.equal(health.metrics.distinctCompaniesActiveLast60m, 1);
    assert.equal(health.metrics.distinctEventsActiveLast60m, 2);
    assert.equal(health.metrics.stuckPendingTranscriptionCount, 0);
    assert.equal(health.metrics.missingStorageNonTerminalCount, 0);
    assert.deepEqual(health.issues, []);

    // No row IDs, storage paths, or customer identifiers in the payload.
    assert.doesNotMatch(
      JSON.stringify(health),
      /conversation-1|conversation-2|lead-1|lead-2|company-secret|event-secret|private\/audio|secret-path/i
    );

    // storage_path / transcript / summary must never be selected into memory.
    for (const call of fake._calls.filter((c) => c.table === "lead_conversations" && c.op === "select")) {
      const cols = String(call.select ?? "").split(",").map((c) => c.trim());
      assert.equal(cols.includes("storage_path"), false);
      assert.equal(cols.includes("transcript"), false);
      assert.equal(cols.includes("summary"), false);
    }
  });

  it("flags recordings stuck before transcription as critical past the threshold", async () => {
    const stuckCreatedAt = "2026-06-30T11:30:00.000Z"; // older than 15m stale cutoff (11:45)
    const fake = createFakeSupabase({
      leads: [],
      lead_conversations: Array.from({ length: CRITICAL_STUCK_PENDING_COUNT }, (_, i) => ({
        id: `stuck-${i + 1}`,
        lead_id: `lead-${i + 1}`,
        storage_path: `private/audio/stuck-${i + 1}.m4a`,
        transcription_status: "pending",
        synthesis_status: "pending",
        created_at: stuckCreatedAt,
      })),
    });

    const health = await getLeadRetrievalCaptureRecordingIngestionHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: NOW,
    });

    assert.equal(health.status, "critical");
    assert.equal(health.metrics.stuckPendingTranscriptionCount, CRITICAL_STUCK_PENDING_COUNT);
    assert.equal(health.metrics.oldestStuckPendingAgeMinutes, 30);
    const issue = health.issues.find((i) => i.code === "recordings_stuck_before_transcription");
    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(issue.threshold, CRITICAL_STUCK_PENDING_COUNT);
  });

  it("flags a single stuck recording as warning, not critical", async () => {
    const fake = createFakeSupabase({
      leads: [],
      lead_conversations: [
        {
          id: "stuck-1",
          lead_id: "lead-1",
          storage_path: "private/audio/stuck-1.m4a",
          transcription_status: "pending",
          synthesis_status: "pending",
          created_at: "2026-06-30T11:40:00.000Z",
        },
      ],
    });

    const health = await getLeadRetrievalCaptureRecordingIngestionHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: NOW,
    });

    assert.equal(health.status, "warning");
    assert.equal(health.metrics.stuckPendingTranscriptionCount, 1);
  });

  it("flags non-terminal conversation rows missing their audio object", async () => {
    const fake = createFakeSupabase({
      leads: [],
      lead_conversations: Array.from({ length: CRITICAL_STUCK_PENDING_COUNT }, (_, i) => ({
        id: `gap-${i + 1}`,
        lead_id: `lead-${i + 1}`,
        storage_path: null,
        transcription_status: "pending",
        synthesis_status: "pending",
        created_at: "2026-06-30T11:50:00.000Z",
      })),
    });

    const health = await getLeadRetrievalCaptureRecordingIngestionHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: NOW,
    });

    assert.equal(health.metrics.missingStorageNonTerminalCount, CRITICAL_STUCK_PENDING_COUNT);
    assert.ok(health.issues.some((i) => i.code === "recordings_missing_storage_path" && i.severity === "critical"));
  });

  it("does not escalate on low/zero recent activity by itself", async () => {
    const fake = createFakeSupabase({ leads: [], lead_conversations: [] });
    const health = await getLeadRetrievalCaptureRecordingIngestionHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: NOW,
    });
    assert.equal(health.status, "healthy");
    assert.equal(health.metrics.leadInsertsLast60m, 0);
    assert.equal(health.metrics.recordingRowsLast60m, 0);
  });

  it("paginates recent recording reads beyond the Supabase default page size", async () => {
    const conversations = Array.from({ length: 1001 }, (_, i) => ({
      id: `paged-${i + 1}`,
      lead_id: `lead-${i + 1}`,
      storage_path: `private/audio/paged-${i + 1}.m4a`,
      transcription_status: "completed",
      synthesis_status: "completed",
      created_at: "2026-06-30T11:50:00.000Z",
    }));
    const fake = createFakeSupabase({ leads: [], lead_conversations: conversations });

    const health = await getLeadRetrievalCaptureRecordingIngestionHealth({
      supabase: asAdminClient<any>(fake),
      nowIso: NOW,
    });

    assert.equal(health.metrics.recordingRowsLast60m, 1001);
    const recentRanges = fake._calls
      .filter((c) => c.table === "lead_conversations" && c.op === "select" && c.select === "created_at, transcription_status")
      .map((c) => c.range);
    assert.deepEqual(recentRanges, [
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ]);
  });

  it("route contract: GET only, authenticates before DB, no sensitive columns selected", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/internal/health/lead-retrieval/capture-recording-ingestion/route.ts"),
      "utf8"
    );
    const service = readFileSync(
      join(process.cwd(), "lib/internal-health/lead-retrieval/capture-recording-ingestion.ts"),
      "utf8"
    );
    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function DELETE/);
    assert.ok(
      route.indexOf("authorizeLeadRetrievalInternalHealthRequest") < route.indexOf("createAdminClient"),
      "route should validate signing before creating a DB client"
    );
    assert.match(route, /authorizeLeadRetrievalInternalHealthRequest/);
    // Service performs no writes and selects no transcript/audio content into responses.
    assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
    assert.doesNotMatch(service, /select:\s*"[^"]*\b(transcript|summary|audio_url)\b[^"]*"/);
  });
});
