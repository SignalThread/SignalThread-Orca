import type { PipedriveSetupSettings } from "@/lib/integrations/pipedrive/setup-core";
import {
  buildActivityPayload,
  buildDealPayload,
  buildEmailDraftNoteContent,
  buildLeadPayload,
  buildNotePayload,
  buildOrganizationPayload,
  buildPersonPayload,
  buildSynopsisNoteContent,
  computeNextAttemptAt,
  emptyPipedriveSyncResult,
  organizationDisplayName,
  resolveFollowUpDueDate,
  resolveOwnerId,
  resultFromRow,
  type PipedriveConversationInsight,
  type PipedriveCreateAction,
  type PipedriveEmailDraft,
  type PipedriveLeadSyncRow,
  type PipedriveMatchAction,
  type PipedriveSyncLeadRow,
  type PipedriveSyncResult,
  type PipedriveSyncSource
} from "@/lib/integrations/pipedrive/sync-core";

export type PipedriveSyncRowPatch = Partial<{
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
  status: "syncing" | "synced" | "failed";
  lastError: string | null;
  nextAttemptAt: string | null;
  syncedAt: string | null;
}>;

export type PipedriveSyncDeps = {
  loadLead(input: { companyId: string; leadId: string }): Promise<PipedriveSyncLeadRow | null>;
  loadSettings(companyId: string): Promise<PipedriveSetupSettings>;
  /** Upserts the sync row, bumps status='syncing' and attempts += 1, and returns the row (including any ids persisted from a prior attempt). */
  beginSync(input: {
    companyId: string;
    leadId: string;
    source: PipedriveSyncSource;
    requestedByUserId: string | null;
  }): Promise<PipedriveLeadSyncRow>;
  persistRow(rowId: string, patch: PipedriveSyncRowPatch): Promise<void>;
  findPersonByEmail(input: { companyId: string; email: string }): Promise<string | null>;
  createPerson(input: { companyId: string; payload: Record<string, unknown> }): Promise<string>;
  findOrganizationByName(input: { companyId: string; name: string }): Promise<string | null>;
  createOrganization(input: { companyId: string; payload: Record<string, unknown> }): Promise<string>;
  createDeal(input: { companyId: string; payload: Record<string, unknown> }): Promise<string>;
  createPipedriveLead(input: { companyId: string; payload: Record<string, unknown> }): Promise<string>;
  loadConversationInsight(input: {
    companyId: string;
    leadId: string;
  }): Promise<PipedriveConversationInsight | null>;
  loadEmailDraft(input: { companyId: string; leadId: string }): Promise<PipedriveEmailDraft | null>;
  createNote(input: { companyId: string; payload: Record<string, unknown> }): Promise<string>;
  createActivity(input: { companyId: string; payload: Record<string, unknown> }): Promise<string>;
  now(): Date;
};

/**
 * Pure orchestrator for the canonical Pipedrive sync sequence. Every provider
 * write is dependency-injected so this is fully unit-testable without a live
 * Pipedrive account or database. Every step reuses an id already persisted on
 * the row instead of re-creating it, which is what makes retries idempotent.
 * Never throws — all failures are caught and returned as a structured result.
 */
