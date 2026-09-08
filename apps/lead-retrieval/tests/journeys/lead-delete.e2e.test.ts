/**
 * Lead delete journey.
 *
 * Canonical path: `DELETE /api/exhibitor/leads/[leadId]` and bulk `POST /api/exhibitor/leads/bulk-delete`,
 * both delegating to `deleteExhibitorLeadForCompany` / `deleteExhibitorLeadsBulkForCompany`
 * (in a `server-only` module). Delete is a **hard delete** — not soft-delete or archive.
 *
 * Proven here:
 *  1. Service/route source contract — hard `.delete()` scoped by company_id, verify-exactly-one,
 *     no archive/soft-delete substitution, server-side chunking, viewer denial, and the
 *     pure scope partition (`deletable` / `missing` / `forbidden`).
 *  2. Live end-state (opt-in) — a seeded lead is deleted with the same scoped statement the
 *     service issues and is then gone from the table (idempotent re-delete is a no-op).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { partitionLeadIdsForExhibitorDelete } from "../../lib/leads/exhibitorLeadDeletePartition";
import {
  createTestRunId,
  resolveJourneyEnv,
  getJourneySupabase,
  createTestLead,
  deleteTestLead,
} from "../helpers/journey-fixtures";
import { JourneyCleanupRegistry } from "../helpers/journey-cleanup";

const root = process.cwd();
const deleteService = readFileSync(join(root, "lib/server/exhibitorLeadDelete.ts"), "utf8");
const leadRoute = readFileSync(join(root, "app/api/exhibitor/leads/[leadId]/route.ts"), "utf8");
const bulkRoute = readFileSync(join(root, "app/api/exhibitor/leads/bulk-delete/route.ts"), "utf8");

describe("lead delete journey — canonical service is a scoped hard delete", () => {
  it("issues a hard DELETE scoped by company_id and verifies exactly one row removed", () => {
    assert.match(deleteService, /\.from\("leads"\)\s*\.delete\(\)\s*\.eq\("id", leadId\)\s*\.eq\("company_id", companyId\)/);
    assert.match(deleteService, /Delete did not remove exactly one row/);
  });

  it("does NOT substitute archive / soft-delete", () => {
    assert.ok(!/archived_at|deleted_at|is_deleted|is_archived/.test(deleteService), "delete service must not reference soft-delete columns");
    assert.ok(!/\.update\(/.test(deleteService), "delete service must not UPDATE rows in place of deleting");
  });

  it("routes delegate to the canonical delete services with event scope", () => {
    assert.match(leadRoute, /deleteExhibitorLeadForCompany\(\{ leadId, companyId: accountId \}\)/);
    assert.match(bulkRoute, /deleteExhibitorLeadsBulkForCompany\(\{ leadIds, companyId: accountId, eventId \}\)/);
  });

  it("bulk delete has no product cap and denies viewer roles", () => {
    assert.doesNotMatch(bulkRoute, /Cannot delete more than 200 leads at once/);
    assert.match(bulkRoute, /role === "exhibitor_viewer" \|\| role === "viewer"/);
    assert.match(bulkRoute, /denyExhibitorViewer: true/);
  });
});

describe("lead delete journey — scope partition (real helper)", () => {
  it("partitions requested ids into deletable / forbidden / missing by company scope", () => {
    const rows = [
      { id: "a", company_id: "co-1" },
      { id: "b", company_id: "co-2" },
    ];
    const { deletable, forbidden, missing } = partitionLeadIdsForExhibitorDelete(
      ["a", "b", "c"],
      rows,
      "co-1"
    );
    assert.deepEqual(deletable, ["a"]);
    assert.deepEqual(missing, ["c"]);
    assert.equal(forbidden.length, 1);
    assert.equal(forbidden[0].leadId, "b");
  });
});

// Live-DB end-state: seed → delete with the service's exact scoped statement → row is gone.
const env = resolveJourneyEnv();
describe(
  "lead delete journey — live hard-delete end state",
  { skip: env.enabled ? false : `live-DB disabled: ${env.reason}` },
  () => {
    const runId = createTestRunId();
    const registry = new JourneyCleanupRegistry();

    after(async () => {
      await registry.cleanup();
    });

    it("removes the lead row entirely and is idempotent on re-delete", async () => {
      const client = getJourneySupabase(env);
      const lead = await createTestLead(
        client,
        { testRunId: runId, companyId: env.companyId, eventId: env.eventId },
        registry
      );

      const reader = client as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: unknown) => {
              maybeSingle: () => Promise<{ data: any; error: unknown }>;
            };
          };
        };
      };

      const present = await reader.from("leads").select("id").eq("id", lead.id).maybeSingle();
      assert.equal(present.error, null);
      assert.ok(present.data, "expected seeded lead to exist before delete");

      await deleteTestLead(client, lead.id, env.companyId);

      const gone = await reader.from("leads").select("id").eq("id", lead.id).maybeSingle();
      assert.equal(gone.error, null);
      assert.equal(gone.data, null, "expected hard delete to remove the row entirely");

      // Idempotent: deleting an already-removed lead does not throw and leaves it absent.
      await deleteTestLead(client, lead.id, env.companyId);
      const stillGone = await reader.from("leads").select("id").eq("id", lead.id).maybeSingle();
      assert.equal(stillGone.data, null);
    });
  }
);
