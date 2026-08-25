import { BudgetLineItemApproval, BudgetLineItemStatus } from "@prisma/client";
import type { PagedBudgetLineItemsQuery } from "@/src/server/services/budget";

// Shared parsing for the paged line-items filter/search/sort query string, used
// by both the paged-rows route and the ids-only route so their filter semantics
// stay identical. The service layer still clamps/defaults page and page size.

function parsePositiveInt(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseStatus(value: string | null): BudgetLineItemStatus | null {
  if (value && value in BudgetLineItemStatus) return value as BudgetLineItemStatus;
  return null;
}

function parseApproval(value: string | null): BudgetLineItemApproval | null {
  if (value && value in BudgetLineItemApproval) return value as BudgetLineItemApproval;
  return null;
}

export function parsePagedLineItemsQuery(searchParams: URLSearchParams): PagedBudgetLineItemsQuery {
  const dir = searchParams.get("dir");
  return {
    page: parsePositiveInt(searchParams.get("page")),
    pageSize: parsePositiveInt(searchParams.get("pageSize")),
    search: searchParams.get("search") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    subcategory: searchParams.get("subcategory") ?? undefined,
    status: parseStatus(searchParams.get("status")),
    approval: parseApproval(searchParams.get("approval")),
    sessionId: searchParams.get("sessionId"),
    groupId: searchParams.get("groupId"),
    sort: searchParams.get("sort") ?? undefined,
    dir: dir === "desc" ? "desc" : dir === "asc" ? "asc" : undefined,
  };
}
