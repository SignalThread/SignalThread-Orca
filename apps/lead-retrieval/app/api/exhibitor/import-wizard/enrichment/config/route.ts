import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { getConfiguredAdapterKeysForCompany } from "@/lib/enrichment/resolve-adapter-for-company";
import { dbDefaultEnrichmentToWizardId, type WizardEnrichmentProviderId } from "@/lib/import-wizard/wizard-enrichment-bridge";

const LABELS: Record<WizardEnrichmentProviderId, string> = {
  apollo: "Apollo",
  zoominfo: "ZoomInfo",
  pdl: "PDL",
};

export async function GET(request: Request) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: companyRow } = (await supabase
      .from("companies")
      .select("default_enrichment_provider")
      .eq("id", companyId)
      .maybeSingle()) as {
      data: { default_enrichment_provider?: string | null } | null;
    };

    const dbDefault = companyRow?.default_enrichment_provider ?? null;
    const workspaceDefaultWizardId = dbDefaultEnrichmentToWizardId(dbDefault);

    const configured = await getConfiguredAdapterKeysForCompany(companyId);
    const availableProviders = configured.map((id) => ({
      id: id as WizardEnrichmentProviderId,
      label: LABELS[id as WizardEnrichmentProviderId] ?? id,
    }));

    const maxLeadsPerRun =
      Number(process.env.IMPORT_WIZARD_ENRICHMENT_MAX_LEADS ?? 50) || 50;

    let initialBatchProviderId: WizardEnrichmentProviderId | null = null;
    if (availableProviders.length > 0) {
      if (
        workspaceDefaultWizardId &&
        configured.includes(workspaceDefaultWizardId as "apollo" | "pdl" | "zoominfo")
      ) {
        initialBatchProviderId = workspaceDefaultWizardId;
      } else {
        initialBatchProviderId = availableProviders[0]!.id;
      }
    }

    return NextResponse.json({
      availableProviders,
      workspaceDefaultWizardId,
      initialBatchProviderId,
      maxLeadsPerRun,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
