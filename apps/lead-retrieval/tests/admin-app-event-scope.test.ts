import test from "node:test";
import assert from "node:assert/strict";
import {
  isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess,
  buildExhibitorAdminAccessibleEvents,
  pickValidatedActiveAdminEventId,
  primaryOrganizerAdminAccessibleEvents
} from "../lib/licenses/exhibitor-company-license-admin-eligibility";
import { isExhibitorMultiEventAdminPathAllowed } from "../lib/admin/exhibitor-admin-paths";

const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const past = (ms: number) => new Date(Date.now() - ms).toISOString();

test("ineligible: no license row", () => {
  assert.equal(isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(null, Date.now()), false);
});

test("eligible company-scoped license: active, unexpired, started", () => {
  assert.equal(
    isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(
      { scope: "company", status: "active", expires_at: future(60_000), starts_at: past(60_000) },
      Date.now()
    ),
    true
  );
});

test("ineligible: wrong scope", () => {
  assert.equal(
    isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(
      { scope: "event", status: "active", expires_at: future(60_000), starts_at: null },
      Date.now()
    ),
    false
  );
});

test("ineligible: inactive status", () => {
  assert.equal(
    isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(
      { scope: "company", status: "suspended", expires_at: future(60_000), starts_at: null },
      Date.now()
    ),
    false
  );
});

test("ineligible: expired", () => {
  assert.equal(
    isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(
      { scope: "company", status: "active", expires_at: past(60_000), starts_at: null },
      Date.now()
    ),
    false
  );
});

test("ineligible: not yet started", () => {
  assert.equal(
    isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(
      { scope: "company", status: "active", expires_at: future(120_000), starts_at: future(60_000) },
      Date.now()
    ),
    false
  );
});

test("exhibitor multi-event: all company-owned events when licensed", () => {
  const evs = buildExhibitorAdminAccessibleEvents({
    multiEventLicensed: true,
    companyId: "c1",
    companyOwnedEvents: [
      { id: "e2", name: "B" },
      { id: "e1", name: "A" }
    ],
    membershipEvent: { id: "m1", name: "Member" }
  });
  assert.deepEqual(
    evs.map((e) => e.id),
    ["e2", "e1"]
  );
});

test("exhibitor single: membership only without company multi license", () => {
  const evs = buildExhibitorAdminAccessibleEvents({
    multiEventLicensed: false,
    companyId: "c1",
    companyOwnedEvents: [{ id: "e1", name: "Owned" }],
    membershipEvent: { id: "m1", name: "Member" }
  });
  assert.deepEqual(evs, [{ id: "m1", name: "Member" }]);
});

test("exhibitor without company id: empty accessible list", () => {
  assert.deepEqual(
    buildExhibitorAdminAccessibleEvents({
      multiEventLicensed: true,
      companyId: null,
      companyOwnedEvents: [{ id: "e1", name: "A" }],
      membershipEvent: null
    }),
    []
  );
});

test("pickValidatedActiveAdminEventId: tampered cookie falls back to first in scope", () => {
  assert.equal(pickValidatedActiveAdminEventId(["a", "b"], "other"), "a");
  assert.equal(pickValidatedActiveAdminEventId(["a", "b"], "b"), "b");
  assert.equal(pickValidatedActiveAdminEventId([], "x"), null);
});

test("organizer admin: primary event only from ordered list", () => {
  assert.deepEqual(
    primaryOrganizerAdminAccessibleEvents([
      { id: "first", name: "First" },
      { id: "second", name: "Second" }
    ]),
    [{ id: "first", name: "First" }]
  );
  assert.deepEqual(primaryOrganizerAdminAccessibleEvents([]), []);
});

test("active event selection only allows ids within resolved exhibitor scope", () => {
  const ids = ["e1", "e2"];
  assert.equal(pickValidatedActiveAdminEventId(ids, "e2"), "e2");
  assert.equal(pickValidatedActiveAdminEventId(ids, "evil"), "e1");
});

test("exhibitor multi-event admin path allowlist blocks platform surfaces", () => {
  assert.equal(isExhibitorMultiEventAdminPathAllowed("/admin/events"), true);
  assert.equal(isExhibitorMultiEventAdminPathAllowed("/admin/integrations/salesforce/setup"), true);
  assert.equal(isExhibitorMultiEventAdminPathAllowed("/admin/integrations/zapier"), true);
  assert.equal(isExhibitorMultiEventAdminPathAllowed("/admin/integrations"), false);
  assert.equal(isExhibitorMultiEventAdminPathAllowed("/admin/exhibitors"), false);
  assert.equal(isExhibitorMultiEventAdminPathAllowed("/admin/licenses"), false);
});
