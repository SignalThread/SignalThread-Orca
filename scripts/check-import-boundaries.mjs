#!/usr/bin/env node
/**
 * Monorepo import boundaries.
 *
 *   apps/*     MAY import packages/*
 *   apps/*     MUST NOT import another apps/*
 *   packages/* MUST NOT import apps/*
 *
 * Living in one repository is a source-control convenience. If one product application could
 * import another, a build or runtime failure in one product would become a failure in the
 * other, which is exactly the coupling the failure-domain rule in
 * docs/DEPLOYMENT_BOUNDARIES.md forbids. Sharing goes through packages/* or a published API,
 * never through a direct import.
 *
 * Deliberately dependency-free: this runs anywhere Node runs, including a bare CI container.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", "test-results", "playwright-report"]);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

/** Workspace members, by directory name. */
function members(kind) {
  const dir = join(repoRoot, kind);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
}
const apps = members("apps");
const packages = members("packages");

/** Package name -> workspace dir, so a bare-specifier import can be attributed to an app. */
const appPackageNames = new Map();
for (const app of apps) {
  const manifest = join(repoRoot, "apps", app, "package.json");
  if (!existsSync(manifest)) continue;
  const { name } = JSON.parse(readFileSync(manifest, "utf8"));
  if (name) appPackageNames.set(name, app);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (CODE.test(entry.name)) yield full;
  }
}

// `from "x"`, `import "x"`, `require("x")`, and dynamic `import("x")`.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;

const violations = [];

function check(kind, member) {
  const memberRoot = join(repoRoot, kind, member);
  if (!existsSync(memberRoot)) return;
  for (const file of walk(memberRoot)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(SPECIFIER)) {
      const spec = match[1];
      const before = source.slice(0, match.index);
      const line = before.split("\n").length;
      const where = `${relative(repoRoot, file)}:${line}`;

      // Skip matches sitting inside a string literal. Regression tests assert on import
      // statements by quoting them, e.g. assert(src.includes('import { X } from "../y"')),
      // which is source text under inspection, not an import this file performs. An odd
      // number of quote characters before the match on its own line means we are inside one.
      const column = before.length - (before.lastIndexOf("\n") + 1);
      const lineText = source.split("\n")[line - 1] ?? "";
      const quotesBefore = (lineText.slice(0, column).match(/['"`]/g) ?? []).length;
      if (quotesBefore % 2 === 1) continue;

      if (spec.startsWith(".")) {
        // A relative import must stay inside its own workspace member.
        const target = resolve(dirname(file), spec);
        if (!target.startsWith(memberRoot + sep) && target !== memberRoot) {
          const rel = relative(repoRoot, target);
          if (rel.startsWith(`apps${sep}`)) {
            violations.push(`${where}: relative import escapes into ${rel} — "${spec}"`);
          }
        }
        continue;
      }
      // A bare specifier naming another app is a cross-app dependency.
      for (const [pkgName, appDir] of appPackageNames) {
        if ((spec === pkgName || spec.startsWith(pkgName + "/")) && !(kind === "apps" && appDir === member)) {
          violations.push(`${where}: imports sibling app "${pkgName}" (apps/${appDir}) — "${spec}"`);
        }
      }
      if (kind === "packages" && spec.startsWith("apps/")) {
        violations.push(`${where}: package imports an application — "${spec}"`);
      }
    }
  }
}

for (const app of apps) check("apps", app);
for (const pkg of packages) check("packages", pkg);

// A declared dependency on a sibling app is a violation even with no import yet.
for (const app of apps) {
  const manifest = join(repoRoot, "apps", app, "package.json");
  if (!existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      const owner = appPackageNames.get(dep);
      if (owner && owner !== app) {
        violations.push(`apps/${app}/package.json: ${field} declares sibling app "${dep}"`);
      }
    }
  }
}

const scope = `${apps.length} app(s), ${packages.length} package(s)`;
if (violations.length) {
  console.error(`import boundary violations (${scope}):\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error(`\n${violations.length} violation(s). apps/* may import packages/*, never another apps/*.`);
  process.exit(1);
}
console.log(`import boundaries OK — ${scope}: no cross-app imports.`);
