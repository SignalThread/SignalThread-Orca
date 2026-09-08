import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { EnrichmentProviderId } from "@/lib/config/enrichment-providers";

export type ResolvedEnrichment = {
  providerId: EnrichmentProviderId;
  adapterKey: "pdl" | "apollo" | "zoominfo";
  apiKey: string;
};

function normalizeText(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * Resolves which enrichment backend to use for a company: companies.default_enrichment_provider,
 * optional per-account API keys in integrations, and legacy PDL_API_KEY when default is unset.
 */
export async function resolveEnrichmentForCompany(companyId: string): Promise<ResolvedEnrichment | null> {
  const id = normalizeText(companyId);
  if (!id) return null;

  const supabase = createAdminClient();
  const { data: company, error: companyError } = await (supabase as any)
    .from("companies")
    .select("default_enrichment_provider")
    .eq("id", id)
    .maybeSingle();

  if (companyError) {
    return null;
  }

  const defaultProvider = normalizeText((company as { default_enrichment_provider?: string } | null)?.default_enrichment_provider);
  const legacyPdlKey = normalizeText(process.env.PDL_API_KEY);

  if (defaultProvider === "people_data_labs") {
    const { data: row } = await (supabase as any)
      .from("integrations")
      .select("access_token")
      .eq("account_id", id)
      .eq("provider", "people_data_labs")
      .maybeSingle();

    const key = normalizeText((row as { access_token?: string } | null)?.access_token) ?? legacyPdlKey;
    if (!key) {
      return null;
    }

    return {
      providerId: "people_data_labs",
      adapterKey: "pdl",
      apiKey: key,
    };
  }

  if (defaultProvider === "apollo") {
    const legacyApolloKey = normalizeText(process.env["APOLLO_API_KEY"]);
    const { data: row } = await (supabase as any)
      .from("integrations")
      .select("access_token")
      .eq("account_id", id)
      .eq("provider", "apollo")
      .maybeSingle();

    const key = normalizeText((row as { access_token?: string } | null)?.access_token) ?? legacyApolloKey;
    if (!key) {
      return null;
    }

    return {
      providerId: "apollo",
      adapterKey: "apollo",
      apiKey: key,
    };
  }

  if (defaultProvider === "zoominfo") {
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
    if (!key) {
      return null;
    }

    return {
      providerId: "zoominfo",
      adapterKey: "zoominfo",
      apiKey: key,
    };
  }

  // No explicit default: preserve legacy server-wide PDL key behavior only (does not use connected integration keys).
  if (defaultProvider === null && legacyPdlKey) {
    return {
      providerId: "people_data_labs",
      adapterKey: "pdl",
      apiKey: legacyPdlKey,
    };
  }

  return null;
}
