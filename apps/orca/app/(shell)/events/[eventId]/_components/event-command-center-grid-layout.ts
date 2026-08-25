// Pure helpers for the React-Grid-Layout dashboard canvas.
//
// No DOM, no React, no Prisma — so the geometry/reconcile rules are unit-tested
// without rendering. The event dashboard stores a per-event + per-phase layout in
// localStorage under a v2 key. Geometry (x/y/w/h) is kept separate from
// visibility; the widget registry (capabilities + phase + required) remains the
// source of truth for what may appear.
//
// Product rule: widget WIDTHS may only resolve to 12 (full), 6 (half), or 4
// (third). Every widget has a sizing contract (default width/height, allowed
// widths, min/max height, resizability). Saved layouts are reconciled through
// the contract so arbitrary widths (5/7/8/9…) can never persist or render.

import type { Layout } from "react-grid-layout";
import type {
  EventDashboardWidgetState,
  EventDashboardWidgetType,
} from "./event-command-center-widget-registry";

export const LAYOUT_STORAGE_VERSION = "v2";

// Responsive breakpoints (px) and column counts for the dashboard grid.
//
// IMPORTANT: RGL/WidthProvider measures the GRID CONTAINER width, not the
// viewport. Expanding the app side nav narrows the container, so the 12-column
// desktop range must extend low enough that a normal desktop with the nav open
// still resolves to 12 cols. Both `lg` and `md` are 12 cols (a single canonical
// desktop layout); only genuine tablet/phone container widths drop to 6/4 cols.
//
//   lg: >= 1024px container -> 12 cols (wide desktop / collapsed nav)
//   md: 640-1023px container -> 12 cols (desktop with nav open / small laptop)
//   sm: 480-639px container  -> 6 cols  (tablet)
//   xs: < 480px container    -> 4 cols  (phone)
export const GRID_BREAKPOINTS = { lg: 1024, md: 640, sm: 480, xs: 0 } as const;
export const GRID_COLS = { lg: 12, md: 12, sm: 6, xs: 4 } as const;
export const GRID_ROW_HEIGHT = 56;
export const GRID_MARGIN: [number, number] = [16, 16];

export type GridBreakpoint = keyof typeof GRID_BREAKPOINTS;
/** The breakpoint we persist + seed against; smaller ones are derived by RGL. */
export const PRIMARY_BREAKPOINT: GridBreakpoint = "lg";
const PRIMARY_COLS = GRID_COLS[PRIMARY_BREAKPOINT];

/**
 * Desktop breakpoints that share ONE canonical 12-column layout. We feed the
 * same layout array to both so crossing the lg/md threshold (e.g. when the side
 * nav opens) never reflows or auto-generates staggered positions.
 */
export const DESKTOP_BREAKPOINTS: GridBreakpoint[] = ["lg", "md"];

/** Resolve which breakpoint a container width maps to (mirrors RGL's rule). */
export function resolveBreakpoint(width: number): GridBreakpoint {
  const ordered = (Object.keys(GRID_BREAKPOINTS) as GridBreakpoint[]).sort(
    (a, b) => GRID_BREAKPOINTS[b] - GRID_BREAKPOINTS[a],
  );
  for (const bp of ordered) {
    if (width >= GRID_BREAKPOINTS[bp]) return bp;
  }
  return ordered[ordered.length - 1];
}

/** Column count for a given container width. */
export function colsForWidth(width: number): number {
  return GRID_COLS[resolveBreakpoint(width)];
}

/**
 * Build the `layouts` map for RGL. The single canonical desktop layout is shared
 * across all desktop breakpoints (lg + md) so the nav open/closed and desktop
 * resizes never produce a different desktop arrangement. Tablet/phone layouts
 * are derived as full-width stacks and are never persisted.
 */
