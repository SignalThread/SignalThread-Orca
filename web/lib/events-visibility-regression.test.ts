import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  canListOrganizationEvents,
  resolveActiveEventVisibilityWhere,
  resolveEventVisibility,
} from "./events";

const eventsServiceSource = readFileSync("lib/events.ts", "utf8");
const eventsRouteSource = readFileSync("app/api/events/route.ts", "utf8");
const eventsPageSource = readFileSync("app/(shell)/events/page.tsx", "utf8");
const eventLauncherSource = readFileSync("app/(shell)/dashboard/EventLauncher.tsx", "utf8");
const eventWorkspaceShellSource = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");
const useEventsDataSource = readFileSync("src/hooks/use-events-data.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("org portfolio owner/admin roles can list active-org events", () => {
  const orgRoleGateSource = sourceBetween(
    eventsServiceSource,
    "function canListOrganizationEvents",
    "export async function listEventsForUser",
  );

  assert.equal(canListOrganizationEvents(UserRole.SUPER_ADMIN), true);
  assert.equal(canListOrganizationEvents(UserRole.OWNER), true);
  assert.equal(canListOrganizationEvents(UserRole.ADMIN), true);
  assert.equal(canListOrganizationEvents(UserRole.MEMBER), false);
  assert.equal(canListOrganizationEvents(UserRole.VIEWER), false);
  assert.equal(orgRoleGateSource.includes("UserRole.OWNER"), true);
  assert.equal(orgRoleGateSource.includes("UserRole.ADMIN"), true);
  assert.equal(orgRoleGateSource.includes("UserRole.MEMBER"), false);
  assert.equal(orgRoleGateSource.includes("UserRole.VIEWER"), false);
});

test("canonical event visibility scopes org-wide roles to the active org", () => {
  for (const role of [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN]) {
    const visibility = resolveEventVisibility({
      userId: "user-1",
      role,
      orgId: "org-1",
    });

    assert.equal(visibility.mode, "ORG_WIDE");
    assert.deepEqual(visibility.where, { orgId: "org-1" });
  }
});

test("event-scoped viewer access still requires EventMember rows", () => {
  const visibility = resolveEventVisibility({
    userId: "user-1",
    role: UserRole.VIEWER,
    orgId: "org-1",
  });

  assert.equal(visibility.mode, "EVENT_MEMBER_SCOPED");
  assert.deepEqual(visibility.where, {
    orgId: "org-1",
    eventMembers: {
      some: {
        userId: "user-1",
      },
    },
  });
  assert.equal(eventsServiceSource.includes("orgId: input.orgId"), true);
  assert.equal(eventsServiceSource.includes("eventMembers"), true);
  assert.equal(eventsServiceSource.includes("some"), true);
  assert.equal(eventsServiceSource.includes("userId: input.userId"), true);
});

test("active event visibility layers canceled-event filtering onto the canonical scope", () => {
  const visibility = resolveActiveEventVisibilityWhere({
    userId: "user-1",
    role: UserRole.MEMBER,
    orgId: "org-1",
  });

  assert.equal(visibility.mode, "EVENT_MEMBER_SCOPED");
  assert.deepEqual(visibility.where, {
    orgId: "org-1",
    eventMembers: {
      some: {
        userId: "user-1",
      },
    },
    status: { not: "CANCELED" },
  });
});

test("/api/events passes resolved active org into the listing service", () => {
  assert.equal(eventsRouteSource.includes("const user = currentUserResult.user"), true);
  assert.equal(eventsRouteSource.includes("orgId: user.orgId"), true);
  assert.equal(eventsRouteSource.includes("applyActiveOrgCookie(response, user.activeOrgIdCookieToSet)"), true);
  assert.equal(eventsRouteSource.includes("event.list.resolved"), true);
  assert.equal(eventsRouteSource.includes("effectiveRole: user.role"), true);
  assert.equal(eventsRouteSource.includes("visibilityMode: visibility.mode"), true);
  assert.equal(eventsRouteSource.includes("returnedEventCount: events.length"), true);
  assert.equal(eventsRouteSource.includes("PLATFORM_CONTEXT_COOKIE_NAME"), true);
  assert.equal(eventsRouteSource.includes('response.headers.set("Cache-Control", "no-store")'), true);
});

test("Events page no longer relies on a hardcoded orgId query", () => {
  assert.equal(eventsPageSource.includes("const ORG_ID"), false);
  assert.equal(eventsPageSource.includes("/api/events?orgId="), false);
  assert.equal(eventsPageSource.includes('redirect("/dashboard")'), true);
  assert.equal(useEventsDataSource.includes('fetch("/api/events", { credentials: "include" })'), true);
});

test("event selector surfaces use the canonical event-list API without org query overrides", () => {
  assert.equal(eventLauncherSource.includes('fetch("/api/events"'), true);
  assert.equal(eventWorkspaceShellSource.includes('fetch("/api/events"'), true);
  assert.equal(eventLauncherSource.includes("/api/events?orgId="), false);
  assert.equal(eventWorkspaceShellSource.includes("/api/events?orgId="), false);
});
