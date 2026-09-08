import type { PipedriveSetupSettings } from "@/lib/integrations/pipedrive/setup-core";

export type PipedriveSyncSource = "manual" | "bulk" | "test" | "auto";
export type PipedriveSyncStatus = "queued" | "syncing" | "synced" | "failed";
export type PipedriveMatchAction = "created" | "matched" | "reused" | "skipped";
export type PipedriveCreateAction = "created" | "reused" | "skipped";

export const MAX_PIPEDRIVE_AUTO_ATTEMPTS = 5;

export type PipedriveLeadSyncRow = {
  id: string;
  status: PipedriveSyncStatus;
  attempts: number;
  personId: string | null;
  personAction: PipedriveMatchAction | null;
  organizationId: string | null;
  organizationAction: PipedriveMatchAction | null;
  destinationKind: "lead" | "deal" | null;
  destinationId: string | null;
  destinationAction: PipedriveCreateAction | null;
  synopsisNoteId: string | null;
  synopsisNoteAction: PipedriveCreateAction | null;
  emailDraftNoteId: string | null;
  emailDraftNoteAction: PipedriveCreateAction | null;
  activityId: string | null;
  activityAction: PipedriveCreateAction | null;
};

export type PipedriveSyncLeadRow = {
  id: string;
  companyId: string;
  fullName: string | null;
  email: string | null;
  companyText: string | null;
  companyDomain: string | null;
  jobTitle: string | null;
  followUpAt: string | null;
  followUpDate: string | null;
};

export type PipedriveConversationInsight = { summary: string | null };
export type PipedriveEmailDraft = { subject: string | null; bodyText: string | null };

export type PipedriveSyncResult = {
  success: boolean;
  personAction: PipedriveMatchAction | null;
  personId: string | null;
  organizationAction: PipedriveMatchAction | null;
  organizationId: string | null;
  destinationKind: "lead" | "deal" | null;
  destinationAction: PipedriveCreateAction | null;
  destinationId: string | null;
  synopsisNoteAction: PipedriveCreateAction | null;
  emailDraftNoteAction: PipedriveCreateAction | null;
  activityAction: PipedriveCreateAction | null;
  error?: string;
};

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

/** `connected_user` omits owner_id so Pipedrive defaults to the API-calling (connected) user. */
export function resolveOwnerId(settings: PipedriveSetupSettings): string | null {
  if (settings.ownerMode === "selected_user") return normalizeText(settings.ownerUserId);
  return null;
}

export function personDisplayName(lead: PipedriveSyncLeadRow): string {
  return normalizeText(lead.fullName) ?? normalizeText(lead.email) ?? "Lead Retrieval Contact";
}

export function organizationDisplayName(lead: PipedriveSyncLeadRow): string | null {
  return normalizeText(lead.companyText) ?? normalizeText(lead.companyDomain);
}

export function destinationTitle(lead: PipedriveSyncLeadRow): string {
  const name = normalizeText(lead.fullName) ?? normalizeText(lead.email) ?? "Lead Retrieval Lead";
  const company = normalizeText(lead.companyText);
  return company ? `${name} – ${company}` : name;
}

export function buildPersonPayload(lead: PipedriveSyncLeadRow, ownerId: string | null, organizationId: string | null) {
  const email = normalizeText(lead.email);
  const payload: Record<string, unknown> = { name: personDisplayName(lead) };
  if (email) payload.emails = [{ value: email, primary: true }];
  if (organizationId) payload.org_id = Number(organizationId);
  if (ownerId) payload.owner_id = Number(ownerId);
  return payload;
}

export function buildOrganizationPayload(lead: PipedriveSyncLeadRow, ownerId: string | null) {
  const payload: Record<string, unknown> = { name: organizationDisplayName(lead) ?? personDisplayName(lead) };
  if (ownerId) payload.owner_id = Number(ownerId);
  return payload;
}

export function buildDealPayload(input: {
  lead: PipedriveSyncLeadRow;
  personId: string | null;
  organizationId: string | null;
  pipelineId: string | null;
  stageId: string | null;
  ownerId: string | null;
}) {
  const payload: Record<string, unknown> = { title: destinationTitle(input.lead) };
  if (input.personId) payload.person_id = Number(input.personId);
  if (input.organizationId) payload.org_id = Number(input.organizationId);
  if (input.pipelineId) payload.pipeline_id = Number(input.pipelineId);
  if (input.stageId) payload.stage_id = Number(input.stageId);
  if (input.ownerId) payload.owner_id = Number(input.ownerId);
  return payload;
}

