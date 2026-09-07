"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ColumnHeaderDragHandle,
  useColumnHeaderReorder,
  usePersistedColumnOrder,
  type ColumnOrderItem,
} from "@/components/column-order-control";
import { BudgetImportAction, downloadBudgetImportTemplate } from "./budget-import-action";
import {
  ChevronDown,
  Check,
  Circle,
  FileText,
  Clock3,
  Filter,
  Download,
  ExternalLink,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type CategoryFooterTotal,
  type SessionFooterTotal,
} from "@/lib/budget-session-group-filter";
import { budgetGroupTagClasses, normalizedBudgetGroupName } from "@/lib/budget-group-colors";
import { computeOverlayTotals } from "@/lib/budget-overlay-totals";
import { parseBudgetCurrencyToCents } from "@/lib/budget-money";
import {
  addBudgetCategoryFilterOption,
  BUDGET_CATEGORY_OPTIONS,
  budgetCategoryPillClasses,
  budgetCategoriesMatch,
  compareBudgetCategories,
  getBudgetCategoryDisplay,
  normalizeBudgetCategoryForStorage,
} from "@/lib/budget-category-filter";
import {
  BULK_ACTION_BAR_CLASS,
  BULK_CLEAR_BUTTON_CLASS,
  BULK_CONTROL_CLASS,
  BULK_DELETE_BUTTON_CLASS,
  BULK_SELECTED_COUNT_CLASS,
  BULK_SELECTED_ROW_CLASS,
  BULK_SUCCESS_TOAST_CLASS,
  TABLE_CONTROL_BUTTON_CLASS,
  TABLE_FILTER_CONTROL_CLASS,
  TABLE_FILTER_PANEL_CLASS,
  TABLE_SEARCH_FIELD_CLASS,
} from "@/lib/bulk-edit-ui";

const BUDGET_DEBUG_LOGS_ENABLED = ["1", "true", "yes", "on"].includes(
  (process.env.NEXT_PUBLIC_BUDGET_DEBUG_LOGS ?? "").trim().toLowerCase(),
);

function debugBudgetClientLog(message: string, details: Record<string, unknown>): void {
  if (!BUDGET_DEBUG_LOGS_ENABLED) return;
  console.info(message, details);
}

type EventOption = {
  id: string;
  name: string;
};

type BudgetSessionOption = {
  id: string;
  title: string;
};

type BudgetGroupOption = {
  id: string;
  name: string;
  color: string | null;
};

export type FullBudgetGridProps = {
  eventIdOverride?: string;
  hideEventSelector?: boolean;
};

type UserMini = {
  id: string;
  name: string | null;
  email: string;
};

type BudgetStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type BudgetSubmissionStatus = "SUBMITTED" | "PULLED_BACK" | "APPROVED" | "REJECTED";
type LineItemStatus = "PLANNED" | "COMMITTED" | "PAID";
type LineItemApproval = "PENDING" | "APPROVED";
type ActivityType = "SUBMITTED" | "APPROVED" | "REJECTED" | "REVISED";
type BudgetColumnId =
  | "session"
  | "group"
  | "forecast"
  | "actual"
  | "variance"
  | "vendor"
  | "docs"
  | "status"
  | "approval";

const BUDGET_LINE_ITEM_COLUMNS: ColumnOrderItem<BudgetColumnId>[] = [
  { id: "session", label: "Session" },
  { id: "group", label: "Group" },
  { id: "forecast", label: "Forecast" },
  { id: "actual", label: "Actual" },
  { id: "variance", label: "Variance" },
  { id: "vendor", label: "Vendor" },
  { id: "docs", label: "Docs" },
  { id: "status", label: "Status" },
  { id: "approval", label: "Approval" },
];

const BUDGET_COLUMN_WIDTHS: Record<BudgetColumnId, number> = {
  session: 150,
  group: 150,
  forecast: 132,
  actual: 132,
  variance: 105,
  vendor: 125,
  docs: 50,
  status: 115,
  approval: 115,
};

type BudgetRecord = {
  id: string;
  eventId: string;
  currentVersionId?: string | null;
  status: BudgetStatus;
  submittedAt: string | null;
  submittedByUserId: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  rejectedAt: string | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  lockedAt: string | null;
  submittedByUser: UserMini | null;
  approvedByUser: UserMini | null;
  rejectedByUser: UserMini | null;
};

type BudgetLineItem = {
  id: string;
  budgetId: string;
  category: string;
  subcategory: string;
  lineItem: string;
  vendor: string | null;
  // Persisted canonical session (MatrixRow) link + denormalized title for display.
  matrixRowId: string | null;
  sessionTitle: string | null;
  // Persisted user-defined group link + denormalized name for display.
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  forecastCents: number;
  actualCents: number;
  status: LineItemStatus;
  approval: LineItemApproval;
  sortOrder: number;
  documentCount: number;
  firstDocumentId: string | null;
  linkedSessionRequirement: {
    sessionId: string;
    sessionTitle: string | null;
    requirementItemId: string;
    requirementItemName: string;
    requirementSectionId: string;
    requirementSectionName: string;
    requirementQuantity: number | null;
  } | null;
};

type BudgetSubmissionSummary = {
  id: string;
  budgetId: string;
  budgetVersionId: string;
  status: BudgetSubmissionStatus;
  submittedAt: string;
  submittedByUser: UserMini;
  pulledBackAt: string | null;
  pulledBackByUser: UserMini | null;
  message: string | null;
  recipients: UserMini[];
  lineItems: BudgetLineItem[];
  lineItemIds?: string[];
};

type BudgetActivity = {
  id: string;
  budgetId: string;
  type: ActivityType;
  actorUserId: string | null;
  note: string | null;
  createdAt: string;
  actorUser: UserMini | null;
};

type BudgetResponse = {
  budget: BudgetRecord;
  lineItems: BudgetLineItem[];
  // Authoritative count over the full budget from the (possibly light) snapshot.
  // Optional so older cached shapes still typecheck; treated as 0 when absent.
  lineItemCount?: number;
  activity: BudgetActivity[];
  submissions: BudgetSubmissionSummary[];
  submissionRecipients: UserMini[];
  totals: {
    totalForecastCents: number;
    totalActualCents: number;
    varianceCents: number;
    percentUnder: number;
  };
};

type BudgetNotice = {
  tone: "success" | "info";
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type NewBudgetRowUndo = {
  item: BudgetLineItem;
  amountDraft: AmountDraft;
  textDraft: LineItemTextDraft;
};

type AmountDraft = {
  forecast: string;
  actual: string;
};

type LineItemTextDraft = {
  category: string;
  subcategory: string;
  lineItem: string;
  vendor: string;
  status: LineItemStatus;
};

type LineItemPatch = {
  category?: string;
  subcategory?: string;
  lineItem?: string;
  vendor?: string | null;
  forecastCents?: number;
  actualCents?: number;
  status?: LineItemStatus;
};

const EMPTY_SUBMISSIONS: BudgetSubmissionSummary[] = [];
const EMPTY_LINE_ITEMS: BudgetLineItem[] = [];

type SubmissionThreadOption = {
  lineItemId: string;
  latestSubmission: BudgetSubmissionSummary;
  budgetLineItem: BudgetLineItem | null;
};

const CATEGORY_OPTIONS = [...BUDGET_CATEGORY_OPTIONS];
const CATEGORY_OPTION_SET = new Set<string>(CATEGORY_OPTIONS);
const STATUS_OPTIONS: LineItemStatus[] = ["PLANNED", "COMMITTED", "PAID"];
const LINE_ITEMS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
// Server-side pagination default: ship one small page on first load instead of
// every line item. (Budget deep performance / Prompt 8.)
const LINE_ITEMS_DEFAULT_PAGE_SIZE = 10;

// User-facing sortable columns (server-backed once the grid is server-paged, so
// page boundaries stay stable). Keys mirror the paged line-items endpoint.
type LineItemSortColumn =
  | "sortOrder"
  | "category"
  | "vendor"
  | "forecastCents"
  | "actualCents"
  | "status"
  | "approval";
type SortDirection = "asc" | "desc";

const SERVER_EMPTY_FOOTER_TOTALS = { forecastCents: 0, actualCents: 0, varianceCents: 0 } as const;
const APPROVAL_FILTER_OPTIONS: LineItemApproval[] = ["PENDING", "APPROVED"];
const TEMP_LINE_ITEM_ID_PREFIX = "new-budget-line-item-";

function normalizeOptionalLineItemStatusFilter(value: string | null): LineItemStatus | "" {
  const normalized = value?.trim().toUpperCase() ?? "";
  return STATUS_OPTIONS.includes(normalized as LineItemStatus) ? (normalized as LineItemStatus) : "";
}

function normalizeOptionalLineItemApprovalFilter(value: string | null): LineItemApproval | "" {
  const normalized = value?.trim().toUpperCase() ?? "";
  return APPROVAL_FILTER_OPTIONS.includes(normalized as LineItemApproval) ? (normalized as LineItemApproval) : "";
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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

function parseDownloadFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return fallback;
}

function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function toCurrencyInput(cents: number): string {
  return formatMoney(cents);
}

function parseCurrencyToCents(value: string): number | null {
  if (!value.replace(/[$,\s]/g, "").trim()) return 0;
  return parseBudgetCurrencyToCents(value);
}

function defaultAmountDraft(item: BudgetLineItem): AmountDraft {
  return {
    forecast: toCurrencyInput(item.forecastCents),
    actual: toCurrencyInput(item.actualCents),
  };
}

function defaultLineItemDraft(item: BudgetLineItem): LineItemTextDraft {
  return {
    category: getBudgetCategoryDisplay(item.category),
    subcategory: item.subcategory,
    lineItem: item.lineItem,
    vendor: item.vendor ?? "",
    status: item.status,
  };
}

function isTemporaryLineItemId(lineItemId: string): boolean {
  return lineItemId.startsWith(TEMP_LINE_ITEM_ID_PREFIX);
}

function createTemporaryLineItem(budgetId: string): BudgetLineItem {
  return {
    id: `${TEMP_LINE_ITEM_ID_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    budgetId,
    category: CATEGORY_OPTIONS[0],
    subcategory: "General",
    lineItem: "",
    vendor: null,
    matrixRowId: null,
    sessionTitle: null,
    groupId: null,
    groupName: null,
    groupColor: null,
    forecastCents: 0,
    actualCents: 0,
    status: "PLANNED",
    approval: "PENDING",
    sortOrder: -1,
    documentCount: 0,
    firstDocumentId: null,
    linkedSessionRequirement: null,
  };
}

function buildLineItemPatch(
  item: BudgetLineItem,
  amountDraft: AmountDraft,
  textDraft: LineItemTextDraft,
): { invalidMessage: string | null; patch: LineItemPatch | null } {
  const result = buildLineItemPayload(amountDraft, textDraft);
  if (result.invalidMessage || !result.payload) {
    return {
      invalidMessage: result.invalidMessage,
      patch: null,
    };
  }

  const { category, subcategory, lineItem, vendor, status, forecastCents, actualCents } = result.payload;
  const patch: LineItemPatch = {};

  if (!budgetCategoriesMatch(category, item.category)) patch.category = category;
  if (subcategory !== item.subcategory) patch.subcategory = subcategory;
  if (lineItem !== item.lineItem) patch.lineItem = lineItem;
  if (vendor !== (item.vendor ?? null)) patch.vendor = vendor;
  if (status !== item.status) patch.status = status;
  if (forecastCents !== item.forecastCents) patch.forecastCents = forecastCents;
  if (actualCents !== item.actualCents) patch.actualCents = actualCents;

  return {
    invalidMessage: null,
    patch: Object.keys(patch).length > 0 ? patch : null,
  };
}

function buildLineItemPayload(
  amountDraft: AmountDraft,
  textDraft: LineItemTextDraft,
): {
  invalidMessage: string | null;
  payload: (LineItemPatch & {
    category: string;
    subcategory: string;
    lineItem: string;
    forecastCents: number;
    actualCents: number;
    status: LineItemStatus;
  }) | null;
} {
  const forecastCents = parseCurrencyToCents(amountDraft.forecast);
  const actualCents = parseCurrencyToCents(amountDraft.actual);
  if (forecastCents === null || actualCents === null) {
    return {
      invalidMessage: "Amounts must be valid non-negative numbers.",
      payload: null,
    };
  }

  const category = normalizeBudgetCategoryForStorage(textDraft.category);
  const subcategory = textDraft.subcategory.trim();
  const lineItem = textDraft.lineItem.trim();
  const vendor = textDraft.vendor.trim();

  if (!category || !subcategory || !lineItem) {
    return {
    invalidMessage: "Line Item, Category, and Subcategory are required.",
      payload: null,
    };
  }

  return {
    invalidMessage: null,
    payload: {
      category,
      subcategory,
      lineItem,
      vendor: vendor.length > 0 ? vendor : null,
      forecastCents,
      actualCents,
      status: textDraft.status,
    },
  };
}

function applyOptimisticAmounts(
  item: BudgetLineItem,
  amountDrafts: Record<string, AmountDraft>,
): BudgetLineItem {
  const amountDraft = amountDrafts[item.id];
  if (!amountDraft) return item;

  const forecastCents = parseCurrencyToCents(amountDraft.forecast);
  const actualCents = parseCurrencyToCents(amountDraft.actual);

  return {
    ...item,
    forecastCents: forecastCents ?? item.forecastCents,
    actualCents: actualCents ?? item.actualCents,
  };
}

// A parent-owned dirty-overlay entry: the committed (last-saved) row captured the
// moment a row first became dirty. The full committed item lets save-all/discard
// reconstruct an off-page dirty row that is no longer loaded; the committed
// forecast/actual anchor the global-total delta math (see computeOverlayTotals).
type DirtyOverlayEntry = {
  committedItem: BudgetLineItem;
  committedForecastCents: number;
  committedActualCents: number;
};

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

function userDisplayName(user: UserMini | null): string {
  if (!user) return "Unknown User";
  return user.name?.trim() || user.email;
}

function statusBadgeClasses(status: BudgetStatus): string {
  if (status === "SUBMITTED") return "border border-amber-200 bg-amber-50 text-amber-800";
  if (status === "APPROVED") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "border border-rose-200 bg-rose-50 text-rose-700";
  return "border border-slate-200 bg-slate-100 text-slate-700";
}

function statusPillClasses(status: LineItemStatus): string {
  if (status === "COMMITTED") return "bg-blue-100 text-blue-700";
  if (status === "PAID") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

function categoryPillClasses(category: string): string {
  return budgetCategoryPillClasses(category);
}

function normalizedGroupName(value: string): string {
  return normalizedBudgetGroupName(value);
}

function submissionStatusBadgeClasses(status: BudgetSubmissionStatus): string {
  if (status === "SUBMITTED") return "border border-amber-200 bg-amber-50 text-amber-800";
  if (status === "APPROVED") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "border border-rose-200 bg-rose-50 text-rose-700";
  return "border border-slate-200 bg-slate-100 text-slate-700";
}

const BudgetGroupSelectCell = memo(function BudgetGroupSelectCell({
  item,
  groups,
  readOnly,
  onAssign,
  onDelete,
}: {
  item: BudgetLineItem;
  groups: BudgetGroupOption[];
  readOnly: boolean;
  onAssign: (item: BudgetLineItem, rawName: string) => void;
  onDelete: (group: BudgetGroupOption) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const currentGroup = item.groupId ? groups.find((group) => group.id === item.groupId) ?? null : null;
  const groupName = currentGroup?.name ?? item.groupName;
  const groupColor = currentGroup?.color ?? item.groupColor;
  const normalizedQuery = normalizedGroupName(query);
  const matchingGroups = groups.filter((group) => normalizedGroupName(group.name).includes(normalizedQuery));
  const exactMatch = groups.some((group) => normalizedGroupName(group.name) === normalizedQuery);
  const canCreate = normalizedQuery.length > 0 && !exactMatch;

  const updateMenuRect = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(260, rect.width),
    });
  }, []);

  const openMenu = () => {
    if (readOnly) return;
    setQuery("");
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      updateMenuRect();
      inputRef.current?.focus();
    });
  };

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  const assignAndClose = (rawName: string) => {
    onAssign(item, rawName);
    closeMenu();
  };

  useEffect(() => {
    if (!isOpen) return;

    updateMenuRect();
    const handleScrollOrResize = () => updateMenuRect();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closeMenu, isOpen, updateMenuRect]);

  if (readOnly) {
    return groupName ? (
      <span
        className={`inline-flex h-8 max-w-full min-w-0 items-center rounded-full border px-2.5 text-[12px] font-semibold ${budgetGroupTagClasses(item.groupId, groupName, groupColor)}`}
      >
        <span className="mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        <span className="truncate">{groupName}</span>
      </span>
    ) : (
      <span className="inline-flex h-8 items-center text-[12px] text-slate-400">—</span>
    );
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-label={`Group for ${item.lineItem}`}
      onClick={(event) => {
        event.stopPropagation();
        openMenu();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={`inline-flex h-8 w-full min-w-0 items-center rounded-full border px-2.5 text-left text-[12px] font-semibold ${budgetGroupTagClasses(item.groupId, groupName, groupColor)}`}
    >
      <span className="mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{groupName ?? "Add group"}</span>
      <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0" aria-hidden />
    </button>
  );

  const menu = isOpen && menuRect && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className="fixed z-[80] rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeMenu();
              if (event.key === "Enter" && canCreate) {
                event.preventDefault();
                assignAndClose(query);
              }
            }}
            placeholder="Search or create group"
            className="mb-2 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px] text-slate-700 outline-none focus:border-slate-300"
          />
          {groupName ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => assignAndClose("")}
              className="mb-1 flex h-8 w-full items-center justify-between rounded-lg px-2 text-left text-[12px] font-medium text-slate-500 hover:bg-slate-50"
            >
              Clear group
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {(normalizedQuery ? matchingGroups : groups).map((group) => (
              <div
                key={`group-menu-${item.id}-${group.id}`}
                role="menuitem"
                className="group flex h-8 w-full items-center justify-between gap-2 rounded-lg px-2 hover:bg-slate-50"
              >
                <button
                  type="button"
                  onClick={() => assignAndClose(group.name)}
                  className="flex min-w-0 flex-1 items-center text-left"
                >
                  <span className={`inline-flex min-w-0 items-center rounded-full border px-2 py-0.5 text-[12px] font-semibold ${budgetGroupTagClasses(group.id, group.name, group.color)}`}>
                    <span className="mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                    <span className="truncate">{group.name}</span>
                  </span>
                </button>
                <span className="flex shrink-0 items-center gap-1">
                  {group.id === item.groupId ? <Check className="h-3.5 w-3.5 text-slate-500" aria-hidden /> : null}
                  <button
                    type="button"
                    aria-label={`Delete group ${group.name}`}
                    title={`Delete ${group.name}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDelete(group);
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 opacity-0 outline-none hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </div>
            ))}
            {canCreate ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => assignAndClose(query)}
                className="flex h-8 w-full items-center rounded-lg px-2 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Create &quot;{query.replace(/\s+/g, " ").trim()}&quot;
              </button>
            ) : null}
            {groups.length === 0 && !canCreate ? (
              <p className="px-2 py-2 text-[12px] text-slate-500">Type a group name to create one.</p>
            ) : null}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {trigger}
      {menu}
    </>
  );
});

