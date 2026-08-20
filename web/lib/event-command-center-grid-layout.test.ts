// Pure-helper tests for the React-Grid-Layout dashboard canvas + preset sizing
// contract. Geometry / sizing / reconcile rules are verified without rendering.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ALLOWED_WIDTHS,
  GRID_COLS,
  buildResponsiveLayouts,
  buildSavedLayoutV2,
  colsForWidth,
  generateDefaultLayout,
  getWidgetSizingContract,
  layoutStorageKey,
  parseSavedLayoutV2,
  reconcileLayout,
  resolveBreakpoint,
  snapLayoutWidths,
  snapWidthToAllowed,
} from "@/app/(shell)/events/[eventId]/_components/event-command-center-grid-layout";
import {
  buildInitialWidgetState,
  type EventDashboardWidgetSize,
  type EventDashboardWidgetState,
  type EventDashboardWidgetType,
} from "@/app/(shell)/events/[eventId]/_components/event-command-center-widget-registry";
import type { EventCommandCenterCapabilities } from "@/src/server/services/event-command-center";

function makeWidget(
  id: string,
  overrides: Partial<EventDashboardWidgetState> = {},
): EventDashboardWidgetState {
  const size: EventDashboardWidgetSize = overrides.size ?? "third";
  return {
    id: id as EventDashboardWidgetType,
    type: id as EventDashboardWidgetType,
    title: overrides.title ?? id,
    description: overrides.description ?? `${id} description`,
    category: overrides.category ?? "Command Center",
    defaultPhases: overrides.defaultPhases ?? ["planning"],
    required: overrides.required ?? false,
    size,
    defaultOrder: overrides.defaultOrder ?? 0,
    availabilityKey: overrides.availabilityKey,
    visible: overrides.visible ?? true,
    order: overrides.order ?? overrides.defaultOrder ?? 0,
    available: overrides.available ?? true,
    disabledReason: overrides.disabledReason,
  };
}

const ALLOWED = new Set<number>(ALLOWED_WIDTHS);

function savedV2(visible: Record<string, boolean>, items: Array<Record<string, unknown>>): string {
  return JSON.stringify({ version: "v2", visible, layouts: { lg: items } });
}

function itemById(layout: ReturnType<typeof reconcileLayout>["layout"], id: string) {
  return layout.find((item) => item.i === id);
}

test("layoutStorageKey uses the v2 namespace with event + phase", () => {
  assert.equal(layoutStorageKey("event-1", "planning"), "planner-os:event-cc-layout:v2:event-1:planning");
});

// --- breakpoints: desktop stays 12 cols (nav open/closed); only tablet/phone reduce ---

test("desktop lg and md both use 12 columns", () => {
  assert.equal(GRID_COLS.lg, 12);
  assert.equal(GRID_COLS.md, 12);
});

test("tablet/phone breakpoints reduce columns", () => {
  assert.equal(GRID_COLS.sm, 6);
  assert.equal(GRID_COLS.xs, 4);
  assert.ok(GRID_COLS.sm < GRID_COLS.lg);
  assert.ok(GRID_COLS.xs < GRID_COLS.sm);
});

test("normal desktop widths (incl. expanded side nav) resolve to 12 cols", () => {
  // Wide desktop / collapsed nav.
  assert.equal(colsForWidth(1440), 12);
  assert.equal(colsForWidth(1024), 12);
  // Desktop with the side nav open narrows the container but must stay 12 cols.
  assert.equal(colsForWidth(1000), 12);
  assert.equal(colsForWidth(820), 12);
  assert.equal(colsForWidth(700), 12);
  assert.equal(resolveBreakpoint(900), "md");
  assert.equal(resolveBreakpoint(1400), "lg");
  // Only genuine tablet/phone container widths reduce columns.
  assert.equal(colsForWidth(600), 6);
  assert.equal(resolveBreakpoint(600), "sm");
  assert.equal(colsForWidth(400), 4);
  assert.equal(resolveBreakpoint(400), "xs");
});

test("three third-width widgets fit one desktop row (md cols = 12)", () => {
  const widgets = [
    makeWidget("run-of-show", { size: "half", order: 0 }),
    makeWidget("fnb-status", { size: "third", order: 1 }),
    makeWidget("av-production", { size: "third", order: 2 }),
  ];
  const layout = generateDefaultLayout(widgets);
  // All three default to width 4 (opsSummary) and pack across one 12-col row.
  for (const item of layout) assert.equal(item.w, 4);
  const ys = layout.map((item) => item.y);
  assert.ok(ys.every((y) => y === ys[0]), "all three thirds share one row");
  assert.deepEqual(
    [...layout].sort((a, b) => a.x - b.x).map((item) => item.x),
    [0, 4, 8],
  );
  // The row total fits within the desktop column count.
  assert.ok(4 * 3 <= GRID_COLS.md);
});

