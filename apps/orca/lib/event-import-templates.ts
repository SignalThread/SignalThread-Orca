/**
 * Start-from-Template path (pure, code-defined).
 *
 * Each template is a small typed starter definition that maps into the SAME
 * EventImportPreview + create plan as the workbook/paste paths. Output is
 * editable starter content (placeholders), never claimed as final. No saved
 * template library / schema is introduced.
 */
import {
  emptyEventImportPreview,
  type BudgetPreviewRow,
  type EventImportBasics,
  type EventImportBudgetInput,
  type EventImportCreatePlan,
  type EventImportPreview,
  type EventImportRunOfShowInput,
  type EventImportTimelineInput,
  type RunOfShowPreviewRow,
  type TimelinePreviewRow,
} from "@/lib/event-import-types";

type TemplateDefinition = {
  key: string;
  label: string;
  /** Session titles, scheduled sequentially on the event start day. */
  runOfShow: string[];
  /** Budget category + line item placeholders (zero-cost starters). */
  budget: { category: string; lineItem: string }[];
  /** Timeline task titles, due on the event start date as starters. */
  timeline: string[];
};

export const EVENT_TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    key: "conference",
    label: "Conference",
    runOfShow: [
      "Registration / Check-in",
      "Opening Remarks",
      "Keynote",
      "Breakout Session Block",
      "Lunch",
      "Sponsor Session",
      "Networking Reception",
    ],
    budget: [
      { category: "Venue", lineItem: "Venue rental" },
      { category: "AV & Production", lineItem: "AV / Production" },
      { category: "F&B", lineItem: "Food & Beverage" },
      { category: "Staffing", lineItem: "Staffing" },
      { category: "Signage", lineItem: "Signage / Printing" },
      { category: "Speakers", lineItem: "Speaker / Talent" },
      { category: "Sponsors", lineItem: "Sponsor / Expo setup" },
    ],
    timeline: [
      "Confirm venue contract",
      "Lock agenda draft",
      "Confirm speaker list",
      "Collect session requirements",
      "Finalize AV plan",
      "Finalize F&B guarantees",
      "Publish final Run of Show",
    ],
  },
  {
    key: "trade_show",
    label: "Trade Show",
    runOfShow: [
      "Exhibitor Move-in",
      "Registration Opens",
      "Expo Hall Opens",
      "Education Session",
      "Networking Break",
      "Expo Hall Closes",
      "Exhibitor Move-out",
    ],
    budget: [
      { category: "Venue", lineItem: "Hall rental" },
      { category: "Exhibitor Services", lineItem: "Booth services" },
      { category: "Registration", lineItem: "Registration setup" },
      { category: "Security", lineItem: "Security" },
      { category: "Operations", lineItem: "Cleaning" },
      { category: "Signage", lineItem: "Signage" },
      { category: "Exhibitor Services", lineItem: "Exhibitor services" },
    ],
    timeline: [
      "Publish exhibitor kit",
      "Confirm floor plan",
      "Confirm move-in schedule",
      "Finalize sponsor deliverables",
      "Confirm security/cleaning plan",
    ],
  },
  {
    key: "gala",
    label: "Gala / Awards",
    runOfShow: [
      "Guest Arrival / Cocktail Reception",
      "Doors Open",
      "Dinner Service",
      "Welcome Remarks",
      "Awards Program",
      "Closing Remarks",
      "After-event teardown",
    ],
    budget: [
      { category: "Venue", lineItem: "Venue" },
      { category: "F&B", lineItem: "Catering" },
      { category: "F&B", lineItem: "Bar" },
      { category: "Décor & Branding", lineItem: "Decor" },
      { category: "AV & Production", lineItem: "AV / Lighting" },
      { category: "Entertainment", lineItem: "Entertainment" },
      { category: "Awards", lineItem: "Awards / Gifts" },
    ],
    timeline: [
      "Confirm honorees",
      "Finalize menu",
      "Confirm seating plan",
      "Confirm script/run of show",
      "Finalize awards assets",
    ],
  },
  {
    key: "training",
    label: "Training",
    runOfShow: [
      "Check-in",
      "Welcome / Orientation",
      "Training Block 1",
      "Break",
      "Training Block 2",
      "Lunch",
      "Hands-on Exercise",
      "Wrap-up",
    ],
    budget: [
      { category: "Venue", lineItem: "Room rental" },
      { category: "Materials", lineItem: "Training materials" },
      { category: "AV & Production", lineItem: "AV" },
      { category: "F&B", lineItem: "Food & Beverage" },
      { category: "Speakers", lineItem: "Facilitator costs" },
    ],
    timeline: [
      "Confirm curriculum",
      "Prepare materials",
      "Confirm facilitator",
      "Confirm room setup",
      "Send attendee reminders",
    ],
  },
  {
    key: "workshop",
    label: "Workshop",
    runOfShow: [
      "Arrival",
      "Introductions",
      "Working Session 1",
      "Break",
      "Working Session 2",
      "Share-out",
      "Wrap-up",
    ],
    budget: [
      { category: "Venue", lineItem: "Room rental" },
      { category: "Materials", lineItem: "Materials" },
      { category: "Speakers", lineItem: "Facilitation" },
      { category: "F&B", lineItem: "Food & Beverage" },
      { category: "AV & Production", lineItem: "AV" },
    ],
    timeline: [
      "Define outcomes",
      "Confirm participants",
      "Prepare worksheets/materials",
      "Confirm room layout",
      "Send prep email",
    ],
  },
  {
    key: "corporate_meeting",
    label: "Corporate Meeting",
    runOfShow: [
      "Arrival / Breakfast",
      "Leadership Welcome",
      "Business Review",
      "Break",
      "Planning Session",
      "Lunch",
      "Team Discussion",
      "Next Steps",
    ],
    budget: [
      { category: "Venue", lineItem: "Meeting space" },
      { category: "AV & Production", lineItem: "AV" },
      { category: "F&B", lineItem: "Food & Beverage" },
      { category: "Travel", lineItem: "Travel" },
      { category: "Materials", lineItem: "Materials" },
    ],
    timeline: [
      "Confirm attendees",
      "Build agenda",
      "Collect pre-read materials",
      "Confirm room setup",
      "Send final logistics",
    ],
  },
];

