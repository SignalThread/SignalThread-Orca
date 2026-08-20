import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FnbOperationalStatus } from "@prisma/client";
import { FnbCatalogError, validateMenuLifecycleTransition } from "./fnb-catalog";

const base = { from: FnbOperationalStatus.OUTSTANDING, hasSource: false, totalItems: 0, codedItems: 0, verifiedItems: 0, verificationSource: null };
const eventShell = readFileSync("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx", "utf8");
const legacyEventNav = readFileSync("components/event/event-nav.tsx", "utf8");
const workspace = readFileSync("app/(shell)/events/[eventId]/fnb-catalog/_components/fnb-catalog-workspace.tsx", "utf8");
const presignRoute = readFileSync("app/api/events/[eventId]/fnb-catalog/parse-menu/presign/route.ts", "utf8");
const parseRoute = readFileSync("app/api/events/[eventId]/fnb-catalog/parse-menu/route.ts", "utf8");
const legacyCatalogPage = readFileSync("app/(shell)/events/[eventId]/fnb-catalog/page.tsx", "utf8");
const fnbPlannerPage = readFileSync("app/(shell)/events/[eventId]/matrix/fnb/page.tsx", "utf8");

test("Menus is not a standalone event navigation destination", () => {
  for (const source of [eventShell, legacyEventNav]) {
    assert.doesNotMatch(source, /label: "Menus"/);
    assert.doesNotMatch(source, /suffix: "\/fnb-catalog"/);
    assert.doesNotMatch(source, /href: `\/events\/\$\{eventId\}\/fnb-catalog`/);
  }
});

test("Menu workspace is reachable through the Run of Show F&B Planner", () => {
  assert.match(fnbPlannerPage, /FnbPlannerWorkspace/);
  assert.match(fnbPlannerPage, /getFnbCatalogPayload/);

  // The planner hosts the catalog as a section rather than duplicating its data or controls.
  const plannerWorkspace = readFileSync(
    "app/(shell)/events/[eventId]/matrix/fnb/_components/fnb-planner-workspace.tsx",
    "utf8",
  );
  assert.match(plannerWorkspace, /<FnbCatalogWorkspace/);
  assert.match(plannerWorkspace, /Menu catalog/);
});

test("Legacy /fnb-catalog entry points redirect into the F&B Planner", () => {
  assert.match(legacyCatalogPage, /redirect\(/);
  assert.match(legacyCatalogPage, /\/matrix\/fnb/);
});

test("Menu workspace exposes editable metadata and attaches uploads to expected records", () => {
  for (const field of ["venueOrCaterer", "mealContext", "expectedAt", "receivedAt", "effectiveAt", "versionLabel", "ownerUserId", "verificationSource", "verificationNotes", "internalNotes"]) {
    assert.match(workspace, new RegExp(`name=\\"${field}\\"`), field);
  }
  assert.match(workspace, /sourceMenuId: targetMenu\?\.id/);
  assert.match(workspace, /expectedVersion: targetMenu\?\.version/);
  assert.match(presignRoute, /attachFnbSourceMenuUpload/);
  assert.match(parseRoute, /persistedSourceMenu\?\.fileName/);
  assert.match(workspace, /timeZone: "UTC"/);
});

test("expected menus remain Outstanding until a real source is received", () => {
  assert.doesNotThrow(() => validateMenuLifecycleTransition({ ...base, to: FnbOperationalStatus.OUTSTANDING }));
  assert.throws(() => validateMenuLifecycleTransition({ ...base, to: FnbOperationalStatus.RECEIVED }), (error: unknown) => error instanceof FnbCatalogError && error.status === 409);
});

test("Coded requires every item to contain coding evidence", () => {
  assert.throws(() => validateMenuLifecycleTransition({ ...base, from: FnbOperationalStatus.RECEIVED, to: FnbOperationalStatus.CODED, hasSource: true, totalItems: 2, codedItems: 1 }), /All menu items/);
  assert.doesNotThrow(() => validateMenuLifecycleTransition({ ...base, from: FnbOperationalStatus.RECEIVED, to: FnbOperationalStatus.CODED, hasSource: true, totalItems: 2, codedItems: 2 }));
});

test("Confirmed requires human verification evidence for every item", () => {
  assert.throws(() => validateMenuLifecycleTransition({ ...base, from: FnbOperationalStatus.CODED, to: FnbOperationalStatus.CONFIRMED, hasSource: true, totalItems: 2, codedItems: 2, verifiedItems: 1 }), /verified items/);
  assert.doesNotThrow(() => validateMenuLifecycleTransition({ ...base, from: FnbOperationalStatus.CODED, to: FnbOperationalStatus.CONFIRMED, hasSource: true, totalItems: 2, codedItems: 2, verifiedItems: 2, verificationSource: "Hotel confirmation 2026-08-06" }));
});
