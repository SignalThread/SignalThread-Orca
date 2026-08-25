import { mockTransitionAnalytics, staffingForOperationalPreset } from "./operational-mock";
import type {
  OperationalPhasePreset,
  OperationalTransitionDef,
  RoomOperationalProgramV1,
  RoomOperationalStateDef,
} from "./operational-types";
import { OPERATIONAL_OVERLAY_KINDS, OPERATIONAL_PHASE_PRESETS_ORDER } from "./operational-types";
import { duplicateSpatialObject } from "./object-catalog";
import type { RoomSetDocumentV1, RoomSetLayoutSlice } from "./spatial-types";
import type { RoomSetSpatialObject } from "./spatial-types";

const PRESET_LABEL: Record<OperationalPhasePreset, string> = {
  setup: "Setup",
  doors_open: "Doors open",
  session_live: "Session live",
  break: "Break",
  reception: "Reception",
  teardown: "Teardown",
  reset: "Reset",
};

/** Exported for shells (matrix room-set, overlays) — same strings as operational program authoring. */
export const OPERATIONAL_PRESET_LABELS: Record<OperationalPhasePreset, string> =
  PRESET_LABEL;

export function defaultOperationalOverlayToggles(): RoomOperationalProgramV1["overlays"] {
  return Object.fromEntries(OPERATIONAL_OVERLAY_KINDS.map((k) => [k, false])) as RoomOperationalProgramV1["overlays"];
}

function cloneSliceObjects(objects: RoomSetSpatialObject[]): RoomSetSpatialObject[] {
  return objects.map((o) => {
    const c = duplicateSpatialObject(o);
    c.transform = { ...o.transform };
    return c;
  });
}

function buildTransitionsForDoc(doc: RoomSetDocumentV1, program: RoomOperationalProgramV1): OperationalTransitionDef[] {
  const list: OperationalTransitionDef[] = [];

  const priorByPair = new Map<string, OperationalTransitionDef>();

  for (const edge of program.transitions) {
    priorByPair.set(`${edge.fromStateId}->${edge.toStateId}`, edge);
  }

  for (let i = 0; i < program.timelineOrder.length - 1; i += 1) {
    const fromId = program.timelineOrder[i];
    const toId = program.timelineOrder[i + 1];
    const fromState = program.states[fromId];
    const toState = program.states[toId];
    if (!(fromState && toState)) continue;

    const fromLayout = doc.layouts[fromState.layoutId];
    const toLayout = doc.layouts[toState.layoutId];
    if (!(fromLayout && toLayout)) continue;

    const analytics = mockTransitionAnalytics(fromState.preset, toState.preset, {
      boundary: toLayout.boundary,
      fromObjects: fromLayout.objects,
      toObjects: toLayout.objects,
      preset: toState.preset,
    });

    const prior = priorByPair.get(`${fromId}->${toId}`);

    list.push({
      id: prior?.id ?? `edge-${fromId}-${toId}`,
      fromStateId: fromId,
      toStateId: toId,
      durationMinutes: prior?.durationMinutes ?? analytics.durationMinutes,
      feasibility: analytics.feasibility,
      staffingDelta: analytics.staffingDelta,
      warnings: analytics.warnings,
    });
  }

  return list;
}

export function rebuildOperationalTransitions(doc: RoomSetDocumentV1): RoomSetDocumentV1 {
  if (!doc.operational) return doc;

  return {
    ...doc,
    operational: {
      ...doc.operational,
      transitions: buildTransitionsForDoc(doc, doc.operational),
    },
  };
}