export async function runPipedriveSync(
  deps: PipedriveSyncDeps,
  input: { companyId: string; leadId: string; source: PipedriveSyncSource; requestedByUserId?: string | null }
): Promise<PipedriveSyncResult> {
  const lead = await deps.loadLead({ companyId: input.companyId, leadId: input.leadId });
  if (!lead) {
    return { ...emptyPipedriveSyncResult(), error: "Lead not found for this account." };
  }

  const settings = await deps.loadSettings(input.companyId);
  const ownerId = resolveOwnerId(settings);

  const row = await deps.beginSync({
    companyId: input.companyId,
    leadId: input.leadId,
    source: input.source,
    requestedByUserId: input.requestedByUserId ?? null
  });

  let personId = row.personId;
  let personAction = row.personAction;
  let organizationId = row.organizationId;
  let organizationAction = row.organizationAction;
  let destinationKind = row.destinationKind;
  let destinationId = row.destinationId;
  let destinationAction = row.destinationAction;
  let synopsisNoteAction = row.synopsisNoteAction;
  let emailDraftNoteAction = row.emailDraftNoteAction;
  let activityAction = row.activityAction;

  try {
    // Person
    if (settings.createPerson) {
      if (personId) {
        personAction = "reused";
      } else if (settings.matchPersonByEmail && lead.email) {
        const found = await deps.findPersonByEmail({ companyId: input.companyId, email: lead.email });
        if (found) {
          personId = found;
          personAction = "matched";
        } else {
          personId = await deps.createPerson({
            companyId: input.companyId,
            payload: buildPersonPayload(lead, ownerId, organizationId)
          });
          personAction = "created";
        }
      } else {
        personId = await deps.createPerson({
          companyId: input.companyId,
          payload: buildPersonPayload(lead, ownerId, organizationId)
        });
        personAction = "created";
      }
    } else {
      personId = null;
      personAction = "skipped";
    }
    await deps.persistRow(row.id, { personId, personAction });

    // Organization
    if (settings.createOrganization && organizationDisplayName(lead)) {
      if (organizationId) {
        organizationAction = "reused";
      } else if (settings.matchOrganizationByNameOrDomain) {
        const name = organizationDisplayName(lead) as string;
        const found = await deps.findOrganizationByName({ companyId: input.companyId, name });
        if (found) {
          organizationId = found;
          organizationAction = "matched";
        } else {
          organizationId = await deps.createOrganization({
            companyId: input.companyId,
            payload: buildOrganizationPayload(lead, ownerId)
          });
          organizationAction = "created";
        }
      } else {
        organizationId = await deps.createOrganization({
          companyId: input.companyId,
          payload: buildOrganizationPayload(lead, ownerId)
        });
        organizationAction = "created";
      }
    } else {
      organizationId = null;
      organizationAction = "skipped";
    }
    await deps.persistRow(row.id, { organizationId, organizationAction });

    // Destination: Pipedrive Lead or Deal
    if (destinationId) {
      destinationKind = destinationKind ?? settings.destinationType;
      destinationAction = "reused";
    } else {
      destinationKind = settings.destinationType;
      if (destinationKind === "deal") {
        destinationId = await deps.createDeal({
          companyId: input.companyId,
          payload: buildDealPayload({
            lead,
            personId,
            organizationId,
            pipelineId: settings.pipelineId,
            stageId: settings.stageId,
            ownerId
          })
        });
      } else {
        destinationId = await deps.createPipedriveLead({
          companyId: input.companyId,
          payload: buildLeadPayload({ lead, personId, organizationId, ownerId })
        });
      }
      destinationAction = "created";
    }
    await deps.persistRow(row.id, { destinationKind, destinationId, destinationAction });

    const destKind = destinationKind as "lead" | "deal";
    const destId = destinationId as string;

    // Conversation synopsis note
    let synopsisNoteId = row.synopsisNoteId;
    if (settings.sendConversationSynopsis) {
      if (synopsisNoteId) {
        synopsisNoteAction = "reused";
      } else {
        const insight = await deps.loadConversationInsight({ companyId: input.companyId, leadId: input.leadId });
        const summary = insight?.summary?.trim();
        if (summary) {
          synopsisNoteId = await deps.createNote({
            companyId: input.companyId,
            payload: buildNotePayload({
              content: buildSynopsisNoteContent(summary),
              destinationKind: destKind,
              destinationId: destId,
              personId,
              organizationId
            })
          });
          synopsisNoteAction = "created";
        } else {
          synopsisNoteAction = "skipped";
        }
      }
    } else {
      synopsisNoteAction = "skipped";
    }
    await deps.persistRow(row.id, { synopsisNoteId, synopsisNoteAction });

    // Generated email draft note (never the email itself)
    let emailDraftNoteId = row.emailDraftNoteId;
    if (settings.sendGeneratedEmailDraft) {
      if (emailDraftNoteId) {
        emailDraftNoteAction = "reused";
      } else {
        const draft = await deps.loadEmailDraft({ companyId: input.companyId, leadId: input.leadId });
        if (draft && (draft.subject?.trim() || draft.bodyText?.trim())) {
          emailDraftNoteId = await deps.createNote({
            companyId: input.companyId,
            payload: buildNotePayload({
              content: buildEmailDraftNoteContent(draft),
              destinationKind: destKind,
              destinationId: destId,
              personId,
              organizationId
            })
          });
          emailDraftNoteAction = "created";
        } else {
          emailDraftNoteAction = "skipped";
        }
      }
    } else {
      emailDraftNoteAction = "skipped";
    }
    await deps.persistRow(row.id, { emailDraftNoteId, emailDraftNoteAction });

    // Follow-up activity
    let activityId = row.activityId;
    if (settings.createFollowUpActivity) {
      if (activityId) {
        activityAction = "reused";
      } else {
        const dueDate = resolveFollowUpDueDate(lead);
        if (dueDate) {
          activityId = await deps.createActivity({
            companyId: input.companyId,
            payload: buildActivityPayload({
              lead,
              dueDate,
              personId,
              destinationKind: destKind,
              destinationId: destId,
              ownerId
            })
          });
          activityAction = "created";
        } else {
          activityAction = "skipped";
        }
      }
    } else {
      activityAction = "skipped";
    }
    await deps.persistRow(row.id, { activityId, activityAction });

    const now = deps.now();
    await deps.persistRow(row.id, {
      status: "synced",
      lastError: null,
      nextAttemptAt: null,
      syncedAt: now.toISOString()
    });

    return resultFromRow(
      {
        ...row,
        personId,
        personAction,
        organizationId,
        organizationAction,
        destinationKind,
        destinationId,
        destinationAction,
        synopsisNoteId,
        synopsisNoteAction,
        emailDraftNoteId,
        emailDraftNoteAction,
        activityId,
        activityAction
      },
      true
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipedrive sync failed.";
    const now = deps.now();
    const nextAttemptAt = computeNextAttemptAt(row.attempts, now);
    await deps.persistRow(row.id, { status: "failed", lastError: message, nextAttemptAt });
    return resultFromRow(
      {
        ...row,
        personId,
        personAction,
        organizationId,
        organizationAction,
        destinationKind,
        destinationId,
        destinationAction,
        synopsisNoteAction,
        emailDraftNoteAction,
        activityAction
      },
      false,
      message
    );
  }
}
