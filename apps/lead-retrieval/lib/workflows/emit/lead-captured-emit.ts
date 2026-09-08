import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEventContainerKind } from "@/lib/events/event-container-kind";
import type {
  LeadCaptureContext,
  LeadCapturedTriggerPayload,
  WorkflowTemplateRow
} from "../contracts/workflow-types";
import { templateEligibilitySkipReason } from "./trigger-resolver";
import { createWorkflowRunsForCapture } from "../runner/create-run";
import { executeWorkflowRunsToIdle } from "../runner/execute-runs-to-idle";
import { fireInternalWorkerTick } from "./internal-tick-kick";
import { evaluateLeadCapturedTriggerRules } from "../trigger-rules/lead-captured-rules";
import { WORKFLOW_HANDLER_REGISTRY } from "../step-handlers";

const WORKFLOW_EMIT_DEBUG_LOGGING =
  process.env.NODE_ENV === "development" || process.env.WORKFLOW_DEBUG === "true";

export type EmitLeadCapturedInput = {
  leadId: string;
  companyId: string;
  /** May be null for pure company-only leads (no event/CC bucket). */
  eventId: string | null;
  /** Free-form provenance, e.g. `mobile_capture`, `csv_publish`. */
  source: string;
};

export type EmitLeadCapturedResult =
  | { status: "no_templates" }
  | { status: "missing_inputs" }
  | { status: "no_runs_created"; templateIds: string[] }
  | { status: "queued"; runIds: string[] }
  | { status: "error"; message: string };

/**
 * Entry point used by explicit lead qualification paths.
 *
 * Contract:
 *   - MUST NOT throw to the caller. Caller wraps in try/catch defensively, but this
 *     function additionally swallows everything internally.
 *   - Newly-created runs are drained inline so the UI can show completed/failed
 *     workflow truth immediately after a qualification save.
 *   - All inserts are guarded by the active-run unique partial index for idempotency.
 */
