import { NextResponse } from "next/server";
import { authorizeGoogleWorkspaceAdmin } from "@/lib/integrations/google/authorization";
import { disconnectGoogleWorkspaceConnection } from "@/lib/integrations/google/connection-service";

export const runtime = "nodejs";

export async function POST() {
  const authorization = await authorizeGoogleWorkspaceAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  try {
    const result = await disconnectGoogleWorkspaceConnection(authorization.context);
    return NextResponse.json({
      success: true,
      disconnected: result.disconnected,
      revocationConfirmed: result.revocationConfirmed,
      revocationPending: !result.revocationConfirmed
    });
  } catch (error) {
    console.error("[google/disconnect]", {
      code: "GOOGLE_DISCONNECT_FAILED",
      userId: authorization.context.userId,
      companyId: authorization.context.companyId,
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json(
      { error: "Unable to disconnect Google Workspace. Try again in a moment." },
      { status: 502 }
    );
  }
}

