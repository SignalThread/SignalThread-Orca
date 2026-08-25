import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { SpeakerStatus } from "@prisma/client";
import { getSpeaker, listSpeakers } from "@/src/server/services/speakers";
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

// S1 regression: the speaker directory list omits heavy free-text/array fields it
// never renders, while the detail fetch still returns them. No speaker is hidden
// and the list keeps the fields the directory grid displays.
test("Speaker list trims heavy fields; detail fetch keeps them", async (t) => {
  const harness = createHarnessOrSkip(t, "speaker-list-select-trim");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;

    const speaker = await harness.createSpeaker({
      eventId,
      name: "Grace Hopper",
      title: "Rear Admiral",
      company: "US Navy",
      status: SpeakerStatus.CONFIRMED,
    });
    // Populate the heavy fields directly.
    await harness.db.speaker.update({
      where: { id: speaker.id },
      data: {
        bio: "Pioneering computer scientist.",
        notes: "Prefers morning sessions.",
        avNeeds: "Wireless lav mic",
        travelNeeds: "Flight from DC",
        dietaryRestrictions: "Vegetarian",
        topics: ["Compilers", "COBOL"],
      },
    });

    const list = await listSpeakers(eventId, roles.owner.accessUser);
    assert.equal(list.length, 1, "speaker is listed (not hidden)");
    const listed = list[0] as Record<string, unknown>;

    // Directory-visible fields remain available.
    assert.equal(listed.name, "Grace Hopper", "name present");
    assert.equal(listed.title, "Rear Admiral", "title present");
    assert.equal(listed.company, "US Navy", "company present");
    assert.equal(listed.status, SpeakerStatus.CONFIRMED, "status present");
    assert.equal(listed.email !== undefined, true, "email present");
    assert.equal(listed.phone !== undefined, true, "phone present");

    // Heavy fields are omitted from the list payload.
    for (const heavy of ["bio", "notes", "avNeeds", "travelNeeds", "dietaryRestrictions", "topics"]) {
      assert.equal(heavy in listed, false, `${heavy} omitted from list payload`);
    }

    // Detail fetch still includes the heavy fields.
    const detail = await getSpeaker(eventId, speaker.id, roles.owner.accessUser);
    assert.equal(detail.bio, "Pioneering computer scientist.", "detail keeps bio");
    assert.equal(detail.notes, "Prefers morning sessions.", "detail keeps notes");
    assert.equal(detail.avNeeds, "Wireless lav mic", "detail keeps avNeeds");
    assert.equal(detail.travelNeeds, "Flight from DC", "detail keeps travelNeeds");
    assert.deepEqual(detail.topics, ["Compilers", "COBOL"], "detail keeps topics");
  } finally {
    await harness.cleanup();
  }
});
