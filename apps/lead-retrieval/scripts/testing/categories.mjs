/**
 * Category registry — the third tag dimension (Brief §9, v3.2).
 *
 * `area` decides what a test is about. `severity` decides whether it blocks a release.
 * **`category` decides where a test is allowed to run**, which makes it the only tag with
 * safety consequences: get it wrong and a destructive drill points at production.
 *
 * The runner routes on this, so it must exist before any prompt after 2 writes a test.
 * A missing or unknown category is fatal rather than defaulted — defaulting would mean
 * an untagged destructive test silently inherits `prod-safe`.
 */

/** @typedef {"prod-safe"|"local-only"|"requires-device"|"separate-security-db"|"migration"|"deliberate-break"|"load-stress"} Category */

/**
 * @typedef {Object} CategoryDef
 * @property {string} description
 * @property {boolean} mayTargetProduction  Whether a production target is permitted at all.
 * @property {boolean} runnable             Whether this program ever executes it.
 * @property {"pass-count"|"not-run"|"excluded"} accounting  Which bucket results land in.
 * @property {string} reason                Why it is treated this way.
 */

/** @type {Record<Category, CategoryDef>} */
export const CATEGORIES = {
  "prod-safe": {
    description:
      "May run against the deployed production app using the designated production test tenant, events, users, and owned provider accounts. The default for this program.",
    mayTargetProduction: true,
    runnable: true,
    accounting: "pass-count",
    reason: "Production-safe product journeys are the point of this program (Brief §11).",
  },
  "local-only": {
    description:
      "Runs against local, replay, or seam harnesses. Never targets production.",
    mayTargetProduction: false,
    runnable: true,
    accounting: "pass-count",
    reason: "Deterministic harness work that has no business reaching a real tenant.",
  },
  "requires-device": {
    description:
      "Needs a real iOS/Android device or simulator. Written and committed, reported not-run.",
    mayTargetProduction: false,
    runnable: false,
    accounting: "not-run",
    reason:
      "No simulator or Xcode in this environment. Counting these as passes would claim a device result nobody observed.",
  },

  // ── The four excluded categories ────────────────────────────────────────────────
  // Brief §9: "exist so excluded work is routed and visible rather than silently
  // missing". They are tagged, never executed by this program, hard-blocked from
  // production, and reported in their own bucket — not as passes, failures, or skips.
  "separate-security-db": {
    description:
      "Raw Postgres/RLS enforcement and destructive direct-database isolation. Out of this program.",
    mayTargetProduction: false,
    runnable: false,
    accounting: "excluded",
    reason:
      "Requires a dedicated security database and destructive direct-DB access. Handled by the separate engineering/security suite.",
  },
  migration: {
    description: "Migration apply, rollback, and repair drills. Out of this program.",
    mayTargetProduction: false,
    runnable: false,
    accounting: "excluded",
    reason: "Schema is LOCKED for this program. Migration execution is handled separately.",
  },
  "deliberate-break": {
    description:
      "Predicate-removal and invariant-destruction drills. Out of this program.",
    mayTargetProduction: false,
    runnable: false,
    accounting: "excluded",
    reason:
      "Deliberately breaks invariants to prove the suite notices. Must never run anywhere a real tenant could be affected.",
  },
  "load-stress": {
    description: "Load, soak, and concurrency abuse. Out of this program.",
    mayTargetProduction: false,
    runnable: false,
    accounting: "excluded",
    reason:
      "Would degrade a shared environment. Owned by the existing load-testing process.",
  },
};

export const CATEGORY_NAMES = Object.freeze(Object.keys(CATEGORIES));

/** The four categories this program tags but never runs. */
export const EXCLUDED_CATEGORIES = Object.freeze(
  CATEGORY_NAMES.filter((c) => CATEGORIES[c].accounting === "excluded")
);

/** Categories that may never resolve to a production target, under any flag. */
export const PRODUCTION_FORBIDDEN = Object.freeze(
  CATEGORY_NAMES.filter((c) => !CATEGORIES[c].mayTargetProduction)
);

export function isKnownCategory(name) {
  return Object.prototype.hasOwnProperty.call(CATEGORIES, name);
}

