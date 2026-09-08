// @lr area=resilience severity=P1 layer=unit category=local-only
/**
 * Resilience and observability — plan §56 and §57, Prompt 14 items 4 and 5.
 *
 * §56 is scoped by the v3.2 rules: *"Resilience behaviour through deterministic
 * local/replay seams only where safe… Do not intentionally break/exhaust production
 * infrastructure."* So every fault here comes from the Prompt 3 injection seam, not from a
 * real dependency.
 *
 * §57's correlation-ID requirement was recorded in Prompt 1 as absent; Prompt 3 built the
 * seam. This suite proves it threads through the async boundaries §57 names — UI → API →
 * DB → provider → job — which is the property that makes an incident diagnosable without
 * reproducing it.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { SEAM_ENV_FLAG } from "../../lib/testing/seam-policy";
import {
  InjectedFault,
  UnknownProviderOutcome,
  clearFaults,
  injectFault,
  injectUnknownProviderOutcome,
  maybeFault,
} from "../../lib/testing/fault-injection";
import {
  CORRELATION_HEADER,
  annotateCorrelation,
  correlationHeaders,
  correlationLogFields,
  currentCorrelationId,
  resolveCorrelationId,
  withCorrelation,
  withCorrelationFromRequest,
} from "../../lib/testing/correlation";
import { fallbackFiringRate, recordProvenance, resetProvenanceCounters } from "../../lib/testing/provenance";

/** Run with seams enabled, restoring env afterwards. */
async function withSeams<T>(fn: () => T | Promise<T>): Promise<T> {
  const saved = process.env[SEAM_ENV_FLAG];
  const savedVercel = process.env.VERCEL_ENV;
  process.env[SEAM_ENV_FLAG] = "true";
  delete process.env.VERCEL_ENV;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env[SEAM_ENV_FLAG];
    else process.env[SEAM_ENV_FLAG] = saved;
    if (savedVercel !== undefined) process.env.VERCEL_ENV = savedVercel;
  }
}

afterEach(() => {
  clearFaults();
  resetProvenanceCounters();
});

// ── fault injection at each boundary (§56) ─────────────────────────────────────────

describe("each dependency boundary can be failed deterministically", () => {
  const BOUNDARIES = ["database", "object-storage", "provider-http", "job-queue", "ai"] as const;

  for (const boundary of BOUNDARIES) {
    it(`${boundary} can be made unavailable on demand`, () =>
      withSeams(() => {
        const disarm = injectFault({ boundary, kind: "unavailable" });
        try {
          assert.throws(() => maybeFault(boundary, "op"), InjectedFault);
        } finally {
          disarm();
        }
      }));
  }

  it("a fault at one boundary does not affect the others", () =>
    withSeams(() => {
      const disarm = injectFault({ boundary: "database", kind: "unavailable" });
      try {
        assert.throws(() => maybeFault("database", "op"));
        for (const other of ["object-storage", "provider-http", "job-queue", "ai"] as const) {
          assert.doesNotThrow(() => maybeFault(other, "op"), `${other} should be unaffected`);
        }
      } finally {
        disarm();
      }
    }));

  it("retries do not amplify an outage — a bounded fault clears (§56)", () =>
    withSeams(() => {
      // The §56 property: after the configured failures, the dependency recovers, so a
      // caller with backoff succeeds rather than hammering forever.
      const disarm = injectFault({ boundary: "provider-http", kind: "rate-limit", times: 3 });
      try {
        let failures = 0;
        for (let attempt = 0; attempt < 5; attempt++) {
          try { maybeFault("provider-http", "send"); } catch { failures++; }
        }
        assert.equal(failures, 3, "exactly the configured number of attempts fail");
      } finally {
        disarm();
      }
    }));

  it("pool exhaustion is representable, not just generic unavailability", () =>
    withSeams(() => {
      const disarm = injectFault({ boundary: "database", kind: "pool-exhausted" });
      try {
        assert.throws(() => maybeFault("database", "leads.select"), (err: unknown) => {
          assert.ok(err instanceof InjectedFault);
          assert.equal(err.kind, "pool-exhausted", "the caller must be able to distinguish causes");
          return true;
        });
      } finally {
        disarm();
      }
    }));
});

// ── the unknown outcome (§56, §48) ─────────────────────────────────────────────────

describe("an unknown provider outcome is distinguishable from a failure", () => {
  it("is not an InjectedFault — it must not be handled as a plain error", () =>
    withSeams(() => {
      const disarm = injectUnknownProviderOutcome({ match: "gmail.send" });
      try {
        assert.throws(() => maybeFault("provider-http", "gmail.send"), (err: unknown) => {
          assert.ok(err instanceof UnknownProviderOutcome);
          assert.equal(err instanceof InjectedFault, false);
          return true;
        });
      } finally {
        disarm();
      }
    }));

  it("declares itself NOT retry-safe", () =>
    withSeams(() => {
      const disarm = injectUnknownProviderOutcome();
      try {
        assert.throws(() => maybeFault("provider-http", "send"), (err: unknown) => {
          assert.equal((err as UnknownProviderOutcome).retrySafe, false);
          assert.match((err as Error).message, /reconcile before retrying/);
          return true;
        });
      } finally {
        disarm();
      }
    }));

  it("fires once by default, so reconciliation can then succeed", () =>
    withSeams(() => {
      const disarm = injectUnknownProviderOutcome();
      try {
        assert.throws(() => maybeFault("provider-http", "send"));
        assert.doesNotThrow(() => maybeFault("provider-http", "send"), "the reconciliation attempt must get through");
      } finally {
        disarm();
      }
    }));
});

