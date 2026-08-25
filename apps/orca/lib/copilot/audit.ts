import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { ProposedAction } from "@/lib/copilot/types";

export type CopilotAuditStatus = "PROPOSED" | "APPROVED" | "EXECUTED" | "FAILED" | "REJECTED";
export type CopilotAuditMode = "ASK" | "DO";

type CopilotAuditOperation = "create" | "read" | "update";

export class CopilotAuditError extends Error {
  status: number;
  code: string;
  operation: CopilotAuditOperation;

  constructor(input: {
    message: string;
    status: number;
    code: string;
    operation: CopilotAuditOperation;
  }) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
    this.operation = input.operation;
  }
}

function isCopilotAuditSchemaDrift(error: Prisma.PrismaClientKnownRequestError): boolean {
  const message = error.message.toLowerCase();
  const referencesAuditTable = message.includes("copilotauditlog") || message.includes("copilot audit");

  return (
    (error.code === "P2021" && referencesAuditTable) ||
    (error.code === "P2022" && referencesAuditTable) ||
    (error.code === "P2010" && referencesAuditTable)
  );
}

function toCopilotAuditError(error: unknown, operation: CopilotAuditOperation): CopilotAuditError {
  if (error instanceof CopilotAuditError) {
    return error;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (isCopilotAuditSchemaDrift(error)) {
      return new CopilotAuditError({
        message: "Copilot audit schema mismatch. Apply the Copilot audit Prisma migration.",
        status: 503,
        code: error.code,
        operation,
      });
    }

    return new CopilotAuditError({
      message: "Copilot audit persistence failed.",
      status: 500,
      code: error.code,
      operation,
    });
  }

  return new CopilotAuditError({
    message: "Copilot audit persistence failed.",
    status: 500,
    code: "COPILOT_AUDIT_UNKNOWN",
    operation,
  });
}

function logCopilotAuditError(error: unknown, operation: CopilotAuditOperation, context?: Record<string, unknown>) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("[copilot/audit] prisma failure", {
      operation,
      code: error.code,
      message: error.message,
      meta: error.meta,
      ...context,
    });
    return;
  }

  if (error instanceof Error) {
    console.error("[copilot/audit] failure", {
      operation,
      message: error.message,
      stack: error.stack,
      ...context,
    });
    return;
  }

  console.error("[copilot/audit] failure", {
    operation,
    error,
    ...context,
  });
}

export async function createCopilotAuditLog(input: {
  userId: string;
  orgId: string;
  eventId?: string;
  mode: CopilotAuditMode;
  rawPrompt: string;
  actionType?: string;
  proposedAction?: ProposedAction | null;
  approved: boolean;
  executed: boolean;
  status: CopilotAuditStatus;
  resultSummary?: string | null;
  errorMessage?: string | null;
}): Promise<{ id: string }> {
  try {
    const created = await getPrisma().copilotAuditLog.create({
      data: {
        userId: input.userId,
        orgId: input.orgId,
        eventId: input.eventId ?? null,
        mode: input.mode,
        rawPrompt: input.rawPrompt,
        actionType: input.actionType ?? null,
        proposedActionJson: input.proposedAction
          ? (input.proposedAction as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        approved: input.approved,
        executed: input.executed,
        status: input.status,
        resultSummary: input.resultSummary ?? null,
        errorMessage: input.errorMessage ?? null,
      },
      select: {
        id: true,
      },
    });

    return created;
  } catch (error) {
    logCopilotAuditError(error, "create", {
      userId: input.userId,
      orgId: input.orgId,
      eventId: input.eventId ?? null,
      mode: input.mode,
      status: input.status,
    });
    throw toCopilotAuditError(error, "create");
  }
}

export async function getCopilotAuditLogById(input: {
  id: string;
  userId: string;
  orgId: string;
}) {
  try {
    return getPrisma().copilotAuditLog.findFirst({
      where: {
        id: input.id,
        userId: input.userId,
        orgId: input.orgId,
      },
      select: {
        id: true,
        userId: true,
        orgId: true,
        eventId: true,
        mode: true,
        rawPrompt: true,
        actionType: true,
        proposedActionJson: true,
        approved: true,
        executed: true,
        status: true,
      },
    });
  } catch (error) {
    logCopilotAuditError(error, "read", {
      id: input.id,
      userId: input.userId,
      orgId: input.orgId,
    });
    throw toCopilotAuditError(error, "read");
  }
}

export async function updateCopilotAuditLog(input: {
  id: string;
  approved?: boolean;
  executed?: boolean;
  status?: CopilotAuditStatus;
  resultSummary?: string | null;
  errorMessage?: string | null;
}) {
  try {
    return getPrisma().copilotAuditLog.update({
      where: { id: input.id },
      data: {
        ...(typeof input.approved === "boolean" ? { approved: input.approved } : {}),
        ...(typeof input.executed === "boolean" ? { executed: input.executed } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "resultSummary") ? { resultSummary: input.resultSummary ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "errorMessage") ? { errorMessage: input.errorMessage ?? null } : {}),
      },
      select: {
        id: true,
      },
    });
  } catch (error) {
    logCopilotAuditError(error, "update", {
      id: input.id,
      status: input.status,
    });
    throw toCopilotAuditError(error, "update");
  }
}
