import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import type { createAdminClient } from "@/lib/supabase/admin";
import { runLeadWorkflowReconcilerForCron } from "@/lib/workflows/reconcile/lead-workflow-cron-reconciler";
import { reconcileRecentLeadCapturedWorkflows } from "@/lib/workflows/reconcile/lead-workflow-reconciler";
import { asAdminClient, createFakeSupabase, type FakeSupabaseOptions } from "./helpers/fake-supabase";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, NodeJS.Module | undefined>)[serverOnlyPath] = {
  id: serverOnlyPath,
  path: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {},
  isPreloading: false,
  require,
  parent: null
} as unknown as NodeJS.Module;

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const EVENT_A = "event-a";
const EVENT_B = "event-b";
const LEAD_A = "lead-a";
const TEMPLATE_A = "template-a";
const NOW = "2026-06-09T18:00:00.000Z";
const SINCE = "2026-06-09T17:00:00.000Z";
const TICK_URL = `https://example.test/api/internal/workflow-tick?companyId=${COMPANY_A}&eventId=${EVENT_A}&since=${encodeURIComponent(SINCE)}&until=${encodeURIComponent(NOW)}&limit=10`;

function fakeAdmin(
  initial: Record<string, Array<Record<string, unknown>>>,
  options?: FakeSupabaseOptions
) {
  return asAdminClient<ReturnType<typeof createAdminClient>>(
    createFakeSupabase({
      leads: [],
      events: [],
      workflow_templates: [],
      workflow_steps: [],
      workflow_runs: [],
      workflow_step_runs: [],
      ...initial
    }, options)
  );
}

function baseLead(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_A,
    company_id: COMPANY_A,
    event_id: EVENT_A,
    created_at: NOW,
    ...overrides
  };
}

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_A,
    company_id: COMPANY_A,
    container_kind: "event",
    ...overrides
  };
}

function baseTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: TEMPLATE_A,
    company_id: COMPANY_A,
    version: 1,
    scope: "event",
    event_id: EVENT_A,
    trigger_event: "lead_captured",
    is_enabled: true,
    ...overrides
  };
}

function leadCapturedRule(overrides: Record<string, unknown>) {
  return {
    lead_captured: {
      ruleId: "rule-a",
      ...overrides
    }
  };
}

function baseStep(overrides: Record<string, unknown> = {}) {
  return {
    id: "step-a",
    template_id: TEMPLATE_A,
    step_index: 0,
    step_key: "enrich",
    ...overrides
  };
}

function safeCronEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    WORKFLOW_RECONCILER_CRON_SAFE_CREATE_ENABLED: "true",
    WORKFLOW_RECONCILER_CRON_COMPANY_ID: COMPANY_A,
    WORKFLOW_RECONCILER_CRON_EVENT_ID: EVENT_A,
    WORKFLOW_RECONCILER_CRON_COMPANY_ALLOWLIST: COMPANY_A,
    WORKFLOW_RECONCILER_CRON_EVENT_ALLOWLIST: EVENT_A,
    WORKFLOW_RECONCILER_CRON_WINDOW_MINUTES: "60",
    WORKFLOW_RECONCILER_CRON_LIMIT: "5",
    WORKFLOW_RECONCILER_CRON_MAX_CREATE: "5",
    ...overrides
  };
}

