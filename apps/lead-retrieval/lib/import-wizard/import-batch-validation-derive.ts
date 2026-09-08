/**
 * Canonical import batch validation — pure derivation from staged CSV rows + field mapping selections.
 * Identity model (usable path = at least one):
 * - valid email
 * - valid linkedin_url (non-empty + format)
 * - full_name + company_text (both non-empty)
 * Job title never blocks. Continue is blocked only when rows lack any usable identity path.
 */

import type { LeadImportCanonicalKey } from "@/lib/import-wizard/lead-import-field-contract";
import { isImportLinkedInUrlFormatValid } from "@/lib/import-wizard/linkedin-import-url";
import { hasUsableImportedPersonName } from "@/lib/import-wizard/lead-import-name";

export type ImportValidationIssueKind =
  | "no_usable_identity"
  | "duplicate_email"
  | "invalid_email_non_blocking"
  | "invalid_linkedin_non_blocking"
  | "missing_job_title"
  | "missing_company_warning"
  | "missing_email_warning"
  | "missing_linkedin_warning";

export type ImportValidationIssueAction = {
  label: string;
  /** Import wizard step index (0 = source, 1 = mapping). */
  stepIndex: number;
};

export type ImportValidationIssueBucket = {
  kind: ImportValidationIssueKind;
  title: string;
  detail: string;
  affectedRowCount: number;
  severity: "must_fix" | "review_recommended";
  actions: ImportValidationIssueAction[];
};

export type ImportBatchValidationResult = {
  totalRows: number;
  /** Rows with identity, no duplicate-email conflict, and no warning flags. */
  fullyValidRows: number;
  /** Distinct rows with no usable identity path (blocking). */
  rowsWithMustFix: number;
  duplicateEmailRowCount: number;
  /** Rows with no usable identity path (legacy name; same as blocking identity failures). */
  missingRequiredRowCount: number;
  /** Rows with non-empty email that fails format (any). */
  invalidEmailRowCount: number;
  validationRatePercent: number;
  /** True when there is at least one data row and zero blocking (identity) rows. */
  continueAllowed: boolean;
  issues: ImportValidationIssueBucket[];
};

/** Normalize email for duplicate detection: trim + lowercase. Empty string is not a duplicate key. */
export function normalizeEmailForDuplicateKey(email: string): string {
  return email.trim().toLowerCase();
}

