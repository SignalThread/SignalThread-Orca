import assert from "node:assert/strict";
import test from "node:test";

import {
  allergenAssessment,
  assessMenuCompatibility,
  deriveReadinessEvidence,
  effectiveUnitPriceCents,
  explainCompatibilityReason,
  normalizeTaxonomyValue,
  filterMenuItems,
  publicMenuProjection,
  staleVerificationOnSourceChange,
  validateDisposition,
  validateMoneyProvenance,
  validateVerification,
} from "./fnb-safety-domain";

test("controlled taxonomy permits explicit custom values but rejects unknown codes", () => {
  assert.deepEqual(normalizeTaxonomyValue({ code: "vegan" }, "dietary"), { code: "VEGAN", customLabel: null });
  assert.deepEqual(normalizeTaxonomyValue({ code: "custom", customLabel: "Low histamine" }, "dietary"), { code: "CUSTOM", customLabel: "Low histamine" });
  assert.throws(() => normalizeTaxonomyValue({ code: "probably_safe" }, "allergen"), /Unsupported allergen/);
});

test("missing Contains never implies Free Of", () => {
  assert.equal(allergenAssessment([], "PEANUT"), "UNKNOWN");
  assert.equal(allergenAssessment([{ kind: "FREE_OF", code: "PEANUT", customLabel: null, verificationStatus: "UNVERIFIED" }], "PEANUT"), "UNKNOWN");
  assert.equal(allergenAssessment([{ kind: "FREE_OF", code: "PEANUT", customLabel: null, verificationStatus: "VERIFIED" }], "PEANUT"), "FREE_OF");
});

test("verified facts require complete provenance and become stale when source changes", () => {
  assert.throws(() => validateVerification({ status: "VERIFIED" }), /verifier, timestamp, and evidence/);
  assert.doesNotThrow(() => validateVerification({ status: "VERIFIED", verifiedByUserId: "user", verifiedAt: new Date(), evidenceSource: "venue menu v2" }));
  assert.equal(staleVerificationOnSourceChange("VERIFIED", true), "STALE");
});

test("Not Needed requires an audited reason", () => {
  assert.throws(() => validateDisposition({ disposition: "NOT_NEEDED" }), /reason, actor, and timestamp/);
  assert.doesNotThrow(() => validateDisposition({ disposition: "NOT_NEEDED", reason: "No food service", actorUserId: "user", dispositionAt: new Date() }));
});

test("pricing keeps original, negotiated, and discount amounts separate in exact cents", () => {
  validateMoneyProvenance({ publishedPriceCents: 2500, negotiatedPriceCents: 2200, discountCents: 200, currency: "USD" });
  assert.equal(effectiveUnitPriceCents({ publishedPriceCents: 2500, negotiatedPriceCents: 2200, discountCents: 200 }), 2000);
  assert.throws(() => validateMoneyProvenance({ publishedPriceCents: 2.5, currency: "USD" }), /integer cents/);
});

test("readiness is deterministic and links to canonical evidence", () => {
  assert.deepEqual(deriveReadinessEvidence({ disposition: "MISSING", kind: "ALLERGEN", code: "PEANUT", recordId: "r1", eventId: "e1", sessionId: "s1" }), {
    severity: "BLOCKER",
    code: "ALLERGEN:PEANUT",
    label: "peanut",
    href: "/events/e1/matrix-2/sessions/s1?module=fnb",
    recordId: "r1",
  });
});

test("combined requirements distinguish verified, possible, conflict, and insufficient results", () => {
  const verified = [
    { kind: "SUITABILITY" as const, code: "VEGAN", customLabel: null, verificationStatus: "VERIFIED" as const },
    { kind: "FREE_OF" as const, code: "PEANUT", customLabel: null, verificationStatus: "VERIFIED" as const },
  ];
  assert.equal(assessMenuCompatibility(verified, [{ kind: "DIETARY", code: "VEGAN" }, { kind: "ALLERGEN", code: "PEANUT" }]).outcome, "VERIFIED_MATCH");
  assert.equal(assessMenuCompatibility([{ ...verified[0], verificationStatus: "STALE" }], [{ kind: "DIETARY", code: "VEGAN" }]).outcome, "STALE_VERIFICATION");
  assert.equal(assessMenuCompatibility([], [{ kind: "ALLERGEN", code: "PEANUT" }]).outcome, "INSUFFICIENT_INFORMATION");
  const conflict = assessMenuCompatibility([...verified, { kind: "CONTAINS" as const, code: "PEANUT", customLabel: null, verificationStatus: "VERIFIED" as const }], [{ kind: "ALLERGEN", code: "PEANUT" }]);
  assert.equal(conflict.outcome, "CONFLICT");
  assert.ok(conflict.reasonCodes.includes("CONTRADICTORY_CLAIMS:PEANUT"));
});

