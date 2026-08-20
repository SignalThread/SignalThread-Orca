"use client";

import { Link2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Matrix2Session } from "./types";

type LinkedBudgetLineItem = NonNullable<Matrix2Session["requirementSelections"][number]["linkedBudgetLineItem"]>;

type BudgetLineItemOption = LinkedBudgetLineItem & {
  linkedSessionRequirement?: {
    sessionId: string;
    requirementItemId: string;
  } | null;
};

function toErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  return fallback;
}

const compactMoneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCompactMoney(cents: number): string {
  return compactMoneyFormatter.format(cents / 100);
}

/** Higher rank = better operational match for category / subcategory (requirement section + item). */
function operationalMatchRank(
  lineItem: BudgetLineItemOption,
  preferredCategory: string | null,
  preferredSubcategory: string,
): number {
  const cat = lineItem.category.trim().toLowerCase();
  const sub = lineItem.subcategory.trim().toLowerCase();
  const name = lineItem.lineItem.trim().toLowerCase();
  const prefCat = preferredCategory?.trim().toLowerCase() ?? "";
  const prefSub = preferredSubcategory.trim().toLowerCase();

  let rank = 0;
  if (prefCat && cat === prefCat) rank += 4;
  if (prefSub && sub === prefSub) rank += 3;
  if (prefSub) {
    if (name === prefSub) rank += 2;
    else if (name.includes(prefSub)) rank += 1;
  }

  return rank;
}

function normalizeLinkedRecord(payload: unknown): LinkedBudgetLineItem | null {
  if (typeof payload !== "object" || payload === null) return null;
  const row = payload as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const lineItem = typeof row.lineItem === "string" ? row.lineItem : null;
  const category = typeof row.category === "string" ? row.category : null;
  const subcategory = typeof row.subcategory === "string" ? row.subcategory : "";
  const forecastCents = typeof row.forecastCents === "number" ? row.forecastCents : 0;
  const actualCents = typeof row.actualCents === "number" ? row.actualCents : 0;
  const statusRaw = row.status;
  const status = typeof statusRaw === "string" ? statusRaw : String(statusRaw ?? "");

  if (!id || !lineItem || !category) return null;

  return {
    id,
    lineItem,
    category,
    subcategory,
    forecastCents,
    actualCents,
    status,
  };
}

