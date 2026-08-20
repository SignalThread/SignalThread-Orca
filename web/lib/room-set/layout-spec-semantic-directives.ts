/**
 * Apply prompt semantic directives — explicit vs soft strength for topology scoring.
 * Generate path does not use this module.
 */

import type { LayoutSpecAudienceTopologyIntent } from "./layout-spec";
import { inferAudienceTopologyFromPrompt } from "./layout-spec-audience-topology-infer";
import {
  inferSpatialApplyDirectives,
  mapSpatialDirectivesToPlannerKeys,
} from "./layout-spatial-directives";

export type SemanticDirectiveStrength = "explicit" | "soft";

export type ApplySemanticPackBias = "compact" | "loose";

export type ApplySemanticDirectives = Readonly<{
  explicit: LayoutSpecAudienceTopologyIntent;
  soft: LayoutSpecAudienceTopologyIntent;
  packBias?: ApplySemanticPackBias;
  packBiasStrength?: SemanticDirectiveStrength;
}>;

type MutableTopologyIntent = {
  preferredRows?: number;
  widthBias?: LayoutSpecAudienceTopologyIntent["widthBias"];
  depthBias?: LayoutSpecAudienceTopologyIntent["depthBias"];
  arcStrength?: LayoutSpecAudienceTopologyIntent["arcStrength"];
};

const VAGUE_VIBE_ONLY_RE =
  /\b(?:more\s+social|cleaner|better\s+flow|more\s+premium|nicer|elevated|prettier|classier)\b/i;

const EXPLICIT_ROW_RE =
  /\b(?:(?:\d+|one|two|three|four|five|six|seven|eight)\s+rows?|(?:more|fewer|less|extra|additional)\s+rows?|rows?\s+instead\s+of)\b/i;

const EXPLICIT_WIDTH_RE =
  /\b(?:wider|narrower|spread\s+(?:out\s+)?(?:the\s+)?(?:tables?|seating)|make\s+(?:this|it)\s+wider)\b/i;

const EXPLICIT_DEPTH_RE =
  /\b(?:deeper|shallower|make\s+(?:this|it)\s+deeper|make\s+(?:this|it)\s+shallower|more\s+depth|less\s+depth)\b/i;

const EXPLICIT_ARC_RE =
  /\b(?:more\s+curved|less\s+curved|more\s+crescent|less\s+crescent|stronger\s+arc|softer\s+arc|dramatic\s+arc|subtle(?:r)?\s+(?:arc|crescent))\b/i;

const EXPLICIT_PACK_RE =
  /\b(?:more\s+compact|tighter\s+pack(?:ing)?|pack\s+(?:it\s+)?tighter|looser|spread\s+(?:the\s+)?tables?\s+out)\b/i;

function hasExplicitTopologySignals(text: string): boolean {
  return (
    EXPLICIT_ROW_RE.test(text) ||
    EXPLICIT_WIDTH_RE.test(text) ||
    EXPLICIT_DEPTH_RE.test(text) ||
    EXPLICIT_ARC_RE.test(text) ||
    EXPLICIT_PACK_RE.test(text)
  );
}

function isVagueVibeOnlyPrompt(text: string): boolean {
  if (!text) return false;
  if (!VAGUE_VIBE_ONLY_RE.test(text)) return false;
  return !hasExplicitTopologySignals(text);
}

function extractPackBiasFromPrompt(
  prompt: string,
): Readonly<{ packBias: ApplySemanticPackBias; strength: SemanticDirectiveStrength }> | undefined {
  const text = prompt.trim();
  if (!text) return undefined;

  if (/\b(?:more\s+compact|tighter\s+pack(?:ing)?|pack\s+(?:it\s+)?tighter)\b/i.test(text)) {
    return { packBias: "compact", strength: "explicit" };
  }
  if (/\b(?:looser|spread\s+(?:the\s+)?tables?\s+out|more\s+spread)\b/i.test(text)) {
    return { packBias: "loose", strength: "explicit" };
  }
  if (/\b(?:a\s+bit\s+looser|slightly\s+more\s+spread)\b/i.test(text)) {
    return { packBias: "loose", strength: "soft" };
  }
  return undefined;
}

function assignTopologyField(args: Readonly<{
  explicit: MutableTopologyIntent;
  soft: MutableTopologyIntent;
  field: keyof MutableTopologyIntent;
  value: MutableTopologyIntent[keyof MutableTopologyIntent];
  strength: SemanticDirectiveStrength;
}>): void {
  if (args.value === undefined) return;
  const target = args.strength === "explicit" ? args.explicit : args.soft;
  (target as Record<string, unknown>)[args.field] = args.value;
}

