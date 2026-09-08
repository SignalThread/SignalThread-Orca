import type { createAdminClient } from "@/lib/supabase/admin";
import {
  createHeldWorkflowRunFromStrictLeadMatch,
  createWorkflowRunFromStrictLeadMatch,
  evaluateStrictLeadCapturedWorkflowMatch,
  type ReconcileLeadRow,
  type StrictWorkflowStepCandidate,
  type StrictWorkflowTemplateCandidate
} from "./lead-workflow-evaluator";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "awaiting_approval", "completed"]);

export type LeadWorkflowReconcilerDecision = {
  candidateLeadId: string | null;
  leadCompanyId: string | null;
  leadEventId: string | null;
  matchedTemplateId: string | null;
  reasonMatched: string | null;
  reasonSkipped: string | null;
  wouldCreateRun: boolean;
  createdRunId: string | null;
};

export type LeadWorkflowReconcilerResult = {
  dryRun: boolean;
  strictMode: true;
  sinceIso: string;
  untilIso: string | null;
  limit: number;
  companyId: string | null;
  eventId: string | null;
  scannedLeadCount: number;
  decisionCount: number;
  wouldCreateCount: number;
  createdRunCount: number;
  skippedCount: number;
  error: string | null;
  decisions: LeadWorkflowReconcilerDecision[];
};

export async function reconcileRecentLeadCapturedWorkflows(input: {
  supabase: ReturnType<typeof createAdminClient>;
  sinceIso: string;
  untilIso?: string | null;
  limit?: number;
  dryRun?: boolean;
  safeCreate?: boolean;
  companyId?: string | null;
  eventId?: string | null;
  nowIso?: string;
}): Promise<LeadWorkflowReconcilerResult> {
  const safeCreate = input.safeCreate === true;
  const dryRun = safeCreate ? false : input.dryRun !== false;
  const companyId = cleanId(input.companyId);
  const eventId = cleanId(input.eventId);
  const sinceIso = String(input.sinceIso ?? "").trim();
  const untilIso = cleanIso(input.untilIso);
  const limit = clampLimit(input.limit);

  const empty = (error: string | null = null): LeadWorkflowReconcilerResult => ({
    dryRun,
    strictMode: true,
    sinceIso,
    untilIso,
    limit,
    companyId,
    eventId,
    scannedLeadCount: 0,
    decisionCount: 0,
    wouldCreateCount: 0,
    createdRunCount: 0,
    skippedCount: 0,
    error,
    decisions: []
  });

  if (!sinceIso) return empty("missing_since");
  if (!isValidIsoDate(sinceIso)) return empty("invalid_since");
  if (untilIso && !isValidIsoDate(untilIso)) return empty("invalid_until");
  if (safeCreate && (!companyId || !eventId || !untilIso)) {
    return empty("safe_create_requires_explicit_company_event_since_until");
  }
  if (!dryRun && (!companyId || !eventId)) return empty("non_dry_run_requires_company_and_event");

  const { data: leads, error: leadsError } = await buildLeadScanQuery(input.supabase, {
    sinceIso,
    untilIso,
    limit,
    companyId,
    eventId
  });

  if (leadsError) return empty(leadsError.message);

  const decisions: LeadWorkflowReconcilerDecision[] = [];
  for (const lead of leads ?? []) {
    const leadId = cleanId(lead.id);
    const leadCompanyId = cleanId(lead.company_id);
    const leadEventId = cleanId(lead.event_id);

    if (!leadId || !leadCompanyId || !leadEventId) {
      decisions.push({
        candidateLeadId: leadId,
        leadCompanyId,
        leadEventId,
        matchedTemplateId: null,
        reasonMatched: null,
        reasonSkipped: "lead_missing_required_scope",
        wouldCreateRun: false,
        createdRunId: null
      });
      continue;
    }

    const event = await loadEventForLead(input.supabase, leadEventId);
    const templates = await loadPhase1TemplateCandidates(input.supabase, {
      companyId: leadCompanyId,
      eventId: leadEventId
    });

    if (templates.error) {
      decisions.push(skipped(lead, null, templates.error.message));
      continue;
    }

    if ((templates.data ?? []).length === 0) {
      decisions.push(skipped(lead, null, "no_strict_event_pinned_templates"));
      continue;
    }

    for (const template of templates.data ?? []) {
      const steps = await loadTemplateSteps(input.supabase, template.id);
      if (steps.error) {
        decisions.push(skipped(lead, template.id, steps.error.message));
        continue;
      }

      const match = evaluateStrictLeadCapturedWorkflowMatch({
        lead,
        event: event.data,
        template,
        steps: steps.data ?? []
      });

      if (!match.ok) {
        decisions.push({
          candidateLeadId: match.leadId,
          leadCompanyId: match.leadCompanyId,
          leadEventId: match.leadEventId,
          matchedTemplateId: match.templateId ?? template.id,
          reasonMatched: null,
          reasonSkipped: match.reasonSkipped,
          wouldCreateRun: false,
          createdRunId: null
        });
        continue;
      }

      const activeRunExists = await loadActiveRunExists(input.supabase, {
        templateId: template.id,
        leadId,
        triggerEvent: "lead_captured",
        triggerFingerprint: match.triggerFingerprint
      });
      if (activeRunExists) {
        decisions.push({
          candidateLeadId: match.leadId,
          leadCompanyId: match.leadCompanyId,
          leadEventId: match.leadEventId,
          matchedTemplateId: match.template.id,
          reasonMatched: null,
          reasonSkipped: "active_run_exists",
          wouldCreateRun: false,
          createdRunId: null
        });
        continue;
      }

      if (dryRun) {
        decisions.push({
          candidateLeadId: match.leadId,
          leadCompanyId: match.leadCompanyId,
          leadEventId: match.leadEventId,
          matchedTemplateId: match.template.id,
          reasonMatched: match.reasonMatched,
          reasonSkipped: null,
          wouldCreateRun: true,
          createdRunId: null
        });
        continue;
      }

      const created = safeCreate
        ? await createHeldWorkflowRunFromStrictLeadMatch({
            supabase: input.supabase,
            match,
            nowIso: input.nowIso,
            source: "lead_workflow_reconciler_safe_create"
          })
        : await createWorkflowRunFromStrictLeadMatch({
            supabase: input.supabase,
            match,
            nowIso: input.nowIso,
            source: "lead_workflow_reconciler"
          });

      decisions.push({
        candidateLeadId: match.leadId,
        leadCompanyId: match.leadCompanyId,
        leadEventId: match.leadEventId,
        matchedTemplateId: match.template.id,
        reasonMatched: created.created ? match.reasonMatched : null,
        reasonSkipped: created.created ? null : created.reason,
        wouldCreateRun: false,
        createdRunId: created.created ? created.runId : null
      });
    }
  }

  const result: LeadWorkflowReconcilerResult = {
    dryRun,
    strictMode: true,
    sinceIso,
    untilIso,
    limit,
    companyId,
    eventId,
    scannedLeadCount: (leads ?? []).length,
    decisionCount: decisions.length,
    wouldCreateCount: decisions.filter((d) => d.wouldCreateRun).length,
    createdRunCount: decisions.filter((d) => d.createdRunId).length,
    skippedCount: decisions.filter((d) => d.reasonSkipped).length,
    error: null,
    decisions
  };

  console.info("[workflows/reconciler] lead_captured strict dry-run/result", {
    dryRun: result.dryRun,
    strictMode: result.strictMode,
    sinceIso: result.sinceIso,
    untilIso: result.untilIso,
    limit: result.limit,
    companyId: result.companyId,
    eventId: result.eventId,
    scannedLeadCount: result.scannedLeadCount,
    decisionCount: result.decisionCount,
    wouldCreateCount: result.wouldCreateCount,
    createdRunCount: result.createdRunCount,
    skippedCount: result.skippedCount
  });

  return result;
}

