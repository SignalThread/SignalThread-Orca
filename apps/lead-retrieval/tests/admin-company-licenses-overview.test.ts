import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompanyScopedEventsDirectoryData,
  buildCompanyScopedUsersDirectoryData,
  buildCompanyScopedOverviewData,
  buildCompanyScopedSeatConsumingUserIds,
  computeCompanyScopedUsageHealth,
  isCompanyScopedSeatConsumingUser,
  summarizeCompanyScopedCompaniesDirectory,
  summarizeCompanyScopedEventsDirectory,
  summarizeCompanyScopedLicenses,
  summarizeCompanyScopedUsersDirectory
} from "../lib/data/admin-company-licenses-overview";

const NOW_MS = Date.parse("2026-05-22T12:00:00Z");

test("computeCompanyScopedUsageHealth returns over_limit when seats exceed allocation", () => {
  assert.equal(
    computeCompanyScopedUsageHealth({
      licenseStatus: "active",
      expiresAt: "2026-12-31",
      seatsUsed: 11,
      seatsAllocated: 10,
      activeUsers: 11,
      pendingInvites: 0,
      activeEvents: 1,
      leadsCaptured: 12,
      maxEvents: null,
      nowMs: NOW_MS
    }),
    "over_limit"
  );
});

test("computeCompanyScopedUsageHealth returns expiring when an active license is within 30 days", () => {
  assert.equal(
    computeCompanyScopedUsageHealth({
      licenseStatus: "active",
      expiresAt: "2026-06-10",
      seatsUsed: 4,
      seatsAllocated: 10,
      activeUsers: 4,
      pendingInvites: 0,
      activeEvents: 1,
      leadsCaptured: 10,
      maxEvents: null,
      nowMs: NOW_MS
    }),
    "expiring"
  );
});

test("computeCompanyScopedUsageHealth returns inactive for expired or unused companies", () => {
  assert.equal(
    computeCompanyScopedUsageHealth({
      licenseStatus: "expired",
      expiresAt: "2026-05-01",
      seatsUsed: 0,
      seatsAllocated: 10,
      activeUsers: 0,
      pendingInvites: 0,
      activeEvents: 0,
      leadsCaptured: 0,
      maxEvents: null,
      nowMs: NOW_MS
    }),
    "inactive"
  );
});

test("computeCompanyScopedUsageHealth returns watch near seat capacity", () => {
  assert.equal(
    computeCompanyScopedUsageHealth({
      licenseStatus: "active",
      expiresAt: "2026-12-31",
      seatsUsed: 9,
      seatsAllocated: 10,
      activeUsers: 9,
      pendingInvites: 0,
      activeEvents: 1,
      leadsCaptured: 22,
      maxEvents: null,
      nowMs: NOW_MS
    }),
    "watch"
  );
});

test("isCompanyScopedSeatConsumingUser only counts active provisioned app members", () => {
  assert.equal(
    isCompanyScopedSeatConsumingUser({
      status: "active",
      isPendingInvite: false,
      hasActiveAppMembership: true
    }),
    true
  );
  assert.equal(
    isCompanyScopedSeatConsumingUser({
      status: "invited",
      isPendingInvite: false,
      hasActiveAppMembership: true
    }),
    false
  );
  assert.equal(
    isCompanyScopedSeatConsumingUser({
      status: "active",
      isPendingInvite: true,
      hasActiveAppMembership: true
    }),
    false
  );
});

test("company scoped seat consumption counts distinct active app users from event_users", () => {
  const seatsByCompany = buildCompanyScopedSeatConsumingUserIds(
    [
      {
        user_id: "user-seat",
        exhibitor_company_id: "company-a",
        status: "active",
        permissions: { app: true }
      },
      {
        user_id: "user-seat",
        exhibitor_company_id: "company-a",
        status: "active",
        permissions: { app: true }
      },
      {
        user_id: "admin-no-seat",
        exhibitor_company_id: "company-a",
        status: "active",
        permissions: { admin: true, app: false }
      },
      {
        user_id: "invited-seat",
        exhibitor_company_id: "company-a",
        status: "invited",
        permissions: { app: true }
      },
      {
        user_id: "other-company-seat",
        exhibitor_company_id: "company-b",
        status: "active",
        permissions: { app: true }
      }
    ],
    { companyIds: new Set(["company-a"]) }
  );

  assert.deepEqual([...seatsByCompany.get("company-a") ?? []], ["user-seat"]);
  assert.equal(seatsByCompany.get("company-b"), undefined);
});

