/**
 * Merge LayoutPatch into a base LayoutSpec — semantic only, no coordinates.
 */

import type { RoomSetComponentId } from "@/lib/room-set/component-library";
import { getRoomSetComponent } from "@/lib/room-set/component-library";
import { primarySeatingCapacity, starterIdFromPrimaryComponentId } from "@/lib/room-set/planner-seating-resolve";
import { normalizeRoomSetAudienceStyle } from "@/lib/room-set/planner-intent-shared";

import type {
  LayoutPatch,
  LayoutPatchOp,
  LayoutSpec,
  LayoutSpecAudienceTopologyIntent,
  LayoutSpecFrontIntent,
  LayoutSpecItem,
} from "./layout-spec";
import { mergeAudienceTopologyIntent } from "./layout-spec-audience-topology-infer";
import { defaultPrimaryForLayoutType } from "./layout-spec-normalize";

function clampAttendees(value: number): number {
  return Math.max(1, Math.min(1200, Math.round(value)));
}

function clampCount(value: number): number {
  return Math.max(1, Math.min(400, Math.round(value)));
}

function isScreenComponentId(componentId: RoomSetComponentId): boolean {
  return (
    componentId === "av-projector-screen" ||
    componentId === "av-led-wall" ||
    componentId === "av-confidence-monitor"
  );
}

function isStageComponentId(componentId: RoomSetComponentId): boolean {
  return componentId.startsWith("stage-");
}

function isFrontAvComponentId(componentId: RoomSetComponentId): boolean {
  return componentId.startsWith("av-") && !isScreenComponentId(componentId);
}

function isEdgeServiceComponentId(componentId: RoomSetComponentId): boolean {
  const def = getRoomSetComponent(componentId);
  if (!def) return false;
  return def.category === "fnb" || def.category === "registration";
}

function cloneItem(item: LayoutSpecItem): LayoutSpecItem {
  return {
    componentId: item.componentId,
    count: item.count,
    ...(item.zoneRole ? { zoneRole: item.zoneRole } : {}),
    ...(item.placementPreference ? { placementPreference: item.placementPreference } : {}),
    ...(item.label ? { label: item.label } : {}),
  };
}

function cloneSpec(spec: LayoutSpec): LayoutSpec {
  return {
    ...spec,
    front: {
      ...(spec.front.screen ? { screen: cloneItem(spec.front.screen) } : {}),
      ...(spec.front.stage ? { stage: cloneItem(spec.front.stage) } : {}),
      av: spec.front.av.map(cloneItem),
    },
    audience: { ...spec.audience },
    ...(spec.audienceTopology ? { audienceTopology: { ...spec.audienceTopology } } : {}),
    secondary: spec.secondary.map(cloneItem),
  };
}

function appendSecondaryItems(
  secondary: LayoutSpecItem[],
  items: readonly LayoutSpecItem[],
): LayoutSpecItem[] {
  const out = secondary.map(cloneItem);
  for (const item of items) {
    out.push(cloneItem({ ...item, count: clampCount(item.count) }));
  }
  return out;
}

function removeFromItemList(
  items: LayoutSpecItem[],
  componentId: RoomSetComponentId,
  countToRemove: number | null,
): LayoutSpecItem[] {
  if (countToRemove === null) {
    return items.filter((item) => item.componentId !== componentId);
  }
  let remaining = countToRemove;
  const out: LayoutSpecItem[] = [];
  for (const item of items) {
    if (item.componentId !== componentId || remaining <= 0) {
      out.push(cloneItem(item));
      continue;
    }
    if (item.count > remaining) {
      out.push(cloneItem({ ...item, count: item.count - remaining }));
      remaining = 0;
    } else {
      remaining -= item.count;
    }
  }
  return out;
}

function componentExistsInSpec(spec: LayoutSpec, componentId: RoomSetComponentId): boolean {
  if (spec.front.screen?.componentId === componentId) return true;
  if (spec.front.stage?.componentId === componentId) return true;
  if (spec.front.av.some((item) => item.componentId === componentId)) return true;
  if (spec.secondary.some((item) => item.componentId === componentId)) return true;
  return false;
}

function reconcileAudienceAfterLayoutChange(spec: LayoutSpec): LayoutSpec {
  const primaryComponentId = defaultPrimaryForLayoutType(spec.layoutType);
  const primaryComponentCapacity = Math.max(1, primarySeatingCapacity(primaryComponentId) ?? 8);
  const requiredPrimaryComponents = Math.max(
    1,
    Math.min(400, Math.ceil(spec.attendeeTarget / primaryComponentCapacity)),
  );
  return {
    ...spec,
    audience: {
      primaryComponentId,
      primaryComponentCapacity,
      requiredPrimaryComponents,
    },
  };
}

function routeAddedItem(item: LayoutSpecItem): "front-screen" | "front-stage" | "front-av" | "secondary" {
  if (isScreenComponentId(item.componentId)) return "front-screen";
  if (isStageComponentId(item.componentId)) return "front-stage";
  if (isEdgeServiceComponentId(item.componentId)) return "secondary";
  if (isFrontAvComponentId(item.componentId)) return "front-av";
  return "secondary";
}

type ApplyPatchContext = Readonly<{
  baseSpec: LayoutSpec;
}>;

