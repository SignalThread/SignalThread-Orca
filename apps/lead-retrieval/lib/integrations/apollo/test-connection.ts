import "server-only";

import { normalizeApolloApiKey, apolloJsonRequestHeaders } from "@/lib/integrations/apollo/api-key";
import { APOLLO_API_BASE } from "@/lib/integrations/apollo/constants";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = await response.json();
    return asRecord(data);
  } catch {
    return null;
  }
}

export type ApolloEnrichmentTestStatus = "available" | "invalid_key" | "no_access" | "error";

export type ApolloSearchTestStatus =
  | "available"
  | "invalid_key"
  | "requires_master_key"
  | "no_access"
  | "error"
  | "skipped";

export type ApolloConnectionTestResult = {
  enrichment: { status: ApolloEnrichmentTestStatus; detail?: string };
  search: { status: ApolloSearchTestStatus; detail?: string };
};

/**
 * People Enrichment: POST /api/v1/people/match (same as production enrichment).
 */
async function testPeopleEnrichment(apiKey: string): Promise<ApolloConnectionTestResult["enrichment"]> {
  const params = new URLSearchParams();
  params.set("email", "apollo-connection-test@invalid.invalid");

  const response = await fetch(`${APOLLO_API_BASE}/people/match?${params.toString()}`, {
    method: "POST",
    headers: apolloJsonRequestHeaders(apiKey),
    body: "{}",
    cache: "no-store",
  });

  const payload = await parseJsonSafe(response);

  if (response.status === 401) {
    return { status: "invalid_key", detail: "Invalid API key (401)." };
  }

  if (response.status === 403) {
    return {
      status: "no_access",
      detail: String(payload?.error ?? payload?.message ?? "Forbidden (403)."),
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      detail: String(payload?.error ?? payload?.message ?? `HTTP ${response.status}`),
    };
  }

  return { status: "available" };
}

/**
 * People Search: POST /api/v1/mixed_people/api_search — requires a master API key on many plans.
 */
async function testPeopleSearch(
  apiKey: string
): Promise<{
  status: Exclude<ApolloSearchTestStatus, "skipped">;
  detail?: string;
}> {
  const response = await fetch(`${APOLLO_API_BASE}/mixed_people/api_search`, {
    method: "POST",
    headers: apolloJsonRequestHeaders(apiKey),
    body: JSON.stringify({ page: 1, per_page: 1 }),
    cache: "no-store",
  });

  const payload = await parseJsonSafe(response);

  if (response.status === 401) {
    return { status: "invalid_key", detail: "Invalid API key (401)." };
  }

  if (response.status === 403) {
    const errCode = String(payload?.error_code ?? "");
    const errText = String(payload?.error ?? "");
    if (errCode === "API_INACCESSIBLE" || errText.includes("not accessible with this api_key")) {
      return {
        status: "requires_master_key",
        detail: errText || "This endpoint requires a master API key.",
      };
    }
    return {
      status: "no_access",
      detail: errText || String(payload?.message ?? "Forbidden (403)."),
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      detail: String(payload?.error ?? payload?.message ?? `HTTP ${response.status}`),
    };
  }

  return { status: "available" };
}

/**
 * Runs People Enrichment (match) then People Search (api_search). Search is skipped if enrichment fails
 * so we do not misreport search when the key is invalid.
 */
export async function testApolloConnection(apiKey: string): Promise<ApolloConnectionTestResult> {
  const trimmed = normalizeApolloApiKey(String(apiKey ?? ""));
  if (!trimmed) {
    return {
      enrichment: { status: "invalid_key", detail: "Missing API key." },
      search: { status: "skipped", detail: "People Search was not tested." },
    };
  }

  const enrichment = await testPeopleEnrichment(trimmed);

  if (enrichment.status !== "available") {
    return {
      enrichment,
      search: { status: "skipped", detail: "People Search was not tested because People Enrichment did not succeed." },
    };
  }

  const search = await testPeopleSearch(trimmed);
  return { enrichment, search };
}
