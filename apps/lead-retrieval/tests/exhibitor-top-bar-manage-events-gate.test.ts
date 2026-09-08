import test from "node:test";
import assert from "node:assert/strict";
import { exhibitorTopBarShowsManageEventsLink } from "../lib/exhibitor/exhibitor-top-bar-manage-events";

test("Manage events link: exhibitor_admin + company_all_events only", () => {
  assert.equal(
    exhibitorTopBarShowsManageEventsLink({
      role: "exhibitor_admin",
      resolution: "company_all_events"
    }),
    true
  );
});

test("Manage events link: hidden for legacy event-scoped (event-level license path)", () => {
  assert.equal(
    exhibitorTopBarShowsManageEventsLink({
      role: "exhibitor_admin",
      resolution: "legacy_event_scoped"
    }),
    false
  );
});

test("Manage events link: hidden for company_assigned_only (assigned portfolio, not all-events)", () => {
  assert.equal(
    exhibitorTopBarShowsManageEventsLink({
      role: "exhibitor_admin",
      resolution: "company_assigned_only"
    }),
    false
  );
});

test("Manage events link: hidden for exhibitor_viewer even with company_all_events", () => {
  assert.equal(
    exhibitorTopBarShowsManageEventsLink({
      role: "exhibitor_viewer",
      resolution: "company_all_events"
    }),
    false
  );
});

test("Manage events link: hidden for non-exhibitor roles", () => {
  assert.equal(
    exhibitorTopBarShowsManageEventsLink({
      role: "platform_admin",
      resolution: "company_all_events"
    }),
    false
  );
});