test("buildResponsiveLayouts shares desktop geometry and derives stacked mobile layouts", () => {
  const layout = generateDefaultLayout([
    makeWidget("kpi-row", { required: true, size: "full" }),
    makeWidget("run-of-show", { size: "half", order: 1 }),
  ]);
  const layouts = buildResponsiveLayouts(layout);
  assert.equal(layouts.lg, layout); // same reference => identical desktop arrangement
  assert.equal(layouts.md, layout);
  assert.deepEqual(layouts.sm?.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })), [
    { i: "kpi-row", x: 0, y: 0, w: 6, h: 4 },
    { i: "run-of-show", x: 0, y: 4, w: 6, h: 5 },
  ]);
  assert.deepEqual(layouts.xs?.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })), [
    { i: "kpi-row", x: 0, y: 0, w: 4, h: 5 },
    { i: "run-of-show", x: 0, y: 5, w: 4, h: 5 },
  ]);
});

// --- snapWidthToAllowed: only ever returns 12 / 6 / 4 ---

test("snapWidthToAllowed snaps arbitrary widths (5/7/8/9) to allowed values only", () => {
  for (const allowed of [[4, 6], [6, 12], [4, 6, 12]]) {
    for (const width of [5, 7, 8, 9, 3, 11, 13]) {
      const snapped = snapWidthToAllowed(width, allowed);
      assert.ok(allowed.includes(snapped), `${width} -> ${snapped} must be in ${allowed}`);
      assert.ok(ALLOWED.has(snapped), `${snapped} must be one of 4/6/12`);
    }
  }
  // Concrete expectations (ties prefer the larger width).
  assert.equal(snapWidthToAllowed(7, [6, 12]), 6);
  assert.equal(snapWidthToAllowed(9, [6, 12]), 12);
  assert.equal(snapWidthToAllowed(5, [4, 6]), 6);
  assert.equal(snapWidthToAllowed(8, [4, 6]), 6);
  assert.equal(snapWidthToAllowed(9, [4, 6, 12]), 12);
});

test("single-allowed-width contracts always snap to that width", () => {
  assert.equal(snapWidthToAllowed(11, [12]), 12);
  assert.equal(snapWidthToAllowed(2, [4]), 4);
});

// --- default layout only uses allowed widths ---

test("generated default layout only uses widths 12, 6, or 4", () => {
  const widgets = [
    makeWidget("kpi-row", { required: true, size: "full", order: 0 }),
    makeWidget("needs-you", { size: "full", order: 1 }),
    makeWidget("activity-feed", { size: "half", order: 2 }),
    makeWidget("run-of-show", { size: "half", order: 3 }),
    makeWidget("event-snapshot", { size: "third", order: 4 }),
  ];
  const layout = generateDefaultLayout(widgets);
  for (const item of layout) {
    assert.ok(ALLOWED.has(item.w), `${item.i} width ${item.w} must be 4/6/12`);
  }
  assert.equal(itemById(layout, "kpi-row")!.w, 12);
  assert.equal(itemById(layout, "needs-you")!.w, 12);
  assert.equal(itemById(layout, "activity-feed")!.w, 6);
  assert.equal(itemById(layout, "run-of-show")!.w, 4);
});

test("reset/default layout from the real registry produces only allowed widths", () => {
  const capabilities: EventCommandCenterCapabilities = {
    hasBudgetData: true,
    hasRegistrationData: true,
    hasHousingData: true,
    hasRunOfShow: true,
    hasStaffing: true,
    hasTaskData: true,
    hasVendorData: true,
    hasWeatherData: true,
    hasSpeakerData: true,
    hasFnbData: true,
    hasAvData: true,
  };
  for (const phase of ["planning", "preEvent", "onsite"] as const) {
    const base = buildInitialWidgetState(capabilities, phase);
    const { layout } = reconcileLayout(null, base);
    assert.ok(layout.length > 0);
    for (const item of layout) {
      assert.ok(ALLOWED.has(item.w), `${phase}/${item.i} width ${item.w} must be 4/6/12`);
    }
  }
});

