import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, TablesInsert } from "@/types/database";
import type { BatchBriefingMatchedLead } from "@/lib/import-wizard/build-briefing-detail-from-batch-row";
import { buildBriefingDetailFromBatchRow } from "@/lib/import-wizard/build-briefing-detail-from-batch-row";
import type { BriefingDetailView, BriefingQueueItemView, BriefingApprovalStatus } from "@/lib/import-wizard/briefing-detail-model";
import type { BriefingPolishedBundle, BriefingPolishedStrategicGap } from "@/lib/import-wizard/briefing-polished-types";
import {
  hasManualContextInStored,
  parseBriefingContent,
  type BriefingStoredContent,
  type ImportBriefingManualContextV1,
} from "@/lib/import-wizard/briefing-content-json";
import {
  deriveBriefingBlocksFromMappedRow,
  mergeBriefingBlocksIntoContent,
  shouldRefreshBriefingBlocks,
} from "@/lib/import-wizard/briefing-blocks-derive";
import { computeBriefingSourceFingerprint } from "@/lib/import-wizard/briefing-source-fingerprint";
import {
  canonicalValueForRow,
  isLeadImportEmailFormatValid,
  rowHasUsableIdentityPath,
} from "@/lib/import-wizard/import-batch-validation-derive";
import { toLeadBriefingApprovalStatus } from "@/lib/server/briefings/lead-briefings";
import { getFieldMappingStateForBatchWithAdmin } from "@/lib/server/import-wizard/field-mapping-state";
import { getBatchByIdForCompany } from "@/lib/server/import-wizard/import-batch-service";
import { deriveImportedLeadDisplayName } from "@/lib/server/import-wizard/publish-leads-materialization";
import { loadBatchBriefingContext } from "@/lib/server/import-wizard/batch-briefing-context-service";
import {
  composeStrategicQuestions,
  composeStrategicTalkingPoints,
  composeWhyTheyMatterHere,
  deriveCompetitorContext,
  deriveStrategicGaps,
  deriveSignalsToWatch,
} from "@/lib/import-wizard/briefing-enrich-from-context";

type BriefingDataSupabaseClient = ReturnType<typeof createAdminClient>;

function maxQueueSize(): number {
  const n = Number(process.env.IMPORT_WIZARD_BRIEFING_QUEUE_MAX ?? 50);
  return Number.isFinite(n) && n > 0 ? Math.min(200, Math.floor(n)) : 50;
}

/** PostgREST `in` query size — stay under URL limits for large imports. */
const BRIEFING_ROW_ID_IN_CHUNK = 200;

/**
 * Count briefing rows that are not approved, scoped to current import_batch_rows only.
 * A batch-global `.neq(approved)` count can include orphan briefing rows (no matching row),
 * which makes `allApproved` false forever after approve-all even when every real row is approved.
 */
async function countNonApprovedBriefingsForImportRowIds(
  supabase: ReturnType<typeof createAdminClient>,
  batchId: string,
  importRowIds: string[]
): Promise<number> {
  if (importRowIds.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < importRowIds.length; i += BRIEFING_ROW_ID_IN_CHUNK) {
    const chunk = importRowIds.slice(i, i + BRIEFING_ROW_ID_IN_CHUNK);
    const { count, error } = await supabase
      .from("import_batch_row_briefings")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", batchId)
      .in("batch_row_id", chunk)
      .neq("approval_status", "approved");
    if (error) throw new Error(error.message);
    sum += count ?? 0;
  }
  return sum;
}

export type BatchBriefingReviewProgress = {
  totalRowsInBatch: number;
  allApproved: boolean;
  /** Briefings tied to current import rows with status approved. */
  approvedRowCount: number;
};

export async function getBatchBriefingReviewProgress(
  batchId: string,
  companyId: string
): Promise<BatchBriefingReviewProgress> {
  await assertBatchBriefingReviewable(batchId, companyId);
  const supabase = createAdminClient();
  const { count: totalRows, error: cErr } = await supabase
    .from("import_batch_rows")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", batchId);
  if (cErr) throw new Error(cErr.message);
  const total = totalRows ?? 0;
  if (total === 0) {
    return { totalRowsInBatch: 0, allApproved: false, approvedRowCount: 0 };
  }
  await ensureBriefingRowsForBatch(supabase, batchId);
  const { data: allIdRows, error: aidErr } = await supabase.from("import_batch_rows").select("id").eq("batch_id", batchId);
  if (aidErr) throw new Error(aidErr.message);
  const allIds = (allIdRows ?? []).map((r: { id: string }) => r.id);
  const notApproved = await countNonApprovedBriefingsForImportRowIds(supabase, batchId, allIds);
  return {
    totalRowsInBatch: total,
    allApproved: notApproved === 0,
    approvedRowCount: total - notApproved,
  };
}

function parseCellsJson(raw: Json): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => (typeof c === "string" ? c : ""));
}

function normalizeApprovalStatus(raw: string): BriefingApprovalStatus {
  if (raw === "approved") return "approved";
  if (raw === "needs_review") return "needs_review";
  if (raw === "failed") return "failed";
  return "pending";
}

