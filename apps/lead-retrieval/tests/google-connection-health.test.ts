import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deriveGoogleWorkspaceConnectionHealth,
  hasAllRequiredGoogleWorkspaceScopes,
  successfulGoogleConnectionActivationPatch,
  verifyPersistedGoogleRefreshCredential
} from "../lib/integrations/google/connection-health-core";
import {
  emitGoogleConnectionDiagnostic,
  type GoogleConnectionDiagnostic
} from "../lib/integrations/google/connection-diagnostics";
import {
  decryptSecret,
  encryptSecret,
  parseSecretKeyring
} from "../lib/security/encrypted-secret";
import {
  getGoogleWorkspaceCapabilities,
  GOOGLE_WORKSPACE_SCOPES
} from "../lib/integrations/google/scopes";

const REQUIRED_SCOPES = [...GOOGLE_WORKSPACE_SCOPES];

test("Gmail-only grants are not Calendar-capable while the complete grant is", () => {
  const gmailOnly = getGoogleWorkspaceCapabilities([
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.send"
  ]);
  assert.deepEqual(gmailOnly, {
    gmailSend: true,
    calendarEventsOwned: false,
    calendarFreeBusy: false
  });
  assert.deepEqual(getGoogleWorkspaceCapabilities(REQUIRED_SCOPES), {
    gmailSend: true,
    calendarEventsOwned: true,
    calendarFreeBusy: true
  });
});

test("reconnect-required transitions to connected only after verified OAuth persistence", () => {
  const before = deriveGoogleWorkspaceConnectionHealth({
    persistedStatus: "reconnect_required",
    grantedScopes: REQUIRED_SCOPES,
    refreshCredentialState: "missing"
  });
  assert.equal(before.status, "reconnect_required");
  assert.equal(before.connected, false);

  const activation = successfulGoogleConnectionActivationPatch("2026-08-06T04:00:00.000Z");
  const after = deriveGoogleWorkspaceConnectionHealth({
    persistedStatus: activation.status,
    grantedScopes: REQUIRED_SCOPES,
    refreshCredentialState: "usable"
  });
  assert.equal(after.status, "connected");
  assert.equal(after.connected, true);
  assert.equal(after.capabilities.gmailSend, true);
  assert.equal(after.capabilities.calendarEventsOwned, true);
  assert.equal(after.capabilities.calendarFreeBusy, true);
});

test("successful OAuth activation clears stale lifecycle and provider failure metadata", () => {
  assert.deepEqual(successfulGoogleConnectionActivationPatch("2026-08-06T04:00:00.000Z"), {
    status: "connected",
    connected_at: "2026-08-06T04:00:00.000Z",
    last_refresh_at: null,
    last_refresh_attempt_at: null,
    last_error_at: null,
    last_error_code: null,
    refresh_lease_token: null,
    refresh_lease_until: null
  });
});

test("missing or unreadable refresh credentials remain reconnect-required and disable capabilities", () => {
  for (const refreshCredentialState of ["missing", "unreadable"] as const) {
    const status = deriveGoogleWorkspaceConnectionHealth({
      persistedStatus: "connected",
      grantedScopes: REQUIRED_SCOPES,
      refreshCredentialState
    });
    assert.equal(status.status, "reconnect_required");
    assert.equal(status.connected, false);
    assert.deepEqual(status.capabilities, {
      gmailSend: false,
      calendarEventsOwned: false,
      calendarFreeBusy: false
    });
  }
});

test("persisted refresh credential authenticates with the configured keyring and exact context", () => {
  const keyring = parseSecretKeyring({
    activeKeyId: "test-v1",
    serializedKeys: JSON.stringify({ "test-v1": Buffer.alloc(32, 7).toString("base64") })
  });
  const context = "google_workspace:connection-1:refresh_token";
  const encrypted = encryptSecret("refresh-value", context, keyring);
  assert.equal(
    verifyPersistedGoogleRefreshCredential({
      encryptedRefreshCredential: encrypted,
      expectedRefreshCredential: "refresh-value",
      decrypt: (value) => decryptSecret(value, context, keyring)
    }),
    true
  );
  assert.equal(
    verifyPersistedGoogleRefreshCredential({
      encryptedRefreshCredential: encrypted,
      expectedRefreshCredential: "refresh-value",
      decrypt: (value) => decryptSecret(value, "google_workspace:other:refresh_token", keyring)
    }),
    false
  );
});

test("callback verifies the stored credential before the final connected transition", () => {
  const source = readFileSync("lib/integrations/google/connection-service.ts", "utf8");
  const secretWrite = source.indexOf(".upsert(encryptedCredentialRecord)");
  const readBack = source.indexOf("refresh_token_encrypted", secretWrite);
  const verify = source.indexOf("verifyPersistedGoogleRefreshCredential", readBack);
  const activate = source.indexOf("successfulGoogleConnectionActivationPatch", verify);
  assert.ok(secretWrite >= 0 && readBack > secretWrite && verify > readBack && activate > verify);
  assert.match(source, /last_error_code: "credential_persistence_pending"/);
  assert.doesNotMatch(
    source.slice(source.indexOf("const secretError"), source.indexOf("const keyring", secretWrite)),
    /google_workspace_connection_secrets[\s\S]*\.delete\(\)/
  );
});

test("status and Gmail/Calendar actions share credential usability enforcement", () => {
  const status = readFileSync("lib/integrations/google/connection-status.ts", "utf8");
  const mobileStatus = readFileSync("app/api/mobile/integrations/connections/route.ts", "utf8");
  const email = readFileSync("lib/integrations/email/provider-adapters.ts", "utf8");
  const compatibility = readFileSync("lib/integrations/google/email-send-service.ts", "utf8");
  const calendar = readFileSync("lib/integrations/google/calendar-service.ts", "utf8");
  assert.match(status, /decryptSecret\(/);
  assert.match(status, /deriveGoogleWorkspaceConnectionHealth/);
  assert.match(mobileStatus, /getValidGoogleAccessTokenForUser/);
  assert.match(email, /getValidGoogleAccessTokenForUser/);
  assert.match(compatibility, /sendFollowUpEmail/);
  assert.match(calendar, /getValidGoogleAccessTokenForUser/);
  assert.equal(hasAllRequiredGoogleWorkspaceScopes(REQUIRED_SCOPES), true);
});

test("connection diagnostics expose only safe health booleans and lifecycle fields", () => {
  const events: Array<{ level: string; diagnostic: GoogleConnectionDiagnostic }> = [];
  emitGoogleConnectionDiagnostic({
    level: "warn",
    diagnostic: {
      stage: "status_calculation",
      safe_error_category: "credential_missing",
      connection_row_matched: true,
      refresh_credential_present: false,
      refresh_credential_decryptable: false,
      persisted_status: "connected",
      effective_status: "reconnect_required",
      required_scopes_granted: true
    },
    logger: (level, diagnostic) => events.push({ level, diagnostic })
  });
  assert.equal(events.length, 1);
  const serialized = JSON.stringify(events[0]);
  assert.doesNotMatch(serialized, /access_token|refresh_token|authorization|ciphertext|credential-value/i);
});
