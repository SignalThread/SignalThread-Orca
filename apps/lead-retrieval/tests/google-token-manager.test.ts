import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GoogleTokenManagerStageError,
  getValidGoogleAccessTokenWithDeps,
  type GoogleTokenConnection,
  type GoogleTokenManagerDeps
} from "../lib/integrations/google/token-manager-core";

const NOW = new Date("2026-07-30T12:00:00.000Z");

function connection(overrides: Partial<GoogleTokenConnection> = {}): GoogleTokenConnection {
  return {
    id: "connection-1",
    status: "connected",
    accessToken: "old-access",
    refreshToken: "refresh-token",
    expiresAt: "2026-07-30T11:59:00.000Z",
    grantedScopes: ["openid", "email", "profile"],
    ...overrides
  };
}

function deps(overrides: Partial<GoogleTokenManagerDeps> = {}): GoogleTokenManagerDeps {
  return {
    loadConnection: async () => connection(),
    acquireRefreshLease: async () => true,
    waitForRefreshCompletion: async () => null,
    refreshToken: async () => ({ ok: true, accessToken: "new-access", refreshToken: "rotated-refresh", expiresIn: 3600 }),
    persistRefresh: async (current, _lease, patch) => ({ ...current, accessToken: patch.accessToken, refreshToken: patch.refreshToken, expiresAt: patch.expiresAt }),
    markReconnectRequired: async () => undefined,
    markRefreshError: async () => undefined,
    releaseRefreshLease: async () => undefined,
    now: () => NOW,
    createLeaseToken: () => "00000000-0000-4000-8000-000000000001",
    ...overrides
  };
}

test("canonical manager refreshes an expiring token and persists rotation", async () => {
  let persistedRefresh = "";
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    persistRefresh: async (current, _lease, patch) => {
      persistedRefresh = patch.refreshToken;
      return { ...current, accessToken: patch.accessToken, refreshToken: patch.refreshToken, expiresAt: patch.expiresAt };
    }
  }));
  assert.deepEqual(result, {
    ok: true,
    accessToken: "new-access",
    expiresAt: "2026-07-30T13:00:00.000Z",
    refreshed: true,
    refreshAttempted: true
  });
  assert.equal(persistedRefresh, "rotated-refresh");
});

test("manager reuses a peer refresh when the database lease is contended", async () => {
  let providerCalls = 0;
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    acquireRefreshLease: async () => false,
    waitForRefreshCompletion: async () => connection({ accessToken: "peer-access", expiresAt: "2026-07-30T13:00:00.000Z" }),
    refreshToken: async () => {
      providerCalls += 1;
      return { ok: true, accessToken: "should-not-run" };
    }
  }));
  assert.equal(result.ok && result.accessToken, "peer-access");
  assert.equal(result.ok && result.refreshAttempted, false);
  assert.equal(providerCalls, 0);
});

test("invalid_grant marks reconnect required and never persists new credentials", async () => {
  let reconnectCode = "";
  let persisted = false;
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    refreshToken: async () => ({ ok: false, status: 400, code: "invalid_grant", message: "revoked" }),
    markReconnectRequired: async (_id, _lease, code) => { reconnectCode = code; },
    persistRefresh: async () => { persisted = true; throw new Error("must not persist"); }
  }));
  assert.deepEqual(result, {
    ok: false,
    reason: "reconnect_required",
    stage: "provider_refresh_request",
    category: "reconnect_required",
    refreshAttempted: true
  });
  assert.equal(reconnectCode, "invalid_grant");
  assert.equal(persisted, false);
});

test("unexpired access tokens avoid refresh and lease acquisition", async () => {
  let leaseCalls = 0;
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    loadConnection: async () => connection({ expiresAt: "2026-07-30T14:00:00.000Z" }),
    acquireRefreshLease: async () => { leaseCalls += 1; return true; }
  }));
  assert.equal(result.ok && result.refreshed, false);
  assert.equal(result.ok && result.refreshAttempted, false);
  assert.equal(leaseCalls, 0);
});

test("connection lookup failures retain their internal stage and do not claim a refresh", async () => {
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    loadConnection: async () => {
      throw new GoogleTokenManagerStageError("connection_lookup", "credential_storage_error");
    }
  }));
  assert.deepEqual(result, {
    ok: false,
    reason: "refresh_failed",
    stage: "connection_lookup",
    category: "credential_storage_error",
    refreshAttempted: false
  });
});

test("credential lookup failures retain their internal stage", async () => {
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    loadConnection: async () => {
      throw new GoogleTokenManagerStageError("credential_lookup", "credential_storage_error");
    }
  }));
  assert.equal(!result.ok && result.stage, "credential_lookup");
  assert.equal(!result.ok && result.category, "credential_storage_error");
  assert.equal(!result.ok && result.refreshAttempted, false);
});