test("company license overview and users directory agree on seat-consuming users", () => {
  const memberships = [
    {
      user_id: "nbaraie",
      event_id: "event-1",
      exhibitor_company_id: "company-biotech",
      status: "active",
      permissions: { app: true },
      created_at: "2026-05-01T00:00:00Z"
    },
    {
      user_id: "nbaraie",
      event_id: "event-2",
      exhibitor_company_id: "company-biotech",
      status: "active",
      permissions: { app: true },
      created_at: "2026-05-02T00:00:00Z"
    },
    {
      user_id: "nick-gmail",
      event_id: "event-1",
      exhibitor_company_id: "company-biotech",
      status: "active",
      permissions: { admin: true, app: false },
      created_at: "2026-05-03T00:00:00Z"
    }
  ];

  const overview = buildCompanyScopedOverviewData({
    nowMs: NOW_MS,
    licenses: [
      {
        id: "lic-biotech",
        company_id: "host-1",
        exhibitor_company_id: "company-biotech",
        license_plan_id: "plan-pro",
        seats_total: 10,
        seats_used: 0,
        status: "active",
        expires_at: "2026-12-31",
        created_at: "2026-05-01T00:00:00Z",
        max_events: null
      }
    ],
    companies: [{ id: "company-biotech", name: "BioTechnique" }],
    licensePlans: [{ id: "plan-pro", code: "professional", name: "Professional" }],
    events: [
      {
        id: "event-1",
        company_id: "company-biotech",
        status: "active",
        is_active: true,
        start_date: "2026-05-04",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-10T00:00:00Z"
      },
      {
        id: "event-2",
        company_id: "company-biotech",
        status: "active",
        is_active: true,
        start_date: "2026-05-05",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-11T00:00:00Z"
      }
    ],
    memberships,
    leads: []
  });

  const users = buildCompanyScopedUsersDirectoryData({
    nowMs: NOW_MS,
    overviewCompanies: overview.companies,
    users: [
      {
        id: "nbaraie",
        full_name: "Nick Baraie",
        email: "nbaraie@biotech.com",
        role: "viewer",
        company_id: "company-biotech",
        event_access_mode: "assigned_events_only",
        created_at: "2026-05-01T00:00:00Z"
      },
      {
        id: "nick-gmail",
        full_name: "Nick Gmail",
        email: "nick.baraie@gmail.com",
        role: "exhibitor_admin",
        company_id: "company-biotech",
        event_access_mode: "assigned_events_only",
        created_at: "2026-05-01T00:00:00Z"
      }
    ],
    events: [
      { id: "event-1", company_id: "company-biotech", name: "Expo East" },
      { id: "event-2", company_id: "company-biotech", name: "Expo West" }
    ],
    memberships,
    pendingInvites: [],
    authUsers: [
      {
        id: "nbaraie",
        email: "nbaraie@biotech.com",
        created_at: "2026-05-01T00:00:00Z",
        last_sign_in_at: "2026-05-20T12:00:00Z",
        banned_until: null
      },
      {
        id: "nick-gmail",
        email: "nick.baraie@gmail.com",
        created_at: "2026-05-01T00:00:00Z",
        last_sign_in_at: "2026-05-21T12:00:00Z",
        banned_until: null
      }
    ]
  });

  assert.equal(overview.companies[0]?.seatsUsed, 1);
  assert.equal(overview.kpis.seatsUsed, 1);
  assert.equal(users.find((row) => row.email === "nbaraie@biotech.com")?.seatConsuming, true);
  assert.equal(users.find((row) => row.email === "nick.baraie@gmail.com")?.seatConsuming, false);
  assert.equal(users.filter((row) => row.seatConsuming).length, overview.companies[0]?.seatsUsed);
});

