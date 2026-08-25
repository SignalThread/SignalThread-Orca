/**
 * Fill missing prompt-requested audience topology when AI patch ops omit setAudienceTopology.
 */

import {
  inferAudienceTopologyFromPrompt,
  mergeAudienceTopologyIntent,
  normalizeAudienceTopologyFromUnknown,
} from "@/lib/room-set/layout-spec-audience-topology-infer";

import type { LayoutPatch, LayoutSpecAudienceTopologyIntent } from "./layout-spec";

function collectPatchTopology(patch: LayoutPatch): LayoutSpecAudienceTopologyIntent | undefined {
  let merged: LayoutSpecAudienceTopologyIntent | undefined;
  for (const op of patch.ops) {
    if (op.op !== "setAudienceTopology") continue;
    merged = mergeAudienceTopologyIntent(merged, op.topology);
  }
  return merged;
}

export function supplementLayoutPatchTopologyFromPrompt(
  patch: LayoutPatch,
  prompt: string,
  currentTopologyRows?: number | null,
): LayoutPatch {
  const inferred = inferAudienceTopologyFromPrompt(prompt, currentTopologyRows);
  const patchTopology = collectPatchTopology(patch);

  const missingPreferredRows =
    inferred.preferredRows !== undefined && patchTopology?.preferredRows === undefined;
  const missingWidthBias = inferred.widthBias !== undefined && patchTopology?.widthBias === undefined;
  const missingDepthBias = inferred.depthBias !== undefined && patchTopology?.depthBias === undefined;
  const missingArcStrength =
    inferred.arcStrength !== undefined && patchTopology?.arcStrength === undefined;

  if (!missingPreferredRows && !missingWidthBias && !missingDepthBias && !missingArcStrength) {
    return patch;
  }

  const supplement = normalizeAudienceTopologyFromUnknown({
    ...(missingPreferredRows ? { preferredRows: inferred.preferredRows } : {}),
    ...(missingWidthBias ? { widthBias: inferred.widthBias } : {}),
    ...(missingDepthBias ? { depthBias: inferred.depthBias } : {}),
    ...(missingArcStrength ? { arcStrength: inferred.arcStrength } : {}),
  });
  if (!supplement) return patch;

  return {
    version: 1,
    ops: [...patch.ops, { op: "setAudienceTopology", topology: supplement }],
  };
}
