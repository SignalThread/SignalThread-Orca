/**
 * Derived UI state for Import Wizard → Field Mapping.
 *
 * Identity-path gating (unchanged):
 *   Continue is enabled when at least one usable identity path is satisfied:
 *     1. email (alone)
 *     2. linkedin_url (alone)
 *     3. full_name (or first_name + last_name) + company_text together
 *
 *   Job Title never blocks Continue.
 *   full_name alone or company_text alone is not enough.
 *
 * Column classification badges:
 *   canonical  — mapped to a predefined canonical field (non-duplicate)
 *   custom     — mapped to a user-defined custom field (non-duplicate)
 *   conflict   — two or more source columns map to the same target
 *   unmapped   — no mapping assigned
 *
 * Field coverage %: source columns mapped to canonical fields / total source columns.
 */

import {
  ALL_LEAD_IMPORT_OPTIONS,
  type LeadImportCanonicalKey,
  labelForLeadImportKey,
} from "@/lib/import-wizard/lead-import-field-contract";
import { isCustomMappingValue, parseCustomStorageKey } from "@/lib/import-wizard/custom-field-mapping";

export type MappingRowStatus = "canonical" | "custom" | "conflict" | "unmapped";

export type FieldMappingSourceRow = {
  id: string;
  sourceColumn: string;
};

export type IdentityPath = "email" | "linkedin_url" | "full_name_company";

export type MappingWarning = {
  field: LeadImportCanonicalKey;
  label: string;
};

export type FieldMappingDerivedState = {
  rowStatusById: Record<string, MappingRowStatus>;

  /** Source columns mapped to a predefined canonical field (non-duplicate). */
  canonicalMappedCount: number;
  /** Source columns mapped to a custom field (non-duplicate). */
  customMappedCount: number;
  /** Total source columns in the uploaded file. */
  totalSourceColumns: number;
  /**
   * Field coverage: proportion of source columns mapped to predefined canonical fields.
   * Formula: Math.round(canonicalMappedCount / totalSourceColumns * 100).
   */
  fieldCoveragePercent: number;

  /** Which canonical keys have exactly one non-duplicate mapping. */
  canonicalKeysMapped: LeadImportCanonicalKey[];
  duplicateCanonicalTargets: LeadImportCanonicalKey[];
  unmappedSourceCount: number;
  mappedSourceCount: number;

  /** Identity gating: true when at least one identity path is satisfied. */
  continueAllowed: boolean;
  /** Which identity paths are currently satisfied. */
  satisfiedIdentityPaths: IdentityPath[];
  /** Canonical fields that are missing but only warrant a warning (not blocking). */
  warnings: MappingWarning[];
};

/** The canonical keys that participate in identity gating. */
const IDENTITY_KEYS: readonly LeadImportCanonicalKey[] = [
  "email",
  "linkedin_url",
  "full_name",
  "first_name",
  "last_name",
  "company_text",
];

/** All canonical keys shown in the dropdown. */
const ALL_CANONICAL_KEYS = ALL_LEAD_IMPORT_OPTIONS;

function isEmptySelection(value: string | undefined): boolean {
  return value == null || value.trim() === "";
}

function isCanonicalSelection(v: string): v is LeadImportCanonicalKey {
  return (ALL_LEAD_IMPORT_OPTIONS as readonly string[]).includes(v);
}

function hasUniqueMapping(
  key: LeadImportCanonicalKey,
  canonicalToSourceIds: Map<LeadImportCanonicalKey, string[]>,
  duplicateCanonicals: Set<LeadImportCanonicalKey>
): boolean {
  const ids = canonicalToSourceIds.get(key);
  return ids != null && ids.length === 1 && !duplicateCanonicals.has(key);
}

