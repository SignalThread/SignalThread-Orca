import test from "node:test";
import assert from "node:assert/strict";
import { INVITE_USER_METADATA } from "../lib/data/platform-admin";
import { buildCompanyMemberInviteAuthData } from "../lib/exhibitor/company-admin-invite-metadata";
import { buildCompanyTeamEventAccessSummary } from "../lib/exhibitor/company-team-access-present";
import { deriveCompanyTeamMemberStatus } from "../lib/exhibitor/company-team-member-status";
import { companyMemberRoleProductLabel } from "../lib/exhibitor/company-member-role-label";
import {
  companyTeamRowMenuFlags,
  companyTeamTableStatusLabel,
  shortCompanyTeamEventAccessLabel
} from "../lib/exhibitor/company-team-table-display";

test("deriveCompanyTeamMemberStatus: active when last sign-in present", () => {
  assert.equal(
    deriveCompanyTeamMemberStatus(
      { bannedUntil: null, lastSignInAt: "2020-01-01T00:00:00Z", createdAtAuth: "2019-01-01T00:00:00Z" },
      { nowMs: Date.parse("2026-01-01T00:00:00Z") }
    ),
    "active"
  );
});

test("deriveCompanyTeamMemberStatus: disabled when banned_until in future", () => {
  assert.equal(
    deriveCompanyTeamMemberStatus(
      {
        bannedUntil: "2099-01-01T00:00:00Z",
        lastSignInAt: null,
        createdAtAuth: "2026-01-01T00:00:00Z"
      },
      { nowMs: Date.parse("2026-06-01T00:00:00Z") }
    ),
    "disabled"
  );
});

test("deriveCompanyTeamMemberStatus: invited vs expired from auth created_at", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");
  assert.equal(
    deriveCompanyTeamMemberStatus(
      {
        bannedUntil: null,
        lastSignInAt: null,
        createdAtAuth: "2026-05-20T00:00:00Z"
      },
      { nowMs: now, staleDays: 14 }
    ),
    "invited"
  );
  assert.equal(
    deriveCompanyTeamMemberStatus(
      {
        bannedUntil: null,
        lastSignInAt: null,
        createdAtAuth: "2026-04-01T00:00:00Z"
      },
      { nowMs: now, staleDays: 14 }
    ),
    "expired"
  );
});

test("buildCompanyTeamEventAccessSummary: all company events with counts", () => {
  const s = buildCompanyTeamEventAccessSummary({
    eventAccessMode: "all_company_events",
    companyOwnedEventCount: 3,
    assignedEvents: []
  });
  assert.equal(s.kind, "all_company");
  assert.match(s.headline, /All company events/);
  assert.match(String(s.subline), /3 today/);
});

test("buildCompanyTeamEventAccessSummary: specific N events", () => {
  const s = buildCompanyTeamEventAccessSummary({
    eventAccessMode: "assigned_events_only",
    companyOwnedEventCount: 99,
    assignedEvents: [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Gamma" }
    ]
  });
  assert.equal(s.kind, "specific");
  assert.equal(s.specificCount, 3);
  assert.match(s.headline, /3 specific events/);
});

test("buildCompanyTeamEventAccessSummary: assigned mode but zero rows → no event access", () => {
  const s = buildCompanyTeamEventAccessSummary({
    eventAccessMode: "assigned_events_only",
    companyOwnedEventCount: 5,
    assignedEvents: []
  });
  assert.equal(s.kind, "none");
  assert.match(s.headline, /No event access/);
});

test("invite metadata: exhibitor_admin + all company events", () => {
  const data = buildCompanyMemberInviteAuthData({
    companyId: "co_1",
    dbRole: "exhibitor_admin",
    eventAccessMode: "all_company_events",
    assignedEventIds: [],
    fullName: "Alex"
  });
  assert.equal(data[INVITE_USER_METADATA.ROLE], "exhibitor_admin");
  assert.equal(data[INVITE_USER_METADATA.EVENT_ACCESS_MODE], "all_company_events");
  assert.deepEqual(data[INVITE_USER_METADATA.ASSIGNED_EVENT_IDS], []);
});

