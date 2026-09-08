import { NextResponse } from "next/server";
import { authorizeIntegrationConnectionAdmin } from "@/lib/integrations/oauth/authorization";
import { disconnectMicrosoft365Connection } from "@/lib/integrations/microsoft/connection-service";

export const runtime = "nodejs";

export async function POST() {
  const authorization = await authorizeIntegrationConnectionAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  try {
    const result = await disconnectMicrosoft365Connection(authorization.context);
    return NextResponse.json({
      success: true,
      disconnected: result.disconnected,
      revocationConfirmed: result.revocationConfirmed,
      revocationPending: result.revocationPending
    });
  } catch (error) {
    console.error("[microsoft/disconnect]", {
      code: "MICROSOFT_DISCONNECT_FAILED",
      userId: authorization.context.userId,
      companyId: authorization.context.companyId,
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json(
      { error: "Unable to disconnect Microsoft 365. Try again in a moment." },
      { status: 502 }
    );
  }
}
