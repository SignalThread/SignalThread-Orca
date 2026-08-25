import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceSource = readFileSync(
  new URL(
    "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
    import.meta.url,
  ),
  "utf8",
);
const canvasSource = readFileSync(
  new URL(
    "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
    import.meta.url,
  ),
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Room Set top nav contains the editor controls in one consolidated header", () => {
  const headerSource = sourceBetween(
    workspaceSource,
    '<header className="relative z-[120] shrink-0',
    "</header>",
  );
  const workspaceTabsSource = sourceBetween(
    workspaceSource,
    "const ROOM_SET_WORKSPACE_TABS",
    "const ROOM_SET_MODES",
  );
  const roomSizeEditorFieldsSource = sourceBetween(
    headerSource,
    '<div className="mt-3 grid grid-cols-2 gap-4">',
    "{roomSizeIssueLedger ?",
  );

  for (const expected of [
    "Back to {terminology.runOfShow}",
    'aria-label="Switch room/session"',
    "sessionLedger.title",
    "roomSetContextMetaLedger",
    "roomSetSessionOptionsLedger.map",
    "ROOM_SET_WORKSPACE_TABS.map",
    "Room:",
    "Room size",
    "grid grid-cols-2 gap-4",
    "min-w-0 space-y-2",
    "block text-[10px] font-semibold text-slate-400",
    "h-9 w-full min-w-0 rounded-xl",
    "room-set-room-size-tooltip",
    "group-hover:opacity-100",
    "group-focus-within:opacity-100",
    "z-[160]",
    "z-[170]",
    "openRoomSizeEditorLedger",
    "applyRoomSizeDraftLedger",
    'aria-label="Room Set zoom"',
    'aria-label="Zoom out"',
    'aria-label="Zoom in"',
    'aria-label="Reset zoom"',
    'aria-label="Grid controls"',
    'aria-label="Toggle snap to grid"',
    'aria-label="Grid size"',
    "{gridLedger} ft",
    "Import",
    'aria-label="Save draft"',
  ]) {
    assert.equal(headerSource.includes(expected), true, `missing header control: ${expected}`);
  }

  const primaryActionsIndex = headerSource.indexOf("ROOM_SET_WORKSPACE_TABS.map");
  const roomSizeIndex = headerSource.indexOf("Room:");
  const zoomIndex = headerSource.indexOf('aria-label="Room Set zoom"');
  const gridIndex = headerSource.indexOf('aria-label="Grid controls"');
  assert.equal(primaryActionsIndex < roomSizeIndex, true, "Primary actions should precede room size");
  assert.equal(primaryActionsIndex < zoomIndex, true, "Primary actions should precede view utilities");
  assert.equal(roomSizeIndex < zoomIndex, true, "Room size should precede view utilities");
  assert.equal(zoomIndex < gridIndex, true, "Zoom controls should precede grid controls");

  assert.equal(workspaceTabsSource.includes("Components"), true);
  assert.equal(workspaceTabsSource.includes("Generate"), true);
  assert.equal(headerSource.includes("overflow-visible"), true);
  assert.equal(headerSource.includes("overflow-hidden"), false);
  assert.equal(headerSource.includes("overflow-x-auto"), false);
  assert.equal(headerSource.includes("mt-3 grid grid-cols-2 gap-2"), false);
  assert.equal(roomSizeEditorFieldsSource.includes('className="text-[10px] font-semibold text-slate-400"'), false);
  assert.equal(roomSizeEditorFieldsSource.includes('<span className="block text-[10px] font-semibold text-slate-400">Width</span>'), true);
  assert.equal(roomSizeEditorFieldsSource.includes('<span className="block text-[10px] font-semibold text-slate-400">Depth</span>'), true);
  assert.equal(headerSource.includes(">Session<"), false);
  assert.equal(headerSource.includes(">Zoom out"), false);
  assert.equal(headerSource.includes(">Zoom in"), false);
  assert.equal(headerSource.includes(">Reset"), false);
  assert.equal(headerSource.includes(">Save draft"), false);
  assert.equal(headerSource.includes(">Snap"), false);
  assert.equal(headerSource.includes("Grid:"), false);
  assert.equal(headerSource.includes('aria-label="Grid snap in feet"'), false);
  assert.equal(headerSource.includes("Run of Show session"), false);
  assert.equal(headerSource.includes("Room Stats"), false);
  assert.equal(headerSource.includes('label: "Select"'), false);
});

