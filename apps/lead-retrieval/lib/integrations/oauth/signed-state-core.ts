import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Provider-neutral primitives for the signed, expiring OAuth state envelope and
 * the PKCE pair that every SignalThread integration OAuth launch uses.
 *
 * One implementation, shared by every provider: Google Workspace and Microsoft
 * 365 both encode `base64url(payload).hmacSha256(payload)` and both verify with
 * a constant-time comparison. Provider-specific payload shape and validation
 * stay in each provider's own `oauth-state` module.
 */

export type OAuthStateSecret = string | Buffer;

export function encodeSignedStatePayload(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function signEncodedState(encodedPayload: string, secret: OAuthStateSecret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function requireOAuthStateSecret(secret: string | undefined, variableName: string) {
  const value = String(secret ?? "");
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${variableName} must be at least 32 bytes.`);
  }
  return value;
}

/**
 * Domain-separate a shared base secret per provider so a state signed for one
 * provider can never verify for another, even when both read the same
 * environment variable.
 */
export function deriveProviderStateSecret(baseSecret: string, provider: string) {
  return createHmac("sha256", baseSecret).update(`signalthread:oauth-state:${provider}`).digest();
}

export function signStateEnvelope(payload: unknown, secret: OAuthStateSecret) {
  const encodedPayload = encodeSignedStatePayload(payload);
  return `${encodedPayload}.${signEncodedState(encodedPayload, secret)}`;
}

/**
 * Verify the envelope signature and return the decoded payload. Structural and
 * lifetime validation is the caller's responsibility.
 */
export function openStateEnvelope(state: string, secret: OAuthStateSecret): unknown {
  const [encodedPayload, encodedSignature, ...extra] = String(state ?? "").split(".");
  if (!encodedPayload || !encodedSignature || extra.length > 0) {
    throw new Error("Invalid OAuth state.");
  }
  const expected = Buffer.from(signEncodedState(encodedPayload, secret));
  const actual = Buffer.from(encodedSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid OAuth state signature.");
  }
  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid OAuth state payload.");
  }
}

export function digestOAuthValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createOAuthPkcePair() {
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, method: "S256" as const };
}
