/**
 * Seam 1 — injectable clock (plan §77).
 *
 * Plan §62's DST, midnight, leap-day, token-expiry and lease-timeout cases are
 * untestable without a single time source application code reads. Today there are 131
 * direct `new Date()` / `Date.now()` call sites in `lib/`, so this is introduced as an
 * opt-in facade rather than a repo-wide replacement: new and touched code reads
 * `now()`, and existing call sites migrate as the prompts that own them get to them.
 *
 * With seams off, `now()` is `new Date()` and `nowMs()` is `Date.now()` — same value,
 * same type, no allocation of consequence.
 */
import { seamsEnabled } from "./seam-policy";

export type Clock = {
  now(): Date;
  nowMs(): number;
  nowIso(): string;
};

const REAL_CLOCK: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};

/**
 * Module-level override. Only readable when seams are enabled, so a stray import in
 * production cannot shift time even if something managed to set it.
 */
let override: Clock | null = null;

function active(): Clock {
  if (!seamsEnabled()) return REAL_CLOCK;
  return override ?? REAL_CLOCK;
}

/** The canonical current instant. Prefer this over `new Date()` in new code. */
export function now(): Date {
  return active().now();
}

export function nowMs(): number {
  return active().nowMs();
}

export function nowIso(): string {
  return active().nowIso();
}

// ── test-only controls ─────────────────────────────────────────────────────────────

/**
 * Freeze the clock at an instant. No-op unless seams are enabled.
 * @returns a restore function; always safe to call.
 */
export function setTestClock(instant: Date | string | number): () => void {
  if (!seamsEnabled()) return () => {};
  const fixed = new Date(instant);
  if (Number.isNaN(fixed.getTime())) {
    throw new TypeError(`setTestClock received an invalid instant: ${String(instant)}`);
  }
  const previous = override;
  override = {
    now: () => new Date(fixed),
    nowMs: () => fixed.getTime(),
    nowIso: () => fixed.toISOString(),
  };
  return () => { override = previous; };
}

/**
 * A clock that advances only when told to, for lease-expiry and backoff assertions
 * that would otherwise need real sleeping.
 */
export function setManualClock(start: Date | string | number) {
  if (!seamsEnabled()) {
    return { advance: () => {}, restore: () => {}, current: () => new Date() };
  }
  let current = new Date(start).getTime();
  const previous = override;
  override = {
    now: () => new Date(current),
    nowMs: () => current,
    nowIso: () => new Date(current).toISOString(),
  };
  return {
    advance: (ms: number) => { current += ms; },
    current: () => new Date(current),
    restore: () => { override = previous; },
  };
}

export function clearTestClock(): void {
  override = null;
}

/** Whether a test clock is currently in effect. Always false when seams are off. */
export function isTestClockActive(): boolean {
  return seamsEnabled() && override !== null;
}
