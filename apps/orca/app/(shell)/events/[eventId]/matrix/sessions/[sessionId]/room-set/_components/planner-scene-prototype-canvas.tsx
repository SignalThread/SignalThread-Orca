"use client";

import { useDroppable } from "@dnd-kit/core";
import { X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { PlannerScene, PlannerSceneObject } from "@/lib/room-set/planner-scene";
import {
  plannerSeatPositionsForChairBlock,
  plannerSeatPositionsForTable,
  type PlannerSeatPosition,
  type PlannerSeatSurfaceShape,
} from "@/lib/room-set/planner-seat-positions";
import {
  plannerScenePointerExceededDragThreshold,
  resolvePlannerSceneHitTarget,
} from "@/lib/room-set/planner-scene-hit-testing";
import { getRoomSetComponent } from "@/lib/room-set/component-library";
import { formatRoomSetCanvasTableLabel } from "@/lib/room-set/canvas-table-label";
import {
  layoutLuToPx,
  layoutPxToLu,
  plannerLuRectToPxRect,
} from "@/lib/room-set/room-units";

import { DraftNumberInput } from "./draft-number-input";

type SeatingCanvasChairDropData = Readonly<{
  type: "chair";
  tableId: string;
  seatIndex: number;
  occupied: boolean;
}>;

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3.2;
const ZOOM_STEP = 0.14;
const VIEWPORT_PADDING_PX = 56;

export type PlannerSceneZoomCommand = Readonly<{
  nonce: number;
  action: "zoom-out" | "zoom-in" | "reset" | "set";
  zoom?: number;
}>;

type PlannerScenePrototypeCanvasProps = Readonly<{
  scene: PlannerScene | null;
  roomName?: string | null;
  gridStrideLu?: number | null;
  snapEnabled?: boolean;
  fitRequestNonce?: number;
  zoomCommand?: PlannerSceneZoomCommand | null;
  onZoomChange?: (zoom: number) => void;
  onDraftSceneChange?: (scene: PlannerScene | null) => void;
  selectionClearNonce?: number;
  interactionMode?: "layout" | "seating";
  seatingOverlays?: Readonly<Record<string, PlannerSceneSeatingOverlay>>;
  selectedSeatingObjectId?: string | null;
  onSeatingObjectSelect?: (
    object: PlannerSceneObject | null,
    overlay: PlannerSceneSeatingOverlay | null,
    seatIndex: number | null,
  ) => void;
}>;

export type PlannerSceneSeatingOverlay = Readonly<{
  tableId: string;
  tableName: string;
  tableSortOrder?: number;
  assignedCount: number;
  capacity: number;
  attendeeNames: readonly string[];
  occupiedSeatIndexes: readonly number[];
  isFull: boolean;
}>;

type PrototypeInteractionState =
  | Readonly<{
      mode: "pan";
      pointerId: number;
      x: number;
      y: number;
    }>
  | Readonly<{
      mode: "move";
      pointerId: number;
      x: number;
      y: number;
      objectId: string;
      startXLu: number;
      startYLu: number;
      dragStarted: boolean;
    }>;

type PrototypeDragPreview = Readonly<{
  objectId: string;
  xLu: number;
  yLu: number;
}>;

type PrototypeViewportSize = Readonly<{ width: number; height: number }>;

type PrototypeObjectPalette = Readonly<{
  shell: string;
  fill: string;
  label: string;
  accent: string;
  badge: string;
  glow: string;
  rim: string;
}>;

type PrototypeEditableProperty =
  | "label"
  | "width"
  | "depth"
  | "rotation"
  | "scale"
  | "chairCount"
  | "chairRows"
  | "chairsPerRow"
  | "chairSpacing"
  | "rowSpacing";

type PrototypeEditConfig = Readonly<{
  title: string;
  properties: readonly PrototypeEditableProperty[];
  minWidthLu: number;
  maxWidthLu: number;
  minDepthLu: number;
  maxDepthLu: number;
  uniformScale?: boolean;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fittedScenePan(input: Readonly<{
  viewportWidthPx: number;
  viewportHeightPx: number;
  roomWidthPx: number;
  roomHeightPx: number;
  fitScale: number;
}>): Readonly<{ x: number; y: number }> {
  return {
    x: (input.viewportWidthPx - input.roomWidthPx * input.fitScale) / 2,
    y: (input.viewportHeightPx - input.roomHeightPx * input.fitScale) / 2,
  };
}

function viewportSizeForElement(element: HTMLElement | null): PrototypeViewportSize | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const width = element.clientWidth || rect.width;
  const height = element.clientHeight || rect.height;
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

function fitScaleForRoomInViewport(input: Readonly<{
  roomWidthPx: number;
  roomHeightPx: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
}>): number {
  if (!(input.roomWidthPx > 0) || !(input.roomHeightPx > 0)) return 1;
  if (!(input.viewportWidthPx > 0) || !(input.viewportHeightPx > 0)) return 1;
  const availableWidth = Math.max(1, input.viewportWidthPx - VIEWPORT_PADDING_PX * 2);
  const availableHeight = Math.max(1, input.viewportHeightPx - VIEWPORT_PADDING_PX * 2);
  return Math.min(availableWidth / input.roomWidthPx, availableHeight / input.roomHeightPx, 1.4);
}

function normalizePrototypeGridStrideLu(value: number | null | undefined): number {
  if (!Number.isFinite(value) || value == null || value <= 0) return 1;
  return clamp(Math.round(value), 1, 48);
}

function normalizePrototypeSnapStrideLu(value: number | null | undefined): number | null {
  if (!Number.isFinite(value) || value == null || value <= 0) return null;
  return clamp(Math.round(value), 1, 48);
}

function snapLu(value: number, strideLu: number | null): number {
  if (!strideLu) return value;
  return Math.round(value / strideLu) * strideLu;
}

function resolveDraggedObjectPosition(input: Readonly<{
  interaction: Extract<PrototypeInteractionState, { mode: "move" }>;
  clientX: number;
  clientY: number;
  finalScale: number;
  roomWidthLu: number;
  roomDepthLu: number;
  objectWidthLu: number;
  objectDepthLu: number;
  snapStrideLu: number | null;
}>): Readonly<{ xLu: number; yLu: number }> {
  const deltaXLu = layoutPxToLu((input.clientX - input.interaction.x) / input.finalScale);
  const deltaYLu = layoutPxToLu((input.clientY - input.interaction.y) / input.finalScale);
  const maxXLu = Math.max(0, input.roomWidthLu - input.objectWidthLu);
  const maxYLu = Math.max(0, input.roomDepthLu - input.objectDepthLu);
  const rawXLu = input.interaction.startXLu + deltaXLu;
  const rawYLu = input.interaction.startYLu + deltaYLu;
  return {
    xLu: clamp(snapLu(rawXLu, input.snapStrideLu), 0, maxXLu),
    yLu: clamp(snapLu(rawYLu, input.snapStrideLu), 0, maxYLu),
  };
}

function normalizeRotationDeg(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(((value % 360) + 360) % 360);
}

export function isPrototypeMovableObject(object: PlannerSceneObject): boolean {
  if (isDoorObject(object)) return true;
  if (object.componentId === "wall-pipe-drape") return true;
  if (object.source.kind === "manual") return true;
  return object.objectType !== "aisle_zone" && object.metadata.visualVariant !== "wall";
}

function isDoorObject(object: PlannerSceneObject): boolean {
  return object.componentId === "door-entry" || object.metadata.visualVariant === "door";
}

function isLoungeChairObject(object: PlannerSceneObject): boolean {
  return (
    object.componentId === "lounge-chair" ||
    object.componentId === "seating-lounge-chair" ||
    (object.metadata.componentCategory === "lounge" && object.metadata.visualVariant === "chair")
  );
}

function isRectangularBanquetTableObject(object: PlannerSceneObject): boolean {
  return (
    object.componentId === "table-banquet-6ft" ||
    (object.objectType === "banquet_table" && object.metadata.visualVariant === "rect") ||
    (object.objectType === "classroom_table" && object.metadata.visualVariant === "rect")
  );
}

function isEditableChairObject(object: PlannerSceneObject): boolean {
  return (
    object.objectType === "chair_block" &&
    object.metadata.componentCategory === "seating" &&
    (object.componentId === "seating-theater-row" ||
      object.componentId.startsWith("seating-chair-"))
  );
}

function isSingleEditableChairObject(object: PlannerSceneObject): boolean {
  return object.componentId === "seating-chair-single" || object.capacity.seated <= 1;
}

export function chairRowCountForObject(object: PlannerSceneObject): number {
  const capacity = Math.max(1, Math.round(object.capacity.seated));
  if (capacity <= 1) return 1;
  const isBlock =
    object.componentId === "seating-chair-block-20" ||
    object.componentId === "seating-chair-block-custom" ||
    (object.objectType === "chair_block" && object.transform.depthLu >= 7);
  if (!isBlock) return 1;
  return Math.max(1, Math.min(capacity, Math.round(object.transform.depthLu / 5)));
}

function chairColumnsForObject(object: PlannerSceneObject): number {
  const capacity = Math.max(1, Math.round(object.capacity.seated));
  return Math.max(1, Math.ceil(capacity / chairRowCountForObject(object)));
}

function chairSpacingLuForObject(object: PlannerSceneObject): number {
  return Number((object.transform.widthLu / chairColumnsForObject(object)).toFixed(2));
}

function chairRowSpacingLuForObject(object: PlannerSceneObject): number {
  return Number((object.transform.depthLu / chairRowCountForObject(object)).toFixed(2));
}

function chairFootprintForEdit(input: Readonly<{
  chairCount: number;
  rows: number;
  chairSpacingLu: number;
  rowSpacingLu: number;
}>): Readonly<{ widthLu: number; depthLu: number }> {
  const chairCount = Math.max(1, Math.min(200, Math.round(input.chairCount)));
  const rows = Math.max(1, Math.min(chairCount, Math.round(input.rows)));
  const columns = Math.max(1, Math.ceil(chairCount / rows));
  return {
    widthLu: Number(clamp(columns * input.chairSpacingLu, 2.4, 120).toFixed(2)),
    depthLu: Number(clamp(rows * input.rowSpacingLu, 2.8, 80).toFixed(2)),
  };
}

function editableConfigForObject(object: PlannerSceneObject): PrototypeEditConfig | null {
  if (isEditableChairObject(object)) {
    return {
      title: isSingleEditableChairObject(object) ? "Single chair" : "Chair row / block",
      properties: isSingleEditableChairObject(object)
        ? ["label", "rotation"]
        : [
            "label",
            "chairCount",
            "chairRows",
            "chairsPerRow",
            "chairSpacing",
            "rowSpacing",
            "rotation",
          ],
      minWidthLu: 2.4,
      maxWidthLu: 120,
      minDepthLu: 2.8,
      maxDepthLu: 80,
    };
  }
  if (isDoorObject(object)) {
    return {
      title: "Door / entry",
      properties: ["label", "width", "rotation"],
      minWidthLu: 2,
      maxWidthLu: 40,
      minDepthLu: 0.8,
      maxDepthLu: 2,
    };
  }
  if (object.objectType === "stage") {
    return {
      title: "Stage",
      properties: ["label", "width", "depth"],
      minWidthLu: 8,
      maxWidthLu: 80,
      minDepthLu: 4,
      maxDepthLu: 40,
    };
  }
  if (object.objectType === "screen") {
    return {
      title: "Screen / backdrop",
      properties: ["label", "width"],
      minWidthLu: 6,
      maxWidthLu: 96,
      minDepthLu: 0.5,
      maxDepthLu: 6,
    };
  }
  if (object.metadata.componentCategory === "booths") {
    return {
      title: "Booth",
      properties: ["label", "width", "depth"],
      minWidthLu: 4,
      maxWidthLu: 50,
      minDepthLu: 4,
      maxDepthLu: 50,
    };
  }
  if (
    object.objectType === "buffet" ||
    object.objectType === "bar" ||
    object.componentId === "fnb-coffee-station"
  ) {
    return {
      title: "F&B service",
      properties: ["label", "width", "depth", "rotation"],
      minWidthLu: 4,
      maxWidthLu: 48,
      minDepthLu: 2,
      maxDepthLu: 16,
    };
  }
  if (object.objectType === "registration_desk") {
    return {
      title: "Registration / check-in",
      properties: ["label", "width", "depth"],
      minWidthLu: 4,
      maxWidthLu: 40,
      minDepthLu: 2,
      maxDepthLu: 14,
    };
  }
  if (object.componentId === "av-foh-control") {
    return {
      title: "FOH / AV control",
      properties: ["label", "width", "depth"],
      minWidthLu: 4,
      maxWidthLu: 40,
      minDepthLu: 3,
      maxDepthLu: 24,
    };
  }
  if (object.componentId === "wall-pipe-drape" || object.metadata.visualVariant === "wall") {
    return {
      title: "Wall / divider",
      properties: ["label", "width", "depth", "rotation"],
      minWidthLu: 4,
      maxWidthLu: 160,
      minDepthLu: 0.5,
      maxDepthLu: 8,
    };
  }
  if (object.componentId === "decor-plant-cluster") {
    return {
      title: "Decor cluster",
      properties: ["scale"],
      minWidthLu: 2,
      maxWidthLu: 12,
      minDepthLu: 2,
      maxDepthLu: 12,
      uniformScale: true,
    };
  }
  return null;
}

function objectPalette(object: PlannerSceneObject): PrototypeObjectPalette {
  const category = object.metadata.componentCategory;

  if (isDoorObject(object)) {
    return {
      shell: "border-slate-500/55 bg-slate-800",
      fill:
        "bg-[linear-gradient(180deg,rgba(203,213,225,0.96),rgba(100,116,139,0.88)_58%,rgba(51,65,85,0.94)_100%)]",
      label: "text-slate-100",
      accent: "bg-slate-800/78",
      badge: "bg-slate-950/88 text-slate-100 ring-1 ring-slate-200/20",
      glow: "shadow-[0_14px_28px_rgba(2,6,23,0.22)]",
      rim: "bg-slate-950/70",
    };
  }

  if (category === "booths") {
    return {
      shell: "border-cyan-300/28 bg-slate-800",
      fill:
        "bg-[linear-gradient(180deg,rgba(71,85,105,0.96),rgba(30,64,75,0.94)_54%,rgba(12,37,49,0.98)_100%)]",
      label: "text-cyan-50",
      accent: "bg-cyan-800/82",
      badge: "bg-cyan-950/90 text-cyan-100 ring-1 ring-cyan-200/18",
      glow: "shadow-[0_16px_34px_rgba(2,6,23,0.30)]",
      rim: "bg-cyan-950/78",
    };
  }

  if (isLoungeChairObject(object)) {
    return {
      shell: "border-rose-200/24 bg-slate-800",
      fill:
        "bg-[linear-gradient(180deg,rgba(100,76,88,0.96),rgba(76,39,55,0.93)_52%,rgba(42,22,34,0.98)_100%)]",
      label: "text-rose-50",
      accent: "bg-rose-900/78",
      badge: "bg-rose-950/90 text-rose-100 ring-1 ring-rose-200/16",
      glow: "shadow-[0_16px_34px_rgba(2,6,23,0.28)]",
      rim: "bg-rose-950/76",
    };
  }

  if (object.objectType === "stage") {
    return {
      shell: "border-amber-200/26 bg-amber-950",
      fill:
        "bg-[linear-gradient(180deg,rgba(134,94,55,0.96),rgba(91,57,32,0.95)_48%,rgba(39,24,16,0.98)_100%)]",
      label: "text-amber-50",
      accent: "bg-amber-950/78",
      badge: "bg-amber-950/92 text-amber-100 ring-1 ring-amber-200/16",
      glow: "shadow-[0_20px_42px_rgba(2,6,23,0.34)]",
      rim: "bg-amber-950/82",
    };
  }

  if (object.objectType === "screen") {
    return {
      shell: "border-slate-700/85 bg-slate-950",
      fill:
        "bg-[linear-gradient(180deg,rgba(8,15,32,0.98),rgba(15,23,42,0.96)_48%,rgba(8,145,178,0.86)_100%)]",
      label: "text-cyan-100",
      accent: "bg-cyan-400/85",
      badge: "bg-slate-950/92 text-cyan-100 ring-1 ring-cyan-400/20",
      glow: "shadow-[0_18px_36px_rgba(8,47,73,0.3)]",
      rim: "bg-slate-950/84",
    };
  }

  if (object.objectType === "registration_desk") {
    return {
      shell: "border-emerald-200/24 bg-slate-800",
      fill:
        "bg-[linear-gradient(180deg,rgba(64,82,72,0.96),rgba(33,59,49,0.94)_52%,rgba(15,32,30,0.98)_100%)]",
      label: "text-emerald-50",
      accent: "bg-lime-700/78",
      badge: "bg-emerald-950/90 text-emerald-100 ring-1 ring-emerald-200/16",
      glow: "shadow-[0_16px_34px_rgba(2,6,23,0.28)]",
      rim: "bg-emerald-950/76",
    };
  }

  if (object.objectType === "bar") {
    return {
      shell: "border-orange-200/22 bg-slate-800",
      fill:
        "bg-[linear-gradient(180deg,rgba(97,67,48,0.96),rgba(67,44,32,0.95)_52%,rgba(28,20,17,0.98)_100%)]",
      label: "text-orange-50",
      accent: "bg-orange-900/82",
      badge: "bg-orange-950/90 text-orange-100 ring-1 ring-orange-200/16",
      glow: "shadow-[0_16px_34px_rgba(2,6,23,0.28)]",
      rim: "bg-orange-950/76",
    };
  }

  if (object.objectType === "buffet") {
    return {
      shell: "border-rose-200/22 bg-slate-800",
      fill:
        "bg-[linear-gradient(180deg,rgba(93,68,74,0.96),rgba(65,38,45,0.95)_52%,rgba(31,20,25,0.98)_100%)]",
      label: "text-rose-50",
      accent: "bg-rose-900/82",
      badge: "bg-rose-950/90 text-rose-100 ring-1 ring-rose-200/16",
      glow: "shadow-[0_16px_34px_rgba(2,6,23,0.28)]",
      rim: "bg-rose-950/76",
    };
  }

  if (
    object.objectType === "banquet_table" ||
    object.objectType === "classroom_table" ||
    object.metadata.visualVariant === "row"
  ) {
    return {
      shell: "border-stone-200/24 bg-stone-700",
      fill:
        "bg-[linear-gradient(180deg,rgba(214,205,190,0.96),rgba(148,133,113,0.94)_52%,rgba(82,69,55,0.98)_100%)]",
      label: "text-stone-50",
      accent: "bg-stone-700/70",
      badge: "bg-stone-950/90 text-stone-100 ring-1 ring-stone-200/16",
      glow: "shadow-[0_16px_34px_rgba(2,6,23,0.26)]",
      rim: "bg-stone-950/70",
    };
  }

  if (object.objectType === "av_table" || category === "av") {
    return {
      shell: "border-violet-200/24 bg-slate-800",
      fill:
        "bg-[linear-gradient(180deg,rgba(80,75,104,0.96),rgba(51,45,80,0.94)_52%,rgba(25,23,43,0.98)_100%)]",
      label: "text-violet-50",
      accent: "bg-violet-700/80",
      badge: "bg-violet-950/90 text-violet-100 ring-1 ring-violet-200/16",
      glow: "shadow-[0_16px_34px_rgba(2,6,23,0.30)]",
      rim: "bg-violet-950/78",
    };
  }

  if (object.objectType === "aisle_zone" || object.metadata.visualVariant === "zone") {
    if (category === "safety") {
      return {
        shell: "border-red-300/35 bg-red-950/22",
        fill:
          "bg-[linear-gradient(180deg,rgba(127,29,29,0.32),rgba(69,10,10,0.22))]",
        label: "text-red-100",
        accent: "bg-red-700/72",
        badge: "bg-red-950/86 text-red-100 ring-1 ring-red-200/16",
        glow: "shadow-[0_12px_24px_rgba(2,6,23,0.20)]",
        rim: "bg-red-950/32",
      };
    }

    if (category === "service") {
      return {
        shell: "border-slate-300/28 bg-slate-950/20",
        fill:
          "bg-[linear-gradient(180deg,rgba(71,85,105,0.28),rgba(15,23,42,0.18))]",
        label: "text-slate-100",
        accent: "bg-slate-700/75",
        badge: "bg-slate-950/86 text-slate-100 ring-1 ring-slate-200/16",
        glow: "shadow-[0_12px_24px_rgba(2,6,23,0.18)]",
        rim: "bg-slate-950/28",
      };
    }

    return {
      shell: "border-sky-300/32 bg-sky-950/22",
      fill:
        "bg-[linear-gradient(180deg,rgba(14,116,144,0.30),rgba(8,47,73,0.18))]",
      label: "text-sky-100",
      accent: "bg-sky-700/75",
      badge: "bg-sky-950/86 text-sky-100 ring-1 ring-sky-200/16",
      glow: "shadow-[0_12px_24px_rgba(2,6,23,0.18)]",
      rim: "bg-sky-950/28",
    };
  }

  return {
    shell: "border-blue-200/24 bg-slate-800",
    fill:
      "bg-[linear-gradient(180deg,rgba(69,82,115,0.96),rgba(38,52,86,0.94)_52%,rgba(18,27,49,0.98)_100%)]",
    label: "text-blue-50",
    accent: "bg-blue-700/72",
    badge: "bg-slate-950/90 text-blue-100 ring-1 ring-blue-200/16",
    glow: "shadow-[0_16px_34px_rgba(2,6,23,0.30)]",
    rim: "bg-blue-950/76",
  };
}

function objectBadgeLabel(object: PlannerSceneObject): string {
  if (object.objectType === "screen") return "Screen";
  if (object.objectType === "stage") {
    return object.name.toLowerCase().includes("riser") ? "Riser" : "Stage";
  }
  if (object.metadata.componentCategory === "booths") return "Booth";
  if (isLoungeChairObject(object)) return "Lounge";
  if (object.objectType === "bar") return "Bar";
  if (object.objectType === "buffet") return "Buffet";
  if (object.objectType === "registration_desk") return "Check-in";
  if (object.metadata.componentCategory === "decor") return "Decor";
  if (isDoorObject(object)) return "Door";
  if (object.objectType === "banquet_table") {
    return object.metadata.visualVariant === "cocktailCluster" ? "Cluster" : "Table";
  }
  if (object.metadata.visualVariant === "row") return "Audience";
  if (object.metadata.visualVariant === "zone") return "Zone";
  if (object.metadata.visualVariant === "wall") return "Divider";
  return object.metadata.componentCategory
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function objectCapacityBadgeLabel(object: PlannerSceneObject): string | null {
  if (object.capacity.seated > 0) return `${object.capacity.seated} seats`;
  if (object.capacity.staff > 0) return `${object.capacity.staff} staff`;
  return null;
}

function isDecorPlantCluster(object: PlannerSceneObject): boolean {
  return object.componentId === "decor-plant-cluster";
}

function isQueueLaneObject(object: PlannerSceneObject): boolean {
  return object.componentId === "registration-queue-lane";
}

function labelPresentation(
  widthPx: number,
  heightPx: number,
): Readonly<{
  compact: boolean;
  showBadge: boolean;
  bottomInset: number;
  multiline: boolean;
  callout: boolean;
}> {
  const compact = widthPx < 86 || heightPx < 30;
  return {
    compact,
    showBadge: widthPx >= 76 && heightPx >= 28,
    bottomInset: compact ? 5 : 9,
    multiline: widthPx >= 104 && heightPx >= 34,
    callout: true,
  };
}

function shouldShowPermanentTypeBadge(object: PlannerSceneObject, widthPx: number, heightPx: number): boolean {
  if (widthPx < 104 || heightPx < 34) return false;
  if (object.capacity.seated > 0) return false;
  if (isDecorPlantCluster(object)) return false;
  if (object.metadata.visualVariant === "wall" || isDoorObject(object)) return false;
  return true;
}

function shouldShowCapacityBadge(object: PlannerSceneObject, widthPx: number, heightPx: number): boolean {
  if (object.capacity.seated > 0) return widthPx >= 132 && heightPx >= 38;
  if (object.capacity.staff > 0) return widthPx >= 118 && heightPx >= 36;
  return false;
}

function isSeatingCriticalObject(object: PlannerSceneObject): boolean {
  return (
    object.capacity.seated > 0 &&
    (object.objectType === "banquet_table" ||
      object.objectType === "chair_block" ||
      object.objectType === "classroom_table" ||
      object.metadata.componentCategory === "seating" ||
      object.metadata.visualVariant === "row")
  );
}

function isChairSeatingObject(object: PlannerSceneObject): boolean {
  return (
    object.objectType === "chair_block" &&
    object.capacity.seated > 0 &&
    (object.metadata.componentCategory === "seating" ||
      object.metadata.visualVariant === "chair" ||
      object.metadata.visualVariant === "row")
  );
}

function PlantClusterAdornment() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <span className="absolute inset-x-[28%] bottom-[12%] h-[10%] rounded-full bg-slate-950/22 blur-[2px]" />
      <span className="absolute left-1/2 bottom-[18%] h-[30%] w-[24%] -translate-x-1/2 rounded-b-[0.22rem] rounded-t-[0.08rem] border border-stone-950/30 bg-[linear-gradient(180deg,rgba(120,113,108,0.92),rgba(68,64,60,0.96))] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" />
      <span className="absolute left-[33%] top-[18%] h-[42%] w-[16%] -rotate-[32deg] rounded-[100%_0_100%_0] border border-emerald-950/20 bg-[linear-gradient(135deg,rgba(134,239,172,0.82),rgba(21,128,61,0.92))]" />
      <span className="absolute left-[48%] top-[11%] h-[48%] w-[15%] rotate-[8deg] rounded-[100%_0_100%_0] border border-teal-950/20 bg-[linear-gradient(135deg,rgba(94,234,212,0.76),rgba(15,118,110,0.92))]" />
      <span className="absolute right-[30%] top-[20%] h-[40%] w-[15%] rotate-[35deg] rounded-[100%_0_100%_0] border border-lime-950/20 bg-[linear-gradient(135deg,rgba(190,242,100,0.76),rgba(77,124,15,0.92))]" />
      <span className="absolute left-[43%] top-[38%] h-[31%] w-[3px] -rotate-12 rounded-full bg-emerald-950/45" />
      <span className="absolute left-[54%] top-[34%] h-[35%] w-[3px] rotate-12 rounded-full bg-teal-950/42" />
    </div>
  );
}

function QueueLaneAdornment() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <div
        data-queue-part="lane-fill"
        className="absolute inset-[8%] rounded-[0.32rem] border border-cyan-100/18 bg-[linear-gradient(180deg,rgba(15,23,42,0.20),rgba(8,47,73,0.12))]"
      />
      <div
        data-queue-part="flow-line"
        className="absolute left-1/2 top-[14%] h-[72%] w-px -translate-x-1/2 bg-cyan-100/22"
      />
      <div
        data-queue-part="flow-dash"
        className="absolute left-1/2 top-[20%] h-[50%] w-px -translate-x-1/2 bg-[repeating-linear-gradient(180deg,rgba(103,232,249,0.42)_0,rgba(103,232,249,0.42)_5px,transparent_5px,transparent_11px)]"
      />
      {Array.from({ length: 4 }).map((_, index) => (
        <span
          key={`queue-stanchion-${index}`}
          data-queue-part="stanchion-post"
          className="absolute left-1/2 h-[10%] w-[54%] -translate-x-1/2"
          style={{ top: `${12 + index * 24}%` }}
        >
          <span className="absolute left-[6%] top-1/2 h-[48%] w-[9%] -translate-y-1/2 rounded-full border border-cyan-100/18 bg-slate-950/72 shadow-[0_1px_3px_rgba(2,6,23,0.22)]" />
          <span className="absolute right-[6%] top-1/2 h-[48%] w-[9%] -translate-y-1/2 rounded-full border border-cyan-100/18 bg-slate-950/72 shadow-[0_1px_3px_rgba(2,6,23,0.22)]" />
          <span className="absolute left-[13%] right-[13%] top-1/2 h-px -translate-y-1/2 bg-cyan-100/34" />
        </span>
      ))}
      <div
        data-queue-part="flow-cue"
        className="absolute bottom-[10%] left-1/2 h-[12%] w-[38%] -translate-x-1/2"
      >
        <span className="absolute left-[16%] top-1/2 h-px w-[46%] -translate-y-1/2 bg-cyan-100/45" />
        <span className="absolute right-[15%] top-1/2 h-[38%] w-[24%] -translate-y-1/2 [clip-path:polygon(0_0,100%_50%,0_100%)] bg-cyan-100/48" />
      </div>
    </div>
  );
}

