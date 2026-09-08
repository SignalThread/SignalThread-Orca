// @lr area=test-infra severity=P0 layer=static
/**
 * Result accounting.
 *
 * Every number this project reports flows through `summarize`. Brief §9 makes three
 * of these rules non-negotiable, and each has a specific way of lying:
 *
 *   - counting a known-defect skip as a pass hides a recorded product defect
 *   - counting a `not-run` device flow as a pass claims a device result nobody observed
 *   - letting a retry convert a failure into a pass hides a flake
 *
 * Tagged P0 because a runner that miscounts makes every downstream prompt's report false.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  summarize,
  isKnownDefect,
  isFlake,
  exitCodeFor,
  severitySkipViolations,
  type TestResult,
} from "../../scripts/testing/summarize.mjs";

const t = (over: Partial<TestResult> = {}): TestResult => ({
  lane: "web-node",
  repo: "WEB",
  fileId: "WEB/tests/x.test.ts",
  tags: { area: "lead-domain", severity: "P1", layer: "unit", category: "local-only" },
  name: "a test",
  status: "passed",
  ...over,
});

describe("known-defect detection", () => {
  it("recognises the marker in a test name", () => {
    assert.equal(isKnownDefect(t({ status: "skipped", name: "KNOWN-DEFECT: LR-001 lead rating clamps wrong" })), true);
  });

  it("recognises the marker in an explicit skip reason", () => {
    assert.equal(isKnownDefect(t({ status: "skipped", name: "plain", skipReason: "KNOWN-DEFECT: LR-002" })), true);
  });

  it("does not treat an ordinary skip as a known defect", () => {
    assert.equal(isKnownDefect(t({ status: "skipped", name: "skipped for now" })), false);
  });

  it("does not treat a passing test as a known defect even if the name mentions one", () => {
    assert.equal(isKnownDefect(t({ status: "passed", name: "regression for KNOWN-DEFECT LR-003" })), false);
  });
});

describe("summarize", () => {
  it("counts known-defect skips separately from passes and ordinary skips", () => {
    const { totals } = summarize([
      t({ status: "passed" }),
      t({ status: "skipped", name: "KNOWN-DEFECT: LR-001" }),
      t({ status: "skipped", name: "just skipped" }),
    ]);
    assert.deepStrictEqual(totals, { passed: 1, failed: 0, skipped: 1, knownDefect: 1, notRun: 0, flaky: 0, excluded: 0 });
  });

  it("never counts a not-run test as a pass", () => {
    const { totals } = summarize([
      t({ status: "not-run", lane: "mobile-maestro", notRunReason: "requires-device" }),
      t({ status: "not-run", lane: "web-playwright" }),
    ]);
    assert.equal(totals.passed, 0, "a device flow nobody executed must never inflate the pass count");
    assert.equal(totals.notRun, 2);
  });

  it("counts a retried pass as a flake as well as a pass", () => {
    const { totals } = summarize([t({ status: "passed", retries: 2 })]);
    assert.equal(totals.passed, 1);
    assert.equal(totals.flaky, 1, "retries must be reported, never hidden");
  });

  it("groups by area and preserves failure detail", () => {
    const { byArea } = summarize([
      t({ tags: { area: "rls", severity: "P0", layer: "db", category: "local-only" }, status: "failed", error: { message: "boom" } }),
      t({ tags: { area: "rls", severity: "P0", layer: "db", category: "local-only" }, status: "passed" }),
      t({ tags: { area: "import", severity: "P1", layer: "unit", category: "local-only" }, status: "passed" }),
    ]);
    assert.deepStrictEqual(byArea.map((a) => a.area), ["import", "rls"]);
    const rls = byArea.find((a) => a.area === "rls")!;
    assert.equal(rls.failed, 1);
    assert.equal(rls.passed, 1);
    assert.equal(rls.failures[0].error?.message, "boom");
  });

  it("buckets untagged results under UNTAGGED rather than dropping them", () => {
    const { byArea, totals } = summarize([{ status: "passed", name: "orphan" } as never]);
    assert.equal(byArea[0].area, "UNTAGGED");
    assert.equal(totals.passed, 1);
  });
});

describe("exit code", () => {
  it("is zero only when nothing failed and nothing flaked", () => {
    assert.equal(exitCodeFor({ passed: 10, failed: 0, skipped: 2, knownDefect: 1, notRun: 3, flaky: 0, excluded: 0 }), 0);
  });

  it("is zero when the only extras are excluded out-of-program categories", () => {
    // Brief §10: "do not treat their absence as a blocker".
    assert.equal(exitCodeFor({ passed: 5, failed: 0, skipped: 0, knownDefect: 0, notRun: 0, flaky: 0, excluded: 42 }), 0);
  });

  it("is non-zero on failure", () => {
    assert.equal(exitCodeFor({ passed: 10, failed: 1, skipped: 0, knownDefect: 0, notRun: 0, flaky: 0 , excluded: 0 }), 1);
  });

  it("is non-zero on a flake even when every test ultimately passed", () => {
    assert.equal(
      exitCodeFor({ passed: 10, failed: 0, skipped: 0, knownDefect: 0, notRun: 0, flaky: 1 , excluded: 0 }),
      1,
      "a suite that passes only after reruns is a failing suite"
    );
  });

  it("is zero when the only non-passes are known defects and not-run device flows", () => {
    assert.equal(exitCodeFor({ passed: 5, failed: 0, skipped: 0, knownDefect: 2, notRun: 21, flaky: 0 , excluded: 0 }), 0);
  });
});

describe("P0/P1 skip policy", () => {
  it("flags a P0 test skipped without a known-defect marker", () => {
    const violations = severitySkipViolations([
      t({ tags: { area: "rls", severity: "P0", layer: "db", category: "local-only" }, status: "skipped", name: "quarantined" }),
    ]);
    assert.equal(violations.length, 1);
  });

  it("permits a P0 skip that carries a known-defect marker", () => {
    const violations = severitySkipViolations([
      t({ tags: { area: "rls", severity: "P0", layer: "db", category: "local-only" }, status: "skipped", name: "KNOWN-DEFECT: LR-004" }),
    ]);
    assert.equal(violations.length, 0, "Brief §6 permits exactly this, and only this");
  });

  it("ignores P2 and P3 skips", () => {
    const violations = severitySkipViolations([
      t({ tags: { area: "visual", severity: "P2", layer: "unit", category: "local-only" }, status: "skipped", name: "later" }),
      t({ tags: { area: "governance", severity: "P3", layer: "static", category: "local-only" }, status: "skipped", name: "later" }),
    ]);
    assert.equal(violations.length, 0);
  });
});

describe("isFlake", () => {
  it("is false without retries", () => assert.equal(isFlake(t({ status: "passed" })), false));
  it("is false for a test that failed all attempts", () =>
    assert.equal(isFlake(t({ status: "failed", retries: 3 })), false));
  it("is true for a pass that needed a retry", () =>
    assert.equal(isFlake(t({ status: "passed", retries: 1 })), true));
});