export function deriveFieldMappingUi(
  selections: Record<string, string>,
  sourceRows: readonly FieldMappingSourceRow[]
): FieldMappingDerivedState {
  const canonicalToSourceIds = new Map<LeadImportCanonicalKey, string[]>();
  const customKeyToSourceIds = new Map<string, string[]>();

  for (const row of sourceRows) {
    const sel = selections[row.id] ?? "";
    if (isEmptySelection(sel)) continue;
    if (isCanonicalSelection(sel)) {
      const list = canonicalToSourceIds.get(sel) ?? [];
      list.push(row.id);
      canonicalToSourceIds.set(sel, list);
    } else if (isCustomMappingValue(sel)) {
      const ck = parseCustomStorageKey(sel);
      if (ck) {
        const list = customKeyToSourceIds.get(ck) ?? [];
        list.push(row.id);
        customKeyToSourceIds.set(ck, list);
      }
    }
  }

  const duplicateCanonicals = new Set<LeadImportCanonicalKey>(
    [...canonicalToSourceIds.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([k]) => k)
  );

  const duplicateCustomKeys = new Set<string>(
    [...customKeyToSourceIds.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([k]) => k)
  );

  // --- Row statuses ---
  const rowStatusById: Record<string, MappingRowStatus> = {};
  let canonicalMappedCount = 0;
  let customMappedCount = 0;

  for (const row of sourceRows) {
    const sel = selections[row.id] ?? "";

    if (isEmptySelection(sel)) {
      rowStatusById[row.id] = "unmapped";
      continue;
    }

    if (isCanonicalSelection(sel)) {
      if (duplicateCanonicals.has(sel)) {
        rowStatusById[row.id] = "conflict";
      } else {
        rowStatusById[row.id] = "canonical";
        canonicalMappedCount += 1;
      }
      continue;
    }

    if (isCustomMappingValue(sel)) {
      const ck = parseCustomStorageKey(sel);
      if (!ck) {
        rowStatusById[row.id] = "conflict";
        continue;
      }
      if (duplicateCustomKeys.has(ck)) {
        rowStatusById[row.id] = "conflict";
      } else {
        rowStatusById[row.id] = "custom";
        customMappedCount += 1;
      }
      continue;
    }

    rowStatusById[row.id] = "conflict";
  }

  // --- Canonical coverage ---
  const canonicalKeysMapped: LeadImportCanonicalKey[] = [];
  for (const key of ALL_CANONICAL_KEYS) {
    if (hasUniqueMapping(key, canonicalToSourceIds, duplicateCanonicals)) {
      canonicalKeysMapped.push(key);
    }
  }

  const totalSourceColumns = sourceRows.length;
  const fieldCoveragePercent =
    totalSourceColumns === 0
      ? 0
      : Math.round((canonicalMappedCount / totalSourceColumns) * 100);

  // --- Identity gating ---
  const has = (k: LeadImportCanonicalKey) => hasUniqueMapping(k, canonicalToSourceIds, duplicateCanonicals);

  const hasEmail = has("email");
  const hasLinkedin = has("linkedin_url");
  const hasFullName = has("full_name") || (has("first_name") && has("last_name"));
  const hasCompany = has("company_text");
  const hasNameCompany = hasFullName && hasCompany;

  const satisfiedIdentityPaths: IdentityPath[] = [];
  if (hasEmail) satisfiedIdentityPaths.push("email");
  if (hasLinkedin) satisfiedIdentityPaths.push("linkedin_url");
  if (hasNameCompany) satisfiedIdentityPaths.push("full_name_company");

  const continueAllowed = satisfiedIdentityPaths.length > 0;

  // --- Warnings for missing but non-blocking canonical fields ---
  const warnings: MappingWarning[] = [];

  if (!has("job_title")) {
    warnings.push({ field: "job_title", label: labelForLeadImportKey("job_title") });
  }
  if (!hasCompany && !hasNameCompany) {
    warnings.push({ field: "company_text", label: labelForLeadImportKey("company_text") });
  }
  if (!hasLinkedin) {
    warnings.push({ field: "linkedin_url", label: labelForLeadImportKey("linkedin_url") });
  }
  if (!hasEmail && continueAllowed) {
    warnings.push({ field: "email", label: labelForLeadImportKey("email") });
  }

  const unmappedSourceCount = sourceRows.filter((r) => rowStatusById[r.id] === "unmapped").length;
  const mappedSourceCount = sourceRows.filter((r) => !isEmptySelection(selections[r.id])).length;

  return {
    rowStatusById,
    canonicalMappedCount,
    customMappedCount,
    totalSourceColumns,
    fieldCoveragePercent,
    canonicalKeysMapped,
    duplicateCanonicalTargets: [...duplicateCanonicals],
    unmappedSourceCount,
    mappedSourceCount,
    continueAllowed,
    satisfiedIdentityPaths,
    warnings,
  };
}

