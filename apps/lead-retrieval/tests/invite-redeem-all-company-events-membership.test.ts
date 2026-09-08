/**
 * Regression: all_events (all_company_events) invites must expand the grant set to
 * every `events.id` for `events.company_id = exhibitor company`, not only invite/pending rows.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { expandGrantEventIdsForAllCompanyEventsMode } from "../lib/server/invites/invite-redeem-plan";

test("all-events scope: expanded grant list length equals every catalog event plus invite safety union", () => {
  const planIds = ["e-a", "e-b"];
  const catalog = ["e-b", "e-c", "e-d", "e-e"];
  const out = expandGrantEventIdsForAllCompanyEventsMode({
    userEventAccessMode: "all_company_events",
    planGrantEventIds: planIds,
    companyOwnedEventIds: catalog
  });
  assert.equal(out.length, 5, "expect one row per company event to be materialized in redeem");
  assert.deepEqual(
    new Set(out),
    new Set([...planIds, ...catalog]),
    "redeem loop must run for every company event the invite expands to"
  );
});
