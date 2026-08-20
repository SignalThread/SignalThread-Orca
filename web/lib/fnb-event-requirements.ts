import { FnbRequirementKind, RequirementDisposition } from "@prisma/client";

import { getEventFnbPlanner, type FnbFunctionRecord } from "@/lib/fnb-event-planner";
import { getPrisma } from "@/lib/prisma";
import { getSessionFnbSafetySummary } from "@/lib/session-fnb-safety";

/**
 * Event-wide view of dietary, allergen, and accessibility requirements.
 *
 * `SessionFnbRequirement` is the single canonical requirement record. This module does not
 * create a parallel store: it reads those rows, resolves each one against the assigned menu
 * using the same `getSessionFnbSafetySummary` rule the session workspace uses, and adds the
 * event/function context a planner needs to act.
 *
 * Requirements are scoped to a function today. A requirement that is genuinely event-wide
 * (unscoped) has no home in the current schema because `SessionFnbRequirement.sessionId` is
 * non-nullable; see docs/implementation/orca-planner-ux-repair-orientation.md.
 */

export type FnbRequirementStatus = "verified" | "needsWork" | "blocked";

export type FnbEventRequirement = {
  id: string;
  kind: FnbRequirementKind;
  code: string;
  label: string;
  /** Servings/accommodations required, not a count of people across the event. */
  quantity: number | null;
  disposition: RequirementDisposition;
  status: FnbRequirementStatus;
  /** Human-readable statement of what the evaluation concluded. */
  result: string;
  /** Why it concluded that, in operational terms. */
  cause: string;
  nextAction: string;
  ownerUserId: string | null;
  ownerLabel: string | null;
  lastUpdatedAt: string;
  lastUpdatedByUserId: string | null;
  lastUpdatedByLabel: string | null;
  scope: {
    sessionId: string;
    functionName: string;
    functionTypeLabel: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
  };
  /** Menu items evaluated against this requirement, with the evidence outcome for each. */
  menuEvidence: Array<{
    itemId: string;
    itemName: string;
    outcome: string;
    explanations: string[];
    href: string;
  }>;
  href: string;
};

export type FnbEventRequirementsPayload = {
  eventId: string;
  requirements: FnbEventRequirement[];
  summary: {
    total: number;
    verified: number;
    needsWork: number;
    blocked: number;
    /** Sum of quantities on unsettled requirements: accommodations owed, not distinct people. */
    outstandingAccommodations: number;
    /** How many functions carry at least one unsettled requirement. */
    affectedFunctionCount: number;
  };
  generatedAt: string;
};

function requirementLabel(kind: FnbRequirementKind, code: string, customLabel: string | null): string {
  const base = customLabel?.trim() || code.replaceAll("_", " ").toLowerCase();
  const suffix =
    kind === FnbRequirementKind.ALLERGEN
      ? "allergen"
      : kind === FnbRequirementKind.DIETARY
        ? "dietary"
        : "accessibility";
  return `${base.charAt(0).toUpperCase()}${base.slice(1)} ${suffix}`;
}

/**
 * Requirement status uses the same three states as F&B function readiness:
 * blocked (cannot proceed without a decision or evidence), needsWork (actionable and
 * incomplete), verified (evidence recorded).
 */
function statusFor(input: {
  disposition: RequirementDisposition;
  worstOutcome: string | null;
  hasMenu: boolean;
  isAccessibility: boolean;
}): { status: FnbRequirementStatus; result: string; cause: string; nextAction: string } {
  if (input.disposition === RequirementDisposition.NOT_NEEDED) {
    return {
      status: "verified",
      result: "Marked not needed",
      cause: "A planner recorded that this requirement does not apply.",
      nextAction: "No action required.",
    };
  }
  if (input.disposition === RequirementDisposition.COMPLETE) {
    return {
      status: "verified",
      result: "Complete",
      cause: "Accommodation was recorded as fulfilled.",
      nextAction: "No action required.",
    };
  }
  if (input.disposition === RequirementDisposition.MISSING) {
    return {
      status: "blocked",
      result: "Marked missing",
      cause: "The requirement was flagged as unmet and has not been resolved.",
      nextAction: "Resolve the requirement or record why it no longer applies.",
    };
  }
  if (input.isAccessibility) {
    return {
      status: "needsWork",
      result: "Awaiting accommodation confirmation",
      cause: "Accessibility requirements are confirmed operationally, not by menu evidence.",
      nextAction: "Confirm the accommodation with the venue and mark it complete.",
    };
  }
  if (!input.hasMenu) {
    return {
      status: "blocked",
      result: "No menu assigned to evaluate",
      cause: "The function has no assigned catalog items, so nothing can be checked.",
      nextAction: "Assign approved catalog items to this function.",
    };
  }
  switch (input.worstOutcome) {
    case "VERIFIED_MATCH":
      return {
        status: "verified",
        result: "Verified against the assigned menu",
        cause: "At least one assigned item carries verified evidence for this requirement.",
        nextAction: "No action required.",
      };
    case "CONFLICT":
      return {
        status: "blocked",
        result: "Assigned menu conflicts with this requirement",
        cause: "An assigned item is recorded as containing the restricted ingredient.",
        nextAction: "Replace or modify the conflicting item and record the evidence.",
      };
    case "STALE_VERIFICATION":
      return {
        status: "needsWork",
        result: "Evidence is stale",
        cause: "The menu item changed after it was verified.",
        nextAction: "Re-verify the item against the current menu version.",
      };
    case "POSSIBLE_MATCH":
      return {
        status: "needsWork",
        result: "Possible match without verified evidence",
        cause: "The assigned item may satisfy the requirement but carries no verified claim.",
        nextAction: "Obtain verified evidence from the venue and record it on the item.",
      };
    default:
      return {
        status: "blocked",
        result: "Insufficient information",
        cause: "No assigned item carries evidence either way for this requirement.",
        nextAction: "Record safety claims on the assigned items or add a compliant item.",
      };
  }
}

