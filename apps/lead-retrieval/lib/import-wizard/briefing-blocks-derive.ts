/**
 * Step 4 real blocks (batch draft) — persisted under `import_batch_row_briefings.content` JSONB:
 *
 * ```json
 * {
 *   "companySnapshot": {
 *     "name": "string",
 *     "tagline": "string",
 *     "quote": "string",
 *     "headcount": "string",
 *     "techSophistication": "string",
 *     "hq": "string"
 *   },
 *   "whyHere": ["string"],
 *   "talkingPoints": [{ "title": "string", "detail": "string" }],
 *   "meta": { "sourceFingerprint": "<sha256 hex>", "blocksVersion": 1 }
 * }
 * ```
 *
 * Other `BriefingStoredContent` keys (headline, questionsToAsk, …) are left unchanged by merge.
 */
import type { BriefingContentMeta, BriefingStoredContent } from "@/lib/import-wizard/briefing-content-json";
import { canonicalValueForRow } from "@/lib/import-wizard/import-batch-validation-derive";
import type { LeadImportCanonicalKey } from "@/lib/import-wizard/lead-import-field-contract";

/** Deterministic snapshot fields for Company Snapshot (no invented firmographics). */
export type DerivedCompanySnapshot = {
  name: string;
  tagline: string;
  quote: string;
  headcount: string;
  techSophistication: string;
  hq: string;
};

export type DerivedBriefingBlocks = {
  companySnapshot: DerivedCompanySnapshot;
  whyHere: string[];
  talkingPoints: { title: string; detail: string }[];
};

function padRow(cells: string[], colCount: number): string[] {
  const padded = [...cells];
  while (padded.length < colCount) padded.push("");
  return padded.slice(0, colCount);
}

function nonEmpty(s: string): string | null {
  const t = s.trim();
  return t.length > 0 ? t : null;
}

function optionalLine(label: string, value: string): string | null {
  const v = nonEmpty(value);
  if (!v) return null;
  return `${label}: ${v}`;
}

/**
 * Derives the three Step-4 blocks only from mapped source cells. No LLM, no external enrichment.
 * Missing data yields empty strings or empty arrays; UI shows "—" / empty states via build layer.
 */
export function deriveBriefingBlocksFromMappedRow(
  cells: string[],
  csvHeaders: string[],
  selections: Record<string, string>
): DerivedBriefingBlocks {
  const colCount = csvHeaders.length;
  const row = padRow(cells, colCount);

  const fullName = canonicalValueForRow(row, selections, "full_name");
  const email = canonicalValueForRow(row, selections, "email");
  const linkedin = canonicalValueForRow(row, selections, "linkedin_url");
  const jobTitle = canonicalValueForRow(row, selections, "job_title");
  const company = canonicalValueForRow(row, selections, "company_text");
  const priority = canonicalValueForRow(row, selections, "priority_score");
  const rating = canonicalValueForRow(row, selections, "rating");
  const status = canonicalValueForRow(row, selections, "status");
  const followUp = canonicalValueForRow(row, selections, "follow_up_date");

  const name = company.trim();
  const taglineParts: string[] = [];
  if (nonEmpty(fullName) && nonEmpty(jobTitle)) {
    taglineParts.push(`Imported lead: ${fullName.trim()} — ${jobTitle.trim()}`);
  } else if (nonEmpty(jobTitle)) {
    taglineParts.push(`Title in import: ${jobTitle.trim()}`);
  } else if (nonEmpty(fullName)) {
    taglineParts.push(`Imported lead name: ${fullName.trim()}`);
  }
  const tagline = taglineParts.join(" · ");

  const companySnapshot: DerivedCompanySnapshot = {
    name,
    tagline,
    quote: "",
    headcount: "",
    techSophistication: "",
    hq: "",
  };

  const whyHere: string[] = [];
  const opt = (key: LeadImportCanonicalKey, label: string) => optionalLine(label, canonicalValueForRow(row, selections, key));
  const l1 = opt("status", "Status in source data");
  const l2 = opt("follow_up_date", "Follow-up date in source data");
  const l3 = opt("priority_score", "Priority score in source data");
  const l4 = opt("rating", "Rating in source data");
  for (const line of [l1, l2, l3, l4]) {
    if (line) whyHere.push(line);
  }

  const talkingPoints: { title: string; detail: string }[] = [];
  const add = (title: string, detail: string) => {
    const d = detail.trim();
    if (!d) return;
    if (talkingPoints.some((t) => t.detail === d)) return;
    talkingPoints.push({ title, detail: d });
  };

  if (nonEmpty(fullName)) add("Lead name", `Imported full name: ${fullName.trim()}`);
  if (nonEmpty(company)) add("Company", `Company field: ${company.trim()}`);
  if (nonEmpty(jobTitle)) add("Role", `Job title in import: ${jobTitle.trim()}`);
  if (nonEmpty(email)) add("Email", `Email on file: ${email.trim()}`);
  if (nonEmpty(linkedin)) add("LinkedIn", `LinkedIn URL in import: ${linkedin.trim()}`);

  return { companySnapshot, whyHere, talkingPoints };
}

/**
 * Merges derived blocks into persisted JSON. Preserves headline, questions, competitor, signals, etc.
 * Sets meta.sourceFingerprint so reload can skip re-derive when inputs unchanged.
 */
export function mergeBriefingBlocksIntoContent(
  previous: BriefingStoredContent,
  derived: DerivedBriefingBlocks,
  fp: string
): BriefingStoredContent {
  const meta: BriefingContentMeta = { sourceFingerprint: fp, blocksVersion: 1 };
  return {
    ...previous,
    companySnapshot: derived.companySnapshot,
    whyHere: derived.whyHere,
    talkingPoints: derived.talkingPoints,
    meta,
  };
}

export function shouldRefreshBriefingBlocks(stored: BriefingStoredContent, fp: string): boolean {
  return stored.meta?.sourceFingerprint !== fp;
}
