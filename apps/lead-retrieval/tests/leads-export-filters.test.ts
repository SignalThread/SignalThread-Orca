import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExportFilters } from "../lib/server/leads/leadsExportFiltersPure";

describe("parseExportFilters", () => {
  it("parses q and valid status", () => {
    const u = new URL("https://x.test/api?status=new&q=acme%20corp");
    const f = parseExportFilters(u.searchParams);
    assert.equal(f.status, "new");
    assert.equal(f.q, "acme corp");
    assert.equal(f.leadIds, null);
  });

  it("ignores invalid status values (no filter)", () => {
    const u = new URL("https://x.test/api?status=invalid");
    const f = parseExportFilters(u.searchParams);
    assert.equal(f.status, null);
  });

  it("accepts follow_up and closed", () => {
    assert.equal(parseExportFilters(new URL("https://x.test/?status=follow_up").searchParams).status, "follow_up");
    assert.equal(parseExportFilters(new URL("https://x.test/?status=closed").searchParams).status, "closed");
  });
});
