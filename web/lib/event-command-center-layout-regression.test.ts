import assert from "node:assert/strict";
import test from "node:test";
import {
  addWidgetToLayout,
  moveLayoutWidget,
  PHASE_LAYOUTS,
  removeLayoutWidget,
  resizeLayoutWidget,
	  sanitizeClientLayout,
	  type LayoutItem,
	} from "../app/(shell)/events/[eventId]/_components/event-command-center-layout";
import { EVENT_DASHBOARD_WIDGET_REGISTRY } from "../app/(shell)/events/[eventId]/_components/event-command-center-widget-registry";

test("event command center exposes required phase presets", () => {
  assert.deepEqual(
    PHASE_LAYOUTS.planning.map((item) => item.widgetId),
    ["budgetOverview", "registrationPace", "topPriorities", "upcomingDeadlines", "approvalQueue"],
  );
  assert.deepEqual(
    PHASE_LAYOUTS.preEvent.map((item) => item.widgetId),
    ["upcomingDeadlines", "approvalQueue", "budgetOverview", "pickupOverview"],
  );
  assert.deepEqual(
    PHASE_LAYOUTS.onsite.map((item) => item.widgetId),
    ["runOfShow", "staffingStatus", "incidentLog", "avProductionStatus", "fnbStatus"],
  );
});

test("event command center widget registry includes each expected category", () => {
  assert.deepEqual(
    new Set(EVENT_DASHBOARD_WIDGET_REGISTRY.map((widget) => widget.category)),
    new Set([
      "Command Center",
      "Planning",
      "Financials",
      "Registration & Housing",
      "Operations",
      "Vendors",
      "Content",
    ]),
  );
  const widgetTypes = EVENT_DASHBOARD_WIDGET_REGISTRY.map((widget) => widget.type);
  assert.equal(new Set(widgetTypes).size, widgetTypes.length, "widget types stay unique");
  for (const requiredRoadmapWidget of [
    "session-readiness",
    "approval-center",
    "speaker-readiness",
    "staffing-coverage",
    "executive-briefing",
  ]) {
    assert.ok(widgetTypes.includes(requiredRoadmapWidget as (typeof widgetTypes)[number]));
  }
  assert.equal(EVENT_DASHBOARD_WIDGET_REGISTRY.some((widget) => widget.type === "task-summary"), false);
});

test("event command center layout helpers clamp invalid positions and sizes", () => {
  const layout = sanitizeClientLayout([
    { widgetId: "budgetOverview", x: -4, y: -2, w: 18, h: 1, visible: true },
    { widgetId: "registrationPace", x: 22, y: 3.6, w: 0, h: 20, visible: false },
    { widgetId: "notAWidget", x: 0, y: 0, w: 4, h: 4, visible: true } as unknown as LayoutItem,
  ]);

  assert.deepEqual(layout, [
    { widgetId: "budgetOverview", x: 0, y: 0, w: 12, h: 2, visible: true },
    { widgetId: "registrationPace", x: 11, y: 4, w: 1, h: 12, visible: false },
  ]);
});

test("event command center layout helpers add, move, resize, and remove widgets", () => {
  const initial = PHASE_LAYOUTS.planning.slice(0, 1);
  const added = addWidgetToLayout(initial, "approvalQueue");
  const deduped = addWidgetToLayout(added, "approvalQueue");
  const moved = moveLayoutWidget(deduped, "approvalQueue", { x: 99, y: -99 });
  const resized = resizeLayoutWidget(moved, "approvalQueue", { w: 99, h: -3 });
  const removed = removeLayoutWidget(resized, "budgetOverview");

  assert.equal(added.length, 2);
  assert.equal(deduped.length, 2);
  assert.deepEqual(resized.find((item) => item.widgetId === "approvalQueue"), {
    widgetId: "approvalQueue",
    x: 8,
    y: 0,
    w: 4,
    h: 2,
    visible: true,
  });
  assert.deepEqual(removed.map((item) => item.widgetId), ["approvalQueue"]);
});
