import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type LeadWorkflowStatusFilter =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "completed";

export type LeadWorkflowSummary = {
  leadId: string;
  pendingApprovalCount: number;
  approvedCount: number;
  rejectedCount: number;
  failedCount: number;
  completedCount: number;
  reviewHref: string | null;
};

export type WorkflowActivityRecord = {
  id: string;
  kind: "draft" | "run";
  lead_id: string;
  lead_name: string | null;
  lead_email: string | null;
  lead_company: string | null;
  template_id: string;
  template_name: string | null;
  run_id: string;
  draft_id: string | null;
  draft_kind: string | null;
  step_run_id: string | null;
  step_key: string | null;
  status: string;
  created_at: string;
  href: string;
  content: Record<string, unknown> | null;
};

type DraftRow = {
  id: string;
  lead_id: string;
  run_id: string;
  step_run_id: string;
  kind: string;
  content_jsonb: Record<string, unknown> | null;
  approval_status: string;
  created_at: string;
};

type RunRow = {
  id: string;
  lead_id: string;
  template_id: string;
  status: string;
  created_at: string;
  event_id: string | null;
};

const WORKFLOW_STATUS_FILTERS = new Set<LeadWorkflowStatusFilter>([
  "pending_approval",
  "approved",
  "rejected",
  "failed",
  "completed"
]);

export function parseLeadWorkflowStatusFilter(value: unknown): LeadWorkflowStatusFilter | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return WORKFLOW_STATUS_FILTERS.has(normalized as LeadWorkflowStatusFilter)
    ? (normalized as LeadWorkflowStatusFilter)
    : null;
}

export function workflowStatusLabel(status: LeadWorkflowStatusFilter): string {
  switch (status) {
    case "pending_approval":
      return "Pending approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "failed":
      return "Failed";
    case "completed":
      return "Synced/completed";
  }
}

export function emptyLeadWorkflowSummary(leadId: string): LeadWorkflowSummary {
  return {
    leadId,
    pendingApprovalCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    failedCount: 0,
    completedCount: 0,
    reviewHref: null
  };
}

export async function loadWorkflowSummariesForLeads(input: {
  supabase: SupabaseServerClient;
  companyId: string;
  eventId: string | null;
  leadIds: readonly string[];
}): Promise<Record<string, LeadWorkflowSummary>> {
  const leadIds = unique(input.leadIds);
  const summaries: Record<string, LeadWorkflowSummary> = {};
  for (const leadId of leadIds) summaries[leadId] = emptyLeadWorkflowSummary(leadId);
  if (leadIds.length === 0) return summaries;

  const drafts = await loadDraftRows(input.supabase, {
    companyId: input.companyId,
    eventId: input.eventId,
    leadIds
  });
  const runs = await loadRunRows(input.supabase, {
    companyId: input.companyId,
    eventId: input.eventId,
    leadIds
  });
  const runById = new Map(runs.map((run) => [run.id, run]));

  for (const run of runs) {
    const summary = summaries[run.lead_id] ?? emptyLeadWorkflowSummary(run.lead_id);
    if (run.status === "failed") summary.failedCount += 1;
    if (run.status === "completed") summary.completedCount += 1;
    summaries[run.lead_id] = summary;
  }

  for (const draft of drafts) {
    const summary = summaries[draft.lead_id] ?? emptyLeadWorkflowSummary(draft.lead_id);
    if (draft.approval_status === "pending") {
      summary.pendingApprovalCount += 1;
      if (!summary.reviewHref) {
        const run = runById.get(draft.run_id);
        if (run) summary.reviewHref = workflowDetailHref(run, draft.id);
      }
    }
    if (draft.approval_status === "approved") summary.approvedCount += 1;
    if (draft.approval_status === "rejected") summary.rejectedCount += 1;
    summaries[draft.lead_id] = summary;
  }

  return summaries;
}

export async function loadLeadIdsForWorkflowStatus(input: {
  supabase: SupabaseServerClient;
  companyId: string;
  eventId: string | null;
  status: LeadWorkflowStatusFilter;
}): Promise<string[]> {
  if (input.status === "pending_approval" || input.status === "approved" || input.status === "rejected") {
    const approvalStatus = input.status === "pending_approval" ? "pending" : input.status;
    let query = (input.supabase as any)
      .from("generated_drafts")
      .select("lead_id")
      .eq("company_id", input.companyId)
      .eq("approval_status", approvalStatus);
    if (input.eventId) query = query.eq("event_id", input.eventId);
    const { data, error } = await query;
    if (error) {
      console.warn("[workflow-lead-activity] draft status filter failed", { message: error.message });
      return [];
    }
    return unique((data ?? []).map((row: { lead_id?: unknown }) => String(row.lead_id ?? "")));
  }

  let query = (input.supabase as any)
    .from("workflow_runs")
    .select("lead_id")
    .eq("company_id", input.companyId)
    .eq("status", input.status === "completed" ? "completed" : "failed");
  if (input.eventId) query = query.eq("event_id", input.eventId);
  const { data, error } = await query;
  if (error) {
    console.warn("[workflow-lead-activity] run status filter failed", { message: error.message });
    return [];
  }
  return unique((data ?? []).map((row: { lead_id?: unknown }) => String(row.lead_id ?? "")));
}

