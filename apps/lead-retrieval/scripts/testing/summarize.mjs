/**
 * Result accounting for the LR runner.
 *
 * Extracted from the CLI so the arithmetic is directly testable. These rules are the
 * ones Brief §9 makes non-negotiable, and getting them wrong silently inflates every
 * number the rest of this project reports:
 *
 *   - a known-defect skip is counted separately from an ordinary skip and from a pass
 *   - a `not-run` test is never counted as a pass
 *   - a test that passed only after a retry is a flake, and a flake fails the suite
 */

import { CATEGORIES } from "./categories.mjs";

const KNOWN_DEFECT = /KNOWN-DEFECT/i;

/**
 * A skip is a known-defect skip when it carries the `KNOWN-DEFECT:` marker, per
 * Brief §6. The marker may sit in the test name (node:test cannot attach a skip
 * reason) or in an explicit skip reason (Vitest and Playwright can).
 */
export function isKnownDefect(result) {
  if (result.status !== "skipped") return false;
  return KNOWN_DEFECT.test(result.name ?? "") || KNOWN_DEFECT.test(result.skipReason ?? "");
}

export function isFlake(result) {
  return (result.retries ?? 0) > 0 && result.status === "passed";
}

export function emptyBucket(area) {
  return {
    area, passed: 0, failed: 0, skipped: 0, knownDefect: 0, notRun: 0, flaky: 0,
    // Brief §9: the four out-of-program categories are listed separately from passes,
    // failures, and skips. Folding them into any of those three would either inflate the
    // pass count or make excluded work look like a problem to fix.
    excluded: 0,
    failures: [],
  };
}

/**
 * @param {Array<object>} results
 * @returns {{byArea: object[], totals: object}}
 */
export function summarize(results) {
  /** @type {Map<string, ReturnType<typeof emptyBucket>>} */
  const byArea = new Map();
  const totals = { passed: 0, failed: 0, skipped: 0, knownDefect: 0, notRun: 0, flaky: 0, excluded: 0 };
  /** Excluded work, broken out by category so it stays visible rather than silently missing. */
  const excludedByCategory = {};
  /** prod-safe writes deferred because a customer event is live. */
  const deferredLiveEvent = [];

  for (const r of results) {
    const area = r.tags?.area ?? "UNTAGGED";
    if (!byArea.has(area)) byArea.set(area, emptyBucket(area));
    const bucket = byArea.get(area);

    if (isFlake(r)) { bucket.flaky++; totals.flaky++; }

    if (r.status === "excluded") {
      bucket.excluded++; totals.excluded++;
      const cat = r.tags?.category ?? "unknown";
      excludedByCategory[cat] = (excludedByCategory[cat] ?? 0) + 1;
    }
    else if (r.status === "not-run") {
      bucket.notRun++; totals.notRun++;
      if (/deferred-live-event/.test(r.notRunReason ?? "")) deferredLiveEvent.push(r);
    }
    else if (r.status === "failed") { bucket.failed++; totals.failed++; bucket.failures.push(r); }
    else if (isKnownDefect(r)) { bucket.knownDefect++; totals.knownDefect++; }
    else if (r.status === "skipped" || r.status === "todo") { bucket.skipped++; totals.skipped++; }
    else { bucket.passed++; totals.passed++; }
  }

  return {
    byArea: [...byArea.values()].sort((a, b) => a.area.localeCompare(b.area)),
    totals,
    excludedByCategory,
    deferredLiveEvent,
  };
}

/**
 * The suite's exit code.
 *
 * Non-zero on any failure, and non-zero on any flake: "a suite that passes only after
 * reruns is a failing suite" (Brief §9, plan §65). A flake is not a warning here.
 */
export function exitCodeFor(totals) {
  // Excluded and not-run never affect the exit code. They are deliberate routing
  // decisions, not problems — Brief §10: "do not treat their absence as a blocker".
  return totals.failed > 0 || totals.flaky > 0 ? 1 : 0;
}

/**
 * Group results by category, for the routing summary the runner prints.
 */
export function summarizeCategories(results) {
  const out = {};
  for (const r of results) {
    const cat = r.tags?.category ?? "UNTAGGED";
    if (!out[cat]) out[cat] = { category: cat, total: 0, passed: 0, failed: 0, notRun: 0, excluded: 0 };
    out[cat].total++;
    if (r.status === "excluded") out[cat].excluded++;
    else if (r.status === "not-run") out[cat].notRun++;
    else if (r.status === "failed") out[cat].failed++;
    else if (r.status === "passed") out[cat].passed++;
  }
  return Object.values(out).sort((a, b) => a.category.localeCompare(b.category));
}

/** Every category referenced by a result must exist in the registry. */
export function unknownCategories(results) {
  const seen = new Set(results.map((r) => r.tags?.category).filter(Boolean));
  return [...seen].filter((c) => c !== "UNTAGGED" && !Object.prototype.hasOwnProperty.call(CATEGORIES, c));
}

/**
 * P0 and P1 tests may not be skipped, quarantined, or converted to expected failures
 * except under the KNOWN-DEFECT rule, which requires a recorded finding (Brief §8).
 * Returns the violations so CI can block on them.
 */
export function severitySkipViolations(results) {
  return results.filter(
    (r) =>
      (r.tags?.severity === "P0" || r.tags?.severity === "P1") &&
      (r.status === "skipped" || r.status === "todo") &&
      !isKnownDefect(r)
  );
}
