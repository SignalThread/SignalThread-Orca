import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { partitionLeadIdsForExhibitorDelete } from "@/lib/leads/exhibitorLeadDeletePartition";

/**
 * Two-tenant isolation matrix: proves the canonical resource routes reject a *guessed* cross-tenant
 * ID by co-filtering the resource id with the caller's SESSION-derived tenant scope (company_id /
 * account_id), so a valid-format id belonging to another tenant never matches. Server-side is the
 * source of truth (these handlers are auth/`server-only`), so this reads the canonical route source.
 * Broader per-surface RBAC is covered by route-contracts.test.ts, access-matrix-surfaces.test.ts,
 * signal-scope-ownership.test.ts, and tests/journeys/rbac-scope.e2e.test.ts.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("cross-tenant isolation — resource detail routes pin session tenant scope", () => {
  it("lead detail route co-filters lead id with the session company", () => {
    const src = read("app/api/exhibitor/leads/[leadId]/route.ts");
    assert.match(src, /const accountId = String\(sessionUser\.companyId \?\? ""\)\.trim\(\)/);
    assert.match(src, /\.eq\("id", leadId\)\s*\.eq\("company_id", accountId\)/);
  });

  it("campaign detail route co-filters campaign id with the session company", () => {
    const src = read("app/api/campaigns/[campaignId]/route.ts");
    assert.match(src, /\.eq\("id", campaignId\)\s*\.eq\("company_id", sessionUser\.company_id\)/);
  });

  it("campaign messages + recipients routes resolve the campaign only within the session company", () => {
    for (const p of [
      "app/api/campaigns/[campaignId]/messages/route.ts",
      "app/api/campaigns/[campaignId]/recipients/route.ts",
    ]) {
      const src = read(p);
      assert.match(src, /getScopedCampaign\(campaignId, sessionUser\.company_id\)/, `${p} must scope the campaign to the session company`);
      assert.match(src, /\.eq\("id", campaignId\)\s*\.eq\("company_id", companyId\)/, `${p} helper must co-filter id + company`);
    }
  });

  it("document detail route co-filters document id with the session account", () => {
    const src = read("app/api/exhibitor/documents/[documentId]/route.ts");
    assert.match(src, /const accountId = String\(sessionUser\.company_id \?\? ""\)\.trim\(\)/);
    assert.match(src, /\.eq\("id", documentId\)\s*\.eq\("account_id", accountId\)/);
  });

  it("signal detail route enforces company ownership before mutating", () => {
    const src = read("app/api/signals/[signalId]/route.ts");
    assert.match(src, /signal\.company_id === eventContext\.companyId/);
  });
});

describe("cross-tenant isolation — bulk lead delete partitions by company (behavioral)", () => {
  it("never deletes another tenant's lead even when its id is supplied", () => {
    const rows = [
      { id: "lead-A", company_id: "tenant-A" },
      { id: "lead-B", company_id: "tenant-B" },
    ];
    // Tenant A attempts to delete both its own and tenant B's lead by guessed id.
    const { deletable, forbidden, missing } = partitionLeadIdsForExhibitorDelete(
      ["lead-A", "lead-B", "lead-unknown"],
      rows,
      "tenant-A"
    );
    assert.deepEqual(deletable, ["lead-A"]);
    assert.equal(forbidden.length, 1);
    assert.equal(forbidden[0].leadId, "lead-B");
    assert.deepEqual(missing, ["lead-unknown"]);
  });
});
