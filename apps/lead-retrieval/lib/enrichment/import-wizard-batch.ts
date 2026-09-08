import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enrichWithApollo } from "@/lib/enrichment/providers/apollo";
import { enrichWithPdl, type ProviderEnrichmentResult } from "@/lib/enrichment/providers/pdl";
import { enrichWithZoomInfo } from "@/lib/enrichment/providers/zoominfo";
import { normalizeEnrichmentInput, type RawEnrichmentLead } from "@/lib/enrichment/providers/normalize-input";
import {
  resolveAdapterCredentialsForCompany,
  type EnrichmentAdapterKey,
} from "@/lib/enrichment/resolve-adapter-for-company";
import { canonicalValueForRow } from "@/lib/import-wizard/import-batch-validation-derive";
import { resolveImportedLeadName } from "@/lib/import-wizard/lead-import-name";
import type { LeadImportCanonicalKey } from "@/lib/import-wizard/lead-import-field-contract";
import type { Json } from "@/types/database";

function hasMeaningfulEnrichmentPatch(patch: Record<string, unknown>): boolean {
  const keys = [
    "job_title",
    "company_size",
    "industry",
    "linkedin_url",
    "company_domain",
    "seniority",
  ] as const;
  for (const k of keys) {
    const v = patch[k];
    if (v != null && String(v).trim() !== "") {
      return true;
    }
  }
  return false;
}

function countFilledNormalized(n: Record<string, unknown>): number {
  return [
    n.job_title,
    n.company_size,
    n.industry,
    n.linkedin_url,
    n.company_domain,
    n.seniority,
  ].filter((v) => v != null && String(v).trim() !== "").length;
}

export type WizardBatchRowStatus = "success" | "partial" | "no_match" | "failed";

export type WizardBatchRowResult = {
  leadId: string;
  name: string;
  email: string;
  company: string;
  enrichedFields: string;
  status: WizardBatchRowStatus;
};

export type WizardBatchEnrichmentSummary = {
  totalProcessed: number;
  success: number;
  partial: number;
  failed: number;
  noMatch: number;
  coveragePercent: number;
};

export type WizardBatchEnrichmentOutcome = {
  summary: WizardBatchEnrichmentSummary;
  sampleRows: WizardBatchRowResult[];
  provider: "apollo" | "pdl" | "zoominfo";
  runId: string;
  /** `import_batches.data_revision` after this run (for client freshness checks). */
  dataRevision: number;
};

function deriveRowStatus(enriched: ProviderEnrichmentResult, meaningful: boolean): WizardBatchRowStatus {
  if (enriched.errorMessage) {
    return "failed";
  }
  if (enriched.noMatch) {
    return "no_match";
  }
  if (!enriched.shouldUpdateNormalized) {
    return "failed";
  }
  if (!meaningful) {
    return "no_match";
  }
  const filled = countFilledNormalized(enriched.normalized as Record<string, unknown>);
  return filled >= 3 ? "success" : "partial";
}

function formatEnrichedFields(enriched: ProviderEnrichmentResult): string {
  const n = enriched.normalized;
  const parts: string[] = [];
  if (n.job_title) parts.push(`Title: ${n.job_title}`);
  if (n.company_size) parts.push(`Size: ${n.company_size}`);
  if (n.industry) parts.push(`Industry: ${n.industry}`);
  if (n.company_domain) parts.push(`Website: ${n.company_domain}`);
  return parts.length ? parts.join(" · ") : "—";
}

const DEFAULT_MAX_LEADS = 50;
const SAMPLE_CAP = 12;

type BatchRowRecord = {
  id: string;
  row_index: number;
  cells: unknown;
};

function parseCells(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => (typeof c === "string" ? c : ""));
}

function batchRowCanonical(
  cells: string[],
  selections: Record<string, string>,
  key: LeadImportCanonicalKey
): string {
  return canonicalValueForRow(cells, selections, key).trim();
}

