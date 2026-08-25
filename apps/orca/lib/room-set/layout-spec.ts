/**
 * LayoutSpec — semantic layout contract for Generate mode.
 *
 * AI → LayoutSpec → composeLayoutSpec() → validate → render
 */

import type { RoomSetComponentId } from "@/lib/room-set/component-library";

import type {
  RoomSetDensityPreference,
  RoomSetAudienceStyle,
  RoomSetEventIntentId,
  RoomTypeStarterId,
} from "./planner-intent-shared";
import type { RoomSetPlannerPlacementPreference } from "./planner-component-requests";
import type { ApplySemanticDirectives } from "./layout-spec-semantic-directives";

export type LayoutSpecLayoutType = RoomTypeStarterId;

export type LayoutSpecZoneRole =
  | "front"
  | "audience"
  | "perimeter"
  | "rear"
  | "mixed";

export type LayoutSpecItem = Readonly<{
  componentId: RoomSetComponentId;
  count: number;
  zoneRole?: LayoutSpecZoneRole;
  placementPreference?: RoomSetPlannerPlacementPreference;
  label?: string;
}>;

export type LayoutSpecFrontIntent = Readonly<{
  screen?: LayoutSpecItem;
  stage?: LayoutSpecItem;
  av: readonly LayoutSpecItem[];
}>;

export type LayoutSpecAudienceIntent = Readonly<{
  primaryComponentId: RoomSetComponentId;
  primaryComponentCapacity: number;
  requiredPrimaryComponents: number;
}>;

export type LayoutSpecAudienceWidthBias = "narrower" | "wider";
export type LayoutSpecAudienceDepthBias = "shallower" | "deeper";
export type LayoutSpecAudienceArcStrength = "softer" | "normal" | "stronger";

/** Banquet audience topology bias — composer-owned, no coordinates. */
export type LayoutSpecAudienceTopologyIntent = Readonly<{
  preferredRows?: number;
  widthBias?: LayoutSpecAudienceWidthBias;
  depthBias?: LayoutSpecAudienceDepthBias;
  arcStrength?: LayoutSpecAudienceArcStrength;
}>;

export type LayoutSpec = Readonly<{
  version: 1;
  source: "ai-generate" | "ai-edit";
  eventIntent: RoomSetEventIntentId;
  layoutType: LayoutSpecLayoutType;
  attendeeTarget: number;
  densityPreference: RoomSetDensityPreference;
  audienceStyle: RoomSetAudienceStyle;
  front: LayoutSpecFrontIntent;
  audience: LayoutSpecAudienceIntent;
  audienceTopology?: LayoutSpecAudienceTopologyIntent;
  secondary: readonly LayoutSpecItem[];
}>;

/** Semantic edit ops — no coordinates, no topology preservation. */
export type LayoutPatchOp =
  | Readonly<{ op: "addItems"; items: readonly LayoutSpecItem[] }>
  | Readonly<{ op: "removeItems"; componentId: RoomSetComponentId; count?: number | null }>
  | Readonly<{ op: "setAttendeeTarget"; value: number }>
  | Readonly<{ op: "setLayoutType"; layoutType: LayoutSpecLayoutType }>
  | Readonly<{ op: "setAudienceStyle"; audienceStyle: RoomSetAudienceStyle }>
  | Readonly<{ op: "setAudienceTopology"; topology: LayoutSpecAudienceTopologyIntent }>
  | Readonly<{ op: "setFrontScreen"; item: LayoutSpecItem | null }>
  | Readonly<{ op: "setFrontStage"; item: LayoutSpecItem | null }>;

export type LayoutPatch = Readonly<{
  version: 1;
  ops: readonly LayoutPatchOp[];
}>;

export type LayoutSpecComposeInput = Readonly<{
  spec: LayoutSpec;
  roomWidthLu: number;
  roomDepthLu: number;
  /** Apply-mode only — weights topology scoring; not part of AI contract. */
  applySemanticDirectives?: ApplySemanticDirectives;
}>;
