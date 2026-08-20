/**
 * Apply-mode layout spec finalization and composer audience invalidation.
 * Generate path does not use this module.
 */

import { inferCapacityTargetFromPrompt } from "@/lib/room-set/planner-component-requests";
import {
  inferAudienceStyleFromPrompt,
  resolveAudienceStyleFromLayoutStyle,
  resolveDensityPreferenceFromControl,
} from "@/lib/room-set/layout-spec-generate-resolve";
import {
  audienceTopologyIntentChanged,
  inferAudienceTopologyFromPrompt,
  mergeAudienceTopologyIntent,
} from "@/lib/room-set/layout-spec-audience-topology-infer";
import {
  inferSemanticDirectivesFromPrompt,
  listActiveSemanticDirectiveKeys,
  type ApplySemanticDirectives,
} from "@/lib/room-set/layout-spec-semantic-directives";
import { composeLayoutSpec } from "@/lib/room-set/layout-spec-compose";
import type { ComposePlannerLayoutResult } from "@/lib/room-set/planner-layout-compose";
import type { RoomSetLayoutPlacement } from "@/lib/room-set/planner-layout-schema";
import type {
  RoomSetAudienceStyle,
  RoomSetDensityControl,
  RoomSetDensityPreference,
  RoomSetLayoutStylePreference,
} from "@/lib/room-set/planner-intent-shared";
import { normalizeRoomSetAudienceStyle } from "@/lib/room-set/planner-intent-shared";
import { getRoomSetComponent, type RoomSetComponentId } from "@/lib/room-set/component-library";

import type { LayoutSpec, LayoutSpecComposeInput } from "./layout-spec";

const BANQUET_TABLE_IDS = new Set<RoomSetComponentId>([
  "table-round-60",
  "table-round-72",
  "table-banquet-6ft",
]);

const TOPOLOGY_AFFECTING_PROMPT_RE =
  /\b(?:\d+\s+rows?|two\s+rows?|three\s+rows?|four\s+rows?|five\s+rows?|fewer\s+rows?|more\s+rows?|single\s+row|double\s+row|triple\s+row|spread\s+(?:out\s+)?(?:the\s+)?tables|reflow\s+(?:the\s+)?(?:tables|seating)|rearrange\s+(?:the\s+)?(?:tables|seating)|grid\s+(?:the\s+)?tables|tighter\s+(?:table\s+)?spacing|wider\s+(?:table\s+)?spacing|crescent|half[\s-]moon|u[\s-]shaped|curved|fan(?:ned)?|arc(?:ed)?|aligned|loose|organic|staggered|clusters?)\b/i;

export type ApplyAudienceTopologySummary = Readonly<{
  layoutType: LayoutSpec["layoutType"];
  audienceStyle: RoomSetAudienceStyle;
  densityPreference: RoomSetDensityPreference;
  attendeeTarget: number;
  requiredPrimaryComponents: number;
  rowCounts: string | null;
  topologyRows: number | null;
  topologyColumns: number | null;
}>;

function clampAttendees(value: number): number {
  return Math.max(1, Math.min(1200, Math.round(value)));
}

export function promptRequestsAudienceTopologyRelayout(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (inferAudienceStyleFromPrompt(text)) return true;
  return TOPOLOGY_AFFECTING_PROMPT_RE.test(text);
}

