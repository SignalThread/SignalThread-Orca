/**
 * Event Directory CSV import — pure parse/mapping/normalization layer.
 *
 * Reuses the shared import foundation (lib/import) for header detection and
 * field mapping. The actual create/update/merge against the DB lives in the
 * event-directory service; this module only turns mapped rows into normalized,
 * validated directory inputs (no DB, no writes).
 */
import {
  buildInitialMapping,
  buildMappedRows,
  validateMapping,
  type ImportColumn,
  type ImportFieldSpec,
  type ImportMapping,
  type MappedRow,
  type ParsedSheet,
} from "@/lib/import";

export type DirectoryImportField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "company"
  | "title";

export const DIRECTORY_IMPORT_FIELD_SPECS: ImportFieldSpec<DirectoryImportField>[] = [
  { field: "firstName", label: "First name", synonyms: ["first name", "first", "firstname", "given name", "fname"] },
  { field: "lastName", label: "Last name", synonyms: ["last name", "last", "lastname", "surname", "family name", "lname"] },
  { field: "fullName", label: "Full name", synonyms: ["full name", "name", "contact name", "fullname", "attendee name", "person"] },
  { field: "email", label: "Email", synonyms: ["email", "e-mail", "email address", "mail"] },
  { field: "phone", label: "Phone", synonyms: ["phone", "phone number", "mobile", "cell", "telephone", "tel"] },
  { field: "company", label: "Company", synonyms: ["company", "organization", "organisation", "org", "employer", "account"] },
  { field: "title", label: "Title", synonyms: ["title", "job title", "role title", "position"] },
];

export type DirectoryImportDraftRow = Record<DirectoryImportField, string>;

export function buildDirectoryInitialMapping(columns: ImportColumn[]): ImportMapping<DirectoryImportField> {
  return buildInitialMapping(columns, DIRECTORY_IMPORT_FIELD_SPECS);
}

export function validateDirectoryMapping(mapping: ImportMapping<DirectoryImportField>): string[] {
  // No single field is required at the mapping level — identity is checked per row
  // (email OR a usable name). validateMapping still catches double-mapped fields.
  return validateMapping(mapping, DIRECTORY_IMPORT_FIELD_SPECS);
}

const ALL_FIELDS: DirectoryImportField[] = ["firstName", "lastName", "fullName", "email", "phone", "company", "title"];

function emptyDraftRow(): DirectoryImportDraftRow {
  return { firstName: "", lastName: "", fullName: "", email: "", phone: "", company: "", title: "" };
}

export function mappedRowToDirectoryDraft(mapped: MappedRow<DirectoryImportField>): DirectoryImportDraftRow {
  const row = emptyDraftRow();
  for (const field of ALL_FIELDS) {
    const value = mapped[field];
    if (typeof value === "string") row[field] = value;
  }
  return row;
}

export function buildDirectoryDraftRows(
  sheet: Pick<ParsedSheet, "columns" | "rows">,
  mapping: ImportMapping<DirectoryImportField>,
): { draftRows: DirectoryImportDraftRow[]; rowNumbers: number[] } {
  const mappedRows = buildMappedRows(sheet as ParsedSheet, mapping);
  return {
    draftRows: mappedRows.map(mappedRowToDirectoryDraft),
    rowNumbers: mappedRows.map((row) => row.rowNumber as number),
  };
}

/** Split a full name into first/last (first token = first name, remainder = last). */
export function splitFullName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export type ParsedDirectoryRow = {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  normalizedEmail: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
};

export type DirectoryRowParseResult =
  | { result: "ok"; parsed: ParsedDirectoryRow }
  | { result: "invalid"; reason: string };

/** Lowercase + trim an email for deterministic matching; null when empty/invalid-ish. */
export function normalizeDirectoryEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  // Lightweight shape check; full validation belongs to import/route validators.
  if (!trimmed.includes("@") || trimmed.startsWith("@") || trimmed.endsWith("@")) return null;
  return trimmed;
}

function clean(value: string): string | null {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalize a mapped draft row into a directory input, or flag it INVALID when
 * there is not enough identity (need email OR a usable name).
 */
export function parseDirectoryImportRow(draft: DirectoryImportDraftRow): DirectoryRowParseResult {
  let firstName = clean(draft.firstName);
  let lastName = clean(draft.lastName);
  const fullName = clean(draft.fullName);
  if ((!firstName || !lastName) && fullName) {
    const split = splitFullName(fullName);
    firstName = firstName ?? split.firstName;
    lastName = lastName ?? split.lastName;
  }
  const email = clean(draft.email);
  const normalizedEmail = normalizeDirectoryEmail(email);
  const company = clean(draft.company);
  const phone = clean(draft.phone);
  const title = clean(draft.title);

  const hasName = Boolean(firstName || lastName || fullName);
  if (!normalizedEmail && !hasName) {
    return { result: "invalid", reason: "Row needs an email or a name" };
  }
  // If an email column was provided but malformed (non-empty, no '@'), flag it.
  if (email && !normalizedEmail && !hasName) {
    return { result: "invalid", reason: "Email is not valid" };
  }

  const displayName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || fullName || email || "Unnamed contact";

  return {
    result: "ok",
    parsed: { firstName, lastName, displayName, email, normalizedEmail, phone, company, title },
  };
}
