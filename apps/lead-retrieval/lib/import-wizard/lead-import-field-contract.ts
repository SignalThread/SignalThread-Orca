/**
 * Canonical lead import targets aligned with `leads` insert / exhibitor create API.
 * Keys are stable DB column names; labels are UI-only.
 */

export type LeadImportCanonicalKey =
  | "full_name"
  /** Import-only name component; materialized into `leads.full_name`. */
  | "first_name"
  /** Import-only name component; materialized into `leads.full_name`. */
  | "last_name"
  | "email"
  | "job_title"
  | "company_text"
  | "linkedin_url"
  | "company_domain"
  | "industry"
  | "company_size"
  | "seniority"
  | "intent_signals"
  | "priority_score"
  | "rating"
  | "status"
  | "follow_up_date";

export const REQUIRED_LEAD_IMPORT_KEYS = ["full_name", "email", "job_title", "company_text"] as const satisfies readonly LeadImportCanonicalKey[];

export const OPTIONAL_LEAD_IMPORT_KEYS = [
  "linkedin_url",
  "company_domain",
  "industry",
  "company_size",
  "seniority",
  "intent_signals",
  "priority_score",
  "rating",
  "status",
  "follow_up_date",
] as const satisfies readonly LeadImportCanonicalKey[];

export const LEAD_IMPORT_FIELD_LABELS: Record<LeadImportCanonicalKey, string> = {
  full_name: "Full Name",
  first_name: "First Name",
  last_name: "Last Name",
  email: "Email",
  job_title: "Job Title",
  company_text: "Company",
  linkedin_url: "LinkedIn URL",
  company_domain: "Company website",
  industry: "Industry",
  company_size: "Company size",
  seniority: "Seniority",
  intent_signals: "Intent signals",
  priority_score: "Priority score",
  rating: "Rating",
  status: "Status",
  follow_up_date: "Follow-up date",
};

/** Dropdown order: required block, then optional. */
export const ALL_LEAD_IMPORT_OPTIONS: readonly LeadImportCanonicalKey[] = [
  "full_name",
  "first_name",
  "last_name",
  ...REQUIRED_LEAD_IMPORT_KEYS.filter((key) => key !== "full_name"),
  ...OPTIONAL_LEAD_IMPORT_KEYS,
];

export function isRequiredLeadImportKey(k: string): k is (typeof REQUIRED_LEAD_IMPORT_KEYS)[number] {
  return (REQUIRED_LEAD_IMPORT_KEYS as readonly string[]).includes(k);
}

export function isOptionalLeadImportKey(k: string): k is (typeof OPTIONAL_LEAD_IMPORT_KEYS)[number] {
  return (OPTIONAL_LEAD_IMPORT_KEYS as readonly string[]).includes(k);
}

export function labelForLeadImportKey(key: LeadImportCanonicalKey): string {
  return LEAD_IMPORT_FIELD_LABELS[key];
}