type SeatingChairRenderState = Readonly<{
  occupied: boolean;
  selected: boolean;
  dragHover: boolean;
  blocked: boolean;
}>;

function ChairSvg(
  props: Readonly<{
    className: string;
    orientation?: "top" | "bottom" | "left" | "right";
    compact?: boolean;
    angleDeg?: number;
    visualWeight?: "default" | "table";
    occupied?: boolean;
    selected?: boolean;
    dragHover?: boolean;
    blocked?: boolean;
  }>,
) {
  const {
    className,
    orientation = "top",
    compact = false,
    angleDeg,
    visualWeight = "default",
    occupied = false,
    selected = false,
    dragHover = false,
    blocked = false,
  } = props;
  const orientationRotation =
    orientation === "bottom" ? 180 : orientation === "left" ? -90 : orientation === "right" ? 90 : 0;
  const rotationDeg = angleDeg ?? orientationRotation;
  const isTableChair = visualWeight === "table";
  const frameFill = blocked
    ? "#a85b5b"
    : occupied
      ? "#4b8f9a"
      : dragHover
        ? "#c5a982"
        : isTableChair
          ? "#b99a71"
          : "#b39166";
  const frameStroke = blocked
    ? "#fecdd3"
    : dragHover
      ? "#67e8f9"
      : selected
        ? "#22d3ee"
        : "#6d553b";
  const cushionFill = occupied ? "#e7fbff" : "#fffaf0";
  const cushionStroke = occupied ? "#67e8f9" : "#bda98c";
  const stateStroke = blocked ? "#fb7185" : dragHover ? "#67e8f9" : selected ? "#22d3ee" : "transparent";
  const strokeWidth = compact ? 2 : 2.4;

  return (
    <svg
      aria-hidden="true"
      className={`absolute block overflow-visible ${className}`}
      viewBox="0 0 48 56"
      preserveAspectRatio="xMidYMid meet"
      style={{ rotate: `${rotationDeg}deg` }}
    >
      <ellipse cx="24" cy="42" rx="15" ry="7" fill="#020617" opacity={dragHover || selected ? "0.18" : "0.10"} />
      <rect
        x="9"
        y="7"
        width="30"
        height="19"
        rx="5"
        fill={frameFill}
        stroke={frameStroke}
        strokeWidth={strokeWidth}
      />
      <path d="M13 11h22" stroke="#fff7ed" strokeWidth="2" strokeLinecap="round" opacity="0.34" />
      <rect
        x="6"
        y="24"
        width="36"
        height="22"
        rx="6"
        fill={cushionFill}
        stroke={cushionStroke}
        strokeWidth={strokeWidth}
      />
      <path d="M12 29h24" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity="0.58" />
      <path d="M12 40h24" stroke="#a78b69" strokeWidth="1.2" strokeLinecap="round" opacity="0.24" />
      <path d="M10 47v5M38 47v5" stroke="#5f4b34" strokeWidth="2.4" strokeLinecap="round" opacity="0.74" />
      <path d="M5 29c-2.5 4-2.5 9 0 13M43 29c2.5 4 2.5 9 0 13" stroke="#6b5135" strokeWidth="2.2" strokeLinecap="round" opacity="0.35" />
      {occupied ? <circle cx="36" cy="14" r="4" fill="#22d3ee" stroke="#ecfeff" strokeWidth="1.6" /> : null}
      {stateStroke !== "transparent" ? (
        <rect
          x="3"
          y="4"
          width="42"
          height="44"
          rx="8"
          fill="none"
          stroke={stateStroke}
          strokeWidth={dragHover || blocked ? "3" : "2"}
          opacity={blocked ? "0.9" : "0.78"}
        />
      ) : null}
    </svg>
  );
}

