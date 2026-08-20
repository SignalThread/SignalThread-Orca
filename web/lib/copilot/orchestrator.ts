import type { UserRole } from "@prisma/client";
import { createCopilotAuditLog, getCopilotAuditLogById, updateCopilotAuditLog } from "@/lib/copilot/audit";
import { executeProposedAction, CopilotExecutionError } from "@/lib/copilot/actions";
import { checkCopilotPermission } from "@/lib/copilot/permissions";
import { runCopilot } from "@/src/copilot/pipeline/run-copilot";
import type {
  CopilotChatResponse,
  CopilotClientContext,
  CopilotExecuteResponse,
  MatrixCopilotActionType,
  CopilotMode,
  ProposedAction,
} from "@/lib/copilot/types";

export class CopilotOrchestratorError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type CopilotActor = {
  userId: string;
  orgId: string;
  role: UserRole;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProposedAction(value: unknown): value is ProposedAction {
  if (!isRecord(value)) return false;
  if (typeof value.actionType !== "string") return false;
  if (!isRecord(value.scope) || typeof value.scope.orgId !== "string") return false;
  if (!isRecord(value.params)) return false;
  if (typeof value.summary !== "string") return false;
  return true;
}

function normalizeContext(input: CopilotClientContext | undefined): CopilotClientContext {
  if (!input) return {};
  return {
    ...(typeof input.surface === "string" && input.surface.trim() ? { surface: input.surface.trim() } : {}),
    ...(typeof input.eventId === "string" && input.eventId.trim() ? { eventId: input.eventId.trim() } : {}),
    ...(typeof input.entityType === "string" && input.entityType.trim() ? { entityType: input.entityType.trim() } : {}),
    ...(typeof input.entityId === "string" && input.entityId.trim() ? { entityId: input.entityId.trim() } : {}),
    ...(typeof input.pagePath === "string" ? { pagePath: input.pagePath.trim() } : {}),
    ...(typeof input.module === "string" ? { module: input.module.trim() } : {}),
    ...(input.selectionState && typeof input.selectionState === "object" ? { selectionState: input.selectionState } : {}),
    ...(Array.isArray(input.availableCapabilities) ? { availableCapabilities: input.availableCapabilities } : {}),
    ...(Array.isArray(input.userIntentHints) ? { userIntentHints: input.userIntentHints } : {}),
  };
}

function asMatrixCapability(value: unknown): MatrixCopilotActionType | null {
  if (value === "room.create" || value === "room.update" || value === "session.create" || value === "session.move") {
    return value;
  }
  return null;
}

function readTelemetryEventId(telemetry: unknown): string | undefined {
  if (!isRecord(telemetry)) return undefined;
  const value = telemetry.eventId;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export async function runCopilotChat(input: {
  actor: CopilotActor;
  mode: CopilotMode;
  prompt: string;
  context?: CopilotClientContext;
}): Promise<CopilotChatResponse> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new CopilotOrchestratorError("Prompt is required.", 400);
  }

  const clientContext = normalizeContext(input.context);
  const surface = clientContext.surface ?? clientContext.module ?? "global";
  const eventIdFromRequest = clientContext.eventId;

  if (input.mode === "ask") {
    const permission = await checkCopilotPermission({
      actor: {
        userId: input.actor.userId,
        orgId: input.actor.orgId,
        role: input.actor.role,
      },
      mode: "ask",
      eventId: eventIdFromRequest,
    });

    if (!permission.ok) {
      const audit = await createCopilotAuditLog({
        userId: input.actor.userId,
        orgId: input.actor.orgId,
        eventId: eventIdFromRequest,
        mode: "ASK",
        rawPrompt: prompt,
        approved: false,
        executed: false,
        status: "REJECTED",
        errorMessage: permission.hint ?? permission.reason ?? "Ask mode permission denied",
      });

      void audit;
      throw new CopilotOrchestratorError(permission.hint ?? "Ask mode permission denied", 403);
    }
  }

