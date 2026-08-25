import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accountCommandCenter = readFileSync("app/(shell)/dashboard/page.tsx", "utf8");
const actionCenter = readFileSync("app/(shell)/dashboard/action-center/page.tsx", "utf8");
const conciergeComponent = readFileSync("app/(shell)/dashboard/ConciergePanel.tsx", "utf8");

test("dashboard routes do not render the Concierge while preserving its implementation", () => {
  for (const source of [accountCommandCenter, actionCenter]) {
    assert.equal(source.includes("<ConciergePanel"), false);
    assert.equal(source.includes('from "./ConciergePanel"'), false);
    assert.equal(source.includes('from "../ConciergePanel"'), false);
  }

  assert.equal(conciergeComponent.includes("export function ConciergePanel"), true);
});
