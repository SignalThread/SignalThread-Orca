import { NextResponse, type NextRequest } from "next/server";
import { authorizeCompanyIntegrationAdmin } from "@/lib/integrations/company-integration-authorization";
import { preparePipedriveOAuthLaunch } from "@/lib/integrations/pipedrive/oauth-launch-service";
import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";
import { createSupabaseRouteAuth } from "@/lib/supabase/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const routeAuth = createSupabaseRouteAuth(request);
  const authorization = await authorizeCompanyIntegrationAdmin({ supabase: routeAuth.supabase });
  if (!authorization.ok) {
    return routeAuth.withAuthCookies(
      NextResponse.json({ error: authorization.error }, { status: authorization.status })
    );
  }

  try {
    const launch = await preparePipedriveOAuthLaunch(authorization.context);
    return routeAuth.withAuthCookies(NextResponse.redirect(launch.authorizationUrl, { status: 303 }));
  } catch (error) {
    // Deployment misconfiguration must be diagnosable from server logs; the
    // message names environment variables only and never carries their values.
    const message = error instanceof Error ? error.message : "Unknown Pipedrive start failure.";
    console.error("[pipedrive/start] authorization launch failed", { message });
    const redirect = buildBrowserFacingUrl(request, "/exhibitor/integrations");
    redirect.searchParams.set(
      "pipedrive_error",
      message.startsWith("Pipedrive OAuth is not configured") || message.startsWith("PIPEDRIVE_REDIRECT_URI")
        ? "not_configured"
        : "start_failed"
    );
    return routeAuth.withAuthCookies(NextResponse.redirect(redirect, { status: 303 }));
  }
}