export function ensureOperationalProgram(doc: RoomSetDocumentV1, roomNameFallback: string): RoomSetDocumentV1 {
  const labelBase = roomNameFallback.trim() || "Space";

  if (doc.operational?.version === 1) {
    const orderOk =
      doc.operational.timelineOrder.length > 0 &&
      doc.operational.timelineOrder.every((id) => doc.operational!.states[id]);
    const layoutsOk = doc.operational.timelineOrder.every(
      (id) => doc.layouts[doc.operational!.states[id].layoutId],
    );
    if (orderOk && layoutsOk) return rebuildOperationalTransitions(doc);
  }

  const baseline = doc.layouts[doc.activeLayoutId] ?? Object.values(doc.layouts)[0];
  if (!baseline) return doc;

  const layouts: RoomSetDocumentV1["layouts"] = { ...doc.layouts };
  const states: Record<string, RoomOperationalStateDef> = {};
  const timelineOrder: string[] = [];
  const tldrawSnapshots: Record<string, string> = { ...(doc.tldrawSnapshots ?? {}) };
  const baselineTldraw = doc.tldrawSnapshots?.[baseline.id];

  for (let idx = 0; idx < OPERATIONAL_PHASE_PRESETS_ORDER.length; idx += 1) {
    const preset = OPERATIONAL_PHASE_PRESETS_ORDER[idx];
    const stateId = crypto.randomUUID();
    const layoutId = crypto.randomUUID();
    const slice: RoomSetLayoutSlice = {
      ...baseline,
      id: layoutId,
      name: `${labelBase} · ${PRESET_LABEL[preset]}`,
      objects: cloneSliceObjects(baseline.objects),
    };
    layouts[layoutId] = slice;
    if (baselineTldraw) tldrawSnapshots[layoutId] = baselineTldraw;
    timelineOrder.push(stateId);
    states[stateId] = {
      id: stateId,
      preset,
      label: PRESET_LABEL[preset],
      layoutId,
      suppressedObjectIds: [],
      transitionIngressMinutes: idx === 0 ? null : 18 + idx * 4,
      staffing: staffingForOperationalPreset(preset),
    };
  }

  const firstStateId = timelineOrder[0];
  const firstLayoutId = states[firstStateId].layoutId;

  const program: RoomOperationalProgramV1 = {
    version: 1,
    timelineOrder,
    states,
    transitions: [],
    overlays: defaultOperationalOverlayToggles(),
    overlayOpacityPct: {},
    activeStateId: firstStateId,
    simulation: {
      mode: "authoring",
      speedMultiplier: 1,
      transitionScrubMinutes: 0,
    },
    compareStateId: null,
  };

  const working: RoomSetDocumentV1 = {
    ...doc,
    layouts,
    activeLayoutId: firstLayoutId,
    operational: program,
    tldrawSnapshots: Object.keys(tldrawSnapshots).length ? tldrawSnapshots : undefined,
  };

  return rebuildOperationalTransitions(working);
}

export function activateOperationalState(doc: RoomSetDocumentV1, stateId: string): RoomSetDocumentV1 {
  if (!doc.operational) return doc;
  const picked = doc.operational.states[stateId];
  if (!picked) return doc;
  if (!doc.layouts[picked.layoutId]) return doc;

  return {
    ...doc,
    activeLayoutId: picked.layoutId,
    operational: {
      ...doc.operational,
      activeStateId: stateId,
    },
  };
}

export function duplicateOperationalState(doc: RoomSetDocumentV1, stateId: string): RoomSetDocumentV1 {
  if (!doc.operational) return doc;
  const seed = doc.operational.states[stateId];
  if (!seed) return doc;
  const layout = doc.layouts[seed.layoutId];
  if (!layout) return doc;

  const newStateId = crypto.randomUUID();
  const newLayoutId = crypto.randomUUID();
  const duplicatedSlice: RoomSetLayoutSlice = {
    ...layout,
    id: newLayoutId,
    name: `${layout.name} · copy`,
    objects: cloneSliceObjects(layout.objects),
  };

  const insertionIndex = doc.operational.timelineOrder.indexOf(stateId);
  const timelineOrder = [...doc.operational.timelineOrder];
  timelineOrder.splice(insertionIndex >= 0 ? insertionIndex + 1 : timelineOrder.length, 0, newStateId);

  const novelState: RoomOperationalStateDef = {
    ...seed,
    id: newStateId,
    label: `${seed.label} copy`,
    layoutId: newLayoutId,
    suppressedObjectIds: [...seed.suppressedObjectIds],
  };

  const snapPort = doc.tldrawSnapshots?.[seed.layoutId];
  const tldrawSnapshots =
    snapPort != null ? { ...(doc.tldrawSnapshots ?? {}), [newLayoutId]: snapPort } : doc.tldrawSnapshots;

  const nextDoc: RoomSetDocumentV1 = {
    ...doc,
    layouts: { ...doc.layouts, [newLayoutId]: duplicatedSlice },
    operational: {
      ...doc.operational,
      timelineOrder,
      states: { ...doc.operational.states, [newStateId]: novelState },
      activeStateId: newStateId,
    },
    activeLayoutId: newLayoutId,
    ...(tldrawSnapshots != null ? { tldrawSnapshots } : {}),
  };

  return rebuildOperationalTransitions(nextDoc);
}

export function patchOperationalProgram(
  doc: RoomSetDocumentV1,
  patch: Partial<RoomOperationalProgramV1>,
): RoomSetDocumentV1 {
  if (!doc.operational) return doc;

  return {
    ...doc,
    operational: {
      ...doc.operational,
      ...patch,
      overlays: patch.overlays ?? doc.operational.overlays,
      simulation: patch.simulation ?? doc.operational.simulation,
    },
  };
}

export function updateTransitionDuration(
  doc: RoomSetDocumentV1,
  transitionId: string,
  minutes: number,
): RoomSetDocumentV1 {
  if (!doc.operational) return doc;
  if (!Number.isFinite(minutes) || minutes < 0) return doc;

  return {
    ...doc,
    operational: {
      ...doc.operational,
      transitions: doc.operational.transitions.map((edge) =>
        edge.id === transitionId ? { ...edge, durationMinutes: Math.round(minutes) } : edge,
      ),
    },
  };
}
