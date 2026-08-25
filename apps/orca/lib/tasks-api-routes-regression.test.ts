import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const TASK_ROUTE_ROOT = path.join(process.cwd(), "app/api/events/[eventId]/tasks");

function readTaskRoute(relativePath: string): string {
  const fullPath = path.join(TASK_ROUTE_ROOT, relativePath);
  assert.ok(existsSync(fullPath), `${relativePath} should exist`);
  return readFileSync(fullPath, "utf8");
}

function assertIncludes(source: string, expected: string, label: string): void {
  assert.ok(source.includes(expected), `${label} should include ${expected}`);
}

function assertRouteUsesAuthAndErrors(relativePath: string): void {
  const source = readTaskRoute(relativePath);
  assertIncludes(source, "requireRouteUser(request)", relativePath);
  assertIncludes(source, "toTaskRouteErrorResponse", relativePath);
  assertIncludes(source, "withApiRequestLogging", relativePath);
}

test("task API routes expose the Phase 2A service-backed capabilities", () => {
  const routeExpectations = [
    ["route.ts", ["listTasksForEvent", "createManualTask"]],
    ["[taskId]/route.ts", ["getTask", "updateTask"]],
    ["[taskId]/complete/route.ts", ["completeTask"]],
    ["[taskId]/block/route.ts", ["blockTask"]],
    ["[taskId]/reopen/route.ts", ["reopenTask"]],
    ["[taskId]/assign/route.ts", ["assignTask"]],
    ["[taskId]/comments/route.ts", ["addTaskComment"]],
    ["object/route.ts", ["listTasksForObject"]],
    ["[taskId]/links/route.ts", ["linkTaskToObject"]],
    ["[taskId]/watchers/route.ts", ["addTaskWatcher"]],
    ["[taskId]/watchers/[userId]/route.ts", ["removeTaskWatcher"]],
  ] as const;

  for (const [relativePath, functions] of routeExpectations) {
    const source = readTaskRoute(relativePath);
    assertRouteUsesAuthAndErrors(relativePath);
    assertIncludes(source, "@/src/server/services/tasks", relativePath);
    for (const fn of functions) {
      assertIncludes(source, fn, relativePath);
    }
  }
});

test("task route helper resolves authenticated users and validates object links before service calls", () => {
  const helper = readTaskRoute("_lib/route-helpers.ts");

  assertIncludes(helper, "resolveRequestUser(request)", "route helper");
  assertIncludes(helper, "TaskServiceError", "route helper");
  assertIncludes(helper, "TaskLinkObjectType", "route helper");
  assertIncludes(helper, "taskLinkSchema", "route helper");
  assertIncludes(helper, "z.nativeEnum(TaskLinkObjectType)", "route helper");
  assertIncludes(helper, "objectId: uuidSchema", "route helper");
});

test("assignee lookup route uses internal auth and event access without task mutation logic", () => {
  const source = readTaskRoute("assignees/route.ts");

  assertIncludes(source, "requireRouteUser(request)", "assignees route");
  assertIncludes(source, 'assertEventAccessForUser(eventId, auth.user, "read")', "assignees route");
  assertIncludes(source, "listEventAssignableUsers(eventId)", "assignees route");
  assert.equal(source.includes("assignTask"), false, "assignees route should not mutate tasks");
  assert.equal(source.includes("createManualTask"), false, "assignees route should not create tasks");
  assert.equal(source.includes("export const POST"), false, "assignees route should be read-only");
});

test("shared assignable user service keeps task assignee response fields available", () => {
  const source = readFileSync(path.join(process.cwd(), "src/server/services/event-assignable-users.ts"), "utf8");

  assertIncludes(source, "export async function listEventAssignableUsers", "assignable users service");
  assertIncludes(source, "name: user.name", "assignable users service");
  assertIncludes(source, "email: user.email", "assignable users service");
  assertIncludes(source, "role: user.eventMemberships[0]?.eventRole ?? user.role", "assignable users service");
});

test("task routes keep business logic in the service layer", () => {
  const routeFiles = [
    "route.ts",
    "[taskId]/route.ts",
    "[taskId]/complete/route.ts",
    "[taskId]/block/route.ts",
    "[taskId]/reopen/route.ts",
    "[taskId]/assign/route.ts",
    "[taskId]/comments/route.ts",
    "object/route.ts",
    "[taskId]/links/route.ts",
    "[taskId]/watchers/route.ts",
    "[taskId]/watchers/[userId]/route.ts",
  ];

  for (const relativePath of routeFiles) {
    const source = readTaskRoute(relativePath);
    assert.equal(source.includes("getPrisma"), false, `${relativePath} should not call Prisma directly`);
    assert.equal(source.includes("@prisma/client"), false, `${relativePath} should not import Prisma client directly`);
    assert.equal(source.includes("assertEventAccessForUser"), false, `${relativePath} should leave access checks to the service`);
  }
});

test("complete route does not mutate linked module source records", () => {
  const source = readTaskRoute("[taskId]/complete/route.ts");
  const forbiddenTerms = [
    "budget.",
    "document.",
    "timeline",
    "matrix",
    "seating",
    "speaker",
    "deadline",
    "update(",
    "upsert(",
    "delete(",
  ];

  for (const term of forbiddenTerms) {
    assert.equal(source.toLowerCase().includes(term), false, `complete route should not include ${term}`);
  }
});

test("task API routes do not introduce deferred Phase 2B or notification concepts", () => {
  const routeFiles = [
    "route.ts",
    "[taskId]/route.ts",
    "[taskId]/complete/route.ts",
    "[taskId]/block/route.ts",
    "[taskId]/reopen/route.ts",
    "[taskId]/assign/route.ts",
    "[taskId]/comments/route.ts",
    "object/route.ts",
    "assignees/route.ts",
    "[taskId]/links/route.ts",
    "[taskId]/watchers/route.ts",
    "[taskId]/watchers/[userId]/route.ts",
    "_lib/route-helpers.ts",
  ];
  const forbiddenTerms = [
    "sourceKey",
    "GENERATED",
    "RECONCILED",
    "TaskReminder",
    "TaskDependency",
    "TaskTemplate",
    "notification",
    "reminder",
    "dashboard",
  ];

  for (const relativePath of routeFiles) {
    const source = readTaskRoute(relativePath);
    for (const term of forbiddenTerms) {
      assert.equal(source.includes(term), false, `${relativePath} should not include ${term}`);
    }
  }
});
