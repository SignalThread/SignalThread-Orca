import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { FnbVerificationStatus } from "@prisma/client";
import { FnbMenuSafetyError, toExternalFnbMenuItem, updateFnbMenuItemSafety } from "@/lib/fnb-menu-safety";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is required for the dietary safety persistence journey");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `fnb-safety-${randomUUID().slice(0, 8)}` });
}

test("structured safety data, separate modification evidence, staleness, privacy, and concurrency persist", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const created = await harness.db.eventFnbCatalogItem.create({
      data: { eventId: roles.event.id, itemName: "Parser proposal", description: "Original source text" },
    });

    const verified = await updateFnbMenuItemSafety(roles.event.id, created.id, roles.member.user.id, {
      expectedVersion: created.version,
      itemName: "Herb-roasted vegetable plate",
      description: "Seasonal vegetables with lentils",
      category: "Entrée",
      unit: "plate",
      publishedPriceCents: 2800,
      negotiatedPriceCents: 2500,
      discountCents: 100,
      currency: "USD",
      pricingUnit: "PER_PERSON",
      minimumQuantity: 10,
      isCustom: true,
      crossContactNotes: "Shared prep area; vendor confirmation required",
      preparationNotes: "Use dedicated utensils and omit cultured butter",
      modificationStatus: "VERIFIED",
      modificationEvidenceSource: "Caterer email 2026-08-10",
      serviceNotes: "Provide a low service table on request",
      vendorNotes: "Label the modified plates",
      internalNotes: "Planner-only guest count reconciliation",
      verificationStatus: "VERIFIED",
      verificationSource: "Signed banquet menu v3",
      verificationNotes: "Confirmed with culinary lead",
      claims: [
        { kind: "SUITABILITY", code: "VEGAN", verificationStatus: "VERIFIED", evidenceSource: "Signed banquet menu v3" },
        { kind: "FREE_OF", code: "MILK", verificationStatus: "VERIFIED", evidenceSource: "Signed banquet menu v3" },
      ],
      reason: "Initial safety verification",
    });
    assert.equal(verified.itemName, "Herb-roasted vegetable plate");
    assert.equal(verified.pricingUnit, "PER_PERSON");
    assert.equal(verified.minimumQuantity, 10);
    assert.equal(verified.verificationStatus, FnbVerificationStatus.VERIFIED);
    assert.equal(verified.modificationStatus, FnbVerificationStatus.VERIFIED);
    assert.ok(verified.verifiedAt);
    assert.ok(verified.modificationVerifiedAt);
    assert.equal(verified.claims.length, 2);
    const externalVerified = toExternalFnbMenuItem(verified as unknown as Record<string, unknown>);
    assert.equal((externalVerified.claims as Array<Record<string, unknown>>).length, 2);
    assert.ok((externalVerified.claims as Array<Record<string, unknown>>).every((claim) => !("verifiedByUserId" in claim) && !("notes" in claim)));

    const verifiedAt = verified.verifiedAt?.toISOString();
    const notesOnly = await updateFnbMenuItemSafety(roles.event.id, created.id, roles.member.user.id, {
      expectedVersion: verified.version,
      serviceNotes: "Provide a low service table and clear approach path",
      reason: "Accessibility service note",
    });
    assert.equal(notesOnly.description, "Seasonal vegetables with lentils", "partial updates preserve omitted source data");
    assert.equal(notesOnly.internalNotes, "Planner-only guest count reconciliation");
    assert.equal(notesOnly.verificationStatus, FnbVerificationStatus.VERIFIED);
    assert.equal(notesOnly.verifiedAt?.toISOString(), verifiedAt, "non-source edits do not fabricate a new verification event");

    const sourceChanged = await updateFnbMenuItemSafety(roles.event.id, created.id, roles.member.user.id, {
      expectedVersion: notesOnly.version,
      description: "Vendor revised the source description",
      reason: "Source revision",
    });
    assert.equal(sourceChanged.verificationStatus, FnbVerificationStatus.STALE);
    assert.ok(sourceChanged.claims.every((claim) => claim.verificationStatus === FnbVerificationStatus.STALE), "source edits stale affected claim evidence");
    assert.equal(sourceChanged.modificationStatus, FnbVerificationStatus.VERIFIED, "separately verified, unchanged modification evidence remains distinct");

    const modificationChanged = await updateFnbMenuItemSafety(roles.event.id, created.id, roles.member.user.id, {
      expectedVersion: sourceChanged.version,
      preparationNotes: "Use dedicated utensils and a different dairy-free sauce",
      reason: "Modification changed",
    });
    assert.equal(modificationChanged.modificationStatus, FnbVerificationStatus.STALE);

    const revisionCount = await harness.db.eventFnbCatalogItemSafetyRevision.count({ where: { itemId: created.id } });
    await assert.rejects(
      () => updateFnbMenuItemSafety(roles.event.id, created.id, roles.member.user.id, { expectedVersion: modificationChanged.version, minimumQuantity: -1 }),
      (error: unknown) => error instanceof FnbMenuSafetyError && error.status === 400,
    );
    assert.equal(await harness.db.eventFnbCatalogItemSafetyRevision.count({ where: { itemId: created.id } }), revisionCount, "invalid input is rejected before audit or item mutation");
    await assert.rejects(
      () => updateFnbMenuItemSafety(roles.event.id, created.id, roles.member.user.id, { expectedVersion: sourceChanged.version, serviceNotes: "stale write" }),
      (error: unknown) => error instanceof FnbMenuSafetyError && error.status === 409,
    );
    await assert.rejects(
      () => updateFnbMenuItemSafety("00000000-0000-4000-8000-000000000000", created.id, roles.member.user.id, { expectedVersion: modificationChanged.version }),
      (error: unknown) => error instanceof FnbMenuSafetyError && error.status === 404,
    );
    await assert.rejects(
      () => harness.db.eventFnbCatalogItem.create({
        data: {
          eventId: roles.event.id,
          itemName: "Invalid verified modification",
          preparationNotes: "Omit sauce",
          modificationStatus: FnbVerificationStatus.VERIFIED,
        },
      }),
      /verified_modification_evidence_check|constraint/i,
      "database constraint prevents verified modification inference outside the service",
    );

    const external = toExternalFnbMenuItem(modificationChanged as unknown as Record<string, unknown>);
    assert.equal("internalNotes" in external, false);
    assert.equal("verifiedByUserId" in external, false);
    assert.equal("modificationVerifiedByUserId" in external, false);
  } finally {
    await harness.cleanup();
  }
});
