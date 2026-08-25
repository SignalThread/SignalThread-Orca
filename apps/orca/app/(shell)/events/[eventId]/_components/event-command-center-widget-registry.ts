import type {
  EventCommandCenterCapabilities,
  EventPhase,
} from "@/src/server/services/event-command-center";
import { FEATURES } from "@/config/features";

export type EventDashboardWidgetType =
  | "needs-you"
  | "activity-feed"
  | "kpi-row"
  | "planner-focus"
  | "upcoming-deadlines"
  | "roadmap-progress"
  | "event-budget-overview"
  | "financial-summary"
  | "conflicts-details"
  | "registration-housing"
  | "run-of-show"
  | "staffing-overview"
  | "task-summary"
  | "vendor-status"
  | "event-snapshot"
  | "weather-forecast"
  | "speaker-readiness"
  | "fnb-status"
  | "av-production"
  | "readiness-dashboard"
  | "session-readiness"
  | "run-of-show-readiness"
  | "approval-center"
  | "staffing-coverage"
  | "executive-briefing";

export type EventDashboardWidgetSize = "full" | "half" | "third";

export type EventDashboardWidgetCategory =
  | "Command Center"
  | "Planning"
  | "Financials"
  | "Registration & Housing"
  | "Operations"
  | "Content"
  | "Vendors";

export type EventDashboardWidgetConfig = {
  id: EventDashboardWidgetType;
  type: EventDashboardWidgetType;
  title: string;
  description: string;
  category: EventDashboardWidgetCategory;
  /** Phases in which this widget is shown by default (subject to data being present). */
  defaultPhases: EventPhase[];
  required: boolean;
  size: EventDashboardWidgetSize;
  defaultOrder: number;
  /** Capability gate for whether the widget can render real (non-empty) content. */
  availabilityKey?: keyof EventCommandCenterCapabilities;
};

export type EventDashboardWidgetState = EventDashboardWidgetConfig & {
  visible: boolean;
  order: number;
  available: boolean;
  disabledReason?: string;
};

const ALL_PHASES: EventPhase[] = ["planning", "preEvent", "onsite"];

