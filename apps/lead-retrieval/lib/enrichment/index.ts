import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enrichWithApollo } from "@/lib/enrichment/providers/apollo";
import { enrichWithPdl, type ProviderEnrichmentResult } from "@/lib/enrichment/providers/pdl";
import { enrichWithZoomInfo } from "@/lib/enrichment/providers/zoominfo";
import { normalizeEnrichmentInput, type RawEnrichmentLead } from "@/lib/enrichment/providers/normalize-input";
import {
  resolveEnrichmentForCompany,
  type ResolvedEnrichment,
} from "@/lib/enrichment/resolve-provider";
import { DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS } from "@/lib/integrations/zoominfo/enrichment-domain-settings";
import { getZoomInfoEnrichmentDomainsForCompany } from "@/lib/server/integrations/zoominfo";
import {
  buildEnrichmentPatchForLead,
  readLeadCompanyDomainForEnrichment,
  readLeadLinkedinUrlForEnrichment,
} from "@/lib/leads/canonical-lead-fields";

export type EnrichedLeadRow = {
  id: string;
  full_name: string;
  job_title: string | null;
  company_text: string | null;
  email: string | null;
  linkedin_url: string | null;
  company_domain: string | null;
  industry: string | null;
  company_size: string | null;
  seniority: string | null;
  intent_signals: unknown;
  metadata: unknown;
  updated_at: string;
};

function leadSelectFields() {
  return "id, full_name, job_title, company_text, email, linkedin_url, company_domain, industry, company_size, seniority, intent_signals, metadata, updated_at";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function getLeadForResponse(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  leadId: string
) {
  const { data, error } = (await supabase
    .from("leads")
    .select(leadSelectFields())
    .eq("id", leadId)
    .single()) as {
    data: EnrichedLeadRow | null;
    error: { message: string; code?: string } | null;
  };

  if (error || !data) {
    throw new Error(`Failed to load lead after enrichment: ${error?.message ?? "not_found"}`);
  }

  return data;
}

export type EnrichLeadResult = {
  outcome: "updated" | "no_match";
  lead: EnrichedLeadRow;
};

export async function enrichLead(leadId: string): Promise<EnrichLeadResult> {
  const supabase = await createSupabaseServerClient();

  const { data: leadRecord, error: leadError } = (await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle()) as {
    data: Record<string, unknown> | null;
    error: { message: string; code?: string } | null;
  };

  if (leadError || !leadRecord) {
    throw new Error(`Lead not found for enrichment: ${leadError?.message ?? "not_found"}`);
  }

  const resolvedLeadId = asString(leadRecord.id);
  const fullName = asString(leadRecord.full_name);
  const companyId = asString(leadRecord.company_id);

  if (!resolvedLeadId || !fullName) {
    throw new Error("Lead is missing required identity fields for enrichment.");
  }

  let companyName: string | null = null;
  if (companyId) {
    const { data: company } = (await supabase
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .maybeSingle()) as { data: { name: string } | null; error: { message: string } | null };
    companyName = company?.name ?? null;
  }

  const rawInput: RawEnrichmentLead = {
    email: asString(leadRecord.email),
    linkedinUrl: readLeadLinkedinUrlForEnrichment(leadRecord),
    fullName: fullName,
    company: asString(leadRecord.company_text) ?? companyName,
    companyDomain: readLeadCompanyDomainForEnrichment(leadRecord),
  };
  const normalizedInput = normalizeEnrichmentInput(rawInput);

  const legacyPdlKey = asString(process.env.PDL_API_KEY);
  let resolved: ResolvedEnrichment | null = companyId ? await resolveEnrichmentForCompany(companyId) : null;
  if (!resolved && !companyId && legacyPdlKey) {
    resolved = {
      providerId: "people_data_labs",
      adapterKey: "pdl",
      apiKey: legacyPdlKey,
    };
  }
  if (!resolved) {
    throw new Error(
      "No default enrichment provider is available. Connect an enrichment provider in Integrations or set a legacy env key (e.g. PDL_API_KEY)."
    );
  }

  let enriched: ProviderEnrichmentResult;
  if (resolved.adapterKey === "pdl") {
    enriched = await enrichWithPdl(normalizedInput, { apiKey: resolved.apiKey });
  } else if (resolved.adapterKey === "apollo") {
    enriched = await enrichWithApollo(normalizedInput, { apiKey: resolved.apiKey });
  } else if (resolved.adapterKey === "zoominfo") {
    const enrichmentDomains = companyId
      ? await getZoomInfoEnrichmentDomainsForCompany(companyId)
      : DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS;
    enriched = await enrichWithZoomInfo(normalizedInput, {
      apiKey: resolved.apiKey,
      enrichmentDomains,
    });
  } else {
    throw new Error("Unsupported enrichment provider.");
  }

  const { error: insertError } = await supabase.from("lead_enrichments").insert({
    lead_id: resolvedLeadId,
    provider: enriched.provider,
    raw_response: enriched.rawResponse,
  } as never);

  if (insertError) {
    throw new Error(`Failed to store enrichment payload: ${insertError.message}`);
  }

  if (!enriched.shouldUpdateNormalized) {
    if (enriched.noMatch) {
      return {
        outcome: "no_match",
        lead: await getLeadForResponse(supabase, resolvedLeadId),
      };
    }

    throw new Error(enriched.errorMessage ?? "Enrichment failed");
  }

  const updatePatch = buildEnrichmentPatchForLead(
    leadRecord,
    enriched.normalized,
    enriched.provider,
    enriched.rawResponse
  );

  const { data: updatedLead, error: updateError } = (await supabase
    .from("leads")
    .update(updatePatch as never)
    .eq("id", resolvedLeadId)
    .select(leadSelectFields())
    .single()) as {
    data: EnrichedLeadRow | null;
    error: { message: string; code?: string } | null;
  };

  if (updateError || !updatedLead) {
    throw new Error(`Failed to update lead after enrichment: ${updateError?.message ?? "update_failed"}`);
  }

  return { outcome: "updated", lead: updatedLead };
}
