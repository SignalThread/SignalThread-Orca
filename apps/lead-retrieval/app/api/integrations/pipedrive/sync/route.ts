import { NextResponse, type NextRequest } from "next/server";
import { authorizeCompanyIntegrationAdmin } from "@/lib/integrations/company-integration-authorization";
import { createSupabaseRouteAuth } from "@/lib/supabase/route-auth";
import { syncLeadToPipedrive } from "@/lib/integrations/pipedrive/sync-service";

export const runtime = "nodejs";

/**
 * Single-lead Pipedrive sync used by the lead detail page for both the
 * initial "Send to Pipedrive" send and a later "Retry Pipedrive Sync" — the
 * server always attempts a real synchronous sync either way, through the
 * exact same canonical service the list bulk action and setup test action use.
 */
export async function POST(request: NextRequest) {
  const routeAuth = createSupabaseRouteAuth(request);
  const authorization = await authorizeCompanyIntegrationAdmin({ supabase: routeAuth.supabase });
  if (!authorization.ok) {
    return routeAuth.withAuthCookies(NextResponse.json({ error: authorization.error }, { status: authorization.status }));
  }

  const body = await request.json().catch(() => null);
  const leadId = String(body?.leadId ?? "").trim();
  if (!leadId) {
    return routeAuth.withAuthCookies(NextResponse.json({ error: "leadId is required." }, { status: 400 }));
  }

  const result = await syncLeadToPipedrive({
    companyId: authorization.context.companyId,
    leadId,
    source: "manual",
    requestedByUserId: authorization.context.userId
  });

  const status = result.success ? 200 : result.error === "Lead not found for this account." ? 404 : 502;
  return routeAuth.withAuthCookies(NextResponse.json(result, { status }));
}
