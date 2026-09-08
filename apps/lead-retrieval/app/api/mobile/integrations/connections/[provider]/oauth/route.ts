import { NextResponse } from "next/server";
import { authorizeMobileIntegrationRequest } from "@/lib/integrations/mobile-oauth/authorization";
import { isMobileOAuthProvider } from "@/lib/integrations/mobile-oauth/bridge-core";
import { issueMobileOAuthLaunchTicket } from "@/lib/integrations/mobile-oauth/launch-ticket-service";
import { buildMobileOAuthStartPayload } from "@/lib/integrations/mobile-oauth/launch-route-core";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const authorization = await authorizeMobileIntegrationRequest(request);
    if (!authorization.ok) {
      return NextResponse.json(
        { error: authorization.error },
        { status: authorization.status }
      );
    }
    const providerValue = (await params).provider;
    if (!isMobileOAuthProvider(providerValue)) {
      return NextResponse.json({ error: "Unsupported integration provider." }, { status: 404 });
    }
    const session = authorization.context;
    const body = (await request.json().catch(() => ({}))) as { reconnect?: unknown };
    // The ticket is bound to the provider named in the path, and the browser
    // launch may only start that provider.
    const launch = await issueMobileOAuthLaunchTicket({
      request,
      userId: session.userId,
      companyId: session.companyId,
      provider: providerValue,
      forceReconnect: body.reconnect === true
    });
    return NextResponse.json(
      buildMobileOAuthStartPayload(launch),
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Unable to start mobile authorization." },
      { status: 500 }
    );
  }
}
