import { NextResponse, type NextRequest } from "next/server";
import { authorizeCompanyIntegrationAdmin } from "@/lib/integrations/company-integration-authorization";
import { createSupabaseRouteAuth } from "@/lib/supabase/route-auth";
import { syncLeadToPipedrive } from "@/lib/integrations/pipedrive/sync-service";
import { getPipedriveLeadSyncState } from "@/lib/integrations/pipedrive/sync-state";

export const runtime = "nodejs";

/**
 * Setup-page "Send Test Lead" — a REAL sync through the exact same canonical
 * `syncLeadToPipedrive` service the detail page and bulk action use, not a
 * mock or dry run. Restricted to a currently-unsent lead so customers verify
 * their setup deliberately, one lead at a time, before bulk-syncing the rest.
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

  const currentState = await getPipedriveLeadSyncState(authorization.context.companyId, leadId);
  if (currentState.state !== "unsent") {
    return routeAuth.withAuthCookies(
      NextResponse.json({ error: "Choose a lead that has not been sent to Pipedrive yet." }, { status: 409 })
    );
  }

  const result = await syncLeadToPipedrive({
    companyId: authorization.context.companyId,
    leadId,
    source: "test",
    requestedByUserId: authorization.context.userId
  });

  const status = result.success ? 200 : result.error === "Lead not found for this account." ? 404 : 502;
  return routeAuth.withAuthCookies(NextResponse.json(result, { status }));
}
