"use client";

import Link from "next/link";
import { useEventTerminology } from "@/components/event-terminology-context";
import { AlertTriangle, ClipboardList, Mic, Minus, Monitor, Plus, Search, UsersRound, UtensilsCrossed, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TimeField } from "@/components/time-field";
import { SessionRegistrationUnavailableCard } from "@/components/session-registration-unavailable-card";
import {
  SESSION_REGISTRATION_COMING_SOON_BADGE,
  SESSION_REGISTRATION_COMING_SOON_COPY,
  shouldGateSessionRegistration,
} from "@/config/features";
import {
  inferSessionRequirementCatalogType,
  isStaffingNeedRequirementItem,
  type SessionRequirementCatalogType,
} from "@/lib/session-requirement-catalog";
import { parseSessionRequirementQuantity } from "@/lib/session-requirement-quantity";
import { roomSetHref, runOfShowSessionHref } from "@/lib/planning/routes";
import {
  availableFnbPickerCategories,
  filterAvailableFnbCatalogItems,
  mergeFnbPickerAssignment,
  removeFnbPickerAssignment,
  type FnbPickerCatalogItem,
} from "./matrix2-fnb-picker";
import { formatTimeLabel } from "./conflict-utils";
import {
  DEFAULT_SESSION_TYPE,
  Matrix2Conflict,
  Matrix2Person,
  Matrix2RequirementTemplate,
  Matrix2Room,
  Matrix2Session,
  sessionTypeOptionsForSavedValue,
} from "./types";
import {
  MATRIX2_QUICK_DRAWER_MODULES,
  type Matrix2QuickPanelKey,
} from "./matrix2-quick-modules";

export type { Matrix2QuickPanelKey } from "./matrix2-quick-modules";

type Matrix2PersonSelection = {
  personId?: string;
  name: string;
  role?: Matrix2Person["role"] | null;
  company?: string | null;
  email?: string | null;
};

type Matrix2SpeakerStatus = "NEEDS_INFO" | "INVITED" | "CONFIRMED" | "CANCELLED";

type Matrix2SpeakerSelection = {
  speakerId?: string;
  name: string;
  title?: string | null;
  company?: string | null;
  email?: string | null;
  status?: Matrix2SpeakerStatus;
};

type LinkedBudgetLineItem = NonNullable<Matrix2Session["requirementSelections"][number]["linkedBudgetLineItem"]>;

type FnbLibraryItem = FnbPickerCatalogItem;

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
  status: Matrix2SpeakerStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type SessionFnbCatalogAssignment = {
  id: string;
  sessionId: string;
  eventFnbCatalogItemId: string;
  budgetLineItemId: string | null;
  quantity: number | null;
  manualPriceCents: number | null;
  serviceTiming: string | null;
  notes: string | null;
  catalogItem: FnbLibraryItem;
};

type BasicsRosterStatus = "REGISTERED" | "SELECTED" | "WAITLISTED" | "CANCELLED" | "CHECKED_IN" | "NO_SHOW";

type BasicsRosterEnrollment = {
  id: string;
  attendeeId: string;
  enrollmentStatus: BasicsRosterStatus;
  attendee: {
    id: string;
    displayName: string;
    email: string | null;
    company: string | null;
  } | null;
};

type BasicsAttendeeOption = {
  id: string;
  displayName: string;
  email: string | null;
  company: string | null;
};

type Matrix2StaffSelection = Matrix2PersonSelection & {
  assignmentRole?: string | null;
};

type Matrix2SessionEditPayload = {
  title: string;
  sessionType: string;
  status: string;
  roomId: string | null;
  startTime: string;
  endTime: string;
  expectedAttendance: number | null;
  roomSetupType: string;
  speakers: Matrix2SpeakerSelection[];
  requirementSelections: Array<{ itemId: string; quantity: number | null }>;
  avRequirements: Array<{ avType: string; quantity: number | null }>;
  foodService: { serviceType: string; serviceStyle: string | null; headcount: number | null } | null;
  foodAndBeverage?: string[];
  staffAssignments: Matrix2StaffSelection[];
  notes: string;
};

type Matrix2DetailsDrawerProps = {
  session: Matrix2Session;
  rooms: Matrix2Room[];
  people: Matrix2Person[];
  conflicts: Matrix2Conflict[];
  onViewConflictingSession: (sessionId: string) => void;
  requirementTemplate: Matrix2RequirementTemplate | null;
  isBusy: boolean;
  initialQuickPanel?: Matrix2QuickPanelKey | null;
  onClose: () => void;
  onSaveEdit: (sessionId: string, payload: Matrix2SessionEditPayload) => Promise<void>;
};

type SelectionItem = {
  personId?: string;
  speakerId?: string;
  name: string;
  personRole?: Matrix2Person["role"] | null;
  assignmentRole?: string | null;
  title?: string | null;
  company?: string | null;
  email?: string | null;
  status?: Matrix2SpeakerStatus;
};

function isPlaceholderSpeakerName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "tbd" ||
    normalized === "tba" ||
    normalized === "unassigned" ||
    normalized === "to be determined" ||
    normalized === "speaker tbd" ||
    normalized === "speaker to be determined"
  );
}

function isRealSpeakerSelection(selection: SelectionItem): boolean {
  return Boolean(selection.speakerId?.trim()) &&
    !isPlaceholderSpeakerName(selection.name) &&
    selection.status !== "CANCELLED";
}


function initialSpeakerSelection(session: Matrix2Session): SelectionItem[] {
  return session.speakerAssignments.map((speaker) => ({
    speakerId: speaker.speakerId,
    name: speaker.name,
    title: speaker.title,
    company: speaker.company,
    email: speaker.email,
    status: speaker.status,
  }));
}

function initialStaffSelection(session: Matrix2Session): SelectionItem[] {
  if (session.staffAssignments.length > 0) {
    return session.staffAssignments.map((staff) => ({
      personId: staff.personId,
      name: staff.name,
      personRole: staff.role,
      assignmentRole: staff.assignmentRole,
      company: staff.company,
      email: staff.email,
    }));
  }

  return session.staffAssigned.map((label) => {
    const parsed = label.match(/^(.*?)\s*\((.*?)\)$/);
    if (!parsed) return { name: label };
    return {
      name: parsed[1].trim(),
      assignmentRole: parsed[2].trim(),
    };
  });
}

