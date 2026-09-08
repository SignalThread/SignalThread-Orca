import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import type { createAdminClient } from "@/lib/supabase/admin";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

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
  parent: null,
} as unknown as NodeJS.Module;

const NOW = "2026-06-11T12:00:00.000Z";

async function loadCreateRun() {
  return import("@/lib/workflows/runner/create-run");
}

describe("createWorkflowRunsForCapture idempotency", () => {
  it("repeated Hot + 5 qualification save does not create a duplicate active workflow run", async () => {
    const { createWorkflowRunsForCapture } = await loadCreateRun();
    const fake = createFakeSupabase({
      workflow_steps: [{ id: "step-1", template_id: "template-hot-5", step_index: 0, step_key: "compose" }],
      workflow_runs: [],
      workflow_step_runs: [],
    });
    const supabase = asAdminClient<ReturnType<typeof createAdminClient>>(fake);
    const args = {
      supabase,
      capture: {
        leadId: "lead-1",
        companyId: "company-1",
        eventId: "event-1",
        containerKind: "event" as const,
        source: "qualification_save",
      },
      eligibleTemplates: [
        {
          id: "template-hot-5",
          version: 1,
          scope: "event" as const,
          event_id: "event-1",
          ruleId: "hot-5",
          triggerFingerprint: "rule:hot-5",
        },
      ],
      triggerPayload: {
        trigger_event: "lead_captured" as const,
        lead_id: "lead-1",
        company_id: "company-1",
        event_id: "event-1",
        container_kind: "event" as const,
        source: "qualification_save",
        emitted_at: NOW,
      },
      nowIso: NOW,
    };

    const first = await createWorkflowRunsForCapture(args);
    const second = await createWorkflowRunsForCapture(args);

    assert.equal(first.length, 1);
    assert.deepEqual(second, []);
    assert.equal(fake._tables.workflow_runs.length, 1);
    assert.equal(fake._tables.workflow_step_runs.length, 1);
    assert.equal(fake._tables.workflow_runs[0]!.trigger_fingerprint, "rule:hot-5");
  });

  it("completed workflow run blocks duplicate qualification-triggered sync for the same lead and rule", async () => {
    const { createWorkflowRunsForCapture } = await loadCreateRun();
    const fake = createFakeSupabase({
      workflow_steps: [{ id: "step-1", template_id: "template-hot-5", step_index: 0, step_key: "crm_salesforce_sync" }],
      workflow_runs: [
        {
          id: "existing-run-1",
          company_id: "company-1",
          template_id: "template-hot-5",
          template_version: 1,
          lead_id: "lead-1",
          event_id: "event-1",
          trigger_event: "lead_captured",
          trigger_payload_jsonb: {},
          trigger_fingerprint: "rule:hot-5",
          status: "completed",
          current_step_index: null,
          started_at: NOW,
          completed_at: NOW,
          created_at: NOW,
          updated_at: NOW
        }
      ],
      workflow_step_runs: [],
    });

    const result = await createWorkflowRunsForCapture({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      capture: {
        leadId: "lead-1",
        companyId: "company-1",
        eventId: "event-1",
        containerKind: "event",
        source: "qualification_save",
      },
      eligibleTemplates: [
        {
          id: "template-hot-5",
          version: 1,
          scope: "event",
          event_id: "event-1",
          ruleId: "hot-5",
          triggerFingerprint: "rule:hot-5",
        },
      ],
      triggerPayload: {
        trigger_event: "lead_captured",
        lead_id: "lead-1",
        company_id: "company-1",
        event_id: "event-1",
        container_kind: "event",
        source: "qualification_save",
        emitted_at: NOW,
      },
      nowIso: NOW,
    });

    assert.deepEqual(result, []);
    assert.equal(fake._tables.workflow_runs.length, 1);
    assert.equal(fake._tables.workflow_step_runs.length, 0);
  });

  it("failed workflow run still blocks duplicate sync for the same workflow and lead", async () => {
    const { createWorkflowRunsForCapture } = await loadCreateRun();
    const fake = createFakeSupabase({
      workflow_steps: [{ id: "step-1", template_id: "template-hot-5", step_index: 0, step_key: "crm_salesforce_sync" }],
      workflow_runs: [
        {
          id: "failed-run-1",
          company_id: "company-1",
          template_id: "template-hot-5",
          template_version: 1,
          lead_id: "lead-1",
          event_id: "event-1",
          trigger_event: "lead_captured",
          trigger_payload_jsonb: {},
          trigger_fingerprint: "rule:hot-5",
          status: "failed",
          current_step_index: null,
          started_at: NOW,
          completed_at: NOW,
          created_at: NOW,
          updated_at: NOW
        }
      ],
      workflow_step_runs: [],
    });

    const result = await createWorkflowRunsForCapture({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      capture: {
        leadId: "lead-1",
        companyId: "company-1",
        eventId: "event-1",
        containerKind: "event",
        source: "qualification_save",
      },
      eligibleTemplates: [
        {
          id: "template-hot-5",
          version: 1,
          scope: "event",
          event_id: "event-1",
          ruleId: "hot-5",
          triggerFingerprint: "rule:hot-5",
        },
      ],
      triggerPayload: {
        trigger_event: "lead_captured",
        lead_id: "lead-1",
        company_id: "company-1",
        event_id: "event-1",
        container_kind: "event",
        source: "qualification_save",
        emitted_at: NOW,
      },
      nowIso: NOW,
    });

    assert.deepEqual(result, []);
    assert.equal(fake._tables.workflow_runs.length, 1);
    assert.equal(fake._tables.workflow_step_runs.length, 0);
  });

  it("different trigger fingerprint does not duplicate a workflow that already ran for the lead", async () => {
    const { createWorkflowRunsForCapture } = await loadCreateRun();
    const fake = createFakeSupabase({
      workflow_steps: [{ id: "step-1", template_id: "template-hot-5", step_index: 0, step_key: "crm_salesforce_sync" }],
      workflow_runs: [
        {
          id: "existing-run-1",
          company_id: "company-1",
          template_id: "template-hot-5",
          template_version: 1,
          lead_id: "lead-1",
          event_id: "event-1",
          trigger_event: "lead_captured",
          trigger_payload_jsonb: {},
          trigger_fingerprint: "rule:warm-4",
          status: "completed",
          current_step_index: null,
          started_at: NOW,
          completed_at: NOW,
          created_at: NOW,
          updated_at: NOW
        }
      ],
      workflow_step_runs: [],
    });

    const result = await createWorkflowRunsForCapture({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      capture: {
        leadId: "lead-1",
        companyId: "company-1",
        eventId: "event-1",
        containerKind: "event",
        source: "qualification_save",
      },
      eligibleTemplates: [
        {
          id: "template-hot-5",
          version: 1,
          scope: "event",
          event_id: "event-1",
          ruleId: "hot-5",
          triggerFingerprint: "rule:hot-5",
        },
      ],
      triggerPayload: {
        trigger_event: "lead_captured",
        lead_id: "lead-1",
        company_id: "company-1",
        event_id: "event-1",
        container_kind: "event",
        source: "qualification_save",
        emitted_at: NOW,
      },
      nowIso: NOW,
    });

    assert.deepEqual(result, []);
    assert.equal(fake._tables.workflow_runs.length, 1);
    assert.equal(fake._tables.workflow_step_runs.length, 0);
  });

  it("marks the run failed and returns no executable run id when step-run insert fails", async () => {
    const { createWorkflowRunsForCapture } = await loadCreateRun();
    const fake = createFakeSupabase(
      {
        workflow_steps: [{ id: "step-1", template_id: "template-hot-5", step_index: 0, step_key: "compose" }],
        workflow_runs: [],
        workflow_step_runs: [],
      },
      {
        insertErrors: {
          workflow_step_runs: [{ message: "step insert unavailable" }]
        }
      }
    );
    const supabase = asAdminClient<ReturnType<typeof createAdminClient>>(fake);

    const result = await createWorkflowRunsForCapture({
      supabase,
      capture: {
        leadId: "lead-1",
        companyId: "company-1",
        eventId: "event-1",
        containerKind: "event",
        source: "qualification_save",
      },
      eligibleTemplates: [
        {
          id: "template-hot-5",
          version: 1,
          scope: "event",
          event_id: "event-1",
          ruleId: "hot-5",
          triggerFingerprint: "rule:hot-5",
        },
      ],
      triggerPayload: {
        trigger_event: "lead_captured",
        lead_id: "lead-1",
        company_id: "company-1",
        event_id: "event-1",
        container_kind: "event",
        source: "qualification_save",
        emitted_at: NOW,
      },
      nowIso: NOW,
    });

    assert.deepEqual(result, []);
    assert.equal(fake._tables.workflow_runs.length, 1);
    assert.equal(fake._tables.workflow_step_runs.length, 0);
    const run = fake._tables.workflow_runs[0] as Record<string, unknown>;
    assert.equal(run.status, "failed");
    assert.equal(run.current_step_index, null);
    assert.equal(run.completed_at, NOW);
    const payload = run.trigger_payload_jsonb as Record<string, unknown>;
    const error = payload.reconcile_error as Record<string, unknown>;
    assert.equal(error.code, "step_insert_failed");
    assert.equal(error.message, "step insert unavailable");
  });
});
