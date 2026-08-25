export type WidgetId =
  | "upcomingDeadlines"
  | "topPriorities"
  | "criticalPath"
  | "approvalQueue"
  | "decisionLog"
  | "budgetOverview"
  | "categoryBreakdown"
  | "revenueTracking"
  | "contractExposure"
  | "registrationPace"
  | "registrationFunnel"
  | "registrantDemographics"
  | "registrationForecast"
  | "pickupOverview"
  | "attritionRisk"
  | "subBlockStatus"
  | "cutoffCountdown"
  | "sponsorRevenue"
  | "deliverablesTracker"
  | "exhibitorStatus"
  | "sessionScheduling"
  | "speakerTravelStatus"
  | "runOfShow"
  | "staffingStatus"
  | "fnbStatus"
  | "avProductionStatus"
  | "incidentLog"
  | "riskDetection"
  | "opportunities"
  | "sentimentMonitor";

export type PhaseId = "planning" | "preEvent" | "onsite";

export type WidgetConfig = {
  height?: "compact" | "standard" | "tall";
  width?: "normal" | "wide";
  order?: number;
  visible?: boolean;
  expanded?: boolean;
  dateRange?: "next7" | "next30" | "lifecycle";
  displayMode?: "list" | "calendar";
  grouping?: "category" | "department" | "vendor";
  currency?: "USD";
};

export type LayoutItem = {
  widgetId: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
};

export const ROLE_OPTIONS = ["Planner", "Finance Manager", "Marketing Lead", "Sponsorship Coordinator", "Onsite Manager", "Executive"] as const;

export type RoleView = (typeof ROLE_OPTIONS)[number];

export const PHASE_LABELS: Record<PhaseId, string> = {
  planning: "Planning",
  preEvent: "Pre-event",
  onsite: "Onsite",
};

export const layoutItem = (widgetId: WidgetId, x: number, y: number, w: number, h: number): LayoutItem => ({
  widgetId,
  x,
  y,
  w,
  h,
  visible: true,
});

export const PHASE_LAYOUTS: Record<PhaseId, LayoutItem[]> = {
  planning: [
    layoutItem("budgetOverview", 0, 0, 6, 4),
    layoutItem("registrationPace", 6, 0, 6, 4),
    layoutItem("topPriorities", 0, 4, 4, 4),
    layoutItem("upcomingDeadlines", 4, 4, 4, 4),
    layoutItem("approvalQueue", 8, 4, 4, 4),
  ],
  preEvent: [
    layoutItem("upcomingDeadlines", 0, 0, 4, 4),
    layoutItem("approvalQueue", 4, 0, 4, 4),
    layoutItem("budgetOverview", 8, 0, 4, 4),
    layoutItem("pickupOverview", 0, 4, 12, 4),
  ],
  onsite: [
    layoutItem("runOfShow", 0, 0, 5, 4),
    layoutItem("staffingStatus", 5, 0, 3, 4),
    layoutItem("incidentLog", 8, 0, 4, 4),
    layoutItem("avProductionStatus", 0, 4, 4, 4),
    layoutItem("fnbStatus", 4, 4, 4, 4),
  ],
};

export const EXECUTIVE_LAYOUT: LayoutItem[] = [
  layoutItem("budgetOverview", 0, 0, 6, 4),
  layoutItem("registrationPace", 6, 0, 6, 4),
  layoutItem("pickupOverview", 0, 4, 4, 4),
  layoutItem("sponsorRevenue", 4, 4, 4, 4),
  layoutItem("contractExposure", 8, 4, 4, 4),
];

export const WIDGET_IDS = new Set<WidgetId>([
  "upcomingDeadlines",
  "topPriorities",
  "criticalPath",
  "approvalQueue",
  "decisionLog",
  "budgetOverview",
  "categoryBreakdown",
  "revenueTracking",
  "contractExposure",
  "registrationPace",
  "registrationFunnel",
  "registrantDemographics",
  "registrationForecast",
  "pickupOverview",
  "attritionRisk",
  "subBlockStatus",
  "cutoffCountdown",
  "sponsorRevenue",
  "deliverablesTracker",
  "exhibitorStatus",
  "sessionScheduling",
  "speakerTravelStatus",
  "runOfShow",
  "staffingStatus",
  "fnbStatus",
  "avProductionStatus",
  "incidentLog",
  "riskDetection",
  "opportunities",
  "sentimentMonitor",
]);

export function sanitizeClientLayout(items: LayoutItem[]): LayoutItem[] {
  return items
    .filter((entry) => WIDGET_IDS.has(entry.widgetId))
    .map((entry, index) => ({
      widgetId: entry.widgetId,
      x: Math.max(0, Math.min(11, Math.round(entry.x ?? 0))),
      y: Math.max(0, Math.round(entry.y ?? index * 4)),
      w: Math.max(1, Math.min(12, Math.round(entry.w ?? 4))),
      h: Math.max(2, Math.min(12, Math.round(entry.h ?? 4))),
      visible: entry.visible !== false,
    }));
}

export function parseClientLayout(value: string, fallback: LayoutItem[]): LayoutItem[] {
  try {
    const parsed = JSON.parse(value) as LayoutItem[];
    return Array.isArray(parsed) ? sanitizeClientLayout(parsed) : fallback;
  } catch {
    return fallback;
  }
}

export function addWidgetToLayout(current: LayoutItem[], widgetId: WidgetId): LayoutItem[] {
  if (current.some((item) => item.widgetId === widgetId)) return current;
  const nextIndex = current.length;
  return [...current, layoutItem(widgetId, (nextIndex % 3) * 4, Math.floor(nextIndex / 3) * 4 + 8, 4, 4)];
}

export function resizeLayoutWidget(current: LayoutItem[], widgetId: WidgetId, size: Pick<LayoutItem, "w" | "h">): LayoutItem[] {
  return current.map((item) =>
    item.widgetId === widgetId
      ? { ...item, w: Math.max(1, Math.min(12 - item.x, size.w)), h: Math.max(2, Math.min(12, size.h)) }
      : item,
  );
}

export function moveLayoutWidget(current: LayoutItem[], widgetId: WidgetId, delta: Pick<LayoutItem, "x" | "y">): LayoutItem[] {
  return current.map((item) =>
    item.widgetId === widgetId
      ? {
          ...item,
          x: Math.max(0, Math.min(12 - item.w, item.x + delta.x)),
          y: Math.max(0, item.y + delta.y),
        }
      : item,
  );
}

export function removeLayoutWidget(current: LayoutItem[], widgetId: WidgetId): LayoutItem[] {
  return current.filter((item) => item.widgetId !== widgetId);
}
