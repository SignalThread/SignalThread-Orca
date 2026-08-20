import { FnbClaimKind, FnbPricingUnit, FnbVerificationStatus, Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { normalizeTaxonomyValue, validateMoneyProvenance, validateVerification } from "@/lib/fnb-safety-domain";

export class FnbMenuSafetyError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type ClaimInput = { kind?: unknown; code?: unknown; customLabel?: unknown; verificationStatus?: unknown; evidenceSource?: unknown; notes?: unknown };
type SafetyInput = {
  expectedVersion?: unknown;
  itemName?: unknown;
  description?: unknown;
  category?: unknown;
  unit?: unknown;
  publishedPriceCents?: unknown;
  negotiatedPriceCents?: unknown;
  discountCents?: unknown;
  currency?: unknown;
  pricingUnit?: unknown;
  minimumQuantity?: unknown;
  taxable?: unknown;
  isCustom?: unknown;
  crossContactNotes?: unknown;
  preparationNotes?: unknown;
  modificationStatus?: unknown;
  modificationEvidenceSource?: unknown;
  serviceNotes?: unknown;
  vendorNotes?: unknown;
  internalNotes?: unknown;
  verificationStatus?: unknown;
  verificationSource?: unknown;
  verificationNotes?: unknown;
  claims?: unknown;
  reason?: unknown;
};

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new FnbMenuSafetyError("Text fields must be strings");
  return value.trim() || null;
}

function cents(value: unknown, name: string): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new FnbMenuSafetyError(`${name} must be non-negative integer cents`);
  return parsed;
}

function requiredText(value: unknown, name: string): string {
  const normalized = text(value);
  if (!normalized) throw new FnbMenuSafetyError(`${name} is required`);
  return normalized;
}

function minimumQuantity(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new FnbMenuSafetyError("minimumQuantity must be a positive whole number");
  return parsed;
}

function pricingUnit(value: unknown): FnbPricingUnit | null {
  if (value == null || String(value).trim() === "") return null;
  const normalized = String(value).trim().toUpperCase() as FnbPricingUnit;
  if (!Object.values(FnbPricingUnit).includes(normalized)) throw new FnbMenuSafetyError("pricingUnit is invalid");
  return normalized;
}

function verificationStatus(value: unknown, name = "verificationStatus"): FnbVerificationStatus {
  const normalized = String(value || "").toUpperCase() as FnbVerificationStatus;
  if (!Object.values(FnbVerificationStatus).includes(normalized)) throw new FnbMenuSafetyError(`${name} is invalid`);
  return normalized;
}

function normalizeClaims(value: unknown, mayVerify: boolean) {
  if (!Array.isArray(value)) throw new FnbMenuSafetyError("claims must be an array");
  const normalized = value.map((raw, index) => {
    const input = raw as ClaimInput;
    const kind = String(input.kind || "").toUpperCase() as FnbClaimKind;
    if (!Object.values(FnbClaimKind).includes(kind)) throw new FnbMenuSafetyError(`claims[${index}].kind is invalid`);
    const taxonomy = kind === FnbClaimKind.SUITABILITY ? "dietary" : "allergen";
    let taxonomyValue;
    try { taxonomyValue = normalizeTaxonomyValue(input, taxonomy); }
    catch (cause) { throw new FnbMenuSafetyError(cause instanceof Error ? cause.message : `claims[${index}] is invalid`); }
    const requested = String(input.verificationStatus || "UNVERIFIED").toUpperCase() as FnbVerificationStatus;
    if (!Object.values(FnbVerificationStatus).includes(requested)) throw new FnbMenuSafetyError(`claims[${index}].verificationStatus is invalid`);
    const verificationStatus = requested === FnbVerificationStatus.VERIFIED && !mayVerify ? FnbVerificationStatus.UNVERIFIED : requested;
    return { ...taxonomyValue, kind, verificationStatus, evidenceSource: text(input.evidenceSource), notes: text(input.notes) };
  });
  const unique = new Set<string>();
  for (const claim of normalized) {
    const key = `${claim.kind}:${claim.code}`;
    if (unique.has(key)) throw new FnbMenuSafetyError(`Duplicate claim ${key}`);
    unique.add(key);
  }
  return normalized;
}