export const EVENT_TEMPLATE_KEYS = EVENT_TEMPLATE_DEFINITIONS.map((t) => t.key);

function templateByKey(key: string): TemplateDefinition {
  return EVENT_TEMPLATE_DEFINITIONS.find((t) => t.key === key) ?? EVENT_TEMPLATE_DEFINITIONS[0];
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const SLOT_MINUTES = 60;
const FIRST_SLOT = "09:00";

function startDateIso(basics: EventImportBasics): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(basics.startDate) ? basics.startDate : "";
}

export function buildTemplateCreatePlan(templateKey: string, basics: EventImportBasics): EventImportCreatePlan {
  const template = templateByKey(templateKey);
  const dayDateIso = startDateIso(basics);

  const runOfShow: EventImportRunOfShowInput[] = template.runOfShow.map((title, index) => {
    const startTime = addMinutes(FIRST_SLOT, index * SLOT_MINUTES);
    return {
      sessionName: title,
      dayDateIso,
      startTime,
      endTime: addMinutes(startTime, SLOT_MINUTES),
      roomName: null,
      setupType: null,
      avNeeds: null,
      attendance: null,
      notes: "Starter session from template — edit as needed.",
    };
  });

  const budget: EventImportBudgetInput[] = template.budget.map((row) => ({
    category: row.category,
    subcategory: null,
    lineItem: row.lineItem,
    vendor: null,
    forecastCents: 0,
    actualCents: 0,
    status: null,
  }));

  const timeline: EventImportTimelineInput[] = template.timeline.map((title) => ({
    title,
    startDateIso: dayDateIso,
    endDateIso: dayDateIso,
    status: "NOT_STARTED",
    priority: "MEDIUM",
    workstream: null,
    planningStage: "PLANNING",
    isCriticalPath: false,
  }));

  return {
    eventBasics: basics,
    sourceType: "template",
    runOfShow,
    budget,
    timeline,
    timelineDependencies: [],
  };
}

export function buildTemplatePreview(templateKey: string, basics: EventImportBasics): EventImportPreview {
  const plan = buildTemplateCreatePlan(templateKey, basics);
  const preview = emptyEventImportPreview(basics, "template");
  preview.templateKey = templateKey;

  const rosRows: RunOfShowPreviewRow[] = plan.runOfShow.map((r) => ({
    title: r.sessionName,
    date: r.dayDateIso || null,
    startTime: r.startTime,
    endTime: r.endTime,
    roomName: r.roomName,
    notes: r.notes || null,
  }));
  preview.modules.runOfShow = {
    ...preview.modules.runOfShow,
    detected: rosRows.length > 0,
    rows: rosRows,
    sampleRows: rosRows.slice(0, 3),
    validRowCount: rosRows.length,
    roomsToCreate: [],
  };

  const budgetRows: BudgetPreviewRow[] = plan.budget.map((r) => ({
    category: r.category,
    lineItem: r.lineItem,
    vendor: null,
    estimatedCents: r.forecastCents,
    actualCents: r.actualCents,
  }));
  preview.modules.budget = {
    ...preview.modules.budget,
    detected: budgetRows.length > 0,
    rows: budgetRows,
    sampleRows: budgetRows.slice(0, 3),
    validRowCount: budgetRows.length,
    estimatedTotalCents: 0,
    categoryCount: new Set(budgetRows.map((r) => r.category.toLowerCase())).size,
  };

  const timelineRows: TimelinePreviewRow[] = plan.timeline.map((r) => ({
    task: r.title,
    startDate: r.startDateIso ?? r.endDateIso ?? null,
    endDate: r.endDateIso || null,
    status: r.status,
    priority: r.priority ?? "MEDIUM",
    workstream: r.workstream ?? null,
    planningStage: r.planningStage ?? null,
    isCriticalPath: r.isCriticalPath ?? false,
    notes: r.notes ?? null,
    dependency: null,
  }));
  preview.modules.timeline = {
    ...preview.modules.timeline,
    detected: timelineRows.length > 0,
    rows: timelineRows,
    sampleRows: timelineRows.slice(0, 3),
    validRowCount: timelineRows.length,
    dependencyCount: 0,
  };

  preview.globalWarnings.push({
    module: "global",
    severity: "info",
    message: "This is editable starter content. Replace placeholder sessions, budget estimates, and task owners after creating.",
  });
  return preview;
}