function buildLeadScanQuery(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    sinceIso: string;
    untilIso: string | null;
    limit: number;
    companyId: string | null;
    eventId: string | null;
  }
) {
  let query = (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        gte: (col: string, val: unknown) => {
          lte: (col: string, val: unknown) => unknown;
          eq: (col: string, val: unknown) => unknown;
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: ReconcileLeadRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from("leads")
    .select("id, company_id, event_id, rating, temperature, status, metadata, created_at")
    .gte("created_at", input.sinceIso) as any;

  if (input.untilIso) query = query.lte("created_at", input.untilIso);
  if (input.companyId) query = query.eq("company_id", input.companyId);
  if (input.eventId) query = query.eq("event_id", input.eventId);
  return query.order("created_at", { ascending: false }).limit(input.limit) as Promise<{
    data: ReconcileLeadRow[] | null;
    error: { message: string } | null;
  }>;
}

async function loadEventForLead(supabase: ReturnType<typeof createAdminClient>, eventId: string) {
  return (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{
            data: { id: string | null; company_id?: string | null; container_kind: string | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("events")
    .select("id, company_id, container_kind")
    .eq("id", eventId)
    .maybeSingle();
}

async function loadPhase1TemplateCandidates(
  supabase: ReturnType<typeof createAdminClient>,
  input: { companyId: string; eventId: string }
) {
  let query = (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => unknown;
      };
    };
  })
    .from("workflow_templates")
    .select("id, company_id, version, scope, event_id, trigger_event, is_enabled, trigger_conditions_jsonb") as any;
  query = query.eq("company_id", input.companyId);
  query = query.eq("trigger_event", "lead_captured");
  query = query.eq("is_enabled", true);
  query = query.eq("event_id", input.eventId);
  return query as Promise<{
    data: StrictWorkflowTemplateCandidate[] | null;
    error: { message: string } | null;
  }>;
}

async function loadTemplateSteps(supabase: ReturnType<typeof createAdminClient>, templateId: string) {
  return (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{
            data: StrictWorkflowStepCandidate[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("workflow_steps")
    .select("id, step_index, step_key")
    .eq("template_id", templateId)
    .order("step_index", { ascending: true });
}

async function loadActiveRunExists(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    templateId: string;
    leadId: string;
    triggerEvent: "lead_captured";
    triggerFingerprint: string;
  }
) {
  const { data } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            eq: (col: string, val: unknown) => {
              eq: (col: string, val: unknown) => Promise<{
                data: Array<{ id: string; status: string }> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  })
    .from("workflow_runs")
    .select("id, status")
    .eq("template_id", input.templateId)
    .eq("lead_id", input.leadId)
    .eq("trigger_event", input.triggerEvent)
    .eq("trigger_fingerprint", input.triggerFingerprint);

  return (data ?? []).some((run) => ACTIVE_RUN_STATUSES.has(String(run.status ?? "")));
}

function skipped(
  lead: ReconcileLeadRow,
  templateId: string | null,
  reason: string
): LeadWorkflowReconcilerDecision {
  return {
    candidateLeadId: cleanId(lead.id),
    leadCompanyId: cleanId(lead.company_id),
    leadEventId: cleanId(lead.event_id),
    matchedTemplateId: templateId,
    reasonMatched: null,
    reasonSkipped: reason,
    wouldCreateRun: false,
    createdRunId: null
  };
}

function clampLimit(limit: unknown) {
  const n = Number(limit ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

function isValidIsoDate(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function cleanIso(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function cleanId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}
