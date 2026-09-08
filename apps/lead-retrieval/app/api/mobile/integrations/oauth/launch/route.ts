import { NextResponse } from "next/server";
import { prepareGoogleOAuthLaunch } from "@/lib/integrations/google/oauth-launch-service";
import { prepareMicrosoftOAuthLaunch } from "@/lib/integrations/microsoft/oauth-launch-service";
import { getOAuthPkceCookie } from "@/lib/integrations/mobile-oauth/pkce-cookie";
import { consumeMobileOAuthLaunchTicket } from "@/lib/integrations/mobile-oauth/launch-ticket-service";
import { resolveMobileOAuthBrowserLaunch } from "@/lib/integrations/mobile-oauth/launch-route-core";
import { logMobileOAuthLaunchDiagnostic } from "@/lib/integrations/mobile-oauth/launch-diagnostics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const launch = await resolveMobileOAuthBrowserLaunch(request, {
    consumeTicket: (ticket) => consumeMobileOAuthLaunchTicket({ ticket }),
    prepareGoogleLaunch: prepareGoogleOAuthLaunch,
    prepareMicrosoftLaunch: prepareMicrosoftOAuthLaunch,
    logger: logMobileOAuthLaunchDiagnostic
  });
  if (!launch.ok) {
    return NextResponse.json(
      { error: launch.error },
      { status: launch.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const response = NextResponse.redirect(launch.authorizationUrl);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  const pkceCookie = getOAuthPkceCookie(launch.provider);
  response.cookies.set(pkceCookie.name, launch.codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: pkceCookie.path,
    maxAge: launch.maxAge
  });
  return response;
}
