import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  type EnrichmentProviderId,
  isEnrichmentProviderId,
} from "@/lib/config/enrichment-providers";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export async function upsertEnrichmentApiKey(params: {
  accountId: string;
  provider: EnrichmentProviderId;
  apiKey: string;
  supabase?: ReturnType<typeof createAdminClient>;
}) {
  const accountId = normalizeText(params.accountId);
  const apiKey = normalizeText(params.apiKey);
  const supabase = params.supabase ?? createAdminClient();

  if (!accountId || !apiKey) {
    return { error: new Error("Missing account or API key.") };
  }

  const { error } = await (supabase as any)
    .from("integrations")
    .upsert(
      {
        account_id: accountId,
        provider: params.provider,
        access_token: apiKey,
        provider_account_id: null,
        refresh_token: null,
        scope: [],
        expires_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,provider" }
    );

  return { error: error ? new Error(error.message ?? "Failed to save integration.") : null };
}

export async function removeEnrichmentIntegration(params: {
  accountId: string;
  provider: EnrichmentProviderId;
  supabase?: ReturnType<typeof createAdminClient>;
}) {
  const accountId = normalizeText(params.accountId);
  const supabase = params.supabase ?? createAdminClient();

  const { error } = await (supabase as any)
    .from("integrations")
    .delete()
    .eq("account_id", accountId)
    .eq("provider", params.provider);

  if (error) {
    return { error: new Error(error.message ?? "Failed to remove integration.") };
  }

  const { error: companyError } = await (supabase as any)
    .from("companies")
    .update({
      default_enrichment_provider: null,
    })
    .eq("id", accountId)
    .eq("default_enrichment_provider", params.provider);

  if (companyError) {
    return { error: new Error(companyError.message ?? "Failed to clear default provider.") };
  }

  return { error: null };
}

export async function setDefaultEnrichmentProvider(params: {
  accountId: string;
  provider: EnrichmentProviderId;
  supabase?: ReturnType<typeof createAdminClient>;
}) {
  const accountId = normalizeText(params.accountId);
  const supabase = params.supabase ?? createAdminClient();

  if (!accountId) {
    return { error: new Error("Missing account.") };
  }

  const { data: row, error: rowError } = await (supabase as any)
    .from("integrations")
    .select("access_token")
    .eq("account_id", accountId)
    .eq("provider", params.provider)
    .maybeSingle();

  if (rowError) {
    return { error: new Error(rowError.message ?? "Failed to verify integration.") };
  }

  const apiKey = normalizeText((row as { access_token?: string } | null)?.access_token);

  let zoominfoBearerConnected = false;
  if (params.provider === "zoominfo") {
    const { data: ziRow } = await (supabase as any)
      .from("zoominfo_company_connections")
      .select("zoominfo_bearer_token, status")
      .eq("company_id", accountId)
      .eq("provider", "zoominfo")
      .maybeSingle();
    const b = normalizeText(
      (ziRow as { zoominfo_bearer_token?: string; status?: string } | null)?.zoominfo_bearer_token
    );
    zoominfoBearerConnected = Boolean(b && String((ziRow as { status?: string } | null)?.status ?? "") === "connected");
  }

  const legacyOk =
    (params.provider === "people_data_labs" && Boolean(normalizeText(process.env.PDL_API_KEY))) ||
    (params.provider === "apollo" && Boolean(normalizeText(process.env["APOLLO_API_KEY"]))) ||
    (params.provider === "zoominfo" && Boolean(normalizeText(process.env["ZOOMINFO_API_KEY"])));

  if (!apiKey && !legacyOk && !(params.provider === "zoominfo" && zoominfoBearerConnected)) {
    return { error: new Error("Connect this enrichment provider before setting it as default.") };
  }

  const { error } = await (supabase as any)
    .from("companies")
    .update({
      default_enrichment_provider: params.provider,
    })
    .eq("id", accountId);

  return { error: error ? new Error(error.message ?? "Failed to update default provider.") : null };
}

export function parseEnrichmentDefaultProvider(formValue: unknown): EnrichmentProviderId | null {
  const raw = normalizeText(formValue).toLowerCase();
  if (!raw) return null;
  if (!isEnrichmentProviderId(raw)) return null;
  return raw;
}
