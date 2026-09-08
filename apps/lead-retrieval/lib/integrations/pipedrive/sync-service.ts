import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { pipedriveRequest } from "@/lib/integrations/pipedrive/client";
import { getPipedriveSetupSettings } from "@/lib/integrations/pipedrive/setup-service";
import { loadLatestScopedConversationInsights } from "@/lib/workflows/step-handlers/crm-sync-conversation-insights";
import { runPipedriveSync, type PipedriveSyncDeps, type PipedriveSyncRowPatch } from "@/lib/integrations/pipedrive/sync-orchestrator";
import type {
  PipedriveLeadSyncRow,
  PipedriveSyncLeadRow,
  PipedriveSyncResult,
  PipedriveSyncSource
} from "@/lib/integrations/pipedrive/sync-core";

type PipedriveSearchResponse = { items?: Array<{ item?: { id?: number | string } }> };
type PipedriveIdResponse = { id?: number | string };

function normalize(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

async function loadLead(input: { companyId: string; leadId: string }): Promise<PipedriveSyncLeadRow | null> {
  const { data, error } = await (createAdminClient() as any)
    .from("leads")
    .select("id, company_id, full_name, email, company_text, company_domain, job_title, follow_up_at, follow_up_date")
    .eq("id", input.leadId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load lead.");
  if (!data) return null;
  return {
    id: data.id,
    companyId: data.company_id,
    fullName: normalize(data.full_name),
    email: normalize(data.email),
    companyText: normalize(data.company_text),
    companyDomain: normalize(data.company_domain),
    jobTitle: normalize(data.job_title),
    followUpAt: normalize(data.follow_up_at),
    followUpDate: normalize(data.follow_up_date)
  };
}

type SyncRowDbShape = {
  id: string;
  status: "queued" | "syncing" | "synced" | "failed";
  attempts: number;
  pipedrive_person_id: string | null;
  person_action: PipedriveLeadSyncRow["personAction"];
  pipedrive_organization_id: string | null;
  organization_action: PipedriveLeadSyncRow["organizationAction"];
  destination_kind: PipedriveLeadSyncRow["destinationKind"];
  pipedrive_destination_id: string | null;
  destination_action: PipedriveLeadSyncRow["destinationAction"];
  synopsis_note_id: string | null;
  synopsis_note_action: PipedriveLeadSyncRow["synopsisNoteAction"];
  email_draft_note_id: string | null;
  email_draft_note_action: PipedriveLeadSyncRow["emailDraftNoteAction"];
  activity_id: string | null;
  activity_action: PipedriveLeadSyncRow["activityAction"];
};

function toSyncRow(row: SyncRowDbShape): PipedriveLeadSyncRow {
  return {
    id: row.id,
    status: row.status,
    attempts: row.attempts,
    personId: row.pipedrive_person_id,
    personAction: row.person_action,
    organizationId: row.pipedrive_organization_id,
    organizationAction: row.organization_action,
    destinationKind: row.destination_kind,
    destinationId: row.pipedrive_destination_id,
    destinationAction: row.destination_action,
    synopsisNoteId: row.synopsis_note_id,
    synopsisNoteAction: row.synopsis_note_action,
    emailDraftNoteId: row.email_draft_note_id,
    emailDraftNoteAction: row.email_draft_note_action,
    activityId: row.activity_id,
    activityAction: row.activity_action
  };
}

const SYNC_ROW_COLUMNS =
  "id, status, attempts, pipedrive_person_id, person_action, pipedrive_organization_id, organization_action, destination_kind, pipedrive_destination_id, destination_action, synopsis_note_id, synopsis_note_action, email_draft_note_id, email_draft_note_action, activity_id, activity_action";

async function beginSync(input: {
  companyId: string;
  leadId: string;
  source: PipedriveSyncSource;
  requestedByUserId: string | null;
}): Promise<PipedriveLeadSyncRow> {
  const supabase = createAdminClient() as any;
  const existing = await supabase
    .from("pipedrive_lead_syncs")
    .select(SYNC_ROW_COLUMNS + ", attempts")
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message ?? "Failed to load Pipedrive sync state.");

  if (existing.data) {
    // Preserve the row's original `source` (how it was first enqueued) rather than
    // overwriting it with whatever caller happens to process it now — the tick, for
    // example, processes bulk/auto/manual/test rows alike and shouldn't relabel them.
    const updated = await supabase
      .from("pipedrive_lead_syncs")
      .update({
        status: "syncing",
        attempts: Number(existing.data.attempts ?? 0) + 1,
        requested_by_user_id: input.requestedByUserId ?? undefined,
        last_error: null
      })
      .eq("id", existing.data.id)
      .select(SYNC_ROW_COLUMNS)
      .single();
    if (updated.error || !updated.data) throw new Error("Failed to start Pipedrive sync.");
    return toSyncRow(updated.data);
  }

  const inserted = await supabase
    .from("pipedrive_lead_syncs")
    .insert({
      company_id: input.companyId,
      lead_id: input.leadId,
      status: "syncing",
      attempts: 1,
      source: input.source,
      requested_by_user_id: input.requestedByUserId
    })
    .select(SYNC_ROW_COLUMNS)
    .single();
  if (inserted.error || !inserted.data) throw new Error("Failed to start Pipedrive sync.");
  return toSyncRow(inserted.data);
}

async function persistRow(rowId: string, patch: PipedriveSyncRowPatch): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if ("personId" in patch) dbPatch.pipedrive_person_id = patch.personId;
  if ("personAction" in patch) dbPatch.person_action = patch.personAction;
  if ("organizationId" in patch) dbPatch.pipedrive_organization_id = patch.organizationId;
  if ("organizationAction" in patch) dbPatch.organization_action = patch.organizationAction;
  if ("destinationKind" in patch) dbPatch.destination_kind = patch.destinationKind;
  if ("destinationId" in patch) dbPatch.pipedrive_destination_id = patch.destinationId;
  if ("destinationAction" in patch) dbPatch.destination_action = patch.destinationAction;
  if ("synopsisNoteId" in patch) dbPatch.synopsis_note_id = patch.synopsisNoteId;
  if ("synopsisNoteAction" in patch) dbPatch.synopsis_note_action = patch.synopsisNoteAction;
  if ("emailDraftNoteId" in patch) dbPatch.email_draft_note_id = patch.emailDraftNoteId;
  if ("emailDraftNoteAction" in patch) dbPatch.email_draft_note_action = patch.emailDraftNoteAction;
  if ("activityId" in patch) dbPatch.activity_id = patch.activityId;
  if ("activityAction" in patch) dbPatch.activity_action = patch.activityAction;
  if ("status" in patch) dbPatch.status = patch.status;
  if ("lastError" in patch) dbPatch.last_error = patch.lastError;
  if ("nextAttemptAt" in patch) dbPatch.next_attempt_at = patch.nextAttemptAt;
  if ("syncedAt" in patch) dbPatch.synced_at = patch.syncedAt;
  if (Object.keys(dbPatch).length === 0) return;

  const response = await (createAdminClient() as any).from("pipedrive_lead_syncs").update(dbPatch).eq("id", rowId);
  if (response.error) throw new Error(response.error.message ?? "Failed to persist Pipedrive sync progress.");
}

