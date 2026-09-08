/**
 * Seam 7 — deterministic queue drain (plan §77).
 *
 * Without this, an async assertion is written as "mutate, sleep 2000ms, assert". That
 * is slow, and worse, it is flaky in exactly the direction that hides bugs: a sleep
 * that is usually long enough produces a suite that passes on a fast machine and fails
 * in CI, which then gets "fixed" by lengthening the sleep. Plan §65 requires
 * determinism; this is the mechanism.
 *
 * WEB half: drains `workflow_step_runs` through the real single-tick claim path, so a
 * test exercises production code rather than a parallel implementation. Given the
 * topology Prompt 1 confirmed — one Vercel cron tick claiming at most one step per
 * invocation — "drain" means "tick until idle", which is precisely what the cron does
 * over time, compressed.
 *
 * MOBILE half lives in `MOBILE/lib/testing/drainOutbox.ts`.
 */
import { seamsEnabled } from "./seam-policy";

export type DrainResult = {
  ticks: number;
  claimed: number;
  idle: boolean;
  /** Set when the drain hit its bound rather than reaching idle — never silent. */
  exhausted?: string;
};

export type TickFn = () => Promise<{ claimed: boolean }>;

/**
 * Tick until the queue reports idle, or until `maxTicks`.
 *
 * Hitting the bound is reported through `exhausted`, never swallowed: a drain that
 * silently stops early would let a test assert on a half-processed queue and pass.
 */
export async function drainQueue(tick: TickFn, options: { maxTicks?: number } = {}): Promise<DrainResult> {
  if (!seamsEnabled()) {
    throw new Error(
      "drainQueue is a test-only seam and is inert in this runtime. " +
        "Set LR_TEST_SEAMS_ENABLED=true in a non-production environment to use it."
    );
  }
  const maxTicks = options.maxTicks ?? 100;
  let ticks = 0;
  let claimed = 0;

  while (ticks < maxTicks) {
    ticks++;
    const result = await tick();
    if (!result.claimed) return { ticks, claimed, idle: true };
    claimed++;
  }
  return {
    ticks,
    claimed,
    idle: false,
    exhausted: `drainQueue stopped after ${maxTicks} ticks with work still queued. ` +
      "Either the queue is not converging, or maxTicks is too low. This is reported " +
      "rather than ignored so a test cannot assert against a half-drained queue.",
  };
}

/**
 * Wait for a condition by polling a deterministic source, with an explicit bound.
 * Use only where a real async boundary cannot be drained directly. Prefer `drainQueue`.
 */
export async function waitFor<T>(
  probe: () => Promise<T | null> | (T | null),
  options: { attempts?: number; label?: string } = {}
): Promise<T> {
  if (!seamsEnabled()) {
    throw new Error("waitFor is a test-only seam and is inert in this runtime.");
  }
  const attempts = options.attempts ?? 50;
  for (let i = 0; i < attempts; i++) {
    const value = await probe();
    if (value !== null && value !== undefined) return value;
    // Yield to the microtask and timer queues without wall-clock sleeping.
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`waitFor${options.label ? ` (${options.label})` : ""} gave up after ${attempts} attempts.`);
}

/** Whether the drain seam is usable. Always false in production. */
export function drainAvailable(): boolean {
  return seamsEnabled();
}
