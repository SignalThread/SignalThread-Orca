import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildMobileEventsResponse,
  type MobileEventAccessResult,
  type MobileEventRow
} from "@/lib/mobile/mobile-events-core";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const rows: MobileEventRow[] = [
  {
    id: "event-b",
    name: "Beta Expo",
    status: "UPCOMING",
    is_active: true,
    start_date: "2026-06-11",
    end_date: "2026-06-12",
    location: null,
    city: "Austin",
    state: "TX"
  },
  {
    id: "event-a",
    name: "Alpha Expo",
    status: "ACTIVE",
    is_active: true,
    start_date: "2026-06-01",
    end_date: "2026-06-02",
    location: "New York, NY",
    city: null,
    state: null
  },
  {
    id: "other-company-event",
    name: "Other Company",
    status: "ACTIVE",
    is_active: true,
    start_date: "2026-06-03",
    end_date: "2026-06-04",
    location: null,
    city: null,
    state: null
  }
];

function access(overrides: Partial<MobileEventAccessResult>): MobileEventAccessResult {
  return {
    eventIds: [],
    resolution: "none",
    companyId: "company-1",
    role: "exhibitor_admin",
    ...overrides
  };
}

test("mobile events: exhibitor_admin all_company_events gets all canonical company events without app rows", () => {
  const payload = buildMobileEventsResponse({
    access: access({
      eventIds: ["event-a", "event-b"],
      resolution: "company_all_events",
      role: "exhibitor_admin"
    }),
    eventRows: rows,
    appEnabledEventIds: []
  });

  assert.deepEqual(payload.events.map((event) => event.id), ["event-a", "event-b"]);
  assert.equal(payload.selectedDefaultEventId, "event-a");
  assert.equal(payload.accessResolution, "company_all_events");
});

test("mobile events: exhibitor_admin assigned-event mode gets only canonical assigned events", () => {
  const payload = buildMobileEventsResponse({
    access: access({
      eventIds: ["event-b"],
      resolution: "company_assigned_only",
      role: "exhibitor_admin"
    }),
    eventRows: rows,
    appEnabledEventIds: ["event-a", "event-b"]
  });

  assert.deepEqual(payload.events.map((event) => event.id), ["event-b"]);
});

test("mobile events: viewer roles get only assigned app-enabled events", () => {
  const payload = buildMobileEventsResponse({
    access: access({
      eventIds: ["event-a", "event-b"],
      resolution: "company_assigned_only",
      role: "exhibitor_viewer"
    }),
    eventRows: rows,
    appEnabledEventIds: ["event-b"]
  });

  assert.deepEqual(payload.events.map((event) => event.id), ["event-b"]);
});

test("mobile events: legacy viewer role is restricted like exhibitor_viewer", () => {
  const payload = buildMobileEventsResponse({
    access: access({
      eventIds: ["event-a", "event-b"],
      resolution: "legacy_event_scoped",
      role: "viewer"
    }),
    eventRows: rows,
    appEnabledEventIds: ["event-a"]
  });

  assert.deepEqual(payload.events.map((event) => event.id), ["event-a"]);
});

test("mobile events: unrelated company events are not returned without canonical access", () => {
  const payload = buildMobileEventsResponse({
    access: access({
      eventIds: ["event-a"],
      resolution: "company_all_events",
      role: "exhibitor_admin"
    }),
    eventRows: rows
  });

  assert.deepEqual(payload.events.map((event) => event.id), ["event-a"]);
});

test("mobile events: stale missing app permission does not block exhibitor_admin canonical events", () => {
  const payload = buildMobileEventsResponse({
    access: access({
      eventIds: ["event-a"],
      resolution: "legacy_event_scoped",
      role: "exhibitor_admin"
    }),
    eventRows: rows,
    appEnabledEventIds: []
  });

  assert.deepEqual(payload.events.map((event) => event.id), ["event-a"]);
});

test("mobile events: inactive rows are preserved and missing canonical ids are omitted", () => {
  const payload = buildMobileEventsResponse({
    access: access({
      eventIds: ["inactive-event", "missing-event"],
      resolution: "company_all_events",
      role: "exhibitor_admin"
    }),
    eventRows: [
      {
        id: "inactive-event",
        name: "Inactive Event",
        status: "COMPLETED",
        is_active: false,
        start_date: "2026-05-01",
        end_date: "2026-05-02",
        location: null,
        city: null,
        state: null
      }
    ]
  });

  assert.deepEqual(payload.events.map((event) => event.id), ["inactive-event"]);
  assert.equal(payload.events[0]?.isActive, false);
});

test("mobile events route payload shape is narrow, stable, and deterministically ordered", () => {
  const payload = buildMobileEventsResponse({
    access: access({
      eventIds: ["event-b", "event-a"],
      resolution: "company_all_events",
      role: "exhibitor_admin"
    }),
    eventRows: rows,
    preferredEventId: "event-b"
  });

  assert.deepEqual(Object.keys(payload).sort(), [
    "accessResolution",
    "events",
    "selectedDefaultEventId"
  ]);
  assert.deepEqual(payload.events.map((event) => event.id), ["event-a", "event-b"]);
  assert.equal(payload.selectedDefaultEventId, "event-b");
  assert.deepEqual(Object.keys(payload.events[0]!).sort(), [
    "city",
    "displayLocation",
    "endDate",
    "id",
    "isActive",
    "location",
    "name",
    "startDate",
    "state",
    "status"
  ]);
});

test("mobile events route uses canonical resolver and disables only the bearer app precheck", () => {
  const route = read("app/api/mobile/events/route.ts");
  const server = read("lib/server/mobile-accessible-events.ts");

  assert.match(route, /resolveApiSession\(request,\s*\{[\s\S]*enforceMobileAppAccess:\s*false/);
  assert.match(route, /getMobileAccessibleEventsForSession/);
  assert.match(server, /resolveAccessibleEventIdsForUser\(\{\s*userId:\s*session\.userId\s*\}\)/);
  assert.match(server, /eventAppPermissionEnabled\(row\.permissions\)/);
});
