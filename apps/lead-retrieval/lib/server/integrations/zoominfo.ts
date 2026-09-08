import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  ZOOMINFO_ENRICHMENT_DOMAINS_METADATA_KEY,
  DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS,
  parseZoomInfoEnrichmentDomainsFromMetadata,
  type ZoomInfoEnrichmentDomains,
} from "@/lib/integrations/zoominfo/enrichment-domain-settings";
import {
  ZOOMINFO_PROVIDER,
  type ZoomInfoConnectionRow
} from "@/lib/integrations/zoominfo/oauth-core";
import { probeZoomInfoBearerToken } from "@/lib/integrations/zoominfo/validate-bearer";

export * from "@/lib/integrations/zoominfo/oauth-core";

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function mergeZoomInfoConnectionMetadata(existing: unknown, patch: Record<string, unknown>): Json {
  const base = asObjectRecord(existing) ?? {};
  return { ...base, ...patch } as Json;
}

function preservedMetadataForUpsert(existing: unknown): Json | null {
  const rec = asObjectRecord(existing);
  if (!rec || Object.keys(rec).length === 0) return null;
  return rec as Json;
}

export async function saveZoomInfoBearerTokenForCompany(input: {
  companyId: string;
  userId: string;
  /** When null/undefined/whitespace, existing stored token is kept. */
  bearerToken: string | null | undefined;
  connectionLabel: string | null | undefined;
}): Promise<{ error: { message: string; code?: string } | null }> {
  const supabase = createAdminClient();
  const { data: existing } = await (supabase as any)
    .from("zoominfo_company_connections")
    .select("zoominfo_bearer_token, zoominfo_connection_label, metadata")
    .eq("company_id", input.companyId)
    .eq("provider", ZOOMINFO_PROVIDER)
    .maybeSingle();

  const existingRow = existing as {
    zoominfo_bearer_token?: string | null;
    zoominfo_connection_label?: string | null;
    metadata?: unknown;
  } | null;
  const existingToken = String(existingRow?.zoominfo_bearer_token ?? "").trim();
  const existingLabel = existingRow?.zoominfo_connection_label ?? null;

  const incoming = input.bearerToken === undefined || input.bearerToken === null ? "" : String(input.bearerToken).trim();
  const tokenToValidate = incoming || existingToken;

  if (!tokenToValidate) {
    return { error: { message: "Bearer token is required." } };
  }

  const probe = await probeZoomInfoBearerToken(tokenToValidate);
  if (!probe.ok) {
    return { error: { message: probe.message } };
  }

  const label =
    input.connectionLabel === undefined
      ? existingLabel
      : String(input.connectionLabel ?? "").trim() || null;

  const row = {
    company_id: input.companyId,
    provider: ZOOMINFO_PROVIDER,
    zoominfo_bearer_token: tokenToValidate,
    zoominfo_connection_label: label,
    status: "connected",
    connected_by_user_id: input.userId,
    metadata: preservedMetadataForUpsert(existingRow?.metadata),
    updated_at: new Date().toISOString()
  };

  const { error } = await (supabase as any).from("zoominfo_company_connections").upsert(row, {
    onConflict: "company_id,provider"
  });

  if (error) {
    return { error: { message: error.message ?? "Failed to save ZoomInfo token.", code: error.code } };
  }
  return { error: null };
}

export async function validateStoredZoomInfoBearerForCompany(
  companyId: string
): Promise<{ error: { message: string; code?: string } | null }> {
  const { row, error: loadError } = await getZoomInfoConnectionForCompany(companyId);
  if (loadError) {
    return { error: { message: loadError.message } };
  }
  const t = String(row?.zoominfo_bearer_token ?? "").trim();
  if (!row || !t) {
    return { error: { message: "No saved token to validate." } };
  }

  const probe = await probeZoomInfoBearerToken(t);
  const supabase = createAdminClient();
  const status = probe.ok ? "connected" : "error";

  let metadata: Json | null;
  if (probe.ok) {
    const base = asObjectRecord(row.metadata) ? { ...(row.metadata as Record<string, unknown>) } : {};
    delete base.validation_error;
    delete base.validated_at;
    metadata = Object.keys(base).length > 0 ? (base as Json) : null;
  } else {
    metadata = mergeZoomInfoConnectionMetadata(row.metadata, {
      validation_error: probe.message,
      validated_at: new Date().toISOString(),
    });
  }

  const { error } = await (supabase as any)
    .from("zoominfo_company_connections")
    .update({
      status,
      metadata,
      updated_at: new Date().toISOString()
    })
    .eq("company_id", companyId)
    .eq("provider", ZOOMINFO_PROVIDER);

  if (error) {
    return { error: { message: error.message ?? "Failed to update validation status.", code: error.code } };
  }

  return probe.ok ? { error: null } : { error: { message: probe.message } };
}