  let pipelineResult: Awaited<ReturnType<typeof runCopilot>>;
  try {
    pipelineResult = await runCopilot({
      prompt,
      mode: input.mode,
      surface,
      eventId: eventIdFromRequest,
      entityId: clientContext.entityId,
      entityType: clientContext.entityType,
      selectionState: clientContext.selectionState as Record<string, unknown> | undefined,
      userId: input.actor.userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse Copilot action";
    const status = error instanceof CopilotOrchestratorError ? error.status : 500;
    const auditMode = input.mode === "ask" ? "ASK" : "DO";
    const audit = await createCopilotAuditLog({
      userId: input.actor.userId,
      orgId: input.actor.orgId,
      eventId: eventIdFromRequest,
      mode: auditMode,
      rawPrompt: prompt,
      approved: false,
      executed: false,
      status: "REJECTED",
      errorMessage: message,
    });

    throw new CopilotOrchestratorError(`${message} (audit: ${audit.id})`, status);
  }

  const telemetry = isRecord(pipelineResult.telemetry) ? pipelineResult.telemetry : {};
  const resolvedEventId = readTelemetryEventId(telemetry) ?? eventIdFromRequest;

  if (pipelineResult.kind === "answer") {
    const audit = await createCopilotAuditLog({
      userId: input.actor.userId,
      orgId: input.actor.orgId,
      eventId: resolvedEventId,
      mode: "ASK",
      rawPrompt: prompt,
      approved: false,
      executed: true,
      status: "EXECUTED",
      resultSummary: pipelineResult.message,
    });

    return {
      kind: "answer",
      auditLogId: audit.id,
      message: pipelineResult.message,
    };
  }

  if (pipelineResult.kind === "clarification") {
    const resolvedCapability = asMatrixCapability(telemetry.resolvedCapability);
    const reasoningSummary = typeof telemetry.reasoningSummary === "string"
      ? telemetry.reasoningSummary
      : pipelineResult.question;
    const confidence = typeof telemetry.confidence === "number" ? telemetry.confidence : 0;

    const audit = await createCopilotAuditLog({
      userId: input.actor.userId,
      orgId: input.actor.orgId,
      eventId: resolvedEventId,
      mode: "DO",
      rawPrompt: prompt,
      actionType: resolvedCapability ?? undefined,
      approved: false,
      executed: false,
      status: "REJECTED",
      errorMessage: pipelineResult.question,
      resultSummary: reasoningSummary,
    });

    return {
      kind: "clarification",
      auditLogId: audit.id,
      message: pipelineResult.question,
      capability: resolvedCapability,
      confidence,
      reasoningSummary,
    };
  }

  const proposedActionValue = telemetry.proposedAction;
  if (!isProposedAction(proposedActionValue)) {
    const audit = await createCopilotAuditLog({
      userId: input.actor.userId,
      orgId: input.actor.orgId,
      eventId: resolvedEventId,
      mode: "DO",
      rawPrompt: prompt,
      approved: false,
      executed: false,
      status: "FAILED",
      errorMessage: "Pipeline proposal is missing executable action payload.",
    });

    throw new CopilotOrchestratorError(`Pipeline proposal is invalid. (audit: ${audit.id})`, 500);
  }

  const proposedAction: ProposedAction = proposedActionValue;

  const permission = await checkCopilotPermission({
    actor: {
      userId: input.actor.userId,
      orgId: input.actor.orgId,
      role: input.actor.role,
    },
    mode: "do",
    actionType: proposedAction.actionType,
    eventId: proposedAction.scope.eventId,
  });

  if (!permission.ok) {
    proposedAction.validationMessages = [
      ...proposedAction.validationMessages,
      permission.hint ?? permission.reason ?? "Permission denied",
    ];
  }

  const canExecute = permission.ok && proposedAction.validationMessages.length === 0;

  const audit = await createCopilotAuditLog({
    userId: input.actor.userId,
    orgId: input.actor.orgId,
    eventId: proposedAction.scope.eventId,
    mode: "DO",
    rawPrompt: prompt,
    actionType: proposedAction.actionType,
    proposedAction,
    approved: false,
    executed: false,
    status: canExecute ? "PROPOSED" : "REJECTED",
    ...(canExecute ? {} : { errorMessage: proposedAction.validationMessages.join(" ") || "Action is not executable." }),
  });

  return {
    kind: "proposal",
    auditLogId: audit.id,
    canExecute,
    proposedAction,
    ...(canExecute
      ? {}
      : {
          message: "This action needs fixes before approval. Check validation warnings.",
        }),
  };
}

export async function runCopilotExecution(input: {
  actor: CopilotActor;
  auditLogId: string;
  approved: boolean;
}): Promise<CopilotExecuteResponse> {
  const audit = await getCopilotAuditLogById({
    id: input.auditLogId,
    userId: input.actor.userId,
    orgId: input.actor.orgId,
  });

  if (!audit) {
    throw new CopilotOrchestratorError("Copilot action was not found.", 404);
  }

  if (audit.mode !== "DO") {
    throw new CopilotOrchestratorError("Only Do-mode actions can be executed.", 400);
  }

  if (!input.approved) {
    await updateCopilotAuditLog({
      id: audit.id,
      approved: false,
      executed: false,
      status: "REJECTED",
      resultSummary: "Rejected by user.",
      errorMessage: null,
    });

    return {
      auditLogId: audit.id,
      status: "rejected",
      message: "Action canceled.",
      resultSummary: "Rejected by user.",
    };
  }

  if (!isProposedAction(audit.proposedActionJson)) {
    await updateCopilotAuditLog({
      id: audit.id,
      approved: true,
      executed: false,
      status: "FAILED",
      errorMessage: "Stored proposed action is invalid.",
    });
    throw new CopilotOrchestratorError("Stored proposed action is invalid.", 500);
  }

  const proposedAction = audit.proposedActionJson;
  const permission = await checkCopilotPermission({
    actor: {
      userId: input.actor.userId,
      orgId: input.actor.orgId,
      role: input.actor.role,
    },
    mode: "do",
    actionType: proposedAction.actionType,
    eventId: proposedAction.scope.eventId,
  });

  if (!permission.ok) {
    const message = permission.hint ?? permission.reason ?? "Permission denied";
    await updateCopilotAuditLog({
      id: audit.id,
      approved: true,
      executed: false,
      status: "FAILED",
      errorMessage: message,
    });

    throw new CopilotOrchestratorError(message, 403);
  }

  if (proposedAction.validationMessages.length > 0) {
    const message = proposedAction.validationMessages.join(" ");
    await updateCopilotAuditLog({
      id: audit.id,
      approved: true,
      executed: false,
      status: "FAILED",
      errorMessage: message,
    });

    throw new CopilotOrchestratorError(message, 400);
  }

  await updateCopilotAuditLog({
    id: audit.id,
    approved: true,
    executed: false,
    status: "APPROVED",
    errorMessage: null,
  });

  try {
    const result = await executeProposedAction(proposedAction);

    await updateCopilotAuditLog({
      id: audit.id,
      approved: true,
      executed: true,
      status: "EXECUTED",
      resultSummary: result.summary,
      errorMessage: null,
    });

    return {
      auditLogId: audit.id,
      status: "executed",
      message: "Action executed successfully.",
      resultSummary: result.summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action execution failed";

    await updateCopilotAuditLog({
      id: audit.id,
      approved: true,
      executed: false,
      status: "FAILED",
      errorMessage: message,
    });

    if (error instanceof CopilotExecutionError) {
      throw new CopilotOrchestratorError(error.message, error.status);
    }

    throw new CopilotOrchestratorError(message, 500);
  }
}
