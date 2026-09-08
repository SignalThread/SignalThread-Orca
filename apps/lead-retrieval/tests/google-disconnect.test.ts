import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { disconnectGoogleWorkspaceWithDeps } from "../lib/integrations/google/disconnect-core";
import { toMobileGoogleWorkspaceConnection } from "../lib/integrations/mobile-oauth/status-core";

test("disconnect removes local credentials before best-effort remote revocation", async () => {
  const events: string[] = [];
  const result = await disconnectGoogleWorkspaceWithDeps({
    loadConnection: async () => ({ connectionId: "conn-1", refreshToken: "secret" }),
    revokeToken: async (token) => { assert.equal(token, "secret"); events.push("revoke"); return { ok: true }; },
    deleteConnection: async () => { events.push("delete"); }
  });
  assert.deepEqual(events, ["delete", "revoke"]);
  assert.deepEqual(result, {
    disconnected: true,
    revocationConfirmed: true,
    revocationPending: false
  });
});

test("local disconnect succeeds while Google revocation fails", async () => {
  const events: string[] = [];
  const result = await disconnectGoogleWorkspaceWithDeps({
    loadConnection: async () => ({ connectionId: "conn-1", refreshToken: "secret" }),
    revokeToken: async () => { throw new Error("network"); },
    deleteConnection: async () => { events.push("delete"); }
  });
  assert.deepEqual(events, ["delete"]);
  assert.deepEqual(result, {
    disconnected: true,
    revocationConfirmed: false,
    revocationPending: true
  });
});

test("missing or unreadable revocation credentials never block local disconnect", async () => {
  let deleted = false;
  let providerCalls = 0;
  const result = await disconnectGoogleWorkspaceWithDeps({
    loadConnection: async () => ({ connectionId: "conn-1", refreshToken: null }),
    deleteConnection: async () => { deleted = true; },
    revokeToken: async () => { providerCalls += 1; return { ok: true }; }
  });
  assert.equal(deleted, true);
  assert.equal(providerCalls, 0);
  assert.equal(result.disconnected, true);
  assert.equal(result.revocationPending, true);
});

test("status is disconnected after the local connection is removed", async () => {
  let localConnectionExists = true;
  await disconnectGoogleWorkspaceWithDeps({
    loadConnection: async () => localConnectionExists
      ? { connectionId: "conn-1", refreshToken: "secret" }
      : null,
    deleteConnection: async () => { localConnectionExists = false; },
    revokeToken: async () => ({ ok: false })
  });
  assert.equal(localConnectionExists, false);
  const status = toMobileGoogleWorkspaceConnection({
    connected: false,
    status: "disconnected",
    identity: null,
    grantedScopes: [],
    capabilities: { gmailSend: false, calendarEventsOwned: false, calendarFreeBusy: false },
    isPartialGrant: false,
    expiresAt: null,
    connectedAt: null,
    lastRefreshAt: null,
    lastErrorCode: null
  });
  assert.equal(status.state, "disconnected");
});

test("mobile disconnect response is safe and reports local success separately from revocation", () => {
  const route = readFileSync(
    "app/api/mobile/integrations/connections/[provider]/route.ts",
    "utf8"
  );
  assert.match(route, /state = "disconnected"/);
  assert.match(route, /disconnected: result\.disconnected/);
  assert.match(route, /revocationPending: result\.revocationPending/);
  assert.doesNotMatch(route, /refreshToken|accessToken|providerError|error\.message/);
});