function RoundBanquetTableSvg() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 overflow-visible"
      viewBox="0 0 120 120"
      preserveAspectRatio="none"
    >
      <ellipse cx="60" cy="73" rx="34" ry="13" fill="#020617" opacity="0.10" />
      <circle cx="60" cy="58" r="34" fill="#e2d8c8" stroke="#b6a58d" strokeWidth="1.1" opacity="0.72" />
      <circle cx="60" cy="54" r="32" fill="#fffaf2" stroke="#cabca7" strokeWidth="1.5" />
      <circle cx="60" cy="54" r="25" fill="none" stroke="#e6dccd" strokeWidth="1.1" />
      <path d="M35 58c12 7 38 7 50 0" fill="none" stroke="#b8a68c" strokeWidth="1.1" opacity="0.34" />
      <circle cx="60" cy="54" r="6" fill="#ede0c9" stroke="#b8a68c" strokeWidth="1" />
      <circle cx="60" cy="51" r="3.2" fill="#2f6b3f" />
      <circle cx="56.5" cy="54.4" r="2.6" fill="#5f8f3f" />
      <circle cx="63.4" cy="54.5" r="2.6" fill="#4d7c36" />
      <circle cx="60" cy="57.4" r="2.3" fill="#84a95d" />
    </svg>
  );
}

function ClassroomRowSvg() {
  return (
    <svg aria-hidden="true" className="absolute inset-0 overflow-visible" viewBox="0 0 120 46" preserveAspectRatio="none">
      <rect x="6" y="19" width="108" height="12" rx="1.8" fill="#d7c8b1" stroke="#a28d70" strokeWidth="0.8" />
      <rect x="7.5" y="16" width="105" height="12" rx="2" fill="#fffaf0" stroke="#cabca6" strokeWidth="1" />
      <path d="M17 20h86" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" opacity="0.48" />
      <path d="M26 27h68" stroke="#a78b69" strokeWidth="0.75" strokeLinecap="round" opacity="0.16" />
    </svg>
  );
}

function ChairBlockSvg({ rows }: Readonly<{ rows: number }>) {
  return (
    <svg aria-hidden="true" className="absolute inset-0" viewBox="0 0 120 72" preserveAspectRatio="none">
      <ellipse cx="60" cy={rows > 1 ? 58 : 48} rx="42" ry="3" fill="#020617" opacity="0.025" />
    </svg>
  );
}

function TheaterRowSvg({ rows }: Readonly<{ rows: number }>) {
  return <ChairBlockSvg rows={rows} />;
}

function RectangularTableSvg() {
  return (
    <svg aria-hidden="true" className="absolute inset-0" viewBox="0 0 120 72" preserveAspectRatio="none">
      <ellipse cx="60" cy="47" rx="43" ry="5" fill="#020617" opacity="0.08" />
      <rect x="16" y="26" width="88" height="16" rx="2.5" fill="#d8cbb8" stroke="#9f8d75" strokeWidth="1" />
      <rect x="16" y="23" width="88" height="16" rx="2.5" fill="#fffaf0" stroke="#c9bba4" strokeWidth="1.2" />
      <path d="M23 28h74" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.52" />
      <path d="M24 36h72" stroke="#a78b69" strokeWidth="0.9" strokeLinecap="round" opacity="0.22" />
      <line x1="41" y1="25" x2="41" y2="39" stroke="#a78b69" strokeOpacity="0.13" />
      <line x1="60" y1="25" x2="60" y2="39" stroke="#a78b69" strokeOpacity="0.13" />
      <line x1="79" y1="25" x2="79" y2="39" stroke="#a78b69" strokeOpacity="0.13" />
    </svg>
  );
}

function SeatingCanvasChairDropTarget({
  children,
  className,
  column,
  kind,
  occupied,
  row,
  selected,
  seatIndex,
  style,
  tableId,
}: Readonly<{
  children: ReactNode | ((state: SeatingChairRenderState) => ReactNode);
  className: string;
  column?: number;
  kind: "table" | "chair";
  occupied: boolean;
  row?: number;
  selected: boolean;
  seatIndex: number;
  style: CSSProperties;
  tableId: string;
}>) {
  const { isOver, setNodeRef } = useDroppable({
    id: `room-set-canvas-chair:${tableId}:${seatIndex}`,
    data: {
      type: "chair",
      tableId,
      seatIndex,
      occupied,
    } satisfies SeatingCanvasChairDropData,
  });
  const renderState = {
    occupied,
    selected,
    dragHover: isOver && !occupied,
    blocked: isOver && occupied,
  } satisfies SeatingChairRenderState;

  return (
    <span
      ref={setNodeRef}
      data-room-set-chair-drop-target="true"
      data-table-seat={kind === "table" ? "true" : undefined}
      data-chair-seat={kind === "chair" ? "true" : undefined}
      data-chair-facing={kind === "chair" ? "front" : undefined}
      data-seat-kind={kind === "chair" ? "chair" : undefined}
      data-seat-index={seatIndex}
      data-chair-row={row}
      data-chair-column={column}
      aria-hidden="true"
      className={[
        className,
        isOver && !occupied
          ? "ring-2 ring-cyan-200/80 ring-offset-2 ring-offset-slate-950/40"
          : "",
        isOver && occupied
          ? "ring-2 ring-rose-300/80 ring-offset-2 ring-offset-slate-950/40"
          : "",
      ].join(" ")}
      style={style}
    >
      {typeof children === "function" ? children(renderState) : children}
    </span>
  );
}

function TableSeatMarkers({
  object,
  selected = false,
  seatLayout = "standard",
  shape,
  seatingOverlay,
}: Readonly<{
  object: PlannerSceneObject;
  selected?: boolean;
  seatLayout?: "standard" | "classroom";
  shape: PlannerSeatSurfaceShape;
  seatingOverlay?: PlannerSceneSeatingOverlay | null;
}>) {
  const seatingMode = Boolean(seatingOverlay);
  const isClassroomLayout = seatLayout === "classroom";
  const seats: PlannerSeatPosition[] = isClassroomLayout
    ? Array.from({ length: Math.max(0, object.capacity.seated) }, (_, index) => ({
        index,
        xPct:
          object.capacity.seated <= 1
            ? 50
            : 6.8 + index * (86.4 / Math.max(1, object.capacity.seated - 1)),
        yPct: 30,
        angleDeg: 0,
      }))
    : plannerSeatPositionsForTable({
        capacity: object.capacity.seated,
        shape,
        widthLu: object.transform.widthLu,
        depthLu: object.transform.depthLu,
      });
  const seatSizePct =
    isClassroomLayout
      ? seatingMode
        ? object.capacity.seated >= 10
          ? 10.5
          : 12.5
        : object.capacity.seated >= 10
          ? 8.5
          : 10
      : shape === "round"
      ? seatingMode
        ? object.capacity.seated >= 12
          ? 20
          : object.capacity.seated >= 8
            ? 21.5
            : 23
        : object.capacity.seated >= 12
          ? 15
          : object.capacity.seated >= 8
            ? 17
            : 18.5
      : seatingMode
        ? object.capacity.seated >= 12
          ? 17
          : 18.5
        : object.capacity.seated >= 12
          ? 13
          : 14.5;
  const minSeatSizePx = isClassroomLayout
    ? seatingMode
      ? 18
      : 12
    : seatingMode
      ? shape === "rectangle"
        ? 24
        : 26
      : shape === "rectangle"
        ? 16
        : 18;

  return (
    <>
      {seats.map((seat) => {
        const occupied = Boolean(
          seatingOverlay &&
            (seatingOverlay.occupiedSeatIndexes.includes(seat.index) ||
              (seatingOverlay.occupiedSeatIndexes.length === 0 && seat.index < seatingOverlay.assignedCount)),
        );
        const className = [
          "absolute",
          seatingMode
            ? occupied
              ? "rounded-full border border-cyan-200/30 bg-cyan-300/[0.04] shadow-[0_0_10px_rgba(34,211,238,0.12)]"
              : "rounded-full border border-white/10 bg-transparent"
            : "",
        ].join(" ");
        const seatXPct = isClassroomLayout
          ? seat.xPct
          : shape === "rectangle"
            ? 50 + (seat.xPct - 50) * 0.98
            : 50 + (seat.xPct - 50) * 1.08;
        const seatYPct = isClassroomLayout
          ? seat.yPct
          : shape === "rectangle"
            ? 50 + (seat.yPct - 50) * 0.88
            : 50 + (seat.yPct - 50) * 1.08;
        const seatWidthPct = isClassroomLayout ? (seats.length >= 10 ? 8.2 : 9.8) : seatSizePct;
        const seatHeightPct = isClassroomLayout ? 52 : seatSizePct;
        const style = {
          left: `${seatXPct}%`,
          top: `${seatYPct}%`,
          width: `${seatWidthPct}%`,
          height: `${seatHeightPct}%`,
          minWidth: minSeatSizePx,
          minHeight: isClassroomLayout ? 28 : minSeatSizePx,
          transform: "translate(-50%, -50%)",
        } satisfies CSSProperties;
        const renderSeatContent = (state: SeatingChairRenderState) => (
          <>
            <ChairSvg
              className="left-0 top-0 h-full w-full"
              compact
              angleDeg={seat.angleDeg}
              visualWeight="table"
              occupied={state.occupied}
              selected={state.selected}
              dragHover={state.dragHover}
              blocked={state.blocked}
            />
            {seatingMode ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-950/50 bg-slate-950/88 px-1 text-[7px] font-semibold leading-none text-cyan-50 shadow-[0_2px_5px_rgba(2,6,23,0.28)]">
                {seat.index + 1}
              </span>
            ) : null}
          </>
        );
        return seatingOverlay ? (
          <SeatingCanvasChairDropTarget
            key={`${object.id}-seat-${seat.index}`}
            className={className}
            kind="table"
            occupied={occupied}
            selected={selected}
            seatIndex={seat.index}
            style={style}
            tableId={seatingOverlay.tableId}
          >
            {renderSeatContent}
          </SeatingCanvasChairDropTarget>
        ) : (
          <span
            key={`${object.id}-seat-${seat.index}`}
            data-table-seat="true"
            data-seat-index={seat.index}
            aria-hidden="true"
            className={[className, "pointer-events-none"].join(" ")}
            style={style}
          >
            {renderSeatContent({
              occupied,
              selected,
              dragHover: false,
              blocked: false,
            })}
          </span>
        );
      })}
    </>
  );
}

