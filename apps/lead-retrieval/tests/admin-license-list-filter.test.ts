import test from "node:test";
import assert from "node:assert/strict";
import { licenseRowMatchesSelectedEventFilter } from "../lib/licenses/admin-license-list-filter";

test("no selected event: all rows visible", () => {
  assert.equal(
    licenseRowMatchesSelectedEventFilter({
      license: {
        eventId: null,
        scope: "company",
        exhibitorCompanyId: "ex-1"
      },
      selectedEventId: "",
      participatingCompanyIdsOnSelectedEvent: new Set()
    }),
    true
  );
  assert.equal(
    licenseRowMatchesSelectedEventFilter({
      license: { eventId: "evt-a", scope: "event", exhibitorCompanyId: "ex-1" },
      selectedEventId: "",
      participatingCompanyIdsOnSelectedEvent: new Set()
    }),
    true
  );
});

test("event-scoped license matches its event only", () => {
  assert.equal(
    licenseRowMatchesSelectedEventFilter({
      license: { eventId: "evt-a", scope: "event", exhibitorCompanyId: "ex-1" },
      selectedEventId: "evt-a",
      participatingCompanyIdsOnSelectedEvent: new Set(["ex-1"])
    }),
    true
  );
  assert.equal(
    licenseRowMatchesSelectedEventFilter({
      license: { eventId: "evt-b", scope: "event", exhibitorCompanyId: "ex-1" },
      selectedEventId: "evt-a",
      participatingCompanyIdsOnSelectedEvent: new Set(["ex-1"])
    }),
    false
  );
});

test("company-scoped license visible when exhibitor participates on selected event", () => {
  assert.equal(
    licenseRowMatchesSelectedEventFilter({
      license: { eventId: null, scope: "company", exhibitorCompanyId: "ex-1" },
      selectedEventId: "evt-a",
      participatingCompanyIdsOnSelectedEvent: new Set(["ex-1"])
    }),
    true
  );
});

test("company-scoped license hidden for unrelated event", () => {
  assert.equal(
    licenseRowMatchesSelectedEventFilter({
      license: { eventId: null, scope: "company", exhibitorCompanyId: "ex-9" },
      selectedEventId: "evt-a",
      participatingCompanyIdsOnSelectedEvent: new Set(["ex-1"])
    }),
    false
  );
});

test("direct-buyer: company-scoped license visible when company OWNS the event (no exhibitors row)", () => {
  // Regression: direct-buyer companies create events via events.company_id with no
  // exhibitors row. Their company-scoped licenses must still appear on their events.
  // Callers compose the set as exhibitors + event owner; here we simulate only the
  // event owner being present.
  assert.equal(
    licenseRowMatchesSelectedEventFilter({
      license: { eventId: null, scope: "company", exhibitorCompanyId: "direct-co" },
      selectedEventId: "evt-a",
      participatingCompanyIdsOnSelectedEvent: new Set(["direct-co"])
    }),
    true
  );
});

test("direct-buyer: company-scoped license still hidden for another company's event", () => {
  assert.equal(
    licenseRowMatchesSelectedEventFilter({
      license: { eventId: null, scope: "company", exhibitorCompanyId: "direct-co" },
      selectedEventId: "evt-other",
      participatingCompanyIdsOnSelectedEvent: new Set(["other-owner-co"])
    }),
    false
  );
});

test("event-scoped license does not use company-scope fallback", () => {
  assert.equal(
    licenseRowMatchesSelectedEventFilter({
      license: { eventId: null, scope: "event", exhibitorCompanyId: "ex-1" },
      selectedEventId: "evt-a",
      participatingCompanyIdsOnSelectedEvent: new Set(["ex-1"])
    }),
    false
  );
});
