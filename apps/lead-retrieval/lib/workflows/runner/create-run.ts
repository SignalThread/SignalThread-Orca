import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import type {
  LeadCaptureContext,
  LeadCapturedTriggerPayload,
  WorkflowStepRow,
  WorkflowTemplateRow
} from "../contracts/workflow-types";
import { buildWorkflowRunInsertRows } from "./build-run-rows";

export type EligibleTemplate = Pick<WorkflowTemplateRow, "id" | "version" | "scope" | "event_id"> & {
  ruleId?: string | null;
  triggerFingerprint?: string | null;
};

type CreateRunsArgs = {
  supabase: ReturnType<typeof createAdminClient>;
  capture: LeadCaptureContext;
  eligibleTemplates: ReadonlyArray<EligibleTemplate>;
  triggerPayload: LeadCapturedTriggerPayload;
  /** Test injection point. */
  nowIso?: string;
};

/**
 * Persists one `workflow_runs` row + its `workflow_step_runs` per eligible template.
 *
 * Idempotency:
 *   - Product-level guard: a workflow template may create at most one run for a lead.
 *     Qualification saves can be repeated/toggled, and CRM failures still count as having run.
 *   - The DB unique partial index remains a second line of defense for active-run races.
 *     We catch unique-violation (Postgres SQLSTATE `23505`) and skip silently.
 *
 * Returns the list of newly created run ids (does NOT include skipped duplicates).
 */