test("buildCompanyScopedOverviewData aggregates latest company license rows into KPI and table shape", () => {
  const data = buildCompanyScopedOverviewData({
    nowMs: NOW_MS,
    licenses: [
      {
        id: "lic-old",
        company_id: "host-1",
        exhibitor_company_id: "company-a",
        license_plan_id: "plan-pro",
        seats_total: 5,
        seats_used: 2,
        status: "active",
        expires_at: "2026-12-31",
        created_at: "2026-03-01T00:00:00Z",
        max_events: 2
      },
      {
        id: "lic-new",
        company_id: "host-1",
        exhibitor_company_id: "company-a",
        license_plan_id: "plan-pro",
        seats_total: 10,
        seats_used: 9,
        status: "active",
        expires_at: "2026-12-31",
        created_at: "2026-05-01T00:00:00Z",
        max_events: 2
      },
      {
        id: "lic-b",
        company_id: "host-2",
        exhibitor_company_id: "company-b",
        license_plan_id: "plan-starter",
        seats_total: 8,
        seats_used: 0,
        status: "expired",
        expires_at: "2026-04-01",
        created_at: "2026-04-02T00:00:00Z",
        max_events: null
      }
    ],
    companies: [
      { id: "company-a", name: "Acme Labs" },
      { id: "company-b", name: "Bravo Systems" }
    ],
    licensePlans: [
      { id: "plan-pro", code: "professional", name: "Professional" },
      { id: "plan-starter", code: "starter", name: "Starter" }
    ],
    events: [
      {
        id: "event-1",
        company_id: "company-a",
        status: "active",
        is_active: true,
        start_date: "2026-05-04",
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-05-10T00:00:00Z"
      },
      {
        id: "event-2",
        company_id: "company-a",
        status: "upcoming",
        is_active: false,
        start_date: "2026-05-28",
        created_at: "2026-05-03T00:00:00Z",
        updated_at: "2026-05-18T00:00:00Z"
      }
    ],
    memberships: [
      {
        user_id: "user-1",
        exhibitor_company_id: "company-a",
        status: "active",
        permissions: { app: true },
        created_at: "2026-05-12T00:00:00Z"
      },
      {
        user_id: "user-2",
        exhibitor_company_id: "company-a",
        status: "active",
        permissions: { admin: true },
        created_at: "2026-05-13T00:00:00Z"
      },
      {
        user_id: "user-3",
        exhibitor_company_id: "company-a",
        status: "invited",
        permissions: { app: true },
        created_at: "2026-05-15T00:00:00Z"
      },
      {
        user_id: "user-3",
        exhibitor_company_id: "company-a",
        status: "invited",
        permissions: { app: true },
        created_at: "2026-05-16T00:00:00Z"
      }
    ],
    leads: [
      {
        company_id: "company-a",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-17T00:00:00Z"
      },
      {
        company_id: "company-a",
        created_at: "2026-05-02T00:00:00Z",
        updated_at: "2026-05-19T00:00:00Z"
      }
    ]
  });

  assert.deepEqual(data.kpis, {
    licensedCompanies: 2,
    activeLicenses: 1,
    seatsUsed: 1,
    seatsAllocated: 18,
    activeUsers: 2,
    pendingInvites: 1,
    activeEvents: 1,
    eventsThisMonth: 2,
    leadsCaptured: 2
  });

  assert.equal(data.companies.length, 2);
  const acme = data.companies.find((row) => row.companyName === "Acme Labs");
  const bravo = data.companies.find((row) => row.companyName === "Bravo Systems");
  assert.equal(acme?.licenseId, "lic-new");
  assert.equal(acme?.licenseTier, "Professional");
  assert.equal(acme?.expiresAt, "2026-12-31");
  assert.equal(acme?.maxEvents, 2);
  assert.equal(acme?.seatsUsed, 1);
  assert.equal(acme?.activeUsers, 2);
  assert.equal(acme?.pendingInvites, 1);
  assert.equal(acme?.activeEvents, 1);
  assert.equal(acme?.eventsThisMonth, 2);
  assert.equal(acme?.leadsCaptured, 2);
  assert.equal(acme?.usageHealth, "healthy");
  assert.equal(acme?.lastActivityAt, "2026-05-19T00:00:00Z");

  assert.equal(bravo?.usageHealth, "inactive");
});

