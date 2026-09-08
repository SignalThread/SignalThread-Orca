import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildHubSpotRevokeBody,
  disconnectHubSpotIntegrationForAccount,
  HUBSPOT_REVOKE_ENDPOINT,
  HubSpotDisconnectError,
  isHubSpotTokenAlreadyInvalidResponse,
  revokeHubSpotRefreshToken,
  type HubSpotDisconnectIntegrationRow,
  type HubSpotDisconnectStore,
} from "../lib/integrations/hubspot/disconnect";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function fakeStore(initialRow: HubSpotDisconnectIntegrationRow | null) {
  let row = initialRow;
  let deleted = false;
  const store: HubSpotDisconnectStore = {
    async load(accountId) {
      return row?.account_id === accountId ? row : null;
    },
    async delete(target) {
      if (row?.id === target.id) {
        deleted = true;
        row = null;
      }
    },
  };
  return {
    store,
    get deleted() {
      return deleted;
    },
  };
}

const connectedRow: HubSpotDisconnectIntegrationRow = {
  id: "integration-1",
  account_id: "company-1",
  provider: "hubspot",
  refresh_token: "refresh-secret",
};

test("HubSpot disconnect page renders visible disconnect affordance and dialog copy", () => {
  const pageSource = read("app/(app)/exhibitor/integrations/hubspot/page.tsx");
  const buttonSource = read("components/exhibitor/hubspot-disconnect-button.tsx");

  assert.match(pageSource, /<HubSpotDisconnectButton \/>/);
  assert.match(pageSource, /Connected/);
  assert.match(pageSource, /Not connected/);
  assert.match(buttonSource, /Disconnect HubSpot/);
  assert.match(buttonSource, /Disconnect HubSpot\?/);
  assert.match(buttonSource, /Existing leads in SignalThread will\s*\n\s*remain unchanged/);
  assert.match(buttonSource, /\/api\/exhibitor\/integrations\/hubspot\/disconnect/);
  assert.match(buttonSource, /router\.refresh\(\)/);
});

test("HubSpot disconnect confirmation cancel closes without calling disconnect", () => {
  const buttonSource = read("components/exhibitor/hubspot-disconnect-button.tsx");

  assert.match(buttonSource, />\s*Cancel\s*</);
  assert.match(buttonSource, /onClick=\{\(\) => \{\s*setDialogOpen\(false\);\s*setError\(null\);/);
  assert.doesNotMatch(buttonSource, /Cancel[\s\S]*fetch\("\/api\/exhibitor\/integrations\/hubspot\/disconnect"/);
});

test("HubSpot revoke request uses the 2026-03 revoke endpoint and form payload", async () => {
  let requestedUrl = "";
  let requestedBody = "";
  const fetchImpl = (async (url, init) => {
    requestedUrl = String(url);
    requestedBody = String(init?.body ?? "");
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const result = await revokeHubSpotRefreshToken("refresh-secret", {
    clientId: "client-id",
    clientSecret: "client-secret",
    fetchImpl,
  });

  assert.equal(requestedUrl, HUBSPOT_REVOKE_ENDPOINT);
  assert.equal(result.revoked, true);
  assert.equal(new URLSearchParams(requestedBody).get("client_id"), "client-id");
  assert.equal(new URLSearchParams(requestedBody).get("client_secret"), "client-secret");
  assert.equal(new URLSearchParams(requestedBody).get("token"), "refresh-secret");
  assert.equal(new URLSearchParams(requestedBody).get("token_type_hint"), "refresh_token");
});

test("HubSpot revoke invalid or already-revoked token is treated as locally clearable", async () => {
  assert.equal(isHubSpotTokenAlreadyInvalidResponse(400, '{"error":"invalid_token"}'), true);
  assert.equal(isHubSpotTokenAlreadyInvalidResponse(400, "already revoked"), true);
  assert.equal(isHubSpotTokenAlreadyInvalidResponse(400, '{"error":"invalid_client"}'), false);

  const state = fakeStore(connectedRow);
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 })) as typeof fetch;

  const result = await disconnectHubSpotIntegrationForAccount("company-1", {
    store: state.store,
    clientId: "client-id",
    clientSecret: "client-secret",
    fetchImpl,
  });

  assert.equal(result.disconnected, true);
  assert.equal(result.remoteAlreadyInvalid, true);
  assert.equal(state.deleted, true);
});

test("HubSpot network failure does not clear local credentials", async () => {
  const state = fakeStore(connectedRow);
  const fetchImpl = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  await assert.rejects(
    () =>
      disconnectHubSpotIntegrationForAccount("company-1", {
        store: state.store,
        clientId: "client-id",
        clientSecret: "client-secret",
        fetchImpl,
      }),
    (error) => error instanceof HubSpotDisconnectError && error.code === "REVOKE_FAILED"
  );

  assert.equal(state.deleted, false);
});

test("HubSpot disconnect clears local row when no refresh token is stored", async () => {
  const state = fakeStore({ ...connectedRow, refresh_token: null });
  const fetchImpl = (async () => {
    throw new Error("fetch should not be called without a refresh token");
  }) as typeof fetch;

  const result = await disconnectHubSpotIntegrationForAccount("company-1", {
    store: state.store,
    fetchImpl,
  });

  assert.equal(result.disconnected, true);
  assert.equal(state.deleted, true);
});

test("HubSpot disconnect route enforces auth and never returns token values", () => {
  const routeSource = read("app/api/exhibitor/integrations/hubspot/disconnect/route.ts");

  assert.match(routeSource, /getCurrentSessionUser/);
  assert.match(routeSource, /Unauthorized/);
  assert.match(routeSource, /sessionUser\.role !== "exhibitor_admin"/);
  assert.match(routeSource, /sessionUser\.company_id/);
  assert.match(routeSource, /disconnectHubSpotIntegrationForAccount\(sessionUser\.company_id\)/);
  assert.match(routeSource, /success: true, disconnected: true/);
  assert.doesNotMatch(routeSource, /access_token|refresh_token|client_secret|token:/);
});

test("HubSpot revoke body builder keeps token values server-side only", () => {
  const body = buildHubSpotRevokeBody({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-secret",
  });

  assert.equal(body.get("client_id"), "client-id");
  assert.equal(body.get("client_secret"), "client-secret");
  assert.equal(body.get("token"), "refresh-secret");
  assert.equal(body.get("token_type_hint"), "refresh_token");
});
