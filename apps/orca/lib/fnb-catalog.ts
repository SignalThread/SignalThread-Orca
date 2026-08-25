import {
  BudgetLineItemApproval,
  BudgetLineItemStatus,
  BudgetStatus,
  EventFnbSourceMenuSourceType,
  EventFnbSourceMenuStatus,
  FnbOperationalStatus,
  FnbClaimKind,
  FnbPricingUnit,
  FnbVerificationStatus,
  Prisma,
} from "@prisma/client";
import {
  calculateFnbAssignmentFinancials,
  calculateFnbPlanCost,
  normalizeFnbPercentage,
  type FnbAssignmentCostBreakdown,
  type FnbOrderCalculation,
  type FnbPlanCostBreakdown,
} from "@/lib/fnb-cost-calculation";
import { assignmentForecastTotalCentsNullable } from "@/lib/fnb-package-tier";
import { getPrisma } from "@/lib/prisma";

type FnbCatalogDbClient = ReturnType<typeof getPrisma> | Prisma.TransactionClient;

export class FnbCatalogError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type FnbCatalogItemRecord = {
  id: string;
  eventId: string;
  sourceMenuId: string | null;
  itemName: string;
  description: string | null;
  price: string | null;
  unit: string | null;
  category: string | null;
  sourceMenuFileName: string | null;
  publishedPriceCents: number | null;
  negotiatedPriceCents: number | null;
  discountCents: number | null;
  currency: string;
  pricingUnit: string | null;
  minimumQuantity: number | null;
  taxable: boolean;
  isCustom: boolean;
  crossContactNotes: string | null;
  preparationNotes: string | null;
  modificationStatus: FnbVerificationStatus | null;
  modificationEvidenceSource: string | null;
  modificationVerifiedByUserId: string | null;
  modificationVerifiedAt: string | null;
  serviceNotes: string | null;
  vendorNotes: string | null;
  internalNotes: string | null;
  verificationStatus: FnbVerificationStatus;
  verifiedByUserId: string | null;
  verifiedAt: string | null;
  verificationSource: string | null;
  verificationNotes: string | null;
  version: number;
  claims: Array<{ id: string; kind: string; code: string; customLabel: string | null; verificationStatus: FnbVerificationStatus; evidenceSource: string | null; notes: string | null }>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FnbSourceMenuRecord = {
  id: string;
  eventId: string;
  menuName: string;
  fileName: string | null;
  sourceType: EventFnbSourceMenuSourceType;
  status: EventFnbSourceMenuStatus;
  objectKey: string | null;
  itemsFound: number;
  progressSummary: string | null;
  lastError: string | null;
  baseSourceMenuId: string | null;
  operationalStatus: FnbOperationalStatus;
  venueOrCaterer: string | null;
  mealContext: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  effectiveAt: string | null;
  versionLabel: string | null;
  ownerUserId: string | null;
  verificationStatus: FnbVerificationStatus;
  verifiedByUserId: string | null;
  verifiedAt: string | null;
  verificationSource: string | null;
  verificationNotes: string | null;
  internalNotes: string | null;
  version: number;
  totalItems: number;
  codedItems: number;
  verifiedItems: number;
  needsReviewItems: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FnbCatalogPayload = {
  items: FnbCatalogItemRecord[];
  sourceMenus: FnbSourceMenuRecord[];
};

export type DeleteFnbSourceMenuResult = {
  sourceMenuId: string;
  deletedCatalogItemCount: number;
};

type CreateFnbCatalogItemInput = {
  sourceMenuId?: unknown;
  itemName?: unknown;
  description?: unknown;
  price?: unknown;
  unit?: unknown;
  category?: unknown;
  sourceMenuFileName?: unknown;
};

type UpdateFnbCatalogItemInput = CreateFnbCatalogItemInput;

type ReplaceFnbCatalogItemsForSourceMenuInput = {
  sourceMenuId?: unknown;
  sourceMenuFileName?: unknown;
  items?: unknown;
};

type CreateFnbSourceMenuInput = {
  menuName?: unknown;
  fileName?: unknown;
  sourceType?: unknown;
  objectKey?: unknown;
  baseSourceMenuId?: unknown;
  operationalStatus?: unknown;
  venueOrCaterer?: unknown;
  mealContext?: unknown;
  expectedAt?: unknown;
  receivedAt?: unknown;
  effectiveAt?: unknown;
  versionLabel?: unknown;
  ownerUserId?: unknown;
  internalNotes?: unknown;
};

type UpdateFnbSourceMenuLifecycleInput = CreateFnbSourceMenuInput & {
  verificationSource?: unknown;
  verificationNotes?: unknown;
  expectedVersion?: unknown;
};

export type SessionFnbCatalogAssignmentRecord = {
  id: string;
  sessionId: string;
  eventFnbCatalogItemId: string;
  catalogItemVersion: number;
  catalogItemSnapshot: Prisma.JsonValue | null;
  budgetLineItemId: string | null;
  quantity: number | null;
  manualPriceCents: number | null;
  serviceTiming: string | null;
  notes: string | null;
  taxes: SessionFnbCatalogAssignmentTaxRecord[];
  calculation: FnbAssignmentCostBreakdown;
  financialCalculation: FnbOrderCalculation | null;
  createdAt: string;
  updatedAt: string;
  catalogItem: FnbCatalogItemRecord;
  syncedBudgetLineItem: {
    id: string;
    category: string;
    subcategory: string;
    lineItem: string;
    vendor: string | null;
    forecastCents: number;
    actualCents: number;
    status: string;
    approval: string;
  } | null;
};

export type SessionFnbCatalogAssignmentTaxRecord = {
  id: string;
  assignmentId: string;
  label: string | null;
  percentage: string;
  sortOrder: number;
};

export type SessionFnbPlanRecord = {
  sessionId: string;
  taxPercent: string;
  serviceChargePercent: string;
  forecastAttendance: number | null;
  calculation: FnbPlanCostBreakdown;
};

type CreateSessionFnbCatalogAssignmentInput = {
  eventFnbCatalogItemId?: unknown;
  customItem?: unknown;
  quantity?: unknown;
  manualPriceCents?: unknown;
  serviceTiming?: unknown;
  notes?: unknown;
  taxes?: unknown;
};

type NormalizedCustomAssignmentItem = {
  itemName: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  publishedPriceCents: number | null;
  negotiatedPriceCents: number | null;
  discountCents: number | null;
  currency: string;
  pricingUnit: FnbPricingUnit | null;
  minimumQuantity: number | null;
  taxable: boolean;
  preparationNotes: string | null;
  serviceNotes: string | null;
  vendorNotes: string | null;
  verificationStatus: FnbVerificationStatus;
  verificationSource: string | null;
  claims: Array<{ kind: FnbClaimKind; code: string; customLabel: string | null; verificationStatus: FnbVerificationStatus; evidenceSource: string | null }>;
};

type UpdateSessionFnbCatalogAssignmentInput = {
  quantity?: unknown;
  manualPriceCents?: unknown;
  serviceTiming?: unknown;
  notes?: unknown;
  taxes?: unknown;
  expectedUpdatedAt?: unknown;
};

type UpdateSessionFnbPlanInput = {
  taxPercent?: unknown;
  serviceChargePercent?: unknown;
};

function normalizeRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new FnbCatalogError(`${fieldName} is required`, 400);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new FnbCatalogError(`${fieldName} is required`, 400);
  }

  return normalized;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value === "undefined" || value === null) return null;
  if (typeof value !== "string") {
    throw new FnbCatalogError("Text fields must be strings", 400);
  }
  const normalized = value.trim();
  return normalized || null;
}

function normalizeId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new FnbCatalogError(`${fieldName} is required`, 400);
  }
  return value.trim();
}

function normalizeOptionalId(value: unknown, fieldName: string): string | null {
  if (typeof value === "undefined" || value === null || String(value).trim() === "") return null;
  return normalizeId(value, fieldName);
}

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizeSourceMenuSourceType(value: unknown): EventFnbSourceMenuSourceType {
  if (typeof value !== "string" || !value.trim()) return EventFnbSourceMenuSourceType.ORIGINAL;
  const normalized = value.trim().toUpperCase();
  if (normalized === EventFnbSourceMenuSourceType.AMENDMENT) return EventFnbSourceMenuSourceType.AMENDMENT;
  if (normalized === EventFnbSourceMenuSourceType.REPLACEMENT) return EventFnbSourceMenuSourceType.REPLACEMENT;
  return EventFnbSourceMenuSourceType.ORIGINAL;
}