// ── correlation threading (§57) ────────────────────────────────────────────────────

describe("a correlation id threads through the whole request (§57)", () => {
  it("is adopted from an inbound header", () => {
    const request = { headers: { get: (n: string) => (n === CORRELATION_HEADER ? "req-abc-123456" : null) } };
    withCorrelationFromRequest(request, () => {
      assert.equal(currentCorrelationId(), "req-abc-123456");
    });
  });

  it("is minted when absent, so every request is traceable", () => {
    const request = { headers: { get: () => null } };
    withCorrelationFromRequest(request, () => {
      assert.ok(currentCorrelationId(), "a request with no inbound id must still get one");
    });
  });

  it("survives every async hop — UI → API → DB → provider → job", async () => {
    await withCorrelation({ correlationId: "trace-me-123456", origin: "inbound" }, async () => {
      // Each await models one hop.
      await Promise.resolve();                                   // API handler
      assert.equal(currentCorrelationId(), "trace-me-123456");
      await new Promise((r) => setImmediate(r));                 // DB round trip
      assert.equal(currentCorrelationId(), "trace-me-123456");
      await new Promise((r) => setTimeout(r, 1));                // provider call
      assert.equal(currentCorrelationId(), "trace-me-123456");
      await Promise.all([Promise.resolve(), Promise.resolve()]); // fan-out to jobs
      assert.equal(currentCorrelationId(), "trace-me-123456");
    });
  });

  it("two concurrent requests do not share an id", async () => {
    const observed: string[] = [];
    const run = (id: string) =>
      withCorrelation({ correlationId: id, origin: "generated" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        observed.push(currentCorrelationId()!);
      });

    await Promise.all([run("request-aaa-111"), run("request-bbb-222")]);
    assert.deepStrictEqual(observed.sort(), ["request-aaa-111", "request-bbb-222"]);
  });

  it("propagates outward as a header, so a provider call is correlatable", () => {
    withCorrelation({ correlationId: "outbound-999999", origin: "generated" }, () => {
      assert.deepStrictEqual(correlationHeaders(), { [CORRELATION_HEADER]: "outbound-999999" });
    });
  });

  it("an inbound id is used for log correlation only, never for authorization", () => {
    // A forged header can at worst group the caller's own log lines. It is never a lookup
    // key or an authorization input — Prompt 3's stated constraint.
    const forged = resolveCorrelationId("'; DROP TABLE leads; --");
    assert.equal(forged.origin, "generated", "a malformed id is replaced, not trusted");

    const plausible = resolveCorrelationId("attacker-chosen-id");
    assert.equal(plausible.origin, "inbound");
    assert.equal(plausible.correlationId, "attacker-chosen-id", "adopted for logging only");
  });

  it("log fields carry scope but never a user id or free-form value (§54)", () => {
    withCorrelation({ correlationId: "abc-123456", origin: "inbound" }, () => {
      annotateCorrelation({ companyId: "c1", eventId: "e1", userId: "u1" });
      const fields = correlationLogFields();
      assert.equal(fields.companyId, "c1");
      assert.equal(fields.eventId, "e1");
      assert.equal("userId" in fields, false, "user id is PII-adjacent and is not logged by default");
    });
  });

  it("outside a request there is no ambient id to leak between calls", () => {
    assert.equal(currentCorrelationId(), null);
    assert.deepStrictEqual(correlationHeaders(), {});
  });
});

// ── the fallback firing-rate metric (§57, wired from Prompt 8) ─────────────────────

describe("fallback firing rate is available as an alertable metric", () => {
  it("aggregates into a single number an alert can threshold", () => {
    recordProvenance({ readPath: "read-model", source: "canonical" });
    recordProvenance({ readPath: "read-model", source: "canonical" });
    recordProvenance({ readPath: "read-model", source: "legacy_fallback" });

    const rate = fallbackFiringRate();
    assert.equal(rate.canonical, 2);
    assert.equal(rate.fallback, 1);
    assert.ok(Math.abs(rate.rate - 1 / 3) < 1e-9);
  });

  it("a healthy system reports a rate of zero", () => {
    recordProvenance({ readPath: "read-model", source: "canonical" });
    assert.equal(fallbackFiringRate().rate, 0, "zero is the expected steady state, so any rise is signal");
  });

  it("records without the seam flag, so the metric works in production", () => {
    // Prompt 3's deliberate asymmetry. A counter that only incremented under a test flag
    // could never alert on the thing it exists to detect.
    assert.notEqual(process.env[SEAM_ENV_FLAG], "true");
    recordProvenance({ readPath: "prod", source: "legacy_fallback" });
    assert.equal(fallbackFiringRate("prod").fallback, 1);
  });
});