test("access-token decryption failures are distinguished from provider failures", async () => {
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    loadConnection: async () => {
      throw new GoogleTokenManagerStageError("access_token_decryption", "credential_decryption_error");
    }
  }));
  assert.equal(!result.ok && result.stage, "access_token_decryption");
  assert.equal(!result.ok && result.category, "credential_decryption_error");
  assert.equal(!result.ok && result.refreshAttempted, false);
});

test("refresh-token decryption failures are distinguished from provider failures", async () => {
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    loadConnection: async () => {
      throw new GoogleTokenManagerStageError("refresh_token_decryption", "credential_decryption_error");
    }
  }));
  assert.equal(!result.ok && result.stage, "refresh_token_decryption");
  assert.equal(!result.ok && result.category, "credential_decryption_error");
  assert.equal(!result.ok && result.refreshAttempted, false);
});

test("malformed token expiration is rejected before lease acquisition", async () => {
  let leaseCalls = 0;
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    loadConnection: async () => connection({ expiresAt: "not-an-rfc3339-date" }),
    acquireRefreshLease: async () => { leaseCalls += 1; return true; }
  }));
  assert.equal(!result.ok && result.stage, "expiration_parsing");
  assert.equal(!result.ok && result.category, "invalid_expiration");
  assert.equal(!result.ok && result.refreshAttempted, false);
  assert.equal(leaseCalls, 0);
});

test("missing stored refresh credentials require reconnect", async () => {
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    loadConnection: async () => connection({ refreshToken: "" })
  }));
  assert.equal(!result.ok && result.stage, "refresh_decision");
  assert.equal(!result.ok && result.category, "reconnect_required");
  assert.equal(!result.ok && result.reason, "reconnect_required");
  assert.equal(!result.ok && result.refreshAttempted, false);
});

test("invalid stored refresh credentials return reconnect_required", async () => {
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    loadConnection: async () => {
      throw new GoogleTokenManagerStageError(
        "refresh_token_decryption",
        "reconnect_required"
      );
    }
  }));
  assert.deepEqual(result, {
    ok: false,
    reason: "reconnect_required",
    stage: "refresh_token_decryption",
    category: "reconnect_required",
    refreshAttempted: false
  });
});

test("mobile status validates credentials before returning connection state", () => {
  const source = readFileSync("app/api/mobile/integrations/connections/route.ts", "utf8");
  const validation = source.indexOf("getValidGoogleAccessTokenForUser");
  const status = source.indexOf("getGoogleWorkspaceConnectionStatus", validation);
  assert.ok(validation >= 0 && status > validation);
  assert.doesNotMatch(source, /accessToken|refreshToken|providerError/);
});

test("refresh-lease acquisition failures retain their internal category", async () => {
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    acquireRefreshLease: async () => {
      throw new GoogleTokenManagerStageError("refresh_lease_acquisition", "refresh_lease_error");
    }
  }));
  assert.equal(!result.ok && result.stage, "refresh_lease_acquisition");
  assert.equal(!result.ok && result.category, "refresh_lease_error");
  assert.equal(!result.ok && result.refreshAttempted, false);
});

test("refresh configuration failure is reported before calling Google's token endpoint", async () => {
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    refreshToken: async () => {
      throw new GoogleTokenManagerStageError("provider_refresh_request", "configuration_error", false);
    }
  }));
  assert.equal(!result.ok && result.stage, "provider_refresh_request");
  assert.equal(!result.ok && result.category, "configuration_error");
  assert.equal(!result.ok && result.refreshAttempted, false);
});

test("provider refresh failures accurately report that Google was called", async () => {
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    refreshToken: async () => ({ ok: false, status: 500, code: "temporarily_unavailable", message: "temporary" })
  }));
  assert.equal(!result.ok && result.stage, "provider_refresh_request");
  assert.equal(!result.ok && result.category, "provider_refresh_error");
  assert.equal(!result.ok && result.refreshAttempted, true);
});

test("refreshed credential persistence failures are distinct from provider failures", async () => {
  const result = await getValidGoogleAccessTokenWithDeps(deps({
    persistRefresh: async () => {
      throw new GoogleTokenManagerStageError("refreshed_credential_persistence", "refresh_persistence_error", true);
    }
  }));
  assert.equal(!result.ok && result.stage, "refreshed_credential_persistence");
  assert.equal(!result.ok && result.category, "refresh_persistence_error");
  assert.equal(!result.ok && result.refreshAttempted, true);
});

test("database lease acquisition uses atomic null and expired predicates without PATCH OR", () => {
  const source = readFileSync("lib/integrations/google/token-manager.ts", "utf8");
  assert.match(source, /\.is\("refresh_lease_until", null\)/);
  assert.match(source, /\.lt\("refresh_lease_until", now\)/);
  assert.doesNotMatch(source, /\.or\(`refresh_lease_until/);
});
