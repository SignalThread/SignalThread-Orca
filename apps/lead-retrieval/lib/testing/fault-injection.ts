/**
 * Seams 4 and 5 — fault injection at each dependency boundary, and the forced
 * "unknown provider outcome" (plan §77, §56).
 *
 * Plan §56 requires forcing Supabase unavailable, the connection pool exhausted, a
 * function timeout, a provider DNS/TLS failure, an object-storage outage, and a queue
 * outage. None of those is producible on demand against real dependencies, so §56 is
 * currently untestable — this seam is what unblocks it.
 *
 * Seam 5 is called out separately in §77 because it is the hardest and most important
 * state in the architecture: the provider accepted the request but the response never
 * arrived, so LR does not know whether the side effect happened. Every idempotency and
 * reconciliation guarantee in §46, §47 and §48 hinges on it, and it cannot be produced
 * reliably against real Google.
 *
 * With seams off, every function here is a pass-through with no allocation and no
 * branch beyond a single boolean check.
 */
import { seamsEnabled } from "./seam-policy";

/** The dependency boundaries plan §56 enumerates. */
export type FaultBoundary =
  | "database"
  | "object-storage"
  | "provider-http"
  | "job-queue"
  | "ai";

export type FaultKind =
  | "unavailable"        // dependency is down
  | "timeout"            // request never completes
  | "pool-exhausted"     // database connection pool saturated
  | "rate-limit"         // 429
  | "dns-failure"        // provider DNS/TLS failure
  | "malformed-response" // 2xx with a body that does not parse
  | "unknown-outcome";   // Seam 5 — accepted, result unknowable

export type FaultSpec = {
  boundary: FaultBoundary;
  kind: FaultKind;
  /** Fail this many times then stop, so backoff and recovery are both testable. */
  times?: number;
  /** Only fault when the operation label matches. */
  match?: string | RegExp;
  message?: string;
};

/** Thrown by an injected fault, so a test can distinguish it from a real error. */
export class InjectedFault extends Error {
  readonly boundary: FaultBoundary;
  readonly kind: FaultKind;
  readonly injected = true as const;

  constructor(spec: FaultSpec, operation: string) {
    super(spec.message ?? `Injected ${spec.kind} at ${spec.boundary} during "${operation}"`);
    this.name = "InjectedFault";
    this.boundary = spec.boundary;
    this.kind = spec.kind;
  }
}

/**
 * The outcome of an operation that was accepted but whose result is unknowable.
 *
 * Returned rather than thrown, because "unknown" is not a failure: the side effect may
 * well have happened, and treating it as a failure is exactly the bug that produces
 * duplicate sends on retry.
 */
export class UnknownProviderOutcome extends Error {
  readonly injected = true as const;
  readonly kind = "unknown-outcome" as const;
  /** What the caller must do: reconcile, never blindly retry. */
  readonly retrySafe = false as const;

  constructor(readonly operation: string, message?: string) {
    super(message ?? `Provider outcome for "${operation}" is unknown — reconcile before retrying.`);
    this.name = "UnknownProviderOutcome";
  }
}

type ActiveFault = FaultSpec & { remaining: number };

let faults: ActiveFault[] = [];

function matches(fault: ActiveFault, boundary: FaultBoundary, operation: string): boolean {
  if (fault.boundary !== boundary) return false;
  if (fault.remaining <= 0) return false;
  if (!fault.match) return true;
  return typeof fault.match === "string" ? operation.includes(fault.match) : fault.match.test(operation);
}

/**
 * The guard a dependency boundary calls before doing real work.
 *
 * Reads as one line at each call site:
 *
 *     maybeFault("database", "leads.select");
 *     const { data, error } = await supabase.from("leads").select(...);
 *
 * No-op unless seams are enabled AND a matching fault is armed.
 */
export function maybeFault(boundary: FaultBoundary, operation: string): void {
  if (!seamsEnabled() || faults.length === 0) return;
  const fault = faults.find((f) => matches(f, boundary, operation));
  if (!fault) return;
  fault.remaining--;
  if (fault.kind === "unknown-outcome") throw new UnknownProviderOutcome(operation, fault.message);
  throw new InjectedFault(fault, operation);
}

/** Async variant, for boundaries whose timeout must actually hang. */
export async function maybeFaultAsync(boundary: FaultBoundary, operation: string): Promise<void> {
  if (!seamsEnabled() || faults.length === 0) return;
  const fault = faults.find((f) => matches(f, boundary, operation));
  if (!fault) return;
  fault.remaining--;
  if (fault.kind === "timeout") {
    // Never settles. The caller's own timeout must fire — which is the thing under test.
    await new Promise(() => {});
  }
  if (fault.kind === "unknown-outcome") throw new UnknownProviderOutcome(operation, fault.message);
  throw new InjectedFault(fault, operation);
}

// ── test-only controls ─────────────────────────────────────────────────────────────

/** Arm a fault. No-op unless seams are enabled. Returns a disarm function. */
export function injectFault(spec: FaultSpec): () => void {
  if (!seamsEnabled()) return () => {};
  const active: ActiveFault = { ...spec, remaining: spec.times ?? Number.POSITIVE_INFINITY };
  faults.push(active);
  return () => { faults = faults.filter((f) => f !== active); };
}

/**
 * Force the next matching provider call to return an unknown outcome (seam 5).
 * Convenience wrapper over `injectFault`, because this is the case §77 names.
 */
export function injectUnknownProviderOutcome(options: { match?: string | RegExp; times?: number } = {}): () => void {
  return injectFault({ boundary: "provider-http", kind: "unknown-outcome", times: options.times ?? 1, match: options.match });
}

export function clearFaults(): void {
  faults = [];
}

export function armedFaults(): readonly FaultSpec[] {
  return seamsEnabled() ? faults.map(({ remaining: _remaining, ...spec }) => spec) : [];
}

/** True when a fault would fire for this boundary/operation. For assertions only. */
export function faultArmedFor(boundary: FaultBoundary, operation: string): boolean {
  return seamsEnabled() && faults.some((f) => matches(f, boundary, operation));
}
