import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { assertSecurityComplianceClient, SecurityComplianceError, summarizeSecurityComplianceReadiness } from "./security-compliance";

const route = readFileSync(new URL("../app/api/events/[eventId]/security-compliance/route.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("./security-compliance.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../app/(shell)/events/[eventId]/security-compliance/security-compliance-workspace.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", import.meta.url), "utf8");

test("generated Prisma client contains the SecurityComplianceRecord model", () => {
  assert.equal(Prisma.ModelName.SecurityComplianceRecord, "SecurityComplianceRecord");
});

test("an out-of-date generated client fails explicitly instead of throwing an opaque TypeError", () => {
  assert.throws(() => assertSecurityComplianceClient({}), (error: unknown) => (
    error instanceof SecurityComplianceError && error.status === 503 && error.message.includes("generated data client is out of date")
  ));
});

test("readiness separates ready, incomplete, overdue, and at-risk records", () => {
  const summary = summarizeSecurityComplianceReadiness([
    { status: "APPROVED", dueDate: "2025-01-01" }, { status: "CONFIRMED", dueDate: null },
    { status: "IN_PROGRESS", dueDate: "2027-01-01" }, { status: "NEEDS_REVIEW", dueDate: "2025-01-01" },
    { status: "AT_RISK", dueDate: null },
  ], new Date("2026-08-22T12:00:00.000Z"));
  assert.deepEqual(summary, { ready: 2, needsWork: 1, atRisk: 2 });
});

test("routes enforce event access and report server failures", () => {
  assert.match(route, /requireEventRouteAccess\(request, eventId, "read"\)/);
  assert.match(route, /requireEventRouteAccess\(request, eventId, "write"\)/);
  assert.match(route, /security-compliance\.request\.failed/);
  assert.match(service, /where: \{ id, eventId \}/);
  assert.match(service, /generated data client is out of date/);
});

test("workspace follows event module standards and has no incident capability", () => {
  assert.match(workspace, /EventModuleHeader/);
  assert.match(workspace, /Overdue \/ at risk/);
  assert.match(workspace, /role="dialog"/);
  assert.match(shell, /label: "Onsite"[\s\S]*label: "Security & Compliance"/);
  assert.doesNotMatch(service, /INCIDENT/);
});
