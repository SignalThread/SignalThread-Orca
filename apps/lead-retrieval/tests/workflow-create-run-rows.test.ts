import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorkflowRunInsertRows } from "../lib/workflows/runner/build-run-rows";
import type {
  LeadCaptureContext,
  LeadCapturedTriggerPayload
} from "../lib/workflows/contracts/workflow-types";

const NOW = "2026-01-01T00:00:00.000Z";

const CAPTURE: LeadCaptureContext = {
  leadId: "lead-1",
  companyId: "co-1",
  eventId: "evt-1",
  containerKind: "event",
  source: "mobile_capture"
};

const PAYLOAD: LeadCapturedTriggerPayload = {
  trigger_event: "lead_captured",
  lead_id: "lead-1",
  company_id: "co-1",
  event_id: "evt-1",
  container_kind: "event",
  source: "mobile_capture",
  emitted_at: NOW
};

describe("buildWorkflowRunInsertRows", () => {
  it("with steps: marks run queued, schedules step 0 immediately, defers later steps", () => {
    const { runRow, stepRunRowsForRunId } = buildWorkflowRunInsertRows({
      templateId: "tpl-1",
      templateVersion: 3,
      steps: [
        { id: "s2", step_index: 1, step_key: "compose" },
        { id: "s1", step_index: 0, step_key: "enrich" },
        { id: "s3", step_index: 2, step_key: "send" }
      ],
      capture: CAPTURE,
      triggerPayload: PAYLOAD,
      nowIso: NOW
    });

    assert.equal(runRow.status, "queued");
    assert.equal(runRow.current_step_index, 0);
    assert.equal(runRow.completed_at, null);
    assert.equal(runRow.template_id, "tpl-1");
    assert.equal(runRow.template_version, 3);
    assert.equal(runRow.lead_id, "lead-1");
    assert.equal(runRow.event_id, "evt-1");
    assert.deepEqual(runRow.trigger_payload_jsonb, PAYLOAD);

    const stepRows = stepRunRowsForRunId("run-1");
    assert.equal(stepRows.length, 3);

    // Sorted by step_index ascending.
    assert.deepEqual(
      stepRows.map((r) => r.step_index),
      [0, 1, 2]
    );
    assert.deepEqual(
      stepRows.map((r) => r.step_key),
      ["enrich", "compose", "send"]
    );

    // Only step 0 is immediately due.
    assert.equal(stepRows[0]!.scheduled_at, NOW);
    assert.equal(stepRows[1]!.scheduled_at, "infinity");
    assert.equal(stepRows[2]!.scheduled_at, "infinity");

    // All start queued, no attempt yet.
    assert.deepEqual(
      stepRows.map((r) => r.status),
      ["queued", "queued", "queued"]
    );
    assert.deepEqual(
      stepRows.map((r) => r.attempt_count),
      [0, 0, 0]
    );
    assert.deepEqual(
      stepRows.map((r) => r.attempt_id),
      [null, null, null]
    );

    // run_id is filled per-call.
    assert.equal(stepRows[0]!.run_id, "run-1");
  });

  it("with zero steps: marks run completed immediately and produces no step rows", () => {
    const { runRow, stepRunRowsForRunId } = buildWorkflowRunInsertRows({
      templateId: "tpl-2",
      templateVersion: 1,
      steps: [],
      capture: CAPTURE,
      triggerPayload: PAYLOAD,
      nowIso: NOW
    });

    assert.equal(runRow.status, "completed");
    assert.equal(runRow.current_step_index, null);
    assert.equal(runRow.completed_at, NOW);
    assert.deepEqual(stepRunRowsForRunId("run-x"), []);
  });
});
