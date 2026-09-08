#!/usr/bin/env node
/**
 * LR Test Suite runner.
 *
 * A thin orchestrator over the four frameworks actually in play — `node:test` and
 * Playwright in WEB, Vitest and Maestro in MOBILE — aggregating them into one count
 * and one exit code. It is not a replacement for any of them; each lane still runs
 * under its own framework, and this process only selects, tags, and aggregates.
 *
 *   npm run test                            everything, summary output
 *   npm run test -- --area mobile-capture   one area
 *   npm run test -- --p0                    severity filter
 *   npm run test -- --layer unit,api        layer filter
 *   npm run test -- --detailed              full per-test output
 *   npm run test -- --json                  machine-readable, feeds the coverage matrix
 *
 * Non-negotiables from Brief §9, all enforced below:
 *   - exit code is non-zero if any test fails
 *   - retries are reported, never hidden; a suite that passes only on rerun fails
 *   - known-defect skips are counted and listed separately from passes
 *   - `requires-device` tests are reported not-run, never counted as passes
 *   - the environment guard aborts the run before any test executes
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS, AREA_NAMES, LAYERS, SEVERITIES, assertKnownArea, assertKnownLayer, assertKnownSeverity } from "./areas.mjs";
import { compileRegistry, resolveTags, readSourceSafe } from "./tags.mjs";
import { enforceEnvironment, supabaseProjectRef, resolveProductionIdentifiers } from "./env-guard.mjs";
import { summarize, exitCodeFor, severitySkipViolations, summarizeCategories, unknownCategories } from "./summarize.mjs";
import {
  CATEGORIES, CATEGORY_NAMES, EXCLUDED_CATEGORIES,
  assertKnownCategory, resolveTarget, routeCategory,
} from "./categories.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "..", "..");
const MOBILE_ROOT = process.env.LR_MOBILE_ROOT || path.resolve(WEB_ROOT, "..", "lead-intel-scan");
const ARTIFACT_DIR = path.join(WEB_ROOT, ".lr-test");

const SKIP_DIRS = new Set([
  ".git", ".next", "node_modules", "coverage", "dist", "out", "build",
  "playwright-report", "test-results", "ios", "android", ".expo", "_archive", ".lr-test",
]);

// ── CLI ─────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { areas: [], severities: [], layers: [], categories: [], detailed: false, json: false, strictTags: false, lanes: null, listAreas: false, listCategories: false, retries: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const takeValue = () => {
      const eq = a.indexOf("=");
      if (eq !== -1) return a.slice(eq + 1);
      return argv[++i];
    };
    if (a === "--detailed") opts.detailed = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--strict-tags") opts.strictTags = true;
    else if (a === "--list-areas") opts.listAreas = true;
    else if (a === "--list-categories") opts.listCategories = true;
    else if (a.startsWith("--category")) opts.categories.push(...splitList(takeValue()));
    else if (a.startsWith("--area")) opts.areas.push(...splitList(takeValue()));
    else if (a.startsWith("--layer")) opts.layers.push(...splitList(takeValue()));
    else if (a.startsWith("--severity")) opts.severities.push(...splitList(takeValue()));
    else if (a.startsWith("--lane")) opts.lanes = splitList(takeValue());
    else if (a.startsWith("--retries")) opts.retries = Number(takeValue()) || 0;
    else if (/^--p[0-3]$/.test(a)) opts.severities.push(a.slice(2).toUpperCase());
    else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
    else if (a.startsWith("-")) { console.error(`Unknown flag: ${a}\n`); printHelp(); process.exit(2); }
  }
  opts.areas.forEach(assertKnownArea);
  opts.severities.forEach(assertKnownSeverity);
  opts.layers.forEach(assertKnownLayer);
  opts.categories.forEach((c) => assertKnownCategory(c, "--category"));
  return opts;
}

const splitList = (v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function printHelp() {
  console.log(`
LR Test Suite

  npm run test                          everything
  npm run test -- --area <name>[,<name>]  filter by area  (repeatable)
  npm run test -- --p0                    only P0  (also --p1 --p2 --p3)
  npm run test -- --severity P0,P1        explicit severity list
  npm run test -- --layer unit,api        filter by layer
  npm run test -- --category prod-safe    filter by category
  npm run test -- --list-categories       print the category registry and exit
  npm run test -- --lane web-node         limit to one lane
  npm run test -- --detailed              per-test output
  npm run test -- --json                  machine-readable results
  npm run test -- --strict-tags           fail if any test file is untagged
  npm run test -- --list-areas            print the area registry and exit

  Lanes:      web-node, web-playwright, mobile-vitest, mobile-maestro
  Layers:     ${LAYERS.join(", ")}
  Severities: ${SEVERITIES.join(", ")}
  Categories: ${CATEGORY_NAMES.join(", ")}

  Environment:
    LR_TARGET=production|local   what this run points at (auto-detected otherwise)
    LR_LIVE_EVENT=1              a customer event is running: defer production WRITES
`);
}

// ── discovery ───────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

const posix = (p) => p.split(path.sep).join("/");
const TEST_EXT = /\.(test|spec)\.(ts|tsx|mjs|js|jsx)$/;

function isPlaywrightSpec(abs) {
  try { return /from\s+["']@playwright\/test["']|require\(["']@playwright\/test["']\)/.test(readFileSync(abs, "utf8")); }
  catch { return false; }
}

/** Discover every test file in both repos and attach resolved tags. */
function discover(compiled) {
  /** @type {Array<{lane:string, repo:string, root:string, abs:string, rel:string, id:string, tags:object}>} */
  const files = [];

  const push = (lane, repo, root, abs) => {
    const rel = posix(path.relative(root, abs));
    const id = `${repo}/${rel}`;
    files.push({ lane, repo, root, abs, rel, id, tags: resolveTags(id, compiled, readSourceSafe(abs)) });
  };

  // WEB — node:test lane mirrors scripts/run-node-tests.mjs discovery, minus Playwright specs.
  for (const dir of ["tests", "app", "lib"]) {
    for (const abs of walk(path.join(WEB_ROOT, dir))) {
      if (!TEST_EXT.test(abs)) continue;
      push(isPlaywrightSpec(abs) ? "web-playwright" : "web-node", "WEB", WEB_ROOT, abs);
    }
  }
  // WEB — Playwright lane.
  for (const abs of walk(path.join(WEB_ROOT, "e2e"))) {
    if (TEST_EXT.test(abs)) push("web-playwright", "WEB", WEB_ROOT, abs);
  }

  // MOBILE — Vitest lane.
  if (existsSync(MOBILE_ROOT)) {
    for (const abs of walk(MOBILE_ROOT)) {
      if (TEST_EXT.test(abs)) push("mobile-vitest", "MOBILE", MOBILE_ROOT, abs);
    }
    // MOBILE — Maestro flows. Not executable here; reported not-run.
    const flowsDir = path.join(MOBILE_ROOT, ".maestro", "flows");
    for (const abs of walk(flowsDir)) {
      if (/\.ya?ml$/.test(abs)) push("mobile-maestro", "MOBILE", MOBILE_ROOT, abs);
    }
  }

  return files.sort((a, b) => a.id.localeCompare(b.id));
}

