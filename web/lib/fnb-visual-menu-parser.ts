import path from "node:path";
import { pathToFileURL } from "node:url";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { hasRealPriceText } from "./fnb-menu-price-validation";
import { getR2Bucket, getR2Client } from "./r2";

export type VisualFnbParserPageRange = {
  startPage: number;
  endPage: number;
};

export type VisualFnbRenderedPage = {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
};

export type VisualFnbModelRow = {
  pageTitle?: unknown;
  sectionTitle?: unknown;
  itemName?: unknown;
  description?: unknown;
  category?: unknown;
  price?: unknown;
  unit?: unknown;
  pageNumber?: unknown;
  confidence?: unknown;
};

export type VisualFnbCatalogItem = {
  itemName: string;
  description: string;
  category: string;
  price: string;
  unit: string;
  sourceMenuFileName: string;
  sourcePageNumber: number | null;
  confidence: number;
};

export type VisualFnbParseLedgerEntry = {
  pageNumber: number | null;
  itemName: string;
  price: string;
  decision: "saved" | "rejected" | "needs_review";
  reason: string;
};

export type VisualFnbParseResult = {
  items: VisualFnbCatalogItem[];
  ledger: VisualFnbParseLedgerEntry[];
  usageSummary: {
    openAiCallCount: number;
    pagesParsed: number;
    model: string;
  };
};

type VisualOpenAiBatchInput = {
  eventId: string;
  sourceMenuId: string;
  fileName: string;
  model: string;
  pages: VisualFnbRenderedPage[];
};

type VisualOpenAiBatchOutput = {
  items?: VisualFnbModelRow[];
};

export type ParseFnbMenuVisuallyOptions = {
  eventId: string;
  sourceMenuId: string;
  fileName: string;
  objectKey?: string;
  pdfBytes?: Uint8Array;
  pageRange?: VisualFnbParserPageRange;
  batchSize?: number;
  pageOverlap?: number;
  maxOpenAiCalls?: number;
  model?: string;
  openAiApiKey?: string;
  callVisionModel?: (input: VisualOpenAiBatchInput) => Promise<VisualOpenAiBatchOutput>;
};

type PdfParseConstructor = {
  new (options: { data: Uint8Array }): {
    destroy(): Promise<void>;
    getInfo(params?: { parsePageInfo?: boolean }): Promise<{ total: number }>;
    getText(params?: {
      partial?: number[];
      pageJoiner?: string;
      lineEnforce?: boolean;
      cellSeparator?: string;
    }): Promise<{ pages: Array<{ num: number; text: string }>; total?: number }>;
    getScreenshot(params?: {
      partial?: number[];
      desiredWidth?: number;
      imageDataUrl?: boolean;
      imageBuffer?: boolean;
    }): Promise<{
      pages: Array<{
        dataUrl: string;
        pageNumber: number;
        width: number;
        height: number;
      }>;
      total: number;
    }>;
  };
  setWorker(workerSrc?: string): string;
};

type PdfParseModule = {
  PDFParse: PdfParseConstructor;
};

type CanvasRuntime = {
  DOMMatrix?: unknown;
  ImageData?: unknown;
  Path2D?: unknown;
};

const MAX_OPENAI_CALLS = 12;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_PAGE_OVERLAP = 1;
const MIN_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 5;
const RENDERED_PAGE_WIDTH = 1500;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MOJIBAKE_PATTERN = /(?:�|Ã.|Â.|â€|â€™|â€œ|â€\u009d|[\u0080-\u009f])/;

