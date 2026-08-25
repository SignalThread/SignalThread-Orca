/**
 * Client- and server-safe helpers for ranged F&B package pricing encoded in catalog text,
 * with per-assignment tier choice stored in assignment `notes` (machine line prefix).
 */

export type FnbPackagePriceOption = {
  label: string;
  unitCents: number;
};

const TIER_LINE_PREFIX = "__FNB_PKG_TIER__|";

/** Match only dollar amounts so years / headcounts without $ are ignored. */
const DOLLAR_AMOUNT = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g;

export function parseSingleCatalogPriceCents(price: string | null): number | null {
  if (!price) return null;
  const matches = Array.from(price.matchAll(/\$?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/g));
  if (matches.length !== 1) return null;
  const amount = Number(matches[0][1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function parseSemicolonTierSegment(segment: string): FnbPackagePriceOption | null {
  const trimmed = segment.trim();
  if (!trimmed.includes("$")) return null;
  const matches = Array.from(trimmed.matchAll(DOLLAR_AMOUNT));
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]!;
  const dollars = Number(last[1].replace(/,/g, ""));
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const cents = Math.round(dollars * 100);
  const beforeDollar = trimmed.slice(0, last.index! + last[0].length).trimEnd();
  let label = beforeDollar.replace(/\$[^$]*$/, "").trim();
  label = label.replace(/[-–—]\s*$/, "").trim();
  if (!label) label = `Package $${last[1]}`;
  return { label, unitCents: cents };
}

function dedupeOptions(options: FnbPackagePriceOption[]): FnbPackagePriceOption[] {
  const seen = new Set<string>();
  const out: FnbPackagePriceOption[] = [];
  for (const opt of options) {
    const key = `${opt.unitCents}::${opt.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(opt);
  }
  return out;
}

/**
 * Heuristic: split combined catalog strings on ";", take the last $… in each segment as a tier price,
 * text before that (trimmed of trailing dash) as the label. Requires at least two distinct tiers.
 */
export function extractFnbPackagePriceOptions(item: {
  price: string | null;
  description: string | null;
  itemName?: string | null;
}): FnbPackagePriceOption[] {
  const blob = [item.price, item.description, item.itemName].filter(Boolean).join(" • ");
  if (!blob.includes(";") || !blob.includes("$")) return [];

  const fromSemicolon = [...blob.split(";")]
    .map(parseSemicolonTierSegment)
    .filter((entry): entry is FnbPackagePriceOption => entry !== null);

  const deduped = dedupeOptions(fromSemicolon);
  if (deduped.length >= 2) return deduped;

  return [];
}

export function parseTierFromNotes(notes: string | null): { unitCents: number; label: string } | null {
  if (!notes) return null;
  const line = notes.split(/\n/).find((entry) => entry.startsWith(TIER_LINE_PREFIX));
  if (!line) return null;
  const payload = line.slice(TIER_LINE_PREFIX.length);
  const parts = payload.split("|");
  if (parts[0] !== "v1" || parts.length < 2) return null;
  const cents = Number(parts[1]);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  const label = parts[2] ? decodeURIComponent(parts[2]) : "";
  return { unitCents: cents, label };
}

export function stripTierLineFromNotes(notes: string | null): string {
  if (!notes) return "";
  return notes
    .split("\n")
    .filter((line) => !line.startsWith(TIER_LINE_PREFIX))
    .join("\n")
    .trim();
}

export function mergeTierIntoNotes(userNotesTrimmed: string, unitCents: number, label: string): string {
  const tierLine = `${TIER_LINE_PREFIX}v1|${unitCents}|${encodeURIComponent(label)}`;
  const base = userNotesTrimmed.trim();
  return base ? `${tierLine}\n${base}` : tierLine;
}

export function assignmentForecastTotalCentsNullable(input: {
  catalogPrice: string | null;
  quantity: number | null;
  manualPriceCents: number | null;
  notes: string | null;
}): number | null {
  if (input.manualPriceCents !== null) return input.manualPriceCents;
  const single = parseSingleCatalogPriceCents(input.catalogPrice);
  if (single !== null && input.quantity) {
    const total = single * input.quantity;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error("F&B forecast exceeds supported exact-money range");
    return total;
  }
  const tier = parseTierFromNotes(input.notes);
  if (tier !== null && input.quantity) {
    const total = tier.unitCents * input.quantity;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error("F&B forecast exceeds supported exact-money range");
    return total;
  }
  return null;
}

export function assignmentForecastTotalCentsForBudget(input: {
  catalogPrice: string | null;
  quantity: number | null;
  manualPriceCents: number | null;
  notes: string | null;
}): number {
  return assignmentForecastTotalCentsNullable(input) ?? 0;
}
