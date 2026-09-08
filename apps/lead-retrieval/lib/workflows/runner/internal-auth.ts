/**
 * Constant-time bearer-token check for the internal worker endpoint.
 *
 * Protects the worker with shared bearer secrets:
 *   - `WORKFLOW_TICK_SECRET` for in-process kicks.
 *   - `CRON_SECRET` for Vercel Cron's automatic bearer header.
 *
 * Constant-time comparison avoids leaking secret length / prefix via response timing.
 */

export type InternalAuthResult =
  | { ok: true }
  | { ok: false; reason: "missing_secret_env" | "missing_header" | "invalid_token" };

const BEARER_PREFIX = "bearer ";

export function authorizeInternalWorkerRequest(
  authorizationHeader: string | null | undefined,
  expectedSecret: string | null | undefined | Array<string | null | undefined>
): InternalAuthResult {
  const expectedSecrets = (Array.isArray(expectedSecret) ? expectedSecret : [expectedSecret])
    .map((secret) => String(secret ?? "").trim())
    .filter(Boolean);
  if (expectedSecrets.length === 0) {
    return { ok: false, reason: "missing_secret_env" };
  }

  const raw = String(authorizationHeader ?? "").trim();
  if (!raw) {
    return { ok: false, reason: "missing_header" };
  }

  const lowered = raw.toLowerCase();
  if (!lowered.startsWith(BEARER_PREFIX)) {
    return { ok: false, reason: "invalid_token" };
  }

  const presented = raw.slice(BEARER_PREFIX.length).trim();
  let matched = false;
  for (const expected of expectedSecrets) {
    if (presented.length !== expected.length) {
      continue;
    }

    let mismatch = 0;
    for (let i = 0; i < expected.length; i += 1) {
      mismatch |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    matched ||= mismatch === 0;
  }
  return matched ? { ok: true } : { ok: false, reason: "invalid_token" };
}
