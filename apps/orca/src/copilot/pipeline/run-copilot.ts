/* eslint-disable @typescript-eslint/no-explicit-any */
import { answerAskPrompt } from "@/lib/copilot/ask";
import { CopilotParseError, buildProposedActionFromExtraction, parseDoPromptToAction } from "@/lib/copilot/parse-do";
import { COPILOT_ACTION_REGISTRY } from "@/lib/copilot/registry";
import { MATRIX_DO_CLARIFICATION_THRESHOLD, resolveMatrixDoAction } from "@/lib/copilot/matrix-resolver";
import { FEATURES } from "@/config/features";
import type { MatrixCopilotActionType } from "@/lib/copilot/types";
import {
  getCapabilitiesForSurfaceMode,
  getCapabilityDefinitionsForSurfaceMode,
  isCapabilityAllowedForSurface,
} from "@/src/copilot/capabilities/capability-registry";
import { buildCopilotContext } from "@/src/copilot/context/build-copilot-context";
import type { CopilotContext } from "@/src/copilot/context/copilot-context";
import { normalizeCopilotResult, type CopilotResolutionResult } from "@/src/copilot/pipeline/normalize-copilot-result";

export type RunCopilotInput = {
  prompt: string;
  mode: "ask" | "do";
  surface: string;
  eventId?: string;
  entityId?: string;
  entityType?: string;
  selectionState?: Record<string, any>;
  userId?: string;
};

export type RunCopilotResult =
  | {
      kind: "proposal";
      proposal: {
        actionType: string;
        title: string;
        summary?: string;
        params: Record<string, any>;
      };
      telemetry?: any;
    }
  | {
      kind: "clarification";
      question: string;
      missing?: string[];
      suggestions?: string[];
      telemetry?: any;
    }
  | {
      kind: "answer";
      message: string;
      telemetry?: any;
    };

type InternalResolution = CopilotResolutionResult;

const MATRIX_RESOLVER_SUPPORTED_CAPABILITIES: MatrixCopilotActionType[] = [
  "room.create",
  "room.update",
  "session.create",
  "session.move",
];

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function inferMissingFieldsForMatrix(input: {
  capability: string | null;
  params: Record<string, unknown>;
}): string[] {
  const missing: string[] = [];

  if (input.capability === "room.create" && !toText(input.params.roomName)) {
    missing.push("roomName");
  }

  if (input.capability === "room.update") {
    if (!toText(input.params.roomId) && !toText(input.params.roomName)) {
      missing.push("roomTarget");
    }
    if (!toText(input.params.newName) && typeof input.params.capacity !== "number") {
      missing.push("newNameOrCapacity");
    }
  }

  if (input.capability === "session.create") {
    if (!toText(input.params.sessionName)) missing.push("sessionName");
    if (!toText(input.params.startTime)) missing.push("startTime");
  }

  if (input.capability === "session.move") {
    if (!toText(input.params.sessionId) && !toText(input.params.sessionName)) missing.push("sessionTarget");
    if (!toText(input.params.roomId) && !toText(input.params.roomName)) missing.push("roomTarget");
    if (!toText(input.params.startTime)) missing.push("startTime");
  }

  return missing;
}

function defaultSuggestions(capabilities: string[]): string[] {
  if (capabilities.length > 0) {
    return capabilities.slice(0, 6).map((capability) => `Try ${capability}`);
  }
  return ["Tell me what you want to change on this page."];
}

function normalizeSurface(surface: string): string {
  return surface.trim().toLowerCase();
}

function surfaceDisplayName(surface: string): string {
  const normalized = normalizeSurface(surface);
  if (normalized === "matrix-2") return "Matrix";
  return normalized
    .split("-")
    .map((chunk) => (chunk.length > 0 ? chunk[0]!.toUpperCase() + chunk.slice(1) : chunk))
    .join(" ");
}

function buildSurfaceBlockedQuestion(surface: string, allowedCapabilities: string[]): string {
  const displaySurface = surfaceDisplayName(surface);
  const doDefinitions = getCapabilityDefinitionsForSurfaceMode(surface, "do");

  if (doDefinitions.length > 0) {
    const summaries = doDefinitions
      .slice(0, 3)
      .map((definition) => definition.description.toLowerCase());
    const joined = summaries.join(", ");
    return `I can't do that from the ${displaySurface} page yet. I can help with ${joined} here.`;
  }

  if (allowedCapabilities.length > 0) {
    return `I can't do that from the ${displaySurface} page yet. I can help with ${allowedCapabilities.join(", ")} here.`;
  }

  return `I can't do that from the ${displaySurface} page yet.`;
}

function resolveAllowedCapabilities(context: CopilotContext, mode: "ask" | "do"): string[] {
  const registryCapabilities = getCapabilitiesForSurfaceMode(context.surface, mode);
  const contextCapabilities = (context.availableCapabilities ?? []).filter((capability) =>
    isCapabilityAllowedForSurface(context.surface, capability),
  );

  if (contextCapabilities.length === 0) {
    return registryCapabilities;
  }

  const intersection = contextCapabilities.filter((capability) => registryCapabilities.includes(capability));
  return intersection.length > 0 ? intersection : registryCapabilities;
}

