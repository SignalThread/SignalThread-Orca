import assert from "node:assert/strict";
import test from "node:test";
import {
  attentionUrgencyScore,
  buildExhibitorsNeedingAttention,
  countLicensedExhibitors,
  countSentCampaignsForExhibitorCompanies
} from "../lib/data/organizer-event-dashboard.ts";

test("countSentCampaignsForExhibitorCompanies counts only sent status for scoped companies", () => {
  const companies = new Set(["a", "b"]);
  const campaigns = [
    { company_id: "a", status: "sent" },
    { company_id: "a", status: "draft" },
    { company_id: "b", status: "SENT" },
    { company_id: "b", status: "scheduled" },
    { company_id: "c", status: "sent" },
    { company_id: null, status: "sent" }
  ];
  assert.equal(countSentCampaignsForExhibitorCompanies(campaigns, companies), 2);
});

test("countSentCampaignsForExhibitorCompanies returns 0 for empty scope", () => {
  assert.equal(
    countSentCampaignsForExhibitorCompanies([{ company_id: "a", status: "sent" }], new Set()),
    0
  );
});

test("buildExhibitorsNeedingAttention returns structured issues and sorts by urgency", () => {
  const rows = buildExhibitorsNeedingAttention([
    {
      exhibitorId: "e1",
      companyId: "c1",
      name: "A",
      leadCount: 5,
      activeUserCount: 2,
      pendingInviteCount: 0,
      seatsTotal: 10,
      seatsUsed: 2
    },
    {
      exhibitorId: "e2",
      companyId: "c2",
      name: "B",
      leadCount: 0,
      activeUserCount: 0,
      pendingInviteCount: 2,
      seatsTotal: 4,
      seatsUsed: 0
    }
  ]);
  assert.equal(rows.length, 2);
  const b = rows.find((r) => r.companyId === "c2");
  assert.ok(b?.issues.some((i) => i.kind === "no_leads"));
  assert.ok(b?.issues.some((i) => i.kind === "pending_invites" && i.inviteCount === 2));
  assert.ok(rows[0].urgencyScore >= rows[1].urgencyScore);
});

test("attentionUrgencyScore ranks no-active-users above low-activation alone", () => {
  const high = attentionUrgencyScore([{ kind: "no_active_users" }]);
  const low = attentionUrgencyScore([{ kind: "low_activation" }]);
  assert.ok(high > low);
});

test("countLicensedExhibitors counts overlap only", () => {
  assert.equal(countLicensedExhibitors(["a", "b", "c"], new Set(["a", "c"])), 2);
});
