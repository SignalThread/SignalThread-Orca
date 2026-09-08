import { NextResponse, type NextRequest } from "next/server";
import { authorizeCompanyIntegrationAdmin } from "@/lib/integrations/company-integration-authorization";
import { disconnectPipedriveConnection } from "@/lib/integrations/pipedrive/connection-service";
import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";
import { createSupabaseRouteAuth } from "@/lib/supabase/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const routeAuth = createSupabaseRouteAuth(request);
  const authorization = await authorizeCompanyIntegrationAdmin({ supabase: routeAuth.supabase });
  if (!authorization.ok) {
    return routeAuth.withAuthCookies(
      NextResponse.json({ error: authorization.error }, { status: authorization.status })
    );
  }

  const redirect = buildBrowserFacingUrl(request, "/exhibitor/integrations");
  try {
    await disconnectPipedriveConnection(authorization.context.companyId);
    redirect.searchParams.set("pipedrive", "disconnected");
  } catch {
    redirect.searchParams.set("pipedrive_error", "disconnect_failed");
  }
  return routeAuth.withAuthCookies(NextResponse.redirect(redirect, { status: 303 }));
}
