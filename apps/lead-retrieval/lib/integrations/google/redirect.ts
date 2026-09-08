import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";
import {
  normalizeGoogleReturnTo,
  type GoogleOAuthStatePayload
} from "@/lib/integrations/google/oauth-state";
import { buildMobileOAuthReturnUrl } from "@/lib/integrations/mobile-oauth/bridge-core";

export function buildGoogleOAuthResultUrl(
  request: Pick<Request, "url">,
  returnTo: string,
  result: string
) {
  const url = buildBrowserFacingUrl(request, normalizeGoogleReturnTo(returnTo));
  url.searchParams.set("google", result);
  return url;
}

export function buildGoogleOAuthResultUrlForState(
  request: Pick<Request, "url">,
  payload: GoogleOAuthStatePayload,
  result: string
) {
  if (payload.channel === "mobile" && payload.correlation) {
    return buildMobileOAuthReturnUrl({
      provider: "google_workspace",
      result,
      correlation: payload.correlation
    });
  }
  return buildGoogleOAuthResultUrl(request, payload.returnTo, result);
}