function normalizeDate(value: unknown, fieldName: string): Date | null {
  if (value == null || String(value).trim() === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new FnbCatalogError(`${fieldName} must be a valid date`, 400);
  return date;
}

function normalizeOperationalStatus(value: unknown, fallback: FnbOperationalStatus = FnbOperationalStatus.OUTSTANDING): FnbOperationalStatus {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (Object.values(FnbOperationalStatus).includes(normalized as FnbOperationalStatus)) return normalized as FnbOperationalStatus;
  return fallback;
}

export function validateMenuLifecycleTransition(input: {
  from: FnbOperationalStatus;
  to: FnbOperationalStatus;
  hasSource: boolean;
  totalItems: number;
  codedItems: number;
  verifiedItems: number;
  verificationSource?: string | null;
}): void {
  if (input.to === FnbOperationalStatus.OUTSTANDING && input.hasSource) {
    throw new FnbCatalogError("A received source cannot return to Outstanding", 409);
  }
  if (input.to !== FnbOperationalStatus.OUTSTANDING && input.to !== FnbOperationalStatus.NEEDS_REVIEW && !input.hasSource) {
    throw new FnbCatalogError("Receive the source menu before advancing its lifecycle", 409);
  }
  if ((input.to === FnbOperationalStatus.CODED || input.to === FnbOperationalStatus.CONFIRMED)
    && (input.totalItems === 0 || input.codedItems !== input.totalItems)) {
    throw new FnbCatalogError("All menu items must be coded before advancing", 409);
  }
  if (input.to === FnbOperationalStatus.CONFIRMED
    && (input.verifiedItems !== input.totalItems || !input.verificationSource?.trim())) {
    throw new FnbCatalogError("Confirmation requires verified items and vendor/hotel evidence", 409);
  }
}

function isSourceMenuProcessing(status: EventFnbSourceMenuStatus): boolean {
  return status === EventFnbSourceMenuStatus.READING_PDF
    || status === EventFnbSourceMenuStatus.MAPPING_SECTIONS
    || status === EventFnbSourceMenuStatus.EXTRACTING_ITEMS;
}

function normalizeOptionalQuantity(value: unknown): number | null {
  if (typeof value === "undefined" || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new FnbCatalogError("quantity must be a positive whole number", 400);
  }
  return parsed;
}

function normalizeOptionalCents(value: unknown): number | null {
  if (typeof value === "undefined" || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new FnbCatalogError("manualPriceCents must be a non-negative whole number", 400);
  }
  return parsed;
}

function normalizeCustomAssignmentItem(value: unknown, actorUserId?: string): NormalizedCustomAssignmentItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FnbCatalogError("customItem must be an object", 400);
  const input = value as Record<string, unknown>;
  const cents = (field: string) => {
    const raw = input[field];
    if (raw == null || String(raw).trim() === "") return null;
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new FnbCatalogError(`customItem.${field} must be non-negative integer cents`, 400);
    return parsed;
  };
  const publishedPriceCents = cents("publishedPriceCents");
  const negotiatedPriceCents = cents("negotiatedPriceCents");
  const discountCents = cents("discountCents");
  if (publishedPriceCents == null && negotiatedPriceCents == null) throw new FnbCatalogError("Custom/off-menu items require a published or negotiated price", 400);
  const effective = negotiatedPriceCents ?? publishedPriceCents ?? 0;
  if ((discountCents ?? 0) > effective) throw new FnbCatalogError("Custom/off-menu discount exceeds the selected unit price", 400);
  const currency = String(input.currency ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new FnbCatalogError("customItem.currency must be a three-letter ISO code", 400);
  const pricingRaw = String(input.pricingUnit ?? "PER_PERSON").trim().toUpperCase();
  const pricingUnit = pricingRaw === "" ? null : pricingRaw as FnbPricingUnit;
  if (pricingUnit && !Object.values(FnbPricingUnit).includes(pricingUnit)) throw new FnbCatalogError("customItem.pricingUnit is invalid", 400);
  const minimumQuantity = normalizeOptionalQuantity(input.minimumQuantity);
  const statusRaw = String(input.verificationStatus ?? "NEEDS_REVIEW").trim().toUpperCase() as FnbVerificationStatus;
  if (!Object.values(FnbVerificationStatus).includes(statusRaw)) throw new FnbCatalogError("customItem.verificationStatus is invalid", 400);
  const verificationSource = normalizeOptionalText(input.verificationSource);
  if (statusRaw === FnbVerificationStatus.VERIFIED && (!actorUserId || !verificationSource)) {
    throw new FnbCatalogError("Verified custom/off-menu items require an actor and vendor evidence", 400);
  }
  const claimInputs = input.claims == null ? [] : input.claims;
  if (!Array.isArray(claimInputs)) throw new FnbCatalogError("customItem.claims must be an array", 400);
  const claims = claimInputs.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new FnbCatalogError(`customItem.claims[${index}] must be an object`, 400);
    const claim = raw as Record<string, unknown>;
    const kind = String(claim.kind ?? "").trim().toUpperCase() as FnbClaimKind;
    if (!Object.values(FnbClaimKind).includes(kind)) throw new FnbCatalogError(`customItem.claims[${index}].kind is invalid`, 400);
    const code = String(claim.code ?? "").trim().toUpperCase();
    if (!code || !/^[A-Z0-9_]+$/.test(code)) throw new FnbCatalogError(`customItem.claims[${index}].code is invalid`, 400);
    const customLabel = code === "CUSTOM" ? normalizeOptionalText(claim.customLabel) : null;
    if (code === "CUSTOM" && !customLabel) throw new FnbCatalogError(`customItem.claims[${index}].customLabel is required`, 400);
    const evidenceSource = normalizeOptionalText(claim.evidenceSource) ?? verificationSource;
    if (statusRaw === FnbVerificationStatus.VERIFIED && !evidenceSource) throw new FnbCatalogError("Verified custom/off-menu claims require evidence", 400);
    return { kind, code, customLabel, verificationStatus: statusRaw, evidenceSource };
  });
  const uniqueClaims = new Set(claims.map((claim) => `${claim.kind}:${claim.code}:${claim.customLabel ?? ""}`));
  if (uniqueClaims.size !== claims.length) throw new FnbCatalogError("Custom/off-menu safety claims must be unique", 400);
  return {
    itemName: normalizeRequiredText(input.itemName, "customItem.itemName"),
    description: normalizeOptionalText(input.description),
    category: normalizeOptionalText(input.category),
    unit: normalizeOptionalText(input.unit),
    publishedPriceCents,
    negotiatedPriceCents,
    discountCents,
    currency,
    pricingUnit,
    minimumQuantity,
    taxable: input.taxable !== false,
    preparationNotes: normalizeOptionalText(input.preparationNotes),
    serviceNotes: normalizeOptionalText(input.serviceNotes),
    vendorNotes: normalizeOptionalText(input.vendorNotes),
    verificationStatus: statusRaw,
    verificationSource,
    claims,
  };
}

function normalizePercentage(value: unknown, fieldName: string): string {
  try {
    return normalizeFnbPercentage(value);
  } catch (error) {
    throw new FnbCatalogError(
      `${fieldName}: ${error instanceof Error ? error.message : "Invalid percentage"}`,
      400,
    );
  }
}

function normalizeAssignmentTaxes(value: unknown): Array<{ label: string | null; percentage: string; sortOrder: number }> {
  if (typeof value === "undefined") return [];
  if (!Array.isArray(value)) {
    throw new FnbCatalogError("taxes must be an array", 400);
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new FnbCatalogError(`taxes[${index}] must be an object`, 400);
    }
    const record = entry as Record<string, unknown>;
    const label = normalizeOptionalText(record.label);
    if (label && label.length > 120) {
      throw new FnbCatalogError(`taxes[${index}].label must be 120 characters or fewer`, 400);
    }
    return {
      label,
      percentage: normalizePercentage(record.percentage, `taxes[${index}].percentage`),
      sortOrder: index,
    };
  });
}

