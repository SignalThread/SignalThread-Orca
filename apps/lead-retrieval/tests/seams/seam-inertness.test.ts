// @lr area=seams severity=P0 layer=unit
/**
 * Seam inertness.
 *
 * Prompt 3's hard constraint: "Each seam gets a test proving it is inert when the test
 * flag is absent." Tagged P0 because a seam that stays live in production is a
 * behavior-altering backdoor in eight places at once — and one of them (fault
 * injection) can make a production dependency appear to fail on command.
 *
 * Every test here runs with the flag deliberately unset or with production env set,
 * and asserts the real implementation is what runs.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  SEAM_ENV_FLAG,
  SEAM_NAMES,
  getSeamDenialReasonFromEnv,
  seamsEnabled,
  useSeam,
} from "../../lib/testing/seam-policy";
import * as clock from "../../lib/testing/clock";
import * as ids from "../../lib/testing/ids";
import * as provenance from "../../lib/testing/provenance";
import * as faults from "../../lib/testing/fault-injection";
import * as correlation from "../../lib/testing/correlation";
import * as drain from "../../lib/testing/drain";
import * as ai from "../../lib/testing/ai-response";

/**
 * Run `fn` with a specific seam-flag state, always restoring afterwards.
 *
 * Handles both sync and async bodies. A plain `try/finally` would restore the env the
 * moment an async callback returns its *promise*, not when it settles — so the body
 * would run with the flag already reverted, and a "seams on" assertion would silently
 * exercise the "seams off" path and pass for the wrong reason.
 */
function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };

  let result: T;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof (result as { then?: unknown }).then === "function") {
    return (result as unknown as Promise<unknown>).then(
      (value) => { restore(); return value; },
      (error) => { restore(); throw error; }
    ) as unknown as T;
  }
  restore();
  return result;
}

const SEAMS_OFF = { [SEAM_ENV_FLAG]: undefined } as Record<string, string | undefined>;
const SEAMS_ON = { [SEAM_ENV_FLAG]: "true", NODE_ENV: "test", VERCEL_ENV: undefined } as Record<string, string | undefined>;

afterEach(() => {
  clock.clearTestClock();
  ids.clearIdOverride();
  faults.clearFaults();
  ai.resetAiSeam();
  provenance.resetProvenanceCounters();
});

// ── the gate itself ────────────────────────────────────────────────────────────────

describe("seam policy", () => {
  it("denies when the flag is absent", () => {
    assert.equal(getSeamDenialReasonFromEnv({}), `${SEAM_ENV_FLAG} is not true`);
  });

  it("denies in production regardless of the flag", () => {
    assert.equal(
      getSeamDenialReasonFromEnv({ NODE_ENV: "production", LR_TEST_SEAMS_ENABLED: "true" }),
      "NODE_ENV production"
    );
    assert.equal(
      getSeamDenialReasonFromEnv({ VERCEL_ENV: "production", LR_TEST_SEAMS_ENABLED: "true" }),
      "VERCEL_ENV production"
    );
  });

  it("denies on preview deploys, which carry real credentials", () => {
    assert.equal(
      getSeamDenialReasonFromEnv({ VERCEL_ENV: "preview", LR_TEST_SEAMS_ENABLED: "true" }),
      "VERCEL_ENV preview"
    );
  });

  it("only permits the exact string 'true'", () => {
    for (const value of ["1", "TRUE", "yes", "on", "", " true "]) {
      assert.equal(
        getSeamDenialReasonFromEnv({ LR_TEST_SEAMS_ENABLED: value }),
        `${SEAM_ENV_FLAG} is not true`,
        `"${value}" must not enable seams`
      );
    }
    assert.equal(getSeamDenialReasonFromEnv({ LR_TEST_SEAMS_ENABLED: "true" }), null);
  });

  it("useSeam returns undefined when seams are off, so the real path cannot be skipped", () => {
    withEnv(SEAMS_OFF, () => {
      assert.equal(useSeam("override"), undefined);
      assert.equal(useSeam("override") ?? "real", "real");
    });
  });

  it("declares all eight seams named by plan §77", () => {
    assert.equal(SEAM_NAMES.length, 8);
  });
});

// ── seam 1: clock ──────────────────────────────────────────────────────────────────

