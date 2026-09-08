/**
 * Server loaders for `/exhibitor/workflows/[workflowId]` — read-only via the authenticated
 * Supabase server client (RLS scopes workflow rows by company).
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE } from "@/lib/workflows/step-handlers/compose-campaign-draft-pure";
import type { WorkflowScope, WorkflowTriggerEvent } from "@/lib/workflows/contracts/workflow-types";
import { extractDraftBodyPreview, extractDraftSubjectPreview } from "./workflow-detail-display";
import { filterWorkflowSelectableSignalRowsForEvent } from "@/lib/signals/workflow-selectable-signal-rows";
import type {
  LeadSummaryMini,
  WorkflowDetailComposeSignal,
  WorkflowDetailLoadResult,
  WorkflowDetailRunFilter,
  WorkflowDetailStepRow,
  WorkflowDetailTemplate,
  WorkflowDraftDetailRow,
  WorkflowPendingApprovalDetail,
  WorkflowRunSummaryRow,
  WorkflowStepRunDetailRow
} from "./workflow-detail-types";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const RUN_PAGE_SIZE = 10;
const RUN_FETCH_LIMIT = RUN_PAGE_SIZE + 1;
const PENDING_APPROVAL_LIMIT = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLikelyWorkflowId(raw: string): boolean {
  return UUID_RE.test(String(raw ?? "").trim());
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function emptyResult(): WorkflowDetailLoadResult {
  return {
    template: null,
    steps: [],
    composeSignals: [],
    runs: [],
    runFilter: "all",
    runPagination: { pageSize: RUN_PAGE_SIZE, hasMore: false, nextCursor: null },
    leads: [],
    selectedRunId: null,
    stepRuns: [],
    drafts: [],
    pendingApprovals: [],
    selectedApprovalId: null
  };
}

export function parseWorkflowDetailRunFilter(value: unknown): WorkflowDetailRunFilter {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "awaiting_approval" ||
    normalized === "completed" ||
    normalized === "failed" ||
    normalized === "active"
  ) {
    return normalized;
  }
  return "all";
}

function applyRunStatusFilter<T>(
  query: T,
  filter: WorkflowDetailRunFilter
): T {
  const q = query as any;
  if (filter === "awaiting_approval") return q.eq("status", "awaiting_approval") as T;
  if (filter === "completed") return q.eq("status", "completed") as T;
  if (filter === "failed") return q.in("status", ["failed", "cancelled"]) as T;
  if (filter === "active") {
    return q.in("status", [
      "queued",
      "running",
      "waiting_for_audio_transcript",
      "waiting_for_conversation_insights"
    ]) as T;
  }
  return query;
}

function mapDraftRow(row: Record<string, unknown>): WorkflowDraftDetailRow {
  const content = asRecord(row.content_jsonb);
  return {
    id: String(row.id),
    run_id: String(row.run_id ?? ""),
    lead_id: String(row.lead_id ?? ""),
    step_run_id: String(row.step_run_id ?? ""),
    kind: String(row.kind ?? ""),
    approval_status: String(row.approval_status ?? ""),
    subject_preview: extractDraftSubjectPreview(content),
    body_preview: extractDraftBodyPreview(content),
    campaign_id: typeof content.campaign_id === "string" ? content.campaign_id : null,
    campaign_message_id: typeof content.campaign_message_id === "string" ? content.campaign_message_id : null,
    promoted_to_id: typeof row.promoted_to_id === "string" ? row.promoted_to_id : null,
    created_at: String(row.created_at ?? "")
  };
}

export async function loadWorkflowDetailPage(input: {
  supabase: SupabaseServerClient;
  workflowId: string;
  preferredRunId: string | null;
  runFilter?: WorkflowDetailRunFilter;
  runCursor?: string | null;
  preferredApprovalId?: string | null;
}): Promise<WorkflowDetailLoadResult> {
  const workflowId = String(input.workflowId ?? "").trim();
  const runFilter = input.runFilter ?? "all";
  const runCursor = String(input.runCursor ?? "").trim() || null;
  const preferredApprovalId = String(input.preferredApprovalId ?? "").trim() || null;

  if (!isLikelyWorkflowId(workflowId)) {
    return emptyResult();
  }

  const { data: tpl, error: tplErr } = await input.supabase
    .from("workflow_templates")
    .select(
      "id, company_id, name, description, trigger_event, scope, event_id, is_enabled, version, trigger_conditions_jsonb, created_by, created_at, updated_at"
    )
    .eq("id", workflowId)
    .maybeSingle();

  if (tplErr) {
    console.warn("[loadWorkflowDetailPage] template", tplErr.message);
    return emptyResult();
  }
  if (!tpl) {
    return emptyResult();
  }

  const tplRow = tpl as unknown as Record<string, unknown>;

  const template: WorkflowDetailTemplate = {
    id: String(tplRow.id),
    name: String(tplRow.name ?? ""),
    description: tplRow.description != null ? String(tplRow.description) : null,
    trigger_event: tplRow.trigger_event as WorkflowTriggerEvent,
    scope: tplRow.scope as WorkflowScope,
    event_id: tplRow.event_id != null ? String(tplRow.event_id) : null,
    is_enabled: Boolean(tplRow.is_enabled),
    version: Number(tplRow.version ?? 1),
    trigger_conditions_jsonb: tplRow.trigger_conditions_jsonb != null ? asRecord(tplRow.trigger_conditions_jsonb) : null,
    created_by: tplRow.created_by != null ? String(tplRow.created_by) : null,
    created_at: String(tplRow.created_at ?? ""),
    updated_at: String(tplRow.updated_at ?? "")
  };

  const { data: stepRows, error: stepErr } = await input.supabase
    .from("workflow_steps")
    .select("id, step_index, step_type, step_key, requires_approval, params_jsonb")
    .eq("template_id", workflowId)
    .order("step_index", { ascending: true });

  if (stepErr) {
    console.warn("[loadWorkflowDetailPage] steps", stepErr.message);
  }

  const steps: WorkflowDetailStepRow[] = (stepRows ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    step_index: Number(row.step_index ?? 0),
    step_type: String(row.step_type ?? ""),
    step_key: String(row.step_key ?? ""),
    requires_approval: Boolean(row.requires_approval),
    params_jsonb: asRecord(row.params_jsonb)
  }));

  const composeStep = steps.find((s) => s.step_type === COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE);
  const composeSignalIdsOrdered: string[] = [];
  if (composeStep) {
    const rawIds = composeStep.params_jsonb["selectedSignalIds"];
    if (Array.isArray(rawIds)) {
      for (const entry of rawIds) {
        const sid = typeof entry === "string" ? entry.trim() : "";
        if (sid) composeSignalIdsOrdered.push(sid);
      }
    }
  }
  const composeSignalIdsUnique = Array.from(new Set(composeSignalIdsOrdered));

  let signalNameById = new Map<string, string>();
  if (composeSignalIdsUnique.length > 0) {
    const { data: sigRows, error: sigErr } = await input.supabase
      .from("signals")
      .select("id, name, company_id, event_id, signal_scope, owner_user_id, is_active")
      .in("id", composeSignalIdsUnique);

    if (sigErr) {
      console.warn("[loadWorkflowDetailPage] signals", sigErr.message);
    }
    const eligibleRows =
      template.event_id && typeof tplRow.company_id === "string"
        ? filterWorkflowSelectableSignalRowsForEvent(sigRows ?? [], {
            companyId: tplRow.company_id,
            eventId: template.event_id
          })
        : [];
    signalNameById = new Map(
      eligibleRows.map((r: { id: string; name: string | null }) => [
        String(r.id),
        String(r.name ?? r.id)
      ])
    );
  }

  const composeSignals: WorkflowDetailComposeSignal[] = composeSignalIdsOrdered
    .map((sid) => {
      const name = signalNameById.get(sid);
      return name ? { id: sid, name } : null;
    })
    .filter((signal): signal is WorkflowDetailComposeSignal => Boolean(signal));

  let runQuery = input.supabase
    .from("workflow_runs")
    .select("id, status, lead_id, current_step_index, template_version, created_at, completed_at, updated_at")
    .eq("template_id", workflowId)
    .order("created_at", { ascending: false });
  runQuery = applyRunStatusFilter(runQuery, runFilter);
  if (runCursor) runQuery = runQuery.lt("created_at", runCursor);
  const { data: runRows, error: runErr } = await runQuery.limit(RUN_FETCH_LIMIT);

  if (runErr) {
    console.warn("[loadWorkflowDetailPage] runs", runErr.message);
  }

  const fetchedRuns: WorkflowRunSummaryRow[] = (runRows ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    status: String(row.status ?? ""),
    lead_id: String(row.lead_id ?? ""),
    current_step_index:
      row.current_step_index === null || row.current_step_index === undefined
        ? null
        : Number(row.current_step_index),
    template_version: Number(row.template_version ?? 1),
    created_at: String(row.created_at ?? ""),
    completed_at: row.completed_at != null ? String(row.completed_at) : null,
    updated_at: String(row.updated_at ?? "")
  }));
  const hasMoreRuns = fetchedRuns.length > RUN_PAGE_SIZE;
  const runs = fetchedRuns.slice(0, RUN_PAGE_SIZE);
  const nextCursor = hasMoreRuns ? runs[runs.length - 1]?.created_at ?? null : null;

  let pendingRunQuery = input.supabase
    .from("workflow_runs")
    .select("id, status, lead_id, current_step_index, template_version, created_at, completed_at, updated_at")
    .eq("template_id", workflowId)
    .eq("status", "awaiting_approval")
    .order("updated_at", { ascending: false });
  const { data: pendingRunRows, error: pendingRunErr } = await pendingRunQuery.limit(PENDING_APPROVAL_LIMIT);
  if (pendingRunErr) {
    console.warn("[loadWorkflowDetailPage] pending runs", pendingRunErr.message);
  }
  const pendingRuns: WorkflowRunSummaryRow[] = (pendingRunRows ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    status: String(row.status ?? ""),
    lead_id: String(row.lead_id ?? ""),
    current_step_index:
      row.current_step_index === null || row.current_step_index === undefined
        ? null
        : Number(row.current_step_index),
    template_version: Number(row.template_version ?? 1),
    created_at: String(row.created_at ?? ""),
    completed_at: row.completed_at != null ? String(row.completed_at) : null,
    updated_at: String(row.updated_at ?? "")
  }));

  const leadIds = Array.from(new Set([...runs, ...pendingRuns].map((r) => r.lead_id).filter(Boolean)));
  let leads: LeadSummaryMini[] = [];
  if (leadIds.length > 0) {
    const { data: leadRows, error: leadErr } = await input.supabase
      .from("leads")
      .select("id, full_name, email, company_text")
      .in("id", leadIds);

    if (leadErr) {
      console.warn("[loadWorkflowDetailPage] leads", leadErr.message);
    }
    leads = (leadRows ?? []).map((row: { id: string; full_name: string | null; email: string | null; company_text?: string | null }) => ({
      id: String(row.id),
      full_name: String(row.full_name ?? "Unknown lead"),
      email: row.email != null ? String(row.email) : null,
      company_text: row.company_text != null ? String(row.company_text) : null
    }));
  }
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  let pendingDrafts: WorkflowDraftDetailRow[] = [];
  const pendingRunsForApprovalLookup = [
    ...pendingRuns,
    ...runs.filter((run) => run.status === "awaiting_approval" && !pendingRuns.some((pendingRun) => pendingRun.id === run.id))
  ];
  const pendingRunIds = pendingRunsForApprovalLookup.map((run) => run.id);
  if (pendingRunIds.length > 0) {
    const { data: pendingDraftRows, error: pendingDraftErr } = await input.supabase
      .from("generated_drafts")
      .select("id, lead_id, run_id, step_run_id, kind, approval_status, promoted_to_id, content_jsonb, created_at")
      .in("run_id", pendingRunIds)
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false });
    if (pendingDraftErr) {
      console.warn("[loadWorkflowDetailPage] pending drafts", pendingDraftErr.message);
    }
    pendingDrafts = (pendingDraftRows ?? []).map(mapDraftRow);
  }
  const pendingStepRunIds = Array.from(new Set(pendingDrafts.map((draft) => draft.step_run_id).filter(Boolean)));
  let stepIndexByPendingStepRunId = new Map<string, number>();
  if (pendingStepRunIds.length > 0) {
    const { data: pendingStepRows, error: pendingStepErr } = await input.supabase
      .from("workflow_step_runs")
      .select("id, step_index")
      .in("id", pendingStepRunIds);
    if (pendingStepErr) {
      console.warn("[loadWorkflowDetailPage] pending step runs", pendingStepErr.message);
    }
    stepIndexByPendingStepRunId = new Map(
      (pendingStepRows ?? []).map((row: Record<string, unknown>) => [String(row.id), Number(row.step_index ?? 0)])
    );
  }
  const pendingRunById = new Map(pendingRunsForApprovalLookup.map((run) => [run.id, run]));
  const pendingApprovals: WorkflowPendingApprovalDetail[] = pendingDrafts
    .map((draft) => {
      const run = pendingRunById.get(draft.run_id);
      if (!run) return null;
      const stepIndex = stepIndexByPendingStepRunId.get(draft.step_run_id) ?? run.current_step_index ?? null;
      const step = stepIndex != null ? steps.find((s) => s.step_index === stepIndex) : null;
      return {
        draft,
        run,
        lead: leadById.get(draft.lead_id) ?? leadById.get(run.lead_id) ?? null,
        step_label: step?.step_type ?? null
      };
    })
    .filter((approval): approval is WorkflowPendingApprovalDetail => Boolean(approval));

  const runIdSet = new Set(runs.map((r) => r.id));
  let selectedRunId: string | null = null;
  const pref = String(input.preferredRunId ?? "").trim();
  if (pref && runIdSet.has(pref)) {
    selectedRunId = pref;
  } else if (runs.length > 0) {
    selectedRunId = runs[0]!.id;
  }

  let stepRuns: WorkflowStepRunDetailRow[] = [];
  let drafts: WorkflowDraftDetailRow[] = [];

  const stepTypeByStepPk = new Map(steps.map((s) => [s.id, s.step_type]));

  if (selectedRunId) {
    const { data: srRows, error: srErr } = await input.supabase
      .from("workflow_step_runs")
      .select(
        "id, step_id, step_index, step_key, status, attempt_count, output_jsonb, error_code, error_text, waiting_reason, required_conversation_version, current_transcript_version, current_insights_version, wait_started_at, wait_expires_at, started_at, completed_at"
      )
      .eq("run_id", selectedRunId)
      .order("step_index", { ascending: true });

    if (srErr) {
      console.warn("[loadWorkflowDetailPage] step_runs", srErr.message);
    }

    stepRuns = (srRows ?? []).map((row: Record<string, unknown>) => {
      const stepPk = String(row.step_id ?? "");
      return {
        id: String(row.id),
        step_index: Number(row.step_index ?? 0),
        step_key: String(row.step_key ?? ""),
        step_type: stepTypeByStepPk.get(stepPk) ?? String(row.step_key ?? "unknown"),
        status: String(row.status ?? ""),
        attempt_count: Number(row.attempt_count ?? 0),
        output_jsonb: asRecord(row.output_jsonb),
        error_code: row.error_code != null ? String(row.error_code) : null,
        error_text: row.error_text != null ? String(row.error_text) : null,
        waiting_reason: row.waiting_reason != null ? String(row.waiting_reason) : null,
        required_conversation_version:
          row.required_conversation_version != null ? Number(row.required_conversation_version) : null,
        current_transcript_version:
          row.current_transcript_version != null ? Number(row.current_transcript_version) : null,
        current_insights_version:
          row.current_insights_version != null ? Number(row.current_insights_version) : null,
        wait_started_at: row.wait_started_at != null ? String(row.wait_started_at) : null,
        wait_expires_at: row.wait_expires_at != null ? String(row.wait_expires_at) : null,
        started_at: row.started_at != null ? String(row.started_at) : null,
        completed_at: row.completed_at != null ? String(row.completed_at) : null
      };
    });

    const { data: draftRows, error: dErr } = await input.supabase
      .from("generated_drafts")
      .select("id, kind, approval_status, promoted_to_id, content_jsonb, created_at")
      .eq("run_id", selectedRunId)
      .order("created_at", { ascending: true });

    if (dErr) {
      console.warn("[loadWorkflowDetailPage] drafts", dErr.message);
    }

    drafts = (draftRows ?? []).map(mapDraftRow);
  }

  return {
    template,
    steps,
    composeSignals,
    runs,
    runFilter,
    runPagination: { pageSize: RUN_PAGE_SIZE, hasMore: hasMoreRuns, nextCursor },
    leads,
    selectedRunId,
    stepRuns,
    drafts,
    pendingApprovals,
    selectedApprovalId: preferredApprovalId
  };
}
