export const DIETARY_CODES = [
  "VEGETARIAN",
  "VEGAN",
  "GLUTEN_FREE",
  "DAIRY_FREE",
  "KOSHER",
  "HALAL",
] as const;

export const ALLERGEN_CODES = [
  "MILK",
  "EGG",
  "FISH",
  "SHELLFISH",
  "TREE_NUT",
  "PEANUT",
  "WHEAT",
  "SOY",
  "SESAME",
] as const;

export const ACCESSIBILITY_CODES = [
  "MOBILITY",
  "VISION",
  "HEARING",
  "SENSORY",
  "COMMUNICATION",
  "SERVICE_ANIMAL",
  "OTHER",
] as const;

export type FnbClaimKind = "SUITABILITY" | "CONTAINS" | "FREE_OF";
export type VerificationStatus = "UNVERIFIED" | "NEEDS_REVIEW" | "VERIFIED" | "REJECTED" | "STALE";
export type RequirementDisposition = "REQUIRED" | "COMPLETE" | "AT_RISK" | "MISSING" | "NOT_NEEDED";
export type ReadinessSeverity = "BLOCKER" | "WARNING" | "COMPLETE" | "NOT_NEEDED";

export type TaxonomyValue = { code: string; customLabel: string | null };
export type MenuClaim = TaxonomyValue & {
  kind: FnbClaimKind;
  verificationStatus: VerificationStatus;
  evidenceSource?: string | null;
  verifiedByUserId?: string | null;
  notes?: string | null;
};

export type SafetyRequirement = { kind: "DIETARY" | "ALLERGEN"; code: string };
export type CompatibilityOutcome = "VERIFIED_MATCH" | "POSSIBLE_MATCH" | "STALE_VERIFICATION" | "CONFLICT" | "INSUFFICIENT_INFORMATION";
export type ModificationEvidence = {
  description: string | null;
  verificationStatus: VerificationStatus | null;
  evidenceSource: string | null;
};
export type CompatibilityResult = {
  outcome: CompatibilityOutcome;
  reasonCodes: string[];
  evidence: MenuClaim[];
  modification: ModificationEvidence | null;
};

const CUSTOM_CODE = "CUSTOM";
const dietarySet = new Set<string>(DIETARY_CODES);
const allergenSet = new Set<string>(ALLERGEN_CODES);
const accessibilitySet = new Set<string>(ACCESSIBILITY_CODES);

function normalizeText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

export function normalizeTaxonomyValue(input: { code?: unknown; customLabel?: unknown }, allowed: "dietary" | "allergen"): TaxonomyValue {
  const code = normalizeText(input.code, "code").toUpperCase().replace(/[\s-]+/g, "_");
  const supported = allowed === "dietary" ? dietarySet : allergenSet;
  if (supported.has(code)) return { code, customLabel: null };
  if (code !== CUSTOM_CODE) throw new Error(`Unsupported ${allowed} code`);
  return { code, customLabel: normalizeText(input.customLabel, "customLabel") };
}

export function normalizeAccessibilityValue(input: { code?: unknown; customLabel?: unknown }): TaxonomyValue {
  const code = normalizeText(input.code, "code").toUpperCase().replace(/[\s-]+/g, "_");
  if (accessibilitySet.has(code)) return { code, customLabel: null };
  if (code !== CUSTOM_CODE) throw new Error("Unsupported accessibility code");
  return { code, customLabel: normalizeText(input.customLabel, "customLabel") };
}

export function validateClaim(input: MenuClaim): MenuClaim {
  const taxonomy = input.kind === "SUITABILITY" ? "dietary" : "allergen";
  const normalized = normalizeTaxonomyValue(input, taxonomy);
  return { ...normalized, kind: input.kind, verificationStatus: input.verificationStatus };
}

export function hasVerifiedClaim(claims: MenuClaim[], kind: FnbClaimKind, code: string): boolean {
  return claims.some((claim) => claim.kind === kind && claim.code === code && claim.verificationStatus === "VERIFIED");
}

export function allergenAssessment(claims: MenuClaim[], allergenCode: string): "CONTAINS" | "FREE_OF" | "UNKNOWN" {
  if (hasVerifiedClaim(claims, "CONTAINS", allergenCode)) return "CONTAINS";
  if (hasVerifiedClaim(claims, "FREE_OF", allergenCode)) return "FREE_OF";
  return "UNKNOWN";
}