function ChairBlockSeatMarkers({
  object,
  selected = false,
  seatingOverlay,
}: Readonly<{
  object: PlannerSceneObject;
  selected?: boolean;
  seatingOverlay?: PlannerSceneSeatingOverlay | null;
}>) {
  const rows = chairRowCountForObject(object);
  const seats = plannerSeatPositionsForChairBlock({
    capacity: object.capacity.seated,
    rows,
    widthLu: object.transform.widthLu,
    depthLu: object.transform.depthLu,
    chairSpacingLu: 2.4,
    rowSpacingLu: 3.2,
  });
  const seatingMode = Boolean(seatingOverlay);
  const columns = Math.max(1, Math.ceil(seats.length / rows));
  const seatWidthPct = seats.length <= 1 ? 72 : Math.max(seatingMode ? 8.6 : 6.8, Math.min(seatingMode ? 20 : 16, 84 / columns));
  const seatHeightPct = seats.length <= 1 ? 76 : Math.max(seatingMode ? 28 : 20, Math.min(58, rows === 1 ? 56 : 72 / rows));

  return (
    <>
      {seats.map((seat) => {
        const occupied = Boolean(
          seatingOverlay &&
            (seatingOverlay.occupiedSeatIndexes.includes(seat.index) ||
              (seatingOverlay.occupiedSeatIndexes.length === 0 && seat.index < seatingOverlay.assignedCount)),
        );
        const className = [
          "absolute",
          seatingMode
            ? occupied
              ? "rounded-[0.34rem] border border-cyan-200/30 bg-cyan-300/[0.04] shadow-[0_0_8px_rgba(34,211,238,0.12)]"
              : "rounded-[0.34rem] border border-white/10 bg-transparent"
            : "",
        ].join(" ");
        const style = {
          left: `${seat.xPct}%`,
          top: `${seat.yPct}%`,
          width: `${seatWidthPct}%`,
          height: `${seatHeightPct}%`,
          minWidth: seats.length <= 1 ? 24 : 14,
          minHeight: seats.length <= 1 ? 28 : 16,
          transform: "translate(-50%, -50%)",
        } satisfies CSSProperties;
        const renderSeatContent = (state: SeatingChairRenderState) => (
          <>
            <ChairSvg
              className="left-0 top-0 h-full w-full"
              orientation="bottom"
              compact
              occupied={state.occupied}
              selected={state.selected}
              dragHover={state.dragHover}
              blocked={state.blocked}
            />
            {seatingMode ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-950/50 bg-slate-950/88 px-1 text-[7px] font-semibold leading-none text-cyan-50 shadow-[0_2px_5px_rgba(2,6,23,0.28)]">
                {seat.index + 1}
              </span>
            ) : null}
          </>
        );
        return seatingOverlay ? (
          <SeatingCanvasChairDropTarget
            key={`${object.id}-chair-seat-${seat.index}`}
            className={className}
            column={seat.column}
            kind="chair"
            occupied={occupied}
            row={seat.row}
            selected={selected}
            seatIndex={seat.index}
            style={style}
            tableId={seatingOverlay.tableId}
          >
            {renderSeatContent}
          </SeatingCanvasChairDropTarget>
        ) : (
          <span
            key={`${object.id}-chair-seat-${seat.index}`}
            data-chair-seat="true"
            data-chair-facing="front"
            data-seat-kind="chair"
            data-seat-index={seat.index}
            data-chair-row={seat.row}
            data-chair-column={seat.column}
            aria-hidden="true"
            className={[className, "pointer-events-none"].join(" ")}
            style={style}
          >
            {renderSeatContent({
              occupied,
              selected,
              dragHover: false,
              blocked: false,
            })}
          </span>
        );
      })}
    </>
  );
}

function ObjectAdornment({
  object,
  selected = false,
  seatingOverlay,
}: Readonly<{
  object: PlannerSceneObject;
  selected?: boolean;
  seatingOverlay?: PlannerSceneSeatingOverlay | null;
}>) {
  if (isDoorObject(object)) {
    return (
      <>
        <div className="absolute inset-x-[10%] top-1/2 h-[18%] -translate-y-1/2 rounded-full bg-slate-950/18" />
        <div className="absolute left-[10%] right-[10%] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-slate-950/78" />
        <div className="absolute left-[10%] top-1/2 h-[42%] w-[42%] -translate-y-[95%] rounded-tl-full border-l-2 border-t-2 border-slate-800/58" />
        <div className="absolute left-[9%] top-1/2 h-[12%] w-[4%] -translate-y-1/2 rounded-full bg-slate-950/82" />
        <div className="absolute right-[9%] top-1/2 h-[12%] w-[4%] -translate-y-1/2 rounded-full bg-slate-950/82" />
      </>
    );
  }

  if (object.metadata.componentCategory === "booths") {
    return (
      <>
        <div className="absolute inset-[8%] rounded-[0.95rem] border-2 border-cyan-950/24 bg-cyan-50/20" />
        <div className="absolute inset-x-[10%] top-[10%] h-[18%] rounded-[0.5rem] border border-cyan-950/22 bg-cyan-900/78" />
        <div className="absolute inset-x-[15%] top-[15%] h-[3px] rounded-full bg-cyan-100/70" />
        <div className="absolute inset-x-[10%] bottom-[10%] top-[31%] rounded-[0.72rem] border border-cyan-950/14 bg-white/16" />
        <div className="absolute inset-y-[18%] left-[12%] w-[9%] rounded-[0.45rem] bg-cyan-950/12" />
        <div className="absolute inset-y-[18%] right-[12%] w-[9%] rounded-[0.45rem] bg-cyan-950/12" />
        <div className="absolute inset-x-[24%] bottom-[10%] h-[10%] border-t-2 border-cyan-950/18 bg-white/12" />
        <div className="absolute inset-x-[34%] bottom-[8%] h-[4%] rounded-full bg-cyan-950/16" />
      </>
    );
  }

  if (isLoungeChairObject(object)) {
    return (
      <>
        <div className="absolute inset-x-[18%] bottom-[10%] h-[11%] rounded-full bg-rose-950/12 blur-[2px]" />
        <div className="absolute inset-[12%] rounded-[0.95rem] border border-rose-950/16 bg-white/16" />
        <div className="absolute inset-x-[19%] top-[16%] h-[28%] rounded-t-[0.85rem] rounded-b-[0.34rem] border border-rose-950/24 bg-rose-400/72 shadow-[inset_0_2px_0_rgba(255,255,255,0.32)]" />
        <div className="absolute left-[17%] top-[36%] h-[35%] w-[18%] rounded-[0.5rem] border border-rose-950/18 bg-rose-300/82" />
        <div className="absolute right-[17%] top-[36%] h-[35%] w-[18%] rounded-[0.5rem] border border-rose-950/18 bg-rose-300/82" />
        <div className="absolute inset-x-[24%] top-[42%] h-[34%] rounded-[0.55rem] border border-rose-950/18 bg-rose-50/92 shadow-[inset_0_2px_0_rgba(255,255,255,0.7)]" />
        <div className="absolute inset-x-[29%] top-[49%] h-[8%] rounded-full bg-white/70" />
        <div className="absolute left-[26%] bottom-[14%] h-[13%] w-[9%] rounded-b-[0.2rem] bg-rose-950/26" />
        <div className="absolute right-[26%] bottom-[14%] h-[13%] w-[9%] rounded-b-[0.2rem] bg-rose-950/26" />
      </>
    );
  }

  if (object.objectType === "screen") {
    return (
      <div className="absolute inset-[9%] overflow-hidden rounded-[0.72rem] border border-cyan-300/35 bg-slate-950/96 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,165,233,0.1),transparent_26%,rgba(6,182,212,0.14)_100%)]" />
        <div className="absolute inset-[7%] rounded-[0.58rem] border border-white/10" />
        <div className="absolute inset-y-0 left-[12%] w-px bg-cyan-300/20" />
        <div className="absolute inset-y-0 right-[12%] w-px bg-cyan-300/20" />
        <div className="absolute inset-x-[10%] top-[14%] h-[6%] rounded-full bg-cyan-300/44" />
        <div className="absolute inset-x-[14%] top-[24%] h-px bg-white/50" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-cyan-200/12" />
        <div className="absolute bottom-[10%] left-1/2 h-[6%] w-[34%] -translate-x-1/2 rounded-full bg-slate-950/42" />
      </div>
    );
  }

  if (object.objectType === "stage") {
    return (
      <>
        <div className="absolute inset-[5.5%] translate-x-[2.5%] translate-y-[7%] rounded-[0.42rem] border border-black/22 bg-amber-950/72" />
        <div className="absolute inset-[5.5%] rounded-[0.42rem] border border-amber-100/18 bg-[linear-gradient(180deg,rgba(132,88,48,0.96),rgba(76,47,27,0.97)_62%,rgba(34,22,15,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" />
        <div className="absolute inset-[6.8%] rounded-[0.28rem] bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.055)_0,rgba(255,255,255,0.055)_1px,transparent_1px,transparent_12px)] opacity-65" />
        <div className="absolute inset-y-[8%] left-[20%] w-px bg-black/24" />
        <div className="absolute inset-y-[8%] left-[50%] w-px bg-black/24" />
        <div className="absolute inset-y-[8%] left-[80%] w-px bg-black/24" />
        <div className="absolute inset-x-[6%] top-[24%] h-px bg-white/08" />
        <div className="absolute inset-x-[6%] top-[48%] h-px bg-white/08" />
        <div className="absolute inset-x-[6%] top-[72%] h-px bg-white/08" />
        <div className="absolute inset-x-[6%] top-[8%] h-[6%] rounded-[0.2rem] bg-slate-950/92" />
        <div className="absolute left-[7%] top-[7%] h-[16%] w-[5%] rounded-[0.24rem] border border-slate-950/50 bg-slate-900/84" />
        <div className="absolute right-[7%] top-[7%] h-[16%] w-[5%] rounded-[0.24rem] border border-slate-950/50 bg-slate-900/84" />
        <div className="absolute inset-x-[23%] top-[11%] h-[11%] rounded-[0.16rem] border border-slate-800/26 bg-slate-50/96 shadow-[0_1px_1px_rgba(0,0,0,0.12)]" />
        <div className="absolute left-[22%] top-[10%] h-[4%] w-[3%] bg-slate-950/92" />
        <div className="absolute right-[22%] top-[10%] h-[4%] w-[3%] bg-slate-950/92" />
        <div className="absolute left-[29%] top-[55%] h-[8%] w-[4.5%] rounded-[0.16rem] border border-slate-950/34 bg-slate-900/84" />
        <div className="absolute right-[29%] top-[55%] h-[8%] w-[4.5%] rounded-[0.16rem] border border-slate-950/34 bg-slate-900/84" />
        <div className="absolute left-[14%] bottom-[10%] h-[5%] w-[7%] rounded-[0.18rem] bg-slate-900/82" />
        <div className="absolute left-[38%] bottom-[10%] h-[5%] w-[7%] rounded-[0.18rem] bg-slate-900/82" />
        <div className="absolute right-[38%] bottom-[10%] h-[5%] w-[7%] rounded-[0.18rem] bg-slate-900/82" />
        <div className="absolute right-[14%] bottom-[10%] h-[5%] w-[7%] rounded-[0.18rem] bg-slate-900/82" />
        <div className="absolute inset-x-[5.5%] bottom-[5.5%] h-[15%] rounded-b-[0.4rem] border-t border-amber-100/22 bg-[linear-gradient(180deg,rgba(30,20,15,0.40),rgba(0,0,0,0.66))]" />
        <div className="absolute left-1/2 bottom-[-4%] h-[20%] w-[12%] -translate-x-1/2 rounded-b-[0.18rem] border border-slate-950/42 bg-[linear-gradient(180deg,rgba(100,116,139,0.92),rgba(30,41,59,0.98))]" />
        <div className="absolute left-1/2 bottom-[2%] h-px w-[7%] -translate-x-1/2 bg-slate-300/42" />
        <div className="absolute left-[2%] top-[44%] h-[18%] w-[4%] rounded-l-[0.2rem] border border-slate-950/28 bg-slate-800/90" />
        <div className="absolute right-[2%] top-[44%] h-[18%] w-[4%] rounded-r-[0.2rem] border border-slate-950/28 bg-slate-800/90" />
      </>
    );
  }

  if (object.objectType === "av_table") {
    return (
      <>
        <div className="absolute inset-[12%] rounded-[0.55rem] border border-violet-950/18 bg-white/20" />
        <div className="absolute inset-x-[14%] top-[18%] h-[22%] rounded-[0.35rem] bg-violet-950/16" />
        <div className="absolute inset-x-[18%] top-[23%] h-[8%] rounded-[0.25rem] bg-slate-950/78" />
        <div className="absolute inset-x-[18%] bottom-[22%] h-[10%] rounded-[0.3rem] bg-slate-950/12" />
        <div className="absolute left-[24%] bottom-[16%] h-[10%] w-px bg-violet-950/25" />
        <div className="absolute right-[24%] bottom-[16%] h-[10%] w-px bg-violet-950/25" />
      </>
    );
  }

  if (
    object.objectType === "bar" ||
    object.objectType === "buffet" ||
    object.objectType === "registration_desk"
  ) {
    const isHorizontal = object.transform.widthLu >= object.transform.depthLu;
    const frameClass =
      object.objectType === "bar"
        ? "border-amber-200/18 bg-amber-950/28"
        : object.objectType === "buffet"
          ? "border-rose-200/16 bg-rose-950/26"
          : "border-emerald-200/16 bg-emerald-950/22";
    const serviceEdgeClass =
      object.objectType === "bar"
        ? "bg-amber-950/72"
        : object.objectType === "buffet"
          ? "bg-rose-950/68"
          : "bg-emerald-950/62";
    const topClass =
      object.objectType === "bar"
        ? "bg-[linear-gradient(180deg,rgba(202,138,4,0.58),rgba(92,51,18,0.72))]"
        : object.objectType === "buffet"
          ? "bg-[linear-gradient(180deg,rgba(251,113,133,0.40),rgba(76,5,25,0.68))]"
          : "bg-[linear-gradient(180deg,rgba(52,211,153,0.32),rgba(6,78,59,0.64))]";
    const trimClass =
      object.objectType === "bar"
        ? "bg-amber-100/34"
        : object.objectType === "buffet"
          ? "bg-rose-100/30"
          : "bg-emerald-100/28";

    return (
      <>
        <div className={`absolute inset-[8%] rounded-[0.16rem] border ${frameClass}`} />
        <div
          className={`absolute rounded-[0.10rem] border border-white/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] ${topClass}`}
          style={
            isHorizontal
              ? { inset: "15% 9% 19% 9%" }
              : { inset: "9% 19% 9% 15%" }
          }
        />
        <div
          className={`absolute ${serviceEdgeClass}`}
          style={
            isHorizontal
              ? { left: "9%", right: "9%", bottom: "9%", height: "13%", borderRadius: "0 0 0.14rem 0.14rem" }
              : { top: "9%", bottom: "9%", right: "9%", width: "13%", borderRadius: "0 0.14rem 0.14rem 0" }
          }
        />
        <div
          className={`absolute ${trimClass}`}
          style={
            isHorizontal
              ? { left: "12%", right: "12%", top: "22%", height: "2px", borderRadius: "999px" }
              : { top: "12%", bottom: "12%", left: "22%", width: "2px", borderRadius: "999px" }
          }
        />
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`${object.id}-counter-module-${index}`}
            className="absolute bg-slate-900/14"
            style={
              isHorizontal
                ? {
                    left: `${24 + index * 18}%`,
                    top: "24%",
                    width: "1px",
                    height: "26%",
                  }
                : {
                    left: "24%",
                    top: `${24 + index * 18}%`,
                    width: "26%",
                    height: "1px",
                  }
            }
          />
        ))}
        {object.objectType === "bar" ? (
          <>
            <div
              className="absolute rounded-[0.18rem] border border-slate-800/18 bg-slate-900/18"
              style={isHorizontal ? { left: "18%", top: "30%", width: "11%", height: "18%" } : { left: "30%", top: "18%", width: "18%", height: "11%" }}
            />
            <div
              className="absolute rounded-[0.18rem] border border-slate-800/18 bg-slate-900/18"
              style={isHorizontal ? { right: "18%", top: "30%", width: "11%", height: "18%" } : { left: "30%", bottom: "18%", width: "18%", height: "11%" }}
            />
            <div
              className="absolute bg-white/70"
              style={
                isHorizontal
                  ? { left: "15%", right: "15%", bottom: "18%", height: "2px" }
                  : { top: "15%", bottom: "15%", right: "18%", width: "2px" }
              }
            />
            <div
              className="absolute rounded-full bg-slate-950/18"
              style={
                isHorizontal
                  ? { left: "38%", top: "31%", width: "24%", height: "6%" }
                  : { left: "31%", top: "38%", width: "6%", height: "24%" }
              }
            />
          </>
        ) : null}
        {object.objectType === "buffet" ? (
          <>
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`${object.id}-buffet-pan-${index}`}
              className="absolute rounded-[0.08rem] border border-white/18 bg-white/24"
                style={
                  isHorizontal
                    ? {
                        left: `${15 + index * 18}%`,
                        top: "27%",
                        width: "13%",
                        height: "21%",
                      }
                    : {
                        left: "27%",
                        top: `${15 + index * 18}%`,
                        width: "21%",
                        height: "13%",
                      }
                }
              />
            ))}
            <div
              className="absolute rounded-[0.2rem] border border-rose-950/14 bg-rose-950/14"
              style={
                isHorizontal
                  ? { left: "17%", right: "17%", bottom: "17%", height: "8%" }
                  : { top: "17%", bottom: "17%", right: "17%", width: "8%" }
              }
            />
          </>
        ) : null}
        {object.objectType === "registration_desk" ? (
          <>
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`${object.id}-checkin-station-${index}`}
              className="absolute rounded-[0.08rem] border border-white/16 bg-white/24"
                style={
                  isHorizontal
                    ? {
                        left: `${18 + index * 22}%`,
                        top: "26%",
                        width: "14%",
                        height: "18%",
                      }
                    : {
                        left: "26%",
                        top: `${18 + index * 22}%`,
                        width: "18%",
                        height: "14%",
                      }
                }
              />
            ))}
            <div
              className="absolute rounded-[0.16rem] border border-lime-950/12 bg-lime-950/14"
              style={
                isHorizontal
                  ? { right: "14%", bottom: "17%", width: "14%", height: "8%" }
                  : { right: "17%", bottom: "14%", width: "8%", height: "14%" }
              }
            />
          </>
        ) : null}
      </>
    );
  }

  if (
    object.objectType === "banquet_table" &&
    (object.metadata.visualVariant === "round" ||
      object.metadata.visualVariant === "cocktailCluster")
  ) {
    return (
      <>
        <TableSeatMarkers object={object} selected={selected} seatingOverlay={seatingOverlay} shape="round" />
        <RoundBanquetTableSvg />
      </>
    );
  }

  if (isRectangularBanquetTableObject(object)) {
    return (
      <>
        <TableSeatMarkers object={object} selected={selected} seatingOverlay={seatingOverlay} shape="rectangle" />
        <RectangularTableSvg />
      </>
    );
  }

  if (object.objectType === "banquet_table") {
    return (
      <>
        <TableSeatMarkers object={object} selected={selected} seatingOverlay={seatingOverlay} shape="rectangle" />
        <RectangularTableSvg />
      </>
    );
  }

  if (
    object.objectType === "chair_block" &&
    object.metadata.componentCategory === "seating" &&
    object.metadata.visualVariant === "chair"
  ) {
    return (
      <>
        <ChairBlockSvg rows={chairRowCountForObject(object)} />
        <ChairBlockSeatMarkers object={object} selected={selected} seatingOverlay={seatingOverlay} />
      </>
    );
  }

  if (object.metadata.visualVariant === "row") {
    const isClassroomRow = object.objectType === "classroom_table";
    if (isClassroomRow) {
      return (
        <div className="absolute inset-x-0 top-1/2 h-[36%] -translate-y-1/2 overflow-visible">
          <ClassroomRowSvg />
          <TableSeatMarkers
            object={object}
            seatLayout="classroom"
            selected={selected}
            seatingOverlay={seatingOverlay}
            shape="rectangle"
          />
        </div>
      );
    }

    const rows = chairRowCountForObject(object);
    return (
      <>
        <TheaterRowSvg rows={rows} />
        <ChairBlockSeatMarkers object={object} selected={selected} seatingOverlay={seatingOverlay} />
      </>
    );
  }

  if (object.metadata.visualVariant === "kiosk") {
    return (
      <>
        <div
          data-kiosk-part="floor-shadow"
          className="absolute inset-x-[19%] bottom-[9%] h-[12%] rounded-full bg-lime-950/12 blur-[2px]"
        />
        <div
          data-kiosk-part="halo"
          className="absolute inset-[7%] rounded-[0.82rem] border border-lime-900/16 bg-white/22"
        />
        <div
          data-kiosk-part="screen-face"
          className="absolute inset-x-[18%] top-[8%] h-[50%] rounded-[0.44rem] border border-slate-950/28 bg-slate-950/96 shadow-[0_5px_10px_rgba(15,23,42,0.26),inset_0_1px_0_rgba(255,255,255,0.16)]"
        >
          <div className="absolute inset-[10%] rounded-[0.28rem] bg-[linear-gradient(160deg,rgba(236,253,245,0.98),rgba(163,230,53,0.9)_42%,rgba(20,184,166,0.84)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.64)]" />
          <div className="absolute left-[20%] right-[20%] top-[21%] h-[8%] rounded-full bg-white/80" />
          <div className="absolute bottom-[18%] left-1/2 h-[20%] w-[20%] -translate-x-1/2 rounded-full border border-slate-950/18 bg-white/74" />
        </div>
        <div
          data-kiosk-part="body"
          className="absolute inset-x-[28%] top-[54%] h-[26%] rounded-b-[0.48rem] rounded-t-[0.2rem] border border-lime-950/22 bg-[linear-gradient(180deg,rgba(236,252,203,0.98),rgba(132,204,22,0.76))] shadow-[0_3px_7px_rgba(63,98,18,0.18),inset_0_1px_0_rgba(255,255,255,0.52)]"
        >
          <div className="absolute inset-x-[18%] top-[24%] h-[10%] rounded-full bg-lime-950/28" />
          <div className="absolute inset-x-[25%] bottom-[22%] h-[8%] rounded-full bg-white/52" />
        </div>
        <div
          data-kiosk-part="pedestal"
          className="absolute left-1/2 top-[72%] h-[13%] w-[18%] -translate-x-1/2 rounded-[0.16rem] bg-lime-950/76 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
        />
        <div
          data-kiosk-part="base"
          className="absolute left-1/2 bottom-[8%] h-[11%] w-[58%] -translate-x-1/2 rounded-[0.34rem] border border-lime-950/22 bg-lime-950/84 shadow-[0_2px_6px_rgba(63,98,18,0.22)]"
        />
      </>
    );
  }

  return null;
}

