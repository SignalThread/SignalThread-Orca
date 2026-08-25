import { axisAlignedBounds, rotatedCorners } from "./geometry";
import type {
  OperationalOverlayDrawable,
  OperationalOverlayKind,
  OperationalOverlayToggles,
  OperationalPhasePreset,
  OperationalPlaybackVisualContext,
  OperationalStaffingDelta,
  OperationalStaffingImpact,
  OperationalTransitionPreviewContext,
  SimulationModeKind,
  TransitionFeasibility,
} from "./operational-types";
import type { RoomSetLayoutBoundary } from "./spatial-types";
import type { RoomSetSpatialObject } from "./spatial-types";

const PRESET_MOVE_WEIGHT: Record<OperationalPhasePreset, number> = {
  setup: 0.6,
  doors_open: 1.1,
  session_live: 0.4,
  break: 1,
  reception: 1.2,
  teardown: 1.4,
  reset: 1.5,
};

/** Exported for program bootstrap — aligns with transition mock model */
export function staffingForOperationalPreset(preset: OperationalPhasePreset): OperationalStaffingImpact {

  switch (preset) {

    case "setup":
      return { setupCrew: 8, ushers: 0, avDuty: false, fnbTouches: 0 };

    case "doors_open":
      return { setupCrew: 2, ushers: 4, avDuty: true, fnbTouches: 1 };

    case "session_live":
      return { setupCrew: 1, ushers: 6, avDuty: true, fnbTouches: 0 };

    case "break":
      return { setupCrew: 1, ushers: 3, avDuty: false, fnbTouches: 2 };

    case "reception":
      return { setupCrew: 0, ushers: 5, avDuty: false, fnbTouches: 3 };

    case "teardown":
      return { setupCrew: 7, ushers: 1, avDuty: false, fnbTouches: 0 };

    case "reset":
      return { setupCrew: 4, ushers: 0, avDuty: false, fnbTouches: 0 };

  }

}

function mockEgressPressure(boundary: RoomSetLayoutBoundary, objects: RoomSetSpatialObject[]): number {
  if (objects.length === 0) return 0.1;

  const doorBand = {
    minX: 0,
    maxX: Math.min(12, boundary.widthLu * 0.12),
    minY: 0,
    maxY: boundary.depthLu,
  };

  let block = 0;
  for (const obj of objects) {
    const bb = axisAlignedBounds(
      rotatedCorners(
        obj.transform.cx,
        obj.transform.cy,
        obj.transform.widthLu,
        obj.transform.heightLu,
        obj.transform.rotationDeg,
      ),
    );
    const intersectsDoor =
      bb.maxX >= doorBand.minX &&
      bb.minX <= doorBand.maxX &&
      bb.maxY >= doorBand.minY &&
      bb.minY <= doorBand.maxY;
    if (intersectsDoor) block += obj.type === "banquet_table" ? 0.14 : 0.08;
  }

  return Math.min(0.95, 0.25 + block);
}

/** Mock centroid signature for feasibility — cheap stand-in until graph solver exists */
export function centroidSignature(nodes: RoomSetSpatialObject[]): string {
  if (nodes.length === 0) return "empty";

  let sx = 0;
  let sy = 0;
  for (const row of nodes) {
    sx += row.transform.cx;
    sy += row.transform.cy;
  }

  return `${nodes.length}:${(sx / nodes.length).toFixed(1)}:${(sy / nodes.length).toFixed(1)}`;
}

