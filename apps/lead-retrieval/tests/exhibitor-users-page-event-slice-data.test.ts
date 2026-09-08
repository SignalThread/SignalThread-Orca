import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  eventScopeAccessLabel,
  exhibitorUserDisplayName,
  filterEventUsersRowsForExhibitorUsersPage,
  parseExhibitorEventUserPermissionFlags,
  userIdsOnExhibitorEventSlice
} from "@/lib/data/exhibitor-users-company-scope";

/**
 * Regression: exhibitor Users page (event-scoped) must list user_ids from event_users for the
 * slice, including exhibitor_viewer + app-only permissions — not only profiles matched via a
 * separate company-only users query.
 */
describe("exhibitor Users page — event slice listing inputs", () => {
  it("includes Zach-shaped active admin/app assignment from event_users for the selected event and company", () => {
    const zachMembership = {
      id: "06c3a594-9305-4ab9-b193-18d270231c10",
      event_id: "b725efc4-4c19-4500-aa0d-156554b5204c",
      user_id: "60887cf4-6f9e-4c73-9fbc-13754c452029",
      exhibitor_company_id: "3fad38c8-d490-42f9-b675-190ccd3f3087",
      status: "active",
      permissions: { app: true, admin: true }
    };
    const filtered = filterEventUsersRowsForExhibitorUsersPage([zachMembership]);
    const ids = userIdsOnExhibitorEventSlice(filtered);

    assert.deepEqual(ids, ["60887cf4-6f9e-4c73-9fbc-13754c452029"]);
    const flags = parseExhibitorEventUserPermissionFlags(zachMembership.permissions);
    assert.deepEqual(flags, { admin: true, app: true });
    assert.equal(eventScopeAccessLabel(flags), "web_admin");
  });

  it("falls back to email when full_name is null or empty", () => {
    assert.equal(exhibitorUserDisplayName({ full_name: null, email: "zachg10@gmail.com" }), "zachg10@gmail.com");
    assert.equal(exhibitorUserDisplayName({ full_name: " ", email: "zachg10@gmail.com" }), "zachg10@gmail.com");
  });

  it("includes an active app-only user id from event_users rows for the exhibitor event slice", () => {
    const raw = [
      {
        user_id: "viewer-app",
        event_id: "evt-1",
        status: "active",
        permissions: { app: true, admin: false }
      },
      {
        user_id: "admin-web",
        event_id: "evt-1",
        status: "active",
        permissions: { app: false, admin: true }
      }
    ];
    const filtered = filterEventUsersRowsForExhibitorUsersPage(raw);
    const ids = userIdsOnExhibitorEventSlice(filtered);
    assert.ok(ids.includes("viewer-app"));
    assert.ok(ids.includes("admin-web"));

    const appFlags = parseExhibitorEventUserPermissionFlags(raw[0].permissions);
    assert.deepEqual(appFlags, { admin: false, app: true });
    assert.equal(eventScopeAccessLabel(appFlags), "app_only");

    const adminFlags = parseExhibitorEventUserPermissionFlags(raw[1].permissions);
    assert.equal(eventScopeAccessLabel(adminFlags), "web_admin");
  });

  it("drops inactive memberships from the slice inputs", () => {
    const raw = [
      { user_id: "gone", status: "removed", permissions: {} },
      { user_id: "here", status: "active", permissions: { app: true, admin: false } }
    ];
    const filtered = filterEventUsersRowsForExhibitorUsersPage(raw);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.user_id, "here");
  });

  it("does not show inactive memberships as active assignments", () => {
    const raw = [
      { user_id: "inactive-user", status: "inactive", permissions: { app: true, admin: true } },
      { user_id: "active-user", status: "ACTIVE", permissions: { app: true, admin: true } }
    ];
    const filtered = filterEventUsersRowsForExhibitorUsersPage(raw);
    assert.deepEqual(userIdsOnExhibitorEventSlice(filtered), ["active-user"]);
  });
});
