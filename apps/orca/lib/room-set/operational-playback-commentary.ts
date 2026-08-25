import type { OperationalPlaybackSegment } from "./operational-playback-schedule";
import type { OperationalPhasePreset } from "./operational-types";

export type PlaybackCommentaryContext = {
  fromPreset?: OperationalPhasePreset;
  toPreset?: OperationalPhasePreset;
  feasibility?: "green" | "amber" | "blocked";
  durationPlannerMinutes?: number;
  overlaysActive: Partial<Record<string, boolean>>;
  motionPhase01: number;
  localProgress01: number;
  segment: OperationalPlaybackSegment;
  presetDwell?: OperationalPhasePreset;
};

/** Deterministic narration — swap for engine-fed strings later */
export function buildOperationalPlaybackCommentary(ctx: PlaybackCommentaryContext): string[] {
  const lines: string[] = [];

  if (ctx.segment.kind === "edge") {
    const tr = ctx.segment.transition;

    lines.push(
      `${tr.fromStateId.slice(0, 6)} → ${tr.toStateId.slice(0, 6)} · ${tr.durationMinutes} min planner clock.`,
    );

    if (ctx.feasibility === "blocked") {
      lines.push("Transition confidence is low — extend dwell or reduce spatial churn before committing.");
    } else if (ctx.feasibility === "amber") {
      lines.push("Buffers are tight; watch doors, AV handoff, and registration together.");
    } else {
      lines.push("Heuristic pathing reads sustainable for this turnover window.");
    }

    if (ctx.toPreset === "doors_open" && ctx.overlaysActive.congestion) {
      lines.push("Ingress congestion may spike at doors open — attendee flow pulses highlight queue depth.");
    }

    if (ctx.toPreset === "reception" && ctx.fromPreset === "break") {
      lines.push("Reset risk climbs break→reception — pre-clear F&B service lanes.");
    }

    if (tr.staffingDelta.setupCrewDelta > 2 && (tr.durationMinutes ?? 0) < 35) {
      lines.push("Staffing uplift outpaces sub-35m turnover — add transition slack or preload crew.");
    }

    lines.push(...tr.warnings.slice(0, 2).map((w) => `Watch: ${w}`));
  } else {
    const dwell = ctx.presetDwell;
    if (dwell === "setup") {
      lines.push("Setup dwell — watch furniture movement corridors; egress strips should stay luminous.");
    } else if (dwell === "teardown" || dwell === "reset") {
      lines.push("Strike / reset — bottlenecks cluster near dock pathways; circulate staffing overlays.");
    } else if (dwell === "session_live") {
      lines.push("Live hold — heat should plateau if ingress stays disciplined.");
    }

    if (ctx.overlaysActive.attendee_flow && ctx.motionPhase01 > 0.62) {
      lines.push("Attendee pulses propagating — align service routes ahead of next edge.");
    }
  }

  if (ctx.localProgress01 > 0.82 && ctx.segment.kind === "edge") {
    lines.push("Nearing slice commit — bring analytic layers up on the inbound preset.");
  }

  const dedup = [...new Set(lines.filter(Boolean))];

  return dedup.length > 0
    ? dedup.slice(0, 6)
    : ["Simulation running — toggle overlays to solicit operational cues."];
}
