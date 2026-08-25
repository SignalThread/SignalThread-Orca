"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useEventTerminology } from "@/components/event-terminology-context";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Armchair,
  Box,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock3,
  Component,
  DoorClosed,
  LayoutGrid,
  Layers,
  Monitor,
  Pause,
  Pencil,
  Play,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  Sofa,
  Sparkles,
  Table2,
  TriangleAlert,
  Utensils,
  Upload,
  Warehouse,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type KeyboardEventHandler,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  Matrix2Session,
  Matrix2Snapshot,
} from "@/app/(shell)/matrix-2/_components/types";
import {
  createInitialDocument,
} from "@/lib/room-set/object-catalog";
import {
  ROOM_SET_EVENT_INTENT_ARCHETYPES,
  type RoomSetEventIntentId,
  type RoomSetOperationalBrief,
  type RoomSetOperationalValidation,
  type RoomSetPlannerGenerationMode,
} from "@/lib/room-set/room-layout-starters";
import type {
  RoomSetDensityControl,
  RoomSetLayoutStylePreference,
} from "@/lib/room-set/planner-intent-shared";
import {
  layoutStyleOptionsForIntent,
  ROOM_SET_PROMPT_STYLE_HINT_OPTIONS,
  ROOM_SET_STYLE_LOCKED_OPTIONS,
  type RoomSetLayoutStyleOption,
} from "@/lib/room-set/layout-style-options";
import { formatComponentRequestInterpretationSummaryLines } from "@/lib/room-set/planner-component-requests";
import type {
  RoomSetCanvasLayoutSnapshot,
  RoomSetLayoutPlacement,
} from "@/lib/room-set/planner-layout-schema";
import { isPlaceablePlannerComponentId } from "@/lib/room-set/planner-layout-schema";
import type { LayoutSpec } from "@/lib/room-set/layout-spec";
import {
  plannerSceneFromLayoutPlacements,
  plannerSceneToCanvasLayoutSnapshot,
  type PlannerScene,
  type PlannerSceneObject,
} from "@/lib/room-set/planner-scene";
import { eventRunOfShowHref, roomSetHref, runOfShowSessionHref } from "@/lib/planning/routes";
import {
  formatRoomShellDimensions,
} from "@/lib/room-set/room-units";
import {
  parsePlannerSceneJson,
} from "@/lib/room-set/planner-scene-io";
import {
  buildPlannerSceneSeatingOverlayRecords,
  isPlannerSceneSeatingCapableObject,
  repairPlannerSceneSeatingTableLinks,
  resolvePlannerSceneSeatingObjectLinks,
} from "@/lib/room-set/seating-overlay-mapping";
import {
  resolvePrototypeRoomSetInitialState,
} from "@/lib/room-set/setup-adapter";
import {
  groupRoomSetComponentsByCategory,
  getRoomSetComponent,
  ROOM_SET_COMPONENT_CATEGORIES,
  searchRoomSetComponents,
  type RoomSetComponentDefinition,
  type RoomSetComponentCategoryId,
} from "@/lib/room-set/component-library";
import { sumPlatedSeatCapacity } from "@/lib/room-set/planner-layout-validator";
import { staffingForOperationalPreset } from "@/lib/room-set/operational-mock";
import {
  ensureOperationalProgram,
  OPERATIONAL_PRESET_LABELS,
  patchOperationalProgram,
  rebuildOperationalTransitions,
} from "@/lib/room-set/operational-program";
import { buildOperationalPlaybackCommentary } from "@/lib/room-set/operational-playback-commentary";
import {
  buildOperationalPlaybackPlan,
  playbackPlanDurationMs,
  resolvePlaybackMoment,
} from "@/lib/room-set/operational-playback-schedule";
import {
  OPERATIONAL_OVERLAY_KINDS,
  type OperationalOverlayKind,
  type OperationalPhasePreset,
  type SimulationModeKind,
} from "@/lib/room-set/operational-types";
import { loadRoomSetDocument, persistRoomSetDocument } from "@/lib/room-set/persistence";
import type {
  RoomSetDocumentV1,
  RoomSetLayoutBoundary,
  RoomSetLayoutSlice,
  RoomSetPlanFailureDetails,
  RoomSetPlanResultMessage,
  RoomSetPlanResultStatus,
} from "@/lib/room-set/spatial-types";

import { DraftNumberInput } from "./draft-number-input";
import {
  PlannerScenePrototypeCanvas,
  type PlannerSceneSeatingOverlay,
  type PlannerSceneZoomCommand,
} from "./planner-scene-prototype-canvas";

function summarizeApiError(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return fallback;
}

type RoomSetResultPanelMessage = RoomSetPlanResultMessage & {
  footer?: string;
};

type EmbeddedSeatingPanelId =
  | "unassigned"
  | "tables"
  | "groups"
  | "auto-assign"
  | "stats";

type EmbeddedSeatingTable = {
  id: string;
  eventId: string;
  seatingPlanId: string | null;
  name: string;
  capacity: number;
  sortOrder: number;
  assignedCount: number;
  utilizationPercent: number;
  isFull: boolean;
};

type EmbeddedSeatingAttendee = {
  id: string;
  eventId: string;
  eventAttendeeId: string | null;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
};

type EmbeddedSeatingAssignment = {
  id: string;
  eventId: string;
  tableId: string;
  attendeeId: string;
  seatingPlanId: string | null;
  seatIndex: number | null;
  createdAt: string;
};

type EmbeddedSeatingPayload = {
  seatingPlanId: string | null;
  tables: EmbeddedSeatingTable[];
  attendees: EmbeddedSeatingAttendee[];
  assignments: EmbeddedSeatingAssignment[];
};

type EmbeddedSeatingDragData = Readonly<{
  type: "attendee";
  attendeeId: string;
}>;

type EmbeddedSeatingDropData =
  | Readonly<{ type: "chair"; tableId: string; seatIndex: number; occupied: boolean }>
  | Readonly<{ type: "unassigned" }>;

const ROOM_SET_SEATING_PANELS = [
  { id: "unassigned", label: "Unassigned", icon: Armchair },
  { id: "tables", label: "Tables", icon: Table2 },
  { id: "groups", label: "Groups", icon: LayoutGrid },
  { id: "auto-assign", label: "Auto-assign", icon: Sparkles },
  { id: "stats", label: "Stats", icon: Activity },
] as const satisfies readonly {
  id: EmbeddedSeatingPanelId;
  label: string;
  icon: RoomSetComponentIcon;
}[];

function embeddedSeatingAttendeeName(attendee: EmbeddedSeatingAttendee): string {
  return `${attendee.firstName} ${attendee.lastName}`.trim();
}

function embeddedSeatingInitials(attendee: EmbeddedSeatingAttendee): string {
  const firstLedger = attendee.firstName.charAt(0).toUpperCase();
  const lastLedger = attendee.lastName.charAt(0).toUpperCase();
  return `${firstLedger}${lastLedger}` || "–";
}

function isEmbeddedSeatingCanvasObject(object: PlannerSceneObject): boolean {
  return isPlannerSceneSeatingCapableObject(object);
}

function EmbeddedSeatingDraggableAttendeeRow({
  active,
  assignedTableName,
  attendee,
  compact = false,
  onRemove,
  onSelect,
}: Readonly<{
  active: boolean;
  assignedTableName?: string | null;
  attendee: EmbeddedSeatingAttendee;
  compact?: boolean;
  onRemove?: () => void;
  onSelect: () => void;
}>) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    id: `room-set-attendee:${attendee.id}`,
    data: { type: "attendee", attendeeId: attendee.id } satisfies EmbeddedSeatingDragData,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      className={`flex w-full cursor-grab touch-none items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition active:cursor-grabbing ${
        active
          ? "border-cyan-300/55 bg-cyan-300/[0.10] text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
          : "border-white/10 bg-white/[0.045] text-slate-200 hover:border-cyan-200/28 hover:bg-white/[0.075]"
      } ${isDragging ? "opacity-45" : "opacity-100"}`}
      onClick={onSelect}
      onKeyDown={(eventLedger) => {
        if (eventLedger.key === "Enter" || eventLedger.key === " ") {
          eventLedger.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-[10px] font-semibold text-cyan-50">
          {embeddedSeatingInitials(attendee)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-semibold">
            {embeddedSeatingAttendeeName(attendee)}
          </span>
          {!compact ? (
            <span className="block truncate text-[9px] text-slate-500">
              {assignedTableName ?? attendee.company ?? attendee.email ?? "Unassigned"}
            </span>
          ) : null}
        </span>
      </span>
      {onRemove ? (
        <button
          type="button"
          className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:border-rose-200/35 hover:bg-rose-400/[0.12] hover:text-rose-100"
          onPointerDown={(eventLedger) => eventLedger.stopPropagation()}
          onClick={(eventLedger) => {
            eventLedger.stopPropagation();
            onRemove();
          }}
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

function EmbeddedSeatingUnassignedDropZone({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { isOver, setNodeRef } = useDroppable({
    id: "room-set-unassigned-drop",
    data: { type: "unassigned" } satisfies EmbeddedSeatingDropData,
  });

  return (
    <div
      ref={setNodeRef}
      data-room-set-unassigned-drop-target="true"
      className={`min-h-24 rounded-2xl border border-dashed transition ${
        isOver
          ? "border-cyan-200/55 bg-cyan-300/[0.10] shadow-[inset_0_0_18px_rgba(34,211,238,0.10)]"
          : "border-transparent"
      }`}
    >
      {children}
    </div>
  );
}

function EmbeddedSeatingInspectorSeatDropRow({
  attendee,
  chairNumber,
  occupied,
  onRemove,
  pendingAttendee,
  tableId,
  onClick,
}: Readonly<{
  attendee: EmbeddedSeatingAttendee | null;
  chairNumber: number;
  occupied: boolean;
  onRemove?: () => void;
  pendingAttendee: EmbeddedSeatingAttendee | null;
  tableId: string;
  onClick: () => void;
}>) {
  const { isOver, setNodeRef: setDropNodeRef } = useDroppable({
    id: `room-set-inspector-chair:${tableId}:${chairNumber - 1}`,
    data: {
      type: "chair",
      tableId,
      seatIndex: chairNumber - 1,
      occupied,
    } satisfies EmbeddedSeatingDropData,
  });
  const dragDataLedger = attendee
    ? ({ type: "attendee", attendeeId: attendee.id } satisfies EmbeddedSeatingDragData)
    : undefined;
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef: setDragNodeRef,
    transform,
  } = useDraggable({
    id: `room-set-inspector-chair-attendee:${tableId}:${chairNumber - 1}`,
    data: dragDataLedger,
    disabled: !attendee,
  });
  const setNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDropNodeRef(node);
      setDragNodeRef(node);
    },
    [setDragNodeRef, setDropNodeRef],
  );
  const styleLedger = {
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={styleLedger}
      {...(attendee ? listeners : {})}
      {...(attendee ? attributes : {})}
      role="button"
      tabIndex={0}
      data-room-set-chair-drop-target="true"
      className={`flex items-center justify-between gap-2 rounded-xl border px-2 py-1.5 text-left transition ${
        isOver && !occupied
          ? "border-cyan-200/65 bg-cyan-300/[0.14] text-cyan-50 shadow-[inset_0_0_14px_rgba(34,211,238,0.12)]"
          : isOver && occupied
            ? "border-rose-200/45 bg-rose-400/[0.12] text-rose-100"
            : occupied
              ? "border-cyan-200/26 bg-cyan-300/[0.08] text-cyan-50"
              : pendingAttendee
              ? "border-cyan-200/20 bg-white/[0.055] text-slate-200 hover:border-cyan-200/45 hover:bg-cyan-300/[0.08]"
              : "border-white/10 bg-white/[0.035] text-slate-400"
      } ${attendee ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"} ${
        isDragging ? "opacity-45" : "opacity-100"
      }`}
      onClick={onClick}
      onKeyDown={(eventLedger) => {
        if (eventLedger.key === "Enter" || eventLedger.key === " ") {
          eventLedger.preventDefault();
          onClick();
        }
      }}
    >
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold">Chair {chairNumber}</span>
        <span className="block truncate text-[9px] text-slate-400">
          {attendee ? embeddedSeatingAttendeeName(attendee) : "Open"}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="text-[8px] font-semibold uppercase tracking-[0.12em]">
          {occupied ? "Drag" : pendingAttendee ? "Assign" : "Open"}
        </span>
        {attendee && onRemove ? (
          <button
            type="button"
            className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:border-rose-200/35 hover:bg-rose-400/[0.12] hover:text-rose-100"
            onPointerDown={(eventLedger) => eventLedger.stopPropagation()}
            onClick={(eventLedger) => {
              eventLedger.stopPropagation();
              onRemove();
            }}
          >
            Remove
          </button>
        ) : null}
      </span>
    </div>
  );
}

function formatFitStatusCopy(fitStatus: string): string {
  if (fitStatus === "fits") return "Fits room";
  return fitStatus.replaceAll("_", " ");
}

function formatAudienceStyleCopy(
  audienceStyle: string | undefined | null,
  layoutType?: string | null,
  eventIntent?: string | null,
): string {
  const isTheaterLedger = layoutType === "theater";
  const isTownHallLedger = eventIntent === "town_hall";
  if (audienceStyle === "grid") {
    if (isTownHallLedger) return "Center aisle";
    if (isTheaterLedger) return "Classic rows";
    return "Aligned";
  }
  if (audienceStyle === "loose") {
    if (isTownHallLedger || isTheaterLedger) return "Chevron rows";
    return "Staggered";
  }
  if (audienceStyle === "scattered") {
    if (isTheaterLedger) return "Center aisle";
    return layoutType === "reception" ? "Social zones" : "Clusters";
  }
  if (audienceStyle === "arc") return isTheaterLedger ? "Fan seating" : "Arc";
  return "Auto";
}

function defaultFailedResultMessage(mode: "generate" | "apply", debugReason?: string): RoomSetResultPanelMessage {
  if (mode === "apply") {
    return {
      resultStatus: "failed",
      userMessageTitle: "Apply Failed",
      userMessageBody: "We couldn’t safely apply that change to the current layout.",
      adjustments: [],
      suggestions: [],
      footer: "Your layout was not changed.",
      ...(debugReason ? { debugReason } : {}),
    };
  }

  return {
    resultStatus: "failed",
    userMessageTitle: "Generation Failed",
    userMessageBody: "We couldn’t create a safe layout with the current room size and setup.",
    adjustments: [],
    suggestions: [
      "Reduce attendee count",
      "Switch to Compact",
      "Remove one service item",
      "Use a larger room",
    ],
    footer: "Your previous layout was not changed.",
    ...(debugReason ? { debugReason } : {}),
  };
}

function buildAiLayoutValidationSummary(
  requestedCapacity: number,
  placements: readonly RoomSetLayoutPlacement[],
  validationWarnings: readonly string[],
): RoomSetOperationalValidation {
  const appliedSeatCapacity = sumPlatedSeatCapacity(placements);
  const fitStatus =
    appliedSeatCapacity >= requestedCapacity
      ? "fits"
      : appliedSeatCapacity > 0
        ? "partial_fit"
        : "insufficient_space";
  return {
    requestedCapacity,
    plannedSeatCapacity: requestedCapacity,
    appliedSeatCapacity,
    fitStatus,
    densityScore:
      requestedCapacity <= 0 ? null : Math.min(1, appliedSeatCapacity / requestedCapacity),
    circulationScore: null,
    packingExhausted: false,
    requiredPrimaryComponents: 0,
    plannedPrimaryComponents: 0,
    validationWarnings,
    layoutTradeoffs: [],
    operationalRisks: [],
    assumptions: [],
    generationInstructions: [],
  };
}

const SIMULATION_MODE_OPTIONS = [
  "authoring",
  "timeline_scrub",
  "crowd_pulse",
  "stress_paths",
] as const satisfies readonly SimulationModeKind[];

function InspectionMockCards() {
  const rows = [
    {
      tone: "info" as const,
      title: "Overlaps",
      copy: "Heuristic overlap scan not enabled — mocked clear state for now.",
    },
    {
      tone: "warn" as const,
      title: "Exits blocked",
      copy: "Egress QA awaiting real-footprint validation adapters.",
    },
    {
      tone: "info" as const,
      title: "Density",
      copy: "Headcount density cues still keyed off legacy `layouts[].objects`; canvas bridge pending.",
    },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <article
          key={row.title}
          className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-inner shadow-white/80"
        >
          <header className="mb-1 flex items-center gap-2">
            <span
              className={
                row.tone === "warn"
                  ? "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
                  : "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
              }
            >
              {row.tone === "warn" ? "Watch" : "Info"}
            </span>
            <h3 className="text-[13px] font-semibold text-slate-900">{row.title}</h3>
          </header>
          <p className="text-[12px] leading-relaxed text-slate-600">{row.copy}</p>
        </article>
      ))}
    </div>
  );
}

function componentCategoryShortLabel(categoryId: RoomSetComponentCategoryId, title: string): string {
  switch (categoryId) {
    case "registration":
      return "Reg";
    case "safety":
      return "Safety";
    case "walls":
      return "Walls";
    default:
      return title;
  }
}

function componentIconForCategory(categoryId: RoomSetComponentCategoryId): RoomSetComponentIcon {
  switch (categoryId) {
    case "tables":
      return Table2;
    case "seating":
      return Armchair;
    case "stages":
      return Warehouse;
    case "av":
      return Monitor;
    case "registration":
      return DoorClosed;
    case "fnb":
      return Utensils;
    case "lounge":
      return Sofa;
    case "safety":
      return ShieldAlert;
    case "walls":
      return LayoutGrid;
    default:
      return Box;
  }
}

function componentThumbnailToneClass(categoryId: RoomSetComponentCategoryId): string {
  switch (categoryId) {
    case "av":
    case "stages":
      return "border-cyan-200/25 bg-cyan-300/[0.10] text-cyan-100";
    case "safety":
      return "border-amber-200/25 bg-amber-300/[0.10] text-amber-100";
    case "fnb":
      return "border-emerald-200/25 bg-emerald-300/[0.10] text-emerald-100";
    default:
      return "border-white/10 bg-white/[0.065] text-slate-100";
  }
}

function componentDrawerCardDetail(component: RoomSetComponentDefinition): string {
  if (component.capacitySeated > 0) {
    return component.capacitySeated === 1 ? "1 seat" : `${component.capacitySeated} seats`;
  }
  if (component.capacityStaff > 0) {
    return component.capacityStaff === 1
      ? "1 staff position"
      : `${component.capacityStaff} staff positions`;
  }
  if (component.neutralNote) return component.neutralNote;
  return `${component.smart.setupComplexity} setup`;
}

function layoutCheckStatusForValidation(
  validation: RoomSetOperationalValidation | null,
): LayoutCheckStatus {
  if (!validation) {
    return { label: "Needs review", tone: "review", Icon: TriangleAlert };
  }

  if (validation.fitStatus === "fits") {
    const hasWarnings =
      validation.validationWarnings.length > 0 ||
      validation.layoutTradeoffs.length > 0 ||
      validation.operationalRisks.length > 0;
    return hasWarnings
      ? { label: "Needs review", tone: "review", Icon: TriangleAlert }
      : { label: "Ready to apply", tone: "ready", Icon: CircleCheck };
  }

  return { label: "Does not fit", tone: "blocked", Icon: CircleX };
}

function layoutCheckToneClass(tone: LayoutCheckTone): string {
  if (tone === "ready") return "border-emerald-300/45 bg-emerald-400/[0.12] text-emerald-50";
  if (tone === "blocked") return "border-rose-300/45 bg-rose-400/[0.12] text-rose-50";
  return "border-amber-300/45 bg-amber-400/[0.12] text-amber-50";
}

type RoomSetWorkspaceTabId =
  | "select"
  | "room-stats"
  | "operational"
  | "layers"
  | "timeline"
  | "ai-generate"
  | "component-adder";

type RoomSetModeId = "layout" | "seating" | "operational" | "layers" | "timeline";

type RoomSetLayerToggleId =
  | "seating"
  | "av"
  | "fnb"
  | "safety"
  | "staff"
  | "flow";

type RoomSetComponentIcon = typeof Component;

type LayoutCheckTone = "ready" | "review" | "blocked";

type LayoutCheckStatus = {
  label: string;
  tone: LayoutCheckTone;
  Icon: RoomSetComponentIcon;
};

const ROOM_SET_WORKSPACE_TABS: ReadonlyArray<
  Readonly<{ id: RoomSetWorkspaceTabId; label: string; icon: RoomSetComponentIcon }>
> = [
  { id: "component-adder", label: "Components", icon: LayoutGrid },
  { id: "ai-generate", label: "Generate", icon: Sparkles },
];

const ROOM_SET_MODES: ReadonlyArray<
  Readonly<{ id: RoomSetModeId; label: string; icon: typeof LayoutGrid; disabled?: boolean }>
> = [
  { id: "layout", label: "Layout", icon: LayoutGrid },
  { id: "seating", label: "Seating", icon: Sofa },
  { id: "operational", label: "Operation", icon: Activity, disabled: true },
  { id: "layers", label: "Layers", icon: Layers, disabled: true },
  { id: "timeline", label: "Timeline", icon: Clock3, disabled: true },
];

function normalizeRoomSetMode(value: string | null): RoomSetModeId {
  if (
    value === "layout" ||
    value === "seating" ||
    value === "operational" ||
    value === "layers" ||
    value === "timeline"
  ) {
    return value;
  }
  return "layout";
}

function formatRoomSetDate(value: string | null | undefined): string {
  if (!value) return "Date not set";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function formatRoomSetShortDate(value: string | null | undefined): string {
  if (!value) return "Date not set";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed);
}

function formatRoomSetTime(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatRoomSetTimeRange(session: Matrix2Session | null): string {
  if (!session) return "Time not set";
  const start = formatRoomSetTime(session.startTime);
  const end = formatRoomSetTime(session.endTime);
  if (!(start || end)) return "Time not set";
  if (!(start && end)) return start || end;
  return `${start} - ${end}`;
}

function RoomSetModePlaceholderLedger({
  children,
  eyebrow,
  title,
}: Readonly<{
  children: ReactNode;
  eyebrow: string;
  title: string;
}>) {
  return (
    <section className="flex h-full min-h-[540px] items-center justify-center rounded-[1.4rem] border border-white/10 bg-slate-950/85 px-6 text-center shadow-2xl shadow-slate-950/35">
      <div className="max-w-md">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/75">
          {eyebrow}
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">{title}</h2>
        <div className="mt-3 text-sm leading-6 text-slate-300">{children}</div>
      </div>
    </section>
  );
}

const ROOM_SET_DENSITY_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "compact", label: "Compact" },
  { id: "balanced", label: "Balanced" },
  { id: "premium", label: "Premium" },
] as const satisfies ReadonlyArray<Readonly<{ id: RoomSetDensityControl; label: string }>>;

