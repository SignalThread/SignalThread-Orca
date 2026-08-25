import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CircleDollarSign } from "lucide-react";
import {
  accountFinancialsHref,
  eventBudgetHref,
  type AccountFinancialView,
} from "@/lib/event-command-center-links";
import {
  budgetCategoriesMatch,
  compareBudgetCategories,
  getBudgetCategoryDisplay,
  resolveBudgetCategory,
} from "@/lib/budget-category-filter";
import { resolveActiveEventVisibilityWhere } from "@/lib/events";
import { getPrisma } from "@/lib/prisma";
import { ensureProvisionedUserAndContext } from "@/lib/request-user";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactMoneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

function formatCompactMoney(cents: number): string {
  return compactMoneyFormatter.format(cents / 100);
}

function formatVariance(cents: number): string {
  if (cents > 0) return `${formatCompactMoney(cents)} under`;
  if (cents < 0) return `${formatCompactMoney(Math.abs(cents))} over`;
  return "On plan";
}

function normalizeView(value: string | string[] | undefined): AccountFinancialView {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "categories" || raw === "events" || raw === "summary" ? raw : "summary";
}

function normalizeCategory(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const normalized = resolveBudgetCategory(raw) ?? getBudgetCategoryDisplay(raw);
  return normalized || null;
}