export function assessMenuCompatibility(
  claims: MenuClaim[],
  requirements: SafetyRequirement[],
  modification: ModificationEvidence | null = null,
): CompatibilityResult {
  const evidence: MenuClaim[] = [];
  const reasons: string[] = [];
  let possible = false;
  let stale = false;
  let conflict = false;
  let insufficient = false;
  for (const requirement of requirements) {
    if (requirement.kind === "ALLERGEN") {
      const contains = claims.filter((claim) => claim.kind === "CONTAINS" && claim.code === requirement.code);
      const freeOf = claims.filter((claim) => claim.kind === "FREE_OF" && claim.code === requirement.code);
      evidence.push(...contains, ...freeOf);
      if (contains.length > 0) {
        conflict = true;
        const status = contains.some((claim) => claim.verificationStatus === "VERIFIED") ? "VERIFIED"
          : contains.some((claim) => claim.verificationStatus === "STALE") ? "STALE"
            : contains.every((claim) => claim.verificationStatus === "REJECTED") ? "REJECTED"
              : "UNVERIFIED";
        reasons.push(`${status}_CONTAINS:${requirement.code}`);
      }
      if (contains.length > 0 && freeOf.length > 0) {
        conflict = true;
        reasons.push(`CONTRADICTORY_CLAIMS:${requirement.code}`);
      }
      if (freeOf.some((claim) => claim.verificationStatus === "VERIFIED")) continue;
      if (freeOf.some((claim) => claim.verificationStatus === "STALE")) { stale = true; reasons.push(`STALE_FREE_OF:${requirement.code}`); }
      else if (freeOf.some((claim) => claim.verificationStatus === "UNVERIFIED" || claim.verificationStatus === "NEEDS_REVIEW")) { possible = true; reasons.push(`UNVERIFIED_FREE_OF:${requirement.code}`); }
      else { insufficient = true; reasons.push(freeOf.length > 0 ? `REJECTED_FREE_OF:${requirement.code}` : `NO_FREE_OF_EVIDENCE:${requirement.code}`); }
    } else {
      const matches = claims.filter((claim) => claim.kind === "SUITABILITY" && claim.code === requirement.code);
      evidence.push(...matches);
      if (matches.some((claim) => claim.verificationStatus === "VERIFIED")) continue;
      if (matches.some((claim) => claim.verificationStatus === "STALE")) { stale = true; reasons.push(`STALE_SUITABILITY:${requirement.code}`); }
      else if (matches.some((claim) => claim.verificationStatus === "UNVERIFIED" || claim.verificationStatus === "NEEDS_REVIEW")) { possible = true; reasons.push(`UNVERIFIED_SUITABILITY:${requirement.code}`); }
      else { insufficient = true; reasons.push(matches.length > 0 ? `REJECTED_SUITABILITY:${requirement.code}` : `NO_SUITABILITY_EVIDENCE:${requirement.code}`); }
    }
  }
  if (modification?.description) {
    if (modification.verificationStatus === "VERIFIED" && modification.evidenceSource) reasons.push("VERIFIED_MODIFICATION_AVAILABLE");
    else if (modification.verificationStatus === "STALE") reasons.push("STALE_MODIFICATION_AVAILABLE");
    else reasons.push("UNVERIFIED_MODIFICATION_AVAILABLE");
  }
  const outcome: CompatibilityOutcome = conflict ? "CONFLICT"
    : insufficient ? "INSUFFICIENT_INFORMATION"
      : stale ? "STALE_VERIFICATION"
        : possible ? "POSSIBLE_MATCH"
          : "VERIFIED_MATCH";
  return { outcome, reasonCodes: reasons, evidence, modification };
}

export function filterMenuItems<T extends { claims: MenuClaim[] }>(items: T[], requirements: SafetyRequirement[], includePossible: boolean): Array<T & { compatibility: CompatibilityResult }> {
  return items.map((item) => ({ ...item, compatibility: assessMenuCompatibility(item.claims, requirements) }))
    .filter((item) => item.compatibility.outcome === "VERIFIED_MATCH" || (includePossible && (item.compatibility.outcome === "POSSIBLE_MATCH" || item.compatibility.outcome === "STALE_VERIFICATION")));
}