function selects(file, opts) {
  const { area, severity, layer, category } = file.tags;
  if (opts.categories.length && !opts.categories.includes(category)) return false;
  if (opts.areas.length && !opts.areas.includes(area)) return false;
  if (opts.severities.length && !opts.severities.includes(severity)) return false;
  if (opts.layers.length && !opts.layers.includes(layer)) return false;
  if (opts.lanes && !opts.lanes.includes(file.lane)) return false;
  return true;
}

// ── lane execution ──────────────────────────────────────────────────────────────

function run(cmd, args, cwd, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: `${stderr}\n${err.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** node:test lane. Emits NDJSON through the custom reporter. */
async function runWebNode(files, opts) {
  if (!files.length) return [];
  const outFile = path.join(ARTIFACT_DIR, "web-node.ndjson");
  const reporter = path.relative(WEB_ROOT, path.join(HERE, "reporters", "ndjson.mjs"));
  const args = [
    "--experimental-test-module-mocks",
    "--import", "tsx",
    "--test",
    `--test-reporter=./${posix(reporter)}`, `--test-reporter-destination=${outFile}`,
    ...files.map((f) => f.rel),
  ];
  const res = await run(process.execPath, args, WEB_ROOT, { LR_TEST_LANE: "web-node" });
  const results = parseNdjson(outFile, files, "web-node");
  if (!results.length && res.code !== 0) {
    return [laneCrash("web-node", res)];
  }
  return results;
}

/** Vitest lane. Vitest's JSON reporter gives per-assertion results. */
async function runMobileVitest(files, opts) {
  if (!files.length || !existsSync(MOBILE_ROOT)) return [];
  const outFile = path.join(ARTIFACT_DIR, "mobile-vitest.json");
  const args = ["vitest", "run", "--reporter=json", `--outputFile=${outFile}`, ...files.map((f) => f.rel)];
  const res = await run("npx", args, MOBILE_ROOT, { LR_TEST_LANE: "mobile-vitest" });
  if (!existsSync(outFile)) return [laneCrash("mobile-vitest", res)];
  /** @type {any} */
  let report;
  try { report = JSON.parse(readFileSync(outFile, "utf8")); }
  catch { return [laneCrash("mobile-vitest", res)]; }

  const byFile = new Map(files.map((f) => [path.resolve(MOBILE_ROOT, f.rel), f]));
  const out = [];
  for (const suite of report.testResults ?? []) {
    const file = byFile.get(path.resolve(suite.name ?? "")) ?? null;
    for (const a of suite.assertionResults ?? []) {
      out.push({
        lane: "mobile-vitest",
        repo: "MOBILE",
        fileId: file?.id ?? `MOBILE/${posix(path.relative(MOBILE_ROOT, suite.name ?? ""))}`,
        tags: file?.tags ?? untagged(),
        name: [...(a.ancestorTitles ?? []), a.title].join(" › "),
        status: a.status === "pending" || a.status === "skipped" ? "skipped" : a.status === "failed" ? "failed" : "passed",
        durationMs: a.duration ?? null,
        skipReason: null,
        error: a.status === "failed" ? { message: (a.failureMessages ?? []).join("\n").slice(0, 400) } : null,
      });
    }
  }
  return out;
}

/** Playwright lane. Needs a server; absence is reported, not silently passed. */
async function runWebPlaywright(files, opts) {
  if (!files.length) return [];
  if (process.env.LR_RUN_PLAYWRIGHT !== "1") {
    return files.map((f) => notRun(f, "web-playwright", "requires a running server; set LR_RUN_PLAYWRIGHT=1"));
  }
  const outFile = path.join(ARTIFACT_DIR, "web-playwright.json");
  const res = await run("npx", ["playwright", "test", "--reporter=json", ...files.map((f) => f.rel)], WEB_ROOT, {
    PLAYWRIGHT_JSON_OUTPUT_NAME: outFile, LR_TEST_LANE: "web-playwright",
  });
  let report;
  try { report = JSON.parse(existsSync(outFile) ? readFileSync(outFile, "utf8") : res.stdout); }
  catch { return [laneCrash("web-playwright", res)]; }

  const byFile = new Map(files.map((f) => [f.rel, f]));
  const out = [];
  const visit = (suite, trail) => {
    for (const spec of suite.specs ?? []) {
      const file = byFile.get(spec.file ?? suite.file ?? "") ?? null;
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const final = results[results.length - 1] ?? {};
        const retried = Math.max(0, results.length - 1);
        out.push({
          lane: "web-playwright", repo: "WEB",
          fileId: file?.id ?? `WEB/${spec.file ?? ""}`,
          tags: file?.tags ?? untagged(),
          name: [...trail, spec.title].join(" › "),
          status: final.status === "passed" ? "passed" : final.status === "skipped" ? "skipped" : "failed",
          durationMs: final.duration ?? null,
          retries: retried,
          skipReason: null,
          error: final.error ? { message: String(final.error.message ?? "").slice(0, 400) } : null,
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child, [...trail, child.title].filter(Boolean));
  };
  for (const s of report.suites ?? []) visit(s, [s.title].filter(Boolean));
  return out;
}

/**
 * Maestro lane. There is no simulator or Xcode in this environment, so these are
 * reported not-run. Prompts doc: "never counted as a pass."
 */
async function runMobileMaestro(files) {
  return files.map((f) => notRun(f, "mobile-maestro", "requires-device: no iOS/Android simulator in this environment"));
}

/**
 * Is a live, non-production test database configured?
 *
 * Prompt 4 found that .env.local, .env.production.local and .env.vercel.local all point
 * at the SAME Supabase project — production. There is no test database. Tests tagged
 * `layer=db` are therefore committed but reported not-run, exactly like the Maestro
 * device flows, rather than being run against production or silently skipped.
 *
 * Requires BOTH a service-role key and an explicit allowlist entry, so a test database
 * has to be named deliberately. Defaulting to "any non-production project" would let a
 * mis-set env quietly point the DB suite somewhere unintended.
 */
export function testDatabaseAvailable(env = process.env) {
  const url = env.LR_TEST_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const ref = supabaseProjectRef(url);
  if (!ref) return { available: false, reason: "no Supabase project configured" };
  if (!(env.LR_TEST_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    return { available: false, reason: "no service-role key configured" };
  }
  const allowed = String(env.LR_TEST_ALLOWED_SUPABASE_REFS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(ref)) {
    return {
      available: false,
      reason: `Supabase ref is not in LR_TEST_ALLOWED_SUPABASE_REFS — refusing to run database tests against an unvetted project`,
    };
  }
  return { available: true, reason: null };
}

/** A result for work this program deliberately does not run. Its own bucket. */
function excluded(file, reason) {
  return {
    lane: file.lane, repo: file.repo, fileId: file.id, tags: file.tags,
    name: file.rel, status: "excluded", excludedReason: reason,
    durationMs: null, error: null,
  };
}

/**
 * Production Supabase refs, for target detection. Reuses the env-guard's resolution so
 * there is one definition of "production" in the runner, not two that can drift.
 */
function resolveKnownProductionRefs() {
  try {
    const { refs } = resolveProductionIdentifiers({ repoRoot: WEB_ROOT, env: process.env });
    return refs;
  } catch {
    return new Set();
  }
}

function notRun(file, lane, reason) {
  return { lane, repo: file.repo, fileId: file.id, tags: file.tags, name: file.rel, status: "not-run", notRunReason: reason, durationMs: null, error: null };
}
function laneCrash(lane, res) {
  return {
    lane, repo: lane.startsWith("web") ? "WEB" : "MOBILE", fileId: `${lane}:LANE`,
    tags: untagged(), name: `${lane} lane failed to produce results`, status: "failed",
    durationMs: null, error: { message: (res.stderr || res.stdout || "").slice(-1500) || `exit ${res.code}` },
  };
}
const untagged = () => ({ area: "UNTAGGED", severity: "UNTAGGED", layer: "UNTAGGED", source: "none" });

function parseNdjson(file, files, lane) {
  if (!existsSync(file)) return [];
  const byAbs = new Map(files.map((f) => [f.abs, f]));
  const out = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (ev.kind !== "test") continue;
    const abs = ev.file ? path.resolve(ev.file) : null;
    const f = abs ? byAbs.get(abs) : null;
    out.push({
      lane, repo: "WEB",
      fileId: f?.id ?? (abs ? `WEB/${posix(path.relative(WEB_ROOT, abs))}` : "WEB/unknown"),
      tags: f?.tags ?? untagged(),
      name: ev.name, status: ev.status, durationMs: ev.durationMs,
      skipReason: ev.skipReason, error: ev.error,
    });
  }
  return out;
}

// ── reporting ───────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

function printSummary(summary, elapsedMs, opts) {
  const { byArea, totals } = summary;
  const started = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  console.log(`\nLR Test Suite — ${started}`);

  const width = Math.max(24, ...byArea.map((a) => a.area.length + 2));
  for (const a of byArea) {
    const ran = a.passed + a.failed;
    const denom = ran + a.skipped + a.knownDefect;
    const marks = [];
    if (a.failed) marks.push(`✗ ${a.failed} failed`);
    if (a.knownDefect) marks.push(`${a.failed ? "" : "✗ "}${a.knownDefect} known-defect (skipped)`);
    if (a.flaky) marks.push(`⚠ ${a.flaky} flaky`);
    if (a.notRun) marks.push(`◦ ${a.notRun} not-run`);
    if (a.excluded) marks.push(`⊘ ${a.excluded} excluded`);
    const status = a.failed ? marks.join(" · ") : marks.length ? marks.join(" · ") : "✓";
    console.log(`  ${a.area.padEnd(width)}${String(`${a.passed}/${denom}`).padEnd(8)}${status}`);
  }

  console.log(`  ${"─".repeat(width + 30)}`);
  const parts = [`${totals.passed}/${totals.passed + totals.failed} passed`];
  if (totals.failed) parts.push(`${totals.failed} failed`);
  if (totals.knownDefect) parts.push(`${totals.knownDefect} known-defect`);
  if (totals.skipped) parts.push(`${totals.skipped} skipped`);
  if (totals.notRun) parts.push(`${totals.notRun} not-run`);
  if (totals.excluded) parts.push(`${totals.excluded} excluded`);
  if (totals.flaky) parts.push(`${totals.flaky} FLAKY`);
  parts.push(formatDuration(elapsedMs));
  console.log(`  ${parts.join(" · ")}\n`);

  if (totals.flaky) {
    console.log("  ⚠ A test that passed only on retry is reported as a flake, and the suite");
    console.log("    still fails. Brief §9: retries are reported, never hidden.\n");
  }

  // Brief §9: excluded work is listed separately from passes, failures, and skips, so it
  // is visible rather than silently missing.
  if (summary.excludedByCategory && Object.keys(summary.excludedByCategory).length) {
    console.log("  Excluded from this program (tagged, routed, never run):");
    for (const [cat, n] of Object.entries(summary.excludedByCategory).sort()) {
      console.log(`    ⊘ ${cat.padEnd(22)} ${n} test(s) — ${CATEGORIES[cat]?.reason ?? ""}`);
    }
    console.log("");
  }

  if (summary.deferredLiveEvent?.length) {
    console.log(`  ⏸ ${summary.deferredLiveEvent.length} production WRITE test(s) deferred — a customer event is live.`);
    console.log("    Recorded as deferred-live-event. Read-only production checks still ran.\n");
  }

  if (opts.detailed || totals.failed) {
    const failures = byArea.flatMap((a) => a.failures);
    if (failures.length) {
      console.log(`  Failures (${failures.length}):`);
      for (const f of failures) {
        console.log(`\n  ✗ [${f.tags?.severity ?? "?"} ${f.tags?.area ?? "?"}] ${f.name}`);
        console.log(`     ${f.fileId}`);
        if (f.error?.message) console.log(`     ${String(f.error.message).split("\n")[0].slice(0, 200)}`);
      }
      console.log("");
    }
  }

  if (opts.detailed) {
    console.log("  Per-test detail is in .lr-test/results.json (--json prints it to stdout).\n");
  }
}

// ── main ────────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.listAreas) {
    console.log(`\nLR test areas (${AREA_NAMES.length}):\n`);
    for (const name of AREA_NAMES) {
      const a = AREAS[name];
      console.log(`  ${name.padEnd(24)} P${a.prompt}  ${a.repo.padEnd(6)} ${a.planRefs}`);
      console.log(`  ${"".padEnd(24)}       ${a.description}`);
    }
    console.log("");
    return 0;
  }

  if (opts.listCategories) {
    console.log(`\nLR test categories (${CATEGORY_NAMES.length}) — category decides WHERE a test may run:\n`);
    for (const name of CATEGORY_NAMES) {
      const c = CATEGORIES[name];
      const flags = [
        c.mayTargetProduction ? "may target production" : "never targets production",
        c.runnable ? "runnable" : "NOT RUN by this program",
        `accounting: ${c.accounting}`,
      ].join(" · ");
      console.log(`  ${name}`);
      console.log(`    ${c.description}`);
      console.log(`    ${flags}`);
      console.log(`    why: ${c.reason}\n`);
    }
    return 0;
  }

  // Brief §11 — abort before anything executes.
  const guard = enforceEnvironment({ repoRoot: WEB_ROOT });
  if (!guard.ok) return 78; // EX_CONFIG

  const registryPath = path.join(HERE, "tag-registry.json");
  const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, "utf8")) : {};
  const compiled = compileRegistry(registry.tags ?? registry);

  const all = discover(compiled);
  const selected = all.filter((f) => selects(f, opts));

  // ── category routing (Brief §9) ────────────────────────────────────────────────
  // Resolve what this run points at, then decide per file whether it runs, is reported
  // not-run, is excluded from the program, or must abort the whole run.
  const prodRefs = new Set();
  if (guard.result.checked.configuredSupabaseRef && guard.result.checked.productionRefsKnown > 0) {
    // env-guard already established the production ref set; re-derive for target resolution.
  }
  for (const ref of resolveKnownProductionRefs()) prodRefs.add(ref);
  const target = resolveTarget(process.env, prodRefs);
  const liveEvent = process.env.LR_LIVE_EVENT === "1";

  const untaggedCategory = all.filter((f) => f.tags.category === "UNTAGGED");
  if (untaggedCategory.length) {
    console.error(`\n✖ ${untaggedCategory.length} test file(s) have no \`category\` tag.`);
    console.error("  Brief §9: every test carries area, severity, and category. There is no default —");
    console.error("  an untagged destructive test would otherwise inherit prod-safe.\n");
    for (const f of untaggedCategory.slice(0, 30)) console.error(`   ${f.id}`);
    if (untaggedCategory.length > 30) console.error(`   … and ${untaggedCategory.length - 30} more`);
    console.error("\n  Add a header directive, e.g.  // @lr area=lead-domain severity=P1 category=prod-safe");
    console.error("  or a rule in scripts/testing/build-tag-registry.mjs, then re-run npm run test:tags.\n");
    return 2;
  }

  const untaggedFiles = all.filter((f) => f.tags.area === "UNTAGGED");
  if (untaggedFiles.length) {
    const msg = `${untaggedFiles.length} of ${all.length} test files are UNTAGGED`;
    if (opts.strictTags) {
      console.error(`\n✖ ${msg}. --strict-tags is on, so this is fatal.\n`);
      for (const f of untaggedFiles.slice(0, 40)) console.error(`   ${f.id}`);
      if (untaggedFiles.length > 40) console.error(`   … and ${untaggedFiles.length - 40} more`);
      console.error("");
      return 2;
    }
    console.error(`⚠ ${msg}. They run, but are reported under "UNTAGGED".`);
  }

  if (!selected.length) {
    console.error(`\nNo test files matched the given filters. Nothing ran.`);
    console.error(`This is an error, not a pass — a filter that matches nothing usually means a typo.\n`);
    return 2;
  }

  rmSync(ARTIFACT_DIR, { recursive: true, force: true });
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  // Route every selected file by its category.
  const routed = { run: [], notRun: [], excluded: [] };
  for (const file of selected) {
    const decision = routeCategory(file.tags.category, {
      target,
      liveEvent,
      prodWrites: file.tags.prodWrites,
    });
    if (decision.action === "abort") {
      console.error("");
      console.error("  ╔══════════════════════════════════════════════════════════════════╗");
      console.error("  ║  LR TEST SUITE ABORTED — FORBIDDEN CATEGORY vs PRODUCTION TARGET ║");
      console.error("  ╚══════════════════════════════════════════════════════════════════╝");
      console.error("");
      console.error(`   ✖ ${file.id}`);
      console.error(`     ${decision.reason}`);
      console.error("");
      console.error("   No test was executed.");
      console.error("");
      return 78;
    }
    routed[decision.action === "run" ? "run" : decision.action === "excluded" ? "excluded" : "notRun"]
      .push({ file, reason: decision.reason });
  }

  if (routed.excluded.length) {
    const byCat = {};
    for (const e of routed.excluded) byCat[e.file.tags.category] = (byCat[e.file.tags.category] ?? 0) + 1;
    console.error(
      `◦ ${routed.excluded.length} file(s) excluded from this program: ` +
        Object.entries(byCat).map(([c, n]) => `${c}=${n}`).join(", ")
    );
  }

  const runnable = routed.run.map((r) => r.file);
  const byLane = (lane) => runnable.filter((f) => f.lane === lane);
  const t0 = Date.now();

  const results = [
    ...routed.excluded.map(({ file, reason }) => excluded(file, reason)),
    ...routed.notRun.map(({ file, reason }) => notRun(file, file.lane, reason)),
    ...(await runWebNode(byLane("web-node"), opts)),
    ...(await runWebPlaywright(byLane("web-playwright"), opts)),
    ...(await runMobileVitest(byLane("mobile-vitest"), opts)),
    ...(await runMobileMaestro(byLane("mobile-maestro"))),
  ];
  const elapsed = Date.now() - t0;

  const summary = summarize(results);
  const payload = {
    generatedAt: new Date().toISOString(),
    elapsedMs: elapsed,
    filters: { areas: opts.areas, severities: opts.severities, layers: opts.layers, lanes: opts.lanes },
    environment: guard.result.checked,
    totals: summary.totals,
    areas: summary.byArea.map(({ failures, ...rest }) => rest),
    untaggedFiles: untaggedFiles.map((f) => f.id),
    results,
  };
  writeFileSync(path.join(ARTIFACT_DIR, "results.json"), JSON.stringify(payload, null, 2));

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printSummary(summary, elapsed, opts);
  }

  const violations = severitySkipViolations(results);
  if (violations.length) {
    console.error(`\n  ✖ ${violations.length} P0/P1 test(s) are skipped without a KNOWN-DEFECT marker.`);
    console.error("    Brief §8: no P0 or P1 test may be skipped except under the known-defect rule,");
    console.error("    which requires a recorded finding.\n");
    for (const v of violations.slice(0, 20)) console.error(`      [${v.tags.severity}] ${v.fileId} › ${v.name}`);
    console.error("");
    return 1;
  }

  return exitCodeFor(summary.totals);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // Filter/registry errors are user errors, not crashes. Print the message without a
    // stack so a mistyped `--area` reads as guidance rather than as a runner bug.
    const message = err instanceof Error ? err.message : String(err);
    const isUserError = /^Unknown (test area|severity|test layer)/.test(message);
    console.error(`\n✖ ${message}\n`);
    if (!isUserError && err instanceof Error && err.stack) {
      console.error(err.stack.split("\n").slice(1, 6).join("\n"));
    }
    process.exit(isUserError ? 2 : 1);
  });
