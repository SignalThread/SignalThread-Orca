import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPendingInvitePlatformUserRow,
  normalizeAdminUserTableRole,
  pendingInviteTableEventIdFromMetadata,
  PLATFORM_WIDE_EVENT_ID
} from "../lib/data/platform-admin";

test("normalizeAdminUserTableRole keeps platform_admin", () => {
  assert.equal(normalizeAdminUserTableRole("platform_admin"), "platform_admin");
});

test("normalizeAdminUserTableRole maps organizer variants", () => {
  assert.equal(normalizeAdminUserTableRole("organizer_admin"), "organizer_admin");
  assert.equal(normalizeAdminUserTableRole("event_organizer"), "organizer_admin");
});

test("normalizeAdminUserTableRole maps exhibitor variants", () => {
  assert.equal(normalizeAdminUserTableRole("exhibitor_admin"), "exhibitor_admin");
});

test("normalizeAdminUserTableRole drops unknown roles", () => {
  assert.equal(normalizeAdminUserTableRole("superuser"), null);
});

test("pendingInviteTableEventIdFromMetadata keeps event-scoped auth invites event-scoped", () => {
  assert.equal(
    pendingInviteTableEventIdFromMetadata({
      invite_event_id: "event-1",
      invite_company_id: "company-1"
    }),
    "event-1"
  );
});

test("pendingInviteTableEventIdFromMetadata keeps company-scoped auth-only invites listable", () => {
  assert.equal(
    pendingInviteTableEventIdFromMetadata({
      invite_event_id: "",
      invite_company_id: "company-1",
      invite_exhibitor_company_id: "company-1"
    }),
    PLATFORM_WIDE_EVENT_ID
  );
});

test("pendingInviteTableEventIdFromMetadata ignores auth users without invite scope metadata", () => {
  assert.equal(pendingInviteTableEventIdFromMetadata({ full_name: "Zach Gossin" }), null);
});

test("buildPendingInvitePlatformUserRow prefers auth invite fields over malformed public profile", () => {
  const row = buildPendingInvitePlatformUserRow(
    {
      id: "auth-zach",
      email: "zach@signalthread.ai",
      user_metadata: {
        full_name: "Zach Gossin",
        invite_assigned_event_ids: [],
        invite_company_id: "company-signalthread",
        invite_event_access_mode: "all_company_events",
        invite_event_id: "",
        invite_exhibitor_company_id: "company-signalthread",
        invite_role: "exhibitor_admin"
      }
    },
    {
      full_name: "Zach",
      email: "Gossin",
      role: "platform_admin"
    }
  );

  assert.deepEqual(row, {
    id: "auth-zach",
    fullName: "Zach Gossin",
    email: "zach@signalthread.ai",
    role: "exhibitor_admin",
    eventId: PLATFORM_WIDE_EVENT_ID,
    exhibitorId: "company-signalthread",
    status: "invite_pending",
    rowSource: "invite_pending",
    sourceEventId: null
  });
});