test("buildCompanyScopedOverviewData counts eventless company-scoped users from canonical user/auth data", () => {
  const data = buildCompanyScopedOverviewData({
    nowMs: NOW_MS,
    licenses: [
      {
        id: "lic-company",
        company_id: "host-1",
        exhibitor_company_id: "company-a",
        license_plan_id: "plan-pro",
        seats_total: 10,
        seats_used: 2,
        status: "active",
        expires_at: "2026-12-31",
        created_at: "2026-05-01T00:00:00Z",
        max_events: null
      }
    ],
    companies: [{ id: "company-a", name: "Acme Labs" }],
    licensePlans: [{ id: "plan-pro", code: "professional", name: "Professional" }],
    events: [],
    memberships: [],
    leads: [],
    users: [
      {
        id: "user-active",
        full_name: "Alex Active",
        email: "alex@acme.test",
        role: "exhibitor_admin",
        company_id: "company-a",
        event_access_mode: "all_company_events",
        created_at: "2026-05-02T00:00:00Z"
      },
      {
        id: "user-invited",
        full_name: "Ivy Invited",
        email: "ivy@acme.test",
        role: "viewer",
        company_id: "company-a",
        event_access_mode: "all_company_events",
        created_at: "2026-05-15T00:00:00Z"
      }
    ],
    authUsers: [
      {
        id: "user-active",
        email: "alex@acme.test",
        created_at: "2026-05-02T00:00:00Z",
        last_sign_in_at: "2026-05-20T12:00:00Z",
        banned_until: null
      },
      {
        id: "user-invited",
        email: "ivy@acme.test",
        created_at: "2026-05-15T00:00:00Z",
        last_sign_in_at: null,
        banned_until: null
      }
    ]
  });

  assert.deepEqual(data.kpis, {
    licensedCompanies: 1,
    activeLicenses: 1,
    seatsUsed: 0,
    seatsAllocated: 10,
    activeUsers: 1,
    pendingInvites: 1,
    activeEvents: 0,
    eventsThisMonth: 0,
    leadsCaptured: 0
  });

  assert.equal(data.companies[0]?.companyName, "Acme Labs");
  assert.equal(data.companies[0]?.activeUsers, 1);
  assert.equal(data.companies[0]?.pendingInvites, 1);
  assert.equal(data.companies[0]?.lastActivityAt, "2026-05-20T12:00:00Z");
  assert.equal(data.companies[0]?.usageHealth, "healthy");
});

test("summarizeCompanyScopedCompaniesDirectory derives company directory cards from shared rows", () => {
  const summary = summarizeCompanyScopedCompaniesDirectory([
    {
      companyId: "company-a",
      companyName: "Acme Labs",
      licenseId: "lic-a",
      licenseStatus: "active",
      licenseTier: "Professional",
      expiresAt: "2026-12-31",
      maxEvents: 4,
      seatsUsed: 9,
      seatsAllocated: 10,
      activeUsers: 3,
      pendingInvites: 1,
      activeEvents: 2,
      eventsThisMonth: 1,
      leadsCaptured: 12,
      lastActivityAt: "2026-05-22T10:00:00Z",
      usageHealth: "watch"
    },
    {
      companyId: "company-b",
      companyName: "Bravo Systems",
      licenseId: "lic-b",
      licenseStatus: "expired",
      licenseTier: "Starter",
      expiresAt: "2026-05-01",
      maxEvents: null,
      seatsUsed: 11,
      seatsAllocated: 10,
      activeUsers: 0,
      pendingInvites: 0,
      activeEvents: 0,
      eventsThisMonth: 0,
      leadsCaptured: 0,
      lastActivityAt: "2026-05-01T00:00:00Z",
      usageHealth: "over_limit"
    },
    {
      companyId: "company-c",
      companyName: "Charlie Co",
      licenseId: "lic-c",
      licenseStatus: "active",
      licenseTier: "Enterprise",
      expiresAt: null,
      maxEvents: 10,
      seatsUsed: 2,
      seatsAllocated: 25,
      activeUsers: 2,
      pendingInvites: 0,
      activeEvents: 1,
      eventsThisMonth: 0,
      leadsCaptured: 4,
      lastActivityAt: "2026-05-20T00:00:00Z",
      usageHealth: "healthy"
    }
  ]);

  assert.deepEqual(summary, {
    totalLicensedCompanies: 3,
    activeCompanies: 2,
    companiesWithPendingInvites: 1,
    companiesNearOrOverLimits: 2
  });
});

