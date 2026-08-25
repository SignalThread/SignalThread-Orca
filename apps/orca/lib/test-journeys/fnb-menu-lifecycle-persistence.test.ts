import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { FnbClaimKind, FnbOperationalStatus, FnbVerificationStatus } from "@prisma/client";
import {
  attachFnbSourceMenuUpload,
  createFnbSourceMenu,
  FnbCatalogError,
  replaceFnbCatalogItemsForSourceMenu,
  updateFnbSourceMenuLifecycle,
} from "@/lib/fnb-catalog";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is required for the menu lifecycle persistence journey");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `fnb-menu-lifecycle-${randomUUID().slice(0, 8)}` });
}

test("menu metadata, source attachment, staleness, concurrency, and event ownership persist", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    let menu = await createFnbSourceMenu(roles.event.id, {
      menuName: "Representative Banquet Menu",
      venueOrCaterer: "Fixture Caterer",
      mealContext: "Awards dinner",
      expectedAt: "2026-01-10",
      effectiveAt: "2026-01-15",
      versionLabel: "Draft 1",
      ownerUserId: roles.member.user.id,
      internalNotes: "Confirm the late-night station.",
    });
    assert.equal(menu.operationalStatus, FnbOperationalStatus.OUTSTANDING);

    menu = await updateFnbSourceMenuLifecycle(roles.event.id, menu.id, {
      menuName: "Representative Banquet Menu — revised",
      operationalStatus: FnbOperationalStatus.OUTSTANDING,
      expectedVersion: menu.version,
    }, roles.member.user.id);
    assert.equal(menu.venueOrCaterer, "Fixture Caterer", "partial updates preserve omitted metadata");
    assert.equal(menu.mealContext, "Awards dinner");
    assert.equal(menu.versionLabel, "Draft 1");
    assert.equal(menu.ownerUserId, roles.member.user.id);
    assert.equal(menu.internalNotes, "Confirm the late-night station.");

    await assert.rejects(
      () => updateFnbSourceMenuLifecycle(roles.event.id, menu.id, {
        ownerUserId: roles.unrelatedSameOrgMember.user.id,
        operationalStatus: menu.operationalStatus,
        expectedVersion: menu.version,
      }, roles.member.user.id),
      (error: unknown) => error instanceof FnbCatalogError && error.status === 404,
    );

    const staleVersion = menu.version;
    menu = await attachFnbSourceMenuUpload(roles.event.id, menu.id, {
      fileName: "banquet-v1.pdf",
      objectKey: `events/${roles.event.id}/fnb-menus/v1/banquet-v1.pdf`,
      expectedVersion: menu.version,
    });
    assert.equal(menu.operationalStatus, FnbOperationalStatus.RECEIVED);
    assert.ok(menu.receivedAt);
    assert.equal(menu.venueOrCaterer, "Fixture Caterer");
    await assert.rejects(
      () => attachFnbSourceMenuUpload(roles.event.id, menu.id, {
        fileName: "stale.pdf",
        objectKey: `events/${roles.event.id}/fnb-menus/stale/stale.pdf`,
        expectedVersion: staleVersion,
      }),
      (error: unknown) => error instanceof FnbCatalogError && error.status === 409,
    );

    const parsedItems = [
      { itemName: "Verified vegan entrée", category: "Entrée", price: "$24.00" },
      { itemName: "Seasonal dessert", category: "Dessert", price: "$12.00" },
    ];
    await replaceFnbCatalogItemsForSourceMenu(roles.event.id, { sourceMenuId: menu.id, items: parsedItems });
    await assert.rejects(
      () => replaceFnbCatalogItemsForSourceMenu(roles.event.id, {
        sourceMenuId: menu.id,
        items: [parsedItems[0], { category: "Invalid row" }],
      }),
      (error: unknown) => error instanceof FnbCatalogError && error.status === 400,
    );
    assert.equal(await harness.db.eventFnbCatalogItem.count({ where: { sourceMenuId: menu.id, archivedAt: null } }), 2, "invalid partial input changes no active rows");
    const retriedItems = await replaceFnbCatalogItemsForSourceMenu(roles.event.id, { sourceMenuId: menu.id, items: parsedItems });
    assert.equal(retriedItems.length, 2);
    assert.equal(await harness.db.eventFnbCatalogItem.count({ where: { sourceMenuId: menu.id, archivedAt: null } }), 2, "retry leaves one active item set");

    const item = await harness.db.eventFnbCatalogItem.update({
      where: { id: retriedItems[0].id },
      data: {
        verificationStatus: FnbVerificationStatus.VERIFIED,
        preparationNotes: "Prepare the entrée without butter",
        modificationStatus: FnbVerificationStatus.VERIFIED,
        modificationEvidenceSource: "Fixture caterer email",
        modificationVerifiedByUserId: roles.member.user.id,
        modificationVerifiedAt: new Date(),
      },
    });
    const claim = await harness.db.eventFnbCatalogItemClaim.create({
      data: {
        eventId: roles.event.id,
        itemId: item.id,
        kind: FnbClaimKind.SUITABILITY,
        code: "VEGAN",
        verificationStatus: FnbVerificationStatus.VERIFIED,
      },
    });

    menu = await attachFnbSourceMenuUpload(roles.event.id, menu.id, {
      fileName: "banquet-v2.pdf",
      objectKey: `events/${roles.event.id}/fnb-menus/v2/banquet-v2.pdf`,
      expectedVersion: menu.version,
    });
    assert.equal(menu.operationalStatus, FnbOperationalStatus.NEEDS_REVIEW);
    assert.equal(menu.verificationStatus, FnbVerificationStatus.STALE);
    const staleItem = await harness.db.eventFnbCatalogItem.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(staleItem.verificationStatus, FnbVerificationStatus.STALE);
    assert.equal(staleItem.modificationStatus, FnbVerificationStatus.STALE, "source replacement stales separately verified modifications");
    assert.equal((await harness.db.eventFnbCatalogItemClaim.findUniqueOrThrow({ where: { id: claim.id } })).verificationStatus, FnbVerificationStatus.STALE);

    await assert.rejects(
      () => attachFnbSourceMenuUpload("00000000-0000-4000-8000-000000000000", menu.id, {
        fileName: "cross-event.pdf",
        objectKey: "events/other/fnb-menus/v3/cross-event.pdf",
        expectedVersion: menu.version,
      }),
      (error: unknown) => error instanceof FnbCatalogError && error.status === 404,
    );
  } finally {
    await harness.cleanup();
  }
});
