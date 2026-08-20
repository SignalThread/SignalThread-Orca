import { tokenizeDelimited } from "@/lib/import/csv";

export type AppField =
  | "firstName"
  | "lastName"
  | "email"
  | "title"
  | "company"
  | "phone"
  | "status"
  | "bio"
  | "topics"
  | "avNeeds"
  | "travelNeeds"
  | "dietaryRestrictions"
  | "linkedinUrl"
  | "websiteUrl";
export type FieldSelection = AppField | "";

export type SpeakerCsvMappedRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
  company?: string;
  phone?: string;
  status?: string;
  bio?: string;
  topics?: string;
  avNeeds?: string;
  travelNeeds?: string;
  dietaryRestrictions?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
};

export type ParsedCsvColumn = {
  id: string;
  header: string;
  index: number;
  duplicateHeader: boolean;
  samples: string[];
};

type ParsedCsvRow = {
  rowNumber: number;
  values: string[];
};

export type ParsedCsv = {
  columns: ParsedCsvColumn[];
  rows: ParsedCsvRow[];
  warnings: string[];
};

export const FIELD_OPTIONS: Array<{ value: AppField; label: string; required?: boolean; recommended?: boolean }> = [
  { value: "firstName", label: "First name", required: true },
  { value: "lastName", label: "Last name", required: true },
  { value: "email", label: "Email", recommended: true },
  { value: "title", label: "Title" },
  { value: "company", label: "Company" },
  { value: "phone", label: "Phone" },
  { value: "status", label: "Status" },
  { value: "bio", label: "Bio" },
  { value: "topics", label: "Topics" },
  { value: "avNeeds", label: "AV needs" },
  { value: "travelNeeds", label: "Travel needs" },
  { value: "dietaryRestrictions", label: "Dietary restrictions" },
  { value: "linkedinUrl", label: "LinkedIn URL" },
  { value: "websiteUrl", label: "Website URL" },
];

