"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  budgetBlockColumnCountForWidth,
  budgetBlockPageCount,
  budgetBlockPageItems,
  budgetBlockPageSizeForColumns,
  clampBudgetBlockPageIndex,
  type BudgetBlockColumnCount,
} from "@/lib/budget-block-pagination";
import { compareBudgetCategories, getBudgetCategoryDisplay, getBudgetCategoryPillStyle } from "@/lib/budget-category-filter";
import { budgetGroupColorTone, budgetGroupTagClasses } from "@/lib/budget-group-colors";
import { type BudgetHealth } from "@/lib/budget-money";

type CategoryBlock = {
  categoryKey: string;
  categoryLabel: string;
  forecastCents: number;
  actualCents: number;
  remainingCents: number;
  utilizationPercent: number;
  budgetHealth: BudgetHealth;
  rowCount: number;
};

type GroupBlock = {
  groupId: string;
  groupName: string;
  groupColor: string | null;
  forecastCents: number;
  actualCents: number;
  rowCount: number;
};

type BlocksResponse = {
  categories: CategoryBlock[];
  groups: GroupBlock[];
};

type BudgetBlocksSectionProps = {
  eventId: string;
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

function clampPercent(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function gridHref(eventId: string, params: Record<string, string>): string {
  const search = new URLSearchParams({ view: "grid", ...params });
  return `/events/${encodeURIComponent(eventId)}/budget?${search.toString()}`;
}

function categoryHasActivity(block: CategoryBlock): boolean {
  return block.actualCents > 0 || block.forecastCents > 0 || block.rowCount > 0;
}

function categoryCardAppearance(
  accent: ReturnType<typeof getBudgetCategoryPillStyle>,
  budgetHealth: BudgetHealth,
): CSSProperties {
  const color = budgetHealth === "OVER_BUDGET"
    ? "var(--color-rose-500)"
    : budgetHealth === "APPROACHING_BUDGET"
      ? "var(--color-amber-500)"
      : budgetHealth === "UNCLASSIFIED"
        ? "var(--color-slate-300)"
        : `var(--color-${accent.key}-500)`;
  const borderMix = budgetHealth === "OVER_BUDGET" || budgetHealth === "APPROACHING_BUDGET" ? "40%" : "35%";

  return {
    // The wash is intentionally almost white; the outline, dot, and progress
    // bar carry the category/status association.
    backgroundColor: `color-mix(in srgb, ${color} 3%, white)`,
    borderColor: `color-mix(in srgb, ${color} ${borderMix}, white)`,
  };
}

function useBudgetBlockGrid(itemCount: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState<BudgetBlockColumnCount>(4);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateColumns = () => {
      setColumns(budgetBlockColumnCountForWidth(node.getBoundingClientRect().width));
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pageSize = budgetBlockPageSizeForColumns(columns);
  const pageCount = budgetBlockPageCount(itemCount, columns);
  const safePageIndex = clampBudgetBlockPageIndex(pageIndex, itemCount, columns);
  const canPage = pageCount > 1;
  const canPageBackward = safePageIndex > 0;
  const canPageForward = safePageIndex < pageCount - 1;

  const goToPreviousPage = () => {
    setPageIndex((current) => clampBudgetBlockPageIndex(current - 1, itemCount, columns));
  };
  const goToNextPage = () => {
    setPageIndex((current) => clampBudgetBlockPageIndex(current + 1, itemCount, columns));
  };

  return {
    containerRef,
    columns,
    pageIndex: safePageIndex,
    pageSize,
    pageCount,
    canPage,
    canPageBackward,
    canPageForward,
    goToPreviousPage,
    goToNextPage,
  };
}

function PagedBudgetBlockSection<T>({
  title,
  description,
  items,
  emptyState,
  renderItem,
  pageLabel,
}: {
  title: string;
  description: string;
  items: readonly T[];
  emptyState?: ReactNode;
  renderItem: (item: T) => ReactNode;
  pageLabel: string;
}) {
  const {
    containerRef,
    columns,
    pageIndex,
    pageSize,
    canPage,
    canPageBackward,
    canPageForward,
    goToPreviousPage,
    goToNextPage,
  } = useBudgetBlockGrid(items.length);
  const visibleItems = useMemo(
    () => budgetBlockPageItems(items, pageIndex, columns),
    [columns, pageIndex, items],
  );

  return (
    <div ref={containerRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        {canPage ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={goToPreviousPage}
              disabled={!canPageBackward}
              aria-label={`Show previous ${pageLabel} page`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={goToNextPage}
              disabled={!canPageForward}
              aria-label={`Show next ${pageLabel} page`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        emptyState
      ) : (
        <div
          className="grid min-w-0 gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          data-budget-block-grid
          data-budget-block-columns={columns}
          data-budget-block-page-size={pageSize}
        >
          {visibleItems.map(renderItem)}
        </div>
      )}
    </div>
  );
}

function CategoryCard({
  eventId,
  block,
  isActive,
}: {
  eventId: string;
  block: CategoryBlock;
  isActive: boolean;
}) {
  const router = useRouter();
  const accent = getBudgetCategoryPillStyle(block.categoryKey);
  const href = gridHref(eventId, { category: block.categoryKey });
  const isApproachingBudget = block.budgetHealth === "APPROACHING_BUDGET";
  const isOverBudget = block.budgetHealth === "OVER_BUDGET";
  const progressPercent = clampPercent(block.utilizationPercent);
  const statusLabel = isOverBudget ? "Over budget" : isApproachingBudget ? "Near target" : block.budgetHealth === "UNCLASSIFIED" ? "Unclassified" : "On track";
  const statusTone = isOverBudget ? "text-rose-700" : isApproachingBudget ? "text-amber-700" : block.budgetHealth === "UNCLASSIFIED" ? "text-slate-500" : "text-emerald-600";
  const cardAppearance = categoryCardAppearance(accent, block.budgetHealth);
  const progressTone = isOverBudget ? "bg-rose-500" : isApproachingBudget ? "bg-amber-500" : accent.bar;
  const focusRing = isOverBudget ? "ring-rose-300" : isApproachingBudget ? "ring-amber-300" : accent.ring;
  const activeTone = isActive ? `ring-2 ring-offset-2 ${focusRing}` : "";
  const utilizationLabel = `${block.utilizationPercent}%`;

  const openGrid = () => router.push(href);
  const handleCardClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("a,button,input,select,textarea")) return;
    openGrid();
  };
  const handleCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openGrid();
  };

  return (
    <div
      role="link"
      tabIndex={0}
      aria-current={isActive ? "page" : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className={`h-full min-w-0 cursor-pointer rounded-2xl border p-4 shadow-sm transition-colors ${activeTone}`}
      style={cardAppearance}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent.dot}`} />
          <Link
            href={href}
            className="min-w-0 truncate text-sm font-semibold text-slate-900 hover:underline"
            title={`Open ${block.categoryLabel} in the budget grid`}
          >
            {block.categoryLabel}
          </Link>
        </div>
        <span className="shrink-0 text-right text-[11px] text-slate-500">
          Actual
          <strong className={`block text-sm font-semibold ${statusTone}`}>{formatMoney(block.actualCents)}</strong>
        </span>
      </div>

      <div className="mt-3">
        <div className="h-2 w-full rounded-full bg-slate-200">
          <div className={`h-2 rounded-full ${progressTone}`} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span className="min-w-0">
          {block.rowCount} {block.rowCount === 1 ? "row" : "rows"} · Forecast {formatMoney(block.forecastCents)}
        </span>
        <span className={`shrink-0 font-medium ${statusTone}`}>{statusLabel}</span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
        <span>Remaining <strong className={`block font-semibold ${isOverBudget ? "text-rose-700" : "text-slate-900"}`}>{formatMoney(block.remainingCents)}</strong></span>
        <span>Utilization <strong className={`block font-semibold ${statusTone}`}>{utilizationLabel}</strong></span>
      </div>
    </div>
  );
}

export function BudgetBlocksSection({ eventId }: BudgetBlocksSectionProps) {
  const searchParams = useSearchParams();
  const [blocks, setBlocks] = useState<BlocksResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadBlocks = useCallback(async () => {
    const request = ++requestRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/budget/blocks`, { cache: "no-store" });
      const payload = (await response.json()) as BlocksResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load budget blocks");
      }
      if (request !== requestRef.current) return;
      setBlocks({ categories: payload.categories ?? [], groups: payload.groups ?? [] });
      setErrorMessage(null);
    } catch (error) {
      if (request !== requestRef.current) return;
      setErrorMessage(error instanceof Error ? error.message : "Failed to load budget blocks");
      setBlocks(null);
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  useEffect(() => {
    const handleGroupsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ eventId?: string }>).detail;
      if (detail?.eventId && detail.eventId !== eventId) return;
      void loadBlocks();
    };

    window.addEventListener("budget-groups:changed", handleGroupsChanged);
    window.addEventListener("budget-financials:changed", handleGroupsChanged);
    return () => {
      window.removeEventListener("budget-groups:changed", handleGroupsChanged);
      window.removeEventListener("budget-financials:changed", handleGroupsChanged);
    };
  }, [eventId, loadBlocks]);

  const categories = useMemo(() => blocks?.categories ?? [], [blocks?.categories]);
  const groups = blocks?.groups ?? [];
  const activeCategory = getBudgetCategoryDisplay(searchParams.get("category"));
  const sortedCategories = useMemo(
    () =>
      [...categories].sort((left, right) => {
        const activityDiff = Number(categoryHasActivity(right)) - Number(categoryHasActivity(left));
        if (activityDiff !== 0) return activityDiff;
        return compareBudgetCategories(left.categoryLabel, right.categoryLabel);
      }),
    [categories],
  );
  const activeGroupId = searchParams.get("groupId") ?? searchParams.get("group") ?? "";

  return (
    <section className="space-y-5">
      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[12px] text-slate-500">Loading budget blocks…</p>
        </div>
      ) : errorMessage ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[12px] text-rose-600">{errorMessage}</p>
          <button type="button" onClick={() => void loadBlocks()} className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
            Retry
          </button>
        </div>
      ) : (
        <PagedBudgetBlockSection
          title="Categories"
          description="Budget totals by category for your event"
          items={sortedCategories}
          pageLabel="category cards"
          emptyState={
            <p className="rounded-lg border border-dashed border-slate-200 p-4 text-[12px] text-slate-500">
              No budget categories yet. Add line items in the budget grid.
            </p>
          }
          renderItem={(block) => (
            <CategoryCard
              key={block.categoryKey}
              eventId={eventId}
              block={block}
              isActive={Boolean(activeCategory) && getBudgetCategoryDisplay(block.categoryKey) === activeCategory}
            />
          )}
        />
      )}

      {groups.length > 0 ? (
        <PagedBudgetBlockSection
          title="Groups"
          description="User-defined budget tags from the grid"
          items={groups}
          pageLabel="group cards"
          renderItem={(group) => {
                const tone = budgetGroupColorTone(group.groupId, group.groupName, group.groupColor);
                const forecastPercent = group.forecastCents > 0 ? clampPercent((group.actualCents / group.forecastCents) * 100) : 0;
                const isOverForecast = group.forecastCents > 0 && group.actualCents > group.forecastCents;
                const isActiveGroup = group.groupId === activeGroupId;
                return (
                  <Link
                    key={group.groupId}
                    href={gridHref(eventId, { groupId: group.groupId })}
                    aria-current={isActiveGroup ? "page" : undefined}
                    title={`Open ${group.groupName} in the budget grid`}
                    className={`h-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 ${isActiveGroup ? "ring-2 ring-offset-2 ring-slate-300" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone?.dot ?? "bg-slate-400"}`} />
                        <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{group.groupName}</span>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-slate-700">{formatMoney(group.actualCents)}</span>
                    </div>
                    <div className="mt-3">
                      <div className="h-2 w-full rounded-full bg-slate-200">
                        <div className={`h-2 rounded-full ${isOverForecast ? "bg-rose-500" : tone?.bar ?? "bg-slate-400"}`} style={{ width: `${forecastPercent}%` }} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>
                        {group.rowCount} {group.rowCount === 1 ? "row" : "rows"}
                      </span>
                      <span className={`font-medium ${isOverForecast ? "text-rose-600" : tone?.text ?? "text-slate-600"}`}>
                        {group.forecastCents > 0 ? `${Math.round(forecastPercent)}% forecast` : "No forecast"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${budgetGroupTagClasses(group.groupId, group.groupName, group.groupColor)}`}>
                        Forecast {formatMoney(group.forecastCents)}
                      </span>
                      <span className={`font-medium ${isOverForecast ? "text-rose-600" : "text-emerald-600"}`}>
                        {isOverForecast ? "Over forecast" : "On track"}
                      </span>
                    </div>
                  </Link>
                );
              }}
        />
      ) : null}
    </section>
  );
}
