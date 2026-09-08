/**
 * Workflow trigger journey (new lead + updated lead).
 *
 * Drives the REAL canonical trigger logic (no server-only): template eligibility resolution
 * (`isTemplateEligibleForLead` / `filterEligibleTemplatesForLead`), capture qualification
 * (`leadHasWorkflowQualificationSignal`), and the run-row builder (`buildWorkflowRunInsertRows`,
 * the same pure builder `create-run.ts` uses). Proves a triggered run references the correct
 * lead/company/event with the right trigger metadata and initial state, and that the trigger
 * fingerprint is stable (the basis for create-run idempotency).
 *
 * Updated-lead behavior is proven via qualification gating here; the canonical reconciler path
 * (`reconcileRecentLeadCapturedWorkflows`) has dedicated coverage in
 * `workflow-lead-reconciler.test.ts` and `workflow-create-run-idempotency.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTemplateEligibleForLead,
  filterEligibleTemplatesForLead,
} from "../../lib/workflows/emit/trigger-resolver";
import { buildWorkflowRunInsertRows } from "../../lib/workflows/runner/build-run-rows";
import { leadHasWorkflowQualificationSignal } from "../../lib/leads/leadWorkflowQualification";

const EVENT_A = "11111111-1111-1111-1111-111111111111";
const EVENT_B = "22222222-2222-2222-2222-222222222222";
const NOW = "2026-06-29T12:00:00.000Z";

describe("workflow trigger journey — template eligibility by scope and event pin", () => {
  it("scope=any fires for any container; scope=event fires only for the pinned event", () => {
    const anyTemplate = { scope: "any" as const, event_id: null };
    assert.equal(isTemplateEligibleForLead(anyTemplate, { eventId: null, containerKind: null }), true);
    assert.equal(isTemplateEligibleForLead(anyTemplate, { eventId: EVENT_A, containerKind: "event" }), true);

    const eventTemplate = { scope: "event" as const, event_id: EVENT_A };
    assert.equal(isTemplateEligibleForLead(eventTemplate, { eventId: EVENT_A, containerKind: "event" }), true);
    assert.equal(isTemplateEligibleForLead(eventTemplate, { eventId: EVENT_B, containerKind: "event" }), false);
    assert.equal(isTemplateEligibleForLead(eventTemplate, { eventId: null, containerKind: null }), false);
  });

  it("filters a template set down to those eligible for the lead", () => {
    const templates = [
      { scope: "any" as const, event_id: null },
      { scope: "event" as const, event_id: EVENT_A },
      { scope: "event" as const, event_id: EVENT_B },
    ];
    const eligible = filterEligibleTemplatesForLead(templates, { eventId: EVENT_A, containerKind: "event" });
    assert.equal(eligible.length, 2);
    assert.ok(eligible.includes(templates[0]));
    assert.ok(eligible.includes(templates[1]));
    assert.ok(!eligible.includes(templates[2]));
  });
});

describe("workflow trigger journey — qualification gates new vs updated leads", () => {
  it("a raw new lead does not qualify; a qualified update does", () => {
    // Raw capture (matches the create route deferring emit until qualification).
    assert.equal(
      leadHasWorkflowQualificationSignal({ rating: 0, temperature: null, status: "new" }),
      false
    );
    // Updated leads that cross a qualification signal trigger.
    assert.equal(leadHasWorkflowQualificationSignal({ rating: 5, temperature: null, status: "new" }), true);
    assert.equal(leadHasWorkflowQualificationSignal({ rating: 0, temperature: "hot", status: "new" }), true);
    assert.equal(leadHasWorkflowQualificationSignal({ rating: 0, temperature: null, status: "follow_up" }), true);
  });
});

describe("workflow trigger journey — run rows reference the captured lead and trigger metadata", () => {
  const capture = { companyId: "co-1", leadId: "lead-1", eventId: EVENT_A } as const;
  const triggerPayload = { trigger_event: "lead_captured" } as unknown as Parameters<
    typeof buildWorkflowRunInsertRows
  >[0]["triggerPayload"];

  it("builds a queued run scoped to the lead/company/event with the trigger fingerprint", () => {
    const { runRow, stepRunRowsForRunId } = buildWorkflowRunInsertRows({
      templateId: "tpl-1",
      templateVersion: 1,
      steps: [
        { id: "step-0", step_index: 0, step_key: "enrich" },
        { id: "step-1", step_index: 1, step_key: "compose" },
      ],
      capture: capture as any,
      triggerPayload,
      triggerFingerprint: "rating:5|temperature:hot",
      nowIso: NOW,
    });

    assert.equal(runRow.company_id, "co-1");
    assert.equal(runRow.lead_id, "lead-1");
    assert.equal(runRow.event_id, EVENT_A);
    assert.equal(runRow.trigger_event, "lead_captured");
    assert.equal(runRow.trigger_fingerprint, "rating:5|temperature:hot");
    assert.equal(runRow.status, "queued");
    assert.equal(runRow.current_step_index, 0);

    const stepRuns = stepRunRowsForRunId("run-1");
    assert.equal(stepRuns.length, 2);
    assert.equal(stepRuns[0].run_id, "run-1");
    assert.equal(stepRuns[0].scheduled_at, NOW); // step 0 claimable now
    assert.equal(stepRuns[1].scheduled_at, "infinity"); // later steps held until predecessor completes
    assert.ok(stepRuns.every((s) => s.status === "queued"));
  });

  it("a zero-step template produces an immediately-completed run, not a stuck queue", () => {
    const { runRow } = buildWorkflowRunInsertRows({
      templateId: "tpl-empty",
      templateVersion: 1,
      steps: [],
      capture: capture as any,
      triggerPayload,
      triggerFingerprint: "default",
      nowIso: NOW,
    });
    assert.equal(runRow.status, "completed");
    assert.equal(runRow.completed_at, NOW);
    assert.equal(runRow.current_step_index, null);
  });

  it("the trigger fingerprint is stable for the same rule (idempotency basis)", () => {
    const build = () =>
      buildWorkflowRunInsertRows({
        templateId: "tpl-1",
        templateVersion: 1,
        steps: [{ id: "step-0", step_index: 0, step_key: "enrich" }],
        capture: capture as any,
        triggerPayload,
        triggerFingerprint: "rule:hot-5",
        nowIso: NOW,
      }).runRow.trigger_fingerprint;
    assert.equal(build(), build());
  });
});