export function finalizeApplyLayoutSpec(args: Readonly<{
  baseSpec: LayoutSpec;
  mergedSpec: LayoutSpec;
  prompt: string;
  sidebarDensityPreference: RoomSetDensityControl;
  sidebarLayoutStyle?: RoomSetLayoutStylePreference;
  sidebarAttendeeCount: number;
  currentTopologyRows?: number | null;
}>): LayoutSpec {
  const promptCount = inferCapacityTargetFromPrompt(args.prompt);
  const sidebarCount = clampAttendees(args.sidebarAttendeeCount);
  let attendeeTarget = args.mergedSpec.attendeeTarget;

  if (promptCount !== null) {
    attendeeTarget = clampAttendees(promptCount);
  } else if (
    args.mergedSpec.attendeeTarget === args.baseSpec.attendeeTarget &&
    sidebarCount !== args.baseSpec.attendeeTarget
  ) {
    attendeeTarget = sidebarCount;
  }

  const primaryComponentCapacity = Math.max(1, args.mergedSpec.audience.primaryComponentCapacity);
  const audienceTopology = mergeAudienceTopologyIntent(
    mergeAudienceTopologyIntent(args.baseSpec.audienceTopology, args.mergedSpec.audienceTopology),
    inferAudienceTopologyFromPrompt(args.prompt, args.currentTopologyRows),
  );
  const promptAudienceStyle = inferAudienceStyleFromPrompt(args.prompt, args.mergedSpec.layoutType);
  const audienceStyle =
    promptAudienceStyle
      ? normalizeRoomSetAudienceStyle(promptAudienceStyle, args.mergedSpec.layoutType)
      : args.sidebarLayoutStyle
        ? resolveAudienceStyleFromLayoutStyle({
            control: args.sidebarLayoutStyle,
            prompt: args.prompt,
            eventIntent: args.mergedSpec.eventIntent,
            layoutType: args.mergedSpec.layoutType,
            aiAudienceStyle: args.mergedSpec.audienceStyle,
          })
        : args.mergedSpec.layoutType === args.baseSpec.layoutType ||
            args.mergedSpec.audienceStyle !== args.baseSpec.audienceStyle
          ? normalizeRoomSetAudienceStyle(args.mergedSpec.audienceStyle, args.mergedSpec.layoutType)
          : resolveAudienceStyleFromLayoutStyle({
              control: args.sidebarLayoutStyle,
              prompt: args.prompt,
              eventIntent: args.mergedSpec.eventIntent,
              layoutType: args.mergedSpec.layoutType,
              aiAudienceStyle: args.mergedSpec.audienceStyle,
            });

  return {
    ...args.mergedSpec,
    attendeeTarget,
    densityPreference: resolveDensityPreferenceFromControl({
      control: args.sidebarDensityPreference,
      prompt: args.prompt,
      eventIntent: args.mergedSpec.eventIntent,
      attendeeTarget,
      fallback: args.mergedSpec.densityPreference,
    }),
    audienceStyle,
    ...(audienceTopology ? { audienceTopology } : {}),
    audience: {
      ...args.mergedSpec.audience,
      requiredPrimaryComponents: Math.max(
        1,
        Math.min(400, Math.ceil(attendeeTarget / primaryComponentCapacity)),
      ),
    },
  };
}

export function shouldRecomposeApplyAudience(args: Readonly<{
  baseSpec: LayoutSpec;
  mergedSpec: LayoutSpec;
  prompt: string;
}>): boolean {
  if (args.mergedSpec.audienceStyle !== args.baseSpec.audienceStyle) return true;
  if (args.mergedSpec.densityPreference !== args.baseSpec.densityPreference) return true;
  if (args.mergedSpec.attendeeTarget !== args.baseSpec.attendeeTarget) return true;
  if (args.mergedSpec.layoutType !== args.baseSpec.layoutType) return true;
  if (args.mergedSpec.audience.requiredPrimaryComponents !== args.baseSpec.audience.requiredPrimaryComponents) {
    return true;
  }
  if (args.mergedSpec.audience.primaryComponentId !== args.baseSpec.audience.primaryComponentId) {
    return true;
  }
  if (audienceTopologyIntentChanged(args.baseSpec.audienceTopology, args.mergedSpec.audienceTopology)) {
    return true;
  }
  if (promptRequestsAudienceTopologyRelayout(args.prompt)) return true;
  return false;
}

function clusterBanquetRowCounts(tables: readonly RoomSetLayoutPlacement[]): number[] {
  if (tables.length === 0) return [];

  const sorted = [...tables].sort((left, right) => {
    const dy = left.yLu - right.yLu;
    if (Math.abs(dy) > 0.5) return dy;
    return left.xLu - right.xLu;
  });

  const sample = getRoomSetComponent(sorted[0]!.componentId);
  const rowTolerance = Math.max(2, (sample?.depthLu ?? 6) * 0.35);
  const rows: number[] = [];
  let currentRowY = sorted[0]!.yLu;
  let currentCount = 0;

  for (const table of sorted) {
    if (Math.abs(table.yLu - currentRowY) > rowTolerance) {
      if (currentCount > 0) rows.push(currentCount);
      currentRowY = table.yLu;
      currentCount = 1;
      continue;
    }
    currentCount += 1;
  }
  if (currentCount > 0) rows.push(currentCount);
  return rows;
}

function topologySummaryFromSpec(spec: LayoutSpec): ApplyAudienceTopologySummary {
  return {
    layoutType: spec.layoutType,
    audienceStyle: spec.audienceStyle,
    densityPreference: spec.densityPreference,
    attendeeTarget: spec.attendeeTarget,
    requiredPrimaryComponents: spec.audience.requiredPrimaryComponents,
    rowCounts: null,
    topologyRows: spec.audienceTopology?.preferredRows ?? null,
    topologyColumns: null,
  };
}

function topologySummaryFromPlacements(
  spec: LayoutSpec,
  placements: readonly RoomSetLayoutPlacement[],
): ApplyAudienceTopologySummary {
  const base = topologySummaryFromSpec(spec);
  if (spec.layoutType !== "banquet") return base;

  const tables = placements.filter((placement) => BANQUET_TABLE_IDS.has(placement.componentId));
  const rowCounts = clusterBanquetRowCounts(tables);
  return {
    ...base,
    rowCounts: rowCounts.length > 0 ? rowCounts.join("+") : null,
    topologyRows: rowCounts.length > 0 ? rowCounts.length : null,
    topologyColumns: rowCounts.length > 0 ? Math.max(...rowCounts) : null,
  };
}

