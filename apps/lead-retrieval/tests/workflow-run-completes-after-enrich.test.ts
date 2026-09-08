import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeClaimedStepRun } from "../lib/workflows/runner/run-step";
import { buildWorkflowHandlerRegistry } from "../lib/workflows/contracts/step-handler";
import { ENRICH_LEAD_STEP_TYPE } from "../lib/workflows/step-handlers/enrich-lead-pure";
import type { WorkflowHandler } from "../lib/workflows/contracts/step-handler";
import type {
  WorkflowRunRow,
  WorkflowStepRow,
  WorkflowStepRunRow
} from "../lib/workflows/contracts/workflow-types";
import type { createAdminClient } from "../lib/supabase/admin";

/**
 * Mini in-memory supabase shim sufficient for the runner's call surface:
 *   - workflow_runs:        select+eq+maybeSingle, update+eq
 *   - workflow_steps:       select+eq+maybeSingle
 *   - workflow_step_runs:   select+eq+lt+in, select+eq+eq+maybeSingle, update+eq
 *
 * The shape it exposes matches `ReturnType<typeof createAdminClient>` strictly enough
 * for the runner. We cast through `unknown` because the runner uses `as unknown as ...`
 * accessors itself.
 */
type Row = Record<string, unknown>;

type Filter = { kind: "eq" | "lt" | "lte" | "in"; col: string; val: unknown };

function applyFilter(rows: Row[], filter: Filter): Row[] {
  return rows.filter((row) => {
    const value = row[filter.col];
    if (filter.kind === "eq") return value === filter.val;
    if (filter.kind === "lt") return typeof value === "number" && value < (filter.val as number);
    if (filter.kind === "lte") {
      if (typeof value === "number") return value <= (filter.val as number);
      return String(value) <= String(filter.val);
    }
    if (filter.kind === "in") return (filter.val as unknown[]).includes(value);
    return true;
  });
}

function createFakeSupabase(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(initial)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }
  const calls: Array<{ table: string; op: string; patch?: Row; filters: Filter[] }> = [];

  function builder(tableName: string) {
    const filters: Filter[] = [];
    let updatePatch: Row | null = null;
    let insertPayload: Row | Row[] | null = null;
    let mode: "select" | "update" | "insert" | null = null;

    const obj: Record<string, unknown> = {};
    obj.select = (_cols: string) => {
      mode = "select";
      return obj;
    };
    obj.update = (patch: Row) => {
      mode = "update";
      updatePatch = patch;
      return obj;
    };
    obj.insert = (payload: Row | Row[]) => {
      mode = "insert";
      insertPayload = payload;
      return obj;
    };
    obj.eq = (col: string, val: unknown) => {
      filters.push({ kind: "eq", col, val });
      return obj;
    };
    obj.lt = (col: string, val: unknown) => {
      filters.push({ kind: "lt", col, val });
      return obj;
    };
    obj.lte = (col: string, val: unknown) => {
      filters.push({ kind: "lte", col, val });
      return obj;
    };
    obj.in = (col: string, val: unknown[]) => {
      filters.push({ kind: "in", col, val });
      return obj;
    };
    obj.order = (_col: string, _opts: unknown) => obj;
    obj.limit = (_n: number) => obj;

    obj.maybeSingle = async () => {
      const matched = applyFilter(tables[tableName] ?? [], filters[0] ?? { kind: "eq", col: "id", val: undefined });
      let rows = tables[tableName] ?? [];
      for (const f of filters) rows = applyFilter(rows, f);
      const first = rows[0] ?? null;
      calls.push({ table: tableName, op: `${mode ?? "select"}+maybeSingle`, filters });
      return { data: first, error: null };
    };

    obj.then = async (onFulfilled: (v: { data: unknown; error: null }) => unknown) => {
      let rows = tables[tableName] ?? [];
      for (const f of filters) rows = applyFilter(rows, f);

      if (mode === "select") {
        calls.push({ table: tableName, op: "select", filters });
        return onFulfilled({ data: rows, error: null });
      }

      if (mode === "update" && updatePatch) {
        for (let i = 0; i < tables[tableName].length; i += 1) {
          if (rows.includes(tables[tableName][i])) {
            tables[tableName][i] = { ...tables[tableName][i], ...updatePatch };
          }
        }
        calls.push({ table: tableName, op: "update", patch: updatePatch, filters });
        return onFulfilled({ data: null, error: null });
      }

      if (mode === "insert" && insertPayload) {
        const rowsToInsert = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
        tables[tableName] = tables[tableName] ?? [];
        tables[tableName].push(...rowsToInsert);
        calls.push({ table: tableName, op: "insert", patch: rowsToInsert[0], filters: [] });
        return onFulfilled({ data: null, error: null });
      }

      return onFulfilled({ data: null, error: null });
    };

    return obj;
  }

  return {
    from: builder,
    _tables: tables,
    _calls: calls
  };
}