/**
 * Batch-scoped enrichment: reads rows from `import_batch_rows` for the given
 * batchId, resolves canonical fields via `import_batch_field_mapping_state`,
 * and enriches each row with the chosen provider.
 *
 * Only rows belonging to the specified batch are processed — no account-wide
 * leads table query.
 */
export async function runImportWizardBatchEnrichment(params: {
  companyId: string;
  userId: string;
  adapterKey: EnrichmentAdapterKey;
  batchId: string;
  maxLeads?: number;
}): Promise<
  | { ok: true; data: WizardBatchEnrichmentOutcome }
  | { ok: false; code: "missing_credentials" | "no_leads" | "batch_not_found" | "internal"; message: string }
> {
  const maxLeads =
    params.maxLeads ?? (Number(process.env.IMPORT_WIZARD_ENRICHMENT_MAX_LEADS ?? DEFAULT_MAX_LEADS) || DEFAULT_MAX_LEADS);

  const creds = await resolveAdapterCredentialsForCompany(params.companyId, params.adapterKey);
  if (!creds) {
    return {
      ok: false,
      code: "missing_credentials",
      message:
        "No API credentials found for this provider. Connect it in Integrations or configure the server environment key.",
    };
  }

  const supabase = await createSupabaseServerClient();

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id")
    .eq("id", params.batchId)
    .eq("company_id", params.companyId)
    .maybeSingle();

  if (batchError || !batch) {
    return { ok: false, code: "batch_not_found", message: "Import batch not found for this company." };
  }

  const { data: mappingRow, error: mappingError } = (await supabase
    .from("import_batch_field_mapping_state")
    .select("selections")
    .eq("batch_id", params.batchId)
    .maybeSingle()) as {
    data: { selections: unknown } | null;
    error: { message: string } | null;
  };

  if (mappingError || !mappingRow) {
    return { ok: false, code: "batch_not_found", message: "Field mapping not found for this batch." };
  }

  const selections: Record<string, string> = (() => {
    const raw = mappingRow.selections;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  })();

  const { data: batchRows, error: rowsError } = (await supabase
    .from("import_batch_rows")
    .select("id, row_index, cells")
    .eq("batch_id", params.batchId)
    .order("row_index", { ascending: true })
    .limit(maxLeads)) as {
    data: BatchRowRecord[] | null;
    error: { message: string } | null;
  };

  if (rowsError) {
    return { ok: false, code: "internal", message: rowsError.message };
  }

  const rows = batchRows ?? [];
  if (rows.length === 0) {
    return {
      ok: false,
      code: "no_leads",
      message: "No rows found in this import batch. Upload a CSV and map fields first.",
    };
  }

  let success = 0;
  let partial = 0;
  let failed = 0;
  let noMatch = 0;
  const sampleRows: WizardBatchRowResult[] = [];
  const runId = crypto.randomUUID();
  const admin = createAdminClient();

  for (const batchRow of rows) {
    const cells = parseCells(batchRow.cells);
    const rowId = batchRow.id;

    const fullName = resolveImportedLeadName(cells, selections) || null;
    const email = batchRowCanonical(cells, selections, "email") || null;
    const companyText = batchRowCanonical(cells, selections, "company_text") || null;
    const linkedinUrl = batchRowCanonical(cells, selections, "linkedin_url") || null;

    const displayName = fullName ?? "(Row " + (batchRow.row_index + 1) + ")";
    const displayEmail = email ?? "—";
    const displayCompany = companyText ?? "—";

    const rawInput: RawEnrichmentLead = {
      email,
      linkedinUrl,
      fullName,
      company: companyText,
      companyDomain: null,
    };

    let normalizedInput;
    try {
      normalizedInput = normalizeEnrichmentInput(rawInput);
    } catch {
      failed += 1;
      if (sampleRows.length < SAMPLE_CAP) {
        sampleRows.push({
          leadId: rowId,
          name: displayName,
          email: displayEmail,
          company: displayCompany,
          enrichedFields: "—",
          status: "failed",
        });
      }
      continue;
    }

    let enriched: ProviderEnrichmentResult;
    try {
      if (params.adapterKey === "pdl") {
        enriched = await enrichWithPdl(normalizedInput, { apiKey: creds.apiKey });
      } else if (params.adapterKey === "apollo") {
        enriched = await enrichWithApollo(normalizedInput, { apiKey: creds.apiKey });
      } else {
        enriched = await enrichWithZoomInfo(normalizedInput, { apiKey: creds.apiKey });
      }
    } catch {
      failed += 1;
      if (sampleRows.length < SAMPLE_CAP) {
        sampleRows.push({
          leadId: rowId,
          name: displayName,
          email: displayEmail,
          company: displayCompany,
          enrichedFields: "—",
          status: "failed",
        });
      }
      continue;
    }

    const meaningful = hasMeaningfulEnrichmentPatch(enriched.normalized as Record<string, unknown>);
    const rowStatus = deriveRowStatus(enriched, meaningful);

    // Do not insert into `lead_enrichments` here: `lead_id` references published `leads`,
    // while `rowId` is `import_batch_rows.id`. Row-level handoff uses
    // `import_batch_rows.wizard_enrichment_normalized`; audit lives on `import_wizard_enrichment_runs`.
    if (
      enriched.shouldUpdateNormalized &&
      meaningful &&
      (rowStatus === "success" || rowStatus === "partial")
    ) {
      const { error: rowEnrichErr } = await admin
        .from("import_batch_rows")
        .update({
          wizard_enrichment_normalized: enriched.normalized as unknown as Json
        } as never)
        .eq("id", rowId)
        .eq("batch_id", params.batchId);
      if (rowEnrichErr) {
        console.error(
          "[runImportWizardBatchEnrichment] wizard_enrichment_normalized update failed",
          rowEnrichErr
        );
      }
    }

    switch (rowStatus) {
      case "success":
        success += 1;
        break;
      case "partial":
        partial += 1;
        break;
      case "no_match":
        noMatch += 1;
        break;
      default:
        failed += 1;
    }

    if (sampleRows.length < SAMPLE_CAP) {
      sampleRows.push({
        leadId: rowId,
        name: displayName,
        email: displayEmail,
        company: displayCompany,
        enrichedFields: formatEnrichedFields(enriched),
        status: rowStatus,
      });
    }
  }

  const totalProcessed = rows.length;
  const withSignal = success + partial;
  const coveragePercent =
    totalProcessed === 0 ? 0 : Math.min(100, Math.round((withSignal / totalProcessed) * 100));

  const summary: WizardBatchEnrichmentSummary = {
    totalProcessed,
    success,
    partial,
    failed,
    noMatch,
    coveragePercent,
  };

  // Table not yet in generated Database types; batch_id column added in migration 0039.
  const { error: runInsertError } = await (admin as unknown as import("@supabase/supabase-js").SupabaseClient)
    .from("import_wizard_enrichment_runs")
    .insert({
      id: runId,
      company_id: params.companyId,
      batch_id: params.batchId,
      created_by: params.userId,
      provider: params.adapterKey,
      summary,
      sample_rows: sampleRows,
      lead_count: totalProcessed,
    } as never);

  if (runInsertError) {
    console.error("import_wizard_enrichment_runs insert failed", runInsertError);
  }

  const { data: batchLatest } = await supabase
    .from("import_batches")
    .select("data_revision")
    .eq("id", params.batchId)
    .eq("company_id", params.companyId)
    .maybeSingle();

  const rawRev =
    batchLatest && typeof batchLatest === "object" && "data_revision" in batchLatest
      ? (batchLatest as { data_revision: unknown }).data_revision
      : undefined;
  const batchDataRevision = typeof rawRev === "number" ? rawRev : 0;

  return {
    ok: true,
    data: {
      summary,
      sampleRows,
      provider: params.adapterKey,
      runId,
      dataRevision: batchDataRevision,
    },
  };
}