test("summarizeCompanyScopedLicenses derives license summary cards from shared rows", () => {
  const summary = summarizeCompanyScopedLicenses([
    {
      companyId: "company-a",
      companyName: "Acme Labs",
      licenseId: "lic-a",
      licenseStatus: "active",
      licenseTier: "Professional",
      expiresAt: "2026-06-10",
      maxEvents: 2,
      seatsUsed: 4,
      seatsAllocated: 10,
      activeUsers: 4,
      pendingInvites: 0,
      activeEvents: 1,
      eventsThisMonth: 1,
      leadsCaptured: 22,
      lastActivityAt: "2026-05-22T10:00:00Z",
      usageHealth: "expiring"
    },
    {
      companyId: "company-b",
      companyName: "Bravo Systems",
      licenseId: "lic-b",
      licenseStatus: "active",
      licenseTier: "Starter",
      expiresAt: null,
      maxEvents: null,
      seatsUsed: 9,
      seatsAllocated: 10,
      activeUsers: 3,
      pendingInvites: 1,
      activeEvents: 1,
      eventsThisMonth: 0,
      leadsCaptured: 3,
      lastActivityAt: "2026-05-18T00:00:00Z",
      usageHealth: "watch"
    },
    {
      companyId: "company-c",
      companyName: "Charlie Co",
      licenseId: "lic-c",
      licenseStatus: "expired",
      licenseTier: "Enterprise",
      expiresAt: "2026-05-01",
      maxEvents: 6,
      seatsUsed: 12,
      seatsAllocated: 10,
      activeUsers: 0,
      pendingInvites: 0,
      activeEvents: 0,
      eventsThisMonth: 0,
      leadsCaptured: 0,
      lastActivityAt: "2026-05-01T00:00:00Z",
      usageHealth: "over_limit"
    }
  ]);

  assert.deepEqual(summary, {
    totalCompanyLicenses: 3,
    activeLicenses: 2,
    expiringLicenses: 1,
    nearOrOverLimitLicenses: 2
  });
});

