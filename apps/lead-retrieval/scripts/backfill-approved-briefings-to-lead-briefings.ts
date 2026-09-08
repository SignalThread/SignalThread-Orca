/**
 * One-time admin/dev backfill:
 * Sync approved import batch row briefings into lead_briefings for already-published leads.
 *
 * Resolver order:
 * 1) content.linkage.published_lead_id (must exist + belong to batch company)
 * 2) legacy fallback exact same-company email + full_name match
 * 3) when exact-name matches are multiple, choose newest created_at
 * 4) email-only fallback is allowed only when candidate names do not conflict
 *
 * If fallback resolves, this script also writes linkage back into
 * import_batch_row_briefings.content.linkage.published_lead_id.
 *
 * Run:
 *   npx tsx scripts/backfill-approved-briefings-to-lead-briefings.ts
 *
 * Optional:
 *   npx tsx scripts/backfill-approved-briefings-to-lead-briefings.ts --company-id=<uuid>
 *   npx tsx scripts/backfill-approved-briefings-to-lead-briefings.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";
import { canonicalValueForRow, isLeadImportEmailFormatValid } from "@/lib/import-wizard/import-batch-validation-derive";
import { parseBriefingContent, type BriefingStoredContent } from "@/lib/import-wizard/briefing-content-json";
import { toLeadBriefingApprovalStatus } from "@/lib/server/briefings/lead-briefings";
import type { Database, Json } from "@/types/database";

type AdminClient = ReturnType<typeof createClient<Database>>;

type BatchScope = {
  id: string;
  company_id: string;
  status: string;
};

type ApprovedBriefingRow = {
  id: string;
  batch_id: string;
  batch_row_id: string;
  approval_status: string;
  content: Json;
};

type FieldMappingStateRow = {
  batch_id: string;
  csv_headers: string[];
  selections: Json;
};

type BatchRow = {
  id: string;
  batch_id: string;
  cells: Json;
};

type LeadCandidate = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
};

type Resolution =
  | {
      ok: true;
      leadId: string;
      method: "linkage" | "fallback_exact_email_full_name" | "fallback_email_only_no_name_conflict";
      rowEmail: string;
      rowFullName: string;
      diagnostics: {
        linkageReason: "valid_linkage" | "missing_linkage" | "invalid_linkage";
        emailCandidateCount: number;
        emailCandidateIds: string[];
        exactNameMatchCount: number;
        exactNameMatchIds: string[];
        conflictingNameCount: number;
        conflictingNames: string[];
      };
    }
  | {
      ok: false;
      reason:
        | "missing_mapping"
        | "missing_batch_row"
        | "missing_or_invalid_email"
        | "missing_or_invalid_name"
        | "email_match_none"
        | "email_name_conflict_no_email_only_fallback"
        | "write_error";
      rowEmail: string;
      rowFullName: string;
      diagnostics: {
        linkageReason: "valid_linkage" | "missing_linkage" | "invalid_linkage";
        emailCandidateCount: number;
        emailCandidateIds: string[];
        exactNameMatchCount: number;
        exactNameMatchIds: string[];
        conflictingNameCount: number;
        conflictingNames: string[];
        error?: string;
      };
    };

type UpdatedRowResult = {
  briefingId: string;
  batchId: string;
  batchRowId: string;
  companyId: string;
  leadId: string;
  method: "linkage" | "fallback_exact_email_full_name" | "fallback_email_only_no_name_conflict";
  linkageBackfilled: boolean;
  previousLinkedLeadId: string | null;
  rowEmail: string;
};

type FailedRowResult = {
  briefingId: string;
  batchId: string;
  batchRowId: string;
  companyId: string;
  reason: Resolution extends { ok: false; reason: infer R } ? R : string;
  rowEmail: string;
  rowFullName: string;
  diagnostics: Record<string, unknown>;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | null => {
    const prefix = `${name}=`;
    const hit = args.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : null;
  };
  const hasFlag = (name: string): boolean => args.includes(name);
  return {
    companyId: getArg("--company-id"),
    briefingId: getArg("--briefing-id"),
    batchRowId: getArg("--batch-row-id"),
    dryRun: hasFlag("--dry-run"),
  };
}

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const [key, ...rest] = line.split("=");
        let value = rest.join("=").trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        return [key.trim(), value];
      })
  );
}

function getEnv() {
  const fileEnv = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
    fileEnv.SUPABASE_URL ||
    "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { supabaseUrl, serviceRoleKey };
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function getLinkedLeadIdFromContent(content: Json): string | null {
  const parsed = parseBriefingContent(content);
  const raw = String(parsed.linkage?.published_lead_id ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function withLinkedLeadId(content: Json, leadId: string): BriefingStoredContent {
  const parsed = parseBriefingContent(content);
  return {
    ...parsed,
    linkage: {
      ...(parsed.linkage ?? {}),
      published_lead_id: leadId,
    },
  };
}

async function loadReviewableBatches(
  supabase: AdminClient,
  companyId?: string | null
): Promise<BatchScope[]> {
  let query = supabase
    .from("import_batches")
    .select("id, company_id, status")
    .in("status", ["draft", "published"]);

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed loading reviewable batches: ${error.message}`);
  return (data ?? []) as BatchScope[];
}

async function loadApprovedBriefingsForBatches(
  supabase: AdminClient,
  batchIds: string[]
): Promise<ApprovedBriefingRow[]> {
  const rows: ApprovedBriefingRow[] = [];
  for (const batchChunk of chunk(batchIds, 200)) {
    const { data, error } = await supabase
      .from("import_batch_row_briefings")
      .select("id, batch_id, batch_row_id, approval_status, content")
      .in("batch_id", batchChunk)
      .eq("approval_status", "approved");

    if (error) {
      throw new Error(`Failed loading approved briefing rows: ${error.message}`);
    }
    rows.push(...((data ?? []) as ApprovedBriefingRow[]));
  }
  return rows;
}

async function loadMappingStates(
  supabase: AdminClient,
  batchIds: string[]
): Promise<Map<string, { headers: string[]; selections: Record<string, string> }>> {
  const out = new Map<string, { headers: string[]; selections: Record<string, string> }>();
  for (const batchChunk of chunk(batchIds, 200)) {
    const { data, error } = await supabase
      .from("import_batch_field_mapping_state")
      .select("batch_id, csv_headers, selections")
      .in("batch_id", batchChunk);

    if (error) {
      throw new Error(`Failed loading field mapping state: ${error.message}`);
    }

    for (const row of (data ?? []) as FieldMappingStateRow[]) {
      const headers = Array.isArray(row.csv_headers) ? row.csv_headers : [];
      const selections = (row.selections && typeof row.selections === "object"
        ? row.selections
        : {}) as Record<string, string>;
      out.set(row.batch_id, { headers, selections });
    }
  }
  return out;
}

async function loadBatchRowsById(
  supabase: AdminClient,
  rowIds: string[]
): Promise<Map<string, BatchRow>> {
  const out = new Map<string, BatchRow>();
  for (const rowChunk of chunk(rowIds, 200)) {
    const { data, error } = await supabase
      .from("import_batch_rows")
      .select("id, batch_id, cells")
      .in("id", rowChunk);

    if (error) {
      throw new Error(`Failed loading import batch rows: ${error.message}`);
    }

    for (const row of (data ?? []) as BatchRow[]) {
      out.set(row.id, row);
    }
  }
  return out;
}

async function resolveLeadForBriefingRow(params: {
  supabase: AdminClient;
  companyId: string;
  briefing: ApprovedBriefingRow;
  batchRow: BatchRow | null;
  mapping: { headers: string[]; selections: Record<string, string> } | null;
}): Promise<Resolution> {
  const { supabase, companyId, briefing, batchRow, mapping } = params;
  const linkedLeadId = getLinkedLeadIdFromContent(briefing.content);
  let linkageReason: "valid_linkage" | "missing_linkage" | "invalid_linkage" = linkedLeadId
    ? "invalid_linkage"
    : "missing_linkage";

  if (linkedLeadId) {
    const { data: linkedLead, error: linkedLeadErr } = await supabase
      .from("leads")
      .select("id")
      .eq("id", linkedLeadId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (linkedLeadErr) {
      throw new Error(`Failed validating linked lead ${linkedLeadId}: ${linkedLeadErr.message}`);
    }
    if (linkedLead?.id) {
      linkageReason = "valid_linkage";
      return {
        ok: true,
        leadId: linkedLead.id,
        method: "linkage",
        rowEmail: "",
        rowFullName: "",
        diagnostics: {
          linkageReason,
          emailCandidateCount: 0,
          emailCandidateIds: [],
          exactNameMatchCount: 0,
          exactNameMatchIds: [],
          conflictingNameCount: 0,
          conflictingNames: [],
        },
      };
    }
  }

  if (!mapping) {
    return {
      ok: false,
      reason: "missing_mapping",
      rowEmail: "",
      rowFullName: "",
      diagnostics: {
        linkageReason,
        emailCandidateCount: 0,
        emailCandidateIds: [],
        exactNameMatchCount: 0,
        exactNameMatchIds: [],
        conflictingNameCount: 0,
        conflictingNames: [],
      },
    };
  }
  if (!batchRow) {
    return {
      ok: false,
      reason: "missing_batch_row",
      rowEmail: "",
      rowFullName: "",
      diagnostics: {
        linkageReason,
        emailCandidateCount: 0,
        emailCandidateIds: [],
        exactNameMatchCount: 0,
        exactNameMatchIds: [],
        conflictingNameCount: 0,
        conflictingNames: [],
      },
    };
  }

  const cellsRaw = Array.isArray(batchRow.cells)
    ? (batchRow.cells as unknown[]).map((cell) => (typeof cell === "string" ? cell : ""))
    : [];
  const rowPadded = [...cellsRaw];
  while (rowPadded.length < mapping.headers.length) rowPadded.push("");
  const row = rowPadded.slice(0, mapping.headers.length);
  const rowEmail = canonicalValueForRow(row, mapping.selections, "email");
  const rowEmailNormalized = normalizeEmail(rowEmail);
  const rowFullName = canonicalValueForRow(row, mapping.selections, "full_name");
  const rowFullNameNormalized = normalizeName(rowFullName);

  if (!isLeadImportEmailFormatValid(rowEmail)) {
    return {
      ok: false,
      reason: "missing_or_invalid_email",
      rowEmail,
      rowFullName,
      diagnostics: {
        linkageReason,
        emailCandidateCount: 0,
        emailCandidateIds: [],
        exactNameMatchCount: 0,
        exactNameMatchIds: [],
        conflictingNameCount: 0,
        conflictingNames: [],
      },
    };
  }

  if (!rowFullNameNormalized) {
    return {
      ok: false,
      reason: "missing_or_invalid_name",
      rowEmail,
      rowFullName,
      diagnostics: {
        linkageReason,
        emailCandidateCount: 0,
        emailCandidateIds: [],
        exactNameMatchCount: 0,
        exactNameMatchIds: [],
        conflictingNameCount: 0,
        conflictingNames: [],
      },
    };
  }

  const { data: emailCandidatesRaw, error: emailErr } = await supabase
    .from("leads")
    .select("id, email, full_name, created_at")
    .eq("company_id", companyId)
    .ilike("email", rowEmail.trim())
    .order("created_at", { ascending: false })
    .limit(50);

  if (emailErr) {
    throw new Error(`Email candidate lookup failed: ${emailErr.message}`);
  }

  const emailCandidates = ((emailCandidatesRaw ?? []) as LeadCandidate[]).filter(
    (lead) => normalizeEmail(lead.email) === rowEmailNormalized
  );

  const exactNameMatches = emailCandidates.filter(
    (lead) => normalizeName(lead.full_name) === rowFullNameNormalized
  );

  const conflictingNames = Array.from(
    new Set(
      emailCandidates
        .map((lead) => normalizeName(lead.full_name))
        .filter((name) => name.length > 0)
    )
  );

  if (exactNameMatches.length > 0) {
    return {
      ok: true,
      leadId: exactNameMatches[0]!.id,
      method: "fallback_exact_email_full_name",
      rowEmail,
      rowFullName,
      diagnostics: {
        linkageReason,
        emailCandidateCount: emailCandidates.length,
        emailCandidateIds: emailCandidates.map((lead) => lead.id),
        exactNameMatchCount: exactNameMatches.length,
        exactNameMatchIds: exactNameMatches.map((lead) => lead.id),
        conflictingNameCount: conflictingNames.length,
        conflictingNames,
      },
    };
  }

  if (conflictingNames.length > 1) {
    return {
      ok: false,
      reason: "email_name_conflict_no_email_only_fallback",
      rowEmail,
      rowFullName,
      diagnostics: {
        linkageReason,
        emailCandidateCount: emailCandidates.length,
        emailCandidateIds: emailCandidates.map((lead) => lead.id),
        exactNameMatchCount: 0,
        exactNameMatchIds: [],
        conflictingNameCount: conflictingNames.length,
        conflictingNames,
      },
    };
  }

  if (emailCandidates.length > 0) {
    return {
      ok: true,
      leadId: emailCandidates[0]!.id,
      method: "fallback_email_only_no_name_conflict",
      rowEmail,
      rowFullName,
      diagnostics: {
        linkageReason,
        emailCandidateCount: emailCandidates.length,
        emailCandidateIds: emailCandidates.map((lead) => lead.id),
        exactNameMatchCount: 0,
        exactNameMatchIds: [],
        conflictingNameCount: conflictingNames.length,
        conflictingNames,
      },
    };
  }

  return {
    ok: false,
    reason: "email_match_none",
    rowEmail,
    rowFullName,
    diagnostics: {
      linkageReason,
      emailCandidateCount: emailCandidates.length,
      emailCandidateIds: emailCandidates.map((lead) => lead.id),
      exactNameMatchCount: 0,
      exactNameMatchIds: [],
      conflictingNameCount: conflictingNames.length,
      conflictingNames,
    },
  };
}

async function main() {
  const { companyId, briefingId, batchRowId, dryRun } = parseArgs();
  const { supabaseUrl, serviceRoleKey } = getEnv();
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const batches = await loadReviewableBatches(supabase, companyId);
  if (batches.length === 0) {
    console.log(
      JSON.stringify(
        {
          success: true,
          message: "No draft/published batches found.",
          updatedRows: [],
          failedRows: [],
          counts: {
            reviewableBatchCount: 0,
            approvedBriefingCount: 0,
            upsertedLeadBriefings: 0,
            linkageBackfilled: 0,
          },
        },
        null,
        2
      )
    );
    return;
  }

  const batchById = new Map(batches.map((b) => [b.id, b] as const));
  const approvedBriefingsRaw = await loadApprovedBriefingsForBatches(
    supabase,
    batches.map((b) => b.id)
  );
  const approvedBriefings = approvedBriefingsRaw.filter((row) => {
    if (briefingId && row.id !== briefingId) return false;
    if (batchRowId && row.batch_row_id !== batchRowId) return false;
    return true;
  });

  const mappingStates = await loadMappingStates(
    supabase,
    [...new Set(approvedBriefings.map((row) => row.batch_id))]
  );
  const batchRows = await loadBatchRowsById(
    supabase,
    [...new Set(approvedBriefings.map((row) => row.batch_row_id))]
  );

  const updatedRows: UpdatedRowResult[] = [];
  const failedRows: FailedRowResult[] = [];

  let matchedViaLinkage = 0;
  let matchedViaFallbackExact = 0;
  let matchedViaFallbackEmailOnlyNoConflict = 0;
  let linkageBackfilled = 0;

  for (const briefing of approvedBriefings) {
    const batch = batchById.get(briefing.batch_id);
    if (!batch) continue;

    const mapping = mappingStates.get(briefing.batch_id) ?? null;
    const batchRow = batchRows.get(briefing.batch_row_id) ?? null;
    const previousLinkedLeadId = getLinkedLeadIdFromContent(briefing.content);

    const resolved = await resolveLeadForBriefingRow({
      supabase,
      companyId: batch.company_id,
      briefing,
      batchRow,
      mapping,
    });

    if (!resolved.ok) {
      failedRows.push({
        briefingId: briefing.id,
        batchId: briefing.batch_id,
        batchRowId: briefing.batch_row_id,
        companyId: batch.company_id,
        reason: resolved.reason,
        rowEmail: resolved.rowEmail,
        rowFullName: resolved.rowFullName,
        diagnostics: resolved.diagnostics,
      });
      continue;
    }

    if (!dryRun) {
      const { error: upsertErr } = await supabase
        .from("lead_briefings")
        .upsert(
          {
            lead_id: resolved.leadId,
            company_id: batch.company_id,
            content: briefing.content,
            approval_status: toLeadBriefingApprovalStatus(briefing.approval_status),
          } as never,
          { onConflict: "lead_id" }
        );
      if (upsertErr) {
        failedRows.push({
          briefingId: briefing.id,
          batchId: briefing.batch_id,
          batchRowId: briefing.batch_row_id,
          companyId: batch.company_id,
          reason: "write_error",
          rowEmail: resolved.rowEmail,
          rowFullName: resolved.rowFullName,
          diagnostics: { error: `lead_briefings upsert failed: ${upsertErr.message}` },
        });
        continue;
      }
    }

    let backfilled = false;
    if (resolved.method !== "linkage" && previousLinkedLeadId !== resolved.leadId) {
      const nextContent = withLinkedLeadId(briefing.content, resolved.leadId);
      if (!dryRun) {
        const { error: linkErr } = await supabase
          .from("import_batch_row_briefings")
          .update({ content: nextContent as unknown as Json } as never)
          .eq("id", briefing.id);
        if (linkErr) {
          failedRows.push({
            briefingId: briefing.id,
            batchId: briefing.batch_id,
            batchRowId: briefing.batch_row_id,
            companyId: batch.company_id,
            reason: "write_error",
            rowEmail: resolved.rowEmail,
            rowFullName: resolved.rowFullName,
            diagnostics: { error: `linkage backfill failed: ${linkErr.message}` },
          });
          continue;
        }
      }
      backfilled = true;
      linkageBackfilled += 1;
    }

    if (resolved.method === "linkage") matchedViaLinkage += 1;
    if (resolved.method === "fallback_exact_email_full_name") matchedViaFallbackExact += 1;
    if (resolved.method === "fallback_email_only_no_name_conflict")
      matchedViaFallbackEmailOnlyNoConflict += 1;

    updatedRows.push({
      briefingId: briefing.id,
      batchId: briefing.batch_id,
      batchRowId: briefing.batch_row_id,
      companyId: batch.company_id,
      leadId: resolved.leadId,
      method: resolved.method,
      linkageBackfilled: backfilled,
      previousLinkedLeadId,
      rowEmail: resolved.rowEmail,
    });
  }

  const result = {
    success: true,
    dryRun,
    counts: {
      reviewableBatchCount: batches.length,
      draftBatchCount: batches.filter((b) => b.status === "draft").length,
      publishedBatchCount: batches.filter((b) => b.status === "published").length,
      approvedBriefingCount: approvedBriefings.length,
      upsertedLeadBriefings: updatedRows.length,
      matchedViaLinkage,
      matchedViaFallbackExact,
      matchedViaFallbackEmailOnlyNoConflict,
      linkageBackfilled,
      unresolved: failedRows.length,
    },
    updatedRows,
    failedRows,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      null,
      2
    )
  );
  process.exit(1);
});
