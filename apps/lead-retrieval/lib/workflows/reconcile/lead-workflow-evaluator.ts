import type { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEventContainerKind, type EventContainerKind } from "@/lib/events/event-container-kind";
import { isTemplateEligibleForLead } from "@/lib/workflows/emit/trigger-resolver";
import type {
  LeadCaptureContext,
  LeadCapturedTriggerPayload,
  WorkflowScope,
  WorkflowStepRow,
  WorkflowTemplateRow
} from "@/lib/workflows/contracts/workflow-types";
import { buildWorkflowRunInsertRows } from "@/lib/workflows/runner/build-run-rows";
import { evaluateLeadCapturedTriggerRules } from "@/lib/workflows/trigger-rules/lead-captured-rules";

export type ReconcileLeadRow = {
  id: string | null;
  company_id: string | null;
  event_id: string | null;
  rating?: number | null;
  temperature?: string | null;
  status?: string | null;
  source?: string | null;
  metadata?: unknown;
  created_at?: string | null;
};

export type StrictWorkflowTemplateCandidate = Pick<
  WorkflowTemplateRow,
  | "id"
  | "company_id"
  | "version"
  | "scope"
  | "event_id"
  | "trigger_event"
  | "is_enabled"
  | "trigger_conditions_jsonb"
>;

export type StrictWorkflowStepCandidate = Pick<WorkflowStepRow, "id" | "step_index" | "step_key">;

export type StrictLeadWorkflowMatch =
  | {
      ok: true;
      leadId: string;
      leadCompanyId: string;
      leadEventId: string;
      eventContainerKind: EventContainerKind;
      template: StrictWorkflowTemplateCandidate;
      steps: StrictWorkflowStepCandidate[];
      ruleId: string | null;
      triggerFingerprint: string;
      reasonMatched: "strict_event_pinned_lead_captured" | "strict_event_pinned_lead_captured_rule";
    }
  | {
      ok: false;
      leadId: string | null;
      leadCompanyId: string | null;
      leadEventId: string | null;
      templateId?: string | null;
      reasonSkipped:
        | "lead_missing_required_scope"
        | "event_not_found"
        | "event_company_mismatch"
        | "template_company_mismatch"
        | "template_not_enabled"
        | "template_trigger_mismatch"
        | "template_not_event_pinned"
        | "template_event_mismatch"
        | "template_scope_not_phase1_supported"
        | "template_scope_incompatible"
        | "template_has_no_valid_steps"
        | "invalid_trigger_conditions"
        | "lead_rule_mismatch"
        | "active_run_exists";
    };

export function evaluateStrictLeadCapturedWorkflowMatch(input: {
  lead: ReconcileLeadRow;
  event: { id: string | null; company_id?: string | null; container_kind: string | null } | null;
  template: StrictWorkflowTemplateCandidate;
  steps: StrictWorkflowStepCandidate[];
  activeRunExists?: boolean;
}): StrictLeadWorkflowMatch {
  const leadId = cleanId(input.lead.id);
  const leadCompanyId = cleanId(input.lead.company_id);
  const leadEventId = cleanId(input.lead.event_id);
  const templateId = cleanId(input.template.id);

  if (!leadId || !leadCompanyId || !leadEventId) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "lead_missing_required_scope"
    };
  }

  if (!input.event || cleanId(input.event.id) !== leadEventId) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "event_not_found"
    };
  }

  const eventCompanyId = cleanId(input.event.company_id);
  if (eventCompanyId && eventCompanyId !== leadCompanyId) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "event_company_mismatch"
    };
  }

  if (cleanId(input.template.company_id) !== leadCompanyId) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "template_company_mismatch"
    };
  }

  if (input.template.is_enabled !== true) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "template_not_enabled"
    };
  }

  if (input.template.trigger_event !== "lead_captured") {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "template_trigger_mismatch"
    };
  }

  const templateEventId = cleanId(input.template.event_id);
  if (!templateEventId) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "template_not_event_pinned"
    };
  }

  if (templateEventId !== leadEventId) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "template_event_mismatch"
    };
  }

  const eventContainerKind = normalizeEventContainerKind(input.event.container_kind);
  if (!isPhase1SupportedScope(input.template.scope)) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "template_scope_not_phase1_supported"
    };
  }

  if (
    !isTemplateEligibleForLead(input.template, {
      eventId: leadEventId,
      containerKind: eventContainerKind
    })
  ) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "template_scope_incompatible"
    };
  }

  if (!hasValidWorkflowSteps(input.steps)) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "template_has_no_valid_steps"
    };
  }

  const ruleMatch = evaluateLeadCapturedTriggerRules({
    conditions: input.template.trigger_conditions_jsonb,
    lead: {
      rating: input.lead.rating,
      temperature: input.lead.temperature,
      status: input.lead.status,
      source: input.lead.source ?? sourceFromLeadMetadata(input.lead.metadata)
    }
  });
  if (!ruleMatch.ok) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: ruleMatch.reasonSkipped
    };
  }

  if (input.activeRunExists === true) {
    return {
      ok: false,
      leadId,
      leadCompanyId,
      leadEventId,
      templateId,
      reasonSkipped: "active_run_exists"
    };
  }

  return {
    ok: true,
    leadId,
    leadCompanyId,
    leadEventId,
    eventContainerKind,
    template: input.template,
    steps: [...input.steps].sort((a, b) => a.step_index - b.step_index),
    ruleId: ruleMatch.ruleId,
    triggerFingerprint: ruleMatch.triggerFingerprint,
    reasonMatched:
      ruleMatch.reasonMatched === "lead_rule_matched"
        ? "strict_event_pinned_lead_captured_rule"
        : "strict_event_pinned_lead_captured"
  };
}