describe("strict lead workflow reconciler", () => {
  it("detects a direct DB-created lead with exact event-pinned matching workflow in dry-run", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.scannedLeadCount, 1);
    assert.equal(result.wouldCreateCount, 1);
    assert.equal(result.createdRunCount, 0);
    assert.deepEqual(result.decisions, [
      {
        candidateLeadId: LEAD_A,
        leadCompanyId: COMPANY_A,
        leadEventId: EVENT_A,
        matchedTemplateId: TEMPLATE_A,
        reasonMatched: "strict_event_pinned_lead_captured",
        reasonSkipped: null,
        wouldCreateRun: true,
        createdRunId: null
      }
    ]);
    assert.equal((fake as any)._tables.workflow_runs.length, 0);
  });

  it("dry-run scans only leads inside explicit since/until/company/event bounds", async () => {
    const fake = fakeAdmin({
      leads: [
        baseLead({ id: "lead-inside", created_at: "2026-06-09T17:30:00.000Z" }),
        baseLead({ id: "lead-before", created_at: "2026-06-09T16:59:59.000Z" }),
        baseLead({ id: "lead-after", created_at: "2026-06-09T18:00:01.000Z" }),
        baseLead({ id: "lead-other-company", company_id: COMPANY_B, created_at: "2026-06-09T17:30:00.000Z" }),
        baseLead({ id: "lead-other-event", event_id: EVENT_B, created_at: "2026-06-09T17:30:00.000Z" })
      ],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.untilIso, NOW);
    assert.equal(result.scannedLeadCount, 1);
    assert.equal(result.wouldCreateCount, 1);
    assert.equal(result.decisions[0]?.candidateLeadId, "lead-inside");
    assert.equal((fake as any)._tables.workflow_runs.length, 0);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 0);
  });

  it("matches 4 or 5 star lead capture rules", async () => {
    const fake = fakeAdmin({
      leads: [baseLead({ rating: 5 })],
      events: [baseEvent()],
      workflow_templates: [
        baseTemplate({
          trigger_conditions_jsonb: leadCapturedRule({
            ruleId: "rating-4-or-5",
            rating: { in: [4, 5] }
          })
        })
      ],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.wouldCreateCount, 1);
    assert.equal(result.decisions[0]?.reasonMatched, "strict_event_pinned_lead_captured_rule");
    assert.equal((fake as any)._tables.workflow_runs.length, 0);
  });

  it("matches 3 star lead capture rules", async () => {
    const fake = fakeAdmin({
      leads: [baseLead({ rating: 3 })],
      events: [baseEvent()],
      workflow_templates: [
        baseTemplate({
          trigger_conditions_jsonb: leadCapturedRule({
            ruleId: "rating-3",
            rating: { eq: 3 }
          })
        })
      ],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.wouldCreateCount, 1);
    assert.equal(result.decisions[0]?.reasonMatched, "strict_event_pinned_lead_captured_rule");
  });

  it("matches warm lead capture rules", async () => {
    const fake = fakeAdmin({
      leads: [baseLead({ temperature: "Warm" })],
      events: [baseEvent()],
      workflow_templates: [
        baseTemplate({
          trigger_conditions_jsonb: leadCapturedRule({
            ruleId: "warm-lead",
            temperature: "warm"
          })
        })
      ],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.wouldCreateCount, 1);
    assert.equal(result.decisions[0]?.reasonMatched, "strict_event_pinned_lead_captured_rule");
  });

  it("matches cold lead capture rules", async () => {
    const fake = fakeAdmin({
      leads: [baseLead({ temperature: "cold" })],
      events: [baseEvent()],
      workflow_templates: [
        baseTemplate({
          trigger_conditions_jsonb: leadCapturedRule({
            ruleId: "cold-lead",
            temperature: { in: ["cold"] }
          })
        })
      ],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.wouldCreateCount, 1);
    assert.equal(result.decisions[0]?.reasonMatched, "strict_event_pinned_lead_captured_rule");
  });

  it("skips when lead capture rule fields do not match", async () => {
    const fake = fakeAdmin({
      leads: [baseLead({ rating: 2, temperature: "cold" })],
      events: [baseEvent()],
      workflow_templates: [
        baseTemplate({
          trigger_conditions_jsonb: leadCapturedRule({
            ruleId: "warm-high-rating",
            rating: { gte: 4 },
            temperature: "warm"
          })
        })
      ],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.wouldCreateCount, 0);
    assert.equal(result.decisions[0]?.reasonSkipped, "lead_rule_mismatch");
  });

  it("matches source rules from lead metadata", async () => {
    const fake = fakeAdmin({
      leads: [baseLead({ metadata: { source: "mobile_capture" } })],
      events: [baseEvent()],
      workflow_templates: [
        baseTemplate({
          trigger_conditions_jsonb: leadCapturedRule({
            ruleId: "mobile-source",
            source: "mobile_capture"
          })
        })
      ],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.wouldCreateCount, 1);
    assert.equal(result.decisions[0]?.reasonMatched, "strict_event_pinned_lead_captured_rule");
  });

  it("keeps company/event strict scoping before applying lead rules", async () => {
    const fake = fakeAdmin({
      leads: [baseLead({ rating: 5 })],
      events: [baseEvent()],
      workflow_templates: [
        baseTemplate({
          event_id: EVENT_B,
          trigger_conditions_jsonb: leadCapturedRule({
            ruleId: "rating-5",
            rating: 5
          })
        })
      ],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.wouldCreateCount, 0);
    assert.equal(result.decisions[0]?.reasonSkipped, "no_strict_event_pinned_templates");
  });

  it("idempotency includes the rule fingerprint", async () => {
    const fake = fakeAdmin({
      leads: [baseLead({ rating: 5 })],
      events: [baseEvent()],
      workflow_templates: [
        baseTemplate({
          trigger_conditions_jsonb: leadCapturedRule({
            ruleId: "rating-5",
            rating: 5
          })
        })
      ],
      workflow_steps: [baseStep()],
      workflow_runs: [
        {
          id: "existing-other-rule-run",
          template_id: TEMPLATE_A,
          lead_id: LEAD_A,
          trigger_event: "lead_captured",
          trigger_fingerprint: "rule:other-rating",
          status: "queued"
        }
      ]
    });

    const first = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      safeCreate: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(first.createdRunCount, 1);
    assert.equal((fake as any)._tables.workflow_runs.length, 2);
    const createdRun = (fake as any)._tables.workflow_runs[1] as Record<string, unknown>;
    assert.equal(createdRun.trigger_fingerprint, "rule:rating-5");
    assert.equal(createdRun.status, "awaiting_approval");
    const hold = (createdRun.trigger_payload_jsonb as any).reconciled_hold as Record<string, unknown>;
    assert.equal(hold.matched_rule_id, "rating-5");
    assert.match(String(hold.trigger_fingerprint), /^rule:rating-5:/);

    const second = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      safeCreate: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(second.createdRunCount, 0);
    assert.equal(second.decisions[0]?.reasonSkipped, "active_run_exists");
    assert.equal((fake as any)._tables.workflow_runs.length, 2);
  });

  it("safe-create creates exactly one held non-runnable run with held step rows", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep(), baseStep({ id: "step-b", step_index: 1, step_key: "send_email" })]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      safeCreate: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.createdRunCount, 1);
    assert.equal(result.wouldCreateCount, 0);
    assert.equal((fake as any)._tables.workflow_runs.length, 1);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 2);

    const run = (fake as any)._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.company_id, COMPANY_A);
    assert.equal(run.template_id, TEMPLATE_A);
    assert.equal(run.lead_id, LEAD_A);
    assert.equal(run.event_id, EVENT_A);
    const payload = run.trigger_payload_jsonb as Record<string, unknown>;
    const hold = payload.reconciled_hold as Record<string, unknown>;
    assert.equal(hold.source, "lead_workflow_reconciler_safe_create");
    assert.equal(hold.mode, "safe_create");
    assert.equal(hold.original_lead_id, LEAD_A);
    assert.equal(hold.matched_template_id, TEMPLATE_A);
    assert.equal(
      hold.trigger_fingerprint,
      `default:${TEMPLATE_A}:${LEAD_A}:${COMPANY_A}:${EVENT_A}`
    );

    for (const stepRun of (fake as any)._tables.workflow_step_runs as Array<Record<string, unknown>>) {
      assert.equal(stepRun.status, "awaiting_approval");
      assert.equal(stepRun.scheduled_at, "infinity");
      assert.notEqual(stepRun.status, "queued");
    }
    assert.equal(
      ((fake as any)._tables.workflow_step_runs as Array<Record<string, unknown>>).some(
        (stepRun) => stepRun.step_key === "send_email" && stepRun.status === "queued"
      ),
      false
    );
  });

  it("safe-create rerun is idempotent because the held run is active", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      safeCreate: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });
    const second = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      safeCreate: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal((fake as any)._tables.workflow_runs.length, 1);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 1);
    assert.equal(second.createdRunCount, 0);
    assert.equal(second.decisions[0]?.reasonSkipped, "active_run_exists");
  });

  it("normal cron claim query does not pick up held reconciled step rows", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      safeCreate: true,
      sinceIso: SINCE,
      untilIso: NOW,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    const { claimNextDueStepRun } = await import("@/lib/workflows/runner/claim-next-step");
    const claimed = await claimNextDueStepRun({ supabase: fake, nowIso: NOW });

    assert.equal(claimed, null);
    assert.equal(((fake as any)._tables.workflow_step_runs[0] as Record<string, unknown>).status, "awaiting_approval");
  });

  it("safe-create refuses to run without explicit until bounds", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      safeCreate: true,
      sinceIso: SINCE,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A
    });

    assert.equal(result.error, "safe_create_requires_explicit_company_event_since_until");
    assert.equal((fake as any)._tables.workflow_runs.length, 0);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 0);
  });

  it("cron reconciler defaults to dry-run and writes nothing", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await runLeadWorkflowReconcilerForCron({
      supabase: fake,
      requestUrl: TICK_URL,
      env: {},
      nowIso: NOW
    });

    assert.equal(result.mode, "dry-run");
    assert.equal(result.safeCreateEnabled, false);
    assert.equal(result.safeCreateReason, "safe_create_env_disabled");
    assert.equal(result.wouldCreateCount, 1);
    assert.equal(result.createdRunCount, 0);
    assert.equal((fake as any)._tables.workflow_runs.length, 0);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 0);
  });

  it("cron safe-create fails closed to dry-run when env config is missing", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await runLeadWorkflowReconcilerForCron({
      supabase: fake,
      requestUrl: TICK_URL,
      env: { WORKFLOW_RECONCILER_CRON_SAFE_CREATE_ENABLED: "true" },
      nowIso: NOW
    });

    assert.equal(result.mode, "dry-run");
    assert.equal(result.safeCreateEnabled, true);
    assert.equal(result.safeCreateReason, "missing_cron_company_or_event");
    assert.equal(result.createdRunCount, 0);
    assert.equal((fake as any)._tables.workflow_runs.length, 0);
  });

  it("cron safe-create fails closed when the company allowlist is invalid", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await runLeadWorkflowReconcilerForCron({
      supabase: fake,
      requestUrl: TICK_URL,
      env: safeCronEnv({ WORKFLOW_RECONCILER_CRON_COMPANY_ALLOWLIST: COMPANY_B }),
      nowIso: NOW
    });

    assert.equal(result.mode, "dry-run");
    assert.equal(result.safeCreateReason, "company_not_allowlisted");
    assert.equal((fake as any)._tables.workflow_runs.length, 0);
  });

  it("cron safe-create fails closed when the event is not allowlisted", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await runLeadWorkflowReconcilerForCron({
      supabase: fake,
      requestUrl: TICK_URL,
      env: safeCronEnv({ WORKFLOW_RECONCILER_CRON_EVENT_ALLOWLIST: EVENT_B }),
      nowIso: NOW
    });

    assert.equal(result.mode, "dry-run");
    assert.equal(result.safeCreateReason, "event_not_allowlisted");
    assert.equal((fake as any)._tables.workflow_runs.length, 0);
  });

  it("cron safe-create creates held runs only for allowlisted company/event", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep(), baseStep({ id: "step-b", step_index: 1, step_key: "send_email" })]
    });

    const result = await runLeadWorkflowReconcilerForCron({
      supabase: fake,
      requestUrl: "https://example.test/api/internal/workflow-tick",
      env: safeCronEnv(),
      nowIso: NOW
    });

    assert.equal(result.mode, "safe-create");
    assert.equal(result.createdRunCount, 1);
    assert.equal(result.preflight?.wouldCreateCount, 1);
    assert.equal((fake as any)._tables.workflow_runs.length, 1);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 2);
    const run = (fake as any)._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "awaiting_approval");
    for (const stepRun of (fake as any)._tables.workflow_step_runs as Array<Record<string, unknown>>) {
      assert.equal(stepRun.status, "awaiting_approval");
      assert.equal(stepRun.scheduled_at, "infinity");
    }
  });

  it("cron spike guard blocks safe-create when would-create count exceeds the configured max", async () => {
    const fake = fakeAdmin({
      leads: [baseLead({ id: "lead-1" }), baseLead({ id: "lead-2", created_at: "2026-06-09T17:59:00.000Z" })],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await runLeadWorkflowReconcilerForCron({
      supabase: fake,
      requestUrl: "https://example.test/api/internal/workflow-tick",
      env: safeCronEnv({
        WORKFLOW_RECONCILER_CRON_LIMIT: "5",
        WORKFLOW_RECONCILER_CRON_MAX_CREATE: "1"
      }),
      nowIso: NOW
    });

    assert.equal(result.mode, "safe-create-blocked");
    assert.equal(result.safeCreateReason, "spike_guard_exceeded");
    assert.equal(result.alert, "workflow_reconciler_spike_guard_exceeded");
    assert.equal(result.preflight?.wouldCreateCount, 2);
    assert.equal(result.createdRunCount, 0);
    assert.equal((fake as any)._tables.workflow_runs.length, 0);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 0);
  });

  it("creates one workflow_run and workflow_step_runs only for exact event/company match", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep(), baseStep({ id: "step-b", step_index: 1, step_key: "compose" })]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: false,
      sinceIso: SINCE,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(result.createdRunCount, 1);
    assert.equal(result.wouldCreateCount, 0);
    assert.equal((fake as any)._tables.workflow_runs.length, 1);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 2);
    const run = (fake as any)._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.company_id, COMPANY_A);
    assert.equal(run.template_id, TEMPLATE_A);
    assert.equal(run.lead_id, LEAD_A);
    assert.equal(run.event_id, EVENT_A);
    assert.equal(run.trigger_event, "lead_captured");
  });

  it("manually created app lead with conversation, 4-star rating, and Hot temperature triggers once", async () => {
    const fake = fakeAdmin({
      leads: [
        baseLead({
          id: "manual-app-hot-lead",
          rating: 4,
          temperature: "Hot",
          status: "new",
          created_at: "2026-06-09T17:45:00.000Z"
        })
      ],
      lead_conversations: [
        {
          id: "conversation-a",
          lead_id: "manual-app-hot-lead",
          summary: "Good event conversation.",
          created_at: "2026-06-09T17:50:00.000Z"
        }
      ],
      events: [baseEvent()],
      workflow_templates: [
        baseTemplate({
          trigger_conditions_jsonb: leadCapturedRule({
            ruleId: "rating-4-hot",
            rating: { in: [4, 5] },
            temperature: "hot"
          })
        })
      ],
      workflow_steps: [baseStep(), baseStep({ id: "step-b", step_index: 1, step_key: "crm_sync" })]
    });

    const first = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: false,
      sinceIso: SINCE,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(first.createdRunCount, 1);
    assert.equal(first.decisions[0]?.reasonMatched, "strict_event_pinned_lead_captured_rule");
    assert.equal((fake as any)._tables.workflow_runs.length, 1);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 2);

    const second = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: false,
      sinceIso: SINCE,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(second.createdRunCount, 0);
    assert.equal(second.decisions[0]?.reasonSkipped, "active_run_exists");
    assert.equal((fake as any)._tables.workflow_runs.length, 1);
  });

  it("re-running reconciler does not duplicate active runs", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: false,
      sinceIso: SINCE,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });
    const second = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: false,
      sinceIso: SINCE,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal((fake as any)._tables.workflow_runs.length, 1);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 1);
    assert.equal(second.createdRunCount, 0);
    assert.equal(second.decisions[0]?.reasonSkipped, "active_run_exists");
  });

  it("marks run failed when step insert fails so retry is not blocked by an active orphan", async () => {
    const fake = fakeAdmin(
      {
        leads: [baseLead()],
        events: [baseEvent()],
        workflow_templates: [baseTemplate()],
        workflow_steps: [baseStep()]
      },
      {
        insertErrors: {
          workflow_step_runs: [{ message: "step insert unavailable" }]
        }
      }
    );

    const first = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: false,
      sinceIso: SINCE,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(first.createdRunCount, 0);
    assert.equal(first.decisions[0]?.reasonSkipped, "step_insert_failed");
    assert.equal((fake as any)._tables.workflow_runs.length, 1);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 0);

    const failedRun = (fake as any)._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(failedRun.status, "failed");
    assert.equal(failedRun.completed_at, NOW);
    const failedPayload = failedRun.trigger_payload_jsonb as Record<string, unknown>;
    const reconcileError = failedPayload.reconcile_error as Record<string, unknown>;
    assert.equal(reconcileError.code, "step_insert_failed");
    assert.equal(reconcileError.message, "step insert unavailable");

    const second = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: false,
      sinceIso: SINCE,
      limit: 10,
      companyId: COMPANY_A,
      eventId: EVENT_A,
      nowIso: NOW
    });

    assert.equal(second.createdRunCount, 1);
    assert.equal((fake as any)._tables.workflow_runs.length, 2);
    assert.equal((fake as any)._tables.workflow_step_runs.length, 1);
    const activeRun = (fake as any)._tables.workflow_runs[1] as Record<string, unknown>;
    assert.equal(activeRun.status, "queued");
  });

  it("skips a lead with no matching workflow", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      companyId: COMPANY_A,
      eventId: EVENT_A
    });

    assert.equal(result.wouldCreateCount, 0);
    assert.equal(result.decisions[0]?.reasonSkipped, "no_strict_event_pinned_templates");
  });

  it("skips a lead missing event_id", async () => {
    const fake = fakeAdmin({
      leads: [baseLead({ event_id: null })],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      companyId: COMPANY_A
    });

    assert.equal(result.wouldCreateCount, 0);
    assert.equal(result.decisions[0]?.reasonSkipped, "lead_missing_required_scope");
  });

  it("skips templates from another company", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate({ company_id: COMPANY_B })],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      companyId: COMPANY_A,
      eventId: EVENT_A
    });

    assert.equal(result.wouldCreateCount, 0);
    assert.equal(result.decisions[0]?.reasonSkipped, "no_strict_event_pinned_templates");
  });

  it("skips templates pinned to another event", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent(), baseEvent({ id: EVENT_B })],
      workflow_templates: [baseTemplate({ event_id: EVENT_B })],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      companyId: COMPANY_A,
      eventId: EVENT_A
    });

    assert.equal(result.wouldCreateCount, 0);
    assert.equal(result.decisions[0]?.reasonSkipped, "no_strict_event_pinned_templates");
  });

  it("skips unpinned scope:any templates in Phase 1", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate({ scope: "any", event_id: null })],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      companyId: COMPANY_A,
      eventId: EVENT_A
    });

    assert.equal(result.wouldCreateCount, 0);
    assert.equal(result.decisions[0]?.reasonSkipped, "no_strict_event_pinned_templates");
  });

  it("skips disabled templates", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate({ is_enabled: false })],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      companyId: COMPANY_A,
      eventId: EVENT_A
    });

    assert.equal(result.wouldCreateCount, 0);
    assert.equal(result.decisions[0]?.reasonSkipped, "no_strict_event_pinned_templates");
  });

  it("does not run deleted templates because they are absent", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      companyId: COMPANY_A,
      eventId: EVENT_A
    });

    assert.equal(result.wouldCreateCount, 0);
    assert.equal(result.decisions[0]?.reasonSkipped, "no_strict_event_pinned_templates");
  });

  it("skips workflows without valid steps", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: []
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      companyId: COMPANY_A,
      eventId: EVENT_A
    });

    assert.equal(result.wouldCreateCount, 0);
    assert.equal(result.decisions[0]?.reasonSkipped, "template_has_no_valid_steps");
  });

  it("refuses non-dry-run without explicit company and event bounds", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: false,
      sinceIso: SINCE,
      companyId: COMPANY_A
    });

    assert.equal(result.error, "non_dry_run_requires_company_and_event");
    assert.equal((fake as any)._tables.workflow_runs.length, 0);
  });

  it("refuses malformed since bounds before scanning", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: "not-a-date",
      companyId: COMPANY_A,
      eventId: EVENT_A
    });

    assert.equal(result.error, "invalid_since");
    assert.equal(result.scannedLeadCount, 0);
  });

  it("refuses malformed until bounds before scanning", async () => {
    const fake = fakeAdmin({
      leads: [baseLead()],
      events: [baseEvent()],
      workflow_templates: [baseTemplate()],
      workflow_steps: [baseStep()]
    });

    const result = await reconcileRecentLeadCapturedWorkflows({
      supabase: fake,
      dryRun: true,
      sinceIso: SINCE,
      untilIso: "not-a-date",
      companyId: COMPANY_A,
      eventId: EVENT_A
    });

    assert.equal(result.error, "invalid_until");
    assert.equal(result.scannedLeadCount, 0);
  });
});
