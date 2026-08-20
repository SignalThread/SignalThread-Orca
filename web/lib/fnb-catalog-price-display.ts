type CatalogPriceInput = {
  price: string | null;
  unit: string | null;
};

const MONEY_AMOUNT_PATTERN = String.raw`\$?\s*(\d[\d,]*(?:\.\d{1,2}|\.)?)`;
const DURATION_PRICE_PATTERN = new RegExp(
  String.raw`\b(\d+)\s*(minutes?|mins?|hours?|hrs?)\s+${MONEY_AMOUNT_PATTERN}`,
  "gi",
);

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function amountLabel(value: string): string {
  const normalized = value.trim().replace(/[$,]/g, "");
  const match = normalized.match(/^(\d+)(?:\.(\d{1,2})?)?$/);
  if (!match) return value.trim();
  const whole = match[1];
  const cents = match[2] ?? "";
  if (!cents) return `$${whole}`;
  return `$${whole}.${cents.padEnd(2, "0")}`.replace(/\.00$/, "");
}

function durationLabel(quantity: string, unit: string): string {
  const normalizedUnit = unit.toLowerCase();
  if (/^h|hour/.test(normalizedUnit)) return `${quantity} hr`;
  return `${quantity} min`;
}

function normalizeUnit(value: string): string {
  return value
    .trim()
    .replace(/^[/:|,\s-]+/, "")
    .replace(/[.;,\s]+$/, "")
    .replace(/[/:|,\s-]+$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function canonicalUnit(value: string): string {
  const unit = normalizeUnit(value)
    .replace(/\bpriced?\b/g, "price")
    .replace(/\bpricing\b/g, "price")
    .replace(/\s+/g, " ")
    .trim();
  if (!unit) return "";

  const withoutPrice = unit
    .replace(/\bprice\s+per\b/g, "per")
    .replace(/\bper\s+price\b/g, "per")
    .replace(/\bprice\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = withoutPrice || unit;
  const object = normalized.match(/^per\s+(.+)$/)?.[1] ?? normalized;
  const compact = object.replace(/^(a|an|the)\s+/, "").trim();

  if (/^(item|piece|unit|each|ea\.?)$/.test(compact)) return "each";
  if (/^(person|guest|attendee|pp|pax)$/.test(compact)) return "person";
  if (/^(dozen|dz)$/.test(compact)) return "dozen";
  if (compact === "gallon") return "gallon";
  if (compact === "bottle") return "bottle";
  if (compact === "glass") return "glass";
  if (compact === "drink") return "drink";
  return normalized;
}

function formatUnitSuffix(value: string): string {
  const unit = canonicalUnit(value);
  if (!unit) return "";
  if (unit === "each") return "each";
  const perMatch = unit.match(/^per\s+(.+)$/);
  if (perMatch) return `/ ${perMatch[1]}`;
  if (/^\/\s*/.test(unit)) return unit.replace(/^\/\s*/, "/ ");
  if (/^(person|dozen|gallon|bottle|glass|drink)$/.test(unit)) return `/ ${unit}`;
  return unit;
}

function formatDurationUnitSuffix(value: string): string {
  const unit = canonicalUnit(value);
  if (!unit) return "";
  if (unit === "each") return "each";
  const perMatch = unit.match(/^per\s+(.+)$/);
  if (perMatch) return `per ${perMatch[1]}`;
  if (/^(person|dozen|gallon|bottle|glass|drink)$/.test(unit)) return `per ${unit}`;
  return unit;
}

function formatTrailingUnitPrice(price: string, unit: string): string | null {
  const match = price.match(new RegExp(String.raw`^\s*${MONEY_AMOUNT_PATTERN}\s*(.*?)\s*$`, "i"));
  if (!match) return null;
  const amount = amountLabel(match[1]);
  const unitText = normalizeUnit(match[2]) || normalizeUnit(unit);
  const suffix = formatUnitSuffix(unitText);
  return suffix ? `${amount} ${suffix}` : amount;
}

export function formatCatalogItemPriceDisplay(input: CatalogPriceInput): string {
  const price = normalizeText(input.price);
  const unit = normalizeText(input.unit);
  if (!price) return "";

  const durationMatches = [...price.matchAll(DURATION_PRICE_PATTERN)];
  if (durationMatches.length > 0) {
    const tiers = durationMatches.map((match) => {
      const duration = durationLabel(match[1], match[2]);
      const amount = amountLabel(match[3]);
      return `${duration}: ${amount}`;
    });
    const unitSuffix = formatDurationUnitSuffix(unit);
    return [tiers.join(" / "), unitSuffix].filter(Boolean).join(" ");
  }

  return formatTrailingUnitPrice(price, unit) ?? price;
}

export function catalogItemPriceDisplayIncludesUnit(input: CatalogPriceInput): boolean {
  const display = formatCatalogItemPriceDisplay(input);
  const price = normalizeText(input.price);
  if (!display || !price) return false;
  return display !== amountLabel(price);
}

export function formatCatalogItemUnitDisplay(input: CatalogPriceInput): string {
  if (catalogItemPriceDisplayIncludesUnit(input)) return "";
  const unit = canonicalUnit(normalizeText(input.unit));
  if (!unit) return "";
  const perMatch = unit.match(/^per\s+(.+)$/);
  return perMatch?.[1] ?? unit;
}
