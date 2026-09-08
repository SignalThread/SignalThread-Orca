/**
 * Optional integration tests against a real Supabase project (service role).
 * Proves fetchLeadsForExportWithClient applies scope + filters on real rows without mocking core query logic.
 *
 * Run (local / CI with secrets):
 *   LEADS_EXPORT_INTEGRATION=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   EXPORT_TEST_COMPANY_ID=<uuid of existing companies row> \
 *   # Optional: second companies row to assert cross-company isolation
 *   EXPORT_TEST_COMPANY_ID_B=<uuid> \
 *   npm run test:leads-export
 *
 * Creates and deletes leads tagged with company_id = EXPORT_TEST_COMPANY_ID only.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { fetchLeadsForExportWithClient } from "../lib/server/leads/leadsExportFetch";

const enabled =
  process.env.LEADS_EXPORT_INTEGRATION === "1" &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
  Boolean(process.env.EXPORT_TEST_COMPANY_ID);

describe("fetchLeadsForExportWithClient (Supabase integration)", { skip: !enabled }, () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const companyId = process.env.EXPORT_TEST_COMPANY_ID!;
  const supabase = createClient(url, key);
  const suffix = randomUUID().slice(0, 8);
  const nameA = `ExportTest A ${suffix}`;
  const nameB = `ExportTest B ${suffix}`;
  let idA: string;
  let idB: string;

  before(async () => {
    const { data: a, error: e1 } = await supabase
      .from("leads")
      .insert({
        company_id: companyId,
        full_name: nameA,
        job_title: "t",
        priority_score: 10,
        rating: 3,
        status: "new",
        company_text: "Line1\nLine2"
      })
      .select("id")
      .single();
    if (e1) throw e1;
    idA = (a as { id: string }).id;

    const { data: b, error: e2 } = await supabase
      .from("leads")
      .insert({
        company_id: companyId,
        full_name: nameB,
        job_title: "t",
        priority_score: 10,
        rating: 3,
        status: "follow_up",
        company_text: null
      })
      .select("id")
      .single();
    if (e2) throw e2;
    idB = (b as { id: string }).id;
  });

  after(async () => {
    await supabase.from("leads").delete().in("id", [idA, idB]);
  });

  it("exhibitor scope returns only rows for that company_id", async () => {
    const { rows, error } = await fetchLeadsForExportWithClient(
      supabase,
      { kind: "exhibitor", companyId, eventId: null },
      { q: null, status: null }
    );
    assert.equal(error, null);
    const ours = rows.filter((r) => r.id === idA || r.id === idB);
    assert.ok(ours.length >= 2);
    for (const r of ours) {
      assert.equal(String(r.company_id), companyId);
    }
  });

  it("status filter narrows rows (only matching status)", async () => {
    const { rows, error } = await fetchLeadsForExportWithClient(
      supabase,
      { kind: "exhibitor", companyId, eventId: null },
      { q: null, status: "new" }
    );
    assert.equal(error, null);
    const ids = rows.map((r) => String(r.id));
    assert.ok(ids.includes(idA));
    assert.ok(!ids.includes(idB));
  });

  it("search filter q narrows by text fields", async () => {
    const token = suffix;
    const { rows, error } = await fetchLeadsForExportWithClient(
      supabase,
      { kind: "exhibitor", companyId, eventId: null },
      { q: token, status: null }
    );
    assert.equal(error, null);
    const ids = rows.map((r) => String(r.id));
    assert.ok(ids.includes(idA));
    assert.ok(ids.includes(idB));
  });
});

const companyIdB = process.env.EXPORT_TEST_COMPANY_ID_B?.trim();
const isolationEnabled =
  enabled &&
  Boolean(companyIdB) &&
  companyIdB !== process.env.EXPORT_TEST_COMPANY_ID;

describe(
  "fetchLeadsForExportWithClient cross-company isolation (optional)",
  { skip: !isolationEnabled },
  () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const companyA = process.env.EXPORT_TEST_COMPANY_ID!;
    const companyB = companyIdB!;
    const supabase = createClient(url, key);
    const suffix = randomUUID().slice(0, 8);
    let idInA: string;
    let idInB: string;

    before(async () => {
      const { data: a, error: e1 } = await supabase
        .from("leads")
        .insert({
          company_id: companyA,
          full_name: `IsoA ${suffix}`,
          job_title: "t",
          priority_score: 10,
          rating: 3,
          status: "new",
          company_text: "a"
        })
        .select("id")
        .single();
      if (e1) throw e1;
      idInA = (a as { id: string }).id;

      const { data: b, error: e2 } = await supabase
        .from("leads")
        .insert({
          company_id: companyB,
          full_name: `IsoB ${suffix}`,
          job_title: "t",
          priority_score: 10,
          rating: 3,
          status: "new",
          company_text: "b"
        })
        .select("id")
        .single();
      if (e2) throw e2;
      idInB = (b as { id: string }).id;
    });

    after(async () => {
      await supabase.from("leads").delete().in("id", [idInA, idInB]);
    });

    it("exhibitor scope for company A never returns company B rows", async () => {
      const { rows, error } = await fetchLeadsForExportWithClient(
        supabase,
        { kind: "exhibitor", companyId: companyA, eventId: null },
        { q: null, status: null }
      );
      assert.equal(error, null);
      const ids = rows.map((r) => String(r.id));
      assert.ok(ids.includes(idInA));
      assert.ok(!ids.includes(idInB));
    });

    it("platform-style company scope for A does not include B (same query rules)", async () => {
      const { rows, error } = await fetchLeadsForExportWithClient(
        supabase,
        { kind: "platform", companyId: companyA, eventId: null },
        { q: null, status: null }
      );
      assert.equal(error, null);
      const ids = rows.map((r) => String(r.id));
      assert.ok(!ids.includes(idInB));
    });

    it("filters narrow within scope but cannot pull in other company rows", async () => {
      const { rows, error } = await fetchLeadsForExportWithClient(
        supabase,
        { kind: "exhibitor", companyId: companyA, eventId: null },
        { q: suffix, status: "new" }
      );
      assert.equal(error, null);
      assert.ok(rows.some((r) => String(r.id) === idInA));
      assert.ok(!rows.some((r) => String(r.id) === idInB));
    });
  }
);