function BudgetGroupFilterSelect({
  value,
  groups,
  onChange,
}: {
  value: string;
  groups: BudgetGroupOption[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedGroup = groups.find((group) => group.id === value) ?? null;

  const updateMenuRect = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(220, rect.width),
    });
  }, []);

  const closeMenu = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;

    updateMenuRect();
    const handleScrollOrResize = () => updateMenuRect();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closeMenu, isOpen, updateMenuRect]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    closeMenu();
  };

  const menu = isOpen && menuRect && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
          className="fixed z-[80] rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => choose("")}
            className="mb-1 flex h-8 w-full items-center justify-between rounded-lg px-2 text-left text-[12px] font-medium text-slate-600 hover:bg-slate-50"
          >
            All groups
            {!value ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
          </button>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {groups.map((group) => (
              <button
                key={`group-filter-${group.id}`}
                type="button"
                role="menuitem"
                onClick={() => choose(group.id)}
                className="flex h-8 w-full items-center justify-between rounded-lg px-2 text-left hover:bg-slate-50"
              >
                <span className={`inline-flex min-w-0 items-center rounded-full border px-2 py-0.5 text-[12px] font-semibold ${budgetGroupTagClasses(group.id, group.name, group.color)}`}>
                  <span className="mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                  <span className="truncate">{group.name}</span>
                </span>
                {group.id === value ? <Check className="h-3.5 w-3.5 text-slate-500" aria-hidden /> : null}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Filter by group"
        title="Group"
        onClick={() => {
          setIsOpen((current) => !current);
          window.requestAnimationFrame(updateMenuRect);
        }}
        className={`inline-flex h-9 min-w-[10rem] shrink-0 items-center justify-between gap-2 rounded-lg border px-3 text-[12px] font-medium outline-none ${
          selectedGroup ? budgetGroupTagClasses(selectedGroup.id, selectedGroup.name, selectedGroup.color) : "border-slate-200/90 bg-white text-slate-600"
        }`}
      >
        <span className="truncate">{selectedGroup?.name ?? "All groups"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </button>
      {menu}
    </>
  );
}

function formatStatusLabel(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

type StepVisual = "pending" | "complete" | "review" | "rejected";
type LineItemApprovalState = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
type ApprovalDrawerMode = "global" | "lineItem";

function stepIcon(visual: StepVisual) {
  const baseClasses = "flex h-14 w-14 items-center justify-center rounded-full";

  if (visual === "complete") {
    return (
      <div className={`${baseClasses} bg-emerald-500 text-white`}>
        <Check className="h-7 w-7" />
      </div>
    );
  }

  if (visual === "review") {
    return (
      <div className={`${baseClasses} bg-amber-500 text-white`}>
        <Clock3 className="h-7 w-7" />
      </div>
    );
  }

  if (visual === "rejected") {
    return (
      <div className={`${baseClasses} bg-rose-500 text-white`}>
        <X className="h-7 w-7" />
      </div>
    );
  }

  return (
    <div className={`${baseClasses} bg-slate-200 text-slate-600`}>
      <Circle className="h-7 w-7" />
    </div>
  );
}

function stepperState(status: BudgetSubmissionStatus | BudgetStatus): {
  labels: [string, string, string];
  visuals: [StepVisual, StepVisual, StepVisual];
  connectors: ["pending" | "complete" | "rejected", "pending" | "complete" | "rejected"];
} {
  if (status === "SUBMITTED") {
    return {
      labels: ["Draft", "Submitted", "Approved"],
      visuals: ["complete", "review", "pending"],
      connectors: ["complete", "pending"],
    };
  }

  if (status === "APPROVED") {
    return {
      labels: ["Draft", "Submitted", "Approved"],
      visuals: ["complete", "complete", "complete"],
      connectors: ["complete", "complete"],
    };
  }

  if (status === "REJECTED") {
    return {
      labels: ["Draft", "Submitted", "Rejected"],
      visuals: ["complete", "complete", "rejected"],
      connectors: ["complete", "rejected"],
    };
  }

  return {
    labels: ["Draft", "Submitted", "Approved"],
    visuals: ["pending", "pending", "pending"],
    connectors: ["pending", "pending"],
  };
}

function getSubmissionTimestampMs(submission: BudgetSubmissionSummary): number {
  const timestamp = new Date(submission.submittedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getSubmissionLineItemEntries(submission: BudgetSubmissionSummary): Array<{
  budgetLineItemId: string;
  budgetLineItem: BudgetLineItem | null;
}> {
  const entries = (submission.lineItems ?? [])
    .map((lineItem) => {
      const parsed = lineItem as BudgetLineItem & {
        budgetLineItemId?: string;
        budgetLineItem?: BudgetLineItem;
      };

      const budgetLineItem = parsed.budgetLineItem ?? (parsed.id ? (parsed as BudgetLineItem) : null);
      const budgetLineItemId = parsed.budgetLineItemId ?? budgetLineItem?.id ?? parsed.id;
      if (!budgetLineItemId) return null;

      return {
        budgetLineItemId,
        budgetLineItem,
      };
    })
    .filter(
      (entry): entry is { budgetLineItemId: string; budgetLineItem: BudgetLineItem | null } => entry !== null,
    );

  for (const budgetLineItemId of submission.lineItemIds ?? []) {
    if (!entries.some((entry) => entry.budgetLineItemId === budgetLineItemId)) {
      entries.push({ budgetLineItemId, budgetLineItem: null });
    }
  }

  return Array.from(
    new Map(entries.map((entry) => [entry.budgetLineItemId, entry] as const)).values(),
  );
}

function buildSubmissionThreads(submissions: BudgetSubmissionSummary[]): Map<string, BudgetSubmissionSummary[]> {
  const threadMap = new Map<string, Map<string, BudgetSubmissionSummary>>();

  for (const submission of submissions) {
    for (const lineItem of getSubmissionLineItemEntries(submission)) {
      const existing = threadMap.get(lineItem.budgetLineItemId) ?? new Map<string, BudgetSubmissionSummary>();
      existing.set(submission.id, submission);
      threadMap.set(lineItem.budgetLineItemId, existing);
    }
  }

  const normalized = new Map<string, BudgetSubmissionSummary[]>();
  for (const [lineItemId, threadBySubmissionId] of threadMap.entries()) {
    const thread = Array.from(threadBySubmissionId.values()).sort(
      (a, b) => getSubmissionTimestampMs(b) - getSubmissionTimestampMs(a),
    );
    normalized.set(lineItemId, thread);
  }

  return normalized;
}

function getThreadBudgetLineItem(submission: BudgetSubmissionSummary, lineItemId: string): BudgetLineItem | null {
  return getSubmissionLineItemEntries(submission).find((entry) => entry.budgetLineItemId === lineItemId)?.budgetLineItem ?? null;
}

function buildSubmissionThreadOptions(submissions: BudgetSubmissionSummary[]): SubmissionThreadOption[] {
  const threads = buildSubmissionThreads(submissions);
  const options: SubmissionThreadOption[] = [];

  for (const [lineItemId, thread] of threads.entries()) {
    const latestSubmission = thread.find((submission) => submission.status !== "PULLED_BACK");
    if (!latestSubmission) continue;

    options.push({
      lineItemId,
      latestSubmission,
      budgetLineItem: getThreadBudgetLineItem(latestSubmission, lineItemId),
    });
  }

  return options.sort(
    (a, b) => getSubmissionTimestampMs(b.latestSubmission) - getSubmissionTimestampMs(a.latestSubmission),
  );
}

function submissionOptionPrimaryLabel(option: SubmissionThreadOption): string {
  return option.budgetLineItem?.lineItem?.trim() || "Untitled line item";
}

function submissionOptionSecondaryLabel(option: SubmissionThreadOption): string {
  const status = formatStatusLabel(option.latestSubmission.status);
  const submittedAt = formatTimestamp(option.latestSubmission.submittedAt) || "Unknown date";
  const submittedBy = userDisplayName(option.latestSubmission.submittedByUser);
  return `${status} · ${submittedAt} · ${submittedBy}`;
}

function resolveLineItemApprovalState(
  item: BudgetLineItem,
  thread: BudgetSubmissionSummary[] | undefined,
): LineItemApprovalState {
  const latestSubmission = (thread ?? []).find((submission) => submission.status !== "PULLED_BACK");
  if (latestSubmission?.status === "SUBMITTED") return "SUBMITTED";
  if (latestSubmission?.status === "APPROVED") return "APPROVED";
  if (latestSubmission?.status === "REJECTED") return "REJECTED";
  return item.approval === "APPROVED" ? "APPROVED" : "PENDING";
}

function lineItemApprovalBadgeClasses(state: LineItemApprovalState): string {
  if (state === "SUBMITTED") return "border border-amber-200 bg-amber-50 text-amber-800";
  if (state === "APPROVED") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (state === "REJECTED") return "border border-rose-200 bg-rose-50 text-rose-700";
  return "border border-slate-200 bg-slate-100 text-slate-700";
}

function formatLineItemApprovalLabel(state: LineItemApprovalState): string {
  if (state === "PENDING") return "Needs submission";
  if (state === "SUBMITTED") return "Submitted";
  if (state === "APPROVED") return "Approved";
  return "Rejected";
}

function isActiveApprovalOption(option: SubmissionThreadOption): boolean {
  return option.latestSubmission.status === "SUBMITTED";
}

type BudgetRowProps = {
  item: BudgetLineItem;
  columnOrder: BudgetColumnId[];
  amountDraft: AmountDraft | undefined;
  textDraft: LineItemTextDraft | undefined;
  selected: boolean;
  locked: boolean;
  readOnly: boolean;
  isNew: boolean;
  isDirty: boolean;
  isSaved: boolean;
  error: string | null;
  approvalState: LineItemApprovalState;
  approvalWorkflowEnabled: boolean;
  sessionOptions: BudgetSessionOption[];
  groupOptions: BudgetGroupOption[];
  selectedEventId: string;
  onRowClick: (event: ReactMouseEvent<HTMLTableRowElement>, lineItemId: string) => void;
  onToggleSelect: (lineItemId: string) => void;
  onMarkDirty: (lineItemId: string) => void;
  setAmountDrafts: Dispatch<SetStateAction<Record<string, AmountDraft>>>;
  setLineItemDrafts: Dispatch<SetStateAction<Record<string, LineItemTextDraft>>>;
  onAmountBlur: (item: BudgetLineItem, field: "forecastCents" | "actualCents", rawValue: string) => void;
  onFieldCommit: (
    item: BudgetLineItem,
    field: "category" | "subcategory" | "lineItem" | "vendor" | "status",
    rawValue: string | LineItemStatus,
  ) => Promise<void> | void;
  onAssignSession: (item: BudgetLineItem, matrixRowId: string | null) => Promise<void> | void;
  onAssignGroup: (item: BudgetLineItem, rawName: string) => Promise<void> | void;
  onDeleteGroup: (group: BudgetGroupOption) => Promise<void> | void;
  onOpenApproval: (lineItemId: string) => void;
  onRemoveNewRow: (item: BudgetLineItem) => void;
  registerForecastInput: (id: string, node: HTMLInputElement | null) => void;
  registerCategorySelect: (id: string, node: HTMLSelectElement | null) => void;
};

// Memoized Budget grid row. All canonical state stays in FullBudgetGrid; this row
// receives only its own committed item, its own draft values, per-row primitive
// booleans, and stable callbacks. Because those props only change for the row a
// user actually edits, React.memo skips re-rendering every other visible row when
// one cell changes. Drafts are NOT owned here — they are passed in — so edits are
// never lost when a row unmounts under pagination.
const BudgetRow = memo(function BudgetRow({
  item,
  columnOrder,
  amountDraft,
  textDraft,
  selected,
  locked,
  readOnly,
  isNew,
  isDirty,
  isSaved,
  error,
  approvalState,
  approvalWorkflowEnabled,
  sessionOptions,
  groupOptions,
  selectedEventId,
  onRowClick,
  onToggleSelect,
  onMarkDirty,
  setAmountDrafts,
  setLineItemDrafts,
  onAmountBlur,
  onFieldCommit,
  onAssignSession,
  onAssignGroup,
  onDeleteGroup,
  onOpenApproval,
  onRemoveNewRow,
  registerForecastInput,
  registerCategorySelect,
}: BudgetRowProps) {
  const draft = amountDraft ?? defaultAmountDraft(item);
  const text = textDraft ?? defaultLineItemDraft(item);
  const optimisticItem = applyOptimisticAmounts(item, { [item.id]: draft });
  const varianceCents = optimisticItem.actualCents - optimisticItem.forecastCents;
  const varianceClass = varianceCents <= 0 ? "text-emerald-700" : "text-rose-700";
  const categoryOptions = CATEGORY_OPTION_SET.has(text.category)
    ? CATEGORY_OPTIONS
    : Array.from(new Set([text.category, ...CATEGORY_OPTIONS]));
  const rowIsEditable = !locked && !readOnly;

  return (
    <tr
      onClick={(event) => onRowClick(event, item.id)}
      data-testid={`budget-line-item-row-${item.id}`}
      data-line-item-state={isNew ? "new-unsaved" : isDirty ? "edited-unsaved" : undefined}
      className={[
        "border-b border-slate-100 last:border-b-0 cursor-pointer transition-colors",
        locked ? "bg-slate-50 opacity-60" : "hover:bg-slate-50/70",
        selected
          ? `${BULK_SELECTED_ROW_CLASS} hover:bg-blue-50/80`
          : isNew
          ? "border-l-4 border-l-amber-500 bg-amber-100/70 shadow-[inset_0_0_0_1px_rgba(217,119,6,0.35)] hover:bg-amber-100/80"
          : isDirty
            ? "border-l-4 border-l-blue-400 bg-blue-50/45 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.2)] hover:bg-blue-50/60"
            : "",
      ].join(" ")}
    >
      <td className="box-border px-3 py-2 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(item.id)}
          aria-label={`Select ${item.lineItem}`}
          disabled={locked || isNew}
          className="h-4 w-4 border-slate-300 text-[#28439A] focus:ring-[#28439A]"
        />
      </td>
      <td className="box-border px-3 py-2 align-middle">
        <div className="flex h-8 min-w-0 items-center gap-1.5">
          {rowIsEditable ? (
            <div className="min-w-0">
              <input
                data-testid={`budget-line-item-name-${item.id}`}
                value={text.lineItem}
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const value = event.target.value;
                  onMarkDirty(item.id);
                  setLineItemDrafts((prev) => ({
                    ...prev,
                    [item.id]: {
                      ...(prev[item.id] ?? defaultLineItemDraft(item)),
                      lineItem: value,
                    },
                  }));
                }}
                onBlur={(event) => {
                  void onFieldCommit(item, "lineItem", event.target.value);
                }}
                aria-label={`Line Item for ${item.lineItem || "new budget row"}`}
                aria-describedby={isNew || isDirty ? `line-item-helper-${item.id}` : undefined}
                title={text.lineItem || undefined}
                placeholder="Required line item name"
                className="box-border h-8 w-full min-w-0 rounded-md border border-slate-200 px-2 py-0 text-[12px] font-semibold leading-8 text-slate-800 outline-none focus:border-[#28439A]"
              />
              {isNew || isDirty ? (
                <p id={`line-item-helper-${item.id}`} className="mt-1 max-w-[22rem] text-[10px] leading-3 text-slate-500">
                  Describe the specific planned cost, such as General Session AV, Welcome Reception Catering, Speaker Travel, or Event Wi‑Fi.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-900" title={item.lineItem}>
                {item.lineItem}
              </p>
              {item.vendor ? <p className="truncate text-[11px] text-slate-500">{item.vendor}</p> : null}
            </div>
          )}
        </div>
      </td>
      <td className="box-border px-3 py-2 align-middle">
        <div className="flex h-8 min-w-0 items-center gap-1.5">
          {isNew ? (
            <span
              className="inline-flex h-5 shrink-0 items-center rounded-full border border-amber-400 bg-amber-100 px-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800"
              role="status"
              aria-label="New unsaved budget line item"
            >
              New
            </span>
          ) : null}
          {rowIsEditable ? (
            <select
              ref={(node) => registerCategorySelect(item.id, node)}
              value={text.category}
              onChange={(event) => {
                const value = event.target.value;
                onMarkDirty(item.id);
                setLineItemDrafts((prev) => ({
                  ...prev,
                  [item.id]: {
                    ...(prev[item.id] ?? defaultLineItemDraft(item)),
                    category: value,
                  },
                }));
                void onFieldCommit(item, "category", value);
              }}
              className={`box-border h-8 w-full min-w-0 flex-1 rounded-full px-2.5 py-0 text-[12px] font-semibold leading-8 outline-none ${categoryPillClasses(text.category)}`}
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          ) : (
            <span
              className={`inline-flex h-8 w-full min-w-0 flex-1 items-center rounded-full px-2.5 py-0 text-[12px] font-semibold leading-8 ${categoryPillClasses(text.category)}`}
            >
              <span className="truncate">{text.category}</span>
            </span>
          )}
        </div>
      </td>
      {columnOrder.map((columnId) => {
        switch (columnId) {
          case "session":
            return (
              <td key={columnId} className="box-border px-3 py-2 align-middle">
                <div className="flex min-w-0 items-center gap-1">
                  {rowIsEditable ? (
                    <select
                      aria-label={`Session for ${item.lineItem}`}
                      value={item.matrixRowId ?? ""}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        void onAssignSession(item, event.target.value || null);
                      }}
                      className="box-border h-8 w-full max-w-full min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-0 text-[12px] leading-8 text-slate-700 outline-none focus:border-slate-300"
                    >
                      <option value="">Event-wide / Unassigned</option>
                      {sessionOptions.map((session) => (
                        <option key={`${item.id}-session-${session.id}`} value={session.id}>
                          {session.title}
                        </option>
                      ))}
                      {item.matrixRowId && !sessionOptions.some((session) => session.id === item.matrixRowId) ? (
                        <option value={item.matrixRowId}>{item.sessionTitle ?? "Session unavailable"}</option>
                      ) : null}
                    </select>
                  ) : (
                    <p
                      className="flex h-8 min-w-0 flex-1 items-center truncate text-[12px] text-slate-700"
                      title={item.sessionTitle ?? undefined}
                    >
                      {item.sessionTitle || "Event-wide / Unassigned"}
                    </p>
                  )}
                  {item.matrixRowId ? (
                    <Link
                      href={`/events/${selectedEventId}/matrix/sessions/${item.matrixRowId}`}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      title="Open session ops"
                      aria-label={`Open session operations for ${item.sessionTitle ?? "linked session"}`}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              </td>
            );
          case "group":
            return (
              <td key={columnId} className="box-border px-3 py-2 align-middle">
                <BudgetGroupSelectCell
                  item={item}
                  groups={groupOptions}
                  readOnly={!rowIsEditable}
                  onAssign={onAssignGroup}
                  onDelete={onDeleteGroup}
                />
              </td>
            );
          case "forecast":
            return (
              <td key={columnId} className="box-border px-3 py-2 align-middle">
                {rowIsEditable ? (
                  <input
                    ref={(node) => registerForecastInput(item.id, node)}
                    data-testid={`budget-line-item-forecast-${item.id}`}
                    value={draft.forecast}
                    onChange={(event) => {
                      const value = event.target.value;
                      onMarkDirty(item.id);
                      setAmountDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] ?? { forecast: "", actual: "" }),
                          forecast: value,
                          actual: prev[item.id]?.actual ?? defaultAmountDraft(item).actual,
                        },
                      }));
                    }}
                    onBlur={(event) => {
                      void onAmountBlur(item, "forecastCents", event.target.value);
                    }}
                    className="box-border h-8 w-full min-w-0 rounded-md border border-slate-200 px-2 py-0 text-[12px] leading-8 text-slate-800 outline-none focus:border-slate-300"
                  />
                ) : (
                  <p
                    data-testid={`budget-line-item-forecast-${item.id}`}
                    className="h-8 truncate text-[12px] leading-8 font-medium text-slate-800"
                  >
                    {formatMoney(optimisticItem.forecastCents)}
                  </p>
                )}
              </td>
            );
          case "actual":
            return (
              <td key={columnId} className="box-border px-3 py-2 align-middle">
                {rowIsEditable ? (
                  <input
                    data-testid={`budget-line-item-actual-${item.id}`}
                    value={draft.actual}
                    onChange={(event) => {
                      const value = event.target.value;
                      onMarkDirty(item.id);
                      setAmountDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] ?? { forecast: "", actual: "" }),
                          forecast: prev[item.id]?.forecast ?? defaultAmountDraft(item).forecast,
                          actual: value,
                        },
                      }));
                    }}
                    onBlur={(event) => {
                      void onAmountBlur(item, "actualCents", event.target.value);
                    }}
                    className="box-border h-8 w-full min-w-0 rounded-md border border-slate-200 px-2 py-0 text-[12px] leading-8 text-slate-800 outline-none focus:border-slate-300"
                  />
                ) : (
                  <p
                    data-testid={`budget-line-item-actual-${item.id}`}
                    className="h-8 truncate text-[12px] leading-8 font-medium text-slate-800"
                  >
                    {formatMoney(optimisticItem.actualCents)}
                  </p>
                )}
              </td>
            );
          case "variance":
            return (
              <td key={columnId} className={`box-border px-3 py-2 align-middle text-[12px] leading-8 font-semibold ${varianceClass}`}>
                {formatMoney(varianceCents)}
              </td>
            );
          case "vendor":
            return (
              <td key={columnId} className="box-border min-w-0 px-3 py-2 align-middle">
                <div className="min-w-0">
                  {rowIsEditable ? (
                    <input
                      data-testid={`budget-line-item-vendor-${item.id}`}
                      value={text.vendor}
                      onChange={(event) => {
                        const value = event.target.value;
                        onMarkDirty(item.id);
                        setLineItemDrafts((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...(prev[item.id] ?? defaultLineItemDraft(item)),
                            vendor: value,
                          },
                        }));
                      }}
                      onBlur={(event) => {
                        void onFieldCommit(item, "vendor", event.target.value);
                      }}
                      placeholder="Vendor"
                      className="box-border h-8 w-full min-w-0 rounded-md border border-slate-200 px-2 py-0 text-[12px] leading-8 text-slate-700 outline-none focus:border-slate-300"
                    />
                  ) : (
                    <p
                      data-testid={`budget-line-item-vendor-${item.id}`}
                      className="flex h-8 min-w-0 items-center truncate text-[12px] text-slate-700"
                    >
                      {text.vendor || "—"}
                    </p>
                  )}
                  {error ? <p className="mt-1 text-[11px] leading-4 text-rose-600">{error}</p> : null}
                  {isSaved ? <p className="mt-1 text-[11px] font-semibold text-emerald-700">Saved</p> : null}
                </div>
              </td>
            );
          case "docs":
            return (
              <td key={columnId} className="box-border px-3 py-2 align-middle">
                {item.documentCount > 0 ? (
                  <Link
                    href={{
                      pathname: `/events/${selectedEventId}/docs`,
                      query: {
                        budgetItemId: item.id,
                        ...(item.firstDocumentId ? { docId: item.firstDocumentId } : {}),
                      },
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0 text-[12px] font-semibold text-[#28439A] hover:bg-slate-100"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    {item.documentCount}
                  </Link>
                ) : (
                  <span className="inline-flex h-8 items-center text-[12px] text-slate-400">0</span>
                )}
              </td>
            );
          case "status":
            return (
              <td key={columnId} className="box-border px-3 py-2 align-middle">
                {rowIsEditable ? (
                  <select
                    value={text.status}
                    onChange={(event) => {
                      const value = event.target.value as LineItemStatus;
                      onMarkDirty(item.id);
                      setLineItemDrafts((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] ?? defaultLineItemDraft(item)),
                          status: value,
                        },
                      }));
                      void onFieldCommit(item, "status", value);
                    }}
                    className={`box-border h-8 w-full max-w-[7.25rem] min-w-0 rounded-full border border-transparent px-2.5 py-0 text-[12px] font-semibold leading-8 outline-none ${statusPillClasses(text.status)}`}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status.charAt(0) + status.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={`inline-flex h-8 w-full max-w-[7.25rem] min-w-0 items-center rounded-full px-2.5 py-0 text-[12px] font-semibold leading-8 ${statusPillClasses(text.status)}`}
                  >
                    <span className="truncate">
                      {text.status.charAt(0) + text.status.slice(1).toLowerCase()}
                    </span>
                  </span>
                )}
              </td>
            );
          case "approval":
            return (
              <td key={columnId} className="box-border px-3 py-2 align-middle">
                {isNew || !approvalWorkflowEnabled ? (
                  <span
                    className={`inline-flex h-8 items-center rounded-full px-2.5 text-[12px] font-semibold ${lineItemApprovalBadgeClasses(approvalState)}`}
                  >
                    {formatLineItemApprovalLabel(approvalState)}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenApproval(item.id)}
                    className={`inline-flex h-8 max-w-full min-w-0 items-center rounded-full px-2.5 text-[12px] font-semibold ${lineItemApprovalBadgeClasses(approvalState)} hover:opacity-90`}
                  >
                    <span className="truncate">{formatLineItemApprovalLabel(approvalState)}</span>
                  </button>
                )}
              </td>
            );
          default:
            return null;
        }
      })}
      <td
        className={`sticky right-0 z-10 box-border w-12 px-2 py-2 align-middle ${isNew ? "bg-amber-100/95" : "bg-white"}`}
        data-column-action
      >
        {isNew ? (
          <button
            type="button"
            title="Remove new row"
            aria-label="Remove new budget row"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRemoveNewRow(item);
            }}
            disabled={!rowIsEditable}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28439A] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </td>
    </tr>
  );
});