const POLICY_OR_FOOTER_PATTERNS = [
  /\bpricing guaranteed through\b/i,
  /\badditional charge of\b/i,
  /\bpaid at the time of signing\b/i,
  /^\(?\s*based on\b/i,
  /\ball prices are subject\b/i,
  /\bprices subject to change\b/i,
  /\bservice charge\b/i,
  /\badministrative fee\b/i,
  /\bsales tax\b/i,
  /\btax(?:es|able)?\b/i,
  /\bguarantee(?:d|s)?\b/i,
  /\bminimum(?:s)?\b/i,
  /\bdeposit\b/i,
  /\bcancellation\b/i,
  /\bcontract\b/i,
  /\bsignature\b/i,
  /\bterms? and conditions\b/i,
  /\bvalid through\b/i,
  /\beffective date\b/i,
  /\bcopyright\b/i,
  /\ball rights reserved\b/i,
  /\bpage\s+\d+\b/i,
];

const COVER_OR_POLICY_PAGE_PATTERNS = [
  /\btable of contents\b/i,
  /\bwelcome\b/i,
  /\bcover\b/i,
  /\bpolic(?:y|ies)\b/i,
  /\bgeneral information\b/i,
  /\bterms? and conditions\b/i,
  /\bservice charge\b/i,
  /\bsales tax\b/i,
  /\bguarantee(?:d|s)?\b/i,
  /\bminimum(?:s)?\b/i,
  /\bdeposit\b/i,
  /\bcancellation\b/i,
  /\bcontract\b/i,
];

const MENU_SIGNAL_PATTERNS = [
  /\$\s*\d/i,
  /\b\d{1,4}(?:\.\d{1,2}|\.)?\s*(?:per\s+(?:person|guest|dozen|bottle|hour)|each|pp)\b/i,
  /\bpackages?\b/i,
  /\bbreakfast\b/i,
  /\blunch\b/i,
  /\bdinner\b/i,
  /\breception\b/i,
  /\bbuffet\b/i,
  /\bstation\b/i,
  /\bbar\b/i,
  /\bbeverage\b/i,
  /\bplated\b/i,
  /\benhancements?\b/i,
  /(?:^|\b)(?:a\s+la\s+carte|à\s+la\s+carte)\b/i,
];

const ORDERABLE_OFFERING_PATTERNS = [
  /\bpackages?\b/i,
  /\bbuffets?\b/i,
  /\bstations?\b/i,
  /\bbar\s+packages?\b/i,
  /\bbeverage\s+packages?\b/i,
  /\bplated\s+(?:meals?|breakfast|lunch|dinner)\b/i,
  /\b(?:breakfast|brunch|lunch|dinner)\s+(?:packages?|buffets?|menus?|meals?)\b/i,
  /\breception\s+(?:packages?|stations?|displays?|menus?)\b/i,
  /\b(?:coffee|tea|beverage|cocktail|beer|wine)\s+(?:service|station|package|bar)\b/i,
  /\b(?:carving|action|chef[-\s]?attended|attended)\s+stations?\b/i,
  /\bdisplays?\b/i,
  /\benhancements?\b/i,
  /(?:^|\b)(?:a\s+la\s+carte|à\s+la\s+carte)\b/i,
  /\bhors\s+d[’']?oeuvres?\b/i,
];

const ORDERABLE_CONTEXT_PATTERNS = [
  /\bpackages?\b/i,
  /\bbuffets?\b/i,
  /\bstations?\b/i,
  /\bbar\b/i,
  /\bbeverage\b/i,
  /\bplated\b/i,
  /\breception\b/i,
  /\bdisplays?\b/i,
  /\benhancements?\b/i,
  /(?:^|\b)(?:a\s+la\s+carte|à\s+la\s+carte)\b/i,
  /\bhors\s+d[’']?oeuvres?\b/i,
];

const PARENT_OFFERING_CONTEXT_PATTERNS = [
  /\bpackages?\b/i,
  /\bbuffets?\b/i,
  /\bbar\s+packages?\b/i,
  /\bbeverage\s+packages?\b/i,
  /\bhosted\s+bar\b/i,
  /\bplated\s+(?:meals?|breakfast|lunch|dinner)\b/i,
  /\b(?:breakfast|brunch|lunch|dinner)\s+(?:packages?|buffets?|menus?|meals?)\b/i,
  /\breception\s+(?:packages?|menus?)\b/i,
  /\bfeasts?\b/i,
];

const STANDALONE_COMPONENT_CONTEXT_PATTERNS = [
  /(?:^|\b)(?:a\s+la\s+carte|à\s+la\s+carte)\b/i,
  /\benhancements?\b/i,
  /\bindividual\s+items?\b/i,
  /\bby\s+the\s+piece\b/i,
  /\bper\s+piece\b/i,
  /\bcarving\s+stations?\b/i,
  /\bcold\s+items?\b/i,
  /\bhot\s+items?\b/i,
  /\baction\s+stations?\b/i,
  /\bchef[-\s]?attended\s+stations?\b/i,
  /\breception\s+stations?\b/i,
];

const PARENT_VARIANT_QUALIFIER_TOKENS = new Set([
  "breakfast",
  "brunch",
  "lunch",
  "dinner",
  "weekday",
  "daily",
]);

const STATION_VARIANT_QUALIFIER_TOKENS = new Set([
  "station",
  "stations",
]);

const GENERIC_SECTION_HEADING_KEYS = new Set([
  "a la carte",
  "bar",
  "bar packages",
  "beverage",
  "beverage packages",
  "beverages",
  "breakfast",
  "breakfast buffets",
  "breaks",
  "buffets",
  "dinner",
  "dinner buffets",
  "enhancements",
  "hors d oeuvres",
  "lunch",
  "lunch buffets",
  "packages",
  "reception",
  "reception displays",
  "stations",
]);

const NON_ORDERABLE_BLOCK_PATTERNS = [
  /\ball\s+(?:breakfast\s+|lunch\s+|dinner\s+)?buffets?\s+include\b/i,
  /\ball\s+packages?\s+include\b/i,
  /\bserved\s+with\b/i,
  /\bserved\s+(?:on|in|from)\b/i,
  /\bincludes?\s+(?:coffee|tea|iced tea|water|bread|rolls|butter)\b/i,
];

const CATEGORY_VALUES = new Set([
  "A La Carte",
  "Breakfast",
  "Breaks",
  "Lunch",
  "Reception",
  "Dinner",
  "Beverage",
  "Enhancements",
  "Dessert",
  "Service Fees",
  "Needs Review",
]);

const CATEGORY_CONTEXT_PATTERNS: Array<[string, RegExp]> = [
  ["Beverage", /\b(beverages?|hosted\s+bar|bar packages?|bars?|wine|beer|liquor|cocktails?|spirits?)\b/i],
  ["Reception", /\b(receptions?|hors\s+d[’']?oeuvres?|stations?|displays?|carving stations?)\b/i],
  ["A La Carte", /(?:^|\b)(?:a\s+la\s+carte|à\s+la\s+carte)\b/i],
  ["Breaks", /\bbreaks?\b/i],
  ["Lunch", /\blunch\b/i],
  ["Dessert", /\b(desserts?|sweets?)\b/i],
  ["Dinner", /\bdinner\b/i],
  ["Breakfast", /\b(plated\s+breakfast|continental|breakfast|buffets?)\b/i],
];

let pdfRuntimePromise: Promise<void> | null = null;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizePageNumber(value: unknown): number | null {
  const pageNumber = Number(value);
  return Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  const text = normalizeText(value).toLowerCase();
  if (text === "high") return 0.9;
  if (text === "medium") return 0.7;
  if (text === "low") return 0.45;
  return 0.75;
}

function normalizeCategory(value: unknown): string {
  const category = normalizeText(value);
  if (CATEGORY_VALUES.has(category)) return category;
  const match = CATEGORY_CONTEXT_PATTERNS.find(([, pattern]) => pattern.test(category));
  return match ? match[0] : "";
}

function inferCategoryFromContexts(...values: unknown[]): string {
  for (const value of values) {
    const category = normalizeCategory(value);
    if (category) return category;
  }
  return "";
}

function normalizeUnit(value: unknown, price: string): string {
  const unit = normalizeText(value);
  if (unit) return unit;
  const perMatch = price.match(/\bper\s+([a-z][a-z\s-]*)/i);
  if (perMatch) return `per ${normalizeText(perMatch[1]).toLowerCase()}`;
  if (/\bpp\b/i.test(price)) return "per person";
  if (/\beach|ea\.?\b/i.test(price)) return "each";
  return "";
}

function titleKey(value: string): string {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleTokens(value: string): string[] {
  return titleKey(value).split(/\s+/).filter(Boolean);
}

function hasMeaningfulItemName(itemName: string): boolean {
  if (itemName.length < 3 || itemName.length > 140) return false;
  if (CONTROL_CHARACTER_PATTERN.test(itemName) || MOJIBAKE_PATTERN.test(itemName)) return false;
  const letters = itemName.match(/[A-Za-z]/g)?.length ?? 0;
  if (letters < 3) return false;
  if (/^[\d\s.$/|:;-]+$/.test(itemName)) return false;
  return true;
}

function isPolicyOrFooterRow(row: { itemName: string; description: string; price: string; unit: string }): boolean {
  const combined = `${row.itemName} ${row.description} ${row.price} ${row.unit}`;
  return POLICY_OR_FOOTER_PATTERNS.some((pattern) => pattern.test(combined));
}

function isGenericSectionHeading(row: {
  itemName: string;
  description: string;
  price: string;
}): boolean {
  if (row.price || row.description) return false;
  return GENERIC_SECTION_HEADING_KEYS.has(titleKey(row.itemName));
}

function isNonOrderableBlock(row: {
  itemName: string;
  description: string;
  sectionTitle: string;
  pageTitle: string;
}): boolean {
  const combined = `${row.itemName} ${row.description} ${row.sectionTitle} ${row.pageTitle}`;
  return NON_ORDERABLE_BLOCK_PATTERNS.some((pattern) => pattern.test(combined));
}

function isOrderableOfferingWithoutPrice(row: {
  itemName: string;
  description: string;
  category: string;
  sectionTitle: string;
  pageTitle: string;
}): boolean {
  const itemContext = `${row.itemName} ${row.description}`;
  if (ORDERABLE_OFFERING_PATTERNS.some((pattern) => pattern.test(itemContext))) return true;

  const pageContext = `${row.category} ${row.sectionTitle} ${row.pageTitle}`;
  const hasOrderableContext = ORDERABLE_CONTEXT_PATTERNS.some((pattern) => pattern.test(pageContext));
  if (!hasOrderableContext) return false;

  const wordCount = titleKey(row.itemName).split(/\s+/).filter(Boolean).length;
  return wordCount >= 2;
}

type CleanupCandidate = {
  item: VisualFnbCatalogItem;
  ledgerBase: Pick<VisualFnbParseLedgerEntry, "pageNumber" | "itemName" | "price">;
  pageTitle: string;
  sectionTitle: string;
  sourceIndex: number;
};

type CleanupLedgerSlot =
  | { kind: "entry"; entry: VisualFnbParseLedgerEntry }
  | { kind: "candidate"; candidateIndex: number };

function contextText(candidate: CleanupCandidate): string {
  return `${candidate.item.itemName} ${candidate.item.description} ${candidate.item.category} ${candidate.sectionTitle} ${candidate.pageTitle}`;
}

function isParentOfferingCandidate(candidate: CleanupCandidate): boolean {
  if (!candidate.item.description) return false;
  return PARENT_OFFERING_CONTEXT_PATTERNS.some((pattern) => pattern.test(contextText(candidate)));
}

function isStandaloneComponentCandidate(candidate: CleanupCandidate): boolean {
  const context = contextText(candidate);
  return STANDALONE_COMPONENT_CONTEXT_PATTERNS.some((pattern) => pattern.test(context));
}

function normalizedDescriptionContainsItem(description: string, itemName: string): boolean {
  const descriptionKey = titleKey(description);
  const itemKey = titleKey(itemName);
  if (!descriptionKey || !itemKey) return false;
  if (titleTokens(itemName).length < 2) return false;
  return descriptionKey.includes(itemKey);
}

function candidatesShareHierarchyContext(parent: CleanupCandidate, child: CleanupCandidate): boolean {
  const parentPage = parent.item.sourcePageNumber;
  const childPage = child.item.sourcePageNumber;
  const pageDistance =
    parentPage != null && childPage != null ? Math.abs(parentPage - childPage) : null;
  const samePage = pageDistance === 0;
  const sameSection =
    Boolean(parent.sectionTitle && child.sectionTitle && titleKey(parent.sectionTitle) === titleKey(child.sectionTitle));
  const samePageTitle =
    Boolean(parent.pageTitle && child.pageTitle && titleKey(parent.pageTitle) === titleKey(child.pageTitle));
  const sameCategory = parent.item.category === child.item.category;

  if (samePage && (sameSection || samePageTitle || sameCategory)) return true;
  return (sameSection || samePageTitle) && pageDistance != null && pageDistance <= 1;
}

function isChildComponentOfParent(
  child: CleanupCandidate,
  parent: CleanupCandidate,
): boolean {
  if (child.sourceIndex === parent.sourceIndex) return false;
  if (child.item.price) return false;
  if (isStandaloneComponentCandidate(child)) return false;
  if (!isParentOfferingCandidate(parent)) return false;
  if (!candidatesShareHierarchyContext(parent, child)) return false;
  if (!normalizedDescriptionContainsItem(parent.item.description, child.item.itemName)) return false;
  return true;
}

function parentVariantKey(candidate: CleanupCandidate): string {
  return titleTokens(candidate.item.itemName)
    .filter((token) => !PARENT_VARIANT_QUALIFIER_TOKENS.has(token))
    .join(" ");
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(titleTokens(left));
  const rightTokens = new Set(titleTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function parentVariantStrength(candidate: CleanupCandidate): number {
  const nameSpecificity = titleTokens(candidate.item.itemName).length;
  const contextSpecificity = (candidate.sectionTitle ? 2 : 0) + (candidate.pageTitle ? 1 : 0);
  const confidence = Math.round(candidate.item.confidence * 10);
  return nameSpecificity + contextSpecificity + confidence + Math.min(8, Math.floor(candidate.item.description.length / 80));
}

function shouldCollapseParentVariant(left: CleanupCandidate, right: CleanupCandidate): boolean {
  if (!(isParentOfferingCandidate(left) && isParentOfferingCandidate(right))) return false;
  if (parentVariantKey(left) !== parentVariantKey(right)) return false;
  if (left.item.category !== right.item.category) return false;
  const leftPage = left.item.sourcePageNumber;
  const rightPage = right.item.sourcePageNumber;
  if (leftPage != null && rightPage != null && Math.abs(leftPage - rightPage) > 1) return false;
  return tokenSimilarity(left.item.description, right.item.description) >= 0.75;
}

function stationVariantKey(candidate: CleanupCandidate): string {
  return titleTokens(candidate.item.itemName)
    .filter((token) => !STATION_VARIANT_QUALIFIER_TOKENS.has(token))
    .join(" ");
}

function hasStationLabel(candidate: CleanupCandidate): boolean {
  return /\bstations?\b/i.test(candidate.item.itemName);
}

function candidatesHaveNearDuplicateContext(left: CleanupCandidate, right: CleanupCandidate): boolean {
  if (left.item.category !== right.item.category) return false;
  const leftPage = left.item.sourcePageNumber;
  const rightPage = right.item.sourcePageNumber;
  if (leftPage != null && rightPage != null && Math.abs(leftPage - rightPage) > 1) return false;

  const sameSection =
    Boolean(left.sectionTitle && right.sectionTitle && titleKey(left.sectionTitle) === titleKey(right.sectionTitle));
  const samePageTitle =
    Boolean(left.pageTitle && right.pageTitle && titleKey(left.pageTitle) === titleKey(right.pageTitle));
  const sameDescription =
    Boolean(left.item.description || right.item.description) &&
    tokenSimilarity(left.item.description, right.item.description) >= 0.75;

  return sameSection || samePageTitle || sameDescription;
}

function shouldCollapseStationVariant(left: CleanupCandidate, right: CleanupCandidate): boolean {
  const leftKey = stationVariantKey(left);
  if (!leftKey || leftKey !== stationVariantKey(right)) return false;
  if (!hasStationLabel(left) && !hasStationLabel(right)) return false;
  return candidatesHaveNearDuplicateContext(left, right);
}

function stationVariantStrength(candidate: CleanupCandidate): number {
  return parentVariantStrength(candidate) + (hasStationLabel(candidate) ? 20 : 0);
}

function isLikelyUsefulMenuPage(text: string, pageNumber: number, hasPageRangeOverride: boolean): boolean {
  if (hasPageRangeOverride) return true;
  const normalized = normalizeText(text);
  if (!normalized) return pageNumber > 1;
  const hasMenuSignal = MENU_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized));
  const hasPolicySignal = COVER_OR_POLICY_PAGE_PATTERNS.some((pattern) => pattern.test(normalized));
  if (pageNumber === 1 && hasPolicySignal && !/\$\s*\d/.test(normalized)) return false;
  if (hasPolicySignal && !hasMenuSignal) return false;
  return hasMenuSignal;
}

export function createVisualFnbPageBatches<T>(values: T[], options: {
  batchSize?: number;
  pageOverlap?: number;
  maxBatches?: number;
}): T[][] {
  const batchSize = normalizeBatchSize(options.batchSize);
  const pageOverlap = normalizePageOverlap(options.pageOverlap, batchSize);
  const maxBatches = Math.max(0, Math.floor(options.maxBatches ?? Number.MAX_SAFE_INTEGER));
  const stride = Math.max(1, batchSize - pageOverlap);
  const chunks: T[][] = [];
  for (let index = 0; index < values.length && chunks.length < maxBatches; index += stride) {
    chunks.push(values.slice(index, index + batchSize));
    if (index + batchSize >= values.length) break;
  }
  return chunks;
}

export function getVisualFnbRenderedPageLimit(options: {
  batchSize?: number;
  pageOverlap?: number;
  maxOpenAiCalls?: number;
} = {}): number {
  const batchSize = normalizeBatchSize(options.batchSize);
  const pageOverlap = normalizePageOverlap(options.pageOverlap, batchSize);
  const maxOpenAiCalls = normalizeMaxOpenAiCalls(options.maxOpenAiCalls);
  if (maxOpenAiCalls === 0) return 0;
  return batchSize + ((maxOpenAiCalls - 1) * Math.max(1, batchSize - pageOverlap));
}

function normalizeBatchSize(value: unknown): number {
  const size = Math.floor(Number(value ?? DEFAULT_BATCH_SIZE));
  return Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, Number.isFinite(size) ? size : DEFAULT_BATCH_SIZE));
}

function normalizePageOverlap(value: unknown, batchSize: number): number {
  const overlap = Math.floor(Number(value ?? DEFAULT_PAGE_OVERLAP));
  return Math.max(0, Math.min(batchSize - 1, Number.isFinite(overlap) ? overlap : DEFAULT_PAGE_OVERLAP));
}

function normalizeMaxOpenAiCalls(value: unknown): number {
  const callCount = Math.floor(Number(value ?? MAX_OPENAI_CALLS));
  return Math.max(1, Math.min(MAX_OPENAI_CALLS, Number.isFinite(callCount) ? callCount : MAX_OPENAI_CALLS));
}

function toUint8Array(value: Uint8Array | Buffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

async function bodyToUint8Array(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : toUint8Array(chunk));
    }
    const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }
  throw new Error("Uploaded menu PDF was not found.");
}

async function readPdfBytesFromObjectKey(objectKey: string): Promise<Uint8Array> {
  const response = await getR2Client().send(new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: objectKey,
  }));
  if (!response.Body) {
    throw new Error("Uploaded menu PDF was not found.");
  }
  return bodyToUint8Array(response.Body);
}

async function ensurePdfCanvasRuntime(): Promise<void> {
  pdfRuntimePromise ??= (async () => {
    const canvas = (await import("@napi-rs/canvas")) as CanvasRuntime;
    const globals = globalThis as Record<string, unknown>;

    globals.DOMMatrix ??= canvas.DOMMatrix;
    globals.ImageData ??= canvas.ImageData;
    globals.Path2D ??= canvas.Path2D;

    if (!globals.DOMMatrix || !globals.ImageData || !globals.Path2D) {
      throw new Error("PDF canvas runtime is not available");
    }
  })();

  await pdfRuntimePromise;
}

async function loadPdfParser(bytes: Uint8Array): Promise<InstanceType<PdfParseConstructor>> {
  await ensurePdfCanvasRuntime();
  const { PDFParse } = (await import("pdf-parse")) as unknown as PdfParseModule;
  PDFParse.setWorker(pathToFileURL(path.join(process.cwd(), "node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs")).href);
  return new PDFParse({ data: bytes });
}

function pageNumbersFromRange(pageRange: VisualFnbParserPageRange | undefined, totalPages: number): number[] {
  if (!pageRange) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const startPage = Math.max(1, Math.floor(pageRange.startPage));
  const endPage = Math.min(totalPages, Math.floor(pageRange.endPage));
  if (endPage < startPage) return [];
  return Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
}

export async function renderVisualFnbMenuPages(options: {
  pdfBytes: Uint8Array;
  pageRange?: VisualFnbParserPageRange;
  maxPages?: number;
}): Promise<VisualFnbRenderedPage[]> {
  const parser = await loadPdfParser(options.pdfBytes);
  try {
    const info = await parser.getInfo({ parsePageInfo: false });
    const totalPages = Math.max(0, Number(info.total) || 0);
    const candidatePageNumbers = pageNumbersFromRange(options.pageRange, totalPages);
    const textResult = await parser.getText({
      partial: candidatePageNumbers,
      pageJoiner: "",
      lineEnforce: true,
      cellSeparator: " ",
    });
    const pageTextByNumber = new Map(textResult.pages.map((page) => [page.num, page.text]));
    const usefulPageNumbers = candidatePageNumbers
      .filter((pageNumber) => isLikelyUsefulMenuPage(pageTextByNumber.get(pageNumber) ?? "", pageNumber, Boolean(options.pageRange)))
      .slice(0, options.maxPages ?? getVisualFnbRenderedPageLimit());

    if (usefulPageNumbers.length === 0) return [];

    const screenshots = await parser.getScreenshot({
      partial: usefulPageNumbers,
      desiredWidth: RENDERED_PAGE_WIDTH,
      imageDataUrl: true,
      imageBuffer: false,
    });

    return screenshots.pages.map((page) => ({
      pageNumber: page.pageNumber,
      dataUrl: page.dataUrl,
      width: page.width,
      height: page.height,
    }));
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export function cleanupVisualFnbMenuRows(rows: VisualFnbModelRow[], context: {
  fileName: string;
}): {
  items: VisualFnbCatalogItem[];
  ledger: VisualFnbParseLedgerEntry[];
} {
  const ledgerSlots: CleanupLedgerSlot[] = [];
  const candidates: CleanupCandidate[] = [];
  let priorBatchContextCategory = "";

  for (const [sourceIndex, row] of rows.entries()) {
    const pageTitle = normalizeText(row.pageTitle);
    const sectionTitle = normalizeText(row.sectionTitle);
    const explicitCategory = normalizeCategory(row.category);
    const sectionCategory = inferCategoryFromContexts(sectionTitle);
    const pageCategory = inferCategoryFromContexts(pageTitle);
    const inferredContextCategory = explicitCategory || sectionCategory || pageCategory;
    const category = inferredContextCategory || priorBatchContextCategory || "Needs Review";
    if (inferredContextCategory) {
      priorBatchContextCategory = inferredContextCategory;
    }
    const itemName = normalizeText(row.itemName);
    const description = normalizeText(row.description);
    const price = normalizeText(row.price);
    const unit = normalizeUnit(row.unit, price);
    const pageNumber = normalizePageNumber(row.pageNumber);
    const confidence = normalizeConfidence(row.confidence);
    const ledgerBase = { pageNumber, itemName, price };

    if (!itemName) {
      ledgerSlots.push({ kind: "entry", entry: { ...ledgerBase, decision: "rejected", reason: "Missing item name" } });
      continue;
    }
    if (!hasMeaningfulItemName(itemName)) {
      ledgerSlots.push({ kind: "entry", entry: { ...ledgerBase, decision: "rejected", reason: "Item name is not a menu catalog row" } });
      continue;
    }
    if (isPolicyOrFooterRow({ itemName, description, price, unit })) {
      ledgerSlots.push({ kind: "entry", entry: { ...ledgerBase, decision: "rejected", reason: "Policy, footer, tax, guarantee, or explanatory copy" } });
      continue;
    }
    if (isGenericSectionHeading({ itemName, description, price })) {
      ledgerSlots.push({ kind: "entry", entry: { ...ledgerBase, decision: "rejected", reason: "Generic section heading, not an orderable offering" } });
      continue;
    }
    if (isNonOrderableBlock({ itemName, description, sectionTitle, pageTitle })) {
      ledgerSlots.push({ kind: "entry", entry: { ...ledgerBase, decision: "rejected", reason: "Non-orderable included-items or served-with copy" } });
      continue;
    }
    if (price && !hasRealPriceText(price, itemName, unit)) {
      ledgerSlots.push({ kind: "entry", entry: { ...ledgerBase, decision: "rejected", reason: "Missing real visible price" } });
      continue;
    }
    if (!price && !isOrderableOfferingWithoutPrice({ itemName, description, category, sectionTitle, pageTitle })) {
      ledgerSlots.push({ kind: "entry", entry: { ...ledgerBase, decision: "rejected", reason: "Missing price and not a clear orderable offering" } });
      continue;
    }

    const item: VisualFnbCatalogItem = {
      itemName,
      description,
      category,
      price,
      unit,
      sourceMenuFileName: context.fileName,
      sourcePageNumber: pageNumber,
      confidence,
    };

    if (confidence < 0.55) {
      ledgerSlots.push({ kind: "entry", entry: { ...ledgerBase, decision: "needs_review", reason: "Low model confidence" } });
      continue;
    }

    const candidateIndex = candidates.length;
    candidates.push({
      item,
      ledgerBase,
      pageTitle,
      sectionTitle,
      sourceIndex,
    });
    ledgerSlots.push({ kind: "candidate", candidateIndex });
  }

  const candidateDecisions = new Map<number, VisualFnbParseLedgerEntry>();
  const suppressedCandidateIndexes = new Set<number>();

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    if (suppressedCandidateIndexes.has(leftIndex)) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      if (suppressedCandidateIndexes.has(rightIndex)) continue;
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const isParentVariant = shouldCollapseParentVariant(left, right);
      const isStationVariant = !isParentVariant && shouldCollapseStationVariant(left, right);
      if (!(isParentVariant || isStationVariant)) continue;
      const leftStrength = isStationVariant ? stationVariantStrength(left) : parentVariantStrength(left);
      const rightStrength = isStationVariant ? stationVariantStrength(right) : parentVariantStrength(right);
      const weakerIndex = rightStrength > leftStrength ? leftIndex : rightIndex;
      suppressedCandidateIndexes.add(weakerIndex);
      candidateDecisions.set(weakerIndex, {
        ...candidates[weakerIndex].ledgerBase,
        decision: "rejected",
        reason: isStationVariant ? "Duplicate station offering variant" : "Duplicate parent offering variant",
      });
      if (weakerIndex === leftIndex) break;
    }
  }

  for (let childIndex = 0; childIndex < candidates.length; childIndex += 1) {
    if (suppressedCandidateIndexes.has(childIndex)) continue;
    const child = candidates[childIndex];
    const parent = candidates.find((candidate, parentIndex) => (
      !suppressedCandidateIndexes.has(parentIndex) &&
      isChildComponentOfParent(child, candidate)
    ));
    if (!parent) continue;
    suppressedCandidateIndexes.add(childIndex);
    candidateDecisions.set(childIndex, {
      ...child.ledgerBase,
      decision: "rejected",
      reason: `Component already captured in parent offering: ${parent.item.itemName}`,
    });
  }

  const seen = new Set<string>();
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    if (candidateDecisions.has(candidateIndex)) continue;
    const candidate = candidates[candidateIndex];
    const { item, pageTitle, sectionTitle } = candidate;
    const key = [
      titleKey(item.itemName),
      item.category.toLowerCase(),
      titleKey(item.description),
      titleKey(pageTitle),
      titleKey(sectionTitle),
      item.price.toLowerCase(),
      item.unit.toLowerCase(),
      item.sourcePageNumber ?? "",
    ].join("|");
    if (seen.has(key)) {
      candidateDecisions.set(candidateIndex, {
        ...candidate.ledgerBase,
        decision: "rejected",
        reason: "Duplicate visual row",
      });
      continue;
    }
    seen.add(key);
    candidateDecisions.set(candidateIndex, {
      ...candidate.ledgerBase,
      decision: "saved",
      reason: item.price ? "Visually priced menu row" : "Orderable catering offering without visible price",
    });
  }

  const ledger: VisualFnbParseLedgerEntry[] = [];
  const items: VisualFnbCatalogItem[] = [];
  for (const slot of ledgerSlots) {
    if (slot.kind === "entry") {
      ledger.push(slot.entry);
      continue;
    }
    const decision = candidateDecisions.get(slot.candidateIndex);
    if (!decision) continue;
    if (decision.decision === "saved") {
      items.push(candidates[slot.candidateIndex].item);
    }
    ledger.push(decision);
  }

  return { items, ledger };
}

function visualMenuJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            pageTitle: { type: "string" },
            sectionTitle: { type: "string" },
            itemName: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            price: { type: "string" },
            unit: { type: "string" },
            pageNumber: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["pageTitle", "sectionTitle", "category", "itemName", "description", "price", "unit", "pageNumber", "confidence"],
        },
      },
    },
    required: ["items"],
  };
}

function visualMenuSystemPrompt(): string {
  return [
    "You extract event food-and-beverage catalog rows from rendered menu page images.",
    "Use only visible information in the supplied images.",
    "Extract planner-facing orderable catering offerings that a planner could select, amend, price, or add to a session.",
    "Valid offering types include packages, buffets, plated meals, stations, bar packages, beverage packages, a la carte items, and enhancements.",
    "Return pageTitle, sectionTitle, category, itemName, description, price, unit, pageNumber, and confidence for every row.",
    "If a visible price is missing for an otherwise orderable offering, return an empty string for price and unit unless a unit is visible.",
    "Set pageTitle to the visible page title or major page heading, and sectionTitle to the nearest visible section heading above or around the item.",
    "Use category when the visible page title, section title, nearest heading, or item itself clearly indicates one of these generic groups: Breakfast, Breaks, A La Carte, Lunch, Reception, Dessert, Dinner, Beverage.",
    "Reject generic section headings only, footers, service-charge text, policy text, sales tax text, guarantees, dates, minimums, deposits, signatures, served-with blocks, all-buffets-include blocks, ingredients/components that are not themselves selectable offerings, and random descriptive prose.",
    "Do not invent prices, infer prices, or infer rows from surrounding prose.",
    "Preserve prices exactly as shown, including trailing-dot whole-dollar prices such as 40. and tiered prices such as 30 minutes 22. | 1 hour 32.",
    "Return strict JSON only.",
  ].join(" ");
}

