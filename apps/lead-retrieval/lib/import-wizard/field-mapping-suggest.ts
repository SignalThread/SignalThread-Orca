import {
  ALL_LEAD_IMPORT_OPTIONS,
  type LeadImportCanonicalKey,
} from "@/lib/import-wizard/lead-import-field-contract";

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ");
}

/** Header substring / alias → canonical key (first match wins per column). */
const PATTERNS: { key: LeadImportCanonicalKey; test: (n: string) => boolean }[] = [
  { key: "first_name", test: (n) => /^(first name|first|fname|first_name|given name|given_name)$/.test(n) },
  { key: "last_name", test: (n) => /^(last name|last|lname|last_name|surname|family name|family_name)$/.test(n) },
  { key: "full_name", test: (n) => /^(full name|name|contact name|lead name|contact_name|lead_name)$/.test(n) || n.includes("full name") },
  { key: "email", test: (n) => n.includes("email") || n === "e mail" },
  { key: "job_title", test: (n) => /(job|title|role|position)/.test(n) && !n.includes("company") },
  { key: "linkedin_url", test: (n) => n.includes("linkedin") },
  { key: "company_domain", test: (n) => /(company\s*domain|website|web\s*site|domain)/.test(n) && !n.includes("email") },
  { key: "company_text", test: (n) => /(company|organization|organisation|account)/.test(n) && !/(domain|website)/.test(n) },
  { key: "industry", test: (n) => n.includes("industry") || n.includes("vertical") },
  { key: "company_size", test: (n) => /(company\s*size|headcount|employees|#?\s*employees)/.test(n) },
  { key: "seniority", test: (n) => n.includes("seniority") || n.includes("management level") },
  { key: "intent_signals", test: (n) => /\bintent\b/.test(n) || n.includes("intent signal") || n.includes("buying intent") },
  { key: "priority_score", test: (n) => n.includes("priority") },
  { key: "rating", test: (n) => /^rating$/.test(n) || n === "score" },
  { key: "status", test: (n) => /^status$/.test(n) || n === "lead status" },
  { key: "follow_up_date", test: (n) => /(follow\s*up|followup|next\s*step)/.test(n) && n.includes("date") },
];

/**
 * Source-schema-aware options for the mapping UI. Full Name is always useful
 * for a manually-labelled contact column; component targets appear only when
 * incoming headers identify that component. This applies to Sheets and files
 * because both sources enter the same FieldMappingStep.
 */
export function availableLeadImportOptionsForHeaders(headers: readonly string[]): readonly LeadImportCanonicalKey[] {
  const hasFirstName = headers.some((header) => PATTERNS[0]!.test(norm(header)));
  const hasLastName = headers.some((header) => PATTERNS[1]!.test(norm(header)));
  const nameOptions: LeadImportCanonicalKey[] = ["full_name"];
  if (hasFirstName) nameOptions.push("first_name");
  if (hasLastName) nameOptions.push("last_name");
  return [
    ...nameOptions,
    ...ALL_LEAD_IMPORT_OPTIONS.filter((key) => !["full_name", "first_name", "last_name"].includes(key)),
  ];
}

/**
 * One suggested canonical target per source column index; may duplicate — caller dedupes or user fixes.
 */
export function suggestMappingsFromHeaders(headers: string[]): Record<string, string> {
  const selections: Record<string, string> = {};
  headers.forEach((h, idx) => {
    const id = String(idx);
    const n = norm(h);
    if (!n) {
      selections[id] = "";
      return;
    }
    let found: LeadImportCanonicalKey | "" = "";
    for (const { key, test } of PATTERNS) {
      if (test(n)) {
        found = key;
        break;
      }
    }
    selections[id] = found;
  });
  return selections;
}

/** Remove duplicate assignments keeping first occurrence in column order. */
export function dedupeSuggestedMappings(selections: Record<string, string>): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  const keys = Object.keys(selections).sort((a, b) => Number(a) - Number(b));
  for (const id of keys) {
    const v = selections[id] ?? "";
    if (!v.trim()) {
      out[id] = "";
      continue;
    }
    if (used.has(v)) {
      out[id] = "";
      continue;
    }
    used.add(v);
    out[id] = v;
  }
  return out;
}
