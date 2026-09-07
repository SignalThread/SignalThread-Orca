import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "./test-harness/planner-fixtures";
import { applySupplySuggestions, getEventSupplyRegister, getSessionSupplies, SuppliesError, updateSessionSupplyState, updateSupplyAllocation } from "./supplies";
import { getPrisma } from "./prisma";
import { REGISTRATION_SUPPLIES_DEMO_NOTE, seedRegistrationOpenSuppliesFixture } from "./test-harness/supplies-registration-fixture";

function harnessOrSkip(t: TestContext, label: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed integration tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${label}-${Date.now()}` });
}

test("Supplies persists suggestions idempotently, protects manual quantities, rolls up, enforces scope and CAS", { timeout: 90_000 }, async (t) => {
  const harness = harnessOrSkip(t, "supplies");
  if (!harness) return;
  try {
    const fixture = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: fixture.event.id, name: "Workshop Room" });
    const session = await harness.createMatrixRow({ eventId: fixture.event.id, roomId: room.id, sessionName: "Hands-on workshop", setupType: "Rounds", attendance: 24 });
    const initial = await getSessionSupplies(fixture.event.id, session.id);
    const workbook = initial.suggestions.find((item) => item.name === "Workbooks");
    assert.equal(workbook?.quantity, 24);
    assert.ok(workbook);

    await applySupplySuggestions({ eventId: fixture.event.id, sessionId: session.id, actorUserId: fixture.owner.user.id, responsibleUserId: fixture.member.user.id, idempotencyKey: "apply-1", items: [{ templateItemId: workbook.templateItemId, quantity: 30, notes: "Put one workbook at each seat." }] });
    await applySupplySuggestions({ eventId: fixture.event.id, sessionId: session.id, actorUserId: fixture.owner.user.id, responsibleUserId: fixture.member.user.id, idempotencyKey: "apply-1", items: [{ templateItemId: workbook.templateItemId, quantity: 30 }] });
    const applied = await getSessionSupplies(fixture.event.id, session.id);
    assert.equal(applied.allocations.length, 1);
    assert.equal(applied.allocations[0]?.quantity, 30);
    assert.equal(applied.allocations[0]?.notes, "Put one workbook at each seat.");
    assert.equal(applied.allocations[0]?.responsibleUserId, fixture.member.user.id);

    const state = await updateSessionSupplyState({ eventId: fixture.event.id, sessionId: session.id, actorUserId: fixture.owner.user.id, revision: applied.state.revision, sessionNotes: "Stage all materials before doors open." });
    assert.equal(state.sessionNotes, "Stage all materials before doors open.");
    await assert.rejects(() => updateSessionSupplyState({ eventId: fixture.event.id, sessionId: session.id, actorUserId: fixture.owner.user.id, revision: applied.state.revision, sessionNotes: "Stale edit" }), (error: unknown) => error instanceof SuppliesError && error.status === 409);

    await getPrisma().matrixRow.update({ where: { id: session.id }, data: { attendance: 40 } });
    const afterAttendance = await getSessionSupplies(fixture.event.id, session.id);
    assert.equal(afterAttendance.allocations[0]?.quantity, 30, "planner quantity is never overwritten");

    const allocation = afterAttendance.allocations[0]!;
    const updated = await updateSupplyAllocation({ eventId: fixture.event.id, sessionId: session.id, allocationId: allocation.id, actorUserId: fixture.owner.user.id, revision: allocation.revision, patch: { responsibleUserId: fixture.member.user.id, source: "Office", quantity: 32 } });
    assert.equal(updated.quantityOverridden, true);
    await assert.rejects(() => updateSupplyAllocation({ eventId: fixture.event.id, sessionId: session.id, allocationId: allocation.id, actorUserId: fixture.owner.user.id, revision: allocation.revision, patch: { quantity: 99 } }), (error: unknown) => error instanceof SuppliesError && error.status === 409);

    const register = await getEventSupplyRegister(fixture.event.id);
    assert.equal(register.rows.find((row) => row.name === "Workbooks")?.allocated, 32);
    assert.equal(register.sessionNotes[session.id], "Stage all materials before doors open.");

    const otherEvent = await harness.createEvent({ orgId: fixture.organization.id, createdByUserId: fixture.owner.user.id, name: "Other event" });
    await assert.rejects(() => getPrisma().sessionSupplyAllocation.create({ data: { eventId: otherEvent.id, sessionId: session.id, oneOffName: "Cross event", category: "Other", quantity: 1 } }), /must belong to event/);
    await assert.rejects(() => updateSupplyAllocation({ eventId: fixture.event.id, sessionId: session.id, allocationId: allocation.id, actorUserId: fixture.owner.user.id, revision: updated.revision, patch: { responsibleUserId: fixture.unrelatedSameOrgMember.user.id } }), (error: unknown) => error instanceof SuppliesError && error.status === 409);
  } finally {
    await harness.cleanup();
  }
});

test("Registration Supplies fixture is isolated, idempotent, profile-aware, and keeps linked confirmations out of allocations", { timeout: 90_000 }, async (t) => {
  const harness = harnessOrSkip(t, "registration-supplies");
  if (!harness) return;
  try {
    const fixture = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: fixture.event.id, name: "Registration Lobby" });
    const session = await harness.createMatrixRow({ eventId: fixture.event.id, roomId: room.id, sessionName: "Registration Open", attendance: 140 });
    await seedRegistrationOpenSuppliesFixture({ eventId: fixture.event.id, sessionId: session.id, actorUserId: fixture.owner.user.id });
    await seedRegistrationOpenSuppliesFixture({ eventId: fixture.event.id, sessionId: session.id, actorUserId: fixture.owner.user.id });

    const snapshot = await getSessionSupplies(fixture.event.id, session.id);
    assert.equal(snapshot.state.sessionNotes, REGISTRATION_SUPPLIES_DEMO_NOTE);
    assert.equal(snapshot.state.registrationProfile?.stationCount, 3);
    assert.equal(snapshot.allocations.length, 6);
    assert.equal(snapshot.allocations.find((item) => item.supplyItem?.name === "Lanyards")?.notes, "Use blue lanyards for VIP badges only.");
    assert.equal(snapshot.allocations.find((item) => item.supplyItem?.name === "Spare supplies kit")?.dependencies.filter((item) => item.blocking && !item.resolvedAt).length, 1);
    assert.ok(snapshot.suggestions.length >= 4 && snapshot.suggestions.length <= 7);
    assert.ok(snapshot.suggestions.every((item) => !["Queue signs", "Check-in tablets", "Badge printers", "Scanner kits", "Power and internet"].includes(item.name)));
    assert.deepEqual(snapshot.relatedConfirmations.map((item) => item.label), ["Queue signs", "Check-in tablets", "Badge printers", "Scanner kits", "Power and internet"]);
    assert.ok(snapshot.relatedConfirmations.every((item) => item.href));
    assert.equal(await getPrisma().sessionSupplyAllocation.count({ where: { sessionId: session.id, OR: [{ oneOffName: { in: ["Queue signs", "Check-in tablets", "Badge printers", "Scanner kits", "Power and internet"] } }, { SupplyItem: { name: { in: ["Queue signs", "Check-in tablets", "Badge printers", "Scanner kits", "Power and internet"] } } }] } }), 0);

    const initialBadgeQuantity = snapshot.allocations.find((item) => item.supplyItem?.name === "Badge stock")?.quantity;
    await updateSessionSupplyState({ eventId: fixture.event.id, sessionId: session.id, actorUserId: fixture.owner.user.id, revision: snapshot.state.revision, registrationProfile: { stationCount: 6, vipDesk: false, badgePrintingMethod: "HYBRID", accessibilityDesk: false } });
    const updated = await getSessionSupplies(fixture.event.id, session.id);
    assert.equal(updated.allocations.find((item) => item.supplyItem?.name === "Badge stock")?.quantity, initialBadgeQuantity, "profile changes never overwrite applied quantities");
    assert.equal(updated.suggestions.some((item) => item.name === "VIP badge sleeves"), false);
    assert.equal(updated.suggestions.some((item) => item.name === "Accessibility check-in kit"), false);
  } finally {
    await harness.cleanup();
  }
});