test("default leadership layout shows only the approved widget set in order", () => {
  const capabilities: EventCommandCenterCapabilities = {
    hasBudgetData: true,
    hasRegistrationData: true,
    hasHousingData: true,
    hasRunOfShow: true,
    hasStaffing: true,
    hasTaskData: true,
    hasVendorData: true,
    hasWeatherData: true,
    hasSpeakerData: true,
    hasFnbData: true,
    hasAvData: true,
  };
  // The approved leadership default is phase-independent.
  for (const phase of ["planning", "preEvent", "onsite"] as const) {
    const base = buildInitialWidgetState(capabilities, phase);
    const { widgets, layout } = reconcileLayout(null, base);
    const visible = widgets
      .filter((widget) => widget.visible)
      .sort((a, b) => a.order - b.order)
      .map((widget) => widget.id);
    assert.deepEqual(
      visible,
      [
        "kpi-row",
        "readiness-dashboard",
        "planner-focus",
        "conflicts-details",
        "event-budget-overview",
        "run-of-show-readiness",
      ],
      `phase ${phase} default set`,
    );
    assert.equal(itemById(layout, "kpi-row")!.w, 12);
    assert.equal(itemById(layout, "readiness-dashboard")!.h, 5);
    assert.equal(itemById(layout, "readiness-dashboard")!.minH, 3);
    // Top widget row packs three thirds across one desktop row.
    assert.deepEqual(
      [
        itemById(layout, "readiness-dashboard")!.x,
        itemById(layout, "planner-focus")!.x,
        itemById(layout, "conflicts-details")!.x,
      ],
      [0, 4, 8],
    );
    // Bottom row pairs Financial Exposure + Run of Show Readiness as two halves.
    assert.equal(itemById(layout, "event-budget-overview")!.w, 6);
    assert.equal(itemById(layout, "run-of-show-readiness")!.w, 6);
    assert.deepEqual(
      [
        itemById(layout, "event-budget-overview")!.x,
        itemById(layout, "run-of-show-readiness")!.x,
      ],
      [0, 6],
    );
    assert.equal(itemById(layout, "roadmap-progress"), undefined);
    assert.equal(itemById(layout, "upcoming-deadlines"), undefined);
  }
});

test("Planning Progress remains available as an optional saved widget", () => {
  const capabilities: EventCommandCenterCapabilities = {
    hasBudgetData: true,
    hasRegistrationData: true,
    hasHousingData: true,
    hasRunOfShow: true,
    hasStaffing: true,
    hasTaskData: true,
    hasVendorData: true,
    hasWeatherData: true,
    hasSpeakerData: true,
    hasFnbData: true,
    hasAvData: true,
  };
  const saved = parseSavedLayoutV2(savedV2(
    { "roadmap-progress": true },
    [{ i: "roadmap-progress", x: 0, y: 20, w: 6, h: 6 }],
  ));
  const { widgets, layout } = reconcileLayout(saved, buildInitialWidgetState(capabilities, "planning"));
  assert.equal(widgets.find((widget) => widget.id === "roadmap-progress")?.visible, true);
  assert.equal(itemById(layout, "roadmap-progress")?.w, 6);
});

test("Financial Exposure remains in the default layout even before budget data exists", () => {
  const capabilities: EventCommandCenterCapabilities = {
    hasBudgetData: false,
    hasRegistrationData: false,
    hasHousingData: false,
    hasRunOfShow: false,
    hasStaffing: false,
    hasTaskData: false,
    hasVendorData: false,
    hasWeatherData: false,
    hasSpeakerData: false,
    hasFnbData: false,
    hasAvData: false,
  };
  const { widgets, layout } = reconcileLayout(null, buildInitialWidgetState(capabilities, "planning"));
  assert.equal(widgets.find((widget) => widget.id === "event-budget-overview")?.visible, true);
  assert.equal(itemById(layout, "event-budget-overview")?.w, 6);
});

// --- contract-driven default widths override registry size ---

test("event-budget-overview defaults to 6 despite a registry 'third' size", () => {
  assert.equal(getWidgetSizingContract("event-budget-overview").defaultW, 6);
  const widget = makeWidget("event-budget-overview", { size: "third" });
  const layout = generateDefaultLayout([widget]);
  assert.equal(itemById(layout, "event-budget-overview")!.w, 6);
});

test("upcoming-deadlines defaults to 4 so the second leadership row packs three thirds", () => {
  assert.equal(getWidgetSizingContract("upcoming-deadlines").defaultW, 4);
  const widget = makeWidget("upcoming-deadlines", { size: "third" });
  const layout = generateDefaultLayout([widget]);
  assert.equal(itemById(layout, "upcoming-deadlines")!.w, 4);
});

