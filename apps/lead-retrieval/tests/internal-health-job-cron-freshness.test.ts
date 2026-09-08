import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  authorizeInternalHealthRequest,
  signInternalHealthPath,
} from "@/lib/internal-health/internal-health-auth";
import {
  getLeadRetrievalJobCronFreshnessHealth,
  CRITICAL_OVERDUE_STEP_COUNT,
  CRITICAL_STALE_PROCESSING_COUNT,
} from "@/lib/internal-health/lead-retrieval/job-cron-freshness";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

const PATHNAME = "/api/internal/health/lead-retrieval/job-cron-freshness";
const SECRET = "internal-health-secret";
const NOW = "2026-06-30T12:00:00.000Z";
const RECENT_ACTIVITY = "2026-06-30T11:55:00.000Z"; // within 60m window
const OVERDUE_SCHEDULED = "2026-06-30T11:00:00.000Z"; // older than 10m overdue cutoff (11:50)
const STALE_CREATED = "2026-06-30T11:00:00.000Z"; // older than 15m reconciler cutoff (11:45)

function headers(values: Record<string, string>) {
  const normalized = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => normalized.get(name.toLowerCase()) ?? null };
}

describe("job-cron-freshness signing", () => {
  it("accepts a valid signature for this path", () => {
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
  });
});

describe("getLeadRetrievalJobCronFreshnessHealth", () => {
  it("is healthy when the tick is active and nothing is overdue or stale", async () => {
    const fake = createFakeSupabase({
      workflow_step_runs: [
        { status: "queued", scheduled_at: "infinity", updated_at: RECENT_ACTIVITY },
        { status: "completed", scheduled_at: RECENT_ACTIVITY, updated_at: RECENT_ACTIVITY },
      ],
      lead_conversations: [],
    });
    const health = await getLeadRetrievalJobCronFreshnessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.check, "job-cron-freshness");
    assert.equal(health.source, "job-cron-freshness");
    assert.equal(health.status, "healthy");
    assert.equal(health.metrics.overdueQueuedSteps, 0);
    assert.equal(health.metrics.pendingQueuedSteps, 0);
    assert.equal(health.metrics.recentWorkflowStepUpdates, 2);
    assert.deepEqual(health.issues, []);
  });

  it("is healthy when idle (future-scheduled work, no pending work, no activity)", async () => {
    const fake = createFakeSupabase({
      workflow_step_runs: [{ status: "queued", scheduled_at: "infinity", updated_at: "2026-06-30T09:00:00.000Z" }],
      lead_conversations: [],
    });
    const health = await getLeadRetrievalJobCronFreshnessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.pendingWorkExists, false);
    assert.equal(health.status, "healthy");
  });

  it("marks overdue queued workflow steps critical past threshold", async () => {
    const fake = createFakeSupabase({
      workflow_step_runs: Array.from({ length: CRITICAL_OVERDUE_STEP_COUNT }, () => ({
        status: "queued",
        scheduled_at: OVERDUE_SCHEDULED,
        updated_at: RECENT_ACTIVITY, // tick is alive, but these remain unclaimed
      })),
      lead_conversations: [],
    });
    const health = await getLeadRetrievalJobCronFreshnessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.overdueQueuedSteps, CRITICAL_OVERDUE_STEP_COUNT);
    assert.equal(health.status, "critical");
    assert.ok(health.issues.some((i) => i.code === "workflow_tick_overdue_steps" && i.severity === "critical"));
  });

  it("marks stale conversation processing critical past threshold", async () => {
    const fake = createFakeSupabase({
      workflow_step_runs: [{ status: "completed", scheduled_at: RECENT_ACTIVITY, updated_at: RECENT_ACTIVITY }],
      lead_conversations: Array.from({ length: CRITICAL_STALE_PROCESSING_COUNT }, () => ({
        transcription_status: "pending",
        synthesis_status: "pending",
        created_at: STALE_CREATED,
      })),
    });
    const health = await getLeadRetrievalJobCronFreshnessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.staleConversationProcessing, CRITICAL_STALE_PROCESSING_COUNT);
    assert.ok(health.issues.some((i) => i.code === "reconciler_stale_conversation_processing" && i.severity === "critical"));
  });

  it("flags a stalled tick when pending work exists but there is no recent activity", async () => {
    const fake = createFakeSupabase({
      workflow_step_runs: [
        // Claimable now (not overdue), but tick has shown no activity in the window.
        { status: "queued", scheduled_at: "2026-06-30T11:55:00.000Z", updated_at: "2026-06-30T10:00:00.000Z" },
      ],
      lead_conversations: [],
    });
    const health = await getLeadRetrievalJobCronFreshnessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.pendingQueuedSteps, 1);
    assert.equal(health.metrics.overdueQueuedSteps, 0);
    assert.equal(health.metrics.recentWorkflowStepUpdates, 0);
    assert.equal(health.status, "critical");
    assert.ok(health.issues.some((i) => i.code === "workflow_tick_no_recent_activity" && i.severity === "critical"));
  });

  it("route contract: GET only, authenticates before DB, read-only", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/internal/health/lead-retrieval/job-cron-freshness/route.ts"),
      "utf8"
    );
    const service = readFileSync(
      join(process.cwd(), "lib/internal-health/lead-retrieval/job-cron-freshness.ts"),
      "utf8"
    );
    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function DELETE/);
    assert.ok(route.indexOf("authorizeLeadRetrievalInternalHealthRequest") < route.indexOf("createAdminClient"));
    assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
  });
});
