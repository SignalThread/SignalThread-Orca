export const MOBILE_OAUTH_BROWSER_LAUNCH_PATH = "/api/mobile/integrations/oauth/launch";
export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/integrations/google/callback";
export const MICROSOFT_OAUTH_CALLBACK_PATH = "/api/integrations/microsoft/callback";

/**
 * These browser handoff routes authenticate with signed, expiring OAuth state.
 * Their handlers remain responsible for ticket/PKCE validation and web-session binding.
 */
const OAUTH_BROWSER_HANDOFF_PATHS: readonly string[] = [
  MOBILE_OAUTH_BROWSER_LAUNCH_PATH,
  GOOGLE_OAUTH_CALLBACK_PATH,
  MICROSOFT_OAUTH_CALLBACK_PATH
];

export function isOAuthBrowserHandoffRequest(input: {
  pathname: string;
  method: string;
}) {
  if (input.method.toUpperCase() !== "GET") return false;
  return OAUTH_BROWSER_HANDOFF_PATHS.includes(input.pathname);
}
