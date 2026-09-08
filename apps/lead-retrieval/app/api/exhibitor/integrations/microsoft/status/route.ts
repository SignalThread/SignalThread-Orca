import { NextResponse } from "next/server";
import { authorizeIntegrationConnectionAdmin } from "@/lib/integrations/oauth/authorization";
import { getMicrosoft365ConnectionStatus } from "@/lib/integrations/microsoft/connection-status";
import { getValidMicrosoftAccessTokenForUser } from "@/lib/integrations/microsoft/token-manager";

export const runtime = "nodejs";

export async function GET() {
  const authorization = await authorizeIntegrationConnectionAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  try {
    // Validate/refresh before presenting status so expired or invalid stored
    // credentials cannot remain reported as connected.
    await getValidMicrosoftAccessTokenForUser({
      userId: authorization.context.userId,
      companyId: authorization.context.companyId
    });
    return NextResponse.json(
      await getMicrosoft365ConnectionStatus(
        authorization.context.userId,
        authorization.context.companyId
      )
    );
  } catch {
    return NextResponse.json({ error: "Unable to load Microsoft 365 status." }, { status: 500 });
  }
}
