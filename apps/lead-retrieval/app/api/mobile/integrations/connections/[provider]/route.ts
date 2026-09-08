import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeMobileIntegrationRequest } from "@/lib/integrations/mobile-oauth/authorization";
import { disconnectGoogleWorkspaceConnection } from "@/lib/integrations/google/connection-service";
import { disconnectMicrosoft365Connection } from "@/lib/integrations/microsoft/connection-service";
import {
  MOBILE_OAUTH_PROVIDER,
  isMobileOAuthProvider
} from "@/lib/integrations/mobile-oauth/bridge-core";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const requestId = randomUUID();
  console.info("[mobile-integration-disconnect]", {
    requestId,
    phase: "request_started",
    method: "DELETE"
  });
  try {
    const authorization = await authorizeMobileIntegrationRequest(request);
    if (!authorization.ok) {
      console.warn("[mobile-integration-disconnect]", {
        requestId,
        phase: "request_rejected",
        httpStatus: authorization.status,
        category: authorization.status === 401 ? "authentication" : "authorization"
      });
      return NextResponse.json(
        {
          error: authorization.error,
          category: authorization.status === 401 ? "authentication" : "authorization"
        },
        { status: authorization.status }
      );
    }
    const provider = (await params).provider;
    if (!isMobileOAuthProvider(provider)) {
      console.warn("[mobile-integration-disconnect]", {
        requestId,
        phase: "request_rejected",
        httpStatus: 404,
        category: "unsupported_provider"
      });
      return NextResponse.json(
        { error: "Unsupported integration provider.", category: "unsupported_provider" },
        { status: 404 }
      );
    }
    const session = authorization.context;
    const disconnectConnection =
      provider === MOBILE_OAUTH_PROVIDER
        ? disconnectGoogleWorkspaceConnection
        : disconnectMicrosoft365Connection;
    const result = await disconnectConnection({
      userId: session.userId,
      companyId: session.companyId
    });
    const state = "disconnected";
    console.info("[mobile-integration-disconnect]", {
      requestId,
      phase: "request_completed",
      httpStatus: 200,
      state
    });
    return NextResponse.json(
      {
        provider,
        state,
        disconnected: result.disconnected,
        revocationPending: result.revocationPending
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[mobile-integration-disconnect]", {
      requestId,
      phase: "request_failed",
      httpStatus: 502,
      category: "server_error",
      errorType: error instanceof Error ? error.name : "unknown"
    });
    return NextResponse.json(
      { error: "Unable to disconnect integration.", category: "server_error" },
      { status: 502 }
    );
  }
}
