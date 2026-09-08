/**
 * LR test area registry — the single source of truth for `--area`.
 *
 * Brief §9: "areas are declared in one registry file so `--area` can be validated".
 * A typo must fail loudly rather than silently matching nothing and reporting 0/0 ✓,
 * which would read as a pass.
 *
 * Every area names the prompt that owns it, so an untagged or misfiled test is
 * traceable back to a piece of work rather than becoming orphaned.
 */

/** @typedef {"P0"|"P1"|"P2"|"P3"} Severity */
export const SEVERITIES = /** @type {const} */ (["P0", "P1", "P2", "P3"]);

/**
 * Test layers, per plan §29. `--layer` validates against this list.
 * Ordered cheapest-to-most-expensive, which is also the order CI should run them.
 */
export const LAYERS = /** @type {const} */ ([
  "static",       // lint, typecheck, import boundaries, route inventory
  "unit",         // pure domain logic against real functions
  "component",    // rendered component behavior
  "api",          // route handler / service invoked directly
  "db",           // real Postgres, including RLS as an enforcement layer
  "provider",     // provider adapter against recorded or sandbox HTTP
  "migration",    // schema upgrade against realistic data
  "e2e-web",      // real browser
  "e2e-mobile",   // real device or simulator
  "cross-surface",// mobile mutation observed on web, and the reverse
  "perf",
  "security",
  "smoke",        // production synthetic / canary
]);

/**
 * @typedef {Object} AreaDef
 * @property {string} description
 * @property {"web"|"mobile"|"both"} repo
 * @property {number} prompt   Owning prompt in TESTING_PROMPTS.md
 * @property {string} planRefs Plan sections this area proves
 */

