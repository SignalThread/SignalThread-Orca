import "server-only";

import { apolloJsonRequestHeaders, normalizeApolloApiKey } from "@/lib/integrations/apollo/api-key";
import { APOLLO_API_BASE } from "@/lib/integrations/apollo/constants";

/**
 * Filters for Apollo People Search (`POST /mixed_people/api_search`).
 * Extend as product needs; unknown keys are ignored by Apollo.
 */
export type ApolloPeopleSearchFilters = {
  q_keywords?: string;
  person_titles?: string[];
  person_locations?: string[];
  organization_locations?: string[];
  page?: number;
  per_page?: number;
};

/**
 * Normalized row for list import / uploads. Search does not return email or phone.
 */
export type ApolloListImportRow = {
  source: "apollo_search";
  apollo_person_id: string | null;
  full_name: string | null;
  job_title: string | null;
  company_text: string | null;
  linkedin_url: string | null;
  email: null;
  phone: null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizePersonToImportRow(person: Record<string, unknown>): ApolloListImportRow {
  const org = asRecord(person.organization);
  const first = asString(person.first_name);
  const lastObf = asString(person.last_name_obfuscated);
  const last = asString(person.last_name);
  const fullName =
    [first, last ?? lastObf].filter(Boolean).join(" ").trim() || asString(person.name) || null;

  return {
    source: "apollo_search",
    apollo_person_id: asString(person.id),
    full_name: fullName,
    job_title: asString(person.title),
    company_text: asString(org?.name),
    linkedin_url: asString(person.linkedin_url),
    email: null,
    phone: null,
  };
}

export type ApolloPeopleSearchResult = {
  people: ApolloListImportRow[];
  total_entries: number | null;
  page: number;
  per_page: number;
  raw: Record<string, unknown>;
};

/**
 * Calls Apollo People Search and maps results into list-import rows (no email/phone).
 */
export async function searchApolloPeople(
  apiKey: string,
  filters: ApolloPeopleSearchFilters
): Promise<ApolloPeopleSearchResult> {
  const trimmed = normalizeApolloApiKey(String(apiKey ?? ""));
  if (!trimmed) {
    throw new Error("Apollo API key is missing.");
  }

  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(100, Math.max(1, filters.per_page ?? 25));

  const body: Record<string, unknown> = {
    page,
    per_page: perPage,
  };
  if (filters.q_keywords) body.q_keywords = filters.q_keywords;
  if (filters.person_titles?.length) body.person_titles = filters.person_titles;
  if (filters.person_locations?.length) body.person_locations = filters.person_locations;
  if (filters.organization_locations?.length) {
    body.organization_locations = filters.organization_locations;
  }

  const response = await fetch(`${APOLLO_API_BASE}/mixed_people/api_search`, {
    method: "POST",
    headers: apolloJsonRequestHeaders(trimmed),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = { parse_error: true };
  }

  if (!response.ok) {
    const errMsg = asString(payload.error) ?? asString(payload.message);
    throw new Error(errMsg ?? `Apollo People Search failed with HTTP ${response.status}.`);
  }

  const rawPeople = payload.people;
  const people: ApolloListImportRow[] = [];
  if (Array.isArray(rawPeople)) {
    for (const item of rawPeople) {
      const rec = asRecord(item);
      if (rec) people.push(normalizePersonToImportRow(rec));
    }
  }

  return {
    people,
    total_entries: typeof payload.total_entries === "number" ? payload.total_entries : null,
    page,
    per_page: perPage,
    raw: payload,
  };
}