export async function createWorkflowRunFromStrictLeadMatch(input: {
  supabase: ReturnType<typeof createAdminClient>;
  match: Extract<StrictLeadWorkflowMatch, { ok: true }>;
  nowIso?: string;
  source?: string;
}): Promise<{ created: true; runId: string } | { created: false; reason: "duplicate" | "insert_failed" | "missing_run_id" | "step_insert_failed"; message?: string }> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const source = input.source ?? "lead_workflow_reconciler";
  const capture: LeadCaptureContext = {
    leadId: input.match.leadId,
    companyId: input.match.leadCompanyId,
    eventId: input.match.leadEventId,
    containerKind: input.match.eventContainerKind,
    source
  };
  const triggerPayload: LeadCapturedTriggerPayload = {
    trigger_event: "lead_captured",
    lead_id: input.match.leadId,
    company_id: input.match.leadCompanyId,
    event_id: input.match.leadEventId,
    container_kind: input.match.eventContainerKind,
    source,
    emitted_at: nowIso,
    rule_id: input.match.ruleId,
    trigger_fingerprint: input.match.triggerFingerprint
  };
  const { runRow, stepRunRowsForRunId } = buildWorkflowRunInsertRows({
    templateId: input.match.template.id,
    templateVersion: input.match.template.version,
    steps: input.match.steps,
    capture,
    triggerPayload,
    triggerFingerprint: input.match.triggerFingerprint,
    nowIso
  });

  const insertedRun = await (input.supabase as unknown as {
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
    if (String(insertedRun.error.code ?? "") === "23505") {
      return { created: false, reason: "duplicate", message: insertedRun.error.message };
    }
    return { created: false, reason: "insert_failed", message: insertedRun.error.message };
  }

  const runId = insertedRun.data?.id ? String(insertedRun.data.id) : "";
  if (!runId) {
    return { created: false, reason: "missing_run_id" };
  }

  const stepRows = stepRunRowsForRunId(runId);
  const { error: stepInsertError } = await (input.supabase as unknown as {
    from: (t: string) => { insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }> };
  })
    .from("workflow_step_runs")
    .insert(stepRows);

  if (stepInsertError) {
    await markInsertedRunFailedAfterStepInsertError({
      supabase: input.supabase,
      runId,
      nowIso,
      triggerPayload,
      message: stepInsertError.message
    });
    return { created: false, reason: "step_insert_failed", message: stepInsertError.message };
  }

  return { created: true, runId };
}