function blankPlannerSceneFromBoundary(
  boundary: RoomSetLayoutBoundary | null | undefined,
): PlannerScene | null {
  if (!boundary) return null;
  if (!(Number.isFinite(boundary.widthLu) && boundary.widthLu > 0)) return null;
  if (!(Number.isFinite(boundary.depthLu) && boundary.depthLu > 0)) return null;
  return plannerSceneFromLayoutPlacements([], {
    widthLu: boundary.widthLu,
    depthLu: boundary.depthLu,
  });
}

function resizePlannerSceneRoomShell(
  scene: PlannerScene,
  boundary: RoomSetLayoutBoundary,
): PlannerScene {
  const roomShell = blankPlannerSceneFromBoundary(boundary)?.roomShell;
  if (!roomShell) return scene;
  return {
    ...scene,
    roomShell,
  };
}

function clampToRoom(value: number, max: number): number {
  return Math.max(0, Math.min(value, Math.max(0, max)));
}

function RoomSetStyleDropdownLedger({
  disabled,
  options,
  value,
  onChange,
}: Readonly<{
  disabled: boolean;
  options: readonly RoomSetLayoutStyleOption[];
  value: RoomSetLayoutStylePreference;
  onChange: (value: RoomSetLayoutStylePreference) => void;
}>) {
  const [openLedger, reviseOpenLedger] = useState(false);
  const selectedOptionLedger =
    options.find((optionLedger) => optionLedger.id === value) ?? options[0] ?? { id: "auto", label: "Auto" };
  const groupsLedger = options.reduce<Array<{ group: string | null; options: RoomSetLayoutStyleOption[] }>>(
    (groups, optionLedger) => {
      const groupLedger = optionLedger.group ?? null;
      const existingLedger = groups.find((row) => row.group === groupLedger);
      if (existingLedger) {
        existingLedger.options.push(optionLedger);
      } else {
        groups.push({ group: groupLedger, options: [optionLedger] });
      }
      return groups;
    },
    [],
  );

  const handleTriggerKeyDownLedger: KeyboardEventHandler<HTMLButtonElement> = (evtLedger) => {
    if (disabled) return;
    if (evtLedger.key === "Enter" || evtLedger.key === " " || evtLedger.key === "ArrowDown") {
      evtLedger.preventDefault();
      reviseOpenLedger(true);
    }
    if (evtLedger.key === "Escape") {
      reviseOpenLedger(false);
    }
  };

  return (
    <div className="relative mt-1">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={openLedger}
        disabled={disabled}
        onClick={() => {
          if (!disabled) reviseOpenLedger((open) => !open);
        }}
        onKeyDown={handleTriggerKeyDownLedger}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left text-[12px] font-semibold text-slate-100 shadow-inner shadow-black/20 outline-none transition backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15 disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-slate-600"
      >
        <span>{selectedOptionLedger.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${openLedger ? "rotate-180" : ""}`} />
      </button>
      {openLedger && !disabled ? (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-[rgba(148,210,255,0.14)] bg-[rgba(8,16,30,0.62)] p-1.5 text-[12px] shadow-xl shadow-slate-950/35 ring-1 ring-white/10 backdrop-blur-[22px] backdrop-saturate-150"
        >
          {groupsLedger.map((groupLedger) => (
            <div key={groupLedger.group ?? "default"}>
              {groupLedger.group ? (
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {groupLedger.group}
                </div>
              ) : null}
              {groupLedger.options.map((optionLedger) => {
                const selectedLedger = optionLedger.id === value;
                return (
                  <button
                    key={`${groupLedger.group ?? "default"}-${optionLedger.id}-${optionLedger.label}`}
                    type="button"
                    role="option"
                    aria-selected={selectedLedger}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-semibold transition ${
                      selectedLedger
                        ? "border border-cyan-200/45 bg-cyan-300/[0.12] text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                        : "border border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                    }`}
                    onClick={() => {
                      onChange(optionLedger.id);
                      reviseOpenLedger(false);
                    }}
                  >
                    {optionLedger.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ROOM_SET_LAYER_TOGGLES: ReadonlyArray<
  Readonly<{ id: RoomSetLayerToggleId; label: string; note: string }>
> = [
  { id: "seating", label: "Seating", note: "Tables, chairs, rows" },
  { id: "av", label: "AV", note: "Screens, stages, FOH" },
  { id: "fnb", label: "F&B", note: "Bars, buffet, service" },
  { id: "safety", label: "Safety/Egress", note: "Egress and accessibility cues" },
  { id: "staff", label: "Staff/Service", note: "Service corridors and work zones" },
  { id: "flow", label: "Flow", note: "Circulation overlays" },
];

const ROOM_SET_TIMELINE_STATE_CONCEPTS = [
  "Setup",
  "Session",
  "Lunch",
  "Reception",
  "Teardown",
] as const;

type RoomSetIntentInterpretation = RoomSetOperationalBrief;

function promptReplacesChairSeatingWithRoundTables(prompt: string): boolean {
  return /\b(?:replace|swap)\b[\s\S]{0,80}\b(?:chairs?|theater\s+rows?|seating\s+rows?)\b[\s\S]{0,80}\b(?:round\s+tables?|banquet\s+tables?|rounds?)\b/i.test(prompt);
}

function roomSetBriefWithRoundTableSeating(
  brief: RoomSetOperationalBrief,
  attendeeCount: number,
): RoomSetOperationalBrief {
  const primaryComponentCapacity = 8;
  const requiredPrimaryComponents = Math.max(1, Math.ceil(attendeeCount / primaryComponentCapacity));
  return {
    ...brief,
    requestedAttendees: attendeeCount,
    attendeeCount,
    capacityStrategy: {
      ...brief.capacityStrategy,
      requestedSeats: attendeeCount,
      seatingStyle: "banquet",
      primaryComponentId: "table-round-60",
      primaryComponentCapacity,
      requiredPrimaryComponents,
      plannedPrimaryComponents: requiredPrimaryComponents,
    },
  };
}

export function RoomSetWorkspace(
  props: Readonly<{ eventId: string; sessionId: string }>,
) {
  const { eventId, sessionId } = props;
  const terminology = useEventTerminology();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const storageHydratedRef = useRef(false);
  const documentLedgerRef = useRef<RoomSetDocumentV1 | null>(null);
  const componentAdderScrollRef = useRef<HTMLDivElement | null>(null);
  const seatingLinkRepairAttemptKeyRef = useRef<string | null>(null);
  const seatingLoadRequestIdRef = useRef(0);

  const [layoutTransferHintLedger, reviseLayoutTransferHintLedger] = useState<
    string | null
  >(null);
  const [matrixSnapshotLedger, reviseMatrixSnapshotLedger] =
    useState<Matrix2Snapshot | null>(null);
  const [sessionLedger, reviseSessionLedger] = useState<Matrix2Session | null>(null);
  const [fetchIssueLedger, reviseFetchIssueLedger] = useState<string | null>(null);
  const [loadingLedger, reviseLoadingLedger] = useState(true);

  const [documentLedger, reviseDocumentLedger] = useState<RoomSetDocumentV1 | null>(
    null,
  );
  const [activeWorkspaceTabLedger, reviseActiveWorkspaceTabLedger] =
    useState<RoomSetWorkspaceTabId>("select");
  const [activeRoomSetModeLedger, reviseActiveRoomSetModeLedger] =
    useState<RoomSetModeId>("layout");
  const [activeSeatingPanelLedger, reviseActiveSeatingPanelLedger] =
    useState<EmbeddedSeatingPanelId>("unassigned");
  const [seatingTablesLedger, reviseSeatingTablesLedger] = useState<
    EmbeddedSeatingTable[]
  >([]);
  const [seatingAttendeesLedger, reviseSeatingAttendeesLedger] = useState<
    EmbeddedSeatingAttendee[]
  >([]);
  const [seatingAssignmentsLedger, reviseSeatingAssignmentsLedger] = useState<
    EmbeddedSeatingAssignment[]
  >([]);
  const [seatingPlanIdLedger, reviseSeatingPlanIdLedger] = useState<string | null>(null);
  const [seatingLoadingLedger, reviseSeatingLoadingLedger] = useState(false);
  const [seatingMutatingLedger, reviseSeatingMutatingLedger] = useState(false);
  const [seatingIssueLedger, reviseSeatingIssueLedger] = useState<string | null>(null);
  const [selectedSeatingObjectIdLedger, reviseSelectedSeatingObjectIdLedger] =
    useState<string | null>(null);
  const [selectedSeatingTableIdLedger, reviseSelectedSeatingTableIdLedger] =
    useState<string | null>(null);
  const [selectedSeatingAttendeeIdLedger, reviseSelectedSeatingAttendeeIdLedger] =
    useState<string | null>(null);
  const [pendingSeatingAttendeeIdLedger, revisePendingSeatingAttendeeIdLedger] =
    useState<string | null>(null);
  const [activeSeatingDragAttendeeIdLedger, reviseActiveSeatingDragAttendeeIdLedger] =
    useState<string | null>(null);
  const [selectedEventIntentLedger, reviseSelectedEventIntentLedger] =
    useState<RoomSetEventIntentId | null>(null);
  const [plannerIntentPromptLedger, revisePlannerIntentPromptLedger] = useState("");
  const [intentInterpretationLedger, reviseIntentInterpretationLedger] =
    useState<RoomSetIntentInterpretation | null>(null);
  const [generationValidationLedger, reviseGenerationValidationLedger] =
    useState<RoomSetOperationalValidation | null>(null);
  /** Latest Generate/Apply result — persists across tabs until session change · next generation · manual clear (not transient). */
  const [, reviseGenerationApplySummaryLedger] =
    useState<RoomSetResultPanelMessage | null>(null);
  const [intentInterpretationBusyLedger, reviseIntentInterpretationBusyLedger] =
    useState(false);
  const [attendeeCountLedger, reviseAttendeeCountLedger] = useState(96);
  const [currentLayoutSpecLedger, reviseCurrentLayoutSpecLedger] = useState<LayoutSpec | null>(
    null,
  );
  const [densityPreferenceLedger, reviseDensityPreferenceLedger] =
    useState<RoomSetDensityControl>("auto");
  const [layoutStylePreferenceLedger, reviseLayoutStylePreferenceLedger] =
    useState<RoomSetLayoutStylePreference>("auto");
  const hasPromptStyleContextLedger = plannerIntentPromptLedger.trim().length > 0;
  const stylePresetIntentLedger = selectedEventIntentLedger;
  const styleControlDisabledLedger = !stylePresetIntentLedger && !hasPromptStyleContextLedger;
  const styleControlLabelLedger = stylePresetIntentLedger ? "Style" : hasPromptStyleContextLedger ? "Style hint" : "Style";
  const layoutStyleOptionsLedger = useMemo(
    () =>
      stylePresetIntentLedger
        ? layoutStyleOptionsForIntent(stylePresetIntentLedger)
        : hasPromptStyleContextLedger
          ? ROOM_SET_PROMPT_STYLE_HINT_OPTIONS
          : ROOM_SET_STYLE_LOCKED_OPTIONS,
    [hasPromptStyleContextLedger, stylePresetIntentLedger],
  );
  const [componentSearchLedger, reviseComponentSearchLedger] = useState("");
  const [activeComponentCategoryLedger, reviseActiveComponentCategoryLedger] =
    useState<RoomSetComponentCategoryId>("tables");
  const [accessibilityPriorityLedger, reviseAccessibilityPriorityLedger] =
    useState(false);
  const [layerToggleLedger, reviseLayerToggleLedger] = useState<
    Record<RoomSetLayerToggleId, boolean>
  >({
    seating: true,
    av: true,
    fnb: true,
    safety: true,
    staff: true,
    flow: true,
  });
  const [gridStrideLuLedger, reviseGridStrideLuLedger] = useState(5);
  const [snapEnabledLedger, reviseSnapEnabledLedger] = useState(true);
  const [prototypeSceneLedger, revisePrototypeSceneLedger] =
    useState<PlannerScene | null>(null);
  const [prototypeFitNonceLedger, pulsePrototypeFitNonceLedger] = useState(0);
  const [prototypeZoomLedger, revisePrototypeZoomLedger] = useState(1);
  const [prototypeZoomCommandLedger, revisePrototypeZoomCommandLedger] =
    useState<PlannerSceneZoomCommand | null>(null);
  const [prototypeSelectionClearNonceLedger, pulsePrototypeSelectionClearNonceLedger] = useState(0);
  const [saveConfirmOpenLedger, reviseSaveConfirmOpenLedger] = useState(false);
  const [roomSizeEditorOpenLedger, reviseRoomSizeEditorOpenLedger] = useState(false);
  const [roomWidthDraftLedger, reviseRoomWidthDraftLedger] = useState("");
  const [roomDepthDraftLedger, reviseRoomDepthDraftLedger] = useState("");
  const [roomSizeIssueLedger, reviseRoomSizeIssueLedger] = useState<string | null>(null);
  const [controlsExpandedLedger, reviseControlsExpandedLedger] = useState(false);
  const controlsAutoCollapsedRefLedger = useRef(false);
  const seatingDragSensorsLedger = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const [playbackRunningLedger, revisePlaybackRunningLedger] = useState(false);
  const [playbackClockMsLedger, revisePlaybackClockMsLedger] = useState(0);

  useEffect(() => {
    const nextModeLedger = normalizeRoomSetMode(searchParams.get("mode"));
    reviseActiveRoomSetModeLedger(nextModeLedger);
    pulsePrototypeSelectionClearNonceLedger((priorLedger) => priorLedger + 1);
    reviseActiveWorkspaceTabLedger("select");
    reviseSelectedSeatingObjectIdLedger(null);
    reviseSelectedSeatingTableIdLedger(null);
    reviseSelectedSeatingAttendeeIdLedger(null);
    reviseActiveSeatingDragAttendeeIdLedger(null);
    reviseActiveSeatingPanelLedger("unassigned");
    reviseControlsExpandedLedger(nextModeLedger === "seating");
  }, [searchParams]);

  const setRoomSetModeLedger = useCallback(
    (nextModeLedger: RoomSetModeId) => {
      const normalizedModeLedger = normalizeRoomSetMode(nextModeLedger);
      pulsePrototypeSelectionClearNonceLedger((priorLedger) => priorLedger + 1);
      reviseActiveWorkspaceTabLedger("select");
      reviseSelectedSeatingObjectIdLedger(null);
      reviseSelectedSeatingTableIdLedger(null);
      reviseSelectedSeatingAttendeeIdLedger(null);
      reviseActiveSeatingDragAttendeeIdLedger(null);
      reviseActiveSeatingPanelLedger("unassigned");
      reviseControlsExpandedLedger(normalizedModeLedger === "seating");
      reviseActiveRoomSetModeLedger(normalizedModeLedger);
      const nextSearchLedger = new URLSearchParams(searchParams.toString());
      if (normalizedModeLedger === "layout") {
        nextSearchLedger.set("mode", "layout");
      } else {
        nextSearchLedger.set("mode", normalizedModeLedger);
      }
      const queryLedger = nextSearchLedger.toString();
      router.replace(`${pathname}${queryLedger ? `?${queryLedger}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handlePrototypeDraftSceneChangeLedger = useCallback((nextSceneLedger: PlannerScene | null) => {
    if (nextSceneLedger) revisePrototypeSceneLedger(nextSceneLedger);
  }, []);

  const issuePrototypeZoomCommandLedger = useCallback(
    (actionLedger: PlannerSceneZoomCommand["action"], zoomLedger?: number) => {
      revisePrototypeZoomCommandLedger((priorLedger) => ({
        nonce: (priorLedger?.nonce ?? 0) + 1,
        action: actionLedger,
        ...(typeof zoomLedger === "number" ? { zoom: zoomLedger } : {}),
      }));
    },
    [],
  );

  const handleWorkspaceTabClickLedger = useCallback(
    (tabIdLedger: RoomSetWorkspaceTabId) => {
      pulsePrototypeSelectionClearNonceLedger((priorLedger) => priorLedger + 1);
      if (tabIdLedger === "select") {
        reviseActiveWorkspaceTabLedger("select");
        reviseControlsExpandedLedger(false);
        return;
      }

      const panelAlreadyOpenLedger =
        activeWorkspaceTabLedger === tabIdLedger && controlsExpandedLedger;
      reviseActiveWorkspaceTabLedger(panelAlreadyOpenLedger ? "select" : tabIdLedger);
      reviseControlsExpandedLedger(!panelAlreadyOpenLedger);
    },
    [activeWorkspaceTabLedger, controlsExpandedLedger],
  );

  const handlePrimaryToolClickLedger = useCallback(
    (tabIdLedger: RoomSetWorkspaceTabId) => {
      pulsePrototypeSelectionClearNonceLedger((priorLedger) => priorLedger + 1);
      const panelAlreadyOpenLedger =
        activeRoomSetModeLedger === "layout" &&
        activeWorkspaceTabLedger === tabIdLedger &&
        controlsExpandedLedger;

      if (activeRoomSetModeLedger !== "layout") {
        reviseActiveRoomSetModeLedger("layout");
        reviseSelectedSeatingObjectIdLedger(null);
        reviseSelectedSeatingTableIdLedger(null);
        reviseSelectedSeatingAttendeeIdLedger(null);
        reviseActiveSeatingDragAttendeeIdLedger(null);
        reviseActiveSeatingPanelLedger("unassigned");

        const nextSearchLedger = new URLSearchParams(searchParams.toString());
        nextSearchLedger.set("mode", "layout");
        const queryLedger = nextSearchLedger.toString();
        router.replace(`${pathname}${queryLedger ? `?${queryLedger}` : ""}`, { scroll: false });
      }

      reviseActiveWorkspaceTabLedger(panelAlreadyOpenLedger ? "select" : tabIdLedger);
      reviseControlsExpandedLedger(!panelAlreadyOpenLedger);
    },
    [
      activeRoomSetModeLedger,
      activeWorkspaceTabLedger,
      controlsExpandedLedger,
      pathname,
      router,
      searchParams,
    ],
  );

  const handleRoomSetSessionChangeLedger = useCallback(
    (nextSessionIdLedger: string) => {
      if (!nextSessionIdLedger || nextSessionIdLedger === sessionId) return;
      router.push(
        roomSetHref(
          eventId,
          nextSessionIdLedger,
          activeRoomSetModeLedger === "seating" ? "seating" : "layout",
        ),
      );
    },
    [activeRoomSetModeLedger, eventId, router, sessionId],
  );

  const closeOpenSidePanelLedger = useCallback(() => {
    if (activeRoomSetModeLedger === "layout" && activeWorkspaceTabLedger !== "select") {
      reviseActiveWorkspaceTabLedger("select");
      reviseControlsExpandedLedger(false);
      return true;
    }

    if (activeRoomSetModeLedger === "seating" && controlsExpandedLedger) {
      reviseControlsExpandedLedger(false);
      return true;
    }

    return false;
  }, [activeRoomSetModeLedger, activeWorkspaceTabLedger, controlsExpandedLedger]);

  const handleRoomSetKeyDownLedger: KeyboardEventHandler<HTMLDivElement> = useCallback(
    (eventLedger) => {
      if (eventLedger.key !== "Escape") return;
      if (!closeOpenSidePanelLedger()) return;
      eventLedger.preventDefault();
      eventLedger.stopPropagation();
    },
    [closeOpenSidePanelLedger],
  );

  const loadEmbeddedSeatingLedger = useCallback(async (): Promise<void> => {
    const requestIdLedger = seatingLoadRequestIdRef.current + 1;
    seatingLoadRequestIdRef.current = requestIdLedger;
    reviseSeatingLoadingLedger(true);
    reviseSeatingIssueLedger(null);
    reviseSeatingPlanIdLedger(null);
    reviseSeatingTablesLedger([]);
    reviseSeatingAttendeesLedger([]);
    reviseSeatingAssignmentsLedger([]);
    reviseSelectedSeatingObjectIdLedger(null);
    reviseSelectedSeatingTableIdLedger(null);
    reviseSelectedSeatingAttendeeIdLedger(null);
    revisePendingSeatingAttendeeIdLedger(null);
    reviseActiveSeatingDragAttendeeIdLedger(null);
    try {
      const responseLedger = await fetch(
        `/api/events/${eventId}/seating?matrixRowId=${encodeURIComponent(sessionId)}`,
      );
      const payloadLedger = await responseLedger.json();
      if (seatingLoadRequestIdRef.current !== requestIdLedger) return;
      if (!responseLedger.ok) {
        throw new Error(summarizeApiError(payloadLedger, "Failed to load seating"));
      }
      const seatingPayloadLedger = payloadLedger as EmbeddedSeatingPayload;
      reviseSeatingPlanIdLedger(seatingPayloadLedger.seatingPlanId ?? null);
      reviseSeatingTablesLedger(seatingPayloadLedger.tables ?? []);
      reviseSeatingAttendeesLedger(seatingPayloadLedger.attendees ?? []);
      reviseSeatingAssignmentsLedger(seatingPayloadLedger.assignments ?? []);
    } catch (errorLedger) {
      if (seatingLoadRequestIdRef.current !== requestIdLedger) return;
      reviseSeatingIssueLedger(
        errorLedger instanceof Error ? errorLedger.message : "Failed to load seating",
      );
    } finally {
      if (seatingLoadRequestIdRef.current === requestIdLedger) {
        reviseSeatingLoadingLedger(false);
      }
    }
  }, [eventId, sessionId]);

  useEffect(() => {
    if (activeRoomSetModeLedger !== "seating") return;
    void loadEmbeddedSeatingLedger();
  }, [activeRoomSetModeLedger, loadEmbeddedSeatingLedger]);

  useEffect(() => {
    if (styleControlDisabledLedger) {
      if (layoutStylePreferenceLedger !== "auto") reviseLayoutStylePreferenceLedger("auto");
      return;
    }
    if (layoutStyleOptionsLedger.some((optionLedger) => optionLedger.id === layoutStylePreferenceLedger)) {
      return;
    }
    reviseLayoutStylePreferenceLedger("auto");
  }, [layoutStyleOptionsLedger, layoutStylePreferenceLedger, styleControlDisabledLedger]);

  useEffect(() => {
    let aliveHost = true;
    async function runHost() {
      reviseLoadingLedger(true);
      reviseFetchIssueLedger(null);
      try {
        const responseLedger = await fetch(
          `/api/events/${eventId}/matrix-2?source=room-set-prototype`,
        );
        const payloadLedger = await responseLedger.json();
        if (!responseLedger.ok)
          throw new Error(summarizeApiError(payloadLedger, `${terminology.matrix} unavailable`));
        const snapshotLedger = payloadLedger as Matrix2Snapshot;
        const scopedLedger =
          snapshotLedger.sessions.find((rowLedger) => rowLedger.id === sessionId) ??
          null;
        if (!aliveHost) return;
        reviseMatrixSnapshotLedger(snapshotLedger);
        reviseSessionLedger(scopedLedger);
        if (!scopedLedger) reviseFetchIssueLedger("Session linkage missing");
      } catch (errorLedger) {
        if (aliveHost)
          reviseFetchIssueLedger(
            errorLedger instanceof Error ? errorLedger.message : `${terminology.matrix} load failure`,
          );
      } finally {
        if (aliveHost) reviseLoadingLedger(false);
      }
    }
    void runHost();
    return () => {
      aliveHost = false;
    };
  }, [eventId, sessionId, terminology.matrix]);

  useEffect(() => {
    seatingLoadRequestIdRef.current += 1;
    seatingLinkRepairAttemptKeyRef.current = null;
    storageHydratedRef.current = false;
    reviseDocumentLedger(null);
    reviseGenerationApplySummaryLedger(null);
    reviseSelectedEventIntentLedger(null);
    reviseAttendeeCountLedger(96);
    reviseCurrentLayoutSpecLedger(null);
    revisePrototypeSceneLedger(null);
    reviseSeatingPlanIdLedger(null);
    reviseSeatingTablesLedger([]);
    reviseSeatingAttendeesLedger([]);
    reviseSeatingAssignmentsLedger([]);
    reviseSeatingIssueLedger(null);
    reviseSeatingLoadingLedger(false);
    reviseSeatingMutatingLedger(false);
    reviseSelectedSeatingObjectIdLedger(null);
    reviseSelectedSeatingTableIdLedger(null);
    reviseSelectedSeatingAttendeeIdLedger(null);
    revisePendingSeatingAttendeeIdLedger(null);
    reviseActiveSeatingDragAttendeeIdLedger(null);
    reviseActiveSeatingPanelLedger("unassigned");
    pulsePrototypeSelectionClearNonceLedger((priorLedger) => priorLedger + 1);
    reviseActiveWorkspaceTabLedger("select");
    controlsAutoCollapsedRefLedger.current = false;
    reviseControlsExpandedLedger(false);
  }, [eventId, sessionId]);

  useEffect(() => {
    if (!sessionLedger || storageHydratedRef.current) return;
    const loaded = loadRoomSetDocument(eventId, sessionId);
    const hasLocalDraft = loaded != null;
    const seeded = loaded ?? createInitialDocument(sessionLedger.roomName ?? "Space");
    const nextDocumentLedger = ensureOperationalProgram(seeded, sessionLedger.roomName ?? "Space");
    const recoveredLayoutSpecLedger =
      nextDocumentLedger.layoutSpecs?.[nextDocumentLedger.activeLayoutId] ?? null;
    reviseDocumentLedger(nextDocumentLedger);
    reviseCurrentLayoutSpecLedger(recoveredLayoutSpecLedger);

    const initialStateLedger = resolvePrototypeRoomSetInitialState({
      session: sessionLedger,
      hasLocalDraft,
      recoveredLayoutSpec: recoveredLayoutSpecLedger,
    });
    if (initialStateLedger.attendeeCount !== null) {
      reviseAttendeeCountLedger(initialStateLedger.attendeeCount);
    }
    if (initialStateLedger.selectedEventIntent !== null) {
      reviseSelectedEventIntentLedger(initialStateLedger.selectedEventIntent);
    }
    storageHydratedRef.current = true;
  }, [eventId, sessionId, sessionLedger]);

  useEffect(() => {
    if (!playbackRunningLedger || documentLedger?.operational == null) return;
    const speed = Math.max(
      0.25,
      documentLedger.operational.simulation.speedMultiplier || 1,
    );
    const tick = window.setInterval(() => {
      revisePlaybackClockMsLedger((ms) => ms + 55 * speed);
    }, 55);
    return () => window.clearInterval(tick);
  }, [playbackRunningLedger, documentLedger?.operational]);

  documentLedgerRef.current = documentLedger;

  const activeSliceLedger = documentLedger?.layouts[documentLedger.activeLayoutId] ?? null;
  useEffect(() => {
    if (!activeSliceLedger || roomSizeEditorOpenLedger) return;
    reviseRoomWidthDraftLedger(String(Math.round(activeSliceLedger.boundary.widthLu)));
    reviseRoomDepthDraftLedger(String(Math.round(activeSliceLedger.boundary.depthLu)));
    reviseRoomSizeIssueLedger(null);
  }, [
    activeSliceLedger?.boundary.depthLu,
    activeSliceLedger?.boundary.widthLu,
    roomSizeEditorOpenLedger,
  ]);

  const operationalProgramLedger = documentLedger?.operational;
  const visibleComponentsLedger = useMemo(
    () => searchRoomSetComponents(componentSearchLedger),
    [componentSearchLedger],
  );
  const visibleComponentGroupsLedger = useMemo(
    () => groupRoomSetComponentsByCategory(visibleComponentsLedger),
    [visibleComponentsLedger],
  );
  const searchingComponentsLedger = componentSearchLedger.trim().length > 0;
  const displayedComponentsLedger = searchingComponentsLedger
    ? visibleComponentsLedger
    : visibleComponentGroupsLedger.get(activeComponentCategoryLedger) ?? [];
  const activeComponentCategoryMetaLedger =
    ROOM_SET_COMPONENT_CATEGORIES.find(
      (categoryLedger) => categoryLedger.id === activeComponentCategoryLedger,
    ) ?? ROOM_SET_COMPONENT_CATEGORIES[0];

  const playbackPlanLedger = useMemo(
    () =>
      operationalProgramLedger ? buildOperationalPlaybackPlan(operationalProgramLedger) : [],
    [operationalProgramLedger],
  );

  const playbackMomentLedger = useMemo(
    () => resolvePlaybackMoment(playbackPlanLedger, playbackClockMsLedger),
    [playbackPlanLedger, playbackClockMsLedger],
  );

  const playbackCommentaryLedger = useMemo(() => {
    if (!(playbackMomentLedger && operationalProgramLedger)) return [];
    const seg = playbackMomentLedger.segment;

    let fromPreset: OperationalPhasePreset | undefined;
    let toPreset: OperationalPhasePreset | undefined;
    let feasibility: "green" | "amber" | "blocked" | undefined;

    if (seg.kind === "edge") {
      const fromState = operationalProgramLedger.states[seg.transition.fromStateId];
      const toState = operationalProgramLedger.states[seg.transition.toStateId];
      fromPreset = fromState?.preset;
      toPreset = toState?.preset;
      feasibility = seg.transition.feasibility;
    } else {
      const st = operationalProgramLedger.states[seg.stateId];
      fromPreset = st?.preset;
    }

    return buildOperationalPlaybackCommentary({
      segment: seg,
      fromPreset,
      toPreset,
      feasibility,
      durationPlannerMinutes:
        seg.kind === "edge" ? seg.transition.durationMinutes : undefined,
      overlaysActive: operationalProgramLedger.overlays,
      motionPhase01: (playbackMomentLedger.absoluteMs % 4800) / 4800,
      localProgress01: playbackMomentLedger.localProgress01,
      presetDwell: seg.kind === "dwell" ? operationalProgramLedger.states[seg.stateId]?.preset : undefined,
    });
  }, [playbackMomentLedger, operationalProgramLedger]);

  const activeOperationalDefLedger = useMemo(() => {
    if (!operationalProgramLedger?.activeStateId) return null;
    return operationalProgramLedger.states[operationalProgramLedger.activeStateId] ?? null;
  }, [operationalProgramLedger]);

  const staffingFromActiveStateLedger =
    activeOperationalDefLedger?.staffing ?? staffingForOperationalPreset("doors_open");

  const seatingAssignmentByAttendeeIdLedger = useMemo(() => {
    const mapLedger = new Map<string, EmbeddedSeatingAssignment>();
    for (const assignmentLedger of seatingAssignmentsLedger) {
      mapLedger.set(assignmentLedger.attendeeId, assignmentLedger);
    }
    return mapLedger;
  }, [seatingAssignmentsLedger]);

  const seatingAssignmentsByTableIdLedger = useMemo(() => {
    const mapLedger = new Map<string, EmbeddedSeatingAssignment[]>();
    for (const assignmentLedger of seatingAssignmentsLedger) {
      const nextLedger = mapLedger.get(assignmentLedger.tableId) ?? [];
      nextLedger.push(assignmentLedger);
      mapLedger.set(assignmentLedger.tableId, nextLedger);
    }
    return mapLedger;
  }, [seatingAssignmentsLedger]);

  const seatingTableByIdLedger = useMemo(() => {
    const mapLedger = new Map<string, EmbeddedSeatingTable>();
    for (const tableLedger of seatingTablesLedger) {
      mapLedger.set(tableLedger.id, tableLedger);
    }
    return mapLedger;
  }, [seatingTablesLedger]);

  useEffect(() => {
    if (!selectedSeatingTableIdLedger) return;
    if (seatingTableByIdLedger.has(selectedSeatingTableIdLedger)) return;
    reviseSelectedSeatingTableIdLedger(null);
    reviseSelectedSeatingObjectIdLedger(null);
  }, [seatingTableByIdLedger, selectedSeatingTableIdLedger]);

  const seatingAttendeeByIdLedger = useMemo(() => {
    const mapLedger = new Map<string, EmbeddedSeatingAttendee>();
    for (const attendeeLedger of seatingAttendeesLedger) {
      mapLedger.set(attendeeLedger.id, attendeeLedger);
    }
    return mapLedger;
  }, [seatingAttendeesLedger]);

  const unassignedSeatingAttendeesLedger = useMemo(
    () =>
      seatingAttendeesLedger.filter(
        (attendeeLedger) => !seatingAssignmentByAttendeeIdLedger.has(attendeeLedger.id),
      ),
    [seatingAssignmentByAttendeeIdLedger, seatingAttendeesLedger],
  );

  const seatingCanvasObjectsLedger = useMemo(
    () => prototypeSceneLedger?.objects.filter(isEmbeddedSeatingCanvasObject) ?? [],
    [prototypeSceneLedger],
  );

  const seatingCanvasObjectLinksLedger = useMemo(
    () => resolvePlannerSceneSeatingObjectLinks(seatingCanvasObjectsLedger, seatingTableByIdLedger),
    [seatingCanvasObjectsLedger, seatingTableByIdLedger],
  );

  const seatingObjectIdByTableIdLedger = useMemo(() => {
    const mapLedger = new Map<string, string>();
    for (const linkLedger of seatingCanvasObjectLinksLedger) {
      mapLedger.set(linkLedger.seatingTable.id, linkLedger.object.id);
    }
    return mapLedger;
  }, [seatingCanvasObjectLinksLedger]);

  const seatingOverlayByObjectIdLedger = useMemo(() => {
    return buildPlannerSceneSeatingOverlayRecords(
      seatingCanvasObjectsLedger,
      seatingTablesLedger,
      seatingAssignmentsLedger,
      seatingAttendeesLedger,
    ) satisfies Record<string, PlannerSceneSeatingOverlay>;
  }, [
    seatingCanvasObjectsLedger,
    seatingTablesLedger,
    seatingAssignmentsLedger,
    seatingAttendeesLedger,
  ]);

  useEffect(() => {
    if (activeRoomSetModeLedger !== "seating") return;
    if (seatingLoadingLedger) return;
    if (!(prototypeSceneLedger && documentLedger && seatingPlanIdLedger)) return;
    if (seatingTablesLedger.length === 0 || seatingCanvasObjectsLedger.length === 0) return;

    const repairAttemptKeyLedger = [
      documentLedger.activeLayoutId,
      seatingPlanIdLedger,
      seatingTablesLedger.map((tableLedger) => tableLedger.id).join(","),
      seatingAssignmentsLedger
        .map(
          (assignmentLedger) =>
            `${assignmentLedger.tableId}:${assignmentLedger.attendeeId}:${assignmentLedger.seatIndex ?? ""}`,
        )
        .join(","),
      seatingCanvasObjectsLedger
        .map(
          (objectLedger) =>
            `${objectLedger.id}:${objectLedger.metadata.seatingTableId ?? ""}:${objectLedger.metadata.seatingPlanId ?? ""}`,
        )
        .join(","),
    ].join("|");
    if (seatingLinkRepairAttemptKeyRef.current === repairAttemptKeyLedger) return;
    seatingLinkRepairAttemptKeyRef.current = repairAttemptKeyLedger;

    const repairLedger = repairPlannerSceneSeatingTableLinks({
      objects: prototypeSceneLedger.objects,
      seatingTables: seatingTablesLedger,
      assignments: seatingAssignmentsLedger,
      activeSeatingPlanId: seatingPlanIdLedger,
    });

    if (!repairLedger.changed) {
      if (
        repairLedger.skippedReason === "assignments_present" &&
        seatingCanvasObjectLinksLedger.length === 0
      ) {
        reviseSeatingIssueLedger(
          "This room layout has unlinked seating objects and existing assignments, so Planner Dash will not guess table links.",
        );
      }
      return;
    }

    const nextSceneLedger = {
      ...prototypeSceneLedger,
      objects: repairLedger.objects,
    };
    const nextDocumentLedger = rebuildOperationalTransitions({
      ...documentLedger,
      plannerScenes: {
        ...(documentLedger.plannerScenes ?? {}),
        [documentLedger.activeLayoutId]: nextSceneLedger,
      },
    });
    revisePrototypeSceneLedger(nextSceneLedger);
    reviseDocumentLedger(nextDocumentLedger);
    documentLedgerRef.current = nextDocumentLedger;
    const persistedLedger = persistRoomSetDocument(eventId, sessionId, nextDocumentLedger);
    if (!persistedLedger) {
      reviseSeatingIssueLedger(
        "Linked session seating tables for this layout, but browser storage blocked saving the repair.",
      );
      return;
    }
    if (repairLedger.linkedCount > 0) {
      reviseSeatingIssueLedger(null);
    }
  }, [
    activeRoomSetModeLedger,
    documentLedger,
    eventId,
    prototypeSceneLedger,
    seatingAssignmentsLedger,
    seatingCanvasObjectLinksLedger.length,
    seatingCanvasObjectsLedger,
    seatingLoadingLedger,
    seatingPlanIdLedger,
    seatingTablesLedger,
    sessionId,
  ]);

  const selectedSeatingTableLedger = selectedSeatingTableIdLedger
    ? seatingTableByIdLedger.get(selectedSeatingTableIdLedger) ?? null
    : null;
  const selectedSeatingAttendeeLedger = selectedSeatingAttendeeIdLedger
    ? seatingAttendeeByIdLedger.get(selectedSeatingAttendeeIdLedger) ?? null
    : null;
  const pendingSeatingAttendeeLedger = pendingSeatingAttendeeIdLedger
    ? seatingAttendeeByIdLedger.get(pendingSeatingAttendeeIdLedger) ?? null
    : null;
  const activeSeatingDragAttendeeLedger = activeSeatingDragAttendeeIdLedger
    ? seatingAttendeeByIdLedger.get(activeSeatingDragAttendeeIdLedger) ?? null
    : null;
  const assignedAttendeesForSelectedSeatingTableLedger = useMemo(() => {
    if (!selectedSeatingTableLedger) return [];
    return (seatingAssignmentsByTableIdLedger.get(selectedSeatingTableLedger.id) ?? [])
      .map((assignmentLedger) => seatingAttendeeByIdLedger.get(assignmentLedger.attendeeId))
      .filter((attendeeLedger): attendeeLedger is EmbeddedSeatingAttendee => Boolean(attendeeLedger));
  }, [seatingAssignmentsByTableIdLedger, seatingAttendeeByIdLedger, selectedSeatingTableLedger]);

  const seatingGroupSummariesLedger = useMemo(() => {
    const groupMapLedger = new Map<string, { total: number; assigned: number }>();
    for (const attendeeLedger of seatingAttendeesLedger) {
      const groupNameLedger = attendeeLedger.company?.trim() || "No company";
      const priorLedger = groupMapLedger.get(groupNameLedger) ?? { total: 0, assigned: 0 };
      groupMapLedger.set(groupNameLedger, {
        total: priorLedger.total + 1,
        assigned:
          priorLedger.assigned +
          (seatingAssignmentByAttendeeIdLedger.has(attendeeLedger.id) ? 1 : 0),
      });
    }
    return [...groupMapLedger.entries()]
      .map(([nameLedger, summaryLedger]) => ({ name: nameLedger, ...summaryLedger }))
      .sort((aLedger, bLedger) => bLedger.total - aLedger.total || aLedger.name.localeCompare(bLedger.name));
  }, [seatingAssignmentByAttendeeIdLedger, seatingAttendeesLedger]);

  function embeddedSeatingTableAssignedCount(tableIdLedger: string): number {
    return seatingAssignmentsByTableIdLedger.get(tableIdLedger)?.length ?? 0;
  }

  function embeddedSeatingTableIsFull(tableIdLedger: string, attendeeIdLedger?: string): boolean {
    const tableLedger = seatingTableByIdLedger.get(tableIdLedger);
    if (!tableLedger) return true;
    const currentAssignmentLedger = attendeeIdLedger
      ? seatingAssignmentByAttendeeIdLedger.get(attendeeIdLedger)
      : null;
    if (currentAssignmentLedger?.tableId === tableIdLedger) return false;
    return embeddedSeatingTableAssignedCount(tableIdLedger) >= tableLedger.capacity;
  }

  const optimisticAssignEmbeddedSeatingLedger = useCallback(
    async (attendeeIdLedger: string, tableIdLedger: string, seatIndexLedger: number | null = null): Promise<void> => {
      if (!seatingTableByIdLedger.has(tableIdLedger)) {
        reviseSeatingIssueLedger("No session seating table is linked to that room object yet.");
        return;
      }
      if (embeddedSeatingTableIsFull(tableIdLedger, attendeeIdLedger)) {
        reviseSeatingIssueLedger("That table is at capacity.");
        return;
      }
      if (
        seatIndexLedger != null &&
        seatingAssignmentsLedger.some(
          (assignmentLedger) =>
            assignmentLedger.tableId === tableIdLedger &&
            assignmentLedger.seatIndex === seatIndexLedger &&
            assignmentLedger.attendeeId !== attendeeIdLedger,
        )
      ) {
        reviseSeatingIssueLedger(`Chair ${seatIndexLedger + 1} is already occupied.`);
        return;
      }

      const previousAssignmentsLedger = seatingAssignmentsLedger;
      const existingLedger = previousAssignmentsLedger.find(
        (assignmentLedger) => assignmentLedger.attendeeId === attendeeIdLedger,
      );
      reviseSeatingAssignmentsLedger((currentLedger) => [
        ...currentLedger.filter((assignmentLedger) => assignmentLedger.attendeeId !== attendeeIdLedger),
        {
          id: existingLedger?.id ?? `temp-${attendeeIdLedger}`,
          eventId,
          tableId: tableIdLedger,
          attendeeId: attendeeIdLedger,
          seatingPlanId: seatingPlanIdLedger,
          seatIndex: seatIndexLedger,
          createdAt: existingLedger?.createdAt ?? new Date().toISOString(),
        },
      ]);
      reviseSeatingIssueLedger(null);
      reviseSeatingMutatingLedger(true);

      try {
        const responseLedger = await fetch(`/api/events/${eventId}/seating/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attendeeId: attendeeIdLedger,
            tableId: tableIdLedger,
            matrixRowId: sessionId,
            ...(seatingPlanIdLedger ? { seatingPlanId: seatingPlanIdLedger } : {}),
            requireScopedContext: true,
            ...(seatIndexLedger == null ? {} : { seatIndex: seatIndexLedger }),
          }),
        });
        const payloadLedger = await responseLedger.json();
        if (!responseLedger.ok) {
          throw new Error(summarizeApiError(payloadLedger, "Failed to assign attendee"));
        }
        reviseSeatingAssignmentsLedger((currentLedger) => [
          ...currentLedger.filter((assignmentLedger) => assignmentLedger.attendeeId !== attendeeIdLedger),
          payloadLedger as EmbeddedSeatingAssignment,
        ]);
        revisePendingSeatingAttendeeIdLedger(null);
      } catch (errorLedger) {
        reviseSeatingAssignmentsLedger(previousAssignmentsLedger);
        reviseSeatingIssueLedger(
          errorLedger instanceof Error ? errorLedger.message : "Failed to assign attendee",
        );
      } finally {
        reviseSeatingMutatingLedger(false);
      }
    },
    [
      embeddedSeatingTableIsFull,
      eventId,
      seatingPlanIdLedger,
      seatingAssignmentsLedger,
      seatingTableByIdLedger,
      sessionId,
    ],
  );

  const optimisticUnassignEmbeddedSeatingLedger = useCallback(
    async (attendeeIdLedger: string): Promise<void> => {
      const previousAssignmentsLedger = seatingAssignmentsLedger;
      reviseSeatingAssignmentsLedger((currentLedger) =>
        currentLedger.filter((assignmentLedger) => assignmentLedger.attendeeId !== attendeeIdLedger),
      );
      reviseSeatingIssueLedger(null);
      reviseSeatingMutatingLedger(true);
      try {
        const responseLedger = await fetch(`/api/events/${eventId}/seating/unassign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attendeeId: attendeeIdLedger,
            matrixRowId: sessionId,
            ...(seatingPlanIdLedger ? { seatingPlanId: seatingPlanIdLedger } : {}),
            requireScopedContext: true,
          }),
        });
        const payloadLedger = await responseLedger.json();
        if (!responseLedger.ok) {
          throw new Error(summarizeApiError(payloadLedger, "Failed to unassign attendee"));
        }
      } catch (errorLedger) {
        reviseSeatingAssignmentsLedger(previousAssignmentsLedger);
        reviseSeatingIssueLedger(
          errorLedger instanceof Error ? errorLedger.message : "Failed to unassign attendee",
        );
      } finally {
        reviseSeatingMutatingLedger(false);
      }
    },
    [eventId, seatingAssignmentsLedger, seatingPlanIdLedger, sessionId],
  );

  const handleSeatingDragStartLedger = useCallback((eventLedger: DragStartEvent) => {
    const dragDataLedger = eventLedger.active.data.current as EmbeddedSeatingDragData | undefined;
    reviseActiveSeatingDragAttendeeIdLedger(
      dragDataLedger?.type === "attendee" ? dragDataLedger.attendeeId : null,
    );
  }, []);

  const handleSeatingDragEndLedger = useCallback(
    async (eventLedger: DragEndEvent): Promise<void> => {
      reviseActiveSeatingDragAttendeeIdLedger(null);
      const dragDataLedger = eventLedger.active.data.current as EmbeddedSeatingDragData | undefined;
      const dropDataLedger = eventLedger.over?.data.current as EmbeddedSeatingDropData | undefined;
      if (dragDataLedger?.type !== "attendee" || !dropDataLedger) return;

      const attendeeIdLedger = dragDataLedger.attendeeId;
      revisePendingSeatingAttendeeIdLedger(attendeeIdLedger);

      if (dropDataLedger.type === "unassigned") {
        if (!seatingAssignmentByAttendeeIdLedger.has(attendeeIdLedger)) return;
        await optimisticUnassignEmbeddedSeatingLedger(attendeeIdLedger);
        reviseSelectedSeatingAttendeeIdLedger(null);
        revisePendingSeatingAttendeeIdLedger(null);
        return;
      }

      const tableLedger = seatingTableByIdLedger.get(dropDataLedger.tableId);
      if (!tableLedger) {
        reviseSeatingIssueLedger("No session seating table is linked to that room object yet.");
        return;
      }
      reviseSelectedSeatingTableIdLedger(tableLedger.id);
      reviseSelectedSeatingObjectIdLedger(seatingObjectIdByTableIdLedger.get(tableLedger.id) ?? null);
      reviseSelectedSeatingAttendeeIdLedger(null);
      if (dropDataLedger.occupied) {
        reviseSeatingIssueLedger(`Chair ${dropDataLedger.seatIndex + 1} is already occupied.`);
        return;
      }

      await optimisticAssignEmbeddedSeatingLedger(
        attendeeIdLedger,
        dropDataLedger.tableId,
        dropDataLedger.seatIndex,
      );
      reviseSelectedSeatingTableIdLedger(tableLedger.id);
      reviseSelectedSeatingObjectIdLedger(seatingObjectIdByTableIdLedger.get(tableLedger.id) ?? null);
      reviseSelectedSeatingAttendeeIdLedger(null);
    },
    [
      optimisticAssignEmbeddedSeatingLedger,
      optimisticUnassignEmbeddedSeatingLedger,
      seatingAssignmentByAttendeeIdLedger,
      seatingObjectIdByTableIdLedger,
      seatingTableByIdLedger,
    ],
  );

  const handleSeatingCanvasObjectSelectLedger = useCallback(
    (
      objectLedger: PlannerSceneObject | null,
      overlayLedger: PlannerSceneSeatingOverlay | null,
      seatIndexLedger: number | null,
    ) => {
      if (!(objectLedger && overlayLedger)) {
        reviseSelectedSeatingObjectIdLedger(null);
        reviseSelectedSeatingTableIdLedger(null);
        reviseSelectedSeatingAttendeeIdLedger(null);
        return;
      }
      reviseSelectedSeatingObjectIdLedger(objectLedger.id);
      reviseSelectedSeatingAttendeeIdLedger(null);
      const tableLedger = seatingTableByIdLedger.get(overlayLedger.tableId) ?? null;
      reviseSelectedSeatingTableIdLedger(tableLedger?.id ?? null);
      if (pendingSeatingAttendeeIdLedger && tableLedger && seatIndexLedger != null) {
        void optimisticAssignEmbeddedSeatingLedger(pendingSeatingAttendeeIdLedger, tableLedger.id, seatIndexLedger);
      } else if (pendingSeatingAttendeeIdLedger && tableLedger) {
        reviseSeatingIssueLedger("Click a specific open chair to assign the staged attendee.");
      } else if (!tableLedger) {
        reviseSeatingIssueLedger("This room object has no linked session seating table yet.");
      }
    },
    [optimisticAssignEmbeddedSeatingLedger, pendingSeatingAttendeeIdLedger, seatingTableByIdLedger],
  );

  useEffect(() => {
    const hasLayoutLedger =
      Boolean(currentLayoutSpecLedger) || (prototypeSceneLedger?.objects.length ?? 0) > 0;
    if (activeWorkspaceTabLedger === "component-adder") return;
    if (!(hasLayoutLedger && !controlsAutoCollapsedRefLedger.current)) return;
    controlsAutoCollapsedRefLedger.current = true;
    reviseControlsExpandedLedger(false);
  }, [activeWorkspaceTabLedger, currentLayoutSpecLedger, prototypeSceneLedger]);

  const hydratePrototypeSceneFromDocument = useCallback(
    (documentLedgerHost: RoomSetDocumentV1 | null): PlannerScene | null => {
      if (!documentLedgerHost) {
        revisePrototypeSceneLedger(null);
        return null;
      }
      const rawPlannerSceneLedger =
        documentLedgerHost.plannerScenes?.[documentLedgerHost.activeLayoutId];
      const parsedPlannerSceneLedger = rawPlannerSceneLedger
        ? parsePlannerSceneJson(JSON.stringify(rawPlannerSceneLedger))
        : null;
      const nextSceneLedger = parsedPlannerSceneLedger?.ok
        ? parsedPlannerSceneLedger.scene
        : blankPlannerSceneFromBoundary(
            documentLedgerHost.layouts[documentLedgerHost.activeLayoutId]?.boundary,
          );
      revisePrototypeSceneLedger(nextSceneLedger);
      return nextSceneLedger;
    },
    [],
  );

  const resolveCurrentPrototypeSceneLedger = useCallback((): PlannerScene | null => {
    if (prototypeSceneLedger) return prototypeSceneLedger;
    return hydratePrototypeSceneFromDocument(documentLedgerRef.current ?? null);
  }, [hydratePrototypeSceneFromDocument, prototypeSceneLedger]);

  const flashLayoutTransferHintLedger = useCallback((messageLedger: string) => {
    reviseLayoutTransferHintLedger(messageLedger);
    window.setTimeout(() => reviseLayoutTransferHintLedger(null), 5200);
  }, []);

  const openRoomSizeEditorLedger = useCallback(() => {
    if (!activeSliceLedger) return;
    reviseRoomWidthDraftLedger(String(Math.round(activeSliceLedger.boundary.widthLu)));
    reviseRoomDepthDraftLedger(String(Math.round(activeSliceLedger.boundary.depthLu)));
    reviseRoomSizeIssueLedger(null);
    reviseRoomSizeEditorOpenLedger((openLedger) => !openLedger);
  }, [activeSliceLedger]);

  const applyRoomSizeDraftLedger = useCallback(() => {
    if (!(documentLedger && activeSliceLedger)) return;

    const nextWidthLedger = Number(roomWidthDraftLedger);
    const nextDepthLedger = Number(roomDepthDraftLedger);
    if (
      !Number.isFinite(nextWidthLedger) ||
      !Number.isFinite(nextDepthLedger) ||
      nextWidthLedger < 10 ||
      nextDepthLedger < 10
    ) {
      reviseRoomSizeIssueLedger("Room width and depth must be at least 10 ft.");
      return;
    }

    const nextBoundaryLedger = {
      widthLu: Math.round(nextWidthLedger),
      depthLu: Math.round(nextDepthLedger),
    } satisfies RoomSetLayoutBoundary;
    const currentLayoutIdLedger = documentLedger.activeLayoutId;
    const currentSceneLedger = resolveCurrentPrototypeSceneLedger();
    const nextSceneLedger = currentSceneLedger
      ? resizePlannerSceneRoomShell(currentSceneLedger, nextBoundaryLedger)
      : blankPlannerSceneFromBoundary(nextBoundaryLedger);
    const nextSliceLedger = {
      ...activeSliceLedger,
      boundary: nextBoundaryLedger,
    };
    const nextDocumentLedger = rebuildOperationalTransitions({
      ...documentLedger,
      layouts: {
        ...documentLedger.layouts,
        [currentLayoutIdLedger]: nextSliceLedger,
      },
      ...(nextSceneLedger
        ? {
            plannerScenes: {
              ...(documentLedger.plannerScenes ?? {}),
              [currentLayoutIdLedger]: nextSceneLedger,
            },
          }
        : {}),
    });

    reviseDocumentLedger(nextDocumentLedger);
    documentLedgerRef.current = nextDocumentLedger;
    revisePrototypeSceneLedger(nextSceneLedger);
    reviseRoomSizeEditorOpenLedger(false);
    reviseRoomSizeIssueLedger(null);
    pulsePrototypeFitNonceLedger((priorLedger) => priorLedger + 1);
    flashLayoutTransferHintLedger("Room size updated for this draft.");
  }, [
    activeSliceLedger,
    documentLedger,
    flashLayoutTransferHintLedger,
    resolveCurrentPrototypeSceneLedger,
    roomDepthDraftLedger,
    roomWidthDraftLedger,
  ]);

  const handleInsertComponentLedger = useCallback(
    (componentId: string, componentLabel: string) => {
      const componentAdderScrollTopLedger = componentAdderScrollRef.current?.scrollTop ?? null;
      controlsAutoCollapsedRefLedger.current = true;
      reviseControlsExpandedLedger(true);
      if (!isPlaceablePlannerComponentId(componentId)) {
        flashLayoutTransferHintLedger(`Could not add ${componentLabel} to this room.`);
        return;
      }
      const componentLedger = getRoomSetComponent(componentId);
      const sceneLedger = resolveCurrentPrototypeSceneLedger();
      if (!(componentLedger && sceneLedger)) {
        flashLayoutTransferHintLedger("Room shell is not ready yet.");
        return;
      }

      const objectIndexLedger = sceneLedger.objects.length;
      const cascadeOffsetLedger = (objectIndexLedger % 6) * 3;
      const placementXLedger = clampToRoom(
        (sceneLedger.roomShell.widthLu - componentLedger.widthLu) / 2 + cascadeOffsetLedger,
        sceneLedger.roomShell.widthLu - componentLedger.widthLu,
      );
      const placementYLedger = clampToRoom(
        (sceneLedger.roomShell.depthLu - componentLedger.depthLu) / 2 + cascadeOffsetLedger,
        sceneLedger.roomShell.depthLu - componentLedger.depthLu,
      );
      const manualSceneLedger = plannerSceneFromLayoutPlacements(
        [
          {
            componentId,
            xLu: placementXLedger,
            yLu: placementYLedger,
            rotationDeg: componentLedger.defaultRotationDeg ?? 0,
          },
        ],
        {
          widthLu: sceneLedger.roomShell.widthLu,
          depthLu: sceneLedger.roomShell.depthLu,
        },
        {
          sourceKind: "manual",
          sourceDetail: "component-adder",
          objectIdPrefix: `manual-component-${crypto.randomUUID()}`,
        },
      );
      const manualObjectLedger = manualSceneLedger.objects[0];
      if (!manualObjectLedger) {
        flashLayoutTransferHintLedger(`Could not add ${componentLabel} to this room.`);
        return;
      }
      revisePrototypeSceneLedger({
        ...sceneLedger,
        objects: [...sceneLedger.objects, manualObjectLedger],
      });
      flashLayoutTransferHintLedger(`${componentLabel} added to the room layout.`);
      if (componentAdderScrollTopLedger != null) {
        window.requestAnimationFrame(() => {
          if (componentAdderScrollRef.current) {
            componentAdderScrollRef.current.scrollTop = componentAdderScrollTopLedger;
          }
        });
      }
    },
    [flashLayoutTransferHintLedger, resolveCurrentPrototypeSceneLedger],
  );

  useEffect(() => {
    if (!documentLedger) {
      revisePrototypeSceneLedger(null);
      return;
    }
    hydratePrototypeSceneFromDocument(documentLedger);
  }, [documentLedger, hydratePrototypeSceneFromDocument]);

  const patchActiveSliceLedger = useCallback(
    (mutator: (slice: RoomSetLayoutSlice) => RoomSetLayoutSlice) => {
      reviseDocumentLedger((priorLedger) => {
        if (!priorLedger) return priorLedger;
        const currentLedger = priorLedger.layouts[priorLedger.activeLayoutId];
        if (!currentLedger) return priorLedger;
        const nextLedgerSlice = mutator(currentLedger);
        return rebuildOperationalTransitions({
          ...priorLedger,
          layouts: { ...priorLedger.layouts, [currentLedger.id]: nextLedgerSlice },
        });
      });
    },
    [],
  );


  type AiLayoutPlanResponse = Readonly<{
    resultStatus?: RoomSetPlanResultStatus;
    userMessageTitle?: string;
    userMessageBody?: string;
    adjustments?: readonly string[];
    suggestions?: readonly string[];
    debugReason?: string;
    failureDetails?: RoomSetPlanFailureDetails;
    interpretation?: RoomSetOperationalBrief;
    placements?: readonly RoomSetLayoutPlacement[];
    capacityChangeRequested?: boolean;
    appliedSeatCapacity?: number;
    layoutSpec?: LayoutSpec;
    applyPath?: "patch" | "legacy" | "spec" | "spatial";
  }>;

  const requestAiLayoutPlanLedger = useCallback(
    async (
      promptLedger: string,
      modeLedger: "generate" | "apply",
      currentLayoutLedger?: RoomSetCanvasLayoutSnapshot,
    ): Promise<AiLayoutPlanResponse> => {
      const shellBoundaryLedger = activeSliceLedger?.boundary;
      if (!shellBoundaryLedger) {
        throw new Error("Room shell is not ready.");
      }
      const responseLedger = await fetch("/api/room-set/plan-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptLedger,
          mode: modeLedger,
          currentLayout: currentLayoutLedger,
          currentLayoutSpec:
            modeLedger === "apply" ? (currentLayoutSpecLedger ?? undefined) : undefined,
          sidebar: {
            attendeeCount: attendeeCountLedger,
            densityPreference: densityPreferenceLedger,
            layoutStyle: layoutStylePreferenceLedger,
            accessibilityPriority: accessibilityPriorityLedger,
            roomWidthLu: shellBoundaryLedger.widthLu,
            roomDepthLu: shellBoundaryLedger.depthLu,
          },
        }),
      });
      const payloadLedger = (await responseLedger.json().catch(() => null)) as unknown;
      if (!responseLedger.ok) {
        const messageLedger =
          typeof payloadLedger === "object" &&
          payloadLedger !== null &&
          "error" in payloadLedger &&
          typeof (payloadLedger as { error: unknown }).error === "string"
            ? (payloadLedger as { error: string }).error
            : "AI layout planning unavailable.";
        throw new Error(messageLedger);
      }
      if (
        typeof payloadLedger !== "object" ||
        payloadLedger === null ||
        (
          (payloadLedger as { resultStatus?: unknown }).resultStatus !== "failed" &&
          (!("interpretation" in payloadLedger) || !("placements" in payloadLedger))
        )
      ) {
        throw new Error("AI layout plan response was malformed.");
      }
      return payloadLedger as AiLayoutPlanResponse;
    },
    [
      accessibilityPriorityLedger,
      activeSliceLedger?.boundary,
      attendeeCountLedger,
      currentLayoutSpecLedger,
      densityPreferenceLedger,
      layoutStylePreferenceLedger,
    ],
  );

  const handleApplyEventIntentStarterLedger = useCallback(
    async (generationModeLedger: RoomSetPlannerGenerationMode) => {
      if (!activeSliceLedger) return;
      let promptTrimLedger = plannerIntentPromptLedger.trim();
      if (generationModeLedger === "full" && !selectedEventIntentLedger && !promptTrimLedger) {
        flashLayoutTransferHintLedger("Enter a planner prompt or select a preset archetype.");
        return;
      }
      if (generationModeLedger === "additive" && !promptTrimLedger) {
        flashLayoutTransferHintLedger("Enter a planner prompt to apply to the current layout.");
        return;
      }
      if (generationModeLedger === "full" && !promptTrimLedger && selectedEventIntentLedger) {
        const presetLedger = ROOM_SET_EVENT_INTENT_ARCHETYPES.find(
          (row) => row.id === selectedEventIntentLedger,
        );
        promptTrimLedger = `Generate a complete ${presetLedger?.label ?? selectedEventIntentLedger} room set for ${attendeeCountLedger} attendees.`;
      }

      const priorAttendeeCountLedger = attendeeCountLedger;
      const shellBoundaryLedger = activeSliceLedger.boundary;
      const planModeLedger = generationModeLedger === "additive" ? "apply" : "generate";

      reviseIntentInterpretationBusyLedger(true);
      reviseGenerationValidationLedger(null);
      try {
        const currentPrototypeSceneLedger = resolveCurrentPrototypeSceneLedger();
        const currentLayoutLedger =
          planModeLedger === "apply" && currentPrototypeSceneLedger
            ? plannerSceneToCanvasLayoutSnapshot(currentPrototypeSceneLedger)
            : undefined;
        const aiPlanLedger = await requestAiLayoutPlanLedger(
          promptTrimLedger,
          planModeLedger,
          currentLayoutLedger,
        );

        if (aiPlanLedger.resultStatus === "failed") {
          reviseGenerationApplySummaryLedger({
            resultStatus: "failed",
            userMessageTitle:
              aiPlanLedger.userMessageTitle ??
              (planModeLedger === "apply" ? "Apply Failed" : "Generation Failed"),
            userMessageBody:
              aiPlanLedger.userMessageBody ??
              defaultFailedResultMessage(planModeLedger).userMessageBody,
            adjustments: [...(aiPlanLedger.adjustments ?? [])],
            suggestions: [...(aiPlanLedger.suggestions ?? [])],
            footer:
              planModeLedger === "apply"
                ? "Your layout was not changed."
                : "Your previous layout was not changed.",
            ...(aiPlanLedger.failureDetails ? { failureDetails: aiPlanLedger.failureDetails } : {}),
            ...(aiPlanLedger.debugReason ? { debugReason: aiPlanLedger.debugReason } : {}),
          });
          reviseGenerationValidationLedger(null);
          return;
        }

        if (!aiPlanLedger.interpretation || !aiPlanLedger.placements || typeof aiPlanLedger.appliedSeatCapacity !== "number") {
          throw new Error("AI layout plan response was malformed.");
        }
        const planInterpretationLedger = aiPlanLedger.interpretation;
        const planPlacementsLedger = aiPlanLedger.placements;
        const planAppliedSeatCapacityLedger = aiPlanLedger.appliedSeatCapacity;

        const nextPrototypeSceneLedger = plannerSceneFromLayoutPlacements(
          planPlacementsLedger,
          {
            widthLu: shellBoundaryLedger.widthLu,
            depthLu: shellBoundaryLedger.depthLu,
          },
        );
        revisePrototypeSceneLedger(nextPrototypeSceneLedger);
        pulsePrototypeFitNonceLedger((nonceLedger) => nonceLedger + 1);
        reviseIntentInterpretationLedger(planInterpretationLedger);
        if (aiPlanLedger.layoutSpec) {
          reviseCurrentLayoutSpecLedger(aiPlanLedger.layoutSpec);
        }
        if (planInterpretationLedger.accessibilityPriority !== accessibilityPriorityLedger) {
          reviseAccessibilityPriorityLedger(planInterpretationLedger.accessibilityPriority);
        }
        if (aiPlanLedger.capacityChangeRequested) {
          reviseAttendeeCountLedger(planInterpretationLedger.attendeeCount);
        }

        const requestedCapacityLedger = aiPlanLedger.capacityChangeRequested
          ? planInterpretationLedger.requestedAttendees
          : priorAttendeeCountLedger;
        const validationLedger = buildAiLayoutValidationSummary(
          requestedCapacityLedger,
          planPlacementsLedger,
          [],
        );
        reviseGenerationValidationLedger(validationLedger);

        const archetypeLedger = ROOM_SET_EVENT_INTENT_ARCHETYPES.find(
          (row) => row.id === planInterpretationLedger.eventIntent,
        );
        const densityLabelLedger =
          ROOM_SET_DENSITY_OPTIONS.find(
            (row) => row.id === planInterpretationLedger.densityPreference,
          )?.label ?? planInterpretationLedger.densityPreference;
        const layoutStyleLabelLedger = formatAudienceStyleCopy(
          aiPlanLedger.layoutSpec?.audienceStyle,
          aiPlanLedger.layoutSpec?.layoutType,
          aiPlanLedger.layoutSpec?.eventIntent,
        );
        const generationModeLabelLedger =
          generationModeLedger === "additive"
            ? aiPlanLedger.applyPath === "patch"
              ? "AI revised layout (semantic patch)"
              : aiPlanLedger.applyPath === "spatial"
                ? "AI revised layout (spatial directives)"
                : "AI revised layout (apply)"
            : "AI layout generation";
        const resultStatusLedger = aiPlanLedger.resultStatus ?? "success";
        reviseGenerationApplySummaryLedger({
          resultStatus: resultStatusLedger,
          userMessageTitle:
            aiPlanLedger.userMessageTitle ??
            (resultStatusLedger === "success_with_adjustments"
              ? "Layout Created with Adjustments"
              : "Last Generation"),
          userMessageBody:
            aiPlanLedger.userMessageBody ??
            (resultStatusLedger === "success_with_adjustments"
              ? "We created the closest safe layout for this room."
              : "Layout created successfully."),
          adjustments: [
            ...(aiPlanLedger.adjustments ?? []),
            `${generationModeLabelLedger}.`,
            `${planPlacementsLedger.length} components placed by AI planner.`,
            `Layout check: ${archetypeLedger?.label ?? planInterpretationLedger.eventIntent} · ${planInterpretationLedger.requestedAttendees} attendees requested · ${densityLabelLedger} density · ${layoutStyleLabelLedger} style.`,
            aiPlanLedger.capacityChangeRequested
              ? `Capacity updated to ${planInterpretationLedger.attendeeCount} (was ${priorAttendeeCountLedger}).`
              : `Capacity unchanged at ${priorAttendeeCountLedger} attendees.`,
            `Plated ${planAppliedSeatCapacityLedger} seats from AI placements · room fit: ${formatFitStatusCopy(validationLedger.fitStatus)}.`,
            `Room shell ${formatRoomShellDimensions(shellBoundaryLedger.widthLu, shellBoundaryLedger.depthLu)}.`,
          ],
          suggestions: [...(aiPlanLedger.suggestions ?? [])],
          ...(aiPlanLedger.failureDetails ? { failureDetails: aiPlanLedger.failureDetails } : {}),
          ...(aiPlanLedger.debugReason ? { debugReason: aiPlanLedger.debugReason } : {}),
        });
      } catch (errorLedger) {
        const messageLedger =
          errorLedger instanceof Error ? errorLedger.message : "AI layout planning failed";
        console.warn("[room-set/plan-layout] failed", {
          generationMode: generationModeLedger,
          reason: messageLedger,
        });
        flashLayoutTransferHintLedger(messageLedger);
        reviseGenerationApplySummaryLedger(
          defaultFailedResultMessage(planModeLedger, messageLedger),
        );
        reviseGenerationValidationLedger(null);
      } finally {
        reviseIntentInterpretationBusyLedger(false);
      }
    },
    [
      activeSliceLedger,
      attendeeCountLedger,
      flashLayoutTransferHintLedger,
      plannerIntentPromptLedger,
      requestAiLayoutPlanLedger,
      reviseAccessibilityPriorityLedger,
      reviseAttendeeCountLedger,
      reviseGenerationApplySummaryLedger,
      reviseGenerationValidationLedger,
      reviseIntentInterpretationBusyLedger,
      reviseIntentInterpretationLedger,
      reviseCurrentLayoutSpecLedger,
      selectedEventIntentLedger,
      resolveCurrentPrototypeSceneLedger,
    ],
  );

  const finalizeSaveDraftLedger = useCallback(() => {
    reviseSaveConfirmOpenLedger(false);
    if (!documentLedger) return;

    try {
      const plannerSceneLedger = resolveCurrentPrototypeSceneLedger();
      const plannerScenesLedger = plannerSceneLedger
        ? {
            ...(documentLedger.plannerScenes ?? {}),
            [documentLedger.activeLayoutId]: plannerSceneLedger,
          }
        : documentLedger.plannerScenes;
      const layoutSpecsLedger = currentLayoutSpecLedger
        ? {
            ...(documentLedger.layoutSpecs ?? {}),
            [documentLedger.activeLayoutId]: currentLayoutSpecLedger,
          }
        : documentLedger.layoutSpecs;
      const nextDocLedger = rebuildOperationalTransitions({
        ...documentLedger,
        ...(plannerScenesLedger ? { plannerScenes: plannerScenesLedger } : {}),
        ...(layoutSpecsLedger ? { layoutSpecs: layoutSpecsLedger } : {}),
      });
      reviseDocumentLedger(nextDocLedger);
      revisePrototypeSceneLedger(plannerSceneLedger);
      const okLedger = persistRoomSetDocument(eventId, sessionId, nextDocLedger);
      flashLayoutTransferHintLedger(
        okLedger
          ? "Draft saved locally for this Room Set."
          : "Save blocked — browser storage unavailable.",
      );
    } catch (issueLedger) {
      flashLayoutTransferHintLedger(
        issueLedger instanceof Error ? issueLedger.message : "Save failed.",
      );
    }
  }, [
    currentLayoutSpecLedger,
    documentLedger,
    eventId,
    flashLayoutTransferHintLedger,
    resolveCurrentPrototypeSceneLedger,
    sessionId,
  ]);

  if (loadingLedger) {
    return (
      <div className="flex min-h-[54vh] items-center justify-center text-sm text-slate-500">
        Loading workspace…
      </div>
    );
  }

  if (fetchIssueLedger || !sessionLedger) {
    return (
      <div className="rounded-3xl border border-rose-100 bg-rose-50 p-10 text-center text-sm text-rose-800">
        <p>{fetchIssueLedger ?? "Session linkage missing"}</p>
        <Link
          className="mt-4 inline-flex text-indigo-600 underline"
          href={`/events/${eventId}/matrix/sessions/${sessionId}`}
        >
          Return to session
        </Link>
      </div>
    );
  }

  if (!(documentLedger && activeSliceLedger)) {
    return (
      <div className="flex min-h-[54vh] items-center justify-center text-sm text-slate-500">
        Bootstrapping local room set canvas…
      </div>
    );
  }

  const renderSaveConfirmOverlayLedger =
    saveConfirmOpenLedger ? (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/55 px-6 py-8 backdrop-blur-sm"
        role="presentation"
      >
        <dialog
          open
          className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_32px_80px_rgba(15,23,42,0.28)]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
            Save local draft
          </p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
            Persist this workspace?
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
            Saves room boundaries, lifecycle slots, overlays, staffing hints, playback
            settings, plus the visible canvas for the active slice into browser storage —
            disconnected from Planner cloud until server sync arrives.
          </p>
          <div className="mt-7 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => reviseSaveConfirmOpenLedger(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-950 px-5 py-2 text-[12px] font-semibold text-white hover:bg-slate-800"
              onClick={finalizeSaveDraftLedger}
            >
              Save draft
            </button>
          </div>
        </dialog>
      </div>
    ) : null;

  const renderComponentAdderLedger = (classNameLedger = "mt-3") => (
    <div
      className={`${classNameLedger} w-full rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-slate-100 shadow-lg shadow-slate-950/20 ring-1 ring-white/10 backdrop-blur-xl [box-shadow:inset_0_1px_0_rgba(255,255,255,0.08)]`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/75">
            Component Adder
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-400">
            Add room objects directly to the canvas.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-300">
          {displayedComponentsLedger.length}
        </span>
      </div>
      <label className="relative mt-2 block">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
          aria-hidden
        />
        <input
          type="search"
          aria-label="Search operational room components"
          className="h-9 w-full rounded-xl border border-white/10 bg-black/25 py-2 pl-8 pr-3 text-[12px] font-medium text-slate-100 shadow-inner shadow-black/20 outline-none backdrop-blur-xl placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
          placeholder="Search components"
          value={componentSearchLedger}
          onChange={(evtComponentSearchLedger) =>
            reviseComponentSearchLedger(evtComponentSearchLedger.target.value)
          }
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {ROOM_SET_COMPONENT_CATEGORIES.map((categoryLedger) => {
          const countLedger =
            visibleComponentGroupsLedger.get(categoryLedger.id)?.length ?? 0;
          const activeLedger = categoryLedger.id === activeComponentCategoryLedger;
          return (
            <button
              key={categoryLedger.id}
              type="button"
              aria-pressed={activeLedger}
              title={categoryLedger.title}
              className={`min-w-[5.75rem] rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                activeLedger
                  ? "border-cyan-300/60 bg-cyan-400/[0.10] text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.18)]"
                  : "border-white/10 bg-white/[0.05] text-slate-300 shadow-inner shadow-white/[0.02] backdrop-blur-xl hover:border-cyan-200/30 hover:bg-white/[0.08] hover:text-white"
              }`}
              onClick={() => reviseActiveComponentCategoryLedger(categoryLedger.id)}
            >
              {componentCategoryShortLabel(categoryLedger.id, categoryLedger.title)}
              <span className={activeLedger ? "ml-1 text-cyan-100/65" : "ml-1 text-slate-500"}>
                {countLedger}
              </span>
            </button>
          );
        })}
      </div>
      <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.045] p-2 shadow-inner shadow-black/20 ring-1 ring-white/[0.04] backdrop-blur-xl">
        <header className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <p className="truncate text-[10px] font-semibold text-slate-200">
            {searchingComponentsLedger
              ? `Search results (${displayedComponentsLedger.length})`
              : activeComponentCategoryMetaLedger.title}
          </p>
          <p className="truncate text-[9px] text-slate-500">
            {searchingComponentsLedger ? "All categories" : activeComponentCategoryMetaLedger.description}
          </p>
        </header>
        <div
          ref={componentAdderScrollRef}
          className="grid max-h-64 gap-1.5 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3"
        >
          {displayedComponentsLedger.map((componentLedger) => {
            const ComponentIconLedger = componentIconForCategory(componentLedger.category);
            const categoryLabelLedger =
              ROOM_SET_COMPONENT_CATEGORIES.find(
                (categoryLedger) => categoryLedger.id === componentLedger.category,
              )?.title ?? componentLedger.category;
            const cardDetailLedger = componentDrawerCardDetail(componentLedger);
            return (
              <button
                key={componentLedger.id}
                type="button"
                title={`${componentLedger.label} · ${cardDetailLedger} · ${categoryLabelLedger}`}
                className="group flex min-h-[122px] w-full flex-col rounded-xl border border-white/10 bg-white/[0.055] p-2 text-left shadow-inner shadow-white/[0.015] transition backdrop-blur-xl hover:border-cyan-200/30 hover:bg-white/[0.09] focus-visible:border-cyan-200/45 focus-visible:bg-cyan-300/[0.08] focus-visible:outline-none"
                onClick={() =>
                  handleInsertComponentLedger(componentLedger.id, componentLedger.label)
                }
              >
                <span
                  className={`relative flex h-14 w-full items-center justify-center overflow-hidden rounded-lg border ${componentThumbnailToneClass(componentLedger.category)}`}
                >
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.14),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_55%)]" />
                  <ComponentIconLedger className="relative h-7 w-7 drop-shadow-[0_0_12px_rgba(34,211,238,0.20)]" aria-hidden />
                </span>
                <span className="mt-2 min-w-0">
                  <span className="block truncate text-[11px] font-semibold leading-tight text-slate-100">
                    {componentLedger.label}
                  </span>
                  <span className="mt-1 block truncate text-[8px] leading-snug text-slate-400">
                    {cardDetailLedger}
                  </span>
                </span>
                <span className="mt-auto flex items-center justify-between gap-2 pt-2">
                  {searchingComponentsLedger ? (
                    <span className="min-w-0 truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {categoryLabelLedger}
                    </span>
                  ) : (
                    <span className="min-w-0 truncate text-[8px] text-slate-500">
                      {componentLedger.smart.setupComplexity}
                    </span>
                  )}
                  <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-300 backdrop-blur-xl group-hover:border-cyan-200/45 group-hover:text-cyan-100">
                    Add
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {displayedComponentsLedger.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.035] px-3 py-4 text-center text-[11px] text-slate-400">
            {searchingComponentsLedger
              ? "No operational components match that search."
              : "No components in this category yet."}
          </p>
        ) : null}
      </section>
    </div>
  );

  const renderGeneratePanelLedger = () => {
    const layoutCheckStatusLedger = layoutCheckStatusForValidation(generationValidationLedger);
    const LayoutCheckIconLedger = layoutCheckStatusLedger.Icon;
    const selectedPresetLabelLedger =
      ROOM_SET_EVENT_INTENT_ARCHETYPES.find((row) => row.id === selectedEventIntentLedger)?.label ??
      intentInterpretationLedger?.eventIntent.replaceAll("_", " ") ??
      "Prompt-only";

    return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-slate-100 shadow-lg shadow-slate-950/20 ring-1 ring-white/10 backdrop-blur-xl [box-shadow:inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-200/75">
                Generate Layout
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-400">
                Start with a prompt or anchor the plan with a preset.
              </p>
            </div>
            <p className="text-[10px] font-medium text-slate-400">
              {selectedEventIntentLedger
                ? `Preset: ${
                    ROOM_SET_EVENT_INTENT_ARCHETYPES.find((row) => row.id === selectedEventIntentLedger)?.label ??
                    selectedEventIntentLedger
                  }`
                : "Prompt-only"}
            </p>
          </div>
          <label className="mt-3 block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Planner prompt
            </span>
            <textarea
              rows={3}
              className="mt-1 w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-[12px] leading-snug text-slate-100 shadow-inner shadow-black/20 outline-none backdrop-blur-xl placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
              placeholder="General session for 225, light presentation, no giant keynote stage."
              value={plannerIntentPromptLedger}
              onChange={(evtLedger) => revisePlannerIntentPromptLedger(evtLedger.target.value)}
            />
          </label>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {ROOM_SET_EVENT_INTENT_ARCHETYPES.map((intentLedger) => {
              const selectedLedger = intentLedger.id === selectedEventIntentLedger;
              return (
                <button
                  key={intentLedger.id}
                  type="button"
                  title={intentLedger.description}
                  className={`min-h-[46px] rounded-xl border px-2.5 py-2 text-left transition ${
                    selectedLedger
                      ? "border-cyan-300/60 bg-cyan-400/[0.10] text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.16)]"
                      : "border-white/10 bg-white/[0.05] text-slate-300 shadow-inner shadow-white/[0.015] backdrop-blur-xl hover:border-cyan-200/30 hover:bg-white/[0.08] hover:text-white"
                  }`}
                  onClick={() =>
                    reviseSelectedEventIntentLedger(selectedLedger ? null : intentLedger.id)
                  }
                >
                  <span className="block text-[11px] font-semibold leading-tight">{intentLedger.label}</span>
                  <span className={selectedLedger ? "mt-1 block text-[8px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70" : "sr-only"}>
                    Selected
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 shadow-inner shadow-black/20 ring-1 ring-white/[0.04] backdrop-blur-xl">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Attendee count
                </span>
                <DraftNumberInput
                  min={1}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[13px] font-semibold text-slate-100 shadow-inner shadow-black/20 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                  value={attendeeCountLedger}
                  formatValue={(nextValue) => Math.round(nextValue).toString()}
                  onCommit={(nextAttendeeCountLedger) =>
                    reviseAttendeeCountLedger(Math.max(1, Math.round(nextAttendeeCountLedger)))
                  }
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Density
                </span>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[12px] font-semibold text-slate-100 shadow-inner shadow-black/20 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                  value={densityPreferenceLedger}
                  onChange={(evtLedger) =>
                    reviseDensityPreferenceLedger(evtLedger.target.value as RoomSetDensityControl)
                  }
                >
                  {ROOM_SET_DENSITY_OPTIONS.map((optionLedger) => (
                    <option key={optionLedger.id} value={optionLedger.id}>
                      {optionLedger.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  {styleControlLabelLedger}
                </span>
                <RoomSetStyleDropdownLedger
                  disabled={styleControlDisabledLedger}
                  options={layoutStyleOptionsLedger}
                  value={layoutStylePreferenceLedger}
                  onChange={reviseLayoutStylePreferenceLedger}
                />
                {styleControlDisabledLedger ? (
                  <span className="mt-1 block text-[10px] font-medium leading-snug text-slate-500">
                    Pick a preset or enter a prompt to unlock style options.
                  </span>
                ) : null}
              </label>
            </div>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                className="rounded-xl border border-cyan-200/60 bg-cyan-300 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.18)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.06] disabled:text-slate-500 disabled:shadow-none"
                disabled={
                  intentInterpretationBusyLedger ||
                  (!plannerIntentPromptLedger.trim() && !selectedEventIntentLedger)
                }
                onClick={() => void handleApplyEventIntentStarterLedger("full")}
              >
                {intentInterpretationBusyLedger ? "Planning layout…" : "Generate New Layout"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200 shadow-sm transition hover:border-cyan-200/35 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-slate-600"
                disabled={intentInterpretationBusyLedger || !plannerIntentPromptLedger.trim()}
                onClick={() => void handleApplyEventIntentStarterLedger("additive")}
              >
                {intentInterpretationBusyLedger ? "Planning layout…" : "Apply to Current Layout"}
              </button>
            </div>
          </div>
      </div>

        {intentInterpretationLedger ? (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-[10px] leading-snug text-slate-300 shadow-inner shadow-black/20 ring-1 ring-white/[0.04] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold uppercase tracking-[0.18em] text-cyan-200/75">Layout Check</p>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${layoutCheckToneClass(layoutCheckStatusLedger.tone)}`}
              >
                <LayoutCheckIconLedger className="h-3 w-3" aria-hidden />
                {layoutCheckStatusLedger.label}
              </span>
            </div>
            <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
              <div>
                <dt className="text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500">Preset/type</dt>
                <dd className="mt-0.5 font-semibold text-slate-200">{selectedPresetLabelLedger}</dd>
              </div>
              <div>
                <dt className="text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500">Attendees</dt>
                <dd className="mt-0.5 font-semibold text-slate-200">{intentInterpretationLedger.requestedAttendees}</dd>
              </div>
              {generationValidationLedger ? (
                <>
                  <div>
                    <dt className="text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500">Seats placed</dt>
                    <dd className="mt-0.5 font-semibold text-slate-200">
                      {generationValidationLedger.appliedSeatCapacity}/{generationValidationLedger.requestedCapacity}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500">Fit</dt>
                    <dd className="mt-0.5 font-semibold text-slate-200">
                      {formatFitStatusCopy(generationValidationLedger.fitStatus)}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {generationValidationLedger ? (
              <p className="mt-1">
                Density {generationValidationLedger.densityScore == null ? "not scored" : `${Math.round(generationValidationLedger.densityScore * 100)}%`} · circulation{" "}
                {generationValidationLedger.circulationScore == null ? "not scored" : `${Math.round(generationValidationLedger.circulationScore * 100)}%`}
              </p>
            ) : null}
            {intentInterpretationLedger.componentRequestInterpretation ? (
              <p className="mt-1 text-slate-400">
                {formatComponentRequestInterpretationSummaryLines(
                  intentInterpretationLedger.componentRequestInterpretation,
                  intentInterpretationLedger.componentRequests,
                ).join(" ")}
              </p>
            ) : null}
            {generationValidationLedger?.layoutTradeoffs.length ? (
              <p className="mt-1 text-slate-400">
                Warnings: {generationValidationLedger.layoutTradeoffs.join(" · ")}
              </p>
            ) : null}
            {generationValidationLedger?.operationalRisks.length ? (
              <p className="mt-1 text-slate-400">
                Risks: {generationValidationLedger.operationalRisks.join(" · ")}
              </p>
            ) : null}
          </div>
        ) : null}
    </section>
    );
  };

  const renderEmbeddedSeatingAttendeeRowLedger = (
    attendeeLedger: EmbeddedSeatingAttendee,
    optionsLedger: Readonly<{ assignedTableId?: string | null; compact?: boolean }> = {},
  ) => {
    const attendeeAssignmentLedger = seatingAssignmentByAttendeeIdLedger.get(attendeeLedger.id) ?? null;
    const assignedTableLedger = attendeeAssignmentLedger
      ? seatingTableByIdLedger.get(attendeeAssignmentLedger.tableId) ?? null
      : null;
    const activeLedger =
      selectedSeatingAttendeeIdLedger === attendeeLedger.id ||
      pendingSeatingAttendeeIdLedger === attendeeLedger.id;

    return (
      <EmbeddedSeatingDraggableAttendeeRow
        key={attendeeLedger.id}
        active={activeLedger}
        assignedTableName={assignedTableLedger?.name}
        attendee={attendeeLedger}
        compact={optionsLedger.compact}
        onRemove={
          optionsLedger.assignedTableId
            ? () => void optimisticUnassignEmbeddedSeatingLedger(attendeeLedger.id)
            : undefined
        }
        onSelect={() => {
          reviseSelectedSeatingAttendeeIdLedger(attendeeLedger.id);
          reviseSelectedSeatingTableIdLedger(null);
          reviseSelectedSeatingObjectIdLedger(null);
          revisePendingSeatingAttendeeIdLedger((priorLedger) =>
            priorLedger === attendeeLedger.id ? null : attendeeLedger.id,
          );
        }}
      />
    );
  };

  const renderSeatingPanelLedger = () => {
    const totalSeatsLedger = seatingTablesLedger.reduce(
      (totalLedger, tableLedger) => totalLedger + tableLedger.capacity,
      0,
    );
    const assignedCountLedger = seatingAssignmentsLedger.length;
    const currentPanelTitleLedger =
      ROOM_SET_SEATING_PANELS.find((panelLedger) => panelLedger.id === activeSeatingPanelLedger)?.label ??
      "Seating";

    return (
      <section className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-slate-100 shadow-lg shadow-slate-950/20 ring-1 ring-white/10 backdrop-blur-xl [box-shadow:inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/75">
              Seating Mode
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-400">
              Session-scoped seating for this {terminology.runOfShow} item.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/[0.055] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:border-cyan-200/30 hover:text-cyan-100"
            onClick={() => void loadEmbeddedSeatingLedger()}
          >
            Refresh
          </button>
        </div>
        {seatingIssueLedger ? (
          <p className="mt-2 rounded-xl border border-amber-200/20 bg-amber-300/[0.08] px-3 py-2 text-[10px] leading-snug text-amber-100">
            {seatingIssueLedger}
          </p>
        ) : null}
        {pendingSeatingAttendeeLedger ? (
          <p className="mt-2 rounded-xl border border-cyan-200/20 bg-cyan-300/[0.08] px-3 py-2 text-[10px] leading-snug text-cyan-50">
            Drop on an open chair, or click a chair, to seat{" "}
            <span className="font-semibold">{embeddedSeatingAttendeeName(pendingSeatingAttendeeLedger)}</span>.
          </p>
        ) : null}
        <div
          className="mt-3 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/20 p-1"
          role="group"
          aria-label="Seating panel"
        >
          {ROOM_SET_SEATING_PANELS.map((panelLedger) => {
            const PanelIconLedger = panelLedger.icon;
            const activeLedger = panelLedger.id === activeSeatingPanelLedger;
            return (
              <button
                key={panelLedger.id}
                type="button"
                aria-pressed={activeLedger}
                className={`inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-[10px] font-semibold transition ${
                  activeLedger
                    ? "bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/20"
                    : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
                }`}
                onClick={() => reviseActiveSeatingPanelLedger(panelLedger.id)}
              >
                <PanelIconLedger className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{panelLedger.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {currentPanelTitleLedger}
          </p>
          {seatingLoadingLedger ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-4 text-center text-[11px] text-slate-400">
              Loading seating…
            </p>
          ) : activeSeatingPanelLedger === "unassigned" ? (
            <EmbeddedSeatingUnassignedDropZone>
              <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
                {unassignedSeatingAttendeesLedger.map((attendeeLedger) =>
                  renderEmbeddedSeatingAttendeeRowLedger(attendeeLedger),
                )}
                {unassignedSeatingAttendeesLedger.length === 0 ? (
                  <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-4 text-center text-[11px] text-slate-400">
                    Drop an assigned attendee here to unassign, or all attendees are currently assigned.
                  </p>
                ) : null}
              </div>
            </EmbeddedSeatingUnassignedDropZone>
          ) : activeSeatingPanelLedger === "tables" ? (
            <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
              {seatingTablesLedger.map((tableLedger) => {
                const assignedLedger = embeddedSeatingTableAssignedCount(tableLedger.id);
                const activeLedger = selectedSeatingTableIdLedger === tableLedger.id;
                return (
                  <button
                    key={tableLedger.id}
                    type="button"
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      activeLedger
                        ? "border-cyan-300/55 bg-cyan-300/[0.10] shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                        : "border-white/10 bg-white/[0.045] hover:border-cyan-200/28 hover:bg-white/[0.075]"
                    }`}
                    onClick={() => {
                      reviseSelectedSeatingTableIdLedger(tableLedger.id);
                      reviseSelectedSeatingAttendeeIdLedger(null);
                      reviseSelectedSeatingObjectIdLedger(seatingObjectIdByTableIdLedger.get(tableLedger.id) ?? null);
                      if (pendingSeatingAttendeeIdLedger) {
                        reviseSeatingIssueLedger("Choose an open chair in the inspector or on the canvas.");
                      }
                    }}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-[11px] font-semibold text-slate-100">
                        {tableLedger.name}
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                          assignedLedger >= tableLedger.capacity
                            ? "border-rose-200/30 bg-rose-400/[0.12] text-rose-100"
                            : "border-cyan-200/25 bg-cyan-300/[0.08] text-cyan-100"
                        }`}
                      >
                        {assignedLedger}/{tableLedger.capacity}
                      </span>
                    </span>
                    <span className="mt-1 block text-[9px] text-slate-500">
                      {Math.max(0, tableLedger.capacity - assignedLedger)} open seats
                    </span>
                  </button>
                );
              })}
              {seatingTablesLedger.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-4 text-center text-[11px] text-slate-400">
                  No session seating tables are available yet.
                </p>
              ) : null}
            </div>
          ) : activeSeatingPanelLedger === "groups" ? (
            <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
              {seatingGroupSummariesLedger.map((groupLedger) => (
                <div
                  key={groupLedger.name}
                  className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[11px] font-semibold text-slate-100">
                      {groupLedger.name}
                    </p>
                    <p className="text-[9px] font-semibold text-cyan-100">
                      {groupLedger.assigned}/{groupLedger.total}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : activeSeatingPanelLedger === "auto-assign" ? (
            <div className="space-y-2 rounded-xl border border-dashed border-white/12 bg-white/[0.035] px-3 py-4 text-[11px] leading-relaxed text-slate-400">
              <p className="font-semibold text-slate-200">Auto-assign is deferred in embedded V1.</p>
              <p>
                Use click-to-assign here. Bulk assignment tools are deferred for a later Room Set pass.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Attendees", seatingAttendeesLedger.length],
                ["Assigned", assignedCountLedger],
                ["Unassigned", unassignedSeatingAttendeesLedger.length],
                ["Seats", totalSeatsLedger],
              ].map(([labelLedger, valueLedger]) => (
                <div
                  key={labelLedger}
                  className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2"
                >
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {labelLedger}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">{valueLedger}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="mt-2 text-[9px] leading-snug text-slate-500">
          {seatingPlanIdLedger
            ? `Session-scoped seating plan active. Chair assignments persist for this ${terminology.runOfShow} session.`
            : "Session seating plan is preparing."}
        </p>
      </section>
    );
  };

  const renderLayersPanelLedger = () => (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/40">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
        View layers
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
              {ROOM_SET_LAYER_TOGGLES.map((layerLedger) => (
                <label
                  key={layerLedger.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-slate-900">{layerLedger.label}</span>
                    <span className="block truncate text-[10px] text-slate-500">{layerLedger.note}</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-slate-950"
                    checked={layerToggleLedger[layerLedger.id]}
                    onChange={() =>
                      reviseLayerToggleLedger((priorLedger) => ({
                        ...priorLedger,
                        [layerLedger.id]: !priorLedger[layerLedger.id],
                      }))
                    }
                  />
                </label>
              ))}
      </div>
    </section>
  );

  const renderOperationalPanelLedger = () => (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/40">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          Operational overlays
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {OPERATIONAL_OVERLAY_KINDS.map((kindLedgerOverlay: OperationalOverlayKind) => (
            <label
              key={kindLedgerOverlay}
              className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 py-2 hover:border-indigo-100"
            >
              <span className="text-[12px] capitalize">{kindLedgerOverlay.replaceAll("_", " ")}</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={operationalProgramLedger?.overlays[kindLedgerOverlay] ?? false}
                onChange={() =>
                  reviseDocumentLedger((priorOverlayLedgerHost) =>
                    priorOverlayLedgerHost?.operational
                      ? rebuildOperationalTransitions(
                          patchOperationalProgram(priorOverlayLedgerHost, {
                            overlays: {
                              ...priorOverlayLedgerHost.operational.overlays,
                              [kindLedgerOverlay]:
                                !priorOverlayLedgerHost.operational.overlays[kindLedgerOverlay],
                            },
                          }),
                        )
                      : priorOverlayLedgerHost,
                  )
                }
              />
            </label>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/40">
        <InspectionMockCards />
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Preset</dt>
            <dd className="font-semibold text-slate-900">
              {activeOperationalDefLedger ? OPERATIONAL_PRESET_LABELS[activeOperationalDefLedger.preset] : "—"}
            </dd>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Setup crew</dt>
            <dd>{staffingFromActiveStateLedger.setupCrew}</dd>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Ushers</dt>
            <dd>{staffingFromActiveStateLedger.ushers}</dd>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.2em] text-slate-400">AV duty</dt>
            <dd>{staffingFromActiveStateLedger.avDuty ? "Live" : "Standby"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );

  const renderTimelinePanelLedger = () => (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/40">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          Lifecycle states
        </p>
        <div className="mt-3 space-y-2">
          {ROOM_SET_TIMELINE_STATE_CONCEPTS.map((stateLedger, indexLedger) => (
            <div
              key={stateLedger}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[10px] font-semibold text-white">
                {indexLedger + 1}
              </span>
              <div>
                <p className="text-[12px] font-semibold text-slate-900">{stateLedger}</p>
                <p className="text-[10px] text-slate-500">Future state snapshot</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/40">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold"
            onClick={() => revisePlaybackRunningLedger((priorPlaybackLedgerHost) => !priorPlaybackLedgerHost)}
          >
            {playbackRunningLedger ? <Pause className="h-3 w-3" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
            {playbackRunningLedger ? "Pause" : "Run preview"}
          </button>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold"
            onClick={() => revisePlaybackClockMsLedger(0)}
          >
            Reset scrub
          </button>
          <label className="flex flex-col text-[10px] font-semibold text-slate-500">
            Sim mode
            <select
              className="mt-1 rounded-xl border border-slate-200 bg-white px-2 py-1 text-[12px]"
              value={operationalProgramLedger?.simulation.mode ?? "authoring"}
              onChange={(evtSimLedgerHost) =>
                reviseDocumentLedger((priorLedgerHostSim) =>
                  priorLedgerHostSim?.operational
                    ? rebuildOperationalTransitions(
                        patchOperationalProgram(priorLedgerHostSim, {
                          simulation: {
                            ...priorLedgerHostSim.operational.simulation,
                            mode: evtSimLedgerHost.target.value as SimulationModeKind,
                          },
                        }),
                      )
                    : priorLedgerHostSim,
                )
              }
            >
              {SIMULATION_MODE_OPTIONS.map((modeLedgerPlayback) => (
                <option key={modeLedgerPlayback} value={modeLedgerPlayback}>
                  {modeLedgerPlayback.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 font-mono text-[10px] text-slate-700">
          {playbackMomentLedger
            ? `${playbackMomentLedger.segment.kind === "dwell" ? "Dwell" : "Transition"} · ${Math.round(playbackMomentLedger.localProgress01 * 100)}% · ${playbackPlanDurationMs(playbackPlanLedger)}ms timeline`
            : "Build operational program timeline to enable playback mocks."}
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-4 text-[11px] text-slate-700 marker:text-slate-400">
          {playbackCommentaryLedger.map((commentaryHostLine) => (
            <li key={commentaryHostLine}>{commentaryHostLine}</li>
          ))}
        </ul>
      </section>
    </div>
  );

  const renderWorkspaceTabPanelLedger = () => {
    if (activeRoomSetModeLedger === "seating") return renderSeatingPanelLedger();
    if (activeWorkspaceTabLedger === "select") return null;
    if (activeWorkspaceTabLedger === "component-adder") return renderComponentAdderLedger("w-full");
    if (activeWorkspaceTabLedger === "operational") return renderOperationalPanelLedger();
    if (activeWorkspaceTabLedger === "layers") return renderLayersPanelLedger();
    if (activeWorkspaceTabLedger === "timeline") return renderTimelinePanelLedger();
    return renderGeneratePanelLedger();
  };

  const activeToolPanelLedger = renderWorkspaceTabPanelLedger();
  const activeToolPanelWidthClassLedger =
    activeRoomSetModeLedger === "seating"
      ? "w-[min(390px,calc(100vw-2rem))]"
      :
    activeWorkspaceTabLedger === "ai-generate"
      ? "w-[min(720px,calc(100vw-2rem))]"
      : "w-[min(390px,calc(100vw-2rem))]";
  const activeModeMetaLedger =
    ROOM_SET_MODES.find((modeLedger) => modeLedger.id === activeRoomSetModeLedger) ?? ROOM_SET_MODES[0];
  const selectedSeatingAttendeeAssignmentLedger = selectedSeatingAttendeeLedger
    ? seatingAssignmentByAttendeeIdLedger.get(selectedSeatingAttendeeLedger.id) ?? null
    : null;
  const selectedSeatingAttendeeTableLedger = selectedSeatingAttendeeAssignmentLedger
    ? seatingTableByIdLedger.get(selectedSeatingAttendeeAssignmentLedger.tableId) ?? null
    : null;
  const selectedSeatingAssignmentBySeatIndexLedger = selectedSeatingTableLedger
    ? new Map(
        (seatingAssignmentsByTableIdLedger.get(selectedSeatingTableLedger.id) ?? [])
          .filter((assignmentLedger) => assignmentLedger.seatIndex != null)
          .map((assignmentLedger) => [assignmentLedger.seatIndex as number, assignmentLedger] as const),
      )
    : new Map<number, EmbeddedSeatingAssignment>();
  const prototypeZoomPercentLedger = Math.round(prototypeZoomLedger * 100);
  const prototypeZoomOptionsLedger = [60, 75, 100, 125, 150, 200, 300].includes(prototypeZoomPercentLedger)
    ? [60, 75, 100, 125, 150, 200, 300]
    : [...[60, 75, 100, 125, 150, 200, 300], prototypeZoomPercentLedger].sort((leftLedger, rightLedger) => leftLedger - rightLedger);
  const roomSetSessionOptionsLedger = matrixSnapshotLedger?.sessions ?? (sessionLedger ? [sessionLedger] : []);
  const roomSetContextMetaLedger = `${sessionLedger.roomName || "Room TBD"} · ${formatRoomSetShortDate(
    sessionLedger.date,
  )} · ${formatRoomSetTime(sessionLedger.startTime) || "Time not set"}`;
  const selectedSeatingVisualSeatRowsLedger = selectedSeatingTableLedger
    ? Array.from({ length: selectedSeatingTableLedger.capacity }, (_, indexLedger) => ({
        chairNumber: indexLedger + 1,
        assignment: selectedSeatingAssignmentBySeatIndexLedger.get(indexLedger) ?? null,
      }))
    : [];
  const selectedSeatingTableLevelAttendeesLedger = selectedSeatingTableLedger
    ? (seatingAssignmentsByTableIdLedger.get(selectedSeatingTableLedger.id) ?? [])
        .filter((assignmentLedger) => assignmentLedger.seatIndex == null)
        .map((assignmentLedger) => seatingAttendeeByIdLedger.get(assignmentLedger.attendeeId))
        .filter((attendeeLedger): attendeeLedger is EmbeddedSeatingAttendee => Boolean(attendeeLedger))
    : [];
  const selectedFirstOpenSeatIndexLedger = selectedSeatingVisualSeatRowsLedger.find(
    (seatLedger) => !seatLedger.assignment,
  )?.chairNumber;
  const seatingInspectorLedger =
    activeRoomSetModeLedger === "seating" && (selectedSeatingTableLedger || selectedSeatingAttendeeLedger) ? (
      <aside
        className="absolute right-5 top-5 z-40 w-[min(340px,calc(100vw-2rem))] rounded-3xl border border-[rgba(148,210,255,0.16)] bg-[rgba(8,16,30,0.62)] p-4 text-slate-100 shadow-2xl shadow-slate-950/35 ring-1 ring-white/10 backdrop-blur-[22px] backdrop-saturate-150 [box-shadow:0_24px_70px_rgba(2,6,23,0.34),inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-1px_0_rgba(255,255,255,0.04)]"
        onPointerDown={(eventLedger) => eventLedger.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
              Seating Inspector
            </p>
            <h2 className="mt-1 truncate text-[14px] font-semibold text-white">
              {selectedSeatingAttendeeLedger
                ? embeddedSeatingAttendeeName(selectedSeatingAttendeeLedger)
                : selectedSeatingTableLedger?.name}
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-slate-300 transition hover:border-cyan-200/35 hover:bg-white/[0.09] hover:text-white"
            aria-label="Close seating inspector"
            title="Close inspector"
            onClick={() => {
              reviseSelectedSeatingObjectIdLedger(null);
              reviseSelectedSeatingTableIdLedger(null);
              reviseSelectedSeatingAttendeeIdLedger(null);
            }}
          >
            <CircleX className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {selectedSeatingAttendeeLedger ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Current assignment
              </p>
              <p className="mt-1 text-[12px] font-semibold text-slate-100">
                {selectedSeatingAttendeeTableLedger?.name ?? "Unassigned"}
                {selectedSeatingAttendeeAssignmentLedger?.seatIndex != null
                  ? ` · Chair ${selectedSeatingAttendeeAssignmentLedger.seatIndex + 1}`
                  : ""}
              </p>
              <p className="mt-1 truncate text-[10px] text-slate-500">
                {selectedSeatingAttendeeLedger.company ?? selectedSeatingAttendeeLedger.email ?? "No attendee context"}
              </p>
            </div>
            {selectedSeatingAttendeeAssignmentLedger ? (
              <button
                type="button"
                className="h-9 w-full rounded-xl border border-rose-200/25 bg-rose-400/[0.12] text-[11px] font-semibold text-rose-100 transition hover:border-rose-200/45 hover:bg-rose-400/[0.18]"
                disabled={seatingMutatingLedger}
                onClick={() => void optimisticUnassignEmbeddedSeatingLedger(selectedSeatingAttendeeLedger.id)}
              >
                Unassign attendee
              </button>
            ) : (
              <button
                type="button"
                className="h-9 w-full rounded-xl border border-cyan-200/25 bg-cyan-300/[0.10] text-[11px] font-semibold text-cyan-100 transition hover:border-cyan-200/45 hover:bg-cyan-300/[0.16]"
                onClick={() => revisePendingSeatingAttendeeIdLedger(selectedSeatingAttendeeLedger.id)}
              >
                Choose table on canvas
              </button>
            )}
          </div>
        ) : selectedSeatingTableLedger ? (
          <div className="mt-4 space-y-3">
            <dl className="grid grid-cols-3 gap-2">
              {[
                ["Capacity", selectedSeatingTableLedger.capacity],
                ["Assigned", assignedAttendeesForSelectedSeatingTableLedger.length],
                [
                  "Open",
                  Math.max(
                    0,
                    selectedSeatingTableLedger.capacity - assignedAttendeesForSelectedSeatingTableLedger.length,
                  ),
                ],
              ].map(([labelLedger, valueLedger]) => (
                <div
                  key={labelLedger}
                  className="rounded-2xl border border-white/10 bg-white/[0.045] px-2.5 py-2"
                >
                  <dt className="text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {labelLedger}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-white">{valueLedger}</dd>
                </div>
              ))}
            </dl>
            {pendingSeatingAttendeeLedger ? (
              <button
                type="button"
                className="h-9 w-full rounded-xl border border-cyan-200/35 bg-cyan-300/[0.12] text-[11px] font-semibold text-cyan-50 transition hover:border-cyan-200/55 hover:bg-cyan-300/[0.18] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={seatingMutatingLedger}
                onClick={() =>
                  void optimisticAssignEmbeddedSeatingLedger(
                    pendingSeatingAttendeeLedger.id,
                    selectedSeatingTableLedger.id,
                    selectedFirstOpenSeatIndexLedger == null ? null : selectedFirstOpenSeatIndexLedger - 1,
                  )
                }
              >
                Assign {embeddedSeatingAttendeeName(pendingSeatingAttendeeLedger)} to{" "}
                {selectedFirstOpenSeatIndexLedger == null ? "table" : `Chair ${selectedFirstOpenSeatIndexLedger}`}
              </button>
            ) : null}
            <div>
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Chair assignments
              </p>
              <div className="grid max-h-52 gap-1.5 overflow-y-auto pr-1">
                {selectedSeatingVisualSeatRowsLedger.map((seatLedger) => {
                  const attendeeLedger = seatLedger.assignment
                    ? seatingAttendeeByIdLedger.get(seatLedger.assignment.attendeeId) ?? null
                    : null;
                  const occupiedLedger = Boolean(attendeeLedger);
                  return (
                    <EmbeddedSeatingInspectorSeatDropRow
                      key={seatLedger.chairNumber}
                      attendee={attendeeLedger}
                      chairNumber={seatLedger.chairNumber}
                      occupied={occupiedLedger}
                      onRemove={
                        attendeeLedger
                          ? () => void optimisticUnassignEmbeddedSeatingLedger(attendeeLedger.id)
                          : undefined
                      }
                      pendingAttendee={pendingSeatingAttendeeLedger}
                      tableId={selectedSeatingTableLedger.id}
                      onClick={() => {
                        if (attendeeLedger) {
                          revisePendingSeatingAttendeeIdLedger(attendeeLedger.id);
                          return;
                        }
                        if (pendingSeatingAttendeeLedger && selectedSeatingTableLedger) {
                          void optimisticAssignEmbeddedSeatingLedger(
                            pendingSeatingAttendeeLedger.id,
                            selectedSeatingTableLedger.id,
                            seatLedger.chairNumber - 1,
                          );
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
            {selectedSeatingTableLevelAttendeesLedger.length > 0 ? (
              <div>
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Table-level attendees
                </p>
                <div className="space-y-1.5">
                  {selectedSeatingTableLevelAttendeesLedger.map((attendeeLedger) =>
                    renderEmbeddedSeatingAttendeeRowLedger(attendeeLedger, {
                      assignedTableId: selectedSeatingTableLedger.id,
                      compact: true,
                    }),
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>
    ) : null;

  return (
    <DndContext
      sensors={seatingDragSensorsLedger}
      onDragEnd={(eventLedger) => {
        void handleSeatingDragEndLedger(eventLedger);
      }}
      onDragStart={handleSeatingDragStartLedger}
    >
      <div
        className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-950 text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/65"
        onKeyDown={handleRoomSetKeyDownLedger}
        tabIndex={0}
      >
      {renderSaveConfirmOverlayLedger}
      <header className="relative z-[120] shrink-0 border-b border-white/10 bg-slate-950/95 px-2 py-2 backdrop-blur-md sm:px-3">
        <div className="flex min-h-12 w-full min-w-0 items-center gap-1.5 overflow-visible md:gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-2">
            <Link
              href={eventRunOfShowHref(eventId)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 text-[11px] font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.1]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to {terminology.runOfShow}
            </Link>
            <div className="group relative min-w-0 max-w-full flex-[1_1_14rem] sm:min-w-[12rem]">
              <div className="flex h-10 min-w-0 items-center gap-2 rounded-full border border-cyan-200/20 bg-white/[0.055] px-3 pr-8 transition group-hover:border-cyan-200/45 group-hover:bg-white/[0.09]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-white">
                    {sessionLedger.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] font-semibold leading-tight text-slate-400">
                    {roomSetContextMetaLedger}
                  </span>
                </span>
                <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-cyan-100/80" aria-hidden />
              </div>
              <select
                aria-label="Switch room/session"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={sessionId}
                onChange={(eventLedger) => handleRoomSetSessionChangeLedger(eventLedger.target.value)}
              >
                {roomSetSessionOptionsLedger.map((optionLedger) => (
                  <option key={optionLedger.id} value={optionLedger.id}>
                    {optionLedger.title} - {optionLedger.roomName} - {formatRoomSetShortDate(optionLedger.date)} {formatRoomSetTime(optionLedger.startTime)}
                  </option>
                ))}
              </select>
            </div>

          </div>

          <div className="flex shrink-0 items-center justify-center gap-1.5" aria-label="Command cluster">
            {ROOM_SET_WORKSPACE_TABS.map((tabLedger) => {
              const activeLedger =
                activeRoomSetModeLedger === "layout" &&
                activeWorkspaceTabLedger === tabLedger.id &&
                controlsExpandedLedger;
              const TabIconLedger = tabLedger.icon;
              const isPrimaryLedger = tabLedger.id === "ai-generate";
              return (
                <button
                  key={tabLedger.id}
                  type="button"
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[11px] font-semibold transition ${
                    activeLedger
                      ? "border-cyan-200/75 bg-cyan-300/[0.18] text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.16)]"
                      : isPrimaryLedger
                        ? "border-cyan-200/55 bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/25 hover:bg-cyan-200"
                        : "border-cyan-200/25 bg-white/[0.075] text-slate-100 hover:border-cyan-200/50 hover:bg-white/[0.12]"
                  }`}
                  onClick={() => handlePrimaryToolClickLedger(tabLedger.id)}
                >
                  <TabIconLedger className="h-3.5 w-3.5" aria-hidden />
                  {tabLedger.label}
                </button>
              );
            })}
          </div>

          <div
            className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 md:gap-2"
            role="group"
            aria-label="Secondary Room Set controls"
          >
            <div className="group relative z-[130] min-w-0 shrink">
              <button
                type="button"
                aria-expanded={roomSizeEditorOpenLedger}
                aria-describedby={roomSizeEditorOpenLedger ? undefined : "room-set-room-size-tooltip"}
                className="inline-flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full border border-cyan-200/20 bg-white/[0.055] px-2.5 text-[11px] font-semibold text-cyan-100 transition hover:border-cyan-200/45 hover:bg-white/[0.09] sm:max-w-[178px]"
                onClick={openRoomSizeEditorLedger}
              >
                <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">
                  Room: {Math.round(activeSliceLedger.boundary.widthLu)} × {Math.round(activeSliceLedger.boundary.depthLu)} ft
                </span>
              </button>
              {!roomSizeEditorOpenLedger ? (
                <span
                  id="room-set-room-size-tooltip"
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-full z-[160] mt-2 -translate-x-1/2 rounded-md border border-white/10 bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-slate-100 opacity-0 shadow-xl shadow-slate-950/40 ring-1 ring-black/20 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  Edit room size
                </span>
              ) : null}
              {roomSizeEditorOpenLedger ? (
                <div
                  className="absolute left-0 top-10 z-[170] w-72 rounded-2xl border border-cyan-100/20 bg-slate-950/95 p-3 text-slate-100 shadow-2xl shadow-slate-950/50 ring-1 ring-white/10 backdrop-blur-xl"
                  onPointerDown={(eventLedger) => eventLedger.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
                        Room size
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">Scale: 1/8&quot; = 1ft</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-slate-400 transition hover:border-cyan-200/35 hover:text-white"
                      aria-label="Close room size editor"
                      onClick={() => reviseRoomSizeEditorOpenLedger(false)}
                    >
                      <CircleX className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <label className="min-w-0 space-y-2">
                      <span className="block text-[10px] font-semibold text-slate-400">Width</span>
                      <input
                        type="number"
                        min={10}
                        step={1}
                        className="h-9 w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.055] px-2 text-[12px] font-semibold text-cyan-50 outline-none focus:border-cyan-200/55"
                        value={roomWidthDraftLedger}
                        onChange={(eventLedger) => reviseRoomWidthDraftLedger(eventLedger.target.value)}
                      />
                    </label>
                    <label className="min-w-0 space-y-2">
                      <span className="block text-[10px] font-semibold text-slate-400">Depth</span>
                      <input
                        type="number"
                        min={10}
                        step={1}
                        className="h-9 w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.055] px-2 text-[12px] font-semibold text-cyan-50 outline-none focus:border-cyan-200/55"
                        value={roomDepthDraftLedger}
                        onChange={(eventLedger) => reviseRoomDepthDraftLedger(eventLedger.target.value)}
                      />
                    </label>
                  </div>
                  {roomSizeIssueLedger ? (
                    <p className="mt-2 text-[10px] font-semibold text-rose-200">{roomSizeIssueLedger}</p>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      className="h-8 rounded-full border border-white/10 px-3 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                      onClick={() => reviseRoomSizeEditorOpenLedger(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded-full bg-cyan-300 px-3 text-[11px] font-semibold text-slate-950 transition hover:bg-cyan-200"
                      onClick={applyRoomSizeDraftLedger}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <select
                aria-label="Room Set zoom"
                title="Room Set zoom"
                className="h-8 w-[76px] rounded-full border border-white/10 bg-white/[0.045] px-2 text-[11px] font-semibold text-cyan-100 shadow-inner shadow-white/[0.02] outline-none transition hover:border-cyan-200/35 focus:border-cyan-200/60"
                value={prototypeZoomPercentLedger}
                onChange={(eventLedger) => {
                  issuePrototypeZoomCommandLedger("set", Number(eventLedger.target.value) / 100);
                }}
              >
                {prototypeZoomOptionsLedger.map((zoomPercentLedger) => (
                  <option key={zoomPercentLedger} value={zoomPercentLedger}>
                    {zoomPercentLedger}%
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Zoom out"
                title="Zoom out"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-slate-200 transition hover:border-cyan-200/35 hover:bg-white/[0.08] hover:text-white"
                onClick={() => issuePrototypeZoomCommandLedger("zoom-out")}
              >
                <ZoomOut className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                title="Zoom in"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-slate-200 transition hover:border-cyan-200/35 hover:bg-white/[0.08] hover:text-white"
                onClick={() => issuePrototypeZoomCommandLedger("zoom-in")}
              >
                <ZoomIn className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Reset zoom"
                title="Reset"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-slate-200 transition hover:border-cyan-200/35 hover:bg-white/[0.08] hover:text-white"
                onClick={() => issuePrototypeZoomCommandLedger("reset")}
              >
                <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>

            <div
              className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.045] px-2 text-[11px] font-semibold text-slate-300"
              role="group"
              aria-label="Grid controls"
            >
              <span className="text-[10px] font-semibold text-slate-400">Grid</span>
              <button
                type="button"
                aria-label="Toggle snap to grid"
                aria-pressed={snapEnabledLedger}
                title="Toggle snap to grid"
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
                  snapEnabledLedger
                    ? "border-cyan-200/55 bg-cyan-300 text-slate-950"
                    : "border-white/10 bg-white/[0.08]"
                }`}
                onClick={() => reviseSnapEnabledLedger((priorLedger) => !priorLedger)}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              </button>
              <select
                aria-label="Grid size"
                title="Grid size"
                className="h-6 w-[58px] bg-transparent text-[11px] font-semibold text-cyan-100 outline-none"
                value={gridStrideLuLedger}
                onChange={(eventLedger) => reviseGridStrideLuLedger(Math.max(1, Number(eventLedger.target.value)))}
              >
                {[1, 2, 5, 10, 15, 20].map((gridLedger) => (
                  <option key={gridLedger} value={gridLedger}>
                    {gridLedger} ft
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              aria-label="Import room layout"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-500"
              disabled
              title="Import room layout coming soon"
            >
              <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="sr-only">Import</span>
            </button>
            <button
              type="button"
              aria-label="Save draft"
              title="Save draft"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-cyan-300 px-3 text-[11px] font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200"
              onClick={() => reviseSaveConfirmOpenLedger(true)}
            >
              <Save className="h-3.5 w-3.5" aria-hidden />
              Save
            </button>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main
          className="relative min-w-0 flex-1 overflow-visible bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.10),transparent_34%),linear-gradient(135deg,#020617,#0f172a_58%,#020617)] p-3"
          onPointerDown={() => {
            if (activeRoomSetModeLedger !== "layout") return;
            closeOpenSidePanelLedger();
          }}
        >
          {controlsExpandedLedger && activeToolPanelLedger ? (
            <aside
              className={`absolute left-5 top-5 z-40 max-h-[calc(100%-2.5rem)] ${activeToolPanelWidthClassLedger} overflow-auto rounded-3xl border border-[rgba(148,210,255,0.16)] bg-[rgba(8,16,30,0.58)] p-3 text-slate-100 shadow-2xl shadow-slate-950/35 ring-1 ring-white/10 backdrop-blur-[22px] backdrop-saturate-150 [box-shadow:0_24px_70px_rgba(2,6,23,0.34),inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-1px_0_rgba(255,255,255,0.04)]`}
              onPointerDown={(eventLedger) => eventLedger.stopPropagation()}
            >
              {activeToolPanelLedger}
            </aside>
          ) : null}
          {layoutTransferHintLedger ? (
            <p
              role="status"
              className="absolute bottom-5 left-5 z-20 max-w-lg rounded-xl border border-cyan-200/20 bg-cyan-950/90 px-3 py-2 text-[10px] leading-snug text-cyan-50 shadow-xl shadow-slate-950/35"
            >
              {layoutTransferHintLedger}
            </p>
          ) : null}
          {activeRoomSetModeLedger === "layout" ? (
            <section className="absolute inset-3 overflow-hidden rounded-[1.4rem] border border-cyan-100/15 bg-slate-950 shadow-2xl shadow-slate-950/50 ring-1 ring-white/[0.04]">
              <PlannerScenePrototypeCanvas
                fitRequestNonce={prototypeFitNonceLedger}
                gridStrideLu={gridStrideLuLedger}
                snapEnabled={snapEnabledLedger}
                zoomCommand={prototypeZoomCommandLedger}
                onZoomChange={revisePrototypeZoomLedger}
                onDraftSceneChange={handlePrototypeDraftSceneChangeLedger}
                roomName={sessionLedger.roomName}
                scene={prototypeSceneLedger}
                selectionClearNonce={prototypeSelectionClearNonceLedger}
              />
            </section>
          ) : activeRoomSetModeLedger === "seating" ? (
            <>
              <section className="absolute inset-3 overflow-hidden rounded-[1.4rem] border border-cyan-100/15 bg-slate-950 shadow-2xl shadow-slate-950/50 ring-1 ring-white/[0.04]">
                <PlannerScenePrototypeCanvas
                  fitRequestNonce={prototypeFitNonceLedger}
                  gridStrideLu={gridStrideLuLedger}
                  snapEnabled={snapEnabledLedger}
                  interactionMode="seating"
                  zoomCommand={prototypeZoomCommandLedger}
                  onZoomChange={revisePrototypeZoomLedger}
                  onDraftSceneChange={handlePrototypeDraftSceneChangeLedger}
                  onSeatingObjectSelect={handleSeatingCanvasObjectSelectLedger}
                  roomName={sessionLedger.roomName}
                  scene={prototypeSceneLedger}
                  seatingOverlays={seatingOverlayByObjectIdLedger}
                  selectedSeatingObjectId={selectedSeatingObjectIdLedger}
                  selectionClearNonce={prototypeSelectionClearNonceLedger}
                />
              </section>
              {seatingInspectorLedger}
            </>
          ) : (
            <RoomSetModePlaceholderLedger eyebrow="Coming soon" title={`${activeModeMetaLedger.label} workspace`}>
              This mode is reserved for a later phase.
            </RoomSetModePlaceholderLedger>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <nav className="pointer-events-auto flex max-w-full items-center justify-center gap-1 overflow-hidden rounded-full border border-white/10 bg-slate-950/80 p-1 shadow-2xl shadow-slate-950/40 ring-1 ring-white/[0.04] backdrop-blur-xl">
              {ROOM_SET_MODES.map((modeLedger) => {
                const activeLedger = modeLedger.id === activeRoomSetModeLedger;
                const ModeIconLedger = modeLedger.icon;
                return (
                  <button
                    key={modeLedger.id}
                    type="button"
                    disabled={modeLedger.disabled}
                    title={modeLedger.disabled ? "Coming soon" : modeLedger.label}
                    className={`inline-flex h-10 min-w-[92px] items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition ${
                      activeLedger
                        ? "bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30"
                        : modeLedger.disabled
                          ? "cursor-not-allowed text-slate-600"
                          : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
                    }`}
                    onClick={() => {
                      if (modeLedger.disabled) return;
                      setRoomSetModeLedger(modeLedger.id);
                    }}
                  >
                    <ModeIconLedger className="h-3.5 w-3.5" aria-hidden />
                    {modeLedger.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </main>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeSeatingDragAttendeeLedger ? (
          <div className="min-w-56 rounded-2xl border border-cyan-200/45 bg-slate-950/82 px-3 py-2 text-slate-100 shadow-2xl shadow-cyan-950/30 ring-1 ring-white/10 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-cyan-300/[0.12] text-[10px] font-semibold text-cyan-50">
                {embeddedSeatingInitials(activeSeatingDragAttendeeLedger)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold">
                  {embeddedSeatingAttendeeName(activeSeatingDragAttendeeLedger)}
                </span>
                <span className="block text-[9px] text-cyan-100/70">Drop on an open chair</span>
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
      </div>
    </DndContext>
  );
}