function probeBanquetTopology(
  spec: LayoutSpec,
  roomWidthLu: number,
  roomDepthLu: number,
): ApplyAudienceTopologySummary {
  if (spec.layoutType !== "banquet") return topologySummaryFromSpec(spec);

  const prevInfo = console.info;
  console.info = () => {};
  try {
    const composed = composeLayoutSpec({ spec, roomWidthLu, roomDepthLu });
    if (!composed.ok) return topologySummaryFromSpec(spec);
    return topologySummaryFromPlacements(spec, composed.placements);
  } finally {
    console.info = prevInfo;
  }
}

export function buildApplyLayoutSummary(
  spec: LayoutSpec,
  roomWidthLu: number,
  roomDepthLu: number,
): ApplyAudienceTopologySummary {
  return probeBanquetTopology(spec, roomWidthLu, roomDepthLu);
}

export type LayoutSpecApplyComposeInput = LayoutSpecComposeInput &
  Readonly<{
    applyContext: Readonly<{
      baseSpec: LayoutSpec;
      prompt: string;
      sidebarAttendeeCount: number;
      sidebarDensityPreference: RoomSetDensityControl;
      sidebarLayoutStyle?: RoomSetLayoutStylePreference;
    }>;
  }>;

export type ComposeLayoutSpecForApplyResult = Readonly<{
  result: ComposePlannerLayoutResult;
  layoutSpec: LayoutSpec;
  recomposedAudience: boolean;
  applyAudienceStyle: RoomSetAudienceStyle;
  semanticDirectives: ApplySemanticDirectives;
  topologyChanged: boolean;
  scoringDirectivesMaterial: readonly string[];
}>;

export function composeLayoutSpecForApply(
  input: LayoutSpecApplyComposeInput,
): ComposeLayoutSpecForApplyResult {
  const layoutSummaryBefore = probeBanquetTopology(
    input.applyContext.baseSpec,
    input.roomWidthLu,
    input.roomDepthLu,
  );

  const semanticDirectives = inferSemanticDirectivesFromPrompt(
    input.applyContext.prompt,
    layoutSummaryBefore.topologyRows,
  );

  const finalizedSpec = finalizeApplyLayoutSpec({
    baseSpec: input.applyContext.baseSpec,
    mergedSpec: input.spec,
    prompt: input.applyContext.prompt,
    sidebarDensityPreference: input.applyContext.sidebarDensityPreference,
    sidebarLayoutStyle: input.applyContext.sidebarLayoutStyle,
    sidebarAttendeeCount: input.applyContext.sidebarAttendeeCount,
    currentTopologyRows: layoutSummaryBefore.topologyRows,
  });

  const applyAudienceStyle = finalizedSpec.audienceStyle;
  const recomposedAudience = shouldRecomposeApplyAudience({
    baseSpec: input.applyContext.baseSpec,
    mergedSpec: finalizedSpec,
    prompt: input.applyContext.prompt,
  });

  const topologyBefore = recomposedAudience
    ? layoutSummaryBefore
    : topologySummaryFromSpec(input.applyContext.baseSpec);

  const composed = composeLayoutSpec({
    spec: finalizedSpec,
    roomWidthLu: input.roomWidthLu,
    roomDepthLu: input.roomDepthLu,
    applySemanticDirectives: semanticDirectives,
  });

  const topologyAfter = composed.ok
    ? topologySummaryFromPlacements(finalizedSpec, composed.placements)
    : topologySummaryFromSpec(finalizedSpec);

  const topologyChanged =
    topologyBefore.topologyRows !== topologyAfter.topologyRows ||
    topologyBefore.topologyColumns !== topologyAfter.topologyColumns ||
    topologyBefore.rowCounts !== topologyAfter.rowCounts ||
    topologyBefore.audienceStyle !== topologyAfter.audienceStyle;

  const scoringDirectivesMaterial = listActiveSemanticDirectiveKeys(semanticDirectives).filter((key) =>
    key.startsWith("explicit."),
  );

  console.info("[room-set/compose] apply audience invalidation", {
    applyAudienceStyle,
    audienceTopology: finalizedSpec.audienceTopology ?? null,
    semanticDirectives,
    topologyBefore,
    topologyAfter,
    topologyChanged,
    recomposedAudience,
    scoringDirectivesMaterial,
  });

  return {
    result: composed,
    layoutSpec: finalizedSpec,
    recomposedAudience,
    applyAudienceStyle,
    semanticDirectives,
    topologyChanged,
    scoringDirectivesMaterial,
  };
}
