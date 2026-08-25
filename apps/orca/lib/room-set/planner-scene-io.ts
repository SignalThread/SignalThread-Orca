import {
  repairPlannerSceneCoordinates,
  type PlannerScene,
  type PlannerSceneObjectSourceKind,
} from "@/lib/room-set/planner-scene";
import { getRoomSetComponent } from "@/lib/room-set/component-library";
import { isPlaceablePlannerComponentId } from "@/lib/room-set/planner-layout-schema";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function finiteNumberOrNull(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function sourceKindValue(value: unknown, fallback: PlannerSceneObjectSourceKind): PlannerSceneObjectSourceKind {
  return value === "generated" || value === "manual" || value === "imported" ? value : fallback;
}

function isSafeMetadataKey(key: string): boolean {
  return key !== "__proto__" && key !== "prototype" && key !== "constructor";
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const nextArray = value
      .map((entry) => sanitizeMetadataValue(entry))
      .filter((entry) => typeof entry !== "undefined");
    return nextArray;
  }
  if (isRecord(value)) {
    const nextRecord: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!isSafeMetadataKey(key)) continue;
      const nextValue = sanitizeMetadataValue(entry);
      if (typeof nextValue !== "undefined") nextRecord[key] = nextValue;
    }
    return nextRecord;
  }
  return undefined;
}

function preserveUnknownMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> {
  if (!metadata) return {};
  const knownKeys = new Set([
    "componentCategory",
    "visualVariant",
    "neutralNote",
    "seatingTableId",
    "seatingPlanId",
  ]);
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (knownKeys.has(key) || !isSafeMetadataKey(key)) continue;
    const safeValue = sanitizeMetadataValue(value);
    if (typeof safeValue !== "undefined") preserved[key] = safeValue;
  }
  return preserved;
}

export function normalizePlannerSceneFromUnknown(value: unknown): PlannerScene | null {
  if (!isRecord(value)) return null;
  const roomShell = isRecord(value.roomShell) ? value.roomShell : null;
  const bounds = roomShell && isRecord(roomShell.bounds) ? roomShell.bounds : null;
  const widthLu = finiteNumber(roomShell?.widthLu, NaN);
  const depthLu = finiteNumber(roomShell?.depthLu, NaN);
  if (!(widthLu > 0 && depthLu > 0)) return null;
  const objectsRaw = Array.isArray(value.objects) ? value.objects : [];

  const objects = objectsRaw.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const componentIdRaw = typeof entry.componentId === "string" ? entry.componentId.trim() : "";
    if (!isPlaceablePlannerComponentId(componentIdRaw)) return [];
    const component = getRoomSetComponent(componentIdRaw);
    if (!component) return [];

    const transform = isRecord(entry.transform) ? entry.transform : null;
    const source = isRecord(entry.source) ? entry.source : null;
    const capacity = isRecord(entry.capacity) ? entry.capacity : null;
    const metadata = isRecord(entry.metadata) ? entry.metadata : null;
    const label = typeof entry.label === "string" && entry.label.trim().length > 0
      ? entry.label.trim().slice(0, 80)
      : null;
    const width = Math.max(0, finiteNumber(transform?.widthLu, component.widthLu));
    const depth = Math.max(0, finiteNumber(transform?.depthLu, component.depthLu));
    const repaired = repairPlannerSceneCoordinates({
      componentId: componentIdRaw,
      xLu: finiteNumberOrNull(transform?.xLu) ?? NaN,
      yLu: finiteNumberOrNull(transform?.yLu) ?? NaN,
      widthLu: width,
      depthLu: depth,
      roomWidthLu: widthLu,
      roomDepthLu: depthLu,
      context: `imported-scene-object-${index + 1}`,
    });
    if (!repaired) return [];

    return [{
      id:
        typeof entry.id === "string" && entry.id.trim().length > 0
          ? entry.id.trim()
          : `planner-scene-object-${index + 1}`,
      componentId: componentIdRaw,
      objectType: component.domainKind,
      name:
        typeof entry.name === "string" && entry.name.trim().length > 0
          ? entry.name.trim()
          : component.label,
      label,
      capacity: {
        seated: Math.max(0, Math.round(finiteNumber(capacity?.seated, component.capacitySeated))),
        staff: Math.max(0, Math.round(finiteNumber(capacity?.staff, component.capacityStaff))),
      },
      source: {
        kind: sourceKindValue(source?.kind, "imported"),
        ...(typeof source?.detail === "string" || source?.detail === null
          ? { detail: source.detail as string | null }
          : {}),
      },
      transform: {
        xLu: repaired.xLu,
        yLu: repaired.yLu,
        widthLu: width,
        depthLu: depth,
        rotationDeg: finiteNumber(transform?.rotationDeg, 0),
      },
      metadata: {
        ...preserveUnknownMetadata(metadata),
        componentCategory:
          typeof metadata?.componentCategory === "string" && metadata.componentCategory.trim().length > 0
            ? metadata.componentCategory.trim()
            : component.category,
        visualVariant:
          typeof metadata?.visualVariant === "string" && metadata.visualVariant.trim().length > 0
            ? metadata.visualVariant.trim()
            : component.visualVariant,
        neutralNote:
          typeof metadata?.neutralNote === "string" ? metadata.neutralNote : component.neutralNote,
        ...(typeof metadata?.seatingTableId === "string" && metadata.seatingTableId.trim().length > 0
          ? { seatingTableId: metadata.seatingTableId.trim() }
          : {}),
        ...(typeof metadata?.seatingPlanId === "string" && metadata.seatingPlanId.trim().length > 0
          ? { seatingPlanId: metadata.seatingPlanId.trim() }
          : {}),
      },
    }] satisfies PlannerScene["objects"];
  });

  return {
    roomShell: {
      widthLu,
      depthLu,
      bounds: {
        xLu: finiteNumber(bounds?.xLu, 0),
        yLu: finiteNumber(bounds?.yLu, 0),
        widthLu: finiteNumber(bounds?.widthLu, widthLu),
        depthLu: finiteNumber(bounds?.depthLu, depthLu),
      },
    },
    objects,
  };
}

export function serializePlannerSceneJson(scene: PlannerScene): string {
  return JSON.stringify(scene, null, 2);
}

export function parsePlannerSceneJson(
  jsonText: string,
): { ok: true; scene: PlannerScene } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return { ok: false, error: "Could not parse JSON." };
  }
  const scene = normalizePlannerSceneFromUnknown(parsed);
  if (!scene) {
    return {
      ok: false,
      error:
        "Unexpected format — choose a PlannerScene JSON export from this Room Set editor.",
    };
  }
  return { ok: true, scene };
}