function toRecord(row: {
  id: string;
  eventId: string;
  sourceMenuId: string | null;
  itemName: string;
  description: string | null;
  price: string | null;
  unit: string | null;
  category: string | null;
  sourceMenuFileName: string | null;
  publishedPriceCents?: number | null;
  negotiatedPriceCents?: number | null;
  discountCents?: number | null;
  currency?: string;
  pricingUnit?: string | null;
  minimumQuantity?: number | null;
  taxable?: boolean;
  isCustom?: boolean;
  crossContactNotes?: string | null;
  preparationNotes?: string | null;
  modificationStatus?: FnbVerificationStatus | null;
  modificationEvidenceSource?: string | null;
  modificationVerifiedByUserId?: string | null;
  modificationVerifiedAt?: Date | null;
  serviceNotes?: string | null;
  vendorNotes?: string | null;
  internalNotes?: string | null;
  verificationStatus?: FnbVerificationStatus;
  verifiedByUserId?: string | null;
  verifiedAt?: Date | null;
  verificationSource?: string | null;
  verificationNotes?: string | null;
  version?: number;
  claims?: Array<{ id: string; kind: FnbClaimKind; code: string; customLabel: string | null; verificationStatus: FnbVerificationStatus; evidenceSource: string | null; notes: string | null }>;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): FnbCatalogItemRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    sourceMenuId: row.sourceMenuId,
    itemName: row.itemName,
    description: row.description,
    price: row.price,
    unit: row.unit,
    category: row.category,
    sourceMenuFileName: row.sourceMenuFileName,
    publishedPriceCents: row.publishedPriceCents ?? null,
    negotiatedPriceCents: row.negotiatedPriceCents ?? null,
    discountCents: row.discountCents ?? null,
    currency: row.currency ?? "USD",
    pricingUnit: row.pricingUnit ?? null,
    minimumQuantity: row.minimumQuantity ?? null,
    taxable: row.taxable ?? true,
    isCustom: row.isCustom ?? false,
    crossContactNotes: row.crossContactNotes ?? null,
    preparationNotes: row.preparationNotes ?? null,
    modificationStatus: row.modificationStatus ?? null,
    modificationEvidenceSource: row.modificationEvidenceSource ?? null,
    modificationVerifiedByUserId: row.modificationVerifiedByUserId ?? null,
    modificationVerifiedAt: row.modificationVerifiedAt?.toISOString() ?? null,
    serviceNotes: row.serviceNotes ?? null,
    vendorNotes: row.vendorNotes ?? null,
    internalNotes: row.internalNotes ?? null,
    verificationStatus: row.verificationStatus ?? FnbVerificationStatus.UNVERIFIED,
    verifiedByUserId: row.verifiedByUserId ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verificationSource: row.verificationSource ?? null,
    verificationNotes: row.verificationNotes ?? null,
    version: row.version ?? 1,
    claims: row.claims ?? [],
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSourceMenuRecord(row: {
  id: string;
  eventId: string;
  menuName: string;
  fileName: string | null;
  sourceType: EventFnbSourceMenuSourceType;
  status: EventFnbSourceMenuStatus;
  objectKey: string | null;
  itemsFound: number;
  progressSummary: string | null;
  lastError: string | null;
  baseSourceMenuId: string | null;
  operationalStatus: FnbOperationalStatus;
  venueOrCaterer: string | null;
  mealContext: string | null;
  expectedAt: Date | null;
  receivedAt: Date | null;
  effectiveAt: Date | null;
  versionLabel: string | null;
  ownerUserId: string | null;
  verificationStatus: FnbVerificationStatus;
  verifiedByUserId: string | null;
  verifiedAt: Date | null;
  verificationSource: string | null;
  verificationNotes: string | null;
  internalNotes: string | null;
  version: number;
  catalogItems?: Array<{ category: string | null; price: string | null; verificationStatus: FnbVerificationStatus }>;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): FnbSourceMenuRecord {
  const activeItems = row.catalogItems ?? [];
  return {
    id: row.id,
    eventId: row.eventId,
    menuName: row.menuName,
    fileName: row.fileName,
    sourceType: row.sourceType,
    status: row.status,
    objectKey: row.objectKey,
    itemsFound: row.itemsFound,
    progressSummary: row.progressSummary,
    lastError: row.lastError,
    baseSourceMenuId: row.baseSourceMenuId,
    operationalStatus: row.operationalStatus,
    venueOrCaterer: row.venueOrCaterer,
    mealContext: row.mealContext,
    expectedAt: row.expectedAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    effectiveAt: row.effectiveAt?.toISOString() ?? null,
    versionLabel: row.versionLabel,
    ownerUserId: row.ownerUserId,
    verificationStatus: row.verificationStatus,
    verifiedByUserId: row.verifiedByUserId,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verificationSource: row.verificationSource,
    verificationNotes: row.verificationNotes,
    internalNotes: row.internalNotes,
    version: row.version,
    totalItems: activeItems.length || row.itemsFound,
    codedItems: activeItems.filter((item) => Boolean(item.category && item.price)).length,
    verifiedItems: activeItems.filter((item) => item.verificationStatus === FnbVerificationStatus.VERIFIED).length,
    needsReviewItems: activeItems.filter((item) => item.verificationStatus === FnbVerificationStatus.NEEDS_REVIEW || item.verificationStatus === FnbVerificationStatus.STALE).length,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSessionFnbAssignmentRecord(row: {
  id: string;
  sessionId: string;
  eventFnbCatalogItemId: string;
  catalogItemVersion: number;
  catalogItemSnapshot: Prisma.JsonValue | null;
  budgetLineItemId: string | null;
  quantity: number | null;
  manualPriceCents: number | null;
  serviceTiming: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  catalogItem: {
    id: string;
    eventId: string;
    sourceMenuId: string | null;
    itemName: string;
    description: string | null;
    price: string | null;
    unit: string | null;
    category: string | null;
    sourceMenuFileName: string | null;
    publishedPriceCents?: number | null;
    negotiatedPriceCents?: number | null;
    discountCents?: number | null;
    currency?: string;
    minimumQuantity?: number | null;
    taxable?: boolean;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  budgetLineItem?: {
    id: string;
    category: string;
    subcategory: string;
    lineItem: string;
    vendor: string | null;
    forecastCents: number;
    actualCents: number;
    status: BudgetLineItemStatus;
    approval: BudgetLineItemApproval;
  } | null;
  taxes: Array<{
    id: string;
    assignmentId: string;
    label: string | null;
    percentage: Prisma.Decimal;
    sortOrder: number;
  }>;
  session: {
    fnbTaxPercent: Prisma.Decimal;
    fnbServiceChargePercent: Prisma.Decimal;
  };
}): SessionFnbCatalogAssignmentRecord {
  const taxes = row.taxes.map((tax) => ({
    id: tax.id,
    assignmentId: tax.assignmentId,
    label: tax.label,
    percentage: tax.percentage.toFixed(4),
    sortOrder: tax.sortOrder,
  }));
  const subtotalCents = assignmentForecastTotalCentsNullable({
    catalogPrice: row.catalogItem.price,
    quantity: row.quantity,
    manualPriceCents: row.manualPriceCents,
    notes: row.notes,
  });
  const snapshot = row.catalogItemSnapshot && typeof row.catalogItemSnapshot === "object" && !Array.isArray(row.catalogItemSnapshot)
    ? row.catalogItemSnapshot as Record<string, Prisma.JsonValue>
    : null;
  const snapshotCents = (key: "publishedPriceCents" | "negotiatedPriceCents" | "discountCents"): number | null => {
    const value = snapshot?.[key];
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  const snapshotMinimum = snapshot?.minimumQuantity;
  const pinnedMinimumQuantity = snapshot
    ? typeof snapshotMinimum === "number" && Number.isSafeInteger(snapshotMinimum) && snapshotMinimum > 0 ? snapshotMinimum : null
    : row.catalogItem.minimumQuantity ?? null;
  const pinnedPublishedPriceCents = snapshot ? snapshotCents("publishedPriceCents") : row.catalogItem.publishedPriceCents ?? null;
  const pinnedNegotiatedPriceCents = snapshot ? snapshotCents("negotiatedPriceCents") : row.catalogItem.negotiatedPriceCents ?? null;
  const pinnedDiscountCents = snapshot ? snapshotCents("discountCents") ?? 0 : row.catalogItem.discountCents ?? 0;
  const pinnedCurrency = typeof snapshot?.currency === "string" ? snapshot.currency : row.catalogItem.currency ?? "USD";
  const pinnedTaxable = typeof snapshot?.taxable === "boolean" ? snapshot.taxable : row.catalogItem.taxable ?? true;
  const financials = calculateFnbAssignmentFinancials({
    id: row.id,
    currency: pinnedCurrency,
    quantity: row.quantity ?? pinnedMinimumQuantity ?? null,
    minimumQuantity: pinnedMinimumQuantity,
    publishedUnitCents: pinnedPublishedPriceCents,
    negotiatedUnitCents: pinnedNegotiatedPriceCents,
    discountUnitCents: pinnedDiscountCents,
    taxable: pinnedTaxable,
    totalOverrideCents: row.manualPriceCents,
    legacySubtotalCents: subtotalCents,
    taxPercent: row.session.fnbTaxPercent.toString(),
    serviceChargePercent: row.session.fnbServiceChargePercent.toString(),
    itemTaxes: taxes,
    actualTotalCents: row.budgetLineItem?.actualCents ?? null,
  });
  const calculation = financials.breakdown;
  const financialCalculation = financials.order;

  return {
    id: row.id,
    sessionId: row.sessionId,
    eventFnbCatalogItemId: row.eventFnbCatalogItemId,
    catalogItemVersion: row.catalogItemVersion,
    catalogItemSnapshot: row.catalogItemSnapshot,
    budgetLineItemId: row.budgetLineItemId,
    quantity: row.quantity,
    manualPriceCents: row.manualPriceCents,
    serviceTiming: row.serviceTiming,
    notes: row.notes,
    taxes,
    calculation,
    financialCalculation,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    catalogItem: toRecord(row.catalogItem),
    syncedBudgetLineItem: row.budgetLineItem
      ? {
          id: row.budgetLineItem.id,
          category: row.budgetLineItem.category,
          subcategory: row.budgetLineItem.subcategory,
          lineItem: row.budgetLineItem.lineItem,
          vendor: row.budgetLineItem.vendor,
          forecastCents: row.budgetLineItem.forecastCents,
          actualCents: row.budgetLineItem.actualCents,
          status: row.budgetLineItem.status,
          approval: row.budgetLineItem.approval,
        }
      : null,
  };
}

async function ensureEventExists(eventId: string, prisma: FnbCatalogDbClient = getPrisma()): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });

  if (!event) {
    throw new FnbCatalogError("Event not found", 404);
  }
}

async function ensureEventExistsWithPrisma(prisma: FnbCatalogDbClient, eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });

  if (!event) {
    throw new FnbCatalogError("Event not found", 404);
  }
}

async function ensureSessionExistsForEvent(
  eventId: string,
  sessionId: string,
  prisma: FnbCatalogDbClient = getPrisma(),
): Promise<void> {
  await ensureEventExists(eventId, prisma);

  const session = await prisma.matrixRow.findFirst({
    where: {
      id: sessionId,
      eventId,
    },
    select: { id: true },
  });

  if (!session) {
    throw new FnbCatalogError("Session not found", 404);
  }
}

async function assertBudgetLineEditable(prisma: FnbCatalogDbClient, lineItemId: string): Promise<void> {
  const lockedSubmission = await prisma.budgetSubmissionLineItem.findFirst({
    where: {
      budgetLineItemId: lineItemId,
      submission: {
        status: { in: ["SUBMITTED", "APPROVED", "REJECTED"] },
      },
    },
    select: { submissionId: true },
  });

  if (lockedSubmission) {
    throw new FnbCatalogError("Synced budget line item is locked for review", 409);
  }
}

async function getEditableBudget(prisma: FnbCatalogDbClient, eventId: string) {
  const budget = await prisma.budget.upsert({
    where: { eventId },
    update: {},
    create: {
      eventId,
      status: BudgetStatus.DRAFT,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (budget.status === BudgetStatus.APPROVED) {
    throw new FnbCatalogError("Budget is locked for review", 409);
  }

  return budget;
}

async function syncAssignmentBudgetLine(
  prisma: FnbCatalogDbClient,
  eventId: string,
  assignmentId: string,
): Promise<SessionFnbCatalogAssignmentRecord> {
  const assignment = await prisma.sessionFnbCatalogAssignment.findFirst({
    where: {
      id: assignmentId,
      catalogItem: { eventId },
      session: { eventId },
    },
    include: {
      catalogItem: { include: { claims: { orderBy: [{ kind: "asc" }, { code: "asc" }] } } },
      budgetLineItem: true,
      taxes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      session: { select: { fnbTaxPercent: true, fnbServiceChargePercent: true } },
    },
  });

  if (!assignment) {
    throw new FnbCatalogError("F&B session assignment not found", 404);
  }

  const budget = await getEditableBudget(prisma, eventId);
  const calculation = toSessionFnbAssignmentRecord(assignment).calculation;
  const budgetData = {
    category: "F&B",
    subcategory: assignment.catalogItem.category?.trim() || "General",
    // Carry the canonical session (MatrixRow) link onto the generated budget
    // row. Applied in both the update and create branches below, so re-syncing
    // an existing row reconciles its session link (e.g. the source assignment
    // moved to a different session) without creating a duplicate row.
    matrixRowId: assignment.sessionId,
    lineItem: assignment.catalogItem.itemName,
    vendor: assignment.catalogItem.sourceMenuFileName,
    forecastCents: calculation.totalCents ?? 0,
    status: BudgetLineItemStatus.PLANNED,
    approval: BudgetLineItemApproval.PENDING,
  };

  let budgetLineItemId = assignment.budgetLineItemId;

  if (budgetLineItemId) {
    await assertBudgetLineEditable(prisma, budgetLineItemId);
    await prisma.budgetLineItem.update({
      where: { id: budgetLineItemId },
      data: budgetData,
    });
  } else {
    const maxSortOrder = await prisma.budgetLineItem.aggregate({
      where: { budgetId: budget.id },
      _max: { sortOrder: true },
    });
    const created = await prisma.budgetLineItem.create({
      data: {
        budgetId: budget.id,
        ...budgetData,
        // F&B planning establishes the initial actual at zero, but later plan
        // edits must never overwrite invoice/posted actual spend.
        actualCents: 0,
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      },
    });
    budgetLineItemId = created.id;
    await prisma.sessionFnbCatalogAssignment.update({
      where: { id: assignment.id },
      data: { budgetLineItemId },
    });
  }

  const synced = await prisma.sessionFnbCatalogAssignment.findUniqueOrThrow({
    where: { id: assignment.id },
    include: {
      catalogItem: { include: { claims: { orderBy: [{ kind: "asc" }, { code: "asc" }] } } },
      budgetLineItem: true,
      taxes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      session: { select: { fnbTaxPercent: true, fnbServiceChargePercent: true } },
    },
  });

  return toSessionFnbAssignmentRecord(synced);
}

export async function listFnbCatalogItems(eventId: string): Promise<FnbCatalogItemRecord[]> {
  await ensureEventExists(eventId);

  const rows = await getPrisma().eventFnbCatalogItem.findMany({
    where: {
      eventId,
      archivedAt: null,
    },
    orderBy: [
      { category: "asc" },
      { itemName: "asc" },
    ],
    include: { claims: { orderBy: [{ kind: "asc" }, { code: "asc" }] } },
  });

  return rows.map(toRecord);
}

export async function listFnbSourceMenus(
  eventId: string,
  options: { includeArchived?: boolean } = {},
  deps: { prisma?: ReturnType<typeof getPrisma> } = {},
): Promise<FnbSourceMenuRecord[]> {
  const prisma = deps.prisma ?? getPrisma();
  await ensureEventExistsWithPrisma(prisma, eventId);

  const rows = await prisma.eventFnbSourceMenu.findMany({
    where: {
      eventId,
      ...(options.includeArchived ? {} : { archivedAt: null, status: { not: EventFnbSourceMenuStatus.ARCHIVED } }),
    },
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    include: {
      catalogItems: {
        where: { archivedAt: null },
        select: { category: true, price: true, verificationStatus: true },
      },
    },
  });

  return rows.map(toSourceMenuRecord);
}

export async function getFnbCatalogPayload(eventId: string): Promise<FnbCatalogPayload> {
  const [items, sourceMenus] = await Promise.all([
    listFnbCatalogItems(eventId),
    listFnbSourceMenus(eventId),
  ]);
  return { items, sourceMenus };
}

export async function createFnbSourceMenu(
  eventId: string,
  input: CreateFnbSourceMenuInput,
  deps: { prisma?: ReturnType<typeof getPrisma> } = {},
): Promise<FnbSourceMenuRecord> {
  const prisma = deps.prisma ?? getPrisma();
  await ensureEventExistsWithPrisma(prisma, eventId);

  const fileName = normalizeOptionalText(input.fileName);
  const menuName = normalizeOptionalText(input.menuName) ?? (fileName?.replace(/\.[^.]+$/, "") || "Expected menu");
  const objectKey = normalizeOptionalText(input.objectKey);
  const sourceType = normalizeSourceMenuSourceType(input.sourceType);
  const baseSourceMenuId = normalizeOptionalId(input.baseSourceMenuId, "baseSourceMenuId");
  const operationalStatus = normalizeOperationalStatus(input.operationalStatus, objectKey ? FnbOperationalStatus.RECEIVED : FnbOperationalStatus.OUTSTANDING);
  if (operationalStatus !== FnbOperationalStatus.OUTSTANDING && !objectKey) {
    throw new FnbCatalogError("Manual menus without a received source must start Outstanding", 409);
  }
  const ownerUserId = normalizeOptionalId(input.ownerUserId, "ownerUserId");
  if (ownerUserId) {
    const owner = await prisma.user.findFirst({
      where: { id: ownerUserId, eventMemberships: { some: { eventId } } },
      select: { id: true },
    });
    if (!owner) throw new FnbCatalogError("Owner is not available for this event", 404);
  }

  if (baseSourceMenuId) {
    const baseMenu = await prisma.eventFnbSourceMenu.findFirst({
      where: { id: baseSourceMenuId, eventId, archivedAt: null },
      select: { id: true },
    });
    if (!baseMenu) {
      throw new FnbCatalogError("Base source menu not found", 404);
    }
  }

  const row = await prisma.eventFnbSourceMenu.create({
    data: {
      eventId,
      menuName,
      fileName,
      objectKey,
      sourceType,
      status: EventFnbSourceMenuStatus.UPLOADED,
      itemsFound: 0,
      progressSummary: "Uploaded; waiting for parser",
      baseSourceMenuId,
      operationalStatus,
      venueOrCaterer: normalizeOptionalText(input.venueOrCaterer),
      mealContext: normalizeOptionalText(input.mealContext),
      expectedAt: normalizeDate(input.expectedAt, "expectedAt"),
      receivedAt: normalizeDate(input.receivedAt, "receivedAt") ?? (objectKey ? new Date() : null),
      effectiveAt: normalizeDate(input.effectiveAt, "effectiveAt"),
      versionLabel: normalizeOptionalText(input.versionLabel),
      ownerUserId,
      internalNotes: normalizeOptionalText(input.internalNotes),
    },
  });

  console.info("[fnb-source-menu] source menu persisted", {
    eventId,
    sourceMenuId: row.id,
    fileName: fileName ?? "manual",
    sourceType,
  });

  return toSourceMenuRecord(row);
}

export async function updateFnbSourceMenuLifecycle(
  eventId: string,
  sourceMenuId: string,
  input: UpdateFnbSourceMenuLifecycleInput,
  actorUserId: string,
  deps: { prisma?: ReturnType<typeof getPrisma> } = {},
): Promise<FnbSourceMenuRecord> {
  const prisma = deps.prisma ?? getPrisma();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.eventFnbSourceMenu.findFirst({
      where: { id: sourceMenuId, eventId, archivedAt: null },
      include: { catalogItems: { where: { archivedAt: null }, select: { category: true, price: true, verificationStatus: true } } },
    });
    if (!existing) throw new FnbCatalogError("Source menu not found", 404);
    const expectedVersion = Number(input.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== existing.version) {
      throw new FnbCatalogError("This menu changed. Refresh and retry.", 409);
    }
    const to = normalizeOperationalStatus(input.operationalStatus, existing.operationalStatus);
    const totalItems = existing.catalogItems.length;
    const codedItems = existing.catalogItems.filter((item) => item.category && item.price).length;
    const verifiedItems = existing.catalogItems.filter((item) => item.verificationStatus === FnbVerificationStatus.VERIFIED).length;
    const verificationSource = normalizeOptionalText(input.verificationSource) ?? existing.verificationSource;
    validateMenuLifecycleTransition({ from: existing.operationalStatus, to, hasSource: Boolean(existing.objectKey || input.objectKey), totalItems, codedItems, verifiedItems, verificationSource });

    const sourceChanged = typeof input.objectKey === "string" && input.objectKey.trim() !== existing.objectKey;
    const ownerUserId = hasOwn(input, "ownerUserId") ? normalizeOptionalId(input.ownerUserId, "ownerUserId") : undefined;
    if (ownerUserId) {
      const owner = await tx.user.findFirst({
        where: { id: ownerUserId, eventMemberships: { some: { eventId } } },
        select: { id: true },
      });
      if (!owner) throw new FnbCatalogError("Owner is not available for this event", 404);
    }
    const row = await tx.eventFnbSourceMenu.update({
      where: { id: existing.id },
      data: {
        menuName: hasOwn(input, "menuName") ? normalizeOptionalText(input.menuName) ?? existing.menuName : undefined,
        venueOrCaterer: hasOwn(input, "venueOrCaterer") ? normalizeOptionalText(input.venueOrCaterer) : undefined,
        mealContext: hasOwn(input, "mealContext") ? normalizeOptionalText(input.mealContext) : undefined,
        expectedAt: hasOwn(input, "expectedAt") ? normalizeDate(input.expectedAt, "expectedAt") : undefined,
        receivedAt: hasOwn(input, "receivedAt") ? normalizeDate(input.receivedAt, "receivedAt") : undefined,
        effectiveAt: hasOwn(input, "effectiveAt") ? normalizeDate(input.effectiveAt, "effectiveAt") : undefined,
        versionLabel: hasOwn(input, "versionLabel") ? normalizeOptionalText(input.versionLabel) : undefined,
        ownerUserId,
        internalNotes: hasOwn(input, "internalNotes") ? normalizeOptionalText(input.internalNotes) : undefined,
        operationalStatus: sourceChanged ? FnbOperationalStatus.NEEDS_REVIEW : to,
        verificationStatus: sourceChanged ? FnbVerificationStatus.STALE : (to === FnbOperationalStatus.CONFIRMED ? FnbVerificationStatus.VERIFIED : existing.verificationStatus),
        verifiedByUserId: to === FnbOperationalStatus.CONFIRMED ? actorUserId : existing.verifiedByUserId,
        verifiedAt: to === FnbOperationalStatus.CONFIRMED ? new Date() : existing.verifiedAt,
        verificationSource: hasOwn(input, "verificationSource") ? normalizeOptionalText(input.verificationSource) : undefined,
        verificationNotes: hasOwn(input, "verificationNotes") ? normalizeOptionalText(input.verificationNotes) : undefined,
        version: { increment: 1 },
      },
      include: { catalogItems: { where: { archivedAt: null }, select: { category: true, price: true, verificationStatus: true } } },
    });
    return toSourceMenuRecord(row);
  });
}

export async function attachFnbSourceMenuUpload(
  eventId: string,
  sourceMenuId: string,
  input: { fileName?: unknown; objectKey?: unknown; sourceType?: unknown; expectedVersion?: unknown },
  deps: { prisma?: ReturnType<typeof getPrisma> } = {},
): Promise<FnbSourceMenuRecord> {
  const prisma = deps.prisma ?? getPrisma();
  const fileName = normalizeRequiredText(input.fileName, "fileName");
  const objectKey = normalizeRequiredText(input.objectKey, "objectKey");
  const sourceType = normalizeSourceMenuSourceType(input.sourceType);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.eventFnbSourceMenu.findFirst({
      where: { id: sourceMenuId, eventId, archivedAt: null },
      include: { catalogItems: { where: { archivedAt: null }, select: { category: true, price: true, verificationStatus: true } } },
    });
    if (!existing) throw new FnbCatalogError("Source menu not found", 404);
    const expectedVersion = Number(input.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== existing.version) {
      throw new FnbCatalogError("This menu changed. Refresh and retry.", 409);
    }

    const replacingSource = Boolean(existing.objectKey && existing.objectKey !== objectKey);
    if (replacingSource) {
      await tx.eventFnbCatalogItem.updateMany({
        where: { eventId, sourceMenuId: existing.id },
        data: { version: { increment: 1 } },
      });
      await tx.eventFnbCatalogItem.updateMany({
        where: { eventId, sourceMenuId: existing.id, verificationStatus: FnbVerificationStatus.VERIFIED },
        data: { verificationStatus: FnbVerificationStatus.STALE },
      });
      await tx.eventFnbCatalogItem.updateMany({
        where: { eventId, sourceMenuId: existing.id, modificationStatus: FnbVerificationStatus.VERIFIED },
        data: { modificationStatus: FnbVerificationStatus.STALE },
      });
      await tx.eventFnbCatalogItemClaim.updateMany({
        where: { eventId, item: { sourceMenuId: existing.id }, verificationStatus: FnbVerificationStatus.VERIFIED },
        data: { verificationStatus: FnbVerificationStatus.STALE },
      });
    }

    const row = await tx.eventFnbSourceMenu.update({
      where: { id: existing.id },
      data: {
        fileName,
        objectKey,
        sourceType,
        status: EventFnbSourceMenuStatus.UPLOADED,
        progressSummary: "Uploaded; waiting for parser",
        lastError: null,
        receivedAt: new Date(),
        operationalStatus: replacingSource ? FnbOperationalStatus.NEEDS_REVIEW : FnbOperationalStatus.RECEIVED,
        verificationStatus: replacingSource ? FnbVerificationStatus.STALE : existing.verificationStatus,
        version: { increment: 1 },
      },
      include: { catalogItems: { where: { archivedAt: null }, select: { category: true, price: true, verificationStatus: true } } },
    });
    return toSourceMenuRecord(row);
  });
}