export async function updateFnbMenuItemSafety(eventId: string, itemId: string, actorUserId: string, input: SafetyInput) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.eventFnbCatalogItem.findFirst({ where: { id: itemId, eventId, archivedAt: null }, include: { claims: true } });
    if (!existing) throw new FnbMenuSafetyError("Menu item not found", 404);
    const expectedVersion = Number(input.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== existing.version) throw new FnbMenuSafetyError("This item changed. Refresh and retry.", 409);

    const itemName = hasOwn(input, "itemName") ? requiredText(input.itemName, "itemName") : existing.itemName;
    const description = hasOwn(input, "description") ? text(input.description) : existing.description;
    const category = hasOwn(input, "category") ? text(input.category) : existing.category;
    const unit = hasOwn(input, "unit") ? text(input.unit) : existing.unit;
    const publishedPriceCents = hasOwn(input, "publishedPriceCents") ? cents(input.publishedPriceCents, "publishedPriceCents") : existing.publishedPriceCents;
    const negotiatedPriceCents = hasOwn(input, "negotiatedPriceCents") ? cents(input.negotiatedPriceCents, "negotiatedPriceCents") : existing.negotiatedPriceCents;
    const discountCents = hasOwn(input, "discountCents") ? cents(input.discountCents, "discountCents") : existing.discountCents;
    const currency = hasOwn(input, "currency") ? String(input.currency || "").trim().toUpperCase() : existing.currency;
    const finalPricingUnit = hasOwn(input, "pricingUnit") ? pricingUnit(input.pricingUnit) : existing.pricingUnit;
    const finalMinimumQuantity = hasOwn(input, "minimumQuantity") ? minimumQuantity(input.minimumQuantity) : existing.minimumQuantity;
    try { validateMoneyProvenance({ publishedPriceCents, negotiatedPriceCents, discountCents, currency }); }
    catch (cause) { throw new FnbMenuSafetyError(cause instanceof Error ? cause.message : "Pricing is invalid"); }

    const sourceChanged = itemName !== existing.itemName || description !== existing.description || category !== existing.category || unit !== existing.unit
      || publishedPriceCents !== existing.publishedPriceCents || negotiatedPriceCents !== existing.negotiatedPriceCents
      || discountCents !== existing.discountCents || currency !== existing.currency || finalPricingUnit !== existing.pricingUnit
      || finalMinimumQuantity !== existing.minimumQuantity || hasOwn(input, "claims");
    const finalVerificationStatus = hasOwn(input, "verificationStatus")
      ? verificationStatus(input.verificationStatus)
      : sourceChanged && existing.verificationStatus === FnbVerificationStatus.VERIFIED
        ? FnbVerificationStatus.STALE
        : existing.verificationStatus;
    const verificationSource = hasOwn(input, "verificationSource") ? text(input.verificationSource) : existing.verificationSource;
    const recordsNewVerification = finalVerificationStatus === FnbVerificationStatus.VERIFIED && (hasOwn(input, "verificationStatus") || sourceChanged);
    const verifiedAt = finalVerificationStatus === FnbVerificationStatus.VERIFIED ? (recordsNewVerification ? new Date() : existing.verifiedAt) : null;
    const verifiedByUserId = finalVerificationStatus === FnbVerificationStatus.VERIFIED ? (recordsNewVerification ? actorUserId : existing.verifiedByUserId) : null;
    try { validateVerification({ status: finalVerificationStatus, verifiedByUserId, verifiedAt, evidenceSource: verificationSource }); }
    catch (cause) { throw new FnbMenuSafetyError(cause instanceof Error ? cause.message : "Verification evidence is invalid"); }
    const claims = hasOwn(input, "claims") ? normalizeClaims(input.claims, finalVerificationStatus === FnbVerificationStatus.VERIFIED) : null;
    if (claims) {
      for (const claim of claims) {
        if (claim.verificationStatus === FnbVerificationStatus.VERIFIED && !claim.evidenceSource) {
          throw new FnbMenuSafetyError("Verified claims require an evidence source");
        }
      }
    }

    const finalPreparationNotes = hasOwn(input, "preparationNotes") ? text(input.preparationNotes) : existing.preparationNotes;
    const preparationChanged = finalPreparationNotes !== existing.preparationNotes;
    let modificationStatus = hasOwn(input, "modificationStatus") && input.modificationStatus != null && String(input.modificationStatus).trim()
      ? verificationStatus(input.modificationStatus, "modificationStatus")
      : preparationChanged && existing.modificationStatus === FnbVerificationStatus.VERIFIED
        ? FnbVerificationStatus.STALE
        : existing.modificationStatus;
    let modificationEvidenceSource = hasOwn(input, "modificationEvidenceSource") ? text(input.modificationEvidenceSource) : existing.modificationEvidenceSource;
    const recordsNewModificationVerification = modificationStatus === FnbVerificationStatus.VERIFIED && (preparationChanged || hasOwn(input, "modificationStatus") || hasOwn(input, "modificationEvidenceSource"));
    let modificationVerifiedAt = modificationStatus === FnbVerificationStatus.VERIFIED ? (recordsNewModificationVerification ? new Date() : existing.modificationVerifiedAt) : null;
    let modificationVerifiedByUserId = modificationStatus === FnbVerificationStatus.VERIFIED ? (recordsNewModificationVerification ? actorUserId : existing.modificationVerifiedByUserId) : null;
    if (!finalPreparationNotes) {
      if (modificationStatus === FnbVerificationStatus.VERIFIED) throw new FnbMenuSafetyError("A verified modification requires preparation or modification notes");
      modificationStatus = null;
      modificationEvidenceSource = null;
      modificationVerifiedAt = null;
      modificationVerifiedByUserId = null;
    } else if (modificationStatus === FnbVerificationStatus.VERIFIED) {
      try { validateVerification({ status: modificationStatus, verifiedByUserId: modificationVerifiedByUserId, verifiedAt: modificationVerifiedAt, evidenceSource: modificationEvidenceSource }); }
      catch (cause) { throw new FnbMenuSafetyError(cause instanceof Error ? cause.message : "Modification evidence is invalid"); }
    }

    await tx.eventFnbCatalogItemSafetyRevision.create({ data: { eventId, itemId, actorUserId, reason: text(input.reason), snapshot: existing as unknown as Prisma.InputJsonValue } });
    if (claims) {
      await tx.eventFnbCatalogItemClaim.deleteMany({ where: { itemId } });
      if (claims.length) await tx.eventFnbCatalogItemClaim.createMany({ data: claims.map((claim) => ({ ...claim, eventId, itemId, verifiedByUserId: claim.verificationStatus === FnbVerificationStatus.VERIFIED ? actorUserId : null, verifiedAt: claim.verificationStatus === FnbVerificationStatus.VERIFIED ? verifiedAt : null })) });
    } else if (sourceChanged) {
      await tx.eventFnbCatalogItemClaim.updateMany({
        where: { itemId, verificationStatus: FnbVerificationStatus.VERIFIED },
        data: { verificationStatus: FnbVerificationStatus.STALE },
      });
    }
    return tx.eventFnbCatalogItem.update({
      where: { id: itemId },
      data: {
        itemName, description, category, unit,
        publishedPriceCents, negotiatedPriceCents, discountCents, currency, pricingUnit: finalPricingUnit, minimumQuantity: finalMinimumQuantity,
        taxable: hasOwn(input, "taxable") ? input.taxable === true : existing.taxable,
        isCustom: hasOwn(input, "isCustom") ? input.isCustom === true : existing.isCustom,
        crossContactNotes: hasOwn(input, "crossContactNotes") ? text(input.crossContactNotes) : existing.crossContactNotes,
        preparationNotes: finalPreparationNotes,
        modificationStatus, modificationEvidenceSource, modificationVerifiedByUserId, modificationVerifiedAt,
        serviceNotes: hasOwn(input, "serviceNotes") ? text(input.serviceNotes) : existing.serviceNotes,
        vendorNotes: hasOwn(input, "vendorNotes") ? text(input.vendorNotes) : existing.vendorNotes,
        internalNotes: hasOwn(input, "internalNotes") ? text(input.internalNotes) : existing.internalNotes,
        verificationStatus: finalVerificationStatus,
        verifiedByUserId,
        verifiedAt,
        verificationSource,
        verificationNotes: hasOwn(input, "verificationNotes") ? text(input.verificationNotes) : existing.verificationNotes,
        version: { increment: 1 },
      },
      include: { claims: { orderBy: [{ kind: "asc" }, { code: "asc" }] } },
    });
  });
}

export function toExternalFnbMenuItem(item: Record<string, unknown>) {
  const privateFields = new Set(["internalNotes", "safetyRevisions", "verifiedByUserId", "modificationVerifiedByUserId"]);
  const projected = Object.fromEntries(Object.entries(item).filter(([key]) => !privateFields.has(key)));
  if (Array.isArray(item.claims)) {
    projected.claims = item.claims.filter((claim): claim is Record<string, unknown> => Boolean(claim) && typeof claim === "object" && (claim as Record<string, unknown>).verificationStatus === FnbVerificationStatus.VERIFIED)
      .map((claim) => Object.fromEntries(Object.entries(claim).filter(([key]) => key !== "verifiedByUserId" && key !== "notes")));
  }
  return projected;
}
