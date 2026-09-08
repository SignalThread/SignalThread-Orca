import test from "node:test";
import assert from "node:assert/strict";
import { orderedSelectedAudienceEntries } from "../lib/campaigns/orderedSelectedAudienceLeads";

test("orderedSelectedAudienceEntries preserves recipient order and enriches from catalog", () => {
  const recipients = [
    { lead_id: "b", name: "B", company: "Co", role: "r" },
    { lead_id: "a", name: "A", company: "Co2", role: "r2" }
  ];
  const catalog = [
    {
      id: "b",
      full_name: "Bee Name",
      email: "b@x.com",
      company: "Bee Co",
      role: "VP"
    },
    {
      id: "a",
      full_name: "Ay Name",
      email: null,
      company: "Ay Co",
      role: "Eng"
    }
  ];
  const rows = orderedSelectedAudienceEntries(recipients, catalog);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, "lead");
  if (rows[0].kind === "lead") {
    assert.equal(rows[0].leadId, "b");
    assert.equal(rows[0].lead.full_name, "Bee Name");
    assert.equal(rows[0].lead.email, "b@x.com");
  }
  assert.equal(rows[1].kind, "lead");
  if (rows[1].kind === "lead") {
    assert.equal(rows[1].leadId, "a");
  }
});

test("orderedSelectedAudienceEntries uses fallback when lead not in catalog", () => {
  const recipients = [{ lead_id: "x", name: "Only Name", company: "C", role: "R" }];
  const rows = orderedSelectedAudienceEntries(recipients, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "fallback");
  if (rows[0].kind === "fallback") {
    assert.equal(rows[0].leadId, "x");
    assert.equal(rows[0].name, "Only Name");
  }
});
