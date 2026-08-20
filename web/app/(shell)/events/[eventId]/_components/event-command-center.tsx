"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Responsive, WidthProvider, type Layout, type Layouts } from "react-grid-layout";
import {
  DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS,
  DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS,
  DashboardEmptyState,
} from "@/components/dashboard-empty-state";
import { FEATURES } from "@/config/features";
import type { EventCommandCenterPayload } from "@/src/server/services/event-command-center";
import { DashboardWidgetFrame } from "./dashboard-widget-frame";
import { EventDashboardWidgetRenderer } from "./event-dashboard-widget-renderer";
import {
  buildInitialWidgetState,
  type EventDashboardWidgetState,
  type EventDashboardWidgetType,
} from "./event-command-center-widget-registry";
import {
  GRID_BREAKPOINTS,
  GRID_COLS,
  GRID_MARGIN,
  GRID_ROW_HEIGHT,
  buildResponsiveLayouts,
  buildSavedLayoutV2,
  layoutStorageKey,
  parseSavedLayoutV2,
  reconcileLayout,
  snapLayoutWidths,
  type SavedLayoutV2,
} from "./event-command-center-grid-layout";
import { EventCommandCenterThemeProvider } from "./event-command-center-theme";
import styles from "./event-command-center.module.css";

export type EventCommandCenterData = EventCommandCenterPayload;

const ResponsiveGridLayout = WidthProvider(Responsive);

/** Stable (non-CSS-module) class used as the RGL drag handle selector. */
const DRAG_HANDLE_CLASS = "dashboard-widget-drag-handle";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function formatEventDateRange(event: EventCommandCenterData["event"]): string {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  const start = formatter.format(new Date(event.startDate));
  const end = formatter.format(new Date(event.endDate));
  return start === end ? start : `${start} – ${end}`;
}

const PHASE_LABELS: Record<EventCommandCenterData["event"]["phase"], string> = {
  planning: "Planning",
  preEvent: "Pre-event",
  onsite: "Onsite",
};

function eventDashboardHasMeaningfulData(data: EventCommandCenterData): boolean {
  const { event, capabilities } = data;

  return (
    Object.values(capabilities).some(Boolean) ||
    event.notifications.length > 0 ||
    event.activity.length > 0 ||
    event.deadlines.length > 0 ||
    event.approvals.length > 0 ||
    event.financial.forecast !== 0 ||
    event.financial.actual !== 0 ||
    event.financial.categories.length > 0 ||
    event.registration.hasData ||
    event.housing.hasData ||
    event.sponsors.hasData ||
    event.speakers.totalSpeakers > 0 ||
    (FEATURES.ENABLE_GENERIC_TASKING_UI && event.speakers.tasksPending > 0) ||
    event.KPIs.conflicts > 0 ||
    event.KPIs.approvals > 0 ||
    event.KPIs.overdueItems > 0 ||
    (event.operations.runOfShow?.totalSegments ?? 0) > 0 ||
    event.operations.fnbStatus.hasData === true ||
    event.operations.staffingStatus.hasData === true ||
    event.operations.avStatus.hasData === true ||
    event.operations.roomStatus.set > 0 ||
    event.operations.roomStatus.pending > 0 ||
    event.operations.roomStatus.conflicts > 0
  );
}

function widgetLabel(widgetId: EventDashboardWidgetType, widgets: EventDashboardWidgetState[]): string {
  return widgets.find((widget) => widget.id === widgetId)?.title ?? widgetId;
}

function groupWidgets(widgets: EventDashboardWidgetState[], search: string) {
  const query = search.trim().toLowerCase();
  const groups = new Map<string, EventDashboardWidgetState[]>();

  for (const widget of widgets) {
    if (
      query &&
      !widget.title.toLowerCase().includes(query) &&
      !widget.description.toLowerCase().includes(query) &&
      !widget.category.toLowerCase().includes(query)
    ) {
      continue;
    }

    groups.set(widget.category, [...(groups.get(widget.category) ?? []), widget]);
  }

  return Array.from(groups, ([category, categoryWidgets]) => ({
    category,
    widgets: categoryWidgets,
  }));
}

const LAYOUT_STORAGE_EVENT = "planner:event-cc-layout-change";

