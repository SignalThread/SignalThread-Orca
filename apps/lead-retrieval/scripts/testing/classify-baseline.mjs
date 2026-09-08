#!/usr/bin/env node
// Baseline audit classifier v2 — per-test-case evidence strength.
// A file is rarely uniformly weak. We split each file into test-case blocks and
// classify each case, then roll up.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2];
const repo = process.argv[3];

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "ios", "android", "test-results",
  "playwright-report", ".expo", "dist", "build", "coverage", "_archive",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const TEST_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/;
const all = walk(root);
const files = all.filter((f) => TEST_RE.test(f));
const maestro = all.filter((f) => f.includes(".maestro/flows") && /\.ya?ml$/.test(f));

// Names bound to raw source text read off disk.
function sourceTextVars(src) {
  const vars = new Set();
  const re = /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*(?:await\s+)?(?:readFileSync|fs\.readFileSync|readFile)\s*\(/g;
  let m; while ((m = re.exec(src))) vars.add(m[1]);
  // helper: const read = (p) => readFileSync(...)
  const helperRe = /(?:const|function)\s+([A-Za-z0-9_$]+)\s*(?:=\s*)?\(?[^)]*\)?\s*(?:=>|\{)[^;]{0,200}?readFileSync/gs;
  while ((m = helperRe.exec(src))) vars.add(m[1]);
  // const source = read("components/x.tsx")
  for (const h of [...vars]) {
    const re2 = new RegExp(`(?:const|let)\\s+([A-Za-z0-9_$]+)\\s*(?::[^=]+)?=\\s*(?:await\\s+)?${h}\\s*\\(`, "g");
    let m2; while ((m2 = re2.exec(src))) vars.add(m2[1]);
  }
  return vars;
}

// Split into test-case blocks using brace matching from each it(/test( occurrence.
function testBlocks(src) {
  const blocks = [];
  const re = /(?:^|[\s;.({])(it|test)\s*(\.\s*(?:skip|only|todo|each|concurrent|failing)\s*)*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length - 1; // at '('
    let depth = 0, i = start, end = -1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) end = Math.min(src.length, start + 4000);
    const body = src.slice(start, end);
    const nameM = body.match(/^\(\s*[`"']([^`"']{0,200})/);
    blocks.push({
      name: nameM ? nameM[1] : "(unnamed)",
      body,
      skipped: !!(m[2] && /skip|todo/.test(m[2])),
    });
    re.lastIndex = end;
  }
  return blocks;
}

function classifyCase(body, srcVars, fileSignals) {
  const varAlt = [...srcVars].map((v) => v.replace(/[$]/g, "\\$")).join("|");
  // Does this case assert against raw source text?
  if (varAlt) {
    const reAssertOnSource = new RegExp(
      `(?:assert\\.(?:match|doesNotMatch)\\s*\\(\\s*(?:${varAlt})\\b)` +
      `|(?:(?:${varAlt})\\s*\\.\\s*(?:includes|match|indexOf|search)\\s*\\()` +
      `|(?:expect\\s*\\(\\s*(?:${varAlt})\\b[^)]*\\)\\s*\\.\\s*(?:toContain|toMatch))`,
      "s"
    );
    if (reAssertOnSource.test(body)) return "source-string";
    // case calls the read helper inline then asserts
    const reInline = new RegExp(`(?:${varAlt})\\s*\\(`, "s");
    if (reInline.test(body) && /assert\.(match|doesNotMatch|ok)|toContain|toMatch|includes\(/.test(body))
      return "source-string";
  }
  if (/page\.(goto|click|fill|locator|waitFor)|await\s+expect\(page/.test(body)) return "real-browser";
  if (fileSignals.realDb && /await\s+(supabase|admin|client)\s*\n?\s*\./.test(body)) return "real-db";
  if (/await\s+(GET|POST|PATCH|PUT|DELETE)\s*\(/.test(body)) return "route-handler";
  if (/assert\.(deepStrictEqual|strictEqual|equal|throws|rejects|match)|expect\(/.test(body)) return "unit-logic";
  if (/assert\.ok\(/.test(body)) return "shallow-ok";
  return "unknown";
}

const rows = [];
for (const f of files) {
  let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
  const rel = relative(root, f);
  const fw = rel.startsWith("e2e/") || rel.includes("/e2e/") || /@playwright\/test/.test(src)
    ? "playwright"
    : /from ["']vitest["']/.test(src) ? "vitest"
    : /from ["']node:test["']/.test(src) ? "node:test" : "unknown";
  const fileSignals = {
    realDb: /createAdminClient|SUPABASE_SERVICE_ROLE_KEY|createClient\s*\(\s*process\.env/.test(src),
    fakeDb: /(fake|stub|mock)[A-Za-z]*(Supabase|Client|Db)/i.test(src) || /from:\s*\(/.test(src),
  };
  const srcVars = sourceTextVars(src);
  const blocks = testBlocks(src);
  const kinds = {};
  const sourceStringCaseNames = [];
  for (const b of blocks) {
    const k = classifyCase(b.body, srcVars, fileSignals);
    kinds[k] = (kinds[k] || 0) + 1;
    if (k === "source-string") sourceStringCaseNames.push(b.name);
  }
  rows.push({
    repo, path: rel, framework: fw,
    cases: blocks.length,
    skipped: blocks.filter((b) => b.skipped).length,
    kinds,
    sourceStringCases: kinds["source-string"] || 0,
    sourceStringCaseNames: sourceStringCaseNames.slice(0, 6),
    realDbFile: fileSignals.realDb,
    fakeDbFile: fileSignals.fakeDb,
  });
}
for (const f of maestro) {
  const src = readFileSync(f, "utf8");
  rows.push({
    repo, path: relative(root, f), framework: "maestro",
    cases: 1, skipped: 0, kinds: { "requires-device": 1 },
    sourceStringCases: 0, sourceStringCaseNames: [],
    steps: (src.match(/^\s*-\s/gm) || []).length,
  });
}
console.log(JSON.stringify(rows));
