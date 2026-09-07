import assert from "node:assert/strict";
import test from "node:test";
import { resolveSessionModuleSettings } from "./session-module-applicability";

test("session optional modules inherit defaults until a session override is set", () => {
  const settings = resolveSessionModuleSettings(
    { ACCESSIBILITY: true, VENDOR_AND_PRODUCTION: false },
    { VENDOR_AND_PRODUCTION: true },
  );
  assert.deepEqual(settings, [
    { module: "ACCESSIBILITY", enabled: true, source: "event_default" },
    { module: "VENDOR_AND_PRODUCTION", enabled: true, source: "session_override" },
    { module: "SAFETY_AND_ESCALATION", enabled: false, source: "event_default" },
  ]);
});
