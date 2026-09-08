/**
 * Central policy for all testability seams (plan §77).
 *
 * Every seam added by Prompt 3 routes its enablement through this one module. That is
 * deliberate: plan §75 requires each bypass-shaped flag to have a production rejection
 * assertion, and a single choke point means Prompt 13 asserts one thing rather than
 * eight, and a ninth seam cannot be added later without inheriting the gate.
 *
 * Modelled on `lib/e2e/e2e-auth-bypass-policy.ts` — a pure `…FromEnv` evaluator for
 * tests plus a thin runtime wrapper — so the gating story in this codebase stays
 * uniform.
 *
 * Invariants, each covered by `tests/seams/seam-inertness.test.ts`:
 *   - seams are OFF unless `LR_TEST_SEAMS_ENABLED === "true"`
 *   - seams are OFF in production regardless of that flag
 *   - with seams off, every seam returns the real implementation's behavior
 *   - no seam introduces an authentication or authorization surface
 */

export const SEAM_ENV_FLAG = "LR_TEST_SEAMS_ENABLED";

export type SeamName =
  | "clock"
  | "ids"
  | "provenance"
  | "fault-injection"
  | "provider-outcome"
  | "correlation"
  | "queue-drain"
  | "ai-response";

export const SEAM_NAMES: readonly SeamName[] = [
  "clock",
  "ids",
  "provenance",
  "fault-injection",
  "provider-outcome",
  "correlation",
  "queue-drain",
  "ai-response",
] as const;

export type SeamEnv = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  LR_TEST_SEAMS_ENABLED?: string;
};

/**
 * Returns a human-readable denial reason, or null when seams may be used.
 * Pure — pass a synthetic env in tests.
 */
export function getSeamDenialReasonFromEnv(env: SeamEnv): string | null {
  if (env.NODE_ENV === "production") {
    return "NODE_ENV production";
  }
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
    // Preview deploys run against real provider credentials and real customer-shaped
    // data, so they are treated as production for seam purposes.
    return `VERCEL_ENV ${env.VERCEL_ENV}`;
  }
  if (env.LR_TEST_SEAMS_ENABLED !== "true") {
    return `${SEAM_ENV_FLAG} is not true`;
  }
  return null;
}

export function getSeamDenialReason(): string | null {
  return getSeamDenialReasonFromEnv({
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    LR_TEST_SEAMS_ENABLED: process.env.LR_TEST_SEAMS_ENABLED,
  });
}

/** True only when seams are permitted in the current runtime. */
export function seamsEnabled(): boolean {
  return getSeamDenialReason() === null;
}

/**
 * Guard for seam-activating code paths.
 *
 * Returns the override when seams are on, and `undefined` when they are off — so a
 * caller reads as `useSeam(x) ?? realImplementation`, and the real implementation is
 * structurally impossible to skip in production.
 */
export function useSeam<T>(override: T | undefined | null): T | undefined {
  if (!seamsEnabled()) return undefined;
  return override ?? undefined;
}
