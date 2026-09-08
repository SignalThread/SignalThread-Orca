// @lr area=seams severity=P1 layer=unit
/**
 * Seam behavior when enabled.
 *
 * The inertness suite proves the seams do nothing when off. That test would also pass
 * against eight empty modules, so this suite proves they do the right thing when on —
 * otherwise Prompts 8, 11 and 14 would build on a facade.
 *
 * Every test sets the flag explicitly and restores it, so ordering cannot matter.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { SEAM_ENV_FLAG } from "../../lib/testing/seam-policy";
import * as clock from "../../lib/testing/clock";
import * as ids from "../../lib/testing/ids";
import * as provenance from "../../lib/testing/provenance";
import * as faults from "../../lib/testing/fault-injection";
import * as correlation from "../../lib/testing/correlation";
import * as drain from "../../lib/testing/drain";
import * as ai from "../../lib/testing/ai-response";

async function withSeams<T>(fn: () => T | Promise<T>): Promise<T> {
  const savedFlag = process.env[SEAM_ENV_FLAG];
  const savedVercel = process.env.VERCEL_ENV;
  const savedNode = process.env.NODE_ENV;
  process.env[SEAM_ENV_FLAG] = "true";
  delete process.env.VERCEL_ENV;
  (process.env as Record<string, string>).NODE_ENV = "test";
  try {
    return await fn();
  } finally {
    if (savedFlag === undefined) delete process.env[SEAM_ENV_FLAG];
    else process.env[SEAM_ENV_FLAG] = savedFlag;
    if (savedVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = savedVercel;
    if (savedNode === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string>).NODE_ENV = savedNode;
  }
}

afterEach(() => {
  clock.clearTestClock();
  ids.clearIdOverride();
  faults.clearFaults();
  ai.resetAiSeam();
  provenance.resetProvenanceCounters();
});

describe("clock seam, enabled", () => {
  it("freezes time at an exact instant", () => withSeams(() => {
    const restore = clock.setTestClock("2026-03-08T02:30:00.000Z");
    try {
      assert.equal(clock.nowIso(), "2026-03-08T02:30:00.000Z");
      assert.equal(clock.nowMs(), Date.parse("2026-03-08T02:30:00.000Z"));
      assert.equal(clock.isTestClockActive(), true);
    } finally { restore(); }
  }));

  it("returns a fresh Date each call, so a caller cannot mutate the frozen instant", () => withSeams(() => {
    const restore = clock.setTestClock("2026-01-01T00:00:00.000Z");
    try {
      const a = clock.now();
      a.setUTCFullYear(1999);
      assert.equal(clock.now().getUTCFullYear(), 2026);
    } finally { restore(); }
  }));

  it("advances only when told to, so lease expiry is testable without sleeping", () => withSeams(() => {
    const manual = clock.setManualClock("2026-01-01T00:00:00.000Z");
    try {
      assert.equal(clock.nowIso(), "2026-01-01T00:00:00.000Z");
      manual.advance(90_000);
      assert.equal(clock.nowIso(), "2026-01-01T00:01:30.000Z");
      manual.advance(86_400_000);
      assert.equal(clock.nowIso(), "2026-01-02T00:01:30.000Z");
    } finally { manual.restore(); }
  }));

  it("restores the previous override rather than clearing it", () => withSeams(() => {
    const outer = clock.setTestClock("2026-01-01T00:00:00.000Z");
    const inner = clock.setTestClock("2027-01-01T00:00:00.000Z");
    assert.equal(clock.now().getUTCFullYear(), 2027);
    inner();
    assert.equal(clock.now().getUTCFullYear(), 2026, "nested restore must return to the outer clock");
    outer();
  }));

  it("rejects an invalid instant loudly", () => withSeams(() => {
    assert.throws(() => clock.setTestClock("not-a-date"), /invalid instant/);
  }));
});

describe("id seam, enabled", () => {
  it("produces a deterministic counter", () => withSeams(() => {
    const restore = ids.setDeterministicIds("lead");
    try {
      assert.equal(ids.newId(), "lead-00000001");
      assert.equal(ids.newId(), "lead-00000002");
    } finally { restore(); }
  }));

  it("replays a fixed sequence and throws when exhausted", () => withSeams(() => {
    const restore = ids.setIdSequence(["a", "b"]);
    try {
      assert.equal(ids.newId(), "a");
      assert.equal(ids.newId(), "b");
      assert.throws(() => ids.newId(), /exhausted/, "an unexpected extra id must be loud, not silently random");
    } finally { restore(); }
  }));
});

describe("provenance seam, enabled", () => {
  it("attaches an additive _provenance field without disturbing the body", () => withSeams(() => {
    const body = { leadId: "l1", summary: "rich" };
    const result = provenance.attachProvenanceToBody(body, { readPath: "read-model", source: "canonical" });
    assert.equal(result.leadId, "l1");
    assert.equal(result.summary, "rich");
    assert.deepStrictEqual(
      (result as Record<string, unknown>)[provenance.PROVENANCE_FIELD],
      { readPath: "read-model", source: "canonical" }
    );
  }));

  it("emits the test-only header", () => withSeams(() => {
    const headers = provenance.provenanceHeaders({
      readPath: "lead-detail", source: "legacy_fallback", detail: "summary null",
    });
    assert.equal(headers[provenance.PROVENANCE_HEADER], "legacy_fallback");
    assert.equal(headers[`${provenance.PROVENANCE_HEADER}-path`], "lead-detail");
    assert.equal(headers[`${provenance.PROVENANCE_HEADER}-detail`], "summary null");
  }));

  it("captureProvenance collects exactly the reads that fired", async () => withSeams(async () => {
    const { result, records } = await provenance.captureProvenance(() => {
      provenance.recordProvenance({ readPath: "a", source: "canonical" });
      provenance.recordProvenance({ readPath: "b", source: "legacy_fallback" });
      return "done";
    });
    assert.equal(result, "done");
    assert.deepStrictEqual(records.map((r) => r.source), ["canonical", "legacy_fallback"]);
    assert.throws(() => provenance.assertNoFallback(records), /served a fallback/);
  }));

  it("tracks the firing rate per read path independently", () => withSeams(() => {
    provenance.resetProvenanceCounters();
    provenance.recordProvenance({ readPath: "x", source: "canonical" });
    provenance.recordProvenance({ readPath: "x", source: "canonical" });
    provenance.recordProvenance({ readPath: "y", source: "legacy_fallback" });
    assert.equal(provenance.fallbackFiringRate("x").rate, 0);
    assert.equal(provenance.fallbackFiringRate("y").rate, 1);
    assert.equal(provenance.fallbackFiringRate().rate, 1 / 3);
  }));

  it("treats compatibility_derived and placeholder as fallbacks", () => withSeams(() => {
    assert.throws(
      () => provenance.assertNoFallback([{ readPath: "follow_up_date", source: "compatibility_derived" }]),
      /served a fallback/
    );
    assert.throws(
      () => provenance.assertNoFallback([{ readPath: "insight", source: "placeholder" }]),
      /served a fallback/
    );
  }));
});

describe("fault injection seam, enabled", () => {
  it("throws an InjectedFault at the named boundary", () => withSeams(() => {
    const disarm = faults.injectFault({ boundary: "database", kind: "unavailable" });
    try {
      assert.throws(() => faults.maybeFault("database", "leads.select"), faults.InjectedFault);
      assert.doesNotThrow(() => faults.maybeFault("object-storage", "put"), "other boundaries are unaffected");
    } finally { disarm(); }
  }));

  it("fires only the configured number of times, so recovery is testable", () => withSeams(() => {
    const disarm = faults.injectFault({ boundary: "provider-http", kind: "rate-limit", times: 2 });
    try {
      assert.throws(() => faults.maybeFault("provider-http", "send"));
      assert.throws(() => faults.maybeFault("provider-http", "send"));
      assert.doesNotThrow(() => faults.maybeFault("provider-http", "send"), "third call must succeed");
    } finally { disarm(); }
  }));

  it("matches on the operation label", () => withSeams(() => {
    const disarm = faults.injectFault({ boundary: "database", kind: "pool-exhausted", match: /^leads\./ });
    try {
      assert.throws(() => faults.maybeFault("database", "leads.insert"));
      assert.doesNotThrow(() => faults.maybeFault("database", "events.select"));
    } finally { disarm(); }
  }));

  it("disarm removes only that fault", () => withSeams(() => {
    const a = faults.injectFault({ boundary: "database", kind: "unavailable" });
    faults.injectFault({ boundary: "job-queue", kind: "unavailable" });
    a();
    assert.doesNotThrow(() => faults.maybeFault("database", "x"));
    assert.throws(() => faults.maybeFault("job-queue", "x"));
  }));

  it("seam 5 — forces an unknown provider outcome that is explicitly not retry-safe", () => withSeams(() => {
    const disarm = faults.injectUnknownProviderOutcome({ match: "gmail.send" });
    try {
      assert.throws(
        () => faults.maybeFault("provider-http", "gmail.send"),
        (err: unknown) => {
          assert.ok(err instanceof faults.UnknownProviderOutcome);
          assert.equal(err.retrySafe, false, "blind retry here is what produces a duplicate send");
          assert.match(err.message, /reconcile before retrying/);
          return true;
        }
      );
      assert.doesNotThrow(() => faults.maybeFault("provider-http", "gmail.send"), "defaults to firing once");
    } finally { disarm(); }
  }));
});

describe("drain seam, enabled", () => {
  it("ticks until the queue reports idle", () => withSeams(async () => {
    let remaining = 3;
    const result = await drain.drainQueue(async () => {
      if (remaining === 0) return { claimed: false };
      remaining--;
      return { claimed: true };
    });
    assert.deepStrictEqual(result, { ticks: 4, claimed: 3, idle: true });
  }));

  it("reports exhaustion instead of pretending the queue drained", () => withSeams(async () => {
    const result = await drain.drainQueue(async () => ({ claimed: true }), { maxTicks: 5 });
    assert.equal(result.idle, false);
    assert.equal(result.ticks, 5);
    assert.match(String(result.exhausted), /still queued/);
  }));

  it("waitFor resolves once the probe yields a value", () => withSeams(async () => {
    let n = 0;
    const value = await drain.waitFor(() => (++n < 3 ? null : `ready-${n}`));
    assert.equal(value, "ready-3");
  }));

  it("waitFor gives up with a bounded, labelled error", () => withSeams(async () => {
    await assert.rejects(
      () => drain.waitFor(() => null, { attempts: 3, label: "lead row" }),
      /waitFor \(lead row\) gave up after 3 attempts/
    );
  }));
});

describe("AI seam, enabled", () => {
  it("captures the assembled prompt without altering it", () => withSeams(() => {
    ai.resetAiSeam();
    ai.captureAndMaybeStub({
      operation: "campaign-draft", model: "gpt-4o-mini",
      messages: [{ role: "system", content: "You write emails." }, { role: "user", content: "Lead: Acme" }],
      scope: { companyId: "c1", eventId: "e1", leadId: "l1" },
    });
    const prompt = ai.lastPrompt();
    assert.equal(prompt?.operation, "campaign-draft");
    assert.equal(ai.promptText(prompt!), "You write emails.\nLead: Acme");
    assert.deepStrictEqual(prompt?.scope, { companyId: "c1", eventId: "e1", leadId: "l1" });
  }));

  it("serves queued responses in order", () => withSeams(() => {
    const restore = ai.stubAiResponses({ kind: "rate-limit" }, { kind: "content", content: "ok" });
    try {
      const p = { operation: "o", model: "m", messages: [] };
      assert.deepStrictEqual(ai.captureAndMaybeStub(p), { kind: "rate-limit" });
      assert.deepStrictEqual(ai.captureAndMaybeStub(p), { kind: "content", content: "ok" });
      assert.equal(ai.captureAndMaybeStub(p), undefined, "queue exhausted falls through to the real client");
    } finally { restore(); }
  }));

  it("stubAiResponseAlways repeats, so retry-does-not-double-generate is testable", () => withSeams(() => {
    const restore = ai.stubAiResponseAlways({ kind: "timeout" });
    try {
      const p = { operation: "o", model: "m", messages: [] };
      for (let i = 0; i < 3; i++) assert.deepStrictEqual(ai.captureAndMaybeStub(p), { kind: "timeout" });
    } finally { restore(); }
  }));

  it("materializes each failure mode as the right throw or value", () => {
    assert.equal(ai.materializeStub({ kind: "content", content: "hi" }), "hi");
    assert.equal(ai.materializeStub({ kind: "malformed", body: "not json{" }), "not json{",
      "a malformed body must reach the caller's parser, which is the thing under test");
    assert.throws(() => ai.materializeStub({ kind: "refusal" }), /refused/);
    assert.throws(() => ai.materializeStub({ kind: "rate-limit" }), (e: unknown) => {
      assert.ok(e instanceof ai.AiStubError);
      assert.equal(e.status, 429);
      return true;
    });
    assert.throws(() => ai.materializeStub({ kind: "timeout" }), /timed out/);
    assert.throws(() => ai.materializeStub({ kind: "error", status: 500 }), /500/);
  });
});

describe("correlation seam, enabled", () => {
  it("pins a known id so one value can be followed through every layer", () => withSeams(() => {
    correlation.withFixedCorrelationId("pinned-abc-123", () => {
      assert.equal(correlation.currentCorrelationId(), "pinned-abc-123");
      assert.deepStrictEqual(correlation.correlationHeaders(), {
        [correlation.CORRELATION_HEADER]: "pinned-abc-123",
      });
    });
  }));

  it("annotates scope onto the active context", () => withSeams(() => {
    correlation.withFixedCorrelationId("pinned-abc-123", () => {
      correlation.annotateCorrelation({ companyId: "c1" });
      correlation.annotateCorrelation({ eventId: "e1" });
      assert.deepStrictEqual(correlation.correlationLogFields(), {
        correlationId: "pinned-abc-123", companyId: "c1", eventId: "e1",
      });
    });
  }));

  it("adopts an inbound header via withCorrelationFromRequest", () => withSeams(() => {
    const request = { headers: { get: (n: string) => (n === correlation.CORRELATION_HEADER ? "inbound-id-99" : null) } };
    correlation.withCorrelationFromRequest(request, () => {
      assert.equal(correlation.currentCorrelationId(), "inbound-id-99");
      assert.equal(correlation.currentCorrelationContext()?.origin, "inbound");
    });
  }));
});
