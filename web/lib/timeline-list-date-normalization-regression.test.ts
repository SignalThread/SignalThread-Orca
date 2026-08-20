import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeTimelineDateInput,
  normalizeTimelineDatePatch,
} from "@/lib/timeline/date-normalization";

const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");
const listSource = readFileSync("app/(shell)/timeline/_components/TimelineListView.tsx", "utf8");
const schemaSource = readFileSync("lib/timeline/types.ts", "utf8");

test("timeline date normalizer preserves date-only payloads", () => {
  assert.equal(normalizeTimelineDateInput("2026-03-09"), "2026-03-09");
  assert.equal(normalizeTimelineDateInput("2026-03-09T00:00:00.000Z"), "2026-03-09");
});

test("timeline date normalizer converts display dates without timezone drift", () => {
  assert.equal(normalizeTimelineDateInput("Mar 9, 2026"), "2026-03-09");
  assert.equal(normalizeTimelineDateInput("September 15 2026"), "2026-09-15");
  assert.equal(normalizeTimelineDateInput("8/3/2026"), "2026-08-03");
});

test("timeline date patch normalizes only included date fields", () => {
  assert.deepEqual(normalizeTimelineDatePatch({ endDate: "Mar 9, 2026" }), { endDate: "2026-03-09" });
  assert.deepEqual(normalizeTimelineDatePatch({ title: "Updated", startDate: "" }), {
    title: "Updated",
    startDate: null,
  });
});

test("Roadmap list inline edits submit API date fields as YYYY-MM-DD", () => {
  assert.ok(listSource.includes('case "startDate"'), "Start Date field is handled");
  assert.ok(listSource.includes('return { startDate };'), "Start Date maps to API startDate");
  assert.ok(listSource.includes('case "endDate"'), "Due Date field is handled");
  assert.ok(listSource.includes('return { endDate };'), "Due Date maps to API endDate");
  assert.equal(listSource.includes('`${value}T00:00:00.000Z`'), false, "display edits must not submit ISO timestamps");
  assert.ok(pageSource.includes("normalizeTimelineDatePatch(patch)"), "parent save normalizes partial update payloads");
  assert.ok(schemaSource.includes('regex(/^\\d{4}-\\d{2}-\\d{2}$/'), "server schema remains date-only");
});

test("Roadmap inline validation errors are field-specific instead of generic", () => {
  assert.ok(pageSource.includes("getTimelineFieldErrors(payload)"), "API issues are parsed into field errors");
  assert.ok(pageSource.includes('field === "startDate" || field === "endDate"'), "date issue paths are recognized");
  assert.ok(pageSource.includes("error.fieldErrors = fieldErrors"), "structured field errors are attached to thrown save errors");
  assert.ok(listSource.includes("saveError?.fieldErrors"), "list cells consume structured field errors");
  assert.ok(listSource.includes("next.set(cellKey(itemId, errorField), message)"), "field errors are assigned to the matching cell");
});
