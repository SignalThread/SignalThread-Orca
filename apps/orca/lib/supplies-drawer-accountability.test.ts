import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const workspace = readFileSync(path.join(process.cwd(), "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-supplies-workspace.tsx"), "utf8");
const service = readFileSync(path.join(process.cwd(), "lib/supplies.ts"), "utf8");
const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(path.join(process.cwd(), "prisma/baseline/20260821120000_orca_clean_baseline/migration.sql"), "utf8");

test("Supplies uses an inline accountable table without a Supply drawer", () => {
  for (const heading of ["Supply", "Qty", "Responsible", "Need by", "Provided by", "Status", "Notes"]) assert.match(workspace, new RegExp(`"${heading}"`));
  assert.doesNotMatch(workspace, /"Attention"/);
  assert.doesNotMatch(workspace, /function CustomForm/);
  assert.match(workspace, /Fields save only when their row is saved/);
  assert.match(workspace, /Add from suggestions/);
  assert.doesNotMatch(workspace, /SupplyRequirementDrawer|BatchReviewDrawer|role="dialog"/);
});

test("responsibility is persisted, event-scoped, audited, and readiness-driving", () => {
  assert.match(schema, /responsibleUserId\s+String\?\s+@db\.Uuid/);
  assert.match(schema, /User\s+User\?\s+@relation\(fields: \[responsibleUserId\]/);
  assert.match(migration, /Supply responsible person must be an event member/);
  assert.match(service, /eventOwnerEligibilityWhere/);
  assert.match(service, /responsibleUserId: item\.responsibleUserId/);
  assert.match(service, /changes: patch/);
});

test("Budget is isolated from Supplies readiness", () => {
  assert.doesNotMatch(workspace, /Search all budget line items|New budget line & link/);
  assert.match(service, /category: \{ contains: "suppl", mode: "insensitive" \}/);
  assert.doesNotMatch(readFileSync(path.join(process.cwd(), "lib/supplies-domain.ts"), "utf8"), /budgetLineItem/);
});