export function mockTransitionAnalytics(
  fromPreset: OperationalPhasePreset,
  toPreset: OperationalPhasePreset,
  preview: OperationalTransitionPreviewContext,
): {
  feasibility: TransitionFeasibility;
  durationMinutes: number;
  warnings: string[];
  staffingDelta: OperationalStaffingDelta;
} {
  const moveWeight = PRESET_MOVE_WEIGHT[fromPreset] + PRESET_MOVE_WEIGHT[toPreset];
  const geometryDelta =
    centroidSignature(preview.fromObjects) !== centroidSignature(preview.toObjects);

  const warnings: string[] = [];

  if (geometryDelta && (toPreset === "doors_open" || toPreset === "session_live")) {
    warnings.push("Spatial delta detected — confirm staging cleared / sightlines checked.");
  }

  if (toPreset === "teardown" && preview.toObjects.filter((o) => o.type === "stage").length > 0) {
    warnings.push("Stage still authored — teardown crew may need lift path.");
  }

  const egressRisk = mockEgressPressure(preview.boundary, preview.toObjects);
  if (egressRisk > 0.72) {
    warnings.push("Egress pressure elevated in target slice (mock congestion model).");
  }

  let feasibility: TransitionFeasibility = "green";
  if (geometryDelta && moveWeight > 1.8) feasibility = "amber";
  if (egressRisk > 0.88 || (geometryDelta && toPreset === "session_live")) feasibility = "amber";
  if (toPreset === "session_live" && preview.toObjects.length < 2) {
    feasibility = "blocked";
    warnings.push("Session live slice looks under-furnished for capacity validation.");
  }

  const baseMinutes = 12 + moveWeight * 7 + (geometryDelta ? 18 : 0);
  const durationMinutes = Math.round(baseMinutes + egressRisk * 15);

  const staffingPrev = staffingForOperationalPreset(fromPreset);
  const staffingNext = staffingForOperationalPreset(toPreset);

  return {
    feasibility,
    durationMinutes,
    warnings,
    staffingDelta: {
      setupCrewDelta: staffingNext.setupCrew - staffingPrev.setupCrew,
      ushersDelta: staffingNext.ushers - staffingPrev.ushers,
      fnbTouchesDelta: staffingNext.fnbTouches - staffingPrev.fnbTouches,
      avLiveNext: staffingNext.avDuty,
    },
  };
}

function opacityFor(kind: OperationalOverlayKind, toggles: OperationalOverlayToggles, map: Partial<Record<OperationalOverlayKind, number>>): number {
  if (!toggles[kind]) return 0;

  const pct = map[kind] ?? 55;

  return Math.min(1, Math.max(0.05, pct / 100));
}