test("invite metadata: viewer + specific events only", () => {
  const data = buildCompanyMemberInviteAuthData({
    companyId: "co_1",
    dbRole: "viewer",
    eventAccessMode: "assigned_events_only",
    assignedEventIds: ["e1", "e2"],
    fullName: "Blair"
  });
  assert.equal(data[INVITE_USER_METADATA.ROLE], "viewer");
  assert.equal(data[INVITE_USER_METADATA.EVENT_ACCESS_MODE], "assigned_events_only");
  assert.deepEqual(data[INVITE_USER_METADATA.ASSIGNED_EVENT_IDS], ["e1", "e2"]);
});

test("companyMemberRoleProductLabel maps viewer to App user", () => {
  assert.equal(companyMemberRoleProductLabel("exhibitor_admin"), "Exhibitor admin");
  assert.equal(companyMemberRoleProductLabel("viewer"), "App user");
  assert.equal(companyMemberRoleProductLabel(null), "App user");
});

test("shortCompanyTeamEventAccessLabel: all, none, counts", () => {
  assert.equal(
    shortCompanyTeamEventAccessLabel({ eventAccessMode: "all_company_events", assignedEventCount: 0 }),
    "All events"
  );
  assert.equal(
    shortCompanyTeamEventAccessLabel({ eventAccessMode: "assigned_events_only", assignedEventCount: 0 }),
    "No access"
  );
  assert.equal(
    shortCompanyTeamEventAccessLabel({ eventAccessMode: "assigned_events_only", assignedEventCount: 1 }),
    "1 event"
  );
  assert.equal(
    shortCompanyTeamEventAccessLabel({ eventAccessMode: "assigned_events_only", assignedEventCount: 3 }),
    "3 events"
  );
});

test("companyTeamTableStatusLabel: Active | Invited | Expired | Disabled", () => {
  assert.equal(companyTeamTableStatusLabel("active"), "Active");
  assert.equal(companyTeamTableStatusLabel("invited"), "Invited");
  assert.equal(companyTeamTableStatusLabel("expired"), "Expired");
  assert.equal(companyTeamTableStatusLabel("disabled"), "Disabled");
});

test("companyTeamRowMenuFlags: real user — resend for pending, disable for signed-in states, delete always", () => {
  assert.deepEqual(companyTeamRowMenuFlags({ status: "invited" }), {
    showEdit: true,
    showResendInvite: true,
    showRevokeInvite: true,
    showCancelInvite: false,
    showDisable: false,
    disableIsReEnable: false,
    showDelete: true
  });
  assert.deepEqual(companyTeamRowMenuFlags({ status: "expired" }), {
    showEdit: true,
    showResendInvite: true,
    showRevokeInvite: true,
    showCancelInvite: false,
    showDisable: false,
    disableIsReEnable: false,
    showDelete: true
  });
  assert.deepEqual(companyTeamRowMenuFlags({ status: "active" }), {
    showEdit: true,
    showResendInvite: false,
    showRevokeInvite: false,
    showCancelInvite: false,
    showDisable: true,
    disableIsReEnable: false,
    showDelete: true
  });
  assert.deepEqual(companyTeamRowMenuFlags({ status: "disabled" }), {
    showEdit: true,
    showResendInvite: false,
    showRevokeInvite: false,
    showCancelInvite: false,
    showDisable: true,
    disableIsReEnable: true,
    showDelete: true
  });
});

test("companyTeamRowMenuFlags: pending App-user invite row — only Resend + Cancel", () => {
  const flags = companyTeamRowMenuFlags({ status: "invited", isPendingInvite: true });
  assert.deepEqual(flags, {
    showEdit: false,
    showResendInvite: true,
    showRevokeInvite: false,
    showCancelInvite: true,
    showDisable: false,
    disableIsReEnable: false,
    showDelete: false
  });

  const expired = companyTeamRowMenuFlags({ status: "expired", isPendingInvite: true });
  assert.equal(expired.showResendInvite, true);
  assert.equal(expired.showCancelInvite, true);
  assert.equal(expired.showEdit, false);
  assert.equal(expired.showDelete, false);
  assert.equal(expired.showDisable, false);
});

/**
 * Server actions in `company-team-management.ts` (resend, revoke, update, remove, disable) require
 * Supabase Admin and are enforced there; extend with integration tests when a test double exists.
 */
