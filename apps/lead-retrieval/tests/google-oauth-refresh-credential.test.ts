import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEncryptedGoogleCredentialRecord,
  deriveGoogleOAuthConsentAssessment,
  getGoogleOAuthAuthorizationAccessParameters,
  GoogleRefreshCredentialRequiredError,
  resolveGoogleRefreshCredential,
  type GoogleStoredConnectionState
} from "../lib/integrations/google/oauth-refresh-credential-core";

function assess(input: {
  explicitReconnect?: boolean;
  status?: GoogleStoredConnectionState | null;
  exists?: boolean;
  readable?: boolean;
}) {
  return deriveGoogleOAuthConsentAssessment({
    explicitReconnect: input.explicitReconnect === true,
    connectionStatus: input.status ?? null,
    storedRefreshCredentialExists: input.exists === true,
    storedRefreshCredentialReadable: input.readable === true
  });
}

test("first connection and connection after disconnect require offline consent", () => {
  for (const scenario of ["first_connection", "after_disconnect"]) {
    const result = assess({ status: null, exists: false, readable: false });
    assert.deepEqual(result, {
      requiresNewRefreshToken: true,
      reason: "missing_connection"
    }, scenario);
    assert.deepEqual(getGoogleOAuthAuthorizationAccessParameters(result.requiresNewRefreshToken), {
      accessType: "offline",
      prompt: "consent select_account"
    }, scenario);
  }
});

test("reconnect-required, invalid, missing, and unreadable credentials force consent", () => {
  const scenarios = [
    assess({ status: "reconnect_required", exists: true, readable: true }),
    assess({ status: "error", exists: true, readable: true }),
    assess({ status: "revocation_pending", exists: true, readable: true }),
    assess({ status: "connected", exists: false, readable: false }),
    assess({ status: "connected", exists: true, readable: false }),
    assess({ explicitReconnect: true, status: "connected", exists: true, readable: true })
  ];
  for (const result of scenarios) {
    assert.equal(result.requiresNewRefreshToken, true);
    assert.equal(
      getGoogleOAuthAuthorizationAccessParameters(result.requiresNewRefreshToken).prompt,
      "consent select_account"
    );
  }
});

test("healthy readable refresh credential keeps offline access without unnecessary consent", () => {
  const result = assess({ status: "connected", exists: true, readable: true });
  assert.deepEqual(result, {
    requiresNewRefreshToken: false,
    reason: "healthy_refresh_credential"
  });
  assert.deepEqual(getGoogleOAuthAuthorizationAccessParameters(result.requiresNewRefreshToken), {
    accessType: "offline",
    prompt: "select_account"
  });
});

test("new refresh token is selected, encrypted, and included in the canonical persistence record", () => {
  let decryptCalls = 0;
  const selected = resolveGoogleRefreshCredential({
    newRefreshToken: "new-refresh-token",
    existingRefreshCredentialEncrypted: "existing-ciphertext",
    decryptExisting: () => {
      decryptCalls += 1;
      return "old-refresh-token";
    }
  });
  assert.deepEqual(selected, { refreshToken: "new-refresh-token", source: "new" });
  assert.equal(decryptCalls, 0);

  const encryptedInputs: Array<{ plaintext: string; kind: string }> = [];
  const record = buildEncryptedGoogleCredentialRecord({
    connectionId: "connection-1",
    accessToken: "new-access-token",
    refreshToken: selected.refreshToken,
    activeKeyId: "key-v2",
    encrypt: (plaintext, kind) => {
      encryptedInputs.push({ plaintext, kind });
      return `encrypted:${kind}:${plaintext}`;
    }
  });
  assert.deepEqual(encryptedInputs, [
    { plaintext: "new-access-token", kind: "access_token" },
    { plaintext: "new-refresh-token", kind: "refresh_token" }
  ]);
  assert.deepEqual(record, {
    connection_id: "connection-1",
    access_token_encrypted: "encrypted:access_token:new-access-token",
    refresh_token_encrypted: "encrypted:refresh_token:new-refresh-token",
    encryption_key_version: "key-v2"
  });

  const service = readFileSync("lib/integrations/google/connection-service.ts", "utf8");
  assert.match(service, /\.upsert\(encryptedCredentialRecord\)/);
});

test("omitted refresh token preserves an existing usable encrypted credential", () => {
  const selected = resolveGoogleRefreshCredential({
    newRefreshToken: undefined,
    existingRefreshCredentialEncrypted: "stored-ciphertext",
    decryptExisting: (encrypted) => {
      assert.equal(encrypted, "stored-ciphertext");
      return "existing-refresh-token";
    }
  });
  assert.deepEqual(selected, { refreshToken: "existing-refresh-token", source: "existing" });

  const record = buildEncryptedGoogleCredentialRecord({
    connectionId: "connection-1",
    accessToken: "rotated-access-token",
    refreshToken: selected.refreshToken,
    activeKeyId: "key-v1",
    encrypt: (plaintext, kind) => `encrypted:${kind}:${plaintext}`
  });
  assert.equal(record.refresh_token_encrypted, "encrypted:refresh_token:existing-refresh-token");
  assert.notEqual(record.refresh_token_encrypted, null);
});

test("omitted refresh token with no usable stored credential fails safely", () => {
  for (const existingRefreshCredentialEncrypted of [null, ""]) {
    assert.throws(
      () =>
        resolveGoogleRefreshCredential({
          newRefreshToken: null,
          existingRefreshCredentialEncrypted,
          decryptExisting: () => ""
        }),
      GoogleRefreshCredentialRequiredError
    );
  }
  assert.throws(
    () =>
      resolveGoogleRefreshCredential({
        newRefreshToken: undefined,
        existingRefreshCredentialEncrypted: "unreadable-ciphertext",
        decryptExisting: () => {
          throw new Error("Encrypted secret could not be authenticated.");
        }
      }),
    /could not be authenticated/
  );
});

test("authorization and persistence remain server-derived and never write a null refresh credential", () => {
  const launch = readFileSync("lib/integrations/google/oauth-launch-service.ts", "utf8");
  const oauthClient = readFileSync("lib/integrations/google/oauth-client.ts", "utf8");
  const service = readFileSync("lib/integrations/google/connection-service.ts", "utf8");

  assert.match(launch, /assessGoogleOAuthConsentRequirement/);
  assert.match(launch, /\.eq\("user_id", input\.userId\)/);
  assert.match(launch, /\.eq\("company_id", input\.companyId\)/);
  assert.match(launch, /consent\.requiresNewRefreshToken/);
  assert.match(oauthClient, /access\.accessType/);
  assert.match(oauthClient, /access\.prompt/);
  assert.match(service, /resolveGoogleRefreshCredential/);
  assert.match(service, /buildEncryptedGoogleCredentialRecord/);
  assert.doesNotMatch(service, /refresh_token_encrypted:\s*(?:null|input\.refreshToken)/);
});
