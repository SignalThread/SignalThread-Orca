"use client";

import { useEffect } from "react";

export function HelpSearchFocus({ query }: { query: string }) {
  useEffect(() => {
    if (query) document.getElementById("help-search-results-status")?.focus({ preventScroll: true });
  }, [query]);
  return null;
}
