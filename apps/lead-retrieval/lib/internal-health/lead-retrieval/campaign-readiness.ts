/**
 * P1 Campaign Readiness health.
 *
 * Answers: "Can captured leads be used for follow-up/campaigns?"
 *
 * Read-only and aggregate-only. Email subject/body content is never selected into memory —
 * "missing generated content" is detected with server-side `is null` filters. IDs are used
 * only for recipient↔message set membership and are never emitted.
 *
 * P1: critical is reserved for broadly-blocked readiness (draft generation failing with no
 * successes, or many messages missing required content). Approval backlog is human-in-the-loop
 * and only warns.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  ageMinutes,
  buildHealthResponse,
  loadAllHealthRows,
  minIso,
  minutesBeforeIso,
  normalizeId,
  normalizeText,
  type LeadRetrievalHealthResponse,
  type ProductHealthIssue,
} from "@/lib/internal-health/shared";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const CAMPAIGN_READINESS_SOURCE = "campaign-readiness";

export const RECENT_WINDOW_MINUTES = 60;
export const APPROVAL_STALE_MINUTES = 24 * 60;
export const CRITICAL_DRAFT_FAILURE_COUNT = 5;
export const CRITICAL_MISSING_CONTENT_COUNT = 5;

const DRAFT_ERROR_PREFIX = "compose_draft_";
/** Provider/config-class draft failures that imply systemic generation breakage. */
const PROVIDER_DRAFT_ERROR_CODES = new Set(["compose_draft_no_provider", "compose_draft_transient"]);

type FailedStepRow = { error_code: string | null; completed_at: string | null };
type DraftRow = { approval_status: string | null; created_at: string | null };
type CreatedAtRow = { created_at: string | null };
type CampaignRow = { id: string | null; status: string | null };
type RecipientRow = { id: string | null; campaign_id: string | null };
type MessageRecipientRow = { recipient_id: string | null };

