/**
 * Lead update journey.
 *
 * Canonical path: `PATCH /api/exhibitor/leads/[leadId]`. The route normalizes the body with
 * the canonical `normalizeExhibitorLeadPatch`, scopes the update by company_id, reads the row
 * back, then re-evaluates qualification via `leadQualificationChanged` and emits a workflow
 * only when a qualification field changed.
 * Those two normalization/qualification helpers are pure and importable, so this journey drives
 * the *real* product logic; only the auth-gated route wrapper is asserted by source contract.
 *
 * Product reality proven here: the patch writes the **canonical `temperature`** field only — it
 * never writes `priority_score` (that column is a legacy bridge derived for presentation), and
 * `rating` is independent of temperature.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { normalizeExhibitorLeadPatch } from "../../lib/leads/exhibitorLeadPatch";
import { leadQualificationChanged } from "../../lib/leads/leadQualificationChange";
import { leadTemperatureToLegacyPriorityScore } from "../../lib/leads/temperature";
import {
  createTestRunId,
  resolveJourneyEnv,
  getJourneySupabase,
  createTestLead,
  updateTestLead,
} from "../helpers/journey-fixtures";
import { JourneyCleanupRegistry } from "../helpers/journey-cleanup";

const root = process.cwd();
const patchRoute = readFileSync(join(root, "app/api/exhibitor/leads/[leadId]/route.ts"), "utf8");

describe("lead update journey — canonical route contract", () => {
  it("normalizes via the canonical patch helper and scopes the update by company_id", () => {
    assert.match(patchRoute, /normalizeExhibitorLeadPatch\(jsonPayload\)/);
    assert.match(patchRoute, /\.update\(patch\)\s*\.eq\("id", leadId\)\s*\.eq\("company_id", accountId\)/);
  });

  it("reads the updated row back and emits workflows only for qualification changes", () => {
    assert.match(patchRoute, /\.update\(patch\)[\s\S]*\.select\([\s\S]*priority_score[\s\S]*\)/);
    assert.match(patchRoute, /leadQualificationChanged\(/);
    assert.match(patchRoute, /const workflowEmitResult = qualificationChanged[\s\S]*\? await attemptLeadCapturedWorkflowEmit/);
    assert.match(patchRoute, /source:\s*"qualification_save"/);
    assert.match(patchRoute, /skipped_non_qualification_patch/);
    assert.doesNotMatch(patchRoute, /lead_profile_save/);
  });

  it("enforces authorization before writing", () => {
    assert.match(patchRoute, /canMutateExhibitorLeadsInContext/);
    assert.match(patchRoute, /\{ error: "Forbidden" \}, \{ status: 403 \}/);
  });
});

describe("lead update journey — canonical normalization (real helper)", () => {
  it("writes canonical temperature only (never priority_score) and clamps rating", () => {
    const { patch, error } = normalizeExhibitorLeadPatch({
      temperature: "hot",
      rating: 9,
      status: "follow_up",
      job_title: "VP Sales",
    });
    assert.equal(error, null);
    assert.ok(patch);
    assert.equal(patch!.temperature, "hot");
    assert.equal(patch!.rating, 5); // clamped 0..5
    assert.equal(patch!.status, "follow_up");
    assert.equal(patch!.job_title, "VP Sales");
    assert.equal("priority_score" in patch!, false);
  });

  it("maps a legacy priority_score input onto canonical temperature", () => {
    const { patch, error } = normalizeExhibitorLeadPatch({ priority_score: 80 });
    assert.equal(error, null);
    assert.equal(patch!.temperature, "hot"); // 80 >= 67 → hot
    assert.equal("priority_score" in patch!, false);
  });

  it("rejects invalid values and empty patches", () => {
    assert.ok(normalizeExhibitorLeadPatch({ status: "archived" }).error);
    assert.ok(normalizeExhibitorLeadPatch({ follow_up_date: "07/01/2026" }).error);
    assert.ok(normalizeExhibitorLeadPatch({ full_name: "   " }).error);
    assert.ok(normalizeExhibitorLeadPatch({}).error);
  });
});

describe("lead update journey — qualification change detection (real helper)", () => {
  it("flags rating / temperature / status changes and ignores profile-only edits", () => {
    assert.equal(
      leadQualificationChanged({ rating: 5 }, { rating: 1 }, { rating: 5 }),
      true
    );
    assert.equal(
      leadQualificationChanged({ status: "follow_up" }, { status: "new" }, { status: "follow_up" }),
      true
    );
    assert.equal(
      leadQualificationChanged({ temperature: "warm" }, { temperature: "warm" }, { temperature: "warm" }),
      false
    );
    assert.equal(
      leadQualificationChanged({ job_title: "VP" }, { rating: 3 }, { rating: 3 }),
      false
    );
  });
});

// Live-DB round-trip: seed → apply the REAL normalized patch → read back → assert persistence.
const env = resolveJourneyEnv();
describe(
  "lead update journey — live persistence of editable fields",
  { skip: env.enabled ? false : `live-DB disabled: ${env.reason}` },
  () => {
    const runId = createTestRunId();
    const registry = new JourneyCleanupRegistry();

    after(async () => {
      await registry.cleanup();
    });

    it("persists normalized editable fields and reflects the canonical temperature update", async () => {
      const client = getJourneySupabase(env);
      const before = { rating: 1, temperature: "cold", status: "new" };
      const lead = await createTestLead(
        client,
        { testRunId: runId, companyId: env.companyId, eventId: env.eventId, fields: before },
        registry
      );

      const { patch, error: normErr } = normalizeExhibitorLeadPatch({
        temperature: "hot",
        rating: 5,
        status: "follow_up",
        follow_up_date: "2026-07-01",
        job_title: "VP Sales",
      });
      assert.equal(normErr, null);
      assert.ok(patch);
      await updateTestLead(client, lead.id, env.companyId, patch!);

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
        .select("id, temperature, rating, status, follow_up_date, job_title, priority_score")
        .eq("id", lead.id)
        .maybeSingle();
      assert.equal(error, null);
      assert.ok(data, "expected updated lead to be readable");
      assert.equal(data.temperature, "hot");
      assert.equal(Number(data.rating), 5);
      assert.equal(data.status, "follow_up");
      assert.equal(data.follow_up_date, "2026-07-01");
      assert.equal(data.job_title, "VP Sales");

      // Qualification changed (rating + temperature + status all moved).
      assert.equal(
        leadQualificationChanged(patch!, before, { rating: 5, temperature: "hot", status: "follow_up" }),
        true
      );
      // Presentation-derived legacy score for the new temperature (not written by the patch).
      assert.equal(leadTemperatureToLegacyPriorityScore("hot"), 85);

      const outcome = await registry.cleanup();
      assert.equal(outcome.failed, 0);
    });
  }
);