function uniqueSelections(values: SelectionItem[]): SelectionItem[] {
  const seen = new Set<string>();
  const normalized: SelectionItem[] = [];

  for (const value of values) {
    const key = value.speakerId
      ? `speaker:${value.speakerId}`
      : value.personId
        ? `person:${value.personId}`
        : `name:${value.name.trim().toLowerCase()}`;
    if (!value.name.trim() || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

function selectionKey(value: SelectionItem): string {
  return value.speakerId
    ? `speaker:${value.speakerId}`
    : value.personId
      ? `person:${value.personId}`
      : `name:${value.name.trim().toLowerCase()}`;
}

function normalizeHeadcount(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return fallback;
}

function initialBudgetLinkMap(session: Matrix2Session): Map<string, LinkedBudgetLineItem> {
  const next = new Map<string, LinkedBudgetLineItem>();
  for (const selection of session.requirementSelections) {
    if (selection.linkedBudgetLineItem) {
      next.set(selection.itemId, selection.linkedBudgetLineItem);
    }
  }
  return next;
}

function initialRequirementSelectionMap(
  session: Matrix2Session,
  sections: Matrix2RequirementTemplate["sections"],
): Record<string, string> {
  const activeItemIds = new Set(
    sections.flatMap((section) => {
      const sectionType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
      return section.items
        .filter((item) => item.active)
        .filter((item) => sectionType !== "STAFFING" || isStaffingNeedRequirementItem(item))
        .map((item) => item.id);
    }),
  );
  const next: Record<string, string> = {};
  for (const selection of session.requirementSelections) {
    if (!activeItemIds.has(selection.itemId)) continue;
    next[selection.itemId] =
      selection.quantity === null || typeof selection.quantity === "undefined"
        ? ""
        : String(selection.quantity);
  }

  for (const section of sections) {
    const sectionType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
    const activeItems = section.items
      .filter((item) => item.active)
      .filter((item) => sectionType !== "STAFFING" || isStaffingNeedRequirementItem(item));
    const alreadySelected = activeItems.some((item) => Object.prototype.hasOwnProperty.call(next, item.id));
    if (alreadySelected) continue;

    if (sectionType === "SETUP") {
      const setupMatch = activeItems.find((item) => item.label.trim().toLowerCase() === session.roomSetup.trim().toLowerCase());
      if (setupMatch) {
        next[setupMatch.id] = "";
      }
      continue;
    }

    if (sectionType === "STATUS") {
      const statusMatch = activeItems.find((item) => item.label.trim().toLowerCase() === session.status.trim().toLowerCase());
      if (statusMatch) {
        next[statusMatch.id] = "";
      } else if (activeItems[0]) {
        next[activeItems[0].id] = "";
      }
    }
  }

  return next;
}

const BASICS_ROSTER_STATUS_LABELS: Record<BasicsRosterStatus, string> = {
  REGISTERED: "Registered",
  SELECTED: "Selected",
  WAITLISTED: "Waitlisted",
  CANCELLED: "Cancelled",
  CHECKED_IN: "Checked in",
  NO_SHOW: "No-show",
};

function basicsRosterStatusChip(status: BasicsRosterStatus): string {
  if (status === "CHECKED_IN") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "WAITLISTED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "CANCELLED" || status === "NO_SHOW") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function matchesSearch(parts: Array<string | null | undefined>, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return parts
    .map((part) => part?.trim().toLowerCase() ?? "")
    .filter(Boolean)
    .join(" ")
    .includes(normalizedQuery);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function selectionFromSpeaker(speaker: Matrix2EventSpeakerRecord): SelectionItem {
  return {
    speakerId: speaker.id,
    name: speaker.name,
    title: speaker.title,
    company: speaker.company,
    email: speaker.email,
    status: speaker.status,
  };
}

type DrawerSelectorKey = Matrix2QuickPanelKey | "conflicts" | null;

function QuickDrawerModuleSwitcher({
  activePanel,
  onSwitch,
  conflictCount,
}: {
  activePanel: DrawerSelectorKey;
  onSwitch: (panel: DrawerSelectorKey) => void;
  conflictCount: number;
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/85 p-1 shadow-sm" aria-label="Quick drawer modules">
      {conflictCount > 0 ? (
        <button type="button" onClick={() => onSwitch("conflicts")} aria-pressed={activePanel === "conflicts"} className={["inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition", activePanel === "conflicts" ? "bg-amber-600 text-white shadow-sm" : "bg-amber-50 text-amber-800 hover:bg-amber-100"].join(" ")}>
          <AlertTriangle className="h-3.5 w-3.5" /> Conflicts {conflictCount}
        </button>
      ) : null}
      <button type="button" onClick={() => onSwitch(null)} aria-pressed={activePanel === null} className={["inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition", activePanel === null ? "bg-[#28439A] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"].join(" ")}>
        <ClipboardList className="h-3.5 w-3.5" /> Details
      </button>
      {MATRIX2_QUICK_DRAWER_MODULES.map((item) => {
        const active = activePanel === item.quickPanel;
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            type="button"
            onClick={() => onSwitch(item.quickPanel)}
            aria-pressed={active}
            className={[
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition",
              active
                ? "bg-[#28439A] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function QuickPanelShell({
  title,
  icon,
  search,
  onSearchChange,
  placeholder,
  children,
}: {
  title: string;
  icon: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
      data-session-quick-panel
      role="region"
      aria-label={`${title} quick panel`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 ring-1 ring-slate-200">
            {icon}
          </span>
          <h4 className="truncate text-[13px] font-semibold text-slate-900">{title}</h4>
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white pr-2.5 pl-8 text-[12px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10"
          />
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyQuickSelection({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-[12px] text-slate-500">
      {children}
    </div>
  );
}

function QuickListRow({
  title,
  meta,
  actionLabel,
  actionTone = "add",
  disabled = false,
  onAction,
}: {
  title: string;
  meta?: string;
  actionLabel: string;
  actionTone?: "add" | "remove";
  disabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-slate-900">{title}</p>
        {meta ? <p className="truncate text-[11px] text-slate-500">{meta}</p> : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onAction}
        aria-label={`${actionLabel} ${title}`}
        className={[
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold disabled:opacity-50",
          actionTone === "remove"
            ? "border-rose-200 bg-rose-50/50 text-rose-700 hover:bg-rose-50"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        ].join(" ")}
      >
        {actionTone === "remove" ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        {actionLabel}
      </button>
    </div>
  );
}

export default function Matrix2DetailsDrawer({
  session,
  conflicts,
  onViewConflictingSession,
  rooms,
  people,
  requirementTemplate,
  isBusy,
  initialQuickPanel = null,
  onClose,
  onSaveEdit,
}: Matrix2DetailsDrawerProps) {
  const terminology = useEventTerminology();
  const [localRequirementSections, setLocalRequirementSections] = useState<Matrix2RequirementTemplate["sections"]>(
    () => requirementTemplate?.sections ?? [],
  );
  const requirementSections = localRequirementSections;

  const [title, setTitle] = useState(session.title);
  const [sessionType, setSessionType] = useState(session.sessionType || DEFAULT_SESSION_TYPE);
  const sessionTypeOptions = useMemo(() => {
    return sessionTypeOptionsForSavedValue(sessionType);
  }, [sessionType]);
  const [roomId, setRoomId] = useState(session.roomId ?? "");
  const [startTime, setStartTime] = useState(session.startTime);
  const [endTime, setEndTime] = useState(session.endTime);
  const [expectedAttendanceText] = useState(
    session.expectedAttendance === null || typeof session.expectedAttendance === "undefined"
      ? ""
      : String(session.expectedAttendance),
  );
  const [notes] = useState(session.notes || "");

  const [activeQuickPanel, setActiveQuickPanel] = useState<DrawerSelectorKey>(initialQuickPanel);
  const [quickPanelSearch, setQuickPanelSearch] = useState("");
  const [fnbCategoryFilter, setFnbCategoryFilter] = useState("All");
  const [quickPanelError, setQuickPanelError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [workingQuickItemId, setWorkingQuickItemId] = useState<string | null>(null);
  const [eventSpeakers, setEventSpeakers] = useState<Matrix2EventSpeakerRecord[]>([]);
  const [isQuickSpeakerFormOpen, setIsQuickSpeakerFormOpen] = useState(false);
  const [quickSpeakerFirstName, setQuickSpeakerFirstName] = useState("");
  const [quickSpeakerLastName, setQuickSpeakerLastName] = useState("");
  const [quickSpeakerEmail, setQuickSpeakerEmail] = useState("");
  const [isCreatingQuickSpeaker, setIsCreatingQuickSpeaker] = useState(false);
  const [fnbCatalogItems, setFnbCatalogItems] = useState<FnbLibraryItem[]>([]);
  const [basicsRoster, setBasicsRoster] = useState<BasicsRosterEnrollment[]>([]);
  const [basicsAttendees, setBasicsAttendees] = useState<BasicsAttendeeOption[]>([]);
  const [basicsAttendeeSearch, setBasicsAttendeeSearch] = useState("");
  const [selectedBasicsAttendeeId, setSelectedBasicsAttendeeId] = useState("");
  const [basicsRosterLoading, setBasicsRosterLoading] = useState(true);
  const [basicsRosterError, setBasicsRosterError] = useState<string | null>(null);
  const [workingBasicsRosterId, setWorkingBasicsRosterId] = useState<string | null>(null);
  const sessionRegistrationComingSoon = shouldGateSessionRegistration();

  const [selectedSpeakers, setSelectedSpeakers] = useState<SelectionItem[]>(initialSpeakerSelection(session));
  const [selectedStaff, setSelectedStaff] = useState<SelectionItem[]>(initialStaffSelection(session));
  const [selectedRequirementValues, setSelectedRequirementValues] = useState<Record<string, string>>(
    initialRequirementSelectionMap(session, requirementSections),
  );
  const [requirementBudgetLinksByItemId, setRequirementBudgetLinksByItemId] = useState<Map<string, LinkedBudgetLineItem>>(
    () => initialBudgetLinkMap(session),
  );
  const [fnbAssignments, setFnbAssignments] = useState<SessionFnbCatalogAssignment[]>([]);
  const typedRequirementSections = useMemo(
    () => requirementSections.map((section) => ({
      section,
      sectionType: inferSessionRequirementCatalogType({ key: section.key, label: section.label }),
    })),
    [requirementSections],
  );
  const roomSetupSection = useMemo(
    () => typedRequirementSections.find((entry) => entry.sectionType === "SETUP")?.section ?? null,
    [typedRequirementSections],
  );
  const statusSection = useMemo(
    () => typedRequirementSections.find((entry) => entry.sectionType === "STATUS")?.section ?? null,
    [typedRequirementSections],
  );

  const requirementItemsById = useMemo(() => {
    const next = new Map<string, { label: string; hasQuantity: boolean; sectionType: SessionRequirementCatalogType }>();
    for (const section of requirementSections) {
      const sectionType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
      for (const item of section.items) {
        if (sectionType === "STAFFING" && !isStaffingNeedRequirementItem(item)) continue;
        next.set(item.id, {
          label: item.label,
          hasQuantity: item.hasQuantity,
          sectionType,
        });
      }
    }
    return next;
  }, [requirementSections]);
  useEffect(() => {
    setRequirementBudgetLinksByItemId(initialBudgetLinkMap(session));
  }, [session]);

  useEffect(() => {
    setActiveQuickPanel(initialQuickPanel);
    setQuickPanelSearch("");
    setFnbCategoryFilter("All");
    setQuickPanelError(null);
    setIsQuickSpeakerFormOpen(false);
  }, [initialQuickPanel, session.id]);

  // Tracks which session/event each quick panel's data has been loaded for, so
  // switching between panels does not refetch and switching sessions refetches.
  const loadedPanelDataRef = useRef<{
    speakers: string | null;
    fnbCatalog: string | null;
    fnbAssignments: string | null;
    basicsRoster: string | null;
    basicsAttendees: string | null;
  }>({ speakers: null, fnbCatalog: null, fnbAssignments: null, basicsRoster: null, basicsAttendees: null });
  // True once F&B catalog assignments have actually loaded for this session. The
  // save payload folds assignment names into `foodAndBeverage`; when the F&B panel
  // was never opened we fall back to the snapshot labels so saving from another
  // panel never drops the session's existing F&B items.
  const fnbAssignmentsLoadedRef = useRef(false);

  const loadFnbAssignments = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${session.eventId}/matrix-2/sessions/${session.id}/fnb-catalog-assignments`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load F&B assignments"));
      }
      setFnbAssignments(Array.isArray(payload) ? (payload as SessionFnbCatalogAssignment[]) : []);
      fnbAssignmentsLoadedRef.current = true;
    } catch {
      setFnbAssignments([]);
    }
  }, [session.eventId, session.id]);

  const loadBasicsRoster = useCallback(async () => {
    if (sessionRegistrationComingSoon) {
      setBasicsRosterLoading(false);
      setBasicsRosterError(null);
      return;
    }
    setBasicsRosterLoading(true);
    setBasicsRosterError(null);
    try {
      const response = await fetch(`/api/events/${session.eventId}/matrix-2/sessions/${session.rowId}/attendees`, { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load attendee roster"));
      }
      setBasicsRoster(Array.isArray(payload?.roster) ? (payload.roster as BasicsRosterEnrollment[]) : []);
    } catch (error) {
      setBasicsRosterError(error instanceof Error ? error.message : "Failed to load attendee roster");
    } finally {
      setBasicsRosterLoading(false);
    }
  }, [session.eventId, session.rowId, sessionRegistrationComingSoon]);

  const loadBasicsAttendees = useCallback(async () => {
    if (sessionRegistrationComingSoon) {
      setBasicsAttendees([]);
      return;
    }
    try {
      const response = await fetch(`/api/events/${session.eventId}/attendees?limit=200`, { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load attendees"));
      }
      setBasicsAttendees(Array.isArray(payload?.attendees) ? (payload.attendees as BasicsAttendeeOption[]) : []);
    } catch (error) {
      setBasicsRosterError(error instanceof Error ? error.message : "Failed to load attendees");
    }
  }, [session.eventId, sessionRegistrationComingSoon]);

  // Basics / root view only: load the session roster and the attendee picker.
  // Speakers/AV/F&B/Staffing panels never trigger these fetches.
  useEffect(() => {
    if (activeQuickPanel !== null) return;
    if (loadedPanelDataRef.current.basicsRoster !== session.rowId) {
      loadedPanelDataRef.current.basicsRoster = session.rowId;
      void loadBasicsRoster();
    }
    if (loadedPanelDataRef.current.basicsAttendees !== session.eventId) {
      loadedPanelDataRef.current.basicsAttendees = session.eventId;
      void loadBasicsAttendees();
    }
  }, [activeQuickPanel, session.rowId, session.eventId, loadBasicsAttendees, loadBasicsRoster]);

  const loadSpeakers = useCallback(async (): Promise<Matrix2EventSpeakerRecord[]> => {
    try {
      const response = await fetch(`/api/events/${session.eventId}/speakers`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load speakers"));
      }
      const speakers = Array.isArray(payload) ? (payload as Matrix2EventSpeakerRecord[]) : [];
      setEventSpeakers(speakers);
      return speakers;
    } catch {
      setEventSpeakers([]);
      return [];
    }
  }, [session.eventId]);

  const loadFnbCatalog = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${session.eventId}/fnb-catalog`, { cache: "no-store" });
      const payload = await response.json();
      setFnbCatalogItems(
        payload &&
        typeof payload === "object" &&
        "items" in payload &&
        Array.isArray((payload as { items?: unknown }).items)
          ? ((payload as { items: FnbLibraryItem[] }).items)
          : [],
      );
    } catch {
      setFnbCatalogItems([]);
    }
  }, [session.eventId]);

  // Speakers panel: load the event speaker directory on first open only.
  useEffect(() => {
    if (activeQuickPanel !== "speakers") return;
    if (loadedPanelDataRef.current.speakers === session.eventId) return;
    loadedPanelDataRef.current.speakers = session.eventId;
    void loadSpeakers();
  }, [activeQuickPanel, session.eventId, loadSpeakers]);

  // F&B panel: load the event catalog and this session's assignments on first
  // open only. AV and Staffing are snapshot-served and fetch nothing here.
  useEffect(() => {
    if (activeQuickPanel !== "fnb") return;
    if (loadedPanelDataRef.current.fnbCatalog !== session.eventId) {
      loadedPanelDataRef.current.fnbCatalog = session.eventId;
      void loadFnbCatalog();
    }
    if (loadedPanelDataRef.current.fnbAssignments !== session.id) {
      loadedPanelDataRef.current.fnbAssignments = session.id;
      void loadFnbAssignments();
    }
  }, [activeQuickPanel, session.eventId, session.id, loadFnbCatalog, loadFnbAssignments]);

  useEffect(() => {
    setLocalRequirementSections(requirementTemplate?.sections ?? []);
  }, [requirementTemplate]);

  const selectedRoomSetupItem = useMemo(() => {
    if (!roomSetupSection) return null;
    return roomSetupSection.items
      .filter((item) => item.active)
      .find((item) => Object.prototype.hasOwnProperty.call(selectedRequirementValues, item.id)) ?? null;
  }, [roomSetupSection, selectedRequirementValues]);

  const selectedStatusItem = useMemo(() => {
    if (!statusSection) return null;
    return statusSection.items
      .filter((item) => item.active)
      .find((item) => Object.prototype.hasOwnProperty.call(selectedRequirementValues, item.id)) ?? null;
  }, [selectedRequirementValues, statusSection]);

  const selectedStatusLabel = selectedStatusItem?.label ?? session.status ?? "";

  const requirementItemsByType = useMemo(() => {
    const next: Record<"AV" | "FNB" | "STAFFING", Array<{ id: string; label: string; hasQuantity: boolean }>> = {
      AV: [],
      FNB: [],
      STAFFING: [],
    };

    for (const section of requirementSections) {
      const sectionType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
      if (sectionType !== "AV" && sectionType !== "FNB" && sectionType !== "STAFFING") continue;
      for (const item of section.items) {
        if (!item.active) continue;
        if (sectionType === "STAFFING" && !isStaffingNeedRequirementItem(item)) continue;
        next[sectionType].push({
          id: item.id,
          label: item.label,
          hasQuantity: item.hasQuantity,
        });
      }
    }

    return next;
  }, [requirementSections]);

  const selectedRequirementItemsByType = useMemo(() => {
    const selectedIds = new Set(Object.keys(selectedRequirementValues));
    return {
      AV: requirementItemsByType.AV.filter((item) => selectedIds.has(item.id)),
      FNB: requirementItemsByType.FNB.filter((item) => selectedIds.has(item.id)),
      STAFFING: requirementItemsByType.STAFFING.filter((item) => selectedIds.has(item.id)),
    };
  }, [requirementItemsByType, selectedRequirementValues]);

  const selectedFnbCatalogItemIds = useMemo(
    () => new Set(fnbAssignments.map((assignment) => assignment.eventFnbCatalogItemId)),
    [fnbAssignments],
  );

  const availableStaffPeople = useMemo(
    () => people.filter((person) => person.role === "staff" || person.role === "vendor"),
    [people],
  );

  const filteredEventSpeakers = useMemo(() => (
    eventSpeakers
      .filter((speaker) => !selectedSpeakers.some((selection) => selection.speakerId === speaker.id))
      .filter((speaker) => matchesSearch([speaker.name, speaker.title, speaker.company, speaker.email], quickPanelSearch))
      .slice(0, 12)
  ), [eventSpeakers, quickPanelSearch, selectedSpeakers]);

  const filteredAvItems = useMemo(() => (
    requirementItemsByType.AV
      .filter((item) => !Object.prototype.hasOwnProperty.call(selectedRequirementValues, item.id))
      .filter((item) => matchesSearch([item.label], quickPanelSearch))
      .slice(0, 12)
  ), [quickPanelSearch, requirementItemsByType.AV, selectedRequirementValues]);

  const fnbCategoryFilters = useMemo(
    () => ["All", ...availableFnbPickerCategories(fnbCatalogItems)],
    [fnbCatalogItems],
  );

  const filteredFnbCatalogItems = useMemo(() => filterAvailableFnbCatalogItems({
    items: fnbCatalogItems,
    assignedItemIds: selectedFnbCatalogItemIds,
    category: fnbCategoryFilter,
    search: quickPanelSearch,
  }), [fnbCatalogItems, fnbCategoryFilter, quickPanelSearch, selectedFnbCatalogItemIds]);

  const filteredStaffPeople = useMemo(() => {
    const selectedKeys = new Set(selectedStaff.map(selectionKey));
    return availableStaffPeople
      .filter((person) => !selectedKeys.has(`person:${person.id}`))
      .filter((person) => matchesSearch([person.name, person.role, person.company, person.email], quickPanelSearch))
      .slice(0, 10);
  }, [availableStaffPeople, quickPanelSearch, selectedStaff]);

  const filteredStaffingRoleItems = useMemo(() => (
    requirementItemsByType.STAFFING
      .filter((item) => !Object.prototype.hasOwnProperty.call(selectedRequirementValues, item.id))
      .filter((item) => matchesSearch([item.label], quickPanelSearch))
      .slice(0, 8)
  ), [quickPanelSearch, requirementItemsByType.STAFFING, selectedRequirementValues]);

  const enrolledBasicsAttendeeIds = useMemo(() => new Set(basicsRoster.map((item) => item.attendeeId)), [basicsRoster]);
  const filteredBasicsAttendees = useMemo(() => (
    basicsAttendees
      .filter((attendee) => !enrolledBasicsAttendeeIds.has(attendee.id))
      .filter((attendee) => matchesSearch([attendee.displayName, attendee.company, attendee.email], basicsAttendeeSearch))
      .slice(0, 30)
  ), [basicsAttendeeSearch, basicsAttendees, enrolledBasicsAttendeeIds]);

  useEffect(() => {
    if (selectedBasicsAttendeeId && filteredBasicsAttendees.some((attendee) => attendee.id === selectedBasicsAttendeeId)) return;
    setSelectedBasicsAttendeeId(filteredBasicsAttendees[0]?.id ?? "");
  }, [filteredBasicsAttendees, selectedBasicsAttendeeId]);

  const fullWorkspaceHref = useMemo(() => {
    const baseHref = runOfShowSessionHref(session.eventId, session.id);
    return activeQuickPanel ? `${baseHref}#${activeQuickPanel}` : baseHref;
  }, [activeQuickPanel, session.eventId, session.id]);

  const activeConflicts = useMemo(() => Array.from(new Map(conflicts.map((conflict) => [conflict.id, conflict])).values()), [conflicts]);

  useEffect(() => {
    if (activeQuickPanel === "conflicts" && activeConflicts.length === 0) {
      setActiveQuickPanel(null);
    }
  }, [activeConflicts.length, activeQuickPanel]);

  function switchQuickPanel(panel: DrawerSelectorKey): void {
    setActiveQuickPanel(panel);
    setQuickPanelSearch("");
    setQuickPanelError(null);
  }

  function addRequirementItem(itemId: string): void {
    setSelectedRequirementValues((current) => ({
      ...current,
      [itemId]: current[itemId] ?? "",
    }));
  }

  function removeRequirementItem(itemId: string): void {
    setSelectedRequirementValues((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  async function assignSpeakerToSession(speaker: Matrix2EventSpeakerRecord): Promise<void> {
    const response = await fetch(`/api/events/${session.eventId}/matrix-2/sessions/${session.id}/speakers/${speaker.id}`, {
      method: "POST",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(toErrorMessage(payload, "Failed to assign speaker"));
    }
  }

  async function createOrReuseSpeakerFromQuickPanel(): Promise<void> {
    const firstName = quickSpeakerFirstName.trim();
    const lastName = quickSpeakerLastName.trim();
    const email = normalizeEmail(quickSpeakerEmail);

    if (!firstName || !lastName) {
      setQuickPanelError("First name and last name are required.");
      return;
    }
    if (!isValidEmail(email)) {
      setQuickPanelError("Enter a valid speaker email.");
      return;
    }

    setIsCreatingQuickSpeaker(true);
    setQuickPanelError(null);

    try {
      let speaker: Matrix2EventSpeakerRecord | null = null;
      const createResponse = await fetch(`/api/events/${session.eventId}/speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`,
          email,
        }),
      });
      const createPayload = await createResponse.json().catch(() => null);

      if (createResponse.ok) {
        speaker = createPayload as Matrix2EventSpeakerRecord;
        setEventSpeakers((current) => (
          current.some((entry) => entry.id === speaker?.id)
            ? current
            : [...current, speaker as Matrix2EventSpeakerRecord].sort((left, right) => left.name.localeCompare(right.name))
        ));
      } else if (createResponse.status === 409) {
        const speakers = await loadSpeakers();
        speaker = speakers.find((entry) => normalizeEmail(entry.email ?? "") === email) ?? null;
        if (!speaker) {
          throw new Error(toErrorMessage(createPayload, "A speaker with that email already exists for this event."));
        }
      } else {
        throw new Error(toErrorMessage(createPayload, "Failed to create speaker"));
      }

      await assignSpeakerToSession(speaker);
      setSelectedSpeakers((current) => uniqueSelections([...current, selectionFromSpeaker(speaker)]));
      setQuickSpeakerFirstName("");
      setQuickSpeakerLastName("");
      setQuickSpeakerEmail("");
      setIsQuickSpeakerFormOpen(false);
      setQuickPanelSearch("");
      loadedPanelDataRef.current.speakers = session.eventId;
      void loadSpeakers();
    } catch (error) {
      setQuickPanelError(error instanceof Error ? error.message : "Failed to create speaker");
    } finally {
      setIsCreatingQuickSpeaker(false);
    }
  }

  async function addFnbCatalogAssignment(item: FnbLibraryItem): Promise<void> {
    setWorkingQuickItemId(item.id);
    setQuickPanelError(null);
    try {
      const response = await fetch(`/api/events/${session.eventId}/matrix-2/sessions/${session.id}/fnb-catalog-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventFnbCatalogItemId: item.id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to assign F&B item"));
      }
      setFnbAssignments((current) => mergeFnbPickerAssignment(current, payload as SessionFnbCatalogAssignment));
      await loadFnbAssignments();
    } catch (error) {
      setQuickPanelError(error instanceof Error ? error.message : "Failed to assign F&B item");
    } finally {
      setWorkingQuickItemId(null);
    }
  }

  async function removeFnbCatalogAssignment(assignment: SessionFnbCatalogAssignment): Promise<void> {
    setWorkingQuickItemId(assignment.id);
    setQuickPanelError(null);
    try {
      const response = await fetch(
        `/api/events/${session.eventId}/matrix-2/sessions/${session.id}/fnb-catalog-assignments/${assignment.id}`,
        { method: "DELETE" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to remove F&B item"));
      }
      setFnbAssignments((current) => removeFnbPickerAssignment(current, assignment.id));
      await loadFnbAssignments();
    } catch (error) {
      setQuickPanelError(error instanceof Error ? error.message : "Failed to remove F&B item");
    } finally {
      setWorkingQuickItemId(null);
    }
  }

  async function addBasicsAttendee(): Promise<void> {
    if (sessionRegistrationComingSoon) return;
    if (!selectedBasicsAttendeeId) return;
    setWorkingBasicsRosterId(selectedBasicsAttendeeId);
    setBasicsRosterError(null);
    try {
      const response = await fetch(`/api/events/${session.eventId}/matrix-2/sessions/${session.rowId}/attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ attendeeId: selectedBasicsAttendeeId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to register attendee"));
      }
      setBasicsAttendeeSearch("");
      await loadBasicsRoster();
    } catch (error) {
      setBasicsRosterError(error instanceof Error ? error.message : "Failed to register attendee");
    } finally {
      setWorkingBasicsRosterId(null);
    }
  }

  async function cancelBasicsEnrollment(enrollmentId: string): Promise<void> {
    if (sessionRegistrationComingSoon) return;
    setWorkingBasicsRosterId(enrollmentId);
    setBasicsRosterError(null);
    try {
      const response = await fetch(`/api/events/${session.eventId}/matrix-2/sessions/${session.rowId}/attendees/${enrollmentId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to remove attendee"));
      }
      await loadBasicsRoster();
    } catch (error) {
      setBasicsRosterError(error instanceof Error ? error.message : "Failed to remove attendee");
    } finally {
      setWorkingBasicsRosterId(null);
    }
  }

  async function handleSave(): Promise<void> {
    setSaveError(null);
    try {
    const parsedAttendance = normalizeHeadcount(expectedAttendanceText);
    const normalizedSpeakers = uniqueSelections(selectedSpeakers)
      .map((entry) => ({
        speakerId: entry.speakerId,
        name: entry.name.trim(),
        title: entry.title ?? null,
        company: entry.company ?? null,
        email: entry.email ?? null,
      }))
      .filter((entry) => entry.name);
    const normalizedStaff = uniqueSelections(selectedStaff)
      .map((entry) => ({
        personId: entry.personId,
        name: entry.name.trim(),
        role: entry.personRole ?? null,
        company: entry.company ?? null,
        email: entry.email ?? null,
        assignmentRole: (entry.assignmentRole ?? "").trim() || null,
      }))
      .filter((entry) => entry.name);

    const requirementSelections = Object.entries(selectedRequirementValues)
      .filter(([itemId]) => requirementItemsById.has(itemId))
      .map(([itemId, quantityText]) => {
        const item = requirementItemsById.get(itemId);
        if (!item) return null;
        const quantity = item.hasQuantity ? parseSessionRequirementQuantity(quantityText, item.label) : null;
        return {
          itemId,
          quantity,
        };
      })
      .filter((entry): entry is { itemId: string; quantity: number | null } => Boolean(entry));

    const foodSelection = requirementSelections.find((selection) => {
      const item = requirementItemsById.get(selection.itemId);
      return Boolean(item && item.sectionType === "FNB");
    });
    const foodItem = foodSelection ? requirementItemsById.get(foodSelection.itemId) : null;
    // When the F&B panel was never opened this session, `fnbAssignments` has not
    // been fetched — fall back to the snapshot's existing F&B labels so saving
    // from another panel never drops the session's catalog assignments.
    const fnbCatalogLabels = fnbAssignmentsLoadedRef.current
      ? fnbAssignments.map((assignment) => assignment.catalogItem.itemName)
      : session.foodAndBeverage;
    const fnbRequirementLabels = fnbAssignmentsLoadedRef.current
      ? []
      : selectedRequirementItemsByType.FNB.map((item) => item.label);
    const selectedFnbLabels = Array.from(new Set([
      ...fnbRequirementLabels,
      ...fnbCatalogLabels,
    ].map((label) => label.trim()).filter(Boolean)));
    const resolvedRoomSetupType = selectedRoomSetupItem?.label ?? "";

    function displayNameForRequirementItem(itemId: string, templateLabel: string): string {
      return requirementBudgetLinksByItemId.get(itemId)?.lineItem ?? templateLabel;
    }

    const avRequirements = requirementSelections
      .map((selection) => {
        const item = requirementItemsById.get(selection.itemId);
        if (!item || item.sectionType !== "AV") return null;
        return {
          avType: displayNameForRequirementItem(selection.itemId, item.label),
          quantity: selection.quantity,
        };
      })
      .filter((entry): entry is { avType: string; quantity: number | null } => Boolean(entry));

    await onSaveEdit(session.id, {
      title: title.trim() || "Untitled Session",
      sessionType: sessionType || DEFAULT_SESSION_TYPE,
      status: selectedStatusLabel.trim(),
      roomId: roomId.trim() || null,
      startTime,
      endTime,
      expectedAttendance: parsedAttendance,
      roomSetupType: resolvedRoomSetupType,
      speakers: normalizedSpeakers,
      requirementSelections,
      avRequirements,
      foodService: foodItem && foodSelection
        ? {
            serviceType: displayNameForRequirementItem(foodSelection.itemId, foodItem.label),
            serviceStyle: null,
            headcount: parsedAttendance,
          }
        : null,
      foodAndBeverage: selectedFnbLabels,
      staffAssignments: normalizedStaff,
      notes: notes.trim(),
    });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save session");
    }
  }

  function renderQuickPanel(): ReactNode {
    if (!activeQuickPanel) return null;

    if (activeQuickPanel === "conflicts") {
      return <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm" data-session-conflict-summary role="region" aria-label="Session conflicts"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-700" /><div><h4 className="text-[13px] font-semibold text-amber-950">Active conflicts</h4><p className="text-[11px] text-amber-800">Resolve these items before finalizing the session.</p></div></div><div className="mt-3 space-y-2">{activeConflicts.map((conflict) => { const relatedSessionId = conflict.sessionIds.find((id) => id !== session.id); const isSpeaker = conflict.type === "SPEAKER_DOUBLE_BOOKED"; const isRoom = conflict.type === "ROOM_OVERLAP" || conflict.type === "ROOM_CAPACITY_EXCEEDED"; const actionLabel = isSpeaker ? "Resolve in Speakers" : isRoom ? "Open Room Set" : "Review Staffing"; const affected = conflict.speakerName ?? conflict.roomName ?? relatedSessionId ?? "This session"; const action = () => { if (isSpeaker) return switchQuickPanel("speakers"); if (isRoom) { window.location.assign(roomSetHref(session.eventId, session.id, "layout")); return; } switchQuickPanel("staffing"); }; return <article key={conflict.id} className="rounded-xl border border-amber-100 bg-white/90 p-2.5"><p className="text-[12px] font-semibold text-slate-900">{isSpeaker ? "Speaker conflict" : conflict.type === "ROOM_OVERLAP" ? "Room conflict" : conflict.type === "ROOM_CAPACITY_EXCEEDED" ? "Capacity conflict" : "Staffing conflict"}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-600">{conflict.message}</p><p className="mt-1 text-[11px] font-medium text-slate-700">Affected: {affected}</p><div className="mt-2 flex gap-2"><button type="button" onClick={action} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100">{actionLabel}</button>{relatedSessionId ? <button type="button" onClick={() => onViewConflictingSession(relatedSessionId)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">View related session</button> : null}</div></article>; })}</div></section>;
    }

    if (activeQuickPanel === "speakers") {
      const selectedRealSpeakers = selectedSpeakers.filter(isRealSpeakerSelection);

      return (
        <QuickPanelShell
          title="Speakers"
          icon={<Mic className="h-4 w-4" />}
          search={quickPanelSearch}
          onSearchChange={setQuickPanelSearch}
          placeholder="Search speakers"
        >
          {quickPanelError ? <p className="mt-2 text-[12px] text-rose-600">{quickPanelError}</p> : null}
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[12px] font-semibold text-slate-800">New speaker</p>
                <p className="text-[11px] text-slate-500">Create in the event directory and assign to this session.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickSpeakerFormOpen((current) => !current)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {isQuickSpeakerFormOpen ? "Close" : "Add new"}
              </button>
            </div>
            {isQuickSpeakerFormOpen ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1.3fr_auto]">
                <input
                  value={quickSpeakerFirstName}
                  onChange={(event) => setQuickSpeakerFirstName(event.target.value)}
                  placeholder="First name"
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] outline-none focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10"
                />
                <input
                  value={quickSpeakerLastName}
                  onChange={(event) => setQuickSpeakerLastName(event.target.value)}
                  placeholder="Last name"
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] outline-none focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10"
                />
                <input
                  type="email"
                  value={quickSpeakerEmail}
                  onChange={(event) => setQuickSpeakerEmail(event.target.value)}
                  placeholder="Email"
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] outline-none focus:border-[#28439A]/40 focus:ring-2 focus:ring-[#28439A]/10"
                />
                <button
                  type="button"
                  onClick={() => {
                    void createOrReuseSpeakerFromQuickPanel();
                  }}
                  disabled={isCreatingQuickSpeaker}
                  className="h-8 rounded-lg bg-[#28439A] px-3 text-[11px] font-semibold text-white shadow-sm hover:bg-[#243d8e] disabled:opacity-50"
                >
                  {isCreatingQuickSpeaker ? "Adding..." : "Create"}
                </button>
              </div>
            ) : null}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Selected</p>
              <div className="space-y-1">
                {selectedRealSpeakers.length > 0 ? selectedRealSpeakers.map((speaker) => (
                  <QuickListRow
                    key={selectionKey(speaker)}
                    title={speaker.name}
                    meta={[speaker.title, speaker.company, speaker.email].filter(Boolean).join(" • ") || "Speaker directory"}
                    actionLabel="Remove"
                    actionTone="remove"
                    onAction={() => {
                      setSelectedSpeakers((current) => current.filter((entry) => selectionKey(entry) !== selectionKey(speaker)));
                    }}
                  />
                )) : <EmptyQuickSelection>No speakers assigned</EmptyQuickSelection>}
              </div>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Available</p>
              <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                {filteredEventSpeakers.length > 0 ? filteredEventSpeakers.map((speaker) => (
                  <QuickListRow
                    key={speaker.id}
                    title={speaker.name}
                    meta={[speaker.title, speaker.company, speaker.email, speaker.status === "CANCELLED" ? "Cancelled" : null].filter(Boolean).join(" • ") || "Speaker directory"}
                    actionLabel="Add"
                    disabled={speaker.status === "CANCELLED"}
                    onAction={() => {
                      setSelectedSpeakers((current) => uniqueSelections([
                        ...current,
                        {
                          speakerId: speaker.id,
                          name: speaker.name,
                          title: speaker.title,
                          company: speaker.company,
                          email: speaker.email,
                          status: speaker.status,
                        },
                      ]));
                    }}
                  />
                )) : <p className="px-2 py-3 text-[12px] text-slate-500">No speakers found</p>}
              </div>
            </div>
          </div>
        </QuickPanelShell>
      );
    }

    if (activeQuickPanel === "av") {
      return (
        <QuickPanelShell
          title="AV"
          icon={<Monitor className="h-4 w-4" />}
          search={quickPanelSearch}
          onSearchChange={setQuickPanelSearch}
          placeholder="Search AV"
        >
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Selected</p>
              <div className="space-y-1">
                {selectedRequirementItemsByType.AV.length > 0 ? selectedRequirementItemsByType.AV.map((item) => (
                  <QuickListRow
                    key={item.id}
                    title={item.label}
                    meta={item.hasQuantity ? "Quantity can be set in the full workspace" : "Requirement selected"}
                    actionLabel="Remove"
                    actionTone="remove"
                    onAction={() => removeRequirementItem(item.id)}
                  />
                )) : <EmptyQuickSelection>No AV requirements assigned</EmptyQuickSelection>}
              </div>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Available</p>
              <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                {filteredAvItems.length > 0 ? filteredAvItems.map((item) => (
                  <QuickListRow
                    key={item.id}
                    title={item.label}
                    meta={item.hasQuantity ? "Quantity-capable requirement" : "Requirement"}
                    actionLabel="Add"
                    onAction={() => addRequirementItem(item.id)}
                  />
                )) : <p className="px-2 py-3 text-[12px] text-slate-500">No AV items found</p>}
              </div>
            </div>
          </div>
        </QuickPanelShell>
      );
    }

    if (activeQuickPanel === "fnb") {
      const hasSelectedFnb = fnbAssignments.length > 0;

      return (
        <QuickPanelShell
          title="F&B"
          icon={<UtensilsCrossed className="h-4 w-4" />}
          search={quickPanelSearch}
          onSearchChange={setQuickPanelSearch}
          placeholder="Search menu or F&B"
        >
          {quickPanelError ? <p className="mt-2 text-[12px] text-rose-600">{quickPanelError}</p> : null}
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="F&B categories">
            {fnbCategoryFilters.map((category) => {
              const selected = category === fnbCategoryFilter;
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFnbCategoryFilter(category)}
                  className={[
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                    selected
                      ? "border-[#28439A] bg-[#eef2ff] text-[#28439A]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {category}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Selected</p>
              <div className="space-y-1">
                {hasSelectedFnb ? (
                  <>
                    {fnbAssignments.map((assignment) => (
                      <QuickListRow
                        key={assignment.id}
                        title={assignment.catalogItem.itemName}
                        meta={[assignment.catalogItem.category, assignment.catalogItem.price, assignment.catalogItem.sourceMenuFileName].filter(Boolean).join(" • ") || "Menu item"}
                        actionLabel="Remove"
                        actionTone="remove"
                        disabled={workingQuickItemId === assignment.id}
                        onAction={() => {
                          void removeFnbCatalogAssignment(assignment);
                        }}
                      />
                    ))}
                  </>
                ) : <EmptyQuickSelection>No F&B items selected</EmptyQuickSelection>}
              </div>
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Available</p>
              <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                {filteredFnbCatalogItems.map((item) => (
                  <QuickListRow
                    key={item.id}
                    title={item.itemName}
                    meta={[item.category, item.price, item.sourceMenuFileName].filter(Boolean).join(" • ") || "Menu item"}
                    actionLabel="Add"
                    disabled={workingQuickItemId === item.id}
                    onAction={() => {
                      void addFnbCatalogAssignment(item);
                    }}
                  />
                ))}
                {filteredFnbCatalogItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-[12px] text-slate-500">
                    <p className="font-semibold text-slate-600">
                      {fnbCatalogItems.length === 0 ? "No F&B catalog items yet" : "No F&B items found"}
                    </p>
                    {fnbCatalogItems.length === 0 ? (
                      <Link
                        href={`/events/${session.eventId}/fnb-catalog`}
                        className="mt-1 inline-flex text-[11px] font-semibold text-[#28439A] hover:text-[#1f3478]"
                      >
                        Upload menus in the F&B module
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </QuickPanelShell>
      );
    }

    const hasSelectedStaffing = selectedStaff.length > 0 || selectedRequirementItemsByType.STAFFING.length > 0;

    return (
      <QuickPanelShell
        title="Staffing"
        icon={<UsersRound className="h-4 w-4" />}
        search={quickPanelSearch}
        onSearchChange={setQuickPanelSearch}
        placeholder="Search staff or roles"
      >
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Assigned crew</p>
            <div className="space-y-1">
              {hasSelectedStaffing ? (
                <>
                  {selectedStaff.length > 0 ? (
                    selectedStaff.map((staff) => (
                      <QuickListRow
                        key={selectionKey(staff)}
                        title={staff.name}
                        meta={[staff.assignmentRole, staff.company, staff.email].filter(Boolean).join(" • ") || "Assigned crew"}
                        actionLabel="Remove"
                        actionTone="remove"
                        onAction={() => {
                          setSelectedStaff((current) => current.filter((entry) => selectionKey(entry) !== selectionKey(staff)));
                        }}
                      />
                    ))
                  ) : (
                    <EmptyQuickSelection>Crew assignment directory coming next</EmptyQuickSelection>
                  )}
                  <p className="pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Staffing needs</p>
                  {selectedRequirementItemsByType.STAFFING.length > 0 ? (
                    selectedRequirementItemsByType.STAFFING.map((item) => (
                      <QuickListRow
                        key={item.id}
                        title={item.label}
                        meta={item.hasQuantity ? "Role/count requirement" : "Staffing need"}
                        actionLabel="Remove"
                        actionTone="remove"
                        onAction={() => removeRequirementItem(item.id)}
                      />
                    ))
                  ) : (
                    <EmptyQuickSelection>No staffing needs selected</EmptyQuickSelection>
                  )}
                </>
              ) : <EmptyQuickSelection>No staffing needs or crew selected</EmptyQuickSelection>}
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Available crew and needs</p>
            <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
              {filteredStaffPeople.map((person) => (
                <QuickListRow
                  key={person.id}
                  title={person.name}
                  meta={[person.role, person.company, person.email].filter(Boolean).join(" • ") || "Event person"}
                  actionLabel="Add"
                  onAction={() => {
                    setSelectedStaff((current) => uniqueSelections([
                      ...current,
                      {
                        personId: person.id,
                        name: person.name,
                        personRole: person.role,
                        assignmentRole: null,
                        company: person.company,
                        email: person.email,
                      },
                    ]));
                  }}
                />
              ))}
              {filteredStaffingRoleItems.map((item) => (
                <QuickListRow
                  key={item.id}
                  title={item.label}
                  meta={item.hasQuantity ? "Quantity-capable role" : "Staffing role"}
                  actionLabel="Add"
                  onAction={() => addRequirementItem(item.id)}
                />
              ))}
              {filteredStaffPeople.length === 0 && filteredStaffingRoleItems.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-slate-500">No staffing matches found</p>
              ) : null}
            </div>
          </div>
        </div>
      </QuickPanelShell>
    );
  }

  const quickPanelContent = renderQuickPanel();

  return (
    <aside className="flex h-dvh max-h-dvh flex-col overflow-hidden border-l border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_52%,#f1f5f9_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.14)] sm:rounded-l-[1.1rem]">
      <div className="border-b border-slate-200/80 bg-white/88 p-3 shadow-[0_1px_0_rgba(255,255,255,0.9)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {quickPanelContent ? `${terminology.runOfShow} session` : "Session details"}
            </p>
            <h3 className="mt-0.5 truncate text-[21px] font-semibold leading-[25px] text-slate-950">{title || "Untitled session"}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-slate-600">
              <span>{formatTimeLabel(startTime)} - {formatTimeLabel(endTime)}</span>
              <span className="text-slate-300">·</span>
              <span>{rooms.find((room) => room.id === roomId)?.name ?? session.roomName ?? "Room unassigned"}</span>
              <span className="text-slate-300">·</span>
              <span>{sessionType || "Session"}</span>
              {selectedStatusLabel ? (
                <>
                  <span className="text-slate-300">·</span>
                  <span>{selectedStatusLabel}</span>
                </>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Close session details"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="shrink-0 px-3 pt-3">
        <QuickDrawerModuleSwitcher activePanel={activeQuickPanel} onSwitch={switchQuickPanel} conflictCount={activeConflicts.length} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {quickPanelContent ? quickPanelContent : (
        <div className="space-y-3">
        <section className="grid gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <div>
            <p className="text-[13px] font-semibold text-slate-900">Session info</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Edit the core {terminology.runOfShow} record for this session.</p>
          </div>
          <label className="grid gap-1">
            <span className="text-[12px] font-semibold text-slate-600">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm outline-none transition focus:border-[#28439A]/50 focus:ring-2 focus:ring-[#28439A]/10"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold text-slate-600">Session Type</span>
              <select
                value={sessionType}
                onChange={(event) => setSessionType(event.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm outline-none transition focus:border-[#28439A]/50 focus:ring-2 focus:ring-[#28439A]/10"
                aria-label="Session type"
              >
                {sessionTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold text-slate-600">Room</span>
              <select
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                aria-label="Session room"
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm outline-none transition focus:border-[#28439A]/50 focus:ring-2 focus:ring-[#28439A]/10"
              >
                <option value="">Unassigned</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold text-slate-600">Start</span>
              <TimeField
                value={startTime}
                onChange={setStartTime}
                size="compact"
                className="w-full"
                inputClassName="h-9 rounded-xl border-slate-200 px-3 text-[13px] text-slate-900 shadow-sm"
                ariaLabel="Session start time"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[12px] font-semibold text-slate-600">End</span>
              <TimeField
                value={endTime}
                onChange={setEndTime}
                size="compact"
                className="w-full"
                inputClassName="h-9 rounded-xl border-slate-200 px-3 text-[13px] text-slate-900 shadow-sm"
                ariaLabel="Session end time"
              />
            </label>
          </div>
        </section>

        {false ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm" aria-label="Session conflicts">
            <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-semibold text-amber-900">Conflicts</p><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{conflicts.length}</span></div>
            <div className="mt-2 space-y-2">{conflicts.map((conflict) => {
              const relatedSessionId = conflict.sessionIds.find((id) => id !== session.id);
              const type = conflict.type === "ROOM_OVERLAP" ? "Room conflict" : conflict.type === "SPEAKER_DOUBLE_BOOKED" ? "Speaker conflict" : "Capacity conflict";
              return <div key={conflict.id} className="rounded-xl border border-amber-100 bg-white/80 p-2"><p className="text-[12px] font-semibold text-slate-800">{type}</p><p className="mt-0.5 text-[11px] text-slate-600">{conflict.message}</p><div className="mt-2 flex flex-wrap gap-2">{relatedSessionId ? <button type="button" onClick={() => onViewConflictingSession(relatedSessionId)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">View conflicting session</button> : null}<button type="button" onClick={() => document.querySelector<HTMLSelectElement>('select[aria-label="Session room"]')?.focus()} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">Change room</button></div></div>;
            })}</div>
          </section>
        ) : null}

        {sessionRegistrationComingSoon ? <SessionRegistrationUnavailableCard compact /> : <section
          className={["rounded-2xl border p-3 shadow-sm", sessionRegistrationComingSoon ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-200/80 bg-white"].join(" ")}
          data-disabled={sessionRegistrationComingSoon ? "true" : undefined}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className={["text-[13px] font-semibold", sessionRegistrationComingSoon ? "text-slate-500" : "text-slate-900"].join(" ")}>Attendee registration</p>
              <p className={["mt-0.5 text-[11px]", sessionRegistrationComingSoon ? "text-slate-400" : "text-slate-500"].join(" ")}>
                {sessionRegistrationComingSoon ? SESSION_REGISTRATION_COMING_SOON_COPY : "Roster for this session only."}
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              {sessionRegistrationComingSoon ? SESSION_REGISTRATION_COMING_SOON_BADGE : `${basicsRoster.length} registered`}
            </span>
          </div>

          {sessionRegistrationComingSoon ? (
            <div
              className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-[12px] font-semibold text-slate-500"
              role="group"
              aria-disabled="true"
            >
              {SESSION_REGISTRATION_COMING_SOON_COPY}
            </div>
          ) : basicsRosterError ? (
            <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{basicsRosterError}</p>
          ) : null}

          {!sessionRegistrationComingSoon ? <div className="mt-3 space-y-2">
            {basicsRosterLoading ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-[12px] text-slate-500">Loading attendee roster...</p>
            ) : basicsRoster.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-[12px] text-slate-500">No attendees registered yet.</p>
            ) : (
              basicsRoster.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-900">{item.attendee?.displayName ?? "Attendee"}</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {[item.attendee?.company, item.attendee?.email].filter(Boolean).join(" · ") || "Event attendee"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${basicsRosterStatusChip(item.enrollmentStatus)}`}>
                      {BASICS_ROSTER_STATUS_LABELS[item.enrollmentStatus]}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void cancelBasicsEnrollment(item.id);
                    }}
                    disabled={workingBasicsRosterId === item.id}
                    className="mt-2 text-[11px] font-semibold text-slate-400 hover:text-rose-600 disabled:opacity-50"
                  >
                    {workingBasicsRosterId === item.id ? "Removing..." : "Remove from roster"}
                  </button>
                </div>
              ))
            )}
          </div> : null}

          {!sessionRegistrationComingSoon ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={basicsAttendeeSearch}
                onChange={(event) => setBasicsAttendeeSearch(event.target.value)}
                placeholder="Search event attendees"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-8 text-[12px] outline-none focus:border-slate-300"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <select
                value={selectedBasicsAttendeeId}
                onChange={(event) => setSelectedBasicsAttendeeId(event.target.value)}
                disabled={filteredBasicsAttendees.length === 0}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-600 disabled:opacity-60"
              >
                {filteredBasicsAttendees.length === 0 ? (
                  <option value="">No attendees available</option>
                ) : (
                  filteredBasicsAttendees.map((attendee) => (
                    <option key={attendee.id} value={attendee.id}>
                      {attendee.displayName}{attendee.company ? ` · ${attendee.company}` : ""}{attendee.email ? ` · ${attendee.email}` : ""}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => {
                  void addBasicsAttendee();
                }}
                disabled={!selectedBasicsAttendeeId || workingBasicsRosterId === selectedBasicsAttendeeId}
                className="h-9 shrink-0 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
              >
                Add attendee
              </button>
            </div>
          </div> : null}
        </section>}
        </div>
        )}
      </div>

      <footer
        className="grid min-h-[72px] shrink-0 grid-cols-2 items-center gap-3 border-t border-slate-200/80 bg-white/95 px-5 py-3 shadow-[0_-12px_28px_rgba(15,23,42,0.05)]"
        data-session-quick-drawer-footer
      >
          {saveError ? <p className="col-span-2 text-[12px] font-medium text-rose-600" role="alert">{saveError}</p> : null}
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void handleSave();
            }}
            className="h-11 w-full min-w-0 rounded-xl bg-[#28439A] px-4 text-[14px] font-semibold text-white shadow-[0_12px_26px_rgba(40,67,154,0.22)] transition hover:bg-[#243d8e] disabled:opacity-50"
          >
            {isBusy ? "Saving..." : "Save changes"}
          </button>
          <Link
            href={fullWorkspaceHref}
            className="inline-flex h-11 w-full min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[14px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            Full workspace
          </Link>
      </footer>
    </aside>
  );
}
