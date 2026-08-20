import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { EventIntegrationMetricType } from "@prisma/client";
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

// P1-5 regression: EventIntegrationMetric has no in-app writer, so with no rows
// the registration/housing surfaces must NOT emit misleading zero/stale signals —
// they report hasData=false (UI shows "not connected") and produce no
// registration/housing notifications. When rows exist, values render normally.
test("Registration/housing report not-connected and emit no signals when no metric rows exist", async (t) => {
  const harness = createHarnessOrSkip(t, "event-integration-empty");
  if (!harness) return;

  let createdMetricEventId: string | null = null;
  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    createdMetricEventId = eventId;

    const empty = await getEventCommandCenter(eventId);
    assert.equal(empty.event.registration.hasData, false, "registration not connected");
    assert.equal(empty.event.housing.hasData, false, "housing not connected");
    assert.equal(empty.capabilities.hasRegistrationData, false, "no registration capability");
    assert.equal(empty.capabilities.hasHousingData, false, "no housing capability");
    // No metric-derived notification is emitted from absent data.
    const emptyNotificationIds = empty.event.notifications.map((n) => n.id);
    assert.equal(
      emptyNotificationIds.some((id) => id.startsWith("registration-") || id.startsWith("housing-")),
      false,
      "no registration/housing notifications without a source",
    );

    // Now write real metric rows: registration behind target, housing below target.
    await harness.db.eventIntegrationMetric.create({
      data: { eventId, type: EventIntegrationMetricType.REGISTRATION, currentValue: 40, goalValue: 100 },
    });
    await harness.db.eventIntegrationMetric.create({
      data: { eventId, type: EventIntegrationMetricType.HOUSING, currentValue: 20, goalValue: 50 },
    });

    const connected = await getEventCommandCenter(eventId);
    assert.equal(connected.event.registration.hasData, true, "registration connected");
    assert.equal(connected.event.registration.current, 40);
    assert.equal(connected.event.registration.target, 100);
    assert.equal(connected.event.housing.hasData, true, "housing connected");
    assert.equal(connected.capabilities.hasRegistrationData, true);
    assert.equal(connected.capabilities.hasHousingData, true);
    // Behind-target metrics now legitimately surface notifications.
    const connectedNotificationIds = connected.event.notifications.map((n) => n.id);
    assert.equal(
      connectedNotificationIds.includes(`registration-${eventId}`),
      true,
      "registration-behind notification appears with real data",
    );
  } finally {
    // These metric rows are created directly (no harness helper), so remove them
    // before harness.cleanup() deletes the event to avoid an FK violation.
    if (createdMetricEventId) {
      await harness.db.eventIntegrationMetric.deleteMany({ where: { eventId: createdMetricEventId } });
    }
    await harness.cleanup();
  }
});

// Lock the UI-side suppression: registration/housing widgets render a
// "not connected" state instead of misleading zeros when hasData is false, and
// the service gates registration/housing notifications on real metric presence.
test("Registration/housing widgets and notifications are gated on real metric data", () => {
  const rendererSource = readFileSync(
    "app/(shell)/events/[eventId]/_components/event-dashboard-widget-renderer.tsx",
    "utf8",
  );
  const serviceSource = readFileSync("src/server/services/event-command-center.ts", "utf8");

  assert.equal(rendererSource.includes("!data.event.registration.hasData"), true);
  assert.equal(rendererSource.includes("Registration not connected"), true);
  assert.equal(rendererSource.includes("!data.event.housing.hasData"), true);
  assert.equal(rendererSource.includes("Housing not connected"), true);
  // Unavailable capabilities fall back to an explicit unavailable widget.
  assert.equal(rendererSource.includes("<UnavailableWidget"), true);
  // Notifications are only emitted when the metric source exists.
  assert.equal(serviceSource.includes("registration.hasData && registration.target > 0"), true);
  assert.equal(serviceSource.includes("housingMetric && housingTarget > 0"), true);
});
