import type { OperationalTransitionDef, RoomOperationalProgramV1 } from "./operational-types";

/** Planner-facing playback segment — wall-clock scaled, no persistence */
export type OperationalPlaybackSegment =
  | {
      kind: "dwell";
      stateId: string;
      durationMs: number;
    }
  | {
      kind: "edge";
      transition: OperationalTransitionDef;
      durationMs: number;
    };

const DWELL_MS_BASE = 5_600;
const EDGE_MS_PER_PLANNER_MINUTE = 95;
const EDGE_MS_MIN = 2_400;
const EDGE_MS_MAX = 52_000;

export function plannerEdgePlaybackMs(edge: OperationalTransitionDef): number {
  return Math.round(
    Math.min(EDGE_MS_MAX, Math.max(EDGE_MS_MIN, edge.durationMinutes * EDGE_MS_PER_PLANNER_MINUTE)),
  );
}

/** Ordered dwell → edge → dwell … along `timelineOrder` */
export function buildOperationalPlaybackPlan(program: RoomOperationalProgramV1): OperationalPlaybackSegment[] {
  const out: OperationalPlaybackSegment[] = [];
  const chronology = program.timelineOrder;

  for (let i = 0; i < chronology.length; i += 1) {
    const stateId = chronology[i];
    if (!program.states[stateId]) continue;

    const dwellScaled =
      typeof program.states[stateId].transitionIngressMinutes === "number"
        ? DWELL_MS_BASE + program.states[stateId].transitionIngressMinutes! * 28
        : DWELL_MS_BASE;

    out.push({ kind: "dwell", stateId, durationMs: Math.round(dwellScaled) });

    if (i < chronology.length - 1) {
      const nextId = chronology[i + 1];
      const tr = program.transitions.find((e) => e.fromStateId === stateId && e.toStateId === nextId);
      if (tr) {
        out.push({ kind: "edge", transition: tr, durationMs: plannerEdgePlaybackMs(tr) });
      }
    }
  }

  return out;
}

export function playbackPlanDurationMs(plan: OperationalPlaybackSegment[]): number {
  return plan.reduce((sum, row) => sum + row.durationMs, 0);
}

export type ResolvedPlaybackMoment = {
  /** Position within looping timeline (ms, after wrap) */
  absoluteMs: number;
  segmentIndex: number;
  segment: OperationalPlaybackSegment;
  /** 0–1 inside current segment */
  localProgress01: number;
  /** For edges: eased blend toward target state footprint */
  crossfade01: number;
};

function easeSmooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function resolvePlaybackMoment(plan: OperationalPlaybackSegment[], virtualMs: number, loop = true): ResolvedPlaybackMoment | null {
  if (plan.length === 0) return null;

  const total = playbackPlanDurationMs(plan);
  if (total <= 0) return null;

  let t = Math.max(0, virtualMs);

  if (loop) {
    t = t % total;
  } else {
    t = Math.min(t, total - 1e-6);
  }

  let cursor = 0;

  for (let i = 0; i < plan.length; i += 1) {
    const seg = plan[i];

    const nextCursor = cursor + seg.durationMs;
    const insideSegment = t < nextCursor - 1e-9 || i === plan.length - 1;

    if (insideSegment) {
      const localProgress01 =
        seg.durationMs <= 0 ? 1 : Math.min(1, Math.max(0, (t - cursor) / seg.durationMs));

      const crossfade01 = seg.kind === "edge" ? easeSmooth(localProgress01) : 0;

      return {
        absoluteMs: t,

        segmentIndex: i,

        segment: seg,

        localProgress01,

        crossfade01,
      };
    }

    cursor = nextCursor;

  }


  const tailSeg = plan[plan.length - 1];


  return {

    absoluteMs: t,

    segmentIndex: plan.length - 1,

    segment: tailSeg,

    localProgress01: 1,

    crossfade01: tailSeg.kind === "edge" ? 1 : 0,


  };

}

