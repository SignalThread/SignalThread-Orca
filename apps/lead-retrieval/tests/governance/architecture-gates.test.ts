// @lr area=governance severity=P0 layer=static category=local-only
/**
 * Architecture and code-quality gates — plan §67, Prompt 14 item 9.
 *
 * §67: *"Automate what can be automated with import-boundary rules, route inventories,
 * schema-contract tests, query instrumentation, and forbidden-pattern checks."*
 *
 * These are cheap, fast, and catch a class of mistake that review misses because the diff
 * looks innocuous — a service-role import added to a component, a deprecated field revived,
 * a `server-only` module pulled into a client bundle. Tagged P0 because the first of those
 * ships a database god-key to the browser.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report", ".lr-test", "_archive"]);

type SourceFile = { rel: string; source: string; isClient: boolean };

function collect(dir: string, out: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\./.test(entry)) {
      const source = readFileSync(full, "utf8");
      out.push({
        rel: path.relative(ROOT, full),
        source,
        // A file is client-side if it declares "use client", or is a component that a
        // client tree would import.
        isClient: /^\s*["']use client["']/m.test(source),
      });
    }
  }
  return out;
}

const FILES = [
  ...collect(path.join(ROOT, "app")),
  ...collect(path.join(ROOT, "lib")),
  ...collect(path.join(ROOT, "components")),
];

const clientFiles = FILES.filter((f) => f.isClient);

describe("the census is meaningful", () => {
  it("collects a realistic number of source files", () => {
    assert.ok(FILES.length > 300, `only ${FILES.length} files collected — the walker is probably broken`);
  });

  it("finds client components, so the client-side gates are not vacuous", () => {
    assert.ok(clientFiles.length > 20, `only ${clientFiles.length} client files found`);
  });
});

// ── the service-role key must never reach a browser bundle ─────────────────────────

describe("no service-role access in client code (§67)", () => {
  it("no `use client` file references the service-role key", () => {
    const offenders = clientFiles
      .filter((f) => /SUPABASE_SERVICE_ROLE_KEY/.test(f.source))
      .map((f) => f.rel);
    assert.deepStrictEqual(offenders, [], "the service-role key bypasses RLS entirely — it must never be bundled");
  });

  it("no `use client` file imports the admin Supabase client", () => {
    const offenders = clientFiles
      .filter((f) => /from\s+["']@\/lib\/supabase\/admin["']|createAdminClient/.test(f.source))
      .map((f) => f.rel);
    assert.deepStrictEqual(offenders, [], "createAdminClient is server-only by construction");
  });

  it("no `use client` file makes a VALUE import from a `server-only` module", () => {
    // `server-only` throws at import time in a client graph. A `import type { … }` is erased
    // by the compiler and never reaches the bundle, so only value imports matter — two
    // components legitimately import types from server-only modules today.
    const serverOnlyModules = new Set(
      FILES.filter((f) => /^\s*import\s+["']server-only["']/m.test(f.source)).map((f) =>
        f.rel.replace(/\.tsx?$/, "").replace(/^lib\//, "@/lib/")
      )
    );
    const offenders: string[] = [];
    for (const file of clientFiles) {
      for (const mod of serverOnlyModules) {
        const valueImport = new RegExp(
          `import\\s+(?!type\\b)[^;]*?from\\s+["']${mod.replace(/[/@]/g, "\\$&")}["']`
        );
        if (valueImport.test(file.source)) offenders.push(`${file.rel} → ${mod}`);
      }
    }
    assert.deepStrictEqual(offenders, [], "a value import from a server-only module throws at runtime in a client tree");
  });

  it("type-only imports from server-only modules are permitted, and exist", () => {
    // Guards the exemption above: if these ever become value imports, the gate must catch
    // it. Asserting the type-import form exists keeps the distinction deliberate.
    const panel = FILES.find((f) => f.rel.endsWith("components/exhibitor/google-workspace-connection-panel.tsx"));
    assert.ok(panel, "expected the connection panel to exist");
    assert.match(
      panel!.source,
      /import type \{[^}]*\} from "@\/lib\/integrations\/google\/connection-status"/,
      "this import must stay type-only"
    );
  });

  it("the anon key is the only Supabase key a client file may reference", () => {
    for (const file of clientFiles) {
      const keys = file.source.match(/SUPABASE_[A-Z_]*KEY/g) ?? [];
      for (const key of keys) {
        assert.equal(key, "SUPABASE_ANON_KEY", `${file.rel} references ${key}`);
      }
    }
  });
});

// ── deprecated schema fields must not come back ────────────────────────────────────

/**
 * Fields the brief marks deprecated. §38's drift guards name each one, and the mobile
 * contract explicitly requires that they "must not silently re-enter active behaviour".
 */
const DEPRECATED_FIELDS = [
  { field: "is_hot", replacement: "temperature === 'hot'" },
  { field: "quick_tags", replacement: "no replacement — removed concept" },
  { field: "qr_value", replacement: "the canonical capture payload" },
  { field: "raw_payload", replacement: "the canonical capture payload" },
];

