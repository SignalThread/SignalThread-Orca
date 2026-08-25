import type { RoomSetLayoutBoundary, RoomSetSpatialObject } from "./spatial-types";

export type OperationalPhasePreset =
  | "setup"
  | "doors_open"
  | "session_live"
  | "break"
  | "reception"
  | "teardown"
  | "reset";

/** Ordered lifecycle anchors — each maps to its own spatial snapshot by default */
export const OPERATIONAL_PHASE_PRESETS_ORDER = [
  "setup",
  "doors_open",
  "session_live",
  "break",
  "reception",
  "teardown",
  "reset",
] as const satisfies readonly OperationalPhasePreset[];

export type OperationalOverlayKind =
  | "attendee_flow"
  | "congestion"
  | "staffing_movement"
  | "fnb_service_lane"
  | "emergency_egress"
  | "sightlines";

export const OPERATIONAL_OVERLAY_KINDS = [
  "attendee_flow",
  "congestion",
  "staffing_movement",
  "fnb_service_lane",
  "emergency_egress",
  "sightlines",
] as const satisfies readonly OperationalOverlayKind[];

export type SimulationModeKind =
  | "authoring"
  | "timeline_scrub"
  | "crowd_pulse"
  | "stress_paths";

export type TransitionFeasibility = "green" | "amber" | "blocked";

export type OperationalStaffingImpact = {
  setupCrew: number;
  ushers: number;
  avDuty: boolean;
  fnbTouches: number;
};

export type RoomOperationalStateDef = {
  id: string;
  preset: OperationalPhasePreset;
  /** Human-readable — may diverge after duplication */
  label: string;
  /** Key into RoomSetDocumentV1.layouts */
  layoutId: string;
  suppressedObjectIds: string[];
  /** Minutes expected from entering this slice after predecessor (null = instantaneous / TBD) */
  transitionIngressMinutes: number | null;
  staffing: OperationalStaffingImpact;
};

export type OperationalStaffingDelta = {
  setupCrewDelta: number;
  ushersDelta: number;
  fnbTouchesDelta: number;
  /** Target slice expects AV accountability */
  avLiveNext: boolean;
};

export type OperationalTransitionDef = {
  id: string;
  fromStateId: string;
  toStateId: string;
  /** Planner-assigned default — mocked analytics may insist on slack */
  durationMinutes: number;
  feasibility: TransitionFeasibility;
  staffingDelta: OperationalStaffingDelta;
  warnings: string[];
};

export type OperationalOverlayToggles = Record<OperationalOverlayKind, boolean>;

export type RoomOperationalProgramV1 = {
  version: 1;
  /** Left-to-right timeline order — state IDs */
  timelineOrder: string[];
  states: Record<string, RoomOperationalStateDef>;
  transitions: OperationalTransitionDef[];
  overlays: OperationalOverlayToggles;
  overlayOpacityPct: Partial<Record<OperationalOverlayKind, number>>;
  activeStateId: string;
  simulation: {
    mode: SimulationModeKind;
    /** Mock clock acceleration */
    speedMultiplier: number;
    /** Minute offset scrub within active transition visualization */
    transitionScrubMinutes: number;
  };
  /** Secondary state highlighted for differential compare against active */
  compareStateId: string | null;
};

export type OperationalPlaybackVisualContext = {
  /** Smooth loop 0..1 driving dash offsets / micro motion */
  motionPhase01: number;
  /** 0 exiting prior slice, 1 entering next during transition playback */
  transitionBlend01: number;
  inTransitionPlayback: boolean;
};

export type OperationalOverlayHeatCell = {
  cxLu: number;
  cyLu: number;
  halfWLu: number;
  halfHLu: number;
  score01: number;
};

export type OperationalOverlayDrawable =
  | {
      kind: "flow_curve";
      id: string;
      pointsLu: number[];
      color: string;
      widthPx: number;
      dash?: number[];
      dashOffset?: number;
    }
  | {
      kind: "heat_cell";
      id: string;
      cell: OperationalOverlayHeatCell;
    }
  | {
      kind: "movement_arrow";
      id: string;
      cxLu: number;
      cyLu: number;
      rotationDeg: number;
      spanLu: number;
      color: string;
      /** Subtle rotational sway (degrees), applied in renderer */
      rotationSwayDeg?: number;
    }
  | {
      kind: "sightline_ray";
      id: string;
      x1Lu: number;
      y1Lu: number;
      x2Lu: number;
      y2Lu: number;
      obstructed?: boolean;
      /** Multiplier merged with heuristic stroke alphas */
      opacityScale?: number;
    }
  | {
      kind: "egress_strip";
      id: string;
      xLu: number;
      yLu: number;
      wLu: number;
      hLu: number;
      clear: boolean;
    }
  | {
      kind: "turnover_band";
      id: string;
      cxLu: number;
      cyLu: number;
      wLu: number;
      hLu: number;
      stress01: number;
    };

export type OperationalTransitionPreviewContext = {
  boundary: RoomSetLayoutBoundary;
  fromObjects: RoomSetSpatialObject[];
  toObjects: RoomSetSpatialObject[];
  preset: OperationalPhasePreset;
};
