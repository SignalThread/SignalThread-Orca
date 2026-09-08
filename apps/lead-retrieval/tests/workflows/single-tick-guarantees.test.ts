// @lr area=workflows severity=P1 layer=unit category=local-only
/**
 * Workflow scheduler — plan §44, scoped to the topology this system actually deploys.
 *
 * Prompt 1 established the topology from code rather than assumption:
 *
 *   - `vercel.json` declares exactly one cron, `/api/internal/workflow-tick`, every minute
 *   - the tick claims **at most one** queued step per invocation
 *   - PostgREST cannot express `FOR UPDATE SKIP LOCKED`, so the claim is a two-step
 *     select-then-compare-and-set guarded by `.eq("status", "queued")`
 *
 * §44 says to *"test only states your architecture can actually reach"*. So there is no
 * worker pool, no job lease and no dead-letter machinery to simulate. What IS reachable —
 * and what the plan would have missed — is that the endpoint accepts cron `GET` **and** an
 * in-process `POST` kick from `emitLeadCaptured`, so two invocations can overlap. The
 * compare-and-set is the only thing preventing a double claim.
 */
import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { readFileSync } from "node:fs";

import { createScopedSupabase, type ScopedSupabase } from "../helpers/scoped-supabase";

// The claim module is `server-only`, which throws by design outside a server component
// graph. Stubbed so the real claim logic runs; nothing about it is mocked.
before(() => {
  mock.module("server-only", { namedExports: {} });
});

const NOW = "2026-08-12T10:00:00.000Z";
const PAST = "2026-08-12T09:00:00.000Z";
const FUTURE = "2026-08-12T11:00:00.000Z";

const step = (over: Record<string, unknown> = {}) => ({
  id: "step-1",
  run_id: "run-1",
  step_id: "s1",
  step_index: 0,
  step_key: "enrich_lead",
  status: "queued",
  attempt_count: 0,
  attempt_id: null,
  scheduled_at: PAST,
  started_at: null,
  completed_at: null,
  input_jsonb: {},
  output_jsonb: null,
  error_text: null,
  error_code: null,
  created_at: PAST,
  updated_at: PAST,
  ...over,
});

const seed = (rows: Array<Record<string, unknown>>): ScopedSupabase =>
  createScopedSupabase({ tables: { workflow_step_runs: rows } });

async function claim(db: ScopedSupabase, nowIso = NOW) {
  const { claimNextDueStepRun } = await import("../../lib/workflows/runner/claim-next-step");
  return claimNextDueStepRun({ supabase: db as never, nowIso });
}

// ── one step per tick ──────────────────────────────────────────────────────────────

describe("a tick claims at most one step", () => {
  it("claims the single due step and marks it running", async () => {
    const db = seed([step()]);
    const claimed = await claim(db);

    assert.equal(claimed?.id, "step-1");
    assert.equal(db.rows("workflow_step_runs")[0].status, "running");
  });

  it("claims exactly one when several are due", async () => {
    const db = seed([
      step({ id: "a", scheduled_at: "2026-08-12T09:00:00.000Z" }),
      step({ id: "b", scheduled_at: "2026-08-12T09:30:00.000Z" }),
      step({ id: "c", scheduled_at: "2026-08-12T09:45:00.000Z" }),
    ]);

    await claim(db);

    const running = db.rows("workflow_step_runs").filter((r) => r.status === "running");
    assert.equal(running.length, 1, "a tick must never claim two steps");
  });

  it("claims the OLDEST due step, so the queue drains in order", async () => {
    const db = seed([
      step({ id: "newer", scheduled_at: "2026-08-12T09:45:00.000Z" }),
      step({ id: "older", scheduled_at: "2026-08-12T09:00:00.000Z" }),
    ]);

    const claimed = await claim(db);
    assert.equal(claimed?.id, "older");
  });

  it("returns null when nothing is queued", async () => {
    assert.equal(await claim(seed([])), null);
  });

  it("does not claim a step scheduled in the future", async () => {
    const db = seed([step({ scheduled_at: FUTURE })]);
    assert.equal(await claim(db), null);
    assert.equal(db.rows("workflow_step_runs")[0].status, "queued");
  });

  it("does not claim a step that is already running", async () => {
    const db = seed([step({ status: "running" })]);
    assert.equal(await claim(db), null);
  });

  it("does not claim a completed or failed step", async () => {
    for (const status of ["succeeded", "failed", "cancelled"]) {
      assert.equal(await claim(seed([step({ status })])), null, `${status} must not be reclaimed`);
    }
  });

  it("scopes to one run when a runId is supplied", async () => {
    const db = seed([step({ id: "mine", run_id: "run-1" }), step({ id: "theirs", run_id: "run-2" })]);
    const { claimNextDueStepRun } = await import("../../lib/workflows/runner/claim-next-step");
    const claimed = await claimNextDueStepRun({ supabase: db as never, nowIso: NOW, runId: "run-2" });
    assert.equal(claimed?.id, "theirs");
  });
});

// ── attempt accounting ─────────────────────────────────────────────────────────────

