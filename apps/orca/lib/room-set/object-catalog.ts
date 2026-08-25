import type {
  ClearanceRequirement,
  RoomSetLayoutBoundary,
  RoomSetLayoutSlice,
  RoomSetObjectType,
  RoomSetSpatialObject,
  RoomSetSpatialProfile,
  RoomSetDocumentV1,
} from "./spatial-types";
import { formatFeetDimensions } from "./room-units";

export type LibraryEntry = {
  type: RoomSetObjectType;
  title: string;
  description: string;
};

export function formatLuDimensions(widthLu: number, depthLu: number): string {
  return formatFeetDimensions(widthLu, depthLu);
}

export const OBJECT_LIBRARY_ENTRIES: LibraryEntry[] = [
  {
    type: "banquet_table",
    title: "Banquet rounds",
    description: "Circular guest tables (round footprint)",
  },
  {
    type: "classroom_table",
    title: "Classroom tables",
    description: "Training rows — dual sided",
  },
  { type: "chair_block", title: "Chair block", description: "Theatre cluster" },
  { type: "stage", title: "Stage", description: "Performance volume" },
  { type: "screen", title: "Screen / LED", description: "Projection footprint" },
  { type: "buffet", title: "Buffet", description: "F&B service spine" },
  { type: "bar", title: "Bar", description: "Service bar fixture" },
  { type: "registration_desk", title: "Registration", description: "Check-in desks" },
  { type: "av_table", title: "AV table", description: "Tech position" },
  { type: "aisle_zone", title: "Aisle zone", description: "Circulation planner" },
];

export function defaultCapacity(type: RoomSetObjectType) {
  switch (type) {
    case "banquet_table":
      return { mode: "seated" as const, seatedGuests: 8 };
    case "classroom_table":
      return { mode: "seated" as const, seatedGuests: 12 };
    case "chair_block":
      return { mode: "seated" as const, seatedGuests: 48 };
    case "stage":
      return { mode: "none" as const };
    case "screen":
      return { mode: "none" as const };
    case "buffet":
      return { mode: "staff_workstation" as const, workstations: 4 };
    case "bar":
      return { mode: "staff_workstation" as const, workstations: 3 };
    case "registration_desk":
      return { mode: "staff_workstation" as const, workstations: 6 };
    case "av_table":
      return { mode: "staff_workstation" as const, workstations: 2 };
    case "aisle_zone":
      return { mode: "neutral" as const, rationale: "Circulation envelope" };
    default:
      return { mode: "none" as const };
  }
}

export function defaultClearance(type: RoomSetObjectType): ClearanceRequirement {
  switch (type) {
    case "banquet_table":
      return { serviceEnvelopeLu: 2, egressLu: 4 };
    case "chair_block":
      return { serviceEnvelopeLu: 1, egressLu: 6 };
    case "buffet":
    case "bar":
      return { serviceEnvelopeLu: 3, egressLu: 8 };
    case "aisle_zone":
      return { serviceEnvelopeLu: 0, egressLu: 0 };
    default:
      return { serviceEnvelopeLu: 1, egressLu: 3 };
  }
}

export function footprintAndProfile(type: RoomSetObjectType): {
  widthLu: number;
  heightLu: number;
  profile: RoomSetSpatialProfile;
} {
  switch (type) {
    case "banquet_table":
      return {
        widthLu: 22,
        heightLu: 22,
        profile: {
          objectKind: "table",
          spatialClass: "rectilinear_round_table",
          diameterLu: 21,
        },
      };
    case "classroom_table":
      return {
        widthLu: 32,
        heightLu: 10,
        profile: {
          objectKind: "table",
          spatialClass: "rectilinear_dual_row_table",
          rowPitchLu: 2.5,
          seatsPerSide: 6,
          serviceAislesLu: [3.5],
        },
      };
    case "chair_block":
      return {
        widthLu: 40,
        heightLu: 28,
        profile: {
          objectKind: "table",
          spatialClass: "rectilinear_dual_row_table",
          rowPitchLu: 2,
          seatsPerSide: 8,
          serviceAislesLu: [5],
        },
      };
    case "stage":
      return {
        widthLu: 48,
        heightLu: 20,
        profile: {
          objectKind: "stage",
          spatialClass: "elevated_performance",
          fasciaDepthLu: 4,
          backstageDepthLu: 14,
        },
      };
    case "screen":
      return {
        widthLu: 32,
        heightLu: 2,
        profile: {
          objectKind: "screen",
          spatialClass: "projection_plane",
          throwDepthLu: 24,
          clearanceConeDeg: 45,
        },
      };
    case "buffet":
      return {
        widthLu: 36,
        heightLu: 8,
        profile: {
          objectKind: "fixture",
          spatialClass: "rectilinear_fixture",
        },
      };
    case "bar":
      return {
        widthLu: 20,
        heightLu: 8,
        profile: {
          objectKind: "fixture",
          spatialClass: "rectilinear_fixture",
        },
      };
    case "registration_desk":
      return {
        widthLu: 24,
        heightLu: 6,
        profile: {
          objectKind: "fixture",
          spatialClass: "rectilinear_fixture",
        },
      };
    case "av_table":
      return {
        widthLu: 10,
        heightLu: 6,
        profile: {
          objectKind: "fixture",
          spatialClass: "rectilinear_fixture",
        },
      };
    case "aisle_zone":
      return {
        widthLu: 20,
        heightLu: 40,
        profile: {
          objectKind: "flow_zone",
          spatialClass: "non_structural_zone",
        },
      };
    default: {
      const _: never = type;
      return _;
    }
  }
}

export function createSpatialObject(type: RoomSetObjectType, center: { cx: number; cy: number }): RoomSetSpatialObject {
  const footprint = footprintAndProfile(type);
  return {
    id: crypto.randomUUID(),
    type,
    label: null,
    transform: {
      cx: center.cx,
      cy: center.cy,
      widthLu: footprint.widthLu,
      heightLu: footprint.heightLu,
      rotationDeg: type === "screen" ? 0 : type === "stage" ? 0 : 0,
    },
    profile: footprint.profile,
    metadata: { createdFromLibrary: type },
    capacityContribution: defaultCapacity(type),
    clearanceRequirement: defaultClearance(type),
  };
}

export function duplicateSpatialObject(sample: RoomSetSpatialObject): RoomSetSpatialObject {
  return {
    ...sample,
    id: crypto.randomUUID(),
    label: sample.label ? `${sample.label} copy` : null,
    transform: {
      ...sample.transform,
      cx: sample.transform.cx + 4,
      cy: sample.transform.cy + 4,
    },
    metadata: { ...(sample.metadata ?? {}), duplicatedFromId: sample.id },
  };
}

export function defaultRoomBoundary(): RoomSetLayoutBoundary {
  return { widthLu: 120, depthLu: 72 };
}

export function createInitialDocument(roomNameFallback: string): RoomSetDocumentV1 {
  const layoutId = crypto.randomUUID();
  const boundary = defaultRoomBoundary();
  const slice: RoomSetLayoutSlice = {
    id: layoutId,
    name: `${roomNameFallback.trim() || "Space"} · default`,
    boundary,
    objects: [],
  };
  return {
    version: 1,
    layouts: {
      [layoutId]: slice,
    },
    activeLayoutId: layoutId,
  };
}