async function findPersonByEmail(input: { companyId: string; email: string }): Promise<string | null> {
  const data = await pipedriveRequest<PipedriveSearchResponse>(
    input.companyId,
    `/api/v2/persons/search?term=${encodeURIComponent(input.email)}&fields=email&exact_match=true&limit=1`,
    { method: "GET" }
  );
  const id = data?.items?.[0]?.item?.id;
  return id === undefined || id === null ? null : String(id);
}

async function createPerson(input: { companyId: string; payload: Record<string, unknown> }): Promise<string> {
  const data = await pipedriveRequest<PipedriveIdResponse>(input.companyId, "/api/v2/persons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload)
  });
  const id = normalize(data?.id);
  if (!id) throw new Error("Pipedrive did not return a person id.");
  return id;
}

async function findOrganizationByName(input: { companyId: string; name: string }): Promise<string | null> {
  const data = await pipedriveRequest<PipedriveSearchResponse>(
    input.companyId,
    `/api/v2/organizations/search?term=${encodeURIComponent(input.name)}&fields=name&exact_match=true&limit=1`,
    { method: "GET" }
  );
  const id = data?.items?.[0]?.item?.id;
  return id === undefined || id === null ? null : String(id);
}

async function createOrganization(input: { companyId: string; payload: Record<string, unknown> }): Promise<string> {
  const data = await pipedriveRequest<PipedriveIdResponse>(input.companyId, "/api/v2/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload)
  });
  const id = normalize(data?.id);
  if (!id) throw new Error("Pipedrive did not return an organization id.");
  return id;
}