export async function getZoomInfoConnectionForCompany(
  companyId: string
): Promise<{ row: ZoomInfoConnectionRow | null; error: { message: string } | null }> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("zoominfo_company_connections")
    .select("*")
    .eq("company_id", companyId)
    .eq("provider", ZOOMINFO_PROVIDER)
    .maybeSingle();

  if (error) {
    return { row: null, error: { message: error.message ?? "Failed to load ZoomInfo connection." } };
  }
  return { row: (data as ZoomInfoConnectionRow | null) ?? null, error: null };
}

export function getZoomInfoEnrichmentDomainsFromConnectionRow(
  row: ZoomInfoConnectionRow | null
): ZoomInfoEnrichmentDomains {
  if (!row) {
    return { ...DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS };
  }
  return parseZoomInfoEnrichmentDomainsFromMetadata(asObjectRecord(row.metadata));
}

export async function getZoomInfoEnrichmentDomainsForCompany(
  companyId: string
): Promise<ZoomInfoEnrichmentDomains> {
  const { row, error } = await getZoomInfoConnectionForCompany(companyId);
  if (error || !row) {
    return { ...DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS };
  }
  return getZoomInfoEnrichmentDomainsFromConnectionRow(row);
}

export async function saveZoomInfoEnrichmentDomainSettingsForCompany(input: {
  companyId: string;
  domains: ZoomInfoEnrichmentDomains;
}): Promise<{ error: { message: string; code?: string } | null }> {
  const supabase = createAdminClient();
  const { row, error: loadError } = await getZoomInfoConnectionForCompany(input.companyId);
  if (loadError) {
    return { error: { message: loadError.message } };
  }
  if (!row || !String(row.zoominfo_bearer_token ?? "").trim()) {
    return {
      error: { message: "Save a ZoomInfo token before configuring enrichment data settings." },
    };
  }

  const metadata = mergeZoomInfoConnectionMetadata(row.metadata, {
    [ZOOMINFO_ENRICHMENT_DOMAINS_METADATA_KEY]: {
      company: input.domains.company,
      contact: input.domains.contact,
      intent: input.domains.intent,
    },
  });

  const { error } = await (supabase as any)
    .from("zoominfo_company_connections")
    .update({
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", input.companyId)
    .eq("provider", ZOOMINFO_PROVIDER);

  if (error) {
    return { error: { message: error.message ?? "Failed to save enrichment settings.", code: error.code } };
  }
  return { error: null };
}

export async function disconnectZoomInfoConnection(
  companyId: string
): Promise<{ deleted: boolean; error: { message: string; code?: string } | null }> {
  const supabase = createAdminClient();
  const { data: existing, error: selError } = await (supabase as any)
    .from("zoominfo_company_connections")
    .select("id")
    .eq("company_id", companyId)
    .eq("provider", ZOOMINFO_PROVIDER)
    .maybeSingle();

  if (selError) {
    return {
      deleted: false,
      error: { message: selError.message ?? "Failed to load ZoomInfo connection.", code: selError.code }
    };
  }
  if (!existing?.id) {
    return { deleted: false, error: null };
  }

  const { error: delError } = await (supabase as any)
    .from("zoominfo_company_connections")
    .delete()
    .eq("id", existing.id);

  if (delError) {
    return {
      deleted: false,
      error: { message: delError.message ?? "Failed to disconnect ZoomInfo.", code: delError.code }
    };
  }
  return { deleted: true, error: null };
}