function shouldUseMatrixResolver(input: {
  surface: string;
  allowedCapabilities: string[];
}): boolean {
  const normalizedSurface = normalizeSurface(input.surface);
  if (normalizedSurface === "matrix" || normalizedSurface === "matrix-2") return true;
  const capabilitySet = new Set(input.allowedCapabilities);
  return MATRIX_RESOLVER_SUPPORTED_CAPABILITIES.some((capability) => capabilitySet.has(capability));
}

function toMatrixCapabilities(capabilities: string[]): MatrixCopilotActionType[] {
  return capabilities.filter((capability): capability is MatrixCopilotActionType =>
    MATRIX_RESOLVER_SUPPORTED_CAPABILITIES.includes(capability as MatrixCopilotActionType),
  );
}

function actionTitle(actionType: string): string {
  return COPILOT_ACTION_REGISTRY[actionType as keyof typeof COPILOT_ACTION_REGISTRY]?.label ?? actionType;
}

async function resolvePrompt(input: {
  prompt: string;
  mode: "ask" | "do";
  context: CopilotContext;
  allowedCapabilities: string[];
}): Promise<InternalResolution> {
  if (input.mode === "ask") {
    const answer = await answerAskPrompt({
      orgId: input.context.orgId ?? "",
      eventId: input.context.eventId,
      prompt: input.prompt,
      context: input.context,
    });

    return {
      kind: "answer",
      message: answer.message,
      telemetry: {
        resolvedCapability: null,
        clarificationRequired: false,
      },
    };
  }

  if (shouldUseMatrixResolver({
    surface: input.context.surface,
    allowedCapabilities: input.allowedCapabilities,
  })) {
    const matrixCapabilities = toMatrixCapabilities(input.allowedCapabilities);

    const resolution = await resolveMatrixDoAction({
      mode: "do",
      prompt: input.prompt,
      context: {
        eventId: input.context.eventId,
        module: input.context.surface,
      },
      availableCapabilities: matrixCapabilities.length > 0
        ? matrixCapabilities
        : [...MATRIX_RESOLVER_SUPPORTED_CAPABILITIES],
    });

    if (
      resolution.capability &&
      (!isCapabilityAllowedForSurface(input.context.surface, resolution.capability) ||
        !input.allowedCapabilities.includes(resolution.capability))
    ) {
      console.warn("copilot.capability.mismatch", {
        surface: input.context.surface,
        mode: input.mode,
        eventId: input.context.eventId ?? null,
        entityType: input.context.entityType ?? null,
        requestedCapability: resolution.capability,
        allowedCapabilitiesCount: input.allowedCapabilities.length,
      });

      console.info("copilot.capability.blocked", {
        surface: input.context.surface,
        mode: input.mode,
        eventId: input.context.eventId ?? null,
        entityType: input.context.entityType ?? null,
        requestedCapability: resolution.capability,
        allowedCapabilitiesCount: input.allowedCapabilities.length,
      });

      return {
        kind: "clarification",
        question: buildSurfaceBlockedQuestion(input.context.surface, input.allowedCapabilities),
        suggestions: defaultSuggestions(input.allowedCapabilities),
        telemetry: {
          resolvedCapability: resolution.capability,
          confidence: resolution.confidence,
          clarificationRequired: true,
          reasoningSummary: "Resolver returned a capability that is not registered for this surface.",
        },
      };
    }

    const clarificationRequired =
      resolution.needsClarification ||
      !resolution.capability ||
      resolution.confidence < MATRIX_DO_CLARIFICATION_THRESHOLD;

    if (clarificationRequired) {
      const missing = inferMissingFieldsForMatrix({
        capability: resolution.capability,
        params: resolution.params,
      });

      return {
        kind: "clarification",
        question: resolution.clarifyingQuestion ?? "Can you clarify your request?",
        ...(missing.length > 0 ? { missing } : {}),
        suggestions: defaultSuggestions(input.allowedCapabilities),
        telemetry: {
          resolvedCapability: resolution.capability,
          confidence: resolution.confidence,
          clarificationRequired: true,
          reasoningSummary: resolution.reasoningSummary,
        },
      };
    }

    const capability = resolution.capability;
    if (!capability) {
      throw new CopilotParseError("Resolver did not return a capability.", 400);
    }

    const proposedAction = buildProposedActionFromExtraction({
      extracted: {
        actionType: capability,
        params: resolution.params,
        summary: resolution.reasoningSummary,
      },
      orgId: input.context.orgId ?? "",
      eventId: input.context.eventId,
    });

    console.info("copilot.capability.allowed", {
      surface: input.context.surface,
      mode: input.mode,
      eventId: input.context.eventId ?? null,
      entityType: input.context.entityType ?? null,
      requestedCapability: capability,
      allowedCapabilitiesCount: input.allowedCapabilities.length,
    });

    return {
      kind: "proposal",
      proposal: {
        actionType: proposedAction.actionType,
        title: actionTitle(proposedAction.actionType),
        summary: proposedAction.summary,
        params: proposedAction.params,
      },
      telemetry: {
        resolvedCapability: capability,
        clarificationRequired: false,
        confidence: resolution.confidence,
        proposedAction,
      },
    };
  }

  try {
    const proposedAction = await parseDoPromptToAction({
      prompt: input.prompt,
      orgId: input.context.orgId ?? "",
      eventId: input.context.eventId,
      context: input.context,
    });

    if (
      !isCapabilityAllowedForSurface(input.context.surface, proposedAction.actionType) ||
      !input.allowedCapabilities.includes(proposedAction.actionType)
    ) {
      console.info("copilot.capability.blocked", {
        surface: input.context.surface,
        mode: input.mode,
        eventId: input.context.eventId ?? null,
        entityType: input.context.entityType ?? null,
        requestedCapability: proposedAction.actionType,
        allowedCapabilitiesCount: input.allowedCapabilities.length,
      });

      return {
        kind: "clarification",
        question: buildSurfaceBlockedQuestion(input.context.surface, input.allowedCapabilities),
        suggestions: defaultSuggestions(input.allowedCapabilities),
        telemetry: {
          resolvedCapability: proposedAction.actionType,
          clarificationRequired: true,
        },
      };
    }

    console.info("copilot.capability.allowed", {
      surface: input.context.surface,
      mode: input.mode,
      eventId: input.context.eventId ?? null,
      entityType: input.context.entityType ?? null,
      requestedCapability: proposedAction.actionType,
      allowedCapabilitiesCount: input.allowedCapabilities.length,
    });

    return {
      kind: "proposal",
      proposal: {
        actionType: proposedAction.actionType,
        title: actionTitle(proposedAction.actionType),
        summary: proposedAction.summary,
        params: proposedAction.params,
      },
      telemetry: {
        resolvedCapability: proposedAction.actionType,
        clarificationRequired: false,
        proposedAction,
      },
    };
  } catch (error) {
    if (error instanceof CopilotParseError) {
      return {
        kind: "clarification",
        question: error.message,
        suggestions: defaultSuggestions(input.allowedCapabilities),
        telemetry: {
          resolvedCapability: null,
          clarificationRequired: true,
        },
      };
    }

    throw error;
  }
}