async function callOpenAiVisionBatch(input: VisualOpenAiBatchInput & { apiKey: string }): Promise<VisualOpenAiBatchOutput> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "fnb_visual_menu_items",
          schema: visualMenuJsonSchema(),
          strict: true,
        },
      },
      messages: [
        { role: "system", content: visualMenuSystemPrompt() },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                eventId: input.eventId,
                sourceMenuId: input.sourceMenuId,
                fileName: input.fileName,
                pages: input.pages.map((page) => ({
                  pageNumber: page.pageNumber,
                  width: page.width,
                  height: page.height,
                })),
              }),
            },
            ...input.pages.map((page) => ({
              type: "image_url",
              image_url: {
                url: page.dataUrl,
                detail: "high",
              },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Visual menu OpenAI call failed: ${response.status} ${errorText.slice(0, 300)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Visual menu OpenAI call returned no JSON content");
  }
  return JSON.parse(content) as VisualOpenAiBatchOutput;
}

export async function parseFnbMenuVisually(options: ParseFnbMenuVisuallyOptions): Promise<VisualFnbParseResult> {
  const model = normalizeText(options.model)
    || process.env.FNB_VISUAL_MENU_PARSER_MODEL?.trim()
    || process.env.FNB_MENU_PARSER_MODEL?.trim()
    || "";
  if (!model) {
    throw new Error("FNB_VISUAL_MENU_PARSER_MODEL or FNB_MENU_PARSER_MODEL is required");
  }

  const pdfBytes = options.pdfBytes ?? (options.objectKey ? await readPdfBytesFromObjectKey(options.objectKey) : null);
  if (!pdfBytes) {
    throw new Error("pdfBytes or objectKey is required");
  }

  const batchSize = normalizeBatchSize(options.batchSize);
  const pageOverlap = normalizePageOverlap(options.pageOverlap, batchSize);
  const maxOpenAiCalls = normalizeMaxOpenAiCalls(options.maxOpenAiCalls);
  const maxPages = getVisualFnbRenderedPageLimit({ batchSize, pageOverlap, maxOpenAiCalls });
  const renderedPages = await renderVisualFnbMenuPages({
    pdfBytes,
    pageRange: options.pageRange,
    maxPages,
  });
  const batches = createVisualFnbPageBatches(renderedPages, { batchSize, pageOverlap, maxBatches: maxOpenAiCalls });
  const callVisionModel = options.callVisionModel
    ?? ((input: VisualOpenAiBatchInput) => {
      const apiKey = normalizeText(options.openAiApiKey) || process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for visual menu parsing");
      }
      return callOpenAiVisionBatch({ ...input, apiKey });
    });

  const modelRows: VisualFnbModelRow[] = [];
  for (const pages of batches) {
    const output = await callVisionModel({
      eventId: options.eventId,
      sourceMenuId: options.sourceMenuId,
      fileName: options.fileName,
      model,
      pages,
    });
    if (Array.isArray(output.items)) {
      modelRows.push(...output.items);
    }
  }

  const { items, ledger } = cleanupVisualFnbMenuRows(modelRows, { fileName: options.fileName });
  return {
    items,
    ledger,
    usageSummary: {
      openAiCallCount: batches.length,
      pagesParsed: renderedPages.length,
      model,
    },
  };
}
