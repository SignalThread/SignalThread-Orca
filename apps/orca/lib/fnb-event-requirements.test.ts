import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("lib/fnb-event-requirements.ts", "utf8");
const plannerService = readFileSync("lib/fnb-event-planner.ts", "utf8");
const workspace = readFileSync(
  "app/(shell)/events/[eventId]/matrix/fnb/_components/fnb-planner-workspace.tsx",
  "utf8",
);
const safetyService = readFileSync("lib/session-fnb-safety.ts", "utf8");

test("requirements read the canonical record and reuse the canonical safety rule", () => {
  // SessionFnbRequirement is the one requirement store; no parallel table is introduced.
  assert.match(service, /prisma\.sessionFnbRequirement\.findMany/);
  assert.match(service, /getSessionFnbSafetySummary/);
  assert.doesNotMatch(service, /assessMenuCompatibility/);
  assert.doesNotMatch(service, /\.create\(|\.upsert\(|\.update\(/);
});

test("every requirement carries the scope, evidence, owner, and next action a planner needs", () => {
  for (const field of [
    "quantity",
    "status",
    "result",
    "cause",
    "nextAction",
    "ownerLabel",
    "lastUpdatedAt",
    "lastUpdatedByLabel",
    "menuEvidence",
    "href",
  ]) {
    assert.match(service, new RegExp(`\\b${field}\\b`), field);
  }
  for (const scopeField of ["functionName", "functionTypeLabel", "date", "startTime", "location"]) {
    assert.match(service, new RegExp(`\\b${scopeField}\\b`), scopeField);
  }
});

test("requirement status uses the same three states as function readiness", () => {
  assert.match(service, /FnbRequirementStatus = "verified" \| "needsWork" \| "blocked"/);
  assert.match(plannerService, /FnbFunctionReadinessState = "ready" \| "needsWork" \| "blocked"/);
});

test("settled dispositions do not count as outstanding work", () => {
  // COMPLETE and NOT_NEEDED resolve to verified so they cannot inflate the blocked count.
  assert.match(service, /RequirementDisposition\.NOT_NEEDED[\s\S]{0,240}status: "verified"/);
  assert.match(service, /RequirementDisposition\.COMPLETE[\s\S]{0,240}status: "verified"/);
  assert.match(service, /RequirementDisposition\.MISSING[\s\S]{0,240}status: "blocked"/);
});

test("a function with no assigned menu blocks rather than silently passing", () => {
  assert.match(service, /!input\.hasMenu[\s\S]{0,200}status: "blocked"/);
  assert.match(service, /No menu assigned to evaluate/);
});

test("one verified item satisfies a requirement even when other items are silent", () => {
  assert.match(service, /pairs\.some\(\(pair\) => pair\.outcome === "VERIFIED_MATCH"\)\s*\?\s*"VERIFIED_MATCH"/);
});

test("accommodations are servings, explicitly not a count of distinct people", () => {
  assert.match(service, /outstandingAccommodations/);
  assert.match(service, /NOT a count of distinct people/);
  assert.match(workspace, /not a count of people/);
  // The outstanding total excludes settled requirements.
  assert.match(service, /const unsettled = requirements\.filter\(\(requirement\) => requirement\.status !== "verified"\)/);
});

test("requirement scope is presented before status so a Breakfast requirement never reads event-wide", () => {
  assert.match(workspace, /entry\.scope\.functionName/);
  assert.match(workspace, /Open \{entry\.scope\.functionName\} in F&amp;B Planner/);
});

test("requirement counts are interactive filters, not inert metrics", () => {
  assert.match(workspace, /setRequirementFilter\(\(current\) => \(current === state \? "all" : state\)\)/);
  assert.match(workspace, /aria-pressed=\{requirementFilter === state\}/);
  assert.match(workspace, /setReadinessFilter\(\(current\) => \(current === state \? "all" : state\)\)/);
  assert.match(workspace, /aria-pressed=\{readinessFilter === state\}/);
});

test("menu evidence is inspectable per requirement with an expand control", () => {
  assert.match(workspace, /aria-expanded=\{expanded\}/);
  assert.match(workspace, /Menu evidence \(\$\{entry\.menuEvidence\.length\}\)/);
  assert.match(workspace, /No assigned menu item has been evaluated against this requirement\./);
});

test("catalog deep links survived the Menus retirement", () => {
  assert.doesNotMatch(safetyService, /\/fnb-catalog\?item=/);
  assert.match(safetyService, /\/matrix\/fnb\?item=/);
});