function buildKpiPresentationLayout(layout: Layout[], canvasWidth: number | null): Layout[] {
  if (canvasWidth === null || canvasWidth > 720) return layout;
  const kpiItem = layout.find((item) => item.i === "kpi-row");
  if (!kpiItem) return layout;
  const targetHeight = canvasWidth >= 480 ? 5 : 10;
  if (targetHeight <= kpiItem.h) return layout;
  const delta = targetHeight - kpiItem.h;
  const firstRowBelowKpis = kpiItem.y + kpiItem.h;
  return layout.map((item) => {
    if (item.i === kpiItem.i) return { ...item, h: targetHeight };
    return item.y >= firstRowBelowKpis ? { ...item, y: item.y + delta } : item;
  });
}

// Cache parsed snapshots so getSnapshot returns a stable reference until the
// underlying localStorage string actually changes (required by useSyncExternalStore).
const layoutSnapshotCache = new Map<string, { raw: string | null; value: SavedLayoutV2 | null }>();

function getServerLayoutSnapshot(): SavedLayoutV2 | null {
  return null;
}

function getClientLayoutSnapshot(eventId: string, phase: string): SavedLayoutV2 | null {
  if (typeof window === "undefined") return null;
  const key = layoutStorageKey(eventId, phase);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  const cached = layoutSnapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.value;
  const value = parseSavedLayoutV2(raw);
  layoutSnapshotCache.set(key, { raw, value });
  return value;
}

function subscribeLayout(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LAYOUT_STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LAYOUT_STORAGE_EVENT, onStoreChange);
  };
}

function persistSavedLayout(eventId: string, phase: string, saved: SavedLayoutV2): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(layoutStorageKey(eventId, phase), JSON.stringify(saved));
    window.dispatchEvent(new Event(LAYOUT_STORAGE_EVENT));
  } catch {
    /* storage may be unavailable or full — fail silently */
  }
}

function clearPersistedLayout(eventId: string, phase: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(layoutStorageKey(eventId, phase));
    window.dispatchEvent(new Event(LAYOUT_STORAGE_EVENT));
  } catch {
    /* ignore */
  }
}

