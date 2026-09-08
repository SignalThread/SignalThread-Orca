import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type EnrichmentAdapterKey = "apollo" | "pdl" | "zoominfo";

function normalizeText(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * Resolves API credentials for a specific adapter (batch override), independent of
 * `companies.default_enrichment_provider`. Uses integrations + legacy env fallbacks.
 */
export async function resolveAdapterCredentialsForCompany(
  companyId: string,
  adapterKey: EnrichmentAdapterKey
): Promise<{ apiKey: string } | null> {
  const id = normalizeText(companyId);
  if (!id) return null;

  const supabase = createAdminClient();

  if (adapterKey === "pdl") {
    const legacyPdlKey = normalizeText(process.env.PDL_API_KEY);
    const { data: row } = await (supabase as any)
      .from("integrations")
      .select("access_token")
      .eq("account_id", id)
      .eq("provider", "people_data_labs")
      .maybeSingle();

    const key = normalizeText((row as { access_token?: string } | null)?.access_token) ?? legacyPdlKey;
    return key ? { apiKey: key } : null;
  }

  if (adapterKey === "apollo") {
    const legacyApolloKey = normalizeText(process.env["APOLLO_API_KEY"]);
    const { data: row } = await (supabase as any)
      .from("integrations")
      .select("access_token")
      .eq("account_id", id)
      .eq("provider", "apollo")
      .maybeSingle();

    const key = normalizeText((row as { access_token?: string } | null)?.access_token) ?? legacyApolloKey;
    return key ? { apiKey: key } : null;
  }

  const legacyZiKey = normalizeText(process.env["ZOOMINFO_API_KEY"]);
  const { data: ziRow } = await (supabase as any)
    .from("zoominfo_company_connections")
    .select("zoominfo_bearer_token, status")
    .eq("company_id", id)
    .eq("provider", "zoominfo")
    .maybeSingle();
  const bearer = normalizeText(
    (ziRow as { zoominfo_bearer_token?: string; status?: string } | null)?.zoominfo_bearer_token
  );
  const ziBearerOk = Boolean(bearer && String((ziRow as { status?: string } | null)?.status ?? "") === "connected");

  const { data: row } = await (supabase as any)
    .from("integrations")
    .select("access_token")
    .eq("account_id", id)
    .eq("provider", "zoominfo")
    .maybeSingle();

  const key =
    (ziBearerOk ? bearer : null) ??
    normalizeText((row as { access_token?: string } | null)?.access_token) ??
    legacyZiKey;
  return key ? { apiKey: key } : null;
}

export async function getConfiguredAdapterKeysForCompany(companyId: string): Promise<EnrichmentAdapterKey[]> {
  const keys: EnrichmentAdapterKey[] = [];
  for (const k of ["apollo", "pdl", "zoominfo"] as const) {
    const resolved = await resolveAdapterCredentialsForCompany(companyId, k);
    if (resolved) keys.push(k);
  }
  return keys;
}
