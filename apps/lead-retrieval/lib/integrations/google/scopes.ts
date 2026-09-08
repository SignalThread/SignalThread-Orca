export const GOOGLE_WORKSPACE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.events.freebusy"
] as const;

export type GoogleWorkspaceScope = (typeof GOOGLE_WORKSPACE_SCOPES)[number];

const ALLOWED_SCOPES = new Set<string>(GOOGLE_WORKSPACE_SCOPES);
const GOOGLE_SCOPE_ALIASES: Readonly<Record<string, GoogleWorkspaceScope>> = {
  "https://www.googleapis.com/auth/userinfo.email": "email",
  "https://www.googleapis.com/auth/userinfo.profile": "profile"
};

export function normalizeGrantedGoogleScopes(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/\s+/);
  return [
    ...new Set(
      values
        .map((scope) => scope.trim())
        .map((scope) => GOOGLE_SCOPE_ALIASES[scope] ?? scope)
        .filter((scope) => ALLOWED_SCOPES.has(scope))
    )
  ];
}

export function getGoogleWorkspaceCapabilities(scopes: readonly string[]) {
  const granted = new Set(scopes);
  return {
    gmailSend: granted.has("https://www.googleapis.com/auth/gmail.send"),
    calendarEventsOwned: granted.has("https://www.googleapis.com/auth/calendar.events.owned"),
    calendarFreeBusy: granted.has("https://www.googleapis.com/auth/calendar.events.freebusy")
  };
}

export function hasRequiredGoogleIdentityScopes(scopes: readonly string[]) {
  const granted = new Set(scopes);
  return granted.has("openid") && granted.has("email") && granted.has("profile");
}
