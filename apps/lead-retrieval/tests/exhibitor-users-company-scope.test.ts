import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  exhibitorManagementVisibleUserIds,
  rollupExhibitorMembershipsByUserId
} from "@/lib/data/exhibitor-users-company-scope";

describe("exhibitor Users page — company scope + membership rollup", () => {
  it("lists every company user id (membership never hides a row)", () => {
    const companyProfiles = [{ id: "u-a" }, { id: "u-b" }];
    const ids = companyProfiles.map((u) => u.id);
    assert.deepEqual(exhibitorManagementVisibleUserIds(ids), ["u-a", "u-b"]);
  });

  it("exhibitor_viewer with company_id match appears with no event_users for exhibitor slice (metadata only)", () => {
    const companyUserIds = ["viewer-1"];
    const membershipRows: Array<{
      user_id: string;
      event_id: string;
      status: string | null;
      permissions: unknown;
    }> = [];
    const rollup = rollupExhibitorMembershipsByUserId(membershipRows);
    assert.deepEqual(exhibitorManagementVisibleUserIds(companyUserIds), ["viewer-1"]);
    assert.equal(rollup.has("viewer-1"), false);
  });

  it("app-only user with app on another event still has app metadata when UI event differs", () => {
    const rollup = rollupExhibitorMembershipsByUserId([
      {
        user_id: "u1",
        event_id: "evt-other",
        status: "active",
        permissions: { app: true, admin: false }
      }
    ]);
    const m = rollup.get("u1");
    assert.equal(m?.appAccess, true);
    assert.equal(m?.appAccessEventCount, 1);
    assert.equal(m?.membershipStatusForDisplay, null);
  });

  it("counts distinct app events and prefers pending over invited for status chip", () => {
    const rollup = rollupExhibitorMembershipsByUserId([
      {
        user_id: "u1",
        event_id: "e1",
        status: "invited",
        permissions: { app: true, admin: false }
      },
      {
        user_id: "u1",
        event_id: "e2",
        status: "pending",
        permissions: { app: true, admin: false }
      },
      {
        user_id: "u1",
        event_id: "e2",
        status: "active",
        permissions: { app: true, admin: false }
      }
    ]);
    const m = rollup.get("u1");
    assert.equal(m?.appAccessEventCount, 2);
    assert.equal(m?.membershipStatusForDisplay, "pending");
  });

  it("surfaces invited when no pending row exists", () => {
    const rollup = rollupExhibitorMembershipsByUserId([
      {
        user_id: "u1",
        event_id: "e1",
        status: "invited",
        permissions: { app: true, admin: false }
      }
    ]);
    assert.equal(rollup.get("u1")?.membershipStatusForDisplay, "invited");
  });
});
