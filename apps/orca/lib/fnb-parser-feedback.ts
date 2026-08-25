import { getPrisma } from "@/lib/prisma";

export type FnbParserFeedbackAction = "accepted" | "edited" | "rejected";
export type FnbParserExtractionSource = "ai" | "deterministic_fallback" | "merged";

export type FnbParserFeedbackRow = {
  itemName?: unknown;
  description?: unknown;
  price?: unknown;
  unit?: unknown;
  category?: unknown;
  sourceMenuFileName?: unknown;
  sourcePageNumber?: unknown;
  sourceSection?: unknown;
  extractionSource?: unknown;
  confidence?: unknown;
  parserVersion?: unknown;
};

export type CreateFnbParserFeedbackInput = {
  eventId: string;
  documentId?: unknown;
  sourceMenuFileName?: unknown;
  action?: unknown;
  changeFlags?: unknown;
  originalRow?: unknown;
  finalRow?: unknown;
  rejectionReason?: unknown;
  sourcePageNumber?: unknown;
  sourceSection?: unknown;
  extractionSource?: unknown;
  confidence?: unknown;
  parserVersion?: unknown;
};

type PrismaLike = {
  event: {
    findUnique(input: {
      where: { id: string };
      select: { id: true; orgId: true; clientId: true };
    }): Promise<{ id: string; orgId: string; clientId: string | null } | null>;
  };
  document: {
    findFirst(input: {
      where: { id: string; orgId: string; eventId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  fnbParserFeedback: {
    create(input: { data: ReturnType<typeof buildFnbParserFeedbackCreateData> }): Promise<{ id: string }>;
  };
};

export class FnbParserFeedbackError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown): string | null {
  const text = normalizeText(value);
  return text || null;
}

function normalizeAction(value: unknown): FnbParserFeedbackAction {
  const action = normalizeText(value);
  if (action === "accepted" || action === "edited" || action === "rejected") return action;
  throw new FnbParserFeedbackError("action must be accepted, edited, or rejected", 400);
}

function normalizeExtractionSource(value: unknown): FnbParserExtractionSource | null {
  const source = normalizeText(value);
  if (!source) return null;
  if (source === "ai" || source === "deterministic_fallback" || source === "merged") return source;
  return null;
}

function normalizePageNumber(value: unknown): number | null {
  const pageNumber = Number(value);
  return Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null;
}

function normalizeChangeFlags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeText).filter(Boolean))).slice(0, 20);
}

function compactRow(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const row: Record<string, unknown> = {};
  for (const key of [
    "itemName",
    "description",
    "price",
    "unit",
    "category",
    "sourceMenuFileName",
    "sourcePageNumber",
    "sourceSection",
    "extractionSource",
    "confidence",
    "parserVersion",
  ]) {
    if (typeof value[key] !== "undefined") row[key] = value[key];
  }
  return row;
}

function rowText(row: Record<string, unknown> | null, key: string): string {
  return normalizeText(row?.[key]);
}

function derivedFieldChangeFlags(originalRow: Record<string, unknown> | null, finalRow: Record<string, unknown> | null): string[] {
  if (!originalRow || !finalRow) return [];
  const fields = [
    ["itemName", "name_changed"],
    ["description", "description_changed"],
    ["price", "price_changed"],
    ["unit", "unit_changed"],
    ["category", "category_changed"],
  ] as const;
  return fields.flatMap(([field, flag]) => rowText(originalRow, field) === rowText(finalRow, field) ? [] : [flag]);
}

function derivedLifecycleFlags(
  action: FnbParserFeedbackAction,
  extractionSource: FnbParserExtractionSource | null,
  fieldFlags: string[],
): string[] {
  const flags: string[] = [];
  if (action === "accepted" && fieldFlags.length === 0) flags.push("accepted_unchanged");
  if (action === "edited") flags.push("edited");
  if (action === "rejected") flags.push("rejected");
  if (extractionSource === "deterministic_fallback" && action !== "rejected") flags.push("fallback_row_accepted");
  if (extractionSource === "deterministic_fallback" && action === "rejected") flags.push("fallback_row_rejected");
  return flags;
}

export function buildFnbParserFeedbackCreateData(
  input: CreateFnbParserFeedbackInput,
  event: { orgId: string; clientId: string | null },
) {
  const action = normalizeAction(input.action);
  const originalRow = compactRow(input.originalRow);
  if (!originalRow) {
    throw new FnbParserFeedbackError("originalRow is required", 400);
  }

  const finalRow = compactRow(input.finalRow);
  const extractionSource = normalizeExtractionSource(input.extractionSource)
    || normalizeExtractionSource(originalRow.extractionSource)
    || normalizeExtractionSource(finalRow?.extractionSource);
  const fieldFlags = derivedFieldChangeFlags(originalRow, finalRow);
  const changeFlags = Array.from(new Set([
    ...normalizeChangeFlags(input.changeFlags),
    ...fieldFlags,
    ...derivedLifecycleFlags(action, extractionSource, fieldFlags),
  ]));

  return {
    orgId: event.orgId,
    eventId: input.eventId,
    clientId: event.clientId,
    documentId: normalizeOptionalText(input.documentId),
    sourceMenuFileName: normalizeOptionalText(input.sourceMenuFileName)
      || normalizeOptionalText(originalRow.sourceMenuFileName)
      || normalizeOptionalText(finalRow?.sourceMenuFileName),
    action,
    changeFlags,
    originalRow,
    finalRow: action === "rejected" ? null : finalRow,
    rejectionReason: action === "rejected" ? normalizeOptionalText(input.rejectionReason) : null,
    sourcePageNumber: normalizePageNumber(input.sourcePageNumber)
      ?? normalizePageNumber(originalRow.sourcePageNumber)
      ?? normalizePageNumber(finalRow?.sourcePageNumber),
    sourceSection: normalizeOptionalText(input.sourceSection)
      || normalizeOptionalText(originalRow.sourceSection)
      || normalizeOptionalText(finalRow?.sourceSection),
    extractionSource,
    confidence: normalizeOptionalText(input.confidence)
      || normalizeOptionalText(originalRow.confidence)
      || normalizeOptionalText(finalRow?.confidence),
    parserVersion: normalizeOptionalText(input.parserVersion)
      || normalizeOptionalText(originalRow.parserVersion)
      || normalizeOptionalText(finalRow?.parserVersion),
  };
}

export async function createFnbParserFeedback(
  input: CreateFnbParserFeedbackInput,
  options: { prisma?: PrismaLike } = {},
) {
  const prisma = options.prisma ?? (getPrisma() as unknown as PrismaLike);
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      orgId: true,
      clientId: true,
    },
  });
  if (!event) {
    throw new FnbParserFeedbackError("Event not found", 404);
  }

  const data = buildFnbParserFeedbackCreateData(input, {
    orgId: event.orgId,
    clientId: event.clientId,
  });

  if (data.documentId) {
    const document = await prisma.document.findFirst({
      where: {
        id: data.documentId,
        orgId: data.orgId,
        eventId: data.eventId,
      },
      select: { id: true },
    });
    if (!document) {
      throw new FnbParserFeedbackError("documentId is not valid for this event", 400);
    }
  }

  return prisma.fnbParserFeedback.create({ data });
}