test("buildCompanyScopedUsersDirectoryData aggregates provisioned users and invite-only rows for licensed companies", () => {
  const rows = buildCompanyScopedUsersDirectoryData({
    nowMs: NOW_MS,
    overviewCompanies: [
      {
        companyId: "company-a",
        companyName: "Acme Labs",
        licenseId: "lic-a",
        licenseStatus: "active",
        licenseTier: "Professional",
        expiresAt: "2026-12-31",
        maxEvents: 4,
        seatsUsed: 2,
        seatsAllocated: 10,
        activeUsers: 1,
        pendingInvites: 1,
        activeEvents: 2,
        eventsThisMonth: 1,
        leadsCaptured: 8,
        lastActivityAt: "2026-05-22T10:00:00Z",
        usageHealth: "healthy"
      }
    ],
    users: [
      {
        id: "user-1",
        full_name: "Alex Admin",
        email: "alex@acme.test",
        role: "exhibitor_admin",
        company_id: "company-a",
        event_access_mode: "all_company_events",
        created_at: "2026-05-01T00:00:00Z"
      },
      {
        id: "user-2",
        full_name: "Ivy Invite",
        email: "ivy@acme.test",
        role: "viewer",
        company_id: "company-a",
        event_access_mode: "assigned_events_only",
        created_at: "2026-05-10T00:00:00Z"
      }
    ],
    events: [
      { id: "event-1", company_id: "company-a", name: "Expo East" },
      { id: "event-2", company_id: "company-a", name: "Expo West" }
    ],
    memberships: [
      {
        user_id: "user-1",
        event_id: "event-1",
        exhibitor_company_id: "company-a",
        status: "active",
        permissions: { admin: true, app: true },
        created_at: "2026-05-02T00:00:00Z"
      },
      {
        user_id: "user-2",
        event_id: "event-2",
        exhibitor_company_id: "company-a",
        status: "invited",
        permissions: { admin: false, app: true },
        created_at: "2026-05-15T00:00:00Z"
      }
    ],
    pendingInvites: [
      {
        event_id: "event-1",
        exhibitor_company_id: "company-a",
        email: "codes@acme.test",
        permissions: { admin: false, app: true },
        event_access_mode: "assigned_events_only",
        expires_at: "2026-05-29T00:00:00Z",
        created_at: "2026-05-16T00:00:00Z"
      },
      {
        event_id: "event-2",
        exhibitor_company_id: "company-a",
        email: "codes@acme.test",
        permissions: { admin: false, app: true },
        event_access_mode: "assigned_events_only",
        expires_at: "2026-05-29T00:00:00Z",
        created_at: "2026-05-17T00:00:00Z"
      },
      {
        event_id: "event-2",
        exhibitor_company_id: "company-a",
        email: "ivy@acme.test",
        permissions: { admin: false, app: true },
        event_access_mode: "assigned_events_only",
        expires_at: "2026-05-29T00:00:00Z",
        created_at: "2026-05-18T00:00:00Z"
      }
    ],
    authUsers: [
      {
        id: "user-1",
        email: "alex@acme.test",
        created_at: "2026-05-01T00:00:00Z",
        last_sign_in_at: "2026-05-21T08:00:00Z",
        banned_until: null
      },
      {
        id: "user-2",
        email: "ivy@acme.test",
        created_at: "2026-05-10T00:00:00Z",
        last_sign_in_at: null,
        banned_until: null
      }
    ]
  });

  assert.equal(rows.length, 3);

  assert.deepEqual(rows.map((row) => row.email), [
    "alex@acme.test",
    "codes@acme.test",
    "ivy@acme.test"
  ]);

  assert.equal(rows[0]?.status, "active");
  assert.equal(rows[0]?.seatConsuming, true);
  assert.equal(rows[0]?.eventSummary.headline, "All company events");

  assert.equal(rows[1]?.isPendingInvite, true);
  assert.equal(rows[1]?.status, "invited");
  assert.equal(rows[1]?.seatConsuming, false);
  assert.equal(rows[1]?.eventSummary.headline, "All company events");
  assert.equal(rows[1]?.lastActivityOrInvitedAt, "2026-05-17T00:00:00Z");

  assert.equal(rows[2]?.isPendingInvite, false);
  assert.equal(rows[2]?.status, "invited");
  assert.equal(rows[2]?.eventSummary.headline, "1 specific event");
});