/** @type {Record<string, AreaDef>} */
export const AREAS = {
  // ── Prompt 2 — the runner's own tests ────────────────────────────────────
  "test-infra": {
    description: "The runner, tagging, reporting, and environment guard themselves",
    repo: "web", prompt: 2, planRefs: "Brief §9, §65",
  },

  // ── Prompt 3 — testability seams ─────────────────────────────────────────
  seams: {
    description: "Injectable clock, deterministic IDs, provenance, fault injection, queue drain",
    repo: "both", prompt: 3, planRefs: "§77",
  },

  // ── Prompt 4 — identity, tenancy, isolation ──────────────────────────────
  "auth-session": {
    description: "Session lifecycle state machine: sign-in, expiry, refresh, revocation, invites",
    repo: "both", prompt: 4, planRefs: "§31",
  },
  "auth-rbac": {
    description: "Normalized role vocabulary and per-role action authorization",
    repo: "both", prompt: 4, planRefs: "§1, §32",
  },
  "tenant-isolation": {
    description: "Company A cannot read or mutate Company B, at UI, API and RLS layers",
    repo: "web", prompt: 4, planRefs: "§2, §22",
  },
  "event-isolation": {
    description: "Event A data never appears in or mutates Event B within one company",
    repo: "web", prompt: 4, planRefs: "§3",
  },
  rls: {
    description: "Postgres row-level security as an enforcement layer, per role per table",
    repo: "web", prompt: 4, planRefs: "§50",
  },

  // ── Prompt 5 — lead domain ───────────────────────────────────────────────
  "lead-domain": {
    description: "Lead lifecycle, canonical semantics, rating→priority, duplicate definitions",
    repo: "web", prompt: 5, planRefs: "§39, §5",
  },
  import: {
    description: "CSV/XLSX/Sheets import: mapping, readiness parity, persistence, file security",
    repo: "web", prompt: 5, planRefs: "§9, §10, §52",
  },
  autosave: {
    description: "Multi-field partial-update safety; untouched fields never change",
    repo: "web", prompt: 5, planRefs: "§8",
  },
  navigation: {
    description: "Route continuity, event switcher, back/forward, deep links",
    repo: "web", prompt: 5, planRefs: "§11, §13",
  },
  filters: {
    description: "Filters change rendered rows and counts, not just helper state",
    repo: "web", prompt: 5, planRefs: "§14",
  },
  collections: {
    description: "Search, sort, pagination, and scale profiles up to 5k supported",
    repo: "web", prompt: 5, planRefs: "§40",
  },

  // ── Prompt 6 — mobile capture and local state ────────────────────────────
  "mobile-capture": {
    description: "Camera, QR payloads, capture behavior, badge template isolation",
    repo: "mobile", prompt: 6, planRefs: "§34, §35",
  },
  "mobile-offline": {
    description: "Offline capture, outbox drain, ordering, backoff, reconciliation",
    repo: "mobile", prompt: 6, planRefs: "§37, §72",
  },
  "mobile-localdb": {
    description: "SQLite schema migration with pending outbox rows; device handover purge",
    repo: "mobile", prompt: 6, planRefs: "§72",
  },
  "cross-surface": {
    description: "Shared lead truth between web and mobile, including schema drift guards",
    repo: "both", prompt: 6, planRefs: "§38",
  },

  // ── Prompt 7 — conversation and voice ────────────────────────────────────
  "audio-recording": {
    description: "Device recording mechanics, interruptions, keep-awake released exactly once",
    repo: "mobile", prompt: 7, planRefs: "§36",
  },
  "conversation-pipeline": {
    description: "Upload, storage, processing state machine, failure classification before retry",
    repo: "web", prompt: 7, planRefs: "§69",
  },

  // ── Prompt 8 — intelligence and dashboards ───────────────────────────────
  "intelligence-readmodel": {
    description: "Transcript, evidence, themes, objections, briefing as distinct scoped artifacts",
    repo: "web", prompt: 8, planRefs: "§69",
  },
  dashboards: {
    description: "Every displayed number recomputed from authoritative rows, never snapshotted",
    repo: "web", prompt: 8, planRefs: "§41",
  },
  "fallback-provenance": {
    description: "Which source served a read: canonical vs legacy fallback. Incident e4f422c",
    repo: "web", prompt: 8, planRefs: "§71",
  },

  // ── Prompt 9 — workflows, campaigns, signals ─────────────────────────────
  workflows: {
    description: "Trigger matching, approval states, single-tick claim guarantees",
    repo: "web", prompt: 9, planRefs: "§6, §44",
  },
  campaigns: {
    description: "Campaign state machine, content correctness, send correctness, identity",
    repo: "web", prompt: 9, planRefs: "§42, §17",
  },
  signals: {
    description: "Signal library CRUD, scope, and API/UI permission parity",
    repo: "web", prompt: 9, planRefs: "§43",
  },

  // ── Prompt 10 — Google provider ──────────────────────────────────────────
  "provider-oauth": {
    description: "OAuth ticket contract, state/PKCE/nonce, callback replay, open redirect",
    repo: "both", prompt: 10, planRefs: "§45, §15",
  },
  "provider-gmail": {
    description: "From/Reply-To identity, MIME building, message ID persistence, duplicate send",
    repo: "web", prompt: 10, planRefs: "§46",
  },
  "provider-calendar": {
    description: "Availability boundaries, two-week horizon, DST, meeting create/edit/cancel",
    repo: "web", prompt: 10, planRefs: "§47",
  },
  "provider-followup": {
    description: "Private acting-user follow-up events with no lead attendee and no conferencing",
    repo: "web", prompt: 10, planRefs: "§16, §47",
  },

  // ── Prompt 11 — AI ───────────────────────────────────────────────────────
  "ai-prompt-scope": {
    description: "Assembled prompt contains only the target lead, event and company",
    repo: "web", prompt: 11, planRefs: "§70",
  },
  "ai-quality": {
    description: "Golden-set eval scored against a rubric; scheduled, not per-commit",
    repo: "web", prompt: 11, planRefs: "§70",
  },
  "ai-drift": {
    description: "Model identifier pinning and rubric-score regression detection",
    repo: "web", prompt: 11, planRefs: "§70",
  },

  // ── Prompt 12 — API, async, migrations, compatibility ────────────────────
  "api-contract": {
    description: "Per-route methods, auth, scope, schema, error shape; route inventory gate",
    repo: "web", prompt: 12, planRefs: "§49",
  },
  "async-jobs": {
    description: "Enqueue, retry, poison records, reconciliation of unknown outcomes",
    repo: "web", prompt: 12, planRefs: "§48",
  },
  webhooks: {
    description: "Inbound signature and replay; outbound payload scope and dead-letter",
    repo: "web", prompt: 12, planRefs: "§48, §74",
  },
  migrations: {
    description: "Fresh and historical migration, generated types vs live schema, 0076 gap",
    repo: "web", prompt: 12, planRefs: "§51",
  },
  "client-compat": {
    description: "Frozen API contract snapshot per released store binary, replayed each deploy",
    repo: "both", prompt: 12, planRefs: "§73",
  },

  // ── Prompt 13 — security and configuration ───────────────────────────────
  security: {
    description: "IDOR, escalation, mass assignment, injection, XSS, CSRF, SSRF, leakage",
    repo: "web", prompt: 13, planRefs: "§53",
  },
  "bypass-assertions": {
    description: "Every bypass, seed, debug and playground path positively asserted rejecting",
    repo: "web", prompt: 13, planRefs: "§75",
  },
  config: {
    description: "Required variables, key rotation, preview vs production secret separation",
    repo: "web", prompt: 13, planRefs: "§58",
  },
  "feature-flags": {
    description: "Flag defaults, kill switches, hidden UI still blocked server-side",
    repo: "both", prompt: 13, planRefs: "§64",
  },

  // ── Prompt 14 — operability ──────────────────────────────────────────────
  performance: {
    description: "Budgets, p50/p95/p99, query counts, 5k supported and 10k spot check",
    repo: "both", prompt: 14, planRefs: "§55",
  },
  resilience: {
    description: "Fault injection at each dependency boundary; retries do not amplify outages",
    repo: "web", prompt: 14, planRefs: "§56",
  },
  observability: {
    description: "Structured logs, correlation IDs end to end, alerts, error reference IDs",
    repo: "web", prompt: 14, planRefs: "§57",
  },
  visual: {
    description: "Four to five screenshot baselines; no native browser date/time controls",
    repo: "both", prompt: 14, planRefs: "§61",
  },
  "production-smoke": {
    description: "Post-deploy synthetic tenant canaries against safe paths",
    repo: "web", prompt: 14, planRefs: "§66",
  },
  governance: {
    description: "Flake governance, combinatorial reduction, mutation testing, release gates",
    repo: "both", prompt: 14, planRefs: "§65, §78, §80",
  },
};

export const AREA_NAMES = Object.freeze(Object.keys(AREAS).sort());

/** Throw a helpful error for an unknown area rather than silently matching nothing. */
export function assertKnownArea(name) {
  if (Object.prototype.hasOwnProperty.call(AREAS, name)) return name;
  const near = AREA_NAMES.filter(
    (a) => a.includes(name) || name.includes(a) || levenshtein(a, name) <= 3
  );
  const hint = near.length ? `\n  Did you mean: ${near.join(", ")}?` : "";
  throw new Error(
    `Unknown test area "${name}".${hint}\n  Known areas (${AREA_NAMES.length}): ${AREA_NAMES.join(", ")}`
  );
}

export function assertKnownSeverity(name) {
  if (SEVERITIES.includes(name)) return name;
  throw new Error(`Unknown severity "${name}". Expected one of: ${SEVERITIES.join(", ")}`);
}

export function assertKnownLayer(name) {
  if (LAYERS.includes(name)) return name;
  throw new Error(`Unknown test layer "${name}". Expected one of: ${LAYERS.join(", ")}`);
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}
