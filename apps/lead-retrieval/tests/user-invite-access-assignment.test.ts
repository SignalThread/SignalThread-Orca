import test from "node:test";
import assert from "node:assert/strict";

import { persistUserInviteAccessConfig } from "../lib/server/user-invite-access-assignment";

/**
 * Minimal Supabase chain mock. We only implement the subset used by
 * `persistUserInviteAccessConfig`:
 *   - events.select().eq("company_id", X).in("id", [...])
 *   - users.update(...).eq("id", userId)
 *   - event_users.select().eq(...).eq(...).in(...)
 *   - event_users.insert([...])
 *
 * All invocations are recorded so the test can assert side effects.
 */
type TableFixtures = {
  events: Array<{ id: string; company_id: string }>;
  exhibitors?: Array<{ event_id: string; company_id: string }>;
  eventUsersExisting: Array<{
    user_id: string;
    event_id: string;
    exhibitor_company_id: string;
    status?: string;
    permissions?: unknown;
  }>;
};

type RecordedInsert = { table: string; rows: unknown };
type RecordedUpdate = { table: string; update: Record<string, unknown>; eq: [string, unknown] };

function makeSupabaseMock(fixtures: TableFixtures) {
  const inserts: RecordedInsert[] = [];
  const updates: RecordedUpdate[] = [];
  const eventUsers = fixtures.eventUsersExisting.map((row) => ({
    status: "invited",
    permissions: { admin: false, app: true },
    ...row
  }));

  function from(table: string): any {
    return {
      select(_columns?: string) {
        const state: {
          table: string;
          filters: Array<[string, unknown] | [string, string, unknown[]]>;
        } = { table, filters: [] };

        const chain: any = {
          eq(col: string, val: unknown) {
            state.filters.push([col, val]);
            return chain;
          },
          in(col: string, vals: unknown[]) {
            state.filters.push([col, "in", vals]);
            return Promise.resolve({ data: runSelect(state), error: null });
          }
        };
        return chain;
      },
      update(values: Record<string, unknown>) {
        const state: {
          table: string;
          filters: Array<[string, unknown] | [string, string, unknown[]]>;
          applied: boolean;
        } = { table, filters: [], applied: false };

        const apply = () => {
          if (state.applied) return;
          state.applied = true;
          updates.push({ table, update: values, eq: (state.filters.find((f) => f.length === 2) as [string, unknown] | undefined) ?? ["", ""] });
          if (table === "event_users") {
            const rows = filterRows(eventUsers, state.filters);
            for (const row of rows) {
              Object.assign(row, values);
            }
          }
        };

        const chain: any = {
          eq(col: string, val: unknown) {
            state.filters.push([col, val]);
            return chain;
          },
          in(col: string, vals: unknown[]) {
            state.filters.push([col, "in", vals]);
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
      insert(rows: unknown) {
        inserts.push({ table, rows });
        if (table === "event_users") {
          const list = Array.isArray(rows) ? rows : [rows];
          for (const row of list as Array<{
            user_id: string;
            event_id: string;
            exhibitor_company_id: string;
            status: string;
            permissions: unknown;
          }>) {
            eventUsers.push(row);
          }
        }
        return Promise.resolve({ data: null, error: null });
      }
    };
  }

  function filterRows<T extends Record<string, any>>(
    input: T[],
    filters: Array<[string, unknown] | [string, string, unknown[]]>
  ): T[] {
    let rows = input.slice();
    for (const f of filters) {
      if (f.length === 2) {
        const [col, val] = f;
        rows = rows.filter((r) => r[col] === val);
      } else {
        const [col, , vals] = f;
        const set = new Set(vals);
        rows = rows.filter((r) => set.has(r[col]));
      }
    }
    return rows;
  }

  function runSelect(state: {
    table: string;
    filters: Array<[string, unknown] | [string, string, unknown[]]>;
  }): unknown[] {
    if (state.table === "events") {
      const rows = filterRows(fixtures.events, state.filters);
      return rows.map((r) => ({ id: r.id }));
    }
    if (state.table === "exhibitors") {
      const rows = filterRows(fixtures.exhibitors ?? [], state.filters);
      return rows.map((r) => ({ event_id: r.event_id }));
    }
    if (state.table === "event_users") {
      return filterRows(eventUsers, state.filters);
    }
    return [];
  }

  return { client: { from } as any, inserts, updates };
}

test("persistUserInviteAccessConfig: all_company_events with no assigned ids does not insert event_users", async () => {
  const mock = makeSupabaseMock({
    events: [
      { id: "evt-1", company_id: "co-A" },
      { id: "evt-2", company_id: "co-A" }
    ],
    eventUsersExisting: []
  });

  const r = await persistUserInviteAccessConfig({
    supabase: mock.client,
    userId: "user-1",
    companyId: "co-A",
    rawConfig: {
      role: "exhibitor_admin",
      eventAccessMode: "all_company_events",
      assignedEventIds: []
    }
  });

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.assignedEventsCreated, 0);
  assert.equal(mock.inserts.length, 0);
  const userUpdate = mock.updates.find((u) => u.table === "users");
  assert.ok(userUpdate);
  assert.deepEqual(userUpdate!.update, { event_access_mode: "all_company_events" });
});

test("persistUserInviteAccessConfig: all_company_events with optional assigned ids creates event_users", async () => {
  const mock = makeSupabaseMock({
    events: [
      { id: "evt-1", company_id: "co-A" },
      { id: "evt-2", company_id: "co-A" }
    ],
    eventUsersExisting: []
  });

  const r = await persistUserInviteAccessConfig({
    supabase: mock.client,
    userId: "user-1",
    companyId: "co-A",
    rawConfig: {
      role: "exhibitor_admin",
      eventAccessMode: "all_company_events",
      assignedEventIds: ["evt-1"]
    }
  });

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.assignedEventsCreated, 1);
  const insert = mock.inserts.find((i) => i.table === "event_users");
  assert.ok(insert);
});

test("persistUserInviteAccessConfig: assigned_events_only creates one event_users row per event", async () => {
  const mock = makeSupabaseMock({
    events: [
      { id: "evt-1", company_id: "co-A" },
      { id: "evt-2", company_id: "co-A" },
      { id: "evt-3", company_id: "co-A" }
    ],
    eventUsersExisting: []
  });

  const r = await persistUserInviteAccessConfig({
    supabase: mock.client,
    userId: "user-1",
    companyId: "co-A",
    rawConfig: {
      role: "exhibitor_viewer",
      eventAccessMode: "assigned_events_only",
      assignedEventIds: ["evt-1", "evt-2"]
    }
  });

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.assignedEventsCreated, 2);
  const insert = mock.inserts.find((i) => i.table === "event_users");
  assert.ok(insert);
  const rows = insert!.rows as Array<{ event_id: string; exhibitor_company_id: string; status: string; user_id: string }>;
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.event_id).sort(),
    ["evt-1", "evt-2"]
  );
  for (const row of rows) {
    assert.equal(row.user_id, "user-1");
    assert.equal(row.exhibitor_company_id, "co-A");
    assert.equal(row.status, "invited");
  }
  const userUpdate = mock.updates.find((u) => u.table === "users");
  assert.ok(userUpdate);
  assert.deepEqual(userUpdate!.update, { event_access_mode: "assigned_events_only" });
});