export async function getFnbSourceMenuForEvent(
  eventId: string,
  sourceMenuId: string,
  deps: { prisma?: ReturnType<typeof getPrisma> } = {},
): Promise<FnbSourceMenuRecord> {
  const prisma = deps.prisma ?? getPrisma();
  await ensureEventExistsWithPrisma(prisma, eventId);
  const row = await prisma.eventFnbSourceMenu.findFirst({
    where: { id: sourceMenuId, eventId },
  });
  if (!row) {
    throw new FnbCatalogError("Source menu not found", 404);
  }
  return toSourceMenuRecord(row);
}

export async function updateFnbSourceMenuStatus(
  eventId: string,
  sourceMenuId: string,
  status: EventFnbSourceMenuStatus,
  patch: {
    itemsFound?: number;
    progressSummary?: string | null;
    lastError?: string | null;
  } = {},
  deps: { prisma?: ReturnType<typeof getPrisma> } = {},
): Promise<FnbSourceMenuRecord> {
  const prisma = deps.prisma ?? getPrisma();
  await ensureEventExistsWithPrisma(prisma, eventId);
  const existing = await prisma.eventFnbSourceMenu.findFirst({
    where: { id: sourceMenuId, eventId },
    select: { id: true },
  });
  if (!existing) {
    throw new FnbCatalogError("Source menu not found", 404);
  }

  const row = await prisma.eventFnbSourceMenu.update({
    where: { id: sourceMenuId },
    data: {
      status,
      ...(typeof patch.itemsFound === "number" ? { itemsFound: patch.itemsFound } : {}),
      ...(typeof patch.progressSummary !== "undefined" ? { progressSummary: patch.progressSummary } : {}),
      ...(typeof patch.lastError !== "undefined" ? { lastError: patch.lastError } : {}),
    },
  });

  return toSourceMenuRecord(row);
}

