import { GOOGLE_OAUTH_PKCE_COOKIE } from "@/lib/integrations/google/oauth-state";
import { MICROSOFT_OAUTH_PKCE_COOKIE } from "@/lib/integrations/microsoft/provider";
import {
  GOOGLE_OAUTH_CALLBACK_PATH,
  MICROSOFT_OAUTH_CALLBACK_PATH
} from "@/lib/integrations/mobile-oauth/middleware-policy";
import type { MobileOAuthProvider } from "@/lib/integrations/mobile-oauth/bridge-core";

/**
 * The PKCE verifier is a host-only, httpOnly cookie scoped to exactly one
 * provider's callback path, so a verifier minted for one provider is never sent
 * to another provider's callback.
 */
export function getOAuthPkceCookie(provider: MobileOAuthProvider) {
  return provider === "microsoft_365"
    ? { name: MICROSOFT_OAUTH_PKCE_COOKIE, path: MICROSOFT_OAUTH_CALLBACK_PATH }
    : { name: GOOGLE_OAUTH_PKCE_COOKIE, path: GOOGLE_OAUTH_CALLBACK_PATH };
}
