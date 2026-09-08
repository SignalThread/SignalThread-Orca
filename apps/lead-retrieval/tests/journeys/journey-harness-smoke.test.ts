/**
 * Smoke test for the Phase 2 journey harness.
 *
 * The pure cases below always run and prove the harness's deterministic core: run-id
 * tagging, the reverse-order cleanup registry, partial-failure safety, and scoping
 * assertions. They require no DB.
 *
 * The final block exercises the real live-DB fixture path (create a lead, assert it is
 * tagged + scoped, then prove cleanup removes it). It is opt-in and skips with a precise
 * reason when the Supabase test connection / company id is not configured.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  createTestRunId,
  journeyNamePrefix,
  taggedName,
  resolveJourneyEnv,
  getJourneySupabase,
  createTestLead,
} from "../helpers/journey-fixtures";
import { JourneyCleanupRegistry } from "../helpers/journey-cleanup";
import {
  assertBelongsToTestRun,
  assertScopedToCompany,
  isJourneyTaggedName,
} from "../helpers/journey-assertions";

describe("journey harness — test-run identity & tagging", () => {
  it("creates unique, prefixed run ids", () => {
    const a = createTestRunId();
    const b = createTestRunId();
    assert.notEqual(a, b);
    assert.match(a, /^lrj-[0-9a-f]{8}$/);
  });

  it("derives a deterministic name prefix and tagged names", () => {
    const runId = "lrj-deadbeef";
    assert.equal(journeyNamePrefix(runId), "LRJ lrj-deadbeef");
    assert.equal(taggedName(runId, "Lead"), "LRJ lrj-deadbeef Lead");
    assert.ok(isJourneyTaggedName(taggedName(runId, "Lead"), runId));
    assert.ok(!isJourneyTaggedName("Random Person", runId));
  });

  it("rejects empty test-run ids", () => {
    assert.throws(() => journeyNamePrefix(""));
    assert.throws(() => journeyNamePrefix("   "));
  });
});

describe("journey harness — cleanup registry", () => {
  it("runs cleanup tasks in reverse registration order", async () => {
    const order: string[] = [];
    const reg = new JourneyCleanupRegistry();
    reg.register("first", () => {
      order.push("first");
    });
    reg.register("second", () => {
      order.push("second");
    });
    reg.register("third", async () => {
      order.push("third");
    });

    const outcome = await reg.cleanup();
    assert.deepEqual(order, ["third", "second", "first"]);
    assert.equal(outcome.attempted, 3);
    assert.equal(outcome.succeeded, 3);
    assert.equal(outcome.failed, 0);
  });

  it("is safe after a partial failure: every task is attempted, errors collected, no throw", async () => {
    const ran: string[] = [];
    const reg = new JourneyCleanupRegistry();
    reg.register("a", () => {
      ran.push("a");
    });
    reg.register("boom", () => {
      throw new Error("cleanup-boom-failed");
    });
    reg.register("c", () => {
      ran.push("c");
    });

    const outcome = await reg.cleanup(); // must not throw
    assert.deepEqual(ran, ["c", "a"]);
    assert.equal(outcome.attempted, 3);
    assert.equal(outcome.succeeded, 2);
    assert.equal(outcome.failed, 1);
    assert.equal(outcome.errors.length, 1);
    assert.equal(outcome.errors[0].label, "boom");
    assert.match(outcome.errors[0].message, /cleanup-boom-failed/);
  });

  it("clears tasks after cleanup so re-running is a safe no-op", async () => {
    const reg = new JourneyCleanupRegistry();
    let calls = 0;
    reg.register("once", () => {
      calls += 1;
    });
    await reg.cleanup();
    const second = await reg.cleanup();
    assert.equal(calls, 1);
    assert.equal(second.attempted, 0);
  });
});

describe("journey harness — scoping assertions", () => {
  it("accepts a tagged, scoped record and rejects mismatches", () => {
    const runId = createTestRunId();
    const record = { full_name: taggedName(runId, "Lead"), company_id: "co-1", event_id: null };
    assertBelongsToTestRun(record, runId);
    assertScopedToCompany(record, "co-1");
    assert.throws(() => assertScopedToCompany(record, "co-2"));
    assert.throws(() => assertBelongsToTestRun({ full_name: "untagged" }, runId));
  });
});

// Live-DB smoke: only runs when explicitly opted in with a pre-existing test company.
const env = resolveJourneyEnv();
describe(
  "journey harness — live fixture create/cleanup",
  { skip: env.enabled ? false : `live-DB disabled: ${env.reason}` },
  () => {
    const runId = createTestRunId();
    const registry = new JourneyCleanupRegistry();

    after(async () => {
      // Safety net: removes the lead even if the assertions below threw before cleanup.
      await registry.cleanup();
    });

    it("creates a tagged, scoped lead and cleanup removes it without leaking", async () => {
      const client = getJourneySupabase(env);
      const lead = await createTestLead(
        client,
        { testRunId: runId, companyId: env.companyId, eventId: env.eventId },
        registry
      );
      assertBelongsToTestRun(lead, runId);
      assertScopedToCompany(lead, env.companyId);

      const outcome = await registry.cleanup();
      assert.equal(outcome.failed, 0);

      const { data, error } = await (
        client as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (col: string, val: unknown) => {
                maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
              };
            };
          };
        }
      )
        .from("leads")
        .select("id")
        .eq("id", lead.id)
        .maybeSingle();
      assert.equal(error, null);
      assert.equal(data, null, "expected created lead to be deleted by cleanup");
    });
  }
);