export function buildResponsiveLayouts(layout: Layout[]): Partial<Record<GridBreakpoint, Layout[]>> {
  const layouts: Partial<Record<GridBreakpoint, Layout[]>> = {};
  for (const bp of DESKTOP_BREAKPOINTS) {
    layouts[bp] = layout;
  }
  for (const bp of ["sm", "xs"] as const) {
    const columns = GRID_COLS[bp];
    let y = 0;
    layouts[bp] = [...layout]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((item) => {
        const h = item.i === "kpi-row" ? (bp === "xs" ? 5 : 4) : item.h;
        const stacked = {
          ...item,
          x: 0,
          y,
          w: columns,
          h,
          minW: columns,
          maxW: columns,
        };
        y += h;
        return stacked;
      });
  }
  return layouts;
}

/** The only widths a widget may resolve to. */
export const ALLOWED_WIDTHS = [4, 6, 12] as const;
export type AllowedWidth = (typeof ALLOWED_WIDTHS)[number];

export type WidgetSizingFamily =
  | "pinnedFull"
  | "largeList"
  | "financialSummary"
  | "opsSummary"
  | "compact"
  | "externalDataComposite"
  | "externalPlaceholder";

export type WidgetSizingContract = {
  family: WidgetSizingFamily;
  defaultW: AllowedWidth;
  allowedWidths: AllowedWidth[];
  defaultH: number;
  minH: number;
  maxH?: number;
  /** Whether the widget can be resized at all (width or height). */
  resizable: boolean;
};

/**
 * Per-widget sizing contract. Lives here (not the registry) so the registry
 * stays a pure content/capability description. Families intentionally override a
 * widget's registry `size` where content density demands it (e.g. budget overview
 * and upcoming deadlines default to 6 despite a registry "third").
 */
export const WIDGET_SIZING_CONTRACTS: Record<EventDashboardWidgetType, WidgetSizingContract> = {
  "kpi-row": { family: "pinnedFull", defaultW: 12, allowedWidths: [12], defaultH: 2, minH: 2, maxH: 3, resizable: false },
  "needs-you": { family: "largeList", defaultW: 12, allowedWidths: [6, 12], defaultH: 6, minH: 4, resizable: true },
  "planner-focus": { family: "largeList", defaultW: 4, allowedWidths: [4, 6, 12], defaultH: 6, minH: 4, resizable: true },
  "activity-feed": { family: "largeList", defaultW: 6, allowedWidths: [6, 12], defaultH: 6, minH: 4, resizable: true },
  // Second default row packs three thirds across one desktop row.
  "conflicts-details": { family: "largeList", defaultW: 4, allowedWidths: [4, 6, 12], defaultH: 6, minH: 4, resizable: true },
  "financial-summary": { family: "financialSummary", defaultW: 6, allowedWidths: [6, 12], defaultH: 6, minH: 5, resizable: true },
  // Fourth default row: Registration & Housing spans full width on its own.
  "registration-housing": { family: "externalDataComposite", defaultW: 12, allowedWidths: [6, 12], defaultH: 6, minH: 4, resizable: true },
  "upcoming-deadlines": { family: "largeList", defaultW: 4, allowedWidths: [4, 6, 12], defaultH: 6, minH: 4, resizable: true },
  // Third default row pairs Financial Exposure + Roadmap Progress as halves.
  "event-budget-overview": { family: "financialSummary", defaultW: 6, allowedWidths: [4, 6], defaultH: 6, minH: 5, resizable: true },
  "run-of-show": { family: "opsSummary", defaultW: 4, allowedWidths: [4, 6], defaultH: 5, minH: 3, resizable: true },
  "fnb-status": { family: "opsSummary", defaultW: 4, allowedWidths: [4, 6], defaultH: 5, minH: 3, resizable: true },
  "av-production": { family: "opsSummary", defaultW: 4, allowedWidths: [4, 6], defaultH: 5, minH: 3, resizable: true },
  "staffing-overview": { family: "opsSummary", defaultW: 4, allowedWidths: [4, 6], defaultH: 5, minH: 3, resizable: true },
  "staffing-coverage": { family: "opsSummary", defaultW: 4, allowedWidths: [4, 6], defaultH: 5, minH: 3, resizable: true },
  "speaker-readiness": { family: "compact", defaultW: 4, allowedWidths: [4, 6], defaultH: 5, minH: 3, resizable: true },
  "session-readiness": { family: "compact", defaultW: 4, allowedWidths: [4, 6], defaultH: 5, minH: 3, resizable: true },
  "run-of-show-readiness": { family: "largeList", defaultW: 6, allowedWidths: [6, 12], defaultH: 6, minH: 4, resizable: true },
  "event-snapshot": { family: "compact", defaultW: 4, allowedWidths: [4, 6], defaultH: 5, minH: 3, resizable: true },
  // Readiness Dashboard is a compact operational summary, but can widen.
  "readiness-dashboard": { family: "compact", defaultW: 4, allowedWidths: [4, 6, 12], defaultH: 5, minH: 3, resizable: true },
  // Roadmap Progress sits beside Financial Exposure in the third default row as a
  // half-width card, but stays resizable up to full width.
  "roadmap-progress": { family: "largeList", defaultW: 6, allowedWidths: [6, 12], defaultH: 6, minH: 3, resizable: true },
  "task-summary": { family: "compact", defaultW: 4, allowedWidths: [4, 6], defaultH: 5, minH: 3, resizable: true },
  "approval-center": { family: "largeList", defaultW: 6, allowedWidths: [6, 12], defaultH: 6, minH: 4, resizable: true },
  "executive-briefing": { family: "largeList", defaultW: 6, allowedWidths: [6, 12], defaultH: 6, minH: 4, resizable: true },
  "weather-forecast": { family: "externalPlaceholder", defaultW: 4, allowedWidths: [4], defaultH: 4, minH: 3, maxH: 4, resizable: false },
  "vendor-status": { family: "externalPlaceholder", defaultW: 4, allowedWidths: [4], defaultH: 4, minH: 3, maxH: 4, resizable: false },
};

