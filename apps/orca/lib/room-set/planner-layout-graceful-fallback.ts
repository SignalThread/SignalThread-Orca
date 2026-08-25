import type { LayoutSpec, LayoutSpecItem } from "./layout-spec";
import type { ComposePlannerLayoutResult } from "./planner-layout-compose";
import { sumPlatedSeatCapacity, validatePlannerLayoutPlacements } from "./planner-layout-validator";
import type { RoomSetPlanResultMessage, RoomSetPlanResultStatus } from "./spatial-types";
import type { RoomSetPlanFailureDetails } from "./spatial-types";
import type { RoomSetComponentId } from "./component-library";

type ComposeCandidateResult = Readonly<{
  layoutSpec: LayoutSpec;
  result: ComposePlannerLayoutResult;
}>;

type ComposeCandidate = (spec: LayoutSpec) => ComposeCandidateResult;

const OPTIONAL_SECONDARY_COMPONENT_LABELS = new Map<RoomSetComponentId, string>([
  ["fnb-buffet-line", "buffet service"],
  ["fnb-portable-bar", "bar service"],
  ["fnb-coffee-station", "coffee service"],
  ["booth-10x10", "sponsor visibility"],
  ["decor-plant-cluster", "decor"],
  ["registration-desk", "registration/check-in"],
  ["registration-kiosk", "registration/check-in"],
  ["registration-queue-lane", "registration/check-in"],
]);

const FAILURE_SUGGESTIONS = [
  "Reduce attendee count",
  "Switch to Compact",
  "Remove one service item",
  "Use a larger room",
];

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function targetSpecAttendees(spec: LayoutSpec, attendeeTarget: number): LayoutSpec {
  const target = Math.max(1, Math.min(1200, Math.round(attendeeTarget)));
  const primaryComponentCapacity = Math.max(1, spec.audience.primaryComponentCapacity);
  return {
    ...spec,
    attendeeTarget: target,
    audience: {
      ...spec.audience,
      requiredPrimaryComponents: Math.max(
        1,
        Math.min(400, Math.ceil(target / primaryComponentCapacity)),
      ),
    },
  };
}

function compactSpec(spec: LayoutSpec): LayoutSpec {
  return spec.densityPreference === "compact"
    ? spec
    : { ...spec, densityPreference: "compact" };
}

function optionalSecondaryLabel(item: LayoutSpecItem): string | null {
  return OPTIONAL_SECONDARY_COMPONENT_LABELS.get(item.componentId) ?? null;
}

function dropOptionalSecondary(spec: LayoutSpec): Readonly<{
  spec: LayoutSpec;
  removedLabels: readonly string[];
}> {
  const removedLabels: string[] = [];
  const secondary = spec.secondary.filter((item) => {
    const label = optionalSecondaryLabel(item);
    if (!label) return true;
    removedLabels.push(label);
    return false;
  });

  return {
    spec: { ...spec, secondary },
    removedLabels: dedupe(removedLabels),
  };
}

function issueReason(result: ComposeCandidateResult): string {
  return result.result.issues.map((issue) => `${issue.code}: ${issue.message}`).join(" | ");
}

function validateCandidate(
  candidate: ComposeCandidateResult,
  roomWidthLu: number,
  roomDepthLu: number,
): ComposeCandidateResult {
  if (!candidate.result.ok) return candidate;
  const validated = validatePlannerLayoutPlacements(
    candidate.result.placements,
    roomWidthLu,
    roomDepthLu,
  );
  if (validated.ok) {
    const audiencePlacementCount = candidate.result.placements.filter(
      (placement) => placement.componentId === candidate.layoutSpec.audience.primaryComponentId,
    ).length;
    const placedSeatCapacity = sumPlatedSeatCapacity(candidate.result.placements);
    const requiresCapacityFloor =
      audiencePlacementCount > 0 &&
      candidate.layoutSpec.attendeeTarget > 0 &&
      candidate.layoutSpec.audience.requiredPrimaryComponents > 0 &&
      candidate.layoutSpec.audience.primaryComponentCapacity > 0;
    if (
      !requiresCapacityFloor ||
      placedSeatCapacity >= Math.ceil(candidate.layoutSpec.attendeeTarget * 0.8)
    ) {
      return candidate;
    }
    return {
      layoutSpec: candidate.layoutSpec,
      result: {
        ...candidate.result,
        ok: false,
        issues: [
          ...candidate.result.issues,
          {
            code: "compose_rows_failed",
            message: `Layout placed ${placedSeatCapacity} seats, below the safe fallback floor for ${candidate.layoutSpec.attendeeTarget} requested attendees.`,
          },
        ],
      },
    };
  }
  return {
    layoutSpec: candidate.layoutSpec,
    result: {
      ...candidate.result,
      ok: false,
      issues: validated.issues,
      placements: validated.placements,
    },
  };
}

function successMessage(status: RoomSetPlanResultStatus, adjustments: readonly string[], debugReason?: string): RoomSetPlanResultMessage {
  if (status === "success") {
    return {
      resultStatus: "success",
      userMessageTitle: "Last Generation",
      userMessageBody: "Layout created successfully.",
      adjustments: [],
      suggestions: [],
      ...(debugReason ? { debugReason } : {}),
    };
  }

  return {
    resultStatus: "success_with_adjustments",
    userMessageTitle: "Layout Created with Adjustments",
    userMessageBody: "We created the closest safe layout for this room.",
    adjustments: dedupe(adjustments),
    suggestions: [],
    ...(debugReason ? { debugReason } : {}),
  };
}

