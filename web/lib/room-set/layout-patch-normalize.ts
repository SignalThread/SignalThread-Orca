/**
 * Normalize AI LayoutPatch JSON for Apply mode.
 */

import type { RoomSetComponentId } from "@/lib/room-set/component-library";

import type { LayoutPatch, LayoutPatchOp, LayoutSpecItem } from "./layout-spec";
import { normalizeAudienceTopologyFromUnknown } from "./layout-spec-audience-topology-infer";
import { resolvePatchComponentId } from "./layout-patch-component-resolve";
import {
  normalizeLayoutSpecItem,
  normalizeOptionalItem,
} from "./layout-spec-normalize";

const LAYOUT_TYPES = ["banquet", "classroom", "theater", "reception"] as const;
const AUDIENCE_STYLES = ["grid", "loose", "scattered", "arc"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function layoutTypeAlias(value: unknown): (typeof LAYOUT_TYPES)[number] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!normalized) return null;
  if (/^(?:banquet|banquet tables?|round tables?|rounds?|tables?)$/.test(normalized)) {
    return "banquet";
  }
  if (/^(?:classroom|training|training rows?|classroom rows?|desk rows?)$/.test(normalized)) {
    return "classroom";
  }
  if (/^(?:theater|theatre|chair rows?|audience rows?)$/.test(normalized)) {
    return "theater";
  }
  if (/^(?:reception|cocktail|cocktail reception|networking)$/.test(normalized)) {
    return "reception";
  }
  return null;
}

function layoutTypeFromPatchValue(value: Record<string, unknown>): (typeof LAYOUT_TYPES)[number] | null {
  return (
    enumValue(value.layoutType, LAYOUT_TYPES) ??
    layoutTypeAlias(value.layoutType) ??
    layoutTypeAlias(value.value) ??
    layoutTypeAlias(value.seatingStyle) ??
    layoutTypeAlias(value.audienceStyle)
  );
}

function rewritePatchItemComponentId(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const componentIdRaw = typeof value.componentId === "string" ? value.componentId.trim() : "";
  const resolved = resolvePatchComponentId(componentIdRaw);
  if (!resolved) return value;
  return { ...value, componentId: resolved };
}

function normalizePatchItem(
  value: unknown,
  allowed: ReadonlySet<string>,
): LayoutSpecItem | null {
  return normalizeLayoutSpecItem(rewritePatchItemComponentId(value), allowed);
}

function normalizeAddItemsEntries(value: Record<string, unknown>): unknown[] {
  if (Array.isArray(value.items)) {
    return value.items;
  }
  if (isRecord(value.items)) {
    return [value.items];
  }
  if (typeof value.componentId === "string") {
    return [value];
  }
  return [];
}

function normalizePatchOp(value: unknown, allowed: ReadonlySet<string>): LayoutPatchOp | null {
  if (!isRecord(value)) return null;

  const opRaw = typeof value.op === "string" ? value.op.trim() : "";
  const op = opRaw === "addItem" ? "addItems" : opRaw === "removeItem" ? "removeItems" : opRaw;

  switch (op) {
    case "addItems": {
      const items: LayoutSpecItem[] = [];
      for (const entry of normalizeAddItemsEntries(value)) {
        const item = normalizePatchItem(entry, allowed);
        if (item) items.push(item);
      }
      if (items.length === 0) return null;
      return { op: "addItems", items };
    }
    case "removeItems": {
      const componentIdRaw = typeof value.componentId === "string" ? value.componentId.trim() : "";
      const resolved = resolvePatchComponentId(componentIdRaw);
      if (!resolved || !allowed.has(resolved)) return null;
      const countRaw = value.count;
      const count =
        countRaw === null || countRaw === undefined
          ? null
          : clampInt(Number(countRaw) || 1, 1, 400);
      return {
        op: "removeItems",
        componentId: resolved,
        ...(count === null ? { count: null } : { count }),
      };
    }
    case "setAttendeeTarget": {
      const attendee = clampInt(Number(value.value) || 0, 1, 1200);
      return { op: "setAttendeeTarget", value: attendee };
    }
    case "setLayoutType": {
      const layoutType = layoutTypeFromPatchValue(value);
      if (!layoutType) return null;
      return { op: "setLayoutType", layoutType };
    }
    case "setAudienceStyle": {
      const audienceStyle = enumValue(value.audienceStyle, AUDIENCE_STYLES);
      if (!audienceStyle) {
        const layoutType = layoutTypeFromPatchValue(value);
        return layoutType ? { op: "setLayoutType", layoutType } : null;
      }
      return { op: "setAudienceStyle", audienceStyle };
    }
    case "setSeatingStyle": {
      const layoutType = layoutTypeFromPatchValue(value);
      if (!layoutType) return null;
      return { op: "setLayoutType", layoutType };
    }
    case "changeSeatingStyle": {
      const layoutType = layoutTypeFromPatchValue(value);
      if (!layoutType) return null;
      return { op: "setLayoutType", layoutType };
    }
    case "setPrimarySeating": {
      const layoutType = layoutTypeFromPatchValue(value);
      if (!layoutType) return null;
      return { op: "setLayoutType", layoutType };
    }
    case "setSeatingType": {
      const layoutType = layoutTypeFromPatchValue(value);
      if (!layoutType) return null;
      return { op: "setLayoutType", layoutType };
    }
    case "setAudienceTopology": {
      const topology =
        normalizeAudienceTopologyFromUnknown(value.topology) ??
        normalizeAudienceTopologyFromUnknown(value);
      if (!topology) return null;
      return { op: "setAudienceTopology", topology };
    }
    case "setFrontScreen": {
      if (value.item === null) return { op: "setFrontScreen", item: null };
      const item = normalizeOptionalItem(rewritePatchItemComponentId(value.item), allowed);
      if (!item || !item.componentId.startsWith("av-")) return null;
      return { op: "setFrontScreen", item };
    }
    case "setFrontStage": {
      if (value.item === null) return { op: "setFrontStage", item: null };
      const item = normalizeOptionalItem(rewritePatchItemComponentId(value.item), allowed);
      if (!item || !item.componentId.startsWith("stage-")) return null;
      return { op: "setFrontStage", item };
    }
    default:
      return null;
  }
}