export async function createWorkflowRunsForCapture(args: CreateRunsArgs): Promise<string[]> {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const runIds: string[] = [];

  for (const template of args.eligibleTemplates) {
    console.info("[workflows/runner] create run started", {
      templateId: template.id,
      leadId: args.capture.leadId,
      companyId: args.capture.companyId,
      eventId: args.capture.eventId,
      triggerEvent: args.triggerPayload.trigger_event
    });

    const existingRun = await (args.supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: unknown) => {
            eq: (col: string, val: unknown) => {
              eq: (col: string, val: unknown) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{
                    data: { id: string; status?: string | null } | null;
                    error: { message: string; code?: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    })
      .from("workflow_runs")
      .select("id, status")
      .eq("template_id", template.id)
      .eq("lead_id", args.capture.leadId)
      .eq("trigger_event", args.triggerPayload.trigger_event)
      .limit(1)
      .maybeSingle();

    if (existingRun.error) {
      console.warn("[workflows/runner] failed checking existing workflow_run", {
        templateId: template.id,
        leadId: args.capture.leadId,
        companyId: args.capture.companyId,
        eventId: args.capture.eventId,
        message: existingRun.error.message,
        code: existingRun.error.code ?? null
      });
      continue;
    }

    if (existingRun.data?.id) {
      console.info("[workflows/runner] skipped existing workflow_run for lead", {
        existingRunId: existingRun.data.id,
        existingRunStatus: existingRun.data.status ?? null,
        templateId: template.id,
        leadId: args.capture.leadId,
        companyId: args.capture.companyId,
        eventId: args.capture.eventId,
        triggerEvent: args.triggerPayload.trigger_event
      });
      continue;
    }

    const stepsResult = await (args.supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: unknown) => {
            order: (col: string, opts: { ascending: boolean }) => Promise<{
              data: Array<Pick<WorkflowStepRow, "id" | "step_index" | "step_key">> | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };
    })
      .from("workflow_steps")
      .select("id, step_index, step_key")
      .eq("template_id", template.id)
      .order("step_index", { ascending: true });

    if (stepsResult.error) {
      console.warn("[workflows/runner] failed loading steps for template", {
        templateId: template.id,
        message: stepsResult.error.message
      });
      continue;
    }

    const steps = stepsResult.data ?? [];
    console.info("[workflows/runner] loaded workflow steps for run creation", {
      templateId: template.id,
      leadId: args.capture.leadId,
      companyId: args.capture.companyId,
      eventId: args.capture.eventId,
      stepCount: steps.length,
      stepIds: steps.map((step) => step.id)
    });

    const triggerPayload = {
      ...args.triggerPayload,
      rule_id: template.ruleId ?? null,
      trigger_fingerprint: template.triggerFingerprint || "default"
    };
    const { runRow, stepRunRowsForRunId } = buildWorkflowRunInsertRows({
      templateId: template.id,
      templateVersion: template.version,
      steps,
      capture: args.capture,
      triggerPayload,
      triggerFingerprint: template.triggerFingerprint,
      nowIso
    });

    const insertedRun = await (args.supabase as unknown as {
      from: (t: string) => {
        insert: (row: unknown) => {
          select: (cols: string) => {
            maybeSingle: () => Promise<{
              data: { id: string } | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };
    })
      .from("workflow_runs")
      .insert(runRow)
      .select("id")
      .maybeSingle();

    if (insertedRun.error) {
      const code = String(insertedRun.error.code ?? "");
      if (code === "23505") {
        // Duplicate active run for (template, lead, trigger). Idempotent skip.
        console.info("[workflows/runner] skipped duplicate active workflow_run", {
          templateId: template.id,
          leadId: args.capture.leadId,
          companyId: args.capture.companyId,
          eventId: args.capture.eventId,
          triggerEvent: args.triggerPayload.trigger_event,
          code
        });
        continue;
      }
      console.warn("[workflows/runner] failed inserting workflow_run", {
        templateId: template.id,
        leadId: args.capture.leadId,
        companyId: args.capture.companyId,
        eventId: args.capture.eventId,
        message: insertedRun.error.message,
        code
      });
      continue;
    }

    const runId = insertedRun.data?.id ? String(insertedRun.data.id) : null;
    if (!runId) {
      console.warn("[workflows/runner] workflow_run insert returned no id", {
        templateId: template.id,
        leadId: args.capture.leadId,
        companyId: args.capture.companyId,
        eventId: args.capture.eventId
      });
      continue;
    }

    console.info("[workflows/runner] inserted workflow_run", {
      runId,
      templateId: template.id,
      leadId: args.capture.leadId,
      companyId: args.capture.companyId,
      eventId: args.capture.eventId
    });

    const stepRunRows = stepRunRowsForRunId(runId);
    if (stepRunRows.length > 0) {
      const { error: stepInsertError } = await (args.supabase as unknown as {
        from: (t: string) => { insert: (rows: unknown) => Promise<{ error: { message: string } | null }> };
      })
        .from("workflow_step_runs")
        .insert(stepRunRows);
      if (stepInsertError) {
        console.warn("[workflows/runner] failed inserting workflow_step_runs", {
          runId,
          templateId: template.id,
          leadId: args.capture.leadId,
          companyId: args.capture.companyId,
          eventId: args.capture.eventId,
          message: stepInsertError.message
        });
        await markInsertedRunFailedAfterStepInsertError({
          supabase: args.supabase,
          runId,
          nowIso,
          triggerPayload,
          message: stepInsertError.message
        });
        continue;
      } else {
        console.info("[workflows/runner] inserted workflow_step_runs", {
          runId,
          templateId: template.id,
          leadId: args.capture.leadId,
          companyId: args.capture.companyId,
          eventId: args.capture.eventId,
          stepRunCount: stepRunRows.length
        });
      }
    }

    runIds.push(runId);
  }

  return runIds;
}

async function markInsertedRunFailedAfterStepInsertError(input: {
  supabase: ReturnType<typeof createAdminClient>;
  runId: string;
  nowIso: string;
  triggerPayload: LeadCapturedTriggerPayload;
  message: string;
}) {
  const failedPayload = {
    ...input.triggerPayload,
    reconcile_error: {
      code: "step_insert_failed",
      message: input.message,
      failed_at: input.nowIso
    }
  };

  const { error } = await (input.supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_runs")
    .update({
      status: "failed",
      current_step_index: null,
      completed_at: input.nowIso,
      updated_at: input.nowIso,
      trigger_payload_jsonb: failedPayload
    })
    .eq("id", input.runId);

  if (error) {
    console.warn("[workflows/runner] failed marking workflow_run failed after step insert error", {
      runId: input.runId,
      message: error.message
    });
  }
}
