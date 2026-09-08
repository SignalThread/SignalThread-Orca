import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createCompanyScopedInvite } from "../lib/server/company-scoped-invite";
import { exhibitorInviteEventUserPermissions } from "../lib/exhibitor/exhibitor-invite-role";

type UserRow = {
  id: string;
  email: string;
  role: string;
  company_id: string;
  full_name?: string | null;
  event_access_mode?: string | null;
};

type EventUserRow = {
  user_id: string;
  event_id: string;
  exhibitor_company_id: string;
  status: string;
  permissions: { admin?: boolean; app?: boolean };
};

const EXHIBITOR_ADMIN_APP_PERMISSIONS = exhibitorInviteEventUserPermissions({
  role: "exhibitor_admin",
  hasAppAccess: true
});

function makeClient(input?: {
  events?: Array<{ id: string; company_id: string }>;
  exhibitors?: Array<{ event_id: string; company_id: string }>;
  users?: UserRow[];
  eventUsers?: EventUserRow[];
  dropEventUserInserts?: boolean;
}) {
  const users = input?.users?.slice() ?? [];
  const eventUsers = input?.eventUsers?.slice() ?? [];
  const events = input?.events ?? [];
  const exhibitors = input?.exhibitors ?? [];
  const authUsers: Array<{ id: string; email: string; user_metadata?: Record<string, unknown> }> = [];
  let authSeq = 0;

  function matches(row: Record<string, any>, filters: Array<[string, unknown] | [string, "in", unknown[]]>) {
    return filters.every((filter) => {
      if (filter.length === 2) return row[filter[0]] === filter[1];
      return new Set(filter[2]).has(row[filter[0]]);
    });
  }

  function rowsFor(table: string) {
    if (table === "users") return users as Array<Record<string, any>>;
    if (table === "event_users") return eventUsers as Array<Record<string, any>>;
    if (table === "events") return events as Array<Record<string, any>>;
    if (table === "exhibitors") return exhibitors as Array<Record<string, any>>;
    return [];
  }

  const client: any = {
    auth: {
      admin: {
        async inviteUserByEmail(email: string, options: { data?: Record<string, unknown> }) {
          const existing = authUsers.find((user) => user.email.toLowerCase() === email.toLowerCase());
          if (existing) return { data: { user: null }, error: { message: "User already registered" } };
          const user = { id: `auth-${++authSeq}`, email, user_metadata: options.data ?? {} };
          authUsers.push(user);
          return { data: { user }, error: null };
        },
        async listUsers() {
          return { data: { users: authUsers }, error: null };
        },
        async getUserById(id: string) {
          const user = authUsers.find((row) => row.id === id);
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "Not found" } };
        },
        async updateUserById(id: string, patch: { user_metadata?: Record<string, unknown> }) {
          const user = authUsers.find((row) => row.id === id);
          if (!user) return { data: { user: null }, error: { message: "Not found" } };
          user.user_metadata = patch.user_metadata ?? user.user_metadata;
          return { data: { user }, error: null };
        },
        async deleteUser(id: string) {
          const index = authUsers.findIndex((row) => row.id === id);
          if (index >= 0) authUsers.splice(index, 1);
          return { data: null, error: null };
        }
      }
    },
    from(table: string) {
      return {
        select(_cols?: string) {
          const filters: Array<[string, unknown] | [string, "in", unknown[]]> = [];
          const chain: any = {
            eq(col: string, value: unknown) {
              filters.push([col, value]);
              return chain;
            },
            in(col: string, values: unknown[]) {
              filters.push([col, "in", values]);
              return Promise.resolve({ data: rowsFor(table).filter((row) => matches(row, filters)), error: null });
            },
            maybeSingle() {
              return Promise.resolve({ data: rowsFor(table).find((row) => matches(row, filters)) ?? null, error: null });
            }
          };
          return chain;
        },
        insert(rows: unknown) {
          const list = Array.isArray(rows) ? rows : [rows];
          if (table === "users") users.push(...(list as UserRow[]));
          if (table === "event_users" && !input?.dropEventUserInserts) {
            eventUsers.push(...(list as EventUserRow[]));
          }
          return Promise.resolve({ data: null, error: null });
        },
        update(values: Record<string, unknown>) {
          const filters: Array<[string, unknown] | [string, "in", unknown[]]> = [];
          const apply = () => {
            for (const row of rowsFor(table)) {
              if (matches(row, filters)) Object.assign(row, values);
            }
          };
          const chain: any = {
            eq(col: string, value: unknown) {
              filters.push([col, value]);
              return chain;
            },
            in(col: string, values: unknown[]) {
              filters.push([col, "in", values]);
              apply();
              return Promise.resolve({ data: null, error: null });
            },
            then(resolve: (value: { data: null; error: null }) => void, reject: (reason: unknown) => void) {
              apply();
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
          };
          return chain;
        },
        delete() {
          const filters: Array<[string, unknown] | [string, "in", unknown[]]> = [];
          const apply = () => {
            const rows = rowsFor(table);
            for (let index = rows.length - 1; index >= 0; index -= 1) {
              if (matches(rows[index] ?? {}, filters)) rows.splice(index, 1);
            }
          };
          const chain: any = {
            eq(col: string, value: unknown) {
              filters.push([col, value]);
              return chain;
            },
            in(col: string, values: unknown[]) {
              filters.push([col, "in", values]);
              apply();
              return Promise.resolve({ data: null, error: null });
            },
            then(resolve: (value: { data: null; error: null }) => void, reject: (reason: unknown) => void) {
              apply();
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
          };
          return chain;
        }
      };
    }
  };

  return { client, users, eventUsers, authUsers };
}