const HEADER_SYNONYMS: Record<AppField, string[]> = {
  firstName: ["first name", "firstname", "first", "given name", "given", "speaker first"],
  lastName: ["last name", "lastname", "last", "surname", "family name", "speaker last"],
  email: ["email", "email address", "work email", "speaker email", "e-mail"],
  title: ["title", "job title", "role", "speaker title"],
  company: ["company", "company name", "organization", "organisation", "org", "employer"],
  phone: ["phone", "phone number", "mobile", "cell", "telephone"],
  status: ["status", "speaker status"],
  bio: ["bio", "biography", "speaker bio", "description"],
  topics: ["topics", "topic", "expertise", "subjects", "speaking topics"],
  avNeeds: ["av needs", "av", "audio visual", "av requirements", "tech needs"],
  travelNeeds: ["travel needs", "travel", "travel requirements", "travel notes"],
  dietaryRestrictions: ["dietary restrictions", "dietary", "diet", "food restrictions", "allergies"],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin profile"],
  websiteUrl: ["website", "website url", "web site", "personal site", "url"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function suggestField(header: string, alreadyMapped: Set<AppField>): FieldSelection {
  const normalized = normalizeHeader(header);
  const suggestion = FIELD_OPTIONS.find((field) =>
    HEADER_SYNONYMS[field.value].some((candidate) => normalizeHeader(candidate) === normalized),
  );

  if (!suggestion || alreadyMapped.has(suggestion.value)) {
    return "";
  }

  alreadyMapped.add(suggestion.value);
  return suggestion.value;
}

export function parseCsvText(text: string): ParsedCsv {
  // Shared CSV tokenizer (handles quotes, escaped quotes, CRLF/CR/LF, BOM).
  const rows: ParsedCsvRow[] = tokenizeDelimited(text);

  const headerRowIndex = rows.findIndex((candidate) => candidate.values.some((value) => value.trim()));
  if (headerRowIndex === -1) {
    throw new Error("CSV is empty.");
  }

  const headerRow = rows[headerRowIndex];
  const dataRows = rows.slice(headerRowIndex + 1);
  const warnings: string[] = [];
  const headerCounts = new Map<string, number>();
  const headers = headerRow.values.map((header, index) => {
    const trimmed = header.trim() || `Column ${index + 1}`;
    const normalized = normalizeHeader(trimmed);
    headerCounts.set(normalized, (headerCounts.get(normalized) ?? 0) + 1);
    return trimmed;
  });

  const malformedRows = dataRows.filter((candidate) => candidate.values.length > headers.length && candidate.values.some((value) => value.trim()));
  if (malformedRows.length > 0) {
    throw new Error(`Malformed CSV: row ${malformedRows[0]!.rowNumber} has more values than headers.`);
  }

  const duplicateHeaders = new Set(
    [...headerCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([header]) => header),
  );
  if (duplicateHeaders.size > 0) {
    warnings.push("Duplicate CSV headers detected. Columns are kept separate; review mappings carefully.");
  }

  const columns = headers.map((header, index) => {
    const samples = dataRows
      .map((candidate) => candidate.values[index]?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 10);

    return {
      id: `${index}:${header}`,
      header,
      index,
      duplicateHeader: duplicateHeaders.has(normalizeHeader(header)),
      samples,
    };
  });

  return {
    columns,
    rows: dataRows,
    warnings,
  };
}

export function buildInitialMapping(columns: ParsedCsvColumn[]): Record<string, FieldSelection> {
  const mappedFields = new Set<AppField>();
  return Object.fromEntries(columns.map((column) => [column.id, suggestField(column.header, mappedFields)]));
}

export function validateMappings(mapping: Record<string, FieldSelection>): string[] {
  const selectedFields = Object.values(mapping).filter(Boolean) as AppField[];
  const duplicateFields = selectedFields.filter((field, index) => selectedFields.indexOf(field) !== index);
  const errors: string[] = [];

  if (!selectedFields.includes("firstName")) {
    errors.push("Map one column to First name.");
  }

  if (!selectedFields.includes("lastName")) {
    errors.push("Map one column to Last name.");
  }

  if (duplicateFields.length > 0) {
    errors.push(`Each app field can only be mapped once. Duplicate mappings: ${[...new Set(duplicateFields)].join(", ")}.`);
  }

  return errors;
}

export function buildMappedRows(parsedCsv: ParsedCsv, mapping: Record<string, FieldSelection>): SpeakerCsvMappedRow[] {
  const fieldByColumnIndex = new Map<number, AppField>();
  for (const column of parsedCsv.columns) {
    const field = mapping[column.id];
    if (field) fieldByColumnIndex.set(column.index, field);
  }

  return parsedCsv.rows
    .filter((row) => row.values.some((value) => value.trim()))
    .map((row) => {
      const mapped: SpeakerCsvMappedRow = {
        rowNumber: row.rowNumber,
        firstName: "",
        lastName: "",
      };

      for (const [columnIndex, field] of fieldByColumnIndex.entries()) {
        const value = row.values[columnIndex]?.trim() ?? "";
        if (field === "email") mapped.email = value.toLowerCase();
        if (field === "firstName") mapped.firstName = value;
        if (field === "lastName") mapped.lastName = value;
        if (field === "title") mapped.title = value;
        if (field === "company") mapped.company = value;
        if (field === "phone") mapped.phone = value;
        if (field === "status") mapped.status = value;
        if (field === "bio") mapped.bio = value;
        if (field === "topics") mapped.topics = value;
        if (field === "avNeeds") mapped.avNeeds = value;
        if (field === "travelNeeds") mapped.travelNeeds = value;
        if (field === "dietaryRestrictions") mapped.dietaryRestrictions = value;
        if (field === "linkedinUrl") mapped.linkedinUrl = value;
        if (field === "websiteUrl") mapped.websiteUrl = value;
      }

      return mapped;
    });
}
