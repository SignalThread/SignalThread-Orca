import { NextResponse } from "next/server";
import { authorizeMobileIntegrationRequest } from "@/lib/integrations/mobile-oauth/authorization";
import { getGoogleWorkspaceConnectionStatus } from "@/lib/integrations/google/connection-status";
import { getValidGoogleAccessTokenForUser } from "@/lib/integrations/google/token-manager";
import {
  disconnectedMicrosoft365Status,
  getMicrosoft365ConnectionStatus
} from "@/lib/integrations/microsoft/connection-status";
import { getValidMicrosoftAccessTokenForUser } from "@/lib/integrations/microsoft/token-manager";
import {
  toMobileGoogleWorkspaceConnection,
  toMobileMicrosoft365Connection,
  toMobileEmailSenderStatus,
  toMobileCalendarProviderStatus
} from "@/lib/integrations/mobile-oauth/status-core";
import {
  listEligibleEmailSenders,
  resolveEmailProviderForUser
} from "@/lib/integrations/email/provider-preference";
import {
  listEligibleCalendars,
  resolveCalendarProviderForUser
} from "@/lib/integrations/calendar/provider-resolver";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeMobileIntegrationRequest(request);
    if (!authorization.ok) {
      return NextResponse.json(
        { error: authorization.error },
        { status: authorization.status }
      );
    }
    const session = authorization.context;
    // Validate/refresh before presenting status so expired or invalid stored
    // credentials cannot remain publicly reported as connected.
    await getValidGoogleAccessTokenForUser({
      userId: session.userId,
      companyId: session.companyId
    });
    const google = await getGoogleWorkspaceConnectionStatus(session.userId, session.companyId);
    // Each provider is resolved independently: one provider being misconfigured
    // or unavailable must never change what another provider reports.
    let microsoft = disconnectedMicrosoft365Status();
    try {
      await getValidMicrosoftAccessTokenForUser({
        userId: session.userId,
        companyId: session.companyId
      });
      microsoft = await getMicrosoft365ConnectionStatus(session.userId, session.companyId);
    } catch {
      microsoft = disconnectedMicrosoft365Status();
    }
    const senderContext = {
      userId: session.userId,
      companyId: session.companyId
    };
    const [emailResolution, eligibleSenders, calendarResolution, eligibleCalendars] = await Promise.all([
      resolveEmailProviderForUser(senderContext),
      listEligibleEmailSenders(senderContext),
      resolveCalendarProviderForUser(senderContext),
      listEligibleCalendars(senderContext)
    ]);
    return NextResponse.json(
      {
        connections: [
          toMobileGoogleWorkspaceConnection(google),
          toMobileMicrosoft365Connection(microsoft)
        ],
        emailSender: toMobileEmailSenderStatus(emailResolution, eligibleSenders),
        calendarProvider: toMobileCalendarProviderStatus(
          calendarResolution,
          eligibleCalendars
        )
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Unable to load integration status." },
      { status: 500 }
    );
  }
}
