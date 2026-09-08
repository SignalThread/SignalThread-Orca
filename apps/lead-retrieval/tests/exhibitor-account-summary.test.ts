import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getExhibitorAccountSummaryForCompany } from "@/lib/data/exhibitor-account-summary-core";

type CountResult = { count: number | null; error: { message: string } | null };

type RecordedQuery = {
  table: string;
  filters: Array<[method: string, ...args: unknown[]]>;
};

/**
 * Minimal chainable supabase count-client stub. `leads` results are consumed in
 * call order (total, hot, follow-ups) matching the canonical Promise.all order.
 */
function mockCountClient(config: { leads: CountResult[]; licenses: CountResult }) {
  const queries: RecordedQuery[] = [];
  let leadsCallIndex = 0;
  return {
    queries,
    from(table: string) {
      const record: RecordedQuery = { table, filters: [] };
      queries.push(record);
      const result =
        table === "leads" ? config.leads[leadsCallIndex++] : config.licenses;
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "neq", "is", "gte", "lte", "not"]) {
        chain[method] = (...args: unknown[]) => {
          if (method !== "select") record.filters.push([method, ...args]);
          return chain;
        };
      }
      chain.then = (
        resolve: (value: CountResult) => unknown,
        reject: (reason?: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject);
      return chain;
    }
  };
}

const okCount = (count: number): CountResult => ({ count, error: null });
const errCount = (): CountResult => ({ count: null, error: { message: "boom" } });

describe("getExhibitorAccountSummaryForCompany — canonical values", () => {
  it("returns hot leads, follow-ups due, and active licenses from the count queries", async () => {
    const client = mockCountClient({
      leads: [okCount(42), okCount(7), okCount(3)],
      licenses: okCount(2)
    });
    const result = await getExhibitorAccountSummaryForCompany(client, "co-1", "2026-07-20");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.summary, {
        totalLeads: 42,
        hotLeads: 7,
        followUps: 3,
        activeLicenseCount: 2
      });
    }
  });

  it("scopes every leads query by company_id and licenses by exhibitor_company_id", async () => {
    const client = mockCountClient({
      leads: [okCount(0), okCount(0), okCount(0)],
      licenses: okCount(0)
    });
    await getExhibitorAccountSummaryForCompany(client, "co-9", "2026-07-20");

    const leadQueries = client.queries.filter((q) => q.table === "leads");
    assert.equal(leadQueries.length, 3);
    for (const q of leadQueries) {
      assert.ok(
        q.filters.some(([m, col, v]) => m === "eq" && col === "company_id" && v === "co-9"),
        "each leads query must be company-scoped"
      );
    }

    const hotQuery = leadQueries.find((q) =>
      q.filters.some(([m, col, v]) => m === "eq" && col === "temperature" && v === "hot")
    );
    assert.ok(hotQuery, "hot leads use the canonical temperature=hot definition");

    const followUpQuery = leadQueries.find((q) =>
      q.filters.some(([m, col]) => m === "lte" && col === "follow_up_date")
    );
    assert.ok(followUpQuery, "follow-ups use the canonical follow_up_date <= today definition");
    assert.ok(
      followUpQuery.filters.some(
        ([m, col, v]) => m === "lte" && col === "follow_up_date" && v === "2026-07-20"
      ),
      "the provided today boundary is applied"
    );

    const licenseQuery = client.queries.find((q) => q.table === "licenses");
    assert.ok(licenseQuery);
    assert.ok(
      licenseQuery.filters.some(
        ([m, col, v]) => m === "eq" && col === "exhibitor_company_id" && v === "co-9"
      )
    );
    assert.ok(
      licenseQuery.filters.some(([m, col, v]) => m === "eq" && col === "status" && v === "active")
    );
  });

  it("treats null counts without errors as zero", async () => {
    const client = mockCountClient({
      leads: [
        { count: null, error: null },
        { count: null, error: null },
        { count: null, error: null }
      ],
      licenses: { count: null, error: null }
    });
    const result = await getExhibitorAccountSummaryForCompany(client, "co-1", "2026-07-20");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.summary, {
        totalLeads: 0,
        hotLeads: 0,
        followUps: 0,
        activeLicenseCount: 0
      });
    }
  });
});

describe("getExhibitorAccountSummaryForCompany — failure honesty", () => {
  it("reports ok:false instead of fabricating zeros when a leads query fails", async () => {
    const client = mockCountClient({
      leads: [okCount(42), errCount(), okCount(3)],
      licenses: okCount(2)
    });
    const result = await getExhibitorAccountSummaryForCompany(client, "co-1", "2026-07-20");
    assert.deepEqual(result, { ok: false });
    assert.equal("summary" in result, false, "a failed summary must not carry values");
  });

  it("reports ok:false when the licenses query fails", async () => {
    const client = mockCountClient({
      leads: [okCount(1), okCount(1), okCount(1)],
      licenses: errCount()
    });
    const result = await getExhibitorAccountSummaryForCompany(client, "co-1", "2026-07-20");
    assert.deepEqual(result, { ok: false });
  });

  it("reports ok:false for a blank company id without issuing any queries", async () => {
    const client = mockCountClient({
      leads: [okCount(1), okCount(1), okCount(1)],
      licenses: okCount(1)
    });
    const result = await getExhibitorAccountSummaryForCompany(client, "   ", "2026-07-20");
    assert.deepEqual(result, { ok: false });
    assert.equal(client.queries.length, 0, "no unscoped queries may run");
  });
});