export async function getLeadRetrievalCampaignReadinessHealth(input: {
  supabase: SupabaseAdmin;
  nowIso?: string;
}): Promise<LeadRetrievalHealthResponse> {
  const checkedAt = input.nowIso ?? new Date().toISOString();
  const recentCutoff = minutesBeforeIso(checkedAt, RECENT_WINDOW_MINUTES);
  const approvalStaleCutoff = minutesBeforeIso(checkedAt, APPROVAL_STALE_MINUTES);

  const [
    recentFailedSteps,
    pendingDrafts,
    recentDrafts,
    campaigns,
    recipients,
    messageRecipients,
    draftMessagesMissingBody,
    recentFailedMessages,
  ] = await Promise.all([
    // Failed workflow steps in the window; compose-draft failures filtered in memory (no `like`).
    loadAllHealthRows<FailedStepRow>({
      supabase: input.supabase,
      table: "workflow_step_runs",
      select: "error_code, completed_at",
      configure: (query) => query.eq("status", "failed").gte("completed_at", recentCutoff),
      errorMessage: "Failed to load draft generation failure source.",
    }),
    loadAllHealthRows<DraftRow>({
      supabase: input.supabase,
      table: "generated_drafts",
      select: "approval_status, created_at",
      configure: (query) => query.eq("approval_status", "pending"),
      errorMessage: "Failed to load pending draft source.",
    }),
    loadAllHealthRows<CreatedAtRow>({
      supabase: input.supabase,
      table: "generated_drafts",
      select: "created_at",
      configure: (query) => query.gte("created_at", recentCutoff),
      errorMessage: "Failed to load recent draft generation source.",
    }),
    loadAllHealthRows<CampaignRow>({
      supabase: input.supabase,
      table: "campaigns",
      select: "id, status",
      errorMessage: "Failed to load campaign status source.",
    }),
    loadAllHealthRows<RecipientRow>({
      supabase: input.supabase,
      table: "campaign_recipients",
      select: "id, campaign_id",
      errorMessage: "Failed to load campaign recipient source.",
    }),
    loadAllHealthRows<MessageRecipientRow>({
      supabase: input.supabase,
      table: "campaign_messages",
      select: "recipient_id",
      errorMessage: "Failed to load campaign message recipient source.",
    }),
    // Draft messages missing their generated body — detected without reading body content.
    loadAllHealthRows<CreatedAtRow>({
      supabase: input.supabase,
      table: "campaign_messages",
      select: "created_at",
      configure: (query) => query.eq("status", "draft").is("body_text", null),
      errorMessage: "Failed to load incomplete campaign message source.",
    }),
    loadAllHealthRows<CreatedAtRow>({
      supabase: input.supabase,
      table: "campaign_messages",
      select: "created_at",
      configure: (query) => query.eq("status", "failed").gte("created_at", recentCutoff),
      errorMessage: "Failed to load failed campaign message source.",
    }),
  ]);

  let draftGenerationFailuresLast60m = 0;
  let providerDraftFailuresLast60m = 0;
  for (const row of recentFailedSteps) {
    const code = normalizeText(row.error_code);
    if (!code.startsWith(DRAFT_ERROR_PREFIX)) continue;
    draftGenerationFailuresLast60m += 1;
    if (PROVIDER_DRAFT_ERROR_CODES.has(code)) providerDraftFailuresLast60m += 1;
  }

  const generatedDraftsCreatedLast60m = recentDrafts.length;
  const pendingApprovalDrafts = pendingDrafts.length;
  let staleApprovalDrafts = 0;
  for (const row of pendingDrafts) {
    if (isAtOrBeforeCutoff(row.created_at, approvalStaleCutoff)) staleApprovalDrafts += 1;
  }
  const oldestPendingDraftAt = minIso(pendingDrafts.map((row) => row.created_at));

  const referencedRecipientIds = new Set<string>();
  for (const row of messageRecipients) {
    const id = normalizeId(row.recipient_id);
    if (id) referencedRecipientIds.add(id);
  }
  const campaignStatusById = new Map<string, string>();
  for (const row of campaigns) {
    const id = normalizeId(row.id);
    if (id) campaignStatusById.set(id, normalizeText(row.status));
  }
  let recipientsWithoutMessage = 0;
  for (const row of recipients) {
    const id = normalizeId(row.id);
    const campaignId = normalizeId(row.campaign_id);
    const campaignStatus = campaignId ? campaignStatusById.get(campaignId) : null;
    if (campaignStatus === "draft") continue;
    if (id && !referencedRecipientIds.has(id)) recipientsWithoutMessage += 1;
  }

  const messagesMissingContent = draftMessagesMissingBody.length;
  const failedMessagesLast60m = recentFailedMessages.length;

  const issues: ProductHealthIssue[] = [];

  // Critical only when generation is broadly failing with nothing succeeding (per plan).
  if (draftGenerationFailuresLast60m > 0) {
    const broadlyBlocked =
      draftGenerationFailuresLast60m >= CRITICAL_DRAFT_FAILURE_COUNT && generatedDraftsCreatedLast60m === 0;
    issues.push({
      code: "campaign_draft_generation_failures",
      severity: broadlyBlocked ? "critical" : "warning",
      message: broadlyBlocked
        ? "Campaign draft generation is failing broadly with no recent successful drafts."
        : "Some campaign draft generations failed recently.",
      count: draftGenerationFailuresLast60m,
      threshold: CRITICAL_DRAFT_FAILURE_COUNT,
    });
  }

  if (messagesMissingContent > 0) {
    const critical = messagesMissingContent >= CRITICAL_MISSING_CONTENT_COUNT;
    issues.push({
      code: "campaign_messages_missing_content",
      severity: critical ? "critical" : "warning",
      message: critical
        ? "Many draft campaign messages are missing their generated content and cannot be sent."
        : "Some draft campaign messages are missing their generated content.",
      count: messagesMissingContent,
      threshold: CRITICAL_MISSING_CONTENT_COUNT,
    });
  }

  if (failedMessagesLast60m > 0) {
    issues.push({
      code: "campaign_messages_failed_recent",
      severity: "warning",
      message: "Some campaign messages failed in the recent window.",
      count: failedMessagesLast60m,
    });
  }

  if (staleApprovalDrafts > 0) {
    issues.push({
      code: "campaign_drafts_pending_approval_stale",
      severity: "warning",
      message: "Some generated drafts have been pending approval for an extended period.",
      count: staleApprovalDrafts,
      oldestAgeMinutes: roundOrZero(ageMinutes(oldestPendingDraftAt, checkedAt)),
    });
  }

  if (recipientsWithoutMessage > 0) {
    issues.push({
      code: "campaign_recipients_without_message",
      severity: "warning",
      message: "Some campaign recipients have no generated message (lead-to-campaign handoff gap).",
      count: recipientsWithoutMessage,
    });
  }

  const metrics: LeadRetrievalHealthResponse["metrics"] = {
    draftGenerationFailuresLast60m,
    providerDraftFailuresLast60m,
    generatedDraftsCreatedLast60m,
    pendingApprovalDrafts,
    staleApprovalDrafts,
    oldestPendingDraftAgeMinutes: roundOrNull(ageMinutes(oldestPendingDraftAt, checkedAt)),
    totalCampaignRecipients: recipients.length,
    recipientsWithoutMessage,
    messagesMissingContent,
    failedMessagesLast60m,
  };

  return buildHealthResponse({
    source: CAMPAIGN_READINESS_SOURCE,
    checkedAt,
    summary: buildSummary({ draftGenerationFailuresLast60m, messagesMissingContent, generatedDraftsCreatedLast60m }),
    metrics,
    issues,
    window: { recentMinutes: RECENT_WINDOW_MINUTES, staleAfterMinutes: APPROVAL_STALE_MINUTES },
  });
}

function buildSummary(input: {
  draftGenerationFailuresLast60m: number;
  messagesMissingContent: number;
  generatedDraftsCreatedLast60m: number;
}): string {
  if (input.draftGenerationFailuresLast60m > 0 || input.messagesMissingContent > 0) {
    return `Campaign readiness degraded: ${input.draftGenerationFailuresLast60m} draft failures (last ${RECENT_WINDOW_MINUTES}m), ${input.messagesMissingContent} messages missing content.`;
  }
  return `Campaign readiness healthy: ${input.generatedDraftsCreatedLast60m} drafts generated in the last ${RECENT_WINDOW_MINUTES}m, no blocking failures.`;
}

function isAtOrBeforeCutoff(value: string | null | undefined, cutoffIso: string): boolean {
  const ms = Date.parse(String(value ?? ""));
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString() <= cutoffIso;
}

function roundOrNull(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}

function roundOrZero(value: number | null): number {
  return value == null ? 0 : Math.round(value);
}
