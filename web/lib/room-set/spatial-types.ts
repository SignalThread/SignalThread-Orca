/** Abstract layout unit (approximate drafting scale — UI shows metric helper). */
export type LayoutUnit = number;

export type RoomSetObjectType =
  | "banquet_table"
  | "classroom_table"
  | "chair_block"
  | "stage"
  | "screen"
  | "buffet"
  | "bar"
  | "registration_desk"
  | "av_table"
  | "aisle_zone";

export const ROOM_SET_OBJECT_TYPES = [
  "banquet_table",
  "classroom_table",
  "chair_block",
  "stage",
  "screen",
  "buffet",
  "bar",
  "registration_desk",
  "av_table",
  "aisle_zone",
] as const satisfies readonly RoomSetObjectType[];

/** Base numeric geometry on canvas — objects are authored as anchored transforms */
export type RoomSetTransform = {
  /** Center X in layout units */
  cx: LayoutUnit;
  /** Center Y in layout units */
  cy: LayoutUnit;
  /** Full width across local X axis prior to rotation */
  widthLu: LayoutUnit;
  /** Full depth across local Y axis prior to rotation */
  heightLu: LayoutUnit;
  /** Degrees clockwise */
  rotationDeg: LayoutUnit;
};

export type CapacityContribution =
  | { mode: "seated"; seatedGuests: number }
  | { mode: "staff_workstation"; workstations: number }
  | { mode: "neutral"; rationale: string }
  | { mode: "none" };

/** Clear planner-owned operational envelopes around authored footprint */
export type ClearanceRequirement = {
  /** Extra inset from footprint for linens / pulls / knees */
  serviceEnvelopeLu: number;
  /** Egress corridor reserved along object front (logical front = local +Y half-edge) */
  egressLu: number;
};

/**
 * Spatial profiles distinguish object kinds beyond rectangles:
 * authoring uses a footprint transform; semantics drive validation & capacity phases later.
 */
export type TableSpatialProfile =
  | {
      spatialClass: "rectilinear_round_table";
      diameterLu: LayoutUnit;
    }
  | {
      spatialClass: "rectilinear_dual_row_table";
      rowPitchLu: LayoutUnit;
      seatsPerSide: number;
      serviceAislesLu: LayoutUnit[];
    };

export type StageSpatialProfile = {
  spatialClass: "elevated_performance";
  fasciaDepthLu: number;
  backstageDepthLu: number;
};

export type ScreenSpatialProfile = {
  spatialClass: "projection_plane";
  throwDepthLu: number;
  clearanceConeDeg: number;
};

export type FlowZoneSpatialProfile = {
  spatialClass: "non_structural_zone";
};

export type FixtureSpatialProfile = {
  spatialClass: "rectilinear_fixture";
};

export type RoomSetSpatialProfile =
  | ({ objectKind: "table" } & TableSpatialProfile)
  | ({ objectKind: "stage" } & StageSpatialProfile)
  | ({ objectKind: "screen" } & ScreenSpatialProfile)
  | ({ objectKind: "flow_zone" } & FlowZoneSpatialProfile)
  | ({ objectKind: "fixture" } & FixtureSpatialProfile);

export type RoomSetSpatialObject = {
  id: string;
  type: RoomSetObjectType;
  label: string | null;
  transform: RoomSetTransform;
  profile: RoomSetSpatialProfile;
  metadata: Record<string, unknown>;
  capacityContribution: CapacityContribution;
  clearanceRequirement: ClearanceRequirement;
};

export type RoomSetLayoutBoundary = {
  widthLu: LayoutUnit;
  depthLu: LayoutUnit;
};

export type RoomSetLayoutSlice = {
  id: string;
  name: string;
  boundary: RoomSetLayoutBoundary;
  /** Top-left anchor (tldraw page px) for the synced room perimeter frame; defaults when absent. */
  plannerRoomPageAnchor?: { x: number; y: number };
  objects: RoomSetSpatialObject[];
};

export type RoomSetDocumentV1 = {
  version: 1;
  layouts: Record<string, RoomSetLayoutSlice>;
  activeLayoutId: string;
  /** Optional time-aware operational program (Phase 2+) */
  operational?: import("./operational-types").RoomOperationalProgramV1;
  /**
   * App-native PlannerScene JSON per layout id — preferred local draft format for generated/authored layouts.
   * Canvas rendering still hydrates through the tldraw adapter at runtime.
   */
  plannerScenes?: Record<string, import("./planner-scene").PlannerScene>;
  /**
   * Semantic generation/edit contract per layout id. Keeping this beside the local draft lets Apply
   * continue through the patch composer after a browser reload instead of degrading to legacy placement mode.
   */
  layoutSpecs?: Record<string, import("./layout-spec").LayoutSpec>;
  /**
   * Serialized tldraw store JSON per layout id — local drafts only (`persistence.ts`).
   * Legacy `layouts[*].objects` arrays remain for operational mocks until geometry sync completes.
   */
  tldrawSnapshots?: Record<string, string>;
};

export type RoomSetPlanResultStatus =
  | "success"
  | "success_with_adjustments"
  | "failed";

export type RoomSetPlanFailureAffectedObject = {
  id?: string;
  name?: string;
  componentId?: string;
  placementIndex?: number;
};

export type RoomSetPlanFailureDetails = {
  code: string;
  reason: string;
  failedValidationChecks: string[];
  affectedObjects: RoomSetPlanFailureAffectedObject[];
};

export type RoomSetPlanResultMessage = {
  resultStatus: RoomSetPlanResultStatus;
  userMessageTitle: string;
  userMessageBody: string;
  adjustments: string[];
  suggestions: string[];
  failureDetails?: RoomSetPlanFailureDetails;
  /** Server diagnostic only. UI should not render this to customers. */
  debugReason?: string;
};