describe("attempt accounting is correct across retries", () => {
  it("increments attempt_count on claim", async () => {
    const db = seed([step({ attempt_count: 0 })]);
    const claimed = await claim(db);
    assert.equal(claimed?.attempt_count, 1);
    assert.equal(db.rows("workflow_step_runs")[0].attempt_count, 1);
  });

  it("continues from an existing attempt_count rather than resetting it", async () => {
    const db = seed([step({ attempt_count: 3 })]);
    const claimed = await claim(db);
    assert.equal(claimed?.attempt_count, 4, "resetting would hide a step that keeps failing");
  });

  it("stamps a fresh attempt_id each claim, so attempts are distinguishable", async () => {
    const first = seed([step()]);
    const second = seed([step()]);
    const a = await claim(first);
    const b = await claim(second);
    assert.ok(a?.attempt_id, "an attempt id must be assigned");
    assert.notEqual(a?.attempt_id, b?.attempt_id);
  });

  it("clears the previous error when re-claiming, so a stale error cannot mislead", async () => {
    const db = seed([step({ error_text: "previous failure", error_code: "boom" })]);
    await claim(db);
    const row = db.rows("workflow_step_runs")[0];
    assert.equal(row.error_text, null);
    assert.equal(row.error_code, null);
  });

  it("records started_at at claim time", async () => {
    const db = seed([step()]);
    await claim(db, NOW);
    assert.equal(db.rows("workflow_step_runs")[0].started_at, NOW);
  });
});

// ── the reachable race: cron GET vs in-process POST kick ───────────────────────────

describe("compare-and-set prevents a double claim (the reachable race)", () => {
  it("a second claim on the same queue finds nothing left to claim", async () => {
    // Simulates cron and the in-process kick overlapping: the first claim flips the row
    // to `running`, so the second tick's `.eq("status","queued")` guard matches nothing.
    const db = seed([step()]);

    const first = await claim(db);
    const second = await claim(db);

    assert.equal(first?.id, "step-1");
    assert.equal(second, null, "the second tick must not claim an already-claimed step");
    assert.equal(db.rows("workflow_step_runs").filter((r) => r.status === "running").length, 1);
  });

  it("the update is guarded on status, not only on id", async () => {
    const db = seed([step()]);
    await claim(db);

    const update = db.queriesFor("workflow_step_runs", "update").at(-1);
    assert.ok(update, "a claim must issue an update");
    assert.ok(update!.filteredColumns.includes("id"), "must target one row");
    assert.ok(
      update!.filteredColumns.includes("status"),
      "without the status predicate two overlapping ticks could both claim the same step"
    );
  });

  it("losing the race yields null and leaves no side effect", async () => {
    const db = seed([step()]);
    await claim(db);
    const beforeSecond = JSON.stringify(db.rows("workflow_step_runs"));

    const lost = await claim(db);

    assert.equal(lost, null);
    assert.equal(JSON.stringify(db.rows("workflow_step_runs")), beforeSecond, "a lost race must mutate nothing");
  });

  it("the endpoint really does accept both GET and POST — the race is reachable", () => {
    const route = readFileSync("app/api/internal/workflow-tick/route.ts", "utf8");
    assert.match(route, /export async function GET/);
    assert.match(route, /export async function POST/);
    assert.match(route, /in-process kick/i, "the POST kick is documented as a real caller");
  });

  it("vercel.json declares exactly one cron, so there is no worker pool to simulate", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons?: Array<{ path: string }> };
    assert.equal(vercel.crons?.length, 1);
    assert.equal(vercel.crons?.[0].path, "/api/internal/workflow-tick");
  });
});

// ── the missing lease ──────────────────────────────────────────────────────────────

describe("stuck-step recovery (LR-PROD-001)", () => {
  /**
   * LR-PROD-001 (recorded in Prompt 1) — nothing returns a step from `running` to
   * `queued`. A handler that dies after the claim but before completion leaves the row
   * `running` forever, and no later tick will ever pick it up.
   *
   * `reconcileStaleConversationProcessing` exists for conversations; there is no
   * equivalent for `workflow_step_runs`.
   */
  // KNOWN-DEFECT: LR-PROD-001 — a step stranded in `running` must eventually be retried.
  it.skip("KNOWN-DEFECT: LR-PROD-001 — a stale running step is reclaimed after its lease expires", async () => {
    const db = seed([step({ status: "running", started_at: "2026-08-12T08:00:00.000Z" })]);
    const claimed = await claim(db, NOW); // two hours later
    assert.notEqual(claimed, null, "a step stuck running for two hours must be recoverable");
  });

  it("DOCUMENTED: a step stranded in `running` is never reclaimed (LR-PROD-001)", async () => {
    const db = seed([step({ status: "running", started_at: "2026-08-12T08:00:00.000Z" })]);
    assert.equal(await claim(db, NOW), null, "two hours stale, still not reclaimed");
    assert.equal(await claim(db, "2026-08-19T10:00:00.000Z"), null, "a week later, still not reclaimed");
  });

  it("DOCUMENTED: no lease or stale-reset exists in the claim path (LR-PROD-001)", () => {
    const source = readFileSync("lib/workflows/runner/claim-next-step.ts", "utf8");
    assert.doesNotMatch(source, /lease|stale|expir|reclaim/i);
    // The mobile outbox has exactly this recovery (`resetStaleRunningOutboxJobs`), so the
    // pattern exists in the codebase — it was simply never applied to workflow steps.
  });
});
