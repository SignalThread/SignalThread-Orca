import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";
import {
  normalizeMicrosoftReturnTo,
  type MicrosoftOAuthStatePayload
} from "@/lib/integrations/microsoft/oauth-state";
import { buildMobileOAuthReturnUrl } from "@/lib/integrations/mobile-oauth/bridge-core";
import { MICROSOFT_365_PROVIDER } from "@/lib/integrations/microsoft/provider";

export function buildMicrosoftOAuthResultUrl(
  request: Pick<Request, "url">,
  returnTo: string,
  result: string
) {
  const url = buildBrowserFacingUrl(request, normalizeMicrosoftReturnTo(returnTo));
  url.searchParams.set("microsoft", result);
  return url;
}

export function buildMicrosoftOAuthResultUrlForState(
  request: Pick<Request, "url">,
  payload: MicrosoftOAuthStatePayload,
  result: string
) {
  if (payload.channel === "mobile" && payload.correlation) {
    return buildMobileOAuthReturnUrl({
      provider: MICROSOFT_365_PROVIDER,
      result,
      correlation: payload.correlation
    });
  }
  return buildMicrosoftOAuthResultUrl(request, payload.returnTo, result);
}
