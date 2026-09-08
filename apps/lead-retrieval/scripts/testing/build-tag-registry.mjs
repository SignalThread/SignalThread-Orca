#!/usr/bin/env node
/**
 * Generate `tag-registry.json` — the retro-tag map for pre-existing tests.
 *
 * Prompt 2 step 8: "Retro-tag the existing test suite with areas and severities based
 * on Prompt 1's classification, so the baseline number is real from day one."
 *
 * Rules are ordered and first-match-wins, so put specific rules before general ones.
 * Severity defaults follow Brief §8: anything that proves isolation, authorization,
 * secret handling or duplicate side effects is P0; core workflow is P1; the rest P2.
 *
 * Re-run after adding tests:  node scripts/testing/build-tag-registry.mjs
 * Check without writing:      node scripts/testing/build-tag-registry.mjs --check
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS } from "./areas.mjs";
import { isKnownCategory } from "./categories.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "..", "..");
const MOBILE_ROOT = process.env.LR_MOBILE_ROOT || path.resolve(WEB_ROOT, "..", "lead-intel-scan");
const OUT = path.join(HERE, "tag-registry.json");

const SKIP_DIRS = new Set([".git", ".next", "node_modules", "coverage", "dist", "out", "build", "playwright-report", "test-results", "ios", "android", ".expo", "_archive", ".lr-test"]);
const TEST_EXT = /\.(test|spec)\.(ts|tsx|mjs|js|jsx)$/;

/**
 * @type {Array<[RegExp, string, string, string, string]>}
 *   [match, area, severity, layer, category]
 *
 * First match wins. Ordered most-specific first.
 *
 * `category` decides WHERE a test may run (Brief §9). Defaults chosen deliberately:
 *   - the inherited suite is overwhelmingly pure logic against real functions with no
 *     network, so `local-only` is the honest tag for it, not `prod-safe`
 *   - Maestro flows are `requires-device`
 *   - the Prompt 4 RLS suite is `separate-security-db` — tagged and routed, never deleted
 *   - load-tests are `load-stress`
 */