const PrototypeSceneObject = memo(function PrototypeSceneObject({
  object,
  isHovered,
  isSelected,
  isDragging,
  isMovable,
  renderOrder,
  seatingOverlay,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
}: Readonly<{
  object: PlannerSceneObject;
  isHovered: boolean;
  isSelected: boolean;
  isDragging: boolean;
  isMovable: boolean;
  renderOrder: number;
  seatingOverlay?: PlannerSceneSeatingOverlay | null;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, object: PlannerSceneObject) => void;
  onPointerEnter: (objectId: string) => void;
  onPointerLeave: (objectId: string) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}>) {
  const [isFocused, setIsFocused] = useState(false);
  const palette = objectPalette(object);
  const rectPx = plannerLuRectToPxRect({
    xLu: object.transform.xLu,
    yLu: object.transform.yLu,
    widthLu: object.transform.widthLu,
    depthLu: object.transform.depthLu,
  });
  const widthPx = Math.max(12, rectPx.width);
  const heightPx = Math.max(12, rectPx.height);
  const label = object.label?.trim() || object.name;
  const seatingTableCanvasLabel = seatingOverlay
    ? formatRoomSetCanvasTableLabel(seatingOverlay)
    : "";
  const accessibleLabel = seatingOverlay
    ? seatingTableCanvasLabel
    : `${label} (${objectBadgeLabel(object)})`;
  const isRound =
    object.metadata.visualVariant === "round" ||
    object.metadata.visualVariant === "cocktailCluster";
  const isZone = object.metadata.visualVariant === "zone";
  const isWall = object.metadata.visualVariant === "wall";
  const isQueueLane = isQueueLaneObject(object);
  const showInteractiveChrome = isHovered || isSelected;
  const isSeatingCritical = isSeatingCriticalObject(object);
  const labelUi = labelPresentation(widthPx, heightPx);
  const badgeLabel = objectBadgeLabel(object);
  const capacityBadgeLabel = seatingOverlay
    ? `${seatingOverlay.assignedCount}/${seatingOverlay.capacity}`
    : objectCapacityBadgeLabel(object);
  const isPlantCluster = isDecorPlantCluster(object);
  const isStaffBadge = object.capacity.staff > 0 && object.capacity.seated <= 0;
  const isChairOnlySeating = isChairSeatingObject(object);
  const isClassroomRowSeating = object.objectType === "classroom_table" && object.metadata.visualVariant === "row";
  const usesSeatingSvgSurface = isSeatingCritical && !isZone;
  const showObjectBadge =
    showInteractiveChrome && labelUi.showBadge && shouldShowPermanentTypeBadge(object, widthPx, heightPx);
  const showCapacityBadge =
    Boolean(capacityBadgeLabel) &&
    shouldShowCapacityBadge(object, widthPx, heightPx) &&
    !isChairOnlySeating &&
    !isClassroomRowSeating &&
    (isSeatingCritical || showInteractiveChrome);
  const showBadgeRail = showObjectBadge || showCapacityBadge;
  const showLabel = !isDragging && (isHovered || isSelected || isFocused);
  const labelCounterRotationDeg = -normalizeRotationDeg(object.transform.rotationDeg);

  return (
    <div
      className="absolute left-0 top-0"
      data-prototype-object="true"
      data-object-id={object.id}
      role="button"
      tabIndex={0}
      aria-label={accessibleLabel}
      title={isDragging ? undefined : accessibleLabel}
      onPointerDown={(event) => onPointerDown(event, object)}
      onPointerEnter={() => onPointerEnter(object.id)}
      onPointerLeave={() => onPointerLeave(object.id)}
      onPointerMove={(event) => {
        onPointerMove(event);
        event.stopPropagation();
      }}
      onPointerUp={(event) => {
        onPointerUp(event);
        event.stopPropagation();
      }}
      onPointerCancel={(event) => {
        onPointerUp(event);
        event.stopPropagation();
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={{
        width: widthPx,
        height: heightPx,
        transform: `translate(${rectPx.x}px, ${rectPx.y}px) rotate(${normalizeRotationDeg(object.transform.rotationDeg)}deg)`,
        transformOrigin: "center center",
        cursor: isDragging ? "grabbing" : isMovable ? "grab" : "default",
        zIndex: isDragging ? 1000 : 10 + renderOrder,
        willChange: "transform",
      }}
    >
      <div
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-x-[11%] top-[69%] h-[28%] rounded-[inherit] blur-[4px] transition-opacity duration-150",
          usesSeatingSvgSurface
            ? "opacity-0"
            : isSelected
              ? "bg-cyan-950/26 opacity-85"
              : isHovered || isFocused
                ? "bg-slate-950/20 opacity-62"
                : "bg-slate-950/12 opacity-42",
          isRound ? "rounded-full" : "",
        ].join(" ")}
        style={{ transform: "translate(3px, 6px)" }}
      />
      <div
        className={[
          "relative h-full w-full overflow-visible border transition duration-150",
          usesSeatingSvgSurface
            ? "border-transparent bg-transparent shadow-none"
            : `${palette.shell} ${palette.fill} ${palette.glow}`,
          isRound ? "rounded-full" : isWall ? "rounded-md" : "rounded-[1.05rem]",
          isZone && !isQueueLane ? "border-2 border-dashed backdrop-blur-[1px] shadow-none" : "",
          isQueueLane ? "rounded-[0.42rem] border-cyan-100/20 bg-slate-950/10 shadow-none" : "",
          isSelected
            ? isSeatingCritical
              ? "shadow-[0_8px_18px_rgba(8,47,73,0.14),0_0_0_1px_rgba(103,232,249,0.24)]"
              : "shadow-[0_18px_42px_rgba(8,47,73,0.24),0_0_0_1px_rgba(103,232,249,0.22)]"
            : showInteractiveChrome
              ? isSeatingCritical
                ? "shadow-[0_6px_14px_rgba(15,23,42,0.12),0_0_0_1px_rgba(148,163,184,0.12)]"
                : "shadow-[0_14px_30px_rgba(15,23,42,0.16),0_0_0_1px_rgba(148,163,184,0.18)]"
              : "shadow-[0_8px_20px_rgba(15,23,42,0.10)]",
        ].join(" ")}
      >
        {!isZone && !usesSeatingSvgSurface ? (
          <>
            <div className="pointer-events-none absolute inset-[1px] rounded-[inherit] border border-white/32" />
            <div className="pointer-events-none absolute inset-x-[5%] top-[5%] h-[27%] rounded-t-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.04))]" />
            <div
              className={`pointer-events-none absolute inset-x-[7%] bottom-[4%] h-[13%] rounded-b-[inherit] ${palette.rim}`}
            />
          </>
        ) : null}
        {showInteractiveChrome && !isClassroomRowSeating ? (
          <div
            className={[
              "pointer-events-none absolute rounded-[inherit] border transition",
              isSeatingCritical ? "-inset-1" : "-inset-1.5",
              isSelected
                ? isSeatingCritical
                  ? "border-cyan-300/90 shadow-[0_0_0_1px_rgba(8,16,30,0.70),0_0_10px_rgba(34,211,238,0.18)]"
                  : "border-cyan-300/95 shadow-[0_0_0_1px_rgba(8,16,30,0.72),0_0_24px_rgba(34,211,238,0.28)]"
                : isSeatingCritical
                  ? "border-cyan-200/34 shadow-none"
                  : "border-cyan-200/45 shadow-[0_0_18px_rgba(14,165,233,0.12)]",
            ].join(" ")}
          />
        ) : null}
        {!isZone ? (
          isPlantCluster ? (
            <PlantClusterAdornment />
          ) : (
            <ObjectAdornment object={object} selected={isSelected} seatingOverlay={seatingOverlay} />
          )
        ) : null}
        {showInteractiveChrome && isClassroomRowSeating ? (
          <div
            className={[
              "pointer-events-none absolute inset-x-0 top-1/2 h-[36%] -translate-y-1/2 rounded-[0.58rem] border transition",
              isSelected
                ? "border-cyan-300/90 shadow-[0_0_0_1px_rgba(8,16,30,0.70),0_0_10px_rgba(34,211,238,0.18)]"
                : "border-cyan-200/34 shadow-none",
            ].join(" ")}
          />
        ) : null}
        {isWall ? (
          <>
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-slate-900/18" />
            <div className="absolute inset-x-[10%] top-1/2 h-px -translate-y-[5px] bg-white/55" />
          </>
        ) : null}
        {isZone ? (
          isQueueLane ? (
            <QueueLaneAdornment />
          ) : (
            <>
              <div className="absolute inset-[9px] rounded-[inherit] border border-white/28" />
              <div className="absolute left-2 top-2 h-2 w-2 rounded-full bg-white/75 shadow-[0_0_0_2px_rgba(255,255,255,0.24)]" />
              <div className="absolute bottom-2 right-2 h-2 w-2 rounded-full bg-white/55" />
            </>
          )
        ) : null}
        {seatingOverlay ? (
          <div className="pointer-events-none absolute left-1/2 top-1.5 z-40 -translate-x-1/2 rounded-full border border-cyan-200/30 bg-slate-950/88 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-cyan-50 shadow-[0_4px_10px_rgba(2,6,23,0.28)] backdrop-blur-xl">
            <span className="whitespace-nowrap">{seatingTableCanvasLabel}</span>
          </div>
        ) : null}
        {showBadgeRail ? (
          <div className="pointer-events-none absolute inset-x-1.5 top-1.5 z-30 flex items-start justify-between gap-1">
            {showObjectBadge ? (
              <div
                className={`inline-flex max-w-[42%] shrink-0 items-center rounded-full px-1.5 py-[0.18rem] text-[7px] font-semibold uppercase tracking-[0.08em] shadow-[0_2px_5px_rgba(15,23,42,0.16)] ${palette.badge}`}
              >
                <span className="truncate">{badgeLabel}</span>
              </div>
            ) : (
              <span aria-hidden className="min-w-0 flex-1" />
            )}
            {showCapacityBadge ? (
              <div
                className={[
                  "inline-flex max-w-[58%] shrink-0 items-center rounded-full border px-1.5 py-[0.18rem] text-[7.5px] font-semibold normal-case tracking-[0.01em] shadow-[0_2px_5px_rgba(15,23,42,0.14)]",
                  seatingOverlay?.isFull
                    ? "border-rose-200/38 bg-rose-950/88 text-rose-50"
                    : seatingOverlay
                      ? "border-cyan-200/40 bg-slate-950/88 text-cyan-50"
                      : isStaffBadge
                    ? "border-slate-950/12 bg-slate-950/92 text-white"
                    : isSeatingCritical
                      ? "border-slate-950/18 bg-white/82 text-slate-800"
                      : "border-white/80 bg-white/96 text-slate-800",
                ].join(" ")}
              >
                <span className="whitespace-nowrap">{capacityBadgeLabel}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        {showLabel ? (
          <div
            className={[
              "pointer-events-none absolute z-50",
              labelUi.callout
                ? "left-1/2 top-full mt-1.5 -translate-x-1/2"
                : "inset-x-2",
            ].join(" ")}
            style={labelUi.callout ? undefined : { bottom: `${labelUi.bottomInset}px` }}
          >
            <div
              className={`inline-flex items-start rounded-[0.52rem] border px-1.5 py-1 backdrop-blur-xl ${
                isSelected
                  ? "border-cyan-200/52 bg-slate-950/84 text-cyan-50 shadow-[0_8px_18px_rgba(8,47,73,0.22)]"
                  : "border-white/14 bg-slate-950/72 text-slate-100 shadow-[0_6px_16px_rgba(15,23,42,0.18)]"
              }`}
              style={{
                ...(labelUi.callout
                  ? {
                      maxWidth: isSeatingCritical ? 150 : 220,
                      minWidth: Math.min(Math.max(widthPx, 78), isSeatingCritical ? 118 : 150),
                    }
                  : { maxWidth: "calc(100% - 12px)" }),
                ...(labelCounterRotationDeg === 0
                  ? {}
                  : { transform: `rotate(${labelCounterRotationDeg}deg)` }),
              }}
            >
              <span
                className={`${
                  labelUi.compact
                    ? "text-[9px] font-semibold leading-[1.08] tracking-[0.01em]"
                    : isSeatingCritical
                      ? "text-[10px] font-semibold leading-[1.12] tracking-[0.01em]"
                      : "text-[11px] font-semibold leading-[1.16] tracking-[0.01em]"
                }`}
                style={
                  labelUi.callout || labelUi.multiline
                    ? {
                        display: "-webkit-box",
                        WebkitLineClamp: labelUi.callout ? 3 : 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        overflowWrap: "anywhere",
                      }
                    : undefined
                }
              >
                {label}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export function PlannerScenePrototypeCanvas(props: PlannerScenePrototypeCanvasProps) {
  const {
    scene,
    roomName,
    gridStrideLu,
    snapEnabled = true,
    fitRequestNonce,
    zoomCommand,
    onZoomChange,
    onDraftSceneChange,
    selectionClearNonce,
    interactionMode = "layout",
    seatingOverlays = {},
    selectedSeatingObjectId = null,
    onSeatingObjectSelect,
  } = props;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<PrototypeInteractionState | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingDragPreviewRef = useRef<PrototypeDragPreview | null>(null);
  const pointerCaptureElementRef = useRef<HTMLElement | null>(null);
  const latestDraftSceneRef = useRef<PlannerScene | null>(scene);

  const [draftScene, setDraftScene] = useState<PlannerScene | null>(scene);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [userZoom, setUserZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<PrototypeDragPreview | null>(null);

  const activeScene = draftScene;
  const hasActiveScene = activeScene != null;

  const measureViewport = useCallback(() => {
    const nextSize = viewportSizeForElement(viewportRef.current);
    if (!nextSize) return null;
    setViewportSize((prior) =>
      prior.width === nextSize.width && prior.height === nextSize.height ? prior : nextSize,
    );
    return nextSize;
  }, []);

  useEffect(() => {
    if (!hasActiveScene) return;
    const element = viewportRef.current;
    if (!element) return;

    const frame = window.requestAnimationFrame(() => measureViewport());
    const observer = new ResizeObserver(() => {
      measureViewport();
    });
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [hasActiveScene, measureViewport]);

  useEffect(() => {
    if (interactionRef.current?.mode === "move") return;
    const frame = window.requestAnimationFrame(() => {
      setDraftScene(scene);
      setHoveredObjectId(null);
      setSelectedObjectId((prior) =>
        scene?.objects.some((object) => object.id === prior) ? prior : null,
      );
      setDragPreview(null);
      pendingDragPreviewRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scene]);

  useEffect(() => {
    latestDraftSceneRef.current = draftScene;
    onDraftSceneChange?.(draftScene);
  }, [draftScene, onDraftSceneChange]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSelectedObjectId(null);
      setHoveredObjectId(null);
      setDragPreview(null);
      pendingDragPreviewRef.current = null;
      interactionRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectionClearNonce]);

  useEffect(
    () => () => {
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  const roomWidthPx = layoutLuToPx(activeScene?.roomShell.widthLu ?? 0);
  const roomHeightPx = layoutLuToPx(activeScene?.roomShell.depthLu ?? 0);

  const fitScale = useMemo(() => {
    return fitScaleForRoomInViewport({
      roomWidthPx,
      roomHeightPx,
      viewportWidthPx: viewportSize.width,
      viewportHeightPx: viewportSize.height,
    });
  }, [roomHeightPx, roomWidthPx, viewportSize.height, viewportSize.width]);

  const fitSceneToViewport = useCallback(() => {
    const nextViewportSize = measureViewport() ?? viewportSize;
    if (!(roomWidthPx > 0) || !(roomHeightPx > 0)) return;
    if (!(nextViewportSize.width > 0) || !(nextViewportSize.height > 0)) return;
    const nextFitScale = fitScaleForRoomInViewport({
      roomWidthPx,
      roomHeightPx,
      viewportWidthPx: nextViewportSize.width,
      viewportHeightPx: nextViewportSize.height,
    });
    setUserZoom(1);
    setPan(
      fittedScenePan({
        viewportWidthPx: nextViewportSize.width,
        viewportHeightPx: nextViewportSize.height,
        roomWidthPx,
        roomHeightPx,
        fitScale: nextFitScale,
      }),
    );
  }, [measureViewport, roomHeightPx, roomWidthPx, viewportSize]);

  useEffect(() => {
    if (interactionRef.current) return;
    const frame = window.requestAnimationFrame(fitSceneToViewport);
    return () => window.cancelAnimationFrame(frame);
  }, [fitRequestNonce, fitSceneToViewport, scene?.roomShell.depthLu, scene?.roomShell.widthLu]);

  useEffect(() => {
    if (!zoomCommand) return;
    const frame = window.requestAnimationFrame(() => {
      if (zoomCommand.action === "reset") {
        fitSceneToViewport();
        return;
      }
      if (zoomCommand.action === "zoom-out") {
        setUserZoom((prior) => clamp(prior - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
        return;
      }
      if (zoomCommand.action === "zoom-in") {
        setUserZoom((prior) => clamp(prior + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM));
        return;
      }
      if (zoomCommand.action === "set") {
        setUserZoom(clamp(zoomCommand.zoom ?? 1, MIN_ZOOM, MAX_ZOOM));
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitSceneToViewport, zoomCommand]);

  useEffect(() => {
    onZoomChange?.(userZoom);
  }, [onZoomChange, userZoom]);

  const finalScale = fitScale * userZoom;
  const sceneOffsetX = pan.x;
  const sceneOffsetY = pan.y;
  const gridStrideLuSafe = normalizePrototypeGridStrideLu(gridStrideLu);
  const snapStrideLu = snapEnabled ? normalizePrototypeSnapStrideLu(gridStrideLu) : null;
  const minorGridPx = layoutLuToPx(gridStrideLuSafe);
  const majorGridPx = minorGridPx * 5;
  const viewportMinorGridPx = Math.max(14, minorGridPx * finalScale);
  const viewportMajorGridPx = Math.max(viewportMinorGridPx * 5, minorGridPx * finalScale * 5);

  const visibleObjects = useMemo(
    () =>
      activeScene?.objects.filter(
        (object) =>
          Number.isFinite(object.transform.xLu) &&
          Number.isFinite(object.transform.yLu) &&
          object.transform.widthLu > 0 &&
          object.transform.depthLu > 0,
      ) ?? [],
    [activeScene],
  );

  const selectedObject = useMemo(
    () => visibleObjects.find((object) => object.id === selectedObjectId) ?? null,
    [selectedObjectId, visibleObjects],
  );
  const selectedEditConfig = selectedObject ? editableConfigForObject(selectedObject) : null;

  const updateObjectPosition = useCallback((objectId: string, nextXLu: number, nextYLu: number) => {
    setDraftScene((prior) => {
      if (!prior) return prior;
      let changed = false;
      const nextObjects = prior.objects.map((object) => {
        if (object.id !== objectId) return object;
        if (
          Math.abs(object.transform.xLu - nextXLu) < 0.0001 &&
          Math.abs(object.transform.yLu - nextYLu) < 0.0001
        ) {
          return object;
        }
        changed = true;
        return {
          ...object,
          transform: {
            ...object.transform,
            xLu: nextXLu,
            yLu: nextYLu,
          },
        };
      });
      return changed ? { ...prior, objects: nextObjects } : prior;
    });
  }, []);

  const updateSelectedObject = useCallback(
    (patch: Readonly<{
      label?: string | null;
      widthLu?: number;
      depthLu?: number;
      rotationDeg?: number;
      capacitySeated?: number;
    }>) => {
      const selectedId = selectedObjectId;
      if (!selectedId) return;
      setDraftScene((prior) => {
        if (!prior) return prior;
        let changed = false;
        const nextObjects = prior.objects.map((object) => {
          if (object.id !== selectedId) return object;
          const widthLu = patch.widthLu ?? object.transform.widthLu;
          const depthLu = patch.depthLu ?? object.transform.depthLu;
          const maxXLu = Math.max(0, prior.roomShell.widthLu - widthLu);
          const maxYLu = Math.max(0, prior.roomShell.depthLu - depthLu);
          const next = {
            ...object,
            ...(Object.prototype.hasOwnProperty.call(patch, "label")
              ? { label: patch.label?.trim() ? patch.label.trim().slice(0, 80) : null }
              : {}),
            capacity:
              patch.capacitySeated == null
                ? object.capacity
                : {
                    ...object.capacity,
                    seated: Math.max(0, Math.round(patch.capacitySeated)),
                  },
            transform: {
              ...object.transform,
              widthLu,
              depthLu,
              xLu: clamp(object.transform.xLu, 0, maxXLu),
              yLu: clamp(object.transform.yLu, 0, maxYLu),
              rotationDeg:
                patch.rotationDeg == null
                  ? object.transform.rotationDeg
                  : normalizeRotationDeg(patch.rotationDeg),
            },
          };
          changed =
            next.label !== object.label ||
            next.transform.widthLu !== object.transform.widthLu ||
            next.transform.depthLu !== object.transform.depthLu ||
            next.transform.xLu !== object.transform.xLu ||
            next.transform.yLu !== object.transform.yLu ||
            next.transform.rotationDeg !== object.transform.rotationDeg ||
            next.capacity.seated !== object.capacity.seated;
          return next;
        });
        return changed ? { ...prior, objects: nextObjects } : prior;
      });
    },
    [selectedObjectId],
  );

  const scheduleDragPreview = useCallback((preview: PrototypeDragPreview | null) => {
    pendingDragPreviewRef.current = preview;
    if (frameRef.current != null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setDragPreview(pendingDragPreviewRef.current);
    });
  }, []);

  const commitObjectPositionNow = useCallback(
    (objectId: string, nextXLu: number, nextYLu: number) => {
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      updateObjectPosition(objectId, nextXLu, nextYLu);
    },
    [updateObjectPosition],
  );

  const selectObjectFromPointer = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      object: PlannerSceneObject,
      captureElement: HTMLElement,
    ) => {
      if (interactionMode === "seating") {
        const overlay = seatingOverlays[object.id] ?? null;
        const seatElement = (event.target as HTMLElement | null)?.closest<HTMLElement>(
          "[data-table-seat='true'], [data-chair-seat='true']",
        );
        const rawSeatIndex = seatElement?.dataset.seatIndex;
        const parsedSeatIndex =
          rawSeatIndex == null || rawSeatIndex === "" ? null : Number(rawSeatIndex);
        const seatIndex =
          parsedSeatIndex != null && Number.isInteger(parsedSeatIndex) && parsedSeatIndex >= 0
            ? parsedSeatIndex
            : null;
        setSelectedObjectId(null);
        setHoveredObjectId(object.id);
        interactionRef.current = null;
        onSeatingObjectSelect?.(object, overlay, seatIndex);
        return;
      }

      setSelectedObjectId(object.id);
      setHoveredObjectId(object.id);
      if (!isPrototypeMovableObject(object)) return;
      const initialPreview = {
        objectId: object.id,
        xLu: object.transform.xLu,
        yLu: object.transform.yLu,
      } satisfies PrototypeDragPreview;
      pendingDragPreviewRef.current = initialPreview;
      interactionRef.current = {
        mode: "move",
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        objectId: object.id,
        startXLu: object.transform.xLu,
        startYLu: object.transform.yLu,
        dragStarted: false,
      };
      captureElement.setPointerCapture(event.pointerId);
      pointerCaptureElementRef.current = captureElement;
    },
    [interactionMode, onSeatingObjectSelect, seatingOverlays],
  );

  const deleteSelectedObject = useCallback(() => {
    const selectedId = selectedObjectId;
    if (!selectedId) return false;
    let removed = false;
    setDraftScene((prior) => {
      if (!prior) return prior;
      const nextObjects = prior.objects.filter((object) => object.id !== selectedId);
      if (nextObjects.length === prior.objects.length) return prior;
      removed = true;
      return { ...prior, objects: nextObjects };
    });
    if (removed) {
      setSelectedObjectId(null);
      setHoveredObjectId((prior) => (prior === selectedId ? null : prior));
      if (interactionRef.current?.mode === "move" && interactionRef.current.objectId === selectedId) {
        interactionRef.current = null;
      }
    }
    return removed;
  }, [selectedObjectId]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!deleteSelectedObject()) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [deleteSelectedObject],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement | null)?.closest("[data-prototype-object='true']")) {
      return;
    }
    interactionRef.current = {
      mode: "pan",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setSelectedObjectId(null);
    if (interactionMode === "seating") {
      onSeatingObjectSelect?.(null, null, null);
    }
    setHoveredObjectId(null);
    setDragPreview(null);
    pendingDragPreviewRef.current = null;
    setIsPanning(true);
    viewportRef.current?.setPointerCapture(event.pointerId);
    pointerCaptureElementRef.current = viewportRef.current;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    if (interaction.mode === "pan") {
      setPan((prior) => ({
        x: prior.x + (event.clientX - interaction.x),
        y: prior.y + (event.clientY - interaction.y),
      }));
      interactionRef.current = {
        ...interaction,
        x: event.clientX,
        y: event.clientY,
      };
      return;
    }

    const sceneForMove = latestDraftSceneRef.current;
    const object = sceneForMove?.objects.find((item) => item.id === interaction.objectId);
    if (!sceneForMove || !object) return;

    const dragStarted = interaction.dragStarted || plannerScenePointerExceededDragThreshold(
      { clientX: interaction.x, clientY: interaction.y },
      { clientX: event.clientX, clientY: event.clientY },
    );
    if (!dragStarted) return;
    if (!interaction.dragStarted) {
      interactionRef.current = { ...interaction, dragStarted: true };
    }

    const nextPosition = resolveDraggedObjectPosition({
      interaction,
      clientX: event.clientX,
      clientY: event.clientY,
      finalScale,
      roomWidthLu: sceneForMove.roomShell.widthLu,
      roomDepthLu: sceneForMove.roomShell.depthLu,
      objectWidthLu: object.transform.widthLu,
      objectDepthLu: object.transform.depthLu,
      snapStrideLu,
    });
    scheduleDragPreview({
      objectId: interaction.objectId,
      xLu: nextPosition.xLu,
      yLu: nextPosition.yLu,
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (interaction?.pointerId === event.pointerId) {
      if (interaction.mode === "move") {
        const sceneForMove = latestDraftSceneRef.current;
        const object = sceneForMove?.objects.find((item) => item.id === interaction.objectId);
        if (sceneForMove && object && interaction.dragStarted) {
          const finalMove = resolveDraggedObjectPosition({
            interaction,
            clientX: event.clientX,
            clientY: event.clientY,
            finalScale,
            roomWidthLu: sceneForMove.roomShell.widthLu,
            roomDepthLu: sceneForMove.roomShell.depthLu,
            objectWidthLu: object.transform.widthLu,
            objectDepthLu: object.transform.depthLu,
            snapStrideLu,
          });
          commitObjectPositionNow(interaction.objectId, finalMove.xLu, finalMove.yLu);
        }
      }
      interactionRef.current = null;
      pendingDragPreviewRef.current = null;
      setDragPreview(null);
      setIsPanning(false);
      try {
        pointerCaptureElementRef.current?.releasePointerCapture(event.pointerId);
      } catch {}
      pointerCaptureElementRef.current = null;
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setUserZoom((prior) =>
      clamp(prior + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), MIN_ZOOM, MAX_ZOOM),
    );
  };

  const handleObjectPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, object: PlannerSceneObject) => {
      event.stopPropagation();
      selectObjectFromPointer(event, object, event.currentTarget);
    },
    [selectObjectFromPointer],
  );

  const handleScenePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const sceneForHitTest = latestDraftSceneRef.current;
      if (!sceneForHitTest || finalScale <= 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const point = {
        xLu: layoutPxToLu((event.clientX - rect.left) / finalScale),
        yLu: layoutPxToLu((event.clientY - rect.top) / finalScale),
      };
      if (
        point.xLu < 0 ||
        point.yLu < 0 ||
        point.xLu > sceneForHitTest.roomShell.widthLu ||
        point.yLu > sceneForHitTest.roomShell.depthLu
      ) {
        return;
      }

      const hit = resolvePlannerSceneHitTarget(visibleObjects, point);
      if (!hit) return;

      event.preventDefault();
      event.stopPropagation();
      selectObjectFromPointer(event, hit.object, event.currentTarget);
    },
    [finalScale, selectObjectFromPointer, visibleObjects],
  );

  const handleObjectPointerEnter = useCallback((objectId: string) => {
    if (interactionRef.current?.mode === "move") return;
    setHoveredObjectId(objectId);
  }, []);

  const handleObjectPointerLeave = useCallback((objectId: string) => {
    if (interactionRef.current?.mode === "move") return;
    setHoveredObjectId((prior) => (prior === objectId ? null : prior));
  }, []);

  const selectedCatalogComponent = selectedObject
    ? getRoomSetComponent(selectedObject.componentId)
    : null;
  const selectedChairCount = selectedObject
    ? Math.max(1, Math.round(selectedObject.capacity.seated))
    : 1;
  const selectedChairRows = selectedObject ? chairRowCountForObject(selectedObject) : 1;
  const selectedChairsPerRow = selectedObject ? chairColumnsForObject(selectedObject) : 1;
  const selectedChairSpacingLu = selectedObject ? chairSpacingLuForObject(selectedObject) : 3;
  const selectedChairRowSpacingLu = selectedObject ? chairRowSpacingLuForObject(selectedObject) : 5;
  const updateSelectedChairLayout = (
    patch: Readonly<{
      chairCount?: number;
      rows?: number;
      chairsPerRow?: number;
      chairSpacingLu?: number;
      rowSpacingLu?: number;
    }>,
  ) => {
    if (!selectedObject) return;
    const chairCount = Math.max(
      1,
      Math.min(200, Math.round(patch.chairCount ?? selectedChairCount)),
    );
    const rowsFromPatch =
      patch.chairsPerRow == null
        ? patch.rows
        : Math.ceil(chairCount / Math.max(1, Math.round(patch.chairsPerRow)));
    const rows = Math.max(
      1,
      Math.min(chairCount, Math.round(rowsFromPatch ?? selectedChairRows)),
    );
    const chairSpacingLu = clamp(
      patch.chairSpacingLu ?? selectedChairSpacingLu,
      1.5,
      8,
    );
    const rowSpacingLu = clamp(
      patch.rowSpacingLu ?? selectedChairRowSpacingLu,
      2.5,
      10,
    );
    const footprint = chairFootprintForEdit({
      chairCount,
      rows,
      chairSpacingLu,
      rowSpacingLu,
    });
    updateSelectedObject({
      capacitySeated: chairCount,
      widthLu: footprint.widthLu,
      depthLu: footprint.depthLu,
    });
  };

  if (!activeScene) {
    return (
      <div className="relative flex h-full min-h-[900px] items-center justify-center overflow-hidden rounded-[1.4rem] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.20),transparent_34%),linear-gradient(135deg,#020617,#0f172a_58%,#020617)]">
        <div className="max-w-md rounded-3xl border border-white/10 bg-slate-950/72 px-6 py-5 text-center text-slate-100 shadow-2xl shadow-slate-950/35 ring-1 ring-white/10 backdrop-blur-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            ROOM SET
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">No room layout yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            No room layout yet, create a layout or add room components to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      className="relative h-full min-h-[900px] overflow-hidden rounded-[1.4rem] bg-[radial-gradient(circle_at_16%_12%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_78%_18%,rgba(99,102,241,0.11),transparent_29%),linear-gradient(135deg,#020617_0%,#07111f_46%,#111827_100%)] [touch-action:none]"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 22% 16%, rgba(125,211,252,0.16), transparent 32%)",
            "radial-gradient(circle at 78% 20%, rgba(103,232,249,0.08), transparent 28%)",
            "radial-gradient(circle at 72% 86%, rgba(15,23,42,0.62), transparent 34%)",
            "radial-gradient(circle at center, transparent 48%, rgba(2,6,23,0.54) 100%)",
            "linear-gradient(to right, rgba(125,211,252,0.085) 1px, transparent 1px)",
            "linear-gradient(to bottom, rgba(125,211,252,0.085) 1px, transparent 1px)",
            "linear-gradient(to right, rgba(148,163,184,0.16) 1px, transparent 1px)",
            "linear-gradient(to bottom, rgba(148,163,184,0.16) 1px, transparent 1px)",
            "linear-gradient(135deg, rgba(255,255,255,0.035), transparent 30%, rgba(14,165,233,0.04) 68%, transparent)",
          ].join(", "),
          backgroundSize: [
            "auto",
            "auto",
            "auto",
            "auto",
            `${viewportMinorGridPx}px ${viewportMinorGridPx}px`,
            `${viewportMinorGridPx}px ${viewportMinorGridPx}px`,
            `${viewportMajorGridPx}px ${viewportMajorGridPx}px`,
            `${viewportMajorGridPx}px ${viewportMajorGridPx}px`,
            "auto",
          ].join(", "),
          backgroundPosition: [
            "0 0",
            "0 0",
            "0 0",
            "0 0",
            `${sceneOffsetX}px ${sceneOffsetY}px`,
            `${sceneOffsetX}px ${sceneOffsetY}px`,
            `${sceneOffsetX}px ${sceneOffsetY}px`,
            `${sceneOffsetX}px ${sceneOffsetY}px`,
            "0 0",
          ].join(", "),
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),transparent_18%,transparent_72%,rgba(2,6,23,0.24))]" />

      <div
        className="absolute left-0 top-0 origin-top-left"
        onPointerDownCapture={handleScenePointerDownCapture}
        style={{
          width: roomWidthPx,
          height: roomHeightPx,
          transform: `translate(${sceneOffsetX}px, ${sceneOffsetY}px) scale(${finalScale})`,
        }}
      >
        <div className="relative h-full w-full overflow-visible rounded-[2rem] border border-cyan-200/18 bg-[linear-gradient(180deg,#1f2937,#0f172a_58%,#08111f)] shadow-[0_48px_110px_rgba(0,0,0,0.56),0_0_0_1px_rgba(125,211,252,0.10)]">
          <div className="pointer-events-none absolute -inset-[18px] -z-10 rounded-[2.4rem] bg-slate-950/70 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-[22px] left-[2.5%] right-[1.5%] h-[42px] rounded-b-[2rem] bg-[linear-gradient(180deg,rgba(15,23,42,0.38),rgba(0,0,0,0.72))] blur-[2px]" />
          <div className="pointer-events-none absolute -right-[18px] bottom-[2.5%] top-[4%] w-[28px] rounded-r-[2rem] bg-[linear-gradient(90deg,rgba(15,23,42,0.36),rgba(0,0,0,0.68))] blur-[1px]" />
          <div className="pointer-events-none absolute -inset-[2px] rounded-[inherit] border border-cyan-200/20" />
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] border-[16px] border-slate-600/88 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10),inset_0_-18px_24px_rgba(2,6,23,0.36)]" />
          <div className="pointer-events-none absolute inset-[16px] rounded-[1.35rem] border border-cyan-200/10 bg-slate-950/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]" />
          <div
            className="pointer-events-none absolute inset-[16px] rounded-[1.35rem]"
            style={{
              backgroundImage: [
                "linear-gradient(180deg, rgba(15,23,42,0.86), rgba(8,15,27,0.94))",
                "radial-gradient(circle at 50% 0%, rgba(14,165,233,0.12), transparent 32%)",
                "radial-gradient(circle at 85% 86%, rgba(0,0,0,0.28), transparent 34%)",
                "radial-gradient(circle at center, transparent 56%, rgba(0,0,0,0.20) 100%)",
                "linear-gradient(to right, rgba(103,232,249,0.065) 1px, transparent 1px)",
                "linear-gradient(to bottom, rgba(103,232,249,0.065) 1px, transparent 1px)",
                "linear-gradient(to right, rgba(148,163,184,0.13) 1px, transparent 1px)",
                "linear-gradient(to bottom, rgba(148,163,184,0.13) 1px, transparent 1px)",
              ].join(", "),
              backgroundSize: [
                "auto",
                "auto",
                "auto",
                "auto",
                `${minorGridPx}px ${minorGridPx}px`,
                `${minorGridPx}px ${minorGridPx}px`,
                `${majorGridPx}px ${majorGridPx}px`,
                `${majorGridPx}px ${majorGridPx}px`,
              ].join(", "),
            }}
          />
          <div className="pointer-events-none absolute left-[16px] right-[16px] top-[16px] h-[18px] rounded-t-[1.25rem] bg-[linear-gradient(180deg,rgba(226,232,240,0.28),rgba(71,85,105,0.56)_58%,rgba(15,23,42,0.68))]" />
          <div className="pointer-events-none absolute inset-x-[16px] bottom-[16px] h-[24px] rounded-b-[1.25rem] bg-[linear-gradient(180deg,rgba(51,65,85,0.34),rgba(2,6,23,0.76))]" />
          <div className="pointer-events-none absolute bottom-[16px] right-[16px] top-[16px] w-[22px] rounded-r-[1.25rem] bg-[linear-gradient(90deg,rgba(15,23,42,0.24),rgba(2,6,23,0.68))]" />
          <div className="pointer-events-none absolute bottom-[16px] left-[16px] top-[16px] w-[18px] rounded-l-[1.25rem] bg-[linear-gradient(90deg,rgba(226,232,240,0.18),rgba(51,65,85,0.28)_44%,rgba(15,23,42,0.42))]" />
          <div className="pointer-events-none absolute left-[16px] top-[16px] h-[32px] w-[32px] rounded-tl-[1.25rem] bg-[linear-gradient(135deg,rgba(226,232,240,0.22),rgba(15,23,42,0.60))]" />
          <div className="pointer-events-none absolute right-[16px] top-[16px] h-[32px] w-[32px] rounded-tr-[1.25rem] bg-[linear-gradient(225deg,rgba(226,232,240,0.18),rgba(15,23,42,0.64))]" />
          <div className="pointer-events-none absolute bottom-[16px] right-[16px] h-[34px] w-[34px] rounded-br-[1.25rem] bg-[linear-gradient(315deg,rgba(0,0,0,0.70),rgba(71,85,105,0.24))]" />
          <div className="pointer-events-none absolute inset-[28px] rounded-[1rem] border border-cyan-100/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(0,0,0,0.36)]" />
          <div className="pointer-events-none absolute left-7 top-6 rounded-full border border-cyan-100/16 bg-slate-950/78 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-50 shadow-[0_8px_18px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            {roomName?.trim() ? roomName : "Room"} shell
          </div>
          {visibleObjects.map((object, objectIndex) => {
            const isDraggingObject = dragPreview?.objectId === object.id;
            const renderObject = isDraggingObject
              ? {
                  ...object,
                  transform: {
                    ...object.transform,
                    xLu: dragPreview.xLu,
                    yLu: dragPreview.yLu,
                  },
                }
              : object;

            return (
              <PrototypeSceneObject
                key={object.id}
                isDragging={isDraggingObject}
                isHovered={hoveredObjectId === object.id}
                isMovable={isPrototypeMovableObject(object)}
                renderOrder={objectIndex}
                isSelected={
                  interactionMode === "seating"
                    ? selectedSeatingObjectId === object.id
                    : selectedObjectId === object.id
                }
                object={renderObject}
                seatingOverlay={seatingOverlays[object.id] ?? null}
                onPointerDown={handleObjectPointerDown}
                onPointerEnter={handleObjectPointerEnter}
                onPointerLeave={handleObjectPointerLeave}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
            );
          })}
        </div>
      </div>

      <div
        aria-hidden={!selectedObject}
        className={`absolute right-4 top-4 z-10 w-[19rem] rounded-2xl border border-white/10 bg-slate-950/78 p-3 text-slate-100 shadow-2xl shadow-slate-950/35 ring-1 ring-cyan-200/10 backdrop-blur-2xl transition-all duration-200 ease-out ${
          selectedObject && interactionMode === "layout"
            ? "translate-x-0 opacity-100"
            : "pointer-events-none translate-x-5 opacity-0"
        }`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {selectedObject ? (
          <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
                Component
              </p>
              <p className="mt-1 truncate text-[13px] font-semibold text-white">
                {selectedEditConfig?.title ?? selectedObject.name}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                {selectedObject.source.kind}
              </span>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-slate-300 transition hover:border-cyan-200/35 hover:bg-white/[0.09] hover:text-white"
                aria-label="Close inspector"
                title="Close inspector"
                onClick={() => {
                  setSelectedObjectId(null);
                  setHoveredObjectId(null);
                  interactionRef.current = null;
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
          {selectedEditConfig?.properties.includes("label") ? (
            <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Label
              <input
                className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[12px] font-semibold normal-case tracking-normal text-slate-100 outline-none backdrop-blur-xl placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                value={selectedObject.label ?? ""}
                placeholder={selectedObject.name}
                onChange={(event) => updateSelectedObject({ label: event.target.value })}
              />
            </label>
          ) : null}
          {selectedEditConfig?.properties.includes("chairCount") ? (
            <div
              className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.045] p-2 shadow-inner shadow-black/20 ring-1 ring-white/[0.04]"
              data-chair-edit-controls="true"
            >
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Chair count
                <DraftNumberInput
                  min={1}
                  max={200}
                  step={1}
                  className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[12px] font-semibold normal-case tracking-normal text-slate-100 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                  value={selectedChairCount}
                  formatValue={(nextValue) => Math.round(nextValue).toString()}
                  onCommit={(nextValue) => updateSelectedChairLayout({ chairCount: nextValue })}
                />
              </label>
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Rows
                <DraftNumberInput
                  min={1}
                  max={40}
                  step={1}
                  className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[12px] font-semibold normal-case tracking-normal text-slate-100 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                  value={selectedChairRows}
                  formatValue={(nextValue) => Math.round(nextValue).toString()}
                  onCommit={(nextValue) => updateSelectedChairLayout({ rows: nextValue })}
                />
              </label>
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Chairs / row
                <DraftNumberInput
                  min={1}
                  max={80}
                  step={1}
                  className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[12px] font-semibold normal-case tracking-normal text-slate-100 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                  value={selectedChairsPerRow}
                  formatValue={(nextValue) => Math.round(nextValue).toString()}
                  onCommit={(nextValue) => updateSelectedChairLayout({ chairsPerRow: nextValue })}
                />
              </label>
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Chair spacing
                <DraftNumberInput
                  min={1.5}
                  max={8}
                  step={0.25}
                  className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[12px] font-semibold normal-case tracking-normal text-slate-100 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                  value={selectedChairSpacingLu}
                  onCommit={(nextValue) => updateSelectedChairLayout({ chairSpacingLu: nextValue })}
                />
              </label>
              <label className="col-span-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Row spacing
                <DraftNumberInput
                  min={2.5}
                  max={10}
                  step={0.25}
                  className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[12px] font-semibold normal-case tracking-normal text-slate-100 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                  value={selectedChairRowSpacingLu}
                  onCommit={(nextValue) => updateSelectedChairLayout({ rowSpacingLu: nextValue })}
                />
              </label>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {selectedEditConfig?.properties.includes("scale") ? (
              <label className="col-span-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Size
                <DraftNumberInput
                  min={selectedEditConfig.minWidthLu}
                  max={selectedEditConfig.maxWidthLu}
                  step={0.5}
                  className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[12px] font-semibold normal-case tracking-normal text-slate-100 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                  value={Number(selectedObject.transform.widthLu.toFixed(2))}
                  onCommit={(nextValue) =>
                    updateSelectedObject({
                      widthLu: Number(clamp(nextValue, selectedEditConfig.minWidthLu, selectedEditConfig.maxWidthLu).toFixed(2)),
                      depthLu: Number(clamp(nextValue, selectedEditConfig.minWidthLu, selectedEditConfig.maxWidthLu).toFixed(2)),
                    })
                  }
                />
              </label>
            ) : null}
            {selectedEditConfig?.properties.includes("width") ? (
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Width
                <DraftNumberInput
                  min={selectedEditConfig.minWidthLu}
                  max={selectedEditConfig.maxWidthLu}
                  step={0.5}
                  className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[12px] font-semibold normal-case tracking-normal text-slate-100 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                  value={Number(selectedObject.transform.widthLu.toFixed(2))}
                  onCommit={(nextValue) =>
                    updateSelectedObject({
                      widthLu: Number(clamp(nextValue, selectedEditConfig.minWidthLu, selectedEditConfig.maxWidthLu).toFixed(2)),
                    })
                  }
                />
              </label>
            ) : null}
            {selectedEditConfig?.properties.includes("depth") ? (
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Depth
                <DraftNumberInput
                  min={selectedEditConfig.minDepthLu}
                  max={selectedEditConfig.maxDepthLu}
                  step={0.5}
                  className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[12px] font-semibold normal-case tracking-normal text-slate-100 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                  value={Number(selectedObject.transform.depthLu.toFixed(2))}
                  onCommit={(nextValue) =>
                    updateSelectedObject({
                      depthLu: Number(clamp(nextValue, selectedEditConfig.minDepthLu, selectedEditConfig.maxDepthLu).toFixed(2)),
                    })
                  }
                />
              </label>
            ) : null}
            {selectedEditConfig?.properties.includes("rotation") ? (
              <div className="col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Rotation
                  <DraftNumberInput
                    min={0}
                    max={359}
                    step={1}
                    className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[12px] font-semibold normal-case tracking-normal text-slate-100 outline-none backdrop-blur-xl focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/15"
                    value={normalizeRotationDeg(selectedObject.transform.rotationDeg)}
                    formatValue={(nextValue) => Math.round(nextValue).toString()}
                    onCommit={(nextValue) => updateSelectedObject({ rotationDeg: Math.round(clamp(nextValue, 0, 359)) })}
                  />
                </label>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {[0, 90, 180, 270].map((degrees) => (
                    <button
                      key={degrees}
                      type="button"
                      className="h-7 rounded-lg border border-white/10 bg-white/[0.055] text-[10px] font-semibold text-slate-300 transition hover:border-cyan-200/35 hover:bg-white/[0.09] hover:text-white"
                      onClick={() => updateSelectedObject({ rotationDeg: degrees })}
                    >
                      {degrees}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {!selectedEditConfig ? (
            <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-[11px] leading-5 text-slate-400">
              This component has no editable properties in the current canvas editor.
            </p>
          ) : null}
          {selectedCatalogComponent && selectedEditConfig ? (
            <button
              type="button"
              className="mt-3 h-8 rounded-full border border-white/10 bg-white/[0.055] px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:border-cyan-200/35 hover:bg-white/[0.09] hover:text-white"
              onClick={() =>
                updateSelectedObject({
                  widthLu: selectedCatalogComponent.widthLu,
                  depthLu: selectedCatalogComponent.depthLu,
                  rotationDeg: selectedCatalogComponent.defaultRotationDeg ?? 0,
                  capacitySeated: selectedCatalogComponent.capacitySeated,
                  label: null,
                })
              }
            >
              Reset catalog size
            </button>
          ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