export function explainCompatibilityReason(reasonCode: string): string {
  const [reason, code] = reasonCode.split(":");
  const subject = code ? code.replaceAll("_", " ").toLowerCase() : "";
  const labels: Record<string, string> = {
    VERIFIED_CONTAINS: `Verified source says contains ${subject}`,
    STALE_CONTAINS: `Prior source said contains ${subject}; verification is stale`,
    UNVERIFIED_CONTAINS: `Source may contain ${subject}; not verified`,
    REJECTED_CONTAINS: `A contains-${subject} claim was rejected but remains conflicting evidence`,
    CONTRADICTORY_CLAIMS: `Contains and Free Of claims conflict for ${subject}`,
    STALE_FREE_OF: `Prior Free Of evidence for ${subject} is stale`,
    UNVERIFIED_FREE_OF: `Free Of ${subject} is proposed, not verified`,
    REJECTED_FREE_OF: `Free Of ${subject} was rejected`,
    NO_FREE_OF_EVIDENCE: `No explicit Free Of evidence for ${subject}`,
    STALE_SUITABILITY: `Prior ${subject} suitability evidence is stale`,
    UNVERIFIED_SUITABILITY: `${subject} suitability is proposed, not verified`,
    REJECTED_SUITABILITY: `${subject} suitability was rejected`,
    NO_SUITABILITY_EVIDENCE: `No ${subject} suitability evidence`,
    VERIFIED_MODIFICATION_AVAILABLE: "A separately verified modification is available and is assessed independently from the base item",
    STALE_MODIFICATION_AVAILABLE: "A prior modification exists, but its verification is stale",
    UNVERIFIED_MODIFICATION_AVAILABLE: "A proposed modification exists but is not verified",
    ITEM_VERIFICATION_STALE: "The assigned item changed after selection",
    VERIFIED_ASSIGNMENT_MODIFICATION: "An assignment-specific modification was verified with source evidence",
  };
  return labels[reason] ?? reasonCode.replaceAll("_", " ").toLowerCase();
}

export function publicMenuProjection<T extends { internalNotes?: unknown; claims: MenuClaim[] }>(item: T) {
  const publicFields = Object.fromEntries(Object.entries(item).filter(([key]) => key !== "internalNotes"));
  return {
    ...publicFields,
    claims: item.claims.filter((claim) => claim.verificationStatus === "VERIFIED").map((claim) => {
      const projected = { ...claim };
      delete projected.verifiedByUserId;
      delete projected.notes;
      return projected;
    }),
  };
}

export function staleVerificationOnSourceChange(status: VerificationStatus, sourceChanged: boolean): VerificationStatus {
  return sourceChanged && status === "VERIFIED" ? "STALE" : status;
}

export function validateVerification(input: {
  status: VerificationStatus;
  verifiedByUserId?: string | null;
  verifiedAt?: Date | null;
  evidenceSource?: string | null;
}): void {
  if (input.status !== "VERIFIED") return;
  if (!input.verifiedByUserId || !input.verifiedAt || !input.evidenceSource?.trim()) {
    throw new Error("Verified facts require verifier, timestamp, and evidence source");
  }
}

export function validateDisposition(input: {
  disposition: RequirementDisposition;
  reason?: string | null;
  actorUserId?: string | null;
  dispositionAt?: Date | null;
}): void {
  if (input.disposition !== "NOT_NEEDED") return;
  if (!input.reason?.trim() || !input.actorUserId || !input.dispositionAt) {
    throw new Error("Not Needed requires reason, actor, and timestamp");
  }
}

export function dispositionReadiness(disposition: RequirementDisposition): ReadinessSeverity {
  if (disposition === "MISSING") return "BLOCKER";
  if (disposition === "AT_RISK" || disposition === "REQUIRED") return "WARNING";
  if (disposition === "NOT_NEEDED") return "NOT_NEEDED";
  return "COMPLETE";
}

export function validateMoneyProvenance(input: {
  publishedPriceCents?: number | null;
  negotiatedPriceCents?: number | null;
  discountCents?: number | null;
  currency: string;
}): void {
  for (const [name, value] of Object.entries(input)) {
    if (name === "currency" || value == null) continue;
    if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${name} must be non-negative integer cents`);
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("currency must be a three-letter ISO code");
}

export function effectiveUnitPriceCents(input: {
  publishedPriceCents: number | null;
  negotiatedPriceCents: number | null;
  discountCents: number | null;
}): number | null {
  const base = input.negotiatedPriceCents ?? input.publishedPriceCents;
  return base == null ? null : Math.max(0, base - (input.discountCents ?? 0));
}

export type FnbReadinessEvidence = {
  severity: ReadinessSeverity;
  code: string;
  label: string;
  href: string;
  recordId: string;
};

export function deriveReadinessEvidence(input: {
  disposition: RequirementDisposition;
  kind: string;
  code: string;
  recordId: string;
  eventId: string;
  sessionId: string;
}): FnbReadinessEvidence {
  return {
    severity: dispositionReadiness(input.disposition),
    code: `${input.kind}:${input.code}`,
    label: input.code.replaceAll("_", " ").toLowerCase(),
    href: `/events/${input.eventId}/matrix-2/sessions/${input.sessionId}?module=fnb`,
    recordId: input.recordId,
  };
}
