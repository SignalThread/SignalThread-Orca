import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveShowFlowCueTiming,
  detectShowFlowTimingConflicts,
  projectPublicShowFlowCue,
} from "@/lib/session-show-flow-domain";

test("offset cues recalculate from session time while absolute cues remain manual", () => {
  const offset = deriveShowFlowCueTiming({
    id: "offset",
    sortOrder: 0,
    timingMode: "OFFSET",
    startTime: null,
    offsetMin: 15,
    durationMin: 10,
  }, "09:00");
  const absolute = deriveShowFlowCueTiming({
    id: "absolute",
    sortOrder: 1000,
    timingMode: "ABSOLUTE",
    startTime: "09:30",
    offsetMin: null,
    durationMin: 5,
  }, "10:00");

  assert.equal(offset.effectiveStartTime, "09:15");
  assert.equal(deriveShowFlowCueTiming(offset, "10:00").effectiveStartTime, "10:15");
  assert.equal(absolute.effectiveStartTime, "09:30");
});

test("central timing service emits stable gap, overlap, overrun and out-of-session reason codes", () => {
  const gap = detectShowFlowTimingConflicts({ startTime: "09:00", endTime: "10:00" }, [
    { id: "a", sortOrder: 0, timingMode: "ABSOLUTE", startTime: "09:00", offsetMin: null, durationMin: 10 },
    { id: "b", sortOrder: 1000, timingMode: "OFFSET", startTime: null, offsetMin: 20, durationMin: 10 },
  ]);
  assert.deepEqual(gap.conflicts.map((entry) => entry.code), ["GAP"]);

  const invalid = detectShowFlowTimingConflicts({ startTime: "09:00", endTime: "10:00" }, [
    { id: "a", sortOrder: 0, timingMode: "ABSOLUTE", startTime: "08:55", offsetMin: null, durationMin: 10 },
    { id: "b", sortOrder: 1000, timingMode: "ABSOLUTE", startTime: "09:00", offsetMin: null, durationMin: 65 },
  ]);
  assert.deepEqual(new Set(invalid.conflicts.map((entry) => entry.code)), new Set(["OUT_OF_SESSION", "OVERRUN", "OVERLAP"]));
});

test("public cue projection is allowlisted and excludes internal production data", () => {
  const cue = projectPublicShowFlowCue({
    id: "cue",
    sortOrder: 0,
    timingMode: "ABSOLUTE",
    startTime: "09:00",
    offsetMin: null,
    durationMin: 10,
    effectiveStartTime: "09:00",
    effectiveEndTime: "09:10",
    effectiveStartMinute: 540,
    effectiveEndMinute: 550,
    label: "Welcome",
    publicDescription: "Doors open",
    talentName: "Host",
    speaker: null,
    visibility: "PUBLIC",
    owner: "Internal owner",
    internalNotes: "Never publish",
    avNotes: "Private production note",
  } as Parameters<typeof projectPublicShowFlowCue>[0]);

  assert.deepEqual(cue, {
    id: "cue",
    startTime: "09:00",
    endTime: "09:10",
    durationMin: 10,
    cue: "Welcome",
    description: "Doors open",
    talent: "Host",
  });
  assert.equal(JSON.stringify(cue).includes("Internal owner"), false);
  assert.equal(projectPublicShowFlowCue({ ...({
    id: "private",
    sortOrder: 0,
    timingMode: "ABSOLUTE",
    startTime: "09:00",
    offsetMin: null,
    durationMin: 5,
    effectiveStartTime: "09:00",
    effectiveEndTime: "09:05",
    effectiveStartMinute: 540,
    effectiveEndMinute: 545,
    label: "Private",
    visibility: "INTERNAL",
  } as Parameters<typeof projectPublicShowFlowCue>[0]) }), null);
});
