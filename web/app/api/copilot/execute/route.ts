import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import {
  ACTIVE_ORG_COOKIE_NAME,
  ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  ORGANIZATION_SELECTION_COOKIE_NAME,
  resolveRequestUser,
} from "@/lib/request-user";
import { CopilotAuditError } from "@/lib/copilot/audit";
import { runCopilotExecution, CopilotOrchestratorError } from "@/lib/copilot/orchestrator";
import type { CopilotExecuteRequest } from "@/lib/copilot/types";

export const runtime = "nodejs";

function applyActiveOrgCookie(response: NextResponse, activeOrgId: string | undefined) {
  if (!activeOrgId) return;

  response.cookies.set({
    name: ACTIVE_ORG_COOKIE_NAME,
    value: activeOrgId,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  });
}

function applyOrganizationSelectionCookie(response: NextResponse, activeOrgId: string | undefined) {
  if (!activeOrgId) return;

  response.cookies.set({
    name: ORGANIZATION_SELECTION_COOKIE_NAME,
    value: activeOrgId,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  });
}

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof CopilotAuditError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        operation: error.operation,
      },
      { status: error.status },
    );
  }

  if (error instanceof CopilotOrchestratorError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022") &&
    error.message.toLowerCase().includes("copilotauditlog")
  ) {
    return NextResponse.json(
      {
        error: "Copilot audit schema mismatch. Run the latest Prisma migration to enable Copilot.",
        code: error.code,
      },
      { status: 503 },
    );
  }

  if (error instanceof Error) {
    console.error(`${context} failed`, {
      message: error.message,
      stack: error.stack,
    });
  } else {
    console.error(`${context} failed`, error);
  }

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function postHandler(request: NextRequest) {
  const currentUserResult = await resolveRequestUser(request);
  if ("error" in currentUserResult) {
    return NextResponse.json(
      { error: `Unauthorized: ${currentUserResult.error.reason}` },
      { status: currentUserResult.error.status },
    );
  }

  const user = currentUserResult.user;
  if (!user.orgId) {
    return NextResponse.json({ error: "Active organization context is required" }, { status: 400 });
  }

  let body: CopilotExecuteRequest;
  try {
    body = (await request.json()) as CopilotExecuteRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.auditLogId !== "string" || !body.auditLogId.trim()) {
    return NextResponse.json({ error: "auditLogId is required" }, { status: 400 });
  }

  if (typeof body.approved !== "boolean") {
    return NextResponse.json({ error: "approved must be boolean" }, { status: 400 });
  }

  try {
    const payload = await runCopilotExecution({
      actor: {
        userId: user.id,
        orgId: user.orgId,
        role: user.role,
      },
      auditLogId: body.auditLogId,
      approved: body.approved,
    });

    const response = NextResponse.json(payload);
    applyActiveOrgCookie(response, user.activeOrgIdCookieToSet);
    applyOrganizationSelectionCookie(response, user.organizationSelectionCookieToSet);
    return response;
  } catch (error) {
    return toErrorResponse(error, "POST /api/copilot/execute");
  }
}

const postWithLogging = withApiRequestLogging("POST /api/copilot/execute", postHandler);

export async function POST(request: NextRequest) {
  return postWithLogging(request, undefined);
}