export async function createHeldWorkflowRunFromStrictLeadMatch(input: {
  supabase: ReturnType<typeof createAdminClient>;
  match: Extract<StrictLeadWorkflowMatch, { ok: true }>;
  nowIso?: string;
  source?: string;
}): Promise<{ created: true; runId: string } | { created: false; reason: "duplicate" | "insert_failed" | "missing_run_id" | "step_insert_failed"; message?: string }> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const source = input.source ?? "lead_workflow_reconciler_safe_create";
  const triggerFingerprint = [
    input.match.triggerFingerprint,
    input.match.template.id,
    input.match.leadId,
    input.match.leadCompanyId,
    input.match.leadEventId
  ].join(":");
  const reconciledHold = {
    source,
    mode: "safe_create",
    reconciled_at: nowIso,
    original_lead_id: input.match.leadId,
    matched_template_id: input.match.template.id,
    matched_rule_id: input.match.ruleId,
    trigger_fingerprint: triggerFingerprint,
    hold_reason: "phase3_reconciler_review_hold"
  };
  const capture: LeadCaptureContext = {
    leadId: input.match.leadId,
    companyId: input.match.leadCompanyId,
    eventId: input.match.leadEventId,
    containerKind: input.match.eventContainerKind,
    source
  };
  const triggerPayload: LeadCapturedTriggerPayload & { reconciled_hold: typeof reconciledHold } = {
    trigger_event: "lead_captured",
    lead_id: input.match.leadId,
    company_id: input.match.leadCompanyId,
    event_id: input.match.leadEventId,
    container_kind: input.match.eventContainerKind,
    source,
    emitted_at: nowIso,
    rule_id: input.match.ruleId,
    trigger_fingerprint: input.match.triggerFingerprint,
    reconciled_hold: reconciledHold
  };
  const { runRow, stepRunRowsForRunId } = buildWorkflowRunInsertRows({
    templateId: input.match.template.id,
    templateVersion: input.match.template.version,
    steps: input.match.steps,
    capture,
    triggerPayload,
    triggerFingerprint: input.match.triggerFingerprint,
    nowIso
  });

  const heldRunRow = {
    ...runRow,
    status: "awaiting_approval",
    current_step_index: input.match.steps.length === 0 ? null : 0,
    started_at: null,
    completed_at: null,
    trigger_payload_jsonb: triggerPayload as unknown as Record<string, unknown>
  };

  const insertedRun = await (input.supabase as unknown as {
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
    .insert(heldRunRow)
    .select("id")
    .maybeSingle();

  if (insertedRun.error) {
    if (String(insertedRun.error.code ?? "") === "23505") {
      return { created: false, reason: "duplicate", message: insertedRun.error.message };
    }
    return { created: false, reason: "insert_failed", message: insertedRun.error.message };
  }

  const runId = insertedRun.data?.id ? String(insertedRun.data.id) : "";
  if (!runId) {
    return { created: false, reason: "missing_run_id" };
  }

  const stepRows = stepRunRowsForRunId(runId).map((row) => ({
    ...row,
    status: "awaiting_approval",
    scheduled_at: "infinity",
    input_jsonb: {
      reconciled_hold: reconciledHold
    }
  }));
  const { error: stepInsertError } = await (input.supabase as unknown as {
    from: (t: string) => { insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }> };
  })
    .from("workflow_step_runs")
    .insert(stepRows);

  if (stepInsertError) {
    await markInsertedRunFailedAfterStepInsertError({
      supabase: input.supabase,
      runId,
      nowIso,
      triggerPayload,
      message: stepInsertError.message
    });
    return { created: false, reason: "step_insert_failed", message: stepInsertError.message };
  }

  return { created: true, runId };
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
    console.warn("[workflows/reconciler] failed marking orphan workflow_run failed", {
      runId: input.runId,
      message: error.message
    });
  }
}

function isPhase1SupportedScope(scope: WorkflowScope) {
  return scope === "event" || scope === "continuous_capture";
}

function cleanId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function hasValidWorkflowSteps(steps: StrictWorkflowStepCandidate[]) {
  if (!Array.isArray(steps) || steps.length === 0) return false;
  const sorted = [...steps].sort((a, b) => Number(a.step_index) - Number(b.step_index));
  for (let index = 0; index < sorted.length; index += 1) {
    const step = sorted[index]!;
    if (!cleanId(step.id) || !cleanId(step.step_key)) return false;
    if (!Number.isInteger(step.step_index) || step.step_index !== index) return false;
  }
  return true;
}

function sourceFromLeadMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const raw =
    record.source ??
    record.capture_source ??
    record.created_source ??
    record.lead_source;
  const text = typeof raw === "string" ? raw.trim() : "";
  return text.length > 0 ? text : null;
}
