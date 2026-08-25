import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildRunOfShowGapCandidates } from "@/src/server/services/event-command-center";
import { eventFnbCatalogHref, eventFnbPlannerHref } from "./event-command-center-links";

const shellScaffold = readFileSync("app/(shell)/_components/shell-scaffold.tsx", "utf8");
const rendererSource = readFileSync(
  "app/(shell)/events/[eventId]/_components/event-dashboard-widget-renderer.tsx",
  "utf8",
);
const commandCenterCss = readFileSync(
  "app/(shell)/events/[eventId]/_components/event-command-center.module.css",
  "utf8",
);

const EVENT_ID = "11111111-2222-3333-4444-555555555555";

function gapsFor(overrides: Partial<Parameters<typeof buildRunOfShowGapCandidates>[0]> = {}) {
  return buildRunOfShowGapCandidates({
    eventId: EVENT_ID,
    missingTimeCount: 0,
    missingRoomCount: 0,
    missingSpeakerSessionCount: 0,
    missingAvSessionCount: 0,
    fnbPendingSessionCount: 0,
    missingStaffSessionCount: 0,
    runOfShowHref: `/events/${EVENT_ID}/matrix`,
    fnbPlannerHref: eventFnbPlannerHref(EVENT_ID),
    staffingHref: `/events/${EVENT_ID}/staffing`,
    ...overrides,
  });
}

test("Planner Focus gap titles lead with the quantity and subject", () => {
  const gaps = gapsFor({
    missingAvSessionCount: 75,
    missingSpeakerSessionCount: 76,
    missingStaffSessionCount: 67,
  });

  const titles = gaps.map((gap) => gap.title);
  assert.deepEqual(titles, [
    "76 sessions without speakers",
    "75 sessions without AV",
    "67 sessions without staffing",
  ]);

  // The first 12 characters are what survives a narrow column; the count must be inside them.
  for (const title of titles) {
    assert.match(title.slice(0, 12), /^\d/);
  }
});

test("gap detail explains the next action instead of repeating the count", () => {
  for (const gap of gapsFor({
    missingTimeCount: 4,
    missingRoomCount: 3,
    missingSpeakerSessionCount: 2,
    missingAvSessionCount: 5,
    fnbPendingSessionCount: 6,
    missingStaffSessionCount: 7,
  })) {
    assert.doesNotMatch(gap.detail, /\d/, `${gap.id} detail should not restate a count`);
    assert.ok(gap.detail.length > 0);
  }
});

test("counts are localized and singular/plural correct", () => {
  assert.equal(gapsFor({ missingRoomCount: 1 })[0].title, "1 session without a room");
  assert.equal(gapsFor({ missingRoomCount: 1200 })[0].title, "1,200 sessions without a room");
});

test("gaps are omitted entirely when nothing is missing", () => {
  assert.deepEqual(gapsFor(), []);
});

test("F&B gaps route to the event F&B Planner, not a standalone Menus route", () => {
  const [fnbGap] = gapsFor({ fnbPendingSessionCount: 3 });
  assert.equal(fnbGap.href, `/events/${EVENT_ID}/matrix/fnb`);
  assert.doesNotMatch(fnbGap.href, /fnb-catalog/);
});

test("the deprecated catalog href alias resolves to the F&B Planner", () => {
  assert.equal(eventFnbCatalogHref(EVENT_ID), eventFnbPlannerHref(EVENT_ID));
  assert.equal(eventFnbPlannerHref(EVENT_ID), `/events/${EVENT_ID}/matrix/fnb`);
});

test("Planner Focus titles wrap instead of ellipsing the count away", () => {
  const focusWidget = rendererSource.slice(
    rendererSource.indexOf("function PlannerFocusWidget"),
    rendererSource.indexOf("function RoadmapProgressWidget"),
  );
  assert.match(focusWidget, /styles\.focusTitle/);
  assert.doesNotMatch(focusWidget, /styles\.actionTitle/);

  const focusTitleRule = commandCenterCss.slice(
    commandCenterCss.indexOf(".focusTitle {"),
    commandCenterCss.indexOf(".focusRow {"),
  );
  assert.match(focusTitleRule, /line-clamp: 2/);
  assert.doesNotMatch(focusTitleRule, /white-space: nowrap/);
});

test("Account Command Center is not confined to the 1100px reading column", () => {
  assert.match(shellScaffold, /isAccountCommandCenterRoute/);
  assert.match(shellScaffold, /\/\^\\\/dashboard\(\?:\\\/\|\$\)\//);
  assert.match(
    shellScaffold,
    /usesFullContentWidth \? "w-full" : "w-full max-w-\[1100px\]"/,
  );
});