test("platform_admin invites exhibitor_admin to one selected event", async () => {
  const db = makeClient({ events: [{ id: "evt-1", company_id: "co-A" }] });
  const result = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "new@example.com",
    fullName: "New Admin",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-1"],
    permissions: { admin: true, app: true },
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(result.ok, true);
  assert.equal(db.users[0]?.role, "exhibitor_admin");
  assert.equal(db.users[0]?.company_id, "co-A");
  assert.equal(db.eventUsers.length, 1);
  assert.equal(db.eventUsers[0]?.event_id, "evt-1");
  assert.equal(db.eventUsers[0]?.exhibitor_company_id, "co-A");
  assert.equal(db.eventUsers[0]?.status, "invited");
  assert.deepEqual(db.eventUsers[0]?.permissions, EXHIBITOR_ADMIN_APP_PERMISSIONS);
});

test("platform_admin invite creates exactly one row per selected event", async () => {
  const db = makeClient({
    events: [
      { id: "evt-1", company_id: "co-A" },
      { id: "evt-2", company_id: "co-A" },
      { id: "evt-extra", company_id: "co-A" }
    ]
  });
  const result = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "multi@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-1", "evt-2"],
    permissions: { admin: true, app: true },
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(db.eventUsers.map((row) => row.event_id).sort(), ["evt-1", "evt-2"]);
});

test("platform_admin invite accepts exhibitor-associated events not owned by the company", async () => {
  const db = makeClient({
    events: [
      { id: "evt-1", company_id: "organizer-co" },
      { id: "evt-2", company_id: "organizer-co" }
    ],
    exhibitors: [
      { event_id: "evt-1", company_id: "co-A" },
      { event_id: "evt-2", company_id: "co-A" }
    ]
  });

  const result = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "associated@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-1", "evt-2"],
    permissions: EXHIBITOR_ADMIN_APP_PERMISSIONS,
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(db.eventUsers.map((row) => row.event_id).sort(), ["evt-1", "evt-2"]);
  assert.ok(db.eventUsers.every((row) => row.exhibitor_company_id === "co-A"));
  assert.ok(db.eventUsers.every((row) => row.status === "invited"));
});