const EVENT_DASHBOARD_WIDGET_REGISTRY_ITEMS: EventDashboardWidgetConfig[] = [
  // --- Default leadership view (visible by default in every phase, subject to data) ---
  // Top row: KPI Row (full width).
  {
    id: "kpi-row",
    type: "kpi-row",
    title: "KPI Row",
    description: "Event health metrics that stay at the top of the command center.",
    category: "Command Center",
    defaultPhases: ALL_PHASES,
    required: true,
    size: "full",
    defaultOrder: 0,
  },
  // Main row: Operational Readiness · Planner Focus · Open Conflicts.
  {
    id: "readiness-dashboard",
    type: "readiness-dashboard",
    title: "Operational Readiness",
    description: "Broad event operations readiness across registration, housing, budget, approvals, and speaker deliverables.",
    category: "Command Center",
    defaultPhases: ALL_PHASES,
    required: false,
    size: "third",
    defaultOrder: 1,
  },
  {
    id: "planner-focus",
    type: "planner-focus",
    title: "Planner Focus",
    description: "A deterministic queue of the event items that most need planner attention next.",
    category: "Command Center",
    defaultPhases: ALL_PHASES,
    required: false,
    size: "third",
    defaultOrder: 2,
  },
  {
    id: "conflicts-details",
    type: "conflicts-details",
    title: "Open Conflicts",
    description: "Cross-module conflicts and blockers requiring review.",
    category: "Command Center",
    defaultPhases: ALL_PHASES,
    required: false,
    size: "third",
    defaultOrder: 3,
  },
  // Bottom row: Financial Exposure · Run of Show Readiness.
  {
    id: "event-budget-overview",
    type: "event-budget-overview",
    title: "Financial Exposure",
    description: "Budget actuals, forecast, variance, and current spend health.",
    category: "Financials",
    defaultPhases: ALL_PHASES,
    required: false,
    size: "half",
    defaultOrder: 4,
  },
  {
    id: "run-of-show-readiness",
    type: "run-of-show-readiness",
    title: "Run of Show Readiness",
    description: "Execution readiness from current Run of Show timing, room, speaker, AV, F&B, and staffing coverage.",
    category: "Operations",
    defaultPhases: ALL_PHASES,
    required: false,
    size: "half",
    defaultOrder: 5,
  },
  // Available as optional widgets.
  {
    id: "upcoming-deadlines",
    type: "upcoming-deadlines",
    title: "Upcoming Critical Dates",
    description: "The next planner milestones and timeline due dates that drive the event.",
    category: "Planning",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 30,
  },
  {
    id: "roadmap-progress",
    type: "roadmap-progress",
    title: "Roadmap Progress",
    description: "Progress against dated roadmap items, milestones, and critical path work.",
    category: "Planning",
    defaultPhases: [],
    required: false,
    size: "half",
    defaultOrder: 31,
  },
  {
    id: "registration-housing",
    type: "registration-housing",
    title: "Registration & Housing",
    description: "Registration pace and housing pickup — the leading indicators of event health.",
    category: "Registration & Housing",
    defaultPhases: [],
    required: false,
    size: "full",
    defaultOrder: 32,
    availabilityKey: "hasRegistrationData",
  },

  // --- Available in the widget library but off by default ---
  {
    id: "needs-you",
    type: "needs-you",
    title: "Needs You",
    description: "A ranked queue of the decisions, approvals, and blockers waiting on you right now.",
    category: "Command Center",
    defaultPhases: [],
    required: false,
    size: "full",
    defaultOrder: 10,
  },
  {
    id: "activity-feed",
    type: "activity-feed",
    title: "Activity",
    description: "What changed since your last visit — the latest updates across the event.",
    category: "Command Center",
    defaultPhases: [],
    required: false,
    size: "half",
    defaultOrder: 11,
  },
  {
    id: "executive-briefing",
    type: "executive-briefing",
    title: "Executive Briefing",
    description: "Evidence-grounded event facts and recommended next actions, with deterministic fallback.",
    category: "Command Center",
    defaultPhases: [],
    required: false,
    size: "half",
    defaultOrder: 12,
  },
  {
    id: "approval-center",
    type: "approval-center",
    title: "Approval Center",
    description: "Pending approvals by area, including overdue items and oldest waiting decisions.",
    category: "Planning",
    defaultPhases: [],
    required: false,
    size: "half",
    defaultOrder: 13,
  },
  {
    id: "event-snapshot",
    type: "event-snapshot",
    title: "Event Snapshot",
    description: "Date, location, attendance target, session count, and budget context.",
    category: "Command Center",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 14,
  },
  {
    id: "financial-summary",
    type: "financial-summary",
    title: "Financial Summary",
    description: "Category-level budget summary and variance context.",
    category: "Financials",
    defaultPhases: [],
    required: false,
    size: "half",
    defaultOrder: 15,
    availabilityKey: "hasBudgetData",
  },
  {
    id: "task-summary",
    type: "task-summary",
    title: "Roadmap Summary",
    description: "Completed, upcoming, and overdue timeline work.",
    category: "Planning",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 16,
  },
  {
    id: "run-of-show",
    type: "run-of-show",
    title: "Run of Show",
    description: "Current and upcoming program segments from the event matrix.",
    category: "Operations",
    defaultPhases: [],
    required: false,
    size: "half",
    defaultOrder: 17,
    availabilityKey: "hasRunOfShow",
  },
  {
    id: "session-readiness",
    type: "session-readiness",
    title: "Session Readiness",
    description: "Session setup completeness across rooms, AV, F&B, speakers, assets, and staffing.",
    category: "Planning",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 18,
  },
  {
    id: "speaker-readiness",
    type: "speaker-readiness",
    title: "Speaker Readiness",
    description: "Speaker confirmation, bios, headshots, and presentation readiness.",
    category: "Content",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 19,
    availabilityKey: "hasSpeakerData",
  },
  {
    id: "staffing-overview",
    type: "staffing-overview",
    title: "Staffing Overview",
    description: "Confirmed, pending, and missing session staff assignments.",
    category: "Operations",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 20,
    availabilityKey: "hasStaffing",
  },
  {
    id: "staffing-coverage",
    type: "staffing-coverage",
    title: "Staffing Coverage",
    description: "Coverage by event area, including registration, sessions, load-in, and onsite roles.",
    category: "Operations",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 21,
  },
  {
    id: "fnb-status",
    type: "fnb-status",
    title: "F&B Status",
    description: "Meal counts, catalog assignments, and food service readiness.",
    category: "Operations",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 22,
    availabilityKey: "hasFnbData",
  },
  {
    id: "av-production",
    type: "av-production",
    title: "AV Production",
    description: "AV requirements, production notes, and at-risk items.",
    category: "Operations",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 23,
    availabilityKey: "hasAvData",
  },
  {
    id: "weather-forecast",
    type: "weather-forecast",
    title: "Weather Forecast",
    description: "Weather context for onsite planning.",
    category: "Operations",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 24,
    availabilityKey: "hasWeatherData",
  },
  {
    id: "vendor-status",
    type: "vendor-status",
    title: "Vendor Status",
    description: "Vendor readiness and open vendor risks.",
    category: "Vendors",
    defaultPhases: [],
    required: false,
    size: "third",
    defaultOrder: 25,
    availabilityKey: "hasVendorData",
  },
];

export const EVENT_DASHBOARD_WIDGET_REGISTRY: EventDashboardWidgetConfig[] =
  EVENT_DASHBOARD_WIDGET_REGISTRY_ITEMS.filter(
    (widget) => FEATURES.ENABLE_GENERIC_TASKING_UI || widget.type !== "task-summary",
  );

function getDisabledReason(widgetType: EventDashboardWidgetType): string {
  switch (widgetType) {
    case "run-of-show":
      return "Build your run of show to monitor segments and timing.";
    case "staffing-overview":
      return "Add staff assignments to monitor coverage.";
    case "vendor-status":
      return "Connect a vendor list to track readiness and open risks.";
    case "weather-forecast":
      return "Weather appears once the event location and forecast are available.";
    case "speaker-readiness":
      return "Add speakers to track session and travel readiness.";
    case "fnb-status":
      return "Add catalog items or session assignments to track F&B.";
    case "av-production":
      return "Add AV requirements or production notes to track readiness.";
    case "registration-housing":
      return "Connect registration or housing data to track pace and pickup.";
    case "event-budget-overview":
    case "financial-summary":
      return "Add budget line items to track forecast and spend.";
    default:
      return "Connect a data source to enable this widget.";
  }
}

export function buildInitialWidgetState(
  capabilities: EventCommandCenterCapabilities,
  phase: EventPhase = "planning",
): EventDashboardWidgetState[] {
  return EVENT_DASHBOARD_WIDGET_REGISTRY.map((widget) => {
    const available = widget.availabilityKey
      ? Boolean(capabilities[widget.availabilityKey])
      : true;

    // A widget is shown by default only when the current phase calls for it AND
    // it has real data to show — empty shells never ship in the default canvas.
    const defaultForPhase = widget.required || widget.defaultPhases.includes(phase);
    const visible = defaultForPhase && available;

    return {
      ...widget,
      visible,
      order: widget.defaultOrder,
      available,
      disabledReason: available ? undefined : getDisabledReason(widget.type),
    };
  });
}
