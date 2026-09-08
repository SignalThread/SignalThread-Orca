import test from "node:test";
import assert from "node:assert/strict";
import {
  mayUseExhibitorAppEventResolution,
  pickExhibitorAppActiveEventId
} from "../lib/exhibitor/exhibitor-app-active-event-logic";

const IDS = ["evt_a", "evt_b"] as const;

test("URL wins when valid", () => {
  assert.equal(pickExhibitorAppActiveEventId(IDS, "evt_b", "evt_a"), "evt_b");
});

test("cookie used when URL missing", () => {
  assert.equal(pickExhibitorAppActiveEventId(IDS, null, "evt_b"), "evt_b");
});

test("cookie ignored when URL valid", () => {
  assert.equal(pickExhibitorAppActiveEventId(IDS, "evt_a", "evt_b"), "evt_a");
});

test("first accessible when no valid preference", () => {
  assert.equal(pickExhibitorAppActiveEventId(IDS, "evt_x", "evt_y"), "evt_a");
});

test("empty list returns null", () => {
  assert.equal(pickExhibitorAppActiveEventId([], "evt_a", null), null);
});

test("platform admin can use only a validated company-scoped resolution", () => {
  assert.equal(mayUseExhibitorAppEventResolution("platform_admin", "company_all_events"), true);
  assert.equal(mayUseExhibitorAppEventResolution("platform_admin", "platform_all"), false);
  assert.equal(mayUseExhibitorAppEventResolution("platform_admin", "company_assigned_only"), false);
});
