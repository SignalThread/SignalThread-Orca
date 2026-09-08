/**
 * Seam 3 — source provenance on canonical read payloads (plan §77, §71).
 *
 * Incident `e4f422c`: counts stayed correct, intelligence panels emptied, and lead
 * detail quietly served a thin legacy summary instead of the rich read model. Every
 * ordinary assertion passed, because every assertion asked "is the response non-empty"
 * and none asked "which source produced it".
 *
 * This seam makes that question answerable. A read path wraps its result with the
 * source that produced it; tests then assert `source === "canonical"` and a fallback
 * firing in a rich-data fixture turns a green test red.
 *
 * ── Two halves, deliberately gated differently ───────────────────────────────────
 *
 * 1. **Recording is always on.** Plan §71 requires fallback firing rate to be a
 *    production metric with an alert threshold, and §57 depends on it. A counter that
 *    only increments under a test flag cannot alert on production. Recording is
 *    in-process, allocation-light, and has no observable behavior.
 *
 * 2. **Exposure is seam-gated.** Attaching `_provenance` to a response body or the
 *    `x-lr-source` header only happens when seams are enabled, so payload shape is
 *    byte-identical in production. This is what satisfies Prompt 3's "no behavior
 *    change when seams are not activated".
 */
import { seamsEnabled } from "./seam-policy";

/** Where a read result actually came from. */
export type ReadSource =
  /** The canonical read model — the intended path. */
  | "canonical"
  /** A legacy/compatibility path that produced a plausible but degraded result. */
  | "legacy_fallback"
  /** A derived compatibility value, e.g. `follow_up_date` computed from another field. */
  | "compatibility_derived"
  /** A hardcoded or placeholder value. Never acceptable for lead-specific intelligence. */
  | "placeholder"
  /** Nothing was available; the caller reports unavailability rather than inventing. */
  | "unavailable";

export const FALLBACK_SOURCES: readonly ReadSource[] = [
  "legacy_fallback",
  "compatibility_derived",
  "placeholder",
] as const;

export const PROVENANCE_HEADER = "x-lr-source";
export const PROVENANCE_FIELD = "_provenance";

export type ProvenanceRecord = {
  /** Stable identifier for the read path, e.g. "conversation-intelligence-read-model". */
  readPath: string;
  source: ReadSource;
  /** Optional detail: which fallback branch fired, why. */
  detail?: string;
};

export type Provenanced<T> = { value: T; provenance: ProvenanceRecord };

// ── recording (always on) ──────────────────────────────────────────────────────────

type Counter = { canonical: number; fallback: number; byPath: Map<string, { canonical: number; fallback: number }> };

const counters: Counter = { canonical: 0, fallback: 0, byPath: new Map() };
let listener: ((record: ProvenanceRecord) => void) | null = null;

/**
 * Record which source served a read. Always active.
 *
 * Returns the record so a read path can write `return recordProvenance({...})` at the
 * point of the branch, keeping the annotation adjacent to the fallback it describes.
 */
export function recordProvenance(record: ProvenanceRecord): ProvenanceRecord {
  const isFallback = FALLBACK_SOURCES.includes(record.source);
  let bucket = counters.byPath.get(record.readPath);
  if (!bucket) {
    bucket = { canonical: 0, fallback: 0 };
    counters.byPath.set(record.readPath, bucket);
  }
  if (isFallback) { counters.fallback++; bucket.fallback++; }
  else if (record.source === "canonical") { counters.canonical++; bucket.canonical++; }

  if (listener) {
    try { listener(record); } catch { /* a broken observer must never break a read */ }
  }
  return record;
}

/** Attach provenance to a value without changing the value. */
export function withProvenance<T>(value: T, record: ProvenanceRecord): Provenanced<T> {
  return { value, provenance: recordProvenance(record) };
}

/**
 * Fallback firing rate — the production metric plan §71 calls for. Wired to the
 * observability pipeline in Prompt 14.
 */
export function fallbackFiringRate(readPath?: string): { canonical: number; fallback: number; rate: number } {
  const b = readPath ? counters.byPath.get(readPath) ?? { canonical: 0, fallback: 0 } : counters;
  const total = b.canonical + b.fallback;
  return { canonical: b.canonical, fallback: b.fallback, rate: total === 0 ? 0 : b.fallback / total };
}

export function resetProvenanceCounters(): void {
  counters.canonical = 0;
  counters.fallback = 0;
  counters.byPath.clear();
}

/** Observe every provenance record, e.g. to assert what fired during one request. */
export function observeProvenance(fn: ((record: ProvenanceRecord) => void) | null): () => void {
  const previous = listener;
  listener = fn;
  return () => { listener = previous; };
}

/** Collect every record emitted while `fn` runs. Works regardless of seam state. */
export async function captureProvenance<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; records: ProvenanceRecord[] }> {
  const records: ProvenanceRecord[] = [];
  const restore = observeProvenance((r) => records.push(r));
  try {
    return { result: await fn(), records };
  } finally {
    restore();
  }
}

// ── exposure (seam-gated) ──────────────────────────────────────────────────────────

/**
 * Additive `_provenance` field for a response body. Returns the body unchanged when
 * seams are off, so production payloads are byte-identical.
 */
export function attachProvenanceToBody<T extends object>(body: T, record: ProvenanceRecord): T {
  if (!seamsEnabled()) return body;
  return { ...body, [PROVENANCE_FIELD]: record } as T;
}

/** Test-only response header. Empty object when seams are off. */
export function provenanceHeaders(record: ProvenanceRecord): Record<string, string> {
  if (!seamsEnabled()) return {};
  return {
    [PROVENANCE_HEADER]: record.source,
    [`${PROVENANCE_HEADER}-path`]: record.readPath,
    ...(record.detail ? { [`${PROVENANCE_HEADER}-detail`]: record.detail } : {}),
  };
}

// ── assertion helper for Prompt 8 ──────────────────────────────────────────────────

/**
 * Throws when any recorded read fell back. Plan §71: "a fallback that fires in a
 * fixture where rich data exists is a failing test, not a passing degraded one."
 */
export function assertNoFallback(records: readonly ProvenanceRecord[]): void {
  const fell = records.filter((r) => FALLBACK_SOURCES.includes(r.source));
  if (fell.length === 0) return;
  const detail = fell
    .map((r) => `  ${r.readPath} → ${r.source}${r.detail ? ` (${r.detail})` : ""}`)
    .join("\n");
  throw new Error(
    `${fell.length} read path(s) served a fallback where canonical data was expected:\n${detail}`
  );
}