export function BudgetRequirementLinkControl({
  eventId,
  sessionId,
  itemId,
  preferredCategory,
  preferredSubcategory,
  prefillCategory,
  prefillSubcategory,
  prefillLineItem,
  linkedBudgetLineItem,
  disabled,
  onChange,
}: {
  eventId: string;
  sessionId: string;
  itemId: string;
  preferredCategory: string | null;
  preferredSubcategory: string;
  /** Defaults for the inline create form (taxonomy-aligned). */
  prefillCategory: string;
  prefillSubcategory: string;
  prefillLineItem: string;
  linkedBudgetLineItem: LinkedBudgetLineItem | null;
  disabled: boolean;
  onChange: (itemId: string, linkedBudgetLineItem: LinkedBudgetLineItem | null) => void;
}) {
  const [isChanging, setIsChanging] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [lineItems, setLineItems] = useState<BudgetLineItemOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedLineItems, setHasLoadedLineItems] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCreateFields, setShowCreateFields] = useState(false);
  const [createCategory, setCreateCategory] = useState(prefillCategory);
  const [createSubcategory, setCreateSubcategory] = useState(prefillSubcategory);
  const [createLineName, setCreateLineName] = useState(prefillLineItem);

  const showPicker = !linkedBudgetLineItem || isChanging;

  useEffect(() => {
    if (!showCreateFields) return;
    setCreateCategory(prefillCategory);
    setCreateSubcategory(prefillSubcategory);
    setCreateLineName(prefillLineItem);
  }, [prefillCategory, prefillSubcategory, prefillLineItem, showCreateFields]);

  const linkedId = linkedBudgetLineItem?.id ?? null;

  useEffect(() => {
    if (linkedId) setIsChanging(false);
  }, [linkedId]);

  useEffect(() => {
    if (hasLoadedLineItems) return;

    let isActive = true;
    void (async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/events/${eventId}/budget?source=requirement-budget-link`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(toErrorMessage(payload, "Failed to load budget line items"));
        }
        if (!isActive) return;
        setLineItems(Array.isArray(payload?.lineItems) ? payload.lineItems as BudgetLineItemOption[] : []);
        setErrorMessage(null);
      } catch (error) {
        if (!isActive) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load budget line items");
      } finally {
        if (isActive) {
          setHasLoadedLineItems(true);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [eventId, hasLoadedLineItems]);

  const filteredLineItems = useMemo(() => {
    const normalizedQuery = searchValue.trim().toLowerCase();

    const searched = lineItems.filter((lineItem) => {
      if (!normalizedQuery) return true;
      return [
        lineItem.lineItem,
        lineItem.category,
        lineItem.subcategory,
        lineItem.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    const ranked = [...searched].sort((left, right) => {
      const rankDiff =
        operationalMatchRank(right, preferredCategory, preferredSubcategory)
        - operationalMatchRank(left, preferredCategory, preferredSubcategory);
      if (rankDiff !== 0) return rankDiff;
      return left.lineItem.localeCompare(right.lineItem);
    });

    if (!normalizedQuery) {
      const preferredOnly = ranked.filter(
        (lineItem) => operationalMatchRank(lineItem, preferredCategory, preferredSubcategory) > 0,
      );
      const visible = preferredOnly.length > 0 ? preferredOnly : ranked;
      return visible.slice(0, 10);
    }

    return ranked.slice(0, 10);
  }, [lineItems, preferredCategory, preferredSubcategory, searchValue]);

  async function linkBudgetLineItem(lineItem: BudgetLineItemOption) {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/events/${eventId}/matrix-2/sessions/${sessionId}/requirements/${itemId}/budget-link`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budgetLineItemId: lineItem.id }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to link budget line item"));
      }
      const linked = normalizeLinkedRecord(payload.linkedBudgetLineItem) ?? lineItem;
      onChange(itemId, linked);
      setLineItems((current) => current.map((entry) => entry.id === lineItem.id
        ? { ...entry, linkedSessionRequirement: { sessionId, requirementItemId: itemId } }
        : entry));
      setIsChanging(false);
      setSearchValue("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to link budget line item");
    } finally {
      setIsSaving(false);
    }
  }

  async function unlinkBudgetLineItem() {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/events/${eventId}/matrix-2/sessions/${sessionId}/requirements/${itemId}/budget-link`,
        { method: "DELETE" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to unlink budget line item"));
      }
      const unlinkedId = linkedBudgetLineItem?.id ?? null;
      onChange(itemId, null);
      if (unlinkedId) {
        setLineItems((current) => current.map((entry) => entry.id === unlinkedId
          ? { ...entry, linkedSessionRequirement: null }
          : entry));
      }
      setIsChanging(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to unlink budget line item");
    } finally {
      setIsSaving(false);
    }
  }

  async function createBudgetLineAndLink() {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const createResponse = await fetch(`/api/events/${eventId}/budget/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: createCategory.trim() || "Uncategorized",
          subcategory: createSubcategory.trim() || "General",
          lineItem: createLineName.trim() || "New Line Item",
          forecastCents: 0,
          actualCents: 0,
        }),
      });
      const createdPayload = await createResponse.json();
      if (!createResponse.ok) {
        throw new Error(toErrorMessage(createdPayload, "Failed to create budget line item"));
      }
      const createdId = typeof createdPayload?.id === "string" ? createdPayload.id : "";
      if (!createdId) {
        throw new Error("Create response missing line item id");
      }

      const linkResponse = await fetch(
        `/api/events/${eventId}/matrix-2/sessions/${sessionId}/requirements/${itemId}/budget-link`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budgetLineItemId: createdId }),
        },
      );
      const linkPayload = await linkResponse.json();
      if (!linkResponse.ok) {
        throw new Error(toErrorMessage(linkPayload, "Failed to link new budget line item"));
      }

      const linked = normalizeLinkedRecord(linkPayload.linkedBudgetLineItem);
      if (linked) {
        onChange(itemId, linked);
      }

      const option = normalizeLinkedRecord(createdPayload);
      if (option) {
        setLineItems((current) => {
          const withoutDup = current.filter((entry) => entry.id !== option.id);
          return [{ ...option, linkedSessionRequirement: { sessionId, requirementItemId: itemId } }, ...withoutDup];
        });
      }

      setShowCreateFields(false);
      setIsChanging(false);
      setSearchValue("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create budget line item");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="ml-6 mt-1.5 space-y-1.5 border-l border-slate-200 pl-2">
      {linkedBudgetLineItem ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="truncate">
              Budget linked: {linkedBudgetLineItem.lineItem}
              {" • "}
              {linkedBudgetLineItem.category}
              {linkedBudgetLineItem.subcategory ? ` / ${linkedBudgetLineItem.subcategory}` : ""}
              {" • "}
              F {formatCompactMoney(linkedBudgetLineItem.forecastCents)}
              {" · "}
              A {formatCompactMoney(linkedBudgetLineItem.actualCents)}
              {" • "}
              {linkedBudgetLineItem.status.toLowerCase()}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsChanging(true)}
            disabled={disabled || isSaving || showPicker}
            className="text-[10px] font-semibold text-slate-500 hover:text-[#28439A] disabled:opacity-50"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => {
              void unlinkBudgetLineItem();
            }}
            disabled={disabled || isSaving}
            className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
          >
            Unlink
          </button>
        </div>
      ) : null}

      {showPicker ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          <div className="relative">
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search all budget line items…"
              disabled={isSaving}
              className="h-8 w-full rounded-md border border-slate-200 px-2 text-[12px] outline-none focus:border-slate-300"
            />
            {isLoading ? (
              <Loader2 className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
            ) : null}
          </div>

          {!searchValue.trim() && preferredCategory ? (
            <p className="text-[10px] text-slate-500">
              Showing {preferredCategory} matches first (line item / subcategory). Search to find any line item.
            </p>
          ) : !searchValue.trim() && !preferredCategory && preferredSubcategory ? (
            <p className="text-[10px] text-slate-500">
              Showing best name/category matches for this item first. Search to find any line item.
            </p>
          ) : null}

          {errorMessage ? <p className="text-[11px] font-medium text-rose-600">{errorMessage}</p> : null}

          {!isLoading ? (
            <div className="max-h-48 overflow-y-auto rounded-md border border-slate-100">
              {filteredLineItems.length > 0 ? filteredLineItems.map((lineItem) => {
                const alreadyLinked = Boolean(
                  lineItem.linkedSessionRequirement && lineItem.id !== linkedBudgetLineItem?.id,
                );
                return (
                  <button
                    key={lineItem.id}
                    type="button"
                    onClick={() => {
                      if (!alreadyLinked) void linkBudgetLineItem(lineItem);
                    }}
                    disabled={isSaving || alreadyLinked}
                    className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-2 py-1.5 text-left last:border-b-0 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold text-slate-700">{lineItem.lineItem}</span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {lineItem.category}
                        {lineItem.subcategory ? ` / ${lineItem.subcategory}` : ""}
                        {" • "}
                        F {formatCompactMoney(lineItem.forecastCents)}
                        {" · "}
                        A {formatCompactMoney(lineItem.actualCents)}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${alreadyLinked ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {alreadyLinked ? "In use" : lineItem.status.toLowerCase()}
                    </span>
                  </button>
                );
              }) : (
                <p className="px-2 py-3 text-[11px] text-slate-500">No budget line items found.</p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Loading budget line items…</p>
          )}

          {linkedBudgetLineItem && isChanging ? (
            <button
              type="button"
              onClick={() => {
                setIsChanging(false);
                setErrorMessage(null);
                setSearchValue("");
              }}
              disabled={disabled || isSaving}
              className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              Done
            </button>
          ) : null}

          <div className="border-t border-slate-100 pt-2">
            {!showCreateFields ? (
              <button
                type="button"
                onClick={() => setShowCreateFields(true)}
                disabled={disabled || isSaving}
                className="text-[10px] font-semibold text-[#28439A] hover:underline disabled:opacity-50"
              >
                + New budget line &amp; link
              </button>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-slate-600">Create line (prefilled from requirement)</p>
                <div className="grid gap-1">
                  <div className="grid grid-cols-2 gap-1">
                    <input
                      value={createCategory}
                      onChange={(event) => setCreateCategory(event.target.value)}
                      placeholder="Category"
                      disabled={isSaving}
                      className="h-7 rounded border border-slate-200 px-1.5 text-[11px] outline-none focus:border-slate-300"
                    />
                    <input
                      value={createSubcategory}
                      onChange={(event) => setCreateSubcategory(event.target.value)}
                      placeholder="Subcategory"
                      disabled={isSaving}
                      className="h-7 rounded border border-slate-200 px-1.5 text-[11px] outline-none focus:border-slate-300"
                    />
                  </div>
                  <input
                    value={createLineName}
                    onChange={(event) => setCreateLineName(event.target.value)}
                    placeholder="Line item name"
                    disabled={isSaving}
                    className="h-7 rounded border border-slate-200 px-1.5 text-[11px] outline-none focus:border-slate-300"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void createBudgetLineAndLink();
                    }}
                    disabled={disabled || isSaving || !createLineName.trim()}
                    className="inline-flex h-7 items-center rounded border border-slate-200 bg-slate-50 px-2 text-[10px] font-semibold text-slate-800 hover:bg-white disabled:opacity-50"
                  >
                    {isSaving ? "Saving…" : "Create & link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateFields(false);
                      setErrorMessage(null);
                    }}
                    disabled={isSaving}
                    className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
