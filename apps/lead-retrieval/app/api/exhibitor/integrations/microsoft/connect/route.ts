import { NextResponse } from "next/server";
import { authorizeIntegrationConnectionAdmin } from "@/lib/integrations/oauth/authorization";
import { prepareMicrosoftOAuthLaunch } from "@/lib/integrations/microsoft/oauth-launch-service";
import { MICROSOFT_OAUTH_PKCE_COOKIE } from "@/lib/integrations/microsoft/provider";
import { MICROSOFT_OAUTH_CALLBACK_PATH } from "@/lib/integrations/mobile-oauth/middleware-policy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeIntegrationConnectionAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  try {
    const requestUrl = new URL(request.url);
    const launch = await prepareMicrosoftOAuthLaunch({
      userId: authorization.context.userId,
      companyId: authorization.context.companyId,
      returnTo: requestUrl.searchParams.get("returnTo"),
      forceConsent: requestUrl.searchParams.get("reconnect") === "1"
    });
    const response = NextResponse.redirect(launch.authorizationUrl);
    response.cookies.set(MICROSOFT_OAUTH_PKCE_COOKIE, launch.codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: MICROSOFT_OAUTH_CALLBACK_PATH,
      maxAge: launch.maxAge
    });
    return response;
  } catch (error) {
    console.error("[microsoft/connect]", {
      code: "MICROSOFT_CONNECT_START_FAILED",
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json({ error: "Unable to start Microsoft authorization." }, { status: 500 });
  }
}
