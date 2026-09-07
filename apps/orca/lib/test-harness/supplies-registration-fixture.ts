import { getPrisma } from "@/lib/prisma";
import { ensureEventSessionRequirementTemplateTx } from "@/lib/session-requirements";

export const REGISTRATION_SUPPLIES_DEMO_NOTE = "All registration materials must be set by 6:30 AM. Keep extra badge stock with Sarah.";

const PHYSICAL_REQUIREMENTS = [
  { name: "Badge stock", quantity: 140, unit: "each", source: "Registration vendor", owner: "Sarah", placement: "Back counter at registration", fulfillment: "CONFIRMED" as const, notes: null, missingDeadline: false },
  { name: "Lanyards", quantity: 120, unit: "each", source: "Event office", owner: "Sarah", placement: "VIP desk storage", fulfillment: "PACKED" as const, notes: "Use blue lanyards for VIP badges only.", missingDeadline: false },
  { name: "VIP badge sleeves", quantity: 25, unit: "each", source: "Registration vendor", owner: "Sarah", placement: "VIP desk", fulfillment: "PACKED" as const, notes: null, missingDeadline: false },
  { name: "Accessibility check-in kit", quantity: 1, unit: "kit", source: "Venue accessibility team", owner: null, placement: "Accessible check-in desk", fulfillment: "PLANNED" as const, notes: null, missingDeadline: true },
  { name: "Registration desk supplies", quantity: 3, unit: "kit", source: "Event office", owner: "Registration lead", placement: "One kit per check-in station", fulfillment: "SET" as const, notes: null, missingDeadline: false },
  { name: "Spare supplies kit", quantity: 1, unit: "kit", source: "Event office", owner: "Registration lead", placement: "Back counter at registration", fulfillment: "PLANNED" as const, notes: null, missingDeadline: false },
] as const;

