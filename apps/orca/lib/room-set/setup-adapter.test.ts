import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeMatrixRoomSetupKind,
  resolvePrototypeRoomSetInitialState,
  roomSetArchetypeForMatrixSetup,
} from "./setup-adapter";
import type { LayoutSpec } from "./layout-spec";

test("maps Matrix setup labels to normalized setup kinds and room-set archetypes", () => {
  const cases = [
    ["Theater", "theater", "general_session"],
    ["Classroom", "classroom", "general_session"],
    ["U-shape", "workshop_or_meeting", "workshop"],
    ["U Shape", "workshop_or_meeting", "workshop"],
    ["U-Shape", "workshop_or_meeting", "workshop"],
    ["Banquet", "banquet", "banquet_remarks"],
    ["Rounds", "banquet", "banquet_remarks"],
    ["Cocktail", "networking_reception", "networking_reception"],
    ["Networking", "networking_reception", "networking_reception"],
    ["Boardroom", "boardroom", "workshop"],
  ] as const;

  for (const [label, kind, archetype] of cases) {
    assert.equal(normalizeMatrixRoomSetupKind(label), kind);
    assert.equal(roomSetArchetypeForMatrixSetup(label), archetype);
  }
});

test("seeds prototype roomset UI from Matrix setup and headcount when no draft exists", () => {
  const initial = resolvePrototypeRoomSetInitialState({
    hasLocalDraft: false,
    session: {
      roomSetup: "Banquet",
      expectedAttendance: 184,
    },
  });

  assert.equal(initial.shouldSeedFromMatrix, true);
  assert.equal(initial.attendeeCount, 184);
  assert.equal(initial.setupKind, "banquet");
  assert.equal(initial.selectedEventIntent, "banquet_remarks");
});

test("preserves local roomset drafts instead of overwriting from Matrix", () => {
  const initial = resolvePrototypeRoomSetInitialState({
    hasLocalDraft: true,
    session: {
      roomSetup: "Cocktail",
      expectedAttendance: 220,
    },
  });

  assert.equal(initial.shouldSeedFromMatrix, false);
  assert.equal(initial.attendeeCount, null);
  assert.equal(initial.setupKind, null);
  assert.equal(initial.selectedEventIntent, null);
});

test("recovers layoutSpec state for semantic Apply after reload", () => {
  const layoutSpec: LayoutSpec = {
    version: 1,
    source: "ai-generate",
    eventIntent: "networking_reception",
    layoutType: "reception",
    attendeeTarget: 140,
    densityPreference: "balanced",
    audienceStyle: "grid",
    front: { av: [] },
    audience: {
      primaryComponentId: "table-cocktail-cluster",
      primaryComponentCapacity: 4,
      requiredPrimaryComponents: 35,
    },
    secondary: [],
  };

  const initial = resolvePrototypeRoomSetInitialState({
    hasLocalDraft: true,
    recoveredLayoutSpec: layoutSpec,
    session: {
      roomSetup: "Theater",
      expectedAttendance: 50,
    },
  });

  assert.equal(initial.shouldSeedFromMatrix, false);
  assert.equal(initial.attendeeCount, 140);
  assert.equal(initial.selectedEventIntent, "networking_reception");
});
