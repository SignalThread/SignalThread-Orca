"use client";

import { type Dispatch, type SetStateAction, useMemo, useState } from "react";

import {
  budgetCategoryForSessionRequirementCatalogType,
  type SessionRequirementCatalogType,
} from "@/lib/session-requirement-catalog";

import type { Matrix2RequirementSection, Matrix2Session } from "./types";

type LinkedBudgetLineItem = NonNullable<Matrix2Session["requirementSelections"][number]["linkedBudgetLineItem"]>;

export type EventBudgetLineItemRow = {
  id: string;
  lineItem: string;
  category: string;
  subcategory: string;
  forecastCents: number;
  actualCents: number;
  status: string;
  sortOrder: number;
  matrixRowId: string | null;
  linkedSessionRequirement: {
    sessionId: string;
    requirementItemId: string;
  } | null;
};

const compactMoneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCompactMoney(cents: number): string {
  return compactMoneyFormatter.format(cents / 100);
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return fallback;
}

const STAFFING_BUDGET_ALIASES = new Set([
  "staffing",
  "staff",
  "crew",
  "labor",
  "labour",
  "personnel",
  "people",
  "hr",
  "human resource",
  "human resources",
]);

function normalizeBudgetTaxonomyField(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function staffingFieldMatchesAliases(normalizedField: string, mappedLower: string): boolean {
  if (!normalizedField) return false;
  if (normalizedField === mappedLower) return true;
  if (STAFFING_BUDGET_ALIASES.has(normalizedField)) return true;
  const tokens = normalizedField.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) => STAFFING_BUDGET_ALIASES.has(token));
}

function lineMatchesMappedSection(
  lineCategory: string,
  lineSubcategory: string,
  sectionType: SessionRequirementCatalogType,
): boolean {
  const mapped = budgetCategoryForSessionRequirementCatalogType(sectionType);
  if (!mapped) return false;
  const mappedLower = normalizeBudgetTaxonomyField(mapped);
  const cat = normalizeBudgetTaxonomyField(lineCategory);
  const sub = normalizeBudgetTaxonomyField(lineSubcategory);

  if (sectionType === "STAFFING") {
    return staffingFieldMatchesAliases(cat, mappedLower) || staffingFieldMatchesAliases(sub, mappedLower);
  }

  return cat === mappedLower;
}

export function sectionHasOperationalBudgetRows(
  sectionType: SessionRequirementCatalogType,
  budgetLineItems: EventBudgetLineItemRow[],
  sessionId?: string,
): boolean {
  return budgetLineItems.some((line) =>
    (!sessionId || line.matrixRowId === null || line.matrixRowId === sessionId)
    && lineMatchesMappedSection(line.category, line.subcategory, sectionType),
  );
}

export function operationalBudgetLinesForSection(
  sectionType: SessionRequirementCatalogType,
  budgetLineItems: EventBudgetLineItemRow[],
  sessionId?: string,
): EventBudgetLineItemRow[] {
  return budgetLineItems
    .filter((line) =>
      (!sessionId || line.matrixRowId === null || line.matrixRowId === sessionId)
      && lineMatchesMappedSection(line.category, line.subcategory, sectionType),
    )
    .sort((left, right) => {
      const orderDiff = left.sortOrder - right.sortOrder;
      if (orderDiff !== 0) return orderDiff;
      return left.lineItem.localeCompare(right.lineItem);
    });
}

export function sectionShouldUseOperationalBudgetRows(
  section: Matrix2RequirementSection,
  sectionType: SessionRequirementCatalogType,
  budgetLineItems: EventBudgetLineItemRow[],
  selectedRequirementValues: Record<string, string>,
  linkedBudgetLineItemsByItemId: Map<string, LinkedBudgetLineItem>,
  sessionId?: string,
): boolean {
  if (sectionType === "AV") {
    return false;
  }
  if (!sectionHasOperationalBudgetRows(sectionType, budgetLineItems, sessionId)) {
    return false;
  }
  const hasAbstractSelectionWithoutBudgetLink = section.items.some(
    (item) =>
      item.active
      && Object.prototype.hasOwnProperty.call(selectedRequirementValues, item.id)
      && !linkedBudgetLineItemsByItemId.has(item.id),
  );
  return !hasAbstractSelectionWithoutBudgetLink;
}

