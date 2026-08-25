// Client-side CSV parsing + field mapping for marketing audience imports.
// Thin adapter over the shared import foundation (@/lib/import) configured with
// the marketing recipient field spec. Behavior (email required, 6 sample values,
// no duplicate-header warning, email kept as-entered) is preserved; the CSV
// tokenizer, sheet shaping, synonym matching, and row building are shared.

import {
  buildInitialMapping as foundationBuildInitialMapping,
  buildMappedRows as foundationBuildMappedRows,
  type ImportFieldSpec,
  parseCsv,
} from "@/lib/import/mapping";

export type AudienceField =
  | "firstName"
  | "lastName"
  | "email"
  | "company"
  | "title"
  | "registrationType"
  | "status";

export type FieldSelection = AudienceField | "";

export type AudienceMappedRow = {
  rowNumber: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  title?: string;
  registrationType?: string;
  status?: string;
};

export type ParsedCsvColumn = {
  id: string;
  header: string;
  index: number;
  samples: string[];
};

type ParsedCsvRow = { rowNumber: number; values: string[] };

export type ParsedCsv = {
  columns: ParsedCsvColumn[];
  rows: ParsedCsvRow[];
  warnings: string[];
};

export const FIELD_OPTIONS: Array<{ value: AudienceField; label: string; required?: boolean }> = [
  { value: "email", label: "Email", required: true },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "company", label: "Company" },
  { value: "title", label: "Title" },
  { value: "registrationType", label: "Registration type" },
  { value: "status", label: "Status" },
];

const HEADER_SYNONYMS: Record<AudienceField, string[]> = {
  firstName: ["first name", "firstname", "first", "given name", "given"],
  lastName: ["last name", "lastname", "last", "surname", "family name"],
  email: ["email", "email address", "work email", "e-mail"],
  company: ["company", "company name", "organization", "organisation", "org", "employer"],
  title: ["title", "job title", "role"],
  registrationType: ["registration type", "reg type", "ticket type", "registrationtype", "type"],
  status: ["status", "registration status", "reg status"],
};

const FIELD_SPECS: ImportFieldSpec<AudienceField>[] = FIELD_OPTIONS.map((option) => ({
  field: option.value,
  label: option.label,
  required: option.required,
  synonyms: HEADER_SYNONYMS[option.value],
}));

export function parseCsvText(text: string): ParsedCsv {
  const sheet = parseCsv(text, { sampleLimit: 6, warnOnDuplicateHeaders: false });
  return {
    columns: sheet.columns.map((column) => ({
      id: column.id,
      header: column.header,
      index: column.index,
      samples: column.samples,
    })),
    rows: sheet.rows,
    warnings: sheet.warnings,
  };
}

export function buildInitialMapping(columns: ParsedCsvColumn[]): Record<string, FieldSelection> {
  return foundationBuildInitialMapping(
    columns.map((column) => ({ ...column, duplicateHeader: false })),
    FIELD_SPECS,
  );
}

export function validateMappings(mapping: Record<string, FieldSelection>): string[] {
  const selectedFields = Object.values(mapping).filter(Boolean) as AudienceField[];
  const duplicateFields = selectedFields.filter((field, index) => selectedFields.indexOf(field) !== index);
  const errors: string[] = [];
  if (!selectedFields.includes("email")) errors.push("Map one column to Email.");
  if (duplicateFields.length > 0) {
    errors.push(`Each field can only be mapped once. Duplicates: ${[...new Set(duplicateFields)].join(", ")}.`);
  }
  return errors;
}

export function buildMappedRows(parsedCsv: ParsedCsv, mapping: Record<string, FieldSelection>): AudienceMappedRow[] {
  return foundationBuildMappedRows(
    { columns: parsedCsv.columns.map((column) => ({ ...column, duplicateHeader: false })), rows: parsedCsv.rows },
    mapping,
  );
}
