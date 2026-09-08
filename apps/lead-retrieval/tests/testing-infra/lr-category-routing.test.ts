// @lr area=test-infra severity=P0 layer=static category=local-only
/**
 * Category routing and the environment safety guard (PATCH 2b, Brief §9 v3.2).
 *
 * `category` is the only tag with safety consequences: it decides *where* a test may
 * run. Tagged P0 because the failure modes are, in order of severity:
 *
 *   1. a destructive drill resolves to a production target
 *   2. an untagged test silently inherits `prod-safe` and becomes production-eligible
 *   3. excluded work is folded into the pass count, so a suite that skipped its
 *      security-database tests reports the same number as one that ran them
 *   4. a production WRITE runs during a live customer event
 *
 * Each is asserted below.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CATEGORIES,
  CATEGORY_NAMES,
  EXCLUDED_CATEGORIES,
  PRODUCTION_FORBIDDEN,
  assertKnownCategory,
  assertOwnedTestRecipient,
  isKnownCategory,
  resolveTarget,
  routeCategory,
} from "../../scripts/testing/categories.mjs";
import {
  summarize, summarizeCategories, unknownCategories, exitCodeFor,
  type TestResult,
} from "../../scripts/testing/summarize.mjs";
import { compileRegistry, resolveTags } from "../../scripts/testing/tags.mjs";

// ── registry shape ─────────────────────────────────────────────────────────────────

describe("category registry", () => {
  it("declares exactly the seven categories Brief §9 names", () => {
    assert.deepStrictEqual([...CATEGORY_NAMES].sort(), [
      "deliberate-break", "load-stress", "local-only", "migration",
      "prod-safe", "requires-device", "separate-security-db",
    ]);
  });

  it("only prod-safe may ever target production", () => {
    const allowed = CATEGORY_NAMES.filter((c) => CATEGORIES[c].mayTargetProduction);
    assert.deepStrictEqual(allowed, ["prod-safe"]);
  });

  it("the four out-of-program categories are excluded from the pass count", () => {
    assert.deepStrictEqual([...EXCLUDED_CATEGORIES].sort(), [
      "deliberate-break", "load-stress", "migration", "separate-security-db",
    ]);
    for (const c of EXCLUDED_CATEGORIES) {
      assert.equal(CATEGORIES[c].accounting, "excluded");
      assert.equal(CATEGORIES[c].runnable, false, `${c} must never execute in this program`);
      assert.equal(CATEGORIES[c].mayTargetProduction, false, `${c} must never target production`);
    }
  });

  it("every category explains itself, so a reader can tell why work is routed away", () => {
    for (const [name, def] of Object.entries(CATEGORIES)) {
      assert.ok(def.description?.length > 20, `${name} needs a real description`);
      assert.ok(def.reason?.length > 20, `${name} needs a stated reason`);
    }
  });
});

// ── the loud failure ───────────────────────────────────────────────────────────────

describe("a missing or unknown category fails loudly", () => {
  it("rejects an unknown category name", () => {
    assert.throws(() => assertKnownCategory("prod-unsafe"), /Unknown or missing test category/);
  });

  it("rejects null and undefined rather than defaulting", () => {
    for (const bad of [null, undefined, ""]) {
      assert.throws(
        () => assertKnownCategory(bad as never),
        /Unknown or missing test category/,
        `${JSON.stringify(bad)} must not be accepted`
      );
    }
  });

  it("the error explains that there is deliberately no default", () => {
    try {
      assertKnownCategory(undefined as never);
      assert.fail("should have thrown");
    } catch (err) {
      assert.match(
        String((err as Error).message),
        /no default: an untagged destructive test would otherwise inherit prod-safe/
      );
    }
  });

  it("routeCategory refuses to route an unknown category", () => {
    assert.throws(() => routeCategory("made-up", { target: "local" }), /Unknown or missing test category/);
  });

  it("resolveTags reports category as UNTAGGED rather than guessing", () => {
    const tags = resolveTags("WEB/tests/x.test.ts", compileRegistry({}), null);
    assert.equal(tags.category, "UNTAGGED");
    assert.deepStrictEqual(tags.missing, ["area", "severity", "category"]);
  });

  it("resolveTags throws when a directive names a category that does not exist", () => {
    assert.throws(
      () => resolveTags("WEB/tests/x.test.ts", compileRegistry({}), "// @lr area=rls severity=P0 category=nope"),
      /Unknown or missing test category/
    );
  });
});

// ── target resolution ──────────────────────────────────────────────────────────────

describe("target resolution", () => {
  const prodRefs = new Set(["prodref"]);

  it("defaults to local when nothing indicates production", () => {
    assert.equal(resolveTarget({}, prodRefs), "local");
  });

  it("detects production from the Supabase project ref", () => {
    assert.equal(
      resolveTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://prodref.supabase.co" }, prodRefs),
      "production"
    );
  });

  it("detects production from the browser base URL even with no Supabase env", () => {
    // A Playwright run can target production without any Supabase variable set.
    assert.equal(resolveTarget({ PLAYWRIGHT_BASE_URL: "https://lr.signalthread.ai" }, prodRefs), "production");
  });

  it("an explicit LR_TARGET wins", () => {
    assert.equal(resolveTarget({ LR_TARGET: "production" }, new Set()), "production");
    assert.equal(
      resolveTarget({ LR_TARGET: "local", NEXT_PUBLIC_SUPABASE_URL: "https://prodref.supabase.co" }, prodRefs),
      "local"
    );
  });

  it("a non-production ref stays local", () => {
    assert.equal(resolveTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://testref.supabase.co" }, prodRefs), "local");
  });
});

// ── routing ────────────────────────────────────────────────────────────────────────

describe("routing against a LOCAL target", () => {
  const local = { target: "local" as const };

  it("prod-safe and local-only both run", () => {
    assert.equal(routeCategory("prod-safe", local).action, "run");
    assert.equal(routeCategory("local-only", local).action, "run");
  });

  it("requires-device is not-run, never a pass", () => {
    const r = routeCategory("requires-device", local);
    assert.equal(r.action, "not-run");
    assert.match(String(r.reason), /simulator|device/i);
  });

  it("the four excluded categories are excluded even locally — they never run here", () => {
    for (const c of EXCLUDED_CATEGORIES) {
      assert.equal(routeCategory(c, local).action, "excluded", `${c} must be excluded`);
    }
  });
});

describe("routing against a PRODUCTION target", () => {
  const prod = { target: "production" as const };

  it("prod-safe runs — production-safe journeys are the point of this program", () => {
    assert.equal(routeCategory("prod-safe", prod).action, "run");
  });

  it("local-only does not run against production", () => {
    assert.equal(routeCategory("local-only", prod).action, "not-run");
  });

  it("ABORTS the whole run for every category that may never touch production", () => {
    for (const c of EXCLUDED_CATEGORIES) {
      const r = routeCategory(c, prod);
      assert.equal(r.action, "abort", `${c} against production must abort, not merely skip`);
      assert.match(String(r.reason), /may never target production/);
      assert.match(String(r.reason), /configuration error, not a test failure/);
    }
  });

  it("every production-forbidden category is covered by that abort rule", () => {
    // Guards against someone adding a category with mayTargetProduction:false and
    // accounting:"excluded" that the abort branch does not reach.
    for (const c of PRODUCTION_FORBIDDEN) {
      const r = routeCategory(c, prod);
      assert.ok(["abort", "not-run"].includes(r.action), `${c} must never resolve to "run" against production`);
    }
  });
});

// ── live event ─────────────────────────────────────────────────────────────────────

describe("live-event guard", () => {
  it("defers a prod-safe WRITE while a customer event is running", () => {
    const r = routeCategory("prod-safe", { target: "production", liveEvent: true, prodWrites: true });
    assert.equal(r.action, "not-run");
    assert.match(String(r.reason), /deferred-live-event/);
  });

  it("still runs read-only production checks during a live event", () => {
    // The whole value of prod-safe is verifying the real deployment. Blocking reads too
    // would turn the live-event guard into "do nothing".
    const r = routeCategory("prod-safe", { target: "production", liveEvent: true, prodWrites: false });
    assert.equal(r.action, "run");
  });

  it("does not defer writes when the target is local", () => {
    const r = routeCategory("prod-safe", { target: "local", liveEvent: true, prodWrites: true });
    assert.equal(r.action, "run", "a local write harms no customer");
  });

  it("prodWrites is parsed from a directive", () => {
    const tags = resolveTags(
      "WEB/tests/x.test.ts",
      compileRegistry({}),
      "// @lr area=lead-domain severity=P1 category=prod-safe prodWrites=true"
    );
    assert.equal(tags.prodWrites, true);
    assert.equal(tags.category, "prod-safe");
  });

  it("prodWrites defaults to false, so a test is read-only unless it says otherwise", () => {
    const tags = resolveTags(
      "WEB/tests/x.test.ts",
      compileRegistry({}),
      "// @lr area=lead-domain severity=P1 category=prod-safe"
    );
    assert.equal(tags.prodWrites, false);
  });
});

// ── accounting ─────────────────────────────────────────────────────────────────────

const result = (over: Partial<TestResult> = {}): TestResult => ({
  lane: "web-node", repo: "WEB", fileId: "WEB/tests/x.test.ts",
  tags: { area: "rls", severity: "P0", layer: "db", category: "local-only" },
  name: "t", status: "passed", ...over,
});

describe("excluded work is accounted separately", () => {
  it("excluded results are not passes, failures, or skips", () => {
    const { totals } = summarize([
      result({ status: "passed" }),
      result({ status: "excluded", tags: { area: "rls", severity: "P0", layer: "db", category: "separate-security-db" } }),
      result({ status: "excluded", tags: { area: "migrations", severity: "P1", layer: "migration", category: "migration" } }),
    ]);
    assert.equal(totals.passed, 1, "excluded work must not inflate the pass count");
    assert.equal(totals.failed, 0);
    assert.equal(totals.skipped, 0);
    assert.equal(totals.excluded, 2);
  });

  it("breaks excluded work out by category so it stays visible", () => {
    const { excludedByCategory } = summarize([
      result({ status: "excluded", tags: { area: "rls", severity: "P0", layer: "db", category: "separate-security-db" } }),
      result({ status: "excluded", tags: { area: "rls", severity: "P0", layer: "db", category: "separate-security-db" } }),
      result({ status: "excluded", tags: { area: "performance", severity: "P2", layer: "perf", category: "load-stress" } }),
    ]);
    assert.deepStrictEqual(excludedByCategory, { "separate-security-db": 2, "load-stress": 1 });
  });

  it("excluded work never changes the exit code", () => {
    assert.equal(
      exitCodeFor({ passed: 1, failed: 0, skipped: 0, knownDefect: 0, notRun: 0, flaky: 0, excluded: 99 }),
      0,
      'Brief §10: "do not treat their absence as a blocker"'
    );
  });

  it("collects deferred-live-event results for the findings report", () => {
    const { deferredLiveEvent } = summarize([
      result({ status: "not-run", notRunReason: "deferred-live-event: customer event in progress" }),
      result({ status: "not-run", notRunReason: "requires-device: no simulator" }),
    ]);
    assert.equal(deferredLiveEvent.length, 1);
  });

  it("summarizeCategories reports every category's disposition", () => {
    const rows = summarizeCategories([
      result({ status: "passed" }),
      result({ status: "excluded", tags: { area: "rls", severity: "P0", layer: "db", category: "separate-security-db" } }),
      result({ status: "not-run", tags: { area: "mobile-capture", severity: "P1", layer: "e2e-mobile", category: "requires-device" } }),
    ]);
    assert.deepStrictEqual(rows.map((r) => r.category), ["local-only", "requires-device", "separate-security-db"]);
    assert.equal(rows.find((r) => r.category === "separate-security-db")?.excluded, 1);
    assert.equal(rows.find((r) => r.category === "requires-device")?.notRun, 1);
  });

  it("unknownCategories flags a result carrying a category the registry does not define", () => {
    const bad = result({ tags: { area: "rls", severity: "P0", layer: "db", category: "invented" } });
    assert.deepStrictEqual(unknownCategories([bad]), ["invented"]);
    assert.deepStrictEqual(unknownCategories([result()]), []);
  });
});

// ── provider canary recipients ─────────────────────────────────────────────────────

describe("controlled provider canaries reach owned recipients only", () => {
  it("accepts an exact allowlisted address", () => {
    assert.equal(
      assertOwnedTestRecipient("qa@signalthread.ai", ["qa@signalthread.ai"]),
      "qa@signalthread.ai"
    );
  });

  it("accepts an allowlisted domain", () => {
    assert.equal(
      assertOwnedTestRecipient("anything@lr-test.signalthread.ai", ["@lr-test.signalthread.ai"]),
      "anything@lr-test.signalthread.ai"
    );
  });

  it("rejects a customer address", () => {
    assert.throws(
      () => assertOwnedTestRecipient("buyer@customer.com", ["@lr-test.signalthread.ai"]),
      /not an owned test recipient/
    );
  });

  it("rejects when no allowlist is configured, rather than allowing everything", () => {
    assert.throws(() => assertOwnedTestRecipient("qa@signalthread.ai", []), /No owned test recipients configured/);
  });

  it("rejects an empty recipient", () => {
    assert.throws(() => assertOwnedTestRecipient("", ["@x.com"]), /empty/);
  });

  it("is case-insensitive, so casing cannot smuggle an address past the check", () => {
    assert.equal(
      assertOwnedTestRecipient("QA@SignalThread.ai", ["qa@signalthread.ai"]),
      "qa@signalthread.ai"
    );
  });
});

// ── the retro-tag guarantee ────────────────────────────────────────────────────────

describe("retro-tagging from PATCH 2b", () => {
  it("the Prompt 4 RLS suite is tagged separate-security-db, not deleted", async () => {
    const { readFileSync } = await import("node:fs");
    const registry = JSON.parse(
      readFileSync(new URL("../../scripts/testing/tag-registry.json", import.meta.url), "utf8")
    ) as { tags: Record<string, { category: string }> };
    const rls = registry.tags["WEB/tests/db/rls-enforcement.test.ts"];
    assert.ok(rls, "the RLS suite must remain in the registry — routed and visible, never removed");
    assert.equal(rls.category, "separate-security-db");
  });

  it("every registry entry carries a known category", async () => {
    // Enforced at build time too, but asserted here so a hand-edit cannot slip through.
    const { readFileSync } = await import("node:fs");
    const registry = JSON.parse(
      readFileSync(new URL("../../scripts/testing/tag-registry.json", import.meta.url), "utf8")
    ) as { tags: Record<string, { category: string }> };
    for (const [file, tags] of Object.entries(registry.tags)) {
      assert.ok(isKnownCategory(tags.category), `${file} has unknown category "${tags.category}"`);
    }
  });
});
