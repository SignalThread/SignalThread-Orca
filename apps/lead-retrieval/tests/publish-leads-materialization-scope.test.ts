import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Source contract for the canonical publish → leads materialization
 * (`materializeImportedLeadsFromBatch`). The service is `server-only`, so this proves the
 * scope/publish gates and per-lead scoping by reading the canonical source. Behavioral briefing
 * linkage is covered by publish-materialization-briefing-linkage.test.ts.
 */
const src = readFileSync(
  join(process.cwd(), "lib/server/import-wizard/publish-leads-materialization.ts"),
  "utf8"
);

describe("publish materialization — scope + publish gates", () => {
  it("rejects a batch that does not exist", () => {
    assert.match(src, /if \(batchErr \|\| !batch\)\s*\{[\s\S]*?throw new Error\("batch_not_found"\)/);
  });

  it("rejects publishing another tenant's batch (cross-company)", () => {
    assert.match(src, /if \(batch\.company_id !== companyId\)\s*\{[\s\S]*?throw new Error\("batch_company_mismatch"\)/);
  });

  it("refuses to materialize a batch that is not in the published state", () => {
    assert.match(src, /if \(batch\.status !== "published"\)\s*\{[\s\S]*?throw new Error\("batch_not_published"\)/);
  });

  it("loads the batch with its company_id/status before any lead insert (scope before write)", () => {
    const batchLoadAt = src.indexOf('.from("import_batches")');
    const leadInsertAt = src.indexOf('.from("leads")');
    assert.ok(batchLoadAt >= 0 && leadInsertAt >= 0 && batchLoadAt < leadInsertAt);
  });
});

describe("publish materialization — published leads are scoped to company/event/owner", () => {
  it("fails closed when no event scope is supplied", () => {
    assert.match(src, /if \(!eventId\)\s*\{\s*throw new Error\("missing_event_scope"\)/);
  });

  it("uses the shared name resolver so first/last mappings materialize into the canonical full_name field", () => {
    assert.match(src, /import \{ resolveImportedLeadName \} from "@\/lib\/import-wizard\/lead-import-name"/);
    assert.match(src, /const fn = resolveImportedLeadName\(row, selections\)/);
  });

  it("inserts each lead into the canonical leads table scoped to the caller's company", () => {
    assert.match(src, /\.from\("leads"\)\s*\.insert\(insertRow as never\)/);
    assert.match(src, /company_id:\s*companyId/);
    assert.match(src, /owner_user_id:\s*ownerUserId/);
    assert.match(src, /event_id:\s*eventId/);
  });

  it("derives status/priority from the mapped row rather than hardcoding a final state", () => {
    assert.match(src, /const status = parseLeadStatus\(canonicalValueForRow\(row\.cells, selections, "status"\)\)/);
    assert.match(src, /priority_score:\s*priorityScore/);
    assert.match(src, /temperature:\s*priorityScoreRaw\.trim\(\)\s*\?\s*legacyPriorityScoreToLeadTemperature\(priorityScore\)/);
  });

  it("emits the lead-captured workflow after the lead row is inserted", () => {
    const insertAt = src.indexOf(".insert(insertRow");
    const emitCallAt = src.indexOf("await attemptWorkflowEmitFn(");
    assert.ok(insertAt >= 0 && emitCallAt >= 0 && insertAt < emitCallAt, "workflow emit must follow the real insert");
  });
});
