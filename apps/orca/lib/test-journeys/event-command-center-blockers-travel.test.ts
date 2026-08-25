import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  SpeakerStatus,
  TimelinePriority,
  TimelineStatus,
  TimelineWorkstream,
} from "@prisma/client";
import { getEventCommandCenter } from "@/src/server/services/event-command-center";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

// P2-12 regression: the "conflicts" aggregate must expose its heterogeneous
// components (unplaced sessions + at-risk timeline items + speakers needing info)
// as an "Operational blockers" breakdown, and total must equal the legacy
// `conflicts` value kept for API compatibility.
test("Event Command Center exposes an operational-blockers breakdown", async (t) => {
  const harness = createHarnessOrSkip(t, "event-cc-blockers");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;

    // One placed session (has a room) and one unplaced session (no room/time).
    const room = await harness.createRoom({ eventId, name: "Main Hall" });
    await harness.createMatrixRow({ eventId, roomId: room.id, sessionName: "Placed Keynote" });
    await harness.createMatrixRow({ eventId, roomId: null, sessionName: "Unplaced Workshop" });

    // One at-risk timeline item.
    await harness.db.timelineItem.create({
      data: {
        eventId,
        title: "At Risk Item",
        status: TimelineStatus.AT_RISK,
        priority: TimelinePriority.HIGH,
        workstream: TimelineWorkstream.PRODUCTION,
        sortOrder: 1,
      },
    });

    // One speaker needing info (plus one confirmed to check status math).
    await harness.createSpeaker({ eventId, status: SpeakerStatus.NEEDS_INFO });
    await harness.createSpeaker({ eventId, status: SpeakerStatus.CONFIRMED });

    const payload = await getEventCommandCenter(eventId);
    const { blockers, conflicts } = payload.event.KPIs;

    assert.equal(blockers.unplacedSessions, 1, "one unplaced session");
    assert.equal(blockers.atRiskTimelineItems, 1, "one at-risk timeline item");
    assert.equal(blockers.speakersNeedingInfo, 1, "one speaker needing info");
    assert.equal(blockers.total, 3, "blockers total sums the components");
    // Legacy field preserved for compatibility.
    assert.equal(conflicts, blockers.total, "conflicts === blockers.total");
  } finally {
    await harness.cleanup();
  }
});

// P2-11 regression: travelStatus has no independent source, so it must mirror
// sessionStatus exactly (both derive from speaker.status). It is not distinct
// travel-readiness data.
test("Event Command Center travelStatus mirrors sessionStatus (no separate travel data)", async (t) => {
  const harness = createHarnessOrSkip(t, "event-cc-travel");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;

    await harness.createSpeaker({ eventId, status: SpeakerStatus.CONFIRMED });
    await harness.createSpeaker({ eventId, status: SpeakerStatus.NEEDS_INFO });
    await harness.createSpeaker({ eventId, status: SpeakerStatus.INVITED });

    const payload = await getEventCommandCenter(eventId);
    const { travelStatus, sessionStatus } = payload.event.speakers;

    // Same confirmed/pending values; the "declined"/"canceled" key names differ
    // but carry the same cancelled-speaker count.
    assert.equal(travelStatus.confirmed, sessionStatus.confirmed, "confirmed mirrors");
    assert.equal(travelStatus.pending, sessionStatus.pending, "pending mirrors");
    assert.equal(travelStatus.declined, sessionStatus.canceled, "declined mirrors canceled");
    assert.equal(travelStatus.confirmed, 1, "one confirmed");
    assert.equal(travelStatus.pending, 2, "invited + needs-info pending");
  } finally {
    await harness.cleanup();
  }
});