const DEFAULT_SIZING_CONTRACT: WidgetSizingContract = {
  family: "compact",
  defaultW: 4,
  allowedWidths: [4, 6],
  defaultH: 5,
  minH: 3,
  resizable: true,
};

/** Sizing contract for a widget id (falls back to a safe compact contract). */
export function getWidgetSizingContract(widgetId: string): WidgetSizingContract {
  return WIDGET_SIZING_CONTRACTS[widgetId as EventDashboardWidgetType] ?? DEFAULT_SIZING_CONTRACT;
}

/**
 * Snap an arbitrary width to the nearest allowed width. The result is always one
 * of the contract's allowed widths (a subset of {4, 6, 12}); ties prefer the
 * larger width so a resize never silently shrinks past the midpoint.
 */
export function snapWidthToAllowed(width: number, allowedWidths: number[]): number {
  if (allowedWidths.length === 0) return 4;
  const target = Number.isFinite(width) ? width : allowedWidths[0];
  let best = allowedWidths[0];
  let bestDistance = Infinity;
  for (const candidate of allowedWidths) {
    const distance = Math.abs(candidate - target);
    if (distance < bestDistance || (distance === bestDistance && candidate > best)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Persisted localStorage shape (geometry separate from visibility). */
export type SavedLayoutV2 = {
  version: typeof LAYOUT_STORAGE_VERSION;
  visible: Partial<Record<EventDashboardWidgetType, boolean>>;
  layouts: Partial<Record<GridBreakpoint, Layout[]>>;
};

export type ReconciledLayout = {
  /** Registry widget states with visibility reconciled against saved + rules. */
  widgets: EventDashboardWidgetState[];
  /** RGL layout for the primary breakpoint, only for visible widgets. */
  layout: Layout[];
};

export function layoutStorageKey(eventId: string, phase: string): string {
  return `planner-os:event-cc-layout:${LAYOUT_STORAGE_VERSION}:${eventId}:${phase}`;
}

/**
 * Build a contract-compliant RGL item for a widget. Width is snapped to an
 * allowed value, min/max width come from the allowed set (equal when only one is
 * allowed), height is clamped to [minH, maxH], and non-resizable widgets are
 * locked. KPI row therefore always resolves to w=12, minW=maxW=12.
 */
function contractItem(
  widgetId: EventDashboardWidgetType,
  position: { x: number; y: number },
  saved?: { w?: number; h?: number },
): Layout {
  const contract = getWidgetSizingContract(widgetId);
  const allowed = contract.allowedWidths;
  const w = snapWidthToAllowed(saved?.w ?? contract.defaultW, allowed);
  const minW = Math.min(...allowed);
  const maxW = Math.max(...allowed);

  let h = Number.isFinite(saved?.h) ? Math.round(saved!.h as number) : contract.defaultH;
  h = Math.max(contract.minH, h);
  if (typeof contract.maxH === "number") h = Math.min(contract.maxH, h);

  const x = Math.max(0, Math.min(PRIMARY_COLS - w, Number.isFinite(position.x) ? Math.round(position.x) : 0));
  const y = Math.max(0, Number.isFinite(position.y) ? Math.round(position.y) : 0);

  const item: Layout = { i: widgetId, x, y, w, h, minW, maxW, minH: contract.minH };
  if (typeof contract.maxH === "number") item.maxH = contract.maxH;
  // Only force isResizable=false (locked); resizable widgets inherit the grid's
  // edit-mode flag so handles never appear in normal mode.
  if (!contract.resizable) item.isResizable = false;
  return item;
}

/**
 * Generate a packed default layout from visible widget states, left-to-right
 * within the primary column count using contract default widths, wrapping to new
 * rows. RGL vertical compaction tidies the result.
 */
export function generateDefaultLayout(widgets: EventDashboardWidgetState[]): Layout[] {
  const visible = widgets.filter((widget) => widget.visible).sort((a, b) => a.order - b.order);

  const layout: Layout[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const widget of visible) {
    const contract = getWidgetSizingContract(widget.id);
    const width = contract.defaultW;
    if (cursorX + width > PRIMARY_COLS) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    const item = contractItem(widget.id, { x: cursorX, y: cursorY });
    layout.push(item);
    cursorX += width;
    rowHeight = Math.max(rowHeight, item.h);
  }

  return layout;
}

function sanitizeLayoutItem(value: unknown): Layout | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.i !== "string" || item.i.length === 0) return null;

  const x = Number(item.x);
  const y = Number(item.y);
  const w = Number(item.w);
  const h = Number(item.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;

  // Basic clamp only; the sizing contract (in reconcile) is the real authority.
  const width = Math.max(1, Math.min(PRIMARY_COLS, Math.round(w)));
  const clampedX = Math.max(0, Math.min(PRIMARY_COLS - width, Math.round(x)));

  return {
    i: item.i,
    x: clampedX,
    y: Math.max(0, Math.round(y)),
    w: width,
    h: Math.max(1, Math.round(h)),
  };
}

/** Parse + sanitize a persisted v2 layout string. Returns null on any problem. */
export function parseSavedLayoutV2(raw: string | null): SavedLayoutV2 | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== LAYOUT_STORAGE_VERSION) return null;

  const visible: Partial<Record<EventDashboardWidgetType, boolean>> = {};
  if (typeof candidate.visible === "object" && candidate.visible !== null) {
    for (const [id, value] of Object.entries(candidate.visible as Record<string, unknown>)) {
      if (typeof value === "boolean") visible[id as EventDashboardWidgetType] = value;
    }
  }

  const layouts: Partial<Record<GridBreakpoint, Layout[]>> = {};
  if (typeof candidate.layouts === "object" && candidate.layouts !== null) {
    for (const [bp, items] of Object.entries(candidate.layouts as Record<string, unknown>)) {
      if (!(bp in GRID_BREAKPOINTS) || !Array.isArray(items)) continue;
      const sanitized = items
        .map(sanitizeLayoutItem)
        .filter((item): item is Layout => item !== null);
      layouts[bp as GridBreakpoint] = sanitized;
    }
  }

  return { version: LAYOUT_STORAGE_VERSION, visible, layouts };
}

