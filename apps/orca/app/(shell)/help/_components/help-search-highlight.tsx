import { getSearchHighlightSegments } from "@/lib/help/search-highlight";

export function HelpSearchHighlight({ text, query }: { text: string; query: string }) {
  return getSearchHighlightSegments(text, query).map((segment, index) => segment.matched ? (
    <mark key={`${segment.text}-${index}`} className="rounded-sm bg-amber-100 px-0.5 text-inherit">{segment.text}</mark>
  ) : segment.text);
}