/** Callers must have already asserted event read access; this function does not authorize. */
export async function getEventFnbRequirements(eventId: string): Promise<FnbEventRequirementsPayload> {
  const prisma = getPrisma();
  const planner = await getEventFnbPlanner(eventId);

  const functionsById = new Map<string, FnbFunctionRecord>(
    planner.functions.map((entry) => [entry.sessionId, entry]),
  );

  // One safety evaluation per function, using the canonical per-session rule rather than a
  // second implementation of menu compatibility.
  const summaries = await Promise.all(
    planner.functions.map(async (entry) => ({
      sessionId: entry.sessionId,
      summary: await getSessionFnbSafetySummary(eventId, entry.sessionId),
    })),
  );

  const requirementRows = await prisma.sessionFnbRequirement.findMany({
    where: { eventId, sessionId: { in: planner.functions.map((entry) => entry.sessionId) } },
    orderBy: [{ kind: "asc" }, { code: "asc" }],
    select: {
      id: true,
      sessionId: true,
      kind: true,
      code: true,
      customLabel: true,
      quantity: true,
      disposition: true,
      dispositionActorUserId: true,
      dispositionAt: true,
      updatedAt: true,
    },
  });

  const actorIds = Array.from(
    new Set(requirementRows.map((row) => row.dispositionActorUserId).filter((id): id is string => Boolean(id))),
  );
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorLabels = new Map(actors.map((actor) => [actor.id, actor.name?.trim() || actor.email]));

  const requirements: FnbEventRequirement[] = requirementRows.flatMap((row) => {
    const scope = functionsById.get(row.sessionId);
    if (!scope) return [];

    const summary = summaries.find((entry) => entry.sessionId === row.sessionId)?.summary ?? null;
    const pairs = summary?.compatibilityPairs.filter((pair) => pair.requirementId === row.id) ?? [];
    // The best available evidence decides the outcome: one verified item satisfies the
    // requirement even when other items on the menu are silent about it.
    const worstOutcome = pairs.some((pair) => pair.outcome === "VERIFIED_MATCH")
      ? "VERIFIED_MATCH"
      : pairs.some((pair) => pair.outcome === "CONFLICT")
        ? "CONFLICT"
        : pairs.some((pair) => pair.outcome === "STALE_VERIFICATION")
          ? "STALE_VERIFICATION"
          : pairs.some((pair) => pair.outcome === "POSSIBLE_MATCH")
            ? "POSSIBLE_MATCH"
            : pairs.length > 0
              ? "INSUFFICIENT_INFORMATION"
              : null;

    const evaluation = statusFor({
      disposition: row.disposition,
      worstOutcome,
      hasMenu: scope.assignedItemCount > 0,
      isAccessibility: row.kind === FnbRequirementKind.ACCESSIBILITY,
    });

    return [
      {
        id: row.id,
        kind: row.kind,
        code: row.code,
        label: requirementLabel(row.kind, row.code, row.customLabel),
        quantity: row.quantity,
        disposition: row.disposition,
        ...evaluation,
        ownerUserId: row.dispositionActorUserId,
        ownerLabel: row.dispositionActorUserId
          ? actorLabels.get(row.dispositionActorUserId) ?? "Event member"
          : null,
        lastUpdatedAt: (row.dispositionAt ?? row.updatedAt).toISOString(),
        lastUpdatedByUserId: row.dispositionActorUserId,
        lastUpdatedByLabel: row.dispositionActorUserId
          ? actorLabels.get(row.dispositionActorUserId) ?? "Event member"
          : null,
        scope: {
          sessionId: scope.sessionId,
          functionName: scope.name,
          functionTypeLabel: scope.typeLabel,
          date: scope.date,
          startTime: scope.startTime,
          endTime: scope.endTime,
          location: scope.location,
        },
        menuEvidence: pairs.map((pair) => ({
          itemId: pair.itemId,
          itemName: pair.itemName,
          outcome: pair.outcome,
          explanations: pair.explanations,
          href: pair.href,
        })),
        href: scope.href,
      } satisfies FnbEventRequirement,
    ];
  });

  const unsettled = requirements.filter((requirement) => requirement.status !== "verified");

  return {
    eventId,
    requirements,
    summary: {
      total: requirements.length,
      verified: requirements.filter((requirement) => requirement.status === "verified").length,
      needsWork: requirements.filter((requirement) => requirement.status === "needsWork").length,
      blocked: requirements.filter((requirement) => requirement.status === "blocked").length,
      // Accommodations are servings owed. They are deliberately NOT a count of distinct people:
      // one attendee can need the same accommodation at breakfast and at lunch.
      outstandingAccommodations: unsettled.reduce(
        (total, requirement) => total + (requirement.quantity ?? 0),
        0,
      ),
      affectedFunctionCount: new Set(unsettled.map((requirement) => requirement.scope.sessionId)).size,
    },
    generatedAt: new Date().toISOString(),
  };
}