export async function archiveFnbSourceMenu(
  eventId: string,
  sourceMenuId: string,
  deps: { prisma?: ReturnType<typeof getPrisma> } = {},
): Promise<FnbSourceMenuRecord> {
  const prisma = deps.prisma ?? getPrisma();
  await ensureEventExistsWithPrisma(prisma, eventId);
  const existing = await prisma.eventFnbSourceMenu.findFirst({
    where: { id: sourceMenuId, eventId, archivedAt: null },
    select: { id: true },
  });
  if (!existing) {
    throw new FnbCatalogError("Source menu not found", 404);
  }

  const row = await prisma.eventFnbSourceMenu.update({
    where: { id: sourceMenuId },
    data: {
      status: EventFnbSourceMenuStatus.ARCHIVED,
      archivedAt: new Date(),
      progressSummary: "Archived",
    },
  });

  return toSourceMenuRecord(row);
}

export async function deleteFnbSourceMenu(
  eventId: string,
  sourceMenuId: string,
  deps: { prisma?: FnbCatalogDbClient } = {},
): Promise<DeleteFnbSourceMenuResult> {
  const prisma = deps.prisma ?? getPrisma();
  await ensureEventExistsWithPrisma(prisma, eventId);
  const sourceMenu = await prisma.eventFnbSourceMenu.findFirst({
    where: { id: sourceMenuId, eventId },
    select: { id: true, status: true },
  });
  if (!sourceMenu) {
    throw new FnbCatalogError("Source menu not found", 404);
  }
  if (isSourceMenuProcessing(sourceMenu.status)) {
    throw new FnbCatalogError("Source menu is still processing. Archive it now, or delete it after parsing finishes.", 409);
  }

  const catalogItems = await prisma.eventFnbCatalogItem.findMany({
    where: { eventId, sourceMenuId },
    select: { id: true },
  });
  const catalogItemIds = catalogItems.map((item) => item.id);
  const assignedCount = catalogItemIds.length > 0
    ? await prisma.sessionFnbCatalogAssignment.count({
      where: { eventFnbCatalogItemId: { in: catalogItemIds } },
    })
    : 0;
  if (assignedCount > 0) {
    throw new FnbCatalogError("Cannot delete this source menu because one or more of its catalog items are assigned to sessions. Archive it instead.", 409);
  }

  const removeRows = async (tx: FnbCatalogDbClient) => {
    const deletedCatalogItems = await tx.eventFnbCatalogItem.deleteMany({
      where: { eventId, sourceMenuId },
    });
    await tx.eventFnbSourceMenu.delete({
      where: { id: sourceMenuId },
    });
    return deletedCatalogItems.count;
  };

  const deletedCatalogItemCount = "$transaction" in prisma && typeof prisma.$transaction === "function"
    ? await prisma.$transaction(removeRows)
    : await removeRows(prisma);

  return {
    sourceMenuId,
    deletedCatalogItemCount,
  };
}

