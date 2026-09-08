// @lr area=fallback-provenance severity=P0 layer=unit category=local-only
/**
 * Silent fallback detection — plan §71, the highest-value work in Prompt 8.
 *
 * Incident `e4f422c`: counts stayed correct, intelligence panels emptied, and lead detail
 * quietly served a thin legacy summary instead of the rich read model. **Every ordinary
 * assertion passed**, because every assertion asked "is the response non-empty" and none
 * asked "which source produced it".
 *
 * This suite uses the provenance seam built in Prompt 3
 * (`lib/testing/provenance.ts`) to make the second question answerable, and pins the rule
 * §71 states: *"a fallback that fires in a fixture where rich data exists is a failing
 * test, not a passing degraded one."*
 *
 * §71 names four read paths to apply this to. Each is modelled here as the branch shape
 * the real code uses, so the pattern is established and Prompt 14 can wire the firing-rate
 * metric to it.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  FALLBACK_SOURCES,
  PROVENANCE_FIELD,
  PROVENANCE_HEADER,
  assertNoFallback,
  attachProvenanceToBody,
  captureProvenance,
  fallbackFiringRate,
  provenanceHeaders,
  recordProvenance,
  resetProvenanceCounters,
  withProvenance,
  type ReadSource,
} from "../../lib/testing/provenance";

afterEach(() => resetProvenanceCounters());

// ── the core rule ──────────────────────────────────────────────────────────────────

describe("a fallback in a rich-data fixture is a FAILURE, not a degraded pass", () => {
  it("assertNoFallback passes when every read was canonical", () => {
    assert.doesNotThrow(() =>
      assertNoFallback([
        { readPath: "conversation-read-model", source: "canonical" },
        { readPath: "lead-detail", source: "canonical" },
      ])
    );
  });

  it("assertNoFallback throws when any read degraded, naming the path and reason", () => {
    assert.throws(
      () =>
        assertNoFallback([
          { readPath: "conversation-read-model", source: "canonical" },
          { readPath: "lead-detail", source: "legacy_fallback", detail: "summary was null" },
        ]),
      (err: Error) => {
        assert.match(err.message, /served a fallback/);
        assert.match(err.message, /lead-detail/, "must name the offending path");
        assert.match(err.message, /summary was null/, "must carry the reason forward");
        return true;
      }
    );
  });

  it("treats every degraded source as a fallback, not just the obvious one", () => {
    // A compatibility derivation and a placeholder are both "plausible but not canonical",
    // which is exactly the incident's failure mode.
    for (const source of FALLBACK_SOURCES) {
      assert.throws(
        () => assertNoFallback([{ readPath: "p", source }]),
        /served a fallback/,
        `${source} must count as a fallback`
      );
    }
  });

  it("`unavailable` is NOT a fallback — honest failure beats a plausible answer", () => {
    // §71's whole point is that a plausible-looking success is worse than an outage.
    assert.doesNotThrow(() => assertNoFallback([{ readPath: "p", source: "unavailable" }]));
  });

  it("reports every offending path at once, not just the first", () => {
    assert.throws(
      () =>
        assertNoFallback([
          { readPath: "a", source: "legacy_fallback" },
          { readPath: "b", source: "placeholder" },
        ]),
      /2 read path\(s\)/
    );
  });
});

// ── capture around a read ──────────────────────────────────────────────────────────

describe("captureProvenance observes exactly the reads a request performed", () => {
  it("collects the sources in order", async () => {
    const { result, records } = await captureProvenance(() => {
      recordProvenance({ readPath: "transcript", source: "canonical" });
      recordProvenance({ readPath: "summary", source: "canonical" });
      recordProvenance({ readPath: "themes", source: "legacy_fallback" });
      return { ok: true };
    });

    assert.deepStrictEqual(result, { ok: true });
    assert.deepStrictEqual(records.map((r) => r.readPath), ["transcript", "summary", "themes"]);
    assert.throws(() => assertNoFallback(records), /themes/);
  });

  it("works across async boundaries", async () => {
    const { records } = await captureProvenance(async () => {
      recordProvenance({ readPath: "a", source: "canonical" });
      await new Promise((r) => setImmediate(r));
      recordProvenance({ readPath: "b", source: "canonical" });
    });
    assert.equal(records.length, 2);
  });

  it("stops observing once the capture completes", async () => {
    await captureProvenance(() => recordProvenance({ readPath: "inside", source: "canonical" }));
    const { records } = await captureProvenance(() => undefined);
    assert.deepStrictEqual(records, [], "a later capture must not see earlier reads");
  });
});

// ── §71's four named read paths ────────────────────────────────────────────────────

/**
 * Each entry models the branch the real read path takes. The point is not to duplicate the
 * production query, but to fix the shape of the assertion so every read path can be wired
 * to it identically: given rich data, the canonical source must serve.
 */
type ReadPathCase = {
  path: string;
  richInput: Record<string, unknown>;
  thinInput: Record<string, unknown>;
  read: (input: Record<string, unknown>) => ReadSource;
};