test("buildCompanyScopedUsersDirectoryData shows active and invited multi-event company-scoped users", () => {
  const rows = buildCompanyScopedUsersDirectoryData({
    nowMs: NOW_MS,
    overviewCompanies: [
      {
        companyId: "company-a",
        companyName: "Acme Labs",
        licenseId: "lic-a",
        licenseStatus: "active",
        licenseTier: "Professional",
        expiresAt: "2026-12-31",
        maxEvents: 4,
        seatsUsed: 2,
        seatsAllocated: 10,
        activeUsers: 1,
        pendingInvites: 1,
        activeEvents: 2,
        eventsThisMonth: 1,
        leadsCaptured: 8,
        lastActivityAt: "2026-05-22T10:00:00Z",
        usageHealth: "healthy"
      }
    ],
    users: [
      {
        id: "active-admin",
        full_name: "Active Admin",
        email: "active@acme.test",
        role: "exhibitor_admin",
        company_id: "company-a",
        event_access_mode: "assigned_events_only",
        created_at: "2026-05-01T00:00:00Z"
      },
      {
        id: "invited-admin",
        full_name: "Invited Admin",
        email: "invited@acme.test",
        role: "exhibitor_admin",
        company_id: "company-a",
        event_access_mode: "assigned_events_only",
        created_at: "2026-05-21T00:00:00Z"
      }
    ],
    events: [
      { id: "event-1", company_id: "company-a", name: "Expo East" },
      { id: "event-2", company_id: "company-a", name: "Expo West" },
      { id: "event-3", company_id: "company-a", name: "Expo North" }
    ],
    memberships: [
      {
        user_id: "active-admin",
        event_id: "event-1",
        exhibitor_company_id: "company-a",
        status: "active",
        permissions: { admin: true, app: true },
        created_at: "2026-05-03T00:00:00Z"
      },
      {
        user_id: "active-admin",
        event_id: "event-2",
        exhibitor_company_id: "company-a",
        status: "active",
        permissions: { admin: true, app: true },
        created_at: "2026-05-04T00:00:00Z"
      },
      {
        user_id: "invited-admin",
        event_id: "event-2",
        exhibitor_company_id: "company-a",
        status: "invited",
        permissions: { admin: true, app: true },
        created_at: "2026-05-05T00:00:00Z"
      },
      {
        user_id: "invited-admin",
        event_id: "event-3",
        exhibitor_company_id: "company-a",
        status: "invited",
        permissions: { admin: true, app: true },
        created_at: "2026-05-06T00:00:00Z"
      }
    ],
    pendingInvites: [],
    authUsers: [
      {
        id: "active-admin",
        email: "active@acme.test",
        created_at: "2026-05-01T00:00:00Z",
        last_sign_in_at: "2026-05-21T08:00:00Z",
        banned_until: null
      },
      {
        id: "invited-admin",
        email: "invited@acme.test",
        created_at: "2026-05-21T00:00:00Z",
        last_sign_in_at: null,
        banned_until: null
      }
    ]
  });

  assert.deepEqual(rows.map((row) => row.email), ["active@acme.test", "invited@acme.test"]);

  const active = rows.find((row) => row.id === "active-admin");
  assert.equal(active?.status, "active");
  assert.equal(active?.role, "exhibitor_admin");
  assert.equal(active?.eventSummary.headline, "2 specific events");
  assert.deepEqual(active?.assignedEventDetails.map((event) => event.id).sort(), ["event-1", "event-2"]);

  const invited = rows.find((row) => row.id === "invited-admin");
  assert.equal(invited?.status, "invited");
  assert.equal(invited?.role, "exhibitor_admin");
  assert.equal(invited?.eventSummary.headline, "2 specific events");
  assert.deepEqual(invited?.assignedEventDetails.map((event) => event.id).sort(), ["event-2", "event-3"]);
});

test("summarizeCompanyScopedUsersDirectory derives user directory cards from shared rows", () => {
  const summary = summarizeCompanyScopedUsersDirectory([
    {
      id: "user-1",
      isPendingInvite: false,
      fullName: "Alex Admin",
      email: "alex@acme.test",
      companyId: "company-a",
      companyName: "Acme Labs",
      role: "exhibitor_admin",
      status: "active",
      seatConsuming: true,
      eventAccessMode: "all_company_events",
      eventSummary: {
        kind: "all_company",
        headline: "All company events",
        subline: "2 today — new company events included automatically",
        previewNames: [],
        specificCount: 0
      },
      assignedEventDetails: [],
      lastActivityOrInvitedAt: "2026-05-21T08:00:00Z"
    },
    {
      id: "pending:company-a:codes@acme.test",
      isPendingInvite: true,
      fullName: null,
      email: "codes@acme.test",
      companyId: "company-a",
      companyName: "Acme Labs",
      role: "viewer",
      status: "invited",
      seatConsuming: false,
      eventAccessMode: "assigned_events_only",
      eventSummary: {
        kind: "specific",
        headline: "2 specific events",
        subline: "Expo East · Expo West",
        previewNames: ["Expo East", "Expo West"],
        specificCount: 2
      },
      assignedEventDetails: [
        { id: "event-1", name: "Expo East" },
        { id: "event-2", name: "Expo West" }
      ],
      lastActivityOrInvitedAt: "2026-05-17T00:00:00Z"
    }
  ]);

  assert.deepEqual(summary, {
    totalUsers: 2,
    activeUsers: 1,
    pendingInvites: 1,
    seatConsumingUsers: 1
  });
});

