import { NextResponse } from "next/server";
import { authorizeGoogleWorkspaceAdmin } from "@/lib/integrations/google/authorization";
import { prepareGoogleOAuthLaunch } from "@/lib/integrations/google/oauth-launch-service";
import { GOOGLE_OAUTH_PKCE_COOKIE } from "@/lib/integrations/google/oauth-state";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await authorizeGoogleWorkspaceAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  try {
    const requestUrl = new URL(request.url);
    const launch = await prepareGoogleOAuthLaunch({
      userId: authorization.context.userId,
      companyId: authorization.context.companyId,
      returnTo: requestUrl.searchParams.get("returnTo"),
      forceConsent: requestUrl.searchParams.get("reconnect") === "1"
    });
    const response = NextResponse.redirect(launch.authorizationUrl);
    response.cookies.set(GOOGLE_OAUTH_PKCE_COOKIE, launch.codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/google/callback",
      maxAge: launch.maxAge
    });
    return response;
  } catch (error) {
    console.error("[google/connect]", {
      code: "GOOGLE_CONNECT_START_FAILED",
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json({ error: "Unable to start Google authorization." }, { status: 500 });
  }
}