// --- reconcile clamps arbitrary saved widths through the contract ---

test("reconcile snaps arbitrary saved widths (5/7/8/9) to allowed widths", () => {
  const fresh = [
    makeWidget("kpi-row", { required: true, size: "full" }),
    makeWidget("needs-you", { size: "full", order: 1 }),
    makeWidget("activity-feed", { size: "half", order: 2 }),
    makeWidget("run-of-show", { size: "half", order: 3 }),
  ];
  const saved = parseSavedLayoutV2(
    savedV2(
      { "kpi-row": true, "needs-you": true, "activity-feed": true, "run-of-show": true },
      [
        { i: "kpi-row", x: 0, y: 0, w: 5, h: 2 },
        { i: "needs-you", x: 0, y: 2, w: 7, h: 6 },
        { i: "activity-feed", x: 0, y: 8, w: 9, h: 6 },
        { i: "run-of-show", x: 0, y: 14, w: 8, h: 5 },
      ],
    ),
  );
  const { layout } = reconcileLayout(saved, fresh);
  for (const item of layout) {
    assert.ok(ALLOWED.has(item.w), `${item.i} width ${item.w} must be 4/6/12`);
  }
  assert.equal(itemById(layout, "kpi-row")!.w, 12); // [12]
  assert.equal(itemById(layout, "needs-you")!.w, 6); // 7 -> 6 in [6,12]
  assert.equal(itemById(layout, "activity-feed")!.w, 12); // 9 -> 12 in [6,12]
  assert.equal(itemById(layout, "run-of-show")!.w, 6); // 8 -> 6 in [4,6]
});

// --- KPI row: always w=12, width-locked, non-resizable ---

test("kpi-row always reconciles to w=12 and is width-locked + non-resizable", () => {
  const fresh = [makeWidget("kpi-row", { required: true, size: "full" })];
  const saved = parseSavedLayoutV2(
    savedV2({ "kpi-row": true }, [{ i: "kpi-row", x: 4, y: 0, w: 4, h: 2 }]),
  );
  const { layout } = reconcileLayout(saved, fresh);
  const kpi = itemById(layout, "kpi-row")!;
  assert.equal(kpi.w, 12);
  assert.equal(kpi.minW, 12);
  assert.equal(kpi.maxW, 12);
  assert.equal(kpi.x, 0); // never below 12 / never offset
  assert.equal(kpi.isResizable, false);
});

// --- placeholders: width 4 only, non-resizable, never resurrected ---

test("weather-forecast and vendor-status are width 4 only and non-resizable", () => {
  for (const id of ["weather-forecast", "vendor-status"]) {
    const contract = getWidgetSizingContract(id);
    assert.deepEqual(contract.allowedWidths, [4]);
    assert.equal(contract.resizable, false);
    const widget = makeWidget(id, { available: true, visible: true });
    const layout = generateDefaultLayout([widget]);
    const item = itemById(layout, id)!;
    assert.equal(item.w, 4);
    assert.equal(item.minW, 4);
    assert.equal(item.maxW, 4);
    assert.equal(item.isResizable, false);
  }
});

test("unavailable placeholders are never resurrected from localStorage", () => {
  const fresh = [
    makeWidget("kpi-row", { required: true, size: "full" }),
    makeWidget("weather-forecast", { available: false, visible: false }),
    makeWidget("vendor-status", { available: false, visible: false }),
  ];
  const saved = parseSavedLayoutV2(
    savedV2(
      { "weather-forecast": true, "vendor-status": true },
      [
        { i: "weather-forecast", x: 0, y: 0, w: 4, h: 4 },
        { i: "vendor-status", x: 4, y: 0, w: 4, h: 4 },
      ],
    ),
  );
  const { widgets, layout } = reconcileLayout(saved, fresh);
  assert.equal(widgets.find((w) => w.id === "weather-forecast")!.visible, false);
  assert.equal(widgets.find((w) => w.id === "vendor-status")!.visible, false);
  assert.ok(!layout.some((item) => item.i === "weather-forecast"));
  assert.ok(!layout.some((item) => item.i === "vendor-status"));
});

// --- registration-housing min width ---

test("registration-housing never loads below width 6", () => {
  const fresh = [
    makeWidget("kpi-row", { required: true, size: "full" }),
    makeWidget("registration-housing", { size: "full", available: true, visible: true }),
  ];
  // Tampered saved width of 4 must snap up to 6.
  const saved = parseSavedLayoutV2(
    savedV2(
      { "kpi-row": true, "registration-housing": true },
      [{ i: "registration-housing", x: 0, y: 2, w: 4, h: 6 }],
    ),
  );
  const { layout } = reconcileLayout(saved, fresh);
  const item = itemById(layout, "registration-housing")!;
  assert.equal(item.w, 6);
  assert.equal(item.minW, 6);
});

