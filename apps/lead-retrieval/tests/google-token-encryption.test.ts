import assert from "node:assert/strict";
import test from "node:test";
import {
  createSecretKeyringConfigurationDiagnostic,
  decryptSecret,
  encryptSecret,
  loadIntegrationSecretKeyringFromEnvironment,
  parseSecretKeyring
} from "../lib/security/encrypted-secret";

const oldKey = Buffer.alloc(32, 1).toString("base64");
const newKey = Buffer.alloc(32, 2).toString("base64");
const keyring = parseSecretKeyring({
  activeKeyId: "v2",
  serializedKeys: JSON.stringify({ v1: oldKey, v2: newKey })
});

test("Google credentials round-trip without plaintext in the encrypted envelope", () => {
  const envelope = encryptSecret("refresh-secret", "google_workspace:conn-1:refresh_token", keyring);
  assert.match(envelope, /^v1:v2:/);
  assert.equal(envelope.includes("refresh-secret"), false);
  assert.equal(
    decryptSecret(envelope, "google_workspace:conn-1:refresh_token", keyring),
    "refresh-secret"
  );
});

test("encrypted credentials cannot be moved to a different connection or token kind", () => {
  const envelope = encryptSecret("access-secret", "google_workspace:conn-1:access_token", keyring);
  assert.throws(
    () => decryptSecret(envelope, "google_workspace:conn-2:access_token", keyring),
    /authenticated/i
  );
  assert.throws(
    () => decryptSecret(envelope, "google_workspace:conn-1:refresh_token", keyring),
    /authenticated/i
  );
});

test("keyring validates key size and retains previous keys for rotation", () => {
  assert.equal(keyring.keys.has("v1"), true);
  assert.equal(keyring.keys.has("v2"), true);
  assert.throws(
    () => parseSecretKeyring({ activeKeyId: "bad", serializedKeys: JSON.stringify({ bad: "c2hvcnQ=" }) }),
    /32 bytes/i
  );
});

test("single v1 production-shaped configuration requires and selects the explicit active version", () => {
  const singleKeyring = parseSecretKeyring({
    activeKeyId: "v1",
    serializedKeys: JSON.stringify({ v1: oldKey })
  });
  assert.equal(singleKeyring.activeKeyId, "v1");
  assert.equal(singleKeyring.keys.get("v1")?.length, 32);
  assert.throws(
    () => parseSecretKeyring({ activeKeyId: undefined, serializedKeys: JSON.stringify({ v1: oldKey }) }),
    /INTEGRATION_SECRET_ACTIVE_KEY_ID is not configured/
  );
});

test("quoted JSON strings are rejected instead of being ambiguously double-decoded", () => {
  const quoted = JSON.stringify(JSON.stringify({ v1: oldKey }));
  assert.throws(
    () => parseSecretKeyring({ activeKeyId: "v1", serializedKeys: quoted }),
    /key-id to base64-key object/
  );
});

test("malformed JSON and missing active key versions fail with distinct safe errors", () => {
  assert.throws(
    () => parseSecretKeyring({ activeKeyId: "v1", serializedKeys: "{not-json" }),
    /must be valid JSON/
  );
  assert.throws(
    () => parseSecretKeyring({ activeKeyId: "v2", serializedKeys: JSON.stringify({ v1: oldKey }) }),
    /active integration encryption key is missing/
  );
});

test("invalid Base64 and decoded keys other than 32 bytes are rejected", () => {
  const invalidBase64 = oldKey.replace(oldKey[0]!, "!");
  assert.throws(
    () => parseSecretKeyring({ activeKeyId: "v1", serializedKeys: JSON.stringify({ v1: invalidBase64 }) }),
    /valid standard Base64/
  );
  assert.throws(
    () =>
      parseSecretKeyring({
        activeKeyId: "v1",
        serializedKeys: JSON.stringify({ v1: Buffer.alloc(31, 1).toString("base64") })
      }),
    /32 bytes/
  );
});

test("configuration diagnostics expose shape only and never leak key material", () => {
  const diagnostic = createSecretKeyringConfigurationDiagnostic(
    {
      activeKeyId: undefined,
      serializedKeys: JSON.stringify({ v1: oldKey })
    },
    "nodejs"
  );
  assert.deepEqual(diagnostic, {
    variable_present: true,
    raw_value_length: JSON.stringify({ v1: oldKey }).length,
    json_parse_succeeded: true,
    key_versions: ["v1"],
    active_key_version: null,
    active_key_present: false,
    decoded_key_byte_length: null,
    runtime: "nodejs"
  });
  assert.equal(JSON.stringify(diagnostic).includes(oldKey), false);
});

test("the runtime loader diagnoses the Production missing-active-selector failure safely", () => {
  const diagnostics: ReturnType<typeof createSecretKeyringConfigurationDiagnostic>[] = [];
  assert.throws(
    () =>
      loadIntegrationSecretKeyringFromEnvironment({
        environment: {
          INTEGRATION_SECRET_ENCRYPTION_KEYS: JSON.stringify({ v1: oldKey })
        },
        runtime: "nodejs",
        logger: (diagnostic) => diagnostics.push(diagnostic)
      }),
    /INTEGRATION_SECRET_ACTIVE_KEY_ID is not configured/
  );
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(diagnostics[0], {
    variable_present: true,
    raw_value_length: JSON.stringify({ v1: oldKey }).length,
    json_parse_succeeded: true,
    key_versions: ["v1"],
    active_key_version: null,
    active_key_present: false,
    decoded_key_byte_length: null,
    runtime: "nodejs"
  });
  assert.equal(JSON.stringify(diagnostics).includes(oldKey), false);
});
