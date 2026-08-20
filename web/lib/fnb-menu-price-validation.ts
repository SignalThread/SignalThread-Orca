const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MOJIBAKE_PATTERN = /(?:�|Ã.|Â.|â€|â€™|â€œ|â€\u009d|[\u0080-\u009f])/;
const PRICE_AMOUNT_PATTERN = String.raw`\d[\d,]*(?:\.\d{1,2}|\.)?`;

function amountFromMatch(value: string | undefined): number {
  return Number((value ?? "").replace(/,/g, ""));
}

export function hasRealPriceText(price: string, itemName: string, unit = ""): boolean {
  if (!price || CONTROL_CHARACTER_PATTERN.test(price) || MOJIBAKE_PATTERN.test(price)) return false;
  const combined = `${itemName} ${price} ${unit}`;
  const matches = [
    ...price.matchAll(new RegExp(String.raw`\$\s*(${PRICE_AMOUNT_PATTERN})`, "g")),
    ...price.matchAll(new RegExp(String.raw`\b(${PRICE_AMOUNT_PATTERN})\s*(?:\/|[·•])\s*${PRICE_AMOUNT_PATTERN}(?:(?:\s*(?:\/|[·•])\s*)${PRICE_AMOUNT_PATTERN})*`, "g")),
    ...combined.matchAll(new RegExp(String.raw`\b(${PRICE_AMOUNT_PATTERN})\s*(?:per\s+(?:person|guest|dozen|bowl|piece|pieces|tray|platter|gallon|quart|bottle|bar|attendant|hour)|pp|each|ea\.?|fee|\/\s*(?:person|guest))\b`, "gi")),
    ...price.matchAll(new RegExp(String.raw`\b(?:\d+\s*(?:minutes?|mins?|hours?|hrs?))\s+(${PRICE_AMOUNT_PATTERN})(?=\s|$|[|/])`, "gi")),
    ...price.matchAll(new RegExp(String.raw`^\s*(${PRICE_AMOUNT_PATTERN})\s*$`, "g")),
  ];
  if (matches.length === 0) return false;
  return matches.some((match) => {
    const amount = amountFromMatch(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (/(?:\/|[·•])/.test(price)) return true;
    if (amount <= 4 && !/\b(fee|charge|surcharge|add-?on|upgrade|additional|per|each|piece|with)\b/i.test(combined)) {
      return false;
    }
    return true;
  });
}
