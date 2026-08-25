import { createHmac, timingSafeEqual } from "node:crypto";
import {
  ProductTokenSecretError,
  resolveSpeakerIntakeTokenSecrets,
} from "@/src/server/security/product-token-secrets";

export class SpeakerIntakeTokenError extends Error {}

type SpeakerIntakeTokenPayload = {
  v: 1;
  eventId: string;
  speakerId: string;
  exp: number;
};

const DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSpeakerIntakeSecrets(): { signing: string; verification: readonly string[] } {
  try {
    const resolved = resolveSpeakerIntakeTokenSecrets();
    return { signing: resolved.signing, verification: resolved.verification };
  } catch (error) {
    if (error instanceof ProductTokenSecretError) {
      throw new SpeakerIntakeTokenError(error.message);
    }
    throw error;
  }
}

function signWith(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

// New tokens are always signed with the product-owned signing secret. Authentication
// authority (Supabase project) must never determine whether a speaker link is valid.
function sign(input: string): string {
  return signWith(getSpeakerIntakeSecrets().signing, input);
}

function signatureMatches(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createSpeakerIntakeToken(input: {
  eventId: string;
  speakerId: string;
  expiresInSeconds?: number;
}): { token: string; expiresAt: string } {
  const expiresInSeconds = input.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS;
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload: SpeakerIntakeTokenPayload = {
    v: 1,
    eventId: input.eventId,
    speakerId: input.speakerId,
    exp,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifySpeakerIntakeToken(token: string): SpeakerIntakeTokenPayload {
  const normalized = token.trim();
  const [encodedPayload, encodedSignature] = normalized.split(".");

  if (!encodedPayload || !encodedSignature) {
    throw new SpeakerIntakeTokenError("Invalid intake link.");
  }

  // Verification accepts transitional legacy secrets so links minted before the signing
  // secret was separated from the auth authority survive the Platform Core cutover.
  const { verification } = getSpeakerIntakeSecrets();
  const verified = verification.some((secret) =>
    signatureMatches(signWith(secret, encodedPayload), encodedSignature),
  );

  if (!verified) {
    throw new SpeakerIntakeTokenError("Invalid intake link.");
  }

  let payload: SpeakerIntakeTokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as SpeakerIntakeTokenPayload;
  } catch {
    throw new SpeakerIntakeTokenError("Invalid intake link.");
  }

  if (payload.v !== 1 || !payload.eventId || !payload.speakerId || !payload.exp) {
    throw new SpeakerIntakeTokenError("Invalid intake link.");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new SpeakerIntakeTokenError("This intake link has expired.");
  }

  return payload;
}

export function buildSpeakerIntakeUrl(origin: string, token: string): string {
  return new URL(`/speaker-intake/${encodeURIComponent(token)}`, origin).toString();
}

export function buildSpeakerIntakeMailto(input: {
  email: string | null;
  speakerName: string;
  eventName: string;
  intakeUrl: string;
}): string | null {
  if (!input.email?.trim()) {
    return null;
  }

  const subject = `Profile update request for ${input.eventName}`;
  const body = [
    `Hi ${input.speakerName},`,
    "",
    `Please use this secure link to review and update your speaker profile for ${input.eventName}:`,
    input.intakeUrl,
    "",
    "You can update your details and upload a headshot without signing in.",
  ].join("\n");

  return `mailto:${encodeURIComponent(input.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