test("registration-housing stays hidden when capability is unavailable", () => {
  const fresh = [makeWidget("registration-housing", { available: false, visible: false })];
  const saved = parseSavedLayoutV2(
    savedV2({ "registration-housing": true }, [{ i: "registration-housing", x: 0, y: 0, w: 12, h: 6 }]),
  );
  const { widgets, layout } = reconcileLayout(saved, fresh);
  assert.equal(widgets.find((w) => w.id === "registration-housing")!.visible, false);
  assert.ok(!layout.some((item) => item.i === "registration-housing"));
});

// --- visibility rules ---

test("unknown widget ids are dropped from saved geometry", () => {
  const fresh = [makeWidget("kpi-row", { required: true, size: "full" })];
  const saved = parseSavedLayoutV2(
    savedV2(
      { "kpi-row": true, "ghost-widget": true },
      [
        { i: "kpi-row", x: 0, y: 0, w: 12, h: 2 },
        { i: "ghost-widget", x: 0, y: 2, w: 4, h: 4 },
      ],
    ),
  );
  const { layout } = reconcileLayout(saved, fresh);
  assert.deepEqual(layout.map((item) => item.i), ["kpi-row"]);
});

test("required widgets remain visible even if saved says hidden", () => {
  const fresh = [makeWidget("kpi-row", { required: true, size: "full" })];
  const saved = parseSavedLayoutV2(savedV2({ "kpi-row": false }, []));
  const { widgets, layout } = reconcileLayout(saved, fresh);
  assert.equal(widgets.find((w) => w.id === "kpi-row")!.visible, true);
  assert.ok(layout.some((item) => item.i === "kpi-row"));
});

test("saved visibility round-trips for available non-required widgets", () => {
  const fresh = [
    makeWidget("kpi-row", { required: true, size: "full" }),
    makeWidget("activity-feed", { available: true, visible: true, size: "half" }),
  ];
  const saved = parseSavedLayoutV2(
    savedV2({ "activity-feed": false }, [{ i: "kpi-row", x: 0, y: 0, w: 12, h: 2 }]),
  );
  const { widgets, layout } = reconcileLayout(saved, fresh);
  assert.equal(widgets.find((w) => w.id === "activity-feed")!.visible, false);
  assert.ok(!layout.some((item) => item.i === "activity-feed"));
});

// --- height clamping + persistence round-trip ---

test("heights are clamped to the contract min/max", () => {
  const fresh = [
    makeWidget("kpi-row", { required: true, size: "full" }),
    makeWidget("weather-forecast", { available: true, visible: true }),
  ];
  const saved = parseSavedLayoutV2(
    savedV2(
      { "kpi-row": true, "weather-forecast": true },
      [
        { i: "kpi-row", x: 0, y: 0, w: 12, h: 99 }, // over maxH 3
        { i: "weather-forecast", x: 0, y: 3, w: 4, h: 1 }, // under minH 3
      ],
    ),
  );
  const { layout } = reconcileLayout(saved, fresh);
  assert.equal(itemById(layout, "kpi-row")!.h, 3); // clamped to maxH
  assert.equal(itemById(layout, "weather-forecast")!.h, 3); // raised to minH
});

test("snapLayoutWidths + buildSavedLayoutV2 persist only allowed widths", () => {
  const widgets = [
    makeWidget("kpi-row", { required: true, size: "full", visible: true }),
    makeWidget("needs-you", { size: "full", visible: true }),
  ];
  const dirty = [
    { i: "kpi-row", x: 0, y: 0, w: 5, h: 2 },
    { i: "needs-you", x: 0, y: 2, w: 7, h: 6 },
  ];
  const snapped = snapLayoutWidths(dirty);
  assert.equal(itemById(snapped, "kpi-row")!.w, 12);
  assert.equal(itemById(snapped, "needs-you")!.w, 6);

  const saved = buildSavedLayoutV2(widgets, dirty);
  const reparsed = parseSavedLayoutV2(JSON.stringify(saved));
  assert.ok(reparsed);
  for (const item of reparsed!.layouts.lg!) {
    assert.ok(ALLOWED.has(item.w), `${item.i} persisted width ${item.w} must be 4/6/12`);
  }
});