export async function createFnbCatalogItem(
  eventId: string,
  input: CreateFnbCatalogItemInput,
): Promise<FnbCatalogItemRecord> {
  await ensureEventExists(eventId);
  const sourceMenuId = normalizeOptionalId(input.sourceMenuId, "sourceMenuId");
  if (sourceMenuId) {
    await getFnbSourceMenuForEvent(eventId, sourceMenuId);
  }

  const row = await getPrisma().eventFnbCatalogItem.create({
    data: {
      eventId,
      sourceMenuId,
      itemName: normalizeRequiredText(input.itemName, "itemName"),
      description: normalizeOptionalText(input.description),
      price: normalizeOptionalText(input.price),
      unit: normalizeOptionalText(input.unit),
      category: normalizeOptionalText(input.category),
      sourceMenuFileName: normalizeOptionalText(input.sourceMenuFileName),
    },
  });

  return toRecord(row);
}

export async function replaceFnbCatalogItemsForSourceMenu(
  eventId: string,
  input: ReplaceFnbCatalogItemsForSourceMenuInput,
  deps: { prisma?: FnbCatalogDbClient } = {},
): Promise<FnbCatalogItemRecord[]> {
  const prisma = deps.prisma ?? getPrisma();
  await ensureEventExistsWithPrisma(prisma, eventId);
  const sourceMenuId = normalizeId(input.sourceMenuId, "sourceMenuId");
  const sourceMenu = await prisma.eventFnbSourceMenu.findFirst({
    where: { id: sourceMenuId, eventId },
    select: { id: true, fileName: true },
  });
  if (!sourceMenu) {
    throw new FnbCatalogError("Source menu not found", 404);
  }

  if (!Array.isArray(input.items)) {
    throw new FnbCatalogError("items must be an array", 400);
  }

  const sourceMenuFileName = normalizeOptionalText(input.sourceMenuFileName) ?? sourceMenu.fileName;
  const catalogItems = input.items.map((item) => {
    if (!item || typeof item !== "object") {
      throw new FnbCatalogError("Catalog item must be an object", 400);
    }
    const record = item as CreateFnbCatalogItemInput;
    return {
      eventId,
      sourceMenuId,
      itemName: normalizeRequiredText(record.itemName, "itemName"),
      description: normalizeOptionalText(record.description),
      price: normalizeOptionalText(record.price),
      unit: normalizeOptionalText(record.unit),
      category: normalizeOptionalText(record.category),
      sourceMenuFileName: normalizeOptionalText(record.sourceMenuFileName) ?? sourceMenuFileName,
    };
  });

  const replaceRows = async (tx: FnbCatalogDbClient) => {
    const archivedAt = new Date();
    await tx.eventFnbCatalogItem.updateMany({
      where: {
        eventId,
        sourceMenuId,
        archivedAt: null,
      },
      data: { archivedAt },
    });

    if (catalogItems.length > 0) {
      await tx.eventFnbCatalogItem.createMany({
        data: catalogItems,
      });
    }

    return tx.eventFnbCatalogItem.findMany({
      where: {
        eventId,
        sourceMenuId,
        archivedAt: null,
      },
      orderBy: [
        { createdAt: "asc" },
        { itemName: "asc" },
      ],
    });
  };

  const rows = "$transaction" in prisma && typeof prisma.$transaction === "function"
    ? await prisma.$transaction(replaceRows)
    : await replaceRows(prisma);

  return rows.map(toRecord);
}

