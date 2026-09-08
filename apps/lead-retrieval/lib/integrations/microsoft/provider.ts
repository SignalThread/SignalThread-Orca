/**
 * Canonical Microsoft 365 provider identity.
 *
 * `microsoft_365` follows the existing suite-level naming convention set by
 * `google_workspace`: one user-owned connection covering Outlook mail and
 * calendar, not one identifier per Microsoft surface.
 */
export const MICROSOFT_365_PROVIDER = "microsoft_365" as const;
export type Microsoft365Provider = typeof MICROSOFT_365_PROVIDER;

export const MICROSOFT_365_DISPLAY_NAME = "Microsoft 365";
export const MICROSOFT_365_MANAGE_PATH = "/exhibitor/integrations/microsoft-365";
export const MICROSOFT_OAUTH_PKCE_COOKIE = "microsoft_365_pkce";
