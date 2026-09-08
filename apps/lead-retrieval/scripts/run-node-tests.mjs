#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

export const NODE_TEST_PATTERNS = [
  "tests/**/*.test.ts",
  "tests/**/*.test.tsx",
  "tests/**/*.test.mjs",
  "tests/**/*.test.js",
  "tests/**/*.spec.ts",
  "tests/**/*.spec.tsx",
  "tests/**/*.spec.mjs",
  "tests/**/*.spec.js",
  "app/**/*.test.ts",
  "app/**/*.test.tsx",
  "app/**/*.test.mjs",
  "app/**/*.test.js",
  "app/**/*.spec.ts",
  "app/**/*.spec.tsx",
  "app/**/*.spec.mjs",
  "app/**/*.spec.js",
  "lib/**/*.test.ts",
  "lib/**/*.test.tsx",
  "lib/**/*.test.mjs",
  "lib/**/*.test.js",
  "lib/**/*.spec.ts",
  "lib/**/*.spec.tsx",
  "lib/**/*.spec.mjs",
  "lib/**/*.spec.js"
];

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

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
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

function matchesRequestedNodePattern(relativePath) {
  const file = toPosix(relativePath);
  if (!file.startsWith("tests/") && !file.startsWith("app/") && !file.startsWith("lib/")) return false;
  return NODE_TEST_EXTENSIONS.some((extension) => file.endsWith(extension));
}

function isPlaywrightSpec(fullPath) {
  const source = readFileSync(fullPath, "utf8");
  return /from\s+["']@playwright\/test["']|require\(["']@playwright\/test["']\)/.test(source);
}

export function discoverNodeTestInventory(options = {}) {
  const root = path.resolve(options.root ?? REPO_ROOT);
  const candidates = ["tests", "app", "lib"]
    .flatMap((dir) => walkFiles(path.join(root, dir)))
    .filter((file) => statSync(file).isFile())
    .map((file) => path.relative(root, file))
    .filter(matchesRequestedNodePattern)
    .sort((a, b) => a.localeCompare(b));

  const included = [];
  const excluded = [];

  for (const relativePath of candidates) {
    const fullPath = path.join(root, relativePath);
    if (isPlaywrightSpec(fullPath)) {
      excluded.push({
        file: toPosix(relativePath),
        reason: "playwright_spec"
      });
      continue;
    }
    included.push(toPosix(relativePath));
  }

  return {
    root,
    patterns: [...NODE_TEST_PATTERNS],
    included,
    excluded
  };
}

export function discoverNodeTestFiles(options = {}) {
  return discoverNodeTestInventory(options).included;
}

async function main() {
  const inventory = discoverNodeTestInventory();
  if (inventory.included.length === 0) {
    console.error("No node test files discovered.");
    process.exit(1);
  }

  console.log(`Discovered ${inventory.included.length} node test files.`);
  if (inventory.excluded.length > 0) {
    const skipped = inventory.excluded.map((entry) => `${entry.file} (${entry.reason})`).join(", ");
    console.log(`Excluded ${inventory.excluded.length} non-node test file(s): ${skipped}`);
  }

  const child = spawn(
    process.execPath,
    ["--experimental-test-module-mocks", "--import", "tsx", "--test", ...inventory.included],
    {
      cwd: inventory.root,
      env: process.env,
      stdio: "inherit"
    }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`Node test run terminated by ${signal}.`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