describe("seam 1 — clock is inert when seams are off", () => {
  it("now() tracks the real clock", () => {
    withEnv(SEAMS_OFF, () => {
      const before = Date.now();
      const value = clock.now().getTime();
      const after = Date.now();
      assert.ok(value >= before && value <= after, "now() must be the real current instant");
    });
  });

  it("setTestClock does not freeze time and returns a safe no-op restore", () => {
    withEnv(SEAMS_OFF, () => {
      const restore = clock.setTestClock("2001-01-01T00:00:00.000Z");
      assert.notEqual(clock.now().getUTCFullYear(), 2001, "time must not be frozen when seams are off");
      assert.equal(clock.isTestClockActive(), false);
      restore();
    });
  });

  it("setManualClock is inert and its advance() does nothing", () => {
    withEnv(SEAMS_OFF, () => {
      const manual = clock.setManualClock("2001-01-01T00:00:00.000Z");
      manual.advance(86_400_000);
      assert.notEqual(clock.now().getUTCFullYear(), 2001);
      manual.restore();
    });
  });

  it("an override set while seams were on is ignored once they are off", () => {
    withEnv(SEAMS_ON, () => clock.setTestClock("2001-01-01T00:00:00.000Z"));
    withEnv(SEAMS_OFF, () => {
      assert.notEqual(clock.now().getUTCFullYear(), 2001, "a leaked override must not affect production time");
    });
  });
});

// ── seam 2: ids ────────────────────────────────────────────────────────────────────

