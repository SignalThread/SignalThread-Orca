import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_STATUS_PLATFORM_DEFAULT_OPTIONS,
  canonicalSessionStatusValue,
  sessionStatusBadgeClassName,
  sessionStatusOptionsFromTemplate,
} from "./session-status";

test("session status defaults exactly match the platform STATUS catalog", () => {
  assert.deepEqual(
    SESSION_STATUS_PLATFORM_DEFAULT_OPTIONS.map((option) => option.label),
    ["Draft", "Confirmed", "Needs Review", "Complete"],
  );
});

test("event STATUS items are authoritative, ordered, and limited to active values", () => {
  const options = sessionStatusOptionsFromTemplate({
    sections: [{
      key: "status",
      label: "Status",
      sortOrder: 4,
      items: [
        { key: "complete", label: "Complete", active: true, sortOrder: 3 },
        { key: "paused", label: "Paused", active: false, sortOrder: 1 },
        { key: "draft", label: "Draft", active: true, sortOrder: 0 },
        { key: "ready", label: "Ready", active: true, sortOrder: 2 },
      ],
    }],
  });

  assert.deepEqual(options.map((option) => option.label), ["Draft", "Ready", "Complete"]);
  assert.equal(canonicalSessionStatusValue(" ready ", options), "Ready");
  assert.equal(canonicalSessionStatusValue("invented", options), null);
});

test("status badge styling is resolved by the shared status mapping", () => {
  assert.match(sessionStatusBadgeClassName("Confirmed"), /emerald/);
  assert.match(sessionStatusBadgeClassName("Draft"), /amber/);
  assert.match(sessionStatusBadgeClassName("At Risk"), /rose/);
});
