import { getSearchTerms } from "./search-query";

export type SearchHighlightSegment = { text: string; matched: boolean };

export function getSearchHighlightSegments(text: string, query: string): SearchHighlightSegment[] {
  const terms = getSearchTerms(query).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [{ text, matched: false }];
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(pattern).filter(Boolean).map((part) => ({
    text: part,
    matched: terms.includes(part.toLowerCase()),
  }));
}