test("exhibitor_admin invite derives company from actor and grants selected events", async () => {
  const db = makeClient({ events: [{ id: "evt-1", company_id: "co-A" }] });
  const result = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "admin-A", role: "exhibitor_admin", companyId: "co-A", accessibleEventIds: ["evt-1"] },
    targetEmail: "inside@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-B",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-1"],
    permissions: { admin: true, app: true },
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(result.ok, true);
  assert.equal(db.users[0]?.company_id, "co-A");
  assert.equal(db.eventUsers[0]?.exhibitor_company_id, "co-A");
});

test("exhibitor_admin cross-company invite attempt fails without writing partial access", async () => {
  const db = makeClient({
    events: [
      { id: "evt-1", company_id: "co-A" },
      { id: "evt-b", company_id: "co-B" }
    ],
    exhibitors: [{ event_id: "evt-b", company_id: "co-B" }]
  });

  const result = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "admin-A", role: "exhibitor_admin", companyId: "co-A", accessibleEventIds: ["evt-1"] },
    targetEmail: "cross@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-B",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-b"],
    permissions: EXHIBITOR_ADMIN_APP_PERMISSIONS,
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(result.ok, false);
  assert.equal(db.authUsers.length, 0);
  assert.equal(db.users.length, 0);
  assert.equal(db.eventUsers.length, 0);
});

test("exhibitor_admin cannot invite to event outside inviter scope and writes no access", async () => {
  const db = makeClient({
    events: [
      { id: "evt-1", company_id: "co-A" },
      { id: "evt-foreign", company_id: "co-B" }
    ]
  });
  const result = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "admin-A", role: "exhibitor_admin", companyId: "co-A", accessibleEventIds: ["evt-1"] },
    targetEmail: "blocked@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-foreign"],
    permissions: { admin: true, app: true },
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(result.ok, false);
  assert.equal(db.authUsers.length, 0);
  assert.equal(db.users.length, 0);
  assert.equal(db.eventUsers.length, 0);
});

test("existing same-company user reinvite updates safely, adds new events, and keeps prior valid access", async () => {
  const db = makeClient({
    events: [
      { id: "evt-1", company_id: "co-A" },
      { id: "evt-2", company_id: "co-A" }
    ]
  });

  const first = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "existing@example.com",
    fullName: "Existing One",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-1"],
    permissions: EXHIBITOR_ADMIN_APP_PERMISSIONS,
    redirectTo: "https://example.com/auth/callback"
  });
  assert.equal(first.ok, true);

  const second = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "existing@example.com",
    fullName: "Existing Updated",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-2"],
    permissions: EXHIBITOR_ADMIN_APP_PERMISSIONS,
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(second.ok, true);
  assert.equal(db.authUsers.length, 1, "reinvite must reuse the existing auth user");
  assert.equal(db.users.length, 1, "reinvite must not create duplicate public.users rows");
  assert.equal(db.users[0]?.full_name, "Existing Updated");
  assert.deepEqual(db.eventUsers.map((row) => row.event_id).sort(), ["evt-1", "evt-2"]);
});

test("existing event_users row is repaired instead of duplicated on reinvite", async () => {
  const db = makeClient({
    events: [{ id: "evt-1", company_id: "co-A" }]
  });

  const first = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "repair@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-1"],
    permissions: EXHIBITOR_ADMIN_APP_PERMISSIONS,
    redirectTo: "https://example.com/auth/callback"
  });
  assert.equal(first.ok, true);
  db.eventUsers[0]!.status = "active";
  db.eventUsers[0]!.permissions = { admin: false, app: false };

  const second = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "repair@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-1"],
    permissions: EXHIBITOR_ADMIN_APP_PERMISSIONS,
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(second.ok, true);
  assert.equal(db.eventUsers.length, 1);
  assert.equal(db.eventUsers[0]?.status, "invited");
  assert.deepEqual(db.eventUsers[0]?.permissions, EXHIBITOR_ADMIN_APP_PERMISSIONS);
});

