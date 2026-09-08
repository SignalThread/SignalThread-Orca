import test from "node:test";
import assert from "node:assert/strict";
import { resolveCanCreateEventsForNewLicense } from "../lib/licenses/license-can-create-events-default";

test("company scope defaults to true when payload omitted", () => {
  assert.equal(resolveCanCreateEventsForNewLicense("company", undefined), true);
});

test("company scope respects explicit false", () => {
  assert.equal(resolveCanCreateEventsForNewLicense("company", false), false);
});

test("event scope is always false for this flag", () => {
  assert.equal(resolveCanCreateEventsForNewLicense("event", undefined), false);
  assert.equal(resolveCanCreateEventsForNewLicense("event", true), false);
});