/** Syntactic email check aligned with typical lead forms (not full RFC). */
export function isLeadImportEmailFormatValid(email: string): boolean {
  const t = email.trim();
  if (t.length === 0) return false;
  if (t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/**
 * First non-empty mapped value wins when multiple columns map to the same canonical key (defensive).
 */
export function canonicalValueForRow(
  row: string[],
  selections: Record<string, string>,
  key: LeadImportCanonicalKey
): string {
  for (let col = 0; col < row.length; col++) {
    const sel = selections[String(col)] ?? "";
    if (sel === key) {
      const v = row[col] ?? "";
      if (v.trim() !== "") {
        return v;
      }
    }
  }
  for (let col = 0; col < row.length; col++) {
    const sel = selections[String(col)] ?? "";
    if (sel === key) {
      return row[col] ?? "";
    }
  }
  return "";
}

function columnMapped(selections: Record<string, string>, key: LeadImportCanonicalKey): boolean {
  return Object.values(selections).includes(key);
}

function hasValidEmailIdentity(emailRaw: string): boolean {
  return emailRaw.trim().length > 0 && isLeadImportEmailFormatValid(emailRaw);
}

function hasLinkedInIdentity(linkedinRaw: string): boolean {
  const t = linkedinRaw.trim();
  return t.length > 0 && isImportLinkedInUrlFormatValid(linkedinRaw);
}

function hasFullNameCompanyIdentity(row: string[], selections: Record<string, string>, company: string): boolean {
  return hasUsableImportedPersonName(row, selections) && company.trim() !== "";
}

/**
 * Single source of truth for “can this row be identified downstream?” — shared with enrichment/briefing thinking.
 */
export function rowHasUsableIdentityPath(row: string[], selections: Record<string, string>): boolean {
  const emailRaw = canonicalValueForRow(row, selections, "email");
  const linkedinRaw = canonicalValueForRow(row, selections, "linkedin_url");
  const co = canonicalValueForRow(row, selections, "company_text");

  if (hasValidEmailIdentity(emailRaw)) return true;
  if (hasLinkedInIdentity(linkedinRaw)) return true;
  if (hasFullNameCompanyIdentity(row, selections, co)) return true;
  return false;
}

const GO_SOURCE: ImportValidationIssueAction = { label: "Go to Source", stepIndex: 0 };
const GO_MAPPING: ImportValidationIssueAction = { label: "Go to Mapping", stepIndex: 1 };
const BOTH_ACTIONS: ImportValidationIssueAction[] = [GO_MAPPING, GO_SOURCE];

export function deriveImportBatchValidation(input: {
  csv_headers: string[];
  selections: Record<string, string>;
  staged_rows: string[][];
}): ImportBatchValidationResult {
  const { csv_headers, selections, staged_rows } = input;
  const colCount = csv_headers.length;

  const rows = staged_rows.map((r) => {
    const padded = [...r];
    while (padded.length < colCount) padded.push("");
    return padded.slice(0, colCount);
  });

  const totalRows = rows.length;

  const emailByNorm = new Map<string, number>();
  for (const row of rows) {
    const emailRaw = canonicalValueForRow(row, selections, "email");
    const k = normalizeEmailForDuplicateKey(emailRaw);
    if (k.length > 0) {
      emailByNorm.set(k, (emailByNorm.get(k) ?? 0) + 1);
    }
  }

  const noIdentity = new Set<number>();
  const dupRow = new Set<number>();
  const invalidEmailNonBlocking = new Set<number>();
  const invalidLiNonBlocking = new Set<number>();
  const missJob = new Set<number>();
  const missCompany = new Set<number>();
  const missEmail = new Set<number>();
  const missLi = new Set<number>();
  let invalidEmailAnyCount = 0;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]!;
    const emailRaw = canonicalValueForRow(row, selections, "email");
    const linkedinRaw = canonicalValueForRow(row, selections, "linkedin_url");
    const co = canonicalValueForRow(row, selections, "company_text");
    const jobRaw = canonicalValueForRow(row, selections, "job_title");

    const identity = rowHasUsableIdentityPath(row, selections);
    if (!identity) {
      noIdentity.add(ri);
    }

    const emailTrim = emailRaw.trim();
    const emailNonEmptyBadFormat = emailTrim.length > 0 && !isLeadImportEmailFormatValid(emailRaw);
    if (emailNonEmptyBadFormat) {
      invalidEmailAnyCount += 1;
    }

    const nk = normalizeEmailForDuplicateKey(emailRaw);
    if (nk.length > 0 && (emailByNorm.get(nk) ?? 0) > 1) {
      dupRow.add(ri);
    }

    if (identity) {
      if (emailNonEmptyBadFormat) {
        invalidEmailNonBlocking.add(ri);
      }

      const liTrim = linkedinRaw.trim();
      const liNonEmptyBad = liTrim.length > 0 && !isImportLinkedInUrlFormatValid(linkedinRaw);
      if (liNonEmptyBad) {
        invalidLiNonBlocking.add(ri);
      }

      if (columnMapped(selections, "job_title") && jobRaw.trim() === "") {
        missJob.add(ri);
      }

      if (
        columnMapped(selections, "company_text") &&
        co.trim() === "" &&
        (hasValidEmailIdentity(emailRaw) || hasLinkedInIdentity(linkedinRaw))
      ) {
        missCompany.add(ri);
      }

      if (
        columnMapped(selections, "email") &&
        emailTrim === "" &&
        (hasLinkedInIdentity(linkedinRaw) || hasFullNameCompanyIdentity(row, selections, co))
      ) {
        missEmail.add(ri);
      }

      if (
        columnMapped(selections, "linkedin_url") &&
        linkedinRaw.trim() === "" &&
        (hasValidEmailIdentity(emailRaw) || hasFullNameCompanyIdentity(row, selections, co))
      ) {
        missLi.add(ri);
      }
    }
  }

  const warnUnion = new Set<number>();
  for (const s of [
    invalidEmailNonBlocking,
    invalidLiNonBlocking,
    missJob,
    missCompany,
    missEmail,
    missLi,
  ]) {
    for (const ri of s) warnUnion.add(ri);
  }

  let fullyValidRows = 0;
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]!;
    if (!rowHasUsableIdentityPath(row, selections)) continue;
    if (dupRow.has(ri)) continue;
    if (warnUnion.has(ri)) continue;
    fullyValidRows += 1;
  }

  const validationRatePercent = totalRows === 0 ? 0 : Math.round((fullyValidRows / totalRows) * 100);
  const continueAllowed = totalRows > 0 && noIdentity.size === 0;

  const issues: ImportValidationIssueBucket[] = [
    {
      kind: "no_usable_identity",
      title: "No usable identity for some rows",
      detail:
        "Each row needs at least one identity path: a valid email, a valid LinkedIn profile URL, or both full name and company. Map the right columns or fix the source file.",
      affectedRowCount: noIdentity.size,
      severity: "must_fix",
      actions: BOTH_ACTIONS,
    },
    {
      kind: "duplicate_email",
      title: "Duplicate email addresses",
      detail:
        "Multiple rows share the same email after normalization (trim + lowercase). Update the file so each row is unique, or merge duplicates before publish.",
      affectedRowCount: dupRow.size,
      severity: "review_recommended",
      actions: [GO_SOURCE],
    },
    {
      kind: "invalid_email_non_blocking",
      title: "Invalid email format (other identity present)",
      detail:
        "Some rows have a bad email value, but another identity path (LinkedIn or name + company) is usable. Fix the email cell or mapping when you want cleaner data.",
      affectedRowCount: invalidEmailNonBlocking.size,
      severity: "review_recommended",
      actions: BOTH_ACTIONS,
    },
    {
      kind: "invalid_linkedin_non_blocking",
      title: "LinkedIn URL format (other identity present)",
      detail:
        "Some rows have a LinkedIn value that does not match the expected URL pattern, but another identity path is usable. Fix the URL or mapping in Source or Mapping.",
      affectedRowCount: invalidLiNonBlocking.size,
      severity: "review_recommended",
      actions: BOTH_ACTIONS,
    },
    {
      kind: "missing_job_title",
      title: "Missing job title",
      detail:
        "Job title is empty where that column is mapped. This does not block continuing; add titles in the file or adjust mappings if you want richer briefings.",
      affectedRowCount: missJob.size,
      severity: "review_recommended",
      actions: BOTH_ACTIONS,
    },
    {
      kind: "missing_company_warning",
      title: "Missing company",
      detail:
        "Company is empty on some rows that use email or LinkedIn as identity. This is a data-quality warning only; add company in the file or map a different column.",
      affectedRowCount: missCompany.size,
      severity: "review_recommended",
      actions: BOTH_ACTIONS,
    },
    {
      kind: "missing_email_warning",
      title: "Missing email",
      detail:
        "Email is empty on some rows that are identified via LinkedIn or name + company. Optional to fix unless you need email for this lead.",
      affectedRowCount: missEmail.size,
      severity: "review_recommended",
      actions: BOTH_ACTIONS,
    },
    {
      kind: "missing_linkedin_warning",
      title: "Missing LinkedIn URL",
      detail:
        "LinkedIn is empty where mapped, while another identity path is present. Add a profile URL in the file if you want it on the record.",
      affectedRowCount: missLi.size,
      severity: "review_recommended",
      actions: BOTH_ACTIONS,
    },
  ];

  return {
    totalRows,
    fullyValidRows,
    rowsWithMustFix: noIdentity.size,
    duplicateEmailRowCount: dupRow.size,
    missingRequiredRowCount: noIdentity.size,
    invalidEmailRowCount: invalidEmailAnyCount,
    validationRatePercent,
    continueAllowed,
    issues,
  };
}