test("persistUserInviteAccessConfig: accepts events associated through exhibitors, not only events.company_id", async () => {
  const mock = makeSupabaseMock({
    events: [
      { id: "evt-1", company_id: "organizer-co" },
      { id: "evt-2", company_id: "organizer-co" }
    ],
    exhibitors: [
      { event_id: "evt-1", company_id: "co-A" },
      { event_id: "evt-2", company_id: "co-A" }
    ],
    eventUsersExisting: []
  });

  const r = await persistUserInviteAccessConfig({
    supabase: mock.client,
    userId: "user-1",
    companyId: "co-A",
    rawConfig: {
      role: "exhibitor_admin",
      eventAccessMode: "assigned_events_only",
      assignedEventIds: ["evt-1", "evt-2"]
    },
    assignedEventPermissions: { admin: true, app: true }
  });

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.assignedEventsCreated, 2);
  const insert = mock.inserts.find((i) => i.table === "event_users");
  assert.ok(insert);
  const rows = insert!.rows as Array<{ event_id: string; permissions: { admin: boolean; app: boolean } }>;
  assert.deepEqual(
    rows.map((r) => r.event_id).sort(),
    ["evt-1", "evt-2"]
  );
  assert.ok(rows.every((row) => row.permissions.admin === true && row.permissions.app === true));
});