/**
 * Validate a category. Throws with guidance rather than defaulting.
 *
 * Defaulting is the specific failure this guards against: an untagged destructive test
 * would inherit `prod-safe` and become eligible to run against a live tenant.
 */
export function assertKnownCategory(name, context = "") {
  if (isKnownCategory(name)) return name;
  const where = context ? ` (${context})` : "";
  throw new Error(
    `Unknown or missing test category ${JSON.stringify(name ?? null)}${where}.\n` +
      `  Every test must declare one of: ${CATEGORY_NAMES.join(", ")}\n` +
      `  Declare it in the file header, e.g.  // @lr area=lead-domain severity=P1 category=prod-safe\n` +
      `  There is no default: an untagged destructive test would otherwise inherit prod-safe.`
  );
}

// ── target resolution ───────────────────────────────────────────────────────────────

/**
 * What environment is this run pointed at?
 *
 * Production is detected from either the Supabase project ref or the browser base URL,
 * because a Playwright run can target production through `PLAYWRIGHT_BASE_URL` while the
 * Supabase env is unset.
 */
export function resolveTarget(env = process.env, productionRefs = new Set()) {
  const explicit = String(env.LR_TARGET || "").trim().toLowerCase();
  if (explicit === "production" || explicit === "local") return explicit;

  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  const m = String(url).match(/^https?:\/\/([a-z0-9-]+)\.supabase\./i);
  if (m && productionRefs.has(m[1].toLowerCase())) return "production";

  const baseUrl = String(env.PLAYWRIGHT_BASE_URL || env.LR_BASE_URL || "");
  if (/lr\.signalthread\.ai/i.test(baseUrl)) return "production";

  return "local";
}

/**
 * Decide what happens to a test file, given its category and the run's target.
 *
 * @returns {{action:"run"|"not-run"|"excluded"|"abort", reason:string|null}}
 *   `abort` means the whole run must stop: a category that may never touch production
 *   was selected while the run targets production. That is a configuration error serious
 *   enough that continuing would be worse than failing.
 */
export function routeCategory(category, options = {}) {
  const { target = "local", liveEvent = false, prodWrites = false } = options;
  assertKnownCategory(category);
  const def = CATEGORIES[category];

  if (target === "production" && !def.mayTargetProduction) {
    if (def.accounting === "excluded") {
      return {
        action: "abort",
        reason:
          `Category "${category}" may never target production. ${def.reason} ` +
          `Refusing to run: this is a configuration error, not a test failure.`,
      };
    }
    // requires-device and local-only simply do not execute here; no need to abort.
    return { action: "not-run", reason: `${category} does not run against a production target` };
  }

  if (def.accounting === "excluded") {
    return { action: "excluded", reason: def.reason };
  }
  if (!def.runnable) {
    return { action: "not-run", reason: def.reason };
  }

  // Live-event guard: a customer event is running, so production WRITES are deferred.
  // Read-only production checks still run — that is the whole value of prod-safe.
  if (liveEvent && target === "production" && prodWrites) {
    return {
      action: "not-run",
      reason:
        "deferred-live-event: a customer event is in progress, so production write and canary tests are deferred",
    };
  }

  return { action: "run", reason: null };
}

/**
 * Provider canaries must only ever reach owned test recipients (Brief §11).
 * Exported for the tests that assert it, and for Prompt 10's canary harness.
 */
export function assertOwnedTestRecipient(recipient, allowedDomainsOrAddresses) {
  const value = String(recipient || "").trim().toLowerCase();
  if (!value) throw new Error("Canary recipient is empty.");
  const allowed = (allowedDomainsOrAddresses || []).map((a) => String(a).trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) {
    throw new Error(
      "No owned test recipients configured. A provider canary must never send to an address " +
        "that has not been explicitly declared as owned (Brief §11)."
    );
  }
  const ok = allowed.some((a) => (a.startsWith("@") ? value.endsWith(a) : value === a));
  if (!ok) {
    throw new Error(
      `Canary recipient "${value}" is not an owned test recipient. Allowed: ${allowed.join(", ")}`
    );
  }
  return value;
}
