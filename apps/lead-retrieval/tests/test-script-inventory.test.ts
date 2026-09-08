import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

// @ts-ignore - The runner is an ESM script with runtime exports used by this inventory guard.
import { discoverNodeTestInventory, NODE_TEST_PATTERNS } from "../scripts/run-node-tests.mjs";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as {
  scripts?: Record<string, string>;
};

const SKIPPED_DIRS = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results"
]);

const NODE_TEST_EXTENSIONS = [
  ".test.ts",
  ".test.tsx",
  ".test.mjs",
  ".test.js",
  ".spec.ts",
  ".spec.tsx",
  ".spec.mjs",
  ".spec.js"
];

function toPosix(relativePath: string) {
  return relativePath.split(path.sep).join("/");
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function matchesFullNodePattern(relativePath: string) {
  const file = toPosix(relativePath);
  if (!file.startsWith("tests/") && !file.startsWith("app/") && !file.startsWith("lib/")) return false;
  return NODE_TEST_EXTENSIONS.some((extension) => file.endsWith(extension));
}

function importsPlaywrightTest(relativePath: string) {
  const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
  return /from\s+["']@playwright\/test["']|require\(["']@playwright\/test["']\)/.test(source);
}

test("node full-suite discovery includes every normal node test file", () => {
  const discovered = discoverNodeTestInventory();
  assert.deepEqual(discovered.patterns, NODE_TEST_PATTERNS);

  const candidates = ["tests", "app", "lib"]
    .flatMap((root) => walkFiles(path.join(process.cwd(), root)))
    .map((file) => toPosix(path.relative(process.cwd(), file)))
    .filter(matchesFullNodePattern)
    .sort((a, b) => a.localeCompare(b));

  const expectedNodeTests = candidates.filter((file) => !importsPlaywrightTest(file));
  const expectedPlaywrightExclusions = candidates.filter(importsPlaywrightTest);

  assert.deepEqual(discovered.included, expectedNodeTests);
  assert.deepEqual(
    (discovered.excluded as Array<{ file: string }>).map((entry) => entry.file),
    expectedPlaywrightExclusions
  );
  assert.ok(
    discovered.included.includes("app/auth/reset/password-form-state.test.ts"),
    "app-local node tests must be included"
  );
  assert.ok(
    discovered.included.includes("lib/campaigns/__tests__/signal-source-of-truth.test.ts"),
    "lib-local node tests must be included"
  );
  assert.ok(
    (discovered.excluded as Array<{ file: string }>).some((entry) => entry.file === "tests/auth-load.spec.ts"),
    "Playwright specs under tests/ must not be counted as node tests"
  );
});

test("package scripts route the full suite through discovered node tests and product Playwright tests", () => {
  const scripts = packageJson.scripts ?? {};
  assert.equal(scripts["test:node:all"], "node scripts/run-node-tests.mjs");
  assert.equal(scripts["test:playwright"], "npx playwright test --reporter=line");
  assert.equal(scripts["test:all"], "npm run test:node:all");
  assert.equal(scripts["test:verify"], "npm run test:node:all && npm run typecheck");

  const full = scripts["test:full"] ?? "";
  assert.equal(
    full,
    "npm run test:node:all && npm run test:playwright && npm run typecheck && npm run build"
  );
});
