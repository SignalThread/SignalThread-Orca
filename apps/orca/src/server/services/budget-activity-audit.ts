import type { BudgetLineItem } from "@prisma/client";
import type { EventActivityActorInput, EventActivityChange } from "@/src/server/services/event-activity";

/**
 * Helpers for recording Budget mutations into the canonical EventActivity feed.
 * Pure and framework-free so the diff/format logic is unit-testable. BudgetActivity,
 * BudgetVersion, BudgetApproval and BudgetSubmission remain their own domain history;
 * these helpers only shape the event-scoped audit entries.
 */

/** An authenticated actor context, or null for system-initiated writes. */
export type BudgetAuditActor = { id: string } | null | undefined;

export function budgetActor(actor: BudgetAuditActor): EventActivityActorInput {
  return actor?.id ? { kind: "USER", userId: actor.id } : { kind: "SYSTEM", label: "System" };
}

/** Format integer cents as a precise currency string, e.g. 123456 -> "$1,234.56". */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, "0");
  const grouped = dollars.toLocaleString("en-US");
  return `${negative ? "-" : ""}$${grouped}.${remainder}`;
}

type LineItemUpdate = {
  category?: string;
  subcategory?: string;
  lineItem?: string;
  vendor?: string | null;
  forecastCents?: number;
  actualCents?: number;
  status?: string;
  approval?: string;
};

const MONEY_FIELDS = new Set(["forecastCents", "actualCents"]);

const FIELD_LABELS: Record<string, string> = {
  category: "Category",
  subcategory: "Subcategory",
  lineItem: "Line item",
  vendor: "Vendor",
  forecastCents: "Forecast",
  actualCents: "Actual",
  status: "Status",
  approval: "Approval",
};

/**
 * Build meaningful, changed-only diffs between the existing line item and an
 * update payload. Money fields are rendered with preserved precision. Only fields
 * present in `next` are considered, and unchanged values are omitted. No full
 * record is ever serialized.
 */
export function buildLineItemDiff(before: BudgetLineItem, next: LineItemUpdate): EventActivityChange[] {
  const changes: EventActivityChange[] = [];
  const keys = Object.keys(next) as (keyof LineItemUpdate)[];

  for (const key of keys) {
    const nextValue = next[key];
    if (nextValue === undefined) continue;
    const beforeValue = (before as unknown as Record<string, unknown>)[key];

    // Normalize for comparison (nulls and numbers compare cleanly).
    if (String(beforeValue ?? "") === String(nextValue ?? "")) continue;

    if (MONEY_FIELDS.has(key)) {
      changes.push({
        field: key,
        label: FIELD_LABELS[key],
        from: formatCents(beforeValue as number | null),
        to: formatCents(nextValue as number | null),
      });
    } else {
      changes.push({
        field: key,
        label: FIELD_LABELS[key] ?? key,
        from: (beforeValue as string | null) ?? null,
        to: (nextValue as string | null) ?? null,
      });
    }
  }

  return changes;
}
