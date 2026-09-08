export const HUBSPOT_AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize";

export const HUBSPOT_REQUIRED_SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.schemas.contacts.read",
  "crm.schemas.contacts.write",
] as const;

type HubSpotConnectUrlOptions = {
  accountId: string | null | undefined;
  clientId?: string | null;
  redirectUri?: string | null;
};

export function buildHubSpotConnectUrl({
  accountId,
  clientId = process.env.HUBSPOT_CLIENT_ID,
  redirectUri = process.env.HUBSPOT_REDIRECT_URI,
}: HubSpotConnectUrlOptions) {
  if (!clientId || !redirectUri || !accountId) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: HUBSPOT_REQUIRED_SCOPES.join(" "),
    response_type: "code",
    state: accountId,
  });

  return `${HUBSPOT_AUTHORIZE_URL}?${params.toString()}`;
}