export async function loadPendingWorkflowApprovalCount(input: {
  supabase: SupabaseServerClient;
  companyId: string;
  eventId: string | null;
}): Promise<number> {
  let query = (input.supabase as any)
    .from("generated_drafts")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("approval_status", "pending");
  if (input.eventId) query = query.eq("event_id", input.eventId);
  const { data, error } = await query;
  if (error) {
    console.warn("[workflow-lead-activity] pending approval count failed", { message: error.message });
    return 0;
  }
  return (data ?? []).length;
}

export async function loadWorkflowActivityRecords(input: {
  supabase: SupabaseServerClient;
  companyId: string;
  eventId: string | null;
  leadId: string | null;
  status: LeadWorkflowStatusFilter | null;
  limit?: number;
}): Promise<WorkflowActivityRecord[]> {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 50)));
  const status = input.status;
  const records: WorkflowActivityRecord[] = [];

  if (!status || status === "pending_approval" || status === "approved" || status === "rejected") {
    const draftStatus = status === "pending_approval" ? "pending" : status;
    let query = (input.supabase as any)
      .from("generated_drafts")
      .select("id, lead_id, run_id, step_run_id, kind, content_jsonb, approval_status, created_at")
      .eq("company_id", input.companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (draftStatus) query = query.eq("approval_status", draftStatus);
    if (input.eventId) query = query.eq("event_id", input.eventId);
    if (input.leadId) query = query.eq("lead_id", input.leadId);
    const { data, error } = await query;
    if (!error) {
      records.push(
        ...(await hydrateDraftActivity(input.supabase, {
          companyId: input.companyId,
          drafts: data ?? []
        }))
      );
    }
  }

  if (!status || status === "failed" || status === "completed") {
    let query = (input.supabase as any)
      .from("workflow_runs")
      .select("id, lead_id, template_id, status, created_at, event_id")
      .eq("company_id", input.companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    if (input.eventId) query = query.eq("event_id", input.eventId);
    if (input.leadId) query = query.eq("lead_id", input.leadId);
    const { data, error } = await query;
    if (!error) {
      records.push(
        ...(await hydrateRunActivity(input.supabase, {
          companyId: input.companyId,
          runs: data ?? []
        }))
      );
    }
  }

  return records
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

async function loadDraftRows(
  supabase: SupabaseServerClient,
  input: { companyId: string; eventId: string | null; leadIds: readonly string[] }
): Promise<DraftRow[]> {
  let query = (supabase as any)
    .from("generated_drafts")
    .select("id, lead_id, run_id, step_run_id, kind, content_jsonb, approval_status, created_at")
    .eq("company_id", input.companyId)
    .in("lead_id", input.leadIds);
  if (input.eventId) query = query.eq("event_id", input.eventId);
  const { data, error } = await query;
  if (error) {
    console.warn("[workflow-lead-activity] draft summary failed", { message: error.message });
    return [];
  }
  return (data ?? []) as DraftRow[];
}

async function loadRunRows(
  supabase: SupabaseServerClient,
  input: { companyId: string; eventId: string | null; leadIds: readonly string[] }
): Promise<RunRow[]> {
  let query = (supabase as any)
    .from("workflow_runs")
    .select("id, lead_id, template_id, status, created_at, event_id")
    .eq("company_id", input.companyId)
    .in("lead_id", input.leadIds);
  if (input.eventId) query = query.eq("event_id", input.eventId);
  const { data, error } = await query;
  if (error) {
    console.warn("[workflow-lead-activity] run summary failed", { message: error.message });
    return [];
  }
  return (data ?? []) as RunRow[];
}

async function hydrateDraftActivity(
  supabase: SupabaseServerClient,
  input: { companyId: string; drafts: DraftRow[] }
): Promise<WorkflowActivityRecord[]> {
  const runIds = unique(input.drafts.map((draft) => draft.run_id));
  if (runIds.length === 0) return [];
  const runs = await loadRunsByIds(supabase, input.companyId, runIds);
  const runById = new Map(runs.map((run) => [run.id, run]));
  const leads = await loadLeadNames(supabase, input.companyId, unique(input.drafts.map((draft) => draft.lead_id)));
  const templates = await loadTemplateNames(supabase, input.companyId, unique(runs.map((run) => run.template_id)));
  const stepKeys = await loadStepRunKeys(supabase, unique(input.drafts.map((draft) => draft.step_run_id)));

  return input.drafts
    .map((draft): WorkflowActivityRecord | null => {
      const run = runById.get(draft.run_id);
      const lead = leads.get(draft.lead_id);
      if (!run) return null;
      return {
        id: draft.id,
        kind: "draft" as const,
        lead_id: draft.lead_id,
        lead_name: lead?.name ?? null,
        lead_email: lead?.email ?? null,
        lead_company: lead?.company ?? null,
        template_id: run.template_id,
        template_name: templates.get(run.template_id) ?? null,
        run_id: draft.run_id,
        draft_id: draft.id,
        draft_kind: draft.kind,
        step_run_id: draft.step_run_id,
        step_key: stepKeys.get(draft.step_run_id) ?? null,
        status: draft.approval_status,
        created_at: draft.created_at,
        href: workflowDetailHref(run, draft.id),
        content: draft.content_jsonb ?? null
      };
    })
    .filter((record): record is WorkflowActivityRecord => record !== null);
}

async function hydrateRunActivity(
  supabase: SupabaseServerClient,
  input: { companyId: string; runs: RunRow[] }
): Promise<WorkflowActivityRecord[]> {
  const leads = await loadLeadNames(supabase, input.companyId, unique(input.runs.map((run) => run.lead_id)));
  const templates = await loadTemplateNames(supabase, input.companyId, unique(input.runs.map((run) => run.template_id)));
  return input.runs.map((run) => {
    const lead = leads.get(run.lead_id);
    return {
      id: run.id,
      kind: "run",
      lead_id: run.lead_id,
      lead_name: lead?.name ?? null,
      lead_email: lead?.email ?? null,
      lead_company: lead?.company ?? null,
      template_id: run.template_id,
      template_name: templates.get(run.template_id) ?? null,
      run_id: run.id,
      draft_id: null,
      draft_kind: null,
      step_run_id: null,
      step_key: null,
      status: run.status,
      created_at: run.created_at,
      href: workflowDetailHref(run, null),
      content: null
    };
  });
}

async function loadRunsByIds(
  supabase: SupabaseServerClient,
  companyId: string,
  runIds: readonly string[]
): Promise<RunRow[]> {
  if (runIds.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from("workflow_runs")
    .select("id, lead_id, template_id, status, created_at, event_id")
    .eq("company_id", companyId)
    .in("id", runIds);
  if (error) return [];
  return (data ?? []) as RunRow[];
}

async function loadLeadNames(
  supabase: SupabaseServerClient,
  companyId: string,
  leadIds: readonly string[]
): Promise<Map<string, { name: string | null; email: string | null; company: string | null }>> {
  if (leadIds.length === 0) return new Map();
  const { data, error } = await (supabase as any)
    .from("leads")
    .select("id, full_name, email, company_text")
    .eq("company_id", companyId)
    .in("id", leadIds);
  if (error) return new Map();
  return new Map(
    (data ?? []).map((row: { id: string; full_name: string | null; email: string | null; company_text?: string | null }) => [
      row.id,
      { name: row.full_name, email: row.email, company: row.company_text ?? null }
    ])
  );
}

async function loadStepRunKeys(
  supabase: SupabaseServerClient,
  stepRunIds: readonly string[]
): Promise<Map<string, string | null>> {
  if (stepRunIds.length === 0) return new Map();
  const { data, error } = await (supabase as any)
    .from("workflow_step_runs")
    .select("id, step_key")
    .in("id", stepRunIds);
  if (error) return new Map();
  return new Map((data ?? []).map((row: { id: string; step_key: string | null }) => [row.id, row.step_key]));
}

async function loadTemplateNames(
  supabase: SupabaseServerClient,
  companyId: string,
  templateIds: readonly string[]
): Promise<Map<string, string | null>> {
  if (templateIds.length === 0) return new Map();
  const { data, error } = await (supabase as any)
    .from("workflow_templates")
    .select("id, name")
    .eq("company_id", companyId)
    .in("id", templateIds);
  if (error) return new Map();
  return new Map((data ?? []).map((row: { id: string; name: string | null }) => [row.id, row.name]));
}

function workflowDetailHref(run: Pick<RunRow, "template_id" | "id" | "event_id">, draftId: string | null): string {
  const params = new URLSearchParams();
  params.set("runId", run.id);
  if (run.event_id) params.set("eventId", run.event_id);
  const hash = draftId ? `#draft-${encodeURIComponent(draftId)}` : "";
  return `/exhibitor/workflows/${encodeURIComponent(run.template_id)}?${params.toString()}${hash}`;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}