async function createDeal(input: { companyId: string; payload: Record<string, unknown> }): Promise<string> {
  const data = await pipedriveRequest<PipedriveIdResponse>(input.companyId, "/api/v2/deals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload)
  });
  const id = normalize(data?.id);
  if (!id) throw new Error("Pipedrive did not return a deal id.");
  return id;
}

async function createPipedriveLead(input: { companyId: string; payload: Record<string, unknown> }): Promise<string> {
  const data = await pipedriveRequest<PipedriveIdResponse>(input.companyId, "/api/v1/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload)
  });
  const id = normalize(data?.id);
  if (!id) throw new Error("Pipedrive did not return a lead id.");
  return id;
}

async function loadConversationInsight(input: { companyId: string; leadId: string }) {
  const insight = await loadLatestScopedConversationInsights(createAdminClient() as any, {
    accountId: input.companyId,
    leadId: input.leadId
  });
  return { summary: insight?.summary ?? null };
}

async function loadEmailDraft(input: { companyId: string; leadId: string }) {
  const { data, error } = await (createAdminClient() as any)
    .from("generated_drafts")
    .select("content_jsonb")
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .eq("kind", "email")
    .in("approval_status", ["approved", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load the generated email draft.");
  const content = (data?.content_jsonb ?? {}) as { subject?: unknown; body_text?: unknown };
  if (!data) return null;
  return { subject: normalize(content.subject), bodyText: normalize(content.body_text) };
}

async function createNote(input: { companyId: string; payload: Record<string, unknown> }): Promise<string> {
  const data = await pipedriveRequest<PipedriveIdResponse>(input.companyId, "/api/v1/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload)
  });
  const id = normalize(data?.id);
  if (!id) throw new Error("Pipedrive did not return a note id.");
  return id;
}

async function createActivity(input: { companyId: string; payload: Record<string, unknown> }): Promise<string> {
  const data = await pipedriveRequest<PipedriveIdResponse>(input.companyId, "/api/v2/activities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload)
  });
  const id = normalize(data?.id);
  if (!id) throw new Error("Pipedrive did not return an activity id.");
  return id;
}

const deps: PipedriveSyncDeps = {
  loadLead,
  loadSettings: getPipedriveSetupSettings,
  beginSync,
  persistRow,
  findPersonByEmail,
  createPerson,
  findOrganizationByName,
  createOrganization,
  createDeal,
  createPipedriveLead,
  loadConversationInsight,
  loadEmailDraft,
  createNote,
  createActivity,
  now: () => new Date()
};

/**
 * The canonical Pipedrive delivery service. Every UX surface (lead detail,
 * list bulk action, setup-page test send) and the background queue tick call
 * this exact function — never a provider-specific duplicate.
 */
export async function syncLeadToPipedrive(input: {
  companyId: string;
  leadId: string;
  source: PipedriveSyncSource;
  requestedByUserId?: string | null;
}): Promise<PipedriveSyncResult> {
  return runPipedriveSync(deps, input);
}
