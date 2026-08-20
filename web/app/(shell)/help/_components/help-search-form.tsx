"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { getNextSuggestionIndex, HELP_SEARCH_MIN_SUGGESTION_LENGTH } from "@/lib/help/search-query";
import type { HelpSearchResult } from "@/lib/help/types";
import { HelpStatusBadge } from "./help-status";

type HelpSearchFormProps = {
  defaultValue?: string;
  compact?: boolean;
  suggestions?: boolean;
};

export function HelpSearchForm({ defaultValue = "", compact = false, suggestions = false }: HelpSearchFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = compact ? "compact" : suggestions ? "suggestions" : "default";
  const listboxId = `help-search-suggestions-${id}`;
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<HelpSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => setQuery(defaultValue), [defaultValue]);

  useEffect(() => {
    if (!suggestions || !hasInteracted || query.trim().length < HELP_SEARCH_MIN_SUGGESTION_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/help/search?q=${encodeURIComponent(query)}&limit=6`, { signal: controller.signal });
        if (!response.ok) throw new Error("Help search failed");
        const data = await response.json() as { results: HelpSearchResult[] };
        setResults(data.results);
        setActiveIndex(-1);
        setOpen(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [hasInteracted, query, suggestions]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const showSuggestions = suggestions && open && query.trim().length >= HELP_SEARCH_MIN_SUGGESTION_LENGTH;
  const activeResult = activeIndex >= 0 ? results[activeIndex] : null;

  return (
    <div ref={rootRef} className={compact ? "relative w-full" : "relative w-full max-w-3xl"}>
      <form
        action="/help/search"
        method="get"
        className="flex w-full gap-2"
        role="search"
        onSubmit={(event) => {
          if (!activeResult) return;
          event.preventDefault();
          setOpen(false);
          router.push(activeResult.href);
        }}
      >
        <label htmlFor={`help-search-${id}`} className="sr-only">Search Orca Help</label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            id={`help-search-${id}`}
            name="q"
            type="search"
            value={query}
            maxLength={200}
            autoComplete="off"
            placeholder="Search features, workflows, or questions"
            role={suggestions ? "combobox" : undefined}
            aria-autocomplete={suggestions ? "list" : undefined}
            aria-expanded={suggestions ? showSuggestions : undefined}
            aria-controls={suggestions ? listboxId : undefined}
            aria-activedescendant={activeResult ? `${listboxId}-${activeIndex}` : undefined}
            onFocus={() => {
              setHasInteracted(true);
              if (query.trim().length >= HELP_SEARCH_MIN_SUGGESTION_LENGTH) setOpen(true);
            }}
            onChange={(event) => {
              setHasInteracted(true);
              setQuery(event.target.value);
              setActiveIndex(-1);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setOpen(false);
                router.push(activeResult?.href ?? (query.trim() ? `/help/search?q=${encodeURIComponent(query.trim())}` : "/help/search"));
                return;
              }
              if (event.key === "Escape") {
                setOpen(false);
                setActiveIndex(-1);
                return;
              }
              if (!showSuggestions || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              setActiveIndex((current) => getNextSuggestionIndex(current, event.key as "ArrowDown" | "ArrowUp" | "Home" | "End", results.length));
            }}
            className={[
              "w-full appearance-none rounded-lg border border-slate-300 bg-white pl-10 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#28439A] focus:ring-4 focus:ring-[#28439A]/10 [&::-webkit-search-cancel-button]:hidden",
              query ? "pr-10" : "pr-3",
              compact ? "min-h-11" : "min-h-12",
            ].join(" ")}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear Help search"
              onClick={() => {
                setQuery("");
                setResults([]);
                setOpen(false);
                setActiveIndex(-1);
                inputRef.current?.focus();
              }}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#28439A]/20"
            ><X className="h-4 w-4" aria-hidden="true" /></button>
          ) : null}
        </div>
        <button type="submit" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[#28439A] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#243d8e] focus:outline-none focus:ring-2 focus:ring-[#28439A]/30 motion-reduce:transition-none">
          <Search className="h-4 w-4 sm:mr-2" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Search</span>
        </button>
      </form>

      <div className="sr-only" role="status" aria-live="polite">
        {loading ? "Searching Help" : showSuggestions ? `${results.length} suggestions available` : ""}
      </div>
      {showSuggestions ? (
        <div
          id={listboxId}
          role={!loading && results.length > 0 ? "listbox" : undefined}
          aria-label={!loading && results.length > 0 ? "Help search suggestions" : undefined}
          className="absolute z-30 mt-2 max-h-80 w-full min-w-0 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
        >
          {loading ? <p className="px-4 py-4 text-xs text-slate-500">Searching Help...</p> : results.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {results.map((result, index) => (
                <li id={`${listboxId}-${index}`} key={result.articleSlug} role="option" aria-selected={activeIndex === index}>
                  <a
                    href={result.href}
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => setOpen(false)}
                    className={[
                      "block px-4 py-3 transition-colors",
                      activeIndex === index ? "bg-blue-50" : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-950">{result.title}</span>
                        <span className="mt-1 block truncate text-[11px] text-slate-500">{result.category}{result.matchedHeading ? ` · ${result.matchedHeading}` : ""}</span>
                      </span>
                      <HelpStatusBadge status={result.status} />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">No Help articles found</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Press Enter to view search tips and browse by topic.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
