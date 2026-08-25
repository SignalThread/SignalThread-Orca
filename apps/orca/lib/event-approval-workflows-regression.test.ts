import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("test-fixtures/legacy-orca-migrations/20260716130000_add_event_approval_workflow_settings/migration.sql", "utf8");
const settingsPage = readFileSync("app/(shell)/events/[eventId]/settings/page.tsx", "utf8");
const settingsHub = readFileSync("app/(shell)/events/[eventId]/settings/_components/event-settings-hub.tsx", "utf8");
const eventRoute = readFileSync("app/api/events/[eventId]/route.ts", "utf8");
const budgetService = readFileSync("src/server/services/budget.ts", "utf8");
const documentService = readFileSync("src/server/services/documents.ts", "utf8");
const budgetUi = readFileSync("app/(shell)/budgets/_components/full-budget-grid.tsx", "utf8");
const documentsUi = readFileSync("app/(shell)/events/[eventId]/docs/_components/event-docs-page.tsx", "utf8");

test("Event approval workflows persist enabled by default for existing events", () => {
  assert.match(schema, /budgetApprovalsEnabled\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /documentApprovalsEnabled\s+Boolean\s+@default\(true\)/);
  assert.match(migration, /ADD COLUMN "budgetApprovalsEnabled" BOOLEAN NOT NULL DEFAULT true/);
  assert.match(migration, /ADD COLUMN "documentApprovalsEnabled" BOOLEAN NOT NULL DEFAULT true/);
});

test("settings render both persisted workflow toggles and save using the canonical event PATCH", () => {
  assert.match(settingsPage, /initialApprovalWorkflows/);
  assert.match(settingsHub, /Approval workflows/);
  assert.match(settingsHub, /Budget approvals/);
  assert.match(settingsHub, /Document approvals/);
  assert.match(settingsHub, /role="switch"/);
  assert.match(settingsHub, /Changes save immediately\./);
  assert.match(settingsHub, /fetch\(`\/api\/events\/\$\{eventId\}`/);
  assert.match(settingsHub, /router\.refresh\(\)/);
  assert.match(eventRoute, /budgetApprovalsEnabled must be a boolean/);
  assert.match(eventRoute, /documentApprovalsEnabled must be a boolean/);
  assert.match(eventRoute, /requireEventRouteAccess\(nextRequest, eventId, "write"\)/);
});

test("disabled workflows hide new approval actions and block direct submission creation", () => {
  assert.match(budgetUi, /budgetApprovalsEnabled/);
  assert.match(budgetUi, /showSubmitAction = budgetApprovalsEnabled/);
  assert.match(budgetUi, /budget && budgetApprovalsEnabled/);
  assert.match(budgetService, /Budget approvals are disabled for this event/);
  assert.match(documentService, /Document approvals are disabled for this event/);
  assert.match(documentsUi, /documentApprovalsEnabled && selectedDocument\.status === "DRAFT"/);
  assert.match(documentsUi, /if \(!documentApprovalsEnabled \|\| !selectedEventId\) return;/);
});

test("settings auditing carries the prior and next approval values through Event Activity", () => {
  const eventsService = readFileSync("lib/events.ts", "utf8");
  assert.match(eventsService, /budgetApprovalsEnabled: "Budget approvals"/);
  assert.match(eventsService, /documentApprovalsEnabled: "Document approvals"/);
  assert.match(eventsService, /recordEventActivity\(tx/);
  assert.match(eventsService, /changes,/);
});
