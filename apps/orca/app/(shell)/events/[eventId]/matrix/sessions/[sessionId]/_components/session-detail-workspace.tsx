"use client";

import Link from "next/link";
import { useEventTerminology } from "@/components/event-terminology-context";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Armchair,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  ListOrdered,
  Loader2,
  MapPin,
  Mic,
  Monitor,
  Package,
  Plus,
  Search,
  Signpost,
  Trash2,
  Upload,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { type Dispatch, type DragEvent, type FormEvent, type ReactNode, type SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BudgetRequirementLinkControl } from "@/app/(shell)/matrix-2/_components/budget-requirement-link-control";
import { SessionRegistrationUnavailableCard } from "@/components/session-registration-unavailable-card";
import {
  ROOM_SET_SEATING_COMING_SOON_BADGE,
  ROOM_SET_SEATING_COMBINED_LABEL,
  ROOM_SET_SEATING_UNAVAILABLE_COPY,
  isRoomSetAndSeatingAvailable,
  shouldGateSessionRegistration,
} from "@/config/features";
import {
  OperationalBudgetRequirementRows,
  type EventBudgetLineItemRow,
  sectionShouldUseOperationalBudgetRows,
} from "@/app/(shell)/matrix-2/_components/operational-budget-requirement-rows";
import {
  detectMatrix2Conflicts,
  formatDateLabel,
  formatTimeLabel,
  visibleMatrix2Conflicts,
} from "@/app/(shell)/matrix-2/_components/conflict-utils";
import {
  DEFAULT_SESSION_TYPE,
  type Matrix2Conflict,
  type Matrix2RequirementItem,
  type Matrix2RequirementSection,
  type Matrix2Session,
  type Matrix2Snapshot,
  sessionTypeOptionsForSavedValue,
} from "@/app/(shell)/matrix-2/_components/types";
import {
  budgetCategoryForSessionRequirementCatalogType,
  inferSessionRequirementCatalogType,
  isStaffingNeedRequirementItem,
  type SessionRequirementCatalogType,
} from "@/lib/session-requirement-catalog";
import {
  assignmentForecastTotalCentsNullable,
  extractFnbPackagePriceOptions,
  mergeTierIntoNotes,
  parseTierFromNotes,
  stripTierLineFromNotes,
} from "@/lib/fnb-package-tier";
import {
  catalogItemPriceDisplayIncludesUnit,
  formatCatalogItemPriceDisplay,
  formatCatalogItemUnitDisplay,
} from "@/lib/fnb-catalog-price-display";
import {
  calculateFnbAssignmentFinancials,
  calculateFnbPlanCost,
  normalizeFnbPercentage,
  type FnbAssignmentCostBreakdown,
  type FnbOrderCalculation,
  type FnbPlanCostBreakdown,
} from "@/lib/fnb-cost-calculation";
import {
  buildFnbEstimateNeedsAttention,
  calculateFnbVarianceToBudget,
  sumFnbBudgetedCents,
} from "@/lib/fnb-estimate-summary";
import { useFnbAutosaveCoordinator } from "@/lib/fnb-autosave-coordinator";
import {
  SessionFnbSafetySummary,
  type SessionFnbSafetyAlertSummary,
} from "./session-fnb-safety-summary";
import { SessionShowFlowWorkspace } from "./session-show-flow-workspace";
import { SessionSuppliesWorkspace } from "./session-supplies-workspace";
import { SessionOperationalRecordsWorkspace } from "./session-operational-records-workspace";
import { fetchSessionDetailSnapshot } from "@/lib/session-detail-load";
import { parseSessionRequirementQuantity } from "@/lib/session-requirement-quantity";
import { eventRunOfShowHref, roomSetHref, runOfShowSessionHref } from "@/lib/planning/routes";
import {
  EVENT_MODULE_PRIMARY_CLASS,
  EventModuleSurface,
} from "@/app/(shell)/events/[eventId]/_components/event-module-header";
import {
  SESSION_READINESS_METADATA,
  deriveSessionModuleApplicability,
  deriveSessionReadiness,
  type SessionAttentionItem as CanonicalSessionAttentionItem,
  type SessionReadinessStatus,
} from "@/lib/session-readiness";
import { ObjectTaskStrip } from "@/components/tasks/object-task-strip";
import { ALLERGEN_CODES, DIETARY_CODES } from "@/lib/fnb-safety-domain";
import { SessionNotesActivity } from "./session-notes-activity";
import {
  SessionReadinessStatusBar,
  type ReadinessBucket,
  type ReadinessDetailItem,
} from "./session-readiness-status-bar";
import {
  buildConflictCoverageReport,
  conflictCoverageSummary,
} from "@/lib/conflict-coverage";

type SessionDetailWorkspaceProps = {
  eventId: string;
  sessionId: string;
};

type SpeakerStatus = "NEEDS_INFO" | "INVITED" | "CONFIRMED" | "CANCELLED";