test("compatibility preserves proposed, stale, rejected, contradictory, and modification semantics", () => {
  const requirement = [{ kind: "ALLERGEN" as const, code: "MILK" }];
  const proposed = assessMenuCompatibility([{ kind: "FREE_OF", code: "MILK", customLabel: null, verificationStatus: "NEEDS_REVIEW" }], requirement);
  assert.equal(proposed.outcome, "POSSIBLE_MATCH");
  assert.match(explainCompatibilityReason(proposed.reasonCodes[0]), /proposed, not verified/i);

  const stale = assessMenuCompatibility([{ kind: "FREE_OF", code: "MILK", customLabel: null, verificationStatus: "STALE" }], requirement);
  assert.equal(stale.outcome, "STALE_VERIFICATION");

  const rejected = assessMenuCompatibility([{ kind: "FREE_OF", code: "MILK", customLabel: null, verificationStatus: "REJECTED" }], requirement);
  assert.equal(rejected.outcome, "INSUFFICIENT_INFORMATION");

  const conflictWithModification = assessMenuCompatibility([
    { kind: "CONTAINS", code: "MILK", customLabel: null, verificationStatus: "VERIFIED" },
  ], requirement, { description: "Prepare with oat beverage", verificationStatus: "VERIFIED", evidenceSource: "Caterer email" });
  assert.equal(conflictWithModification.outcome, "CONFLICT", "a verified modification never hides the base conflict");
  assert.ok(conflictWithModification.reasonCodes.includes("VERIFIED_MODIFICATION_AVAILABLE"));
  assert.match(explainCompatibilityReason("VERIFIED_MODIFICATION_AVAILABLE"), /assessed independently from the base item/i);
});

test("combined filtering never presents insufficient information as verified-safe", () => {
  const items = [
    { id: "verified", claims: [{ kind: "SUITABILITY" as const, code: "VEGAN", customLabel: null, verificationStatus: "VERIFIED" as const }] },
    { id: "proposed", claims: [{ kind: "SUITABILITY" as const, code: "VEGAN", customLabel: null, verificationStatus: "UNVERIFIED" as const }] },
    { id: "stale", claims: [{ kind: "SUITABILITY" as const, code: "VEGAN", customLabel: null, verificationStatus: "STALE" as const }] },
    { id: "unknown", claims: [] },
  ];
  assert.deepEqual(filterMenuItems(items, [{ kind: "DIETARY", code: "VEGAN" }], false).map((item) => item.id), ["verified"]);
  assert.deepEqual(filterMenuItems(items, [{ kind: "DIETARY", code: "VEGAN" }], true).map((item) => item.id), ["verified", "proposed", "stale"]);
});

test("public projections exclude internal notes and unverified claims", () => {
  const projected = publicMenuProjection({ id: "item", internalNotes: "planner-only", claims: [
    { kind: "FREE_OF" as const, code: "MILK", customLabel: null, verificationStatus: "UNVERIFIED" as const },
    { kind: "CONTAINS" as const, code: "WHEAT", customLabel: null, verificationStatus: "VERIFIED" as const, verifiedByUserId: "private-user", notes: "planner-only claim note" },
  ] });
  assert.equal("internalNotes" in projected, false);
  assert.deepEqual(projected.claims.map((claim) => claim.code), ["WHEAT"]);
  assert.equal("verifiedByUserId" in projected.claims[0], false);
  assert.equal("notes" in projected.claims[0], false);
});
