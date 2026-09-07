"use client";

import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, pointerWithin, useSensor, useSensors } from "@dnd-kit/core";
import { MATRIX2_SESSION_DRAG_ACTIVATION_DISTANCE, createMatrix2SessionDragClickState } from "@/lib/matrix2-session-drag";
import { ArrowUpDown, GripVertical, Loader2, Mic, Monitor, Plus, Upload, Users, Utensils } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEventTerminology } from "@/components/event-terminology-context";
import { Fragment, type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FEATURES, isSessionModuleAvailable } from "@/config/features";
import {
  ColumnHeaderDragHandle,
  useColumnHeaderReorder,
  usePersistedColumnOrder,
  type ColumnOrderItem,
} from "@/components/column-order-control";
import { TaskCreateLauncher, type TaskCreateAttachmentOption } from "@/components/tasks/task-create-modal";
import { TimeField } from "@/components/time-field";
import {
  DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS,
  DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS,
  DashboardEmptyState,
} from "@/components/dashboard-empty-state";
import { deriveMatrix2BoardRoomGroups } from "@/lib/matrix2-board-rooms";
import { type Matrix2BoardOrientation } from "@/lib/matrix2-board-layout";
import {
  isCurrentMatrix2SnapshotRequest,
  isMatrix2SnapshotForEvent,
  matrix2SessionsForEventDate,
  resolveMatrix2SelectedDate,
} from "@/lib/matrix2-view-state";
import {
  BULK_ACTION_BAR_CLASS,
  BULK_CLEAR_BUTTON_CLASS,
  BULK_CONTROL_CLASS,
  BULK_DELETE_BUTTON_CLASS,
  BULK_ERROR_TOAST_CLASS,
  BULK_NARROW_CONTROL_CLASS,
  BULK_SELECTED_COUNT_CLASS,
  BULK_SELECTED_ROW_CLASS,
  BULK_SUCCESS_TOAST_CLASS,
  BULK_WIDE_CONTROL_CLASS,
} from "@/lib/bulk-edit-ui";
import { roomSetHref } from "@/lib/planning/routes";
import { SESSION_READINESS_METADATA } from "@/lib/session-readiness";
import {
  canonicalSessionStatusValue,
  sessionStatusBadgeClassName,
  sessionStatusOptionsFromTemplate,
} from "@/lib/session-status";
import {
  inferSessionRequirementCatalogType,
  isStaffingNeedRequirementItem,
  type SessionRequirementCatalogType,
} from "@/lib/session-requirement-catalog";
import { parseSessionRequirementQuantity } from "@/lib/session-requirement-quantity";
import { EVENT_MODULE_PRIMARY_CLASS, EventModuleHeader, EventModuleSurface } from "../events/[eventId]/_components/event-module-header";
import Matrix2Board, { typeColorClasses as matrixSessionTypeColorClasses } from "./_components/Matrix2Board";
import { MatrixConflictBadgeWithTooltip } from "./_components/MatrixConflictBadgeWithTooltip";
import { buildEncodedNotes, detectMatrix2Conflicts, formatDateLabel, formatTimeLabel, minutesToTime, sessionSearchText, toMinutes, visibleMatrix2ConflictMap, visibleMatrix2Conflicts } from "./_components/conflict-utils";
import Matrix2DetailsDrawer, { type Matrix2QuickPanelKey } from "./_components/Matrix2DetailsDrawer";
import {
  Matrix2InlineModulePicker,
  type Matrix2InlinePickerOption,
} from "./_components/Matrix2InlineModulePicker";
import Matrix2TopStrip, {
  EMPTY_MATRIX_LIST_FILTERS,
  type MatrixListFilterState,
  type MatrixListPresenceFilter,
} from "./_components/Matrix2TopStrip";
import { MatrixImportAction } from "./_components/matrix-import-action";
import { Matrix2SessionActionsMenu } from "./_components/Matrix2SessionActionsMenu";
import { matrix2QuickModule } from "./_components/matrix2-quick-modules";
import type { FnbPickerCatalogItem } from "./_components/matrix2-fnb-picker";
import { deriveMatrix2SessionReadiness, type Matrix2ActionReadiness } from "./_components/matrix2-session-readiness";
import {
  DEFAULT_SESSION_TYPE,
  MATRIX2_TEMPLATES,
  Matrix2Person,
  Matrix2Room,
  Matrix2SessionAction,
  Matrix2Session,
  Matrix2Snapshot,
  Matrix2Template,
  Matrix2ZoomMode,
  SESSION_TYPE_OPTIONS,
  sessionTypeOptionsForSavedValue,
} from "./_components/types";

type EventOption = {
  id: string;
  name: string;
};

type Matrix2EventSpeakerRecord = {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  bio: string | null;
  headshotUrl: string | null;
  status: "NEEDS_INFO" | "INVITED" | "CONFIRMED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const ORG_ID = "a5bc8820-c2ab-498b-9500-58f56421c733";
const MATRIX2_SELECTED_EVENT_KEY = "matrix2:selectedEventId";
const TIMELINE_SELECTED_EVENT_KEY = "timeline:selectedEventId";
const MATRIX2_BOARD_ORIENTATION_STORAGE_PREFIX = "matrix2:boardOrientation:v1";

const DROP_SLOT_MINUTES = 30;
const MAX_TIME_MINUTES = 23 * 60 + 59;
const DEFAULT_ADD_SESSION_DURATION_MINUTES = 60;

// Stable empty rooms reference so the memoized board does not receive a fresh array
// on every render while the snapshot is still loading.
const EMPTY_ROOMS: Matrix2Room[] = [];

function matchesMatrixListPresenceFilter(filter: MatrixListPresenceFilter, count: number): boolean {
  if (filter === "HAS") return count > 0;
  if (filter === "MISSING") return count === 0;
  return true;
}

function isMatrix2BoardOrientation(value: string | null): value is Matrix2BoardOrientation {
  return value === "ROOMS_BY_TIME" || value === "TIME_BY_ROOM";
}

function matrix2BoardOrientationStorageKey(eventId: string): string {
  return `${MATRIX2_BOARD_ORIENTATION_STORAGE_PREFIX}:${eventId}`;
}

type SessionMoveTarget = {
  roomId: string;
  roomName: string;
  startMinutes: number;
  anchorSessionId?: string;
};

type MatrixOverviewSortKey =
  | "time"
  | "title"
  | "type"
  | "room"
  | "speakers"
  | "av"
  | "fnb"
  | "staff"
  | "roomSetup"
  | "attendance"
  | "notes"
  | "conflicts"
  | "status";

type MatrixOverviewSort = {
  key: MatrixOverviewSortKey;
  direction: "asc" | "desc";
};

type MatrixOverviewSortState = MatrixOverviewSort | null;
type MatrixOverviewColumnId = Exclude<MatrixOverviewSortKey, "speakers" | "av" | "fnb" | "staff"> | "modules";

const MATRIX_OVERVIEW_COLUMNS: ColumnOrderItem<MatrixOverviewColumnId>[] = [
  { id: "time", label: "Time" },
  { id: "title", label: "Session" },
  { id: "type", label: "Type" },
  { id: "room", label: "Room" },
  { id: "modules", label: "Modules" },
  { id: "roomSetup", label: "Room set style" },
  { id: "attendance", label: "Count" },
  { id: "notes", label: "Notes" },
  { id: "conflicts", label: "Conflicts" },
  { id: "status", label: "Status" },
];

const MATRIX_OVERVIEW_PINNED_COLUMNS: ColumnOrderItem[] = [
  { id: "select", label: "Selection" },
  { id: "actions", label: "Actions" },
];

type MatrixOverviewDraft = {
  sessionId: string;
  startTime: string;
  endTime: string;
  title: string;
  sessionType: string;
  roomId: string;
  speakerIds: string[];
  speakerOptions: MatrixOverviewSpeakerOption[];
  avRequirementValues: Record<string, string>;
  fnbCatalogItemIds: string[];
  fnbCatalogItems: FnbPickerCatalogItem[];
  fnbAssignmentsLoaded: boolean;
  fnbTouched: boolean;
  staffPersonIds: string[];
  staffingRequirementValues: Record<string, string>;
  roomSetupType: string;
  attendanceText: string;
  notes: string;
  status: string;
};

type MatrixOverviewSpeakerOption = Pick<Matrix2EventSpeakerRecord, "id" | "name" | "title" | "company" | "email" | "status">;

type MatrixOverviewFnbAssignment = {
  id: string;
  eventFnbCatalogItemId: string;
  catalogItem: FnbPickerCatalogItem;
};

type MatrixOverviewBulkPatch = {
  sessionType?: string;
  roomId?: string | null;
  status?: string;
  roomSetupType?: string;
  expectedAttendance?: number | null;
  addAvRequirementItemId?: string;
};

type MatrixOverviewRequirementItem = {
  id: string;
  label: string;
  hasQuantity: boolean;
};

const MATRIX_OVERVIEW_FALLBACK_ROOM_SETUP_OPTIONS = [
  "Theater",
  "Classroom",
  "Banquet / Rounds",
  "Reception",
  "Boardroom",
  "U-Shape",
  "Hollow Square",
  "Cabaret",
  "Custom / TBD",
];

function toErrorMessage(payload: unknown, fallback: string): string {
  let resolved = fallback;

  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    resolved = payload.error;
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    resolved = payload.message;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "details" in payload &&
    typeof payload.details === "string" &&
    payload.details.trim()
  ) {
    resolved = `${resolved}: ${payload.details.trim()}`;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "code" in payload &&
    typeof payload.code === "string" &&
    payload.code.trim()
  ) {
    resolved = `${resolved} [${payload.code.trim()}]`;
  }

  return resolved;
}

function roundUpToQuarter(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

function matrixSessionTimeLabel(session: Matrix2Session): string {
  return `${formatTimeLabel(session.startTime)}–${formatTimeLabel(session.endTime)}`;
}

function listToOverviewText(values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(", ");
}

function parseOverviewList(value: string): string[] {
  return value
    .split(/[\n,;|]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function matrixOverviewRequirementItemsByType(
  requirementTemplate: Matrix2Snapshot["requirementTemplate"] | null | undefined,
  sectionType: SessionRequirementCatalogType,
): MatrixOverviewRequirementItem[] {
  if (!requirementTemplate) return [];

  return requirementTemplate.sections.flatMap((section) => {
    const inferredType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
    if (inferredType !== sectionType) return [];
    return section.items
      .filter((item) => item.active)
      .map((item) => ({
        id: item.id,
        label: item.label,
        hasQuantity: item.hasQuantity,
      }));
  });
}

function uniqueOverviewOptions(values: string[]): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(normalized);
  }

  return options;
}

function matrixOverviewRoomSetupOptions(
  sessions: Matrix2Session[],
  setupRequirementItems: MatrixOverviewRequirementItem[],
): string[] {
  return uniqueOverviewOptions([
    ...setupRequirementItems.map((item) => item.label),
    ...sessions.map((session) => session.roomSetup),
    ...MATRIX2_TEMPLATES.map((template) => template.defaultSetup),
    ...MATRIX_OVERVIEW_FALLBACK_ROOM_SETUP_OPTIONS,
  ]);
}

function avRequirementValuesFromSession(session: Matrix2Session, avRequirementItemIds: Set<string>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const selection of session.requirementSelections) {
    if (!avRequirementItemIds.has(selection.itemId)) continue;
    values[selection.itemId] = selection.quantity == null ? "" : String(selection.quantity);
  }
  return values;
}

function parseOverviewRequirementQuantity(label: string, value: string): number | null {
  return parseSessionRequirementQuantity(value, label);
}

function buildOverviewAvRequirementPayload(
  session: Matrix2Session,
  avRequirementValues: Record<string, string>,
  avRequirementItems: MatrixOverviewRequirementItem[],
  avRequirementItemIds: Set<string>,
  roomSetupType = session.roomSetup,
  setupRequirementItems: MatrixOverviewRequirementItem[] = [],
  setupRequirementItemIds: Set<string> = new Set(),
): {
  requirementSelections: Array<{ itemId: string; quantity: number | null }>;
  avRequirements: Array<{ avType: string; quantity: number | null }>;
} {
  const existingNonAvSelections = session.requirementSelections
    .filter((selection) => !avRequirementItemIds.has(selection.itemId) && !setupRequirementItemIds.has(selection.itemId))
    .map((selection) => ({ itemId: selection.itemId, quantity: selection.quantity }));
  const existingSelectionsByItemId = new Map(session.requirementSelections.map((selection) => [selection.itemId, selection]));
  const selectedAvSelections: Array<{ itemId: string; label: string; quantity: number | null }> = [];
  const normalizedRoomSetupType = roomSetupType.trim().toLowerCase();
  const selectedSetupItem = normalizedRoomSetupType
    ? setupRequirementItems.find((item) => item.label.trim().toLowerCase() === normalizedRoomSetupType) ?? null
    : null;

  for (const item of avRequirementItems) {
    if (!Object.prototype.hasOwnProperty.call(avRequirementValues, item.id)) continue;
    const existingSelection = existingSelectionsByItemId.get(item.id);
    const quantity = item.hasQuantity
      ? parseOverviewRequirementQuantity(item.label, avRequirementValues[item.id] ?? "")
      : null;
    selectedAvSelections.push({
      itemId: item.id,
      label: existingSelection?.linkedBudgetLineItem?.lineItem?.trim() || item.label,
      quantity,
    });
  }

  return {
    requirementSelections: [
      ...existingNonAvSelections,
      ...(selectedSetupItem ? [{ itemId: selectedSetupItem.id, quantity: null }] : []),
      ...selectedAvSelections.map((selection) => ({ itemId: selection.itemId, quantity: selection.quantity })),
    ],
    avRequirements: selectedAvSelections.map((selection) => ({
      avType: selection.label,
      quantity: selection.quantity,
    })),
  };
}

function overviewDraftFromSession(
  session: Matrix2Session,
  avRequirementItemIds: Set<string>,
  staffingRequirementItemIds: Set<string>,
): MatrixOverviewDraft {
  return {
    sessionId: session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    title: session.title,
    sessionType: session.sessionType || "Session",
    roomId: session.roomId ?? "",
    speakerIds: session.speakerAssignments.map((speaker) => speaker.speakerId),
    speakerOptions: session.speakerAssignments.map((speaker) => ({
      id: speaker.speakerId,
      name: speaker.name,
      title: speaker.title,
      company: speaker.company,
      email: speaker.email,
      status: speaker.status,
    })),
    avRequirementValues: avRequirementValuesFromSession(session, avRequirementItemIds),
    fnbCatalogItemIds: [],
    fnbCatalogItems: [],
    fnbAssignmentsLoaded: false,
    fnbTouched: false,
    staffPersonIds: session.staffAssignments.map((staff) => staff.personId),
    staffingRequirementValues: avRequirementValuesFromSession(session, staffingRequirementItemIds),
    roomSetupType: session.roomSetup,
    attendanceText: session.expectedAttendance === null ? "" : String(session.expectedAttendance),
    notes: session.notes,
    status: session.status,
  };
}

function overviewInputClassName(extra = ""): string {
  return `h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-800 outline-none focus:border-[#28439A] ${extra}`;
}

function overviewSelectSummary(values: string[], placeholder: string): string {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) return placeholder;
  if (normalized.length <= 2) return normalized.join(", ");
  return `${normalized.length} selected`;
}

function overviewFnbOptions(sessions: Matrix2Session[], draftText: string): string[] {
  return uniqueOverviewOptions([
    ...sessions.flatMap((session) => session.foodAndBeverage),
    ...parseOverviewList(draftText),
  ]);
}

type MatrixOverviewMultiSelectOption = {
  id: string;
  label: string;
  checked: boolean;
  quantity?: string;
  hasQuantity?: boolean;
};