/**
 * Reconcile a saved layout against the current registry-derived widget states.
 *
 * Rules:
 * - Required widgets are forced visible.
 * - Unavailable widgets are never resurrected (always hidden).
 * - Saved visibility wins for available, non-required widgets.
 * - New available widgets keep their registry default visibility (seeded).
 * - Every kept/seeded item is rebuilt through its sizing contract, so widths are
 *   always allowed (12/6/4), KPI row is always w=12, and registration-housing
 *   never falls below 6.
 * - Unknown ids and hidden widgets are dropped from geometry.
 */
export function reconcileLayout(
  saved: SavedLayoutV2 | null,
  freshWidgets: EventDashboardWidgetState[],
): ReconciledLayout {
  const widgets = freshWidgets.map((widget) => {
    let visible: boolean;
    if (widget.required) {
      visible = true;
    } else if (!widget.available) {
      visible = false;
    } else if (saved && Object.prototype.hasOwnProperty.call(saved.visible, widget.id)) {
      visible = Boolean(saved.visible[widget.id]);
    } else {
      visible = widget.visible;
    }
    return { ...widget, visible };
  });

  const visibleById = new Map(
    widgets.filter((widget) => widget.visible).map((widget) => [widget.id, widget]),
  );

  // Keep saved geometry only for ids that are both known and currently visible,
  // re-built through the sizing contract.
  const savedPrimary = saved?.layouts[PRIMARY_BREAKPOINT] ?? [];
  const seen = new Set<string>();
  const layout: Layout[] = [];
  for (const item of savedPrimary) {
    const widget = visibleById.get(item.i as EventDashboardWidgetType);
    if (!widget) continue; // unknown id, hidden, or unavailable -> drop
    if (seen.has(item.i)) continue; // drop duplicates
    seen.add(item.i);
    layout.push(contractItem(widget.id, { x: item.x, y: item.y }, { w: item.w, h: item.h }));
  }

  // Seed contract-default positions for visible widgets missing from the layout.
  const missing = widgets.filter((widget) => widget.visible && !seen.has(widget.id));
  if (missing.length > 0) {
    const baseY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    const generated = generateDefaultLayout(missing).map((item) => ({ ...item, y: item.y + baseY }));
    layout.push(...generated);
  }

  return { widgets, layout };
}

/**
 * Build the persisted v2 payload from current widget states + RGL layout. Only
 * the geometry primitives are stored (i/x/y/w/h); constraints are re-derived
 * from the sizing contract on load, so contract changes always take effect.
 */
export function buildSavedLayoutV2(
  widgets: EventDashboardWidgetState[],
  layout: Layout[],
): SavedLayoutV2 {
  const visible: Partial<Record<EventDashboardWidgetType, boolean>> = {};
  for (const widget of widgets) {
    visible[widget.id] = widget.visible;
  }
  const cleaned = layout.map((item) => ({
    i: item.i,
    x: item.x,
    y: item.y,
    w: snapWidthToAllowed(item.w, getWidgetSizingContract(item.i).allowedWidths),
    h: item.h,
  }));
  return { version: LAYOUT_STORAGE_VERSION, visible, layouts: { [PRIMARY_BREAKPOINT]: cleaned } };
}

/** Snap every item's width to its contract's allowed set (used after resize). */
export function snapLayoutWidths(layout: Layout[]): Layout[] {
  return layout.map((item) => ({
    ...item,
    w: snapWidthToAllowed(item.w, getWidgetSizingContract(item.i).allowedWidths),
  }));
}
