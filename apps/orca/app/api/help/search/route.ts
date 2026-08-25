import { NextResponse } from "next/server";
import { searchHelpArticles } from "@/lib/help/help-search.server";
import { HELP_SEARCH_MIN_SUGGESTION_LENGTH, normalizeHelpSearchQuery } from "@/lib/help/search-query";

export function GET(request: Request) {
  const url = new URL(request.url);
  const query = normalizeHelpSearchQuery(url.searchParams.get("q"));
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "6", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 8) : 6;
  const results = query.length >= HELP_SEARCH_MIN_SUGGESTION_LENGTH ? searchHelpArticles(query, limit) : [];
  return NextResponse.json({ query, results });
}