export async function emitLeadCaptured(input: EmitLeadCapturedInput): Promise<EmitLeadCapturedResult> {
  const leadId = String(input.leadId ?? "").trim();
  const companyId = String(input.companyId ?? "").trim();
  if (!leadId || !companyId) {
    return { status: "missing_inputs" };
  }

  const eventId = input.eventId === null || input.eventId === undefined
    ? null
    : String(input.eventId).trim() || null;
  const source = String(input.source ?? "unknown").trim() || "unknown";

  try {
    const supabase = createAdminClient();

    // 1. Resolve container kind (single SELECT; null-event leads skip this).
    const containerKind = await loadContainerKindForEvent(supabase, eventId);
    const leadRuleFields = await loadLeadFieldsForRules(supabase, leadId);
    const leadRuleSource = sourceFromLeadFields(leadRuleFields) ?? source;
    debugWorkflowEmit("lead_captured trigger received", {
      leadId,
      companyId,
      eventId,
      source,
      containerKind,
      rating: leadRuleFields?.rating ?? null,
      temperature: leadRuleFields?.temperature ?? null,
      status: leadRuleFields?.status ?? null,
      ruleSource: leadRuleSource
    });
    console.info("[workflows/emit] lead_captured container resolved", {
      leadId,
      companyId,
      eventId,
      containerKind,
      source
    });

    // 2. Pull eligible-by-trigger templates.
    const { data: candidateRows, error: templatesError } = await (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: unknown) => {
            eq: (col: string, val: unknown) => {
              eq: (col: string, val: unknown) => Promise<{
                data: Array<Pick<WorkflowTemplateRow, "id" | "version" | "scope" | "event_id" | "is_enabled" | "trigger_conditions_jsonb">> | null;
                error: { message: string; code?: string } | null;
              }>;
            };
          };
        };
      };
    })
      .from("workflow_templates")
      .select("id, version, scope, event_id, is_enabled, trigger_conditions_jsonb")
      .eq("company_id", companyId)
      .eq("trigger_event", "lead_captured")
      .eq("is_enabled", true);

    if (templatesError) {
      logEmitFailure("templates_fetch_failed", { leadId, companyId, message: templatesError.message });
      return { status: "error", message: templatesError.message };
    }

    const candidates = candidateRows ?? [];
    console.info("[workflows/emit] lead_captured template candidates resolved", {
      leadId,
      companyId,
      eventId,
      containerKind,
      source,
      candidateTemplateCount: candidates.length,
      candidateTemplateIds: candidates.map((template) => template.id)
    });
    if (candidates.length === 0) {
      console.info("[workflows/emit] no lead_captured templates found", {
        leadId,
        companyId,
        eventId,
        source
      });
      await recordWorkflowTriggerDecision(supabase, {
        companyId,
        leadId,
        eventId,
        templateId: null,
        source,
        status: "no_templates",
        reason: "no_active_templates"
      });
      return { status: "no_templates" };
    }

    const scopeEligibleTemplateIds: string[] = [];
    const eligible: Array<typeof candidates[number] & {
      ruleId: string | null;
      triggerFingerprint: string;
    }> = [];
    const decisions: WorkflowTriggerDecisionInput[] = [];

    for (const template of candidates) {
      debugWorkflowEmit("workflow considered", {
        leadId,
        companyId,
        eventId,
        templateId: template.id,
        isEnabled: template.is_enabled,
        scope: template.scope,
        templateEventId: template.event_id,
        triggerEvent: "lead_captured"
      });
      const scopeSkipReason = templateEligibilitySkipReason(template, {
        eventId,
        containerKind
      });
      if (scopeSkipReason) {
        debugWorkflowEmit("workflow scope skipped", {
          leadId,
          companyId,
          eventId,
          templateId: template.id,
          reason: scopeSkipReason,
          scope: template.scope,
          templateEventId: template.event_id,
          containerKind
        });
        decisions.push({
          companyId,
          leadId,
          eventId,
          templateId: template.id,
          source,
          status: "skipped",
          reason: scopeSkipReason
        });
        continue;
      }

      scopeEligibleTemplateIds.push(template.id);
      const ruleMatch = evaluateLeadCapturedTriggerRules({
        conditions: template.trigger_conditions_jsonb,
        lead: {
          rating: leadRuleFields?.rating,
          temperature: leadRuleFields?.temperature,
          status: leadRuleFields?.status,
          source: leadRuleSource
        }
      });
      if (!ruleMatch.ok) {
        debugWorkflowEmit("workflow condition skipped", {
          leadId,
          companyId,
          eventId,
          templateId: template.id,
          reason: ruleMatch.reasonSkipped,
          ruleId: ruleMatch.ruleId,
          triggerFingerprint: ruleMatch.triggerFingerprint,
          rating: leadRuleFields?.rating ?? null,
          temperature: leadRuleFields?.temperature ?? null,
          status: leadRuleFields?.status ?? null,
          ruleSource: leadRuleSource
        });
        decisions.push({
          companyId,
          leadId,
          eventId,
          templateId: template.id,
          source,
          status: "skipped",
          reason: ruleMatch.reasonSkipped,
          triggerFingerprint: ruleMatch.triggerFingerprint,
          details: { ruleId: ruleMatch.ruleId }
        });
        continue;
      }

      debugWorkflowEmit("workflow condition matched", {
        leadId,
        companyId,
        eventId,
        templateId: template.id,
        reason: ruleMatch.reasonMatched,
        ruleId: ruleMatch.ruleId,
        triggerFingerprint: ruleMatch.triggerFingerprint,
        rating: leadRuleFields?.rating ?? null,
        temperature: leadRuleFields?.temperature ?? null,
        status: leadRuleFields?.status ?? null,
        ruleSource: leadRuleSource
      });
      decisions.push({
        companyId,
        leadId,
        eventId,
        templateId: template.id,
        source,
        status: "matched",
        reason: ruleMatch.reasonMatched,
        triggerFingerprint: ruleMatch.triggerFingerprint,
        details: { ruleId: ruleMatch.ruleId }
      });
      eligible.push({
        ...template,
        ruleId: ruleMatch.ruleId,
        triggerFingerprint: ruleMatch.triggerFingerprint
      });
    }

    await recordWorkflowTriggerDecisions(supabase, decisions);

    console.info("[workflows/emit] lead_captured eligibility resolved", {
      leadId,
      companyId,
      eventId,
      containerKind,
      source,
      candidateTemplateCount: candidates.length,
      scopeEligibleTemplateCount: scopeEligibleTemplateIds.length,
      eligibleTemplateCount: eligible.length,
      eligibleTemplateIds: eligible.map((template) => template.id),
      eligibleTriggerFingerprints: eligible.map((template) => template.triggerFingerprint || "default")
    });

    if (eligible.length === 0) {
      console.warn("[workflows/emit] lead_captured templates filtered out by eligibility", {
        leadId,
        companyId,
        eventId,
        containerKind,
        source,
        candidateTemplateIds: candidates.map((template) => template.id),
        scopeEligibleTemplateIds
      });
      return { status: "no_templates" };
    }

    // 3. Build trigger payload + create runs + step rows.
    const capture: LeadCaptureContext = {
      leadId,
      companyId,
      eventId,
      containerKind,
      source
    };

    const payload: LeadCapturedTriggerPayload = {
      trigger_event: "lead_captured",
      lead_id: leadId,
      company_id: companyId,
      event_id: eventId,
      container_kind: containerKind,
      source,
      emitted_at: new Date().toISOString()
    };

    const runIds = await createWorkflowRunsForCapture({
      supabase,
      capture,
      eligibleTemplates: eligible,
      triggerPayload: payload
    });
    debugWorkflowEmit("workflow run creation completed", {
      leadId,
      companyId,
      eventId,
      source,
      eligibleTemplateIds: eligible.map((template) => template.id),
      runIds
    });

    if (runIds.length === 0) {
      console.warn("[workflows/emit] lead_captured eligible templates produced no new runs", {
        leadId,
        companyId,
        eventId,
        containerKind,
        source,
        eligibleTemplateIds: eligible.map((template) => template.id)
      });
      await recordWorkflowTriggerDecisions(
        supabase,
        eligible.map((template) => ({
          companyId,
          leadId,
          eventId,
          templateId: template.id,
          source,
          status: "no_runs_created",
          reason: "duplicate_or_no_steps",
          triggerFingerprint: template.triggerFingerprint || "default"
        }))
      );
      return { status: "no_runs_created", templateIds: eligible.map((template) => template.id) };
    }

    const execution = await executeWorkflowRunsToIdle({
      supabase,
      registry: WORKFLOW_HANDLER_REGISTRY,
      runIds
    });
    debugWorkflowEmit("workflow execution drained", {
      leadId,
      companyId,
      eventId,
      source,
      runIds,
      processedStepCount: execution.processedStepCount,
      runResults: execution.runResults
    });

    // 4. Best-effort worker kick for any retries or steps intentionally left queued.
    fireInternalWorkerTick();

    console.info("[workflows/emit] lead_captured executed workflow runs", {
      leadId,
      companyId,
      eventId,
      containerKind,
      source,
      runIds,
      eligibleTemplateIds: eligible.map((template) => template.id),
      processedStepCount: execution.processedStepCount,
      runResults: execution.runResults
    });

    return { status: "queued", runIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected emit error";
    logEmitFailure("emit_unexpected_error", { leadId, companyId, message });
    return { status: "error", message };
  }
}