const READ_PATHS: ReadPathCase[] = [
  {
    path: "conversation-intelligence-read-model",
    richInput: { summary: "rich synthesis", themes: ["pricing"], evidence: ["quote"] },
    thinInput: { summary: null, themes: [], evidence: [] },
    // The incident branch: fall back to a thin legacy summary when the read model is empty.
    read: (i) => (i.summary && Array.isArray(i.themes) && i.themes.length ? "canonical" : "legacy_fallback"),
  },
  {
    path: "follow_up_date-compatibility-derivation",
    richInput: { follow_up_date: "2026-08-20", follow_up_at: "2026-08-20T14:00:00Z" },
    thinInput: { follow_up_date: null, follow_up_at: "2026-08-20T14:00:00Z" },
    // Deriving the date from the instant is a compatibility path, not the canonical field.
    read: (i) => (i.follow_up_date ? "canonical" : "compatibility_derived"),
  },
  {
    path: "role-alias-normalization",
    richInput: { role: "exhibitor_admin" },
    thinInput: { role: "exhibitor" },
    // A historical alias must normalize at an explicit boundary, and that is a fallback.
    read: (i) => (i.role === "exhibitor_admin" ? "canonical" : "legacy_fallback"),
  },
  {
    path: "company_text-vs-company",
    richInput: { company_text: "SignalThread", company: null },
    thinInput: { company_text: null, company: "SignalThread" },
    // Brief: `company_text` is canonical; reading `company` is the legacy path.
    read: (i) => (i.company_text ? "canonical" : "legacy_fallback"),
  },
];

describe("§71 read paths: rich data must be served canonically", () => {
  for (const { path, richInput, read } of READ_PATHS) {
    it(`${path} serves canonical when rich data exists`, async () => {
      const { records } = await captureProvenance(() => {
        recordProvenance({ readPath: path, source: read(richInput) });
      });
      assert.doesNotThrow(
        () => assertNoFallback(records),
        `${path} fell back despite rich data — this is the e4f422c failure class`
      );
    });
  }

  for (const { path, thinInput, read } of READ_PATHS) {
    it(`${path} is detected as degraded when only legacy data exists`, async () => {
      const { records } = await captureProvenance(() => {
        recordProvenance({ readPath: path, source: read(thinInput) });
      });
      // The mirror case: a detector that never fires would pass every test above.
      assert.throws(() => assertNoFallback(records), /served a fallback/, `${path} degradation went undetected`);
    });
  }

  it("a whole request is green only when EVERY path served canonically", async () => {
    const { records } = await captureProvenance(() => {
      for (const { path, richInput, read } of READ_PATHS) {
        recordProvenance({ readPath: path, source: read(richInput) });
      }
    });
    assert.equal(records.length, READ_PATHS.length);
    assert.doesNotThrow(() => assertNoFallback(records));
  });

  it("one degraded path fails the whole request, even when the others are canonical", async () => {
    const { records } = await captureProvenance(() => {
      recordProvenance({ readPath: READ_PATHS[0].path, source: "canonical" });
      recordProvenance({ readPath: READ_PATHS[1].path, source: "canonical" });
      recordProvenance({ readPath: READ_PATHS[2].path, source: "legacy_fallback" });
      recordProvenance({ readPath: READ_PATHS[3].path, source: "canonical" });
    });
    assert.throws(() => assertNoFallback(records), /role-alias-normalization/);
  });
});

// ── the production metric (item 5) ─────────────────────────────────────────────────

describe("fallback firing rate is a production metric (§71, §57)", () => {
  it("is zero when nothing has been read", () => {
    assert.deepStrictEqual(fallbackFiringRate(), { canonical: 0, fallback: 0, rate: 0 });
  });

  it("tracks per read path independently", () => {
    recordProvenance({ readPath: "healthy", source: "canonical" });
    recordProvenance({ readPath: "healthy", source: "canonical" });
    recordProvenance({ readPath: "degraded", source: "legacy_fallback" });

    assert.equal(fallbackFiringRate("healthy").rate, 0);
    assert.equal(fallbackFiringRate("degraded").rate, 1);
  });

  it("aggregates across paths for a single alertable number", () => {
    recordProvenance({ readPath: "a", source: "canonical" });
    recordProvenance({ readPath: "b", source: "canonical" });
    recordProvenance({ readPath: "c", source: "legacy_fallback" });
    const overall = fallbackFiringRate();
    assert.equal(overall.canonical, 2);
    assert.equal(overall.fallback, 1);
    assert.ok(Math.abs(overall.rate - 1 / 3) < 1e-9);
  });

  it("an unknown path reports zero rather than throwing", () => {
    assert.deepStrictEqual(fallbackFiringRate("never-read"), { canonical: 0, fallback: 0, rate: 0 });
  });

  it("`unavailable` counts as neither canonical nor fallback", () => {
    // An outage must not dilute the fallback rate in either direction.
    recordProvenance({ readPath: "p", source: "unavailable" });
    assert.deepStrictEqual(fallbackFiringRate("p"), { canonical: 0, fallback: 0, rate: 0 });
  });

  it("recording is active without the seam flag, so the metric works in production", () => {
    // Deliberate asymmetry from Prompt 3: recording is always on, only EXPOSURE is gated.
    // A counter that only incremented under a test flag could never alert on production.
    recordProvenance({ readPath: "prod-path", source: "legacy_fallback" });
    assert.equal(fallbackFiringRate("prod-path").fallback, 1);
  });
});

// ── exposure stays gated ───────────────────────────────────────────────────────────

describe("provenance exposure does not alter production payloads", () => {
  it("adds no field to a response body when seams are off", () => {
    const body = { leadId: "l1", summary: "text" };
    const result = attachProvenanceToBody(body, { readPath: "p", source: "canonical" });
    assert.deepStrictEqual(result, body);
    assert.equal(PROVENANCE_FIELD in result, false);
  });

  it("emits no header when seams are off", () => {
    assert.deepStrictEqual(provenanceHeaders({ readPath: "p", source: "legacy_fallback" }), {});
    assert.equal(PROVENANCE_HEADER, "x-lr-source");
  });

  it("withProvenance returns the same value reference, not a copy", () => {
    const value = { a: 1 };
    assert.equal(withProvenance(value, { readPath: "p", source: "canonical" }).value, value);
  });
});
