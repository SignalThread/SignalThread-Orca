import test from "node:test";
import assert from "node:assert/strict";
import { applyUsersTableFilters } from "../lib/client/admin-users-filters";
import {
  ADMIN_USERS_ALL_EVENTS_ID,
  mergeMembershipAndPendingInvites,
  PLATFORM_WIDE_EVENT_ID
} from "../lib/data/platform-admin";
import type { PlatformUserOverview } from "../lib/data/platform-admin";

const sample: PlatformUserOverview[] = [
  {
    id: "u1",
    fullName: "Alice",
    email: "a@x.com",
    role: "platform_admin",
    eventId: PLATFORM_WIDE_EVENT_ID,
    exhibitorId: null,
    status: "active",
    rowSource: "platform_role"
  },
  {
    id: "u2",
    fullName: "Bob",
    email: "b@x.com",
    role: "exhibitor_admin",
    eventId: "e1",
    exhibitorId: "c1",
    status: "invited",
    rowSource: "membership"
  },
  {
    id: "u3",
    fullName: "Carol",
    email: "c@x.com",
    role: "viewer",
    eventId: "e2",
    exhibitorId: null,
    status: "inactive",
    rowSource: "membership"
  },
  {
    id: "u4",
    fullName: "Dan",
    email: "d@x.com",
    role: "viewer",
    eventId: "e1",
    exhibitorId: null,
    status: "invite_pending",
    rowSource: "invite_pending"
  },
  {
    id: "u5",
    fullName: "Zach",
    email: "zach@signalthread.ai",
    role: "exhibitor_admin",
    eventId: PLATFORM_WIDE_EVENT_ID,
    exhibitorId: "c1",
    status: "invite_pending",
    rowSource: "invite_pending"
  }
];

test("All events returns users across events while preserving exhibitor and role filters", () => {
  const out = applyUsersTableFilters(sample, {
    eventId: ADMIN_USERS_ALL_EVENTS_ID,
    exhibitorId: "c1",
    roleFilter: "exhibitor_admin",
    statusFilter: "all",
    search: ""
  });
  assert.deepEqual(out.map((row) => row.id), ["u2", "u5"]);
});

test("applyUsersTableFilters filters by role", () => {
  const out = applyUsersTableFilters(sample, {
    eventId: "e1",
    exhibitorId: "all",
    roleFilter: "platform_admin",
    statusFilter: "all",
    search: ""
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "u1");
});

test("applyUsersTableFilters keeps platform admins visible when an event is selected", () => {
  const out = applyUsersTableFilters(sample, {
    eventId: "e2",
    exhibitorId: "all",
    roleFilter: "platform_admin",
    statusFilter: "all",
    search: ""
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "u1");
});

test("applyUsersTableFilters keeps platform admins in all-roles event slices", () => {
  const out = applyUsersTableFilters(sample, {
    eventId: "e1",
    exhibitorId: "all",
    roleFilter: "all",
    statusFilter: "all",
    search: ""
  });
  assert.deepEqual(
    out.map((row) => row.id),
    ["u1", "u2", "u4"]
  );
});

test("applyUsersTableFilters does not let exhibitor filters hide platform admins", () => {
  const out = applyUsersTableFilters(sample, {
    eventId: "e1",
    exhibitorId: "c1",
    roleFilter: "all",
    statusFilter: "all",
    search: ""
  });
  assert.deepEqual(
    out.map((row) => row.id),
    ["u1", "u2"]
  );
});

test("applyUsersTableFilters excludes company-wide pending invites from a specific event", () => {
  const out = applyUsersTableFilters(sample, {
    eventId: "e2",
    exhibitorId: "all",
    roleFilter: "all",
    statusFilter: "invite_pending",
    search: "zach@signalthread.ai"
  });
  assert.deepEqual(out.map((row) => row.id), []);
});

test("applyUsersTableFilters still applies exhibitor filters to company-wide auth pending invites", () => {
  const out = applyUsersTableFilters(sample, {
    eventId: "e2",
    exhibitorId: "c2",
    roleFilter: "all",
    statusFilter: "invite_pending",
    search: ""
  });
  assert.deepEqual(out.map((row) => row.id), []);
});

test("applyUsersTableFilters filters by status", () => {
  const out = applyUsersTableFilters(sample, {
    eventId: "e1",
    exhibitorId: "all",
    roleFilter: "all",
    statusFilter: "invited",
    search: ""
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "u2");
});

test("applyUsersTableFilters composes event + role + search", () => {
  const out = applyUsersTableFilters(sample, {
    eventId: "e1",
    exhibitorId: "all",
    roleFilter: "exhibitor_admin",
    statusFilter: "all",
    search: "bob"
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "u2");
});

test("applyUsersTableFilters filters invite_pending status", () => {
  const out = applyUsersTableFilters(sample, {
    eventId: "e1",
    exhibitorId: "all",
    roleFilter: "all",
    statusFilter: "invite_pending",
    search: ""
  });
  assert.deepEqual(
    out.map((row) => row.id),
    ["u4"]
  );
});

test("mergeMembershipAndPendingInvites drops duplicate pending when membership exists", () => {
  const membership: PlatformUserOverview[] = [
    {
      id: "u1",
      fullName: "A",
      email: "a@x.com",
      role: "viewer",
      eventId: "e1",
      exhibitorId: null,
      status: "invited",
      rowSource: "membership"
    }
  ];
  const pending: PlatformUserOverview[] = [
    {
      id: "u1",
      fullName: "A",
      email: "a@x.com",
      role: "viewer",
      eventId: "e1",
      exhibitorId: null,
      status: "invite_pending",
      rowSource: "invite_pending"
    }
  ];
  const merged = mergeMembershipAndPendingInvites(membership, pending);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.rowSource, "membership");
  assert.equal(merged[0]?.status, "invited");
});
