"use client";

import { useCallback, useEffect, useState } from "react";

type BudgetStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type BudgetVarianceByCategory = {
  category: string;
  lineItemCount: number;
  totalForecastCents: number;
  totalActualCents: number;
  varianceCents: number;
  variancePercent: number | null;
};

type BudgetVarianceLineItem = {
  id: string;
  category: string;
  subcategory: string;
  lineItem: string;
  vendor: string | null;
  forecastCents: number;
  actualCents: number;
  varianceCents: number;
  variancePercent: number | null;
};

type BudgetReportingResponse = {
  generatedAt: string;
  forecastVsActual: {
    totalForecastCents: number;
    totalActualCents: number;
    varianceCents: number;
    variancePercent: number | null;
    lineItemCount: number;
  };
  varianceByCategory: BudgetVarianceByCategory[];
  topOverBudgetItems: BudgetVarianceLineItem[];
  topUnderBudgetItems: BudgetVarianceLineItem[];
  versionContext: {
    eventId: string;
    budgetId: string;
    budgetStatus: BudgetStatus;
    budgetVersionId: string | null;
    budgetVersionNumber: number | null;
    lineItemCount: number;
  };
};

function toErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatSignedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  if (value > 0) return `+${value.toFixed(1)}%`;
  if (value < 0) return `${value.toFixed(1)}%`;
  return "0.0%";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatStatusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

type EventFinancialReportingProps = {
  eventId: string;
};

export function EventFinancialReporting({ eventId }: EventFinancialReportingProps) {
  const [reporting, setReporting] = useState<BudgetReportingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadReporting = useCallback(async () => {
    if (!eventId) {
      setReporting(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/budget/reporting`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load financial reporting"));
      }
      setReporting(payload as BudgetReportingResponse);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load financial reporting");
      setReporting(null);
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadReporting();
  }, [loadReporting]);

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] leading-[26px] font-semibold text-slate-900">Financial Reporting</h2>
          <p className="mt-1 text-[14px] text-slate-600">
            Forecast, variance, and budget performance from structured line items.
          </p>
        </div>
        {reporting?.versionContext ? (
          <div className="text-right text-[12px] text-slate-500">
            <p>
              {reporting.versionContext.budgetVersionNumber
                ? `Version v${reporting.versionContext.budgetVersionNumber}`
                : "Version unversioned"}
              {" • "}
              {formatStatusLabel(reporting.versionContext.budgetStatus)}
            </p>
            <p>{reporting.forecastVsActual.lineItemCount} line items</p>
            <p>Updated {formatTimestamp(reporting.generatedAt)}</p>
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {errorMessage}
        </div>
      ) : null}

      {isLoading && !reporting ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
          Loading financial reporting...
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[12px] uppercase tracking-wide text-slate-500">Forecast</p>
              <p className="mt-1 text-[18px] font-semibold text-slate-900">
                {formatMoney(reporting?.forecastVsActual.totalForecastCents ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[12px] uppercase tracking-wide text-slate-500">Actual</p>
              <p className="mt-1 text-[18px] font-semibold text-slate-900">
                {formatMoney(reporting?.forecastVsActual.totalActualCents ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[12px] uppercase tracking-wide text-slate-500">Variance</p>
              <p
                className={[
                  "mt-1 text-[18px] font-semibold",
                  (reporting?.forecastVsActual.varianceCents ?? 0) > 0 ? "text-rose-700" : "text-emerald-700",
                ].join(" ")}
              >
                {formatMoney(reporting?.forecastVsActual.varianceCents ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[12px] uppercase tracking-wide text-slate-500">Variance %</p>
              <p
                className={[
                  "mt-1 text-[18px] font-semibold",
                  (reporting?.forecastVsActual.variancePercent ?? 0) > 0 ? "text-rose-700" : "text-emerald-700",
                ].join(" ")}
              >
                {formatSignedPercent(reporting?.forecastVsActual.variancePercent ?? null)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[13px] font-semibold text-slate-800">Top Over-Budget Items</p>
              {(reporting?.topOverBudgetItems.length ?? 0) === 0 ? (
                <p className="mt-2 text-[12px] text-slate-500">No over-budget items.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {reporting?.topOverBudgetItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-rose-200 bg-white px-3 py-2">
                      <p className="text-[12px] font-semibold text-slate-800">{item.lineItem}</p>
                      <p className="text-[11px] text-slate-500">{item.category} • {item.subcategory}</p>
                      <p className="mt-1 text-[12px] font-semibold text-rose-700">
                        {formatMoney(item.varianceCents)} ({formatSignedPercent(item.variancePercent)})
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[13px] font-semibold text-slate-800">Top Under-Budget Items</p>
              {(reporting?.topUnderBudgetItems.length ?? 0) === 0 ? (
                <p className="mt-2 text-[12px] text-slate-500">No under-budget items.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {reporting?.topUnderBudgetItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <p className="text-[12px] font-semibold text-slate-800">{item.lineItem}</p>
                      <p className="text-[11px] text-slate-500">{item.category} • {item.subcategory}</p>
                      <p className="mt-1 text-[12px] font-semibold text-emerald-700">
                        {formatMoney(item.varianceCents)} ({formatSignedPercent(item.variancePercent)})
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[13px] font-semibold text-slate-800">Variance by Category</p>
              {(reporting?.varianceByCategory.length ?? 0) === 0 ? (
                <p className="mt-2 text-[12px] text-slate-500">No category variance data yet.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {reporting?.varianceByCategory.map((entry) => (
                    <div key={entry.category} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12px] font-semibold text-slate-800">{entry.category}</p>
                        <p
                          className={[
                            "text-[12px] font-semibold",
                            entry.varianceCents > 0 ? "text-rose-700" : "text-emerald-700",
                          ].join(" ")}
                        >
                          {formatMoney(entry.varianceCents)}
                        </p>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {entry.lineItemCount} items • Forecast {formatMoney(entry.totalForecastCents)} • Actual{" "}
                        {formatMoney(entry.totalActualCents)} • {formatSignedPercent(entry.variancePercent)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

