/**
 * Lead create journey.
 *
 * Canonical path: `POST /api/exhibitor/leads/create` — an auth-gated route that inserts via
 * the service-role admin client and emits a `lead_captured` workflow. That route resolves a
 * real session and pulls in `server-only` transitively, so it cannot be invoked from the
 * node:test lane; full auth'd route E2E belongs to the Playwright `/e2e` lane.
 *
 * This journey therefore proves create two ways:
 *  1. Canonical-route source contract — the route uses the real insert path (insert → select
 *     the persisted row, i.e. it does NOT fabricate a success payload), scopes the write to
 *     company/event/owner, applies current defaults + temperature derivation, emits the
 *     workflow, and supports idempotent replay with a cross-account guard.
 *  2. Live persistence round-trip (opt-in) — a scoped, run-tagged lead is written to the real
 *     `leads` table, read back, and cleaned up, proving scope + traceability + cleanup.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  leadTemperatureToLegacyPriorityScore,
  legacyPriorityScoreToLeadTemperature,
} from "../../lib/leads/temperature";
import {
  createTestRunId,
  resolveJourneyEnv,
  getJourneySupabase,
  createTestLead,
} from "../helpers/journey-fixtures";
import { JourneyCleanupRegistry } from "../helpers/journey-cleanup";
import { assertBelongsToTestRun, assertScopedToCompany } from "../helpers/journey-assertions";

const root = process.cwd();
const createRoute = readFileSync(join(root, "app/api/exhibitor/leads/create/route.ts"), "utf8");

describe("lead create journey — canonical route contract", () => {
  it("creates through the real insert path and reads the persisted row back (no fabricated state)", () => {
    assert.match(createRoute, /resolveApiSession\(request\)/);
    assert.match(createRoute, /const supabase = createAdminClient\(\)/);
    assert.match(createRoute, /\.from\("leads"\)\s*\.insert\(insertRow\)\s*\.select\(/);
    assert.match(createRoute, /id, company_id, full_name,[\s\S]*created_at, updated_at/);
  });

  it("scopes the insert to company_id / event_id / owner_user_id", () => {
    assert.match(createRoute, /company_id:\s*companyId/);
    assert.match(createRoute, /event_id:\s*eventId/);
    assert.match(createRoute, /owner_user_id:\s*sessionUser\.userId/);
  });

  it("applies current default behavior for status / rating / priority / temperature", () => {
    assert.match(createRoute, /let status: LeadStatus = "new"/);
    assert.match(createRoute, /let rating = 0/);
    assert.match(createRoute, /let temperature: LeadTemperature \| null = null/);
    assert.match(
      createRoute,
      /priorityScore[\s\S]*temperature[\s\S]*leadTemperatureToLegacyPriorityScore/
    );
  });

  it("emits a lead_captured workflow and supports idempotent replay with a cross-account guard", () => {
    assert.match(createRoute, /attemptLeadCapturedWorkflowEmit/);
    assert.match(createRoute, /const workflowSource = isBearer \? "mobile_capture" : "manual_create"/);
    assert.match(createRoute, /code === "23505" && clientId/);
    assert.match(createRoute, /idempotentReplay: true/);
    assert.match(createRoute, /Lead id conflicts with another account/);
  });

  it("enforces server-side authorization and event scope", () => {
    assert.match(createRoute, /canMutateExhibitorLeadsInContext/);
    assert.match(createRoute, /assertEventIdAccessibleForUser/);
    assert.match(createRoute, /\{ error: "Forbidden" \}, \{ status: 403 \}/);
  });
});

describe("lead create journey — documented default derivations", () => {
  it("derives the legacy priority_score the route stores from temperature (hot 85 / warm 50 / cold 20)", () => {
    assert.equal(leadTemperatureToLegacyPriorityScore("hot"), 85);
    assert.equal(leadTemperatureToLegacyPriorityScore("warm"), 50);
    assert.equal(leadTemperatureToLegacyPriorityScore("cold"), 20);
  });

  it("derives temperature from a legacy priority_score input", () => {
    assert.equal(legacyPriorityScoreToLeadTemperature(85), "hot");
    assert.equal(legacyPriorityScoreToLeadTemperature(50), "warm");
    assert.equal(legacyPriorityScoreToLeadTemperature(10), "cold");
  });
});

// Live-DB round-trip: persists a scoped, tagged lead and proves cleanup. Opt-in; the auth'd
// route itself is covered by the Playwright /e2e lane.
const env = resolveJourneyEnv();
describe(
  "lead create journey — live persistence & scope round-trip",
  { skip: env.enabled ? false : `live-DB disabled: ${env.reason}` },
  () => {
    const runId = createTestRunId();
    const registry = new JourneyCleanupRegistry();

    after(async () => {
      await registry.cleanup();
    });

    it("persists a scoped, traceable lead and reads it back through the leads table", async () => {
      const client = getJourneySupabase(env);
      const created = await createTestLead(
        client,
        {
          testRunId: runId,
          companyId: env.companyId,
          eventId: env.eventId,
          fields: { rating: 3, status: "new" },
        },
        registry
      );
      assertBelongsToTestRun(created, runId);
      assertScopedToCompany(created, env.companyId);

      const { data, error } = await (
        client as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (col: string, val: unknown) => {
                maybeSingle: () => Promise<{ data: any; error: unknown }>;
              };
            };
          };
        }
      )
        .from("leads")
        .select("id, company_id, event_id, full_name, status, rating")
        .eq("id", created.id)
        .maybeSingle();
      assert.equal(error, null);
      assert.ok(data, "expected created lead to be readable");
      assert.equal(String(data.company_id), env.companyId);
      assert.equal(data.status, "new");

      const outcome = await registry.cleanup();
      assert.equal(outcome.failed, 0);
    });
  }
);