test("duplicate selected event ids create one event_users row per unique event", async () => {
  const db = makeClient({
    events: [
      { id: "evt-1", company_id: "co-A" },
      { id: "evt-2", company_id: "co-A" }
    ]
  });

  const result = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "dupe-events@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-1", "evt-1", "evt-2", "evt-2"],
    permissions: EXHIBITOR_ADMIN_APP_PERMISSIONS,
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(db.eventUsers.map((row) => row.event_id).sort(), ["evt-1", "evt-2"]);
  assert.equal(new Set(db.eventUsers.map((row) => row.event_id)).size, db.eventUsers.length);
  if (result.ok) assert.deepEqual(result.selectedEventIds, ["evt-1", "evt-2"]);
});

test("all_company_events with empty selected events creates the company user without explicit event rows", async () => {
  const db = makeClient({ events: [{ id: "evt-1", company_id: "co-A" }] });

  const result = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "all-events@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "all_company_events",
    selectedEventIds: [],
    permissions: EXHIBITOR_ADMIN_APP_PERMISSIONS,
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(result.ok, true);
  assert.equal(db.users.length, 1);
  assert.equal(db.users[0]?.event_access_mode, "all_company_events");
  assert.equal(db.eventUsers.length, 0);
});

test("assigned_events_only with empty selected events fails cleanly and rolls back", async () => {
  const db = makeClient({ events: [{ id: "evt-1", company_id: "co-A" }] });

  const result = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "empty-assigned@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: [],
    permissions: EXHIBITOR_ADMIN_APP_PERMISSIONS,
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /at least one event/i);
  assert.equal(db.authUsers.length, 0);
  assert.equal(db.users.length, 0);
  assert.equal(db.eventUsers.length, 0);
});

test("exhibitor_admin actor cannot forge platform or organizer roles through the company-scoped service", async () => {
  for (const targetRole of ["platform_admin", "organizer_admin"]) {
    const db = makeClient({ events: [{ id: "evt-1", company_id: "co-A" }] });
    const result = await createCompanyScopedInvite({
      supabase: db.client,
      actor: { userId: "admin-A", role: "exhibitor_admin", companyId: "co-A", accessibleEventIds: ["evt-1"] },
      targetEmail: `${targetRole}@example.com`,
      targetRole: targetRole as never,
      exhibitorCompanyId: "co-A",
      eventAccessMode: "assigned_events_only",
      selectedEventIds: ["evt-1"],
      permissions: EXHIBITOR_ADMIN_APP_PERMISSIONS,
      redirectTo: "https://example.com/auth/callback"
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /invalid company member role/i);
    assert.equal(db.authUsers.length, 0);
    assert.equal(db.users.length, 0);
    assert.equal(db.eventUsers.length, 0);
  }
});

test("company-scoped invite does not directly gate on stale license fields", () => {
  const src = fs.readFileSync("lib/server/company-scoped-invite.ts", "utf8");
  assert.doesNotMatch(src, /license_id/);
  assert.doesNotMatch(src, /seats_used/);
  assert.doesNotMatch(src, /evaluateAppAccessGrant/);
});

test("company-scoped invite fails if selected event membership verification fails", async () => {
  const db = makeClient({
    events: [{ id: "evt-1", company_id: "co-A" }],
    dropEventUserInserts: true
  });
  const result = await createCompanyScopedInvite({
    supabase: db.client,
    actor: { userId: "platform", role: "platform_admin" },
    targetEmail: "verify@example.com",
    targetRole: "exhibitor_admin",
    exhibitorCompanyId: "co-A",
    eventAccessMode: "assigned_events_only",
    selectedEventIds: ["evt-1"],
    permissions: { admin: true, app: true },
    redirectTo: "https://example.com/auth/callback"
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /verification failed/i);
  assert.equal(db.authUsers.length, 0);
  assert.equal(db.users.length, 0);
  assert.equal(db.eventUsers.length, 0);
});