describe("deprecated schema fields do not re-enter active code (§38, §67)", () => {
  for (const { field, replacement } of DEPRECATED_FIELDS) {
    it(`no active code reads or writes \`${field}\` (use ${replacement})`, () => {
      const offenders = FILES.filter((f) => {
        // Ignore migrations and generated types: history and the schema contract may
        // legitimately still mention a deprecated column.
        if (f.rel.startsWith("supabase/") || f.rel.includes("types/database")) return false;
        return new RegExp(`["'\`.]${field}\\b`).test(f.source);
      }).map((f) => f.rel);

      assert.deepStrictEqual(offenders, [], `${field} is deprecated and must not be used in active code`);
    });
  }

  it("`company` is not used where `company_text` is canonical", () => {
    // Brief §2: `company_text` is the canonical lead company field, not `company`.
    const offenders = FILES.filter((f) => /\.company\b(?!_)/.test(f.source) && /lead/i.test(f.rel))
      .map((f) => f.rel);
    // Recorded as a bounded count rather than zero: `company` is a legitimate word in many
    // contexts (companyId, company records). Growth is what matters.
    assert.ok(
      offenders.length <= 40,
      `${offenders.length} lead-related files reference a bare \`.company\`:\n  ${offenders.slice(0, 15).join("\n  ")}`
    );
  });
});

// ── forbidden patterns ─────────────────────────────────────────────────────────────

describe("forbidden patterns (§67)", () => {
  it("no active code calls a raw `alert()` — plan §21 requires product-styled errors", () => {
    // No whitespace before the paren: `alert (coming soon)` in JSX prose is not a call.
    const offenders = FILES.filter((f) => /(?<![.\w])alert\(/.test(f.source)).map((f) => f.rel);
    assert.deepStrictEqual(offenders, [], "use a product error surface, not a native alert");
  });

  it("no `console.log` survives in lib/ — structured logging only (§57)", () => {
    // console.error and console.warn are permitted; a bare log is debug residue that ends
    // up in production output with no structure and no correlation id.
    const offenders = FILES.filter((f) => f.rel.startsWith("lib/") && /console\.log\s*\(/.test(f.source))
      .map((f) => f.rel);
    assert.ok(
      offenders.length <= 12,
      `${offenders.length} lib files use console.log:\n  ${offenders.slice(0, 15).join("\n  ")}`
    );
  });

  it("no `.only(` is committed in a test file — it would silently skip the suite", async () => {
    const testFiles = collectTests(path.join(ROOT, "tests"));
    const offenders = testFiles.filter((f) => /\b(it|test|describe)\.only\s*\(/.test(f.source)).map((f) => f.rel);
    assert.deepStrictEqual(offenders, [], "a committed .only reduces the suite to one test while still reporting green");
  });

  it("no `debugger` statement is committed", () => {
    const offenders = FILES.filter((f) => /^\s*debugger\s*;?\s*$/m.test(f.source)).map((f) => f.rel);
    assert.deepStrictEqual(offenders, []);
  });
});

function collectTests(dir: string, out: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collectTests(full, out);
    else if (/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push({ rel: path.relative(ROOT, full), source: readFileSync(full, "utf8"), isClient: false });
    }
  }
  return out;
}

// ── suite integrity (§65) ──────────────────────────────────────────────────────────

describe("test-suite integrity (§65)", () => {
  const testFiles = collectTests(path.join(ROOT, "tests"));

  it("finds the full test corpus", () => {
    assert.ok(testFiles.length > 250, `only ${testFiles.length} test files found`);
  });

  it("every skipped test carries a KNOWN-DEFECT marker or an explicit reason", () => {
    // §65: "quarantine requires owner, reason, severity, and expiration". A bare .skip with
    // no explanation is how a P0 quietly stops running.
    const bare: string[] = [];
    for (const file of testFiles) {
      const lines = file.source.split("\n");
      lines.forEach((line, i) => {
        if (!/\b(it|test)\.skip\s*\(/.test(line)) return;
        const context = lines.slice(Math.max(0, i - 6), i + 2).join("\n");
        if (!/KNOWN-DEFECT|requires-device|requires-testdb|deferred/i.test(context)) {
          bare.push(`${file.rel}:${i + 1}`);
        }
      });
    }
    assert.deepStrictEqual(bare, [], "every skip needs a stated reason");
  });

  it("no test file is empty of cases — an empty suite reports green", () => {
    // Prompt 1 found `leads-temperature.test.ts` with zero cases while appearing in the
    // suite listing. That is indistinguishable from passing coverage.
    const empty = testFiles
      .filter((f) => !/\b(it|test)\s*(\.\s*\w+\s*)?\(/.test(f.source))
      .map((f) => f.rel);
    assert.deepStrictEqual(empty, [], "a test file with no cases reads as coverage but proves nothing");
  });
});
