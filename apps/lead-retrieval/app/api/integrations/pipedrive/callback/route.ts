import { NextResponse, type NextRequest } from "next/server";
import { authorizeCompanyIntegrationAdmin } from "@/lib/integrations/company-integration-authorization";
import {
  consumePipedriveOAuthState,
  savePipedriveConnection
} from "@/lib/integrations/pipedrive/connection-service";
import {
  exchangePipedriveAuthorizationCode,
  normalizePipedriveScopes,
  revokePipedriveRefreshToken,
  verifyPipedriveConnection
} from "@/lib/integrations/pipedrive/oauth-client";
import { handlePipedriveOAuthCallback } from "@/lib/integrations/pipedrive/oauth-callback-core";
import { createSupabaseRouteAuth } from "@/lib/supabase/route-auth";

export const runtime = "nodejs";

function redirectWithResult(request: Request, input: {
  ok: boolean;
  result: string;
  returnTo: string;
}) {
  const safePath = input.returnTo === "/exhibitor/integrations/pipedrive"
    ? input.returnTo
    : "/exhibitor/integrations/pipedrive";
  const url = new URL(safePath, request.url);
  url.searchParams.set(input.ok ? "pipedrive" : "pipedrive_error", input.result);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(request: NextRequest) {
  const routeAuth = createSupabaseRouteAuth(request);
  const url = new URL(request.url);
  try {
    const result = await handlePipedriveOAuthCallback(
      {
        state: url.searchParams.get("state"),
        code: url.searchParams.get("code"),
        providerError: url.searchParams.get("error")
      },
      {
        consumeState: consumePipedriveOAuthState,
        // Use the same response-bound client for session resolution and cookie
        // rotation. A second server client can reuse a just-rotated refresh
        // token and write its result to a different cookie store.
        authorize: () => authorizeCompanyIntegrationAdmin({ supabase: routeAuth.supabase }),
        exchangeCode: (code) => exchangePipedriveAuthorizationCode({ code }),
        verifyConnection: verifyPipedriveConnection,
        saveConnection: savePipedriveConnection,
        normalizeScopes: normalizePipedriveScopes,
        revokeRefreshToken: async (refreshToken) => {
          await revokePipedriveRefreshToken({ refreshToken });
        }
      }
    );
    return routeAuth.withAuthCookies(redirectWithResult(request, result));
  } catch {
    return routeAuth.withAuthCookies(
      redirectWithResult(request, {
        ok: false,
        result: "callback_failed",
        returnTo: "/exhibitor/integrations/pipedrive"
      })
    );
  }
}
