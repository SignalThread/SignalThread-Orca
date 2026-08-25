/**
 * Attendee CSV import — pure parse/mapping/normalization layer.
 *
 * Reuses the shared import foundation (lib/import) and the Directory identity
 * primitives (normalizeDirectoryEmail / splitFullName). It turns mapped rows into
 * normalized attendee inputs: a Directory identity block + an optional
 * registration block. No DB, no writes — the matching/create/merge against
 * Directory people lives in the attendee service.
 */
import {
  buildInitialMapping,
  buildMappedRows,
  type ImportColumn,
  type ImportFieldSpec,
  type ImportMapping,
  type MappedRow,
  type ParsedSheet,
} from "@/lib/import";
import { normalizeDirectoryEmail, splitFullName } from "@/lib/event-directory-import";

export type AttendeeImportField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "company"
  | "title"
  | "registrationStatus"
  | "registrationType"
  | "badgeType"
  | "ticketType"
  | "externalRegistrationId"
  | "externalPersonId"
  | "provider";

export const ATTENDEE_IMPORT_FIELD_SPECS: ImportFieldSpec<AttendeeImportField>[] = [
  { field: "firstName", label: "First name", synonyms: ["first name", "first", "firstname", "given name", "fname"] },
  { field: "lastName", label: "Last name", synonyms: ["last name", "last", "lastname", "surname", "family name", "lname"] },
  { field: "fullName", label: "Full name", synonyms: ["full name", "name", "attendee name", "contact name", "person"] },
  { field: "email", label: "Email", synonyms: ["email", "e-mail", "email address", "mail"] },
  { field: "phone", label: "Phone", synonyms: ["phone", "phone number", "mobile", "cell", "telephone", "tel"] },
  { field: "company", label: "Company", synonyms: ["company", "organization", "organisation", "org", "employer", "account"] },
  { field: "title", label: "Title", synonyms: ["title", "job title", "role title", "position"] },
  { field: "registrationStatus", label: "Registration status", synonyms: ["registration status", "reg status", "status", "attendee status"] },
  { field: "registrationType", label: "Registration type", synonyms: ["registration type", "reg type", "registration category", "category", "attendee type"] },
  { field: "badgeType", label: "Badge type", synonyms: ["badge type", "badge", "badge category"] },
  { field: "ticketType", label: "Ticket / pass type", synonyms: ["ticket type", "ticket", "pass type", "pass", "ticket/pass"] },
  { field: "externalRegistrationId", label: "External registration ID", synonyms: ["external registration id", "registration id", "reg id", "confirmation number", "confirmation"] },
  { field: "externalPersonId", label: "External person ID", synonyms: ["external person id", "person id", "attendee id", "external id"] },
  { field: "provider", label: "Source / provider", synonyms: ["provider", "source", "registration source", "system"] },
];

export type AttendeeImportDraftRow = Record<AttendeeImportField, string>;

const ALL_FIELDS: AttendeeImportField[] = [
  "firstName", "lastName", "fullName", "email", "phone", "company", "title",
  "registrationStatus", "registrationType", "badgeType", "ticketType",
  "externalRegistrationId", "externalPersonId", "provider",
];

export function buildAttendeeInitialMapping(columns: ImportColumn[]): ImportMapping<AttendeeImportField> {
  return buildInitialMapping(columns, ATTENDEE_IMPORT_FIELD_SPECS);
}

function emptyDraft(): AttendeeImportDraftRow {
  return {
    firstName: "", lastName: "", fullName: "", email: "", phone: "", company: "", title: "",
    registrationStatus: "", registrationType: "", badgeType: "", ticketType: "",
    externalRegistrationId: "", externalPersonId: "", provider: "",
  };
}

export function mappedRowToAttendeeDraft(mapped: MappedRow<AttendeeImportField>): AttendeeImportDraftRow {
  const row = emptyDraft();
  for (const field of ALL_FIELDS) {
    const value = mapped[field];
    if (typeof value === "string") row[field] = value;
  }
  return row;
}

export function buildAttendeeDraftRows(
  sheet: Pick<ParsedSheet, "columns" | "rows">,
  mapping: ImportMapping<AttendeeImportField>,
): { draftRows: AttendeeImportDraftRow[]; rowNumbers: number[] } {
  const mappedRows = buildMappedRows(sheet as ParsedSheet, mapping);
  return {
    draftRows: mappedRows.map(mappedRowToAttendeeDraft),
    rowNumbers: mappedRows.map((row) => row.rowNumber as number),
  };
}

/** Fuzzy-map a free-text CSV registration status to a canonical enum value. */
export function normalizeImportRegistrationStatus(raw: string): string | null {
  const v = raw.replace(/\s+/g, " ").trim().toLowerCase();
  if (!v) return null;
  if (/^reg/.test(v) || v === "confirmed" || v === "complete" || v === "completed") return "REGISTERED";
  if (v.includes("cancel")) return "CANCELLED";
  if (v.includes("waitlist") || v.includes("wait list")) return "WAITLISTED";
  if (v.includes("invite")) return "INVITED";
  if (v.includes("pending") || v.includes("approval")) return "PENDING_APPROVAL";
  if (v.includes("transfer")) return "TRANSFERRED";
  if (v.includes("check") && v.includes("in")) return "CHECKED_IN";
  if (v.includes("no show") || v === "noshow" || v === "no-show") return "NO_SHOW";
  if (v.includes("not registered") || v === "unregistered") return "NOT_REGISTERED";
  return null;
}

function clean(value: string): string | null {
  const t = value.replace(/\s+/g, " ").trim();
  return t.length > 0 ? t : null;
}

export type ParsedAttendeeIdentity = {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  normalizedEmail: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
};

export type ParsedAttendeeRegistration = {
  registrationStatus: string | null;
  registrationType: string | null;
  badgeType: string | null;
  ticketType: string | null;
  externalRegistrationId: string | null;
  externalPersonId: string | null;
  provider: string | null;
};

export type AttendeeRowParseResult =
  | { result: "ok"; identity: ParsedAttendeeIdentity; registration: ParsedAttendeeRegistration }
  | { result: "invalid"; reason: string };

/** Normalize a draft row into identity + registration, or flag INVALID when there
 *  is not enough identity (need email or a usable name). */
export function parseAttendeeImportRow(draft: AttendeeImportDraftRow): AttendeeRowParseResult {
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
  if (!normalizedEmail && !firstName && !lastName && !fullName) {
    return { result: "invalid", reason: "Row needs an email or a name" };
  }
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || fullName || email || "Unnamed attendee";

  return {
    result: "ok",
    identity: {
      firstName,
      lastName,
      displayName,
      email,
      normalizedEmail,
      phone: clean(draft.phone),
      company: clean(draft.company),
      title: clean(draft.title),
    },
    registration: {
      registrationStatus: draft.registrationStatus ? normalizeImportRegistrationStatus(draft.registrationStatus) : null,
      registrationType: clean(draft.registrationType),
      badgeType: clean(draft.badgeType),
      ticketType: clean(draft.ticketType),
      externalRegistrationId: clean(draft.externalRegistrationId),
      externalPersonId: clean(draft.externalPersonId),
      provider: clean(draft.provider),
    },
  };
}