test("persistUserInviteAccessConfig: skips already-existing event_users rows (idempotent)", async () => {
  const mock = makeSupabaseMock({
    events: [
      { id: "evt-1", company_id: "co-A" },
      { id: "evt-2", company_id: "co-A" }
    ],
    eventUsersExisting: [
      {
        user_id: "user-1",
        event_id: "evt-1",
        exhibitor_company_id: "co-A",
        status: "active",
        permissions: { admin: false, app: false }
      }
    ]
  });

  const r = await persistUserInviteAccessConfig({
    supabase: mock.client,
    userId: "user-1",
    companyId: "co-A",
    rawConfig: {
      role: "exhibitor_admin",
      eventAccessMode: "assigned_events_only",
      assignedEventIds: ["evt-1", "evt-2"]
    }
  });

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.assignedEventsCreated, 1);
  const update = mock.updates.find((u) => u.table === "event_users");
  assert.ok(update);
  assert.deepEqual(update!.update, { status: "invited", permissions: { admin: false, app: true } });
  const insert = mock.inserts.find((i) => i.table === "event_users");
  assert.ok(insert);
  const rows = insert!.rows as Array<{ event_id: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_id, "evt-2");
});

test("persistUserInviteAccessConfig: rejects assigning events from another company", async () => {
  const mock = makeSupabaseMock({
    events: [
      { id: "evt-1", company_id: "co-A" },
      { id: "evt-foreign", company_id: "co-B" }
    ],
    eventUsersExisting: []
  });

  const r = await persistUserInviteAccessConfig({
    supabase: mock.client,
    userId: "user-1",
    companyId: "co-A",
    rawConfig: {
      role: "exhibitor_admin",
      eventAccessMode: "assigned_events_only",
      assignedEventIds: ["evt-1", "evt-foreign"]
    }
  });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.code, "ASSIGNED_EVENTS_FOREIGN_COMPANY");
  // No inserts, no updates should have happened.
  assert.equal(mock.inserts.length, 0);
  assert.equal(mock.updates.length, 0);
});

test("persistUserInviteAccessConfig: missing mode fails validation for company-scoped role", async () => {
  const mock = makeSupabaseMock({ events: [], eventUsersExisting: [] });
  const r = await persistUserInviteAccessConfig({
    supabase: mock.client,
    userId: "user-1",
    companyId: "co-A",
    rawConfig: { role: "exhibitor_viewer", eventAccessMode: null, assignedEventIds: [] }
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.code, "MODE_REQUIRED");
  assert.equal(mock.inserts.length, 0);
  assert.equal(mock.updates.length, 0);
});

test("persistUserInviteAccessConfig: non-company-scoped role does not touch users.event_access_mode or event_users", async () => {
  const mock = makeSupabaseMock({ events: [], eventUsersExisting: [] });
  const r = await persistUserInviteAccessConfig({
    supabase: mock.client,
    userId: "user-1",
    companyId: "co-A",
    rawConfig: {
      role: "organizer_admin",
      eventAccessMode: "all_company_events",
      assignedEventIds: ["evt-1"]
    }
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.eventAccessMode, null);
  assert.equal(r.assignedEventsCreated, 0);
  assert.equal(mock.inserts.length, 0);
  assert.equal(mock.updates.length, 0);
});
