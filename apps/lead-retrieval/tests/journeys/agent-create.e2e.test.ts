/**
 * Agent (Signal) create/config journey.
 *
 * In this product an "agent" is a **Signal**. Creation goes through the canonical
 * `buildSignalInsertPatch` (the same patch builder the signal mutation routes use), which
 * resolves scope (`signal_scope`, `company_id`, `event_id`, `owner_user_id`) and role visibility.
 * This journey drives that real builder and (opt-in) persists a scoped, tagged signal.
 *
 * Authorization for reading/using/deleting signals by scope is covered by
 * `signal-scope-ownership.test.ts` and `signal-delete-authorization.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { buildSignalInsertPatch } from "../../lib/signals/signal-mutation-patches";
import {
  createTestRunId,
  taggedName,
  journeyNamePrefix,
  resolveJourneyEnv,
  getJourneySupabase,
} from "../helpers/journey-fixtures";
import { JourneyCleanupRegistry } from "../helpers/journey-cleanup";

const CREATED_BY = "00000000-0000-0000-0000-0000000000aa";

function payload(over: Record<string, unknown> = {}) {
  return {
    name: "  Follow-Up Agent  ",
    category: "CUSTOM",
    default_prompt: "  Draft a friendly follow-up.  ",
    admin_override_prompt: null,
    tones: ["Professional"],
    is_active: true,
    available_in_pattern_mode: true,
    signal_scope: "company",
    role_scope: "exhibitor_admin",
    ...over,
  } as any;
}

describe("agent (signal) create journey — canonical scope resolution", () => {
  it("scopes a company signal to company_id with owner defaulting to the creator", () => {
    const patch = buildSignalInsertPatch(payload(), CREATED_BY, { companyId: "co-1", eventId: null });
    assert.equal(patch.signal_scope, "company");
    assert.equal(patch.company_id, "co-1");
    assert.equal(patch.event_id, null);
    assert.equal(patch.owner_user_id, CREATED_BY);
    assert.equal(patch.created_by, CREATED_BY);
    assert.equal(patch.name, "Follow-Up Agent"); // trimmed
    assert.equal(patch.is_active, true);
    assert.equal(patch.visibility, "role");
    assert.equal(patch.role_scope, "exhibitor_admin");
  });

  it("scopes an event signal to its event_id", () => {
    const patch = buildSignalInsertPatch(payload({ signal_scope: "event" }), CREATED_BY, {
      companyId: "co-1",
      eventId: "event-1",
    });
    assert.equal(patch.signal_scope, "event");
    assert.equal(patch.event_id, "event-1");
    assert.equal(patch.company_id, "co-1");
  });

  it("normalizes the 'default' scope to company and respects an explicit owner override", () => {
    const patch = buildSignalInsertPatch(payload({ signal_scope: "default" }), CREATED_BY, {
      companyId: "co-1",
      eventId: null,
      ownerUserId: "owner-9",
    });
    assert.equal(patch.signal_scope, "company");
    assert.equal(patch.owner_user_id, "owner-9");
  });
});

// Opt-in live insert: persist a scoped, tagged signal and clean it up. Needs a pre-existing
// test user (FK for created_by/owner_user_id).
const env = resolveJourneyEnv();
const testUserId = (process.env.JOURNEY_TEST_USER_ID || "").trim();
const liveSkip = !env.enabled
  ? `live-DB disabled: ${env.reason}`
  : !testUserId
    ? "missing JOURNEY_TEST_USER_ID (FK for created_by/owner_user_id)"
    : false;

describe("agent (signal) create journey — live persistence & scope", { skip: liveSkip }, () => {
  const runId = createTestRunId();
  const registry = new JourneyCleanupRegistry();

  after(async () => {
    await registry.cleanup();
  });

  it("persists a company-scoped signal and reads its scope back", async () => {
    const client = getJourneySupabase(env);
    const db = client as unknown as { from: (t: string) => any };
    const insert = buildSignalInsertPatch(payload({ name: taggedName(runId, "Agent") }), testUserId, {
      companyId: env.companyId,
      eventId: null,
    });

    const { data, error } = await db.from("signals").insert(insert).select("id, name, signal_scope, company_id").maybeSingle();
    assert.equal(error, null);
    assert.ok(data, "expected signal to insert");
    registry.register(`signal:${data.id}`, async () => {
      await db.from("signals").delete().eq("id", data.id).eq("company_id", env.companyId);
    });
    assert.ok(String(data.name).startsWith(journeyNamePrefix(runId)));
    assert.equal(String(data.company_id), env.companyId);
    assert.equal(data.signal_scope, "company");

    const outcome = await registry.cleanup();
    assert.equal(outcome.failed, 0);
  });
});