export function FullBudgetGrid({ eventIdOverride = "", hideEventSelector = false }: FullBudgetGridProps) {
  const scopedEventId = eventIdOverride.trim();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const urlLineItemFilters = useMemo(
    () => {
      const params = new URLSearchParams(searchParamsString);
      return {
        category: getBudgetCategoryDisplay(params.get("category")),
        subcategory: params.get("subcategory")?.trim() ?? "",
        status: normalizeOptionalLineItemStatusFilter(params.get("status")),
        approval: normalizeOptionalLineItemApprovalFilter(params.get("approval")),
        search: params.get("search")?.trim() ?? "",
        // Session/group drilldowns from the dashboard arrive as query params.
        session: params.get("session")?.trim() ?? "",
        groupId: (params.get("groupId") ?? params.get("group"))?.trim() ?? "",
      };
    },
    [searchParamsString],
  );
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const {
    columnOrder,
    orderedColumns,
    setColumnOrder,
  } = usePersistedColumnOrder({
    columns: BUDGET_LINE_ITEM_COLUMNS,
    scope: {
      eventId: selectedEventId,
      viewId: "budget:list",
    },
  });
  const {
    getHeaderReorderProps,
    getHeaderReorderClassName,
    shouldSuppressHeaderClick,
  } = useColumnHeaderReorder({
    orderedColumns,
    onColumnOrderChange: setColumnOrder,
  });
  const [budgetData, setBudgetData] = useState<BudgetResponse | null>(null);
  const [isApprovalDrawerOpen, setIsApprovalDrawerOpen] = useState(false);
  const [approvalDrawerMode, setApprovalDrawerMode] = useState<ApprovalDrawerMode>("global");
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null);
  const [selectedLineItemIds, setSelectedLineItemIds] = useState<string[]>([]);
  const [selectedThreadLineItemId, setSelectedThreadLineItemId] = useState<string | null>(null);
  const [, setIsEditMode] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [newlyAddedRowId, setNewlyAddedRowId] = useState<string | null>(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, AmountDraft>>({});
  const [lineItemDrafts, setLineItemDrafts] = useState<Record<string, LineItemTextDraft>>({});
  const [dirtyLineItemIds, setDirtyLineItemIds] = useState<Set<string>>(new Set());
  // Parent-owned dirty overlay keyed by line-item ID. Captured committed row state
  // for every touched row so global totals and save-all/discard survive a row
  // paging or filtering away. Never moved into BudgetRow (drafts must outlive row
  // unmount). See computeOverlayTotals for how deltas feed the header totals.
  const [dirtyOverlay, setDirtyOverlay] = useState<Record<string, DirtyOverlayEntry>>({});
  const [savingLineItemId, setSavingLineItemId] = useState<string | null>(null);
  const [savedLineItemIds, setSavedLineItemIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [isApprovalDataLoading, setIsApprovalDataLoading] = useState(false);
  const [approvalDataLoadedEventId, setApprovalDataLoadedEventId] = useState<string | null>(null);
  const [exportingBudgetCsvType, setExportingBudgetCsvType] = useState<"line-items" | "summary" | null>(null);
  const [budgetNotice, setBudgetNotice] = useState<BudgetNotice | null>(null);
  const [budgetApprovalsEnabled, setBudgetApprovalsEnabled] = useState(true);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [lineItemsFilterCategory, setLineItemsFilterCategory] = useState(urlLineItemFilters.category);
  const [lineItemsFilterSubcategory, setLineItemsFilterSubcategory] = useState(urlLineItemFilters.subcategory);
  const [lineItemsFilterStatus, setLineItemsFilterStatus] = useState<LineItemStatus | "">(urlLineItemFilters.status);
  const [lineItemsFilterApproval, setLineItemsFilterApproval] = useState<LineItemApproval | "">(urlLineItemFilters.approval);
  const [lineItemsSearch, setLineItemsSearch] = useState(urlLineItemFilters.search);
  const [lineItemsFilterSession, setLineItemsFilterSession] = useState(urlLineItemFilters.session);
  const [lineItemsFilterGroup, setLineItemsFilterGroup] = useState(urlLineItemFilters.groupId);
  const [lineItemsFiltersOpen, setLineItemsFiltersOpen] = useState(false);
  const [sessionOptions, setSessionOptions] = useState<BudgetSessionOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<BudgetGroupOption[]>([]);
  const [sessionGroupOptionsError, setSessionGroupOptionsError] = useState<string | null>(null);
  const [lineItemsPageSize, setLineItemsPageSize] = useState(LINE_ITEMS_DEFAULT_PAGE_SIZE);
  const [lineItemsPage, setLineItemsPage] = useState(0);
  const [lineItemsSort, setLineItemsSort] = useState<LineItemSortColumn>("sortOrder");
  const [lineItemsSortDir, setLineItemsSortDir] = useState<SortDirection>("asc");
  // Server-paged rows for the current page + the server's filter-scoped counts and
  // footer totals. This is the display source once the grid is server-paged: the
  // client no longer holds every row to filter/paginate/total locally.
  const [pagedLineItems, setPagedLineItems] = useState<BudgetLineItem[]>([]);
  const [pagedFilteredCount, setPagedFilteredCount] = useState(0);
  const [pagedFooterTotals, setPagedFooterTotals] = useState<{ forecastCents: number; actualCents: number; varianceCents: number }>(
    SERVER_EMPTY_FOOTER_TOTALS,
  );
  const [isLineItemsPageLoading, setIsLineItemsPageLoading] = useState(false);
  // Debounced mirror of the search box so keystrokes don't fire a request each.
  const [debouncedLineItemsSearch, setDebouncedLineItemsSearch] = useState(urlLineItemFilters.search);
  // Bumped after a row mutation to force a page + totals refetch without wiping
  // parent-owned draft/overlay state for other in-flight edits.
  const [lineItemsRefreshToken, setLineItemsRefreshToken] = useState(0);

  const focusLineItemIdRef = useRef<string | null>(null);
  const focusForecastIdRef = useRef<string | null>(null);
  const forecastInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const categorySelectRefs = useRef<Record<string, HTMLSelectElement | null>>({});
  const budgetRequestRef = useRef(0);
  const sessionGroupRequestRef = useRef(0);
  const assigningSessionRef = useRef(new Set<string>());
  const submitAbortControllerRef = useRef<AbortController | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const selectedEventIdRef = useRef("");
  const approvalDataLoadedEventIdRef = useRef<string | null>(null);
  const loadEventsInFlightRef = useRef(false);
  // Monotonic token so an out-of-order paged line-items response (a slow earlier
  // request resolving after a newer one) is discarded instead of overwriting the
  // current page.
  const lineItemsPageRequestRef = useRef(0);
  const budgetLoadInFlightRef = useRef(new Set<string>());
  const budgetLoadStatsRef = useRef({
    eventFetchCount: 0,
    budgetFetchCount: 0,
    duplicateBudgetFetchCount: 0,
  });

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) return;
    fetch(`/api/events/${selectedEventId}`, { credentials: "include" })
      .then(async (response) => response.ok ? await response.json() as { budgetApprovalsEnabled?: boolean } : null)
      .then((event) => setBudgetApprovalsEnabled(event?.budgetApprovalsEnabled !== false))
      .catch(() => setBudgetApprovalsEnabled(true));
  }, [selectedEventId]);

  useEffect(() => {
    if (!budgetNotice) return;
    const timeoutId = window.setTimeout(() => setBudgetNotice(null), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [budgetNotice]);

  useEffect(() => {
    if (!isToolsMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const menu = toolsMenuRef.current;
      if (!menu) return;
      if (menu.contains(event.target as Node)) return;
      setIsToolsMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsToolsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isToolsMenuOpen]);

  // Load canonical session options (Run of Show) and existing budget groups for
  // the Session/Group pickers and filters. Re-runs when the event changes.
  const reloadSessionGroupOptions = useCallback(async (eventId: string) => {
    const request = ++sessionGroupRequestRef.current;
    if (!eventId) {
      setSessionOptions([]);
      setGroupOptions([]);
      setSessionGroupOptionsError(null);
      return;
    }
    setSessionGroupOptionsError(null);
    try {
      const [sessionsRes, groupsRes] = await Promise.all([
        fetch(`/api/events/${eventId}/budget/sessions`),
        fetch(`/api/events/${eventId}/budget/groups`),
      ]);
      const sessionsPayload = await sessionsRes.json().catch(() => null) as { sessions?: BudgetSessionOption[]; error?: string } | null;
      const groupsPayload = await groupsRes.json().catch(() => null) as { groups?: BudgetGroupOption[]; error?: string } | null;
      if (!sessionsRes.ok) throw new Error(toErrorMessage(sessionsPayload, "Failed to load budget sessions"));
      if (!groupsRes.ok) throw new Error(toErrorMessage(groupsPayload, "Failed to load budget groups"));
      if (request !== sessionGroupRequestRef.current) return;
      setSessionOptions(sessionsPayload?.sessions ?? []);
      setGroupOptions(groupsPayload?.groups ?? []);
    } catch (error) {
      if (request !== sessionGroupRequestRef.current) return;
      setSessionOptions([]);
      setGroupOptions([]);
      setSessionGroupOptionsError(error instanceof Error ? error.message : "Failed to load session and group options");
    }
  }, []);

  useEffect(() => {
    void reloadSessionGroupOptions(selectedEventId);
  }, [selectedEventId, reloadSessionGroupOptions]);

  const loadBudget = useCallback(
    async (
      eventId: string,
      options?: {
        keepEditMode?: boolean;
        preferLatestSubmittedSelection?: boolean;
        includeSubmissions?: boolean;
        includeSubmissionDetails?: boolean;
        preserveTableState?: boolean;
      },
    ) => {
    if (!eventId) return;

    const includeSubmissions = options?.includeSubmissions ?? true;
    const includeSubmissionDetails = options?.includeSubmissionDetails ?? false;
    const preserveTableState = options?.preserveTableState ?? false;
    const requestKey = `${eventId}:submissions=${includeSubmissions ? "1" : "0"}:details=${includeSubmissionDetails ? "1" : "0"}`;
    const isDuplicateLoad = budgetLoadInFlightRef.current.has(requestKey);
    budgetLoadStatsRef.current.budgetFetchCount += 1;
    if (isDuplicateLoad) {
      budgetLoadStatsRef.current.duplicateBudgetFetchCount += 1;
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadBudget:deduped", {
        eventId,
        stats: budgetLoadStatsRef.current,
      });
      return;
    }
    budgetLoadInFlightRef.current.add(requestKey);
    const request = ++budgetRequestRef.current;

    const debugRequestId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const source = hideEventSelector ? "event-budget-page" : "budgets-page";
    debugBudgetClientLog("DEBUG BUDGET LOAD client:loadBudget:start", {
      debugRequestId,
      eventId,
      source,
      isDuplicateLoad,
      includeSubmissions,
      includeSubmissionDetails,
      stats: budgetLoadStatsRef.current,
      options: options ?? null,
    });
    setIsLoading(true);
    setErrorMessage(null);

    try {
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadBudget:fetch:start", { debugRequestId, eventId });
      const params = new URLSearchParams({
        source,
        includeSubmissions: includeSubmissions ? "1" : "0",
        includeSubmissionDetails: includeSubmissionDetails ? "1" : "0",
        // Light snapshot: load the shell (metadata, global totals, lineItemCount,
        // submissions) without the full line-item array. Rows load per page
        // from the paged endpoint. (Budget deep performance / Prompt 8.)
        includeLineItems: "0",
      });
      const response = await fetch(`/api/events/${eventId}/budget?${params.toString()}`);
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadBudget:fetch:end", {
        debugRequestId,
        eventId,
        status: response.status,
        ok: response.ok,
      });
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadBudget:json:start", { debugRequestId, eventId });
      const payload = await response.json();
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadBudget:json:end", {
        debugRequestId,
        eventId,
        payloadType: typeof payload,
      });

      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load budget"));
      }
      if (request !== budgetRequestRef.current) return;

      const nextBudget = payload as BudgetResponse;
      setBudgetData((current) => {
        const canPreserveCurrent = current?.budget.id === nextBudget.budget.id;
        return {
          ...nextBudget,
          submissions: includeSubmissions
            ? includeSubmissionDetails
              ? nextBudget.submissions
              : canPreserveCurrent && approvalDataLoadedEventIdRef.current === eventId
                ? current.submissions
                : nextBudget.submissions
            : canPreserveCurrent
              ? current.submissions
              : [],
        };
      });
      if (includeSubmissions && includeSubmissionDetails) {
        approvalDataLoadedEventIdRef.current = eventId;
        setApprovalDataLoadedEventId(eventId);
      }
      if (typeof options?.keepEditMode === "boolean") {
        setIsEditMode(options.keepEditMode);
      } else if (!preserveTableState) {
        setIsEditMode(false);
      }
      setIsSubmitModalOpen(false);
      setSelectedRecipientIds([]);
      setSubmissionMessage("");
      // A full (light) reload resets transient row UI: the snapshot no longer
      // ships the rows to reconcile against, and selection/detail/new-row state
      // should not survive an event switch or hard refresh. Post-mutation refreshes
      // use refreshBudgetShellTotals (which preserves this state) instead.
      if (!preserveTableState) {
        setSelectedLineItemId(null);
        setSelectedLineItemIds([]);
        setNewlyAddedRowId(null);
      }
      const nextThreadOptions = buildSubmissionThreadOptions(nextBudget.submissions ?? []);
      const defaultThreadLineItemId =
        nextThreadOptions.find((option) => option.latestSubmission.status === "SUBMITTED")?.lineItemId
        ?? nextThreadOptions[0]?.lineItemId
        ?? null;
      setSelectedThreadLineItemId((currentSelected) => {
        if (options?.preferLatestSubmittedSelection) {
          return defaultThreadLineItemId;
        }

        return currentSelected && nextThreadOptions.some((option) => option.lineItemId === currentSelected)
          ? currentSelected
          : defaultThreadLineItemId;
      });

      if (!preserveTableState) {
        const drafts: Record<string, AmountDraft> = {};
        const textDrafts: Record<string, LineItemTextDraft> = {};
        for (const item of nextBudget.lineItems) {
          drafts[item.id] = defaultAmountDraft(item);
          textDrafts[item.id] = defaultLineItemDraft(item);
        }
        setAmountDrafts(drafts);
        setLineItemDrafts(textDrafts);
        setDirtyLineItemIds(new Set());
        // Refetch reconciles committed totals: the fresh snapshot is the new
        // committed base, so any prior overlay deltas are dropped.
        setDirtyOverlay({});
        setRowErrors({});
        setSavedLineItemIds(new Set());
      }
    } catch (error) {
      if (request !== budgetRequestRef.current) return;
      console.error("budget.client.loadBudget.error", {
        debugRequestId,
        eventId,
        message: error instanceof Error ? error.message : String(error),
      });
      setErrorMessage(error instanceof Error ? error.message : "Failed to load budget");
    } finally {
      budgetLoadInFlightRef.current.delete(requestKey);
      if (request === budgetRequestRef.current) setIsLoading(false);
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadBudget:end", { debugRequestId, eventId });
    }
    },
    [hideEventSelector],
  );

  const loadApprovalData = useCallback(async (eventId: string) => {
    if (!eventId || approvalDataLoadedEventId === eventId || isApprovalDataLoading) return;
    setIsApprovalDataLoading(true);
    try {
      const response = await fetch(`/api/events/${eventId}/budget/submissions`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load budget approvals"));
      }
      setBudgetData((current) => current ? { ...current, submissions: payload as BudgetSubmissionSummary[] } : current);
      approvalDataLoadedEventIdRef.current = eventId;
      setApprovalDataLoadedEventId(eventId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load budget approvals");
    } finally {
      setIsApprovalDataLoading(false);
    }
  }, [approvalDataLoadedEventId, isApprovalDataLoading]);

  const loadEvents = useCallback(async () => {
    if (hideEventSelector) {
      const scoped = scopedEventId.trim();
      setEvents([]);
      setSelectedEventId(scoped);
      if (scoped) {
        await loadBudget(scoped);
      } else {
        setBudgetData(null);
      }
      return;
    }

    if (loadEventsInFlightRef.current) {
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadEvents:deduped", {
        stats: budgetLoadStatsRef.current,
      });
      return;
    }
    loadEventsInFlightRef.current = true;
    budgetLoadStatsRef.current.eventFetchCount += 1;

    const debugRequestId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    debugBudgetClientLog("DEBUG BUDGET LOAD client:loadEvents:start", { debugRequestId });
    setIsLoading(true);
    setErrorMessage(null);

    try {
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadEvents:fetch:start", { debugRequestId });
      const response = await fetch("/api/events", { cache: "no-store" });
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadEvents:fetch:end", {
        debugRequestId,
        status: response.status,
        ok: response.ok,
      });
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadEvents:json:start", { debugRequestId });
      const payload = await response.json();
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadEvents:json:end", {
        debugRequestId,
        payloadType: typeof payload,
      });
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load events"));
      }

      const eventOptions = Array.isArray(payload)
        ? payload.map((item) => ({ id: String(item.id), name: String(item.name) }))
        : [];

      setEvents(eventOptions);

      if (eventOptions.length > 0) {
        const preferredEventId = scopedEventId && eventOptions.some((event) => event.id === scopedEventId)
          ? scopedEventId
          : "";
        const currentEventId = selectedEventIdRef.current && eventOptions.some((event) => event.id === selectedEventIdRef.current)
          ? selectedEventIdRef.current
          : "";
        const nextEventId = preferredEventId || currentEventId || eventOptions[0].id;
        setSelectedEventId(nextEventId);
        await loadBudget(nextEventId);
      } else {
        setSelectedEventId("");
        setBudgetData(null);
      }
    } catch (error) {
      console.error("budget.client.loadEvents.error", {
        debugRequestId,
        message: error instanceof Error ? error.message : String(error),
      });
      setErrorMessage(error instanceof Error ? error.message : "Failed to load events");
    } finally {
      loadEventsInFlightRef.current = false;
      setIsLoading(false);
      debugBudgetClientLog("DEBUG BUDGET LOAD client:loadEvents:end", { debugRequestId });
    }
  }, [hideEventSelector, loadBudget, scopedEventId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (focusLineItemIdRef.current) {
      const categorySelect = categorySelectRefs.current[focusLineItemIdRef.current];
      if (categorySelect) {
        categorySelect.focus();
      }
      focusLineItemIdRef.current = null;
      focusForecastIdRef.current = null;
      return;
    }

    if (!focusForecastIdRef.current) return;

    const input = forecastInputRefs.current[focusForecastIdRef.current];
    if (input) {
      input.focus();
      input.select();
    }

    focusForecastIdRef.current = null;
  }, [budgetData]);

  const budget = budgetData?.budget ?? null;
  // Displayed rows are the current server page, with any client-added temporary
  // (unsaved) rows shown at the top. Under the light snapshot, budgetData.lineItems
  // only ever holds those temp rows; real rows come from the paged endpoint. The
  // client no longer holds the full line-item universe — cross-page concerns
  // (dirty edits, save-all, bulk select) use the parent-owned overlay + ids endpoint.
  const temporaryLineItems = useMemo(
    () => (budgetData?.lineItems ?? EMPTY_LINE_ITEMS).filter((item) => isTemporaryLineItemId(item.id)),
    [budgetData?.lineItems],
  );
  const lineItems = useMemo(() => {
    if (temporaryLineItems.length === 0) return pagedLineItems.length > 0 ? pagedLineItems : EMPTY_LINE_ITEMS;
    return [...temporaryLineItems, ...pagedLineItems];
  }, [temporaryLineItems, pagedLineItems]);
  // Authoritative full-budget count from the snapshot (0 until the shell loads).
  const lineItemCount = budgetData?.lineItemCount ?? 0;
  // Committed line items keyed by id, plus their forecast/actual base sums. Both
  // are stable across keystrokes — they only change on save/refetch — so typing
  // never re-reduces the full dataset. Optimistic per-row values are applied
  // lazily where rendered (paginated rows + the open detail row).
  const committedLineItemsById = useMemo(
    () => new Map(lineItems.map((item) => [item.id, item])),
    [lineItems],
  );
  // Latest committed map exposed via ref so the stable (dep-free) markLineItemDirty
  // callback can snapshot a row's committed base into the dirty overlay without
  // taking committedLineItemsById as a dependency (which would churn every row's
  // memoized props on each edit).
  const committedLineItemsByIdRef = useRef(committedLineItemsById);
  committedLineItemsByIdRef.current = committedLineItemsById;
  // Server-authoritative committed totals over the FULL budget (from the snapshot),
  // NOT a reduce over the currently loaded page. computeOverlayTotals applies the
  // dirty-row deltas on top so header totals stay global and optimistic at once.
  const committedTotalsBase = useMemo(
    () => ({
      totalForecastCents: budgetData?.totals.totalForecastCents ?? 0,
      totalActualCents: budgetData?.totals.totalActualCents ?? 0,
    }),
    [budgetData?.totals],
  );
  const submissions = budgetData?.submissions ?? EMPTY_SUBMISSIONS;
  const submissionThreads = useMemo(() => buildSubmissionThreads(submissions), [submissions]);
  const submissionOptions = useMemo(() => {
    const options = buildSubmissionThreadOptions(submissions);

    if (process.env.NODE_ENV !== "production") {
      const uniqueSubmissionIds = Array.from(new Set(options.map((option) => option.lineItemId)));
      console.assert(options.length === uniqueSubmissionIds.length, "Submission options contain duplicate ids");
    }

    return options;
  }, [submissions]);
  const submissionRecipients = useMemo(
    () => budgetData?.submissionRecipients ?? [],
    [budgetData],
  );
  // Header/global totals = server-authoritative committed totals + dirty-overlay
  // deltas. The base is NOT a reduce over the current page — it is the committed
  // total over the full budget (committedTotalsBase while all rows are loaded;
  // once the grid is server-paged this base swaps to the snapshot's global totals
  // without touching this delta math). The overlay anchors each dirty row's delta
  // to the committed base captured at edit time, so a dirty row that has paged or
  // filtered away still moves the header totals correctly. Cost is O(dirty rows).
  const totals = useMemo(
    () => computeOverlayTotals(committedTotalsBase, dirtyOverlay, amountDrafts, parseCurrencyToCents),
    [committedTotalsBase, dirtyOverlay, amountDrafts],
  );
  const isApproved = budget?.status === "APPROVED";
  const selectedCount = selectedLineItemIds.length;
  const activeApprovalOptions = useMemo(
    () => submissionOptions.filter(isActiveApprovalOption),
    [submissionOptions],
  );
  const approvalHistoryOptions = useMemo(
    () => submissionOptions.filter((option) => !isActiveApprovalOption(option)),
    [submissionOptions],
  );
  const activeApprovalCount = activeApprovalOptions.length;
  const selectedThreadOption = selectedThreadLineItemId
    ? (submissionOptions.find((option) => option.lineItemId === selectedThreadLineItemId) ?? null)
    : null;
  const selectedThreadSubmissions = selectedThreadLineItemId
    ? (submissionThreads.get(selectedThreadLineItemId) ?? [])
    : [];
  const selectedSubmission = selectedThreadOption?.latestSubmission ?? null;
  const selectedThreadLineItem = selectedThreadOption?.budgetLineItem
    ?? (selectedSubmission && selectedThreadLineItemId
      ? getThreadBudgetLineItem(selectedSubmission, selectedThreadLineItemId)
      : null);

  const selectedEventName = useMemo(
    () => events.find((event) => event.id === selectedEventId)?.name ?? "",
    [events, selectedEventId],
  );
  const selectedLineItem = selectedLineItemId
    ? (lineItems.find((item) => item.id === selectedLineItemId) ?? null)
    : null;
  const selectedApprovalLineItem = selectedLineItem
    ? applyOptimisticAmounts(selectedLineItem, amountDrafts)
    : null;

  const budgetCategoryFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const category of CATEGORY_OPTIONS) {
      addBudgetCategoryFilterOption(set, category);
    }
    return Array.from(set).sort(compareBudgetCategories);
  }, []);

  const selectedSessionFilterIds = useMemo(
    () => (lineItemsFilterSession.trim() ? [lineItemsFilterSession.trim()] : []),
    [lineItemsFilterSession],
  );

  // The server already returns the filtered page, so the "filtered" set the grid
  // renders IS the loaded page. No client-side filtering pass.
  const filteredLineItems = lineItems;

  // Footer totals are server-backed (filter-scoped over the FULL filtered set,
  // not just the current page). The session footer shows when a session filter is
  // active; the category footer when a category filter is active — both read the
  // same server filteredFooterTotals since those filters are part of the query.
  const sessionFooterTotal = useMemo<SessionFooterTotal | null>(() => {
    if (selectedSessionFilterIds.length === 0) return null;
    return {
      sessionIds: selectedSessionFilterIds,
      rowCount: pagedFilteredCount,
      forecastCents: pagedFooterTotals.forecastCents,
      actualCents: pagedFooterTotals.actualCents,
    };
  }, [selectedSessionFilterIds, pagedFilteredCount, pagedFooterTotals]);
  const activeSessionFilterTitle = useMemo(() => {
    if (selectedSessionFilterIds.length !== 1) return null;
    return sessionOptions.find((option) => option.id === selectedSessionFilterIds[0])?.title ?? "Selected session";
  }, [selectedSessionFilterIds, sessionOptions]);
  const categoryFooterTotal = useMemo<CategoryFooterTotal | null>(() => {
    const category = lineItemsFilterCategory.trim();
    if (!category) return null;
    return {
      category,
      rowCount: pagedFilteredCount,
      forecastCents: pagedFooterTotals.forecastCents,
      actualCents: pagedFooterTotals.actualCents,
      varianceCents: pagedFooterTotals.varianceCents,
    };
  }, [lineItemsFilterCategory, pagedFilteredCount, pagedFooterTotals]);
  const categoryFooterVarianceClass =
    !categoryFooterTotal || categoryFooterTotal.varianceCents <= 0 ? "text-emerald-700" : "text-rose-700";

  const lineItemsFilteredCount = pagedFilteredCount;
  const lineItemsLastPage = Math.max(0, Math.ceil(lineItemsFilteredCount / lineItemsPageSize) - 1);
  const lineItemsPageIndex = Math.min(lineItemsPage, lineItemsLastPage);
  const lineItemsRangeStart = lineItemsFilteredCount === 0 ? 0 : lineItemsPageIndex * lineItemsPageSize + 1;
  const lineItemsRangeEnd =
    lineItemsFilteredCount === 0 ? 0 : Math.min(lineItemsFilteredCount, lineItemsRangeStart + filteredLineItems.length - 1);
  // The loaded page IS what the server returned for the current page index.
  const paginatedLineItems = filteredLineItems;
  const hasActiveLineItemFilters = Boolean(
    lineItemsFilterCategory.trim() ||
      lineItemsFilterSubcategory.trim() ||
      lineItemsFilterStatus ||
      lineItemsFilterApproval ||
      lineItemsSearch.trim() ||
      lineItemsFilterSession.trim() ||
      lineItemsFilterGroup.trim(),
  );
  const activeLineItemFilterCount = [
    lineItemsFilterCategory.trim(),
    lineItemsFilterSubcategory.trim(),
    lineItemsFilterStatus,
    lineItemsFilterApproval,
    lineItemsSearch.trim(),
    lineItemsFilterSession.trim(),
    lineItemsFilterGroup.trim(),
  ].filter(Boolean).length;

  function clearLineItemFilters() {
    setLineItemsFilterCategory("");
    setLineItemsFilterSubcategory("");
    setLineItemsFilterStatus("");
    setLineItemsFilterApproval("");
    setLineItemsSearch("");
    setLineItemsFilterSession("");
    setLineItemsFilterGroup("");
    setLineItemsFiltersOpen(false);
  }

  const shouldShowLineItemFilters = lineItemsFiltersOpen || hasActiveLineItemFilters;

  // Locked (submitted) line item ids — memoized so this Set is not rebuilt on
  // every keystroke; it only depends on the submissions payload.
  const lockedLineItemIds = useMemo(
    () =>
      new Set<string>(
        (submissions ?? [])
          .filter((s) => s.status === "SUBMITTED")
          .flatMap((s) =>
            (s.lineItems ?? [])
              .map((li) => (li as { budgetLineItemId?: string; id?: string }).budgetLineItemId ?? li.id)
              .filter((value): value is string => Boolean(value)),
          ),
      ),
    [submissions],
  );
  const isLineItemLocked = useCallback((id: string) => lockedLineItemIds.has(id), [lockedLineItemIds]);
  const selectableFilteredLineItemIds = useMemo(
    () =>
      filteredLineItems
        .filter((item) => !lockedLineItemIds.has(item.id) && !isTemporaryLineItemId(item.id))
        .map((item) => item.id),
    [filteredLineItems, lockedLineItemIds],
  );
  const selectedEditableLineItemIds = selectedLineItemIds.filter((lineItemId) => !isLineItemLocked(lineItemId) && !isTemporaryLineItemId(lineItemId));
  const allFilteredSelectableSelected =
    selectableFilteredLineItemIds.length > 0 &&
    selectableFilteredLineItemIds.every((lineItemId) => selectedLineItemIds.includes(lineItemId));
  const hasSomeSelected = selectedCount > 0;
  const isTableEditable = Boolean(budget) && !isMutating && budget?.status !== "APPROVED";
  const isInEditFlow = isTableEditable || Boolean(newlyAddedRowId);
  const hasUnsavedBudgetChanges = dirtyLineItemIds.size > 0;
  const selectedLineItemLocked = selectedLineItem ? isLineItemLocked(selectedLineItem.id) : false;
  const totalsVarianceIsUnder = totals.varianceCents <= 0;
  const isLineItemApprovalDrawer = approvalDrawerMode === "lineItem";
  const panelStatus: BudgetStatus | BudgetSubmissionStatus = selectedSubmission?.status === "PULLED_BACK"
    ? "DRAFT"
    : (selectedSubmission?.status ?? "DRAFT");
  const approvalStepper = stepperState(panelStatus);
  const connectorClass = (value: "pending" | "complete" | "rejected") => {
    if (value === "complete") return "bg-emerald-500";
    if (value === "rejected") return "bg-rose-500";
    return "bg-slate-200";
  };

  useEffect(() => {
    setLineItemsFilterCategory(urlLineItemFilters.category);
    setLineItemsFilterSubcategory(urlLineItemFilters.subcategory);
    setLineItemsFilterStatus(urlLineItemFilters.status);
    setLineItemsFilterApproval(urlLineItemFilters.approval);
    setLineItemsSearch(urlLineItemFilters.search);
    setLineItemsFilterSession(urlLineItemFilters.session);
    setLineItemsFilterGroup(urlLineItemFilters.groupId);
    setLineItemsPage(0);
    setLineItemsPageSize(LINE_ITEMS_DEFAULT_PAGE_SIZE);
  }, [
    selectedEventId,
    urlLineItemFilters.category,
    urlLineItemFilters.subcategory,
    urlLineItemFilters.status,
    urlLineItemFilters.approval,
    urlLineItemFilters.search,
    urlLineItemFilters.session,
    urlLineItemFilters.groupId,
  ]);

  // One place that turns the active filter/search/sort state into query params,
  // shared by the paged rows fetch, the ids-only bulk-select fetch, and filtered
  // export — so all three always agree on what "the current filtered view" is.
  const buildLineItemFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (lineItemsFilterCategory.trim()) params.set("category", lineItemsFilterCategory.trim());
    if (lineItemsFilterSubcategory.trim()) params.set("subcategory", lineItemsFilterSubcategory.trim());
    if (lineItemsFilterStatus) params.set("status", lineItemsFilterStatus);
    if (lineItemsFilterApproval) params.set("approval", lineItemsFilterApproval);
    if (debouncedLineItemsSearch.trim()) params.set("search", debouncedLineItemsSearch.trim());
    if (lineItemsFilterSession.trim()) params.set("sessionId", lineItemsFilterSession.trim());
    if (lineItemsFilterGroup.trim()) params.set("groupId", lineItemsFilterGroup.trim());
    params.set("sort", lineItemsSort);
    params.set("dir", lineItemsSortDir);
    return params;
  }, [
    lineItemsFilterCategory,
    lineItemsFilterSubcategory,
    lineItemsFilterStatus,
    lineItemsFilterApproval,
    debouncedLineItemsSearch,
    lineItemsFilterSession,
    lineItemsFilterGroup,
    lineItemsSort,
    lineItemsSortDir,
  ]);

  // Debounce the search box so typing doesn't fire a request per keystroke; the
  // paged fetch and page-reset both key off the debounced value.
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedLineItemsSearch(lineItemsSearch), 300);
    return () => window.clearTimeout(handle);
  }, [lineItemsSearch]);

  useEffect(() => {
    setLineItemsPage(0);
  }, [
    lineItemsFilterCategory,
    lineItemsFilterSubcategory,
    lineItemsFilterStatus,
    lineItemsFilterApproval,
    debouncedLineItemsSearch,
    lineItemsFilterSession,
    lineItemsFilterGroup,
    lineItemsPageSize,
    lineItemsSort,
    lineItemsSortDir,
  ]);

  useEffect(() => {
    const last = Math.max(0, Math.ceil(lineItemsFilteredCount / lineItemsPageSize) - 1);
    setLineItemsPage((page) => Math.min(page, last));
  }, [lineItemsFilteredCount, lineItemsPageSize]);

  // Server-paged rows: fetch the current page (with filter/search/sort) from
  // Endpoint B whenever any query input changes. Stale responses are dropped via a
  // monotonic request token. Header/global totals do NOT come from here — they
  // stay authoritative from the snapshot (see committedTotalsBase).
  useEffect(() => {
    if (!selectedEventId) {
      setPagedLineItems([]);
      setPagedFilteredCount(0);
      setPagedFooterTotals(SERVER_EMPTY_FOOTER_TOTALS);
      return;
    }

    const requestToken = ++lineItemsPageRequestRef.current;
    const params = buildLineItemFilterParams();
    params.set("page", String(lineItemsPage + 1));
    params.set("pageSize", String(lineItemsPageSize));

    setIsLineItemsPageLoading(true);
    setPagedLineItems([]);
    void (async () => {
      try {
        const response = await fetch(`/api/events/${selectedEventId}/budget/line-items?${params.toString()}`);
        const payload = await response.json();
        if (requestToken !== lineItemsPageRequestRef.current) return; // stale
        if (!response.ok) {
          setErrorMessage(toErrorMessage(payload, "Failed to load budget line items"));
          return;
        }
        const result = payload as {
          rows: BudgetLineItem[];
          filteredCount: number;
          filteredFooterTotals: { forecastCents: number; actualCents: number; varianceCents: number };
        };
        setPagedLineItems(result.rows);
        setPagedFilteredCount(result.filteredCount);
        setPagedFooterTotals(result.filteredFooterTotals);
      } catch (error) {
        if (requestToken !== lineItemsPageRequestRef.current) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load budget line items.");
      } finally {
        if (requestToken === lineItemsPageRequestRef.current) setIsLineItemsPageLoading(false);
      }
    })();
  }, [
    selectedEventId,
    lineItemsPage,
    lineItemsPageSize,
    // buildLineItemFilterParams changes identity whenever any filter/search/sort
    // input changes, so it captures all of those without listing each here.
    buildLineItemFilterParams,
    lineItemsRefreshToken,
  ]);

  useEffect(() => {
    debugBudgetClientLog("DEBUG RECIPIENTS client:submissionRecipients", {
      selectedEventId,
      submissionRecipientCount: submissionRecipients.length,
      submissionRecipientIds: submissionRecipients.map((recipient) => recipient.id),
    });
  }, [selectedEventId, submissionRecipients]);

  useEffect(() => {
    debugBudgetClientLog("DEBUG RECIPIENTS client:selectedSubmission", {
      selectedEventId,
      submissionId: selectedSubmission?.id ?? null,
      recipientCount: selectedSubmission?.recipients?.length ?? 0,
      recipients: (selectedSubmission?.recipients ?? []).map((recipient) => ({
        id: recipient?.id ?? null,
        email: recipient?.email ?? null,
        name: recipient?.name ?? null,
      })),
    });
  }, [selectedEventId, selectedSubmission]);

  const isLineItemReadOnly = useCallback(
    (item: BudgetLineItem): boolean => !isTableEditable || !item.id,
    [isTableEditable],
  );

  // Row-level handlers below are wrapped in useCallback with narrow, typing-stable
  // dependencies so that (after row extraction) editing one row does not churn the
  // callback references passed to every other memoized row. All use functional
  // state updaters so they never depend on the frequently-changing draft maps.
  const markLineItemDirty = useCallback((lineItemId: string) => {
    setDirtyLineItemIds((current) => {
      const next = new Set(current);
      next.add(lineItemId);
      return next;
    });
    // Snapshot the committed base once, when the row first becomes dirty, so the
    // global-total delta and off-page save/discard use the pre-edit committed
    // values even after further keystrokes. Do not overwrite an existing entry.
    setDirtyOverlay((current) => {
      if (current[lineItemId]) return current;
      const committedItem = committedLineItemsByIdRef.current.get(lineItemId);
      if (!committedItem) return current;
      return {
        ...current,
        [lineItemId]: {
          committedItem,
          committedForecastCents: committedItem.forecastCents,
          committedActualCents: committedItem.actualCents,
        },
      };
    });
    setSavedLineItemIds((current) => {
      if (!current.has(lineItemId)) return current;
      const next = new Set(current);
      next.delete(lineItemId);
      return next;
    });
    setRowErrors((current) => {
      if (!current[lineItemId]) return current;
      const next = { ...current };
      delete next[lineItemId];
      return next;
    });
  }, []);

  // Stable ref-registration callbacks so the row's forecast input / category
  // select can register into the parent-owned ref maps without a fresh closure
  // per parent render (used by the extracted BudgetRow in the next prompt).
  const registerForecastInput = useCallback((id: string, node: HTMLInputElement | null) => {
    forecastInputRefs.current[id] = node;
  }, []);
  const registerCategorySelect = useCallback((id: string, node: HTMLSelectElement | null) => {
    categorySelectRefs.current[id] = node;
  }, []);

  const clearLineItemRowState = useCallback((lineItemId: string) => {
    setDirtyLineItemIds((current) => {
      if (!current.has(lineItemId)) return current;
      const next = new Set(current);
      next.delete(lineItemId);
      return next;
    });
    // Drop the overlay entry so a saved/cancelled row no longer contributes a
    // delta to the global totals (its new committed value is now in the base).
    setDirtyOverlay((current) => {
      if (!current[lineItemId]) return current;
      const next = { ...current };
      delete next[lineItemId];
      return next;
    });
    setRowErrors((current) => {
      if (!current[lineItemId]) return current;
      const next = { ...current };
      delete next[lineItemId];
      return next;
    });
  }, []);

  // Re-fetch the current page rows without disturbing parent-owned draft/overlay
  // state (used after a mutation so committed values on the visible page refresh).
  const refreshBudgetLineItemsPage = useCallback(() => {
    setLineItemsRefreshToken((token) => token + 1);
  }, []);

  // Re-fetch ONLY the authoritative global totals + count from the light snapshot,
  // merging them into the shell. Unlike loadBudget this preserves selection, drafts,
  // dirty overlay, and temp rows, so it is safe to call mid-edit after a single row
  // save. Keeps header totals global and correct once a committed value changes.
  const refreshBudgetShellTotals = useCallback(async (eventId: string) => {
    if (!eventId) return;
    try {
      const params = new URLSearchParams({
        source: "totals-refresh",
        includeSubmissions: "0",
        includeSubmissionDetails: "0",
        includeLineItems: "0",
      });
      const response = await fetch(`/api/events/${eventId}/budget?${params.toString()}`);
      if (!response.ok) return;
      const payload = (await response.json()) as BudgetResponse;
      setBudgetData((current) =>
        current ? { ...current, totals: payload.totals, lineItemCount: payload.lineItemCount } : current,
      );
    } catch {
      // Totals refresh is best-effort; the next full load reconciles.
    }
  }, []);

  // Reconcile both the visible page and the authoritative global totals after a
  // committed mutation (save/delete/assign) under server-side pagination.
  const reconcileBudgetAfterMutation = useCallback(() => {
    const eventId = selectedEventIdRef.current;
    refreshBudgetLineItemsPage();
    void refreshBudgetShellTotals(eventId);
    void reloadSessionGroupOptions(eventId);
    if (eventId) {
      window.dispatchEvent(new CustomEvent("budget-groups:changed", { detail: { eventId } }));
      window.dispatchEvent(new CustomEvent("budget-financials:changed", { detail: { eventId } }));
    }
  }, [refreshBudgetLineItemsPage, refreshBudgetShellTotals, reloadSessionGroupOptions]);

  // User-facing, server-backed sort: clicking a column sorts ascending, clicking
  // the active column again flips direction. The server owns ordering so page
  // boundaries stay stable. Amount columns default to descending (largest first).
  const handleToggleSort = useCallback((column: LineItemSortColumn) => {
    if (lineItemsSort === column) {
      setLineItemsSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setLineItemsSort(column);
    setLineItemsSortDir(column === "forecastCents" || column === "actualCents" ? "desc" : "asc");
  }, [lineItemsSort]);

  const renderSortableHeader = (
    label: string,
    column: LineItemSortColumn,
    key?: string,
    reorderColumn?: ColumnOrderItem<BudgetColumnId>,
  ) => {
    const active = lineItemsSort === column;
    const headerContent = (
      <button
        type="button"
        onClick={(event) => {
          if (shouldSuppressHeaderClick()) {
            event.preventDefault();
            return;
          }
          handleToggleSort(column);
        }}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900"
        aria-label={`Sort by ${label}${active ? (lineItemsSortDir === "asc" ? ", ascending" : ", descending") : ""}`}
      >
        {label}
        <span aria-hidden="true" className={active ? "text-slate-900" : "text-slate-300"}>
          {active ? (lineItemsSortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    );

    if (reorderColumn) {
      return (
        <th
          key={key}
          {...getHeaderReorderProps(reorderColumn)}
          className={getHeaderReorderClassName(
            reorderColumn.id,
            "whitespace-nowrap px-3 py-2 text-[10px] uppercase tracking-wide text-slate-600",
          )}
        >
          <div className="flex items-center gap-1.5">
            <ColumnHeaderDragHandle />
            {headerContent}
          </div>
        </th>
      );
    }

    return (
      <th
        key={key}
        className="whitespace-nowrap px-3 py-2 text-[10px] uppercase tracking-wide text-slate-600"
        data-column-pinned-header={key === "category" ? "category" : undefined}
      >
        {headerContent}
      </th>
    );
  };

  const renderBudgetColumnHeader = (column: ColumnOrderItem<BudgetColumnId>) => {
    switch (column.id) {
      case "session":
      case "group":
      case "variance":
      case "docs":
        return (
          <th
            key={column.id}
            {...getHeaderReorderProps(column)}
            className={getHeaderReorderClassName(
              column.id,
              "whitespace-nowrap px-3 py-2 text-[10px] uppercase tracking-wide text-slate-600",
            )}
          >
            <div className="flex items-center gap-1.5">
              <ColumnHeaderDragHandle />
              <span>{column.label}</span>
            </div>
          </th>
        );
      case "forecast":
        return renderSortableHeader("Forecast", "forecastCents", column.id, column);
      case "actual":
        return renderSortableHeader("Actual", "actualCents", column.id, column);
      case "vendor":
        return renderSortableHeader("Vendor", "vendor", column.id, column);
      case "status":
        return renderSortableHeader("Status", "status", column.id, column);
      case "approval":
        return renderSortableHeader("Approval", "approval", column.id, column);
      default:
        return null;
    }
  };

  const applyPersistedLineItem = useCallback((savedItem: BudgetLineItem) => {
    setBudgetData((current) => {
      if (!current) return current;
      return {
        ...current,
        lineItems: current.lineItems.map((item) => (item.id === savedItem.id
          ? {
              ...item,
              ...savedItem,
              documentCount: item.documentCount,
              firstDocumentId: item.firstDocumentId,
            }
          : item)),
      };
    });
    setAmountDrafts((current) => ({
      ...current,
      [savedItem.id]: defaultAmountDraft(savedItem),
    }));
    setLineItemDrafts((current) => ({
      ...current,
      [savedItem.id]: defaultLineItemDraft(savedItem),
    }));
  }, []);

  const bulkDeleteDisabledReason = !budget
    ? "No budget loaded"
    : selectedLineItemIds.length === 0
      ? "Select line items to delete"
      : budget.status === "APPROVED"
        ? "Approved budget cannot be modified"
        : isMutating
          ? "Working..."
          : "";
  const canDeleteSelected = bulkDeleteDisabledReason.length === 0;
  const submitDisabledReason = !selectedLineItemId
      ? "Select one line item first"
      : isMutating
        ? "Please wait for current update"
      : selectedLineItemLocked
        ? "Selected line item is already submitted"
      : budget?.status === "APPROVED"
            ? "Approved budget cannot be submitted"
            : "";
  const canPullBackSelected = Boolean(selectedSubmission && selectedSubmission.status === "SUBMITTED" && !isMutating);
  const pullbackDisabledReason = !selectedSubmission
    ? "No submission selected"
    : selectedSubmission.status !== "SUBMITTED"
      ? "Only submitted entries can be pulled back"
      : isMutating
        ? "Please wait for current update"
        : "";
  const showSubmitAction = budgetApprovalsEnabled && !selectedSubmission;
  const showReviewActions = budgetApprovalsEnabled && Boolean(selectedSubmission && selectedSubmission.status === "SUBMITTED");

  const activateEditModeForTable = useCallback(() => {
    if (isApproved) return;
    if (isInEditFlow) return;
    setIsEditMode(true);
    setErrorMessage(null);
  }, [isApproved, isInEditFlow]);

  const focusEditableRow = useCallback((lineItemId: string) => {
    window.requestAnimationFrame(() => {
      const categorySelect = categorySelectRefs.current[lineItemId];
      if (categorySelect) {
        categorySelect.focus();
      }
    });
  }, []);

  const shouldIgnoreRowClick = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest(
        "button,a,input,select,textarea,label,[role='button'],[role='menuitem'],[data-row-interactive='true']",
      ),
    );
  }, []);

  const toggleLineItemSelection = useCallback((lineItemId: string) => {
    activateEditModeForTable();
    setSelectedLineItemIds((current) => {
      const nextSelection = current.includes(lineItemId)
        ? current.filter((id) => id !== lineItemId)
        : [...current, lineItemId];

      setSelectedLineItemId((currentActive) => {
        if (nextSelection.length === 0) return null;
        if (currentActive && nextSelection.includes(currentActive)) return currentActive;
        return lineItemId;
      });

      return nextSelection;
    });
  }, [activateEditModeForTable]);

  // Bulk-select the CURRENT PAGE's selectable rows (toggle).
  function toggleSelectAllLineItems() {
    activateEditModeForTable();
    setSelectedLineItemIds(() => {
      const nextSelection = allFilteredSelectableSelected ? [] : selectableFilteredLineItemIds;
      setSelectedLineItemId((currentActive) => {
        if (nextSelection.length === 0) return null;
        if (currentActive && nextSelection.includes(currentActive)) return currentActive;
        return nextSelection[0] ?? null;
      });
      return nextSelection;
    });
  }

  // Bulk-select EVERY row matching the active filter/search (across all pages) via
  // the ids-only endpoint — or every row when no filter is active. Selection is
  // ID-based so it survives paging. Locked/temporary rows are excluded (not editable).
  async function handleSelectAllFilteredLineItems() {
    if (!selectedEventId) return;
    try {
      const response = await fetch(
        `/api/events/${selectedEventId}/budget/line-items/ids?${buildLineItemFilterParams().toString()}`,
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(toErrorMessage(payload, "Failed to select all rows"));
      }
      const payload = (await response.json()) as { ids: string[] };
      const selectable = payload.ids.filter(
        (id) => !isLineItemLocked(id) && !isTemporaryLineItemId(id),
      );
      activateEditModeForTable();
      setSelectedLineItemIds(selectable);
      setSelectedLineItemId(selectable[0] ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to select all rows");
    }
  }

  const handleLineItemRowClick = useCallback((event: ReactMouseEvent<HTMLTableRowElement>, lineItemId: string) => {
    if (shouldIgnoreRowClick(event.target)) return;
    activateEditModeForTable();
    setSelectedLineItemId(lineItemId);
    focusEditableRow(lineItemId);
  }, [shouldIgnoreRowClick, activateEditModeForTable, focusEditableRow]);

  function applyBulkCategory(category: string) {
    if (!isInEditFlow) {
      setBudgetNotice({
        tone: "info",
        title: "Budget is read-only",
        detail: "This budget cannot be edited right now.",
      });
      return;
    }
    if (!category.trim() || selectedEditableLineItemIds.length === 0) return;

    setLineItemDrafts((previousDrafts) => {
      const nextDrafts = { ...previousDrafts };
      for (const lineItemId of selectedEditableLineItemIds) {
        const item = lineItems.find((lineItem) => lineItem.id === lineItemId);
        if (!item) continue;
        nextDrafts[lineItemId] = {
          ...(previousDrafts[lineItemId] ?? defaultLineItemDraft(item)),
          category,
        };
      }
      return nextDrafts;
    });
    setDirtyLineItemIds((current) => {
      const next = new Set(current);
      for (const lineItemId of selectedEditableLineItemIds) next.add(lineItemId);
      return next;
    });
    setSavedLineItemIds((current) => {
      const next = new Set(current);
      for (const lineItemId of selectedEditableLineItemIds) next.delete(lineItemId);
      return next;
    });

    setBudgetNotice({
      tone: "info",
      title: "Bulk category applied",
      detail: "Review the selected rows, then save each changed row when ready.",
    });
  }

  function applyBulkStatus(status: LineItemStatus) {
    if (!isInEditFlow) {
      setBudgetNotice({
        tone: "info",
        title: "Budget is read-only",
        detail: "This budget cannot be edited right now.",
      });
      return;
    }
    if (selectedEditableLineItemIds.length === 0) return;

    setLineItemDrafts((previousDrafts) => {
      const nextDrafts = { ...previousDrafts };
      for (const lineItemId of selectedEditableLineItemIds) {
        const item = lineItems.find((lineItem) => lineItem.id === lineItemId);
        if (!item) continue;
        nextDrafts[lineItemId] = {
          ...(previousDrafts[lineItemId] ?? defaultLineItemDraft(item)),
          status,
        };
      }
      return nextDrafts;
    });
    setDirtyLineItemIds((current) => {
      const next = new Set(current);
      for (const lineItemId of selectedEditableLineItemIds) next.add(lineItemId);
      return next;
    });
    setSavedLineItemIds((current) => {
      const next = new Set(current);
      for (const lineItemId of selectedEditableLineItemIds) next.delete(lineItemId);
      return next;
    });

    setBudgetNotice({
      tone: "info",
      title: "Bulk status applied",
      detail: "Review the selected rows, then save each changed row when ready.",
    });
  }

  const openApprovalDrawerForLineItem = useCallback((lineItemId: string) => {
    if (!budgetApprovalsEnabled) return;
    const item = lineItems.find((lineItem) => lineItem.id === lineItemId);
    const rowApprovalState = item ? resolveLineItemApprovalState(item, submissionThreads.get(lineItemId)) : "PENDING";
    setSelectedLineItemId(lineItemId);
    setSelectedThreadLineItemId(submissionThreads.has(lineItemId) ? lineItemId : null);
    if (rowApprovalState === "PENDING") {
      setSelectedRecipientIds([]);
      setSubmissionMessage("");
      setIsApprovalDrawerOpen(false);
      setIsSubmitModalOpen(true);
      return;
    }
    setApprovalDrawerMode("lineItem");
    setIsApprovalDrawerOpen(true);
    if (selectedEventId) void loadApprovalData(selectedEventId);
  }, [budgetApprovalsEnabled, lineItems, submissionThreads, selectedEventId, loadApprovalData]);

  function openApprovalDrawer() {
    setApprovalDrawerMode("global");
    setSelectedThreadLineItemId(null);
    setIsApprovalDrawerOpen(true);
    if (selectedEventId) void loadApprovalData(selectedEventId);
  }

  async function handleAddLineItem() {
    if (!selectedEventId || !budgetData?.budget) return;
    if (isMutating || savingLineItemId) return;
    if (budget?.status === "APPROVED") return;

    setErrorMessage(null);
    const temporaryLineItem = createTemporaryLineItem(budgetData.budget.id);

    setBudgetData((current) => current
      ? {
          ...current,
          lineItems: [temporaryLineItem, ...current.lineItems],
        }
      : current);
    setAmountDrafts((current) => ({
      ...current,
      [temporaryLineItem.id]: defaultAmountDraft(temporaryLineItem),
    }));
    setLineItemDrafts((current) => ({
      ...current,
      [temporaryLineItem.id]: defaultLineItemDraft(temporaryLineItem),
    }));
    setDirtyLineItemIds((current) => new Set(current).add(temporaryLineItem.id));
    setNewlyAddedRowId(temporaryLineItem.id);
    setIsEditMode(true);
    setSelectedLineItemId(temporaryLineItem.id);
    focusLineItemIdRef.current = temporaryLineItem.id;
    focusForecastIdRef.current = temporaryLineItem.id;
  }

  async function handleSaveLineItemRow(item: BudgetLineItem): Promise<boolean> {
    if (!selectedEventId || isApproved || savingLineItemId) return false;
    if (isLineItemLocked(item.id) && !isTemporaryLineItemId(item.id)) return false;

    const amountDraft = amountDrafts[item.id] ?? defaultAmountDraft(item);
    const textDraft = lineItemDrafts[item.id] ?? defaultLineItemDraft(item);
    const payloadResult = buildLineItemPayload(amountDraft, textDraft);
    if (payloadResult.invalidMessage || !payloadResult.payload) {
      setRowErrors((current) => ({
        ...current,
        [item.id]: payloadResult.invalidMessage ?? "Could not save row.",
      }));
      return false;
    }

    const patch = buildLineItemPatch(item, amountDraft, textDraft).patch;
    const isTemporary = isTemporaryLineItemId(item.id);
    if (!isTemporary && !patch) {
      clearLineItemRowState(item.id);
      setSavedLineItemIds((current) => new Set(current).add(item.id));
      window.setTimeout(() => {
        setSavedLineItemIds((current) => {
          if (!current.has(item.id)) return current;
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }, 1400);
      return true;
    }

    setSavingLineItemId(item.id);
    setRowErrors((current) => {
      if (!current[item.id]) return current;
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    try {
      const response = await fetch(
        isTemporary
          ? `/api/events/${selectedEventId}/budget/line-items`
          : `/api/events/${selectedEventId}/budget/line-items/${item.id}`,
        {
          method: isTemporary ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isTemporary
              ? { ...payloadResult.payload, approval: "PENDING", matrixRowId: item.matrixRowId }
              : patch,
          ),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to save line item"));
      }

      const savedItem = {
        ...(payload as BudgetLineItem),
        documentCount: item.documentCount,
        firstDocumentId: item.firstDocumentId,
        linkedSessionRequirement: (payload as Partial<BudgetLineItem>).linkedSessionRequirement ?? item.linkedSessionRequirement ?? null,
      };
      if (isTemporary) {
        setBudgetData((current) => {
          if (!current) return current;
          return {
            ...current,
            lineItems: current.lineItems.map((lineItem) => (lineItem.id === item.id ? savedItem : lineItem)),
          };
        });
        setAmountDrafts((current) => {
          const next = { ...current };
          delete next[item.id];
          next[savedItem.id] = defaultAmountDraft(savedItem);
          return next;
        });
        setLineItemDrafts((current) => {
          const next = { ...current };
          delete next[item.id];
          next[savedItem.id] = defaultLineItemDraft(savedItem);
          return next;
        });
        clearLineItemRowState(item.id);
        setNewlyAddedRowId((current) => (current === item.id ? null : current));
        setSelectedLineItemId((current) => (current === item.id ? savedItem.id : current));
      } else {
        applyPersistedLineItem(savedItem);
        clearLineItemRowState(item.id);
      }

      setSavedLineItemIds((current) => new Set(current).add(savedItem.id));
      window.setTimeout(() => {
        setSavedLineItemIds((current) => {
          if (!current.has(savedItem.id)) return current;
          const next = new Set(current);
          next.delete(savedItem.id);
          return next;
        });
      }, 1400);
      return true;
    } catch (error) {
      setRowErrors((current) => ({
        ...current,
        [item.id]: error instanceof Error ? error.message : "Failed to save line item.",
      }));
      return false;
    } finally {
      setSavingLineItemId(null);
    }
  }

  function handleCancelLineItemRow(item: BudgetLineItem) {
    if (savingLineItemId === item.id) return;

    if (isTemporaryLineItemId(item.id)) {
      setBudgetData((current) => current
        ? {
            ...current,
            lineItems: current.lineItems.filter((lineItem) => lineItem.id !== item.id),
          }
        : current);
      setAmountDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setLineItemDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      clearLineItemRowState(item.id);
      setNewlyAddedRowId((current) => (current === item.id ? null : current));
      setSelectedLineItemId((current) => (current === item.id ? null : current));
      return;
    }

    setAmountDrafts((current) => ({
      ...current,
      [item.id]: defaultAmountDraft(item),
    }));
    setLineItemDrafts((current) => ({
      ...current,
      [item.id]: defaultLineItemDraft(item),
    }));
    clearLineItemRowState(item.id);
    setSavedLineItemIds((current) => {
      if (!current.has(item.id)) return current;
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  }

  function handleRemoveNewLineItem(item: BudgetLineItem) {
    if (!isTemporaryLineItemId(item.id) || savingLineItemId === item.id) return;

    const undoSnapshot: NewBudgetRowUndo = {
      item,
      amountDraft: amountDrafts[item.id] ?? defaultAmountDraft(item),
      textDraft: lineItemDrafts[item.id] ?? defaultLineItemDraft(item),
    };
    handleCancelLineItemRow(item);
    setSelectedLineItemIds((current) => current.filter((id) => id !== item.id));
    setBudgetNotice({
      tone: "info",
      title: "New row removed",
      actionLabel: "Undo",
      onAction: () => {
        setBudgetData((current) => current
          ? { ...current, lineItems: [undoSnapshot.item, ...current.lineItems] }
          : current);
        setAmountDrafts((current) => ({ ...current, [undoSnapshot.item.id]: undoSnapshot.amountDraft }));
        setLineItemDrafts((current) => ({ ...current, [undoSnapshot.item.id]: undoSnapshot.textDraft }));
        setDirtyLineItemIds((current) => new Set(current).add(undoSnapshot.item.id));
        setNewlyAddedRowId(undoSnapshot.item.id);
        setBudgetNotice({ tone: "info", title: "New row restored" });
      },
    });
  }

  async function handleSaveAllLineItemChanges() {
    if (!hasUnsavedBudgetChanges || !selectedEventId || savingLineItemId) return;
    const dirtyIds = Array.from(dirtyLineItemIds);
    let failedCount = 0;

    for (const lineItemId of dirtyIds) {
      // Off-page dirty rows are no longer in the loaded set; fall back to the
      // committed row captured in the overlay so save-all persists every dirty
      // row regardless of the current page. Drafts are parent-owned by ID.
      const item = lineItems.find((lineItem) => lineItem.id === lineItemId)
        ?? dirtyOverlay[lineItemId]?.committedItem;
      if (!item) continue;
      const saved = await handleSaveLineItemRow(item);
      if (!saved) failedCount += 1;
    }

    // Reconcile once for the whole batch: refresh the visible page and the
    // authoritative global totals (some rows may have committed even on partial
    // failure).
    reconcileBudgetAfterMutation();

    if (failedCount > 0) {
      setBudgetNotice({
        tone: "info",
        title: "Some changes need attention",
        detail: `${failedCount} row${failedCount === 1 ? "" : "s"} could not be saved. Review the inline row messages.`,
      });
      return;
    }

    setBudgetNotice({
      tone: "success",
      title: `Updated ${dirtyIds.length} line item${dirtyIds.length === 1 ? "" : "s"}`,
      detail: "Budget changes saved.",
    });
  }

  function handleDiscardAllLineItemChanges() {
    if (!hasUnsavedBudgetChanges || savingLineItemId) {
      void handleCancelEdit();
      return;
    }

    const dirtyIds = Array.from(dirtyLineItemIds);
    for (const lineItemId of dirtyIds) {
      // Discard off-page dirty rows too, reconstructing them from the overlay's
      // committed snapshot when they are no longer loaded on the current page.
      const item = lineItems.find((lineItem) => lineItem.id === lineItemId)
        ?? dirtyOverlay[lineItemId]?.committedItem;
      if (item) handleCancelLineItemRow(item);
    }
    setIsEditMode(false);
    setBudgetNotice({
      tone: "info",
      title: "Budget changes discarded",
      detail: "Unsaved row edits were reset.",
    });
  }

  const updateAmount = useCallback((
    item: BudgetLineItem,
    field: "forecastCents" | "actualCents",
    rawValue: string,
  ) => {
    if (isLineItemReadOnly(item)) return;

    const parsed = parseCurrencyToCents(rawValue);
    if (parsed === null) {
      setAmountDrafts((prev) => ({
        ...prev,
        [item.id]: defaultAmountDraft(item),
      }));
      setErrorMessage("Amounts must be valid non-negative numbers.");
      return;
    }

    setAmountDrafts((prev) => ({
        ...prev,
        [item.id]: {
          forecast:
            field === "forecastCents"
              ? toCurrencyInput(parsed)
              : (prev[item.id]?.forecast ?? defaultAmountDraft(item).forecast),
          actual:
            field === "actualCents"
              ? toCurrencyInput(parsed)
              : (prev[item.id]?.actual ?? defaultAmountDraft(item).actual),
        },
      }));
    markLineItemDirty(item.id);
    setErrorMessage(null);
  }, [isLineItemReadOnly, markLineItemDirty]);

  const updateLineItemField = useCallback(async (
    item: BudgetLineItem,
    field: "category" | "subcategory" | "lineItem" | "vendor" | "status",
    rawValue: string | LineItemStatus,
  ) => {
    if (isLineItemReadOnly(item)) return;

    const trimmed = String(rawValue).trim();
    if (field !== "vendor" && !trimmed) {
      setErrorMessage(`${field} cannot be empty.`);
      setLineItemDrafts((prev) => ({
        ...prev,
        [item.id]: defaultLineItemDraft(item),
      }));
      return;
    }

    markLineItemDirty(item.id);
    setErrorMessage(null);
  }, [isLineItemReadOnly, markLineItemDirty]);

  // Persist a row's session link immediately through the canonical /links route,
  // then optimistically reflect the new matrixRowId + title in the grid.
  const handleAssignSession = useCallback(async (item: BudgetLineItem, matrixRowId: string | null) => {
    if (isLineItemReadOnly(item) || !selectedEventId) return;
    if (isTemporaryLineItemId(item.id)) {
      const session = matrixRowId ? sessionOptions.find((option) => option.id === matrixRowId) ?? null : null;
      setBudgetData((current) => current
        ? {
            ...current,
            lineItems: current.lineItems.map((row) =>
              row.id === item.id ? { ...row, matrixRowId, sessionTitle: session?.title ?? null } : row,
            ),
          }
        : current);
      return;
    }
    const requestKey = `${selectedEventId}:${item.id}`;
    if (assigningSessionRef.current.has(requestKey)) return;
    assigningSessionRef.current.add(requestKey);
    const session = matrixRowId ? sessionOptions.find((option) => option.id === matrixRowId) ?? null : null;
    try {
      const response = await fetch(`/api/events/${selectedEventId}/budget/line-items/${item.id}/links`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrixRowId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(toErrorMessage(payload, "Failed to update session"));
      }
      // Optimistically reflect the new session label on the visible page, then
      // reconcile so the server-scoped page/footer/count stay correct (the row may
      // leave the current filter).
      setPagedLineItems((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, matrixRowId, sessionTitle: session?.title ?? null } : row,
        ),
      );
      setErrorMessage(null);
      reconcileBudgetAfterMutation();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update session");
    } finally {
      assigningSessionRef.current.delete(requestKey);
    }
  }, [isLineItemReadOnly, selectedEventId, sessionOptions, reconcileBudgetAfterMutation]);

  // Assign a row to a group. A non-empty name that does not match an existing
  // group is created first (create-or-find), then the row is linked. Clearing
  // unassigns the row without deleting the group.
  const handleAssignGroup = useCallback(async (item: BudgetLineItem, rawName: string) => {
    if (isLineItemReadOnly(item) || isTemporaryLineItemId(item.id) || !selectedEventId) return;
    const name = rawName.replace(/\s+/g, " ").trim();
    if (name === (item.groupName ?? "")) return; // no-op

    try {
      let groupId: string | null = null;
      let groupName: string | null = null;
      let groupColor: string | null = null;
      if (name.length > 0) {
        const normalizedName = normalizedGroupName(name);
        const existing = groupOptions.find((option) => normalizedGroupName(option.name) === normalizedName);
        if (existing) {
          groupId = existing.id;
          groupName = existing.name;
          groupColor = existing.color;
        } else {
          const createRes = await fetch(`/api/events/${selectedEventId}/budget/groups`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          const createPayload = (await createRes.json().catch(() => null)) as { group?: BudgetGroupOption } | null;
          if (!createRes.ok || !createPayload?.group) {
            throw new Error(toErrorMessage(createPayload, "Failed to create group"));
          }
          groupId = createPayload.group.id;
          groupName = createPayload.group.name;
          groupColor = createPayload.group.color;
          setGroupOptions((current) => {
            const created = createPayload.group!;
            const withoutDuplicate = current.filter(
              (option) => option.id !== created.id && normalizedGroupName(option.name) !== normalizedGroupName(created.name),
            );
            return [...withoutDuplicate, created].sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      }

      const response = await fetch(`/api/events/${selectedEventId}/budget/line-items/${item.id}/links`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(toErrorMessage(payload, "Failed to update group"));
      }
      setPagedLineItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, groupId, groupName, groupColor } : row)),
      );
      setErrorMessage(null);
      reconcileBudgetAfterMutation();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update group");
    }
  }, [isLineItemReadOnly, selectedEventId, groupOptions, reconcileBudgetAfterMutation]);

  const handleDeleteGroup = useCallback(async (group: BudgetGroupOption) => {
    if (!selectedEventId || !group.id) return;
    const assignedCount = lineItems.filter((item) => item.groupId === group.id).length;
    if (
      assignedCount > 0 &&
      !window.confirm(`Delete group '${group.name}'? Existing budget rows will stay, but this group will be removed from them.`)
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/events/${selectedEventId}/budget/groups/${group.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { group?: { id?: string } } | { error?: string } | null;
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to delete group"));
      }

      setGroupOptions((current) => current.filter((option) => option.id !== group.id));
      if (lineItemsFilterGroup === group.id) setLineItemsFilterGroup("");
      setPagedLineItems((current) =>
        current.map((row) =>
          row.groupId === group.id ? { ...row, groupId: null, groupName: null, groupColor: null } : row,
        ),
      );
      setErrorMessage(null);
      reconcileBudgetAfterMutation();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete group");
    }
  }, [selectedEventId, lineItems, lineItemsFilterGroup, reconcileBudgetAfterMutation]);

  async function handleCancelEdit() {
    if (!selectedEventId || isMutating) {
      setIsEditMode(false);
      setNewlyAddedRowId(null);
      setDirtyLineItemIds(new Set());
      setDirtyOverlay({});
      setRowErrors({});
      setErrorMessage(null);
      return;
    }

    await loadBudget(selectedEventId);
    setIsEditMode(false);
    setNewlyAddedRowId(null);
    setErrorMessage(null);
  }

  function toggleRecipient(recipientUserId: string) {
    setSelectedRecipientIds((current) =>
      current.includes(recipientUserId)
        ? current.filter((id) => id !== recipientUserId)
        : [...current, recipientUserId],
    );
  }

  function handleCloseSubmitModal() {
    submitAbortControllerRef.current?.abort();
    submitAbortControllerRef.current = null;
    setIsSubmitModalOpen(false);
    setSelectedRecipientIds([]);
    setSubmissionMessage("");
  }

  async function handleSubmitSelectedForApproval() {
    if (!budgetApprovalsEnabled || !selectedEventId || !selectedLineItemId) return;
    if (selectedLineItemLocked) {
      setErrorMessage("Selected line item is already submitted.");
      return;
    }
    if (selectedRecipientIds.length === 0) {
      setErrorMessage("Select at least one recipient.");
      return;
    }

    const debugRequestId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    debugBudgetClientLog("DEBUG BUDGET SUBMIT client:submit:start", {
      debugRequestId,
      selectedEventId,
      selectedLineItemId,
      selectedRecipientIds,
    });
    setIsMutating(true);
    setErrorMessage(null);

    const abortController = new AbortController();
    submitAbortControllerRef.current = abortController;

    try {
      debugBudgetClientLog("DEBUG BUDGET SUBMIT client:submit:fetch:start", {
        debugRequestId,
        selectedEventId,
      });
      const response = await fetch(`/api/events/${selectedEventId}/budget/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          budgetLineItemId: selectedLineItemId,
          recipientUserIds: selectedRecipientIds,
          message: submissionMessage.trim() || null,
        }),
      });
      debugBudgetClientLog("DEBUG BUDGET SUBMIT client:submit:fetch:end", {
        debugRequestId,
        status: response.status,
        ok: response.ok,
      });
      debugBudgetClientLog("DEBUG BUDGET SUBMIT client:submit:json:start", { debugRequestId });
      const payload = await response.json();
      debugBudgetClientLog("DEBUG BUDGET SUBMIT client:submit:json:end", {
        debugRequestId,
        payloadType: typeof payload,
      });
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to submit selected line item"));
      }

      setIsSubmitModalOpen(false);
      setSelectedRecipientIds([]);
      setSubmissionMessage("");
      await loadBudget(selectedEventId, {
        preferLatestSubmittedSelection: true,
        includeSubmissions: true,
        includeSubmissionDetails: true,
        preserveTableState: true,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("budget.client.submit.error", {
        debugRequestId,
        message: error instanceof Error ? error.message : String(error),
      });
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit selected line item");
    } finally {
      if (submitAbortControllerRef.current === abortController) {
        submitAbortControllerRef.current = null;
      }
      setIsMutating(false);
      debugBudgetClientLog("DEBUG BUDGET SUBMIT client:submit:end", { debugRequestId });
    }
  }

  async function handlePullBackSubmission() {
    if (!selectedEventId || !selectedSubmission) return;
    if (selectedSubmission.status !== "SUBMITTED") return;

    const confirmed = window.confirm("Pull this submission back to draft for editing?");
    if (!confirmed) return;

    setIsMutating(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/events/${selectedEventId}/budget/submissions/${selectedSubmission.id}/pullback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to pull back submission"));
      }
      await loadBudget(selectedEventId, {
        preferLatestSubmittedSelection: true,
        includeSubmissions: true,
        includeSubmissionDetails: true,
        preserveTableState: true,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to pull back submission");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleApproveSubmission() {
    if (!selectedEventId || !selectedSubmission) return;
    if (selectedSubmission.status !== "SUBMITTED") return;

    const confirmed = window.confirm("Approve this submission?");
    if (!confirmed) return;

    setIsMutating(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/events/${selectedEventId}/budget/submissions/${selectedSubmission.id}/approve`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to approve submission"));
      }
      await loadBudget(selectedEventId, {
        includeSubmissions: true,
        includeSubmissionDetails: true,
        preserveTableState: true,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to approve submission");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleRejectSubmission() {
    if (!selectedEventId || !selectedSubmission) return;
    if (selectedSubmission.status !== "SUBMITTED") return;

    const confirmed = window.confirm("Reject this submission?");
    if (!confirmed) return;

    setIsMutating(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/events/${selectedEventId}/budget/submissions/${selectedSubmission.id}/reject`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to reject submission"));
      }
      await loadBudget(selectedEventId, {
        includeSubmissions: true,
        includeSubmissionDetails: true,
        preserveTableState: true,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reject submission");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleDeleteSelectedLineItems() {
    if (!selectedEventId || selectedLineItemIds.length === 0 || !canDeleteSelected) return;

    const confirmed = window.confirm(
      `Delete ${selectedLineItemIds.length} selected line item${selectedLineItemIds.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;

    const idsToDelete = [...selectedLineItemIds];

    setIsMutating(true);
    setErrorMessage(null);

    try {
      // One scoped bulk request instead of one DELETE per row.
      const response = await fetch(`/api/events/${selectedEventId}/budget/line-items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      const payload = (await response.json()) as {
        deletedCount?: number;
        skippedCount?: number;
        skippedIds?: string[];
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to delete selected line items"));
      }

      setPagedLineItems((current) => current.filter((row) => !idsToDelete.includes(row.id)));
      setSelectedLineItemIds((current) => current.filter((id) => !idsToDelete.includes(id)));
      setSelectedLineItemId((current) => (current && idsToDelete.includes(current) ? null : current));
      setNewlyAddedRowId((current) => (current && idsToDelete.includes(current) ? null : current));
      setAmountDrafts((current) => {
        const next = { ...current };
        for (const id of idsToDelete) delete next[id];
        return next;
      });
      setLineItemDrafts((current) => {
        const next = { ...current };
        for (const id of idsToDelete) delete next[id];
        return next;
      });
      setDirtyLineItemIds((current) => {
        const next = new Set(current);
        for (const id of idsToDelete) next.delete(id);
        return next;
      });
      setDirtyOverlay((current) => {
        const next = { ...current };
        for (const id of idsToDelete) delete next[id];
        return next;
      });
      setRowErrors((current) => {
        const next = { ...current };
        for (const id of idsToDelete) delete next[id];
        return next;
      });
      setSavedLineItemIds((current) => {
        const next = new Set(current);
        for (const id of idsToDelete) next.delete(id);
        return next;
      });
      reconcileBudgetAfterMutation();

      const deletedCount = payload.deletedCount ?? idsToDelete.length;
      const skippedCount = payload.skippedCount ?? 0;
      const deletedLabel = `Deleted ${deletedCount} line item${deletedCount === 1 ? "" : "s"}`;
      setBudgetNotice({
        tone: "success",
        title: "Line items deleted",
        detail:
          skippedCount > 0
            ? `${deletedLabel}; ${skippedCount} ${skippedCount === 1 ? "was" : "were"} already gone.`
            : `${deletedLabel}.`,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete selected line items");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleExportBudgetCsv(type: "line-items" | "summary", options?: { filtered?: boolean }) {
    if (!selectedEventId) return;

    setExportingBudgetCsvType(type);
    setErrorMessage(null);

    try {
      const exportPath = type === "line-items" ? "line-items.csv" : "summary.csv";
      // Filtered export reuses the current filter/search/sort so the CSV matches
      // the visible view; full export omits the params for the whole Budget.
      let exportQuery = "";
      if (type === "line-items" && options?.filtered) {
        const params = buildLineItemFilterParams();
        params.set("filtered", "1");
        exportQuery = `?${params.toString()}`;
      }
      const response = await fetch(`/api/events/${selectedEventId}/budget/export/${exportPath}${exportQuery}`);

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(toErrorMessage(payload, "Failed to export budget CSV"));
      }

      const blob = await response.blob();
      const filename = parseDownloadFilename(
        response.headers.get("content-disposition"),
        type === "line-items" ? "budget-line-items.csv" : "budget-summary.csv",
      );

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to export budget CSV");
    } finally {
      setExportingBudgetCsvType(null);
    }
  }

  return (
    <section className="space-y-6">
      {!hideEventSelector ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px] font-semibold text-slate-700">Event:</span>
          <select
            value={selectedEventId}
            onChange={async (event) => {
              const eventId = event.target.value;
              setSelectedEventId(eventId);
              setBudgetData(null);
              setPagedLineItems([]);
              setErrorMessage(null);
              await loadBudget(eventId);
            }}
            className="h-11 min-w-[320px] rounded-xl border border-slate-200 bg-white px-4 text-[14px] text-slate-800 outline-none focus:border-slate-300"
            disabled={isLoading || events.length === 0}
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => void (selectedEventId ? loadBudget(selectedEventId) : loadEvents())}
            disabled={isLoading}
            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-60"
          >
            Retry
          </button>
        </div>
      ) : null}
      {sessionGroupOptionsError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <p>{sessionGroupOptionsError}</p>
          <button type="button" onClick={() => void reloadSessionGroupOptions(selectedEventId)} className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[12px] font-semibold hover:bg-amber-50">Retry session options</button>
        </div>
      ) : null}
      {budgetNotice && (
        <div
          className={budgetNotice.tone === "success" ? BULK_SUCCESS_TOAST_CLASS : "fixed right-5 bottom-5 z-50 rounded-2xl border border-slate-300 bg-slate-800 px-4 py-2 text-[13px] font-semibold text-white shadow-xl ring-1 ring-white/20"}
        >
          {budgetNotice.title}
          {budgetNotice.detail ? <span className="ml-1 font-medium opacity-90">{budgetNotice.detail}</span> : null}
          {budgetNotice.actionLabel && budgetNotice.onAction ? (
            <button
              type="button"
              onClick={budgetNotice.onAction}
              className="ml-3 rounded-md px-1 font-semibold underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {budgetNotice.actionLabel}
            </button>
          ) : null}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] leading-[15px] text-slate-500">Total Forecast</p>
            <p className="mt-1 text-[17px] leading-[22px] font-semibold text-slate-900">{formatMoney(totals.totalForecastCents)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] leading-[15px] text-slate-500">Total Actual</p>
            <p className="mt-1 text-[17px] leading-[22px] font-semibold text-slate-900">{formatMoney(totals.totalActualCents)}</p>
          </div>
          <div
            className={[
              "rounded-xl border px-4 py-3",
              totalsVarianceIsUnder ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40",
            ].join(" ")}
          >
            <p className={`text-[11px] leading-[15px] ${totalsVarianceIsUnder ? "text-emerald-700" : "text-rose-700"}`}>Variance</p>
            <p className={`mt-1 text-[17px] leading-[22px] font-semibold ${totalsVarianceIsUnder ? "text-emerald-700" : "text-rose-700"}`}>
              {formatMoney(totals.varianceCents)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3">
            <p className="text-[11px] leading-[15px] text-emerald-700">% Under</p>
            <p className="mt-1 text-[17px] leading-[22px] font-semibold text-emerald-700">{formatPercent(totals.percentUnder)}</p>
          </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-[16px] font-semibold text-slate-900">Line Items</h3>
            {isTableEditable ? (
              hasUnsavedBudgetChanges ? (
                <p className="mt-1 text-[12px] text-amber-700">{dirtyLineItemIds.size} row{dirtyLineItemIds.size === 1 ? "" : "s"} with unsaved changes.</p>
              ) : null
            ) : (
              <p className="mt-1 text-[12px] text-slate-500">Read-only mode.</p>
            )}
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
            <label className={`${TABLE_SEARCH_FIELD_CLASS} min-w-[180px] flex-1 max-w-[420px]`}>
              <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              <input
                type="search"
                value={lineItemsSearch}
                onChange={(event) => setLineItemsSearch(event.target.value)}
                placeholder="Search line item, vendor, category, group, or session"
                aria-label="Search line item, vendor, category, group, or session"
                className="w-full bg-transparent text-[12px] text-slate-800 placeholder:text-slate-400 outline-none"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 max-md:w-full">
              <button
                type="button"
                className={TABLE_CONTROL_BUTTON_CLASS}
                aria-expanded={shouldShowLineItemFilters}
                onClick={() => setLineItemsFiltersOpen((current) => !current)}
                data-testid="budget-filters-toggle"
              >
                <Filter className="h-3.5 w-3.5" aria-hidden />
                {activeLineItemFilterCount > 0 ? `Filters · ${activeLineItemFilterCount}` : "Filters"}
              </button>
              {hasUnsavedBudgetChanges ? (
                <>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
                    onClick={() => void handleSaveAllLineItemChanges()}
                    disabled={Boolean(savingLineItemId) || isMutating}
                  >
                    {savingLineItemId ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    onClick={handleDiscardAllLineItemChanges}
                    disabled={Boolean(savingLineItemId) || isMutating}
                  >
                    Discard changes
                  </button>
                  {budget && budgetApprovalsEnabled ? (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={openApprovalDrawer}
                    >
                      {activeApprovalCount > 0 ? `View approvals (${activeApprovalCount})` : "View approvals"}
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
                    onClick={() => void handleAddLineItem()}
                    disabled={!selectedEventId || isMutating || Boolean(savingLineItemId) || budget?.status === "APPROVED"}
                  >
                    <Plus className="h-4 w-4" />
                    Add Line Item
                  </button>
                  {budget && budgetApprovalsEnabled ? (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={openApprovalDrawer}
                    >
                      {activeApprovalCount > 0 ? `View approvals (${activeApprovalCount})` : "View approvals"}
                    </button>
                  ) : null}
                </>
              )}
              <div className="relative" ref={toolsMenuRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isToolsMenuOpen}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setIsToolsMenuOpen((current) => !current)}
                >
                  Tools
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isToolsMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {isToolsMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute top-11 right-0 z-20 min-w-[220px] rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
                  >
                  {hideEventSelector ? (
                    <>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => {
                          setIsToolsMenuOpen(false);
                          downloadBudgetImportTemplate();
                        }}
                        disabled={!selectedEventId || isLoading}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Template
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => {
                          setIsToolsMenuOpen(false);
                          void handleExportBudgetCsv("line-items");
                        }}
                        disabled={!selectedEventId || isLoading || exportingBudgetCsvType !== null}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {exportingBudgetCsvType === "line-items" ? "Exporting line items..." : "Export Line Items (full)"}
                      </button>
                      {hasActiveLineItemFilters ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => {
                            setIsToolsMenuOpen(false);
                            void handleExportBudgetCsv("line-items", { filtered: true });
                          }}
                          disabled={!selectedEventId || isLoading || exportingBudgetCsvType !== null}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export Filtered View
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => {
                          setIsToolsMenuOpen(false);
                          void handleExportBudgetCsv("summary");
                        }}
                        disabled={!selectedEventId || isLoading || exportingBudgetCsvType !== null}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {exportingBudgetCsvType === "summary" ? "Exporting summary..." : "Export Summary"}
                      </button>
                      <BudgetImportAction
                        eventId={selectedEventId}
                        existingLineItems={lineItems}
                        disabled={!selectedEventId || isLoading || isMutating || budget?.status === "APPROVED"}
                        onError={(message) => setErrorMessage(message || null)}
                        onImported={async (outcome) => {
                          await loadBudget(selectedEventId, { keepEditMode: false });
                          setBudgetNotice({
                            tone: "success",
                            title: outcome.noticeTitle,
                            detail: outcome.noticeDetail,
                          });
                        }}
                        trigger={({ open, disabled: importDisabled }) => (
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => {
                              setIsToolsMenuOpen(false);
                              setErrorMessage(null);
                              setBudgetNotice(null);
                              open();
                            }}
                            disabled={importDisabled}
                          >
                            <Upload className="h-3.5 w-3.5" />
                            Import Budget Data
                          </button>
                        )}
                      />
                    </>
                  ) : null}

                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {hasSomeSelected ? (
          <div className={BULK_ACTION_BAR_CLASS} data-testid="budget-line-item-bulk-action-bar">
            <div className="mr-auto flex min-w-0 flex-wrap items-center gap-3">
              <p className={BULK_SELECTED_COUNT_CLASS}>{selectedCount} selected</p>
              {isInEditFlow && pagedFilteredCount > paginatedLineItems.length ? (
                <button
                  type="button"
                  onClick={() => void handleSelectAllFilteredLineItems()}
                  className="text-[11px] font-medium text-blue-600 underline-offset-2 hover:underline"
                >
                  {hasActiveLineItemFilters
                    ? `Select all ${pagedFilteredCount} filtered`
                    : `Select all ${pagedFilteredCount} rows`}
                </button>
              ) : null}
              {!isInEditFlow ? (
                <p className="text-[11px] text-slate-500">This budget is read-only.</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isInEditFlow ? (
                <>
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      if (!value) return;
                      applyBulkCategory(value);
                      event.target.value = "";
                    }}
                    disabled={selectedEditableLineItemIds.length === 0}
                    className={BULK_CONTROL_CLASS}
                  >
                    <option value="">Set category...</option>
                    {CATEGORY_OPTIONS.map((category) => (
                      <option key={`bulk-category-${category}`} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      const value = event.target.value as LineItemStatus | "";
                      if (!value) return;
                      applyBulkStatus(value);
                      event.target.value = "";
                    }}
                    disabled={selectedEditableLineItemIds.length === 0}
                    className={BULK_CONTROL_CLASS}
                  >
                    <option value="">Set status...</option>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={`bulk-status-${status}`} value={status}>
                        {status.charAt(0) + status.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <button
                type="button"
                className={BULK_DELETE_BUTTON_CLASS}
                onClick={() => void handleDeleteSelectedLineItems()}
                disabled={!canDeleteSelected}
                title={bulkDeleteDisabledReason || undefined}
              >
                Delete selected
              </button>
              <button
                type="button"
                className={BULK_CLEAR_BUTTON_CLASS}
                onClick={() => setSelectedLineItemIds([])}
              >
                Clear selection
              </button>
            </div>
          </div>
        ) : null}

        {shouldShowLineItemFilters ? (
          <div className={TABLE_FILTER_PANEL_CLASS} data-testid="budget-filter-panel">
          <select
            value={lineItemsFilterCategory}
            onChange={(event) => {
              setLineItemsFilterCategory(event.target.value);
              setLineItemsFilterSubcategory("");
            }}
            aria-label="Filter by category"
            title="Category"
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All categories</option>
            {budgetCategoryFilterOptions.map((category) => (
              <option key={`filter-cat-${category}`} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            value={lineItemsFilterSession}
            onChange={(event) => setLineItemsFilterSession(event.target.value)}
            aria-label="Filter by session"
            title="Session"
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All sessions</option>
            {sessionOptions.map((session) => (
              <option key={`filter-session-${session.id}`} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
          <BudgetGroupFilterSelect value={lineItemsFilterGroup} groups={groupOptions} onChange={setLineItemsFilterGroup} />
          <select
            value={lineItemsFilterStatus}
            onChange={(event) => setLineItemsFilterStatus(event.target.value as LineItemStatus | "")}
            aria-label="Filter by status"
            title="Status"
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={`filter-status-${status}`} value={status}>
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <select
            value={lineItemsFilterApproval}
            onChange={(event) => setLineItemsFilterApproval(event.target.value as LineItemApproval | "")}
            aria-label="Filter by approval"
            title="Approval"
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="">All approvals</option>
            {APPROVAL_FILTER_OPTIONS.map((approval) => (
              <option key={`filter-appr-${approval}`} value={approval}>
                {formatStatusLabel(approval)}
              </option>
            ))}
          </select>
          {hasActiveLineItemFilters ? (
            <button
              type="button"
              onClick={clearLineItemFilters}
              className={TABLE_CONTROL_BUTTON_CLASS}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </button>
          ) : null}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1546px] table-fixed border-collapse">
            {/*
	              Fixed table layout ignores min-width on cells, so column widths are
	              defined here explicitly. This keeps the Select and Category headers
	              from colliding and gives Forecast/Actual enough room for full
	              currency values (e.g. $225,000.00) without clipping. The table
              min-width preserves horizontal scrolling on narrow viewports.
            */}
            <colgroup>
              <col style={{ width: 72 }} />
              <col style={{ width: 200 }} />
	              <col style={{ width: 180 }} />
              {orderedColumns.map((column) => (
                <col key={column.id} style={{ width: BUDGET_COLUMN_WIDTHS[column.id] }} />
              ))}
              <col style={{ width: 44 }} />
	            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="whitespace-nowrap px-2 py-2 text-[10px] uppercase tracking-wide text-slate-600" data-column-pinned-header="select">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allFilteredSelectableSelected}
                      onChange={toggleSelectAllLineItems}
                      disabled={selectableFilteredLineItemIds.length === 0}
                      aria-label="Select all line items"
                      className="h-4 w-4 shrink-0 border-slate-300 text-[#28439A] focus:ring-[#28439A]"
                    />
                    <span>Select</span>
                  </div>
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-[10px] uppercase tracking-wide text-slate-600" data-column-pinned-header="lineItem">
                  Line Item
                </th>
                {renderSortableHeader("Category", "category", "category")}
                {orderedColumns.map((column) => renderBudgetColumnHeader(column))}
	              <th className="sticky right-0 z-20 w-12 bg-white px-2 py-2" aria-label="New row actions" />
	              </tr>
            </thead>

            <tbody>
              {paginatedLineItems.map((item) => (
                <BudgetRow
                  key={item.id}
                  item={item}
                  columnOrder={columnOrder}
                  amountDraft={amountDrafts[item.id]}
                  textDraft={lineItemDrafts[item.id]}
                  selected={selectedLineItemIds.includes(item.id)}
                  locked={isLineItemLocked(item.id)}
                  readOnly={isLineItemReadOnly(item)}
                  isNew={isTemporaryLineItemId(item.id)}
                  isDirty={dirtyLineItemIds.has(item.id)}
                  isSaved={savedLineItemIds.has(item.id)}
                  error={rowErrors[item.id] ?? null}
                  approvalState={resolveLineItemApprovalState(item, submissionThreads.get(item.id))}
                  approvalWorkflowEnabled={budgetApprovalsEnabled}
                  sessionOptions={sessionOptions}
                  groupOptions={groupOptions}
                  selectedEventId={selectedEventId}
                  onRowClick={handleLineItemRowClick}
                  onToggleSelect={toggleLineItemSelection}
                  onMarkDirty={markLineItemDirty}
                  setAmountDrafts={setAmountDrafts}
                  setLineItemDrafts={setLineItemDrafts}
                  onAmountBlur={updateAmount}
                  onFieldCommit={updateLineItemField}
                  onAssignSession={handleAssignSession}
                  onAssignGroup={handleAssignGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onOpenApproval={openApprovalDrawerForLineItem}
                  onRemoveNewRow={handleRemoveNewLineItem}
                  registerForecastInput={registerForecastInput}
                  registerCategorySelect={registerCategorySelect}
                />
              ))}

              {(isLoading || isLineItemsPageLoading) && paginatedLineItems.length === 0 ? (
                <tr>
                  <td colSpan={3 + orderedColumns.length} className="px-4 py-8 text-center text-[13px] text-slate-500">
                    Loading budget line items...
                  </td>
                </tr>
              ) : null}

              {/* Filtered-empty vs no-budget-empty are distinct: the former means
                  the budget has rows but none match the active server filters. */}
              {!isLoading && !isLineItemsPageLoading && paginatedLineItems.length === 0 && lineItemCount > 0 && (
                <tr>
	                  <td colSpan={3 + orderedColumns.length} className="px-4 py-8 text-center text-[13px] text-slate-500">
                    No line items match the current filters.
                  </td>
                </tr>
              )}

              {!isLoading && !isLineItemsPageLoading && paginatedLineItems.length === 0 && lineItemCount === 0 && (
                <tr>
	                  <td colSpan={3 + orderedColumns.length} className="px-4 py-8 text-center text-[13px] text-slate-500">
                    No line items yet.
                  </td>
                </tr>
              )}
            </tbody>
            {categoryFooterTotal || selectedSessionFilterIds.length > 0 ? (
              <tfoot>
                {categoryFooterTotal ? (
                  <tr className="border-t-2 border-slate-300 bg-slate-100/80 text-[12px] font-semibold text-slate-800">
                    <td colSpan={2} className="px-3 py-3">
                      {categoryFooterTotal.category} total
                      <span className="ml-2 font-medium text-slate-500">
                        {categoryFooterTotal.rowCount} {categoryFooterTotal.rowCount === 1 ? "row" : "rows"}
                      </span>
                    </td>
                    {orderedColumns.map((column) => {
                      switch (column.id) {
                        case "forecast":
                          return <td key={column.id} className="px-3 py-3">{formatMoney(categoryFooterTotal.forecastCents)}</td>;
                        case "actual":
                          return <td key={column.id} className="px-3 py-3">{formatMoney(categoryFooterTotal.actualCents)}</td>;
                        case "variance":
                          return (
                            <td key={column.id} className={`px-3 py-3 ${categoryFooterVarianceClass}`}>
                              {formatMoney(categoryFooterTotal.varianceCents)}
                            </td>
                          );
                        default:
                          return <td key={column.id} className="px-3 py-3" />;
                      }
                    })}
	                    <td className="px-2 py-3" />
                  </tr>
                ) : null}
                {sessionFooterTotal ? (
                <tr className="sticky bottom-0 border-t-2 border-slate-300 bg-slate-50">
	                  <td colSpan={3 + orderedColumns.length} className="px-3 py-2 text-[12px] text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">
                        {activeSessionFilterTitle ?? "Selected sessions"}
                      </span>
                      <span className="flex flex-wrap items-center gap-4">
                        <span className="text-slate-500">
                          {sessionFooterTotal.rowCount} {sessionFooterTotal.rowCount === 1 ? "row" : "rows"}
                        </span>
                        <span>
                          Forecast <span className="font-semibold">{formatMoney(sessionFooterTotal.forecastCents)}</span>
                        </span>
                        <span>
                          Actual <span className="font-semibold">{formatMoney(sessionFooterTotal.actualCents)}</span>
                        </span>
                      </span>
                    </div>
                  </td>
                </tr>
                ) : null}
              </tfoot>
            ) : null}
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
          <p className="text-[12px] text-slate-500">
            {lineItemsFilteredCount === 0
              ? "Rows 0 of 0"
              : `Rows ${lineItemsRangeStart}–${lineItemsRangeEnd} of ${lineItemsFilteredCount}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
              <span className="whitespace-nowrap">Per page</span>
              <select
                value={lineItemsPageSize}
                onChange={(event) => setLineItemsPageSize(Number(event.target.value))}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 outline-none focus:border-slate-300"
              >
                {LINE_ITEMS_PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={lineItemsPageIndex <= 0}
              onClick={() => setLineItemsPage(lineItemsPageIndex - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={lineItemsPageIndex >= lineItemsLastPage}
              onClick={() => setLineItemsPage(lineItemsPageIndex + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {isLoading && <p className="text-[12px] text-slate-500">Loading budget for {selectedEventName || "event"}...</p>}

      {isApprovalDrawerOpen && budget && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close approval drawer backdrop"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setIsApprovalDrawerOpen(false)}
          />
          <aside className="absolute top-0 right-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[18px] font-semibold text-slate-900">
                    {isLineItemApprovalDrawer ? "Approval detail" : "Budget Approvals"}
                  </h3>
                  {isLineItemApprovalDrawer ? (
                    <p className="mt-1 text-[13px] text-slate-600">
                      Status:{" "}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClasses(panelStatus as BudgetStatus)}`}>
                        {formatStatusLabel(panelStatus)}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] text-slate-600">
                      {activeApprovalCount} active approval{activeApprovalCount === 1 ? "" : "s"} awaiting review.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                  onClick={() => setIsApprovalDrawerOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-5 px-6 py-5">
              {isLineItemApprovalDrawer && selectedSubmission ? (
                <>
                  <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] items-center gap-3">
                    <div className="text-center">
                      <div className="mx-auto w-fit">{stepIcon(approvalStepper.visuals[0])}</div>
                      <p className="mt-2 text-[12px] font-semibold text-slate-700">{approvalStepper.labels[0]}</p>
                    </div>
                    <div className={`h-1 rounded-full ${connectorClass(approvalStepper.connectors[0])}`} />
                    <div className="text-center">
                      <div className="mx-auto w-fit">{stepIcon(approvalStepper.visuals[1])}</div>
                      <p className="mt-2 text-[12px] font-semibold text-slate-700">{approvalStepper.labels[1]}</p>
                    </div>
                    <div className={`h-1 rounded-full ${connectorClass(approvalStepper.connectors[1])}`} />
                    <div className="text-center">
                      <div className="mx-auto w-fit">{stepIcon(approvalStepper.visuals[2])}</div>
                      <p className="mt-2 text-[12px] font-semibold text-slate-700">{approvalStepper.labels[2]}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-700">
                    <p>
                      <span className="font-semibold">Submitted by:</span>{" "}
                      {userDisplayName(selectedSubmission.submittedByUser)}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold">Submitted at:</span>{" "}
                      {formatTimestamp(selectedSubmission.submittedAt)}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold">Status:</span>{" "}
                      {formatStatusLabel(selectedSubmission.status)}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold">Comments:</span>{" "}
                      {selectedSubmission.message || "No comments provided."}
                    </p>
                  </div>
                </>
              ) : null}

              {!isLineItemApprovalDrawer ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                      Active approvals ({activeApprovalCount})
                    </p>
                    {activeApprovalOptions.length === 0 ? (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-600">
                        No active budget approvals are awaiting review.
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {activeApprovalOptions.map((option) => (
                          <button
                            key={option.lineItemId}
                            type="button"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:bg-slate-50"
                            onClick={() => {
                              setApprovalDrawerMode("lineItem");
                              setSelectedLineItemId(option.lineItemId);
                              setSelectedThreadLineItemId(option.lineItemId);
                            }}
                          >
                            <p className="truncate text-[13px] font-semibold text-slate-900">
                              {submissionOptionPrimaryLabel(option)}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {submissionOptionSecondaryLabel(option)}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                      History ({approvalHistoryOptions.length})
                    </p>
                    {approvalHistoryOptions.length === 0 ? (
                      <p className="mt-2 text-[12px] text-slate-500">No historical approval records yet.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {approvalHistoryOptions.map((option) => (
                          <button
                            key={option.lineItemId}
                            type="button"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100"
                            onClick={() => {
                              setApprovalDrawerMode("lineItem");
                              setSelectedLineItemId(option.lineItemId);
                              setSelectedThreadLineItemId(option.lineItemId);
                            }}
                          >
                            <p className="truncate text-[13px] font-semibold text-slate-900">
                              {submissionOptionPrimaryLabel(option)}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {submissionOptionSecondaryLabel(option)}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {isApprovalDataLoading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-600">
                  Loading approval history...
                </div>
              ) : null}

              {isLineItemApprovalDrawer && !selectedSubmission ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-slate-200 p-2 text-slate-600">
                      <Clock3 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-slate-900">Budget is in draft</p>
                      <p className="mt-1 text-[13px] text-slate-600">
                        Select a line item and submit it for approval when ready.
                      </p>
                    </div>
                  </div>
                </div>
              ) : isLineItemApprovalDrawer && selectedSubmission ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold text-slate-900">
                        {selectedSubmission.status === "SUBMITTED"
                          ? "Awaiting Review"
                          : selectedSubmission.status === "APPROVED"
                            ? "Approved"
                            : selectedSubmission.status === "REJECTED"
                              ? "Rejected"
                              : "Pulled Back"}
                      </p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${submissionStatusBadgeClasses(selectedSubmission.status)}`}>
                        {formatStatusLabel(selectedSubmission.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-600">
                      Submitted on {formatTimestamp(selectedSubmission.submittedAt)} by{" "}
                      {userDisplayName(selectedSubmission.submittedByUser)}
                    </p>
                    {selectedSubmission.pulledBackAt && (
                      <p className="mt-1 text-[12px] text-slate-600">
                        Pulled back on {formatTimestamp(selectedSubmission.pulledBackAt)} by{" "}
                        {userDisplayName(selectedSubmission.pulledBackByUser)}
                      </p>
                    )}

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Recipients</p>
                        <div className="mt-1 space-y-1">
                          {selectedSubmission.recipients.length === 0 ? (
                            <p className="text-[12px] text-slate-500">No recipients recorded.</p>
                          ) : (
                            selectedSubmission.recipients.map((recipient, index) => (
                              <p
                                key={`${selectedSubmission.id}-${recipient?.id ?? "noid"}-${recipient?.email ?? "noemail"}-${index}`}
                                className="text-[12px] text-slate-700"
                              >
                                {userDisplayName(recipient)} <span className="text-slate-400">({recipient?.email ?? "unknown"})</span>
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Submitted line item</p>
                        <div className="mt-1">
                          {!selectedThreadLineItem ? (
                            <p className="text-[12px] text-slate-500">No line items on this submission.</p>
                          ) : (
                            <div className="rounded-lg border border-slate-200 p-3">
                              <p className="text-[12px] font-semibold text-slate-800">{selectedThreadLineItem.lineItem}</p>
                              <p className="text-[11px] text-slate-600">
                                {selectedThreadLineItem.category} • {selectedThreadLineItem.subcategory}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                Vendor: {selectedThreadLineItem.vendor ?? "N/A"}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {isLineItemApprovalDrawer ? (
              <div className="border-t border-slate-200 pt-4">
                <p className="text-[13px] font-semibold text-slate-700">Approval history</p>
                {selectedThreadSubmissions.length === 0 ? (
                  <p className="mt-2 text-[12px] text-slate-500">No submission history yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedThreadSubmissions.map((submission) => (
                      <div key={submission.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[12px] font-semibold text-slate-800">
                          {formatStatusLabel(submission.status)} • {userDisplayName(submission.submittedByUser)}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          {formatTimestamp(submission.status === "PULLED_BACK" && submission.pulledBackAt
                            ? submission.pulledBackAt
                            : submission.submittedAt)}
                        </p>
                        {submission.message && <p className="mt-1 text-[11px] text-slate-600">{submission.message}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              ) : null}
            </div>

            {isLineItemApprovalDrawer ? (
            <div className="sticky bottom-0 border-t border-slate-200 bg-white px-6 py-4">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {showSubmitAction ? (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setSelectedRecipientIds([]);
                      setSubmissionMessage("");
                      setIsSubmitModalOpen(true);
                    }}
                    disabled={!selectedLineItemId || isLineItemLocked(selectedLineItemId) || budget?.status === "APPROVED"}
                    title={submitDisabledReason || undefined}
                  >
                    Submit
                  </button>
                ) : null}
                {showReviewActions ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-lg border border-emerald-300 px-3 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                      onClick={() => void handleApproveSubmission()}
                      disabled={!selectedSubmission || selectedSubmission.status !== "SUBMITTED" || isMutating}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-lg border border-rose-300 px-3 text-[12px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      onClick={() => void handleRejectSubmission()}
                      disabled={!selectedSubmission || selectedSubmission.status !== "SUBMITTED" || isMutating}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      onClick={() => void handlePullBackSubmission()}
                      disabled={!canPullBackSelected}
                      title={pullbackDisabledReason || undefined}
                    >
                      Pull Back
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            ) : null}
          </aside>
        </div>
      )}

      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-[18px] font-semibold text-slate-900">Submit for approval</h3>
              <p className="mt-1 text-[13px] text-slate-600">Send this budget line item to reviewers.</p>
            </div>

            <div className="space-y-4 px-6 py-5">
              {selectedApprovalLineItem ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Line item</p>
                  <p className="mt-1 text-[14px] font-semibold text-slate-900">{selectedApprovalLineItem.lineItem}</p>
                  <div className="mt-2 grid gap-2 text-[12px] text-slate-600 sm:grid-cols-2">
                    <p><span className="font-semibold text-slate-700">Category:</span> {selectedApprovalLineItem.category}</p>
                    <p><span className="font-semibold text-slate-700">Vendor:</span> {selectedApprovalLineItem.vendor ?? "N/A"}</p>
                    <p><span className="font-semibold text-slate-700">Forecast:</span> {formatMoney(selectedApprovalLineItem.forecastCents)}</p>
                    <p><span className="font-semibold text-slate-700">Actual:</span> {formatMoney(selectedApprovalLineItem.actualCents)}</p>
                  </div>
                </div>
              ) : null}

              <div>
                <p className="text-[13px] font-semibold text-slate-700">Recipients</p>
                <div className="mt-2 max-h-44 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                  {submissionRecipients.map((recipient) => (
                    <label key={`${selectedEventId}-${recipient.id}-${recipient.email}`} className="flex items-center gap-2 text-[13px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedRecipientIds.includes(recipient.id)}
                        onChange={() => toggleRecipient(recipient.id)}
                        className="h-4 w-4 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]"
                      />
                      <span>{recipient.name?.trim() || recipient.email}</span>
                      <span className="text-slate-400">{recipient.email}</span>
                    </label>
                  ))}
                  {submissionRecipients.length === 0 && (
                    <p className="text-[12px] text-slate-500">
                      No reviewers are available for this event. Add event members or eligible reviewers before
                      submitting for approval.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="submission-message" className="text-[13px] font-semibold text-slate-700">
                  Message (optional)
                </label>
                <textarea
                  id="submission-message"
                  value={submissionMessage}
                  onChange={(event) => setSubmissionMessage(event.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-slate-300"
                  placeholder="Add a note for reviewers"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                onClick={handleCloseSubmitModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
                onClick={() => void handleSubmitSelectedForApproval()}
                disabled={
                  !selectedLineItemId ||
                  selectedRecipientIds.length === 0 ||
                  isMutating ||
                  selectedLineItemLocked ||
                  budget?.status === "APPROVED"
                }
              >
                Submit for approval
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
