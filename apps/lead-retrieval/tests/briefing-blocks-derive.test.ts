import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveBriefingBlocksFromMappedRow,
  mergeBriefingBlocksIntoContent,
  shouldRefreshBriefingBlocks,
} from "../lib/import-wizard/briefing-blocks-derive";
import { computeBriefingSourceFingerprint } from "../lib/import-wizard/briefing-source-fingerprint";
import type { BriefingStoredContent } from "../lib/import-wizard/briefing-content-json";

describe("deriveBriefingBlocksFromMappedRow", () => {
  it("builds company snapshot and talking points from mapped required fields only", () => {
    const headers = ["Name", "Email", "Title", "Co"];
    const cells = ["Pat Lee", "p@ac.me", "VP Eng", "Acme"];
    const sel = {
      "0": "full_name",
      "1": "email",
      "2": "job_title",
      "3": "company_text",
    };
    const d = deriveBriefingBlocksFromMappedRow(cells, headers, sel);
    assert.equal(d.companySnapshot.name, "Acme");
    assert.match(d.companySnapshot.tagline, /Pat Lee/);
    assert.match(d.companySnapshot.tagline, /VP Eng/);
    assert.equal(d.companySnapshot.quote, "");
    assert.ok(d.talkingPoints.length >= 3);
    assert.ok(d.whyHere.length === 0);
  });

  it("adds whyHere lines only from optional mapped fields with values", () => {
    const headers = ["S", "F"];
    const cells = ["active", "2026-01-01"];
    const sel = {
      "0": "status",
      "1": "follow_up_date",
    };
    const d = deriveBriefingBlocksFromMappedRow(cells, headers, sel);
    assert.equal(d.whyHere.length, 2);
    assert.ok(d.whyHere[0]!.includes("Status in source data"));
  });

  it("does not invent company facts: empty optional snapshot fields when absent", () => {
    const headers = ["N", "E", "T", "C"];
    const cells = ["x", "y@z.com", "t", "co"];
    const sel = {
      "0": "full_name",
      "1": "email",
      "2": "job_title",
      "3": "company_text",
    };
    const d = deriveBriefingBlocksFromMappedRow(cells, headers, sel);
    assert.equal(d.companySnapshot.headcount, "");
    assert.equal(d.companySnapshot.hq, "");
    assert.equal(d.companySnapshot.quote, "");
  });
});

describe("mergeBriefingBlocksIntoContent + refresh", () => {
  it("preserves unrelated keys and sets meta fingerprint", () => {
    const prev: BriefingStoredContent = {
      questionsToAsk: ["Q1"],
      competitorContext: "x",
    };
    const derived = deriveBriefingBlocksFromMappedRow(
      ["A", "a@b.co", "T", "Co"],
      ["a", "b", "c", "d"],
      { "0": "full_name", "1": "email", "2": "job_title", "3": "company_text" }
    );
    const fp = "abc123";
    const merged = mergeBriefingBlocksIntoContent(prev, derived, fp);
    assert.deepEqual(merged.questionsToAsk, ["Q1"]);
    assert.equal(merged.competitorContext, "x");
    assert.equal(merged.meta?.sourceFingerprint, fp);
    assert.equal(merged.meta?.blocksVersion, 1);
  });

  it("shouldRefreshBriefingBlocks when fingerprint mismatches", () => {
    const stored: BriefingStoredContent = { meta: { sourceFingerprint: "old", blocksVersion: 1 } };
    assert.equal(shouldRefreshBriefingBlocks(stored, "new"), true);
    assert.equal(shouldRefreshBriefingBlocks(stored, "old"), false);
  });

  it("reuses persisted shape: same cells+mapping yields same fingerprint and skip refresh", () => {
    const cells = ["P", "p@x.com", "Eng", "Acme"];
    const headers = ["a", "b", "c", "d"];
    const sel = { "0": "full_name", "1": "email", "2": "job_title", "3": "company_text" };
    const fp = computeBriefingSourceFingerprint(cells, headers, sel);
    const derived = deriveBriefingBlocksFromMappedRow(cells, headers, sel);
    const merged = mergeBriefingBlocksIntoContent({}, derived, fp);
    assert.equal(shouldRefreshBriefingBlocks(merged, fp), false);
  });
});