function DashboardDrawer({
  widgets,
  visibleWidgets,
  widgetSearch,
  addedWidgetLabel,
  drawerTab,
  panelRef,
  closeButtonRef,
  onClose,
  onTabChange,
  onSearchChange,
  onAddWidget,
  onToggleWidget,
  onReset,
}: {
  widgets: EventDashboardWidgetState[];
  visibleWidgets: EventDashboardWidgetState[];
  widgetSearch: string;
  addedWidgetLabel: string;
  drawerTab: "dashboard" | "widgets";
  panelRef: React.RefObject<HTMLElement | null>;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onTabChange: (tab: "dashboard" | "widgets") => void;
  onSearchChange: (value: string) => void;
  onAddWidget: (widgetId: EventDashboardWidgetType) => void;
  onToggleWidget: (widgetId: EventDashboardWidgetType) => void;
  onReset: () => void;
}) {
  const widgetLibraryGroups = useMemo(() => groupWidgets(widgets, widgetSearch), [widgetSearch, widgets]);

  return (
    <div className={styles.customizeOverlay}>
      <div className={styles.overlayScrim} aria-hidden />
      <aside
        className={styles.customizePanel}
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="customize-title"
      >
        <div className={styles.customizeHeader}>
          <div>
            <h2 id="customize-title" className={styles.sectionTitle}>Manage Widgets</h2>
            <p className={styles.drawerIntro}>Show or hide widgets. Drag and resize them on the dashboard.</p>
            <p className={styles.sessionNote}>Your layout is saved automatically on this device.</p>
          </div>
          <button type="button" ref={closeButtonRef} className={styles.iconButton} aria-label="Close customization controls" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className={styles.drawerBody}>
        <div className={styles.drawerTabs} role="tablist" aria-label="Customize dashboard sections">
          <button type="button" role="tab" aria-selected={drawerTab === "dashboard"} className={drawerTab === "dashboard" ? styles.drawerTabActive : undefined} onClick={() => onTabChange("dashboard")}>
            My Dashboard
          </button>
          <button type="button" role="tab" aria-selected={drawerTab === "widgets"} className={drawerTab === "widgets" ? styles.drawerTabActive : undefined} onClick={() => onTabChange("widgets")}>
            All Widgets
          </button>
        </div>

        {addedWidgetLabel ? <p className={styles.drawerStatusMessage} role="status">{addedWidgetLabel}</p> : null}

        {drawerTab === "dashboard" ? (
          <section className={styles.customizeSection} aria-labelledby="current-widgets-title" role="tabpanel">
            <h3 id="current-widgets-title">Visible widgets</h3>
            {visibleWidgets.length === 0 ? (
              <div className={styles.emptyCanvas}>
                <p>No widgets are visible.</p>
                <button type="button" className={styles.primaryButton} onClick={onReset}>Reset to Default</button>
              </div>
            ) : (
              <ul className={styles.dashboardWidgetList}>
                {visibleWidgets.map((widget) => (
                  <li key={widget.id} className={styles.dashboardWidgetRow}>
                    <button
                      type="button"
                      className={styles.widgetIconButton}
                      aria-label={widget.required ? `${widget.title} is always visible` : `Hide ${widget.title}`}
                      onClick={() => onToggleWidget(widget.id)}
                      disabled={widget.required}
                      title={widget.required ? "Required widget" : undefined}
                    >
                      <Eye className="h-4 w-4" aria-hidden />
                    </button>
                    <span className={styles.dashboardWidgetCopy}>
                      <strong>{widget.title}</strong>
                      {widget.required ? <small>Always visible</small> : <small>{widget.category}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            <label className={styles.widgetSearch}>
              <span className={styles.srOnly}>Search widgets</span>
              <input value={widgetSearch} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search widgets" />
            </label>

            <section className={styles.customizeSection} aria-labelledby="widget-library-title" role="tabpanel">
              <h3 id="widget-library-title">All widgets</h3>
              {widgetLibraryGroups.map((group) => {
                if (group.widgets.length === 0) return null;
                return (
                  <div className={styles.librarySection} key={group.category}>
                    <p>{group.category} ({group.widgets.length})</p>
                    {group.widgets.map((widget) => {
                      const disabledReason = widget.disabledReason;
                      return (
                        <div
                          key={widget.id}
                          className={cx(styles.libraryButton, disabledReason && styles.libraryButtonDisabled)}
                          aria-disabled={Boolean(disabledReason)}
                        >
                          <span>
                            <strong>{widget.title}</strong>
                            <em>Preview: {widget.description}</em>
                            <small>{disabledReason ?? (widget.visible ? "Already added" : "Hidden")}</small>
                          </span>
                          {widget.visible ? (
                            <span className={styles.addedBadge}>
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                              Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={styles.addWidgetButton}
                              aria-label={disabledReason ? `${widget.title} unavailable: ${disabledReason}` : `Add ${widget.title} widget`}
                              disabled={Boolean(disabledReason)}
                              onClick={() => onAddWidget(widget.id)}
                            >
                              {disabledReason ? <EyeOff className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          </>
        )}
        </div>

        <div className={styles.drawerFooter}>
          <button type="button" className={styles.resetLayoutButton} aria-label="Reset dashboard widget layout" onClick={onReset}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reset to Default
          </button>
          <button type="button" className={styles.primaryButton} onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </div>
  );
}

function EventCommandCenterInner({ data }: { data: EventCommandCenterData }) {
  const searchParams = useSearchParams();
  const onboardingKey = `planner:event-onboarding-dismissed:${data.event.id}`;
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const wasJustCreated = searchParams.get("created") === "1";
  useEffect(() => {
    setOnboardingDismissed(window.localStorage.getItem(onboardingKey) === "true");
  }, [onboardingKey]);
  const dismissOnboarding = useCallback(() => {
    window.localStorage.setItem(onboardingKey, "true");
    setOnboardingDismissed(true);
  }, [onboardingKey]);
  const [isEditing, setIsEditing] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"dashboard" | "widgets">("dashboard");
  const [widgetSearch, setWidgetSearch] = useState("");
  const [addedWidgetLabel, setAddedWidgetLabel] = useState("");
  const customizeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const customizePanelRef = useRef<HTMLElement | null>(null);
  const customizeCloseRef = useRef<HTMLButtonElement | null>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const pendingScrollWidgetRef = useRef<EventDashboardWidgetType | null>(null);

  // WidthProvider only remeasures on window 'resize'. Toggling the side nav
  // changes the canvas width via CSS (no window resize), which would leave RGL on
  // a stale width/breakpoint. Observe the canvas and dispatch a synthetic resize
  // so RGL remeasures cleanly — this preserves the saved layout (no remount).
  useEffect(() => {
    const element = canvasRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    let lastWidth = element.getBoundingClientRect().width;
    setCanvasWidth(lastWidth);
    const observer = new ResizeObserver(() => {
      const width = element.getBoundingClientRect().width;
      if (Math.abs(width - lastWidth) < 1) return;
      lastWidth = width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setCanvasWidth(width);
        window.dispatchEvent(new Event("resize"));
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // The saved layout lives in the browser (per event + phase) and survives reloads.
  // It is the single source of truth for customizations; widget mutations write to it.
  const savedLayout = useSyncExternalStore(
    subscribeLayout,
    () => getClientLayoutSnapshot(data.event.id, data.event.phase),
    getServerLayoutSnapshot,
  );
  const baseWidgets = useMemo(
    () => buildInitialWidgetState(data.capabilities, data.event.phase),
    [data.capabilities, data.event.phase],
  );
  const { widgets, layout } = useMemo(
    () => reconcileLayout(savedLayout, baseWidgets),
    [savedLayout, baseWidgets],
  );

  const visibleWidgets = useMemo(
    () => widgets.filter((widget) => widget.visible).sort((a, b) => a.order - b.order),
    [widgets],
  );
  // Share one canonical desktop layout across lg + md so opening/closing the side
  // nav (which only changes container width) never reflows the desktop arrangement.
  const presentationLayout = useMemo(
    () => (isEditing ? layout : buildKpiPresentationLayout(layout, canvasWidth)),
    [canvasWidth, isEditing, layout],
  );
  const gridLayouts = useMemo<Layouts>(() => buildResponsiveLayouts(presentationLayout) as Layouts, [presentationLayout]);

  const eventDateRange = useMemo(() => formatEventDateRange(data.event), [data.event]);
  const hasDashboardData = useMemo(() => eventDashboardHasMeaningfulData(data), [data]);

  useEffect(() => {
    const widgetId = pendingScrollWidgetRef.current;
    if (!widgetId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const widget = canvas.querySelector<HTMLElement>(`[data-widget-id="${widgetId}"]`);
    if (!widget) return;
    pendingScrollWidgetRef.current = null;
    window.requestAnimationFrame(() => {
      widget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  }, [layout, visibleWidgets]);

  const commit = useCallback(
    (nextWidgets: EventDashboardWidgetState[], nextLayout: Layout[]) => {
      persistSavedLayout(data.event.id, data.event.phase, buildSavedLayoutV2(nextWidgets, nextLayout));
    },
    [data.event.id, data.event.phase],
  );

  // Persist only on gesture END (drag/resize stop), never on every onLayoutChange
  // tick — committing mid-gesture would re-render RGL with the reconciled layout
  // and fight the in-progress drag. Widths are snapped to allowed values (12/6/4)
  // before saving so an in-progress resize can never persist an arbitrary width.
  const handleDragStop = useCallback(
    (current: Layout[]) => {
      if (!isEditing) return;
      commit(widgets, snapLayoutWidths(current));
    },
    [commit, isEditing, widgets],
  );

  const handleResizeStop = useCallback(
    (current: Layout[]) => {
      if (!isEditing) return;
      commit(widgets, snapLayoutWidths(current));
    },
    [commit, isEditing, widgets],
  );

  function enterEditMode() {
    setIsEditing(true);
    setAddedWidgetLabel("");
  }

  function exitEditMode() {
    setIsEditing(false);
    setCustomizeOpen(false);
  }

  const closeCustomize = useCallback(() => {
    setCustomizeOpen(false);
    window.requestAnimationFrame(() => {
      (focusReturnRef.current ?? customizeTriggerRef.current)?.focus();
    });
  }, []);

  function openCustomize() {
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : customizeTriggerRef.current;
    setCustomizeOpen(true);
    window.requestAnimationFrame(() => customizeCloseRef.current?.focus());
  }

  function addWidget(widgetId: EventDashboardWidgetType) {
    const target = widgets.find((widget) => widget.id === widgetId);
    if (!target || !target.available || target.visible) return;
    setAddedWidgetLabel(`${widgetLabel(widgetId, widgets)} added to your dashboard.`);
    pendingScrollWidgetRef.current = widgetId;
    const next = widgets.map((widget) =>
      widget.id === widgetId ? { ...widget, visible: true } : widget,
    );
    // Keep current geometry; reconcile seeds a position for the newly visible widget.
    commit(next, layout);
  }

  function toggleWidgetVisibility(widgetId: EventDashboardWidgetType) {
    const target = widgets.find((widget) => widget.id === widgetId);
    if (!target || target.required) return; // required widgets can never be hidden
    const nextVisible = !target.visible;
    const next = widgets.map((widget) =>
      widget.id === widgetId ? { ...widget, visible: nextVisible } : widget,
    );
    const nextLayout = nextVisible ? layout : layout.filter((item) => item.i !== widgetId);
    commit(next, nextLayout);
    setAddedWidgetLabel("");
  }

  function removeWidget(widgetId: EventDashboardWidgetType) {
    const target = widgets.find((widget) => widget.id === widgetId);
    if (!target || target.required) return;
    commit(
      widgets.map((widget) => (widget.id === widgetId ? { ...widget, visible: false } : widget)),
      layout.filter((item) => item.i !== widgetId),
    );
  }

  function resetWidgets() {
    clearPersistedLayout(data.event.id, data.event.phase);
    setDrawerTab("dashboard");
    setAddedWidgetLabel(`Dashboard reset to the default ${PHASE_LABELS[data.event.phase]} layout.`);
  }

  function handleShellKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!customizeOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeCustomize();
      return;
    }

    if (event.key !== "Tab" || !customizePanelRef.current) return;
    const focusable = Array.from(
      customizePanelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);

    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <EventCommandCenterThemeProvider>
      <div className={styles.page} onKeyDown={handleShellKeyDown}>
        <div className={styles.inner}>
          <header className={styles.commandHeader}>
            <div className="min-w-0">
              <h1 className={styles.commandTitle}>{data.event.name}</h1>
              <p className={styles.commandDateRange}>{eventDateRange}</p>
            </div>
            <div className={styles.commandActions} aria-label="Command center actions">
              {FEATURES.ENABLE_GENERIC_TASKING_UI ? (
                <Link href={data.links.timeline} className={styles.primaryButton}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Create Task
                </Link>
              ) : null}
              {hasDashboardData ? (
                <button
                  type="button"
                  ref={customizeTriggerRef}
                  className={cx(styles.iconButton, isEditing && styles.iconButtonActive)}
                  aria-label={isEditing ? "Exit dashboard editing" : "Customize dashboard"}
                  aria-pressed={isEditing}
                  title={isEditing ? "Exit editing" : "Customize dashboard"}
                  onClick={() => (isEditing ? exitEditMode() : enterEditMode())}
                >
                  <Settings2 className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
          </header>

          {data.dataQuality.unavailableSources.length > 0 ? (
            <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
              Some event status sources are unavailable ({data.dataQuality.unavailableSources.join(", ")}). The affected summaries may be incomplete; retry the page to refresh them.
            </div>
          ) : null}

          {wasJustCreated && !onboardingDismissed ? (
            <aside data-testid="event-first-time-guidance" className="mb-4 rounded-xl border border-blue-200 bg-blue-50/70 p-4" aria-label="New event guidance">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">Event created — start building your plan.</p>
                  <p className="mt-1 text-[13px] text-slate-600">Begin with the Run of Show, then fill in the operational detail around it.</p>
                </div>
                <button type="button" onClick={dismissOnboarding} className="text-[12px] font-semibold text-[#28439A] hover:underline">Dismiss</button>
              </div>
              <ul className="mt-3 grid gap-2 text-[12px] text-slate-700 sm:grid-cols-2">
                <li><Link className="font-semibold text-[#28439A] hover:underline" href={data.links.runOfShow}>Set up or import the Run of Show</Link></li>
                <li>Review key sessions and functions as they take shape.</li>
                <li>Add speakers, staffing, F&amp;B, and budget where they apply.</li>
                <li>{data.capabilities.hasTaskData ? <Link className="font-semibold text-[#28439A] hover:underline" href={data.links.timeline}>Review Roadmap and critical-path signals</Link> : "Critical-path guidance will be available after Roadmap items are added or imported."}</li>
              </ul>
              {searchParams.get("docsUpload") === "retry" ? <p className="mt-3 text-[12px] text-amber-800">The event was created, but one or more additional documents need to be uploaded again from Docs Hub.</p> : null}
            </aside>
          ) : null}

          {isEditing && hasDashboardData ? (
            <div className={styles.editToolbar} role="region" aria-label="Dashboard editing controls">
              <div className={styles.editToolbarCopy}>
                <strong>Editing dashboard</strong>
                <span>Drag to move, pull the corner to resize. Changes save automatically.</span>
              </div>
              <div className={styles.editToolbarActions}>
                <button type="button" className={styles.secondaryButton} onClick={openCustomize}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add or hide widgets
                </button>
                <button type="button" className={styles.secondaryButton} onClick={resetWidgets}>
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Reset layout
                </button>
                <button type="button" className={styles.primaryButton} onClick={exitEditMode}>
                  Done
                </button>
              </div>
            </div>
          ) : null}

          {hasDashboardData ? (
            <section
              ref={canvasRef}
              className={cx(styles.widgetCanvas, isEditing && styles.widgetCanvasEditing)}
              aria-label="Event dashboard widgets"
            >
              <ResponsiveGridLayout
                className="layout"
                layouts={gridLayouts}
                breakpoints={GRID_BREAKPOINTS}
                cols={GRID_COLS}
                rowHeight={GRID_ROW_HEIGHT}
                margin={GRID_MARGIN}
                isDraggable={isEditing}
                isResizable={isEditing}
                resizeHandles={["se", "e"]}
                draggableHandle={`.${DRAG_HANDLE_CLASS}`}
                compactType="vertical"
                measureBeforeMount={false}
                useCSSTransforms
                onDragStop={handleDragStop}
                onResizeStop={handleResizeStop}
              >
                {visibleWidgets.map((widget) => (
                  <div key={widget.id} className={styles.gridItem} data-widget-id={widget.id}>
                    <DashboardWidgetFrame
                      widget={widget}
                      editing={isEditing}
                      dragHandleClassName={DRAG_HANDLE_CLASS}
                      onRemove={removeWidget}
                    >
                      <EventDashboardWidgetRenderer widget={widget} data={data} />
                    </DashboardWidgetFrame>
                  </div>
                ))}
              </ResponsiveGridLayout>
            </section>
          ) : (
            <DashboardEmptyState
              title="No data yet"
              description="Once you add planning data, this dashboard will summarize what needs attention across your event. Start by importing planning files or adding your first Run of Show session, budget item, or roadmap item."
              icon={<Plus className="h-6 w-6" aria-hidden />}
              bullets={["Run of Show, Budget, and Roadmap health", "Conflicts, deadlines, approvals, and activity"]}
              primaryAction={
                <Link href="/events/new?method=workbook" className={DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Import planning files
                </Link>
              }
              secondaryAction={
                <Link href={data.links.runOfShow} className={DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS}>
                  Add manually
                </Link>
              }
            />
          )}

          {customizeOpen && hasDashboardData ? (
            <DashboardDrawer
              widgets={widgets}
              visibleWidgets={visibleWidgets}
              widgetSearch={widgetSearch}
              addedWidgetLabel={addedWidgetLabel}
              drawerTab={drawerTab}
              panelRef={customizePanelRef}
              closeButtonRef={customizeCloseRef}
              onClose={closeCustomize}
              onTabChange={setDrawerTab}
              onSearchChange={setWidgetSearch}
              onAddWidget={addWidget}
              onToggleWidget={toggleWidgetVisibility}
              onReset={resetWidgets}
            />
          ) : null}
        </div>
      </div>
    </EventCommandCenterThemeProvider>
  );
}

export function EventCommandCenter({ data }: { data: EventCommandCenterData }) {
  return <EventCommandCenterInner key={data.event.id} data={data} />;
}