export function buildOperationalOverlayDrawables(
  boundary: RoomSetLayoutBoundary,
  objects: RoomSetSpatialObject[],
  toggles: OperationalOverlayToggles,
  opacityMap: Partial<Record<OperationalOverlayKind, number>>,
  preset: OperationalPhasePreset,
  simulationMode: SimulationModeKind,
  playback?: OperationalPlaybackVisualContext | null,
): OperationalOverlayDrawable[] {
  const list: OperationalOverlayDrawable[] = [];
  const w = boundary.widthLu;
  const d = boundary.depthLu;

  const pulse = simulationMode === "crowd_pulse" ? 1.25 : simulationMode === "stress_paths" ? 1.45 : 1;

  const drift = playback?.motionPhase01 ?? 0;
  const blend = playback?.transitionBlend01 ?? 0;
  const inTrans = playback?.inTransitionPlayback ?? false;
  const heatWave = Math.sin((drift + blend) * Math.PI * 2) * 0.11;
  const flowScroll = drift * 54;

  if (toggles.attendee_flow) {
    const o = opacityFor("attendee_flow", toggles, opacityMap);

    const streams = 3;

    for (let i = 0; i < streams; i += 1) {
      const t = i / Math.max(1, streams - 1);

      const x0 = w * (0.15 + t * 0.55);
      const y0 = d * 0.08;

      const x1 = w * (0.2 + t * 0.5);
      const y1 = d * 0.45 * pulse;

      const x2 = w * (0.18 + t * 0.52);
      const y2 = d * 0.82;

      list.push({
        kind: "flow_curve",
        id: `flow-${i}`,
        pointsLu: [x0, y0, x1, y1, x2, y2],
        color: `rgba(37,99,235,${0.35 * o})`,
        widthPx: 2.2 * pulse,
        dash: simulationMode === "timeline_scrub" ? [6, 6] : [14, 10],
        dashOffset: flowScroll + i * 11,
      });
    }
  }

  if (toggles.congestion) {
    const o = opacityFor("congestion", toggles, opacityMap);

    for (let gx = 0; gx < 5; gx += 1) {
      for (let gy = 0; gy < 4; gy += 1) {
        const cx = (gx + 0.5) * (w / 5);
        const cy = (gy + 0.5) * (d / 4);

        let score = 0.15 + Math.sin(gx + gy + w + drift * 4) * 0.08;

        for (const obj of objects) {
          const dist = Math.hypot(obj.transform.cx - cx, obj.transform.cy - cy);
          const spread = Math.max(obj.transform.widthLu, obj.transform.heightLu) * 0.8;
          score += Math.max(0, 1 - dist / spread) * 0.35;
        }

        score *= 1 + heatWave + blend * 0.35;
        if (preset === "break" || preset === "reception") score *= 1.35;
        score *= pulse;
        score = Math.min(0.98, score * (0.35 + 0.65 * o));

        list.push({
          kind: "heat_cell",
          id: `heat-${gx}-${gy}`,
          cell: {
            cxLu: cx,
            cyLu: cy,
            halfWLu: w / 10,
            halfHLu: d / 9,
            score01: score,
          },
        });
      }
    }
  }

  if (toggles.staffing_movement) {
    const o = opacityFor("staffing_movement", toggles, opacityMap);
    const stations = objects.filter((row) => row.type === "av_table" || row.type === "registration_desk").slice(0, 5);

    stations.forEach((row, idx) => {
      list.push({
        kind: "movement_arrow",
        id: `staff-${row.id}`,
        cxLu: row.transform.cx + Math.sin((drift + idx * 0.07) * Math.PI * 2) * 1.1,
        cyLu: row.transform.cy + Math.cos((drift + idx * 0.07) * Math.PI * 2) * 1.1,
        rotationDeg: 35 + idx * 18,
        spanLu: 12 * pulse,
        color: `rgba(234,88,12,${0.55 * o})`,
        rotationSwayDeg: Math.sin((drift + idx * 0.11) * Math.PI * 2) * 11,
      });
    });

    if (stations.length === 0) {
      list.push({
        kind: "movement_arrow",
        id: "staff-fallback",
        cxLu: w * 0.25,
        cyLu: d * 0.3,
        rotationDeg: 90,
        spanLu: 14,
        color: `rgba(234,88,12,${0.45 * o})`,
        rotationSwayDeg: Math.sin(drift * Math.PI * 2) * 18,
      });
    }
  }

  if (toggles.fnb_service_lane) {
    const o = opacityFor("fnb_service_lane", toggles, opacityMap);

    list.push({
      kind: "flow_curve",
      id: "fnb-lane",
      pointsLu: [w * 0.88, d * 0.12, w * 0.72, d * 0.45, w * 0.55, d * 0.78],
      color: `rgba(22,163,74,${0.45 * o})`,
      widthPx: 3,
      dash: [10, 6],
      dashOffset: flowScroll * 0.85,
    });
  }

  if (toggles.emergency_egress) {
    const o = opacityFor("emergency_egress", toggles, opacityMap);
    const clear = mockEgressPressure(boundary, objects) < 0.65;

    list.push({
      kind: "egress_strip",
      id: "exit-a",
      xLu: 0,
      yLu: 0,
      wLu: Math.min(w * 0.12, 14),
      hLu: d,
      clear,
    });

    list.push({
      kind: "egress_strip",
      id: "exit-b",
      xLu: Math.max(w - Math.min(w * 0.12, 14), w * 0.88),
      yLu: 0,
      wLu: Math.min(w * 0.12, 14),
      hLu: d,
      clear,
    });

    list.push({
      kind: "flow_curve",
      id: "evac-route",
      pointsLu: [w * 0.52, d * 0.5, w * 0.08, d * 0.5],
      color: clear ? `rgba(220,38,38,${0.5 * o})` : `rgba(220,38,38,${0.75 * o})`,
      widthPx: 3.2,
      dash: [4, 4],
      dashOffset: -flowScroll * 1.1,
    });
  }

  if (toggles.sightlines) {
    const o = opacityFor("sightlines", toggles, opacityMap);

    const stage = objects.find((row) => row.type === "stage");
    const screen = objects.find((row) => row.type === "screen");

    const origin = stage ?? screen ?? { transform: { cx: w * 0.5, cy: d * 0.2, widthLu: 20, heightLu: 8, rotationDeg: 0 } };

    const targetY = d * 0.88;

    for (let i = 0; i < 5; i += 1) {
      const tx = (w * 0.18) + i * (w * 0.16);
      let obstructed = false;

      for (const obj of objects) {
        if (obj.type === "aisle_zone") continue;

        const bb = axisAlignedBounds(
          rotatedCorners(
            obj.transform.cx,
            obj.transform.cy,
            obj.transform.widthLu,
            obj.transform.heightLu,
            obj.transform.rotationDeg,
          ),
        );

        const midX = (origin.transform.cx + tx) / 2;
        const midY = (origin.transform.cy + targetY) / 2;

        if (midX >= bb.minX && midX <= bb.maxX && midY >= bb.minY && midY <= bb.maxY) {
          obstructed = true;
        }
      }

      list.push({
        kind: "sightline_ray",
        id: `sight-${i}`,
        x1Lu: origin.transform.cx,
        y1Lu: origin.transform.cy,
        x2Lu: tx,
        y2Lu: targetY,
        obstructed,
        opacityScale: o,
      });
    }
  }

  if (inTrans || preset === "setup" || preset === "teardown" || preset === "reset") {
    const shift = Math.sin(drift * Math.PI * 2) * w * 0.035;
    list.push({
      kind: "turnover_band",
      id: "turnover-primary",
      cxLu: w * 0.52 + shift,
      cyLu: d * 0.58 + blend * d * 0.05,
      wLu: Math.max(18, w * 0.26),
      hLu: Math.max(12, d * 0.16),
      stress01: Math.min(1, 0.35 + blend * 0.5 + (preset === "teardown" ? 0.22 : 0)),
    });
    list.push({
      kind: "turnover_band",
      id: "turnover-secondary",
      cxLu: w * 0.24 - shift * 0.5,
      cyLu: d * 0.38,
      wLu: Math.max(14, w * 0.2),
      hLu: Math.max(10, d * 0.12),
      stress01: Math.min(1, 0.25 + drift * 0.2 + (preset === "reset" ? 0.28 : 0)),
    });
  }

  return list;
}