const IDENTITY_PATH_LABELS: Record<IdentityPath, string> = {
  email: "Email",
  linkedin_url: "LinkedIn URL",
  full_name_company: "Full Name + Company",
};

export function fieldCoverageSummaryText(derived: FieldMappingDerivedState): string {
  const parts: string[] = [];

  parts.push(
    `${derived.canonicalMappedCount} of ${derived.totalSourceColumns} column(s) mapped to canonical fields.`
  );

  if (derived.customMappedCount > 0) {
    parts.push(`${derived.customMappedCount} mapped to custom field(s).`);
  }

  if (derived.unmappedSourceCount > 0) {
    parts.push(`${derived.unmappedSourceCount} unmapped.`);
  }

  if (derived.duplicateCanonicalTargets.length > 0) {
    parts.push(
      `Conflicts: ${derived.duplicateCanonicalTargets.map((k) => labelForLeadImportKey(k)).join(", ")}.`
    );
  }

  return parts.join(" ");
}

export function identityReadinessSummaryText(derived: FieldMappingDerivedState): string {
  if (!derived.continueAllowed) {
    return "No usable identity path mapped. Map at least Email, LinkedIn URL, or Full Name (or First + Last) + Company to continue.";
  }

  const paths = derived.satisfiedIdentityPaths.map((p) => IDENTITY_PATH_LABELS[p]).join(", ");
  const warnText =
    derived.warnings.length > 0
      ? ` Missing (warning only): ${derived.warnings.map((w) => w.label).join(", ")}.`
      : "";

  return `Identity: ${paths}.${warnText}`;
}

export function mappingSnapshotText(derived: FieldMappingDerivedState): string {
  if (!derived.continueAllowed) {
    return "No identity path mapped. Map Email, LinkedIn URL, or Full Name (or First + Last) + Company.";
  }
  const paths = derived.satisfiedIdentityPaths.map((p) => IDENTITY_PATH_LABELS[p]).join(", ");
  const warnCount = derived.warnings.length;
  return `Identity: ${paths}. ${derived.canonicalKeysMapped.length} canonical field(s) mapped.${warnCount > 0 ? ` ${warnCount} warning(s).` : ""}`;
}

/**
 * A target can only be assigned once. This keeps accidental duplicate mappings
 * out of the persisted state while still allowing First Name and Last Name to
 * be mapped together because they are distinct canonical targets.
 */
export function assignFieldMappingSelection(
  selections: Record<string, string>,
  sourceId: string,
  next: string
): Record<string, string> {
  if (!isCanonicalSelection(next)) {
    return { ...selections, [sourceId]: next };
  }

  const result: Record<string, string> = { ...selections };
  for (const [id, value] of Object.entries(result)) {
    if (id !== sourceId && value === next) result[id] = "";
  }
  result[sourceId] = next;
  return result;
}

/** Continue gate: at least one identity path satisfied. */
export function isFieldMappingReady(derived: FieldMappingDerivedState): boolean {
  return derived.continueAllowed;
}
