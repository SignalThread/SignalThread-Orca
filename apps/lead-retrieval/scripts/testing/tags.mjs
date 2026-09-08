/**
 * Tag resolution for the LR test suite.
 *
 * Brief §9: "every test carries `area` and `severity` tags".
 *
 * Tags resolve in priority order:
 *   1. An in-file directive:  `// @lr area=rls severity=P0 layer=db`
 *      Anywhere in the first 60 lines. This is how new tests declare themselves.
 *   2. The retro-tag registry (`tag-registry.json`), matched most-specific-first.
 *      This is how Prompt 1's 435 pre-existing files got tagged without editing
 *      all of them.
 *   3. Untagged — reported, and fatal under `--strict-tags`.
 *
 * Tagging is per file rather than per test case. Per-case tagging would need every
 * existing `it(...)` rewritten; per-file gets a real baseline immediately and lets
 * new work be precise by splitting files along tag boundaries.
 */
import { readFileSync } from "node:fs";
import { assertKnownArea, assertKnownSeverity, assertKnownLayer } from "./areas.mjs";
import { assertKnownCategory, isKnownCategory } from "./categories.mjs";

/**
 * @typedef {{area:string, severity:string, layer:string, category:string,
 *            prodWrites:boolean, source:string}} Tags
 */

const DIRECTIVE = /@lr\s+([^\n\r*]+)/;
const HEADER_LINES = 60;

/**
 * Parse `// @lr area=rls severity=P0 layer=db` out of a file's header.
 * @returns {Partial<Tags>|null}
 */
export function parseDirective(source) {
  const header = source.split(/\r?\n/, HEADER_LINES).join("\n");
  const m = header.match(DIRECTIVE);
  if (!m) return null;
  /** @type {Record<string,string>} */
  const out = {};
  for (const pair of m[1].trim().split(/\s+/)) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim().replace(/[,;]$/, "");
  }
  if (!out.area && !out.severity && !out.layer && !out.category) return null;
  return out;
}

/**
 * Compile the registry into matchers, longest-prefix-first so a specific entry
 * beats a general one.
 * @param {Record<string, {area:string,severity:string,layer:string}>} registry
 */
export function compileRegistry(registry) {
  return Object.entries(registry)
    .map(([pattern, tags]) => ({ pattern, tags, re: globToRegExp(pattern), weight: specificity(pattern) }))
    .sort((a, b) => b.weight - a.weight);
}

function specificity(pattern) {
  // More literal characters and fewer wildcards = more specific.
  return pattern.replace(/[*?]/g, "").length - (pattern.match(/\*/g) || []).length * 2;
}

function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { out += ".*"; i++; }
      else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/**
 * Resolve tags for one test file.
 * @param {string} relPath   repo-relative POSIX path, prefixed with the repo alias,
 *                           e.g. "WEB/tests/foo.test.ts"
 * @param {ReturnType<typeof compileRegistry>} compiled
 * @param {string|null} source  file contents, or null to skip directive parsing
 * @returns {Tags}
 */
export function resolveTags(relPath, compiled, source) {
  const directive = source ? parseDirective(source) : null;
  const match = compiled.find((entry) => entry.re.test(relPath));

  const area = directive?.area ?? match?.tags.area ?? null;
  const severity = directive?.severity ?? match?.tags.severity ?? null;
  const layer = directive?.layer ?? match?.tags.layer ?? null;
  const category = directive?.category ?? match?.tags.category ?? null;
  // Orthogonal to category: does this prod-safe test WRITE to production? Used by the
  // live-event guard to defer writes while still running read-only production checks.
  const prodWritesRaw = directive?.prodWrites ?? match?.tags.prodWrites ?? false;
  const prodWrites = prodWritesRaw === true || prodWritesRaw === "true";

  if (!area || !severity || !category) {
    return {
      area: area ?? "UNTAGGED",
      severity: severity ?? "UNTAGGED",
      layer: layer ?? "UNTAGGED",
      category: category ?? "UNTAGGED",
      prodWrites,
      source: "none",
      missing: [
        !area ? "area" : null,
        !severity ? "severity" : null,
        !category ? "category" : null,
      ].filter(Boolean),
    };
  }

  // Validate loudly. A typo in a directive must not silently create a phantom area, and
  // an unknown category must never fall back to prod-safe.
  assertKnownArea(area);
  assertKnownSeverity(severity);
  if (layer) assertKnownLayer(layer);
  assertKnownCategory(category, relPath);

  return {
    area,
    severity,
    layer: layer ?? "unit",
    category,
    prodWrites,
    source: directive?.area ? "directive" : `registry:${match?.pattern}`,
  };
}

export function readSourceSafe(absPath) {
  try { return readFileSync(absPath, "utf8"); } catch { return null; }
}