function MatrixOverviewMultiSelect({
  ariaLabel,
  placeholder,
  summary,
  options,
  emptyLabel,
  onToggle,
  onQuantityChange,
}: {
  ariaLabel: string;
  placeholder: string;
  summary: string;
  options: MatrixOverviewMultiSelectOption[];
  emptyLabel: string;
  onToggle: (optionId: string, checked: boolean) => void;
  onQuantityChange?: (optionId: string, quantity: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const selectedCount = options.filter((option) => option.checked).length;

  const updatePopoverPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.max(rect.width, 240);
    const availableBelow = window.innerHeight - rect.bottom - 12;
    const availableAbove = rect.top - 12;
    const openAbove = availableBelow < 180 && availableAbove > availableBelow;
    const maxHeight = Math.max(160, Math.min(260, openAbove ? availableAbove : availableBelow));
    setPopoverStyle({
      top: openAbove ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 6,
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8)),
      width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePopoverPosition();

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 text-left text-[12px] text-slate-800 outline-none hover:border-slate-300 focus:border-[#28439A]"
      >
        <span className={selectedCount > 0 ? "truncate" : "truncate text-slate-400"}>{summary || placeholder}</span>
        <span aria-hidden className="shrink-0 text-slate-400">⌄</span>
      </button>
      {isOpen && popoverStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              className="fixed z-[80] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-xl ring-1 ring-slate-900/5"
              style={{
                top: popoverStyle.top,
                left: popoverStyle.left,
                width: popoverStyle.width,
                maxHeight: popoverStyle.maxHeight,
              }}
              onClick={(event) => event.stopPropagation()}
              data-testid={`${ariaLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-popover`}
            >
              <div className="max-h-[inherit] overflow-y-auto p-1.5">
                {options.length > 0 ? options.map((option) => (
                  <div key={option.id} className="flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-[12px] font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={option.checked}
                        onChange={(event) => onToggle(option.id, event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]"
                      />
                      <span className="truncate">{option.label}</span>
                    </label>
                    {option.hasQuantity && option.checked && onQuantityChange ? (
                      <input
                        value={option.quantity ?? ""}
                        onChange={(event) => onQuantityChange(option.id, event.target.value)}
                        inputMode="numeric"
                        aria-label={`${option.label} quantity`}
                        className="h-7 w-14 rounded-md border border-slate-200 px-1.5 text-[11px] outline-none focus:border-[#28439A]"
                        placeholder="#"
                      />
                    ) : null}
                  </div>
                )) : (
                  <div className="px-2 py-2 text-[12px] text-slate-500">{emptyLabel}</div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function parseOverviewAttendance(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Attendance must be a whole number greater than or equal to 0.");
  }
  return parsed;
}

type Matrix2PageProps = {
  eventIdOverride?: string;
  hideEventSelector?: boolean;
};

function MatrixOverviewSortHeader({
  label,
  sortKey,
  sort,
  onSort,
  shouldSuppressClick,
}: {
  label: string;
  sortKey: MatrixOverviewSortKey;
  sort: MatrixOverviewSortState;
  onSort: (key: MatrixOverviewSortKey) => void;
  shouldSuppressClick: () => boolean;
}) {
  const active = sort?.key === sortKey;

  return (
    <button
      type="button"
      onClick={(event) => {
        if (shouldSuppressClick()) {
          event.preventDefault();
          return;
        }
        onSort(sortKey);
      }}
      className={["inline-flex items-center gap-1 text-left", active ? "text-slate-900" : "text-slate-500 hover:text-slate-800"].join(" ")}
    >
      {label}
      <ArrowUpDown className={["h-3 w-3", active ? "text-[#28439A]" : "text-slate-400"].join(" ")} />
    </button>
  );
}

function MatrixStatusPill({ status }: { status: string }) {
  const normalized = status.trim() || "Not set";
  const classes = sessionStatusBadgeClassName(normalized);

  return (
    <span className={["inline-flex max-w-[120px] truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", classes].join(" ")}>
      {normalized}
    </span>
  );
}

function operationalModuleDotClass(readiness: Matrix2ActionReadiness): string {
  if (readiness.status === "ready") return "bg-emerald-500";
  if (readiness.status === "needs_info") return "bg-amber-500";
  if (readiness.status === "blocked") return "bg-rose-600";
  return "bg-slate-300";
}

function OperationalModuleIcon({
  label,
  readiness,
  children,
  onOpen,
  disabled = false,
}: {
  label: string;
  readiness: Matrix2ActionReadiness;
  children: ReactNode;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const statusLabel = SESSION_READINESS_METADATA[readiness.status].label;
  return (
    <button
      type="button"
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28439A]/40 disabled:cursor-not-allowed disabled:opacity-60"
      title={`${label}: ${statusLabel}`}
      aria-label={`${label}: ${statusLabel}`}
      data-module-status={readiness.status}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {children}
      <span className={["absolute right-0.5 top-0.5 h-2 w-2 rounded-full ring-2 ring-white", operationalModuleDotClass(readiness)].join(" ")} aria-hidden />
    </button>
  );
}

function MatrixOverviewTable({
  eventId,
  sessions,
  rooms,
  people,
  avRequirementItems,
  staffingRequirementItems,
  setupRequirementItems,
  requirementTemplate,
  selectedSessionId,
  selectedSessionIds,
  conflictsBySession,
  sort,
  isBulkMutating,
  onSort,
  onSelectSession,
  onOpenQuickPanel,
  onToggleSessionSelection,
  onToggleAllVisibleSessions,
  onClearSelection,
  onBulkUpdateSessions,
  onBulkDeleteSessions,
  onDuplicateSession,
  onDeleteSession,
  onSaveSession,
  runOfShowLabel,
}: {
  eventId: string;
  sessions: Matrix2Session[];
  rooms: Matrix2Room[];
  people: Matrix2Person[];
  avRequirementItems: MatrixOverviewRequirementItem[];
  staffingRequirementItems: MatrixOverviewRequirementItem[];
  setupRequirementItems: MatrixOverviewRequirementItem[];
  requirementTemplate: Matrix2Snapshot["requirementTemplate"] | null;
  selectedSessionId: string | null;
  selectedSessionIds: Set<string>;
  conflictsBySession: Map<string, ReturnType<typeof detectMatrix2Conflicts>["conflicts"]>;
  sort: MatrixOverviewSortState;
  isBulkMutating: boolean;
  onSort: (key: MatrixOverviewSortKey) => void;
  onSelectSession: (sessionId: string) => void;
  onOpenQuickPanel: (sessionId: string, panel: Matrix2QuickPanelKey) => void;
  onToggleSessionSelection: (sessionId: string) => void;
  onToggleAllVisibleSessions: (sessionIds: string[]) => void;
  onClearSelection: () => void;
  onBulkUpdateSessions: (sessionIds: string[], patch: MatrixOverviewBulkPatch) => Promise<void>;
  onBulkDeleteSessions: (sessionIds: string[]) => Promise<void>;
  onDuplicateSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onSaveSession: (session: Matrix2Session, draft: MatrixOverviewDraft) => Promise<void>;
  runOfShowLabel: string;
}) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MatrixOverviewDraft | null>(null);
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [bulkAttendanceText, setBulkAttendanceText] = useState("");
  const [modulePickerLoadingSessionId, setModulePickerLoadingSessionId] = useState<string | null>(null);
  const [modulePickerError, setModulePickerError] = useState<string | null>(null);
  const [focusRoomSessionId, setFocusRoomSessionId] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const {
    columnOrder,
    orderedColumns,
    setColumnOrder,
  } = usePersistedColumnOrder({
    columns: MATRIX_OVERVIEW_COLUMNS,
    scope: {
      orgId: ORG_ID,
      eventId,
      viewId: "run-of-show:list",
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
  const avRequirementItemIds = useMemo(
    () => new Set(avRequirementItems.map((item) => item.id)),
    [avRequirementItems],
  );
  const staffingRequirementItemIds = useMemo(
    () => new Set(staffingRequirementItems.map((item) => item.id)),
    [staffingRequirementItems],
  );
  const roomSetupOptions = useMemo(
    () => matrixOverviewRoomSetupOptions(sessions, setupRequirementItems),
    [sessions, setupRequirementItems],
  );
  const statusOptions = useMemo(
    () => sessionStatusOptionsFromTemplate(requirementTemplate),
    [requirementTemplate],
  );
  const visibleSessionIds = useMemo(() => sessions.map((session) => session.id), [sessions]);
  const selectedVisibleCount = useMemo(
    () => visibleSessionIds.filter((sessionId) => selectedSessionIds.has(sessionId)).length,
    [selectedSessionIds, visibleSessionIds],
  );
  const selectedCount = selectedSessionIds.size;
  const allVisibleSelected = visibleSessionIds.length > 0 && selectedVisibleCount === visibleSessionIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const sessionTypeOptions = SESSION_TYPE_OPTIONS;
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  function startEditing(session: Matrix2Session, focusRoom = false) {
    setEditingSessionId(session.id);
    setDraft(overviewDraftFromSession(session, avRequirementItemIds, staffingRequirementItemIds));
    setRowError(null);
    setModulePickerError(null);
    setFocusRoomSessionId(focusRoom ? session.id : null);
    void loadModulePickerData(session);
  }

  useEffect(() => {
    if (!focusRoomSessionId || editingSessionId !== focusRoomSessionId) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLSelectElement>(`[data-matrix-overview-room="${focusRoomSessionId}"]`)?.focus();
      setFocusRoomSessionId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [editingSessionId, focusRoomSessionId]);

  async function loadModulePickerData(session: Matrix2Session): Promise<void> {
    setModulePickerLoadingSessionId(session.id);
    try {
      const [speakersResponse, catalogResponse, assignmentsResponse] = await Promise.all([
        fetch(`/api/events/${eventId}/speakers`, { cache: "no-store" }),
        fetch(`/api/events/${eventId}/fnb-catalog`, { cache: "no-store" }),
        fetch(`/api/events/${eventId}/matrix-2/sessions/${session.id}/fnb-catalog-assignments`, { cache: "no-store" }),
      ]);
      const [speakersPayload, catalogPayload, assignmentsPayload] = await Promise.all([
        speakersResponse.json().catch(() => null),
        catalogResponse.json().catch(() => null),
        assignmentsResponse.json().catch(() => null),
      ]);
      if (!speakersResponse.ok) throw new Error(toErrorMessage(speakersPayload, "Failed to load event speakers"));
      if (!catalogResponse.ok) throw new Error(toErrorMessage(catalogPayload, "Failed to load the F&B catalog"));
      if (!assignmentsResponse.ok) throw new Error(toErrorMessage(assignmentsPayload, "Failed to load F&B assignments"));

      const speakerOptions = Array.isArray(speakersPayload) ? speakersPayload as MatrixOverviewSpeakerOption[] : [];
      const catalogItems = catalogPayload && typeof catalogPayload === "object" && "items" in catalogPayload && Array.isArray((catalogPayload as { items?: unknown }).items)
        ? (catalogPayload as { items: FnbPickerCatalogItem[] }).items
        : [];
      const assignments = Array.isArray(assignmentsPayload) ? assignmentsPayload as MatrixOverviewFnbAssignment[] : [];

      setDraft((current) => {
        if (!current || current.sessionId !== session.id) return current;
        const existingSpeakerIds = new Set(current.speakerOptions.map((speaker) => speaker.id));
        const mergedSpeakers = [...current.speakerOptions, ...speakerOptions.filter((speaker) => !existingSpeakerIds.has(speaker.id))];
        const catalogIds = new Set(catalogItems.map((item) => item.id));
        const mergedCatalog = [...catalogItems, ...assignments.map((assignment) => assignment.catalogItem).filter((item) => !catalogIds.has(item.id))];
        return {
          ...current,
          speakerOptions: mergedSpeakers,
          fnbCatalogItems: mergedCatalog,
          fnbCatalogItemIds: assignments.map((assignment) => assignment.eventFnbCatalogItemId),
          fnbAssignmentsLoaded: true,
        };
      });
    } catch (error) {
      setModulePickerError(error instanceof Error ? error.message : "Failed to load module options");
    } finally {
      setModulePickerLoadingSessionId((current) => current === session.id ? null : current);
    }
  }

  function cancelEditing() {
    setEditingSessionId(null);
    setDraft(null);
    setRowError(null);
  }

  function updateDraft<K extends keyof MatrixOverviewDraft>(key: K, value: MatrixOverviewDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveDraft(session: Matrix2Session) {
    if (!draft) return;
    if (savingSessionId === session.id) return;
    setSavingSessionId(session.id);
    setRowError(null);

    try {
      await onSaveSession(session, draft);
      setEditingSessionId(null);
      setDraft(null);
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "Failed to save session");
    } finally {
      setSavingSessionId(null);
    }
  }

  async function applyBulkPatch(patch: MatrixOverviewBulkPatch) {
    const sessionIds = Array.from(selectedSessionIds);
    if (sessionIds.length === 0) return;
    setRowError(null);
    try {
      await onBulkUpdateSessions(sessionIds, patch);
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "Failed to update selected sessions");
    }
  }

  function handleBulkSessionTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    const sessionType = event.target.value;
    if (!sessionType) return;
    void applyBulkPatch({ sessionType });
  }

  function handleBulkRoomChange(event: ChangeEvent<HTMLSelectElement>) {
    const roomId = event.target.value;
    if (!roomId) return;
    void applyBulkPatch({ roomId: roomId === "__unassigned__" ? null : roomId });
  }

  function handleBulkStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    const status = event.target.value;
    if (!status) return;
    void applyBulkPatch({ status });
  }

  function handleBulkAvRequirementChange(event: ChangeEvent<HTMLSelectElement>) {
    const addAvRequirementItemId = event.target.value;
    if (!addAvRequirementItemId) return;
    void applyBulkPatch({ addAvRequirementItemId });
  }

  function handleBulkRoomSetupChange(event: ChangeEvent<HTMLSelectElement>) {
    const roomSetupType = event.target.value;
    if (!roomSetupType) return;
    void applyBulkPatch({ roomSetupType });
  }

  function commitBulkAttendance() {
    const value = bulkAttendanceText.trim();
    if (!value) return;
    try {
      const expectedAttendance = parseOverviewAttendance(value);
      setBulkAttendanceText("");
      void applyBulkPatch({ expectedAttendance });
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "Failed to update selected sessions");
    }
  }

  function updateDraftAvRequirement(item: MatrixOverviewRequirementItem, checked: boolean): void {
    setDraft((current) => {
      if (!current) return current;
      const avRequirementValues = { ...current.avRequirementValues };
      if (checked) {
        avRequirementValues[item.id] = avRequirementValues[item.id] ?? "";
      } else {
        delete avRequirementValues[item.id];
      }
      return { ...current, avRequirementValues };
    });
  }

  function updateDraftAvRequirementQuantity(itemId: string, quantity: string): void {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        avRequirementValues: {
          ...current.avRequirementValues,
          [itemId]: quantity,
        },
      };
    });
  }

  async function deleteSelectedSessions() {
    const sessionIds = Array.from(selectedSessionIds);
    if (sessionIds.length === 0) return;
    const confirmed = window.confirm(
      `Archive ${sessionIds.length} selected session${sessionIds.length === 1 ? "" : "s"}? They will be removed from the active ${runOfShowLabel}.`,
    );
    if (!confirmed) return;
    setRowError(null);
    try {
      await onBulkDeleteSessions(sessionIds);
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "Failed to archive selected sessions");
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 text-center text-[13px] text-slate-500 shadow-sm ring-1 ring-white">
        No sessions match the current filters.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {selectedCount > 0 ? (
        <div
          className={BULK_ACTION_BAR_CLASS}
          data-testid="matrix-overview-bulk-action-bar"
        >
          <span className={`mr-auto ${BULK_SELECTED_COUNT_CLASS}`}>
            {selectedCount} selected
          </span>
          <label className="sr-only" htmlFor="matrix-overview-bulk-type">Set type</label>
          <select
            id="matrix-overview-bulk-type"
            value=""
            onChange={handleBulkSessionTypeChange}
            disabled={isBulkMutating}
            className={BULK_CONTROL_CLASS}
            aria-label="Bulk set session type"
          >
            <option value="">Set type...</option>
            {sessionTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="matrix-overview-bulk-room">Set room</label>
          <select
            id="matrix-overview-bulk-room"
            value=""
            onChange={handleBulkRoomChange}
            disabled={isBulkMutating}
            className={BULK_CONTROL_CLASS}
            aria-label="Bulk set room"
          >
            <option value="">Set room...</option>
            <option value="__unassigned__">Unassigned</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>{room.name}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="matrix-overview-bulk-status">Set status</label>
          <select
            id="matrix-overview-bulk-status"
            value=""
            onChange={handleBulkStatusChange}
            disabled={isBulkMutating}
            className={BULK_CONTROL_CLASS}
            aria-label="Bulk set status"
          >
            <option value="">Set status...</option>
            {statusOptions.map((status) => (
              <option key={status.key} value={status.value}>{status.label}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="matrix-overview-bulk-room-setup">Set room set style</label>
          <select
            id="matrix-overview-bulk-room-setup"
            value=""
            onChange={handleBulkRoomSetupChange}
            disabled={isBulkMutating}
            className={BULK_WIDE_CONTROL_CLASS}
            aria-label="Bulk set room set style"
          >
            <option value="">Set room set...</option>
            {roomSetupOptions.map((roomSetup) => (
              <option key={roomSetup} value={roomSetup}>{roomSetup}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="matrix-overview-bulk-attendance">Set count</label>
          <input
            id="matrix-overview-bulk-attendance"
            value={bulkAttendanceText}
            onChange={(event) => setBulkAttendanceText(event.target.value)}
            onBlur={commitBulkAttendance}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              commitBulkAttendance();
            }}
            inputMode="numeric"
            disabled={isBulkMutating}
            className={BULK_NARROW_CONTROL_CLASS}
            placeholder="Set count..."
            aria-label="Bulk set count"
          />
          {avRequirementItems.length > 0 ? (
            <>
              <label className="sr-only" htmlFor="matrix-overview-bulk-av">Add AV</label>
              <select
                id="matrix-overview-bulk-av"
                value=""
                onChange={handleBulkAvRequirementChange}
                disabled={isBulkMutating}
                className={BULK_CONTROL_CLASS}
                aria-label="Bulk add AV requirement"
              >
                <option value="">Add AV...</option>
                {avRequirementItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </>
          ) : null}
          <button
            type="button"
            disabled={isBulkMutating}
            onClick={onClearSelection}
            className={BULK_CLEAR_BUTTON_CLASS}
          >
            Clear selection
          </button>
          <button
            type="button"
            disabled={isBulkMutating}
            onClick={() => {
              void deleteSelectedSessions();
            }}
            className={BULK_DELETE_BUTTON_CLASS}
          >
            Archive selected
          </button>
        </div>
      ) : null}
      {rowError && !editingSessionId ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {rowError}
        </div>
      ) : null}
      <div className="flex flex-col overflow-visible rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-white">
        <div className="overflow-x-auto overflow-y-hidden pb-5">
          <table className="min-w-[1760px] w-full border-collapse text-left text-[12px]">
          <thead className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-12 px-3 py-2" data-column-pinned-header="select">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  aria-checked={someVisibleSelected ? "mixed" : allVisibleSelected}
                  onChange={() => onToggleAllVisibleSessions(visibleSessionIds)}
                  className="h-4 w-4 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]"
                  aria-label="Select visible sessions"
                />
              </th>
              {orderedColumns.map((column) => (
                <th
                  key={column.id}
                  {...getHeaderReorderProps(column)}
                  className={getHeaderReorderClassName(column.id, "px-3 py-2")}
                >
                  <div className="flex items-center gap-1.5">
                    <ColumnHeaderDragHandle />
                    {column.id === "modules" ? (
                      <span>{column.label}</span>
                    ) : (
                      <MatrixOverviewSortHeader
                        label={column.label}
                        sortKey={column.id}
                        sort={sort}
                        onSort={onSort}
                        shouldSuppressClick={shouldSuppressHeaderClick}
                      />
                    )}
                  </div>
                </th>
              ))}
              <th
                className="sticky right-0 z-30 w-[116px] border-l border-slate-200 bg-slate-50 px-3 py-2 text-center shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.55)]"
                data-column-pinned-header="actions"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((session) => {
              const conflicts = conflictsBySession.get(session.id) ?? [];
              const isEditing = editingSessionId === session.id;
              const isSaving = savingSessionId === session.id;
              const activeDraft = isEditing ? draft : null;
              const isSelectedForBulk = selectedSessionIds.has(session.id);
              const readiness = deriveMatrix2SessionReadiness(session, conflicts);
              const speakerPickerOptions: Matrix2InlinePickerOption[] = activeDraft?.speakerOptions.map((speaker) => ({
                id: speaker.id,
                label: speaker.name,
                meta: [speaker.title, speaker.company].filter(Boolean).join(" • ") || "Event speaker",
                searchText: [speaker.title, speaker.company, speaker.email].filter(Boolean).join(" "),
                disabled: speaker.status === "CANCELLED",
              })) ?? [];
              const avPickerOptions: Matrix2InlinePickerOption[] = avRequirementItems.map((item) => ({
                id: item.id,
                label: item.label,
                meta: item.hasQuantity ? "Quantity-capable requirement" : "AV requirement",
              }));
              const fnbPickerOptions: Matrix2InlinePickerOption[] = activeDraft?.fnbCatalogItems.map((item) => ({
                id: item.id,
                label: item.itemName,
                meta: [item.category, item.sourceMenuFileName].filter(Boolean).join(" • ") || "F&B catalog item",
                searchText: [item.description, item.category, item.sourceMenuFileName].filter(Boolean).join(" "),
              })) ?? [];
              const staffPeopleById = new Map(people.map((person) => [person.id, person]));
              const staffPickerOptions: Matrix2InlinePickerOption[] = uniqueOverviewOptions([
                ...people.filter((person) => person.role === "staff" || person.role === "vendor").map((person) => person.id),
                ...session.staffAssignments.map((staff) => staff.personId),
              ]).map((personId) => {
                const person = staffPeopleById.get(personId);
                const assigned = session.staffAssignments.find((staff) => staff.personId === personId);
                return {
                  id: `person:${personId}`,
                  label: person?.name ?? assigned?.name ?? "Event person",
                  meta: [assigned?.assignmentRole, person?.role ?? assigned?.role, person?.company ?? assigned?.company].filter(Boolean).join(" • ") || "Event staff",
                  searchText: [person?.role, person?.company, person?.email, assigned?.assignmentRole].filter(Boolean).join(" "),
                };
              }).concat(staffingRequirementItems.map((item) => ({
                id: `requirement:${item.id}`,
                label: item.label,
                meta: item.hasQuantity ? "Quantity-capable staffing need" : "Staffing need",
                searchText: item.label,
              })));
              return (
                <Fragment key={session.id}>
                  <tr
                    tabIndex={0}
                    aria-label={`Open Quick Change for ${session.title}`}
                    data-testid={`matrix-overview-session-row-${session.id}`}
                    className={[
                      "group h-11 cursor-default transition hover:bg-slate-50/80",
                      isSelectedForBulk
                        ? BULK_SELECTED_ROW_CLASS
                        : selectedSessionId === session.id
                          ? "bg-blue-50/40 shadow-[inset_3px_0_0_#94a3b8]"
                          : "bg-white",
                    ].join(" ")}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button, input, select, textarea, a, [role='button']")) return;
                      onSelectSession(session.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (activeDraft && !isSaving && event.key === "Escape") {
                        event.preventDefault();
                        cancelEditing();
                        return;
                      }
                      if (activeDraft && !isSaving && event.key === "Enter") {
                        event.preventDefault();
                        void saveDraft(session);
                        return;
                      }
                      if (!activeDraft && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        onSelectSession(session.id);
                      }
                    }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelectedForBulk}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => onToggleSessionSelection(session.id)}
                        className="h-4 w-4 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]"
                        aria-label={`Select ${session.title}`}
                      />
                    </td>
                    {orderedColumns.map((column) => {
                      switch (column.id) {
                        case "time":
                          return (
                            <td key={column.id} className="px-3 py-2 font-medium whitespace-nowrap text-slate-800">
                              {activeDraft ? (
                                <div className="flex items-center gap-1">
                                  <TimeField
                                    value={activeDraft.startTime}
                                    onChange={(value) => updateDraft("startTime", value)}
                                    size="compact"
                                    className="w-[124px]"
                                    inputClassName="rounded-md border-slate-200 px-2 text-[12px]"
                                    ariaLabel={`Start time for ${session.title}`}
                                  />
                                  <span className="text-slate-400">-</span>
                                  <TimeField
                                    value={activeDraft.endTime}
                                    onChange={(value) => updateDraft("endTime", value)}
                                    size="compact"
                                    className="w-[124px]"
                                    inputClassName="rounded-md border-slate-200 px-2 text-[12px]"
                                    ariaLabel={`End time for ${session.title}`}
                                  />
                                </div>
                              ) : (
                                <button type="button" onClick={() => startEditing(session)} className="font-medium whitespace-nowrap text-slate-800 hover:text-[#28439A]">
                                  {matrixSessionTimeLabel(session)}
                                </button>
                              )}
                            </td>
                          );
                        case "title":
                          return (
                            <td key={column.id} className="max-w-[220px] px-3 py-2 font-semibold text-slate-900">
                              {activeDraft ? (
                                <input
                                  data-testid={`matrix-overview-session-title-${session.id}`}
                                  aria-label={`Session title for ${session.title}`}
                                  value={activeDraft.title}
                                  onChange={(event) => updateDraft("title", event.target.value)}
                                  className={overviewInputClassName("min-w-[190px]")}
                                />
                              ) : (
                                <div className="space-y-1">
                                  <button type="button" onClick={() => startEditing(session)} className="block max-w-[220px] truncate text-left font-semibold text-slate-900 hover:text-[#28439A]">
                                    {session.title}
                                  </button>
                                  <span className={[
                                    "inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                                    session.includeInOfficialAgenda
                                      ? "border-blue-200 bg-blue-50 text-blue-700"
                                      : "border-slate-200 bg-slate-50 text-slate-500",
                                  ].join(" ")}>
                                    {session.includeInOfficialAgenda ? "Official agenda" : "Internal/operational only"}
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        case "type":
                          return (
                            <td key={column.id} className="max-w-[140px] px-3 py-2 text-slate-600">
                              {activeDraft ? (
                                <select
                                    value={activeDraft.sessionType}
                                    onChange={(event) => updateDraft("sessionType", event.target.value)}
                                    className={overviewInputClassName("min-w-[120px]")}
                                    aria-label={`Session type for ${session.title}`}
                                  >
                                    {sessionTypeOptionsForSavedValue(activeDraft.sessionType).map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                              ) : (
                                <button type="button" onClick={() => startEditing(session)} className={["inline-flex max-w-[130px] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold", matrixSessionTypeColorClasses(session.sessionType)].join(" ")}>
                                  {session.sessionType || "Session"}
                                </button>
                              )}
                            </td>
                          );
                        case "room":
                          return (
                            <td key={column.id} className="max-w-[150px] px-3 py-2 text-slate-600">
                              {activeDraft ? (
                                <select
                                  value={activeDraft.roomId}
                                  onChange={(event) => updateDraft("roomId", event.target.value)}
                                  className={overviewInputClassName("min-w-[140px]")}
                                  aria-label={`Room for ${session.title}`}
                                  data-matrix-overview-room={session.id}
                                >
                                  <option value="">Unassigned</option>
                                  {rooms.map((room) => (
                                    <option key={room.id} value={room.id}>{room.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <button type="button" onClick={() => startEditing(session)} className="block max-w-[150px] truncate text-left text-slate-600 hover:text-[#28439A]">{session.roomName || "Unassigned"}</button>
                              )}
                            </td>
                          );
                        case "modules":
                          return (
                            <td key={column.id} className="min-w-[230px] px-3 py-2 text-slate-600">
                              {activeDraft ? (
                                <div className="grid min-w-[220px] gap-2" data-testid={`matrix-overview-module-editors-${session.id}`}>
                                  <Matrix2InlineModulePicker
                                    ariaLabel={`Speakers for ${session.title}`}
                                    placeholder="Select speakers"
                                    selectedIds={activeDraft.speakerIds}
                                    options={speakerPickerOptions}
                                    emptyLabel="No event speakers found."
                                    isLoading={modulePickerLoadingSessionId === session.id}
                                    error={modulePickerError}
                                    footerActions={[{ label: "Manage speakers", onClick: () => onOpenQuickPanel(session.id, "speakers") }]}
                                    onToggle={(speakerId, selected) => updateDraft("speakerIds", selected ? [...activeDraft.speakerIds, speakerId] : activeDraft.speakerIds.filter((id) => id !== speakerId))}
                                  />
                                  <Matrix2InlineModulePicker
                                    ariaLabel={`AV for ${session.title}`}
                                    placeholder="Select AV"
                                    selectedIds={Object.keys(activeDraft.avRequirementValues)}
                                    options={avPickerOptions}
                                    emptyLabel="No AV requirements configured."
                                    footerActions={[{ label: "Open AV details", onClick: () => onOpenQuickPanel(session.id, "av") }]}
                                    onToggle={(itemId, selected) => { const item = avRequirementItems.find((entry) => entry.id === itemId); if (item) updateDraftAvRequirement(item, selected); }}
                                  />
                                  <Matrix2InlineModulePicker
                                    ariaLabel={`F&B for ${session.title}`}
                                    placeholder="Select F&B"
                                    selectedIds={activeDraft.fnbCatalogItemIds}
                                    options={fnbPickerOptions}
                                    emptyLabel="No F&B catalog items available."
                                    isLoading={modulePickerLoadingSessionId === session.id}
                                    error={modulePickerError}
                                    notice={readiness.fnb.status === "needs_info" && session.foodService?.headcount == null ? <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-700">Headcount is still missing.</p> : null}
                                    footerActions={[
                                      { label: "Open F&B details", onClick: () => onOpenQuickPanel(session.id, "fnb") },
                                      { label: "Manage F&B catalog", href: `/events/${eventId}/fnb-catalog` },
                                    ]}
                                    onToggle={(itemId, selected) => setDraft((current) => current && current.sessionId === session.id ? {
                                      ...current,
                                      fnbCatalogItemIds: selected ? [...current.fnbCatalogItemIds, itemId] : current.fnbCatalogItemIds.filter((id) => id !== itemId),
                                      fnbTouched: true,
                                    } : current)}
                                  />
                                  <Matrix2InlineModulePicker
                                    ariaLabel={`Staffing for ${session.title}`}
                                    placeholder="Select staffing"
                                    selectedIds={[
                                      ...activeDraft.staffPersonIds.map((personId) => `person:${personId}`),
                                      ...Object.keys(activeDraft.staffingRequirementValues).map((itemId) => `requirement:${itemId}`),
                                    ]}
                                    options={staffPickerOptions}
                                    emptyLabel="No event staff or vendors found."
                                    footerActions={[{ label: "Open Staffing details", onClick: () => onOpenQuickPanel(session.id, "staffing") }]}
                                    onToggle={(optionId, selected) => {
                                      if (optionId.startsWith("requirement:")) {
                                        const itemId = optionId.slice("requirement:".length);
                                        setDraft((current) => {
                                          if (!current || current.sessionId !== session.id) return current;
                                          const staffingRequirementValues = { ...current.staffingRequirementValues };
                                          if (selected) staffingRequirementValues[itemId] = staffingRequirementValues[itemId] ?? "";
                                          else delete staffingRequirementValues[itemId];
                                          return { ...current, staffingRequirementValues };
                                        });
                                        return;
                                      }
                                      const personId = optionId.slice("person:".length);
                                      updateDraft("staffPersonIds", selected ? [...activeDraft.staffPersonIds, personId] : activeDraft.staffPersonIds.filter((id) => id !== personId));
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1" aria-label={`Module readiness for ${session.title}`}>
                                  <OperationalModuleIcon label="Speakers" readiness={readiness.speakers} onOpen={() => onOpenQuickPanel(session.id, "speakers")} disabled={!isSessionModuleAvailable("speakers") || matrix2QuickModule("speakers")?.enabled === false}><Mic className="h-4 w-4" aria-hidden /></OperationalModuleIcon>
                                  <OperationalModuleIcon label="AV" readiness={readiness.av} onOpen={() => onOpenQuickPanel(session.id, "av")} disabled={!isSessionModuleAvailable("av") || matrix2QuickModule("av")?.enabled === false}><Monitor className="h-4 w-4" aria-hidden /></OperationalModuleIcon>
                                  <OperationalModuleIcon label="F&B" readiness={readiness.fnb} onOpen={() => onOpenQuickPanel(session.id, "fnb")} disabled={!isSessionModuleAvailable("fnb") || matrix2QuickModule("fnb")?.enabled === false}><Utensils className="h-4 w-4" aria-hidden /></OperationalModuleIcon>
                                  <OperationalModuleIcon label="Staffing" readiness={readiness.staffing} onOpen={() => onOpenQuickPanel(session.id, "staffing")} disabled={!isSessionModuleAvailable("staffing") || matrix2QuickModule("staffing")?.enabled === false}><Users className="h-4 w-4" aria-hidden /></OperationalModuleIcon>
                                </div>
                              )}
                            </td>
                          );
                        case "roomSetup":
                          return (
                            <td key={column.id} className="max-w-[160px] px-3 py-2 text-slate-600">
                              {activeDraft ? (
                                <select value={activeDraft.roomSetupType} onChange={(event) => updateDraft("roomSetupType", event.target.value)} className={overviewInputClassName("min-w-[150px]")} aria-label={`Room set style for ${session.title}`}>
                                  <option value="">Setup not selected</option>
                                  {activeDraft.roomSetupType.trim() && !roomSetupOptions.some((option) => option.toLowerCase() === activeDraft.roomSetupType.trim().toLowerCase()) ? (
                                    <option value={activeDraft.roomSetupType}>{activeDraft.roomSetupType}</option>
                                  ) : null}
                                  {roomSetupOptions.map((roomSetup) => (
                                    <option key={roomSetup} value={roomSetup}>{roomSetup}</option>
                                  ))}
                                </select>
                              ) : (
                                <button type="button" onClick={() => startEditing(session)} className="block max-w-[160px] truncate text-left text-slate-600 hover:text-[#28439A]">{session.roomSetup || "—"}</button>
                              )}
                            </td>
                          );
                        case "attendance":
                          return (
                            <td key={column.id} className="px-3 py-2 text-slate-600">
                              {activeDraft ? (
                                <input type="number" min={0} value={activeDraft.attendanceText} onChange={(event) => updateDraft("attendanceText", event.target.value)} className={overviewInputClassName("w-[92px]")} aria-label={`Count for ${session.title}`} />
                              ) : (
                                <button type="button" onClick={() => startEditing(session)} className="text-slate-600 hover:text-[#28439A]">{session.expectedAttendance ?? "—"}</button>
                              )}
                            </td>
                          );
                        case "notes":
                          return (
                            <td key={column.id} className="max-w-[210px] px-3 py-2 text-slate-600">
                              {activeDraft ? (
                                <input value={activeDraft.notes} onChange={(event) => updateDraft("notes", event.target.value)} className={overviewInputClassName("min-w-[200px]")} aria-label={`Notes for ${session.title}`} placeholder="Notes" />
                              ) : (
                                <button type="button" onClick={() => startEditing(session)} className="block max-w-[210px] truncate text-left text-slate-600 hover:text-[#28439A]">{session.notes.trim() || "—"}</button>
                              )}
                            </td>
                          );
                        case "conflicts":
                          return (
                            <td key={column.id} className="px-3 py-2">
                              {conflicts.length > 0 ? (
                                <MatrixConflictBadgeWithTooltip conflicts={conflicts} instanceId={session.id} />
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          );
                        case "status":
                          return (
                            <td key={column.id} className="px-3 py-2">
                              {activeDraft ? (
                                <select
                                  value={canonicalSessionStatusValue(activeDraft.status, statusOptions) ?? ""}
                                  onChange={(event) => updateDraft("status", event.target.value)}
                                  className={overviewInputClassName("min-w-[130px]")}
                                  aria-label={`Status for ${session.title}`}
                                >
                                  <option value="" disabled>Select status</option>
                                  {statusOptions.map((status) => (
                                    <option key={status.key} value={status.value}>{status.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <button type="button" onClick={() => startEditing(session)}><MatrixStatusPill status={session.status} /></button>
                              )}
                            </td>
                          );
                        default:
                          return null;
                      }
                    })}
                    <td
                      className={[
                        "sticky right-0 z-20 w-[116px] border-l border-slate-200 px-3 py-2 text-center shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.55)]",
                        isSelectedForBulk
                          ? "bg-blue-50/70 group-hover:bg-blue-50/70"
                          : selectedSessionId === session.id
                            ? "bg-blue-50/40 group-hover:bg-blue-50/40"
                            : "bg-white group-hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {activeDraft ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            data-testid={`matrix-overview-session-save-${session.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void saveDraft(session);
                            }}
                            disabled={isSaving}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-[#28439A]/20 bg-[#28439A] px-2 text-[11px] font-semibold text-white hover:bg-[#1f3478] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" aria-label="Saving session" /> : null}
                            Save
                          </button>
                          <button
                            type="button"
                            data-testid={`matrix-overview-session-cancel-${session.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              cancelEditing();
                            }}
                            disabled={isSaving}
                            className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <Matrix2SessionActionsMenu
                          sessionTitle={session.title}
                          disabled={isBulkMutating}
                          onOpenDetails={() => onSelectSession(session.id)}
                          onEditInline={() => startEditing(session)}
                          onDuplicate={() => onDuplicateSession(session.id)}
                          onMove={() => startEditing(session, true)}
                          onDelete={() => onDeleteSession(session.id)}
                        />
                      )}
                    </td>
                  </tr>
                  {isEditing && rowError ? (
                    <tr key={`${session.id}:error`}>
                      <td colSpan={2 + orderedColumns.length} className="bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{rowError}</td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}

export default function Matrix2Page({ eventIdOverride = "", hideEventSelector = false }: Matrix2PageProps) {
  const terminology = useEventTerminology();
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: MATRIX2_SESSION_DRAG_ACTIVATION_DISTANCE,
      },
    }),
  );

  const searchParams = useSearchParams();
  const requestedEventId = useMemo(() => {
    if (eventIdOverride.trim()) return eventIdOverride.trim();
    return searchParams.get("eventId")?.trim() ?? "";
  }, [eventIdOverride, searchParams]);

  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [snapshot, setSnapshot] = useState<Matrix2Snapshot | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedOverviewSessionIds, setSelectedOverviewSessionIds] = useState<Set<string>>(() => new Set());
  const [quickDrawerPanel, setQuickDrawerPanel] = useState<Matrix2QuickPanelKey | null>(null);
  const [isRunOfShowTaskModalOpen, setIsRunOfShowTaskModalOpen] = useState(false);
  const [activeDragTemplate, setActiveDragTemplate] = useState<Matrix2Template | null>(null);
  const [activeDragSessionId, setActiveDragSessionId] = useState<string | null>(null);
  const sessionDragClickStateRef = useRef(createMatrix2SessionDragClickState());
  const trailingDragClickResetTimerRef = useRef<number | null>(null);

  const [searchValue, setSearchValue] = useState("");
  const [listFilters, setListFilters] = useState<MatrixListFilterState>(EMPTY_MATRIX_LIST_FILTERS);
  const [zoomMode, setZoomMode] = useState<Matrix2ZoomMode>("PLANNING");
  const [boardOrientation, setBoardOrientation] = useState("ROOMS_BY_TIME" as Matrix2BoardOrientation);
  const [overviewSort, setOverviewSort] = useState<MatrixOverviewSortState>(null);

  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [addSessionType, setAddSessionType] = useState(DEFAULT_SESSION_TYPE);
  const [addSessionIncludeInOfficialAgenda, setAddSessionIncludeInOfficialAgenda] = useState(false);
  const [addSessionDate, setAddSessionDate] = useState("");
  const [addSessionRoomId, setAddSessionRoomId] = useState("");
  const [addSessionStartTime, setAddSessionStartTime] = useState("09:00");
  const [addSessionEndTime, setAddSessionEndTime] = useState("10:00");
  const [isAddSessionEndTimeManuallyEdited, setIsAddSessionEndTimeManuallyEdited] = useState(false);
  const [addSessionError, setAddSessionError] = useState<string | null>(null);
  const [pendingCreatedSession, setPendingCreatedSession] = useState<{ id: string; sessionType: string } | null>(null);
  const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCapacity, setNewRoomCapacity] = useState("");
  const [newRoomNotes, setNewRoomNotes] = useState("");
  const [roomFormError, setRoomFormError] = useState<string | null>(null);
  const [pendingCreatedRoomName, setPendingCreatedRoomName] = useState<string | null>(null);
  const [isEditRoomOpen, setIsEditRoomOpen] = useState(false);
  const [isUpdatingRoom, setIsUpdatingRoom] = useState(false);
  const [isDeleteRoomConfirmOpen, setIsDeleteRoomConfirmOpen] = useState(false);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [deleteRoomError, setDeleteRoomError] = useState<string | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomName, setEditRoomName] = useState("");
  const [editRoomCapacity, setEditRoomCapacity] = useState("");
  const [editRoomNotes, setEditRoomNotes] = useState("");
  const [editRoomFormError, setEditRoomFormError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snapshotLoadError, setSnapshotLoadError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashErrorMessage, setFlashErrorMessage] = useState<string | null>(null);
  const snapshotRequestVersionRef = useRef(0);
  const previousEventIdRef = useRef("");

  useEffect(() => {
    if (!flashMessage) return;
    const timeout = setTimeout(() => setFlashMessage(null), 2400);
    return () => clearTimeout(timeout);
  }, [flashMessage]);

  useEffect(() => {
    if (!flashErrorMessage) return;
    const timeout = setTimeout(() => setFlashErrorMessage(null), 3200);
    return () => clearTimeout(timeout);
  }, [flashErrorMessage]);

  const loadEvents = useCallback(async (): Promise<EventOption[]> => {
    setIsLoadingEvents(true);

    try {
      const response = await fetch(`/api/events?orgId=${ORG_ID}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load events"));
      }

      const loadedEvents = Array.isArray(payload)
        ? payload
            .filter((event): event is { id: string; name: string } => {
              return Boolean(event && typeof event.id === "string" && typeof event.name === "string");
            })
            .map((event) => ({ id: event.id, name: event.name }))
        : [];

      setEvents(loadedEvents);
      return loadedEvents;
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load events");
      setEvents([]);
      return [];
    } finally {
      setIsLoadingEvents(false);
    }
  }, []);

  const loadSnapshot = useCallback(async (
    eventId: string,
    options: { preserveSelectedDate?: boolean; signal?: AbortSignal } = {},
  ): Promise<Matrix2Snapshot | null> => {
    const requestVersion = snapshotRequestVersionRef.current + 1;
    snapshotRequestVersionRef.current = requestVersion;

    if (!eventId) {
      setSnapshot(null);
      setSelectedDate("");
      setSelectedSessionId(null);
      return null;
    }

    setIsLoadingSnapshot(true);
    setSnapshotLoadError(null);

    try {
      const source = hideEventSelector ? "event-matrix-page" : "matrix-2-page";
      const response = await fetch(`/api/events/${eventId}/matrix-2?source=${encodeURIComponent(source)}`, {
        cache: "no-store",
        signal: options.signal,
      });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(
          toErrorMessage(payload, `Failed to load ${terminology.runOfShow} snapshot (HTTP ${response.status})`),
        );
      }

      const nextSnapshot = payload as Matrix2Snapshot;
      if (!isMatrix2SnapshotForEvent(nextSnapshot, eventId)) {
        throw new Error(`${terminology.runOfShow} snapshot did not match the requested event`);
      }
      if (!isCurrentMatrix2SnapshotRequest(requestVersion, snapshotRequestVersionRef.current)) {
        return null;
      }

      setSnapshot(nextSnapshot);
      setSnapshotLoadError(null);
      setSelectedDate((current) => {
        return resolveMatrix2SelectedDate({
          snapshot: nextSnapshot,
          currentDate: current,
          preserveCurrentDate: options.preserveSelectedDate ?? true,
        });
      });
      return nextSnapshot;
    } catch (error) {
      if (!isCurrentMatrix2SnapshotRequest(requestVersion, snapshotRequestVersionRef.current)) {
        return null;
      }
      console.error(error);
      setSnapshotLoadError(error instanceof Error ? error.message : `Failed to load ${terminology.runOfShow} snapshot`);
      setSnapshot(null);
      setSelectedDate("");
      setSelectedSessionId(null);
      return null;
    } finally {
      if (isCurrentMatrix2SnapshotRequest(requestVersion, snapshotRequestVersionRef.current)) {
        setIsLoadingSnapshot(false);
      }
    }
  }, [hideEventSelector, terminology.runOfShow]);

  useEffect(() => {
    if (hideEventSelector) return;
    void loadEvents();
  }, [hideEventSelector, loadEvents]);

  useEffect(() => {
    if (!hideEventSelector) return;
    const scopedEventId = requestedEventId.trim();
    setSelectedEventId((current) => (current === scopedEventId ? current : scopedEventId));
  }, [hideEventSelector, requestedEventId]);

  useEffect(() => {
    if (hideEventSelector) return;
    if (events.length === 0) {
      setSelectedEventId("");
      return;
    }

    const eventIds = new Set(events.map((event) => event.id));
    if (selectedEventId && eventIds.has(selectedEventId)) {
      return;
    }

    const storedPreferred = window.localStorage.getItem(MATRIX2_SELECTED_EVENT_KEY)?.trim() ?? "";
    const timelinePreferred = window.localStorage.getItem(TIMELINE_SELECTED_EVENT_KEY)?.trim() ?? "";

    const nextEventId = [requestedEventId, storedPreferred, timelinePreferred]
      .map((value) => value.trim())
      .find((candidate) => candidate && eventIds.has(candidate)) ?? events[0].id;

    setSelectedEventId(nextEventId);
  }, [events, hideEventSelector, requestedEventId, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) {
      snapshotRequestVersionRef.current += 1;
      previousEventIdRef.current = "";
      setSnapshot(null);
      setSelectedDate("");
      setSelectedSessionId(null);
      setSelectedOverviewSessionIds(new Set());
      setSearchValue("");
      setListFilters(EMPTY_MATRIX_LIST_FILTERS);
      return;
    }

    const eventChanged = previousEventIdRef.current !== selectedEventId;
    previousEventIdRef.current = selectedEventId;
    if (eventChanged) {
      setSnapshot(null);
      setSelectedDate("");
      setSelectedSessionId(null);
      setSelectedOverviewSessionIds(new Set());
      setSearchValue("");
      setListFilters(EMPTY_MATRIX_LIST_FILTERS);
    }
    window.localStorage.setItem(MATRIX2_SELECTED_EVENT_KEY, selectedEventId);
    const controller = new AbortController();
    void loadSnapshot(selectedEventId, {
      preserveSelectedDate: !eventChanged,
      signal: controller.signal,
    });
    return () => {
      // Invalidate before aborting so an old request cannot clear the new event's state.
      snapshotRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [loadSnapshot, selectedEventId]);

  const sessionsForDate = useMemo(() => {
    if (!snapshot || !selectedDate) return [];
    return matrix2SessionsForEventDate({ snapshot, eventId: selectedEventId, date: selectedDate });
  }, [selectedDate, selectedEventId, snapshot]);

  const avRequirementItems = useMemo(
    () => matrixOverviewRequirementItemsByType(snapshot?.requirementTemplate, "AV"),
    [snapshot?.requirementTemplate],
  );
  const staffingRequirementItems = useMemo(
    () => matrixOverviewRequirementItemsByType(snapshot?.requirementTemplate, "STAFFING")
      .filter((item) => isStaffingNeedRequirementItem(item)),
    [snapshot?.requirementTemplate],
  );
  const setupRequirementItems = useMemo(
    () => matrixOverviewRequirementItemsByType(snapshot?.requirementTemplate, "SETUP"),
    [snapshot?.requirementTemplate],
  );

  const runOfShowTaskSessionOptions = useMemo<TaskCreateAttachmentOption[]>(() => {
    const sessions = snapshot?.sessions ?? [];
    return sessions
      .filter((session) => !session.isTemporary)
      .slice()
      .sort((left, right) => (
        left.date.localeCompare(right.date) ||
        left.startTime.localeCompare(right.startTime) ||
        left.title.localeCompare(right.title)
      ))
      .map((session) => ({
        objectType: "MATRIX_ROW",
        objectId: session.rowId,
        label: session.title,
        description: [formatDateLabel(session.date), matrixSessionTimeLabel(session), session.roomName || "No room"].join(" · "),
      }));
  }, [snapshot?.sessions]);

  const roomSetAndSeatingAvailable = isSessionModuleAvailable("room-set");
  const conflictsForDate = useMemo(() => detectMatrix2Conflicts(sessionsForDate), [sessionsForDate]);
  const visibleConflictsForDate = useMemo(() => ({
    conflicts: visibleMatrix2Conflicts(conflictsForDate.conflicts, { roomSetAndSeatingAvailable }),
    bySession: visibleMatrix2ConflictMap(conflictsForDate.bySession, { roomSetAndSeatingAvailable }),
  }), [conflictsForDate, roomSetAndSeatingAvailable]);

  const visibleSessions = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    return sessionsForDate.filter((session) => {
      if ((session as Matrix2Session & { isTemporary?: boolean }).isTemporary === true) {
        return false;
      }

      if (!normalizedSearch) return true;
      return sessionSearchText(session).includes(normalizedSearch);
    });
  }, [searchValue, sessionsForDate]);

  const listVisibleSessions = useMemo(() => {
    return visibleSessions.filter((session) => {
      if (listFilters.type && session.sessionType !== listFilters.type) return false;
      if (listFilters.officialAgenda === "OFFICIAL" && !session.includeInOfficialAgenda) return false;
      if (listFilters.officialAgenda === "INTERNAL" && session.includeInOfficialAgenda) return false;

      if (listFilters.roomId) {
        if (listFilters.roomId === "__unassigned__") {
          if (session.roomId) return false;
        } else if (session.roomId !== listFilters.roomId) {
          return false;
        }
      }

      if (!matchesMatrixListPresenceFilter(listFilters.speakers, session.speakers.length)) return false;
      if (!matchesMatrixListPresenceFilter(listFilters.av, session.avRequirements.length)) return false;
      if (!matchesMatrixListPresenceFilter(listFilters.fnb, session.foodAndBeverage.length)) return false;
      if (!matchesMatrixListPresenceFilter(listFilters.staffing, session.staffAssigned.length)) return false;

      return true;
    });
  }, [listFilters, visibleSessions]);

  const sessionTypeFilterOptions = useMemo(() => {
    const sessionTypes = new Set<string>();
    for (const session of visibleSessions) {
      if (session.sessionType.trim()) {
        sessionTypes.add(session.sessionType);
      }
    }
    return Array.from(sessionTypes).sort((left, right) => left.localeCompare(right));
  }, [visibleSessions]);

  useEffect(() => {
    if (!selectedSessionId) return;

    const stillVisible = visibleSessions.some((session) => session.id === selectedSessionId);
    if (!stillVisible) {
      setSelectedSessionId(null);
    }
  }, [selectedSessionId, visibleSessions]);

  useEffect(() => {
    if (!snapshot) {
      setSelectedOverviewSessionIds(new Set());
      return;
    }

    const allSessionIds = new Set(snapshot.sessions.map((session) => session.id));
    setSelectedOverviewSessionIds((current) => {
      const next = new Set(Array.from(current).filter((sessionId) => allSessionIds.has(sessionId)));
      return next.size === current.size ? current : next;
    });
  }, [snapshot]);

  useEffect(() => {
    if (!selectedEventId || typeof window === "undefined") {
      setBoardOrientation("ROOMS_BY_TIME");
      return;
    }

    const storedOrientation = window.localStorage.getItem(matrix2BoardOrientationStorageKey(selectedEventId));
    setBoardOrientation(isMatrix2BoardOrientation(storedOrientation) ? storedOrientation : "ROOMS_BY_TIME");
  }, [selectedEventId]);

  useEffect(() => {
    if (!selectedEventId || typeof window === "undefined") return;
    window.localStorage.setItem(matrix2BoardOrientationStorageKey(selectedEventId), boardOrientation);
  }, [boardOrientation, selectedEventId]);

  const activeDragSession = useMemo(() => {
    if (!activeDragSessionId || !snapshot) return null;
    return snapshot.sessions.find((session) => session.id === activeDragSessionId) ?? null;
  }, [activeDragSessionId, snapshot]);

  const selectedSession = useMemo(
    () => visibleSessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, visibleSessions],
  );

  const selectedSessionConflicts = useMemo(
    () => (selectedSession ? visibleConflictsForDate.bySession.get(selectedSession.id) ?? [] : []),
    [selectedSession, visibleConflictsForDate.bySession],
  );

  useEffect(() => {
    if (selectedSessionId) return;
    setQuickDrawerPanel(null);
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSession) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedSessionId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSession]);

  const overviewSessions = useMemo(() => {
    const sorted = [...listVisibleSessions];

    if (!overviewSort) {
      sorted.sort((left, right) => (
        left.roomName.localeCompare(right.roomName) ||
        left.startTime.localeCompare(right.startTime) ||
        left.title.localeCompare(right.title)
      ));
      return sorted;
    }
    const activeOverviewSort = overviewSort;

    function valueFor(session: Matrix2Session): string | number {
      switch (activeOverviewSort.key) {
        case "time":
          return session.startTime;
        case "title":
          return session.title.toLowerCase();
        case "type":
          return session.sessionType.toLowerCase();
        case "room":
          return session.roomName.toLowerCase();
        case "speakers":
          return session.speakers.length;
        case "av":
          return session.avRequirements.length;
        case "fnb":
          return session.foodAndBeverage.length;
        case "staff":
          return session.staffAssigned.length;
        case "roomSetup":
          return session.roomSetup.toLowerCase();
        case "attendance":
          return session.expectedAttendance ?? -1;
        case "notes":
          return session.notes.toLowerCase();
        case "conflicts":
          return visibleConflictsForDate.bySession.get(session.id)?.length ?? 0;
        case "status":
          return session.status.toLowerCase();
      }
    }

    sorted.sort((left, right) => {
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);
      const comparison = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      if (comparison !== 0) {
        return activeOverviewSort.direction === "asc" ? comparison : -comparison;
      }
      return left.startTime.localeCompare(right.startTime) || left.title.localeCompare(right.title);
    });

    return sorted;
  }, [listVisibleSessions, overviewSort, visibleConflictsForDate.bySession]);

  const operationsSessionId = useMemo(() => {
    const firstVisibleSession = overviewSessions[0]?.id ?? null;
    const firstDateSession = sessionsForDate.find((session) => !session.isTemporary)?.id ?? null;
    const firstEventSession = snapshot?.sessions.find((session) => !session.isTemporary)?.id ?? null;

    return selectedSession?.id ?? firstVisibleSession ?? firstDateSession ?? firstEventSession;
  }, [overviewSessions, selectedSession?.id, sessionsForDate, snapshot?.sessions]);

  const stats = useMemo(() => {
    if (!snapshot) {
      return {
        sessions: 0,
        speakers: 0,
        roomsActive: 0,
        conflicts: 0,
      };
    }

    const sessionsInScope = sessionsForDate;
    const uniqueSpeakers = new Set<string>();
    const roomGroups = deriveMatrix2BoardRoomGroups(snapshot.rooms, sessionsInScope);

    for (const session of sessionsInScope) {
      for (const speaker of session.speakers) {
        if (speaker.trim()) {
          uniqueSpeakers.add(speaker.trim().toLowerCase());
        }
      }
    }

    return {
      sessions: sessionsInScope.length,
      speakers: uniqueSpeakers.size,
      roomsActive: roomGroups.length,
      conflicts: visibleConflictsForDate.conflicts.length,
    };
  }, [sessionsForDate, snapshot, visibleConflictsForDate.conflicts.length]);

  const handleEventChange = useCallback(async (eventId: string): Promise<void> => {
    setSelectedEventId(eventId);
    setSelectedSessionId(null);
    setIsAddSessionOpen(false);
    setAddSessionError(null);
    setIsAddRoomOpen(false);
    setIsEditRoomOpen(false);
    setNewRoomName("");
    setNewRoomCapacity("");
    setNewRoomNotes("");
    setRoomFormError(null);
    setEditingRoomId(null);
    setEditRoomName("");
    setEditRoomCapacity("");
    setEditRoomNotes("");
    setEditRoomFormError(null);
    setSelectedOverviewSessionIds(new Set());
    setSearchValue("");
    setListFilters(EMPTY_MATRIX_LIST_FILTERS);
  }, []);

  const handleListFiltersChange = useCallback((nextFilters: MatrixListFilterState): void => {
    setListFilters(nextFilters);
    setSelectedSessionId(null);
    setSelectedOverviewSessionIds(new Set());
  }, []);

  const handleClearListFilters = useCallback((): void => {
    setListFilters(EMPTY_MATRIX_LIST_FILTERS);
    setSelectedSessionId(null);
    setSelectedOverviewSessionIds(new Set());
  }, []);

  const handleZoomModeChange = useCallback((nextZoomMode: Matrix2ZoomMode): void => {
    setZoomMode(nextZoomMode);
    setSelectedSessionId(null);
    setActiveDragTemplate(null);
    setActiveDragSessionId(null);
  }, []);

  const handleToggleOverviewSessionSelection = useCallback((sessionId: string): void => {
    setSelectedOverviewSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const handleToggleAllVisibleOverviewSessions = useCallback((sessionIds: string[]): void => {
    setSelectedOverviewSessionIds((current) => {
      const next = new Set(current);
      const allVisibleSelected = sessionIds.length > 0 && sessionIds.every((sessionId) => next.has(sessionId));
      if (allVisibleSelected) {
        for (const sessionId of sessionIds) next.delete(sessionId);
      } else {
        for (const sessionId of sessionIds) next.add(sessionId);
      }
      return next;
    });
  }, []);

  const handleClearOverviewSelection = useCallback((): void => {
    setSelectedOverviewSessionIds(new Set());
  }, []);

  const handleOpenSessionOperations = useCallback((): void => {
    if (!selectedEventId || !operationsSessionId) return;
    router.push(`/events/${encodeURIComponent(selectedEventId)}/matrix/sessions/${encodeURIComponent(operationsSessionId)}`);
  }, [operationsSessionId, router, selectedEventId]);

  const handleOpenQuickDrawer = useCallback((sessionId: string, panel: Matrix2QuickPanelKey | null): void => {
    // Set the requested panel before selecting the session so the drawer's first
    // visible render is already on the intended destination.
    setQuickDrawerPanel(panel);
    setSelectedSessionId(sessionId);
  }, []);

  const handleOpenOverviewDetails = useCallback((sessionId: string): void => {
    handleOpenQuickDrawer(sessionId, null);
  }, [handleOpenQuickDrawer]);

  const handleOpenOverviewQuickPanel = useCallback((sessionId: string, panel: Matrix2QuickPanelKey): void => {
    handleOpenQuickDrawer(sessionId, panel);
  }, [handleOpenQuickDrawer]);

  const handleSessionAction = useCallback((sessionId: string, action: Matrix2SessionAction): void => {
    if (!selectedEventId) return;
    if (!isSessionModuleAvailable(action)) return;
    const quickModule = matrix2QuickModule(action);
    if (quickModule && !quickModule.enabled) return;

    const sessionHref = `/events/${encodeURIComponent(selectedEventId)}/matrix/sessions/${encodeURIComponent(sessionId)}`;

    if (action === "basics" || action === "speakers" || action === "av" || action === "fnb" || action === "staffing") {
      setZoomMode("PLANNING");
      handleOpenQuickDrawer(sessionId, action === "basics" ? null : action);
      return;
    }

    if (action === "room-set") {
      router.push(roomSetHref(selectedEventId, sessionId, "layout"));
      return;
    }

    if (action === "seating") {
      router.push(roomSetHref(selectedEventId, sessionId, "seating"));
      return;
    }

    if (action === "workspace") {
      router.push(`${sessionHref}?tab=overview`);
      return;
    }

    router.push(`${sessionHref}?tab=${encodeURIComponent(action)}`);
  }, [handleOpenQuickDrawer, router, selectedEventId]);

  const handleClearBoardSelection = useCallback((): void => {
    setSelectedSessionId(null);
  }, []);

  const handleOpenAddRoom = useCallback((): void => {
    if (!selectedEventId) return;
    setNewRoomName("");
    setNewRoomCapacity("");
    setNewRoomNotes("");
    setRoomFormError(null);
    setIsAddRoomOpen(true);
  }, [selectedEventId]);

  const handleOpenEditRoom = useCallback((room: Matrix2Room): void => {
    setEditingRoomId(room.id);
    setEditRoomName(room.name);
    setEditRoomCapacity(room.capacity === null ? "" : String(room.capacity));
    setEditRoomNotes("");
    setEditRoomFormError(null);
    setIsEditRoomOpen(true);
  }, []);

  const handleOpenAddSession = useCallback((): void => {
    if (!selectedEventId || !snapshot) {
      setErrorMessage(snapshotLoadError ?? `${terminology.runOfShow} is unavailable. Retry loading it before adding a session.`);
      return;
    }

    const date = selectedDate || snapshot.event.startDate;
    const daySessions = snapshot.sessions.filter((session) => session.date === date);
    const latestEnd = daySessions.reduce((maxEnd, session) => {
      const end = toMinutes(session.endTime) ?? maxEnd;
      return Math.max(maxEnd, end);
    }, 9 * 60 - 15);
    let startMinutes = roundUpToQuarter(Math.max(9 * 60, latestEnd + 15));

    if (startMinutes + DEFAULT_ADD_SESSION_DURATION_MINUTES > MAX_TIME_MINUTES) {
      startMinutes = 9 * 60;
    }

    setAddSessionType(DEFAULT_SESSION_TYPE);
    setAddSessionIncludeInOfficialAgenda(false);
    setAddSessionDate(date);
    setAddSessionRoomId(snapshot.rooms[0]?.id ?? "");
    setAddSessionStartTime(minutesToTime(startMinutes));
    setAddSessionEndTime(minutesToTime(startMinutes + DEFAULT_ADD_SESSION_DURATION_MINUTES));
    setIsAddSessionEndTimeManuallyEdited(false);
    setAddSessionError(null);
    setIsAddSessionOpen(true);
  }, [selectedDate, selectedEventId, snapshot, snapshotLoadError, terminology.runOfShow]);

  const handleAddSessionTypeChange = useCallback((nextType: string): void => {
    setAddSessionType(nextType);
    setAddSessionError(null);
  }, []);

  const handleAddSessionStartTimeChange = useCallback((nextStartTime: string): void => {
    setAddSessionStartTime(nextStartTime);
    if (!isAddSessionEndTimeManuallyEdited) {
      const startMinutes = toMinutes(nextStartTime);
      if (startMinutes !== null) {
        setAddSessionEndTime(minutesToTime(Math.min(startMinutes + DEFAULT_ADD_SESSION_DURATION_MINUTES, MAX_TIME_MINUTES)));
      }
    }
    setAddSessionError(null);
  }, [isAddSessionEndTimeManuallyEdited]);

  const handleAddSessionEndTimeChange = useCallback((nextEndTime: string): void => {
    setAddSessionEndTime(nextEndTime);
    setIsAddSessionEndTimeManuallyEdited(true);
    setAddSessionError(null);
  }, []);

  const handleCreateAddSession = useCallback(async (): Promise<void> => {
    if (!selectedEventId || !snapshot) return;

    const startMinutes = toMinutes(addSessionStartTime);
    if (startMinutes === null) {
      setAddSessionError("Choose a valid start time.");
      return;
    }

    const endMinutes = toMinutes(addSessionEndTime);
    if (endMinutes === null) {
      setAddSessionError("Choose a valid end time.");
      return;
    }
    if (endMinutes <= startMinutes) {
      setAddSessionError("End time must be later than start time.");
      return;
    }

    const template = MATRIX2_TEMPLATES.find((entry) => entry.sessionType === addSessionType) ?? null;
    const sessionType = addSessionType || DEFAULT_SESSION_TYPE;

    const date = addSessionDate || selectedDate || snapshot.event.startDate;
    const room = addSessionRoomId
      ? snapshot.rooms.find((entry) => entry.id === addSessionRoomId) ?? null
      : null;

    setIsMutating(true);
    setAddSessionError(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${selectedEventId}/matrix-rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          startTime: addSessionStartTime,
          endTime: addSessionEndTime,
          roomId: room?.id ?? null,
          room: room?.name ?? "",
          sessionName: sessionType,
          includeInOfficialAgenda: addSessionIncludeInOfficialAgenda,
          setup: template?.defaultSetup ?? "",
          attendance: template?.defaultAttendance ?? null,
          meal: template?.defaultMeal ?? "",
          avNeeds: (template?.defaultAvNeeds ?? []).join(", "),
          notes: buildEncodedNotes({
            sessionType,
            speakers: template?.defaultSpeakers ?? [],
            staffAssigned: template?.defaultStaff ?? [],
            foodAndBeverage: template?.defaultFnb ?? [],
            notes: "",
          }),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, `Failed to create ${sessionType}`));
      }
      const createdSessionId = typeof payload === "object" && payload !== null && "id" in payload && typeof payload.id === "string"
        ? payload.id
        : null;
      if (!createdSessionId || ("eventId" in (payload as Record<string, unknown>) && payload.eventId !== selectedEventId)) {
        throw new Error("The server did not confirm the created session for this event");
      }

      setPendingCreatedSession({ id: createdSessionId, sessionType });
      const refreshedSnapshot = await loadSnapshot(selectedEventId);
      if (!refreshedSnapshot) {
        throw new Error(`Session was saved, but ${terminology.runOfShow} could not be refreshed. Retry refresh before creating another session.`);
      }
      setSelectedSessionId(createdSessionId);
      setPendingCreatedSession(null);
      setIsAddSessionOpen(false);
      setFlashMessage(`${sessionType} scheduled`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session";
      setAddSessionError(message);
      setErrorMessage(message);
    } finally {
      setIsMutating(false);
    }
  }, [
    addSessionDate,
    addSessionEndTime,
    addSessionIncludeInOfficialAgenda,
    addSessionRoomId,
    addSessionStartTime,
    addSessionType,
    loadSnapshot,
    selectedDate,
    selectedEventId,
    snapshot,
    terminology.runOfShow,
  ]);

  const retryCreatedSessionRefresh = useCallback(async (): Promise<void> => {
    if (!selectedEventId || !pendingCreatedSession) return;
    setIsMutating(true);
    setAddSessionError(null);
    const refreshedSnapshot = await loadSnapshot(selectedEventId);
    if (!refreshedSnapshot) {
      setAddSessionError(`Session was saved, but ${terminology.runOfShow} could not be refreshed. Retry refresh before creating another session.`);
      setIsMutating(false);
      return;
    }
    setSelectedSessionId(pendingCreatedSession.id);
    setPendingCreatedSession(null);
    setIsAddSessionOpen(false);
    setFlashMessage(`${pendingCreatedSession.sessionType} scheduled`);
    setIsMutating(false);
  }, [loadSnapshot, pendingCreatedSession, selectedEventId, terminology.runOfShow]);

  const handleOverviewSort = useCallback((key: MatrixOverviewSortKey): void => {
    setOverviewSort((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const createSessionFromTemplate = useCallback(
    async (input: {
      template: Matrix2Template;
      date: string;
      roomId: string | null;
      startMinutes: number;
      source: "drop" | "quick-add";
    }): Promise<void> => {
      if (!selectedEventId || !snapshot) return;

      const room = input.roomId ? snapshot.rooms.find((entry) => entry.id === input.roomId) ?? null : null;
      if (input.source === "drop" && !room) {
        setErrorMessage("Invalid room target for template drop.");
        return;
      }

      const hasValidStartMinutes = Number.isInteger(input.startMinutes) && input.startMinutes >= 0;
      if (!hasValidStartMinutes) {
        setErrorMessage("Invalid time target for template drop.");
        return;
      }
      if (input.source === "drop" && input.startMinutes % DROP_SLOT_MINUTES !== 0) {
        setErrorMessage("Drop target time is not aligned to the board grid.");
        return;
      }

      const startMinutes = input.startMinutes;
      const endMinutes = startMinutes + input.template.durationMinutes;
      if (endMinutes <= startMinutes || endMinutes > MAX_TIME_MINUTES) {
        setErrorMessage("Session duration exceeds the visible day bounds.");
        return;
      }

      setIsMutating(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/events/${selectedEventId}/matrix-rows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: input.date,
            startTime: minutesToTime(startMinutes),
            endTime: minutesToTime(endMinutes),
            roomId: room?.id ?? null,
            room: room?.name ?? "",
            sessionName: input.template.label,
            setup: "",
            attendance: null,
            meal: "",
            avNeeds: "",
            notes: buildEncodedNotes({
              sessionType: input.template.sessionType,
              speakers: [],
              staffAssigned: [],
              foodAndBeverage: [],
              notes: "",
            }),
          }),
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(toErrorMessage(payload, "Failed to create session from template"));
        }

        const createdRowId =
          typeof payload === "object" && payload !== null && "id" in payload && typeof payload.id === "string"
            ? payload.id
            : "";

        const nextSnapshot = await loadSnapshot(selectedEventId);

        if (createdRowId) {
          setSelectedSessionId(createdRowId);
        } else if (nextSnapshot) {
          const expectedRoomName = room?.name ?? "Unassigned";
          const fallback = [...nextSnapshot.sessions]
            .filter((session) => session.title === input.template.label && session.roomName === expectedRoomName && session.date === input.date)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
          setSelectedSessionId(fallback?.id ?? null);
        }

        if (input.source === "drop") {
          setFlashMessage(`Placed ${input.template.label} in ${room?.name ?? "Unassigned"} at ${minutesToTime(startMinutes)}`);
        } else {
          setFlashMessage(`${input.template.label} scheduled${room ? ` in ${room.name}` : " without a room"}`);
        }
      } catch (error) {
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : "Failed to schedule template");
      } finally {
        setIsMutating(false);
      }
    },
    [loadSnapshot, selectedEventId, snapshot],
  );

  const handleSaveSessionEdit = useCallback(
    async (
      sessionId: string,
      payload: {
        title: string;
        includeInOfficialAgenda: boolean;
        sessionType: string;
        status: string;
        roomId: string | null;
        startTime: string;
        endTime: string;
        expectedAttendance: number | null;
        roomSetupType: string;
        speakers: Array<{
          speakerId?: string;
          name: string;
          title?: string | null;
          company?: string | null;
          email?: string | null;
        }>;
        requirementSelections: Array<{
          itemId: string;
          quantity: number | null;
        }>;
        avRequirements: Array<{ avType: string; quantity: number | null }>;
        foodService: { serviceType: string; serviceStyle: string | null; headcount: number | null } | null;
        foodAndBeverage?: string[];
        staffAssignments: Array<{
          personId?: string;
          name: string;
          role?: Matrix2Person["role"] | null;
          company?: string | null;
          email?: string | null;
          assignmentRole?: string | null;
        }>;
        notes: string;
      },
    ): Promise<void> => {
      if (!selectedEventId || !snapshot) return;

      const exists = snapshot.sessions.some((entry) => entry.id === sessionId);
      if (!exists) return;

      setIsMutating(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/events/${selectedEventId}/matrix-2/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const responseBody = await response.json();
        if (!response.ok) {
          throw new Error(toErrorMessage(responseBody, "Failed to save session changes"));
        }

      const roomName = payload.roomId
        ? snapshot.rooms.find((room) => room.id === payload.roomId)?.name ?? "Unassigned"
        : "Unassigned";
      setSnapshot((current) => current
        ? {
            ...current,
            sessions: current.sessions.map((entry) => entry.id === sessionId
              ? {
                  ...entry,
                  title: payload.title,
                  includeInOfficialAgenda: payload.includeInOfficialAgenda,
                  sessionType: payload.sessionType,
                  status: payload.status,
                  roomId: payload.roomId,
                  roomName,
                  startTime: payload.startTime,
                  endTime: payload.endTime,
                  expectedAttendance: payload.expectedAttendance,
                  roomSetup: payload.roomSetupType,
                  speakers: payload.speakers.map((speaker) => speaker.name),
                  speakerAssignments: payload.speakers.map((speaker) => ({
                    speakerId: speaker.speakerId ?? speaker.name,
                    name: speaker.name,
                    title: speaker.title ?? null,
                    company: speaker.company ?? null,
                    email: speaker.email ?? null,
                    status: "NEEDS_INFO" as const,
                  })),
                  avRequirements: payload.avRequirements.map((entry) =>
                    entry.quantity === null ? entry.avType : `${entry.avType} (${entry.quantity})`,
                  ),
                  avRequirementsStructured: payload.avRequirements.map((entry, index) => ({
                    id: `${sessionId}:av:${index}:${entry.avType}`,
                    avType: entry.avType,
                    quantity: entry.quantity,
                  })),
                  requirementSelections: payload.requirementSelections.map((selection) => ({
                    ...selection,
                    linkedBudgetLineItem: null,
                  })),
                  foodAndBeverage: payload.foodAndBeverage ?? [],
                  foodService: payload.foodService
                    ? { id: `${sessionId}:food-service`, ...payload.foodService }
                    : null,
                  staffAssigned: payload.staffAssignments.map((staff) => staff.assignmentRole ? `${staff.name} (${staff.assignmentRole})` : staff.name),
                  staffAssignments: payload.staffAssignments.map((staff) => ({
                    personId: staff.personId ?? staff.name,
                    name: staff.name,
                    role: staff.role ?? "staff",
                    company: staff.company ?? null,
                    email: staff.email ?? null,
                    assignmentRole: staff.assignmentRole ?? null,
                  })),
                  notes: payload.notes,
                }
              : entry),
          }
        : current);
      setSelectedSessionId(sessionId);
      setFlashMessage("Session updated");
      } catch (error) {
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : "Failed to save session changes");
      } finally {
        setIsMutating(false);
      }
    },
    [selectedEventId, snapshot],
  );

  const handleSaveOverviewSession = useCallback(async (session: Matrix2Session, draft: MatrixOverviewDraft): Promise<void> => {
    if (!selectedEventId || !snapshot) return;

    const expectedAttendance = parseOverviewAttendance(draft.attendanceText);
    const avRequirementItemIds = new Set(avRequirementItems.map((item) => item.id));
    const setupRequirementItemIds = new Set(setupRequirementItems.map((item) => item.id));
    const avRequirementPayload = buildOverviewAvRequirementPayload(
      session,
      draft.avRequirementValues,
      avRequirementItems,
      avRequirementItemIds,
      draft.roomSetupType,
      setupRequirementItems,
      setupRequirementItemIds,
    );
    const staffingRequirementItemIds = new Set(staffingRequirementItems.map((item) => item.id));
    const staffingRequirementItemsById = new Map(staffingRequirementItems.map((item) => [item.id, item]));
    const requirementSelections = [
      ...avRequirementPayload.requirementSelections.filter((selection) => !staffingRequirementItemIds.has(selection.itemId)),
      ...Object.entries(draft.staffingRequirementValues).map(([itemId, quantityText]) => {
        const item = staffingRequirementItemsById.get(itemId);
        if (!item) throw new Error("A selected staffing requirement is no longer available.");
        return {
          itemId,
          quantity: item.hasQuantity ? parseOverviewRequirementQuantity(item.label, quantityText) : null,
        };
      }),
    ];

    setIsMutating(true);
    setErrorMessage(null);

    try {
      const selectedSpeakers = draft.speakerIds.map((speakerId) => {
        const speaker = draft.speakerOptions.find((option) => option.id === speakerId);
        if (!speaker) throw new Error("A selected speaker is no longer available for this event.");
        return speaker;
      });
      const eventPeopleById = new Map(snapshot.people.map((person) => [person.id, person]));
      const existingStaffById = new Map(session.staffAssignments.map((staff) => [staff.personId, staff]));
      const selectedStaff = draft.staffPersonIds.map((personId) => {
        const person = eventPeopleById.get(personId);
        const existing = existingStaffById.get(personId);
        if (!person && !existing) throw new Error("A selected staff member is no longer available for this event.");
        return {
          personId,
          name: person?.name ?? existing?.name ?? "Event staff",
          role: person?.role ?? existing?.role ?? "staff" as const,
          company: person?.company ?? existing?.company ?? null,
          email: person?.email ?? existing?.email ?? null,
          assignmentRole: existing?.assignmentRole ?? null,
        };
      });

      let fnbItems = session.foodAndBeverage;
      if (draft.fnbTouched) {
        if (!draft.fnbAssignmentsLoaded) throw new Error("F&B assignments are still loading. Try Save again.");
        const assignmentsResponse = await fetch(`/api/events/${selectedEventId}/matrix-2/sessions/${session.id}/fnb-catalog-assignments`, { cache: "no-store" });
        const assignmentsPayload = await assignmentsResponse.json().catch(() => null);
        if (!assignmentsResponse.ok) throw new Error(toErrorMessage(assignmentsPayload, "Failed to verify F&B assignments"));
        const currentAssignments = Array.isArray(assignmentsPayload) ? assignmentsPayload as MatrixOverviewFnbAssignment[] : [];
        const selectedFnbIds = new Set(draft.fnbCatalogItemIds);
        const currentFnbIds = new Set(currentAssignments.map((assignment) => assignment.eventFnbCatalogItemId));

        for (const assignment of currentAssignments) {
          if (selectedFnbIds.has(assignment.eventFnbCatalogItemId)) continue;
          const response = await fetch(`/api/events/${selectedEventId}/matrix-2/sessions/${session.id}/fnb-catalog-assignments/${assignment.id}`, { method: "DELETE" });
          const body = await response.json().catch(() => null);
          if (!response.ok) throw new Error(toErrorMessage(body, "Failed to remove F&B assignment"));
        }
        for (const itemId of draft.fnbCatalogItemIds) {
          if (currentFnbIds.has(itemId)) continue;
          const response = await fetch(`/api/events/${selectedEventId}/matrix-2/sessions/${session.id}/fnb-catalog-assignments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventFnbCatalogItemId: itemId }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) throw new Error(toErrorMessage(body, "Failed to add F&B assignment"));
        }
        fnbItems = draft.fnbCatalogItemIds.map((itemId) => {
          const item = draft.fnbCatalogItems.find((entry) => entry.id === itemId);
          if (!item) throw new Error("A selected F&B catalog item is no longer available.");
          return item.itemName;
        });
      }

      const nextStatus = canonicalSessionStatusValue(
        draft.status,
        sessionStatusOptionsFromTemplate(snapshot.requirementTemplate),
      ) ?? undefined;
      const payload = {
        title: draft.title.trim() || "Untitled Session",
        sessionType: draft.sessionType.trim() || DEFAULT_SESSION_TYPE,
        // Status is an optional partial-update field. An unclassified imported
        // session must not turn an unrelated inline edit into an invalid write.
        status: nextStatus,
        roomId: draft.roomId.trim() || null,
        startTime: draft.startTime,
        endTime: draft.endTime,
        expectedAttendance,
        roomSetupType: draft.roomSetupType.trim(),
        speakers: selectedSpeakers.map((speaker) => ({
          speakerId: speaker.id,
          name: speaker.name,
          title: speaker.title,
          company: speaker.company,
          email: speaker.email,
        })),
        requirementSelections,
        avRequirements: avRequirementPayload.avRequirements,
        foodService: session.foodService
          ? {
              serviceType: session.foodService.serviceType,
              serviceStyle: session.foodService.serviceStyle,
              headcount: session.foodService.headcount,
            }
          : null,
        foodAndBeverage: fnbItems,
        staffAssignments: selectedStaff,
        notes: draft.notes,
      };

      const response = await fetch(`/api/events/${selectedEventId}/matrix-2/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseBody = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(responseBody, "Failed to save session changes"));
      }

      const nextRoom = payload.roomId
        ? snapshot.rooms.find((room) => room.id === payload.roomId) ?? null
        : null;
      setSnapshot((current) => current
        ? {
            ...current,
            sessions: current.sessions.map((entry) => entry.id === session.id
              ? {
                  ...entry,
                  title: payload.title,
                  sessionType: payload.sessionType,
                  status: payload.status ?? entry.status,
                  roomId: nextRoom?.id ?? null,
                  roomName: nextRoom?.name ?? "Unassigned",
                  startTime: payload.startTime,
                  endTime: payload.endTime,
                  expectedAttendance: payload.expectedAttendance,
                  roomSetup: payload.roomSetupType,
                  speakers: selectedSpeakers.map((speaker) => speaker.name),
                  speakerAssignments: selectedSpeakers.map((speaker) => ({
                    speakerId: speaker.id,
                    name: speaker.name,
                    title: speaker.title,
                    company: speaker.company,
                    email: speaker.email,
                    status: speaker.status,
                  })),
                  avRequirements: payload.avRequirements.map((entry) =>
                    entry.quantity === null ? entry.avType : `${entry.avType} (${entry.quantity})`,
                  ),
                  avRequirementsStructured: payload.avRequirements.map((entry, index) => ({
                    id: `${session.id}:av:${index}:${entry.avType}`,
                    avType: entry.avType,
                    quantity: entry.quantity,
                  })),
                  requirementSelections: payload.requirementSelections.map((selection) => ({
                    ...selection,
                    linkedBudgetLineItem: null,
                  })),
                  foodAndBeverage: fnbItems,
                  foodService: payload.foodService
                    ? { id: `${session.id}:food-service`, ...payload.foodService }
                    : null,
                  staffAssigned: selectedStaff.map((staff) => staff.assignmentRole ? `${staff.name} (${staff.assignmentRole})` : staff.name),
                  staffAssignments: selectedStaff,
                  notes: payload.notes,
                }
              : entry),
          }
        : current);
      setSelectedSessionId(session.id);
      setFlashMessage("Session updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save session changes";
      setErrorMessage(message);
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  }, [avRequirementItems, selectedEventId, setupRequirementItems, snapshot, staffingRequirementItems]);

  const handleBulkUpdateOverviewSessions = useCallback(async (sessionIds: string[], patch: MatrixOverviewBulkPatch): Promise<void> => {
    if (!selectedEventId || !snapshot || sessionIds.length === 0) return;

    const selectedIds = new Set(sessionIds);
    const selectedSessions = snapshot.sessions.filter((session) => selectedIds.has(session.id));
    if (selectedSessions.length === 0) return;
    const avRequirementItemIds = new Set(avRequirementItems.map((item) => item.id));
    const avRequirementItemsById = new Map(avRequirementItems.map((item) => [item.id, item]));
    const setupRequirementItemIds = new Set(setupRequirementItems.map((item) => item.id));

    setIsMutating(true);
    setErrorMessage(null);

    try {
      for (const session of selectedSessions) {
        const requestBody = (() => {
          if (patch.addAvRequirementItemId) {
            const item = avRequirementItemsById.get(patch.addAvRequirementItemId);
            if (!item) {
              throw new Error("Selected AV requirement is not available.");
            }
            const currentAvRequirementValues = avRequirementValuesFromSession(session, avRequirementItemIds);
            return buildOverviewAvRequirementPayload(
              session,
              Object.prototype.hasOwnProperty.call(currentAvRequirementValues, item.id)
                ? currentAvRequirementValues
                : { ...currentAvRequirementValues, [item.id]: "" },
              avRequirementItems,
              avRequirementItemIds,
              session.roomSetup,
              setupRequirementItems,
              setupRequirementItemIds,
            );
          }

          if (typeof patch.roomSetupType !== "undefined") {
            return {
              ...buildOverviewAvRequirementPayload(
                session,
                avRequirementValuesFromSession(session, avRequirementItemIds),
                avRequirementItems,
                avRequirementItemIds,
                patch.roomSetupType,
                setupRequirementItems,
                setupRequirementItemIds,
              ),
              roomSetupType: patch.roomSetupType,
            };
          }

          return patch;
        })();
        const response = await fetch(`/api/events/${selectedEventId}/matrix-2/sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const responseBody = await response.json();
        if (!response.ok) {
          throw new Error(toErrorMessage(responseBody, `Failed to update ${session.title}`));
        }
      }

      const roomById = new Map(snapshot.rooms.map((room) => [room.id, room]));
      const selectedIdSet = new Set(selectedSessions.map((session) => session.id));
      setSnapshot((current) => current
        ? {
            ...current,
            sessions: current.sessions.map((session) => {
              if (!selectedIdSet.has(session.id)) return session;
              const nextRoomId = typeof patch.roomId !== "undefined" ? patch.roomId : session.roomId;
              const nextRoom = nextRoomId ? roomById.get(nextRoomId) ?? null : null;
              const addedAvItem = patch.addAvRequirementItemId ? avRequirementItemsById.get(patch.addAvRequirementItemId) ?? null : null;
              const hasAddedAvSelection = addedAvItem
                ? session.requirementSelections.some((entry) => entry.itemId === addedAvItem.id)
                : false;
              const nextAvStructured = addedAvItem && !hasAddedAvSelection
                ? [
                    ...session.avRequirementsStructured,
                    {
                      id: addedAvItem.id,
                      avType: addedAvItem.label,
                      quantity: null,
                    },
                  ]
                : session.avRequirementsStructured;
              const nextRequirementSelections = addedAvItem && !hasAddedAvSelection
                ? [
                    ...session.requirementSelections,
                    { itemId: addedAvItem.id, quantity: null, linkedBudgetLineItem: null },
                  ]
                : session.requirementSelections;
              return {
                ...session,
                ...(typeof patch.sessionType !== "undefined" ? { sessionType: patch.sessionType } : {}),
                ...(typeof patch.status !== "undefined" ? { status: patch.status } : {}),
                ...(typeof patch.roomId !== "undefined" ? { roomId: nextRoom?.id ?? null, roomName: nextRoom?.name ?? "Unassigned" } : {}),
                ...(typeof patch.roomSetupType !== "undefined" ? { roomSetup: patch.roomSetupType } : {}),
                ...(typeof patch.expectedAttendance !== "undefined" ? { expectedAttendance: patch.expectedAttendance } : {}),
                avRequirementsStructured: nextAvStructured,
                avRequirements: nextAvStructured.map((entry) =>
                  entry.quantity === null ? entry.avType : `${entry.avType} (${entry.quantity})`,
                ),
                requirementSelections: nextRequirementSelections,
              };
            }),
          }
        : current);
      setFlashMessage(`Updated ${selectedSessions.length} session${selectedSessions.length === 1 ? "" : "s"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update selected sessions";
      setErrorMessage(message);
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  }, [avRequirementItems, selectedEventId, setupRequirementItems, snapshot]);

  const handleBulkDeleteOverviewSessions = useCallback(async (sessionIds: string[]): Promise<void> => {
    if (!selectedEventId || !snapshot || sessionIds.length === 0) return;

    const selectedIds = new Set(sessionIds);
    const selectedSessions = snapshot.sessions.filter((session) => selectedIds.has(session.id));
    if (selectedSessions.length === 0) return;

    setIsMutating(true);
    setErrorMessage(null);

    try {
      for (const session of selectedSessions) {
        const response = await fetch(`/api/events/${selectedEventId}/matrix-rows/${session.rowId}`, {
          method: "DELETE",
        });
        const responseBody = await response.json();
        if (!response.ok) {
          throw new Error(toErrorMessage(responseBody, `Failed to delete ${session.title}`));
        }
      }

      await loadSnapshot(selectedEventId);
      setSelectedOverviewSessionIds((current) => {
        const next = new Set(current);
        for (const session of selectedSessions) next.delete(session.id);
        return next;
      });
      if (selectedSessionId && selectedIds.has(selectedSessionId)) {
        setSelectedSessionId(null);
      }
      setFlashMessage(`Archived ${selectedSessions.length} session${selectedSessions.length === 1 ? "" : "s"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to archive selected sessions";
      setErrorMessage(message);
      throw new Error(message);
    } finally {
      setIsMutating(false);
    }
  }, [loadSnapshot, selectedEventId, selectedSessionId, snapshot]);

  const handleDuplicateOverviewSession = useCallback(async (sessionId: string): Promise<void> => {
    if (!selectedEventId || !snapshot || isMutating) return;

    const session = snapshot.sessions.find((entry) => entry.id === sessionId);
    if (!session) return;

    setIsMutating(true);
    setErrorMessage(null);
    setFlashErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${selectedEventId}/matrix-rows/${session.rowId}/duplicate`, {
        method: "POST",
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toErrorMessage(responseBody, `Failed to duplicate ${session.title}`));
      }

      await loadSnapshot(selectedEventId);
      setFlashMessage(`Duplicated "${session.title}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to duplicate session";
      setErrorMessage(message);
      setFlashErrorMessage(message);
    } finally {
      setIsMutating(false);
    }
  }, [isMutating, loadSnapshot, selectedEventId, snapshot]);

  const handleDeleteBoardSession = useCallback(async (sessionId: string): Promise<void> => {
    if (!selectedEventId || !snapshot) return;

    const session = snapshot.sessions.find((entry) => entry.id === sessionId);
    if (!session) return;

    const confirmed = window.confirm([
      "Archive session?",
      `${session.title} · ${matrixSessionTimeLabel(session)}`,
      `This session will be removed from the active ${terminology.runOfShow}.`,
    ].join("\n\n"));
    if (!confirmed) return;

    setIsMutating(true);
    setErrorMessage(null);
    setFlashErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${selectedEventId}/matrix-rows/${session.rowId}`, {
        method: "DELETE",
      });
      const responseBody = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(responseBody, `Failed to archive ${session.title}`));
      }

      setSnapshot((current) => current
        ? {
            ...current,
            sessions: current.sessions.filter((entry) => entry.id !== session.id),
          }
        : current);
      setSelectedOverviewSessionIds((current) => {
        if (!current.has(session.id)) return current;
        const next = new Set(current);
        next.delete(session.id);
        return next;
      });
      if (selectedSessionId === session.id) {
        setSelectedSessionId(null);
      }
      await loadSnapshot(selectedEventId);
      setFlashMessage("Archived 1 session");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to archive session";
      setErrorMessage(message);
      setFlashErrorMessage(message);
    } finally {
      setIsMutating(false);
    }
  }, [loadSnapshot, selectedEventId, selectedSessionId, snapshot, terminology.runOfShow]);

  const handleAssignSpeakerAssignment = useCallback(async (sessionId: string, speaker: Matrix2EventSpeakerRecord): Promise<void> => {
    if (!selectedEventId) return;

    const response = await fetch(`/api/events/${selectedEventId}/matrix-2/sessions/${sessionId}/speakers/${speaker.id}`, {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(toErrorMessage(payload, "Failed to assign speaker"));
    }

    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        sessions: current.sessions.map((session) => {
          if (session.id !== sessionId || session.speakerAssignments.some((entry) => entry.speakerId === speaker.id)) {
            return session;
          }
          const nextAssignment = {
            speakerId: speaker.id,
            name: speaker.name,
            title: speaker.title,
            company: speaker.company,
            email: speaker.email,
            status: speaker.status,
          };
          return {
            ...session,
            speakerAssignments: [...session.speakerAssignments, nextAssignment],
            speakers: [...session.speakers, speaker.name].filter(Boolean),
          };
        }),
      };
    });
  }, [selectedEventId]);

  const handleRemoveSpeakerAssignment = useCallback(async (sessionId: string, speakerId: string): Promise<void> => {
    if (!selectedEventId) return;

    const response = await fetch(`/api/events/${selectedEventId}/matrix-2/sessions/${sessionId}/speakers/${speakerId}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(toErrorMessage(payload, "Failed to remove speaker"));
    }

    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        sessions: current.sessions.map((session) => {
          if (session.id !== sessionId) return session;
          const nextAssignments = session.speakerAssignments.filter((entry) => entry.speakerId !== speakerId);
          return {
            ...session,
            speakerAssignments: nextAssignments,
            speakers: nextAssignments.map((entry) => entry.name),
          };
        }),
      };
    });
  }, [selectedEventId]);

  const clearActiveDragState = useCallback((): void => {
    setActiveDragTemplate(null);
    setActiveDragSessionId(null);
  }, []);

  const clearTrailingDraggedClickReset = useCallback((): void => {
    if (trailingDragClickResetTimerRef.current !== null) {
      window.clearTimeout(trailingDragClickResetTimerRef.current);
      trailingDragClickResetTimerRef.current = null;
    }
  }, []);

  const scheduleTrailingDraggedClickReset = useCallback((): void => {
    clearTrailingDraggedClickReset();
    // Keep this synchronous one-shot guard through the browser's trailing click.
    // Some DnD backends dispatch that click after drag-end has yielded.
    trailingDragClickResetTimerRef.current = window.setTimeout(() => {
      trailingDragClickResetTimerRef.current = null;
      sessionDragClickStateRef.current.clear();
    }, 250);
  }, [clearTrailingDraggedClickReset]);

  useEffect(() => {
    return () => {
      clearTrailingDraggedClickReset();
    };
  }, [clearTrailingDraggedClickReset]);

  const resolveMoveTarget = useCallback((value: unknown): SessionMoveTarget | null => {
    if (!value || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    if (entry.type === "matrix2-slot-drop") {
      const startMinutes = Number(entry.startMinutes);
      if (
        typeof entry.roomId !== "string" ||
        !entry.roomId.trim() ||
        typeof entry.roomName !== "string" ||
        !entry.roomName.trim() ||
        !Number.isInteger(startMinutes)
      ) {
        return null;
      }
      return {
        roomId: entry.roomId,
        roomName: entry.roomName,
        startMinutes,
      };
    }

    if (entry.type === "matrix2-session-drop") {
      const startMinutes = Number(entry.startMinutes);
      if (
        typeof entry.roomId !== "string" ||
        !entry.roomId.trim() ||
        typeof entry.roomName !== "string" ||
        !entry.roomName.trim() ||
        typeof entry.sessionId !== "string" ||
        !entry.sessionId.trim() ||
        !Number.isInteger(startMinutes)
      ) {
        return null;
      }
      return {
        roomId: entry.roomId,
        roomName: entry.roomName,
        startMinutes,
        anchorSessionId: entry.sessionId,
      };
    }

    return null;
  }, []);

  const handleTemplateDrop = useCallback(async (input: {
    template: Matrix2Template | undefined;
    target: SessionMoveTarget | null;
  }): Promise<void> => {
    const target = input.target;
    if (!input.template || !snapshot || !selectedEventId) {
      return;
    }

    if (
      !target ||
      typeof target.roomId !== "string" ||
      target.roomId.trim().length === 0 ||
      !Number.isInteger(target.startMinutes)
    ) {
      setErrorMessage("Drop template onto a highlighted room/time cell.");
      return;
    }
    if (!snapshot.rooms.some((room) => room.id === target.roomId)) {
      setErrorMessage("Drop target room is no longer available.");
      return;
    }
    if (target.startMinutes < 0 || target.startMinutes > MAX_TIME_MINUTES) {
      setErrorMessage("Drop target time is invalid.");
      return;
    }

    const date = selectedDate || snapshot.event.startDate;
    await createSessionFromTemplate({
      template: input.template,
      date,
      roomId: target.roomId,
      startMinutes: target.startMinutes,
      source: "drop",
    });
  }, [createSessionFromTemplate, selectedDate, selectedEventId, snapshot]);

  const handleSessionMoveDrop = useCallback(async (input: {
    sessionId: string | null;
    target: SessionMoveTarget | null;
  }): Promise<void> => {
    if (!selectedEventId || !snapshot) return;
    const sessionId = input.sessionId;
    const target = input.target;

    if (!sessionId) return;
    if (!target || !Number.isInteger(target.startMinutes) || !target.roomId.trim()) {
      setErrorMessage("Drop session onto a highlighted room/time cell.");
      return;
    }

    const movingSession = snapshot.sessions.find((entry) => entry.id === sessionId);
    if (!movingSession) return;

    const targetRoom = snapshot.rooms.find((room) => room.id === target.roomId);
    if (!targetRoom) {
      setErrorMessage("Drop target room is no longer available.");
      return;
    }

    const sourceStartMinutes = toMinutes(movingSession.startTime);
    const sourceEndMinutes = toMinutes(movingSession.endTime);
    if (sourceStartMinutes === null || sourceEndMinutes === null || sourceEndMinutes <= sourceStartMinutes) {
      setErrorMessage("Session has invalid time range.");
      return;
    }

    if (target.startMinutes < 0 || target.startMinutes > MAX_TIME_MINUTES) {
      setErrorMessage("Drop target time is invalid.");
      return;
    }

    const durationMinutes = sourceEndMinutes - sourceStartMinutes;
    const nextStartMinutes = target.startMinutes;
    const nextEndMinutes = nextStartMinutes + durationMinutes;
    if (nextEndMinutes > MAX_TIME_MINUTES) {
      setErrorMessage("Session duration exceeds the visible day bounds.");
      return;
    }

    const nextStartTime = minutesToTime(nextStartMinutes);
    const nextEndTime = minutesToTime(nextEndMinutes);

    if (
      target.anchorSessionId === movingSession.id &&
      movingSession.roomId === targetRoom.id &&
      movingSession.startTime === nextStartTime &&
      movingSession.endTime === nextEndTime
    ) {
      return;
    }

    const sessionsInTargetSlot = snapshot.sessions
      .filter((entry) => (
        entry.id !== movingSession.id &&
        entry.date === movingSession.date &&
        entry.roomId === targetRoom.id &&
        entry.startTime === nextStartTime
      ))
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
        return left.createdAt.localeCompare(right.createdAt);
      });

    let insertionIndex = sessionsInTargetSlot.length;
    if (target.anchorSessionId) {
      const anchorIndex = sessionsInTargetSlot.findIndex((entry) => entry.id === target.anchorSessionId);
      if (anchorIndex >= 0) {
        insertionIndex = anchorIndex;
      }
    }

    const reorderedTargetSessions = [...sessionsInTargetSlot];
    reorderedTargetSessions.splice(insertionIndex, 0, {
      ...movingSession,
      roomId: targetRoom.id,
      roomName: targetRoom.name,
      startTime: nextStartTime,
      endTime: nextEndTime,
    });

    const slotSortUpdates = new Map<string, number>();
    reorderedTargetSessions.forEach((entry, index) => {
      slotSortUpdates.set(entry.id, index + 1);
    });

    const previousSnapshot = snapshot;
    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        sessions: current.sessions.map((entry) => {
          if (entry.id === movingSession.id) {
            return {
              ...entry,
              roomId: targetRoom.id,
              roomName: targetRoom.name,
              startTime: nextStartTime,
              endTime: nextEndTime,
              sortOrder: slotSortUpdates.get(entry.id) ?? entry.sortOrder,
            };
          }

          const nextSort = slotSortUpdates.get(entry.id);
          if (typeof nextSort === "number") {
            return {
              ...entry,
              sortOrder: nextSort,
            };
          }

          return entry;
        }),
      };
    });

    setSelectedSessionId(movingSession.id);
    setIsMutating(true);
    setErrorMessage(null);

    try {
      const updateRequests: Array<{ session: Matrix2Session; sortOrder?: number }> = [];
      updateRequests.push({
        session: movingSession,
        sortOrder: slotSortUpdates.get(movingSession.id),
      });
      for (const entry of sessionsInTargetSlot) {
        const nextSortOrder = slotSortUpdates.get(entry.id);
        if (typeof nextSortOrder !== "number" || nextSortOrder === entry.sortOrder) continue;
        updateRequests.push({ session: entry, sortOrder: nextSortOrder });
      }

      for (const request of updateRequests) {
        const isMovedSession = request.session.id === movingSession.id;
        const response = await fetch(`/api/events/${selectedEventId}/matrix-rows/${request.session.rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isMovedSession
              ? {
                  roomId: targetRoom.id,
                  room: targetRoom.name,
                  startTime: nextStartTime,
                  endTime: nextEndTime,
                }
              : {}),
            ...(typeof request.sortOrder === "number" ? { sortOrder: request.sortOrder } : {}),
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(toErrorMessage(payload, "Failed to move session"));
        }
      }

      setFlashMessage(`Moved "${movingSession.title}" to ${targetRoom.name} at ${nextStartTime}`);
    } catch (error) {
      console.error(error);
      setSnapshot(previousSnapshot);
      const nextError = error instanceof Error ? error.message : "Failed to move session";
      setErrorMessage(nextError);
      setFlashErrorMessage(nextError);
      void loadSnapshot(selectedEventId);
    } finally {
      setIsMutating(false);
    }
  }, [loadSnapshot, selectedEventId, snapshot]);

  const handleDragStart = useCallback((event: DragStartEvent): void => {
    const dragData = event.active.data.current;
    if (!dragData) return;

    if (dragData.type === "matrix2-template") {
      const template = dragData.template;
      if (template) {
        setActiveDragTemplate(template as Matrix2Template);
      }
      return;
    }

    if (dragData.type === "matrix2-session" && typeof dragData.sessionId === "string") {
      sessionDragClickStateRef.current.markDragStarted();
      setActiveDragSessionId(dragData.sessionId);
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent): Promise<void> => {
    const dragData = event.active.data.current;
    const target = resolveMoveTarget(event.over?.data.current);

    try {
      if (dragData?.type === "matrix2-template") {
        const template = dragData.template as Matrix2Template | undefined;
        await handleTemplateDrop({
          template,
          target,
        });
        return;
      }

      if (dragData?.type === "matrix2-session") {
        scheduleTrailingDraggedClickReset();
        const sessionId = typeof dragData.sessionId === "string" ? dragData.sessionId : null;
        await handleSessionMoveDrop({
          sessionId,
          target,
        });
      }
    } finally {
      // Hard cleanup for drag end lifecycle.
      clearActiveDragState();
    }
  }, [clearActiveDragState, handleSessionMoveDrop, handleTemplateDrop, resolveMoveTarget, scheduleTrailingDraggedClickReset]);

  const handleDragCancel = useCallback((): void => {
    if (activeDragSessionId) {
      scheduleTrailingDraggedClickReset();
    }
    clearActiveDragState();
  }, [activeDragSessionId, clearActiveDragState, scheduleTrailingDraggedClickReset]);

  const consumeSessionDragClick = useCallback((): boolean => {
    return sessionDragClickStateRef.current.consumeDraggedClick();
  }, []);

  async function handleCreateRoom(): Promise<void> {
    if (!selectedEventId) return;

    const normalizedName = newRoomName.trim();
    if (!normalizedName) {
      setRoomFormError("Room name is required");
      return;
    }

    let parsedCapacity: number | null = null;
    if (newRoomCapacity.trim()) {
      const candidate = Number(newRoomCapacity.trim());
      if (!Number.isInteger(candidate) || candidate <= 0) {
        setRoomFormError("Capacity must be a positive whole number");
        return;
      }
      parsedCapacity = candidate;
    }

    setIsCreatingRoom(true);
    setRoomFormError(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${selectedEventId}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          capacity: parsedCapacity,
          notes: newRoomNotes.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to create room"));
      }
      const createdRoomId = typeof payload === "object" && payload !== null && "id" in payload && typeof payload.id === "string"
        ? payload.id
        : null;
      if (!createdRoomId || ("eventId" in (payload as Record<string, unknown>) && payload.eventId !== selectedEventId)) {
        throw new Error("The server did not confirm the created room for this event");
      }

      setPendingCreatedRoomName(normalizedName);
      const refreshedSnapshot = await loadSnapshot(selectedEventId);
      if (!refreshedSnapshot) {
        throw new Error(`Room was saved, but ${terminology.runOfShow} could not be refreshed. Retry refresh before creating another room.`);
      }
      setPendingCreatedRoomName(null);
      setIsAddRoomOpen(false);
      setNewRoomName("");
      setNewRoomCapacity("");
      setNewRoomNotes("");
      setFlashMessage(`Room \"${normalizedName}\" added`);
    } catch (error) {
      setRoomFormError(error instanceof Error ? error.message : "Failed to create room");
    } finally {
      setIsCreatingRoom(false);
    }
  }

  const retryCreatedRoomRefresh = useCallback(async (): Promise<void> => {
    if (!selectedEventId || !pendingCreatedRoomName) return;
    setIsCreatingRoom(true);
    setRoomFormError(null);
    const refreshedSnapshot = await loadSnapshot(selectedEventId);
    if (!refreshedSnapshot) {
      setRoomFormError(`Room was saved, but ${terminology.runOfShow} could not be refreshed. Retry refresh before creating another room.`);
      setIsCreatingRoom(false);
      return;
    }
    const createdRoomName = pendingCreatedRoomName;
    setPendingCreatedRoomName(null);
    setIsAddRoomOpen(false);
    setNewRoomName("");
    setNewRoomCapacity("");
    setNewRoomNotes("");
    setFlashMessage(`Room \"${createdRoomName}\" added`);
    setIsCreatingRoom(false);
  }, [loadSnapshot, pendingCreatedRoomName, selectedEventId, terminology.runOfShow]);

  async function handleUpdateRoom(): Promise<void> {
    if (!selectedEventId || !editingRoomId) return;

    const normalizedName = editRoomName.trim();
    if (!normalizedName) {
      setEditRoomFormError("Room name is required");
      return;
    }

    let parsedCapacity: number | null = null;
    if (editRoomCapacity.trim()) {
      const candidate = Number(editRoomCapacity.trim());
      if (!Number.isInteger(candidate) || candidate <= 0) {
        setEditRoomFormError("Capacity must be a positive whole number");
        return;
      }
      parsedCapacity = candidate;
    }

    setIsUpdatingRoom(true);
    setEditRoomFormError(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${selectedEventId}/rooms/${editingRoomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          capacity: parsedCapacity,
          notes: editRoomNotes.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to update room"));
      }

      setIsEditRoomOpen(false);
      setEditingRoomId(null);
      setEditRoomName("");
      setEditRoomCapacity("");
      setEditRoomNotes("");

      await loadSnapshot(selectedEventId);
      setFlashMessage(`Room \"${normalizedName}\" updated`);
    } catch (error) {
      setEditRoomFormError(error instanceof Error ? error.message : "Failed to update room");
    } finally {
      setIsUpdatingRoom(false);
    }
  }

  async function handleDeleteRoom(): Promise<void> {
    if (!selectedEventId || !editingRoomId || isDeletingRoom) return;

    const deletedRoomId = editingRoomId;
    setIsDeletingRoom(true);
    setDeleteRoomError(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${selectedEventId}/rooms/${deletedRoomId}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to delete room"));
      }

      // Keep the current board stable and update its canonical snapshot only
      // after the server confirms the room is gone.
      setSnapshot((current) =>
        current
          ? {
              ...current,
              rooms: current.rooms.filter((room) => room.id !== deletedRoomId),
            }
          : current,
      );
      setIsDeleteRoomConfirmOpen(false);
      setIsEditRoomOpen(false);
      setEditingRoomId(null);
      setEditRoomName("");
      setEditRoomCapacity("");
      setEditRoomNotes("");
      setEditRoomFormError(null);
      setFlashMessage("Room deleted");
    } catch (error) {
      setDeleteRoomError(error instanceof Error ? error.message : "Failed to delete room");
    } finally {
      setIsDeletingRoom(false);
    }
  }

  const addSessionStartMinutes = toMinutes(addSessionStartTime);
  const addSessionEndMinutes = toMinutes(addSessionEndTime);
  const addSessionTimeRangeError =
    addSessionStartMinutes === null
      ? "Choose a valid start time."
      : addSessionEndMinutes === null
        ? "Choose a valid end time."
        : addSessionEndMinutes <= addSessionStartMinutes
          ? "End time must be later than start time."
          : null;
  const isAddSessionTimeRangeValid = addSessionTimeRangeError === null;
  const isBusy = isLoadingEvents || isLoadingSnapshot || isMutating || isCreatingRoom || isUpdatingRoom || isDeletingRoom;
  const editingRoomSessionCount =
    editingRoomId && snapshot
      ? snapshot.sessions.filter((session) => session.roomId === editingRoomId).length
      : 0;
  const hasRunOfShowData = Boolean(
    snapshot &&
      snapshot.sessions.some((session) => !session.isTemporary),
  );
  const isRunOfShowEmpty = Boolean(snapshot && !isLoadingSnapshot && !hasRunOfShowData);

  return (
    <DndContext
      id="matrix2-run-of-show-dnd"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={(event) => {
        void handleDragEnd(event);
      }}
      onDragCancel={handleDragCancel}
    >
      <EventModuleSurface className="flex min-h-0 flex-col gap-4 overflow-visible">
        <div className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-white/90">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-100/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] [&_.eventModuleHeaderStats>div]:min-w-[76px] [&_.eventModuleHeaderStats>div]:rounded-xl [&_.eventModuleHeaderStats>div]:border [&_.eventModuleHeaderStats>div]:border-slate-200/80 [&_.eventModuleHeaderStats>div]:bg-white/85 [&_.eventModuleHeaderStats>div]:px-3 [&_.eventModuleHeaderStats>div]:py-2 [&_.eventModuleHeaderStats>div]:shadow-sm">
          <EventModuleHeader
            title={terminology.runOfShow}
            badge="Command Center"
            stats={[
              ...(!snapshot || isRunOfShowEmpty
                ? []
                : [
                    { label: "sessions", value: String(stats.sessions) },
                    { label: "rooms", value: String(stats.roomsActive) },
                    { label: "conflicts", value: String(stats.conflicts), tone: stats.conflicts > 0 ? "critical" as const : "good" as const },
                  ]),
            ]}
            actions={
              <>
                {!hideEventSelector ? (
                  <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 text-[12px] text-slate-700 shadow-sm transition focus-within:border-[#28439A]/35 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#28439A]/10">
                    Event
                    <select
                      value={selectedEventId}
                      disabled={isLoadingEvents || events.length === 0}
                      onChange={(event) => {
                        void handleEventChange(event.target.value);
                      }}
                      className="min-w-[220px] bg-transparent text-[12px] font-medium outline-none"
                    >
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {FEATURES.ENABLE_GENERIC_TASKING_UI ? (
                  <TaskCreateLauncher
                    eventId={selectedEventId}
                    source="run-of-show"
                    attachmentOptions={runOfShowTaskSessionOptions}
                    disabled={!selectedEventId}
                    buttonLabel="Task"
                    buttonClassName={`inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold transition hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300 ${EVENT_MODULE_PRIMARY_CLASS}`}
                    onOpenChange={(isOpen) => {
                      setSelectedSessionId(null);
                      setIsRunOfShowTaskModalOpen(isOpen);
                    }}
                  />
                ) : null}
                <MatrixImportAction
                  eventId={selectedEventId}
                  disabled={!selectedEventId}
                  onImported={async (outcome) => {
                    if (selectedEventId) {
                      await loadSnapshot(selectedEventId);
                    }
                    setErrorMessage(null);
                    setFlashMessage(outcome.noticeDetail);
                  }}
                  onError={(message) => setErrorMessage(message || null)}
                  trigger={({ open, disabled: triggerDisabled }) => (
                    <button
                      type="button"
                      onClick={open}
                      disabled={triggerDisabled}
                      className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Upload className="h-3.5 w-3.5" aria-hidden />
                      Import
                    </button>
                  )}
                />
                <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 text-[12px] text-slate-700 shadow-sm transition focus-within:border-[#28439A]/35 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#28439A]/10">
                  Date
                  <select
                    value={selectedDate}
                    disabled={!snapshot}
                    onChange={(event) => {
                      setSelectedDate(event.target.value);
                      setSelectedSessionId(null);
                    }}
                    className="min-w-[140px] bg-transparent text-[12px] font-medium outline-none"
                  >
                    {snapshot?.dates.map((date) => (
                      <option key={date} value={date}>
                        {formatDateLabel(date)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            }
          />
          </div>

          {snapshot && !isRunOfShowEmpty ? (
            <div className="mt-4">
              <Matrix2TopStrip
                isBusy={isBusy}
                hasSnapshot={Boolean(snapshot)}
                searchValue={searchValue}
                onSearchChange={setSearchValue}
                listFilters={listFilters}
                onListFiltersChange={handleListFiltersChange}
                onClearListFilters={handleClearListFilters}
                sessionTypeOptions={sessionTypeFilterOptions}
                roomOptions={snapshot?.rooms ?? []}
                boardOrientation={boardOrientation}
                onSetBoardOrientation={setBoardOrientation}
                zoomMode={zoomMode}
                onSetZoomMode={handleZoomModeChange}
                onOpenAddSession={handleOpenAddSession}
              />
            </div>
          ) : null}
        </div>

        {snapshotLoadError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-[13px] font-medium text-rose-700 shadow-sm" role="alert">
            <span>{snapshotLoadError}</span>
            <button
              type="button"
              onClick={() => void loadSnapshot(selectedEventId)}
              disabled={!selectedEventId || isLoadingSnapshot}
              className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-white px-2.5 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Retry
            </button>
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-[13px] font-medium text-rose-700 shadow-sm" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {!snapshot ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-center" role="status">
            <div>
              <p className="text-[16px] font-semibold text-slate-900">
                {terminology.runOfShow === "Run of Show"
                  ? "Run of Show is unavailable"
                  : `${terminology.runOfShow} is unavailable`}
              </p>
              <p className="mt-1 text-[13px] text-slate-600">{isLoadingSnapshot ? "Loading the latest event schedule…" : "The schedule was not loaded, so counts and empty-state actions are withheld."}</p>
            </div>
          </div>
        ) : isRunOfShowEmpty ? (
          <DashboardEmptyState
            title="No sessions yet"
            description="Import a program matrix or add your first session to start building the event schedule."
            icon={<Plus className="h-6 w-6" aria-hidden />}
            bullets={["Schedule by room and time", "Session types, speakers, and conflicts"]}
            className="flex min-h-[420px] items-center justify-center"
            primaryAction={
              <MatrixImportAction
                eventId={selectedEventId}
                disabled={!selectedEventId}
                onImported={async (outcome) => {
                  if (selectedEventId) {
                    await loadSnapshot(selectedEventId);
                  }
                  setErrorMessage(null);
                  setFlashMessage(outcome.noticeDetail);
                }}
                onError={(message) => setErrorMessage(message || null)}
                trigger={({ open, disabled: triggerDisabled }) => (
                  <button
                    type="button"
                    onClick={open}
                    disabled={triggerDisabled}
                    className={DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS}
                  >
                    <Upload className="h-4 w-4" aria-hidden />
                    Import Run of Show
                  </button>
                )}
              />
            }
            secondaryAction={
                <button
                  type="button"
                  onClick={handleOpenAddSession}
                  disabled={!selectedEventId || !snapshot || isBusy}
                  className={DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add session
                </button>
            }
          />
        ) : zoomMode === "OVERVIEW" ? (
          <div className="overflow-visible">
            <MatrixOverviewTable
              eventId={selectedEventId}
              sessions={overviewSessions}
              rooms={snapshot?.rooms ?? []}
              people={snapshot?.people ?? []}
              avRequirementItems={avRequirementItems}
              staffingRequirementItems={staffingRequirementItems}
              setupRequirementItems={setupRequirementItems}
              requirementTemplate={snapshot?.requirementTemplate ?? null}
              selectedSessionId={selectedSessionId}
              selectedSessionIds={selectedOverviewSessionIds}
              conflictsBySession={visibleConflictsForDate.bySession}
              sort={overviewSort}
              isBulkMutating={isMutating}
              onSort={handleOverviewSort}
              onSelectSession={handleOpenOverviewDetails}
              onOpenQuickPanel={handleOpenOverviewQuickPanel}
              onToggleSessionSelection={handleToggleOverviewSessionSelection}
              onToggleAllVisibleSessions={handleToggleAllVisibleOverviewSessions}
              onClearSelection={handleClearOverviewSelection}
              onBulkUpdateSessions={handleBulkUpdateOverviewSessions}
              onBulkDeleteSessions={handleBulkDeleteOverviewSessions}
              onSaveSession={handleSaveOverviewSession}
              onDuplicateSession={handleDuplicateOverviewSession}
              onDeleteSession={handleDeleteBoardSession}
              runOfShowLabel={terminology.runOfShow}
            />
            {selectedSession ? (
              <div
                className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-[1px]"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setSelectedSessionId(null);
                }}
              >
                <div className="ml-auto h-dvh w-full sm:w-[min(720px,calc(100vw-32px))]">
                  <Matrix2DetailsDrawer
                    key={selectedSession.id}
                    session={selectedSession}
                    rooms={snapshot?.rooms ?? []}
                    people={snapshot?.people ?? []}
                    conflicts={visibleConflictsForDate.bySession.get(selectedSession.id) ?? []}
                    onViewConflictingSession={(sessionId) => setSelectedSessionId(sessionId)}
                    requirementTemplate={snapshot?.requirementTemplate ?? null}
                    isBusy={isBusy}
                    initialQuickPanel={quickDrawerPanel}
                    onClose={() => setSelectedSessionId(null)}
                    onSaveEdit={handleSaveSessionEdit}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3 overflow-visible">
            <div className="flex min-h-0 flex-col gap-2 overflow-visible">
              {isBusy ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1 text-[12px] font-medium text-slate-500 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating Run of Show…
                </div>
              ) : null}

              <Matrix2Board
                rooms={snapshot?.rooms ?? EMPTY_ROOMS}
                sessions={visibleSessions}
                selectedSessionId={zoomMode === "PLANNING" ? selectedSessionId : null}
                conflictsBySession={visibleConflictsForDate.bySession}
                orientation={boardOrientation}
                zoomMode={zoomMode}
                isDraggingTemplate={Boolean(activeDragTemplate)}
                isDraggingSession={Boolean(activeDragSessionId)}
                activeDragSessionId={activeDragSessionId}
                onConsumeSessionDragClick={consumeSessionDragClick}
                isAddingRoom={isCreatingRoom || isUpdatingRoom}
                isTaskDrawerOpen={FEATURES.ENABLE_GENERIC_TASKING_UI && isRunOfShowTaskModalOpen}
                onSessionAction={handleSessionAction}
                onDeleteSession={handleDeleteBoardSession}
                onClearSelection={handleClearBoardSelection}
                onOpenAddRoom={handleOpenAddRoom}
                onOpenEditRoom={handleOpenEditRoom}
              />
            </div>

            {selectedSession ? (
              <div
                className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-[1px]"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setSelectedSessionId(null);
                  }
                }}
              >
                <div className="ml-auto h-dvh w-full sm:w-[min(720px,calc(100vw-32px))]">
                  <Matrix2DetailsDrawer
                    key={selectedSession.id}
                    session={selectedSession}
                    rooms={snapshot?.rooms ?? []}
                    people={snapshot?.people ?? []}
                    conflicts={visibleConflictsForDate.bySession.get(selectedSession.id) ?? []}
                    onViewConflictingSession={(sessionId) => setSelectedSessionId(sessionId)}
                    requirementTemplate={snapshot?.requirementTemplate ?? null}
                    isBusy={isBusy}
                    initialQuickPanel={quickDrawerPanel}
                    onClose={() => {
                      setSelectedSessionId(null);
                    }}
                    onSaveEdit={handleSaveSessionEdit}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}

        {flashMessage ? (
          <div className={BULK_SUCCESS_TOAST_CLASS}>
            {flashMessage}
          </div>
        ) : null}

        {flashErrorMessage ? (
          <div className={BULK_ERROR_TOAST_CLASS}>
            {flashErrorMessage}
          </div>
        ) : null}

        {isAddSessionOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]">
            <div className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xl ring-1 ring-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[20px] leading-[24px] font-semibold text-slate-900">Add session</h3>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Choose a type and schedule the session.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isMutating) setIsAddSessionOpen(false);
                  }}
                  disabled={isMutating}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-[18px] leading-none text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                  aria-label="Close add session"
                >
                  x
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 sm:col-span-2">
                  <span className="text-[12px] font-semibold text-slate-600">Session type</span>
                  <select
                    value={addSessionType}
                    onChange={(event) => handleAddSessionTypeChange(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[13px] outline-none transition focus:border-[#28439A]/35 focus:bg-white focus:ring-2 focus:ring-[#28439A]/10"
                    autoFocus
                  >
                    {SESSION_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={addSessionIncludeInOfficialAgenda}
                    onChange={(event) => setAddSessionIncludeInOfficialAgenda(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]"
                  />
                  <span>
                    <span className="block text-[12px] font-semibold text-slate-700">Include in official agenda</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">Leave off for rehearsals, setup blocks, and other internal operations.</span>
                  </span>
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-slate-600">Date</span>
                  <select
                    value={addSessionDate}
                    onChange={(event) => setAddSessionDate(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[13px] outline-none transition focus:border-[#28439A]/35 focus:bg-white focus:ring-2 focus:ring-[#28439A]/10"
                  >
                    {(snapshot?.dates ?? []).map((date) => (
                      <option key={date} value={date}>
                        {formatDateLabel(date)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-slate-600">Room</span>
                  <select
                    value={addSessionRoomId}
                    onChange={(event) => setAddSessionRoomId(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[13px] outline-none transition focus:border-[#28439A]/35 focus:bg-white focus:ring-2 focus:ring-[#28439A]/10"
                  >
                    <option value="">Unassigned</option>
                    {(snapshot?.rooms ?? []).map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-slate-600">Start time</span>
                  <TimeField
                    value={addSessionStartTime}
                    onChange={handleAddSessionStartTimeChange}
                    className="w-full"
                    inputClassName="h-10 rounded-xl border-slate-200 bg-slate-50/70 px-3 text-[13px]"
                    ariaLabel="New session start time"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-slate-600">End time</span>
                  <TimeField
                    value={addSessionEndTime}
                    onChange={handleAddSessionEndTimeChange}
                    className="w-full"
                    inputClassName="h-10 rounded-xl border-slate-200 bg-slate-50/70 px-3 text-[13px]"
                    ariaLabel="New session end time"
                  />
                </label>
              </div>

              {addSessionTimeRangeError || addSessionError ? (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">
                  {addSessionTimeRangeError ?? addSessionError}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSessionOpen(false)}
                  disabled={isMutating}
                  className="h-10 rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateAddSession()}
                  disabled={isMutating || Boolean(pendingCreatedSession) || !isAddSessionTimeRangeValid}
                  className="h-10 rounded-xl bg-[#28439A] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#243d8e] disabled:opacity-60"
                >
                  {pendingCreatedSession ? "Refresh required" : isMutating ? "Creating..." : "Create session"}
                </button>
                {pendingCreatedSession ? (
                  <button
                    type="button"
                    onClick={() => void retryCreatedSessionRefresh()}
                    disabled={isMutating}
                    className="h-10 rounded-xl border border-rose-200 px-4 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                  >
                    Retry refresh
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {isAddRoomOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]">
            <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xl ring-1 ring-white">
              <h3 className="text-[20px] leading-[24px] font-semibold text-slate-900">Add Room</h3>
              <p className="mt-1 text-[13px] text-slate-500">Create a new room lane for this event.</p>

              <div className="mt-4 space-y-3">
                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-slate-600">Room Name</span>
                  <input
                    value={newRoomName}
                    onChange={(event) => setNewRoomName(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[13px] outline-none transition focus:border-[#28439A]/35 focus:bg-white focus:ring-2 focus:ring-[#28439A]/10"
                    placeholder="Room A"
                    autoFocus
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-slate-600">Capacity (optional)</span>
                  <input
                    type="number"
                    min={1}
                    value={newRoomCapacity}
                    onChange={(event) => setNewRoomCapacity(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[13px] outline-none transition focus:border-[#28439A]/35 focus:bg-white focus:ring-2 focus:ring-[#28439A]/10"
                    placeholder="80"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-slate-600">Notes (optional)</span>
                  <textarea
                    value={newRoomNotes}
                    onChange={(event) => setNewRoomNotes(event.target.value)}
                    rows={3}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[13px] outline-none transition focus:border-[#28439A]/35 focus:bg-white focus:ring-2 focus:ring-[#28439A]/10"
                    placeholder="VIP backstage access, low ceiling, etc."
                  />
                </label>

                {roomFormError ? <p className="text-[12px] text-rose-600">{roomFormError}</p> : null}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isCreatingRoom || Boolean(pendingCreatedRoomName)}
                  onClick={() => {
                    setIsAddRoomOpen(false);
                    setNewRoomName("");
                    setNewRoomCapacity("");
                    setNewRoomNotes("");
                    setRoomFormError(null);
                  }}
                  className="h-10 rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isCreatingRoom || Boolean(pendingCreatedRoomName)}
                  onClick={() => {
                    void handleCreateRoom();
                  }}
                  className="h-10 rounded-xl bg-[#28439A] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#243d8e] disabled:opacity-50"
                >
                  {pendingCreatedRoomName ? "Refresh required" : isCreatingRoom ? "Saving..." : "Save Room"}
                </button>
                {pendingCreatedRoomName ? (
                  <button
                    type="button"
                    onClick={() => void retryCreatedRoomRefresh()}
                    disabled={isCreatingRoom}
                    className="h-10 rounded-xl border border-rose-200 px-4 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                  >
                    Retry refresh
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {isEditRoomOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xl ring-1 ring-white">
              <h3 className="text-[20px] leading-[24px] font-semibold text-slate-900">Edit Room</h3>
              <p className="mt-1 text-[13px] text-slate-500">Update room details for this event lane.</p>

              <div className="mt-4 space-y-3">
                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-slate-600">Room Name</span>
                  <input
                    value={editRoomName}
                    onChange={(event) => setEditRoomName(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[13px] outline-none transition focus:border-[#28439A]/35 focus:bg-white focus:ring-2 focus:ring-[#28439A]/10"
                    placeholder="Room A"
                    autoFocus
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-slate-600">Capacity (optional)</span>
                  <input
                    type="number"
                    min={1}
                    value={editRoomCapacity}
                    onChange={(event) => setEditRoomCapacity(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-[13px] outline-none transition focus:border-[#28439A]/35 focus:bg-white focus:ring-2 focus:ring-[#28439A]/10"
                    placeholder="80"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-[12px] font-semibold text-slate-600">Notes (optional)</span>
                  <textarea
                    value={editRoomNotes}
                    onChange={(event) => setEditRoomNotes(event.target.value)}
                    rows={3}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[13px] outline-none transition focus:border-[#28439A]/35 focus:bg-white focus:ring-2 focus:ring-[#28439A]/10"
                    placeholder="Loading dock, projector mounted, etc."
                  />
                </label>

                {editRoomFormError ? <p className="text-[12px] text-rose-600">{editRoomFormError}</p> : null}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isUpdatingRoom || isDeletingRoom}
                  onClick={() => {
                    setIsDeleteRoomConfirmOpen(false);
                    setDeleteRoomError(null);
                    setIsEditRoomOpen(false);
                    setEditingRoomId(null);
                    setEditRoomName("");
                    setEditRoomCapacity("");
                    setEditRoomNotes("");
                    setEditRoomFormError(null);
                  }}
                  className="h-10 rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isUpdatingRoom || isDeletingRoom}
                  onClick={() => {
                    void handleUpdateRoom();
                  }}
                  className="h-10 rounded-xl bg-[#28439A] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#243d8e] disabled:opacity-50"
                >
                  {isUpdatingRoom ? "Saving..." : "Save Room"}
                </button>
              </div>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="text-[12px] text-slate-500">Deleting a room cannot be undone.</p>
                <button
                  type="button"
                  disabled={isUpdatingRoom || isDeletingRoom}
                  onClick={() => {
                    setDeleteRoomError(null);
                    setIsDeleteRoomConfirmOpen(true);
                  }}
                  className="mt-2 h-9 rounded-lg border border-rose-200 px-3 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete room
                </button>
              </div>
            </div>

            {isDeleteRoomConfirmOpen ? (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-room-title"
              >
                <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
                  <h4 id="delete-room-title" className="text-[18px] leading-6 font-semibold text-slate-900">Delete room?</h4>
                  {editingRoomSessionCount > 0 ? (
                    <p className="mt-2 text-[14px] leading-5 text-slate-600">
                      This room contains {editingRoomSessionCount} session{editingRoomSessionCount === 1 ? "" : "s"}. Reassign or remove those sessions before deleting it.
                    </p>
                  ) : (
                    <p className="mt-2 text-[14px] leading-5 text-slate-600">
                      Delete “{editRoomName.trim() || "this room"}”? This cannot be undone.
                    </p>
                  )}
                  {deleteRoomError ? <p className="mt-3 text-[13px] text-rose-600">{deleteRoomError}</p> : null}

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isDeletingRoom}
                      onClick={() => {
                        setIsDeleteRoomConfirmOpen(false);
                        setDeleteRoomError(null);
                      }}
                      className="h-10 rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {editingRoomSessionCount > 0 ? "Close" : "Cancel"}
                    </button>
                    {editingRoomSessionCount === 0 ? (
                      <button
                        type="button"
                        disabled={isDeletingRoom}
                        onClick={() => {
                          void handleDeleteRoom();
                        }}
                        className="h-10 rounded-xl bg-rose-600 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDeletingRoom ? "Deleting..." : "Delete room"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </EventModuleSurface>

      <DragOverlay dropAnimation={null}>
        {activeDragTemplate ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-xl ring-1 ring-white">
            <GripVertical className="h-4 w-4 text-slate-500" />
            {activeDragTemplate.label}
            <span className="text-[11px] text-slate-500">{activeDragTemplate.durationMinutes}m</span>
          </div>
        ) : activeDragSession ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-xl ring-1 ring-white">
            <GripVertical className="h-4 w-4 text-slate-500" />
            {activeDragSession.title}
            <span className="text-[11px] text-slate-500">{matrixSessionTimeLabel(activeDragSession)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
