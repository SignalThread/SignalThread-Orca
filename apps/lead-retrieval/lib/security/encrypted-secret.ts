import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export type SecretKeyring = {
  activeKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
};

export type SecretKeyringConfigurationDiagnostic = {
  variable_present: boolean;
  raw_value_length: number;
  json_parse_succeeded: boolean;
  key_versions: string[];
  active_key_version: string | null;
  active_key_present: boolean;
  decoded_key_byte_length: number | null;
  runtime: "nodejs" | "edge";
};

type SecretKeyringInput = {
  activeKeyId: string | undefined;
  serializedKeys: string | undefined;
};

type InspectedSecretKeyringInput = {
  activeKeyId: string;
  parsed: unknown;
  diagnostic: SecretKeyringConfigurationDiagnostic;
};

const SAFE_KEY_ID = /^[A-Za-z0-9_.-]{1,80}$/;
const STANDARD_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function inspectSecretKeyringInput(
  input: SecretKeyringInput,
  runtime: "nodejs" | "edge" = "nodejs"
): InspectedSecretKeyringInput {
  const serializedKeys = input.serializedKeys;
  const activeKeyId = String(input.activeKeyId ?? "").trim();
  let parsed: unknown;
  let jsonParseSucceeded = false;
  if (serializedKeys) {
    try {
      parsed = JSON.parse(serializedKeys);
      jsonParseSucceeded = true;
    } catch {
      parsed = undefined;
    }
  }
  const parsedRecord =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const keyVersions = parsedRecord
    ? Object.keys(parsedRecord).filter((keyId) => SAFE_KEY_ID.test(keyId))
    : [];
  const activeValue = activeKeyId && parsedRecord ? parsedRecord[activeKeyId] : undefined;
  let decodedKeyByteLength: number | null = null;
  if (typeof activeValue === "string" && STANDARD_BASE64.test(activeValue.trim())) {
    decodedKeyByteLength = Buffer.from(activeValue.trim(), "base64").length;
  }
  return {
    activeKeyId,
    parsed,
    diagnostic: {
      variable_present: Boolean(serializedKeys),
      raw_value_length: serializedKeys?.length ?? 0,
      json_parse_succeeded: jsonParseSucceeded,
      key_versions: keyVersions,
      active_key_version: activeKeyId && SAFE_KEY_ID.test(activeKeyId) ? activeKeyId : null,
      active_key_present: typeof activeValue === "string",
      decoded_key_byte_length: decodedKeyByteLength,
      runtime
    }
  };
}

export function createSecretKeyringConfigurationDiagnostic(
  input: SecretKeyringInput,
  runtime: "nodejs" | "edge" = "nodejs"
) {
  return inspectSecretKeyringInput(input, runtime).diagnostic;
}

function decodeKey(value: string, keyId: string) {
  const encoded = value.trim();
  if (!encoded || !STANDARD_BASE64.test(encoded)) {
    throw new Error("Integration encryption keys must use valid standard Base64.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.toString("base64") !== encoded) {
    throw new Error("Integration encryption keys must use canonical standard Base64.");
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(`Encryption key ${keyId} must decode to exactly ${KEY_BYTES} bytes.`);
  }
  return key;
}

export function parseSecretKeyring(input: SecretKeyringInput): SecretKeyring {
  const inspected = inspectSecretKeyringInput(input);
  if (!input.serializedKeys) {
    throw new Error("INTEGRATION_SECRET_ENCRYPTION_KEYS is not configured.");
  }
  if (!inspected.activeKeyId) {
    throw new Error("INTEGRATION_SECRET_ACTIVE_KEY_ID is not configured.");
  }
  if (!inspected.diagnostic.json_parse_succeeded) {
    throw new Error("INTEGRATION_SECRET_ENCRYPTION_KEYS must be valid JSON.");
  }
  const raw = inspected.parsed;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("INTEGRATION_SECRET_ENCRYPTION_KEYS must be a key-id to base64-key object.");
  }

  const keys = new Map<string, Buffer>();
  for (const [keyId, value] of Object.entries(raw)) {
    if (typeof value !== "string" || !SAFE_KEY_ID.test(keyId)) continue;
    keys.set(keyId, decodeKey(value, keyId));
  }
  if (!keys.has(inspected.activeKeyId)) {
    throw new Error("The active integration encryption key is missing from the keyring.");
  }
  return { activeKeyId: inspected.activeKeyId, keys };
}

export function loadIntegrationSecretKeyringFromEnvironment(input: {
  environment: {
    INTEGRATION_SECRET_ACTIVE_KEY_ID?: string;
    INTEGRATION_SECRET_ENCRYPTION_KEYS?: string;
  };
  logger?: (diagnostic: SecretKeyringConfigurationDiagnostic) => void;
  runtime?: "nodejs" | "edge";
}) {
  const configuration = {
    activeKeyId: input.environment.INTEGRATION_SECRET_ACTIVE_KEY_ID,
    serializedKeys: input.environment.INTEGRATION_SECRET_ENCRYPTION_KEYS
  };
  try {
    return parseSecretKeyring(configuration);
  } catch (error) {
    (input.logger ?? ((diagnostic) => console.error("[integration-secret-encryption]", diagnostic)))(
      createSecretKeyringConfigurationDiagnostic(
        configuration,
        input.runtime ?? "nodejs"
      )
    );
    throw error;
  }
}

export function getIntegrationSecretKeyring(input: {
  logger?: (diagnostic: SecretKeyringConfigurationDiagnostic) => void;
} = {}) {
  return loadIntegrationSecretKeyringFromEnvironment({
    environment: {
      INTEGRATION_SECRET_ACTIVE_KEY_ID: process.env.INTEGRATION_SECRET_ACTIVE_KEY_ID,
      INTEGRATION_SECRET_ENCRYPTION_KEYS: process.env.INTEGRATION_SECRET_ENCRYPTION_KEYS
    },
    logger: input.logger,
    runtime: process.env.NEXT_RUNTIME === "edge" ? "edge" : "nodejs"
  });
}

export function encryptSecret(
  plaintext: string,
  context: string,
  keyring: SecretKeyring = getIntegrationSecretKeyring()
) {
  if (!plaintext) throw new Error("Cannot encrypt an empty secret.");
  if (!context) throw new Error("Encryption context is required.");

  const key = keyring.keys.get(keyring.activeKeyId);
  if (!key) throw new Error("Active encryption key is unavailable.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    keyring.activeKeyId,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(":");
}

export function decryptSecret(
  envelope: string,
  context: string,
  keyring: SecretKeyring = getIntegrationSecretKeyring()
) {
  const [version, keyId, ivEncoded, tagEncoded, ciphertextEncoded, ...extra] = envelope.split(":");
  if (
    version !== ENVELOPE_VERSION ||
    !keyId ||
    !ivEncoded ||
    !tagEncoded ||
    !ciphertextEncoded ||
    extra.length > 0
  ) {
    throw new Error("Encrypted secret has an unsupported format.");
  }
  const key = keyring.keys.get(keyId);
  if (!key) throw new Error("Encrypted secret references an unavailable key.");

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivEncoded, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new Error("Encrypted secret could not be authenticated.");
  }
}