export function failedGenerationMessage(
  debugReason: string,
  failureDetails?: RoomSetPlanFailureDetails,
): RoomSetPlanResultMessage {
  return {
    resultStatus: "failed",
    userMessageTitle: "Generation Failed",
    userMessageBody:
      failureDetails?.reason ??
      "We couldn’t create a safe layout with the current room size and setup.",
    adjustments: [],
    suggestions: FAILURE_SUGGESTIONS,
    ...(failureDetails ? { failureDetails } : {}),
    debugReason,
  };
}

export function failedApplyMessage(
  debugReason: string,
  failureDetails?: RoomSetPlanFailureDetails,
): RoomSetPlanResultMessage {
  return {
    resultStatus: "failed",
    userMessageTitle: "Apply Failed",
    userMessageBody:
      failureDetails?.reason ??
      "We couldn’t safely apply that change to the current layout.",
    adjustments: [],
    suggestions: [],
    ...(failureDetails ? { failureDetails } : {}),
    debugReason,
  };
}

export type GracefulLayoutComposeResult = Readonly<
  RoomSetPlanResultMessage & {
    layoutSpec: LayoutSpec | null;
    composed: ComposePlannerLayoutResult | null;
    appliedSeatCapacity: number;
  }
>;

export function composeLayoutSpecWithGracefulFallback(args: Readonly<{
  spec: LayoutSpec;
  roomWidthLu: number;
  roomDepthLu: number;
  compose: ComposeCandidate;
}>): GracefulLayoutComposeResult {
  const requestedAttendees = Math.max(1, Math.round(args.spec.attendeeTarget));
  const normal = validateCandidate(args.compose(args.spec), args.roomWidthLu, args.roomDepthLu);
  if (normal.result.ok) {
    return {
      ...successMessage("success", []),
      layoutSpec: normal.layoutSpec,
      composed: normal.result,
      appliedSeatCapacity: sumPlatedSeatCapacity(normal.result.placements),
    };
  }

  const debugReasons = [`requested: ${issueReason(normal)}`];
  const compactCandidateSpec = compactSpec(args.spec);
  const compactCandidate = validateCandidate(args.compose(compactCandidateSpec), args.roomWidthLu, args.roomDepthLu);
  if (compactCandidate.result.ok) {
    return {
      ...successMessage("success_with_adjustments", ["Used tighter spacing to fit the room."], issueReason(normal)),
      layoutSpec: compactCandidate.layoutSpec,
      composed: compactCandidate.result,
      appliedSeatCapacity: sumPlatedSeatCapacity(compactCandidate.result.placements),
    };
  }
  debugReasons.push(`compact: ${issueReason(compactCandidate)}`);

  const minSafeAttendees = Math.max(1, Math.ceil(requestedAttendees * 0.8));
  const reducedCandidateSpec = targetSpecAttendees(compactCandidateSpec, minSafeAttendees);
  const reducedCandidate = validateCandidate(args.compose(reducedCandidateSpec), args.roomWidthLu, args.roomDepthLu);
  if (reducedCandidate.result.ok) {
    return {
      ...successMessage(
        "success_with_adjustments",
        [
          "Used tighter spacing to fit the room.",
          `Requested ${requestedAttendees} attendees. Safely placed ${reducedCandidate.layoutSpec.attendeeTarget}.`,
          "Preserved stage, screen, and main seating.",
        ],
        debugReasons.join(" | "),
      ),
      layoutSpec: reducedCandidate.layoutSpec,
      composed: reducedCandidate.result,
      appliedSeatCapacity: sumPlatedSeatCapacity(reducedCandidate.result.placements),
    };
  }
  debugReasons.push(`reduced_80_percent: ${issueReason(reducedCandidate)}`);

  const optionalDrop = dropOptionalSecondary(reducedCandidateSpec);
  if (optionalDrop.removedLabels.length > 0) {
    const droppedCandidate = validateCandidate(args.compose(optionalDrop.spec), args.roomWidthLu, args.roomDepthLu);
    if (droppedCandidate.result.ok) {
      return {
        ...successMessage(
          "success_with_adjustments",
          [
            "Used tighter spacing to fit the room.",
            `Requested ${requestedAttendees} attendees. Safely placed ${droppedCandidate.layoutSpec.attendeeTarget}.`,
            ...optionalDrop.removedLabels.map((label) => `Removed optional ${label} because it could not be placed safely.`),
            "Preserved stage, screen, and main seating.",
          ],
          debugReasons.join(" | "),
        ),
        layoutSpec: droppedCandidate.layoutSpec,
        composed: droppedCandidate.result,
        appliedSeatCapacity: sumPlatedSeatCapacity(droppedCandidate.result.placements),
      };
    }
    debugReasons.push(`drop_optional: ${issueReason(droppedCandidate)}`);
  }

  return {
    ...failedGenerationMessage(debugReasons.join(" | ")),
    layoutSpec: null,
    composed: null,
    appliedSeatCapacity: 0,
  };
}