function allocateUnusedTemplateItemId(
  section: Matrix2RequirementSection,
  selectedRequirementValues: Record<string, string>,
): string | null {
  const activeItems = section.items
    .filter((item) => item.active)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  for (const item of activeItems) {
    if (!Object.prototype.hasOwnProperty.call(selectedRequirementValues, item.id)) {
      return item.id;
    }
  }
  return null;
}

function findItemIdForBudgetLine(
  budgetLineId: string,
  linkedBudgetLineItemsByItemId: Map<string, LinkedBudgetLineItem>,
  session: Matrix2Session,
): string | null {
  for (const [itemId, linked] of linkedBudgetLineItemsByItemId) {
    if (linked.id === budgetLineId) return itemId;
  }
  const fromSession = session.requirementSelections.find(
    (selection) => selection.linkedBudgetLineItem?.id === budgetLineId,
  );
  return fromSession?.itemId ?? null;
}

function templateItemFor(
  section: Matrix2RequirementSection,
  itemId: string | null,
): Matrix2RequirementSection["items"][number] | null {
  if (!itemId) return null;
  return section.items.find((item) => item.id === itemId) ?? null;
}

export function OperationalBudgetRequirementRows({
  eventId,
  sessionId,
  session,
  section,
  sectionType,
  budgetLineItems,
  selectedRequirementValues,
  onChangeSelectedRequirementValues,
  linkedBudgetLineItemsByItemId,
  onBudgetLinkChange,
  onRefreshBudgetLineItems,
  customItemDraft,
  customItemError,
  isSavingCustomItem,
  onCustomItemDraftChange,
  onCreateCustomItem,
  disabled,
}: {
  eventId: string;
  sessionId: string;
  session: Matrix2Session;
  section: Matrix2RequirementSection;
  sectionType: SessionRequirementCatalogType;
  budgetLineItems: EventBudgetLineItemRow[];
  selectedRequirementValues: Record<string, string>;
  onChangeSelectedRequirementValues: Dispatch<SetStateAction<Record<string, string>>>;
  linkedBudgetLineItemsByItemId: Map<string, LinkedBudgetLineItem>;
  onBudgetLinkChange: (itemId: string, linkedBudgetLineItem: LinkedBudgetLineItem | null) => void;
  onRefreshBudgetLineItems: () => Promise<void>;
  customItemDraft: string;
  customItemError: string | null;
  isSavingCustomItem: boolean;
  onCustomItemDraftChange: (sectionId: string, value: string) => void;
  onCreateCustomItem: (sectionId: string) => void;
  disabled: boolean;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingLineId, setWorkingLineId] = useState<string | null>(null);

  const lines = useMemo(
    () => operationalBudgetLinesForSection(sectionType, budgetLineItems, sessionId),
    [budgetLineItems, sectionType, sessionId],
  );

  const hasFreeTemplateSlot = useMemo(
    () => allocateUnusedTemplateItemId(section, selectedRequirementValues) !== null,
    [section, selectedRequirementValues],
  );

  async function handleToggle(line: EventBudgetLineItemRow, nextChecked: boolean) {
    setErrorMessage(null);
    const itemId = findItemIdForBudgetLine(line.id, linkedBudgetLineItemsByItemId, session);

    if (!nextChecked) {
      if (!itemId) return;
      setWorkingLineId(line.id);
      try {
        const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${sessionId}/requirements/${itemId}`, {
          method: "DELETE",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(toErrorMessage(payload, "Failed to clear requirement"));
        }
        onChangeSelectedRequirementValues((previous) => {
          const nextValues = { ...previous };
          delete nextValues[itemId];
          return nextValues;
        });
        onBudgetLinkChange(itemId, null);
        await onRefreshBudgetLineItems();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to clear requirement");
      } finally {
        setWorkingLineId(null);
      }
      return;
    }

    const templateItemId = allocateUnusedTemplateItemId(section, selectedRequirementValues);
    if (!templateItemId) {
      setErrorMessage("All template slots are in use. Add more items in Session Requirements settings.");
      return;
    }

    const templateItem = section.items.find((item) => item.id === templateItemId);
    const defaultQuantity = templateItem?.hasQuantity ? "1" : "";

    setWorkingLineId(line.id);
    try {
      onChangeSelectedRequirementValues((previous) => ({
        ...previous,
        [templateItemId]: defaultQuantity,
      }));

      const response = await fetch(
        `/api/events/${eventId}/matrix-2/sessions/${sessionId}/requirements/${templateItemId}/budget-link`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budgetLineItemId: line.id }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        onChangeSelectedRequirementValues((previous) => {
          const nextValues = { ...previous };
          delete nextValues[templateItemId];
          return nextValues;
        });
        throw new Error(toErrorMessage(payload, "Failed to link budget line"));
      }

      const linked = payload.linkedBudgetLineItem as LinkedBudgetLineItem | null | undefined;
      if (linked) {
        onBudgetLinkChange(templateItemId, linked);
      }
      await onRefreshBudgetLineItems();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to link budget line");
    } finally {
      setWorkingLineId(null);
    }
  }

  return (
    <div className="space-y-2">
      {errorMessage ? <p className="text-[12px] font-medium text-rose-600">{errorMessage}</p> : null}
      {!hasFreeTemplateSlot ? (
        <p className="text-[11px] text-slate-500">
          All configured requirement slots are selected. Add checklist items in settings to select more budget lines.
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {lines.map((line) => {
          const itemId = findItemIdForBudgetLine(line.id, linkedBudgetLineItemsByItemId, session);
          const checked = Boolean(itemId && Object.prototype.hasOwnProperty.call(selectedRequirementValues, itemId));
          const blockedElsewhere = Boolean(
            line.linkedSessionRequirement && line.linkedSessionRequirement.sessionId !== sessionId,
          );
          const templateItem = templateItemFor(section, itemId);

          return (
            <div key={line.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex items-center gap-2">
                <input
                  id={`op-req-${line.id}`}
                  type="checkbox"
                  checked={checked}
                  disabled={
                    disabled
                    || workingLineId !== null
                    || blockedElsewhere
                    || (!checked && !hasFreeTemplateSlot)
                  }
                  onChange={(event) => {
                    void handleToggle(line, event.target.checked);
                  }}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]"
                />
                <label htmlFor={`op-req-${line.id}`} className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-slate-800">{line.lineItem}</span>
                  <span className="block text-[11px] text-slate-500">
                    {line.category}
                    {line.subcategory ? ` / ${line.subcategory}` : ""}
                    {" · "}
                    F {formatCompactMoney(line.forecastCents)}
                    {" · "}
                    A {formatCompactMoney(line.actualCents)}
                    {" · "}
                    {line.status.toLowerCase()}
                  </span>
                </label>
                {templateItem?.hasQuantity ? (
                  <input
                    type="number"
                    min={1}
                    disabled={!checked || disabled || workingLineId !== null}
                    value={itemId ? selectedRequirementValues[itemId] ?? "" : ""}
                    onChange={(event) => {
                      if (!itemId) return;
                    onChangeSelectedRequirementValues((previous) => ({
                      ...previous,
                      [itemId]: event.target.value,
                    }));
                    }}
                    className="h-8 w-16 shrink-0 rounded-md border border-slate-200 px-2 text-[12px] outline-none focus:border-slate-300 disabled:bg-slate-100"
                    placeholder="#"
                  />
                ) : null}
              </div>
              {blockedElsewhere ? (
                <p className="mt-1 text-[10px] text-amber-700">Linked on another session — cannot select here.</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateCustomItem(section.id);
        }}
      >
        <input
          value={customItemDraft}
          onChange={(event) => onCustomItemDraftChange(section.id, event.target.value)}
          placeholder="+ Add custom taxonomy item (settings)"
          disabled={disabled || isSavingCustomItem}
          className="h-9 min-w-0 flex-1 rounded-lg border border-dashed border-slate-200 px-3 text-[13px] outline-none focus:border-slate-300 disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={disabled || isSavingCustomItem || !customItemDraft.trim()}
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isSavingCustomItem ? "Adding..." : "Add"}
        </button>
        {customItemError ? <p className="basis-full text-[12px] font-medium text-rose-600">{customItemError}</p> : null}
      </form>
    </div>
  );
}
