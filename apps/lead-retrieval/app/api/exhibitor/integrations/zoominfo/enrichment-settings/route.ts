import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import { coerceZoomInfoEnrichmentDomainsFromApiBody } from "@/lib/integrations/zoominfo/enrichment-domain-settings";
import { saveZoomInfoEnrichmentDomainSettingsForCompany } from "@/lib/server/integrations/zoominfo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCompanyAccountAdminSession(sessionUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!sessionUser.company_id) {
    return NextResponse.json({ error: "Missing company context." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const domains = coerceZoomInfoEnrichmentDomainsFromApiBody(body);
  if (!domains) {
    return NextResponse.json({ error: "Invalid enrichment domain payload." }, { status: 400 });
  }

  const { error } = await saveZoomInfoEnrichmentDomainSettingsForCompany({
    companyId: sessionUser.company_id,
    domains,
  });

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }

  return NextResponse.json({ success: true, enrichmentDomains: domains });
}