function applyPatchOp(spec: LayoutSpec, op: LayoutPatchOp, ctx: ApplyPatchContext): LayoutSpec {
  switch (op.op) {
    case "addItems": {
      let front: LayoutSpecFrontIntent = {
        ...spec.front,
        av: [...spec.front.av],
      };
      let secondary = spec.secondary.map(cloneItem);
      const secondaryAdds: LayoutSpecItem[] = [];

      for (const raw of op.items) {
        const item = cloneItem({ ...raw, count: clampCount(raw.count) });
        switch (routeAddedItem(item)) {
          case "front-screen":
            front = { ...front, screen: item };
            break;
          case "front-stage":
            front = { ...front, stage: item };
            break;
          case "front-av":
            front = { ...front, av: [...front.av, item] };
            break;
          case "secondary":
            secondaryAdds.push(item);
            break;
        }
      }
      secondary = appendSecondaryItems(secondary, secondaryAdds);
      return { ...spec, front, secondary, source: "ai-edit" };
    }
    case "removeItems": {
      if (!componentExistsInSpec(ctx.baseSpec, op.componentId)) {
        return spec;
      }
      const countToRemove = op.count === undefined ? null : op.count;
      const componentId = op.componentId;
      let front: LayoutSpecFrontIntent = { ...spec.front, av: [...spec.front.av] };

      if (front.screen?.componentId === componentId && countToRemove === null) {
        const { screen: _removed, ...rest } = front;
        front = rest as LayoutSpecFrontIntent;
      }
      if (front.stage?.componentId === componentId && countToRemove === null) {
        const { stage: _removed, ...rest } = front;
        front = rest as LayoutSpecFrontIntent;
      }
      front = {
        ...front,
        av: removeFromItemList([...front.av], componentId, countToRemove),
      };
      return {
        ...spec,
        front,
        secondary: removeFromItemList([...spec.secondary], componentId, countToRemove),
        source: "ai-edit",
      };
    }
    case "setAttendeeTarget": {
      const attendeeTarget = clampAttendees(op.value);
      const primaryComponentCapacity = Math.max(1, spec.audience.primaryComponentCapacity);
      return {
        ...spec,
        attendeeTarget,
        audience: {
          ...spec.audience,
          requiredPrimaryComponents: Math.max(
            1,
            Math.min(400, Math.ceil(attendeeTarget / primaryComponentCapacity)),
          ),
        },
        source: "ai-edit",
      };
    }
    case "setLayoutType": {
      const next = reconcileAudienceAfterLayoutChange({
        ...spec,
        layoutType: op.layoutType,
      });
      const reconciled =
        starterIdFromPrimaryComponentId(next.audience.primaryComponentId) !== op.layoutType
          ? reconcileAudienceAfterLayoutChange({ ...next, layoutType: op.layoutType })
          : next;
      return {
        ...reconciled,
        audienceStyle: normalizeRoomSetAudienceStyle(reconciled.audienceStyle, op.layoutType),
        source: "ai-edit",
      };
    }
    case "setAudienceStyle": {
      return {
        ...spec,
        audienceStyle: normalizeRoomSetAudienceStyle(op.audienceStyle, spec.layoutType),
        source: "ai-edit",
      };
    }
    case "setAudienceTopology": {
      return {
        ...spec,
        audienceTopology: mergeAudienceTopologyIntent(spec.audienceTopology, op.topology),
        source: "ai-edit",
      };
    }
    case "setFrontScreen": {
      const front = { ...spec.front, av: [...spec.front.av] };
      if (op.item === null) {
        const { screen: _removed, ...rest } = front;
        return { ...spec, front: rest as LayoutSpecFrontIntent, source: "ai-edit" };
      }
      return {
        ...spec,
        front: { ...front, screen: cloneItem({ ...op.item, count: clampCount(op.item.count) }) },
        source: "ai-edit",
      };
    }
    case "setFrontStage": {
      const front = { ...spec.front, av: [...spec.front.av] };
      if (op.item === null) {
        const { stage: _removed, ...rest } = front;
        return { ...spec, front: rest as LayoutSpecFrontIntent, source: "ai-edit" };
      }
      return {
        ...spec,
        front: { ...front, stage: cloneItem({ ...op.item, count: clampCount(op.item.count) }) },
        source: "ai-edit",
      };
    }
    default:
      return spec;
  }
}

function secondaryUnits(spec: LayoutSpec): number {
  return spec.secondary.reduce((total, item) => total + item.count, 0);
}

export function summarizeLayoutSpecSecondary(spec: LayoutSpec): Readonly<{
  secondaryCount: number;
  secondaryComponentIds: readonly RoomSetComponentId[];
  secondaryTotalUnits: number;
}> {
  return {
    secondaryCount: spec.secondary.length,
    secondaryComponentIds: spec.secondary.map((item) => item.componentId),
    secondaryTotalUnits: secondaryUnits(spec),
  };
}

export function applyLayoutPatch(baseSpec: LayoutSpec, patch: LayoutPatch): LayoutSpec {
  const ctx: ApplyPatchContext = { baseSpec: cloneSpec(baseSpec) };
  let spec = cloneSpec(baseSpec);

  const setOps: LayoutPatchOp[] = [];
  const addOps: LayoutPatchOp[] = [];
  const removeOps: LayoutPatchOp[] = [];

  for (const op of patch.ops) {
    if (op.op === "addItems") addOps.push(op);
    else if (op.op === "removeItems") removeOps.push(op);
    else setOps.push(op);
  }

  for (const op of setOps) {
    spec = applyPatchOp(spec, op, ctx);
  }
  for (const op of addOps) {
    spec = applyPatchOp(spec, op, ctx);
  }
  for (const op of removeOps) {
    spec = applyPatchOp(spec, op, ctx);
  }

  return spec;
}
