"use client";

import { Filter, ListChecks, Plus, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TimelineBoardView from "./_components/TimelineBoardView";
import { calculateTimelineCompletion } from "@/lib/timeline/completion";
import TimelineDashboardView from "./_components/TimelineDashboardView";
import TimelineGanttView, { type RoadmapInlineDraft } from "./_components/TimelineGanttView";
import TimelineListView from "./_components/TimelineListView";
import { TimelineDependencyPanel } from "./_components/TimelineDependencyPanel";
import { isRootTimelineItem } from "./_components/types";
import { SectionImportModalShell } from "../_components/section-import-modal-shell";
import {
  DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS,
  DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS,
  DashboardEmptyState,
} from "@/components/dashboard-empty-state";
import { EVENT_MODULE_PRIMARY_CLASS, EventModuleHeader, EventModuleSurface, eventModuleClasses } from "../events/[eventId]/_components/event-module-header";
import {
  PLANNING_STAGE_LABELS,
  TIMELINE_PLANNING_STAGES,
  TIMELINE_WORKSTREAMS,
  WORKSTREAM_LABELS,
  buildTimelineWorkstreamOptions,
  getWorkstreamDisplayKey,
  getWorkstreamLabel,
  normalizeWorkstreamLabel,
  resolveWorkstream,
  workstreamLabelKey,
  type TimelineWorkstreamOption,
} from "@/lib/timeline/taxonomy";
import {
  parseUploadedFile,
  type ImportColumn,
  type ImportMapping,
  type ParsedSheet,
  type ParsedWorkbook,
} from "@/lib/import";
import {
  TIMELINE_IMPORT_FIELD_SPECS,
  buildTimelineDraftRows,
  buildTimelineInitialMapping,
  detectMonthColumns,
  detectResponsiblePartyColumns,
  validateTimelineMapping,
  type TimelineImportField,
} from "@/lib/timeline-import-mapping";
import {
  buildTimelineImportTemplateCsv,
  buildTimelineImportSuccessOutcome,
  validateTimelineImportRows,
  type TimelineImportDraftRow,
  type TimelineImportValidatedRow,
} from "@/lib/timeline-import";
import { DateField } from "@/components/date-field";
import {
  normalizeTimelineDateInput,
  normalizeTimelineDatePatch,
  parseTimelineDateOnly,
  timelineTodayDateOnly,
} from "@/lib/timeline/date-normalization";
import {
  BULK_SUCCESS_TOAST_CLASS,
  TABLE_CONTROL_BUTTON_CLASS,
  TABLE_FILTER_CONTROL_CLASS,
  TABLE_FILTER_PANEL_CLASS,
} from "@/lib/bulk-edit-ui";
import type {
  TimelineItemPatch,
  TimelineItemRecord,
  TimelineOwnerOption,
  TimelinePlanningStage,
  TimelinePriority,
  TimelineStatus,
  TimelineViewMode,
  TimelineWorkstream,
} from "./_components/types";

const TIMELINE_SELECTED_EVENT_KEY = "timeline:selectedEventId";
const TIMELINE_VIEW_KEY = "timeline:view";

const VIEW_MODES: Array<{ value: TimelineViewMode; label: string }> = [
  { value: "DASHBOARD", label: "Dashboard" },
  { value: "LIST", label: "Matrix" },
  { value: "TIMELINE", label: "Workstream" },
  { value: "BOARD", label: "Board" },
];

const STATUS_OPTIONS: TimelineStatus[] = ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "COMPLETE"];
const PRIORITY_OPTIONS: TimelinePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
type TimelineCreateMode = "workstream" | "item";
type CreateWorkstreamChoice = {
  value: string;
  label: string;
  workstream: TimelineWorkstream | null;
  department: string | null;
};

const TIMELINE_IMPORT_ACCEPT =
  ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

const TIMELINE_IMPORT_FIELD_OPTIONS: { value: TimelineImportField | ""; label: string }[] = [
  { value: "", label: "Do not import" },
  ...TIMELINE_IMPORT_FIELD_SPECS.map((spec) => ({
    value: spec.field,
    label: spec.required ? `${spec.label} (required)` : spec.label,
  })),
];

function formatTimelineEnumLabel(value: string): string {
  if (!value) return "";
  const label = value.toLowerCase().replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function timelineReadError(status: number, subject: string): string {
  if (status === 401) return "Sign in again to continue.";
  if (status === 403) return `You do not have access to this event's ${subject}.`;
  if (status === 404) return `This event's ${subject} was not found.`;
  return `Unable to load ${subject}. Please try again.`;
}

function formatTimelineStatusLabel(status: string): string {
  return formatTimelineEnumLabel(status || "NOT_STARTED");
}

function formatTimelinePriorityLabel(priority: string): string {
  return formatTimelineEnumLabel(priority || "MEDIUM");
}

function parseOwnerOptions(payload: unknown): TimelineOwnerOption[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((user): user is TimelineOwnerOption => {
      if (!user || typeof user !== "object") return false;
      const candidate = user as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        (typeof candidate.name === "string" || candidate.name === null) &&
        typeof candidate.email === "string"
      );
    })
    .sort((left, right) => {
      const leftLabel = (left.name?.trim() || left.email).toLowerCase();
      const rightLabel = (right.name?.trim() || right.email).toLowerCase();
      return leftLabel.localeCompare(rightLabel);
    });
}

type EventOption = {
  id: string;
  name: string;
};

type TimelinePageProps = {
  eventIdOverride?: string;
  hideEventSelector?: boolean;
  canEdit?: boolean;
};

type TimelineApiIssue = {
  path?: unknown[];
  message?: unknown;
};

type TimelineSaveError = Error & {
  fieldErrors?: Partial<Record<"startDate" | "endDate", string>>;
};

