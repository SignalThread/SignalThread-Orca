import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  authorizeInternalHealthRequest,
  signInternalHealthPath,
} from "@/lib/internal-health/internal-health-auth";
import {
  getLeadRetrievalWorkflowWaitsHealth,
  classifyWorkflowWait,
  CRITICAL_STUCK_AUTOMATION_WAIT_COUNT,
} from "@/lib/internal-health/lead-retrieval/workflow-waits";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

const PATHNAME = "/api/internal/health/lead-retrieval/workflow-waits";
const SECRET = "internal-health-secret";
const NOW = "2026-06-30T12:00:00.000Z";

function headers(values: Record<string, string>) {
  const normalized = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => normalized.get(name.toLowerCase()) ?? null };
}

function waitRow(over: Record<string, unknown>) {
  return {
    id: "step-run-secret-id",
    run_id: "run-secret-id",
    lead_id: "lead-secret-id",
    step_key: "secret_step_key",
    status: "waiting_for_audio_transcript",
    waiting_reason: "waiting_for_audio_transcript",
    wait_started_at: "2026-06-30T11:55:00.000Z",
    created_at: "2026-06-30T11:54:00.000Z",
    completed_at: null,
    ...over,
  };
}

describe("workflow-waits signing", () => {
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

describe("classifyWorkflowWait", () => {
  it("maps statuses/reasons to canonical reason + family", () => {
    assert.deepEqual(classifyWorkflowWait({ status: "waiting_for_audio_transcript", waiting_reason: null }), {
      reason: "waiting_for_audio_transcript",
      category: "automation",
    });
    assert.deepEqual(classifyWorkflowWait({ status: "waiting", waiting_reason: "waiting_for_conversation_insights" }), {
      reason: "waiting_for_conversation_insights",
      category: "automation",
    });
    assert.deepEqual(classifyWorkflowWait({ status: "waiting", waiting_reason: null }), {
      reason: "waiting",
      category: "automation",
    });
    assert.deepEqual(classifyWorkflowWait({ status: "awaiting_approval", waiting_reason: null }), {
      reason: "awaiting_approval",
      category: "approval",
    });
  });
});

describe("getLeadRetrievalWorkflowWaitsHealth", () => {
  it("is healthy with no active waits", async () => {
    const fake = createFakeSupabase({ workflow_step_runs: [] });
    const health = await getLeadRetrievalWorkflowWaitsHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.check, "workflow-waits");
    assert.equal(health.source, "workflow-waits");
    assert.equal(health.status, "healthy");
    assert.equal(health.metrics.totalActiveWaits, 0);
    assert.deepEqual(health.issues, []);
  });

  it("groups active waits by reason and exposes no row-level data", async () => {
    const fake = createFakeSupabase({
      workflow_step_runs: [
        waitRow({ status: "waiting_for_audio_transcript", waiting_reason: "waiting_for_audio_transcript" }),
        waitRow({ status: "waiting_for_conversation_insights", waiting_reason: "waiting_for_conversation_insights" }),
        waitRow({ status: "awaiting_approval", waiting_reason: null, wait_started_at: "2026-06-30T11:58:00.000Z" }),
      ],
    });
    const health = await getLeadRetrievalWorkflowWaitsHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });

    assert.equal(health.metrics.totalActiveWaits, 3);
    assert.equal(health.metrics.automationWaitCount, 2);
    assert.equal(health.metrics.approvalWaitCount, 1);
    assert.equal(health.metrics.audioTranscriptWaitCount, 1);
    assert.equal(health.metrics.conversationInsightsWaitCount, 1);
    // Recent (not stale) automation waits → healthy.
    assert.equal(health.status, "healthy");
    assert.doesNotMatch(
      JSON.stringify(health),
      /step-run-secret-id|run-secret-id|lead-secret-id|secret_step_key/
    );

    for (const call of fake._calls.filter((c) => c.table === "workflow_step_runs" && c.op === "select")) {
      const cols = String(call.select ?? "").split(",").map((c) => c.trim());
      assert.equal(cols.includes("lead_id"), false);
      assert.equal(cols.includes("step_key"), false);
      assert.equal(cols.includes("id"), false);
    }
  });

  it("escalates stuck automation waits to critical when accumulating with no recent resolutions", async () => {
    const fake = createFakeSupabase({
      workflow_step_runs: Array.from({ length: CRITICAL_STUCK_AUTOMATION_WAIT_COUNT }, (_, i) =>
        waitRow({ id: `s-${i}`, wait_started_at: "2026-06-30T11:30:00.000Z" })
      ),
    });
    const health = await getLeadRetrievalWorkflowWaitsHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.status, "critical");
    assert.equal(health.metrics.stuckAutomationWaitCount, CRITICAL_STUCK_AUTOMATION_WAIT_COUNT);
    assert.equal(health.metrics.recentlyResolvedWaitsLast60m, 0);
    assert.ok(health.issues.some((i) => i.code === "stuck_automation_workflow_waits" && i.severity === "critical"));
  });

  it("stays warning (not critical) when stuck waits are still resolving", async () => {
    const fake = createFakeSupabase({
      workflow_step_runs: [
        ...Array.from({ length: CRITICAL_STUCK_AUTOMATION_WAIT_COUNT }, (_, i) =>
          waitRow({ id: `s-${i}`, wait_started_at: "2026-06-30T11:30:00.000Z" })
        ),
        // A recently resolved wait (had waited, completed within the window).
        waitRow({
          id: "resolved-1",
          status: "completed",
          waiting_reason: null,
          wait_started_at: "2026-06-30T11:20:00.000Z",
          completed_at: "2026-06-30T11:50:00.000Z",
        }),
      ],
    });
    const health = await getLeadRetrievalWorkflowWaitsHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.recentlyResolvedWaitsLast60m, 1);
    assert.equal(health.status, "warning");
    assert.ok(health.issues.some((i) => i.code === "stuck_automation_workflow_waits" && i.severity === "warning"));
  });

  it("never marks approval waits as critical", async () => {
    const fake = createFakeSupabase({
      workflow_step_runs: [
        waitRow({ id: "appr-1", status: "awaiting_approval", waiting_reason: null, wait_started_at: "2026-06-28T11:00:00.000Z" }),
      ],
    });
    const health = await getLeadRetrievalWorkflowWaitsHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.approvalWaitCount, 1);
    assert.equal(health.metrics.stuckApprovalWaitCount, 1);
    assert.equal(health.status, "warning");
    assert.ok(!health.issues.some((i) => i.severity === "critical"));
  });

  it("route contract: GET only, authenticates before DB", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/internal/health/lead-retrieval/workflow-waits/route.ts"),
      "utf8"
    );
    const service = readFileSync(
      join(process.cwd(), "lib/internal-health/lead-retrieval/workflow-waits.ts"),
      "utf8"
    );
    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function DELETE/);
    assert.ok(route.indexOf("authorizeLeadRetrievalInternalHealthRequest") < route.indexOf("createAdminClient"));
    assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
  });
});
