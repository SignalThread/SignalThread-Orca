import test from "node:test";
import assert from "node:assert/strict";
import { INVITE_USER_METADATA } from "../lib/data/platform-admin";
import {
  buildCompanyAdminInviteAuthData,
  companyAdminInviteMetadataHasNoEventId
} from "../lib/exhibitor/company-admin-invite-metadata";

test("company admin invite auth data omits event id (invite before any event exists)", () => {
  const data = buildCompanyAdminInviteAuthData({
    companyId: "co_1",
    eventAccessMode: "assigned_events_only",
    fullName: "Pat"
  });
  assert.equal(companyAdminInviteMetadataHasNoEventId(data), true);
  assert.ok(!(INVITE_USER_METADATA.EVENT_ID in data));
  assert.deepEqual(data[INVITE_USER_METADATA.ASSIGNED_EVENT_IDS], []);
  assert.equal(data[INVITE_USER_METADATA.COMPANY_ID], "co_1");
  assert.equal(data[INVITE_USER_METADATA.ROLE], "exhibitor_admin");
  assert.equal(data.full_name, "Pat");
});

test("companyAdminInviteMetadataHasNoEventId: false when event id present", () => {
  const data = {
    ...buildCompanyAdminInviteAuthData({ companyId: "c", eventAccessMode: "all_company_events" }),
    [INVITE_USER_METADATA.EVENT_ID]: "evt_1"
  };
  assert.equal(companyAdminInviteMetadataHasNoEventId(data), false);
});