export async function runCopilot(input: RunCopilotInput): Promise<RunCopilotResult> {
  if (!FEATURES.COPILOT_ENABLED) {
    return {
      kind: "answer",
      message: "Copilot is temporarily disabled.",
    };
  }

  const startedMeta = {
    surface: input.surface,
    mode: input.mode,
    eventId: input.eventId ?? null,
    entityType: input.entityType ?? null,
    resolvedCapability: null,
    clarificationRequired: null,
    resultKind: null,
  };
  console.info("copilot.run.started", startedMeta);

  try {
    const context = await buildCopilotContext({
      mode: input.mode,
      surface: input.surface,
      eventId: input.eventId,
      entityId: input.entityId,
      entityType: input.entityType,
      selectionState: input.selectionState,
      userId: input.userId,
    });

    const allowedCapabilities = resolveAllowedCapabilities(context, input.mode);
    console.info("copilot.capabilities.loaded", {
      surface: context.surface,
      mode: input.mode,
      eventId: context.eventId ?? null,
      entityType: context.entityType ?? null,
      requestedCapability: null,
      allowedCapabilitiesCount: allowedCapabilities.length,
    });

    const resolution = await resolvePrompt({
      prompt: input.prompt,
      mode: input.mode,
      context,
      allowedCapabilities,
    });

    console.info("copilot.resolution.completed", {
      surface: context.surface,
      mode: input.mode,
      eventId: context.eventId ?? null,
      entityType: context.entityType ?? null,
      resolvedCapability: resolution.telemetry?.resolvedCapability ?? null,
      clarificationRequired: resolution.telemetry?.clarificationRequired ?? (resolution.kind === "clarification"),
      resultKind: resolution.kind,
    });

    const normalized = normalizeCopilotResult({
      ...resolution,
      telemetry: {
        ...(resolution.telemetry ?? {}),
        surface: context.surface,
        mode: input.mode,
        eventId: context.eventId ?? null,
        entityType: context.entityType ?? null,
      },
    }) as RunCopilotResult;

    console.info("copilot.result.normalized", {
      surface: context.surface,
      mode: input.mode,
      eventId: context.eventId ?? null,
      entityType: context.entityType ?? null,
      resolvedCapability: (normalized.telemetry as any)?.resolvedCapability ?? null,
      clarificationRequired: normalized.kind === "clarification",
      resultKind: normalized.kind,
    });

    return normalized;
  } catch (error) {
    console.error("copilot.run.failed", {
      ...startedMeta,
      message: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
}