function makeRun(): WorkflowRunRow {
  return {
    id: "run-1",
    company_id: "co-1",
    template_id: "tpl-1",
    template_version: 1,
    lead_id: "lead-1",
    event_id: null,
    trigger_event: "lead_captured",
    trigger_payload_jsonb: {},
    status: "queued",
    current_step_index: 0,
    started_at: null,
    completed_at: null,
    created_at: "2026-05-13T01:00:00.000Z",
    updated_at: "2026-05-13T01:00:00.000Z"
  };
}

function makeStep(stepType: string): WorkflowStepRow {
  return {
    id: "step-1",
    template_id: "tpl-1",
    step_index: 0,
    step_type: stepType,
    step_key: "enrich",
    params_jsonb: {},
    requires_approval: false,
    created_at: "2026-05-13T01:00:00.000Z",
    updated_at: "2026-05-13T01:00:00.000Z"
  };
}

function makeStepRun(): WorkflowStepRunRow {
  return {
    id: "step-run-1",
    run_id: "run-1",
    step_id: "step-1",
    step_index: 0,
    step_key: "enrich",
    status: "running",
    attempt_count: 1,
    attempt_id: "att-1",
    scheduled_at: "2026-05-13T01:00:00.000Z",
    started_at: "2026-05-13T01:00:00.000Z",
    completed_at: null,
    input_jsonb: null,
    output_jsonb: null,
    error_text: null,
    error_code: null,
    created_at: "2026-05-13T01:00:00.000Z",
    updated_at: "2026-05-13T01:00:00.000Z"
  };
}

function asAdminClient(fake: ReturnType<typeof createFakeSupabase>) {
  return fake as unknown as ReturnType<typeof createAdminClient>;
}

function stubEnrichHandler(result: Awaited<ReturnType<WorkflowHandler["run"]>>): WorkflowHandler {
  return {
    stepType: ENRICH_LEAD_STEP_TYPE,
    displayName: "Enrich lead (stub)",
    async run() {
      return result;
    }
  };
}

describe("executeClaimedStepRun + enrich_lead", () => {
  it("marks step completed and run completed when enrich_lead returns ok (single-step template)", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [makeStep(ENRICH_LEAD_STEP_TYPE)],
      workflow_step_runs: [makeStepRun()]
    });

    const registry = buildWorkflowHandlerRegistry([
      stubEnrichHandler({
        kind: "ok",
        output: { outcome: "updated", enriched_fields: ["job_title"] }
      })
    ]);

    const { outcome } = await executeClaimedStepRun({
      supabase: asAdminClient(fake),
      registry,
      claimed: makeStepRun(),
      handlerTimeoutMs: 5000
    });

    assert.equal(outcome, "ok");

    const stepRun = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(stepRun.status, "completed");
    assert.ok(stepRun.completed_at);
    const out = stepRun.output_jsonb as { outcome?: string };
    assert.equal(out.outcome, "updated");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "completed");
    assert.ok(run.completed_at);
  });

  it("fails safely with unknown_step_type when the registry has no matching handler", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [makeStep("not_a_real_step_type")],
      workflow_step_runs: [makeStepRun()]
    });

    const emptyRegistry = buildWorkflowHandlerRegistry([]);

    const { outcome } = await executeClaimedStepRun({
      supabase: asAdminClient(fake),
      registry: emptyRegistry,
      claimed: makeStepRun(),
      handlerTimeoutMs: 5000
    });

    assert.equal(outcome, "unknown_step_type");

    const stepRun = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(stepRun.status, "failed");
    assert.equal(stepRun.error_code, "unknown_step_type");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "failed");
  });

  it("reschedules the step run on retry without modifying parent run status", async () => {
    const fake = createFakeSupabase({
      workflow_runs: [makeRun()],
      workflow_steps: [makeStep(ENRICH_LEAD_STEP_TYPE)],
      workflow_step_runs: [makeStepRun()]
    });

    const registry = buildWorkflowHandlerRegistry([
      stubEnrichHandler({
        kind: "retry",
        retryAfterMs: 60_000,
        errorText: "Failed to store enrichment payload: 502",
        errorCode: "enrichment_transient"
      })
    ]);

    const { outcome } = await executeClaimedStepRun({
      supabase: asAdminClient(fake),
      registry,
      claimed: makeStepRun(),
      handlerTimeoutMs: 5000
    });

    assert.equal(outcome, "retry");

    const stepRun = fake._tables.workflow_step_runs[0] as Record<string, unknown>;
    assert.equal(stepRun.status, "queued");
    assert.equal(stepRun.error_code, "enrichment_transient");
    // Scheduled in the future:
    const scheduledAt = new Date(String(stepRun.scheduled_at)).getTime();
    assert.ok(scheduledAt > Date.now(), "retry should schedule for the future");

    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    // Run was not changed to failed/completed:
    assert.equal(run.status, "queued");
  });
});
