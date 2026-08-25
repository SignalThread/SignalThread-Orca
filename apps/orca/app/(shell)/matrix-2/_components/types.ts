export type Matrix2Event = {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  timezone: string;
};

export type Matrix2Room = {
  id: string;
  name: string;
  capacity: number | null;
};

export type Matrix2Person = {
  id: string;
  name: string;
  role: "speaker" | "moderator" | "vip" | "staff" | "vendor";
  company: string | null;
  email: string | null;
};

export type Matrix2SessionSpeaker = {
  speakerId: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  status: "NEEDS_INFO" | "INVITED" | "CONFIRMED" | "CANCELLED";
};

export type Matrix2SessionStaff = {
  personId: string;
  name: string;
  role: "speaker" | "moderator" | "vip" | "staff" | "vendor";
  assignmentRole: string | null;
  company: string | null;
  email: string | null;
};

export type Matrix2SessionAVRequirement = {
  id: string;
  avType: string;
  quantity: number | null;
};

export type Matrix2SessionFoodService = {
  id: string;
  serviceType: string;
  serviceStyle: string | null;
  headcount: number | null;
};

export type Matrix2Session = {
  id: string;
  rowId: string;
  eventId: string;
  sortOrder: number;
  isTemporary?: boolean;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  roomName: string;
  title: string;
  sessionType: string;
  status: string;
  expectedAttendance: number | null;
  expectedAttendanceSource?: "PLANNER_ESTIMATE" | "REGISTRATION_RSVP" | "IMPORTED" | null;
  roomSetup: string;
  roomCapacity: number | null;
  speakers: string[];
  speakerAssignments: Matrix2SessionSpeaker[];
  avRequirements: string[];
  avRequirementsStructured: Matrix2SessionAVRequirement[];
  foodAndBeverage: string[];
  foodService: Matrix2SessionFoodService | null;
  staffAssigned: string[];
  staffAssignments: Matrix2SessionStaff[];
  requirementSelections: Array<{
    itemId: string;
    quantity: number | null;
    linkedBudgetLineItem: {
      id: string;
      lineItem: string;
      category: string;
      subcategory: string;
      forecastCents: number;
      actualCents: number;
      status: string;
    } | null;
  }>;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Matrix2RequirementItem = {
  id: string;
  key: string;
  label: string;
  active: boolean;
  hasQuantity: boolean;
  sortOrder: number;
};

export type Matrix2RequirementSection = {
  id: string;
  key: string;
  label: string;
  icon: string;
  sortOrder: number;
  items: Matrix2RequirementItem[];
};

export type Matrix2RequirementTemplate = {
  id: string;
  eventId: string;
  name: string;
  sections: Matrix2RequirementSection[];
};

export type Matrix2Snapshot = {
  event: Matrix2Event;
  dates: string[];
  rooms: Matrix2Room[];
  people: Matrix2Person[];
  requirementTemplate: Matrix2RequirementTemplate;
  sessions: Matrix2Session[];
};

export type Matrix2ZoomMode = "OVERVIEW" | "PLANNING" | "OPERATIONS";

export type Matrix2SessionAction =
  | "basics"
  | "speakers"
  | "av"
  | "fnb"
  | "staffing"
  | "room-set"
  | "seating"
  | "conflicts"
  | "workspace";

export type Matrix2ZoomConfig = {
  minuteWidth: number;
  laneMinHeight: number;
  cardHeight: number;
  titleClassName: string;
  bodyClassName: string;
};

export type Matrix2ConflictType =
  | "SPEAKER_DOUBLE_BOOKED"
  | "ROOM_OVERLAP"
  | "ROOM_CAPACITY_EXCEEDED";

export type Matrix2Conflict = {
  id: string;
  type: Matrix2ConflictType;
  severity: "warning" | "error";
  sessionIds: string[];
  message: string;
  roomName?: string;
  speakerName?: string;
};

export type Matrix2Template = {
  id: string;
  label: string;
  sessionType: string;
  durationMinutes: number;
  defaultSetup: string;
  defaultAttendance: number | null;
  defaultMeal: string;
  defaultAvNeeds: string[];
  defaultSpeakers: string[];
  defaultStaff: string[];
  defaultFnb: string[];
  colorClasses: string;
};

export type Matrix2TemplateDropTarget = {
  type: "matrix2-slot-drop";
  roomId: string;
  roomName: string;
  startMinutes: number;
};

export type Matrix2SessionDropTarget = {
  type: "matrix2-session-drop";
  sessionId: string;
  roomId: string;
  roomName: string;
  startMinutes: number;
  sortOrder: number;
};

export const MATRIX2_ZOOM_CONFIG: Record<Matrix2ZoomMode, Matrix2ZoomConfig> = {
  OVERVIEW: {
    minuteWidth: 1.45,
    laneMinHeight: 50,
    cardHeight: 38,
    titleClassName: "text-[11px] leading-[13px]",
    bodyClassName: "text-[11px] leading-[13px]",
  },
  PLANNING: {
    minuteWidth: 2,
    laneMinHeight: 56,
    cardHeight: 44,
    titleClassName: "text-[12px] leading-[14px]",
    bodyClassName: "text-[11px] leading-[13px]",
  },
  OPERATIONS: {
    minuteWidth: 2.55,
    laneMinHeight: 58,
    cardHeight: 46,
    titleClassName: "text-[12px] leading-[14px]",
    bodyClassName: "text-[11px] leading-[13px]",
  },
};

export const MATRIX2_TEMPLATES: Matrix2Template[] = [
  {
    id: "keynote",
    label: "Keynote",
    sessionType: "Keynote",
    durationMinutes: 60,
    defaultSetup: "",
    defaultAttendance: null,
    defaultMeal: "",
    defaultAvNeeds: [],
    defaultSpeakers: [],
    defaultStaff: [],
    defaultFnb: [],
    colorClasses: "bg-violet-500 text-white hover:bg-violet-600",
  },
  {
    id: "panel",
    label: "Panel",
    sessionType: "Panel",
    durationMinutes: 60,
    defaultSetup: "",
    defaultAttendance: null,
    defaultMeal: "",
    defaultAvNeeds: [],
    defaultSpeakers: [],
    defaultStaff: [],
    defaultFnb: [],
    colorClasses: "bg-blue-500 text-white hover:bg-blue-600",
  },
  {
    id: "workshop",
    label: "Workshop",
    sessionType: "Workshop",
    durationMinutes: 90,
    defaultSetup: "",
    defaultAttendance: null,
    defaultMeal: "",
    defaultAvNeeds: [],
    defaultSpeakers: [],
    defaultStaff: [],
    defaultFnb: [],
    colorClasses: "bg-emerald-500 text-white hover:bg-emerald-600",
  },
  {
    id: "coffee-break",
    label: "Coffee Break",
    sessionType: "Coffee Break",
    durationMinutes: 30,
    defaultSetup: "",
    defaultAttendance: null,
    defaultMeal: "",
    defaultAvNeeds: [],
    defaultSpeakers: [],
    defaultStaff: [],
    defaultFnb: [],
    colorClasses: "bg-orange-500 text-white hover:bg-orange-600",
  },
  {
    id: "lunch",
    label: "Lunch",
    sessionType: "Lunch",
    durationMinutes: 60,
    defaultSetup: "",
    defaultAttendance: null,
    defaultMeal: "",
    defaultAvNeeds: [],
    defaultSpeakers: [],
    defaultStaff: [],
    defaultFnb: [],
    colorClasses: "bg-amber-500 text-slate-900 hover:bg-amber-400",
  },
  {
    id: "reception",
    label: "Reception",
    sessionType: "Reception",
    durationMinutes: 90,
    defaultSetup: "",
    defaultAttendance: null,
    defaultMeal: "",
    defaultAvNeeds: [],
    defaultSpeakers: [],
    defaultStaff: [],
    defaultFnb: [],
    colorClasses: "bg-pink-500 text-white hover:bg-pink-600",
  },
];

export type SessionTypeOption = {
  value: string;
  label: string;
};

/** The single persisted Session Type option source for every Run of Show editor. */
export const SESSION_TYPE_OPTIONS: readonly SessionTypeOption[] = [
  { value: "Session", label: "Session" },
  ...MATRIX2_TEMPLATES.map((template) => ({
    value: template.sessionType,
    label: template.label,
  })),
];

export const DEFAULT_SESSION_TYPE = SESSION_TYPE_OPTIONS[0].value;

export function sessionTypeOptionsForSavedValue(value: string | null | undefined): readonly SessionTypeOption[] {
  const savedValue = value?.trim() || DEFAULT_SESSION_TYPE;
  if (SESSION_TYPE_OPTIONS.some((option) => option.value === savedValue)) {
    return SESSION_TYPE_OPTIONS;
  }

  // Preserve historic free-text values while allowing future changes only to a
  // canonical option. The extra option is compatibility data, not a new type.
  return [...SESSION_TYPE_OPTIONS, { value: savedValue, label: savedValue }];
}