function cleanText(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function cleanTextArray(values: unknown, maxItems: number): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function cleanTalkingPoints(values: unknown): { title: string; detail: string }[] {
  if (!Array.isArray(values)) return [];
  const out: { title: string; detail: string }[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const title = cleanText(row.title, 160);
    const detail = cleanText(row.detail);
    if (!title || !detail) continue;
    out.push({ title, detail });
    if (out.length >= 8) break;
  }
  return out;
}

function cleanGaps(values: unknown): BriefingPolishedStrategicGap[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out: BriefingPolishedStrategicGap[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const gap = cleanText(row.gap, 300);
    const whyItMatters = cleanText(row.whyItMatters, 700);
    const probe = cleanText(row.probe, 500);
    if (!gap || !whyItMatters || !probe) continue;
    out.push({ gap, whyItMatters, probe });
    if (out.length >= 8) break;
  }
  return out.length > 0 ? out : undefined;
}

function sanitizePolishedBundle(raw: BriefingPolishedBundle): BriefingPolishedBundle {
  return {
    headline: cleanText(raw.headline, 300) ?? undefined,
    personaFitLine:
      raw.personaFitLine === null ? null : cleanText(raw.personaFitLine, 500) ?? undefined,
    teamContextLine:
      raw.teamContextLine === null ? null : cleanText(raw.teamContextLine, 700) ?? undefined,
    whyHere: cleanTextArray(raw.whyHere, 8),
    talkingPoints: cleanTalkingPoints(raw.talkingPoints),
    questions: cleanTextArray(raw.questions, 8),
    competitorLines: cleanTextArray(raw.competitorLines, 8),
    signals: cleanTextArray(raw.signals, 8),
    gaps: cleanGaps(raw.gaps),
  };
}

function finalContentFromDetail(
  parsed: BriefingStoredContent,
  detail: BriefingDetailView,
  batchContext: Awaited<ReturnType<typeof loadBatchBriefingContext>>
): BriefingStoredContent {
  const polished = parsed.polished;
  const competitorLines = polished?.competitorLines?.length
    ? polished.competitorLines
    : deriveCompetitorContext(detail, batchContext);
  return {
    ...parsed,
    headline: polished?.headline ?? parsed.headline,
    whyHere: polished?.whyHere?.length ? polished.whyHere : composeWhyTheyMatterHere(detail, batchContext),
    talkingPoints:
      polished?.talkingPoints?.length ? polished.talkingPoints : composeStrategicTalkingPoints(detail, batchContext),
    questionsToAsk: polished?.questions?.length ? polished.questions : composeStrategicQuestions(detail, batchContext),
    competitorContext: competitorLines.join("\n\n").trim(),
    signalsToWatch: polished?.signals?.length ? polished.signals : deriveSignalsToWatch(detail, batchContext),
    gaps: polished?.gaps?.length ? polished.gaps : deriveStrategicGaps(detail, batchContext),
    polished,
  };
}

function nonEmpty(s: string): string | null {
  const t = s.trim();
  return t.length > 0 ? t : null;
}

type RpcLeadMatchRow = {
  id: string;
  email: string | null;
  full_name?: string | null;
  created_at?: string | null;
  enriched_job_title: string | null;
  enriched_company_size: string | null;
  enriched_industry: string | null;
  enriched_linkedin_url: string | null;
  enriched_company_domain: string | null;
  enriched_seniority: string | null;
};

/**
 * Resolves at most one catalog lead for this batch row: same `company_id` as the batch and
 * `lower(trim(leads.email)) = lower(trim(mapped email))`. Multiple rows → no match (ambiguous).
 */
async function fetchMatchedLeadForBatchBriefing(
  supabase: BriefingDataSupabaseClient,
  companyId: string,
  emailFromMappedRow: string
): Promise<BatchBriefingMatchedLead | null> {
  const raw = emailFromMappedRow.trim();
  if (!isLeadImportEmailFormatValid(raw)) return null;

  const { data, error } = await (supabase as unknown as {
    rpc: (
      n: string,
      args: { p_company_id: string; p_email: string }
    ) => Promise<{ data: RpcLeadMatchRow[] | null; error: { message?: string } | null }>;
  }).rpc("match_leads_by_company_normalized_email", { p_company_id: companyId, p_email: raw });

  if (error) {
    const msg = error.message ?? "";
    if (/does not exist|schema cache|match_leads_by_company_normalized_email/i.test(msg)) {
      console.warn("[fetchMatchedLeadForBatchBriefing] RPC unavailable; apply migration 0043.", msg);
      return null;
    }
    throw new Error(msg);
  }

  const rows = (data ?? []) as RpcLeadMatchRow[];
  if (rows.length !== 1) return null;

  const r = rows[0]!;
  return {
    leadId: r.id,
    enriched_job_title: r.enriched_job_title,
    enriched_company_size: r.enriched_company_size,
    enriched_industry: r.enriched_industry,
    enriched_linkedin_url: r.enriched_linkedin_url,
    enriched_company_domain: r.enriched_company_domain,
    enriched_seniority: r.enriched_seniority,
  };
}

function normalizeEmailForSync(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeNameForSync(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getPublishedLeadLinkageId(content: BriefingStoredContent): string | null {
  const raw = String(content.linkage?.published_lead_id ?? "").trim();
  return raw.length > 0 ? raw : null;
}

type LeadSyncResolution = {
  leadId: string | null;
  reason:
    | "linked_published_lead_id"
    | "invalid_published_lead_linkage"
    | "exact_email_full_name"
    | "exact_email_full_name_newest"
    | "email_only_newest_no_name_conflict"
    | "email_single_candidate_no_mapped_full_name"
    | "derived_display_name_match"
    | "missing_or_invalid_email"
    | "missing_or_invalid_name"
    | "email_name_conflict_no_email_only_fallback"
    | "email_match_none";
  usedLegacyFallback: boolean;
  diagnostics: {
    linkageReason: "valid_linkage" | "missing_linkage" | "invalid_linkage";
    rowEmailRaw: string;
    rowEmailNormalized: string;
    rowFullNameRaw: string;
    rowFullNameNormalized: string;
    emailCandidateCount: number;
    emailCandidateLeads: Array<{ id: string; email: string | null; full_name?: string | null; created_at?: string | null }>;
    exactNameMatchCount: number;
    exactNameMatchLeadIds: string[];
    conflictingNameCount: number;
    conflictingNames: string[];
    linkedLeadId?: string | null;
  };
};

export type ApprovedBriefingSyncResult = {
  batchId: string;
  batchRowId: string;
  briefingRowId: string | null;
  companyId: string;
  published_lead_id: string | null;
  resolvedLeadId: string | null;
  syncAttempted: boolean;
  syncSucceeded: boolean;
  leadBriefingWritten: boolean;
  failureReason: string | null;
  resolutionReason?: LeadSyncResolution["reason"];
};

export type ApproveBatchBriefingRowResult = {
  approvalUpdated: boolean;
  syncAttempted: boolean;
  syncSucceeded: boolean;
  resolvedLeadId: string | null;
  leadBriefingWritten: boolean;
  failureReason: string | null;
  sync: ApprovedBriefingSyncResult;
  /**
   * False when approval was persisted but `lead_briefings` was not written (or sync was not attempted).
   * Callers must not treat HTTP 200 alone as full success when this is false.
   */
  ok: boolean;
};

export type ApproveAllBatchBriefingRowsResult = {
  approvalRowsUpdated: number;
  syncResults: ApprovedBriefingSyncResult[];
  syncSucceededCount: number;
  syncFailedCount: number;
  ok: boolean;
};

function logApprovedBriefingSyncStructured(payload: Record<string, unknown>): void {
  console.warn(JSON.stringify({ event: "approve_briefing_lead_sync", ...payload }));
}

async function resolveLeadIdForApprovedBriefingSync(params: {
  supabase: BriefingDataSupabaseClient;
  companyId: string;
  rowPadded: string[];
  selections: Record<string, string>;
  linkedLeadId: string | null | undefined;
}): Promise<LeadSyncResolution> {
  const { supabase, companyId, rowPadded, selections, linkedLeadId } = params;
  const rowEmailRaw = canonicalValueForRow(rowPadded, selections, "email");
  const rowEmailNormalized = normalizeEmailForSync(rowEmailRaw);
  const rowFullNameRaw = canonicalValueForRow(rowPadded, selections, "full_name");
  const rowFullNameNormalized = normalizeNameForSync(rowFullNameRaw);

  if (linkedLeadId) {
    const { data: linkedLeadRaw, error: linkedLeadErr } = await supabase
      .from("leads")
      .select("id")
      .eq("id", linkedLeadId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (linkedLeadErr) throw new Error(linkedLeadErr.message);
    const linkedLead = linkedLeadRaw as { id: string } | null;
    if (linkedLead?.id) {
      return {
        leadId: linkedLead.id,
        reason: "linked_published_lead_id",
        usedLegacyFallback: false,
        diagnostics: {
          linkageReason: "valid_linkage",
          rowEmailRaw,
          rowEmailNormalized,
          rowFullNameRaw,
          rowFullNameNormalized,
          emailCandidateCount: 0,
          emailCandidateLeads: [],
          exactNameMatchCount: 0,
          exactNameMatchLeadIds: [],
          conflictingNameCount: 0,
          conflictingNames: [],
          linkedLeadId,
        },
      };
    }
    /** `content.linkage.published_lead_id` is authoritative when present — never email-guess over a bad linkage. */
    return {
      leadId: null,
      reason: "invalid_published_lead_linkage",
      usedLegacyFallback: false,
      diagnostics: {
        linkageReason: "invalid_linkage",
        rowEmailRaw,
        rowEmailNormalized,
        rowFullNameRaw,
        rowFullNameNormalized,
        emailCandidateCount: 0,
        emailCandidateLeads: [],
        exactNameMatchCount: 0,
        exactNameMatchLeadIds: [],
        conflictingNameCount: 0,
        conflictingNames: [],
        linkedLeadId,
      },
    };
  }

  const linkageReason: "missing_linkage" = "missing_linkage";

  if (!isLeadImportEmailFormatValid(rowEmailRaw)) {
    return {
      leadId: null,
      reason: "missing_or_invalid_email",
      usedLegacyFallback: true,
      diagnostics: {
        linkageReason,
        rowEmailRaw,
        rowEmailNormalized,
        rowFullNameRaw,
        rowFullNameNormalized,
        emailCandidateCount: 0,
        emailCandidateLeads: [],
        exactNameMatchCount: 0,
        exactNameMatchLeadIds: [],
        conflictingNameCount: 0,
        conflictingNames: [],
        linkedLeadId,
      },
    };
  }

  const trimmedRowEmail = rowEmailRaw.trim();
  const { data: emailCandidatesRaw, error: emailErr } = await supabase
    .from("leads")
    .select("id, email, full_name, created_at")
    .eq("company_id", companyId)
    .ilike("email", trimmedRowEmail)
    .order("created_at", { ascending: false })
    .limit(50);
  if (emailErr) throw new Error(emailErr.message);

  const emailCandidates = ((emailCandidatesRaw ?? []) as Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    created_at: string | null;
  }>).filter((lead) => normalizeEmailForSync(lead.email) === rowEmailNormalized);

  const exactNameMatches = rowFullNameNormalized
    ? emailCandidates.filter((lead) => normalizeNameForSync(lead.full_name) === rowFullNameNormalized)
    : [];

  const conflictingNames = Array.from(
    new Set(
      emailCandidates
        .map((lead) => normalizeNameForSync(lead.full_name))
        .filter((name) => name.length > 0)
    )
  );

  const candidateDiagnostics = {
    linkageReason,
    rowEmailRaw,
    rowEmailNormalized,
    rowFullNameRaw,
    rowFullNameNormalized,
    emailCandidateCount: emailCandidates.length,
    emailCandidateLeads: emailCandidates.map((lead) => ({
      id: lead.id,
      email: lead.email,
      full_name: lead.full_name ?? null,
      created_at: lead.created_at ?? null,
    })),
    exactNameMatchCount: exactNameMatches.length,
    exactNameMatchLeadIds: exactNameMatches.map((lead) => lead.id),
    conflictingNameCount: conflictingNames.length,
    conflictingNames,
    linkedLeadId,
  };

  if (exactNameMatches.length > 0) {
    const chosen = exactNameMatches[0]!;
    return {
      leadId: chosen.id,
      reason: exactNameMatches.length > 1 ? "exact_email_full_name_newest" : "exact_email_full_name",
      usedLegacyFallback: true,
      diagnostics: candidateDiagnostics,
    };
  }

  /**
   * Materialization uses {@link deriveImportedLeadDisplayName} when canonical full_name is empty (e.g. email local part).
   * Previously we returned here before querying leads, so post-approval sync never wrote `lead_briefings` even though
   * `content.linkage.published_lead_id` might also be missing if briefing rows were created after publish.
   */
  if (!rowFullNameNormalized) {
    if (emailCandidates.length === 1) {
      const chosen = emailCandidates[0]!;
      return {
        leadId: chosen.id,
        reason: "email_single_candidate_no_mapped_full_name",
        usedLegacyFallback: true,
        diagnostics: candidateDiagnostics,
      };
    }
    const derivedNorm = normalizeNameForSync(deriveImportedLeadDisplayName(rowPadded, selections));
    if (derivedNorm) {
      const derivedMatches = emailCandidates.filter(
        (lead) => normalizeNameForSync(lead.full_name) === derivedNorm
      );
      if (derivedMatches.length === 1) {
        return {
          leadId: derivedMatches[0]!.id,
          reason: "derived_display_name_match",
          usedLegacyFallback: true,
          diagnostics: {
            ...candidateDiagnostics,
            exactNameMatchCount: 1,
            exactNameMatchLeadIds: [derivedMatches[0]!.id],
          },
        };
      }
    }
    if (emailCandidates.length === 0) {
      return {
        leadId: null,
        reason: "email_match_none",
        usedLegacyFallback: true,
        diagnostics: candidateDiagnostics,
      };
    }
    return {
      leadId: null,
      reason: "missing_or_invalid_name",
      usedLegacyFallback: true,
      diagnostics: candidateDiagnostics,
    };
  }

  if (conflictingNames.length <= 1 && emailCandidates.length > 0) {
    const chosen = emailCandidates[0]!;
    return {
      leadId: chosen.id,
      reason: "email_only_newest_no_name_conflict",
      usedLegacyFallback: true,
      diagnostics: candidateDiagnostics,
    };
  }

  return {
    leadId: null,
    reason: conflictingNames.length > 1 ? "email_name_conflict_no_email_only_fallback" : "email_match_none",
    usedLegacyFallback: true,
    diagnostics: candidateDiagnostics,
  };
}

function queueLabelsForRow(
  cells: string[],
  csvHeaders: string[],
  selections: Record<string, string>,
  rowIndex: number
): { personName: string; title: string | null; company: string | null } {
  const colCount = csvHeaders.length;
  const padded = [...cells];
  while (padded.length < colCount) padded.push("");
  const row = padded.slice(0, colCount);

  const fullName = nonEmpty(canonicalValueForRow(row, selections, "full_name"));
  const email = nonEmpty(canonicalValueForRow(row, selections, "email"));
  const title = nonEmpty(canonicalValueForRow(row, selections, "job_title"));
  const company = nonEmpty(canonicalValueForRow(row, selections, "company_text"));

  return {
    personName: fullName ?? email ?? `Row ${rowIndex + 1}`,
    title: title ?? null,
    company: company ?? null,
  };
}

async function ensureBriefingRowsForBatch(supabase: BriefingDataSupabaseClient, batchId: string) {
  const db = supabase as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
  const { data: rows, error: rErr } = await db.from("import_batch_rows").select("id").eq("batch_id", batchId);
  if (rErr) throw new Error(rErr.message);
  const rowIds = (rows ?? []) as { id: string }[];
  if (rowIds.length === 0) return;

  const { data: existing, error: eErr } = await db
    .from("import_batch_row_briefings")
    .select("batch_row_id")
    .eq("batch_id", batchId);
  if (eErr) throw new Error(eErr.message);

  const have = new Set((existing ?? []).map((e: { batch_row_id: string }) => e.batch_row_id));
  const missing: TablesInsert<"import_batch_row_briefings">[] = rowIds
    .filter((r) => !have.has(r.id))
    .map((r) => ({ batch_id: batchId, batch_row_id: r.id }));

  if (missing.length === 0) return;

  const { error: insErr } = await db.from("import_batch_row_briefings").insert(missing as never);
  if (insErr) throw new Error(insErr.message);
}

async function assertBatchBriefingReviewable(batchId: string, companyId: string): Promise<void> {
  const batch = await getBatchByIdForCompany(batchId, companyId);
  if (!batch) {
    throw new Error("batch_not_found");
  }
  if (batch.status !== "draft" && batch.status !== "published") {
    throw new Error("batch_not_reviewable");
  }
}

export async function syncApprovedBriefingRowToLeadBriefing(params: {
  supabase: BriefingDataSupabaseClient;
  batchId: string;
  companyId: string;
  batchRowId: string;
}): Promise<ApprovedBriefingSyncResult> {
  const { supabase, batchId, companyId, batchRowId } = params;

  const base = (): Pick<
    ApprovedBriefingSyncResult,
    "batchId" | "batchRowId" | "briefingRowId" | "companyId" | "published_lead_id" | "resolvedLeadId"
  > => ({
    batchId,
    batchRowId,
    briefingRowId: null,
    companyId,
    published_lead_id: null,
    resolvedLeadId: null,
  });

  const fm = await getFieldMappingStateForBatchWithAdmin(batchId);
  if (!fm) {
    const reason = "missing_field_mapping_state";
    logApprovedBriefingSyncStructured({
      phase: "early_return",
      ...base(),
      syncAttempted: false,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
    });
    return {
      ...base(),
      syncAttempted: false,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
    };
  }

  const { data: rowRaw, error: rowErr } = await supabase
    .from("import_batch_rows")
    .select("id, row_index, cells")
    .eq("batch_id", batchId)
    .eq("id", batchRowId)
    .maybeSingle();
  if (rowErr) throw new Error(rowErr.message);
  const row = rowRaw as { id: string; row_index: number; cells: Json } | null;
  if (!row) {
    const reason = "import_batch_row_not_found";
    logApprovedBriefingSyncStructured({
      phase: "early_return",
      ...base(),
      syncAttempted: false,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
    });
    return {
      ...base(),
      syncAttempted: false,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
    };
  }

  const { data: briefingRaw, error: briefingErr } = await supabase
    .from("import_batch_row_briefings")
    .select("id, content, approval_status")
    .eq("batch_id", batchId)
    .eq("batch_row_id", batchRowId)
    .maybeSingle();
  if (briefingErr) throw new Error(briefingErr.message);
  const briefing = briefingRaw as { id: string; content: Json; approval_status: string | null } | null;
  if (!briefing) {
    const reason = "import_batch_row_briefing_not_found";
    logApprovedBriefingSyncStructured({
      phase: "early_return",
      ...base(),
      syncAttempted: false,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
    });
    return {
      ...base(),
      syncAttempted: false,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
    };
  }

  const approvalStatus = toLeadBriefingApprovalStatus(briefing.approval_status);
  const parsedBriefingContent = parseBriefingContent(briefing.content);
  const publishedLeadId = getPublishedLeadLinkageId(parsedBriefingContent);

  if (approvalStatus !== "approved") {
    const reason = "briefing_not_approved";
    logApprovedBriefingSyncStructured({
      phase: "early_return",
      ...base(),
      briefingRowId: briefing.id,
      published_lead_id: publishedLeadId,
      syncAttempted: false,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
      approval_status: briefing.approval_status,
    });
    return {
      batchId,
      batchRowId,
      briefingRowId: briefing.id,
      companyId,
      published_lead_id: publishedLeadId,
      resolvedLeadId: null,
      syncAttempted: false,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
    };
  }

  const batchContext = await loadBatchBriefingContext(batchId, companyId);

  const colCount = fm.csv_headers.length;
  const cells = parseCellsJson(row.cells);
  const padded = [...cells];
  while (padded.length < colCount) padded.push("");
  const rowPadded = padded.slice(0, colCount);
  const emailFromRow = canonicalValueForRow(rowPadded, fm.selections, "email");

  const resolvedLead = await resolveLeadIdForApprovedBriefingSync({
    supabase,
    companyId,
    rowPadded,
    selections: fm.selections,
    linkedLeadId: publishedLeadId,
  });

  if (!resolvedLead.leadId) {
    const reason = `lead_unresolved:${resolvedLead.reason}`;
    logApprovedBriefingSyncStructured({
      phase: "early_return",
      batchId,
      batchRowId,
      briefingRowId: briefing.id,
      companyId,
      published_lead_id: publishedLeadId,
      resolvedLeadId: null,
      syncAttempted: true,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
      resolutionReason: resolvedLead.reason,
      diagnostics: resolvedLead.diagnostics,
    });
    return {
      batchId,
      batchRowId,
      briefingRowId: briefing.id,
      companyId,
      published_lead_id: publishedLeadId,
      resolvedLeadId: null,
      syncAttempted: true,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
      resolutionReason: resolvedLead.reason,
    };
  }

  if (resolvedLead.usedLegacyFallback) {
    const candidateIds = resolvedLead.diagnostics.emailCandidateLeads.map((l) => l.id);
    logApprovedBriefingSyncStructured({
      phase: "legacy_email_fallback",
      batchId,
      batchRowId,
      briefingRowId: briefing.id,
      companyId,
      published_lead_id: publishedLeadId,
      resolvedLeadId: resolvedLead.leadId,
      linkageReason: resolvedLead.diagnostics.linkageReason,
      rowEmail: resolvedLead.diagnostics.rowEmailRaw,
      rowFullName: resolvedLead.diagnostics.rowFullNameRaw,
      candidateCount: candidateIds.length,
      candidateIds,
      resolutionReason: resolvedLead.reason,
    });
  }

  const matchedLead = await fetchMatchedLeadForBatchBriefing(supabase, companyId, emailFromRow);
  const detail = buildBriefingDetailFromBatchRow(
    briefing.id,
    row.id,
    row.row_index,
    cells,
    fm.csv_headers,
    fm.selections,
    parsedBriefingContent,
    "approved",
    matchedLead
  );
  const materializedContent = finalContentFromDetail(parsedBriefingContent, detail, batchContext);

  logApprovedBriefingSyncStructured({
    phase: "lead_briefings_upsert_attempt",
    batchId,
    batchRowId,
    briefingRowId: briefing.id,
    companyId,
    published_lead_id: publishedLeadId,
    resolvedLeadId: resolvedLead.leadId,
    syncAttempted: true,
    resolutionReason: resolvedLead.reason,
  });

  const { error: upsertErr } = await supabase
    .from("lead_briefings")
    .upsert(
      {
        lead_id: resolvedLead.leadId,
        company_id: companyId,
        content: materializedContent as unknown as Json,
        approval_status: approvalStatus,
      } as never,
      { onConflict: "lead_id" }
    );
  if (upsertErr) {
    const reason = `lead_briefings_upsert_failed:${upsertErr.message}`;
    logApprovedBriefingSyncStructured({
      phase: "upsert_error",
      batchId,
      batchRowId,
      briefingRowId: briefing.id,
      companyId,
      published_lead_id: publishedLeadId,
      resolvedLeadId: resolvedLead.leadId,
      syncAttempted: true,
      syncSucceeded: false,
      leadBriefingWritten: false,
      failureReason: reason,
      resolutionReason: resolvedLead.reason,
    });
    throw new Error(reason);
  }

  logApprovedBriefingSyncStructured({
    phase: "lead_briefings_upsert_ok",
    batchId,
    batchRowId,
    briefingRowId: briefing.id,
    companyId,
    published_lead_id: publishedLeadId,
    resolvedLeadId: resolvedLead.leadId,
    syncAttempted: true,
    syncSucceeded: true,
    leadBriefingWritten: true,
    failureReason: null,
    resolutionReason: resolvedLead.reason,
  });

  return {
    batchId,
    batchRowId,
    briefingRowId: briefing.id,
    companyId,
    published_lead_id: publishedLeadId,
    resolvedLeadId: resolvedLead.leadId,
    syncAttempted: true,
    syncSucceeded: true,
    leadBriefingWritten: true,
    failureReason: null,
    resolutionReason: resolvedLead.reason,
  };
}

export type BatchBriefingQueueResponse = {
  queue: BriefingQueueItemView[];
  /** Total staged rows in this batch (same as queue length unless capped). */
  totalRowsInBatch: number;
  openValidationIssues: null;
  allApproved: boolean;
};

export async function loadBatchBriefingQueue(batchId: string, companyId: string): Promise<BatchBriefingQueueResponse> {
  await assertBatchBriefingReviewable(batchId, companyId);

  /**
   * Same trust boundary as `loadBatchBriefingContext`: `getBatchByIdForCompany` already proved this batch
   * belongs to `companyId`. User-JWT RLS on `import_batch_rows` / `import_batch_row_briefings` /
   * `import_batch_field_mapping_state` is stricter than `import_batches` (e.g. draft-only writes, mapping
   * select after publish), which produced 403 for `exhibitor_admin` while context returned 200.
   */
  const supabase = createAdminClient();
  const fm = await getFieldMappingStateForBatchWithAdmin(batchId);
  const csvHeaders = fm?.csv_headers ?? [];
  const selections = fm?.selections ?? {};

  const limit = maxQueueSize();
  const { data: rowsRaw, error: rowErr } = await supabase
    .from("import_batch_rows")
    .select("id, row_index, cells")
    .eq("batch_id", batchId)
    .order("row_index", { ascending: true })
    .limit(limit);

  if (rowErr) throw new Error(rowErr.message);
  const rows = (rowsRaw ?? []) as { id: string; row_index: number; cells: Json }[];

  const { count: totalCount, error: cErr } = await supabase
    .from("import_batch_rows")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", batchId);
  if (cErr) throw new Error(cErr.message);

  if (rows.length === 0) {
    return {
      queue: [],
      totalRowsInBatch: totalCount ?? 0,
      openValidationIssues: null,
      allApproved: false,
    };
  }

  await ensureBriefingRowsForBatch(supabase, batchId);

  const { data: allIdRows, error: aidErr } = await supabase.from("import_batch_rows").select("id").eq("batch_id", batchId);
  if (aidErr) throw new Error(aidErr.message);
  const allImportRowIds = (allIdRows ?? []).map((r: { id: string }) => r.id);
  const notApprovedCount = await countNonApprovedBriefingsForImportRowIds(supabase, batchId, allImportRowIds);

  const rowIds = rows.map((r) => r.id);
  const { data: briefRaw, error: bErr } = await supabase
    .from("import_batch_row_briefings")
    .select("id, batch_row_id, approval_status, content")
    .eq("batch_id", batchId)
    .in("batch_row_id", rowIds);

  if (bErr) throw new Error(bErr.message);
  const briefByRow = new Map(
    (briefRaw ?? []).map(
      (b: { batch_row_id: string; id: string; approval_status: string; content: Json }) => [b.batch_row_id, b]
    )
  );

  const queue: BriefingQueueItemView[] = rows.map((r) => {
    const cells = parseCellsJson(r.cells);
    const labels = queueLabelsForRow(cells, csvHeaders, selections, r.row_index);
    const b = briefByRow.get(r.id);
    if (!b?.id) {
      throw new Error(`Briefing row missing for batch row ${r.id}`);
    }
    const stored = parseBriefingContent((b as { content: Json }).content);
    const identityComplete = rowHasUsableIdentityPath(cells, selections);
    const hasManualContext = hasManualContextInStored(stored);
    return {
      briefingRecordId: b.id,
      batchRowId: r.id,
      personName: labels.personName,
      title: labels.title,
      company: labels.company,
      approvalStatus: normalizeApprovalStatus(b.approval_status),
      identityComplete,
      hasManualContext,
    };
  });

  const totalRows = totalCount ?? 0;
  const allApproved = totalRows > 0 && (notApprovedCount ?? 0) === 0;

  return {
    queue,
    totalRowsInBatch: totalRows,
    openValidationIssues: null,
    allApproved,
  };
}

export async function loadBatchBriefingDetail(
  batchId: string,
  companyId: string,
  batchRowId: string
): Promise<BriefingDetailView | null> {
  const batch = await getBatchByIdForCompany(batchId, companyId);
  if (!batch || (batch.status !== "draft" && batch.status !== "published")) return null;

  const supabase = await createSupabaseServerClient();
  const fm = await getFieldMappingStateForBatchWithAdmin(batchId);
  if (!fm) return null;

  const { data: rowRaw, error: rowErr } = await supabase
    .from("import_batch_rows")
    .select("id, row_index, cells")
    .eq("batch_id", batchId)
    .eq("id", batchRowId)
    .maybeSingle();

  if (rowErr) throw new Error(rowErr.message);
  const row = rowRaw as { id: string; row_index: number; cells: Json } | null;
  if (!row) return null;

  const db = supabase as unknown as BriefingDataSupabaseClient;
  await ensureBriefingRowsForBatch(db, batchId);

  const { data: brRaw, error: brErr } = await supabase
    .from("import_batch_row_briefings")
    .select("id, content, approval_status")
    .eq("batch_id", batchId)
    .eq("batch_row_id", batchRowId)
    .maybeSingle();

  if (brErr) throw new Error(brErr.message);
  const br = brRaw as { id: string; content: Json; approval_status: string } | null;
  if (!br) return null;

  const cells = parseCellsJson(row.cells);
  let stored = parseBriefingContent(br.content);
  const fp = computeBriefingSourceFingerprint(cells, fm.csv_headers, fm.selections, fm.custom_field_definitions ?? {});

  /**
   * Step 4: persist derived blocks when cells/mapping changed or first load. Updates `content` only —
   * never `approval_status`, `reviewed_at`, or `reviewed_by` (approval remains valid; reviewers re-check after data changes).
   */
  if (shouldRefreshBriefingBlocks(stored, fp)) {
    const derived = deriveBriefingBlocksFromMappedRow(cells, fm.csv_headers, fm.selections);
    stored = mergeBriefingBlocksIntoContent(stored, derived, fp);
    const { error: upErr } = await supabase
      .from("import_batch_row_briefings")
      .update({ content: stored as unknown as Json } as never)
      .eq("id", br.id)
      .eq("batch_id", batchId);

    if (upErr) throw new Error(upErr.message);
  }

  const colCount = fm.csv_headers.length;
  const padded = [...cells];
  while (padded.length < colCount) padded.push("");
  const rowPadded = padded.slice(0, colCount);
  const emailFromRow = canonicalValueForRow(rowPadded, fm.selections, "email");
  const matchedLead = await fetchMatchedLeadForBatchBriefing(db, companyId, emailFromRow);

  return buildBriefingDetailFromBatchRow(
    br.id,
    row.id,
    row.row_index,
    cells,
    fm.csv_headers,
    fm.selections,
    stored,
    normalizeApprovalStatus(br.approval_status),
    matchedLead
  );
}

export async function approveBatchBriefingRow(
  batchId: string,
  companyId: string,
  batchRowId: string,
  userId: string
): Promise<ApproveBatchBriefingRowResult> {
  await assertBatchBriefingReviewable(batchId, companyId);
  const supabase = createAdminClient();
  await ensureBriefingRowsForBatch(supabase, batchId);

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("import_batch_row_briefings")
    .update({
      approval_status: "approved",
      reviewed_at: now,
      reviewed_by: userId,
    } as never)
    .eq("batch_id", batchId)
    .eq("batch_row_id", batchRowId)
    .select("id");

  if (error) throw new Error(error.message);

  const approvalUpdated = (updated?.length ?? 0) > 0;
  const missingRowSync: ApprovedBriefingSyncResult = {
    batchId,
    batchRowId,
    briefingRowId: null,
    companyId,
    published_lead_id: null,
    resolvedLeadId: null,
    syncAttempted: false,
    syncSucceeded: false,
    leadBriefingWritten: false,
    failureReason: "briefing_row_not_found",
  };

  if (!approvalUpdated) {
    return {
      approvalUpdated: false,
      syncAttempted: false,
      syncSucceeded: false,
      resolvedLeadId: null,
      leadBriefingWritten: false,
      failureReason: missingRowSync.failureReason,
      sync: missingRowSync,
      ok: false,
    };
  }

  const sync = await syncApprovedBriefingRowToLeadBriefing({
    supabase,
    batchId,
    companyId,
    batchRowId,
  });

  const ok = sync.syncSucceeded && sync.leadBriefingWritten;
  return {
    approvalUpdated: true,
    syncAttempted: sync.syncAttempted,
    syncSucceeded: sync.syncSucceeded,
    resolvedLeadId: sync.resolvedLeadId,
    leadBriefingWritten: sync.leadBriefingWritten,
    failureReason: sync.failureReason,
    sync,
    ok,
  };
}

export async function approveAllBatchBriefingRows(
  batchId: string,
  companyId: string,
  userId: string
): Promise<ApproveAllBatchBriefingRowsResult> {
  await assertBatchBriefingReviewable(batchId, companyId);
  const supabase = createAdminClient();
  await ensureBriefingRowsForBatch(supabase, batchId);

  const { data: rows, error: rErr } = await supabase.from("import_batch_rows").select("id").eq("batch_id", batchId);
  if (rErr) throw new Error(rErr.message);
  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) {
    return { approvalRowsUpdated: 0, syncResults: [], syncSucceededCount: 0, syncFailedCount: 0, ok: true };
  }

  const now = new Date().toISOString();
  const { data: updatedRows, error } = await supabase
    .from("import_batch_row_briefings")
    .update({
      approval_status: "approved",
      reviewed_at: now,
      reviewed_by: userId,
    } as never)
    .eq("batch_id", batchId)
    .in("batch_row_id", ids)
    .select("batch_row_id");

  if (error) throw new Error(error.message);

  const approvalRowsUpdated = updatedRows?.length ?? 0;

  const syncResults: ApprovedBriefingSyncResult[] = [];
  for (const id of ids) {
    syncResults.push(
      await syncApprovedBriefingRowToLeadBriefing({
        supabase,
        batchId,
        companyId,
        batchRowId: id,
      })
    );
  }

  const syncSucceededCount = syncResults.filter((s) => s.syncSucceeded).length;
  const syncFailedCount = syncResults.filter((s) => !s.syncSucceeded).length;
  const ok = syncResults.length === 0 || syncResults.every((s) => s.syncSucceeded);

  return {
    approvalRowsUpdated,
    syncResults,
    syncSucceededCount,
    syncFailedCount,
    ok,
  };
}

/**
 * Re-runs {@link syncApprovedBriefingRowToLeadBriefing} for every approved import briefing row in the batch
 * (idempotent upserts). Use after fixing linkage/mapping or when `lead_briefings` drifted.
 */
export async function reconcileApprovedBatchBriefingsToLeadBriefings(
  batchId: string,
  companyId: string
): Promise<{ syncResults: ApprovedBriefingSyncResult[]; progress: BatchBriefingReviewProgress }> {
  await assertBatchBriefingReviewable(batchId, companyId);
  const supabase = createAdminClient();
  await ensureBriefingRowsForBatch(supabase, batchId);

  const { data: approved, error: aErr } = await supabase
    .from("import_batch_row_briefings")
    .select("batch_row_id")
    .eq("batch_id", batchId)
    .eq("approval_status", "approved");

  if (aErr) throw new Error(aErr.message);

  const rowIds = ((approved ?? []) as { batch_row_id: string }[]).map((r) => r.batch_row_id);
  const syncResults: ApprovedBriefingSyncResult[] = [];
  for (const batchRowId of rowIds) {
    syncResults.push(
      await syncApprovedBriefingRowToLeadBriefing({
        supabase,
        batchId,
        companyId,
        batchRowId,
      })
    );
  }

  const progress = await getBatchBriefingReviewProgress(batchId, companyId);
  return { syncResults, progress };
}

export async function saveManualContextForBatchRow(
  batchId: string,
  companyId: string,
  batchRowId: string,
  manualContext: ImportBriefingManualContextV1
): Promise<void> {
  await assertBatchBriefingReviewable(batchId, companyId);
  const supabase = await createSupabaseServerClient();
  await ensureBriefingRowsForBatch(supabase as unknown as BriefingDataSupabaseClient, batchId);

  const { data: brRaw, error: brErr } = await supabase
    .from("import_batch_row_briefings")
    .select("id, content")
    .eq("batch_id", batchId)
    .eq("batch_row_id", batchRowId)
    .maybeSingle();

  if (brErr) throw new Error(brErr.message);
  const br = brRaw as { id: string; content: Json } | null;
  if (!br) throw new Error("briefing_row_not_found");

  const prev = parseBriefingContent(br.content);
  const next = { ...prev, manualContext };
  const { error: upErr } = await supabase
    .from("import_batch_row_briefings")
    .update({ content: next as unknown as Json } as never)
    .eq("id", br.id)
    .eq("batch_id", batchId);

  if (upErr) throw new Error(upErr.message);
}

async function loadBriefingContentForWrite(
  batchId: string,
  companyId: string,
  batchRowId: string
): Promise<{ id: string; content: BriefingStoredContent }> {
  await assertBatchBriefingReviewable(batchId, companyId);
  const supabase = createAdminClient();
  await ensureBriefingRowsForBatch(supabase, batchId);

  const { data: brRaw, error: brErr } = await supabase
    .from("import_batch_row_briefings")
    .select("id, content")
    .eq("batch_id", batchId)
    .eq("batch_row_id", batchRowId)
    .maybeSingle();

  if (brErr) throw new Error(brErr.message);
  const br = brRaw as { id: string; content: Json } | null;
  if (!br) throw new Error("briefing_row_not_found");
  return { id: br.id, content: parseBriefingContent(br.content) };
}

async function saveBriefingContent(
  batchId: string,
  briefingRecordId: string,
  next: BriefingStoredContent
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("import_batch_row_briefings")
    .update({ content: next as unknown as Json } as never)
    .eq("id", briefingRecordId)
    .eq("batch_id", batchId);
  if (error) throw new Error(error.message);
}

export async function savePolishedBriefingForBatchRow(
  batchId: string,
  companyId: string,
  batchRowId: string,
  polished: BriefingPolishedBundle,
  options?: { forceOverwriteManualEdits?: boolean }
): Promise<BriefingPolishedBundle> {
  const current = await loadBriefingContentForWrite(batchId, companyId, batchRowId);
  const prev = current.content;
  if (prev.briefingEdits?.manuallyEditedAt && options?.forceOverwriteManualEdits !== true) {
    throw new Error("briefing_manual_edits_present");
  }

  const nextPolished = sanitizePolishedBundle(polished);
  const briefingEdits = {
    ...prev.briefingEdits,
    aiPolishedAt: new Date().toISOString(),
  };
  if (options?.forceOverwriteManualEdits) {
    delete briefingEdits.manuallyEditedAt;
  }
  const next: BriefingStoredContent = {
    ...prev,
    polished: nextPolished,
    briefingEdits,
  };
  await saveBriefingContent(batchId, current.id, next);
  return nextPolished;
}

export async function saveEditedBriefingForBatchRow(
  batchId: string,
  companyId: string,
  batchRowId: string,
  polished: BriefingPolishedBundle
): Promise<BriefingPolishedBundle> {
  const current = await loadBriefingContentForWrite(batchId, companyId, batchRowId);
  const prev = current.content;
  const nextPolished = sanitizePolishedBundle(polished);
  const next: BriefingStoredContent = {
    ...prev,
    polished: nextPolished,
    briefingEdits: {
      ...prev.briefingEdits,
      manuallyEditedAt: new Date().toISOString(),
    },
  };
  await saveBriefingContent(batchId, current.id, next);
  return nextPolished;
}
