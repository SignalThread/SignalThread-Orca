import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx", "utf8");
const coordinator = readFileSync("lib/fnb-autosave-coordinator.ts", "utf8");
const service = readFileSync("lib/fnb-catalog.ts", "utf8");

test("F&B planner uses one autosave coordinator and removes its competing Save controls", () => {
  assert.match(workspace, /useFnbAutosaveCoordinator/);
  assert.match(workspace, /showSave=\{activeTab !== "fnb" && activeTab !== "show-flow"\}/);
  assert.doesNotMatch(workspace, /function saveFnbAssignment/);
  assert.doesNotMatch(workspace, /function saveFnbPlan/);
});

test("assignment drafts debounce, flush on blur, and send canonical assignment payloads", () => {
  assert.match(workspace, /scheduleFnbAssignmentAutosave\(assignment\.id, fnbAssignmentAutosavePayload\(assignment\), immediate\)/);
  assert.match(workspace, /onBlur=\{\(\) => flushFnbAssignmentAutosave\(assignment\.id\)\}/);
  assert.match(workspace, /manualPriceCents: assignment\.manualPriceCents/);
  assert.match(workspace, /taxes: assignment\.taxes\.map/);
});

test("rate autosave refreshes canonical assignment and linked-budget state", () => {
  assert.match(workspace, /scheduleFnbPlanAutosave\(`plan:\$\{selectedFnbSessionId\}`/);
  assert.match(workspace, /await loadFnbAssignments\(\)/);
  assert.match(service, /syncedBudgetLineItem: row\.budgetLineItem/);
});

test("autosave serializes requests and rejects stale results", () => {
  assert.match(coordinator, /Serializes all F&B writes/);
  assert.match(coordinator, /runningRef\.current/);
  assert.match(coordinator, /revisionsRef\.current\.get\(next\.key\) === next\.revision/);
  assert.match(coordinator, /window\.clearTimeout\(existingTimer\)/);
  assert.match(coordinator, /for \(const timer of timersRef\.current\.values\(\)\) window\.clearTimeout\(timer\)/);
});

test("canonical F&B budget sync updates forecast without changing actual spend", () => {
  const syncStart = service.indexOf("async function syncAssignmentBudgetLine");
  const syncBody = service.slice(syncStart, syncStart + 4000);
  assert.match(syncBody, /forecastCents: calculation\.totalCents \?\? 0/);
  assert.match(syncBody, /budgetLineItem\.update\([\s\S]*data: budgetData/);
  assert.match(syncBody, /budgetLineItem\.create\([\s\S]*\.\.\.budgetData,[\s\S]*actualCents: 0/);
  assert.match(syncBody, /sessionFnbCatalogAssignment\.update[\s\S]*budgetLineItemId/);
});
