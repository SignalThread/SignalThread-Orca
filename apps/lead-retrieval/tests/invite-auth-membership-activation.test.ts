import test from "node:test";
import assert from "node:assert/strict";
import {
  filterInvitedMembershipRowsForActivation,
  resolveInviteActivationScopeFromAuthMetadata,
  type InvitedMembershipActivationCandidate
} from "../lib/server/invites/invite-auth-membership-activation";
import { resolveExhibitorInviteEventId } from "../lib/server/invites/exhibitor-invite-event-scope";
import {
  resolveAccessibleEventIdsForUserWithDeps,
  type ResolveAccessibleEventIdsDeps
} from "../lib/server/company-event-access-core";
import { INVITE_USER_METADATA } from "../lib/data/platform-admin";

function makeResolverDeps(activeEventIds: string[]): ResolveAccessibleEventIdsDeps {
  return {
    loadUser: async (userId) =>
      userId === "user-1"
        ? {
            id: "user-1",
            role: "exhibitor_admin",
            companyId: "company-1",
            eventAccessMode: "assigned_events_only"
          }
        : null,
    loadCompanyLicenseEligibility: async () => false,
    loadCompanyOwnedEventIds: async () => ["event-1", "event-2", "event-3"],
    loadAssignedCompanyEventIds: async () => [...activeEventIds],
    loadLegacyEventIds: async () => [...activeEventIds],
    loadOrganizerEventIds: async () => []
  };
}

test("invite acceptance activates only matching invited memberships and exposes the assigned event", async () => {
  const invitedRows: InvitedMembershipActivationCandidate[] = [
    {
      id: "eu-1",
      event_id: "event-1",
      exhibitor_company_id: "company-1",
      status: "invited"
    },
    {
      id: "eu-2",
      event_id: "event-2",
      exhibitor_company_id: "company-1",
      status: "invited"
    },
    {
      id: "eu-3",
      event_id: "event-9",
      exhibitor_company_id: "company-2",
      status: "invited"
    }
  ];

  const activationScope = resolveInviteActivationScopeFromAuthMetadata({
    [INVITE_USER_METADATA.COMPANY_ID]: "company-1",
    [INVITE_USER_METADATA.EVENT_ID]: "event-1",
    [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: ["event-1"]
  });

  assert.deepEqual(activationScope, {
    exhibitorCompanyId: "company-1",
    eventIds: ["event-1"]
  });

  const targetedRows = filterInvitedMembershipRowsForActivation(invitedRows, activationScope);

  assert.deepEqual(
    targetedRows.map((row) => row.id),
    ["eu-1"],
    "only the invited membership linked to the accepted invite should activate"
  );

  const resolved = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "user-1" },
    makeResolverDeps(targetedRows.map((row) => String(row.event_id ?? "")))
  );

  assert.deepEqual(resolved.eventIds, ["event-1"]);
  assert.equal(resolved.resolution, "legacy_event_scoped");
  assert.equal(
    targetedRows.some((row) => row.id === "eu-2" || row.id === "eu-3"),
    false,
    "unrelated invited memberships must remain untouched"
  );
});

test("multi-event invite activation scope includes every assigned event", () => {
  const invitedRows: InvitedMembershipActivationCandidate[] = [
    {
      id: "eu-1",
      event_id: "event-1",
      exhibitor_company_id: "company-1",
      status: "invited"
    },
    {
      id: "eu-2",
      event_id: "event-2",
      exhibitor_company_id: "company-1",
      status: "invited"
    },
    {
      id: "eu-3",
      event_id: "event-3",
      exhibitor_company_id: "company-1",
      status: "invited"
    }
  ];

  const activationScope = resolveInviteActivationScopeFromAuthMetadata({
    [INVITE_USER_METADATA.COMPANY_ID]: "company-1",
    [INVITE_USER_METADATA.EVENT_ID]: "event-1",
    [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: ["event-1", "event-2"]
  });

  const targetedRows = filterInvitedMembershipRowsForActivation(invitedRows, activationScope);
  assert.deepEqual(
    targetedRows.map((row) => row.id),
    ["eu-1", "eu-2"],
    "all selected invite memberships should activate, and unselected rows should not"
  );
});

test("multi-event invite activation exposes exactly the activated events to dashboard resolver", async () => {
  const memberships: Array<InvitedMembershipActivationCandidate & { user_id: string; status: string }> = [
    {
      id: "eu-1",
      user_id: "user-1",
      event_id: "event-1",
      exhibitor_company_id: "company-1",
      status: "invited"
    },
    {
      id: "eu-2",
      user_id: "user-1",
      event_id: "event-2",
      exhibitor_company_id: "company-1",
      status: "invited"
    },
    {
      id: "eu-3",
      user_id: "user-1",
      event_id: "event-3",
      exhibitor_company_id: "company-1",
      status: "invited"
    },
    {
      id: "eu-4",
      user_id: "other-user",
      event_id: "event-9",
      exhibitor_company_id: "company-1",
      status: "invited"
    }
  ];

  const activationScope = resolveInviteActivationScopeFromAuthMetadata({
    [INVITE_USER_METADATA.COMPANY_ID]: "company-1",
    [INVITE_USER_METADATA.EVENT_ID]: "event-1",
    [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: ["event-1", "event-2"]
  });

  const targetedRows = filterInvitedMembershipRowsForActivation(
    memberships.filter((row) => row.user_id === "user-1"),
    activationScope
  );
  const targetedIds = new Set(targetedRows.map((row) => row.id));
  for (const row of memberships) {
    if (targetedIds.has(row.id)) row.status = "active";
  }

  assert.deepEqual(
    memberships.filter((row) => row.user_id === "user-1" && row.status === "active").map((row) => row.id),
    ["eu-1", "eu-2"]
  );
  assert.equal(memberships.find((row) => row.id === "eu-3")?.status, "invited");
  assert.equal(memberships.find((row) => row.id === "eu-4")?.status, "invited");

  const resolved = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "user-1" },
    makeResolverDeps(
      memberships
        .filter((row) => row.user_id === "user-1" && row.status === "active")
        .map((row) => String(row.event_id ?? ""))
    )
  );

  assert.deepEqual(resolved.eventIds, ["event-1", "event-2"]);
  assert.equal(resolved.resolution, "legacy_event_scoped");
});


test("event-scoped inviter auto-binds the current assigned event", () => {
  const resolved = resolveExhibitorInviteEventId({
    requestedEventId: null,
    activeEventId: "event-2",
    accessibleEventIds: ["event-1", "event-2"],
    accessResolution: "company_assigned_only"
  });

  assert.deepEqual(resolved, { eventId: "event-2", error: null });
});

test("company-scoped inviter keeps explicit event selection behavior", () => {
  const resolved = resolveExhibitorInviteEventId({
    requestedEventId: "event-3",
    activeEventId: "event-1",
    accessibleEventIds: ["event-1", "event-2", "event-3"],
    accessResolution: "company_all_events"
  });

  assert.deepEqual(resolved, { eventId: "event-3", error: null });
});

test("missing event context fails loudly for company-scoped invite flows", () => {
  const resolved = resolveExhibitorInviteEventId({
    requestedEventId: null,
    activeEventId: null,
    accessibleEventIds: ["event-1", "event-2"],
    accessResolution: "company_all_events"
  });

  assert.equal(resolved.eventId, null);
  assert.match(String(resolved.error ?? ""), /choose an event/i);
});