export async function updateFnbCatalogItem(
  eventId: string,
  itemId: string,
  input: UpdateFnbCatalogItemInput,
): Promise<FnbCatalogItemRecord> {
  const shouldUpdateSourceMenuId = Object.prototype.hasOwnProperty.call(input, "sourceMenuId");
  const sourceMenuId = shouldUpdateSourceMenuId ? normalizeOptionalId(input.sourceMenuId, "sourceMenuId") : null;
  const data = {
    ...(shouldUpdateSourceMenuId ? { sourceMenuId } : {}),
    itemName: normalizeRequiredText(input.itemName, "itemName"),
    description: normalizeOptionalText(input.description),
    price: normalizeOptionalText(input.price),
    unit: normalizeOptionalText(input.unit),
    category: normalizeOptionalText(input.category),
    sourceMenuFileName: normalizeOptionalText(input.sourceMenuFileName),
  };

  return getPrisma().$transaction(async (tx) => {
    await ensureEventExists(eventId, tx);
    if (shouldUpdateSourceMenuId && sourceMenuId) {
      const sourceMenu = await tx.eventFnbSourceMenu.findFirst({
        where: { id: sourceMenuId, eventId },
        select: { id: true, version: true },
      });
      if (!sourceMenu) throw new FnbCatalogError("F&B source menu not found", 404);
    }

    const existing = await tx.eventFnbCatalogItem.findFirst({
      where: { id: itemId, eventId, archivedAt: null },
      select: {
        id: true,
        sessionAssignments: { select: { id: true, budgetLineItemId: true } },
      },
    });

    if (!existing) {
      throw new FnbCatalogError("F&B catalog item not found", 404);
    }
    for (const assignment of existing.sessionAssignments) {
      if (assignment.budgetLineItemId) await assertBudgetLineEditable(tx, assignment.budgetLineItemId);
    }

    const row = await tx.eventFnbCatalogItem.update({ where: { id: itemId }, data });
    for (const assignment of existing.sessionAssignments) {
      await syncAssignmentBudgetLine(tx, eventId, assignment.id);
    }
    return toRecord(row);
  });
}

export async function archiveFnbCatalogItem(eventId: string, itemId: string): Promise<FnbCatalogItemRecord> {
  await ensureEventExists(eventId);

  const existing = await getPrisma().eventFnbCatalogItem.findFirst({
    where: {
      id: itemId,
      eventId,
      archivedAt: null,
    },
    select: { id: true },
  });

  if (!existing) {
    throw new FnbCatalogError("F&B catalog item not found", 404);
  }

  const row = await getPrisma().eventFnbCatalogItem.update({
    where: { id: itemId },
    data: { archivedAt: new Date() },
  });

  return toRecord(row);
}

export async function listSessionFnbCatalogAssignments(
  eventId: string,
  sessionId: string,
): Promise<SessionFnbCatalogAssignmentRecord[]> {
  await ensureSessionExistsForEvent(eventId, sessionId);

  const rows = await getPrisma().sessionFnbCatalogAssignment.findMany({
    where: {
      sessionId,
      catalogItem: {
        eventId,
        archivedAt: null,
      },
    },
    include: {
      catalogItem: { include: { claims: { orderBy: [{ kind: "asc" }, { code: "asc" }] } } },
      budgetLineItem: true,
      taxes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      session: { select: { fnbTaxPercent: true, fnbServiceChargePercent: true } },
    },
    orderBy: [
      { createdAt: "asc" },
    ],
  });

  return rows.map(toSessionFnbAssignmentRecord);
}

