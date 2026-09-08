import { NextResponse } from "next/server";
import { authorizeGoogleWorkspaceAdmin } from "@/lib/integrations/google/authorization";
import { getGoogleWorkspaceConnectionStatus } from "@/lib/integrations/google/connection-status";
import { getValidGoogleAccessTokenForUser } from "@/lib/integrations/google/token-manager";

export const runtime = "nodejs";

export async function GET() {
  const authorization = await authorizeGoogleWorkspaceAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  try {
    await getValidGoogleAccessTokenForUser({
      userId: authorization.context.userId,
      companyId: authorization.context.companyId
    });
    return NextResponse.json(
      await getGoogleWorkspaceConnectionStatus(
        authorization.context.userId,
        authorization.context.companyId
      )
    );
  } catch {
    return NextResponse.json({ error: "Unable to load Google Workspace status." }, { status: 500 });
  }
}