function toErrorMessage(payload: unknown, fallback: string): string {
  const fieldMessage = getTimelineFieldErrors(payload).startDate ?? getTimelineFieldErrors(payload).endDate;
  if (fieldMessage) return fieldMessage;

  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

function getTimelineFieldErrors(payload: unknown): Partial<Record<"startDate" | "endDate", string>> {
  if (typeof payload !== "object" || payload === null || !("issues" in payload) || !Array.isArray(payload.issues)) {
    return {};
  }

  return (payload.issues as TimelineApiIssue[]).reduce<Partial<Record<"startDate" | "endDate", string>>>(
    (errors, issue) => {
      const field = issue.path?.[0];
      if ((field === "startDate" || field === "endDate") && typeof issue.message === "string") {
        errors[field] = issue.message;
      }
      return errors;
    },
    {},
  );
}

function makeTimelineSaveError(payload: unknown, fallback: string): TimelineSaveError {
  const fieldErrors = getTimelineFieldErrors(payload);
  const message = fieldErrors.startDate ?? fieldErrors.endDate ?? toErrorMessage(payload, fallback);
  const error = new Error(message) as TimelineSaveError;
  if (fieldErrors.startDate || fieldErrors.endDate) {
    error.fieldErrors = fieldErrors;
  }
  return error;
}

function isValidViewMode(value: string | null | undefined): value is TimelineViewMode {
  return value === "DASHBOARD" || value === "LIST" || value === "BOARD" || value === "TIMELINE";
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toIsoDueDate(value: string | null): string | null {
  return normalizeTimelineDateInput(value);
}

function resolveCreateWorkstreamChoice(
  value: string,
  options: TimelineWorkstreamOption[],
): CreateWorkstreamChoice | null {
  const normalized = normalizeWorkstreamLabel(value);
  if (!normalized) return null;

  const normalizedKey = workstreamLabelKey(normalized);
  const existingOption = options.find(
    (option) =>
      workstreamLabelKey(option.label) === normalizedKey ||
      workstreamLabelKey(option.value) === normalizedKey,
  );
  if (existingOption) {
    return {
      value: existingOption.value,
      label: existingOption.label,
      workstream: existingOption.workstream,
      department: existingOption.department,
    };
  }

  const canonical = resolveWorkstream(normalized);
  if (canonical) {
    return {
      value: canonical,
      label: WORKSTREAM_LABELS[canonical],
      workstream: canonical,
      department: null,
    };
  }

  return {
    value: normalized,
    label: normalized,
    workstream: null,
    department: normalized,
  };
}

export default function TimelinePage({ eventIdOverride = "", hideEventSelector = false, canEdit = true }: TimelinePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scopedEventId = useMemo(() => eventIdOverride.trim(), [eventIdOverride]);
  const initialEventId = useMemo(() => {
    if (scopedEventId) return scopedEventId;
    return searchParams.get("eventId")?.trim() ?? "";
  }, [scopedEventId, searchParams]);

  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [viewMode, setViewMode] = useState<TimelineViewMode>("DASHBOARD");
  const [items, setItems] = useState<TimelineItemRecord[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedTimelineItemId, setSelectedTimelineItemId] = useState<string | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateMoreDetailsOpen, setIsCreateMoreDetailsOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [inlineDraft, setInlineDraft] = useState<RoadmapInlineDraft | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const createTitleInputRef = useRef<HTMLInputElement | null>(null);
  const [createEventId, setCreateEventId] = useState("");
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<TimelineCreateMode>("item");
  const [createTitle, setCreateTitle] = useState("");
  const [createWorkstream, setCreateWorkstream] = useState("");
  const [createPlanningStage, setCreatePlanningStage] = useState<TimelinePlanningStage>("PLANNING");
  const [createStatus, setCreateStatus] = useState<TimelineStatus>("NOT_STARTED");
  const [createProgress, setCreateProgress] = useState("");
  const [createPriority, setCreatePriority] = useState<TimelinePriority>("MEDIUM");
  const [createOwnerUserId, setCreateOwnerUserId] = useState("");
  const [createIsCriticalPath, setCreateIsCriticalPath] = useState(false);
  const [createStartDate, setCreateStartDate] = useState("");
  const [createEndDate, setCreateEndDate] = useState("");
  const [filterWorkstream, setFilterWorkstream] = useState("ALL");
  const [filterStage, setFilterStage] = useState("ALL");
  const [timelineFiltersOpen, setTimelineFiltersOpen] = useState(false);
  const [listFiltersOpen, setListFiltersOpen] = useState(false);
  const hasTimelineUrlStateRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [itemsLoadError, setItemsLoadError] = useState<string | null>(null);
  const [ownerLoadError, setOwnerLoadError] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<TimelineOwnerOption[]>([]);
  const [createOwnerOptions, setCreateOwnerOptions] = useState<TimelineOwnerOption[]>([]);
  const [dashboardRefreshToken, setDashboardRefreshToken] = useState(0);
  const itemsRequestVersionRef = useRef(0);
  const ownersRequestVersionRef = useRef(0);
  const createSubmissionInFlightRef = useRef(false);
  const requestedTimelineItemId = searchParams.get("item")?.trim() ?? "";

  useEffect(() => {
    if (!successMessage) return;
    const timeoutId = window.setTimeout(() => setSuccessMessage(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  // Timeline import (section-level upload) state.
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importWorkbook, setImportWorkbook] = useState<ParsedWorkbook | null>(null);
  const [importSheetName, setImportSheetName] = useState<string | null>(null);
  const [importMapping, setImportMapping] = useState<ImportMapping<TimelineImportField>>({});
  const [importDraftRows, setImportDraftRows] = useState<TimelineImportDraftRow[]>([]);
  const [importRowNumbers, setImportRowNumbers] = useState<number[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<TimelineImportValidatedRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importHeaderError, setImportHeaderError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importIdempotencyKey, setImportIdempotencyKey] = useState("");
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const importSheet = useMemo<ParsedSheet | null>(() => {
    if (!importWorkbook || !importSheetName) return null;
    return importWorkbook.sheets.find((sheet) => sheet.name === importSheetName) ?? null;
  }, [importWorkbook, importSheetName]);

  const importNeedsSheetPick = Boolean(
    importWorkbook && importWorkbook.sheetNames.length > 1 && !importSheetName,
  );
  const importMappingErrors = useMemo(
    () => (importSheet ? validateTimelineMapping(importMapping) : []),
    [importSheet, importMapping],
  );
  const importMonthColumns = useMemo(
    () => (importSheet ? detectMonthColumns(importSheet.columns) : []),
    [importSheet],
  );
  const importResponsiblePartyColumns = useMemo(
    () => (importSheet ? detectResponsiblePartyColumns(importSheet.columns) : []),
    [importSheet],
  );
  const importHasResponsiblePartyColumn = importResponsiblePartyColumns.length > 0;
  const importRowsForPreview = useMemo(
    () => importPreviewRows.filter((row) => !row.isBlank),
    [importPreviewRows],
  );
  const validImportCount = useMemo(
    () => importRowsForPreview.filter((row) => row.isValid).length,
    [importRowsForPreview],
  );
  const invalidImportCount = useMemo(
    () => importRowsForPreview.filter((row) => !row.isValid).length,
    [importRowsForPreview],
  );
  const warningImportCount = useMemo(
    () => importRowsForPreview.filter((row) => row.isValid && row.warnings.length > 0).length,
    [importRowsForPreview],
  );
  const readyImportCount = validImportCount - warningImportCount;
  const hasImportFileSelection = Boolean(importWorkbook || importFileName || importHeaderError);

  const loadEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    try {
      const response = await fetch("/api/events", { credentials: "include" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load events"));
      }

      const parsedEvents: EventOption[] = Array.isArray(payload)
        ? payload
            .filter((event): event is { id: string; name: string } => {
              return Boolean(event && typeof event.id === "string" && typeof event.name === "string");
            })
            .map((event) => ({ id: event.id, name: event.name }))
        : [];

      setEvents(parsedEvents);

      setSelectedEventId((current) => {
        if (scopedEventId) {
          return scopedEventId;
        }
        if (current && parsedEvents.some((event) => event.id === current)) {
          return current;
        }
        return "";
      });
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load events");
    } finally {
      setIsLoadingEvents(false);
    }
  }, [scopedEventId]);

  const loadItems = useCallback(async (eventId: string, signal?: AbortSignal) => {
    if (!eventId) {
      setItems([]);
      return;
    }

    const requestVersion = ++itemsRequestVersionRef.current;
    setIsLoadingItems(true);
    setItemsLoadError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/timeline-items`, { credentials: "include", signal });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(timelineReadError(response.status, "roadmap items"));
      }

      if (!Array.isArray(payload)) throw new Error("The roadmap items response was invalid. Please try again.");
      const nextItems = payload as TimelineItemRecord[];
      if (nextItems.some((item) => !item || typeof item.id !== "string" || item.eventId !== eventId || typeof item.title !== "string")) {
        throw new Error("The roadmap items response was invalid. Please try again.");
      }
      if (signal?.aborted || itemsRequestVersionRef.current !== requestVersion) return;
      setItems(nextItems);

      const parentIds = new Set<string>();
      const itemIds = new Set(nextItems.map((item) => item.id));
      for (const item of nextItems) {
        if (item.parentId && itemIds.has(item.parentId)) {
          parentIds.add(item.parentId);
        }
      }

      setExpandedIds((current) => {
        const next = new Set(current);
        for (const parentId of parentIds) {
          next.add(parentId);
        }
        return next;
      });
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (itemsRequestVersionRef.current !== requestVersion) return;
      console.error(error);
      setItemsLoadError(error instanceof Error ? error.message : "Unable to load roadmap items. Please try again.");
    } finally {
      if (itemsRequestVersionRef.current === requestVersion) setIsLoadingItems(false);
    }
  }, []);

  const fetchOwnerOptions = useCallback(async (eventId: string): Promise<TimelineOwnerOption[]> => {
    if (!eventId) return [];
    try {
      const response = await fetch(`/api/events/${eventId}/assignable-users`, { credentials: "include" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load owner options"));
      }
      return parseOwnerOptions(payload);
    } catch (error) {
      console.error(error);
      return [];
    }
  }, []);

  const loadOwnerOptions = useCallback(async (eventId: string, signal?: AbortSignal) => {
    if (!eventId) {
      setOwnerOptions([]);
      return;
    }
    const requestVersion = ++ownersRequestVersionRef.current;
    setOwnerLoadError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/assignable-users`, { credentials: "include", signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(timelineReadError(response.status, "roadmap owners"));
      const options = parseOwnerOptions(payload);
      if (!Array.isArray(payload)) throw new Error("The roadmap owners response was invalid. Please try again.");
      if (signal?.aborted || ownersRequestVersionRef.current !== requestVersion) return;
      setOwnerOptions(options);
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (ownersRequestVersionRef.current !== requestVersion) return;
      console.error(error);
      setOwnerLoadError(error instanceof Error ? error.message : "Unable to load roadmap owners. Please try again.");
    }
  }, []);

  const loadCreateOwnerOptions = useCallback(async (eventId: string) => {
    setCreateOwnerOptions(await fetchOwnerOptions(eventId));
  }, [fetchOwnerOptions]);

  useEffect(() => {
    if (scopedEventId) {
      setSelectedEventId(scopedEventId);
      setCreateEventId(scopedEventId);
      return;
    }

    const storedEventId = window.localStorage.getItem(TIMELINE_SELECTED_EVENT_KEY)?.trim() ?? "";
    const storedViewMode = window.localStorage.getItem(TIMELINE_VIEW_KEY)?.trim();

    if (initialEventId || storedEventId) {
      const nextEventId = initialEventId || storedEventId;
      setSelectedEventId(nextEventId);
      setCreateEventId(nextEventId);
    }

    if (isValidViewMode(storedViewMode)) {
      setViewMode(storedViewMode);
    }
  }, [initialEventId, scopedEventId]);

  useEffect(() => {
    if (hideEventSelector || scopedEventId) return;
    void loadEvents();
  }, [hideEventSelector, loadEvents, scopedEventId]);

  useEffect(() => {
    if (!selectedEventId) {
      window.localStorage.removeItem(TIMELINE_SELECTED_EVENT_KEY);
      setItems([]);
      setOwnerOptions([]);
      return;
    }

    const controller = new AbortController();
    window.localStorage.setItem(TIMELINE_SELECTED_EVENT_KEY, selectedEventId);
    setItems([]);
    setOwnerOptions([]);
    setExpandedIds(new Set());
    setSelectedTimelineItemId(null);
    setItemsLoadError(null);
    setOwnerLoadError(null);
    void loadItems(selectedEventId, controller.signal);
    void loadOwnerOptions(selectedEventId, controller.signal);
    return () => {
      itemsRequestVersionRef.current += 1;
      ownersRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [loadItems, loadOwnerOptions, selectedEventId]);

  useEffect(() => {
    if (!isCreateOpen || createEventId !== selectedEventId) return;
    setCreateOwnerOptions(ownerOptions);
  }, [createEventId, isCreateOpen, ownerOptions, selectedEventId]);

  useEffect(() => {
    if (!isCreateOpen || createMode !== "item") return;
    const frame = window.requestAnimationFrame(() => createTitleInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [createMode, isCreateOpen]);

  useEffect(() => {
    window.localStorage.setItem(TIMELINE_VIEW_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    const requestedView = searchParams.get("view")?.trim() ?? "";
    const requestedStage = searchParams.get("stage")?.trim() ?? "";
    const requestedItem = searchParams.get("item")?.trim() ?? "";
    const hasTimelineUrlState = Boolean(requestedView || requestedStage || requestedItem);

    if (requestedItem) {
      setViewMode("TIMELINE");
    } else if (isValidViewMode(requestedView)) {
      setViewMode(requestedView);
    } else if (hasTimelineUrlStateRef.current && !hasTimelineUrlState) {
      setViewMode("DASHBOARD");
    }

    if (TIMELINE_PLANNING_STAGES.includes(requestedStage as TimelinePlanningStage)) {
      setFilterStage(requestedStage);
    } else if (hasTimelineUrlStateRef.current && !hasTimelineUrlState) {
      setFilterStage("ALL");
    }

    hasTimelineUrlStateRef.current = hasTimelineUrlState;
  }, [searchParams]);

  useEffect(() => {
    if (!requestedTimelineItemId || !selectedEventId || isLoadingItems) return;

    if (!isUuidLike(requestedTimelineItemId)) {
      setSelectedTimelineItemId(null);
      setInlineError("That roadmap item link is no longer available.");
      return;
    }

    const item = items.find((candidate) => candidate.id === requestedTimelineItemId);
    if (!item || isRootTimelineItem(item)) {
      setSelectedTimelineItemId(null);
      setInlineError("That roadmap item link is no longer available.");
      return;
    }

    setInlineError(null);
    setViewMode("TIMELINE");
    setFilterWorkstream("ALL");
    setFilterStage("ALL");
    setSelectedTimelineItemId(item.id);
    setExpandedIds((current) => {
      const next = new Set(current);
      let parentId = item.parentId;
      while (parentId) {
        next.add(parentId);
        parentId = items.find((candidate) => candidate.id === parentId)?.parentId ?? null;
      }
      return next;
    });
  }, [isLoadingItems, items, requestedTimelineItemId, selectedEventId]);

  useEffect(() => {
    if (!isAddMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && addMenuRef.current?.contains(target)) return;
      setIsAddMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAddMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAddMenuOpen]);

  const filteredItems = useMemo(() => {
    if (filterWorkstream === "ALL" && filterStage === "ALL") return items;
    return items.filter((item) => {
      if (isRootTimelineItem(item)) return true;
      if (filterWorkstream !== "ALL") {
        const resolved = getWorkstreamDisplayKey(item.workstream ?? item.department) ?? "UNASSIGNED";
        if (resolved !== filterWorkstream) return false;
      }
      if (filterStage !== "ALL" && (item.planningStage ?? "") !== filterStage) {
        return false;
      }
      return true;
    });
  }, [filterStage, filterWorkstream, items]);
  const timelineShellFilterCount = [filterWorkstream !== "ALL", filterStage !== "ALL"].filter(Boolean).length;
  const usesTimelineShellFilters = viewMode !== "LIST";
  const viewSupportsFilters = viewMode !== "DASHBOARD";

  const taskItems = useMemo(
    () => filteredItems.filter((item) => !isRootTimelineItem(item)),
    [filteredItems],
  );
  const activeFilteredItems = useMemo(() => filteredItems.filter((item) => item.disposition !== "NOT_NEEDED"), [filteredItems]);
  const activeTaskItems = useMemo(() => taskItems.filter((item) => item.disposition !== "NOT_NEEDED"), [taskItems]);

  const timelineWorkstreamOptions = useMemo(
    () => buildTimelineWorkstreamOptions(items.filter((item) => !isRootTimelineItem(item))),
    [items],
  );
  const existingWorkstreams = useMemo<TimelineWorkstream[]>(
    () =>
      Array.from(
        new Set(
          taskItems
            .map((item) => resolveWorkstream(item.workstream ?? item.department))
            .filter((workstream): workstream is TimelineWorkstream => Boolean(workstream)),
        ),
      ),
    [taskItems],
  );
  const availableWorkstreams = useMemo(
    () => TIMELINE_WORKSTREAMS.filter((workstream) => !existingWorkstreams.includes(workstream)),
    [existingWorkstreams],
  );

  const selectedEventName = useMemo(
    () => events.find((event) => event.id === selectedEventId)?.name ?? "Event Timeline",
    [events, selectedEventId],
  );

  const defaultInlineWorkstream = useMemo<TimelineWorkstream | "UNASSIGNED">(() => {
    if (filterWorkstream !== "ALL") {
      const canonical = resolveWorkstream(filterWorkstream);
      return canonical ?? "UNASSIGNED";
    }
    if (existingWorkstreams.length > 0) return existingWorkstreams[0];
    const firstTask = taskItems.find((item) => resolveWorkstream(item.workstream ?? item.department));
    return resolveWorkstream(firstTask?.workstream ?? firstTask?.department) ?? "PRODUCTION";
  }, [existingWorkstreams, filterWorkstream, taskItems]);

  const createWorkstreamChoice = useMemo(
    () => resolveCreateWorkstreamChoice(createWorkstream, timelineWorkstreamOptions),
    [createWorkstream, timelineWorkstreamOptions],
  );
  const shouldOfferCreateWorkstream = useMemo(() => {
    if (createMode !== "item" || !createWorkstreamChoice?.department) return false;
    const normalizedKey = workstreamLabelKey(createWorkstreamChoice.label);
    return !timelineWorkstreamOptions.some((option) => workstreamLabelKey(option.label) === normalizedKey);
  }, [createMode, createWorkstreamChoice, timelineWorkstreamOptions]);

  const completionMetrics = useMemo(() => {
    const activeItems = items.filter((item) => item.disposition !== "NOT_NEEDED");
    const completion = calculateTimelineCompletion(activeItems);
    const critical = activeItems.filter((item) => item.priority === "CRITICAL").length;
    return {
      total: completion.totalItems,
      complete: completion.completeItems,
      critical,
      progressPercent: completion.percentComplete,
    };
  }, [items]);

  const roadmapStats = useMemo(() => {
    const today = timelineTodayDateOnly();

    const overdue = activeTaskItems.filter((item) => {
      if (item.status === "COMPLETE") return false;
      const dueValue = item.endDate ?? item.startDate;
      if (!dueValue) return false;
      const dueDate = parseTimelineDateOnly(dueValue);
      if (!dueDate) return false;
      return dueDate.getTime() < today.getTime();
    }).length;
    const atRisk = activeTaskItems.filter((item) => item.status === "AT_RISK").length;
    const onTrack = Math.max(activeTaskItems.length - atRisk - overdue, 0);

    return { total: activeTaskItems.length, onTrack, atRisk, overdue };
  }, [activeTaskItems]);

  const handleToggleExpand = useCallback((itemId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleEditField = useCallback(
    async (itemId: string, patch: TimelineItemPatch) => {
      if (!selectedEventId) return;

      const currentItem = items.find((item) => item.id === itemId);
      const normalizedPatch = {
        ...normalizeTimelineDatePatch(patch),
        expectedUpdatedAt: patch.expectedUpdatedAt ?? currentItem?.updatedAt,
      };
      let previousItems: TimelineItemRecord[] = [];
      setInlineError(null);

      setItems((current) => {
        previousItems = current;
        return current.map((item) => {
          if (item.id !== itemId) return item;

          return {
            ...item,
            ...(typeof normalizedPatch.department !== "undefined" ? { department: normalizedPatch.department } : {}),
            ...(typeof normalizedPatch.status !== "undefined" ? { status: normalizedPatch.status } : {}),
            ...(typeof normalizedPatch.progress !== "undefined" ? { progress: normalizedPatch.progress } : {}),
            ...(normalizedPatch.status === "COMPLETE" ? { progress: 100 } : {}),
            ...(typeof normalizedPatch.priority !== "undefined" ? { priority: normalizedPatch.priority } : {}),
            ...(typeof normalizedPatch.parentId !== "undefined" ? { parentId: normalizedPatch.parentId } : {}),
            ...(typeof normalizedPatch.dueDate !== "undefined" ? { endDate: toIsoDueDate(normalizedPatch.dueDate ?? null) } : {}),
          };
        });
      });

      try {
        const response = await fetch(`/api/events/${selectedEventId}/timeline-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(normalizedPatch),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw makeTimelineSaveError(payload, "Failed to update timeline item");
        }

        setItems((current) =>
          current.map((item) => {
            if (item.id !== itemId) return item;
            return payload as TimelineItemRecord;
          }),
        );
      } catch (error) {
        setItems(previousItems);
        setInlineError(error instanceof Error ? error.message : "Failed to update timeline item");
      }
    },
    [items, selectedEventId],
  );

  const handleMoveStatus = useCallback(
    async (itemId: string, status: TimelineStatus) => {
      await handleEditField(itemId, { status });
    },
    [handleEditField],
  );

  const handleSaveRow = useCallback(
    async (itemId: string, patch: TimelineItemPatch) => {
      if (!selectedEventId) return;

      const currentItem = items.find((item) => item.id === itemId);
      const normalizedPatch = {
        ...normalizeTimelineDatePatch(patch),
        expectedUpdatedAt: patch.expectedUpdatedAt ?? currentItem?.updatedAt,
      };
      setInlineError(null);
      const response = await fetch(`/api/events/${selectedEventId}/timeline-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(normalizedPatch),
      });
      const payload = await response.json();
      if (!response.ok) {
        const error = makeTimelineSaveError(payload, "Failed to update timeline item");
        setInlineError(error.message);
        throw error;
      }

      setItems((current) =>
        current.map((item) => {
          if (item.id !== itemId) return item;
          return payload as TimelineItemRecord;
        }),
      );
      setDashboardRefreshToken((current) => current + 1);
    },
    [items, selectedEventId],
  );

  const handleRefreshItem = useCallback(async (itemId: string): Promise<TimelineItemRecord | null> => {
    if (!selectedEventId) return null;
    const response = await fetch(`/api/events/${selectedEventId}/timeline-items`, { credentials: "include" });
    const payload: unknown = await response.json();
    if (!response.ok || !Array.isArray(payload)) return null;
    const refreshedItems = payload as TimelineItemRecord[];
    setItems(refreshedItems);
    return refreshedItems.find((item) => item.id === itemId) ?? null;
  }, [selectedEventId]);

  /**
   * Reorder one roadmap item among its siblings.
   *
   * The swap is applied to local state first and persisted in the background. Previously this
   * awaited the POST and then refetched every item, which on a remote database meant four to
   * six seconds where nothing moved, followed by the whole table re-rendering at once — it read
   * as a page reload, and the refetch discarded which parents the user had expanded.
   *
   * Only the two affected rows change. Hierarchy is untouched: the swap is between siblings
   * that already share a parentId, and children follow their parent because the list renders
   * them beneath it.
   */
  const handleReorderItem = useCallback(async (item: TimelineItemRecord, direction: "up" | "down") => {
    if (!selectedEventId) return;
    setInlineError(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    const siblings = items.filter(
      (entry) => entry.parentId === item.parentId && !isRootTimelineItem(entry),
    );
    const currentIndex = siblings.findIndex((entry) => entry.id === item.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    // Boundary: nothing to swap with.
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;

    const partner = siblings[targetIndex]!;
    const previousItems = items;

    const swapped = items.map((entry) => {
      if (entry.id === item.id) return { ...entry, sortOrder: partner.sortOrder };
      if (entry.id === partner.id) return { ...entry, sortOrder: item.sortOrder };
      return entry;
    });
    // The list renders in array order, so the array positions have to swap too.
    const fromIndex = swapped.findIndex((entry) => entry.id === item.id);
    const toIndex = swapped.findIndex((entry) => entry.id === partner.id);
    const optimistic = [...swapped];
    [optimistic[fromIndex], optimistic[toIndex]] = [optimistic[toIndex]!, optimistic[fromIndex]!];
    setItems(optimistic);

    try {
      const response = await fetch(`/api/events/${selectedEventId}/timeline-items/reorder`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, direction, expectedSortOrder: item.sortOrder }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(toErrorMessage(payload, "Unable to reorder roadmap item"));
      if ((payload as { moved?: boolean } | null)?.moved === false) {
        // The server declined the move (already at a boundary); do not claim it succeeded.
        setItems(previousItems);
        return;
      }
      const updatedOrderTokens = (payload as {
        items?: Array<{ id: string; sortOrder: number; updatedAt: string }>;
      } | null)?.items;
      if (updatedOrderTokens?.length) {
        const tokenById = new Map(updatedOrderTokens.map((entry) => [entry.id, entry]));
        setItems((current) => current.map((entry) => {
          const updated = tokenById.get(entry.id);
          return updated ? { ...entry, sortOrder: updated.sortOrder, updatedAt: updated.updatedAt } : entry;
        }));
      }
      // Reuses the shared toast, which auto-clears after 2.4s.
      setSuccessMessage(`Moved “${item.title}” ${direction}.`);
    } catch (error) {
      // Restore the exact pre-move order rather than leaving a move that never committed.
      setItems(previousItems);
      setErrorMessage(error instanceof Error ? error.message : "Unable to reorder roadmap item");
    }
  }, [items, selectedEventId]);

  const handleDeleteTask = useCallback(
    async (itemId: string) => {
      if (!selectedEventId) return;

      const confirmed = window.confirm("Delete this timeline item and any sub-items?");
      if (!confirmed) return;

      setInlineError(null);
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/events/${selectedEventId}/timeline-items/${itemId}`, {
          method: "DELETE",
          credentials: "include",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(toErrorMessage(payload, "Failed to delete timeline item"));
        }
        // Mirror the server's recursive descendant delete locally without a
        // full reload; the removal set is provable from parentId relationships.
        setItems((current) => {
          const removed = new Set<string>([itemId]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const item of current) {
              if (item.parentId && removed.has(item.parentId) && !removed.has(item.id)) {
                removed.add(item.id);
                changed = true;
              }
            }
          }
          return current.filter((item) => !removed.has(item.id));
        });
        setSelectedTimelineItemId((current) => (current === itemId ? null : current));
        setDashboardRefreshToken((current) => current + 1);
      } catch (error) {
        setInlineError(error instanceof Error ? error.message : "Failed to delete timeline item");
      }
    },
    [selectedEventId],
  );

  const handleBulkUpdateItems = useCallback(
    async (itemIds: string[], patch: TimelineItemPatch) => {
      if (!selectedEventId) return { updatedCount: 0, skippedCount: itemIds.length };

      setInlineError(null);
      setErrorMessage(null);
      setSuccessMessage(null);

      const response = await fetch(`/api/events/${selectedEventId}/timeline-items/bulk`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds, patch }),
      });
      const payload = (await response.json()) as {
        updatedCount?: number;
        skippedCount?: number;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        const message = toErrorMessage(payload, "Failed to bulk update timeline items");
        setInlineError(message);
        throw new Error(message);
      }

      const ownerUserPatch =
        Object.prototype.hasOwnProperty.call(patch, "ownerUserId")
          ? ownerOptions.find((owner) => owner.id === patch.ownerUserId) ?? null
          : undefined;
      const selectedIds = new Set(itemIds);
      setItems((current) =>
        current.map((item) => {
          if (!selectedIds.has(item.id)) return item;
          return {
            ...item,
            ...(typeof patch.department !== "undefined" ? { department: patch.department } : {}),
            ...(typeof patch.workstream !== "undefined" ? { workstream: patch.workstream } : {}),
            ...(typeof patch.planningStage !== "undefined" ? { planningStage: patch.planningStage } : {}),
            ...(typeof patch.status !== "undefined" ? { status: patch.status } : {}),
            ...(typeof patch.progress !== "undefined" ? { progress: patch.progress } : {}),
            ...(patch.status === "COMPLETE" || (item.status === "COMPLETE" && typeof patch.status === "undefined" && typeof patch.progress !== "undefined") ? { progress: 100 } : {}),
            ...(typeof patch.priority !== "undefined" ? { priority: patch.priority } : {}),
            ...(typeof patch.isCriticalPath !== "undefined" ? { isCriticalPath: patch.isCriticalPath } : {}),
            ...(typeof ownerUserPatch !== "undefined" ? { ownerUser: ownerUserPatch } : {}),
          };
        }),
      );
      setDashboardRefreshToken((current) => current + 1);
      setSuccessMessage(
        `Updated ${payload.updatedCount ?? 0} timeline item${payload.updatedCount === 1 ? "" : "s"}`,
      );
      return {
        updatedCount: payload.updatedCount ?? 0,
        skippedCount: payload.skippedCount ?? 0,
      };
    },
    [ownerOptions, selectedEventId],
  );

  const handleBulkDeleteItems = useCallback(
    async (itemIds: string[]) => {
      if (!selectedEventId) return { deletedCount: 0, skippedCount: itemIds.length };

      setInlineError(null);
      setErrorMessage(null);
      setSuccessMessage(null);

      const response = await fetch(`/api/events/${selectedEventId}/timeline-items/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds }),
      });
      const payload = (await response.json()) as {
        deletedCount?: number;
        skippedCount?: number;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        const message = toErrorMessage(payload, "Failed to delete selected timeline items");
        setInlineError(message);
        throw new Error(message);
      }

      setSelectedTimelineItemId((current) => (current && itemIds.includes(current) ? null : current));
      // Bulk delete returns counts only (not the exact ids removed, and some may
      // be skipped), and each delete cascades to direct children — so a full
      // reload is the safe source of truth. Invalidate the dashboard cache too.
      await loadItems(selectedEventId);
      setDashboardRefreshToken((current) => current + 1);
      setSuccessMessage(
        `Deleted ${payload.deletedCount ?? 0} timeline item${payload.deletedCount === 1 ? "" : "s"}.`,
      );
      return {
        deletedCount: payload.deletedCount ?? 0,
        skippedCount: payload.skippedCount ?? 0,
      };
    },
    [loadItems, selectedEventId],
  );

  function resetCreateForm(mode: TimelineCreateMode, workstream?: TimelineWorkstream | "UNASSIGNED") {
    const presetWorkstream = workstream && workstream !== "UNASSIGNED" ? workstream : null;
    setCreateEventId(selectedEventId);
    setCreateOwnerOptions(ownerOptions);
    setCreateParentId(null);
    setCreateMode(mode);
    setCreateTitle("");
    setCreateWorkstream(
      mode === "workstream"
        ? presetWorkstream ?? availableWorkstreams[0] ?? ""
        : presetWorkstream
          ? getWorkstreamLabel(presetWorkstream)
          : "",
    );
    setCreatePlanningStage("PLANNING");
    setCreateStatus("NOT_STARTED");
    setCreateProgress("");
    setCreatePriority("MEDIUM");
    setCreateOwnerUserId("");
    setCreateIsCriticalPath(false);
    setCreateStartDate("");
    setCreateEndDate("");
    setIsCreateMoreDetailsOpen(false);
  }

  function openCreateWorkstreamModal() {
    setInlineError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    resetCreateForm("workstream", defaultInlineWorkstream);
    setIsAddMenuOpen(false);
    setIsCreateOpen(true);
  }

  function openCreateItemModal(workstream?: TimelineWorkstream | "UNASSIGNED") {
    setInlineError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    resetCreateForm("item", workstream);
    setIsAddMenuOpen(false);
    setIsCreateOpen(true);
  }

  function openCreateSubtaskModal(parent: TimelineItemRecord) {
    openCreateItemModal();
    setCreateParentId(parent.id);
    setCreateWorkstream(getWorkstreamLabel(parent.workstream ?? parent.department));
    setCreatePlanningStage(parent.planningStage ?? "PLANNING");
  }

  const viewStageItems = useCallback((stage: TimelinePlanningStage) => {
    setFilterStage(stage);
    setViewMode("LIST");
    setTimelineFiltersOpen(false);
    setListFiltersOpen(false);

    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "LIST");
    params.set("stage", stage);
    router.push(`?${params.toString()}`);
  }, [router, searchParams]);

  const handleSelectTimelineItem = useCallback((itemId: string) => {
    setSelectedTimelineItemId(itemId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "TIMELINE");
    params.set("item", itemId);
    router.push(`?${params.toString()}`);
  }, [router, searchParams]);

  function openInlineDraft(
    workstream: TimelineWorkstream | "UNASSIGNED",
    kind: RoadmapInlineDraft["kind"],
    defaults: { startDate?: string; endDate?: string } = {},
  ) {
    setInlineError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsAddMenuOpen(false);
    setViewMode("TIMELINE");
    setInlineDraft({
      workstream,
      kind,
      title: "",
      startDate: defaults.startDate ?? "",
      endDate: defaults.endDate ?? defaults.startDate ?? "",
      ownerUserId: "",
      planningStage: filterStage !== "ALL" ? (filterStage as TimelinePlanningStage) : "PLANNING",
      isSaving: false,
    });
  }

  function updateInlineDraft(patch: Partial<Omit<RoadmapInlineDraft, "workstream" | "kind">>) {
    setInlineDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleCreateInlineDraft() {
    if (!selectedEventId || !inlineDraft || inlineDraft.isSaving) return;

    const normalizedTitle = inlineDraft.title.trim();
    if (!normalizedTitle) {
      setInlineError("Enter a title before creating the roadmap item.");
      return;
    }

    const hasStart = Boolean(inlineDraft.startDate);
    const hasEnd = Boolean(inlineDraft.endDate);
    if (inlineDraft.kind === "TASK" && hasStart !== hasEnd) {
      setInlineError("Add both start and end dates, or leave both blank.");
      return;
    }
    if (inlineDraft.kind === "TASK" && hasStart && hasEnd) {
      const startDate = parseTimelineDateOnly(inlineDraft.startDate);
      const endDate = parseTimelineDateOnly(inlineDraft.endDate);
      if (!startDate || !endDate || endDate.getTime() < startDate.getTime()) {
        setInlineError("End date must be on or after start date.");
        return;
      }
    }

    const draft = inlineDraft;
    setInlineError(null);
    setErrorMessage(null);
    setInlineDraft((current) => (current ? { ...current, isSaving: true } : current));

    const payload =
      draft.kind === "MILESTONE"
        ? {
            kind: "MILESTONE" as const,
            title: normalizedTitle,
            workstream: draft.workstream === "UNASSIGNED" ? null : draft.workstream,
            planningStage: draft.planningStage,
            status: "NOT_STARTED" as const,
            priority: "MEDIUM" as const,
            ownerUserId: draft.ownerUserId || null,
            isCriticalPath: false,
            milestoneDate: draft.startDate || null,
            parentId: null,
          }
        : {
            kind: "BAR" as const,
            title: normalizedTitle,
            workstream: draft.workstream === "UNASSIGNED" ? null : draft.workstream,
            planningStage: draft.planningStage,
            status: "NOT_STARTED" as const,
            priority: "MEDIUM" as const,
            ownerUserId: draft.ownerUserId || null,
            isCriticalPath: false,
            startDate: draft.startDate || null,
            endDate: draft.endDate || null,
            parentId: null,
          };

    try {
      const response = await fetch(`/api/events/${selectedEventId}/timeline-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(responsePayload, "Failed to create roadmap item"));
      }

      // Inline create always targets the current event and returns the full
      // created record (same select as the list, incl. ownerUser). Append it
      // locally instead of reloading the whole event; createTimelineItem shifts
      // no sibling sortOrder, so the local append matches server state exactly.
      const createdItem = responsePayload as TimelineItemRecord;
      setItems((current) => [...current, createdItem]);
      setDashboardRefreshToken((current) => current + 1);
      setSuccessMessage(`Created item "${normalizedTitle}".`);
      setInlineDraft(null);
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : "Failed to create roadmap item");
      setInlineDraft((current) => (current ? { ...current, isSaving: false } : current));
    }
  }

  function resetImportState() {
    setImportWorkbook(null);
    setImportSheetName(null);
    setImportMapping({});
    setImportDraftRows([]);
    setImportRowNumbers([]);
    setImportPreviewRows([]);
    setImportFileName("");
    setImportHeaderError(null);
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }
  }

  function openImportModal() {
    setErrorMessage(null);
    setSuccessMessage(null);
    resetImportState();
    setImportIdempotencyKey(crypto.randomUUID());
    setIsImportOpen(true);
  }

  function handleDownloadImportTemplate() {
    const csv = buildTimelineImportTemplateCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "timeline-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Re-derive draft rows + validation preview from a sheet and its mapping. The
  // shared validator (and the server) stay the single source of truth.
  function applyTimelineMapping(sheet: ParsedSheet, mapping: ImportMapping<TimelineImportField>) {
    const { draftRows, rowNumbers } = buildTimelineDraftRows(sheet, mapping);
    const validation = validateTimelineImportRows(draftRows, { rowNumbers, ownerOptions });
    setImportDraftRows(draftRows);
    setImportRowNumbers(rowNumbers);
    setImportPreviewRows(validation.rows);
  }

  function handleSelectImportSheet(sheetName: string) {
    if (!importWorkbook) return;
    const sheet = importWorkbook.sheets.find((candidate) => candidate.name === sheetName);
    if (!sheet) return;

    setImportSheetName(sheetName);
    setImportHeaderError(sheet.columns.length === 0 ? "Selected sheet has no columns to map." : null);

    const mapping = buildTimelineInitialMapping(sheet.columns);
    setImportMapping(mapping);
    applyTimelineMapping(sheet, mapping);
  }

  function handleImportMappingChange(columnId: string, field: TimelineImportField | "") {
    if (!importSheet) return;
    const nextMapping = { ...importMapping, [columnId]: field };
    setImportMapping(nextMapping);
    applyTimelineMapping(importSheet, nextMapping);
  }

  async function handleImportFileSelected(file: File) {
    setImportFileName(file.name);
    setImportHeaderError(null);
    setImportWorkbook(null);
    setImportSheetName(null);
    setImportMapping({});
    setImportDraftRows([]);
    setImportRowNumbers([]);
    setImportPreviewRows([]);

    try {
      const workbook = await parseUploadedFile(file);
      const usableSheets = workbook.sheets.filter((sheet) => sheet.columns.length > 0);

      if (usableSheets.length === 0) {
        setImportHeaderError("No readable rows found. Add a header row and data, then try again.");
        return;
      }

      setImportWorkbook(workbook);

      // Single usable sheet: map immediately. Multiple: wait for the user to pick.
      if (workbook.sheetNames.length === 1 || usableSheets.length === 1) {
        const sheet = usableSheets[0]!;
        setImportSheetName(sheet.name);
        const mapping = buildTimelineInitialMapping(sheet.columns);
        setImportMapping(mapping);
        applyTimelineMapping(sheet, mapping);
      }
    } catch (error) {
      setImportHeaderError(error instanceof Error ? error.message : "Failed to read import file");
      setImportWorkbook(null);
    }
  }

  async function handleImportTimelineRows() {
    if (!selectedEventId) {
      setErrorMessage("Select an event before importing.");
      return;
    }
    if (importMappingErrors.length > 0) {
      setErrorMessage("Finish mapping required columns before importing.");
      return;
    }
    if (validImportCount === 0) {
      setErrorMessage("No valid rows available to import.");
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);

    try {
      // Send every mapped row (valid + invalid) for the selected sheet only and
      // let the server re-validate and partial-import.
      const response = await fetch(`/api/events/${selectedEventId}/timeline-items/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: importDraftRows, rowNumbers: importRowNumbers, idempotencyKey: importIdempotencyKey }),
      });

      const payload = (await response.json()) as {
        importedCount?: number;
        invalidCount?: number;
        blankCount?: number;
        missingAssignmentsCount?: number;
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to import timeline items"));
      }

      const importedCount = payload.importedCount ?? validImportCount;
      const hasOtherSheets =
        (importWorkbook?.sheets.filter((sheet) => sheet.columns.length > 0).length ?? 0) > 1;
      const outcome = buildTimelineImportSuccessOutcome({
        importedCount,
        skippedCount: (payload.invalidCount ?? invalidImportCount) + (payload.blankCount ?? 0),
        hasOtherSheets,
      });

      // Import mass-creates rows server-side; a full reload is the safe way to
      // pick them all up. Invalidate the dashboard cache so its metrics update.
      await loadItems(selectedEventId);
      setDashboardRefreshToken((current) => current + 1);
      if (outcome.closeModal) {
        setIsImportOpen(false);
        resetImportState();
      }
      const missingAssignments = payload.missingAssignmentsCount ?? warningImportCount;
      setSuccessMessage(`${outcome.noticeTitle}: ${outcome.noticeDetail} ${missingAssignments} imported with missing assignments.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to import timeline items");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleCreateRoadmapEntity() {
    if (!createEventId || isAdding || createSubmissionInFlightRef.current) {
      return;
    }

    setIsAdding(true);
    setInlineError(null);
    setErrorMessage(null);

    const normalizedTitle = createTitle.trim();
    const effectiveEndDate = createEndDate || createStartDate;

    const selectedWorkstream = createWorkstream || null;
    const selectedCanonicalWorkstream = resolveWorkstream(createWorkstream);
    const selectedItemWorkstream = createWorkstreamChoice;

    if (!selectedWorkstream) {
      setErrorMessage("Choose a workstream.");
      setIsAdding(false);
      return;
    }

    if (createMode === "workstream") {
      if (!selectedCanonicalWorkstream) {
        setErrorMessage("Workstream name is required.");
        setIsAdding(false);
        return;
      }
      if (existingWorkstreams.includes(selectedCanonicalWorkstream)) {
        setErrorMessage(`${WORKSTREAM_LABELS[selectedCanonicalWorkstream]} already exists. Choose a different workstream.`);
        setIsAdding(false);
        return;
      }
      if (!createStartDate) {
        setErrorMessage("Start date is required for workstreams.");
        setIsAdding(false);
        return;
      }

      if (!effectiveEndDate) {
        setErrorMessage("End date is required for workstreams.");
        setIsAdding(false);
        return;
      }

      if (new Date(effectiveEndDate).getTime() < new Date(createStartDate).getTime()) {
        setErrorMessage("End date must be on or after start date.");
        setIsAdding(false);
        return;
      }
    } else if (!selectedItemWorkstream) {
      setErrorMessage("Choose a workstream.");
      setIsAdding(false);
      return;
    } else if (!normalizedTitle) {
      setErrorMessage("Item name is required.");
      setIsAdding(false);
      return;
    } else if (createProgress && (!Number.isInteger(Number(createProgress)) || Number(createProgress) < 0 || Number(createProgress) > 100)) {
      setErrorMessage("Progress must be a whole number from 0 to 100.");
      setIsAdding(false);
      return;
    } else if (createStartDate && createEndDate && new Date(createEndDate).getTime() < new Date(createStartDate).getTime()) {
      setErrorMessage("End date must be on or after start date.");
      setIsAdding(false);
      return;
    }

    const createPayload = {
      kind: "BAR" as const,
      title:
        createMode === "workstream"
          ? `${WORKSTREAM_LABELS[selectedCanonicalWorkstream as TimelineWorkstream]} workstream`
          : normalizedTitle,
      workstream:
        createMode === "workstream"
          ? selectedCanonicalWorkstream
          : selectedItemWorkstream!.workstream,
      department: createMode === "item" ? selectedItemWorkstream!.department : null,
      planningStage: createPlanningStage,
      status: createStatus,
      priority: createPriority,
      ownerUserId: createOwnerUserId || null,
      isCriticalPath: createMode === "item" ? createIsCriticalPath : false,
      startDate: createStartDate || null,
      endDate: createMode === "workstream" ? effectiveEndDate : createEndDate || null,
      parentId: createParentId,
      progress: createStatus === "COMPLETE" ? 100 : createProgress ? Number(createProgress) : null,
    };

    createSubmissionInFlightRef.current = true;
    try {
      const response = await fetch(`/api/events/${createEventId}/timeline-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(createPayload),
      });

      const responsePayload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(responsePayload, "Failed to create timeline item"));
      }

      setSelectedEventId(createEventId);
      window.localStorage.setItem(TIMELINE_SELECTED_EVENT_KEY, createEventId);
      if (createParentId) {
        setExpandedIds((current) => new Set(current).add(createParentId));
      }
      await loadItems(createEventId);
      setDashboardRefreshToken((current) => current + 1);
      router.refresh();
      setSuccessMessage(
        createMode === "workstream"
          ? `Created ${WORKSTREAM_LABELS[selectedCanonicalWorkstream as TimelineWorkstream]} workstream.`
          : `Created item "${normalizedTitle}".`,
      );
      setIsCreateOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create roadmap item");
    } finally {
      createSubmissionInFlightRef.current = false;
      setIsAdding(false);
    }
  }

  const renderCurrentView = () => {
    if (!selectedEventId) {
      return <p className="text-sm text-slate-500">No event selected. Add a roadmap item to begin.</p>;
    }

    const renderTimelineTaskEmptyState = () => (
      <DashboardEmptyState
        title="No timeline items yet"
        description="Add roadmap items, deadlines, and dependencies to manage event planning work."
        icon={<ListChecks className="h-6 w-6" aria-hidden />}
        primaryAction={
          <button
            type="button"
            onClick={() => openCreateItemModal()}
            disabled={!canEdit}
            className={DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add item
          </button>
        }
        secondaryAction={
          <button
            type="button"
            onClick={() => openImportModal()}
            disabled={!canEdit || !selectedEventId}
            className={DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS}
          >
            <Upload className="h-4 w-4" aria-hidden />
            Import timeline
          </button>
        }
      />
    );

    if (viewMode === "DASHBOARD") {
      return (
        <TimelineDashboardView
          eventId={selectedEventId}
          key={selectedEventId}
          canEdit={canEdit}
          refreshToken={dashboardRefreshToken}
          onViewItems={() => setViewMode("LIST")}
          onViewStage={viewStageItems}
          onOpenItem={(itemId) => {
            setSelectedTimelineItemId(itemId);
            setViewMode("TIMELINE");
          }}
          onAddWorkstream={openCreateWorkstreamModal}
          onAddItem={() => openCreateItemModal()}
          onAddMilestone={() => openInlineDraft(defaultInlineWorkstream, "MILESTONE")}
        />
      );
    }

    if (isLoadingItems) {
      return <p className="text-sm text-slate-500">Loading timeline items...</p>;
    }

    if (itemsLoadError && items.length === 0) {
      return (
        <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700" role="alert">
          <p>{itemsLoadError}</p>
          <button type="button" onClick={() => void loadItems(selectedEventId)} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold">
            Retry
          </button>
        </div>
      );
    }

    if (viewMode === "BOARD") {
      if (activeTaskItems.length === 0) {
        return renderTimelineTaskEmptyState();
      }
      return (
        <TimelineBoardView
          items={activeTaskItems}
          onMoveStatus={handleMoveStatus}
          onOpenItem={(itemId) => {
            setSelectedTimelineItemId(itemId);
            setViewMode("TIMELINE");
          }}
        />
      );
    }

    if (viewMode === "TIMELINE") {
      if (activeFilteredItems.length === 0) {
        return renderTimelineTaskEmptyState();
      }
      return (
        <TimelineGanttView
          items={activeFilteredItems}
          eventName={selectedEventName}
          canEdit={canEdit}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          selectedItemId={selectedTimelineItemId}
          onSelectItem={handleSelectTimelineItem}
          onSaveItem={handleSaveRow}
          onDeleteTask={handleDeleteTask}
          ownerOptions={ownerOptions}
          inlineDraft={inlineDraft}
          onUpdateInlineDraft={updateInlineDraft}
          onCancelInlineDraft={() => setInlineDraft(null)}
          onSaveInlineDraft={() => void handleCreateInlineDraft()}
          onOpenItemCreate={(workstream) => openCreateItemModal(workstream)}
          onAddWorkstream={openCreateWorkstreamModal}
        />
      );
    }

    if (taskItems.length === 0) {
      return renderTimelineTaskEmptyState();
    }

    return (
      <div className="space-y-3">
      <TimelineDependencyPanel eventId={selectedEventId} items={taskItems} canEdit={canEdit} onDependenciesChanged={() => setDashboardRefreshToken((current) => current + 1)} />
      <TimelineListView
        eventId={selectedEventId}
        items={taskItems}
        canEdit={canEdit}
        onSaveRow={handleSaveRow}
        onDeleteTask={handleDeleteTask}
        onAddSubtask={openCreateSubtaskModal}
        onReorder={handleReorderItem}
        onBulkUpdate={handleBulkUpdateItems}
        onBulkDelete={handleBulkDeleteItems}
        onRefreshItem={handleRefreshItem}
        ownerOptions={ownerOptions}
        filtersOpen={listFiltersOpen}
      />
      </div>
    );
  };

  return (
    <EventModuleSurface className="space-y-5">
      <EventModuleHeader
        title="Roadmap"
        badge="Command Center"
        subtitle="Plan, track, and manage your event roadmap."
        stats={[
          { label: "Total items", value: String(roadmapStats.total) },
          { label: "On track", value: String(roadmapStats.onTrack), tone: "good" },
          { label: "At risk", value: String(roadmapStats.atRisk), tone: "warning" },
          { label: "Overdue", value: String(roadmapStats.overdue), tone: "critical" },
        ]}
        actions={
          <>
            {!hideEventSelector ? (
              <div className="min-w-[220px] flex-1 xl:min-w-[240px] xl:flex-none">
                <label htmlFor="timeline-event-select" className="sr-only">
                  Event
                </label>
                <select
                  id="timeline-event-select"
                  value={selectedEventId}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                  disabled={isLoadingEvents || events.length === 0}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select event</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                onClick={() => openImportModal()}
                disabled={!selectedEventId}
                className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Import
              </button>
            ) : null}
            {canEdit ? (
              <div ref={addMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddMenuOpen((current) => !current)}
                  disabled={!selectedEventId}
                  className={`inline-flex h-11 items-center rounded-xl px-4 text-[13px] font-semibold transition hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300 ${EVENT_MODULE_PRIMARY_CLASS}`}
                  aria-haspopup="menu"
                  aria-expanded={isAddMenuOpen}
                >
                  Add
                </button>
                {isAddMenuOpen ? (
                  <div
                    role="menu"
                    aria-label="Roadmap add menu"
                    className="absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-[13px] shadow-xl ring-1 ring-slate-900/5"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={openCreateWorkstreamModal}
                      className="block w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Add workstream
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openCreateItemModal()}
                      className="block w-full rounded-lg px-3 py-2 text-left font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Add item
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        }
      />

      <div className={`${eventModuleClasses.controlRow} min-w-0`}>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className={`${eventModuleClasses.viewToggle} flex-wrap`}>
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setViewMode(mode.value)}
                className={`h-9 rounded-lg px-4 text-[13px] font-semibold whitespace-nowrap transition ${
                  viewMode === mode.value
                    ? "border-b-2 border-[#28439A] bg-white text-[#28439A] shadow-sm ring-1 ring-slate-200"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 xl:justify-end">
          {viewSupportsFilters ? (
            <button
              type="button"
              className={TABLE_CONTROL_BUTTON_CLASS}
              aria-expanded={usesTimelineShellFilters ? timelineFiltersOpen : listFiltersOpen}
              onClick={() => {
                if (usesTimelineShellFilters) {
                  setTimelineFiltersOpen((current) => !current);
                } else {
                  setListFiltersOpen((current) => !current);
                }
              }}
              data-testid="timeline-shell-filters-toggle"
            >
              <Filter className="h-3.5 w-3.5" aria-hidden />
              {usesTimelineShellFilters && timelineShellFilterCount > 0
                ? `Filters · ${timelineShellFilterCount}`
                : "Filters"}
            </button>
          ) : null}
          <span className="shrink-0 whitespace-nowrap rounded-full bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-600">
            {completionMetrics.critical} on Critical Path
          </span>
          <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2 sm:flex-none">
            <div className="h-2 min-w-20 flex-1 rounded-full bg-slate-200 sm:w-24 sm:flex-none">
              <div className="h-2 rounded-full bg-blue-500" style={{ width: `${completionMetrics.progressPercent}%` }} />
            </div>
            <span className="text-sm font-medium text-slate-600">{completionMetrics.progressPercent}%</span>
            <span className="whitespace-nowrap text-sm text-slate-500">
              {completionMetrics.complete} of {completionMetrics.total} complete
            </span>
          </div>
        </div>
      </div>

      <details className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-[12px] text-slate-700" data-testid="roadmap-first-use-guidance">
        <summary className="cursor-pointer font-semibold text-[#28439A]">Roadmap terms</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <p><strong>Statuses</strong> move work from Not Started to In Progress, At Risk, or Complete.</p>
          <p><strong>Workstreams</strong> group related work and responsibility.</p>
          <p><strong>Planning stages</strong> place work in the event lifecycle from pre-planning through closeout.</p>
          <p><strong>Critical Path</strong> is a manual flag for work that can affect the event finish; dependencies identify blockers.</p>
        </div>
      </details>

      {usesTimelineShellFilters && viewSupportsFilters && timelineFiltersOpen ? (
        <div className={TABLE_FILTER_PANEL_CLASS} data-testid="timeline-shell-filter-panel">
          <select
            value={filterWorkstream}
            onChange={(event) => setFilterWorkstream(event.target.value)}
            aria-label="Filter by workstream"
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="ALL">All Workstreams</option>
            {timelineWorkstreamOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={filterStage}
            onChange={(event) => setFilterStage(event.target.value)}
            aria-label="Filter by planning stage"
            className={TABLE_FILTER_CONTROL_CLASS}
          >
            <option value="ALL">All Stages</option>
            {TIMELINE_PLANNING_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {PLANNING_STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
          {timelineShellFilterCount > 0 ? (
            <button
              type="button"
              className={TABLE_CONTROL_BUTTON_CLASS}
              onClick={() => {
                setFilterWorkstream("ALL");
                setFilterStage("ALL");
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? <p className="text-sm text-rose-600">{errorMessage}</p> : null}
      {itemsLoadError && (viewMode === "DASHBOARD" || items.length > 0) ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          <p>{itemsLoadError}</p>
          <button type="button" onClick={() => void loadItems(selectedEventId)} className="shrink-0 font-semibold underline underline-offset-2">Retry</button>
        </div>
      ) : null}
      {ownerLoadError ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
          <p>{ownerLoadError}</p>
          <button type="button" onClick={() => void loadOwnerOptions(selectedEventId)} className="shrink-0 font-semibold underline underline-offset-2">Retry</button>
        </div>
      ) : null}
      {inlineError ? <p className="text-xs text-rose-600">{inlineError}</p> : null}
      {successMessage ? (
        <p className={BULK_SUCCESS_TOAST_CLASS}>
          {successMessage}
        </p>
      ) : null}
      <div>{renderCurrentView()}</div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">
              {createMode === "workstream" ? "Add workstream" : createParentId ? "Add subtask" : "Add item"}
            </h3>

            {createMode === "item" && selectedEventName ? (
              <p className="mt-1 text-xs font-medium text-slate-500">{selectedEventName}</p>
            ) : null}
            {createParentId ? (
              <p className="mt-1 text-xs font-medium text-blue-700">
                Checklist item under {items.find((item) => item.id === createParentId)?.title ?? "roadmap item"}
              </p>
            ) : null}

            <div className="mt-4 space-y-3">
              {createMode === "workstream" ? (
                <>
                  {!hideEventSelector ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Event</label>
                      <select
                        value={createEventId}
                        onChange={(event) => {
                          const nextEventId = event.target.value;
                          setCreateEventId(nextEventId);
                          setCreateOwnerUserId("");
                          void loadCreateOwnerOptions(nextEventId);
                        }}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700"
                      >
                        <option value="">Select event</option>
                        {events.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Event</label>
                      <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {selectedEventName}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Workstream name</label>
                    <select
                      value={createWorkstream}
                      onChange={(event) => setCreateWorkstream(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    >
                      {availableWorkstreams.length === 0 ? <option value="">All workstreams already exist</option> : null}
                      {availableWorkstreams.map((workstream) => (
                        <option key={workstream} value={workstream}>
                          {WORKSTREAM_LABELS[workstream]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
                      <DateField
                        value={createStartDate}
                        onChange={(nextStart) => {
                          setCreateStartDate(nextStart);
                          if (!createEndDate && nextStart) {
                            setCreateEndDate(nextStart);
                          }
                        }}
                        ariaLabel="Workstream start date"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">End date</label>
                      <DateField
                        value={createEndDate}
                        min={createStartDate || undefined}
                        onChange={setCreateEndDate}
                        ariaLabel="Workstream end date"
                        popoverClassName="right-0 left-auto"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Item name</label>
                    <input
                      ref={createTitleInputRef}
                      value={createTitle}
                      onChange={(event) => setCreateTitle(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Workstream</label>
                    <input
                      value={createWorkstream}
                      onChange={(event) => setCreateWorkstream(event.target.value)}
                      list="timeline-create-workstream-options"
                      placeholder="Select or type workstream"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    />
                    <datalist id="timeline-create-workstream-options">
                      {timelineWorkstreamOptions.map((option) => (
                        <option key={option.value} value={option.label} />
                      ))}
                    </datalist>
                    {shouldOfferCreateWorkstream && createWorkstreamChoice ? (
                      <button
                        type="button"
                        onClick={() => setCreateWorkstream(createWorkstreamChoice.label)}
                        className="mt-2 text-xs font-semibold text-[#28439A] hover:text-[#1e3272]"
                      >
                        Create workstream: {createWorkstreamChoice.label}
                      </button>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Owner</label>
                    <select
                      value={createOwnerUserId}
                      onChange={(event) => setCreateOwnerUserId(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    >
                      <option value="">Unassigned</option>
                      {createOwnerOptions.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.name?.trim() || owner.email} — {owner.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
                      <DateField
                        value={createStartDate}
                        onChange={setCreateStartDate}
                        ariaLabel="Item start date"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Due/end date</label>
                      <DateField
                        value={createEndDate}
                        min={createStartDate || undefined}
                        onChange={setCreateEndDate}
                        ariaLabel="Item end date"
                        popoverClassName="right-0 left-auto"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70">
                    <button
                      type="button"
                      onClick={() => setIsCreateMoreDetailsOpen((current) => !current)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-700"
                      aria-expanded={isCreateMoreDetailsOpen}
                    >
                      <span>More details</span>
                      <span className="text-xs font-medium text-slate-500">
                        {isCreateMoreDetailsOpen ? "Hide" : "Show"}
                      </span>
                    </button>
                    {isCreateMoreDetailsOpen ? (
                      <div className="space-y-3 border-t border-slate-200 px-3 py-3">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Planning Stage</label>
                          <select
                            value={createPlanningStage}
                            onChange={(event) => setCreatePlanningStage(event.target.value as TimelinePlanningStage)}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                          >
                            {TIMELINE_PLANNING_STAGES.map((stage) => (
                              <option key={stage} value={stage}>
                                {PLANNING_STAGE_LABELS[stage]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                            <select
                              value={createStatus}
                              onChange={(event) => setCreateStatus(event.target.value as TimelineStatus)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                            >
                              {STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>
                                  {formatTimelineStatusLabel(status)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Progress (0–100%)</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={createStatus === "COMPLETE" ? "100" : createProgress}
                              onChange={(event) => setCreateProgress(event.target.value)}
                              disabled={createStatus === "COMPLETE"}
                              placeholder="Not tracked"
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-100"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Priority</label>
                            <select
                              value={createPriority}
                              onChange={(event) => setCreatePriority(event.target.value as TimelinePriority)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                            >
                              {PRIORITY_OPTIONS.map((priority) => (
                                <option key={priority} value={priority}>
                                  {formatTimelinePriorityLabel(priority)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={createIsCriticalPath}
                            onChange={(event) => setCreateIsCriticalPath(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Critical path
                        </label>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateRoadmapEntity()}
                disabled={!createEventId || isAdding}
                className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAdding ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isImportOpen ? (
        <SectionImportModalShell
          title="Import Roadmap"
          description="Upload CSV or Excel (.csv, .xlsx, .xls). Headers don't need to match exactly — pick a sheet, map your columns, and preview before importing."
          compact={!hasImportFileSelection}
          footer={
            <>
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={() => {
                  if (isImporting) return;
                  setIsImportOpen(false);
                  resetImportState();
                }}
                disabled={isImporting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
                onClick={() => void handleImportTimelineRows()}
                disabled={isImporting || validImportCount === 0 || importMappingErrors.length > 0}
              >
                {isImporting ? "Importing..." : `Import ${validImportCount} row${validImportCount === 1 ? "" : "s"}`}
              </button>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
              onClick={handleDownloadImportTemplate}
            >
              Download Template
            </button>
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-[#28439A] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#243d8e]">
              Choose File
              <input
                ref={importFileInputRef}
                type="file"
                accept={TIMELINE_IMPORT_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void handleImportFileSelected(file);
                }}
              />
            </label>
            {importFileName ? <span className="text-[13px] text-slate-600">{importFileName}</span> : null}
          </div>

          {!hasImportFileSelection ? (
            <p className="mt-3 text-[13px] text-slate-500">
              Start with a template or upload your roadmap file. We&apos;ll show sheet selection, mapping, and a preview after the file is loaded.
            </p>
          ) : (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
              {importHeaderError ? (
                <div className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                  {importHeaderError}
                </div>
              ) : null}

              {importWorkbook && importWorkbook.sheetNames.length > 1 ? (
                <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[12px] font-semibold text-slate-700">
                    This workbook has {importWorkbook.sheetNames.length} sheets. Choose the one to import:
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Only the selected sheet will be imported. To import another sheet, run a separate import.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {importWorkbook.sheets.map((sheet) => {
                      const isSelected = sheet.name === importSheetName;
                      const disabled = sheet.columns.length === 0;
                      return (
                        <button
                          key={sheet.name}
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSelectImportSheet(sheet.name)}
                          className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left text-[12px] transition ${
                            isSelected
                              ? "border-[#28439A] bg-white shadow-sm"
                              : "border-slate-300 bg-white hover:bg-slate-50"
                          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <span className="font-semibold text-slate-800">{sheet.name}</span>
                          <span className="text-[11px] text-slate-500">
                            {disabled ? "No columns" : `${sheet.rowCount} row${sheet.rowCount === 1 ? "" : "s"}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {importSheet ? (
                <div className="shrink-0 rounded-xl border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
                    <p className="text-[12px] font-semibold text-slate-700">
                      Map columns from “{importSheet.name}” to roadmap fields
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Item is required. When only an End Date is provided, it imports as a single-day roadmap item. Blank Status
                      defaults to Not Started and blank Priority defaults to Medium.
                    </p>
                    {importHasResponsiblePartyColumn ? (
                      <p className="mt-1 text-[11px] text-amber-700">
                        Responsible Party is matched to an event owner when possible; unmatched values import unassigned with a warning.
                      </p>
                    ) : null}
                    {importMonthColumns.length > 0 ? (
                      <p className="mt-1 text-[11px] text-amber-700">
                        Month is derived from the date and won&apos;t be imported.
                      </p>
                    ) : null}
                  </div>
                  <div className="max-h-44 overflow-auto px-4 py-3">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {importSheet.columns.map((column: ImportColumn) => (
                        <div key={column.id} className="rounded-lg border border-slate-200 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[12px] font-medium text-slate-800" title={column.header}>
                              {column.header}
                            </span>
                          </div>
                          {column.samples.length > 0 ? (
                            <p className="mt-0.5 truncate text-[11px] text-slate-400" title={column.samples.join(", ")}>
                              e.g. {column.samples.slice(0, 3).join(", ")}
                            </p>
                          ) : null}
                          <select
                            value={importMapping[column.id] ?? ""}
                            onChange={(event) =>
                              handleImportMappingChange(column.id, event.target.value as TimelineImportField | "")
                            }
                            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700"
                          >
                            {TIMELINE_IMPORT_FIELD_OPTIONS.map((option) => (
                              <option key={option.value || "none"} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                  {importMappingErrors.length > 0 ? (
                    <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-[12px] text-rose-700">
                      {importMappingErrors.join(" ")}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {importNeedsSheetPick ? (
                <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-[13px] text-slate-500">
                  Select a sheet above to map columns and preview rows.
                </div>
              ) : null}

              {importSheet ? (
                <>
                  <div className="shrink-0 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Rows</p>
                      <p className="text-[18px] font-semibold text-slate-900">{importRowsForPreview.length}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-700">Ready</p>
                      <p className="text-[18px] font-semibold text-emerald-800">{readyImportCount}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-amber-700">Ready with warnings</p>
                      <p className="text-[18px] font-semibold text-amber-800">{warningImportCount}</p>
                    </div>
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-rose-700">Invalid</p>
                      <p className="text-[18px] font-semibold text-rose-700">{invalidImportCount}</p>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200">
                    {importRowsForPreview.length > 50 ? (
                      <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                        Showing the first 50 of {importRowsForPreview.length} rows. All valid rows will import.
                      </p>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-auto">
                      <table className="w-full min-w-[680px] border-separate border-spacing-0">
                        <thead className="sticky top-0 z-10">
                          <tr className="border-b border-slate-200 bg-slate-50 text-left shadow-[0_1px_0_0_rgb(226_232_240)]">
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Row</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Item</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Workstream</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Stage</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Status</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Priority</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Start</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">End</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">CP</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Notes</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Row status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importRowsForPreview.slice(0, 50).map((row) => (
                            <tr key={row.rowNumber} className="border-b border-slate-100 last:border-b-0">
                              <td className="px-3 py-2 text-[12px] text-slate-600">{row.rowNumber}</td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.Item || "—"}</td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">
                                {row.normalized?.workstream
                                  ? formatTimelineEnumLabel(row.normalized.workstream)
                                  : row.raw.Workstream || "—"}
                              </td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">
                                {row.normalized?.planningStage
                                  ? formatTimelineEnumLabel(row.normalized.planningStage)
                                  : row.raw["Planning Stage"] || "—"}
                              </td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">
                                {row.normalized
                                  ? formatTimelineStatusLabel(row.normalized.status)
                                  : row.raw.Status || "Not Started (default)"}
                              </td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">
                                {row.normalized ? formatTimelinePriorityLabel(row.normalized.priority) : row.raw.Priority || "Medium (default)"}
                              </td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">
                                {row.normalized?.startDateIso ?? row.raw["Start Date"] ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">
                                {row.normalized?.endDateIso ?? row.raw["End Date"] ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">
                                {row.normalized?.isCriticalPath ? "Yes" : row.raw["Critical Path"] || "No"}
                              </td>
                              <td className="max-w-[260px] px-3 py-2 text-[12px] text-slate-700">
                                <span className="block truncate" title={row.normalized?.notes ?? row.raw.Notes ?? ""}>
                                  {row.normalized?.notes ?? row.raw.Notes ?? "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-[12px]">
                                {row.isValid && row.warnings.length > 0 ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">Ready with warnings</span>
                                ) : row.isValid ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                    Ready
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">
                                    Invalid
                                  </span>
                                )}
                                {row.errors.length > 0 ? (
                                  <p className="mt-1 text-[11px] text-rose-600">{row.errors.join(" ")}</p>
                                ) : null}
                                {row.warnings.length > 0 ? (
                                  <p className="mt-1 text-[11px] text-amber-700">{row.warnings.join(" ")}</p>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                          {importRowsForPreview.length === 0 ? (
                            <tr>
                              <td colSpan={11} className="px-4 py-8 text-center text-[13px] text-slate-500">
                                No rows to preview yet.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </SectionImportModalShell>
      ) : null}
    </EventModuleSurface>
  );
}
