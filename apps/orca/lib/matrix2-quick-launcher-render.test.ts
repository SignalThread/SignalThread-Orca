import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SessionActionLauncher } from "../app/(shell)/matrix-2/_components/Matrix2Board";
import type { Matrix2Session } from "../app/(shell)/matrix-2/_components/types";

function session(overrides: Partial<Matrix2Session> = {}): Matrix2Session {
  return {
    id: "opening-keynote",
    rowId: "opening-keynote",
    eventId: "event-1",
    sortOrder: 0,
    date: "2027-01-17",
    startTime: "09:00",
    endTime: "10:00",
    roomId: "grand-ballroom",
    roomName: "Grand Ballroom",
    title: "Opening Keynote",
    sessionType: "Keynote",
    status: "DRAFT",
    expectedAttendance: null,
    roomSetup: "",
    roomCapacity: 300,
    speakers: [],
    speakerAssignments: [],
    avRequirements: [],
    avRequirementsStructured: [],
    foodAndBeverage: [],
    foodService: null,
    staffAssigned: [],
    staffAssignments: [],
    requirementSelections: [],
    notes: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

function renderLauncher(overrides: Partial<Matrix2Session> = {}): string {
  return renderToStaticMarkup(createElement(SessionActionLauncher, {
    session: session(overrides),
    conflicts: [],
    left: 0,
    top: 0,
    popoverRef: null,
    side: "right",
    onPointerEnter: () => undefined,
    onPointerLeave: () => undefined,
    onClose: () => undefined,
    onSessionAction: () => undefined,
    onDeleteSession: () => undefined,
  }));
}

function detailsMarkup(html: string): string {
  const match = html.match(/<button[^>]*data-matrix2-action="basics"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(match, "the rendered board launcher should contain the Details tile");
  return match[0];
}

test("complete Details renders the real board-launcher tile and icon green", () => {
  const details = detailsMarkup(renderLauncher());
  assert.match(details, /data-readiness-status="ready"/);
  assert.match(details, /data-readiness-tone="ready"/);
  assert.match(details, /bg-emerald-50 text-emerald-800 ring-emerald-100/);
  assert.match(details, /data-readiness-icon="basics"[^>]*bg-emerald-100 text-emerald-700/);
  assert.doesNotMatch(details, /bg-slate-50|bg-slate-100|text-slate-500/);
});

test("missing-room Details renders the real board-launcher tile yellow", () => {
  const details = detailsMarkup(renderLauncher({ roomId: null, roomName: "Unassigned" }));
  assert.match(details, /data-readiness-status="needs_info"/);
  assert.match(details, /data-readiness-tone="attention"/);
  assert.match(details, /bg-amber-50 text-amber-800 ring-amber-100/);
  assert.match(details, /data-readiness-icon="basics"[^>]*bg-amber-100 text-amber-700/);
});

test("invalid-time Details renders the real board-launcher tile red", () => {
  const details = detailsMarkup(renderLauncher({ endTime: "08:45" }));
  assert.match(details, /data-readiness-status="blocked"/);
  assert.match(details, /data-readiness-tone="missing"/);
  assert.match(details, /bg-rose-50 text-rose-700 ring-rose-100/);
  assert.match(details, /data-readiness-icon="basics"[^>]*bg-rose-100 text-rose-700/);
});

test("active Details has no neutral fallback while Room Set and Seating remain coming soon", () => {
  const html = renderLauncher();
  const details = detailsMarkup(html);
  assert.doesNotMatch(details, /data-readiness-tone="neutral"|bg-slate-/);
  assert.match(html, /data-matrix2-coming-soon-action="room-set"[^>]*bg-\[#f4f7ff\]/);
  assert.match(html, /data-matrix2-coming-soon-action="seating"[^>]*bg-\[#f4f7ff\]/);
});