async function loadContainerKindForEvent(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string | null
) {
  if (!eventId) return null;
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: { container_kind: string | null } | null;
            error: { message: string; code?: string } | null;
          }>;
        };
      };
    };
  })
    .from("events")
    .select("container_kind")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !data) {
    console.warn("[workflows/emit] event container kind lookup returned no row", {
      eventId,
      message: error?.message ?? "event_not_found"
    });
    return null;
  }
  return normalizeEventContainerKind(data.container_kind);
}

async function loadLeadFieldsForRules(
  supabase: ReturnType<typeof createAdminClient>,
  leadId: string
) {
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: {
              rating?: number | null;
              temperature?: string | null;
              status?: string | null;
              metadata?: unknown;
            } | null;
            error: { message: string; code?: string } | null;
          }>;
        };
      };
    };
  })
    .from("leads")
    .select("rating, temperature, status, metadata")
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    console.warn("[workflows/emit] lead rule field lookup failed", {
      leadId,
      message: error.message
    });
    return null;
  }

  return data;
}

function sourceFromLeadFields(
  fields: { metadata?: unknown } | null
): string | null {
  const metadata = fields?.metadata;
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

function logEmitFailure(tag: string, fields: Record<string, unknown>) {
  console.warn("[workflows/emit] lead_captured emit failure", { tag, ...fields });
}

function debugWorkflowEmit(event: string, fields: Record<string, unknown>) {
  if (!WORKFLOW_EMIT_DEBUG_LOGGING) return;
  console.info(`[workflows/emit][debug] ${event}`, fields);
}

type WorkflowTriggerDecisionStatus =
  | "matched"
  | "skipped"
  | "no_templates"
  | "no_runs_created"
  | "error";

type WorkflowTriggerDecisionInput = {
  companyId: string;
  leadId: string;
  eventId: string | null;
  templateId: string | null;
  source: string;
  status: WorkflowTriggerDecisionStatus;
  reason: string;
  triggerFingerprint?: string | null;
  details?: Record<string, unknown>;
};

async function recordWorkflowTriggerDecisions(
  supabase: ReturnType<typeof createAdminClient>,
  decisions: WorkflowTriggerDecisionInput[]
) {
  if (decisions.length === 0) return;
  await recordWorkflowTriggerDecision(supabase, decisions);
}

async function recordWorkflowTriggerDecision(
  supabase: ReturnType<typeof createAdminClient>,
  decisionOrDecisions: WorkflowTriggerDecisionInput | WorkflowTriggerDecisionInput[]
) {
  const decisions = Array.isArray(decisionOrDecisions)
    ? decisionOrDecisions
    : [decisionOrDecisions];
  const rows = decisions.map((decision) => ({
    company_id: decision.companyId,
    lead_id: decision.leadId,
    event_id: decision.eventId,
    template_id: decision.templateId,
    trigger_event: "lead_captured",
    source: decision.source,
    status: decision.status,
    reason: decision.reason,
    trigger_fingerprint: decision.triggerFingerprint ?? null,
    details_jsonb: decision.details ?? {}
  }));

  try {
    const { error } = await (supabase as any)
      .from("workflow_trigger_decisions")
      .insert(rows);
    if (error) {
      console.warn("[workflows/emit] failed recording trigger decisions", {
        message: error.message,
        decisionCount: rows.length
      });
    }
  } catch (error) {
    console.warn("[workflows/emit] trigger decision insert threw", {
      message: error instanceof Error ? error.message : String(error),
      decisionCount: rows.length
    });
  }
}
