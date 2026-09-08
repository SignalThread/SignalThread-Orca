import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  canonicalValueForRow,
  isLeadImportEmailFormatValid,
  rowHasUsableIdentityPath,
} from "@/lib/import-wizard/import-batch-validation-derive";
import { parseBriefingContent } from "@/lib/import-wizard/briefing-content-json";
import { isImportLinkedInUrlFormatValid } from "@/lib/import-wizard/linkedin-import-url";
import { resolveImportedLeadName } from "@/lib/import-wizard/lead-import-name";
import { toLeadBriefingApprovalStatus } from "@/lib/server/briefings/lead-briefings";
import { getBatchRowsForBatchWithAdmin } from "@/lib/server/import-wizard/import-batch-rows-service";
import { getFieldMappingStateForBatchWithAdmin } from "@/lib/server/import-wizard/field-mapping-state";
import { legacyPriorityScoreToLeadTemperature } from "@/lib/leads/temperature";
import { mergeWizardEnrichmentIntoLeadInsert } from "@/lib/leads/wizard-enrichment-to-lead-patch";
import { attemptLeadCapturedWorkflowEmit } from "@/lib/workflows/emit/non-fatal-lead-captured-emit";
import type { Json } from "@/types/database";

function nullableTrimmed(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

/** Prefer the shared mapped-name resolver; otherwise derive a label from email, LinkedIn, or a neutral fallback. */
export function deriveImportedLeadDisplayName(row: string[], selections: Record<string, string>): string {
  const fn = resolveImportedLeadName(row, selections);
  if (fn) return fn;

  const emailRaw = canonicalValueForRow(row, selections, "email").trim();
  if (emailRaw && isLeadImportEmailFormatValid(emailRaw)) {
    const at = emailRaw.indexOf("@");
    if (at > 0) {
      const local = emailRaw.slice(0, at).trim();
      if (local) return local;
    }
  }

  const li = canonicalValueForRow(row, selections, "linkedin_url").trim();
  if (li) {
    const match = li.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (match?.[1]) {
      return match[1].replace(/-/g, " ").trim() || "Imported lead";
    }
  }

  return "Imported lead";
}

function normalizeLinkedInForLead(value: string): string | null {
  const t = value.trim();
  if (!t || !isImportLinkedInUrlFormatValid(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function parsePriorityScore(raw: string): number {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseRating(raw: string): number {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

function parseLeadStatus(raw: string): "new" | "follow_up" | "closed" {
  const s = String(raw).trim().toLowerCase();
  if (s === "follow_up" || s === "follow-up" || s === "follow up") return "follow_up";
  if (s === "closed") return "closed";
  return "new";
}

function parseFollowUpDate(raw: string): string | null {
  const f = String(raw).trim();
  if (!f) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null;
}

export type MaterializeImportedLeadsResult = {
  importedCount: number;
  leadIds: string[];
};

type MaterializeImportedLeadsDeps = {
  createAdminClientFn?: typeof createAdminClient;
  getFieldMappingStateForBatchWithAdminFn?: typeof getFieldMappingStateForBatchWithAdmin;
  getBatchRowsForBatchWithAdminFn?: typeof getBatchRowsForBatchWithAdmin;
  attemptLeadCapturedWorkflowEmitFn?: typeof attemptLeadCapturedWorkflowEmit;
};

/**
 * Inserts `public.leads` rows from staged CSV + field mapping after a batch is published.
 * Uses the service role client so this succeeds for exhibitor_admin (RLS on `leads` insert is bypassed).
 */
export async function materializeImportedLeadsFromBatch(params: {
  batchId: string;
  companyId: string;
  ownerUserId: string;
  eventId?: string | null;
}, deps: MaterializeImportedLeadsDeps = {}): Promise<MaterializeImportedLeadsResult> {
  const { batchId, companyId, ownerUserId } = params;
  const eventId = String(params.eventId ?? "").trim() || null;
  if (!eventId) {
    throw new Error("missing_event_scope");
  }

  const createAdminClientFn = deps.createAdminClientFn ?? createAdminClient;
  const getFieldMappingStateFn =
    deps.getFieldMappingStateForBatchWithAdminFn ?? getFieldMappingStateForBatchWithAdmin;
  const getBatchRowsFn = deps.getBatchRowsForBatchWithAdminFn ?? getBatchRowsForBatchWithAdmin;
  const attemptWorkflowEmitFn = deps.attemptLeadCapturedWorkflowEmitFn ?? attemptLeadCapturedWorkflowEmit;

  const supabase = createAdminClientFn();
  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .select("id, company_id, status")
    .eq("id", batchId)
    .maybeSingle<{ id: string; company_id: string; status: string }>();

  if (batchErr || !batch) {
    throw new Error("batch_not_found");
  }
  if (batch.company_id !== companyId) {
    throw new Error("batch_company_mismatch");
  }
  if (batch.status !== "published") {
    throw new Error("batch_not_published");
  }

  const fm = await getFieldMappingStateFn(batchId);
  const batchRows = await getBatchRowsFn(batchId);
  if (!fm || batchRows.length === 0) {
    return { importedCount: 0, leadIds: [] };
  }

  const { data: briefingRowsRaw, error: briefingRowsError } = await supabase
    .from("import_batch_row_briefings")
    .select("batch_row_id, content, approval_status")
    .eq("batch_id", batchId);

  if (briefingRowsError) {
    throw new Error(briefingRowsError.message);
  }

  const briefingByBatchRowId = new Map(
    ((briefingRowsRaw ?? []) as Array<{
      batch_row_id: string;
      content: Json;
      approval_status: string | null;
    }>).map((row) => [row.batch_row_id, row] as const)
  );

  const { csv_headers, selections } = fm;
  const colCount = csv_headers.length;
  const rows = batchRows.map((row) => {
    const r = row.cells;
    const padded = [...r];
    while (padded.length < colCount) padded.push("");
    return {
      batchRowId: row.id,
      cells: padded.slice(0, colCount),
      wizardEnrichmentNormalized: row.wizardEnrichmentNormalized ?? null
    };
  });

  const leadIds: string[] = [];

  for (const row of rows) {
    if (!rowHasUsableIdentityPath(row.cells, selections)) continue;

    const fullName = deriveImportedLeadDisplayName(row.cells, selections);
    const emailRaw = canonicalValueForRow(row.cells, selections, "email").trim();
    const email = emailRaw && isLeadImportEmailFormatValid(emailRaw) ? emailRaw : null;

    const jobTitle = nullableTrimmed(canonicalValueForRow(row.cells, selections, "job_title"));
    const companyText = nullableTrimmed(canonicalValueForRow(row.cells, selections, "company_text"));

    const liRaw = canonicalValueForRow(row.cells, selections, "linkedin_url").trim();
    const linkedinUrlNormalized = liRaw ? normalizeLinkedInForLead(liRaw) : null;

    const companyDomain = nullableTrimmed(canonicalValueForRow(row.cells, selections, "company_domain"));
    const industry = nullableTrimmed(canonicalValueForRow(row.cells, selections, "industry"));
    const companySize = nullableTrimmed(canonicalValueForRow(row.cells, selections, "company_size"));
    const seniority = nullableTrimmed(canonicalValueForRow(row.cells, selections, "seniority"));
    const intentRaw = canonicalValueForRow(row.cells, selections, "intent_signals").trim();
    let intentSignals: unknown = [];
    if (intentRaw) {
      try {
        const parsed = JSON.parse(intentRaw) as unknown;
        if (Array.isArray(parsed)) {
          intentSignals = parsed;
        } else {
          intentSignals = intentRaw
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((value) => ({ type: "topic", value }));
        }
      } catch {
        intentSignals = intentRaw
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((value) => ({ type: "topic", value }));
      }
    }

    const priorityScoreRaw = canonicalValueForRow(row.cells, selections, "priority_score");
    const priorityScore = parsePriorityScore(priorityScoreRaw);
    const rating = parseRating(canonicalValueForRow(row.cells, selections, "rating"));
    const status = parseLeadStatus(canonicalValueForRow(row.cells, selections, "status"));
    const followUpDate = parseFollowUpDate(canonicalValueForRow(row.cells, selections, "follow_up_date"));

    let insertRow: Record<string, unknown> = {
      company_id: companyId,
      full_name: fullName,
      email,
      job_title: jobTitle,
      company_text: companyText,
      linkedin_url: linkedinUrlNormalized,
      company_domain: companyDomain,
      industry,
      company_size: companySize,
      seniority,
      intent_signals: intentSignals,
      temperature: priorityScoreRaw.trim() ? legacyPriorityScoreToLeadTemperature(priorityScore) : null,
      priority_score: priorityScore,
      rating,
      status,
      follow_up_date: followUpDate,
      owner_user_id: ownerUserId,
      event_id: eventId,
    };

    insertRow = mergeWizardEnrichmentIntoLeadInsert(insertRow, row.wizardEnrichmentNormalized);

    const liOut = insertRow.linkedin_url;
    if (typeof liOut === "string" && liOut.trim()) {
      insertRow.linkedin_url = normalizeLinkedInForLead(liOut.trim());
    } else {
      insertRow.linkedin_url = null;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("leads")
      .insert(insertRow as never)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (insErr) {
      console.error("[materializeImportedLeadsFromBatch] lead insert failed", {
        batchId,
        message: insErr.message,
        code: (insErr as { code?: string }).code,
      });
      continue;
    }
    if (inserted?.id) {
      leadIds.push(inserted.id);
      let workflowEmitStatus: string | null = null;
      try {
        const workflowEmitResult = await attemptWorkflowEmitFn({
          leadId: String(inserted.id),
          companyId,
          eventId,
          source: "csv_publish",
          logContext: "lib/server/import-wizard/publish-leads-materialization:csv_publish"
        });
        workflowEmitStatus = workflowEmitResult?.status ?? null;
      } catch (emitError) {
        console.warn("[lead-create] import workflow emit failed after lead insert", {
          route: "lib/server/import-wizard/publish-leads-materialization",
          batchId,
          batchRowId: row.batchRowId,
          leadId: String(inserted.id),
          companyId,
          eventId,
          source: "csv_publish",
          message: emitError instanceof Error ? emitError.message : "unknown"
        });
      }

      console.info("[lead-create] inserted lead row", {
        route: "lib/server/import-wizard/publish-leads-materialization",
        batchId,
        batchRowId: row.batchRowId,
        leadId: String(inserted.id),
        companyId,
        eventId,
        source: "csv_publish",
        workflowEmitAttempted: true,
        workflowEmitStatus
      });

      const sourceBriefing = briefingByBatchRowId.get(row.batchRowId);
      if (sourceBriefing) {
        const parsedContent = parseBriefingContent(sourceBriefing.content);
        const linkedContent = {
          ...parsedContent,
          linkage: {
            ...(parsedContent.linkage ?? {}),
            published_lead_id: inserted.id,
          },
        };

        const { error: linkBatchRowError } = await supabase
          .from("import_batch_row_briefings")
          .update({ content: linkedContent as unknown as Json } as never)
          .eq("batch_id", batchId)
          .eq("batch_row_id", row.batchRowId);

        if (linkBatchRowError) {
          console.error("[materializeImportedLeadsFromBatch] briefing linkage content update failed", {
            batchId,
            batchRowId: row.batchRowId,
            leadId: inserted.id,
            message: linkBatchRowError.message,
            code: (linkBatchRowError as { code?: string }).code,
          });
        }

        const { error: upsertBriefingError } = await supabase
          .from("lead_briefings")
          .upsert(
            {
              lead_id: inserted.id,
              company_id: companyId,
              content: linkedContent as unknown as Json,
              approval_status: toLeadBriefingApprovalStatus(sourceBriefing.approval_status),
            } as never,
            { onConflict: "lead_id" }
          );

        if (upsertBriefingError) {
          console.error("[materializeImportedLeadsFromBatch] lead briefing upsert failed", {
            batchId,
            batchRowId: row.batchRowId,
            leadId: inserted.id,
            message: upsertBriefingError.message,
            code: (upsertBriefingError as { code?: string }).code,
          });
        }
      }
    }
  }

  return { importedCount: leadIds.length, leadIds };
}
