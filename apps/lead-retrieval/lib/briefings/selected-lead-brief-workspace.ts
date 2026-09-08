import { buildPreviewColumnsFromParse } from "@/lib/import-wizard/parse-csv-sample";

export const SELECTED_LEAD_HEADERS = [
  "Lead ID",
  "Full Name",
  "Email",
  "Job Title",
  "Company",
  "Temperature",
  "Rating",
  "Status",
  "Follow-up Date",
] as const;

export const SELECTED_LEAD_SELECTIONS: Record<string, string> = {
  "1": "full_name",
  "2": "email",
  "3": "job_title",
  "4": "company_text",
  "5": "temperature",
  "6": "rating",
  "7": "status",
  "8": "follow_up_date",
};

export const MAX_SELECTED_BRIEF_LEADS = 500;

export type SelectedLeadBriefWorkspaceLead = {
  id: string;
  company_id: string | null;
  event_id: string | null;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  company_text: string | null;
  temperature: string | null;
  rating: number | string | null;
  status: string | null;
  follow_up_date: string | null;
};

function cell(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export function uniqueTrimmedSelectedLeadIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function buildSelectedLeadBriefWorkspaceRows(
  leads: SelectedLeadBriefWorkspaceLead[]
): string[][] {
  return leads.map((lead) => [
    lead.id,
    cell(lead.full_name),
    cell(lead.email),
    cell(lead.job_title),
    cell(lead.company_text),
    cell(lead.temperature),
    cell(lead.rating),
    cell(lead.status),
    cell(lead.follow_up_date),
  ]);
}

export function buildSelectedLeadBriefPreviewRows(stagedRows: string[][]) {
  return buildPreviewColumnsFromParse({
    headers: [...SELECTED_LEAD_HEADERS],
    dataRows: stagedRows.slice(0, 3),
  });
}

export function validateSelectedLeadRowsForBriefWorkspace(input: {
  requestedLeadIds: string[];
  rows: SelectedLeadBriefWorkspaceLead[];
  companyId: string;
  eventId: string;
}): SelectedLeadBriefWorkspaceLead[] {
  const requested = uniqueTrimmedSelectedLeadIds(input.requestedLeadIds);
  const byId = new Map(input.rows.map((row) => [String(row.id), row] as const));

  if (requested.length === 0) {
    throw new Error("lead_selection_empty");
  }
  if (requested.length > MAX_SELECTED_BRIEF_LEADS) {
    throw new Error("lead_selection_too_large");
  }

  const ordered: SelectedLeadBriefWorkspaceLead[] = [];
  for (const id of requested) {
    const row = byId.get(id);
    if (!row) {
      throw new Error("lead_selection_unauthorized");
    }
    if (String(row.company_id ?? "").trim() !== input.companyId) {
      throw new Error("lead_selection_unauthorized");
    }
    if (String(row.event_id ?? "").trim() !== input.eventId) {
      throw new Error("lead_selection_unauthorized");
    }
    ordered.push(row);
  }
  return ordered;
}
