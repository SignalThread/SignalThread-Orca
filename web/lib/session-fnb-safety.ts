import {
  FnbCompatibilityOutcome,
  FnbRequirementKind,
  FnbVerificationStatus,
  RequirementDisposition,
} from "@prisma/client";
import {
  assessMenuCompatibility,
  explainCompatibilityReason,
  normalizeAccessibilityValue,
  normalizeTaxonomyValue,
  validateDisposition,
  type CompatibilityOutcome,
  type MenuClaim,
  type SafetyRequirement,
} from "@/lib/fnb-safety-domain";
import { getPrisma } from "@/lib/prisma";
import { recordEventActivity } from "@/src/server/services/event-activity";

export class SessionFnbSafetyError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "SESSION_FNB_SAFETY_ERROR") {
    super(message);
    this.name = "SessionFnbSafetyError";
  }
}
const OUTCOME_PRIORITY: Record<CompatibilityOutcome, number> = {
  CONFLICT: 5,
  INSUFFICIENT_INFORMATION: 4,
  STALE_VERIFICATION: 3,
  POSSIBLE_MATCH: 2,
  VERIFIED_MATCH: 1,
};

function worstOutcome(outcomes: CompatibilityOutcome[]): CompatibilityOutcome {
  return outcomes.reduce((current, candidate) =>
    OUTCOME_PRIORITY[candidate] > OUTCOME_PRIORITY[current] ? candidate : current,
  "VERIFIED_MATCH");
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function requiredId(value: unknown, field: string): string {
  const id = optionalText(value);
  if (!id) throw new SessionFnbSafetyError(`${field} is required`);
  return id;
}

function operationalOutcome(
  base: CompatibilityOutcome,
  resolution: { modificationStatus: FnbVerificationStatus | null; modification: string | null; evidenceSource: string | null } | null,
): CompatibilityOutcome {
  return resolution?.modificationStatus === FnbVerificationStatus.VERIFIED
    && Boolean(resolution.modification?.trim())
    && Boolean(resolution.evidenceSource?.trim())
    ? "VERIFIED_MATCH"
    : base;
}

export async function getSessionFnbSafetySummary(eventId: string, sessionId: string) {
  const prisma = getPrisma();
  const session = await prisma.matrixRow.findFirst({
    where: { id: sessionId, eventId, archivedAt: null },
    include: {
      fnbRequirements: { orderBy: [{ kind: "asc" }, { code: "asc" }] },
      fnbCatalogAssignments: {
        include: {
          catalogItem: { include: { claims: true } },
          safetyResolutions: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!session) throw new SessionFnbSafetyError("Session not found", 404, "SESSION_NOT_FOUND");

  const activeRequirements = session.fnbRequirements.filter((requirement) =>
    requirement.disposition !== RequirementDisposition.NOT_NEEDED
    && requirement.disposition !== RequirementDisposition.COMPLETE,
  );
  const compatibilityRequirements = activeRequirements.filter((requirement) => requirement.kind !== FnbRequirementKind.ACCESSIBILITY);
  const pairs = session.fnbCatalogAssignments.flatMap((assignment) => {
    const claims = assignment.catalogItem.claims.map((claim) => ({
      kind: claim.kind,
      code: claim.code,
      customLabel: claim.customLabel,
      verificationStatus: claim.verificationStatus,
      evidenceSource: claim.evidenceSource,
    })) as MenuClaim[];
    const stale = assignment.catalogItem.version !== assignment.catalogItemVersion
      || assignment.catalogItem.verificationStatus === FnbVerificationStatus.STALE;

    return compatibilityRequirements.map((requirement) => {
      const safetyRequirement: SafetyRequirement = {
        kind: requirement.kind as "DIETARY" | "ALLERGEN",
        code: requirement.code,
      };
      const compatibility = assessMenuCompatibility(claims, [safetyRequirement], assignment.catalogItem.preparationNotes ? {
        description: assignment.catalogItem.preparationNotes,
        verificationStatus: assignment.catalogItem.modificationStatus,
        evidenceSource: assignment.catalogItem.modificationEvidenceSource,
      } : null);
      const baseOutcome = stale && compatibility.outcome === "VERIFIED_MATCH"
        ? "STALE_VERIFICATION"
        : compatibility.outcome;
      const staleReasonCodes = stale && compatibility.outcome === "VERIFIED_MATCH"
        ? [...compatibility.reasonCodes, "ITEM_VERIFICATION_STALE"]
        : compatibility.reasonCodes;
      const resolution = assignment.safetyResolutions.find((entry) => entry.requirementId === requirement.id) ?? null;
      const resolvedOutcome = operationalOutcome(baseOutcome, resolution);
      const reasonCodes = resolvedOutcome === "VERIFIED_MATCH" && resolution
        ? [...staleReasonCodes, "VERIFIED_ASSIGNMENT_MODIFICATION"]
        : staleReasonCodes;
      return {
        assignmentId: assignment.id,
        requirementId: requirement.id,
        itemId: assignment.catalogItem.id,
        itemName: assignment.catalogItem.itemName,
        itemVersion: assignment.catalogItemVersion,
        currentItemVersion: assignment.catalogItem.version,
        stale,
        baseOutcome,
        outcome: resolvedOutcome,
        reasonCodes: Array.from(new Set(reasonCodes)),
        explanations: Array.from(new Set(reasonCodes)).map(explainCompatibilityReason),
        evidence: compatibility.evidence.map((claim) => ({
          kind: claim.kind,
          code: claim.code,
          customLabel: claim.customLabel,
          verificationStatus: claim.verificationStatus,
          evidenceSource: claim.evidenceSource ?? null,
        })),
        modification: compatibility.modification,
        resolution: resolution ? {
          id: resolution.id,
          outcome: resolution.outcome,
          modification: resolution.modification,
          modificationStatus: resolution.modificationStatus,
          evidenceSource: resolution.evidenceSource,
          resolvedAt: resolution.resolvedAt?.toISOString() ?? null,
        } : null,
        href: `/events/${eventId}/matrix/fnb?item=${assignment.catalogItem.id}`,
      };
    });
  });

  const assignmentSummaries = session.fnbCatalogAssignments.map((assignment) => {
    const assignmentPairs = pairs.filter((pair) => pair.assignmentId === assignment.id);
    const outcome = assignmentPairs.length > 0
      ? worstOutcome(assignmentPairs.map((pair) => pair.outcome))
      : "VERIFIED_MATCH";
    return {
      assignmentId: assignment.id,
      itemId: assignment.catalogItem.id,
      itemName: assignment.catalogItem.itemName,
      itemVersion: assignment.catalogItemVersion,
      currentItemVersion: assignment.catalogItem.version,
      catalogItemSnapshot: assignment.catalogItemSnapshot,
      stale: assignment.catalogItem.version !== assignment.catalogItemVersion
        || assignment.catalogItem.verificationStatus === FnbVerificationStatus.STALE,
      compatibility: {
        outcome,
        reasonCodes: Array.from(new Set(assignmentPairs.flatMap((pair) => pair.reasonCodes))),
      },
      href: `/events/${eventId}/matrix/fnb?item=${assignment.catalogItem.id}`,
    };
  });

  const uncoveredAccessibility = activeRequirements.filter((requirement) => requirement.kind === FnbRequirementKind.ACCESSIBILITY);
  const uncoveredMenuRequirements = compatibilityRequirements.filter((requirement) => {
    const requirementPairs = pairs.filter((pair) => pair.requirementId === requirement.id);
    return requirementPairs.length === 0 || requirementPairs.every((pair) => pair.outcome !== "VERIFIED_MATCH");
  });
  const blockingPairs = pairs.filter((pair) => pair.outcome === "CONFLICT" || pair.outcome === "INSUFFICIENT_INFORMATION");
  const attentionPairs = pairs.filter((pair) => pair.outcome === "POSSIBLE_MATCH" || pair.outcome === "STALE_VERIFICATION");
  const dispositionBlockers = activeRequirements.filter((requirement) => requirement.disposition === RequirementDisposition.MISSING);
  const affectedRequirementIds = new Set([
    ...blockingPairs.map((pair) => pair.requirementId),
    ...attentionPairs.map((pair) => pair.requirementId),
    ...uncoveredMenuRequirements.map((requirement) => requirement.id),
    ...uncoveredAccessibility.map((requirement) => requirement.id),
    ...dispositionBlockers.map((requirement) => requirement.id),
  ]);

  const reasonCodes = Array.from(new Set([
    ...blockingPairs.flatMap((pair) => pair.reasonCodes),
    ...attentionPairs.flatMap((pair) => pair.reasonCodes),
    ...(session.fnbCatalogAssignments.length === 0 && compatibilityRequirements.length > 0 ? ["NO_ASSIGNED_MENU"] : []),
    ...(uncoveredAccessibility.length > 0 ? ["ACCESSIBILITY_NEEDS_REVIEW"] : []),
    ...(dispositionBlockers.length > 0 ? ["REQUIREMENT_MARKED_MISSING"] : []),
  ]));
  const alertSeverity = dispositionBlockers.length > 0 || blockingPairs.length > 0
    || (session.fnbCatalogAssignments.length === 0 && compatibilityRequirements.length > 0)
    ? "BLOCKING"
    : attentionPairs.length > 0 || uncoveredMenuRequirements.length > 0 || uncoveredAccessibility.length > 0
      ? "ATTENTION"
      : "CLEAR";
  const overall: CompatibilityOutcome | "NO_REQUIREMENTS" | "NO_MENU" = activeRequirements.length === 0
    ? "NO_REQUIREMENTS"
    : compatibilityRequirements.length > 0 && session.fnbCatalogAssignments.length === 0
      ? "NO_MENU"
      : pairs.length > 0 || uncoveredAccessibility.length > 0
        ? worstOutcome([
          ...pairs.map((pair) => pair.outcome),
          ...(uncoveredAccessibility.length > 0 ? ["INSUFFICIENT_INFORMATION" as const] : []),
        ])
        : "VERIFIED_MATCH";

  return {
    eventId,
    sessionId,
    overall,
    alert: {
      severity: alertSeverity,
      count: affectedRequirementIds.size,
      title: alertSeverity === "BLOCKING"
        ? "Dietary, allergen, or accessibility action required"
        : alertSeverity === "ATTENTION"
          ? "Dietary, allergen, or accessibility review needed"
          : "Dietary, allergen, and accessibility coverage clear",
      reasonCodes,
      dedupeKey: `${alertSeverity}:${Array.from(affectedRequirementIds).sort().join(",")}`,
    },
    requirements: session.fnbRequirements.map((requirement) => ({
      id: requirement.id,
      kind: requirement.kind,
      code: requirement.code,
      customLabel: requirement.customLabel,
      quantity: requirement.quantity,
      disposition: requirement.disposition,
      dispositionReason: requirement.dispositionReason,
      source: requirement.source,
      href: `/events/${eventId}/matrix/sessions/${sessionId}#fnb`,
    })),
    assignments: assignmentSummaries,
    compatibilityPairs: pairs,
  };
}

export async function upsertSessionFnbRequirement(
  eventId: string,
  sessionId: string,
  actorUserId: string,
  input: Record<string, unknown>,
) {
  const prisma = getPrisma();
  const session = await prisma.matrixRow.findFirst({
    where: { id: sessionId, eventId, archivedAt: null },
    select: { id: true, sessionName: true },
  });
  if (!session) throw new SessionFnbSafetyError("Session not found", 404, "SESSION_NOT_FOUND");

  const kind = String(input.kind || "").toUpperCase() as FnbRequirementKind;
  if (!Object.values(FnbRequirementKind).includes(kind)) throw new SessionFnbSafetyError("kind is invalid");
  let taxonomy: { code: string; customLabel: string | null };
  try {
    taxonomy = kind === FnbRequirementKind.DIETARY
      ? normalizeTaxonomyValue(input, "dietary")
      : kind === FnbRequirementKind.ALLERGEN
        ? normalizeTaxonomyValue(input, "allergen")
        : normalizeAccessibilityValue(input);
  } catch (error) {
    throw new SessionFnbSafetyError(error instanceof Error ? error.message : "requirement code is invalid");
  }

  const disposition = String(input.disposition || "REQUIRED").toUpperCase() as RequirementDisposition;
  if (!Object.values(RequirementDisposition).includes(disposition)) throw new SessionFnbSafetyError("disposition is invalid");
  const reason = optionalText(input.dispositionReason);
  const dispositionAt = new Date();
  try {
    validateDisposition({ disposition, reason, actorUserId, dispositionAt });
  } catch (error) {
    throw new SessionFnbSafetyError(error instanceof Error ? error.message : "disposition is invalid");
  }
  const quantity = input.quantity == null || String(input.quantity).trim() === "" ? null : Number(input.quantity);
  if (quantity != null && (!Number.isInteger(quantity) || quantity <= 0)) {
    throw new SessionFnbSafetyError("quantity must be a positive whole number");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.sessionFnbRequirement.findUnique({
      where: { sessionId_kind_code: { sessionId, kind, code: taxonomy.code } },
    });
    const requirement = await tx.sessionFnbRequirement.upsert({
      where: { sessionId_kind_code: { sessionId, kind, code: taxonomy.code } },
      create: {
        eventId,
        sessionId,
        kind,
        code: taxonomy.code,
        customLabel: taxonomy.customLabel,
        quantity,
        disposition,
        dispositionReason: reason,
        dispositionActorUserId: actorUserId,
        dispositionAt,
        source: optionalText(input.source) ?? "SESSION_FNB_WORKSPACE",
        notes: optionalText(input.notes),
      },
      update: {
        customLabel: taxonomy.customLabel,
        quantity,
        disposition,
        dispositionReason: reason,
        dispositionActorUserId: actorUserId,
        dispositionAt,
        ...(Object.prototype.hasOwnProperty.call(input, "notes") ? { notes: optionalText(input.notes) } : {}),
      },
    });
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: actorUserId },
      module: "RUN_OF_SHOW",
      action: existing ? "STATUS_CHANGED" : "CREATED",
      entityType: "SessionFnbRequirement",
      entityId: requirement.id,
      entityLabel: `${kind}: ${taxonomy.customLabel ?? taxonomy.code}`,
      message: existing
        ? `Session safety requirement updated to ${disposition.replaceAll("_", " ").toLowerCase()}`
        : "Session safety requirement added",
      changes: existing ? [{ field: "disposition", label: "Disposition", from: existing.disposition, to: disposition }] : [],
    });
    return requirement;
  });
}

export async function resolveSessionFnbSafety(
  eventId: string,
  sessionId: string,
  actorUserId: string,
  input: Record<string, unknown>,
) {
  const assignmentId = requiredId(input.assignmentId, "assignmentId");
  const requirementId = requiredId(input.requirementId, "requirementId");
  const action = String(input.action || "").toUpperCase();

  return getPrisma().$transaction(async (tx) => {
    const assignment = await tx.sessionFnbCatalogAssignment.findFirst({
      where: { id: assignmentId, sessionId, catalogItem: { eventId } },
      select: { id: true },
    });
    const requirement = await tx.sessionFnbRequirement.findFirst({
      where: { id: requirementId, sessionId, eventId },
      select: { id: true, code: true, kind: true },
    });
    if (!assignment || !requirement) {
      throw new SessionFnbSafetyError("Assignment or requirement was not found for this event and session", 404, "SAFETY_PAIR_NOT_FOUND");
    }

    if (action === "CLEAR_RESOLUTION") {
      const existing = await tx.sessionFnbAssignmentSafetyResolution.findUnique({
        where: { assignmentId_requirementId: { assignmentId, requirementId } },
      });
      if (existing) {
        await tx.sessionFnbAssignmentSafetyResolution.delete({ where: { id: existing.id } });
        await recordEventActivity(tx, {
          eventId,
          actor: { kind: "USER", userId: actorUserId },
          module: "RUN_OF_SHOW",
          action: "REOPENED",
          entityType: "SessionFnbAssignmentSafetyResolution",
          entityId: existing.id,
          entityLabel: requirement.code,
          message: "Verified menu modification resolution cleared for re-review",
          changes: [{ field: "resolved", label: "Resolved", from: true, to: false }],
        });
      }
      return { cleared: Boolean(existing) };
    }

    if (action !== "VERIFY_MODIFICATION") {
      throw new SessionFnbSafetyError("action must be VERIFY_MODIFICATION or CLEAR_RESOLUTION");
    }
    const modification = optionalText(input.modification);
    const evidenceSource = optionalText(input.evidenceSource);
    if (!modification || !evidenceSource) {
      throw new SessionFnbSafetyError("Verified modification requires modification details and evidence source");
    }
    const resolvedAt = new Date();
    const resolution = await tx.sessionFnbAssignmentSafetyResolution.upsert({
      where: { assignmentId_requirementId: { assignmentId, requirementId } },
      create: {
        eventId,
        sessionId,
        assignmentId,
        requirementId,
        outcome: FnbCompatibilityOutcome.VERIFIED_MATCH,
        reasonCodes: ["VERIFIED_ASSIGNMENT_MODIFICATION"],
        modification,
        modificationStatus: FnbVerificationStatus.VERIFIED,
        evidenceSource,
        resolvedByUserId: actorUserId,
        resolvedAt,
      },
      update: {
        outcome: FnbCompatibilityOutcome.VERIFIED_MATCH,
        reasonCodes: ["VERIFIED_ASSIGNMENT_MODIFICATION"],
        modification,
        modificationStatus: FnbVerificationStatus.VERIFIED,
        evidenceSource,
        resolvedByUserId: actorUserId,
        resolvedAt,
      },
    });
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: actorUserId },
      module: "RUN_OF_SHOW",
      action: "APPROVED",
      entityType: "SessionFnbAssignmentSafetyResolution",
      entityId: resolution.id,
      entityLabel: requirement.code,
      message: "Verified assignment-specific menu modification",
      changes: [{ field: "resolved", label: "Resolved", from: false, to: true }],
    });
    return resolution;
  });
}