test("Room Set toolbar uses three-zone command bar: left nav, center cluster, right controls", () => {
  const headerSource = sourceBetween(
    workspaceSource,
    '<header className="relative z-[120] shrink-0',
    "</header>",
  );
  const leftZoneSource = sourceBetween(
    headerSource,
    'className="flex min-w-0 flex-1 items-center',
    'aria-label="Command cluster"',
  );
  const commandClusterSource = sourceBetween(
    headerSource,
    'aria-label="Command cluster"',
    'aria-label="Secondary Room Set controls"',
  );
  const sessionSelectorSource = sourceBetween(
    headerSource,
    'className="group relative min-w-0 max-w-full flex-[1_1_14rem]',
    'aria-label="Switch room/session"',
  );
  const rightZoneSource = sourceBetween(
    headerSource,
    'aria-label="Secondary Room Set controls"',
    'aria-label="Save draft"',
  );

  // Container: full-width, no top-level flex-wrap, overflow-visible preserved
  assert.equal(headerSource.includes("w-full min-w-0"), true);
  assert.equal(headerSource.includes("overflow-visible"), true);
  assert.equal(headerSource.includes("md:gap-2"), true);
  assert.equal(headerSource.includes("whitespace-nowrap"), false);
  assert.equal(headerSource.includes("w-max"), false);
  assert.equal(headerSource.includes("max-content"), false);
  assert.equal(headerSource.includes("overflow-x-auto"), false);

  // Session selector: min-w-0 and truncate behavior; 250px cap removed to allow growth
  assert.equal(sessionSelectorSource.includes("min-w-0"), true);
  assert.equal(sessionSelectorSource.includes("max-w-full"), true);
  assert.equal(sessionSelectorSource.includes("flex-[1_1_14rem]"), true);
  assert.equal(sessionSelectorSource.includes("sm:min-w-[12rem]"), true);
  assert.equal(sessionSelectorSource.includes("lg:max-w-[250px]"), false);
  assert.equal(sessionSelectorSource.includes("min-w-0 flex-1"), true);
  assert.equal(sessionSelectorSource.includes("block truncate"), true);

  // Left zone: navigation only — no tab buttons
  assert.equal(leftZoneSource.includes("Back to {terminology.runOfShow}"), true);
  assert.equal(leftZoneSource.includes("flex-1"), true);
  assert.equal(leftZoneSource.includes("ROOM_SET_WORKSPACE_TABS"), false);

  // Command cluster: Components and Generate both rendered here, no exclusion filter
  assert.equal(commandClusterSource.includes("ROOM_SET_WORKSPACE_TABS.map"), true);
  assert.equal(commandClusterSource.includes('"ai-generate"'), true);
  assert.equal(commandClusterSource.includes('if (tabLedger.id !== "ai-generate") return null'), false);
  assert.equal(commandClusterSource.includes('if (tabLedger.id === "ai-generate") return null'), false);
  assert.equal(headerSource.includes('aria-label="Command cluster"'), true);

  // Right zone: canvas controls visible, no order-based responsive hacks
  assert.equal(rightZoneSource.includes("Room:"), true);
  assert.equal(rightZoneSource.includes('aria-label="Room Set zoom"'), true);
  assert.equal(rightZoneSource.includes('aria-label="Grid controls"'), true);
  assert.doesNotMatch(rightZoneSource, /className="[^"]*\bhidden\b/);
  assert.equal(rightZoneSource.includes("display: none"), false);
  assert.equal(rightZoneSource.includes("order-3"), false);
  assert.equal(rightZoneSource.includes("xl:order-none"), false);

  assert.equal(headerSource.includes('aria-label="Save draft"'), true);
  assert.equal(headerSource.includes('aria-label="Secondary Room Set controls"'), true);
});

test("Room Set renders a floating five-mode dock and keeps the old toolbar row removed", () => {
  const modeSource = sourceBetween(
    workspaceSource,
    "const ROOM_SET_MODES",
    "function normalizeRoomSetMode",
  );
  const dockSource = sourceBetween(
    workspaceSource,
    '<div className="pointer-events-none absolute inset-x-0 bottom-4',
    "<DragOverlay",
  );

  for (const mode of ["Layout", "Seating", "Operation", "Layers", "Timeline"]) {
    assert.equal(modeSource.includes(`label: "${mode}"`), true, `missing dock mode: ${mode}`);
  }

  assert.equal(modeSource.includes('label: "Operation", icon: Activity, disabled: true'), true);
  assert.equal(modeSource.includes('label: "Layers", icon: Layers, disabled: true'), true);
  assert.equal(modeSource.includes('label: "Timeline", icon: Clock3, disabled: true'), true);
  assert.equal(dockSource.includes("ROOM_SET_MODES.map"), true);
  assert.equal(dockSource.includes("<footer"), false);
  assert.equal(workspaceSource.includes('className="z-30 shrink-0 border-t'), false);
});

test("Room Set removes the old rail and keeps controls wired through existing state", () => {
  const workspaceTabsSource = sourceBetween(
    workspaceSource,
    "const ROOM_SET_WORKSPACE_TABS",
    "const ROOM_SET_MODES",
  );

  assert.equal(workspaceTabsSource.includes("Components"), true);
  assert.equal(workspaceTabsSource.includes("Generate"), true);
  assert.equal(workspaceTabsSource.includes('label: "Select"'), false);
  assert.equal(workspaceTabsSource.includes('label: "Room Stats"'), false);
  assert.equal(workspaceSource.includes('w-[72px]'), false);
  assert.equal(workspaceSource.includes("ROOM_SET_DISABLED_WORKSPACE_TABS"), false);
  assert.equal(workspaceSource.includes("overflow-x-auto"), false);
  assert.equal(workspaceSource.includes("openRoomSizeEditorLedger"), true);
  assert.equal(workspaceSource.includes("applyRoomSizeDraftLedger"), true);
  assert.equal(workspaceSource.includes("resizePlannerSceneRoomShell"), true);
  assert.equal(workspaceSource.includes("zoomCommand={prototypeZoomCommandLedger}"), true);
  assert.equal(workspaceSource.includes("snapEnabled={snapEnabledLedger}"), true);
  assert.equal(canvasSource.includes("% detail"), false);
  assert.equal(canvasSource.includes("type PlannerSceneZoomCommand"), true);
});