export type AiCommandInterpretation = {
  summary: string;
  suggestedStatePreset: OperationalPhasePreset | null;
  toggleOverlays: Partial<OperationalOverlayToggles>;
  simulationHint: SimulationModeKind | null;
};

/** Lightweight intent router — replace with model-backed parser later */
export function interpretOperationalAiCommand(text: string): AiCommandInterpretation {
  const lower = text.toLowerCase();

  const toggleOverlays: Partial<OperationalOverlayToggles> = {};

  if (lower.includes("egress") || lower.includes("evac")) toggleOverlays.emergency_egress = true;
  if (lower.includes("crowd") || lower.includes("queue")) {
    toggleOverlays.congestion = true;
    toggleOverlays.attendee_flow = true;
  }
  if (lower.includes("staff") || lower.includes("usher")) toggleOverlays.staffing_movement = true;
  if (lower.includes("f&b") || lower.includes("fnb") || lower.includes("bar")) toggleOverlays.fnb_service_lane = true;
  if (lower.includes("sight") || lower.includes("stage")) toggleOverlays.sightlines = true;

  let suggestedStatePreset: OperationalPhasePreset | null = null;

  if (lower.includes("doors")) suggestedStatePreset = "doors_open";
  else if (lower.includes("live") || lower.includes("show")) suggestedStatePreset = "session_live";
  else if (lower.includes("break")) suggestedStatePreset = "break";
  else if (lower.includes("reception") || lower.includes("cocktail")) suggestedStatePreset = "reception";
  else if (lower.includes("setup") || lower.includes("build")) suggestedStatePreset = "setup";
  else if (lower.includes("tear") || lower.includes("strike")) suggestedStatePreset = "teardown";
  else if (lower.includes("reset")) suggestedStatePreset = "reset";

  let simulationHint: SimulationModeKind | null = null;

  if (lower.includes("pulse") || lower.includes("wave")) simulationHint = "crowd_pulse";
  else if (lower.includes("stress") || lower.includes("worst")) simulationHint = "stress_paths";
  else if (lower.includes("scrub") || lower.includes("time")) simulationHint = "timeline_scrub";

  const summaryParts: string[] = [];

  if (suggestedStatePreset) summaryParts.push(`Consider jumping the room clock to “${suggestedStatePreset.replaceAll("_", " ")}”.`);
  if (Object.keys(toggleOverlays).length > 0) summaryParts.push("Suggested analytic layers toggled for you (local mock).");
  if (simulationHint) summaryParts.push(`Simulation bias → ${simulationHint.replaceAll("_", " ")}.`);

  if (summaryParts.length === 0) {
    summaryParts.push("Try mentioning doors, sightlines, egress, or staffing — I will align overlays and timeline hints.");
  }

  return {
    summary: summaryParts.join(" "),
    suggestedStatePreset,
    toggleOverlays,
    simulationHint,
  };
}
