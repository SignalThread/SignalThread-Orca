import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildHubSpotConnectUrl, HUBSPOT_REQUIRED_SCOPES } from "../lib/integrations/hubspot/oauth";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

test("HubSpot connect URL includes the complete required scope set", () => {
  const url = buildHubSpotConnectUrl({
    accountId: "company-123",
    clientId: "client-123",
    redirectUri: "https://app.example.com/api/integrations/hubspot/callback",
  });

  assert.ok(url);

  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://app.hubspot.com/oauth/authorize");
  assert.equal(parsed.searchParams.get("client_id"), "client-123");
  assert.equal(
    parsed.searchParams.get("redirect_uri"),
    "https://app.example.com/api/integrations/hubspot/callback"
  );
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("state"), "company-123");
  assert.deepEqual(parsed.searchParams.get("scope")?.split(" "), [
    "oauth",
    "crm.objects.contacts.read",
    "crm.objects.contacts.write",
    "crm.objects.companies.read",
    "crm.objects.deals.read",
    "crm.objects.deals.write",
    "crm.schemas.contacts.read",
    "crm.schemas.contacts.write",
  ]);
  assert.deepEqual([...HUBSPOT_REQUIRED_SCOPES], parsed.searchParams.get("scope")?.split(" "));
});

test("HubSpot connect URL helper returns null when required URL inputs are missing", () => {
  assert.equal(buildHubSpotConnectUrl({ accountId: null, clientId: "client", redirectUri: "https://example.com" }), null);
  assert.equal(buildHubSpotConnectUrl({ accountId: "company", clientId: "", redirectUri: "https://example.com" }), null);
  assert.equal(buildHubSpotConnectUrl({ accountId: "company", clientId: "client", redirectUri: "" }), null);
});

test("HubSpot OAuth scopes are not duplicated in integration pages", () => {
  const overviewPage = read("app/(app)/exhibitor/integrations/page.tsx");
  const hubspotPage = read("app/(app)/exhibitor/integrations/hubspot/page.tsx");

  assert.match(overviewPage, /buildHubSpotConnectUrl\(\{ accountId \}\)/);
  assert.match(hubspotPage, /buildHubSpotConnectUrl\(\{ accountId \}\)/);
  assert.doesNotMatch(overviewPage, /HUBSPOT_DEFAULT_SCOPES|HUBSPOT_AUTHORIZE_URL/);
  assert.doesNotMatch(hubspotPage, /HUBSPOT_DEFAULT_SCOPES|HUBSPOT_AUTHORIZE_URL/);
});