export function inferSemanticDirectivesFromPrompt(
  prompt: string,
  currentTopologyRows?: number | null,
): ApplySemanticDirectives {
  const text = prompt.trim();
  const explicit: MutableTopologyIntent = {};
  const soft: MutableTopologyIntent = {};

  if (!text || isVagueVibeOnlyPrompt(text)) {
    return { explicit: {}, soft: {} };
  }

  const topology = inferAudienceTopologyFromPrompt(prompt, currentTopologyRows);
  const rowStrength: SemanticDirectiveStrength = EXPLICIT_ROW_RE.test(text) ? "explicit" : "soft";
  const widthStrength: SemanticDirectiveStrength = EXPLICIT_WIDTH_RE.test(text) ? "explicit" : "soft";
  const depthStrength: SemanticDirectiveStrength = EXPLICIT_DEPTH_RE.test(text) ? "explicit" : "soft";
  const arcStrength: SemanticDirectiveStrength = EXPLICIT_ARC_RE.test(text) ? "explicit" : "soft";

  assignTopologyField({
    explicit,
    soft,
    field: "preferredRows",
    value: topology.preferredRows,
    strength: rowStrength,
  });
  assignTopologyField({
    explicit,
    soft,
    field: "widthBias",
    value: topology.widthBias,
    strength: widthStrength,
  });
  assignTopologyField({
    explicit,
    soft,
    field: "depthBias",
    value: topology.depthBias,
    strength: depthStrength,
  });
  assignTopologyField({
    explicit,
    soft,
    field: "arcStrength",
    value: topology.arcStrength,
    strength: arcStrength,
  });

  const pack = extractPackBiasFromPrompt(prompt);

  return {
    explicit,
    soft,
    ...(pack ? { packBias: pack.packBias, packBiasStrength: pack.strength } : {}),
  };
}

export type SemanticDirectiveScoringWeights = Readonly<{
  preferredRowsMismatch: number;
  widthBias: number;
  depthBias: number;
  arcStrength: number;
  packBias: number;
}>;

const DEFAULT_SCORING_WEIGHTS: SemanticDirectiveScoringWeights = {
  preferredRowsMismatch: 2.85,
  widthBias: 1,
  depthBias: 1,
  arcStrength: 1,
  packBias: 1,
};

const EXPLICIT_SCORING_WEIGHTS: SemanticDirectiveScoringWeights = {
  preferredRowsMismatch: 14,
  widthBias: 2.4,
  depthBias: 2.2,
  arcStrength: 3.6,
  packBias: 2.5,
};

const SOFT_SCORING_WEIGHTS: SemanticDirectiveScoringWeights = {
  preferredRowsMismatch: 1.4,
  widthBias: 0.35,
  depthBias: 0.35,
  arcStrength: 0.45,
  packBias: 0.4,
};

type ScoringWeightField =
  | "preferredRows"
  | "widthBias"
  | "depthBias"
  | "arcStrength"
  | "packBias";

function scoringWeightKey(field: ScoringWeightField): keyof SemanticDirectiveScoringWeights {
  return field === "preferredRows" ? "preferredRowsMismatch" : field;
}

export function resolveSemanticDirectiveScoringWeight(
  directives: ApplySemanticDirectives | undefined,
  field: ScoringWeightField,
): number {
  const key = scoringWeightKey(field);

  if (!directives) return DEFAULT_SCORING_WEIGHTS[key];

  if (field === "packBias") {
    if (directives.packBiasStrength === "explicit") return EXPLICIT_SCORING_WEIGHTS.packBias;
    if (directives.packBiasStrength === "soft") return SOFT_SCORING_WEIGHTS.packBias;
    return DEFAULT_SCORING_WEIGHTS.packBias;
  }

  if (directives.explicit[field] !== undefined) return EXPLICIT_SCORING_WEIGHTS[key];
  if (directives.soft[field] !== undefined) return SOFT_SCORING_WEIGHTS[key];

  return DEFAULT_SCORING_WEIGHTS[key];
}

export function listActiveSemanticDirectiveKeys(
  directives: ApplySemanticDirectives | undefined,
): readonly string[] {
  if (!directives) return [];
  const keys: string[] = [];
  for (const field of ["preferredRows", "widthBias", "depthBias", "arcStrength"] as const) {
    if (directives.explicit[field] !== undefined) keys.push(`explicit.${field}`);
    else if (directives.soft[field] !== undefined) keys.push(`soft.${field}`);
  }
  if (directives.packBias) {
    keys.push(`${directives.packBiasStrength ?? "explicit"}.packBias.${directives.packBias}`);
  }
  return keys;
}

export function topologyIntentFieldIsExplicit(
  directives: ApplySemanticDirectives | undefined,
  field: keyof LayoutSpecAudienceTopologyIntent,
): boolean {
  return directives?.explicit[field] !== undefined;
}

export function mergePlannerSemanticDirectiveKeys(args: Readonly<{
  prompt: string;
  topologyDirectives?: ApplySemanticDirectives;
  currentTopologyRows?: number | null;
}>): readonly string[] {
  const topologyKeys = listActiveSemanticDirectiveKeys(
    args.topologyDirectives ??
      inferSemanticDirectivesFromPrompt(args.prompt, args.currentTopologyRows),
  );
  const spatialKeys = mapSpatialDirectivesToPlannerKeys(inferSpatialApplyDirectives(args.prompt));
  return [...topologyKeys, ...spatialKeys];
}
