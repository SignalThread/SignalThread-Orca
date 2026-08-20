import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FnbOperationalStatus } from "@prisma/client";
import { validateMenuLifecycleTransition } from "./fnb-catalog";
import { assessMenuCompatibility, filterMenuItems, publicMenuProjection, staleVerificationOnSourceChange, type MenuClaim } from "./fnb-safety-domain";

test("Set 1 workflow keeps lifecycle, filtering, assignment safety, and privacy canonical", async () => {
  validateMenuLifecycleTransition({ from: FnbOperationalStatus.OUTSTANDING, to: FnbOperationalStatus.RECEIVED, hasSource: true, totalItems: 0, codedItems: 0, verifiedItems: 0 });
  validateMenuLifecycleTransition({ from: FnbOperationalStatus.RECEIVED, to: FnbOperationalStatus.CODED, hasSource: true, totalItems: 3, codedItems: 3, verifiedItems: 1 });

  const verified: MenuClaim[] = [
    { kind: "SUITABILITY", code: "VEGAN", customLabel: null, verificationStatus: "VERIFIED" },
    { kind: "FREE_OF", code: "PEANUT", customLabel: null, verificationStatus: "VERIFIED" },
  ];
  const proposed: MenuClaim[] = [{ kind: "SUITABILITY", code: "VEGAN", customLabel: null, verificationStatus: "UNVERIFIED" }];
  const conflict: MenuClaim[] = [{ kind: "CONTAINS", code: "PEANUT", customLabel: null, verificationStatus: "VERIFIED" }];
  const requirements = [{ kind: "DIETARY" as const, code: "VEGAN" }, { kind: "ALLERGEN" as const, code: "PEANUT" }];
  assert.equal(assessMenuCompatibility(verified, requirements).outcome, "VERIFIED_MATCH");
  assert.equal(assessMenuCompatibility(proposed, requirements).outcome, "INSUFFICIENT_INFORMATION");
  assert.equal(assessMenuCompatibility(conflict, requirements).outcome, "CONFLICT");
  assert.deepEqual(filterMenuItems([{ id: "verified", claims: verified }, { id: "proposed", claims: proposed }], requirements, false).map((item) => item.id), ["verified"]);
  assert.equal(staleVerificationOnSourceChange("VERIFIED", true), "STALE");
  assert.equal(assessMenuCompatibility([...verified, { ...conflict[0], verificationStatus: "REJECTED" }], requirements).outcome, "CONFLICT", "rejected Contains remains visible as a conflict until corrected/removed with audit");

  const external = publicMenuProjection({ itemName: "Lunch", internalNotes: "attendee-specific detail", claims: [...verified, ...proposed] });
  assert.equal("internalNotes" in external, false);
  assert.equal(external.claims.length, 2);

  const [route, service] = await Promise.all([
    readFile("app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-safety/route.ts", "utf8"),
    readFile("lib/session-fnb-safety.ts", "utf8"),
  ]);
  assert.match(route, /requireEventRouteAccess\(request, eventId, "write"\)/);
  assert.match(route, /requireEventRouteAccess\(request, eventId, "read"\)/);
  assert.match(service, /where: \{ id: sessionId, eventId, archivedAt: null \}/);
  assert.doesNotMatch(service, /attendee|check-?in|no-?show/i);
});

test("session assignment snapshots the catalog item version and bridge migration is nondestructive", async () => {
  const [catalog, migration] = await Promise.all([
    readFile("lib/fnb-catalog.ts", "utf8"),
    readFile("prisma/migrations/20260806183000_add_session_fnb_safety_resolution/migration.sql", "utf8"),
  ]);
  assert.match(catalog, /catalogItemVersion: catalogItem\.version/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM)\b/im);
  assert.match(migration, /SessionFnbAssignmentSafetyResolution_assignmentId_requirementId_key/);
});