export function summarizeLayoutPatchOps(patch: LayoutPatch): ReadonlyArray<Record<string, unknown>> {
  return patch.ops.map((op) => {
    switch (op.op) {
      case "addItems":
        return {
          op: op.op,
          items: op.items.map((item) => ({
            componentId: item.componentId,
            count: item.count,
            zoneRole: item.zoneRole ?? null,
            placementPreference: item.placementPreference ?? null,
          })),
        };
      case "removeItems":
        return { op: op.op, componentId: op.componentId, count: op.count ?? null };
      case "setAttendeeTarget":
        return { op: op.op, value: op.value };
      case "setLayoutType":
        return { op: op.op, layoutType: op.layoutType };
      case "setAudienceStyle":
        return { op: op.op, audienceStyle: op.audienceStyle };
      case "setAudienceTopology":
        return { op: op.op, topology: { ...op.topology } };
      case "setFrontScreen":
        return {
          op: op.op,
          item: op.item ? { componentId: op.item.componentId, count: op.item.count } : null,
        };
      case "setFrontStage":
        return {
          op: op.op,
          item: op.item ? { componentId: op.item.componentId, count: op.item.count } : null,
        };
      default:
        return { op: "unknown" };
    }
  });
}

export type LayoutPatchNormalizeFailure = Readonly<{
  index: number;
  op: string | null;
  field: string | null;
  value: unknown;
  reason: string;
}>;

function normalizeFailureForPatchOp(
  value: unknown,
  allowed: ReadonlySet<string>,
  index: number,
): LayoutPatchNormalizeFailure | null {
  if (!isRecord(value)) {
    return {
      index,
      op: null,
      field: null,
      value,
      reason: "op must be an object",
    };
  }
  if (normalizePatchOp(value, allowed)) return null;

  const opRaw = typeof value.op === "string" ? value.op.trim() : "";
  const op = opRaw === "addItem" ? "addItems" : opRaw === "removeItem" ? "removeItems" : opRaw;
  switch (op) {
    case "addItems":
      return {
        index,
        op,
        field: "items",
        value: value.items ?? value.componentId ?? null,
        reason: "addItems requires at least one valid catalog item",
      };
    case "removeItems":
      return {
        index,
        op,
        field: "componentId",
        value: value.componentId ?? null,
        reason: "removeItems requires a valid catalog componentId",
      };
    case "setLayoutType":
      return {
        index,
        op,
        field: "layoutType",
        value: value.layoutType ?? value.value ?? value.seatingStyle ?? null,
        reason: "setLayoutType requires banquet, classroom, theater, or reception",
      };
    case "setAudienceStyle":
      return {
        index,
        op,
        field: "audienceStyle",
        value: value.audienceStyle ?? null,
        reason: "setAudienceStyle requires grid, loose, or arc",
      };
    case "setAudienceTopology":
      return {
        index,
        op,
        field: "topology",
        value: value.topology ?? value,
        reason: "setAudienceTopology requires a supported topology object",
      };
    case "setFrontScreen":
    case "setFrontStage":
      return {
        index,
        op,
        field: "item",
        value: value.item ?? null,
        reason: `${op} requires null or a valid front component item`,
      };
    default:
      return {
        index,
        op: op || null,
        field: "op",
        value: value.op ?? null,
        reason: "unsupported patch op",
      };
  }
}

export function summarizeLayoutPatchNormalizeFailures(
  value: unknown,
  allowedComponentIds: readonly RoomSetComponentId[],
): readonly LayoutPatchNormalizeFailure[] {
  if (!isRecord(value)) {
    return [{ index: -1, op: null, field: null, value, reason: "layoutPatch must be an object" }];
  }
  if (!Array.isArray(value.ops)) {
    return [{ index: -1, op: null, field: "ops", value: value.ops, reason: "layoutPatch.ops must be an array" }];
  }

  const allowed = new Set<string>(allowedComponentIds);
  const failures: LayoutPatchNormalizeFailure[] = [];
  value.ops.forEach((entry, index) => {
    const failure = normalizeFailureForPatchOp(entry, allowed, index);
    if (failure) failures.push(failure);
  });
  return failures;
}

export function normalizeLayoutPatchFromUnknown(
  value: unknown,
  allowedComponentIds: readonly RoomSetComponentId[],
): LayoutPatch | null {
  if (!isRecord(value)) return null;
  const allowed = new Set<string>(allowedComponentIds);
  if (!Array.isArray(value.ops)) return null;

  const ops: LayoutPatchOp[] = [];
  for (const entry of value.ops) {
    const op = normalizePatchOp(entry, allowed);
    if (op) ops.push(op);
    if (ops.length >= 24) break;
  }

  if (ops.length === 0) return null;
  return { version: 1, ops };
}