export function buildLeadPayload(input: {
  lead: PipedriveSyncLeadRow;
  personId: string | null;
  organizationId: string | null;
  ownerId: string | null;
}) {
  const payload: Record<string, unknown> = { title: destinationTitle(input.lead) };
  if (input.personId) payload.person_id = Number(input.personId);
  if (input.organizationId) payload.organization_id = Number(input.organizationId);
  if (input.ownerId) payload.owner_id = Number(input.ownerId);
  return payload;
}

export function buildSynopsisNoteContent(summary: string): string {
  return `Lead Retrieval — Conversation Synopsis\n\n${summary}`;
}

export function buildEmailDraftNoteContent(draft: { subject: string | null; bodyText: string | null }): string {
  const subject = normalizeText(draft.subject) ?? "(no subject)";
  const body = normalizeText(draft.bodyText) ?? "(no body)";
  return `Lead Retrieval — Suggested Follow-up Email Draft\n\nSubject: ${subject}\n\n${body}`;
}

export function resolveFollowUpDueDate(lead: PipedriveSyncLeadRow): string | null {
  const at = normalizeText(lead.followUpAt);
  if (at) {
    const parsed = new Date(at);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return normalizeText(lead.followUpDate);
}

export function activitySubject(lead: PipedriveSyncLeadRow): string {
  return `Follow up with ${personDisplayName(lead)}`;
}

/** Pipedrive's default, always-present built-in activity type key for a generic follow-up reminder. */
export const PIPEDRIVE_FOLLOW_UP_ACTIVITY_TYPE = "task";

export function buildActivityPayload(input: {
  lead: PipedriveSyncLeadRow;
  dueDate: string;
  personId: string | null;
  destinationKind: "lead" | "deal";
  destinationId: string;
  ownerId: string | null;
}) {
  const payload: Record<string, unknown> = {
    subject: activitySubject(input.lead),
    // Required by Pipedrive's POST /activities — omitting it is rejected outright.
    type: PIPEDRIVE_FOLLOW_UP_ACTIVITY_TYPE,
    due_date: input.dueDate
  };
  if (input.personId) payload.person_id = Number(input.personId);
  if (input.destinationKind === "deal") payload.deal_id = Number(input.destinationId);
  else payload.lead_id = input.destinationId;
  if (input.ownerId) payload.owner_id = Number(input.ownerId);
  return payload;
}

export function buildNotePayload(input: {
  content: string;
  destinationKind: "lead" | "deal";
  destinationId: string;
  personId: string | null;
  organizationId: string | null;
}) {
  const payload: Record<string, unknown> = { content: input.content };
  if (input.destinationKind === "deal") payload.deal_id = Number(input.destinationId);
  else payload.lead_id = input.destinationId;
  if (input.personId) payload.person_id = Number(input.personId);
  if (input.organizationId) payload.org_id = Number(input.organizationId);
  return payload;
}

/** Capped exponential backoff in minutes: 1, 2, 4, 8, 16 (attempts is 1-indexed after increment). */
export function computeNextAttemptDelayMinutes(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts - 1), 30);
}

export function computeNextAttemptAt(attempts: number, now: Date): string | null {
  if (attempts >= MAX_PIPEDRIVE_AUTO_ATTEMPTS) return null;
  const minutes = computeNextAttemptDelayMinutes(attempts);
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function emptyPipedriveSyncResult(): PipedriveSyncResult {
  return {
    success: false,
    personAction: null,
    personId: null,
    organizationAction: null,
    organizationId: null,
    destinationKind: null,
    destinationAction: null,
    destinationId: null,
    synopsisNoteAction: null,
    emailDraftNoteAction: null,
    activityAction: null
  };
}

export function resultFromRow(row: PipedriveLeadSyncRow, success: boolean, error?: string): PipedriveSyncResult {
  return {
    success,
    personAction: row.personAction,
    personId: row.personId,
    organizationAction: row.organizationAction,
    organizationId: row.organizationId,
    destinationKind: row.destinationKind,
    destinationAction: row.destinationAction,
    destinationId: row.destinationId,
    synopsisNoteAction: row.synopsisNoteAction,
    emailDraftNoteAction: row.emailDraftNoteAction,
    activityAction: row.activityAction,
    ...(error ? { error } : {})
  };
}
