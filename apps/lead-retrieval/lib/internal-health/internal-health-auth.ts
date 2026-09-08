import { createHmac, timingSafeEqual } from "node:crypto";

export type InternalHealthAuthResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_secret_env"
        | "missing_header"
        | "invalid_timestamp"
        | "stale_timestamp"
        | "invalid_signature";
    };

export const INTERNAL_HEALTH_TIMESTAMP_HEADER = "x-internal-health-timestamp";
export const INTERNAL_HEALTH_SIGNATURE_HEADER = "x-internal-health-signature";
export const DEFAULT_INTERNAL_HEALTH_MAX_SKEW_MS = 5 * 60 * 1000;

type HeaderReader = {
  get: (name: string) => string | null;
};

export function signInternalHealthPath(input: {
  secret: string;
  timestamp: string | number;
  pathname: string;
}) {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.pathname}`)
    .digest("hex");
}

export function authorizeInternalHealthRequest(input: {
  headers: HeaderReader;
  pathname: string;
  secret: string | null | undefined;
  nowMs?: number;
  maxSkewMs?: number;
}): InternalHealthAuthResult {
  const secret = String(input.secret ?? "").trim();
  if (!secret) {
    return { ok: false, reason: "missing_secret_env" };
  }

  const timestamp = String(input.headers.get(INTERNAL_HEALTH_TIMESTAMP_HEADER) ?? "").trim();
  const signature = String(input.headers.get(INTERNAL_HEALTH_SIGNATURE_HEADER) ?? "").trim();
  if (!timestamp || !signature) {
    return { ok: false, reason: "missing_header" };
  }

  if (!/^\d+$/.test(timestamp)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const nowMs = input.nowMs ?? Date.now();
  const maxSkewMs = input.maxSkewMs ?? DEFAULT_INTERNAL_HEALTH_MAX_SKEW_MS;
  if (Math.abs(nowMs - timestampMs) > maxSkewMs) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = signInternalHealthPath({
    secret,
    timestamp,
    pathname: input.pathname
  });

  return timingSafeHexEqual(signature, expected)
    ? { ok: true }
    : { ok: false, reason: "invalid_signature" };
}

function timingSafeHexEqual(actual: string, expected: string) {
  if (!/^[a-f0-9]+$/i.test(actual) || actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
