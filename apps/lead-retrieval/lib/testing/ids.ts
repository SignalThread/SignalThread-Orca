/**
 * Seam 2 — deterministic ID and idempotency-key generation (plan §77).
 *
 * Plan §7's retry and duplicate-prevention matrix needs to assert that the *same*
 * idempotency key is derived across a client timeout, a replay, and an app restart.
 * With `randomUUID()` inline that is only assertable by capturing whatever was
 * generated, which cannot distinguish "stable key" from "any key".
 *
 * With seams off, `newId()` is `crypto.randomUUID()`.
 *
 * Note the asymmetry with the clock seam: key *derivation* is a pure function of its
 * inputs and is exported unguarded (`deriveIdempotencyKey`), because determinism there
 * is a production requirement, not a test affordance. Only random ID generation is
 * seam-controlled.
 */
import { createHash, randomUUID } from "node:crypto";
import { seamsEnabled } from "./seam-policy";

type IdGenerator = () => string;

let override: IdGenerator | null = null;

/** A fresh opaque id. Prefer this over calling `randomUUID()` inline. */
export function newId(): string {
  if (seamsEnabled() && override) return override();
  return randomUUID();
}

/**
 * Derive a stable idempotency key from its semantic inputs.
 *
 * Not seam-gated: stability across app versions and across a local database migration
 * is a product invariant (plan §7's "key derivation is stable across app versions"),
 * so this must behave identically in test and production. The seam exists so tests can
 * assert the *derivation*, not so they can change it.
 *
 * Parts are joined with a separator that cannot appear in a UUID or an email, so
 * `["a", "b|c"]` and `["a|b", "c"]` cannot collide. A distinct sentinel marks a
 * null/undefined part, so `[null]` and `[""]` derive different keys.
 *
 * Both are written as escapes rather than literal control bytes: embedding raw U+0000
 * in source makes the file binary to git and invisible in review.
 */
const FIELD_SEPARATOR = "\u001F";
const NULL_PART = "\u0000";

export function deriveIdempotencyKey(scope: string, parts: readonly (string | number | null | undefined)[]): string {
  const normalized = parts.map((p) => (p === null || p === undefined ? NULL_PART : String(p)));
  const material = [scope, ...normalized].join(FIELD_SEPARATOR);
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

// ── test-only controls ─────────────────────────────────────────────────────────────

/**
 * Replace ID generation with a deterministic counter. No-op unless seams are enabled.
 * @returns a restore function.
 */
export function setDeterministicIds(prefix = "test", startAt = 1): () => void {
  if (!seamsEnabled()) return () => {};
  let n = startAt;
  const previous = override;
  override = () => `${prefix}-${String(n++).padStart(8, "0")}`;
  return () => { override = previous; };
}

/** Replay a fixed sequence; throws if exhausted, so an unexpected extra call is loud. */
export function setIdSequence(ids: readonly string[]): () => void {
  if (!seamsEnabled()) return () => {};
  let i = 0;
  const previous = override;
  override = () => {
    if (i >= ids.length) {
      throw new Error(`setIdSequence exhausted after ${ids.length} id(s); an unexpected extra id was requested.`);
    }
    return ids[i++];
  };
  return () => { override = previous; };
}

export function clearIdOverride(): void {
  override = null;
}

export function isDeterministicIdActive(): boolean {
  return seamsEnabled() && override !== null;
}
