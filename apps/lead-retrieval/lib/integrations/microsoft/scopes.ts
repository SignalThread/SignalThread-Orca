/**
 * The exact delegated permission set SignalThread requests from Microsoft.
 *
 * Microsoft returns granted Graph permissions in the token response as absolute
 * resource URIs, and normally omits the OIDC scopes entirely, so the response is
 * normalized to short names before it is persisted or compared.
 */
export const MICROSOFT_365_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Send",
  "Calendars.ReadWrite"
] as const;

export type Microsoft365Scope = (typeof MICROSOFT_365_SCOPES)[number];

const ALLOWED_SCOPES = new Set<string>(MICROSOFT_365_SCOPES);
const GRAPH_SCOPE_PREFIX = "https://graph.microsoft.com/";

export function microsoft365AuthorizationScopeParameter() {
  return MICROSOFT_365_SCOPES.join(" ");
}

export function normalizeGrantedMicrosoft365Scopes(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/\s+/);
  return [
    ...new Set(
      values
        .map((scope) => scope.trim())
        .map((scope) => (scope.startsWith(GRAPH_SCOPE_PREFIX) ? scope.slice(GRAPH_SCOPE_PREFIX.length) : scope))
        .filter((scope) => ALLOWED_SCOPES.has(scope))
    )
  ];
}

export function getMicrosoft365Capabilities(scopes: readonly string[]) {
  const granted = new Set(scopes);
  return {
    mailSend: granted.has("Mail.Send"),
    calendarReadWrite: granted.has("Calendars.ReadWrite")
  };
}

/**
 * Microsoft omits `openid`/`profile`/`email` from the granted-scope response, so
 * account identity is proven by `User.Read` plus the verified Graph `/me` call
 * the callback performs before a connection is ever marked connected.
 */
export function hasRequiredMicrosoft365IdentityScopes(scopes: readonly string[]) {
  return new Set(scopes).has("User.Read");
}
