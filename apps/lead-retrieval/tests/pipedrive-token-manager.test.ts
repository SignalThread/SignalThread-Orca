import assert from "node:assert/strict";
import test from "node:test";
import {
  getValidPipedriveAccessTokenWithDeps,
  PipedriveTokenManagerError,
  type PipedriveTokenConnection,
  type PipedriveTokenManagerDeps
} from "../lib/integrations/pipedrive/token-manager-core";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function connection(overrides: Partial<PipedriveTokenConnection> = {}): PipedriveTokenConnection {
  return {
    id: "connection-1",
    status: "connected",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: "2026-08-15T11:59:00.000Z",
    scopes: ["base"],
    apiDomain: "https://acme.pipedrive.com",
    credentialVersion: 4,
    ...overrides
  };
}

function deps(overrides: Partial<PipedriveTokenManagerDeps> = {}): PipedriveTokenManagerDeps {
  return {
    loadConnection: async () => connection(),
    acquireRefreshLease: async () => true,
    waitForRefresh: async () => null,
    refreshToken: async () => ({
      ok: true,
      accessToken: "new-access",
      refreshToken: "rotated-refresh",
      expiresIn: 3600,
      apiDomain: "https://acme.pipedrive.com"
    }),
    persistRefresh: async (current, _lease, patch) => ({
      ...current,
      accessToken: patch.accessToken,
      refreshToken: patch.refreshToken,
      expiresAt: patch.expiresAt,
      apiDomain: patch.apiDomain,
      credentialVersion: current.credentialVersion + 1
    }),
    markFailure: async () => undefined,
    releaseRefreshLease: async () => undefined,
    now: () => NOW,
    createLeaseToken: () => "00000000-0000-4000-8000-000000000001",
    ...overrides
  };
}

test("unexpired access token is returned without refresh", async () => {
  let refreshCalls = 0;
  const result = await getValidPipedriveAccessTokenWithDeps(deps({
    loadConnection: async () => connection({ expiresAt: "2026-08-15T14:00:00.000Z" }),
    refreshToken: async () => { refreshCalls += 1; return { ok: false }; }
  }));
  assert.equal(result.ok && result.accessToken, "old-access");
  assert.equal(result.ok && result.refreshed, false);
  assert.equal(refreshCalls, 0);
});

test("expired token refreshes and persists a rotated refresh token", async () => {
  let persistedRefresh = "";
  const result = await getValidPipedriveAccessTokenWithDeps(deps({
    persistRefresh: async (current, _lease, patch) => {
      persistedRefresh = patch.refreshToken;
      return { ...current, ...patch, credentialVersion: current.credentialVersion + 1 };
    }
  }));
  assert.equal(result.ok && result.accessToken, "new-access");
  assert.equal(result.ok && result.refreshed, true);
  assert.equal(persistedRefresh, "rotated-refresh");
});

test("refresh failure is explicit and invalid_grant requires reconnect", async () => {
  let reconnect = false;
  const result = await getValidPipedriveAccessTokenWithDeps(deps({
    refreshToken: async () => ({ ok: false, errorCode: "invalid_grant" }),
    markFailure: async (_id, _lease, required) => { reconnect = required; }
  }));
  assert.deepEqual(result, { ok: false, code: "reconnect_required", refreshAttempted: true });
  assert.equal(reconnect, true);
});

test("provider transport failures mark the connection unhealthy", async () => {
  let markedCode = "";
  const result = await getValidPipedriveAccessTokenWithDeps(deps({
    refreshToken: async () => { throw new Error("network unavailable"); },
    markFailure: async (_id, _lease, _reconnect, code) => { markedCode = code; }
  }));
  assert.deepEqual(result, { ok: false, code: "refresh_failed", refreshAttempted: true });
  assert.equal(markedCode, "provider_refresh_failed");
});

test("optimistic persistence conflict cannot report stale credentials as valid", async () => {
  const result = await getValidPipedriveAccessTokenWithDeps(deps({
    persistRefresh: async () => null
  }));
  assert.deepEqual(result, { ok: false, code: "persistence_failed", refreshAttempted: true });
});

test("lease contention reuses a peer refresh without a second provider call", async () => {
  let refreshCalls = 0;
  const result = await getValidPipedriveAccessTokenWithDeps(deps({
    acquireRefreshLease: async () => false,
    waitForRefresh: async () => connection({
      accessToken: "peer-access",
      expiresAt: "2026-08-15T14:00:00.000Z"
    }),
    refreshToken: async () => { refreshCalls += 1; return { ok: false }; }
  }));
  assert.equal(result.ok && result.accessToken, "peer-access");
  assert.equal(refreshCalls, 0);
});

test("unreadable stored credentials explicitly require reconnect", async () => {
  const result = await getValidPipedriveAccessTokenWithDeps(deps({
    loadConnection: async () => {
      throw new PipedriveTokenManagerError("reconnect_required");
    }
  }));
  assert.deepEqual(result, { ok: false, code: "reconnect_required", refreshAttempted: false });
});