export default async function DashboardFinancialsPage({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string | string[]; view?: string | string[] }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedView = normalizeView(resolvedSearchParams.view);
  const selectedCategory = normalizeCategory(resolvedSearchParams.category);
  const authContext = await ensureProvisionedUserAndContext();
  if (authContext.status === "UNAUTHENTICATED") {
    redirect("/login");
  }

  if (authContext.status !== "OK") {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-[24px] leading-[28px] font-semibold text-slate-800">Financials unavailable</h2>
        <p className="mt-3 text-[14px] text-slate-500">Select an organization context to view portfolio financials.</p>
      </section>
    );
  }

  const prisma = getPrisma();
  const eventAccessWhere = resolveActiveEventVisibilityWhere({
    userId: authContext.appUserId!,
    role: authContext.role!,
    orgId: authContext.activeOrgId,
  }).where;

  const [events, budgetCategoryGroups] = await Promise.all([
    prisma.event.findMany({
      where: eventAccessWhere,
      orderBy: [{ startDate: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        budget: { select: { id: true, status: true } },
      },
    }),
    prisma.budgetLineItem.groupBy({
      by: ["budgetId", "category"],
      where: { budget: { event: eventAccessWhere } },
      _sum: { forecastCents: true, actualCents: true },
      _count: { _all: true },
    }),
  ]);

  const eventByBudgetId = new Map(
    events.flatMap((event) => (event.budget ? [[event.budget.id, event] as const] : [])),
  );

  const categoryMap = new Map<string, { category: string; forecastCents: number; actualCents: number; lineItemCount: number }>();
  const eventTotals = new Map<string, { forecastCents: number; actualCents: number; lineItemCount: number }>();

  for (const group of budgetCategoryGroups) {
    const event = eventByBudgetId.get(group.budgetId);
    if (!event) continue;
    const category = getBudgetCategoryDisplay(group.category) || "Uncategorized";
    const forecastCents = group._sum.forecastCents ?? 0;
    const actualCents = group._sum.actualCents ?? 0;
    const lineItemCount = group._count._all;
    const categoryMatches = selectedCategory ? budgetCategoriesMatch(category, selectedCategory) : true;

    const categoryEntry = categoryMap.get(category) ?? { category, forecastCents: 0, actualCents: 0, lineItemCount: 0 };
    categoryEntry.forecastCents += forecastCents;
    categoryEntry.actualCents += actualCents;
    categoryEntry.lineItemCount += lineItemCount;
    categoryMap.set(category, categoryEntry);

    if (categoryMatches) {
      const eventEntry = eventTotals.get(event.id) ?? { forecastCents: 0, actualCents: 0, lineItemCount: 0 };
      eventEntry.forecastCents += forecastCents;
      eventEntry.actualCents += actualCents;
      eventEntry.lineItemCount += lineItemCount;
      eventTotals.set(event.id, eventEntry);
    }
  }

  const allCategoryRows = Array.from(categoryMap.values()).sort((left, right) =>
    compareBudgetCategories(left.category, right.category),
  );
  const categoryRows = selectedCategory
    ? allCategoryRows.filter((row) => budgetCategoriesMatch(row.category, selectedCategory))
    : allCategoryRows;
  const portfolioTotals = categoryRows.reduce(
    (totals, row) => ({
      forecastCents: totals.forecastCents + row.forecastCents,
      actualCents: totals.actualCents + row.actualCents,
      lineItemCount: totals.lineItemCount + row.lineItemCount,
    }),
    { forecastCents: 0, actualCents: 0, lineItemCount: 0 },
  );
  const eventRows = events
    .map((event) => {
      const totals = eventTotals.get(event.id) ?? { forecastCents: 0, actualCents: 0, lineItemCount: 0 };
      return { event, ...totals };
    })
    .filter((row) => !selectedCategory || row.lineItemCount > 0)
    .sort((left, right) =>
      Math.abs(right.actualCents - right.forecastCents) - Math.abs(left.actualCents - left.forecastCents) ||
      left.event.name.localeCompare(right.event.name),
    );
  const totalActual = Math.max(1, portfolioTotals.actualCents);

  return (
    <main className="grid gap-5 bg-[#f7f8fb] px-7 py-5 text-slate-900">
      <header className="grid gap-3">
        <Link href="/dashboard" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[#28439A] hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Command Center
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="m-0 text-[30px] font-semibold leading-tight text-slate-950">Portfolio Financials</h1>
            <p className="mt-1 text-[14px] text-slate-500">
              Account-level forecast, actual spend, category mix, and event budget comparison.
            </p>
          </div>
          {selectedCategory ? (
            <Link href={accountFinancialsHref({ view: selectedView })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-[#28439A] shadow-sm hover:bg-slate-50">
              Clear {selectedCategory}
            </Link>
          ) : null}
        </div>
      </header>

      <nav className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Financial views">
        {([
          ["summary", "Summary"],
          ["categories", "Categories"],
          ["events", "Events"],
        ] as Array<[AccountFinancialView, string]>).map(([view, label]) => (
          <Link
            key={view}
            href={accountFinancialsHref({ view, category: selectedCategory })}
            aria-current={selectedView === view ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold ${
              selectedView === view ? "bg-[#28439A] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-[#28439A]"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Portfolio financial summary">
        {[
          ["Forecast", portfolioTotals.forecastCents],
          ["Actual", portfolioTotals.actualCents],
          ["Variance", portfolioTotals.forecastCents - portfolioTotals.actualCents],
          ["Events", eventRows.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-[26px] font-semibold text-slate-950">
              {label === "Events" ? value.toLocaleString() : label === "Variance" ? formatVariance(value as number) : formatCompactMoney(value as number)}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="text-[18px] font-semibold text-slate-950">Spend Categories</h2>
            <span className="text-[12px] font-semibold text-slate-500">{categoryRows.length} shown</span>
          </div>
          <div className="divide-y divide-slate-100">
            {allCategoryRows.length === 0 ? (
              <p className="p-4 text-[14px] text-slate-500">No budget category data is available.</p>
            ) : (
              allCategoryRows.map((row) => {
                const active = selectedCategory ? budgetCategoriesMatch(row.category, selectedCategory) : false;
                const percent = Math.round((row.actualCents / totalActual) * 100);
                return (
                  <Link
                    key={row.category}
                    href={accountFinancialsHref({ view: "categories", category: row.category })}
                    aria-label={`Filter portfolio financials to ${row.category}: ${formatMoney(row.actualCents)} actual`}
                    className={`grid gap-2 px-4 py-3 transition hover:bg-blue-50/35 focus-visible:bg-blue-50/45 focus-visible:outline-none ${active ? "bg-blue-50/70" : ""}`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-800">{row.category}</span>
                      <span className="text-[13px] font-semibold text-slate-600">{formatCompactMoney(row.actualCents)} / {formatCompactMoney(row.forecastCents)}</span>
                    </span>
                    <span className="h-2 rounded-full bg-slate-100">
                      <span className="block h-2 rounded-full bg-[#28439A]" style={{ width: `${Math.min(100, percent)}%` }} />
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="text-[18px] font-semibold text-slate-950">Event Budget Comparison</h2>
            <span className="text-[12px] font-semibold text-slate-500">{selectedCategory ?? "All categories"}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {eventRows.length === 0 ? (
              <p className="p-4 text-[14px] text-slate-500">No events match this financial filter.</p>
            ) : (
              eventRows.map((row) => {
                const variance = row.forecastCents - row.actualCents;
                const status = row.forecastCents > 0 && row.actualCents > row.forecastCents
                  ? "Over forecast"
                  : row.event.budget?.status
                    ? "On plan"
                    : "No budget";
                return (
                  <Link
                    key={row.event.id}
                    href={eventBudgetHref(row.event.id)}
                    className="grid gap-2 px-4 py-3 transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                    aria-label={`Open ${row.event.name} budget. Forecast ${formatMoney(row.forecastCents)}, actual ${formatMoney(row.actualCents)}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{row.event.name}</span>
                      <span className="mt-0.5 block text-[12px] text-slate-500">{status}</span>
                    </span>
                    <span className="text-[13px] text-slate-600">Forecast <strong className="text-slate-900">{formatCompactMoney(row.forecastCents)}</strong></span>
                    <span className="text-[13px] text-slate-600">Actual <strong className="text-slate-900">{formatCompactMoney(row.actualCents)}</strong></span>
                    <span className="inline-flex items-center justify-end gap-1 text-[13px] font-semibold text-[#28439A]">
                      {formatVariance(variance)}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-[#28439A]" aria-hidden />
          <h2 className="text-[18px] font-semibold text-slate-950">Selected Scope</h2>
        </div>
        <p className="text-[14px] leading-6 text-slate-600">
          Showing {selectedCategory ?? "all budget categories"} across {eventRows.length} visible event{eventRows.length === 1 ? "" : "s"}, using the same account and event access rules as the Command Center.
        </p>
      </section>
    </main>
  );
}