const RULES = [
  // ── infrastructure ─────────────────────────────────────────────────────────
  [/^WEB\/tests\/testing-infra\//, "test-infra", "P2", "static"],
  [/^WEB\/tests\/seams\/|^MOBILE\/lib\/testing\//, "seams", "P0", "unit"],
  [/^WEB\/tests\/isolation\//, "tenant-isolation", "P0", "api"],
  [/^WEB\/tests\/lead-domain\/briefing-strategy-autosave/, "autosave", "P1", "api"],
  [/^WEB\/tests\/lead-domain\/import-readiness-parity|leads-export-security/, "import", "P1", "unit"],
  [/^WEB\/tests\/lead-domain\//, "lead-domain", "P1", "unit"],
  [/^WEB\/tests\/conversation\//, "conversation-pipeline", "P1", "unit"],
  [/^MOBILE\/lib\/conversation\/|^MOBILE\/lib\/voice-notes\//, "conversation-pipeline", "P1", "unit"],
  [/^WEB\/tests\/dashboards\/fallback-provenance/, "fallback-provenance", "P0", "unit"],
  [/^WEB\/tests\/dashboards\//, "dashboards", "P1", "unit"],
  [/^WEB\/tests\/campaigns\//, "campaigns", "P1", "unit"],
  [/^WEB\/tests\/workflows\//, "workflows", "P1", "unit"],
  [/^WEB\/tests\/provider\/gmail/, "provider-gmail", "P0", "provider"],
  [/^WEB\/tests\/provider\/calendar/, "provider-calendar", "P1", "provider"],
  [/^WEB\/tests\/provider\//, "provider-oauth", "P0", "provider"],
  [/^WEB\/tests\/ai\/golden-set/, "ai-quality", "P2", "unit"],
  [/^WEB\/tests\/ai\//, "ai-drift", "P1", "unit"],
  [/^WEB\/tests\/api\//, "api-contract", "P0", "static"],
  [/^WEB\/tests\/security\/bypass/, "bypass-assertions", "P0", "security"],
  [/^WEB\/tests\/security\//, "security", "P0", "security"],
  [/^WEB\/tests\/governance\/resilience/, "resilience", "P1", "unit"],
  [/^WEB\/tests\/governance\//, "governance", "P0", "static"],

  // ── device flows ───────────────────────────────────────────────────────────
  [/^MOBILE\/\.maestro\/flows\/.*apple_review/, "bypass-assertions", "P0", "e2e-mobile"],
  [/^MOBILE\/\.maestro\/flows\/.*offline/, "mobile-offline", "P1", "e2e-mobile"],
  [/^MOBILE\/\.maestro\/flows\/.*(capture|scan)/, "mobile-capture", "P1", "e2e-mobile"],
  [/^MOBILE\/\.maestro\/flows\/.*sign_in/, "auth-session", "P0", "e2e-mobile"],
  [/^MOBILE\/\.maestro\/flows\//, "mobile-capture", "P2", "e2e-mobile"],

  // ── security and bypass ────────────────────────────────────────────────────
  [/e2e-auth-bypass|apple-review-login|emergency-login/, "bypass-assertions", "P0", "security"],
  [/cross-tenant|account-isolation|tenant-isolation/, "tenant-isolation", "P0", "api"],
  [/documents-email-account-isolation/, "tenant-isolation", "P0", "api"],
  [/^WEB\/tests\/db\//, "rls", "P0", "db"],
  // Existing *rls* files assert on migration SQL TEXT — they never open a connection.
  // Tagging them `static` keeps the layer meaningful: `db` means "needs Postgres".
  [/-rls-|briefing-rls|\/rls/, "rls", "P0", "static"],
  [/bearer|internal-auth|zoominfo-bearer|hubspot-disconnect/, "security", "P0", "api"],

  // ── Pipedrive ──────────────────────────────────────────────────────────────
  // Company-owned OAuth plus company-scoped delivery setup. Listed ahead of the
  // generic domain rules so files like `pipedrive-redirect-uri` are not captured
  // by the broad /redirect/ navigation rule.
  [/pipedrive/, "provider-oauth", "P0", "provider"],

  // ── auth ───────────────────────────────────────────────────────────────────
  [/invite|redeem|activation|resend-auth/, "auth-session", "P0", "api"],
  [/login|otp|session|auth-callback|recovery-routing/, "auth-session", "P0", "api"],
  [/role|rbac|permission|access-matrix|viewer|scope-pr|app-access|authoriz/, "auth-rbac", "P0", "api"],
  [/license|seat/, "auth-rbac", "P1", "api"],

  // ── isolation ──────────────────────────────────────────────────────────────
  [/event-scope|event-slice|imported-lead-event|materialization-scope|admin-app-event/, "event-isolation", "P0", "api"],

  // ── lead domain and import ─────────────────────────────────────────────────
  [/leads-export/, "collections", "P1", "api"],
  [/field-mapping|custom-field|import-batch|import-wizard|publish|lead-import/, "import", "P1", "unit"],
  [/enrich|zoominfo|apollo|pdl/, "lead-domain", "P2", "unit"],
  [/temperature|priority|follow-up|lead-qualification|lead-delete|lead-detail|exhibitor-lead/, "lead-domain", "P1", "unit"],
  [/briefing-strategy|strategy-merge|manual-context-save/, "autosave", "P1", "api"],
  [/filter|drilldown/, "filters", "P2", "component"],
  [/serialize-search-params|search|sort|pagination/, "collections", "P2", "unit"],
  [/entry-point|redirect|navigation|shell-page/, "navigation", "P2", "component"],

  // ── conversation and intelligence ──────────────────────────────────────────
  [/chunked-upload|conversation-processing|conversation-lifecycle|voice-note|context-voice/, "conversation-pipeline", "P1", "api"],
  [/conversation|transcript|synthes/, "conversation-pipeline", "P1", "unit"],
  [/brief|insight|intelligence|evidence|theme/, "intelligence-readmodel", "P1", "unit"],
  [/command-center|workspace|portfolio|account-summary|dashboard/, "dashboards", "P1", "unit"],

  // ── workflows, campaigns, signals ──────────────────────────────────────────
  [/workflow-create-run-idempotency|workflow-internal-auth/, "workflows", "P0", "api"],
  [/workflow/, "workflows", "P1", "unit"],
  [/campaign-send/, "campaigns", "P0", "api"],
  [/campaign|draft|agent-draft/, "campaigns", "P1", "unit"],
  [/signal/, "signals", "P2", "unit"],

  // ── providers ──────────────────────────────────────────────────────────────
  [/oauth|connection-health|mobile-oauth|integrationApi/, "provider-oauth", "P0", "provider"],
  [/gmail|email-template|documents-email|mime/, "provider-gmail", "P1", "provider"],
  [/calendar|meeting|availability|scheduler/, "provider-calendar", "P1", "provider"],
  [/token-manager/, "provider-oauth", "P1", "provider"],
  [/hubspot|salesforce|streampoint|crm|webhook/, "webhooks", "P1", "api"],

  // ── API, async, migration ──────────────────────────────────────────────────
  [/route-contract|api-contract|access-readiness|campaign-readiness/, "api-contract", "P0", "api"],
  [/internal-health|job-cron|cron-freshness|provider-failure-spikes/, "async-jobs", "P1", "api"],
  [/schema-contract|data-integrity|migration/, "migrations", "P1", "migration"],

  // ── AI ─────────────────────────────────────────────────────────────────────
  [/prompt|llm|openai|ai-polish|ai-brief/, "ai-prompt-scope", "P1", "unit"],

  // ── mobile ─────────────────────────────────────────────────────────────────
  [/^MOBILE\/lib\/local-db\//, "mobile-localdb", "P0", "unit"],
  [/^MOBILE\/lib\/sync\/|outbox|backoff|reconcil/, "mobile-offline", "P1", "unit"],
  [/^MOBILE\/.*(capture|scan|qr|badge)/, "mobile-capture", "P1", "unit"],
  [/^MOBILE\/.*(audio|record|voice)/, "audio-recording", "P1", "unit"],
  [/^MOBILE\/.*(auth|session)/, "auth-session", "P0", "unit"],
  [/mobile-events|mobile-lead|cross-surface/, "cross-surface", "P1", "api"],

  // ── perf ───────────────────────────────────────────────────────────────────
  [/load|perf|scale/, "performance", "P2", "perf"],

  // ── remainder, resolved individually rather than left UNTAGGED ─────────────
  [/platform-admin-account-context/, "tenant-isolation", "P0", "api"],
  [/company-event-access|exhibitor-access-model|exhibitor-no-event-access|company-scoped-user-actions|exhibitor-settings-scope|exhibitor-users-company-scope/, "auth-rbac", "P0", "api"],
  [/0066-users-select-visibility-recursion/, "rls", "P0", "static"],
  [/company-team-/, "auth-rbac", "P1", "api"],
  [/password-form-state|reset\//, "auth-session", "P1", "component"],
  [/google-token-encryption/, "config", "P0", "unit"],
  [/google-(disconnect|document-send|email-send-core)/, "provider-gmail", "P1", "provider"],
  [/create-event|admin-create-event|event-settings-update|exhibitor-company-event-creation|exhibitor-create-event-flow/, "navigation", "P1", "api"],
  [/event-lifecycle|event-container-kind|event-date-range-timezone/, "dashboards", "P1", "unit"],
  [/exhibitor-(app-nav|sidebar-mode|top-bar|event-menu)|exhibitor-users-page-banner|exhibitor-app-active-event-logic/, "navigation", "P2", "component"],
  [/importer-validation-shared-path/, "import", "P1", "unit"],
  [/documents-(library-link-contract|preview-route)/, "security", "P1", "api"],
  [/batch-downstream-stale/, "import", "P2", "unit"],
  [/browser-facing-url/, "config", "P2", "unit"],
  [/journeys\/lead-audio-lifecycle/, "conversation-pipeline", "P1", "api"],
  [/journeys\/lead-(create|update|document)/, "lead-domain", "P1", "api"],
  [/journeys\/agent-create|journeys\/golden-exhibitor-journey/, "governance", "P1", "api"],
  [/journeys\/journey-harness-smoke/, "test-infra", "P2", "static"],
  [/prod-canary-scripts/, "production-smoke", "P1", "smoke"],
  [/e2e-artifact-cleanup-contract|test-script-inventory/, "test-infra", "P2", "static"],
  [/help-docs-content/, "governance", "P3", "static"],

  // ── added after the v3.2 doc update, which landed new dashboard/timezone tests ──
  [/lead-metrics-timezone|event-timezone-options/, "dashboards", "P1", "unit"],
  [/admin-events-account-context|platform-admin-company-entry-ux/, "tenant-isolation", "P0", "api"],

  // ── web E2E fallback ───────────────────────────────────────────────────────
  [/^WEB\/e2e\//, "navigation", "P1", "e2e-web"],

  // ── mobile fallback ────────────────────────────────────────────────────────
  [/^MOBILE\//, "cross-surface", "P2", "unit"],
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const posix = (p) => p.split(path.sep).join("/");

function discover() {
  const ids = [];
  for (const dir of ["tests", "app", "lib", "e2e"]) {
    for (const abs of walk(path.join(WEB_ROOT, dir))) {
      if (TEST_EXT.test(abs)) ids.push(`WEB/${posix(path.relative(WEB_ROOT, abs))}`);
    }
  }
  if (existsSync(MOBILE_ROOT)) {
    for (const abs of walk(MOBILE_ROOT)) {
      if (TEST_EXT.test(abs)) ids.push(`MOBILE/${posix(path.relative(MOBILE_ROOT, abs))}`);
    }
    for (const abs of walk(path.join(MOBILE_ROOT, ".maestro", "flows"))) {
      if (/\.ya?ml$/.test(abs)) ids.push(`MOBILE/${posix(path.relative(MOBILE_ROOT, abs))}`);
    }
  }
  return [...new Set(ids)].sort();
}

/**
 * Category rules, applied to the resolved path. Ordered most-specific first.
 * Anything not matched falls through to `local-only`, which is the safe default for the
 * inherited suite: it cannot reach production, so a mis-tag fails closed.
 */
const CATEGORY_RULES = [
  // Out-of-program categories first — these must never be silently reclassified.
  [/^WEB\/tests\/db\//, "separate-security-db"],
  [/^WEB\/load-tests\/|^WEB\/tests\/.*load.*\.(test|spec)\./, "load-stress"],
  [/^MOBILE\/\.maestro\/flows\//, "requires-device"],

  // Production-safe: real browser journeys and production canary scripts.
  [/^WEB\/e2e\//, "prod-safe"],
  [/prod-canary|production-smoke/, "prod-safe"],

  // Everything else in the inherited suite is deterministic local logic.
  [/.*/, "local-only"],
];

function categoryFor(id) {
  for (const [re, category] of CATEGORY_RULES) {
    if (re.test(id)) return category;
  }
  return "local-only";
}

function tagFor(id) {
  for (const [re, area, severity, layer] of RULES) {
    if (re.test(id)) return { area, severity, layer, category: categoryFor(id) };
  }
  return null;
}

const ids = discover();
/** @type {Record<string, {area:string,severity:string,layer:string}>} */
const tags = {};
const untagged = [];
for (const id of ids) {
  const t = tagFor(id);
  if (t) tags[id] = t; else untagged.push(id);
}

for (const [id, t] of Object.entries(tags)) {
  if (!AREAS[t.area]) throw new Error(`Rule produced unknown area "${t.area}" for ${id}`);
  if (!isKnownCategory(t.category)) throw new Error(`Rule produced unknown category "${t.category}" for ${id}`);
}

const payload = {
  $comment: [
    "Generated by scripts/testing/build-tag-registry.mjs — do not hand-edit.",
    "New tests should declare their own tags with an in-file `// @lr area=… severity=… layer=…`",
    "directive, which takes priority over this file. This registry exists to give the",
    "435 pre-existing test files a real baseline without editing all of them.",
  ],
  generatedFrom: "scripts/testing/build-tag-registry.mjs",
  fileCount: Object.keys(tags).length,
  tags,
};

if (process.argv.includes("--check")) {
  const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const same = existing && JSON.stringify(existing.tags) === JSON.stringify(tags);
  console.log(same ? "tag-registry.json is up to date." : "tag-registry.json is STALE — re-run without --check.");
  if (untagged.length) console.log(`${untagged.length} untagged file(s).`);
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${Object.keys(tags).length} tagged files to ${path.relative(WEB_ROOT, OUT)}`);
if (untagged.length) {
  console.log(`\n${untagged.length} file(s) matched no rule and remain UNTAGGED:`);
  for (const id of untagged) console.log(`  ${id}`);
}