test("buildCompanyScopedEventsDirectoryData maps event usage back to licensed companies", () => {
  const rows = buildCompanyScopedEventsDirectoryData({
    overviewCompanies: [
      {
        companyId: "company-a",
        companyName: "Acme Labs",
        licenseId: "lic-a",
        licenseStatus: "active",
        licenseTier: "Professional",
        expiresAt: "2026-12-31",
        maxEvents: 5,
        seatsUsed: 4,
        seatsAllocated: 10,
        activeUsers: 3,
        pendingInvites: 1,
        activeEvents: 2,
        eventsThisMonth: 1,
        leadsCaptured: 12,
        lastActivityAt: "2026-05-21T00:00:00Z",
        usageHealth: "watch"
      }
    ],
    events: [
      {
        id: "event-1",
        name: "Expo East",
        company_id: "company-a",
        status: "active",
        is_active: true,
        start_date: "2026-05-04",
        end_date: "2026-05-06",
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-05-20T00:00:00Z"
      },
      {
        id: "event-2",
        name: "Expo West",
        company_id: "company-a",
        status: "upcoming",
        is_active: false,
        start_date: "2026-06-10",
        end_date: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-10T00:00:00Z"
      }
    ],
    memberships: [
      {
        user_id: "user-1",
        event_id: "event-1",
        exhibitor_company_id: "company-a",
        status: "active",
        permissions: { app: true },
        created_at: "2026-05-18T00:00:00Z"
      },
      {
        user_id: "user-2",
        event_id: "event-1",
        exhibitor_company_id: "company-a",
        status: "invited",
        permissions: { admin: true },
        created_at: "2026-05-19T00:00:00Z"
      },
      {
        user_id: "user-3",
        event_id: "event-2",
        exhibitor_company_id: "company-a",
        status: "active",
        permissions: { app: true },
        created_at: "2026-05-08T00:00:00Z"
      }
    ],
    leads: [
      {
        company_id: "company-a",
        event_id: "event-1",
        created_at: "2026-05-15T00:00:00Z",
        updated_at: "2026-05-21T00:00:00Z"
      },
      {
        company_id: "company-a",
        event_id: "event-1",
        created_at: "2026-05-16T00:00:00Z",
        updated_at: "2026-05-22T00:00:00Z"
      }
    ],
    nowMs: NOW_MS
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.eventId, "event-1");
  assert.equal(rows[0]?.eventName, "Expo East");
  assert.equal(rows[0]?.usersAssigned, 2);
  assert.equal(rows[0]?.leadsCaptured, 2);
  assert.equal(rows[0]?.licenseTier, "Professional");
  assert.equal(rows[0]?.usageHealth, "watch");
  assert.equal(rows[0]?.lastActivityAt, "2026-05-22T00:00:00Z");

  assert.equal(rows[1]?.eventId, "event-2");
  assert.equal(rows[1]?.usersAssigned, 1);
  assert.equal(rows[1]?.leadsCaptured, 0);
  assert.equal(rows[1]?.endDate, null);
});

test("summarizeCompanyScopedEventsDirectory derives event dashboard cards from shared rows", () => {
  const summary = summarizeCompanyScopedEventsDirectory(
    [
      {
        eventId: "event-1",
        eventName: "Expo East",
        companyId: "company-a",
        companyName: "Acme Labs",
        status: "active",
        startDate: "2026-05-04",
        endDate: "2026-05-06",
        usersAssigned: 2,
        leadsCaptured: 4,
        licenseTier: "Professional",
        usageHealth: "healthy",
        lastActivityAt: "2026-05-20T00:00:00Z"
      },
      {
        eventId: "event-2",
        eventName: "Expo West",
        companyId: "company-a",
        companyName: "Acme Labs",
        status: "upcoming",
        startDate: "2026-05-28",
        endDate: null,
        usersAssigned: 1,
        leadsCaptured: 0,
        licenseTier: "Professional",
        usageHealth: "watch",
        lastActivityAt: "2026-05-10T00:00:00Z"
      },
      {
        eventId: "event-3",
        eventName: "Summit South",
        companyId: "company-b",
        companyName: "Bravo Systems",
        status: "completed",
        startDate: "2026-04-02",
        endDate: "2026-04-03",
        usersAssigned: 3,
        leadsCaptured: 8,
        licenseTier: "Starter",
        usageHealth: "inactive",
        lastActivityAt: "2026-04-05T00:00:00Z"
      }
    ],
    { nowMs: NOW_MS }
  );

  assert.deepEqual(summary, {
    totalEvents: 3,
    activeEvents: 1,
    eventsThisMonth: 2,
    companiesRunningEvents: 2
  });
});
