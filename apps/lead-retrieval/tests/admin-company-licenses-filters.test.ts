import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCompanyScopedEventsFilters,
  applyCompanyScopedLicensesFilters,
  applyCompanyScopedUsersFilters
} from "../lib/client/admin-company-licenses-filters";
import type {
  CompanyScopedEventsDirectoryRow,
  CompanyScopedOverviewRow,
  CompanyScopedUsersDirectoryRow
} from "../lib/data/admin-company-licenses-overview";

const users: CompanyScopedUsersDirectoryRow[] = [
  {
    id: "user-1",
    isPendingInvite: false,
    fullName: "Nima Baraie",
    email: "nbaraie@biotech.com",
    companyId: "company-biotech",
    companyName: "BioTechnique",
    role: "viewer",
    status: "active",
    seatConsuming: true,
    eventAccessMode: "assigned_events_only",
    eventSummary: { kind: "specific", headline: "2 events", subline: "Expo East, Expo West", previewNames: [], specificCount: 2 },
    assignedEventDetails: [],
    lastActivityOrInvitedAt: "2026-06-01T00:00:00Z"
  },
  {
    id: "user-2",
    isPendingInvite: false,
    fullName: "Nick Admin",
    email: "nick.baraie@gmail.com",
    companyId: "company-biotech",
    companyName: "BioTechnique",
    role: "exhibitor_admin",
    status: "active",
    seatConsuming: false,
    eventAccessMode: "all_company_events",
    eventSummary: { kind: "all_company", headline: "All company events", subline: null, previewNames: [], specificCount: 0 },
    assignedEventDetails: [],
    lastActivityOrInvitedAt: "2026-06-02T00:00:00Z"
  },
  {
    id: "pending:company-acme:casey@example.com",
    isPendingInvite: true,
    fullName: null,
    email: "casey@example.com",
    companyId: "company-acme",
    companyName: "Acme",
    role: "viewer",
    status: "invited",
    seatConsuming: false,
    eventAccessMode: "assigned_events_only",
    eventSummary: { kind: "specific", headline: "1 event", subline: "Acme Expo", previewNames: [], specificCount: 1 },
    assignedEventDetails: [],
    lastActivityOrInvitedAt: "2026-06-03T00:00:00Z"
  }
];

const licenses: CompanyScopedOverviewRow[] = [
  {
    companyId: "company-biotech",
    companyName: "BioTechnique",
    licenseId: "license-1",
    licenseStatus: "active",
    licenseTier: "Professional",
    expiresAt: "2026-12-31",
    maxEvents: 5,
    seatsUsed: 9,
    seatsAllocated: 10,
    activeUsers: 9,
    pendingInvites: 0,
    activeEvents: 2,
    eventsThisMonth: 1,
    leadsCaptured: 5,
    lastActivityAt: "2026-06-04T00:00:00Z",
    usageHealth: "watch"
  },
  {
    companyId: "company-acme",
    companyName: "Acme",
    licenseId: "license-2",
    licenseStatus: "trial",
    licenseTier: "Starter",
    expiresAt: "2026-06-30",
    maxEvents: 1,
    seatsUsed: 1,
    seatsAllocated: 10,
    activeUsers: 1,
    pendingInvites: 1,
    activeEvents: 0,
    eventsThisMonth: 0,
    leadsCaptured: 0,
    lastActivityAt: "2026-06-05T00:00:00Z",
    usageHealth: "expiring"
  }
];

const events: CompanyScopedEventsDirectoryRow[] = [
  {
    eventId: "event-1",
    eventName: "Tech Summit 2026",
    companyId: "company-biotech",
    companyName: "BioTechnique",
    status: "active",
    startDate: "2026-06-10",
    endDate: "2026-06-12",
    usersAssigned: 2,
    leadsCaptured: 3,
    licenseTier: "Professional",
    usageHealth: "healthy",
    lastActivityAt: "2026-06-10T00:00:00Z"
  },
  {
    eventId: "event-2",
    eventName: "Acme Future Expo",
    companyId: "company-acme",
    companyName: "Acme",
    status: "upcoming",
    startDate: "2026-07-15",
    endDate: "2026-07-17",
    usersAssigned: 0,
    leadsCaptured: 0,
    licenseTier: "Starter",
    usageHealth: "watch",
    lastActivityAt: "2026-06-11T00:00:00Z"
  },
  {
    eventId: "event-3",
    eventName: "Old Expo",
    companyId: "company-biotech",
    companyName: "BioTechnique",
    status: "completed",
    startDate: "2026-05-01",
    endDate: "2026-05-02",
    usersAssigned: 1,
    leadsCaptured: 0,
    licenseTier: "Professional",
    usageHealth: "healthy",
    lastActivityAt: "2026-05-02T00:00:00Z"
  }
];

test("Platform Admin Users filtering by search, company, status, role, and seat works", () => {
  assert.deepEqual(
    applyCompanyScopedUsersFilters(users, {
      search: "baraie",
      companyId: "company-biotech",
      role: "viewer",
      status: "active",
      seat: "consumes"
    }).map((row) => row.id),
    ["user-1"]
  );

  assert.deepEqual(
    applyCompanyScopedUsersFilters(users, {
      search: "",
      companyId: "company-biotech",
      role: "exhibitor_admin",
      status: "active",
      seat: "none"
    }).map((row) => row.id),
    ["user-2"]
  );
});

test("Platform Admin Licenses filtering works for status, tier, and near limit", () => {
  assert.deepEqual(
    applyCompanyScopedLicensesFilters(licenses, {
      search: "bio",
      status: "active",
      tier: "Professional",
      limit: "near_or_over",
      expiring: "all",
      activeEvents: "yes"
    }).map((row) => row.companyId),
    ["company-biotech"]
  );

  assert.deepEqual(
    applyCompanyScopedLicensesFilters(licenses, {
      search: "",
      status: "all",
      tier: "Starter",
      limit: "all",
      expiring: "soon",
      activeEvents: "no"
    }).map((row) => row.companyId),
    ["company-acme"]
  );
});

test("Platform Admin Events filtering works for company, status, date, and leads", () => {
  assert.deepEqual(
    applyCompanyScopedEventsFilters(
      events,
      {
        search: "summit",
        companyId: "company-biotech",
        status: "active",
        date: "this_month",
        leads: "yes"
      },
      { nowMs: Date.parse("2026-06-22T12:00:00Z") }
    ).map((row) => row.eventId),
    ["event-1"]
  );

  assert.deepEqual(
    applyCompanyScopedEventsFilters(
      events,
      {
        search: "",
        companyId: "all",
        status: "past",
        date: "past",
        leads: "no"
      },
      { nowMs: Date.parse("2026-06-22T12:00:00Z") }
    ).map((row) => row.eventId),
    ["event-3"]
  );
});