export async function seedRegistrationOpenSuppliesFixture(input: { eventId: string; sessionId: string; actorUserId: string }) {
  const prisma = getPrisma();
  const session = await prisma.matrixRow.findFirst({ where: { id: input.sessionId, eventId: input.eventId, archivedAt: null }, select: { dayDate: true, sessionName: true, event: { select: { name: true, organization: { select: { name: true, slug: true } } } } } });
  if (!session) throw new Error("Registration demo fixture session must belong to the fixture event");
  const fixtureOrganization = session.event.organization.name.startsWith("Fixture Org ") && session.event.organization.slug.startsWith("fixture-org-");
  const approvedDemoSession = session.event.organization.slug === "acme-events-inc" && session.event.name === "Orca Leadership Summit" && session.sessionName === "Registration Open";
  if (!fixtureOrganization && !approvedDemoSession) throw new Error("Registration Supplies demo data is restricted to test fixtures and the approved non-production demo event");
  const responsibleMember = await prisma.eventMember.findFirst({ where: { eventId: input.eventId }, orderBy: { createdAt: "asc" }, select: { userId: true } });
  if (!responsibleMember) throw new Error("Registration Supplies demo requires an assignable event member");
  const deadline = new Date(session.dayDate); deadline.setUTCHours(11, 30, 0, 0); // 6:30 AM America/New_York for the fixture date.

  await prisma.$transaction(async (tx) => {
    await tx.matrixRow.update({ where: { id: input.sessionId }, data: { attendance: 140 } });
    await tx.sessionSupplyState.upsert({
      where: { sessionId: input.sessionId },
      update: { sessionNotes: REGISTRATION_SUPPLIES_DEMO_NOTE, registrationStationCount: 3, registrationVipDesk: true, registrationBadgePrintingMethod: "ON_DEMAND", registrationAccessibilityDesk: true, notNeededAt: null, notNeededByUserId: null },
      create: { eventId: input.eventId, sessionId: input.sessionId, sessionNotes: REGISTRATION_SUPPLIES_DEMO_NOTE, registrationStationCount: 3, registrationVipDesk: true, registrationBadgePrintingMethod: "ON_DEMAND", registrationAccessibilityDesk: true },
    });
    for (const requirement of PHYSICAL_REQUIREMENTS) {
      const item = await tx.supplyItem.upsert({ where: { eventId_name: { eventId: input.eventId, name: requirement.name } }, update: { category: requirement.name.includes("Accessibility") ? "Accessibility" : "Registration", unit: requirement.unit, defaultSource: requirement.source, defaultOwner: requirement.owner }, create: { eventId: input.eventId, name: requirement.name, category: requirement.name.includes("Accessibility") ? "Accessibility" : "Registration", unit: requirement.unit, defaultSource: requirement.source, defaultOwner: requirement.owner } });
      const allocation = await tx.sessionSupplyAllocation.upsert({
        where: { eventId_sessionId_idempotencyKey: { eventId: input.eventId, sessionId: input.sessionId, idempotencyKey: `fixture:registration:${requirement.name.toLowerCase().replaceAll(" ", "-")}` } },
        update: { supplyItemId: item.id, oneOffName: null, quantity: requirement.quantity, suggestedQuantity: requirement.quantity, source: requirement.source, owner: requirement.owner, responsibleUserId: requirement.owner ? responsibleMember.userId : null, setupDeadline: requirement.missingDeadline ? null : deadline, placement: requirement.placement, fulfillment: requirement.fulfillment, notes: requirement.notes, state: "ACTIVE" },
        create: { eventId: input.eventId, sessionId: input.sessionId, supplyItemId: item.id, category: item.category, unit: requirement.unit, quantity: requirement.quantity, suggestedQuantity: requirement.quantity, quantityRule: requirement.name === "Badge stock" || requirement.name === "Lanyards" ? "PER_ATTENDEE" : "FIXED", source: requirement.source, owner: requirement.owner, responsibleUserId: requirement.owner ? responsibleMember.userId : null, setupDeadline: requirement.missingDeadline ? null : deadline, placement: requirement.placement, fulfillment: requirement.fulfillment, notes: requirement.notes, idempotencyKey: `fixture:registration:${requirement.name.toLowerCase().replaceAll(" ", "-")}` },
      });
      if (requirement.name === "Badge stock" || requirement.name === "Spare supplies kit") {
        const label = requirement.name === "Badge stock" ? "Expected attendance: 140" : "Blocked by final attendance";
        const existing = await tx.supplyDependency.findFirst({ where: { allocationId: allocation.id, label } });
        if (existing) await tx.supplyDependency.update({ where: { id: existing.id }, data: { type: "OTHER", blocking: requirement.name === "Spare supplies kit", resolvedAt: null } });
        else await tx.supplyDependency.create({ data: { allocationId: allocation.id, type: "OTHER", label, blocking: requirement.name === "Spare supplies kit" } });
      }
    }

    const template = await ensureEventSessionRequirementTemplateTx(tx, input.eventId);
    const queueSigns = template.sections.flatMap((section) => section.items.map((item) => ({ section, item }))).find(({ section, item }) => section.key === "signage" && item.key === "registration-signage");
    if (!queueSigns) throw new Error("Registration signage catalog item is unavailable");
    await tx.sessionRequirementSelection.upsert({ where: { sessionId_itemId: { sessionId: input.sessionId, itemId: queueSigns.item.id } }, update: { quantity: 3 }, create: { sessionId: input.sessionId, itemId: queueSigns.item.id, quantity: 3 } });

    const avSection = template.sections.find((section) => section.key === "av-requirements");
    if (!avSection) throw new Error("AV requirement catalog is unavailable");
    for (const [key, label, quantity] of [["check-in-tablets", "Check-in tablets", 6], ["badge-printers", "Badge printers", 3], ["scanner-kits", "Scanner kits", 6], ["power-internet", "Power and internet", 1]] as const) {
      const avItem = await tx.sessionRequirementItem.upsert({ where: { sectionId_key: { sectionId: avSection.id, key } }, update: { label, active: true, hasQuantity: true }, create: { sectionId: avSection.id, key, label, active: true, hasQuantity: true, sortOrder: 100 + quantity } });
      await tx.sessionRequirementSelection.upsert({ where: { sessionId_itemId: { sessionId: input.sessionId, itemId: avItem.id } }, update: { quantity }, create: { sessionId: input.sessionId, itemId: avItem.id, quantity } });
    }
    await tx.sessionAVRequirement.deleteMany({ where: { sessionId: input.sessionId, avType: { in: ["Check-in tablets", "Badge printers", "Scanner kits", "Power and internet"] } } });
  }, { timeout: 30_000 });

  return { eventId: input.eventId, sessionId: input.sessionId };
}