type EventSpeakerRecord = {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  bio: string | null;
  headshotUrl: string | null;
  status: SpeakerStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type LinkedBudgetLineItem = NonNullable<Matrix2Session["requirementSelections"][number]["linkedBudgetLineItem"]>;

type SpeakerSelection = {
  speakerId: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  status: SpeakerStatus;
};

type AttendeeRosterStatus = "REGISTERED" | "SELECTED" | "WAITLISTED" | "CANCELLED" | "CHECKED_IN" | "NO_SHOW";

type AttendeeRosterEnrollment = {
  id: string;
  attendeeId: string;
  enrollmentStatus: AttendeeRosterStatus;
  attendee: {
    id: string;
    displayName: string;
    email: string | null;
    company: string | null;
  } | null;
};

type AttendeeRosterOption = {
  id: string;
  displayName: string;
  email: string | null;
  company: string | null;
};

type WorkspaceTabId = "overview" | "show-flow" | "speakers" | "av" | "fnb" | "staffing" | "supplies" | "signage" | "accessibility" | "vendor-production" | "safety-escalation" | "conflicts" | "notes-activity";
type SessionRailLinkId = "room-set" | "seating";
type SessionRailUnavailableId = "room-set-seating";

type SessionRailFocusItem = {
  id: WorkspaceTabId;
  label: string;
  description: string;
  badge: string;
  status: SessionReadinessStatus;
  icon: typeof LayoutDashboard;
};

type SessionRailLinkItem = {
  id: SessionRailLinkId | SessionRailUnavailableId;
  label: string;
  description: string;
  badge: string;
  status: SessionReadinessStatus;
  icon: typeof LayoutDashboard;
  href?: string;
  disabled?: boolean;
  countInReadiness?: boolean;
};

type AttentionItem = CanonicalSessionAttentionItem & {
  tone: "blocked" | "attention" | "missing";
  target: WorkspaceTabId | SessionRailLinkId;
};

type OverviewModuleCard = {
  id: WorkspaceTabId | SessionRailLinkId | SessionRailUnavailableId;
  label: string;
  description: string;
  status: SessionReadinessStatus;
  icon: typeof LayoutDashboard;
  facts: string[];
  warning?: string;
  actionLabel: string;
  target: WorkspaceTabId | SessionRailLinkId;
  href?: string;
  disabled?: boolean;
};

const WORKSPACE_FOCUS_ITEMS: Array<{ id: WorkspaceTabId; label: string; description: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", description: "Attention queue · at a glance", icon: LayoutDashboard },
  { id: "show-flow", label: "Show Flow", description: "Minute-by-minute cues and public agenda", icon: ListOrdered },
  { id: "speakers", label: "Speakers", description: "Assignments", icon: Mic },
  { id: "av", label: "AV", description: "Tech requirements", icon: Monitor },
  { id: "fnb", label: "F&B", description: "Food operations", icon: Utensils },
  { id: "staffing", label: "Staffing", description: "Crew needs", icon: Users },
  { id: "supplies", label: "Supplies", description: "Materials and quantities", icon: Package },
  { id: "signage", label: "Signage", description: "Wayfinding and room signs", icon: Signpost },
  { id: "accessibility", label: "Accessibility", description: "Inclusive participation", icon: Users },
  { id: "vendor-production", label: "Vendor & Production", description: "Service partners", icon: Package },
  { id: "safety-escalation", label: "Safety & Escalation", description: "Session operating view", icon: AlertTriangle },
  { id: "conflicts", label: "Conflicts", description: "Schedule and capacity", icon: AlertTriangle },
  { id: "notes-activity", label: "Notes / Activity", description: "Planner notes", icon: Activity },
];

const OPERATIONAL_GLANCE_FOCUS_IDS = new Set<WorkspaceTabId>(["speakers", "av", "fnb", "staffing", "supplies", "signage"]);

type SessionSwitcherOption = Pick<
  Matrix2Session,
  "id" | "date" | "startTime" | "endTime" | "roomName" | "sortOrder" | "title" | "sessionType"
>;

function normalizeWorkspaceTabId(value: string | null): WorkspaceTabId {
  const normalized = value?.replace(/^#/, "").toLowerCase() ?? "";
  if (normalized === "notes" || normalized === "activity" || normalized === "notes-activity") return "notes-activity";
  return WORKSPACE_FOCUS_ITEMS.some((tab) => tab.id === normalized) ? (normalized as WorkspaceTabId) : "overview";
}

function normalizeLinkFocusId(value: string | null): SessionRailLinkId | null {
  const normalized = value?.replace(/^#/, "").toLowerCase() ?? "";
  if (normalized === "room-set" || normalized === "roomset" || normalized === "layout") return "room-set";
  if (normalized === "seating") return "seating";
  return null;
}

function currentHashFocus(): WorkspaceTabId | SessionRailLinkId | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  return normalizeLinkFocusId(hash) ?? normalizeWorkspaceTabId(hash);
}

function initialWorkspaceFocus(searchParams: ReturnType<typeof useSearchParams>): WorkspaceTabId {
  const hashFocus = currentHashFocus();
  if (hashFocus && hashFocus !== "room-set" && hashFocus !== "seating") return hashFocus;
  const queryFocus = normalizeLinkFocusId(searchParams.get("tab")) ?? normalizeWorkspaceTabId(searchParams.get("tab"));
  if (queryFocus === "room-set" || queryFocus === "seating") return "overview";
  return queryFocus;
}

function sortSessionSwitcherOptions(left: SessionSwitcherOption, right: SessionSwitcherOption): number {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.startTime !== right.startTime) return left.startTime.localeCompare(right.startTime);
  if (left.endTime !== right.endTime) return left.endTime.localeCompare(right.endTime);
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return left.title.localeCompare(right.title);
}

function sessionSwitcherSearchText(session: SessionSwitcherOption): string {
  return [
    session.title,
    session.sessionType,
    formatSessionDate(session.date),
    formatTimeLabel(session.startTime),
    formatTimeLabel(session.endTime),
    session.roomName || "Room unassigned",
  ]
    .join(" ")
    .toLowerCase();
}

function buildSessionWorkspaceSwitchHref(
  eventId: string,
  targetSessionId: string,
  searchParams: ReturnType<typeof useSearchParams>,
): string {
  const hashFocus = currentHashFocus();
  const queryFocus = normalizeLinkFocusId(searchParams.get("tab")) ?? normalizeWorkspaceTabId(searchParams.get("tab"));
  const nextFocus = hashFocus ?? queryFocus;

  if (isRoomSetAndSeatingAvailable()) {
    if (nextFocus === "room-set") return roomSetHref(eventId, targetSessionId, "layout");
    if (nextFocus === "seating") return roomSetHref(eventId, targetSessionId, "seating");
  }

  const baseHref = runOfShowSessionHref(eventId, targetSessionId);
  return nextFocus && nextFocus !== "overview" ? `${baseHref}#${nextFocus}` : baseHref;
}

type FnbLibraryItem = {
  id: string;
  eventId: string;
  sourceMenuId: string | null;
  itemName: string;
  description: string | null;
  price: string | null;
  unit: string | null;
  category: string | null;
  sourceMenuFileName: string | null;
  publishedPriceCents?: number | null;
  negotiatedPriceCents?: number | null;
  discountCents?: number | null;
  currency?: string;
  minimumQuantity?: number | null;
  taxable?: boolean;
  isCustom?: boolean;
  verificationStatus?: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type FnbSourceMenuStatus =
  | "UPLOADED"
  | "READING_PDF"
  | "MAPPING_SECTIONS"
  | "EXTRACTING_ITEMS"
  | "REVIEW_NEEDED"
  | "COMPLETE"
  | "FAILED"
  | "ARCHIVED";

type FnbSourceMenuSourceType = "ORIGINAL" | "AMENDMENT" | "REPLACEMENT";

type FnbSourceMenu = {
  id: string;
  eventId: string;
  menuName: string;
  fileName: string;
  sourceType: FnbSourceMenuSourceType;
  status: FnbSourceMenuStatus;
  objectKey: string;
  progressSummary: string;
  itemsFound: number;
  lastError: string | null;
  baseSourceMenuId: string | null;
  archivedAt: string | null;
  lastUpdated: string;
};

type FnbSourceMenuCleanupAction = "archive" | "delete";

type FnbCatalogApiPayload = {
  items?: FnbLibraryItem[];
  sourceMenus?: FnbSourceMenu[];
};

type FnbCatalogEditDraft = Pick<FnbLibraryItem, "itemName" | "description" | "category" | "price" | "unit" | "sourceMenuFileName"> & {
  status: "Approved" | "Archived";
};

type SessionFnbCatalogAssignment = {
  id: string;
  sessionId: string;
  eventFnbCatalogItemId: string;
  catalogItemVersion: number;
  catalogItemSnapshot: Record<string, unknown> | null;
  budgetLineItemId: string | null;
  quantity: number | null;
  manualPriceCents: number | null;
  serviceTiming: string | null;
  notes: string | null;
  taxes: SessionFnbCatalogAssignmentTax[];
  calculation: FnbAssignmentCostBreakdown;
  financialCalculation: FnbOrderCalculation | null;
  createdAt: string;
  updatedAt: string;
  catalogItem: FnbLibraryItem;
  syncedBudgetLineItem: {
    id: string;
    category: string;
    subcategory: string;
    lineItem: string;
    vendor: string | null;
    forecastCents: number;
    actualCents: number;
    status: string;
    approval: string;
  } | null;
};

type SessionFnbCatalogAssignmentTax = {
  id: string;
  assignmentId: string;
  label: string | null;
  percentage: string;
  sortOrder: number;
};

type SessionFnbPlan = {
  sessionId: string;
  taxPercent: string;
  serviceChargePercent: string;
  forecastAttendance: number | null;
  calculation: FnbPlanCostBreakdown;
};

type ExpectedAttendanceSource = "PLANNER_ESTIMATE" | "REGISTRATION_RSVP" | "IMPORTED";

const EXPECTED_ATTENDANCE_SOURCE_LABELS: Record<ExpectedAttendanceSource, string> = {
  PLANNER_ESTIMATE: "Planner estimate",
  REGISTRATION_RSVP: "Registration RSVP",
  IMPORTED: "Imported",
};

type FnbAssignmentAutosavePayload = {
  sessionId: string;
  assignmentId: string;
  quantity: number | null;
  manualPriceCents: number | null;
  serviceTiming: string | null;
  notes: string | null;
  taxes: Array<{ label: string | null; percentage: string }>;
  expectedUpdatedAt: string;
};

type FnbPlanAutosavePayload = {
  sessionId: string;
  taxPercent: string;
  serviceChargePercent: string;
};

function toErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  return fallback;
}

function normalizeHeadcount(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function statusLabel(status: SpeakerStatus): string {
  return status.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function normalizeSpeakerEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidSpeakerEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeSpeakerEmail(value));
}

function SpeakerStatusBadge({ status }: { status: SpeakerStatus }) {
  const classes = status === "CONFIRMED"
    ? "bg-emerald-100 text-emerald-700"
    : status === "INVITED"
      ? "bg-blue-100 text-blue-700"
      : status === "CANCELLED"
        ? "bg-rose-100 text-rose-700"
        : "bg-amber-100 text-amber-800";

  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classes}`}>{statusLabel(status)}</span>;
}

const ATTENDEE_ROSTER_STATUS_LABELS: Record<AttendeeRosterStatus, string> = {
  REGISTERED: "Registered",
  SELECTED: "Selected",
  WAITLISTED: "Waitlisted",
  CANCELLED: "Cancelled",
  CHECKED_IN: "Checked in",
  NO_SHOW: "No-show",
};

function attendeeRosterStatusChip(status: AttendeeRosterStatus): string {
  if (status === "CHECKED_IN") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "WAITLISTED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "CANCELLED" || status === "NO_SHOW") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function SectionCard({
  title,
  children,
  action,
  collapsible = false,
  initiallyOpen = true,
  onExpand,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  collapsible?: boolean;
  initiallyOpen?: boolean;
  onExpand?: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const headerTitle = (
    <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
  );

  if (!collapsible) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-[clamp(0.75rem,1vw,0.95rem)] shadow-sm max-[900px]:p-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5 max-[900px]:gap-2 max-[900px]:pb-2">
          {headerTitle}
          {action}
        </div>
        <div className="mt-3 max-[900px]:mt-2.5">{children}</div>
      </section>
    );
  }

  const toggle = () => {
    let willOpen = false;
    setOpen((prev) => {
      willOpen = !prev;
      return willOpen;
    });
    if (willOpen) onExpand?.();
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-[clamp(0.75rem,1vw,0.95rem)] shadow-sm max-[900px]:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5 max-[900px]:gap-2 max-[900px]:pb-2">
        <button
          type="button"
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={["h-5 w-5 shrink-0 text-slate-500 transition-transform", open ? "rotate-180" : "rotate-0"].join(" ")}
          />
          {headerTitle}
        </button>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {open ? <div className="mt-3 max-[900px]:mt-2.5">{children}</div> : null}
    </section>
  );
}

function fieldClassName() {
  return "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300 max-[900px]:h-9.5";
}

function textareaClassName() {
  return "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-slate-300";
}

function formatMoneyFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatMoneyFromCentsWithCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatSignedMoneyFromCents(cents: number): string {
  const prefix = cents > 0 ? "+" : cents < 0 ? "-" : "";
  return `${prefix}${formatMoneyFromCents(Math.abs(cents))}`;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: value > 0 && value < 0.01 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function makeClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatShortDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSessionDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed);
}

function readinessBadgeClasses(status: SessionReadinessStatus): string {
  return SESSION_READINESS_METADATA[status].badgeClassName;
}

function readinessDotClasses(status: SessionReadinessStatus): string {
  if (status === "ready") return "bg-emerald-600";
  if (status === "needs_info") return "bg-amber-500";
  if (status === "blocked") return "bg-rose-600";
  return "bg-slate-300";
}

function attentionIconClasses(tone: AttentionItem["tone"]): string {
  if (tone === "blocked") return "text-rose-600";
  if (tone === "missing") return "text-amber-600";
  return "text-sky-600";
}

function attentionIssueLabel(item: AttentionItem): string {
  return item.title;
}

function attentionActionLabel(item: AttentionItem): string {
  return item.actionLabel;
}

function moduleAccentClasses(status: SessionReadinessStatus): string {
  if (status === "ready") return "border-l-emerald-600";
  if (status === "needs_info") return "border-l-amber-500";
  if (status === "blocked") return "border-l-rose-600";
  return "border-l-slate-300";
}

function moduleCardClasses(status: SessionReadinessStatus): string {
  if (status === "blocked") return "border-rose-200";
  if (status === "needs_info") return "border-amber-200";
  if (status === "ready") return "border-emerald-200";
  return "border-slate-200";
}

function readinessWarningTextClasses(status: SessionReadinessStatus): string {
  if (status === "blocked") return "text-rose-700";
  if (status === "needs_info") return "text-amber-700";
  return "text-slate-600";
}

function selectedRequirementReadinessItems(sections: Matrix2RequirementSection[], values: Record<string, string>) {
  return sections.flatMap((section) =>
    section.items
      .filter((item) => Object.prototype.hasOwnProperty.call(values, item.id))
      .map((item) => {
        const rawQuantity = values[item.id];
        const quantity = rawQuantity ? Number(rawQuantity) : null;
        return {
          id: item.id,
          label: item.label,
          quantity: Number.isFinite(quantity) ? quantity : null,
        };
      }),
  );
}

function formatStaffingNeedLabel(item: { label: string; quantity: number | null }): string {
  if (item.quantity && item.quantity > 1) return `${item.quantity} ${item.label}s`;
  if (item.quantity === 1) return `1 ${item.label}`;
  return item.label;
}

const FNB_SOURCE_MENU_STATUS_TONE: Record<FnbSourceMenuStatus, string> = {
  UPLOADED: "border-slate-200 bg-slate-50 text-slate-700",
  READING_PDF: "border-blue-200 bg-blue-50 text-blue-700",
  MAPPING_SECTIONS: "border-indigo-200 bg-indigo-50 text-indigo-700",
  EXTRACTING_ITEMS: "border-cyan-200 bg-cyan-50 text-cyan-700",
  REVIEW_NEEDED: "border-amber-200 bg-amber-50 text-amber-700",
  COMPLETE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-rose-200 bg-rose-50 text-rose-700",
  ARCHIVED: "border-slate-200 bg-slate-100 text-slate-500",
};

const FNB_SOURCE_MENU_ACTIVE_STATUSES = new Set<FnbSourceMenuStatus>([
  "UPLOADED",
  "READING_PDF",
  "MAPPING_SECTIONS",
  "EXTRACTING_ITEMS",
]);
const FNB_WORKSPACE_GRID_CLASS =
  "grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,308px)_minmax(0,1fr)_minmax(300px,340px)]";

function fnbSourceMenuActions(status: FnbSourceMenuStatus): string[] {
  if (["READING_PDF", "MAPPING_SECTIONS", "EXTRACTING_ITEMS"].includes(status)) return ["Archive", "Delete"];
  return ["Archive", "Delete", "Amend", "Re-run"];
}

function fnbSourceMenuStatusLabel(status: FnbSourceMenuStatus): string {
  if (status === "READING_PDF") return "Reading PDF";
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeFnbSourceMenuRecord(value: FnbSourceMenu): FnbSourceMenu {
  const raw = value as FnbSourceMenu & { updatedAt?: unknown };
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : value.lastUpdated;
  return {
    ...value,
    progressSummary: value.progressSummary || (value.status === "UPLOADED" ? "Uploaded; waiting for parser" : fnbSourceMenuStatusLabel(value.status)),
    lastUpdated: updatedAt,
  };
}

function parseSafePriceCents(price: string | null): number | null {
  const normalized = price?.trim().replace(/,/g, "") ?? "";
  const matches = [...normalized.matchAll(/\$?\s*(\d+(?:\.\d{1,2})?)/g)];
  if (matches.length !== 1) return null;
  const amount = Number(matches[0][1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function assignmentTotalCents(assignment: SessionFnbCatalogAssignment): number | null {
  return assignmentForecastTotalCentsNullable({
    catalogPrice: assignment.catalogItem.price,
    quantity: assignment.quantity,
    manualPriceCents: assignment.manualPriceCents,
    notes: assignment.notes,
  });
}

function assignmentFinancialResult(
  assignment: SessionFnbCatalogAssignment,
  taxPercent: string,
  serviceChargePercent: string,
): ReturnType<typeof calculateFnbAssignmentFinancials> {
  const snapshot = assignment.catalogItemSnapshot;
  const snapshotCents = (key: "publishedPriceCents" | "negotiatedPriceCents" | "discountCents") => {
    const value = snapshot?.[key];
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  const minimumValue = snapshot?.minimumQuantity;
  const minimumQuantity = snapshot
    ? typeof minimumValue === "number" && Number.isSafeInteger(minimumValue) && minimumValue > 0 ? minimumValue : null
    : assignment.catalogItem.minimumQuantity ?? null;
  const publishedPriceCents = snapshot ? snapshotCents("publishedPriceCents") : assignment.catalogItem.publishedPriceCents ?? null;
  const negotiatedPriceCents = snapshot ? snapshotCents("negotiatedPriceCents") : assignment.catalogItem.negotiatedPriceCents ?? null;
  const discountCents = snapshot ? snapshotCents("discountCents") ?? 0 : assignment.catalogItem.discountCents ?? 0;
  const currency = typeof snapshot?.currency === "string" ? snapshot.currency : assignment.catalogItem.currency ?? "USD";
  const taxable = typeof snapshot?.taxable === "boolean" ? snapshot.taxable : assignment.catalogItem.taxable ?? true;
  return calculateFnbAssignmentFinancials({
    id: assignment.id,
    currency,
    quantity: assignment.quantity ?? minimumQuantity ?? null,
    minimumQuantity,
    publishedUnitCents: publishedPriceCents,
    negotiatedUnitCents: negotiatedPriceCents,
    discountUnitCents: discountCents,
    taxable,
    totalOverrideCents: assignment.manualPriceCents,
    legacySubtotalCents: assignmentTotalCents(assignment),
    taxPercent,
    serviceChargePercent,
    itemTaxes: assignment.taxes,
    actualTotalCents: assignment.syncedBudgetLineItem?.actualCents ?? null,
  });
}

function fnbAssignmentTaxValidationError(taxes: SessionFnbCatalogAssignmentTax[]): string | null {
  try {
    for (const tax of taxes) normalizeFnbPercentage(tax.percentage);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Enter tax percentages between 0 and 100";
  }
}

function formatFnbPercentageForInput(value: unknown): string {
  const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const parsed = raw === "" ? 0 : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Percentage must be between 0 and 100");
  }
  return (Math.round(parsed * 100) / 100).toFixed(2);
}

function formatOptionalFnbPercentageForInput(value: unknown): string {
  const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!raw) return "";
  try {
    return formatFnbPercentageForInput(raw);
  } catch {
    return raw;
  }
}

function formatFnbAssignmentTaxesForInput(
  assignment: SessionFnbCatalogAssignment,
): SessionFnbCatalogAssignment {
  return {
    ...assignment,
    taxes: assignment.taxes.map((tax) => ({
      ...tax,
      percentage: formatOptionalFnbPercentageForInput(tax.percentage),
    })),
  };
}

type FnbEstimateAttentionReasonKey = "headcount" | "tier" | "package_total" | "text_range";

const FNB_ESTIMATE_ATTENTION_REASON_ORDER: FnbEstimateAttentionReasonKey[] = [
  "headcount",
  "tier",
  "package_total",
  "text_range",
];

const FNB_ESTIMATE_ATTENTION_REASON_COPY: Record<FnbEstimateAttentionReasonKey, string> = {
  headcount: "Missing headcount",
  tier: "Missing tier selection",
  package_total: "Missing package total",
  text_range: "Text or range pricing",
};

/** Display-only reasons when forecast is null; mirrors assignment card heuristics without changing totals. */
function collectFnbEstimateAttentionReasonKeys(assignment: SessionFnbCatalogAssignment): FnbEstimateAttentionReasonKey[] {
  if (assignmentTotalCents(assignment) !== null) return [];
  const unitPriceCents = parseSafePriceCents(assignment.catalogItem.price);
  const packageOptions = extractFnbPackagePriceOptions(assignment.catalogItem);
  const notesTier = parseTierFromNotes(assignment.notes);
  const hasPackageTierChoice = packageOptions.length >= 2 && unitPriceCents === null;
  const unitNorm = normalizeUnitLabel(assignment.catalogItem.unit);
  const isFlatPackageUnit = /\b(flat|package)\b/.test(unitNorm);
  const keys: FnbEstimateAttentionReasonKey[] = [];
  if (!assignment.quantity) keys.push("headcount");
  if (hasPackageTierChoice && !notesTier) keys.push("tier");
  if (assignment.quantity && isFlatPackageUnit && unitPriceCents === null && !hasPackageTierChoice && !notesTier) {
    keys.push("package_total");
  } else if (assignment.quantity && unitPriceCents === null && !hasPackageTierChoice && !notesTier && !isFlatPackageUnit) {
    keys.push("text_range");
  }
  return keys;
}

function dollarsToCents(value: string): number | null {
  const normalized = value.trim().replace(/[$,]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function normalizeUnitLabel(value: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formatUnitLabel(value: string | null): string {
  const unit = normalizeUnitLabel(value);
  if (!unit) return "";
  return unit.replace(/\b\w/g, (character) => character.toUpperCase());
}

function catalogMetaParts(item: Pick<FnbLibraryItem, "category" | "price" | "unit" | "sourceMenuFileName">): string[] {
  const category = item.category?.trim() ?? "";
  const price = formatCatalogItemPriceDisplay(item);
  const unit = price && catalogItemPriceDisplayIncludesUnit(item) ? "" : formatCatalogItemUnitDisplay(item);
  const source = item.sourceMenuFileName?.trim() ?? "";
  return [
    category,
    price,
    unit,
    source,
  ].filter(Boolean);
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

function typeSections(snapshot: Matrix2Snapshot | null): Array<{ section: Matrix2RequirementSection; sectionType: SessionRequirementCatalogType }> {
  return (snapshot?.requirementTemplate.sections ?? []).map((section) => ({
    section,
    sectionType: inferSessionRequirementCatalogType({ key: section.key, label: section.label }),
  }));
}

function initialRequirementSelectionMap(session: Matrix2Session): Record<string, string> {
  const next: Record<string, string> = {};
  for (const selection of session.requirementSelections) {
    next[selection.itemId] = selection.quantity === null || typeof selection.quantity === "undefined" ? "" : String(selection.quantity);
  }
  return next;
}

function selectedSingleItemId(section: Matrix2RequirementSection | null, values: Record<string, string>): string {
  if (!section) return "";
  return section.items.find((item) => Object.prototype.hasOwnProperty.call(values, item.id))?.id ?? "";
}

function RequirementChecklist({
  eventId,
  sessionId,
  section,
  values,
  onChange,
  linkedBudgetLineItemsByItemId,
  onBudgetLinkChange,
  customItemDraft,
  customItemError,
  isSavingCustomItem,
  onCustomItemDraftChange,
  onCreateCustomItem,
  disabled,
}: {
  eventId: string;
  sessionId: string;
  section: Matrix2RequirementSection;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  linkedBudgetLineItemsByItemId: Map<string, LinkedBudgetLineItem>;
  onBudgetLinkChange: (itemId: string, linkedBudgetLineItem: LinkedBudgetLineItem | null) => void;
  customItemDraft: string;
  customItemError: string | null;
  isSavingCustomItem: boolean;
  onCustomItemDraftChange: (sectionId: string, value: string) => void;
  onCreateCustomItem: (sectionId: string) => void;
  disabled: boolean;
}) {
  const activeItems = section.items.filter((item) => item.active);

  return (
    <div className="space-y-2">
      {activeItems.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
        {activeItems.map((item) => {
          const checked = Object.prototype.hasOwnProperty.call(values, item.id);
          const linkedBudgetLineItem = checked ? linkedBudgetLineItemsByItemId.get(item.id) ?? null : null;
          const sectionType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
          const preferredCategory = budgetCategoryForSessionRequirementCatalogType(sectionType);
          return (
            <div key={item.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex items-center gap-2">
                <input
                  id={`req-${item.id}`}
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const next = { ...values };
                    if (event.target.checked) {
                      next[item.id] = next[item.id] ?? "";
                    } else {
                      delete next[item.id];
                    }
                    onChange(next);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]"
                />
                <label htmlFor={`req-${item.id}`} className="min-w-0 flex-1 text-[13px] text-slate-700">
                  {item.label}
                </label>
                {item.hasQuantity ? (
                  <input
                    type="number"
                    min={1}
                    disabled={!checked}
                    value={values[item.id] ?? ""}
                    onChange={(event) => onChange({ ...values, [item.id]: event.target.value })}
                    className="h-8 w-20 rounded-md border border-slate-200 px-2 text-[12px] outline-none focus:border-slate-300 disabled:bg-slate-100"
                    placeholder="#"
                  />
                ) : null}
              </div>
              {checked ? (
                <BudgetRequirementLinkControl
                  eventId={eventId}
                  sessionId={sessionId}
                  itemId={item.id}
                  preferredCategory={preferredCategory}
                  preferredSubcategory={item.label}
                  prefillCategory={preferredCategory ?? ""}
                  prefillSubcategory={item.label}
                  prefillLineItem={item.label}
                  linkedBudgetLineItem={linkedBudgetLineItem}
                  disabled={disabled}
                  onChange={onBudgetLinkChange}
                />
              ) : null}
            </div>
          );
        })}
        </div>
      ) : (
        <p className="text-[13px] text-slate-500">No items configured.</p>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateCustomItem(section.id);
        }}
      >
        <input
          value={customItemDraft}
          onChange={(event) => onCustomItemDraftChange(section.id, event.target.value)}
          placeholder="+ Add custom item"
          disabled={disabled || isSavingCustomItem}
          className="h-9 min-w-0 flex-1 rounded-lg border border-dashed border-slate-200 px-3 text-[13px] outline-none focus:border-slate-300 disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={disabled || isSavingCustomItem || !customItemDraft.trim()}
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isSavingCustomItem ? "Adding..." : "Add"}
        </button>
        {customItemError ? <p className="basis-full text-[12px] font-medium text-rose-600">{customItemError}</p> : null}
      </form>
    </div>
  );
}

function SessionRequirementSectionBody({
  eventId,
  sessionId,
  session,
  section,
  sectionType,
  budgetLinesReady,
  budgetLinesLoading,
  budgetLinesError,
  onRetryBudgetLines,
  eventBudgetLineItems,
  selectedRequirementValues,
  onChangeSelectedRequirementValues,
  linkedBudgetLineItemsByItemId,
  onBudgetLinkChange,
  onRefreshBudgetLineItems,
  customItemDraft,
  customItemError,
  isSavingCustomItem,
  onCustomItemDraftChange,
  onCreateCustomItem,
  disabled,
}: {
  eventId: string;
  sessionId: string;
  session: Matrix2Session;
  section: Matrix2RequirementSection;
  sectionType: SessionRequirementCatalogType;
  budgetLinesReady: boolean;
  budgetLinesLoading: boolean;
  budgetLinesError: string | null;
  onRetryBudgetLines: () => void;
  eventBudgetLineItems: EventBudgetLineItemRow[];
  selectedRequirementValues: Record<string, string>;
  onChangeSelectedRequirementValues: Dispatch<SetStateAction<Record<string, string>>>;
  linkedBudgetLineItemsByItemId: Map<string, LinkedBudgetLineItem>;
  onBudgetLinkChange: (itemId: string, linkedBudgetLineItem: LinkedBudgetLineItem | null) => void;
  onRefreshBudgetLineItems: () => Promise<void>;
  customItemDraft: string;
  customItemError: string | null;
  isSavingCustomItem: boolean;
  onCustomItemDraftChange: (sectionId: string, value: string) => void;
  onCreateCustomItem: (sectionId: string) => void;
  disabled: boolean;
}) {
  const shouldUseBudgetRowsAsPrimary = sectionType !== "AV" && sectionType !== "STAFFING";
  const useOperational = shouldUseBudgetRowsAsPrimary && budgetLinesReady && sectionShouldUseOperationalBudgetRows(
    section,
    sectionType,
    eventBudgetLineItems,
    selectedRequirementValues,
    linkedBudgetLineItemsByItemId,
    sessionId,
  );

  if (shouldUseBudgetRowsAsPrimary && budgetLinesLoading) {
    return (
      <div className="space-y-2 py-2">
        <div className="h-10 animate-pulse rounded-lg bg-slate-200/80" />
        <div className="h-10 animate-pulse rounded-lg bg-slate-200/80" />
        <div className="h-10 animate-pulse rounded-lg bg-slate-200/80" />
      </div>
    );
  }
  if (shouldUseBudgetRowsAsPrimary && budgetLinesError) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">
        <p>{budgetLinesError}</p>
        <button type="button" onClick={onRetryBudgetLines} className="mt-2 rounded-md border border-rose-200 bg-white px-3 py-1.5 font-semibold hover:bg-rose-50">Retry budget lines</button>
      </div>
    );
  }
  if (shouldUseBudgetRowsAsPrimary && !budgetLinesReady) {
    return <p className="text-[13px] text-slate-500">Loading budget lines…</p>;
  }

  if (useOperational) {
    return (
      <OperationalBudgetRequirementRows
        eventId={eventId}
        sessionId={sessionId}
        session={session}
        section={section}
        sectionType={sectionType}
        budgetLineItems={eventBudgetLineItems}
        selectedRequirementValues={selectedRequirementValues}
        onChangeSelectedRequirementValues={onChangeSelectedRequirementValues}
        linkedBudgetLineItemsByItemId={linkedBudgetLineItemsByItemId}
        onBudgetLinkChange={onBudgetLinkChange}
        onRefreshBudgetLineItems={onRefreshBudgetLineItems}
        customItemDraft={customItemDraft}
        customItemError={customItemError}
        isSavingCustomItem={isSavingCustomItem}
        onCustomItemDraftChange={onCustomItemDraftChange}
        onCreateCustomItem={onCreateCustomItem}
        disabled={disabled}
      />
    );
  }

  return (
    <RequirementChecklist
      eventId={eventId}
      sessionId={sessionId}
      section={section}
      values={selectedRequirementValues}
      onChange={onChangeSelectedRequirementValues}
      linkedBudgetLineItemsByItemId={linkedBudgetLineItemsByItemId}
      onBudgetLinkChange={onBudgetLinkChange}
      customItemDraft={customItemDraft}
      customItemError={customItemError}
      isSavingCustomItem={isSavingCustomItem}
      onCustomItemDraftChange={onCustomItemDraftChange}
      onCreateCustomItem={onCreateCustomItem}
      disabled={disabled}
    />
  );
}

function SpeakerPicker({
  eventId,
  selected,
  onAssign,
  onRemove,
  disabled,
}: {
  eventId: string;
  selected: SpeakerSelection[];
  onAssign: (speaker: EventSpeakerRecord) => Promise<void>;
  onRemove: (speakerId: string) => Promise<void>;
  disabled: boolean;
}) {
  const [directory, setDirectory] = useState<EventSpeakerRecord[]>([]);
  const [search, setSearch] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(selected.length === 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingSpeakerId, setWorkingSpeakerId] = useState<string | null>(null);
  const [isNewSpeakerOpen, setIsNewSpeakerOpen] = useState(false);
  const [newSpeakerFirstName, setNewSpeakerFirstName] = useState("");
  const [newSpeakerLastName, setNewSpeakerLastName] = useState("");
  const [newSpeakerEmail, setNewSpeakerEmail] = useState("");
  const [isCreatingSpeaker, setIsCreatingSpeaker] = useState(false);

  const loadSpeakers = useCallback(async (): Promise<EventSpeakerRecord[]> => {
    const response = await fetch(`/api/events/${eventId}/speakers`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(toErrorMessage(payload, "Failed to load speakers"));
    }
    const speakers = Array.isArray(payload) ? (payload as EventSpeakerRecord[]) : [];
    setDirectory(speakers);
    setErrorMessage(null);
    return speakers;
  }, [eventId]);

  useEffect(() => {
    let isActive = true;

    async function loadSpeakersForPicker() {
      try {
        const speakers = await loadSpeakers();
        if (!isActive) return;
        setDirectory(speakers);
        setErrorMessage(null);
      } catch (error) {
        if (!isActive) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load speakers");
      }
    }

    void loadSpeakersForPicker();

    return () => {
      isActive = false;
    };
  }, [loadSpeakers]);

  const selectedIds = useMemo(() => new Set(selected.map((speaker) => speaker.speakerId)), [selected]);
  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return directory
      .filter((speaker) => !selectedIds.has(speaker.id))
      .filter((speaker) => {
        if (!normalized) return true;
        return [speaker.name, speaker.title ?? "", speaker.company ?? "", speaker.email ?? "", speaker.status]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .slice(0, 20);
  }, [directory, search, selectedIds]);

  async function assignSpeaker(speaker: EventSpeakerRecord) {
    setWorkingSpeakerId(speaker.id);
    setErrorMessage(null);
    try {
      await onAssign(speaker);
      setSearch("");
      setIsPickerOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to assign speaker");
    } finally {
      setWorkingSpeakerId(null);
    }
  }

  async function removeSpeaker(speakerId: string) {
    setWorkingSpeakerId(speakerId);
    setErrorMessage(null);
    try {
      await onRemove(speakerId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to remove speaker");
    } finally {
      setWorkingSpeakerId(null);
    }
  }

  async function createAndAssignSpeaker() {
    const firstName = newSpeakerFirstName.trim();
    const lastName = newSpeakerLastName.trim();
    const email = normalizeSpeakerEmail(newSpeakerEmail);

    if (!firstName || !lastName) {
      setErrorMessage("First name and last name are required.");
      return;
    }
    if (!isValidSpeakerEmail(email)) {
      setErrorMessage("Enter a valid speaker email.");
      return;
    }

    setIsCreatingSpeaker(true);
    setErrorMessage(null);

    try {
      let speaker: EventSpeakerRecord | null = null;
      const response = await fetch(`/api/events/${eventId}/speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`,
          email,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (response.ok) {
        speaker = payload as EventSpeakerRecord;
        setDirectory((current) => (
          current.some((entry) => entry.id === speaker?.id)
            ? current
            : [...current, speaker as EventSpeakerRecord].sort((left, right) => left.name.localeCompare(right.name))
        ));
      } else if (response.status === 409) {
        const speakers = await loadSpeakers();
        speaker = speakers.find((entry) => normalizeSpeakerEmail(entry.email ?? "") === email) ?? null;
        if (!speaker) {
          throw new Error(toErrorMessage(payload, "A speaker with that email already exists for this event."));
        }
      } else {
        throw new Error(toErrorMessage(payload, "Failed to create speaker"));
      }

      await assignSpeaker(speaker);
      setNewSpeakerFirstName("");
      setNewSpeakerLastName("");
      setNewSpeakerEmail("");
      setIsNewSpeakerOpen(false);
      setIsPickerOpen(false);
      void loadSpeakers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create speaker");
    } finally {
      setIsCreatingSpeaker(false);
    }
  }

  return (
    <div className="space-y-3">
      {errorMessage ? <p className="text-[13px] text-rose-600">{errorMessage}</p> : null}

      {selected.length > 0 ? (
        <div className="space-y-2">
          {selected.map((speaker) => (
            <div key={speaker.speakerId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[14px] font-semibold text-slate-900">{speaker.name}</p>
                  <SpeakerStatusBadge status={speaker.status} />
                </div>
                <p className="truncate text-[12px] text-slate-500">
                  {[speaker.title, speaker.company, speaker.email].filter(Boolean).join(" • ") || "Speaker Directory"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void removeSpeaker(speaker.speakerId);
                }}
                disabled={disabled || workingSpeakerId === speaker.speakerId}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                aria-label={`Unassign ${speaker.name}`}
                title={`Unassign ${speaker.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-[13px] text-slate-500">
          No speakers assigned
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsPickerOpen((current) => !current)}
        disabled={disabled}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Assign speaker
      </button>
      <button
        type="button"
        onClick={() => setIsNewSpeakerOpen((current) => !current)}
        disabled={disabled}
        className="ml-2 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        New speaker
      </button>

      {isNewSpeakerOpen ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_1.4fr_auto]">
            <input
              value={newSpeakerFirstName}
              onChange={(event) => setNewSpeakerFirstName(event.target.value)}
              placeholder="First name"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-slate-300"
            />
            <input
              value={newSpeakerLastName}
              onChange={(event) => setNewSpeakerLastName(event.target.value)}
              placeholder="Last name"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-slate-300"
            />
            <input
              type="email"
              value={newSpeakerEmail}
              onChange={(event) => setNewSpeakerEmail(event.target.value)}
              placeholder="Email"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-slate-300"
            />
            <button
              type="button"
              onClick={() => {
                void createAndAssignSpeaker();
              }}
              disabled={disabled || isCreatingSpeaker}
              className="h-10 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
            >
              {isCreatingSpeaker ? "Adding..." : "Create"}
            </button>
          </div>
        </div>
      ) : null}

      {isPickerOpen ? (
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search speaker directory"
              className="h-10 w-full rounded-lg border border-slate-200 pr-3 pl-9 text-[13px] outline-none focus:border-slate-300"
            />
          </div>

          <div className="mt-3 max-h-72 overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map((speaker) => (
                <div key={speaker.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-slate-900">{speaker.name}</p>
                      <SpeakerStatusBadge status={speaker.status} />
                    </div>
                    <p className="truncate text-[12px] text-slate-500">
                      {[speaker.title, speaker.company, speaker.email].filter(Boolean).join(" • ") || "Speaker Directory"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void assignSpeaker(speaker);
                    }}
                    disabled={disabled || workingSpeakerId === speaker.id}
                    className="inline-flex h-8 shrink-0 items-center rounded-md border border-slate-200 px-2.5 text-[12px] font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              ))
            ) : (
              <p className="px-2 py-4 text-[13px] text-slate-500">No speakers found</p>
            )}
          </div>

          <Link href={`/events/${encodeURIComponent(eventId)}/speakers`} className="mt-3 inline-flex text-[12px] font-medium text-slate-600 hover:text-[#28439A] hover:underline">
            Manage speakers in Speaker Directory
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function AttendeeRosterSection({ eventId, matrixRowId }: { eventId: string; matrixRowId: string }) {
  const sessionRegistrationComingSoon = shouldGateSessionRegistration();
  const [roster, setRoster] = useState<AttendeeRosterEnrollment[]>([]);
  const [attendees, setAttendees] = useState<AttendeeRosterOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedAttendeeId, setSelectedAttendeeId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    if (sessionRegistrationComingSoon) {
      setIsLoading(false);
      setErrorMessage(null);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${matrixRowId}/attendees`, { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(toErrorMessage(payload, "Failed to load attendee roster"));
      setRoster(Array.isArray(payload?.roster) ? (payload.roster as AttendeeRosterEnrollment[]) : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load attendee roster");
    } finally {
      setIsLoading(false);
    }
  }, [eventId, matrixRowId, sessionRegistrationComingSoon]);

  const loadAttendees = useCallback(async () => {
    if (sessionRegistrationComingSoon) {
      setAttendees([]);
      return;
    }
    try {
      const response = await fetch(`/api/events/${eventId}/attendees?limit=200`, { credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(toErrorMessage(payload, "Failed to load attendees"));
      setAttendees(Array.isArray(payload?.attendees) ? (payload.attendees as AttendeeRosterOption[]) : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load attendees");
    }
  }, [eventId, sessionRegistrationComingSoon]);

  useEffect(() => {
    void loadRoster();
    void loadAttendees();
  }, [loadAttendees, loadRoster]);

  const enrolledAttendeeIds = useMemo(() => new Set(roster.map((item) => item.attendeeId)), [roster]);
  const filteredAttendees = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return attendees
      .filter((attendee) => !enrolledAttendeeIds.has(attendee.id))
      .filter((attendee) => {
        if (!normalized) return true;
        return [attendee.displayName, attendee.company ?? "", attendee.email ?? ""].join(" ").toLowerCase().includes(normalized);
      })
      .slice(0, 30);
  }, [attendees, enrolledAttendeeIds, search]);

  useEffect(() => {
    if (selectedAttendeeId && filteredAttendees.some((attendee) => attendee.id === selectedAttendeeId)) return;
    setSelectedAttendeeId(filteredAttendees[0]?.id ?? "");
  }, [filteredAttendees, selectedAttendeeId]);

  async function addAttendee() {
    if (sessionRegistrationComingSoon) return;
    if (!selectedAttendeeId) return;
    setWorkingId(selectedAttendeeId);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${matrixRowId}/attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ attendeeId: selectedAttendeeId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(toErrorMessage(payload, "Failed to add attendee"));
      setSearch("");
      await loadRoster();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add attendee");
    } finally {
      setWorkingId(null);
    }
  }

  async function cancelEnrollment(enrollmentId: string) {
    if (sessionRegistrationComingSoon) return;
    setWorkingId(enrollmentId);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${matrixRowId}/attendees/${enrollmentId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(toErrorMessage(payload, "Failed to remove attendee"));
      await loadRoster();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to remove attendee");
    } finally {
      setWorkingId(null);
    }
  }

  return sessionRegistrationComingSoon ? (
    <SessionRegistrationUnavailableCard />
  ) : (
    <SectionCard
      title="Attendee Roster"
      action={<Users className="h-4 w-4 text-slate-400" />}
    >
      <div className="space-y-3">
        {errorMessage ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{errorMessage}</p> : null}
        {isLoading ? (
          <p className="text-[13px] text-slate-500">Loading attendee roster…</p>
        ) : roster.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-[13px] text-slate-500">
            No attendees added yet.
          </div>
        ) : (
          <div className="space-y-2">
            {roster.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] font-semibold text-slate-900">{item.attendee?.displayName ?? "Attendee"}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${attendeeRosterStatusChip(item.enrollmentStatus)}`}>
                      {ATTENDEE_ROSTER_STATUS_LABELS[item.enrollmentStatus]}
                    </span>
                  </div>
                  <p className="truncate text-[12px] text-slate-500">
                    {[item.attendee?.company, item.attendee?.email].filter(Boolean).join(" • ") || "Event attendee"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void cancelEnrollment(item.id);
                  }}
                  disabled={workingId === item.id}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-rose-600 disabled:opacity-50"
                  aria-label={`Remove ${item.attendee?.displayName ?? "attendee"} from roster`}
                  title={`Remove ${item.attendee?.displayName ?? "attendee"} from roster`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search event attendees"
              className="h-10 w-full rounded-lg border border-slate-200 pr-3 pl-9 text-[13px] outline-none focus:border-slate-300"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <select
              value={selectedAttendeeId}
              onChange={(event) => setSelectedAttendeeId(event.target.value)}
              disabled={filteredAttendees.length === 0}
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-600 disabled:opacity-60"
            >
              {filteredAttendees.length === 0 ? (
                <option value="">No attendees available</option>
              ) : (
                filteredAttendees.map((attendee) => (
                  <option key={attendee.id} value={attendee.id}>
                    {attendee.displayName}{attendee.company ? ` · ${attendee.company}` : ""}{attendee.email ? ` · ${attendee.email}` : ""}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={() => {
                void addAttendee();
              }}
              disabled={!selectedAttendeeId || workingId === selectedAttendeeId}
              className="inline-flex h-9 shrink-0 items-center rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
            >
              Add attendee
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function FnbSourceMenusTable({
  menus,
  workingMenuId,
  onArchive,
  onDelete,
  onAmend,
  onRerun,
}: {
  menus: FnbSourceMenu[];
  workingMenuId: string | null;
  onArchive: (menu: FnbSourceMenu) => void;
  onDelete: (menu: FnbSourceMenu) => void;
  onAmend: (menu: FnbSourceMenu) => void;
  onRerun: (menu: FnbSourceMenu) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-[540px] w-full table-fixed divide-y divide-slate-200 text-left">
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[15%]" />
          <col className="w-[22%]" />
          <col className="w-[8%]" />
          <col className="w-[13%]" />
          <col className="w-[14%]" />
        </colgroup>
        <thead className="bg-slate-50">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <th className="px-2.5 py-2">Menu</th>
            <th className="px-2.5 py-2">Status</th>
            <th className="px-2.5 py-2">Progress</th>
            <th className="px-2.5 py-2">Items</th>
            <th className="px-2.5 py-2">Updated</th>
            <th className="px-2.5 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-[12px]">
          {menus.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-5 text-center">
                <p className="text-[12px] font-semibold text-slate-700">No source menus uploaded</p>
                <p className="mt-1 text-[11px] text-slate-500">Upload menus here, then review approved items below.</p>
              </td>
            </tr>
          ) : (
            menus.map((menu) => {
              const actions = fnbSourceMenuActions(menu.status);
              return (
                <tr key={menu.id} className="hover:bg-slate-50">
                  <td className="px-2.5 py-2 align-middle">
                    <p className="truncate font-semibold text-slate-950">{menu.menuName}</p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">{menu.fileName}</p>
                  </td>
                  <td className="px-2.5 py-2 align-middle">
                    <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${FNB_SOURCE_MENU_STATUS_TONE[menu.status]}`}>
                      {fnbSourceMenuStatusLabel(menu.status)}
                    </span>
                  </td>
                  <td className="px-2.5 py-2 align-middle text-[11px] leading-4 text-slate-600">
                    <span className="line-clamp-2">
                      {menu.status === "FAILED" && menu.lastError
                        ? "Menu parsing failed. Please retry or replace this source menu."
                        : menu.progressSummary}
                    </span>
                  </td>
                  <td className="px-2.5 py-2 align-middle font-semibold text-slate-900">{menu.itemsFound}</td>
                  <td className="px-2.5 py-2 align-middle text-[11px] text-slate-500">{formatShortDateTime(menu.lastUpdated)}</td>
                  <td className="px-2.5 py-2 align-middle">
                    <div className="flex flex-wrap justify-end gap-1">
                      {actions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          disabled={workingMenuId === menu.id}
                          onClick={() => {
                            if (action === "Archive") onArchive(menu);
                            if (action === "Delete") onDelete(menu);
                            if (action === "Amend") onAmend(menu);
                            if (action === "Re-run") onRerun(menu);
                          }}
                          className={[
                            "rounded-md border bg-white px-1.5 py-0.5 text-[10px] font-semibold hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400",
                            action === "Delete"
                              ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                              : "border-slate-200 text-slate-600",
                          ].join(" ")}
                        >
                          {workingMenuId === menu.id ? "Working..." : action}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function FnbSourceMenusSection({
  menus,
  approvedItemCount,
  expanded,
  onToggle,
  uploadMenus,
  openCatalogEditor,
  workingMenuId,
  onArchive,
  onDelete,
  onAmend,
  onRerun,
}: {
  menus: FnbSourceMenu[];
  approvedItemCount: number;
  expanded: boolean;
  onToggle: () => void;
  uploadMenus: () => void;
  openCatalogEditor: () => void;
  workingMenuId: string | null;
  onArchive: (menu: FnbSourceMenu) => void;
  onDelete: (menu: FnbSourceMenu) => void;
  onAmend: (menu: FnbSourceMenu) => void;
  onRerun: (menu: FnbSourceMenu) => void;
}) {
  const hasMenus = menus.length > 0;
  const isExpanded = !hasMenus || expanded;
  const reviewCount = menus.filter((menu) => menu.status === "REVIEW_NEEDED").length;
  const summary = `${menus.length} menu${menus.length === 1 ? "" : "s"} · ${approvedItemCount} approved item${approvedItemCount === 1 ? "" : "s"}`;

  return (
    <section className="border-b border-slate-200 bg-white">
      <div className={`relative ${FNB_WORKSPACE_GRID_CLASS} items-center px-4 py-2.5 sm:px-5`}>
        {hasMenus ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls="fnb-source-menus-content"
            aria-label={`${isExpanded ? "Collapse" : "Expand"} Source Menus`}
            className="absolute inset-0 rounded-none text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#28439A]/45"
          >
            <span className="sr-only">{isExpanded ? "Collapse" : "Expand"} Source Menus</span>
          </button>
        ) : null}
        <div className="pointer-events-none relative z-10 min-w-0 lg:col-span-1 xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold text-slate-950">Source Menus</h3>
            {reviewCount > 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                {reviewCount} need review
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{summary}</p>
        </div>
        <div className="pointer-events-none relative z-10 flex min-w-0 flex-wrap items-center gap-2 lg:justify-self-end xl:col-start-3">
          <button
            type="button"
            onClick={openCatalogEditor}
            className="pointer-events-auto inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Edit Catalog
          </button>
          <button
            type="button"
            onClick={uploadMenus}
            className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#28439A] px-2.5 text-[11px] font-semibold text-white shadow-sm hover:bg-[#243d8e]"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Menu
          </button>
          {hasMenus ? (
            <ChevronDown
              aria-hidden="true"
              className={[
                "h-4 w-4 shrink-0 text-slate-500 transition-transform",
                isExpanded ? "rotate-180" : "rotate-0",
              ].join(" ")}
            />
          ) : null}
        </div>
      </div>
      {isExpanded ? (
        <div id="fnb-source-menus-content" className="px-4 pb-3 sm:px-5">
          <p className="mb-2.5 text-[11px] leading-snug text-slate-500">
            Upload and manage source menu documents without leaving this session planner.
          </p>
          <FnbSourceMenusTable
            menus={menus}
            workingMenuId={workingMenuId}
            onArchive={onArchive}
            onDelete={onDelete}
            onAmend={onAmend}
            onRerun={onRerun}
          />
        </div>
      ) : null}
    </section>
  );
}

function FnbSourceMenuCleanupModal({
  action,
  menu,
  isWorking,
  onCancel,
  onConfirm,
}: {
  action: FnbSourceMenuCleanupAction;
  menu: FnbSourceMenu;
  isWorking: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDelete = action === "delete";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-950">
              {isDelete ? "Delete menu and its unassigned catalog items" : "Archive menu"}
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-slate-500">
              {isDelete
                ? "Delete is blocked if any catalog item from this menu is assigned to a session."
                : "Archived menus are hidden from the active Source Menus table but remain historical records."}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isWorking}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Close source menu cleanup confirmation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[13px] font-semibold text-slate-950">{menu.menuName}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{menu.fileName}</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isWorking}
              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isWorking}
              className={[
                "inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold text-white shadow-sm disabled:opacity-60",
                isDelete ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-900 hover:bg-slate-800",
              ].join(" ")}
            >
              {isWorking ? "Working..." : isDelete ? "Delete menu" : "Archive menu"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FnbCatalogEditModal({
  items,
  onSaveItem,
  onClose,
}: {
  items: FnbLibraryItem[];
  onSaveItem: (itemId: string, draft: FnbCatalogEditDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FnbCatalogEditDraft | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function startEditing(item: FnbLibraryItem) {
    setErrorMessage(null);
    setEditingItemId(item.id);
    setDraft({
      itemName: item.itemName,
      description: item.description,
      category: item.category,
      price: item.price,
      unit: item.unit,
      sourceMenuFileName: item.sourceMenuFileName,
      status: "Approved",
    });
  }

  function updateDraft(field: keyof FnbCatalogEditDraft, value: string) {
    setDraft((current) => (current ? {
      ...current,
      [field]: field === "status" ? value as FnbCatalogEditDraft["status"] : value,
    } : current));
  }

  async function saveEditingItem(itemId: string) {
    if (!draft?.itemName.trim()) {
      setErrorMessage("Item name is required.");
      return;
    }

    setSavingItemId(itemId);
    setErrorMessage(null);
    try {
      await onSaveItem(itemId, draft);
      setEditingItemId(null);
      setDraft(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save catalog item.");
    } finally {
      setSavingItemId(null);
    }
  }

  function cancelEditing() {
    setEditingItemId(null);
    setDraft(null);
    setErrorMessage(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <section className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-[92rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-950">Approved Catalog Items</h2>
            <p className="mt-1 text-[12px] leading-5 text-slate-500">
              Edit approved item details used by session assignments, or archive an item to remove it from the approved list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Close catalog editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-auto p-4">
          {errorMessage ? (
            <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{errorMessage}</p>
          ) : null}
	          <div className="overflow-x-auto rounded-xl border border-slate-200">
	            <table className="min-w-[900px] w-full table-fixed divide-y divide-slate-200 text-left text-[13px]">
	              <colgroup>
	                <col className="w-[30%]" />
	                <col className="w-[11%]" />
	                <col className="w-[12%]" />
	                <col className="w-[7%]" />
	                <col className="w-[12%]" />
	                <col className="w-[9%]" />
	                <col className="w-[19%]" />
	              </colgroup>
	              <thead className="bg-slate-50">
	                <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
	                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Status</th>
	                  <th className="sticky right-0 z-10 bg-slate-50 px-3 py-2 text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-[12px] text-slate-500">
                      No approved catalog items yet.
                    </td>
                  </tr>
                ) : (
	                  items.map((item) => {
	                    const rowDraft = editingItemId === item.id ? draft : null;
	                    const isSaving = savingItemId === item.id;
	                    const priceDisplay = formatCatalogItemPriceDisplay(item);
	                    const unitDisplay = catalogItemPriceDisplayIncludesUnit(item)
	                      ? "Included"
	                      : (formatCatalogItemUnitDisplay(item) || "No unit");
	                    return (
                      <tr key={item.id}>
	                        <td className="px-3 py-2 align-top">
	                          {rowDraft ? (
	                            <div className="space-y-1.5">
	                              <input
	                                value={rowDraft.itemName}
	                                onChange={(event) => updateDraft("itemName", event.target.value)}
                                className="h-8 w-full rounded-md border border-slate-200 px-2 text-[12px] font-semibold text-slate-900 outline-none focus:border-slate-300"
                                placeholder="Item name"
                              />
                              <textarea
                                value={rowDraft.description ?? ""}
                                onChange={(event) => updateDraft("description", event.target.value)}
                                className="min-h-16 w-full resize-y rounded-md border border-slate-200 px-2 py-1.5 text-[12px] text-slate-700 outline-none focus:border-slate-300"
                                placeholder="Description"
                              />
                            </div>
                          ) : (
                            <>
                              <p className="font-semibold text-slate-950">{item.itemName}</p>
                              {item.description ? <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{item.description}</p> : null}
                            </>
                          )}
                        </td>
	                        <td className="px-3 py-2 align-top text-slate-600">
	                          {rowDraft ? (
	                            <input
	                              value={rowDraft.category ?? ""}
	                              onChange={(event) => updateDraft("category", event.target.value)}
                              className="h-8 w-full rounded-md border border-slate-200 px-2 text-[12px] text-slate-700 outline-none focus:border-slate-300"
                              placeholder="Category"
                            />
                          ) : (
                            item.category || "Uncategorized"
                          )}
                        </td>
		                        <td className="whitespace-nowrap px-3 py-2 align-top font-semibold leading-snug text-slate-900">
		                          {rowDraft ? (
		                            <input
		                              value={rowDraft.price ?? ""}
		                              onChange={(event) => updateDraft("price", event.target.value)}
		                              className="h-8 w-full min-w-0 rounded-md border border-slate-200 px-2 text-[12px] text-slate-700 outline-none focus:border-slate-300"
		                              placeholder="$0"
		                            />
		                          ) : (
		                            <span className="block max-w-full truncate" title={priceDisplay || "TBD"}>{priceDisplay || "TBD"}</span>
			                          )}
			                        </td>
			                        <td className="px-2 py-2 align-top text-slate-600">
		                          {rowDraft ? (
		                            <input
		                              value={rowDraft.unit ?? ""}
		                              onChange={(event) => updateDraft("unit", event.target.value)}
		                              className="h-8 w-full min-w-0 rounded-md border border-slate-200 px-2 text-[12px] text-slate-700 outline-none focus:border-slate-300"
		                              placeholder="per person"
		                            />
		                          ) : (
			                            <span
			                              className={[
			                                "block truncate text-[11px]",
			                                unitDisplay === "Included" ? "text-slate-400" : "text-slate-600",
			                              ].join(" ")}
			                              title={unitDisplay}
			                            >
			                              {unitDisplay}
			                            </span>
			                          )}
			                        </td>
	                        <td className="px-2 py-2 align-top text-slate-600">
	                          <span className="block max-w-full truncate text-[11px] leading-snug" title={item.sourceMenuFileName || "Manual entry"}>
	                            {item.sourceMenuFileName || "Manual entry"}
	                          </span>
	                        </td>
                        <td className="px-3 py-2 align-top">
                          {rowDraft ? (
                            <select
                              value={rowDraft.status}
                              onChange={(event) => updateDraft("status", event.target.value)}
                              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-slate-300"
                            >
                              <option>Approved</option>
                              <option>Archived</option>
                            </select>
                          ) : (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              Approved
                            </span>
                          )}
                        </td>
	                        <td className="sticky right-0 z-10 bg-white px-3 py-2 align-top shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]">
	                          <div className="flex min-w-[8.75rem] flex-nowrap justify-end gap-1.5">
                            {rowDraft ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void saveEditingItem(item.id);
                                  }}
                                  disabled={isSaving || !rowDraft.itemName.trim()}
	                                  className="inline-flex h-7 items-center whitespace-nowrap rounded-md bg-slate-900 px-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                >
                                  {isSaving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  disabled={isSaving}
	                                  className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditing(item)}
                                disabled={savingItemId !== null}
	                                className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

// In-content horizontal module navigation for the session workspace. The session
// stays inside the normal event shell, so module switching lives in the content
// area as a compact segmented row.
function SessionModuleTabs({
  activeTab,
  focusItems,
  linkItems,
  onFocus,
  onSave,
  isSaving,
  saveDisabled = false,
  showSave = true,
}: {
  activeTab: WorkspaceTabId;
  focusItems: SessionRailFocusItem[];
  linkItems: SessionRailLinkItem[];
  onFocus: (tab: WorkspaceTabId) => void;
  onSave: () => void;
  isSaving: boolean;
  saveDisabled?: boolean;
  showSave?: boolean;
}) {
  const tabBase =
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition";
  return (
    <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-100/70 p-1">
      <nav
        aria-label="Session modules"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {focusItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onFocus(item.id)}
              aria-current={active ? "page" : undefined}
              title={item.description}
              className={[
                tabBase,
                active
                  ? "border-[#28439A] bg-white text-slate-950 shadow-sm ring-1 ring-[#28439A]/10"
                  : "border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900",
              ].join(" ")}
            >
              <span className="whitespace-nowrap">{item.label}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${readinessDotClasses(item.status)}`} aria-label={item.badge} />
            </button>
          );
        })}
        {linkItems.map((item) => {
          return item.disabled ? (
            <span
              key={item.id}
              data-session-module-unavailable={item.id}
              aria-disabled="true"
              className={[tabBase, "border-transparent bg-slate-200/70 text-slate-500"].join(" ")}
            >
              <span className="whitespace-nowrap">{item.label}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                {item.badge}
              </span>
            </span>
          ) : (
            <Link
              key={item.id}
              href={item.href ?? "#"}
              className={[tabBase, "border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900"].join(" ")}
            >
              <span className="whitespace-nowrap">{item.label}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${readinessDotClasses(item.status)}`} aria-label={item.badge} />
            </Link>
          );
        })}
      </nav>
      {showSave ? (
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || saveDisabled}
          className={`inline-flex h-8 shrink-0 items-center rounded-lg px-3.5 text-[12px] font-semibold transition hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:opacity-50 ${EVENT_MODULE_PRIMARY_CLASS}`}
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      ) : null}
    </div>
  );
}

function AttentionPopoverButton({
  items,
  onFollow,
}: {
  items: AttentionItem[];
  onFollow: (item: AttentionItem) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (popoverRootRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (items.length === 0) return null;

  return (
    <div ref={popoverRootRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="session-attention-popover"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-rose-200 bg-rose-600 px-3.5 text-[12px] font-semibold text-white shadow-sm shadow-rose-200/70 ring-4 ring-rose-100 transition hover:bg-rose-700"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {items.length} need attention
      </button>
      {isOpen ? (
        <div
          id="session-attention-popover"
          role="dialog"
          aria-label="Needs your attention"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex h-12 items-center justify-between gap-3 border-b border-slate-200 px-4">
            <h2 className="truncate text-[16px] font-semibold text-slate-950">Needs your attention</h2>
            <span className="shrink-0 text-[12px] font-medium text-slate-400">worst first</span>
          </div>
          <div className="divide-y divide-slate-200">
            {items.map((item) => (
              <div key={item.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                <AlertTriangle className={`h-4 w-4 shrink-0 ${attentionIconClasses(item.tone)}`} aria-hidden />
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-950">{attentionIssueLabel(item)}</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onFollow(item);
                  }}
                  className="inline-flex h-7 shrink-0 items-center rounded-lg px-2.5 text-[12px] font-semibold text-[#28439A] hover:bg-slate-50"
                >
                  {attentionActionLabel(item)}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SessionHeaderSwitcher({
  currentSessionId,
  currentTitle,
  eventId,
  searchParams,
  sessions,
}: {
  currentSessionId: string;
  currentTitle: string;
  eventId: string;
  searchParams: ReturnType<typeof useSearchParams>;
  sessions: SessionSwitcherOption[];
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredSessions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return sessions;
    return sessions.filter((entry) => sessionSwitcherSearchText(entry).includes(normalizedSearch));
  }, [search, sessions]);

  useEffect(() => {
    if (!open) return;

    searchInputRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setSearch("");
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setSearch("");
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = useCallback((targetSessionId: string) => {
    setOpen(false);
    setSearch("");
    if (targetSessionId === currentSessionId) return;
    router.push(buildSessionWorkspaceSwitchHref(eventId, targetSessionId, searchParams));
  }, [currentSessionId, eventId, router, searchParams]);

  const canSwitch = sessions.length > 1;

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          if (!canSwitch) return;
          setOpen((current) => !current);
        }}
	        disabled={!canSwitch}
	        className={[
	          "group flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition",
	          canSwitch ? "hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200" : "cursor-default",
	        ].join(" ")}
        aria-expanded={canSwitch ? open : undefined}
        aria-haspopup={canSwitch ? "dialog" : undefined}
        aria-label={canSwitch ? "Switch session" : undefined}
      >
	        <h1 className="truncate text-[22px] font-semibold leading-7 tracking-tight text-slate-950 max-[900px]:text-[20px]" title={currentTitle}>
	          {currentTitle}
	        </h1>
        {canSwitch ? (
          <ChevronDown className={`h-4.5 w-4.5 shrink-0 text-slate-400 transition group-hover:text-slate-600 ${open ? "rotate-180" : "rotate-0"}`} />
        ) : null}
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sessions"
              className="h-9 w-full bg-transparent text-[14px] text-slate-800 outline-none placeholder:text-slate-400"
              aria-label="Search sessions in this event"
            />
          </div>
          <div className="mt-2 max-h-72 overflow-y-auto pr-1">
            {filteredSessions.length > 0 ? (
              <div className="space-y-1">
                {filteredSessions.map((entry) => {
                  const selected = entry.id === currentSessionId;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleSelect(entry.id)}
                      className={[
                        "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition",
                        selected ? "bg-slate-100" : "hover:bg-slate-50",
                      ].join(" ")}
                      aria-current={selected ? "page" : undefined}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-slate-900">{entry.title}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-slate-500">
                          {formatSessionDate(entry.date)} · {formatTimeLabel(entry.startTime)}–{formatTimeLabel(entry.endTime)} · {entry.roomName || "Room unassigned"}
                        </span>
                      </span>
                      {selected ? (
                        <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Current
                        </span>
                      ) : entry.sessionType ? (
                        <span className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                          {entry.sessionType}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-[13px] text-slate-500">
                No sessions match that search.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SessionDetailWorkspace({ eventId, sessionId }: SessionDetailWorkspaceProps) {
  const terminology = useEventTerminology();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomSetAndSeatingAvailable = isRoomSetAndSeatingAvailable();
  const [snapshot, setSnapshot] = useState<Matrix2Snapshot | null>(null);
  const [session, setSession] = useState<Matrix2Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snapshotLoadError, setSnapshotLoadError] = useState<string | null>(null);
  const snapshotRequestVersionRef = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [optionalModuleSettings, setOptionalModuleSettings] = useState<Array<{ module: "ACCESSIBILITY" | "VENDOR_AND_PRODUCTION" | "SAFETY_AND_ESCALATION"; enabled: boolean; source: "event_default" | "session_override" }>>([]);
  const [moduleSettingsOpen, setModuleSettingsOpen] = useState(false);
  const [moduleSettingsSaving, setModuleSettingsSaving] = useState<string | null>(null);
  const [operationSummaries, setOperationSummaries] = useState<Record<"ACCESSIBILITY" | "VENDOR_AND_PRODUCTION" | "SAFETY_AND_ESCALATION", Array<{ status: string; ownerPerson: { id: string } | null }>>>({ ACCESSIBILITY: [], VENDOR_AND_PRODUCTION: [], SAFETY_AND_ESCALATION: [] });
  const [supplySummary, setSupplySummary] = useState<{ readiness: "not_needed" | "needs_info" | "needs_work" | "blocked" | "ready"; allocations: Array<{ quantity: number | null; unit: string; oneOffName: string | null; supplyItem: { name: string } | null }> } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const accept = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const candidate = payload as typeof supplySummary;
      if (candidate && Array.isArray(candidate.allocations)) setSupplySummary(candidate);
    };
    void fetch(`/api/events/${eventId}/matrix-2/sessions/${sessionId}/supplies`, { signal: controller.signal }).then((response) => response.ok ? response.json() : null).then(accept).catch(() => undefined);
    const onUpdate = (event: Event) => { const detail = (event as CustomEvent<{ sessionId: string; payload: unknown }>).detail; if (detail?.sessionId === sessionId) accept(detail.payload); };
    window.addEventListener("orca:supplies-updated", onUpdate);
    return () => { controller.abort(); window.removeEventListener("orca:supplies-updated", onUpdate); };
  }, [eventId, sessionId]);

  useEffect(() => {
    const reload = () => {
      (["ACCESSIBILITY", "VENDOR_AND_PRODUCTION", "SAFETY_AND_ESCALATION"] as const).forEach((module) => {
        void fetch(`/api/events/${eventId}/matrix-2/sessions/${sessionId}/operations?module=${module}`)
          .then((response) => response.ok ? response.json() : [])
          .then((rows) => setOperationSummaries((current) => ({ ...current, [module]: Array.isArray(rows) ? rows : [] })));
      });
    };
    reload(); const onUpdate = (event: Event) => { if ((event as CustomEvent<{ sessionId: string }>).detail?.sessionId === sessionId) reload(); }; window.addEventListener("orca:session-operations-updated", onUpdate); return () => window.removeEventListener("orca:session-operations-updated", onUpdate);
  }, [eventId, sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/events/${eventId}/matrix-2/sessions/${sessionId}/modules`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (!controller.signal.aborted && Array.isArray(payload?.modules)) setOptionalModuleSettings(payload.modules); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [eventId, sessionId]);


  const [title, setTitle] = useState("");
  const [sessionType, setSessionType] = useState("");
  const [includeInOfficialAgenda, setIncludeInOfficialAgenda] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [expectedAttendanceText, setExpectedAttendanceText] = useState("");
  const [expectedAttendanceSource, setExpectedAttendanceSource] = useState<ExpectedAttendanceSource | null>(null);
  const [notes, setNotes] = useState("");
  const [selectedSpeakers, setSelectedSpeakers] = useState<SpeakerSelection[]>([]);
  const [selectedRequirementValues, setSelectedRequirementValues] = useState<Record<string, string>>({});
  const [linkedBudgetLineItemsByItemId, setLinkedBudgetLineItemsByItemId] = useState<Map<string, LinkedBudgetLineItem>>(new Map());
  const [eventBudgetLineItems, setEventBudgetLineItems] = useState<EventBudgetLineItemRow[]>([]);
  const [budgetLinesReady, setBudgetLinesReady] = useState(false);
  const [budgetLinesLoading, setBudgetLinesLoading] = useState(false);
  const [budgetLinesError, setBudgetLinesError] = useState<string | null>(null);
  const budgetLoadInFlightRef = useRef(false);
  const [customItemDrafts, setCustomItemDrafts] = useState<Record<string, string>>({});
  const [customItemErrors, setCustomItemErrors] = useState<Record<string, string>>({});
  const [savingCustomItemSectionId, setSavingCustomItemSectionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>(() => initialWorkspaceFocus(searchParams));
  const [showFlowSummary, setShowFlowSummary] = useState({
    count: 0,
    blocking: 0,
    warnings: 0,
    unpublished: false,
    loaded: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/events/${eventId}/sessions/${sessionId}/show-flow?mode=workspace`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!payload || controller.signal.aborted) return;
        const conflicts = Array.isArray(payload.conflicts) ? payload.conflicts as Array<{ severity?: string }> : [];
        setShowFlowSummary({
          count: Array.isArray(payload.items) ? payload.items.length : 0,
          blocking: conflicts.filter((entry) => entry.severity === "BLOCKING").length,
          warnings: conflicts.filter((entry) => entry.severity === "WARNING").length,
          unpublished: Boolean(payload.publication?.hasUnpublishedChanges),
          loaded: true,
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [eventId, sessionId]);
  const [fnbLibraryItems, setFnbLibraryItems] = useState<FnbLibraryItem[]>([]);
  const [fnbLibraryLoading, setFnbLibraryLoading] = useState(false);
  const [fnbLibraryError, setFnbLibraryError] = useState<string | null>(null);
  const [fnbLibrarySearch, setFnbLibrarySearch] = useState("");
  const [fnbCategoryFilter, setFnbCategoryFilter] = useState("All");
  const [fnbSourceMenus, setFnbSourceMenus] = useState<FnbSourceMenu[]>([]);
  const [isFnbSourceMenusExpanded, setIsFnbSourceMenusExpanded] = useState(true);
  const [workingFnbSourceMenuId, setWorkingFnbSourceMenuId] = useState<string | null>(null);
  const [fnbSourceMenuNotice, setFnbSourceMenuNotice] = useState<string | null>(null);
  const [fnbSourceMenuError, setFnbSourceMenuError] = useState<string | null>(null);
  const [fnbAmendmentBaseSourceMenuId, setFnbAmendmentBaseSourceMenuId] = useState<string | null>(null);
  const [pendingFnbSourceMenuCleanup, setPendingFnbSourceMenuCleanup] = useState<{
    action: FnbSourceMenuCleanupAction;
    menu: FnbSourceMenu;
  } | null>(null);
  const [isFnbCatalogEditOpen, setIsFnbCatalogEditOpen] = useState(false);
  const fnbMenuUploadInputRef = useRef<HTMLInputElement>(null);
  const fnbSourceMenusInitialLoadRef = useRef(false);
  const [selectedFnbSessionId, setSelectedFnbSessionId] = useState(sessionId);
  const [fnbAssignments, setFnbAssignments] = useState<SessionFnbCatalogAssignment[]>([]);
  const fnbAssignmentsRef = useRef<SessionFnbCatalogAssignment[]>([]);
  const selectedFnbSessionIdRef = useRef(selectedFnbSessionId);
  const [fnbAssignmentsLoading, setFnbAssignmentsLoading] = useState(false);
  const [fnbAssignmentError, setFnbAssignmentError] = useState<string | null>(null);
  const [fnbAssignmentNotice, setFnbAssignmentNotice] = useState<string | null>(null);
  const [fnbPlan, setFnbPlan] = useState<SessionFnbPlan | null>(null);
  const [fnbTaxPercentText, setFnbTaxPercentText] = useState("0.00");
  const [fnbServiceChargePercentText, setFnbServiceChargePercentText] = useState("0.00");
  const [fnbPlanError, setFnbPlanError] = useState<string | null>(null);
  const [workingFnbAssignmentId, setWorkingFnbAssignmentId] = useState<string | null>(null);
  const [addingFnbCatalogItemId, setAddingFnbCatalogItemId] = useState<string | null>(null);
  const [isCustomFnbOpen, setIsCustomFnbOpen] = useState(false);
  const [customFnbSaving, setCustomFnbSaving] = useState(false);
  const [customFnbError, setCustomFnbError] = useState<string | null>(null);
  const [fnbDropActive, setFnbDropActive] = useState(false);
  const [fnbSafetyAlert, setFnbSafetyAlert] = useState<SessionFnbSafetyAlertSummary | null>(null);
  const fnbSourceMenuPollingActiveRef = useRef(false);
  const fnbCatalogRequestVersionRef = useRef(0);
  const fnbAssignmentsRequestVersionRef = useRef(0);
  const fnbPlanRequestVersionRef = useRef(0);

  useEffect(() => {
    setSelectedFnbSessionId(sessionId);
  }, [sessionId]);

  useEffect(() => {
    selectedFnbSessionIdRef.current = selectedFnbSessionId;
  }, [selectedFnbSessionId]);

  useEffect(() => {
    fnbAssignmentsRef.current = fnbAssignments;
  }, [fnbAssignments]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/events/${eventId}/matrix-2/sessions/${sessionId}/fnb-safety`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (controller.signal.aborted || !payload?.alert) return;
        setFnbSafetyAlert(payload.alert as SessionFnbSafetyAlertSummary);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [eventId, fnbAssignments, sessionId]);

  const loadSnapshot = useCallback(async (signal?: AbortSignal) => {
    const requestVersion = snapshotRequestVersionRef.current + 1;
    snapshotRequestVersionRef.current = requestVersion;
    setIsLoading(true);
    setSnapshotLoadError(null);
    setSnapshot(null);
    setSession(null);

    try {
      const result = await fetchSessionDetailSnapshot<Matrix2Session, Matrix2Snapshot>({ eventId, sessionId, signal });
      if (snapshotRequestVersionRef.current !== requestVersion) return;
      setSnapshot(result.snapshot);
      setSession(result.kind === "success" ? result.session : null);

      if (result.kind === "success") {
        const nextSession = result.session;
        setTitle(nextSession.title);
        setSessionType(nextSession.sessionType || DEFAULT_SESSION_TYPE);
        setIncludeInOfficialAgenda(Boolean(nextSession.includeInOfficialAgenda));
        setRoomId(nextSession.roomId ?? "");
        setStartTime(nextSession.startTime);
        setEndTime(nextSession.endTime);
        setExpectedAttendanceText(nextSession.expectedAttendance === null ? "" : String(nextSession.expectedAttendance));
        setExpectedAttendanceSource(nextSession.expectedAttendanceSource ?? null);
        setNotes(nextSession.notes || "");
        setSelectedSpeakers(nextSession.speakerAssignments);
        setSelectedRequirementValues(initialRequirementSelectionMap(nextSession));
        setLinkedBudgetLineItemsByItemId(initialBudgetLinkMap(nextSession));
      }
    } catch (error) {
      if (snapshotRequestVersionRef.current !== requestVersion) return;
      setSnapshotLoadError(error instanceof Error ? error.message : "Failed to load session");
      setSnapshot(null);
      setSession(null);
    } finally {
      if (snapshotRequestVersionRef.current === requestVersion) {
        setIsLoading(false);
      }
    }
  }, [eventId, sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSnapshot(controller.signal);
    return () => {
      // Invalidate before aborting so a previous event/session cannot change this view.
      snapshotRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [loadSnapshot]);

  const loadFnbCatalogItems = useCallback(async (reason = "manual", signal?: AbortSignal) => {
    const requestVersion = ++fnbCatalogRequestVersionRef.current;
    setFnbLibraryLoading(true);
    setFnbLibraryError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/fnb-catalog`, { signal });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load F&B catalog"));
      }
      const catalogPayload = payload as FnbCatalogApiPayload;
      const nextItems = Array.isArray(payload)
        ? (payload as FnbLibraryItem[])
        : catalogPayload && typeof catalogPayload === "object" && Array.isArray(catalogPayload.items)
          ? catalogPayload.items
          : null;
      const nextSourceMenus = Array.isArray(payload)
        ? []
        : catalogPayload && typeof catalogPayload === "object" && Array.isArray(catalogPayload.sourceMenus)
          ? catalogPayload.sourceMenus.map(normalizeFnbSourceMenuRecord)
          : null;
      if (!nextItems || !nextSourceMenus || nextItems.some((item) => !item || typeof item.id !== "string") || nextSourceMenus.some((menu) => !menu.id)) {
        throw new Error("F&B catalog response was invalid. Retry to load the latest catalog.");
      }
      if (signal?.aborted || fnbCatalogRequestVersionRef.current !== requestVersion) return;
      setFnbLibraryItems(nextItems);
      setFnbSourceMenus(nextSourceMenus);
      if (!fnbSourceMenusInitialLoadRef.current) {
        setIsFnbSourceMenusExpanded(nextSourceMenus.length === 0);
        fnbSourceMenusInitialLoadRef.current = true;
      }
      console.info("[fnb-source-menu] catalog/source menu refetch", {
        eventId,
        reason,
        itemCount: nextItems.length,
        sourceMenuCount: nextSourceMenus.length,
      });
      console.info("[fnb-source-menu] sourceMenus count returned", {
        eventId,
        reason,
        sourceMenuCount: nextSourceMenus.length,
      });
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (fnbCatalogRequestVersionRef.current !== requestVersion) return;
      setFnbLibraryError(error instanceof Error ? error.message : "Failed to load F&B catalog");
    } finally {
      if (fnbCatalogRequestVersionRef.current === requestVersion) setFnbLibraryLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadFnbCatalogItems("initial", controller.signal);
    return () => {
      fnbCatalogRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [loadFnbCatalogItems]);

  const hasActiveFnbSourceMenus = useMemo(
    () => fnbSourceMenus.some((menu) => FNB_SOURCE_MENU_ACTIVE_STATUSES.has(menu.status)),
    [fnbSourceMenus],
  );

  useEffect(() => {
    if (!hasActiveFnbSourceMenus) {
      if (fnbSourceMenuPollingActiveRef.current) {
        console.info("[fnb-source-menu] polling stop", { eventId });
        fnbSourceMenuPollingActiveRef.current = false;
      }
      return;
    }

    if (!fnbSourceMenuPollingActiveRef.current) {
      console.info("[fnb-source-menu] polling start", { eventId });
      fnbSourceMenuPollingActiveRef.current = true;
    }
    const intervalId = window.setInterval(() => {
      void loadFnbCatalogItems("source-menu-poll");
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [eventId, hasActiveFnbSourceMenus, loadFnbCatalogItems]);

  async function updateApprovedFnbCatalogItem(itemId: string, draft: FnbCatalogEditDraft) {
    if (draft.status === "Archived") {
      const response = await fetch(`/api/events/${eventId}/fnb-catalog/${itemId}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to archive catalog item"));
      }

      setFnbLibraryItems((current) => current.filter((item) => item.id !== itemId));
      setFnbAssignments((current) => current.filter((assignment) => assignment.catalogItem.id !== itemId));
      return;
    }

    const catalogDraft: Pick<FnbCatalogEditDraft, "itemName" | "description" | "category" | "price" | "unit" | "sourceMenuFileName"> = {
      itemName: draft.itemName,
      description: draft.description,
      category: draft.category,
      price: draft.price,
      unit: draft.unit,
      sourceMenuFileName: draft.sourceMenuFileName,
    };
    const response = await fetch(`/api/events/${eventId}/fnb-catalog/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(catalogDraft),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(toErrorMessage(payload, "Failed to update catalog item"));
    }

    const updatedItem = payload as FnbLibraryItem;
    setFnbLibraryItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
    setFnbAssignments((current) =>
      current.map((assignment) =>
        assignment.catalogItem.id === updatedItem.id
          ? { ...assignment, catalogItem: updatedItem }
          : assignment,
      ),
    );
  }

  const loadFnbAssignments = useCallback(async (signal?: AbortSignal) => {
    const requestVersion = ++fnbAssignmentsRequestVersionRef.current;
    setFnbAssignmentsLoading(true);
    setFnbAssignmentError(null);
    setFnbAssignmentNotice(null);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${selectedFnbSessionId}/fnb-catalog-assignments`, { signal });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load session F&B assignments"));
      }
      if (!Array.isArray(payload)) throw new Error("The session F&B assignments response was invalid. Please try again.");
      if (signal?.aborted || fnbAssignmentsRequestVersionRef.current !== requestVersion) return;
      const assignments = (payload as SessionFnbCatalogAssignment[]).map(formatFnbAssignmentTaxesForInput);
      setFnbAssignments(assignments);
      fnbAssignmentsRef.current = assignments;
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (fnbAssignmentsRequestVersionRef.current !== requestVersion) return;
      setFnbAssignmentError(error instanceof Error ? error.message : "Failed to load session F&B assignments");
    } finally {
      if (fnbAssignmentsRequestVersionRef.current === requestVersion) setFnbAssignmentsLoading(false);
    }
  }, [eventId, selectedFnbSessionId]);

  const loadFnbPlan = useCallback(async (signal?: AbortSignal) => {
    const requestVersion = ++fnbPlanRequestVersionRef.current;
    setFnbPlanError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${selectedFnbSessionId}/fnb-plan`, { signal });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load session F&B plan"));
      }
      const plan = payload as SessionFnbPlan;
      if (!plan || typeof plan !== "object") throw new Error("The session F&B plan response was invalid. Please try again.");
      if (signal?.aborted || fnbPlanRequestVersionRef.current !== requestVersion) return;
      setFnbPlan(plan);
      setFnbTaxPercentText(formatFnbPercentageForInput(plan.taxPercent));
      setFnbServiceChargePercentText(formatFnbPercentageForInput(plan.serviceChargePercent));
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (fnbPlanRequestVersionRef.current !== requestVersion) return;
      setFnbPlanError(error instanceof Error ? error.message : "Failed to load session F&B plan");
    }
  }, [eventId, selectedFnbSessionId]);

  useEffect(() => {
    if (snapshot?.event.id !== eventId || session?.id !== selectedFnbSessionId) {
      setFnbAssignments([]);
      fnbAssignmentsRef.current = [];
      setFnbPlan(null);
      setFnbAssignmentsLoading(false);
      setFnbAssignmentError(null);
      setFnbPlanError(null);
      return;
    }
    const controller = new AbortController();
    void Promise.all([loadFnbAssignments(controller.signal), loadFnbPlan(controller.signal)]);
    return () => {
      fnbAssignmentsRequestVersionRef.current += 1;
      fnbPlanRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [eventId, loadFnbAssignments, loadFnbPlan, selectedFnbSessionId, session?.id, snapshot?.event.id]);

  const fetchEventBudgetLineItems = useCallback(async () => {
    const response = await fetch(`/api/events/${eventId}/budget?source=matrix-operational-rows`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(toErrorMessage(payload, "Failed to load budget line items"));
    }
    const raw = Array.isArray(payload?.lineItems) ? payload.lineItems as Record<string, unknown>[] : [];
    setEventBudgetLineItems(raw.map((row) => {
      const linked = row.linkedSessionRequirement && typeof row.linkedSessionRequirement === "object"
        ? row.linkedSessionRequirement as Record<string, unknown>
        : null;
      return {
        id: String(row.id ?? ""),
        lineItem: String(row.lineItem ?? ""),
        category: String(row.category ?? ""),
        subcategory: String(row.subcategory ?? ""),
        forecastCents: Number(row.forecastCents ?? 0),
        actualCents: Number(row.actualCents ?? 0),
        status: String(row.status ?? ""),
        sortOrder: Number(row.sortOrder ?? 0),
        matrixRowId: typeof row.matrixRowId === "string" ? row.matrixRowId : null,
        linkedSessionRequirement: linked
          ? {
              sessionId: String(linked.sessionId ?? ""),
              requirementItemId: String(linked.requirementItemId ?? ""),
            }
          : null,
      };
    }));
  }, [eventId]);

  const ensureBudgetLinesLoaded = useCallback(async () => {
    if (budgetLinesReady || budgetLoadInFlightRef.current) return;
    budgetLoadInFlightRef.current = true;
    setBudgetLinesLoading(true);
    setBudgetLinesError(null);
    try {
      await fetchEventBudgetLineItems();
      setBudgetLinesReady(true);
    } catch (error) {
      setBudgetLinesError(error instanceof Error ? error.message : "Failed to load budget lines");
      setBudgetLinesReady(false);
    } finally {
      setBudgetLinesLoading(false);
      budgetLoadInFlightRef.current = false;
    }
  }, [budgetLinesReady, fetchEventBudgetLineItems]);

  const refreshBudgetLinesQuietly = useCallback(async () => {
    try {
      await fetchEventBudgetLineItems();
    } catch {
      setEventBudgetLineItems([]);
    }
  }, [fetchEventBudgetLineItems]);

  useLayoutEffect(() => {
    setBudgetLinesReady(false);
    setBudgetLinesLoading(false);
    setBudgetLinesError(null);
    setEventBudgetLineItems([]);
    budgetLoadInFlightRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (
      activeTab === "fnb"
      || activeTab === "staffing"
      || activeTab === "supplies"
      || activeTab === "signage"
    ) {
      void ensureBudgetLinesLoaded();
    }
  }, [activeTab, ensureBudgetLinesLoaded]);

  useEffect(() => {
    const applyDeepLinkFocus = () => {
      const hashFocus = currentHashFocus();
      const queryFocus = normalizeLinkFocusId(searchParams.get("tab")) ?? normalizeWorkspaceTabId(searchParams.get("tab"));
      const nextFocus = hashFocus ?? queryFocus;

      if (nextFocus === "room-set") {
        // Production shows one disabled Room Set & Seating module; editor routes stay intact for non-production.
        if (!roomSetAndSeatingAvailable) {
          setActiveTab("overview");
          return;
        }
        router.replace(roomSetHref(eventId, sessionId, "layout"));
        return;
      }

      if (nextFocus === "seating") {
        // Production shows one disabled Room Set & Seating module; editor routes stay intact for non-production.
        if (!roomSetAndSeatingAvailable) {
          setActiveTab("overview");
          return;
        }
        router.replace(roomSetHref(eventId, sessionId, "seating"));
        return;
      }

      setActiveTab(nextFocus);
    };

    applyDeepLinkFocus();
    window.addEventListener("hashchange", applyDeepLinkFocus);
    return () => window.removeEventListener("hashchange", applyDeepLinkFocus);
  }, [eventId, roomSetAndSeatingAvailable, router, searchParams, sessionId]);

  const sessionsForDate = useMemo(() => {
    if (!snapshot || !session) return [];
    return snapshot.sessions.filter((entry) => entry.date === session.date);
  }, [session, snapshot]);
  const sessionSwitcherOptions = useMemo(
    () => (snapshot?.sessions ?? []).slice().sort(sortSessionSwitcherOptions),
    [snapshot],
  );

  const conflicts = useMemo(() => {
    if (!session) return [];
    return detectMatrix2Conflicts(sessionsForDate).bySession.get(session.id) ?? [];
  }, [session, sessionsForDate]);
  const visibleConflicts = useMemo(
    () => visibleMatrix2Conflicts(conflicts, { roomSetAndSeatingAvailable }),
    [conflicts, roomSetAndSeatingAvailable],
  );

  // The detector runs over this session's date only, and several rules do not exist yet. The
  // coverage report states both so an empty result cannot read as an event-wide all-clear.
  // Re-stamped whenever the evaluated session set changes, which is when the detector re-runs.
  const conflictEvaluatedAt = useMemo(
    () => new Date().toISOString(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionsForDate],
  );

  const conflictCoverage = useMemo(() => {
    if (!session) return null;
    return buildConflictCoverageReport({
      sessions: sessionsForDate,
      conflicts: detectMatrix2Conflicts(sessionsForDate).conflicts,
      scopeLabel: `${sessionsForDate.length} session${sessionsForDate.length === 1 ? "" : "s"} on ${formatDateLabel(session.date)}`,
      evaluatedAt: conflictEvaluatedAt,
    });
  }, [conflictEvaluatedAt, session, sessionsForDate]);

  const typedSections = useMemo(() => typeSections(snapshot), [snapshot]);
  const avSections = typedSections.filter((entry) => entry.sectionType === "AV").map((entry) => entry.section);
  const fnbSections = typedSections.filter((entry) => entry.sectionType === "FNB").map((entry) => entry.section);
  const staffingSections = typedSections
    .filter((entry) => entry.sectionType === "STAFFING")
    .map((entry) => ({
      ...entry.section,
      items: entry.section.items.filter((item) => isStaffingNeedRequirementItem(item)),
    }));
  const signageSections = typedSections.filter((entry) => entry.sectionType === "SIGNAGE").map((entry) => entry.section);
  const roomSetupSection = typedSections.find((entry) => entry.sectionType === "SETUP")?.section ?? null;
  const statusSection = typedSections.find((entry) => entry.sectionType === "STATUS")?.section ?? null;
  const selectedFnbSession = useMemo(
    () => snapshot?.sessions.find((entry) => entry.id === selectedFnbSessionId) ?? session ?? null,
    [selectedFnbSessionId, session, snapshot],
  );
  const fnbLibraryCategories = useMemo(() => {
    const categories = new Set(fnbLibraryItems.map((item) => item.category?.trim() ?? "").filter(Boolean));
    return ["All", ...Array.from(categories).sort((left, right) => left.localeCompare(right))];
  }, [fnbLibraryItems]);
  const fnbSourceMenuApprovedItemCount = useMemo(() => {
    const sourceMenuIds = new Set(fnbSourceMenus.map((menu) => menu.id));
    return fnbLibraryItems.filter((item) => item.sourceMenuId && sourceMenuIds.has(item.sourceMenuId)).length;
  }, [fnbLibraryItems, fnbSourceMenus]);
  const filteredFnbLibraryItems = useMemo(() => {
    const normalizedSearch = fnbLibrarySearch.trim().toLowerCase();
    return fnbLibraryItems.filter((item) => {
      const matchesCategory = fnbCategoryFilter === "All" || item.category === fnbCategoryFilter;
      const matchesSearch = !normalizedSearch
        || [item.itemName, item.description ?? "", item.category ?? "", item.sourceMenuFileName ?? ""].join(" ").toLowerCase().includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [fnbCategoryFilter, fnbLibraryItems, fnbLibrarySearch]);
  const assignedFnbCatalogItemIds = useMemo(
    () => new Set(fnbAssignments.map((assignment) => assignment.eventFnbCatalogItemId)),
    [fnbAssignments],
  );
  const fnbForecastAttendance = selectedFnbSession?.foodService?.headcount ?? selectedFnbSession?.expectedAttendance ?? null;
  const fnbRateDraft = useMemo(() => {
    try {
      const taxPercentInput = formatFnbPercentageForInput(fnbTaxPercentText);
      const serviceChargePercentInput = formatFnbPercentageForInput(fnbServiceChargePercentText);
      return {
        taxPercent: normalizeFnbPercentage(taxPercentInput),
        serviceChargePercent: normalizeFnbPercentage(serviceChargePercentInput),
        error: null,
      };
    } catch (error) {
      return {
        taxPercent: fnbPlan?.taxPercent ?? "0.0000",
        serviceChargePercent: fnbPlan?.serviceChargePercent ?? "0.0000",
        error: error instanceof Error ? error.message : "Enter valid percentages between 0 and 100",
      };
    }
  }, [fnbPlan?.serviceChargePercent, fnbPlan?.taxPercent, fnbServiceChargePercentText, fnbTaxPercentText]);
  const fnbPlanDirty = Boolean(
    fnbPlan &&
    !fnbRateDraft.error &&
    (fnbRateDraft.taxPercent !== fnbPlan.taxPercent || fnbRateDraft.serviceChargePercent !== fnbPlan.serviceChargePercent),
  );
  const {
    status: fnbAutosaveStatus,
    scheduleAssignment: scheduleFnbAssignmentAutosave,
    schedulePlan: scheduleFnbPlanAutosave,
    retry: retryFnbAutosave,
    markSaved: markFnbAutosaveSaved,
    reportError: reportFnbAutosaveError,
  } = useFnbAutosaveCoordinator<
    FnbAssignmentAutosavePayload,
    SessionFnbCatalogAssignment,
    FnbPlanAutosavePayload,
    SessionFnbPlan
  >({
    saveAssignment: async (payload) => {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${payload.sessionId}/fnb-catalog-assignments/${payload.assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: payload.quantity,
          manualPriceCents: payload.manualPriceCents,
          serviceTiming: payload.serviceTiming,
          notes: payload.notes,
          taxes: payload.taxes,
          expectedUpdatedAt: payload.expectedUpdatedAt,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(toErrorMessage(body, "Failed to update F&B assignment"));
      return formatFnbAssignmentTaxesForInput(body as SessionFnbCatalogAssignment);
    },
    savePlan: async (payload) => {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${payload.sessionId}/fnb-plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxPercent: payload.taxPercent,
          serviceChargePercent: payload.serviceChargePercent,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(toErrorMessage(body, "Failed to save F&B plan"));
      return body as SessionFnbPlan;
    },
    onAssignmentSaved: (updated) => {
      if (updated.sessionId !== selectedFnbSessionIdRef.current) return;
      const next = fnbAssignmentsRef.current.map((entry) => entry.id === updated.id ? updated : entry);
      fnbAssignmentsRef.current = next;
      setFnbAssignments(next);
      setFnbAssignmentError(null);
    },
    onPlanSaved: async (plan) => {
      if (plan.sessionId !== selectedFnbSessionIdRef.current) return;
      setFnbPlan(plan);
      setFnbTaxPercentText(formatFnbPercentageForInput(plan.taxPercent));
      setFnbServiceChargePercentText(formatFnbPercentageForInput(plan.serviceChargePercent));
      setFnbPlanError(null);
      // The plan endpoint returns session rates, not assignment records. Refresh
      // once so the sidebar uses canonical linked BudgetLineItem forecasts.
      await loadFnbAssignments();
    },
  });

  useEffect(() => {
    if (!fnbPlanDirty || fnbRateDraft.error) return;
    scheduleFnbPlanAutosave(`plan:${selectedFnbSessionId}`, {
      sessionId: selectedFnbSessionId,
      taxPercent: fnbRateDraft.taxPercent,
      serviceChargePercent: fnbRateDraft.serviceChargePercent,
    });
  }, [
    fnbPlanDirty,
    fnbRateDraft.error,
    fnbRateDraft.serviceChargePercent,
    fnbRateDraft.taxPercent,
    scheduleFnbPlanAutosave,
    selectedFnbSessionId,
  ]);

  function flushFnbPlanAutosave() {
    if (!fnbPlanDirty || fnbRateDraft.error) return;
    setFnbTaxPercentText(formatFnbPercentageForInput(fnbTaxPercentText));
    setFnbServiceChargePercentText(formatFnbPercentageForInput(fnbServiceChargePercentText));
    scheduleFnbPlanAutosave(`plan:${selectedFnbSessionId}`, {
      sessionId: selectedFnbSessionId,
      taxPercent: fnbRateDraft.taxPercent,
      serviceChargePercent: fnbRateDraft.serviceChargePercent,
    }, true);
  }

  const fnbAssignmentFinancials = useMemo(() => new Map(
    fnbAssignments.map((assignment) => [
      assignment.id,
      assignmentFinancialResult(assignment, fnbRateDraft.taxPercent, fnbRateDraft.serviceChargePercent),
    ]),
  ), [fnbAssignments, fnbRateDraft.serviceChargePercent, fnbRateDraft.taxPercent]);
  const fnbAssignmentCalculations = useMemo(() => new Map(
    Array.from(fnbAssignmentFinancials, ([id, result]) => [id, result.breakdown]),
  ), [fnbAssignmentFinancials]);
  const fnbAssignmentEstimate = useMemo(() => {
    const calculation = calculateFnbPlanCost({
      assignments: fnbAssignments.map((assignment) => fnbAssignmentCalculations.get(assignment.id) ?? assignment.calculation),
      forecastAttendance: fnbForecastAttendance,
    });
    const budgetedCents = sumFnbBudgetedCents(fnbAssignments.map((assignment) => ({
      totalCents: fnbAssignmentCalculations.get(assignment.id)?.totalCents ?? null,
      budgetedCents: assignment.syncedBudgetLineItem?.forecastCents ?? null,
    })));
    return {
      ...calculation,
      budgetedCents,
      variance: calculateFnbVarianceToBudget(calculation.totalEstimatedCents, budgetedCents),
      needsAttention: buildFnbEstimateNeedsAttention({
        forecastAttendance: fnbForecastAttendance,
        budgetedCents,
        assignedItemCount: calculation.assignedItemCount,
        unpricedItemCount: calculation.unpricedItemCount,
      }),
    };
  }, [fnbAssignmentCalculations, fnbAssignments, fnbForecastAttendance]);
  const fnbBudgetLinkedAssignmentCount = useMemo(
    () => fnbAssignments.filter((assignment) => assignment.budgetLineItemId).length,
    [fnbAssignments],
  );
  const fnbEstimateAttentionReasonsOrdered = useMemo(() => {
    const seen = new Set<FnbEstimateAttentionReasonKey>();
    for (const assignment of fnbAssignments) {
      for (const key of collectFnbEstimateAttentionReasonKeys(assignment)) {
        seen.add(key);
      }
    }
    return FNB_ESTIMATE_ATTENTION_REASON_ORDER.filter((key) => seen.has(key)).map((key) => FNB_ESTIMATE_ATTENTION_REASON_COPY[key]);
  }, [fnbAssignments]);
  const fnbEstimateVariance = fnbAssignmentEstimate.variance;
  const fnbEstimateVarianceLabel = fnbEstimateVariance === null
    ? "No budget set"
    : fnbEstimateVariance.direction === "even"
      ? "On budget"
      : `${fnbEstimateVariance.direction === "over" ? "Over" : "Under"} budget`;
  const fnbEstimateVarianceClass = fnbEstimateVariance?.direction === "over"
    ? "text-rose-300"
    : fnbEstimateVariance?.direction === "under"
      ? "text-emerald-300"
      : "text-slate-200";
  const selectedFnbSessionDefaultQuantity = selectedFnbSession?.expectedAttendance ?? normalizeHeadcount(expectedAttendanceText);
  const selectedAvRequirementItems = useMemo(
    () => selectedRequirementReadinessItems(avSections, selectedRequirementValues),
    [avSections, selectedRequirementValues],
  );
  const selectedFnbRequirementItems = useMemo(
    () => selectedRequirementReadinessItems(fnbSections, selectedRequirementValues),
    [fnbSections, selectedRequirementValues],
  );
  const selectedStaffingRequirementItems = useMemo(
    () => selectedRequirementReadinessItems(staffingSections, selectedRequirementValues),
    [staffingSections, selectedRequirementValues],
  );
  const selectedSignageRequirementItems = useMemo(
    () => selectedRequirementReadinessItems(signageSections, selectedRequirementValues),
    [signageSections, selectedRequirementValues],
  );
  const selectedFnbRequirementCount = selectedFnbRequirementItems.length;
  const selectedStaffingRequirementCount = selectedStaffingRequirementItems.length;
  const roomSetupItemIdForRail = selectedSingleItemId(roomSetupSection, selectedRequirementValues);
  const hasRoomSetStarted = Boolean(roomSetupItemIdForRail || (session?.roomSetup ?? "").trim() || roomId);
  const expectedAttendance = normalizeHeadcount(expectedAttendanceText);
  const hasCapacityBlocker =
    expectedAttendance !== null &&
    session?.roomCapacity !== null &&
    typeof session?.roomCapacity === "number" &&
    expectedAttendance > session.roomCapacity;
  const roomSetLink = roomSetHref(eventId, sessionId, "layout");
  const seatingLink = roomSetHref(eventId, sessionId, "seating");
  const fnbCoverageCount = fnbAssignments.length + selectedFnbRequirementCount;
  const optionalModulesEnabled = useMemo(() => new Set(optionalModuleSettings.filter((setting) => setting.enabled).map((setting) => setting.module)), [optionalModuleSettings]);
  const readinessResult = useMemo(() => {
    const avRequirements = [
      ...selectedAvRequirementItems,
      ...(session?.avRequirementsStructured ?? []).map((requirement) => ({
        id: requirement.id,
        label: requirement.avType,
        quantity: requirement.quantity,
      })),
    ];
    const applicability = deriveSessionModuleApplicability({
      sessionType,
      hasSpeakerRequirements: selectedSpeakers.length > 0,
      hasAvRequirements: avRequirements.length > 0,
      hasFnbRequirements: fnbCoverageCount > 0 || Boolean(session?.foodService),
    });

    return deriveSessionReadiness({
      details: {
        title,
        sessionType,
        roomId,
        roomName: session?.roomName ?? null,
        startTime,
        endTime,
      },
      speakers: {
        required: applicability.speakersRequired,
        speakers: selectedSpeakers,
      },
      av: {
        required: applicability.avRequired,
        requirements: avRequirements,
      },
      fnb: {
        serviceRequired: applicability.fnbRequired,
        expectedAttendance,
        foodService: session?.foodService ?? null,
        catalogAssignments: fnbAssignments,
        selectedRequirements: selectedFnbRequirementItems,
        hasStarted: expectedAttendance !== null || fnbCoverageCount > 0,
        safetyAlert: fnbSafetyAlert,
      },
      staffing: {
        assignments: session?.staffAssignments ?? [],
        hasStarted: (session?.staffAssignments.length ?? 0) > 0 || selectedStaffingRequirementCount > 0,
      },
      accessibility: { enabled: optionalModulesEnabled.has("ACCESSIBILITY"), hasStarted: operationSummaries.ACCESSIBILITY.length > 0, hasIncompleteActiveRequirement: operationSummaries.ACCESSIBILITY.some((row) => row.status !== "NOT_NEEDED" && (!row.ownerPerson || row.status !== "CONFIRMED")) },
      vendorProduction: { enabled: optionalModulesEnabled.has("VENDOR_AND_PRODUCTION"), hasStarted: operationSummaries.VENDOR_AND_PRODUCTION.length > 0, hasIncompleteActiveRequirement: operationSummaries.VENDOR_AND_PRODUCTION.some((row) => row.status !== "NOT_NEEDED" && (!row.ownerPerson || row.status !== "CONFIRMED")) },
      safetyEscalation: { enabled: optionalModulesEnabled.has("SAFETY_AND_ESCALATION"), hasStarted: operationSummaries.SAFETY_AND_ESCALATION.length > 0, hasIncompleteActiveRequirement: operationSummaries.SAFETY_AND_ESCALATION.some((row) => row.status !== "NOT_NEEDED" && (!row.ownerPerson || row.status !== "CONFIRMED")) },
      // The dedicated Supplies workspace owns persisted supply allocations and readiness.
      // Legacy generic requirement selections are intentionally not a fallback source here.
      supplies: { required: false },
      signage: {
        required: selectedSignageRequirementItems.length > 0,
        requirements: selectedSignageRequirementItems,
      },
      roomSet: {
        roomRequired: true,
        roomId,
        roomName: session?.roomName ?? null,
        roomSetup: session?.roomSetup ?? null,
        roomCapacity: session?.roomCapacity ?? null,
        expectedAttendance,
        layoutExists: Boolean(roomSetupItemIdForRail),
        hasStarted: hasRoomSetStarted,
      },
      seating: {
        seatingRequired: expectedAttendance !== null ? true : undefined,
        expectedAttendance,
        hasStarted: false,
      },
      conflicts: {
        conflicts: visibleConflicts,
      },
      notesActivity: {
        notes,
      },
    }, {
      includeRoomSetAndSeating: roomSetAndSeatingAvailable,
    });
  }, [
    visibleConflicts,
    expectedAttendance,
    fnbAssignments,
    fnbCoverageCount,
    fnbSafetyAlert,
    hasRoomSetStarted,
    notes,
    roomId,
    roomSetupItemIdForRail,
    roomSetAndSeatingAvailable,
    selectedAvRequirementItems,
    selectedFnbRequirementItems,
    selectedSpeakers,
    selectedStaffingRequirementCount,
    selectedSignageRequirementItems,
    optionalModulesEnabled,
    operationSummaries,
    sessionType,
    startTime,
    endTime,
    title,
    session?.avRequirementsStructured,
    session?.foodService,
    session?.roomCapacity,
    session?.roomName,
    session?.roomSetup,
    session?.staffAssignments,
  ]);
  const moduleReadiness = readinessResult.modules;
  const focusItems = useMemo<SessionRailFocusItem[]>(() => {
    const supplyStatus: SessionReadinessStatus | null = supplySummary ? (supplySummary.readiness === "needs_work" ? "not_started" : supplySummary.readiness) : null;
    const statusItems = Object.values(moduleReadiness).map((item) => item.moduleId === "supplies" && supplyStatus ? { ...item, status: supplyStatus } : item);
    const overviewStatus = statusItems
      .filter((item) => item.status !== "not_needed")
      .sort((left, right) => SESSION_READINESS_METADATA[right.status].priority - SESSION_READINESS_METADATA[left.status].priority)[0]?.status ?? "not_needed";
    return WORKSPACE_FOCUS_ITEMS.filter((sourceItem) => (
      sourceItem.id !== "accessibility" || optionalModulesEnabled.has("ACCESSIBILITY")
    ) && (
      sourceItem.id !== "vendor-production" || optionalModulesEnabled.has("VENDOR_AND_PRODUCTION")
    ) && (
      sourceItem.id !== "safety-escalation" || optionalModulesEnabled.has("SAFETY_AND_ESCALATION")
    )).map((sourceItem) => {
      const item = sourceItem.id === "show-flow"
        ? { ...sourceItem, label: terminology.showFlow, description: `Minute-by-minute cues and public ${terminology.agenda.toLowerCase()}` }
        : sourceItem;
      if (item.id === "overview") {
        return {
          ...item,
          badge: SESSION_READINESS_METADATA[overviewStatus].label,
          status: overviewStatus,
        };
      }
      if (item.id === "show-flow") {
        const status: SessionReadinessStatus = showFlowSummary.blocking > 0
          ? "blocked"
          : showFlowSummary.unpublished
            ? "needs_info"
            : showFlowSummary.loaded && showFlowSummary.count > 0
              ? "ready"
              : "not_started";
        return {
          ...item,
          badge: showFlowSummary.unpublished ? "Unpublished" : SESSION_READINESS_METADATA[status].label,
          status,
        };
      }
      if (item.id === "supplies" && supplyStatus) {
        return { ...item, badge: SESSION_READINESS_METADATA[supplyStatus].label, status: supplyStatus };
      }
      const readiness = moduleReadiness[item.id];
      return {
        ...item,
        badge: SESSION_READINESS_METADATA[readiness.status].label,
        status: readiness.status,
      };
    });
  }, [moduleReadiness, optionalModulesEnabled, showFlowSummary, supplySummary, terminology.agenda, terminology.showFlow]);
  const linkItems = useMemo<SessionRailLinkItem[]>(() => {
    if (!roomSetAndSeatingAvailable) {
      return [
        {
          id: "room-set-seating",
          label: ROOM_SET_SEATING_COMBINED_LABEL,
          description: ROOM_SET_SEATING_UNAVAILABLE_COPY,
          badge: ROOM_SET_SEATING_COMING_SOON_BADGE,
          status: "not_needed",
          icon: Armchair,
          disabled: true,
          countInReadiness: false,
        },
      ];
    }

    const combinedRoomSetStatus = [moduleReadiness["room-set"].status, moduleReadiness.seating.status]
      .sort((left, right) => SESSION_READINESS_METADATA[right].priority - SESSION_READINESS_METADATA[left].priority)[0];
    return [
      {
        id: "room-set",
        label: ROOM_SET_SEATING_COMBINED_LABEL,
        description: hasCapacityBlocker
          ? `Capacity ${session?.roomCapacity ?? "n/a"}`
          : hasRoomSetStarted
            ? "Layout and seating workspace"
            : "Link out",
        badge: SESSION_READINESS_METADATA[combinedRoomSetStatus].label,
        status: combinedRoomSetStatus,
        icon: Armchair,
        href: roomSetLink,
      },
    ];
  }, [expectedAttendance, hasCapacityBlocker, hasRoomSetStarted, moduleReadiness, roomSetAndSeatingAvailable, roomSetLink, seatingLink, session?.roomCapacity]);
  const overviewModuleCards = useMemo<OverviewModuleCard[]>(() => {
    const avFacts = [
      ...selectedAvRequirementItems.map((item) => item.label ?? "AV requirement"),
      ...(session?.avRequirementsStructured ?? []).map((requirement) => requirement.avType),
    ].filter((value, index, values) => value && values.indexOf(value) === index);
    const fnbHeadcount = session?.foodService?.headcount ?? expectedAttendance;
    const fnbServiceLabel = session?.foodService?.serviceType || selectedFnbRequirementItems[0]?.label || "Menu coverage";
    const assignedCrewFacts = (session?.staffAssignments ?? []).map((assignment) =>
      [assignment.assignmentRole ?? assignment.role, assignment.name].filter(Boolean).join(" - "),
    );
    const staffingNeedFacts = selectedStaffingRequirementItems.map(formatStaffingNeedLabel);
    const combinedRoomSetStatus = !roomSetAndSeatingAvailable
      ? "not_needed"
      : [moduleReadiness["room-set"].status, moduleReadiness.seating.status]
          .sort((left, right) => SESSION_READINESS_METADATA[right].priority - SESSION_READINESS_METADATA[left].priority)[0];
    const combinedRoomSetWarning = moduleReadiness["room-set"].status !== "ready" && moduleReadiness["room-set"].status !== "not_needed"
      ? moduleReadiness["room-set"].reasons[0]
      : moduleReadiness.seating.status !== "ready" && moduleReadiness.seating.status !== "not_needed"
        ? moduleReadiness.seating.reasons[0]
        : undefined;

    return [
      {
        id: "show-flow",
        label: terminology.showFlow,
        description: showFlowSummary.count > 0
          ? `${showFlowSummary.count} cue${showFlowSummary.count === 1 ? "" : "s"}`
          : "No cues built",
        status: showFlowSummary.blocking > 0
          ? "blocked"
          : showFlowSummary.unpublished
            ? "needs_info"
            : showFlowSummary.loaded && showFlowSummary.count > 0
              ? "ready"
              : "not_started",
        icon: ListOrdered,
        facts: [
          showFlowSummary.blocking > 0 ? `${showFlowSummary.blocking} blocking conflict${showFlowSummary.blocking === 1 ? "" : "s"}` : "No blocking cue conflicts",
          showFlowSummary.warnings > 0 ? `${showFlowSummary.warnings} timing warning${showFlowSummary.warnings === 1 ? "" : "s"}` : "Timing sequence clear",
          showFlowSummary.unpublished ? "Unpublished attendee changes" : "Publication is current",
        ],
        warning: showFlowSummary.blocking > 0
          ? "Resolve cue timing and resource conflicts"
          : showFlowSummary.unpublished
            ? "Preview and publish attendee changes"
            : undefined,
        actionLabel: showFlowSummary.count > 0 ? "Open show flow" : "Build show flow",
        target: "show-flow",
      },
      {
        id: "speakers",
        label: "Speakers",
        description: selectedSpeakers.length > 0
          ? `${selectedSpeakers.length} assigned`
          : "No speakers assigned",
        status: moduleReadiness.speakers.status,
        icon: Mic,
        facts: selectedSpeakers.length > 0
          ? selectedSpeakers.slice(0, 3).map((speaker) => `${speaker.name} - ${statusLabel(speaker.status)}`)
          : ["Assign speakers or moderators"],
        warning: moduleReadiness.speakers.status !== "ready" ? moduleReadiness.speakers.reasons[0] : undefined,
        actionLabel: moduleReadiness.speakers.status === "ready" ? "Review speakers" : "Assign & confirm",
        target: "speakers",
      },
      {
        id: "av",
        label: "AV",
        description: avFacts.length > 0
          ? `${avFacts.length} requirement${avFacts.length === 1 ? "" : "s"} selected`
          : "No AV requirements selected",
        status: moduleReadiness.av.status,
        icon: Monitor,
        facts: avFacts.length > 0 ? avFacts.slice(0, 3) : ["Add microphones, projection, or tech support"],
        warning: moduleReadiness.av.status !== "ready" ? moduleReadiness.av.reasons[0] : undefined,
        actionLabel: moduleReadiness.av.status === "ready" ? "Review AV" : "Confirm AV",
        target: "av",
      },
      {
        id: "fnb",
        label: "F&B",
        description: fnbHeadcount !== null
          ? `${fnbHeadcount} headcount`
          : "Headcount not set",
        status: moduleReadiness.fnb.status,
        icon: Utensils,
        facts: [
          fnbServiceLabel,
          fnbAssignments.length > 0
            ? `${fnbAssignments.length} catalog item${fnbAssignments.length === 1 ? "" : "s"} assigned`
            : "No catalog items assigned",
          fnbAssignmentEstimate.totalEstimatedCents > 0
            ? `${formatMoneyFromCents(fnbAssignmentEstimate.totalEstimatedCents)} forecast`
            : "No F&B forecast yet",
        ],
        warning: moduleReadiness.fnb.status !== "ready" ? moduleReadiness.fnb.reasons[0] : undefined,
        actionLabel: moduleReadiness.fnb.status === "ready" ? "Open F&B planner" : "Build menu",
        target: "fnb",
      },
      {
        id: "staffing",
        label: "Staffing",
        description: assignedCrewFacts.length > 0
          ? `${assignedCrewFacts.length} crew assignment${assignedCrewFacts.length === 1 ? "" : "s"}`
          : staffingNeedFacts.length > 0
            ? "Staffing needs selected"
            : "No crew assigned",
        status: moduleReadiness.staffing.status,
        icon: Users,
        facts: assignedCrewFacts.length > 0
          ? assignedCrewFacts.slice(0, 3)
          : staffingNeedFacts.length > 0
            ? staffingNeedFacts.slice(0, 3)
            : ["Select staffing needs or review assigned crew"],
        warning: moduleReadiness.staffing.status !== "ready" ? moduleReadiness.staffing.reasons[0] : undefined,
        actionLabel: "Review crew",
        target: "staffing",
      },
      {
        id: "supplies",
        label: "Supplies",
        description: supplySummary
          ? supplySummary.readiness === "not_needed" ? "Explicitly not needed" : `${supplySummary.allocations.length} active item${supplySummary.allocations.length === 1 ? "" : "s"}`
          : "Checking supplies…",
        status: supplySummary ? (supplySummary.readiness === "needs_work" ? "not_started" : supplySummary.readiness) : moduleReadiness.supplies.status,
        icon: Package,
        facts: supplySummary?.allocations.length
          ? supplySummary.allocations.slice(0, 3).map((item) => `${item.supplyItem?.name ?? item.oneOffName ?? "Supply"}${item.quantity == null ? "" : ` × ${item.quantity}`}`)
          : ["Add materials, stationery, or workshop kits"],
        warning: supplySummary && supplySummary.readiness !== "ready" && supplySummary.readiness !== "not_needed" ? `Supplies ${supplySummary.readiness.replace("_", " ")}` : moduleReadiness.supplies.status !== "ready" && moduleReadiness.supplies.status !== "not_needed" ? moduleReadiness.supplies.reasons[0] : undefined,
        actionLabel: "Review supplies",
        target: "supplies",
      },
      {
        id: "signage",
        label: "Signage",
        description: selectedSignageRequirementItems.length > 0
          ? `${selectedSignageRequirementItems.length} item${selectedSignageRequirementItems.length === 1 ? "" : "s"} selected`
          : "No signage selected",
        status: moduleReadiness.signage.status,
        icon: Signpost,
        facts: selectedSignageRequirementItems.length > 0
          ? selectedSignageRequirementItems.slice(0, 3).map((item) => item.quantity ? `${item.label} × ${item.quantity}` : item.label ?? "Signage")
          : ["Add room identification or wayfinding signs"],
        warning: moduleReadiness.signage.status !== "ready" && moduleReadiness.signage.status !== "not_needed"
          ? moduleReadiness.signage.reasons[0]
          : undefined,
        actionLabel: "Review signage",
        target: "signage",
      },
      {
        id: "conflicts",
        label: "Conflicts",
        description: visibleConflicts.length > 0
          ? `${visibleConflicts.length} open conflict${visibleConflicts.length === 1 ? "" : "s"}`
          : "No open conflicts",
        status: moduleReadiness.conflicts.status,
        icon: AlertTriangle,
        facts: visibleConflicts.length > 0
          ? visibleConflicts.slice(0, 2).map((conflict) => conflict.type === "ROOM_CAPACITY_EXCEEDED" ? "Room capacity" : "Speaker double-booked")
          : ["Schedule and capacity look clear"],
        warning: moduleReadiness.conflicts.status !== "ready" ? moduleReadiness.conflicts.reasons[0] : undefined,
        actionLabel: "Review conflicts",
        target: "conflicts",
      },
      {
        id: roomSetAndSeatingAvailable ? "room-set" : "room-set-seating",
        label: ROOM_SET_SEATING_COMBINED_LABEL,
        description: roomSetAndSeatingAvailable
          ? session?.roomName || "Room unassigned"
          : ROOM_SET_SEATING_UNAVAILABLE_COPY,
        status: combinedRoomSetStatus,
        icon: Armchair,
        facts: roomSetAndSeatingAvailable
          ? [
              session?.roomSetup?.trim() || "Setup not selected",
              typeof session?.roomCapacity === "number" ? `Capacity ${session.roomCapacity}` : "Capacity not set",
              expectedAttendance !== null ? `${expectedAttendance} expected` : "Attendance not set",
            ]
          : [ROOM_SET_SEATING_UNAVAILABLE_COPY],
        warning: roomSetAndSeatingAvailable ? combinedRoomSetWarning : undefined,
        actionLabel: roomSetAndSeatingAvailable ? "Open Room Set editor" : ROOM_SET_SEATING_COMING_SOON_BADGE,
        target: "room-set" as SessionRailLinkId,
        href: roomSetAndSeatingAvailable ? roomSetLink : undefined,
        disabled: !roomSetAndSeatingAvailable,
      },
    ].concat(
      optionalModulesEnabled.has("ACCESSIBILITY") ? [{ id: "accessibility" as const, label: "Accessibility", description: "Session accommodations", status: moduleReadiness.accessibility.status, icon: Users, facts: ["Add operational accommodations and confirmations"], warning: moduleReadiness.accessibility.status === "not_started" ? moduleReadiness.accessibility.reasons[0] : undefined, actionLabel: "Open accessibility", target: "accessibility" as const }] : [],
      optionalModulesEnabled.has("VENDOR_AND_PRODUCTION") ? [{ id: "vendor-production" as const, label: "Vendor & Production", description: "Session service partners", status: moduleReadiness["vendor-production"].status, icon: Package, facts: ["Add non-AV partners and onsite details"], warning: moduleReadiness["vendor-production"].status === "not_started" ? moduleReadiness["vendor-production"].reasons[0] : undefined, actionLabel: "Open vendors", target: "vendor-production" as const }] : [],
      optionalModulesEnabled.has("SAFETY_AND_ESCALATION") ? [{ id: "safety-escalation" as const, label: "Safety & Escalation", description: "Event-plan-linked operations", status: moduleReadiness["safety-escalation"].status, icon: AlertTriangle, facts: ["Reference the event Security & Compliance plan"], warning: moduleReadiness["safety-escalation"].status === "not_started" ? moduleReadiness["safety-escalation"].reasons[0] : undefined, actionLabel: "Open safety", target: "safety-escalation" as const }] : [],
    ) as OverviewModuleCard[];
  }, [
    visibleConflicts,
    expectedAttendance,
    fnbAssignmentEstimate.totalEstimatedCents,
    fnbAssignments.length,
    moduleReadiness,
    roomSetAndSeatingAvailable,
    roomSetLink,
    selectedAvRequirementItems,
    selectedFnbRequirementItems,
    selectedStaffingRequirementItems,
    supplySummary,
    selectedSignageRequirementItems,
    selectedSpeakers,
    showFlowSummary,
    terminology.showFlow,
    session?.avRequirementsStructured,
    session?.foodService?.headcount,
    session?.foodService?.serviceType,
    session?.roomCapacity,
    session?.roomName,
    session?.roomSetup,
    session?.staffAssignments,
    optionalModulesEnabled,
  ]);
  /**
   * The exact canonical items behind each readiness count, so every number in the status bar
   * can be enumerated rather than asserted. This reads the same module readiness records the
   * counts are derived from, so a count and its list can never disagree.
   */
  const readinessDetailItems = useMemo<ReadinessDetailItem[]>(() => {
    const statusItems = [moduleReadiness.details, ...focusItems.filter((item) => item.id !== "overview"), ...linkItems];
    const subject = title.trim() || session?.title || "This session";

    return statusItems.flatMap((entry) => {
      if (entry.status === "not_needed") return [];
      if ("countInReadiness" in entry && entry.countInReadiness === false) return [];

      // Enumerate the statuses explicitly rather than treating "anything else" as needs work,
      // so a status added later cannot be silently absorbed into a bucket.
      const bucket: ReadinessBucket | null = entry.status === "ready"
        ? "ready"
        : entry.status === "blocked"
          ? "blocked"
          : entry.status === "needs_info" || entry.status === "not_started"
            ? "needsWork"
            : null;
      if (!bucket) return [];

      const moduleId = "moduleId" in entry ? entry.moduleId : entry.id;
      const detail = moduleReadiness[moduleId as keyof typeof moduleReadiness];
      const reasons = detail?.reasons ?? [];
      // `details` is the schedule/room module; it has no focus-item entry because Overview is
      // the tab that owns it. Never fall through to a raw module id in the panel.
      const area = "label" in entry && typeof entry.label === "string"
        ? entry.label
        : moduleId === "details"
          ? "Session details"
          : WORKSPACE_FOCUS_ITEMS.find((focus) => focus.id === moduleId)?.label ?? String(moduleId);

      return [{
        id: `readiness-${String(moduleId)}`,
        area,
        subject,
        bucket,
        statusLabel: SESSION_READINESS_METADATA[entry.status].label,
        reason: reasons[0] ?? SESSION_READINESS_METADATA[entry.status].description,
        // Any further reasons are the concrete missing fields or failed checks.
        blocker: reasons.length > 1 ? reasons.slice(1).join("; ") : null,
        owner: null,
        actionLabel: bucket === "ready" ? `Review ${area}` : `Open ${area}`,
        onAction: () => {
          const target = String(moduleId);
          if (target === "details") return focusWorkspaceTab("overview");
          if (target === "room-set" || target === "seating") return followAttentionTarget("room-set");
          focusWorkspaceTab(target as WorkspaceTabId);
        },
      } satisfies ReadinessDetailItem];
    });
  // focusWorkspaceTab and followAttentionTarget are stable component-scope functions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItems, linkItems, moduleReadiness, session?.title, title]);

  const attentionItems = useMemo<AttentionItem[]>(() => {
    return readinessResult.attentionItems.map((item) => {
      const target: AttentionItem["target"] = item.targetModuleId === "details"
        ? "overview"
        : item.targetModuleId === "room-set" || item.targetModuleId === "seating"
          ? "room-set"
          : item.targetModuleId;
      return {
        ...item,
        tone: item.priority === "blocked" ? "blocked" : item.priority === "conflict" ? "attention" : "missing",
        target,
      };
    });
  }, [readinessResult.attentionItems]);

  function focusWorkspaceTab(tab: WorkspaceTabId) {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${tab}`);
    }
  }

  async function setOptionalModuleEnabled(module: "ACCESSIBILITY" | "VENDOR_AND_PRODUCTION" | "SAFETY_AND_ESCALATION", enabled: boolean) {
    setModuleSettingsSaving(module);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${sessionId}/modules`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ module, enabled }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to update module settings");
      setOptionalModuleSettings(payload.modules);
      setNotice(`${module.replaceAll("_", " ")} ${enabled ? "enabled" : "disabled"}. Existing records are retained.`);
      if (!enabled) setActiveTab("overview");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update module settings");
    } finally {
      setModuleSettingsSaving(null);
    }
  }

  function followAttentionTarget(target: AttentionItem["target"]) {
    if (target === "room-set") {
      if (!roomSetAndSeatingAvailable) return;
      router.push(roomSetLink);
      return;
    }
    if (target === "seating") {
      if (!roomSetAndSeatingAvailable) return;
      router.push(seatingLink);
      return;
    }
    focusWorkspaceTab(target);
  }

  function handleRequirementBudgetLinkChange(itemId: string, linkedBudgetLineItem: LinkedBudgetLineItem | null) {
    setLinkedBudgetLineItemsByItemId((current) => {
      const next = new Map(current);
      if (linkedBudgetLineItem) {
        next.set(itemId, linkedBudgetLineItem);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  }

  function handleCustomItemDraftChange(sectionId: string, value: string) {
    setCustomItemDrafts((current) => ({ ...current, [sectionId]: value }));
    setCustomItemErrors((current) => {
      if (!current[sectionId]) return current;
      const next = { ...current };
      delete next[sectionId];
      return next;
    });
  }

  async function createCustomRequirementItem(sectionId: string) {
    const label = customItemDrafts[sectionId]?.trim() ?? "";
    if (!label) {
      setCustomItemErrors((current) => ({ ...current, [sectionId]: "Enter an item name." }));
      return;
    }

    setSavingCustomItemSectionId(sectionId);
    setCustomItemErrors((current) => {
      const next = { ...current };
      delete next[sectionId];
      return next;
    });

    try {
      const response = await fetch(`/api/events/${eventId}/session-requirements/template/sections/${sectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to create custom item"));
      }

      const createdItem = payload as Matrix2RequirementItem;
      setSnapshot((current) => {
        if (!current) return current;
        return {
          ...current,
          requirementTemplate: {
            ...current.requirementTemplate,
            sections: current.requirementTemplate.sections.map((section) => section.id === sectionId
              ? {
                  ...section,
                  items: [...section.items, createdItem].sort((left, right) => left.sortOrder - right.sortOrder),
                }
              : section),
          },
        };
      });
      setSelectedRequirementValues((current) => ({
        ...current,
        [createdItem.id]: "",
      }));
      setCustomItemDrafts((current) => ({ ...current, [sectionId]: "" }));
    } catch (error) {
      setCustomItemErrors((current) => ({
        ...current,
        [sectionId]: error instanceof Error ? error.message : "Failed to create custom item",
      }));
    } finally {
      setSavingCustomItemSectionId(null);
    }
  }

  async function assignSpeaker(speaker: EventSpeakerRecord) {
    if (!session) return;
    const previous = selectedSpeakers;
    const next = previous.some((entry) => entry.speakerId === speaker.id)
      ? previous
      : [...previous, {
          speakerId: speaker.id,
          name: speaker.name,
          title: speaker.title,
          company: speaker.company,
          email: speaker.email,
          status: speaker.status,
        }];

    setSelectedSpeakers(next);

    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${session.id}/speakers/${speaker.id}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to assign speaker"));
      }
    } catch (error) {
      setSelectedSpeakers(previous);
      throw error;
    }
  }

  async function removeSpeaker(speakerId: string) {
    if (!session) return;
    const previous = selectedSpeakers;
    setSelectedSpeakers((current) => current.filter((speaker) => speaker.speakerId !== speakerId));

    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${session.id}/speakers/${speakerId}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to remove speaker"));
      }
    } catch (error) {
      setSelectedSpeakers(previous);
      throw error;
    }
  }

  async function addFnbCatalogItemToSession(item: FnbLibraryItem) {
    setAddingFnbCatalogItemId(item.id);
    setFnbAssignmentError(null);
    setFnbAssignmentNotice(null);
    const defaultQuantity = selectedFnbSessionDefaultQuantity;
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${selectedFnbSessionId}/fnb-catalog-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventFnbCatalogItemId: item.id,
          quantity: defaultQuantity,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to assign F&B item"));
      }
      const assignment = payload as SessionFnbCatalogAssignment;
      const next = [...fnbAssignmentsRef.current.filter((entry) => entry.id !== assignment.id), assignment];
      fnbAssignmentsRef.current = next;
      setFnbAssignments(next);
      setFnbAssignmentNotice(`${item.itemName} assigned to ${selectedFnbSession?.title ?? "the selected session"}.`);
      markFnbAutosaveSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to assign F&B item";
      setFnbAssignmentError(message);
      reportFnbAutosaveError(message);
    } finally {
      setAddingFnbCatalogItemId(null);
    }
  }

  async function createCustomFnbAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const verificationStatus = String(data.get("verificationStatus") || "NEEDS_REVIEW");
    const claims = [
      ...data.getAll("dietaryClaim").map((code) => ({ kind: "SUITABILITY", code: String(code), verificationStatus })),
      ...data.getAll("containsClaim").map((code) => ({ kind: "CONTAINS", code: String(code), verificationStatus })),
      ...data.getAll("freeOfClaim").map((code) => ({ kind: "FREE_OF", code: String(code), verificationStatus })),
    ];
    const quantity = Number(data.get("quantity"));
    setCustomFnbSaving(true);
    setCustomFnbError(null);
    setFnbAssignmentError(null);
    setFnbAssignmentNotice(null);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${selectedFnbSessionId}/fnb-catalog-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customItem: {
            itemName: data.get("itemName"),
            description: data.get("description"),
            category: data.get("category"),
            publishedPriceCents: dollarsToCents(String(data.get("publishedPrice") || "")),
            negotiatedPriceCents: dollarsToCents(String(data.get("negotiatedPrice") || "")),
            discountCents: dollarsToCents(String(data.get("discount") || "")),
            currency: data.get("currency"),
            pricingUnit: data.get("pricingUnit"),
            minimumQuantity: data.get("minimumQuantity"),
            taxable: data.get("taxable") === "on",
            preparationNotes: data.get("preparationNotes"),
            serviceNotes: data.get("serviceNotes"),
            vendorNotes: data.get("vendorNotes"),
            verificationStatus,
            verificationSource: data.get("verificationSource"),
            claims,
          },
          quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : selectedFnbSessionDefaultQuantity,
          serviceTiming: data.get("serviceTiming"),
          notes: data.get("assignmentNotes"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(toErrorMessage(payload, "Failed to create custom/off-menu item"));
      const assignment = formatFnbAssignmentTaxesForInput(payload as SessionFnbCatalogAssignment);
      const next = [...fnbAssignmentsRef.current.filter((entry) => entry.id !== assignment.id), assignment];
      fnbAssignmentsRef.current = next;
      setFnbAssignments(next);
      setFnbLibraryItems((current) => current.some((item) => item.id === assignment.catalogItem.id)
        ? current
        : [...current, assignment.catalogItem]);
      setFnbAssignmentNotice(`${assignment.catalogItem.itemName} saved as a custom/off-menu item with pending Budget approval.`);
      setIsCustomFnbOpen(false);
      form.reset();
      markFnbAutosaveSaved();
    } catch (error) {
      setCustomFnbError(error instanceof Error ? error.message : "Failed to create custom/off-menu item");
    } finally {
      setCustomFnbSaving(false);
    }
  }

  function fnbAssignmentAutosavePayload(assignment: SessionFnbCatalogAssignment): FnbAssignmentAutosavePayload {
    return {
      sessionId: assignment.sessionId,
      assignmentId: assignment.id,
      quantity: assignment.quantity,
      manualPriceCents: assignment.manualPriceCents,
      serviceTiming: assignment.serviceTiming,
      notes: assignment.notes,
      taxes: assignment.taxes.map((tax) => ({
        label: tax.label,
        percentage: formatOptionalFnbPercentageForInput(tax.percentage),
      })),
      expectedUpdatedAt: assignment.updatedAt,
    };
  }

  function queueFnbAssignmentAutosave(assignment: SessionFnbCatalogAssignment, immediate = false) {
    const validationError = fnbAssignmentTaxValidationError(assignment.taxes);
    if (validationError) {
      reportFnbAutosaveError(validationError);
      return;
    }
    scheduleFnbAssignmentAutosave(assignment.id, fnbAssignmentAutosavePayload(assignment), immediate);
  }

  function flushFnbAssignmentAutosave(assignmentId: string) {
    const assignment = fnbAssignmentsRef.current.find((entry) => entry.id === assignmentId);
    if (assignment) queueFnbAssignmentAutosave(assignment, true);
  }

  function patchFnbAssignment(
    assignmentId: string,
    patch: Partial<Pick<SessionFnbCatalogAssignment, "quantity" | "manualPriceCents" | "serviceTiming" | "notes" | "taxes">>,
    immediate = false,
  ) {
    setFnbAssignmentNotice(null);
    const next = fnbAssignmentsRef.current.map((assignment) => (assignment.id === assignmentId ? { ...assignment, ...patch } : assignment));
    const updated = next.find((assignment) => assignment.id === assignmentId);
    if (!updated) return;
    fnbAssignmentsRef.current = next;
    setFnbAssignments(next);
    setFnbAssignmentError(null);
    queueFnbAssignmentAutosave(updated, immediate);
  }

  function addFnbAssignmentTax(assignmentId: string) {
    const assignment = fnbAssignments.find((entry) => entry.id === assignmentId);
    if (!assignment) return;
    patchFnbAssignment(assignmentId, {
      taxes: [
        ...assignment.taxes,
        {
          id: `draft-${assignmentId}-${Date.now()}`,
          assignmentId,
          label: null,
          percentage: "",
          sortOrder: assignment.taxes.length,
        },
      ],
    });
  }

  function updateFnbAssignmentTax(
    assignmentId: string,
    taxId: string,
    patch: Partial<Pick<SessionFnbCatalogAssignmentTax, "label" | "percentage">>,
    immediate = false,
  ) {
    const assignment = fnbAssignments.find((entry) => entry.id === assignmentId);
    if (!assignment) return;
    patchFnbAssignment(assignmentId, {
      taxes: assignment.taxes.map((tax) => tax.id === taxId ? { ...tax, ...patch } : tax),
    }, immediate);
  }

  function blurFnbAssignmentTaxPercentage(assignmentId: string, taxId: string) {
    const assignment = fnbAssignments.find((entry) => entry.id === assignmentId);
    if (!assignment) return;
    updateFnbAssignmentTax(assignmentId, taxId, {
      percentage: formatOptionalFnbPercentageForInput(assignment.taxes.find((tax) => tax.id === taxId)?.percentage),
    }, true);
  }

  function removeFnbAssignmentTax(assignmentId: string, taxId: string) {
    const assignment = fnbAssignments.find((entry) => entry.id === assignmentId);
    if (!assignment) return;
    patchFnbAssignment(assignmentId, {
      taxes: assignment.taxes
        .filter((tax) => tax.id !== taxId)
        .map((tax, sortOrder) => ({ ...tax, sortOrder })),
    });
  }

  function updateFnbAssignmentDraft(
    assignmentId: string,
    field: keyof Pick<SessionFnbCatalogAssignment, "quantity" | "manualPriceCents" | "serviceTiming" | "notes">,
    value: number | string | null,
  ) {
    patchFnbAssignment(assignmentId, { [field]: value });
  }

  async function removeFnbAssignment(assignmentId: string) {
    const previous = fnbAssignmentsRef.current;
    const removed = previous.find((assignment) => assignment.id === assignmentId);
    setWorkingFnbAssignmentId(assignmentId);
    setFnbAssignmentError(null);
    setFnbAssignmentNotice(null);
    const next = previous.filter((assignment) => assignment.id !== assignmentId);
    fnbAssignmentsRef.current = next;
    setFnbAssignments(next);
    try {
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${selectedFnbSessionId}/fnb-catalog-assignments/${assignmentId}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to remove F&B assignment"));
      }
      setFnbAssignmentNotice(`${removed?.catalogItem.itemName ?? "F&B item"} removed from ${selectedFnbSession?.title ?? "the selected session"}.`);
    } catch (error) {
      fnbAssignmentsRef.current = previous;
      setFnbAssignments(previous);
      setFnbAssignmentError(error instanceof Error ? error.message : "Failed to remove F&B assignment");
    } finally {
      setWorkingFnbAssignmentId(null);
    }
  }

  function handleFnbLibraryDragStart(item: FnbLibraryItem, event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-fnb-catalog-item-id", item.id);
    event.dataTransfer.setData("text/plain", item.id);
  }

  function handleFnbPlanDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setFnbDropActive(false);
    const itemId = event.dataTransfer.getData("application/x-fnb-catalog-item-id") || event.dataTransfer.getData("text/plain");
    const item = fnbLibraryItems.find((candidate) => candidate.id === itemId);
    if (!item || assignedFnbCatalogItemIds.has(item.id)) return;
    void addFnbCatalogItemToSession(item);
  }

  async function parsePersistedFnbSourceMenu(menu: FnbSourceMenu) {
    const response = await fetch(`/api/events/${eventId}/fnb-catalog/parse-menu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceMenuId: menu.id,
        fileName: menu.fileName,
        objectKey: menu.objectKey,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(toErrorMessage(payload, "Failed to parse menu"));
    }
    return payload;
  }

  async function uploadAndParseFnbMenu(file: File, baseSourceMenuId: string | null) {
    console.info("[fnb-source-menu] upload start", {
      eventId,
      fileName: file.name,
      baseSourceMenuId,
    });
    const presignResponse = await fetch(`/api/events/${eventId}/fnb-catalog/parse-menu/presign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/pdf",
        fileSizeBytes: file.size,
        sourceType: baseSourceMenuId ? "AMENDMENT" : "ORIGINAL",
        baseSourceMenuId,
      }),
    });
    const presignPayload = await presignResponse.json();
    if (!presignResponse.ok) {
      throw new Error(toErrorMessage(presignPayload, "Failed to persist source menu upload"));
    }

    const sourceMenu = normalizeFnbSourceMenuRecord(presignPayload.sourceMenu as FnbSourceMenu);
    setIsFnbSourceMenusExpanded(true);
    console.info("[fnb-source-menu] source menu persisted", {
      eventId,
      sourceMenuId: sourceMenu.id,
      fileName: sourceMenu.fileName,
    });
    console.info("[fnb-source-menu] refetch after presign", {
      eventId,
      sourceMenuId: sourceMenu.id,
    });
    await loadFnbCatalogItems("after-presign");

    const uploadResponse = await fetch(String(presignPayload.uploadUrl), {
      method: String(presignPayload.method || "PUT"),
      headers: {
        ...(typeof presignPayload.headers === "object" && presignPayload.headers !== null
          ? presignPayload.headers as Record<string, string>
          : {}),
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      try {
        await parsePersistedFnbSourceMenu(sourceMenu);
      } catch {
        // The parse endpoint marks the persisted source menu failed when the object is not readable.
      }
      throw new Error("Menu file upload failed");
    }

    console.info("[fnb-source-menu] parse start", {
      eventId,
      sourceMenuId: sourceMenu.id,
      fileName: sourceMenu.fileName,
    });
    await parsePersistedFnbSourceMenu(sourceMenu);
  }

  function handleFnbMenuUpload(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    const baseSourceMenuId = fnbAmendmentBaseSourceMenuId;
    setFnbAmendmentBaseSourceMenuId(null);
    if (selectedFiles.length === 0) return;

    setFnbSourceMenuError(null);
    setFnbSourceMenuNotice(null);
    setWorkingFnbSourceMenuId(baseSourceMenuId ?? "upload");
    void (async () => {
      try {
        for (const file of selectedFiles) {
          await uploadAndParseFnbMenu(file, baseSourceMenuId);
        }
        setFnbSourceMenuNotice(`${selectedFiles.length} menu${selectedFiles.length === 1 ? "" : "s"} uploaded and parsed.`);
      } catch (error) {
        setFnbSourceMenuError(error instanceof Error ? error.message : "Failed to upload menu");
      } finally {
        setWorkingFnbSourceMenuId(null);
        await loadFnbCatalogItems();
      }
    })();
  }

  async function archiveFnbSourceMenu(menu: FnbSourceMenu) {
    setWorkingFnbSourceMenuId(menu.id);
    setFnbSourceMenuError(null);
    setFnbSourceMenuNotice(null);
    try {
      const response = await fetch(`/api/events/${eventId}/fnb-catalog/source-menus/${menu.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to archive source menu"));
      }
      if (!payload || payload.id !== menu.id || payload.status !== "ARCHIVED") {
        throw new Error("Archive response was invalid. Refresh and try again.");
      }
      setFnbSourceMenuNotice(`${menu.menuName} archived.`);
      setPendingFnbSourceMenuCleanup(null);
      await loadFnbCatalogItems();
    } catch (error) {
      setFnbSourceMenuError(error instanceof Error ? error.message : "Failed to archive source menu");
    } finally {
      setWorkingFnbSourceMenuId(null);
    }
  }

  async function deleteFnbSourceMenu(menu: FnbSourceMenu) {
    setWorkingFnbSourceMenuId(menu.id);
    setFnbSourceMenuError(null);
    setFnbSourceMenuNotice(null);
    try {
      const response = await fetch(`/api/events/${eventId}/fnb-catalog/source-menus/${menu.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to delete source menu"));
      }
      if (
        !payload ||
        payload.sourceMenuId !== menu.id ||
        !Number.isInteger(payload.deletedCatalogItemCount) ||
        payload.deletedCatalogItemCount < 0
      ) {
        throw new Error("Delete response was invalid. Refresh and verify the source menu state.");
      }
      const deletedCatalogItemCount = payload.deletedCatalogItemCount;
      setFnbSourceMenuNotice(`${menu.menuName} deleted with ${deletedCatalogItemCount} catalog item${deletedCatalogItemCount === 1 ? "" : "s"}.`);
      setPendingFnbSourceMenuCleanup(null);
      await loadFnbCatalogItems();
    } catch (error) {
      setFnbSourceMenuError(error instanceof Error ? error.message : "Failed to delete source menu");
    } finally {
      setWorkingFnbSourceMenuId(null);
    }
  }

  function amendFnbSourceMenu(menu: FnbSourceMenu) {
    setFnbAmendmentBaseSourceMenuId(menu.id);
    fnbMenuUploadInputRef.current?.click();
  }

  async function rerunFnbSourceMenu(menu: FnbSourceMenu) {
    setWorkingFnbSourceMenuId(menu.id);
    setFnbSourceMenuError(null);
    setFnbSourceMenuNotice(null);
    try {
      await parsePersistedFnbSourceMenu(menu);
      setFnbSourceMenuNotice(`${menu.menuName} parsed again.`);
      await loadFnbCatalogItems();
    } catch (error) {
      setFnbSourceMenuError(error instanceof Error ? error.message : "Failed to re-run parser");
      await loadFnbCatalogItems();
    } finally {
      setWorkingFnbSourceMenuId(null);
    }
  }

  function requirementSelections() {
    return Object.entries(selectedRequirementValues)
      .map(([itemId, quantityText]) => {
        const item = typedSections.flatMap((entry) => entry.section.items).find((entry) => entry.id === itemId);
        return {
          itemId,
          quantity: item?.hasQuantity ? parseSessionRequirementQuantity(quantityText, item.label) : null,
        };
      })
      .filter((entry) => entry.itemId);
  }

  function sectionTypeForItem(itemId: string): SessionRequirementCatalogType | null {
    for (const entry of typedSections) {
      if (entry.section.items.some((item) => item.id === itemId)) return entry.sectionType;
    }
    return null;
  }

  async function handleSave() {
    if (!session || !snapshot) return;

    setErrorMessage(null);
    setNotice(null);

    try {
      const selections = requirementSelections();
      const roomSetupItemId = selectedSingleItemId(roomSetupSection, selectedRequirementValues);
      const roomSetupLabel = roomSetupSection?.items.find((item) => item.id === roomSetupItemId)?.label ?? "";
      const statusItemId = selectedSingleItemId(statusSection, selectedRequirementValues);
      const statusLabelValue = statusSection?.items.find((item) => item.id === statusItemId)?.label ?? session.status ?? "";
      const foodSelection = selections.find((selection) => sectionTypeForItem(selection.itemId) === "FNB");
      const foodItem = foodSelection
        ? fnbSections.flatMap((section) => section.items).find((item) => item.id === foodSelection.itemId)
        : null;

      function displayNameForRequirementItem(itemId: string, templateLabel: string): string {
        return linkedBudgetLineItemsByItemId.get(itemId)?.lineItem ?? templateLabel;
      }

      setIsSaving(true);
      const response = await fetch(`/api/events/${eventId}/matrix-2/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Untitled Session",
          sessionType: sessionType || DEFAULT_SESSION_TYPE,
          includeInOfficialAgenda,
          // Empty legacy status values are not valid configurable status updates.
          // Omitting the field preserves the current value through the API's
          // partial-merge contract while still allowing an explicit selection.
          status: statusLabelValue.trim() || undefined,
          roomId: roomId.trim() || null,
          startTime,
          endTime,
          expectedAttendance: normalizeHeadcount(expectedAttendanceText),
          expectedAttendanceSource,
          roomSetupType: roomSetupLabel,
          speakers: selectedSpeakers.map((speaker) => ({
            speakerId: speaker.speakerId,
            name: speaker.name,
            title: speaker.title,
            company: speaker.company,
            email: speaker.email,
          })),
          requirementSelections: selections,
          avRequirements: selections
            .filter((selection) => sectionTypeForItem(selection.itemId) === "AV")
            .map((selection) => {
              const item = avSections.flatMap((section) => section.items).find((candidate) => candidate.id === selection.itemId);
              return item
                ? {
                    avType: displayNameForRequirementItem(selection.itemId, item.label),
                    quantity: selection.quantity,
                  }
                : null;
            })
            .filter((entry): entry is { avType: string; quantity: number | null } => Boolean(entry)),
          foodService: foodItem && foodSelection
            ? {
                serviceType: displayNameForRequirementItem(foodSelection.itemId, foodItem.label),
                serviceStyle: null,
                headcount: normalizeHeadcount(expectedAttendanceText),
              }
            : null,
          staffAssignments: session.staffAssignments.map((staff) => ({
            personId: staff.personId,
            name: staff.name,
            role: staff.role,
            company: staff.company,
            email: staff.email,
            assignmentRole: staff.assignmentRole,
          })),
          notes: notes.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to save session"));
      }

      setNotice("Session saved.");
      await loadSnapshot();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save session");
    } finally {
      setIsSaving(false);
    }
  }

  function handleWorkspaceSave() {
    if (activeTab === "fnb") return;
    void handleSave();
  }

  function renderOperationalRequirementSections(
    sections: Matrix2RequirementSection[],
    title: string,
    emptyCopy: string,
  ) {
    return (
      <div className="space-y-5">
        {sections.length > 0 ? (
          sections.map((section) => {
            const sectionType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
            return (
              <SectionCard key={`${section.id}-${sessionId}`} title={title}>
                <SessionRequirementSectionBody
                  eventId={eventId}
                  sessionId={sessionId}
                  session={session!}
                  section={section}
                  sectionType={sectionType}
                  budgetLinesReady={budgetLinesReady}
                  budgetLinesLoading={budgetLinesLoading}
                  budgetLinesError={budgetLinesError}
                  onRetryBudgetLines={() => void ensureBudgetLinesLoaded()}
                  eventBudgetLineItems={eventBudgetLineItems}
                  selectedRequirementValues={selectedRequirementValues}
                  onChangeSelectedRequirementValues={setSelectedRequirementValues}
                  linkedBudgetLineItemsByItemId={linkedBudgetLineItemsByItemId}
                  onBudgetLinkChange={handleRequirementBudgetLinkChange}
                  onRefreshBudgetLineItems={refreshBudgetLinesQuietly}
                  customItemDraft={customItemDrafts[section.id] ?? ""}
                  customItemError={customItemErrors[section.id] ?? null}
                  isSavingCustomItem={savingCustomItemSectionId === section.id}
                  onCustomItemDraftChange={handleCustomItemDraftChange}
                  onCreateCustomItem={(targetSectionId) => {
                    void createCustomRequirementItem(targetSectionId);
                  }}
                  disabled={isSaving}
                />
              </SectionCard>
            );
          })
        ) : (
          <SectionCard title={title}>
            <p className="text-[13px] text-slate-500">{emptyCopy}</p>
          </SectionCard>
        )}
      </div>
    );
  }

  const hasCurrentSnapshot = snapshot?.event.id === eventId;
  const hasCurrentSession = session?.id === sessionId;

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-slate-200 bg-white">
        <div className="inline-flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading session...
        </div>
      </div>
    );
  }

  if (snapshotLoadError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-[14px] text-rose-700">
        <p>{snapshotLoadError}</p>
        <button
          type="button"
          onClick={() => void loadSnapshot()}
          disabled={isLoading}
          className="mt-4 inline-flex h-10 items-center rounded-lg border border-rose-200 bg-white px-3 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!session || !snapshot || !hasCurrentSnapshot || !hasCurrentSession) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-[22px] font-semibold text-slate-900">Session not found</h1>
        <p className="mt-2 text-[14px] text-slate-500">This session may have been deleted or moved outside this event.</p>
        <Link href={eventRunOfShowHref(eventId)} className="mt-4 inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
          Back to {terminology.runOfShow}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 text-slate-900">
        <EventModuleSurface
          paddingClassName="px-4 py-3"
          className="rounded-xl"
        >
          <div className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={eventRunOfShowHref(eventId)}
              aria-label={`Back to ${terminology.runOfShow}`}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{terminology.runOfShow}</span>
            </Link>
            <div className="min-w-0 flex-1 sm:min-w-[18rem]">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <SessionHeaderSwitcher
                  currentSessionId={session.id}
                  currentTitle={title || session.title}
                  eventId={eventId}
                  searchParams={searchParams}
                  sessions={sessionSwitcherOptions}
                />
                <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-[#28439A]/20 bg-[#28439A]/8 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#28439A]">
                  {sessionType || "Session"}
                </span>
                <span className="inline-flex min-w-0 items-center gap-1 text-[13px] font-medium text-slate-500">
                  <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                  {formatTimeLabel(startTime)}-{formatTimeLabel(endTime)}
                </span>
                <span className="inline-flex min-w-0 items-center gap-1 text-[13px] font-medium text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                  <span className="truncate">{session.roomName || "Room unassigned"}</span>
                </span>
              </div>
            </div>

            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
              {fnbSafetyAlert && fnbSafetyAlert.severity !== "CLEAR" ? (
                <button
                  type="button"
                  onClick={() => focusWorkspaceTab("fnb")}
                  className={`inline-flex min-h-9 w-full items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-left text-[11px] font-semibold sm:w-auto ${fnbSafetyAlert.severity === "BLOCKING" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
                  aria-label={`${fnbSafetyAlert.title}. Open Food and beverage safety.`}
                >
                  <span>{fnbSafetyAlert.title}</span>
                  <span className="rounded-full bg-white/80 px-1.5 py-0.5">{fnbSafetyAlert.count}</span>
                </button>
              ) : null}
              <SessionReadinessStatusBar
                items={readinessDetailItems}
                isLoading={isLoading}
                error={snapshotLoadError}
                onRetry={() => void loadSnapshot()}
              />
              <AttentionPopoverButton
                items={attentionItems}
                onFollow={(item) => followAttentionTarget(item.target)}
              />
              <ObjectTaskStrip
                eventId={eventId}
                objectType="MATRIX_ROW"
                objectId={session.rowId}
                objectLabel={title || session.title}
              />
            </div>
          </div>
        </EventModuleSurface>

      {notice ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">{notice}</p> : null}
      {errorMessage ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{errorMessage}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Optional session modules">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[13px] font-semibold text-slate-900">Optional session modules</p><p className="text-[12px] text-slate-500">Enable only the operational work this session needs.</p></div>
          <button type="button" onClick={() => setModuleSettingsOpen((open) => !open)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50" aria-expanded={moduleSettingsOpen}>Customize modules</button>
        </div>
        {moduleSettingsOpen ? <div className="mt-3 grid gap-2 sm:grid-cols-3">{[
          ["ACCESSIBILITY", "Accessibility"], ["VENDOR_AND_PRODUCTION", "Vendor & Production"], ["SAFETY_AND_ESCALATION", "Safety & Escalation"],
        ].map(([module, label]) => {
          const setting = optionalModuleSettings.find((entry) => entry.module === module);
          const enabled = setting?.enabled === true;
          return <label key={module} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 text-[12px] font-semibold text-slate-700"><span>{label}<span className="ml-1 text-[10px] font-medium text-slate-400">{setting?.source === "event_default" ? "Event default" : "Session override"}</span></span><input type="checkbox" checked={enabled} disabled={moduleSettingsSaving === module} onChange={(event) => void setOptionalModuleEnabled(module as "ACCESSIBILITY" | "VENDOR_AND_PRODUCTION" | "SAFETY_AND_ESCALATION", event.target.checked)} /></label>;
        })}</div> : null}
      </section>

      {activeTab === "overview" ? (
        <div className="space-y-3">
          <SessionModuleTabs
            activeTab={activeTab}
            focusItems={focusItems}
            linkItems={linkItems}
            onFocus={focusWorkspaceTab}
            onSave={handleWorkspaceSave}
            isSaving={isSaving}
          />

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Session info">
            <h2 className="text-[17px] font-semibold text-slate-950">Session info</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">Edit the core {terminology.runOfShow} record for this session.</p>
            <label className="mt-3 flex max-w-xl items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <input
                type="checkbox"
                checked={includeInOfficialAgenda}
                onChange={(event) => setIncludeInOfficialAgenda(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]"
              />
              <span>
                <span className="block text-[12px] font-semibold text-slate-700">Include in official agenda</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                  {includeInOfficialAgenda
                    ? "Official agenda — eligible for attendee publication."
                    : "Internal/operational only — remains available throughout Run of Show but is excluded from public agenda output."}
                </span>
              </span>
            </label>
            <label className="mt-3 grid max-w-xl gap-1.5">
              <span className="text-[12px] font-semibold text-slate-600">Session Type</span>
              <select
                data-testid="session-details-session-type"
                aria-label="Session type"
                value={sessionType}
                onChange={(event) => setSessionType(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 shadow-sm outline-none transition focus:border-[#28439A]/50 focus:ring-2 focus:ring-[#28439A]/10"
              >
                {sessionTypeOptionsForSavedValue(sessionType).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid max-w-xl gap-1.5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
              <label className="grid gap-1.5">
                <span className="text-[12px] font-semibold text-slate-600">Expected attendance</span>
                <input
                  data-testid="session-details-expected-attendance"
                  aria-label="Expected attendance"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={expectedAttendanceText}
                  onChange={(event) => {
                    setExpectedAttendanceText(event.target.value);
                    if (event.target.value.trim() && !expectedAttendanceSource) {
                      setExpectedAttendanceSource("PLANNER_ESTIMATE");
                    }
                  }}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 shadow-sm outline-none transition focus:border-[#28439A]/50 focus:ring-2 focus:ring-[#28439A]/10"
                />
              </label>
              <div className="grid gap-1.5">
                <span className="text-[12px] font-semibold text-slate-600">Provenance</span>
                <p className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-700" aria-live="polite">
                  {expectedAttendanceSource ? EXPECTED_ATTENDANCE_SOURCE_LABELS[expectedAttendanceSource] : "Not set"}
                </p>
              </div>
              <p className="text-[12px] leading-5 text-slate-500 sm:col-span-2">
                Expected attendance is a planning value. RSVP/actual attendance is only shown when a connected registration source provides it; otherwise it remains unknown.
              </p>
            </div>
          </section>

          <section>
              <div className="flex h-7 flex-wrap items-center gap-2">
                <h2 className="text-[17px] font-semibold text-slate-950">Modules</h2>
                <span className="text-[12px] text-slate-400">readiness · key facts · one action each</span>
              </div>
              <div className="mt-2 grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {overviewModuleCards.map((item) => {
                  const Icon = item.icon;
                  const moduleCardClassName = [
                    "group flex min-h-[150px] flex-col overflow-hidden rounded-xl border border-l-4 bg-white text-left shadow-sm transition sm:min-h-[160px] lg:min-h-[176px] xl:min-h-[188px] 2xl:min-h-[200px]",
                    item.disabled
                      ? "border-slate-200 border-l-slate-300 border-dashed bg-slate-50 text-slate-500"
                      : `${moduleCardClasses(item.status)} ${moduleAccentClasses(item.status)} hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28439A]/25 focus-visible:ring-offset-2`,
                  ].join(" ");
                  const moduleCardContent = (
                    <>
                      <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Icon className={`h-4 w-4 shrink-0 ${item.disabled ? "text-slate-400" : "text-slate-500"}`} />
                            <p className={`truncate text-[14px] font-semibold ${item.disabled ? "text-slate-500" : "text-slate-950"}`}>{item.label}</p>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${item.disabled ? "border-slate-200 bg-slate-50 text-slate-500" : readinessBadgeClasses(item.status)}`}>
                            {item.disabled ? item.actionLabel : (
                              <>
                                <span className={`h-1.5 w-1.5 rounded-full ${readinessDotClasses(item.status)}`} aria-hidden />
                                {SESSION_READINESS_METADATA[item.status].label}
                              </>
                            )}
                          </span>
                        </div>
                        <div className="mt-3 min-h-0 flex-1">
                          <p className={`truncate text-[12px] font-semibold leading-4 ${item.disabled ? "text-slate-500" : "text-slate-900"}`}>{item.description}</p>
                          <p className={`mt-1 line-clamp-2 text-[12px] leading-4 ${item.disabled ? "text-slate-400" : "text-slate-500"}`}>
                            {item.facts.slice(0, 2).join(" · ")}
                          </p>
                          {item.warning ? (
                            <p className={`mt-1 line-clamp-2 text-[12px] leading-4 font-medium ${readinessWarningTextClasses(item.status)}`}>
                              {item.warning}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div
                        className={[
                          "mt-auto flex h-10 items-center justify-between border-t border-slate-200 px-3 text-[11px] font-semibold",
                          item.disabled
                            ? "bg-slate-100 text-slate-500"
                            : "text-[#28439A] transition group-hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <span>{item.actionLabel}</span>
                        {!item.disabled ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
                      </div>
                    </>
                  );

                  if (item.disabled) {
                    return (
                      <article
                        key={item.id}
                        data-session-module-card={item.id}
                        data-session-module-unavailable={item.id}
                        className={moduleCardClassName}
                        aria-disabled="true"
                      >
                        {moduleCardContent}
                      </article>
                    );
                  }

                  if (item.href) {
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        data-session-module-card={item.id}
                        data-session-module-action={item.target}
                        className={moduleCardClassName}
                        onKeyDown={(event) => {
                          if (event.key === " ") {
                            event.preventDefault();
                            event.currentTarget.click();
                          }
                        }}
                      >
                        {moduleCardContent}
                      </Link>
                    );
                  }

                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => focusWorkspaceTab(item.target as WorkspaceTabId)}
                      data-session-module-card={item.id}
                      data-session-module-action={item.target}
                      className={moduleCardClassName}
                    >
                      {moduleCardContent}
                    </button>
                  );
                })}
              </div>
          </section>
          </div>
        ) : null}

      {activeTab !== "overview" ? (
        <SessionModuleTabs
          activeTab={activeTab}
          focusItems={focusItems}
          linkItems={linkItems}
          onFocus={focusWorkspaceTab}
          onSave={handleWorkspaceSave}
            isSaving={isSaving}
            showSave={activeTab !== "fnb" && activeTab !== "show-flow"}
        />
      ) : null}

      {activeTab === "show-flow" ? (
        <SessionShowFlowWorkspace
          eventId={eventId}
          sessionId={sessionId}
          onSummaryChange={setShowFlowSummary}
        />
      ) : null}

      {activeTab === "accessibility" ? <SessionOperationalRecordsWorkspace eventId={eventId} sessionId={sessionId} module="ACCESSIBILITY" /> : null}
      {activeTab === "vendor-production" ? <SessionOperationalRecordsWorkspace eventId={eventId} sessionId={sessionId} module="VENDOR_AND_PRODUCTION" /> : null}
      {activeTab === "safety-escalation" ? <SessionOperationalRecordsWorkspace eventId={eventId} sessionId={sessionId} module="SAFETY_AND_ESCALATION" /> : null}

      {activeTab === "fnb" ? (
        <div className="space-y-5">
          <input
            ref={fnbMenuUploadInputRef}
            type="file"
            accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv"
            multiple
            className="hidden"
            onChange={(event) => {
              handleFnbMenuUpload(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className={`${FNB_WORKSPACE_GRID_CLASS} items-start border-b border-slate-200 px-4 py-2.5 sm:px-5`}>
              <div className="min-w-0 text-left lg:col-span-1 xl:col-span-2">
                <h2 className="text-[19px] font-semibold tracking-tight text-slate-900">F&B Planner</h2>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  Food operations
                </p>
              </div>
              <div className="flex min-w-0 flex-col items-start gap-1 lg:justify-self-end xl:col-start-3">
                <div className="flex flex-wrap items-end gap-2 lg:justify-end">
                  <label className="grid w-[7.75rem] max-w-full gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tax</span>
                    <span className="flex h-8 items-center justify-end rounded-lg border border-slate-200 bg-white px-2 shadow-sm focus-within:border-[#28439A]/40 focus-within:ring-2 focus-within:ring-[#28439A]/10">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        inputMode="decimal"
                        value={fnbTaxPercentText}
                        onChange={(event) => {
                          setFnbTaxPercentText(event.target.value);
                          setFnbPlanError(null);
                        }}
                        onBlur={() => {
                          if (fnbRateDraft.error) return;
                          flushFnbPlanAutosave();
                        }}
                        className="min-w-0 flex-1 bg-transparent text-right text-[12px] tabular-nums outline-none"
                        aria-label="F&B tax percent"
                        aria-invalid={Boolean(fnbRateDraft.error)}
                      />
                      <span className="ml-1 text-[12px] text-slate-400">%</span>
                    </span>
                  </label>
                  <label className="grid w-[8.5rem] max-w-full gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Service charge</span>
                    <span className="flex h-8 items-center justify-end rounded-lg border border-slate-200 bg-white px-2 shadow-sm focus-within:border-[#28439A]/40 focus-within:ring-2 focus-within:ring-[#28439A]/10">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        inputMode="decimal"
                        value={fnbServiceChargePercentText}
                        onChange={(event) => {
                          setFnbServiceChargePercentText(event.target.value);
                          setFnbPlanError(null);
                        }}
                        onBlur={() => {
                          if (fnbRateDraft.error) return;
                          flushFnbPlanAutosave();
                        }}
                        className="min-w-0 flex-1 bg-transparent text-right text-[12px] tabular-nums outline-none"
                        aria-label="F&B service charge percent"
                        aria-invalid={Boolean(fnbRateDraft.error)}
                      />
                      <span className="ml-1 text-[12px] text-slate-400">%</span>
                    </span>
                  </label>
                </div>
                {fnbRateDraft.error || fnbPlanError ? (
                  <p className="flex items-center gap-2 text-left text-[11px] text-rose-600 sm:justify-end sm:text-right" role="alert">
                    <span>{fnbRateDraft.error ?? fnbPlanError}</span>
                    {fnbPlanError && !fnbRateDraft.error ? (
                      <button type="button" onClick={() => void loadFnbPlan()} className="font-semibold underline underline-offset-2">Retry</button>
                    ) : null}
                  </p>
                ) : fnbAutosaveStatus.state === "error" ? (
                  <p className="flex items-center gap-2 text-left text-[11px] text-rose-600 sm:justify-end sm:text-right" role="status">
                    <span>{fnbAutosaveStatus.message}</span>
                    <button type="button" onClick={retryFnbAutosave} className="font-semibold underline underline-offset-2">Retry</button>
                  </p>
                ) : fnbAutosaveStatus.state === "saving" ? (
                  <p className="text-left text-[11px] font-medium text-amber-700 sm:text-right" role="status">Saving…</p>
                ) : fnbAutosaveStatus.state === "saved" ? (
                  <p className="text-left text-[11px] font-medium text-emerald-700 sm:text-right" role="status">Saved</p>
                ) : null}
              </div>
            </div>
            <FnbSourceMenusSection
              menus={fnbSourceMenus}
              approvedItemCount={fnbSourceMenuApprovedItemCount}
              expanded={isFnbSourceMenusExpanded}
              onToggle={() => setIsFnbSourceMenusExpanded((current) => !current)}
              uploadMenus={() => {
                setFnbAmendmentBaseSourceMenuId(null);
                fnbMenuUploadInputRef.current?.click();
              }}
              openCatalogEditor={() => setIsFnbCatalogEditOpen(true)}
              workingMenuId={workingFnbSourceMenuId}
              onArchive={(menu) => {
                setPendingFnbSourceMenuCleanup({ action: "archive", menu });
              }}
              onDelete={(menu) => {
                setPendingFnbSourceMenuCleanup({ action: "delete", menu });
              }}
              onAmend={amendFnbSourceMenu}
              onRerun={(menu) => {
                void rerunFnbSourceMenu(menu);
              }}
            />
            {fnbSourceMenuNotice ? (
              <p className="border-b border-emerald-200 bg-emerald-50 px-5 py-2 text-[12px] text-emerald-700">{fnbSourceMenuNotice}</p>
            ) : null}
            {fnbSourceMenuError ? (
              <p className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-[12px] text-rose-700">{fnbSourceMenuError}</p>
            ) : null}
            <div className="bg-slate-100/60 px-4 py-4 sm:px-5">
            <div className="min-w-0">
            <div className={`${FNB_WORKSPACE_GRID_CLASS} items-start`}>
              <div className="order-2 flex max-h-[min(680px,calc(100vh-10.5rem))] min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:order-1">
                <div className="shrink-0 space-y-3">
                  <div className="space-y-2.5">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-[14px] font-semibold text-slate-950">Approved Catalog Items</h3>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">Approved items available for assignment to this session.</p>
                        </div>
                        <button type="button" onClick={() => { setIsCustomFnbOpen((current) => !current); setCustomFnbError(null); }} className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50" aria-expanded={isCustomFnbOpen}>
                          {isCustomFnbOpen ? "Close custom" : "+ Custom item"}
                        </button>
                      </div>
                    </div>
                    {isCustomFnbOpen ? (
                      <form onSubmit={createCustomFnbAssignment} className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3" aria-label="Create custom or off-menu F&B item">
                        <p className="text-[11px] font-semibold text-teal-950">Custom/off-menu item</p>
                        <p className="text-[10px] leading-4 text-teal-800">Saved event-wide and labeled Custom/off-menu; it is not attached to a venue source menu. Budget approval begins as Pending.</p>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                          <label className="text-[10px] font-semibold text-slate-700">Item name<input required name="itemName" className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]" /></label>
                          <label className="text-[10px] font-semibold text-slate-700">Category<input name="category" defaultValue="Food" className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]" /></label>
                          <label className="text-[10px] font-semibold text-slate-700">Original unit price ($)<input required name="publishedPrice" inputMode="decimal" className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]" /></label>
                          <label className="text-[10px] font-semibold text-slate-700">Negotiated override ($)<input name="negotiatedPrice" inputMode="decimal" className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]" /></label>
                          <label className="text-[10px] font-semibold text-slate-700">Explicit discount ($/unit)<input name="discount" inputMode="decimal" className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]" /></label>
                          <label className="text-[10px] font-semibold text-slate-700">Quantity<input required name="quantity" type="number" min={1} defaultValue={selectedFnbSessionDefaultQuantity ?? 1} className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]" /></label>
                          <label className="text-[10px] font-semibold text-slate-700">Minimum quantity<input name="minimumQuantity" type="number" min={1} className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]" /></label>
                          <label className="text-[10px] font-semibold text-slate-700">Pricing unit<select name="pricingUnit" defaultValue="PER_PERSON" className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]"><option value="PER_PERSON">Per person</option><option value="PER_ITEM">Per item</option><option value="PER_DOZEN">Per dozen</option><option value="FLAT">Flat</option></select></label>
                          <label className="text-[10px] font-semibold text-slate-700">Currency<input name="currency" defaultValue="USD" maxLength={3} className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] uppercase" /></label>
                          <label className="flex items-end gap-2 pb-1 text-[10px] font-semibold text-slate-700"><input name="taxable" type="checkbox" defaultChecked />Taxable item</label>
                        </div>
                        <label className="block text-[10px] font-semibold text-slate-700">Description<textarea name="description" rows={2} className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px]" /></label>
                        <details className="rounded-md border border-slate-200 bg-white p-2">
                          <summary className="cursor-pointer text-[10px] font-semibold text-slate-700">Dietary, allergen, verification and service details</summary>
                          <fieldset className="mt-2"><legend className="text-[10px] font-semibold text-slate-600">Dietary suitability</legend><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{DIETARY_CODES.map((code) => <label key={code} className="text-[10px] text-slate-600"><input type="checkbox" name="dietaryClaim" value={code} className="mr-1" />{code.replaceAll("_", " ")}</label>)}</div></fieldset>
                          <fieldset className="mt-2"><legend className="text-[10px] font-semibold text-slate-600">Contains allergens</legend><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{ALLERGEN_CODES.map((code) => <label key={code} className="text-[10px] text-slate-600"><input type="checkbox" name="containsClaim" value={code} className="mr-1" />{code.replaceAll("_", " ")}</label>)}</div></fieldset>
                          <fieldset className="mt-2"><legend className="text-[10px] font-semibold text-slate-600">Explicitly free of (requires evidence to verify)</legend><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{ALLERGEN_CODES.map((code) => <label key={code} className="text-[10px] text-slate-600"><input type="checkbox" name="freeOfClaim" value={code} className="mr-1" />{code.replaceAll("_", " ")}</label>)}</div></fieldset>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><label className="text-[10px] font-semibold text-slate-700">Verification<select name="verificationStatus" defaultValue="NEEDS_REVIEW" className="mt-0.5 h-8 w-full rounded-md border px-2 text-[11px]"><option value="NEEDS_REVIEW">Needs review</option><option value="UNVERIFIED">Unverified</option><option value="VERIFIED">Verified</option></select></label><label className="text-[10px] font-semibold text-slate-700">Vendor evidence/source<input name="verificationSource" className="mt-0.5 h-8 w-full rounded-md border px-2 text-[11px]" /></label></div>
                          <label className="mt-2 block text-[10px] font-semibold text-slate-700">Preparation/modification notes<textarea name="preparationNotes" rows={2} className="mt-0.5 w-full rounded-md border px-2 py-1 text-[11px]" /></label>
                          <label className="mt-2 block text-[10px] font-semibold text-slate-700">Service/accessibility notes<textarea name="serviceNotes" rows={2} className="mt-0.5 w-full rounded-md border px-2 py-1 text-[11px]" /></label>
                          <label className="mt-2 block text-[10px] font-semibold text-slate-700">Vendor-facing notes<textarea name="vendorNotes" rows={2} className="mt-0.5 w-full rounded-md border px-2 py-1 text-[11px]" /></label>
                        </details>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><label className="text-[10px] font-semibold text-slate-700">Service timing<input name="serviceTiming" className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]" /></label><label className="text-[10px] font-semibold text-slate-700">Dietary / assignment notes<input name="assignmentNotes" className="mt-0.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]" /></label></div>
                        {customFnbError ? <p role="alert" className="text-[11px] font-medium text-rose-700">{customFnbError}</p> : null}
                        <button disabled={customFnbSaving} className="h-8 w-full rounded-md bg-teal-800 px-3 text-[11px] font-semibold text-white disabled:opacity-50">{customFnbSaving ? "Saving…" : "Create and assign custom item"}</button>
                      </form>
                    ) : null}
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        value={fnbLibrarySearch}
                        onChange={(event) => setFnbLibrarySearch(event.target.value)}
                        placeholder="Search approved items"
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-2.5 pl-8 text-[12px] text-slate-800 outline-none focus:border-slate-300 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {fnbLibraryCategories.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setFnbCategoryFilter(category)}
                          className={[
                            "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
                            fnbCategoryFilter === category
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                    {fnbLibraryError ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700" role="alert">
                        <p>{fnbLibraryError}</p>
                        <button type="button" onClick={() => void loadFnbCatalogItems("retry")} className="shrink-0 font-semibold underline underline-offset-2">Retry</button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 pt-3">
                  <div className="space-y-1.5">
                    {fnbLibraryLoading ? (
                      <div className="space-y-2">
                        <div className="h-16 animate-pulse rounded-lg bg-slate-200/80" />
                        <div className="h-16 animate-pulse rounded-lg bg-slate-200/80" />
                      </div>
                    ) : filteredFnbLibraryItems.length > 0 ? (
                      filteredFnbLibraryItems.map((item) => (
                        <div
                          key={item.id}
                          draggable={!assignedFnbCatalogItemIds.has(item.id)}
                          onDragStart={(event) => handleFnbLibraryDragStart(item, event)}
                          className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[12px] font-semibold text-slate-900">{item.itemName}{item.isCustom ? <span className="ml-1.5 rounded bg-teal-50 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-teal-800">Custom/off-menu</span> : null}</p>
	                            {formatCatalogItemPriceDisplay(item) ? (
	                              <span className="max-w-[8rem] shrink-0 text-right text-[11px] font-semibold leading-tight text-slate-600">
	                                {formatCatalogItemPriceDisplay(item)}
	                              </span>
	                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{item.description || "No description provided"}</p>
                          <p className="mt-1.5 text-[10px] text-slate-400">
                            {catalogMetaParts(item).join(" • ")}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              void addFnbCatalogItemToSession(item);
                            }}
                            disabled={assignedFnbCatalogItemIds.has(item.id) || addingFnbCatalogItemId === item.id}
                            className={[
                              "mt-2.5 inline-flex h-7 w-full items-center justify-center rounded-md border px-2 text-[11px] font-semibold transition sm:w-auto",
                              assignedFnbCatalogItemIds.has(item.id)
                                ? "cursor-default border-sky-200 bg-sky-50 text-sky-900 disabled:cursor-default disabled:opacity-100"
                                : "border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50",
                            ].join(" ")}
                          >
                            {assignedFnbCatalogItemIds.has(item.id)
                              ? "Assigned"
                              : addingFnbCatalogItemId === item.id
                                ? "Adding..."
                                : "Add to session"}
                          </button>
                        </div>
                      ))
                    ) : fnbLibraryError ? null : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                        <p className="text-[13px] font-semibold text-slate-700">No approved catalog items yet</p>
                        <p className="mt-1 text-[12px] text-slate-500">Upload and review menus above, then assign approved items here.</p>
                      </div>
                    )}
                  </div>
                  </div>
                </div>

              <div className="order-1 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:order-2 xl:min-w-0">
                <div className="shrink-0 border-b border-slate-200 bg-white">
                  <div className="flex flex-col items-stretch justify-between gap-3 px-4 py-2.5 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold tracking-tight text-slate-900">Session F&B Plan</h3>
                      <p className="mt-0.5 text-[12px] leading-snug text-slate-500">
                        {selectedFnbSession?.title ?? "Selected session"} • {selectedFnbSession ? `${formatTimeLabel(selectedFnbSession.startTime)} - ${formatTimeLabel(selectedFnbSession.endTime)}` : "Time not set"}
                      </p>
                    </div>
                    <label className="flex min-w-0 shrink-0 flex-col items-start gap-0.5 sm:items-end">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Assigning to</span>
                      <select
                        value={selectedFnbSessionId}
                        onChange={(event) => setSelectedFnbSessionId(event.target.value)}
                        className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 text-left text-[12px] font-semibold text-slate-700 shadow-sm outline-none focus:border-slate-300 focus:bg-white sm:min-w-[12.5rem] sm:max-w-[16rem]"
                      >
                        {snapshot.sessions.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.title} - {formatTimeLabel(entry.startTime)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {fnbAssignmentError ? (
                    <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700" role="alert">
                      <p>{fnbAssignmentError}</p>
                      <button type="button" onClick={() => void loadFnbAssignments()} className="shrink-0 font-semibold underline underline-offset-2">Retry</button>
                    </div>
                  ) : null}
                  {fnbAssignmentNotice ? (
                    <p className="mx-4 mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700">{fnbAssignmentNotice}</p>
                  ) : null}
                </div>
                <div className="space-y-3 p-3 sm:p-4">
                {selectedFnbSessionId ? <SessionFnbSafetySummary eventId={eventId} sessionId={selectedFnbSessionId} refreshKey={fnbAssignments.map((assignment) => `${assignment.id}:${assignment.updatedAt}`).join("|")} onSummaryChange={selectedFnbSessionId === sessionId ? setFnbSafetyAlert : undefined} /> : null}
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setFnbDropActive(true);
                  }}
                  onDragLeave={() => setFnbDropActive(false)}
                  onDrop={handleFnbPlanDrop}
                  className={[
                    "min-h-64 rounded-xl border border-dashed p-4 transition",
                    fnbDropActive ? "border-blue-400 bg-blue-50/80" : "border-slate-300/90 bg-slate-50/90",
                  ].join(" ")}
                >
                  {fnbAssignmentsLoading ? (
                    <div className="space-y-2">
                      <div className="h-24 animate-pulse rounded-lg bg-slate-200/80" />
                      <div className="h-24 animate-pulse rounded-lg bg-slate-200/80" />
                    </div>
                  ) : fnbAssignments.length > 0 ? (
                    <div className="space-y-3">
                      {fnbAssignments.map((assignment) => {
                        const unitPriceCents = parseSafePriceCents(assignment.catalogItem.price);
                        const usesTotalPackageForecast = assignment.manualPriceCents !== null;
                        const packageOptions = extractFnbPackagePriceOptions(assignment.catalogItem);
                        const notesTier = parseTierFromNotes(assignment.notes);
                        const hasPackageTierChoice = packageOptions.length >= 2 && unitPriceCents === null;
                        const effectiveUnitCents = usesTotalPackageForecast
                          ? null
                          : (unitPriceCents ?? notesTier?.unitCents ?? null);
                        const perPersonTotalCents =
                          effectiveUnitCents !== null && assignment.quantity
                            ? effectiveUnitCents * assignment.quantity
                            : null;
                        const assignmentCalculation = fnbAssignmentCalculations.get(assignment.id) ?? assignment.calculation;
                        const financialOrder = fnbAssignmentFinancials.get(assignment.id)?.order ?? assignment.financialCalculation;
                        const financialLine = financialOrder?.lines[0] ?? null;
                        const itemSnapshot = assignment.catalogItemSnapshot;
                        const pinnedMoney = (key: "publishedPriceCents" | "negotiatedPriceCents" | "discountCents") => {
                          const value = itemSnapshot?.[key];
                          return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
                            ? value
                            : assignment.catalogItem[key] ?? null;
                        };
                        const publishedUnitCents = pinnedMoney("publishedPriceCents");
                        const negotiatedUnitCents = pinnedMoney("negotiatedPriceCents");
                        const explicitDiscountUnitCents = pinnedMoney("discountCents") ?? 0;
                        const itemTaxable = typeof itemSnapshot?.taxable === "boolean" ? itemSnapshot.taxable : assignment.catalogItem.taxable !== false;
                        const actualCents = assignment.syncedBudgetLineItem?.actualCents ?? null;
                        const actualVarianceCents = actualCents === null || assignmentCalculation.totalCents === null
                          ? null
                          : actualCents - assignmentCalculation.totalCents;
                        const lineTotal = assignmentCalculation.totalCents !== null
                          ? formatMoneyFromCents(assignmentCalculation.totalCents)
                          : "Not calculated";
                        const taxValidationError = fnbAssignmentTaxValidationError(assignment.taxes);
                        const tierSelectIndex =
                          notesTier !== null
                            ? packageOptions.findIndex((option) => option.unitCents === notesTier.unitCents)
                            : -1;
                        const showFnbPackageTierColumn = hasPackageTierChoice && !usesTotalPackageForecast;
                        const showFnbCatalogRangeHint =
                          !usesTotalPackageForecast && unitPriceCents === null && !hasPackageTierChoice;
                        const fnbAssignmentStatusLabel =
                          fnbAutosaveStatus.state === "saving"
                            ? "Saving"
                            : fnbAutosaveStatus.state === "error"
                              ? "Needs retry"
                              : assignment.budgetLineItemId
                                ? "Budget synced"
                                : "Saved";
                        const fnbAssignmentStatusClass =
                          fnbAutosaveStatus.state === "saving"
                            ? "bg-amber-100 text-amber-900"
                            : fnbAutosaveStatus.state === "error"
                              ? "bg-rose-100 text-rose-900"
                              : assignment.budgetLineItemId
                                ? "bg-sky-100 text-sky-950"
                                : "bg-slate-100 text-slate-600";
                        return (
                          <div key={assignment.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-[14px] font-semibold text-slate-950">{assignment.catalogItem.itemName}</p>
                                  {assignment.catalogItem.isCustom ? <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800">Custom/off-menu</span> : null}
                                  {assignment.syncedBudgetLineItem ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">Approval {assignment.syncedBudgetLineItem.approval.replaceAll("_", " ")}</span> : null}
                                  <span
                                    className={[
                                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                      fnbAssignmentStatusClass,
                                    ].join(" ")}
                                  >
                                    {fnbAssignmentStatusLabel}
                                  </span>
                                </div>
                                <p className="mt-1 text-[12px] leading-5 text-slate-500">
                                  {catalogMetaParts(assignment.catalogItem).join(" • ") || "F&B catalog item"}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                                  {lineTotal}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void removeFnbAssignment(assignment.id);
                                  }}
                                  disabled={workingFnbAssignmentId === assignment.id}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                                  aria-label="Remove F&B assignment"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5">
                              <div className="flex flex-col gap-2">
                                <>
                                      <div className="flex flex-wrap items-end gap-x-2 gap-y-1.5">
                                        <div className="w-[4.25rem] shrink-0 space-y-0.5">
                                          <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">Qty</span>
                                          <input
                                            type="number"
                                            min={1}
                                            value={assignment.quantity ?? ""}
                                            onChange={(event) => {
                                              const nextValue = event.target.value.trim() ? Number(event.target.value) : null;
                                              updateFnbAssignmentDraft(assignment.id, "quantity", nextValue);
                                            }}
                                            onBlur={() => flushFnbAssignmentAutosave(assignment.id)}
                                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-1.5 text-[13px] tabular-nums outline-none focus:border-slate-300"
                                            placeholder="#"
                                            aria-label="Quantity or headcount"
                                          />
                                        </div>
                                        <div className="shrink-0 space-y-0.5">
                                          <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">Forecast</span>
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <div className="inline-flex h-8 shrink-0 rounded-md border border-slate-200 bg-white p-0.5">
                                              <button
                                                type="button"
                                                onClick={() => patchFnbAssignment(assignment.id, { manualPriceCents: null }, true)}
                                                className={[
                                                  "rounded px-1.5 py-1 text-[10px] font-semibold transition sm:px-2 sm:text-[11px]",
                                                  !usesTotalPackageForecast ? "bg-slate-950 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50",
                                                ].join(" ")}
                                              >
                                                Per Person
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  patchFnbAssignment(assignment.id, {
                                                    notes: stripTierLineFromNotes(assignment.notes) || null,
                                                    manualPriceCents: assignment.manualPriceCents ?? perPersonTotalCents ?? 0,
                                                  }, true)
                                                }
                                                className={[
                                                  "rounded px-1.5 py-1 text-[10px] font-semibold transition sm:px-2 sm:text-[11px]",
                                                  usesTotalPackageForecast ? "bg-slate-950 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50",
                                                ].join(" ")}
                                              >
                                                Total Package
                                              </button>
                                            </div>
                                            {usesTotalPackageForecast ? (
                                              <div className="flex items-center gap-1">
                                                <span className="text-[12px] font-medium text-slate-400" aria-hidden>
                                                  $
                                                </span>
                                                <input
                                                  type="number"
                                                  min={0}
                                                  step="0.01"
                                                  value={assignment.manualPriceCents === null ? "" : String(assignment.manualPriceCents / 100)}
                                                  onChange={(event) => {
                                                    updateFnbAssignmentDraft(assignment.id, "manualPriceCents", dollarsToCents(event.target.value));
                                                  }}
                                                  onBlur={() => flushFnbAssignmentAutosave(assignment.id)}
                                                  className="h-8 w-[6.25rem] shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[13px] tabular-nums outline-none focus:border-slate-300"
                                                  placeholder="0.00"
                                                  aria-label="Total package amount"
                                                />
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                        {showFnbPackageTierColumn ? (
                                          <div className="min-w-0 flex-1 basis-[10rem] space-y-0.5">
                                            <label htmlFor={`fnb-tier-${assignment.id}`} className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                                              Tier
                                            </label>
                                            <select
                                              id={`fnb-tier-${assignment.id}`}
                                              className="h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-800 outline-none focus:border-slate-300"
                                              value={tierSelectIndex >= 0 ? String(tierSelectIndex) : ""}
                                              onChange={(event) => {
                                                const raw = event.target.value;
                                                if (!raw) {
                                                  const user = stripTierLineFromNotes(assignment.notes);
                                                  patchFnbAssignment(assignment.id, { notes: user.trim() || null }, true);
                                                  return;
                                                }
                                                const idx = Number(raw);
                                                const option = packageOptions[idx];
                                                if (!option) return;
                                                const user = stripTierLineFromNotes(assignment.notes);
                                                patchFnbAssignment(
                                                  assignment.id,
                                                  { notes: mergeTierIntoNotes(user, option.unitCents, option.label) || null },
                                                  true,
                                                );
                                              }}
                                            >
                                              <option value="">Select tier...</option>
                                              {packageOptions.map((option, idx) => (
                                                <option key={`${assignment.id}-tier-${option.unitCents}-${idx}`} value={String(idx)}>
                                                  {option.label} — {formatMoneyFromCents(option.unitCents)}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        ) : showFnbCatalogRangeHint ? (
                                          <div className="min-w-0 flex-1 basis-[8rem] pb-1">
                                            <p className="text-[10px] leading-snug text-slate-400">
                                              No single unit in catalog — use Total or set catalog price.
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="min-w-0 flex-1 basis-0 max-sm:hidden" aria-hidden />
                                        )}
                                        <div className="ml-auto min-w-0 shrink-0 space-y-0.5 text-right sm:ml-0">
                                          <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">Estimate</span>
                                          <div className="flex h-8 max-w-[16rem] items-center justify-end">
                                            {usesTotalPackageForecast ? (
                                              <span className="tabular-nums text-[11px] font-semibold text-slate-800">
                                                {assignment.manualPriceCents !== null
                                                  ? formatMoneyFromCents(assignment.manualPriceCents)
                                                  : "—"}
                                              </span>
                                            ) : perPersonTotalCents !== null ? (
                                              <span className="text-right tabular-nums text-[11px] text-slate-600">
                                                <span className="text-slate-400">
                                                  {formatMoneyFromCents(effectiveUnitCents ?? 0)} × {assignment.quantity}
                                                </span>{" "}
                                                <span className="font-semibold text-slate-800">
                                                  {formatMoneyFromCents(perPersonTotalCents)}
                                                </span>
                                              </span>
                                            ) : (
                                              <span className="text-[11px] text-slate-400">—</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                  {showFnbPackageTierColumn && !notesTier ? (
                                    <p className="text-[10px] leading-snug text-slate-400">
                                      Choose a tier for per-guest unit price; estimate updates with qty.
                                    </p>
                                  ) : null}
                                </>
                                <label className="space-y-0.5 pt-0.5">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Service timing</span>
                                  <input
                                    value={assignment.serviceTiming ?? ""}
                                    onChange={(event) => updateFnbAssignmentDraft(assignment.id, "serviceTiming", event.target.value)}
                                    onBlur={() => flushFnbAssignmentAutosave(assignment.id)}
                                    className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] outline-none focus:border-slate-300"
                                    placeholder="e.g. Pre-set by 2:45 PM"
                                  />
                                </label>
                                <label className="space-y-0.5">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Notes</span>
                                  <textarea
                                    value={stripTierLineFromNotes(assignment.notes)}
                                    onChange={(event) => {
                                      const tier = parseTierFromNotes(assignment.notes);
                                      const nextNotes =
                                        tier && !usesTotalPackageForecast
                                          ? mergeTierIntoNotes(event.target.value, tier.unitCents, tier.label)
                                          : event.target.value.trim() || null;
                                      updateFnbAssignmentDraft(assignment.id, "notes", nextNotes);
                                    }}
                                    onBlur={() => flushFnbAssignmentAutosave(assignment.id)}
                                    rows={1}
                                    className="min-h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-slate-300"
                                    placeholder="Dietary, room placement, service notes"
                                  />
                                </label>
                                <div className="space-y-2 border-t border-slate-200 pt-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Additional item taxes</span>
                                    <button
                                      type="button"
                                      onClick={() => addFnbAssignmentTax(assignment.id)}
                                      className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                      <Plus className="h-3 w-3" />
                                      Add tax
                                    </button>
                                  </div>
                                  {assignment.taxes.map((tax) => (
                                    <div key={tax.id} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-center">
                                      <input
                                        value={tax.label ?? ""}
                                        onChange={(event) => updateFnbAssignmentTax(assignment.id, tax.id, { label: event.target.value || null })}
                                        onBlur={() => flushFnbAssignmentAutosave(assignment.id)}
                                        className="h-8 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[12px] outline-none focus:border-slate-300"
                                        placeholder="Tax label (optional)"
                                        aria-label="Item tax label"
                                      />
                                      <span className="flex h-8 items-center rounded-md border border-slate-200 bg-white px-2">
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          step="0.01"
                                          value={tax.percentage}
                                          onChange={(event) => updateFnbAssignmentTax(assignment.id, tax.id, { percentage: event.target.value })}
                                          onBlur={() => blurFnbAssignmentTaxPercentage(assignment.id, tax.id)}
                                          className="min-w-0 flex-1 bg-transparent text-right text-[12px] tabular-nums outline-none"
                                          aria-label="Item tax percentage"
                                          aria-invalid={Boolean(taxValidationError)}
                                        />
                                        <span className="ml-1 text-[11px] text-slate-400">%</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => removeFnbAssignmentTax(assignment.id, tax.id)}
                                        className="h-8 justify-self-start px-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 sm:justify-self-end"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                  {taxValidationError ? (
                                    <p className="text-[11px] text-rose-600">{taxValidationError}</p>
                                  ) : null}
                                  {assignmentCalculation.subtotalCents !== null ? (
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-white px-2 py-1.5 text-[10px] text-slate-500 ring-1 ring-slate-200">
                                      <span>Subtotal {formatMoneyFromCents(assignmentCalculation.subtotalCents)}</span>
                                      <span>Tax {formatMoneyFromCents(assignmentCalculation.taxCents ?? 0)}</span>
                                      <span>Service {formatMoneyFromCents(assignmentCalculation.serviceChargeCents ?? 0)}</span>
                                      <span>Additional {formatMoneyFromCents(assignmentCalculation.additionalTaxCents ?? 0)}</span>
                                      <span className="font-semibold text-slate-800">Total {formatMoneyFromCents(assignmentCalculation.totalCents ?? 0)}</span>
                                    </div>
                                  ) : null}
                                  {financialOrder ? (
                                    <details className="rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
                                      <summary className="cursor-pointer font-semibold text-slate-800">Calculation explanation</summary>
                                      <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                                        <div className="flex justify-between gap-2"><dt>Original unit price</dt><dd className="font-medium tabular-nums text-slate-800">{publishedUnitCents === null ? "Not set" : formatMoneyFromCents(publishedUnitCents)}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Negotiated override</dt><dd className="font-medium tabular-nums text-slate-800">{negotiatedUnitCents === null ? "Not set" : formatMoneyFromCents(negotiatedUnitCents)}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Negotiated comparison</dt><dd className="font-medium tabular-nums text-slate-800">{financialOrder.negotiatedSavingsCents >= 0 ? `${formatMoneyFromCents(financialOrder.negotiatedSavingsCents)} savings` : `${formatMoneyFromCents(Math.abs(financialOrder.negotiatedSavingsCents))} premium`}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Quantity / billed</dt><dd className="font-medium tabular-nums text-slate-800">{assignment.quantity ?? "—"} / {financialLine?.billedQuantity ?? "—"}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Explicit discounts</dt><dd className="font-medium tabular-nums text-slate-800">{formatMoneyFromCents(financialOrder.itemDiscountCents + financialOrder.orderDiscountCents)}{explicitDiscountUnitCents > 0 ? ` (${formatMoneyFromCents(explicitDiscountUnitCents)}/unit)` : ""}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Taxability</dt><dd className="font-medium text-slate-800">{itemTaxable ? "Taxable" : "Non-taxable"}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Subtotal</dt><dd className="font-medium tabular-nums text-slate-800">{formatMoneyFromCents(financialOrder.subtotalAfterDiscountsCents)}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Service charge</dt><dd className="font-medium tabular-nums text-slate-800">{formatMoneyFromCents(financialOrder.serviceChargeCents)}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Taxes</dt><dd className="font-medium tabular-nums text-slate-800">{formatMoneyFromCents(financialOrder.taxCents)}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Fees</dt><dd className="font-medium tabular-nums text-slate-800">{formatMoneyFromCents(financialOrder.feeCents)}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Final estimate</dt><dd className="font-semibold tabular-nums text-slate-950">{formatMoneyFromCents(financialOrder.totalCents)}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Actual / variance</dt><dd className="font-semibold tabular-nums text-slate-950">{actualCents === null ? "Not posted" : `${formatMoneyFromCents(actualCents)} / ${formatSignedMoneyFromCents(actualVarianceCents ?? 0)}`}</dd></div>
                                      </dl>
                                      {financialOrder.taxes.length > 0 ? <ul className="mt-2 border-t border-slate-100 pt-2" aria-label="Applied tax bases">{financialOrder.taxes.map((tax) => <li key={tax.id} className="flex justify-between gap-2"><span>{tax.label} · {tax.percentage}% on {formatMoneyFromCents(tax.basisCents)}</span><span className="tabular-nums">{formatMoneyFromCents(tax.amountCents)}</span></li>)}</ul> : null}
                                      <ol className="mt-2 border-t border-slate-100 pt-2" aria-label="Ordered calculation trace">{financialOrder.trace.map((entry, index) => <li key={`${entry.code}-${index}`} className="flex justify-between gap-2"><span>{index + 1}. {entry.label}</span><span className="tabular-nums">{formatSignedMoneyFromCents(entry.amountCents)}</span></li>)}</ol>
                                      <p className="mt-2 text-[10px] text-slate-500">Actuals and approval come from the linked Full Budget Grid row. Edits autosave with conflict detection; failed drafts remain visible for retry.</p>
                                    </details>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                      <p className="text-[14px] font-semibold text-slate-700">Drag menu items here or use Add to session</p>
                      <p className="mt-1 text-[12px] text-slate-500">Assignments save immediately to {selectedFnbSession?.title ?? "the selected session"}.</p>
                    </div>
                  )}
                </div>
                </div>
              </div>

              <div className="order-3 flex h-fit min-w-0 shrink-0 flex-col self-start rounded-2xl border border-slate-800/80 bg-slate-950 px-4 py-5 text-white shadow-md lg:col-span-2 xl:col-span-1 xl:col-start-3">
                <h3 className="text-[14px] font-semibold tracking-tight text-slate-100">Session F&B Estimate</h3>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
                  <div className="rounded-xl border border-white/12 bg-gradient-to-b from-white/[0.14] to-white/[0.06] px-4 py-4 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total estimated cost</p>
                    <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums tracking-tight text-white">
                      {formatMoneyFromCents(fnbAssignmentEstimate.totalEstimatedCents)}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-[11px] leading-snug text-slate-400">
                      <span>Forecast attendance</span>
                      <span className="font-semibold tabular-nums text-slate-200">
                        {fnbForecastAttendance ? `${fnbForecastAttendance} guest${fnbForecastAttendance === 1 ? "" : "s"}` : "Not set"}
                      </span>
                    </div>
                  </div>

                  <div className="contents">
                    <div className="rounded-xl border border-white/8 bg-white/[0.08] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Per person cost</p>
                      <p className="mt-2 text-[24px] font-semibold tabular-nums leading-none text-white">
                        {fnbAssignmentEstimate.perPersonCents === null
                          ? "Not available"
                          : formatMoneyFromCentsWithCents(fnbAssignmentEstimate.perPersonCents)}
                      </p>
                      <p className="mt-1.5 text-[11px] text-slate-400">Based on forecast attendance</p>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/[0.08] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Budgeted amount</p>
                        {fnbBudgetLinkedAssignmentCount > 0 ? (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                            {fnbBudgetLinkedAssignmentCount} linked
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[22px] font-semibold tabular-nums leading-none text-white">
                        {fnbAssignmentEstimate.budgetedCents === null
                          ? "Not set"
                          : formatMoneyFromCents(fnbAssignmentEstimate.budgetedCents)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/[0.08] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Variance to budget</p>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <p className={`text-[22px] font-semibold tabular-nums leading-none ${fnbEstimateVarianceClass}`}>
                          {fnbEstimateVariance === null ? "Not available" : formatSignedMoneyFromCents(fnbEstimateVariance.amountCents)}
                        </p>
                        <span className={`rounded-full border border-current/30 px-2 py-1 text-[10px] font-semibold ${fnbEstimateVarianceClass}`}>
                          {fnbEstimateVarianceLabel}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">
                        {fnbEstimateVariance?.percentage === null || fnbEstimateVariance === null
                          ? "Set a budget to compare this estimate."
                          : `${formatPercent(fnbEstimateVariance.percentage)} ${fnbEstimateVariance.direction} budget`}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/8 bg-white/[0.08] p-3 sm:col-span-2 lg:col-span-2 xl:col-span-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cost breakdown</p>
                    <div className="mt-3 space-y-2 text-[12px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-300">F&B subtotal</span>
                        <span className="font-semibold tabular-nums text-white">{formatMoneyFromCents(fnbAssignmentEstimate.subtotalCents)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400">Tax · {Number(fnbRateDraft.taxPercent)}%</span>
                        <span className="tabular-nums text-slate-300">{formatMoneyFromCents(fnbAssignmentEstimate.taxCents)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400">Service charge · {Number(fnbRateDraft.serviceChargePercent)}%</span>
                        <span className="tabular-nums text-slate-300">{formatMoneyFromCents(fnbAssignmentEstimate.serviceChargeCents)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400">Additional item taxes</span>
                        <span className="tabular-nums text-slate-300">{formatMoneyFromCents(fnbAssignmentEstimate.additionalTaxCents)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
                        <span className="font-semibold text-slate-100">Total estimated</span>
                        <span className="font-semibold tabular-nums text-white">{formatMoneyFromCents(fnbAssignmentEstimate.totalEstimatedCents)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/8 bg-white/[0.08] p-3 sm:col-span-2 lg:col-span-1 xl:col-span-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Needs attention</p>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-200">
                        {fnbAssignmentEstimate.needsAttention.length}
                      </span>
                    </div>
                    {fnbAssignmentEstimate.needsAttention.length === 0 ? (
                      <p className="mt-2 text-[11px] leading-snug text-slate-400">Estimate inputs look complete.</p>
                    ) : (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-snug text-slate-300 marker:text-slate-500">
                        {fnbAssignmentEstimate.needsAttention.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                    {fnbEstimateAttentionReasonsOrdered.length > 0 ? (
                      <p className="mt-2 text-[10px] leading-snug text-slate-500">
                        Forecast blockers: {fnbEstimateAttentionReasonsOrdered.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            </div>
            </div>
          </div>

        </div>
      ) : null}

      {isFnbCatalogEditOpen ? (
        <FnbCatalogEditModal
          items={fnbLibraryItems}
          onSaveItem={updateApprovedFnbCatalogItem}
          onClose={() => setIsFnbCatalogEditOpen(false)}
        />
      ) : null}

      {pendingFnbSourceMenuCleanup ? (
        <FnbSourceMenuCleanupModal
          action={pendingFnbSourceMenuCleanup.action}
          menu={pendingFnbSourceMenuCleanup.menu}
          isWorking={workingFnbSourceMenuId === pendingFnbSourceMenuCleanup.menu.id}
          onCancel={() => setPendingFnbSourceMenuCleanup(null)}
          onConfirm={() => {
            if (pendingFnbSourceMenuCleanup.action === "archive") {
              void archiveFnbSourceMenu(pendingFnbSourceMenuCleanup.menu);
            } else {
              void deleteFnbSourceMenu(pendingFnbSourceMenuCleanup.menu);
            }
          }}
        />
      ) : null}

      {activeTab === "av" ? (
        <div className="space-y-5">
          {avSections.length > 0 ? (
            avSections.map((section) => {
              const sectionType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
              return (
                <SectionCard key={`${section.id}-${sessionId}`} title="AV Requirements">
                  <SessionRequirementSectionBody
                    eventId={eventId}
                    sessionId={sessionId}
                    session={session}
                    section={section}
                    sectionType={sectionType}
                    budgetLinesReady={budgetLinesReady}
                    budgetLinesLoading={budgetLinesLoading}
                    budgetLinesError={budgetLinesError}
                    onRetryBudgetLines={() => void ensureBudgetLinesLoaded()}
                    eventBudgetLineItems={eventBudgetLineItems}
                    selectedRequirementValues={selectedRequirementValues}
                    onChangeSelectedRequirementValues={setSelectedRequirementValues}
                    linkedBudgetLineItemsByItemId={linkedBudgetLineItemsByItemId}
                    onBudgetLinkChange={handleRequirementBudgetLinkChange}
                    onRefreshBudgetLineItems={refreshBudgetLinesQuietly}
                    customItemDraft={customItemDrafts[section.id] ?? ""}
                    customItemError={customItemErrors[section.id] ?? null}
                    isSavingCustomItem={savingCustomItemSectionId === section.id}
                    onCustomItemDraftChange={handleCustomItemDraftChange}
                    onCreateCustomItem={(targetSectionId) => {
                      void createCustomRequirementItem(targetSectionId);
                    }}
                    disabled={isSaving}
                  />
                </SectionCard>
              );
            })
          ) : (
            <SectionCard title="AV Requirements">
              <p className="text-[13px] text-slate-500">No AV requirements configured.</p>
            </SectionCard>
          )}
        </div>
      ) : null}

      {activeTab === "staffing" ? (
        <div className="space-y-5">
          {staffingSections.length > 0 ? (
            staffingSections.map((section) => {
              const sectionType = inferSessionRequirementCatalogType({ key: section.key, label: section.label });
              return (
                <SectionCard key={`${section.id}-${sessionId}`} title="Staffing needs">
                  <SessionRequirementSectionBody
                    eventId={eventId}
                    sessionId={sessionId}
                    session={session}
                    section={section}
                    sectionType={sectionType}
                    budgetLinesReady={budgetLinesReady}
                    budgetLinesLoading={budgetLinesLoading}
                    budgetLinesError={budgetLinesError}
                    onRetryBudgetLines={() => void ensureBudgetLinesLoaded()}
                    eventBudgetLineItems={eventBudgetLineItems}
                    selectedRequirementValues={selectedRequirementValues}
                    onChangeSelectedRequirementValues={setSelectedRequirementValues}
                    linkedBudgetLineItemsByItemId={linkedBudgetLineItemsByItemId}
                    onBudgetLinkChange={handleRequirementBudgetLinkChange}
                    onRefreshBudgetLineItems={refreshBudgetLinesQuietly}
                    customItemDraft={customItemDrafts[section.id] ?? ""}
                    customItemError={customItemErrors[section.id] ?? null}
                    isSavingCustomItem={savingCustomItemSectionId === section.id}
                    onCustomItemDraftChange={handleCustomItemDraftChange}
                    onCreateCustomItem={(targetSectionId) => {
                      void createCustomRequirementItem(targetSectionId);
                    }}
                    disabled={isSaving}
                  />
                </SectionCard>
              );
            })
          ) : (
            <SectionCard title="Staffing needs">
              <p className="text-[13px] text-slate-500">No staffing needs configured.</p>
            </SectionCard>
          )}
          <SectionCard title="Assigned crew">
            {session.staffAssignments.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {session.staffAssignments.map((assignment) => (
                  <div key={`${assignment.personId ?? assignment.name}-${assignment.assignmentRole ?? assignment.role ?? "crew"}`} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-[13px] font-semibold text-slate-900">{assignment.name}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {[assignment.assignmentRole ?? assignment.role, assignment.company, assignment.email].filter(Boolean).join(" · ") || "Assigned crew"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3">
                <p className="text-[13px] font-semibold text-slate-700">Crew assignment directory coming next</p>
                <p className="mt-1 text-[12px] text-slate-500">Use Staffing needs above to capture required roles and counts for now.</p>
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {activeTab === "supplies" ? <SessionSuppliesWorkspace eventId={eventId} sessionId={sessionId} /> : null}

      {activeTab === "signage"
        ? renderOperationalRequirementSections(signageSections, "Signage", "No signage options configured.")
        : null}

      {activeTab === "speakers" ? (
        <div className="space-y-3">
          <SectionCard title="Speakers" action={<Mic className="h-4 w-4 text-slate-400" />}>
            <SpeakerPicker
              eventId={eventId}
              selected={selectedSpeakers}
              onAssign={assignSpeaker}
              onRemove={removeSpeaker}
              disabled={isSaving}
            />
          </SectionCard>
          <AttendeeRosterSection eventId={eventId} matrixRowId={session.rowId} />
        </div>
      ) : null}

      {activeTab === "conflicts" ? (
        <SectionCard title="Conflicts">
          {visibleConflicts.length > 0 ? (
            <div className="space-y-2">
              {visibleConflicts.map((conflict: Matrix2Conflict) => {
                const relatedSessionId = conflict.relatedSessionId ?? conflict.sessionIds.find((id) => id !== session.id);
                return <div key={conflict.id} className={[
                  "flex gap-2 rounded-lg border px-3 py-2 text-[13px]",
                  conflict.severity === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700",
                ].join(" ")}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0"><p className="font-semibold">{conflict.severity === "error" ? "Blocking conflict" : "Warning"}: {conflict.affectedSessionTitle}</p><p>{conflict.message}</p><p className="mt-1 text-[12px]">Reason: {conflict.reason}</p>{relatedSessionId ? <Link href={`${runOfShowSessionHref(eventId, relatedSessionId)}?tab=conflicts`} className="mt-2 inline-flex rounded-md border border-current/20 bg-white px-2 py-1 text-[11px] font-semibold">View related session</Link> : null}</div>
                </div>;
              })}
            </div>
          ) : conflictCoverage ? (
            <p
              className={[
                "inline-flex items-start gap-2 text-[13px]",
                // A run with incomplete or unsupported checks is not a green all-clear.
                conflictCoverage.hasLimitations ? "text-amber-800" : "text-emerald-700",
              ].join(" ")}
            >
              {conflictCoverage.hasLimitations ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>{conflictCoverageSummary(conflictCoverage)}</span>
            </p>
          ) : null}

          {conflictCoverage ? (
            <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-[12px] font-semibold text-slate-800">
                View checks performed
              </summary>
              <p className="mt-2 text-[12px] text-slate-600">
                Evaluated {new Date(conflictCoverage.evaluatedAt).toLocaleString()} over{" "}
                {conflictCoverage.scopeLabel}. Sessions on other dates were not part of this run.
              </p>
              <ul className="mt-2 space-y-2">
                {conflictCoverage.checks.map((check) => (
                  <li key={check.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-[12px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-slate-900">{check.rule}</span>
                      <span
                        className={[
                          "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          check.status === "found"
                            ? "border-rose-200 bg-rose-50 text-rose-800"
                            : check.status === "passed"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : check.status === "limited"
                                ? "border-amber-200 bg-amber-50 text-amber-900"
                                : "border-slate-300 bg-slate-100 text-slate-700",
                        ].join(" ")}
                      >
                        {check.status === "found"
                          ? `${check.findingCount} found`
                          : check.status === "passed"
                            ? "Passed"
                            : check.status === "limited"
                              ? "Incomplete"
                              : "Not supported"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-slate-600">{check.description}</p>
                    <p className="mt-0.5 text-slate-500">
                      Records evaluated: {check.evaluatedCount}
                    </p>
                    {check.exclusions.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-slate-600">
                        {check.exclusions.map((item) => (
                          <li key={`${check.id}-${item.reason}`}>
                            Not verified for {item.count}: {item.reason}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </SectionCard>
      ) : null}

      {activeTab === "notes-activity" ? (
        <SessionNotesActivity
          eventId={eventId}
          sessionId={session.id}
          sessionTitle={title.trim() || "this session"}
          notes={notes}
          persistedNotes={session.notes || ""}
          onNotesChange={setNotes}
          onSave={handleSave}
          isSaving={isSaving}
          saveError={errorMessage}
          sessionUpdatedAt={session.updatedAt}
        />
      ) : null}

    </div>
  );
}