async function getSessionFnbPlanWithPrisma(
  prisma: FnbCatalogDbClient,
  eventId: string,
  sessionId: string,
): Promise<SessionFnbPlanRecord> {
  const session = await prisma.matrixRow.findFirst({
    where: { id: sessionId, eventId },
    select: {
      id: true,
      attendance: true,
      fnbTaxPercent: true,
      fnbServiceChargePercent: true,
      sessionFoodService: { select: { headcount: true } },
      fnbCatalogAssignments: {
        where: { catalogItem: { eventId, archivedAt: null } },
        include: {
          catalogItem: { include: { claims: { orderBy: [{ kind: "asc" }, { code: "asc" }] } } },
          budgetLineItem: true,
          taxes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        },
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  if (!session) {
    throw new FnbCatalogError("Session not found", 404);
  }

  const assignmentRecords = session.fnbCatalogAssignments.map((assignment) => toSessionFnbAssignmentRecord({
    ...assignment,
    session: {
      fnbTaxPercent: session.fnbTaxPercent,
      fnbServiceChargePercent: session.fnbServiceChargePercent,
    },
  }));
  const forecastAttendance = session.sessionFoodService?.headcount ?? session.attendance;

  return {
    sessionId: session.id,
    taxPercent: session.fnbTaxPercent.toFixed(4),
    serviceChargePercent: session.fnbServiceChargePercent.toFixed(4),
    forecastAttendance,
    calculation: calculateFnbPlanCost({
      assignments: assignmentRecords.map((assignment) => assignment.calculation),
      forecastAttendance,
    }),
  };
}

export async function getSessionFnbPlan(eventId: string, sessionId: string): Promise<SessionFnbPlanRecord> {
  return getSessionFnbPlanWithPrisma(getPrisma(), eventId, sessionId);
}

export async function updateSessionFnbPlan(
  eventId: string,
  sessionId: string,
  input: UpdateSessionFnbPlanInput,
): Promise<SessionFnbPlanRecord> {
  return getPrisma().$transaction(async (tx) => {
    const session = await tx.matrixRow.findFirst({
      where: { id: sessionId, eventId },
      select: {
        id: true,
        fnbTaxPercent: true,
        fnbServiceChargePercent: true,
        fnbCatalogAssignments: { select: { id: true, budgetLineItemId: true } },
      },
    });

    if (!session) {
      throw new FnbCatalogError("Session not found", 404);
    }

    const taxPercent = Object.prototype.hasOwnProperty.call(input, "taxPercent")
      ? normalizePercentage(input.taxPercent, "taxPercent")
      : session.fnbTaxPercent.toFixed(4);
    const serviceChargePercent = Object.prototype.hasOwnProperty.call(input, "serviceChargePercent")
      ? normalizePercentage(input.serviceChargePercent, "serviceChargePercent")
      : session.fnbServiceChargePercent.toFixed(4);

    for (const assignment of session.fnbCatalogAssignments) {
      if (assignment.budgetLineItemId) {
        await assertBudgetLineEditable(tx, assignment.budgetLineItemId);
      }
    }

    await tx.matrixRow.update({
      where: { id: session.id },
      data: { fnbTaxPercent: taxPercent, fnbServiceChargePercent: serviceChargePercent },
    });

    for (const assignment of session.fnbCatalogAssignments) {
      await syncAssignmentBudgetLine(tx, eventId, assignment.id);
    }

    return getSessionFnbPlanWithPrisma(tx, eventId, sessionId);
  });
}

export async function createSessionFnbCatalogAssignment(
  eventId: string,
  sessionId: string,
  input: CreateSessionFnbCatalogAssignmentInput,
  options: { actorUserId?: string } = {},
): Promise<SessionFnbCatalogAssignmentRecord> {
  if (input.customItem != null && input.eventFnbCatalogItemId != null) {
    throw new FnbCatalogError("Choose either an approved catalog item or a custom/off-menu item", 400);
  }
  const customItem = input.customItem == null ? null : normalizeCustomAssignmentItem(input.customItem, options.actorUserId);
  const requestedCatalogItemId = customItem ? null : normalizeId(input.eventFnbCatalogItemId, "eventFnbCatalogItemId");
  const taxes = normalizeAssignmentTaxes(input.taxes);

  try {
    return await getPrisma().$transaction(async (tx) => {
      await ensureSessionExistsForEvent(eventId, sessionId, tx);
      const catalogItem = await (customItem
        ? tx.eventFnbCatalogItem.create({
          data: {
            eventId,
            sourceMenuId: null,
            sourceMenuFileName: null,
            price: null,
            isCustom: true,
            ...customItem,
            verifiedByUserId: customItem.verificationStatus === FnbVerificationStatus.VERIFIED ? options.actorUserId : null,
            verifiedAt: customItem.verificationStatus === FnbVerificationStatus.VERIFIED ? new Date() : null,
            claims: customItem.claims.length > 0 ? {
              create: customItem.claims.map((claim) => ({
                eventId,
                ...claim,
                verifiedByUserId: claim.verificationStatus === FnbVerificationStatus.VERIFIED ? options.actorUserId : null,
                verifiedAt: claim.verificationStatus === FnbVerificationStatus.VERIFIED ? new Date() : null,
              })),
            } : undefined,
          },
          select: {
            id: true,
            version: true,
            itemName: true,
            category: true,
            description: true,
            publishedPriceCents: true,
            negotiatedPriceCents: true,
            discountCents: true,
            currency: true,
            pricingUnit: true,
            unit: true,
            minimumQuantity: true,
            taxable: true,
            isCustom: true,
            verificationStatus: true,
            claims: {
              orderBy: [{ kind: "asc" }, { code: "asc" }],
              select: { kind: true, code: true, customLabel: true, verificationStatus: true, evidenceSource: true },
            },
          },
        })
        : tx.eventFnbCatalogItem.findFirst({
        where: {
          id: requestedCatalogItemId as string,
          eventId,
          archivedAt: null,
        },
        select: {
          id: true,
          version: true,
          itemName: true,
          category: true,
          description: true,
          publishedPriceCents: true,
          negotiatedPriceCents: true,
          discountCents: true,
          currency: true,
          pricingUnit: true,
          unit: true,
          minimumQuantity: true,
          taxable: true,
          isCustom: true,
          verificationStatus: true,
          claims: {
            orderBy: [{ kind: "asc" }, { code: "asc" }],
            select: {
              kind: true,
              code: true,
              customLabel: true,
              verificationStatus: true,
              evidenceSource: true,
            },
          },
        },
      }));

      if (!catalogItem) {
        throw new FnbCatalogError("F&B catalog item not found", 404);
      }

      const row = await tx.sessionFnbCatalogAssignment.create({
        data: {
          sessionId,
          eventFnbCatalogItemId: catalogItem.id,
          catalogItemVersion: catalogItem.version,
          catalogItemSnapshot: {
            itemId: catalogItem.id,
            version: catalogItem.version,
            itemName: catalogItem.itemName,
            category: catalogItem.category,
            description: catalogItem.description,
            publishedPriceCents: catalogItem.publishedPriceCents,
            negotiatedPriceCents: catalogItem.negotiatedPriceCents,
            discountCents: catalogItem.discountCents,
            currency: catalogItem.currency,
            pricingUnit: catalogItem.pricingUnit,
            unit: catalogItem.unit,
            minimumQuantity: catalogItem.minimumQuantity,
            taxable: catalogItem.taxable,
            isCustom: catalogItem.isCustom,
            verificationStatus: catalogItem.verificationStatus,
            claims: catalogItem.claims,
          },
          quantity: normalizeOptionalQuantity(input.quantity),
          manualPriceCents: normalizeOptionalCents(input.manualPriceCents),
          serviceTiming: normalizeOptionalText(input.serviceTiming),
          notes: normalizeOptionalText(input.notes),
          taxes: taxes.length > 0 ? { create: taxes } : undefined,
        },
        select: { id: true },
      });

      return syncAssignmentBudgetLine(tx, eventId, row.id);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FnbCatalogError("F&B catalog item is already assigned to this session", 409);
    }
    throw error;
  }
}

export async function updateSessionFnbCatalogAssignment(
  eventId: string,
  sessionId: string,
  assignmentId: string,
  input: UpdateSessionFnbCatalogAssignmentInput,
): Promise<SessionFnbCatalogAssignmentRecord> {
  const taxes = typeof input.taxes === "undefined" ? null : normalizeAssignmentTaxes(input.taxes);
  const expectedUpdatedAt = normalizeOptionalText(input.expectedUpdatedAt);

  return getPrisma().$transaction(async (tx) => {
    await ensureSessionExistsForEvent(eventId, sessionId, tx);
    const existing = await tx.sessionFnbCatalogAssignment.findFirst({
      where: {
        id: assignmentId,
        sessionId,
        catalogItem: { eventId },
      },
      select: { id: true, updatedAt: true },
    });

    if (!existing) {
      throw new FnbCatalogError("F&B session assignment not found", 404);
    }

    const data = {
      ...(Object.prototype.hasOwnProperty.call(input, "quantity") ? { quantity: normalizeOptionalQuantity(input.quantity) } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "manualPriceCents") ? { manualPriceCents: normalizeOptionalCents(input.manualPriceCents) } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "serviceTiming") ? { serviceTiming: normalizeOptionalText(input.serviceTiming) } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "notes") ? { notes: normalizeOptionalText(input.notes) } : {}),
    };
    if (expectedUpdatedAt) {
      const expected = new Date(expectedUpdatedAt);
      if (Number.isNaN(expected.getTime())) throw new FnbCatalogError("expectedUpdatedAt must be a valid timestamp", 400);
      const updated = await tx.sessionFnbCatalogAssignment.updateMany({
        where: { id: assignmentId, updatedAt: expected },
        data: { ...data, updatedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new FnbCatalogError("This F&B assignment changed. Refresh and retry without losing your draft.", 409);
      }
    } else {
      await tx.sessionFnbCatalogAssignment.update({ where: { id: assignmentId }, data });
    }

    if (taxes) {
      await tx.sessionFnbCatalogAssignmentTax.deleteMany({ where: { assignmentId } });
      if (taxes.length > 0) {
        await tx.sessionFnbCatalogAssignmentTax.createMany({
          data: taxes.map((tax) => ({ assignmentId, ...tax })),
        });
      }
    }

    return syncAssignmentBudgetLine(tx, eventId, assignmentId);
  });
}

export async function deleteSessionFnbCatalogAssignment(
  eventId: string,
  sessionId: string,
  assignmentId: string,
): Promise<SessionFnbCatalogAssignmentRecord> {
  return getPrisma().$transaction(async (tx) => {
    await ensureSessionExistsForEvent(eventId, sessionId, tx);
    const existing = await tx.sessionFnbCatalogAssignment.findFirst({
      where: {
        id: assignmentId,
        sessionId,
        catalogItem: { eventId },
      },
      include: {
        catalogItem: { include: { claims: { orderBy: [{ kind: "asc" }, { code: "asc" }] } } },
        budgetLineItem: true,
        taxes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        session: { select: { fnbTaxPercent: true, fnbServiceChargePercent: true } },
      },
    });

    if (!existing) {
      throw new FnbCatalogError("F&B session assignment not found", 404);
    }

    if (existing.budgetLineItemId) {
      await assertBudgetLineEditable(tx, existing.budgetLineItemId);
      await tx.budgetLineItem.update({
        where: { id: existing.budgetLineItemId },
        data: {
          forecastCents: 0,
          vendor: existing.catalogItem.sourceMenuFileName,
        },
      });
    }

    await tx.sessionFnbCatalogAssignment.delete({ where: { id: assignmentId } });
    return toSessionFnbAssignmentRecord(existing);
  });
}
