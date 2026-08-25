/**
 * Deterministic Apply patch when AI request or patch parse fails.
 */

import { inferAudienceStyleFromPrompt } from "@/lib/room-set/layout-spec-generate-resolve";
import {
  inferPrimarySeatingComponentFromPrompt,
  starterIdFromPrimaryComponentId,
} from "@/lib/room-set/planner-seating-resolve";

import type { LayoutPatch, LayoutPatchOp, LayoutSpecLayoutType } from "./layout-spec";
import { inferAudienceTopologyFromPrompt } from "./layout-spec-audience-topology-infer";

function topologyIntentPresent(
  topology: ReturnType<typeof inferAudienceTopologyFromPrompt>,
): boolean {
  return (
    topology.preferredRows !== undefined ||
    topology.widthBias !== undefined ||
    topology.depthBias !== undefined ||
    topology.arcStrength !== undefined
  );
}

function promptRequestsSeatingStyleChange(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (/\b(?:change|switch|convert|replace|turn|make|set)\b[\s\S]{0,80}\b(?:seating|style|layout|setup|room)\b/i.test(text)) {
    return true;
  }
  if (/\bseating\s+style\b/i.test(text)) return true;
  if (/\b(?:add|include|place|put)\b[\s\S]{0,40}\b(?:round tables?|rounds?|tables?)\b/i.test(text)) {
    return false;
  }
  return /\b(?:round tables?|rounds?)\b/i.test(text);
}

function inferSeatingStyleLayoutType(args: Readonly<{
  prompt: string;
  baseLayoutType?: LayoutSpecLayoutType | null;
}>): LayoutSpecLayoutType | null {
  if (args.baseLayoutType !== "classroom" && args.baseLayoutType !== "theater") return null;
  if (!promptRequestsSeatingStyleChange(args.prompt)) return null;

  const primaryComponentId = inferPrimarySeatingComponentFromPrompt(args.prompt);
  if (!primaryComponentId) return null;
  const layoutType = starterIdFromPrimaryComponentId(primaryComponentId);
  if (!layoutType || layoutType === args.baseLayoutType) return null;
  return layoutType;
}

export function supplementLayoutPatchSeatingStyleFromPrompt(
  patch: LayoutPatch,
  args: Readonly<{
    prompt: string;
    baseLayoutType?: LayoutSpecLayoutType | null;
  }>,
): LayoutPatch {
  if (patch.ops.some((op) => op.op === "setLayoutType")) return patch;
  const layoutType = inferSeatingStyleLayoutType(args);
  if (!layoutType) return patch;
  return {
    version: 1,
    ops: [...patch.ops, { op: "setLayoutType", layoutType }],
  };
}

export function buildDeterministicApplyLayoutPatch(args: Readonly<{
  prompt: string;
  currentTopologyRows?: number | null;
  baseLayoutType?: LayoutSpecLayoutType | null;
}>): LayoutPatch | null {
  const ops: LayoutPatchOp[] = [];
  const layoutType = inferSeatingStyleLayoutType(args);
  if (layoutType) {
    ops.push({ op: "setLayoutType", layoutType });
  }

  const audienceStyle = inferAudienceStyleFromPrompt(args.prompt);
  if (audienceStyle) {
    ops.push({ op: "setAudienceStyle", audienceStyle });
  }

  const topology = inferAudienceTopologyFromPrompt(args.prompt, args.currentTopologyRows);
  if (topologyIntentPresent(topology)) {
    ops.push({ op: "setAudienceTopology", topology });
  }

  if (ops.length === 0) return null;
  return { version: 1, ops };
}