describe("seam 2 — id generation is inert when seams are off", () => {
  it("newId returns a distinct UUID each call", () => {
    withEnv(SEAMS_OFF, () => {
      const a = ids.newId();
      const b = ids.newId();
      assert.notEqual(a, b);
      assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  it("setDeterministicIds does not make ids deterministic", () => {
    withEnv(SEAMS_OFF, () => {
      ids.setDeterministicIds("test");
      assert.notEqual(ids.newId(), "test-00000001");
      assert.equal(ids.isDeterministicIdActive(), false);
    });
  });

  it("an override set while seams were on is ignored once they are off", () => {
    withEnv(SEAMS_ON, () => ids.setDeterministicIds("leak"));
    withEnv(SEAMS_OFF, () => {
      assert.doesNotMatch(ids.newId(), /^leak-/);
    });
  });

  it("idempotency key derivation is identical in both states — it is a product invariant", () => {
    const off = withEnv(SEAMS_OFF, () => ids.deriveIdempotencyKey("email-send", ["lead-1", "user-2"]));
    const on = withEnv(SEAMS_ON, () => ids.deriveIdempotencyKey("email-send", ["lead-1", "user-2"]));
    assert.equal(off, on, "key derivation must not depend on the seam flag");
    assert.equal(off.length, 32);
  });

  it("key derivation cannot collide across differently-grouped parts", () => {
    assert.notEqual(
      ids.deriveIdempotencyKey("s", ["a", "b|c"]),
      ids.deriveIdempotencyKey("s", ["a|b", "c"])
    );
  });

  it("distinguishes a null part from an empty-string part", () => {
    assert.notEqual(
      ids.deriveIdempotencyKey("s", ["a", null]),
      ids.deriveIdempotencyKey("s", ["a", ""])
    );
  });
});

// ── seam 3: provenance ─────────────────────────────────────────────────────────────

describe("seam 3 — provenance exposure is inert when seams are off", () => {
  it("does not add a _provenance field to a response body", () => {
    withEnv(SEAMS_OFF, () => {
      const body = { leadId: "l1", summary: "text" };
      const result = provenance.attachProvenanceToBody(body, { readPath: "p", source: "canonical" });
      assert.deepStrictEqual(result, body, "production payloads must be byte-identical");
      assert.equal(provenance.PROVENANCE_FIELD in result, false);
    });
  });

  it("emits no provenance headers", () => {
    withEnv(SEAMS_OFF, () => {
      assert.deepStrictEqual(provenance.provenanceHeaders({ readPath: "p", source: "legacy_fallback" }), {});
    });
  });

  it("still RECORDS provenance when seams are off — the metric must work in production", () => {
    withEnv(SEAMS_OFF, () => {
      provenance.resetProvenanceCounters();
      provenance.recordProvenance({ readPath: "read-model", source: "canonical" });
      provenance.recordProvenance({ readPath: "read-model", source: "legacy_fallback" });
      const rate = provenance.fallbackFiringRate("read-model");
      assert.deepStrictEqual(rate, { canonical: 1, fallback: 1, rate: 0.5 });
    });
  });

  it("withProvenance returns the value unchanged", () => {
    withEnv(SEAMS_OFF, () => {
      const value = { a: 1 };
      const wrapped = provenance.withProvenance(value, { readPath: "p", source: "canonical" });
      assert.equal(wrapped.value, value, "the value must be the same reference, not a copy");
    });
  });

  it("a broken observer cannot break a read", () => {
    const restore = provenance.observeProvenance(() => { throw new Error("observer exploded"); });
    try {
      assert.doesNotThrow(() => provenance.recordProvenance({ readPath: "p", source: "canonical" }));
    } finally {
      restore();
    }
  });

  it("assertNoFallback passes on canonical reads and throws on a fallback", () => {
    assert.doesNotThrow(() => provenance.assertNoFallback([{ readPath: "a", source: "canonical" }]));
    assert.throws(
      () => provenance.assertNoFallback([
        { readPath: "a", source: "canonical" },
        { readPath: "b", source: "legacy_fallback", detail: "summary was null" },
      ]),
      /served a fallback[\s\S]*legacy_fallback[\s\S]*summary was null/
    );
  });
});

// ── seams 4 and 5: fault injection ─────────────────────────────────────────────────

describe("seams 4 and 5 — fault injection is inert when seams are off", () => {
  it("maybeFault does not throw even with a fault armed", () => {
    withEnv(SEAMS_OFF, () => {
      faults.injectFault({ boundary: "database", kind: "unavailable" });
      assert.doesNotThrow(() => faults.maybeFault("database", "leads.select"));
      assert.equal(faults.faultArmedFor("database", "leads.select"), false);
      assert.deepStrictEqual(faults.armedFaults(), []);
    });
  });

  it("injectUnknownProviderOutcome does not arm anything", () => {
    withEnv(SEAMS_OFF, () => {
      faults.injectUnknownProviderOutcome();
      assert.doesNotThrow(() => faults.maybeFault("provider-http", "gmail.send"));
    });
  });

  it("a fault armed while seams were on cannot fire once they are off", () => {
    withEnv(SEAMS_ON, () => faults.injectFault({ boundary: "database", kind: "unavailable" }));
    withEnv(SEAMS_OFF, () => {
      assert.doesNotThrow(
        () => faults.maybeFault("database", "leads.select"),
        "a leaked fault must never be able to fail a production dependency"
      );
    });
  });

  it("maybeFaultAsync resolves without faulting", async () => {
    await withEnv(SEAMS_OFF, async () => {
      faults.injectFault({ boundary: "provider-http", kind: "timeout" });
      await faults.maybeFaultAsync("provider-http", "gmail.send");
    });
  });
});

// ── seam 6: correlation ────────────────────────────────────────────────────────────

describe("seam 6 — correlation is always active but changes no behavior", () => {
  it("has no ambient context outside a request", () => {
    withEnv(SEAMS_OFF, () => {
      assert.equal(correlation.currentCorrelationId(), null);
      assert.deepStrictEqual(correlation.correlationHeaders(), {});
      assert.deepStrictEqual(correlation.correlationLogFields(), {});
    });
  });

  it("propagates an id through nested async calls", async () => {
    await correlation.withCorrelation({ correlationId: "fixed-id-123456", origin: "generated" }, async () => {
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      assert.equal(correlation.currentCorrelationId(), "fixed-id-123456");
    });
  });

  it("adopts a well-formed inbound id and mints one otherwise", () => {
    assert.deepStrictEqual(correlation.resolveCorrelationId("abcd1234efgh"), {
      correlationId: "abcd1234efgh", origin: "inbound",
    });
    for (const bad of ["", "short", null, undefined, 42, "has spaces", "x".repeat(200), "<script>"]) {
      const resolved = correlation.resolveCorrelationId(bad);
      assert.equal(resolved.origin, "generated", `${JSON.stringify(bad)} must not be adopted`);
    }
  });

  it("withFixedCorrelationId is inert when seams are off", () => {
    withEnv(SEAMS_OFF, () => {
      correlation.withFixedCorrelationId("pinned-value-1", () => {
        assert.equal(correlation.currentCorrelationId(), null, "production ids must stay unguessable");
      });
    });
  });

  it("log fields never carry a user id or any free-form value", () => {
    correlation.withCorrelation(
      { correlationId: "abcd1234efgh", origin: "inbound", scope: { companyId: "c1", eventId: "e1", userId: "u1" } },
      () => {
        const fields = correlation.correlationLogFields();
        assert.equal(fields.companyId, "c1");
        assert.equal(fields.eventId, "e1");
        assert.equal("userId" in fields, false, "user id is PII-adjacent and is not logged by default");
      }
    );
  });
});

// ── seam 7: drain ──────────────────────────────────────────────────────────────────

describe("seam 7 — drain refuses to run when seams are off", () => {
  it("drainQueue throws rather than silently doing nothing", async () => {
    await withEnv(SEAMS_OFF, async () => {
      assert.equal(drain.drainAvailable(), false);
      await assert.rejects(
        () => drain.drainQueue(async () => ({ claimed: false })),
        /test-only seam and is inert/,
        "a silent no-op would let a test assert against an undrained queue and pass"
      );
    });
  });

  it("waitFor throws rather than silently doing nothing", async () => {
    await withEnv(SEAMS_OFF, async () => {
      await assert.rejects(() => drain.waitFor(() => "value"), /test-only seam and is inert/);
    });
  });
});

// ── seam 8: AI ─────────────────────────────────────────────────────────────────────

describe("seam 8 — AI response layer is inert when seams are off", () => {
  it("captureAndMaybeStub returns undefined so the real client is used", () => {
    withEnv(SEAMS_OFF, () => {
      ai.stubAiResponses({ kind: "content", content: "stubbed" });
      const stub = ai.captureAndMaybeStub({
        operation: "campaign-draft", model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }],
      });
      assert.equal(stub, undefined, "production must always reach the real model");
    });
  });

  it("captures nothing when seams are off", () => {
    withEnv(SEAMS_OFF, () => {
      ai.resetAiSeam();
      ai.captureAndMaybeStub({ operation: "x", model: "m", messages: [{ role: "user", content: "secret" }] });
      assert.deepStrictEqual(ai.capturedPrompts(), [], "prompt contents must not be retained in production");
    });
  });

  it("a stub armed while seams were on cannot serve once they are off", () => {
    withEnv(SEAMS_ON, () => ai.stubAiResponseAlways({ kind: "refusal" }));
    withEnv(SEAMS_OFF, () => {
      assert.equal(
        ai.captureAndMaybeStub({ operation: "x", model: "m", messages: [] }),
        undefined
      );
    });
  });

  it("assertPromptExcludes detects an out-of-scope value", () => {
    const prompt = {
      operation: "campaign-draft", model: "m",
      messages: [{ role: "user", content: "Lead: Acme Corp. Other tenant: Globex Inc." }],
    };
    assert.doesNotThrow(() => ai.assertPromptExcludes(prompt, ["Initech"]));
    assert.throws(() => ai.assertPromptExcludes(prompt, ["Globex Inc."]), /out-of-scope value/);
  });

  it("assertPromptExcludes is case-insensitive", () => {
    const prompt = { operation: "o", model: "m", messages: [{ role: "user", content: "GLOBEX" }] };
    assert.throws(() => ai.assertPromptExcludes(prompt, ["globex"]), /out-of-scope/);
  });
});

// ── the aggregate guarantee ────────────────────────────────────────────────────────

describe("aggregate inertness", () => {
  it("seamsEnabled() is false under a default test environment with no flag", () => {
    withEnv({ [SEAM_ENV_FLAG]: undefined, NODE_ENV: "test", VERCEL_ENV: undefined }, () => {
      assert.equal(seamsEnabled(), false, "seams must be opt-in even in a test environment");
    });
  });

  it("no seam control panics when called with seams off", () => {
    withEnv(SEAMS_OFF, () => {
      assert.doesNotThrow(() => {
        clock.setTestClock(0)();
        clock.setManualClock(0).restore();
        ids.setDeterministicIds()();
        ids.setIdSequence(["a"])();
        faults.injectFault({ boundary: "ai", kind: "rate-limit" })();
        faults.injectUnknownProviderOutcome()();
        ai.stubAiResponses({ kind: "timeout" })();
        ai.stubAiResponseAlways({ kind: "timeout" })();
        provenance.provenanceHeaders({ readPath: "p", source: "canonical" });
      });
    });
  });
});
